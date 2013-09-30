from django.http import HttpResponse
from django.db.models import Count
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.graph import _skeleton_graph

try:
    import networkx as nx
    from networkx.readwrite import json_graph
except ImportError:
    pass

import json

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_jsongraph(request, project_id):
    
    skeletonlist = request.POST.getlist('skeleton_list[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)

    # default: confidence_threshold = 0, bandwidth = 0
    circuit = _skeleton_graph(project_id, skeletonlist, 0, 9000)
    package = {'nodes': [{'data': props} for digraph, props in circuit.nodes_iter(data=True)],
               'edges': []}
    edges = package['edges']
    for g1, g2, props in circuit.edges_iter(data=True):
        id1 = circuit.node[g1]['id']
        id2 = circuit.node[g2]['id']
        edges.append({'data': {'id': '%s_%s' % (id1, id2),
                               'source': id1,
                               'target': id2,
                               'weight': props['c'],
                               'label': str(props['c']) if props['directed'] else None,
                               'directed': props['directed'],
                               'arrow': props['arrow'],
                               'color': props['color']}})

    newgraph = nx.DiGraph()
    for digraph, props in circuit.nodes_iter(data=True):
        newgraph.add_node( props['id'], {
            'node_count': props['node_count'],
            'skeleton_id': props['skeleton_id'],
            'label': props['label'],
        })
    for g1, g2, props in circuit.edges_iter(data=True):
        id1 = circuit.node[g1]['id']
        id2 = circuit.node[g2]['id']
        newgraph.add_edge( id1, id2, {
            'id': '%s-%s' % (id1, id2),
           'weight': props['c'],
           'label': str(props['c']) if props['directed'] else None,
           'directed': props['directed']
            })

    return HttpResponse(json.dumps(json_graph.node_link_data(newgraph), indent=2), mimetype='text/json')
