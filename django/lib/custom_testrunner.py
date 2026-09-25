from django.conf import settings
from django.test.runner import DiscoverRunner
from pipeline.conf import settings as pipeline_settings

class TestSuiteRunner(DiscoverRunner):

    def __init__(self, *args, **kwargs):
        settings.TESTING_ENVIRONMENT = True
        super(TestSuiteRunner, self).__init__(*args, **kwargs)

    def setup_test_environment(self, **kwargs):
        '''Override staticfiles STORAGE and pipeline DEBUG.'''
        super().setup_test_environment(**kwargs)
        settings.STORAGES['staticfiles'] = 'pipeline.storage.NonPackagingPipelineStorage'
        pipeline_settings.DEBUG = True
