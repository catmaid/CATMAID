from django.http import HttpResponse
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

import sys


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def adjacency_matrix(request, project_id=None):
    skeletonlist = request.POST.getlist('skeleton_list[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    skelgroup = SkeletonGroup( skeletonlist, p.id )

    nodeslist = [ {'group': 1,
                   'id': k,
                   'name': d['neuronname']} for k,d in skelgroup.graph.nodes_iter(data=True)  ]
    nodesid_list = [ele['id'] for ele in nodeslist]

    data = {
        'nodes': nodeslist,
        'links': [ {'id': '%i_%i' % (u,v),
                    'source': nodesid_list.index(u),
                    'target': nodesid_list.index(v),
                    'value': d['count']} for u,v,d in skelgroup.graph.edges_iter(data=True)  ]
    }

    return HttpResponse(json.dumps(data, sort_keys=True, indent=4), mimetype='text/json')


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeletonlist_subgraph(request, project_id=None):
    skeletonlist = request.POST.getlist('skeleton_list[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    skelgroup = SkeletonGroup( skeletonlist, p.id )

    data = {
        'nodes': [ {'id': str(k),
                    'label': str(d['baseName']),
                    'skeletonid': str(d['skeletonid']),
                    'node_count': d['node_count']
                    } for k,d in skelgroup.graph.nodes_iter(data=True)  ],
        'edges': [ {'id': '%i_%i' % (u,v),
                    'source': str(u),
                    'target': str(v),
                    'weight': d['count'],
                    'label': str(d['count']),
                    'directed': True} for u,v,d in skelgroup.graph.edges_iter(data=True)  ]
    }

    return HttpResponse(json.dumps(data, sort_keys=True, indent=4), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def skeletonlist_compartment_subgraph(request, project_id=None):
    skeletonlist = request.POST.getlist('skeleton_list[]')
    skeletonlist = map(int, skeletonlist)
    confidence = int(request.POST.get('confidence_threshold', 5))
    p = get_object_or_404(Project, pk=project_id)
    # skelgroup = SkeletonGroup( skeletonlist, p.id )
    # split up where conficence bigger than confidence
    resultgraph = compartmentalize_skeletongroup_by_confidence( skeletonlist, p.id, confidence )

    data = {
        'nodes': [ { 'data': {'id': str(k),
                    'label': str(d['neuronname']),
                    'skeletonid': str(d['skeletonid']),
                    'node_count': d['node_count']} } for k,d in resultgraph.nodes_iter(data=True)  ],
        'edges': [ { 'data': {'id': '%s_%s' % (u,v),
                    'source': str(u),
                    'target': str(v),
                    'weight': d['count'],
                    'label': str(d['count']),
                    'directed': True}} for u,v,d in resultgraph.edges_iter(data=True)  ]
    }

    return HttpResponse(json.dumps(data, sort_keys=True, indent=4), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def all_shared_connectors(request, project_id=None):
    skeletonlist = request.POST.getlist('skeletonlist[]')
    skeletonlist = map(int, skeletonlist)
    p = get_object_or_404(Project, pk=project_id)
    skelgroup = SkeletonGroup( skeletonlist, p.id )
    return HttpResponse(json.dumps(dict.fromkeys(skelgroup.all_shared_connectors()) ), mimetype='text/json')
