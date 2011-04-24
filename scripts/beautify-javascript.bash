#!/bin/bash

D=$(dirname $(readlink -nf $BASH_SOURCE))
SD=$(readlink -nf $D/../httpdocs)

# The js-beautify directory.  (It can be cloned from
# https://github.com/einars/js-beautify .)
JSB=~/js-beautify/

if [ ! -e ~/js-beautify/beautify-cl.js ]
then
    echo "Couldn't find the beautify-cl.js script"
    exit 1
fi

case "$#" in
0)
    find $SD \( -name experiment -o -name libs \) -prune -o -name '*.js' -print0 |
      xargs -0 -n 1 $BASH_SOURCE
    ;;
1)
    if [ -e "$1" ]
    then
        T=$(mktemp) &&
        rhino $JSB/beautify-cl.js -i 2 -a -n -p -d $JSB $1 > $T &&
        sed -e 's/[ \t]*$//' $T > $1 &&
        rm $T
    else
        echo "$1 didn't exist"
	exit 1
    fi
    ;;
*)
    echo Usage: $0 [JAVASCRIPT_FILE]
    ;;
esac
