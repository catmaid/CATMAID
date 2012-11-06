import sys
import re
import urllib
import json

from django.conf import settings
from django.db import connection
from django.http import HttpResponse, HttpResponseRedirect
from django.core.urlresolvers import reverse

from catmaid.models import Project, UserRole
from django.contrib.auth.models import User

from catmaid.control.common import json_error_response, cursor_fetch_dictionary
from catmaid.control.common import my_render_to_response

from django.contrib.auth import authenticate, logout, login

from guardian.shortcuts import get_perms_for_model, get_objects_for_user, get_perms, get_objects_for_group
from functools import wraps


def login_vnc(request):
    return my_render_to_response(request,
                                 'vncbrowser/login.html',
                                {'return_url': request.GET.get('return_url', '/'),
                                 'project_id': 0,
                                 'catmaid_url': settings.CATMAID_URL,
                                 'catmaid_login': settings.CATMAID_URL + 'model/login.php'})


def login_user(request):
    if request.method == 'POST':
        # Try to log the user into the system.
        username = request.POST.get('name', 0)
        password = request.POST.get('pwd', 0)
        user = authenticate(username=username, password=password)
        if user is not None:
            if user.is_active:
                # Redirect to a success page.
                request.session['user_id'] = user.id
                login(request, user)
                return HttpResponse(json.dumps({'id': request.session.session_key, 'longname': user.get_full_name() } ))
            else:
               # Return a 'disabled account' error message
               return HttpResponse(json.dumps({'error': ' Disabled account'}))
        else:
            # Return an 'invalid login' error message.
            return HttpResponse(json.dumps({'error': ' Invalid login'}))
    else:   # request.method == 'GET'
        # Check if the user is logged in.
        if request.user.is_authenticated():
            return HttpResponse(json.dumps({'id': request.session.session_key, 'longname': request.user.get_full_name() } ))
        else:
            # Return a 'not logged in' warning message.
            return HttpResponse(json.dumps({'warning': ' Not logged in'}))


def logout_user(request):
    logout(request)
    return HttpResponse(json.dumps({'success': True}))


def requires_user_role(roles):
    """
    This decorator will return a JSON error response unless the user is logged in 
    and has at least one of the indicated roles or admin role for the project.
    """
    
    # TODO: should projects' public attribute still be used or can it be replaced by a new "all users" group with browse permissions?
    
    def decorated_with_requires_user_role(f):
        def inner_decorator(request, roles=roles, *args, **kwargs):
            if not request.user.is_authenticated():
                return json_error_response(request.get_full_path() + " is not accessible unless you are logged in")
            p = Project.objects.get(pk=kwargs['project_id'])
            u = request.user
            
            # Check for admin privs in all cases.
            has_role = u.has_perm('can_administer', p)
            
            if not has_role:
                # Check the indicated role(s)
                if isinstance(roles, str):
                    roles = [roles]
                for role in roles:
                    if role == UserRole.Annotate:
                        has_role = u.has_perm('can_annotate', p)
#                         if has_role:
#                             print >> sys.stderr, str(u) + ' has annotation role for ' + str(p)
                    elif role == UserRole.Browse:
                        has_role = u.has_perm('can_browse', p)
#                         if has_role:
#                             print >> sys.stderr, str(u) + ' has browse role for ' + str(p)
                    if has_role:
                        break
#             else:
#                 print >> sys.stderr, str(u) + ' has admin role for ' + str(p)
            
            if has_role:
                # The user can execute the function.
                return f(request, *args, **kwargs)
            else:
                return json_error_response("The user '%s' does not have a necessary role in the project %d" % (u.first_name + ' ' + u.last_name, int(kwargs['project_id'])))
            
        return wraps(f)(inner_decorator)
    return decorated_with_requires_user_role


def user_project_permissions(request):
    result = {}
    if request.user.is_authenticated():
        projectPerms = get_perms_for_model(Project)
        permNames = [perm.codename for perm in projectPerms]
        projects = get_objects_for_user(request.user, permNames, Project, any_perm = True)
        for project in projects:
            userPerms = get_perms(request.user, project)
            for permName in [p.codename for p in projectPerms]:
                if permName not in result:
                    result[permName] = {}
                result[permName][project.id] = permName in userPerms
    
    return HttpResponse(json.dumps(result))
