Installing R and required dependencies on Ubuntu 16.04
------------------------------------------------------

Add the RStudio repository along with its public keys::

  sudo gpg --keyserver keyserver.ubuntu.com --recv-key E084DAB9
  sudo gpg -a --export E084DAB9 | sudo apt-key add -
  echo "deb http://cran.rstudio.com/bin/linux/ubuntu xenial/" | sudo tee -a /etc/apt/sources.list

Install R and its development packages as well as two additional dependencies
that are required to install all needed R packages::

  sudo apt-get update
  sudo apt-get install r-base r-base-dev mesa-common-dev libglu1-mesa-dev \
                       libssl-dev libssh2-1-dev libcurl4-openssl-dev cmtk

This could take a few minutes. There are mulltiple R packages that need to be
installed. To make them accessible to both the active user and the user running
the WSGI server or Celery. This can be done by installing the libraries system
wide (``sudo -i R``) or to create a shared folder and let the environment
variable ``R_LIBS_USER`` point to it::

  mkdir <catmaid-path>/django/projects/r_libs
  export R_LIBS_USER=<catmaid-path>/django/projects/r_rlibs

If R is now started, it will also use this directory in its list of library
paths. To make CATMAID aware of this as well, add the following the
``settings.py``::

  os.environ['R_LIBS_USER'] = '<catmaid-path>/django/projects/r_libs/'

With this setup it should be enough to call::

  manage.py catmaid_setup_nblast_environment

If a system-wide installation is used, the installation has to be done
manually::

  $ sudo -i R  # Or just R if R_LIBS_USER is used
  > install.packages(c("doMC", "R6", "rgl", "plyr"))
  > if(!require("devtools")) install.packages("devtools")
  > devtools::install_github(c("jefferis/nat", "jefferislab/nat.nblast",
  >        "jefferis/rcatmaid"))

If each command was successful, every user on the system should now be able to
run CATMAID related R code.
