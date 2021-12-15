# -*- coding: utf-8 -*-

from django.contrib.postgres.fields import JSONField
from django.db import models
from django.utils import timezone


class TestView(models.Model):
    """
    Represents a views that should be tested. It expects 'GET' or 'POST'
    as method, a URL and optionally a data dictionary.
    """
    method = models.CharField(max_length=50)
    url = models.TextField()
    data = JSONField(blank=True, default=dict)
    creation_time = models.DateTimeField(default=timezone.now)

    def __unicode__(self):
        return "%s %s" % (self.method, self.url)

    def as_json(self):
        return dict(
            view_id = self.id,
            view_method = self.method,
            view_data = self.data,
            creation_time = self.creation_time.strftime('%Y-%m-%dT%H:%M:%S')
        )


class TestResult(models.Model):
    """
    Represents the result of test of the given view. It expects a time and a
    result.
    """
    view = models.ForeignKey(TestView, on_delete=models.CASCADE)
    time = models.FloatField()
    result_code = models.IntegerField()
    result = models.TextField()
    creation_time = models.DateTimeField(default=timezone.now)
    version = models.CharField(blank=True, max_length=50)

    def __unicode__(self):
        return "%s (Time: %sms Status: %s)" % (self.view, self.time, self.result_code)

    def as_json(self):
        return dict(
            result_id = self.id,
            view_id = self.view_id,
            time = self.time,
            result_code = self.result_code,
            result = self.result,
            creation_time = self.creation_time.strftime('%Y-%m-%dT%H:%M:%S'),
            version = self.version,
        )


class Event(models.Model):
    """
    An Event marks a certain point in time that could cause test results to be
    not easiliy comparable before and after it.
    """
    title = models.TextField()
    creation_time = models.DateTimeField(default=timezone.now)

    def as_json(self):
        return dict(
            title = self.title,
            creation_time = self.creation_time.strftime('%Y-%m-%dT%H:%M:%S')
        )
