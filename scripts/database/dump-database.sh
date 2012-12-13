#!/bin/bash

if [ $# -ne 1 ]
then
  echo "Usage: $0 <DATABASE-NAME>"
  exit 1
fi

pg_dump --no-privileges --inserts --no-owner --no-tablespaces --column-inserts \
    $1 -U catmaid_user | \
    egrep -v '^--' | \
    egrep -v '^ *$' | \
    egrep -v 'INSERT INTO sessions' | \
    sed -e '/CREATE FUNCTION connect/,+2d'
