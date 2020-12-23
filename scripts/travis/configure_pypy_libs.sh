#!/usr/bin/env bash
#
# Prepare environment to run Django with PyPy.

# Unforunately needed for PyPy at the moment, because it comes with its own
# libsqlite3.so.0, which doesn't have column metadata compiled in, which in turn
# is needed by GDAL and Django. This forces the use of the libsqlite3 library
# provided by the operationg system. This fixes running CATMAID's back-end test
# suit with PyPy on both Travis CI and GH Actions, which failed before due to
# the following error:
#
# OSError: Cannot load library libgdal.so.20: /usr/lib/libgdal.so.20: undefined symbol: sqlite3_column_table_name
#
# Since the OS level library is compiled with SQLITE_ENABLE_COLUMN_METADATA=1,
# this is the library we want to use.
if_pypy_force_os_sqlite_lib() {
  if python --version | grep PyPy ; then
    export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libsqlite3.so.0
    echo "PyPy detected: override PyPy's own copy of libsqlite3.so with OS provided version"
  else
    echo "Not running PyPy, no library override needed"
  fi
}
