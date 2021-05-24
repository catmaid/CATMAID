#!/bin/bash
set -e
set -x

export DEBIAN_FRONTEND=noninteractive

CODENAME="$(lsb_release -cs)"

# We seem to indirectly hit a virtualbox issue with Ubuntu 18.04, or more
# specifically with The VirtualBox Guest Additions v6.x, which is installed
# there: https://www.virtualbox.org/ticket/18776. A workaround is to downgrade
# to Guest Additions v5.x, which doesn't seem to work for us in the 18.04 image.
# Therefore, we create a separate node_modules folder in the VM and use
# overlayfs to map it into the /CATMAID tree. The overlayfs is created in the
# fstab file to be perstent through reboots.
echo "Creating internal NPM overlay"
mkdir -p /CATMAID/node_modules
mkdir -p /home/vagrant/catmaid-npm-overlay/node_modules
mkdir -p /home/vagrant/catmaid-npm-overlay/work
chown -R vagrant /home/vagrant/catmaid-npm-overlay/node_modules
chown -R vagrant /home/vagrant/catmaid-npm-overlay/work

# First remove any existing line with catmaid-npm-overlay in its name and then add a
# new version.
sed -i "/.*\(catmaid-npm-overlay\).*/d" /etc/fstab
echo "overlay /CATMAID/node_modules overlay noauto,x-systemd.automount,lowerdir=/CATMAID/node_modules,upperdir=/home/vagrant/catmaid-npm-overlay/node_modules,workdir=/home/vagrant/catmaid-npm-overlay/work 0 0" >> /etc/fstab
mount /CATMAID/node_modules/
# This "virtually" removes everything in this folder, the host's version stays
# untouched. For some reasone, 'rm -r' doesn't work without an error on its own,
# which is why find is used.
find /CATMAID/node_modules/ -maxdepth 1 -mindepth 1 -exec rm -r {} \;

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
echo "deb https://cloud.r-project.org/bin/linux/ubuntu ${CODENAME}-cran40/" >> /etc/apt/sources.list
apt-key adv --keyserver keyserver.ubuntu.com --recv-keys E298A3A825C0D65DFD57CBB651716619E084DAB9

apt-key update
apt-get update
apt-get upgrade -y

cd /CATMAID
sudo xargs apt-get install -y < packagelist-ubuntu-apt.txt
apt-get install -y nodejs python3-pip python3.8-venv python3-wheel git r-base

POSTGRES_VERSION=$(psql --version | awk '{print $3}' | awk -F '.' '{print $1}')

PG_CONF="/etc/postgresql/$POSTGRES_VERSION/main/postgresql.conf"
sed -i "/^port =.*/d" $PG_CONF
echo "port = 5555" >> $PG_CONF
sed -i "/^listen_addresses =.*/d" $PG_CONF
echo "listen_addresses = '*'" >> $PG_CONF
systemctl restart postgresql

# increase number of file watchers (IDEs need this)
echo "fs.inotify.max_user_watches=524288" | tee -a /etc/sysctl.conf
sysctl -p
