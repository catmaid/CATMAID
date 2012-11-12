import json

from django.http import HttpResponse

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@transaction.commit_on_success
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
            'skid': node['treenode__skeleton']}

    search_string = request.GET.get('substring', "")

    row_query = ClassInstance.objects.values('id', 'name', 'class_column__class_name').filter(
        name__icontains=search_string,
        project=project_id).order_by('class_column__class_name', 'name')
    rows = list(row_query)

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
        'treenode__skeleton',
        'class_instance__name')

    # Insert nodes into their rows
    for node in node_query:
        row_with_node = label_rows[node['class_instance__name']]
        nodes = row_with_node.get('nodes', None)
        if not nodes:
          nodes = []
          row_with_node['nodes'] = nodes
        nodes.append(format_node_data(node))

    return HttpResponse(json.dumps(rows))

