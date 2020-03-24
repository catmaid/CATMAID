Some CATMAID versions require manual changes to an existing setup. Below these
and other administration related changes are listed in order.

## Under development

- The version requires PostgreSQL 12. If you also want to upgrade PostGIS,
  update PostGIS firstand run ``ALTER EXTENSION postgis UPDATE;`` in every
  existing database in the cluster that should be upgraded. For docker-compose
  setups this database update is performed automatically if `DB_UPDATE=true` is
  set for the `db` container (watch the Docker output). CATMAID's documentation
  Docker has more information. If a replication setup is in use, the database
  configuration changes for Postgres 12. CATMAID's replication documentation
  explains what needs to be done.

- If R extensions are used, make sure to use R 3.6. On Ubuntu this can be made
  available by first installing the official R PPA repository:

  sudo gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-key E084DAB9
  sudo gpg -a --export E084DAB9 | sudo apt-key add -
  echo "deb https://cloud.r-project.org/bin/linux/ubuntu xenial-cran35/" | sudo tee -a /etc/apt/sources.list

  And second update the package index and update the local R setup:

  sudo apt-get update
  sudo apt-get install r-base r-base-dev mesa-common-dev libglu1-mesa-dev \
                     libssl-dev libssh2-1-dev libcurl4-openssl-dev cmtk

  This also requires updating all installed R packages. In all likelihood this
  requires executing "manage.py catmaid_setup_nblast_environment".

## 2020.02.15

- Python 3.5 is not supported anymore. Use Python 3.6, 3.7 or 3.8.

- Postgres 11 and PostGIS 2.5 is required, Postgres 12 and PostGIS 3 is
  recommended. If Postgres needs to be updated, update directly to Postgres 12.
  If both needs to be updated, update PostGIS first and run ``ALTER EXTENSION
  postgis UPDATE;`` in every database. For docker-compose setups this database
  update is performed automatically. If a replication setup is in use, the
  database configuration changes for Postgres 12. CATMAID's replication
  documentation explains what needs to be done.

- The next version of CATMAID will require Postgres 12 and PostGIS 3.

- A virtualenv update is required. Before you start it, please remove some
  packages that are not needed anymore first:

  pip uninstall asgi-ipc asgi-rabbitmq

- If ASGI was set up before, make sure to install channels_rabbitmq or
  channels_redis (depending on what yous use). The older asgi_rabbitmq and
  asgi_redis packages aren't supported anymore. This also requires an update of
  the CHANNELS_LAYERS in settings.py. The channels_rabbitmq documentation for an
  example: https://github.com/CJWorkbench/channels_rabbitmq/. This variable
  isn't defined by default anymore. Therefore you likely have to replace any
  `CHANNELS_LAYERS[…] = …` with something like `CHANNELS_LAYERS = { … }`. The
  new format is (use custom credentials on any production system!):

  ```
  CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_rabbitmq.core.RabbitmqChannelLayer",
        "CONFIG": {
            "host": "amqp://guest:guest@127.0.0.1/asgi",
        },
    },
  }
  ```

  Also, if supervisord is in use to manage CATMAID process groups, the main
  Daphne process needs an adjustment: instead of calling `daphne` with the
  `mysite.asgi:channel_layer` parameter, use `mysite.asgi:application`. A
  complete supervisord entry would then look something like this:

  ```
  [program:catmaid-daphne]
  directory = /home/catmaid/catmaid/django/projects/
  command = /home/catmaid/catmaid/django/env/bin/daphne --unix-socket=/var/run/daphne/catmaid.sock --access-log - --proxy-headers mysite.asgi:application
  user = www-data
  stdout_logfile = /var/log/daphne/catmaid-server.log
  redirect_stderr = true
  ```

  As last step, the supervisor entry for the `daphne worker` process has to be
  removed. New types of workers can be added, but are not needed in most cases.
  The channels documentation has more information on this.

  Note, it seems to be also required to upgrade RabbitMQ to the latest version.
  Using v3.8 worked, while 3.5 didn't.

- GDAL v2 or newer is now needed. If your Ubuntu version doesn't support this
  yet, there is an official PPA:

  sudo add-apt-repository ppa:ubuntugis/ppa
  sudo apt-get update

- The management command catmaid_populate_summary_tables is now known as
  catmaid_refresh_node_statistics.

- The application of migrations 88-91 and 98-99 might take a while to complete,
  because they rewrite potentially big database table (treenode_edge, treenode,
  class_instance, and more). Therefore, make also sure that there is enough
  space available at the database storage location (25% of database data
  directory should be plenty). If no replication is used, setting the following
  Postgres options can speed up the process: `wal_level = minimal`,
  `archive_mode = off` and `max_wal_senders = 0`.

  Due to this database update data consistency and correctness was improved,
  because additional foreign key relationships have been added that were missing
  before.

- Back-end errors result now in actual HTTP error status codes. Third-party
  clients need possibly some adjustments to handle API errors. In case of an
  error, status 400 is returned if an input data or parameter problem, 401 for
  permission problems and 500 otherwise.

- On startup, CATMAID will now test if the output directory is accessible as
  well as if its expected folder layout is present. If expected subfolders are
  missing, they will now be created.

## 2019.06.20

- A virtualenv update is required.

- All \*.pyc files in the folders `django/applications/catmaid/migrations/`,
  `django/applications/performancetests/migrations/` and
  `django/applications/pgcompat/migrations/` need to be deleted.

- Python 3.7 is now supported.

- Heads-up: The next CATMAID version will require Postgres 11, PostGIS 2.5 and
  Python 3.6 or 3.7.

- Should migration 0057 fail due a permission error, the Postgres extension
  "pg_trgm" has to be installed manually into the CATMAID database using a
  Postgres superuser:
  `sudo -u postgres psql -d <catmaid-db> -c 'CREATE EXTENSION pg_trgm;'`

- CATMAID's version information changes back to a plain `git describe` format.
  This results overall in a simpler setup and makes live easier for some
  third-party front-ends, because the commit counter is included again. The
  version display is now the same `git describe` format for both regular setups
  and Docker containers.

- Tile loading is clamped to (0,0) again, i.e. there are no negative tile
  coordinates anymore by default. If you need them, set the respective stack's
  `metadata` field to `{"clamp": false}`.

- To write to CATMAID through its API using an API token, users need to have
  now dedicated "API write" permission, called "Can annotate project using
  API token" in the admin UI. To restore the previous behavior (regular annotate
  permission allows API write access) the settings.py variable
  `REQUIRE_EXTRA_TOKEN_PERMISSIONS` can be set to `False`. This is done as a
  safety measure to prevent accidental changes through automation.

- If R based NBLAST is used, make sure to execute to update all dependencies:
  `manage.py catmaid_setup_nblast_environment`.

- The main documentation on catmaid.org has now a place for widget specific
  documentation as well. Only a few widgets have been updated yet, but more will
  follow.

## 2018.11.09

- Python 3 is now required for the back-end. We recommend the use of Python 3.6.

## 2018.07.19

- This is the last CATMAID version with support for Python 2.7. Starting from
  next version, only Python 3 will be supported.


## 2018.04.15

- Postgres 10+ is now required.


## 2018.02.16

- Three new OS package dependencies have been added (due to a Django framework
  upgrade), make sure they are installed:

  `sudo apt-get install binutils libproj-dev gdal-bin`

- Python 3.6 is now supported. Make sure to update your settings.py by replacing
  the line

  `COOKIE_SUFFIX = hashlib.md5(CATMAID_URL).hexdigest()`

  with the following line:

  `COOKIE_SUFFIX = hashlib.md5(CATMAID_URL.encode('utf-8')).hexdigest()`

- CATMAID extensions no longer require users to manually update their
  `INSTALLED_APPS` in `settings.py`. Remove if they are already in use.

- The `NODE_PROVIDER` settings variable (`settings.py`) is replaced with the
  `NODE_PROVIDERS` variable. The new variable takes a list of node provider names,
  which are iterated as long as no result nodes are found. Replace the former
  single string value with a list with this name as single element, e.g. if
  the current setting reads `NODE_PROVIDER = 'postgis2d'`, replace it with
  `NODE_PROVIDERS = ['postgis2d']`.


## 2017.12.07

- PostgreSQL 9.6 and Postgis 2.4 are now required.

- A `virtualenv` upgrade is required. To correctly install one updated dependency,
  the `django-rest-swagger` Python package has to be removed first from from the
  `virtualenv`, before the `virtualenv` is updated:

  ```
  pip uninstall django-rest-swagger
  pip install -r requirements.txt
  ```

- Requires running of: `manage.py catmaid_update_project_configuration`

- Tracing data is now by default transmitted in a binary form, please make
  therefore sure your web-server applies GZIP not only to the `application/json`
  content type, but also to `application/octet-stream`. For Nginx this would be
  the gzip_types setting.


## 2017.07.28

- The following lines have to be removed from `settings.py`,

  ```
  import djcelery
  djcelery.setup_loader()
  INSTALLED_APPs += ("kombu.transport.django")
  BROKER_URL = 'django://'
  ```


## 2017.05.17

- A `virtualenv` upgrade is required. To correctly install one updated dependency,
  the `django-rest-swagger` Python package has to be removed first from from the
  `virtualenv`, before the `virtualenv` is updated:

  ```
  pip uninstall django-rest-swagger
  pip install -r requirements.txt
  ```


## 2017.04.20

- The location of the `manage.py` script changed: it moved a level up into
  `django/projects`. All other configuration files remain where they are. Make
  sure to update your `settings.py` file by replacing the line
  `from settings_base import *` with `from mysite.settings_base import *`.
