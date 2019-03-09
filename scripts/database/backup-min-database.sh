#!/bin/bash
#
# Backup all Postgres databases, exclude some CATMAID tables that can be
# regenerated from other tables to reduce size of backups. Different environment
# variables can be used to configure the behavior:
#
# BASE_DIR: The backup target directory can be configured using the BASE_DIR
#           environment variable and defaults to /var/backups/postgres/.
#
# DUMPALL:  Path to pg_dumpall, default: /usr/bin/pg_dumpall
#
# PGDUMP:   Path to pg_dump, default: /usr/bin/pg_dump
#
# PSQL:     Path to psql, default: /usr/bin/psql
#
# EXCLUDED_TABLES: Defines which tables to exclude. Defaults to:
#                  '-T treenode_edge -T treenode_connector_edge -T connector_geom -T \
#                  catmaid_stats_summary -T node_query_cache -T catmaid_skeleton_summary'
#
# Restoring backups:
#
# Backups created with this script have to be restored in four steps. Assuming a
# database name of "catmaid" (otherwise "-d catmaid" parameters), they are:
#
# 1. Import the schema, which includes all tables. Make sure the relevant
#    database user exists already, or use the "globals" export file. The target
#    database name is part of the filename and matches the original database:
#
#    $ sudo zcat catmaid.schema.gz.dump | sudo -u postgres psql -p 5432
#
# 2. Import the data into the new database:
#
#    $ sudo -u postgres pg_restore -p 5432 -d catmaid --data-only --disable-triggers \
#           -S postgres --jobs=4 /path/to/backups/catmaid.all.gz.dump
#
# 3. Analyze database, for faster restoration of materialzied views:
#
#    $ sudo -u postgres psql -p 5432 -d catmaid -c "\timing on" -c "ANALYZE;"
#
# 4. Recreate all materializations:
#
#     $ manage.py catmaid_rebuild_all_materializations
#

DUMPALL=${DUMPALL:-'/usr/bin/pg_dumpall'}
PGDUMP=${PGDUMP:-'/usr/bin/pg_dump'}
PSQL=${PSQL:-'/usr/bin/psql'}

EXCLUDED_TABLES=${EXCLUDED_TABLES:-'-T treenode_edge -T treenode_connector_edge -T connector_geom -T catmaid_stats_summary -T node_query_cache -T catmaid_skeleton_summary'}

# directory to save backups in, must be rwx by postgres user
BASE_DIR=${BASE_DIR:-'/var/backups/postgres'}

#YMD=$(date "+%Y-%m-%d")
DIR="$BASE_DIR"
#mkdir -p "$DIR"
cd "$DIR"

# get list of databases in system , exclude the tempate dbs
DBS=( $(${PSQL} -t -A -c "select datname from pg_database where datname not in ('template0', 'template1')") )

# first dump entire postgres database, including pg_shadow etc.
$DUMPALL --schema-only | gzip -9 > "$DIR/schema.gz.dump"

# next dump globals (roles and tablespaces) only
$DUMPALL --globals-only | gzip -9 > "$DIR/globals.gz.dump"

# now loop through each individual database and backup the
# schema and data separately
for database in "${DBS[@]}" ; do
    SCHEMA="$DIR/$database.schema.gz.dump"
    DATA="$DIR/$database.all.gz.dump"

    # dump schema
    $PGDUMP --create --clean --schema-only "$database" |
        gzip -9 > "$SCHEMA"

    # dump data
    $PGDUMP --disable-triggers --create --clean -Fc -f "$DATA" $EXCLUDED_TABLES "$database"
done
