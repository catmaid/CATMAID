#!/bin/sh

pg_dump --no-privileges --schema-only --no-owner --no-tablespaces catmaid -U catmaid_user | egrep -v '^--' | egrep -v '^ *$'

