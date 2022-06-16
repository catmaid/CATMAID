#!/bin/bash

# Launch uWSGI
exec /home/env/bin/uwsgi --ini /home/scripts/docker/uwsgi-catmaid.ini
