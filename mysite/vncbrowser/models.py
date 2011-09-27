from django import forms
from django.db import models
from datetime import datetime
import sys
import re

def now():
    return datetime.now()

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

class Integer3DField(models.Field):
    __metaclass__ = models.SubfieldBase
    def db_type(self, connection):
        return 'integer3d'
    def to_python(self, value):
        if isinstance(value, Integer3D):
            return value
        # When contructing a Location, we get the empty string
        # here; return a new Integer3D for any falsy value:
        if not value:
            return Integer3D()
        return Integer3D.from_str(value)
    def get_db_prep_value(self, value, connection, prepared=False):
        return "(%d,%d,%d)" % (value.x, value.y, value.z)

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

class Double3DField(models.Field):
    __metaclass__ = models.SubfieldBase
    def db_type(self, connection):
        return 'double3d'
    def to_python(self, value):
        if isinstance(value, Double3D):
            return value
        # When contructing a Location, we get the empty string
        # here; return a new Double3D for any falsy value:
        if not value:
            return Double3D()
        print >> sys.stderr, "value is %s, of type %s" % (value, type(value))
        return Double3D.from_str(value)
    def get_db_prep_value(self, value, connection, prepared=False):
        return "(%f,%f,%f)" % (value.x, value.y, value.z)

# ------------------------------------------------------------------------

class Project(models.Model):
    class Meta:
        db_table = "project"
        managed = False
    id = models.AutoField(primary_key=True)
    title = models.TextField()
    public = models.BooleanField(default=True)
    stacks = models.ManyToManyField("Stack",
                                    through='ProjectStack',
                                    related_name='projects')

class Stack(models.Model):
    class Meta:
        db_table = "stack"
        managed = False
    id = models.AutoField(primary_key=True)
    title = models.TextField()
    dimension = Integer3DField()
    resolution = Double3DField()
    image_base = models.TextField()
    comment = models.TextField(null=True)
    trakem2_project = models.BooleanField()

class ProjectStack(models.Model):
    class Meta:
        db_table = "project_stack"
        managed = False
    project = models.ForeignKey(Project)
    stack = models.ForeignKey(Stack)

class User(models.Model):
    class Meta:
        db_table = "user"
        managed = False
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=30)
    pwd = models.CharField(max_length=30)
    longname = models.TextField()

class Concept(models.Model):
    class Meta:
        db_table = "concept"
        managed = False
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)

class Class(models.Model):
    class Meta:
        db_table = "class"
        managed = False
    # Repeat the columns inherited from 'concept'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    class_name = models.CharField(max_length=255)
    description = models.TextField()

class ClassInstance(models.Model):
    class Meta:
        db_table = "class_instance"
        managed = False
    # Repeat the columns inherited from 'concept'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    class_column = models.ForeignKey(Class, db_column="class_id") # underscore since class is a keyword
    name = models.CharField(max_length=255)


class Relation(models.Model):
    class Meta:
        db_table = "relation"
        managed = False
    # Repeat the columns inherited from 'concept'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    relation_name = models.CharField(max_length=255)
    uri = models.TextField()
    description = models.TextField()
    isreciprocal = models.BooleanField()

class RelationInstance(models.Model):
    class Meta:
        db_table = "relation_instance"
        managed = False
    # Repeat the columns inherited from 'concept'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    relation = models.ForeignKey(Relation)

class ClassInstanceClassInstance(models.Model):
    class Meta:
        db_table = "class_instance_class_instance"
        managed = False
    # Repeat the columns inherited from 'relation_instance'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    class_instance_a = models.ForeignKey(ClassInstance, related_name='class_instances_a')
    class_instance_b = models.ForeignKey(ClassInstance, related_name='class_instances_b')

class BrokenSlice(models.Model):
    class Meta:
        db_table = "broken_slice"
        managed = False
    stack = models.ForeignKey(Stack)
    index = models.IntegerField()

class ClassClass(models.Model):
    class Meta:
        db_table = "class_class"
        managed = False
    # Repeat the columns inherited from 'relation_instance'
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    class_a = models.ForeignKey(Class, related_name='classes_a')
    class_b = models.ForeignKey(Class, related_name='classes_b')

class Message(models.Model):
    class Meta:
        db_table = "message"
        managed = False
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    time = models.DateTimeField(default=now)
    read = models.BooleanField()
    title = models.TextField()
    text = models.TextField(null=True)
    action = models.TextField()

class Settings(models.Model):
    class Meta:
        db_table = "settings"
        managed = False
    key = models.TextField()
    value = models.TextField(null=True)

class Textlabel(models.Model):
    class Meta:
        db_table = "textlabel"
        managed = False
    id = models.AutoField(primary_key=True)
    type = models.CharField(max_length=32)
    text = models.TextField(default="Edit this text ...")
    # colour is of type rgba, can't represent that yet
    font_name = models.TextField(null=True)
    font_style = models.TextField(null=True)
    font_size = models.FloatField(default=32)
    project = models.ForeignKey(Project)
    scaling = models.BooleanField(default=True)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    deleted = models.BooleanField()

class TextlabelLocation(models.Model):
    class Meta:
        db_table = "textlabel_location"
        managed = False
    textlabel = models.ForeignKey(Textlabel)
    # location is of type double3d, can't represent that yet
    deleted = models.BooleanField()

class Location(models.Model):
    class Meta:
        db_table = "location"
        managed = False
    # id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    location = Double3DField()

# ------------------------------------------------------------------------
# Now the non-Django tables:

SORT_ORDERS_TUPLES = [ ( 'name', ('name', False, 'Neuron name') ),
                       ( 'namer', ('name', True, 'Neuron name (reversed)') ),
                       ( 'gal4', ('gal4', False, 'GAL4 lines') ),
                       ( 'gal4r', ('gal4', True, 'GAL4 lines (reversed)') ),
                       ( 'cellbody', ('cell_body', False, 'Cell body location') ),
                       ( 'cellbodyr' , ('cell_body', True, 'Cell body location (reversed)') ) ]
SORT_ORDERS_DICT = dict(SORT_ORDERS_TUPLES)
SORT_ORDERS_CHOICES = tuple((x[0],SORT_ORDERS_DICT[x[0]][2]) for x in SORT_ORDERS_TUPLES)

class Neuron(object):
    # name = models.CharField(max_length=1000,unique=True,null=False)
    # trakem2_id = models.IntegerField(null=True)
    # lines = models.ManyToManyField(Line)
    CELL_BODY_UNKNOWN = 0
    CELL_BODY_LOCAL = 1
    CELL_BODY_NON_LOCAL = 2
    CELL_BODY_CHOICES = ( (CELL_BODY_UNKNOWN, 'Unknown'),
                          (CELL_BODY_LOCAL, 'Local'),
                          (CELL_BODY_NON_LOCAL, 'Non-Local') )
    cell_body_choices_dict = dict(CELL_BODY_CHOICES)
    # cell_body = models.IntegerField(default=CELL_BODY_UNKNOWN,choices=CELL_BODY_CHOICES)
    def __unicode__(self):
        return self.name
    def lines_as_str(self):
        return ', '.join([unicode(x) for x in self.lines.all()])
    def to_dict(self):
        return {'id': self.id,
                'trakem2_id': self.trakem2_id,
                'lineage' : 'unknown',
                'neurotransmitters': [],
                'cell_body_location': [ self.cell_body, Neuron.cell_body_choices_dict[self.cell_body] ],
                'name': self.name}

class NeuronSearch(forms.Form):
    search = forms.CharField(max_length=100,required=False)
    cell_body_location = forms.ChoiceField(
        choices=(((-1,'Any'),)+Neuron.CELL_BODY_CHOICES))
    order_by = forms.ChoiceField(SORT_ORDERS_CHOICES)
    def minimal_search_path(self):
        result = ""
        parameters = [ ( 'search', '/find/', '' ),
                       ( 'order_by', '/sorted/', 'name' ),
                       ( 'cell_body_location', '/cell_body_location/', "-1" ) ]
        for p in parameters:
            if self.cleaned_data[p[0]] != p[2]:
                result += p[1] + urllib.quote(str(self.cleaned_data[p[0]]))
        return result

class ApiKey(models.Model):
    description = models.TextField()
    key = models.CharField(max_length=128)
