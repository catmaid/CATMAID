import json

from django.http import HttpResponse

from catmaid.models import *
from catmaid.fields import Double3D
from catmaid.control.authentication import *
from catmaid.control.common import *


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def search(request, project_id=None):
    def format_node_data(node):
        '''
        Formats node data for our json output.

        When we start using Django 1.4, we can use prefetch_related instead of using
        .values('treenode__xxx'), and will then be able to access a proper location
        object.
        '''
        location = Double3D.from_str(node['treenode__location'])
        return {
            'id': node['treenode'],
            'x': int(location.x),
            'y': int(location.y),
            'z': int(location.z),
            't': int(node['treenode__location_t']),
            'ch': int(node['treenode__location_c']),
            'skid': node['treenode__skeleton']}


    def format_node_data_get(node):
        '''
        Formats node data for our json output.

        When we start using Django 1.4, we can use prefetch_related instead of using
        .values('treenode__xxx'), and will then be able to access a proper location
        object.
        '''

        return {
            'id': node.id,
            'x': node.location.x,
            'y': node.location.y,
            'z': node.location.z,
            't': int(node.location_t),
            'ch': int(node.location_c),
            'skid': node.skeleton_id}

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
        'treenode__location',
        'treenode__location_t',
        'treenode__location_c',
        'treenode__skeleton',
        'class_instance__name')

    for node in node_query:
        row_with_node = label_rows[node['class_instance__name']]
        nodes = row_with_node.get('nodes', None)
        if not nodes:
          nodes = []
          row_with_node['nodes'] = nodes
        nodes.append(format_node_data(node))


    # 4. Query nodes by ID, if the search string is a number
    try:
        oid = int(search_string)
        oid_query = Treenode.objects.get(
                pk=int(oid),
                project=project_id
                )
        #if we are here it means object exists
        row = {}
        row['class_name'] = 'node'
        row['id'] = search_string
        row['name'] = 'node'
        nodes2 = []
        nodes2.append( format_node_data_get(oid_query) )
        row['nodes'] = nodes2
        rows.append( row )

    except ValueError:
        pass  
    except ObjectDoesNotExist as e: #in case object does not exist
        pass

    return HttpResponse(json.dumps(rows))

