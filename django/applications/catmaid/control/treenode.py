import json

import decimal
from django.http import HttpResponse
from datetime import datetime

from django.db import connection
from django.shortcuts import get_object_or_404
from django.core.exceptions import ObjectDoesNotExist

from catmaid.models import *
from catmaid.fields import Double3D
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.neuron import _in_isolated_synaptic_terminals, _delete_if_empty
import sys


def _create_relation(user, project_id, relation_id, instance_a_id, instance_b_id):
    relation = ClassInstanceClassInstance()
    relation.user = user
    relation.project_id = project_id
    relation.relation_id = relation_id
    relation.class_instance_a_id = instance_a_id
    relation.class_instance_b_id = instance_b_id
    relation.save()
    return relation


def _fetch_targetgroup(user, project_id, targetgroup, part_of_id, class_map):
    """ Depending upon the value of targetgroup, will get or create
    the staging folder for the user, or the Isolated synaptic terminals folder.
    The targetgroup can hold two values: 'Fragments' and 'Isolated synaptic terminals'.
    If 'Fragments', the staging group of the user is returned.
    """
    is_new = False
    if 'Fragments' == targetgroup:
        # Get the general staging folder
        try:
            # TODO this is fragile, should check the parent group chain.
            staging_group = ClassInstance.objects.get(project=project_id, name='Staging')
        except ObjectDoesNotExist as e:
            # Doesn't exist, create it:
            staging_group = ClassInstance()
            staging_group.user = user # TODO should be an admin, but doesn't matter
            staging_group.project_id = project_id
            staging_group.class_column_id = class_map['group']
            staging_group.name = 'Staging'
            staging_group.save()
            root = ClassInstance.objects.get(project=project_id, class_column=class_map['root'])

            _create_relation(user, project_id, part_of_id, staging_group.id, root.id)

        # Get the staging folder for the user doing the request
        name = user.first_name + ' ' + user.last_name + ' (' + user.username + ')'
        try:
            # TODO this is fragile, should check the parent group chain.
            group = ClassInstance.objects.get(project=project_id, name=name)
        except ObjectDoesNotExist as e:
            # Group does not exist: create it
            group = ClassInstance()
            group.user = user
            group.project_id = project_id
            group.class_column_id = class_map['group']
            group.name = name
            group.save()
            _create_relation(user, project_id, part_of_id, group.id, staging_group.id)
            is_new = True

        return group, is_new
    elif 'Isolated synaptic terminals' == targetgroup:
        # Get the group
        try:
            ist_group = ClassInstance.objects.get(project=project_id, name='Isolated synaptic terminals')
        except ObjectDoesNotExist as e:
            # Doesn't exist, create it:
            ist_group = ClassInstance()
            ist_group.user = user # TODO should be an admin, but doesn't matter
            ist_group.project_id = project_id
            ist_group.class_column_id = class_map['group']
            ist_group.name = 'Isolated synaptic terminals'
            ist_group.save()
            root = ClassInstance.objects.get(project=project_id, class_column=class_map['root'])

            _create_relation(user, project_id, part_of_id, ist_group.id, root.id)
            is_new = True
        return ist_group, is_new

def _is_isolated_synaptic_terminal(treenode_id):
    """ Determine if the given treenode is an isolated synaptic terminal,
    by checking if its skeleton is a model_of a neuron that is a part_of
    the Isolated synaptic terminals group.
    Despite the multiple table joins this function takes ~8 ms in a laptop and ~3 ms in a large server."""
    cursor = connection.cursor()
    cursor.execute('''
    SELECT count(*)
    FROM treenode,
         class_instance_class_instance c1,
         class_instance_class_instance c2,
         class_instance c,
         relation r1,
         relation r2
    WHERE treenode.id = %s
      AND c1.class_instance_a = treenode.skeleton_id
      AND c1.relation_id = r1.id
      AND r1.relation_name = 'model_of'
      AND c1.class_instance_b = c2.class_instance_a
      AND c2.relation_id = r2.id
      AND r2.relation_name = 'part_of'
      AND c2.class_instance_b = c.id
      AND c.name = 'Isolated synaptic terminals'
    ''' % int(treenode_id))
    return cursor.fetchone()[0] > 0


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

    2. Add new treenode (root) and create a new skeleton (maybe for a given neuron)
    return: new treenode id and skeleton id.

    If a neuron id is given, use that one to create the skeleton as a model of it.
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
    string_values = {
            'targetgroup': 'none'}
    for p in float_values.keys():
        params[p] = float(request.POST.get(p, float_values[p]))
    for p in int_values.keys():
        params[p] = int(request.POST.get(p, int_values[p]))
    for p in string_values.keys():
        params[p] = request.POST.get(p, string_values[p])

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    def insert_new_treenode(parent_id=None, skeleton=None):
        """ If the parent_id is not None and the skeleton_id of the parent does not match with the skeleton.id, then the database will throw an error given that the skeleton_id, being defined as foreign key in the treenode table, will not meet the being-foreign requirement.
        """
        new_treenode = Treenode()
        new_treenode.user = request.user
        new_treenode.editor = request.user
        new_treenode.project_id = project_id
        new_treenode.location = Double3D(float(params['x']), float(params['y']), float(params['z']))
        new_treenode.radius = int(params['radius'])
        new_treenode.skeleton = skeleton
        new_treenode.confidence = int(params['confidence'])
        if parent_id:
            new_treenode.parent_id = parent_id
        new_treenode.save()
        return new_treenode

    def relate_neuron_to_skeleton(neuron, skeleton):
        return _create_relation(request.user, project_id, relation_map['model_of'], skeleton, neuron)

    response_on_error = ''
    try:
        if -1 != int(params['parent_id']):  # A root node and parent node exist
            parent_treenode = Treenode.objects.get(pk=params['parent_id'])
            has_changed_group = False
            if parent_treenode.parent_id is None and 1 == Treenode.objects.filter(skeleton_id=parent_treenode.skeleton_id).count():
                # Node is isolated. If it is a part_of 'Isolated synapatic terminals',
                # then reassign the skeleton's and neuron's user_id to the user.
                # The treenode remains the property of the original user.
                neuron_id, skeleton_id = _maybe_move_terminal_to_staging(request.user, project_id, parent_treenode.id)
                has_changed_group = True

            response_on_error = 'Could not insert new treenode!'
            skeleton = ClassInstance.objects.get(pk=parent_treenode.skeleton_id)
            new_treenode = insert_new_treenode(params['parent_id'], skeleton)

            return HttpResponse(json.dumps({'treenode_id': new_treenode.id, 'skeleton_id': skeleton.id, 'has_changed_group': has_changed_group}))

        else:
            # No parent node: We must create a new root node, which needs a
            # skeleton and a neuron to belong to.
            response_on_error = 'Could not insert new treenode instance!'

            new_skeleton = ClassInstance()
            new_skeleton.user = request.user
            new_skeleton.project_id = project_id
            new_skeleton.class_column_id = class_map['skeleton']
            new_skeleton.name = 'skeleton'
            new_skeleton.save()
            new_skeleton.name = 'skeleton %d' % new_skeleton.id
            new_skeleton.save()

            if -1 == params['useneuron']:
                # Check that the neuron to use exists
                if 0 == ClassInstance.objects.filter(pk=params['useneuron']).count():
                    params['useneuron'] = -1

            if -1 != params['useneuron']:  # A neuron already exists, so we use it
                response_on_error = 'Could not relate the neuron model to the new skeleton!'
                relate_neuron_to_skeleton(params['useneuron'], new_skeleton.id)

                response_on_error = 'Could not insert new treenode!'
                new_treenode = insert_new_treenode(None, new_skeleton)

                return HttpResponse(json.dumps({
                    'treenode_id': new_treenode.id,
                    'skeleton_id': new_skeleton.id,
                    'neuron_id': params['useneuron']}))
            else:
                # A neuron does not exist, therefore we put the new skeleton
                # into a new neuron, and put the new neuron into a group.
                # Instead of placing the new neuron in the Fragments group,
                # place the new neuron in the staging area of the user.

                # Fetch the parent group: can be the user staging group
                # or the Isolated synaptic terminals group
                parent_group, is_new = _fetch_targetgroup(request.user, project_id, params['targetgroup'], relation_map['part_of'], class_map)
                response_on_error = 'Failed to insert new instance of a neuron.'
                new_neuron = ClassInstance()
                new_neuron.user = request.user
                new_neuron.project_id = project_id
                new_neuron.class_column_id = class_map['neuron']
                new_neuron.name = 'neuron'
                new_neuron.save()
                new_neuron.name = 'neuron %d' % new_neuron.id
                new_neuron.save()

                response_on_error = 'Could not relate the neuron model to the new skeleton!'
                relate_neuron_to_skeleton(new_neuron.id, new_skeleton.id)

                # Add neuron to the group
                response_on_error = 'Failed to insert part_of relation between neuron id and fragments group.'
                _create_relation(request.user, project_id, relation_map['part_of'], new_neuron.id, parent_group.id)

                response_on_error = 'Failed to insert instance of treenode.'
                new_treenode = insert_new_treenode(None, new_skeleton)

                response_on_error = 'Failed to write to logs.'
                insert_into_log(project_id, request.user.id, 'create_neuron', new_treenode.location, 'Create neuron %d and skeleton %d' % (new_neuron.id, new_skeleton.id))

                return HttpResponse(json.dumps({
                    'treenode_id': new_treenode.id,
                    'skeleton_id': new_skeleton.id,
                    'refresh': is_new
                    }))

    except Exception as e:
        import traceback
        raise Exception(response_on_error + ':' + str(e) + str(traceback.format_exc()))


@requires_user_role(UserRole.Annotate)
def create_interpolated_treenode(request, project_id=None):
    params = {}
    decimal_values = {
            'x': 0,
            'y': 0,
            'z': 0,
            'resx': 0,
            'resy': 0,
            'resz': 0,
            'stack_translation_z': 0,
            'radius': -1}
    int_values = {
            'parent_id': 0,
            'stack_id': 0,
            'confidence': 5}
    for p in decimal_values.keys():
        params[p] = decimal.Decimal(request.POST.get(p, decimal_values[p]))
    for p in int_values.keys():
        params[p] = int(request.POST.get(p, int_values[p]))

    last_treenode_id, skeleton_id = _create_interpolated_treenode(request, params, project_id, False)
    return HttpResponse(json.dumps({'treenode_id': last_treenode_id}))


def _create_interpolated_treenode(request, params, project_id, skip_last):
    """ Create interpolated treenodes between the 'parent_id' and the clicked x,y,z
    coordinate. The skip_last is to prevent the creation of the last node, used by
    the join_skeletons_interpolated. """
    response_on_error = 'Could not create interpolated treenode'
    try:
        parent = Treenode.objects.get(pk=params['parent_id'])
        parent_skeleton_id = parent.skeleton_id
        loc = parent.location
        parent_x = decimal.Decimal(loc.x)
        parent_y = decimal.Decimal(loc.y)
        parent_z = decimal.Decimal(loc.z)

        steps = abs((params['z'] - parent_z) / params['resz']).quantize(decimal.Decimal('1'), rounding=decimal.ROUND_FLOOR)
        if steps == decimal.Decimal(0):
            steps = decimal.Decimal(1)

        dx = (params['x'] - parent_x) / steps
        dy = (params['y'] - parent_y) / steps
        dz = (params['z'] - parent_z) / steps

        broken_slices = set(int(bs.index) for bs in BrokenSlice.objects.filter(stack=params['stack_id']))
        sign = -1 if dz < 0 else 1

        # Loop the creation of treenodes in z resolution steps until target
        # section is reached
        parent_id = params['parent_id']
        atn_slice_index = ((parent_z - params['stack_translation_z']) / params['resz']).quantize(decimal.Decimal('1'), rounding=decimal.ROUND_FLOOR)
        for i in range(1, steps + (0 if skip_last else 1)):
            if (atn_slice_index + i * sign) in broken_slices:
                continue
            response_on_error = 'Error while trying to insert treenode.'
            new_treenode = Treenode()
            new_treenode.user_id = request.user.id
            new_treenode.editor_id = request.user.id
            new_treenode.project_id = project_id
            new_treenode.location = Double3D(
                    float(parent_x + dx * i),
                    float(parent_y + dy * i),
                    float(parent_z + dz * i))
            new_treenode.radius = params['radius']
            new_treenode.skeleton_id = parent_skeleton_id
            new_treenode.confidence = params['confidence']
            new_treenode.parent_id = parent_id  # This is not a root node.
            new_treenode.save()

            parent_id = new_treenode.id

        # parent_id contains the ID of the last added node
        return parent_id, parent_skeleton_id

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


@requires_user_role(UserRole.Annotate)
def update_treenode_table(request, project_id=None):
    property_name = request.POST.get('type', None)
    treenode_id = request.POST.get('id', None)
    property_value = request.POST.get('value', None)

    if None in [property_name, treenode_id, property_value]:
        raise Exception('Need type, treenode id and value.')
    else:
        treenode_id = int(treenode_id)
        property_value = int(property_value)

    if property_name not in ['confidence', 'radius']:
        raise Exception('Can only modify confidence and radius.')

    response_on_error = ''
    try:
        response_on_error = 'Could not find treenode with ID %s.' % treenode_id
        treenode = get_object_or_404(Treenode, project=project_id, id=treenode_id)
        response_on_error = 'Could not update %s for treenode with ID %s.' % (property_name, treenode_id)
        setattr(treenode, property_name, property_value)
        treenode.editor = request.user
        treenode.save()

        return HttpResponse(json.dumps({'success': 'Updated %s of treenode %s to %s.' % (property_name, treenode_id, property_value)}))

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))

@requires_user_role(UserRole.Annotate)
def update_radius(request, project_id=None, treenode_id=None):
    treenode_id = int(treenode_id)
    radius = float(request.POST.get('radius', -1))
    option = int(request.POST.get('option', 0))
    cursor = connection.cursor()

    if 0 == option:
        # Update radius only for the treenode
        Treenode.objects.filter(pk=treenode_id).update(editor=request.user, radius=radius)
        return HttpResponse(json.dumps({'success': True}))
    
    cursor.execute('''
    SELECT id, parent_id FROM treenode WHERE skeleton_id = (SELECT t.skeleton_id FROM treenode t WHERE id = %s)
    ''' % treenode_id)

    if 1 == option:
        # Update radius from treenode_id to the next branch or end node (included)
        children = defaultdict(list)
        for row in cursor.fetchall():
            children[row[1]].append(row[0])

        include = [treenode_id]
        c = children[treenode_id]
        while 1 == len(c):
            child = c[0]
            include.append(child)
            c = children[child]

        Treenode.objects.filter(pk__in=include).update(editor=request.user, radius=radius)
        return HttpResponse(json.dumps({'success': True}))
    
    if 2 == option:
        # Update radius from treenode_id to the previous branch node or root (excluded)
        parents = {}
        children = defaultdict(list)
        for row in cursor.fetchall():
            parents[row[0]] = row[1]
            children[row[1]].append(row[0])

        include = [treenode_id]
        parent = parents[treenode_id]
        while parent and 1 == len(children[parent]):
            include.append(parent)
            parent = parents[parent]

        Treenode.objects.filter(pk__in=include).update(editor=request.user, radius=radius)
        return HttpResponse(json.dumps({'success': True}))

    if 3 == option:
        # Update radius from treenode_id to root (included)
        parents = {row[0]: row[1] for row in cursor.fetchall()}

        include = [treenode_id]
        parent = parents[treenode_id]
        while parent:
            include.append(parent)
            parent = parents[parent]

        Treenode.objects.filter(pk__in=include).update(editor=request.user, radius=radius)
        return HttpResponse(json.dumps({'success': True}))

    if 4 == option:
        # Update radius of all nodes (in a single query)
        Treenode.objects.filter(skeleton_id=Treenode.objects.filter(pk=treenode_id).values('skeleton_id')).update(editor=request.user, radius=radius)
        return HttpResponse(json.dumps({'success': True}))


# REMARK this function went from 1.6 seconds to 400 ms when de-modelized
@requires_user_role(UserRole.Annotate)
def delete_treenode(request, project_id=None):
    """ If the skeleton has a single node, deletes the skeleton, and if so, if the skeleton is a model_of a neuron that was part_of group 'Isolated synaptic terminals', deletes the neuron. Returns the parent_id, if any."""
    treenode_id = int(request.POST.get('treenode_id', -1))
    # Raise an Exception if the user doesn't own the treenode or is not superuser
    can_edit_or_fail(request.user, treenode_id, 'treenode')
    #
    treenode = Treenode.objects.get(pk=treenode_id)
    parent_id = treenode.parent_id

    response_on_error = ''
    try:
        cursor = connection.cursor()
        if not parent_id:
            # This treenode is root.
            response_on_error = 'Could not retrieve children for treenode #%s' % treenode_id
            n_children = Treenode.objects.filter(parent=treenode).count()
            response_on_error = "Can't delete root node when it has children"
            if n_children > 0:
                # TODO yes you can, the new root is the first of the children, and other children become independent skeletons
                raise Exception("You can't delete the root node when it has children.")
            # Remove the original skeleton.
            # It is OK to remove it if it only had one node,
            # even if the skeleton's user does not match or the user is not superuser.
            # Fetch the neuron id, if it was a placeholder under 'Isolated synaptic terminals' group
            neuron_id = _in_isolated_synaptic_terminals(treenode.skeleton_id)
            # Delete the skeleton, which triggers deleting the ClassInstanceClassInstance relationship with neuron_id
            response_on_error = 'Could not delete skeleton.'
            # Extra check for errors, like having two root nodes
            count = Treenode.objects.filter(skeleton_id=treenode.skeleton_id).count()
            if 1 == count:
                ClassInstance.objects.filter(pk=treenode.skeleton_id).delete() # deletes as well treenodes that refer to the skeleton
            else:
                return HttpResponse(json.dumps({"error": "Can't delete isolated node: erroneously, its skeleton contains more than one treenode! Check for multiple root nodes."}))
            
            # If the neuron was part of the 'Isolated synaptic terminals' and no other skeleton is a model_of it, delete it
            if neuron_id:
                response_on_error = 'Could not delete neuron #%s' % neuron_id
                if _delete_if_empty(neuron_id):
                    print >> sys.stderr, "DELETED neuron %s from IST" % neuron_id

        else:
            # Treenode is not root, it has a parent and perhaps children.
            # Reconnect all the children to the parent.
            response_on_error = 'Could not update parent id of children nodes'
            Treenode.objects.filter(parent=treenode).update(parent=treenode.parent)

        # Remove treenode
        response_on_error = 'Could not delete treenode.'
        Treenode.objects.filter(pk=treenode_id).delete()
        return HttpResponse(json.dumps({'parent_id': parent_id}))

    except Exception as e:
        raise Exception(response_on_error + ': ' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def treenode_info(request, project_id=None):
    treenode_id = int(request.POST.get('treenode_id', -1))
    if treenode_id < 0:
        raise Exception('A treenode id has not been provided!')

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
        raise Exception('Found more than one skeleton and neuron for treenode %s' % treenode_id)
    elif (len(results) == 0):
        raise Exception('No skeleton and neuron for treenode %s' % treenode_id)
    else:
        return HttpResponse(json.dumps(results[0]))



@requires_user_role(UserRole.Annotate)
def join_skeletons_interpolated(request, project_id=None):
    """ Join two skeletons, adding nodes in between the two nodes to join
    if they are separated by more than one section in the Z axis."""
    # Parse parameters
    decimal_values = {
            'x': 0,
            'y': 0,
            'z': 0,
            'resx': 0,
            'resy': 0,
            'resz': 0,
            'stack_translation_z': 0,
            'radius': -1}
    int_values = {
            'from_id': 0,
            'to_id': 0,
            'stack_id': 0,
            'confidence': 5}
    params = {}
    for p in decimal_values.keys():
        params[p] = decimal.Decimal(request.POST.get(p, decimal_values[p]))
    for p in int_values.keys():
        params[p] = int(request.POST.get(p, int_values[p]))
    # Copy of the id for _create_interpolated_treenode
    params['parent_id'] = params['from_id']
    params['skeleton_id'] = Treenode.objects.get(pk=params['from_id']).skeleton_id

    # Create interpolate nodes skipping the last one 
    last_treenode_id, skeleton_id = _create_interpolated_treenode(request, params, project_id, True)

    # Link last_treenode_id to to_id
    # TODO this is not elegant
    from skeleton import _join_skeleton
    _join_skeleton(request.user, last_treenode_id, params['to_id'], project_id)

    return HttpResponse(json.dumps({'treenode_id': params['to_id']}))


def _maybe_move_terminal_to_staging(user, project_id, treenode_id):
    """ Given a treenode_id, determine whether its skeleton is a model_of a neuron
    that is currently a part_of the Isolated synaptic terminals group,
    and if so, move the neuron to the user's staging group
    and also change the ownership of the skeleton and neuron
    to the user (realize these were just placeholders to wrap
    the single treenode). The owner of the treenode remains the same.
    Returns a tuple with the neuron_id, skeleton_id. """
    treenode_id = int(treenode_id)
    # Find the ID of the neuron (cc2.class_instance_a) for which the skeleton is a model_of
    # and the ID of the cici (cc2.id) that declares the neuron to be a part_of Isolated synaptic terminals.
    # If the neuron is not a part of Isolated synaptic terminals, then it will return zero rows.
    cursor = connection.cursor();
    cursor.execute('''
    SELECT
        cc2.class_instance_a,
        cc2.id,
        r2.id,
        t.skeleton_id
    FROM
        class_instance_class_instance cc1,
        class_instance_class_instance cc2,
        class_instance,
        relation r1,
        relation r2,
        treenode t
    WHERE
          t.id = %s
      AND cc1.class_instance_a = t.skeleton_id
      AND cc1.relation_id = r1.id
      AND r1.relation_name = 'model_of'
      AND cc1.class_instance_b = cc2.class_instance_a
      AND cc2.relation_id = r2.id
      AND r2.relation_name = 'part_of'
      AND class_instance.id = cc2.class_instance_b
      AND class_instance.name = 'Isolated synaptic terminals'
    ''', [treenode_id])
    rows = [row for row in cursor.fetchall()]
    if not rows:
        # treenode is not an isolated synaptic terminal
        return -1, -1
    if 1 != len(rows):
        raise Exception('Found more than one skeleton or neuron for treenode #%s' % treenode_id)

    neuron_id = rows[0][0]
    cici_id = rows[0][1]
    part_of_id = rows[0][2]
    skeleton_id = rows[0][3]

    # Remove the neuron from the group 'Isolated synaptic terminals'
    cursor.execute('''
    DELETE FROM class_instance_class_instance WHERE id=%s
    ''', [cici_id])

    # Obtain the user's staging group
    group, is_new = _fetch_targetgroup(user, project_id, 'Fragments', part_of_id, get_class_to_id_map(project_id))

    # Add the neuron to the user's staging group
    _create_relation(user, project_id, part_of_id, neuron_id, group.id)

    # Change ownership of the neuron and skeleton (which are placeholders) to the user
    now = datetime.now()
    ClassInstance.objects.filter(id__in=[skeleton_id, neuron_id]).update(
            user=user,
            creation_time=now,
            edition_time=now)

    return neuron_id, skeleton_id

