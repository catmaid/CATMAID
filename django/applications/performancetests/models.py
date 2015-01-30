from datetime import datetime
from django.db import models
from jsonfield import JSONField


class TestView(models.Model):
    """
    Represents a views that should be tested. It expects 'GET' or 'POST'
    as method, a URL and optionally a data dictionary.
    """
    method = models.CharField(max_length=50)
    url = models.TextField()
    data = JSONField(blank=True, default={})
    creation_time = models.DateTimeField(default=datetime.now)

    def __unicode__(self):
        return "%s %s" % (self.method, self.url)

    def as_json(self):
        return dict(
            view_id = self.id,
            view_method = self.method,
            view_data = self.data,
            view_creation_time = self.creation_time,
        )


class TestResult(models.Model):
    """
    Represents the result of test of the given view. It expects a time and a
    result.
    """
    view = models.ForeignKey(TestView)
    time = models.FloatField()
    result_code = models.IntegerField()
    result = models.TextField()
    creation_time = models.DateTimeField(default=datetime.now)
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
            creation_time = self.creation_time,
            version = self.version,
        )
