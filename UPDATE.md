Some CATMAID versions require manual changes to an existing setup. Below these
and other administration related changes are listed in order.

## Under development

- Three new OS package dependencies have been added (due to a Django framework
  upgrade), make sure they are installed:

  sudo apt-get install binutils libproj-dev gdal-bin

## 2017.12.07

- PostgreSQL 9.6 and Postgis 2.4 are now required.

- A virtualenv upgrade is required. To correctly install one updated dependency,
  the django-rest-swagger Python package has to be removed first from from the
  virtualenv, before the virtualenv is updated:

  pip uninstall django-rest-swagger
  pip install -r requirements.txt

- Requires running of: manage.py catmaid_update_project_configuration

- Tracing data is now by default transmitted in a binary form, please make
  therefore sure your web-server applies GZIP not only to the "application/json"
  content type, but also to "application/octet-stream". For Nginx this would be
  the gzip_types setting.

## 2017.04.20

- The location of the `manage.py` script changed: it moved a level up into
  `django/projects`. All other configuration files remain where they are. Make
  sure to update your `settings.py` file by replacing the line
  `from settings_base import *` with `from mysite.settings_base import *`.

## 2017.05.17

- A virtualenv upgrade is required. To correctly install one updated dependency,
  the django-rest-swagger Python package has to be removed first from from the
  virtualenv, before the virtualenv is updated:

  pip uninstall django-rest-swagger
  pip install -r requirements.txt

## 2017.07.28

- The following lines have to be removed from `settings.py`,

  import djcelery
  djcelery.setup_loader()
  INSTALLED_APPs += ("kombu.transport.django")
  BROKER_URL = 'django://'

