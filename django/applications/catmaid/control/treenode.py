# -*- coding: utf-8 -*-

from collections import defaultdict
import itertools
import math
import networkx as nx
import re
from typing import Any, DefaultDict, Dict, List, Union

from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view

from catmaid import state
from catmaid.models import UserRole, Treenode, ClassInstance, \
        TreenodeConnector, Location, SamplerInterval
from catmaid.control.authentication import requires_user_role, \
        can_edit_class_instance_or_fail, can_edit_or_fail
from catmaid.control.common import (get_relation_to_id_map,
        get_class_to_id_map, insert_into_log, _create_relation,
        get_request_bool, get_request_list)
from catmaid.control.neuron import _delete_if_empty
from catmaid.control.node import _fetch_location, _fetch_locations
from catmaid.control.link import create_connector_link
from catmaid.util import Point3D, is_collinear


def can_edit_treenode_or_fail(user, project_id, treenode_id) -> bool:
    """ Tests if a user has permissions to edit the neuron which the skeleton of
    the treenode models. Will return true or throw an exception. Cannot return false. """
    info = _treenode_info(project_id, treenode_id)
    return can_edit_class_instance_or_fail(user, info['neuron_id'], 'neuron')


def can_edit_skeleton_or_fail(user, project_id, skeleton_id, model_of_relation_id) -> bool:
    """Test if a user has permission to edit a neuron modeled by a skeleton. Will return true
       or throw an exception. Cannot return false."""
    cursor = connection.cursor()
    cursor.execute("""
        SELECT
            ci2.id as neuron_id
        FROM
            class_instance ci,
            class_instance ci2,
            class_instance_class_instance cici
        WHERE ci.project_id = %s
          AND ci.id = %s
          AND ci.id = cici.class_instance_a
          AND ci2.id = cici.class_instance_b
          AND cici.relation_id = %s
        """, (project_id, skeleton_id, model_of_relation_id))
    if cursor.rowcount == 0:
        raise ValueError('No neuron modeled by skeleton %s' % skeleton_id)
    neuron_id = cursor.fetchone()[0]
    return can_edit_class_instance_or_fail(user, neuron_id, 'neuron')


@requires_user_role(UserRole.Annotate)
def create_treenode(request:HttpRequest, project_id=None) -> JsonResponse:
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
    string_values = {} # type: Dict
    for p in float_values.keys():
        params[p] = float(request.POST.get(p, float_values[p]))
    for p in int_values.keys():
        params[p] = int(request.POST.get(p, int_values[p]))
    for p in string_values.keys():
        params[p] = request.POST.get(p, string_values[p])

    # Get optional initial links to connectors, expect each entry to be a list
    # of connector ID, relation ID and confidence.
    links = get_request_list(request.POST, 'links', [], map_fn=int)

    # Make sure the back-end is in the expected state if the node should have a
    # parent and will therefore become part of another skeleton.
    parent_id = int(params['parent_id'])
    has_parent = parent_id and parent_id != -1
    if has_parent:
        state.validate_state(parent_id, request.POST.get('state'),
                parent_edittime=has_parent, lock=True)

    new_treenode = _create_treenode(project_id, request.user, request.user,
            params['x'], params['y'], params['z'], params['radius'],
            params['confidence'], params['useneuron'], params['parent_id'],
            neuron_name=request.POST.get('neuron_name', None))

    # Create all initial links
    if links:
        created_links = create_connector_link(project_id, request.user.id,
                new_treenode.treenode_id, new_treenode.skeleton_id, links)
    else:
        created_links = []

    return JsonResponse({
        'treenode_id': new_treenode.treenode_id,
        'skeleton_id': new_treenode.skeleton_id,
        'edition_time': new_treenode.edition_time,
        'parent_edition_time': new_treenode.parent_edition_time,
        'created_links': created_links
    })

@requires_user_role(UserRole.Annotate)
def insert_treenode(request:HttpRequest, project_id=None) -> JsonResponse:
    """
    Create a new treenode between two existing nodes. Its creator and
    creation_date information will be set to information of child node. No node
    will be created, if the node on the edge between the given child and parent
    node.
    """
    # Use creation time, if part of parameter set
    params = {} # type: Dict[str, float]
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

    # If siblings should be taken over, all children of the parent node will be
    # come children of the inserted node. This requires extra state
    # information: the child state for the paren.
    takeover_child_ids = get_request_list(request.POST,
            'takeover_child_ids', None, int)

    # Get optional initial links to connectors, expect each entry to be a list
    # of connector ID and relation ID.
    try:
        links = get_request_list(request.POST, 'links', [], int)
    except Exception as e:
        raise ValueError("Couldn't parse list parameter: {}".format(e))

    # Make sure the back-end is in the expected state if the node should have a
    # parent and will therefore become part of another skeleton.
    parent_id = params.get('parent_id')
    child_id = params.get('child_id')
    if parent_id not in (-1, None):
        s = request.POST.get('state')
        # Testing egular edge insertion is assumed if a child ID is provided
        partial_child_checks = [] if child_id in (-1, None) else [child_id]
        if takeover_child_ids:
            partial_child_checks.extend(takeover_child_ids)
        state.validate_state(parent_id, s, node=True,
                children=partial_child_checks or False, lock=True),

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
        user, time = request.user, None
    except:
        child_loc = Point3D(child.location_x, child.location_y, child.location_z)
        parent_loc = Point3D(parent.location_x, parent.location_y, parent.location_z)
        new_node_loc = Point3D(params['x'], params['y'], params['z'])
        if not is_collinear(child_loc, parent_loc, new_node_loc, True, 0.001):
            raise ValueError('New node location has to be between child and parent')

        # Use creator and creation time for neighboring node that was created last.
        if child.creation_time < parent.creation_time:
            user, time = parent.user, parent.creation_time
        else:
            user, time = child.user, child.creation_time

    # Create new treenode
    new_treenode = _create_treenode(project_id,
            user, request.user, params['x'], params['y'], params['z'],
            params['radius'], params['confidence'], -1, params['parent_id'], time)

    # Update parent of child to new treenode, do this in raw SQL to also get the
    # updated edition time Update also takeover children
    cursor = connection.cursor()
    paramlist = [new_treenode.treenode_id, child.id]
    if takeover_child_ids:
        paramlist.extend(takeover_child_ids)
        child_template = ",".join(("%s",) * (len(takeover_child_ids) + 1))
    else:
        child_template = "%s"

    cursor.execute("""
        UPDATE treenode SET parent_id = %s
         WHERE id IN ({})
     RETURNING id, edition_time
    """.format(child_template), paramlist)
    result = cursor.fetchall()
    if not result or (len(paramlist) - 1) != len(result):
        raise ValueError("Couldn't update parent of inserted node's child: " + child.id)
    child_edition_times = [[k,v] for k,v in result]

    # Create all initial links
    if links:
        created_links = create_connector_link(project_id, request.user.id,
                new_treenode.treenode_id, new_treenode.skeleton_id, links)
    else:
        created_links = []

    return JsonResponse({
        'treenode_id': new_treenode.treenode_id,
        'skeleton_id': new_treenode.skeleton_id,
        'edition_time': new_treenode.edition_time,
        'parent_edition_time': new_treenode.parent_edition_time,
        'child_edition_times': child_edition_times,
        'created_links': created_links
    })

class NewTreenode(object):
    """Represent a newly created treenode and all the information that is
    returned to the client
    """
    def __init__(self, treenode_id, edition_time, skeleton_id,
            parent_edition_time):
        self.treenode_id = treenode_id
        self.edition_time = edition_time
        self.skeleton_id = skeleton_id
        self.parent_edition_time = parent_edition_time

def _create_treenode(project_id, creator, editor, x, y, z, radius, confidence,
                     neuron_id, parent_id, creation_time=None, neuron_name=None) -> NewTreenode:

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
        new_radius = int(radius if (radius and not math.isnan(radius)) else 0)
        new_treenode.radius = new_radius
        new_treenode.skeleton_id = skeleton_id
        new_confidence = int(confidence if not math.isnan(confidence) and (confidence or confidence is 0) else 5)
        new_treenode.confidence = new_confidence
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
            # Select the parent treenode for update to prevent race condition
            # updates to its skeleton ID while this node is being created.
            cursor = connection.cursor()
            cursor.execute('''
                SELECT t.skeleton_id, t.edition_time FROM treenode t
                WHERE t.id = %s FOR NO KEY UPDATE OF t
                ''', (parent_id,))

            if cursor.rowcount != 1:
                raise ValueError('Parent treenode %s does not exist' % parent_id)

            parent_node = cursor.fetchone()
            parent_skeleton_id = parent_node[0]
            parent_edition_time = parent_node[1]

            # Raise an Exception if the user doesn't have permission to edit
            # the neuron the skeleton of the treenode is modeling.
            can_edit_skeleton_or_fail(editor, project_id, parent_skeleton_id,
                                      relation_map['model_of'])

            response_on_error = 'Could not insert new treenode!'
            new_treenode = insert_new_treenode(parent_id, parent_skeleton_id)

            return NewTreenode(new_treenode.id, new_treenode.edition_time,
                               parent_skeleton_id, parent_edition_time)
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

                return NewTreenode(new_treenode.id, new_treenode.edition_time,
                                   new_skeleton.id, None)
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
                        name_match = counting_pattern.sub(r"(\d+)", neuron_name)
                        name_pattern = re.compile(name_match)
                        matching_neurons = ClassInstance.objects.filter(
                                project_id=project_id,
                                class_column_id=class_map['neuron'],
                                name__regex=name_match).order_by('name')

                        # Increment substitution values based on existing neurons.
                        for n in matching_neurons:
                            for i, (count, g) in enumerate(zip(counts, name_pattern.search(n.name).groups())): # type: ignore
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

                return NewTreenode(new_treenode.id, new_treenode.edition_time,
                                   new_skeleton.id, None)

    except Exception as e:
        import traceback
        raise Exception("%s: %s %s" % (response_on_error, str(e),
                                       str(traceback.format_exc())))


@requires_user_role(UserRole.Annotate)
def update_parent(request:HttpRequest, project_id=None, treenode_id=None) -> JsonResponse:
    treenode_id = int(treenode_id)
    parent_id = int(request.POST.get('parent_id', -1))

    can_edit_treenode_or_fail(request.user, project_id, treenode_id)

    # Make sure the back-end is in the expected state
    state.validate_state(treenode_id, request.POST.get('state'),
            neighborhood=True, lock=True)

    child = get_object_or_404(Treenode, pk=treenode_id, project_id=project_id)
    parent = get_object_or_404(Treenode, pk=parent_id, project_id=project_id)

    if child.skeleton_id != parent.skeleton_id:
        raise Exception("Child node %s is in skeleton %s but parent node %s is in skeleton %s!", \
                        treenode_id, child.skeleton_id, parent_id, parent.skeleton_id)

    child.parent_id = parent_id
    child.save()

    return JsonResponse({
        'success': True,
        'node_id': child.id,
        'parent_id': child.parent_id,
        'skeleton_id': child.skeleton_id
    })

def update_node_radii(node_ids, radii, cursor=None) -> Dict:
    """Update radius of a list of nodes, returns old radii.

    Both lists/tupples and single values can be supplied.
    """
    # Make sure we deal with lists
    type_nodes = type(node_ids)
    if type_nodes not in (list, tuple):
        node_ids = (node_ids,)
    # If only one a single radius value is available, use it for every input
    # node ID.
    type_radii = type(radii)
    if type_radii not in (list, tuple):
        radii = len(node_ids) * (radii,)

    if len(node_ids) != len(radii):
        raise ValueError("Number of treenode doesn't match number of radii")

    invalid_radii = [r for r in radii if math.isnan(r)]
    if invalid_radii:
        raise ValueError("Some radii where not numbers: " +
                ", ".join(invalid_radii))

    # Make sure we have a database cursor
    cursor = cursor or connection.cursor()

    # Create a list of the form [(node id, radius), ...]
    node_radii = "(" + "),(".join(map(lambda pair: "{},{}".format(pair[0], pair[1]),
            zip(node_ids, radii))) + ")"

    cursor.execute('''
        UPDATE treenode t SET radius = target.new_radius
        FROM (SELECT x.id, x.radius AS old_radius, y.new_radius
              FROM treenode x
              INNER JOIN (VALUES {}) y(id, new_radius)
              ON x.id=y.id FOR NO KEY UPDATE) target
        WHERE t.id = target.id
        RETURNING t.id, target.old_radius, target.new_radius,
                      t.edition_time, t.skeleton_id;
    '''.format(node_radii))

    updated_rows = cursor.fetchall()
    if len(node_ids) != len(updated_rows):
        missing_ids = frozenset(node_ids) - frozenset([r[0] for r in updated_rows])
        raise ValueError('Coudn\'t find treenodes ' +
                         ','.join([str(ni) for ni in missing_ids]))
    return {r[0]: {
        'old': r[1],
        'new': float(r[2]),
        'edition_time': r[3],
        'skeleton_id': r[4]
    } for r in updated_rows}

@requires_user_role(UserRole.Annotate)
def update_radii(request:HttpRequest, project_id=None) -> JsonResponse:
    """Update the radius of one or more nodes"""
    treenode_ids = [int(v) for k,v in request.POST.items() \
        if k.startswith('treenode_ids[')]
    radii = [float(v) for k,v in request.POST.items() \
        if k.startswith('treenode_radii[')]
    # Make sure the back-end is in the expected state
    cursor = connection.cursor()
    state.validate_state(treenode_ids, request.POST.get('state'),
            multinode=True, lock=True, cursor=cursor)

    updated_nodes = update_node_radii(treenode_ids, radii, cursor)

    return JsonResponse({
        'success': True,
        'updated_nodes': updated_nodes
    })

@requires_user_role(UserRole.Annotate)
def update_radius(request:HttpRequest, project_id=None, treenode_id=None) -> JsonResponse:
    treenode_id = int(treenode_id)
    radius = float(request.POST.get('radius', -1))
    if math.isnan(radius):
        raise Exception("Radius '%s' is not a number!" % request.POST.get('radius'))
    option = int(request.POST.get('option', 0))
    cursor = connection.cursor()
    # Make sure the back-end is in the expected state
    state.validate_state(treenode_id, request.POST.get('state'),
            node=True, lock=True, cursor=cursor)

    def create_update_response(updated_nodes, radius) -> JsonResponse:
        return JsonResponse({
            'success': True,
            'updated_nodes': updated_nodes,
            'new_radius': radius
        })

    if 0 == option:
        # Update radius only for the passed in treenode and return the old
        # radius.
        old_radii = update_node_radii(treenode_id, radius, cursor)
        return create_update_response(old_radii, radius)

    cursor.execute('''
    SELECT id, parent_id, radius
    FROM treenode
    WHERE skeleton_id = (SELECT t.skeleton_id FROM treenode t WHERE id = %s)
    ''' % treenode_id)

    if 1 == option:
        # Update radius from treenode_id to next branch or end node (included)
        children = defaultdict(list) # type: DefaultDict[Any, List]
        for row in cursor.fetchall():
            children[row[1]].append(row[0])

        include = [treenode_id]
        c = children[treenode_id]
        while 1 == len(c):
            child = c[0]
            include.append(child)
            c = children[child]

        old_radii = update_node_radii(include, radius, cursor)
        return create_update_response(old_radii, radius)

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

        old_radii = update_node_radii(include, radius, cursor)
        return create_update_response(old_radii, radius)

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

        old_radii = update_node_radii(include, radius, cursor)
        return create_update_response(old_radii, radius)

    if 4 == option:
        # Update radius from treenode_id to root (included)
        parents = {row[0]: row[1] for row in cursor.fetchall()}

        include = [treenode_id]
        parent = parents[treenode_id]
        while parent:
            include.append(parent)
            parent = parents[parent]

        old_radii = update_node_radii(include, radius, cursor)
        return create_update_response(old_radii, radius)

    if 5 == option:
        # Update radius of all nodes (in a single query)
        skeleton_id = Treenode.objects.get(pk=treenode_id).skeleton_id
        include = list(Treenode.objects.filter(skeleton_id=skeleton_id) \
                .values_list('id', flat=True))

        old_radii = update_node_radii(include, radius, cursor)
        return create_update_response(old_radii, radius)


@requires_user_role(UserRole.Annotate)
def delete_treenode(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Deletes a treenode. If the skeleton has a single node, deletes the
    skeleton and its neuron. Returns the parent_id, if any."""
    treenode_id = int(request.POST.get('treenode_id', -1))
    # Raise an exception if the user doesn't have permission to edit the
    # treenode.
    can_edit_or_fail(request.user, treenode_id, 'treenode')
    # Raise an Exception if the user doesn't have permission to edit the neuron
    # the skeleton of the treenode is modeling.
    can_edit_treenode_or_fail(request.user, project_id, treenode_id)
    # Make sure the back-end is in the expected state
    state.validate_state(treenode_id, request.POST.get('state'), lock=True,
            neighborhood=True)

    treenode = Treenode.objects.get(pk=treenode_id)
    parent_id = treenode.parent_id

    # Get information about linked connectors
    links = list(TreenodeConnector.objects.filter(project_id=project_id,
            treenode_id=treenode_id).values_list('id', 'relation_id',
            'connector_id', 'confidence'))

    # Prevent deletion if node is referenced from sampler or sampler domain. The
    # deletion would fail regardless, but this way we can provide a nicer error
    # message.
    cursor = connection.cursor()
    cursor.execute("""
        SELECT
            EXISTS(
                SELECT 1 FROM catmaid_samplerinterval
                WHERE project_id = %(project_id)s AND
                    (start_node_id = %(treenode_id)s OR end_node_id = %(treenode_id)s)),
            EXISTS(
                SELECT 1 FROM catmaid_samplerdomain
                WHERE project_id = %(project_id)s AND
                    (start_node_id = %(treenode_id)s)),
            EXISTS(
                SELECT 1 FROM catmaid_samplerdomainend
                WHERE end_node_id = %(treenode_id)s)
    """, {
        'project_id': project_id,
        'treenode_id': treenode_id,
    })
    sampler_refs = cursor.fetchone()
    has_sampler_interval_refs = sampler_refs[0]
    has_sampler_domain_refs = sampler_refs[1] or sampler_refs[2]

    if has_sampler_interval_refs:
        raise ValueError("Can't delete node, it is used in at least one sampler interval")
    if has_sampler_domain_refs:
        raise ValueError("Can't delete node, it is used in at least one sampler domain")


    response_on_error = ''
    deleted_neuron = False
    cursor = connection.cursor()
    try:
        if not parent_id:
            children = [] # type: List
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
                return JsonResponse({"error": "Can't delete " \
                    "isolated node: erroneously, its skeleton contains more " \
                    "than one treenode! Check for multiple root nodes."})

            # If the neuron modeled by the skeleton of the treenode is empty,
            # delete it.
            response_on_error = 'Could not delete neuron #%s' % neuron.id
            deleted_neuron = _delete_if_empty(neuron.id)

            if deleted_neuron:
                # Insert log entry for neuron deletion
                insert_into_log(project_id, request.user.id, 'remove_neuron',
                               (treenode.location_x, treenode.location_y, treenode.location_z),
                               'Deleted neuron %s and skeleton(s) %s.' % (neuron.id, treenode.skeleton_id))

        else:
            # Treenode is not root, it has a parent and perhaps children.
            # Reconnect all the children to the parent.
            response_on_error = 'Could not update parent id of children nodes'
            cursor.execute("""
                UPDATE treenode SET parent_id = %s
                WHERE project_id = %s AND parent_id = %s
                RETURNING id, edition_time
            """, (treenode.parent_id, project_id, treenode.id))
            # Children will be a list of two-element lists, just what we want to
            # return as child info.
            children = cursor.fetchall()

        # Remove treenode. Set the current user name in a transaction local
        # variable. This is done to communicate the current user to the trigger
        # that updates the skeleton summary table.
        response_on_error = 'Could not delete treenode.'
        cursor.execute("SET LOCAL catmaid.user_id=%(user_id)s", {
            'user_id': request.user.id,
        })
        Treenode.objects.filter(project_id=project_id, pk=treenode_id).delete()
        return JsonResponse({
            'x': treenode.location_x,
            'y': treenode.location_y,
            'z': treenode.location_z,
            'parent_id': parent_id,
            'children': children,
            'links': links,
            'radius': treenode.radius,
            'confidence': treenode.confidence,
            'skeleton_id': treenode.skeleton_id,
            'deleted_neuron': deleted_neuron,
            'success': "Removed treenode successfully."
        })

    except Exception as e:
        raise Exception(response_on_error + ': ' + str(e))

def _compact_detail_list(project_id, treenode_ids=None, label_ids=None,
        label_names=None, skeleton_ids=None):
    """
    Return a list with information on the passed in node IDs or on treenodes
    that match the optional label refrences. The result has the form:

    [ID, parent ID, x, y, z, confidence, radius, skeleton_id, edition_time, user_id]

    The returned edition time is an epoch number.
    """
    if not any((treenode_ids, label_ids, label_names, skeleton_ids)):
        raise ValueError("No treenode IDs, label IDs, label names or skeleton IDs provided")

    extra_joins = []
    extra_where = []

    if treenode_ids:
        extra_joins.append("""
            JOIN UNNEST(%(treenode_ids)s::bigint[]) query(id)
                ON t.id = query.id
        """)

    labeled_as = None
    if label_ids or label_names:

        relation_map = get_relation_to_id_map(project_id, ('labeled_as',))
        labeled_as = relation_map['labeled_as']

        if label_ids:
            extra_joins.append("""
                JOIN treenode_class_instance tci
                    ON tci.treenode_id = t.id
                JOIN UNNEST(%(label_ids)s::bigint[]) label(id)
                    ON label.id = tci.class_instance_id
            """)
            extra_where.append("""
                tci.relation_id = %(labeled_as)s
            """)

        if label_names:
            extra_joins.append("""
                JOIN treenode_class_instance tci
                    ON tci.treenode_id = t.id
                JOIN class_instance ci
                    ON ci.id = tci.class_instance_id
                JOIN UNNEST(%(label_names)s::text[]) label(name)
                    ON label.name = ci.name
            """)
            extra_where.append("""
                tci.relation_id = %(labeled_as)s
            """)

    if skeleton_ids:
        extra_joins.append("""
            JOIN UNNEST(%(skeleton_ids)s::bigint[]) skeleton(id)
                ON skeleton.id = t.skeleton_id
        """)

    cursor = connection.cursor()
    cursor.execute("""
        SELECT t.id, t.parent_id, t.location_x, t.location_y, t.location_z, t.confidence,
            t.radius, t.skeleton_id,
            EXTRACT(EPOCH FROM t.edition_time), t.user_id
        FROM treenode t
        {extra_joins}
        WHERE t.project_id=%(project_id)s
        {extra_where}
    """.format(**{
        'extra_joins': '\n'.join(extra_joins),
        'extra_where': ('AND ' + ' AND\n'.join(extra_where)) if extra_where else '',
    }), {
        'project_id': project_id,
        'treenode_ids': treenode_ids,
        'labeled_as': labeled_as,
        'label_ids': label_ids,
        'label_names': label_names,
        'skeleton_ids': skeleton_ids
    })

    rows = cursor.fetchall()

    return rows

def _compact_detail(project_id, treenode_id):
    """
    Return a list with information on the passed in node. It has the form:

    [ID, parent ID, x, y, z, confidence, radius, skeleton_id, edition_time, user_id]

    The returned edition time is an epoch number.
    """
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id, parent_id, location_x, location_y, location_z, confidence,
        radius, skeleton_id, EXTRACT(EPOCH FROM edition_time), user_id
        FROM treenode
        WHERE id=%(treenode_id)s
        AND project_id=%(project_id)s
    """, {
        'project_id': project_id,
        'treenode_id': treenode_id
    })

    rows = cursor.fetchall()
    if len(rows) == 0:
        raise ValueError("Could not find treenode with ID {}".format(treenode_id))
    if len(rows) > 1:
        raise ValueError("Found {} treenodes with ID {}, expected one".format(len(rows), treenode_id))

    return rows[0]


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
    if len(results) > 1:
        raise ValueError('Found more than one skeleton and neuron for '
                        'treenode %s' % treenode_id)
    elif len(results) == 0:
        raise ValueError('No skeleton and neuron for treenode %s' % treenode_id)

    return results[0]


@api_view(['GET'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def treenode_info(request:HttpRequest, project_id=None, treenode_id=None) -> JsonResponse:
    """Retrieve skeleton and neuron information about this treenode.
    ---
    type:
      skeleton_id:
        description: ID of the treenode's skeleton
        type: integer
        required: true
      skeleton_name:
        description: Name of the treenode's skeleton
        type: string
        required: true
      neuron_id:
        description: ID of the treenode's neuron
        type: integer
        required: true
      neuron_name:
        description: Name of the treenode's neuron
        type: string
        required: true
    """
    info = _treenode_info(int(project_id), int(treenode_id))
    return JsonResponse(info)


@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def compact_detail(request:HttpRequest, project_id=None, treenode_id=None) -> JsonResponse:
    """
    Retrieve node information in a compact form. A list of the following form
    is returned:

    [ID, parent ID, x, y, z, confidence, radius, skeleton_id, edition_time, user_id]

    The returned edition time is an epoch number.
    """
    info = _compact_detail(int(project_id), int(treenode_id))
    return JsonResponse(info, safe=False)


@api_view(['POST'])
@requires_user_role(UserRole.Browse)
def compact_detail_list(request:HttpRequest, project_id=None) -> JsonResponse:
    """
    Retrieve node information in a compact form. A list of elements of the
    following form is returned:

    [ID, parent ID, x, y, z, confidence, radius, skeleton_id, edition_time, user_id]

    The returned edition time is an epoch number.
    ---
    parameters:
    - name: project_id
      description: Project to work in
      required: true
    - name: treenode_ids
      description: A list of treeonde IDs to return information on
      required: false
    - name: label_ids
      description: |
        A list of label IDs that must be linked to result treenodes. Alternative
        to explicit treenode IDs and label names.
      required: false
    - name: label_names
      description: |
        A list of label names that must be linked to result treenodes.
        Alternative to explicit treenode IDs and label IDs
      required: false
    - name: skeleton_ids
      description: |
        A list of skeleton IDs that result skeletons have to be part of.
      required: false
    """
    treenode_ids = get_request_list(request.POST, 'treenode_ids', None, int)
    label_ids = get_request_list(request.POST, 'label_ids', None, int)
    label_names = get_request_list(request.POST, 'label_names')
    skeleton_ids = get_request_list(request.POST, 'skeleton_ids', None, int)
    if not any((treenode_ids, label_ids, label_names, skeleton_ids)):
        raise ValueError("No treenode IDs, label IDs, label names or skeleton IDs provided")

    info = _compact_detail_list(int(project_id), treenode_ids, label_ids,
            label_names, skeleton_ids)

    return JsonResponse(info, safe=False)


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def find_children(request:HttpRequest, project_id=None, treenode_id=None) -> JsonResponse:
    try:
        tnid = int(treenode_id)
        cursor = connection.cursor()
        cursor.execute('''
            SELECT id, location_x, location_y, location_z
            FROM treenode
            WHERE parent_id = %s
            ''', (tnid,))

        children = [[row] for row in cursor.fetchall()]
        return JsonResponse(children, safe=False)
    except Exception as e:
        raise Exception('Could not obtain next branch node or leaf: ' + str(e))


@api_view(['POST'])
@requires_user_role(UserRole.Annotate)
def update_confidence(request:HttpRequest, project_id=None, treenode_id=None) -> JsonResponse:
    """Update confidence of edge between a node to either its parent or its
    connectors.

    The connection between a node and its parent or the connectors it is linked
    to can be rated with a confidence value in the range 1-5. If connector links
    should be updated, one can limit the affected connections to a specific
    connector. Returned is an object, mapping updated partners to their old
    confidences.
    ---
    parameters:
      - name: new_confidence
        description: New confidence, value in range 1-5
        type: integer
        required: true
      - name: to_connector
        description: Whether all linked connectors instead of parent should be updated
        type: boolean
        required: false
      - name: partner_ids
        description: Limit update to a set of connectors if to_connector is true
        type: array
        items: integer
        required: false
      - name: partner_confidences
        description: Set different confidences to connectors in <partner_ids>
        type: array
        items: integer
        required: false
    type:
        message:
            type: string
            required: true
        updated_partners:
            type: object
            required: true
    """
    tnid = int(treenode_id)
    can_edit_treenode_or_fail(request.user, project_id, tnid)
    cursor = connection.cursor()

    state.validate_state(tnid, request.POST.get('state'),
            node=True, lock=True, cursor=cursor)

    to_connector = get_request_bool(request.POST, 'to_connector', False)
    partner_ids = get_request_list(request.POST, 'partner_ids', None, int)
    partner_confidences = get_request_list(request.POST, 'partner_confidences',
            None, int)

    new_confidence = int(request.POST.get('new_confidence', 0))

    # If partner confidences are specified, make sure there are exactly as many
    # as there are partners. Otherwise validate passed in confidence
    if partner_ids and partner_confidences:
        if len(partner_confidences) != len(partner_ids):
            raise ValueError("There have to be as many partner confidences as"
                             "there are partner IDs")
    else:
        if new_confidence < 1 or new_confidence > 5:
            raise ValueError('Confidence not in range 1-5 inclusive.')
        if partner_ids:
            # Prepare new confidences for connector query
            partner_confidences = (new_confidence,) * len(partner_ids)

    if to_connector:
        if partner_ids:
            partner_template = ",".join(("(%s,%s)",) * len(partner_ids))
            partner_data = [p for v in zip(partner_ids, partner_confidences) for p in v]
            cursor.execute('''
                UPDATE treenode_connector tc
                SET confidence = target.new_confidence
                FROM (SELECT x.id, x.confidence AS old_confidence,
                             new_values.confidence AS new_confidence
                      FROM treenode_connector x
                      JOIN (VALUES {}) new_values(cid, confidence)
                      ON x.connector_id = new_values.cid
                      WHERE x.treenode_id = %s) target
                WHERE tc.id = target.id
                RETURNING tc.connector_id, tc.edition_time, target.old_confidence
            '''.format(partner_template), partner_data + [tnid])
        else:
            cursor.execute('''
                UPDATE treenode_connector tc
                SET confidence = %s
                FROM (SELECT x.id, x.confidence AS old_confidence
                      FROM treenode_connector x
                      WHERE treenode_id = %s) target
                WHERE tc.id = target.id
                RETURNING tc.connector_id, tc.edition_time, target.old_confidence
            ''', (new_confidence, tnid))
    else:
        cursor.execute('''
            UPDATE treenode t
            SET confidence = %s, editor_id = %s
            FROM (SELECT x.id, x.confidence AS old_confidence
                  FROM treenode x
                  WHERE id = %s) target
            WHERE t.id = target.id
            RETURNING t.parent_id, t.edition_time, target.old_confidence
        ''', (new_confidence, request.user.id, tnid))

    updated_partners = cursor.fetchall()
    if len(updated_partners) > 0:
        location = Location.objects.filter(id=tnid).values_list(
                'location_x', 'location_y', 'location_z')[0]
        insert_into_log(project_id, request.user.id, "change_confidence",
                location, "Changed to %s" % new_confidence)
        return JsonResponse({
            'message': 'success',
            'updated_partners': {
                r[0]: {
                    'edition_time': r[1],
                    'old_confidence': r[2]
                } for r in updated_partners
            }
        })

    # Else, signal error
    if to_connector:
        raise ValueError('Failed to update confidence between treenode %s and '
                'connector.' % tnid)
    else:
        raise ValueError('Failed to update confidence at treenode %s.' % tnid)

def _skeleton_as_graph(skeleton_id) -> nx.DiGraph:
    # Fetch all nodes of the skeleton
    cursor = connection.cursor()
    cursor.execute('''
        SELECT id, parent_id
        FROM treenode
        WHERE skeleton_id=%s''', [skeleton_id])
    # Create a directed graph of the skeleton
    graph = nx.DiGraph()
    for row in cursor.fetchall():
        # row[0]: id
        # row[1]: parent_id
        graph.add_node(row[0])
        if row[1]:
            # Create directional edge from parent to child
            graph.add_edge(row[1], row[0])
    return graph


def _find_first_interesting_node(sequence):
    """ Find the first node that:
    1. Has confidence lower than 5
    2. Has a tag
    3. Has any connector (e.g. receives/makes synapse, markes as abutting, ...)
    Otherwise return the last node.
    """
    if not sequence:
        raise Exception('No nodes ahead!')

    if 1 == len(sequence):
        return sequence[0]

    cursor = connection.cursor()
    cursor.execute('''
    SELECT t.id, t.confidence, tc.relation_id, tci.relation_id
    FROM treenode t
         LEFT OUTER JOIN treenode_connector tc ON (tc.treenode_id = t.id)
         LEFT OUTER JOIN treenode_class_instance tci ON (tci.treenode_id = t.id)
    WHERE t.id IN (%s)
    ''' % ",".join(map(str, sequence)))

    nodes = {row[0]: row for row in cursor.fetchall()}
    for node_id in sequence:
        if node_id in nodes:
            props = nodes[node_id]
            # [1]: confidence
            # [2]: a treenode_connector.relation_id, e.g. presynaptic_to or postsynaptic_to
            # [3]: a treenode_class_instance.relation_id, e.g. labeled_as
            # 2 and 3 may be None
            if props[1] < 5 or props[2] or props[3]:
                return node_id
        else:
            raise Exception('Nodes of this skeleton changed while inspecting them.')

    return sequence[-1]


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def find_previous_branchnode_or_root(request:HttpRequest, project_id=None, treenode_id=None) -> JsonResponse:
    try:
        tnid = int(treenode_id)
        alt = 1 == int(request.POST['alt'])
        skid = Treenode.objects.get(pk=tnid).skeleton_id
        graph = _skeleton_as_graph(skid)
        # Travel upstream until finding a parent node with more than one child
        # or reaching the root node
        seq = [] # Does not include the starting node tnid
        while True:
            parents = graph.predecessors(tnid)
            if parents: # list of parents is not empty
                tnid = parents[0] # Can ony have one parent
                seq.append(tnid)
                if 1 != len(graph.successors(tnid)):
                    break # Found a branch node
            else:
                break # Found the root node

        if seq and alt:
            tnid = _find_first_interesting_node(seq)

        return JsonResponse(_fetch_location(project_id, tnid), safe=False)
    except Exception as e:
        raise Exception('Could not obtain previous branch node or root:' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def find_next_branchnode_or_end(request:HttpRequest, project_id=None, treenode_id=None) -> JsonResponse:
    try:
        tnid = int(treenode_id)
        skid = Treenode.objects.get(pk=tnid).skeleton_id
        graph = _skeleton_as_graph(skid)

        children = graph.successors(tnid)
        branches = []
        for child_node_id in children:
            # Travel downstream until finding a child node with more than one
            # child or reaching an end node
            seq = [child_node_id] # Does not include the starting node tnid
            branch_end = child_node_id
            while True:
                branch_children = graph.successors(branch_end)
                if 1 == len(branch_children):
                    branch_end = branch_children[0]
                    seq.append(branch_end)
                else:
                    break # Found an end node or a branch node

            branches.append([child_node_id,
                             _find_first_interesting_node(seq),
                             branch_end])

        # If more than one branch exists, sort based on downstream arbor size.
        if len(children) > 1:
            branches.sort(
                   key=lambda b: len(nx.algorithms.traversal.depth_first_search.dfs_successors(graph, b[0])),
                   reverse=True)

        # Leaf nodes will have no branches
        if len(children) > 0:
            # Create a dict of node ID -> node location
            node_ids_flat = list(itertools.chain.from_iterable(branches))
            node_locations = {row[0]: row for row in _fetch_locations(project_id, node_ids_flat)}

        branches = [[node_locations[node_id] for node_id in branch] for branch in branches]
        return JsonResponse(branches, safe=False)
    except Exception as e:
        raise Exception('Could not obtain next branch node or leaf: ' + str(e))
