Developer setup with Vagrant
============================

CATMAID has a lot of dependencies and is only supported on Ubuntu.
To ease the setup for developers, CATMAID has a Vagrant configuration, which allows you to develop inside a virtual ("guest") machine.

Unlike docker, data will be persisted between restarts, and you can interact with the container over SSH.

The repository directory is mounted into the container so all changes are reflected on both the host and the guest machine.

Quickstart (linux)
------------------

* Install VirtualBox and vagrant
* Make a fresh clone of the CATMAID repository and ``cd`` into it
* ``vagrant up``
* ``vagrant ssh``, then once inside
    * Go to code directory: ``cd /CATMAID``
    * Finish setup: ``scripts/vagrant/optional.sh``
    * Start the dev server: ``django/projects/manage.py runserver [::]:8888``
* Develop, inside or outside the container!

Vagrant
-------

`Vagrant <https://www.vagrantup.com/intro/index.html>`_ is an easy-to-configure abstraction layer over a number of virtual machine providers (e.g. VirtualBox, VMWare, Hyper-V) implemented in ruby 2.6.
Once installed, you need only ``vagrant up`` inside the repository to create a fully-fledged Ubuntu VM with PostgreSQL running, fully populated Python and Node environments, and a base R environment.

`Install vagrant <https://www.vagrantup.com/docs/installation/>`_ and the `VirtualBox <https://www.virtualbox.org/manual/UserManual.html#installation>`_ VM provider.
You may need to enable virtualization in the BIOS.
Note also that VirtualBox `may not be compatible with Docker under windows <https://docs.docker.com/docker-for-windows/install/#system-requirements>`_.

.. glossary::

    ``vagrant up``
        Start up the container.
        If the image (box) doesn't exist, it will be downloaded.
        If the container doesn't exist, it will be provisioned (i.e. dependencies will be installed).

    ``vagrant ssh``
        SSH into a running container.

    ``vagrant ssh-config``
        Print out configuration for SSHing into the container with the regular `ssh` command (see below).

    ``vagrant suspend``
        Hibernate the container, saving its current state.

    ``vagrant halt``
        Switch off the container, as if it were a physical computer being shut down.

    ``vagrant destroy``
        Delete the container.

Tools like VScode need to be able to SSH into the container themselves.
They get their configuration from your user's SSH configuration (``~/.ssh/config`` on Linux).
Copy and paste the output of ``vagrant ssh-config`` (ignoring any warnings from ruby gems) into this file.
The hostname of the container will be ``catmaid-vm``.

.. warning::

   ``suspend`` or ``halt`` the container before shutting down the host!

Snapshots
^^^^^^^^^

You can save the state of a running VM and restore it later.
This is helpful if you install additional tools or data into your VM, and is quicker to load than a full re-provision.

.. glossary::

    ``vagrant snapshot save <name>``
        Save the VM's current state with the given name.

    ``vagrant snapshot list``
        Show the available snapshots.

    ``vagrant snapshot restore <name>``
        Restore the named snapshot.

Note that destroying a VM also destroys all snapshots of it.

More information is available in the `vagrant documentation <https://www.vagrantup.com/docs/cli/snapshot.html>`_.

Setup
-----

The first time the VM is started, it is "provisioned" - i.e. CATMAID's dependencies are installed.
Subsequent startups will be much faster.

Some red messages during provisioning are expected: every line prepended with a ``+`` is just showing what command is being run.

This provisioning gets you up to step 3 in the basic installation instructions (setting up the OS-level dependencies and python environment).
The database and CATMAID configuration are done separately, in case you prefer your own configuration to the recommendations in the installation instructions.

To finish off the installation according to the instructions, SSH into the VM and ``bash /CATMAID/scripts/vagrant/optional.sh``.
If the ``DB_NAME``, ``DB_USER``, ``DB_PASSWORD``, or ``TIMEZONE`` environment variables are set, they will override the defaults (when the machine is provisioned, the host's timezone will be added to ``~/timezone``, which is used as the default timezone here).
This creates your local settings, applies database migrations, collects static files as symlinks, creates a CATMAID superuser (you will need to input your the username, email, and password), and inserts example projects (N.B. the data for these projects is probably not accessible).

Virtual machine layout
----------------------

The container runs Ubuntu Linux 18.04.
In Linux, ``/`` is the root directory, and ``~`` is the home directory of the user (called ``vagrant`` in the container).

* The CATMAID repository is in ``/CATMAID``. This is the exact same directory as lives on the host.
* The Node environment is stored in ``~/catmaid-npm-overlay/node_modules``, and overlaid onto ``/CATMAID/node_modules``. This prevents it interfering with the host's node environment and vice versa.
* The Python environment is stored in ``~/catmaid-env``, and is automatically activated when you SSH in.
* R packages are in ``~/R``
* Data is written to ``~/data``

Some guest ports are forwarded to the host machine so that you can access the database, test with the dev server, and look at the generated sphinx docs.

+-------------------+------------+-----------+---------------------------------------------------+
| Service           | Guest port | Host port | Notes                                             |
+===================+============+===========+===================================================+
| PostgreSQL        | 5555       | 5555      | Not the default port 5432                         |
+-------------------+------------+-----------+---------------------------------------------------+
| Django dev server | 8888       | 8888      | ``django/projects/manage.py runserver [::]:8888`` |
+-------------------+------------+-----------+---------------------------------------------------+
| Docs server       | 8889       | 8889      | ``cd sphinx-doc && make serve``                   |
+-------------------+------------+-----------+---------------------------------------------------+

If `optional.sh` was used to configure the VM, and no parameters were given without:

* The CATMAID database is called "catmaid".
* The database user is called "catmaid_user".
* The database user passwrod is "p4ssw0rd".
* The CATMAID time zone is the same as the host machine (but the guest machine is UTC).

Development
-----------

Because the development server will technically be accessed from outside of the machine it's running on, you will need to start it with ``django/projects/manage.py [::]:8888``

From inside the container, connect to the database with ``psql -U catmaid_user catmaid``.
From the host, add the options ``-h localhost -p 5555``.

VSCode's `Remote - SSH <https://code.visualstudio.com/docs/remote/ssh>`_ extension allows you to develop in the container directly.
The connection details are picked up from your ``~/.ssh/config`` file.

PyCharm Professional has `support for remote interpreters <https://www.jetbrains.com/help/pycharm/configuring-remote-interpreters-via-ssh.html#>`_ built in.

You can also install your own development toolchain inside the container - it's just ubuntu!
Alternatively, you can make your edits using the host machine, and just use the VM to test, lint, run the database, etc.

Making commits
--------------

By default, the git user is not globally configured inside the VM, and cannot make commits.
You have a few options:

* Interact with git only from the host machine
* Configure git globally inside the VM
* Configure your user locally in the repository (allowing its use from either the host or the guest)
