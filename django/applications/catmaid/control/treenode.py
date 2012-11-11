import json

import decimal
from django.http import HttpResponse

from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from django.core.exceptions import ObjectDoesNotExist

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *


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
    """
    is_new = False
    if 'Fragments' == targetgroup:
        # Get the general staging folder
        try:
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
            ist_group.name = 'Staging'
            ist_group.save()
            root = ClassInstance.objects.get(project=project_id, class_column=class_map['root'])

            _create_relation(user, project_id, part_of_id, staging_group.id, root.id)
            is_new = True
        return ist_group, is_new



@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
def create_treenode(request, project_id=None):
    """
    Add a new treenode to the database
    ----------------------------------

    1. Add new treenode for a given skeleton id. Parent should not be empty.
    return: new treenode id

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
            'parent_id': -1,
            'skeleton_id': 0}
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
        new_treenode = Treenode()
        new_treenode.user = request.user
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
        if int(params['parent_id']) != -1:  # A root node and parent node exist
            # Retrieve skeleton of parent
            skeleton = ClassInstance.objects.get(pk=params['skeleton_id']) # pk must stand for "primary key"
            response_on_error = 'Could not insert new treenode ARGH!'
            new_treenode = insert_new_treenode(params['parent_id'], skeleton)

            return HttpResponse(json.dumps({'treenode_id': new_treenode.id, 'skeleton_id': params['skeleton_id']}))

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

            if int(params['useneuron']) != -1:  # A neuron already exists, so we use it
                response_on_error = 'Could not relate the neuron model to the new skeleton!'
                relate_neuron_to_skeleton(int(params['useneuron']), new_skeleton.id)

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
        raise CatmaidException(response_on_error + ':' + str(e))


@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
def create_interpolated_treenode(request, project_id=None):
    params = {}
    decimal_values = {
            'x': 0,
            'y': 0,
            'z': 0,
            'atnx': 0,
            'atny': 0,
            'atnz': 0,
            'resx': 0,
            'resy': 0,
            'resz': 0,
            'radius': 0}
    int_values = {
            'parent_id': 0,
            'skeleton_id': 0,
            'confidence': 0}
    for p in decimal_values.keys():
        params[p] = decimal.Decimal(request.POST.get(p, decimal_values[p]))
    for p in int_values.keys():
        params[p] = int(request.POST.get(p, int_values[p]))

    last_treenode_id = _create_interpolated_treenode(request, params, project_id, False)
    return HttpResponse(json.dumps({'treenode_id': last_treenode_id, 'skeleton_id': params['skeleton_id']}))


def _create_interpolated_treenode(request, params, project_id, skip_last):
    """ Create interpolated treenodes between the 'parent_id' and the clicked x,y,z
    coordinate. The skip_last is to prevent the creation of the last node, used by
    the join_skeletons_interpolated. """
    response_on_error = 'Could not create interpolated treenode'
    try:
        parent_skeleton_id = int(params['skeleton_id'])

        steps = abs((params['z'] - params['atnz']) / params['resz']).quantize(decimal.Decimal('1'), rounding=decimal.ROUND_FLOOR)
        if steps == decimal.Decimal(0):
            steps = decimal.Decimal(1)

        dx = (params['x'] - params['atnx']) / steps
        dy = (params['y'] - params['atny']) / steps
        dz = (params['z'] - params['atnz']) / steps

        # Loop the creation of treenodes in z resolution steps until target
        # section is reached
        parent_id = params['parent_id']
        for i in range(1, steps + (0 if skip_last else 1)):
            response_on_error = 'Error while trying to insert treenode.'
            new_treenode = Treenode()
            new_treenode.user_id = request.user.id
            new_treenode.project_id = project_id
            new_treenode.location = Double3D(
                    float(params['atnx'] + dx * i),
                    float(params['atny'] + dy * i),
                    float(params['atnz'] + dz * i))
            new_treenode.radius = params['radius']
            new_treenode.skeleton_id = parent_skeleton_id
            new_treenode.confidence = params['confidence']
            new_treenode.parent_id = parent_id  # This is not a root node.
            new_treenode.save()

            parent_id = new_treenode.id

        # parent_id contains the ID of the last added node
        return parent_id

    except Exception as e:
        raise CatmaidException(response_on_error + ':' + str(e))


@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
def update_treenode_table(request, project_id=None):
    property_name = request.POST.get('type', None)
    treenode_id = request.POST.get('id', None)
    property_value = request.POST.get('value', None)

    if None in [property_name, treenode_id, property_value]:
        raise CatmaidException('Need type, treenode id and value.')
    else:
        treenode_id = int(treenode_id)
        property_value = int(property_value)

    if property_name not in ['confidence', 'radius']:
        raise CatmaidException('Can only modify confidence and radius.')

    response_on_error = ''
    try:
        response_on_error = 'Could not find treenode with ID %s.' % treenode_id
        treenode = get_object_or_404(Treenode, project=project_id, id=treenode_id)
        response_on_error = 'Could not update %s for treenode with ID %s.' % (property_name, treenode_id)
        setattr(treenode, property_name, property_value)
        treenode.user = request.user
        treenode.save()

        return HttpResponse(json.dumps({'success': 'Updated %s of treenode %s to %s.' % (property_name, treenode_id, property_value)}))

    except Exception as e:
        raise CatmaidException(response_on_error + ':' + str(e))

# REMARK this function went from 1.6 seconds to 400 ms when de-modelized
@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
def delete_treenode(request, project_id=None):
    treenode_id = int(request.POST.get('treenode_id', -1))
    # Raise an Exception if the user doesn't own the treenode or is not superuser
    can_edit_or_fail(request.user, treenode_id, 'treenode')
    #
    parent_id = int(request.POST.get('parent_id', -1))
    skeleton_id = int(request.POST.get('skeleton_id', -1))

    response_on_error = ''
    try:
        cursor = connection.cursor()
        if -1 == parent_id:
            # This treenode is root.

            response_on_error = 'Could not retrieve children'
            cursor.execute("SELECT count(id) FROM treenode WHERE parent_id=%s", [treenode_id])
            n_children = cursor.fetchone()[0]
            if n_children > 0:
                # TODO yes you can, the new root is the first of the children, and other children become independent skeletons
                raise CatmaidException("You can't delete the root node when it has children.")
            # Remove the original skeleton.
            # It is OK to remove it if it only had one node,
            # even if the user does not match or the user is not superuser.
            response_on_error = 'Could not delete skeleton.'
            cursor = connection.cursor()
            cursor.execute("DELETE FROM class_instance WHERE id=%s", [skeleton_id])

        else:
            # Treenode is not root, it has a parent and children.
            # Reconnect all the children to the parent.
            response_on_error = 'Could not update parent id of children nodes'
            cursor.execute("UPDATE treenode SET parent_id=%s WHERE parent_id=%s", (parent_id, treenode_id))

        # Remove treenode
        response_on_error = 'Could not delete treenode.'
        cursor.execute("DELETE FROM treenode WHERE id=%s", [treenode_id])
        return HttpResponse(json.dumps({'success': 'Removed treenode successfully.'}))

    except Exception as e:
        raise CatmaidException(response_on_error + ':' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def treenode_info(request, project_id=None):
    treenode_id = int(request.POST.get('treenode_id', -1))
    if treenode_id < 0:
        raise CatmaidException('A treenode id has not been provided!')

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
        relation r2,
        class_instance ci,
        class_instance ci2,
        class_instance_class_instance cici
    WHERE ci.project_id = %s
      AND treenode.id = %s
      AND ci.id = treenode.skeleton_id
      AND ci.id = cici.class_instance_a
      AND ci2.id = cici.class_instance_b
      AND cici.relation_id = r2.id
      AND r2.relation_name = 'model_of'
    """, (project_id, treenode_id))
    results = [
            dict(zip([col[0] for col in c.description], row))
            for row in c.fetchall()
            ]
    if (len(results) > 1):
        raise CatmaidException('Found more than one skeleton and neuron for treenode %s' % treenode_id)
    elif (len(results) == 0):
        raise CatmaidException('No skeleton and neuron for treenode %s' % treenode_id)
    else:
        return HttpResponse(json.dumps(results[0]))



@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
def join_skeletons_interpolated(request, project_id=None):
    """ Join two skeletons, adding nodes in between the two nodes to join
    if they are separated by more than one section in the Z axis."""
    # Parse parameters
    keysDecimal = ['atnx', 'atny', 'atnz', 'x', 'y', 'z', 'resx', 'resy', 'resz']
    keysInt = ['from_id', 'from_skid', 'to_id', 'to_skid', 'radius', 'confidence']
    params = {}
    for p in keysDecimal:
        params[p] = decimal.Decimal(request.POST.get(p, 0))
    for p in keysInt:
        params[p] = int(request.POST.get(p, 0))
    # Copy of the id for _create_interpolated_treenode
    params['parent_id'] = params['from_id']
    params['skeleton_id'] = params['from_skid']

    # Create interpolate nodes skipping the last one 
    last_treenode_id = _create_interpolated_treenode(request, params, project_id, True)

    # Link last_treenode_id to to_id
    # TODO this is not elegant
    from skeleton import _join_skeleton
    _join_skeleton(last_treenode_id, params['from_skid'], params['to_id'], params['to_skid'], project_id)

    return HttpResponse(json.dumps({'message': 'success',
                                    'fromid': params['from_id'],
                                    'toid': params['to_id']}))


@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
def move_terminal_to_staging(request, project_id=None):
    """ Given a skeleton ID, determine whereas it is a model_of a neuron
    that is currently a part_of the Isolated synaptic terminals group,
    and if so, move the neuron to the user's staging group."""
    skeleton_id = int(request.POST['skeleton_id'])
    if skeleton_id < 1:
        return HttpResponse(json.dumps({"error": "Bad skeleton ID of -1"}))
    # Find the ID of the neuron (cc2.class_instance_a) for which the skeleton is a model_of
    # and the ID of the cici (cc2.id) that declares the neuron to be a part_of Isolated synaptic terminals.
    # If the neuron is not a part of Isolated synaptic terminals, then it will return zero rows.
    cursor = connection.cursor();
    cursor.execute('''
    SELECT
        cc2.class_instance_a,
        cc2.id,
        r2.id
    FROM
        class_instance_class_instance cc1,
        class_instance_class_instance cc2,
        class_instance,
        relation r1,
        relation r2
    WHERE
          cc1.class_instance_a = %s
      AND cc1.relation_id = r1.id
      AND r1.relation_name = 'model_of'
      AND cc1.class_instance_b = cc2.class_instance_a
      AND cc2.relation_id = r2.id
      AND r2.relation_name = 'part_of'
      AND class_instance.id = cc2.class_instance_b
      AND class_instance.name = 'Isolated synaptic terminals'
    ''', [skeleton_id])
    rows = [row for row in cursor.fetchall()]
    if not rows:
        return HttpResponse(json.dumps({'neuron_id': -1}))

    neuron_id = rows[0][0]
    cici_id = rows[0][1]
    part_of_id = rows[0][2]

    # Remove the neuron from the group 'Isolated synaptic terminals'
    cursor.execute('''
    DELETE FROM class_instance_class_instance WHERE id=%s
    ''', [cici_id])

    # Obtain the user's staging group
    group, is_new = _fetch_targetgroup(request.user, project_id, 'Fragments', part_of_id, get_class_to_id_map(project_id))

    # Add the neuron to the user's staging group
    _create_relation(request.user, project_id, part_of_id, neuron_id, group.id)

    return HttpResponse(json.dumps({'neuron_id': neuron_id}))

