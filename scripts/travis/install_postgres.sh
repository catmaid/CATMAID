#!/usr/bin/env bash

set -ex

echo "Installing Postgres 10"
sudo systemctl stop postgresql
sudo apt-get remove -q 'postgresql-*'
sudo apt-get update -q
sudo apt-get install -q postgresql-10 postgresql-client-10 postgresql-10-postgis-2.4 postgresql-10-postgis-2.4-scripts

# In case future Postgres version are not available on Travis and have to
# installed manually, copying the existing hba file can save some time.
#sudo cp /etc/postgresql/{9.6,10}/main/pg_hba.conf

echo "Restarting Postgres 10"
sudo systemctl start postgresql@10-main

echo "The following Postgres clusters are installed:"
pg_lsclusters
