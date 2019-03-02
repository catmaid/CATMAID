# -*- coding: utf-8 -*-

import psycopg2
from psycopg2.extensions import register_adapter, adapt, AsIs
from psycopg2.extras import CompositeCaster, register_composite
import re

from django import forms
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.forms import SimpleArrayField
from django.core.exceptions import ValidationError
from django.dispatch import receiver, Signal
from django.db import models
from django.db.backends import signals as db_signals


from catmaid.widgets import Double3DWidget, Integer3DWidget, RGBAWidget, DownsampleFactorsWidget


# ------------------------------------------------------------------------
# Classes to support PostgreSQL composite types. Adapted from:
# http://schinckel.net/2014/09/24/using-postgres-composite-types-in-django/

class CompositeFactory(CompositeCaster):
    def make(self, values):
        return self.composite_python_class(**dict(zip(self.attnames, values)))

_missing_types = {}

class CompositeMeta(type):
    def __init__(cls, name, bases, clsdict):
        from django.db import connection
        super(CompositeMeta, cls).__init__(name, bases, clsdict)
        cls.register_composite(connection)

    def register_composite(cls, connection):
        klass = cls()
        db_type = klass.db_type(connection)
        if db_type:
            try:
                cls.python_type = register_composite(
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
                            adapt(getattr(composite, field)).getquoted().decode('utf-8') for field in cls.python_type._fields
                        ]), db_type
                    ))

                register_adapter(cls.composite_python_class, adapt_composite)


class CompositeField(models.Field, metaclass=CompositeMeta):
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

# Necessary when running in interactive contexts and from migrations.
@receiver(composite_type_created)
def register_composite_late(sender, db_type, **kwargs):
    from django.db import connection
    _missing_types.pop(db_type).register_composite(connection)

# Necessary when running in a parallel context (production, test suites).
@receiver(db_signals.connection_created)
def register_composite_connection_created(sender, connection, **kwargs):
    for subclass in CompositeField.__subclasses__():
        subclass.register_composite(connection)


# ------------------------------------------------------------------------
# Classes to support the integer3d compound type:

class Integer3D(object):

    def __init__(self, x=0, y=0, z=0):
        self.x, self.y, self.z = x, y, z

    integer_re = '[-+0-9]+'
    tuple_pattern = re.compile('^\((%s),\s*(%s),\s*(%s)\)$' % (integer_re, integer_re, integer_re))

    @classmethod
    def from_str(cls, s):
        m = cls.tuple_pattern.match(s)
        if m:
            return Integer3D(x=int(m.group(1), 10),
                             y=int(m.group(2), 10),
                             z=int(m.group(3), 10))
        else:
            raise ValidationError("Couldn't parse value as an Integer3D: " + str(s))

    def __eq__(self, other):
        return isinstance(other, Integer3D) and self.x == other.x and self.y == other.y and self.z == other.z

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

class Double3D(object):

    def __init__(self, x=0, y=0, z=0):
        self.x, self.y, self.z = x, y, z

    double_re = '[-+0-9\.Ee]+'
    tuple_pattern = re.compile(r'^\((%s),\s*(%s),\s*(%s)\)$' % (double_re, double_re, double_re))

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

class RGBA(object):

    def __init__(self, r=0, g=0, b=0, a=0):
        self.r, self.g, self.b, self.a = r, g, b, a

    double_re = '[-+0-9\.Ee]+'
    tuple_pattern = re.compile(r'^\((%s),\s*(%s),\s*(%s),\s*(%s)\)$' % (double_re, double_re, double_re, double_re))

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
        elif isinstance(value, str):
            return RGBA.from_str(value)
        else:
            return RGBA()    #.from_str(value)

    def get_db_prep_value(self, value, connection, prepared=False):
        value = self.to_python(value)
        return "(%f,%f,%f,%f)" % (value.r, value.g, value.b, value.a)

class DownsampleFactorsField(ArrayField):

    def __init__(self, *args, **kwargs):
        kwargs['blank'] = True
        kwargs['null'] = True
        kwargs['base_field'] = Integer3DField()
        super(DownsampleFactorsField, self).__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super(DownsampleFactorsField, self).deconstruct()
        del kwargs['blank']
        del kwargs['null']
        del kwargs['base_field']
        return name, path, args, kwargs

    def formfield(self, **kwargs):
        defaults = {'form_class': DownsampleFactorsFormField}
        defaults.update(kwargs)
        return super(DownsampleFactorsField, self).formfield(**defaults)

    @staticmethod
    def is_default_scale_pyramid(value):
        axes = [True, True, True]
        for l, val in enumerate(value):
            val = value[l].to_dict()
            axes = [axes[i] and val[a] == 2**l for i, a in enumerate(('x', 'y', 'z'))]
            if any(not axes[i] and not val[a] == 1 for i, a in enumerate(('x', 'y', 'z'))):
                return [False, False, False]
        return axes

    @staticmethod
    def default_scale_pyramid(axes, num_zoom_levels):
        if num_zoom_levels is None:
            return None
        base_factors = [2 if d else 1 for d in axes]
        return [Integer3D(*[d**l for d in base_factors]) for l in range(num_zoom_levels + 1)]

    @staticmethod
    def is_value(value):
        return isinstance(value, list) and all([isinstance(l, Integer3D) for l in value])

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

class DownsampleFactorsFormField(forms.MultiValueField):
    from catmaid.widgets import DownsampleFactorsWidget

    widget = DownsampleFactorsWidget

    def __init__(self, *args, **kwargs):
        fields = (
            forms.ChoiceField(
                choices=DownsampleFactorsWidget.choices,
                widget=forms.RadioSelect),
            forms.MultipleChoiceField(
                choices=DownsampleFactorsWidget.axes_choices,
                widget=forms.CheckboxSelectMultiple),
            forms.IntegerField(label='Number of zoom levels'),
            SimpleArrayField(
                # Must be disabled for Django to decompress str values during `clean`.
                Integer3DFormField(disabled=True),
                label='Factors array',
                delimiter='|',
                max_length=kwargs['max_length']),
        )
        del kwargs['max_length']
        del kwargs['base_field']
        super(DownsampleFactorsFormField, self).__init__(fields, *args, **kwargs)
        # Because SimpleArrayField does not strictly adhere to Django conventions,
        # our widget must have access to its field so that `prepare_value` can
        # be used to convert the array to a string.
        self.widget.array_field = self.fields[3]

    def compress(self, data_list):
        if data_list:
            choice = int(data_list[0])
            if choice == 0:
                return None
            elif choice == 1:
                axes = [a[0] in data_list[1] for a in DownsampleFactorsWidget.axes_choices]
                return DownsampleFactorsField.default_scale_pyramid(axes, data_list[2])
            elif choice == 2:
                return data_list[3]
        return None

    def clean(self, value):
        if DownsampleFactorsField.is_value(value):
            value = self.widget.decompress(value)

        return super().clean(value)


class SerializableGeometryField(models.Field):

    description = "A simple PostGIS TIN Geometry field that can be serialized."

    def db_type(self, connection):
        return 'geometry(TinZ)'

    def select_format(self, compiler, sql, params):
        """This geometry field will keep a simple string representation of the
        geometry. PostGIS' ST_AsText() method is used for this. While we
        technically don't need the ST_AsText() representation it makes it much
        easier to change coordinates of a volume in Django this way and makes
        exported volumes human readable.
        """
        return 'ST_AsText(%s)' % sql, params
