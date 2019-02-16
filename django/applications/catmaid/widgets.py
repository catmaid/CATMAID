# -*- coding: utf-8 -*-

from django import forms
from django.forms.widgets import Widget

import catmaid.fields


class Swatch(Widget):
    """A simple widget that shows a color field for the RGBAWidget."""

    template_name = 'catmaid/widgets/swatch.html'

class LabeledMultiWidget(forms.MultiWidget):
    """Display a label left to each sub-widget."""

    template_name = 'catmaid/widgets/multiwidget.html'

    def __init__(self, labels, widgets, attrs, **kwargs):
        self.labels = labels
        super(LabeledMultiWidget, self).__init__(widgets, attrs, **kwargs)

    def get_context(self, name, value, attrs):
        context = super(LabeledMultiWidget, self).get_context(name, value, attrs)
        context['labels'] = self.labels
        return context

class Integer3DWidget(LabeledMultiWidget):
    """
    A widget that splits Integer3D input into three <input type="text"> boxes.
    """

    def __init__(self, attrs=None, **kwargs):
        widgets = (
            forms.TextInput(attrs),
            forms.TextInput(attrs),
            forms.TextInput(attrs),
        )
        super(Integer3DWidget, self).__init__(('X', 'Y', 'Z'), widgets, attrs,
                **kwargs)

    def decompress(self, value):
        from catmaid.fields import Integer3D
        if value:
            if isinstance(value, str):
                try:
                    # Expect value to be of the form '(0,0,0)'
                    str_list = value.replace('(', '').replace(')', '').split(',')
                    return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, Integer3D):
                return [value.x, value.y, value.z]
        return [None, None, None]

class Double3DWidget(LabeledMultiWidget):
    """
    A widget that splits Double3D input into three <input type="text"> boxes.
    """

    def __init__(self, attrs=None, **kwargs):
        widgets = (
            forms.TextInput(attrs),
            forms.TextInput(attrs),
            forms.TextInput(attrs),
        )
        super(Double3DWidget, self).__init__(('X', 'Y', 'Z'), widgets, attrs,
                **kwargs)

    def decompress(self, value):
        from catmaid.fields import Double3D
        if value:
            if isinstance(value, str):
                try:
                    # Expect value to be of the form '(0,0,0)'
                    str_list = value.replace('(', '').replace(')', '').split(',')
                    return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, Double3D):
                return [value.x, value.y, value.z]
        return [None, None, None]

class RGBAWidget(LabeledMultiWidget):
    """
    A widget that splits RGBA input into three <input type="text"> boxes.
    """

    def __init__(self, attrs=None, **kwargs):
        widgets = (
            forms.TextInput(attrs),
            forms.TextInput(attrs),
            forms.TextInput(attrs),
            forms.TextInput(attrs),
            Swatch(attrs),
        )

        super(RGBAWidget, self).__init__(('R', 'G', 'B', 'A', ''), widgets,
                attrs, **kwargs)

    def decompress(self, value):
        from catmaid.fields import RGBA
        if value:
            if isinstance(value, tuple) or isinstance(value, list):
                return value
            elif isinstance(value, str):
                try:
                    # Expect value to be of the form '(0,0,0,0)'
                    str_list = value.replace('(', '').replace(')', '').split(',')
                    return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, RGBA):
                return [value.r, value.g, value.b, value.a]
        return [None, None, None, None]

class DownsampleFactorsWidget(forms.MultiWidget):
    """
    A widget that displays increasingly customized and complex options for
    entering downsampling factors.
    """

    template_name = "catmaid/widgets/downsamplefactors.html"

    choices = (
                    (0, 'CATMAID default'),
                    (1, 'Factor-2 downsampling scale pyramid'),
                    (2, 'Custom downsampling'),
                )

    axes_choices = (('X', 'X'), ('Y', 'Y'), ('Z', 'Z'))

    def __init__(self, attrs=None, **kwargs):
        widgets = (
            forms.RadioSelect(attrs, choices=DownsampleFactorsWidget.choices),
            forms.CheckboxSelectMultiple(choices=DownsampleFactorsWidget.axes_choices),
            forms.NumberInput(attrs={'min': '0'}),
            forms.TextInput(attrs),
        )

        super(DownsampleFactorsWidget, self).__init__(widgets,
                attrs, **kwargs)

    def decompress(self, value):
        if value is None:
            return [0, ['X', 'Y'], None, None]

        axes = catmaid.fields.DownsampleFactorsField.is_default_scale_pyramid(value)
        if any(axes):
            axes_names = [DownsampleFactorsWidget.axes_choices[i][0] for i, d in enumerate(axes) if d]
            return [1, axes_names, len(value) - 1, self.array_field.prepare_value(value)]
        else:
            return [2, ['X', 'Y'], len(value) - 1, self.array_field.prepare_value(value)]

    def get_context(self, name, value, attrs):
        # Django doesn't play well with MultiValueFields/MultiWidgets whose
        # normalization type is a list, so will not try to decompress list
        # values by default.
        if catmaid.fields.DownsampleFactorsField.is_value(value):
            value = self.decompress(value)
        return super(DownsampleFactorsWidget, self).get_context(name, value, attrs)
