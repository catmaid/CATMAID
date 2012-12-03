import json
from string import upper

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Count

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *


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
        if property_name == 'confidence':
            property_value = int(property_value)
        elif property_name == 'radius':
            property_value = float(property_value)
        else:
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

        # return HttpResponse(json.dumps({'success': 'Updated %s of treenode %s to %s.' % (property_name, treenode_id, property_value)}))
        return HttpResponse(property_value)

    except Exception as e:
        raise CatmaidException(response_on_error + ':' + str(e))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@transaction_reportable_commit_on_success
def list_treenode_table(request, project_id=None):
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
        t = Treenode.objects.filter(
            project = project_id,
            skeleton_id__in = skeleton_ids).extra(
            tables=['auth_user'],
            where=[
                '"treenode"."user_id" = "auth_user"."id"'],
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
                'username': '"auth_user"."username"',
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
                    return upper(filter_labels) in upper(' '.join(labels_by_treenode[treenode.tid]))
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
            skeleton_id__in=skeleton_ids).annotate(
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
        if filter_nodetype is not None and not filter_nodetype == '':
            def nodetype_filter(treenode):
                return upper(treenode.nodetype) in upper(filter_nodetype)
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

    except Exception as e:
        raise CatmaidException(response_on_error + ':' + str(e))