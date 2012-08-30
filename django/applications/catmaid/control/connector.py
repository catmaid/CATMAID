import json
from string import upper

from django.http import HttpResponse
from django.db.models import Count

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

@catmaid_login_required
@transaction_reportable_commit_on_success
def list_connector(request, project_id=None, logged_in_user=None):
    skeleton_id = request.POST.get('skeleton_id', None)
    if skeleton_id is None:
        return HttpResponse(json.dumps({
            'iTotalRecords': 0,
            'iTotalDisplayRecords': 0,
            'aaData': []}))
    else:
        skeleton_id = int(skeleton_id)

    relation_type = int(request.POST.get('relation_type', 0))  # 0: Presyn, 1 Postsyn
    display_start = int(request.POST.get('iDisplayStart', None))
    display_length = int(request.POST.get('iDisplayLength', None))
    sorting_column = int(request.POST.get('iSortCol_0', 0))
    sorting_direction = request.POST.get('sSortDir_0', 'DESC')
    sort_descending = upper(sorting_direction) != 'ASC'

    response_on_error = ''
    try:
        response_on_error = 'Could not fetch relations.'
        relation_map = get_relation_to_id_map(project_id)
        for rel in ['presynaptic_to', 'postsynaptic_to', 'element_of', 'labeled_as']:
            if rel not in relation_map:
                raise RollbackAndReport('Failed to find the required relation %s' % rel)

        if relation_type == 1:
            relation_type_id = relation_map['presynaptic_to']
            inverse_relation_type_id = relation_map['postsynaptic_to']
        else:
            relation_type_id = relation_map['postsynaptic_to']
            inverse_relation_type_id = relation_map['presynaptic_to']

        response_on_error = 'Failed to select connectors.'
        cursor = connection.cursor()
        cursor.execute(
            '''
            SELECT
            connector.id AS connector_id,
            tn_other.user_id AS connector_user_id,
            treenode_user.name AS connector_username,
            (connector.location).x AS connector_x,
            (connector.location).y AS connector_y,
            (connector.location).z AS connector_z,
            tn_other.id AS other_treenode_id,
            (tn_other.location).x AS other_treenode_x,
            (tn_other.location).y AS other_treenode_y,
            (tn_other.location).z AS other_treenode_z,
            tn_other.skeleton_id AS other_skeleton_id,
            (tn_this.location).x AS this_treenode_x,
            (tn_this.location).y AS this_treenode_y,
            (tn_this.location).z AS this_treenode_z,
            tn_this.id AS this_treenode_id,
            tc_this.relation_id AS this_to_connector_relation_id,
            tc_other.relation_id AS connector_to_other_relation_id
            FROM
            treenode tn_other,
            treenode_connector tc_other,
            connector,
            "user" treenode_user,
            treenode_connector tc_this,
            treenode tn_this,
            treenode_class_instance tci_this
            WHERE
            treenode_user.id = tn_other.user_id AND
            tn_other.id = tc_other.treenode_id AND
            tc_other.connector_id = connector.id AND
            tc_other.relation_id = %s AND
            tc_this.connector_id = connector.id AND
            tn_this.id = tc_this.treenode_id AND
            tc_this.relation_id = %s AND
            tci_this.treenode_id = tn_this.id AND
            tci_this.relation_id = %s AND
            tci_this.class_instance_id = %s
            ORDER BY
            connector_id, other_treenode_id, this_treenode_id
            ''',  [inverse_relation_type_id, relation_type_id, relation_map['element_of'], skeleton_id])

        connectors = cursor_fetch_dictionary(cursor)
        connected_skeletons = map(lambda con: con['other_skeleton_id'], connectors)
        connector_ids = map(lambda con: con['connector_id'], connectors)

        response_on_error = 'Failed to find counts of treenodes in skeletons.'
        skel_tn_count = Treenode.objects.filter(skeleton__in=connected_skeletons)\
        .values('skeleton').annotate(treenode_count=Count('skeleton'))
        # .values to group by skeleton_id. See http://tinyurl.com/dj-values-annotate

        skeleton_to_treenode_count = {}
        for s in skel_tn_count:
            skeleton_to_treenode_count[s['skeleton']] = s['treenode_count']

        # Rather than do a LEFT OUTER JOIN to also include the connectors
        # with no partners, just do another query to find the connectors
        # without the conditions:

        response_on_error = 'Failed to select all connectors.'
        cursor.execute(
            '''
            SELECT
            connector.id AS connector_id,
            connector.user_id AS connector_user_id,
            connector_user.name AS connector_username,
            (connector.location).x AS connector_x,
            (connector.location).y AS connector_y,
            (connector.location).z AS connector_z,
            tn_this.id AS this_treenode_id,
            tc_this.relation_id AS this_to_connector_relation_id
            FROM
            connector,
            "user" connector_user,
            treenode_connector tc_this,
            treenode tn_this,
            treenode_class_instance tci_this
            WHERE
            connector_user.id = connector.user_id AND
            tc_this.connector_id = connector.id AND
            tn_this.id = tc_this.treenode_id AND
            tc_this.relation_id = %s AND
            tci_this.treenode_id = tn_this.id AND
            tci_this.relation_id = %s AND
            tci_this.class_instance_id = %s
            ORDER BY
            connector_id, this_treenode_id
            ''',  [relation_type_id, relation_map['element_of'], skeleton_id])
        for row in cursor_fetch_dictionary(cursor):
            connector_id = row['connector_id']
            if connector_id not in connector_ids:
                connectors.append(row)
                connector_ids.append(connector_id)

        # For each of the connectors, find all of its labels:
        response_on_error = 'Failed to find the labels for connectors'
        if (connector_ids > 0):
            connector_labels = ConnectorClassInstance.objects.filter(
                project=project_id,
                connector__in=connector_ids,
                relation=relation_map['labeled_as']).values(
                'connector',
                'class_instance__name')

            labels_by_connector = {}  # Key: Connector ID, Value: List of labels.
            for label in connector_labels:
                if label['connector'] not in labels_by_connector:
                    labels_by_connector[label['connector']] = [label['class_instance__name']]
                else:
                    labels_by_connector[label['connector']].append(label['class_instance__name'])
                # Sort labels by name
            for labels in labels_by_connector.values():
                labels.sort(key=upper)

        total_result_count = len(connectors)

        # Paging
        if display_length is None:
            connectors = connectors[display_start:]
            connector_ids = connector_ids[display_start:]
        else:
            connectors = connectors[display_start:display_start + display_length]
            connector_ids = connector_ids[display_start:display_start + display_length]

        # Format output
        aaData_output = []
        for c in connectors:
            response_on_error = 'Failed to format output for connector with ID %s.' % c['connector_id']
            if 'other_skeleton_id' in c:
                connected_skeleton_treenode_count = skeleton_to_treenode_count[c['other_skeleton_id']]
            else:
                c['other_skeleton_id'] = ''
                c['other_treenode_id'] = ''
                c['other_treenode_x'] = c['connector_x']
                c['other_treenode_y'] = c['connector_y']
                c['other_treenode_z'] = c['connector_z']
                connected_skeleton_treenode_count = 0

            if c['connector_id'] in labels_by_connector:
                labels = ', '.join(map(str, labels_by_connector[c['connector_id']]))
            else:
                labels = ''

            row = []
            row.append(str(c['connector_id']))
            row.append(str(c['other_skeleton_id']))
            row.append(str('%.2f' % c['other_treenode_x']))
            row.append(str('%.2f' % c['other_treenode_y']))
            row.append(str('%.2f' % c['other_treenode_z']))
            row.append(labels)
            row.append(str(connected_skeleton_treenode_count))
            row.append(str(c['connector_username']))
            row.append(str(c['other_treenode_id']))
            aaData_output.append(row)

        # Sort output
        def fetch_value_for_sorting(row):
            value = row[sorting_column]
            if isinstance(value, str) or isinstance(value, unicode):
                value = upper(value)
            return value
        aaData_output.sort(key=fetch_value_for_sorting)

        if sort_descending:
            aaData_output.reverse()

        return HttpResponse(json.dumps({
            'iTotalRecords': total_result_count,
            'iTotalDisplayRecords': total_result_count,
            'aaData': aaData_output}))

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def create_connector(request, project_id=None, logged_in_user=None):
    query_parameters = {}
    default_values = {'x': 0, 'y': 0, 'z': 0, 'confidence': 5}
    for p in default_values.keys():
        query_parameters[p] = request.POST.get(p, default_values[p])

    parsed_confidence = int(query_parameters['confidence'])
    if (parsed_confidence not in range(1, 6)):
        return HttpResponse(json.dumps({'error': 'Confidence not in range 1-5 inclusive.'}))

    location = Double3D(x=float(query_parameters['x']), y=float(query_parameters['y']), z=float(query_parameters['z']))
    new_connector = Connector(
        user=logged_in_user,
        project=Project.objects.get(id=project_id),
        location=location,
        confidence=parsed_confidence)
    new_connector.save()

    return HttpResponse(json.dumps({'connector_id': new_connector.id}))


@catmaid_can_edit_project
@transaction.commit_on_success
def delete_connector(request, project_id=None, logged_in_user=None):
    connector_id = int(request.POST.get("connector_id", 0))
    Connector.objects.filter(id=connector_id).delete()
    return HttpResponse(json.dumps({
        'message': 'Removed connector and class_instances',
        'connector_id': connector_id}))


