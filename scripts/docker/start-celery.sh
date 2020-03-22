#!/bin/bash

# Launch celery worker
cd /home/django/projects/
exec /opt/virtualenvs/catmaid/bin/celery -A mysite worker -l info --pidfile=/var/run/catmaid/celery.pid
