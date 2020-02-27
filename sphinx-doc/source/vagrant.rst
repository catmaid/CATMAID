.. _vagrant:

Developer setup with Vagrant
============================

CATMAID has a lot of dependencies and is only supported on Ubuntu.
To ease the setup for developers, CATMAID has a Vagrant configuration, which allows you to develop inside a virtual ("guest") machine.

Unlike docker, data will be persisted between restarts, and you can interact with the container over SSH.

The repository directory is mounted into the container so all changes are reflected on both the host and the guest machine.

Vagrant
-------

`Vagrant <https://www.vagrantup.com/intro/index.html>`_ is an easy-to-configure abstraction layer over a number of virtual machine providers (e.g. VirtualBox, VMWare, Hyper-V) implemented in ruby 2.6.
Once installed, you need only ``vagrant up`` inside the repository to create a fully-fledged Ubuntu VM with PostgreSQL running, fully populated Python and Node environments, and a base R environment.

`Install vagrant <https://www.vagrantup.com/docs/installation/>`_ and a VM provider (`VirtualBox <https://www.virtualbox.org/manual/UserManual.html#installation>`_, an open source, cross platform option, is preferred).

``vagrant ssh`` will SSH into the VM.
For ease of use, paste the output of ``vagrant ssh-config`` (ignoring any warnings from ruby) to your ``~/.ssh/config`` file (changing the top line ``Host default`` to something more informative, like ``Host vagrant-catmaid``).

The VM can be hibernated with ``vagrant suspend`` or switched off with ``vagrant halt``.

.. warning::

   Suspend or halt the VM before shutting down the host!

Setup
-----

The first time the VM is started, it is "provisioned" - i.e. CATMAID's dependencies are installed.
Subsequent startups will be much faster.
This provisioning gets you up to step 3 in the basic installation instructions (setting up the OS-level dependencies and python environment).
The database and CATMAID configuration are done separately, in case you prefer your own configuration to the recommendations in the installation instructions.

To finish off the installation according to the instructions, SSH into the VM and ``bash /CATMAID/scripts/vagrant/optional.sh``.
If the ``DB_NAME``, ``DB_USER``, ``DB_PASSWORD``, or ``TIMEZONE`` environment variables are set, they will override the defaults (when the machine is provisioned, the host's timezone will be added to ``~/timezone``, which is used as the default timezone here).
This creates your local settings, applies database migrations, collects static files as symlinks, creates a CATMAID superuser (you will need to input your the username, email, and password), and inserts example projects.

.. warning::

   If you already have a ``django/projects/mysite/settings.py`` file, this script will not overwrite it, and will probably fail.

Virtual machine layout
----------------------

* The CATMAID repository is in ``/CATMAID``. This is the exact same directory as lives on the host.
* The Node environment is stored in ``/CATMAID/node_modules``. Be aware that if you have previously created an environment on the host using a different version of node, there may be clashes.
* The Python environment is stored in ``~/catmaid-env``, and is automatically activated when you SSH in.
* R packages are in ``~/R``
* Data is written to ``~/data``

The virtual machine also forwards the ports that PostgreSQL and the Django development server listen on, so that you can access them as if they were local to the host.
To avoid clashing with the host, these are forwarded to 5555 and 8888 respectively.

Development
-----------

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
