import json, sys
from string import upper

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.db.models import Count, Max, Q
from django.db import connection

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *

from itertools import chain, imap, izip


def create_basic_annotated_entity_query(project, params, relations, classes,
        allowed_classes=['neuron', 'annotation']):
    # Get IDs of constraining classes.
    allowed_class_ids = [classes[c] for c in allowed_classes]

    annotated_with = relations['annotated_with']

    # One set for requested annotations and one for those of which
    # subannotations should be included
    annotations = set()
    annotations_to_expand = set()

    # Get name, annotator and time constraints, if available
    name = params.get('neuron_query_by_name', "").strip()
    annotator_id = params.get('neuron_query_by_annotator', None)
    start_date = params.get('neuron_query_by_start_date', "").strip()
    end_date = params.get('neuron_query_by_end_date', "").strip()

    # Collect annotations and sub-annotation information
    for key in params:
        if key.startswith('neuron_query_by_annotation'):
            annotations.add(int(params[key]))
        elif key.startswith('neuron_query_include_subannotation'):
            annotations_to_expand.add(int(params[key]))

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
    if annotator_id:
        filters['cici_via_a__user'] = annotator_id
    if start_date:
        filters['cici_via_a__creation_time__gte'] = start_date
    if end_date:
        filters['cici_via_a__creation_time__lte'] = end_date

    # Get map of annotations to expand and their sub-annotations
    sub_annotation_ids = get_sub_annotation_ids(project, annotations_to_expand,
            relations, classes)

    # Collect all possible annotation and sub-annotation IDs
    annotation_ids = set()
    for a in annotations:
        annotation_ids.add(a)
        # Add sub annotations, if requested
        sa_ids = sub_annotation_ids.get(a)
        if sa_ids and len(sa_ids):
            annotation_ids.update(sa_ids)

    # Add filter for annotation constraints, if any
    if annotation_ids:
        filters['cici_via_a__relation_id'] = annotated_with
        filters['cici_via_a__class_instance_b_id__in'] = annotation_ids

    # Create final query. Without any restriction, the result set will contain
    # all instances of the given set of allowed classes.
    return ClassInstance.objects.filter(**filters)

def get_sub_annotation_ids(project_id, annotation_set, relations, classes):
    """ Sub-annotations are annotations that are annotated with an annotation
    from the annotation_set passed. Additionally, transivitely annotated
    annotations are returned as well.
    """
    if not annotation_set:
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
    for a in annotation_set:
        # Start with an empty result set for each requested annotation
        ls = set()
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
        sa_ids[a] = list(ls)

    return sa_ids

def create_annotated_entity_list(project, entities_qs, relations, annotations=True):
    """ Executes the expected class instance queryset in <entities> and expands
    it to aquire more information.
    """
    # Cache class name
    entities = entities_qs.select_related('class_column')
    entity_ids = [e.id for e in entities]

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

    classes = dict(Class.objects.filter(project_id=project_id).values_list('class_name', 'id'))
    relations = dict(Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id'))

    display_start = int(request.POST.get('display_start', 0))
    display_length = int(request.POST.get('display_length', -1))
    if display_length < 0:
        display_length = 2000  # Default number of result rows

    query = create_basic_annotated_entity_query(p, request.POST, relations,
            classes)
    query = query.order_by('id').distinct()

    # Get total number of results
    num_records = query.count()

    # Limit and offset result to display range
    query = query[display_start:display_start + display_length]

    dump = create_annotated_entity_list(p, query, relations)

    return HttpResponse(json.dumps({
      'entities': dump,
      'total_n_records': num_records,
    }))

@requires_user_role([UserRole.Browse])
def query_neurons_by_annotations_datatable(request, project_id=None):
    p = get_object_or_404(Project, pk = project_id)

    classes = dict(Class.objects.filter(project_id=project_id).values_list('class_name', 'id'))
    relations = dict(Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id'))

    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', -1))
    if display_length < 0:
        display_length = 2000  # Default number of result rows

    neuron_query = create_basic_annotated_entity_query(p, request.POST,
            relations, classes, allowed_classes=['neuron'])

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

    response = {
        'iTotalRecords': num_records,
        'iTotalDisplayRecords': num_records,
        'aaData': []
    }

    entities = create_annotated_entity_list(p,
            neuron_query[display_start:display_start + display_length], relations)
    for entity in entities:
        if entity['type'] == 'neuron':
          response['aaData'] += [[
              entity['name'],
              entity['annotations'],
              entity['skeleton_ids'],
              entity['id'],
          ]]

    return HttpResponse(json.dumps(response), mimetype='text/json')

def _update_neuron_annotations(project_id, user, neuron_id, annotation_map):
    """ Ensure that the neuron is annotated_with only the annotations given.
    These annotations are expected to come as dictornary of annotation name
    versus annotator ID.
    """
    qs = ClassInstanceClassInstance.objects.filter(
            class_instance_a__id=neuron_id,
            relation__relation_name='annotated_with')
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

    ClassInstanceClassInstance.objects.filter(
            class_instance_a_id=neuron_id,
            relation__relation_name='annotated_with',
            class_instance_b_id__in=to_delete_ids).delete()


def _annotate_entities(project_id, entity_ids, annotation_map):
    """ Annotate the entities with the given <entity_ids> with the given
    annotations. These annotations are expected to come as dictornary of
    annotation name versus annotator ID. A listof all annotation class
    instances that have been used is returned.
    """
    r = Relation.objects.get(project_id = project_id,
            relation_name = 'annotated_with')

    annotation_class = Class.objects.get(project_id = project_id,
                                         class_name = 'annotation')
    annotation_objects = {}
    for annotation, annotator_id in annotation_map.items():
        # Make sure the annotation's class instance exists.
        ci, created = ClassInstance.objects.get_or_create(
                project_id=project_id, name=annotation,
                class_column=annotation_class,
                defaults={'user_id': annotator_id})
        newly_annotated = set()
        # Annotate each of the entities. Don't allow duplicates.
        for entity_id in entity_ids:
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

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def annotate_entities(request, project_id = None):
    p = get_object_or_404(Project, pk = project_id)

    annotations = [v for k,v in request.POST.iteritems()
            if k.startswith('annotations[')]
    meta_annotations = [v for k,v in request.POST.iteritems()
            if k.startswith('meta_annotations[')]
    entity_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('entity_ids[')]
    skeleton_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('skeleton_ids[')]

    if any(skeleton_ids):
        entity_ids += ClassInstance.objects.filter(project = p,
                class_column__class_name = 'neuron',
                cici_via_b__relation__relation_name = 'model_of',
                cici_via_b__class_instance_a__in = skeleton_ids).values_list(
                        'id', flat=True)

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

    return HttpResponse(json.dumps(result), mimetype='text/json')

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_annotation(request, project_id=None, annotation_id=None):
    """ Removes an annotation from one or more entities.
    """
    p = get_object_or_404(Project, pk=project_id)

    entity_ids = [int(v) for k,v in request.POST.iteritems()
            if k.startswith('entity_ids[')]

    # Get CICI instance representing the link
    cici_n_a = ClassInstanceClassInstance.objects.filter(project=p,
            class_instance_a__id__in=entity_ids,
            class_instance_b__id=annotation_id)
    # Make sure the current user has permissions to remove the annotation.
    missed_cicis = []
    cicis_to_delete = []
    for cici in cici_n_a:
        try:
            can_edit_or_fail(request.user, cici.id,
                             'class_instance_class_instance')
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

    if len(cicis_to_delete) > 1:
        message = "Removed annotation from %s entities." % len(cicis_to_delete)
    elif len(cicis_to_delete) == 1:
        message = "Removed annotation from one entity."
    else:
        message = "No annotation removed."

    if missed_cicis:
        message += " Couldn't de-annotate %s entities, due to the lack of " \
                "permissions." % len(missed_cicis)

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


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def list_annotations(request, project_id=None):
    """ Creates a list of objects containing an annotation name and the user
    name and ID of the users having linked that particular annotation.
    """
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
    return HttpResponse(json.dumps({'annotations': annotations}), mimetype="text/json")

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
    return HttpResponse(json.dumps(response), mimetype='text/json')


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
        annotation_query = annotation_query.filter(name__regex=search_term)

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

    return HttpResponse(json.dumps(response), mimetype='text/json')


@requires_user_role([UserRole.Browse])
def annotations_for_skeletons(request, project_id=None):
    skids = tuple(int(skid) for key, skid in request.POST.iteritems() if key.startswith('skids['))
    cursor = connection.cursor()
    cursor.execute("SELECT id FROM relation WHERE project_id=%s AND relation_name='annotated_with'" % int(project_id))
    annotated_with_id = cursor.fetchone()[0]

    # Select pairs of skeleton_id vs annotation name
    cursor.execute('''
    SELECT skeleton_neuron.class_instance_a,
           annotation.name
    FROM class_instance_class_instance skeleton_neuron,
         class_instance_class_instance neuron_annotation,
         class_instance annotation
    WHERE skeleton_neuron.class_instance_a IN (%s)
      AND skeleton_neuron.class_instance_b = neuron_annotation.class_instance_a
      AND neuron_annotation.relation_id = %s
      AND neuron_annotation.class_instance_b = annotation.id
    ''' % (",".join(str(skid) for skid in skids), annotated_with_id))

    # Group by skeleton ID
    m = defaultdict(list)
    for skid, name in cursor.fetchall():
        m[skid].append(name)

    return HttpResponse(json.dumps(m, separators=(',', ':')))

