import json

from django.http import HttpResponse

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def update_textlabel(request, project_id=None, logged_in_user=None):
    params = {}
    parameter_names = ['tid', 'pid', 'x', 'y', 'z', 'text', 'type', 'r', 'g', 'b', 'a', 'fontname', 'fontstyle', 'fontsize', 'scaling']
    for p in parameter_names:
        params[p] = request.POST.get(p, None)
        # Rename params in to match model parameter names.
    params['font_name'] = params['fontname']
    params['font_style'] = params['fontstyle']
    params['font_size'] = params['fontsize']
    del params['fontname']
    del params['fontstyle']
    del params['fontsize']

    # Scaling is given 0 or 1 value by the caller, but our models use bool
    if params['scaling'] is not None:
        params['scaling'] = bool(int(params['scaling']))

    # Type must be either bubble or text.
    if params['type'] is not None:
        if (params['type'] != 'bubble'):
            params['type'] = 'text'

    response_on_error = ''
    try:
        response_on_error = 'Failed to find Textlabel with id %s.' % params['tid']
        label = Textlabel.objects.filter(id=params['tid'])[0]

        response_on_error = 'Failed to update Textlabel with id %s.' % params['tid']
        special_parameters = ['x', 'y', 'z', 'r', 'g', 'b', 'a', 'tid']
        # Set new values for label unless they haven't been specified or need
        # special handling.
        # for par in [p for p in parameter_names if p not in special_parameters]:
        for par in set(params.keys()).difference(special_parameters):
            if params[par] is not None:
                setattr(label, par, params[par])
        label.save()

        # If all parameters x, y and z have been specified, change the location
        if all([val is not None for val in [params[p] for p in ['x', 'y', 'z']]]):
            response_on_error = 'Failed to update the location of textlabel with id %s' % params['tid']
            TextlabelLocation.objects.filter(textlabel=params['tid']).update(
                location=Double3D(float(params['x']), float(params['y']), float(params['z'])))

        return HttpResponse(' ')

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def delete_textlabel(request, project_id=None, logged_in_user=None):
    textlabel_id = request.POST.get('tid', None)

    if textlabel_id is None:
        raise RollbackAndReport('No treenode id provided.')

    response_on_error = ''
    try:
        response_on_error = 'Could not delete TextlabelLocations for treenode #%s' % textlabel_id
        TextlabelLocation.objects.filter(textlabel=textlabel_id).delete()
        response_on_error = 'Could not delete Textlabels for treenode #%s' % textlabel_id
        Textlabel.objects.filter(id=textlabel_id).delete()

    except RollbackAndReport:
        raise
    except Exception as e:
        if (response_on_error == ''):
            raise RollbackAndReport(str(e))
        else:
            raise RollbackAndReport(response_on_error)

    return HttpResponse(json.dumps({'message': 'Success.'}))


@catmaid_can_edit_project
@transaction_reportable_commit_on_success
def create_textlabel(request, project_id=None, logged_in_user=None):
    params = {}
    param_defaults = {
        'x': 0,
        'y': 0,
        'z': 0,
        'text': 'Edit this text...',
        'type': 'text',
        'r': 1,
        'g': 0.5,
        'b': 0,
        'a': 1,
        'fontname': False,
        'fontstyle': False,
        'fontsize': False,
        'scaling': False}
    for p in param_defaults.keys():
        params[p] = request.POST.get(p, param_defaults[p])
    if (params['type'] != 'bubble'):
        params['type'] = 'text'

    new_label = Textlabel(
        text=params['text'],
        type=params['type'],
        scaling=params['scaling']
    )
    new_label.project_id = project_id
    if params['fontname']:
        new_label.font_name = params['fontname']
    if params['fontstyle']:
        new_label.font_style = params['fontstyle']
    if params['fontsize']:
        new_label.font_size = params['fontsize']
    new_label.save()

    TextlabelLocation(
        textlabel=new_label,
        location=Double3D(float(params['x']), float(params['y']), float(params['z']))).save()

    return HttpResponse(json.dumps({'tid': new_label.id}))
