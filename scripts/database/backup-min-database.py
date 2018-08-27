#!/bin/bash
#
# Backup all Postgres databases, exclude some CATMAID tables that can be
# regenerated from other tables to reduce size of backups.

DUMPALL='/usr/bin/pg_dumpall'
PGDUMP='/usr/bin/pg_dump'
PSQL='/usr/bin/psql'

EXCLUDED_TABLES='-T treenode_edge -T treenode_connector_edge -T connector_geom -T catmaid_stats_summary -T node_query_cache -T catmaid_skeleton_summary'

# directory to save backups in, must be rwx by postgres user
BASE_DIR='/var/backups/postgres'
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
