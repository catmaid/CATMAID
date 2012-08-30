import json

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

@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def instance_operation(request, project_id=None, logged_in_user=None):
    params = {}
    default_values = {
            'operation': 0,
            'title': 0,
            'id': 0,
            'src': 0,
            'ref': 0,
            'rel': 0,
            'classname': 0,
            'relationname': 0,
            'objname': 0,
            'parentid': 0,
            'targetname': 0,
            'relationnr': 0}
    for p in default_values.keys():
        params[p] = request.POST.get(p, default_values[p])

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    # We avoid many try/except clauses by setting this string to be the
    # response we return if an exception is thrown.
    instance_operation.res_on_err = ''

    def remove_skeletons(skeleton_id_list):
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

    def rename_node():
        # Do not allow '|' in name because it is used as string separator in NeuroHDF export
        if '|' in params['title']:
            raise RollbackAndReport('Name should not contain pipe character!')

        instance_operation.res_on_err = 'Failed to update class instance.'
        nodes_to_rename = ClassInstance.objects.filter(id=params['id'])
        node_ids = [node.id for node in nodes_to_rename]
        if len(node_ids) > 0:
            nodes_to_rename.update(name=params['title'])
            insert_into_log(project_id, logged_in_user.id, "rename_%s" % params['classname'], None, "Renamed %s with ID %s to %s" % (params['classname'], params['id'], params['title']))
            return HttpResponse(json.dumps({'class_instance_ids': node_ids}))
        else:
            raise RollbackAndReport('Could not find any node with ID %s' % params['id'])

    def remove_node():
        # Check if node is a skeleton. If so, we have to remove its treenodes as well!
        if params['rel'] == None:
            RollbackAndReport('No relation given!')

        elif params['rel'] == 'skeleton':
            remove_skeletons([params['id']])
            insert_into_log(project_id, logged_in_user.id, 'remove_skeleton', None, 'Removed skeleton with ID %s and name %s' % (params['id'], params['title']))
            return HttpResponse(json.dumps({'status': 1, 'message': 'Removed skeleton successfully.'}))

        elif params['rel'] == 'neuron':
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
                insert_into_log(project_id, logged_in_user.id, 'remove_neuron', None, 'Removed neuron with ID %s and name %s' % (params['id'], params['title']))
                return HttpResponse(json.dumps({'status': 1, 'message': 'Removed neuron successfully.'}))
            else:
                raise RollbackAndReport('Could not find any node with ID %s' % params['id'])

        else:
            instance_operation.res_on_err = 'Failed to delete node from instance table.'
            node_to_delete = ClassInstance.objects.filter(id=params['id'])
            if node_to_delete.count() > 0:
                node_to_delete.delete()
                return HttpResponse(json.dumps({'status': 1, 'message': 'Removed node successfully.'}))
            else:
                raise RollbackAndReport('Could not find any node with ID %s' % params['id'])

    def create_node():
        if params['classname'] not in class_map:
            raise RollbackAndReport('Failed to select class.')
        instance_operation.res_on_err = 'Failed to insert instance of class.'
        node = ClassInstance(
                user=logged_in_user,
                name=params['objname'])
        node.project_id = project_id
        node.class_column_id = class_map[params['classname']]
        node.save()
        insert_into_log(project_id, logged_in_user.id, "create_%s" % params['classname'], None, "Created %s with ID %s" % (params['classname'], params['id']))

        # We need to connect the node to its parent, or to root if no valid parent is given.
        node_parent_id = params['parentid']
        if params['parentid'] == 0:
            # Find root element
            instance_operation.res_on_err = 'Failed to select root.'
            node_parent_id = ClassInstance.objects.filter(
                    project=project_id,
                    class_column=class_map['root'])[0].id

        if params['relationname'] not in relation_map:
            RollbackAndReport('Failed to select relation %s' % params['relationname'])

        instance_operation.res_on_err = 'Failed to insert relation.'
        cici = ClassInstanceClassInstance()
        cici.user = logged_in_user
        cici.project_id = project_id
        cici.relation_id = relation_map[params['relationname']]
        cici.class_instance_a_id = node.id
        cici.class_instance_b_id = node_parent_id
        cici.save()

        return HttpResponse(json.dumps({'class_instance_id': node.id}))

    def move_node():
        if params['src'] == 0 or params['ref'] == 0:
            RollbackAndReport('src (%s) or ref (%s) not set.' % (params['src'], params['ref']))

        relation_type = 'part_of'
        if params['classname'] == 'skeleton':  # Special case for model_of relationship
            relation_type = 'model_of'

        instance_operation.res_on_err = 'Failed to update %s relation.' % relation_type
        ClassInstanceClassInstance.objects.filter(
                project=project_id,
                relation=relation_map[relation_type],
                class_instance_a=params['src']).update(class_instance_b=params['ref'])

        insert_into_log(project_id, logged_in_user.id, 'move_%s' % params['classname'], None, 'Moved %s with ID %s to %s with ID %s' % (params['classname'], params['id'], params['targetname'], params['ref']))
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
            raise RollbackAndReport('No operation called %s.' % params['operation'])
        return locals()[params['operation']]()

    except RollbackAndReport:
        raise
    except Exception as e:
        if (instance_operation.res_on_err == ''):
            raise RollbackAndReport({'error': str(e)})
        else:
            raise RollbackAndReport({'error': instance_operation.res_on_err})


@catmaid_login_required
@transaction_reportable_commit_on_success
def tree_object_expand(request, project_id=None, logged_in_user=None):
    skeleton_id = request.POST.get('skeleton_id', None)
    if skeleton_id is None:
        raise RollbackAndReport('A skeleton id has not been provided!')
    else:
        skeleton_id = int(skeleton_id)

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
                'class_instance_b__class_column__class_name')[0]
            path.append(parent['class_instance_b'])
            if 'root' == parent['class_instance_b__class_column__class_name']:
                break

        path.reverse()
        return HttpResponse(json.dumps(path))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)

@catmaid_login_required
@transaction_reportable_commit_on_success
def objecttree_get_all_skeletons(request, project_id=None, node_id=None, logged_in_user=None):
    """ Retrieve all skeleton ids for a given node in the object tree
    """
    g = get_annotation_graph( project_id )
    potential_skeletons = nx.bfs_tree(g, int(node_id)).nodes()
    result = []
    for node_id in potential_skeletons:
        if g.node[node_id]['class'] == 'skeleton':
            result.append( node_id )
    json_return = json.dumps({'skeletons': result}, sort_keys=True, indent=4)
    return HttpResponse(json_return, mimetype='text/json')


@catmaid_login_required
@transaction_reportable_commit_on_success
def tree_object_list(request, project_id=None, logged_in_user=None):
    parent_id = int(request.POST.get('parentid', 0))
    parent_name = request.POST.get('parentname', '')
    expand_request = request.POST.get('expandtarget', None)
    if expand_request is None:
        expand_request = []
    else:
        expand_request = expand_request.split(',')

    max_nodes = 1000  # Limit number of nodes retrievable.

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    for class_name in ['neuron', 'skeleton', 'group', 'root']:
        if class_name not in class_map:
            raise RollbackAndReport('Can not find "%s" class for this project' % class_name)

    for relation in ['model_of', 'part_of']:
        if relation not in relation_map:
            raise RollbackAndReport('Can not find "%s" relation for this project' % relation)

    response_on_error = ''
    try:
        if parent_id == 0:
            response_on_error = 'Could not select the id of the root node.'
            root_node_q = ClassInstance.objects.filter(
                project=project_id,
                class_column=class_map['root'])

            if root_node_q.count() == 0:
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
            c.execute('''
                    SELECT count(tci.id) as treenodes,
                            ci.id,
                            ci.name,
                            ci.class_id, cici.relation_id,
                            cici.class_instance_b AS parent,
                            sk.id AS skeleton_id,
                            u.name AS username,
                            cl.class_name
                    FROM class_instance ci,
                        class cl,
                        class_instance_class_instance cici,
                        class_instance_class_instance modof,
                        class_instance sk,
                        treenode_class_instance tci,
                        "user" u
                    WHERE cici.class_instance_b = %s AND
                        cici.class_instance_a = ci.id AND
                        cl.id = ci.class_id AND
                        modof.class_instance_b = cici.class_instance_a AND
                        modof.relation_id = %s AND
                        sk.id = modof.class_instance_a AND
                        tci.class_instance_id = sk.id AND
                        tci.relation_id = %s AND
                        u.id = ci.user_id AND
                        ci.project_id = %s
                    GROUP BY ci.id,
                            ci.name,
                            ci.class_id,
                            cici.relation_id,
                            cici.class_instance_b,
                            skeleton_id,
                            u.name,
                            cl.class_name
                    HAVING count(tci.id) > 1
            ''', [parent_id, relation_map['model_of'], relation_map['element_of'], project_id])
            res = cursor_fetch_dictionary(c)

            # If this list is part of an expansion caused by selecting a
            # particular skeleton that is part of a neuron that is in the
            # 'Isolated synaptic terminals', add that to the results.

            if parent_id not in expand_request:
                print >> sys.stderr, 'got isolated_group_index '
                print >> sys.stderr, 'got len(expand_request) %s' % len(expand_request)
            else:
                isolated_group_index = expand_request.index(parent_id)
                print >> sys.stderr, 'got isolated_group_index %s' % isolated_group_index
                print >> sys.stderr, 'got len(expand_request) %s' % len(expand_request)

                response_on_error = 'Failed to find the requested neuron.'
                neuron_id = expand_request[isolated_group_index + 1]

                c.execute('''
                        SELECT ci.id,
                                ci.name,
                                ci.class_id,
                                u.name AS username,
                                cici.relation_id,
                                cici.class_instance_b AS parent,
                                cl.class_name
                        FROM class_instance AS ci
                        INNER JOIN class_instance_class_instance AS cici
                            ON ci.id = cici.class_instance_a
                        INNER JOIN class AS cl
                            ON ci.class_id = cl.id
                        INNER JOIN "user" AS u
                            ON ci.user_id = u.id
                        WHERE ci.id = %s AND
                            ci.project_id = %s AND
                            cici.class_instance_b = %s AND
                            (cici.relation_id = %s
                                OR cici.relation_id = %s)
                        ORDER BY ci.name
                        LIMIT %s''', [
                    neuron_id,
                    project_id,
                    parent_id,
                    relation_map['model_of'],
                    relation_map['part_of'],
                    max_nodes])
                extra_res = cursor_fetch_dictionary(c)
                print >> sys.stderr, pprint.pformat(extra_res)

                res += extra_res

        # parent_name is not 'Isolated synaptic terminals'
        response_on_error = 'Could not retrieve child nodes.'
        c = connection.cursor()
        c.execute('''
                SELECT ci.id,
                        ci.name,
                        ci.class_id,
                        "user".name AS username,
                        cici.relation_id,
                        cici.class_instance_b AS parent,
                        cl.class_name
                FROM class_instance AS ci
                    INNER JOIN class_instance_class_instance AS cici
                    ON ci.id = cici.class_instance_a
                    INNER JOIN class AS cl
                    ON ci.class_id = cl.id
                    INNER JOIN "user"
                    ON ci.user_id = "user".id
                WHERE ci.project_id = %s AND
                        cici.class_instance_b = %s AND
                        (cici.relation_id = %s
                        OR cici.relation_id = %s)
                ORDER BY ci.name ASC
                LIMIT %s''', [
            project_id,
            parent_id,
            relation_map['model_of'],
            relation_map['part_of'],
            max_nodes])
        res = cursor_fetch_dictionary(c)

        output = []
        for row in res:
            formatted_row = {
                'data': {'title': row['name']},
                'attr': {
                    'id': 'node_%s' % row['id'],
                    # Replace whitespace because of tree object types.
                    'rel': string.replace(row['class_name'], ' ', '')},
                'state': 'closed'}

            if row['class_name'] == 'skeleton':
                formatted_row['data']['title'] += ' (%s)' % row['username']

            output.append(formatted_row)

        return HttpResponse(json.dumps(output))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)
