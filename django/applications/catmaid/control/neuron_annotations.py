import json, sys
from string import upper

from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *


def create_basic_annotated_neuron_query(project, params):
    neurons = ClassInstance.objects.filter(project = project,
                                           class_column__class_name = 'neuron')
    for key in params:
        if key.startswith('neuron_query_by_annotation'):
            tag = params[key].strip()
            if len(tag) > 0:
                neurons = neurons.filter(cici_via_a__relation__relation_name = 'annotated_with',
                                         cici_via_a__class_instance_b__name = tag)
        elif key == 'neuron_query_by_annotator':
            userID = int(params[key])
            if userID >= 0:
                neurons = neurons.filter(cici_via_a__relation__relation_name = 'annotated_with',
                                         cici_via_a__user = userID)
        elif key == 'neuron_query_by_start_date':
            startDate = params[key].strip()
            if len(startDate) > 0:
                neurons = neurons.filter(cici_via_a__relation__relation_name = 'annotated_with',
                                         cici_via_a__creation_time__gte = startDate)
        elif key == 'neuron_query_by_end_date':
            endDate = params[key].strip()
            if len(endDate) > 0:
                neurons = neurons.filter(cici_via_a__relation__relation_name = 'annotated_with',
                                         cici_via_a__creation_time__lte = endDate)

    return neurons

def create_annotated_neuron_list(project, neurons):
    annotated_neurons = [];
    for neuron in neurons:
        try:
            cici_skeleton = ClassInstanceClassInstance.objects.get(
                class_instance_b = neuron,
                relation__relation_name = 'model_of')
            skeleton = cici_skeleton.class_instance_a
            tn = Treenode.objects.get(
                project=project,
                parent__isnull=True,
                skeleton_id=skeleton.id)
            # Get all annotations linked to this neuron
            # TODO: Try to get rid of joins, because of performance hit
            annotation_cis = ClassInstance.objects.filter(
                cici_via_b__relation__relation_name = 'annotated_with',
                cici_via_b__class_instance_a__id = neuron.id)
            annotations = [{'id': a.id, 'name': a.name} for a in annotation_cis]

            neuron_info = {
                'id': neuron.id,
                'name': neuron.name,
                'skeleton_id': skeleton.id,
                'root_node': tn.id,
                'annotations': annotations,
            }

            # TODO: include node count, review percentage, etc.
            annotated_neurons += [neuron_info]
        except ClassInstanceClassInstance.DoesNotExist:
            pass

    return annotated_neurons

@requires_user_role([UserRole.Browse])
def query_neurons_by_annotations(request, project_id = None):
    p = get_object_or_404(Project, pk = project_id)

    neuron_query = create_basic_annotated_neuron_query(p, request.POST)
    neuron_query = neuron_query.order_by('id').distinct()
    dump = create_annotated_neuron_list(p, neuron_query)

    return HttpResponse(json.dumps(dump))

@requires_user_role([UserRole.Browse])
def query_neurons_by_annotations_datatable(request, project_id=None):
    p = get_object_or_404(Project, pk = project_id)
    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', -1))
    if display_length < 0:
        display_length = 2000  # Default number of result rows

    should_sort = request.POST.get('iSortCol_0', False)

    neuron_query = create_basic_annotated_neuron_query(p, request.POST)

    if should_sort:
        column_count = int(request.POST.get('iSortingCols', 0))
        sorting_directions = [request.POST.get('sSortDir_%d' % d, 'DESC')
                for d in range(column_count)]
        sorting_directions = map(lambda d: '-' if upper(d) == 'DESC' else '',
                sorting_directions)

        fields = ['name', 'first_name', 'last_name']
        sorting_index = [int(request.POST.get('iSortCol_%d' % d))
                for d in range(column_count)]
        sorting_cols = map(lambda i: fields[i], sorting_index)

        neuron_query = neuron_query.extra(order_by=[di + col for (di, col) in zip(
                sorting_directions, sorting_cols)])

    result = list(neuron_query[display_start:display_start + display_length])

    response = {'iTotalRecords': len(result),
            'iTotalDisplayRecords': len(result), 'aaData': []}

    neurons = create_annotated_neuron_list(p, result)
    for neuron in neurons:
        response['aaData'] += [[
            neuron['name'],
            neuron['annotations'],
            neuron['skeleton_id'],
            neuron['root_node'],
            neuron['id'],
        ]]

    return HttpResponse(json.dumps(response), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def annotate_neurons(request, project_id = None):
    p = get_object_or_404(Project, pk = project_id)
    r = Relation.objects.get(project_id = project_id,
            relation_name = 'annotated_with')

    annotations = [v for k,v in request.POST.iteritems()
            if k.startswith('annotations[')]
    neuron_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('neuron_ids[')]
    skeleton_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('skeleton_ids[')]
    
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
    
    annotation_class = Class.objects.get(project = p,
                                         class_name = 'annotation')
    for annotation in annotations:
        # Make sure the annotation's class instance exists.
        ci, created = ClassInstance.objects.get_or_create(project = p, 
                                                          name = annotation,
                                                          class_column = annotation_class,
                                                          defaults = {'user': request.user});
        # Annotate each of the neurons. Avoid duplicates for the current user,
        # but it's OK for multiple users to annotate with the same instance.
        for neuron in neurons:
            cici, created = ClassInstanceClassInstance.objects.get_or_create(project = p,
                                                                             relation = r,
                                                                             class_instance_a = neuron,
                                                                             class_instance_b = ci,
                                                                             user = request.user);
            cici.save() # update the last edited time
    
    return HttpResponse(json.dumps({'message': 'success'}), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_annotation(request, project_id=None, neuron_id=None,
        annotation_id=None):
    """ Removes an annotation from a neuron.
    """
    p = get_object_or_404(Project, pk=project_id)

    # Get CICI instance representing the link
    cici_n_a = ClassInstanceClassInstance.objects.get(project=p,
            class_instance_a__id=neuron_id, class_instance_b__id=annotation_id)
    # Make sure the current user has permissions to remove the annotation
    can_edit_or_fail(request.user, cici_n_a.id, 'class_instance_class_instance')
    # Remove link between neuron and annotation.
    cici_n_a.delete()

    message = "Removed annotation from neuron."

    # Remove the annotation class instance, regardless of the owner, if there
    # are no more links to it
    annotation_links = ClassInstanceClassInstance.objects.filter(project=p,
            class_instance_b__id=annotation_id)
    num_annotation_links = annotation_links.count()
    if num_annotation_links == 0:
        ClassInstance.objects.get(pk=annotation_id).delete()
        message += " Also removed annotation instance, because it isn't used " \
                "anywhere else."
    else:
        message += " There are %s links left to this annotation." \
                % num_annotation_links

    return HttpResponse(json.dumps({'message': message}), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_annotations(request, project_id=None):
    ignored_annotations = [v for k,v in request.POST.iteritems()
            if k.startswith('ignored_annotations[')]
    annotations = ClassInstance.objects.filter(project_id=project_id,
            class_column__class_name='annotation').exclude(
                    name__in=ignored_annotations)

    annotation_names = [a.name for a in annotations]

    return HttpResponse(json.dumps(annotation_names), mimetype="text/json")

@requires_user_role([UserRole.Browse])
def list_annotations_datatable(request, project_id=None):
    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', -1))
    if display_length < 0:
        display_length = 2000  # Default number of result rows

    should_sort = request.POST.get('iSortCol_0', False)

    annotation_query = ClassInstance.objects.filter(project_id=project_id,
            class_column__class_name='annotation')

    if should_sort:
        column_count = int(request.POST.get('iSortingCols', 0))
        sorting_directions = [request.POST.get('sSortDir_%d' % d, 'DESC')
                for d in range(column_count)]
        sorting_directions = map(lambda d: '-' if upper(d) == 'DESC' else '',
                sorting_directions)

        fields = ['name']
        sorting_index = [int(request.POST.get('iSortCol_%d' % d))
                for d in range(column_count)]
        sorting_cols = map(lambda i: fields[i], sorting_index)

        annotation_query = annotation_query.extra(order_by=[di + col for (di, col) in zip(
                sorting_directions, sorting_cols)])

    result = list(annotation_query[display_start:display_start + display_length])

    response = {'iTotalRecords': len(result),
            'iTotalDisplayRecords': len(result), 'aaData': []}
    for annotation in result:
        response['aaData'] += [[
            annotation.name,
        ]]

    return HttpResponse(json.dumps(response), mimetype='text/json')
