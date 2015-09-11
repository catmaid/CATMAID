import string
import random
import json

from collections import defaultdict

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render_to_response
from django.template.context import RequestContext

from catmaid.fields import Double3D
from catmaid.models import Log, NeuronSearch, CELL_BODY_CHOICES, \
        SORT_ORDERS_DICT, User, Relation, Class, ClassInstance, \
        ClassInstanceClassInstance


def get_catmaid_version(request):
    return HttpResponse(json.dumps({'SERVER_VERSION': settings.VERSION}), mimetype='application/json')


def _create_relation(user, project_id, relation_id, instance_a_id, instance_b_id):
    relation = ClassInstanceClassInstance()
    relation.user = user
    relation.project_id = project_id
    relation.relation_id = relation_id
    relation.class_instance_a_id = instance_a_id
    relation.class_instance_b_id = instance_b_id
    relation.save()
    return relation

def insert_into_log(project_id, user_id, op_type, location=None, freetext=None):
    """ Inserts a new entry into the log table. If the location parameter is
    passed, it is expected to be an iteratable (list, tuple).
    """
    # valid operation types
    operation_type_array = [
        "rename_root",
        "create_neuron",
        "rename_neuron",
        "remove_neuron",
        "move_neuron",

        "create_group",
        "rename_group",
        "remove_group",
        "move_group",

        "create_skeleton",
        "rename_skeleton",
        "remove_skeleton",
        "move_skeleton",

        "split_skeleton",
        "join_skeleton",
        "reroot_skeleton",

        "change_confidence",

        "reset_reviews"
    ]

    if not op_type in operation_type_array:
        return {'error': 'Operation type {0} not valid'.format(op_type)}

    new_log = Log()
    new_log.user_id = user_id
    new_log.project_id = project_id
    new_log.operation_type = op_type
    if not location is None:
        new_log.location = Double3D(*location)
    if not freetext is None:
        new_log.freetext = freetext

    new_log.save()


# Tip from: http://lincolnloop.com/blog/2008/may/10/getting-requestcontext-your-templates/
# Required because we need a RequestContext, not just a Context - the
# former looks at TEMPLATE_CONTEXT_PROCESSORS, while the latter doesn't.

def my_render_to_response(req, *args, **kwargs):
    kwargs['context_instance'] = RequestContext(req)
    return render_to_response(*args, **kwargs)


def json_error_response(message):
    """
    When an operation fails we should return a JSON dictionary
    with the key 'error' set to an error message.  This is a
    helper method to return such a structure:
    """
    return HttpResponse(json.dumps({'error': message}),
                        content_type='text/json')


def order_neurons(neurons, order_by=None):
    column, reverse = 'name', False
    if order_by and (order_by in SORT_ORDERS_DICT):
        column, reverse, _ = SORT_ORDERS_DICT[order_by]
        if column == 'name':
            neurons.sort(key=lambda x: x.name)
        elif column == 'gal4':
            neurons.sort(key=lambda x: x.cached_sorted_lines_str)
        elif column == 'cell_body':
            neurons.sort(key=lambda x: x.cached_cell_body)
        else:
            raise Exception("Unknown column (%s) in order_neurons" % (column,))
        if reverse:
            neurons.reverse()
    return neurons

# Both index and visual_index take a request and kwargs and then
# return a list of neurons and a NeuronSearch form:


def get_form_and_neurons(request, project_id, kwargs):
    # If we've been passed parameters in a REST-style GET request,
    # create a form from them.  Otherwise, if it's a POST request,
    # create the form from the POST parameters.  Otherwise, it's a
    # plain request, so create the default search form.
    rest_keys = ('search', 'cell_body_location', 'order_by')
    if any((x in kwargs) for x in rest_keys):
        kw_search = kwargs.get('search', None) or ""
        kw_cell_body_choice = kwargs.get('cell_body_location', None) or "a"
        kw_order_by = kwargs.get('order_by', None) or 'name'
        search_form = NeuronSearch({'search': kw_search,
                                    'cell_body_location': kw_cell_body_choice,
                                    'order_by': kw_order_by})
    elif request.method == 'POST':
        search_form = NeuronSearch(request.POST)
    else:
        search_form = NeuronSearch({'search': '',
                                    'cell_body_location': 'a',
                                    'order_by': 'name'})
    if search_form.is_valid():
        search = search_form.cleaned_data['search']
        cell_body_location = search_form.cleaned_data['cell_body_location']
        order_by = search_form.cleaned_data['order_by']
    else:
        search = ''
        cell_body_location = 'a'
        order_by = 'name'

    cell_body_choices_dict = dict(CELL_BODY_CHOICES)

    all_neurons = ClassInstance.objects.filter(
        project__id=project_id,
        class_column__class_name='neuron',
        name__icontains=search).exclude(name='orphaned pre').exclude(name='orphaned post')

    if cell_body_location != 'a':
        location = cell_body_choices_dict[cell_body_location]
        all_neurons = all_neurons.filter(
            project__id=project_id,
            cici_via_a__relation__relation_name='has_cell_body',
            cici_via_a__class_instance_b__name=location)

    cici_qs = ClassInstanceClassInstance.objects.filter(
        project__id=project_id,
        relation__relation_name='has_cell_body',
        class_instance_a__class_column__class_name='neuron',
        class_instance_b__class_column__class_name='cell_body_location')

    neuron_id_to_cell_body_location = dict(
        (x.class_instance_a.id, x.class_instance_b.name) for x in cici_qs)

    neuron_id_to_driver_lines = defaultdict(list)

    for cici in ClassInstanceClassInstance.objects.filter(
        project__id=project_id,
        relation__relation_name='expresses_in',
        class_instance_a__class_column__class_name='driver_line',
        class_instance_b__class_column__class_name='neuron'):
        neuron_id_to_driver_lines[cici.class_instance_b.id].append(cici.class_instance_a)

    all_neurons = list(all_neurons)

    for n in all_neurons:
        n.cached_sorted_lines = sorted(
            neuron_id_to_driver_lines[n.id], key=lambda x: x.name)
        n.cached_sorted_lines_str = ", ".join(x.name for x in n.cached_sorted_lines)
        n.cached_cell_body = neuron_id_to_cell_body_location.get(n.id, 'Unknown')

    all_neurons = order_neurons(all_neurons, order_by)
    return (all_neurons, search_form)

# TODO After all PHP functions have been replaced and all occurrence of
# this odd behavior have been found, change callers to not depend on this
# legacy functionality.
def makeJSON_legacy_list(objects):
    '''
    The PHP function makeJSON, when operating on a list of rows as
    results, will output a JSON list of key-values, with keys being
    integers from 0 and upwards. We return a dict with the same
    structure so that it looks the same when used with json.dumps.
    '''
    i = 0
    res = {}
    for o in objects:
        res[i] = o
        i += 1
    return res

def cursor_fetch_dictionary(cursor):
    "Returns all rows from a cursor as a dict"
    desc = cursor.description
    return [
            dict(zip([col[0] for col in desc], row))
            for row in cursor.fetchall()
            ]

def get_relation_to_id_map(project_id, name_constraints=None, cursor=None):
    """
    Return a mapping of relation names to relation IDs. If a list of names is
    provided, only relations with those names will be included. If a cursor is
    provided, this cursor will be used.
    """
    if cursor:
        query = "SELECT relation_name, id  FROM relation WHERE project_id = %s"
        params = [int(project_id)]
        if name_constraints:
            query += " AND (%s)" % ' OR '.join(('relation_name = %s',) * len(name_constraints))
            params += (name_constraints)
        cursor.execute(query, params)
        return dict(cursor.fetchall())
    else:
        query = Relation.objects.filter(project=project_id)
        if name_constraints:
            query = query.filter(relation_name__in=name_constraints)
        return {rname: ID for rname, ID in query.values_list("relation_name", "id")}

def get_class_to_id_map(project_id, name_constraints=None, cursor=None):
    """
    Return a mapping of class names to relation IDs. If a list of names is
    provided, only classes with those names will be included. If a cursor is
    provided, this cursor will be used.
    """
    if cursor:
        query = "SELECT class_name, id  FROM class WHERE project_id = %s"
        params = [int(project_id)]
        if name_constraints:
            query += " AND (%s)" % ' OR '.join(('class_name = %s',) * len(name_constraints))
            params += (name_constraints)
        cursor.execute(query, params)
        return dict(cursor.fetchall())
    else:
        query = Class.objects.filter(project=project_id)
        if name_constraints:
            query = query.filter(class_name__in=name_constraints)
        return {cname: ID for cname, ID in query.values_list("class_name", "id")}

def urljoin(a, b):
    """ Joins to URL parts a and b while making sure this
    exactly one slash inbetween.
    """
    if a[-1] != '/':
        a = a + '/'
    if b[0] == '/':
        b = b[1:]
    return a + b

def id_generator(size=6, chars=string.ascii_lowercase + string.digits):
    """ Creates a random string of the specified length.
    """
    return ''.join(random.choice(chars) for x in range(size))
