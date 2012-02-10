from django.conf import settings
from django.http import HttpResponse
from vncbrowser.models import CELL_BODY_CHOICES, \
    ClassInstanceClassInstance, Relation, Class, ClassInstance, \
    Project, User, Treenode, TreenodeConnector, Connector
from vncbrowser.views import catmaid_login_required, my_render_to_response, \
    get_form_and_neurons
import json
try:
    import numpy as np
    import h5py
except ImportError:
    pass
from contextlib import closing
from random import choice
import os
import sys

# This file defines constants used to correctly define the metadata for NeuroHDF microcircuit data

VerticesTypeSkeletonNode = {
    'name': 'skeleton',
    'id': 1
}

VerticesTypeSkeletonRootNode = {
    'name': 'skeleton root',
    'id': 1
}

VerticesTypeConnectorNode = {
    'name': 'connector',
    'id': 1
}

ConnectivityNeurite = {
    'name': 'neurite',
    'id': 1
}

ConnectivityPresynaptic = {
    'name': 'presynaptic',
    'id': 2
}

ConnectivityPostsynaptic = {
    'name': 'postsynaptic',
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
        cn_type.append( VerticesTypeConnectorNode['id'] )
        cn_skeletonid.append( tc.skeleton_id )

    data = {'vert':{},'conn':{}}
    # check if we have synaptic connectivity at all
    if found_synapse:
        data['vert'] = {
            'id': np.hstack((treenode_id.T, np.array(cn_id, dtype=np.uint32))),
            'location': np.vstack((treenode_xyz, np.array(cn_xyz, dtype=np.uint32))),
            'type': np.hstack((treenode_type, np.array(cn_type, dtype=np.uint32).ravel() )),
            'confidence': np.hstack((treenode_confidence, np.array(cn_confidence, dtype=np.uint32).ravel() )),
            'userid': np.hstack((treenode_userid, np.array(cn_userid, dtype=np.uint32).ravel() )),
            'radius': np.hstack((treenode_radius, np.array(cn_radius, dtype=np.int32).ravel() ))
        }
       # print np.array(cn_skeletonid, dtype=np.uint32)
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
            'radius': treenode_radius
        }
        data['conn'] = {
            'id': treenode_connectivity,
            'type': treenode_connectivity_type,
            'skeletonid': treenode_connectivity_skeletonid
        }
        # no connprop type
    return data

def get_temporary_neurohdf_filename_and_url():
    fname = ''.join([choice('abcdefghijklmnopqrstuvwxyz0123456789(-_=+)') for i in range(50)])
    if not os.path.exists(os.path.join(settings.STATICFILES_LOCAL, 'neurohdf')):
        os.mkdir(os.path.join(settings.STATICFILES_LOCAL, 'neurohdf'))
    filepath = os.path.join('neurohdf', '%s.h5' % fname)
    return os.path.join(settings.STATICFILES_LOCAL, filepath), os.path.join(settings.STATICFILES_URL, filepath)

def create_neurohdf_file(filename, data):

    with closing(h5py.File(filename, 'w')) as hfile:
        mcgroup = hfile.create_group("Microcircuit")
        vert = mcgroup.create_group("vertices")
        conn = mcgroup.create_group("connectivity")

        vert.create_dataset("id", data=data['vert']['id'])
        vert.create_dataset("location", data=data['vert']['location'])
        vert.create_dataset("type", data=data['vert']['type'])
        vert.create_dataset("confidence", data=data['vert']['confidence'])
        vert.create_dataset("userid", data=data['vert']['userid'])
        vert.create_dataset("radius", data=data['vert']['radius'])

        conn.create_dataset("id", data=data['conn']['id'])
        if data['conn'].has_key('type'):
            conn.create_dataset("type", data=data['conn']['type'])
        if data['conn'].has_key('skeletonid'):
            conn.create_dataset("skeletonid", data=data['conn']['skeletonid'])

        # TODO: add metadata fields!
        # connproperties["type"].attrs["content_value_1_name"] = "presynaptic"
        # content_type = "categorial
        # content_value = [0, 1, 2, 3]
        # content_name = ["blab", "blubb", ...]

@catmaid_login_required
def microcircuit_neurohdf(request, project_id=None, logged_in_user=None):
    """ Export the complete microcircuit connectivity to NeuroHDF
    """
    data=get_skeleton_as_dataarray(project_id)
    neurohdf_filename,neurohdf_url=get_temporary_neurohdf_filename_and_url()
    create_neurohdf_file(neurohdf_filename, data)

    print >> sys.stderr, neurohdf_filename,neurohdf_url
    result = {
        'format': 'NeuroHDF',
        'format_version': 1.0,
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

    print >> sys.stderr, neurohdf_filename,neurohdf_url
    result = {
        'format': 'NeuroHDF',
        'format_version': 1.0,
        'url': neurohdf_url
    }
    return HttpResponse(json.dumps(result), mimetype="text/json")

@catmaid_login_required
def stack_models(request, project_id=None, stack_id=None, logged_in_user=None):
    """ Retrieve Mesh models for a stack
    """
    d={}
    filename=os.path.join(settings.HDF5_STORAGE_PATH, '%s_%s.hdf' %(project_id, stack_id) )
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
