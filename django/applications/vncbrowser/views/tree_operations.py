import json

from django.http import HttpResponse

from common import insert_into_log
from vncbrowser.models import ClassInstance, Treenode, TreenodeConnector, ClassInstanceClassInstance
from vncbrowser.transaction import transaction_reportable_commit_on_success, RollbackAndReport
from vncbrowser.views import catmaid_can_edit_project
from vncbrowser.views.catmaid_replacements import get_relation_to_id_map, get_class_to_id_map


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
