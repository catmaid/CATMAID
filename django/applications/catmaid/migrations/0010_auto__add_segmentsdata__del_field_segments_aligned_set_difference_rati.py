# -*- coding: utf-8 -*-
import datetime
from south.db import db
from south.v2 import SchemaMigration
from django.db import models


class Migration(SchemaMigration):

    def forwards(self, orm):
        # Adding model 'SegmentsData'
        db.create_table('catmaid_segmentsdata', (
            ('id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('segment', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['catmaid.Segments'])),
            ('center_distance', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('set_difference', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('set_difference_ratio', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('aligned_set_difference', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('aligned_set_difference_ratio', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('size', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('overlap', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('overlap_ratio', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('aligned_overlap', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('aligned_overlap_ratio', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('average_slice_distance', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('max_slice_distance', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('aligned_average_slice_distance', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('aligned_max_slice_distance', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_0', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_1', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_2', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_3', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_4', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_5', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_6', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_7', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_8', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('histogram_9', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_0', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_1', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_2', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_3', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_4', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_5', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_6', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_7', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_8', self.gf('django.db.models.fields.FloatField')(default=0.0)),
            ('normalized_histogram_9', self.gf('django.db.models.fields.FloatField')(default=0.0)),
        ))
        db.send_create_signal('catmaid', ['SegmentsData'])

        # Deleting field 'Segments.aligned_set_difference_ratio'
        db.delete_column('catmaid_segments', 'aligned_set_difference_ratio')

        # Deleting field 'Segments.max_slice_distance'
        db.delete_column('catmaid_segments', 'max_slice_distance')

        # Deleting field 'Segments.aligned_average_slice_distance'
        db.delete_column('catmaid_segments', 'aligned_average_slice_distance')

        # Deleting field 'Segments.set_difference'
        db.delete_column('catmaid_segments', 'set_difference')

        # Deleting field 'Segments.aligned_overlap_ratio'
        db.delete_column('catmaid_segments', 'aligned_overlap_ratio')

        # Deleting field 'Segments.overlap_ratio'
        db.delete_column('catmaid_segments', 'overlap_ratio')

        # Deleting field 'Segments.histogram_8'
        db.delete_column('catmaid_segments', 'histogram_8')

        # Deleting field 'Segments.histogram_9'
        db.delete_column('catmaid_segments', 'histogram_9')

        # Deleting field 'Segments.histogram_4'
        db.delete_column('catmaid_segments', 'histogram_4')

        # Deleting field 'Segments.histogram_5'
        db.delete_column('catmaid_segments', 'histogram_5')

        # Deleting field 'Segments.histogram_6'
        db.delete_column('catmaid_segments', 'histogram_6')

        # Deleting field 'Segments.histogram_7'
        db.delete_column('catmaid_segments', 'histogram_7')

        # Deleting field 'Segments.histogram_0'
        db.delete_column('catmaid_segments', 'histogram_0')

        # Deleting field 'Segments.histogram_1'
        db.delete_column('catmaid_segments', 'histogram_1')

        # Deleting field 'Segments.histogram_2'
        db.delete_column('catmaid_segments', 'histogram_2')

        # Deleting field 'Segments.histogram_3'
        db.delete_column('catmaid_segments', 'histogram_3')

        # Deleting field 'Segments.center_distance'
        db.delete_column('catmaid_segments', 'center_distance')

        # Deleting field 'Segments.average_slice_distance'
        db.delete_column('catmaid_segments', 'average_slice_distance')

        # Deleting field 'Segments.aligned_set_difference'
        db.delete_column('catmaid_segments', 'aligned_set_difference')

        # Deleting field 'Segments.normalized_histogram_3'
        db.delete_column('catmaid_segments', 'normalized_histogram_3')

        # Deleting field 'Segments.aligned_overlap'
        db.delete_column('catmaid_segments', 'aligned_overlap')

        # Deleting field 'Segments.overlap'
        db.delete_column('catmaid_segments', 'overlap')

        # Deleting field 'Segments.set_difference_ratio'
        db.delete_column('catmaid_segments', 'set_difference_ratio')

        # Deleting field 'Segments.size'
        db.delete_column('catmaid_segments', 'size')

        # Deleting field 'Segments.normalized_histogram_7'
        db.delete_column('catmaid_segments', 'normalized_histogram_7')

        # Deleting field 'Segments.normalized_histogram_6'
        db.delete_column('catmaid_segments', 'normalized_histogram_6')

        # Deleting field 'Segments.normalized_histogram_5'
        db.delete_column('catmaid_segments', 'normalized_histogram_5')

        # Deleting field 'Segments.normalized_histogram_4'
        db.delete_column('catmaid_segments', 'normalized_histogram_4')

        # Deleting field 'Segments.normalized_histogram_2'
        db.delete_column('catmaid_segments', 'normalized_histogram_2')

        # Deleting field 'Segments.normalized_histogram_1'
        db.delete_column('catmaid_segments', 'normalized_histogram_1')

        # Deleting field 'Segments.normalized_histogram_0'
        db.delete_column('catmaid_segments', 'normalized_histogram_0')

        # Deleting field 'Segments.aligned_max_slice_distance'
        db.delete_column('catmaid_segments', 'aligned_max_slice_distance')

        # Deleting field 'Segments.normalized_histogram_9'
        db.delete_column('catmaid_segments', 'normalized_histogram_9')

        # Deleting field 'Segments.normalized_histogram_8'
        db.delete_column('catmaid_segments', 'normalized_histogram_8')


    def backwards(self, orm):
        # Deleting model 'SegmentsData'
        db.delete_table('catmaid_segmentsdata')


        # User chose to not deal with backwards NULL issues for 'Segments.aligned_set_difference_ratio'
        raise RuntimeError("Cannot reverse this migration. 'Segments.aligned_set_difference_ratio' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.max_slice_distance'
        raise RuntimeError("Cannot reverse this migration. 'Segments.max_slice_distance' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.aligned_average_slice_distance'
        raise RuntimeError("Cannot reverse this migration. 'Segments.aligned_average_slice_distance' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.set_difference'
        raise RuntimeError("Cannot reverse this migration. 'Segments.set_difference' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.aligned_overlap_ratio'
        raise RuntimeError("Cannot reverse this migration. 'Segments.aligned_overlap_ratio' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.overlap_ratio'
        raise RuntimeError("Cannot reverse this migration. 'Segments.overlap_ratio' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_8'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_8' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_9'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_9' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_4'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_4' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_5'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_5' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_6'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_6' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_7'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_7' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_0'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_0' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_1'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_1' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_2'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_2' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.histogram_3'
        raise RuntimeError("Cannot reverse this migration. 'Segments.histogram_3' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.center_distance'
        raise RuntimeError("Cannot reverse this migration. 'Segments.center_distance' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.average_slice_distance'
        raise RuntimeError("Cannot reverse this migration. 'Segments.average_slice_distance' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.aligned_set_difference'
        raise RuntimeError("Cannot reverse this migration. 'Segments.aligned_set_difference' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_3'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_3' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.aligned_overlap'
        raise RuntimeError("Cannot reverse this migration. 'Segments.aligned_overlap' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.overlap'
        raise RuntimeError("Cannot reverse this migration. 'Segments.overlap' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.set_difference_ratio'
        raise RuntimeError("Cannot reverse this migration. 'Segments.set_difference_ratio' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.size'
        raise RuntimeError("Cannot reverse this migration. 'Segments.size' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_7'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_7' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_6'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_6' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_5'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_5' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_4'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_4' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_2'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_2' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_1'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_1' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_0'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_0' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.aligned_max_slice_distance'
        raise RuntimeError("Cannot reverse this migration. 'Segments.aligned_max_slice_distance' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_9'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_9' and its values cannot be restored.")

        # User chose to not deal with backwards NULL issues for 'Segments.normalized_histogram_8'
        raise RuntimeError("Cannot reverse this migration. 'Segments.normalized_histogram_8' and its values cannot be restored.")

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
        'catmaid.cardinalityrestriction': {
            'Meta': {'object_name': 'CardinalityRestriction', 'db_table': "'cardinality_restriction'"},
            'cardinality_type': ('django.db.models.fields.IntegerField', [], {}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'enabled': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'restricted_link': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassClass']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"}),
            'value': ('django.db.models.fields.IntegerField', [], {})
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
        'catmaid.constraintstosegmentmap': {
            'Meta': {'object_name': 'ConstraintsToSegmentMap'},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'origin_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'segments': ('catmaid.fields.IntegerArrayField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'target_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'})
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
            'title': ('django.db.models.fields.TextField', [], {})
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
        'catmaid.restriction': {
            'Meta': {'object_name': 'Restriction', 'db_table': "'restriction'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'enabled': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'restricted_link': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassClass']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.segmentcomment': {
            'Meta': {'object_name': 'SegmentComment'},
            'comment': ('django.db.models.fields.CharField', [], {'max_length': '1024'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'segmentvote': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.SegmentVote']"}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.segments': {
            'Meta': {'object_name': 'Segments'},
            'assembly': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']", 'null': 'True'}),
            'cost': ('django.db.models.fields.FloatField', [], {'db_index': 'True'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'direction': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'node_id': ('django.db.models.fields.CharField', [], {'max_length': '255', 'db_index': 'True'}),
            'nr_of_votes': ('django.db.models.fields.IntegerField', [], {'default': '0', 'db_index': 'True'}),
            'origin_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'origin_slice_id': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'randomforest_cost': ('django.db.models.fields.FloatField', [], {}),
            'segmentation_cost': ('django.db.models.fields.FloatField', [], {}),
            'segmentid': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'segmenttype': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'status': ('django.db.models.fields.IntegerField', [], {'default': '1', 'db_index': 'True'}),
            'target1_slice_id': ('django.db.models.fields.IntegerField', [], {'null': 'True', 'db_index': 'True'}),
            'target2_slice_id': ('django.db.models.fields.IntegerField', [], {'null': 'True', 'db_index': 'True'}),
            'target_section': ('django.db.models.fields.IntegerField', [], {'null': 'True', 'db_index': 'True'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.segmentsdata': {
            'Meta': {'object_name': 'SegmentsData'},
            'aligned_average_slice_distance': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'aligned_max_slice_distance': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'aligned_overlap': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'aligned_overlap_ratio': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'aligned_set_difference': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'aligned_set_difference_ratio': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'average_slice_distance': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'center_distance': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_0': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_1': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_2': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_3': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_4': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_5': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_6': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_7': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_8': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'histogram_9': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'max_slice_distance': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_0': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_1': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_2': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_3': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_4': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_5': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_6': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_7': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_8': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'normalized_histogram_9': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'overlap': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'overlap_ratio': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'segment': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Segments']"}),
            'set_difference': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'set_difference_ratio': ('django.db.models.fields.FloatField', [], {'default': '0.0'}),
            'size': ('django.db.models.fields.FloatField', [], {'default': '0.0'})
        },
        'catmaid.segmenttoconstraintmap': {
            'Meta': {'object_name': 'SegmentToConstraintMap'},
            'constraint': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ConstraintsToSegmentMap']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'origin_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'segment_node_id': ('django.db.models.fields.CharField', [], {'max_length': '128', 'db_index': 'True'}),
            'segmentid': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'target_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'})
        },
        'catmaid.segmentvote': {
            'Meta': {'object_name': 'SegmentVote'},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'segment': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Segments']"}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"}),
            'vote': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'})
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
        'catmaid.slicecontours': {
            'Meta': {'object_name': 'SliceContours'},
            'coordinates': ('catmaid.fields.IntegerArrayField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'length': ('django.db.models.fields.FloatField', [], {'null': 'True'}),
            'node_id': ('django.db.models.fields.CharField', [], {'max_length': '255', 'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.slicecontourshighres': {
            'Meta': {'object_name': 'SliceContoursHighres'},
            'coordinates': ('catmaid.fields.IntegerArrayField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'length': ('django.db.models.fields.FloatField', [], {'null': 'True'}),
            'node_id': ('django.db.models.fields.CharField', [], {'max_length': '255', 'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.slices': {
            'Meta': {'object_name': 'Slices'},
            'assembly': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']", 'null': 'True'}),
            'center_x': ('django.db.models.fields.FloatField', [], {'db_index': 'True'}),
            'center_y': ('django.db.models.fields.FloatField', [], {'db_index': 'True'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'flag_left': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'flag_right': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'max_x': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'max_y': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'min_x': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'min_y': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'node_id': ('django.db.models.fields.CharField', [], {'max_length': '255', 'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'sectionindex': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'size': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'slice_id': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'status': ('django.db.models.fields.IntegerField', [], {'default': '1', 'db_index': 'True'}),
            'threshold': ('django.db.models.fields.FloatField', [], {}),
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
        'catmaid.stacksliceinfo': {
            'Meta': {'object_name': 'StackSliceInfo'},
            'file_extension': ('django.db.models.fields.TextField', [], {'null': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'slice_base_path': ('django.db.models.fields.TextField', [], {}),
            'slice_base_url': ('django.db.models.fields.TextField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"})
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
            'country': ('django_countries.fields.CountryField', [], {'default': "'US'", 'max_length': '2'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'inverse_mouse_wheel': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_cropping_tool': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'show_ontology_tool': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'show_segmentation_tool': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'show_tagging_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_text_label_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_tracing_tool': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
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