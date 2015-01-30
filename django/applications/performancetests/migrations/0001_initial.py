# -*- coding: utf-8 -*-
from south.utils import datetime_utils as datetime
from south.db import db
from south.v2 import SchemaMigration
from django.db import models


class Migration(SchemaMigration):

    def forwards(self, orm):
        # Adding model 'TestView'
        db.create_table(u'performancetests_testview', (
            (u'id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('method', self.gf('django.db.models.fields.CharField')(max_length=50)),
            ('url', self.gf('django.db.models.fields.TextField')()),
            ('data', self.gf('jsonfield.fields.JSONField')(default={}, blank=True)),
            ('creation_time', self.gf('django.db.models.fields.DateTimeField')(default=datetime.datetime.now)),
        ))
        db.send_create_signal(u'performancetests', ['TestView'])

        # Adding model 'TestResult'
        db.create_table(u'performancetests_testresult', (
            (u'id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('view', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['performancetests.TestView'])),
            ('time', self.gf('django.db.models.fields.FloatField')()),
            ('result_code', self.gf('django.db.models.fields.IntegerField')()),
            ('result', self.gf('django.db.models.fields.TextField')()),
            ('creation_time', self.gf('django.db.models.fields.DateTimeField')(default=datetime.datetime.now)),
            ('version', self.gf('django.db.models.fields.CharField')(max_length=50, blank=True)),
        ))
        db.send_create_signal(u'performancetests', ['TestResult'])


    def backwards(self, orm):
        # Deleting model 'TestView'
        db.delete_table(u'performancetests_testview')

        # Deleting model 'TestResult'
        db.delete_table(u'performancetests_testresult')


    models = {
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