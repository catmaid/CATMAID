# -*- coding: utf-8 -*-
from south.utils import datetime_utils as datetime
from south.db import db
from south.v2 import SchemaMigration
from django.db import models


class Migration(SchemaMigration):

    def forwards(self, orm):
        """ This migration will create a new representation of all location
        based tables. Currently these are location itself, treenode, connector
        and region_of_intereset. The new layout is optimized for data alignment
        and replaces the location data type with explicit X, Y and Z columns.
        Doing this saves about 26 bytes per row.
        """

        # Rename existing tables by appending "_old". This makes the auto
        # generated constraint names (like foreign keys) easier to read,
        # because it is based on the new table's names. And when the old ones
        # have been renamed, we can use the final names for the new tables.
        db.execute("ALTER TABLE location RENAME TO location_old;")
        db.execute("ALTER TABLE treenode RENAME TO treenode_old;")
        db.execute("ALTER TABLE connector RENAME TO connector_old;")
        db.execute("ALTER TABLE region_of_interest RENAME TO region_of_interest_old;")
        db.execute("ALTER SEQUENCE location_id_seq RENAME TO location_old_id_seq;")

        # Create a new primary key sequence
        db.execute("""CREATE SEQUENCE location_id_seq START WITH 1
            INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;""")

        # Set the sequence's last_value of the maxium ID in location
        db.execute("SELECT setval('location_id_seq', (SELECT MAX(id) FROM location_old));");

        # Create new tables with desired layout. Not only the ordering changes,
        # but also a NOT NULL constraint for editor_id is added.
        db.execute('''
            CREATE TABLE location (
              id bigint not null default nextval('location_id_seq'::regclass) PRIMARY KEY,
              project_id integer NOT NULL REFERENCES project (id),
              location_x real NOT NULL,
              location_y real NOT NULL,
              location_z real NOT NULL,
              editor_id integer NOT NULL REFERENCES auth_user (id),
              user_id integer NOT NULL REFERENCES auth_user (id),
              creation_time timestamp with time zone NOT NULL DEFAULT now(),
              edition_time timestamp with time zone NOT NULL DEFAULT now()
            );''')

        # Make the sequence owned by the new location table
        db.execute("ALTER SEQUENCE location_id_seq OWNED BY location.id;")

        # The treenode table also gets a new NOT NULL constraint for skeleton_id
        db.execute('''
            CREATE TABLE treenode (
              skeleton_id integer NOT NULL REFERENCES class_instance (id) ON DELETE CASCADE,
              radius real NOT NULL DEFAULT 0,
              confidence smallint NOT NULL DEFAULT 5,
              parent_id bigint
            ) INHERITS (location);''')

        db.execute('''
            CREATE TABLE connector (
              confidence smallint NOT NULL DEFAULT 5
            ) INHERITS (location);''')

        db.execute('''
            CREATE TABLE region_of_interest (
              stack_id integer NOT NULL REFERENCES stack (id),
              zoom_level integer NOT NULL,
              width real NOT NULL,
              height real NOT NULL,
              rotation_cw real NOT NULL
            ) INHERITS (location);''')

        # Move data to the new tables. First copy all rows that exist ONLY in
        # the location table (and not in tables inheriting from it).
        db.execute('''
            INSERT INTO location (
              id, project_id, location_x, location_y, location_z,
              editor_id, user_id, creation_time, edition_time
            ) SELECT
              id, project_id, (location).x, (location).y, (location).z,
              CASE WHEN editor_id IS NULL THEN user_id ELSE editor_id END,
              user_id, creation_time, edition_time
            FROM ONLY location_old;''')

        # Copy all treenodes
        db.execute('''
            INSERT INTO treenode (
              id, project_id, location_x, location_y, location_z,
              editor_id, user_id, creation_time, edition_time, skeleton_id,
              radius, confidence, parent_id
            ) SELECT
              id, project_id, (location).x, (location).y, (location).z,
              CASE WHEN editor_id IS NULL THEN user_id ELSE editor_id END,
              user_id, creation_time, edition_time, skeleton_id, radius,
              confidence, parent_id
            FROM treenode_old;''')

        # Copy all connectors
        db.execute('''
            INSERT INTO connector (
              id, project_id, location_x, location_y, location_z,
              editor_id, user_id, creation_time, edition_time, confidence
            ) SELECT
              id, project_id, (location).x, (location).y, (location).z,
              CASE WHEN editor_id IS NULL THEN user_id ELSE editor_id END,
              user_id, creation_time, edition_time, confidence
            FROM connector_old;''')

        # Copy all regions of interest
        db.execute('''
            INSERT INTO region_of_interest (
              id, project_id, location_x, location_y, location_z,
              editor_id, user_id, creation_time, edition_time, stack_id,
              zoom_level, width, height, rotation_cw
            ) SELECT
              id, project_id, (location).x, (location).y, (location).z,
              CASE WHEN editor_id IS NULL THEN user_id ELSE editor_id END,
              user_id, creation_time, edition_time, stack_id,
              zoom_level, width, height, rotation_cw
            FROM region_of_interest_old;''')


        # Drop old tables along with the constraints the refer to them (like
        # foreign key relationships).
        db.execute("DROP TABLE location_old CASCADE;")

        # Recreate all constraints foreign key relationships to new tables
        self.reestablish_constraints()

        # Recreate spatial and extra indices
        spatial_indices = [
            ('location_location_x_index', 'location', 'project_id, location_x'),
            ('location_location_y_index', 'location', 'project_id, location_y'),
            ('location_location_z_index', 'location', 'project_id, location_z'),
            ('treenode_location_x_index', 'treenode', 'project_id, location_x'),
            ('treenode_location_y_index', 'treenode', 'project_id, location_y'),
            ('treenode_location_z_index', 'treenode', 'project_id, location_z'),
            ('treenode_project_id_skeleton_id_index', 'treenode', 'project_id, skeleton_id'),
            ('treenode_project_id_user_id_index', 'treenode', 'project_id, user_id'),
        ]

        for names in spatial_indices:
            db.execute("CREATE INDEX %s ON %s (%s);" % names)

        # Recreate all other indices
        self.recreate_indices()

        # Recreate triggers
        self.recreate_triggers()

        # Create triggers that were missing before
        db.execute("CREATE TRIGGER on_edit_region_of_interest BEFORE UPDATE ON "
                   "region_of_interest FOR EACH ROW EXECUTE PROCEDURE on_edit();")


    def backwards(self, orm):
        """ The backwards migration creates the original tables and moves data
        into them.
        """

        # Rename existing tables by appending "_old". This makes the auto
        # generated constraint names (like foreign keys) easier to read,
        # because it is based on the new table's names. And when the old ones
        # have been renamed, we can use the final names for the new tables.
        db.execute("ALTER TABLE location RENAME TO location_old;")
        db.execute("ALTER TABLE treenode RENAME TO treenode_old;")
        db.execute("ALTER TABLE connector RENAME TO connector_old;")
        db.execute("ALTER TABLE region_of_interest RENAME TO region_of_interest_old;")
        db.execute("ALTER SEQUENCE location_id_seq RENAME TO location_old_id_seq;")

        # Create a new primary key sequence
        db.execute("""CREATE SEQUENCE location_id_seq START WITH 1
            INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;""")

        # Set the sequence's last_value of the maxium ID in location
        db.execute("SELECT setval('location_id_seq', (SELECT MAX(id) FROM location_old));");

        # Create new tables with desired layout. Not only the ordering changes,
        # but also a NOT NULL constraint for editor_id is added.
        db.execute('''
            CREATE TABLE location (
              id bigint not null default nextval('location_id_seq'::regclass) PRIMARY KEY,
              user_id integer NOT NULL,
              creation_time timestamp with time zone NOT NULL DEFAULT now(),
              edition_time timestamp with time zone NOT NULL DEFAULT now(),
              project_id integer NOT NULL,
              location float3d NOT NULL,
              editor_id integer REFERENCES auth_user (id)
            );''')

        # Make the sequence owned by the new location table
        db.execute("ALTER SEQUENCE location_id_seq OWNED BY location.id;")

        # The treenode table also gets a new NOT NULL constraint for skeleton_id
        db.execute('''
            CREATE TABLE treenode (
              parent_id bigint,
              radius real NOT NULL DEFAULT 0,
              confidence smallint NOT NULL DEFAULT 5,
              skeleton_id integer REFERENCES class_instance (id) ON DELETE CASCADE
            ) INHERITS (location);''')

        db.execute('''
            CREATE TABLE connector (
              confidence smallint NOT NULL DEFAULT 5
            ) INHERITS (location);''')

        db.execute('''
            CREATE TABLE region_of_interest (
              stack_id integer REFERENCES stack (id),
              zoom_level integer NOT NULL,
              width real NOT NULL,
              height real NOT NULL,
              rotation_cw real NOT NULL
            ) INHERITS (location);''')

        # Move data to the new tables. First copy all rows that exist ONLY in
        # the location table (and not in tables inheriting from it).
        db.execute('''
            INSERT INTO location (
              id, project_id, location,
              editor_id, user_id, creation_time, edition_time
            ) SELECT
              id, project_id, (location_x, location_y, location_z)::float3d,
              editor_id, user_id, creation_time, edition_time
            FROM ONLY location_old;''')

        # Copy all treenodes
        db.execute('''
            INSERT INTO treenode (
              id, project_id, location,
              editor_id, user_id, creation_time, edition_time, skeleton_id,
              radius, confidence, parent_id
            ) SELECT
              id, project_id, (location_x, location_y, location_z)::float3d,
              editor_id, user_id, creation_time, edition_time, skeleton_id,
              radius, confidence, parent_id
            FROM treenode_old;''')

        # Copy all connectors
        db.execute('''
            INSERT INTO connector (
              id, project_id, location,
              editor_id, user_id, creation_time, edition_time, confidence
            ) SELECT
              id, project_id, (location_x, location_y, location_z)::float3d,
              editor_id, user_id, creation_time, edition_time, confidence
            FROM connector_old;''')

        # Copy all regions of interest
        db.execute('''
            INSERT INTO region_of_interest (
              id, project_id, location,
              editor_id, user_id, creation_time, edition_time, stack_id,
              zoom_level, width, height, rotation_cw
            ) SELECT
              id, project_id, (location_x, location_y, location_z)::float3d,
              editor_id, user_id, creation_time, edition_time, stack_id,
              zoom_level, width, height, rotation_cw
            FROM region_of_interest_old;''')

        # Drop old tables along with the constraints the refer to them (like
        # foreign key relationships).
        db.execute("DROP TABLE location_old CASCADE;")

        # Recreate constraints that have been removed during the forward migration
        db.execute("ALTER TABLE ONLY location ADD CONSTRAINT location_id_key UNIQUE (id);")
        db.execute("ALTER TABLE ONLY treenode ADD CONSTRAINT treenode_id_key UNIQUE (id);")
        db.execute("ALTER TABLE ONLY connector ADD CONSTRAINT connector_id_key UNIQUE (id);")
        db.execute("ALTER TABLE ONLY region_of_interest "
                   "ADD CONSTRAINT region_of_interest_pkey PRIMARY KEY (id);")

        # Recreate all constraints foreign key relationships to new tables
        self.reestablish_constraints()

        # Recreate spatial indices
        spatial_indices = [
            ('treenode_location_x_index', 'treenode', '((location).x)'),
            ('treenode_location_y_index', 'treenode', '((location).y)'),
            ('treenode_location_z_index', 'treenode', '((location).z)'),
            ('location_location_x_index', 'location', '((location).x)'),
            ('location_location_y_index', 'location', '((location).y)'),
            ('location_location_z_index', 'location', '((location).z)'),
            ('connector_location_x_index', 'connector', '((location).x)'),
            ('connector_location_y_index', 'connector', '((location).y)'),
            ('connector_location_z_index', 'connector', '((location).z)'),
        ]

        for names in spatial_indices:
            db.execute("CREATE INDEX %s ON %s (%s);" % names)

        # Recreate all other indices
        self.recreate_indices()

        # Recreate triggers
        self.recreate_triggers()


    def reestablish_constraints(self):
        """ Creates all constraints that are refering to the treenode table,
        the connector table or the region of interest table.
        """

        db.execute('''
            ALTER TABLE treenode ADD CONSTRAINT treenode_pkey
                PRIMARY KEY (id);''')
        db.execute('''
            ALTER TABLE treenode ADD CONSTRAINT parent_id_fkey
                FOREIGN KEY (parent_id) REFERENCES treenode (id);''')
        db.execute('''
            ALTER TABLE connector ADD CONSTRAINT connector_pkey
                PRIMARY KEY (id);''')

        required_treenode_constraints = [
            ('treenode_class_instance', 'treenode_class_instance_treenode_id_fkey'),
            ('change_request', 'change_request_treenode_id_fkey'),
            ('treenode_connector', 'treenode_connector_treenode_id_fkey'),
        ]

        # Create a foreign key constraint on treenode in every table in the
        # list required constraints.
        for names in required_treenode_constraints:
            db.execute('''ALTER TABLE %s ADD CONSTRAINT %s
                FOREIGN KEY (treenode_id) REFERENCES treenode (id)
                ON DELETE CASCADE;''' % names)

        db.execute("ALTER TABLE review ADD CONSTRAINT treenode_id_fkey "
                   "FOREIGN KEY (treenode_id) REFERENCES treenode (id) "
                   " DEFERRABLE INITIALLY DEFERRED;")

        required_connector_constraints = [
            ('treenode_connector', 'treenode_connector_connector_id_fkey', ' ON DELETE CASCADE'),
            ('connector_class_instance', 'connector_class_instance_connector_id_fkey', ' ON DELETE CASCADE'),
            ('change_request', 'change_request_connector_id_fkey', ' DEFERRABLE INITIALLY DEFERRED'),
        ]

        # Create a foreign key constraint on treenode in every table in the
        # list required constraints.
        for names in required_connector_constraints:
            db.execute('''ALTER TABLE %s ADD CONSTRAINT %s
                FOREIGN KEY (connector_id) REFERENCES connector (id)%s;''' % names)


    def recreate_indices(self):
        """  Creates all indices on the treenode table, the connector table and
        the region of interest table.
        """

        treenode_indices = [
            ('treenode_parent_id', 'parent_id'),
            ('treenode_skeleton_id_index', 'skeleton_id'),
        ]

        for names in treenode_indices:
            db.execute("CREATE INDEX %s ON treenode (%s);" % names)


    def recreate_triggers(self):
        """ Creates triggers for the location, treenode, connector and region
        of interest tables."""

        triggers = [
            ('on_edit_location', 'location'),
            ('on_edit_treenode', 'treenode'),
            ('on_edit_connector', 'connector'),
        ]

        for names in triggers:
            db.execute("CREATE TRIGGER %s BEFORE UPDATE ON %s "
                       "FOR EACH ROW EXECUTE PROCEDURE on_edit();" % names)


    models = {
        u'auth.group': {
            'Meta': {'object_name': 'Group'},
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'unique': 'True', 'max_length': '80'}),
            'permissions': ('django.db.models.fields.related.ManyToManyField', [], {'to': u"orm['auth.Permission']", 'symmetrical': 'False', 'blank': 'True'})
        },
        u'auth.permission': {
            'Meta': {'ordering': "(u'content_type__app_label', u'content_type__model', u'codename')", 'unique_together': "((u'content_type', u'codename'),)", 'object_name': 'Permission'},
            'codename': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'content_type': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['contenttypes.ContentType']"}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '50'})
        },
        u'auth.user': {
            'Meta': {'object_name': 'User'},
            'date_joined': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'email': ('django.db.models.fields.EmailField', [], {'max_length': '75', 'blank': 'True'}),
            'first_name': ('django.db.models.fields.CharField', [], {'max_length': '30', 'blank': 'True'}),
            'groups': ('django.db.models.fields.related.ManyToManyField', [], {'symmetrical': 'False', 'related_name': "u'user_set'", 'blank': 'True', 'to': u"orm['auth.Group']"}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'is_active': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'is_staff': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'is_superuser': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'last_login': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'last_name': ('django.db.models.fields.CharField', [], {'max_length': '30', 'blank': 'True'}),
            'password': ('django.db.models.fields.CharField', [], {'max_length': '128'}),
            'user_permissions': ('django.db.models.fields.related.ManyToManyField', [], {'symmetrical': 'False', 'related_name': "u'user_set'", 'blank': 'True', 'to': u"orm['auth.Permission']"}),
            'username': ('django.db.models.fields.CharField', [], {'unique': 'True', 'max_length': '30'})
        },
        u'catmaid.apikey': {
            'Meta': {'object_name': 'ApiKey'},
            'description': ('django.db.models.fields.TextField', [], {}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'key': ('django.db.models.fields.CharField', [], {'max_length': '128'})
        },
        u'catmaid.brokenslice': {
            'Meta': {'object_name': 'BrokenSlice', 'db_table': "'broken_slice'"},
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'index': ('django.db.models.fields.IntegerField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Stack']"})
        },
        u'catmaid.cardinalityrestriction': {
            'Meta': {'object_name': 'CardinalityRestriction', 'db_table': "'cardinality_restriction'"},
            'cardinality_type': ('django.db.models.fields.IntegerField', [], {}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'enabled': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'restricted_link': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.ClassClass']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"}),
            'value': ('django.db.models.fields.IntegerField', [], {})
        },
        u'catmaid.changerequest': {
            'Meta': {'object_name': 'ChangeRequest', 'db_table': "'change_request'"},
            'approve_action': ('django.db.models.fields.TextField', [], {}),
            'completion_time': ('django.db.models.fields.DateTimeField', [], {'default': 'None', 'null': 'True'}),
            'connector': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Connector']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'description': ('django.db.models.fields.TextField', [], {}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'recipient': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'change_recipient'", 'db_column': "'recipient_id'", 'to': u"orm['auth.User']"}),
            'reject_action': ('django.db.models.fields.TextField', [], {}),
            'status': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'treenode': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Treenode']"}),
            'type': ('django.db.models.fields.CharField', [], {'max_length': '32'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"}),
            'validate_action': ('django.db.models.fields.TextField', [], {})
        },
        u'catmaid.class': {
            'Meta': {'object_name': 'Class', 'db_table': "'class'"},
            'class_name': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'description': ('django.db.models.fields.TextField', [], {}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.classclass': {
            'Meta': {'object_name': 'ClassClass', 'db_table': "'class_class'"},
            'class_a': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'classes_a'", 'db_column': "'class_a'", 'to': u"orm['catmaid.Class']"}),
            'class_b': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'classes_b'", 'db_column': "'class_b'", 'to': u"orm['catmaid.Class']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.classinstance': {
            'Meta': {'object_name': 'ClassInstance', 'db_table': "'class_instance'"},
            'class_column': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Class']", 'db_column': "'class_id'"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.classinstanceclassinstance': {
            'Meta': {'object_name': 'ClassInstanceClassInstance', 'db_table': "'class_instance_class_instance'"},
            'class_instance_a': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'cici_via_a'", 'db_column': "'class_instance_a'", 'to': u"orm['catmaid.ClassInstance']"}),
            'class_instance_b': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'cici_via_b'", 'db_column': "'class_instance_b'", 'to': u"orm['catmaid.ClassInstance']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.concept': {
            'Meta': {'object_name': 'Concept', 'db_table': "'concept'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.connector': {
            'Meta': {'object_name': 'Connector', 'db_table': "'connector'"},
            'confidence': ('django.db.models.fields.IntegerField', [], {'default': '5'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'editor': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'connector_editor'", 'db_column': "'editor_id'", 'to': u"orm['auth.User']"}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.connectorclassinstance': {
            'Meta': {'object_name': 'ConnectorClassInstance', 'db_table': "'connector_class_instance'"},
            'class_instance': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.ClassInstance']"}),
            'connector': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Connector']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.dataview': {
            'Meta': {'ordering': "('position',)", 'object_name': 'DataView', 'db_table': "'data_view'"},
            'comment': ('django.db.models.fields.TextField', [], {'default': "''", 'null': 'True', 'blank': 'True'}),
            'config': ('django.db.models.fields.TextField', [], {'default': "'{}'"}),
            'data_view_type': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.DataViewType']"}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'is_default': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'position': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        u'catmaid.dataviewtype': {
            'Meta': {'object_name': 'DataViewType', 'db_table': "'data_view_type'"},
            'code_type': ('django.db.models.fields.TextField', [], {}),
            'comment': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        u'catmaid.deprecatedappliedmigrations': {
            'Meta': {'object_name': 'DeprecatedAppliedMigrations', 'db_table': "'applied_migrations'"},
            'id': ('django.db.models.fields.CharField', [], {'max_length': '32', 'primary_key': 'True'})
        },
        u'catmaid.deprecatedsession': {
            'Meta': {'object_name': 'DeprecatedSession', 'db_table': "'sessions'"},
            'data': ('django.db.models.fields.TextField', [], {'default': "''"}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'last_accessed': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'session_id': ('django.db.models.fields.CharField', [], {'max_length': '26'})
        },
        u'catmaid.location': {
            'Meta': {'object_name': 'Location', 'db_table': "'location'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'editor': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'location_editor'", 'db_column': "'editor_id'", 'to': u"orm['auth.User']"}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.log': {
            'Meta': {'object_name': 'Log', 'db_table': "'log'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'freetext': ('django.db.models.fields.TextField', [], {}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'operation_type': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.message': {
            'Meta': {'object_name': 'Message', 'db_table': "'message'"},
            'action': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'read': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'text': ('django.db.models.fields.TextField', [], {'default': "'New message'", 'null': 'True', 'blank': 'True'}),
            'time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'title': ('django.db.models.fields.TextField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.overlay': {
            'Meta': {'object_name': 'Overlay', 'db_table': "'overlay'"},
            'default_opacity': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'file_extension': ('django.db.models.fields.TextField', [], {}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'image_base': ('django.db.models.fields.TextField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Stack']"}),
            'tile_height': ('django.db.models.fields.IntegerField', [], {'default': '512'}),
            'tile_source_type': ('django.db.models.fields.IntegerField', [], {'default': '1'}),
            'tile_width': ('django.db.models.fields.IntegerField', [], {'default': '512'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        u'catmaid.project': {
            'Meta': {'object_name': 'Project', 'db_table': "'project'"},
            'comment': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'stacks': ('django.db.models.fields.related.ManyToManyField', [], {'to': u"orm['catmaid.Stack']", 'through': u"orm['catmaid.ProjectStack']", 'symmetrical': 'False'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        u'catmaid.projectstack': {
            'Meta': {'object_name': 'ProjectStack', 'db_table': "'project_stack'"},
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'orientation': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Stack']"}),
            'translation': ('catmaid.fields.Double3DField', [], {'default': '(0, 0, 0)'})
        },
        u'catmaid.regionofinterest': {
            'Meta': {'object_name': 'RegionOfInterest', 'db_table': "'region_of_interest'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'height': ('django.db.models.fields.FloatField', [], {}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'rotation_cw': ('django.db.models.fields.FloatField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Stack']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"}),
            'width': ('django.db.models.fields.FloatField', [], {}),
            'zoom_level': ('django.db.models.fields.IntegerField', [], {})
        },
        u'catmaid.regionofinterestclassinstance': {
            'Meta': {'object_name': 'RegionOfInterestClassInstance', 'db_table': "'region_of_interest_class_instance'"},
            'class_instance': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.ClassInstance']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'region_of_interest': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.RegionOfInterest']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.relation': {
            'Meta': {'object_name': 'Relation', 'db_table': "'relation'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'description': ('django.db.models.fields.TextField', [], {}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'isreciprocal': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'relation_name': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'uri': ('django.db.models.fields.TextField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.relationinstance': {
            'Meta': {'object_name': 'RelationInstance', 'db_table': "'relation_instance'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.restriction': {
            'Meta': {'object_name': 'Restriction', 'db_table': "'restriction'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'enabled': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'restricted_link': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.ClassClass']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.review': {
            'Meta': {'object_name': 'Review', 'db_table': "'review'"},
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'review_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'reviewer': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"}),
            'skeleton': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.ClassInstance']"}),
            'treenode': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Treenode']"})
        },
        u'catmaid.settings': {
            'Meta': {'object_name': 'Settings', 'db_table': "'settings'"},
            'key': ('django.db.models.fields.TextField', [], {'primary_key': 'True'}),
            'value': ('django.db.models.fields.TextField', [], {'null': 'True'})
        },
        u'catmaid.stack': {
            'Meta': {'object_name': 'Stack', 'db_table': "'stack'"},
            'comment': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            'dimension': ('catmaid.fields.Integer3DField', [], {}),
            'file_extension': ('django.db.models.fields.TextField', [], {'default': "'jpg'", 'blank': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
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
        u'catmaid.textlabel': {
            'Meta': {'object_name': 'Textlabel', 'db_table': "'textlabel'"},
            'colour': ('catmaid.fields.RGBAField', [], {'default': '(1, 0.5, 0, 1)'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'deleted': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'font_name': ('django.db.models.fields.TextField', [], {'null': 'True'}),
            'font_size': ('django.db.models.fields.FloatField', [], {'default': '32'}),
            'font_style': ('django.db.models.fields.TextField', [], {'null': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'scaling': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'text': ('django.db.models.fields.TextField', [], {'default': "'Edit this text ...'"}),
            'type': ('django.db.models.fields.CharField', [], {'max_length': '32'})
        },
        u'catmaid.textlabellocation': {
            'Meta': {'object_name': 'TextlabelLocation', 'db_table': "'textlabel_location'"},
            'deleted': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'textlabel': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Textlabel']"})
        },
        u'catmaid.treenode': {
            'Meta': {'object_name': 'Treenode', 'db_table': "'treenode'"},
            'confidence': ('django.db.models.fields.IntegerField', [], {'default': '5'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'editor': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'treenode_editor'", 'db_column': "'editor_id'", 'to': u"orm['auth.User']"}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'parent': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'children'", 'null': 'True', 'to': u"orm['catmaid.Treenode']"}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'radius': ('django.db.models.fields.FloatField', [], {}),
            'skeleton': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.ClassInstance']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.treenodeclassinstance': {
            'Meta': {'object_name': 'TreenodeClassInstance', 'db_table': "'treenode_class_instance'"},
            'class_instance': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.ClassInstance']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Relation']"}),
            'treenode': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Treenode']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.treenodeconnector': {
            'Meta': {'object_name': 'TreenodeConnector', 'db_table': "'treenode_connector'"},
            'confidence': ('django.db.models.fields.IntegerField', [], {'default': '5'}),
            'connector': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Connector']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Relation']"}),
            'skeleton': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.ClassInstance']"}),
            'treenode': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['catmaid.Treenode']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['auth.User']"})
        },
        u'catmaid.userprofile': {
            'Meta': {'object_name': 'UserProfile'},
            'color': ('catmaid.fields.RGBAField', [], {'default': '(1.0, 0.4139726044613228, 0.8365466243033605, 1)'}),
            'display_stack_reference_lines': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'independent_ontology_workspace_is_default': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'inverse_mouse_wheel': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_cropping_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_ontology_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_segmentation_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_tagging_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_text_label_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_tracing_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'user': ('django.db.models.fields.related.OneToOneField', [], {'to': u"orm['auth.User']", 'unique': 'True'})
        },
        u'contenttypes.contenttype': {
            'Meta': {'ordering': "('name',)", 'unique_together': "(('app_label', 'model'),)", 'object_name': 'ContentType', 'db_table': "'django_content_type'"},
            'app_label': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'model': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '100'})
        }
    }

    complete_apps = ['catmaid']
