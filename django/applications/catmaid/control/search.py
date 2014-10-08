import json

from django.http import HttpResponse

from catmaid.models import UserRole, ClassInstance, TreenodeClassInstance
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_relation_to_id_map


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def search(request, project_id=None):
    def format_node_data(node):
        '''
        Formats node data for our json output.

        When we start using Django 1.4, we can use prefetch_related instead of using
        .values('treenode__xxx'), and will then be able to access a proper location
        object.
        '''
        return {
            'id': node['treenode'],
            'x': int(node['treenode__location_x']),
            'y': int(node['treenode__location_y']),
            'z': int(node['treenode__location_z']),
            'skid': node['treenode__skeleton']}

    search_string = request.GET.get('substring', "")

    ids = set()

    # 1. Query ClassInstance objects, where the name contains the search string.
    # This retrieves neurons, skeletons and groups by name.
    row_query = ClassInstance.objects.values('id', 'name', 'class_column__class_name').filter(
        name__icontains=search_string,
        project=project_id).order_by('class_column__class_name', 'name')
    rows = list(row_query)
    for row in rows:
        ids.add(row['id'])

    # 2. Query skeletons and neurons by ID, if the search string is a number
    try:
        oid = int(search_string)
        oid_query = ClassInstance.objects.filter(
                pk=int(oid),
                class_column__class_name__in=('neuron', 'skeleton')
                ).values('id', 'name', 'class_column__class_name')
        for row in oid_query:
            if row['id'] not in ids:
                rows.append(row)
    except ValueError:
        pass

    # 3. Query labels in treenodes. First get a list of matching labels,
    # and then find a list of treenodes for each label.
    relation_map = get_relation_to_id_map(project_id)
    label_rows = {}
    for row in rows:
        # Change key-name of class_column__class_name for json output
        row['class_name'] = row.pop('class_column__class_name')
        # Prepare for retrieving nodes holding text labels
        if row['class_name'] == 'label':
            label_rows[row['name']] = row

    node_query = TreenodeClassInstance.objects.filter(
        project=project_id,
        treenode__project=project_id,
        relation=relation_map['labeled_as'],
        class_instance__name__in=label_rows.keys())\
    .order_by('-treenode__id')\
    .values('treenode',
        'treenode__location_x',
        'treenode__location_y',
        'treenode__location_z',
        'treenode__skeleton',
        'class_instance__name')

    for node in node_query:
        row_with_node = label_rows[node['class_instance__name']]
        nodes = row_with_node.get('nodes', None)
        if not nodes:
            nodes = []
            row_with_node['nodes'] = nodes
        nodes.append(format_node_data(node))

    return HttpResponse(json.dumps(rows))

