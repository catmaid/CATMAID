#!/usr/bin/env bash

set -ex

echo "Adding official Postgres repository"
PG_URL="http://apt.postgresql.org/pub/repos/apt/"
APT_LINE="deb ${PG_URL} $(lsb_release -cs)-pgdg main"
echo "${APT_LINE}" | sudo tee "/etc/apt/sources.list.d/pgdg.list"
sudo apt-get install wget ca-certificates
PG_KEY_URL="https://www.postgresql.org/media/keys/ACCC4CF8.asc"
wget --quiet -O - ${PG_KEY_URL} | sudo apt-key add -
sudo apt-get update

echo "Removing existing Postgres installation"
sudo systemctl stop postgresql
sudo apt-get remove -q 'postgresql-*'
echo "Installing Postgres 13 and PostGIS 3.2"
sudo apt-get update -q
sudo apt-get install -q postgresql-13 postgresql-client-13 postgresql-13-postgis-3-scripts

# Drop existin database and crate a new one to make sure we run in a ramdisk and
# on port 5432.
sudo pg_dropcluster --stop 13 main
sudo mkdir -p /var/ramfs/postgresql/13/main
sudo chown postgres:postgres /var/ramfs/postgresql/13/main
sudo pg_createcluster -d /var/ramfs/postgresql/13/main -p 5432 13 main

# To work better with Travis, follow their default Postgres configuration and
# set each host based authentication entry to "trust" rather than "md5" or
# "peer". Alternatively, we could copy the existing hba file:
# sudo cp /etc/postgresql/{12,13}/main/pg_hba.conf
sudo sed -i -e 's/peer/trust/g' -e 's/md5/trust/g' /etc/postgresql/13/main/pg_hba.conf

echo "Starting Postgres 13"
sudo systemctl start postgresql@13-main

echo "The following Postgres clusters are installed:"
pg_lsclusters
