# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.conf import settings
from django.test.runner import DiscoverRunner

class TestSuiteRunner(DiscoverRunner):
    def __init__(self, *args, **kwargs):
        settings.TESTING_ENVIRONMENT = True
        super(TestSuiteRunner, self).__init__(*args, **kwargs)
