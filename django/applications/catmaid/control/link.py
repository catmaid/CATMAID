import json

from django.http import HttpResponse
from django.core.exceptions import ObjectDoesNotExist

from catmaid.models import UserRole, Project, Relation, Treenode, Connector, \
        TreenodeConnector, ClassInstance
from catmaid.control.authentication import requires_user_role, can_edit_or_fail

@requires_user_role(UserRole.Annotate)
def create_link(request, project_id=None):
    """ Create a link, currently only a presynaptic_to or postsynaptic_to relationship
    between a treenode and a connector.
    """
    from_id = int(request.POST.get('from_id', 0))
    to_id = int(request.POST.get('to_id', 0))
    link_type = request.POST.get('link_type', 'none')

    try:
        project = Project.objects.get(id=project_id)
        relation = Relation.objects.get(project=project, relation_name=link_type)
        from_treenode = Treenode.objects.get(id=from_id)
        to_connector = Connector.objects.get(id=to_id, project=project)
        links = TreenodeConnector.objects.filter(
            connector=to_id,
            treenode=from_id,
            relation=relation.id)
    except ObjectDoesNotExist as e:
        return HttpResponse(json.dumps({'error': e.message}))

    if links.count() > 0:
        return HttpResponse(json.dumps({'error': "A relation '%s' between these two elements already exists!" % link_type}))

    related_skeleton_count = ClassInstance.objects.filter(project=project, id=from_treenode.skeleton.id).count()
    if related_skeleton_count > 1:
        # Can never happen. What motivated this check for an error of this kind? Would imply that a treenode belongs to more than one skeleton, which was possible when skeletons owned treendoes via element_of relations rather than by the skeleton_id column.
        return HttpResponse(json.dumps({'error': 'Multiple rows for treenode with ID #%s found' % from_id}))
    elif related_skeleton_count == 0:
        return HttpResponse(json.dumps({'error': 'Failed to retrieve skeleton id of treenode #%s' % from_id}))

    if link_type == 'presynaptic_to':
        # Enforce only one presynaptic link
        presyn_links = TreenodeConnector.objects.filter(project=project, connector=to_connector, relation=relation)
        if (presyn_links.count() != 0):
            return HttpResponse(json.dumps({'error': 'Connector %s does not have zero presynaptic connections.' % to_id}))

    TreenodeConnector(
        user=request.user,
        project=project,
        relation=relation,
        treenode=from_treenode,  # treenode_id = from_id
        skeleton=from_treenode.skeleton,  # treenode.skeleton_id where treenode.id = from_id
        connector=to_connector  # connector_id = to_id
    ).save()

    return HttpResponse(json.dumps({'message': 'success'}), content_type='text/json')


@requires_user_role(UserRole.Annotate)
def delete_link(request, project_id=None):
    connector_id = int(request.POST.get('connector_id', 0))
    treenode_id = int(request.POST.get('treenode_id', 0))

    links = TreenodeConnector.objects.filter(
        connector=connector_id,
        treenode=treenode_id)

    if links.count() == 0:
        return HttpResponse(json.dumps({'error': 'Failed to delete connector #%s from geometry domain.' % connector_id}))

    # Could be done by filtering above when obtaining the links,
    # but then one cannot distinguish between the link not existing
    # and the user_id not matching or not being superuser.
    can_edit_or_fail(request.user, links[0].id, 'treenode_connector')

    links[0].delete()
    return HttpResponse(json.dumps({'result': 'Removed treenode to connector link'}))

