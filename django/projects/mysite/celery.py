import os
from celery import Celery
from celery.signals import setup_logging
from django.conf import settings

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysite.settings')

app = Celery('mysite')

# Using a string here means the worker don't have to serialize
# the configuration object to child processes.
# - namespace='CELERY' means all celery-related configuration keys
#   should have a `CELERY_` prefix.
app.config_from_object('mysite.settings', namespace='CELERY')

# Load task modules from all registered Django app configs.
app.autodiscover_tasks()

@app.task(bind=True)
def debug_task(self):
    print('Request: {0!r}'.format(self.request))


@setup_logging.connect
def config_loggers(*args, **kwags):
    """This will set the logging environment for workers so that we can get
    their log output where we expect it.
    """
    from logging.config import dictConfig
    from django.conf import settings
    dictConfig(settings.LOGGING)


if __name__ == '__main__':
    app.start()
