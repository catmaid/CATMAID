Some CATMAID versions require manual changes to an existing setup. Below these
and other administration related changes are listed in order.

## Under development

- Python 3.5 is not supported anymore. Use Python 3.6 or 3.7.

- Postgres 11 and PostGIS 2.5 is required. If both needs to be updated, update
  PostGIS first and run `ALTER EXTENSION postgis UPDATE;` in every database. For
  docker-compose setups this database update is performed automatically.

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
