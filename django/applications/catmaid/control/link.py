import json

from django.http import HttpResponse

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
def create_link(request, project_id=None, logged_in_user=None):
    from_id = request.POST.get('from_id', 0)
    to_id = request.POST.get('to_id', 0)
    link_type = request.POST.get('link_type', 'none')

    try:
        project = Project.objects.get(id=project_id)
        relation = Relation.objects.get(project=project, relation_name=link_type)
        from_treenode = Treenode.objects.get(id=from_id)
        to_connector = Connector.objects.get(id=to_id, project=project)
    except ObjectDoesNotExist as e:
        return HttpResponse(json.dumps({'error': e.message}))

    related_skeleton_count = ClassInstance.objects.filter(project=project, id=from_treenode.skeleton.id).count()
    if (related_skeleton_count > 1):
        # I don't see the utility of this check, think it can only happen if
        # treenodes with non-unique IDs exist in DB. Duplicating it from PHP
        # though.
        return HttpResponse(json.dumps({'error': 'Multiple rows for treenode with ID #%s found' % from_id}))
    elif (related_skeleton_count == 0):
        return HttpResponse(json.dumps({'error': 'Failed to retrieve skeleton id of treenode #%s' % from_id}))

    if (link_type == 'presynaptic_to'):
        # Enforce only one presynaptic link
        presyn_links = TreenodeConnector.objects.filter(project=project, connector=to_connector, relation=relation)
        if (presyn_links.count() != 0):
            return HttpResponse(json.dumps({'error': 'Connector %s does not have zero presynaptic connections.' % to_id}))

    TreenodeConnector(
        user=logged_in_user,
        project=project,
        relation=relation,
        treenode=from_treenode,  # treenode_id = from_id
        skeleton=from_treenode.skeleton,  # treenode.skeleton_id where treenode.id = from_id
        connector=to_connector  # connector_id = to_id
    ).save()

    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')


@requires_user_role(UserRole.Annotate)
@transaction_reportable_commit_on_success
def delete_link(request, project_id=None, logged_in_user=None):
    connector_id = request.POST.get('connector_id', 0)
    treenode_id = request.POST.get('treenode_id', 0)

    links = TreenodeConnector.objects.filter(
        connector=connector_id,
        treenode=treenode_id)

    if (links.count() == 0):
        return HttpResponse(json.dumps({'error': 'Failed to delete connector #%s from geometry domain.' % connector_id}))

    links.delete()
    return HttpResponse(json.dumps({'result': 'Removed treenode to connector link'}))

