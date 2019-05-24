# -*- coding: utf-8 -*-

import json
import networkx as nx
from networkx.readwrite import json_graph
from typing import Dict, List

from django.http import HttpRequest, JsonResponse
from django.db.models import Count

from catmaid.models import Treenode, TreenodeConnector, UserRole
from catmaid.control.authentication import requires_user_role


def get_wiring_diagram(project_id=None, lower_treenode_number_limit=0) -> Dict[str, List]:

    # result dictionary: {connectorid: presyn_skeletonid}
    tmp={} # type: Dict
    result={} # type: Dict
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
            if skeletons[ tmp[e.connector_id] ] < lower_treenode_number_limit or\
               skeletons[ e.skeleton_id ] < lower_treenode_number_limit:
                continue

            # an existing connector, so we add a connection
            if e.skeleton_id in result[tmp[e.connector_id]]:
                result[tmp[e.connector_id]][e.skeleton_id] += 1
            else:
                result[tmp[e.connector_id]][e.skeleton_id] = 1
        else:
            # connector with only postsynaptic connections
            pass

    nodes_tmp={} # type: Dict
    edges=[]

    for k,v in result.items():

        for kk,vv in v.items():

            edges.append(
                    {"id": str(k)+"_"+str(kk),
                     "source": str(k),
                     "target": str(kk),
                     "number_of_connector": vv}
            )

            nodes_tmp[k]=None
            nodes_tmp[kk]=None

    nodes=[]
    for k,v in nodes_tmp.items():
        nodes.append(
                {
                "id": str(k),
                "label": "Skeleton "+str(k),
                'node_count': skeletons[k]
            }
        )

    return { 'nodes': nodes, 'edges': edges }


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_wiring_diagram_nx(request:HttpRequest, project_id=None) -> JsonResponse:

    lower_treenode_number_limit = int(request.POST.get('lower_skeleton_count', 0))

    nodes_and_edges=get_wiring_diagram(project_id, lower_treenode_number_limit)
    g=nx.DiGraph()

    for n in nodes_and_edges['nodes']:
        g.add_node( n['id'], {'label': n['label'], 'node_count': n['node_count'] } )

    for e in nodes_and_edges['edges']:
        g.add_edge( e['source'], e['target'], {'number_of_connector': e['number_of_connector'] } )

    data = json_graph.node_link_data(g)
    return JsonResponse(data, safe=False, json_dumps_params={
        'sort_keys': True,
        'indent': 4
    })


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def export_wiring_diagram(request:HttpRequest, project_id=None) -> JsonResponse:

    lower_treenode_number_limit = int(request.POST.get('lower_skeleton_count', 0))

    nodes_and_edges=get_wiring_diagram(project_id, lower_treenode_number_limit)

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

    return JsonResponse(data, json_dumps_params={
        'sort_keys': True,
        'indent': 4
    })
