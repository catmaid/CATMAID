#!/bin/bash

D=$(dirname $(readlink -nf $BASH_SOURCE))

pg_dump --no-privileges --inserts --data-only --no-owner --no-tablespaces \
    catmaid -U catmaid_user | \
    egrep -v '^--' | \
    egrep -v '^ *$' | \
    egrep -v 'INSERT INTO sessions' | \
    $D/sort-inserts.py
