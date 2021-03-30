import catmaid.fields
import catmaid.models
from django.conf import settings
import django.contrib.postgres.fields
import django.contrib.postgres.functions
from django.db import connection, migrations, models
import django.db.models.deletion
import numpy as np


forward_nblast_score_relation = """
    -- Create a result score relation. This avoids foreign keys in order to
    -- maintain good performance.
    CREATE TABLE nblast_similarity_score  (
        query_object_id bigint NOT NULL,
        target_object_id bigint NOT NULL,
        score real NOT NULL,
        similarity_id int NOT NULL
    );

    CREATE UNIQUE INDEX nblast_similarity_score_unique_idx ON
    nblast_similarity_score (query_object_id, target_object_id, similarity_id);

    CREATE INDEX nblast_similarity_score_similarity_id_idx ON
    nblast_similarity_score USING BRIN(similarity_id);

    -- We assume C order inserts (one row at a time, where each ro welement
    -- shares the same query object ID). Otherwise, this index isn't of much
    -- help.
    CREATE INDEX nblast_similarity_score_query_id_idx ON
    nblast_similarity_score USING BRIN(query_object_id);
"""


forward = """
    -- Make sure all triggers are removed from the live table
    SELECT disable_history_tracking_for_table('nblast_similarity'::regclass,
        get_history_table_name('nblast_similarity'::regclass));
    -- Drop the history table
    SELECT drop_history_table('nblast_similarity'::regclass);

    -- Update regular table
    ALTER TABLE nblast_similarity
    ADD COLUMN min_length real;

    UPDATE nblast_similarity
    SET min_length = 0;

    ALTER TABLE nblast_similarity
    ADD COLUMN min_soma_length real;

    UPDATE nblast_similarity
    SET min_soma_length = 0;

    ALTER TABLE nblast_similarity
    ADD COLUMN soma_tags text[] DEFAULT '{soma}'::text[];

    UPDATE nblast_similarity
    SET soma_tags = '{soma}'::text[];

    ALTER TABLE nblast_similarity
    ADD COLUMN scoring_new oid;

    -- We want to make sure the large objects are removed when the similarity
    -- entry is changed to point to another large object OID.
    CREATE OR REPLACE FUNCTION on_update_nblast_similarity_delete_data()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
        IF OLD.scoring IS DISTINCT FROM NEW.scoring THEN
            PERFORM lo_unlink(OLD.scoring);
        END IF;
        RETURN NEW;
    END;
    $$;

    -- We want to make sure the large objects are removed when the similarity
    -- entry is removed.
    CREATE OR REPLACE FUNCTION on_delete_nblast_similarity_delete_data()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
        PERFORM lo_unlink(OLD.scoring);
        DELETE FROM nblast_similarity_score WHERE similarity_id = OLD.id;
        RETURN OLD;
    END;
    $$;

    CREATE OR REPLACE FUNCTION on_truncate_nblast_similarity_delete_data()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
        PERFORM lo_unlink(scoring) FROM nblast_similarity;
        TRUNCATE nblast_similarity_score;
        RETURN NEW;
    END;
    $$;

    CREATE TRIGGER on_update_nblast_similarity AFTER UPDATE ON nblast_similarity
    FOR EACH ROW EXECUTE PROCEDURE on_update_nblast_similarity_delete_data();

    CREATE TRIGGER on_delete_nblast_similarity AFTER DELETE ON nblast_similarity
    FOR EACH ROW EXECUTE PROCEDURE on_delete_nblast_similarity_delete_data();

    CREATE TRIGGER on_truncate_nblast_similarity BEFORE TRUNCATE ON nblast_similarity
    FOR EACH STATEMENT EXECUTE PROCEDURE on_truncate_nblast_similarity_delete_data();
"""


def translate_scoring_forward(apps, schema_editor):
    """Iterate over all NBLAST scores and convert the nested arrays to raw bytes.
    """
    cursor = connection.cursor()
    pconn = cursor.cursor.connection

    NblastSimilarity = apps.get_model('catmaid', 'NblastSimilarity')
    for s_id in NblastSimilarity.objects.all().values_list('id', flat=True):
        cursor.execute("""
            SELECT scoring FROM nblast_similarity
            WHERE id = %(id)s
        """, {
            'id': s_id
        })
        scoring = cursor.fetchone()[0]
        if scoring:
            npscoring = np.float32(scoring)

            # Create a new large object (oid=0 in read-write mode)
            lobj = pconn.lobject(oid=0, mode='wb')

            # Store similarity matrix as raw data bytes in C order row by row)
            bytes_written = lobj.write(npscoring.tobytes())

            cursor.execute("""
                UPDATE nblast_similarity
                SET scoring_new = %(scoring_oid)s::oid
                WHERE id = %(id)s
            """, {
                'scoring_oid': lobj.oid,
                'id': s_id,
            })

            lobj.close()


# We don't want to enable history tracking on this table again.
finish_forward = """
    ALTER TABLE nblast_similarity
    DROP COLUMN scoring;

    ALTER TABLE nblast_similarity
    RENAME COLUMN scoring_new TO scoring;


    -- A helper to convert bytea to float. This is based on StackOverflow
    -- discussion: https://stackoverflow.com/questions/9374561
    CREATE OR REPLACE FUNCTION bytes_to_float(bytea_value bytea, is_little_endian boolean DEFAULT true)
    RETURNS real AS $$
    DECLARE
        barray0 bit(8);
        barray1 bit(8);
        barray2 bit(8);
        barray3 bit(8);
        binary_value bit(32);
        sign character(1);
        exponent bit(8);
        exp smallint;
        mantissa bit(23);
        mantissa_index int;
        result real;
    BEGIN
        -- For some reason, we need to access the
        barray0 := get_byte(bytea_value, 3)::bit(8);
        barray1 := get_byte(bytea_value, 2)::bit(8);
        barray2 := get_byte(bytea_value, 1)::bit(8);
        barray3 := get_byte(bytea_value, 0)::bit(8);

        IF is_little_endian THEN
            binary_value := barray0 || barray1 || barray2 || barray3;
        ELSE
            binary_value := barray3 || barray2 || barray1 || barray0;
        END IF;

        IF binary_value = '00000000000000000000000000000000' OR binary_value = '10000000000000000000000000000000' THEN -- IEEE754-1985 Zero
            return 0.0;
        END IF;
        -- RAISE NOTICE 'BINVAL:%', binary_value;

        sign := substring(binary_value from 1 for 1);
        exponent := substring(binary_value from 2 for 8);
        mantissa := substring(binary_value from 10 for 23);

        -- RAISE NOTICE 'MANTISSA-BIT:%', mantissa;
        -- RAISE NOTICE 'EXP-BIT:%', exponent;


        IF exponent = '11111111' THEN
            IF mantissa = '00000000000000000000000' THEN   -- IEEE754-1985 negative and positive infinity
                IF sign = '1' THEN
                    return '-Infinity';
                ELSE
                    return 'Infinity';
                END IF;
            ELSE
              return 'NaN'; -- IEEE754-1985 Not a number
            END IF;
        END IF;

        -- Subtract bias from raw exponent
        exp := exponent::int - 127;
        -- RAISE NOTICE 'EXP:%', exp;

        result := 1.0;
        mantissa_index := 1;
        WHILE mantissa_index < 24 LOOP
            IF substring(mantissa from mantissa_index for 1) = '1' THEN
                result := result + power(2, -(mantissa_index));
            END IF;
            mantissa_index = mantissa_index + 1;
        END LOOP;

        result := result * power(2, exp);

        IF(sign = '1') THEN
            result = -result;
        END IF;

        return result;
    END;
    $$
    LANGUAGE plpgsql IMMUTABLE
    COST 100;


    -- A convenience function to get NBLAST scores from the large object in SQL.
    CREATE OR REPLACE FUNCTION nblast_score(similarity_id int, query_object_id bigint, target_object_id bigint)
    RETURNS real AS $$
      -- Get a 32bit float number from a large object that we assume is in C
      -- ordering (row after row). The memory location of a score is therefore:
      -- 4 Bytes per entry * query_idx_pos * n_targets + target_idx_pos
      SELECT bytes_to_float(
        lo_get(s.scoring, 4 * (
            (array_position(s.query_objects, query_object_id) - 1)::bigint * array_length(s.target_objects, 1)::bigint
          + (array_position(s.target_objects, target_object_id) - 1)::bigint), 4), TRUE) as score
      FROM nblast_similarity s
      WHERE s.id = similarity_id;
    $$
    LANGUAGE SQL IMMUTABLE;


    CREATE OR REPLACE FUNCTION nblast_lo_score_to_rows(similarity_id int)
    RETURNS void AS $$
      INSERT INTO nblast_similarity_score (similarity_id, query_object_id, target_object_id, score)
      SELECT similarity_id, q_id, t_id, score
      FROM (
        SELECT * FROM (
          WITH qi AS (
            SELECT generate_series(1, array_length(query_objects, 1))::bigint AS i FROM nblast_similarity where id = similarity_id
          ), ti AS (
            SELECT generate_series(1, array_length(target_objects, 1))::bigint AS i FROM nblast_similarity where id = similarity_id
          ), misc AS (
            SELECT array_length(target_objects, 1)::bigint AS target_length
            FROM nblast_similarity
            WHERE id = similarity_id
          )
          SELECT query_objects[qi.i] AS q_id, target_objects[ti.i] AS t_id,
            bytes_to_float(lo_get(s.scoring, 4 * ((qi.i - 1) * misc.target_length + (ti.i - 1)), 4), TRUE) as score
          FROM qi, ti, misc, nblast_similarity s
          WHERE s.id = similarity_id
        ) sub
        WHERE score > 0
      ) sub2;
    $$
    LANGUAGE SQL VOLATILE;
"""


backward_nblast_score_relation = """
    DROP TABLE nblast_similarity_score;
"""


backward = """
    DROP FUNCTION nblast_lo_score_to_rows(int);
    DROP FUNCTION nblast_score(int, bigint, bigint);
    DROP FUNCTION bytes_to_float(bytea, boolean);

    ALTER TABLE nblast_similarity
    DROP COLUMN min_length;

    ALTER TABLE nblast_similarity
    DROP COLUMN min_soma_length;

    ALTER TABLE nblast_similarity
    DROP COLUMN soma_tags;

    ALTER TABLE nblast_similarity
    ADD COLUMN scoring_new real[][];

    DROP TRIGGER on_update_nblast_similarity ON nblast_similarity;
    DROP TRIGGER on_delete_nblast_similarity ON nblast_similarity;
    DROP TRIGGER on_truncate_nblast_similarity ON nblast_similarity;
"""


def translate_scoring_backward(apps, schema_editor):
    """Iterate over all NBLAST scores and convert all byte scores to nested
    arrays.
    """
    cursor = connection.cursor()
    pconn = cursor.cursor.connection

    NblastSimilarity = apps.get_model('catmaid', 'NblastSimilarity')
    for s in NblastSimilarity.objects.all():
        cursor.execute("""
            SELECT scoring FROM nblast_similarity
            WHERE id = %(id)s
        """, {
            'id': s.id
        })
        scoring = cursor.fetchone()[0]
        if scoring:
            # Load a new large object (oid=0 in read-write mode)
            lobj = pconn.lobject(oid=scoring, mode='rb')

            # Store similarity matrix as raw data bytes in C order row by row)
            raw_data = np.frombuffer(lobj.read(), dtype=np.float32)
            data = raw_data.reshape((len(s.query_objects), len(s.target_objects)))
            s.similarity = data.tolist()
            s.save()


finish_backward = """
    SELECT lo_unlink(scoring) FROM nblast_similarity WHERE scoring IS NOT NULL;

    ALTER TABLE nblast_similarity
    DROP COLUMN scoring;

    ALTER TABLE nblast_similarity
    RENAME COLUMN scoring_new TO scoring;

    SELECT create_history_table('nblast_similarity'::regclass, 'edition_time', 'txid');
"""


class Migration(migrations.Migration):
    """This migration adds three new parameter fields to NBLAST similarities
    (min length, min soma length, soma tags) and changes the data type of the
    result scores. Instead of using a 2D float array (real[][]), a Postgres
    large object is used, which is only referenced as an OID and is stored
    separately. This makes access slightly more complex, but is needed in order
    to store results larger than 1GB. Those large objects are deleted through
    tigger functions if the referencing nblast_similarity entry is updated (and
    the reference is changed), deleted or if the table is truncated. The 1GB
    field size limit of real is the same as for any other data type. In practice
    this means a single NBLAST result score matrix stored in a real[][] field,
    can contain max 268435456 values, which in turn allows for an all-by-all
    score matrix of 16384 objects, which isn't all too much. Large objects fix
    this.

    This is done in multiple steps: first the schema changes are made, but the
    new scoring column is added with a temporary suffix. Then the existing
    scoring is translated and finally the old scoring is deleted and the new
    scoring column renamed.

    After this change, there will also be no more change history for the
    nblast_similarity table. This isn't really needed for this set of results
    and would complicate things slightly for this change.

    Additionally, the table nblast_similarity_score is added, which will allow
    the relational storage of query results. This should be fine in most cases,
    because the vast majority of skeletons is not similar (in the NBLAST sense)
    to each other.
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('catmaid', '0120_add_can_create_deep_link_permission'),
    ]

    operations = [
        migrations.RunSQL(forward_nblast_score_relation, backward_nblast_score_relation),
        migrations.RunSQL(migrations.RunSQL.noop, finish_backward),
        migrations.RunSQL(forward, backward, [
            migrations.AddField(
                model_name='nblastsimilarity',
                name='min_length',
                field=models.FloatField(default=15000),
            ),
            migrations.AddField(
                model_name='nblastsimilarity',
                name='min_soma_length',
                field=models.FloatField(default=1000),
            ),
            migrations.AddField(
                model_name='nblastsimilarity',
                name='soma_tags',
                field=django.contrib.postgres.fields.ArrayField(base_field=models.TextField(), default=catmaid.models.get_default_some_tags, size=None),
            ),
            migrations.AlterField(
                model_name='nblastsimilarity',
                name='scoring',
                field=models.IntegerField(null=True),
            ),
        ]),
        migrations.RunPython(translate_scoring_forward, translate_scoring_backward),
        migrations.RunSQL(finish_forward, migrations.RunSQL.noop),
    ]
