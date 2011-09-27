# Create your views here.

from models import Class

# Both index and visual_index take a request and kwargs and then
# return a list of neurons and a NeuronSearch form:

def get_form_and_neurons( request, kwargs ):
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
    all_neurons, search_form = get_form_and_neurons(request,kwargs)
    return my_render_to_response(request,
                                 'vncbrowser/index.html',
                                 {'all_neurons_list': all_neurons,
                                  'search_form': search_form})
