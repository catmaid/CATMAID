#!/usr/bin/env bash
# Configure and start postgres, create database
set -ev

sudo cp /etc/postgresql/9.5/main/pg_hba.conf /etc/postgresql/9.6/main/pg_hba.conf
sudo /etc/init.d/postgresql restart
psql -c 'CREATE DATABASE catmaid;' -U postgres
psql -c 'CREATE EXTENSION postgis;' -U postgres catmaid
