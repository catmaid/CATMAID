import json
from django.db import connection
from django.http import HttpResponse
from catmaid.control.authentication import requires_user_role, UserRole
from itertools import combinations
import networkx as nx
from collections import defaultdict
from functools import partial

def _next_circle(skeleton_set, cursor):
    """ Return a dictionary of skeleton IDs in the skeleton_set vs a dictionary of connected skeletons vs how many connections."""
    cursor.execute('''
    SELECT tc1.skeleton_id, tc1.relation_id, tc2.skeleton_id
    FROM treenode_connector tc1,
         treenode_connector tc2
    WHERE tc1.skeleton_id in (%s)
      AND tc1.connector_id = tc2.connector_id
      AND tc1.skeleton_id != tc2.skeleton_id
      AND tc1.relation_id != tc2.relation_id
    ''' % ','.join(str(skid) for skid in skeleton_set))
    connections = defaultdict(partial(defaultdict, partial(defaultdict, int)))
    for row in cursor.fetchall():
        connections[row[0]][row[1]][row[2]] += 1
    return connections


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def circles_of_hell(request, project_id=None):
    """ Given a set of one or more skeleton IDs, find all skeletons that connect
    them (n_circles=1), or that connect to others that connect them (n_circles=2), etc.
    Returns a list of unique skeleton IDs that exclude the ones provided as argument.
    """
    n_circles = int(request.POST.get('n_circles', 1))
    if n_circles < 1:
        raise Exception("Requires at least one circle.")

    min_pre  = int(request.POST.get('min_pre',  0))
    min_post = int(request.POST.get('min_post', 0))

    if -1 == min_pre and -1 == min_post:
        raise Exception("Can't grow: not retrieving any pre or post.")
    if -1 == min_pre:
        min_pre = float('inf')
    if -1 == min_post:
        min_post = float('inf')

    first_circle = set(int(v) for k,v in request.POST.iteritems() if k.startswith('skeleton_ids['))

    if not first_circle:
        raise Exception("No skeletons were provided.")

    cursor = connection.cursor()

    cursor.execute("SELECT relation_name, id FROM relation WHERE relation_name = 'presynaptic_to' OR relation_name = 'postsynaptic_to'")
    relations = dict(cursor.fetchall())
    mins = {}
    mins[relations['presynaptic_to']]  = min_post # inverted: all postsynaptic to the set
    mins[relations['postsynaptic_to']] = min_pre # inverted: all presynaptic to the set

    current_circle = first_circle
    all_circles = first_circle

    while n_circles > 0 and current_circle:
        n_circles -= 1
        connections = _next_circle(current_circle, cursor)
        next_circle = set(skID for c in connections.itervalues() for relationID, cs in c.iteritems() for skID, count in cs.iteritems() if count >= mins[relationID])
        current_circle = next_circle - all_circles
        all_circles = all_circles.union(next_circle)

    return HttpResponse(json.dumps(tuple(all_circles - first_circle)))

