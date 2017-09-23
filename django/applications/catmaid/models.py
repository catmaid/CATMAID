# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from datetime import datetime
import logging
import sys
import re
import urllib
import six

from django import forms
from django.conf import settings
from django.contrib.auth.models import User, Group
from django.contrib.gis.db import models as spatial_models
from django.contrib.postgres.fields import JSONField
from django.core.validators import RegexValidator
from django.db import connection, models
from django.db.models import Q
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.utils import timezone
from django.utils.encoding import python_2_unicode_compatible

from guardian.shortcuts import get_objects_for_user
from taggit.managers import TaggableManager

from .fields import Double3DField, Integer3DField, RGBAField

from .control.user import distinct_user_color


CELL_BODY_CHOICES = (
    ('u', 'Unknown'),
    ('l', 'Local'),
    ('n', 'Non-Local'))


class UserRole(object):
    Admin = 'Admin'
    Annotate = 'Annotate'
    Browse = 'Browse'
    Import = 'Import'

@python_2_unicode_compatible
class Project(models.Model):
    title = models.TextField()
    comment = models.TextField(blank=True, null=True)
    stacks = models.ManyToManyField("Stack",
                                    through='ProjectStack')
    tags = TaggableManager(blank=True)

    class Meta:
        db_table = "project"
        managed = True
        permissions = (
            ("can_administer", "Can administer projects"),
            ("can_annotate", "Can annotate projects"),
            ("can_browse", "Can browse projects"),
            ("can_import", "Can import into projects")
        )

    def __str__(self):
        return self.title

def on_project_save(sender, instance, created, raw, **kwargs):
    """ Make sure all required classes and relations are set up for all
    projects but the ontology dummy projects. Don't do this when fixtures are in
    use (i.e. during testing), because project validation is managed there
    explicityly.
    """
    is_not_dummy = instance.id != settings.ONTOLOGY_DUMMY_PROJECT_ID
    if created and sender == Project and is_not_dummy and not raw:
        from catmaid.control.project import validate_project_setup
        from .apps import get_system_user
        user = get_system_user()
        validate_project_setup(instance.id, user.id, True)

# Validate project when they are saved
post_save.connect(on_project_save, sender=Project)

# Supported tile source types
TILE_SOURCE_TYPES = (
    (1, '1: File-based image stack'),
    (2, '2: Request query-based image stack'),
    (3, '3: HDF5 via CATMAID backend'),
    (4, '4: File-based image stack with zoom level directories'),
    (5, '5: Directory-based image stack'),
    (6, '6: DVID imageblk voxels'),
    (7, '7: Render service'),
    (8, '8: DVID imagetile tiles'),
    (9, '9: FlixServer tiles')
)

@python_2_unicode_compatible
class Stack(models.Model):
    title = models.TextField(help_text="Descriptive title of this stack.")
    dimension = Integer3DField(help_text="The pixel dimensionality of the "
            "stack.")
    resolution = Double3DField(help_text="The resolution of the stack in "
            "nanometers.")
    comment = models.TextField(blank=True, null=True,
            help_text="A comment that describes the image data.")
    num_zoom_levels = models.IntegerField(default=-1,
            help_text="The number of zoom levels a stack has data for. A "
            "value of -1 lets CATMAID dynamically determine the actual value "
            "so that at this value the largest extent (X or Y) won't be "
            "smaller than 1024 pixels. Values larger -1 will be used directly.")
    description = models.TextField(default='', blank=True,
            help_text="Arbitrary text that is displayed alongside the stack.")
    metadata = JSONField(blank=True, null=True)
    attribution = models.TextField(blank=True, null=True,
            help_text="Attribution or citation information for this dataset.")
    canary_location = Integer3DField(default=(0, 0, 0), help_text="Stack space "
            "coordinates at zoom level 0 where image data is expected to exist.")
    placeholder_color = RGBAField(default=(0, 0, 0, 1))
    tags = TaggableManager(blank=True)

    class Meta:
        db_table = "stack"

    def __str__(self):
        return self.title


@python_2_unicode_compatible
class StackMirror(models.Model):
    stack = models.ForeignKey(Stack, on_delete=models.CASCADE)
    title = models.TextField(help_text="Descriptive title of this stack mirror.")
    image_base = models.TextField(help_text="Fully qualified URL where the "
            "tile data can be found.")
    file_extension = models.TextField(default='jpg', blank=True,
            help_text="The file extension of the data files.")
    tile_width = models.IntegerField(default=256,
            help_text="The width of one tile.")
    tile_height = models.IntegerField(default=256,
            help_text="The height of one tile.")
    tile_source_type = models.IntegerField(default=1,
            choices=TILE_SOURCE_TYPES,
            help_text='This represents how the tile data is organized. '
            'See <a href="http://catmaid.org/page/tile_sources.html">tile source '
            'conventions documentation</a>.')
    position = models.IntegerField(default=0)

    class Meta:
        db_table = "stack_mirror"
        ordering = ('position',)

    def __str__(self):
        return self.stack.title + " (" + self.title + ")"


@python_2_unicode_compatible
class ProjectStack(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    stack = models.ForeignKey(Stack, on_delete=models.CASCADE)
    translation = Double3DField(default=(0, 0, 0))
    orientation = models.IntegerField(choices=((0, 'xy'), (1, 'xz'), (2, 'zy')), default=0)

    class Meta:
        db_table = "project_stack"

    def __str__(self):
        return self.project.title + " -- " + self.stack.title


class Concept(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)

    class Meta:
        db_table = "concept"

def create_concept_sub_table(table_name):
    db = connection.cursor()
    db.execute('''CREATE TABLE %s () INHERITS (concept)''' % table_name)
    db.execute('''CREATE SEQUENCE %s_id_seq
                    START WITH 1
                    INCREMENT BY 1
                    NO MAXVALUE
                    NO MINVALUE
                    CACHE 1''' % table_name)
    db.execute('''ALTER SEQUENCE %s_id_seq OWNED BY %s.id''' % (table_name, table_name))
    db.execute('''ALTER TABLE ONLY %s ADD CONSTRAINT %s_pkey PRIMARY KEY (id)''' % (table_name, table_name))
    db.execute('''ALTER TABLE %s ALTER COLUMN id SET DEFAULT nextval('%s_id_seq'::regclass)''' % (table_name, table_name))   # use concept_id_seq so id unique across all concepts?
    db.execute('''ALTER TABLE ONLY %s ADD CONSTRAINT %s_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_user(id)''' % (table_name, table_name))
    db.execute('''CREATE TRIGGER on_edit_%s
                    BEFORE UPDATE ON %s
                    FOR EACH ROW EXECUTE PROCEDURE on_edit()''' % (table_name, table_name))


@python_2_unicode_compatible
class Class(models.Model):
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    # Now new columns:
    class_name = models.CharField(max_length=255)
    description = models.TextField()

    class Meta:
        db_table = "class"

    def __str__(self):
        return self.class_name


class ConnectivityDirection(object):
    PRESYNAPTIC_PARTNERS = 0
    POSTSYNAPTIC_PARTNERS = 1


class ClassInstance(models.Model):
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    # Now new columns:
    class_column = models.ForeignKey(Class, on_delete=models.CASCADE,
                                     db_column="class_id") # underscore since class is a keyword
    name = models.CharField(max_length=255)

    class Meta:
        db_table = "class_instance"

    def get_connected_neurons(self, project_id, direction, skeletons):

        if direction == ConnectivityDirection.PRESYNAPTIC_PARTNERS:
            this_to_syn = 'post'
            syn_to_con = 'pre'
        elif direction == ConnectivityDirection.POSTSYNAPTIC_PARTNERS:
            this_to_syn = 'pre'
            syn_to_con = 'post'
        else:
            raise Exception("Unknown connectivity direction: " + str(direction))

        relations = dict((r.relation_name, r.id) for r in Relation.objects.filter(project=project_id))
        classes = dict((c.class_name, c.id) for c in Class.objects.filter(project=project_id))

        connected_skeletons_dict = {}
        # Find connectivity for each skeleton and add neuron name
        for skeleton in skeletons:
            qs_tc = TreenodeConnector.objects.filter(
                project=project_id,
                skeleton=skeleton.id,
                relation=relations[this_to_syn+'synaptic_to']
            ).select_related('connector')

            # extract all connector ids
            connector_ids = []
            for tc in qs_tc:
                connector_ids.append(tc.connector_id)
            # find all syn_to_con connections
            qs_tc = TreenodeConnector.objects.filter(
                project=project_id,
                connector__in=connector_ids,
                relation=relations[syn_to_con+'synaptic_to']
            )
            # extract all skeleton ids
            first_indirection_skeletons = []
            for tc in qs_tc:
                first_indirection_skeletons.append(tc.skeleton_id)

            qs = ClassInstanceClassInstance.objects.filter(
                relation__relation_name='model_of',
                project=project_id,
                class_instance_a__in=first_indirection_skeletons).select_related("class_instance_b")
            neuron_of_skeleton = {}
            for ele in qs:
                neuron_of_skeleton[ele.class_instance_a.id] = {
                    'neuroname':ele.class_instance_b.name,
                    'neuroid':ele.class_instance_b.id
                }

            # add neurons (or rather skeletons)
            for skeleton_id in first_indirection_skeletons:

                if skeleton_id in connected_skeletons_dict:
                    # if already existing, increase count
                    connected_skeletons_dict[skeleton_id]['id__count'] += 1
                else:
                    connected_skeletons_dict[skeleton_id] = {
                        'id': neuron_of_skeleton[skeleton_id]['neuroid'],
                        'id__count': 1, # connectivity count
                        'skeleton_id': skeleton_id,
                        'name': '{0} / skeleton {1}'.format(neuron_of_skeleton[skeleton_id]['neuroname'], skeleton_id)}

        # sort by count
        from operator import itemgetter
        connected_skeletons = six.itervalues(connected_skeletons_dict)
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
            raise Exception("Multiple cell body locations found for neuron '%s'" % (self.name,))

    def set_cell_body_location(self, new_location):
        # FIXME: for the moment, just hardcode the user ID:
        user = User.objects.get(pk=3)
        if new_location not in [x[1] for x in CELL_BODY_CHOICES]:
            raise Exception("Incorrect cell body location '%s'" % (new_location,))
        # Just delete the ClassInstance - ON DELETE CASCADE should deal with the rest:
        ClassInstance.objects.filter(
            cici_via_b__relation__relation_name='has_cell_body',
            cici_via_b__class_instance_a=self).delete()
        if new_location != 'Unknown':
            location = ClassInstance()
            location.name = new_location
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
                'cell_body_location': [self.cell_body, Neuron.cell_body_choices_dict[self.cell_body]],
                'name': self.name}


class Relation(models.Model):
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    # Now new columns:
    relation_name = models.CharField(max_length=255)
    uri = models.TextField()
    description = models.TextField()
    isreciprocal = models.BooleanField(default=False)

    class Meta:
        db_table = "relation"


class RelationInstance(models.Model):
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    # Now new columns:
    relation = models.ForeignKey(Relation, on_delete=models.CASCADE)

    class Meta:
        db_table = "relation_instance"


class ClassInstanceClassInstance(models.Model):
    # Repeat the columns inherited from 'relation_instance'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    relation = models.ForeignKey(Relation, on_delete=models.CASCADE)
    # Now new columns:
    class_instance_a = models.ForeignKey(ClassInstance,
                                         related_name='cici_via_a',
                                         db_column='class_instance_a',
                                         on_delete=models.CASCADE)
    class_instance_b = models.ForeignKey(ClassInstance,
                                         related_name='cici_via_b',
                                         db_column='class_instance_b',
                                         on_delete=models.CASCADE)

    class Meta:
        db_table = "class_instance_class_instance"

@python_2_unicode_compatible
class BrokenSlice(models.Model):
    stack = models.ForeignKey(Stack, on_delete=models.CASCADE)
    index = models.IntegerField()

    class Meta:
        db_table = "broken_slice"

    def __str__(self):
        return "Broken section {} in stack {}".format(self.index, self.stack)


class ClassClass(models.Model):
    # Repeat the columns inherited from 'relation_instance'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    relation = models.ForeignKey(Relation, on_delete=models.CASCADE)
    # Now new columns:
    class_a = models.ForeignKey(Class, related_name='classes_a',
                                on_delete=models.CASCADE, db_column='class_a')
    class_b = models.ForeignKey(Class, related_name='classes_b',
                                on_delete=models.CASCADE, db_column='class_b')

    class Meta:
        db_table = "class_class"


class Message(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    time = models.DateTimeField(default=timezone.now)
    read = models.BooleanField(default=False)
    title = models.TextField()
    text = models.TextField(default='New message', blank=True, null=True)
    action = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "message"


class ClientDatastore(models.Model):
    name = models.CharField(max_length=255, unique=True, validators=[
            RegexValidator(r'^[\w-]+$',
                           'Only alphanumeric characters and hyphens are allowed.')])

    class Meta:
        db_table = "client_datastore"


class ClientData(models.Model):
    datastore = models.ForeignKey(ClientDatastore, on_delete=models.CASCADE)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, blank=True, null=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, blank=True, null=True)
    key = models.CharField(max_length=255)
    value = JSONField(default=dict)

    class Meta:
        db_table = "client_data"
        # This quadruple is effectively a multicolumn primary key.
        unique_together = (('datastore', 'key', 'project', 'user'))


class UserFocusedManager(models.Manager):
    # TODO: should there be a parameter or separate function that allows the caller to specify read-only vs. read-write objects?

    def for_user(self, user):
        full_set = super(UserFocusedManager, self).get_queryset()

        if user.is_superuser:
            return full_set
        else:
            # Get the projects that the user can see.
            admin_projects = get_objects_for_user(user, 'can_administer', Project,
                                                 accept_global_perms=False)
            other_projects = get_objects_for_user(user, ['can_annotate', 'can_browse'],
                                                 Project, any_perm = True, accept_global_perms=False)
            other_projects = [a for a in other_projects if a not in admin_projects]

            # Now filter to the data to which the user has access.
            return full_set.filter(Q(project__in=admin_projects) | (Q(project__in=other_projects) & Q(user=user)))


class UserFocusedModel(models.Model):
    objects = UserFocusedManager()
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)

    class Meta:
        abstract = True


class Textlabel(models.Model):
    type = models.CharField(max_length=32)
    text = models.TextField(default="Edit this text ...")
    colour = RGBAField(default=(1, 0.5, 0, 1))
    font_name = models.TextField(null=True)
    font_style = models.TextField(null=True)
    font_size = models.FloatField(default=32)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    scaling = models.BooleanField(default=True)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "textlabel"


class TextlabelLocation(models.Model):
    textlabel = models.ForeignKey(Textlabel, on_delete=models.CASCADE)
    location = Double3DField()
    deleted = models.BooleanField(default=False)

    class Meta:
        db_table = "textlabel_location"


class Location(UserFocusedModel):
    editor = models.ForeignKey(User, on_delete=models.CASCADE,
                               related_name='location_editor', db_column='editor_id')
    location_x = models.FloatField()
    location_y = models.FloatField()
    location_z = models.FloatField()

    class Meta:
        db_table = "location"


class Treenode(UserFocusedModel):
    editor = models.ForeignKey(User, on_delete=models.CASCADE,
                               related_name='treenode_editor', db_column='editor_id')
    location_x = models.FloatField()
    location_y = models.FloatField()
    location_z = models.FloatField()
    parent = models.ForeignKey('self', on_delete=models.CASCADE,
                               null=True, related_name='children')
    radius = models.FloatField()
    confidence = models.IntegerField(default=5)
    skeleton = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)

    class Meta:
        db_table = "treenode"


class SuppressedVirtualTreenode(UserFocusedModel):
    child = models.ForeignKey(Treenode, on_delete=models.CASCADE)
    location_coordinate = models.FloatField()
    orientation = models.SmallIntegerField(choices=((0, 'z'), (1, 'y'), (2, 'x')))

    class Meta:
        db_table = "suppressed_virtual_treenode"


class Connector(UserFocusedModel):
    editor = models.ForeignKey(User, on_delete=models.CASCADE,
                               related_name='connector_editor', db_column='editor_id')
    location_x = models.FloatField()
    location_y = models.FloatField()
    location_z = models.FloatField()
    confidence = models.IntegerField(default=5)

    class Meta:
        db_table = "connector"


class TreenodeClassInstance(UserFocusedModel):
    # Repeat the columns inherited from 'relation_instance'
    relation = models.ForeignKey(Relation, on_delete=models.CASCADE)
    # Now new columns:
    treenode = models.ForeignKey(Treenode, on_delete=models.CASCADE)
    class_instance = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)

    class Meta:
        db_table = "treenode_class_instance"


class ConnectorClassInstance(UserFocusedModel):
    # Repeat the columns inherited from 'relation_instance'
    relation = models.ForeignKey(Relation, on_delete=models.CASCADE)
    # Now new columns:
    connector = models.ForeignKey(Connector, on_delete=models.CASCADE)
    class_instance = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)

    class Meta:
        db_table = "connector_class_instance"


class TreenodeConnector(UserFocusedModel):
    # Repeat the columns inherited from 'relation_instance'
    relation = models.ForeignKey(Relation, on_delete=models.CASCADE)
    # Now new columns:
    treenode = models.ForeignKey(Treenode, on_delete=models.CASCADE)
    connector = models.ForeignKey(Connector, on_delete=models.CASCADE)
    skeleton = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)
    confidence = models.IntegerField(default=5)

    class Meta:
        db_table = "treenode_connector"
        unique_together = (('project', 'treenode', 'connector', 'relation'),)


class Review(models.Model):
    """ This model represents the review of a user of one particular tree node
    of a specific skeleton. Technically, the treenode ID is enough to get the
    skeleton and the project. However, both of them are included for
    performance reasons (to avoid a join in the database for retrieval).
    """
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    reviewer = models.ForeignKey(User, on_delete=models.CASCADE)
    review_time = models.DateTimeField(default=timezone.now)
    skeleton = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)
    treenode = models.ForeignKey(Treenode, on_delete=models.CASCADE)

    class Meta:
        db_table = "review"


class ReviewerWhitelist(models.Model):
    """ This model represents that a user trusts the reviews of a partciular
    reviewer for a specific project created after a specified time.
    """
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    reviewer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='+')
    accept_after = models.DateTimeField(default=datetime.utcfromtimestamp(0))

    class Meta:
        db_table = "reviewer_whitelist"
        unique_together = ('project', 'user', 'reviewer')


class Volume(UserFocusedModel):
    """A three-dimensional volume in project space. Implemented as PostGIS
    Geometry type.
    """
    editor = models.ForeignKey(User, on_delete=models.CASCADE,
                               related_name='editor', db_column='editor_id')
    name = models.CharField(max_length=255)
    comment = models.TextField(blank=True, null=True)
    # GeoDjango-specific: a geometry field with PostGIS-specific 3 dimensions.
    geometry = spatial_models.GeometryField(dim=3, srid=0)


class RegionOfInterest(UserFocusedModel):
    # Repeat the columns inherited from 'location'
    editor = models.ForeignKey(User, on_delete=models.CASCADE,
                               related_name='roi_editor', db_column='editor_id')
    location_x = models.FloatField()
    location_y = models.FloatField()
    location_z = models.FloatField()
    # Now new columns:
    stack = models.ForeignKey(Stack, on_delete=models.CASCADE)
    zoom_level = models.IntegerField()
    width = models.FloatField()
    height = models.FloatField()
    rotation_cw = models.FloatField()

    class Meta:
        db_table = "region_of_interest"


class RegionOfInterestClassInstance(UserFocusedModel):
    # Repeat the columns inherited from 'relation_instance'
    relation = models.ForeignKey(Relation, on_delete=models.CASCADE)
    # Now new columns:
    region_of_interest = models.ForeignKey(RegionOfInterest, on_delete=models.CASCADE)
    class_instance = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)

    class Meta:
        db_table = "region_of_interest_class_instance"


class Restriction(models.Model):
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    # Now new columns:
    enabled = models.BooleanField(default=True)
    restricted_link = models.ForeignKey(ClassClass, on_delete=models.CASCADE)

    class Meta:
        db_table = "restriction"


class CardinalityRestriction(models.Model):
    """ A restriction that guards the number of class instances
    explicitly referring to a relation in the semantic space.
    Different types are supported:

    0: The exact number of class instances is defined
    1: A maximum number of class instances is defined
    2: A minimum number of class instances is defined
    3: The exact number of class instances for each sub-type is defined
    4: The maximum number of class instances for each sub-type is defined
    5: The minimum number of class instances for each sub-type is defined
    """
    # Repeat the columns inherited from 'restriction'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    enabled = models.BooleanField(default=True)
    restricted_link = models.ForeignKey(ClassClass, on_delete=models.CASCADE)
    # Now new columns:
    cardinality_type = models.IntegerField()
    value = models.IntegerField()

    class Meta:
        db_table = "cardinality_restriction"

    @staticmethod
    def get_supported_types():
        return {
            0: "Exactly n instances of any sub-type",
            1: "Maximum of n instances of any sub-type",
            2: "Minimum of n instances of any sub-type",
            3: "Exactly n instances of each sub-type",
            4: "Maximum n instances of each sub-type",
            5: "Minimum n instances of each sub-type"}

    def get_num_class_instances(self, ci, class_id=None):
        """ Returns the number of class instances, guarded by this
        restriction.
        """
        if class_id is None:
            return ClassInstanceClassInstance.objects.filter(class_instance_b=ci,
                relation=self.restricted_link.relation).count()
        else:
            return ClassInstanceClassInstance.objects.filter(class_instance_b=ci,
                relation=self.restricted_link.relation,
                class_instance_a__class_column=class_id).count()

    def would_violate(self, ci, class_id):
        """ Test if it would violate this restriction if a new instance
        of <class_id> is linked to <ci> with the guarded link. Note: This will
        return *false as well* if adding a new class instance would bring
        the restriction closer to being not violated. E.g.: if exactly 3
        elements are needed, this method would return false for the firs
        three new class instances.
        """
        if self.cardinality_type == 0 or self.cardinality_type == 1:
            # Type 0 and type 1: exactly <value> number of class instances
            # can be instantiated. A new instance violates if there are
            # already <value> or more instances.
            num_linked_ci = self.get_num_class_instances(ci)
            too_much_items = num_linked_ci >= self.value
            return too_much_items
        elif self.cardinality_type == 2:
            # Type 2: at least <value> number of class instances can be
            # instantiated. A new instance never violates.
            return False
        elif self.cardinality_type == 3 or self.cardinality_type == 4:
            # Type 3 and type 4: exactly <value> number of class instances are
            # allowed for each sub-type. A new instance violates if there are
            # already <value> or more instances of a certain type.
            num_linked_ci = self.get_num_class_instances(ci, class_id)
            too_much_items = num_linked_ci >= self.value
            return too_much_items
        elif self.cardinality_type == 5:
            # Type 5: at minimum <value> number of class instances are allowed
            # for each sub-type. A new instance never violates.
            return False
        else:
            raise Exception("Unsupported cardinality type.")

    def is_violated(self, ci):
        """ Test if a restriction is currently violated.
        """
        def get_subclass_links_qs():
            # Get all sub-types of c
            return ClassClass.objects.filter(
                project_id=ci.project_id, class_b=ci.class_column,
                relation__relation_name='is_a')

        if self.cardinality_type == 0:
            num_linked_ci = self.get_num_class_instances(ci)
            return num_linked_ci != self.value
        elif self.cardinality_type == 1:
            num_linked_ci = self.get_num_class_instances(ci)
            return num_linked_ci > self.value
        elif self.cardinality_type == 2:
            num_linked_ci = self.get_num_class_instances(ci)
            return num_linked_ci < self.value
        elif self.cardinality_type == 3:
            # Exactly n for each sub type
            subclass_links_q = get_subclass_links()
            for link in subclass_links_q:
                num_linked_ci = self.get_num_class_instances(ci, link.class_a_id)
                if num_linked_ci != self.value:
                    return True
        elif self.cardinality_type == 4:
            # Max n for each sub type
            subclass_links_q = get_subclass_links()
            for link in subclass_links_q:
                num_linked_ci = self.get_num_class_instances(ci, link.class_a_id)
                if num_linked_ci > self.value:
                    return True
        elif self.cardinality_type == 5:
            # Min n for each sub type
            subclass_links_q = get_subclass_links()
            for link in subclass_links_q:
                num_linked_ci = self.get_num_class_instances(ci, link.class_a_id)
                if num_linked_ci < self.value:
                    return True
            return False
        else:
            raise Exception("Unsupported cardinality type.")


class StackClassInstance(models.Model):
    # Repeat the columns inherited from 'relation_instance'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    relation = models.ForeignKey(Relation, on_delete=models.CASCADE)
    # Now new columns:
    stack = models.ForeignKey(Stack, on_delete=models.CASCADE)
    class_instance = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)

    class Meta:
        db_table = "stack_class_instance"


@python_2_unicode_compatible
class StackGroupRelation(models.Model):
    name = models.TextField(max_length=80)

    class Meta:
        db_table = 'stack_group_relation'

    def __str__(self):
        return self.name


@python_2_unicode_compatible
class StackGroup(models.Model):
    title = models.TextField(default="", max_length=80)
    comment = models.TextField(blank=True, null=True,
            help_text="A comment that describes the stack group.")

    class Meta:
        db_table = 'stack_group'

    def __str__(self):
        return self.title


class StackStackGroup(models.Model):
    group_relation = models.ForeignKey(StackGroupRelation)
    stack = models.ForeignKey(Stack)
    stack_group = models.ForeignKey(StackGroup)
    position = models.IntegerField(default=0)

    class Meta:
        db_table = 'stack_stack_group'
        ordering = ('position',)


class StackGroupClassInstance(models.Model):
    # Repeat the columns inherited from 'relation_instance'
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    creation_time = models.DateTimeField(default=timezone.now)
    edition_time = models.DateTimeField(default=timezone.now)
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    relation = models.ForeignKey(Relation, on_delete=models.CASCADE)
    # Now new columns:
    stack_group = models.ForeignKey(StackGroup, on_delete=models.CASCADE)
    class_instance = models.ForeignKey(ClassInstance, on_delete=models.CASCADE)

    class Meta:
        db_table = "stack_group_class_instance"


# ------------------------------------------------------------------------
# Now the non-Django tables:

SORT_ORDERS_TUPLES = [('name', ('name', False, 'Neuron name')),
                      ('namer', ('name', True, 'Neuron name (reversed)')),
                      ('gal4', ('gal4', False, 'GAL4 lines')),
                      ('gal4r', ('gal4', True, 'GAL4 lines (reversed)')),
                      ('cellbody', ('cell_body', False, 'Cell body location')),
                      ('cellbodyr', ('cell_body', True, 'Cell body location (reversed)'))]
SORT_ORDERS_DICT = dict(SORT_ORDERS_TUPLES)
SORT_ORDERS_CHOICES = tuple((x[0], SORT_ORDERS_DICT[x[0]][2]) for x in SORT_ORDERS_TUPLES)


class NeuronSearch(forms.Form):
    search = forms.CharField(max_length=100, required=False)
    cell_body_location = forms.ChoiceField(
        choices=((('a', 'Any'),)+CELL_BODY_CHOICES))
    order_by = forms.ChoiceField(SORT_ORDERS_CHOICES)

    def minimal_search_path(self):
        result = ""
        parameters = [('search', '/find/', ''),
                      ('order_by', '/sorted/', 'name'),
                      ('cell_body_location', '/cell_body_location/', "-1")]
        for p in parameters:
            if self.cleaned_data[p[0]] != p[2]:
                result += p[1] + urllib.quote(str(self.cleaned_data[p[0]]))
        return result


class Log(UserFocusedModel):
    operation_type = models.CharField(max_length=255)
    location = Double3DField()
    freetext = models.TextField()

    class Meta:
        db_table = "log"


@python_2_unicode_compatible
class DataViewType(models.Model):
    title = models.TextField()
    code_type = models.TextField()
    comment = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "data_view_type"

    def __str__(self):
        return self.title


class DataView(models.Model):
    title = models.TextField()
    data_view_type = models.ForeignKey(DataViewType, on_delete=models.CASCADE)
    config = models.TextField(default="{}")
    is_default = models.BooleanField(default=False)
    position = models.IntegerField(default=0)
    comment = models.TextField(default="", blank=True, null=True)

    class Meta:
        db_table = "data_view"
        ordering = ('position',)
        permissions = (
            ("can_administer_dataviews", "Can administer data views"),
            ("can_browse_dataviews", "Can browse data views")
        )

    def save(self, *args, **kwargs):
        """ Does a post-save action: Make sure (only) one data view
        is the default.
        """
        super(DataView, self).save(*args, **kwargs)
        # We need to declare a default view if there is none. Also if
        # there is more than one default, reduce this to one. If the
        # current data view is marked default, this will be the one.
        # If there is exactly one default, nothing needs to be touched.
        default_views = DataView.objects.filter(is_default=True)
        if len(default_views) == 0:
            # Make the first data view the default one
            dv = DataView.objects.all()[0]
            dv.is_default = True
            dv.save()
        elif len(default_views) > 1 and self.is_default:
            # Have only the current data view as default
            for dv in default_views:
                if dv.id == self.id:
                    continue
                dv.is_default = False
                dv.save()
        elif len(default_views) > 1:
            # Mark all except the first one as not default
            for n, dv in enumerate(default_views):
                if n == 0:
                    continue
                dv.is_default = False
                dv.save()


@python_2_unicode_compatible
class SamplerState(models.Model):
    name = models.TextField()
    description = models.TextField()

    def __str__(self):
        return self.name


@python_2_unicode_compatible
class Sampler(UserFocusedModel):
    interval_length = models.FloatField()
    review_required = models.BooleanField(default=True)
    sampler_state = models.ForeignKey(SamplerState, on_delete=models.CASCADE)
    skeleton = models.ForeignKey(ClassInstance, db_index=True, on_delete=models.CASCADE)

    def __str__(self):
        return "Sampler for {}".format(self.skeleton_id)


@python_2_unicode_compatible
class SamplerIntervalState(models.Model):
    name = models.TextField()
    description = models.TextField()

    def __str__(self):
        return self.name


@python_2_unicode_compatible
class SamplerInterval(UserFocusedModel):
    domain = models.ForeignKey('SamplerDomain', db_index=True, on_delete=models.CASCADE)
    interval_state = models.ForeignKey(SamplerIntervalState, db_index=True, on_delete=models.CASCADE)
    start_node = models.ForeignKey(Treenode, on_delete=models.CASCADE,
            related_name="sampler_interval_start_node_set")
    end_node = models.ForeignKey(Treenode, on_delete=models.CASCADE,
            related_name="sampler_interval_end_node_set")

    def __str__(self):
        return "({}, {})".format(self.start_node_id, self.end_node_id)


@python_2_unicode_compatible
class SamplerConnectorState(models.Model):
    name = models.TextField()
    description = models.TextField()

    def __str__(self):
        return self.name


@python_2_unicode_compatible
class SamplerConnector(UserFocusedModel):
    interval = models.ForeignKey('SamplerInterval', db_index=True, on_delete=models.CASCADE)
    connector = models.ForeignKey('Connector', db_index=True, on_delete=models.CASCADE)
    connector_state = models.ForeignKey(SamplerConnectorState, db_index=True, on_delete=models.CASCADE)

    def __str__(self):
        return "({}, {})".format(self.start_node_id, self.end_node_id)


@python_2_unicode_compatible
class SamplerDomainType(models.Model):
    name = models.TextField()
    description = models.TextField()

    def __str__(self):
        return self.name


@python_2_unicode_compatible
class SamplerDomain(UserFocusedModel):
    sampler = models.ForeignKey(Sampler, on_delete=models.CASCADE)
    start_node = models.ForeignKey(Treenode, on_delete=models.CASCADE)
    domain_type = models.ForeignKey(SamplerDomainType, db_index=True, on_delete=models.CASCADE)
    parent_interval = models.ForeignKey(SamplerInterval, null=True, db_index=True, on_delete=models.CASCADE)

    def __str__(self):
        return "Start: {}".format(self.start_node_id)


@python_2_unicode_compatible
class SamplerDomainEnd(models.Model):
    domain = models.ForeignKey(SamplerDomain, on_delete=models.CASCADE, db_index=True)
    end_node = models.ForeignKey(Treenode, on_delete=models.CASCADE)

    def __str__(self):
        return "End: {}".format(self.end_node_id)

@python_2_unicode_compatible
class StatsSummary(models.Model):
    class Meta:
        db_table = "catmaid_stats_summary"
        unique_together = (("project", "user", "date"),)

    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateTimeField(default=timezone.now, db_index=True)
    n_connector_links = models.IntegerField(null=False, default=0)
    n_reviewed_nodes = models.IntegerField(null=False, default=0)
    n_treenodes = models.IntegerField(null=False, default=0)
    n_edited_treenodes = models.IntegerField(null=False, default=0)
    n_edited_connectors = models.IntegerField(null=False, default=0)
    n_imported_treenodes = models.IntegerField(null=False, default=0)
    n_imported_connectors = models.IntegerField(null=False, default=0)
    cable_length = models.FloatField(null=False, default=0)

    def __str__(self):
        return "Stats summary for {} on {}".format(
                    self.user, self.date)

@python_2_unicode_compatible
class UserProfile(models.Model):
    """ A class that stores a set of custom user preferences.
    See: http://digitaldreamer.net/blog/2010/12/8/custom-user-profile-and-extend-user-admin-django/
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    independent_ontology_workspace_is_default = models.BooleanField(default=settings.PROFILE_INDEPENDENT_ONTOLOGY_WORKSPACE_IS_DEFAULT)
    show_text_label_tool = models.BooleanField(default=settings.PROFILE_SHOW_TEXT_LABEL_TOOL)
    show_tagging_tool = models.BooleanField(default=settings.PROFILE_SHOW_TAGGING_TOOL)
    show_cropping_tool = models.BooleanField(default=settings.PROFILE_SHOW_CROPPING_TOOL)
    show_segmentation_tool = models.BooleanField(default=settings.PROFILE_SHOW_SEGMENTATION_TOOL)
    show_tracing_tool = models.BooleanField(default=settings.PROFILE_SHOW_TRACING_TOOL)
    show_ontology_tool = models.BooleanField(default=settings.PROFILE_SHOW_ONTOLOGY_TOOL)
    show_roi_tool = models.BooleanField(default=settings.PROFILE_SHOW_ROI_TOOL)
    color = RGBAField(default=distinct_user_color)

    def __str__(self):
        return self.user.username

    # Fix a problem with duplicate keys when new users are added.
    # From <http://stackoverflow.com/questions/6117373/django-userprofile-m2m-field-in-admin-error>
    def save(self, *args, **kwargs):
        if not self.pk:
            try:
                p = UserProfile.objects.get(user=self.user)
                self.pk = p.pk
            except UserProfile.DoesNotExist:
                pass

        super(UserProfile, self).save(*args, **kwargs)

    def as_dict(self):
        """ Return a dictionary containing a user's profile information.
        """
        pdict = {}
        pdict['independent_ontology_workspace_is_default'] = \
            self.independent_ontology_workspace_is_default
        pdict['show_text_label_tool'] = self.show_text_label_tool
        pdict['show_tagging_tool'] = self.show_tagging_tool
        pdict['show_cropping_tool'] = self.show_cropping_tool
        pdict['show_segmentation_tool'] = self.show_segmentation_tool
        pdict['show_tracing_tool'] = self.show_tracing_tool
        pdict['show_ontology_tool'] = self.show_ontology_tool
        pdict['show_roi_tool'] = self.show_roi_tool
        return pdict

def create_user_profile(sender, instance, created, **kwargs):
    """ Create the UserProfile when a new User is saved.
    """
    if created:
        profile = UserProfile()
        profile.user = instance

        profile.independent_ontology_workspace_is_default = \
                settings.PROFILE_INDEPENDENT_ONTOLOGY_WORKSPACE_IS_DEFAULT
        profile.show_text_label_tool = settings.PROFILE_SHOW_TEXT_LABEL_TOOL
        profile.show_tagging_tool = settings.PROFILE_SHOW_TAGGING_TOOL
        profile.show_cropping_tool = settings.PROFILE_SHOW_CROPPING_TOOL
        profile.show_segmentation_tool = settings.PROFILE_SHOW_SEGMENTATION_TOOL
        profile.show_tracing_tool = settings.PROFILE_SHOW_TRACING_TOOL
        profile.show_ontology_tool = settings.PROFILE_SHOW_ONTOLOGY_TOOL
        profile.show_roi_tool = settings.PROFILE_SHOW_ROI_TOOL

        profile.save()

# Connect the User model's post save signal to profile creation
post_save.connect(create_user_profile, sender=User)

def add_user_to_default_groups(sender, instance, created, **kwargs):
    if created and settings.NEW_USER_DEFAULT_GROUPS:
        for group in settings.NEW_USER_DEFAULT_GROUPS:
            try:
                g = Group.objects.get(name=group)
                g.user_set.add(instance)
            except Group.DoesNotExist:
                logging.getLogger(__name__).info("Default group %s does not exist" % group)

# Connect the User model's post save signal to default group assignment
post_save.connect(add_user_to_default_groups, sender=User)


class ChangeRequest(UserFocusedModel):
    OPEN = 0
    APPROVED = 1
    REJECTED = 2
    INVALID = 3

    type = models.CharField(max_length=32)
    description = models.TextField()
    status = models.IntegerField(default=OPEN)
    recipient = models.ForeignKey(User, on_delete=models.CASCADE,
                                  related_name='change_recipient', db_column='recipient_id')
    location = Double3DField()
    treenode = models.ForeignKey(Treenode, on_delete=models.CASCADE)
    connector = models.ForeignKey(Connector, on_delete=models.CASCADE)
    validate_action = models.TextField()
    approve_action = models.TextField()
    reject_action = models.TextField()
    completion_time = models.DateTimeField(default=None, null=True)

    class Meta:
        db_table = "change_request"

    # TODO: get the project from the treenode/connector so it doesn't have to specified when creating a request

    def status_name(self):
        self.is_valid() # Make sure invalid state is current
        return ['Open', 'Approved', 'Rejected', 'Invalid'][self.status]

    def is_valid(self):
        """ Returns a boolean value indicating whether the change request is still valid."""

        if self.status == ChangeRequest.OPEN:
            # Run the request's validation code snippet to determine whether it is still valid.
            # The action is required to set a value for the is_valid variable.
            try:
                exec(self.validate_action)
                if 'is_valid' not in dir():
                    raise Exception('validation action did not define is_valid')
                if not is_valid:
                    # Cache the result so we don't have to do the exec next time.
                    # TODO: can a request ever be temporarily invalid?
                    self.status = ChangeRequest.INVALID
                    self.save()
            except Exception as e:
                raise Exception('Could not validate the request (%s)', str(e))
        else:
            is_valid = False

        return is_valid

    def approve(self, *args, **kwargs):
        if not self.is_valid():
            raise Exception('Failed to approve change request: the change is no longer possible.')

        try:
            exec(self.approve_action)
            self.status = ChangeRequest.APPROVED
            self.completion_time = timezone.now()
            self.save()

            # Send a message and an e-mail to the requester.
            title = self.type + ' Request Approved'
            message = self.recipient.get_full_name() + ' has approved your ' + self.type.lower() + ' request.'
            notify_user(self.user, title, message)
        except Exception as e:
            raise Exception('Failed to approve change request: %s' % str(e))

    def reject(self, *args, **kwargs):
        if not self.is_valid():
            raise Exception('Failed to reject change request: the change is no longer possible.')

        try:
            exec(self.reject_action)
            self.status = ChangeRequest.REJECTED
            self.completion_time = timezone.now()
            self.save()

            # Send a message and an e-mail to the requester.
            title = self.type + ' Request Rejected'
            message = self.recipient.get_full_name() + ' has rejected your ' + self.type.lower() + ' request.'
            notify_user(self.user, title, message)

        except Exception as e:
            raise Exception('Failed to reject change request: %s' % str(e))


@receiver(pre_save, sender=ChangeRequest)
def validate_change_request(sender, **kwargs):
    # Make sure the validate action defines is_valid.
    cr = kwargs['instance']
    if re.search('is_valid\s=', cr.validate_action) is None:
        raise Exception('The validate action of a ChangeRequest must assign a value to the is_valid variable.')


def send_email_to_change_request_recipient(sender, instance, created, **kwargs):
    """ Send the recipient of a change request a message and an e-mail when the request is created."""

    if created:
        title = instance.type + ' Request'
        message = instance.user.get_full_name() + ' has sent you a ' + instance.type.lower() + ' request.  Please check your notifications.'
        notify_user(instance.recipient, title, message)

post_save.connect(send_email_to_change_request_recipient, sender=ChangeRequest)


def notify_user(user, title, message):
    """ Send a user a message and an e-mail."""

    # Create the message
#     Message(user = user,
#             title = title,
#             text = message).save()

    # Send the e-mail
    # TODO: only send one e-mail per day, probably using a Timer object <http://docs.python.org/2/library/threading.html#timer-objects>
    try:
        user.email_user('[CATMAID] ' + title, message)
    except Exception as e:
        logging.getLogger(__name__).error('Failed to send e-mail (%s)', str(e))
