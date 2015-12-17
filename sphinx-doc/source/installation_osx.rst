.. _installation-osx:

Basic Installation Instructions (OS X)
======================================

These instructions supplement the :ref:`basic installation instructions
<basic-installation>` to describe installing CATMAID's required
system dependencies in Mac OS X through homebrew.

Install homebrew
################

Installing the CATMAID dependencies requires that you have a compiler
and the `homebrew <brew.sh>`_ package manager installed. If these are
already installed, skip to the next section.

To set up xcode/GCC and install homebrew from terminal::

   xcode-select --install
   ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

Install system packages
#######################

Install system package dependencies through homebrew::

   brew install postgresql
   brew install postgis
   brew install python --framework
   brew install imagemagick --with-magick-plus-plus
   brew install boost-python
   brew tap homebrew/science
   brew install hdf5
   brew install libxslt
   brew install ossp-uuid

   export LIBRARY_PATH=“/usr/local/lib:$LIBRARY_PATH”

   brew tap hhatto/pgmagick
   brew install pgmagick

You may want to use a process control system to manage the PostgreSQL daemon.
See `this post
<http://www.moncefbelyamani.com/how-to-install-postgresql-on-a-mac-with-homebrew-and-lunchy/>`_
for an example setup using lunchy.

Now you can proceed with the
:ref:`regular installation instructions <basic-installation>`,
skipping the first half of step 2 involving ``apt-get``.
