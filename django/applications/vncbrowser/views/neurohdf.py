import json
from django.conf import settings
from django.http import HttpResponse
from vncbrowser.models import CELL_BODY_CHOICES, \
    ClassInstanceClassInstance, Relation, Class, ClassInstance, \
    Project, User, Treenode, TreenodeConnector, Connector, Component,Stack,Drawing
from vncbrowser.views import catmaid_login_required, my_render_to_response, \
    get_form_and_neurons
from vncbrowser.views.export import get_annotation_graph
from django.shortcuts import get_object_or_404
from views import get_treenodes_qs, get_stack_info
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
import cairo
import rsvg
#import vtk
import random
#from bar.rec.pipeline import barPipeline, VTK_PIPELINE

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

DrawingTypes={'mitochondria' : {
                'value' : 300,
                'string' : 'mitochondria',
                'color':[50,50,255]
                },
              'membrane' : {
                  'value' : 400,
                  'string' : 'membrane',
                  'color':[150,50,50]
              },
              'soma' : {
                  'value' : 500,
                  'string' : 'soma',
                  'color':[255,255,0]
              },
              'misc' : {
                  'value' : 600,
                  'string' : 'misc',
                  'color':[255,50,50]
              },
              'erasor' : {
                  'value' : 700,
                  'string' : 'erasor',
                  'color':[255,255,255]
              }}

import time

def get_drawing_enum(request, project_id=None, stack_id=None):
    return HttpResponse(json.dumps(DrawingTypes), mimetype="text/json")

def generate_mesh(request, project_id=None, stack_id=None):
    skeleton_id = int(request.GET['skeleton_id'])

    # retrieve all components for a given skeleton id
    components = Component.objects.filter(
            project = project_id,
            stack = stack_id,
            skeleton_id = skeleton_id
        ).all()

    # retrieve stack information
    stack_info = get_stack_info( project_id, stack_id )

    # compute the skeleton bounding box
    minX, minY = int(stack_info['dimension']['x']), int(stack_info['dimension']['y'])
    maxX, maxY = 0,0
    minZ, maxZ = int(stack_info['dimension']['z']), 0
    for comp in components:
        minX = min(minX, comp.min_x)
        minY = min(minY, comp.min_y)
        minZ = min(minZ, comp.z)
        maxX = max(maxX, comp.max_x)
        maxY = max(maxY, comp.max_y)
        maxZ = max(maxZ, comp.z)

    print 'found bounding box', minX, minY, maxX, maxY, minZ, maxZ

    # create 3d array
    data = np.zeros( (maxY-minY, maxX-minX, maxZ-minZ), dtype = np.uint8 )

    # for all components, retrieve image and bounding box location
    for comp in components:
        print 'work on component', comp.id,  comp.component_id
        img = extract_as_numpy_array( project_id, stack_id, comp.component_id, comp.z ).T
        # store image in array

        height = comp.max_y - comp.min_y + 1
        width = comp.max_x - comp.min_x + 1
        print 'height, width', height, width
        print 'image shape (should match)', img.shape
        try:
            indX = comp.min_x - minX
            indY = comp.min_y - minY
            data[indY:indY+height,indX:indX+width,comp.z] = img
        except:
            pass


    return None



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
    componentIds = retrieve_components_for_location(project_id, stack_id, x, y, z)
    return HttpResponse(json.dumps(componentIds), mimetype="text/json")


def extract_as_numpy_array( project_id, stack_id, id, z):
    """ Extract component to a 2D NumPy array
    """
    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_componenttree.hdf'.format( project_id, stack_id ) )
    z = str(z)

    with closing(h5py.File(fpath, 'r')) as hfile:

        componentPixelStart = hfile['connected_components/'+z+'/begin_indices'].value[id].copy()
        componentPixelEnd = hfile['connected_components/'+z+'/end_indices'].value[id].copy()
        data = hfile['connected_components/'+z+'/pixel_list_0'].value[componentPixelStart:componentPixelEnd].copy()
        componentMinX = hfile['connected_components/'+z+'/min_x'].value[id]
        componentMinY = hfile['connected_components/'+z+'/min_y'].value[id]
        componentMaxX = hfile['connected_components/'+z+'/max_x'].value[id]
        componentMaxY = hfile['connected_components/'+z+'/max_y'].value[id]

        height, width = componentMaxY - componentMinY + 1, componentMaxX - componentMinX + 1

        img = np.zeros( (width,height), dtype=np.uint8)
        img[data['x']-componentMinX,data['y']-componentMinY] = 1

    return img

# TODO: use extract_as_numpy_array and apply color transfer function depending on the skeleton_id
def get_component_image(request, project_id=None, stack_id=None):

    id = int(request.GET.get('id', '-1'))
    z=request.GET.get('z', '-1')
    red=request.GET.get('red','255')
    green=request.GET.get('green','255')
    blue=request.GET.get('blue','255')
    alpha=request.GET.get('alpha','255')

    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_componenttree.hdf'.format( project_id, stack_id ) )
    with closing(h5py.File(fpath, 'r')) as hfile:

        componentPixelStart=hfile['connected_components/'+z+'/begin_indices'].value[id].copy()
        componentPixelEnd=hfile['connected_components/'+z+'/end_indices'].value[id].copy()

        data=hfile['connected_components/'+z+'/pixel_list_0'].value[componentPixelStart:componentPixelEnd].copy()
        threshold=float(hfile['connected_components/'+z+'/values'].value[id].copy())

        componentMinX=hfile['connected_components/'+z+'/min_x'].value[id].copy()
        componentMinY=hfile['connected_components/'+z+'/min_y'].value[id].copy()
        componentMaxX=hfile['connected_components/'+z+'/max_x'].value[id].copy()
        componentMaxY=hfile['connected_components/'+z+'/max_y'].value[id].copy()

        height=(componentMaxY-componentMinY)+1
        width=(componentMaxX-componentMinX)+1


        img = np.zeros( (width,height,4), dtype=np.uint8)
        img[data['x']-componentMinX,data['y']-componentMinY] = (red,green,blue,alpha) # (red, 0, blue, opacity)
        componentImage = Image.fromarray(np.swapaxes(img,0,1))

        response = HttpResponse(mimetype="image/png")
        componentImage.save(response, "PNG")
        return response

    return None

#TODO: in transaction
@catmaid_login_required
def get_saved_drawings_by_component_id(request, project_id=None, stack_id=None, logged_in_user=None):
    # parse request
    component_id = int(request.GET['component_id'])
    skeleton_id = int(request.GET['skeleton_id'])
    z = int(request.GET['z'])

    s = get_object_or_404(ClassInstance, pk=skeleton_id)
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    all_drawings = Drawing.objects.filter(stack=stack,
        project=p,skeleton_id=skeleton_id,
        z = z,component_id=component_id).all()

    drawings={}

    for drawing in all_drawings:
        drawings[int(drawing.id)]=\
            {'id':int(drawing.id),
             'componentId':int(drawing.component_id),
            'minX':int(drawing.min_x),
            'minY':int(drawing.min_y),
            'maxX':int(drawing.max_x),
            'maxY':int(drawing.max_y),
            'type':int(drawing.type),
            'svg':drawing.svg,
            'status':drawing.status,
            'skeletonId':drawing.skeleton_id

        }


    return HttpResponse(json.dumps(drawings), mimetype="text/json")




#TODO: in transaction
@catmaid_login_required
def get_saved_drawings_by_view(request, project_id=None, stack_id=None, logged_in_user=None):
    # parse request
    z = int(request.GET['z'])

    # field of view
    viewX=int(request.GET['x'])
    viewY=int(request.GET['y'])
    viewHeight=int(request.GET['height'])
    viewWidth=int(request.GET['width'])

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # fetch all the components for the given z section
    all_drawings = Drawing.objects.filter(
        project = p,
        stack = stack,
        component_id = None,
        z = z).all()

    drawings={}

    for drawing in all_drawings:
        drawings[int(drawing.id)]=\
            {
            'minX':int(drawing.min_x),
            'minY':int(drawing.min_y),
            'maxX':int(drawing.max_x),
            'maxY':int(drawing.max_y),
            'svg':drawing.svg,
            'status':drawing.status,
            'type':drawing.type,
            'id':drawing.id,
            'componentId':drawing.component_id,
            'skeletonId':drawing.skeleton_id

            }

    return HttpResponse(json.dumps(drawings), mimetype="text/json")

#TODO: in transaction
@catmaid_login_required
def delete_drawing(request, project_id=None, stack_id=None, logged_in_user=None):
    # parse request
    drawingId=request.GET.get('id',None)
    if not drawingId is None:
        all_drawings = Drawing.objects.filter(id=drawingId).all()
        Drawing.delete(all_drawings[0])

    return HttpResponse(json.dumps(True), mimetype="text/json")


#TODO: in transaction
@catmaid_login_required
def put_drawing(request, project_id=None, stack_id=None, logged_in_user=None):
    # parse request
    drawing=json.loads(request.POST['drawing'])
    skeleton_id = request.POST.__getitem__('skeleton_id')
    z = int(request.POST['z'])

    # field of view
    viewX=int(request.POST['x'])
    viewY=int(request.POST['y'])
    viewHeight=int(request.POST['height'])
    viewWidth=int(request.POST['width'])

    viewMaxX=viewX+viewWidth
    ViewMaxY=viewY+viewHeight
    skeleton=None


    if not skeleton_id =='null':
        skeleton=int(skeleton_id)

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)


    new_drawing = Drawing(
            project = p,
            stack = stack,
            user = logged_in_user,
            skeleton_id = skeleton,
            component_id = drawing['componentId'],
            min_x = drawing['minX'],
            min_y = drawing['minY'],
            max_x = drawing['maxX'],
            max_y = drawing['maxY'],
            z = z,
            svg = drawing['svg'],
            type=drawing['type'],
            status = 1
    )
    new_drawing.save()

    return HttpResponse(json.dumps(new_drawing.id), mimetype="text/json")


#TODO: in transaction
@catmaid_login_required
def get_saved_components(request, project_id=None, stack_id=None, logged_in_user=None):

    # parse request
    skeleton_id = int(request.GET['skeleton_id'])
    z = int(request.GET['z'])

    s = get_object_or_404(ClassInstance, pk=skeleton_id)
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # fetch all the components for the given skeleton and z section
    all_components = Component.objects.filter(stack=stack,
    project=p,skeleton_id=skeleton_id,
    z = z).all()

    componentIds={}

    for compData in all_components:
        componentIds[int(compData.component_id)]=\
            {
            'minX':int(compData.min_x),
            'minY':int(compData.min_y),
            'maxX':int(compData.max_x),
            'maxY':int(compData.max_y),
            'threshold':compData.threshold

            }


    return HttpResponse(json.dumps(componentIds), mimetype="text/json")


#TODO: in transaction; separate out creation of a new component in a function

@catmaid_login_required
def put_components(request, project_id=None, stack_id=None, logged_in_user=None):

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
            user = logged_in_user,
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

@catmaid_login_required
def initialize_components_for_skeleton(request, project_id=None, stack_id=None, logged_in_user=None):
    skeleton_id = int(request.POST['skeleton_id'])
    
    # retrieve all treenodes for the given skeleton
    treenodes_qs, labels_qs, labelconnector_qs = get_treenodes_qs( project_id, skeleton_id )
    # retrieve stack information to transform world coordinates to pixel coordinates
    stack_info = get_stack_info( project_id, stack_id )

    skeleton = get_object_or_404(ClassInstance, pk=skeleton_id)
    stack = get_object_or_404(Stack, pk=stack_id)
    project = get_object_or_404(Project, pk=project_id)

    # retrieve all the components belonging to the skeleton
    all_components = Component.objects.filter(
        project = project,
        stack = stack,
        skeleton_id = skeleton.id
    ).all()
    all_component_ids = [comp.component_id for comp in all_components]

    # TODO: some sanity checks, like missing treenodes in a section

    # for each treenode location
    for tn in treenodes_qs:

        x_pixel = int(tn.location.x / stack_info['resolution']['x'])
        y_pixel = int(tn.location.y / stack_info['resolution']['y'])
        z = str( int(tn.location.z / stack_info['resolution']['z']) )

        # select component with lowest threshold value and that contains the pixel value of the location
        component_ids = retrieve_components_for_location(project_id, stack_id, x_pixel, y_pixel, z, limit = 1)

        if not len(component_ids):
            print >> sys.stderr, 'No component found for treenode id', tn.id
            continue
        elif len(component_ids) == 1:
            print >> sys.stderr, 'Exactly one component found for treenode id', tn.id, component_ids
        else:
            print >> sys.stderr, 'More than one component found for treenode id', tn.id, component_ids
            continue

        component_key, component_value = component_ids.items()[0]

        # check if component already exists for this skeleton in the database
        if component_key in all_component_ids:
            print >> sys.stderr, 'Component with id', component_key, ' exists already in the database. Skip it.'
            continue

        # TODO generate default color for all components based on a map of
        # the skeleton id to color space

        # if not, create it
        new_component = Component(
            project = project,
            stack = stack,
            user = logged_in_user,
            skeleton_id = skeleton.id,
            component_id = component_key,
            min_x = component_value['minX'],
            min_y = component_value['minY'],
            max_x = component_value['maxX'],
            max_y = component_value['maxY'],
            z = z,
            threshold = component_value['threshold'],
            status = 5 # means automatically selected component
        )
        new_component.save()

    return HttpResponse(json.dumps({'status': 'success'}), mimetype="text/json")

import sys

def create_segmentation_file(request, project_id=None, stack_id=None):

    skeleton_id = request.POST.get('skeleton_id', None)

    if skeleton_id != 'null':
        skeleton_id = int(skeleton_id)
    else:
        skeleton_id = None

    create_segmentation_neurohdf_file(project_id,stack_id,skeleton_id)

    return HttpResponse(json.dumps(True), mimetype="text/json")


def create_segmentation_neurohdf_file(project_id, stack_id, skeleton_id=None):


    filename=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_segmentation.hdf'.format( project_id, stack_id ) )
    componentTreeFilePath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_componenttree.hdf'.format( project_id, stack_id ) )

    with closing(h5py.File(filename, 'w')) as hfile:
        hfile.attrs['neurohdf_version'] = '0.1'
        scaleGroup = hfile.create_group("scale")
        scale_zero = scaleGroup.create_group("0")
        sectionGroup = scale_zero.create_group("section")

        # retrieve stack information to transform world coordinates to pixel coordinates
        stack_info = get_stack_info( project_id, stack_id )

        width=stack_info['dimension']['x']
        height=stack_info['dimension']['x']

        if not skeleton_id is None:
            skeleton = get_object_or_404(ClassInstance, pk=skeleton_id)

        stack = get_object_or_404(Stack, pk=stack_id)
        project = get_object_or_404(Project, pk=project_id)

        whitelist = range( int(stack_info['dimension']['z']) )
        [whitelist.remove( int(k) ) for k,v in stack_info['broken_slices'].items()]

        for z in whitelist:
            section = sectionGroup.create_group(str(z))

            shape=(height,width)

            componentIdsPixelArray=np.zeros(shape, dtype=np.long)
            skeletonIdsPixelArray=np.zeros(shape, dtype=np.long)
            componentDrawingIdsPixelArray=np.zeros(shape, dtype=np.long)

            if not skeleton_id is None:

                # retrieve all the components belonging to the skeleton
                all_components = Component.objects.filter(
                    project = project,
                    stack = stack,
                    skeleton_id = skeleton.id,
                    z=z
                ).all()
                for comp in all_components:

                    with closing(h5py.File(componentTreeFilePath, 'r')) as componenthfile:
                        componentPixelStart=componenthfile['connected_components/'+str(z)+'/begin_indices'].value[comp.component_id].copy()
                        componentPixelEnd=componenthfile['connected_components/'+str(z)+'/end_indices'].value[comp.component_id].copy()

                        data=componenthfile['connected_components/'+str(z)+'/pixel_list_0'].value[componentPixelStart:componentPixelEnd].copy()
                        skeletonIdsPixelArray[data['y'],data['x']] =comp.skeleton_id
                        componentIdsPixelArray[data['y'],data['x']] =comp.component_id

                #Get all drawings belonging to this skeleton
                all_drawings = Drawing.objects.filter(stack=stack,
                    project=project,
                    z = z, skeleton_id = skeleton.id).exclude(component_id__isnull=True).all()
                for componentDrawing in all_drawings:

                    drawingArray = svg2pixel(componentDrawing,componentDrawing.id)
                    indices=np.where(drawingArray>0)
                    x_index = indices[0]+(componentDrawing.min_x-50)
                    y_index = indices[1]+(componentDrawing.min_y-50)
                    idx = (x_index >= 0) & (x_index < width) & (y_index >= 0) & (y_index < height)
                    componentDrawingIdsPixelArray[y_index[idx],x_index[idx]]=componentDrawing.id

            #store arrays to hdf file
            section.create_dataset("components", data=componentIdsPixelArray, compression='gzip', compression_opts=1)
            section.create_dataset("skeletons", data=skeletonIdsPixelArray, compression='gzip', compression_opts=1)
            section.create_dataset("component_drawings", data=componentDrawingIdsPixelArray, compression='gzip', compression_opts=1)

            #generate arrays
            drawingTypeArrays={}
            for drawingType in DrawingTypes:
                drawingTypeArrays[DrawingTypes[drawingType]['value']]=np.zeros(shape, dtype=np.long)

            #Get all drawings without skeleton id
            all_free_drawings = Drawing.objects.filter(stack=stack,
                project=project,
                z = z).exclude(component_id__isnull=False).all()

            for freeDrawing in all_free_drawings:
                drawingArray = svg2pixel(freeDrawing,freeDrawing.id)
                indices=np.where(drawingArray>0)

                x_index = indices[1]+(freeDrawing.min_x-50)
                y_index = indices[0]+(freeDrawing.min_y-50)
                idx = (x_index >= 0) & (x_index < width) & (y_index >= 0) & (y_index < height)

                #Use number from JS canvas tool enum
                drawingTypeArrays[freeDrawing.type][y_index[idx],x_index[idx]]=freeDrawing.id

            #store arrays to hdf file
            for drawingArrayId in drawingTypeArrays:
                match=None
                for drawingType in DrawingTypes:
                    if DrawingTypes[drawingType]['value']==drawingArrayId:
                        match=drawingType
                        break
                section.create_dataset(match, data=drawingTypeArrays[drawingArrayId], compression='gzip', compression_opts=1)

    return



def svg2pixel(drawing, id, maxwidth=0, maxheight=0):
    #Converts drawings into pixel array. Be careful,50px offset are added to the drawing!!!

    nopos=find_between(drawing.svg,">","transform=")+'transform="translate(50 50)" />'
    data='<svg>'+nopos+'</svg>'

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

    with closing(h5py.File(fpath, 'r')) as hfile:

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
    
    #print 'exists', os.path.exists(fpath)
    
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

def get_skeleton_as_dataarray(project_id=None, skeleton_id=None):
    # retrieve all treenodes for a given skeleton

    if skeleton_id is None:
        qs = Treenode.objects.filter(
            project=project_id).order_by('id')
    else:
        qs = Treenode.objects.filter(
            skeleton=skeleton_id,
            project=project_id).order_by('id')

    treenode_count = qs.count()
    treenode_xyz = np.zeros( (treenode_count, 3), dtype = np.float32 )
    treenode_parentid = np.zeros( (treenode_count,), dtype = np.uint32 )
    treenode_id = np.zeros( (treenode_count,), dtype = np.uint32 )
    treenode_radius = np.zeros( (treenode_count,), dtype = np.int32 )
    treenode_confidence = np.zeros( (treenode_count,), dtype = np.uint32 )
    treenode_userid = np.zeros( (treenode_count,), dtype = np.uint32 )
    treenode_type = np.zeros( (treenode_count,), dtype = np.uint32 )
    treenode_skeletonid = np.zeros( (treenode_count,), dtype = np.uint32 )
    treenode_creationtime = np.zeros( (treenode_count,), dtype = np.uint32 )
    treenode_modificationtime = np.zeros( (treenode_count,), dtype = np.uint32 )
    
    treenode_connectivity = np.zeros( (treenode_count, 2), dtype = np.uint32 )
    treenode_connectivity_type = np.zeros( (treenode_count,), dtype = np.uint32 )
    treenode_connectivity_skeletonid = np.zeros( (treenode_count,), dtype = np.uint32 )

    row_count = 0
    parents = 0
    for i,tn in enumerate(qs):
        treenode_xyz[i,0] = tn.location.x
        treenode_xyz[i,1] = tn.location.y
        treenode_xyz[i,2] = tn.location.z
        treenode_id[i] = tn.id
        treenode_radius[i] = tn.radius
        treenode_confidence[i] = tn.confidence
        treenode_userid[i] = tn.user_id
        treenode_skeletonid[i] = tn.skeleton_id
        treenode_creationtime[i] = int(time.mktime(tn.creation_time.timetuple()))
        treenode_modificationtime[i] = int(time.mktime(tn.edition_time
        .timetuple()))

        if not tn.parent_id is None:
            treenode_parentid[i] = tn.parent_id
            treenode_type[i] = VerticesTypeSkeletonNode['id']

            # only here save it and increment the row_count
            treenode_connectivity_type[row_count] = ConnectivityNeurite['id']
            treenode_connectivity_skeletonid[row_count] = treenode_skeletonid[i]
            treenode_connectivity[row_count,0] = treenode_id[i]
            treenode_connectivity[row_count,1] = treenode_parentid[i]
            row_count += 1

        else:
            treenode_type[i] = VerticesTypeSkeletonRootNode['id']
            parents+=1

    # correct for too many rows because of empty root relationship
    treenode_connectivity = treenode_connectivity[:-parents,:]
    treenode_connectivity_type = treenode_connectivity_type[:-parents]
    treenode_connectivity_skeletonid = treenode_connectivity_skeletonid[:-parents]

    if skeleton_id is None:
        qs_tc = TreenodeConnector.objects.filter(
            project=project_id,
            relation__relation_name__endswith = 'synaptic_to',
        ).select_related('treenode', 'connector', 'relation')
    else:
        qs_tc = TreenodeConnector.objects.filter(
            project=project_id,
            skeleton=skeleton_id,
            relation__relation_name__endswith = 'synaptic_to',
        ).select_related('connector', 'relation__relation_name')

    treenode_connector_connectivity=[]; treenode_connector_connectivity_type=[]
    cn_type=[]; cn_xyz=[]; cn_id=[]; cn_confidence=[]; cn_userid=[]; cn_radius=[]; cn_skeletonid=[]
    cn_skeletonid_connector=[]; cn_creationtime=[]; cn_modificationtime=[]
    # because skeletons with a single treenode might have no connectivity
    # (no parent and no synaptic connection), but we still want to recover their skeleton id, we need
    # to store the skeletonid as a property on the vertices too, with default value 0 for connectors
    found_synapse=False
    for tc in qs_tc:
        if tc.relation.relation_name == 'presynaptic_to':
            treenode_connector_connectivity_type.append( ConnectivityPresynaptic['id'] )
            found_synapse=True
        elif tc.relation.relation_name == 'postsynaptic_to':
            treenode_connector_connectivity_type.append( ConnectivityPostsynaptic['id'] )
            found_synapse=True
        else:
            print >> std.err, "non-synaptic relation found: ", tc.relation.relation_name
            continue
        treenode_connector_connectivity.append( [tc.treenode_id,tc.connector_id] ) # !!!
        # also need other connector node information
        cn_xyz.append( [tc.connector.location.x, tc.connector.location.y, tc.connector.location.z] )
        cn_id.append( tc.connector_id )
        cn_confidence.append( tc.connector.confidence )
        cn_userid.append( tc.connector.user_id )
        cn_radius.append( 0 ) # default because no radius for connector
        cn_skeletonid_connector.append( 0 ) # default skeleton id for connector
        cn_type.append( VerticesTypeConnectorNode['id'] )
        cn_skeletonid.append( tc.skeleton_id )
        cn_creationtime.append( int(time.mktime(tc.connector.creation_time
        .timetuple())) )
        cn_modificationtime.append( int(time.mktime(tc.connector.edition_time
        .timetuple())) )

    data = {'vert':{},'conn':{}}
    # check if we have synaptic connectivity at all
    if found_synapse:
        data['vert'] = {
            'id': np.hstack((treenode_id.T, np.array(cn_id, dtype=np.uint32))),
            'location': np.vstack((treenode_xyz, np.array(cn_xyz, dtype=np.uint32))),
            'type': np.hstack((treenode_type, np.array(cn_type, dtype=np.uint32).ravel() )),
            'confidence': np.hstack((treenode_confidence, np.array(cn_confidence, dtype=np.uint32).ravel() )),
            'userid': np.hstack((treenode_userid, np.array(cn_userid, dtype=np.uint32).ravel() )),
            'radius': np.hstack((treenode_radius, np.array(cn_radius, dtype=np.int32).ravel() )),
            'skeletonid': np.hstack((treenode_skeletonid,
                                     np.array(cn_skeletonid_connector, dtype=np.int32).ravel() )),
            'creation_time': np.hstack((treenode_creationtime,
                                     np.array(cn_creationtime,
                                              dtype=np.int32).ravel())),
            'modification_time': np.hstack((treenode_modificationtime,
                                     np.array(cn_modificationtime,
                                              dtype=np.int32).ravel())),
            }
        data['conn'] = {
            'id': np.vstack((treenode_connectivity, np.array(treenode_connector_connectivity, dtype=np.uint32)) ),
            'type': np.hstack((treenode_connectivity_type,
                               np.array(treenode_connector_connectivity_type, dtype=np.uint32).ravel() )),
            'skeletonid': np.hstack((treenode_connectivity_skeletonid.T,
                               np.array(cn_skeletonid, dtype=np.uint32).ravel() ) )
        }

    else:
        data['vert'] = {
            'id': treenode_id,
            'location': treenode_xyz,
            'type': treenode_type,
            'confidence': treenode_confidence,
            'userid': treenode_userid,
            'radius': treenode_radius,
            'skeletonid': treenode_skeletonid,
            'creation_time': treenode_creationtime,
            'modification_time': treenode_modificationtime
        }
        data['conn'] = {
            'id': treenode_connectivity,
            'type': treenode_connectivity_type,
            'skeletonid': treenode_connectivity_skeletonid
        }
        # no connprop type

    # add metadata field with mapping from skeleton id to names of the hierarchy
    g = get_annotation_graph( project_id )
    skeletonmap={}
    if skeleton_id is None:
        allskeletonids = [nid for nid,di in g.nodes_iter(data=True) if di['class']=='skeleton']
    else:
        allskeletonids = [skeleton_id]
    rid = [nid for nid,di in g.nodes_iter(data=True) if di['class']=='root']
    maxiter = 10
    for id in allskeletonids:
        outstr = ''
        iterat = 0
        currid = [id]
        while currid[0] != rid[0] and iterat < maxiter:
            currid = g.predecessors(currid[0])
            outstr = g.node[currid[0]]['name']+'|'+outstr
            iterat+=1
        skeletonmap[id] = outstr.rstrip('|')
    data['meta'] = skeletonmap
    return data

def get_temporary_neurohdf_filename_and_url():
    fname = ''.join([choice('abcdefghijklmnopqrstuvwxyz0123456789(-_=+)') for i in range(50)])
    hdf_path = os.path.join(settings.STATICFILES_LOCAL, settings.STATICFILES_HDF5_SUBDIRECTORY)
    if not os.path.exists( hdf_path ):
        raise Exception('Need to configure writable path STATICFILES_HDF5_SUBDIRECTORY in settings_apache.py')
    filename = os.path.join('%s.h5' % fname)
    host = settings.CATMAID_DJANGO_URL.lstrip('http://').split('/')[0]
    return os.path.join(hdf_path, filename), "http://{0}{1}".format( host, os.path.join(settings.STATICFILES_URL,
        settings.STATICFILES_HDF5_SUBDIRECTORY, filename) )



def create_neurohdf_file(filename, data):

    with closing(h5py.File(filename, 'w')) as hfile:
        hfile.attrs['neurohdf_version'] = '0.1'
        mcgroup = hfile.create_group("Microcircuit")
        mcgroup.attrs['node_type'] = 'irregular_dataset'
        vert = mcgroup.create_group("vertices")
        conn = mcgroup.create_group("connectivity")

        vert.create_dataset("id", data=data['vert']['id'])
        vert.create_dataset("location", data=data['vert']['location'])
        verttype=vert.create_dataset("type", data=data['vert']['type'])
        # create rec array with two columns, value and name
        my_dtype = np.dtype([('value', 'l'), ('name', h5py.new_vlen(str))])
        helpdict={VerticesTypeSkeletonRootNode['id']: VerticesTypeSkeletonRootNode['name'],
                  VerticesTypeSkeletonNode['id']: VerticesTypeSkeletonNode['name'],
                  VerticesTypeConnectorNode['id']: VerticesTypeConnectorNode['name']
        }
        arr=np.recarray( len(helpdict), dtype=my_dtype )
        for i,kv in enumerate(helpdict.items()):
            arr[i][0] = kv[0]
            arr[i][1] = kv[1]
        verttype.attrs['value_name']=arr

        vert.create_dataset("confidence", data=data['vert']['confidence'])
        vert.create_dataset("userid", data=data['vert']['userid'])
        vert.create_dataset("radius", data=data['vert']['radius'])
        vert.create_dataset("skeletonid", data=data['vert']['skeletonid'])
        vert.create_dataset("creation_time", data=data['vert']['creation_time'])
        vert.create_dataset("modification_time", data=data['vert']['modification_time'])

        conn.create_dataset("id", data=data['conn']['id'])
        if data['conn'].has_key('type'):
            conntype=conn.create_dataset("type", data=data['conn']['type'])
            helpdict={ConnectivityNeurite['id']: ConnectivityNeurite['name'],
                      ConnectivityPresynaptic['id']: ConnectivityPresynaptic['name'],
                      ConnectivityPostsynaptic['id']: ConnectivityPostsynaptic['name']
            }
            arr=np.recarray( len(helpdict), dtype=my_dtype )
            for i,kv in enumerate(helpdict.items()):
                arr[i][0] = kv[0]
                arr[i][1] = kv[1]
            conntype.attrs['value_name']=arr

        if data['conn'].has_key('skeletonid'):
            conn.create_dataset("skeletonid", data=data['conn']['skeletonid'])

        if data.has_key('meta'):
            metadata=mcgroup.create_group('metadata')
            # create recarray with two columns, skeletonid and string
            my_dtype = np.dtype([('skeletonid', 'l'), ('name', h5py.new_vlen(str))])
            arr=np.recarray( len(data['meta']), dtype=my_dtype )
            for i,kv in enumerate(data['meta'].items()):
                arr[i][0] = kv[0]
                arr[i][1] = kv[1]

            metadata.create_dataset('skeleton_name', data=arr )

@catmaid_login_required
def microcircuit_neurohdf(request, project_id=None, logged_in_user=None):
    """ Export the complete microcircuit connectivity to NeuroHDF
    """
    data=get_skeleton_as_dataarray(project_id)
    neurohdf_filename,neurohdf_url=get_temporary_neurohdf_filename_and_url()
    create_neurohdf_file(neurohdf_filename, data)
    result = {
        'format': 'NeuroHDF',
        'format_version': 0.1,
        'url': neurohdf_url
    }
    return HttpResponse(json.dumps(result), mimetype="text/plain")

@catmaid_login_required
def skeleton_neurohdf(request, project_id=None, skeleton_id=None, logged_in_user=None):
    """ Generate the NeuroHDF on the local file system with a long hash
    that is sent back to the user and which can be used (not-logged in) to
    retrieve the file from the not-listed static folder
    """
    data=get_skeleton_as_dataarray(project_id, skeleton_id)
    neurohdf_filename,neurohdf_url=get_temporary_neurohdf_filename_and_url()
    create_neurohdf_file(neurohdf_filename, data)
    result = {
        'format': 'NeuroHDF',
        'format_version': 0.1,
        'url': neurohdf_url
    }
    return HttpResponse(json.dumps(result), mimetype="text/json")

@catmaid_login_required
def stack_models(request, project_id=None, stack_id=None, logged_in_user=None):
    """ Retrieve Mesh models for a stack
    """
    d={}
    filename=os.path.join(settings.HDF5_STORAGE_PATH, '%s_%s.hdf' %(project_id, stack_id) )
    if not os.path.exists(filename):
        return HttpResponse(json.dumps(d), mimetype="text/json")
    with closing(h5py.File(filename, 'r')) as hfile:
        meshnames=hfile['meshes'].keys()
        for name in meshnames:
            vertlist=hfile['meshes'][name]['vertices'].value.tolist()
            facelist= hfile['meshes'][name]['faces'].value.tolist()
            d[str(name)] = {
                 'metadata': {
                      'colors': 0,
                      'faces': 2,
                      'formatVersion': 3,
                      'generatedBy': 'NeuroHDF',
                      'materials': 0,
                      'morphTargets': 0,
                      'normals': 0,
                      'uvs': 0,
                      'vertices': 4},
                 'morphTargets': [],
                 'normals': [],
                 'scale': 1.0,
                 'uvs': [[]],
                 'vertices': vertlist,
                 'faces': facelist,
                 'materials': [],
                 'colors': []
                }
    return HttpResponse(json.dumps(d), mimetype="text/json")
