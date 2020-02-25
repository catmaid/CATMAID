from django.db import migrations


forward_prepare = """
    -- Remove an existing history table infrastructure for the passed in table.
    -- The actual history table ramains.
    CREATE OR REPLACE FUNCTION drop_history_table_keep_data(live_table regclass)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE

        -- This will contain the name of the newly created history table. No
        -- regclass is used, because the implicit table existence check on variable
        -- assignment can fail if the table has already been removed by an
        -- cascaded table drop.
        history_table_name text;

    BEGIN

        -- History tables will be named like the live table plus a '__history' suffix
        history_table_name = get_history_table_name(live_table);

        -- Cascading deleting is used to also delete child tables and triggers.
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_tracking_table_update_trigger_name(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_tracking_table_truncate_trigger_name(), live_table);

        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_regular(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_tracking(), live_table);
        EXECUTE format('DROP FUNCTION IF EXISTS %s() CASCADE',
            get_history_update_fn_name_regular(live_table));
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_truncate_trigger_name(), live_table);

        EXECUTE format('DROP INDEX IF EXISTS %I',
            history_table_name || '_live_pk_index');
        EXECUTE format('DROP INDEX IF EXISTS %I',
            history_table_name || '_sys_period');
        EXECUTE format('DROP INDEX IF EXISTS %I',
            history_table_name || '_exec_transaction_id');

        -- Remove from created table log
        DELETE FROM catmaid_history_table cht WHERE cht.live_table = $1;
    END;
    $$;

    CREATE OR REPLACE FUNCTION drop_history_table(live_table regclass)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE

        -- This will contain the name of the newly created history table. No
        -- regclass is used, because the implicit table existence check on variable
        -- assignment can fail if the table has already been removed by an
        -- cascaded table drop.
        history_table_name text;

    BEGIN

        PERFORM drop_history_table_keep_data(live_table);

        -- History tables will be named like the live table plus a '__history' suffix
        history_table_name = get_history_table_name(live_table);

        -- Cascading deleting is used to also delete child tables and triggers.
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE',
            get_tracking_table_name(live_table));
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', history_table_name);
    END;
    $$;


    -- We are going to rewrite some table later and add some missing foreign key
    -- constraint in a second step. Due to missing constraints in the past, it
    -- is possible that there is inconsistent data by meanns of references to
    -- data that doesn't exist (anymore). This data is now removed so that the
    -- new constraints can expect consistent data. This is safe for the tables
    -- we work with below:
    --
    -- Remove all reviews that reference non-existent treenodes.
    DELETE FROM review WHERE id IN (
        SELECT r.id FROM review r
        LEFT JOIN treenode t
            ON t.id = r.treenode_id
        WHERE t.id IS NULL
    );
"""

backward_prepare = """
    -- Remove an existing history table for the passed in table
    CREATE OR REPLACE FUNCTION drop_history_table(live_table regclass)
    RETURNS void
    LANGUAGE plpgsql AS
    $$
    DECLARE

        -- This will contain the name of the newly created history table. No
        -- regclass is used, because the implicit table existence check on variable
        -- assignment can fail if the table has already been removed by an
        -- cascaded table drop.
        history_table_name text;

    BEGIN

        -- History tables will be named like the live table plus a '__history' suffix
        history_table_name = get_history_table_name(live_table);

        -- Cascading deleting is used to also delete child tables and triggers.
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', history_table_name);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_tracking_table_update_trigger_name(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_tracking_table_truncate_trigger_name(), live_table);
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE',
            get_tracking_table_name(live_table));

        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_regular(), live_table);
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_update_trigger_name_tracking(), live_table);
        EXECUTE format('DROP FUNCTION IF EXISTS %s() CASCADE',
            get_history_update_fn_name_regular(live_table));
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s',
            get_history_truncate_trigger_name(), live_table);

        -- Remove from created table log
        DELETE FROM catmaid_history_table cht WHERE cht.live_table = $1;
    END;
    $$;
    DROP FUNCTION drop_history_table_keep_data(live_table regclass);
"""


forward = """
    BEGIN;

    CREATE TEMPORARY TABLE temp_versioned_catmaid_table (
        name text,
        time_column text DEFAULT NULL,
        txid_column text DEFAULT NULL
    ) ON COMMIT DROP;
    INSERT INTO temp_versioned_catmaid_table (VALUES
        ('cardinality_restriction', 'edition_time', 'txid'),
        ('change_request', 'edition_time', 'txid'),
        ('class', 'edition_time', 'txid'),
        ('class_class', 'edition_time', 'txid'),
        ('class_instance', 'edition_time', 'txid'),
        ('class_instance_class_instance', 'edition_time', 'txid'),
        ('concept', 'edition_time', 'txid'),
        ('connector_class_instance', 'edition_time', 'txid'),
        ('region_of_interest_class_instance', 'edition_time', 'txid'),
        ('relation', 'edition_time', 'txid'),
        ('relation_instance', 'edition_time', 'txid'),
        ('restriction', 'edition_time', 'txid'),
        ('point_connector', 'edition_time', 'txid'),
        ('point_class_instance', 'edition_time', 'txid'),
        ('skeleton_origin', 'edition_time', 'txid'),
        ('stack_class_instance', 'edition_time', 'txid'),
        ('stack_group_class_instance', 'edition_time', 'txid'),
        ('treenode_class_instance', 'edition_time', 'txid'),
        ('treenode_connector', 'edition_time', 'txid'),
        ('volume_class_instance', 'edition_time', 'txid'),

        ('catmaid_sampler', NULL, NULL),
        ('review', 'review_time', 'txid'),
        ('treenode', 'edition_time', 'txid')
    );


    -- Disable history for all tables affected by this change.
    SELECT disable_history_tracking_for_table(name::regclass,
        get_history_table_name(name::regclass))
    FROM temp_versioned_catmaid_table;


    -- Disable history views for all tables affected by this change.
    SELECT drop_history_view_for_table(name::regclass)
    FROM temp_versioned_catmaid_table;


    -- Drop history tracking infrastructure, but keep history tables.
    SELECT drop_history_table_keep_data(name::regclass)
    FROM temp_versioned_catmaid_table;


    -- Append _old suffix to current concept tables

    ALTER TABLE concept RENAME TO concept_old;
    ALTER TABLE change_request RENAME TO change_request_old;
    ALTER TABLE class RENAME TO class_old;
    ALTER TABLE class_instance RENAME TO class_instance_old;
    ALTER TABLE log RENAME TO log_old;
    ALTER TABLE relation RENAME TO relation_old;
    ALTER TABLE relation_instance RENAME TO relation_instance_old;
    ALTER TABLE restriction RENAME TO restriction_old;

    ALTER TABLE class_class RENAME TO class_class_old;
    ALTER TABLE class_instance_class_instance RENAME TO class_instance_class_instance_old;
    ALTER TABLE connector_class_instance RENAME TO connector_class_instance_old;
    ALTER TABLE point_class_instance RENAME TO point_class_instance_old;
    ALTER TABLE point_connector RENAME TO point_connector_old;
    ALTER TABLE region_of_interest_class_instance RENAME TO region_of_interest_class_instance_old;
    ALTER TABLE skeleton_origin RENAME TO skeleton_origin_old;
    ALTER TABLE stack_class_instance RENAME TO stack_class_instance_old;
    ALTER TABLE stack_group_class_instance RENAME TO stack_group_class_instance_old;
    ALTER TABLE treenode_class_instance RENAME TO treenode_class_instance_old;
    ALTER TABLE treenode_connector RENAME TO treenode_connector_old;
    ALTER TABLE volume_class_instance RENAME TO volume_class_instance_old;

    ALTER TABLE cardinality_restriction RENAME TO cardinality_restriction_old;


    -- Append _old suffix to tables that reference concept tables.

    ALTER TABLE catmaid_sampler RENAME TO catmaid_sampler_old;
    ALTER TABLE catmaid_skeleton_summary RENAME TO catmaid_skeleton_summary_old;
    ALTER TABLE review RENAME TO review_old;
    ALTER TABLE treenode RENAME TO treenode_old;


    -- This is needed, becasue we want to create a constraint with this name
    -- (according to the old schema).
    ALTER INDEX stack_class_instance_pkey RENAME TO stack_class_instance_pkey_old;


    -- Append _old suffix to history tables of current concept tables (log
    -- doesn't have any at the moment).

    ALTER TABLE concept__history RENAME TO concept__history_old;
    ALTER TABLE change_request__history RENAME TO change_request__history_old;
    ALTER TABLE class__history RENAME TO class__history_old;
    ALTER TABLE class_instance__history RENAME TO class_instance__history_old;
    ALTER TABLE relation__history RENAME TO relation__history_old;
    ALTER TABLE relation_instance__history RENAME TO relation_instance__history_old;
    ALTER TABLE restriction__history RENAME TO restriction__history_old;

    ALTER TABLE class_class__history RENAME TO class_class__history_old;
    ALTER TABLE class_instance_class_instance__history RENAME TO class_instance_class_instance__history_old;
    ALTER TABLE connector_class_instance__history RENAME TO connector_class_instance__history_old;
    ALTER TABLE point_class_instance__history RENAME TO point_class_instance__history_old;
    ALTER TABLE point_connector__history RENAME TO point_connector__history_old;
    ALTER TABLE region_of_interest_class_instance__history RENAME TO region_of_interest_class_instance__history_old;
    ALTER TABLE skeleton_origin__history RENAME TO skeleton_origin__history_old;
    ALTER TABLE stack_class_instance__history RENAME TO stack_class_instance__history_old;
    ALTER TABLE stack_group_class_instance__history RENAME TO stack_group_class_instance__history_old;
    ALTER TABLE treenode_class_instance__history RENAME TO treenode_class_instance__history_old;
    ALTER TABLE treenode_connector__history RENAME TO treenode_connector__history_old;
    ALTER TABLE volume_class_instance__history RENAME TO volume_class_instance__history_old;

    ALTER TABLE cardinality_restriction__history RENAME TO cardinality_restriction__history_old;


    -- Note: the history table dictionary (catmaid_history_table) doesn't need
    -- to be updated, because it references tables as regclass objects. This
    -- the name change to the tables doesn't change the stored reference.


    -- Append _old suffix to history tables of table that reference concept
    -- tables.

    ALTER TABLE catmaid_sampler__history RENAME TO catmaid_sampler__history_old;
    ALTER TABLE review__history RENAME TO review__history_old;
    ALTER TABLE treenode__history RENAME TO treenode__history_old;


    -- Alter constraint names. This is needed, because constraint names need to
    -- be globally unique and we want to create new versions of these.

    ALTER TABLE change_request_old RENAME CONSTRAINT change_request_project_id_fkey TO change_request_project_id_fkey_old;
    ALTER TABLE change_request_old RENAME CONSTRAINT change_request_user_id_fkey TO change_request_user_id_fkey_old;

    -- Rename sequences, so that new ones can be created below.
    ALTER SEQUENCE concept_id_seq RENAME TO condept_id_seq_old;
    ALTER SEQUENCE catmaid_sampler_id_seq RENAME TO catmaid_sampler_id_seq_old;
    ALTER SEQUENCE review_id_seq RENAME TO review_id_seq_old;


    -- Create new concept table hierarchy using bigint IDs and optimal table
    -- ordering to avoid wasting space.

    CREATE TABLE concept (
        id bigint NOT NULL,
        user_id integer NOT NULL,
        project_id integer NOT NULL,
        creation_time timestamp with time zone DEFAULT now() NOT NULL,
        edition_time timestamp with time zone DEFAULT now() NOT NULL,
        txid bigint DEFAULT txid_current() NOT NULL,

        CONSTRAINT concept_id_pkey PRIMARY KEY (id),
        CONSTRAINT concept_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT concept_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    );

    -- The sequence already works with bigint, just make sure it is owned by the
    -- new table.
    CREATE SEQUENCE concept_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;
    ALTER SEQUENCE concept_id_seq OWNED BY concept.id;
    ALTER TABLE ONLY concept ALTER COLUMN id
        SET DEFAULT nextval('concept_id_seq'::regclass);


    CREATE TABLE class (
        class_name text NOT NULL,
        description text,

        CONSTRAINT class_id_pkey PRIMARY KEY (id) INCLUDE (project_id, class_name),
        CONSTRAINT class_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (concept);
    ALTER TABLE ONLY class ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE log (
        operation_type character varying(255) NOT NULL,
        location float3d,
        freetext text,

        CONSTRAINT log_id_pkey PRIMARY KEY (id),
        CONSTRAINT log_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT log_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (concept);
    ALTER TABLE ONLY log ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE relation (
        relation_name character varying(255) NOT NULL,
        uri text,
        description text,
        isreciprocal boolean DEFAULT false NOT NULL,

        CONSTRAINT relation_id_pkey PRIMARY KEY (id) INCLUDE (project_id, relation_name),
        CONSTRAINT relation_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT relation_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (concept);
    ALTER TABLE ONLY relation ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE relation_instance (
        relation_id bigint NOT NULL,

        CONSTRAINT relation_instance_id_pkey PRIMARY KEY (id),
        CONSTRAINT relation_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT relation_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT relation_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (concept);
    ALTER TABLE ONLY relation_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE class_class (
        class_a bigint NOT NULL,
        class_b bigint NOT NULL,

        CONSTRAINT class_class_id_pkey PRIMARY KEY (id),
        CONSTRAINT class_class_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_class_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_class_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_class_class_a_fkey FOREIGN KEY (class_a)
            REFERENCES class(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_class_class_b_fkey FOREIGN KEY (class_b)
            REFERENCES class(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY class_class ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE restriction (
        enabled boolean DEFAULT true NOT NULL,
        restricted_link_id bigint NOT NULL,

        CONSTRAINT restriction_id_pkey PRIMARY KEY (id),
        CONSTRAINT restriction_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT restriction_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT restriction_restricted_link_id_fkey FOREIGN KEY (restricted_link_id)
            REFERENCES class_class(id)
    )
    INHERITS (concept);
    ALTER TABLE ONLY restriction ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE class_instance (
        class_id bigint NOT NULL,
        name character varying(255) NOT NULL,

        CONSTRAINT class_instance_id_pkey PRIMARY KEY (id) INCLUDE (class_id, project_id),
        CONSTRAINT class_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_class_id_fkey FOREIGN KEY (class_id)
            REFERENCES class(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (concept);
    ALTER TABLE ONLY class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE class_instance_class_instance (
        class_instance_a bigint NOT NULL,
        class_instance_b bigint NOT NULL,

        CONSTRAINT class_instance_class_instance_id_pkey PRIMARY KEY (id),
        CONSTRAINT class_instance_class_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_class_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_class_instance_class_instance_a_fkey FOREIGN KEY (class_instance_a)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_class_instance_class_instance_b_fkey FOREIGN KEY (class_instance_b)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY class_instance_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE connector_class_instance (
        connector_id bigint NOT NULL,
        class_instance_id bigint NOT NULL,

        CONSTRAINT connector_class_instance_id_pkey PRIMARY KEY (id),
        CONSTRAINT connector_class_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT connector_class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT connector_class_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT connector_class_instance_connector_id_fkey FOREIGN KEY (connector_id)
            REFERENCES connector(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT connector_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY connector_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE point_class_instance (
        point_id bigint NOT NULL,
        class_instance_id bigint NOT NULL,

        CONSTRAINT point_class_instance_id_pkey PRIMARY KEY (id),
        CONSTRAINT point_class_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_class_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_class_instance_point_id_fkey FOREIGN KEY (point_id)
            REFERENCES point(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY point_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE point_connector (
        point_id bigint NOT NULL,
        connector_id bigint NOT NULL,
        confidence smallint DEFAULT 5 NOT NULL,

        CONSTRAINT point_connector_id_pkey PRIMARY KEY (id),
        CONSTRAINT point_connector_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_connector_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_connector_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_connector_point_id_fkey FOREIGN KEY (point_id)
            REFERENCES point(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_connector_connector_id_fkey FOREIGN KEY (connector_id)
            REFERENCES connector(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_connector_project_id_point_id_connector_id_relation_id_uniq
            UNIQUE (project_id, point_id, connector_id, relation_id)
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY point_connector ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE region_of_interest_class_instance (
        region_of_interest_id bigint NOT NULL,
        class_instance_id bigint NOT NULL,

        CONSTRAINT region_of_interest_class_instance_id_pkey PRIMARY KEY (id),
        CONSTRAINT region_of_interest_class_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT region_of_interest_class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT region_of_interest_class_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT region_of_interest_class_instance_region_of_interest_id_fkey FOREIGN KEY (region_of_interest_id)
            REFERENCES region_of_interest(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT region_of_interest_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY region_of_interest_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE skeleton_origin (
        id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id int REFERENCES auth_user (id) NOT NULL,
        project_id int REFERENCES project(id) ON DELETE CASCADE NOT NULL,
        creation_time timestamptz NOT NULL DEFAULT now(),
        edition_time timestamptz NOT NULL DEFAULT now(),
        skeleton_id bigint REFERENCES class_instance(id) ON DELETE CASCADE NOT NULL,
        data_source_id integer REFERENCES data_source(id) ON DELETE CASCADE NOT NULL,
        source_id bigint NOT NULL,
        txid bigint DEFAULT txid_current(),
        source_type skeleton_origin_source_type
    );

    CREATE TABLE stack_class_instance (
        class_instance_id bigint NOT NULL,
        stack_id integer NOT NULL,

        CONSTRAINT stack_class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT stack_class_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT stack_class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT stack_class_instance_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT stack_class_instance_stack_id_fkey FOREIGN KEY (stack_id)
            REFERENCES stack(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT stack_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY stack_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE stack_group_class_instance (
        class_instance_id bigint NOT NULL,
        stack_group_id integer NOT NULL,

        CONSTRAINT stack_group_class_instance_id_pkey PRIMARY KEY (id),
        CONSTRAINT stack_group_class_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT stack_group_class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT stack_group_class_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT stack_group_class_instance_stack_group_id_fkey FOREIGN KEY (stack_group_id)
            REFERENCES stack_group(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT stack_group_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY stack_group_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE treenode (
        skeleton_id bigint NOT NULL,
        parent_id bigint,
        radius real DEFAULT 0 NOT NULL,
        confidence smallint DEFAULT 5 NOT NULL,

        CONSTRAINT treenode_id_pkey PRIMARY KEY (id),
        CONSTRAINT treenode_editor_id_fkey FOREIGN KEY (editor_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_skeleton_id_fkey FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_parent_id_fkey FOREIGN KEY (parent_id)
            REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (location);
    ALTER TABLE ONLY treenode ALTER COLUMN id SET DEFAULT nextval('location_id_seq'::regclass);

    CREATE TABLE change_request (
        type character varying(32) NOT NULL,
        description text NOT NULL,
        status integer NOT NULL,
        recipient_id integer NOT NULL,
        location float3d NOT NULL,
        treenode_id bigint,
        connector_id bigint,
        validate_action text NOT NULL,
        approve_action text NOT NULL,
        reject_action text NOT NULL,
        completion_time timestamp with time zone,

        CONSTRAINT change_request_id_pkey PRIMARY KEY (id),
        CONSTRAINT change_request_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT change_request_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT change_request_connector_id_fkey FOREIGN KEY (connector_id)
            REFERENCES connector(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT change_request_treenode_id_fkey FOREIGN KEY (treenode_id)
            REFERENCES treenode(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT change_request_recipient_id_fkey FOREIGN KEY (recipient_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (concept);

    CREATE TABLE treenode_class_instance (
        treenode_id bigint NOT NULL,
        class_instance_id bigint NOT NULL,

        CONSTRAINT treenode_class_instance_id_pkey PRIMARY KEY (id),
        CONSTRAINT treenode_class_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_class_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_class_instance_treenode_id_fkey FOREIGN KEY (treenode_id)
            REFERENCES treenode(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY treenode_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE treenode_connector (
        treenode_id bigint NOT NULL,
        connector_id bigint NOT NULL,
        skeleton_id bigint NOT NULL,
        confidence smallint DEFAULT 5 NOT NULL,

        CONSTRAINT treenode_connector_id_pkey PRIMARY KEY (id),
        CONSTRAINT treenode_connector_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_connector_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_connector_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_connector_treenode_id_fkey FOREIGN KEY (treenode_id)
            REFERENCES treenode(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_connector_connector_id_fkey FOREIGN KEY (connector_id)
            REFERENCES connector(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_connector_skeleton_id_fkey FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_connector_project_id_treenode_id_connector_id_relation_id
            UNIQUE (project_id, treenode_id, connector_id, relation_id)
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY treenode_connector ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE volume_class_instance (
        volume_id bigint NOT NULL,
        class_instance_id bigint NOT NULL,

        CONSTRAINT volume_class_instance_id_pkey PRIMARY KEY (id),
        CONSTRAINT volume_class_instance_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT volume_class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT volume_class_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT volume_class_instance_volume_id_fkey FOREIGN KEY (volume_id)
            REFERENCES catmaid_volume(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT volume_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY volume_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE cardinality_restriction (
        cardinality_type integer NOT NULL,
        value integer NOT NULL,

        CONSTRAINT cardinality_restriction_id_pkey PRIMARY KEY (id),
        CONSTRAINT cardinality_restriction_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (restriction);
    ALTER TABLE ONLY cardinality_restriction ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


    -- Create new tables for data that references the concept table hierarchy.

    CREATE TABLE catmaid_sampler (
        id bigint NOT NULL,
        creation_time timestamp with time zone NOT NULL,
        edition_time timestamp with time zone NOT NULL,
        interval_length double precision NOT NULL,
        project_id integer NOT NULL,
        sampler_state_id integer NOT NULL,
        skeleton_id bigint NOT NULL,
        user_id integer NOT NULL,
        interval_error double precision NOT NULL,
        merge_limit real DEFAULT 0 NOT NULL,
        review_required boolean NOT NULL,
        create_interval_boundaries boolean NOT NULL,
        leaf_segment_handling text NOT NULL,

        CONSTRAINT catmaid_sampler_id_pkey PRIMARY KEY (id),
        CONSTRAINT catmaid_sampler_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT catmaid_sampler_skeleton_id_fkey FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT catmaid_sampler_sampler_state_id_fkey FOREIGN KEY (sampler_state_id)
            REFERENCES catmaid_samplerstate(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT catmaid_sampler_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED
    );

    -- The sequence already works with bigint, just make sure it is owned by the
    -- new table.
    CREATE SEQUENCE catmaid_sampler_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;
    ALTER SEQUENCE catmaid_sampler_id_seq OWNED BY catmaid_sampler.id;
    ALTER TABLE ONLY catmaid_sampler ALTER COLUMN id
        SET DEFAULT nextval('catmaid_sampler_id_seq'::regclass);

    CREATE TABLE catmaid_skeleton_summary (
        skeleton_id bigint NOT NULL,
        project_id integer NOT NULL,
        last_summary_update timestamp with time zone NOT NULL,
        original_creation_time timestamp with time zone NOT NULL,
        last_edition_time timestamp with time zone NOT NULL,
        num_nodes integer DEFAULT 0 NOT NULL,
        cable_length double precision DEFAULT 0 NOT NULL,
        last_editor_id integer NOT NULL,
        num_imported_nodes bigint DEFAULT 0 NOT NULL,

        CONSTRAINT catmaid_skeleton_id_pkey PRIMARY KEY (skeleton_id) INCLUDE (num_nodes),
        CONSTRAINT catmaid_skeleton_summary_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT catmaid_skeleton_summary_skeleton_id_fkey FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT catmaid_skeleton_summary_last_editor_id_fkey FOREIGN KEY (last_editor_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED
    );

    CREATE TABLE review (
        id bigint NOT NULL,
        project_id integer NOT NULL,
        reviewer_id integer NOT NULL,
        review_time timestamp with time zone DEFAULT now() NOT NULL,
        skeleton_id bigint NOT NULL,
        treenode_id bigint NOT NULL,
        txid bigint DEFAULT txid_current() NOT NULL,

        CONSTRAINT review_id_pkey PRIMARY KEY (id),
        CONSTRAINT review_user_id_fkey FOREIGN KEY (reviewer_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT review_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT review_treenode_id_fkey FOREIGN KEY (treenode_id)
            REFERENCES treenode(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT review_skeleton_id_fkey FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    );

    -- The sequence already works with bigint, just make sure it is owned by the
    -- new table.
    CREATE SEQUENCE review_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;
    ALTER SEQUENCE review_id_seq OWNED BY review.id;
    ALTER TABLE ONLY review ALTER COLUMN id
        SET DEFAULT nextval('review_id_seq'::regclass);


    -- Insert data into main tables. Indices are added purposfully after that,
    -- because it is faster to generate the new indices once rather than upating
    -- them many times.

    INSERT INTO concept (id, user_id, project_id, creation_time, edition_time, txid)
    SELECT id, user_id, project_id, creation_time, edition_time, txid
    FROM ONLY concept_old;

    INSERT INTO class (id, user_id, creation_time, edition_time, project_id,
        txid, class_name, description)
    SELECT id, user_id, creation_time, edition_time, project_id,
        txid, class_name, description
    FROM ONLY class_old;

    INSERT INTO class_instance (id, user_id, creation_time, edition_time,
        project_id, txid, class_id, name)
    SELECT id, user_id, creation_time, edition_time,
        project_id, txid, class_id, name
    FROM ONLY class_instance_old;

    INSERT INTO log (id, user_id, creation_time, edition_time, project_id, txid,
        operation_type, location, freetext)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        operation_type, location, freetext
    FROM ONLY log_old;

    INSERT INTO relation (id, user_id, creation_time, edition_time, project_id,
        txid, relation_name, uri, description, isreciprocal)
    SELECT id, user_id, creation_time, edition_time, project_id,
        txid, relation_name, uri, description, isreciprocal
    FROM ONLY relation_old;

    INSERT INTO relation_instance (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id)
    SELECT id, user_id, creation_time, edition_time,
        project_id, txid, relation_id
    FROM ONLY relation_instance_old;

    INSERT INTO restriction (id, user_id, creation_time, edition_time,
        project_id, txid, enabled, restricted_link_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid, enabled,
        restricted_link_id
    FROM ONLY restriction_old;

    INSERT INTO class_class (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, class_a, class_b)
    SELECT id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, class_a, class_b
    FROM ONLY class_class_old;

    INSERT INTO class_instance_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, class_instance_a,
        class_instance_b)
    SELECT id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, class_instance_a,
        class_instance_b
    FROM ONLY class_instance_class_instance_old;

    INSERT INTO connector_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, connector_id,
        class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, connector_id, class_instance_id
    FROM ONLY connector_class_instance_old;

    INSERT INTO point_class_instance (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, point_id, class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, point_id, class_instance_id
    FROM ONLY point_class_instance_old;

    INSERT INTO point_connector (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, point_id, connector_id, confidence)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, point_id, connector_id, confidence
    FROM ONLY point_connector_old;

    INSERT INTO region_of_interest_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, region_of_interest_id,
        class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, region_of_interest_id, class_instance_id
    FROM ONLY region_of_interest_class_instance_old;

    INSERT INTO skeleton_origin (id, user_id, creation_time, edition_time,
        project_id, txid, skeleton_id, data_source_id, source_id, source_type)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        skeleton_id, data_source_id, source_id, source_type
    FROM ONLY skeleton_origin_old;

    INSERT INTO stack_class_instance (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, stack_id, class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, stack_id, class_instance_id
    FROM ONLY stack_class_instance_old;

    INSERT INTO stack_group_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, stack_group_id,
        class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, stack_group_id, class_instance_id
    FROM ONLY stack_group_class_instance_old;

    INSERT INTO treenode (id, project_id, location_x, location_y, location_z,
        editor_id, user_id, creation_time, edition_time, txid, skeleton_id,
        radius, confidence, parent_id)
    SELECT id, project_id, location_x, location_y, location_z,
        editor_id, user_id, creation_time, edition_time, txid, skeleton_id,
        radius, confidence, parent_id
    FROM ONLY treenode_old;

    INSERT INTO change_request (id, user_id, creation_time, edition_time,
        project_id, txid, type, description, status, recipient_id, location,
        treenode_id, connector_id, validate_action, approve_action,
        reject_action, completion_time)
    SELECT id, user_id, creation_time, edition_time, project_id, txid, type,
        description, status, recipient_id, location, treenode_id, connector_id,
        validate_action, approve_action, reject_action, completion_time
    FROM ONLY change_request_old;

    INSERT INTO treenode_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, treenode_id, class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, treenode_id, class_instance_id
    FROM ONLY treenode_class_instance_old;

    INSERT INTO treenode_connector (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, treenode_id, connector_id, skeleton_id,
        confidence)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, treenode_id, connector_id, skeleton_id, confidence
    FROM ONLY treenode_connector_old;

    INSERT INTO volume_class_instance (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, volume_id, class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, volume_id, class_instance_id
    FROM ONLY volume_class_instance_old;

    INSERT INTO cardinality_restriction (id, user_id, creation_time,
        edition_time, project_id, txid, enabled, restricted_link_id,
        cardinality_type, value)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        enabled, restricted_link_id, cardinality_type, value
    FROM ONLY cardinality_restriction_old;

    INSERT INTO catmaid_sampler (id, creation_time, edition_time,
        interval_length, review_required, project_id, sampler_state_id,
        skeleton_id, user_id, create_interval_boundaries, interval_error,
        leaf_segment_handling, merge_limit)
    SELECT id, creation_time, edition_time, interval_length, review_required,
        project_id, sampler_state_id, skeleton_id, user_id,
        create_interval_boundaries, interval_error, leaf_segment_handling,
        merge_limit
    FROM ONLY catmaid_sampler_old;

    INSERT INTO catmaid_skeleton_summary (skeleton_id, project_id,
        last_summary_update, original_creation_time, last_edition_time,
        num_nodes, cable_length, last_editor_id)
    SELECT skeleton_id, project_id, last_summary_update, original_creation_time,
        last_edition_time, num_nodes, cable_length, last_editor_id
    FROM ONLY catmaid_skeleton_summary_old;

    INSERT INTO review (id, project_id, reviewer_id, review_time, skeleton_id,
        treenode_id, txid)
    SELECT id, project_id, reviewer_id, review_time, skeleton_id, treenode_id,
        txid
    FROM ONLY review_old;


    -- Create history tables for all new tables, including the triggers

    SELECT create_history_table(name::regclass, time_column, txid_column)
    FROM temp_versioned_catmaid_table;
    SELECT create_history_view_for_table(name::regclass)
    FROM temp_versioned_catmaid_table;


    -- Insert data into history tables

    INSERT INTO concept__history (id, user_id, project_id, creation_time,
        edition_time, txid, sys_period, exec_transaction_id)
    SELECT id, user_id, project_id, creation_time, edition_time, txid,
        sys_period, exec_transaction_id
    FROM ONLY concept__history_old;

    INSERT INTO change_request__history (id, user_id, creation_time, edition_time,
        project_id, txid, type, description, status, recipient_id, location,
        treenode_id, connector_id, validate_action, approve_action,
        reject_action, completion_time, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid, type,
        description, status, recipient_id, location, treenode_id, connector_id,
        validate_action, approve_action, reject_action, completion_time,
        sys_period, exec_transaction_id
    FROM ONLY change_request__history_old;

    INSERT INTO class__history (id, user_id, creation_time, edition_time, project_id,
        txid, class_name, description, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id,
        txid, class_name, description, sys_period, exec_transaction_id
    FROM ONLY class__history_old;

    INSERT INTO class_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, class_id, name, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time,
        project_id, txid, class_id, name, sys_period, exec_transaction_id
    FROM ONLY class_instance__history_old;

    INSERT INTO relation__history (id, user_id, creation_time, edition_time, project_id,
        txid, relation_name, uri, description, isreciprocal, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_name, uri, description, isreciprocal, sys_period,
        exec_transaction_id
    FROM ONLY relation__history_old;

    INSERT INTO relation_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, sys_period, exec_transaction_id
    FROM ONLY relation_instance__history_old;

    INSERT INTO restriction__history (id, user_id, creation_time, edition_time,
        project_id, txid, enabled, restricted_link_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid, enabled,
        restricted_link_id, sys_period, exec_transaction_id
    FROM ONLY restriction__history_old;

    INSERT INTO class_class__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, class_a, class_b, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, class_a, class_b, sys_period, exec_transaction_id
    FROM ONLY class_class__history_old;

    INSERT INTO class_instance_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, class_instance_a,
        class_instance_b, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, class_instance_a,
        class_instance_b, sys_period, exec_transaction_id
    FROM ONLY class_instance_class_instance__history_old;

    INSERT INTO connector_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, connector_id,
        class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, connector_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY connector_class_instance__history_old;

    INSERT INTO point_class_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, point_id, class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, point_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY point_class_instance__history_old;

    INSERT INTO point_connector__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, point_id, connector_id, confidence, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, point_id, connector_id, confidence, sys_period,
        exec_transaction_id
    FROM ONLY point_connector__history_old;

    INSERT INTO region_of_interest_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, region_of_interest_id,
        class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, region_of_interest_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY region_of_interest_class_instance__history_old;

    INSERT INTO skeleton_origin__history (id, user_id, creation_time,
        edition_time, project_id, txid, skeleton_id, data_source_id, source_id,
        source_type, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        skeleton_id, data_source_id, source_id, source_type, sys_period,
        exec_transaction_id
    FROM ONLY skeleton_origin__history_old;

    INSERT INTO stack_class_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, stack_id, class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, stack_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY stack_class_instance__history_old;

    INSERT INTO stack_group_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, stack_group_id,
        class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, stack_group_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY stack_group_class_instance__history_old;

    INSERT INTO treenode_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, treenode_id, class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, treenode_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY treenode_class_instance__history_old;

    INSERT INTO treenode_connector__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, treenode_id, connector_id, skeleton_id,
        confidence, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, treenode_id, connector_id, skeleton_id, confidence,
        sys_period, exec_transaction_id
    FROM ONLY treenode_connector__history_old;

    INSERT INTO volume_class_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, volume_id, class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, volume_id, class_instance_id, sys_period, exec_transaction_id
    FROM ONLY volume_class_instance__history_old;

    INSERT INTO cardinality_restriction__history (id, user_id, creation_time,
        edition_time, project_id, txid, enabled, restricted_link_id,
        cardinality_type, value, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        enabled, restricted_link_id, cardinality_type, value, sys_period,
        exec_transaction_id
    FROM ONLY cardinality_restriction__history_old;

    INSERT INTO catmaid_sampler__history (id, creation_time, edition_time,
        interval_length, review_required, project_id, sampler_state_id,
        skeleton_id, user_id, create_interval_boundaries, interval_error,
        leaf_segment_handling, merge_limit)
    SELECT id, creation_time, edition_time, interval_length, review_required,
        project_id, sampler_state_id, skeleton_id, user_id,
        create_interval_boundaries, interval_error, leaf_segment_handling,
        merge_limit
    FROM ONLY catmaid_sampler__history_old;

    INSERT INTO review__history (id, project_id, reviewer_id, review_time,
        skeleton_id, treenode_id, txid)
    SELECT id, project_id, reviewer_id, review_time, skeleton_id, treenode_id,
        txid
    FROM ONLY review__history_old;

    INSERT INTO treenode__history (id, project_id, location_x, location_y,
        location_z, editor_id, user_id, creation_time, edition_time, txid,
        skeleton_id, radius, confidence, parent_id)
    SELECT id, project_id, location_x, location_y, location_z,
        editor_id, user_id, creation_time, edition_time, txid, skeleton_id,
        radius, confidence, parent_id
    FROM ONLY treenode__history_old;


    -- Update foreign keys to non-concept tables from non-concept tables (e.g.
    -- treenode).

    ALTER TABLE catmaid_samplerdomain DROP CONSTRAINT IF EXISTS
        catmaid_samplerdomain_sampler_id_ed4aa3f0_fk_catmaid_sampler_id;
    ALTER TABLE catmaid_samplerdomain ADD CONSTRAINT catmaid_samplerdomain_sampler_id_fkey
        FOREIGN KEY (sampler_id) REFERENCES catmaid_sampler(id);

    ALTER TABLE catmaid_samplerdomain DROP CONSTRAINT IF EXISTS
        catmaid_samplerdomain_start_node_id_4ae2c16c_fk_treenode_id;
    ALTER TABLE catmaid_samplerdomain ADD CONSTRAINT catmaid_samplerdomain_start_node_id_fkey
        FOREIGN KEY (start_node_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_samplerdomainend DROP CONSTRAINT IF EXISTS
        catmaid_samplerdomainend_end_node_id_31859f80_fk_treenode_id;
    ALTER TABLE catmaid_samplerdomainend ADD CONSTRAINT catmaid_samplerdomainend_end_node_id_fkey
        FOREIGN KEY (end_node_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_samplerinterval DROP CONSTRAINT IF EXISTS
        catmaid_samplerinterval_end_node_id_c82f43df_fk_treenode_id;
    ALTER TABLE catmaid_samplerinterval ADD CONSTRAINT catmaid_samplerinterval_end_node_id_fkey
        FOREIGN KEY (end_node_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_samplerinterval DROP CONSTRAINT IF EXISTS
        catmaid_samplerinterval_start_node_id_ead5c637_fk_treenode_id;
    ALTER TABLE catmaid_samplerinterval ADD CONSTRAINT catmaid_samplerinterval_start_node_id_fkey
        FOREIGN KEY (start_node_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE suppressed_virtual_treenode DROP CONSTRAINT IF EXISTS
        child_id_refs_id_93bf2222;
    ALTER TABLE suppressed_virtual_treenode DROP CONSTRAINT IF EXISTS
        suppressed_vnodes_child_id_refs_id;
    ALTER TABLE suppressed_virtual_treenode ADD CONSTRAINT suppressed_virtual_treenode_child_id_fkey
        FOREIGN KEY (child_id) REFERENCES treenode(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


    -- Drop and recreate table specific functions
    DROP FUNCTION check_treenode_connector_related_reviews(treenode_connector_old);

    CREATE FUNCTION check_treenode_connector_related_reviews(tc treenode_connector) RETURNS void
        LANGUAGE plpgsql
        AS $$BEGIN
            -- Mark linked treenodes as unreviewed. If relation is postsynaptic,
            -- mark only one, otherwise mark all treenodes related to connector.
            IF EXISTS (SELECT 1
                         FROM relation
                         WHERE id = tc.relation_id
                           AND relation_name = 'postsynaptic_to') THEN
              DELETE FROM review WHERE treenode_id = tc.treenode_id;
            ELSE
              DELETE FROM review r
                USING treenode_connector tc2
                WHERE r.treenode_id = tc2.treenode_id
                  AND tc2.connector_id = tc.connector_id;
            END IF;
        END;
        $$;


    -- History triggers are already enabled, add all other triggers. Not all
    -- tables had on_edit triggers before. Only those that were there before are
    -- recreated.
    CREATE TRIGGER on_edit_concept BEFORE UPDATE ON concept FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_change_request BEFORE UPDATE ON change_request FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_class BEFORE UPDATE ON class FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_class_instance BEFORE UPDATE ON class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_relation BEFORE UPDATE ON relation FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_relation_instance BEFORE UPDATE ON relation_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();

    CREATE TRIGGER on_edit_class_class BEFORE UPDATE ON class_class
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_class_instance_class_instance BEFORE UPDATE ON class_instance_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_connector_class_instance BEFORE UPDATE ON connector_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_treenode_class_instance BEFORE UPDATE ON treenode_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_create_treenode_connector_check_review AFTER INSERT ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_create_treenode_connector_check_review();
    CREATE TRIGGER on_delete_treenode_connector_update_edges BEFORE DELETE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_connector_update_edges();
    CREATE TRIGGER on_delete_treenode_connector_check_review AFTER DELETE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_connector_check_review();
    CREATE TRIGGER on_edit_treenode_connector BEFORE UPDATE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_treenode_connector_check_review AFTER UPDATE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_connector_check_review();
    CREATE TRIGGER on_edit_treenode_connector_update_edges
        AFTER UPDATE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_connector_update_edges();
    CREATE TRIGGER on_insert_treenode_connector_update_edges
        AFTER INSERT ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_insert_treenode_connector_update_edges();

    CREATE TRIGGER on_delete_treenode_update_summary_and_edges
        AFTER DELETE ON treenode REFERENCING OLD TABLE as deleted_treenode
        FOR EACH STATEMENT EXECUTE PROCEDURE on_delete_treenode_update_summary_and_edges();
    CREATE TRIGGER on_delete_treenode_update_suppressed_virtual_treenodes
        BEFORE DELETE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_update_suppressed_virtual_treenodes();
    CREATE TRIGGER on_edit_treenode
        BEFORE UPDATE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_treenode_check_review
        AFTER UPDATE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_check_review();
    CREATE TRIGGER on_edit_treenode_update_summary_and_edges
        AFTER UPDATE ON treenode REFERENCING NEW TABLE as new_treenode OLD TABLE as old_treenode
        FOR EACH STATEMENT EXECUTE PROCEDURE on_edit_treenode_update_summary_and_edges();
    CREATE TRIGGER on_edit_treenode_update_suppressed_virtual_treenodes
        AFTER UPDATE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_update_suppressed_virtual_treenodes();
    CREATE TRIGGER on_edit_treenode_update_treenode_connector_edges
        AFTER UPDATE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_update_treenode_connector_edges();
    CREATE TRIGGER on_insert_treenode_update_summary_and_edges
        AFTER INSERT ON treenode REFERENCING NEW TABLE as inserted_treenode
        FOR EACH STATEMENT EXECUTE PROCEDURE on_insert_treenode_update_summary_and_edges();


    -- Create previously non-existant triggers
    CREATE TRIGGER on_edit_point_class_instance BEFORE UPDATE ON point_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_point_connector BEFORE UPDATE ON point_connector
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_stack_class_instance BEFORE UPDATE ON stack_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_stack_group_class_instance BEFORE UPDATE ON stack_group_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_region_of_interest_class_instance BEFORE UPDATE ON region_of_interest_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_volume_class_instance BEFORE UPDATE ON volume_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_cardinality_restrictions BEFORE UPDATE ON cardinality_restriction
        FOR EACH ROW EXECUTE PROCEDURE on_edit();


    -- Drop old tables
    DROP TABLE cardinality_restriction_old;

    DROP TABLE volume_class_instance_old;
    DROP TABLE treenode_connector_old;
    DROP TABLE treenode_class_instance_old;
    DROP TABLE stack_group_class_instance_old;
    DROP TABLE stack_class_instance_old;
    DROP TABLE region_of_interest_class_instance_old;
    DROP TABLE point_connector_old;
    DROP TABLE point_class_instance_old;
    DROP TABLE connector_class_instance_old;
    DROP TABLE skeleton_origin_old;
    DROP TABLE class_instance_class_instance_old;

    DROP TABLE catmaid_sampler_old;
    DROP TABLE catmaid_skeleton_summary_old;
    DROP TABLE review_old;

    DROP TABLE restriction_old;
    DROP TABLE log_old;
    DROP TABLE change_request_old;
    DROP TABLE treenode_old;
    DROP TABLE class_instance_old;
    DROP TABLE class_class_old;
    DROP TABLE relation_instance_old;
    DROP TABLE class_old;

    DROP TABLE relation_old;
    DROP TABLE concept_old;

    -- Drop old history tables
    DROP TABLE change_request__history_old;

    DROP TABLE connector_class_instance__history_old;
    DROP TABLE point_class_instance__history_old;
    DROP TABLE point_connector__history_old;
    DROP TABLE region_of_interest_class_instance__history_old;
    DROP TABLE skeleton_origin__history_old;
    DROP TABLE stack_class_instance__history_old;
    DROP TABLE stack_group_class_instance__history_old;
    DROP TABLE treenode_class_instance__history_old;
    DROP TABLE treenode_connector__history_old;
    DROP TABLE volume_class_instance__history_old;

    DROP TABLE cardinality_restriction__history_old;

    DROP TABLE class_class__history_old;
    DROP TABLE class_instance_class_instance__history_old;

    DROP TABLE catmaid_sampler__history_old;
    DROP TABLE review__history_old;
    DROP TABLE treenode__history_old;

    DROP TABLE class__history_old;
    DROP TABLE class_instance__history_old;
    DROP TABLE relation__history_old;
    DROP TABLE relation_instance__history_old;
    DROP TABLE restriction__history_old;

    DROP TABLE concept__history_old;

    -- Update sequences to most recent ID values
    SELECT setval('concept_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
        FROM concept;
    SELECT setval('review_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
        FROM review;
    SELECT setval('catmaid_sampler_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
        FROM catmaid_sampler;

    COMMIT;
"""

forward_create_indices = """
    CREATE INDEX CONCURRENTLY change_request_connector_id ON change_request USING btree (connector_id);
    CREATE INDEX CONCURRENTLY change_request_recipient_id ON change_request USING btree (recipient_id);
    CREATE INDEX CONCURRENTLY change_request_treenode_id ON change_request USING btree (treenode_id);

    CREATE INDEX CONCURRENTLY class_project_id ON class USING btree (project_id);
    CREATE INDEX CONCURRENTLY class_user_id ON class USING btree (user_id);

    CREATE INDEX CONCURRENTLY class_class_class_a ON class_class USING btree (class_a);
    CREATE INDEX CONCURRENTLY class_class_class_b ON class_class USING btree (class_b);
    CREATE INDEX CONCURRENTLY class_class_project_id ON class_class USING btree (project_id);
    CREATE INDEX CONCURRENTLY class_class_relation_id ON class_class USING btree (relation_id);
    CREATE INDEX CONCURRENTLY class_class_user_id ON class_class USING btree (user_id);

    CREATE INDEX CONCURRENTLY class_instance_class_id ON class_instance USING btree (class_id);
    CREATE INDEX CONCURRENTLY class_instance_name_trgm_idx ON class_instance USING gin (name gin_trgm_ops);
    CREATE INDEX CONCURRENTLY class_instance_project_id ON class_instance USING btree (project_id);
    CREATE INDEX CONCURRENTLY class_instance_user_id ON class_instance USING btree (user_id);
    CREATE INDEX CONCURRENTLY class_instance_upper_name_idx ON class_instance USING btree (upper(name::text));

    CREATE INDEX CONCURRENTLY class_instance_class_instance_class_instance_a ON class_instance_class_instance
        USING btree (class_instance_a) INCLUDE (relation_id, class_instance_b, project_id);
    CREATE INDEX CONCURRENTLY class_instance_class_instance_class_instance_b ON class_instance_class_instance
        USING btree (class_instance_b) INCLUDE (relation_id, class_instance_a, project_id);
    CREATE INDEX CONCURRENTLY class_instance_class_instance_project_id ON class_instance_class_instance
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY class_instance_class_instance_relation_id ON class_instance_class_instance
        USING btree (relation_id);
    CREATE INDEX CONCURRENTLY class_instance_class_instance_user_id ON class_instance_class_instance
        USING btree (user_id);

    CREATE INDEX CONCURRENTLY connector_class_instance_class_instance_id ON connector_class_instance
        USING btree (class_instance_id);
    CREATE INDEX CONCURRENTLY connector_class_instance_project_id ON connector_class_instance
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY connector_class_instance_connector_id ON connector_class_instance
        USING btree (connector_id);
    CREATE INDEX CONCURRENTLY connector_class_instance_relation_id ON connector_class_instance
        USING btree (relation_id);
    CREATE INDEX CONCURRENTLY connector_class_instance_user_id ON connector_class_instance
        USING btree (user_id);

    CREATE INDEX CONCURRENTLY treenode_creation_time_idx ON treenode
        USING btree (creation_time);
    CREATE INDEX CONCURRENTLY treenode_edition_time_idx ON treenode
        USING btree (edition_time);
    CREATE INDEX CONCURRENTLY treenode_project_id_location_x_idx ON treenode
        USING btree (project_id, location_x);
    CREATE INDEX CONCURRENTLY treenode_project_id_location_y_idx ON treenode
        USING btree (project_id, location_y);
    CREATE INDEX CONCURRENTLY treenode_project_id_location_z_idx ON treenode
        USING btree (project_id, location_z);
    CREATE INDEX CONCURRENTLY treenode_parent_id_idx ON treenode
        USING btree (parent_id);
    CREATE INDEX CONCURRENTLY treenode_skeleton_id_project_id_idx ON treenode
        USING btree (skeleton_id, project_id);
    CREATE INDEX CONCURRENTLY treenode_project_id_user_id_idx ON treenode
        USING btree (user_id, project_id);

    CREATE INDEX CONCURRENTLY catmaid_sampler_skeleton_id_idx ON catmaid_sampler
        USING btree (skeleton_id);
    CREATE INDEX CONCURRENTLY catmaid_sampler_project_id_idx ON catmaid_sampler
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY catmaid_sampler_user_id_idx ON catmaid_sampler
        USING btree (user_id);
    CREATE INDEX CONCURRENTLY catmaid_sampler_sampler_state_id_idx ON catmaid_sampler
        USING btree (sampler_state_id);

    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_last_editor_id_idx ON catmaid_skeleton_summary
        USING btree (last_editor_id);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_project_id_idx ON catmaid_skeleton_summary
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_skeleton_id_idx ON catmaid_skeleton_summary
        USING btree (skeleton_id, project_id);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_cable_length_idx ON catmaid_skeleton_summary
        USING btree (cable_length);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_num_nodes_idx ON catmaid_skeleton_summary
        USING btree (num_nodes);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_num_imported_nodes_idx
        ON catmaid_skeleton_summary (num_imported_nodes);

    CREATE INDEX CONCURRENTLY review_project_id_idx ON review USING btree (project_id);
    CREATE INDEX CONCURRENTLY review_review_time_idx ON review USING btree (review_time);
    CREATE INDEX CONCURRENTLY review_reviewer_id_idx ON review USING btree (reviewer_id);
    CREATE INDEX CONCURRENTLY review_skeleton_id_idx ON review USING btree (skeleton_id);
    CREATE INDEX CONCURRENTLY review_treenode_id_idx ON review USING btree (treenode_id);

    CREATE INDEX CONCURRENTLY treenode_class_instance_class_instance_id_idx ON treenode_class_instance
        USING btree (class_instance_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance_project_id_idx ON treenode_class_instance
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance_relation_id_idx ON treenode_class_instance
        USING btree (relation_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance_user_id_idx ON treenode_class_instance
        USING btree (user_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance_treenode_id_idx ON treenode_class_instance
        USING btree (treenode_id);

    CREATE INDEX CONCURRENTLY treenode_connector_connector_id_idx ON treenode_connector
        USING btree (connector_id);
    CREATE INDEX CONCURRENTLY treenode_connector_creation_time_idx_idx ON treenode_connector (creation_time);
    CREATE INDEX CONCURRENTLY treenode_connector_project_id_idx ON treenode_connector
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY treenode_connector_relation_id_idx ON treenode_connector
        USING btree (relation_id);
    CREATE INDEX CONCURRENTLY treenode_connector_skeleton_id_idx ON treenode_connector
        USING btree (skeleton_id);
    CREATE INDEX CONCURRENTLY treenode_connector_treenode_id_idx ON treenode_connector
        USING btree (treenode_id);
    CREATE INDEX CONCURRENTLY treenode_connector_user_id_idx ON treenode_connector
        USING btree (user_id);

    CREATE INDEX CONCURRENTLY skeleton_origin_skeleton_id_idx ON skeleton_origin (skeleton_id);
    CREATE INDEX CONCURRENTLY skeleton_origin_data_source_id_idx ON skeleton_origin (data_source_id);
    CREATE INDEX CONCURRENTLY skeleton_origin_source_id_idx ON skeleton_origin (source_id);

    CREATE INDEX CONCURRENTLY skeleton_origin__history_skeleton_id_idx
        ON skeleton_origin__history (skeleton_id);
    CREATE INDEX CONCURRENTLY skeleton_origin__history_data_source_id_idx
        ON skeleton_origin__history (data_source_id);
    CREATE INDEX CONCURRENTLY skeleton_origin__history_source_id_idx
        ON skeleton_origin__history (source_id);


    -- History indices
    CREATE INDEX CONCURRENTLY treenode__history_creation_time_id_index
        ON treenode__history (creation_time);
    CREATE INDEX CONCURRENTLY treenode__history_skeleton_id_index ON treenode__history (skeleton_id);

    CREATE INDEX CONCURRENTLY treenode_connector__history_skeleton_id_index ON treenode_connector__history (skeleton_id);
    CREATE INDEX CONCURRENTLY review__history_skeleton_id_index ON review__history (skeleton_id);
    CREATE INDEX CONCURRENTLY class_instance_class_instance__history_class_instance_a_index ON class_instance_class_instance__history (class_instance_a);
    CREATE INDEX CONCURRENTLY class_instance_class_instance__history_class_instance_b_index ON class_instance_class_instance__history (class_instance_b);
    CREATE INDEX CONCURRENTLY treenode_class_instance__history_relation_id_index ON treenode_class_instance__history (relation_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance__history_treenode_id_index ON treenode_class_instance__history (treenode_id );


    -- Previously non-existent indexes. They don't need to be dropped in the
    -- backward migration, because the tables are recreated.

    CREATE INDEX CONCURRENTLY class_class_name_idx ON class USING btree (class_name) INCLUDE (id, project_id);
"""


backward_create_indices = """
    CREATE INDEX CONCURRENTLY change_request_connector_id ON change_request USING btree (connector_id);
    CREATE INDEX CONCURRENTLY change_request_recipient_id ON change_request USING btree (recipient_id);
    CREATE INDEX CONCURRENTLY change_request_treenode_id ON change_request USING btree (treenode_id);

    CREATE INDEX CONCURRENTLY class_project_id ON class USING btree (project_id);
    CREATE INDEX CONCURRENTLY class_user_id ON class USING btree (user_id);

    CREATE INDEX CONCURRENTLY class_class_class_a ON class_class USING btree (class_a);
    CREATE INDEX CONCURRENTLY class_class_class_b ON class_class USING btree (class_b);
    CREATE INDEX CONCURRENTLY class_class_project_id ON class_class USING btree (project_id);
    CREATE INDEX CONCURRENTLY class_class_relation_id ON class_class USING btree (relation_id);
    CREATE INDEX CONCURRENTLY class_class_user_id ON class_class USING btree (user_id);

    CREATE INDEX CONCURRENTLY class_instance_class_id ON class_instance USING btree (class_id);
    CREATE INDEX CONCURRENTLY class_instance_name_trgm_idx ON class_instance USING gin (name gin_trgm_ops);
    CREATE INDEX CONCURRENTLY class_instance_project_id ON class_instance USING btree (project_id);
    CREATE INDEX CONCURRENTLY class_instance_user_id ON class_instance USING btree (user_id);
    CREATE INDEX CONCURRENTLY class_instance_upper_name_idx ON class_instance USING btree (upper(name::text));

    CREATE INDEX CONCURRENTLY class_instance_class_instance_class_instance_a ON class_instance_class_instance
        USING btree (class_instance_a);
    CREATE INDEX CONCURRENTLY class_instance_class_instance_class_instance_b ON class_instance_class_instance
        USING btree (class_instance_b);
    CREATE INDEX CONCURRENTLY class_instance_class_instance_project_id ON class_instance_class_instance
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY class_instance_class_instance_relation_id ON class_instance_class_instance
        USING btree (relation_id);
    CREATE INDEX CONCURRENTLY class_instance_class_instance_user_id ON class_instance_class_instance
        USING btree (user_id);

    CREATE INDEX CONCURRENTLY connector_class_instance_class_instance_id ON connector_class_instance
        USING btree (class_instance_id);
    CREATE INDEX CONCURRENTLY connector_class_instance_project_id ON connector_class_instance
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY connector_class_instance_connector_id ON connector_class_instance
        USING btree (connector_id);
    CREATE INDEX CONCURRENTLY connector_class_instance_relation_id ON connector_class_instance
        USING btree (relation_id);
    CREATE INDEX CONCURRENTLY connector_class_instance_user_id ON connector_class_instance
        USING btree (user_id);

    CREATE INDEX CONCURRENTLY treenode_creation_time_index ON treenode
        USING btree (creation_time);
    CREATE INDEX CONCURRENTLY treenode_edition_time_index ON treenode
        USING btree (edition_time);
    CREATE INDEX CONCURRENTLY treenode_location_x_index ON treenode
        USING btree (project_id, location_x);
    CREATE INDEX CONCURRENTLY treenode_location_y_index ON treenode
        USING btree (project_id, location_y);
    CREATE INDEX CONCURRENTLY treenode_location_z_index ON treenode
        USING btree (project_id, location_z);
    CREATE INDEX CONCURRENTLY treenode_parent_id ON treenode
        USING btree (parent_id);
    CREATE INDEX CONCURRENTLY treenode_project_id_skeleton_id_index ON treenode
        USING btree (project_id, skeleton_id);
    CREATE INDEX CONCURRENTLY treenode_skeleton_id_index ON treenode
        USING btree (skeleton_id);
    CREATE INDEX CONCURRENTLY treenode_project_id_user_id_index ON treenode
        USING btree (project_id, user_id);

    CREATE INDEX CONCURRENTLY catmaid_sampler_skeleton_id_dfc98008 ON catmaid_sampler
        USING btree (skeleton_id);
    CREATE INDEX CONCURRENTLY catmaid_sampler_project_id_c93395a7 ON catmaid_sampler
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY catmaid_sampler_user_id_8d1c228f ON catmaid_sampler
        USING btree (user_id);
    CREATE INDEX CONCURRENTLY catmaid_sampler_sampler_state_id_80e7961f ON catmaid_sampler
        USING btree (sampler_state_id);

    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_last_editor_id_idx ON catmaid_skeleton_summary
        USING btree (last_editor_id);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_project_id_7340fa33 ON catmaid_skeleton_summary
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_skeleton_id_idx ON catmaid_skeleton_summary
        USING btree (skeleton_id, project_id);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_cable_length_idx ON catmaid_skeleton_summary
        USING btree (cable_length);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_num_nodes_idx ON catmaid_skeleton_summary
        USING btree (num_nodes);
    CREATE INDEX CONCURRENTLY catmaid_skeleton_summary_num_imported_nodes_idx
        ON catmaid_skeleton_summary (num_imported_nodes);

    CREATE INDEX CONCURRENTLY review_review_time_idx ON review USING btree (review_time);
    CREATE INDEX CONCURRENTLY review_project_id ON review USING btree (project_id);
    CREATE INDEX CONCURRENTLY review_reviewer_id ON review USING btree (reviewer_id);
    CREATE INDEX CONCURRENTLY review_skeleton_id ON review USING btree (skeleton_id);
    CREATE INDEX CONCURRENTLY review_treenode_id ON review USING btree (treenode_id);

    CREATE INDEX CONCURRENTLY treenode_class_instance_class_instance_id ON treenode_class_instance
        USING btree (class_instance_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance_project_id ON treenode_class_instance
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance_relation_id ON treenode_class_instance
        USING btree (relation_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance_user_id ON treenode_class_instance
        USING btree (user_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance_treenode_id ON treenode_class_instance
        USING btree (treenode_id);

    CREATE INDEX CONCURRENTLY treenode_connector_connector_id ON treenode_connector
        USING btree (connector_id);
    CREATE INDEX CONCURRENTLY treenode_connector_creation_time_idx ON treenode_connector (creation_time);
    CREATE INDEX CONCURRENTLY treenode_connector_project_id ON treenode_connector
        USING btree (project_id);
    CREATE INDEX CONCURRENTLY treenode_connector_relation_id ON treenode_connector
        USING btree (relation_id);
    CREATE INDEX CONCURRENTLY treenode_connector_skeleton_id ON treenode_connector
        USING btree (skeleton_id);
    CREATE INDEX CONCURRENTLY treenode_connector_treenode_id ON treenode_connector
        USING btree (treenode_id);
    CREATE INDEX CONCURRENTLY treenode_connector_user_id ON treenode_connector
        USING btree (user_id);
    CREATE UNIQUE INDEX treenode_connector_project_id_uniq ON treenode_connector
        USING btree (project_id, treenode_id, connector_id, relation_id);

    CREATE INDEX CONCURRENTLY skeleton_origin_skeleton_id_idx ON skeleton_origin (skeleton_id);
    CREATE INDEX CONCURRENTLY skeleton_origin_data_source_id_idx ON skeleton_origin (data_source_id);
    CREATE INDEX CONCURRENTLY skeleton_origin_source_id_idx ON skeleton_origin (source_id);

    CREATE INDEX CONCURRENTLY skeleton_origin__history_skeleton_id_idx
        ON skeleton_origin__history (skeleton_id);
    CREATE INDEX CONCURRENTLY skeleton_origin__history_data_source_id_idx
        ON skeleton_origin__history (data_source_id);
    CREATE INDEX CONCURRENTLY skeleton_origin__history_source_id_idx
        ON skeleton_origin__history (source_id);


    -- History indices
    CREATE INDEX CONCURRENTLY treenode__history_creation_time_id_index
        ON treenode__history (creation_time);
    CREATE INDEX CONCURRENTLY treenode__history_skeleton_id_index ON treenode__history (skeleton_id);

    CREATE INDEX CONCURRENTLY treenode_connector__history_skeleton_id_index ON treenode_connector__history (skeleton_id);
    CREATE INDEX CONCURRENTLY review__history_skeleton_id_index ON review__history (skeleton_id);
    CREATE INDEX CONCURRENTLY class_instance_class_instance__history_class_instance_a_index ON class_instance_class_instance__history (class_instance_a);
    CREATE INDEX CONCURRENTLY class_instance_class_instance__history_class_instance_b_index ON class_instance_class_instance__history (class_instance_b);
    CREATE INDEX CONCURRENTLY treenode_class_instance__history_relation_id_index ON treenode_class_instance__history (relation_id);
    CREATE INDEX CONCURRENTLY treenode_class_instance__history_treenode_id_index ON treenode_class_instance__history (treenode_id );
"""

db_maintenance = """
    VACUUM ANALYZE;
"""

backward = """
    BEGIN;

    CREATE TEMPORARY TABLE temp_versioned_catmaid_table (
        name text,
        time_column text DEFAULT NULL,
        txid_column text DEFAULT NULL
    ) ON COMMIT DROP;
    INSERT INTO temp_versioned_catmaid_table (VALUES
        ('cardinality_restriction', 'edition_time', 'txid'),
        ('change_request', 'edition_time', 'txid'),
        ('class', 'edition_time', 'txid'),
        ('class_class', 'edition_time', 'txid'),
        ('class_instance', 'edition_time', 'txid'),
        ('class_instance_class_instance', 'edition_time', 'txid'),
        ('concept', 'edition_time', 'txid'),
        ('connector_class_instance', 'edition_time', 'txid'),
        ('region_of_interest_class_instance', 'edition_time', 'txid'),
        ('relation', 'edition_time', 'txid'),
        ('relation_instance', 'edition_time', 'txid'),
        ('restriction', 'edition_time', 'txid'),
        ('point_connector', 'edition_time', 'txid'),
        ('point_class_instance', 'edition_time', 'txid'),
        ('skeleton_origin', 'edition_time', 'txid'),
        ('stack_class_instance', 'edition_time', 'txid'),
        ('stack_group_class_instance', 'edition_time', 'txid'),
        ('treenode_class_instance', 'edition_time', 'txid'),
        ('treenode_connector', 'edition_time', 'txid'),
        ('volume_class_instance', 'edition_time', 'txid'),

        ('catmaid_sampler', NULL, NULL),
        ('review', 'review_time', 'txid'),
        ('treenode', 'edition_time', 'txid')
    );


    -- Disable history for all concept tables.
    SELECT disable_history_tracking_for_table(name::regclass,
        get_history_table_name(name::regclass))
    FROM temp_versioned_catmaid_table;


    -- Disable history views for all concept tables.
    SELECT drop_history_view_for_table(name::regclass)
    FROM temp_versioned_catmaid_table;


    -- Disable old history tracking
    SELECT drop_history_table_keep_data(name::regclass)
    FROM temp_versioned_catmaid_table;


    -- Append _old suffix to current concept tables

    ALTER TABLE concept RENAME TO concept_old;
    ALTER TABLE change_request RENAME TO change_request_old;
    ALTER TABLE class RENAME TO class_old;
    ALTER TABLE class_instance RENAME TO class_instance_old;
    ALTER TABLE log RENAME TO log_old;
    ALTER TABLE relation RENAME TO relation_old;
    ALTER TABLE relation_instance RENAME TO relation_instance_old;
    ALTER TABLE restriction RENAME TO restriction_old;

    ALTER TABLE class_class RENAME TO class_class_old;
    ALTER TABLE class_instance_class_instance RENAME TO class_instance_class_instance_old;
    ALTER TABLE connector_class_instance RENAME TO connector_class_instance_old;
    ALTER TABLE point_class_instance RENAME TO point_class_instance_old;
    ALTER TABLE point_connector RENAME TO point_connector_old;
    ALTER TABLE region_of_interest_class_instance RENAME TO region_of_interest_class_instance_old;
    ALTER TABLE skeleton_origin RENAME TO skeleton_origin_old;
    ALTER TABLE stack_class_instance RENAME TO stack_class_instance_old;
    ALTER TABLE stack_group_class_instance RENAME TO stack_group_class_instance_old;
    ALTER TABLE treenode_class_instance RENAME TO treenode_class_instance_old;
    ALTER TABLE treenode_connector RENAME TO treenode_connector_old;
    ALTER TABLE volume_class_instance RENAME TO volume_class_instance_old;

    ALTER TABLE cardinality_restriction RENAME TO cardinality_restriction_old;


    -- Append _old suffix to tables that reference concept tables.

    ALTER TABLE catmaid_sampler RENAME TO catmaid_sampler_old;
    ALTER TABLE catmaid_skeleton_summary RENAME TO catmaid_skeleton_summary_old;
    ALTER TABLE review RENAME TO review_old;
    ALTER TABLE treenode RENAME TO treenode_old;


    -- This is needed, becasue we want to create a constraint with this name
    -- (according to the old schema).
    ALTER INDEX stack_class_instance_pkey RENAME TO stack_class_instance_old_pkey;


    -- Append _old suffix to history tables of current concept tables (log
    -- doesn't have any at the moment).

    ALTER TABLE concept__history RENAME TO concept__history_old;
    ALTER TABLE change_request__history RENAME TO change_request__history_old;
    ALTER TABLE class__history RENAME TO class__history_old;
    ALTER TABLE class_instance__history RENAME TO class_instance__history_old;
    ALTER TABLE relation__history RENAME TO relation__history_old;
    ALTER TABLE relation_instance__history RENAME TO relation_instance__history_old;
    ALTER TABLE restriction__history RENAME TO restriction__history_old;

    ALTER TABLE class_class__history RENAME TO class_class__history_old;
    ALTER TABLE class_instance_class_instance__history RENAME TO class_instance_class_instance__history_old;
    ALTER TABLE connector_class_instance__history RENAME TO connector_class_instance__history_old;
    ALTER TABLE point_class_instance__history RENAME TO point_class_instance__history_old;
    ALTER TABLE point_connector__history RENAME TO point_connector__history_old;
    ALTER TABLE region_of_interest_class_instance__history RENAME TO region_of_interest_class_instance__history_old;
    ALTER TABLE skeleton_origin__history RENAME TO skeleton_origin__history_old;
    ALTER TABLE stack_class_instance__history RENAME TO stack_class_instance__history_old;
    ALTER TABLE stack_group_class_instance__history RENAME TO stack_group_class_instance__history_old;
    ALTER TABLE treenode_class_instance__history RENAME TO treenode_class_instance__history_old;
    ALTER TABLE treenode_connector__history RENAME TO treenode_connector__history_old;
    ALTER TABLE volume_class_instance__history RENAME TO volume_class_instance__history_old;

    ALTER TABLE cardinality_restriction__history RENAME TO cardinality_restriction__history_old;

    -- Note: the history table dictionary (catmaid_history_table) doesn't need
    -- to be updated, because it references tables as regclass objects. The name
    -- changes above are already reflect there.


    -- Append _old suffix to history tables of table that reference concept
    -- tables.

    ALTER TABLE catmaid_sampler__history RENAME TO catmaid_sampler__history_old;
    ALTER TABLE review__history RENAME TO review__history_old;
    ALTER TABLE treenode__history RENAME TO treenode__history_old;


    -- Alter constraint names. This is needed, because constraint names need to
    -- be globally unique and we want to create new versions of these.

    ALTER TABLE change_request_old RENAME CONSTRAINT change_request_project_id_fkey TO change_request_project_id_fkey_old;
    ALTER TABLE change_request_old RENAME CONSTRAINT change_request_user_id_fkey TO change_request_user_id_fkey_old;

    -- Rename sequences, so that new ones can be created below.
    ALTER SEQUENCE concept_id_seq RENAME TO condept_id_seq_old;
    ALTER SEQUENCE catmaid_sampler_id_seq RENAME TO catmaid_sampler_id_seq_old;
    ALTER SEQUENCE review_id_seq RENAME TO review_id_seq_old;


    -- Create new concept table hierarchy using integer IDs and optimal table
    -- ordering to avoid wasting space.

    CREATE TABLE concept (
        id integer NOT NULL,
        user_id integer NOT NULL,
        creation_time timestamp with time zone DEFAULT now() NOT NULL,
        edition_time timestamp with time zone DEFAULT now() NOT NULL,
        project_id integer NOT NULL,
        txid bigint DEFAULT txid_current(),

        CONSTRAINT concept_pkey PRIMARY KEY (id)
    );

    -- The sequence already works with integer, just make sure it is owned by the
    -- new table.
    CREATE SEQUENCE concept_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;
    ALTER SEQUENCE concept_id_seq OWNED BY concept.id;


    CREATE TABLE class (
        class_name character varying(255) NOT NULL,
        description text,

        CONSTRAINT class_pkey PRIMARY KEY (id),
        CONSTRAINT class_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (concept);
    ALTER TABLE ONLY class ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE log (
        operation_type character varying(255) NOT NULL,
        location float3d,
        freetext text,

        CONSTRAINT log_pkey PRIMARY KEY (id)
    )
    INHERITS (concept);
    ALTER TABLE ONLY log ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE relation (
        relation_name character varying(255) NOT NULL,
        uri text,
        description text,
        isreciprocal boolean DEFAULT false NOT NULL,

        CONSTRAINT relation_pkey PRIMARY KEY (id)
    )
    INHERITS (concept);
    ALTER TABLE ONLY relation ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE relation_instance (
        relation_id integer NOT NULL,

        CONSTRAINT relation_instance_pkey PRIMARY KEY (id)
    )
    INHERITS (concept);
    ALTER TABLE ONLY relation_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE class_class (
        class_a integer,
        class_b integer,

        CONSTRAINT class_class_pkey PRIMARY KEY (id)
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY class_class ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE restriction (
        enabled boolean DEFAULT true NOT NULL,
        restricted_link_id integer NOT NULL,

        CONSTRAINT restriction_pkey PRIMARY KEY (id),
        CONSTRAINT restricted_link_fkey FOREIGN KEY (restricted_link_id)
            REFERENCES class_class(id)
    )
    INHERITS (concept);
    ALTER TABLE ONLY restriction ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE class_instance (
        class_id integer NOT NULL,
        name character varying(255) NOT NULL,

        CONSTRAINT class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_class_id_fkey FOREIGN KEY (class_id)
            REFERENCES class(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (concept);
    ALTER TABLE ONLY class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE class_instance_class_instance (
        class_instance_a integer,
        class_instance_b integer,

        CONSTRAINT class_instance_class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT class_instance_class_instance_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_class_instance_relation_id_fkey FOREIGN KEY (relation_id)
            REFERENCES relation(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_class_instance_class_instance_a_fkey FOREIGN KEY (class_instance_a)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT class_instance_class_instance_class_instance_b_fkey FOREIGN KEY (class_instance_b)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY class_instance_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE connector_class_instance (
        connector_id bigint NOT NULL,
        class_instance_id integer NOT NULL,

        CONSTRAINT connector_class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT connector_class_instance_connector_id_fkey FOREIGN KEY (connector_id)
            REFERENCES connector(id) ON DELETE CASCADE
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY connector_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE point_class_instance (
        point_id bigint NOT NULL,
        class_instance_id integer NOT NULL,

        CONSTRAINT point_class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT point_class_instance_sa_id FOREIGN KEY (point_id)
            REFERENCES point(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_connector_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY point_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE point_connector (
        point_id bigint NOT NULL,
        connector_id bigint NOT NULL,
        confidence smallint DEFAULT 5 NOT NULL,

        CONSTRAINT point_connector_pkey PRIMARY KEY (id),
        CONSTRAINT point_connector_connector_id_fkey FOREIGN KEY (connector_id)
            REFERENCES connector(id) DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT point_connector_sa_id FOREIGN KEY (point_id)
            REFERENCES point(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT point_connector_project_id_uniq
            UNIQUE (project_id, point_id, connector_id, relation_id)
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY point_connector ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE region_of_interest_class_instance (
        region_of_interest_id bigint,
        class_instance_id integer,

        CONSTRAINT region_of_interest_class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT region_of_interest_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id)
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY region_of_interest_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE skeleton_origin (
        id int GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        user_id int REFERENCES auth_user (id) NOT NULL,
        project_id int REFERENCES project(id) ON DELETE CASCADE NOT NULL,
        creation_time timestamptz NOT NULL DEFAULT now(),
        edition_time timestamptz NOT NULL DEFAULT now(),
        skeleton_id bigint REFERENCES class_instance(id) ON DELETE CASCADE NOT NULL,
        data_source_id integer REFERENCES data_source(id) ON DELETE CASCADE NOT NULL,
        source_id bigint NOT NULL,
        txid bigint DEFAULT txid_current(),
        source_type skeleton_origin_source_type
    );

    CREATE TABLE stack_class_instance (
        class_instance_id integer,
        stack_id integer,

        CONSTRAINT stack_class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT stack_class_instance_stack_id_fkey FOREIGN KEY (stack_id)
            REFERENCES stack(id),
        CONSTRAINT stack_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY stack_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE stack_group_class_instance (
        stack_group_id integer,
        class_instance_id integer,

        CONSTRAINT stack_group_class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT stack_group_class_instance_stack_group_id_fkey FOREIGN KEY (stack_group_id)
            REFERENCES stack_group(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT stack_group_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY stack_group_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE treenode (
        skeleton_id integer NOT NULL,
        radius real DEFAULT 0 NOT NULL,
        confidence smallint DEFAULT 5 NOT NULL,
        parent_id bigint,

        CONSTRAINT treenode_pkey PRIMARY KEY (id),
        CONSTRAINT treenode_skeleton_id_fkey FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_parent_id_fkey FOREIGN KEY (parent_id)
            REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (location);
    ALTER TABLE ONLY treenode ALTER COLUMN id SET DEFAULT nextval('location_id_seq'::regclass);

    CREATE TABLE change_request (
        type character varying(32) NOT NULL,
        description text NOT NULL,
        status integer NOT NULL,
        recipient_id integer NOT NULL,
        location float3d NOT NULL,
        treenode_id bigint,
        connector_id bigint,
        validate_action text NOT NULL,
        approve_action text NOT NULL,
        reject_action text NOT NULL,
        completion_time timestamp with time zone,

        CONSTRAINT change_request_pkey PRIMARY KEY (id),
        CONSTRAINT change_request_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id),
        CONSTRAINT change_request_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT change_request_connector_id_fkey FOREIGN KEY (connector_id)
            REFERENCES connector(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT change_request_treenode_id_fkey FOREIGN KEY (treenode_id)
            REFERENCES treenode(id) ON DELETE CASCADE,
        CONSTRAINT recipient_id_refs_id FOREIGN KEY (recipient_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (concept);
    ALTER TABLE ONLY change_request ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE treenode_class_instance (
        treenode_id bigint NOT NULL,
        class_instance_id integer NOT NULL,

        CONSTRAINT treenode_class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT treenode_class_instance_treenode_id_fkey FOREIGN KEY (treenode_id)
            REFERENCES treenode(id) ON DELETE CASCADE
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY treenode_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE treenode_connector (
        treenode_id bigint NOT NULL,
        connector_id bigint NOT NULL,
        skeleton_id integer,
        confidence smallint DEFAULT 5 NOT NULL,

        CONSTRAINT treenode_connector_pkey PRIMARY KEY (id),
        CONSTRAINT treenode_connector_treenode_id_fkey FOREIGN KEY (treenode_id)
            REFERENCES treenode(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_connector_connector_id_fkey FOREIGN KEY (connector_id)
            REFERENCES connector(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY treenode_connector ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE volume_class_instance (
        volume_id bigint NOT NULL,
        class_instance_id integer NOT NULL,

        CONSTRAINT volume_class_instance_pkey PRIMARY KEY (id),
        CONSTRAINT volume_class_instance_sa_id FOREIGN KEY (volume_id)
            REFERENCES catmaid_volume(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT volume_class_instance_id_fkey FOREIGN KEY (class_instance_id)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (relation_instance);
    ALTER TABLE ONLY volume_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);

    CREATE TABLE cardinality_restriction (
        cardinality_type integer NOT NULL,
        value integer NOT NULL,

        CONSTRAINT cardinality_restriction_pkey PRIMARY KEY (id),
        CONSTRAINT cardinality_restriction_user_id_fkey FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT cardinality_restriction_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT cardinality_restriction_restricted_link_id_fkey FOREIGN KEY (restricted_link_id)
            REFERENCES class_class(id) DEFERRABLE INITIALLY DEFERRED
    )
    INHERITS (restriction);
    ALTER TABLE ONLY cardinality_restriction ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


    -- Create new tables for data that references the concept table hierarchy.

    CREATE TABLE catmaid_sampler (
        id integer NOT NULL,
        creation_time timestamp with time zone NOT NULL,
        edition_time timestamp with time zone NOT NULL,
        interval_length double precision NOT NULL,
        project_id integer NOT NULL,
        sampler_state_id integer NOT NULL,
        skeleton_id integer NOT NULL,
        user_id integer NOT NULL,
        interval_error double precision NOT NULL,
        merge_limit real DEFAULT 0 NOT NULL,
        review_required boolean NOT NULL,
        create_interval_boundaries boolean NOT NULL,
        leaf_segment_handling text NOT NULL,

        CONSTRAINT catmaid_sampler_pkey PRIMARY KEY (id),
        CONSTRAINT catmaid_sampler_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT catmaid_sampler_skeleton_id_dfc98008_fk_class_instance_id FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT catmaid_sampler_sampler_state_id_80e7961f_fk_catmaid_s FOREIGN KEY (sampler_state_id)
            REFERENCES catmaid_samplerstate(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT catmaid_sampler_user_id_8d1c228f_fk_auth_user_id FOREIGN KEY (user_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED
    );

    -- The sequence already works with integer, just make sure it is owned by the
    -- new table.
    CREATE SEQUENCE catmaid_sampler_id_seq
        AS integer
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;
    ALTER SEQUENCE catmaid_sampler_id_seq OWNED BY catmaid_sampler.id;
    ALTER TABLE ONLY catmaid_sampler ALTER COLUMN id
        SET DEFAULT nextval('catmaid_sampler_id_seq'::regclass);

    CREATE TABLE catmaid_skeleton_summary (
        skeleton_id integer NOT NULL,
        project_id integer NOT NULL,
        last_summary_update timestamp with time zone NOT NULL,
        original_creation_time timestamp with time zone NOT NULL,
        last_edition_time timestamp with time zone NOT NULL,
        num_nodes integer DEFAULT 0 NOT NULL,
        cable_length double precision DEFAULT 0 NOT NULL,
        last_editor_id integer NOT NULL,
        num_imported_nodes bigint DEFAULT 0 NOT NULL,

        CONSTRAINT catmaid_skeleton_summary_pkey PRIMARY KEY (skeleton_id),
        CONSTRAINT catmaid_skeleton_summary_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT catmaid_skeleton_sum_skeleton_id_034079eb_fk_class_ins FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT catmaid_skeleton_summary_skeleton_id_fk FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) ON DELETE CASCADE,
        CONSTRAINT last_editor_id_fkey FOREIGN KEY (last_editor_id)
            REFERENCES auth_user(id)
    );

    CREATE TABLE review (
        id integer NOT NULL,
        project_id integer NOT NULL,
        reviewer_id integer NOT NULL,
        review_time timestamp with time zone NOT NULL,
        skeleton_id integer NOT NULL,
        treenode_id bigint NOT NULL,
        txid bigint DEFAULT txid_current(),

        CONSTRAINT review_pkey PRIMARY KEY (id),
        CONSTRAINT review_reviewer_id_refs_id FOREIGN KEY (reviewer_id)
            REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT review_project_id_fkey FOREIGN KEY (project_id)
            REFERENCES project(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT treenode_id_fkey FOREIGN KEY (treenode_id)
            REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT review_skeleton_id_refs_id FOREIGN KEY (skeleton_id)
            REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED
    );

    -- The sequence already works with integer, just make sure it is owned by the
    -- new table.
    CREATE SEQUENCE review_id_seq
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1;
    ALTER SEQUENCE review_id_seq OWNED BY review.id;
    ALTER TABLE ONLY review ALTER COLUMN id
        SET DEFAULT nextval('review_id_seq'::regclass);


    -- Insert data into main tables

    INSERT INTO concept (id, user_id, project_id, creation_time, edition_time, txid)
    SELECT id, user_id, project_id, creation_time, edition_time, txid
    FROM ONLY concept_old;

    INSERT INTO class (id, user_id, creation_time, edition_time, project_id,
        txid, class_name, description)
    SELECT id, user_id, creation_time, edition_time, project_id,
        txid, class_name, description
    FROM ONLY class_old;

    INSERT INTO class_instance (id, user_id, creation_time, edition_time,
        project_id, txid, class_id, name)
    SELECT id, user_id, creation_time, edition_time,
        project_id, txid, class_id, name
    FROM ONLY class_instance_old;

    INSERT INTO log (id, user_id, creation_time, edition_time, project_id, txid,
        operation_type, location, freetext)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        operation_type, location, freetext
    FROM ONLY log_old;

    INSERT INTO relation (id, user_id, creation_time, edition_time, project_id,
        txid, relation_name, uri, description, isreciprocal)
    SELECT id, user_id, creation_time, edition_time, project_id,
        txid, relation_name, uri, description, isreciprocal
    FROM ONLY relation_old;

    INSERT INTO relation_instance (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id)
    SELECT id, user_id, creation_time, edition_time,
        project_id, txid, relation_id
    FROM ONLY relation_instance_old;

    INSERT INTO restriction (id, user_id, creation_time, edition_time,
        project_id, txid, enabled, restricted_link_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid, enabled,
        restricted_link_id
    FROM ONLY restriction_old;

    INSERT INTO class_class (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, class_a, class_b)
    SELECT id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, class_a, class_b
    FROM ONLY class_class_old;

    INSERT INTO class_instance_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, class_instance_a,
        class_instance_b)
    SELECT id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, class_instance_a,
        class_instance_b
    FROM ONLY class_instance_class_instance_old;

    INSERT INTO connector_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, connector_id,
        class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, connector_id, class_instance_id
    FROM ONLY connector_class_instance_old;

    INSERT INTO point_class_instance (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, point_id, class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, point_id, class_instance_id
    FROM ONLY point_class_instance_old;

    INSERT INTO point_connector (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, point_id, connector_id, confidence)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, point_id, connector_id, confidence
    FROM ONLY point_connector_old;

    INSERT INTO region_of_interest_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, region_of_interest_id,
        class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, region_of_interest_id, class_instance_id
    FROM ONLY region_of_interest_class_instance_old;

    INSERT INTO skeleton_origin (id, user_id, creation_time, edition_time,
        project_id, txid, skeleton_id, data_source_id, source_id, source_type)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        skeleton_id, data_source_id, source_id, source_type
    FROM ONLY skeleton_origin_old;

    INSERT INTO stack_class_instance (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, stack_id, class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, stack_id, class_instance_id
    FROM ONLY stack_class_instance_old;

    INSERT INTO stack_group_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, stack_group_id,
        class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, stack_group_id, class_instance_id
    FROM ONLY stack_group_class_instance_old;

    INSERT INTO treenode (id, project_id, location_x, location_y, location_z,
        editor_id, user_id, creation_time, edition_time, txid, skeleton_id,
        radius, confidence, parent_id)
    SELECT id, project_id, location_x, location_y, location_z,
        editor_id, user_id, creation_time, edition_time, txid, skeleton_id,
        radius, confidence, parent_id
    FROM ONLY treenode_old;

    INSERT INTO change_request (id, user_id, creation_time, edition_time,
        project_id, txid, type, description, status, recipient_id, location,
        treenode_id, connector_id, validate_action, approve_action,
        reject_action, completion_time)
    SELECT id, user_id, creation_time, edition_time, project_id, txid, type,
        description, status, recipient_id, location, treenode_id, connector_id,
        validate_action, approve_action, reject_action, completion_time
    FROM ONLY change_request_old;

    INSERT INTO treenode_class_instance (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, treenode_id, class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, treenode_id, class_instance_id
    FROM ONLY treenode_class_instance_old;

    INSERT INTO treenode_connector (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, treenode_id, connector_id, skeleton_id,
        confidence)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, treenode_id, connector_id, skeleton_id, confidence
    FROM ONLY treenode_connector_old;

    INSERT INTO volume_class_instance (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, volume_id, class_instance_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, volume_id, class_instance_id
    FROM ONLY volume_class_instance_old;

    INSERT INTO cardinality_restriction (id, user_id, creation_time,
        edition_time, project_id, txid, enabled, restricted_link_id,
        cardinality_type, value)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        enabled, restricted_link_id, cardinality_type, value
    FROM ONLY cardinality_restriction_old;

    INSERT INTO catmaid_sampler (id, creation_time, edition_time,
        interval_length, review_required, project_id, sampler_state_id,
        skeleton_id, user_id, create_interval_boundaries, interval_error,
        leaf_segment_handling, merge_limit)
    SELECT id, creation_time, edition_time, interval_length, review_required,
        project_id, sampler_state_id, skeleton_id, user_id,
        create_interval_boundaries, interval_error, leaf_segment_handling,
        merge_limit
    FROM ONLY catmaid_sampler_old;

    INSERT INTO catmaid_skeleton_summary (skeleton_id, project_id,
        last_summary_update, original_creation_time, last_edition_time,
        num_nodes, cable_length, last_editor_id)
    SELECT skeleton_id, project_id, last_summary_update, original_creation_time,
        last_edition_time, num_nodes, cable_length, last_editor_id
    FROM ONLY catmaid_skeleton_summary_old;

    INSERT INTO review (id, project_id, reviewer_id, review_time, skeleton_id,
        treenode_id, txid)
    SELECT id, project_id, reviewer_id, review_time, skeleton_id, treenode_id,
        txid
    FROM ONLY review_old;


    -- Create history tables for all new tables, including the triggers

    SELECT create_history_table(name::regclass, time_column, txid_column)
    FROM temp_versioned_catmaid_table;
    SELECT create_history_view_for_table(name::regclass)
    FROM temp_versioned_catmaid_table;


    -- Insert data into history tables

    INSERT INTO concept__history (id, user_id, project_id, creation_time,
        edition_time, txid, sys_period, exec_transaction_id)
    SELECT id, user_id, project_id, creation_time, edition_time, txid,
        sys_period, exec_transaction_id
    FROM ONLY concept__history_old;

    INSERT INTO change_request__history (id, user_id, creation_time, edition_time,
        project_id, txid, type, description, status, recipient_id, location,
        treenode_id, connector_id, validate_action, approve_action,
        reject_action, completion_time, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid, type,
        description, status, recipient_id, location, treenode_id, connector_id,
        validate_action, approve_action, reject_action, completion_time,
        sys_period, exec_transaction_id
    FROM ONLY change_request__history_old;

    INSERT INTO class__history (id, user_id, creation_time, edition_time, project_id,
        txid, class_name, description, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id,
        txid, class_name, description, sys_period, exec_transaction_id
    FROM ONLY class__history_old;

    INSERT INTO class_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, class_id, name, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time,
        project_id, txid, class_id, name, sys_period, exec_transaction_id
    FROM ONLY class_instance__history_old;

    INSERT INTO relation__history (id, user_id, creation_time, edition_time, project_id,
        txid, relation_name, uri, description, isreciprocal, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_name, uri, description, isreciprocal, sys_period,
        exec_transaction_id
    FROM ONLY relation__history_old;

    INSERT INTO relation_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, sys_period, exec_transaction_id
    FROM ONLY relation_instance__history_old;

    INSERT INTO restriction__history (id, user_id, creation_time, edition_time,
        project_id, txid, enabled, restricted_link_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid, enabled,
        restricted_link_id, sys_period, exec_transaction_id
    FROM ONLY restriction__history_old;

    INSERT INTO class_class__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, class_a, class_b, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, class_a, class_b, sys_period, exec_transaction_id
    FROM ONLY class_class__history_old;

    INSERT INTO class_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, class_id, name, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid, class_id,
        name, sys_period, exec_transaction_id
    FROM ONLY class_instance__history_old;

    INSERT INTO class_instance_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, class_instance_a,
        class_instance_b, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, class_instance_a,
        class_instance_b, sys_period, exec_transaction_id
    FROM ONLY class_instance_class_instance__history_old;

    INSERT INTO connector_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, connector_id,
        class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, connector_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY connector_class_instance__history_old;

    INSERT INTO point_class_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, point_id, class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, point_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY point_class_instance__history_old;

    INSERT INTO point_connector__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, point_id, connector_id, confidence, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, point_id, connector_id, confidence, sys_period,
        exec_transaction_id
    FROM ONLY point_connector__history_old;

    INSERT INTO region_of_interest_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, region_of_interest_id,
        class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, region_of_interest_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY region_of_interest_class_instance__history_old;

    INSERT INTO skeleton_origin__history (id, user_id, creation_time,
        edition_time, project_id, txid, skeleton_id, data_source_id, source_id,
        source_type, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        skeleton_id, data_source_id, source_id, source_type, sys_period,
        exec_transaction_id
    FROM ONLY skeleton_origin__history_old;

    INSERT INTO stack_class_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, stack_id, class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, stack_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY stack_class_instance__history_old;

    INSERT INTO stack_group_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, stack_group_id,
        class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, stack_group_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY stack_group_class_instance__history_old;

    INSERT INTO treenode_class_instance__history (id, user_id, creation_time,
        edition_time, project_id, txid, relation_id, treenode_id, class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, treenode_id, class_instance_id, sys_period,
        exec_transaction_id
    FROM ONLY treenode_class_instance__history_old;

    INSERT INTO treenode_connector__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, treenode_id, connector_id, skeleton_id,
        confidence, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, treenode_id, connector_id, skeleton_id, confidence,
        sys_period, exec_transaction_id
    FROM ONLY treenode_connector__history_old;

    INSERT INTO volume_class_instance__history (id, user_id, creation_time, edition_time,
        project_id, txid, relation_id, volume_id, class_instance_id, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        relation_id, volume_id, class_instance_id, sys_period, exec_transaction_id
    FROM ONLY volume_class_instance__history_old;

    INSERT INTO cardinality_restriction__history (id, user_id, creation_time,
        edition_time, project_id, txid, enabled, restricted_link_id,
        cardinality_type, value, sys_period, exec_transaction_id)
    SELECT id, user_id, creation_time, edition_time, project_id, txid,
        enabled, restricted_link_id, cardinality_type, value, sys_period,
        exec_transaction_id
    FROM ONLY cardinality_restriction__history_old;

    INSERT INTO catmaid_sampler__history (id, creation_time, edition_time,
        interval_length, review_required, project_id, sampler_state_id,
        skeleton_id, user_id, create_interval_boundaries, interval_error,
        leaf_segment_handling, merge_limit)
    SELECT id, creation_time, edition_time, interval_length, review_required,
        project_id, sampler_state_id, skeleton_id, user_id,
        create_interval_boundaries, interval_error, leaf_segment_handling,
        merge_limit
    FROM ONLY catmaid_sampler__history_old;

    INSERT INTO review__history (id, project_id, reviewer_id, review_time,
        skeleton_id, treenode_id, txid)
    SELECT id, project_id, reviewer_id, review_time, skeleton_id, treenode_id,
        txid
    FROM ONLY review__history_old;

    INSERT INTO treenode__history (id, project_id, location_x, location_y,
        location_z, editor_id, user_id, creation_time, edition_time, txid,
        skeleton_id, radius, confidence, parent_id)
    SELECT id, project_id, location_x, location_y, location_z,
        editor_id, user_id, creation_time, edition_time, txid, skeleton_id,
        radius, confidence, parent_id
    FROM ONLY treenode__history_old;


    -- Update foreign keys to non-concept tables from non-concept tables (e.g.
    -- treenode).

    ALTER TABLE catmaid_samplerdomain DROP CONSTRAINT IF EXISTS
        catmaid_samplerdomain_sampler_id_fkey;
    ALTER TABLE catmaid_samplerdomain ADD CONSTRAINT catmaid_samplerdomain_sampler_id_ed4aa3f0_fk_catmaid_sampler_id
        FOREIGN KEY (sampler_id) REFERENCES catmaid_sampler(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_samplerdomain DROP CONSTRAINT IF EXISTS
        catmaid_samplerdomain_start_node_id_fkey;
    ALTER TABLE catmaid_samplerdomain ADD CONSTRAINT catmaid_samplerdomain_start_node_id_4ae2c16c_fk_treenode_id
        FOREIGN KEY (start_node_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_samplerdomainend DROP CONSTRAINT IF EXISTS
        catmaid_samplerdomainend_end_node_id_fkey;
    ALTER TABLE catmaid_samplerdomainend ADD CONSTRAINT catmaid_samplerdomainend_end_node_id_31859f80_fk_treenode_id
        FOREIGN KEY (end_node_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_samplerinterval DROP CONSTRAINT IF EXISTS
        catmaid_samplerinterval_end_node_id_fkey;
    ALTER TABLE catmaid_samplerinterval ADD CONSTRAINT catmaid_samplerinterval_end_node_id_c82f43df_fk_treenode_id
        FOREIGN KEY (end_node_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE catmaid_samplerinterval DROP CONSTRAINT IF EXISTS
        catmaid_samplerinterval_start_node_id_fkey;
    ALTER TABLE catmaid_samplerinterval ADD CONSTRAINT catmaid_samplerinterval_start_node_id_ead5c637_fk_treenode_id
        FOREIGN KEY (start_node_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;

    ALTER TABLE suppressed_virtual_treenode DROP CONSTRAINT IF EXISTS
        child_id_refs_id_93bf2222;
    ALTER TABLE suppressed_virtual_treenode DROP CONSTRAINT IF EXISTS
        suppressed_virtual_treenode_child_id_fkey;
    ALTER TABLE suppressed_virtual_treenode ADD CONSTRAINT suppressed_vnodes_child_id_refs_id
        FOREIGN KEY (child_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;


    -- Drop newly added constraints
    ALTER TABLE ONLY public.cardinality_restriction
        DROP CONSTRAINT cardinality_restriction_project_id_fkey;

    ALTER TABLE ONLY public.cardinality_restriction
        DROP CONSTRAINT cardinality_restriction_restricted_link_id_fkey;

    ALTER TABLE ONLY public.cardinality_restriction
        DROP CONSTRAINT cardinality_restriction_user_id_fkey;


    -- Drop and recreate table specific functions
    DROP FUNCTION check_treenode_connector_related_reviews(treenode_connector_old);

    CREATE FUNCTION check_treenode_connector_related_reviews(tc treenode_connector) RETURNS void
        LANGUAGE plpgsql
        AS $$BEGIN
            -- Mark linked treenodes as unreviewed. If relation is postsynaptic,
            -- mark only one, otherwise mark all treenodes related to connector.
            IF EXISTS (SELECT 1
                         FROM relation
                         WHERE id = tc.relation_id
                           AND relation_name = 'postsynaptic_to') THEN
              DELETE FROM review WHERE treenode_id = tc.treenode_id;
            ELSE
              DELETE FROM review r
                USING treenode_connector tc2
                WHERE r.treenode_id = tc2.treenode_id
                  AND tc2.connector_id = tc.connector_id;
            END IF;
        END;
        $$;


    -- History triggers are already enabled, add all other triggers. Not all
    -- tables had on_edit triggers before. Only those that were there before are
    -- recreated.
    CREATE TRIGGER on_edit_concept BEFORE UPDATE ON concept FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_change_request BEFORE UPDATE ON change_request FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_class BEFORE UPDATE ON class FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_class_instance BEFORE UPDATE ON class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_relation BEFORE UPDATE ON relation FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_relation_instance BEFORE UPDATE ON relation_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();

    CREATE TRIGGER on_edit_class_class BEFORE UPDATE ON class_class
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_class_instance_class_instance BEFORE UPDATE ON class_instance_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_connector_class_instance BEFORE UPDATE ON connector_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_treenode_class_instance BEFORE UPDATE ON treenode_class_instance
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_create_treenode_connector_check_review AFTER INSERT ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_create_treenode_connector_check_review();
    CREATE TRIGGER on_delete_treenode_connector_update_edges BEFORE DELETE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_connector_update_edges();
    CREATE TRIGGER on_delete_treenode_connector_check_review AFTER DELETE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_connector_check_review();
    CREATE TRIGGER on_edit_treenode_connector BEFORE UPDATE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_treenode_connector_check_review AFTER UPDATE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_connector_check_review();
    CREATE TRIGGER on_edit_treenode_connector_update_edges
        AFTER UPDATE ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_connector_update_edges();
    CREATE TRIGGER on_insert_treenode_connector_update_edges
        AFTER INSERT ON treenode_connector
        FOR EACH ROW EXECUTE PROCEDURE on_insert_treenode_connector_update_edges();

    CREATE TRIGGER on_delete_treenode_update_summary_and_edges
        AFTER DELETE ON treenode REFERENCING OLD TABLE as deleted_treenode
        FOR EACH STATEMENT EXECUTE PROCEDURE on_delete_treenode_update_summary_and_edges();
    CREATE TRIGGER on_delete_treenode_update_suppressed_virtual_treenodes
        BEFORE DELETE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_update_suppressed_virtual_treenodes();
    CREATE TRIGGER on_edit_treenode
        BEFORE UPDATE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_edit();
    CREATE TRIGGER on_edit_treenode_check_review
        AFTER UPDATE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_check_review();
    CREATE TRIGGER on_edit_treenode_update_summary_and_edges
        AFTER UPDATE ON treenode REFERENCING NEW TABLE as new_treenode OLD TABLE as old_treenode
        FOR EACH STATEMENT EXECUTE PROCEDURE on_edit_treenode_update_summary_and_edges();
    CREATE TRIGGER on_edit_treenode_update_suppressed_virtual_treenodes
        AFTER UPDATE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_update_suppressed_virtual_treenodes();
    CREATE TRIGGER on_edit_treenode_update_treenode_connector_edges
        AFTER UPDATE ON treenode
        FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_update_treenode_connector_edges();
    CREATE TRIGGER on_insert_treenode_update_summary_and_edges
        AFTER INSERT ON treenode REFERENCING NEW TABLE as inserted_treenode
        FOR EACH STATEMENT EXECUTE PROCEDURE on_insert_treenode_update_summary_and_edges();


    -- Drop old tables
    DROP TABLE cardinality_restriction_old;

    DROP TABLE volume_class_instance_old;
    DROP TABLE treenode_connector_old;
    DROP TABLE treenode_class_instance_old;
    DROP TABLE stack_group_class_instance_old;
    DROP TABLE stack_class_instance_old;
    DROP TABLE region_of_interest_class_instance_old;
    DROP TABLE point_connector_old;
    DROP TABLE point_class_instance_old;
    DROP TABLE connector_class_instance_old;
    DROP TABLE skeleton_origin_old;
    DROP TABLE class_instance_class_instance_old;

    DROP TABLE catmaid_sampler_old;
    DROP TABLE catmaid_skeleton_summary_old;
    DROP TABLE review_old;

    DROP TABLE restriction_old;
    DROP TABLE log_old;
    DROP TABLE change_request_old;
    DROP TABLE treenode_old;
    DROP TABLE class_instance_old;

    DROP TABLE class_class_old;
    DROP TABLE relation_instance_old;
    DROP TABLE relation_old;
    DROP TABLE class_old;
    DROP TABLE concept_old;

    -- Drop old history tables
    DROP TABLE change_request__history_old;

    DROP TABLE connector_class_instance__history_old;
    DROP TABLE point_class_instance__history_old;
    DROP TABLE point_connector__history_old;
    DROP TABLE region_of_interest_class_instance__history_old;
    DROP TABLE skeleton_origin__history_old;
    DROP TABLE stack_class_instance__history_old;
    DROP TABLE stack_group_class_instance__history_old;
    DROP TABLE treenode_class_instance__history_old;
    DROP TABLE treenode_connector__history_old;
    DROP TABLE volume_class_instance__history_old;

    DROP TABLE cardinality_restriction__history_old;

    DROP TABLE class_class__history_old;
    DROP TABLE class_instance_class_instance__history_old;

    DROP TABLE catmaid_sampler__history_old;
    DROP TABLE review__history_old;
    DROP TABLE treenode__history_old;

    DROP TABLE class__history_old;
    DROP TABLE class_instance__history_old;
    DROP TABLE relation__history_old;
    DROP TABLE relation_instance__history_old;
    DROP TABLE restriction__history_old;

    DROP TABLE concept__history_old;

    -- Update sequences to most recent ID values
    SELECT setval('concept_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
        FROM concept;
    SELECT setval('review_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
        FROM review;
    SELECT setval('catmaid_sampler_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
        FROM catmaid_sampler;

    COMMIT;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('catmaid', '0098_make_primary_group_optional'),
    ]

    operations = [
        migrations.RunSQL(forward_prepare, backward_prepare),
        migrations.RunSQL(migrations.RunSQL.noop, db_maintenance),
        migrations.RunSQL(migrations.RunSQL.noop, backward_create_indices),
        migrations.RunSQL(forward, backward),
        migrations.RunSQL(forward_create_indices, migrations.RunSQL.noop),
        migrations.RunSQL(db_maintenance, migrations.RunSQL.noop),
    ]
