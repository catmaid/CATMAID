# -*- coding: utf-8 -*-

import json
from typing import Any, Dict

from guardian.utils import get_anonymous_user

from django.http import HttpRequest, JsonResponse
from django.contrib.auth.decorators import user_passes_test
from django.contrib.auth import views as auth_views
from django.contrib.auth.mixins import UserPassesTestMixin
from django.contrib.auth.models import User
import django.contrib.auth.views as django_auth_views

from catmaid.control.authentication import access_check
from catmaid.control.common import get_request_bool


def not_anonymous(user):
    """Return true if the the user is neither Django's nor Guardian's anonymous
    user.
    """
    return user.is_authenticated and user != get_anonymous_user()

@user_passes_test(access_check)
def user_list(request:HttpRequest) -> JsonResponse:
    """List registered users in this CATMAID instance. Must be logged in.
    An administrator can export users including their encrpyted password. This
    is meant to import users into other CATMAID instances.
    ---
    parameters:
    - name: with_passwords
      description: |
        Export encrypted passwords. Requires admin access.
      required: false
      type: boolean,
      default: false
    """
    with_passwords = get_request_bool(request.GET, 'with_passwords', False)
    if with_passwords:
        # Make sure user is an admin and part of the staff
        if not request.user.is_staff and not request.user.is_superuser:
            raise PermissionError("Superuser permissions required to export "
                    "encrypted user passwords")

    result = []
    for u in User.objects.all().select_related('userprofile') \
            .order_by('last_name', 'first_name'):
        up = u.userprofile
        user_data = {
            "id": u.id,
            "login": u.username,
            "full_name": u.get_full_name(),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "color": (up.color.r, up.color.g, up.color.b)
        }
        if with_passwords:
            # Append encypted user password
            user_data['password'] = u.password
        result.append(user_data)

    return JsonResponse(result, safe=False)

@user_passes_test(access_check)
def user_list_datatable(request:HttpRequest) -> JsonResponse:
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
    annotations = [v for k,v in request.POST.items()
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
        sorting_directions = map(lambda d: '-' if d.upper() == 'DESC' else '',
                sorting_directions)

        fields = ['username', 'first_name', 'last_name', 'id']
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
    } # type: Dict[str, Any]

    for user in result:
        response['aaData'] += [[
            user.username,
            user.first_name,
            user.last_name,
            user.id,
        ]]

    return JsonResponse(response)

@user_passes_test(access_check)
def update_user_profile(request:HttpRequest) -> JsonResponse:
    """ Allows users to update some of their user settings.

    If the request is done by the anonymous user, nothing is updated, but
    no error is raised.
    """
    # Ignore anonymous user
    if request.user == get_anonymous_user() or not request.user.is_authenticated:
        return JsonResponse({'success': "The user profile of the " +
                "anonymous user won't be updated"})

    # Save user profile
    request.user.userprofile.save()

    return JsonResponse({'success': 'Updated user profile'})


class NonAnonymousPasswordChangeView(UserPassesTestMixin, auth_views.PasswordChangeView):
    """Only allow password changes for non-anonymous users.
    """

    def test_func(self):
        return not_anonymous(self.request.user)

    def handle_no_permission(self):
        return auth_views.redirect_to_login(self.request.get_full_path(),
                self.get_login_url(), self.get_redirect_field_name())
