import re
import json

from functools import wraps
from itertools import groupby

from guardian.models import UserObjectPermission, GroupObjectPermission
from guardian.shortcuts import get_perms_for_model

from django import forms
from django.conf import settings
from django.core.urlresolvers import reverse
from django.contrib.contenttypes.models import ContentType
from django.contrib.auth import authenticate, logout, login
from django.contrib.auth.models import User, Group
from django.contrib.auth.forms import UserCreationForm
from django.db import connection
from django.http import HttpResponse, HttpResponseRedirect
from django.core.exceptions import ObjectDoesNotExist
from django.shortcuts import _get_queryset, render

from rest_framework.authtoken import views as auth_views
from rest_framework.authtoken.serializers import AuthTokenSerializer

from catmaid.models import Project, UserRole, ClassInstance, \
        ClassInstanceClassInstance
from catmaid.control.common import my_render_to_response


def login_user(request):
    profile_context = {}
    if request.method == 'POST':
        # Try to log the user into the system.
        username = request.POST.get('name', 0)
        password = request.POST.get('pwd', 0)
        user = authenticate(username=username, password=password)

        if user is not None:
            profile_context['userprofile'] = user.userprofile.as_dict()
            profile_context['permissions'] = tuple(request.user.get_all_permissions())
            if user.is_active:
                # Redirect to a success page.
                request.session['user_id'] = user.id
                login(request, user)
                # Add some context information
                profile_context['id'] = request.session.session_key
                profile_context['longname'] = user.get_full_name()
                profile_context['userid'] = user.id
                profile_context['username'] = user.username
                profile_context['is_superuser'] = user.is_superuser
                return HttpResponse(json.dumps(profile_context))
            else:
                # Return a 'disabled account' error message
                profile_context['error'] = ' Disabled account'
                return HttpResponse(json.dumps(profile_context))
        else:
            # Return an 'invalid login' error message.
            profile_context['userprofile'] = request.user.userprofile.as_dict()
            profile_context['error'] = ' Invalid login'
            return HttpResponse(json.dumps(profile_context))
    else:   # request.method == 'GET'
        profile_context['userprofile'] = request.user.userprofile.as_dict()
        profile_context['permissions'] = tuple(request.user.get_all_permissions())
        # Check if the user is logged in.
        if request.user.is_authenticated():
            profile_context['id'] = request.session.session_key
            profile_context['longname'] = request.user.get_full_name()
            profile_context['userid'] = request.user.id
            profile_context['username'] = request.user.username
            profile_context['is_superuser'] = request.user.is_superuser
            return HttpResponse(json.dumps(profile_context))
        else:
            # Return a 'not logged in' warning message.
            profile_context['warning'] = ' Not logged in'
            return HttpResponse(json.dumps(profile_context))


def logout_user(request):
    logout(request)
    # Return profile context of anonymous user
    anon_user = User.objects.get(id=settings.ANONYMOUS_USER_ID)
    profile_context = {}
    profile_context['userprofile'] = anon_user.userprofile.as_dict()
    profile_context['success'] = True
    return HttpResponse(json.dumps(profile_context))


def check_user_role(user, project, roles):
    """Check that a user has one of a set of roles for a project.

    Administrator role satisfies any requirement.
    """

    # Check for admin privs in all cases.
    has_role = user.has_perm('can_administer', project)

    if not has_role:
        # Check the indicated role(s)
        if isinstance(roles, str):
            roles = [roles]
        for role in roles:
            if role == UserRole.Annotate:
                has_role = user.has_perm('can_annotate', project)
            elif role == UserRole.Browse:
                has_role = user.has_perm('can_browse', project)
            if has_role:
                break

    return has_role


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

            if has_role:
                # The user can execute the function.
                return f(request, *args, **kwargs)
            else:
                msg = "The user '%s' with ID %s does not have a necessary role in the " \
                      "project %d" % (u.first_name + ' ' + u.last_name, u.id, \
                      int(kwargs['project_id']))
                return HttpResponse(json.dumps({'error': msg,
                        'permission_error': True}), content_type='application/json')

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
                msg = "The user '%s' with ID %s does not have a necessary " \
                      "role in any project" \
                      % (u.first_name + ' ' + u.last_name, u.id)
                return HttpResponse(
                        json.dumps({'error': msg, 'permission_error': True}),
                        content_type='application/json')

        return wraps(f)(inner_decorator)
    return decorated_with_requires_user_role_for_any_project


def get_objects_and_perms_for_user(user, codenames, klass, use_groups=True, any_perm=False):
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
        .filter(user=user)\
        .filter(permission__content_type=ctype)\
        .filter(permission__codename__in=codenames)\
        .values_list('object_pk', 'permission__codename')
    data = list(user_obj_perms)
    if use_groups:
        groups_obj_perms = GroupObjectPermission.objects\
            .filter(group__user=user)\
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

def user_project_permissions(request):
    """ If a user is authenticated, this method returns a dictionary that
    stores whether the user has a specific permission on a project. If a user
    is not authenticated and the request is done by the anonymous user, the
    permissions for the anonymous user are returned. Otherwise, this dictionary
    will be empty.
    """
    result = {}
    if request.user.is_authenticated() or request.user.is_anonymous:
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
                if permName not in result:
                    result[permName] = {}
                result[permName][project_id] = permName in userPerms
        # Obtain the list of groups of the user
        groups = list(Group.objects.filter(user=request.user).values_list('name', flat=True))
    else:
        groups = []

    return HttpResponse(json.dumps((result, groups)))

def get_object_permissions(request, ci_id):
    """ Tests editing permissions of a user on a class_instance and returns the
    result as JSON object."""
    try:
        can_edit = can_edit_class_instance_or_fail(request.user, ci_id)
    except:
        can_edit = False

    permissions = {
        'can_edit': can_edit,
    }

    return HttpResponse(json.dumps(permissions))

def can_edit_class_instance_or_fail(user, ci_id, name='object'):
    """ Returns true if a) the class instance is not locked or b) if the class
    instance is locked and the the user owns the link to the 'locked' annotation
    or (s)he belongs to a group with the same name as the owner of the link.
    Otherwise, false is returned. The name argument describes the class instance
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

def can_edit_or_fail(user, ob_id, table_name):
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


def can_edit_all_or_fail(user, ob_ids, table_name):
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


def user_can_edit(cursor, user_id, other_user_id):
    """ Determine whether the user with id 'user_'id' can edit the work of the user with id 'other_user_id'. This will be the case when the user_id belongs to a group whose name is identical to ther username of other_user_id.
    This function is equivalent to 'other_user_id in user_domain(cursor, user_id), but consumes less resources."""
    # The group with identical name to the username is implicit, doesn't have to exist. Therefore, check this edge case before querying:
    if user_id == other_user_id:
        return True
    # Retrieve a value larger than zero when the user_id belongs to a group with name equal to that associated with other_user_id
    cursor.execute("""
    SELECT count(*)
    FROM auth_user u,
         auth_group g,
         auth_user_groups ug
    WHERE u.id = %s
      AND u.username = g.name
      AND g.id = ug.group_id
      AND ug.user_id = %s
    """ % (other_user_id, user_id))
    rows = cursor.fetchall()
    return rows and rows[0][0] > 0


def user_domain(cursor, user_id):
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
def all_usernames(request, project_id=None):
    """ Return an ordered list of all usernames, each entry a list of id and username. """
    cursor = connection.cursor()
    cursor.execute('''
    SELECT id, username FROM auth_user WHERE id != -1 ORDER BY username DESC
    ''')
    return HttpResponse(json.dumps(cursor.fetchall()))

def register(request):
    # Return right away if user registration is not enabled
    if not settings.USER_REGISTRATION_ALLOWED:
        return HttpResponseRedirect(reverse("home"))

    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            new_user = form.save()
            return HttpResponseRedirect(reverse("home"))
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
