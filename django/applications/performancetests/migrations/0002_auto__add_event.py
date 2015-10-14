# -*- coding: utf-8 -*-
from south.utils import datetime_utils as datetime
from south.db import db
from south.v2 import SchemaMigration
from django.db import models


class Migration(SchemaMigration):

    def forwards(self, orm):
        # Adding model 'Event'
        db.create_table(u'performancetests_event', (
            (u'id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('title', self.gf('django.db.models.fields.TextField')()),
            ('creation_time', self.gf('django.db.models.fields.DateTimeField')(default=datetime.datetime.now)),
        ))
        db.send_create_signal(u'performancetests', ['Event'])


    def backwards(self, orm):
        # Deleting model 'Event'
        db.delete_table(u'performancetests_event')


    models = {
        u'performancetests.event': {
            'Meta': {'object_name': 'Event'},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        u'performancetests.testresult': {
            'Meta': {'object_name': 'TestResult'},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'result': ('django.db.models.fields.TextField', [], {}),
            'result_code': ('django.db.models.fields.IntegerField', [], {}),
            'time': ('django.db.models.fields.FloatField', [], {}),
            'version': ('django.db.models.fields.CharField', [], {'max_length': '50', 'blank': 'True'}),
            'view': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['performancetests.TestView']"})
        },
        u'performancetests.testview': {
            'Meta': {'object_name': 'TestView'},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'data': ('jsonfield.fields.JSONField', [], {'default': '{}', 'blank': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'method': ('django.db.models.fields.CharField', [], {'max_length': '50'}),
            'url': ('django.db.models.fields.TextField', [], {})
        }
    }

    complete_apps = ['performancetests']