Installation of the CELERY Task Queue
=====================================

Some tasks of CATMAID (e.g. cropping) are done in the background.
These are managed by the task queue Celery. The job of telling
Celery about a new task to process is done by a message broker --
different brokers are supported by Celery. By default a simple
Python module is utilized that uses the Django data base to store
messaging information. Alternatively, one may use message brokers
like RabbitMQ, which can be configured in the ``settings.py`` file.

In case Celery is not running it is no problem for Django/CATMAID.
As long as the message broker is around, CATMAID will accept tasks
(e.g a cropping job). They will get executed when Celery is running
again.

This first section guides you through the setup of Celery and the
simplest message broker provided by Kombu, it used Django's database
to store messages. Afterwards, an alternative broker, RabbitMQ, is
described.

Prerequisites
-------------

The setup of Django needs to be completed before configuring Celery.

Installation
------------

The configuration of celery and the message broker happens in the
``settings.py`` file. The example file contains a configuration that
should be ready to go. A quick run through the relevant settings
follows.

To be able to use Celery, it needs to be imported and initialized
first. This is done by this lines::

  import djcelery
  djcelery.setup_loader()

To specify how many concurrent tasks Celery should execute, you can
use the following variable::

  CELERYD_CONCURRENCY = 1

By default this is the number of CPUs available and the above line
sets it to one.

Then Celery and Django need some information about the message broker
in use. Since we here refer to kombu, the following settings
are important to get this specific broker to work::

  INSTALLED_APPS += ("kombu.transport.django",)
  BROKER_URL = 'django://'

This will make kombu use the Django database for its messages. Although,
this is fine for a small and simple setup, it is recommended to use a
different message broker for larger setups. There is more information on
the limitations of and alternatives to this approach in
`Celery's documentation <http://docs.celeryproject.org/en/latest/getting-started/brokers/django.html>`_.

To initialize Celery, call the syncdb sub-command of your ``manage.py``
(from within the virtualenv)::

    python manage.py syncdb

This will create some tables for Celery and django-kumbo in the Django
data base. You should then be able to run the Celery daemon (also from
within the virtualenv)::

    python manage.py celeryd -l info

The Celery daemon should be integrated in your system to be started
automatically. There are is a ``init`` script available in the Celery code
base that could be used here. Also, make sure that this Celery daemon
process has the permissions to write to the temporary directory
(``TMP_DIR``).

Message Brokers
---------------

It is the so called message broker who takes tasks and tells Celery to execute
them. There are several ones around and the section uses RabbitMQ as an
alternative to the simple Django based one used above. RabbitMQ is very fast
and reliable and can be configured to be manageable through Django's admin
interface.

First, the RabbitMQ server has to be installed::

   sudo apt-get install rabbitmq-server

This should start it automatically. RabbitMQ comes with a plugin infrastructure
and one particular useful plugin is one that adds support for management
commands. Based on this one is able to get information on Celery workers through
the broker from within Django's admin interface. To enable it, call:

  sudo /usr/lib/rabbitmq/lib/rabbitmq-server-3.2.3/sbin/rabbitmq-plugins enable rabbitmq_management

After enabling or disabling plugins, RabbitMQ has to be restarted::

  sudo service rabbitmq-server restart

To display a list of all available plugin and whether they are enabled, call::

  sudo /usr/lib/rabbitmq/lib/rabbitmq-server-3.2.3/sbin/rabbitmq-plugins list

This also enables a web-interface will be available on port 15672. The default
user and password combination is guest/guest.

To collect worker events, one has to start ``celeryd`` with the ``-E`` argument,
e.g.::

    python manage.py celeryd -l info -E

And to retrieve event snapshots from all workers, start ``celerycam``::

    python manage.py celerycam

All tasks will then be manageable from with Django's admin interface.

.. _sec-celery-periodic-tasks:

Periodic Tasks
--------------

The Celery infrastructure can also be used to execute tasks periodically.
For example, it might be wanted that the clean-up of cropped stacks
should take place every night. This can be realized without changing any
source code, but add very little Python code to two files. First the
``settings.py`` file needs to be extended to let Celery workers import a
tasks file::

  # Disable automatic clean-up of the cropping tool
  CROP_AUTO_CLEAN = False
  # Let Celery workers import our tasks module
  CELERY_IMPORTS = ("tasks", )

The code above also disables the automatic cleaning which is done on
every download request for a cropped stack.

Next we need to create a new file ``tasks.py`` in the folder where the
``settings.py`` file resides. The name "tasks" is used by convention, but
is in fact arbitrary. If it is changed the ``CELERY_IMPORTS`` variable
needs to be adjusted, too. This file contains the task definitions::

 from celery.schedules import crontab
 from celery.task import periodic_task

 # Define a periodic task that runs every day at midnight and noon.
 # It removes all cropped stacks that are older than 12 hours.
 from catmaid.control.cropping import cleanup as cropping_cleanup
 @periodic_task( run_every=crontab( hour="0,12" ) )
 def cleanup_cropped_stacks():
     twelve_hours = 43200 # seconds
     cropping_cleanup( twelve_hours )
     return "Cleaned cropped stacks directory"

One can also use the ``datetime.timedelta`` function to specify when and
how often the task should be run.

Despite defining such a task, the Celery process needs to be run in
so-called "beat" mode::

  python manage.py celeryd -B -l info

This mode requires that ``celeryd`` can write to the project directory.
By default it will create there a file called ``celerybeat-schedule``.
To adjust this file name and path, have a look in the Celery manual.
Again, an ``init`` script for automatic starting is available in the
Celery code base.

Celery Daemon
-------------

It is not very convenient to have Celery run manually all the time. After
all, a server reboot wouldn't bring it up again. Therefore it is desirable
to have Celery run as an automatically started as a *daemon*.

If you don't care whether Celery is automatically stated after booting, you
can run it as a daemon also from your terminal as well. Make sure you have
a folder ready where the user running Celery has permissions to write.
Here we assume that there is a folder ``run`` in which log and pid files
are created::

  python manage.py celeryd --logfile run/celeryd.log --pidfile run/celeryd.pid -l info

Or when using ``celerybeat`` as well::

  python manage.py celeryd --logfile run/celeryd.log --pidfile run/celeryd.pid -B -l info

Now this could be run in a Screen session and you can safely disconnect from
the server. However, like said before, this won't survive a server reboot.

Depending on your operating system manages the boot process, you can use
the ``init`` scripts provided in the Celery source. A detailed description
can be found in the
`Celery documentation <http://ask.github.com/celery/cookbook/daemonizing.html>`_.
In short, you need to to do the following: First, get the following file::

  https://github.com/ask/celery/blob/master/contrib/generic-init.d/celeryd

Copy it to the folder ``/etc/init.d/`` and mark it executable. Then you need
to create a default configuration file ``/etc/default/celeryd`` (taken from
the Celery documentation)::

  # Name of nodes to start, here we have a single node
  CELERYD_NODES="w1"
  # or we could have three nodes:
  #CELERYD_NODES="w1 w2 w3"

  # Where to chdir at start. (CATMAID Django project dir.)
  CELERYD_CHDIR="/path/to/CATMAID/django/projects/mysite/"

  # Python interpreter from environment. (in CATMAID Django dir)
  ENV_PYTHON="/path/to/CATMAID/django/env/bin/python"

  # How to call "manage.py celeryd_multi"
  CELERYD_MULTI="$ENV_PYTHON $CELERYD_CHDIR/manage.py celeryd_multi"

  # How to call "manage.py celeryctl"
  CELERYCTL="$ENV_PYTHON $CELERYD_CHDIR/manage.py celeryctl"

  # Extra arguments to celeryd
  CELERYD_OPTS="--time-limit=300 --concurrency=1"

  # Name of the celery config module.
  CELERY_CONFIG_MODULE="celeryconfig"

  # %n will be replaced with the nodename.
  CELERYD_LOG_FILE="/var/log/celery/%n.log"
  CELERYD_PID_FILE="/var/run/celery/%n.pid"

  # Workers should run as an unprivileged user.
  CELERYD_USER="celery"
  CELERYD_GROUP="celery"

  # Name of the projects settings module.
  export DJANGO_SETTINGS_MODULE="settings"

Please adjust the ``CELERY_CHDIR`` variable and the ``--concurrency``
parameters to your situation. Also, this configuration expects that an
unprivileged user and group with the name ``celery`` has been created.
If this hasn't been done already, you can do this as follows::

  sudo adduser --system --no-create-home --disabled-login --disabled-password --group celery 

Finally, you have to tell the system about the new ``init`` script::

  sudo update-rc.d celeryd defaults

Now you (and the system while booting up) should be able to start
celery::

 sudo service celeryd start

Note, that the ``celery`` user needs to have read and write access
to the temporary directory of CATMAID. E.g the cropping tool will
save its cropped sub-stacks there.

If you want to have periodic tasks managed by a ``celerybeat``
daemon, some steps are yet to be done. First, you need to get another
``init`` script. The Celery repository provides one as well::

  https://github.com/ask/celery/blob/master/contrib/generic-init.d/celerybeat

Again, this needs to be moved to the folder ``/etc/init.d/`` and
marked executable. Finally, tell the operating system about it::

  sudo update-rc.d celerybeat defaults

Next, append the following lines to your Celery configuration file
``/etc/default/celeryd``::

  # Where to chdir at start.
  CELERYBEAT_CHDIR="$CELERYD_CHDIR"

  # Path to celerybeat
  CELERYBEAT="$ENV_PYTHON $CELERYD_CHDIR/manage.py celerybeat"

  # Extra arguments to celerybeat
  CELERYBEAT_OPTS="--schedule=/var/run/celerybeat-schedule"

  CELERYBEAT_LOG_FILE="/var/log/celery/celerybeat.log"
  CELERYBEAT_PID_FILE="/var/run/celery/celerybeat.pid"

  # Celery beat should run as an unprivileged user
  CELERYBEAT_USER="celery"
  CELERYBEAT_GROUP="celery"

A "beating" Celery can now be started additionally::

 sudo service celerybeat start

With these settings periodic tasks get executed after a reboot
as well.

