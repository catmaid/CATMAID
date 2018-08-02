# -*- coding: utf-8 -*-

from django.db import migrations

forward = """
    DO
    $$
    BEGIN

    -- If Postgres 9.5 is used, add a Postgres 9.6 compatibility function to
    -- support to_regclass(text) calls. Having this function will *not* prevent
    -- upgrades to Postgres 9.6 through pg_upgrade via pg_dump.
    IF current_setting('server_version_num')::integer < 90600 then
      CREATE FUNCTION to_regclass(text) RETURNS regclass
      LANGUAGE sql AS 'select to_regclass($1::cstring)';
    END IF;

    END
    $$;
"""

backward = """
    DO
    $$
    BEGIN

    -- If Postgres 9.5 is used, remove Postgres 9.6 compatibility function.
    DROP FUNCTION to_regclass(text);

    END
    $$;
"""


class Migration(migrations.Migration):
    """This migration adds a compatibility function that allows us to use the
    Postgres 9.6 type signature of the to_regclass() function. Before Postgres
    9.6, to_regclas() accepted one cstring parameter. With Postgres 9.6 this
    becomes a text parameter. The added function will *not* prevent updates from
    Postgres 9.5 to 9.6 through pg_upgrade or via pg_dump (tested).

    Updating actual CATMAID functions that use to_regclass() will be done
    separately.
    """

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.RunSQL(forward, migrations.RunSQL.noop)
    ]
