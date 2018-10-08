.. _celery:

Installation of the Celery task queue
=====================================

Some tasks of CATMAID can be somewhat time consuming and don't fit into the
regular request-response cycle, e.g. cropping or statistics aggregation. These
tasks are run asynchronously by the task queue
`Celery <http://www.celeryproject.org/>`_. CATMAID doesn't talk directly to
Celery, but uses a so called message broker, which Celery talks to to get new
tasks. Different brokers are supported by Celery and a popular choice is
`RabbitMQ <http://www.rabbitmq.com>`_. Like most of the CATMAID server
configuration, Celery can be configured through the ``settings.py`` file.

Note that Celery or the message broker don't need to be running to run CATMAID
in general. This only prevents certain functionality (e.g. cropping) from
working. If however a message broker is around, CATMAID will accept tasks, which
will get executed once Celery is started.

Below you find information on how to setup Celery and RabbitMQ in the context of
CATMAID. Since the message broker is the part that CATMAID talks to, it is
configured first.

Prerequisites
-------------

The :ref:`basic CATMAID setup <basic-installation>` needs to be completed before
configuring Celery and RabbitMQ (or any other message broker). This should
already install Celery as a dependency.

RabbitMQ as message broker
--------------------------

It is the so called message broker that takes tasks and tells Celery to execute
them. There are several options available and we focus on RabbitMQ, which has
proven fast and reliable for our use cases and can be configured to provide
access through Django's admin interface. First, the RabbitMQ server has to be
installed::

   sudo apt-get install rabbitmq-server

This should also start the server automatically. RabbitMQ comes with a plugin
infrastructure and one particular useful plugin is one that adds support for
management commands. Based on this one is able to get information on Celery
workers through the broker from within Django's admin interface. To enable it,
call::

  sudo rabbitmq-plugins enable rabbitmq_management

If the ``rabbitmq-plugins`` binary is not available in your environment, check
the typical installation directory and run the tool from there::

  /usr/lib/rabbitmq/lib/rabbitmq-server-<RABBITMQ-VERSION>/sbin/

After enabling or disabling plugins, RabbitMQ has to be restarted::

  sudo service rabbitmq-server restart

To display a list of all available plugin and whether they are enabled, call::

  sudo rabbitmq-plugins list

This also enables a web-interface will be available on port ``15672``. The
default user and password combination is guest/guest. Of course it is advisable
to change these login credentials.

This should be all to have RabbitMQ running. Next, we need to add a user and
virtual host on the RabbmitMQ server, which adds to security and makes it easier
to run multiple isolated Celery servers with a single RabbmitMQ instance::

   sudo rabbitmqctl add_user catmaid_user catmaid_pass
   sudo rabbitmqctl add_vhost catmaid
   sudo rabbitmqctl set_permissions -p catmaid catmaid_user ".*" ".*" ".*"

Now we can configure Celery to talk to this message broker.

Celery configuration
--------------------

The configuration of celery and the message broker happens in the
``settings.py`` file. To tell Celery where to expect which broker, the
``CELERY_BROKER_URL`` is used. If the default RabbitMQ port was not changed
(5672) and together with the previously created user and virtual host, the
broker URL looks like this::

  CELERY_BROKER_URL = 'amqp://catmaid_user:catmaid_pass@localhost:5672/catmaid'

If the defaults don't work for you, you can read more about the format
`here <http://docs.celeryproject.org/en/latest/userguide/configuration.html#std:setting-broker_url>`_.

To specify how many concurrent tasks Celery should execute, you can
use the ``CELERY_WORKER_CONCURRENCY`` variable. It defaults to the number of CPU
cores, but if you would want to limit it to e.g. a single process, set::

  CELERY_WORKER_CONCURRENCY = 1

There are many more configuration options, but these two are the two central
ones in our context. You can find a list of all options along with their
description in the
`Celery documentation <http://docs.celeryproject.org/en/latest/userguide/configuration.html>`_.
Note that for CATMAID all options have to have the prefix ``CELERY_`` and have
to be upper case. Also, CATMAID currently doesn't need a result back-end.

In a production environment you'll want to run the worker in the background as a
daemon, but for testing you should be able to to start the Celery worker like
this::

    celery -A mysite worker -l info

To run Celery as a daemon, you have to integrate in your process management
system. The section discussing :ref:`Supervisord <supervisord>` for process
management includes an example on how to do this for Celery and an actual start
script for Celery is shown :ref:`below <celery-supervisord>`. Also, make sure
that this Celery daemon process has the permissions to write to the temporary
directory (``TMP_DIR``).

Message broker access from admin panel
--------------------------------------

To collect worker events, one has to start Celery workers with the ``-E`` flag,
e.g.::

    celery -A mysite worker -l info -E

All tasks will then be manageable from with Django's admin interface.

.. _sec-celery-periodic-tasks:

Periodic Tasks
--------------

The Celery infrastructure can also be used to execute tasks periodically. To do
so, both a *Celery worker* (see above) and the *Celery beat scheduler* have to
be started. The scheduler can be run like this::

  celery -A mysite beat -l info

The
`Celery documentation <http://docs.celeryproject.org/en/latest/userguide/periodic-tasks.html>`_
has to say a lot mor about this, but in general periodic tasks are taken from
the ``CELERY_BEAT_SCHEDULE`` setting. CATMAID includes two default tasks that
are configured to run every night, if enabled::

  At 23:30 Cleanup cropped image stacks
  At 23:45 Update project statistics

Like said earlier, to actually execute these tasks, both a Celery worker and a
Celery beat scheduler have to be running. If you in fact use these tasks, you
may also want to disable the automatic removal of cropped images with every
download by setting::

  # Disable automatic clean-up of the cropping tool
  CROP_AUTO_CLEAN = False

Both tasks above are defined in CATMAID's ``settings_base.py`` file. New tasks
can be added by adding new entries to the ``CELERY_BEAT_SCHEDULE`` dictionary in
the ``settings.py`` file. For instance, to print the number of available CATMAID
projects once a minute, the following could be added to ``settings.py``::

  from celery import shared_task
  from celery.schedules import crontab

  @shared_task(name='print_project_count')
  def print_project_count():
    from catmaid.models import Project
    n_projects = Project.objects.count()
    return 'Number of available projects: {}'.format(n_projects)

  CELERY_BEAT_SCHEDULE['print-project-count'] = {
    'task': 'print_project_count',
    'schedule': crontab(minute='*/1')
  }

To specify when and how often the task should be run, ``datetime.timedelta``
can be used as well . Other tasks can be defined in a similar fashion.

Besides defining the tasks themselves, the scheduler also requires write
permissions to the ``projects/mysite`` directory. By default it will create
there a file called ``celerybeat-schedule`` to keep track of task execution.
To adjust this file name and path of this file, use the ``--schedule`` option
for Celery beat.

.. _celery-supervisord:

Supervisord
^^^^^^^^^^^

Supervisord is a process management tool which makes setting up processes very
easy. This documentation talks :ref:`here <supervisord>` in detail about it. A
script that can be used with the example provided there would look like this
(``run-celery.sh`` in the example)::

  #!/bin/bash

  # Virtualenv location
  ENVDIR=/path/to/catmaid/django/env
  # Django project directory
  DJANGODIR=/path/to/catmaid/django/projects
  # Which settings file should Django use
  DJANGO_SETTINGS_MODULE=mysite.settings

  echo "Starting celery as `whoami`"

  # Activate the virtual environment
  cd $DJANGODIR
  source $ENVDIR/bin/activate
  export DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS_MODULE
  export PYTHONPATH=$DJANGODIR:$PYTHONPATH

  # Run Celery
  exec celery -A mysite worker -l info
