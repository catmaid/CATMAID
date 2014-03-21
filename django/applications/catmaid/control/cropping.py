import json

from django.db import models
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *

import numpy as np
import urllib2 as urllib
import os.path
import glob
from time import time
from math import cos, sin, radians

# The libuuid import is a workaround for a bug with GraphicsMagick
# which expects the library to be loaded already. Therefore, it
# has to be loaded before pgmagick.
import libuuid
from pgmagick import Blob, Image, ImageList, Geometry, Color
from pgmagick import CompositeOperator as co, ResolutionType, ChannelType

from celery.task import task

# Prefix for stored microstacks
file_prefix = "crop_"
# File extension of the stored microstacks
file_extension = "tiff"
# The path were cropped files get stored in
crop_output_path = os.path.join(settings.MEDIA_ROOT,
    settings.MEDIA_CROPPING_SUBDIRECTORY)

class CropJob:
    """ A small container class to keep information about the cropping
    job to be done. Stack ids can be passed as single integer, a list of
    integers. If no output_path is given, a random one (based on the
    settings) is generated.
    """
    def __init__(self, user, project_id, stack_ids, x_min, x_max, y_min, y_max,
                 z_min, z_max, rotation_cw, zoom_level, single_channel=False,
                 output_path=None):
        self.user = user
        self.project_id = int(project_id)
        self.project = get_object_or_404(Project, pk=project_id)
        # Allow a single ID and a list
        if isinstance(stack_ids, int):
            self.stack_ids = [stack_ids]
        else:
            self.stack_ids = stack_ids
        self.stacks = []
        for sid in self.stack_ids:
            self.stacks.append( get_object_or_404(Stack, pk=sid) )
        # The reference stack is used to obtain e.g. resolution information
        self.ref_stack = self.stacks[0]
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
        # State that extra initialization is needed
        self.needs_initialization = True

    def initialize(self):
        """ This separate initialization method sets up methods to get the path
        to the tiles of the stacks used. It needs to be called from the
        process that actually does the cropping (e.g. a celery task), because
        serializing function pointers isn't allowed. This would be needed if
        this was done in the constructor of the job.
        """
        # Setup tile source specific path creation functions for each stack
        self.stack_specific_path_getters = {}
        for s in self.stacks:
            if s.tile_source_type == 1:
                getter = self.get_tile_path_1
            elif s.tile_source_type == 4:
                getter = self.get_tile_path_4
            elif s.tile_source_type == 5:
                getter = self.get_tile_path_5
            else:
                getter = self.get_tile_path_unavailable
            self.stack_specific_path_getters[s.id] = getter
        # Attach actual path getter
        self.get_tile_path = self.get_tile_path_initialized
        # Initialization is done
        self.needs_initialization = False

    def get_tile_path(self, stack, tile_coords):
        """ This method returns the path of a tile from a specific stack on a
        particular coordinate. It needs initialization where it will be replaced
        by the actual getter that is aware of the available tile source types.
        """
        raise StandardError("The crop job in used hasn't been initialized.")

    def get_tile_path_initialized(self, stack, tile_coords):
        """ This method will be used when get_tile_path is called after the crop
        job has been initialized.
        """
        return self.stack_specific_path_getters[stack.id](stack, tile_coords)

    def get_tile_path_1(self, stack, tile_coords):
        """ Creates the full path to the tile at the specified coordinate index
        for tile source type 1.
        """
        path = stack.image_base
        n_coords = len(tile_coords)
        for c in range( 2, n_coords ):
            # the path is build beginning with the last component
            coord = tile_coords[n_coords - c + 1]
            path += str(coord) + "/"
        path += "%s_%s_%s.%s" % (tile_coords[1], tile_coords[0],
                self.zoom_level, stack.file_extension)
        return path

    def get_tile_path_4(self, stack, tile_coords):
        """ Creates the full path to the tile at the specified coordinate index
        for tile source type 4.
        """
        path = stack.image_base
        n_coords = len(tile_coords)
        for c in range( 2, n_coords ):
            # the path is build beginning with the last component
            coord = tile_coords[n_coords - c + 1]
            path += str(coord) + "/"
        path += "%s/%s_%s.%s" % (self.zoom_level, tile_coords[1],
                tile_coords[0], stack.file_extension)
        return path

    def get_tile_path_5(self, stack, tile_coords):
        """ Creates the full path to the tile at the specified coordinate index
        for tile source type 5.
        """
        path = "%s%s/" % (stack.image_base, self.zoom_level)
        n_coords = len(tile_coords)
        for c in range( 2, n_coords ):
            # the path is build beginning with the last component
            coord = tile_coords[n_coords - c + 1]
            path += str(coord) + "/"
        path += "%s/%s.%s" % (tile_coords[1], tile_coords[0],
            stack.file_extension)
        return path

    def get_tile_path_unavailable(self, stack, tile_coords):
        raise StandardError("Tile source %s is currently not supported " \
                "by cropping module" % stack.tile_source_type)

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
        # Complain if the width or the height is zero
        if self.width == 0 or self.height == 0:
            raise ValueError( "An image part must have an area, hence no " \
                    "extent should be zero!" )

    def get_image( self ):
        # Open the image
        try:
            img_file = urllib.urlopen( self.path )
        except urllib.HTTPError as e:
            raise ImageRetrievalError(self.path, "Error code: %s" % e.code)
        except urllib.URLError as e:
            raise ImageRetrievalError(self.path, e.reason)

        blob = Blob( img_file.read() )
        image = Image( blob )
        # Check if the whole image should be used and cropped if necessary.
        src_width = image.size().width()
        src_height = image.size().height()
        if self.width != src_width or self.height != src_height:
            box = Geometry( self.width, self.height, self.x_min_src, self.y_min_src )
            image.crop( box )
        return image

def to_x_index( x, job, enforce_bounds=True ):
    """ Converts a real world position to a x pixel position.
    Also, makes sure the value is in bounds.
    """
    zero_zoom = x / job.ref_stack.resolution.x
    if enforce_bounds:
        zero_zoom = min(max(zero_zoom, 0.0), job.ref_stack.dimension.x - 1.0)
    return int( zero_zoom / (2**job.zoom_level) + 0.5 )

def to_y_index( y, job, enforce_bounds=True ):
    """ Converts a real world position to a y pixel position.
    Also, makes sure the value is in bounds.
    """
    zero_zoom = y / job.ref_stack.resolution.y
    if enforce_bounds:
        zero_zoom = min(max(zero_zoom, 0.0), job.ref_stack.dimension.y - 1.0)
    return int( zero_zoom / (2**job.zoom_level) + 0.5 )

def to_z_index( z, job, enforce_bounds=True ):
    """ Converts a real world position to a slice/section number.
    Also, makes sure the value is in bounds.
    """
    section = z / job.ref_stack.resolution.z + 0.5
    if enforce_bounds:
        section = min(max(section, 0.0), job.ref_stack.dimension.z - 1.0)
    return int( section )

def addMetaData( path, job, result ):
    """ Use this method to add meta data to the image. Due to a bug in
    exiv2, its python wrapper pyexiv2 is of no use to us. This bug
    (http://dev.exiv2.org/issues/762) hinders us to work on multi-page
    TIFF files. Instead, we use a separate tool called exiftool to write
    meta data. Currently, there seems no better solution than this. If the
    tool is not found, no meta data is produced and no error is raised.
    """
    # Add resolution information in pixel per nanometer. The stack info
    # available is nm/px and refers to a zoom-level of zero.
    res_x_scaled = job.ref_stack.resolution.x * 2**job.zoom_level
    res_y_scaled = job.ref_stack.resolution.y * 2**job.zoom_level
    res_x_nm_px = 1.0 / res_x_scaled
    res_y_nm_px = 1.0 / res_y_scaled
    res_args = "-EXIF:XResolution={0} -EXIF:YResolution={1} -EXIF:" \
            "ResolutionUnit=None".format( str(res_x_nm_px), str(res_y_nm_px) )

    # ImageJ specific meta data to allow easy embedding of units and
    # display options.
    n_images = len( result )
    ij_version= "1.45p"
    unit = "nm"
    newline = "\n"

    # sample with (the actual is a line break instead of a .):
    # ImageJ=1.45p.images={0}.channels=1.slices=2.hyperstack=true.mode=color.unit=micron.finterval=1.spacing=1.5.loop=false.min=0.0.max=4095.0.
    ij_data = "ImageJ={1}{0}unit={2}{0}".format( newline, ij_version, unit)
    if n_images > 1:
        n_channels = len(job.stacks)
        if n_images % n_channels != 0:
            raise ValueError( "Meta data creation: the number of images " \
                    "modulo the channel count is not zero" )
        n_slices = n_images / n_channels
        ij_data += "images={1}{0}channels={2}{0}slices={3}{0}hyperstack=true{0}mode=color{0}".format( newline, str(n_images), str(n_channels), str(n_slices) )
    ij_args = "-EXIF:ImageDescription=\"{0}\"".format( ij_data )

    # Information about the software used
    sw_args = "-EXIF:Software=\"Created with CATMAID and GraphicsMagic, " \
            "processed with exiftool.\""
    # Build up the final tag changing arguments for each slice
    tag_args = "{0} {1} {2}".format( res_args, ij_args, sw_args )
    per_slice_tag_args = []
    for i in range(0, n_images):
        # the string EXIF gets replaced for every image with IFD<N>
        slice_args = tag_args.replace( "EXIF", "IFD" + str(i) )
        per_slice_tag_args.append( slice_args  )
    final_tag_args = " ".join( per_slice_tag_args )
    # Create the final call and execute
    call = "exiftool -overwrite_original {0} {1}".format( final_tag_args, path )
    os.system( call )

    # Re-save the image with GraphicsMagick, otherwise ImageJ won't read the
    # images directly.
    images = ImageList()
    images.readImages( path )
    images.writeImages( path )

def extract_substack( job ):
    """ Extracts a sub-stack as specified in the passed job while respecting
    rotation requests. A list of pgmagick images is returned -- one for each
    slice, starting on top.
    """

    # Make sure tile source getters have been initialized on the job
    if job.needs_initialization:
        job.initialize()

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
        crop_x_min_px = to_x_index(crop_x_min, job, False)
        crop_y_min_px = to_y_index(crop_y_min, job, False)
        crop_x_max_px = to_x_index(crop_x_max, job, False)
        crop_y_max_px = to_y_index(crop_y_max, job, False)
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

def extract_substack_no_rotation( job ):
    """ Extracts a sub-stack as specified in the passed job without respecting
    rotation requests. A list of pgmagick images is returned -- one for each
    slice, starting on top.
    """

    # The actual bounding boxes used for creating the images of each stack
    # depend not only on the request, but also on the translation of the stack
    # wrt. the project. Therefore, a dictionary with bounding box information for
    # each stack is created.
    s_to_bb = {}
    for stack in job.stacks:
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
        px_x_min = to_x_index(x_min_t, job)
        px_x_max = to_x_index(x_max_t, job)
        px_y_min = to_y_index(y_min_t, job)
        px_y_max = to_y_index(y_max_t, job)
        px_z_min = to_z_index(z_min_t, job)
        px_z_max = to_z_index(z_max_t, job)
        # Because it might be that the cropping goes over the
        # stack bounds, we need to calculate the unbounded height,
        # with and an offset.
        px_x_min_nobound = to_x_index(x_min_t, job, False)
        px_x_max_nobound = to_x_index(x_max_t, job, False)
        px_y_min_nobound = to_y_index(y_min_t, job, False)
        px_y_max_nobound = to_y_index(y_max_t, job, False)
        width = px_x_max_nobound - px_x_min_nobound
        height = px_y_max_nobound - px_y_min_nobound
        px_x_offset = abs(px_x_min_nobound) if px_x_min_nobound < 0 else 0
        px_y_offset = abs(px_y_min_nobound) if px_y_min_nobound < 0 else 0
        # Create a dictionary entry with a simple object
        class BB: pass
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
    px_z_min = to_z_index(job.z_min, job)
    px_z_max = to_z_index(job.z_max, job)
    n_slices = px_z_max + 1 - px_z_min

    # The images are generated per slice, so most of the following
    # calculations refer to 2d images.

    # Each stack to export is treated as a separate channel. The order
    # of the exported dimensions is XYCZ. This means all the channels of
    # one slice are exported, then the next slice follows, etc.
    cropped_stack = []
    # Iterate over all slices
    for nz in range(n_slices):
        for stack in job.stacks:
            bb = s_to_bb[stack.id]
            # Shortcut for tile width and height
            tile_width = stack.tile_width
            tile_height = stack.tile_height
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
                    path = job.get_tile_path(stack, (x, y, z))
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

            # write out the image parts
            cropped_slice = None
            for ip in image_parts:
                # Get (correctly cropped) image
                image = ip.get_image()
                # It is unfortunately not possible to create proper composite
                # images based on a canvas image newly created like this:
                # cropped_slice = Image( Geometry(bb.width, bb.height), Color("black"))
                # Therefore, this workaround is used.
                if not cropped_slice:
                    cropped_slice = Image(image)
                    cropped_slice.backgroundColor("black")
                    cropped_slice.erase()
                    # The '!' makes sure the aspect ration is ignored
                    cropped_slice.scale('%sx%s!' % (bb.width, bb.height))
                # Draw the image onto result image
                cropped_slice.composite( image, ip.x_dst, ip.y_dst, co.OverCompositeOp )
                # Delete tile image - it's not needed anymore
                del image
            # Optionally, use only a single channel
            if job.single_channel:
                cropped_slice.channel( ChannelType.RedChannel )
            # Add the image to the cropped stack
            cropped_stack.append( cropped_slice )

    return cropped_stack

def rotate2d(degrees, point, origin):
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

    return newx,newyorz

@task()
def process_crop_job(job, create_message=True):
    """ This method does the actual cropping. It controls the data extraction
    and the creation of the sub-stack. It can be executed as Celery task.
    """
    try:
        # Create the sub-stack
        cropped_stack = extract_substack( job )

        # Create tho output image
        outputImage = ImageList()
        for img in cropped_stack:
            outputImage.append( img )

        # Save the resulting micro_stack to a temporary location
        no_error_occured = True
        error_message = ""
        # Only produce an image if parts of stacks are within the output
        if len( cropped_stack ) > 0:
            outputImage.writeImages( job.output_path )
            # Add some meta data to the image
            addMetaData( job.output_path, job, cropped_stack )
        else:
            no_error_occured = False
            error_message = "A region outside the stack has been selected. " \
                    "Therefore, no image was produced."
    except (IOError, OSError), e:
        no_error_occured = False
        error_message = str(e)
        # Delete the file if parts of it have been written already
        if os.path.exists( job.output_path ):
            os.remove( job.output_path )

    if create_message:
        # Create a notification message
        bb_text = "( %s, %s, %s ) -> ( %s, %s, %s )" % (job.x_min, job.y_min, \
                job.z_min, job.x_max, job.y_max, job.z_max)

        msg = Message()
        msg.user = User.objects.get(pk=int(job.user.id))
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

    return None if no_error_occured else e

def start_asynch_process( job ):
    """ It launches the data extraction and sub-stack building as a seperate process.
    This process uses the addmessage command with manage.py to write a message for the
    user into the data base once the process is done.
    """
    result = process_crop_job.delay( job )

    # Create closing response
    closingResponse = HttpResponse(json.dumps(""), mimetype="text/json")

    return closingResponse

def sanity_check( job ):
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
def crop(request, project_id=None, stack_ids=None, x_min=None, x_max=None,
        y_min=None, y_max=None, z_min=None, z_max=None, zoom_level=None,
        single_channel=None):
    """ Crops out the specified region of the stack. The region is expected to
    be given in terms of real world units (e.g. nm).
    """
    # Make sure tmp dir exists and is writable
    if not os.path.exists( crop_output_path ) or not os.access( crop_output_path, os.W_OK ):
        if request.user.is_superuser:
            err_message = "Please make sure your output folder (%s) exists " \
                    "is writable." % crop_output_path
        else:
            err_message = "Sorry, the output path for the cropping tool " \
                    "isn't set up correctly. Please contact an administrator."
        return json_error_response(err_message)

    # Make a list out of the stack ids
    string_list = stack_ids.split(",")
    stack_ids = [int( x ) for x in string_list]

    # Get basic cropping parameters
    rotation_cw = float(request.GET.get('rotationcw', 0.0))

    # Should an output slice contain all channels of the source tiles
    # or only a single (the red) one?
    single_channel = bool(int(single_channel))

    # Crate a new cropping job
    job = CropJob(request.user, project_id, stack_ids, x_min, x_max,
        y_min, y_max, z_min, z_max, rotation_cw, zoom_level, single_channel)

    # Parameter check
    errors = sanity_check( job )
    if len(errors) > 0:
        err_message = "Some problems with the cropping parameters were found: "
        for n, e in enumerate( errors ):
            if n == 0:
                err_message += str( n+1 ) + ". " + e
            else:
                err_message += ", " + str( n+1 ) + ". " + e
        err_response = json_error_response( err_message )
        return err_response
        
    result = start_asynch_process( job )
    return result

def cleanup( max_age=1209600 ):
    """ Cleans up the temporarily space of the cropped stacks.
    Such a stack is deleted if it is older than max_age, which
    is specified in seconds and  defaults to two weeks (1209600). 
    """ 
    search_pattern = os.path.join(crop_output_path, file_prefix + "*." + file_extension)
    now = time()
    files_to_remove = []
    for item in glob.glob( search_pattern ):
        file_ctime = os.path.getctime( item )
        if (now - file_ctime) > max_age:
            files_to_remove.append( item )
    for item in files_to_remove:
            os.remove( item )

@login_required
def download_crop(request, file_path=None):
    """ Retrieves a previously cropped micro_stack from its temporary location
    and deletes the files afterwards.
    """
    # Optionally delete old files
    try:
        if CROP_AUTO_CLEANUP:
            cleanup()
    except NameError:
        cleanup()

    # Check if the requested file exists
    path = os.path.join(crop_output_path, file_path)
    if not os.path.exists(path):
        # Create error response
        err_response = HttpResponse("Sorry, the requested file (%) was not " \
                "found." % file_path)
        return err_response

    # Return the actual file content
    fsock = open(path,"rb")
    response = HttpResponse(fsock)
    response['Content-Type'] = 'image/' + file_extension
    response['Content-Disposition'] = 'attachment; filename="' + file_path + '"'

    return response

