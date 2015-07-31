import decimal
import json
import math
import re

from collections import defaultdict

from django.db import connection
from django.http import HttpResponse

from catmaid.models import UserRole, Treenode, BrokenSlice, ClassInstance, \
        ClassInstanceClassInstance
from catmaid.control.authentication import requires_user_role, \
        can_edit_class_instance_or_fail, can_edit_or_fail
from catmaid.control.common import get_relation_to_id_map, \
        get_class_to_id_map, insert_into_log, _create_relation
from catmaid.control.neuron import _delete_if_empty
from catmaid.util import Point3D, is_collinear


def can_edit_treenode_or_fail(user, project_id, treenode_id):
    """ Tests if a user has permissions to edit the neuron which the skeleton of
    the treenode models."""
    info = _treenode_info(project_id, treenode_id)
    return can_edit_class_instance_or_fail(user, info['neuron_id'], 'neuron')


@requires_user_role(UserRole.Annotate)
def create_treenode(request, project_id=None):
    """
    Add a new treenode to the database
    ----------------------------------

    1. Add new treenode for a given skeleton id. Parent should not be empty.
       return: new treenode id
       If the parent's skeleton has a single node and belongs to the
       'Isolated synaptic terminals' group, then reassign ownership
       of the skeleton and the neuron to the user. The treenode remains
       property of the original user who created it.

    2. Add new treenode (root) and create a new skeleton (maybe for a given
       neuron) return: new treenode id and skeleton id.

    If a neuron id is given, use that one to create the skeleton as a model of
    it.
    """

    params = {}
    float_values = {
            'x': 0,
            'y': 0,
            'z': 0,
            'radius': 0}
    int_values = {
            'confidence': 0,
            'useneuron': -1,
            'parent_id': -1}
    string_values = {}
    for p in float_values.keys():
        params[p] = float(request.POST.get(p, float_values[p]))
    for p in int_values.keys():
        params[p] = int(request.POST.get(p, int_values[p]))
    for p in string_values.keys():
        params[p] = request.POST.get(p, string_values[p])

    treenode_id, skeleton_id = _create_treenode(project_id, request.user, request.user,
            params['x'], params['y'], params['z'], params['radius'],
            params['confidence'], params['useneuron'], params['parent_id'],
            neuron_name=request.POST.get('neuron_name', None))

    return HttpResponse(json.dumps({
        'treenode_id': treenode_id,
        'skeleton_id': skeleton_id
    }))

@requires_user_role(UserRole.Annotate)
def insert_treenode(request, project_id=None):
    """
    Create a new treenode between two existing nodes. Its creator and
    creation_date information will be set to information of child node. No node
    will be created, if the node on the edge between the given child and parent
    node.
    """
    # Use creation time, if part of parameter set
    params = {}
    float_values = {
        'x': 0,
        'y': 0,
        'z': 0,
        'radius': 0
    }
    int_values = {
        'confidence': 0,
        'parent_id': -1,
        'child_id': -1
    }
    for p in float_values.keys():
        params[p] = float(request.POST.get(p, float_values[p]))
    for p in int_values.keys():
        params[p] = int(request.POST.get(p, int_values[p]))

    # Find child and parent of new treenode
    child = Treenode.objects.get(pk=params['child_id'])
    parent = Treenode.objects.get(pk=params['parent_id'])

    # Make sure both nodes are actually child and parent
    if not child.parent == parent:
        raise ValueError('The provided nodes need to be child and parent')

    # Make sure the requested location for the new node is on the edge between
    # both existing nodes if the user has no edit permissions on the neuron.
    try:
        can_edit_treenode_or_fail(request.user, project_id, parent.id)
    except:
        child_loc = Point3D(child.location_x, child.location_y, child.location_z)
        parent_loc = Point3D(parent.location_x, parent.location_y, parent.location_z)
        new_node_loc = Point3D(params['x'], params['y'], params['z'])
        if not is_collinear(child_loc, parent_loc, new_node_loc, True):
            raise ValueError('New node location has to be between child and parent')

    # Use creator and creation time for neighboring node that was created last.
    if child.creation_time < parent.creation_time:
        user, time = parent.user, parent.creation_time
    else:
        user, time = child.user, child.creation_time

    # Create new treenode
    treenode_id, skeleton_id = _create_treenode(project_id, user, request.user,
            params['x'], params['y'], params['z'], params['radius'],
            params['confidence'], -1, params['parent_id'], time)

    # Update parent of child to new treenode
    child.parent_id = treenode_id
    child.save()

    return HttpResponse(json.dumps({
        'treenode_id': treenode_id,
        'skeleton_id': skeleton_id
    }))

def _create_treenode(project_id, creator, editor, x, y, z, radius, confidence,
                     neuron_id, parent_id, creation_time=None, neuron_name=None):

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    def insert_new_treenode(parent_id=None, skeleton_id=None):
        """ If the parent_id is not None and the skeleton_id of the parent does
        not match with the skeleton.id, then the database will throw an error
        given that the skeleton_id, being defined as foreign key in the
        treenode table, will not meet the being-foreign requirement.
        """
        new_treenode = Treenode()
        new_treenode.user = creator
        new_treenode.editor = editor
        new_treenode.project_id = project_id
        if creation_time:
            new_treenode.creation_time = creation_time
        new_treenode.location_x = float(x)
        new_treenode.location_y = float(y)
        new_treenode.location_z = float(z)
        new_treenode.radius = int(radius)
        new_treenode.skeleton_id = skeleton_id
        new_treenode.confidence = int(confidence)
        if parent_id:
            new_treenode.parent_id = parent_id
        new_treenode.save()
        return new_treenode

    def relate_neuron_to_skeleton(neuron, skeleton):
        return _create_relation(creator, project_id,
                                relation_map['model_of'], skeleton, neuron)

    response_on_error = ''
    try:
        if -1 != int(parent_id):  # A root node and parent node exist
            # Raise an Exception if the user doesn't have permission to edit
            # the neuron the skeleton of the treenode is modeling.
            can_edit_treenode_or_fail(editor, project_id, parent_id)

            # Select the parent treenode for update to prevent race condition
            # updates to its skeleton ID while this node is being created.
            cursor = connection.cursor()
            cursor.execute('''
                SELECT t.skeleton_id FROM treenode t WHERE t.id = %s
                FOR NO KEY UPDATE OF t
                ''', (parent_id,))
            parent_skeleton_id = cursor.fetchone()[0]

            response_on_error = 'Could not insert new treenode!'
            new_treenode = insert_new_treenode(parent_id, parent_skeleton_id)

            return (new_treenode.id, parent_skeleton_id)
        else:
            # No parent node: We must create a new root node, which needs a
            # skeleton and a neuron to belong to.
            response_on_error = 'Could not insert new treenode instance!'

            new_skeleton = ClassInstance()
            new_skeleton.user = creator
            new_skeleton.project_id = project_id
            new_skeleton.class_column_id = class_map['skeleton']
            new_skeleton.name = 'skeleton'
            new_skeleton.save()
            new_skeleton.name = 'skeleton %d' % new_skeleton.id
            new_skeleton.save()

            if -1 != neuron_id:
                # Check that the neuron to use exists
                if 0 == ClassInstance.objects.filter(pk=neuron_id).count():
                    neuron_id = -1

            if -1 != neuron_id:
                # Raise an Exception if the user doesn't have permission to
                # edit the existing neuron.
                can_edit_class_instance_or_fail(editor, neuron_id, 'neuron')

                # A neuron already exists, so we use it
                response_on_error = 'Could not relate the neuron model to ' \
                                    'the new skeleton!'
                relate_neuron_to_skeleton(neuron_id, new_skeleton.id)

                response_on_error = 'Could not insert new treenode!'
                new_treenode = insert_new_treenode(None, new_skeleton.id)

                return (new_treenode.id, new_skeleton.id)
            else:
                # A neuron does not exist, therefore we put the new skeleton
                # into a new neuron.
                response_on_error = 'Failed to insert new instance of a neuron.'
                new_neuron = ClassInstance()
                new_neuron.user = creator
                new_neuron.project_id = project_id
                new_neuron.class_column_id = class_map['neuron']
                if neuron_name:
                    # Create a regular expression to find allowed patterns. The
                    # first group is the whole {nX} part, while the second group
                    # is X only.
                    counting_pattern = re.compile(r"(\{n(\d+)\})")
                    # Look for patterns, replace all {n} with {n1} to normalize.
                    neuron_name = neuron_name.replace("{n}", "{n1}")

                    if counting_pattern.search(neuron_name):
                        # Find starting values for each substitution.
                        counts = [int(m.groups()[1]) for m in counting_pattern.finditer(neuron_name)]
                        # Find existing matching neurons in database.
                        name_match = counting_pattern.sub("(\d+)", neuron_name)
                        name_pattern = re.compile(name_match)
                        matching_neurons = ClassInstance.objects.filter(
                                project_id=project_id,
                                class_column_id=class_map['neuron'],
                                name__regex=name_match).order_by('name')

                        # Increment substitution values based on existing neurons.
                        for n in matching_neurons:
                            for i, (count, g) in enumerate(zip(counts, name_pattern.search(n.name).groups())):
                                if count == int(g):
                                    counts[i] = count + 1

                        # Substitute values.
                        count_ind = 0
                        m = counting_pattern.search(neuron_name)
                        while m:
                            neuron_name = m.string[:m.start()] + str(counts[count_ind]) + m.string[m.end():]
                            count_ind = count_ind + 1
                            m = counting_pattern.search(neuron_name)

                    new_neuron.name = neuron_name
                else:
                    new_neuron.name = 'neuron'
                    new_neuron.save()
                    new_neuron.name = 'neuron %d' % new_neuron.id

                new_neuron.save()

                response_on_error = 'Could not relate the neuron model to ' \
                                    'the new skeleton!'
                relate_neuron_to_skeleton(new_neuron.id, new_skeleton.id)

                response_on_error = 'Failed to insert instance of treenode.'
                new_treenode = insert_new_treenode(None, new_skeleton.id)

                response_on_error = 'Failed to write to logs.'
                new_location = (new_treenode.location_x, new_treenode.location_y,
                                new_treenode.location_z)
                insert_into_log(project_id, creator.id, 'create_neuron',
                                new_location, 'Create neuron %d and skeleton '
                                '%d' % (new_neuron.id, new_skeleton.id))

                return (new_treenode.id, new_skeleton.id)

    except Exception as e:
        import traceback
        raise Exception("%s: %s %s" % (response_on_error, str(e),
                                       str(traceback.format_exc())))


@requires_user_role(UserRole.Annotate)
def update_parent(request, project_id=None, treenode_id=None):
    treenode_id = int(treenode_id)
    parent_id = int(request.POST.get('parent_id', -1))

    child = Treenode.objects.get(pk=treenode_id)
    parent = Treenode.objects.get(pk=parent_id)

    if (child.skeleton_id != parent.skeleton_id):
        raise Exception("Child node %s is in skeleton %s but parent node %s is in skeleton %s!", \
                        treenode_id, child.skeleton_id, parent_id, parent.skeleton_id)

    child.parent_id = parent_id
    child.save()

    return HttpResponse(json.dumps({'success': True}))


@requires_user_role(UserRole.Annotate)
def update_radius(request, project_id=None, treenode_id=None):
    treenode_id = int(treenode_id)
    radius = float(request.POST.get('radius', -1))
    if math.isnan(radius):
        raise Exception("Radius '%s' is not a number!" % request.POST.get('radius'))
    option = int(request.POST.get('option', 0))
    cursor = connection.cursor()

    if 0 == option:
        # Update radius only for the treenode
        Treenode.objects.filter(pk=treenode_id).update(editor=request.user,
                                                       radius=radius)
        return HttpResponse(json.dumps({'success': True}))

    cursor.execute('''
    SELECT id, parent_id, radius
    FROM treenode
    WHERE skeleton_id = (SELECT t.skeleton_id FROM treenode t WHERE id = %s)
    ''' % treenode_id)

    if 1 == option:
        # Update radius from treenode_id to next branch or end node (included)
        children = defaultdict(list)
        for row in cursor.fetchall():
            children[row[1]].append(row[0])

        include = [treenode_id]
        c = children[treenode_id]
        while 1 == len(c):
            child = c[0]
            include.append(child)
            c = children[child]

        Treenode.objects.filter(pk__in=include).update(editor=request.user,
                                                       radius=radius)
        return HttpResponse(json.dumps({'success': True}))

    if 2 == option:
        # Update radius from treenode_id to prev branch node or root (excluded)
        parents = {}
        children = defaultdict(list)
        for row in cursor.fetchall():
            parents[row[0]] = row[1]
            children[row[1]].append(row[0])

        include = [treenode_id]
        parent = parents[treenode_id]
        while parent and parents[parent] and 1 == len(children[parent]):
            include.append(parent)
            parent = parents[parent]

        Treenode.objects.filter(pk__in=include).update(editor=request.user,
                                                       radius=radius)
        return HttpResponse(json.dumps({'success': True}))

    if 3 == option:
        # Update radius from treenode_id to prev node with radius (excluded)
        parents = {}
        for row in cursor.fetchall():
            if row[2] < 0 or row[0] == treenode_id: # DB default radius is 0 but is initialized to -1 elsewhere
                parents[row[0]] = row[1]

        include = [treenode_id]
        parent = parents[treenode_id]
        while parent in parents:
            include.append(parent)
            parent = parents[parent]

        Treenode.objects.filter(pk__in=include).update(editor=request.user,
                                                       radius=radius)
        return HttpResponse(json.dumps({'success': True}))

    if 4 == option:
        # Update radius from treenode_id to root (included)
        parents = {row[0]: row[1] for row in cursor.fetchall()}

        include = [treenode_id]
        parent = parents[treenode_id]
        while parent:
            include.append(parent)
            parent = parents[parent]

        Treenode.objects.filter(pk__in=include).update(editor=request.user,
                                                       radius=radius)
        return HttpResponse(json.dumps({'success': True}))

    if 5 == option:
        # Update radius of all nodes (in a single query)
        Treenode.objects \
            .filter(skeleton_id=Treenode.objects \
                .filter(pk=treenode_id) \
                .values('skeleton_id')) \
            .update(editor=request.user, radius=radius)
        return HttpResponse(json.dumps({'success': True}))


# REMARK this function went from 1.6 seconds to 400 ms when de-modelized
@requires_user_role(UserRole.Annotate)
def delete_treenode(request, project_id=None):
    """ Deletes a treenode. If the skeleton has a single node, deletes the
    skeleton and its neuron. Returns the parent_id, if any."""
    treenode_id = int(request.POST.get('treenode_id', -1))
    # Raise an exception if the user doesn't have permission to edit the
    # treenode.
    can_edit_or_fail(request.user, treenode_id, 'treenode')
    # Raise an Exception if the user doesn't have permission to edit the neuron
    # the skeleton of the treenode is modeling.
    can_edit_treenode_or_fail(request.user, project_id, treenode_id)

    treenode = Treenode.objects.get(pk=treenode_id)
    parent_id = treenode.parent_id

    response_on_error = ''
    deleted_neuron = False
    try:
        if not parent_id:
            # This treenode is root.
            response_on_error = 'Could not retrieve children for ' \
                'treenode #%s' % treenode_id
            n_children = Treenode.objects.filter(parent=treenode).count()
            response_on_error = "Could not delete root node"
            if n_children > 0:
                # TODO yes you can, the new root is the first of the children,
                # and other children become independent skeletons
                raise Exception("You can't delete the root node when it "
                                "has children.")
            # Get the neuron before the skeleton is deleted. It can't be
            # accessed otherwise anymore.
            neuron = ClassInstance.objects.get(project_id=project_id,
                        cici_via_b__relation__relation_name='model_of',
                        cici_via_b__class_instance_a=treenode.skeleton)
            # Remove the original skeleton. It is OK to remove it if it only had
            # one node, even if the skeleton's user does not match or the user
            # is not superuser. Delete the skeleton, which triggers deleting
            # the ClassInstanceClassInstance relationship with neuron_id
            response_on_error = 'Could not delete skeleton.'
            # Extra check for errors, like having two root nodes
            count = Treenode.objects.filter(skeleton_id=treenode.skeleton_id) \
                .count()
            if 1 == count:
                # deletes as well treenodes that refer to the skeleton
                ClassInstance.objects.filter(pk=treenode.skeleton_id) \
                    .delete()
            else:
                return HttpResponse(json.dumps({"error": "Can't delete " \
                    "isolated node: erroneously, its skeleton contains more " \
                    "than one treenode! Check for multiple root nodes."}))

            # If the neuron modeled by the skeleton of the treenode is empty,
            # delete it.
            response_on_error = 'Could not delete neuron #%s' % neuron.id
            deleted_neuron = _delete_if_empty(neuron.id)

        else:
            # Treenode is not root, it has a parent and perhaps children.
            # Reconnect all the children to the parent.
            response_on_error = 'Could not update parent id of children nodes'
            Treenode.objects.filter(parent=treenode) \
                .update(parent=treenode.parent)

        # Remove treenode
        response_on_error = 'Could not delete treenode.'
        Treenode.objects.filter(pk=treenode_id).delete()
        return HttpResponse(json.dumps({
            'deleted_neuron': deleted_neuron,
            'parent_id': parent_id,
            'skeleton_id': treenode.skeleton_id,
            'success': "Removed treenode successfully."
        }))

    except Exception as e:
        raise Exception(response_on_error + ': ' + str(e))


def _treenode_info(project_id, treenode_id):
    c = connection.cursor()
    # (use raw SQL since we are returning values from several different models)
    c.execute("""
    SELECT
        treenode.skeleton_id,
        ci.name as skeleton_name,
        ci2.id as neuron_id,
        ci2.name as neuron_name
    FROM
        treenode,
        relation r,
        class_instance ci,
        class_instance ci2,
        class_instance_class_instance cici
    WHERE ci.project_id = %s
      AND treenode.id = %s
      AND treenode.skeleton_id = ci.id
      AND ci.id = cici.class_instance_a
      AND ci2.id = cici.class_instance_b
      AND cici.relation_id = r.id
      AND r.relation_name = 'model_of'
    """, (project_id, treenode_id))
    results = [
        dict(zip([col[0] for col in c.description], row))
        for row in c.fetchall()
    ]
    if (len(results) > 1):
        raise ValueError('Found more than one skeleton and neuron for '
                        'treenode %s' % treenode_id)
    elif (len(results) == 0):
        raise ValueError('No skeleton and neuron for treenode %s' % treenode_id)

    return results[0]


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def treenode_info(request, project_id=None):
    treenode_id = int(request.POST.get('treenode_id', -1))
    if treenode_id < 0:
        raise Exception('A treenode id has not been provided!')

    info = _treenode_info(project_id, treenode_id)
    return HttpResponse(json.dumps(info))
