from django.db import models
from django.conf import settings
from django.core.paginator import Paginator, EmptyPage, InvalidPage
from django.core.urlresolvers import reverse
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.contrib.auth.decorators import login_required

from catmaid.models import CELL_BODY_CHOICES, \
    ClassInstanceClassInstance, Relation, Class, ClassInstance, \
    Project, User, Treenode, TreenodeConnector, Connector, Stack, ProjectStack, \
    TreenodeClassInstance, ConnectorClassInstance, Location, ProjectUser, Overlay, \
    BrokenSlice

from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

import urllib

try:
    import networkx as nx
    from networkx.readwrite import json_graph
    import Image
except ImportError:
    pass

def findBrackets( aString ):
    if '[' in aString:
        match = aString.split('[',1)[1]
        open = 1
        for index in xrange(len(match)):
            if match[index] in '[]':
                open = (open + 1) if match[index] == '[' else (open - 1)
            if not open:
                return match[:index]

@login_required
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

@login_required
def visual_index(request, **kwargs):

    all_neurons, search_form = get_form_and_neurons( request,
                                                     kwargs['project_id'],
                                                     kwargs )

    # From: http://docs.djangoproject.com/en/1.0/topics/pagination/
    paginator = Paginator(all_neurons, 5)
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



@login_required
def view(request, project_id=None, neuron_id=None, neuron_name=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)
    # FIXME: add the class name as well
    if neuron_id:
        n = get_object_or_404(ClassInstance, pk=neuron_id, project=project_id)
    else:
        n = get_object_or_404(ClassInstance, name=neuron_name, project=project_id)

    lines = ClassInstance.objects.filter(
        project=p,
        cici_via_a__class_instance_b=n,
        cici_via_a__relation__relation_name='expresses_in').all()

    skeletons = ClassInstance.objects.filter(
        project=p,
        cici_via_a__relation__relation_name='model_of',
        class_column__class_name='skeleton',
        cici_via_a__class_instance_b=n)

    outgoing = n.all_neurons_downstream(project_id, skeletons)
    incoming = n.all_neurons_upstream(project_id, skeletons)

    outgoing = [x for x in outgoing if not x['name'].startswith('orphaned ')]
    incoming = [x for x in incoming if not x['name'].startswith('orphaned ')]

    return my_render_to_response(request,
                                 'vncbrowser/view.html',
                                 {'neuron': n,
                                  'neuron_class': findBrackets( n.name ),
                                  'lines': lines,
                                  'skeletons': skeletons,
                                  'project_id': project_id,
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': logged_in_user,
                                  'cell_body_choices': CELL_BODY_CHOICES,
                                  'incoming': incoming,
                                  'outgoing': outgoing,
                                  'wiki_base_url': p.wiki_base_url } )

@login_required
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

@login_required
def line(request, project_id=None, line_id=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)
    l = get_object_or_404(ClassInstance, pk=line_id, project=p, class_column__class_name='driver_line')
    sorted_neurons = ClassInstance.objects.filter(
        cici_via_b__relation__relation_name='expresses_in',
        cici_via_b__class_instance_a=l).order_by('name')
    return my_render_to_response(request,
                                 'vncbrowser/line.html',
                                 {'line': l,
                                  'project_id': p.id,
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': logged_in_user,
                                  'neurons': sorted_neurons})

@login_required
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

@login_required
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



@login_required
def multiple_presynaptic_terminals(request, project_id=None, logged_in_user=None):
    p = get_object_or_404(Project, pk=project_id)

    tcs = TreenodeConnector.objects.filter(project__id=project_id, relation__relation_name='presynaptic_to').values('connector').annotate(number=models.Count('connector')).filter(number__gt=1)
    return my_render_to_response(request,
                                 'vncbrowser/multiple_presynaptic_terminals.html',
                                 {'project_id': p.id,
                                  'catmaid_url': settings.CATMAID_URL,
                                  'user': logged_in_user,
                                  'stacks': p.stacks.all(),
                                  'connector_counts': tcs})

@login_required
def goto_connector(request, project_id=None, connector_id=None, stack_id=None, logged_in_user=None):
    c = get_object_or_404(Connector, pk=connector_id)
    parameters = {"pid": project_id,
                  "zp": c.location.z,
                  "yp": c.location.y,
                  "xp": c.location.x,
                  "tool": "tracingtool",
                  "sid0": stack_id,
                  "s0" : 0}
    return HttpResponseRedirect(settings.CATMAID_URL + "?" + urllib.urlencode(parameters))
