# -*- coding: utf-8 -*-

from django.db import models, migrations
from datetime import datetime
import django.core.validators
import catmaid.fields
import django.contrib.gis.db.models.fields
import jsonfield.fields
import catmaid.control.user
from django.conf import settings
from django.utils import timezone
import taggit.managers

remove_instantiation_query_function = """
    DROP FUNCTION filter_used_features(graphids anyarray, features anyarray);
"""

create_query_function = """
    CREATE FUNCTION filter_used_features(graphids anyarray, features anyarray) RETURNS TABLE(id integer)
        LANGUAGE plpgsql STRICT
        AS $$
                    DECLARE
                        ca_id bigint;
                        rel_id bigint;
                        cici_ids bigint[];
                    BEGIN
                        -- Iterate over features
                        FOR i IN 1..array_length(filter_used_features.features, 1)
                        LOOP
                            -- Iterare over classification links of feature
                            FOR j IN 1..array_length(filter_used_features.features, 2)
                            LOOP
                                -- Get ID of class_a and relation of CICI link
                                ca_id := filter_used_features.features[i][j][1];
                                rel_id := filter_used_features.features[i][j][2];

                                -- Exit inner loop if feature has only dummy values left
                                IF ca_id < 0 THEN
                                    EXIT;
                                END IF;

                                -- Find next class instances, note postgres indices are 1 based
                                IF j > 1 THEN
                                    -- Find all class instances linked to the last class
                                    -- instancs found.
                                    SELECT array(
                                        SELECT cici.class_instance_a
                                        FROM class_instance_class_instance AS cici
                                            INNER JOIN class_instance AS ci_a
                                                ON cici.class_instance_a=ci_a.id
                                        WHERE cici.class_instance_b=ANY(cici_ids)
                                            AND ci_a.class_id=ca_id
                                            AND cici.relation_id=rel_id
                                    ) INTO cici_ids;
                                ELSE
                                    -- Find all class instances linked to the graph roots
                                    SELECT array(
                                        SELECT cici.class_instance_a
                                        FROM class_instance_class_instance AS cici
                                            INNER JOIN class_instance AS ci_a
                                                ON cici.class_instance_a=ci_a.id
                                            INNER JOIN class_instance AS ci_b
                                                ON cici.class_instance_b=ci_b.id
                                        WHERE cici.class_instance_b=ANY(filter_used_features.graphids)
                                            AND ci_a.class_id=ca_id
                                            AND cici.relation_id=rel_id
                                    ) INTO cici_ids;
                                END IF;

                                -- Abort if no class instance could be found
                                IF array_length(cici_ids, 1) = 0 THEN
                                    EXIT;
                                END IF;
                            END LOOP;

                            IF array_length(cici_ids, 1) > 0 THEN
                                -- Append this 1 based feature index and continue with
                                -- the next feature
                                RETURN QUERY SELECT i;
                            END IF;
                        END LOOP;

                        RETURN;
                    END
               $$;
"""

class Migration(migrations.Migration):
    """Remove a database function used before by the ontology classification
    sub-system."""

    dependencies = [
        ('catmaid', '0002_create_settings_datastore'),
    ]

    operations = [
        migrations.RunSQL(remove_instantiation_query_function,
            create_query_function),
    ]
