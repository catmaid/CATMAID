#!/bin/bash

# Launch uWSGI
/opt/virtualenvs/catmaid/bin/uwsgi --ini /home/scripts/docker/uwsgi-catmaid.ini
