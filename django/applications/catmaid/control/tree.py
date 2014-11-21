import json
import string
from collections import deque

try:
    import networkx as nx
except ImportError:
    pass

from django.db import connection
from django.http import HttpResponse

from catmaid.models import UserRole, Treenode, TreenodeConnector, Class, \
        ClassInstance, ClassInstanceClassInstance, Relation
from catmaid.control.object import get_annotation_graph
from catmaid.control.authentication import requires_user_role, \
        can_edit_class_instance_or_fail
from catmaid.control.common import get_class_to_id_map, \
        get_relation_to_id_map, insert_into_log
from catmaid.control.tracing import check_tracing_setup_detailed

@requires_user_role(UserRole.Annotate)
def instance_operation(request, project_id=None):
    params = {}
    int_keys = ('id', 'src', 'ref', 'parentid', 'relationnr')
    str_keys = ('title', 'operation', 'title', 'rel', 'classname', 'relationname', 'objname', 'targetname')
    for k in int_keys:
        params[k] = int(request.POST.get(k, 0))
    for k in str_keys:
        # TODO sanitize
        params[k] = request.POST.get(k, 0)
 
    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    # We avoid many try/except clauses by setting this string to be the
    # response we return if an exception is thrown.
    instance_operation.res_on_err = ''

    def remove_skeletons(skeleton_id_list):
        if request.user.is_superuser:
            instance_operation.res_on_err = 'Failed to delete in treenode for skeletons #%s' % skeleton_id_list
            # TODO this failed at least once, whereas direct deletion of a single skeleton by skeleton_id on the treenode table succeeded. Inspect!
            Treenode.objects.filter(
                    project=project_id,
                    skeleton__in=skeleton_id_list).delete()

            instance_operation.res_on_err = 'Failed to delete in treenode_connector for skeletons #%s' % skeleton_id_list
            TreenodeConnector.objects.filter(
                    project=project_id,
                    skeleton__in=skeleton_id_list).delete()

            instance_operation.res_on_err = 'Failed to delete in class_instance for skeletons #%s' % skeleton_id_list
            ClassInstance.objects.filter(
                    id__in=skeleton_id_list).delete()
        else:
            # Cannot delete the skeleton if at least one node does not belong to the user
            cursor = connection.cursor()
            for skid in skeleton_id_list:
                cursor.execute('''
                SELECT user_id, count(user_id) FROM treenode WHERE skeleton_id=%s GROUP BY user_id
                ''', [skid])
                rows = tuple(row for row in cursor.fetchall())
                if 1 == len(rows) and rows[0][0] == request.user.id:
                    instance_operation.res_on_err = 'Failed to delete in treenode for skeletons #%s' % skeleton_id_list
                    Treenode.objects.filter(
                            project=project_id,
                            skeleton=skid).delete()

                    instance_operation.res_on_err = 'Failed to delete in treenode_connector for skeletons #%s' % skeleton_id_list
                    TreenodeConnector.objects.filter(
                            project=project_id,
                            skeleton=skid).delete()

                    instance_operation.res_on_err = 'Failed to delete in class_instance for skeletons #%s' % skeleton_id_list
                    ClassInstance.objects.filter(pk=skid).delete()
                else:
                    cursor.execute('SELECT first_name, last_name FROM "auth_user" WHERE id IN (%s)', [row[0] for row in rows if row[0] != request.user.id])
                    users = [a[0] + ' ' + a[1] for a in cursor.fetchall()]
                    raise Exception('Cannot delete skeleton #%s: %s of %s nodes belong to user(s) %s' % (sum(row[1] for row in rows if row[0] != request.user.id),
              sum(row[1] for row in rows),
              ", ".join(a[0] + ' ' + a[1] for a in cursor.fetchall())))


    def rename_node():
        can_edit_class_instance_or_fail(request.user, params['id'])
        # Do not allow '|' in name because it is used as string separator in NeuroHDF export
        if '|' in params['title']:
            raise Exception('Name should not contain pipe character!')

        instance_operation.res_on_err = 'Failed to update class instance.'
        nodes_to_rename = ClassInstance.objects.filter(id=params['id'])
        node_ids = [node.id for node in nodes_to_rename]
        if len(node_ids) > 0:
            old_name = ",".join([n.name for n in nodes_to_rename])
            nodes_to_rename.update(name=params['title'])
            insert_into_log(project_id, request.user.id, "rename_%s" % params['classname'], None, "Renamed %s with ID %s from %s to %s" % (params['classname'], params['id'], old_name, params['title']))
            return HttpResponse(json.dumps({'class_instance_ids': node_ids}))
        else:
            instance_operation.res_on_err = ''
            raise Exception('Could not find any node with ID %s' % params['id'])

    def remove_node():
        # Can only remove the node if the user owns it or the user is a superuser
        can_edit_class_instance_or_fail(request.user, params['id'])
        # Check if node is a skeleton. If so, we have to remove its treenodes as well!
        if 0 == params['rel']:
            raise Exception('No relation given!')

        elif 'skeleton' == params['rel']:
            remove_skeletons([params['id']])
            insert_into_log(project_id, request.user.id, 'remove_skeleton', None, 'Removed skeleton with ID %s and name %s' % (params['id'], params['title']))
            return HttpResponse(json.dumps({'status': 1, 'message': 'Removed skeleton successfully.'}))

        elif 'neuron' == params['rel']:
            instance_operation.res_on_err = 'Failed to retrieve node skeleton relations.'
            skeleton_relations = ClassInstanceClassInstance.objects.filter(
                    project=project_id,
                    relation=relation_map['model_of'],
                    class_instance_b=params['id'])
            remove_skeletons([s.class_instance_a_id for s in skeleton_relations])
            instance_operation.res_on_err = 'Failed to delete node from instance table.'
            node_to_delete = ClassInstance.objects.filter(id=params['id'])
            if node_to_delete.count() > 0:
                node_to_delete.delete()
                insert_into_log(project_id, request.user.id, 'remove_neuron', None, 'Removed neuron with ID %s and name %s' % (params['id'], params['title']))
                return HttpResponse(json.dumps({'status': 1, 'message': 'Removed neuron successfully.'}))
            else:
                instance_operation.res_on_err = ''
                raise Exception('Could not find any node with ID %s' % params['id'])

        else:
            instance_operation.res_on_err = 'Failed to delete node from instance table.'
            node_to_delete = ClassInstance.objects.filter(id=params['id'])
            if node_to_delete.count() > 0:
                node_to_delete.delete()
                return HttpResponse(json.dumps({'status': 1, 'message': 'Removed node successfully.'}))
            else:
                instance_operation.res_on_err = ''
                raise Exception('Could not find any node with ID %s' % params['id'])

    def create_node():
        # Can only create a node if the parent node is owned by the user
        # or the user is a superuser
        # Given that the parentid is 0 to signal root (but root has a non-zero id),
        # this implies that regular non-superusers cannot create nodes under root,
        # but only in their staging area.
        can_edit_class_instance_or_fail(request.user, params['parentid'])

        if params['classname'] not in class_map:
            raise Exception('Failed to select class.')
        instance_operation.res_on_err = 'Failed to insert instance of class.'
        node = ClassInstance(
                user=request.user,
                name=params['objname'])
        node.project_id = project_id
        node.class_column_id = class_map[params['classname']]
        node.save()
        insert_into_log(project_id, request.user.id, "create_%s" % params['classname'], None, "Created %s with ID %s" % (params['classname'], params['id']))

        # We need to connect the node to its parent, or to root if no valid parent is given.
        node_parent_id = params['parentid']
        if 0 == params['parentid']:
            # Find root element
            instance_operation.res_on_err = 'Failed to select root.'
            node_parent_id = ClassInstance.objects.filter(
                    project=project_id,
                    class_column=class_map['root'])[0].id

        if params['relationname'] not in relation_map:
            instance_operation.res_on_err = ''
            raise Exception('Failed to select relation %s' % params['relationname'])

        instance_operation.res_on_err = 'Failed to insert relation.'
        cici = ClassInstanceClassInstance()
        cici.user = request.user
        cici.project_id = project_id
        cici.relation_id = relation_map[params['relationname']]
        cici.class_instance_a_id = node.id
        cici.class_instance_b_id = node_parent_id
        cici.save()

        return HttpResponse(json.dumps({'class_instance_id': node.id}))

    def move_node():
        # Can only move the node if the user owns the node and the target node,
        # or the user is a superuser
        can_edit_class_instance_or_fail(request.user, params['src'], 'node') # node to move
        can_edit_class_instance_or_fail(request.user, params['ref'], 'node') # new parent node
        #
        if 0 == params['src'] or 0 == params['ref']:
            raise Exception('src (%s) or ref (%s) not set.' % (params['src'], params['ref']))

        relation_type = 'part_of'
        if 'skeleton' == params['classname']:  # Special case for model_of relationship
            relation_type = 'model_of'

        instance_operation.res_on_err = 'Failed to update %s relation.' % relation_type
        ClassInstanceClassInstance.objects.filter(
                project=project_id,
                relation=relation_map[relation_type],
                class_instance_a=params['src']).update(class_instance_b=params['ref'])

        insert_into_log(project_id, request.user.id, 'move_%s' % params['classname'], None, 'Moved %s with ID %s to %s with ID %s' % (params['classname'], params['id'], params['targetname'], params['ref']))
        return HttpResponse(json.dumps({'message': 'Success.'}))

    def has_relations():
        relations = [request.POST.get('relation%s' % i, 0) for i in range(int(params['relationnr']))]
        relation_ids = []
        for relation in relations:
            instance_operation.res_on_err = 'Failed to select relation %s' % relation
            relation_ids.append(relation_map[relation])
        instance_operation.res_on_err = 'Failed to select CICI.'
        relation_count = ClassInstanceClassInstance.objects.filter(
                project=project_id,
                class_instance_b=params['id'],
                relation__in=relation_ids).count()
        if relation_count > 0:
            return HttpResponse(json.dumps({'has_relation': 1}))
        else:
            return HttpResponse(json.dumps({'has_relation': 0}))

    try:
        # Dispatch to operation
        if params['operation'] not in ['rename_node', 'remove_node', 'create_node', 'move_node', 'has_relations']:
            raise Exception('No operation called %s.' % params['operation'])
        return locals()[params['operation']]()

    except Exception as e:
        if instance_operation.res_on_err == '':
            raise
        else:
            raise Exception(instance_operation.res_on_err + '\n' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def tree_object_expand(request, project_id=None):
    class_instance_id = request.POST.get('class_instance_id', None)
    if class_instance_id is None:
        raise Exception('A skeleton id has not been provided!')
    else:
        class_instance_id = int(class_instance_id) # sanitize by casting to int

    relation_map = get_relation_to_id_map(project_id)

    # Treenode is element_of class_instance (skeleton), which is model_of (neuron)
    # which is part_of class_instance (?), recursively, until reaching class_instance
    # ('root').

    response_on_error = ''
    try:
        # 1. Retrieve neuron id of the skeleton
        response_on_error = 'Cannot find neuron for the skeleton with id: %s' % class_instance_id
        neuron_id = ClassInstanceClassInstance.objects.filter(
            project=project_id,
            relation=relation_map['model_of'],
            class_instance_a=class_instance_id)[0].class_instance_b_id

        path = [class_instance_id, neuron_id]

        while True:
            # 2. Retrieve all the nodes of which the neuron is a part of.
            response_on_error = 'Cannot find parent instance for instance with id: %s' % path[-1]
            parent = ClassInstanceClassInstance.objects.filter(
                project=project_id,
                class_instance_a=path[-1],
                relation=relation_map['part_of']).values(
                'class_instance_b',
                'class_instance_b__class_column__class_name',
                'class_instance_b__name')[0]

            path.append(parent['class_instance_b'])

            # The 'Isolated synaptic terminals' is a special group:
            # 1. Its contained elements are never listed by default.
            # 2. If a treenode is selected that belongs to it, the neuron of the skeleton of that node
            #    is listed alone.
            # Here, interrupt the chain at the group level
            if 'Isolated synaptic terminals' == parent['class_instance_b__name']:
                break

            if 'root' == parent['class_instance_b__class_column__class_name']:
                break

        path.reverse()
        return HttpResponse(json.dumps(path))

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def objecttree_get_all_skeletons(request, project_id=None, node_id=None):
    """ Retrieve all skeleton ids for a given node in the object tree. """
    g = get_annotation_graph( project_id )
    potential_skeletons = nx.bfs_tree(g, int(node_id)).nodes()
    result = tuple(nid for nid in potential_skeletons if 'skeleton' == g.node[nid]['class'])
    json_return = json.dumps({'skeletons': result}, sort_keys=True, indent=4)
    return HttpResponse(json_return, content_type='text/json')


def _collect_neuron_ids(node_id, node_type=None):
    """ Retrieve a list of neuron IDs that are nested inside node_id in the Object Tree.
    If the node_type is 'neuron', returns node_id. """
    cursor = connection.cursor()

    # Check whether node_id is a neuron itself
    if not node_type:
        cursor.execute('''
        SELECT class.class_name
        FROM class, class_instance
        WHERE class.id = class_instance.class_id
          AND class_instance.id = %s
        ''', [node_id])
        row = cursor.fetchone()
        if row:
            node_type = row[0]
    
    if 'neuron' == node_type:
        return [node_id]

    # Recursive search into groups
    groups = deque()
    groups.append(node_id)
    neuron_ids = []
    while len(groups) > 0:
        nid = groups.popleft()
        # Find all part_of nid
        # In table class_instance_class_instance, class_instance_a is part_of class_instance_b
        cursor.execute('''
        SELECT
            class_instance_class_instance.class_instance_a,
            class.class_name
        FROM
            class,
            class_instance,
            class_instance_class_instance,
            relation
        WHERE
            relation.relation_name = 'part_of'
            AND class_instance_class_instance.relation_id = relation.id
            AND class_instance_class_instance.class_instance_b = %s
            AND class_instance_class_instance.class_instance_a = class_instance.id
            AND class_instance.class_id = class.id
        ''', [nid])
        for row in cursor.fetchall():
            # row[0] is the class_instance.id that is part_of nid
            # row[1] is the class.class_name
            if 'neuron' == row[1]:
                neuron_ids.append(row[0])
            elif 'group' == row[1]:
                groups.append(row[0])

    return neuron_ids


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def collect_neuron_ids(request, project_id=None, node_id=None, node_type=None):
    """ Retrieve all neuron IDs under a given group or neuron node of the Object Tree,
    recursively."""
    try:
        return HttpResponse(json.dumps(_collect_neuron_ids(node_id, node_type)))
    except Exception as e:
        raise Exception('Failed to obtain a list of neuron IDs:' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def collect_skeleton_ids(request, project_id=None, node_id=None, node_type=None, threshold=1):
    """ Retrieve all skeleton IDs under a given group or neuron node of the Object Tree,
    recursively, as a dictionary of skeleton ID vs neuron name.
    Limits the collection to skeletons with more treenodes than the threshold."""
    neuron_ids = _collect_neuron_ids(node_id, node_type)
    if neuron_ids:
        # Find skeleton IDs and neuron names
        # A skeleton is a model_of a neuron
        cursor = connection.cursor()
        cursor.execute('''
        SELECT cici.class_instance_a, ci.name
        FROM class_instance_class_instance cici,
             class_instance ci,
             relation r
        WHERE cici.class_instance_b IN (%s)
          AND cici.relation_id = r.id
          AND r.relation_name = 'model_of'
          AND ci.id = cici.class_instance_b
        ''' % ','.join(map(str, neuron_ids))) # no need to sanitize
        skeletons = dict(cursor.fetchall())
    else:
        skeletons = {}

    # Skip skeletons with less than threshold+1 nodes
    if skeletons and threshold > 0:
        cursor = connection.cursor()
        cursor.execute('''
        SELECT skeleton_id FROM treenode WHERE skeleton_id IN (%s) GROUP BY skeleton_id HAVING count(*) > %s
        ''' % (",".join(map(str, skeletons)), int(threshold)))
        skeleton_ids = {row[0]: skeletons[row[0]] for row in cursor.fetchall()}
    else:
        skeleton_ids = skeletons

    return HttpResponse(json.dumps(skeleton_ids))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def tree_object_list(request, project_id=None):
    parent_id = int(request.POST.get('parentid', 0))
    parent_name = request.POST.get('parentname', '')
    expand_request = request.POST.get('expandtarget', None)
    if expand_request is None:
        expand_request = tuple()
    else:
        # Parse to int to sanitize
        expand_request = tuple(int(x) for x in expand_request.split(','))

    max_nodes = 5000  # Limit number of nodes retrievable.

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    # First, check if the tracing system is correctly set-up
    setup_okay, mc, mr, mci = check_tracing_setup_detailed(project_id,
        class_map, relation_map, check_root_ci=False)
    if not setup_okay:
        # Check permissions
        can_administer = request.user.has_perm('can_administer', project_id)
        # Find missing links and classes
        return HttpResponse(json.dumps(
            {'needs_setup': True,
             'missing_classes': mc,
             'missing_relations': mr,
             'missing_classinstances': mci,
             'has_needed_permissions': can_administer}))

    response_on_error = ''
    try:
        if 0 == parent_id:
            response_on_error = 'Could not select the id of the root node.'
            root_node_q = ClassInstance.objects.filter(
                project=project_id,
                class_column=class_map['root'])

            if 0 == root_node_q.count():
                root_id = 0
                root_name = 'noname'
            else:
                root_node = root_node_q[0]
                root_id = root_node.id
                root_name = root_node.name

            return HttpResponse(json.dumps([{
                'data': {'title': root_name},
                'attr': {'id': 'node_%s' % root_id, 'rel': 'root'},
                'state': 'closed'}]))

        if 'Isolated synaptic terminals' in parent_name:
            response_on_error = 'Failed to find children of the Isolated synaptic terminals'
            c = connection.cursor()

            if not expand_request:
                return HttpResponse(json.dumps([]))

            neuron_id = expand_request[-2]

            c.execute('''
                    SELECT class_instance.name
                    FROM class_instance
                    WHERE class_instance.id = %s
                    ''', [neuron_id])

            row = c.fetchone()

            return HttpResponse(json.dumps([{
                'data': {'title': row[0]},
                'attr': {'id': 'node_%s' % neuron_id, 'rel': 'neuron'},
                'state': 'closed'}]))


        # parent_name is not 'Isolated synaptic terminals'
        response_on_error = 'Could not retrieve child nodes.'
        c = connection.cursor()
        # Must select the user as well because the user who created the skeleton may be differen
        # than the user who puts the request for the listing in the Object Tree.
        c.execute('''
                SELECT ci.id,
                       ci.name,
                       "auth_user".username AS username,
                       cl.class_name
                FROM class_instance AS ci
                    INNER JOIN class_instance_class_instance AS cici
                    ON ci.id = cici.class_instance_a
                    INNER JOIN class AS cl
                    ON ci.class_id = cl.id
                    INNER JOIN "auth_user"
                    ON ci.user_id = "auth_user".id
                WHERE cici.class_instance_b = %s
                  AND (cici.relation_id = %s
                       OR cici.relation_id = %s
                       OR cici.relation_id = %s)
                ORDER BY ci.class_id DESC, ci.name ASC
                LIMIT %s''', (
            parent_id,
            relation_map['model_of'],
            relation_map['annotated_with'],
            relation_map['part_of'],
            max_nodes))

        return HttpResponse(json.dumps(
                    tuple({'data': {'title': row[1] if not 'skeleton' == row[1] else '%s (%s)' % (row[1], row[2])},
                           'attr': {'id': 'node_%s' % row[0],
                                    'rel': string.replace(row[3], ' ', '')},
                           'state': 'closed'} for row in c.fetchall())))

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


@requires_user_role(UserRole.Annotate)
def remove_empty_neurons(request, project_id=None, group_id=None):
    """ Recursively visit the groups and neurons under group_id,
    and delete neurons that for which no skeleton is a model_of.
    """
    group_id = int(group_id) # sanitize
    cursor = connection.cursor()

    classes = dict(Class.objects.values_list('class_name', 'id').filter(project_id=project_id, class_name__in=('neuron', 'group')))
    relations = dict(Relation.objects.values_list('relation_name', 'id').filter(project_id=project_id, relation_name__in=('model_of', 'part_of')))

    # Check that group_id is the ID of a group
    cursor.execute('''
    SELECT count(*)
    FROM class_instance
    WHERE id = %s
      AND class_id = %s
    ''' % (group_id, classes['group']))
    if 1 != cursor.fetchone()[0]:
        raise Exception('The given ID #%s does not correspond to a group!' % group_id)

    # Obtain sets of neurons and groups under the group with group_id, recursively
    group_ids = set([group_id])
    neurons = set()
    skipped = 0
    while group_ids:
        cursor.execute('''
        SELECT ci.id, ci.class_id, ci.user_id
        FROM class_instance_class_instance cici,
             class_instance ci
        WHERE cici.class_instance_b = %s
          AND cici.relation_id = %s
          AND cici.class_instance_a = ci.id
          AND (ci.class_id = %s OR ci.class_id = %s)
        ''' % (int(group_ids.pop()), relations['part_of'], classes['neuron'], classes['group']))
        for row in cursor.fetchall():
            if row[1] == classes['group']:
                group_ids.add(row[0])
            elif row[1] == classes['neuron']:
                # A user can only delete owned neurons
                if request.user.is_superuser or request.user.id == row[2]:
                    neurons.add(row[0])
                else:
                    skipped += 1

    # Select neurons that are modeled by skeletons
    cursor.execute('''
    SELECT cici.class_instance_b
    FROM class_instance_class_instance cici,
         class,
         class_instance ci
    WHERE cici.class_instance_b IN (%s)
      AND cici.relation_id = %s
      AND cici.class_instance_a = ci.id
      AND ci.class_id = class.id
      AND class.class_name = 'skeleton'
    ''' % (",".join(map(str, neurons)), relations['model_of']))
    # Filter out neurons modeled by skeletons
    empty_neurons = neurons - set(row[0] for row in cursor.fetchall())
    if empty_neurons:
        ClassInstance.objects.filter(id__in=empty_neurons, user=request.user).delete()
        message = 'Deleted %s empty neuron%s%s' % (len(empty_neurons), '' if 1 == len(empty_neurons) else 's', '' if 0 == skipped else ', skipped %s neurons not owned by you.' % skipped)
    elif skipped > 0:
        message = "All %s empty neurons found are not owned by you" % skipped
    else:
        message = 'No empty neurons found.'

    return HttpResponse(json.dumps({'message': message}))
