from django import forms
from widgets import Double3DWidget, Integer3DWidget

class Integer3DFormField(forms.MultiValueField):
    widget = Integer3DWidget

    def __init__(self, *args, **kwargs):
        fields = (
            forms.IntegerField(label='X'),
            forms.IntegerField(label='Y'),
            forms.IntegerField(label='Z'),
        )
        super(Integer3DFormField, self).__init__(fields, *args, **kwargs)

    def compress(self, data_list):
        if data_list:
            return data_list
        return [None, None, None]

class Double3DFormField(forms.MultiValueField):
    widget = Double3DWidget

    def __init__(self, *args, **kwargs):
        fields = (
            forms.FloatField(label='X'),
            forms.FloatField(label='Y'),
            forms.FloatField(label='Z'),
        )
        super(Double3DFormField, self).__init__(fields, *args, **kwargs)

    def compress(self, data_list):
        if data_list:
            return data_list
        return [None, None, None]
