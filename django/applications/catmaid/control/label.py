import json

from collections import defaultdict
from django.db import transaction, connection
from django.http import HttpResponse, Http404
from django.db.models import Count
from django.shortcuts import get_object_or_404

from catmaid.models import Project, Stack, Class, ClassInstance,\
    TreenodeClassInstance, ConnectorClassInstance, Relation, Treenode,\
    Connector, User, Textlabel

from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *


@catmaid_login_required
def labels_all(request, project_id=None, logged_in_user=None):
    qs = ClassInstance.objects.filter(
        class_column__class_name='label',
        project=project_id)
    return HttpResponse(json.dumps(list(x.name for x in qs)), mimetype="text/plain")

@catmaid_login_required
def labels_for_node(request, project_id=None, ntype=None, location_id=None, logged_in_user=None):
    if ntype == 'treenode':
        qs = TreenodeClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            class_instance__class_column__class_name='label',
            treenode=location_id,
            project=project_id).select_related('class_instance')
    elif ntype == 'location' or ntype == 'connector':
        qs = ConnectorClassInstance.objects.filter(
            relation__relation_name='labeled_as',
            class_instance__class_column__class_name='label',
            connector=location_id,
            project=project_id).select_related('class_instance')
    else:
        raise Http404('Unknown node type: "%s"' % (ntype,))
    return HttpResponse(json.dumps(list(x.class_instance.name for x in qs)), mimetype="text/plain")

@catmaid_login_required
def labels_for_nodes(request, project_id=None, logged_in_user=None):
    nodes = [int(x, 10) for x in json.loads(request.POST['nods']).keys()]

    qs_treenodes = TreenodeClassInstance.objects.filter(
        relation__relation_name='labeled_as',
        class_instance__class_column__class_name='label',
        treenode__id__in=nodes,
        project=project_id).select_related('treenode', 'class_instance')

    qs_connectors = ConnectorClassInstance.objects.filter(
        relation__relation_name='labeled_as',
        class_instance__class_column__class_name='label',
        connector__id__in=nodes,
        project=project_id).select_related('connector', 'class_instance')

    result = defaultdict(list)

    for tci in qs_treenodes:
        result[tci.treenode.id].append(tci.class_instance.name)

    for cci in qs_connectors:
        result[cci.connector.id].append(cci.class_instance.name)

    return HttpResponse(json.dumps(result), mimetype="text/plain")

@catmaid_can_edit_project
@transaction.commit_on_success
def label_update(request, project_id=None, location_id=None, ntype=None, logged_in_user=None):
    labeled_as_relation = Relation.objects.get(project=project_id, relation_name='labeled_as')
    p = get_object_or_404(Project, pk=project_id)
    if ntype == 'treenode':
        TreenodeClassInstance.objects.filter(
            treenode__id=location_id,
            relation=labeled_as_relation,
            class_instance__class_column__class_name='label').delete()
    elif ntype == 'connector' or ntype == 'location':
        ConnectorClassInstance.objects.filter(
            connector__id=location_id,
            relation=labeled_as_relation,
            class_instance__class_column__class_name='label').delete()
    else:
        raise Http404('Unknown node type: "%s"' % (ntype,))
    label_class = Class.objects.get(project=project_id, class_name='label')
    for tag_name in json.loads(request.POST['tags']):
        existing_tags = list(ClassInstance.objects.filter(
            project=p,
            name=tag_name,
            class_column=label_class))
        if len(existing_tags) < 1:
            tag = ClassInstance(
                project=p,
                name=tag_name,
                user=logged_in_user,
                class_column=label_class)
            tag.save()
        else:
            tag = existing_tags[0]
        if ntype == 'treenode':
            tci = TreenodeClassInstance(
                user=logged_in_user,
                project=p,
                relation=labeled_as_relation,
                treenode=Treenode(id=location_id),
                class_instance=tag)
        else:
            tci = ConnectorClassInstance(
                user=logged_in_user,
                project=p,
                relation=labeled_as_relation,
                connector=Connector(id=location_id),
                class_instance=tag)
        tci.save()
    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')
