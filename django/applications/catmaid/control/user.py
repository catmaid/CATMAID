import json
import colorsys
from random import random
from string import upper

from django.http import HttpResponse
from django.contrib.auth.decorators import user_passes_test
from django.contrib.auth.models import User

def access_check(user):
    """ Returns true if users are logged in or if they have the general
    can_browse permission assigned (i.e. not with respect to a certain object).
    This is used to also allow the not logged in anonymous user to retrieve
    data if it is granted the 'can_browse' permission.
    """
    return user.is_authenticated() or user.has_perm('catmaid.can_browse')

@user_passes_test(access_check)
def user_list(request):
    result = []
    for u in User.objects.all().order_by('last_name', 'first_name'):
        up = u.userprofile
        result.append({
            "id": u.id,
            "login": u.username,
            "full_name": u.get_full_name(),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "color": (up.color.r, up.color.g, up.color.b) })

    return HttpResponse(json.dumps(result), mimetype='text/json')

@user_passes_test(access_check)
def user_list_datatable(request):
    display_start = int(request.POST.get('iDisplayStart', 0))
    display_length = int(request.POST.get('iDisplayLength', -1))
    if display_length < 0:
        display_length = 2000  # Default number of result rows

    should_sort = request.POST.get('iSortCol_0', False)

    user_query = User.objects.all()

    # By default, there is no need to explicitly request a distinct result
    distinct = False

    # This field can be used to only return users that have used a certain
    # annotation.
    annotations = [v for k,v in request.POST.iteritems()
            if k.startswith('annotations[')]

    for annotation in annotations:
        user_query = user_query.filter(
                classinstanceclassinstance__relation__relation_name = \
                     'annotated_with',
                classinstanceclassinstance__class_instance_b__name = \
                     annotation)
        # Make sure we only get distinct user names
        distinct = True

    # The neuron_id field can be used to constrain the result by only showing
    # users that annotated a certain neuron.
    neuron_annotated = request.POST.get('neuron_id', None)
    if neuron_annotated:
        user_query = user_query.filter(
                classinstanceclassinstance__relation__relation_name = \
                     'annotated_with',
                classinstanceclassinstance__class_instance_a__id = \
                     neuron_annotated)
        # Make sure we only get distinct user names
        distinct = True

    if distinct:
        user_query = user_query.distinct()

    if should_sort:
        column_count = int(request.POST.get('iSortingCols', 0))
        sorting_directions = [request.POST.get('sSortDir_%d' % d, 'DESC')
                for d in range(column_count)]
        sorting_directions = map(lambda d: '-' if upper(d) == 'DESC' else '',
                sorting_directions)

        fields = ['username', 'first_name', 'last_name']
        sorting_index = [int(request.POST.get('iSortCol_%d' % d))
                for d in range(column_count)]
        sorting_cols = map(lambda i: fields[i], sorting_index)

        user_query = user_query.extra(order_by=[di + col for (di, col) in zip(
                sorting_directions, sorting_cols)])

    num_records = len(user_query)
    result = list(user_query[display_start:display_start + display_length])

    response = {
        'iTotalRecords': num_records,
        'iTotalDisplayRecords': num_records,
        'aaData': []
    }

    for user in result:
        response['aaData'] += [[
            user.username,
            user.first_name,
            user.last_name,
            user.id,
        ]]

    return HttpResponse(json.dumps(response), mimetype='text/json')


initial_colors = ((1, 0, 0, 1),
                  (0, 1, 0, 1),
                  (0, 0, 1, 1),
                  (1, 0, 1, 1),
                  (0, 1, 1, 1),
                  (1, 1, 0, 1),
                  (1, 1, 1, 1),
                  (1, 0.5, 0, 1),
                  (1, 0, 0.5, 1),
                  (0.5, 1, 0, 1),
                  (0, 1, 0.5, 1),
                  (0.5, 0, 1, 1),
                  (0, 0.5, 1, 1))


def distinct_user_color():
    """ Returns a color for a new user. If there are less users registered than
    entries in the initial_colors list, the next free color is used. Otherwise,
    a random color is generated.
    """
    nr_users = User.objects.exclude(id__exact=-1).count()

    if nr_users < len(initial_colors):
        distinct_color = initial_colors[nr_users]
    else:
        distinct_color = colorsys.hsv_to_rgb(random(), random(), 1.0) + (1,)

    return distinct_color

@user_passes_test(access_check)
def update_user_profile(request):
    """ Allows users to update some of their user settings, e.g. whether
    reference lines should be visible. If the request is done by the anonymous
    user, nothing is updated, but no error is raised.
    """
    # Ignore anonymous user
    if not request.user.is_authenticated() or request.user.is_anonymous():
        return HttpResponse(json.dumps({'success': "The user profile of the " +
                "anonymous user won't be updated"}), mimetype='text/json')

    # Display stack reference lines
    display_stack_reference_lines = request.POST.get(
            'display_stack_reference_lines', None)
    if display_stack_reference_lines:
        display_stack_reference_lines = bool(int(display_stack_reference_lines))
        # Set new user profile values
        request.user.userprofile.display_stack_reference_lines = \
                display_stack_reference_lines

    # Save user profile
    request.user.userprofile.save()

    return HttpResponse(json.dumps({'success': 'Updated user profile'}),
            mimetype='text/json')
