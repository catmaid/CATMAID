#!/bin/sh

if [ $# -ne 1 ]
then
  echo "Usage: $0 <DATABASE-NAME>"
  exit 1
fi

pg_dump --no-privileges --schema-only --no-owner \
   --no-tablespaces $1 -U catmaid_user | \
   egrep -v '^--' | \
   egrep -v '^ *$' | \
   sed -e '/CREATE FUNCTION connect/,+2d'
