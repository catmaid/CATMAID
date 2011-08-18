#!/bin/bash

set -e

cd $(dirname "$BASH_SOURCE")
cd ..

LYX_DOCUMENTS=docs/data-model.lyx

for f in $LYX_DOCUMENTS
do
    p=${f%.lyx}.pdf
    rm -f "$p"
    lyx -e pdf "$f"
    scp "$p" longair@incf-staging.ini.uzh.ch:/var/www/incf/docs/catmaid-"$(basename $p)"
done
