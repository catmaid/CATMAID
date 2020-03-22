#!/bin/bash

# Launch uWSGI
exec /opt/virtualenvs/catmaid/bin/uwsgi --ini /home/scripts/docker/uwsgi-catmaid.ini
