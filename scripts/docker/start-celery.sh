#!/bin/bash

# Launch celery worker
cd /home/django/projects/
exec /home/env/bin/celery -A mysite worker -l info --pidfile=/var/run/catmaid/celery.pid
