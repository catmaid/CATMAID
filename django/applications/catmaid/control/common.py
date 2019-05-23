# -*- coding: utf-8 -*-

import json
import random
import requests
import string

from typing import Any, DefaultDict, Dict, List, Optional, Set, Tuple, Union

from collections import defaultdict

from django.conf import settings
from django.http import HttpRequest, JsonResponse

from catmaid.fields import Double3D
from catmaid.models import Log, NeuronSearch, CELL_BODY_CHOICES, \
        SORT_ORDERS_DICT, Relation, Class, ClassInstance, \
        ClassInstanceClassInstance


class ConfigurationError(Exception):
    """Indicates some sort of configuration error"""
    def __init__(self, message):
        super(ConfigurationError, self).__init__(message)


def identity(x:Any) -> Any:
    """Simple identity."""
    return x

def get_catmaid_version(request:HttpRequest) -> JsonResponse:
    return JsonResponse({'SERVER_VERSION': settings.VERSION})

class parsedict(dict):
    """This is a simple wrapper, needed primarily by the request list
    parser.
    """
    pass

def get_request_bool(request_dict:Dict, name:Optional[str], default:Optional[bool]=None) -> Optional[bool]:
    """Extract a boolean value for the passed in parameter name in the passed
    in dictionary. The boolean paramter is expected to be a string and True is
    returned if it matches the string "true" (case-insensitive), False otherwise.

    If the name may not be present in the dictionary, caller must provide a default
    value or the return value will be None rather than boolean.
    """
    value = request_dict.get(name)
    return default if value is None else value.lower() == 'true'

def get_request_list(request_dict:Dict, name, default=None, map_fn=identity) -> Optional[List]:
    """Look for a list in a request dictionary where individual items are named
    with or without an index. Traditionally, the CATMAID web front-end sends
    the list a = [1,2,3] encoded as fields a[0]=1, a[1]=2 and a[2]=3. Using
    other APIs, like jQuery's $.ajax, will encode the same list as a=1, a=2,
    a=3. This method helps to parse both transparently.
    """

    def flatten(d, max_index:int) -> List[List]:
        """Flatten a dict of dicts into lists of lists. Expect all keys to be
        integers.

        Providing a proper type for "d" here in a way that mypy is happy is nontrivial.
        """
        k = []
        for i in range(max_index):
            v = d.get(i)
            if not v and v != 0:
                continue
            if parsedict == type(v):
                k.append(flatten(v, max_index))
            else:
                k.append(v)
        return k

    def add_items(items, name) -> List[List]:
        d = parsedict()
        max_index = -1
        testname = name + '['
        namelen = len(testname)
        for k,v in items:
            if k.startswith(testname):
                # name[0][0] -> 0][0
                index_part = k[namelen:len(k)-1]
                # If there is no index part, the key format is "name[]=a,b,c"
                # for each entry.
                if len(index_part) == 0:
                    for single_value in v.split(','):
                        max_index += 1
                        d[max_index] = map_fn(single_value)
                else:
                    indices = index_part.split('][')
                    target = d
                    # Fill in all but last index
                    for i in indices[:-1]:
                        key = int(i)
                        new_target = target.get(key)
                        if (key > max_index):
                            max_index = key
                        if not new_target:
                            new_target = parsedict()
                            target[key] = new_target
                        target = new_target

                    last_index = int(indices[-1])
                    target[last_index] = map_fn(v)

                    if (last_index > max_index):
                        max_index = last_index
        return flatten(d, max_index + 1)

    items = add_items(request_dict.items(), name)
    if items:
        return items

    if hasattr(request_dict, 'getlist'):
        items = [map_fn(v) for v in request_dict.getlist(name, [])] # type: ignore
        if items:
            return items

    return default

def _create_relation(user, project_id:Union[int,str], relation_id, instance_a_id, instance_b_id) -> ClassInstanceClassInstance:
    relation = ClassInstanceClassInstance()
    relation.user = user
    relation.project_id = project_id
    relation.relation_id = relation_id
    relation.class_instance_a_id = instance_a_id
    relation.class_instance_b_id = instance_b_id
    relation.save()
    return relation

def insert_into_log(project_id:Union[int, str], user_id, op_type:str, location=None, freetext=None) -> Optional[Dict[str, str]]:
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
    if location is not None:
        new_log.location = Double3D(*location)
    if freetext is not None:
        new_log.freetext = freetext

    new_log.save()
    return None

def json_error_response(message:str) -> JsonResponse:
    """
    When an operation fails we should return a JSON dictionary
    with the key 'error' set to an error message.  This is a
    helper method to return such a structure:
    """
    return JsonResponse({'error': message})


def order_neurons(neurons:List, order_by=None):
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


def get_form_and_neurons(request:HttpRequest, project_id:Union[int,str], kwargs) -> Tuple[List, NeuronSearch]:
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

    neuron_id_to_driver_lines = defaultdict(list) # type: DefaultDict[Any, List]

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
def makeJSON_legacy_list(objects) -> Dict:
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

def cursor_fetch_dictionary(cursor) -> List[Dict]:
    "Returns all rows from a cursor as a dict"
    desc = cursor.description
    return [
            dict(zip([col[0] for col in desc], row))
            for row in cursor.fetchall()
            ]

def get_relation_to_id_map(project_id:Union[int,str], name_constraints=None, cursor=None) -> Dict:
    """
    Return a mapping of relation names to relation IDs. If a list of names is
    provided, only relations with those names will be included. If a cursor is
    provided, this cursor will be used.
    """
    if cursor:
        sqlquery = "SELECT relation_name, id  FROM relation WHERE project_id = %s"
        params = [int(project_id)]
        if name_constraints:
            sqlquery += " AND (%s)" % ' OR '.join(('relation_name = %s',) * len(name_constraints))
            params += (name_constraints)
        cursor.execute(sqlquery, params)
        return dict(cursor.fetchall())
    else:
        query = Relation.objects.filter(project=project_id)
        if name_constraints:
            query = query.filter(relation_name__in=name_constraints)
        return {rname: ID for rname, ID in query.values_list("relation_name", "id")}

def get_class_to_id_map(project_id:Union[int,str], name_constraints=None, cursor=None) -> Dict:
    """
    Return a mapping of class names to relation IDs. If a list of names is
    provided, only classes with those names will be included. If a cursor is
    provided, this cursor will be used.
    """
    if cursor:
        sqlquery = "SELECT class_name, id  FROM class WHERE project_id = %s"
        params = [int(project_id)]
        if name_constraints:
            sqlquery += " AND (%s)" % ' OR '.join(('class_name = %s',) * len(name_constraints))
            params += (name_constraints)
        cursor.execute(sqlquery, params)
        return dict(cursor.fetchall())
    else:
        query = Class.objects.filter(project=project_id)
        if name_constraints:
            query = query.filter(class_name__in=name_constraints)
        return {cname: ID for cname, ID in query.values_list("class_name", "id")}

def urljoin(a:str, b:str) -> str:
    """ Joins to URL parts a and b while making sure this
    exactly one slash inbetween. Empty strings are ignored.
    """
    if a and a[-1] != '/':
        a = a + '/'
    if b and b[0] == '/':
        b = b[1:]
    return a + b

def id_generator(size:int=6, chars:str=string.ascii_lowercase + string.digits) -> str:
    """ Creates a random string of the specified length.
    """
    return ''.join(random.choice(chars) for x in range(size))


class Echo:
    """An object that implements just the write method of the file-like
    interface. From:
    https://docs.djangoproject.com/en/1.11/howto/outputting-csv/
    """
    def write(self, value):
        """Write the value by returning it, instead of storing in a buffer."""
        return value


def is_reachable(url:str, auth=None) -> Tuple[bool, str]:
    """Test if an URL is reachable. Returns a tuple of a boolean and an explanation.
    """
    try:
        r = requests.head(url, auth=auth)
        if r.status_code >= 200 and r.status_code < 400:
            return (True, 'URL accessible')
        else:
            return (False, r.reason)
    except requests.ConnectionError:
        return (False, 'No route to host')


def is_valid_host(host:str, auth=None) -> Tuple[bool, str]:
    """Test if the passed in string is a valid URI. Returns a tuple of a boolean and an explanation
    """
    host = host.strip()
    if 0 == len(host):
        return (False, 'No URL provided')
    if '://' not in host:
        return (False, 'URL is missing protocol (http://...)')
    reachable, reason = is_reachable(host, auth)
    if not reachable:
        return (False, 'URL not reachable: {}'.format(reason))
    return (True, "Ok")
