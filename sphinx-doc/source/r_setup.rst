.. _r-setup:

R setup for NBLAST and related tools
====================================

CATMAID can make use of R to provide support for NBLAST and NRRD export of
neurons. To talk to R, CATMAID uses the ``rpy2`` library, which is an optional
dependency. If it isn't found, CATMAID will print a warning that NBLAST support
is disabled to the log. Before ``rpy2`` can be installed, a recent version of R
needs to be installed first. The instruction below focus on Ubuntu 16.04, but
should be similar for other operating systems.

Installing a recent version of R
--------------------------------

Add the RStudio repository along with its public keys::

  sudo gpg --keyserver keyserver.ubuntu.com --recv-key E084DAB9
  sudo gpg -a --export E084DAB9 | sudo apt-key add -
  echo "deb http://cran.rstudio.com/bin/linux/ubuntu xenial/" | sudo tee -a /etc/apt/sources.list

Install R and its development packages as well as two additional dependencies
that are required to install all needed R packages::

  sudo apt-get update
  sudo apt-get install r-base r-base-dev mesa-common-dev libglu1-mesa-dev \
                       libssl-dev libssh2-1-dev libcurl4-openssl-dev cmtk

After a few moments an R version usable by ``rpy2`` should be installed and the
next steps focus on the CATMAID setup.

Installing CATMAID's R dependencies
-----------------------------------

With the ``virtualenv`` activated, install ``rpy2``::

  pip install rpy2

With recent R versions, this should succeed without problems. Next, the R
packages providing the NBLAST implementation need to be installed. It is
improtant to to make these installed R packages accessible to both the active
user and the user running the WSGI server or Celery. This can be done by
installing the libraries either system wide (``sudo -i R``) or, preferred, to
create a shared folder that can be used with R both from the command line and
from CATMAID::

  mkdir <catmaid-path>/django/projects/r_libs

The actual location doesn't matter as long as it is accessible by the current
user and by the user running CATMAID and Celery. To make R recognize this
library folder from the command line, the environment variable ``R_LIBS_USER``
needs to be set to the new folder::

  export R_LIBS_USER=<catmaid-path>/django/projects/r_libs

If R is started now, it will also use this directory in its list of library
paths. To make CATMAID aware of this as well, add the following the
``settings.py``::

  R_LIBS_USER = '<catmaid-path>/django/projects/r_libs/'
  os.environ['R_LIBS_USER'] = R_LIBS_USER

With this in place it should be enough to call the following management command
to install all needed R dependencies into the new R library folder::

  manage.py catmaid_setup_nblast_environment

If this was successful, CATMAID should now able to talk to R.

.. note::

   If a system-wide installation is used, the installation has to be done
   manually::

     $ sudo -i R  # Or just R if R_LIBS_USER is used
     > install.packages(c("doMC", "R6", "rgl", "plyr"))
     > if(!require("devtools")) install.packages("devtools")
     > devtools::install_github(c("jefferis/nat", "jefferislab/nat.nblast",
     >        "jefferis/rcatmaid"))

   If each command was successful, every user on the system should now be able to
   run CATMAID related R code.

Using NBLAST and other R based tools
------------------------------------

The front-end will provide support for NBLAST mainly through the "Neuron
Similarity" widget. Everything should work with the default configuration.

R can execute some functionality in parallel (e.g. computing NBLAST scores). The
number of parallel processes is set to one by default, but can optionally be
configured using the ``MAX_PARALLEL_ASYNC_WORKERS`` setting, e.g.::

  MAX_PARALLEL_ASYNC_WORKERS = 4

The NRRD access functions need slightly more setup at the moment. In order to
use them, a small set of additional variables need to be set in the
``settings.py`` configuration file. The complete URL of the CATMAID instance is
needed::

  CATMAID_FULL_URL = "https://example.com/catmaid/"

And if basic HTTP authentication is in use, the following needs to be set as
well::

  CATMAID_HTTP_AUTH_USER = "<http-auth-user>"
  CATMAID_HTTP_AUTH_PASS = "<http-auth-password>"

This is not ideal and likely to change in the future, but for now this is
needed.  For some operations CATMAID has R connect to itself through HTTP.
