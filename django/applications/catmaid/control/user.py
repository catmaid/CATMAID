# -*- coding: utf-8 -*-

import json
from typing import Any, Dict, Iterable

from guardian.utils import get_anonymous_user

from django.conf import settings
from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.contrib.auth.decorators import user_passes_test
from django.contrib.auth import views as auth_views
from django.contrib.auth.mixins import UserPassesTestMixin
from django.contrib.auth import get_user_model
import django.contrib.auth.views as django_auth_views

from catmaid.control.authentication import (access_check, PermissionError)
from catmaid.control.common import get_request_bool

User = get_user_model()


def not_anonymous(user):
    """Return true if the the user is neither Django's nor Guardian's anonymous
    user.
    """
    return user.is_authenticated and user != get_anonymous_user()

def user_list(request:HttpRequest) -> JsonResponse:
    """List registered users in this CATMAID instance. If accessed by an
    anonymous user, only the anonymous user is returned unless the anonymous
    user has can_browse permissions, which allows it to retrieve all users.

    If the settings.py setting PROJECT_TOKEN_USER_VISIBILITY = True, logged in
    users will only see those users that share project tokens with them.

    An administrator can export users including their salted and encrpyted
    password. This is meant to import users into other CATMAID instances.
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

    user = request.user
    anon_user = get_anonymous_user()

    user_list = []
    if settings.PROJECT_TOKEN_USER_VISIBILITY:
        cursor = connection.cursor()
        cursor.execute("""
            WITH project_tokens AS (
                SELECT DISTINCT project_token_id AS id
                FROM catmaid_user_project_token
                WHERE user_id = %(user_id)s

                UNION

                SELECT id
                FROM catmaid_project_token
                WHERE user_id = %(user_id)s
            )
            SELECT DISTINCT ON (au.id) au.id, au.username, au.first_name,
                au.last_name, (up.color).r, (up.color).g, (up.color).b,
                up.primary_group_id
            FROM project_tokens pt
            JOIN catmaid_user_project_token upt
                ON pt.id = upt.project_token_id
            JOIN auth_user au
                ON au.id = upt.user_id
            JOIN catmaid_userprofile up
                ON up.user_id = au.id

            UNION

            SELECT au.id, au.username, au.first_name, au.last_name,
                (up.color).r, (up.color).g, (up.color).b, up.primary_group_id
            FROM auth_user au
            JOIN catmaid_userprofile up
                ON up.user_id = au.id
            WHERE au.id = %(user_id)s OR au.id = %(anon_user_id)s
        """, {
            'user_id': user.id,
            'anon_user_id': anon_user.id,
        })
        user_list = list(map(lambda u: {
            "id": u[0],
            "login": u[1],
            "full_name": f'{u[2]} {u[3]}',
            "first_name": u[2],
            "last_name": u[3],
            "color": (u[4], u[5], u[6]),
            "primary_group_id": u[7],
        }, cursor.fetchall()))
    else:
        can_see_all_users = user.is_authenticated and \
                (user != anon_user or user.has_perm('catmaid.can_browse'))

        if can_see_all_users:
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
                    "color": (up.color.r, up.color.g, up.color.b),
                    "primary_group_id": up.primary_group_id,
                }
                if with_passwords:
                    # Append encypted user password
                    user_data['password'] = u.password
                user_list.append(user_data)

    if not user_list:
        up = user.userprofile
        user_list = [{
            "id": user.id,
            "login": user.username,
            "full_name": user.get_full_name(),
            "first_name": user.first_name,
            "last_name": user.last_name,
            "color": (up.color.r, up.color.g, up.color.b),
            "primary_group_id": up.primary_group_id
        }]

    return JsonResponse(user_list, safe=False)

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
            classinstanceclassinstance__relation__relation_name='annotated_with',
            classinstanceclassinstance__class_instance_b__name=annotation
        )
        # Make sure we only get distinct user names
        distinct = True

    # The neuron_id field can be used to constrain the result by only showing
    # users that annotated a certain neuron.
    neuron_annotated = request.POST.get('neuron_id', None)
    if neuron_annotated:
        user_query = user_query.filter(
            classinstanceclassinstance__relation__relation_name='annotated_with',
            classinstanceclassinstance__class_instance_a__id=neuron_annotated
        )
        # Make sure we only get distinct user names
        distinct = True

    if distinct:
        user_query = user_query.distinct()

    if should_sort:
        column_count = int(request.POST.get('iSortingCols', 0))
        sorting_directions: Iterable[str] = [
                request.POST.get('sSortDir_%d' % d, 'DESC')
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

    response:Dict[str, Any] = {
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
