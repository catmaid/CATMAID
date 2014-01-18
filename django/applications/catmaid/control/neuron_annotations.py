import json, sys
from string import upper

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Count, Max

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *


def create_basic_annotated_entity_query(project, params,
        allowed_classes=['neuron', 'annotation']):
    # Get IDs of constraining classes. Getting this ID in a separate query is
    # usually cheaper than joining the class table based on the allowed names.
    allowed_class_ids = Class.objects.filter(project_id=project.id,
            class_name__in=allowed_classes).values_list('id', flat=True)
    # Let the default unrestricted result set contain all instances of
    # the given set of allowed classes
    entities = ClassInstance.objects.filter(project = project,
            class_column__id__in = allowed_class_ids)

    # TODO don't loop, instead, put the keys in a set and try each
    for key in params:
        if key.startswith('neuron_query_by_name'):
            name = params[key].strip()
            if len(name):
                entities = entities.filter(name__regex=name)
        if key.startswith('neuron_query_by_annotation'):
            tag = params[key].strip()
            if len(tag) > 0:
                entities = entities.filter(
                        cici_via_a__relation__relation_name = 'annotated_with',
                        cici_via_a__class_instance_b__name = tag)
        elif key == 'neuron_query_by_annotator':
            userID = int(params[key])
            if userID >= 0:
                entities = entities.filter(
                        cici_via_a__relation__relation_name = 'annotated_with',
                        cici_via_a__user = userID)
        elif key == 'neuron_query_by_start_date':
            startDate = params[key].strip()
            if len(startDate) > 0:
                entities = entities.filter(
                        cici_via_a__relation__relation_name = 'annotated_with',
                        cici_via_a__creation_time__gte = startDate)
        elif key == 'neuron_query_by_end_date':
            endDate = params[key].strip()
            if len(endDate) > 0:
                entities = entities.filter(
                        cici_via_a__relation__relation_name = 'annotated_with',
                        cici_via_a__creation_time__lte = endDate)

    return entities

def create_annotated_entity_list(project, entities_qs, annotations=True):
    """ Executes the expected class instance queryset in <entities> and expands
    it to aquire more information.
    """
    # Cache class name
    entities = entities_qs.select_related('class_column')
    entity_ids = [e.id for e in entities]

    # Make second query to retrieve annotations and skeletons
    annotations = ClassInstanceClassInstance.objects.filter(
        relation__relation_name = 'annotated_with',
        class_instance_a__id__in = entity_ids).order_by('id').values_list(
                'class_instance_a', 'class_instance_b',
                'class_instance_b__name', 'user__id')

    annotation_dict = {}
    for a in annotations:
        if a[0] not in annotation_dict:
            annotation_dict[a[0]] = []
        annotation_dict[a[0]].append(
          {'id': a[1], 'name': a[2], 'uid': a[3]})

    # Make third query to retrieve all skeletons and root nodes for entities (if
    # they have such).
    skeletons = ClassInstanceClassInstance.objects.filter(
            relation__relation_name = 'model_of',
            class_instance_b__in = entity_ids).order_by('id').values_list(
                'class_instance_a', 'class_instance_b')

    skeleton_dict = {}
    for s in skeletons:
        if s[1] not in skeleton_dict:
            skeleton_dict[s[1]] = []
        skeleton_dict[s[1]].append(s[0])

    annotated_entities = [];
    for e in entities:
        class_name = e.class_column.class_name
        annotations = annotation_dict[e.id] if e.id in annotation_dict else []
        entity_info = {
            'id': e.id,
            'name': e.name,
            'annotations': annotations,
            'type': class_name,
        }

        # Depending on the type of entity, some extra information is added.
        if class_name == 'neuron':
            entity_info['skeleton_ids'] = skeleton_dict[e.id] \
                    if e.id in skeleton_dict else []

        annotated_entities.append(entity_info)

    return annotated_entities

@requires_user_role([UserRole.Browse])
def query_neurons_by_annotations(request, project_id = None):
    p = get_object_or_404(Project, pk = project_id)

    query = create_basic_annotated_entity_query(p, request.POST)
    query = query.order_by('id').distinct()
    dump = create_annotated_entity_list(p, query)

    return HttpResponse(json.dumps(dump))

@requires_user_role([UserRole.Browse])
def query_neurons_by_annotations_datatable(request, project_id=None):
    p = get_object_or_404(Project, pk = project_id)
    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', -1))
    if display_length < 0:
        display_length = 2000  # Default number of result rows

    neuron_query = create_basic_annotated_entity_query(p, request.POST, allowed_classes=['neuron'])

    search_term = request.POST.get('sSearch', '')
    if len(search_term) > 0:
        neuron_query = neuron_query.filter(name__regex=search_term)

    should_sort = request.POST.get('iSortCol_0', False)
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

    # Make sure we get a distinct result (which otherwise might not be the case
    # due to the JOINS that are made).
    neuron_query = neuron_query.distinct()

    # Since it is very likely that there are many neurons, it is more efficient
    # to do two queries: 1. Get total number of neurons 2. Get limited set. The
    # alternative would be to get all neurons for counting and limiting on the
    # Python side. This, however, is too expensive when there are many neurons.
    num_records = neuron_query.count()
    result = list(neuron_query[display_start:display_start + display_length])

    response = {
        'iTotalRecords': num_records,
        'iTotalDisplayRecords': num_records,
        'aaData': []
    }

    entities = create_annotated_entity_list(p, result)
    for entity in entities:
        if entity['type'] == 'neuron':
          response['aaData'] += [[
              entity['name'],
              entity['annotations'],
              entity['skeleton_ids'],
              entity['id'],
          ]]

    return HttpResponse(json.dumps(response), mimetype='text/json')

def _update_neuron_annotations(project_id, user, neuron_id, annotations):
    """ Ensure that the neuron is annotated_with only the annotations given.
    """
    qs = ClassInstanceClassInstance.objects.filter(
            class_instance_a__id=neuron_id,
            relation__relation_name='annotated_with')
    qs = qs.select_related('class_instance_b').values_list(
            'class_instance_b__name', 'class_instance_b__id')

    existing_annotations = dict(qs)

    annotations = set(annotations)
    existing = set(existing_annotations.iterkeys())

    missing = annotations - existing
    _annotate_neurons(project_id, user, [neuron_id], missing)

    to_delete = existing - annotations
    to_delete_ids = tuple(aid for name, aid in existing_annotations.iteritems() \
        if name in to_delete)

    ClassInstanceClassInstance.objects.filter(
            class_instance_b__in=to_delete_ids).delete()


def _annotate_neurons(project_id, user, neuron_ids, annotations):
    r = Relation.objects.get(project_id = project_id,
            relation_name = 'annotated_with')

    annotation_class = Class.objects.get(project_id = project_id,
                                         class_name = 'annotation')
    annotation_objects = []
    for annotation in annotations:
        # Make sure the annotation's class instance exists.
        ci, created = ClassInstance.objects.get_or_create(
                project_id=project_id, name=annotation,
                class_column=annotation_class,
                defaults={'user': user});
        annotation_objects.append(ci)
        # Annotate each of the neurons. Avoid duplicates for the current user,
        # but it's OK for multiple users to annotate with the same instance.
        for neuron_id in neuron_ids:
            cici, created = ClassInstanceClassInstance.objects.get_or_create(
                    project_id=project_id, relation=r,
                    class_instance_a__id=neuron_id,
                    class_instance_a__class_column__class_name='neuron',
                    class_instance_b=ci, user=user,
                    defaults={'class_instance_a_id': neuron_id})
            cici.save() # update the last edited time

    return annotation_objects

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def annotate_neurons(request, project_id = None):
    p = get_object_or_404(Project, pk = project_id)

    annotations = [v for k,v in request.POST.iteritems()
            if k.startswith('annotations[')]
    meta_annotations = [v for k,v in request.POST.iteritems()
            if k.startswith('meta_annotations[')]
    neuron_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('neuron_ids[')]
    skeleton_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('skeleton_ids[')]
    
    if any(skeleton_ids):
        neuron_ids += ClassInstance.objects.filter(project = p,
                class_column__class_name = 'neuron',
                cici_via_b__relation__relation_name = 'model_of',
                cici_via_b__class_instance_a__in = skeleton_ids).values_list(
                        'id', flat=True)

    # Annotate neurons
    annotations = _annotate_neurons(project_id, request.user, neuron_ids,
            annotations)
    # Annotate annotations
    if meta_annotations:
        annotation_ids = [a.id for a in annotations]
        _annotate_neurons(project_id, request.user, annotation_ids,
                meta_annotations)

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
    # Make sure the current user has permissions to remove the annotation.
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

def create_annotation_query(project_id, param_dict):
    annotation_query = ClassInstance.objects.filter(project_id=project_id,
            class_column__class_name='annotation')

    # Meta annotations are annotations that are used to annotate other
    # annotations.
    meta_annotations = [v for k,v in param_dict.iteritems()
            if k.startswith('annotations[')]
    for meta_annotation in meta_annotations:
        annotation_query = annotation_query.filter(
                cici_via_b__relation__relation_name = 'annotated_with',
                cici_via_b__class_instance_a__name = meta_annotation)

    # If information about annotated annotations is found, the current query
    # will include only annotations that are meta annotations for it.
    annotated_annotations = [v for k,v in param_dict.iteritems()
            if k.startswith('annotates[')]
    for sub_annotation in annotated_annotations:
        annotation_query = annotation_query.filter(
                cici_via_a__relation__relation_name = 'annotated_with',
                cici_via_a__class_instance_b__name = sub_annotation)

    # If parallel_annotations is given, only annotations are returned, that
    # are used alongside with these. This also removes the parallel annotations
    # them self from the result set.
    parallel_annotations = [v for k,v in param_dict.iteritems()
            if k.startswith('parallel_annotations[')]
    for p_annotation in parallel_annotations:
        annotation_query = annotation_query.filter(
                cici_via_b__class_instance_a__cici_via_a__relation__relation_name = \
                        'annotated_with',
                cici_via_b__class_instance_a__cici_via_a__class_instance_b__name = \
                        p_annotation)
        annotation_query = annotation_query.exclude(name=p_annotation)

    # Passing in a user ID causes the result set to only contain annotations
    # that are used by the respective user. The query filter could lead to
    # duplicate entries, therefore distinct() is added here.
    user_id = param_dict.get('user_id', None)
    if user_id:
        user_id = int(user_id)
        annotation_query = annotation_query.filter(
                cici_via_b__user__id=user_id).distinct()

    # With the help of the neuron_id field, it is possible to restrict the
    # result set to only show annotations that are used for a particular neuron.
    neuron_id = param_dict.get('neuron_id', None)
    if neuron_id:
        annotation_query = annotation_query.filter(
                cici_via_b__relation__relation_name = 'annotated_with',
                cici_via_b__class_instance_a__id=neuron_id)

    # Instead of a neuron a user can also use to skeleton id to constrain the
    # annotation set returned. This is implicetely a neuron id restriction.
    skeleton_id = param_dict.get('skeleton_id', None)
    if skeleton_id:
        annotation_query = annotation_query.filter(
                cici_via_b__relation__relation_name = 'annotated_with',
                cici_via_b__class_instance_a__cici_via_b__relation__relation_name = 'model_of',
                cici_via_b__class_instance_a__cici_via_b__class_instance_a__id = skeleton_id)

    # If annotations to ignore are passed in, they won't appear in the
    # result set.
    ignored_annotations = [v for k,v in param_dict.iteritems()
            if k.startswith('ignored_annotations[')]
    if ignored_annotations:
        annotation_query = annotation_query.exclude(
                name__in=ignored_annotations)

    return annotation_query

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_annotations(request, project_id=None):
    """ Creates a list of objects containing an annotation name and the user
    name and ID of the users having linked that particular annotation.
    """
    annotation_query = create_annotation_query(project_id, request.POST)
    annotation_tuples = annotation_query.distinct().values_list('name',
        'cici_via_b__user__id', 'cici_via_b__user__username')
    # Create a set mapping annotation names to its users
    annotation_dict = {}
    for an, uid, un in annotation_tuples:
        if an not in annotation_dict:
            annotation_dict[an] = []
        annotation_dict[an].append({'id': uid, 'name': un})
    # Flatten dictoray to list
    annotations = [{'name': k, 'users': v} for k, v in \
            annotation_dict.iteritems()]
    return HttpResponse(json.dumps({'annotations': annotations}),
            mimetype="text/json")

@requires_user_role([UserRole.Browse])
def list_annotations_datatable(request, project_id=None):
    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', -1))
    if display_length < 0:
        display_length = 2000  # Default number of result rows

    annotation_query = create_annotation_query(project_id, request.POST)

    should_sort = request.POST.get('iSortCol_0', False)
    search_term = request.POST.get('sSearch', '')

    # Annotate last used time
    annotation_query = annotation_query.extra(
        select={'last_used': 'SELECT MAX(edition_time) FROM ' \
            'class_instance_class_instance cici WHERE ' \
            'cici.class_instance_b = class_instance.id'})

    # Annotate username of last user
    annotation_query = annotation_query.extra(
        select={'last_user': 'SELECT username FROM auth_user ' \
            'WHERE id = (SELECT user_id FROM class_instance_class_instance cici ' \
            'WHERE cici.class_instance_b = class_instance.id ' \
            'ORDER BY edition_time DESC LIMIT 1)'})

    # Annotate usage count
    annotation_query = annotation_query.extra(
        select={'num_usage': 'SELECT COUNT(*) FROM ' \
            'class_instance_class_instance cici WHERE ' \
            'cici.class_instance_b = class_instance.id'})

    if len(search_term) > 0:
        annotation_query = annotation_query.filter(name__regex=search_term)

    if should_sort:
        column_count = int(request.POST.get('iSortingCols', 0))
        sorting_directions = [request.POST.get('sSortDir_%d' % d, 'DESC')
                for d in range(column_count)]
        sorting_directions = map(lambda d: '-' if upper(d) == 'DESC' else '',
                sorting_directions)

        fields = ['name', 'last_used', 'num_usage', 'last_user']
        sorting_index = [int(request.POST.get('iSortCol_%d' % d))
                for d in range(column_count)]
        sorting_cols = map(lambda i: fields[i], sorting_index)

        annotation_query = annotation_query.extra(order_by=[di + col for (di, col) in zip(
                sorting_directions, sorting_cols)])

    # We only require ID, name, last used and usage number
    annotation_query = annotation_query.values_list(
            'id', 'name', 'last_used', 'num_usage', 'last_user')

    # Make sure we get a distinct result (which otherwise might not be the case
    # due to the JOINS that are made).
    annotation_query = annotation_query.distinct()

    #num_records = annotation_query.count() # len(annotation_query)
    num_records = len(annotation_query)

    response = {
        'iTotalRecords': num_records,
        'iTotalDisplayRecords': num_records,
        'aaData': []
    }

    for annotation in annotation_query[display_start:display_start + display_length]:
        # Format last used time
        if annotation[2]:
            last_used = annotation[2].strftime("%Y-%m-%d %H:%M:%S")
        else:
            last_used = 'never'
        # Build datatable data structure
        response['aaData'] += [[
            annotation[1], # Name
            last_used, # Last used
            annotation[3], # Usage
            annotation[4], # Annotator
            annotation[0], # ID
        ]]

    return HttpResponse(json.dumps(response), mimetype='text/json')
