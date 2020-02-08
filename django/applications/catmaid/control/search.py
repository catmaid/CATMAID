from django.db import connection
from django.http import HttpRequest, JsonResponse

from catmaid.models import (UserRole, ClassInstance, ConnectorClassInstance,
        Treenode, Connector, TreenodeClassInstance)
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_relation_to_id_map


@requires_user_role(UserRole.Browse)
def search(request:HttpRequest, project_id=None) -> JsonResponse:
    search_string = request.GET.get('substring', "")
    if not search_string:
        raise ValueError("Need search term")

    ids = set()

    cursor = connection.cursor()

    # 1. Query ClassInstance objects, where the name contains the search string.
    # This retrieves neurons, skeletons and groups by name.
    cursor.execute("""
        SELECT ci.id, ci.name, c.class_name
        FROM class_instance ci
        JOIN class c
            ON c.id = ci.class_id
        WHERE ci.project_id = %(project_id)s
            AND ci.name ~* %(term)s
        ORDER BY c.class_name, ci.name
    """, {
        'project_id': project_id,
        'term': search_string,
    })
    rows = [{
        'id': row[0],
        'name': row[1],
        'class_name': row[2]
    } for row in cursor.fetchall()]
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
    matching_labels_set = set()
    label_rows = {}
    for row in rows:
        # Prepare for retrieving nodes holding text labels
        if row['class_name'] == 'label':
            matching_labels_set.add(row['name'])
            label_rows[row['id']] = row

    # We need a list to pass it to psycopg2.
    matching_labels = list(matching_labels_set)

    # Find treenodes with label. Use the UPPER() function to be able to use the
    # respective expression index, cutting down query times by a lot.
    cursor.execute("""
        SELECT tci.treenode_id, t.location_x, t.location_y, t.location_z,
            t.skeleton_id, tci.class_instance_id
        FROM treenode_class_instance tci
        JOIN class_instance ci
            ON tci.class_instance_id = ci.id
        JOIN treenode t
            ON tci.treenode_id = t.id
        JOIN UNNEST(%(matching_labels)s::text[]) query(name)
            ON query.name = ci.name AND UPPER(ci.name) = UPPER(query.name)
        WHERE tci.project_id = %(project_id)s
            AND tci.relation_id = %(labeled_as_id)s
            AND t.project_id = %(project_id)s
        ORDER BY tci.treenode_id DESC;
    """, {
        'project_id': project_id,
        'labeled_as_id': relation_map['labeled_as'],
        'matching_labels': matching_labels,
    })

    for node in cursor.fetchall():
        row_with_node = label_rows[node[5]]
        nodes = row_with_node.get('nodes', None)
        if not nodes:
            nodes = []
            row_with_node['nodes'] = nodes
        nodes.append({
            'id': node[0],
            'x': node[1],
            'y': node[2],
            'z': node[3],
            'skid': node[4]
        })


    # Find connectors with label. Use the UPPER() function to be able to use the
    # respective expression index, cutting down query times by a lot.
    cursor.execute("""
        SELECT c.id, c.location_x, c.location_y, c.location_z, ci.id
        FROM connector_class_instance cci
        JOIN class_instance ci
            ON ci.id = cci.class_instance_id
        JOIN connector c
            ON c.id = cci.connector_id
        JOIN UNNEST(%(matching_labels)s::text[]) query(name)
            ON query.name = ci.name AND UPPER(ci.name) = UPPER(query.name)
        WHERE cci.project_id = %(project_id)s
            AND cci.relation_id = %(labeled_as_id)s
            AND c.project_id = %(project_id)s
    """, {
        'project_id': project_id,
        'labeled_as_id': relation_map['labeled_as'],
        'matching_labels': matching_labels,
    })

    for connector in cursor.fetchall():
        row_with_node = label_rows[connector[4]]
        connectors = row_with_node.get('connectors', None)
        if not connectors:
            connectors = []
            row_with_node['connectors'] = connectors
        connectors.append({
            'id': connector[0],
            'x': connector[1],
            'y': connector[2],
            'z': connector[3]
        })


    return JsonResponse(rows, safe=False)
