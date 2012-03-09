from django.db import models
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from vncbrowser.models import Project, Stack, Message, User
from vncbrowser.views import catmaid_login_required
import json
import cropping
import os.path
import base64
from pgmagick import ImageList
from celery.task import task

class ThumbnailingJob( cropping.CropJob ):
    """ A small container class to keep information about the thumbnailing
    job to be done.
    """
    def __init__(self, user, project_id, stack_ids, x_min, x_max, y_min, y_max, z_min, z_max, zoom_level, folder, metadata):
        # Build output path -- *without* extension
        output_folder = os.path.join( settings.THUMBNAIL_DIR, folder)
        file_name = cropping.id_generator()
        output_path = os.path.join( output_folder, file_name )
        # Call the super constructor
        cropping.CropJob.__init__( self, user, project_id, stack_ids, x_min, x_max, y_min, y_max, z_min, z_max, zoom_level, output_path )
        self.folder = folder
        self.metadata = metadata

def sanity_check( job ):
    errors = cropping.sanity_check( job )
    return errors

@task()
def create_thumbnails( job ):
    error_occured = False
    error_message = ""
    try:
        # Create the sub-stack
        cropped_stack = cropping.extract_substack( job )
        num_stacks = len( job.stacks )
        for n, s in enumerate( job.stacks ):
            # Create tho output image
            outputImage = ImageList()
            for m, img in enumerate( cropped_stack ):
                # Only select images that are of the current stack
                if (m - n) % num_stacks == 0:
                    outputImage.append( img )
            # The naming extension of the current stack. This is the
            # title of the stack in lower case and spaces replaced.
            name_ext = s.title.lower().replace(" ", "_")
            # Write out the output image
            if len( cropped_stack ) > 0:
                # Add file extension
                op = "{0}-{1}.{2}".format( job.output_path, name_ext, cropping.file_extension)
                outputImage.writeImages( op )
                #write a metadata file (output path + ".txt")
                mdFile = open(op + ".txt", "w")
                mdFile.write( job.metadata[ n ] )
                mdFile.close()
            else:
                error_occured = True
                error_message = "A region outside the stack has been selected. Therefore, no image was produced."
    except Exception, e:
        error_occured = True
        error_message = str(e)
        # Delete the file if parts of it have been written already
        if os.path.exists( job.output_path ):
            os.remove( job.output_path )

    if error_occured:
        msg = Message()
        msg.user = User.objects.get(pk=int(job.user.id))
        msg.read = False
        msg.title = "The thumbnail could not be created"
        msg.text = "The requested thumbnail could not be created due to an error while saving the result (" + error_message + ")."
        msg.action = ""
        msg.save()

    return "Created thumnail(s)"

def start_asynch_process( job ):
    """ Starts the cropping with the help of the cropping module and
    creates the meta data text file.
    """
    result = create_thumbnails.delay( job )

    # Create closing response
    closingResponse = HttpResponse(json.dumps(""), mimetype="text/json")
    closingResponse['Connection'] = 'close'

    return closingResponse

@catmaid_login_required
def make_thumbnail(request, project_id=None, stack_ids=None, x_min=None, x_max=None, y_min=None, y_max=None, z_min=None, z_max=None, zoom_level=None, tissue=None, metadata=None, logged_in_user=None):
    """ Creates a thumbnail image and a metadata text file in
    a predefined place.
    """
    # The meta data is expected to be base64 encoded, so decode it
    metadata = base64.b64decode( metadata )
    metadata = metadata.split(",")

    # Make a list out of the stack ids
    string_list = stack_ids.split(",")
    stack_ids = [int( x ) for x in string_list]

    # Crate a new cropping job
    job = ThumbnailingJob(logged_in_user, project_id, stack_ids, x_min, x_max, y_min, y_max, z_min, z_max, zoom_level, tissue, metadata)

    # Parameter check
    errors = sanity_check( job )
    if len(errors) > 0:
        err_message = "Some problems with the specified parameters were found: "
        for n, e in enumerate( errors ):
            if n == 0:
                err_message += str( n+1 ) + ". " + e
            else:
                err_message += ", " + str( n+1 ) + ". " + e
        err_response = json_error_response( err_message )
        err_response['Connection'] = 'close'
        return err_response

    result = start_asynch_process( job )
    return result
