import re
from django import forms
from django.db import models
from widgets import Double3DWidget, Integer3DWidget

from south.modelsinspector import add_introspection_rules

# ------------------------------------------------------------------------
# Classes to support the integer3d compound type:

class Integer3D(object):
    def __init__(self, x=0, y=0, z=0):
        self.x, self.y, self.z = x, y, z
    integer_re = '[-+0-9]+'
    tuple_pattern = re.compile('^\((%s),(%s),(%s)\)$'%((integer_re,)*3))
    @classmethod
    def from_str(cls, s):
        m = cls.tuple_pattern.match(s)
        if m:
            return Integer3D(x=int(m.group(1), 10),
                             y=int(m.group(2), 10),
                             z=int(m.group(3), 10))
        else:
            raise Exception, "Couldn't parse value from the database as an Integer3D: "+str(s)

    def __unicode__(self):
        return "(%d, %d, %d)" % (self.x, self.y, self.z)

class Integer3DField(models.Field):
    __metaclass__ = models.SubfieldBase

    def formfield(self, **kwargs):
        defaults = {'form_class': Integer3DFormField}
        defaults.update(kwargs)
        return super(Integer3DField, self).formfield(**defaults)

    def db_type(self, connection):
        return 'integer3d'
    def to_python(self, value):
        if isinstance(value, Integer3D):
            return value
        if isinstance(value, list) and len(value) == 3:
            return Integer3D(value[0], value[1], value[2])
        # When contructing a Location, we get the empty string
        # here; return a new Integer3D for any falsy value:
        if not value:
            return Integer3D()
        return Integer3D.from_str(value)
    def get_db_prep_value(self, value, connection, prepared=False):
        return "(%d,%d,%d)" % (value.x, value.y, value.z)

add_introspection_rules([([Integer3DField], [], {})],
                        [r'^catmaid\.fields\.Integer3DField'])

# ------------------------------------------------------------------------
# Classes to support the integer3d compound type:

class Double3D(object):
    def __init__(self, x=0, y=0, z=0):
        self.x, self.y, self.z = x, y, z
    double_re = '[-+0-9\.Ee]+'
    tuple_pattern = re.compile('^\((%s),(%s),(%s)\)$'%((double_re,)*3))
    @classmethod
    def from_str(cls, s):
        m = cls.tuple_pattern.match(s)
        if m:
            return Double3D(x=float(m.group(1)),
                            y=float(m.group(2)),
                            z=float(m.group(3)))
        else:
            raise Exception, "Couldn't parse value from the database as a Double3D: "+str(s)

    def __unicode__(self):
        return "(%.3f, %.3f, %.3f)" % (self.x, self.y, self.z)

class Double3DField(models.Field):
    __metaclass__ = models.SubfieldBase

    def formfield(self, **kwargs):
        defaults = {'form_class': Double3DFormField}
        defaults.update(kwargs)
        return super(Double3DField, self).formfield(**defaults)

    def db_type(self, connection):
        return 'double3d'
    def to_python(self, value):
        if isinstance(value, Double3D):
            return value
        if isinstance(value, list) and len(value) == 3:
            return Double3D(value[0], value[1], value[2])
        # When contructing a Location, we get the empty string
        # here; return a new Double3D for any falsy value:
        if not value:
            return Double3D()
        return Double3D.from_str(value)
    def get_db_prep_value(self, value, connection, prepared=False):
        return "(%f,%f,%f)" % (value.x, value.y, value.z)

add_introspection_rules([([Double3DField], [], {})],
                        [r'^catmaid\.fields\.Double3DField'])

# ------------------------------------------------------------------------

# from https://github.com/aino/django-arrayfields/blob/master/arrayfields/fields.py

import json
from django.utils.translation import ugettext_lazy as _

class ArrayFieldBase(models.Field):
    def get_prep_value(self, value):
        if value == '':
            value = '{}'
        return value

    def value_to_string(self, obj):
        value = self._get_val_from_obj(obj)
        return json.dumps(value)

    def to_python(self, value):
        if isinstance(value, basestring):
            value = json.loads(value)
        return value

    def south_field_triple(self):
        from south.modelsinspector import introspector
        name = '%s.%s' % (self.__class__.__module__ , self.__class__.__name__)
        args, kwargs = introspector(self)
        return name, args, kwargs


class IntegerArrayField(ArrayFieldBase):
    """
    An integer array field for PostgreSQL
    """
    description = _('Integer array')

    def db_type(self, connection):
        return 'integer[]'

# ------------------------------------------------------------------------

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
