import json

from django.http import HttpResponse
from django.db.models import Count

from catmaid.models import Project, Stack, Class, ClassInstance,\
    TreenodeClassInstance, ConnectorClassInstance, Relation, Treenode,\
    Connector, User, Textlabel

from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

def get_treenodes_qs(project_id=None, skeleton_id=None, treenode_id=None, with_labels=True):
    if treenode_id and not skeleton_id:
        ci = ClassInstance.objects.get(
            project=project_id,
            class_column__class_name='skeleton',
            treenodeclassinstance__relation__relation_name='element_of',
            treenodeclassinstance__treenode__id=treenode_id)
        skeleton_id = ci.id
    treenode_qs = Treenode.objects.filter(
        treenodeclassinstance__class_instance__id=skeleton_id,
        treenodeclassinstance__relation__relation_name='element_of',
        treenodeclassinstance__class_instance__class_column__class_name='skeleton',
        project=project_id).order_by('id')
    if with_labels:
        labels_qs = TreenodeClassInstance.objects.filter(relation__relation_name='labeled_as',
            treenode__treenodeclassinstance__class_instance__id=skeleton_id,
            treenode__treenodeclassinstance__relation__relation_name='element_of').select_related('treenode', 'class_instance')
        labelconnector_qs = ConnectorClassInstance.objects.filter(relation__relation_name='labeled_as',
            connector__treenodeconnector__treenode__treenodeclassinstance__class_instance__id=skeleton_id,
            connector__treenodeconnector__treenode__treenodeclassinstance__relation__relation_name='element_of').select_related('connector', 'class_instance')
    else:
        labels_qs = []
        labelconnector_qs = []
    return treenode_qs, labels_qs, labelconnector_qs


def get_swc_string(treenodes_qs):
    all_rows = []
    for tn in treenodes_qs:
        swc_row = [tn.id]
        swc_row.append(0)
        swc_row.append(tn.location.x)
        swc_row.append(tn.location.y)
        swc_row.append(tn.location.z)
        swc_row.append(max(tn.radius, 0))
        swc_row.append(-1 if tn.parent_id is None else tn.parent_id)
        all_rows.append(swc_row)
    result = ""
    for row in all_rows:
        result += " ".join(str(x) for x in row) + "\n"
    return result

def export_skeleton_response(request, project_id=None, skeleton_id=None, treenode_id=None, logged_in_user=None, format=None):
    treenode_qs, labels_qs, labelconnector_qs = get_treenodes_qs(project_id, skeleton_id, treenode_id)

    if format == 'swc':
        return HttpResponse(get_swc_string(treenode_qs), mimetype='text/plain')
    elif format == 'json':
        return HttpResponse(get_json_string(treenode_qs), mimetype='text/json')
    else:
        raise Exception, "Unknown format ('%s') in export_skeleton_response" % (format,)

def generate_extended_skeleton_data( project_id=None, skeleton_id=None ):

    treenode_qs, labels_as, labelconnector_qs = get_treenodes_qs(project_id, skeleton_id, with_labels=False)

    labels={}
    for tn in labels_as:
        lab = str(tn.class_instance.name).lower()
        if tn.treenode_id in labels:
            labels[tn.treenode_id].append( lab )
        else:
            labels[tn.treenode_id] = [ lab ]
            # whenever the word uncertain is in the tag, add it
        # here. this is used in the 3d webgl viewer
        if 'uncertain' in lab or tn.treenode.confidence < 5:
            labels[tn.treenode_id].append( 'uncertain' )
    for cn in labelconnector_qs:
        lab = str(cn.class_instance.name).lower()
        if cn.connector_id in labels:
            labels[cn.connector_id].append( lab )
        else:
            labels[cn.connector_id] = [ lab ]
            # whenever the word uncertain is in the tag, add it
        # here. this is used in the 3d webgl viewer
        if 'uncertain' in lab:
            labels[cn.connector_id].append( 'uncertain' )

    # represent the skeleton as JSON
    vertices={}; connectivity={}
    for tn in treenode_qs:
        if tn.id in labels:
            lab = labels[tn.id]
        else:
            if tn.confidence < 5:
                lab = ['uncertain']
            else:
                lab = []
        vertices[tn.id] = {
            'x': tn.location.x,
            'y': tn.location.y,
            'z': tn.location.z,
            'radius': max(tn.radius, 0),
            'type': 'skeleton',
            'labels': lab,
            'reviewer_id': tn.reviewer_id,
            # 'review_time': tn.review_time
            # To submit the review time, we would need to encode the datetime as string
            # http://stackoverflow.com/questions/455580/json-datetime-between-python-and-javascript
        }
        if not tn.parent_id is None:
            if connectivity.has_key(tn.id):
                connectivity[tn.id][tn.parent_id] = {
                    'type': 'neurite'
                }
            else:
                connectivity[tn.id] = {
                    tn.parent_id: {
                        'type': 'neurite'
                    }
                }

    qs_tc = TreenodeConnector.objects.filter(
        project=project_id,
        relation__relation_name__endswith = 'synaptic_to',
        skeleton__in=[skeleton_id]
    ).select_related('treenode', 'connector', 'relation')

    #print >> sys.stderr, 'vertices, connectivity', vertices, connectivity

    for tc in qs_tc:
        #print >> sys.stderr, 'vertex, connector', tc.treenode_id, tc.connector_id
        #print >> sys.stderr, 'relation name', tc.relation.relation_name

        if tc.treenode_id in labels:
            lab1 = labels[tc.treenode_id]
        else:
            lab1 = []
        if tc.connector_id in labels:
            lab2 = labels[tc.connector_id]
        else:
            lab2 = []

        if not vertices.has_key(tc.treenode_id):
            raise Exception('Vertex was not in the result set. This should never happen.')

        if not vertices.has_key(tc.connector_id):
            vertices[tc.connector_id] = {
                'x': tc.connector.location.x,
                'y': tc.connector.location.y,
                'z': tc.connector.location.z,
                'type': 'connector',
                'labels': lab2,
                'reviewer_id': tc.connector.reviewer_id
                #'review_time': tn.review_time
            }

        # if it a single node without connection to anything else,
        # but to a connector, add it
        if not connectivity.has_key(tc.treenode_id):
            connectivity[tc.treenode_id] = {}

        if connectivity[tc.treenode_id].has_key(tc.connector_id):
            # print >> sys.stderr, 'only for postsynaptic to the same skeleton multiple times'
            # print >> sys.stderr, 'for connector', tc.connector_id
            connectivity[tc.treenode_id][tc.connector_id] = {
                'type': tc.relation.relation_name
            }
        else:
            # print >> sys.stderr, 'does not have key', tc.connector_id, connectivity[tc.treenode_id]
            connectivity[tc.treenode_id][tc.connector_id] = {
                'type': tc.relation.relation_name
            }

    # retrieve neuron name
    p = get_object_or_404(Project, pk=project_id)
    sk = get_object_or_404(ClassInstance, pk=skeleton_id, project=project_id)

    neuron = ClassInstance.objects.filter(
        project=p,
        cici_via_b__relation__relation_name='model_of',
        cici_via_b__class_instance_a=sk)
    n = { 'neuronname': neuron[0].name }

    return {'vertices':vertices,'connectivity':connectivity, 'neuron': n }

def export_extended_skeleton_response(request, project_id=None, skeleton_id=None, logged_in_user=None, format=None):

    data=generate_extended_skeleton_data( project_id, skeleton_id )

    if format == 'json':
        json_return = json.dumps(data, sort_keys=True, indent=4)
        return HttpResponse(json_return, mimetype='text/json')
    else:
        raise Exception, "Unknown format ('%s') in export_extended_skeleton_response" % (format,)

@catmaid_login_required
def skeleton_swc(*args, **kwargs):
    kwargs['format'] = 'swc'
    return export_skeleton_response(*args, **kwargs)

@catmaid_login_required
def skeleton_json(*args, **kwargs):
    kwargs['format'] = 'json'
    return export_extended_skeleton_response(*args, **kwargs)

@catmaid_login_required
def export_review_skeleton(request, project_id=None, skeleton_id=None, logged_in_user=None, format=None):
    data=generate_extended_skeleton_data( project_id, skeleton_id )
    g=nx.DiGraph()
    for id, d in data['vertices'].items():
        if d['type'] == 'skeleton':
            g.add_node( id, d )
    for from_id, to_data in data['connectivity'].items():
        for to_id, d in to_data.items():
            if d['type'] in ['postsynaptic_to', 'presynaptic_to']:
                continue
            else:
                g.add_edge( to_id, from_id, d )
    segments=[]
    for n in g.nodes(): g.node[n]['node_type']='slab'
    branchnodes=[k for k,v in g.degree().items() if v>2]
    branchnode_neighbors = {}
    for bid in branchnodes:
        branchnode_neighbors[bid] = g.neighbors(bid) + g.predecessors(bid)
    endnodes=[k for k,v in g.degree().items() if v==1]
    for n in endnodes: g.node[n]['node_type']='end'
    a=g.copy()
    a.remove_nodes_from( branchnodes )
    subg=nx.weakly_connected_component_subgraphs(a)
    for sg in subg:
        for k,v in sg.nodes(data=True):
            for bid, branch_neighbors in branchnode_neighbors.items():
                if k in branch_neighbors:
                    extended_dictionary=g.node[bid]
                    extended_dictionary['node_type']='branch'
                    sg.add_node(bid,extended_dictionary)
                    # and add edge!
                    sg.add_edge(k, bid)
        # extract segments from the subgraphs
    for sug in subg:
        # do not use sorted, but shortest path from source to target
        sg = sug.to_undirected()
        # retrieve end and/or branch nodes
        terminals=[id for id,d in sg.nodes(data=True) if d['node_type'] in ['branch', 'end']]
        assert(len(terminals)==2)
        if nx.has_path(sg, source=terminals[0],target=terminals[1] ):
            ordered_nodelist = nx.shortest_path(sg,source=terminals[0],target=terminals[1])
        elif nx.has_path(sg, source=terminals[1],target=terminals[0]):
            ordered_nodelist = nx.shortest_path(sg,source=terminals[1],target=terminals[0])
        else:
            json_return = json.dumps({'error': 'Cannot find path {0} to {1} {2} {3}'.format(terminals[0],
                terminals[1], str(sg.node[terminals[0]]), str(sg.node[terminals[1]])  )}, sort_keys=True, indent=4)
            return HttpResponse(json_return, mimetype='text/json')
        seg=[]
        start_and_end=[]
        for k in ordered_nodelist:
            v = sg.node[k]
            v['id']=k
            if v['node_type'] != 'slab':
                start_and_end.append( v['node_type'] )
            seg.append( v )
        nr=len(seg)
        notrevi=len([ele for ele in seg if ele['reviewer_id'] == -1])
        segdict = {
            'id': len(segments),
            'sequence': seg,
            'status': '%.2f' %( 100.*(nr-notrevi)/nr) ,
            'type': '-'.join(start_and_end),
            'nr_nodes': nr
        }
        segments.append( segdict )

    json_return = json.dumps(segments, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')