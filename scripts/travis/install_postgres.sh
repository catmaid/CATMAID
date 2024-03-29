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
echo "Installing Postgres 12"
sudo apt-get update -q
sudo apt-get install -q postgresql-12 postgresql-client-12 postgresql-12-postgis-2.5 postgresql-12-postgis-2.5-scripts

# Drop existin database and crate a new one to make sure we run in a ramdisk and
# on port 5432.
sudo pg_dropcluster --stop 12 main
sudo mkdir -p /var/ramfs/postgresql/12/main
sudo chown postgres:postgres /var/ramfs/postgresql/12/main
sudo pg_createcluster -d /var/ramfs/postgresql/12/main -p 5432 12 main

# To work better with Travis, follow their default Postgres configuration and
# set each host based authentication entry to "trust" rather than "md5" or
# "peer". Alternatively, we could copy the existing hba file:
# sudo cp /etc/postgresql/{10,12}/main/pg_hba.conf
sudo sed -i -e 's/peer/trust/g' -e 's/md5/trust/g' /etc/postgresql/12/main/pg_hba.conf

echo "Starting Postgres 12"
sudo systemctl start postgresql@12-main

echo "The following Postgres clusters are installed:"
pg_lsclusters
