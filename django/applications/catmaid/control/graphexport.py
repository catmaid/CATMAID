import json

from django.http import HttpResponse
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

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_jsongraph(request, project_id):
    skeletonlist = request.POST.getlist('skeleton_list[]')
    confidence_threshold = int(request.GET.get('confidence_threshold', 0))
    bandwidth = int(request.GET.get('bandwidth', 0))
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)

    circuit = _skeleton_graph(project_id, skeletonlist, confidence_threshold, bandwidth)
    newgraph = nx.DiGraph()
    for digraph, props in circuit.nodes_iter(data=True):
        newgraph.add_node( props['id'], {
            'node_count': props['node_count'],
            'skeleton_id': props['skeleton_id'],
            'label': props['label'],
            'node_reviewed_count': props['node_reviewed_count']
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
