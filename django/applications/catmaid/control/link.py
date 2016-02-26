import json

from django.http import HttpResponse
from django.core.exceptions import ObjectDoesNotExist

from catmaid.models import UserRole, Project, Relation, Treenode, Connector, \
        TreenodeConnector, ClassInstance
from catmaid.control.authentication import requires_user_role, can_edit_or_fail

@requires_user_role(UserRole.Annotate)
def create_link(request, project_id=None):
    """ Create a link between a connector and a treenode

    Currently the following link types (relations) are supported:
    presynaptic_to, postsynaptic_to, abutting, gapjunction_with.
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

    # The object returned in case of success
    result = {}

    if link_type == 'postsynaptic_to':
        # Warn if there is already a link from the source skeleton to the
        # target skeleton. This can happen and is not necessarely wrong, but
        # worth to double check, because it is likely a mistake.
        post_links_to_skeleton = TreenodeConnector.objects.filter(project=project,
            connector=to_connector, relation=relation, skeleton_id=from_treenode.skeleton_id).count()
        if post_links_to_skeleton == 1:
            result['warning'] = 'There is already one post-synaptic ' \
                'connection to the target skeleton'
        elif post_links_to_skeleton > 1:
            result['warning'] = 'There are already %s post-synaptic ' \
                'connections to the target skeleton' % post_links_to_skeleton

        # Enforce only synaptic links
        gapjunction_links = TreenodeConnector.objects.filter(project=project, connector=to_connector, 
            relation__relation_name='gapjunction_with')
        if (gapjunction_links.count() != 0):
            return HttpResponse(json.dumps({'error': 'Connector %s cannot have both a gap junction and a postsynaptic node.' % to_id}))
  
    if link_type == 'gapjunction_with':
        # Enforce only two gap junction links
        gapjunction_links = TreenodeConnector.objects.filter(project=project, connector=to_connector, relation=relation)
        synapse_links = TreenodeConnector.objects.filter(project=project, connector=to_connector, relation__relation_name__endswith='synaptic_to')
        if (gapjunction_links.count() > 1):
            return HttpResponse(json.dumps({'error': 'Connector %s can only have two gap junction connections.' % to_id}))
        if (synapse_links.count() != 0):
            return HttpResponse(json.dumps({'error': 'Connector %s is part of a synapse, and gap junction can not be added.' % to_id}))

    link = TreenodeConnector(
        user=request.user,
        project=project,
        relation=relation,
        treenode=from_treenode,  # treenode_id = from_id
        skeleton=from_treenode.skeleton,  # treenode.skeleton_id where treenode.id = from_id
        connector=to_connector  # connector_id = to_id
    )
    link.save()
    print(link.__dict__)

    result['message'] = 'success'
    result['link_id'] = link.id
    return HttpResponse(json.dumps(result), content_type='application/json')


@requires_user_role(UserRole.Annotate)
def delete_link(request, project_id=None):
    connector_id = int(request.POST.get('connector_id', 0))
    treenode_id = int(request.POST.get('treenode_id', 0))

    links = TreenodeConnector.objects.filter(
        connector=connector_id,
        treenode=treenode_id).select_related('relation')

    if links.count() == 0:
        raise ValueError('Couldn\'t find link between connector {} '
                'and node {}'.format(connector_id, treenode_id))

    link = links[0]

    # Could be done by filtering above when obtaining the links,
    # but then one cannot distinguish between the link not existing
    # and the user_id not matching or not being superuser.
    can_edit_or_fail(request.user, link.id, 'treenode_connector')

    link.delete()
    return HttpResponse(json.dumps({
        'link_id': link.id,
        'link_type_id': link.relation.id,
        'link_type': ink.relation.relation_name,
        'result': 'Removed treenode to connector link'
    }))

