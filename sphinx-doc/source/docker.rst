.. _docker:

Trying CATMAID with Docker
==========================

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

  sudo sh -c "curl -L https://github.com/docker/compose/releases/download/1.15.0/docker-compose-`uname -s`-`uname -m` > /usr/local/bin/docker-compose"
  sudo chmod +x /usr/local/bin/docker-compose
  sudo sh -c "curl -L https://raw.githubusercontent.com/docker/compose/1.8.0/contrib/completion/bash/docker-compose > /etc/bash_completion.d/docker-compose"

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
  docker exec -i -t catmaid-docker_db_1 /bin/bash -c "${PG_STOP_CMD}"
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
