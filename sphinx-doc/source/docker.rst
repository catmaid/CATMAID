.. _docker:

Trying CATMAID with Docker
==========================

With the help of Docker and Docker-compose it is possible to run CATMAID without
much manual setup involved. With Docker alone, CATMAID will be available as demo
locally, but no added data is persisted after a restart. With Docker-compose
however, it is possible to keep added data.

CATMAID demo with Docker
------------------------

If you want to try CATMAID before performing a :ref:`complete installation
<basic-installation>`, a Docker image is available containing a running
basic CATMAID installation. Docker is a system for distributing programs,
dependencies, and system configuration in *containers* that work like
lightweight virtual machines.

After `installing Docker <https://www.docker.com/>`_, download and run the
CATMAID image::

  docker run -p 8080:80 --name catmaid catmaid/catmaid-standalone

Navigate your browser to `http://localhost:8080 <http://localhost:8080>`_
and you should see the CATMAID landing page. You can log in as a superuser
with username "admin" and password "admin". The Docker image contains a few
example CATMAID projects and stacks, but you can add your own through the
`admin page <http://localhost:8080/admin>`_.

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

Navigate your browser to `http://localhost <http://localhost>`_
and you should see the CATMAID landing page. You can log in as a superuser
with username "admin" and password "admin". The Docker image contains a few
example projects, which are added by default. To disable these, set
``CM_EXAMPLE_PROJECTS=false`` in the ``environment`` section of the ``app``
service (in ``docker-compose.yaml``) before starting the containers for the
first time. This is also the place where database details can be configured.

.. warning::

    Make sure you change the default password of the admin user.

Updating docker images
-----------------------

Docker images are not updated automatically. Which images are currently
locally available can be checked with::

  docker images

Which images containers are currently running can be seen with::

  docker ps

Before updating the images, make sure to stop the containers using ``docker stop
catmaid`` (if you didn't used ``--name`` with ``docker run``, use the container
ID instead of "catmaid") or ``docker-compose down``, respectively.

First update the CATMAID base image::

  docker pull catmaid/catmaid

Then, to update ``catmaid-standalone`` (regular Docker) use::

  docker pull catmaid/catmaid-standalone

Or, to update the ``catmaid-docker`` (Docker-compose) setup use::

  docker-compose pull

Finally the docker containers have to be started again.
