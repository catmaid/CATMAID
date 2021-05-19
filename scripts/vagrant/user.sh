#!/bin/bash
set -e
set -x

# make sure this is created by a user, not root
mkdir -p ~/.local/share

# set up python environment
python3.8 -m venv ~/catmaid-env
source ~/catmaid-env/bin/activate
echo "source ~/catmaid-env/bin/activate" >> ~/.bashrc

# install python dependencies
cd /CATMAID/django
pip install -U pip setuptools wheel
pip install -r requirements-dev.txt
grep --invert-match "^cloud-volume" requirements-optional.txt > ~/requirements-nocloudvolume.txt
pip install -r ~/requirements-nocloudvolume.txt

# install node dependencies
cd /CATMAID
npm install

# set up R library (without the eval, tilde is not expanded)
mkdir -p $(eval echo $(Rscript -e "cat(Sys.getenv(\"R_LIBS_USER\"))"))
# TODO: install R packages? Very slow

# set up gitignore
mkdir -p ~/.config/git
echo "
# backup files
*.bak
*.swp
*~
*#
.orig

# editor
.idea
*.iml
.vscode

# python
.venv
pyvenv.cfg
pip-selfcheck.json
.Python
.python-version*
.pytest_cache/
*.pyc
*.pyo

# git merges
*_BACKUP_*
*_BASE_*
*_LOCAL_*
*_REMOTE_*

# environment variables
.envrc
.env

# node
node_modules/

# environment
.vagrant/
" >> ~/.config/git/ignore

git config --global user.useConfigOnly true
