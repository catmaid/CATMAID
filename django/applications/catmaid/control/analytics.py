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
            0: "Two or more times postsynaptic to the same connector",
            1: "Autapse",
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
    
    # Retrieve all connectors, with their associated pre- or post-synaptic treenodes.
    # In other words, retrieve connectors that are pre- or postsynaptic to treenodes
    # of the skeleton.
    cursor.execute('''
    SELECT treenode.id,
           treenode_connector.relation_id,
           connector.id
    FROM treenode,
         connector,
         treenode_connector
    WHERE treenode.skeleton_id = %s
      AND treenode_connector.skeleton_id = treenode.skeleton_id
      AND treenode_connector.treenode_id = treenode.id
      AND treenode_connector.connector_id = connector.id
      AND treenode_connector.relation_id IN (%s, %s)
    ''' % (skeleton_id, str(relations[PRE]), str(relations[POST])))

    Connection = namedtuple('Connection', ['treenode_id', 'relation_id', 'connector_id'])

    synapses = {PRE: [],
                POST: []}
    for row in cursor.fetchall():
        synapses[relations[row[1]]].append(Connection(row[0], row[1], row[2]))

    pre = set(c.connector_id for c in synapses[PRE])
    post = set(c.connector_id for c in synapses[POST])
    issues = []
   
    # Type 0: two or more times postsynaptic to the same connector
    seen = set()
    for c in synapses[POST]:
        if c.connector_id in seen:
            issues.append((0, c.treenode_id))
        seen.add(c.connector_id)
    seen = None

    # Type 1: autapse
    autapses  = pre.intersection(post)
    for connector_id in autapses:
        issues.append((1, connector_id))
    autapses = None

    # Type 2: presynaptic connector without postsynaptic treenodes
    if pre:
        cursor.execute('''
        SELECT connector_id
        FROM treenode_connector
        WHERE connector_id IN (%s)
          AND relation_id = '%s'
        GROUP BY connector_id
        ''' % (",".join(str(connector_id) for connector_id in pre), str(relations[POST])))
        for connector_id in pre.difference(set(row[0] for row in cursor.fetchall())):
            issues.append((2, connector_id))

    # Type 3: postsynaptic connector without presynaptic treenodes
    if post:
        cursor.execute('''
        SELECT connector_id
        FROM treenode_connector
        WHERE connector_id in (%s)
          AND relation_id = '%s'
        GROUP BY connector_id
        ''' % (",".join(str(connector_id) for connector_id in post), str(relations[PRE])))
        for connector_id in post.difference(set(row[0] for row in cursor.fetchall())):
            issues.append((3, connector_id))

    # Type 4: potentially duplicated synapses (or triplicated, etc): same pre skeleton, same treenodes or parent/child (i.e. adjacent)
    cursor.execute('''
    SELECT post1.treenode_id, count(*)
    FROM treenode t1,
         treenode t2,
         treenode_connector pre1,
         treenode_connector pre2,
         treenode_connector post1,
         treenode_connector post2,
         relation presynaptic_to,
         relation postsynaptic_to
    WHERE t1.id = post1.treenode_id
      AND t2.id = post2.treenode_id
      AND (   t1.id = t2.id
           OR t1.parent_id = t2.id
           OR t2.parent_id = t1.id)
      AND pre1.skeleton_id = pre2.skeleton_id
      AND pre1.skeleton_id = %s
      AND pre1.connector_id = post1.connector_id
      AND pre2.connector_id = post2.connector_id
      AND presynaptic_to.relation_name = 'presynaptic_to'
      AND postsynaptic_to.relation_name = 'postsynaptic_to'
      AND pre1.relation_id = presynaptic_to.id
      AND pre2.relation_id = presynaptic_to.id
      AND post1.relation_id = postsynaptic_to.id
      AND post2.relation_id = postsynaptic_to.id
    GROUP BY post1.treenode_id
    ''' % skeleton_id)
    for row in cursor.fetchall():
        issues.append((4, row[0]))

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
