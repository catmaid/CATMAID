#!/bin/bash

set -x
set -e

D=$(dirname $(readlink -nf $BASH_SOURCE))
INDEX_FILE="$D/../httpdocs/index.html"

if [ -e "${INDEX_FILE}.DOWN" ]
then
    mv "${INDEX_FILE}.DOWN" "$INDEX_FILE"
else
    mv "$INDEX_FILE" "${INDEX_FILE}.DOWN"
    echo "<html><h2>CATMAID is down for maintenance</h2></html>" > "$INDEX_FILE"
fi
