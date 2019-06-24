# -*- coding: utf-8 -*-
import logging
import requests
from datetime import datetime
import os

from django import forms
from django.core.exceptions import ValidationError
from django.contrib import messages
from django.shortcuts import redirect
from formtools.wizard.views import SessionWizardView

from catmaid.models import Project
from catmaid.management.commands.catmaid_export_data import Exporter

from django.conf import settings

logger = logging.getLogger(__name__)

TEMPLATES = {
    'server': 'catmaid/dataexporter/server.html',
}

class ServerForm(forms.Form):
    source_project_id = forms.CharField(required=True, widget=forms.TextInput(
        attrs={'size':'20'}),
        help_text="The ID of the source project")

    export_treenodes = forms.BooleanField(initial=True, required=False,
        help_text="Export treenodes from source")

    export_connectors = forms.BooleanField(initial=False, required=False,
        help_text="Export connectors from source")

    export_annotations = forms.BooleanField(initial=False, required=False,
        help_text="Export annotations from source")

    export_tags = forms.BooleanField(initial=False, required=False,
        help_text="Export tags from source")

    export_users = forms.BooleanField(initial=False, required=False,
        help_text="Export users from source")

    export_volumes = forms.BooleanField(initial=False, required=False,
        help_text="Export volumes from source. More constraints can be provided using the volume-annotation")

    required_annotations = forms.CharField(required=False, widget=forms.TextInput(
        attrs={'size':'20'}),
        help_text="Name a required annotation for exported skeletons. Meta-annotations can be used as well.")

    excluded_annotations = forms.CharField(required=False, widget=forms.TextInput(
        attrs={'size':'20'}),
        help_text="Name an annotation that is used to exclude skeletons from the export. Meta-annotations can be used as well.")

    volume_annotations = forms.CharField(required=False, widget=forms.TextInput(
        attrs={'size':'20'}),
        help_text="Name a required annotation for exported volumes. Meta-annotations can be used as well.")

    original_placeholder_context = forms.BooleanField(initial=False, required=False,
        help_text="Whether or not exported placeholder nodes refer to their original skeltons and neurons")

    exclusion_is_final = forms.BooleanField(initial=False, required=False,
        help_text='Whether or not neurons ' +
        'should be excluded if in addition to an exclusion annotation ' +
        'they are also annotated with a required (inclusion) annotation.')

    def clean(self):
        form_data = super(ServerForm, self).clean()
        return form_data

class CatmaidDataExportWizard(SessionWizardView):
    form_list = [('server', ServerForm)]

    def get_template_names(self):
        return TEMPLATES[self.steps.current]

    def get_context_data(self, form, **kwargs):
        context = super(CatmaidDataExportWizard, self).get_context_data(form=form, **kwargs)
        return context

    def done(self, from_list, **kwargs):
        source_project_id = self.get_cleaned_data_for_step('server')['source_project_id']

        try:
            source_project = Project.objects.get(id=int(source_project_id))
        except:
            raise Exception('Could not retrieve project with id {}'.format(source_project_id))

        values = self.get_cleaned_data_for_step('server')

        now = datetime.now().strftime('%Y-%m-%d-%H-%M')

        exported_fname = os.path.join(settings.MEDIA_ROOT,
            settings.MEDIA_EXPORT_SUBDIRECTORY,
            'catmaid-export-pid-{}-{}.json'.format(values['source_project_id'], now))

        options = {
            "export_treenodes": values["export_treenodes"],
            "export_connectors": values["export_connectors"],
            "export_annotations": values["export_annotations"],
            "export_tags": values["export_tags"],
            "export_users": values["export_users"],
            "export_volumes": values["export_volumes"],
            "required_annotations": values["required_annotations"],
            "excluded_annotations": values["excluded_annotations"],
            "volume_annotations": values["volume_annotations"],
            "original_placeholder_context": values["original_placeholder_context"],
            "exclusion_is_final": values["exclusion_is_final"],
            "run_noninteractive": True,
            "file": exported_fname,
        }

        logger.info("Export project data ...")
        exporter = Exporter(source_project, options)
        exporter.export()
        logger.info("Export project data finished.")

        messages.add_message(self.request, messages.SUCCESS,
                "CATMAID Project exported to: {}".format(exported_fname))

        return redirect('admin:index')
