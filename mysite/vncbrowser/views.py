import sys
import json
from models import NeuronSearch, ClassInstance, Project, User, Treenode
from models import ClassInstanceClassInstance, Relation, Class
from collections import defaultdict
from django.shortcuts import render_to_response, get_object_or_404
from django.template import RequestContext
from django.db import connection, transaction
from django.http import HttpResponse, HttpResponseRedirect
from django.core.urlresolvers import reverse
from django.views.generic import DetailView

# Tip from: http://lincolnloop.com/blog/2008/may/10/getting-requestcontext-your-templates/
# Required because we need a RequestContext, not just a Context - the
# former looks at TEMPLATE_CONTEXT_PROCESSORS, while the latter doesn't.

def my_render_to_response(req, *args, **kwargs):
    kwargs['context_instance'] = RequestContext(req)
    return render_to_response(*args, **kwargs)

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
        kw_cell_body_choice = kwargs.get('cell_body_location',None) or "-1"
        kw_order_by = kwargs.get('order_by',None) or 'name'
        search_form = NeuronSearch({'search': kw_search,
                                    'cell_body_location': kw_cell_body_choice,
                                    'order_by': kw_order_by })
    elif request.method == 'POST':
        search_form = NeuronSearch(request.POST)
    else:
        search_form = NeuronSearch({'search': '',
                                    'cell_body_location': -1,
                                    'order_by': 'name'})

    if search_form.is_valid():
        search = search_form.cleaned_data['search']
        cell_body_location = int(search_form.cleaned_data['cell_body_location'])
        order_by = search_form.cleaned_data['order_by']
    else:
        search = ''
        cell_body_location = -1
        order_by = 'name'

    all_neurons = Neuron.objects.filter(name__icontains=search)
    if cell_body_location >= 0:
        all_neurons = all_neurons.filter(cell_body=cell_body_location)
    all_neurons = order_neuron_queryset(all_neurons,order_by)
    return ( all_neurons, search_form )

def index(request, **kwargs):
    all_neurons, search_form = get_form_and_neurons(request,
                                                    kwargs['project_id'],
                                                    kwargs)
    return my_render_to_response(request,
                                 'vncbrowser/index.html',
                                 {'all_neurons_list': all_neurons,
                                  'search_form': search_form})

def visual_index(request, **kwargs):

    all_neurons, search_form = get_form_and_neurons( request, kwargs )

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
                                 {'sorted_neurons': neurons.object_list.all(),
                                  'sorted_neurons_page' : neurons,
                                  'search_form': search_form })

def group_neurons_descending_count(neurons):
    id_to_neurons = defaultdict(set)
    for neuron in neurons:
        id_to_neurons[neuron.id].add(neuron)
    reverse_sorted = sorted(id_to_neurons.items(),
                            key=lambda x: -len(id_to_neurons[x[0]]))
    result = []
    for neuron_id, neurons in reverse_sorted:
        count = len(neurons)
        neuron = list(neurons)[0]
        neuron.count = count
        result.append(neuron)
    return result

def view(request, project_id=None, neuron_id=None, neuron_name=None):
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

    outgoing = group_neurons_descending_count(
        ClassInstance.all_neurons_downstream(n))
    incoming = group_neurons_descending_count(
        ClassInstance.all_neurons_upstream(n))

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
                                  'incoming': incoming,
                                  'outgoing': outgoing} )

def set_cell_body(request):
    neuron_id = request.POST['neuron_id']
    n = get_object_or_404(Neuron,pk=neuron_id)
    cell_body_location = int(request.POST['cell-body-choice'])
    if cell_body_location in (x[0] for x in Neuron.CELL_BODY_CHOICES):
        n.cell_body = cell_body_location
        n.save()
    return HttpResponseRedirect(reverse('vncbrowser.views.view',kwargs={'neuron_id':neuron_id}))

def line(request, project_id=None, line_id=None):
    p = get_object_or_404(Project, pk=project_id)
    l = get_object_or_404(ClassInstance, pk=line_id, project=p, class_column__class_name='driver_line')
    sorted_neurons = ClassInstance.objects.filter(
        class_instances_b__relation__relation_name='expresses_in',
        class_instances_b__class_instance_a=l).order_by('name')
    return my_render_to_response(request,
                                 'vncbrowser/line.html',
                                 {'line': l,
                                  'project_id': p.id,
                                  'neurons': sorted_neurons})

class LineDetailView(DetailView):
    model = ClassInstance
    template_name='vncbrowser/jennyline.html'
    context_object_name = 'line'
    def get_context_data(self, **kwargs):
        context = super(LineDetailView, self).get_context_data(**kwargs)
        context['neurons'] = ClassInstance.objects.filter(
            class_instances_b__relation__relation_name='expresses_in',
            class_instances_b__class_instance_a=self.object).order_by('name')
        return context

def visual_line(request, line_name=None):
    l = get_object_or_404(Line,name=line_name)
    return my_render_to_response(request,
                                 'vncbrowser/visual_line.html',
                                 {'line': l,
                                  'sorted_neurons': l.neuron_set.all()})

def lines_add(request, project_id=None):
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
        line.class_column = Class.objects.get(class_name='driver_line')
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

def lines_delete(request, project_id=None):
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

def skeleton_swc(request, project_id=None, skeleton_id=None):
    p = Project.objects.get(pk=project_id)
    skeleton = get_object_or_404(ClassInstance,
                                 pk=skeleton_id,
                                 class_column__class_name='skeleton',
                                 project=p)
    qs = Treenode.objects.filter(
        treenodeclassinstance__class_instance=skeleton).order_by('id')

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
    all_rows.sort(key=lambda x: x[0])
    result = ""
    for row in all_rows:
        result += " ".join(str(x) for x in row) + "\n"
    return HttpResponse(result, mimetype="text/plain")

def neuron_to_skeletons(request, project_id=None, neuron_id=None):
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
