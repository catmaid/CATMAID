# -*- coding: utf-8 -*-
import datetime
from south.db import db
from south.v2 import SchemaMigration
from django.db import models


class Migration(SchemaMigration):

    table_names_for_on_edit = ('class_instance',
                               'textlabel',
                               'concept',
                               'class',
                               'class_class',
                               'class_instance_class_instance',
                               'connector',
                               'connector_class_instance',
                               'location',
                               'relation',
                               'relation_instance',
                               'treenode',
                               'treenode_class_instance',
                               'treenode_connector')

    def forwards(self, orm):

        db.execute("CREATE TYPE double3d AS ("
                   "x double precision,"
                   "y double precision,"
                   "z double precision);")

        db.execute("CREATE TYPE integer3d AS ("
                   "x integer,"
                   "y integer,"
                   "z integer);")

        db.execute("CREATE TYPE rgba AS ("
                   "r real,"
                   "g real,"
                   "b real,"
                   "a real);")

        db.execute('CREATE FUNCTION on_edit() RETURNS trigger\n'
                   '    LANGUAGE plpgsql\n'
                   '    AS $$BEGIN\n'
                   '    NEW."edition_time" := now();\n'
                   '    RETURN NEW;\n'
                   'END;\n'
                   '$$;')

        # Adding model 'Concept'

        # Create the concept table with raw SQL, so that we can set
        # the default values for creation_time and edition time - this
        # means that we don't have to immediately change the legacy
        # (non-Django ORM) scripts to add values for those fields
        # explicitly:

        db.execute('''CREATE TABLE concept (
                   id bigint NOT NULL,
                   user_id integer NOT NULL,
                   creation_time timestamp with time zone DEFAULT now() NOT NULL,
                   edition_time timestamp with time zone DEFAULT now() NOT NULL,
                   project_id integer NOT NULL)''')
        db.execute('''CREATE SEQUENCE concept_id_seq
                   START WITH 1
                   INCREMENT BY 1
                   NO MINVALUE
                   NO MAXVALUE
                   CACHE 1''')
        db.execute('''ALTER SEQUENCE concept_id_seq OWNED BY concept.id''')
        db.send_create_signal('catmaid', ['Concept'])

        # ========================================================================

        # The following tables all inherit from Concept using
        # PostgreSQL's table inheritance, so we have to create them
        # with raw SQL:

        # Adding model 'Class'
        db.execute('''CREATE TABLE class (
                   class_name character varying(255) NOT NULL,
                   description text)
                   INHERITS (concept)''')
        db.send_create_signal('catmaid', ['Class'])

        # Adding model 'RelationInstance'
        db.execute('''CREATE TABLE relation_instance (
                   relation_id bigint NOT NULL)
                   INHERITS (concept)''')
        db.send_create_signal('catmaid', ['RelationInstance'])

        # Adding model 'ClassClass'
        db.execute('''CREATE TABLE class_class (
                   class_a bigint,
                   class_b bigint)
                   INHERITS (relation_instance)''')
        db.send_create_signal('catmaid', ['ClassClass'])

        # Adding model 'ClassInstance'
        db.execute('''CREATE TABLE class_instance (
                   class_id bigint NOT NULL,
                   name character varying(255) NOT NULL)
                   INHERITS (concept)''')
        db.send_create_signal('catmaid', ['ClassInstance'])

        # Adding model 'ClassInstanceClassInstance'
        db.execute('''CREATE TABLE class_instance_class_instance (
                   class_instance_a bigint,
                   class_instance_b bigint)
                   INHERITS (relation_instance)''')
        db.send_create_signal('catmaid', ['ClassInstanceClassInstance'])

        # Adding model 'Component'
        db.execute('''CREATE TABLE component (
                    stack_id bigint NOT NULL,
                    skeleton_id bigint NOT NULL,
                    component_id bigint NOT NULL,
                    min_x bigint NOT NULL,
                    min_y bigint NOT NULL,
                    max_x bigint NOT NULL,
                    max_y bigint NOT NULL,
                    z bigint NOT NULL,
                    threshold double precision,
                    status integer DEFAULT 0 NOT NULL)
                    INHERITS (concept)''')
        db.send_create_signal('catmaid', ['Component'])

        # Adding model 'Location'
        db.execute('''CREATE TABLE location (
                   location double3d NOT NULL,
                   reviewer_id integer DEFAULT (-1) NOT NULL,
                   review_time timestamp with time zone,
                   editor_id integer)
                   INHERITS (concept)''')
        db.send_create_signal('catmaid', ['Location'])

        # Adding model 'Connector'
        db.execute('''CREATE TABLE connector (
                   confidence integer DEFAULT 5 NOT NULL)
                   INHERITS (location)''')
        db.send_create_signal('catmaid', ['Connector'])

        # Adding model 'ConnectorClassInstance'
        db.execute('''CREATE TABLE connector_class_instance (
                   connector_id bigint NOT NULL,
                   class_instance_id bigint NOT NULL)
                   INHERITS (relation_instance)''')
        db.send_create_signal('catmaid', ['ConnectorClassInstance'])

        # Adding model 'Drawing'
        db.execute('''CREATE TABLE drawing (
                   stack_id bigint NOT NULL,
                   z bigint NOT NULL,
                   skeleton_id bigint,
                   component_id bigint,
                   min_x bigint NOT NULL,
                   min_y bigint NOT NULL,
                   max_x bigint NOT NULL,
                   max_y bigint NOT NULL,
                   svg text NOT NULL,
                   type integer DEFAULT 0 NOT NULL,
                   status integer DEFAULT 0 NOT NULL)
                   INHERITS (concept)''')
        db.send_create_signal('catmaid', ['Drawing'])

        # Adding model 'Log'
        db.execute('''CREATE TABLE log (
                   operation_type character varying(255) NOT NULL,
                   location double3d,
                   freetext text)
                   INHERITS (concept)''')
        db.send_create_signal('catmaid', ['Log'])

        # Adding model 'Relation'
        db.execute('''CREATE TABLE relation (
                   relation_name character varying(255) NOT NULL,
                   uri text,
                   description text,
                   isreciprocal boolean DEFAULT false NOT NULL)
                   INHERITS (concept)''')
        db.send_create_signal('catmaid', ['Relation'])

        # Adding model 'SkeletonlistDashboard'
        db.execute('''CREATE TABLE skeletonlist_dashboard (
                   shortname character varying(255) NOT NULL,
                   skeleton_list integer[],
                   description text)
                   INHERITS (concept)''')
        db.send_create_signal('catmaid', ['SkeletonlistDashboard'])

        # Adding model 'Treenode'
        db.execute('''CREATE TABLE treenode (
                   parent_id bigint,
                   radius double precision DEFAULT 0 NOT NULL,
                   confidence integer DEFAULT 5 NOT NULL,
                   skeleton_id bigint)
                   INHERITS (location)''')
        db.send_create_signal('catmaid', ['Treenode'])

        # Adding model 'TreenodeClassInstance'
        db.execute('''CREATE TABLE treenode_class_instance (
                   treenode_id bigint NOT NULL,
                   class_instance_id bigint NOT NULL)
                   INHERITS (relation_instance)''')
        db.send_create_signal('catmaid', ['TreenodeClassInstance'])

        # Adding model 'TreenodeConnector'
        db.execute('''CREATE TABLE treenode_connector (
                   treenode_id bigint NOT NULL,
                   connector_id bigint NOT NULL,
                   skeleton_id bigint,
                   confidence integer DEFAULT 5 NOT NULL)
                   INHERITS (relation_instance)''')
        db.send_create_signal('catmaid', ['TreenodeConnector'])

        # ========================================================================

        # The tables below do not use PostgreSQL table inheritance, so
        # we can just use the South-generated db.create_table statements:

        # Adding model 'Project'
        db.create_table('project', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('title', self.gf('django.db.models.fields.TextField')()),
            ('public', self.gf('django.db.models.fields.BooleanField')(default=True)),
            ('wiki_base_url', self.gf('django.db.models.fields.TextField')(null=True, blank=True)),
        ))
        db.send_create_signal('catmaid', ['Project'])

        # Adding model 'Stack'
        db.create_table('stack', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('title', self.gf('django.db.models.fields.TextField')()),
            ('dimension', self.gf('catmaid.fields.Integer3DField')()),
            ('resolution', self.gf('catmaid.fields.Double3DField')()),
            ('image_base', self.gf('django.db.models.fields.TextField')()),
            ('comment', self.gf('django.db.models.fields.TextField')(null=True, blank=True)),
            ('trakem2_project', self.gf('django.db.models.fields.BooleanField')(default=False)),
            ('num_zoom_levels', self.gf('django.db.models.fields.IntegerField')(default=-1)),
            ('file_extension', self.gf('django.db.models.fields.TextField')(default='jpg', blank=True)),
            ('tile_width', self.gf('django.db.models.fields.IntegerField')(default=256)),
            ('tile_height', self.gf('django.db.models.fields.IntegerField')(default=256)),
            ('tile_source_type', self.gf('django.db.models.fields.IntegerField')(default=1)),
            ('metadata', self.gf('django.db.models.fields.TextField')(default='', blank=True)),
        ))
        db.send_create_signal('catmaid', ['Stack'])

        # Adding model 'ProjectStack'
        db.create_table('project_stack', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('project', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['catmaid.Project'])),
            ('stack', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['catmaid.Stack'])),
            ('translation', self.gf('catmaid.fields.Double3DField')(default=(0, 0, 0))),
        ))
        db.send_create_signal('catmaid', ['ProjectStack'])

        # Adding model 'Overlay'
        db.create_table('overlay', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('title', self.gf('django.db.models.fields.TextField')()),
            ('stack', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['catmaid.Stack'])),
            ('image_base', self.gf('django.db.models.fields.TextField')()),
            ('default_opacity', self.gf('django.db.models.fields.IntegerField')(default=0)),
            ('file_extension', self.gf('django.db.models.fields.TextField')()),
            ('tile_width', self.gf('django.db.models.fields.IntegerField')(default=512)),
            ('tile_height', self.gf('django.db.models.fields.IntegerField')(default=512)),
            ('tile_source_type', self.gf('django.db.models.fields.IntegerField')(default=1)),
        ))
        db.send_create_signal('catmaid', ['Overlay'])

        # Adding model 'BrokenSlice'
        db.create_table('broken_slice', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('stack', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['catmaid.Stack'])),
            ('index', self.gf('django.db.models.fields.IntegerField')()),
        ))
        db.send_create_signal('catmaid', ['BrokenSlice'])

        # Adding model 'Message'
        db.create_table('message', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('user', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['auth.User'])),
            ('time', self.gf('django.db.models.fields.DateTimeField')(default=datetime.datetime.now)),
            ('read', self.gf('django.db.models.fields.BooleanField')(default=False)),
            ('title', self.gf('django.db.models.fields.TextField')()),
            ('text', self.gf('django.db.models.fields.TextField')(default='New message', null=True, blank=True)),
            ('action', self.gf('django.db.models.fields.TextField')(null=True, blank=True)),
        ))
        db.send_create_signal('catmaid', ['Message'])

        # Adding model 'Settings'
        db.create_table('settings', (
            ('key', self.gf('django.db.models.fields.TextField')(primary_key=True)),
            ('value', self.gf('django.db.models.fields.TextField')(null=True)),
        ))
        db.send_create_signal('catmaid', ['Settings'])

        # Adding model 'Textlabel'
        db.create_table('textlabel', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('type', self.gf('django.db.models.fields.CharField')(max_length=32)),
            ('text', self.gf('django.db.models.fields.TextField')(default='Edit this text ...')),
            ('colour', self.gf('catmaid.fields.RGBAField')(default=(1, 0.5, 0, 1))),
            ('font_name', self.gf('django.db.models.fields.TextField')(null=True)),
            ('font_style', self.gf('django.db.models.fields.TextField')(null=True)),
            ('font_size', self.gf('django.db.models.fields.FloatField')(default=32)),
            ('project', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['catmaid.Project'])),
            ('scaling', self.gf('django.db.models.fields.BooleanField')(default=True)),
            ('creation_time', self.gf('django.db.models.fields.DateTimeField')(default=datetime.datetime.now)),
            ('edition_time', self.gf('django.db.models.fields.DateTimeField')(default=datetime.datetime.now)),
            ('deleted', self.gf('django.db.models.fields.BooleanField')(default=False)),
        ))
        db.send_create_signal('catmaid', ['Textlabel'])

        # Adding model 'TextlabelLocation'
        db.create_table('textlabel_location', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('textlabel', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['catmaid.Textlabel'])),
            ('location', self.gf('catmaid.fields.Double3DField')()),
            ('deleted', self.gf('django.db.models.fields.BooleanField')(default=False)),
        ))
        db.send_create_signal('catmaid', ['TextlabelLocation'])

        # Adding model 'ApiKey'
        db.create_table('catmaid_apikey', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('description', self.gf('django.db.models.fields.TextField')()),
            ('key', self.gf('django.db.models.fields.CharField')(max_length=128)),
        ))
        db.send_create_signal('catmaid', ['ApiKey'])

        # Adding model 'DataViewType'
        db.create_table('data_view_type', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('title', self.gf('django.db.models.fields.TextField')()),
            ('code_type', self.gf('django.db.models.fields.TextField')()),
            ('comment', self.gf('django.db.models.fields.TextField')(null=True, blank=True)),
        ))
        db.send_create_signal('catmaid', ['DataViewType'])

        # Adding model 'DataView'
        db.create_table('data_view', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('title', self.gf('django.db.models.fields.TextField')()),
            ('data_view_type', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['catmaid.DataViewType'])),
            ('config', self.gf('django.db.models.fields.TextField')(default='{}')),
            ('is_default', self.gf('django.db.models.fields.BooleanField')(default=False)),
            ('position', self.gf('django.db.models.fields.IntegerField')(default=0)),
            ('comment', self.gf('django.db.models.fields.TextField')(default='', null=True, blank=True)),
        ))
        db.send_create_signal('catmaid', ['DataView'])

        # Adding model 'DeprecatedAppliedMigrations'
        db.create_table('applied_migrations', (
            ('id', self.gf('django.db.models.fields.CharField')(max_length=32, primary_key=True)),
        ))
        db.send_create_signal('catmaid', ['DeprecatedAppliedMigrations'])

        # Adding model 'DeprecatedSession'
        db.create_table('sessions', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('session_id', self.gf('django.db.models.fields.CharField')(max_length=26)),
            ('data', self.gf('django.db.models.fields.TextField')(default='')),
            ('last_accessed', self.gf('django.db.models.fields.DateTimeField')(default=datetime.datetime.now)),
        ))
        db.send_create_signal('catmaid', ['DeprecatedSession'])

        # Adding model 'UserProfile'
        db.create_table('catmaid_userprofile', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('user', self.gf('django.db.models.fields.related.OneToOneField')(to=orm['auth.User'], unique=True)),
            ('inverse_mouse_wheel', self.gf('django.db.models.fields.BooleanField')(default=False)),
        ))
        db.send_create_signal('catmaid', ['UserProfile'])

        # Now create all the on_edit triggers:

        statement_fmt = '''CREATE TRIGGER on_edit_%s
                        BEFORE UPDATE ON %s
                        FOR EACH ROW EXECUTE PROCEDURE on_edit()'''
        for table_name in Migration.table_names_for_on_edit:
            db.execute(statement_fmt % (table_name, table_name))

        # And create the indexes on connector and treenode:

        statement_fmt = 'CREATE INDEX %s_%s_index ON treenode USING btree (((location).%s));'
        for table in ('connector', 'location'):
            for dimension in ('x', 'y', 'z'):
                db.execute(statement_fmt % (table, dimension, dimension))

        # Make sure we have the primary key for all the tables that
        # inherit from concept.  It's not really clear to me that this
        # is necessary - the primary key is inherited from concept,
        # which does have PRIMARY KEY specified.  However, old
        # database dumps do have these, so let's be careful and do the
        # same.  (The old database dump also included a separate
        # UNIQUE constraint on the id column, but that's implied by
        # PRIMARY KEY so I'm leaving it out.)

        statement_default_fmt = "ALTER TABLE ONLY %s ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass)"
        statement_pk_fmt = "ALTER TABLE ONLY %s ADD CONSTRAINT %s_pkey PRIMARY KEY (id)"

        for table in ('class',
                      'relation_instance',
                      'class_class',
                      'class_instance',
                      'class_instance_class_instance',
                      'component',
                      'location',
                      'connector',
                      'connector_class_instance',
                      'drawing',
                      'log',
                      'relation',
                      'skeletonlist_dashboard',
                      'treenode',
                      'treenode_class_instance',
                      'treenode_connector'):
            db.execute(statement_pk_fmt % (table, table))
            db.execute(statement_default_fmt % (table,))

        # There's one other stray constraint to create, which is on
        # the type of textlabels:

        db.execute('''ALTER TABLE textlabel
                   ADD CONSTRAINT textlabel_type_check
                   CHECK ((((type)::text = 'text'::text) OR
                           ((type)::text = 'bubble'::text)))''')

        # Some default data needs to be inserted the data_views and
        # data_view_types tables:

        db.execute('''INSERT INTO data_view VALUES (1, 'Project list', 2, '{}', false, 0, '')''')
        db.execute('''INSERT INTO data_view VALUES (2, 'Project table with images', 3, '{"sample_images":true}', true, 1, '')''')

        db.execute('''INSERT INTO data_view_type
                   VALUES (
                       1,
                       'Legacy project list view',
                       'legacy_project_list_data_view',
                       'A simple list of all projects and their stacks. It is rendered in the browser with the help of JavaScript and it does not support any configuration options. The config field of a data view is therefore likely to read only {}.')''')

        db.execute('''INSERT INTO data_view_type
                   VALUES (
                       2,
                       'Project list view',
                       'project_list_data_view',
                       'A simple adjustable list of all projects and their stacks. This view is rendered server side and supports the display of sample images. The following options are available: "filter_tags": [list of tags], "sample_images": [true|false], "sample_stack": ["first"|"last"], "sample_slice": [slice number|"first"|"center"|"last"], "sample_width": [pixel size] and "sample_height": [pixel size]. By default projects are sorted. Use "sort":false to turn this off. Thus, a valid sample configuration could look like: {"sample_images":true,"sample_stack":"last","sample_slice":"center","sample_width":100,"filter_tags":["TagA","TagB"]}')''')

        db.execute('''INSERT INTO data_view_type
                   VALUES (
                       3,
                       'Tabular project view',
                       'project_table_data_view',
                       'A simple table of all projects and their stacks. This view is rendered server side and supports the display of sample images instead of stack names. The following options are available: "filter_tags": [list of tags], "sample_images": [true|false], "sample_slice": [slice number|"first"|"center"|"last"], "sample_width": [pixel size], "sample_height": [pixel size] and "sort": [true|false]. By default projects are sorted and displayed without images. A valid configuration could look like: {"sample_images":true,"sample_slice":"center","sample_height":42,"filter_tags":["TagA","TagB"]}')''')

        db.execute('''INSERT INTO data_view_type
                   VALUES (
                       4,
                       'Tag project view',
                       'project_tags_data_view',
                       'A table that allows to define tags for the columns and rows. This view is rendered server side and supports the display of sample images instead of stack names. The following options are available: "filter_tags": [list of tags], "col_tags": [list of tags], "row_tags": [list of tags], "sample_images": [true|false], "sample_slice": [slice number|"first"|"center"|"last"], "sample_width": [pixel size], "sample_height": [pixel size], "sort": [true|false]. By default projects are sorted and displayed without images. A valid configuration could look like: {"row_tags":["DAPI","Crb"],"col_tags":["Wing Disc","CNS"]}')''')

    def backwards(self, orm):

        db.execute('ALTER TABLE textlabel DROP CONSTRAINT textlabel_type_check')

        statement_fmt = 'DROP INDEX %s_%s_index'
        for table in ('connector', 'location'):
            for dimension in ('x', 'y', 'z'):
                db.execute(statement_fmt % (table, dimension))

        statement_fmt = 'DROP TRIGGER on_edit_%s ON %s'
        for table_name in Migration.table_names_for_on_edit:
            db.execute(statement_fmt % (table_name, table_name))

        # Deleting model 'Project'
        db.delete_table('project')

        # Deleting model 'Stack'
        db.delete_table('stack')

        # Deleting model 'ProjectStack'
        db.delete_table('project_stack')

        # Deleting model 'Overlay'
        db.delete_table('overlay')

        # Deleting model 'Concept' - note that dropping the concept
        # table also drops all tables that inherit from it, so there
        # is no need to drop those explicitly.
        db.delete_table('concept')

        # Deleting model 'BrokenSlice'
        db.delete_table('broken_slice')

        # Deleting model 'Message'
        db.delete_table('message')

        # Deleting model 'Settings'
        db.delete_table('settings')

        # Deleting model 'Textlabel'
        db.delete_table('textlabel')

        # Deleting model 'TextlabelLocation'
        db.delete_table('textlabel_location')

        # Deleting model 'ApiKey'
        db.delete_table('catmaid_apikey')

        # Deleting model 'DataViewType'
        db.delete_table('data_view_type')

        # Deleting model 'DataView'
        db.delete_table('data_view')

        # Deleting model 'DeprecatedAppliedMigrations'
        db.delete_table('applied_migrations')

        # Deleting model 'DeprecatedSession'
        db.delete_table('sessions')

        # Deleting model 'UserProfile'
        db.delete_table('catmaid_userprofile')

        # Now remove the custom types and triggers:

        db.execute("DROP TYPE double3d")
        db.execute("DROP TYPE integer3d")
        db.execute("DROP TYPE rgba")

        db.execute('DROP FUNCTION on_edit()')

    models = {
        'auth.group': {
            'Meta': {'object_name': 'Group'},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'unique': 'True', 'max_length': '80'}),
            'permissions': ('django.db.models.fields.related.ManyToManyField', [], {'to': "orm['auth.Permission']", 'symmetrical': 'False', 'blank': 'True'})
        },
        'auth.permission': {
            'Meta': {'ordering': "('content_type__app_label', 'content_type__model', 'codename')", 'unique_together': "(('content_type', 'codename'),)", 'object_name': 'Permission'},
            'codename': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'content_type': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['contenttypes.ContentType']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '50'})
        },
        'auth.user': {
            'Meta': {'object_name': 'User'},
            'date_joined': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'email': ('django.db.models.fields.EmailField', [], {'max_length': '75', 'blank': 'True'}),
            'first_name': ('django.db.models.fields.CharField', [], {'max_length': '30', 'blank': 'True'}),
            'groups': ('django.db.models.fields.related.ManyToManyField', [], {'to': "orm['auth.Group']", 'symmetrical': 'False', 'blank': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'is_active': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'is_staff': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'is_superuser': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'last_login': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'last_name': ('django.db.models.fields.CharField', [], {'max_length': '30', 'blank': 'True'}),
            'password': ('django.db.models.fields.CharField', [], {'max_length': '128'}),
            'user_permissions': ('django.db.models.fields.related.ManyToManyField', [], {'to': "orm['auth.Permission']", 'symmetrical': 'False', 'blank': 'True'}),
            'username': ('django.db.models.fields.CharField', [], {'unique': 'True', 'max_length': '30'})
        },
        'catmaid.apikey': {
            'Meta': {'object_name': 'ApiKey'},
            'description': ('django.db.models.fields.TextField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'key': ('django.db.models.fields.CharField', [], {'max_length': '128'})
        },
        'catmaid.brokenslice': {
            'Meta': {'object_name': 'BrokenSlice', 'db_table': "'broken_slice'"},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'index': ('django.db.models.fields.IntegerField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"})
        },
        'catmaid.class': {
            'Meta': {'object_name': 'Class', 'db_table': "'class'"},
            'class_name': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'description': ('django.db.models.fields.TextField', [], {}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.classclass': {
            'Meta': {'object_name': 'ClassClass', 'db_table': "'class_class'"},
            'class_a': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'classes_a'", 'db_column': "'class_a'", 'to': "orm['catmaid.Class']"}),
            'class_b': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'classes_b'", 'db_column': "'class_b'", 'to': "orm['catmaid.Class']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.classinstance': {
            'Meta': {'object_name': 'ClassInstance', 'db_table': "'class_instance'"},
            'class_column': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Class']", 'db_column': "'class_id'"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.classinstanceclassinstance': {
            'Meta': {'object_name': 'ClassInstanceClassInstance', 'db_table': "'class_instance_class_instance'"},
            'class_instance_a': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'cici_via_a'", 'db_column': "'class_instance_a'", 'to': "orm['catmaid.ClassInstance']"}),
            'class_instance_b': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'cici_via_b'", 'db_column': "'class_instance_b'", 'to': "orm['catmaid.ClassInstance']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.component': {
            'Meta': {'object_name': 'Component', 'db_table': "'component'"},
            'component_id': ('django.db.models.fields.IntegerField', [], {}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'max_x': ('django.db.models.fields.IntegerField', [], {}),
            'max_y': ('django.db.models.fields.IntegerField', [], {}),
            'min_x': ('django.db.models.fields.IntegerField', [], {}),
            'min_y': ('django.db.models.fields.IntegerField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'skeleton_id': ('django.db.models.fields.IntegerField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'status': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'threshold': ('django.db.models.fields.FloatField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"}),
            'z': ('django.db.models.fields.IntegerField', [], {})
        },
        'catmaid.concept': {
            'Meta': {'object_name': 'Concept', 'db_table': "'concept'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.connector': {
            'Meta': {'object_name': 'Connector', 'db_table': "'connector'"},
            'confidence': ('django.db.models.fields.IntegerField', [], {'default': '5'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'editor': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'connector_editor'", 'db_column': "'editor_id'", 'to': "orm['auth.User']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'review_time': ('django.db.models.fields.DateTimeField', [], {}),
            'reviewer_id': ('django.db.models.fields.IntegerField', [], {'default': '-1'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.connectorclassinstance': {
            'Meta': {'object_name': 'ConnectorClassInstance', 'db_table': "'connector_class_instance'"},
            'class_instance': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']"}),
            'connector': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Connector']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.dataview': {
            'Meta': {'ordering': "('position',)", 'object_name': 'DataView', 'db_table': "'data_view'"},
            'comment': ('django.db.models.fields.TextField', [], {'default': "''", 'null': 'True', 'blank': 'True'}),
            'config': ('django.db.models.fields.TextField', [], {'default': "'{}'"}),
            'data_view_type': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.DataViewType']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'is_default': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'position': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        'catmaid.dataviewtype': {
            'Meta': {'object_name': 'DataViewType', 'db_table': "'data_view_type'"},
            'code_type': ('django.db.models.fields.TextField', [], {}),
            'comment': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        'catmaid.deprecatedappliedmigrations': {
            'Meta': {'object_name': 'DeprecatedAppliedMigrations', 'db_table': "'applied_migrations'"},
            'id': ('django.db.models.fields.CharField', [], {'max_length': '32', 'primary_key': 'True'})
        },
        'catmaid.deprecatedsession': {
            'Meta': {'object_name': 'DeprecatedSession', 'db_table': "'sessions'"},
            'data': ('django.db.models.fields.TextField', [], {'default': "''"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'last_accessed': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'session_id': ('django.db.models.fields.CharField', [], {'max_length': '26'})
        },
        'catmaid.drawing': {
            'Meta': {'object_name': 'Drawing', 'db_table': "'drawing'"},
            'component_id': ('django.db.models.fields.IntegerField', [], {}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'max_x': ('django.db.models.fields.IntegerField', [], {}),
            'max_y': ('django.db.models.fields.IntegerField', [], {}),
            'min_x': ('django.db.models.fields.IntegerField', [], {}),
            'min_y': ('django.db.models.fields.IntegerField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'skeleton_id': ('django.db.models.fields.IntegerField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'status': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'svg': ('django.db.models.fields.TextField', [], {}),
            'type': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"}),
            'z': ('django.db.models.fields.IntegerField', [], {})
        },
        'catmaid.location': {
            'Meta': {'object_name': 'Location', 'db_table': "'location'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'editor': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'location_editor'", 'db_column': "'editor_id'", 'to': "orm['auth.User']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'review_time': ('django.db.models.fields.DateTimeField', [], {}),
            'reviewer_id': ('django.db.models.fields.IntegerField', [], {'default': '-1'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.log': {
            'Meta': {'object_name': 'Log', 'db_table': "'log'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'freetext': ('django.db.models.fields.TextField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'operation_type': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.message': {
            'Meta': {'object_name': 'Message', 'db_table': "'message'"},
            'action': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'read': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'text': ('django.db.models.fields.TextField', [], {'default': "'New message'", 'null': 'True', 'blank': 'True'}),
            'time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'title': ('django.db.models.fields.TextField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.overlay': {
            'Meta': {'object_name': 'Overlay', 'db_table': "'overlay'"},
            'default_opacity': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'file_extension': ('django.db.models.fields.TextField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'image_base': ('django.db.models.fields.TextField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'tile_height': ('django.db.models.fields.IntegerField', [], {'default': '512'}),
            'tile_source_type': ('django.db.models.fields.IntegerField', [], {'default': '1'}),
            'tile_width': ('django.db.models.fields.IntegerField', [], {'default': '512'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        'catmaid.project': {
            'Meta': {'object_name': 'Project', 'db_table': "'project'"},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'public': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'stacks': ('django.db.models.fields.related.ManyToManyField', [], {'to': "orm['catmaid.Stack']", 'through': "orm['catmaid.ProjectStack']", 'symmetrical': 'False'}),
            'title': ('django.db.models.fields.TextField', [], {}),
            'wiki_base_url': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'})
        },
        'catmaid.projectstack': {
            'Meta': {'object_name': 'ProjectStack', 'db_table': "'project_stack'"},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'translation': ('catmaid.fields.Double3DField', [], {'default': '(0, 0, 0)'})
        },
        'catmaid.relation': {
            'Meta': {'object_name': 'Relation', 'db_table': "'relation'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'description': ('django.db.models.fields.TextField', [], {}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'isreciprocal': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation_name': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'uri': ('django.db.models.fields.TextField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.relationinstance': {
            'Meta': {'object_name': 'RelationInstance', 'db_table': "'relation_instance'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.settings': {
            'Meta': {'object_name': 'Settings', 'db_table': "'settings'"},
            'key': ('django.db.models.fields.TextField', [], {'primary_key': 'True'}),
            'value': ('django.db.models.fields.TextField', [], {'null': 'True'})
        },
        'catmaid.skeletonlistdashboard': {
            'Meta': {'object_name': 'SkeletonlistDashboard', 'db_table': "'skeletonlist_dashboard'"},
            'description': ('django.db.models.fields.TextField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'shortname': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'skeleton_list': ('catmaid.fields.IntegerArrayField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.stack': {
            'Meta': {'object_name': 'Stack', 'db_table': "'stack'"},
            'comment': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            'dimension': ('catmaid.fields.Integer3DField', [], {}),
            'file_extension': ('django.db.models.fields.TextField', [], {'default': "'jpg'", 'blank': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'image_base': ('django.db.models.fields.TextField', [], {}),
            'metadata': ('django.db.models.fields.TextField', [], {'default': "''", 'blank': 'True'}),
            'num_zoom_levels': ('django.db.models.fields.IntegerField', [], {'default': '-1'}),
            'resolution': ('catmaid.fields.Double3DField', [], {}),
            'tile_height': ('django.db.models.fields.IntegerField', [], {'default': '256'}),
            'tile_source_type': ('django.db.models.fields.IntegerField', [], {'default': '1'}),
            'tile_width': ('django.db.models.fields.IntegerField', [], {'default': '256'}),
            'title': ('django.db.models.fields.TextField', [], {}),
            'trakem2_project': ('django.db.models.fields.BooleanField', [], {'default': 'False'})
        },
        'catmaid.textlabel': {
            'Meta': {'object_name': 'Textlabel', 'db_table': "'textlabel'"},
            'colour': ('catmaid.fields.RGBAField', [], {'default': '(1, 0.5, 0, 1)'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'deleted': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'font_name': ('django.db.models.fields.TextField', [], {'null': 'True'}),
            'font_size': ('django.db.models.fields.FloatField', [], {'default': '32'}),
            'font_style': ('django.db.models.fields.TextField', [], {'null': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'scaling': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'text': ('django.db.models.fields.TextField', [], {'default': "'Edit this text ...'"}),
            'type': ('django.db.models.fields.CharField', [], {'max_length': '32'})
        },
        'catmaid.textlabellocation': {
            'Meta': {'object_name': 'TextlabelLocation', 'db_table': "'textlabel_location'"},
            'deleted': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'textlabel': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Textlabel']"})
        },
        'catmaid.treenode': {
            'Meta': {'object_name': 'Treenode', 'db_table': "'treenode'"},
            'confidence': ('django.db.models.fields.IntegerField', [], {'default': '5'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'editor': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'treenode_editor'", 'db_column': "'editor_id'", 'to': "orm['auth.User']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'parent': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'children'", 'null': 'True', 'to': "orm['catmaid.Treenode']"}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'radius': ('django.db.models.fields.FloatField', [], {}),
            'review_time': ('django.db.models.fields.DateTimeField', [], {}),
            'reviewer_id': ('django.db.models.fields.IntegerField', [], {'default': '-1'}),
            'skeleton': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.treenodeclassinstance': {
            'Meta': {'object_name': 'TreenodeClassInstance', 'db_table': "'treenode_class_instance'"},
            'class_instance': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'treenode': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Treenode']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.treenodeconnector': {
            'Meta': {'object_name': 'TreenodeConnector', 'db_table': "'treenode_connector'"},
            'confidence': ('django.db.models.fields.IntegerField', [], {'default': '5'}),
            'connector': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Connector']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'skeleton': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']"}),
            'treenode': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Treenode']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.userprofile': {
            'Meta': {'object_name': 'UserProfile'},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'inverse_mouse_wheel': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'user': ('django.db.models.fields.related.OneToOneField', [], {'to': "orm['auth.User']", 'unique': 'True'})
        },
        'contenttypes.contenttype': {
            'Meta': {'ordering': "('name',)", 'unique_together': "(('app_label', 'model'),)", 'object_name': 'ContentType', 'db_table': "'django_content_type'"},
            'app_label': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'model': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '100'})
        },
        'taggit.tag': {
            'Meta': {'object_name': 'Tag'},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'slug': ('django.db.models.fields.SlugField', [], {'unique': 'True', 'max_length': '100'})
        },
        'taggit.taggeditem': {
            'Meta': {'object_name': 'TaggedItem'},
            'content_type': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'taggit_taggeditem_tagged_items'", 'to': "orm['contenttypes.ContentType']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'object_id': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'tag': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'taggit_taggeditem_items'", 'to': "orm['taggit.Tag']"})
        }
    }

    complete_apps = ['catmaid']
