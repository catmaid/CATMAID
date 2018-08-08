# -*- coding: utf-8 -*-
import json
import time

from django.conf import settings
from django.http import HttpResponse

from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *

from catmaid.control.object import get_annotation_graph
from catmaid.control.skeletonexport import get_treenodes_qs

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
        ).select_related('connector', 'relation')

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
            print("non-synaptic relation found: ", tc.relation.relation_name, file=sys.stderr)
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
    hdf_path = os.path.join(settings.MEDIA_ROOT, settings.MEDIA_HDF5_SUBDIRECTORY)
    if not os.path.exists( hdf_path ):
        raise Exception('Need to configure writable path MEDIA_HDF5_SUBDIRECTORY in settings.py')
    filename = os.path.join('%s.h5' % fname)
    host = settings.CATMAID_URL.lstrip('http://').split('/')[0]
    return os.path.join(hdf_path, filename), "http://{0}{1}".format( host, os.path.join(settings.MEDIA_URL,
        settings.MEDIA_HDF5_SUBDIRECTORY, filename) )



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


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def microcircuit_neurohdf(request, project_id=None):
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
    return HttpResponse(json.dumps(result), content_type="text/plain")


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeleton_neurohdf(request, project_id=None, skeleton_id=None):
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
    return HttpResponse(json.dumps(result), content_type="application/json")
