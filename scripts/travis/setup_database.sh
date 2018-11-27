#!/usr/bin/env bash
# Configure and start postgres, create database
set -ev

psql -c 'CREATE DATABASE catmaid;' -U postgres
psql -c 'CREATE EXTENSION postgis;' -U postgres catmaid
psql -c 'CREATE EXTENSION pg_trgm;' -U postgres catmaid
