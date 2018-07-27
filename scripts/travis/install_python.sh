#!/usr/bin/env bash

set -ex

echo "Installing Python 3.6"
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt-get update -q
sudo apt-get install -y python3.6
