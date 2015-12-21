.. _docker:

Trying CATMAID with Docker
==========================

If you want to try CATMAID before performing a :ref:`complete installation
<basic-installation>`, a Docker image is available containing a running
basic CATMAID installation. Docker is a system for distributing programs,
dependencies, and system configuration in *containers* that work like
lightweight virtual machines.

After `installing Docker <https://www.docker.com/>`_, download and run the
CATMAID image:

    docker run -p 8080:80 aschampion/catmaid

Navigate your browser to `http://localhost:8080 <http://localhost:8080>`_
and you should see the CATMAID landing page. You can log in as a superuser
with username "admin" and password "admin". The Docker image contains a few
example CATMAID projects and stacks, but you can add your own through the
`admin page <http://localhost:8080/admin>`_.

.. warning::

   Any users, projects, stacks or annotations you add to the running Docker
   container will by default be lost when you next run it. To save these
   changes, you must `commit them with docker
   <https://docs.docker.com/engine/reference/commandline/commit/>`_. However,
   this is not a best practice for using Docker, and we currently do not
   recommend the CATMAID Docker image for production use.
