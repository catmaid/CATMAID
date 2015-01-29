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


class TestResult(models.Model):
    """
    Respresents the result of test of the given view. It expects a time and a
    result.
    """
    view = models.ForeignKey(TestView)
    time = models.IntegerField()
    result_code = models.IntegerField()
    result = models.TextField()
    creation_time = models.DateTimeField(default=datetime.now)
    version = models.CharField(blank=True, max_length=50)

    def __unicode__(self):
        return "%s (Time: %sms Status: %s)" % (self.view, self.time, self.result_code)
