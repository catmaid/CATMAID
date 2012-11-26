import json
import string
from collections import deque

try:
    import networkx as nx
except ImportError:
    pass

from django.http import HttpResponse

from catmaid.control.object import get_annotation_graph

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *


@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
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
        can_edit_or_fail(request.user, params['id'], 'class_instance')
        # Do not allow '|' in name because it is used as string separator in NeuroHDF export
        if '|' in params['title']:
            raise CatmaidException('Name should not contain pipe character!')

        instance_operation.res_on_err = 'Failed to update class instance.'
        nodes_to_rename = ClassInstance.objects.filter(id=params['id'])
        node_ids = [node.id for node in nodes_to_rename]
        if len(node_ids) > 0:
            nodes_to_rename.update(name=params['title'])
            insert_into_log(project_id, request.user.id, "rename_%s" % params['classname'], None, "Renamed %s with ID %s to %s" % (params['classname'], params['id'], params['title']))
            return HttpResponse(json.dumps({'class_instance_ids': node_ids}))
        else:
            raise CatmaidException('Could not find any node with ID %s' % params['id'])

    def remove_node():
        # Can only remove the node if the user owns it or the user is a superuser
        can_edit_or_fail(request.user, params['id'], 'class_instance')
        # Check if node is a skeleton. If so, we have to remove its treenodes as well!
        if 0 == params['rel']:
            CatmaidException('No relation given!')

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
                raise CatmaidException('Could not find any node with ID %s' % params['id'])

        else:
            instance_operation.res_on_err = 'Failed to delete node from instance table.'
            node_to_delete = ClassInstance.objects.filter(id=params['id'])
            if node_to_delete.count() > 0:
                node_to_delete.delete()
                return HttpResponse(json.dumps({'status': 1, 'message': 'Removed node successfully.'}))
            else:
                raise CatmaidException('Could not find any node with ID %s' % params['id'])

    def create_node():
        # Can only create a node if the parent node is owned by the user
        # or the user is a superuser
        # Given that the parentid is 0 to signal root (but root has a non-zero id),
        # this implies that regular non-superusers cannot create nodes under root,
        # but only in their staging area.
        can_edit_or_fail(request.user, params['parentid'], 'class_instance')

        if params['classname'] not in class_map:
            raise CatmaidException('Failed to select class.')
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
            CatmaidException('Failed to select relation %s' % params['relationname'])

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
        can_edit_or_fail(request.user, params['src'], 'class_instance') # node to move
        can_edit_or_fail(request.user, params['ref'], 'class_instance') # new parent node
        #
        if 0 == params['src'] or 0 == params['ref']:
            raise CatmaidException('src (%s) or ref (%s) not set.' % (params['src'], params['ref']))

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
            raise CatmaidException('No operation called %s.' % params['operation'])
        return locals()[params['operation']]()

    except CatmaidException:
        raise
    except Exception as e:
        raise CatmaidException(instance_operation.res_on_err + '\n' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def tree_object_expand(request, project_id=None):
    skeleton_id = request.POST.get('skeleton_id', None)
    if skeleton_id is None:
        raise CatmaidException('A skeleton id has not been provided!')
    else:
        skeleton_id = int(skeleton_id) # sanitize by casting to int

    relation_map = get_relation_to_id_map(project_id)

    # Treenode is element_of class_instance (skeleton), which is model_of (neuron)
    # which is part_of class_instance (?), recursively, until reaching class_instance
    # ('root').

    response_on_error = ''
    try:
        # 1. Retrieve neuron id of the skeleton
        response_on_error = 'Cannot find neuron for the skeleton with id: %s' % skeleton_id
        neuron_id = ClassInstanceClassInstance.objects.filter(
            project=project_id,
            relation=relation_map['model_of'],
            class_instance_a=skeleton_id)[0].class_instance_b_id

        path = [skeleton_id, neuron_id]

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
        raise CatmaidException(response_on_error + ':' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def objecttree_get_all_skeletons(request, project_id=None, node_id=None):
    """ Retrieve all skeleton ids for a given node in the object tree. """
    g = get_annotation_graph( project_id )
    potential_skeletons = nx.bfs_tree(g, int(node_id)).nodes()
    result = tuple(nid for nid in potential_skeletons if 'skeleton' == g.node[nid]['class'])
    json_return = json.dumps({'skeletons': result}, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')


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
            print >> sys.stderr, row
            if 'neuron' == row[1]:
                neuron_ids.append(row[0])
            elif 'group' == row[1]:
                groups.append(row[0])

    return neuron_ids


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def collect_neuron_ids(request, project_id=None, node_id=None, node_type=None):
    """ Retrieve all neuron IDs under a given group or neuron node of the Object Tree,
    recursively."""
    try:
        return HttpResponse(json.dumps(_collect_neuron_ids(node_id, node_type)))
    except Exception as e:
        raise CatmaidException('Failed to obtain a list of neuron IDs:' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def collect_skeleton_ids(request, project_id=None, node_id=None, node_type=None):
    """ Retrieve all skeleton IDs under a given group or neuron node of the Object Tree,
    recursively."""
    try:
        neuron_ids = _collect_neuron_ids(node_id, node_type)
        if neuron_ids:
            # Find skeleton IDs
            # A skeleton is a model_of a neuron
            cursor = connection.cursor()
            cursor.execute('''
            SELECT class_instance_class_instance.class_instance_a
            FROM class_instance_class_instance,
                 relation
            WHERE relation.relation_name = 'model_of'
              AND class_instance_class_instance.relation_id = relation.id
              AND class_instance_class_instance.class_instance_b IN (%s)
            ''' % ','.join(str(x) for x in neuron_ids)) # no need to sanitize
            skeleton_ids = tuple(row[0] for row in cursor.fetchall())
        else:
            skeleton_ids = tuple()

        return HttpResponse(json.dumps(skeleton_ids))
    except Exception as e:
        raise CatmaidException('Failed to obtain a list of skeleton IDs:' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def tree_object_list(request, project_id=None):
    parent_id = int(request.GET.get('parentid', 0))
    parent_name = request.GET.get('parentname', '')
    expand_request = request.GET.get('expandtarget', None)
    if expand_request is None:
        expand_request = tuple()
    else:
        # Parse to int to sanitize
        expand_request = tuple(int(x) for x in expand_request.split(','))

    max_nodes = 5000  # Limit number of nodes retrievable.

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    for class_name in ['neuron', 'skeleton', 'group', 'root']:
        if class_name not in class_map:
            raise CatmaidException('Can not find "%s" class for this project' % class_name)

    for relation in ['model_of', 'part_of']:
        if relation not in relation_map:
            raise CatmaidException('Can not find "%s" relation for this project' % relation)

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
                       OR cici.relation_id = %s)
                ORDER BY ci.name ASC
                LIMIT %s''', (
            parent_id,
            relation_map['model_of'],
            relation_map['part_of'],
            max_nodes))

        return HttpResponse(json.dumps(
                    tuple({'data': {'title': row[1] if not 'skeleton' == row[1] else '%s (%s)' % (row[1], row[2])},
                           'attr': {'id': 'node_%s' % row[0],
                                    'rel': string.replace(row[3], ' ', '')},
                           'state': 'closed'} for row in c.fetchall())))

    except Exception as e:
        raise CatmaidException(response_on_error + ':' + str(e))
