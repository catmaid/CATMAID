# -*- coding: utf-8 -*-

import json

from django.urls import reverse
from django.conf import settings
from django.http import HttpResponseRedirect
from django.views.generic import TemplateView
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.sites.shortcuts import get_current_site
from django.apps import apps

from allauth.socialaccount import providers
from allauth.utils import get_request_param

from catmaid.control.group import update_group_memberships

User = get_user_model()


class CatmaidView(TemplateView):
    """ This view adds extra context to its template. This extra context is
    needed for some CATMAID templates.
    """

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['DEBUG'] = settings.DEBUG
        context['CATMAID_URL'] = settings.CATMAID_URL
        context['COOKIE_SUFFIX'] = settings.COOKIE_SUFFIX
        context['COMPRESSED_FILE_IDS'] = settings.COMPRESSED_FILE_IDS
        context['NON_COMPRESSED_FILES'] = settings.NON_COMPRESSED_FILES
        context['STYLESHEET_IDS'] = settings.STYLESHEET_IDS
        context['STATIC_EXTENSION_URL'] = settings.STATIC_EXTENSION_URL
        context['STATIC_EXTENSION_FILES'] = settings.STATIC_EXTENSION_FILES
        context['HISTORY_TRACKING'] = settings.HISTORY_TRACKING
        context['USER_REGISTRATION_ALLOWED'] = settings.USER_REGISTRATION_ALLOWED
        context['EXPAND_FRONTEND_ERRORS'] = getattr(settings, 'EXPAND_FRONTEND_ERRORS', False)

        extension_config = {}
        for ie in settings.INSTALLED_EXTENSIONS:
            try:
                app = apps.get_app_config(ie)
                if hasattr(app, 'get_config'):
                    extension_config[ie] = app.get_config()
                else:
                    extension_config[ie] = {}
            except:
                pass
        context['EXTENSION_CONFIG'] = json.dumps(extension_config)

        # Extra authentication provided through allauth. The login URL is
        # basically constructed like in the allauth templatetags.
        extra_auth_config = {}
        site = get_current_site(self.request)
        query = {}
        next = get_request_param(self.request, 'next')
        if next:
            query['next'] = next
        for sapp in site.socialapp_set.all():
            provider = providers.registry.by_id(sapp.provider, self.request)
            extra_auth_config[sapp.provider] = {
                'name': provider.name,
                'login_url': provider.get_login_url(self.request, **query),
            }
        context['EXTRA_AUTH_CONFIG'] = json.dumps(extra_auth_config)

        profile_context = self.request.user.userprofile.as_dict()
        context.update(profile_context)

        return context

class UseranalyticsView(TemplateView):
    template_name = "catmaid/useranalytics.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['CATMAID_URL'] = settings.CATMAID_URL
        context['HISTORY_TRACKING'] = settings.HISTORY_TRACKING
        return context

class UserProficiencyView(TemplateView):
    template_name = "catmaid/userproficiency.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['CATMAID_URL'] = settings.CATMAID_URL
        return context

class GroupMembershipHelper(TemplateView):
    template_name = "catmaid/groupmembershiphelper.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['catmaid_url'] = settings.CATMAID_URL
        context['users'] = User.objects.all()
        context['groups'] = Group.objects.all()
        return context

    def post(self, request, *args, **kwargs):
        redirect_url = reverse('admin:groupmembershiphelper')
        # Make sure only superusers can update permissions
        if not request.user.is_superuser:
            messages.error(request, 'Only superusers can update permissions')
            return HttpResponseRedirect(redirect_url)

        action = request.POST.get('action')
        if not action:
            messages.error('No action provided')
            return HttpResponseRedirect(redirect_url)

        # Collect user and group information
        source_users = set(map(int, request.POST.getlist('source-users')))
        source_groups = set(map(int, request.POST.getlist('source-groups')))
        target_users = set(map(int, request.POST.getlist('target-users')))
        target_groups = set(map(int, request.POST.getlist('target-groups')))

        updated, warnings = update_group_memberships(action, source_users, source_groups,
                target_users, target_groups)

        for w in warnings:
            messages.warning(request, w)

        if updated:
            messages.success(request, f'Successfully updated {updated} permissions')
        else:
            messages.error('No permission updated')

        return HttpResponseRedirect(redirect_url)
