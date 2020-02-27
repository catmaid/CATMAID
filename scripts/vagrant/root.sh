#!/bin/bash
set -e
set -x

export DEBIAN_FRONTEND=noninteractive

CODENAME="$(lsb_release -cs)"

PG_URL="http://apt.postgresql.org/pub/repos/apt/"
APT_LINE="deb ${PG_URL} ${CODENAME}-pgdg main"
echo "${APT_LINE}" | sudo tee "/etc/apt/sources.list.d/pgdg.list"
apt-get install wget ca-certificates
PG_KEY_URL="https://www.postgresql.org/media/keys/ACCC4CF8.asc"
wget --quiet -O - ${PG_KEY_URL} | sudo apt-key add -

add-apt-repository ppa:deadsnakes/ppa
add-apt-repository ppa:ubuntugis/ppa
# necessary for git 2.8's user.useConfigOnly option
add-apt-repository ppa:git-core/ppa

# node PPA
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -

# R PPA
echo "deb https://cloud.r-project.org/bin/linux/ubuntu ${CODENAME}/" >> /etc/apt/sources.list
apt-key adv --keyserver keyserver.ubuntu.com --recv-keys E298A3A825C0D65DFD57CBB651716619E084DAB9

apt-key update
apt-get update

VERSION="$(lsb_release -rs)"
cd /CATMAID
sudo xargs apt-get install -y < packagelist-ubuntu-${VERSION}-apt.txt
apt-get install -y nodejs python3-pip python3.6-venv python3-wheel git r-base

