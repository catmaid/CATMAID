# -*- coding: utf-8 -*-
import logging
import requests

from django import forms
from django.core.exceptions import ValidationError
from django.contrib import messages
from django.shortcuts import redirect
from formtools.wizard.views import SessionWizardView

from catmaid.control.common import is_valid_host
from catmaid.models import User


logger = logging.getLogger(__name__)


TEMPLATES = {
    'server': 'catmaid/userimport/server.html',
    'user': 'catmaid/userimport/user.html',
    'confirm': 'catmaid/userimport/confirm.html',
}


def is_remote_admin(host, api_key, auth):
    """Test if the user belonging to the API key is a superuser on a remote
    CATMAID instance.
    """
    return True


def get_remote_users(url, api_key, auth=None, with_passwords=False):
    if not url:
        raise ValueError("No URL provided")
    if auth and len(auth) != 2:
        raise ValueError("HTTP Authentication needs to be a 2-tuple")

    # Sanitize and add protocol, if not there
    url = url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url

    # Prepare headers
    headers = {
        'X-Authorization': 'Token {}'.format(api_key)
    }

    user_list_url = "{}/user-list".format(url[:-1] if url.endswith('/') else url)

    # Ask remote server for data
    r = requests.get(user_list_url, headers=headers, auth=auth, params=({
        'with_passwords': 'true' if with_passwords else 'false'}))
    if r.status_code != 200:
        raise ValueError("Unexpected status code ({}) for {}".format(
                r.status_code, user_list_url))

    if 'json' not in r.headers['content-type']:
        raise ValueError("Unexpected content type ({}) for {}".format(
                r.content_type, user_list_url))

    return r.json()


class ServerForm(forms.Form):
    catmaid_host = forms.URLField(label='CATMAID URL', required=True,
            widget=forms.TextInput( attrs={'size':'40', 'class': 'import-source-setting catmaid-host'}),
            help_text="The main URL of a remote CATMAID instance.")
    api_key = forms.CharField(required=False, widget=forms.TextInput(
            attrs={'size':'40', 'class': 'import-source-setting api-key'}),
            help_text="(Optional) API-Key of your user on the remote CATMAID instance.")
    http_auth_user = forms.CharField(required=False, widget=forms.TextInput(
            attrs={'size':'20', 'class': 'import-source-setting http-auth-user'}),
            help_text="(Optional) HTTP-Auth username for the remote server.")
    http_auth_pass = forms.CharField(required=False, widget=forms.PasswordInput(
            attrs={'size':'20', 'class': 'import-source-setting http-auth-user'}),
            help_text="(Optional) HTTP-Auth password for the remote server.")

    def clean(self):
        form_data = super(ServerForm, self).clean()

        host = form_data['catmaid_host']
        api_key = form_data['api_key']
        http_auth_user = form_data['http_auth_user'].strip()
        http_auth_pass = form_data['http_auth_pass']
        auth = None
        if http_auth_user and http_auth_pass:
            auth = (http_auth_user, http_auth_pass)

        ok, msg = is_valid_host(host, auth)
        if not ok:
            raise ValidationError({'catmaid_host': [msg]})

        # Make sure this user has admin permissions on the remote server
        if not is_remote_admin(host, api_key, auth):
            raise ValidationError({'api_key', 'User has no administrator privileges'})

        try:
            form_data['users'] = get_remote_users(host, api_key, auth, with_passwords=False)
        except Exception as e:
            raise ValidationError('Could not retrieve user information: {}'.format(e))

        return form_data


class UserForm(forms.Form):

    def __init__(self, *args, **kwargs):
        super(UserForm, self).__init__(*args, **kwargs)

        # Also parse, fields with naming "importable-remote-user
        if 'data' in kwargs and kwargs.get('data') \
                and 'importable-remote-user' in kwargs['data']:
            self.importable_users = list(map(int, kwargs['data'].getlist('importable-remote-user')))
        else:
            self.importable_users = []

    def clean(self):
        form_data = super(UserForm, self).clean()

        if hasattr(self, 'importable_users') and not self.importable_users:
            raise ValidationError("No users selected")

        form_data['users_to_import'] = self.importable_users
        return form_data


class ConfirmForm(forms.Form):
    pass


class UserImportWizard(SessionWizardView):
    form_list = [('server', ServerForm), ('user', UserForm), ('confirm', ConfirmForm)]

    def get_template_names(self):
        return TEMPLATES[self.steps.current]

    def get_context_data(self, form, **kwargs):
        context = super(UserImportWizard, self).get_context_data(form=form, **kwargs)

        if self.steps:
            if self.steps.current == 'user' or self.steps.current == 'confirm':
                users = self.get_cleaned_data_for_step('server')['users']
                context['remote_users'] = users
                context['local_users'] = set(User.objects.all().values_list('username', flat=True))

                if self.steps.current == 'confirm':
                    user_index = dict()
                    for u in users:
                        user_index[u['id']] = u
                    users_to_import_ids = self.get_cleaned_data_for_step('user')['users_to_import']
                    context['users_to_import'] = list(map(
                            lambda uid: user_index.get(uid), users_to_import_ids))

        return context

    def done(self, from_list, **kwargs):
        # Import data
        server_data = self.get_cleaned_data_for_step('server')
        host, api_key = server_data['catmaid_host'], server_data['api_key']
        http_auth_user = server_data['http_auth_user'].strip()
        http_auth_pass = server_data['http_auth_pass']
        auth = None
        if http_auth_user and http_auth_pass:
            auth = (http_auth_user, http_auth_pass)
        user_data = self.get_cleaned_data_for_step('user')
        users_to_import = user_data['users_to_import']

        try:
            users = get_remote_users(host, api_key, auth, with_passwords=True)
        except Exception as e:
            raise ValidationError('Could not retrieve user information: {}'.format(e))

        for u in users:
            if not 'password' in u:
                raise ValidationError('Could not retrieve encrypted passwords for users')

        user_index = dict()
        for u in users:
            user_index[u['id']] = u

        for user_id in users_to_import:
            u = user_index[user_id]
            new_user = User.objects.create(username=u['login'],
                    first_name=u['first_name'], last_name=u['last_name'],
                    password=u['password'])
            new_user.userprofile.color = u['color']
            new_user.userprofile.save()

        messages.add_message(self.request, messages.SUCCESS,
                "{} new user(s) have been imported".format(len(users_to_import)))
        return redirect('admin:index')
