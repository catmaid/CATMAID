# -*- coding: utf-8 -*-
from south.utils import datetime_utils as datetime
from south.db import db
from south.v2 import SchemaMigration
from django.db import models


class Migration(SchemaMigration):

    def forwards(self, orm):
        # Drop old function
        db.execute('''DROP FUNCTION get_feature_paths(_parent_id bigint, _workspace_id bigint,
                    _add_non_leafs boolean, _depth int, _max_depth int);''')
        db.execute('''DROP TYPE feature_type;''')

        # Create new
        query = '''
            /* A type for storing feature links, i.e. lists of class_class
             * link information.
             */
            CREATE TYPE feature_type AS ( links integer[][] );

            /* This is th PL/PgSQL implementation of the clustering module's
             * get_feature_paths function. It yields the same results, but is
             * much faster. It takes the ID of the root class and returns all
             * paths starting there, either to a leaf or to each other node
             * (the latter happens when _add_non_leafs is true). By default
             * this method will stop at a recursion depth of 100.
             */
            CREATE OR REPLACE FUNCTION get_feature_paths(_parent_id integer, _workspace_id integer,
                    _add_non_leafs boolean, _depth int DEFAULT 0, _max_depth int DEFAULT 100)
                RETURNS SETOF feature_type AS
            $$
                DECLARE
                    is_a_rel relation.id%%TYPE;
                    link class_class%%rowtype;
                    subtype class_class%%rowtype;
                    num_is_a_links class_class.id%%TYPE;
                    feature_links integer[][];
                    add_single_link boolean;
                    child_count int;
                    child_feature_link feature_type%%rowtype;
                BEGIN
                    -- Get ID of 'is_a' relationshap
                    SELECT INTO is_a_rel r.id FROM relation r
                        WHERE relation_name='is_a' AND project_id=_workspace_id LIMIT 1;

                    -- Get all links, but exclude 'is_a' relationshaps
                    FOR link IN
                        SELECT * FROM class_class cc
                            WHERE cc.class_b = _parent_id AND cc.relation_id != is_a_rel
                    -- Check if each link is followed by an 'is_a' relationship.
                    -- If so, use the classes below this relation.
                    LOOP
                        WITH is_a_links AS (
                                SELECT cc.id FROM class_class cc
                                WHERE cc.class_b=link.class_a AND cc.relation_id=is_a_rel
                            )
                        SELECT INTO num_is_a_links COUNT(l.id) FROM is_a_links l;
                        -- Add all sub-classes instead of the root if there is
                        -- at least one.
                        IF num_is_a_links > 0 THEN
                            -- Add all sub types as feature links to result
                            FOR subtype IN
                                SELECT * FROM class_class cc
                                    WHERE cc.class_b=link.class_a AND cc.relation_id=is_a_rel
                            LOOP
                                feature_links := array_cat(feature_links, ARRAY[ARRAY[
                                    subtype.class_a, link.class_b, link.relation_id, link.class_a]]);
                            END LOOP;
                        ELSE
                            -- Add feature link information to 2d links array
                            feature_links := array_cat(feature_links, ARRAY[ARRAY[
                               link.class_a, link.class_b, link.relation_id, null]]);
                        END IF;
                    END LOOP;

                    -- Look at the featue link paths and collect children
                    -- Don't loop if there are no feature links (i.e. feature_links is NULL)
                    -- Give a group id to every path
                    FOR i IN 1..coalesce(array_length(feature_links, 1), 0)
                    LOOP
                        add_single_link := FALSE;
                        IF _depth < _max_depth THEN
                            -- Increase depth
                            _depth := _depth + 1;

                            -- Iterate and count children of current feature's class a
                            child_count := 0;
                            FOR child_feature_link IN SELECT * FROM
                                get_feature_paths(feature_links[i][1], _workspace_id,
                                    _add_non_leafs, _depth, _max_depth)
                            LOOP
                                -- Prepend each child feature to parent
                                RETURN QUERY SELECT array_cat(
                                        ARRAY[ARRAY[
                                            feature_links[i][1], feature_links[i][2],
                                            feature_links[i][3], feature_links[i][4]]],
                                        child_feature_link.links);
                                child_count := child_count + 1;
                            END LOOP;

                            -- If there is a super class, get the children in addition
                            -- to the children of the current class.
                            IF feature_links[i][4] IS DISTINCT FROM NULL THEN
                                FOR child_feature_link IN SELECT * FROM
                                    get_feature_paths(feature_links[i][4], _workspace_id,
                                        _add_non_leafs, _depth, _max_depth)
                                LOOP
                                    -- Prepend each child feature to parent
                                    RETURN QUERY SELECT array_cat(
                                            ARRAY[ARRAY[
                                                feature_links[i][1], feature_links[i][2],
                                                feature_links[i][3], feature_links[i][4]]],
                                            child_feature_link.links);
                                    child_count := child_count + 1;
                                END LOOP;
                            END IF;


                            -- Remember the path to this node as feature if a
                            -- leaf is reached or if non-leaf nodes should be
                            -- added, too.
                            IF child_count = 0 OR _add_non_leafs THEN
                                add_single_link := TRUE;
                            END IF;
                        ELSE
                            -- Add current node if we reached the maximum depth
                            -- and don't recurse any further.
                            add_single_link := TRUE;
                        END IF;

                        IF add_single_link THEN
                            -- Add single link if no more children are found/wanted
                            RETURN QUERY SELECT ARRAY[ARRAY[feature_links[i][1], feature_links[i][2], feature_links[i][3], feature_links[i][4]]];
                        END IF;
                    END LOOP;

                    RETURN;
                END
            $$
            LANGUAGE plpgsql STRICT;
        '''
        db.execute(query)

    def backwards(self, orm):
        # Drop new function
        db.execute('''DROP FUNCTION get_feature_paths(_parent_id integer, _workspace_id integer,
                    _add_non_leafs boolean, _depth int, _max_depth int);''')
        db.execute('''DROP TYPE feature_type;''')

        # Restore old
        query = '''
            /* A type for storing feature links, i.e. lists of class_class
             * link information.
             */
            CREATE TYPE feature_type AS ( links integer[][] );

            /* This is th PL/PgSQL implementation of the clustering module's
             * get_feature_paths function. It yields the same results, but is
             * much faster. It takes the ID of the root class and returns all
             * paths starting there, either to a leaf or to each other node
             * (the latter happens when _add_non_leafs is true). By default
             * this method will stop at a recursion depth of 100.
             */
            CREATE OR REPLACE FUNCTION get_feature_paths(_parent_id concept.id%TYPE,
                    _workspace_id project.id%TYPE, _add_non_leafs boolean,
                    _depth int DEFAULT 0, _max_depth int DEFAULT 100)
                RETURNS SETOF feature_type AS
            $$
                DECLARE
                    is_a_rel bigint;
                    link class_class%%rowtype;
                    subtype class_class%%rowtype;
                    num_is_a_links class_class.id%%TYPE;
                    feature_links integer[][];
                    add_single_link boolean;
                    child_count int;
                    child_feature_link feature_type%%rowtype;
                BEGIN
                    -- Get ID of 'is_a' relationshap
                    SELECT INTO is_a_rel r.id FROM relation r
                        WHERE relation_name='is_a' AND project_id=_workspace_id LIMIT 1;

                    -- Get all links, but exclude 'is_a' relationshaps
                    FOR link IN
                        SELECT * FROM class_class cc
                            WHERE cc.class_b = _parent_id AND cc.relation_id != is_a_rel
                    -- Check if each link is followed by an 'is_a' relationship.
                    -- If so, use the classes below this relation.
                    LOOP
                        WITH is_a_links AS (
                                SELECT cc.id FROM class_class cc
                                WHERE cc.class_b=link.class_a AND cc.relation_id=is_a_rel
                            )
                        SELECT INTO num_is_a_links COUNT(l.id) FROM is_a_links l;
                        -- Add all sub-classes instead of the root if there is
                        -- at least one.
                        IF num_is_a_links > 0 THEN
                            -- Add all sub types as feature links to result
                            FOR subtype IN
                                SELECT * FROM class_class cc
                                    WHERE cc.class_b=link.class_a AND cc.relation_id=is_a_rel
                            LOOP
                                feature_links := array_cat(feature_links, ARRAY[ARRAY[
                                    subtype.class_a, link.class_b, link.relation_id, link.class_a]]);
                            END LOOP;
                        ELSE
                            -- Add feature link information to 2d links array
                            feature_links := array_cat(feature_links, ARRAY[ARRAY[
                               link.class_a, link.class_b, link.relation_id, null]]);
                        END IF;
                    END LOOP;

                    -- Look at the featue link paths and collect children
                    -- Don't loop if there are no feature links (i.e. feature_links is NULL)
                    -- Give a group id to every path
                    FOR i IN 1..coalesce(array_length(feature_links, 1), 0)
                    LOOP
                        add_single_link := FALSE;
                        IF _depth < _max_depth THEN
                            -- Increase depth
                            _depth := _depth + 1;

                            -- Iterate and count children of current feature's class a
                            child_count := 0;
                            FOR child_feature_link IN SELECT * FROM
                                get_feature_paths(feature_links[i][1], _workspace_id,
                                    _add_non_leafs, _depth, _max_depth)
                            LOOP
                                -- Prepend each child feature to parent
                                RETURN QUERY SELECT array_cat(
                                        ARRAY[ARRAY[
                                            feature_links[i][1], feature_links[i][2],
                                            feature_links[i][3], feature_links[i][4]]],
                                        child_feature_link.links);
                                child_count := child_count + 1;
                            END LOOP;

                            -- If there is a super class, get the children in addition
                            -- to the children of the current class.
                            IF feature_links[i][4] IS DISTINCT FROM NULL THEN
                                FOR child_feature_link IN SELECT * FROM
                                    get_feature_paths(feature_links[i][4], _workspace_id,
                                        _add_non_leafs, _depth, _max_depth)
                                LOOP
                                    -- Prepend each child feature to parent
                                    RETURN QUERY SELECT array_cat(
                                            ARRAY[ARRAY[
                                                feature_links[i][1], feature_links[i][2],
                                                feature_links[i][3], feature_links[i][4]]],
                                            child_feature_link.links);
                                    child_count := child_count + 1;
                                END LOOP;
                            END IF;


                            -- Remember the path to this node as feature if a
                            -- leaf is reached or if non-leaf nodes should be
                            -- added, too.
                            IF child_count = 0 OR _add_non_leafs THEN
                                add_single_link := TRUE;
                            END IF;
                        ELSE
                            -- Add current node if we reached the maximum depth
                            -- and don't recurse any further.
                            add_single_link := TRUE;
                        END IF;

                        IF add_single_link THEN
                            -- Add single link if no more children are found/wanted
                            RETURN QUERY SELECT ARRAY[ARRAY[feature_links[i][1], feature_links[i][2], feature_links[i][3], feature_links[i][4]]];
                        END IF;
                    END LOOP;

                    RETURN;
                END
            $$
            LANGUAGE plpgsql STRICT;
        '''
        db.execute(query)

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
            'location_x': ('django.db.models.fields.FloatField', [], {}),
            'location_y': ('django.db.models.fields.FloatField', [], {}),
            'location_z': ('django.db.models.fields.FloatField', [], {}),
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
            'location_x': ('django.db.models.fields.FloatField', [], {}),
            'location_y': ('django.db.models.fields.FloatField', [], {}),
            'location_z': ('django.db.models.fields.FloatField', [], {}),
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
            'location_x': ('django.db.models.fields.FloatField', [], {}),
            'location_y': ('django.db.models.fields.FloatField', [], {}),
            'location_z': ('django.db.models.fields.FloatField', [], {}),
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
            'location_x': ('django.db.models.fields.FloatField', [], {}),
            'location_y': ('django.db.models.fields.FloatField', [], {}),
            'location_z': ('django.db.models.fields.FloatField', [], {}),
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
            'color': ('catmaid.fields.RGBAField', [], {'default': '(0.9604165375188393, 1.0, 0.9486654616058878, 1)'}),
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
