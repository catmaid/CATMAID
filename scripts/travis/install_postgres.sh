#!/usr/bin/env bash

set -ex

echo "Installing Postgres 11"
sudo systemctl stop postgresql
sudo apt-get remove -q 'postgresql-*'
sudo apt-get update -q
sudo apt-get install -q postgresql-11 postgresql-client-11 postgresql-11-postgis-2.5 postgresql-11-postgis-2.5-scripts

# Drop existin database and crate a new one to make sure we run in a ramdisk and
# on port 5432.
sudo pg_dropcluster 11 main
sudo mkdir -p /var/ramfs/postgresql/11/main
sudo chown postgres:postgres /var/ramfs/postgresql/11/main
sudo pg_createcluster -d /var/ramfs/postgresql/11/main -p 5432 11 main

# In case future Postgres version are not available on Travis and have to
# installed manually, copying the existing hba file can save some time.
sudo cp /etc/postgresql/{10,11}/main/pg_hba.conf

echo "Restarting Postgres 11"
sudo systemctl start postgresql@11-main

echo "The following Postgres clusters are installed:"
pg_lsclusters
