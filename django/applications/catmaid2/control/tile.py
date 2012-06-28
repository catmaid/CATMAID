
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
    hdf5_path = request.GET.get('hdf5_path', '/')

    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}.hdf'.format( project_id, stack_id ) )

    #print 'exists', os.path.exists(fpath)

    with closing(h5py.File(fpath, 'r')) as hfile:
        #import math
        #zoomlevel = math.log(int(scale), 2)
        hdfpath = hdf5_path + '/scale/' + str(int(scale)) + '/data'
        image_data=hfile[hdfpath].value
        data=image_data[y:y+height,x:x+width,z].copy()
        # without copy, would yield expected string or buffer exception
        # XXX: should directly index into the memmapped hdf5 array
        #print >> sys.stderr, 'hdf5 path', hdfpath, image_data, data,
        # data.shape

        pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)
        response = HttpResponse(mimetype="image/png")
        pilImage.save(response, "PNG")
        return response


    w,h=1000,800
    # img = np.empty((width,height), np.uint32)
    #img.shape=height,width
    img = np.random.random_integers(0, 150, (height,width) ).astype(np.uint8)
    #img[0,0]=0x800000FF
    # img[:400,:400]=0xFFFF0000
    pilImage = Image.frombuffer('RGBA',(width,height),img,'raw','L',0,1)
    response = HttpResponse(mimetype="image/png")
    pilImage.save(response, "PNG")
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

    return HttpResponse("Image pushed to HDF5.", mimetype="plain/text")