# -*- coding: utf-8 -*-
from __future__ import unicode_literals

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
            self.Swatch(attrs),
        )

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
        return (u'R: %s G: %s B: %s A: %s %s' % tuple(rendered_widgets))

    class Swatch(forms.TextInput):
        def render(self, name, value, attrs=None):
            return (u'''
                <span style="background-image:
                            linear-gradient(45deg, #808080 25%%, transparent 25%%),
                            linear-gradient(-45deg, #808080 25%%, transparent 25%%),
                            linear-gradient(45deg, transparent 75%%, #808080 75%%),
                            linear-gradient(-45deg, transparent 75%%, #808080 75%%);
                        background-size: 20px 20px;
                        background-position: 0 0, 0 10px, 10px -10px, -10px 0px;">

                    <input id="%s"
                            style="background-color:rgba(0, 0, 0, 0);"
                            type="text" disabled="disabled">
                    </input>
                </span>
                <script>(function (id) {
                    var baseId = id.match(/^(.+)_\d$/)[1];
                    var inputIds = [0, 1, 2, 3].map(function (ind) { return baseId + "_" + ind; });

                    updateColorSwatch = function () {
                        rgba = inputIds.map(function (id) {
                            return parseFloat(document.getElementById(id).value);
                        });
                        [0, 1, 2].forEach(function (ind) {
                            rgba[ind] = Math.round(255 * rgba[ind]);
                        });
                        document.getElementById(id).style.backgroundColor = "rgba(" + rgba.join(', ') + ")";
                    };

                    inputIds.forEach(function (id) {
                        document.getElementById(id).onchange = updateColorSwatch;
                    });

                    updateColorSwatch();
                })("%s")
                </script>
                ''' % (attrs['id'], attrs['id']))
