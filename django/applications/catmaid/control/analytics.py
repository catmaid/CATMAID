from django.db import connection
from django.http import HttpResponse
from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole
from collections import namedtuple, defaultdict
import json

@requires_user_role(UserRole.Annotate)
def analyze_skeletons(request, project_id=None):
    project_id = int(project_id)
    skids = [int(v) for k,v in request.POST.iteritems() if k.startswith('skeleton_ids[')]
    s_skids = ",".join(str(skid) for skid in skids)
    extra = int(request.POST.get('extra', 0))

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
    ''' % ",".join(str(skid) for skid in skids))

    blob = {'issues': tuple((skid, _analyze_skeleton(project_id, skid)) for skid in skids),
            'names': dict(cursor.fetchall()),
            0: "Autapse",
            1: "Two or more times postsynaptic to the same connector",
            2: "Connector without postsynaptic targets",
            3: "Connector without presynaptic skeleton",
            4: "Duplicated synapse?",
            5: "End node without tag",
            6: "TODO tag",
            7: "End-node tag in a non-end node."}

    return HttpResponse(json.dumps(blob))

def _analyze_skeleton(project_id, skeleton_id):
    """ Takes a skeleton and returns a list of potentially problematic issues,
    as a list of tuples of two values: issue type and treenode or connector ID.
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
           t1.parent_id,
           t1.skeleton_id,
           tc2.relation_id,
           t2.id,
           t2.parent_id,
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

    # t1 is always the skeleton, with t2 being the other skeleton
    Treenode = namedtuple('Treenode', ['id', 'parent_id', 'skeleton_id'])

    issues = []

    # Map of connector_id vs {pre: {Treenode, ...}, post: {Treenode, ...}}
    def comp():
        return defaultdict(set)
    connectors = defaultdict(comp)

    # Condense rows to connectors represented by a map with two entries (PRE and POST),
    # each containing as value a set of Treenode:
    for row in cursor.fetchall():
        s = connectors[row[0]]
        s[row[1]].add(Treenode(row[2], row[3], row[4]))
        # The 'other' could be null
        if row[5]:
            s[row[5]].add(Treenode(row[6], row[7], row[8]))

    for connector_id, connector in connectors.iteritems():
        pre = connector[PRE]
        post = connector[POST]
        if pre and post:
            for a in pre:
                for b in post:
                    if a.skeleton_id == b.skeleton_id:
                        # Type 0: autapse
                        issues.append((0, a.id if a.skeleton_id == skeleton_id else b.id))
            if iter(pre).next().skeleton_id != skeleton_id:
                repeats = tuple(t.id for t in post if t.skeleton_id == skeleton_id)
                if len(repeats) > 1:
                    # Type 1: two or more times postsynaptic to the same connector
                    issues.append((1, repeats[0]))
        if not post:
            # Type 2: presynaptic connector without postsynaptic treenodes
            issues.append((2, iter(pre).next().id))
        if not pre:
            # Type 3: postsynaptic connector without presynaptic treenode
            issues.append((3, iter(post).next().id))

    # Type 4: potentially duplicated synapses (or triplicated, etc):
    # Check if two or more connectors share pre treenodes and post skeletons,
    # or pre skeletons and post treenodes,
    # considering the treenode and its parent as a group.
    Sets = namedtuple("Sets", ['pre_treenodes', 'pre_skeletons', 'post_treenodes', 'post_skeletons'])
    sets = {}
    for connector_id, connector in connectors.iteritems():
        pre_treenodes = set()
        pre_skeletons = set()
        for t in connector[PRE]:
            pre_treenodes.add(t.id)
            if t.parent_id:
                pre_treenodes.add(t.parent_id)
            pre_skeletons.add(t.skeleton_id)
        post_treenodes = set()
        post_skeletons = set()
        for t in connector[POST]:
            post_treenodes.add(t.id)
            post_skeletons.add(t.skeleton_id)
        sets[connector_id] = Sets(pre_treenodes, pre_skeletons, post_treenodes, post_skeletons)
    unique_4s = set()
    items = tuple(kv for kv in sets.iteritems())
    def find(ts):
        for t in ts:
            if t.skeleton_id == skeleton_id:
                return t
    for i, kv in enumerate(items):
        connector_id_1, s1 = kv
        for j in range(i+1, len(items)):
            connector_id_2, s2 = items[j]
            if ((s1.pre_treenodes & s2.pre_treenodes) and (s1.post_skeletons & s2.post_skeletons)) or ((s1.pre_skeletons & s2.pre_skeletons) and (s1.post_treenodes & s2.post_treenodes)):
                # Type 4: potentially duplicated connector
                # Find a treenode_id that belongs to skeleton_id and is pre or postsynaptic to connector_id_1 or connector_id_2
                for ts in (connectors[ci][pp] for ci in (connector_id_1, connector_id_2) for pp in (PRE, POST)):
                    t = find(ts)
                    if t:
                        unique_4s.add(t.id)
                        break
    for uid in unique_4s:
        issues.append((4, uid))

    # Type 5: end node without a tag
    # Type 6: node with a TODO tag
    # Type 7: root, slab or branch node with a tag like 'ends', 'not a branch', 'uncertain end', or 'uncertain continuation'
    cursor.execute('''
    SELECT treenode.id,
           treenode.parent_id,
           (treenode.location).z,
           class_instance.name
    FROM relation,
         class_instance,
         treenode LEFT OUTER JOIN treenode_class_instance ON treenode.id = treenode_class_instance.treenode_id
    WHERE treenode.skeleton_id = %s
      AND treenode_class_instance.relation_id = relation.id
      AND relation.relation_name = 'labeled_as'
      AND treenode_class_instance.class_instance_id = class_instance.id
    ''' % skeleton_id)
    rows = tuple(cursor.fetchall())
    parents = set(row[1] for row in rows)
    end_labels = set(['ends', 'not a branch', 'uncertain end', 'uncertain continuation'])
    for row in rows:
        label = row[3]
        if row[0] not in parents:
            if label not in end_labels:
                # Type 5: node is a leaf without an end-node label
                issues.append((5, row[0]))
        elif label in end_labels:
            # Type 7: node is not a leaf but has an end-node label
            issues.append((7, row[0]))
        if 'TODO' in label:
            # Type 6: node with a tag containing the string 'TODO'
            issues.append((6, row[0]))

    return issues
