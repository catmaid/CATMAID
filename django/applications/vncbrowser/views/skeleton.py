from collections import defaultdict
from django.db import transaction, connection
from django.http import HttpResponse, Http404
from django.db.models import Count
from django.shortcuts import get_object_or_404
from vncbrowser.models import Project, Stack, Class, ClassInstance,\
    TreenodeClassInstance, ConnectorClassInstance, Relation, Treenode,\
    Connector, User, Textlabel, ClassInstanceClassInstance, TreenodeConnector
from vncbrowser.views import catmaid_can_edit_project, catmaid_login_optional,\
    catmaid_login_required

import json
import sys
try:
    import networkx as nx
except:
    pass

@catmaid_login_required
@transaction.commit_on_success
def split_skeleton(request, project_id=None, logged_in_user=None):
    treenode_id = request.POST['tnid']
    p = get_object_or_404(Project, pk=project_id)
    # retrieve skeleton
    ci = ClassInstance.objects.get(
        project=project_id,
        class_column__class_name='skeleton',
        treenodeclassinstance__relation__relation_name='element_of',
        treenodeclassinstance__treenode__id=treenode_id)
    skeleton_id = ci.id
    # retrieve neuron id of this skeleton
    sk = get_object_or_404(ClassInstance, pk=skeleton_id, project=project_id)
    neuron = ClassInstance.objects.filter(
        project=p,
        cici_via_b__relation__relation_name='model_of',
        cici_via_b__class_instance_a=sk)
    # retrieve all nodes of the skeleton
    treenode_qs = Treenode.objects.filter(
        treenodeclassinstance__class_instance__id=skeleton_id,
        treenodeclassinstance__relation__relation_name='element_of',
        treenodeclassinstance__class_instance__class_column__class_name='skeleton',
        project=project_id).order_by('id')
    # build the networkx graph from it
    graph = nx.DiGraph()
    for e in treenode_qs:
        graph.add_node( e.id )
        if e.parent_id:
            graph.add_edge( e.parent_id, e.id )
    # find downstream nodes starting from target treenode_id
    # generate id list from it
    change_list = nx.bfs_tree(graph, int(treenode_id)).nodes()
    # create a new skeleton
    new_skeleton = ClassInstance()
    new_skeleton.name = 'Skeleton'
    new_skeleton.project = p
    new_skeleton.user = logged_in_user
    new_skeleton.class_column = Class.objects.get(class_name='skeleton', project=p)
    new_skeleton.save()
    new_skeleton.name = 'Skeleton {0}'.format( new_skeleton.id )
    new_skeleton.save()
    r = Relation.objects.get(relation_name='model_of', project=p)
    cici = ClassInstanceClassInstance()
    cici.class_instance_a = new_skeleton
    cici.class_instance_b = neuron[0]
    cici.relation = r
    cici.user = logged_in_user
    cici.project = p
    cici.save()
    # update skeleton_id of list in treenode table
    tns = Treenode.objects.filter(
        id__in=change_list,
        project=project_id).update(skeleton=new_skeleton)
    # update treenodeclassinstance element_of relation
    tci = TreenodeClassInstance.objects.filter(
        relation__relation_name='element_of',
        treenode__id__in=change_list,
        project=project_id).update(class_instance=new_skeleton)
    # setting parent of target treenode to null
    tc = TreenodeConnector.objects.filter(
        project=project_id,
        relation__relation_name__endswith = 'synaptic_to',
        treenode__in=change_list,
    ).update(skeleton=new_skeleton)
    Treenode.objects.filter(
        id=treenode_id,
        project=project_id).update(parent=None)
    return HttpResponse(json.dumps({}), mimetype='text/json')