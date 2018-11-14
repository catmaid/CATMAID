#!/usr/bin/env bash
# install ubuntu and python requirements
set -ev

source `dirname ${BASH_SOURCE[0]}`/travis_functions.sh

travis_retry sudo apt-get install -y -qq $(< packagelist-ubuntu-16.04-apt.txt)
travis_retry python -m pip install -U pip
travis_retry travis_wait 60 pip install -q -r django/requirements.txt
pip list
# Install additional dependencies for Travis
pip install -q -r django/requirements-test.txt
