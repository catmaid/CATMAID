import json

from collections import defaultdict
from django.db import transaction, connection
from django.http import HttpResponse, Http404
from django.db.models import Count
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def labels_all(request, project_id=None):
    qs = ClassInstance.objects.filter(
        class_column__class_name='label',
        project=project_id)
    return HttpResponse(json.dumps(list(x.name for x in qs)), mimetype="text/plain")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def labels_for_node(request, project_id=None, ntype=None, location_id=None):
    if ntype == 'treenode':
        qs = TreenodeClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            class_instance__class_column__class_name='label',
            treenode=location_id,
            project=project_id).select_related('class_instance__name')
    elif ntype == 'location' or ntype == 'connector':
        qs = ConnectorClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            class_instance__class_column__class_name='label',
            connector=location_id,
            project=project_id).select_related('class_instance__name')
    else:
        raise Http404('Unknown node type: "%s"' % (ntype,))
    return HttpResponse(json.dumps(list(x.class_instance.name for x in qs)), mimetype="text/plain")

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def labels_for_nodes(request, project_id=None):
    # Two POST variables, which are each an array of integers stringed together with commas as separators
    treenode_ids = (int(x) for x in request.POST['treenode_ids'].split(','))
    connector_ids = (int(x) for x in request.POST['connector_ids'].split(','))

    qs_treenodes = TreenodeClassInstance.objects.filter(
        relation__relation_name='labeled_as',
        class_instance__class_column__class_name='label',
        treenode__id__in=treenode_ids,
        project=project_id).select_related('treenode', 'class_instance')

    qs_connectors = ConnectorClassInstance.objects.filter(
        relation__relation_name='labeled_as',
        class_instance__class_column__class_name='label',
        connector__id__in=connector_ids,
        project=project_id).select_related('connector', 'class_instance')

    result = defaultdict(list)

    for tci in qs_treenodes:
        result[tci.treenode.id].append(tci.class_instance.name)

    for cci in qs_connectors:
        result[cci.connector.id].append(cci.class_instance.name)

    return HttpResponse(json.dumps(result), mimetype="text/plain")

@requires_user_role(UserRole.Annotate)
@transaction.commit_on_success
def label_update(request, project_id=None, location_id=None, ntype=None):
    labeled_as_relation = Relation.objects.get(project=project_id, relation_name='labeled_as')
    p = get_object_or_404(Project, pk=project_id)
    
    newTags = request.POST['tags'].split(',')
    
    # Get the existing list of tags for the tree node/connector and delete any that are not in the new list.
    if ntype == 'treenode':
        existingLabels = TreenodeClassInstance.objects.filter(
            treenode__id=location_id,
            relation=labeled_as_relation,
            class_instance__class_column__class_name='label').select_related('class_instance__name')
        TreenodeClassInstance.objects.for_user(request.user).filter(
            treenode__id=location_id,
            relation=labeled_as_relation,
            class_instance__class_column__class_name='label').exclude(class_instance__name__in=newTags).delete()
    elif ntype == 'connector' or ntype == 'location':
        existingLabels = ConnectorClassInstance.objects.filter(
            connector__id=location_id,
            relation=labeled_as_relation,
            class_instance__class_column__class_name='label').select_related('class_instance__name')
        ConnectorClassInstance.objects.for_user(request.user).filter(
            connector__id=location_id,
            relation=labeled_as_relation,
            class_instance__class_column__class_name='label').exclude(class_instance__name__in=newTags).delete()
    else:
        raise Http404('Unknown node type: "%s"' % (ntype,))

    existingNames = set(ele.class_instance.name for ele in existingLabels)

    # Add any new labels.
    label_class = Class.objects.get(project=project_id, class_name='label')
    for tag_name in newTags:
        if len(tag_name) > 0 and tag_name not in existingNames:
            # Make sure the tag instance exists.
            existing_tags = list(ClassInstance.objects.filter(
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
            
            # Add the tag to the tree node/connector.
            if ntype == 'treenode':
                tci = TreenodeClassInstance(
                    user=request.user,
                    project=p,
                    relation=labeled_as_relation,
                    treenode=Treenode(id=location_id),
                    class_instance=tag)
            else:
                tci = ConnectorClassInstance(
                    user=request.user,
                    project=p,
                    relation=labeled_as_relation,
                    connector=Connector(id=location_id),
                    class_instance=tag)
            tci.save()
    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')
