#!/bin/bash

if [ $# -ne 1 ]
then
  echo "Usage: $0 <DATABASE-NAME>"
  exit 1
fi  

D=$(dirname $(readlink -nf $BASH_SOURCE))

pg_dump --no-privileges --inserts --data-only --no-owner --no-tablespaces \
    $1 -U catmaid_user | \
    egrep -v '^--' | \
    egrep -v '^ *$' | \
    egrep -v 'INSERT INTO sessions' | \
    $D/sort-inserts.py
