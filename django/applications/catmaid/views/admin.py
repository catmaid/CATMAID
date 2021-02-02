# -*- coding: utf-8 -*-
from django.contrib import messages
from django.http import HttpResponseRedirect
from django.views.generic import ListView
from django.utils.decorators import method_decorator
from django.urls import reverse

from catmaid.control.authentication import requires_superuser
from catmaid.control.common import get_request_list
from catmaid.control.project import delete_projects
from catmaid.models import Project


class ProjectDeletion(ListView):
    model = Project
    context_object_name = 'projects'
    template_name = 'catmaid/admin/delete_project_confirmation.html'

    def get_queryset(self):
        project_ids = map(int, self.request.GET.get('ids', '').split(','))
        if not project_ids:
            raise ValueError("No project IDs specified")
        return Project.objects.filter(id__in=project_ids)

    @method_decorator(requires_superuser())
    def post(self, *args, **kwargs):
        """Check for superuser permissions in decorator."""
        project_ids = get_request_list(self.request.POST, 'ids', map_fn=int)
        if not project_ids:
            raise ValueError("No project IDs specified")
        delete_projects(project_ids)
        messages.add_message(self.request, messages.INFO,
                f"{len(project_ids)} project(s) plus all their linked data have been deleted")
        return HttpResponseRedirect(reverse('admin:index') + 'catmaid/project')
