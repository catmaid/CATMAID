#!/bin/bash

# Wait for PostgreSQL to start
until nc -z localhost 5432
do
  sleep 1;
done

# Wait to avoid "panic: Failed to open sql connection pq: the database system is starting up"
sleep 1

# Launch uWSGI
/usr/local/bin/uwsgi --ini /home/scripts/docker/uwsgi-catmaid.ini
