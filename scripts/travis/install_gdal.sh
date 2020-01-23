#!/usr/bin/env bash
#
# GDAL installation for travis from:
# https://stackoverflow.com/questions/55877882/

set -ex

echo "Installing GDAL"
sudo apt-get remove -y libgdal1
sudo add-apt-repository -y ppa:ubuntugis/ppa
sudo apt-get update -q
sudo apt-get install -y libgdal-dev
