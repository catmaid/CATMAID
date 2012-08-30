import re
import urllib
import json

from django.conf import settings
from django.db import connection
from django.http import HttpResponse, HttpResponseRedirect
from django.core.urlresolvers import reverse

from catmaid.models import Project, User
from django.contrib.auth.models import User as AuthUser

from catmaid.control.common import json_error_response, cursor_fetch_dictionary
from catmaid.control.common import my_render_to_response

from django.contrib.auth import authenticate, logout, login

def login_vnc(request):
    return my_render_to_response(request,
                                 'vncbrowser/login.html',
                                {'return_url': request.GET.get('return_url', '/'),
                                 'project_id': 0,
                                 'catmaid_url': settings.CATMAID_URL,
                                 'catmaid_login': settings.CATMAID_URL + 'model/login.php'})


def login_user(request):
    username = request.POST['name']
    password = request.POST['pwd']
    user = authenticate(username=username, password=password)
    if user is not None:
        if user.is_active:
            # Redirect to a success page.
            login(request, user)
            request.session['user_id'] = user.id

            # HttpResponse(json.dumps())
            return HttpResponse(json.dumps({'id': request.session.session_key, 'longname': user.first_name + ' ' + user.last_name } ))
        else:
           # Return a 'disabled account' error message
           return HttpResponse(json.dumps({'error': ' Disabled account'}))
    else:
        # Return an 'invalid login' error message.
        return HttpResponse(json.dumps({'error': ' Invalid login'}))

def logout_user(request):
    logout(request)
    return HttpResponse(json.dumps({'success': True}))


def redirect_to_login(return_url):
    return HttpResponseRedirect(
        reverse('vncbrowser.views.login') + "?return_url=" + urllib.quote(return_url, ''))


# Note that this method does not work in general - there could be
# ';'s within a string, for example.  However, it is sufficient
# for parsing the data that we know may be in CATMAID sessions.  I
# think that one is supposed to be able to deserialize that with
# the phpserialize module, but in practice that always fails -
# perhaps this field is in some different format.  And example of
# this field would be:
# u'id|s:1:"5";key|s:54:"7gtmcy8g03457xg3hmuxdgregtyu45ty57ycturemuzm934etmvo56";'
def parse_php_session_data(s):
    result = {}
    for kv in s.split(';'):
        if not kv:
            continue
        m = re.match('^(.*?)\|(.*)', kv)
        if not m:
            raise Exception("Failed to parse the PHP session key / value pair: " + kv)
        k, v = m.groups()
        m = re.match('^s:(\d+):"(.*)"$', v)
        if not m:
            raise Exception("Failed to parse a PHP session value: " + v)
        length = int(m.group(1), 10)
        value_string = m.group(2)
        if length != len(value_string):
            raise Exception("The string length in a PHP session value was wrong")
        result[k] = value_string
    return result

def valid_catmaid_login(request):
    # TODO: check if valid session exists too session for user
    user_id = request.session.get( 'user_id', 0 )
    u = User.objects.get(pk=int(user_id))
    try:
        u = AuthUser.objects.get(pk=3)
    except AuthUser.DoesNotExist:
        return None

    return u

def valid_catmaid_login2(request):
    if 'PHPSESSID' not in request.COOKIES:
        return None
    phpsessid = request.COOKIES['PHPSESSID']
    sessions = Session.objects.filter(session_id=phpsessid).order_by('-last_accessed')
    if len(sessions) == 0:
        return None
    parsed_session_data = parse_php_session_data(sessions[0].data)
    if 'id' not in parsed_session_data:
        return None
    user_id = parsed_session_data['id']
    try:
        u = User.objects.get(pk=int(user_id, 10))
    except User.DoesNotExist:
        return None
    except ValueError:
        raise Exception("There was a strange value in the 'id' field: '%s'" % (user_id,))
    if 'key' not in parsed_session_data:
        return None
    if parsed_session_data['key'] != '7gtmcy8g03457xg3hmuxdgregtyu45ty57ycturemuzm934etmvo56':
        return None
    return u


def catmaid_login_required(f):
    """
    A decorator that will check that the user is logged into CATMAID,
    and if not, redirect to the login page.  If the user is logged in,
    the keyword argument 'logged_in_user' is set to to the corresponding
    User object.
    """
    def decorated_with_catmaid_login_required(request, *args, **kwargs):
        u = valid_catmaid_login(request)
        if u:
            kwargs['logged_in_user'] = u
            return f(request, *args, **kwargs)
        else:
            return redirect_to_login(request.get_full_path())

    return decorated_with_catmaid_login_required


def catmaid_login_optional(f):
    """
    A decorator that will check whether the user is logged into CATMAID;
    if so, sets the keywords argument 'logged_in_user' to a User object
    and if not, sets it to None:
    """
    def decorated_with_catmaid_login_optional(request, *args, **kwargs):
        kwargs['logged_in_user'] = valid_catmaid_login(request)
        return f(request, *args, **kwargs)

    return decorated_with_catmaid_login_optional


def catmaid_can_edit_project(f):
    """
    This decorator will return a JSON error response unless the user
    is logged in and allowed to edit the project:
    """

    def decorated_with_catmaid_can_edit_project(request, *args, **kwargs):
        u = valid_catmaid_login(request)
        if not u:
            return json_error_response(request.get_full_path() + " is not accessible unless you are logged in")
        p = Project(pk=kwargs['project_id'])
        if u in p.users.all():
            kwargs['logged_in_user'] = u
            return f(request, *args, **kwargs)
        else:
            return json_error_response("The user '%s' may not edit project %d" % (user.first_name + ' ' + user.last_name, kwargs['project_id']))

    return decorated_with_catmaid_can_edit_project


def user_project_permissions(request):
    user = valid_catmaid_login(request)
    if not user:
        return HttpResponse(json.dumps([]))

    c = connection.cursor()
    c.execute('''
            SELECT project_id, can_edit_any, can_view_any
            FROM project_user
            WHERE user_id = %s
            ''', [user.id])
    permissions = cursor_fetch_dictionary(c)
    result = {}
    for permission in permissions:
        result[permission['project_id']] = {
                'can_edit_any': permission['can_edit_any'],
                'can_view_any': permission['can_view_any']}

    return HttpResponse(json.dumps(result))
