import json
import urllib2

from django import forms
from django.core.exceptions import ValidationError
from django.contrib import messages
from django.contrib.formtools.wizard.views import SessionWizardView
from django.http import HttpResponseRedirect

from catmaid.models import Stack
from catmaid.control import dvid

TEMPLATES = {
    'server': 'catmaid/dvidimport/server.html',
    'stack': 'catmaid/dvidimport/stack.html',
    'confirm': 'catmaid/dvidimport/confirm.html',
}

class ServerForm(forms.Form):
    # The DVID server to talk to
    server = forms.URLField(label='DVID Server',
                            help_text='The DVID server you want to connect to')

    def clean_server(self):
        url = self.cleaned_data['server']

        try:
            dvid.get_server_info(url)
        except Exception, e:
            raise forms.ValidationError("Couldn't connect to %s or read valid DVID info" % url)

        return url


class StackForm(forms.Form):
    # The name of the DVID instance to create a stack for
    repository = forms.CharField(help_text='DVID repository containing the instance')
    instance = forms.CharField(help_text='DVID instance you want to create a stack from')

    def clean_repository(self):
        repository = self.cleaned_data['repository']
        try:
            self.dvid.get_repository(repository)
        except Exception, e:
            raise forms.ValidationError(e)
        return repository

    def clean_instance(self):
        repository = self.cleaned_data['repository']
        instance = self.cleaned_data['instance']
        try:
            self.dvid.get_instance(repository, instance)
        except Exception, e:
            raise ValidationError(e)
        return instance

class ConfirmForm(forms.Form):
    title = forms.CharField(help_text='Title of the new stack')
    comment = forms.CharField(help_text='Optional comment of the new stack', required=False)
    metadata = forms.CharField(help_text='Optional metadata of the new stack', required=False)

class DVIDImportWizard(SessionWizardView):
    form_list = [('server', ServerForm), ('stack', StackForm), ('confirm', ConfirmForm)]

    def get_template_names(self):
        return TEMPLATES[self.steps.current]

    def get_form(self, step=None, data=None, files=None):
        form = super(DVIDImportWizard, self).get_form(step, data, files)

        if step is None:
            step = self.steps.current

        if step == 'stack':
            # Let the stack form know about the DVID server
            dvid_server = self.get_cleaned_data_for_step('server')['server']
            form.dvid = dvid.DVIDClient(dvid_server)

        return form

    def done(self, form_list, **kwargs):
        dvid_server = self.get_cleaned_data_for_step('server')['server']
        dvid_repo = self.get_cleaned_data_for_step('stack')['repository']
        dvid_instance = self.get_cleaned_data_for_step('stack')['instance']
        title = self.get_cleaned_data_for_step('confirm')['title']
        comment = self.get_cleaned_data_for_step('confirm')['comment']
        metadata = self.get_cleaned_data_for_step('confirm')['metadata']
        dc = dvid.DVIDClient(dvid_server)
        stack_data = dc.get_instance_properties(dvid_repo, dvid_instance)
        dimension = (stack_data['dimension']['x'], stack_data['dimension']['y'],
                     stack_data['dimension']['z'])
        resolution = (stack_data['resolution']['x'], stack_data['resolution']['y'],
                     stack_data['resolution']['z'])

        # Create DVID stack and return to admin home
        stack = Stack(
            title=title,
            comment=comment,
            dimension=dimension,
            resolution=resolution,
            image_base=stack_data['image_base'],
            trakem2_project=False,
            num_zoom_levels=stack_data['zoom_levels'],
            file_extension=stack_data['file_extension'],
            tile_width=stack_data['tile_width'],
            tile_height=stack_data['tile_height'],
            tile_source_type=stack_data['tile_source_type'],
            metadata=metadata)
        stack.save()

        messages.add_message(self.request, messages.SUCCESS, "A new DVID based "
                             "stack was created successfully")
        return HttpResponseRedirect('/admin/')

    def get_context_data(self, form, **kwargs):
        context = super(DVIDImportWizard, self).get_context_data(form=form, **kwargs)

        if self.steps:
            if self.steps.current == 'stack':
                # Use DVID information from previous step
                dvid_server = self.get_cleaned_data_for_step('server')['server']
                context['dvid_server'] = dvid_server
                # Connect to server and get information on instances
                dc = dvid.DVIDClient(dvid_server)
                dvid_instances = dc.get_instance_type_map()
                context['dvid_instances'] = dvid_instances
                context['supported_instance_types'] = list(dvid.SUPPORTED_INSTANCE_TYPES)
            elif self.steps.current == 'confirm':
                dvid_server = self.get_cleaned_data_for_step('server')['server']
                dvid_repo = self.get_cleaned_data_for_step('stack')['repository']
                dvid_instance = self.get_cleaned_data_for_step('stack')['instance']
                dc = dvid.DVIDClient(dvid_server)
                context['dvid_server'] = dvid_server
                context['dvid_repo'] = dvid_repo
                context['dvid_instance'] = dvid_instance
                context['stack'] = dc.get_instance_properties(dvid_repo, dvid_instance)

        context.update({
            'title': 'DVID Importer',
        })

        return context

