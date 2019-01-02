# -*- coding: utf-8 -*-

from django.urls import reverse
from django.conf import settings
from django.http import HttpResponseRedirect
from django.views.generic import TemplateView
from django.contrib import messages
from django.contrib.auth.models import User, Group

class CatmaidView(TemplateView):
    """ This view adds extra context to its template. This extra context is
    needed for some CATMAID templates.
    """

    def get_context_data(self, **kwargs):
        context = super(self.__class__, self).get_context_data(**kwargs)
        context['CATMAID_URL'] = settings.CATMAID_URL
        context['COOKIE_SUFFIX'] = settings.COOKIE_SUFFIX
        context['COMPRESSED_FILE_IDS'] = settings.COMPRESSED_FILE_IDS
        context['NON_COMPRESSED_FILES'] = settings.NON_COMPRESSED_FILES
        context['STYLESHEET_IDS'] = settings.STYLESHEET_IDS
        context['STATIC_EXTENSION_URL'] = settings.STATIC_EXTENSION_URL
        context['STATIC_EXTENSION_FILES'] = settings.STATIC_EXTENSION_FILES
        context['HISTORY_TRACKING'] = settings.HISTORY_TRACKING
        context['EXPAND_FRONTEND_ERRORS'] = getattr(settings, 'EXPAND_FRONTEND_ERRORS', False)

        profile_context = self.request.user.userprofile.as_dict()
        context.update(profile_context)

        return context

class UseranalyticsView(TemplateView):
    template_name = "catmaid/useranalytics.html"

    def get_context_data(self, **kwargs):
        context = super(UseranalyticsView, self).get_context_data(**kwargs)
        context['CATMAID_URL'] = settings.CATMAID_URL
        context['HISTORY_TRACKING'] = settings.HISTORY_TRACKING
        return context

class UserProficiencyView(TemplateView):
    template_name = "catmaid/userproficiency.html"

    def get_context_data(self, **kwargs):
        context = super(UserProficiencyView, self).get_context_data(**kwargs)
        context['CATMAID_URL'] = settings.CATMAID_URL
        return context

class GroupMembershipHelper(TemplateView):
    template_name = "catmaid/groupmembershiphelper.html"

    def get_context_data(self, **kwargs):
        context = super(GroupMembershipHelper, self).get_context_data(**kwargs)
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

        # Find all users in source groups
        def explode_group_into_users(groups, users):
            if groups:
                group_users = User.objects.filter(groups__in=groups) \
                    .values_list('id', flat=True)
                users.update(group_users)

        explode_group_into_users(source_groups, source_users)
        if not source_users:
            messages.error(request, 'Need at least one source user or '
                           'non-empty source group')
            return HttpResponseRedirect(redirect_url)

        explode_group_into_users(target_groups, target_users)
        if not target_users:
            messages.error(request, 'Need at least one target user or '
                           'non-empty target group')
            return HttpResponseRedirect(redirect_url)

        # We now have a set of source users and a set of target users. This
        # allows us to create the requested group memberships. Each source
        # user is added to each target user group.
        updated = 0
        for target_user in target_users:
            users = User.objects.filter(id=target_user)
            n_user_instances = len(users)
            if 0 == n_user_instances:
                messages.warning(request, 'Could not find user with ID {}'.format(target_user))
                continue
            if 1 < n_user_instances:
                messages.warning(request, 'Found more than one user with ID {}'.format(target_user))
                continue

            user = users[0]

            group, _ = Group.objects.get_or_create(name=user.username)
            if 'add' == action:
                group.user_set.add(*source_users)
                updated += 1
            elif 'revoke' == action:
                group.user_set.remove(*source_users)
                updated += 1

        messages.success(request, 'Successfully updated {} permissions'.format(updated))
        return HttpResponseRedirect(redirect_url)
