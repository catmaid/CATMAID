import datetime
import json
from django.conf import settings
from django.http import HttpResponse
from vncbrowser.models import CELL_BODY_CHOICES, \
    ClassInstanceClassInstance, Relation, Class, ClassInstance, \
    Project, User, Treenode, TreenodeConnector, Connector, Component,Stack
from vncbrowser.views import catmaid_login_required, my_render_to_response, \
    get_form_and_neurons
from vncbrowser.views.export import get_annotation_graph
from django.shortcuts import get_object_or_404


try:
    import numpy as np
    import h5py
    from PIL import Image
except ImportError:
    pass

from contextlib import closing
from random import choice
import os
import sys
import base64, cStringIO
import time

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


def get_component_list_for_point(request,project_id=None,stack_id=None):
    #Generates a JSON List with all intersecting components in a given point

    """

    """
    scale = float(request.GET.get('scale', '0'))
    x = int(request.GET.get('x', '0'))
    y = int(request.GET.get('y', '0'))
    z = str(request.GET.get('z', '0'))

    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_componenttree.hdf'.format( project_id, stack_id ) )

    componentIds={}

    with closing(h5py.File(fpath, 'r')) as hfile:

        image_data=hfile['connected_components/'+z+'/pixel_list_ids']
        componentMinX=hfile['connected_components/'+z+'/min_x']
        componentMinY=hfile['connected_components/'+z+'/min_y']
        componentMaxX=hfile['connected_components/'+z+'/max_x']
        componentMaxY=hfile['connected_components/'+z+'/max_y']
        thresholdTable=hfile['connected_components/'+z+'/values']



        length=image_data.len()

        #Merge all data into single array
        #TODO:ID instead of length
        merge=np.dstack((np.arange(length),componentMinX.value,componentMinY.value,componentMaxX.value,componentMaxY.value,thresholdTable.value))

        selectionMinXMaxXMinYMaxY=None

        selectionMinX = merge[merge[...,1]<=x]
        if len(selectionMinX):
            selectionMinXMaxX = selectionMinX[selectionMinX[...,3]>=x]
            if len(selectionMinXMaxX):
                selectionMinXMaxXMinY = selectionMinXMaxX[selectionMinXMaxX[...,2]<=y]
                if len(selectionMinXMaxXMinY):
                    selectionMinXMaxXMinYMaxY = selectionMinXMaxXMinY[selectionMinXMaxXMinY[...,4]>=y]

        if selectionMinXMaxXMinYMaxY is not None:


            #Generate JSON
            for row in selectionMinXMaxXMinYMaxY:
                componentPixelStart=hfile['connected_components/'+z+'/begin_indices'].value[row[0]].copy()
                componentPixelEnd=hfile['connected_components/'+z+'/end_indices'].value[row[0]].copy()
                data=hfile['connected_components/'+z+'/pixel_list_0'].value[componentPixelStart:componentPixelEnd].copy()

                if not len(np.where((data['x'] == x) & (data['y'] == y))[0]):
                    continue

                componentIds[int(row[0])]=\
                    {
                    'minX':int(row[1]),
                    'minY':int(row[2]),
                    'maxX':int(row[3]),
                    'maxY':int(row[4]),
                    'threshold':row[5]

                }


    return HttpResponse(json.dumps(componentIds), mimetype="text/json")


def get_component_list_for_rectangle(request,project_id=None,stack_id=None):
    #Get all components for a defined view area

    scale = float(request.GET.get('scale', '0'))
    height = int(request.GET.get('height', '0'))
    width = int(request.GET.get('width', '0'))
    x = int(request.GET.get('x', '0'))
    y = int(request.GET.get('y', '0'))
    z = int(request.GET.get('z', '0'))

    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_componenttree.hdf'.format( project_id, stack_id ) )

    componentIds={}

    with closing(h5py.File(fpath, 'r')) as hfile:

        image_data=hfile['connected_components/pixel_list_ids']


        #versuch
        componentMinX=hfile['connected_components/min_x']
        componentMinY=hfile['connected_components/min_y']
        componentMaxX=hfile['connected_components/max_x']
        componentMaxY=hfile["connected_components/max_y"]
        thresholdTable=hfile['connected_components/values']

        selectionMinXMinY=np.empty(6)
        selectionMinXMaxY=np.empty(6)
        selectionMaxXMinY=np.empty(6)
        selectionMaxXMaxY=np.empty(6)

        length=image_data.len()

        #Merge all data into one big array
        merge=np.dstack((np.arange(length),componentMinX.value,componentMinY.value,componentMaxX.value,componentMaxY.value,thresholdTable.value))

        #components with minX in scope
        selectionMinX = merge[merge[...,1]>=x]
        if selectionMinX.shape[0]>0:
            selectionMinX = selectionMinX[selectionMinX[...,1]<=x+width]
            if selectionMinX.shape[0]>0:
                #components with minX and minY in scope
                selectionMinXMinY = selectionMinX[selectionMinX[...,2]>=y]
                if selectionMinXMinY.shape[0]>0:
                    selectionMinXMinY = selectionMinXMinY[selectionMinXMinY[...,2]<=y+height]

                #components with minX and maxY in scope
                selectionMinXMaxY=selectionMinX[selectionMinX[...,4]>=y]
                if selectionMinXMaxY.shape[0]>0:
                    selectionMinXMaxY=selectionMinXMaxY[selectionMinXMaxY[...,4]<=y+height]

        #components with maxX in scope
        selectionMaxX = merge[merge[...,3]>=x]
        if selectionMaxX.shape[0]>0:
            selectionMaxX = selectionMaxX[selectionMaxX[...,3]<=x+width]
            if selectionMaxX.shape[0]>0:
                #components with maxX and minY in scope
                selectionMaxXMinY = selectionMaxX[selectionMaxX[...,2]>=y]
                if selectionMaxXMinY.shape[0]>0:
                    selectionMaxXMinY = selectionMaxXMinY[selectionMaxXMinY[...,2]<=y+height]

                #components with maxX and maxY in scope
                selectionMaxXMaxY=selectionMaxX[selectionMaxX[...,4]>=y]
                if selectionMaxXMaxY.shape[0]>0:
                    selectionMaxXMaxY=selectionMaxXMaxY[selectionMaxXMaxY[...,4]<=y+height]

        #Merge all result sets
        mergedResults=np.vstack((selectionMinXMinY,selectionMinXMaxY,selectionMaxXMinY,selectionMaxXMaxY))

        #Generate JSON
        for row in mergedResults:
            componentIds[int(row[0])]=\
                {
                'minX':int(row[1]),
                'minY':int(row[2]),
                'maxX':int(row[3]),
                'maxY':int(row[4]),
                'threshold':row[5]

            }

    return HttpResponse(json.dumps(componentIds), mimetype="text/json")

def get_component_layer_image(request, project_id=None, stack_id=None):
    # Generates an image consisting of all components of the id list in the given view rectangle

    id_List=json.loads(request.GET['id_list'])
    scale = float(request.GET.get('scale', '0'))
    height = int(request.GET.get('height', '0'))
    width = int(request.GET.get('width', '0'))
    x = int(request.GET.get('x', '0'))
    y = int(request.GET.get('y', '0'))
    z = int(request.GET.get('z', '0'))

    allComponents=None


    fpath=os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_componenttree.hdf'.format( project_id, stack_id ) )

    with closing(h5py.File(fpath, 'r')) as hfile:
        for id in id_List:
            componentPixelStart=hfile['connected_components/begin_indices'].value[int(id)].copy()
            componentPixelEnd=hfile['connected_components/end_indices'].value[int(id)].copy()
            data=hfile['connected_components/pixel_list_0'].value[componentPixelStart:componentPixelEnd].copy()
            data2=np.array([(data['x']),(data['y'])], np.int, ndmin=2)
            if allComponents is not None:
                allComponents=np.hstack((allComponents,data2))
            else:
                allComponents=data2.copy()

        componentImage = Image.new('RGBA', (width, height), (0, 0, 0, 0)) # Create a blank image
        pixelarrray=componentImage.load()

        red=255
        blue=255
        opacity=255
        data2=np.array([(allComponents['x']),(allComponents['y'])], np.int, ndmin=2)
        pix = (red, 0, blue, opacity)

        for i in xrange(data2.shape[-1]):
            pixelarrray[int(data2[0][i]),int(data2[1][i])] = pix

        response = HttpResponse(mimetype="image/png")
        componentImage.save(response, "PNG")
        return response



    return None



def get_component_image(request, project_id=None, stack_id=None):

    id = int(request.GET.get('id', '-1'))
    scale = float(request.GET.get('scale', '0'))
    z=request.GET.get('z', '-1')

    hdf5_path = request.GET.get('hdf5_path', '/')
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

        red=0+int(threshold*255)
        green=255-(threshold*255)
        blue=0
        opacity=255

        img = np.zeros( (width,height,4), dtype=np.uint8)
        img[data['x']-componentMinX,data['y']-componentMinY] = (red,green,blue,opacity) # (red, 0, blue, opacity)
        componentImage = Image.fromarray(np.swapaxes(img,0,1))

        response = HttpResponse(mimetype="image/png")
        componentImage.save(response, "PNG")
        return response


    return None


#TODO: in transaction
@catmaid_login_required
def get_saved_components(request, project_id=None, stack_id=None, logged_in_user=None):

    # parse request
    skeleton_id = int(request.POST['skeleton_id'])
    z = int(request.POST['z'])

    s = get_object_or_404(ClassInstance, pk=skeleton_id)
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # fetch all the components for the given skeleton and z section
    all_components = Component.objects.filter(stack=stack,
    project=p,skeleton_id=skeleton_id,
    z = z).all()

    componentIds=[]

    for compData in all_components:
        componentIds[int(compData.component_id)]=\
            {
            'minX':int(compData. min_x),
            'minY':int(compData.min_y),
            'maxX':int(compData.max_x),
            'maxY':int(compData.max_y),
            'threshold':compData.threshold

            }


    return HttpResponse(json.dumps(componentIds), mimetype="text/json")


#TODO: in transaction
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
        project=p,stack=stack,skeleton_id=skeleton_id,
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
            user=logged_in_user,
            project = p,
            skeleton_id = s.id,
            stack=stack,
            component_id=comp['id'],
            min_x=comp['minX'],
            min_y=comp['minY'],
            max_x=comp['maxX'],
            max_y=comp['maxY'],
            z=z,
            threshold=comp['threshold'],
            status=1
            )
        new_component.save()
        activeComponentIds.insert(activeComponentIds.__sizeof__(),comp['id'])

        # delete components that were deselected
    for compDatabse in all_components:
        if not activeComponentIds.count(str(compDatabse.component_id)):
            Component.delete(compDatabse)

    return HttpResponse(json.dumps(True), mimetype="text/json")


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
