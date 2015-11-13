from django import forms
from django.contrib.gis.db import models as spatial_models
from django.db import models
from django.db.models import Q
from django.db.models.signals import pre_save, post_save, post_syncdb
from django.dispatch import receiver
from datetime import datetime
import sys
import re
import urllib

from django.conf import settings
from django.contrib.auth.models import User, Group

from fields import Double3DField, Integer3DField, RGBAField

from guardian.shortcuts import get_objects_for_user

from taggit.managers import TaggableManager

from south.db import db

from control.user import distinct_user_color

CELL_BODY_CHOICES = (
    ('u', 'Unknown'),
    ('l', 'Local'),
    ('n', 'Non-Local' ))

class UserRole(object):
    Admin = 'Admin'
    Annotate = 'Annotate'
    Browse = 'Browse'

class Project(models.Model):
    class Meta:
        db_table = "project"
        managed = True
        permissions = (
            ("can_administer", "Can administer projects"),
            ("can_annotate", "Can annotate projects"),
            ("can_browse", "Can browse projects")
        )
    title = models.TextField()
    comment = models.TextField(blank=True, null=True)
    stacks = models.ManyToManyField("Stack",
                                    through='ProjectStack')
    tags = TaggableManager(blank=True)

    def __unicode__(self):
        return self.title

def on_project_save(sender, instance, created, **kwargs):
    """ Make sure all required classes and relations are set up.
    """
    if created and sender == Project:
        from control.project import validate_project_setup
        from catmaid import get_system_user
        user = get_system_user()
        validate_project_setup(instance.id, user.id)

# Validate project when they are saved
post_save.connect(on_project_save, sender=Project)

class Stack(models.Model):
    class Meta:
        db_table = "stack"
    title = models.TextField(help_text="Descriptive title of this stack.")
    dimension = Integer3DField(help_text="The pixel dimensionality of the "
            "stack.")
    resolution = Double3DField(help_text="The resolution of the stack in "
            "nanometers.")
    image_base = models.TextField(help_text="Fully qualified URL where the "
            "tile data can be found.")
    comment = models.TextField(blank=True, null=True,
            help_text="A comment that describes the image data.")
    trakem2_project = models.BooleanField(default=False,
            help_text="Is TrakEM2 the source of this stack?")
    num_zoom_levels = models.IntegerField(default=-1,
            help_text="The number of zoom levels a stack has data for. A "
            "value of -1 lets CATMAID dynamically determine the actual value "
            "so that at this value the largest extent (X or Y) won't be "
            "smaller than 1024 pixels. Values larger -1 will be used directly.")
    file_extension = models.TextField(default='jpg', blank=True,
            help_text="The file extension of the data files.")
    tile_width = models.IntegerField(default=256,
            help_text="The width of one tile.")
    tile_height = models.IntegerField(default=256,
            help_text="The height of one tile.")
    tile_source_type = models.IntegerField(default=1,
            choices=((1, '1: File-based image stack'),
                     (2, '2: Request query-based image stack'),
                     (3, '3: HDF5 via CATMAID backend'),
                     (4, '4: File-based image stack with zoom level directories'),
                     (5, '5: Directory-based image stack'),
                     (6, '6: DVID imageblk voxels'),
                     (7, '7: Render service'),
                     (8, '8: DVID imagetile tiles')),
            help_text='This represents how the tile data is organized. '
            'See <a href="http://catmaid.org/tile_sources.html">tile source '
            'conventions documentation</a>.')
    metadata = models.TextField(default='', blank=True,
            help_text="Arbitrary text that is displayed alongside the stack.")
    tags = TaggableManager(blank=True)

    def __unicode__(self):
        return self.title

class ProjectStack(models.Model):
    class Meta:
        db_table = "project_stack"
    project = models.ForeignKey(Project)
    stack = models.ForeignKey(Stack)
    translation = Double3DField(default=(0, 0, 0))
    orientation = models.IntegerField(choices=((0, 'xy'), (1, 'xz'), (2, 'zy')), default=0)

    def __unicode__(self):
        return self.project.title + " -- " + self.stack.title

class Overlay(models.Model):
    class Meta:
        db_table = "overlay"
    title = models.TextField()
    stack = models.ForeignKey(Stack)
    image_base = models.TextField()
    default_opacity = models.IntegerField(default=0)
    file_extension = models.TextField()
    tile_width = models.IntegerField(default=512)
    tile_height = models.IntegerField(default=512)
    tile_source_type = models.IntegerField(default=1)

    def __unicode__(self):
        return str(self.id) + ": " + self.stack.title + " with " + self.title

class Concept(models.Model):
    class Meta:
        db_table = "concept"
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    project = models.ForeignKey(Project)

def create_concept_sub_table(table_name):
    db.execute('''CREATE TABLE %s () INHERITS (concept)''' % table_name);
    db.execute('''CREATE SEQUENCE %s_id_seq
                    START WITH 1
                    INCREMENT BY 1
                    NO MAXVALUE
                    NO MINVALUE
                    CACHE 1''' % table_name);
    db.execute('''ALTER SEQUENCE %s_id_seq OWNED BY %s.id''' % (table_name, table_name));
    db.execute('''ALTER TABLE ONLY %s ADD CONSTRAINT %s_pkey PRIMARY KEY (id)''' % (table_name, table_name));
    db.execute('''ALTER TABLE %s ALTER COLUMN id SET DEFAULT nextval('%s_id_seq'::regclass)''' % (table_name, table_name));   # use concept_id_seq so id unique across all concepts?
    db.execute('''ALTER TABLE ONLY %s ADD CONSTRAINT %s_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_user(id)''' % (table_name, table_name));
    db.execute('''CREATE TRIGGER on_edit_%s
                    BEFORE UPDATE ON %s
                    FOR EACH ROW EXECUTE PROCEDURE on_edit()''' % (table_name, table_name));

class Class(models.Model):
    class Meta:
        db_table = "class"
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    project = models.ForeignKey(Project)
    # Now new columns:
    class_name = models.CharField(max_length=255)
    description = models.TextField()

    def __unicode__(self):
        return self.class_name

class ConnectivityDirection:
    PRESYNAPTIC_PARTNERS = 0
    POSTSYNAPTIC_PARTNERS = 1

class ClassInstance(models.Model):
    class Meta:
        db_table = "class_instance"
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
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
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    project = models.ForeignKey(Project)
    # Now new columns:
    relation_name = models.CharField(max_length=255)
    uri = models.TextField()
    description = models.TextField()
    isreciprocal = models.BooleanField(default=False)

class RelationInstance(models.Model):
    class Meta:
        db_table = "relation_instance"
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    project = models.ForeignKey(Project)
    # Now new columns:
    relation = models.ForeignKey(Relation)

class ClassInstanceClassInstance(models.Model):
    class Meta:
        db_table = "class_instance_class_instance"
    # Repeat the columns inherited from 'relation_instance'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
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
    stack = models.ForeignKey(Stack)
    index = models.IntegerField()

class ClassClass(models.Model):
    class Meta:
        db_table = "class_class"
    # Repeat the columns inherited from 'relation_instance'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    project = models.ForeignKey(Project)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    class_a = models.ForeignKey(Class, related_name='classes_a',
                                db_column='class_a')
    class_b = models.ForeignKey(Class, related_name='classes_b',
                                db_column='class_b')

class Message(models.Model):
    class Meta:
        db_table = "message"
    user = models.ForeignKey(User)
    time = models.DateTimeField(default=datetime.now)
    read = models.BooleanField(default=False)
    title = models.TextField()
    text = models.TextField(default='New message', blank=True, null=True)
    action = models.TextField(blank=True, null=True)

class Settings(models.Model):
    class Meta:
        db_table = "settings"
    key = models.TextField(primary_key=True)
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
            otherProjects = get_objects_for_user(user, ['can_annotate', 'can_browse'], Project, any_perm = True)
            otherProjects = [a for a in otherProjects if a not in adminProjects]

            # Now filter to the data to which the user has access.
            return fullSet.filter(Q(project__in = adminProjects) | (Q(project__in = otherProjects) & Q(user = user)))


class UserFocusedModel(models.Model):
    objects = UserFocusedManager()
    user = models.ForeignKey(User)
    project = models.ForeignKey(Project)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    class Meta:
        abstract = True


class Textlabel(models.Model):
    class Meta:
        db_table = "textlabel"
    type = models.CharField(max_length=32)
    text = models.TextField(default="Edit this text ...")
    colour = RGBAField(default=(1, 0.5, 0, 1))
    font_name = models.TextField(null=True)
    font_style = models.TextField(null=True)
    font_size = models.FloatField(default=32)
    project = models.ForeignKey(Project)
    scaling = models.BooleanField(default=True)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    deleted = models.BooleanField(default=False)

class TextlabelLocation(models.Model):
    class Meta:
        db_table = "textlabel_location"
    textlabel = models.ForeignKey(Textlabel)
    location = Double3DField()
    deleted = models.BooleanField(default=False)

class Location(UserFocusedModel):
    class Meta:
        db_table = "location"
    editor = models.ForeignKey(User, related_name='location_editor', db_column='editor_id')
    location_x = models.FloatField()
    location_y = models.FloatField()
    location_z = models.FloatField()

class Treenode(UserFocusedModel):
    class Meta:
        db_table = "treenode"
    editor = models.ForeignKey(User, related_name='treenode_editor', db_column='editor_id')
    location_x = models.FloatField()
    location_y = models.FloatField()
    location_z = models.FloatField()
    parent = models.ForeignKey('self', null=True, related_name='children')
    radius = models.FloatField()
    confidence = models.IntegerField(default=5)
    skeleton = models.ForeignKey(ClassInstance)


class SuppressedVirtualTreenode(UserFocusedModel):
    class Meta:
        db_table = "suppressed_virtual_treenode"
    child = models.ForeignKey(Treenode)
    location_coordinate = models.FloatField()
    orientation = models.SmallIntegerField(choices=((0, 'z'), (1, 'y'), (2, 'x')))


class Connector(UserFocusedModel):
    class Meta:
        db_table = "connector"
    editor = models.ForeignKey(User, related_name='connector_editor', db_column='editor_id')
    location_x = models.FloatField()
    location_y = models.FloatField()
    location_z = models.FloatField()
    confidence = models.IntegerField(default=5)


class TreenodeClassInstance(UserFocusedModel):
    class Meta:
        db_table = "treenode_class_instance"
    # Repeat the columns inherited from 'relation_instance'
    relation = models.ForeignKey(Relation)
    # Now new columns:
    treenode = models.ForeignKey(Treenode)
    class_instance = models.ForeignKey(ClassInstance)

class ConnectorClassInstance(UserFocusedModel):
    class Meta:
        db_table = "connector_class_instance"
    # Repeat the columns inherited from 'relation_instance'
    relation = models.ForeignKey(Relation)
    # Now new columns:
    connector = models.ForeignKey(Connector)
    class_instance = models.ForeignKey(ClassInstance)

class TreenodeConnector(UserFocusedModel):
    class Meta:
        db_table = "treenode_connector"
        unique_together = (('project', 'treenode', 'connector', 'relation'),)
    # Repeat the columns inherited from 'relation_instance'
    relation = models.ForeignKey(Relation)
    # Now new columns:
    treenode = models.ForeignKey(Treenode)
    connector = models.ForeignKey(Connector)
    skeleton = models.ForeignKey(ClassInstance)
    confidence = models.IntegerField(default=5)

class Review(models.Model):
    """ This model represents the review of a user of one particular tree node
    of a specific skeleton. Technically, the treenode ID is enough to get the
    skeleton and the project. However, both of them are included for
    performance reasons (to avoid a join in the database for retrieval).
    """
    class Meta:
        db_table = "review"
    project = models.ForeignKey(Project)
    reviewer = models.ForeignKey(User)
    review_time = models.DateTimeField(default=datetime.now)
    skeleton = models.ForeignKey(ClassInstance)
    treenode = models.ForeignKey(Treenode)

class ReviewerWhitelist(models.Model):
    """ This model represents that a user trusts the reviews of a partciular
    reviewer for a specific project created after a specified time.
    """
    class Meta:
        db_table = "reviewer_whitelist"
        unique_together = ('project', 'user', 'reviewer')
    project = models.ForeignKey(Project)
    user = models.ForeignKey(User)
    reviewer = models.ForeignKey(User, related_name='+')
    accept_after = models.DateTimeField(default=datetime.min)

class Volume(UserFocusedModel):
    """A three-dimensional volume in project space. Implemented as PostGIS
    Geometry type.
    """
    editor = models.ForeignKey(User, related_name='editor', db_column='editor_id')
    name = models.CharField(max_length=255)
    comment = models.TextField(blank=True, null=True)
    # GeoDjango-specific: a geometry field with PostGIS-specific 3 dimensions.
    geometry = spatial_models.GeometryField(dim=3, srid=0)
    # Override default manager with a GeoManager instance
    objects = spatial_models.GeoManager()

class RegionOfInterest(UserFocusedModel):
    class Meta:
        db_table = "region_of_interest"
    # Repeat the columns inherited from 'location'
    editor = models.ForeignKey(User, related_name='roi_editor', db_column='editor_id')
    location_x = models.FloatField()
    location_y = models.FloatField()
    location_z = models.FloatField()
    # Now new columns:
    stack = models.ForeignKey(Stack)
    zoom_level = models.IntegerField()
    width = models.FloatField()
    height = models.FloatField()
    rotation_cw =models.FloatField()

class RegionOfInterestClassInstance(UserFocusedModel):
    class Meta:
        db_table = "region_of_interest_class_instance"
    # Repeat the columns inherited from 'relation_instance'
    relation = models.ForeignKey(Relation)
    # Now new columns:
    region_of_interest = models.ForeignKey(RegionOfInterest)
    class_instance = models.ForeignKey(ClassInstance)

class Restriction(models.Model):
    class Meta:
        db_table = "restriction"
    # Repeat the columns inherited from 'concept'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    project = models.ForeignKey(Project)
    # Now new columns:
    enabled = models.BooleanField(default=True)
    restricted_link = models.ForeignKey(ClassClass)

class CardinalityRestriction(models.Model):
    """ A restriction that guards the number of class instances
    reffering explicitely to a relation in the semantic space.
    Different types are supported:

    0: The exact number of class instances is defined
    1: A maximum number of class instances is defined
    2: A minimum number of class instances is defined
    3: The exact number of class instances for each sub-type is defined
    4: The maximum number of class instances for each sub-type is defined
    5: The minimum number of class instances for each sub-type is defined
    """
    class Meta:
        db_table = "cardinality_restriction"
    # Repeat the columns inherited from 'restriction'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    project = models.ForeignKey(Project)
    enabled = models.BooleanField(default=True)
    restricted_link = models.ForeignKey(ClassClass)
    # Now new columns:
    cardinality_type = models.IntegerField();
    value = models.IntegerField();

    @staticmethod
    def get_supported_types():
        return {
            0: "Exactly n instances of any sub-type",
            1: "Maximum of n instances of any sub-type",
            2: "Minimum of n instances of any sub-type",
            3: "Exactly n instances of each sub-type",
            4: "Maximum n instances of each sub-type",
            5: "Minimum n instances of each sub-type"}

    def get_num_class_instances(self, ci, ctype=None):
        """ Returns the number of class instances, guarded by this
        restriction.
        """
        if ctype is None:
            return ClassInstanceClassInstance.objects.filter(class_instance_b=ci,
                relation=self.restricted_link.relation).count()
        else:
            return ClassInstanceClassInstance.objects.filter(class_instance_b=ci,
                relation=self.restricted_link.relation,
                class_instance_a__class_column=ctype).count()

    def would_violate(self, ci, c):
        """ Test if it would violate this restriction if a new instance
        of <c> is linked to <ci> with the guarded link. Note: This will
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
            # instantiated. A new instance violates never.
            return False
        elif self.cardinality_type == 3 or self.cardinality_type == 4:
            # Type 3 and type 4: exactly <value> number of class instances are
            # allowed for each sub-type. A new instance violates if there are
            # already <value> or more instances of a certain type.
            num_linked_ci = self.get_num_class_instances(ci, c)
            too_much_items = num_linked_ci >= self.value
            return too_much_items
        elif self.cardinality_type == 5:
            # Type 5: at maximum <value> number of class instances are allowed
            # for each sub-type. A new insatnce violates never.
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
                num_linked_ci = self.get_num_class_instances(ci, link.class_a)
                if num_linked_ci != self.value:
                    return True
        elif self.cardinality_type == 4:
            # Max n for each sub type
            subclass_links_q = get_subclass_links()
            for link in subclass_links_q:
                num_linked_ci = self.get_num_class_instances(ci, link.class_a)
                if num_linked_ci > self.value:
                    return True
        elif self.cardinality_type == 5:
            # Min n for each sub type
            subclass_links_q = get_subclass_links()
            for link in subclass_links_q:
                num_linked_ci = self.get_num_class_instances(ci, link.class_a)
                if num_linked_ci < self.value:
                    return True
            return False
        else:
            raise Exception("Unsupported cardinality type.")

class StackClassInstance(models.Model):
    class Meta:
        db_table = "stack_class_instance"
    # Repeat the columns inherited from 'relation_instance'
    user = models.ForeignKey(User)
    creation_time = models.DateTimeField(default=datetime.now)
    edition_time = models.DateTimeField(default=datetime.now)
    project = models.ForeignKey(Project)
    relation = models.ForeignKey(Relation)
    # Now new columns:
    stack = models.ForeignKey(Stack)
    class_instance = models.ForeignKey(ClassInstance)


class StackStackGroupManager(models.Manager):
    """A manager that will return only objects (expected to be class instances)
    that have their class attribute set to 'stackgroup'"""

    def get_queryset(self):
        return super(StackStackGroupManager, self).get_queryset().filter(
            class_instance__class_column__class_name='stackgroup')


class StackStackGroup(StackClassInstance):
    objects = StackStackGroupManager()
    class Meta:
        proxy=True


class StackGroupManager(models.Manager):
    """A manager that will return only objects (expected to be class instances)
    that have their class attribute set to 'stackgroup'"""

    def get_queryset(self):
        return super(StackGroupManager, self).get_queryset().filter(
            class_column__class_name='stackgroup')


class StackGroup(ClassInstance):
    objects = StackGroupManager()
    class Meta:
        proxy=True

    def __unicode__(self):
        return self.name

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
    operation_type = models.CharField(max_length=255)
    location = Double3DField()
    freetext = models.TextField()

class DataViewType(models.Model):
    class Meta:
        db_table = "data_view_type"
    title = models.TextField()
    code_type = models.TextField()
    comment = models.TextField(blank=True, null=True)

    def __unicode__(self):
        return self.title

class DataView(models.Model):
    class Meta:
        db_table = "data_view"
        ordering = ('position',)
        permissions = (
            ("can_administer_dataviews", "Can administer data views"),
            ("can_browse_dataviews", "Can browse data views")
        )
    title = models.TextField()
    data_view_type = models.ForeignKey(DataViewType)
    config = models.TextField(default="{}")
    is_default = models.BooleanField(default=False)
    position = models.IntegerField(default=0)
    comment = models.TextField(default="",blank=True,null=True)

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
            for n,dv in enumerate(default_views):
                if n == 0:
                    continue
                dv.is_default = False
                dv.save()

class UserProfile(models.Model):
    """ A class that stores a set of custom user preferences.
    See: http://digitaldreamer.net/blog/2010/12/8/custom-user-profile-and-extend-user-admin-django/
    """
    user = models.OneToOneField(User)
    inverse_mouse_wheel = models.BooleanField(
        default=settings.PROFILE_DEFAULT_INVERSE_MOUSE_WHEEL)
    display_stack_reference_lines = models.BooleanField(
        default=settings.PROFILE_DISPLAY_STACK_REFERENCE_LINES)
    independent_ontology_workspace_is_default = models.BooleanField(
        default=settings.PROFILE_INDEPENDENT_ONTOLOGY_WORKSPACE_IS_DEFAULT)
    show_text_label_tool = models.BooleanField(
        default=settings.PROFILE_SHOW_TEXT_LABEL_TOOL)
    show_tagging_tool = models.BooleanField(
        default=settings.PROFILE_SHOW_TAGGING_TOOL)
    show_cropping_tool = models.BooleanField(
        default=settings.PROFILE_SHOW_CROPPING_TOOL)
    show_segmentation_tool = models.BooleanField(
        default=settings.PROFILE_SHOW_SEGMENTATION_TOOL)
    show_tracing_tool = models.BooleanField(
        default=settings.PROFILE_SHOW_TRACING_TOOL)
    show_ontology_tool = models.BooleanField(
        default=settings.PROFILE_SHOW_ONTOLOGY_TOOL)
    show_roi_tool = models.BooleanField(
        default=settings.PROFILE_SHOW_ROI_TOOL)
    color = RGBAField(default=distinct_user_color)
    tracing_overlay_screen_scaling = models.BooleanField(
        default=settings.PROFILE_TRACING_OVERLAY_SCREEN_SCALING)
    tracing_overlay_scale = models.FloatField(
        default=settings.PROFILE_TRACING_OVERLAY_SCALE)
    prefer_webgl_layers = models.BooleanField(
        default=settings.PROFILE_PREFER_WEBGL_LAYERS)
    use_cursor_following_zoom = models.BooleanField(
        default=settings.PROFILE_USE_CURSOR_FOLLOWING_ZOOM)
    tile_linear_interpolation = models.BooleanField(
        default=settings.PROFILE_TILE_LINEAR_INTERPOLATION)

    def __unicode__(self):
        return self.user.username

    def as_dict(self):
        """ Return a dictionary containing a user's profile information.
        """
        pdict = {}
        pdict['inverse_mouse_wheel'] = self.inverse_mouse_wheel
        pdict['display_stack_reference_lines'] = \
            self.display_stack_reference_lines
        pdict['independent_ontology_workspace_is_default'] = \
            self.independent_ontology_workspace_is_default
        pdict['show_text_label_tool'] = self.show_text_label_tool
        pdict['show_tagging_tool'] = self.show_tagging_tool
        pdict['show_cropping_tool'] = self.show_cropping_tool
        pdict['show_segmentation_tool'] = self.show_segmentation_tool
        pdict['show_tracing_tool'] = self.show_tracing_tool
        pdict['show_ontology_tool'] = self.show_ontology_tool
        pdict['show_roi_tool'] = self.show_roi_tool
        pdict['tracing_overlay_screen_scaling'] = self.tracing_overlay_screen_scaling
        pdict['tracing_overlay_scale'] = self.tracing_overlay_scale
        pdict['prefer_webgl_layers'] = self.prefer_webgl_layers
        pdict['use_cursor_following_zoom'] = self.use_cursor_following_zoom
        pdict['tile_linear_interpolation'] = self.tile_linear_interpolation
        return pdict

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

def create_user_profile(sender, instance, created, **kwargs):
    """ Create the UserProfile when a new User is saved.
    """
    if created:
        profile = UserProfile()
        profile.user = instance
        profile.save()

# Connect the a User object's post save signal to the profile
# creation
post_save.connect(create_user_profile, sender=User)

def add_user_to_default_groups(sender, instance, created, **kwargs):
    if created and settings.NEW_USER_DEFAULT_GROUPS:
        for group in settings.NEW_USER_DEFAULT_GROUPS:
            try:
                g = Group.objects.get(name=group)
                g.user_set.add(instance)
            except Group.DoesNotExist:
                print("Default group %s does not exist" % group)

# Connect the a User object's post save signal to the profile
# creation
post_save.connect(add_user_to_default_groups, sender=User)

# Prevent interactive question about wanting a superuser created.  (This code
# has to go in this "models" module so that it gets processed by the "syncdb"
# command during database creation.)
#
# From http://stackoverflow.com/questions/1466827/ --

from django.contrib.auth import models as auth_models
from django.contrib.auth.management import create_superuser

post_syncdb.disconnect(
    create_superuser,
    sender=auth_models,
    dispatch_uid='django.contrib.auth.management.create_superuser')


class ChangeRequest(UserFocusedModel):
    OPEN = 0
    APPROVED = 1
    REJECTED = 2
    INVALID = 3

    class Meta:
        db_table = "change_request"

    type = models.CharField(max_length = 32)
    description = models.TextField()
    status = models.IntegerField(default = OPEN)
    recipient = models.ForeignKey(User, related_name='change_recipient', db_column='recipient_id')
    location = Double3DField()
    treenode = models.ForeignKey(Treenode)
    connector = models.ForeignKey(Connector)
    validate_action = models.TextField()
    approve_action = models.TextField()
    reject_action = models.TextField()
    completion_time = models.DateTimeField(default = None, null = True)

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

        return is_valid;

    def approve(self, *args, **kwargs):
        if not self.is_valid():
            raise Exception('Failed to approve change request: the change is no longer possible.')

        try:
            exec(self.approve_action)
            self.status = ChangeRequest.APPROVED
            self.completion_time = datetime.now()
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
            self.completion_time = datetime.now()
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
    if re.search('is_valid\s=', cr.validate_action) == None:
        raise Exception('The validate action of a ChangeRequest must assign a value to the is_valid variable.')


def send_email_to_change_request_recipient(sender, instance, created, **kwargs):
    """ Send the recipient of a change request a message and an e-mail when the request is created."""

    if created:
        title = instance.type + ' Request'
        message = instance.user.get_full_name() + ' has sent you a ' + instance.type.lower() + ' request.  Please check your notifications.'
        notify_user(instance.recipient, title, message)

post_save.connect(send_email_to_change_request_recipient, sender = ChangeRequest)


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
        print >> sys.stderr, 'Failed to send e-mail (', str(e), ')'
