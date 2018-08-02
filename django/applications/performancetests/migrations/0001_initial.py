# -*- coding: utf-8 -*-

from django.db import models, migrations
from django.utils import timezone
import jsonfield.fields


class Migration(migrations.Migration):

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Event',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('title', models.TextField()),
                ('creation_time', models.DateTimeField(default=timezone.now)),
            ],
            options={
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='TestResult',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('time', models.FloatField()),
                ('result_code', models.IntegerField()),
                ('result', models.TextField()),
                ('creation_time', models.DateTimeField(default=timezone.now)),
                ('version', models.CharField(max_length=50, blank=True)),
            ],
            options={
            },
            bases=(models.Model,),
        ),
        migrations.CreateModel(
            name='TestView',
            fields=[
                ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
                ('method', models.CharField(max_length=50)),
                ('url', models.TextField()),
                ('data', jsonfield.fields.JSONField(default={}, blank=True)),
                ('creation_time', models.DateTimeField(default=timezone.now)),
            ],
            options={
            },
            bases=(models.Model,),
        ),
        migrations.AddField(
            model_name='testresult',
            name='view',
            field=models.ForeignKey(to='performancetests.TestView', on_delete=models.CASCADE),
            preserve_default=True,
        ),
    ]
