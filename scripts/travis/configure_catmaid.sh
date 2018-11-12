#!/usr/bin/env bash
# Write config files
set -ev

export CATMAID_PATH=$(pwd)
cd django
cp configuration.py.example configuration.py
sed -i -e "s?^\(abs_catmaid_path = \).*?\1'$(echo $CATMAID_PATH)'?g" configuration.py
sed -i -e "s?^\(abs_virtualenv_python_library_path = \).*?\1'$(echo $VIRTUAL_ENV)'?g" configuration.py
sed -i -e "s?^\(catmaid_database_name = \).*?\1'catmaid'?g" configuration.py
sed -i -e "s?^\(catmaid_database_username = \).*?\1'postgres'?g" configuration.py
sed -i -e "s?^\(catmaid_timezone = \).*?\1'America/New_York'?g" configuration.py
sed -i -e "s?^\(catmaid_servername = \).*?\1'localhost:8000'?g" configuration.py
cat configuration.py
python create_configuration.py
sed -i -e "s?^\(ALLOWED_HOSTS = \).*?\1['*']?g" projects/mysite/settings.py
# Enable static file serving without DEBUG = True
echo "SERVE_STATIC = True" >> projects/mysite/settings.py
# TODO: Enable pipeline. Right now it doesn't seem to play well with Sauce Labs.
echo "PIPELINE['PIPELINE_ENABLED'] = False" >> projects/mysite/settings.py
# Disable cache-busting for front-end tests
echo "STATICFILES_STORAGE = 'pipeline.storage.PipelineStorage'" >> projects/mysite/settings.py
# Enable front-end tess
echo "FRONT_END_TESTS_ENABLED = True" >> projects/mysite/settings.py
# Enable Selenium GUI tests, this currently works only with non-hash file names.
echo "GUI_TESTS_ENABLED = True" >> projects/mysite/settings.py
echo "GUI_TESTS_REMOTE = True" >> projects/mysite/settings.py
# Show full front-end errors by default
echo "EXPAND_FRONTEND_ERRORS = True" >> projects/mysite/settings.py
cat projects/mysite/settings.py
