import os
import cStringIO
from contextlib import closing
import h5py
import numpy as np
import base64
from django.conf import settings

try:
    from PIL import Image
except:
    pass

from django.http import HttpResponse

def get_tile(request, project_id=None, stack_id=None):

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

def put_tile(request, project_id=None, stack_id=None):
    """ Store labels to HDF5 """
    #print >> sys.stderr, 'put tile', request.POST

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
    #print >> sys.stderr, 'fpath', fpath

    with closing(h5py.File(fpath, 'a')) as hfile:
        hdfpath = '/labels/scale/' + str(int(scale)) + '/data'
        #print >> sys.stderr, 'storage', x,y,z,height,width,hdfpath
        #print >> sys.stderr, 'image', base64.decodestring(image)
        image_from_canvas = np.asarray( Image.open( cStringIO.StringIO(base64.decodestring(image)) ) )
        hfile[hdfpath][y:y+height,x:x+width,z] = image_from_canvas[:,:,0]

    return HttpResponse("Image pushed to HDF5.", content_type="plain/text")
