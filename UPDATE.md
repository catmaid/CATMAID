Some CATMAID versions require manual changes to an existing setup. Below these
and other administration related changes are listed in order.

## Under development

- All \*.pyc files in the folders `django/applications/catmaid/migrations/`,
  `django/applications/performancetests/migrations/` and
  `django/applications/pgcompat/migrations/` need to be deleted.

- Should migration 0057 fail due a permission error, the Postgres extension
  "pg_trgm" has to be installed manually into the CATMAID database using a
  Postgres superuser: CREATE EXTENSION pg_trgm;

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
