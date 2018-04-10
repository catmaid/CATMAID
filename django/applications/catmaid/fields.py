# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from six import string_types

import psycopg2
from psycopg2.extensions import register_adapter, adapt, AsIs
import six
import re

from django import forms
from django.core.exceptions import ValidationError
from django.dispatch import receiver, Signal
from django.db import connection, models
from django.utils.encoding import python_2_unicode_compatible


from catmaid.widgets import Double3DWidget, Integer3DWidget, RGBAWidget


# ------------------------------------------------------------------------
# Classes to support PostgreSQL composite types. Adapted from:
# http://schinckel.net/2014/09/24/using-postgres-composite-types-in-django/

class CompositeFactory(psycopg2.extras.CompositeCaster):
    def make(self, values):
        return self.composite_python_class(**dict(six.moves.zip(self.attnames, values)))

_missing_types = {}

class CompositeMeta(type):
    def __init__(cls, name, bases, clsdict):
        super(CompositeMeta, cls).__init__(name, bases, clsdict)
        cls.register_composite()

    def register_composite(cls):
        klass = cls()
        db_type = klass.db_type(connection)
        if db_type:
            try:
                cls.python_type = psycopg2.extras.register_composite(
                    str(db_type),
                    connection.cursor().cursor,
                    globally=True,
                    factory=klass.factory_class()
                ).type
            except psycopg2.ProgrammingError:
                _missing_types[db_type] = cls
            else:
                def adapt_composite(composite):
                    # For safety, `composite_python_class` must have the same
                    # attributes as the namedtuple `python_type`'s fields, so
                    # that those can be escaped rather than relying on
                    # `__str__`.
                    return AsIs("(%s)::%s" % (
                        ", ".join([
                            adapt(getattr(composite, field)).getquoted() for field in cls.python_type._fields
                        ]), db_type
                    ))

                register_adapter(cls.composite_python_class, adapt_composite)


@six.add_metaclass(CompositeMeta)
class CompositeField(models.Field):
    """Base class for PostgreSQL composite fields.

    Rather than use psycopg2's default namedtuple types, adapt to a custom
    Python type in `composite_python_class` that takes fields as init kwargs.
    """

    def factory_class(self):
        newclass = type(
            str('%sFactory' % type(self.composite_python_class).__name__),
            (CompositeFactory,),
            {'composite_python_class': self.composite_python_class})
        return newclass


composite_type_created = Signal(providing_args=['name'])

@receiver(composite_type_created)
def register_composite_late(sender, db_type, **kwargs):
    _missing_types.pop(db_type).register_composite()


# ------------------------------------------------------------------------
# Classes to support the integer3d compound type:

@python_2_unicode_compatible
class Integer3D(object):

    def __init__(self, x=0, y=0, z=0):
        self.x, self.y, self.z = x, y, z

    integer_re = '[-+0-9]+'
    tuple_pattern = re.compile('^\((%s),\s*(%s),\s*(%s)\)$'%((integer_re,)*3))

    @classmethod
    def from_str(cls, s):
        m = cls.tuple_pattern.match(s)
        if m:
            return Integer3D(x=int(m.group(1), 10),
                             y=int(m.group(2), 10),
                             z=int(m.group(3), 10))
        else:
            raise ValidationError("Couldn't parse value as an Integer3D: " + str(s))

    def __str__(self):
        return "(%d, %d, %d)" % (self.x, self.y, self.z)

    def to_dict(self):
        return {'x': self.x, 'y': self.y, 'z': self.z}

class Integer3DField(CompositeField):
    composite_python_class = Integer3D

    def formfield(self, **kwargs):
        defaults = {'form_class': Integer3DFormField}
        defaults.update(kwargs)
        return super(Integer3DField, self).formfield(**defaults)

    def db_type(self, connection):
        return 'integer3d'

    def to_python(self, value):
        if isinstance(value, Integer3D):
            return value
        elif (isinstance(value, list) or isinstance(value, tuple)) and len(value) == 3:
            return Integer3D(value[0], value[1], value[2])
        # When contructing a Location, we get the empty string
        # here; return a new Integer3D for any falsy value:
        elif not value:
            return Integer3D()
        else:
            return Integer3D.from_str(value)

    def get_db_prep_value(self, value, connection, prepared=False):
        return self.to_python(value)


# ------------------------------------------------------------------------
# Classes to support the double3d compound type:

@python_2_unicode_compatible
class Double3D(object):

    def __init__(self, x=0, y=0, z=0):
        self.x, self.y, self.z = x, y, z

    double_re = '[-+0-9\.Ee]+'
    tuple_pattern = re.compile(r'^\((%s),\s*(%s),\s*(%s)\)$' % ((double_re,)*3))

    @classmethod
    def from_str(cls, s):
        m = cls.tuple_pattern.match(s)
        if m:
            return Double3D(x=float(m.group(1)),
                            y=float(m.group(2)),
                            z=float(m.group(3)))
        else:
            raise ValidationError("Couldn't parse value from the database as a Double3D: " + str(s))

    def __str__(self):
        return u"(%.3f, %.3f, %.3f)" % (self.x, self.y, self.z)

class Double3DField(models.Field):

    def formfield(self, **kwargs):
        defaults = {'form_class': Double3DFormField}
        defaults.update(kwargs)
        return super(Double3DField, self).formfield(**defaults)

    def db_type(self, connection):
        return 'double3d'

    def from_db_value(self, value, expression, connection, context):
        if value is None:
            return value

        return Double3D.from_str(value)

    def to_python(self, value):
        if isinstance(value, Double3D):
            return value
        elif (isinstance(value, list) or isinstance(value, tuple)) and len(value) == 3:
            return Double3D(value[0], value[1], value[2])
        # When contructing a Location, we get the empty string
        # here; return a new Double3D for any falsy value:
        elif not value or value == '(,,)':
            return Double3D()
        else:
            return Double3D.from_str(value)

    def get_db_prep_value(self, value, connection, prepared=False):
        value = self.to_python(value)
        return "(%f,%f,%f)" % (value.x, value.y, value.z)

# ------------------------------------------------------------------------
# Classes to support the rgba compound type:

@python_2_unicode_compatible
class RGBA(object):

    def __init__(self, r=0, g=0, b=0, a=0):
        self.r, self.g, self.b, self.a = r, g, b, a

    double_re = '[-+0-9\.Ee]+'
    tuple_pattern = re.compile(r'^\((%s),\s*(%s),\s*(%s),\s*(%s)\)$' % ((double_re,)*4))

    @classmethod
    def from_str(cls, s):
        m = cls.tuple_pattern.match(s)
        if m:
            return RGBA(r=float(m.group(1)),
                        g=float(m.group(2)),
                        b=float(m.group(3)),
                        a=float(m.group(4)))
        else:
            raise ValidationError("Couldn't parse value as an RGBA: " + str(s))

    def hex_color(self):
        return "#{0:06x}".format((int(self.r * 255) << 16) + (int(self.g * 255) << 8) + int(self.b * 255))

    def __str__(self):
        return u"(%.3f, %.3f, %.3f, %.3f)" % (self.r, self.g, self.b, self.a)

class RGBAField(models.Field):

    def formfield(self, **kwargs):
        defaults = {'form_class': RGBAFormField}
        defaults.update(kwargs)
        return super(RGBAField, self).formfield(**defaults)

    def db_type(self, connection):
        return 'rgba'

    def from_db_value(self, value, expression, connection, context):
        if value is None:
            return value

        return RGBA.from_str(value)

    def to_python(self, value):
        if isinstance(value, RGBA):
            return value
        elif (isinstance(value, list) or isinstance(value, tuple)) and len(value) == 3:
            return RGBA(value[0], value[1], value[2], 1)
        elif (isinstance(value, list) or isinstance(value, tuple)) and len(value) == 4:
            return RGBA(value[0], value[1], value[2], value[3])
        # When contructing a Location, we get the empty string
        # here; return a new RGBA for any falsy value:
        elif not value:
            return RGBA()
        elif isinstance(value, string_types):
            return RGBA.from_str(value)
        else:
            return RGBA()    #.from_str(value)

    def get_db_prep_value(self, value, connection, prepared=False):
        value = self.to_python(value)
        return "(%f,%f,%f,%f)" % (value.r, value.g, value.b, value.a)

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
            return Integer3D(*data_list)
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

class RGBAFormField(forms.MultiValueField):
    widget = RGBAWidget

    def __init__(self, *args, **kwargs):
        fields = (
            forms.FloatField(label='R'),
            forms.FloatField(label='G'),
            forms.FloatField(label='B'),
            forms.FloatField(label='A'),
        )
        super(RGBAFormField, self).__init__(fields, *args, **kwargs)

    def compress(self, data_list):
        if data_list:
            return data_list
        return [None, None, None]
