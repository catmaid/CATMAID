import json, sys

from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *


@requires_user_role([UserRole.Browse])
def query_neurons_by_annotations(request, project_id = None):
    p = get_object_or_404(Project, pk = project_id)
    
    neurons = ClassInstance.objects.filter(project = p, 
                                           class_column__class_name = 'neuron')
    #print >> sys.stderr, 'Starting with ' + str(len(neurons)) + ' neurons.'
    for key in request.POST:
        if key.startswith('neuron_query_by_annotation'):
            tag = request.POST[key].strip()
            if len(tag) > 0:
                neurons = neurons.filter(cici_via_b__relation__relation_name = 'annotated_with',
                                         cici_via_b__class_instance_a__name = tag)
                #print >> sys.stderr, str(len(neurons)) + ' after adding '  + request.POST[key] + '.'
        elif key == 'neuron_query_by_annotator':
            userID = int(request.POST[key])
            if userID >= 0:
                neurons = neurons.filter(cici_via_b__relation__relation_name = 'annotated_with',
                                         cici_via_b__user = userID)
                #print >> sys.stderr, str(len(neurons)) + ' after adding user '  + str(userID) + '.'
        elif key == 'neuron_query_by_start_date':
            startDate = request.POST[key].strip()
            if len(startDate) > 0:
                neurons = neurons.filter(cici_via_b__relation__relation_name = 'annotated_with',
                                         cici_via_b__creation_time__gte = startDate)
                #print >> sys.stderr, str(len(neurons)) + ' after adding after '  + startDate + '.'
        elif key == 'neuron_query_by_end_date':
            endDate = request.POST[key].strip()
            if len(endDate) > 0:
                neurons = neurons.filter(cici_via_b__relation__relation_name = 'annotated_with',
                                         cici_via_b__creation_time__lte = endDate)
                #print >> sys.stderr, str(len(neurons)) + ' after adding before '  + endDate + '.'
        else:
            print >> sys.stderr, 'Unused POST arg: ' + key + '(' + request.POST[key] + ')'
            
    dump = [];
    for neuron in neurons:
        skeletons = ClassInstanceClassInstance.objects.filter(
            class_instance_b = neuron,
            relation__relation_name = 'model_of')
        skeleton = skeletons[0].class_instance_a
        tn = Treenode.objects.get(
            project=project_id,
            parent__isnull=True,
            skeleton_id=skeleton.id)
        dump += [{'id': neuron.id, 'name': neuron.name, 'skeleton_id': skeleton.id, 'root_node': tn.id}]
        # TODO: include node count, review percentage, etc.
    return HttpResponse(json.dumps(dump))


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def annotate_neurons(request, project_id = None):
    p = get_object_or_404(Project, pk = project_id)
    r = Relation.objects.get(relation_name = 'annotated_with')
    
    annotations = request.POST.getlist('annotations[]', [])
    neuron_ids = [int(n) for n in request.POST.getlist('neuron_ids[]', [])]
    skeleton_ids = [int(s) for s in request.POST.getlist('skeleton_ids[]', [])]
    
#     print >> sys.stderr, 'Annotations: ' + str(annotations)
#     print >> sys.stderr, 'Neuron IDs: ' + str(neuron_ids)
#     print >> sys.stderr, 'Skeleton IDs: ' + str(skeleton_ids)
    
    # TODO: make neurons a set in case neuron IDs and skeleton IDs overlap?
    neurons = []
    if any(neuron_ids):
        neurons += ClassInstance.objects.filter(project = p, 
                                                class_column__class_name = 'neuron', 
                                                id__in = neuron_ids)
    if any(skeleton_ids):
        neurons += ClassInstance.objects.filter(project = p,
                                                class_column__class_name = 'neuron', 
                                                cici_via_b__relation__relation_name = 'model_of',
                                                cici_via_b__class_instance_a__in = skeleton_ids)
    
    for annotation in annotations:
        # Make sure the annotation's class instance exists.
        ci, created = ClassInstance.objects.get_or_create(project = p, 
                                                          name = annotation,
                                                          class_column__class_name = 'annotation',
                                                          defaults = {'user': request.user});
        # Annotate each of the neurons.
        # Avoid duplicates for the current user, but it's OK for multiple users to annotate with the same instance.
        for neuron in neurons:
            print >> sys.stderr, 'Annotating neuron ' + str(neuron) + ' with ' + str(ci) + ''
            cici, created = ClassInstanceClassInstance.objects.get_or_create(project = p,
                                                                             relation = r,
                                                                             class_instance_a = ci,
                                                                             class_instance_b = neuron,
                                                                             user = request.user);
            cici.save() # update the last edited time
    
    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')
