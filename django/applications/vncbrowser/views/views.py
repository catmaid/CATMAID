from django.db import models
from django.conf import settings
from django.core.paginator import Paginator, EmptyPage, InvalidPage
from django.core.urlresolvers import reverse
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from vncbrowser.models import CELL_BODY_CHOICES, \
    ClassInstanceClassInstance, Relation, Class, ClassInstance, \
    Project, User, Treenode, TreenodeConnector, Connector, Stack, ProjectStack, \
    TreenodeClassInstance, ConnectorClassInstance, Location, ProjectUser, Overlay, \
    BrokenSlice
from vncbrowser.views import catmaid_login_required, my_render_to_response, \
    get_form_and_neurons

from vncbrowser.views.export import get_annotation_graph

from django.db.models import Count
import json
import re
import sys

from urllib import urlencode
from datetime import datetime
import httplib, urllib
import cStringIO

try:
    import networkx as nx
    from networkx.readwrite import json_graph
    import Image
except ImportError:
    pass

def findBrackets( aString ):
    if '[' in aString:
        match = aString.split('[',1)[1]
        open = 1
        for index in xrange(len(match)):
            if match[index] in '[]':
                open = (open + 1) if match[index] == '[' else (open - 1)
            if not open:
                return match[:index]

@catmaid_login_required
def index(request, **kwargs):
    all_neurons, search_form = get_form_and_neurons(request,
                                                    kwargs['project_id'],
                                                    kwargs)
    return my_render_to_response(request,
                                 'vncbrowser/index.html',
                                 {'all_neurons_list': all_neurons,
                                  'project_id': kwargs['project_id'],
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': kwargs['logged_in_user'],
                                  'search_form': search_form})

@catmaid_login_required
def visual_index(request, **kwargs):

    all_neurons, search_form = get_form_and_neurons( request,
                                                     kwargs['project_id'],
                                                     kwargs )

    # From: http://docs.djangoproject.com/en/1.0/topics/pagination/
    paginator = Paginator(all_neurons, 5)
    if 'page' in kwargs:
        page = kwargs['page'] or 1
    else:
        try:
            page = int(request.GET.get('page', '1'))
        except ValueError:
            page = 1

    # If page request (9999) is out of range, deliver last page of results.
    try:
        neurons = paginator.page(page)
    except (EmptyPage, InvalidPage):
        neurons = paginator.page(paginator.num_pages)

    return my_render_to_response(request,
                                 'vncbrowser/visual_index.html',
                                 {'sorted_neurons': neurons.object_list,
                                  'sorted_neurons_page' : neurons,
                                  'project_id': kwargs['project_id'],
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': kwargs['logged_in_user'],
                                  'search_form': search_form })

@catmaid_login_required
def view(request, project_id=None, neuron_id=None, neuron_name=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)
    # FIXME: add the class name as well
    if neuron_id:
        n = get_object_or_404(ClassInstance, pk=neuron_id, project=project_id)
    else:
        n = get_object_or_404(ClassInstance, name=neuron_name, project=project_id)

    lines = ClassInstance.objects.filter(
        project=p,
        cici_via_a__class_instance_b=n,
        cici_via_a__relation__relation_name='expresses_in').all()

    skeletons = ClassInstance.objects.filter(
        project=p,
        cici_via_a__relation__relation_name='model_of',
        class_column__class_name='skeleton',
        cici_via_a__class_instance_b=n)

    outgoing = n.all_neurons_downstream(project_id, skeletons)
    incoming = n.all_neurons_upstream(project_id, skeletons)

    outgoing = [x for x in outgoing if not x['name'].startswith('orphaned ')]
    incoming = [x for x in incoming if not x['name'].startswith('orphaned ')]

    return my_render_to_response(request,
                                 'vncbrowser/view.html',
                                 {'neuron': n,
                                  'neuron_class': findBrackets( n.name ),
                                  'lines': lines,
                                  'skeletons': skeletons,
                                  'project_id': project_id,
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': logged_in_user,
                                  'cell_body_choices': CELL_BODY_CHOICES,
                                  'incoming': incoming,
                                  'outgoing': outgoing,
                                  'wiki_base_url': p.wiki_base_url } )

@catmaid_login_required
def set_cell_body(request, logged_in_user=None):
    neuron_id = request.POST['neuron_id']
    n = get_object_or_404(ClassInstance, pk=neuron_id)
    new_location_code = request.POST['cell-body-choice']
    choices_dict = dict(CELL_BODY_CHOICES)
    if new_location_code not in choices_dict:
        raise Exception, "Unknown cell body location: "+str(new_location_code)
    new_location = choices_dict[new_location_code]
    n.set_cell_body_location(new_location)
    return HttpResponseRedirect(reverse('vncbrowser.views.view',
                                        kwargs={'neuron_id':neuron_id,
                                                'project_id':n.project.id}))

@catmaid_login_required
def line(request, project_id=None, line_id=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)
    l = get_object_or_404(ClassInstance, pk=line_id, project=p, class_column__class_name='driver_line')
    sorted_neurons = ClassInstance.objects.filter(
        cici_via_b__relation__relation_name='expresses_in',
        cici_via_b__class_instance_a=l).order_by('name')
    return my_render_to_response(request,
                                 'vncbrowser/line.html',
                                 {'line': l,
                                  'project_id': p.id,
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': logged_in_user,
                                  'neurons': sorted_neurons})

@catmaid_login_required
def lines_add(request, project_id=None, logged_in_user=None):
    p = Project.objects.get(pk=project_id)
    # FIXME: for the moment, just hardcode the user ID:
    user = User.objects.get(pk=3)
    neuron = get_object_or_404(ClassInstance,
                               pk=request.POST['neuron_id'],
                               project=p)

    # There's a race condition here, if two people try to add a line
    # with the same name at the same time.  The normal way to deal
    # with this would be to make the `name` column unique in the
    # table, but since the class_instance table isn't just for driver
    # lines, we can't do that.  (FIXME)
    try:
        line = ClassInstance.objects.get(name=request.POST['line_name'])
    except ClassInstance.DoesNotExist:
        line = ClassInstance()
        line.name=request.POST['line_name']
        line.project = p
        line.user = user
        line.class_column = Class.objects.get(class_name='driver_line', project=p)
        line.save()

    r = Relation.objects.get(relation_name='expresses_in', project=p)

    cici = ClassInstanceClassInstance()
    cici.class_instance_a = line
    cici.class_instance_b = neuron
    cici.relation = r
    cici.user = user
    cici.project = p
    cici.save()

    return HttpResponseRedirect(reverse('vncbrowser.views.view',
                                        kwargs={'neuron_id':neuron.id,
                                                'project_id':p.id}))

@catmaid_login_required
def lines_delete(request, project_id=None, logged_in_user=None):
    p = Project.objects.get(pk=project_id)
    neuron = get_object_or_404(ClassInstance,
                               pk=request.POST['neuron_id'],
                               project=p)

    r = Relation.objects.get(relation_name='expresses_in', project=p)

    ClassInstanceClassInstance.objects.filter(relation=r,
                                              project=p,
                                              class_instance_a__name=request.POST['line_name'],
                                              class_instance_b=neuron).delete()
    return HttpResponseRedirect(reverse('vncbrowser.views.view',
                                        kwargs={'neuron_id':neuron.id,
                                                'project_id':p.id}))



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

def export_skeleton_response(request, project_id=None, skeleton_id=None, treenode_id=None, logged_in_user=None, format=None):
    treenode_qs, labels_qs, labelconnector_qs = get_treenodes_qs(project_id, skeleton_id, treenode_id)

    if format == 'swc':
        return HttpResponse(get_swc_string(treenode_qs), mimetype='text/plain')
    elif format == 'json':
        return HttpResponse(get_json_string(treenode_qs), mimetype='text/json')
    else:
        raise Exception, "Unknown format ('%s') in export_skeleton_response" % (format,)


def get_wiring_diagram(project_id=None, LOWER_TREENODE_NUMBER_LIMIT=0):

    # result dictionary: {connectorid: presyn_skeletonid}
    tmp={}
    result={}
    # get the presynaptic connections
    qs = TreenodeConnector.objects.filter(
        project=project_id,
        relation__relation_name = 'presynaptic_to'
    )
    for e in qs:
        if not e.connector_id in tmp:
            tmp[e.connector_id]=e.skeleton_id
            result[e.skeleton_id]={}
        else:
            # connector with multiple presynaptic connections
            pass

    skeletons={}
    qs = Treenode.objects.filter(project=project_id).values('skeleton').annotate(Count('skeleton'))
    for e in qs:
        skeletons[ e['skeleton'] ]=e['skeleton__count']

    # get the postsynaptic connections
    qs = TreenodeConnector.objects.filter(
        project=project_id,
        relation__relation_name = 'postsynaptic_to'
    )
    for e in qs:
        if e.connector_id in tmp:

            # limit the skeletons to include
            if skeletons[ tmp[e.connector_id] ] < LOWER_TREENODE_NUMBER_LIMIT or \
                skeletons[ e.skeleton_id ] < LOWER_TREENODE_NUMBER_LIMIT:
                continue

            # an existing connector, so we add a connection
            if e.skeleton_id in result[tmp[e.connector_id]]:
                result[tmp[e.connector_id]][e.skeleton_id] += 1
            else:
                result[tmp[e.connector_id]][e.skeleton_id] = 1
        else:
            # connector with only postsynaptic connections
            pass

    nodes_tmp={}
    edges=[]

    for k,v in result.iteritems():

        for kk,vv in v.iteritems():

            edges.append(
                {"id": str(k)+"_"+str(kk),
                 "source": str(k),
                 "target": str(kk),
                 "number_of_connector": vv}
            )

            nodes_tmp[k]=None
            nodes_tmp[kk]=None

    nodes=[]
    for k,v in nodes_tmp.iteritems():
        nodes.append(
                {
                "id": str(k),
                "label": "Skeleton "+str(k),
                'node_count': skeletons[k]
                }
        )

    return { 'nodes': nodes, 'edges': edges }


def export_wiring_diagram_nx(request, project_id=None):

    if request.POST.has_key('lower_skeleton_count'):
        LOWER_TREENODE_NUMBER_LIMIT=request.POST['lower_skeleton_count']
    else:
        LOWER_TREENODE_NUMBER_LIMIT=0

    nodes_and_edges=get_wiring_diagram(project_id, LOWER_TREENODE_NUMBER_LIMIT)
    g=nx.DiGraph()

    for n in nodes_and_edges['nodes']:
        g.add_node( n['id'], {'label': n['label'], 'node_count': n['node_count'] } )

    for e in nodes_and_edges['edges']:
        g.add_edge( e['source'], e['target'], {'number_of_connector': e['number_of_connector'] } )

    data = json_graph.node_link_data(g)
    json_return = json.dumps(data, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')


def export_wiring_diagram(request, project_id=None):

    if request.POST.has_key('lower_skeleton_count'):
        LOWER_TREENODE_NUMBER_LIMIT=request.POST['lower_skeleton_count']
    else:
        LOWER_TREENODE_NUMBER_LIMIT=0

    nodes_and_edges=get_wiring_diagram(project_id, LOWER_TREENODE_NUMBER_LIMIT)

    nodesDataSchema=[
        {'name':'id','type':'string'},
        {'name':'label','type':'string'},
        {'name':'node_count','type':'number'},
    ]
    edgesDataSchema=[
        {'name': 'id','type':'string'},
        {'name': 'number_of_connector','type':'number'},
        {'name': "directed", "type": "boolean", "defValue": True}
    ]

    data={
        'dataSchema':{'nodes':nodesDataSchema,'edges':edgesDataSchema},
        'data':{'nodes':nodes_and_edges['nodes'],'edges':nodes_and_edges['edges']}
    }

    json_return = json.dumps(data, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')



def convert_annotations_to_networkx(request, project_id=None):
    g = get_annotation_graph( project_id )
    data = json_graph.node_link_data(g)
    json_return = json.dumps(data, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')

def export_extended_skeleton_response(request, project_id=None, skeleton_id=None, logged_in_user=None, format=None):

    data=generate_extended_skeleton_data( project_id, skeleton_id )

    if format == 'json':
        json_return = json.dumps(data, sort_keys=True, indent=4)
        return HttpResponse(json_return, mimetype='text/json')
    else:
        raise Exception, "Unknown format ('%s') in export_extended_skeleton_response" % (format,)

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

@catmaid_login_required
def update_location_reviewer(request, project_id=None, node_id=None, logged_in_user=None):
    """ Updates the reviewer id and review time of a node """
    p = get_object_or_404(Project, pk=project_id)
    loc = Location.objects.get(
        pk=node_id,
        project=p)
    loc.reviewer_id=logged_in_user.id
    loc.review_time=datetime.now()
    loc.save()
    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')


@catmaid_login_required
def skeleton_swc(*args, **kwargs):
    kwargs['format'] = 'swc'
    return export_skeleton_response(*args, **kwargs)

@catmaid_login_required
def skeleton_json(*args, **kwargs):
    kwargs['format'] = 'json'
    return export_extended_skeleton_response(*args, **kwargs)

@catmaid_login_required
def neuron_to_skeletons(request, project_id=None, neuron_id=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)
    neuron = get_object_or_404(ClassInstance,
                               pk=neuron_id,
                               class_column__class_name='neuron',
                               project=p)
    qs = ClassInstance.objects.filter(
        project=p,
        cici_via_a__relation__relation_name='model_of',
        cici_via_a__class_instance_b=neuron)
    return HttpResponse(json.dumps([x.id for x in qs]), mimetype="text/json")

@catmaid_login_required
def multiple_presynaptic_terminals(request, project_id=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)

    tcs = TreenodeConnector.objects.filter(project__id=project_id, relation__relation_name='presynaptic_to').values('connector').annotate(number=models.Count('connector')).filter(number__gt=1)
    return my_render_to_response(request,
                                 'vncbrowser/multiple_presynaptic_terminals.html',
                                 {'project_id': p.id,
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': logged_in_user,
                                  'stacks': p.stacks.all(),
                                  'connector_counts': tcs})

@catmaid_login_required
def goto_connector(request, project_id=None, connector_id=None, stack_id=None, logged_in_user=None):
    c = get_object_or_404(Connector, pk=connector_id)
    parameters = {"pid": project_id,
                  "zp": c.location.z,
                  "yp": c.location.y,
                  "xp": c.location.x,
                  "tool": "tracingtool",
                  "sid0": stack_id,
                  "s0" : 0}
    return HttpResponseRedirect(settings.CATMAID_URL + "?" + urllib.urlencode(parameters))

def get_stack_info(project_id=None, stack_id=None, user=None):
    """ Returns a dictionary with relevant information for stacks.
    Depending on the tile_source_type, get information from database
    or from tile server directly
    """
    p = get_object_or_404(Project, pk=project_id)
    s = get_object_or_404(Stack, pk=stack_id)
    ps_all = ProjectStack.objects.filter(project=project_id, stack=stack_id)
    if len(ps_all) != 1:
        return {'error': 'Multiple project - stack associations, but should only be one.'}
    ps=ps_all[0]
    pu = ProjectUser.objects.filter(project=project_id, user=user.id).count()

    # https://github.com/acardona/CATMAID/wiki/Convention-for-Stack-Image-Sources
    if int(s.tile_source_type) == 2:
        # request appropriate stack metadata from tile source
        url=s.image_base.rstrip('/').lstrip('http://')
        # Important: Do not use localhost, but 127.0.0.1 instead
        # to prevent an namespace lookup error (gaierror)
        # Important2: Do not put http:// in front!
        conn = httplib.HTTPConnection(url)
        conn.request('GET', '/metadata')
        response = conn.getresponse()
        # read JSON response according to metadata convention
        # Tornado reponse is escaped JSON string
        read_response = response.read()
        # convert it back to dictionary str->dict
        return json.loads(read_response)
    else:
        broken_slices_qs = BrokenSlice.objects.filter(stack=stack_id)
        broken_slices = {}
        for ele in broken_slices_qs:
            broken_slices[ele.index] = 1
        overlays = []
        overlays_qs = Overlay.objects.filter(stack=stack_id)
        for ele in overlays_qs:
            overlays.append( {
                'id': ele.id,
                'title': ele.title,
                'image_base': ele.image_base,
                'default_opacity': ele.default_opacity,
            } )
        result={
            'sid': int(s.id),
            'pid': int(p.id),
            'ptitle': p.title,
            'stitle': s.title,
            'image_base': s.image_base,
            'num_zoom_levels': int(s.num_zoom_levels),
            'file_extension': s.file_extension,
            'editable': int(pu>0),
            'translation': {
                'x': ps.translation.x,
                'y': ps.translation.y,
                'z': ps.translation.z
            },
            'resolution': {
                'x': float(s.resolution.x),
                'y': float(s.resolution.y),
                'z': float(s.resolution.z)
            },
            'dimension': {
                'x': int(s.dimension.x),
                'y': int(s.dimension.y),
                'z': int(s.dimension.z)
            },
            'tile_height': int(s.tile_height),
            'tile_width': int(s.tile_width),
            'tile_source_type': int(s.tile_source_type),
            'metadata' : s.metadata,
            'broken_slices': broken_slices,
            'trakem2_project': int(s.trakem2_project),
            'overlay': overlays
        }

    return result

@catmaid_login_required
def stack_info(request, project_id=None, stack_id=None, logged_in_user=None):
    result=get_stack_info(project_id, stack_id, logged_in_user)
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), mimetype="text/json")

def push_image(request, project_id=None, stack_id=None):
    """ Push image to server with proper stack field-of-view """
    params = urllib.urlencode(request.POST)
    headers = {"Content-type": "application/x-www-form-urlencoded",
                "Referer": "http://127.0.0.1"}
    # TODO: Replace hard-coded URL to TileServer URL specified in settings.py
    conn = httplib.HTTPConnection("127.0.0.1:8888")
    conn.request("POST", "/labelupload/?"+params, '', headers)
    response = conn.getresponse()
    if response.status == 200:
        return HttpResponse("Image pushed to server.", mimetype="plain/text")
    else:
        return HttpResponse("Error in TileServer response.", mimetype="plain/text")

def objecttree_get_all_skeletons(request, project_id=None, node_id=None):
    """ Retrieve all skeleton ids for a given node in the object tree
    """
    g = get_annotation_graph( project_id )
    potential_skeletons = nx.bfs_tree(g, int(node_id)).nodes()
    result = []
    for node_id in potential_skeletons:
        if g.node[node_id]['class'] == 'skeleton':
            result.append( node_id )
    json_return = json.dumps({'skeletons': result}, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')
