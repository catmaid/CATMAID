from django.db import models
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from vncbrowser.models import Project, Stack, Message
from vncbrowser.views import catmaid_login_required
import json

try:
    import numpy as np
    from pgmagick import Blob, Image, ImageList, Geometry, Color, CompositeOperator as co
    import urllib2 as urllib
    import string
    import random
    import os.path
    import glob
    from time import time
except ImportError:
    pass

# The tile size in pixel
tile_size = int(256)
# Prefix for stored microstacks
file_prefix = "crop_"
# File extension of the stored microstacks
file_extension = "tiff"

class CropJob:
    """ A small container class to keep information about the cropping
    job to be done.
    """
    def __init__(self, user, project_id, stack_id, x_min, x_max, y_min, y_max, z_min, z_max, zoom_level):
        self.user = user
        self.project_id = project_id
        self.stack_id = stack_id
        self.project = get_object_or_404(Project, pk=project_id)
        self.stack = get_object_or_404(Stack, pk=stack_id)
        self.x_min = float(x_min)
        self.x_max = float(x_max)
        self.y_min = float(y_min)
        self.y_max = float(y_max)
        self.z_min = float(z_min)
        self.z_max = float(z_max)
        self.zoom_level = int(zoom_level)

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
            raise ValueError( "An image part must have an area, hence no extent should be zero!" )

    def get_image( self ):
        # Open the image
        img_file = urllib.urlopen( self.path )
        blob = Blob( img_file.read() )
        image = Image( blob )
        # Check if the whole image should be used and croped
        # if necessary.
        src_width = image.size().width()
        src_height = image.size().height()
        if self.width !=  src_width or self.height != src_height:
            box = Geometry( self.width, self.height, self.x_min_src, self.y_min_src )
            image.crop( box )
        return image

def id_generator(size=6, chars=string.ascii_lowercase + string.digits):
    """ Creates a random string of the specified length.
    """
    return ''.join(random.choice(chars) for x in range(size))

def to_x_index( x, job, enforce_bounds=True ):
    """ Converts a real world position to a x pixel position.
    Also, makes sure the value is in bounds.
    """
    # TODO: use correct stack_translation
    translation = 0.0
    zero_zoom = (x - translation) / job.stack.resolution.x
    if enforce_bounds:
        zero_zoom = min(max(zero_zoom, 0.0), job.stack.dimension.x - 1.0)
    return int( zero_zoom / (2**job.zoom_level) + 0.5 )

def to_y_index( y, job, enforce_bounds=True ):
    """ Converts a real world position to a y pixel position.
    Also, makes sure the value is in bounds.
    """
    # TODO: use correct stack_translation
    translation = 0.0
    zero_zoom = (y - translation) / job.stack.resolution.y
    if enforce_bounds:
        zero_zoom = min(max(zero_zoom, 0.0), job.stack.dimension.y - 1.0)
    return int( zero_zoom / (2**job.zoom_level) + 0.5 )

def to_z_index( z, job, enforce_bounds=True ):
    """ Converts a real world position to a slice/section number.
    Also, makes sure the value is in bounds.
    """
    # TODO: use correct stack_translation
    translation = 0.0
    section = (z - translation) / job.stack.resolution.z + 0.5
    if enforce_bounds:
        section = min(max(section, 0.0), job.stack.dimension.z - 1.0)
    return int( section )

def get_tile_path(job, tile_coords):
    """ Creates the full path to the tile at the specified coordinate index.
    """
    path = job.stack.image_base
    n_coords = len(tile_coords)
    for c in range( 2, n_coords ):
        # the path is build beginning with the last component
        coord = tile_coords[n_coords - c + 1]
        path += str(coord) + "/"
    path += str(tile_coords[1]) + "_" + str(tile_coords[0]) + "_" + str(job.zoom_level) + "." + job.stack.file_extension
    return path

def extract_substack( job ):
    """ Extracts a sub-stack as specified in the passed job. A list of
    pgmagick images is returned -- one for each slice, starting on top.
    """

    # Calculate the slice numbers and pixel positions
    # bounded to the stack data.
    px_x_min = to_x_index(job.x_min, job)
    px_x_max = to_x_index(job.x_max, job)
    px_y_min = to_y_index(job.y_min, job)
    px_y_max = to_y_index(job.y_max, job)
    px_z_min = to_z_index(job.z_min, job)
    px_z_max = to_z_index(job.z_max, job)
    # Because it might be that the cropping goes over the
    # stack bounds, we need to calculate the unbounded height,
    # with and an offset.
    px_x_min_nobound = to_x_index(job.x_min, job, False)
    px_x_max_nobound = to_x_index(job.x_max, job, False)
    px_y_min_nobound = to_y_index(job.y_min, job, False)
    px_y_max_nobound = to_y_index(job.y_max, job, False)
    width = px_x_max_nobound - px_x_min_nobound
    height = px_y_max_nobound - px_y_min_nobound
    px_x_offset = abs(px_x_min_nobound) if px_x_min_nobound < 0 else 0
    px_y_offset = abs(px_y_min_nobound) if px_y_min_nobound < 0 else 0

    # The images are generated per slice, so most of the following
    # calculations refer to 2d images.

    # Iterate over all slices
    cropped_stack = []
    for z in range( px_z_min, px_z_max + 1):
        # Get indices for bounding tiles (0 indexed)
        tile_x_min = int(px_x_min / tile_size)
        tile_x_max = int(px_x_max / tile_size)
        tile_y_min = int(px_y_min / tile_size)
        tile_y_max = int(px_y_max / tile_size)
        # Get the number of needed tiles for each direction
        num_x_tiles = tile_x_max - tile_x_min + 1
        num_y_tiles = tile_y_max - tile_y_min + 1
        # Associate image parts with all tiles
        image_parts = []
        x_dst = px_x_offset
        for nx, x in enumerate( range(tile_x_min, tile_x_max + 1) ):
            # The min x,y for the image part in the current tile are 0
            # for all tiles except the first one.
            cur_px_x_min = 0 if nx > 0 else px_x_min - x * tile_size
            # The max x,y for the image part of current tile are the tile
            # size minus one except for the last one.
            cur_px_x_max = tile_size - 1 if nx < (num_x_tiles - 1) else px_x_max - x * tile_size
            # Reset y destination component
            y_dst = px_y_offset
            for ny, y in enumerate( range(tile_y_min, tile_y_max + 1) ):
                cur_px_y_min = 0 if ny > 0 else px_y_min - y * tile_size
                cur_px_y_max = tile_size - 1 if ny < (num_y_tiles - 1) else px_y_max - y * tile_size
                # Create an image part definition
                path = get_tile_path(job, [x, y, z])
                try:
                    part = ImagePart(path, cur_px_x_min, cur_px_x_max, cur_px_y_min, cur_px_y_max, x_dst, y_dst)
                    image_parts.append( part )
                except:
                    # ignore failed slices
                    pass
                # Update y component of destination postition
                y_dst += cur_px_y_max - cur_px_y_min
            # Update x component of destination postition
            x_dst += cur_px_x_max - cur_px_x_min

        # Create a result image slice, painted black
        cropped_slice = Image( Geometry( width, height ), Color("black") )
        # write out the image parts
        for ip in image_parts:
            # Get (correcly cropped) image
            image = ip.get_image()
            # Draw the image onto result image
            cropped_slice.composite( image, ip.x_dst, ip.y_dst, co.OverCompositeOp )
            # Delete tile image - it's not needed anymore
            del image
        # Add the imag to the cropped stack
        cropped_stack.append( cropped_slice )

    return cropped_stack

def process_crop_job(job):
    """ This method does the actual cropping.
    """
    # TODO: Check if asynchronous execution is needed, like with PHPs ignore_user_abort()
    # see e.g.: http://stackoverflow.com/questions/4925629/ignore-user-abort-php-simil-in-django-python

    # Create the sub-stack
    cropped_stack = extract_substack( job )

    # Create tho output image
    outputImage = ImageList()
    for img in cropped_stack:
        outputImage.append( img )

    # Save the resulting micro_stack to a temporary location
    file_name = file_prefix + id_generator() + "." + file_extension
    output_path = os.path.join(settings.TMP_DIR, file_name)
    no_error_occured = True
    error_message = ""
    # Only produce an image if parts of stacks are within the output
    if len( cropped_stack ) > 0:
        try:
            outputImage.writeImages( output_path )
        except IOError, e:
            no_error_occured = False
            error_message = str(e)
            # Delete the file if parts of it have been written already
            if os.path.exists( output_path ):
                os.remove( output_path )
    else:
        no_error_occured = False
        error_message = "A region outside the stack has been selected. Therefore, no image was produced."

    # Create a notification message
    bb_text = "( " + str(job.x_min) + ", " + str(job.y_min) + ", " + str(job.z_min) + " ) -> ( " + str(job.x_max) + ", " + str(job.y_max) + ", " + str(job.z_max) + " )"
    msg = Message()
    msg.user = job.user
    msg.read = False
    response_message = ""
    if no_error_occured:
        url = os.path.join( settings.CATMAID_DJANGO_URL, "crop/download/" + file_name + "/")
        response_message = url
        msg.title = "Microstack finished"
        msg.text = "The requested microstack " + bb_text + " is finished. You can download it from this location: <a href=\"" + url + "\">" + url + "</a>"
        msg.action = url
    else:
        msg.title = "Microstack could not be created"
        msg.text = "The requested microstack " + bb_text + " could not be created due to an error while saving the result (" + error_message + ")."
        msg.action = ""
    msg.save()

    # Create closing response
    closingResponse = HttpResponse(json.dumps(response_message), mimetype="text/json")
    closingResponse['Connection'] = 'close'

    return closingResponse

def sanity_check( job ):
    """ Tests the job parameters for obvious problems.
    """
    errors = []
    # Make sure the output path can be written to
    output_dir = os.path.dirname( job.output_path )
    if not os.path.exists( output_dir ) or not os.access( output_dir, os.W_OK ):
        errors.append( "the output folder is not accessible" )
    # Test the cropping paramets
    if job.x_min > job.x_max:
        errors.append( "x_min must no be larger than x_max" )
    if job.y_min > job.y_max:
        errors.append( "y_min must no be larger than y_max" )
    if job.z_min > job.z_max:
        errors.append( "z_min must no be larger than z_max" )
    # If the number of zoom levels is defined explicitely,
    # check if the requested level is not larger than that.
    allowed_zoom_level = job.ref_stack.min_zoom_level
    if allowed_zoom_level >= 0 and job.zoom_level > allowed_zoom_level:
        errors.append( "zoom_level must not be larger than what stacks allows (" + str(allowed_zoom_level) + ")" )
    if job.zoom_level < 0:
        errors.append( "zoom_level must not be smaller than 0" )
    return errors

@catmaid_login_required
def crop(request, project_id=None, stack_id=None, x_min=None, x_max=None, y_min=None, y_max=None, z_min=None, z_max=None, zoom_level=None, logged_in_user=None):
    """ Crops out the specified region of the stack. The region is expected to
    be given in terms of real world units (e.g. nm).
    """
    # Make sure tmp dir exists and is writable
    if not os.path.exists( settings.TMP_DIR ) or not os.access( settings.TMP_DIR, os.W_OK ):
        json_message = "Please make sure your temporary folder (TMP_DIR in settings.py) exists and is writable."
        err_response = json_error_response( err_message )
        err_response['Connection'] = 'close'
        return err_response

    # Crate a new cropping job
    job = CropJob(logged_in_user, project_id, stack_id, x_min, x_max, y_min, y_max, z_min, z_max, zoom_level)

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
        err_response['Connection'] = 'close'
        return err_response
        
    result = process_crop_job(job)

    return result

def cleanup( max_age=1209600 ):
    """ Cleans up the temporariy space of the cropped stacks.
    Such a stack is deleted if it is older than max_age, which
    is specified in seconds and  defaults to two weeks (1209600). 
    """ 
    search_pattern = os.path.join(settings.TMP_DIR, file_prefix + "*." + file_extension)
    now = time()
    files_to_remove = []
    for item in glob.glob( search_pattern ):
        file_ctime = os.path.getctime( item )
        if (now - file_ctime) > max_age:
            files_to_remove.append( item )
    for item in files_to_remove:
            os.remove( item )

@catmaid_login_required
def download_crop(request, file_path=None, logged_in_user=None):
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
    path = os.path.join(settings.TMP_DIR, file_path)
    if not os.path.exists(path):
        # Create error response
        err_response = HttpResponse("Sorry, the requested file (" + file_path + ") was not found.")
        err_response['Connection'] = 'close'
        return err_response

    # Return the actual file content
    fsock = open(path,"rb")
    response = HttpResponse(fsock)
    response['Content-Type'] = 'image/' + file_extension
    response['Content-Disposition'] = 'attachment; filename="' + file_path + '"'

    return response

