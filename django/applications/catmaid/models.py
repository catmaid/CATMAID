from django import forms
from django.db import models
from django.db.models import Q
from datetime import datetime
import sys
import re
import urllib

from django.contrib.auth.models import User
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType

from guardian.shortcuts import get_objects_for_user


def now():
    return datetime.now()

CELL_BODY_CHOICES = (
    ('u', 'Unknown'),
    ('l', 'Local'),
    ('n', 'Non-Local' ))

class UserRole(object):
    Admin = 'Admin'
    Annotate = 'Annotate'
    Browse = 'Browse'

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
        return Double3D.from_str(value)
    def get_db_prep_value(self, value, connection, prepared=False):
        return "(%f,%f,%f)" % (value.x, value.y, value.z)

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


class Project(models.Model):
    class Meta:
        db_table = "project"
        managed = False
        permissions = (
            ("can_administer", "Can administer projects"), 
            ("can_annotate", "Can annotate projects"), 
            ("can_browse", "Can browse projects")
        )
    title = models.TextField()
    public = models.BooleanField(default=True)
    wiki_base_url = models.TextField()
    stacks = models.ManyToManyField("Stack",
                                    through='ProjectStack')
    
    def __unicode__(self):
        return self.title


class ProjectUser(models.Model):
    #class Meta:
    #    db_table = "project_user"
    #    managed = False
    project = models.ForeignKey(Project)
    user = models.ForeignKey(User)

    can_edit_any = models.BooleanField(default=True)
    can_view_any = models.BooleanField(default=True)
    inverse_mouse_wheel = models.BooleanField(default=False)


class Stack(models.Model):
    class Meta:
        db_table = "stack"
        managed = False
    title = models.TextField()
    dimension = Integer3DField()
    resolution = Double3DField()
    image_base = models.TextField()
    comment = models.TextField(null=True)
    trakem2_project = models.BooleanField()
    num_zoom_levels = models.IntegerField()
    file_extension = models.TextField(null=True)
    tile_width = models.IntegerField()
    tile_height = models.IntegerField()
    tile_source_type = models.IntegerField()
    metadata = models.TextField()

class ProjectStack(models.Model):
    class Meta:
        db_table = "project_stack"
        managed = False
    project = models.ForeignKey(Project)
    stack = models.ForeignKey(Stack)
    translation = Double3DField()

class Overlay(models.Model):
    class Meta:
        db_table = "overlay"
        managed = False
    title = models.TextField()
    stack = models.ForeignKey(Stack)
    image_base = models.TextField()
    default_opacity = models.IntegerField()
    file_extension = models.TextField(null=True)

class Concept(models.Model):
    class Meta:
        db_table = "concept"
        managed = False
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)

class Class(models.Model):
    class Meta:
        db_table = "class"
        managed = False
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    class_name = models.CharField(max_length=255)
    description = models.TextField()

class ConnectivityDirection:
    PRESYNAPTIC_PARTNERS = 0
    POSTSYNAPTIC_PARTNERS = 1

class ClassInstance(models.Model):
    class Meta:
        db_table = "class_instance"
        managed = False
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    # Now new columns:
    class_column = models.ForeignKey(Class, db_column="class_id") # underscore since class is a keyword
    name = models.CharField(max_length=255)

    def get_connected_neurons(self, project_id, direction, skeletons):

        if direction == ConnectivityDirection.PRESYNAPTIC_PARTNERS:
            this_to_syn = 'post'
            syn_to_con = 'pre'
        elif direction == ConnectivityDirection.POSTSYNAPTIC_PARTNERS:
            this_to_syn = 'pre'
            syn_to_con = 'post'
        else:
            raise Exception, "Unknown connectivity direction: "+str(direction)

        relations = dict((r.relation_name, r.id) for r in Relation.objects.filter(project=project_id))
        classes = dict((c.class_name, c.id) for c in Class.objects.filter(project=project_id))

        connected_skeletons_dict={}
        # Find connectivity for each skeleton and add neuron name
        for skeleton in skeletons:
            qs_tc = TreenodeConnector.objects.filter(
                project=project_id,
                skeleton=skeleton.id,
                relation=relations[this_to_syn+'synaptic_to']
            ).select_related('connector')

            # extract all connector ids
            connector_ids=[]
            for tc in qs_tc:
                connector_ids.append( tc.connector_id )
            # find all syn_to_con connections
            qs_tc = TreenodeConnector.objects.filter(
                project=project_id,
                connector__in=connector_ids,
                relation=relations[syn_to_con+'synaptic_to']
            )
            # extract all skeleton ids
            first_indirection_skeletons=[]
            for tc in qs_tc:
                first_indirection_skeletons.append( tc.skeleton_id )

            qs = ClassInstanceClassInstance.objects.filter(
                relation__relation_name='model_of',
                project=project_id,
                class_instance_a__in=first_indirection_skeletons).select_related("class_instance_b")
            neuronOfSkeleton={}
            for ele in qs:
                neuronOfSkeleton[ele.class_instance_a.id]={
                    'neuroname':ele.class_instance_b.name,
                    'neuroid':ele.class_instance_b.id
                }

            # add neurons (or rather skeletons)
            for skeleton_id in first_indirection_skeletons:

                if skeleton_id in connected_skeletons_dict:
                    # if already existing, increase count
                    connected_skeletons_dict[skeleton_id]['id__count']+=1
                else:
                    connected_skeletons_dict[skeleton_id]={
                        'id': neuronOfSkeleton[skeleton_id]['neuroid'],
                        'id__count': 1, # connectivity count
                        'skeleton_id': skeleton_id,
                        'name': '{0} / skeleton {1}'.format(neuronOfSkeleton[skeleton_id]['neuroname'], skeleton_id) }

        # sort by count
        from operator import itemgetter
        connected_skeletons = connected_skeletons_dict.values()
        result = reversed(sorted(connected_skeletons, key=itemgetter('id__count')))
        return result

    def all_neurons_upstream(self, project_id, skeletons):
        return self.get_connected_neurons(
            project_id,
            ConnectivityDirection.PRESYNAPTIC_PARTNERS, skeletons)

    def all_neurons_downstream(self, project_id, skeletons):
        return self.get_connected_neurons(
            project_id,
            ConnectivityDirection.POSTSYNAPTIC_PARTNERS, skeletons)

    def cell_body_location(self):
        qs = list(ClassInstance.objects.filter(
                class_column__class_name='cell_body_location',
                cici_via_b__relation__relation_name='has_cell_body',
                cici_via_b__class_instance_a=self))
        if len(qs) == 0:
            return 'Unknown'
        elif len(qs) == 1:
            return qs[0].name
        elif qs:
            raise Exception, "Multiple cell body locations found for neuron '%s'" % (self.name,)
    def set_cell_body_location(self, new_location):
        # FIXME: for the moment, just hardcode the user ID:
        user = User.objects.get(pk=3)
        if new_location not in [x[1] for x in CELL_BODY_CHOICES]:
            raise Exception, "Incorrect cell body location '%s'" % (new_location,)
        # Just delete the ClassInstance - ON DELETE CASCADE should deal with the rest:
        ClassInstance.objects.filter(
            cici_via_b__relation__relation_name='has_cell_body',
            cici_via_b__class_instance_a=self).delete()
        if new_location != 'Unknown':
            location = ClassInstance()
            location.name=new_location
            location.project = self.project
            location.user = user
            location.class_column = Class.objects.get(class_name='cell_body_location', project=self.project)
            location.save()
            r = Relation.objects.get(relation_name='has_cell_body', project=self.project)
            cici = ClassInstanceClassInstance()
            cici.class_instance_a = self
            cici.class_instance_b = location
            cici.relation = r
            cici.user = user
            cici.project = self.project
            cici.save()
    def lines_as_str(self):
        # FIXME: not expected to work yet
        return ', '.join([unicode(x) for x in self.lines.all()])
    def to_dict(self):
        # FIXME: not expected to work yet
        return {'id': self.id,
                'trakem2_id': self.trakem2_id,
                'lineage' : 'unknown',
                'neurotransmitters': [],
                'cell_body_location': [ self.cell_body, Neuron.cell_body_choices_dict[self.cell_body] ],
                'name': self.name}

class Relation(models.Model):
    class Meta:
        db_table = "relation"
        managed = False
    # Repeat the columns inherited from 'concept'
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
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    project = models.ForeignKey(Project)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    class_instance_a = models.ForeignKey(ClassInstance,
                                         related_name='cici_via_a',
                                         db_column='class_instance_a')
    class_instance_b = models.ForeignKey(ClassInstance,
                                         related_name='cici_via_b',
                                         db_column='class_instance_b')

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


class UserFocusedManager(models.Manager):
    # TODO: should there be a parameter or separate function that allows the caller to specify read-only vs. read-write objects?
    
    def for_user(self, user):
        fullSet = super(UserFocusedManager, self).get_query_set()
        
        if user.is_superuser:
            return fullSet
        else:
            # Get the projects that the user can see.
            adminProjects = get_objects_for_user(user, 'can_administer', Project)
            print >> sys.stderr, 'user is admin for ', str(adminProjects)
            otherProjects = get_objects_for_user(user, ['can_annotate', 'can_browse'], Project, any_perm = True)
            otherProjects = [a for a in otherProjects if a not in adminProjects]
            print >> sys.stderr, 'user has access to ', str(otherProjects)
            
            # Now filter to the data to which the user has access.
            return fullSet.filter(Q(project__in = adminProjects) | (Q(project__in = otherProjects) & Q(user = user)))


class UserFocusedModel(models.Model):
    objects = UserFocusedManager()
    user = models.ForeignKey(User)
    project = models.ForeignKey(Project)
    class Meta:
        abstract = True


class Textlabel(models.Model):
    class Meta:
        db_table = "textlabel"
        managed = False
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
    location = Double3DField()
    deleted = models.BooleanField()

class Location(UserFocusedModel):
    class Meta:
        db_table = "location"
        managed = False
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    location = Double3DField()
    reviewer_id = models.IntegerField(default=-1)
    review_time = models.DateTimeField()

class Treenode(UserFocusedModel):
    class Meta:
        db_table = "treenode"
        managed = False
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    location = Double3DField()
    parent = models.ForeignKey('self', null=True, related_name='children')
    radius = models.FloatField()
    confidence = models.IntegerField(default=5)
    skeleton = models.ForeignKey(ClassInstance)
    reviewer_id = models.IntegerField(default=-1)
    review_time = models.DateTimeField()


class Connector(UserFocusedModel):
    class Meta:
        db_table = "connector"
        managed = False
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    location = Double3DField()
    confidence = models.IntegerField(default=5)
    reviewer_id = models.IntegerField(default=-1)
    review_time = models.DateTimeField()


class TreenodeClassInstance(UserFocusedModel):
    class Meta:
        db_table = "treenode_class_instance"
        managed = False
    # Repeat the columns inherited from 'relation_instance'
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    treenode = models.ForeignKey(Treenode)
    class_instance = models.ForeignKey(ClassInstance)

class ConnectorClassInstance(UserFocusedModel):
    class Meta:
        db_table = "connector_class_instance"
        managed = False
    # Repeat the columns inherited from 'relation_instance'
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    connector = models.ForeignKey(Connector)
    class_instance = models.ForeignKey(ClassInstance)

class TreenodeConnector(UserFocusedModel):
    class Meta:
        db_table = "treenode_connector"
        managed = False
    # Repeat the columns inherited from 'relation_instance'
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    treenode = models.ForeignKey(Treenode)
    connector = models.ForeignKey(Connector)
    skeleton = models.ForeignKey(ClassInstance)
    confidence = models.IntegerField(default=5)

#class Session(models.Model):
#    class Meta:
#        db_table = "sessions"
#        managed = False
#    session_id = models.CharField(max_length=26)
#    data = models.TextField(default='')
#    last_accessed = models.DateTimeField(default=now)

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

class NeuronSearch(forms.Form):
    search = forms.CharField(max_length=100,required=False)
    cell_body_location = forms.ChoiceField(
        choices=((('a','Any'),)+CELL_BODY_CHOICES))
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

class Log(UserFocusedModel):
    class Meta:
        db_table = "log"
        managed = False
    creation_time = models.DateTimeField(default=now)
    edition_time = models.DateTimeField(default=now)
    operation_type = models.CharField(max_length=255)
    location = Double3DField()
    freetext = models.TextField()
