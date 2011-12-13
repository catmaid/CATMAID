from django.db import models
from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from vncbrowser.models import Project, Stack
from pgmagick import Blob, Image, Geometry, Color, CompositeOperator as co, ResolutionType, ChannelType as ch, QuantumOperator as qo
import urllib2 as urllib

def create_tile_url( base, section, x, y, zoom_level, ext ):
    """ Creates a common CATDMAID tile URL.
    """
    return "{0}{1}/{2}_{3}_{4}.{5}".format( base, section, y, x, zoom_level, ext )

def create_tile(request, project_id=None, stack_ids=None, section=None, x=None, y=None, zoom_level=None, intensities=None):
    """ Creates a tile based on the tiles at the given position in the
    given stacks. The intensities are percentage values (i.e. 100 = no
    change). For now, the colors for the different channels are fixed:
    blue, green, magenta and greys for the rest. This will change in
    the future.
    """
    # Make a list out of the stack ids
    string_list = stack_ids.split(",")
    stack_ids = [int( i ) for i in string_list]
    # Make a list out of the stack ids
    string_list = intensities.split(",")
    intensities = [float( i ) for i in string_list]
    # Get access to the model
    project = get_object_or_404(Project, pk=project_id)

    # TODO: Access tile size information through Django model
    geometry = Geometry(256, 256)
    color = Color("black")
    composite = Image(geometry, color)

    for n, s in enumerate( stack_ids ):
        stack = get_object_or_404(Stack, pk=s)
        img_url = create_tile_url( stack.image_base, section, x, y, zoom_level, stack.file_extension )
        img_file = urllib.urlopen( img_url )
        blob = Blob( img_file.read() )
        image = Image( blob )
        del blob

        # Channel selection
        if n == 0:
            # Channel 0 is blue
            image.quantumOperator( ch.RedChannel, qo.AssignQuantumOp, 0 )
            image.quantumOperator( ch.GreenChannel, qo.AssignQuantumOp, 0 )
        elif n == 1:
            # Channel 1 is green
            image.quantumOperator( ch.RedChannel, qo.AssignQuantumOp, 0 )
            image.quantumOperator( ch.BlueChannel, qo.AssignQuantumOp, 0 )
        elif n == 2:
            # Channel 2 is magenta
            image.quantumOperator( ch.GreenChannel, qo.AssignQuantumOp, 0 )
        # The remaining channels are gray

        # Make the image brighter according to intensity
        image.modulate( intensities[n], 100.0, 100.0 )

        # Write modulated and color modified image to output image
        composite.composite( image, 0, 0, co.PlusCompositeOp )
        composite.magick( image.magick() )

    # Encode image
    composite_blob = Blob()
    composite.write( composite_blob )

    # Return the actual file content
    response = HttpResponse( composite_blob.data )
    response['Content-Type'] = 'image/' + stack.file_extension
    response['Content-Disposition'] = 'attachment; filename="' + str(intensities[0]) + img_url  + '"'
    response['Connection'] = 'close'

    return response
