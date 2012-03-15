from django.db import models
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from vncbrowser.models import Project, Stack, Message, User
from vncbrowser.views import catmaid_login_required
from vncbrowser.views.common import json_error_response
import json
import cropping
import os.path
import base64
from pgmagick import ImageList, Image, Geometry, Color, DrawableList, DrawableText, TypeMetric
from celery.task import task

class Marker:
    """ A marker is a text at a certain position with a size and a color.
    Expect the size to be in pixels.
    """
    def __init__(self, x, y, text, color, size):
        self.x = float(x)
        self.y = float(y)
        #self.text = unicode( text, "utf-8" )
        self.text = text
        self.color = color
        self.size = float(size)

    def __str__(self):
        return "Marker: {0} at position ({1},{2}) with color #{3} and size {4}".format(self.text, str(self.x), str(self.y), self.color, str(self.size))

    @classmethod
    def from_raw_data(self, data):
        """ Creates a Marker based on a list [x, y, text, color, size].
        """
        if len(data) != 5:
            raise ValueError("Cannot create marker, input is not understood.")
        return Marker( data[0], data[1], data[2], data[3], data[4] )

class ThumbnailingJob( cropping.CropJob ):
    """ A small container class to keep information about the thumbnailing
    job to be done.
    """
    def __init__(self, user, project_id, stack_ids, x_min, x_max, y_min, y_max, z_min, z_max, zoom_level, folder, metadata, markers):
        # Build output path -- *without* extension
        output_folder = os.path.join( settings.THUMBNAIL_DIR, folder)
        file_name = cropping.id_generator()
        output_path = os.path.join( output_folder, file_name )
        # Call the super constructor
        cropping.CropJob.__init__( self, user, project_id, stack_ids, x_min, x_max, y_min, y_max, z_min, z_max, zoom_level, output_path )
        self.folder = folder
        self.metadata = metadata
        self.markers = markers

def add_markers_to_image( job, img ):
    """ Adds the markers of the job to the image.
    """
    logger = create_thumbnails.get_logger()
    for m in job.markers:
        text = m.text
        # General font and color properties
        size_pt = m.size * 72.0 / img.density().height()
        img.fontPointsize( size_pt )
        img.fillColor( Color( "#" + m.color ) )
        # We don't want outlines
        img.strokeColor(Color("transparent"))
        # Use unicode (iso10646) font
        img.font( settings.MARKER_FONT )
        # Calculate image position of marker
        pos_x = cropping.to_x_index( m.x - job.x_min, job )
        pos_y = cropping.to_y_index( m.y - job.y_min, job )
        # Add marker to image
        logger.debug( "Adding marker: {0} -- screen: {1},{2}".format( str(m), str(pos_x), str(pos_y) ) )
        dl = DrawableList()
        dl.append( DrawableText( pos_x, pos_y, text, "UTF-8" ) )
        img.draw( dl )

def sanity_check( job ):
    return cropping.sanity_check( job )

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
                    # draw the markers on the image
                    add_markers_to_image( job, img )
                    # append the imaga to the current list
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
def make_thumbnail(request, project_id=None, stack_ids=None, x_min=None, x_max=None, y_min=None, y_max=None, z_min=None, z_max=None, zoom_level=None, logged_in_user=None):
    """ Creates a thumbnail image and a metadata text file in
    a predefined place.
    """
    # Make sure we got a POST request
    if request.method != 'POST':
            err_response = json_error_response( "Expected a POST request to get all the details of the job.")
            err_response['Connection'] = 'close'
            return err_response

    # Get meta data information
    metadata = None
    try:
        metadata = request.REQUEST["metadata"]
        metadata = metadata.split(",")
    except:
        metadata = []

    # Get marker information
    markers = []
    try:
        markers = request.REQUEST["markers"]
        if markers != "":
            try:
                markers = markers.split(",")
                markers = [base64.b64decode( x ) for x in markers]
                markers = [Marker.from_raw_data( x.split( "," ) ) for x in markers]
            except ValueError, e:
                return json_error_response( "{0}:\n{1}".format( e, "\n".join( markers )  ) )
    except:
        markers = []

    # Get the tissue
    tissue = None
    try:
        tissue = request.REQUEST["tissue"]
    except:
        return json_error_response( "Haven't found a tissue specification." )

    # Make a list out of the stack ids
    string_list = stack_ids.split(",")
    stack_ids = [int( x ) for x in string_list]

    # Crate a new cropping job
    job = ThumbnailingJob(logged_in_user, project_id, stack_ids, x_min, x_max, y_min, y_max, z_min, z_max, zoom_level, tissue, metadata, markers)

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

