# -*- coding: utf-8 -*-

import json
from typing import Dict, Tuple

from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.core.exceptions import ObjectDoesNotExist

from catmaid import state
from catmaid.models import UserRole, Project, Relation, Treenode, Connector, \
        TreenodeConnector, ClassInstance
from catmaid.control.authentication import requires_user_role, can_edit_or_fail


LINK_TYPES = [
    {
        'name': 'Presynaptic',
        'type': 'Synaptic',
        'type_id': 'synaptic-connector',
        'relation': 'presynaptic_to',
        'isreciprocal': False,
        'cardinality': 1,
        'partner_reference': 'outgoing',
        'partner_relation': 'postsynaptic_to',
    }, {
        'name': 'Postsynaptic',
        'type': 'Synaptic',
        'type_id': 'synaptic-connector',
        'relation': 'postsynaptic_to',
        'isreciprocal': False,
        'cardinality': None,
        'partner_reference': 'incoming',
        'partner_relation': 'presynaptic_to',
    }, {
        'name': 'Abutting',
        'type': 'Abutting',
        'type_id': 'abutting-connector',
        'relation': 'abutting',
        'isreciprocal': True,
        'cardinality': None,
        'partner_reference': 'abutting',
        'partner_relation': 'abutting',
    }, {
        'name': 'Gap junction',
        'type': 'Gap junction',
        'type_id': 'gapjunction-connector',
        'relation': 'gapjunction_with',
        'isreciprocal': True,
        'cardinality': 2,
        'partner_reference': 'gapjunction',
        'partner_relation': 'gapjunction_with',
    }, {
        'name': 'Tight junction',
        'type': 'Tight junction',
        'type_id': 'tightjunction-connector',
        'relation': 'tightjunction_with',
        'isreciprocal': True,
        'cardinality': 2,
        'partner_reference': 'tightjunction',
        'partner_relation': 'tightjunction_with',
    }, {
        'name': 'Desmosome',
        'type': 'Desmosome',
        'type_id': 'desmosome-connector',
        'relation': 'desmosome_with',
        'isreciprocal': True,
        'cardinality': 2,
        'partner_reference': 'desmosome',
        'partner_relation': 'desmosome_with',
    }, {
        'name': 'Attachment',
        'type': 'Attachment',
        'type_id': 'attachment-connector',
        'relation': 'attached_to',
        'isreciprocal': False,
        'cardinality': None,
        'partner_reference': 'attachment',
        'partner_relation': 'close_to',
    }, {
        'name': 'Close to',
        'type': 'Spatial',
        'type_id': 'spatial-connector',
        'relation': 'close_to',
        'isreciprocal': True,
        'cardinality': None,
        'partner_reference': 'close_object',
        'partner_relation': 'close_to',
    },
]


KNOWN_LINK_PAIRS = {
    'synaptic-connector': {
        'source': 'presynaptic_to',
        'target': 'postsynaptic_to'
    },
    'abutting-connector': {
        'source': 'abutting',
        'target': 'abutting'
    },
    'gapjunction-connector': {
        'source': 'gapjunction_with',
        'target': 'gapjunction_with'
    },
    'tightjunction-connector': {
        'source': 'tightjunction_with',
        'target': 'tightjunction_with',
    },
    'desmosome-connector': {
        'source': 'desmosome_with',
        'target': 'desmosome_with',
    },
    'attachment-connector': {
        'source': 'attached_to',
        'target': 'close_to'
    },
    'spatial-connector': {
        'source': 'attached_to',
        'target': 'close_to'
    },
}


LINK_RELATION_NAMES = [r['relation'] for r in LINK_TYPES]


UNDIRECTED_LINK_TYPES =[p['relation'] for p in LINK_TYPES if p['isreciprocal']]


UNDIRECTED_BINARY_LINK_TYPES =[p['relation'] for p in LINK_TYPES
            if p['isreciprocal'] and p.get('cardinality', None) == 2]


LINKS_BY_RELATION = {l['relation']:l for l in LINK_TYPES} # type: Dict


@requires_user_role(UserRole.Annotate)
def create_link(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Create a link between a connector and a treenode

    Currently the following link types (relations) are supported:
    presynaptic_to, postsynaptic_to, abutting, gapjunction_with,
    tightjunction_with, desmosome_with.
    """
    from_id = int(request.POST.get('from_id', 0))
    to_id = int(request.POST.get('to_id', 0))
    link_type = request.POST.get('link_type', 'none')

    cursor = connection.cursor()
    # Make sure the back-end is in the expected state
    state.validate_state([from_id, to_id], request.POST.get('state'),
            multinode=True, lock=True, cursor=cursor)

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
        return JsonResponse({'error': str(e)})

    if links.count() > 0:
        return JsonResponse({'error': "A relation '%s' between these two elements already exists!" % link_type})

    related_skeleton_count = ClassInstance.objects.filter(project=project, id=from_treenode.skeleton.id).count()
    if related_skeleton_count > 1:
        # Can never happen. What motivated this check for an error of this kind? Would imply that a treenode belongs to more than one skeleton, which was possible when skeletons owned treendoes via element_of relations rather than by the skeleton_id column.
        return JsonResponse({'error': 'Multiple rows for treenode with ID #%s found' % from_id})
    elif related_skeleton_count == 0:
        return JsonResponse({'error': 'Failed to retrieve skeleton id of treenode #%s' % from_id})

    if link_type == 'presynaptic_to':
        # Enforce only one presynaptic link
        presyn_links = TreenodeConnector.objects.filter(project=project, connector=to_connector, relation=relation)
        if (presyn_links.count() != 0):
            return JsonResponse({'error': 'Connector %s does not have zero presynaptic connections.' % to_id})

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
            return JsonResponse({'error': 'Connector %s cannot have both a gap junction and a postsynaptic node.' % to_id})

    if link_type in UNDIRECTED_BINARY_LINK_TYPES:
        # Enforce only two gap junction links
        undirected_links = TreenodeConnector.objects.filter(project=project, connector=to_connector, relation=relation)
        synapse_links = TreenodeConnector.objects.filter(project=project, connector=to_connector, relation__relation_name__endswith='synaptic_to')
        name = LINKS_BY_RELATION[link_type]['name'].lower();
        if (undirected_links.count() > 1):
            return JsonResponse({'error': 'Connector {} can only have two {} connections.'.format(to_id, name)})
        if (synapse_links.count() != 0):
            return JsonResponse({'error': 'Connector {} is part of a synapse, and {} can not be added.'.format(to_id, name)})

    link = TreenodeConnector(
        user=request.user,
        project=project,
        relation=relation,
        treenode=from_treenode,  # treenode_id = from_id
        skeleton=from_treenode.skeleton,  # treenode.skeleton_id where treenode.id = from_id
        connector=to_connector  # connector_id = to_id
    )
    link.save()

    result['message'] = 'success'
    result['link_id'] = link.id
    result['link_edition_time'] = link.edition_time
    result['relation_id'] = link.relation_id
    return JsonResponse(result)


@requires_user_role(UserRole.Annotate)
def delete_link(request:HttpRequest, project_id=None) -> JsonResponse:
    connector_id = int(request.POST.get('connector_id', 0))
    treenode_id = int(request.POST.get('treenode_id', 0))

    cursor = connection.cursor()
    # Make sure the back-end is in the expected state
    state.validate_state([treenode_id, connector_id], request.POST.get('state'),
            multinode=True, lock=True, cursor=cursor)

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

    deleted_link_id = link.id
    link.delete()
    return JsonResponse({
        'link_id': deleted_link_id,
        'link_type_id': link.relation.id,
        'link_type': link.relation.relation_name,
        'result': 'Removed treenode to connector link'
    })

def create_connector_link(project_id, user_id, treenode_id, skeleton_id,
        links, cursor=None):
    """Create new connector links for the passed in treenode. What relation and
    confidence is used to which connector is specified in the "links"
    paremteter. A list of three-element lists, following the following format:
    [<connector-id>, <relation-id>, <confidence>]
    """
    def make_row(l):
        # Passed in links are expected to follow this format:
        # [<connector-id>, <relation-id>, <confidence>]
        if 3 != len(l):
            raise ValueError("Invalid link information provided")
        connector_id, relation_id, confidence = l[0], l[1], l[2]
        return (user_id, project_id, relation_id, treenode_id, connector_id,
                skeleton_id, confidence)

    new_link_rows = [make_row(l) for l in links]
    new_link_data = [x for e in new_link_rows for x in e]
    cursor = cursor or connection.cursor()
    link_template = ",".join(("({})".format(",".join(("%s",) * 7)),) * len(links))

    cursor.execute("""
        INSERT INTO treenode_connector (user_id, project_id, relation_id,
                    treenode_id, connector_id, skeleton_id, confidence)
        VALUES {}
        RETURNING id, edition_time
        """.format(link_template), new_link_data)

    return cursor.fetchall()

def create_treenode_links(project_id, user_id, connector_id, links, cursor=None):
    """Create new connector links for the passed in treenode. What relation and
    confidence is used to which connector is specified in the "links"
    paremteter. A list of three-element lists, following the following format:
    [<treenode-id>, <relation-id>, <confidence>]
    """
    def make_row(l) -> Tuple:
        # Passed in links are expected to follow this format:
        # [<connector-id>, <relation-id>, <confidence>]
        if 3 != len(l):
            raise ValueError("Invalid link information provided")
        treenode_id, relation_id, confidence = l[0], l[1], l[2]
        return (user_id, project_id, relation_id, treenode_id, connector_id, confidence)

    new_link_rows = [make_row(l) for l in links]
    new_link_data = [x for e in new_link_rows for x in e]
    cursor = cursor or connection.cursor()
    link_template = ",".join(("({})".format(",".join(("%s",) * 6)),) * len(links))

    cursor.execute("""
        INSERT INTO treenode_connector (user_id, project_id, relation_id,
                    treenode_id, connector_id, skeleton_id, confidence)
        SELECT v.user_id, v.project_id, v.relation_id, v.treenode_id, v.connector_id,
               t.skeleton_id, v.confidence
        FROM (VALUES {}) v(user_id, project_id, relation_id, treenode_id, connector_id,
                confidence)
        INNER JOIN treenode t ON v.treenode_id = t.id
        RETURNING id, edition_time, treenode_id, relation_id
        """.format(link_template), new_link_data)

    return cursor.fetchall()
