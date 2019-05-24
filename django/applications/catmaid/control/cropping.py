# -*- coding: utf-8 -*-

import os
import json
import logging

from typing import Dict, List, Tuple

from django.conf import settings
from django.http import HttpResponse, HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required

from catmaid.models import (Stack, Project, ProjectStack, Message, User,
        StackMirror)
from catmaid.control.common import (id_generator, json_error_response,
        get_request_bool, get_request_list)
from catmaid.control.tile import get_tile_source
from catmaid.control.message import notify_user

from PIL import Image as PILImage, TiffImagePlugin

import requests
import os.path
import glob
from time import time
from math import cos, sin, radians

logger = logging.getLogger(__name__)

try:
    from pgmagick import Blob, Image, ImageList, Geometry, ChannelType, \
            CompositeOperator as co, ColorRGB
except ImportError:
    logger.warning("CATMAID was unable to load the pgmagick module. "
        "Cropping will not be available")

from celery.task import task

# Prefix for stored microstacks
file_prefix = settings.CROPPING_OUTPUT_FILE_PREFIX
# File extension of the stored microstacks
file_extension = settings.CROPPING_OUTPUT_FILE_EXTENSION
# The path were cropped files get stored in
crop_output_path = os.path.join(settings.MEDIA_ROOT,
    settings.MEDIA_CROPPING_SUBDIRECTORY)
# Whether SSL certificates should be verified
verify_ssl = getattr(settings, 'CROPPING_VERIFY_CERTIFICATES', True)

# Note: some functions cannot be fully type-annotated because of the
# conditional import of pgmagick.

class CropJob(object):
    """ A small container class to keep information about the cropping
    job to be done. Stack ids can be passed as single integer, a list of
    integers. If no output_path is given, a random one (based on the
    settings) is generated.
    """
    def __init__(self, user, project_id, stack_mirror_ids, x_min,
            x_max, y_min, y_max, z_min, z_max, rotation_cw, zoom_level,
            single_channel=False, output_path=None):
        self.user = user
        self.project_id = int(project_id)
        self.project = get_object_or_404(Project, pk=project_id)
        # Allow a single ID and a list
        if isinstance(stack_mirror_ids, int):
            self.stack_mirror_ids= [stack_mirror_ids]
        else:
            self.stack_mirror_ids = stack_mirror_ids
        self.stack_mirrors = [] # type: List
        self.stack_tile_sources = {} # type: Dict
        for sid in self.stack_mirror_ids:
            stack_mirror = get_object_or_404(StackMirror, pk=sid)
            self.stack_mirrors.append(stack_mirror)
            tile_source = get_tile_source(stack_mirror.tile_source_type)
            self.stack_tile_sources[stack_mirror.stack.id] = tile_source
        # The reference stack is used to obtain e.g. resolution information
        self.ref_stack = self.stack_mirrors[0].stack
        self.x_min = float(x_min)
        self.x_max = float(x_max)
        self.y_min = float(y_min)
        self.y_max = float(y_max)
        self.z_min = float(z_min)
        self.z_max = float(z_max)
        self.zoom_level = int(zoom_level)
        # Save a normalized version of the rotation angle
        self.rotation_cw = rotation_cw % 360
        # Create an output path if not already present
        if output_path is None:
            file_name = file_prefix + id_generator() + "." + file_extension
            output_path = os.path.join(crop_output_path, file_name)
        self.single_channel = single_channel
        self.output_path = output_path

    def get_tile_path(self, stack, mirror, tile_coords) -> str:
        """ This method will be used when get_tile_path is called after the
        job has been initialized.
        """
        tile_source = self.stack_tile_sources[stack.id]
        return tile_source.get_tile_url(mirror, tile_coords, self.zoom_level)


class ImageRetrievalError(IOError):
    def __init__(self, path, error):
        IOError.__init__(self, "Couldn't access %s" % (path))
        self.path = path
        self.error = error

class ImagePart:
    """ A part of a 2D image where height and width are not necessarily
    of the same size. Provides readout of the defined sub-area of the image.
    """
    def __init__( self, path, x_min_src, x_max_src, y_min_src, y_max_src, x_dst, y_dst ):
        self.path = path
        self.x_min_src = x_min_src
        self.x_max_src = x_max_src
        self.y_min_src = y_min_src
        self.y_max_src = y_max_src
        self.x_dst = x_dst
        self.y_dst = y_dst
        self.width = x_max_src - x_min_src
        self.height = y_max_src - y_min_src
        self.estimated_size = 0
        # Complain if the width or the height is zero
        if self.width == 0 or self.height == 0:
            raise ValueError( "An image part must have an area, hence no " \
                    "extent should be zero!" )

    def get_image(self):
        # Open the image
        try:
            r = requests.get(self.path, allow_redirects=True, verify=verify_ssl)
            if not r:
                raise ValueError("Could not get " + self.path)
            if r.status_code != 200:
                raise ValueError("Unexpected status code ({}) for {}".format(r.status_code, self.path))
            img_data = r.content
            bytes_read = len(img_data)
        except requests.exceptions.RequestException as e:
            raise ImageRetrievalError(self.path, str(e))

        blob = Blob( img_data )
        image = Image( blob )
        # Check if the whole image should be used and cropped if necessary.
        src_width = image.size().width()
        src_height = image.size().height()
        if self.width != src_width or self.height != src_height:
            box = Geometry( self.width, self.height, self.x_min_src, self.y_min_src )
            image.crop( box )

        # Estimates the size in Bytes of this image part by scaling the number
        # of Bytes read with the ratio between the needed part of the image and
        # its actual size.
        self.estimated_size = bytes_read * abs(float(self.width * self.height) /
                                               float(src_width * src_height))
        return image

def to_x_index(x, stack, zoom_level, enforce_bounds=True) -> int:
    """ Converts a real world position to a x pixel position.
    Also, makes sure the value is in bounds.
    """
    zero_zoom = x / stack.resolution.x
    if enforce_bounds:
        zero_zoom = min(max(zero_zoom, 0.0), stack.dimension.x - 1.0)
    return int(zero_zoom / (2**zoom_level) + 0.5)

def to_y_index(y, stack, zoom_level, enforce_bounds=True) -> int:
    """ Converts a real world position to a y pixel position.
    Also, makes sure the value is in bounds.
    """
    zero_zoom = y / stack.resolution.y
    if enforce_bounds:
        zero_zoom = min(max(zero_zoom, 0.0), stack.dimension.y - 1.0)
    return int( zero_zoom / (2**zoom_level) + 0.5 )

def to_z_index(z, stack, zoom_level, enforce_bounds=True) -> int:
    """ Converts a real world position to a slice/section number.
    Also, makes sure the value is in bounds.
    """
    section = z / stack.resolution.z + 0.5
    if enforce_bounds:
        section = min(max(section, 0.0), stack.dimension.z - 1.0)
    return int(section)

def addMetaData(path:str, job, result) -> None:
    """ Use this method to add meta data to the image. Due to a bug in
    exiv2, its python wrapper pyexiv2 is of no use to us. This bug
    (http://dev.exiv2.org/issues/762) hinders us to work on multi-page
    TIFF files. Instead, we use Pillow to write meta data.
    """
    # Add resolution information in pixel per nanometer. The stack info
    # available is nm/px and refers to a zoom-level of zero.
    res_x_scaled = job.ref_stack.resolution.x * 2**job.zoom_level
    res_y_scaled = job.ref_stack.resolution.y * 2**job.zoom_level
    res_x_nm_px = 1.0 / res_x_scaled
    res_y_nm_px = 1.0 / res_y_scaled
    res_z_nm_px = 1.0 / job.ref_stack.resolution.z
    ifd = dict() # type: Dict
    ifd = TiffImagePlugin.ImageFileDirectory_v2()
    ifd[TiffImagePlugin.X_RESOLUTION] = res_x_nm_px
    ifd[TiffImagePlugin.Y_RESOLUTION] = res_y_nm_px
    ifd[TiffImagePlugin.RESOLUTION_UNIT] = 1 # 1 = None

    # ImageJ specific meta data to allow easy embedding of units and
    # display options.
    n_images = len(result)
    ij_version= "1.51n"
    unit = "nm"

    n_channels = len(job.stack_mirrors)
    if n_images % n_channels != 0:
        raise ValueError( "Meta data creation: the number of images " \
                "modulo the channel count is not zero" )
    n_slices = n_images / n_channels

    # sample with (the actual is a line break instead of a .):
    # ImageJ=1.45p.images={0}.channels=1.slices=2.hyperstack=true.mode=color.unit=micron.finterval=1.spacing=1.5.loop=false.min=0.0.max=4095.0.
    ij_data = [
        "ImageJ={}".format(ij_version),
        "unit={}".format(unit),
        "spacing={}".format(str(res_z_nm_px)),
    ]

    if n_channels > 1:
        ij_data.append("images={}".format(str(n_images)))
        ij_data.append("slices={}".format(str(n_slices)))
        ij_data.append("channels={}".format(str(n_channels)))
        ij_data.append("hyperstack=true")
        ij_data.append("mode=composite")

    # We want to end with a final newline
    ij_data.append("")

    ifd[TiffImagePlugin.IMAGEDESCRIPTION] = "\n".join(ij_data)

    # Information about the software used
    ifd[TiffImagePlugin.SOFTWARE] = "CATMAID {}".format(settings.VERSION)

    image = PILImage.open(path)
    # Can't use libtiff for saving non core libtiff exif tags, therefore
    # compression="raw" is used. Also, we don't want to re-encode.
    tmp_path = path + ".tmp"
    image.save(tmp_path, "tiff", compression="raw", tiffinfo=ifd, save_all=True)
    os.remove(path)
    os.rename(tmp_path, path)

def extract_substack(job) -> List:
    """ Extracts a sub-stack as specified in the passed job while respecting
    rotation requests. A list of pgmagick images is returned -- one for each
    slice, starting on top.
    """
    # Treat rotation requests special
    if abs(job.rotation_cw) < 0.00001:
        # No rotation, create the sub-stack
        cropped_stack = extract_substack_no_rotation( job )
    elif abs(job.rotation_cw - 90.0) < 0.00001:
        # 90 degree rotation, create the sub-stack and do a simple rotation
        cropped_stack = extract_substack_no_rotation( job )
        for img in cropped_stack:
            img.rotate(270.0)
    elif abs(job.rotation_cw - 180.0) < 0.00001:
        # 180 degree rotation, create the sub-stack and do a simple rotation
        cropped_stack = extract_substack_no_rotation( job )
        for img in cropped_stack:
            img.rotate(180.0)
    elif abs(job.rotation_cw - 270.0) < 0.00001:
        # 270 degree rotation, create the sub-stack and do a simple rotation
        cropped_stack = extract_substack_no_rotation( job )
        for img in cropped_stack:
            img.rotate(90.0)
    else:
        # Some methods do counter-clockwise rotation
        rotation_ccw = 360.0 - job.rotation_cw
        # There is rotation requested. First, backup the cropping
        # coordinates and manipulate the job to create a cropped
        # stack of the bounding box of the rotated box.
        real_x_min = job.x_min
        real_x_max = job.x_max
        real_y_min = job.y_min
        real_y_max = job.y_max
        # Rotate bounding box counter-clockwise around center.
        center = [0.5 * (job.x_max + job.x_min),
            0.5 * (job.y_max + job.y_min)]
        rot_p1 = rotate2d(rotation_ccw,
            [real_x_min, real_y_min], center)
        rot_p2 = rotate2d(rotation_ccw,
            [real_x_min, real_y_max], center)
        rot_p3 = rotate2d(rotation_ccw,
            [real_x_max, real_y_max], center)
        rot_p4 = rotate2d(rotation_ccw,
            [real_x_max, real_y_min], center)
        # Find new (larger) bounding box of rotated ROI and write
        # them into the job
        job.x_min = min([rot_p1[0], rot_p2[0], rot_p3[0], rot_p4[0]])
        job.y_min = min([rot_p1[1], rot_p2[1], rot_p3[1], rot_p4[1]])
        job.x_max = max([rot_p1[0], rot_p2[0], rot_p3[0], rot_p4[0]])
        job.y_max = max([rot_p1[1], rot_p2[1], rot_p3[1], rot_p4[1]])
        # Create the enlarged sub-stack
        cropped_stack = extract_substack_no_rotation( job )

        # Next, rotate the whole result stack counterclockwise to have the
        # actual ROI axis aligned.
        for img in cropped_stack:
            img.rotate(rotation_ccw)

        # Last, do a second crop to remove the not needed parts. The region
        # to crop is defined by the relative original crop-box coordinates to
        # to the rotated bounding box.
        rot_bb_p1 = rotate2d(rotation_ccw,
            [job.x_min, job.y_min], center)
        rot_bb_p2 = rotate2d(rotation_ccw,
            [job.x_min, job.y_max], center)
        rot_bb_p3 = rotate2d(rotation_ccw,
            [job.x_max, job.y_max], center)
        rot_bb_p4 = rotate2d(rotation_ccw,
            [job.x_max, job.y_min], center)
        # Get bounding box minimum coordinates in world space
        bb_x_min = min([rot_bb_p1[0], rot_bb_p2[0], rot_bb_p3[0], rot_bb_p4[0]])
        bb_y_min = min([rot_bb_p1[1], rot_bb_p2[1], rot_bb_p3[1], rot_bb_p4[1]])
        # Create relative final crop coordinates
        crop_p1 = [abs(real_x_min - bb_x_min), abs(real_y_min - bb_y_min)]
        crop_p2 = [abs(real_x_min - bb_x_min), abs(real_y_max - bb_y_min)]
        crop_p3 = [abs(real_x_max - bb_x_min), abs(real_y_min - bb_y_min)]
        crop_p4 = [abs(real_x_max - bb_x_min), abs(real_y_max - bb_y_min)]
        crop_x_min = min([crop_p1[0], crop_p2[0], crop_p3[0], crop_p4[0]])
        crop_y_min = min([crop_p1[1], crop_p2[1], crop_p3[1], crop_p4[1]])
        crop_x_max = max([crop_p1[0], crop_p2[0], crop_p3[0], crop_p4[0]])
        crop_y_max = max([crop_p1[1], crop_p2[1], crop_p3[1], crop_p4[1]])
        crop_x_min_px = to_x_index(crop_x_min, job.ref_stack, job.zoom_level, False)
        crop_y_min_px = to_y_index(crop_y_min, job.ref_stack, job.zoom_level, False)
        crop_x_max_px = to_x_index(crop_x_max, job.ref_stack, job.zoom_level, False)
        crop_y_max_px = to_y_index(crop_y_max, job.ref_stack, job.zoom_level, False)
        crop_width_px = crop_x_max_px - crop_x_min_px
        crop_height_px = crop_y_max_px - crop_y_min_px
        # Crop all images (Geometry: width, height, xOffset, yOffset)
        crop_geometry = Geometry(crop_width_px, crop_height_px,
            crop_x_min_px, crop_y_min_px)
        for img in cropped_stack:
            img.crop(crop_geometry)

        # Reset the original job parameters
        job.x_min = real_x_min
        job.x_max = real_x_max
        job.y_min = real_y_min
        job.y_max = real_y_max

    return cropped_stack


class BB:
    """A simple bounding box for cropping purposes.
    """
    px_x_min = 0
    px_x_max = 0
    px_y_min = 0
    px_y_max = 0
    px_z_min = 0
    px_z_max = 0
    px_x_offset = 0
    px_y_offset = 0
    width = 0
    height = 0


def extract_substack_no_rotation(job) -> List:
    """ Extracts a sub-stack as specified in the passed job without respecting
    rotation requests. A list of pgmagick images is returned -- one for each
    slice, starting on top.
    """

    # The actual bounding boxes used for creating the images of each stack
    # depend not only on the request, but also on the translation of the stack
    # wrt. the project. Therefore, a dictionary with bounding box information for
    # each stack is created.
    s_to_bb = {}
    for stack_mirror in job.stack_mirrors:
        stack = stack_mirror.stack
        # Retrieve translation relative to current project
        translation = ProjectStack.objects.get(
                project_id=job.project_id, stack_id=stack.id).translation
        x_min_t = job.x_min - translation.x
        x_max_t = job.x_max - translation.x
        y_min_t = job.y_min - translation.y
        y_max_t = job.y_max - translation.y
        z_min_t = job.z_min - translation.z
        z_max_t = job.z_max - translation.z
        # Calculate the slice numbers and pixel positions
        # bound to the stack data.
        px_x_min = to_x_index(x_min_t, stack, job.zoom_level)
        px_x_max = to_x_index(x_max_t, stack, job.zoom_level)
        px_y_min = to_y_index(y_min_t, stack, job.zoom_level)
        px_y_max = to_y_index(y_max_t, stack, job.zoom_level)
        px_z_min = to_z_index(z_min_t, stack, job.zoom_level)
        px_z_max = to_z_index(z_max_t, stack, job.zoom_level)
        # Because it might be that the cropping goes over the
        # stack bounds, we need to calculate the unbounded height,
        # with and an offset.
        px_x_min_nobound = to_x_index(x_min_t, stack, job.zoom_level, False)
        px_x_max_nobound = to_x_index(x_max_t, stack, job.zoom_level, False)
        px_y_min_nobound = to_y_index(y_min_t, stack, job.zoom_level, False)
        px_y_max_nobound = to_y_index(y_max_t, stack, job.zoom_level, False)
        width = px_x_max_nobound - px_x_min_nobound
        height = px_y_max_nobound - px_y_min_nobound
        px_x_offset = abs(px_x_min_nobound) if px_x_min_nobound < 0 else 0
        px_y_offset = abs(px_y_min_nobound) if px_y_min_nobound < 0 else 0
        # Create a dictionary entry with a simple object
        bb = BB()
        bb.px_x_min = px_x_min
        bb.px_x_max = px_x_max
        bb.px_y_min = px_y_min
        bb.px_y_max = px_y_max
        bb.px_z_min = px_z_min
        bb.px_z_max = px_z_max
        bb.px_x_offset = px_x_offset
        bb.px_y_offset = px_y_offset
        bb.width = width
        bb.height = height
        s_to_bb[stack.id] = bb

    # Get number of wanted slices
    px_z_min = to_z_index(job.z_min, job.ref_stack, job.zoom_level)
    px_z_max = to_z_index(job.z_max, job.ref_stack, job.zoom_level)
    n_slices = px_z_max + 1 - px_z_min

    # The images are generated per slice, so most of the following
    # calculations refer to 2d images.

    # Each stack to export is treated as a separate channel. The order
    # of the exported dimensions is XYCZ. This means all the channels of
    # one slice are exported, then the next slice follows, etc.
    cropped_stack = []
    # Accumulator for estimated result size
    estimated_total_size = 0
    # Iterate over all slices
    for nz in range(n_slices):
        for mirror in job.stack_mirrors:
            stack = mirror.stack
            bb = s_to_bb[stack.id]
            # Shortcut for tile width and height
            tile_width = mirror.tile_width
            tile_height = mirror.tile_height
            # Get indices for bounding tiles (0 indexed)
            tile_x_min = int(bb.px_x_min / tile_width)
            tile_x_max = int(bb.px_x_max / tile_width)
            tile_y_min = int(bb.px_y_min / tile_height)
            tile_y_max = int(bb.px_y_max / tile_height)
            # Get the number of needed tiles for each direction
            num_x_tiles = tile_x_max - tile_x_min + 1
            num_y_tiles = tile_y_max - tile_y_min + 1
            # Associate image parts with all tiles
            image_parts = []
            x_dst = bb.px_x_offset
            for nx, x in enumerate( range(tile_x_min, tile_x_max + 1) ):
                # The min x,y for the image part in the current tile are 0
                # for all tiles except the first one.
                cur_px_x_min = 0 if nx > 0 else bb.px_x_min - x * tile_width
                # The max x,y for the image part of current tile are the tile
                # size minus one except for the last one.
                if nx < (num_x_tiles - 1):
                    cur_px_x_max = tile_width - 1
                else:
                    cur_px_x_max = bb.px_x_max - x * tile_width
                # Reset y destination component
                y_dst = bb.px_y_offset
                for ny, y in enumerate( range(tile_y_min, tile_y_max + 1) ):
                    cur_px_y_min = 0 if ny > 0 else bb.px_y_min - y * tile_height
                    if ny < (num_y_tiles - 1):
                        cur_px_y_max = tile_height - 1
                    else:
                        cur_px_y_max = bb.px_y_max - y * tile_height
                    # Create an image part definition
                    z = bb.px_z_min + nz
                    path = job.get_tile_path(stack, mirror, (x, y, z))
                    try:
                        part = ImagePart(path, cur_px_x_min, cur_px_x_max,
                                cur_px_y_min, cur_px_y_max, x_dst, y_dst)
                        image_parts.append( part )
                    except:
                        # ignore failed slices
                        pass
                    # Update y component of destination position
                    y_dst += cur_px_y_max - cur_px_y_min
                # Update x component of destination position
                x_dst += cur_px_x_max - cur_px_x_min

            # Write out the image parts and make sure the maximum allowed file
            # size isn't exceeded.
            cropped_slice = Image(Geometry(bb.width, bb.height), ColorRGB(0, 0, 0))
            for ip in image_parts:
                # Get (correctly cropped) image
                image = ip.get_image()

                # Estimate total file size and abort if this exceeds the
                # maximum allowed file size.
                estimated_total_size = estimated_total_size + ip.estimated_size
                if estimated_total_size > settings.GENERATED_FILES_MAXIMUM_SIZE:
                    raise ValueError("The estimated size of the requested image "
                                     "region is larger than the maximum allowed "
                                     "file size: %0.2f > %s Bytes" % \
                                     (estimated_total_size,
                                      settings.GENERATED_FILES_MAXIMUM_SIZE))
                # Draw the image onto result image
                cropped_slice.composite( image, ip.x_dst, ip.y_dst, co.OverCompositeOp )
                # Delete tile image - it's not needed anymore
                del image

            if cropped_slice:
                # Optionally, use only a single channel
                if job.single_channel:
                    cropped_slice.channel( ChannelType.RedChannel )
                # Add the image to the cropped stack
                cropped_stack.append( cropped_slice )

    return cropped_stack

def rotate2d(degrees, point, origin) -> Tuple[float, float]:
    """ A rotation function that rotates a point counter-clockwise around
    a point. To rotate around the origin use [0,0].
    From: http://ubuntuforums.org/archive/index.php/t-975315.html
    """
    x = point[0] - origin[0]
    yorz = point[1] - origin[1]
    newx = (x*cos(radians(degrees))) - (yorz*sin(radians(degrees)))
    newyorz = (x*sin(radians(degrees))) + (yorz*cos(radians(degrees)))
    newx += origin[0]
    newyorz += origin[1]

    return newx, newyorz

@task()
def process_crop_job(job, create_message=True) -> str:
    """ This method does the actual cropping. It controls the data extraction
    and the creation of the sub-stack. It can be executed as Celery task.
    """
    try:
        # Create the sub-stack
        cropped_stack = extract_substack(job)

        # Create tho output image
        outputImage = ImageList()
        for img in cropped_stack:
            outputImage.append( img )

        # Save the resulting micro_stack to a temporary location
        no_error_occured = True
        error_message = ""
        # Only produce an image if parts of stacks are within the output
        if len( cropped_stack ) > 0:
            outputImage.writeImages( job.output_path.encode('ascii', 'ignore') )
            # Add some meta data to the image
            addMetaData( job.output_path, job, cropped_stack )
        else:
            no_error_occured = False
            error_message = "A region outside the stack has been selected. " \
                    "Therefore, no image was produced."
    except (IOError, OSError, ValueError) as e:
        no_error_occured = False
        error_message = str(e)
        # Delete the file if parts of it have been written already
        if os.path.exists( job.output_path ):
            os.remove( job.output_path )

    if create_message:
        # Create a notification message
        bb_text = "( %s, %s, %s ) -> ( %s, %s, %s )" % (job.x_min, job.y_min, \
                job.z_min, job.x_max, job.y_max, job.z_max)

        user = User.objects.get(pk=int(job.user.id))
        msg = Message()
        msg.user = user
        msg.read = False
        if no_error_occured:
            file_name = os.path.basename( job.output_path )
            url = os.path.join( settings.CATMAID_URL, "crop/download/" + file_name + "/")
            msg.title = "Microstack finished"
            msg.text = "The requested microstack %s is finished. You can " \
                    "download it from this location: <a href='%s'>%s</a>" % \
                    (bb_text, url, url)
            msg.action = url
        else:
            msg.title = "Microstack could not be created"
            msg.text = "The requested microstack %s could not be created due " \
                    "to an error while saving the result (%s)." % \
                    (bb_text, error_message)
            msg.action = ""
        msg.save()

        notify_user(user.id, msg.id, msg.title)

    return job.output_path if no_error_occured else error_message

def start_asynch_process(job) -> JsonResponse:
    """ It launches the data extraction and sub-stack building as a seperate process.
    This process uses the addmessage command with manage.py to write a message for the
    user into the data base once the process is done.
    """
    result = process_crop_job.delay(job)

    # Create closing response
    closingResponse = JsonResponse("", safe=False)

    return closingResponse

def sanity_check(job) -> List[str]:
    """ Tests the job parameters for obvious problems.
    """
    errors = []
    # Make sure the output path can be written to
    output_dir = os.path.dirname( job.output_path )
    if not os.path.exists( output_dir ) or not os.access( output_dir, os.W_OK ):
        errors.append( "the output folder is not accessible" )
    # Test the cropping parameters
    if job.x_min > job.x_max:
        errors.append( "x_min must no be larger than x_max" )
    if job.y_min > job.y_max:
        errors.append( "y_min must no be larger than y_max" )
    if job.z_min > job.z_max:
        errors.append( "z_min must no be larger than z_max" )
    # If the number of zoom levels is defined explicitly,
    # check if the requested level is not larger than that.
    allowed_zoom_level = job.ref_stack.num_zoom_levels
    if allowed_zoom_level >= 0 and job.zoom_level > allowed_zoom_level:
        errors.append( "zoom_level must not be larger than what stacks " \
                "allows (%s)" % str(allowed_zoom_level))
    if job.zoom_level < 0:
        errors.append( "zoom_level must not be smaller than 0" )
    return errors

@login_required
def crop(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Crops out the specified region of the stack. The region is expected to
    be given in terms of real world units (e.g. nm).
    """
    stack_ids = get_request_list(request.POST, "stack_ids", [], int)
    x_min = float(request.POST['min_x'])
    y_min = float(request.POST['min_y'])
    z_min = float(request.POST['min_z'])
    x_max = float(request.POST['max_x'])
    y_max = float(request.POST['max_y'])
    z_max = float(request.POST['max_z'])
    zoom_level = float(request.POST['zoom_level'])
    single_channel = get_request_bool(request.POST, 'single_channel', False)
    rotation_cw = float(request.GET.get('rotationcw', 0.0))

    # Make sure tmp dir exists and is writable
    if not os.path.exists( crop_output_path ) or not os.access( crop_output_path, os.W_OK ):
        if request.user.is_superuser:
            err_message = "Please make sure your output folder (%s) exists " \
                    "is writable." % crop_output_path
        else:
            err_message = "Sorry, the output path for the cropping tool " \
                    "isn't set up correctly. Please contact an administrator."
        return json_error_response(err_message)

    # Use first reachable stack mirrors
    stack_mirror_ids = []
    for sid in stack_ids:
        stack_mirrors = StackMirror.objects.select_related('stack').filter(stack_id=sid);
        for sm in stack_mirrors:
            # If mirror is reachable use it right away
            tile_source = get_tile_source(sm.tile_source_type)
            try:
                req = requests.head(tile_source.get_canary_url(sm),
                        allow_redirects=True, verify=verify_ssl)
                reachable = req.status_code == 200
            except Exception as e:
                logger.error(e)
                reachable = False
            if reachable:
                stack_mirror_ids.append(sm.id)
                break
        if not reachable:
            raise ValueError("Can't find reachable stack mirror for stack {}".format(sid))

    # Crate a new cropping job
    job = CropJob(request.user, project_id, stack_mirror_ids, x_min, x_max,
            y_min, y_max, z_min, z_max, rotation_cw, zoom_level, single_channel)

    # Parameter check
    errors = sanity_check( job )
    if len(errors) > 0:
        err_message = "Some problems with the cropping parameters were found: "
        for n, errtxt in enumerate( errors ):
            if n == 0:
                err_message += str( n+1 ) + ". " + errtxt
            else:
                err_message += ", " + str( n+1 ) + ". " + errtxt
        err_response = json_error_response( err_message )
        return err_response

    result = start_asynch_process(job)
    return result

def cleanup(max_age:int=1209600) -> None:
    """ Cleans up the temporarily space of the cropped stacks.
    Such a stack is deleted if it is older than max_age, which
    is specified in seconds and defaults to two weeks (1209600).
    """
    search_pattern = os.path.join(crop_output_path, file_prefix + "*." + file_extension)
    now = time()
    files_to_remove = []
    for item in glob.glob( search_pattern ):
        file_ctime = os.path.getctime( item )
        if (now - file_ctime) > max_age:
            files_to_remove.append(item)
    for item in files_to_remove:
            os.remove(item)

@login_required
def download_crop(request:HttpRequest, file_path=None) -> HttpResponse:
    """ Retrieves a previously cropped micro_stack from its temporary location
    and deletes the files afterwards.
    """
    # Optionally delete old files
    if settings.CROP_AUTO_CLEANUP:
        cleanup()

    # Check if the requested file exists
    path = os.path.join(crop_output_path, file_path)
    if not os.path.exists(path):
        # Create error response
        err_response = HttpResponse("Sorry, the requested file (%s) was not " \
                "found." % file_path)
        return err_response

    # Return the actual file content
    fsock = open(path,"rb")
    response = HttpResponse(fsock)
    response['Content-Type'] = 'image/' + file_extension
    response['Content-Disposition'] = 'attachment; filename="' + file_path + '"'

    return response

