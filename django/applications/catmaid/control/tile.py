import os
from contextlib import closing
import logging
import numpy as np
import base64
from django.conf import settings
from django.http import HttpResponse

from catmaid.models import UserRole
from catmaid.control.common import ConfigurationError
from catmaid.control.authentication import requires_user_role

from six import StringIO


logger = logging.getLogger(__name__)

tile_loading_enabled = True

try:
    import h5py
except ImportError:
    tile_loading_enabled = False
    logger.warning("CATMAID was unable to load the h5py library. "
          "HDF5 tiles are therefore disabled.")
try:
    from PIL import Image
except ImportError:
    tile_loading_enabled = False
    logger.warning("CATMAID was unable to load the PIL/pillow library. "
          "HDF5 tiles are therefore disabled.")


@requires_user_role([UserRole.Browse])
def get_tile(request, project_id=None, stack_id=None):

    if not tile_loading_enabled:
        raise ConfigurationError("HDF5 tile loading is currently disabled")

    scale = float(request.GET.get('scale', '0'))
    height = int(request.GET.get('height', '0'))
    width = int(request.GET.get('width', '0'))
    x = int(request.GET.get('x', '0'))
    y = int(request.GET.get('y', '0'))
    z = int(request.GET.get('z', '0'))
    col = request.GET.get('col', 'y')
    row = request.GET.get('row', 'x')
    file_extension = request.GET.get('file_extension', 'png')
    basename = request.GET.get('basename', 'raw')

    # need to know the stack name
    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_{2}.hdf'.format( project_id, stack_id, basename ) )

    if not os.path.exists( fpath ):
        data=np.zeros( (height, width) )
        pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)
        response = HttpResponse(content_type="image/png")
        pilImage.save(response, "PNG")
        return response
        # return HttpResponse(json.dumps({'error': 'HDF5 file does not exists: {0}'.format(fpath)}))

    with closing(h5py.File(fpath, 'r')) as hfile:
        #import math
        #zoomlevel = math.log(int(scale), 2)
        hdfpath = '/' + str(int(scale)) + '/' + str(z) + '/data'
        if not str(int(scale)) in hfile['/'].keys():
            data=np.zeros( (height, width) )
            pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)
            response = HttpResponse(content_type="image/png")
            pilImage.save(response, "PNG")
            return response
            # return HttpResponse(json.dumps({'error': 'HDF5 file does not contain scale: {0}'.format(str(int(scale)))}))
        image_data=hfile[hdfpath]
        data=image_data[y:y+height,x:x+width]
        pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)
        response = HttpResponse(content_type="image/png")
        pilImage.save(response, "PNG")
        return response

    return response

@requires_user_role([UserRole.Annotate])
def put_tile(request, project_id=None, stack_id=None):
    """ Store labels to HDF5 """

    if not tile_loading_enabled:
        raise ConfigurationError("HDF5 tile loading is currently disabled")

    scale = float(request.POST.get('scale', '0'))
    height = int(request.POST.get('height', '0'))
    width = int(request.POST.get('width', '0'))
    x = int(request.POST.get('x', '0'))
    y = int(request.POST.get('y', '0'))
    z = int(request.POST.get('z', '0'))
    col = request.POST.get('col', 'y')
    row = request.POST.get('row', 'x')
    image = request.POST.get('image', 'x')

    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}.hdf'.format( project_id, stack_id ) )

    with closing(h5py.File(fpath, 'a')) as hfile:
        hdfpath = '/labels/scale/' + str(int(scale)) + '/data'
        image_from_canvas = np.asarray( Image.open( StringIO(base64.decodestring(image)) ) )
        hfile[hdfpath][y:y+height,x:x+width,z] = image_from_canvas[:,:,0]

    return HttpResponse("Image pushed to HDF5.", content_type="plain/text")
