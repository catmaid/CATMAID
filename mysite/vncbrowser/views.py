# Create your views here.

import sys
from models import NeuronSearch, ClassInstance
from collections import defaultdict
from django.shortcuts import render_to_response, get_object_or_404
from django.template import RequestContext
from django.db import connection, transaction
from django.http import HttpResponse, HttpResponseRedirect

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
    if neuron_id:
        n = get_object_or_404(ClassInstance, pk=neuron_id, project=project_id)
    else:
        n = get_object_or_404(ClassInstance, name=neuron_name, project=project_id)

    # FIXME:
    # l = n.lines.all()

    outgoing = group_neurons_descending_count(
        ClassInstance.all_neurons_downstream(n))
    incoming = group_neurons_descending_count(
        ClassInstance.all_neurons_upstream(n))

    return my_render_to_response(request,
                                 'vncbrowser/view.html',
                                 {'neuron': n,
                                  # 'lines': l,
                                  'lines': [],
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

def line_name(request, line_name=None):
    l = get_object_or_404(Line,name=line_name)
    return my_render_to_response(request,
                                 'vncbrowser/line.html',
                                 {'line': l})

def visual_line(request, line_name=None):
    l = get_object_or_404(Line,name=line_name)
    return my_render_to_response(request,
                                 'vncbrowser/visual_line.html',
                                 {'line': l,
                                  'sorted_neurons': l.neuron_set.all()})

def lines_add(request):
    neuron_id = request.POST['neuron_id']
    print >> sys.stderr, 'Got the neuron_id ', neuron_id
    line_name = request.POST['line_name']
    print >> sys.stderr, 'Got the line_name ', line_name
    n = get_object_or_404(Neuron,pk=neuron_id)
    l = None
    try:
        l = Line.objects.get(name=line_name)
    except Line.DoesNotExist:
        l = Line(name=line_name)
        l.save()
    n.lines.add(l)
    return HttpResponseRedirect(reverse('vncbrowser.views.view',kwargs={'neuron_id':neuron_id}))

def lines_delete(request):
    neuron_id = request.POST['neuron_id']
    line_name = request.POST['line_name']
    n = get_object_or_404(Neuron,pk=neuron_id)
    l = Line.objects.get(name=line_name)
    n.lines.remove(l)
    return HttpResponseRedirect(reverse('vncbrowser.views.view',kwargs={'neuron_id':neuron_id}))

def skeleton_swc(request, project_id=None, skeleton_id=None):
    cursor = connection.cursor()
    cursor.execute("""
SELECT t.id, (t.location).x, (t.location).y, (t.location).z, t.radius, t.parent_id
   FROM
      treenode t,
      class_instance ci,
      class c,
      relation r,
      treenode_class_instance tci
   WHERE
      ci.class_id = c.id AND
      c.class_name = 'skeleton' AND
      t.id = tci.treenode_id AND
      tci.class_instance_id = ci.id AND
      tci.relation_id = r.id AND
      r.relation_name = 'element_of' AND
      t.project_id = %s AND
      ci.id = %s
""",
                   (project_id, skeleton_id))
    all_rows = []
    for row in cursor.fetchall():
        swc_row = [row[0]]
        swc_row.append(0)
        swc_row += row[1:]
        if swc_row[-1] is None:
            swc_row[-1] = -1
        if swc_row[-2] < 0:
            swc_row[-2] = 0
        all_rows.append(swc_row)
    all_rows.sort(key=lambda x: x[0])
    result = ""
    for row in all_rows:
        result += " ".join(str(x) for x in row) + "\n"
    return HttpResponse(result, mimetype="text/plain")
