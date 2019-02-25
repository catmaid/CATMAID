# -*- coding: utf-8 -*-

from collections import defaultdict
from functools import partial
from itertools import combinations, chain
import json
import math
import networkx as nx

from typing import Any, DefaultDict, Dict, Iterator, List, Optional, Set, Tuple, Union

from django.db import connection
from django.http import HttpRequest, JsonResponse

from catmaid.models import UserRole
from catmaid.control.authentication import requires_user_role
from catmaid.control.skeleton import _neuronnames

def _next_circle(skeleton_set:Set, relations, cursor) -> DefaultDict:
    """ Return a dictionary of skeleton IDs in the skeleton_set vs a dictionary of connected skeletons vs how many connections."""
    pre = relations['presynaptic_to']
    post = relations['postsynaptic_to']
    cursor.execute('''
    SELECT tc1.skeleton_id, tc1.relation_id, tc2.skeleton_id
    FROM treenode_connector tc1,
         treenode_connector tc2
    WHERE tc1.skeleton_id in (%s)
      AND tc1.connector_id = tc2.connector_id
      AND tc1.skeleton_id != tc2.skeleton_id
      AND tc1.relation_id != tc2.relation_id
      AND (tc1.relation_id = %s OR tc1.relation_id = %s)
      AND (tc2.relation_id = %s OR tc2.relation_id = %s)
    ''' % (','.join(map(str, skeleton_set)), pre, post, pre, post))
    connections = defaultdict(partial(defaultdict, partial(defaultdict, int))) # type: DefaultDict
    for row in cursor.fetchall():
        connections[row[0]][row[1]][row[2]] += 1
    return connections

def _relations(cursor, project_id:Union[int,str]) -> Dict:
    cursor.execute("SELECT relation_name, id FROM relation WHERE project_id = %s AND (relation_name = 'presynaptic_to' OR relation_name = 'postsynaptic_to')" % int(project_id))
    return dict(cursor.fetchall())

def _clean_mins(request:HttpRequest, cursor, project_id:Union[int,str]) -> Tuple[Dict, Any]:
    min_pre = int(request.POST.get('min_pre',  -1)) # type: Union[int, float]
    min_post = int(request.POST.get('min_post', -1)) # type: Union[int, float]

    if -1 == min_pre and -1 == min_post:
        raise Exception("Can't grow: not retrieving any pre or post.")
    if -1 == min_pre:
        min_pre = float('inf')
    if -1 == min_post:
        min_post = float('inf')

    relations = _relations(cursor, project_id)
    mins = {}
    mins[relations['presynaptic_to']]  = min_post # inverted: all postsynaptic to the set
    mins[relations['postsynaptic_to']] = min_pre # inverted: all presynaptic to the set
    return mins, relations

@requires_user_role(UserRole.Browse)
def circles_of_hell(request:HttpRequest, project_id) -> JsonResponse:
    """ Given a set of one or more skeleton IDs, find all skeletons that connect
    them (n_circles=1), or that connect to others that connect them (n_circles=2), etc.
    Returns a list of unique skeleton IDs that exclude the ones provided as argument.
    """
    n_circles = int(request.POST.get('n_circles', 1))
    if n_circles < 1:
        raise Exception("Requires at least one circle.")

    first_circle = set(int(v) for k,v in request.POST.items() if k.startswith('skeleton_ids['))

    if not first_circle:
        raise Exception("No skeletons were provided.")

    cursor = connection.cursor()
    mins, relations = _clean_mins(request, cursor, int(project_id))

    current_circle = first_circle
    all_circles = first_circle

    while n_circles > 0 and current_circle:
        n_circles -= 1
        connections = _next_circle(current_circle, relations, cursor)
        next_circle = set(skID for c in connections.values() \
                          for relationID, cs in c.items() \
                          for skID, count in cs.items() if count >= mins[relationID])
        current_circle = next_circle - all_circles
        all_circles = all_circles.union(next_circle)

    skeleton_ids = tuple(all_circles - first_circle)
    return JsonResponse([skeleton_ids, _neuronnames(skeleton_ids, project_id)], safe=False)


@requires_user_role(UserRole.Browse)
def find_directed_paths(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Given a set of two or more skeleton IDs, find directed paths of connected neurons between them, for a maximum inner path length as given (i.e. origin and destination not counted). A directed path means that all edges are of the same kind, e.g. presynaptic_to. """

    sources = set(int(v) for k,v in request.POST.items() if k.startswith('sources['))
    targets = set(int(v) for k,v in request.POST.items() if k.startswith('targets['))
    if len(sources) < 1 or len(targets) < 1:
        raise Exception('Need at least 1 skeleton IDs for both sources and targets to find directed paths!')

    path_length = int(request.POST.get('path_length', 2))
    cursor = connection.cursor()
    min = int(request.POST.get('min_synapses', -1)) # type: Union[int,float]
    if -1 == min:
        min = float('inf')

    relations = _relations(cursor, project_id)

    def next_level(skids, rel1, rel2):
        cursor.execute('''
        SELECT tc1.skeleton_id, tc2.skeleton_id
        FROM treenode_connector tc1,
             treenode_connector tc2
        WHERE tc1.skeleton_id in (%s)
          AND tc1.connector_id = tc2.connector_id
          AND tc1.skeleton_id != tc2.skeleton_id
          AND tc1.relation_id = %s
          AND tc2.relation_id = %s
        GROUP BY tc1.skeleton_id, tc2.skeleton_id
        HAVING count(*) >= %s
        ''' % (','.join(str(skid) for skid in skids),
               rel1,
               rel2,
               min))
        return cursor.fetchall()


    # bidirectional search
    i = 0
    middle = path_length / 2
    s1 = sources
    t1 = targets
    graph = nx.DiGraph()
    pre = relations['presynaptic_to']
    post = relations['postsynaptic_to']

    while i <= middle:
        if 0 == len(s1):
            break
        s2 = set()
        for pre_skid, post_skid in next_level(s1, pre, post):
            graph.add_edge(pre_skid, post_skid)
            if not post_skid in s1:
                s2.add(post_skid)
        s1 = s2
        i += 1
        if i < middle and len(t1) > 0:
            t2 = set()
            for post_skid, pre_skid in next_level(t1, post, pre):
                graph.add_edge(pre_skid, post_skid)
                if not pre_skid in t1:
                    t2.add(pre_skid)
            t1 = t2

    # Nodes will not be in the graph if they didn't have further connections,
    # like for example will happen for placeholder skeletons e.g. at unmerged postsynaptic sites.
    all_paths = []
    for source in sources:
        if graph.has_node(source):
            for target in targets:
                if graph.has_node(target):
                    # The cutoff is the maximum number of hops, not the number of vertices in the path, hence -1:
                    for path in nx.all_simple_paths(graph, source, target, cutoff=(path_length -1)):
                        all_paths.append(path)

    return JsonResponse(all_paths, safe=False)


@requires_user_role(UserRole.Browse)
def find_directed_path_skeletons(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Given a set of two or more skeleton Ids, find directed paths of connected neurons between them, for a maximum inner path length as given (i.e. origin and destination not counted), and return the nodes of those paths, including the provided source and target nodes.
        Conceptually identical to find_directed_paths but far more performant. """

    origin_skids = set(int(v) for k,v in request.POST.items() if k.startswith('sources['))
    target_skids = set(int(v) for k,v in request.POST.items() if k.startswith('targets['))

    if len(origin_skids) < 1 or len(target_skids) < 1:
        raise Exception('Need at least 1 skeleton IDs for both sources and targets to find directed paths!')

    max_n_hops = int(request.POST.get('n_hops', 2))
    min_synapses = int(request.POST.get('min_synapses', -1)) # type: Union[int,float]
    if -1 == min_synapses:
        min_synapses = float('inf')

    cursor = connection.cursor()
    relations = _relations(cursor, project_id)

    def fetch_adjacent(cursor, skids, relation1, relation2, min_synapses) -> Iterator[Any]:
        """ Return the list of skids one hop away from the given skids. """
        cursor.execute("""
        SELECT tc2.skeleton_id
        FROM treenode_connector tc1,
             treenode_connector tc2
        WHERE tc1.project_id = %s
          AND tc1.skeleton_id in (%s)
          AND tc1.connector_id = tc2.connector_id
          AND tc1.skeleton_id != tc2.skeleton_id
          AND tc1.relation_id = %s
          AND tc2.relation_id = %s
        GROUP BY tc1.skeleton_id, tc2.skeleton_id
        HAVING count(*) >= %s
        """ % (int(project_id),
              ','.join(str(int(skid)) for skid in skids),
              int(relation1),
              int(relation2),
              float(min_synapses)))
        return chain.from_iterable(cursor.fetchall())

    pre = relations['presynaptic_to']
    post = relations['postsynaptic_to']

    def fetch_fronts(cursor, skids, max_n_hops, relation1, relation2, min_synapses) -> List[Set]:
        fronts = [set(skids)]
        for n_hops in range(1, max_n_hops):
            adjacent = set(fetch_adjacent(cursor, fronts[-1], relation1, relation2, min_synapses))
            for front in fronts:
                adjacent -= front
            if len(adjacent) > 0:
                fronts.append(adjacent)
            else:
                break
        # Fill in the rest
        while len(fronts) < max_n_hops:
            fronts.append(set())
        return fronts

    origin_fronts = fetch_fronts(cursor, origin_skids, max_n_hops, pre, post, min_synapses)
    target_fronts = fetch_fronts(cursor, target_skids, max_n_hops, post, pre, min_synapses)

    skeleton_ids = origin_fronts[0].union(target_fronts[0])

    for i in range(1, max_n_hops):
        skeleton_ids = skeleton_ids.union(origin_fronts[i].intersection(target_fronts[max_n_hops -i]))

    return JsonResponse(tuple(skeleton_ids), safe=False)

