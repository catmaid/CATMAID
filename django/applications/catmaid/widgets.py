# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django import forms
from django.forms.widgets import Widget
from six import string_types


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
            if isinstance(value, string_types):
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
            if isinstance(value, string_types):
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
            elif isinstance(value, string_types):
                try:
                    # Expect value to be of the form '(0,0,0,0)'
                    str_list = value.replace('(', '').replace(')', '').split(',')
                    return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, RGBA):
                return [value.r, value.g, value.b, value.a]
        return [None, None, None, None]
