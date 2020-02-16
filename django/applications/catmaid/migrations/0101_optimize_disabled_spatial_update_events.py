from django.db import migrations, models
import django.contrib.gis.db.models.fields


forward = """
    CREATE OR REPLACE FUNCTION disable_spatial_update_events() RETURNS void
    LANGUAGE plpgsql AS
    $$
    BEGIN
        CREATE OR REPLACE FUNCTION notify_conditionally(channel text, payload text) RETURNS int
        LANGUAGE sql AS
        $inner$
        SELECT 0;
        $inner$;
    END;
    $$;
"""

backward = """
  CREATE OR REPLACE FUNCTION disable_spatial_update_events() RETURNS void
  LANGUAGE plpgsql AS
  $$
  BEGIN
      CREATE OR REPLACE FUNCTION notify_conditionally(channel text, payload text) RETURNS int
      LANGUAGE plpgsql AS
      $inner$
      BEGIN
          PERFORM 1 WHERE 1 = 0;
          RETURN 0;
      END;
      $inner$;
  END;
  $$;
"""


class Migration(migrations.Migration):
    """This give the planner a better chance of improving a plan that contains a
    notify call, but with notifications disabled (current default). Making the
    resulting notify_conditionally() function an SQL function (rather than
    plpgsql allows to planner to realize it is a constant and optimize it out,
    avoiding also all string concatenation at the call site.
    """

    dependencies = [
        ('catmaid', '0100_update_timestamp_field_default_values'),
    ]

    operations = [
        migrations.RunSQL(forward, backward),
    ]
