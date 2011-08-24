"""
This is a custom version of the postgresql_psycopg2 adaptor that
overrides last_insert_id so that it works with inherited tables.
Instead of using pg_get_serial_sequence, this finds the default value
of the primary key for the table and parse out the sequence name from
that.
"""

from django.db.backends.postgresql_psycopg2.base import DatabaseWrapper as PG2DatabaseWrapper
from django.db.backends.postgresql_psycopg2.base import DatabaseIntrospection as PG2DatabaseIntrospection
from django.db.backends.postgresql_psycopg2.base import DatabaseError as PG2DatabaseError
from django.db.backends.postgresql_psycopg2.base import IntegrityError as PG2IntegrityError
from django.db.backends.postgresql_psycopg2.base import DatabaseOperations as PG2DatabaseOperations
from django.db.backends.postgresql_psycopg2.base import DatabaseClient as PG2DatabaseClient
import re
import sys

class DatabaseError(Exception):
    pass

class IntegrityError(PG2IntegrityError):
    def __init__(self, *args, **kwargs):
        super(IntegrityError, self).__init(*args, **kwargs)

class DatabaseOperations(PG2DatabaseOperations):
    def last_insert_id(self, cursor, table_name, pk_name):
        print >> sys.stderr, "In last_insert_id!"
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
        default_value = cursor.fetchone()[0]
        print >> sys.stderr, "default_value is:", default_value
        m = re.search(r'nextval\(\'(.*?)\'::regclass\)', default_value)
        if not m:
            raise DatabaseError("Couldn't find the sequence for column '%s' in table '%s'" % (pk_name, table_name))
        cursor.execute("SELECT CURRVAL(%s)", (m.group(1),))
        return cursor.fetchone()[0]

class DatabaseClient(PG2DatabaseClient):
    def __init__(self, *args, **kwargs):
        super(DatabaseClient, self).__init(*args, **kwargs)

class DatabaseIntrospection(PG2DatabaseIntrospection):
    def __init__(self, *args, **kwargs):
        super(DatabaseIntrospection, self).__init(*args, **kwargs)

class DatabaseWrapper(PG2DatabaseWrapper):
    def __init__(self, *args, **kwargs):
        super(DatabaseWrapper, self).__init__(*args, **kwargs)
        self.ops = DatabaseOperations(self)
