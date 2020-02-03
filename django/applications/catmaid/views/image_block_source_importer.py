# -*- coding: utf-8 -*-

import json

from django import forms
from django.core.exceptions import ValidationError
from django.contrib import messages
from django.shortcuts import redirect

from formtools.wizard.views import SessionWizardView

from catmaid.models import (
    Stack, StackMirror, Project, ProjectStack, StackGroup,
    StackStackGroup, StackGroupRelation,
)
from catmaid.fields import (
    Double3DFormField, DownsampleFactorsField, DownsampleFactorsFormField,
    Integer3DFormField,
)


TEMPLATES = {
    'container': 'catmaid/imageblocksourceimport/container.html',
    'stack': 'catmaid/imageblocksourceimport/stack.html',
}

TILE_SOURCE_TYPE = 11

class ContainerForm(forms.Form):
    container = forms.URLField(label='N5 Root', widget=forms.TextInput(attrs={'size':80}),
                               help_text='URL to the root of the N5 container containing your stack')
    dataset = forms.CharField(widget=forms.TextInput(attrs={'size':80}),
                              help_text='Path to the stack dataset, not incuding scale level')
    has_scales = forms.BooleanField(required=False, label='Dataset has scale levels')

    def clean_container(self):
        container = self.cleaned_data['container']
        return container.strip('/')

    def clean_dataset(self):
        dataset = self.cleaned_data['dataset']
        return dataset.strip('/')


class StackForm(forms.Form):
    title = forms.CharField(help_text='Title of the new stack')
    slicing_dims = Integer3DFormField(initial=[0, 1, 2],
                                      help_text='Dimensions to slice the dataset corresponding the the X, Y '
                                      'and Z of the CATMAID stack')
    block_size = Integer3DFormField()
    dimension = Integer3DFormField()
    resolution = Double3DFormField()
    downsample_factors = DownsampleFactorsFormField(required=False, initial=[[1, 1, 1]], max_length=255)


class ImageBlockSourceImportWizard(SessionWizardView):
    form_list = [('container', ContainerForm), ('stack', StackForm)]

    def get_template_names(self):
        return TEMPLATES[self.steps.current]

    def get_context_data(self, form, **kwargs):
        context = super().get_context_data(form=form, **kwargs)

        if self.steps:
            if self.steps.current == 'stack':
                context['container'] = self.get_cleaned_data_for_step('container')['container']
                context['dataset'] = self.get_cleaned_data_for_step('container')['dataset']
                context['has_scales'] = self.get_cleaned_data_for_step('container')['has_scales']

        context.update({
            'title': 'N5 Source Importer',
        })

        return context

    def done(self, form_list, **kwargs):
        container = self.get_cleaned_data_for_step('container')['container']
        dataset = self.get_cleaned_data_for_step('container')['dataset']
        has_scales = self.get_cleaned_data_for_step('container')['has_scales']
        slicing_dims = self.get_cleaned_data_for_step('stack')['slicing_dims']
        title = self.get_cleaned_data_for_step('stack')['title']
        dimension = self.get_cleaned_data_for_step('stack')['dimension']
        resolution = self.get_cleaned_data_for_step('stack')['resolution']
        downsample_factors = self.get_cleaned_data_for_step('stack')['downsample_factors']
        block_size = self.get_cleaned_data_for_step('stack')['block_size']

        image_base = n5_source_url(container, dataset, has_scales, slicing_dims)

        stack = Stack(
            title=title,
            dimension=dimension,
            resolution=resolution,
            downsample_factors=downsample_factors)
        stack.save()
        mirror = StackMirror.objects.create(
            title='default',
            stack=stack,
            image_base=image_base,
            file_extension='',
            tile_width=block_size.x,
            tile_height=block_size.y,
            tile_source_type=TILE_SOURCE_TYPE)

        msg = 'A new stack was successfully created.'

        messages.add_message(self.request, messages.SUCCESS, msg)
        return redirect(f'catmaid/stack/{stack.id}/change/')

def n5_source_url(container, dataset, has_scales, slicing_dims) -> str:
    scales = '%SCALE_DATASET%' if has_scales else ''
    dataset_with_scales = '/'.join([dataset, scales]).strip('/')
    slice_str = '_'.join(str(i) for i in [slicing_dims.x, slicing_dims.y, slicing_dims.z])
    return f"{container}/{dataset_with_scales}/{slice_str}"
