.. _docker:

Docker
======

With the help of Docker and Docker-compose it is possible to run CATMAID without
much manual setup involved. With Docker alone, CATMAID will be available as demo
locally, but no added data is persisted after a restart. With Docker-compose
however, it is possible to keep added data. In both variants, a superuser is
created by default with the username "admin" and the password "admin".

CATMAID demo with Docker
------------------------

If you want to try CATMAID before performing a :ref:`complete installation
<basic-installation>`, a Docker image is available containing a running
basic CATMAID installation. Docker is a system for distributing programs,
dependencies, and system configuration in *containers* that work like
lightweight virtual machines.

After `installing Docker <https://www.docker.com/>`_, download and run the
CATMAID image::

  docker run -p 8000:80 --name catmaid catmaid/catmaid-standalone

Navigate your browser to `http://localhost:8000 <http://localhost:8000>`_
and you should see the CATMAID landing page. You can log in as a superuser
with username "admin" and password "admin". The Docker image contains a few
example CATMAID projects and stacks, but you can add your own through the
`admin page <http://localhost:8000/admin>`_.

.. warning::

    Make sure you change the default password of the admin user.

.. warning::

   Any users, projects, stacks or annotations you add to the running Docker
   container will by default be lost when you next run it. To save these
   changes, you must `commit them with docker
   <https://docs.docker.com/engine/reference/commandline/commit/>`_. However,
   this is not a best practice for using Docker, and we currently do not
   recommend the CATMAID Docker image for production use.

Persistence with Docker compose
-------------------------------

Using *Docker-compose* is an alternative to the demo mode described above.  With
Docker-compose, the database, the webserver and CATMAID run in different
containers. The database container stores the database outside of the container
so it is kept over restarts. To run this setup, first install install
Docker-compose::

  sudo sh -c "curl -L https://github.com/docker/compose/releases/download/1.24.1/docker-compose-`uname -s`-`uname -m` > /usr/local/bin/docker-compose"
  sudo chmod +x /usr/local/bin/docker-compose
  sudo sh -c "curl -L https://raw.githubusercontent.com/docker/compose/1.24.1/contrib/completion/bash/docker-compose > /etc/bash_completion.d/docker-compose"

Next clone the ``catmaid-compose`` repo to a convenient location. Note that by
default the database will be stored in this location, too::

  git clone https://github.com/catmaid/catmaid-docker.git
  cd catmaid-docker

The database (and static files) will be saved outside of the containers in the
folder ``volumes``. This allows to optionally create a symlink with this name to
a different location for the database.

Run containers::

  docker-compose up

Navigate your browser to `http://localhost:8000 <http://localhost:8000>`_
and you should see the CATMAID landing page. You can log in as a superuser
with username "admin" and password "admin". The Docker image contains a few
example projects, which are added by default. To disable these, set
``CM_EXAMPLE_PROJECTS=false`` in the ``environment`` section of the ``app``
service (in ``docker-compose.yaml``) before starting the containers for the
first time. This is also the place where database details can be configured.

Additionally, the environment option ``CM_IMPORTED_SKELETON_FILE_MAXIMUM_SIZE``
can be used to set the maximum allowed import file size in bytes.

.. warning::

    Make sure you change the default password of the admin user.

Start on boot
^^^^^^^^^^^^^

This is easiest done with ``systemd``. Create a new service file, e.g.
``/etc/systemd/system/catmaid.service``::

    [Unit]
    Description=CATMAID
    Requires=docker.service
    After=docker.service

    [Service]
    Restart=always
    ExecStart=/usr/bin/docker-compose -f /home/catmaid/catmaid/docker-compose.yml up
    ExecStop=/usr/bin/docker-compose -f /home/catmaid/catmaid/docker-compose.yml stop

    [Install]
    WantedBy=multi-user.target

This still requires manual rebuilds during updates.

Updating docker images
-----------------------

Docker images are not updated automatically. Which images are currently
locally available can be checked with::

  docker images

Which images containers are currently running can be seen with::

  docker ps

Depending on whether a standalone docker image or a docker-compose setup is
used, updating is done slighly differently.

Standalone docker
^^^^^^^^^^^^^^^^^

If you want to persist changes from the currently running container, you can
export the database first::

  docker exec -u postgres catmaid /usr/bin/pg_dumpall --clean -U postgres > backup.pgsql

And if you want to make sure you can go back to the old version, you could
commit a new docker images with the current state::

  docker commit catmaid catmaid:old

Before updating the images, make sure to stop the containers using ``docker stop
catmaid`` (if you didn't used ``--name`` with ``docker run``, use the container
ID instead of "catmaid").

First update the CATMAID base image::

  docker pull catmaid/catmaid

Then, to update ``catmaid-standalone`` (regular Docker) use::

  docker pull catmaid/catmaid-standalone

If no previous state should be persisted, the docker container can be started
normally again::

  docker run -p 8000:80 --name catmaid catmaid/catmaid-standalone

If you however want to start the new container from a previously saved database
dump, set the ``DB_FIXTURE`` variable to ``true`` and pipe the backup file to
the ``docker run`` command::

  cat backup.pgsql | docker run -p 8000:80 -i -e DB_FIXTURE=true --name catmaid catmaid/catmaid-standalone

The database will then be initialized with the data from the ``pg_dumpall``
image in the file ``backup.pgsql``, created above. The Docker image will
automatically apply all missing database migrations.

Docker-compose
^^^^^^^^^^^^^^

Before updating the docker images, the database should be backed up. The easiest
way to do this and also be able to quickly restore in case something goes wrong,
is to perform a file based copy of the ``volumes`` folder after stopping the
database. To stop the database, call the following three commands from the
``catmaid-docker`` directory (containing the ``docker-compose.yml`` file)::

  PG_STOP_CMD='export PGCTL=$(which pg_ctl); su postgres -c "${PGCTL} stop"'
  docker exec -i -t catmaid_db_1 /bin/bash -c "${PG_STOP_CMD}"
  docker-compose stop

And then copy the complete ``volumes`` folder::

  sudo cp -r volumes volumes.backup

Next update your local copy of the ``docker-compose`` repository::

  git pull origin master

Then update your docker images::

  docker-compose pull

Finally the docker containers have to be built and started again::

  docker-compose up --build

In case a newly pulled docker image introduces a new Postgres version, CATMAID's
docker-compose start-up script will detect this and abort the container
execution with a warning. This warning says that an automatic update of the data
files can be performed, but this will only be done if ``DB_UPDATE=true`` is set
in the ``docker-compose.yml`` file. If you don't see such a warning, the update
should be successful. If you see this warning, a few additional steps are
required. First ``DB_UPDATE=true`` has to be added as environment variable of
the ``db`` app in the ``docker-compose.yml`` file. The docker-compose setup
needs then to be rebuilt and run::

  docker-compose up --build

After a successful upgrade, the ``DB_UPDATE`` variable should be set to
``false`` again, to not accidentally upgrade the data files without ensuring a
back-up has been made.

Starting docker-compose as systemd service
------------------------------------------

If placed in the ``/etc/systemd/system`` folder, the file ``catmaid.service``
could look like this and allow the container management through systemd::

  [Unit]
  Description=CATMAID
  Requires=docker.service
  After=docker.service

  [Service]
  Restart=always
  ExecStart=/usr/bin/docker-compose -f /path/to/catmaid-docker-compose/docker-compose.yml up
  ExecStop=/usr/bin/docker-compose -f /path/to/catmaid-docker-compose/docker-compose.yml stop

  [Install]
  WantedBy=multi-user.target


Notes on shared memory in Docker
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Due to the low default allowed shared memory in Docker containers (64MB), bigger
instances might run into an error similar to this::

  Traceback (most recent call last):
  […]
  psycopg2.OperationalError: could not resize shared memory segment
  "/PostgreSQL.909036009" to 70019784 bytes: No space left on device

To fix this, the allowed shared memory (which is what Postgres makes heavy use
of) can be increased. When running ``docker`` directly, add the ``--shm-size=2g``
option. If ``docker-compose`` is in use, add ``shm_size: '2gb'`` to the build
context::

  build:
    context:
       shm_size: '2gb'

For more available shared memory, increase the example of ``2gb``.

Parameterizing Docker containers
--------------------------------

Both the standalone Docker container and the docker-compose setup can be
parameterized with various options. Some of them have already been discussed
above. Generally, Docker parameters are provided as environment variables. For
the regular Docker setup this happens by adding ``-e KEY=VALUE`` parameters to
the ``docker run`` call. For ``docker-compose``, the respective entries have to
be added to the ``docker-compose.yaml`` file. The available settings can broadly
be categorized in infrastructure settings (database, webserver) and CATMAID
settings.

The following infrastructure settings are available:

.. glossary::
  ``DB_HOST``
    The dabase hostname. Default: localhost

.. glossary::
  ``DB_PORT``
    The port the database is listening on. Default: 5432

.. glossary::
  ``DB_NAME``
    The name of the CATMAID database. Default: catmaid

.. glossary::
  ``DB_USER``
    The user as who to connect to the databae. Default: catmaid_user

.. glossary::
  ``DB_PASS``
    The password of the database user. Default: catmaid_password. Please change
    this!

.. glossary::
  ``DB_CONNECTIONS``
    The maximum number of allowed database connections. Default: 50

.. glossary::
  ``DB_TUNE``
    Whether the contaienr should try to tune the database on initial startup.
    Default: true

.. glossary::
  ``DB_FORCE_TUNE``
    Whether the next start of the container should include a database tuning
    update. Default: false

.. glossary::
  ``DB_FIXTURE``
    Whether or not to expect raw SQL as input on stdin. This can be piped
    directly to the database. Assuming there is simple database dump with text
    SQL commands in the file backup.sql, the following command can be used to
    load it into the container database: ``cat backup.sql | docker run -i
    -e DB_FIXTURE=true --name catmaid catmaid/catmaid-standalone``. Default:
    false.

.. glossary::
  ``INSTANCE_MEMORY``
    The amount of memory, the docker instance should have available. This is the
    basis for tweaking some database parameters. By default, this is estimated
    automatically, but can be overridden in terms of megabtes of memory, i.e. a
    value of 4096 means 4GB.

The following CATMAID settings are available. If anything, the administration
password should be changed to something more secure (``CM_INITIAL_ADMIN_PASS``).

.. glossary::
  ``CM_INITIAL_ADMIN_USER``
    This admin user is created during initial setup. Default: admin

.. glossary::
  ``CM_INITIAL_ADMIN_PASS``
    This initial password of the admin user defined in CM_INITIAL_ADMIN_USER.
    This should be changed to something more secure!  Default: admin

.. glossary::
  ``CM_INITIAL_ADMIN_EMAIL``
    This initial email address of the admin user defined in CM_INITIAL_ADMIN_USER.
    Default: admin@localhost.local

.. glossary::
  ``CM_INITIAL_ADMIN_FIRST_NAME``
  The first name of the admin user defined in CM_INITIAL_ADMIN_USER. Default: Super

.. glossary::
  ``CM_INITIAL_ADMIN_LAST_NAME``
  The last name of the admin user defined in CM_INITIAL_ADMIN_USER. Default: User

.. glossary::
  ``CM_DEBUG``
    Whether or not to run CATMAID in debug mode. Default: false

.. glossary::
  ``CM_EXAMPLE_PROJECTS``
    Whether or not to setup example projects. Default: true

.. glossary::
  ``CM_INITIAL_PROJECTS``
    A set of project and stack definitions that the container will set up
    initiall. The expected format is JSON as it is returned by the
    ``/projects/export`` API endpoint. This can be a multiline environment
    variable, but Docker is somewhat picky about how this is provided.

    Consider the following JSON representation of a Drosophila larva L1 project,
    stored in the file ``larva-l1-project.json``::

      [{
        "project": {
          "title": "L1 CNS",
          "stacks": [{
            "title": "L1 CNS",
            "dimension": "(28128, 31840, 4841)",
            "mirrors": [{
              "fileextension": "jpg",
              "position": 3,
              "tile_source_type": 4,
              "tile_height": 512,
              "tile_width": 512,
              "title": "Example tiles",
              "url": "https://example.com/ssd-tiles/"
            }],
            "resolution": "(3.8,3.8,50)",
            "translation": "(0,0,6050)"
          }]
        }
      }]

    This can now be used in the CM_INITIAL_PROJECTS environment variable like
    this as a ``docker run`` parameter::

      -e CM_INITIAL_PROJECTS="$(cat larva-l1-project.json)"

    Alterantively, such a JSON block could be included also directly into the
    call on the command line::

      docker run … -e CM_INITIAL_PROJECTS='[{
        "project": {
          …
        }
      }]' -e …

.. glossary::
  ``CM_INITIAL_PROJECTS_IMPORT_PARAMS``
    The parameter string provided to the ``catmaid_import_projects`` management
    command by the importer to import the projects and stacks provided in
    ``CM_INITIAL_PROJECTS``. This can for instance be give the anonymous user
    read permissions on the imported data::

      CM_INITIAL_PROJECTS_IMPORT_PARAMS="--permission user:AnonymousUser:can_browse"

.. glossary::
  ``CM_IMPORTED_SKELETON_FILE_MAXIMUM_SIZE``
    The maximum allowed file size for skeletons that are imported through the API
    into the container. In Bytes.

.. glossary::
  ``CM_HOST``
    The network interface in the container, the CATMAID application server should
    be listening on.  Default: 0.0.0.0 (all interfaces).

.. glossary::
  ``CM_PORT``
    The network port in the container, the CATMAID application server should be
    listening on. Default: 8000

.. glossary::
  ``CM_FORCE_CONFIG_UPDATE``
    Whether the CATMAID configurating should be updated on container start.
    Normally, the settings are updated on initial container start. Default: false

.. glossary::
  ``CM_WRITEABLE_PATH``
    Where CATMAID can expect to be able to write data. This can be useful to make
    this folder accessible through a Docker volume. Default: "/tmp".

.. glossary::
  ``CM_NODE_LIMIT``
    The maximum number of reconstruction nodes that should be loaded by a single
    field of view query. Default: 10000

.. glossary::
  ``CM_NODE_PROVIDERS``
    How the back-end node providers should be configured. Default: "['postgis2d']

.. glossary::
  ``CM_SUBDIRECTORY``
    The subdirectory relative to the domain root that CATMAID is running in, e.g.
    "/catmaid". By default, no subdirectory is used ("").

.. glossary::
  ``CM_CSRF_TRUSTED_ORIGINS``
    Which servers to trust to bypass CSRF checks. None by default (""). The format
    is expected to be a Python like list, e.g. '["example.com"].

.. glossary::
  ``CM_CLIENT_SETTINGS``
    A JSON string representing a set of client settings that are used as default
    instance level client settings. Already defined settings take precedence. By
    default no client settings are provided ("").

    This is an example that will set the neuron name rendering to prefer a name
    set by an annotation that is meta-annotated with "Neuron name"::

      CLIENT_SETTINGS: '{"neuron-name-service": {"component_list": [{"id": "skeletonid", "name": "Skeleton ID"}, {"id": "neuronname", "name": "Neuron name"}, {"id": "all-meta", "name": "All annotations annotated with \"neuron name\"", "option": "neuron name"}]}}'

.. glossary::
  ``CM_SERVER_SETTINGS``
  A valid Python string that is added to the container's settings.py file. All
  specific settings above override these more general settings. For instance, an
  alternative way to set the node query limit and enabling the cropping tool by
  default would be::

    CM_SERVER_SETTINGS="NODE_LIST_MAXIMUM_COUNT=50000\nPROFILE_SHOW_CROPPING_TOOL=True"

.. glossary::
  ``CM_FORCE_CLIENT_SETTINGS``
    Normally, the above client settings are only used if there is none already
    defined for a user. To enforce the use of the CM_CLIENT_SETTINGS settings,
    this can be set to true. Default: false

.. glossary::
  ``CM_RUN_CELERY``
    For asynchronous tasks, CATMAID uses Celery. By default a Celery instance is
    also run inside the Docker container. Since Celery isn't neccessarily required for
    normal operation (only some operations like cropping or NBLAST won't work)
    and Celery can also be run in a spearate container, running Celery within
    the CATMAID container can be disabled by setting this to "false". By
    default, Celery is started. If Celery is enabled, an asynchronous task
    scheduler will schedule some maintenance tasks every night (e.g. cleaning up
    cropped image, updating statistics, etc.).

.. glossary::
  ``CM_CELERY_BROKER_URL``
  If Celery is not run within this Container but somewhere else, this variable
  can be used to let CATMAID know about where to find Celery.

.. glossary::
  ``CM_CELERY_WORKER_CONCURRENCY``
  By defeault Celery runs with one worker in the container. This can be adjusted
  here by setting it to a higher number.

.. glossary::
  ``CM_CELERY_TIMEZONE``
  There are a handful of maintenance tasks that are executed by CATMAID every
  night. By default this happens around midnight in UTC time. The time zone
  which is used here, can be configured with this variable. Use e.g.
  'America/New_York' for US east coast time.

.. glossary::
  ``TIMEZONE``
    The timezone this server runs in. By default CATMAID tries to guess.
    Otherwise see https://en.wikipedia.org/wiki/List_of_tz_zones_by_name.
