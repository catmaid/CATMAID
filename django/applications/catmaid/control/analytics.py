from django.db import connection
from django.http import HttpResponse
from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole
from collections import namedtuple, defaultdict
from itertools import chain, islice
from functools import partial
from networkx import Graph, single_source_shortest_path
import json

@requires_user_role(UserRole.Browse)
def analyze_skeletons(request, project_id=None):
    project_id = int(project_id)
    skids = [int(v) for k,v in request.POST.iteritems() if k.startswith('skeleton_ids[')]
    s_skids = ",".join(map(str, skids))
    extra = int(request.POST.get('extra', 0))
    adjacents = int(request.POST.get('adjacents', 0))

    if not skids:
        raise ValueError("No skeleton IDs provided")

    cursor = connection.cursor()

    query = '''
        SELECT tc2.skeleton_id
        FROM treenode_connector tc1,
             treenode_connector tc2,
             relation r1,
             relation r2
        WHERE tc1.skeleton_id IN (%s)
          AND tc1.relation_id = r1.id
          AND %s
          AND tc1.connector_id = tc2.connector_id
          AND tc2.relation_id = r2.id
          AND %s
        GROUP BY tc2.skeleton_id'''

    if 0 == extra:
        # Just skids
        pass
    elif 1 == extra:
        # Include downstream skeletons
        cursor.execute(query % (s_skids, "r1.relation_name = 'presynaptic_to'", "r2.relation_name = 'postsynaptic_to'"))
        skids.extend([s[0] for s in cursor.fetchall()])
    elif 2 == extra:
        # Include upstream skeletons
        cursor.execute(query % (s_skids, "r1.relation_name = 'postsynaptic_to'", "r2.relation_name = 'presynaptic_to'"))
        skids.extend([s[0] for s in cursor.fetchall()])
    elif 3 == extra:
        # Include both upstream and downstream skeletons
        cursor.execute(query % (s_skids, "(r1.relation_name = 'presynaptic_to' OR r1.relation_name = 'postsynaptic_to')", "(r2.relation_name = 'presynaptic_to' OR r2.relation_name = 'postsynaptic_to')"))
        skids.extend([s[0] for s in cursor.fetchall()])


    # Obtain neuron names
    cursor.execute('''
    SELECT cici.class_instance_a, ci.name
    FROM class_instance_class_instance cici,
         class_instance ci,
         relation r
    WHERE cici.class_instance_a IN (%s)
      AND cici.class_instance_b = ci.id
      AND cici.relation_id = r.id
      AND r.relation_name = 'model_of'
    ''' % ",".join(map(str, skids)))

    blob = {'issues': tuple((skid, _analyze_skeleton(project_id, skid, adjacents)) for skid in skids),
            'names': dict(cursor.fetchall()),
            0: "Autapse",
            1: "Two or more times postsynaptic to the same connector",
            2: "Connector without postsynaptic targets",
            3: "Connector without presynaptic skeleton",
            4: "Duplicated synapse?",
            5: "End node without end tag",
            6: "TODO tag",
            7: "End-node tag in a non-end node."}

    return HttpResponse(json.dumps(blob))

def _analyze_skeleton(project_id, skeleton_id, adjacents):
    """ Takes a skeleton and returns a list of potentially problematic issues,
    as a list of tuples of two values: issue type and treenode ID.
    adjacents: the number of nodes in the paths starting at a node when checking for duplicated connectors.
    """
    project_id = int(project_id)
    skeleton_id = int(skeleton_id)
    cursor = connection.cursor()

    PRE = 'presynaptic_to'
    POST = 'postsynaptic_to'

    # Retrieve relation IDs vs names
    cursor.execute('''
    SELECT id, relation_name
    FROM relation
    WHERE project_id = %s
      AND (relation_name = '%s'
           OR relation_name = '%s')
    ''' % (project_id, PRE, POST))

    relations = {} # both ways
    for row in cursor.fetchall():
        relations[row[0]] = row[1]
        relations[row[1]] = row[0]

    # Transform strings to integer IDs
    PRE = relations[PRE]
    POST = relations[POST]

    # Retrieve all connectors and their associated pre- or postsynaptic treenodes,
    # plus the parent treenodes of these.
    cursor.execute('''
    SELECT tc1.connector_id,
           tc1.relation_id,
           t1.id,
           t1.skeleton_id,
           tc2.relation_id,
           t2.id,
           t2.skeleton_id
    FROM treenode_connector tc1,
         treenode_connector tc2,
         treenode t1,
         treenode t2
    WHERE tc1.skeleton_id = %s
      AND tc1.connector_id = tc2.connector_id
      AND tc1.treenode_id = t1.id
      AND tc2.treenode_id = t2.id
      AND (tc1.relation_id = %s OR tc1.relation_id = %s)
      AND (tc2.relation_id = %s OR tc2.relation_id = %s)
    ''' % (skeleton_id,
           str(PRE), str(POST),
           str(PRE), str(POST)))

    Treenode = namedtuple('Treenode', ['id', 'skeleton_id'])

    # Map of connector_id vs {pre: {Treenode, ...}, post: {Treenode, ...}}
    connectors = defaultdict(partial(defaultdict, set))

    # Condense rows to connectors represented by a map with two entries (PRE and POST),
    # each containing as value a set of Treenode:
    for row in cursor.fetchall():
        s = connectors[row[0]]
        s[row[1]].add(Treenode(row[2], row[3]))
        # The 'other' could be null
        if row[4]:
            s[row[4]].add(Treenode(row[5], row[6]))

    issues = []

    # Set of IDs of outgoing connectors
    pre_connector_ids = set()

    for connector_id, connector in connectors.iteritems():
        pre = connector[PRE]
        post = connector[POST]
        if pre and post:
            for a in pre:
                for b in post:
                    if a.skeleton_id == b.skeleton_id:
                        # Type 0: autapse
                        issues.append((0, a.id if a.skeleton_id == skeleton_id else b.id))
        if not post:
            # Type 2: presynaptic connector without postsynaptic treenodes
            issues.append((2, iter(pre).next().id))
        if not pre:
            # Type 3: postsynaptic connector without presynaptic treenode
            issues.append((3, iter(post).next().id))
        else:
            if iter(pre).next().skeleton_id != skeleton_id:
                repeats = tuple(t.id for t in post if t.skeleton_id == skeleton_id)
                if len(repeats) > 1:
                    # Type 1: two or more times postsynaptic to the same connector
                    issues.append((1, repeats[0]))
            else:
                pre_connector_ids.add(connector_id)

    # Fetch data for type 4 and 5: all treenode, with tags if any
    cursor.execute('''
    SELECT treenode.id,
           treenode.parent_id,
           class_instance.name
    FROM treenode
             LEFT OUTER JOIN
                 (treenode_class_instance INNER JOIN relation ON (treenode_class_instance.relation_id = relation.id AND relation.relation_name = 'labeled_as') INNER JOIN class_instance ON (treenode_class_instance.class_instance_id = class_instance.id))
             ON (treenode_class_instance.treenode_id = treenode.id)
    WHERE treenode.skeleton_id = %s
    ''' % skeleton_id)

    # Collapse repeated rows into nodes with none or more tags
    nodes = {}
    parents = set()
    root = None
    for row in cursor.fetchall():
        node = nodes.get(row[0])
        if node:
            # Append tag
            node[1].append(row[2])
        else:
            nodes[row[0]] = (row[1], [row[2]])

        if row[1]:
            parents.add(row[1])
        else:
            root = row[0]


    # Type 4: potentially duplicated synapses (or triplicated, etc):
    # Check if two or more connectors share pre treenodes and post skeletons,
    # or pre skeletons and post treenodes,
    # considering the treenode and its parent as a group.
    if adjacents > 0:
        graph = Graph()
        for node_id, props in nodes.iteritems():
            if props[0]:
                # Nodes are added automatically
                graph.add_edge(props[0], node_id)
    else:
        graph = None

    Connector = namedtuple("Connector", ['id', 'treenode_id', 'treenodes', 'skeletons'])

    # Check if there are any duplicated presynaptic connectors
    pre_connectors = []
    for connector_id in pre_connector_ids:
        c = connectors[connector_id]
        treenode_id = iter(c[PRE]).next().id
        pre_treenodes = set(chain.from_iterable(single_source_shortest_path(graph, treenode_id, adjacents).values()))
        post_skeletons = set(t.skeleton_id for t in c[POST])
        pre_connectors.append(Connector(connector_id, treenode_id, pre_treenodes, post_skeletons))

    def issue4s(cs):
        for i, c1 in enumerate(cs):
            for c2 in islice(cs, i+1, None):
                if (c1.treenodes & c2.treenodes) and (c1.skeletons & c2.skeletons):
                    # Type 4: potentially duplicated connector
                    issues.append((4, c1.treenode_id))
                    if c1.treenode_id != c2.treenode_id:
                        issues.append((4, c2.treenode_id))

    issue4s(pre_connectors)

    # Check if there are any duplicated postsynaptic connectors
    post_connectors = []
    for connector_id, c in connectors.iteritems():
        if connector_id in pre_connector_ids:
            continue
        treenode_id = (t.id for t in c[POST] if t.skeleton_id == skeleton_id).next()
        pre_skeletons = set(t.skeleton_id for t in c[PRE])
        post_treenodes = set(chain.from_iterable(single_source_shortest_path(graph, treenode_id, adjacents).values()))
        post_connectors.append(Connector(connector_id, treenode_id, post_treenodes, pre_skeletons))

    issue4s(post_connectors)


    # Type 5: end node without a tag
    # Type 6: node with a TODO tag
    # Type 7: root, slab or branch node with a tag like 'ends', 'not a branch', 'uncertain end', or 'uncertain continuation'
    end_labels = set(['ends', 'not a branch', 'uncertain end', 'uncertain continuation', 'soma', 'nerve out'])
    if root in parents:
        parents.remove(root) # Consider the root as a leaf node
    for node_id, props in nodes.iteritems():
        labels = set(props[1])
        if node_id not in parents:
            if not (labels & end_labels):
                # Type 5: node is a leaf without an end-node label
                issues.append((5, node_id))
        elif labels & end_labels:
            # Type 7: node is not a leaf but has an end-node label
            issues.append((7, node_id))
        if 'TODO' in labels:
            # Type 6: node with a tag containing the string 'TODO'
            issues.append((6, node_id))

    return issues
