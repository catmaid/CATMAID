from django.http import HttpResponse
from django.db.models import Count
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *

try:
    import networkx as nx
    from networkx.readwrite import json_graph
except ImportError:
    pass

import json
import cStringIO

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def summary_statistics(request, project_id=None):

    # return CSV
    # skeleton ID, neuron name, cable length, number of input
    # synapses, number of output synapses, number of input
    #  neurons, number of outputs neuron, number of inputs
    # with a single node, number of outputs with a single node

    data = json_graph.node_link_data(g)
    json_return = json.dumps(data, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')

def _get_skeletongroup(request, project_id):
    skeletonlist = request.POST.getlist('skeleton_list[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    skelgroup = SkeletonGroup( skeletonlist, p.id )
    return skelgroup

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_nxjsgraph(request, project_id=None):
    skelgroup = _get_skeletongroup(request, project_id)
    data = json_graph.node_link_data(skelgroup.graph)
    return HttpResponse(json.dumps(data, indent=2), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_graphml(request, project_id=None):
    skelgroup = _get_skeletongroup(request, project_id)
    output = cStringIO.StringIO()
    nx.write_graphml( skelgroup.graph, output )
    return HttpResponse(output.getvalue())

    response = HttpResponse(mimetype="application/xml")
    response['Content-Disposition'] = "attachment;filename=network.graphml"
    response.write(output.getvalue())
    return response
    # return HttpResponse(output.read())

# file download
# http://stackoverflow.com/questions/908258/generating-file-to-download-with-django

# response = HttpResponse(mimetype="application/zip")
# # response['Content-Disposition'] = "attachment;filename=%s" % filename
# response.write(output.read())
# return response