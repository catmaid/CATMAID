import os
import django
import kombu
from celery import Celery
from celery.signals import setup_logging, worker_process_init
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

# Declare a general group Exchange, used for client messages
with app.pool.acquire(block=True) as connection:
    exchange = kombu.Exchange(
        name='groups',
        type='direct',
        durable=True,
        channel=connection,
    )
    exchange.declare()


@worker_process_init.connect
def fix_django_db(**kwargs):
    # This is needed because of bug #5483 in Celery is fixed and available as a
    # new release (https://github.com/celery/celery/issues/5483).
    # Calling db.close() on some DB connections will cause the inherited DB
    # conn to also get broken in the parent process so we need to remove it
    # without triggering any network IO that close() might cause.
    for c in django.db.connections.all():
        if c and c.connection:
            try:
                os.close(c.connection.fileno())
            except (AttributeError, OSError, TypeError,
                    django.db.InterfaceError):
                pass
        try:
            c.close()
        except django.db.InterfaceError:
            pass
        except django.db.DatabaseError as exc:
            str_exc = str(exc)
            if 'closed' not in str_exc and 'not connected' not in str_exc:
                raise


@app.task(bind=True)
def debug_task(self):
    print('Request: {0!r}'.format(self.request))


@setup_logging.connect
def config_loggers(*args, **kwargs):
    """This will set the logging environment for workers so that we can get
    their log output where we expect it.
    """
    from logging.config import dictConfig
    dictConfig(settings.LOGGING)


if __name__ == '__main__':
    app.start()
