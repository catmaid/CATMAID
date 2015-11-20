import json
import re
from string import upper
from itertools import izip

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db import connection

from rest_framework.decorators import api_view

from catmaid.models import UserRole, Project, Class, ClassInstance, \
        ClassInstanceClassInstance, Relation, ReviewerWhitelist
from catmaid.control.authentication import requires_user_role, can_edit_or_fail
from catmaid.control.common import defaultdict, get_relation_to_id_map, \
        get_class_to_id_map

def create_basic_annotated_entity_query(project, params, relations, classes,
        allowed_classes=['neuron', 'annotation']):
    # Get IDs of constraining classes.
    allowed_class_ids = [classes[c] for c in allowed_classes]

    annotated_with = relations['annotated_with']

    # One list of annotation sets for requested annotations and one for those
    # of which subannotations should be included
    annotation_sets = set()
    annotation_sets_to_expand = set()

    # Get name, annotator and time constraints, if available
    name = params.get('name', "").strip()
    annotator_ids = set(map(int, params.getlist('annotated_by')))
    start_date = params.get('annotation_date_start', "").strip()
    end_date = params.get('annotation_date_end', "").strip()

    # Collect annotations and sub-annotation information. Each entry can be a
    # list of IDs, which will be treated as or-combination.
    for key in params:
        if key.startswith('annotated_with'):
            annotation_set = frozenset(int(a) for a in params[key].split(','))
            annotation_sets.add(annotation_set)
        elif key.startswith('sub_annotated_with'):
            annotation_set = frozenset(int(a) for a in params[key].split(','))
            annotation_sets_to_expand.add(annotation_set)

    # Construct a dictionary that contains all the filters needed for the
    # current query.
    filters = {
        'project': project,
        'class_column_id__in': allowed_class_ids,
    }

    # If a name is given, add this to the query
    if name:
        filters['name__iregex'] = name

    # Add annotator and time constraints, if available
    if annotator_ids:
        if len(annotator_ids) == 1:
            filters['cici_via_a__user'] = next(iter(annotator_ids))
        else:
            filters['cici_via_a__user__in'] = annotator_ids
        filters['cici_via_a__relation_id'] = annotated_with
    if start_date:
        filters['cici_via_a__creation_time__gte'] = start_date
    if end_date:
        filters['cici_via_a__creation_time__lte'] = end_date

    # Map annotation sets to their expanded sub-annotations
    sub_annotation_ids = get_sub_annotation_ids(project, annotation_sets_to_expand,
            relations, classes)

    # Collect all annotations and their sub-annotation IDs (if requested) in a
    # set each. For the actual query each set is connected with AND while
    # for everything within one set OR is used.
    annotation_id_sets = []
    for annotation_set in annotation_sets:
        current_annotation_ids = set(annotation_set)
        # Add sub annotations, if requested
        sa_ids = sub_annotation_ids.get(annotation_set)
        if sa_ids and len(sa_ids):
            current_annotation_ids.update(sa_ids)
        annotation_id_sets.append(current_annotation_ids)

    # Due to Django's QuerySet syntax, we have to add the first
    # annotation ID set constraint to the first filter we add.
    if annotation_id_sets:
        first_id_set = annotation_id_sets.pop()
        filters['cici_via_a__relation_id'] = annotated_with
        # Use IN (OR) for a single annotation and its sub-annotations
        filters['cici_via_a__class_instance_b_id__in'] = first_id_set

    # Create basic filter, possibly containing *one* annotation ID set
    entities = ClassInstance.objects.filter(**filters)

    # Add remaining filters for annotation constraints, if any
    for annotation_id_set in annotation_id_sets:
        entities = entities.filter(
            cici_via_a__relation_id=annotated_with,
            cici_via_a__class_instance_b_id__in=annotation_id_set)

    # Create final query. Without any restriction, the result set will contain
    # all instances of the given set of allowed classes.
    return entities

def get_sub_annotation_ids(project_id, annotation_sets, relations, classes):
    """ Sub-annotations are annotations that are annotated with an annotation
    from the annotation_set passed. Additionally, transivitely annotated
    annotations are returned as well. Note that all entries annotation_sets
    must be frozenset instances, they need to be hashable.
    """
    if not annotation_sets:
        return {}

    aaa_tuples = ClassInstanceClassInstance.objects.filter(
            project_id=project_id,
            class_instance_a__class_column=classes['annotation'],
            class_instance_b__class_column=classes['annotation'],
            relation_id = relations['annotated_with']).values_list(
                    'class_instance_b', 'class_instance_a')

    # A set wrapper to keep a set in a dictionary
    class set_wrapper:
        def __init__(self):
            self.data = set()

    # Create a dictionary of all annotations annotating a set of annotations
    aaa = {}
    for aa in aaa_tuples:
        sa_set = aaa.get(aa[0])
        if sa_set is None:
            sa_set = set_wrapper()
            aaa[aa[0]] = sa_set
        sa_set.data.add(aa[1])

    # Collect all sub-annotations by following the annotation hierarchy for
    # every annotation in the annotation set passed.
    sa_ids = {}
    for annotation_set in annotation_sets:
        # Start with an empty result set for each requested annotation set
        ls = set()
        for a in annotation_set:
            working_set = set([a])
            while working_set:
                parent_id = working_set.pop()
                # Try to get the sub-annotations for this parent
                child_ids = aaa.get(parent_id) or set_wrapper()
                for child_id in child_ids.data:
                    if child_id not in sa_ids:
                        # Add all children as sub annotations
                        ls.add(child_id)
                        working_set.add(child_id)
        # Store the result list for this ID
        sa_ids[annotation_set] = list(ls)

    return sa_ids

def create_annotated_entity_list(project, entities_qs, relations, annotations=True):
    """ Executes the expected class instance queryset in <entities> and expands
    it to aquire more information.
    """
    # Cache class name
    entities = entities_qs.select_related('class_column')
    entity_ids = [e.id for e in entities]

    # Make third query to retrieve all skeletons and root nodes for entities (if
    # they have such).
    skeletons = ClassInstanceClassInstance.objects.filter(
            relation_id = relations['model_of'],
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
        entity_info = {
            'id': e.id,
            'name': e.name,
            'type': class_name,
        }

        # Depending on the type of entity, some extra information is added.
        if class_name == 'neuron':
            entity_info['skeleton_ids'] = skeleton_dict[e.id] \
                    if e.id in skeleton_dict else []

        annotated_entities.append(entity_info)

    if annotations:
        # Make second query to retrieve annotations and skeletons
        annotations = ClassInstanceClassInstance.objects.filter(
            relation_id = relations['annotated_with'],
            class_instance_a__id__in = entity_ids).order_by('id').values_list(
                    'class_instance_a', 'class_instance_b',
                    'class_instance_b__name', 'user__id')

        annotation_dict = {}
        for a in annotations:
            if a[0] not in annotation_dict:
                annotation_dict[a[0]] = []
            annotation_dict[a[0]].append(
            {'id': a[1], 'name': a[2], 'uid': a[3]})

        for e in annotated_entities:
            e['annotations'] = annotation_dict.get(e['id'], [])

    return annotated_entities

@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def query_annotated_classinstances(request, project_id = None):
    """Query entities based on various constraints

    Entities are objects that can be referenced within CATMAID's semantic
    space, e.g. neurons, annotations or stack groups. This API allows to query
    them, mainly by annotations that have been used with them. Multiple
    annotation parameters can be used to combine different annotation sets with
    AND. Elements of one annotation parameter are combined with OR.
    ---
    parameters:
      - name: name
        description: The name (or a part of it) of result elements.
        type: string
        paramType: form
      - name: annotated_by
        description: A result element was annotated by a user with this ID.
        type: integer
        paramType: form
        allowMultiple: true
      - name: annotation_date_start
        description: The earliest YYYY-MM-DD date result elements have been annotated at.
        format: date
        type: string
        paramType: query
      - name: annotation_date_end
        description: The latest YYYY-MM-DD date result elements have been annotated at.
        format: date
        type: string
        paramType: query
      - name: annotated_with
        description: A comma separated list of annotation IDs of which at least one annotated the result elements.
        type: integer
        paramType: form
        allowMultiple: true
      - name: sub_annotated_with
        description: A comma separated list of annotation IDs of which at least one or its sub-annotations annotated the result elements.
        type: integer
        paramType: form
        allowMultiple: true
      - name: with_annotations
        description: Indicate if annotations of result elements should be returned.
        type: boolean
        paramType: form
      - name: types
        description: Allowed result types. Multple types can be passed with multiple parameters. Defaults to 'neuron' and 'annotation'.
        type: string
        paramType: form
        allowMultiple: true
      - name: sort_by
        description: Indicates how results are sorted.
        type: string
        defaultValue: id
        enum: [id, name, first_name, last_name]
        paramType: form
      - name: sort_dir
        description: Indicates sorting direction.
        type: string
        defaultValue: asc
        enum: [asc, desc]
        paramType: form
      - name: range_start
        description: The first result element index.
        type: integer
        paramType: form
      - name: range_end
        description: The maximum number result elements.
        type: integer
        paramType: form
    models:
      annotated_entity:
        id: annotated_entity
        description: A result entity.
        properties:
          name:
            type: string
            description: The name of the entity
            required: true
          id:
            type: integer
            description: The id of the entity
            required: true
          skeleton_ids:
            type: array
            description: A list of users
            required: true
            items:
                type: integer
          type:
            type: string
            description: Type of the entity
            required: true
    type:
        entities:
            type: array
            items:
              $ref: annotated_entity
            required: true
        totalRecords:
            type: integer
            required: true
    """
    p = get_object_or_404(Project, pk = project_id)

    classes = dict(Class.objects.filter(project_id=project_id).values_list('class_name', 'id'))
    relations = dict(Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id'))

    # Type constraints
    allowed_classes = [v for k,v in request.POST.iteritems()
            if k.startswith('types[')]
    if not allowed_classes:
        allowed_classes = ('neuron', 'annotation')

    query = create_basic_annotated_entity_query(p, request.POST,
            relations, classes, allowed_classes)

    # Sorting
    sort_by = request.POST.get('sort_by', 'id')
    if sort_by not in ('id', 'name', 'first_name', 'last_name'):
        raise ValueError("Only 'id', 'name', 'first_name' and 'last_name' "
                         "are allowed for the 'sort-dir' parameter")
    sort_dir = request.POST.get('sort_dir', 'asc')
    if sort_dir not in ('asc', 'desc'):
        raise ValueError("Only 'asc' and 'desc' are allowed for the 'sort-dir' parameter")
    query = query.order_by(sort_by if sort_dir == 'asc' else ('-' + sort_by))

    # Make sure we get a distinct result, which otherwise might not be the case
    # due to the joins made.
    query = query.distinct()

    # If there are range limits and given that it is very likely that there are
    # many entities returned, it is more efficient to get the total result
    # number with two queries: 1. Get total number of neurons 2. Get limited
    # set. The (too expensive) alternative would be to get all neurons for
    # counting and limiting on the Python side.
    range_start = request.POST.get('range_start', None)
    range_length = request.POST.get('range_length', None)
    with_annotations = request.POST.get('with_annotations', 'false') == 'true'
    if range_start and range_length:
        range_start = int(range_start)
        range_length = int(range_length)
        num_records = query.count()
        entities = create_annotated_entity_list(p,
                query[range_start:range_start + range_length],
                relations, with_annotations)
    else:
        entities = create_annotated_entity_list(p, query, relations,
                with_annotations)
        num_records = len(entities)

    return HttpResponse(json.dumps({
      'entities': entities,
      'totalRecords': num_records,
    }))

def _update_neuron_annotations(project_id, user, neuron_id, annotation_map):
    """ Ensure that the neuron is annotated_with only the annotations given.
    These annotations are expected to come as dictornary of annotation name
    versus annotator ID.
    """
    annotated_with = Relation.objects.get(project_id=project_id,
            relation_name='annotated_with')

    qs = ClassInstanceClassInstance.objects.filter(
            class_instance_a__id=neuron_id, relation=annotated_with)
    qs = qs.select_related('class_instance_b').values_list(
            'class_instance_b__name', 'class_instance_b__id')

    existing_annotations = dict(qs)

    update = set(annotation_map.iterkeys())
    existing = set(existing_annotations.iterkeys())

    missing = {k:v for k,v in annotation_map.items() if k in update - existing}
    _annotate_entities(project_id, [neuron_id], missing)

    to_delete = existing - update
    to_delete_ids = tuple(aid for name, aid in existing_annotations.iteritems() \
        if name in to_delete)

    ClassInstanceClassInstance.objects.filter(project=project_id,
            class_instance_a_id=neuron_id, relation=annotated_with,
            class_instance_b_id__in=to_delete_ids).delete()

    for aid in to_delete_ids:
        delete_annotation_if_unused(project_id, aid, annotated_with)


def delete_annotation_if_unused(project, annotation, relation):
    """ Delete the given annotation instance if it is not used anymore.
    Returns a tuple where the first element states if
    """
    num_annotation_links = ClassInstanceClassInstance.objects.filter(
        project=project, class_instance_b=annotation, relation=relation).count()

    if num_annotation_links:
        return False, num_annotation_links
    else:
        # See if the annotation is annotated itself
        meta_annotation_links = ClassInstanceClassInstance.objects.filter(
            project=project, class_instance_a=annotation, relation=relation)
        meta_annotation_ids = [cici.class_instance_b_id for cici in meta_annotation_links]

        # Delete annotation
        ClassInstance.objects.filter(project=project, id=annotation).delete()

        # Delete also meta annotation instances, if they exist
        for ma in meta_annotation_ids:
            delete_annotation_if_unused(project, ma, relation)

        return True, 0

def _annotate_entities(project_id, entity_ids, annotation_map):
    """ Annotate the entities with the given <entity_ids> with the given
    annotations. These annotations are expected to come as dictornary of
    annotation name versus annotator ID. A listof all annotation class
    instances that have been used is returned. Annotation names can contain the
    counting pattern {nX} with X being a number. This will add an incrementing
    number starting from X for each entity.
    """
    r = Relation.objects.get(project_id = project_id,
            relation_name = 'annotated_with')

    annotation_class = Class.objects.get(project_id = project_id,
                                         class_name = 'annotation')
    annotation_objects = {}
    # Create a regular expression to find allowed patterns. The first group is
    # the whole {nX} part, while the second group is X only.
    counting_pattern = re.compile(r"(\{n(\d+)\})")
    for annotation, annotator_id in annotation_map.items():
        # Look for patterns, replace all {n} with {n1} to normalize
        annotation = annotation.replace("{n}", "{n1}")
        # Find all {nX} in the annotation name
        expanded_annotations = {}

        if counting_pattern.search(annotation):
            # Create annotation names based on the counting patterns found, for
            # each entitiy.
            for i, eid in enumerate(entity_ids):
                a = annotation
                while True:
                    # Find next match and cancel if there isn't any
                    m = counting_pattern.search(a)
                    if not m:
                        break
                    # Replace match
                    count = int(m.groups()[1]) + i
                    a = m.string[:m.start()] + str(count) + m.string[m.end():]
                # Remember this annotation for the current entity
                expanded_annotations[a] = [eid]
        else:
            # No matches, so use same annotation for all entities
            expanded_annotations = {annotation: entity_ids}

        # Make sure the annotation's class instance exists.
        for a, a_entity_ids in expanded_annotations.iteritems():
            ci, created = ClassInstance.objects.get_or_create(
                    project_id=project_id, name=a,
                    class_column=annotation_class,
                    defaults={'user_id': annotator_id})

            newly_annotated = set()
            # Annotate each of the entities. Don't allow duplicates.
            for entity_id in a_entity_ids:
                cici, created = ClassInstanceClassInstance.objects.get_or_create(
                        project_id=project_id, relation=r,
                        class_instance_a__id=entity_id, class_instance_b=ci,
                        defaults={'class_instance_a_id': entity_id,
                                'user_id': annotator_id})
                if created:
                    newly_annotated.add(entity_id)
            # Remember which entities got newly annotated
            annotation_objects[ci] = newly_annotated

    return annotation_objects

@requires_user_role(UserRole.Annotate)
def annotate_entities(request, project_id = None):
    p = get_object_or_404(Project, pk = project_id)

    # Read keys in a sorted manner
    sorted_keys = sorted(request.POST.keys())

    annotations = [request.POST[k] for k in sorted_keys
            if k.startswith('annotations[')]
    meta_annotations = [request.POST[k] for k in sorted_keys
            if k.startswith('meta_annotations[')]
    entity_ids = [int(request.POST[k]) for k in sorted_keys
            if k.startswith('entity_ids[')]
    skeleton_ids = [int(request.POST[k]) for k in sorted_keys
            if k.startswith('skeleton_ids[')]

    if any(skeleton_ids):
        skid_to_eid = dict(ClassInstance.objects.filter(project = p,
                class_column__class_name = 'neuron',
                cici_via_b__relation__relation_name = 'model_of',
                cici_via_b__class_instance_a__in = skeleton_ids).values_list(
                        'cici_via_b__class_instance_a', 'id'))
        entity_ids += [skid_to_eid[skid] for skid in skeleton_ids]

    # Annotate enties
    annotation_map = {a: request.user.id for a in annotations}
    annotation_objs = _annotate_entities(project_id, entity_ids, annotation_map)
    # Annotate annotations
    if meta_annotations:
        annotation_ids = [a.id for a in annotation_objs.keys()]
        meta_annotation_map = {ma: request.user.id for ma in meta_annotations}
        meta_annotation_objs = _annotate_entities(project_id, annotation_ids,
                meta_annotation_map)
        # Update used annotation objects set
        for ma, me in meta_annotation_objs.items():
            entities = annotation_objs.get(ma)
            if entities:
                entities.update(me)
            else:
                annotation_objs[ma] = me

    result = {
        'message': 'success',
        'annotations': [{'name': a.name, 'id': a.id, 'entities': list(e)} \
                for a,e in annotation_objs.items()],
    }

    return HttpResponse(json.dumps(result), content_type='text/json')

@requires_user_role(UserRole.Annotate)
def remove_annotations(request, project_id=None):
    """ Removes an annotation from one or more entities.
    """
    annotation_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('annotation_ids[')]
    entity_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('entity_ids[')]

    if not annotation_ids:
        raise ValueError("No annotation IDs provided")

    if not entity_ids:
        raise ValueError("No entity IDs provided")

    # Remove individual annotations
    deleted_annotations = []
    num_left_annotations = {}
    for annotation_id in annotation_ids:
        cicis_to_delete, missed_cicis, deleted, num_left = _remove_annotation(
                request.user, project_id, entity_ids, annotation_id)
        # Keep track of results
        num_left_annotations[str(annotation_id)] = num_left
        for cici in cicis_to_delete:
            deleted_annotations.append(cici.id)

    return HttpResponse(json.dumps({
        'deleted_annotations': deleted_annotations,
        'left_uses': num_left_annotations
    }), content_type='text/json')


@requires_user_role(UserRole.Annotate)
def remove_annotation(request, project_id=None, annotation_id=None):
    """ Removes an annotation from one or more entities.
    """
    entity_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('entity_ids[')]

    cicis_to_delete, missed_cicis, deleted, num_left = _remove_annotation(
            request.user, project_id, entity_ids, annotation_id)

    if len(cicis_to_delete) > 1:
        message = "Removed annotation from %s entities." % len(cicis_to_delete)
    elif len(cicis_to_delete) == 1:
        message = "Removed annotation from one entity."
    else:
        message = "No annotation removed."

    if missed_cicis:
        message += " Couldn't de-annotate %s entities, due to the lack of " \
                "permissions." % len(missed_cicis)

    if deleted:
        message += " Also removed annotation instance, because it isn't used " \
                "anywhere else."
    else:
        message += " There are %s links left to this annotation." % num_left

    return HttpResponse(json.dumps({
        'message': message,
        'deleted_annotation': deleted,
        'left_uses': num_left
    }), content_type='text/json')

def _remove_annotation(user, project_id, entity_ids, annotation_id):
    """Remove an annotation made by a certain user in a given project on a set
    of entities (usually neurons and annotations). Returned is a 4-tuple which
    holds the deleted annotation links, the list of links that couldn't be
    deleted due to lack of permission, if the annotation itself was removed
    (because it wasn't used anymore) and how many uses of this annotation are
    left.
    """
    p = get_object_or_404(Project, pk=project_id)
    relations = dict(Relation.objects.filter(
        project_id=project_id).values_list('relation_name', 'id'))

    # Get CICI instance representing the link
    cici_n_a = ClassInstanceClassInstance.objects.filter(project=p,
            relation_id=relations['annotated_with'],
            class_instance_a__id__in=entity_ids,
            class_instance_b__id=annotation_id)
    # Make sure the current user has permissions to remove the annotation.
    missed_cicis = []
    cicis_to_delete = []
    for cici in cici_n_a:
        try:
            can_edit_or_fail(user, cici.id, 'class_instance_class_instance')
            cicis_to_delete.append(cici)
        except Exception:
            # Remember links for which permissions are missing
            missed_cicis.append(cici)

    # Remove link between entity and annotation for all links on which the user
    # the necessary permissions has.
    if cicis_to_delete:
        ClassInstanceClassInstance.objects \
                .filter(id__in=[cici.id for cici in cicis_to_delete]) \
                .delete()

    # Remove the annotation class instance, regardless of the owner, if there
    # are no more links to it
    annotated_with = Relation.objects.get(project_id=project_id,
            relation_name='annotated_with')
    deleted, num_left = delete_annotation_if_unused(project_id, annotation_id,
                                                    annotated_with)

    return cicis_to_delete, missed_cicis, deleted, num_left

def create_annotation_query(project_id, param_dict):

    classes = dict(Class.objects.filter(project_id=project_id).values_list('class_name', 'id'))
    relations = dict(Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id'))

    annotation_query = ClassInstance.objects.filter(project_id=project_id,
            class_column__id=classes['annotation'])

    # Meta annotations are annotations that are used to annotate other
    # annotations.
    meta_annotations = [v for k,v in param_dict.iteritems()
            if k.startswith('annotations[')]
    for meta_annotation in meta_annotations:
        annotation_query = annotation_query.filter(
                cici_via_b__relation_id = relations['annotated_with'],
                cici_via_b__class_instance_a = meta_annotation)

    # If information about annotated annotations is found, the current query
    # will include only annotations that are meta annotations for it.
    annotated_annotations = [v for k,v in param_dict.iteritems()
            if k.startswith('annotates[')]
    for sub_annotation in annotated_annotations:
        annotation_query = annotation_query.filter(
                cici_via_a__relation_id = relations['annotated_with'],
                cici_via_a__class_instance_b = sub_annotation)

    # If parallel_annotations is given, only annotations are returned, that
    # are used alongside with these.
    parallel_annotations = [v for k,v in param_dict.iteritems()
            if k.startswith('parallel_annotations[')]
    for p_annotation in parallel_annotations:
        annotation_query = annotation_query.filter(
                cici_via_b__class_instance_a__cici_via_a__relation_id = relations['annotated_with'],
                cici_via_b__class_instance_a__cici_via_a__class_instance_b = p_annotation)

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
                cici_via_b__relation_id = relations['annotated_with'],
                cici_via_b__class_instance_a__id=neuron_id)

    # Instead of a neuron a user can also use to skeleton id to constrain the
    # annotation set returned. This is implicetely a neuron id restriction.
    skeleton_id = param_dict.get('skeleton_id', None)
    if skeleton_id:
        annotation_query = annotation_query.filter(
                cici_via_b__relation_id = relations['annotated_with'],
                cici_via_b__class_instance_a__cici_via_b__relation_id = relations['model_of'],
                cici_via_b__class_instance_a__cici_via_b__class_instance_a__id = skeleton_id)

    # If annotations to ignore are passed in, they won't appear in the
    # result set.
    ignored_annotations = [v for k,v in param_dict.iteritems()
            if k.startswith('ignored_annotations[')]
    if ignored_annotations:
        annotation_query = annotation_query.exclude(
                name__in=ignored_annotations)

    return annotation_query


def generate_annotation_intersection_query(project_id, annotations):
    if not annotations:
        return

    tables = []
    where = []

    for i, annotation in enumerate(annotations):
        tables.append("""
        class_instance c%s,
        class_instance_class_instance cc%s""" % (i, i))

        where.append("""
        AND c%s.name = '%s'
        AND c%s.id = cc%s.class_instance_b
        AND cc%s.relation_id = r.id""" % (i, annotation, i, i, i))

    q = """
        SELECT c.id,
               c.name

        FROM class_instance c,
             relation r,
             %s

        WHERE r.relation_name = 'annotated_with'
        AND c.project_id = %s
             %s

             %s
        """ % (',\n    '.join(tables),
               project_id,
               '\n'.join(where),
               '\n        '.join('AND cc%s.class_instance_a = c.id' % i for i in xrange(len(annotations))))

    return q


def generate_co_annotation_query(project_id, co_annotation_ids, classIDs, relationIDs):
    if not co_annotation_ids:
        return

    tables = []
    where = []

    annotation_class = classIDs['annotation']
    annotated_with = relationIDs['annotated_with']

    for i, annotation_id in enumerate(co_annotation_ids):
        tables.append("""
        class_instance a%s,
        class_instance_class_instance cc%s""" % (i, i))

        where.append("""
        AND a%s.project_id = %s
        AND a%s.class_id = %s
        AND cc%s.class_instance_a = neuron.id
        AND cc%s.relation_id = %s
        AND cc%s.class_instance_b = a%s.id
        AND a%s.id = '%s'
        """ % (i, project_id,
               i, annotation_class,
               i,
               i, annotated_with,
               i, i,
               i, annotation_id))

    select = """
    SELECT DISTINCT
        a.id,
        a.name,
        (SELECT username FROM auth_user, class_instance_class_instance cici
          WHERE cici.class_instance_b = cc.id
            AND cici.user_id = auth_user.id
            ORDER BY cici.edition_time DESC LIMIT 1) AS "last_user",
        (SELECT MAX(edition_time) FROM class_instance_class_instance cici WHERE cici.class_instance_b = a.id) AS "last_used",
        (SELECT count(*) FROM class_instance_class_instance cici WHERE cici.class_instance_b = a.id) AS "num_usage"
    """

    rest = """
    FROM
        class_instance a,
        class_instance_class_instance cc,
        class_instance neuron,
        %s
    WHERE
            neuron.class_id = %s
        AND a.class_id = %s
        AND a.project_id = %s
        AND cc.class_instance_a = neuron.id
        AND cc.relation_id = %s
        AND cc.class_instance_b = a.id
    %s
    """ % (',\n'.join(tables),
           classIDs['neuron'],
           annotation_class,
           project_id,
           annotated_with,
           ''.join(where))

    return select, rest


@api_view(['GET', 'POST'])
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_annotations(request, project_id=None):
    """List annotations matching filtering criteria that are currently in use.

    The result set is the intersection of annotations matching criteria (the
    criteria are conjunctive) unless stated otherwise.
    ---
    parameters:
      - name: annotations
        description: A list of (meta) annotations with which which resulting annotations should be annotated with.
        paramType: form
        type: array
        items:
            type: integer
            description: An annotation ID
      - name: annotates
        description: A list of entity IDs (like annotations and neurons) that should be annotated by the result set.
        paramType: form
        type: array
        items:
            type: integer
            description: An entity ID
      - name: parallel_annotations
        description: A list of annotation that have to be used alongside the result set.
        paramType: form
        type: array
        items:
            type: integer
            description: An annotation ID
      - name: user_id
        description: Result annotations have to be used by this user.
        paramType: form
        type: integer
      - name: neuron_id
        description: Result annotations will annotate this neuron.
        paramType: form
        type: integer
      - name: skeleton_id
        description: Result annotations will annotate the neuron modeled by this skeleton.
        paramType: form
        type: integer
      - name: ignored_annotations
        description: A list of annotation names that will be excluded from the result set.
        paramType: form
        type: array
        items:
            type: string
    models:
      annotation_user_list_element:
        id: annotation_user_list_element
        properties:
          id:
            type: integer
            name: id
            description: The user id
            required: true
          name:
            type: string
            name: name
            description: The user name
            required: true
      annotation_list_element:
        id: annotation_list_element
        description: Represents one annotation along with its users.
        properties:
          name:
            type: string
            description: The name of the annotation
            required: true
          id:
            type: integer
            description: The id of the annotation
            required: true
          users:
            type: array
            description: A list of users
            required: true
            items:
              $ref: annotation_user_list_element
    type:
      - type: array
        items:
          $ref: annotation_list_element
        required: true
    """

    if not request.POST:
        cursor = connection.cursor()
        classes = get_class_to_id_map(project_id, ('annotation',), cursor)
        relations = get_relation_to_id_map(project_id, ('annotated_with',), cursor)

        cursor.execute('''
            SELECT DISTINCT ci.name, ci.id, u.id, u.username
            FROM class_instance ci
            LEFT OUTER JOIN class_instance_class_instance cici
                         ON (ci.id = cici.class_instance_b)
            LEFT OUTER JOIN auth_user u
                         ON (cici.user_id = u.id)
            WHERE (ci.class_id = %s AND cici.relation_id = %s
              AND ci.project_id = %s AND cici.project_id = %s);
                       ''',
            (classes['annotation'], relations['annotated_with'], project_id,
                project_id))
        annotation_tuples = cursor.fetchall()
    else:
        annotation_query = create_annotation_query(project_id, request.POST)
        annotation_tuples = annotation_query.distinct().values_list('name', 'id',
            'cici_via_b__user__id', 'cici_via_b__user__username')

    # Create a set mapping annotation names to its users
    ids = {}
    annotation_dict = {}
    for annotation, aid, uid, username in annotation_tuples:
        ids[aid] = annotation
        ls = annotation_dict.get(aid)
        if ls is None:
            ls = []
            annotation_dict[aid] = ls
        ls.append({'id': uid, 'name': username})
    # Flatten dictionary to list
    annotations = tuple({'name': ids[aid], 'id': aid, 'users': users} for aid, users in annotation_dict.iteritems())
    return HttpResponse(json.dumps({'annotations': annotations}), content_type="text/json")

def _fast_co_annotations(request, project_id, display_start, display_length):
    classIDs = dict(Class.objects.filter(project_id=project_id).values_list('class_name', 'id'))
    relationIDs = dict(Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id'))
    co_annotation_ids = set(int(v) for k, v in request.POST.iteritems() if k.startswith('parallel_annotations'))

    select, rest = generate_co_annotation_query(int(project_id), co_annotation_ids, classIDs, relationIDs)

    entries = []

    search_term = request.POST.get('sSearch', '').strip()
    if search_term:
        rest += "\nAND a.name ~ %s" # django will escape and quote the string
        entries.append(search_term)

    # Sorting?
    sorting = request.POST.get('iSortCol_0', False)
    sorter = ''
    if sorting:
        column_count = int(request.POST.get('iSortingCols', 0))
        sorting_directions = (request.POST.get('sSortDir_%d' % d, 'DESC') for d in xrange(column_count))

        fields = ('a.name', 'last_used', 'num_usage', 'last_user')
        sorting_index = (int(request.POST.get('iSortCol_%d' % d)) for d in xrange(column_count))
        sorting_cols = (fields[i] for i in sorting_index)

        sorter = '\nORDER BY ' + ','.join('%s %s' % u for u in izip(sorting_cols, sorting_directions))


    cursor = connection.cursor()

    cursor.execute("SELECT count(DISTINCT a.id) " + rest, entries)
    num_records = cursor.fetchone()[0]

    response = {
        'iTotalRecords': num_records,
        'iTotalDisplayRecords': num_records,
    }

    rest += sorter
    rest += '\nLIMIT %s OFFSET %s'
    entries.append(display_length) # total to return
    entries.append(display_start) # offset

    cursor.execute(select + rest, entries)

    # 0: a.id
    # 1: a.name
    # 2: last_user
    # 3: last_used
    # 4: num_usage
    aaData = []
    for row in cursor.fetchall():
        last_used = row[3]
        if last_used:
            last_used = last_used.strftime("%Y-%m-%d %H:%M:%S")
        else:
            last_used = 'never'
        aaData.append([row[1], # Annotation name
                       last_used,
                       row[4], # Last use
                       row[2], # Last annotator
                       row[0]])

    response['aaData'] = aaData
    return HttpResponse(json.dumps(response), content_type='text/json')


@requires_user_role([UserRole.Browse])
def list_annotations_datatable(request, project_id=None):
    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', -1))
    if display_length < 0:
        display_length = 2000  # Default number of result rows


    # Speed hack
    if 'parallel_annotations[0]' in request.POST:
        return _fast_co_annotations(request, project_id, display_start, display_length)


    annotation_query = create_annotation_query(project_id, request.POST)

    should_sort = request.POST.get('iSortCol_0', False)
    search_term = request.POST.get('sSearch', '')


    # Additional information should also be constrained by neurons and user
    # names. E.g., when viewing the annotation list for a user, the usage count
    # should only display the number of times the user has used an annotation.
    conditions = ""
    if request.POST.get('neuron_id'):
        conditions += "AND cici.class_instance_a = %s " % \
                request.POST.get('neuron_id')
    if request.POST.get('user_id'):
        conditions += "AND cici.user_id = %s " % \
                request.POST.get('user_id')

    # Add last used time
    annotation_query = annotation_query.extra(
        select={'last_used': 'SELECT MAX(edition_time) FROM ' \
            'class_instance_class_instance cici WHERE ' \
            'cici.class_instance_b = class_instance.id %s' % conditions})

    # Add user ID of last user
    annotation_query = annotation_query.extra(
        select={'last_user': 'SELECT auth_user.id FROM auth_user, ' \
            'class_instance_class_instance cici ' \
            'WHERE cici.class_instance_b = class_instance.id ' \
            'AND cici.user_id = auth_user.id %s' \
            'ORDER BY cici.edition_time DESC LIMIT 1' % conditions})

    # Add usage count
    annotation_query = annotation_query.extra(
        select={'num_usage': 'SELECT COUNT(*) FROM ' \
            'class_instance_class_instance cici WHERE ' \
            'cici.class_instance_b = class_instance.id %s' % conditions})

    if len(search_term) > 0:
        annotation_query = annotation_query.filter(name__iregex=search_term)

    if should_sort:
        column_count = int(request.POST.get('iSortingCols', 0))
        sorting_directions = [request.POST.get('sSortDir_%d' % d, 'DESC')
                for d in xrange(column_count)]
        sorting_directions = map(lambda d: '-' if upper(d) == 'DESC' else '',
                sorting_directions)

        fields = ['name', 'last_used', 'num_usage', 'last_user']
        sorting_index = [int(request.POST.get('iSortCol_%d' % d))
                for d in xrange(column_count)]
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
        response['aaData'].append([
            annotation[1], # Name
            last_used, # Last used
            annotation[3], # Usage
            annotation[4], # Annotator ID
            annotation[0]]) # ID

    return HttpResponse(json.dumps(response), content_type='text/json')


@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def annotations_for_skeletons(request, project_id=None):
    """Get annotations and who used them for a set of skeletons.

    This method focuses only on annotations linked to skeletons and is likely to
    be faster than the general query. Returns an object with two fields:
    "annotations", which is itself an object with annotation IDs as fields,
    giving access to the corresponding annotation names. And the field
    "skeletons" is also an object, mapping skeleton IDs to lists of
    annotation-annotator ID pairs. Also, as JSON separator a colon is used
    instead of a comma.
    ---
    parameters:
      - name: skeleton_ids
        description: A list of skeleton IDs which are annotated by the resulting annotations.
        paramType: form
        type: array
        items:
            type: integer
            description: A skeleton ID
    """
    skids = tuple(int(skid) for key, skid in request.POST.iteritems() \
            if key.startswith('skeleton_ids['))
    cursor = connection.cursor()
    cursor.execute("SELECT id FROM relation WHERE project_id=%s AND relation_name='annotated_with'" % int(project_id))
    annotated_with_id = cursor.fetchone()[0]

    # Select pairs of skeleton_id vs annotation name
    cursor.execute('''
    SELECT skeleton_neuron.class_instance_a,
           annotation.id, annotation.name, neuron_annotation.user_id
    FROM class_instance_class_instance skeleton_neuron,
         class_instance_class_instance neuron_annotation,
         class_instance annotation
    WHERE skeleton_neuron.class_instance_a IN (%s)
      AND skeleton_neuron.class_instance_b = neuron_annotation.class_instance_a
      AND neuron_annotation.relation_id = %s
      AND neuron_annotation.class_instance_b = annotation.id
    ''' % (",".join(map(str, skids)), annotated_with_id))

    # Group by skeleton ID
    m = defaultdict(list)
    a = dict()
    for skid, aid, name, uid in cursor.fetchall():
        m[skid].append({'id': aid, 'uid': uid})
        a[aid] = name

    return HttpResponse(json.dumps({
        'skeletons': m,
        'annotations': a
    }, separators=(',', ':')))


@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def annotations_for_entities(request, project_id=None):
    """Query annotations linked to a list of objects.

    These objects can for instance be neurons, annotations or stack groups. From
    a database perspective, these objects are class instances.

    Returned is an object with the fields "entities" and "annotations". The
    former is an object mapping an entity ID to a list of annotations. Each
    annotation is represented by an object containing its "id" and "uid", the
    user who annotated it. The latter maps annotation IDs to annotation names.
    For instance::

    { "entities": { "42": [{id: 1, uid: 12}, {id: 3, uid: 14}] }, "annotations": { 12: "example1", 14: "example2" } }
    ---
    parameters:
      - name: object_ids
        description: A list of object IDs for which annotations should be returned.
        paramType: form
        type: array
        allowMultiple: true
        items:
            type: integer
            description: A skeleton ID
    """
    # Get 'annotated_with' relation ID
    object_ids = tuple(int(eid) for key, eid in request.POST.iteritems() \
            if key.startswith('object_ids['))
    cursor = connection.cursor()
    cursor.execute("""
        SELECT id FROM relation
        WHERE project_id=%s AND
        relation_name='annotated_with'""" % int(project_id))
    annotated_with_id = cursor.fetchone()[0]

    # Select pairs of skeleton_id vs annotation name
    cursor.execute('''
    SELECT entity_annotation.class_instance_a,
           annotation.id, annotation.name, entity_annotation.user_id
    FROM class_instance_class_instance entity_annotation,
         class_instance annotation
    WHERE entity_annotation.class_instance_a IN (%s)
      AND entity_annotation.relation_id = %s
      AND entity_annotation.class_instance_b = annotation.id
    ''' % (",".join(map(str, object_ids)), annotated_with_id))

    # Group by entity ID
    m = defaultdict(list)
    a = dict()
    for eid, aid, name, uid in cursor.fetchall():
        m[eid].append({'id': aid, 'uid': uid})
        a[aid] = name

    return HttpResponse(json.dumps({
        'entities': m,
        'annotations': a
    }, separators=(',', ':')))
