import json
from string import upper

from django.http import HttpResponse
from django.db import connection
from django.db.models import Count
from django.shortcuts import get_object_or_404
from vncbrowser.models import ClassInstance, TreenodeClassInstance, Treenode, \
        Double3D, ClassInstanceClassInstance, TreenodeConnector, ProjectStack, \
        Stack
from vncbrowser.transaction import transaction_reportable_commit_on_success, RollbackAndReport
from vncbrowser.views import catmaid_can_edit_project, catmaid_login_required
from vncbrowser.views.catmaid_replacements import get_relation_to_id_map, get_class_to_id_map
from common import insert_into_log


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def create_treenode(request, project_id=None, logged_in_user=None):
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
    default_values = {
            'x': 0,
            'y': 0,
            'z': 0,
            'confidence': 0,
            'useneuron': -1,
            'parent_id': 0,
            'radius': 0,
            'targetgroup': 'none'}
    for p in default_values.keys():
        params[p] = request.POST.get(p, default_values[p])

    relation_map = get_relation_to_id_map(project_id)
    class_map = get_class_to_id_map(project_id)

    def insert_new_treenode(parent_id=None, skeleton=None):
        new_treenode = Treenode()
        new_treenode.user = logged_in_user
        new_treenode.project_id = project_id
        new_treenode.location = Double3D(float(params['x']), float(params['y']), float(params['z']))
        new_treenode.radius = int(params['radius'])
        new_treenode.skeleton = skeleton
        new_treenode.confidence = int(params['confidence'])
        if parent_id:
            new_treenode.parent_id = parent_id
        new_treenode.save()
        return new_treenode

    def make_treenode_element_of_skeleton(treenode, skeleton):
        new_treenode_ci = TreenodeClassInstance()
        new_treenode_ci.user = logged_in_user
        new_treenode_ci.project_id = project_id
        new_treenode_ci.relation_id = relation_map['element_of']
        new_treenode_ci.treenode = treenode
        new_treenode_ci.class_instance = skeleton
        new_treenode_ci.save()

    def create_relation(relation_id, instance_a_id, instance_b_id):
        neuron_relation = ClassInstanceClassInstance()
        neuron_relation.user = logged_in_user
        neuron_relation.project_id = project_id
        neuron_relation.relation_id = relation_id
        neuron_relation.class_instance_a_id = instance_a_id
        neuron_relation.class_instance_b_id = instance_b_id
        neuron_relation.save()
        return neuron_relation

    def relate_neuron_to_skeleton(neuron, skeleton):
        return create_relation(relation_map['model_of'], skeleton, neuron)

    response_on_error = ''

    try:
        if int(params['parent_id']) != -1:  # A root node and parent node exist
            # Retrieve skeleton of parent
            response_on_error = 'Can not find skeleton for parent treenode %s in this project.' % params['parent_id']
            p_skeleton = TreenodeClassInstance.objects.filter(
                    treenode=params['parent_id'],
                    relation=relation_map['element_of'],
                    project=project_id)[0].class_instance

            response_on_error = 'Could not insert new treenode!'
            new_treenode = insert_new_treenode(params['parent_id'], p_skeleton)

            response_on_error = 'Could not create element_of relation between treenode and skeleton!'
            make_treenode_element_of_skeleton(new_treenode, p_skeleton)

            return HttpResponse(json.dumps({'treenode_id': new_treenode.id, 'skeleton_id': p_skeleton.id}))

        else:
            # No parent node: We must create a new root node, which needs a
            # skeleton and a neuron to belong to.
            response_on_error = 'Could not insert new treenode instance!'

            new_skeleton = ClassInstance()
            new_skeleton.user = logged_in_user
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

                response_on_error = 'Could not create element_of relation between treenode and skeleton!'
                make_treenode_element_of_skeleton(new_treenode, new_skeleton)

                return HttpResponse(json.dumps({
                    'treenode_id': new_treenode.id,
                    'skeleton_id': new_skeleton.id,
                    'neuron_id': params['useneuron']}))
            else:
                # A neuron does not exist, therefore we put the new skeleton
                # into a new neuron, and put the new neuron into the fragments group.
                response_on_error = 'Failed to insert new instance of a neuron.'
                new_neuron = ClassInstance()
                new_neuron.user = logged_in_user
                new_neuron.project_id = project_id
                new_neuron.class_column_id = class_map['neuron']
                new_neuron.name = 'neuron'
                new_neuron.save()
                new_neuron.name = 'neuron %d' % new_neuron.id
                new_neuron.save()

                response_on_error = 'Could not relate the neuron model to the new skeleton!'
                relate_neuron_to_skeleton(new_neuron.id, new_skeleton.id)

                # Add neuron to fragments
                try:
                    fragment_group = ClassInstance.objects.filter(
                            name=params['targetgroup'],
                            project=project_id)[0]
                except IndexError:
                    # If the fragments group does not exist yet, must create it and add it:
                    response_on_error = 'Failed to insert new instance of group.'
                    fragment_group = ClassInstance()
                    fragment_group.user = logged_in_user
                    fragment_group.project_id = project_id
                    fragment_group.class_column_id = class_map['group']
                    fragment_group.name = params['targetgroup']
                    fragment_group.save()

                    response_on_error = 'Failed to retrieve root.'
                    root = ClassInstance.objects.filter(
                            project=project_id,
                            class_column=class_map['root'])[0]

                    response_on_error = 'Failed to insert part_of relation between root node and fragments group.'
                    create_relation(relation_map['part_of'], fragment_group.id, root.id)

                response_on_error = 'Failed to insert part_of relation between neuron id and fragments group.'
                create_relation(relation_map['part_of'], new_neuron.id, fragment_group.id)

                response_on_error = 'Failed to insert instance of treenode.'
                new_treenode = insert_new_treenode(None, new_skeleton)

                response_on_error = 'Failed to insert treenode into the skeleton'
                make_treenode_element_of_skeleton(new_treenode, new_skeleton)

                response_on_error = 'Failed to write to logs.'
                insert_into_log(project_id, logged_in_user.id, 'create_neuron', new_treenode.location, 'Create neuron %d and skeleton %d' % (new_neuron.id, new_skeleton.id))

                return HttpResponse(json.dumps({
                    'treenode_id': new_treenode.id,
                    'skeleton_id': new_skeleton.id,
                    'neuron_id': new_neuron.id,
                    'fragmentgroup_id': fragment_group.id
                    }))
    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def reroot_treenode(request, project_id=None, logged_in_user=None):
    treenode_id = request.POST.get('tnid', None)
    if treenode_id is None:
        raise RollbackAndReport('A treenode id has not been provided!')

    response_on_error = ''
    try:
        response_on_error = 'Failed to select treenode with id %s.' % treenode_id
        treenode = Treenode.objects.filter(
                id=treenode_id,
                project=project_id)

        # no parent found or is root, then return
        response_on_error = 'An error occured while rerooting. No valid query result.'
        treenode = treenode[0]

        first_parent = treenode.parent
        if first_parent is None:
            raise RollbackAndReport('An error occured while rerooting. No valid query result.')

        # Traverse up the chain of parents, reversing the parent relationships so
        # that the selected treenode (with ID treenode_id) becomes the root.
        node_to_become_new_parent = treenode
        change_node = first_parent  # Will have its parent changed each iteration.
        while True:
            # The parent's parent will have its parent changed next iteration.
            change_nodes_old_parent = change_node.parent

            response_on_error = 'Failed to update treenode with id %s to have new parent %s' % (change_node.id, node_to_become_new_parent.id)
            change_node.parent = node_to_become_new_parent
            change_node.save()

            if change_nodes_old_parent is None:
                break
            else:
                node_to_become_new_parent = change_node
                change_node = change_nodes_old_parent

        # Finally make treenode root
        response_on_error = 'Failed to set treenode with ID %s as root.' % treenode.id
        treenode.parent = None
        treenode.save()

        response_on_error = 'Failed to log reroot.'
        insert_into_log(project_id, logged_in_user.id, 'reroot_skeleton', treenode.location, 'Rerooted skeleton for treenode with ID %s' % treenode.id)

        return HttpResponse(json.dumps({'newroot': treenode.id}))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def link_treenode(request, project_id=None, logged_in_user=None):
    from_treenode = request.POST.get('from_id', None)
    to_treenode = request.POST.get('to_id', None)
    if from_treenode is None or to_treenode is None:
        raise RollbackAndReport('From treenode or to treenode not given.')
    else:
        from_treenode = int(from_treenode)
        to_treenode = int(to_treenode)

    relation_map = get_relation_to_id_map(project_id)
    if 'element_of' not in relation_map:
        raise RollbackAndReport('Could not find element_of relation.')

    response_on_error = ''
    try:
        response_on_error = 'Can not find skeleton for from-treenode.'
        from_skeleton = TreenodeClassInstance.objects.filter(
                project=project_id,
                treenode=from_treenode,
                relation=relation_map['element_of'])[0].class_instance_id

        response_on_error = 'Can not find skeleton for to-treenode.'
        to_skeleton = TreenodeClassInstance.objects.filter(
                project=project_id,
                treenode=to_treenode,
                relation=relation_map['element_of'])[0].class_instance_id

        if from_skeleton == to_skeleton:
            raise RollbackAndReport('Please do not join treenodes of the same skeleton. This introduces loops.')

        # Update element_of relationship of target skeleton the target skeleton is
        # removed and its treenode assume the skeleton id of the from-skeleton.

        response_on_error = 'Could not update TreenodeClassInstance table.'
        TreenodeClassInstance.objects.filter(
                class_instance=to_skeleton,
                relation=relation_map['element_of']).update(
                        class_instance=from_skeleton)

        response_on_error = 'Could not update Treenode table.'
        Treenode.objects.filter(
                skeleton=to_skeleton).update(skeleton=from_skeleton)

        response_on_error = 'Could not update TreenodeConnector table.'
        TreenodeConnector.objects.filter(
                skeleton=to_skeleton).update(skeleton=from_skeleton)

        # Remove skeleton of to_id (should delete part of to neuron by cascade,
        # leaving the parent neuron dangeling in the object tree).

        response_on_error = 'Could not delete skeleton with ID %s.' % to_skeleton
        ClassInstance.objects.filter(id=to_skeleton).delete()

        # Update the parent of to_treenode.
        response_on_error = 'Could not update parent of treenode with ID %s' % to_treenode
        Treenode.objects.filter(id=to_treenode).update(parent=from_treenode)

        response_on_error = 'Could not log actions.'
        location = get_object_or_404(Treenode, id=from_treenode).location
        insert_into_log(project_id, logged_in_user.id, 'join_skeleton', location, 'Joined skeleton with ID %s to skeleton with ID %s' % (from_skeleton, to_skeleton))

        return HttpResponse(json.dumps({
            'message': 'success',
            'fromid': from_treenode,
            'toid': to_treenode}))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def delete_treenode(request, project_id=None, logged_in_user=None):
    treenode_id = int(request.POST.get('treenode_id', -1))
    relation_map = get_relation_to_id_map(project_id)

    def get_class_instance_for_treenode(treenode, relation):
        return TreenodeClassInstance.objects.filter(
                project=project_id,
                relation=relation_map[relation],
                treenode=treenode)

    def get_ci_from_ci(class_instance, relation):
        return ClassInstanceClassInstance.objects.filter(
                project=project_id,
                relation=relation_map[relation],
                class_instance_a=class_instance)

    response_on_error = ''
    try:
        treenode = get_object_or_404(Treenode, id=treenode_id)
        if (treenode.parent is None):
            # This treenode is root. Each child treenode needs its own skeleton
            # that is part_of the original neuron.

            # Retrieve the original neuron id of this treenode's skeleton.
            response_on_error = 'Could not retrieve skeleton for this treenode.'
            skeleton_query = get_class_instance_for_treenode(treenode, 'element_of')
            skeleton = skeleton_query[0]

            # Does not do anything at the moment, will be useful when fixing
            # TODO below.
            # response_on_error = 'Could not find neuron for the skeleton.'
            # neuron = get_ci_from_ci(skeleton, 'model_of')[0]

            response_on_error = 'Could not retrieve children'
            children = Treenode.objects.filter(
                    project=project_id,
                    parent=treenode)

            if (children.count() > 0):
                raise RollbackAndReport("You can't delete the root node when it has children.")

            # Remove original skeleton.
            response_on_error = 'Could not delete skeleton.'
            skeleton_query.delete()

            # TODO Think we can do this pretty easily, comment from PHP function:
            # FIXME: do not remove neuron without checking if it has other skeletons!
            # $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$neu_id);

            # Remove treenode
            response_on_error = 'Could not delete treenode.'
            treenode.delete()

            return HttpResponse(json.dumps({'success': 'Removed treenode successfully.'}))

        else:
            # Treenode is not root it has a parent and children. We need to reconnect
            # all the children to the parent, and do not update the treenode element_of
            # skeleton relationship

            response_on_error = 'Could not update parent id of children nodes'
            children = Treenode.objects.filter(
                    project=project_id,
                    parent=treenode).update(parent=treenode.parent)

            response_on_error = 'Could not delete treenode #%d' % treenode.id
            treenode.delete()

            return HttpResponse(json.dumps({'message': 'Removed treenode successfully.'}))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)


@catmaid_login_required
@transaction_reportable_commit_on_success
def list_treenode_table(request, project_id=None, logged_in_user=None):
    stack_id = request.POST.get('stack_id', None)
    specified_skeleton_count = request.POST.get('skeleton_nr', 0)
    display_start = request.POST.get('iDisplayStart', 0)
    display_length = request.POST.get('iDisplayLength', -1)
    should_sort = request.POST.get('iSortCol_0', None)
    filter_nodetype = request.POST.get('sSearch_1', None)
    filter_labels = request.POST.get('sSearch_2', None)

    relation_map = get_relation_to_id_map(project_id)

    response_on_error = ''
    try:
        def search_query_is_empty():
            if specified_skeleton_count == 0:
                return True
            first_skeleton_id = request.POST.get('skeleton_0', None)
            if first_skeleton_id is None:
                return True
            elif upper(first_skeleton_id) in ['NONE', 'NULL']:
                return True
            return False

        if search_query_is_empty():
            return HttpResponse(json.dumps({
                'iTotalRecords': 0,
                'iTotalDisplayRecords': 0,
                'aaData': []}))
        else:
            response_on_error = 'Could not fetch %s skeleton IDs.' % specified_skeleton_count
            skeleton_ids = [int(request.POST.get('skeleton_%s' % i, 0)) for i in range(int(specified_skeleton_count))]

        if should_sort:
            column_count = int(request.POST.get('iSortingCols', 0))
            sorting_directions = [request.POST.get('sSortDir_%d' % d) for d in range(column_count)]
            sorting_directions = map(lambda d: '-' if upper(d) == 'DESC' else '', sorting_directions)

            fields = ['tid', 'type', '"treenode"."labels"', 'confidence', 'x', 'y', 'z', '"treenode"."section"', 'radius', 'username', 'last_modified', 'last_reviewer']
            # TODO type field not supported.
            sorting_index = [int(request.POST.get('iSortCol_%d' % d)) for d in range(column_count)]
            sorting_cols = map(lambda i: fields[i], sorting_index)

        response_on_error = 'Could not get the list of treenodes.'
        t = TreenodeClassInstance.objects.filter(
                project=project_id,
                class_instance__in=skeleton_ids).extra(
                        tables=['user', 'treenode'],
                        where=[
                            '"treenode_class_instance"."treenode_id" = "treenode"."id"',
                            '"treenode_class_instance"."user_id" = "user"."id"'],
                        select={
                            'tid': '"treenode"."id"',
                            'radius': '"treenode"."radius"',
                            'confidence': '"treenode"."confidence"',
                            'parent_id': '"treenode"."parent_id"',
                            'user_id': '"treenode"."user_id"',
                            'edition_time': '"treenode"."edition_time"',
                            'x': '("treenode"."location")."x"',
                            'y': '("treenode"."location")."y"',
                            'z': '("treenode"."location")."z"',
                            'username': '"user"."name"',
                            'last_reviewer': '"treenode"."reviewer_id"',
                            'last_modified': 'to_char("treenode"."edition_time", \'DD-MM-YYYY HH24:MI\')'
                            }).distinct()
        # Rationale for using .extra():
        # Since we don't use .order_by() for ordering, extra fields are not
        # included in the SELECT statement, and so .distinct() will work as
        # intended. See http://tinyurl.com/dj-distinct
        if should_sort:
            t = t.extra(order_by=[di + col for (di, col) in zip(sorting_directions, sorting_cols)])

        if int(display_length) == -1:
            treenodes = list(t[display_start:])
        else:
            treenodes = list(t[display_start:display_start + display_length])

        # The number of results to be displayed should include items that are
        # filtered out.
        row_count = len(treenodes)

        # Filter out irrelevant treenodes if a label has been specified
        if 'labeled_as' in relation_map:
            response_on_error = 'Could not retrieve labels for project.'
            project_lables = TreenodeClassInstance.objects.filter(
                    project=project_id,
                    relation=relation_map['labeled_as']).values(
                            'treenode',
                            'class_instance__name')
            labels_by_treenode = {}  # Key: Treenode ID, Value: List of labels.
            for label in project_lables:
                if label['treenode'] not in labels_by_treenode:
                    labels_by_treenode[label['treenode']] = [label['class_instance__name']]
                else:
                    labels_by_treenode[label['treenode']].append(label['class_instance__name'])

            if filter_labels:
                def label_filter(treenode):
                    if treenode.id not in labels_by_treenode:
                        return False
                    upper(filter_labels) in upper(labels_by_treenode[treenode.tid])
                treenodes = filter(label_filter, treenodes)

        # Filter out irrelevant treenodes if a node type has been specified.

        # FIXME: there's no need to do another query to find all the parents, so
        # long as we don't limit the treenodes fetched.

        # Count treenode's children to derive treenode types. The number of
        # children a treenode has determines its type. Types:
        # R : root (parent = null)
        # S : slab (has one child)
        # B : branch (has more than one child)
        # L : leaf (has no children)
        # X : undefined (uh oh!)
        response_on_error = 'Could not retrieve treenode parents.'
        child_count_query = Treenode.objects.filter(
                project=project_id,
                treenodeclassinstance__class_instance__in=skeleton_ids).annotate(
                        child_count=Count('children'))
        child_count = {}
        for treenode in child_count_query:
            child_count[treenode.id] = treenode.child_count

        for treenode in treenodes:
            if treenode.parent_id == None:
                treenode.nodetype = 'R'
            elif treenode.tid in child_count:
                children = child_count[treenode.tid]
                if children == 0:
                    treenode.nodetype = 'L'
                elif children == 1:
                    treenode.nodetype = 'S'
                elif children > 1:
                    treenode.nodetype = 'B'
                else:
                    treenode.nodetype = 'X'
            else:
                treenode.nodetype = 'L'

        # Now that we've assigned node types, filter based on them:
        if filter_nodetype is not None:
            def nodetype_filter(treenode):
                upper(treenode.nodetype) in upper(filter_nodetype)
            treenodes = filter(nodetype_filter, treenodes)

        response_on_error = 'Could not retrieve resolution and translation parameters for project.'
        resolution = get_object_or_404(Stack, id=int(stack_id)).resolution
        translation = get_object_or_404(ProjectStack, stack=int(stack_id), project=project_id).translation

        def formatTreenode(tn):
            row = [str(tn.tid)]
            row.append(tn.nodetype)
            if tn.tid in labels_by_treenode:
                row.append(', '.join(map(str, labels_by_treenode[tn.tid])))
            else:
                row.append('')
            row.append(str(tn.confidence))
            row.append('%.2f' % tn.x)
            row.append('%.2f' % tn.y)
            row.append('%.2f' % tn.z)
            row.append(int((tn.z - translation.z) / resolution.z))
            row.append(str(tn.radius))
            row.append(tn.username)
            row.append(tn.last_modified)
            row.append(str(tn.last_reviewer))
            return row

        result = {'iTotalRecords': row_count, 'iTotalDisplayRecords': row_count}
        response_on_error = 'Could not format output.'
        result['aaData'] = map(formatTreenode, treenodes)

        return HttpResponse(json.dumps(result))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)


@catmaid_login_required
@transaction_reportable_commit_on_success
def treenode_info(request, project_id=None, logged_in_user=None):
    treenode_id = request.POST.get('treenode_id', -1)
    if (treenode_id < 0):
        raise RollbackAndReport('A treenode id has not been provided!')

    c = connection.cursor()
    # Fetch all the treenodes which are in the bounding box:
    # (use raw SQL since we are returning values from several different models)
    c.execute("""
SELECT ci.id as skeleton_id, ci.name as skeleton_name,
ci2.id as neuron_id, ci2.name as neuron_name
FROM treenode_class_instance tci, relation r, relation r2,
class_instance ci, class_instance ci2, class_instance_class_instance cici
WHERE ci.project_id = %s AND
tci.relation_id = r.id AND r.relation_name = 'element_of' AND
tci.treenode_id = %s AND ci.id = tci.class_instance_id AND
ci.id = cici.class_instance_a AND ci2.id = cici.class_instance_b AND
cici.relation_id = r2.id AND r2.relation_name = 'model_of'
                            """, (project_id, treenode_id))
    results = [
            dict(zip([col[0] for col in c.description], row))
            for row in c.fetchall()
            ]
    if (len(results) > 1):
        raise RollbackAndReport('Found more than one skeleton and neuron for treenode %s' % treenode_id)
    elif (len(results) == 0):
        raise RollbackAndReport('No skeleton and neuron for treenode %s' % treenode_id)
    else:
        return HttpResponse(json.dumps(results[0]))
