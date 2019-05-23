# -*- coding: utf-8 -*-

import json

from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404

from catmaid.models import UserRole, Project
from catmaid.control.authentication import requires_user_role 
from catmaid.control.graph import _skeleton_graph
from catmaid.control.skeleton import _skeleton_info_raw

try:
    import networkx as nx
    from networkx.readwrite import json_graph
except ImportError:
    pass

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_jsongraph(request:HttpRequest, project_id) -> JsonResponse:
    p = get_object_or_404(Project, pk=project_id)
    skeletonlist = request.POST.getlist('skeleton_list[]')
    confidence_threshold = int(request.POST.get('confidence_threshold', 0))
    bandwidth = int(request.POST.get('bandwidth', 0))
    cable_spread = float(request.POST.get('cable_spread', 2500)) # in nanometers
    path_confluence = int(request.POST.get('path_confluence', 10)) # a count
    compute_risk = 1 == int(request.POST.get('risk', 0))
    order = int(request.POST.get('order', 0))
    skeletonlist = map(int, skeletonlist)

    if not skeletonlist:
        raise ValueError("No skeleton IDs provided")

    if order > 2: # only allow to retrieve order two to limit server usage
        order = 0

    while order != 0:
        skeleton_info = _skeleton_info_raw( project_id, request.user.id, skeletonlist, 'OR' )[0:2]
        incoming, outgoing = skeleton_info['incoming'], skeleton_info['outgoing']
        skeletonlist = set( skeletonlist ).union( set(incoming.keys()) ).union( set(outgoing.keys()) )
        order -= 1
    
    circuit = _skeleton_graph(project_id, skeletonlist, confidence_threshold, bandwidth, set(), compute_risk, cable_spread, path_confluence)
    newgraph = nx.DiGraph()
    for digraph, props in circuit.nodes_iter(data=True):
        newgraph.add_node( props['id'], {
            'node_count': props['node_count'],
            'skeleton_id': props['skeleton_id'],
            'label': props['label'],
            'node_reviewed_count': props['node_reviewed_count'] })
    for g1, g2, props in circuit.edges_iter(data=True):
        id1 = circuit.node[g1]['id']
        id2 = circuit.node[g2]['id']
        newgraph.add_edge( id1, id2, {
           'id': '%s-%s' % (id1, id2),
           'weight': props['c'],
           'label': str(props['c']) if props['directed'] else None,
           'directed': props['directed'] })

    return JsonResponse(json_graph.node_link_data(newgraph), safe=False,
            json_dumps_params={'indent': 2})
