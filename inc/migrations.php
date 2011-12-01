<?php

class Migration {
	var $name;
	var $sql;
	function Migration( $name,
						$sql ) {
		$this->name = $name;
		$this->sql = $sql;
	}
	function apply( $db, $ignoreErrors ) {
		try {
			error_log("Running the migration: ".$this->name);
			$db->getResult("SAVEPOINT generic_migration");
			$db->getResult($this->sql);
		} catch( Exception $e ) {
			if ($ignoreErrors) {
				error_log("Ignoring the failed migration: ".$e);
				$db->getResult("ROLLBACK TO SAVEPOINT generic_migration");
			} else {
				error_log("The migration failed: ".$e);
				throw $e;
			}
		}
	}
}

// This is a special migration that we can't easily do with pure SQL.
// It inserts any missing lines into the treenode_connector table,
// based on the old way of describing synapses:

class SpecialConnectorMigration {
    var $name = "Add any rows missing from the treenode_connector table";
    function apply( $db, $ignoreErrors) {
        try {
            error_log("Running the migration: ".$this->name);
            $db->getResult("SAVEPOINT connector_migration");

            foreach( $db->getResult("SELECT id FROM project") as $p ) {
                $project_id = $p['id'];
                error_log("Dealing with project: ".$project_id);

                // Get a map of all the relation names to IDs in this
                // project:
                $relation_result = $db->getResult("SELECT relation_name, id FROM relation WHERE project_id = ".$project_id);
                $relations = array();
                foreach( $relation_result as $r ) {
                    $relations[$r['relation_name']] = intval($r['id']);
                }

                // Get a map of all the class names to IDs in this
                // project:
                $class_result = $db->getResult("SELECT class_name, id FROM class WHERE project_id = ".$project_id);
                $classes = array();
                foreach( $class_result as $r ) {
                    $classes[$r['class_name']] = intval($r['id']);
                }

                if (!isset($relations['presynaptic_to'])) {
                    // Then this project probably isn't set up for tracing
                    continue;
                }

                foreach( array('presynaptic', 'postsynaptic') as $direction ) {

                    $direction_relation_id = $relations[$direction . '_to'];
                    $terminal_class_id = $classes[$direction . ' terminal'];
                    $model_of_id = $relations['model_of'];
                    $synapse_class_id = $classes['synapse'];
                    $results = $db->getResult(<<<EOSQL
SELECT tn.id as tnid, c.id as cid, terminal1_to_syn.user_id as user_id
  FROM treenode tn,
       treenode_class_instance tci,
       class_instance terminal1,
       class_instance_class_instance terminal1_to_syn,
       class_instance syn,
       connector_class_instance syn_to_connector,
       connector c
  WHERE tn.project_id = $project_id
    AND tn.id = tci.treenode_id
    AND tci.relation_id = $model_of_id
    AND terminal1.id = tci.class_instance_id
    AND terminal1.class_id = $terminal_class_id
    AND terminal1.id = terminal1_to_syn.class_instance_a
    AND terminal1_to_syn.relation_id = $direction_relation_id
    AND syn.id = terminal1_to_syn.class_instance_b
    AND syn.class_id = $synapse_class_id
    AND syn.id = syn_to_connector.class_instance_id
    AND syn_to_connector.relation_id = $model_of_id
    AND syn_to_connector.connector_id = c.id
EOSQL
                        );

                    foreach ($results as $row) {
                        $treenode_id = $row['tnid'];
                        $connector_id = $row['cid'];
                        $user_id = $row['user_id'];

                        // Do a quick check that this relationship isn't already
                        // recorded in the treenode_connector table.  It shouldn't
                        // create a problem if we end up with duplicate entries,
                        // but try to avoid that:

                        $check_result = $db->getResult(<<<EOSQL
SELECT id
  FROM treenode_connector
  WHERE treenode_id = $treenode_id
    AND connector_id = $connector_id
    AND project_id = $project_id
    AND relation_id = $direction_relation_id
EOSQL
                            );
                        if (count($check_result) < 1) {
                            // Then actually insert it:
                            $db->getResult(<<<EOSQL
INSERT INTO treenode_connector
  (project_id, user_id, treenode_id, connector_id, relation_id)
  VALUES ($project_id, $user_id, $treenode_id, $connector_id, $direction_relation_id)
EOSQL
                                );
                        }
                    }
                }
            }

		} catch( Exception $e ) {
			if ($ignoreErrors) {
				error_log("Ignoring the failed migration: ".$e);
				$db->getResult("ROLLBACK TO SAVEPOINT connector_migration");
			} else {
				error_log("The migration failed: ".$e);
				throw $e;
			}
		}
    }
}

/* This is another non-trivial migration, which adds the skeleton_id
 * column to the treenode table, and also populates that column */

class AddSkeletonIDsMigration {
    var $name = "Add skeleton_id column to treenode and populate it";
    function apply( $db, $ignoreErrors) {
        try {
            error_log("Running the migration: ".$this->name);
            $db->getResult("SAVEPOINT add_skeleton_column");

            try {
                $db->getResult("ALTER TABLE treenode ADD COLUMN skeleton_id bigint REFERENCES class_instance(id)");
            } catch( Exception $e ) {
                error_log("Ignoring the failure to add a skeleton_id column to treenode; it's probably already there.");
                $db->getResult("ROLLBACK TO SAVEPOINT add_skeleton_column");
            }

            $db->getResult("SAVEPOINT update_skeleton_columns");

            foreach( $db->getResult("SELECT id FROM project") as $p ) {
                $project_id = $p['id'];
                error_log("Dealing with project: ".$project_id);

                // Get a maps of all the class / relation names to IDs
                // for this project:
                $relations = $db->getMap( $project_id, 'relation' );
                $classes = $db->getMap( $project_id, 'class' );

                if (!isset($relations['element_of'])) {
                    // Then this project probably isn't set up for tracing
                    continue;
                }

                $result = $db->getResult(
"UPDATE treenode SET skeleton_id = found.skeleton_id
   FROM (SELECT treenode_id, class_instance_id as skeleton_id
           FROM treenode_class_instance, class_instance
          WHERE treenode_class_instance.project_id = $project_id AND
                treenode_class_instance.relation_id = {$relations['element_of']} AND
                treenode_class_instance.class_instance_id = class_instance.id AND
                class_instance.class_id = {$classes['skeleton']}) AS found
   WHERE treenode.id = found.treenode_id");
                error_log("result was: ".print_r($result, TRUE));
                if ($result === FALSE) {
                    throw new Exception("Setting the skeleton_id column failed");
                }
            }

		} catch( Exception $e ) {
			if ($ignoreErrors) {
				error_log("Ignoring the failed migration: ".$e);
				$db->getResult("ROLLBACK TO SAVEPOINT update_skeleton_columns");
			} else {
				error_log("The migration failed: ".$e);
				throw $e;
			}
		}
    }
}

// timestamps must be UTC and in the format
// generated by PHP with:
//	$d = gmdate('Y-m-d\TH:i:s', time());

$migrations = array(

	'2011-07-10T19:23:39' => new Migration(
		'Set up the database as scratch as in 5145c06574a2e',
		<<<EOMIGRATION

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = off;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET escape_string_warning = off;
CREATE PROCEDURAL LANGUAGE plpgsql;
SET search_path = public, pg_catalog;
CREATE TYPE double3d AS (
	x double precision,
	y double precision,
	z double precision
);
CREATE TYPE integer3d AS (
	x integer,
	y integer,
	z integer
);
CREATE TYPE rgba AS (
	r real,
	g real,
	b real,
	a real
);
CREATE FUNCTION on_edit() RETURNS trigger
    LANGUAGE plpgsql
    AS \$\$BEGIN
    NEW."edition_time" := now();
    RETURN NEW;
END;
\$\$;
SET default_with_oids = false;
CREATE TABLE bezierkey (
    key point NOT NULL,
    before point,
    after point,
    profile_id integer
);
COMMENT ON COLUMN bezierkey.key IS 'nanometer';
CREATE TABLE profile (
    id integer NOT NULL,
    z double precision NOT NULL,
    object_id integer
);
CREATE SEQUENCE profile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;
ALTER SEQUENCE profile_id_seq OWNED BY profile.id;
CREATE TABLE bezierprofile (
)
INHERITS (profile);
CREATE TABLE broken_slice (
    stack_id integer NOT NULL,
    index integer NOT NULL
);
CREATE TABLE concept (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    creation_time timestamp with time zone DEFAULT now() NOT NULL,
    edition_time timestamp with time zone DEFAULT now() NOT NULL,
    project_id bigint NOT NULL
);
CREATE SEQUENCE concept_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;
ALTER SEQUENCE concept_id_seq OWNED BY concept.id;
CREATE TABLE class (
    class_name character varying(255) NOT NULL,
    uri character varying(2048),
    description text,
    showintree boolean DEFAULT true
)
INHERITS (concept);
COMMENT ON COLUMN class.showintree IS 'does the element appear in the class tree widget?';
CREATE TABLE relation_instance (
    relation_id bigint NOT NULL
)
INHERITS (concept);
COMMENT ON TABLE relation_instance IS 'despite the table names, it is an abstract table only used for inheritance';
CREATE TABLE class_class (
    class_a bigint,
    class_b bigint
)
INHERITS (relation_instance);
COMMENT ON TABLE class_class IS 'relates two classes';
CREATE TABLE class_instance (
    class_id bigint NOT NULL,
    name character varying(255) NOT NULL
)
INHERITS (concept);
CREATE TABLE class_instance_class_instance (
    class_instance_a bigint,
    class_instance_b bigint
)
INHERITS (relation_instance);
COMMENT ON TABLE class_instance_class_instance IS 'relates two class_instances';
CREATE TABLE location (
    location double3d NOT NULL
)
INHERITS (concept);
CREATE TABLE connector (
    confidence integer DEFAULT 5 NOT NULL
)
INHERITS (location);
CREATE TABLE connector_class_instance (
    connector_id bigint NOT NULL,
    class_instance_id bigint NOT NULL
)
INHERITS (relation_instance);
CREATE TABLE message (
    id integer NOT NULL,
    user_id integer NOT NULL,
    "time" timestamp with time zone DEFAULT now() NOT NULL,
    read boolean DEFAULT false NOT NULL,
    title text DEFAULT 'New message'::text NOT NULL,
    text text,
    action text
);
COMMENT ON COLUMN message.action IS 'URL to be executed (remember that this is not safe against man in the middle when not encrypted)';
CREATE SEQUENCE message_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;
ALTER SEQUENCE message_id_seq OWNED BY message.id;
CREATE TABLE object (
    id integer NOT NULL,
    class character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    project_id integer NOT NULL,
    colour rgba DEFAULT ROW((1)::real, (0.5)::real, (0)::real, (0.75)::real) NOT NULL
);
CREATE SEQUENCE object_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;
ALTER SEQUENCE object_id_seq OWNED BY object.id;
CREATE TABLE project (
    id integer NOT NULL,
    title text NOT NULL,
    public boolean DEFAULT true NOT NULL
);
CREATE SEQUENCE project_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;
ALTER SEQUENCE project_id_seq OWNED BY project.id;
CREATE TABLE project_stack (
    project_id integer NOT NULL,
    stack_id integer NOT NULL,
    translation double3d DEFAULT ROW((0)::double precision, (0)::double precision, (0)::double precision) NOT NULL
);
COMMENT ON COLUMN project_stack.translation IS 'nanometer';
CREATE TABLE project_user (
    project_id integer NOT NULL,
    user_id integer NOT NULL
);
CREATE TABLE relation (
    relation_name character varying(255) NOT NULL,
    uri text,
    description text,
    isreciprocal boolean DEFAULT false NOT NULL
)
INHERITS (concept);
COMMENT ON COLUMN relation.isreciprocal IS 'Is the converse of the relationship valid?';
CREATE TABLE stack (
    id integer NOT NULL,
    title text NOT NULL,
    dimension integer3d NOT NULL,
    resolution double3d NOT NULL,
    image_base text NOT NULL,
    comment text,
    trakem2_project boolean DEFAULT false NOT NULL
);
COMMENT ON COLUMN stack.dimension IS 'pixel';
COMMENT ON COLUMN stack.resolution IS 'nanometer per pixel';
COMMENT ON COLUMN stack.image_base IS 'base URL to the images';
COMMENT ON COLUMN stack.trakem2_project IS 'States if a TrakEM2 project file is available for this stack.';
CREATE SEQUENCE stack_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;
ALTER SEQUENCE stack_id_seq OWNED BY stack.id;
CREATE TABLE textlabel (
    id integer NOT NULL,
    type character varying(32) NOT NULL,
    text text DEFAULT 'Edit this text ...'::text NOT NULL,
    colour rgba DEFAULT ROW((1)::real, (0.5)::real, (0)::real, (1)::real) NOT NULL,
    font_name text,
    font_style text,
    font_size double precision DEFAULT 32 NOT NULL,
    project_id integer NOT NULL,
    scaling boolean DEFAULT true NOT NULL,
    creation_time timestamp with time zone DEFAULT now() NOT NULL,
    edition_time timestamp with time zone DEFAULT now() NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    CONSTRAINT textlabel_type_check CHECK ((((type)::text = 'text'::text) OR ((type)::text = 'bubble'::text)))
);
CREATE SEQUENCE textlabel_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;
ALTER SEQUENCE textlabel_id_seq OWNED BY textlabel.id;
CREATE TABLE textlabel_location (
    textlabel_id integer NOT NULL,
    location double3d NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);
CREATE TABLE treenode (
    parent_id bigint,
    radius double precision DEFAULT 0 NOT NULL,
    confidence integer DEFAULT 5 NOT NULL
)
INHERITS (location);
CREATE TABLE treenode_class_instance (
    treenode_id bigint NOT NULL,
    class_instance_id bigint NOT NULL
)
INHERITS (relation_instance);
CREATE TABLE treenode_connector (
    treenode_id bigint NOT NULL,
    connector_id bigint NOT NULL
)
INHERITS (relation_instance);
CREATE TABLE "user" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    pwd character varying(255) NOT NULL,
    longname text
);
CREATE SEQUENCE user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;
ALTER SEQUENCE user_id_seq OWNED BY "user".id;
ALTER TABLE concept ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE message ALTER COLUMN id SET DEFAULT nextval('message_id_seq'::regclass);
ALTER TABLE object ALTER COLUMN id SET DEFAULT nextval('object_id_seq'::regclass);
ALTER TABLE profile ALTER COLUMN id SET DEFAULT nextval('profile_id_seq'::regclass);
ALTER TABLE project ALTER COLUMN id SET DEFAULT nextval('project_id_seq'::regclass);
ALTER TABLE stack ALTER COLUMN id SET DEFAULT nextval('stack_id_seq'::regclass);
ALTER TABLE textlabel ALTER COLUMN id SET DEFAULT nextval('textlabel_id_seq'::regclass);
ALTER TABLE "user" ALTER COLUMN id SET DEFAULT nextval('user_id_seq'::regclass);
ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_layer_pkey PRIMARY KEY (stack_id, index);
ALTER TABLE ONLY class
    ADD CONSTRAINT class_id_key UNIQUE (id);
ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_id_key UNIQUE (id);
ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_id_key UNIQUE (id);
ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY class
    ADD CONSTRAINT class_pkey PRIMARY KEY (id);
ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_id_key UNIQUE (id);
ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY concept
    ADD CONSTRAINT concept_id_key UNIQUE (id);
ALTER TABLE ONLY concept
    ADD CONSTRAINT concept_pkey PRIMARY KEY (id);
ALTER TABLE ONLY connector_class_instance
    ADD CONSTRAINT connector_class_instance_id_key UNIQUE (id);
ALTER TABLE ONLY connector_class_instance
    ADD CONSTRAINT connector_class_instance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY connector
    ADD CONSTRAINT connector_id_key UNIQUE (id);
ALTER TABLE ONLY connector
    ADD CONSTRAINT connector_pkey PRIMARY KEY (id);
ALTER TABLE ONLY location
    ADD CONSTRAINT location_id_key UNIQUE (id);
ALTER TABLE ONLY location
    ADD CONSTRAINT location_pkey PRIMARY KEY (id);
ALTER TABLE ONLY message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);
ALTER TABLE ONLY object
    ADD CONSTRAINT object_id_key UNIQUE (id);
ALTER TABLE ONLY object
    ADD CONSTRAINT object_pkey PRIMARY KEY (class, name);
ALTER TABLE ONLY profile
    ADD CONSTRAINT profile_pkey PRIMARY KEY (id);
ALTER TABLE ONLY project
    ADD CONSTRAINT project_pkey PRIMARY KEY (id);
ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_pkey PRIMARY KEY (project_id, stack_id);
ALTER TABLE ONLY project_user
    ADD CONSTRAINT project_user_pkey PRIMARY KEY (project_id, user_id);
ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_id_key UNIQUE (id);
ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_id_key UNIQUE (id);
ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_pkey PRIMARY KEY (id);
ALTER TABLE ONLY stack
    ADD CONSTRAINT stack_pkey PRIMARY KEY (id);
ALTER TABLE ONLY textlabel
    ADD CONSTRAINT textlabel_pkey PRIMARY KEY (id);
ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_id_key UNIQUE (id);
ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_id_key UNIQUE (id);
ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_pkey PRIMARY KEY (id);
ALTER TABLE ONLY "user"
    ADD CONSTRAINT users_name_key UNIQUE (name);
ALTER TABLE ONLY "user"
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
CREATE INDEX connector_x_index ON connector USING btree (((location).x));
CREATE INDEX connector_y_index ON connector USING btree (((location).y));
CREATE INDEX connector_z_index ON connector USING btree (((location).z));
CREATE INDEX location_x_index ON treenode USING btree (((location).x));
CREATE INDEX location_y_index ON treenode USING btree (((location).y));
CREATE INDEX location_z_index ON treenode USING btree (((location).z));
CREATE TRIGGER apply_edition_time_update
    BEFORE UPDATE ON class_instance
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit
    BEFORE UPDATE ON textlabel
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit
    BEFORE UPDATE ON concept
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_bezierprofile
    BEFORE UPDATE ON bezierprofile
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_class
    BEFORE UPDATE ON class
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_class_class
    BEFORE UPDATE ON class_class
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_class_instance
    BEFORE UPDATE ON class_instance
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_class_instance_class_instance
    BEFORE UPDATE ON class_instance_class_instance
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_connector
    BEFORE UPDATE ON connector
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_connector_class_instance
    BEFORE UPDATE ON connector_class_instance
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_location
    BEFORE UPDATE ON location
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_relation
    BEFORE UPDATE ON relation
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_relation_instance
    BEFORE UPDATE ON relation_instance
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_treenode
    BEFORE UPDATE ON treenode
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_treenode_class_instance
    BEFORE UPDATE ON treenode_class_instance
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_treenode_connector
    BEFORE UPDATE ON treenode_connector
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();
ALTER TABLE ONLY bezierkey
    ADD CONSTRAINT bezierkey_profile_fkey FOREIGN KEY (profile_id) REFERENCES profile(id);
ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_layer_stack_id_fkey FOREIGN KEY (stack_id) REFERENCES stack(id);
ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_class_class_a_fkey FOREIGN KEY (class_a) REFERENCES class(id) ON DELETE CASCADE;
ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_class_class_b_fkey FOREIGN KEY (class_b) REFERENCES class(id) ON DELETE CASCADE;
ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_class_id_fkey FOREIGN KEY (class_id) REFERENCES class(id);
ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_class_instance_class_instance_a_fkey FOREIGN KEY (class_instance_a) REFERENCES class_instance(id) ON DELETE CASCADE;
ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_class_instance_class_instance_b_fkey FOREIGN KEY (class_instance_b) REFERENCES class_instance(id) ON DELETE CASCADE;
ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);
ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);
ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY class
    ADD CONSTRAINT class_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY concept
    ADD CONSTRAINT concept_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY connector_class_instance
    ADD CONSTRAINT connector_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id) REFERENCES class_instance(id);
ALTER TABLE ONLY connector_class_instance
    ADD CONSTRAINT connector_class_instance_location_id_fkey FOREIGN KEY (connector_id) REFERENCES connector(id) ON DELETE CASCADE;
ALTER TABLE ONLY connector_class_instance
    ADD CONSTRAINT connector_class_instance_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);
ALTER TABLE ONLY connector_class_instance
    ADD CONSTRAINT connector_class_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);
ALTER TABLE ONLY connector_class_instance
    ADD CONSTRAINT connector_class_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY message
    ADD CONSTRAINT message_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY object
    ADD CONSTRAINT object_project_fkey FOREIGN KEY (project_id) REFERENCES project(id);
ALTER TABLE ONLY profile
    ADD CONSTRAINT profile_object_fkey FOREIGN KEY (object_id) REFERENCES object(id);
ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);
ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_stack_id_fkey FOREIGN KEY (stack_id) REFERENCES stack(id);
ALTER TABLE ONLY project_user
    ADD CONSTRAINT project_user_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);
ALTER TABLE ONLY project_user
    ADD CONSTRAINT project_user_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY textlabel_location
    ADD CONSTRAINT textlabel_location_textlabel_id_fkey FOREIGN KEY (textlabel_id) REFERENCES textlabel(id);
ALTER TABLE ONLY textlabel
    ADD CONSTRAINT textlabel_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);
ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id) REFERENCES class_instance(id) ON DELETE CASCADE;
ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);
ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_treenode_id_fkey FOREIGN KEY (treenode_id) REFERENCES treenode(id) ON DELETE CASCADE;
ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES treenode(id);

EOMIGRATION
),

	'2011-07-12T17:22:30' => new Migration(
		'Remove unused table. Closes #79',
		<<<EOMIGRATION
DROP TABLE "bezierkey" CASCADE;
DROP TABLE "bezierprofile" CASCADE;
DROP TABLE "broken_slice" CASCADE;
DROP TABLE "object" CASCADE;
DROP TABLE "profile" CASCADE;
EOMIGRATION
),

	'2011-07-12T17:30:44' => new Migration(
		'Removed unused columns from class table. Closes #83',
		<<<EOMIGRATION
ALTER TABLE "class" DROP COLUMN "showintree";
ALTER TABLE "class" DROP COLUMN "uri";
EOMIGRATION
),

	'2011-07-12T19:48:11' => new Migration(
		'Create table broken_slice',
		<<<EOMIGRATION
CREATE TABLE broken_slice (
    stack_id integer NOT NULL,
    index integer NOT NULL
	);
EOMIGRATION
),

	'2011-10-30T16:10:19' => new SpecialConnectorMigration(),

	'2011-11-23T10:18:23' => new AddSkeletonIDsMigration(),

	'2011-11-24T14:35:19' => new Migration(
		'Adding overlay table',
		<<<EOMIGRATION
CREATE TABLE "overlay" (
    id integer NOT NULL,
    stack_id integer NOT NULL,
    title text NOT NULL,
    image_base text NOT NULL,
    default_opacity integer DEFAULT 0 NOT NULL
);
CREATE SEQUENCE overlay_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;
ALTER SEQUENCE overlay_id_seq OWNED BY "overlay".id;
ALTER TABLE ONLY "overlay"
    ADD CONSTRAINT overlay_pkey PRIMARY KEY (id);
ALTER TABLE ONLY "overlay"
    ADD CONSTRAINT overlay_stack_id_fkey FOREIGN KEY (stack_id) REFERENCES stack(id) ON DELETE CASCADE;
ALTER TABLE "overlay" ALTER COLUMN id SET DEFAULT nextval('overlay_id_seq'::regclass);
EOMIGRATION
),

	// INSERT NEW MIGRATIONS HERE
	// (Don't remove the previous line, or inserting migration templates
	// won't work.)
	);

?>
