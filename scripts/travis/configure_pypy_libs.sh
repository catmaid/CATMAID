#!/usr/bin/env bash
#
# Prepare environment to run Django with PyPy. This effectively means removing
# any copy of the shared library libsqlite3.so that comes with the existing PyPy
# installations.
#
# This is unforunately needed for PyPy at the moment, because it comes with its
# own libsqlite3.so.0 on both Travis and GitHub Actions, which doesn't have
# column metadata compiled in, which in turn is needed by GDAL and Django. In
# order to make PyPy use the OS provided libsqlite3.so, we delete PyPy's copy.
# This fixes running CATMAID's back-end test suit with PyPy on both Travis CI
# and GH Actions, which failed before due to the following error:
#
# OSError: Cannot load library libgdal.so.20: /usr/lib/libgdal.so.20: undefined symbol: sqlite3_column_table_name
#
# Since the OS level library is compiled with SQLITE_ENABLE_COLUMN_METADATA=1,
# this is the library we want to use. More information can also be found here:
#
# https://stackoverflow.com/questions/65476852/

set -ex

# Delete all files that have libsqlite3.so in their path name as well as PyPy
# (regardless of the case of the P).
echo 'Attempting to delete all PyPy copies of libsqlite3.so in order to use OS copy'
sudo time find / -path /proc -prune -o -regex '.*[Pp]y[Pp]y.*libsqlite3\.so.*' -type f -exec rm -f {} +
