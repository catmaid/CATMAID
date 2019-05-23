# -*- coding: utf-8 -*-

from functools import wraps
from itertools import groupby
import json
import re
from typing import Any, DefaultDict, Dict, List, Optional, Set, Tuple, Union


from guardian.core import ObjectPermissionChecker
from guardian.models import UserObjectPermission, GroupObjectPermission
from guardian.shortcuts import (get_perms_for_model, get_user_perms,
        get_group_perms)
from guardian.utils import get_anonymous_user

from django import forms
from django.conf import settings
from django.urls import reverse
from django.contrib.contenttypes.models import ContentType
from django.contrib.auth import authenticate, logout, login
from django.contrib.auth.models import User, Group
from django.contrib.auth.forms import UserCreationForm
from django.db import connection
from django.http import HttpRequest, HttpResponseRedirect, JsonResponse
from django.core.exceptions import ObjectDoesNotExist
from django.shortcuts import _get_queryset, render

from rest_framework.authtoken import views as auth_views
from rest_framework.authtoken.serializers import AuthTokenSerializer

from catmaid.models import Project, UserRole, ClassInstance, \
        ClassInstanceClassInstance


class PermissionError(Exception):
    """Indicates the lack of permissions for a particular action."""
    pass


class InvalidLoginError(Exception):
    """Indicates an unsuccessful login."""
    pass


class InactiveLoginError(Exception):
    """Indicates some sort of configuration error"""
    def __init__(self, message, meta=None):
        super().__init__(message)
        self.meta = meta


def access_check(user) -> bool:
    """ Returns true if users are logged in or if they have the general
    can_browse permission assigned (i.e. not with respect to a certain object).
    This is used to also allow the not logged in anonymous user to retrieve
    data if it is granted the 'can_browse' permission.
    """
    if user.is_authenticated:
        if user == get_anonymous_user():
            return user.has_perm('catmaid.can_browse')
        else:
            return True
    return False


def login_user(request:HttpRequest) -> JsonResponse:
    profile_context = {}
    if request.method == 'POST':
        # Try to log the user into the system.
        username = request.POST.get('name', 0)
        password = request.POST.get('pwd', 0)

        # Try to authenticate user with credentials. A user object is only
        # returned if the user could be authenticated (i.e. correct password and
        # active user).
        user = authenticate(username=username, password=password)

        if user is not None:
            # Redirect to a success page.
            request.session['user_id'] = user.id
            login(request, user)
            # Add some context information
            profile_context['id'] = request.session.session_key
            return user_context_response(user, profile_context)
        else:
            try:
                user = User.objects.get(username=username)
                if not user.is_active:
                    # If a user is not active an error is raised and inactivity
                    # group information appended, if available.
                    raise InactiveLoginError("Account is inavtive", {
                        'inactivity_groups': get_exceeded_inactivity_periods(user.id),
                    })
                raise InvalidLoginError()
            except User.DoesNotExist:
                raise InvalidLoginError()

    else:   # request.method == 'GET'
        # Check if the user is logged in.
        if request.user.is_authenticated:
            profile_context['id'] = request.session.session_key
            return user_context_response(request.user, profile_context)
        else:
            # Return a 'not logged in' warning message.
            profile_context['warning'] = ' Not logged in'
            return user_context_response(request.user, profile_context)


def logout_user(request:HttpRequest) -> JsonResponse:
    logout(request)
    # Return profile context of anonymous user
    anon_user = get_anonymous_user()
    return user_context_response(anon_user)


def user_context_response(user, additional_fields=None) -> JsonResponse:
    cursor = connection.cursor()
    context = {
        'longname': user.get_full_name(),
        'userid': user.id,
        'username': user.username,
        'is_superuser': user.is_superuser,
        'userprofile': user.userprofile.as_dict(),
        'permissions': tuple(user.get_all_permissions()),
        'domain': list(user_domain(cursor, user.id))
    }
    if additional_fields is not None:
        context.update(additional_fields)
    return JsonResponse(context)


def check_user_role(user, project, roles) -> bool:
    """Check that a user has one of a set of roles for a project.

    Administrator role satisfies any requirement.
    """

    # Prefetch all user permissions for project.
    checker = ObjectPermissionChecker(user)

    # Check for admin privs in all cases.
    has_role = checker.has_perm('can_administer', project)

    if not has_role:
        # Check the indicated role(s)
        if isinstance(roles, str):
            roles = [roles]
        for role in roles:
            if role == UserRole.Annotate:
                has_role = checker.has_perm('can_annotate', project)
            elif role == UserRole.Browse:
                has_role = checker.has_perm('can_browse', project)
            elif role == UserRole.Import:
                has_role = checker.has_perm('can_import', project)
            elif role == UserRole.QueueComputeTask:
                has_role = checker.has_perm('can_queue_compute_task', project)
            if has_role:
                break

    return has_role


def requires_superuser():
    """
    This decorator will raise an error if the logged in user is no superuser.
    """

    def decorated_with_requires_superuser(f):
        def inner_decorator(request, *args, **kwargs):
            if not request.user.is_superuser:
                raise PermissionError("Superuser permissions are required for this action")
            return f(request, *args, **kwargs)

        return wraps(f)(inner_decorator)

    return decorated_with_requires_superuser


def contains_read_roles(roles) -> bool:
    """
    Returns False if the list of roles contains a "Browse" role, True otherwise.
    """
    return UserRole.Browse in roles


def requires_user_role(roles):
    """
    This decorator will return a JSON error response unless the user is logged in
    and has at least one of the indicated roles or admin role for the project.
    """

    def decorated_with_requires_user_role(f):
        def inner_decorator(request, roles=roles, *args, **kwargs):
            p = Project.objects.get(pk=kwargs['project_id'])
            u = request.user

            has_role = check_user_role(u, p, roles)
            is_token_authenticated = getattr(request, '_is_token_authenticated', False)

            # If a request is authenticated through an API token permissions are
            # required, endpoints that require write/annotate permissions also
            # need to have the TokenAnnotate permission. This is enforced also
            # for admin accounts.
            if is_token_authenticated and not contains_read_roles(roles) and \
                    settings.REQUIRE_EXTRA_TOKEN_PERMISSIONS:
                has_role = 'can_annotate_with_token' in get_user_perms(u, p) or \
                        'can_annotate_with_token' in get_group_perms(u, p)

            if has_role:
                # The user can execute the function.
                return f(request, *args, **kwargs)
            else:
                msg = "User '{}' with ID {} does not have the required permissions in " \
                      "project {}".format(u.username, u.id, int(kwargs['project_id']))
                raise PermissionError(msg)

        return wraps(f)(inner_decorator)
    return decorated_with_requires_user_role


def requires_user_role_for_any_project(roles):
    """
    This decorator will return a JSON error response unless the user is logged
    in and has at least one of the indicated roles or admin role for any
    project.
    """

    def decorated_with_requires_user_role_for_any_project(f):
        def inner_decorator(request, roles=roles, *args, **kwargs):
            u = request.user

            # Check for admin privs in all cases.
            role_codesnames = set()
            role_codesnames.add('can_administer')

            if isinstance(roles, str):
                roles = [roles]
            for role in roles:
                if role == UserRole.Annotate:
                    role_codesnames.add('can_annotate')
                elif role == UserRole.Browse:
                    role_codesnames.add('can_browse')

            has_role = get_objects_and_perms_for_user(u,
                                                      role_codesnames,
                                                      Project,
                                                      any_perm=True)

            if len(has_role):
                # The user can execute the function.
                return f(request, *args, **kwargs)
            else:
                msg = "User '{}' with ID {} does not have the required permissions " \
                      "in any project".format(u.username, u.id)
                raise PermissionError(msg)

        return wraps(f)(inner_decorator)
    return decorated_with_requires_user_role_for_any_project


def get_objects_and_perms_for_user(user, codenames, klass, use_groups:bool=True, any_perm:bool=False) -> Dict:
    """ Similar to what guardian's get_objects_for_user method does,
    this method return a dictionary of object IDs (!) of model klass
    objects with the permissions the user has on them associated.
    These permissions may result from explicit user permissions or
    implicit group ones. Parts of the source code are takes from
    django-guardian. Note, that there an object list is returned. In
    contrast this method returns object IDs and the permissions on
    the actual objects.
    """
    # Get QuerySet on and ContentType of the model
    queryset = _get_queryset(klass)
    ctype = ContentType.objects.get_for_model(queryset.model)

    # A super user has all permissions available on all the objects
    # of a model.
    if user.is_superuser:
        # Get all permissions for the model
        perms = get_perms_for_model(klass)
        permNames = set(perm.codename for perm in perms)
        pk_dict = {}
        for p in queryset:
            pk_dict[p.id] = permNames
        return pk_dict

    # Extract a list of tuples that contain an object's primary
    # key and a permission codename that the user has on them.
    user_obj_perms = UserObjectPermission.objects\
        .filter(user=user.id)\
        .filter(permission__content_type=ctype)\
        .filter(permission__codename__in=codenames)\
        .values_list('object_pk', 'permission__codename')
    data = list(user_obj_perms)
    if use_groups:
        groups_obj_perms = GroupObjectPermission.objects\
            .filter(group__user=user.id)\
            .filter(permission__content_type=ctype)\
            .filter(permission__codename__in=codenames)\
            .values_list('object_pk', 'permission__codename')
        data += list(groups_obj_perms)
    # sorting/grouping by pk (first in result tuple)
    keyfunc = lambda t: int(t[0])
    data = sorted(data, key=keyfunc)

    # Create the result dictionary, associating one object id
    # with a set of permissions the user has for it.
    pk_dict = {}
    for pk, group in groupby(data, keyfunc):
        obj_codenames = set((e[1] for e in group))
        if any_perm or codenames.issubset(obj_codenames):
            pk_dict[pk] = obj_codenames

    return pk_dict

def user_project_permissions(request:HttpRequest) -> JsonResponse:
    """ If a user is authenticated, this method returns a dictionary that
    stores whether the user has a specific permission on a project. If a user
    is not authenticated, the request is done by Django's anonymous user, which
    is different from Guardian's anonymous user. In this case, no permissions
    are returned, because Django's anonymous user does not have a user profile.
    A middleware should make sure Guardian's anonymous user is used for
    anonymous requests, because it reports as authenticated and a profile will
    be returned.
    """
    permissions = {} # type: Dict
    if request.user.is_authenticated:
        projectPerms = get_perms_for_model(Project)
        permNames = [perm.codename for perm in projectPerms]
        # Find out what permissions a user actually has for any of those projects.
        projects = get_objects_and_perms_for_user(request.user, permNames,
                                                  Project, any_perm = True)
        # Build the result data structure
        for project_id in projects:
            userPerms = projects[project_id]
            # Iterate the codenames of available permissions and store
            # whether the user has them for a specific project
            for permName in permNames:
                perm_projects = permissions.get(permName)
                if not perm_projects:
                    perm_projects = []
                    permissions[permName] = perm_projects
                if permName in userPerms:
                    perm_projects.append(project_id)
        # Obtain the list of groups of the user
        groups = list(Group.objects.filter(user=request.user).values_list('name', flat=True))
    else:
        groups = []

    return JsonResponse((permissions, groups), safe=False)

def get_object_permissions(request:HttpRequest, ci_id) -> JsonResponse:
    """ Tests editing permissions of a user on a class_instance and returns the
    result as JSON object."""
    try:
        can_edit = can_edit_class_instance_or_fail(request.user, ci_id)
    except:
        can_edit = False

    permissions = {
        'can_edit': can_edit,
    }

    return JsonResponse(permissions)

def can_edit_class_instance_or_fail(user, ci_id, name='object') -> bool:
    """ Returns true if a) the class instance is not locked or b) if the class
    instance is locked and the the user owns the link to the 'locked' annotation
    or (s)he belongs to a group with the same name as the owner of the link.
    Otherwise raises an exception. The name argument describes the class instance
    and is only used in messages returned to the user.
    """
    ci_id = int(ci_id)
    # Check if the class instance exists at all
    if ClassInstance.objects.filter(id=ci_id).exists():
        # Implicit: a super user belongs to all users' groups
        if user.is_superuser:
            return True
        # Check if the class instance is locked by other users
        locked_by_other = ClassInstanceClassInstance.objects.filter(
                class_instance_a__id=ci_id,
                relation__relation_name = 'annotated_with',
                class_instance_b__name='locked').exclude(user=user)
        if bool(locked_by_other):
            # Check if the user belongs to a group with the name of the owner
            if user_can_edit(connection.cursor(), user.id,
                    locked_by_other[0].user_id):
                return True

            raise Exception('User %s with id #%s cannot edit %s #%s' % \
                (user.username, user.id, name, ci_id))
        # The class instance is locked by user or not locked at all
        return True
    raise ObjectDoesNotExist('Could not find %s #%s' % (name, ci_id))

def can_edit_or_fail(user, ob_id:int, table_name) -> bool:
    """ Returns true if the user owns the object or if the user is a superuser.
    Raises an Exception if the user cannot edit the object
    or if the object does not exist.
    Expects the ob_id to be an integer. """
    # Sanitize arguments -- can't give them to django to sanitize,
    # for django will quote the table name
    ob_id = int(ob_id)
    if not re.match('^[a-z_]+$', table_name):
        raise Exception('Invalid table name: %s' % table_name)

    cursor = connection.cursor()
    cursor.execute("SELECT user_id FROM %s WHERE id=%s" % (table_name, ob_id))
    rows = tuple(cursor.fetchall())
    if rows:
        # Implicit: a super user belongs to all users' groups
        if user.is_superuser:
            return True
        if 1 == len(rows):
            # Implicit: a user belongs to its own group
            owner_id = rows[0][0]
            if owner_id == user.id:
                return True
            # Check if the user belongs to a group with the name of the owner
            if user_can_edit(cursor, user.id, owner_id):
                return True

        raise Exception('User %s with id #%s cannot edit object #%s (from user #%s) from table %s' % (user.username, user.id, ob_id, rows[0][0], table_name))
    raise ObjectDoesNotExist('Object #%s not found in table %s' % (ob_id, table_name))


def can_edit_all_or_fail(user, ob_ids, table_name) -> bool:
    """ Returns true if the user owns all the objects or if the user is a superuser.
    Raises an Exception if the user cannot edit the object
    or if the object does not exist."""
    # Sanitize arguments -- can't give them to django to sanitize,
    # for django will quote the table name
    ob_ids = set(ob_ids)
    str_ob_ids = ','.join(str(int(x)) for x in ob_ids)
    if not re.match('^[a-z_]+$', table_name):
        raise Exception('Invalid table name: %s' % table_name)

    cursor = connection.cursor()
    cursor.execute("SELECT user_id, count(*) FROM %s WHERE id IN (%s) GROUP BY user_id" % (table_name, str_ob_ids))
    rows = tuple(cursor.fetchall())
    # Check that all ids to edit exist
    if rows and len(ob_ids) == sum(row[1] for row in rows):
        if user.is_superuser:
            return True
        if 1 == len(rows) and rows[0][0] == user.id:
            return True
        # If more than one user, check if the request.user can edit them all
        # In other words, check if the set of user_id associated with ob_ids is a subset of the user's domain (the set of user_id that the user can edit)
        if set(row[0] for row in rows).issubset(user_domain(cursor, user.id)):
            return True

        raise Exception('User %s cannot edit all of the %s unique objects from table %s' % (user.username, len(ob_ids), table_name))
    raise ObjectDoesNotExist('One or more of the %s unique objects were not found in table %s' % (len(ob_ids), table_name))

def user_can_edit(cursor, user_id, other_user_id) -> bool:
    """ Determine whether the user with id 'user_'id' can edit the work of the user with id 'other_user_id'. This will be the case when the user_id belongs to a group whose name is identical to ther username of other_user_id.
    This function is equivalent to 'other_user_id in user_domain(cursor, user_id), but consumes less resources."""
    # The group with identical name to the username is implicit, doesn't have to exist. Therefore, check this edge case before querying:
    if user_id == other_user_id:
        return True
    # Retrieve a row when the user_id belongs to a group with name equal to that associated with other_user_id
    cursor.execute("""
    SELECT 1
    FROM auth_user u,
         auth_group g,
         auth_user_groups ug
    WHERE u.id = %s
      AND u.username = g.name
      AND g.id = ug.group_id
      AND ug.user_id = %s
    LIMIT 1
    """ % (other_user_id, user_id))
    return cursor.rowcount > 0


def user_domain(cursor, user_id) -> Set:
    """ This function returns the set of all other user_id, including the self, that the user has edit rights on via group membership.
    A user can edit nodes of other user(s) when the user belongs to a group named like that other user(s). Belonging to the self group is implicit, and therefore the self group--a group named like the user--doesn't have to exist; the user_id is added to the set in all cases.
    If a user can only edit its own nodes, then the returned set contains only its own user_id. """
    cursor.execute("""
    SELECT u2.id
    FROM auth_user u1,
         auth_user u2,
         auth_group g,
         auth_user_groups ug
    WHERE u1.id = %s
      AND u1.id = ug.user_id
      AND ug.group_id = g.id
      AND u2.username = g.name
    """ % int(user_id))
    domain = set(row[0] for row in cursor.fetchall())
    domain.add(user_id)
    return domain

@requires_user_role([UserRole.Annotate])
def all_usernames(request:HttpRequest, project_id=None) -> JsonResponse:
    """ Return an ordered list of all usernames, each entry a list of id and username. """
    cursor = connection.cursor()
    cursor.execute('''
    SELECT id, username FROM auth_user WHERE id != -1 ORDER BY username DESC
    ''')
    return JsonResponse(cursor.fetchall(), safe=False)

def register(request:HttpRequest) -> Union[HttpResponseRedirect, JsonResponse]:
    # Return right away if user registration is not enabled
    if not settings.USER_REGISTRATION_ALLOWED:
        return HttpResponseRedirect(reverse("catmaid:home"))

    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            new_user = form.save()
            return HttpResponseRedirect(reverse("catmaid:home"))
    else:
        form = UserCreationForm()
    return render(request, "catmaid/registration/register.html", {
        'form': form,
    })


class ObtainAuthToken(auth_views.ObtainAuthToken):
    """Generate an authorization token to use for API requests.

    Use your user credentials to generate an authorization token for querying
    the API. This token is tied to your account and shares your permissions.
    To use this token set the `Authorization` HTTP header to "Token "
    concatenated with the token string, e.g.:

        Authorization: Token 9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b

    Requests using token authorization are not required to set cross-site
    request forgery (CSRF) token headers.

    Requests using this token can do anything your account can do, so
    **do not distribute this token or check it into source control**.
    """
    def get_serializer_class(self):
        return AuthTokenSerializer


def exceeds_group_inactivity_period(user_id) -> bool:
    """Returns whether a user is inactive and their last login is past a maximum
    inactivity period.
    """
    cursor = connection.cursor()
    cursor.execute("""
        SELECT 1
        FROM catmaid_group_inactivity_period cdg
        JOIN auth_user_groups aug
            ON aug.group_id = cdg.group_id
        JOIN auth_user au
            ON au.id = aug.user_id
        WHERE cdg.max_inactivity < (now() - au.last_login)
            AND aug.user_id = %(user_id)s
    """, {
        'user_id': user_id
    })

    return len(cursor.fetchall()) > 0


def get_exceeded_inactivity_periods(user_id) -> List[Dict[str, Any]]:
    """Return all inactivity groups of which a user is member and where they
    exceed the maximum inactivity period. For those groups, a list of contact
    users is included as well (if any).
    """
    cursor = connection.cursor()
    cursor.execute("""
        SELECT g.id, g.max_inactivity, g.message, c.user_ids, c.user_logins,
            c.user_names, c.user_emails
        FROM (
            SELECT cgi.id, cgi.max_inactivity, cgi.message
            FROM catmaid_group_inactivity_period cgi
            JOIN auth_user_groups aug
                ON aug.group_id = cgi.group_id
            JOIN auth_user au
                ON au.id = aug.user_id
            WHERE cgi.max_inactivity < (now() - au.last_login)
                AND aug.user_id = %(user_id)s
            ORDER BY cgi.max_inactivity ASC
        ) g
        JOIN LATERAL (
            SELECT array_agg(igc.user_id) AS user_ids,
                array_agg(u.username) AS user_logins,
                array_agg(u.first_name || ' ' || u.last_name) AS user_names,
                array_agg(u.email) as user_emails
            FROM catmaid_group_inactivity_period_contact igc
            JOIN auth_user u
                ON u.id = igc.user_id
            WHERE igc.inactivity_period_id = g.id
        ) c
        ON TRUE
    """, {
        'user_id': user_id
    })

    return [{
        'id': row[0],
        'max_inactivity': row[1].total_seconds(),
        'message': row[2],
        'contacts': [{
            'id': row[3][n],
            'username': row[4][n],
            'full_name': row[5][n],
            'email': row[6][n],
        } for n in range(len(row[3]))]
    } for row in cursor.fetchall()]


def deactivate_inactive_users() -> List:
    """Mark all those users as inactive that didn't log in within a specified
    time range. Which users this are is defined by their group memberships. If a
    user is member of a group that is also marked as "deactivation group"
    (dedicated relation) and hasn't logged in since the associated time range,
    the user account is set to inactive.
    """
    cursor = connection.cursor()
    cursor.execute("""
        WITH inactive_users AS (
            SELECT au.id
            FROM catmaid_group_inactivity_period cdg
            JOIN auth_user_groups aug
                ON aug.group_id = cdg.group_id
            JOIN auth_user au
                ON au.id = aug.user_id
            WHERE cdg.max_inactivity < (now() - au.last_login)
        )
        UPDATE auth_user au
        SET is_active = FALSE
        FROM inactive_users iu
        WHERE au.id =  iu.id
        RETURNING au.id;
    """)

    return [row[0] for row in cursor.fetchall()]
