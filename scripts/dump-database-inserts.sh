#!/bin/sh

pg_dump --no-privileges --inserts --data-only --no-owner --no-tablespaces catmaid -U catmaid_user | egrep -v '^--' | egrep -v '^ *$'

