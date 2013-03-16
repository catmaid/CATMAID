import json
import time

from django.conf import settings
from django.http import HttpResponse

from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.stack import get_stack_info

try:
    import numpy as np
    import h5py
    from PIL import Image
except ImportError:
    pass

from contextlib import closing
from random import choice
import os
import base64, cStringIO
import time
import sys

try:
    import cairo
except ImportError:
    pass


try:
    import rsvg
except ImportError:
    pass

try:
    import vtk
except ImportError:
    pass


import random

try:
    # sys.path.append('/home/ottj/3dbar/lib/pymodules/python2.6')
    from bar.rec.pipeline import barPipeline, VTK_PIPELINE
except ImportError:
    pass

# This file defines constants used to correctly define the metadata for NeuroHDF microcircuit data

VerticesTypeSkeletonRootNode = {
    'name': 'skeleton root',
    'id': 1
}

VerticesTypeSkeletonNode = {
    'name': 'skeleton',
    'id': 2
}

VerticesTypeConnectorNode = {
    'name': 'connector',
    'id': 3
}

ConnectivityNeurite = {
    'name': 'neurite',
    'id': 1
}

ConnectivityPresynaptic = {
    'name': 'presynaptic_to',
    'id': 2
}

ConnectivityPostsynaptic = {
    'name': 'postsynaptic_to',
    'id': 3
}

def retrieve_components_for_location(project_id, stack_id, x, y, z, limit=10):
    componentIds = {}
    fpath = os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_componenttree.hdf'.format( project_id, stack_id ) )
    with closing(h5py.File(fpath, 'r')) as hfile:

        image_data = hfile['connected_components/'+z+'/pixel_list_ids']
        componentMinX = hfile['connected_components/'+z+'/min_x']
        componentMinY = hfile['connected_components/'+z+'/min_y']
        componentMaxX = hfile['connected_components/'+z+'/max_x']
        componentMaxY = hfile['connected_components/'+z+'/max_y']
        thresholdTable = hfile['connected_components/'+z+'/values']

        length=image_data.len()

        print >> sys.stderr, "extract components ...."
        start = time.time()

        #Merge all data into single array
        #TODO:ID instead of length
        merge=np.dstack((np.arange(length),componentMinX.value,componentMinY.value,componentMaxX.value,componentMaxY.value,thresholdTable.value))
        # FIXME: use np.where instead of merging into a new array
        selectionMinXMaxXMinYMaxY=None

        selectionMinX = merge[merge[...,1]<=x]
        if len(selectionMinX):
            selectionMinXMaxX = selectionMinX[selectionMinX[...,3]>=x]
            if len(selectionMinXMaxX):
                selectionMinXMaxXMinY = selectionMinXMaxX[selectionMinXMaxX[...,2]<=y]
                if len(selectionMinXMaxXMinY):
                    selectionMinXMaxXMinYMaxY = selectionMinXMaxXMinY[selectionMinXMaxXMinY[...,4]>=y]

        delta = time.time() - start
        print >> sys.stderr, "took", delta

        print >> sys.stderr, "create components ...."
        start = time.time()

        if selectionMinXMaxXMinYMaxY is not None:

            idx = np.argsort(selectionMinXMaxXMinYMaxY[:,5])
            limit_counter = 0
            for i in idx:
                if limit_counter >= limit:
                    break
                row = selectionMinXMaxXMinYMaxY[i,:]
                componentPixelStart=hfile['connected_components/'+z+'/begin_indices'].value[row[0]].copy()
                componentPixelEnd=hfile['connected_components/'+z+'/end_indices'].value[row[0]].copy()
                data=hfile['connected_components/'+z+'/pixel_list_0'].value[componentPixelStart:componentPixelEnd].copy()

                # check containment of the pixel in the component
                if not len(np.where((data['x'] == x) & (data['y'] == y))[0]):
                    continue

                componentIds[int(row[0])]={
                    'minX': int(row[1]),
                    'minY': int(row[2]),
                    'maxX': int(row[3]),
                    'maxY': int(row[4]),
                    'threshold': row[5]
                }
                limit_counter += 1

        delta = time.time() - start
        print >> sys.stderr, "took", delta

    return componentIds

def get_component_list_for_point(request, project_id=None, stack_id=None):
    """ Generates a JSON List with all intersecting components for
    a given location
    """
    x = int(request.GET.get('x', '0'))
    y = int(request.GET.get('y', '0'))
    z = str(request.GET.get('z', '0'))
    print x,y,z
    componentIds = retrieve_components_for_location(project_id, stack_id, x, y, z)
    return HttpResponse(json.dumps(componentIds), mimetype="text/json")


#TODO: in transaction; separate out creation of a new component in a function

@login_required
def put_components(request, project_id=None, stack_id=None):

    # parse request
    components=json.loads(request.POST['components'])
    skeleton_id = int(request.POST['skeleton_id'])
    z = int(request.POST['z'])


    # field of view
    viewX=int(request.POST['x'])
    viewY=int(request.POST['y'])
    viewHeight=int(request.POST['height'])
    viewWidth=int(request.POST['width'])

    viewMaxX=viewX+viewWidth
    ViewMaxY=viewY+viewHeight

    s = get_object_or_404(ClassInstance, pk=skeleton_id)
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # fetch all the components for the given skeleton and z section
    all_components = Component.objects.filter(
        project = p,
        stack = stack,
        skeleton_id = skeleton_id,
        z = z).all()

    # discard the components out of field of view
    activeComponentIds=[]

    for i in components:

        comp=components[i]
        inDatabase=False
        for compDatabse in all_components:
            if str(compDatabse.component_id)==str(comp['id']):
                inDatabase=True
                activeComponentIds.insert(activeComponentIds.__sizeof__(),comp['id'])
                break
        if inDatabase:
            continue

        new_component = Component(
            project = p,
            stack = stack,
            user = request.user,
            skeleton_id = s.id,
            component_id = comp['id'],
            min_x = comp['minX'],
            min_y = comp['minY'],
            max_x = comp['maxX'],
            max_y = comp['maxY'],
            z = z,
            threshold = comp['threshold'],
            status = 1
        )
        new_component.save()
        activeComponentIds.insert(activeComponentIds.__sizeof__(),comp['id'])

    # delete components that were deselected
    for compDatabase in all_components:
        if not activeComponentIds.count(str(compDatabase.component_id)):
            Component.delete(compDatabase)

    return HttpResponse(json.dumps(True), mimetype="text/json")



import sys

def create_segmentation_file(request, project_id=None, stack_id=None):

    create_segmentation_neurohdf_file(request, project_id,stack_id)

    return HttpResponse(json.dumps(True), mimetype="text/json")

def get_pixellist_for_component(project_id, stack_id, z, component_id):
    componentTreeFilePath = os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_componenttree.hdf'.format( project_id, stack_id ) )
    with closing(h5py.File(componentTreeFilePath, 'r')) as componenthfile:
        componentPixelStart=componenthfile['connected_components/'+str(z)+'/begin_indices'].value[component_id].copy()
        componentPixelEnd=componenthfile['connected_components/'+str(z)+'/end_indices'].value[component_id].copy()

        data = componenthfile['connected_components/'+str(z)+'/pixel_list_0'].value[componentPixelStart:componentPixelEnd].copy()
        return data['x'], data['y']

def get_indices_for_drawing(freeDrawing, width, height):
        drawingArray = svg2pixel(freeDrawing)
        indices=np.where(drawingArray>0)

        x_index = indices[1]+(freeDrawing.min_x-50)
        y_index = indices[0]+(freeDrawing.min_y-50)
        idx = (x_index >= 0) & (x_index < width) & (y_index >= 0) & (y_index < height)
        #Use number from JS canvas tool enum
        return x_index[idx], y_index[idx]

def create_segmentation_neurohdf_file(request, project_id, stack_id):
    filename=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_segmentation.hdf'.format( project_id, stack_id ) )

    print >> sys.stderr, filename
    with closing(h5py.File(filename, 'w')) as hfile:
        hfile.attrs['neurohdf_version'] = '0.1'
        scaleGroup = hfile.create_group("scale")
        scale_zero = scaleGroup.create_group("0")
        sectionGroup = scale_zero.create_group("section")

        # retrieve stack information to transform world coordinates to pixel coordinates
        stack_info = get_stack_info( project_id, stack_id, request.user )

        width=stack_info['dimension']['x']
        height=stack_info['dimension']['y']

        stack = get_object_or_404(Stack, pk=stack_id)
        project = get_object_or_404(Project, pk=project_id)

        whitelist = range( int(stack_info['dimension']['z']) )
        [whitelist.remove( int(k) ) for k,v in stack_info['broken_slices'].items()]

        # retrieve all skeletons that have a component associated with it in order
        # to define a globally consistent colormap from skeleton_id to color
        all_components_with_skeletons = Component.objects.filter(
            project = project,
            stack = stack,
            skeleton_id__isnull=False
        ).distinct('skeleton_id')
        all_skeletons = [ele.skeleton_id for ele in all_components_with_skeletons]
        # TODO: check that no colors are duplicate
        colors = np.random.randint (0,256, (len(all_skeletons),3) )
        colormap = dict(zip(all_skeletons, colors))

        for z in whitelist:
            section = sectionGroup.create_group(str(z))
            shape=(height,width)

            skeletonIdsPixelArray=np.zeros(shape, dtype=np.long)
            skeletonIdsPixelArrayRGB=np.zeros( (height,width, 3), dtype=np.uint8 )

            ### Write all the components
            all_components = Component.objects.filter(
                project = project,
                stack = stack,
                z=z
            ).order_by('creation_time').all()

            for comp in all_components:

                x,y = get_pixellist_for_component(project_id, stack_id, z, comp.component_id)

                skeletonIdsPixelArray[y,x] = comp.skeleton_id
                skeletonIdsPixelArrayRGB[y,x,:] = colormap[comp.skeleton_id]

            all_free_drawings = Drawing.objects.filter(
                stack=stack,
                project=project,
                z = z).exclude(component_id__isnull=False).all()

            for freeDrawing in all_free_drawings:
                typename = DrawingTypesId[freeDrawing.type]
                print >> sys.stderr, 'freedrawing type', freeDrawing.type, typename

                x, y = get_indices_for_drawing(freeDrawing, width, height)

                # TODO: erasor should only delete pixels of its corresponding skeleton_id

                if freeDrawing.type == DrawingTypes['soma']['value']:
                    skeletonIdsPixelArray[y,x] = freeDrawing.skeleton_id
                    skeletonIdsPixelArrayRGB[y,x,:] = colormap[freeDrawing.skeleton_id]
                else:
                    skeletonIdsPixelArray[y,x] = DrawingTypes[typename]['value']
                    skeletonIdsPixelArrayRGB[y,x,:] = DrawingTypesColormap[typename]

            ### Write out
            section.create_dataset("skeletons", data=skeletonIdsPixelArray, compression='gzip', compression_opts=1)
            # map to color
            section.create_dataset("skeletons_rgb", data=skeletonIdsPixelArrayRGB, compression='gzip', compression_opts=1)

        return


def svg2pixel(drawing, maxwidth=0, maxheight=0):
    #Converts drawings into pixel array. Be careful,50px offset are added to the drawing!!!

    nopos=find_between(drawing.svg,">","transform=")+'transform="translate(50 50)" />'
    data='<svg>'+nopos+'</svg>'

    # TODO: in database:
    # <g transform="translate(804 383.5)"><path width="36" height="67" d="M 14 .. 18" style="stroke: rgb(50,50,255); stroke-width: 15; fill: none; opacity: 1;" transform="translate(-18 -33.5)" /></g>
    # does rsvg deal with rounded strokes?
    # http://stackoverflow.com/questions/10177985/svg-rounded-corner

    #data='<svg>'+drawing.svg.replace("L","C")+'</svg>'

    svg = rsvg.Handle(data=data)

    x = width = svg.props.width
    y = height = svg.props.height
    #    print "actual dims are " + str((width, height))
    #    print "converting to " + str((maxwidth, maxheight))
    #
    #yscale = xscale = 1
    #
    #    if (maxheight != 0 and width > maxwidth) or (maxheight != 0 and height > maxheight):
    #        x = maxwidth
    #        y = float(maxwidth)/float(width) * height
    #        print "first resize: " + str((x, y))
    #        if y > maxheight:
    #            y = maxheight
    #            x = float(maxheight)/float(height) * width
    #            print "second resize: " + str((x, y))
    #        xscale = float(x)/svg.props.width
    #        yscale = float(y)/svg.props.height

    #Add frame of 50px due to stroke width
    newWidth=width+100
    newHeight=height+100

    #Color
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, newWidth, newHeight)
    context = cairo.Context(surface)
    #context.scale(xscale, yscale)
    svg.render_cairo(context)
    #surface.write_to_png("svg_cairo_color_"+str(id)+".png")

    #Hack via pilimage, cairo frombuffer to numpy produces errors due to wrong array length!!!
    pilImage = Image.frombuffer('RGBA',(newWidth,newHeight),surface.get_data(),'raw','RGBA',0,1)
    #    pilImage.save("svg_pil_rgb_"+str(id), "PNG")

    pilGray=pilImage.convert('L')
    #    pilGray.save("svg_pil_gray_"+str(id), "PNG")

    return np.array(pilGray)

def find_between( s, first, last ):
    try:
        start = s.index( first ) + len( first )
        end = s.index( last, start )
        return s[start:end]
    except ValueError:
        return ""


def get_segmentation_tile(project_id, stack_id,scale,height,width,x,y,z,type):

    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_segmentation.hdf'.format( project_id, stack_id ) )

    if int(scale) < 0:
        scale = 0

    with closing(h5py.File(fpath, 'r')) as hfile:

        #hdfpath = 'scale/' + str(int(scale)) + '/section/'+ str(z)+'/skeletons_rgb'
        hdfpath = 'scale/' + str(int(scale)) + '/section/'+ str(z)+'/skeletons_rgb'
        image_data=hfile[hdfpath].value
        data=image_data[y:y+height,x:x+width,:]

        #data=image_data[y:y+height,x:x+width]
        # create membrane labeling
        #data[data == 700] = 0
        #data[data == 600] = 0
        #data[data == 800] = 0
        #data[data > 0] = 255
        #data = data.astype( np.uint8 )

        #data[data != 300] = 0
        #data[data == 300] = 255
        #data = data.astype( np.uint8 )

        #pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)

        #pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','RGBA',0,1)

        pilImage = Image.fromarray(data)
        response = HttpResponse(mimetype="image/png")
        pilImage.save(response, "PNG")
        #pilImage.save('segmentation_tile_'+str(x)+'_'+str(y), "PNG")
        return response


        if type == 'all':
            hdfpath = 'scale/' + str(int(scale)) + '/section/'+ str(z)+'/mitochondria'
            image_data=hfile[hdfpath].value
            data=image_data[y:y+height,x:x+width]

            hdfpath = 'scale/' + str(int(scale)) + '/section/'+ str(z)+'/components'
            image_data=hfile[hdfpath].value
            data_components=image_data[y:y+height,x:x+width]

            indices=np.where(data_components>0)
            data[indices[0],indices[1]] = 1

        else:
            hdfpath = 'scale/' + str(int(scale)) + '/section/'+ str(z)+'/'+type
            image_data=hfile[hdfpath].value
            data=image_data[y:y+height,x:x+width]

        data[data > 0] = 255
        data = data.astype( np.uint8 )

        pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)

        response = HttpResponse(mimetype="image/png")
        pilImage.save(response, "PNG")
        #pilImage.save('segmentation_tile_'+str(x)+'_'+str(y), "PNG")
        return response

"""
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
    type = request.GET.get('type', 'none')

    if hdf5_path=="segmentation_file":
        return get_segmentation_tile(project_id,stack_id,scale,height,width,x,y,z,type)

    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}.hdf'.format( project_id, stack_id ) )

    with closing(h5py.File(fpath, 'r')) as hfile:
        #import math
        #zoomlevel = math.log(int(scale), 2)
        hdfpath = hdf5_path + '/scale/' + str(int(scale)) + '/data'
        image_data=hfile[hdfpath].value        #
        # data=image_data[y:y+height,x:x+width,z].copy()
        # without copy, would yield expected string or buffer exception

        # XXX: should directly index into the memmapped hdf5 array
        #print >> sys.stderr, 'hdf5 path', hdfpath, image_data, data,
        # data.shape

        #pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)
        pilImage = Image.frombuffer('RGBA',(width,height),image_data[y:y+height,x:x+width,z].copy(),'raw','L',0,1)
        response = HttpResponse(mimetype="image/png")
        pilImage.save(response, "PNG")
        return response

def put_tile(request, project_id=None, stack_id=None):

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



class dataImporterFromNumpy(vtk.vtkImageImport):
    def __init__(self, structVol):
        # For VTK to be able to use the data, it must be stored as a VTK-image. This can be done by the vtkImageImport-class which
        # imports raw data and stores it.
        # The preaviusly created array is converted to a string of chars and imported.
        volExtent = structVol.size
        volSpacing = structVol.spacing
        volOrigin = structVol.origin

        data_string = structVol.vol.tostring('F')
        self.CopyImportVoidPointer(data_string, len(data_string))
        del data_string

        # The type of the newly imported data is set to unsigned char (uint8)
        self.SetDataScalarTypeToUnsignedChar()

        # Because the data that is imported only contains an intensity value (it
        # isnt RGB-coded or someting similar), the importer must be told this is
        # the case.
        self.SetNumberOfScalarComponents(1)

        # honestly dont know the difference between SetDataExtent() and
        # SetWholeExtent() although VTK complains if not both are used.

        self.SetDataExtent (0, volExtent[0]-1, 0, volExtent[1]-1, 0, volExtent[2]-1)
        self.SetWholeExtent(0, volExtent[0]-1, 0, volExtent[1]-1, 0, volExtent[2]-1)
        self.SetDataSpacing(volSpacing[0], volSpacing[1], volSpacing[2])
        self.SetDataOrigin (volOrigin[0],  volOrigin[1],  volOrigin[2])



class VTKStructuredPoints():
    def __init__(self, (nx, ny, nz)):
        self.vol=np.zeros( (nx, ny, nz), dtype=np.uint8 )
        self.size=self.vol.shape

    def setOrigin(self, (x, y, z)):\
        self.origin=(x, y, z)

    def setSpacing(self, (sx, sy, sz)):
        self.spacing=(sx, sy, sz)

    def setSlices(self, slideIndexList, sliceArray):
        self.vol[:, :, slideIndexList] = sliceArray

    def prepareVolume(self, indexholderReference):
        # Obligatory (required by vtk):
        self.vol= np.swapaxes(self.vol, 1,0)

    @classmethod
    def loadVolumeDS(cls, arch, origin = (0,0,0), spacing = (1,1,1)):
        result = cls((1, 1, 1))
        result.vol = arch
        result.size = result.vol.shape
        result.origin = origin
        result.spacing = spacing
        return result

"""
