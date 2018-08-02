# -*- coding: utf-8 -*-

"""
This is a custom version of the postgresql_psycopg2 adaptor that
overrides last_insert_id so that it works with inherited tables.
Instead of using pg_get_serial_sequence, this finds the default value
of the primary key for the table and parse out the sequence name from
that.

As of May 2015 this is still required: It replaces last_insert_id, a
function that returns the last ID of a sequence. The implementation in
Django 1.6.11 and more recent versions (like 1.8.2) does the following:

  SELECT CURRVAL(pg_get_serial_sequence(tablename, pk_name))

Unfortunately, in Postgres 9.4 (and I assume in earlier versions, too)

  pg_get_serial_sequence(tablename, pk_name)

can't work with sequences defined in parent tables if inheritance is
used. CATMAID uses table inheritance and Django this Postgres function.
So it has to be worked around this problem.

Performance-wise, this should not be a big problem. this extra query is
also done in Django's version (even if in a much simpler version). The
function last_insert_id is only used for insert statements through the
ORM.
"""

from django.db.backends.base.base import NO_DB_ALIAS

# CATMAID uses PostGIS, so we need to make sure we wrap the PostGIS backend
from django.contrib.gis.db.backends.postgis.base import DatabaseWrapper as PostGISDatabaseWrapper
from django.contrib.gis.db.backends.postgis.operations import PostGISOperations

import re
import sys

class DatabaseError(Exception):
    pass

class DatabaseOperations(PostGISOperations):
    def last_insert_id(self, cursor, table_name, pk_name):
        # Get the default value for the column name:
        cursor.execute('''
SELECT adsrc
  FROM pg_attrdef pad, pg_attribute pat, pg_class pc
  WHERE pc.relname=%s AND
        pc.oid=pat.attrelid AND
        pat.attname=%s AND
        pat.attrelid=pad.adrelid AND
        pat.attnum=pad.adnum
''', (table_name, pk_name))
        # The default value should look like:
        #   nextval('concept_id_seq'::regclass)
        result_row = cursor.fetchone()
        if not result_row:
            # Then there's no column of that name, which may mean, for
            # example, that this is a managed join table with no "id"
            # column:
            return None
        default_value = result_row[0]
        m = re.search(r'nextval\(\'(.*?)\'::regclass\)', default_value)
        if not m:
            raise DatabaseError("Couldn't find the sequence for column '%s' in table '%s'" % (pk_name, table_name))
        cursor.execute("SELECT CURRVAL(%s)", (m.group(1),))
        return cursor.fetchone()[0]

class DatabaseWrapper(PostGISDatabaseWrapper):
    def __init__(self, *args, **kwargs):
        super(DatabaseWrapper, self).__init__(*args, **kwargs)
        # Don't override operations for Non-DB connections
        if kwargs.get('alias', '') != NO_DB_ALIAS:
            self.ops = DatabaseOperations(self)
