# -*- coding: utf-8 -*-

from django.http import HttpRequest, JsonResponse

from catmaid.models import (UserRole, ClassInstance, ConnectorClassInstance,
        Treenode, Connector, TreenodeClassInstance)
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_relation_to_id_map


@requires_user_role(UserRole.Browse)
def search(request:HttpRequest, project_id=None) -> JsonResponse:
    search_string = request.GET.get('substring', "")

    ids = set()

    # 1. Query ClassInstance objects, where the name contains the search string.
    # This retrieves neurons, skeletons and groups by name.
    row_query = ClassInstance.objects.values('id', 'name', 'class_column__class_name').filter(
        name__icontains=search_string,
        project=project_id).order_by('class_column__class_name', 'name')
    rows = [{
        'id': row['id'],
        'name': row['name'],
        'class_name': row['class_column__class_name']
    } for row in row_query]
    for row in rows:
        ids.add(row['id'])

    # 2. Query skeletons and neurons by ID, if the search string is a number
    try:
        oid = int(search_string)
        oid_query = ClassInstance.objects.filter(
                pk=int(oid),
                project_id=project_id,
                class_column__class_name__in=('neuron', 'skeleton')
                ).values('id', 'name', 'class_column__class_name')
        for row in oid_query:
            if row['id'] not in ids:
                rows.append({
                    'id': row['id'],
                    'name': row['name'],
                    'class_name': row['class_column__class_name']
                })
    except ValueError:
        pass

    # 2.1 Try to find treenode with ID of passed in string
    for loc_type, name in ((Treenode, 'treenode'), (Connector, 'connector')):
        try:
            location_id =int(search_string)
            nodes = loc_type.objects.filter(pk=location_id,
                    project_id=project_id).values('id', 'location_x', 'location_y', 'location_z')
            for row in nodes:
                if row['id'] not in ids:
                    rows.append({
                        'class_name': name,
                        'id': row['id'],
                        'x': row['location_x'],
                        'y': row['location_y'],
                        'z': row['location_z']
                    })
        except ValueError:
            pass

    # 3. Query labels in treenodes. First get a list of matching labels,
    # and then find a list of treenodes for each label.
    relation_map = get_relation_to_id_map(project_id)
    matching_labels = set()
    label_rows = {}
    for row in rows:
        # Prepare for retrieving nodes holding text labels
        if row['class_name'] == 'label':
            matching_labels.add(row['name'])
            label_rows[row['id']] = row

    # Find treenodes with label
    node_query = TreenodeClassInstance.objects.filter(
        project=project_id,
        treenode__project=project_id,
        relation=relation_map['labeled_as'],
        class_instance__name__in=matching_labels)\
    .order_by('-treenode__id')\
    .values('treenode',
        'treenode__location_x',
        'treenode__location_y',
        'treenode__location_z',
        'treenode__skeleton',
        'class_instance__name',
        'class_instance__id')

    for node in node_query:
        row_with_node = label_rows[node['class_instance__id']]
        nodes = row_with_node.get('nodes', None)
        if not nodes:
            nodes = []
            row_with_node['nodes'] = nodes
        nodes.append({
            'id': node['treenode'],
            'x': node['treenode__location_x'],
            'y': node['treenode__location_y'],
            'z': node['treenode__location_z'],
            'skid': node['treenode__skeleton']
        })


    # Find connectors with label
    connector_query = ConnectorClassInstance.objects.filter(
        project=project_id,
        connector__project=project_id,
        relation=relation_map['labeled_as'],
        class_instance__name__in=matching_labels)\
    .order_by('-connector__id')\
    .values('connector',
        'connector__location_x',
        'connector__location_y',
        'connector__location_z',
        'class_instance__name',
        'class_instance__id')

    for connector in connector_query:
        row_with_node = label_rows[connector['class_instance__id']]
        connectors = row_with_node.get('connectors', None)
        if not connectors:
            connectors = []
            row_with_node['connectors'] = connectors
        connectors.append({
            'id': connector['connector'],
            'x': connector['connector__location_x'],
            'y': connector['connector__location_y'],
            'z': connector['connector__location_z']
        })


    return JsonResponse(rows, safe=False)

