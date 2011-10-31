import sys
import json
import re
from models import NeuronSearch, ClassInstance, Project, User, Treenode
from models import ClassInstanceClassInstance, Relation, Class, Session
from models import Stack, TreenodeClassInstance, ConnectorClassInstance
from models import CELL_BODY_CHOICES, SORT_ORDERS_DICT
from collections import defaultdict
from django.shortcuts import render_to_response, get_object_or_404
from django.template import RequestContext
from django.db import connection, transaction
from django.http import HttpResponse, HttpResponseRedirect, Http404
from django.core.urlresolvers import reverse
from django.views.generic import DetailView
from django.core.paginator import Paginator
from django.conf import settings
import urllib

# Tip from: http://lincolnloop.com/blog/2008/may/10/getting-requestcontext-your-templates/
# Required because we need a RequestContext, not just a Context - the
# former looks at TEMPLATE_CONTEXT_PROCESSORS, while the latter doesn't.

def my_render_to_response(req, *args, **kwargs):
    kwargs['context_instance'] = RequestContext(req)
    return render_to_response(*args, **kwargs)

def order_neurons( neurons, order_by = None ):
    column, reverse = 'name', False
    if order_by and (order_by in SORT_ORDERS_DICT):
        column, reverse, long_name = SORT_ORDERS_DICT[order_by]
        if column == 'name':
            neurons.sort(key=lambda x: x.name)
        elif column == 'gal4':
            neurons.sort(key=lambda x: x.cached_sorted_lines_str)
        elif column == 'cell_body':
            neurons.sort(key=lambda x: x.cached_cell_body)
        else:
            raise Exception, "Unknown column (%s) in order_neurons" % (column,)
        if reverse:
            neurons.reverse()
    return neurons

import hashlib

def login(request):
    return my_render_to_response(request,
                                 'vncbrowser/login.html',
                                {'return_url': request.GET.get('return_url', '/'),
                                 'project_id': 0,
                                 'catmaid_url': settings.CATMAID_URL,
                                 'catmaid_login': settings.CATMAID_URL+'model/login.php'})

def redirect_to_login(return_url):
    return HttpResponseRedirect(
        reverse('vncbrowser.views.login')+"?return_url="+urllib.quote(return_url,''))

# Note that this method does not work in general - there could be
# ';'s within a string, for example.  However, it is sufficient
# for parsing the data that we know may be in CATMAID sessions.  I
# think that one is supposed to be able to deserialize that with
# the phpserialize module, but in practice that always fails -
# perhaps this field is in some different format.  And example of
# this field would be:
# u'id|s:1:"5";key|s:54:"7gtmcy8g03457xg3hmuxdgregtyu45ty57ycturemuzm934etmvo56";'
def parse_php_session_data(s):
    result = {}
    for kv in s.split(';'):
        if not kv:
            continue
        m = re.match('^(.*?)\|(.*)',kv)
        if not m:
            raise Exception, "Failed to parse the PHP session key / value pair: " + kv
        k, v = m.groups()
        m = re.match('^s:(\d+):"(.*)"$', v)
        if not m:
            raise Exception, "Failed to parse a PHP session value: " + v
        length = int(m.group(1), 10)
        value_string = m.group(2)
        if length != len(value_string):
            raise Exception, "The string length in a PHP session value was wrong"
        result[k] = value_string
    return result

def valid_catmaid_login(request):
    if 'PHPSESSID' not in request.COOKIES:
        return None
    phpsessid = request.COOKIES['PHPSESSID']
    try:
        s = Session.objects.get(session_id=phpsessid)
    except Session.DoesNotExist:
        return None
    parsed_session_data = parse_php_session_data(s.data)
    if 'id' not in parsed_session_data:
        return None
    user_id = parsed_session_data['id']
    try:
       u = User.objects.get(pk=int(user_id, 10))
    except User.DoesNotExist:
        return None
    except ValueError:
        raise Exception, "There was a strange value in the 'id' field: '%s'" % (user_id,)
    if 'key' not in parsed_session_data:
        return None
    if parsed_session_data['key'] != '7gtmcy8g03457xg3hmuxdgregtyu45ty57ycturemuzm934etmvo56':
        return None
    return u

# A decorator that will check that the user is logged into CATMAID,
# and if not, redirect to the login page.  If the user is logged in,
# the keyword argument 'logged_in_user' is set to to the corresponding
# User object.
def catmaid_login_required(f):

    def decorated_with_catmaid_login_required(request, *args, **kwargs):
        u = valid_catmaid_login(request)
        if u:
            kwargs['logged_in_user'] = u
            return f(request, *args, **kwargs)
        else:
            return redirect_to_login(request.get_full_path())

    return decorated_with_catmaid_login_required

# A decorator that will check whether the user is logged into CATMAID;
# if so, sets the keywords argument 'logged_in_user' to a User object
# and if not, sets it to None:
def catmaid_login_optional(f):

    def decorated_with_catmaid_login_optional(request, *args, **kwargs):
        kwargs['logged_in_user'] = valid_catmaid_login(request)
        return f(request, *args, **kwargs)

    return decorated_with_catmaid_login_optional

# Both index and visual_index take a request and kwargs and then
# return a list of neurons and a NeuronSearch form:

def get_form_and_neurons(request, project_id, kwargs):
    # If we've been passed parameters in a REST-style GET request,
    # create a form from them.  Otherwise, if it's a POST request,
    # create the form from the POST parameters.  Otherwise, it's a
    # plain request, so create the default search form.
    rest_keys = ('search','cell_body_location','order_by')
    if any((x in kwargs) for x in rest_keys):
        kw_search = kwargs.get('search',None) or ""
        kw_cell_body_choice = kwargs.get('cell_body_location',None) or "a"
        kw_order_by = kwargs.get('order_by',None) or 'name'
        search_form = NeuronSearch({'search': kw_search,
                                    'cell_body_location': kw_cell_body_choice,
                                    'order_by': kw_order_by })
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
            class_instances_a__relation__relation_name='has_cell_body',
            class_instances_a__class_instance_b__name=location)

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

@catmaid_login_required
def index(request, **kwargs):
    all_neurons, search_form = get_form_and_neurons(request,
                                                    kwargs['project_id'],
                                                    kwargs)
    return my_render_to_response(request,
                                 'vncbrowser/index.html',
                                 {'all_neurons_list': all_neurons,
                                  'project_id': kwargs['project_id'],
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': kwargs['logged_in_user'],
                                  'search_form': search_form})

@catmaid_login_required
def visual_index(request, **kwargs):

    all_neurons, search_form = get_form_and_neurons( request,
                                                     kwargs['project_id'],
                                                     kwargs )

    # From: http://docs.djangoproject.com/en/1.0/topics/pagination/
    paginator = Paginator(all_neurons, 20)
    if 'page' in kwargs:
        page = kwargs['page'] or 1
    else:
        try:
            page = int(request.GET.get('page', '1'))
        except ValueError:
            page = 1

    # If page request (9999) is out of range, deliver last page of results.
    try:
        neurons = paginator.page(page)
    except (EmptyPage, InvalidPage):
        neurons = paginator.page(paginator.num_pages)

    return my_render_to_response(request,
                                 'vncbrowser/visual_index.html',
                                 {'sorted_neurons': neurons.object_list,
                                  'sorted_neurons_page' : neurons,
                                  'project_id': kwargs['project_id'],
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': kwargs['logged_in_user'],
                                  'search_form': search_form })

@catmaid_login_required
def view(request, project_id=None, neuron_id=None, neuron_name=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)
    # FIXME: add the class name as well
    if neuron_id:
        n = get_object_or_404(ClassInstance, pk=neuron_id, project=project_id)
    else:
        n = get_object_or_404(ClassInstance, name=neuron_name, project=project_id)

    lines = ClassInstance.objects.filter(
        project=p,
        class_instances_a__class_instance_b=n,
        class_instances_a__relation__relation_name='expresses_in').all()

    outgoing = n.all_neurons_downstream(project_id)
    incoming = n.all_neurons_upstream(project_id)

    outgoing = [x for x in outgoing if not re.match('orphaned (pre|post)$', x['name'])]
    incoming = [x for x in incoming if not re.match('orphaned (pre|post)$', x['name'])]

    skeletons = ClassInstance.objects.filter(
        project=p,
        class_instances_a__relation__relation_name='model_of',
        class_column__class_name='skeleton',
        class_instances_a__class_instance_b=n)

    return my_render_to_response(request,
                                 'vncbrowser/view.html',
                                 {'neuron': n,
                                  'lines': lines,
                                  'skeletons': skeletons,
                                  'project_id': project_id,
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': logged_in_user,
                                  'cell_body_choices': CELL_BODY_CHOICES,
                                  'incoming': incoming,
                                  'outgoing': outgoing} )

@catmaid_login_required
def set_cell_body(request, logged_in_user=None):
    neuron_id = request.POST['neuron_id']
    n = get_object_or_404(ClassInstance, pk=neuron_id)
    new_location_code = request.POST['cell-body-choice']
    choices_dict = dict(CELL_BODY_CHOICES)
    if new_location_code not in choices_dict:
        raise Exception, "Unknown cell body location: "+str(new_location_code)
    new_location = choices_dict[new_location_code]
    n.set_cell_body_location(new_location)
    return HttpResponseRedirect(reverse('vncbrowser.views.view',
                                        kwargs={'neuron_id':neuron_id,
                                                'project_id':n.project.id}))

@catmaid_login_required
def line(request, project_id=None, line_id=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)
    l = get_object_or_404(ClassInstance, pk=line_id, project=p, class_column__class_name='driver_line')
    sorted_neurons = ClassInstance.objects.filter(
        class_instances_b__relation__relation_name='expresses_in',
        class_instances_b__class_instance_a=l).order_by('name')
    return my_render_to_response(request,
                                 'vncbrowser/line.html',
                                 {'line': l,
                                  'project_id': p.id,
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': logged_in_user,
                                  'neurons': sorted_neurons})

@catmaid_login_required
def visual_line(request, line_name=None, logged_in_user=None):
    l = get_object_or_404(Line,name=line_name)
    return my_render_to_response(request,
                                 'vncbrowser/visual_line.html',
                                 {'line': l,
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': logged_in_user,
                                  'sorted_neurons': l.neuron_set.all()})

@catmaid_login_required
def lines_add(request, project_id=None, logged_in_user=None):
    p = Project.objects.get(pk=project_id)
    # FIXME: for the moment, just hardcode the user ID:
    user = User.objects.get(pk=3)
    neuron = get_object_or_404(ClassInstance,
                               pk=request.POST['neuron_id'],
                               project=p)

    # There's a race condition here, if two people try to add a line
    # with the same name at the same time.  The normal way to deal
    # with this would be to make the `name` column unique in the
    # table, but since the class_instance table isn't just for driver
    # lines, we can't do that.  (FIXME)
    try:
        line = ClassInstance.objects.get(name=request.POST['line_name'])
    except ClassInstance.DoesNotExist:
        line = ClassInstance()
        line.name=request.POST['line_name']
        line.project = p
        line.user = user
        line.class_column = Class.objects.get(class_name='driver_line', project=p)
        line.save()

    r = Relation.objects.get(relation_name='expresses_in', project=p)

    cici = ClassInstanceClassInstance()
    cici.class_instance_a = line
    cici.class_instance_b = neuron
    cici.relation = r
    cici.user = user
    cici.project = p
    cici.save()

    return HttpResponseRedirect(reverse('vncbrowser.views.view',
                                        kwargs={'neuron_id':neuron.id,
                                                'project_id':p.id}))

@catmaid_login_required
def lines_delete(request, project_id=None, logged_in_user=None):
    p = Project.objects.get(pk=project_id)
    neuron = get_object_or_404(ClassInstance,
                               pk=request.POST['neuron_id'],
                               project=p)

    r = Relation.objects.get(relation_name='expresses_in', project=p)

    ClassInstanceClassInstance.objects.filter(relation=r,
                                              project=p,
                                              class_instance_a__name=request.POST['line_name'],
                                              class_instance_b=neuron).delete()
    return HttpResponseRedirect(reverse('vncbrowser.views.view',
                                        kwargs={'neuron_id':neuron.id,
                                                'project_id':p.id}))

@catmaid_login_required
def skeleton_swc(request, project_id=None, skeleton_id=None, logged_in_user=None):
    qs = Treenode.objects.filter(
        treenodeclassinstance__class_instance__id=skeleton_id,
        treenodeclassinstance__relation__relation_name='element_of',
        treenodeclassinstance__class_instance__class_column__class_name='skeleton',
        project=project_id).order_by('id')
    all_rows = []
    for tn in qs:
        swc_row = [tn.id]
        swc_row.append(0)
        swc_row.append(tn.location.x)
        swc_row.append(tn.location.y)
        swc_row.append(tn.location.z)
        swc_row.append(max(tn.radius, 0))
        swc_row.append(-1 if tn.parent is None else tn.parent.id)
        all_rows.append(swc_row)
    result = ""
    for row in all_rows:
        result += " ".join(str(x) for x in row) + "\n"
    return HttpResponse(result, mimetype="text/plain")

@catmaid_login_required
def neuron_to_skeletons(request, project_id=None, neuron_id=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)
    neuron = get_object_or_404(ClassInstance,
                               pk=neuron_id,
                               class_column__class_name='neuron',
                               project=p)
    qs = ClassInstance.objects.filter(
        project=p,
        class_instances_a__relation__relation_name='model_of',
        class_instances_a__class_instance_b=neuron)
    return HttpResponse(json.dumps([x.id for x in qs]), mimetype="text/json")

@catmaid_login_optional
def projects(request, logged_in_user=None):
    # This is somewhat ridiculous - four queries where one could be
    # used in raw SQL.  The problem here is chiefly that
    # 'select_related' in Django doesn't work through
    # ManyToManyFields.  Development versions of Django have
    # introduced prefetch_related, but this isn't in the stable
    # version that I'm using.  (Another way around this would be to
    # query on ProjectStack, but the legacy CATMAID schema doesn't
    # include a single-column primary key for that table.)

    stacks = dict((x.id, x) for x in Stack.objects.all())

    # Create a dictionary that maps from projects to stacks:
    c = connection.cursor()
    c.execute("SELECT project_id, stack_id FROM project_stack")
    project_to_stacks = defaultdict(list)
    for project_id, stack_id in c.fetchall():
        project_to_stacks[project_id].append(stacks[stack_id])

    # Find all the projects, and mark those that are editable from the
    # project_user table:
    if logged_in_user:
        projects = Project.objects.all()
        c.execute("SELECT project_id FROM project_user WHERE user_id = %s",
                  [logged_in_user.id])
        editable_projects = set(x[0] for x in c.fetchall())
    else:
        projects = Project.objects.filter(public=True)
        editable_projects = set([])

    # Find all the projects that are editable:
    catalogueable_projects = set(x.project.id for x in Class.objects.filter(class_name='driver_line').select_related('project'))

    # Create a dictionary with those results that we can output as JSON:
    result = {}
    for p in projects:
        if p.id not in project_to_stacks:
            continue
        stacks_dict = {}
        for s in project_to_stacks[p.id]:
            stacks_dict[s.id] = {
                'title': s.title,
                'comment': s.comment,
                'note': '',
                'action': 'javascript:openProjectStack(%d,%d)' % (p.id, s.id)}
        editable = p.id in editable_projects
        result[p.id] = {
            'title': p.title,
            'public_project': int(p.public),
            'editable': int(editable),
            'catalogue': int(p.id in catalogueable_projects),
            'note': '[ editable ]' if editable else '',
            'action': stacks_dict}
    return HttpResponse(json.dumps(result, sort_keys=True, indent=4), mimetype="text/json")

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
