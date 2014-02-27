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
        from catmaid.fields import Integer3D
        if value:
            if isinstance(value, str) or isinstance(value, unicode):
                try:
                   # Expect value to be of the form '(0,0,0)'
                   str_list = value.replace('(', '').replace(')', '').split(',')
                   return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, Integer3D):
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
        from catmaid.fields import Double3D
        if value:
            if isinstance(value, str) or isinstance(value, unicode):
                try:
                   # Expect value to be of the form '(0,0,0)'
                   str_list = value.replace('(', '').replace(')', '').split(',')
                   return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, Double3D):
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
        for widget in widgets:
            widget.attrs['onchange'] = 'update_color_swatch();'
        super(RGBAWidget, self).__init__(widgets, attrs, **kwargs)

    def decompress(self, value):
        from catmaid.fields import RGBA
        if value:
            if isinstance(value, tuple) or isinstance(value, list):
                return value
            elif isinstance(value, str) or isinstance(value, unicode):
                try:
                   # Expect value to be of the form '(0,0,0,0)'
                   str_list = value.replace('(', '').replace(')', '').split(',')
                   return [float(num) for num in str_list]
                except ValueError:
                    pass
            elif isinstance(value, RGBA):
                return [value.r, value.g, value.b, value.a]
        return [None, None, None, None]

    def format_output(self, rendered_widgets):
        return  (u'R: %s G: %s B: %s A: %s' % tuple(rendered_widgets) + 
            u'''<input id="id_userprofile-0-color-swatch"
                    type="text" disabled="disabled"
                    style="background-color:#000000; margin-left:1em;">
                </input>
                <script>update_color_swatch = function() {
                    var r = parseInt(parseFloat(document.getElementById(
                            "id_userprofile-0-color_0").value) * 255),
                        g = parseInt(parseFloat(document.getElementById(
                            "id_userprofile-0-color_1").value) * 255),
                        b = parseInt(parseFloat(document.getElementById(
                            "id_userprofile-0-color_2").value) * 255);
                    document.getElementById("id_userprofile-0-color-swatch").
                            style.backgroundColor = "rgb("+r+","+g+","+b+")";
                    };
                    update_color_swatch();
                </script>''')
