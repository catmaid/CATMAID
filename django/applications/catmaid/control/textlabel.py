# -*- coding: utf-8 -*-

import json
import sys

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.db import connection

from catmaid.models import UserRole, Textlabel, TextlabelLocation
from catmaid.fields import Double3D
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import cursor_fetch_dictionary, makeJSON_legacy_list

@requires_user_role(UserRole.Annotate)
def update_textlabel(request:HttpRequest, project_id=None) -> HttpResponse:
    params = {}
    parameter_names = ['tid', 'pid', 'x', 'y', 'z', 'text', 'type', 'r', 'g', 'b', 'a', 'font_name', 'font_style', 'font_size', 'scaling']
    for p in parameter_names:
        params[p] = request.POST.get(p, None)

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

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))


@requires_user_role(UserRole.Annotate)
def delete_textlabel(request:HttpRequest, project_id=None) -> JsonResponse:
    textlabel_id = request.POST.get('tid', None)

    if textlabel_id is None:
        raise Exception('No treenode id provided.')

    response_on_error = ''
    try:
        response_on_error = 'Could not delete TextlabelLocations for treenode #%s' % textlabel_id
        TextlabelLocation.objects.filter(textlabel=textlabel_id).delete()
        response_on_error = 'Could not delete Textlabels for treenode #%s' % textlabel_id
        Textlabel.objects.filter(id=textlabel_id).delete()

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))

    return JsonResponse({'message': 'Success.'})


@requires_user_role(UserRole.Annotate)
def create_textlabel(request:HttpRequest, project_id=None) -> JsonResponse:
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
        'font_name': False,
        'font_style': False,
        'font_size': False,
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
    if params['font_name']:
        new_label.font_name = params['font_name']
    if params['font_style']:
        new_label.font_style = params['font_style']
    if params['font_size']:
        new_label.font_size = params['font_size']
    new_label.save()

    TextlabelLocation(
        textlabel=new_label,
        location=Double3D(float(params['x']), float(params['y']), float(params['z']))).save()

    return JsonResponse({'tid': new_label.id})

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def textlabels(request:HttpRequest, project_id=None) -> JsonResponse:
    params = {'pid': project_id, 'uid': request.user.id}
    parameter_names = ['sid', 'z', 'top', 'left', 'width', 'height', 'scale', 'resolution']
    for p in parameter_names:
        if p in ['pid', 'sid']:
            params[p] = int(request.POST.get(p, 0))
        elif p in ['scale', 'resolution']:
            params[p] = float(request.POST.get(p, 1))
        else:
            params[p] = float(request.POST.get(p, 0))

    params['right'] = params['left'] + params['width']
    params['bottom'] = params['top'] + params['height']
    params['scale_div_res'] = params['scale'] / params['resolution']

    response_on_error = ''
    try:
        response_on_error = 'Could not retrieve textlabels.'
        c = connection.cursor()
        c.execute('''
        SELECT	DISTINCT ON ( "tid" ) "textlabel"."id" AS "tid",
        "textlabel"."type" AS "type",
                        "textlabel"."text" AS "text",
                        "textlabel"."font_name" AS "font_name",
                        "textlabel"."font_style" AS "font_style",
                        "textlabel"."font_size" AS "font_size",
                        "textlabel"."scaling" AS "scaling",
                        floor(255*("textlabel"."colour")."r") AS "r",
                        floor(255*("textlabel"."colour")."g") AS "g",
                        floor(255*("textlabel"."colour")."b") AS "b",
                        ("textlabel"."colour")."a" AS "a",
                        ("textlabel_location"."location")."x" AS "x",
                        ("textlabel_location"."location")."y" AS "y",
                        ("textlabel_location"."location")."z" AS "z",
                        abs( ("textlabel_location"."location")."z" - ("textlabel_location"."location")."z" ) AS "z_diff"
        FROM "textlabel" INNER JOIN "textlabel_location" ON "textlabel"."id" = "textlabel_location"."textlabel_id"
        INNER JOIN "project" ON "project"."id" = "textlabel"."project_id"
        INNER JOIN "project_stack" ON "project"."id" = "project_stack"."project_id"
        INNER JOIN "stack" ON "stack"."id" = "project_stack"."stack_id"
        WHERE	"project"."id" = %(pid)s AND
                        "stack"."id" = %(sid)s AND
                        NOT "textlabel"."deleted" AND
                        NOT "textlabel_location"."deleted" AND
                        ("textlabel_location"."location")."x" >= %(left)s AND
                        ("textlabel_location"."location")."x" <= %(right)s AND
                        ("textlabel_location"."location")."y" >= %(top)s AND
                        ("textlabel_location"."location")."y" <= %(bottom)s AND
                        ("textlabel_location"."location")."z" >= %(z)s - 0.5 * ("stack"."resolution")."z" AND
                        ("textlabel_location"."location")."z" <= %(z)s + 0.5 * ("stack"."resolution")."z" AND
                        ( ( "textlabel"."scaling" AND "textlabel"."font_size" * %(scale_div_res)s >= 3 ) OR
                                NOT "textlabel"."scaling" )
        ORDER BY "tid", "z_diff"
        ''', params)
        textlabels = cursor_fetch_dictionary(c)

        response_on_error = 'Failed to format output'
        for tl in textlabels:
            tl['colour'] = {'r': tl['r'], 'g': tl['g'], 'b': tl['b'], 'a': tl['a']}
            del(tl['r'])
            del(tl['g'])
            del(tl['b'])
            del(tl['a'])
            tl['location'] = {'x': tl['x'], 'y': tl['y'], 'z': tl['z']}
            del(tl['x'])
            del(tl['y'])
            del(tl['z'])
            if tl['scaling']:
                tl['scaling'] = 1
            else:
                tl['scaling'] = 0

        return JsonResponse(makeJSON_legacy_list(textlabels), safe=False)

    except Exception as e:
        raise Exception(response_on_error + ':' + str(e))
