# -*- coding: utf-8 -*-

from collections import defaultdict
import re
import dateutil.parser

from typing import Any, DefaultDict, Dict, List, Optional, Set, Tuple, Union

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.db import connection

from rest_framework.decorators import api_view

from catmaid.models import UserRole, Project, Class, ClassInstance, \
        ClassInstanceClassInstance, Relation, ReviewerWhitelist
from catmaid.control.authentication import requires_user_role, can_edit_or_fail
from catmaid.control.common import (get_relation_to_id_map,
        get_class_to_id_map, get_request_bool, get_request_list)


def get_annotation_to_id_map(project_id:Union[int,str], annotations:List, relations=None,
                             classes=None) -> Dict:
    """Get a dictionary mapping annotation names to annotation IDs in a
    particular project."""
    if not relations:
        relations = get_relation_to_id_map(project_id)
    if not classes:
        classes = get_class_to_id_map(project_id)

    cursor = connection.cursor()
    cursor.execute("""
        SELECT ci.name, ci.id
        FROM class_instance ci
        JOIN UNNEST(%(annotations)s::text[]) query_annotation(name)
            ON ci.name = query_annotation.name
        WHERE project_id = %(project_id)s
            AND ci.class_id = %(class_id)s
    """, {
        'project_id': project_id,
        'class_id': classes['annotation'],
        'annotations': annotations,
    })

    mapping = dict(cursor.fetchall())
    return mapping

def get_annotated_entities(project_id:Union[int,str], params, relations=None, classes=None,
        allowed_classes=['neuron', 'annotation'], sort_by=None, sort_dir=None,
        range_start=None, range_length=None, with_annotations:bool=True, with_skeletons:bool=True) -> Tuple[List, int]:
    """Get a list of annotated entities based on the passed in search criteria.
    """
    if not relations:
        relations = get_relation_to_id_map(project_id)
    if not classes:
        classes = get_class_to_id_map(project_id)
    # Get IDs of constraining classes.
    allowed_class_idx = {classes[c]:c for c in allowed_classes}
    allowed_class_ids = list(allowed_class_idx.keys())

    # One list of annotation sets for requested annotations and one for those
    # of which subannotations should be included
    annotation_sets = set() # type: Set
    not_annotation_sets = set() # type: Set
    annotation_sets_to_expand = set() # type: Set

    # Get name, annotator and time constraints, if available
    name = params.get('name', "").strip()
    name_not = get_request_bool(params, 'name_not', False)
    try:
        annotator_ids = set(map(int, params.getlist('annotated_by')))
    except AttributeError as e:
        # If no getlist() method is found on <params>, the passed in objects is
        # no QueryDict, but likely a regular dict. Accept this as okay.
        annotator_ids = set()
    start_date = params.get('annotation_date_start', "").strip()
    end_date = params.get('annotation_date_end', "").strip()

    # Allow parameterization of annotations using annotation names instead of IDs.
    annotation_reference = params.get('annotation_reference', 'id')
    if annotation_reference not in ('id', 'name'):
        raise ValueError("Only 'id' and 'name' are accepted for the annotation_reference parameter")
    # If annotation_names have been passed in, find matching IDs
    if annotation_reference == 'name':
        # Find annotation references
        annotation_names = set() # type: Set
        for key in params:
            if key.startswith('annotated_with') or \
                    key.startswith('not_annotated_with') or \
                    key.startswith('sub_annotated_with'):
                if len(params[key]) > 0:
                    annotation_names |= set(params[key].split(','))
        annotation_id_map = get_annotation_to_id_map(project_id, list(annotation_names))
        def to_id(inval) -> int: # Python wants the signatures for "conditional program variants" to be the same, incl variable names
            id = annotation_id_map.get(inval)
            if not id:
                raise ValueError("Unknown annotation: " + inval)
            return id
    else:
        def to_id(inval) -> int:
            return int(inval)

    # Collect annotations and sub-annotation information. Each entry can be a
    # list of IDs, which will be treated as or-combination.
    for key in params:
        if key.startswith('annotated_with'):
            if len(params[key]) > 0:
                annotation_set = frozenset(to_id(a) for a in params[key].split(','))
                annotation_sets.add(annotation_set)
        elif key.startswith('not_annotated_with'):
            if len(params[key]) > 0:
                not_annotation_set = frozenset(to_id(a) for a in params[key].split(','))
                not_annotation_sets.add(not_annotation_set)
        elif key.startswith('sub_annotated_with'):
            if len(params[key]) > 0:
                annotation_set = frozenset(to_id(a) for a in params[key].split(','))
                annotation_sets_to_expand.add(annotation_set)

    filters = [
        'ci.project_id = %(project_id)s',
        'ci.class_id = ANY (%(class_ids)s)'
    ]
    params = {
        "project_id": project_id,
        "class_ids": allowed_class_ids,
        "annotated_with": relations['annotated_with'],
        "model_of": relations['model_of']
    }

    if len(annotator_ids) > 0:
        params['annotator_ids'] = list(annotator_ids)
    if start_date:
        params['start_date'] = start_date
    if end_date:
        params['end_date'] = end_date

    # If a name is given, add this to the query. If its first character is a
    # slash, treat it as regex.
    if name:
        is_regex = name.startswith('/')
        if is_regex:
            op = '~*'
            params["name"] = name[1:]
        else:
            op = '~~*'
            params["name"] = '%' + name + '%'

        if name_not:
            filters.append("ci.name !{op} %(name)s".format(op=op))
        else:
            filters.append("ci.name {op} %(name)s".format(op=op))

    # Map annotation sets to their expanded sub-annotations
    sub_annotation_ids = get_sub_annotation_ids(project_id, annotation_sets_to_expand,
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

    not_annotation_id_sets = []
    for not_annotation_set in not_annotation_sets:
        current_not_annotation_ids = set(not_annotation_set)
        # Add sub annotations, if requested
        sa_ids = sub_annotation_ids.get(not_annotation_set)
        if sa_ids and len(sa_ids):
           current_not_annotation_ids.update(sa_ids)
        not_annotation_id_sets.append(current_not_annotation_ids)

    # Build needed joins for annotated_with search criteria
    joins = []
    for n, annotation_id_set in enumerate(annotation_id_sets):
        joins.append("""
            INNER JOIN class_instance_class_instance cici{n}
                    ON ci.id = cici{n}.class_instance_a
        """.format(n=n))

        filters.append("""
            cici{n}.relation_id = %(annotated_with)s AND
            cici{n}.class_instance_b = ANY (%(cici{n}_ann)s)
        """.format(n=n))

        params['cici{}_ann'.format(n)] = list(annotation_id_set)

        # Add annotator and time constraints, if available
        if annotator_ids:
            filters.append("""
                cici{n}.user_id = ANY (%(annotator_ids)s)
            """.format(n=n))
        if start_date:
            filters.append("""
                cici{n}.creation_time >= %(start_date)s
            """.format(n=n))
        if end_date:
            filters.append("""
                cici{n}.creation_time <= %(end_date)s
             """.format(n=n))

    # To exclude class instsances that are linked to particular annotation, all
    # annotations are collected and if in this list of annotations contains an
    # exclusion annotation, it is removed.
    if not_annotation_sets:
        joins.append("""
            LEFT JOIN LATERAL (
                SELECT cici_a.class_instance_a AS id,
                        array_agg(cici_a.class_instance_b) AS annotations
                FROM class_instance_class_instance cici_a
                WHERE cici_a.class_instance_a = ci.id
                  AND cici_a.relation_id = %(annotated_with)s
                GROUP BY 1
            ) ann_link ON ci.id = ann_link.id
        """)
        for n, annotation_id_set in enumerate(not_annotation_sets):
            filters.append("""
                NOT (ann_link.annotations && %(cici_ex{n}_ann)s)
            """.format(n=n))
            params['cici_ex{n}_ann'.format(n=n)] = list(annotation_id_set)

    # The bassic query
    query = """
        SELECT {fields}
        FROM class_instance ci
        {joins}
        WHERE {where}
        {sort}
        {offset}
    """

    cursor = connection.cursor()

    # If there are range limits and given that it is likely that there are many
    # entities returned, it is more efficient to get the total result number
    # with two queries: 1. Get total number of neurons 2. Get limited set. The
    # (too expensive) alternative would be to get all neurons for counting and
    # limiting on the Python side.
    num_total_records = None
    offset = ""
    if range_start is not None and range_length is not None:
        # Get total number of results with separate query. No sorting or offset
        # is needed for this.
        query_fmt_params = {
            'fields': 'COUNT(*)',
            'joins': '\n'.join(joins),
            'where': ' AND '.join(filters),
            'sort': '',
            'offset': ''
        }
        cursor.execute(query.format(**query_fmt_params), params)
        num_total_records = cursor.fetchone()[0]

        offset = "OFFSET %(range_start)s LIMIT %(range_length)s"
        params['range_start'] = int(range_start)
        params['range_length'] = int(range_length)

    # Add skeleton ID info (if available)
    joins.append("""
        LEFT JOIN LATERAL (
            SELECT cici_n.class_instance_b AS id,
                    array_agg(cici_n.class_instance_a) AS skeletons
            FROM class_instance_class_instance cici_n
            WHERE cici_n.class_instance_b = ci.id
              AND cici_n.relation_id = %(model_of)s
            GROUP BY 1
        ) skel_link ON ci.id = skel_link.id
    """)

    query_fmt_params = {
        "joins": "\n".join(joins),
        "where": " AND ".join(filters),
        "sort": "",
        "offset": offset,
        "fields": "ci.id, ci.user_id, ci.creation_time, " \
            "ci.edition_time, ci.project_id, ci.class_id, ci.name, " \
            "skel_link.skeletons"
    }

    # Sort if requested
    if sort_dir and sort_by:
        query_fmt_params['sort'] = "ORDER BY {sort_col} {sort_dir}".format(
                sort_col=sort_by, sort_dir=sort_dir.upper())

    # Execute query and build result data structure
    cursor.execute(query.format(**query_fmt_params), params)

    entities = []
    seen_ids = set() # type: Set
    for ent in cursor.fetchall():
        # Don't export objects with same ID multiple times
        if ent[0] in seen_ids:
            continue;

        class_name = allowed_class_idx[ent[5]]
        entity_info = {
            'id': ent[0],
            'name': ent[6],
            'type': class_name,
        }

        # Depending on the type of entity, some extra information is added.
        if class_name == 'neuron':
            entity_info['skeleton_ids'] = ent[7]

        entities.append(entity_info)
        seen_ids.add(ent[0])

    if num_total_records is None:
        num_total_records = len(entities)

    if with_annotations:
        entity_ids = [e['id'] for e in entities]
        # Make second query to retrieve annotations and skeletons
        annotations = ClassInstanceClassInstance.objects.filter(
            relation_id = relations['annotated_with'],
            class_instance_a__id__in = entity_ids).order_by('id').values_list(
                    'class_instance_a', 'class_instance_b',
                    'class_instance_b__name', 'user__id')

        annotation_dict = {} # type: Dict
        for a in annotations:
            if a[0] not in annotation_dict:
                annotation_dict[a[0]] = []
            annotation_dict[a[0]].append(
            {'id': a[1], 'name': a[2], 'uid': a[3]})

        for ent in entities:
            ent['annotations'] = annotation_dict.get(ent['id'], [])

    return entities, num_total_records


def get_sub_annotation_ids(project_id:Union[int,str], annotation_sets, relations, classes) -> Dict:
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
            self.data = set() # type: Set

    # Create a dictionary of all annotations annotating a set of annotations
    aaa = {} # type: Dict
    for aa in aaa_tuples:
        sa_set = aaa.get(aa[0])
        if sa_set is None:
            sa_set = set_wrapper()
            aaa[aa[0]] = sa_set
        sa_set.data.add(aa[1])

    # Collect all sub-annotations by following the annotation hierarchy for
    # every annotation in the annotation set passed.
    sa_ids = {} # type: Dict
    for annotation_set in annotation_sets:
        # Start with an empty result set for each requested annotation set
        ls = set() # type: Set
        for a in annotation_set:
            working_set = set([a])
            while working_set:
                parent_id = working_set.pop()
                # Try to get the sub-annotations for this parent
                child_ids = aaa.get(parent_id) or set_wrapper()
                for child_id in child_ids.data:
                    if child_id not in sa_ids:
                        if child_id not in ls:
                            # Add all children as sub annotations
                            ls.add(child_id)
                            working_set.add(child_id)
        # Store the result list for this ID
        sa_ids[annotation_set] = list(ls)

    return sa_ids

@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def query_annotated_classinstances(request:HttpRequest, project_id:Optional[Union[int,str]] = None) -> JsonResponse:
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
        description: |
            A comma separated list of annotation IDs which all annotate the
            result elements.
        type: integer
        paramType: form
        allowMultiple: true
      - name: not_annotated_with
        description: |
            A comma separated list of annotation IDs which don't annotate the
            result elements.
        type: integer
        paramType: form
        allowMultiple: true
      - name: sub_annotated_with
        description: |
            A comma separated list of annotation IDs that are contained
            in either 'annotated_with' or 'not_annotated_with' that get expanded to
            also include their sub-annotations in the query (of which then at
            least one has to match inclusion or exclusion respectively).
        type: integer
        paramType: form
        allowMultiple: true
      - name: with_annotations
        description: Indicate if annotations of result elements should be returned.
        type: boolean
        paramType: form
      - name: types
        description: |
            Allowed result types. Multple types can be passed with multiple
            parameters. Defaults to 'neuron' and 'annotation'.
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
      - name: range_length
        description: The number of results
        type: integer
        paramType: form
      - name: annotation_reference
        description: Whether annoation references are IDs or names, can be 'id' or 'name.
        type: string
        enum: [id, name]
        defaultValue: id
        required: false
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
            description: A list of ids of skeletons modeling this entity
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
    allowed_classes = get_request_list(request.POST, 'types', ['neuron', 'annotation'])

    sort_by = request.POST.get('sort_by', 'id')
    if sort_by not in ('id', 'name', 'first_name', 'last_name'):
        raise ValueError("Only 'id', 'name', 'first_name' and 'last_name' "
                         "are allowed for the 'sort-dir' parameter")
    sort_dir = request.POST.get('sort_dir', 'asc')
    if sort_dir not in ('asc', 'desc'):
        raise ValueError("Only 'asc' and 'desc' are allowed for the 'sort-dir' parameter")

    range_start = request.POST.get('range_start', None)
    range_length = request.POST.get('range_length', None)
    with_annotations = get_request_bool(request.POST, 'with_annotations', False)

    entities, num_total_records = get_annotated_entities(p.id, request.POST,
            relations, classes, allowed_classes, sort_by, sort_dir, range_start,
            range_length, with_annotations)

    return JsonResponse({
      'entities': entities,
      'totalRecords': num_total_records,
    })


def _update_neuron_annotations(project_id:Union[int,str], neuron_id, annotation_map:Dict[str,Any], losing_neuron_id=None) -> None:
    """ Ensure that the neuron is annotated_with only the annotations given.
    These annotations are expected to come as dictionary of annotation name
    versus annotator ID.

    If losing_neuron_id is provided, annotations missing on the neuron that
    exist for the losing neuron will be updated to refer to neuon_id, rather
    than created from scratch. This preserves provenance such as creation times.
    """
    annotated_with = Relation.objects.get(project_id=project_id,
            relation_name='annotated_with')

    qs = ClassInstanceClassInstance.objects.filter(
            class_instance_a__id=neuron_id, relation=annotated_with)
    qs = qs.select_related('class_instance_b').values_list(
            'class_instance_b__name', 'class_instance_b__id', 'id')

    existing_annotations = {e[0]: {
        'annotation_id': e[1],
        'cici_id': e[2]
    } for e in qs}

    update = set(annotation_map.keys())
    existing = set(existing_annotations.keys())
    missing = update - existing

    if losing_neuron_id:
        qs = ClassInstanceClassInstance.objects.filter(
                class_instance_a__id=losing_neuron_id, relation=annotated_with)
        qs = qs.select_related('class_instance_b').values_list(
                'class_instance_b__name', 'id')

        losing_existing_annotations = dict(qs)
        losing_missing = frozenset(losing_existing_annotations.keys()) & missing

        if losing_missing:
            cici_ids = [losing_existing_annotations[k] for k in losing_missing]
            u_ids = [annotation_map[k]['user_id'] for k in losing_missing]

            cursor = connection.cursor()

            cursor.execute('''
                UPDATE class_instance_class_instance
                SET class_instance_a = %s, user_id = missing.u_id
                FROM UNNEST(%s::integer[], %s::integer[]) AS missing(cici_id, u_id)
                WHERE id = missing.cici_id;
                ''', (neuron_id, cici_ids, u_ids))

            missing = missing - losing_missing

    missing_map = {k:v for k,v in annotation_map.items() if k in missing}
    _annotate_entities(project_id, [neuron_id], missing_map)

    to_delete = existing - update
    to_delete_ids = tuple(link['annotation_id'] for name, link in existing_annotations.items() \
        if name in to_delete)

    ClassInstanceClassInstance.objects.filter(project=project_id,
            class_instance_a_id=neuron_id, relation=annotated_with,
            class_instance_b_id__in=to_delete_ids).delete()

    for aid in to_delete_ids:
        delete_annotation_if_unused(project_id, aid, annotated_with)

    to_update = update.intersection(existing)
    to_update_ids = list(map(lambda x: existing_annotations[x]['cici_id'], to_update))
    to_update_et = list(map(lambda x: annotation_map[x]['edition_time'], to_update))
    to_update_ct = list(map(lambda x: annotation_map[x]['creation_time'], to_update))
    cursor = connection.cursor()
    cursor.execute("""
        UPDATE class_instance_class_instance
        SET creation_time = to_update.creation_time
        FROM UNNEST(%s::integer[], %s::timestamptz[])
            AS to_update(cici_id, creation_time)
        WHERE id = to_update.cici_id;
        UPDATE class_instance_class_instance
        SET edition_Time = to_update.edition_time
        FROM UNNEST(%s::integer[], %s::timestamptz[])
            AS to_update(cici_id, edition_time)
        WHERE id = to_update.cici_id;
    """, (to_update_ids,
          to_update_ct,
          to_update_ids,
          to_update_et))


def delete_annotation_if_unused(project, annotation, relation) -> Tuple[bool, int]:
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

def _annotate_entities(project_id:Union[int,str], entity_ids, annotation_map:Dict[str,Any],
        update_existing=False) -> Tuple[Dict,Set]:
    """ Annotate the entities with the given <entity_ids> with the given
    annotations. These annotations are expected to come as dictionary of
    annotation name versus an object with at least the field 'user_id'
    annotator ID. If the 'creation_time' and/or 'edition_time' fields are
    available, they will be used for the respective columns. A listof all
    annotation class instances that have been used is returned. Annotation
    names can contain the counting pattern {nX} with X being a number. This
    will add an incrementing number starting from X for each entity.
    """
    new_annotations = set()
    r = Relation.objects.get(project_id = project_id,
            relation_name = 'annotated_with')

    annotation_class = Class.objects.get(project_id = project_id,
                                         class_name = 'annotation')
    annotation_objects = {}
    # Create a regular expression to find allowed patterns. The first group is
    # the whole {nX} part, while the second group is X only.
    counting_pattern = re.compile(r"(\{n(\d+)\})")
    for annotation, meta in annotation_map.items():
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
        for a, a_entity_ids in expanded_annotations.items():
            ci, created = ClassInstance.objects.get_or_create(
                    project_id=project_id, name=a,
                    class_column=annotation_class,
                    defaults={'user_id': meta['user_id']})

            if created:
                new_annotations.add(ci.id)

            newly_annotated = set()
            # Annotate each of the entities. Don't allow duplicates.
            for entity_id in a_entity_ids:
                new_cici_defaults = {
                    'class_instance_a_id': entity_id,
                    'user_id': meta['user_id']
                }
                for field in ('creation_time', 'edition_time'):
                    value = meta.get(field)
                    if value:
                        new_cici_defaults[field] = value

                cici, created = ClassInstanceClassInstance.objects.get_or_create(
                        project_id=project_id, relation=r,
                        class_instance_a__id=entity_id, class_instance_b=ci,
                        defaults=new_cici_defaults)
                if created:
                    newly_annotated.add(entity_id)
                elif update_existing:
                    # Update creation time and edition_time, if requested
                    cici.update(**new_cici_defaults)

            # Remember which entities got newly annotated
            annotation_objects[ci] = newly_annotated

    return annotation_objects, new_annotations

def _annotate_entities_with_name(project_id:Union[int,str], user_id, entity_ids) -> Tuple[List[List[Any]], List[List[Any]]]:
    cursor = connection.cursor()

    annotated_with = Relation.objects.get(project_id=project_id,
            relation_name='annotated_with')

    annotation_class = Class.objects.get(project_id=project_id,
                                         class_name='annotation')

    name_annotation, _ = ClassInstance.objects.get_or_create(project_id=project_id,
                class_column=annotation_class, name='Name', defaults={
                    'user_id': user_id,
                })

    entity_name_map = dict(ClassInstance.objects.filter(
            pk__in=entity_ids).values_list('id', 'name'))
    entity_names = set(entity_name_map.values())

    existing_name_annotations = dict(ClassInstance.objects.filter(
            project_id=project_id, class_column=annotation_class,
            name__in=entity_names).values_list('name', 'id'))

    missing_name_annotations = entity_names - set(existing_name_annotations.keys())
    if missing_name_annotations:
        # Escape single quotes by double-quoting
        escaped_name_annotations = [n.replace("'", "''") for n in missing_name_annotations]
        cursor.execute("""
            INSERT INTO class_instance (user_id, project_id, class_id, name)
            VALUES {n_list}
            RETURNING name, id;
        """.format(**{
            'n_list': '(' + '),('.join(map(lambda x: "{}, {}, {}, '{}'".format(
                    user_id, project_id, annotation_class.id, x), escaped_name_annotations)) + ')',
        }))
        added_annotations = dict(cursor.fetchall())
        existing_name_annotations.update(added_annotations)

    # Now with all name annotations available we need to make sure all of them
    # have the meta annotation 'Name'.
    cursor.execute("""
        INSERT INTO class_instance_class_instance (project_id, user_id,
                class_instance_a, class_instance_b, relation_id)
        SELECT %(project_id)s, %(user_id)s, ci.id, %(name_ann_id)s, %(rel_id)s
        FROM class_instance ci
        JOIN UNNEST(%(name_ann_names)s::text[]) q(name)
            ON q.name = ci.name
        LEFT JOIN class_instance_class_instance cici
            ON cici.class_instance_a = ci.id
            AND cici.class_instance_b = %(name_ann_id)s
            AND cici.relation_id = %(rel_id)s
        WHERE cici.id IS NULL
            AND ci.project_id = %(project_id)s
            AND ci.class_id = %(annotation_class_id)s
        RETURNING id
    """, {
        'project_id': project_id,
        'user_id': user_id,
        'name_ann_id': name_annotation.id,
        'rel_id': annotated_with.id,
        'annotation_class_id': annotation_class.id,
        'name_ann_names': list(existing_name_annotations.keys()),
    })
    created_name_links = cursor.fetchall()

    # Now we have valid name annotations for each target entity. The final step
    # is to link those name annotations to the entities.
    cursor.execute("""
        INSERT INTO class_instance_class_instance (project_id, user_id,
                class_instance_a, class_instance_b, relation_id)
        SELECT %(project_id)s, %(user_id)s, ci.id, ci_name.id, %(rel_id)s
        FROM class_instance ci
        JOIN UNNEST(%(entity_ids)s::bigint[]) q(id)
            ON q.id = ci.id
        JOIN class_instance ci_name
            ON ci_name.name = ci.name
        LEFT JOIN class_instance_class_instance cici
            ON cici.class_instance_a = ci.id
            AND cici.class_instance_b = ci_name.id
            AND cici.relation_id = %(rel_id)s
        WHERE cici.id IS NULL
            AND ci.project_id = %(project_id)s
            AND ci_name.project_id = %(project_id)s
            AND ci_name.class_id = %(annotation_class_id)s
        RETURNING class_instance_a
    """, {
        'project_id': project_id,
        'user_id': user_id,
        'name_ann_id': name_annotation.id,
        'rel_id': annotated_with.id,
        'entity_ids': entity_ids,
        'annotation_class_id': annotation_class.id,
    })

    updated_cis = cursor.fetchall()

    return updated_cis, created_name_links

@requires_user_role(UserRole.Annotate)
def annotate_entities(request:HttpRequest, project_id = None) -> JsonResponse:
    p = get_object_or_404(Project, pk = project_id)

    # Read keys in a sorted manner
    sorted_keys = sorted(request.POST.keys())

    annotations = get_request_list(request.POST, 'annotations', [])
    meta_annotations = get_request_list(request.POST, 'meta_annotations', [])
    entity_ids = get_request_list(request.POST, 'entity_ids', [], map_fn=int)
    skeleton_ids = get_request_list(request.POST, 'skeleton_ids', [], map_fn=int)

    if any(skeleton_ids):
        skid_to_eid = dict(ClassInstance.objects.filter(project = p,
                class_column__class_name = 'neuron',
                cici_via_b__relation__relation_name = 'model_of',
                cici_via_b__class_instance_a__in = skeleton_ids).values_list(
                        'cici_via_b__class_instance_a', 'id'))
        entity_ids += [skid_to_eid[skid] for skid in skeleton_ids]

    # Annotate enties
    annotation_map = {a: { 'user_id': request.user.id } for a in annotations}
    annotation_objs, new_annotations = _annotate_entities(project_id,
            entity_ids, annotation_map)
    # Annotate annotations
    if meta_annotations:
        annotation_ids = [a.id for a in annotation_objs.keys()]
        meta_annotation_map = {ma: { 'user_id': request.user.id } for ma in meta_annotations}
        meta_annotation_objs, new_meta_annotations = _annotate_entities(
                project_id, annotation_ids, meta_annotation_map)
        # Keep track of new annotations
        new_annotations.update(new_meta_annotations)
        # Update used annotation objects set
        for ma, me in meta_annotation_objs.items():
            entities = annotation_objs.get(ma)
            if entities:
                entities.update(me)
            else:
                annotation_objs[ma] = me

    result = {
        'message': 'success',
        'annotations': [{
            'name': a.name,
            'id': a.id,
            'entities': list(e)
        } for a,e in annotation_objs.items()],
        'new_annotations': list(new_annotations)
    }

    return JsonResponse(result)

@api_view(['POST'])
@requires_user_role(UserRole.Annotate)
def add_neuron_name_annotations(request:HttpRequest, project_id = None) -> JsonResponse:
    """Add missing neuron name annotations.

    To each passed in neuron, a list of neuron IDs and/or skelton IDs, the
    neuron name stored in the neuron's base name is added as annotation. Each
    neuron name annotation is meta-annotated with a "Name" annotation.
    ---
    parameters:
      skeleton_ids:
        type: array
        description: A list of skeleton IDs to update
        required: false
        items:
            type: integer
      entity_ids:
        type: array
        description: A list of target entity IDs to update
        required: false
        items:
            type: integer
    """
    p = get_object_or_404(Project, pk = project_id)

    entity_ids = get_request_list(request.POST, 'entity_ids', [], map_fn=int)
    skeleton_ids = get_request_list(request.POST, 'skeleton_ids', [], map_fn=int)

    if not any(entity_ids):
        if not any(skeleton_ids):
            raise ValueError("Need either 'skeleton_ids' or 'entity_ids'")
        entity_ids = []

    if any(skeleton_ids):
        skid_to_eid = dict(ClassInstance.objects.filter(project = p,
                class_column__class_name = 'neuron',
                cici_via_b__relation__relation_name = 'model_of',
                cici_via_b__class_instance_a__in = skeleton_ids).values_list(
                        'cici_via_b__class_instance_a', 'id'))
        entity_ids += [skid_to_eid[skid] for skid in skeleton_ids]

    updated_cis, created_name_links = _annotate_entities_with_name(
            project_id, request.user.id, entity_ids)

    result = {
        'message': 'success',
        'updated_cis': updated_cis,
        'created_meta_links': len(created_name_links),
    }
    return JsonResponse(result)

@requires_user_role(UserRole.Annotate)
def remove_annotations(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Removes an annotation from one or more entities.
    """
    annotation_ids = get_request_list(request.POST, 'annotation_ids', [], map_fn=int)
    entity_ids = get_request_list(request.POST, 'entity_ids', [], map_fn=int)

    if not annotation_ids:
        raise ValueError("No annotation IDs provided")

    if not entity_ids:
        raise ValueError("No entity IDs provided")

    # Remove individual annotations
    deleted_annotations = {}
    deleted_links = []
    num_left_annotations = {}
    for annotation_id in annotation_ids:
        cicis_to_delete, missed_cicis, deleted, num_left = _remove_annotation(
                request.user, project_id, entity_ids, annotation_id)
        # Keep track of results
        num_left_annotations[str(annotation_id)] = num_left
        targetIds = []
        for cici in cicis_to_delete:
            deleted_links.append(cici.id)
            # The target is class_instance_a, because we deal with the
            # "annotated_with" relation.
            targetIds.append(cici.class_instance_a_id)
        if targetIds:
            deleted_annotations[annotation_id] = {
                'targetIds': targetIds
            }

    return JsonResponse({
        'deleted_annotations': deleted_annotations,
        'deleted_links': deleted_links,
        'left_uses': num_left_annotations
    })


@requires_user_role(UserRole.Annotate)
def remove_annotation(request:HttpRequest, project_id=None, annotation_id=None) -> JsonResponse:
    """ Removes an annotation from one or more entities.
    """
    entity_ids = get_request_list(request.POST, 'entity_ids', [], map_fn=int)

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

    return JsonResponse({
        'message': message,
        'deleted_annotation': deleted,
        'left_uses': num_left
    })

def _remove_annotation(user, project_id:Union[int,str], entity_ids, annotation_id) -> Tuple[List, List, int, int]:
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
    meta_annotations = [v for k,v in param_dict.items()
            if k.startswith('annotations[')]
    for meta_annotation in meta_annotations:
        annotation_query = annotation_query.filter(
                cici_via_b__relation_id = relations['annotated_with'],
                cici_via_b__class_instance_a = meta_annotation)

    # If information about annotated annotations is found, the current query
    # will include only annotations that are meta annotations for it.
    annotated_annotations = [v for k,v in param_dict.items()
            if k.startswith('annotates[')]
    for sub_annotation in annotated_annotations:
        annotation_query = annotation_query.filter(
                cici_via_a__relation_id = relations['annotated_with'],
                cici_via_a__class_instance_b = sub_annotation)

    # If parallel_annotations is given, only annotations are returned, that
    # are used alongside with these.
    parallel_annotations = [v for k,v in param_dict.items()
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
    ignored_annotations = [v for k,v in param_dict.items()
            if k.startswith('ignored_annotations[')]
    if ignored_annotations:
        annotation_query = annotation_query.exclude(
                name__in=ignored_annotations)

    return annotation_query

def generate_co_annotation_query(project_id:Union[int,str], co_annotation_ids, classIDs, relationIDs) -> Tuple[str,str]:
    if not co_annotation_ids:
        raise ValueError("Need co-annotations")

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
def list_annotations(request:HttpRequest, project_id=None) -> JsonResponse:
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
      - name: if_modified_since
        description: |
            Works only if <simple> is True. Return 304 response if there is no
            newer content with respect to the passed in UTC date in ISO format.
        paramType: form
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

    if request.method == 'GET':
        cursor = connection.cursor()
        simple = get_request_bool(request.GET, 'simple', False)
        classes = get_class_to_id_map(project_id, ('annotation',), cursor)
        relations = get_relation_to_id_map(project_id, ('annotated_with',), cursor)
        if_modified_since = request.GET.get('if_modified_since')

        # In case a simple representation should be returned, return a simple
        # list of name - ID mappings.
        if simple:
            # If there is no newer annotation data since the passed-in date, retunr
            # a 304 response.
            if if_modified_since:
                if_modified_since = dateutil.parser.parse(if_modified_since)
                cursor.execute("""
                    SELECT EXISTS(
                        SELECT 1 FROM class_instance
                        WHERE edition_time > %(date)s
                        AND class_id = %(annotation_class_id)s
                    )
                """, {
                    'date': if_modified_since,
                    'annotation_class_id': classes['annotation'],
                })

                new_data_exists = cursor.fetchone()[0]
                if not new_data_exists:
                    return HttpResponse(status=304)

            cursor.execute("""
                SELECT row_to_json(wrapped)::text
                FROM (
                    SELECT COALESCE(array_to_json(array_agg(row_to_json(annotation))), '[]'::json) AS annotations
                    FROM (
                        SELECT ci.id, ci.name
                        FROM class_instance ci
                        WHERE project_id = %(project_id)s
                            AND class_id = %(annotation_class_id)s
                    ) annotation
                ) wrapped
            """, {
                'project_id': project_id,
                'annotation_class_id': classes['annotation'],
            })
            annotation_json_text = cursor.fetchone()[0]
            return HttpResponse(annotation_json_text, content_type='application/json')

        cursor.execute('''
            SELECT DISTINCT ci.name, ci.id, u.id, u.username
            FROM class_instance ci
            LEFT OUTER JOIN class_instance_class_instance cici
                         ON (ci.id = cici.class_instance_b)
            LEFT OUTER JOIN auth_user u
                         ON (cici.user_id = u.id)
            WHERE (ci.class_id = %s AND (cici.relation_id = %s OR cici.id IS NULL));
                       ''',
            (classes['annotation'], relations['annotated_with']))
        annotation_tuples = cursor.fetchall()
    elif request.method == 'POST':
        annotation_query = create_annotation_query(project_id, request.POST)
        annotation_tuples = annotation_query.distinct().values_list('name', 'id',
            'cici_via_b__user__id', 'cici_via_b__user__username')
    else:
        raise ValueError("Unsupported HTTP method")

    # Create a set mapping annotation names to its users
    ids = {}
    annotation_dict = {} # type: Dict
    for annotation, aid, uid, username in annotation_tuples:
        ids[aid] = annotation
        ls = annotation_dict.get(aid)
        if ls is None:
            ls = []
            annotation_dict[aid] = ls
        if uid is not None:
            ls.append({'id': uid, 'name': username})
    # Flatten dictionary to list
    annotations = tuple({'name': ids[aid], 'id': aid, 'users': users} for aid, users in annotation_dict.items())
    return JsonResponse({'annotations': annotations})


def _fast_co_annotations(request:HttpRequest, project_id:Union[int,str], display_start, display_length) -> JsonResponse:
    classIDs = dict(Class.objects.filter(project_id=project_id).values_list('class_name', 'id'))
    relationIDs = dict(Relation.objects.filter(project_id=project_id).values_list('relation_name', 'id'))
    co_annotation_ids = set(get_request_list(request.POST, 'parallel_annotations', [], map_fn=int))

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
        sorting_directions = (request.POST.get('sSortDir_%d' % d, 'DESC') for d in range(column_count))

        fields = ('a.name', 'last_used', 'num_usage', 'last_user')
        sorting_index = (int(request.POST.get('iSortCol_%d' % d)) for d in range(column_count))
        sorting_cols = (fields[i] for i in sorting_index)

        sorter = '\nORDER BY ' + ','.join('%s %s' % u for u in zip(sorting_cols, sorting_directions))


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

    return JsonResponse(response)


@requires_user_role([UserRole.Browse])
def list_annotations_datatable(request:HttpRequest, project_id=None) -> JsonResponse:
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

    # Add (last) annotated on time
    annotation_query = annotation_query.extra(
        select={'annotated_on': 'SELECT MAX(cici.creation_time) FROM ' \
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
                for d in range(column_count)]
        sorting_directions = list(map(lambda d: '-' if d.upper() == 'DESC' else '',
                sorting_directions))

        fields = ['name', 'annotated_on', 'num_usage', 'last_user']
        sorting_index = [int(request.POST.get('iSortCol_%d' % d))
                for d in range(column_count)]
        sorting_cols = list(map(lambda i: fields[i], sorting_index))

        annotation_query = annotation_query.extra(order_by=[di + col for (di, col) in zip(
                sorting_directions, sorting_cols)])

    # We only require ID, name, last used and usage number
    annotation_query = annotation_query.values_list(
            'id', 'name', 'annotated_on', 'num_usage', 'last_user')

    # Make sure we get a distinct result (which otherwise might not be the case
    # due to the JOINS that are made).
    annotation_query = annotation_query.distinct()

    #num_records = annotation_query.count() # len(annotation_query)
    num_records = len(annotation_query)

    response = {
        'iTotalRecords': num_records,
        'iTotalDisplayRecords': num_records,
        'aaData': []
    } # type: Dict[str, Any]

    for annotation in annotation_query[display_start:display_start + display_length]:
        # Format last used time
        if annotation[2]:
            annotated_on = annotation[2].isoformat()
        else:
            annotated_on = 'never'
        # Build datatable data structure
        response['aaData'].append([
            annotation[1], # Name
            annotated_on, # Annotated on
            annotation[3], # Usage
            annotation[4], # Annotator ID
            annotation[0]]) # ID

    return JsonResponse(response)


@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def annotations_for_skeletons(request:HttpRequest, project_id=None) -> JsonResponse:
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
    skids = tuple(get_request_list(request.POST, 'skeleton_ids', [], map_fn=int))
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
    m = defaultdict(list) # type: DefaultDict[Any, List]
    a = dict()
    for skid, aid, name, uid in cursor.fetchall():
        m[skid].append({'id': aid, 'uid': uid})
        a[aid] = name

    return JsonResponse({
        'skeletons': m,
        'annotations': a
    }, json_dumps_params={'separators': (',', ':')})


@api_view(['POST'])
@requires_user_role([UserRole.Browse])
def annotations_for_entities(request:HttpRequest, project_id=None) -> JsonResponse:
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
    object_ids = tuple(get_request_list(request.POST, 'object_ids', [], map_fn=int))
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
    m = defaultdict(list) # type: DefaultDict[Any, List]
    a = dict()
    for eid, aid, name, uid in cursor.fetchall():
        m[eid].append({'id': aid, 'uid': uid})
        a[aid] = name

    return JsonResponse({
        'entities': m,
        'annotations': a
    }, json_dumps_params={'separators': (',', ':')})

def annotations_for_skeleton(project_id:Union[int,str], skeleton_id, relations=None, classes=None) -> Dict:
    """Get a a dictionary mapping annotations on the neuron modeled by the
    passed in skeleton to the respective annotators.
    """
    if not relations:
        relations = get_relation_to_id_map(project_id)
    if not classes:
        classes = get_class_to_id_map(project_id)
    cursor = connection.cursor()
    cursor.execute("""
        SELECT a.name, cici.user_id
        FROM class_instance a
        JOIN class_instance_class_instance cici
            ON a.id = cici.class_instance_b
        JOIN class_instance neuron
            ON neuron.id = cici.class_instance_a
        JOIN class_instance_class_instance skeleton_neuron
            ON cici.class_instance_a = skeleton_neuron.class_instance_b
        JOIN class_instance skeleton
            ON skeleton.id = skeleton_neuron.class_instance_a
        WHERE cici.project_id = %(project_id)s
            AND a.class_id = %(annotation_class)s
            AND cici.relation_id = %(annotated_with_rel)s
            AND neuron.class_id = %(neuron_class)s
            AND skeleton_neuron.relation_id =  %(model_of_rel)s
            AND skeleton_neuron.class_instance_a = %(skeleton_id)s
    """, {
        'project_id': project_id,
        'annotation_class': classes['annotation'],
        'annotated_with_rel': relations['annotated_with'],
        'neuron_class': classes['neuron'],
        'model_of_rel': relations['model_of'],
        'skeleton_id': skeleton_id,
    })

    return dict(cursor.fetchall())
