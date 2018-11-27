#!/bin/sh

if [ $# -ne 3 ]
then
    echo "Usage: $0 <DATABASE-NAME> <DATABASE-USER> <DATABASE-PASWORD>"
    exit 1
fi

CATMAID_DATABASE="$1"
CATMAID_USER="$2"
CATMAID_PASSWORD="$(echo $3 | sed -e "s/\\\\/\\\\\\\/g" -e "s/'/\\\'/g")"

cat <<EOSQL
DO
\$body\$
BEGIN
  IF NOT EXISTS (
     SELECT *
     FROM   pg_catalog.pg_user
     WHERE  usename = '$CATMAID_USER')
  THEN
     CREATE ROLE "$CATMAID_USER" LOGIN PASSWORD '$CATMAID_PASSWORD';
  END IF;
END
\$body\$;

CREATE DATABASE "$CATMAID_DATABASE" OWNER "$CATMAID_USER" ENCODING 'UTF8';

\connect $CATMAID_DATABASE
CREATE EXTENSION postgis;
CREATE EXTENSION pg_trgm;
EOSQL
