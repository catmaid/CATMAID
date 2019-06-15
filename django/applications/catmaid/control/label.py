# -*- coding: utf-8 -*-


from collections import defaultdict
import json
from typing import Any, DefaultDict, List, Optional, Union

from django.db import connection
from django.http import HttpRequest, Http404, JsonResponse, HttpResponse
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view

from catmaid.models import Project, Class, ClassInstance, Relation, Connector, \
        ConnectorClassInstance, UserRole, Treenode, TreenodeClassInstance, \
        ChangeRequest
from catmaid.control.authentication import (requires_user_role, can_edit_or_fail,
        PermissionError)
from catmaid.control.common import get_request_bool
from catmaid.fields import Double3D


SKELETON_LABEL_CARDINALITY = {
    'soma': 1,
}
"""
The maximum number of relationships specific labels should have with nodes of a
single skeleton. This is only used to generate warnings, not enforced.
"""


def get_link_model(node_type:str) -> Union[ConnectorClassInstance, TreenodeClassInstance]:
    """ Return the model class that represents the a label link for nodes of
    the given node type.
    """
    if node_type == 'treenode':
        return TreenodeClassInstance
    elif node_type == 'connector':
        return ConnectorClassInstance
    else:
        raise Exception('Unknown node type: "%s"', node_type)

@requires_user_role(UserRole.Annotate)
def label_remove(request:HttpRequest, project_id=None) -> JsonResponse:
    label_id = int(request.POST['label_id'])
    if request.user.is_superuser:
        try:
            label = ClassInstance.objects.get(id=label_id,
                                              class_column__class_name='label')
        except ClassInstance.DoesNotExist:
            raise ValueError("Could not find label with ID %s" % label_id)

        is_referenced = TreenodeClassInstance.objects.filter(
            class_instance_id=label_id).exists()
        if is_referenced:
            raise ValueError("Only unreferenced labels are allowed to be removed")
        else:
            label.delete()
            return JsonResponse({
                'deleted_labels': [label_id],
                'message': 'success'
            })

    raise PermissionError('Only super users can delete unreferenced labels')

@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def labels_all(request:HttpRequest, project_id=None) -> JsonResponse:
    """List all labels (front-end node *tags*) in use.

    ---
    parameters:
    - name: project_id
      description: Project containing node of interest
      required: true
    type:
    - type: array
      items:
        type: string
      description: Labels used in this project
      required: true
    """
    cursor = connection.cursor()
    cursor.execute("""
        SELECT COALESCE(json_agg(name ORDER BY name), '[]'::json)::text
        FROM class_instance
        WHERE project_id = %(project_id)s
        AND class_id = (
            SELECT id
            FROM class
            WHERE class_name = 'label'
            AND project_id = %(project_id)s
        )
    """, {
        'project_id': project_id,
    })
    return HttpResponse(cursor.fetchone()[0], content_type='text/json')

@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def labels_all_detail(request:HttpRequest, project_id=None) -> JsonResponse:
    """List all labels (front-end node *tags*) in use alongside their IDs.
    ---
    parameters:
    - name: project_id
      description: Project containing node of interest
      required: true
    type:
    - type: array
      items:
        type: string
      description: Labels used in this project
      required: true
    """
    cursor = connection.cursor()
    cursor.execute("""
        SELECT COALESCE(json_agg(json_build_object('id', id, 'name', name) ORDER BY name), '[]'::json)::text
        FROM class_instance
        WHERE project_id = %(project_id)s
        AND class_id = (
            SELECT id
            FROM class
            WHERE class_name = 'label'
            AND project_id = %(project_id)s
        )
    """, {
        'project_id': project_id,
    })
    return HttpResponse(cursor.fetchone()[0], content_type='text/json')

@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def get_label_stats(request:HttpRequest, project_id=None) -> JsonResponse:
    """Get usage statistics of node labels.

    ---
    parameters:
    - name: project_id
      description: Project from which to get label stats
      required: true
    type:
    - type: array
      items:
        type: array
        items:
          type: string
          description: [labelID, labelName, skeletonID, treenodeID]
      description: Labels used in this project
      required: true
    """
    labeled_as_relation = Relation.objects.get(project=project_id, relation_name='labeled_as')

    cursor = connection.cursor()
    cursor.execute("""
        SELECT ci.id, ci.name, t.skeleton_id, t.id
          FROM class_instance ci
          JOIN treenode_class_instance tci
            ON tci.class_instance_id = ci.id
          JOIN treenode t
            ON tci.treenode_id = t.id
          WHERE ci.project_id = %s
            AND tci.relation_id = %s;
    """, [project_id, labeled_as_relation.id])

    return JsonResponse(cursor.fetchall(), safe=False)

@api_view(['GET'])
@requires_user_role(UserRole.Browse)
def labels_for_node(request:HttpRequest, project_id=None, node_type:Optional[str]=None, node_id=None) -> JsonResponse:
    """List all labels (front-end node *tags*) attached to a particular node.

    ---
    parameters:
    - name: project_id
      description: Project containing node of interest
      required: true
    - name: node_type
      description: Either 'connector', 'treenode' or 'location'
      required: true
    - name: node_id
      description: ID of node to list labels for
      required: true
    type:
    - type: array
      items:
        type: string
      description: Labels used on a particular node
      required: true
    """
    if node_type == 'treenode':
        qs = TreenodeClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            class_instance__class_column__class_name='label',
            treenode=node_id,
            project=project_id).select_related('class_instance')
    elif node_type == 'location' or node_type == 'connector':
        qs = ConnectorClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            class_instance__class_column__class_name='label',
            connector=node_id,
            project=project_id).select_related('class_instance')
    else:
        raise Http404('Unknown node type: "%s"' % (node_type,))

    return JsonResponse([l.class_instance.name for l in qs], safe=False)

@requires_user_role(UserRole.Browse)
def labels_for_nodes(request:HttpRequest, project_id=None) -> JsonResponse:
    # Two POST variables, which are each an array of integers stringed together
    # with commas as separators
    treenode_ids = request.POST.get('treenode_ids', '').strip()
    connector_ids = request.POST.get('connector_ids', '').strip()
    result = defaultdict(list) # type: DefaultDict[Any, List]
    cursor = connection.cursor()

    if treenode_ids:
        # Could use treenode_ids directly as a string, but it is good to sanitize arguments
        cursor.execute('''
        SELECT treenode.id, class_instance.name
        FROM treenode, class_instance, treenode_class_instance, relation
        WHERE relation.id = treenode_class_instance.relation_id
          AND relation.relation_name = 'labeled_as'
          AND treenode_class_instance.treenode_id = treenode.id
          AND class_instance.id = treenode_class_instance.class_instance_id
          AND treenode.id IN (%s)
        ''' % ','.join(str(int(x)) for x in treenode_ids.split(','))) # convoluted to sanitize

        for row in cursor.fetchall():
            result[row[0]].append(row[1])

    if connector_ids:
        cursor.execute('''
        SELECT connector.id, class_instance.name
        FROM connector, class_instance, connector_class_instance, relation
        WHERE relation.id = connector_class_instance.relation_id
          AND relation.relation_name = 'labeled_as'
          AND connector_class_instance.connector_id = connector.id
          AND class_instance.id = connector_class_instance.class_instance_id
          AND connector.id IN (%s)
        ''' % ','.join(str(int(x)) for x in connector_ids.split(','))) # convoluted to sanitize
        for row in cursor.fetchall():
            result[row[0]].append(row[1])

    return JsonResponse(result)

@requires_user_role(UserRole.Annotate)
def label_update(request:HttpRequest, project_id, location_id, ntype:str) -> JsonResponse:
    """ location_id is the ID of a treenode or connector.
        ntype is either 'treenode' or 'connector'. """
    labeled_as_relation = Relation.objects.get(project=project_id, relation_name='labeled_as')
    p = get_object_or_404(Project, pk=project_id)

    # TODO will FAIL when a tag contains a comma by itself
    new_tags = request.POST['tags'].split(',')
    delete_existing_labels = get_request_bool(request.POST, 'delete_existing', True)

    kwargs = {'relation': labeled_as_relation,
              'class_instance__class_column__class_name': 'label'}

    table = get_link_model(ntype)
    if 'treenode' == ntype:
        kwargs['treenode__id'] = location_id
        node = Treenode.objects.get(id=location_id)
    elif 'connector' == ntype:
        kwargs['connector__id'] = location_id
        node = Connector.objects.get(id=location_id)

    if not table:
        raise Http404('Unknown node type: "%s"' % (ntype,))

    # Get the existing list of tags for the tree node/connector and delete any
    # that are not in the new list.
    existing_labels = table.objects.filter(**kwargs).select_related('class_instance')
    existing_names = set(ele.class_instance.name for ele in existing_labels)
    duplicate_labels = table.objects.filter(**kwargs).exclude(class_instance__name__in=new_tags).select_related('class_instance')

    other_labels = []
    deleted_labels = []
    if delete_existing_labels:
        # Iterate over all labels that should get deleted to check permission
        # on each one. Remember each label that couldn't be deleted in the
        # other_labels array.
        for l in duplicate_labels:
            try:
                can_edit_or_fail(request.user, l.id, table._meta.db_table)
                if remove_label(l.id, ntype):
                    deleted_labels.append(l)
                else:
                    other_labels.append(l)
            except:
                other_labels.append(l)

        # Create change requests for labels associated to the treenode by other users
        for label in other_labels:
            change_request_params = {
                'type': 'Remove Tag',
                'project': p,
                'user': request.user,
                'recipient': node.user,
                'location': Double3D(node.location_x, node.location_y, node.location_z),
                ntype: node,
                'description': "Remove tag '%s'" % label.class_instance.name,
                'validate_action': 'from catmaid.control.label import label_exists\n' +
                                   'is_valid = label_exists(%s, "%s")' % (str(label.id), ntype),
                'approve_action': 'from catmaid.control.label import remove_label\n' +
                                  'remove_label(%s, "%s")' % (str(label.id), ntype)
            }
            ChangeRequest(**change_request_params).save()

    # Add any new labels.
    label_class = Class.objects.get(project=project_id, class_name='label')
    kwargs = {'user': request.user,
              'project': p,
              'relation': labeled_as_relation,
              ntype: node}

    new_labels = []
    for tag_name in new_tags:
        if len(tag_name) > 0 and tag_name not in existing_names:
            # Make sure the tag instance exists
            existing_tags = tuple(ClassInstance.objects.filter(
                project=p,
                name=tag_name,
                class_column=label_class))
            if len(existing_tags) < 1:
                tag = ClassInstance(
                    project=p,
                    name=tag_name,
                    user=request.user,
                    class_column=label_class)
                tag.save()
            else:
                tag = existing_tags[0]

            # Associate the tag with the treenode/connector.
            kwargs['class_instance'] = tag
            tci = table(**kwargs) # creates new TreenodeClassInstance or ConnectorClassInstance
            tci.save()
            new_labels.append(tag_name)

            if node.user != request.user:
                # Inform the owner of the node that the tag was added and give them the option of removing it.
                change_request_params = {
                    'type': 'Add Tag',
                    'description': 'Added tag \'' + tag_name + '\'',
                    'project': p,
                    'user': request.user,
                    'recipient': node.user,
                    'location': Double3D(node.location_x, node.location_y, node.location_z),
                    ntype: node,
                    'validate_action': 'from catmaid.control.label import label_exists\n' +
                                       'is_valid = label_exists(%s, "%s")' % (str(tci.id), ntype),
                    'reject_action': 'from catmaid.control.label import remove_label\n' +
                                     'remove_label(%s, "%s")' % (str(tci.id), ntype)
                }
                ChangeRequest(**change_request_params).save()

    response = {
        'message': 'success',
        'new_labels': new_labels,
        'duplicate_labels': [l.class_instance.name for l in duplicate_labels
                             if l not in deleted_labels],
        'deleted_labels': [l.class_instance.name for l in deleted_labels],
    }

    # Check if any labels on this node violate cardinality restrictions on
    # its skeleton.
    if 'treenode' == ntype:
        limited_labels = {l: SKELETON_LABEL_CARDINALITY[l] for l in new_tags if l in SKELETON_LABEL_CARDINALITY}

        if limited_labels:
            ll_names, ll_maxes = zip(*limited_labels.items())
            cursor = connection.cursor()
            cursor.execute("""
                SELECT
                  ll.name,
                  COUNT(tci.treenode_id),
                  ll.max
                FROM
                  class_instance ci,
                  treenode_class_instance tci,
                  treenode tn,
                  unnest(%s::text[], %s::integer[]) AS ll (name, max)
                WHERE ci.name = ll.name
                  AND ci.project_id = %s
                  AND ci.class_id = %s
                  AND tci.class_instance_id = ci.id
                  AND tci.relation_id = %s
                  AND tn.id = tci.treenode_id
                  AND tn.skeleton_id = %s
                GROUP BY
                  ll.name, ll.max
                HAVING
                  COUNT(tci.treenode_id) > ll.max
            """, (
                list(ll_names),
                list(ll_maxes),
                p.id,
                label_class.id,
                labeled_as_relation.id,
                node.skeleton_id))

            if cursor.rowcount:
                response['warning'] = 'The skeleton has too many of the following tags: ' + \
                    ', '.join('{0} ({1}, max. {2})'.format(*row) for row in cursor.fetchall())

    return JsonResponse(response)


def label_exists(label_id, node_type) -> bool:
    # This checks to see if the exact instance of the tag being applied to a node/connector still exists.
    # If the tag was removed and added again then this will return False.
    table = get_link_model(node_type)
    try:
        label = table.objects.get(pk=label_id)
        return True
    except table.DoesNotExist:
        return False

@requires_user_role(UserRole.Annotate)
def remove_label_link(request:HttpRequest, project_id, ntype:str, location_id) -> JsonResponse:
    label = request.POST.get('tag', None)
    if not label:
        raise ValueError("No label parameter given")

    table = get_link_model(ntype)
    try:
        if 'treenode' == ntype:
            link_id = table.objects.get(treenode_id=location_id, class_instance__name=label).id
        elif 'connector' == ntype:
            link_id = table.objects.get(connector_id=location_id, class_instance__name=label).id
    except TreenodeClassInstance.DoesNotExist:
        raise ValueError("Node %s does not have a label with name \"%s\"." %
                         (location_id, label))
    except ConnectorClassInstance.DoesNotExist:
        raise ValueError("Connector %s does not have a label with name \"%s\"." %
                         (location_id, label))

    if remove_label(link_id, ntype):
        return JsonResponse({
            'deleted_link': link_id,
            'message': 'success'
        })
    else:
        return JsonResponse({
            'error': 'Could not remove label'
        })

def remove_label(label_id, node_type:str) -> bool:
    # This removes an exact instance of a tag being applied to a node/connector, it does not look up the tag by name.
    # If the tag was removed and added again then this will do nothing and the tag will remain.
    table = get_link_model(node_type)

    try:
        label_link = table.objects.get(pk=label_id)
        label = label_link.class_instance
        label_link.delete()
        # Remove class instance for the deleted label if it is no longer linked
        # to any nodes.
        if 0 == label.treenodeclassinstance_set.count() + label.connectorclassinstance_set.count():
            label.delete()

        return True
    except table.DoesNotExist:
        return False
