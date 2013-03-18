from django import forms

class Integer3DWidget(forms.MultiWidget):
    """
    A widget that splits Integer3D input into three <input type="text"> boxes.
    """

    def __init__(self, attrs=None, **kwargs):
        widgets = (
            forms.TextInput(attrs),
            forms.TextInput(attrs),
            forms.TextInput(attrs),
        )
        super(Integer3DWidget, self).__init__(widgets, attrs, **kwargs)

    def decompress(self, value):
        if value:
            if isinstance(value, str) or isinstance(value, unicode):
                try:
                   # Expect value to be of the form '(0,0,0)'
                   str_list = value.replace('(', '').replace(')', '').split(',')
                   return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, Integer3DWidget):
                return [value.x, value.y, value.z]
        return [None, None, None]

    def format_output(self, rendered_widgets):
        return  u'X: ' + rendered_widgets[0] + \
            u' Y: ' + rendered_widgets[1] + u' Z: ' + rendered_widgets[2]

class Double3DWidget(forms.MultiWidget):
    """
    A widget that splits Double3D input into three <input type="text"> boxes.
    """

    def __init__(self, attrs=None, **kwargs):
        widgets = (
            forms.TextInput(attrs),
            forms.TextInput(attrs),
            forms.TextInput(attrs),
        )
        super(Double3DWidget, self).__init__(widgets, attrs, **kwargs)

    def decompress(self, value):
        if value:
            if isinstance(value, str) or isinstance(value, unicode):
                try:
                   # Expect value to be of the form '(0,0,0)'
                   str_list = value.replace('(', '').replace(')', '').split(',')
                   return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, Double3DWidget):
                return [value.x, value.y, value.z]
        return [None, None, None]

    def format_output(self, rendered_widgets):
        return  u'X: ' + rendered_widgets[0] + \
            u' Y: ' + rendered_widgets[1] + u' Z: ' + rendered_widgets[2]

class RGBAWidget(forms.MultiWidget):
    """
    A widget that splits RGBA input into three <input type="text"> boxes.
    """

    def __init__(self, attrs=None, **kwargs):
        widgets = (
            forms.TextInput(attrs),
            forms.TextInput(attrs),
            forms.TextInput(attrs),
            forms.TextInput(attrs),
        )
        super(RGBAWidget, self).__init__(widgets, attrs, **kwargs)

    def decompress(self, value):
        if value:
            if isinstance(value, str) or isinstance(value, unicode):
                try:
                   # Expect value to be of the form '(0,0,0,0)'
                   str_list = value.replace('(', '').replace(')', '').split(',')
                   return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, RGBAWidget):
                return [value.r, value.g, value.b, value.a]
        return [None, None, None, None]

    def format_output(self, rendered_widgets):
        return  u'R: %s G: %s B: %s A: %s' % rendered_widgets
