#!/bin/bash

SCRIPT_DIRECTORY="$(dirname $(readlink -nf $BASH_SOURCE))"

JSLINT_SOURCE="$SCRIPT_DIRECTORY/jslint.js"
WRAPPER_SOURCE="$SCRIPT_DIRECTORY/jslint-check.js"

if [ $# != 1 ]
then
    echo "Usage: $0 <javscript-source>" >&2
    exit 1
fi

RELATIVE_FILENAME="$1"

if [ ! -e "$RELATIVE_FILENAME" ]
then
    echo "The file '$RELATIVE_FILENAME' does not exist." >&2
    exit 1
fi

ABSOLUTE_FILENAME="$(readlink -nf $RELATIVE_FILENAME)"

rhino "$WRAPPER_SOURCE" "$JSLINT_SOURCE" "$ABSOLUTE_FILENAME" "$RELATIVE_FILENAME"
