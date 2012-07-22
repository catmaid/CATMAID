SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;
COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';
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
    AS $$BEGIN
    NEW."edition_time" := now();
    RETURN NEW;
END;
$$;
SET default_with_oids = false;
CREATE TABLE applied_migrations (
    id character varying(32) NOT NULL
);
CREATE SEQUENCE broken_slice_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
SELECT pg_catalog.setval('broken_slice_id_seq', 1, false);
CREATE TABLE broken_slice (
    stack_id integer NOT NULL,
    index integer NOT NULL,
    id integer DEFAULT nextval('broken_slice_id_seq'::regclass) NOT NULL
);
CREATE TABLE concept (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    creation_time timestamp with time zone DEFAULT now() NOT NULL,
    edition_time timestamp with time zone DEFAULT now() NOT NULL,
    project_id bigint NOT NULL
);
CREATE TABLE class (
    class_name character varying(255) NOT NULL,
    description text
)
INHERITS (concept);
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
CREATE SEQUENCE concept_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE concept_id_seq OWNED BY concept.id;
SELECT pg_catalog.setval('concept_id_seq', 2439, true);
CREATE TABLE location (
    location double3d NOT NULL,
    reviewer_id integer DEFAULT (-1) NOT NULL,
    review_time timestamp with time zone
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
CREATE TABLE log (
    operation_type character varying(255) NOT NULL,
    location double3d,
    freetext text
)
INHERITS (concept);
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
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE message_id_seq OWNED BY message.id;
SELECT pg_catalog.setval('message_id_seq', 1, false);
CREATE TABLE "overlay" (
    id integer NOT NULL,
    stack_id integer NOT NULL,
    title text NOT NULL,
    image_base text NOT NULL,
    default_opacity integer DEFAULT 0 NOT NULL,
    file_extension text NOT NULL
);
CREATE SEQUENCE overlay_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE overlay_id_seq OWNED BY "overlay".id;
SELECT pg_catalog.setval('overlay_id_seq', 1, false);
CREATE TABLE project (
    id integer NOT NULL,
    title text NOT NULL,
    public boolean DEFAULT true NOT NULL,
    wiki_base_url text
);
CREATE SEQUENCE project_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE project_id_seq OWNED BY project.id;
SELECT pg_catalog.setval('project_id_seq', 5, true);
CREATE SEQUENCE project_stack_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
SELECT pg_catalog.setval('project_stack_id_seq', 4, true);
CREATE TABLE project_stack (
    project_id integer NOT NULL,
    stack_id integer NOT NULL,
    translation double3d DEFAULT ROW((0)::double precision, (0)::double precision, (0)::double precision) NOT NULL,
    id integer DEFAULT nextval('project_stack_id_seq'::regclass) NOT NULL
);
COMMENT ON COLUMN project_stack.translation IS 'nanometer';
CREATE TABLE project_user (
    project_id integer NOT NULL,
    user_id integer NOT NULL,
    can_edit_any boolean DEFAULT false,
    can_view_any boolean DEFAULT false,
    inverse_mouse_wheel boolean DEFAULT false
);
CREATE TABLE relation (
    relation_name character varying(255) NOT NULL,
    uri text,
    description text,
    isreciprocal boolean DEFAULT false NOT NULL
)
INHERITS (concept);
COMMENT ON COLUMN relation.isreciprocal IS 'Is the converse of the relationship valid?';
CREATE TABLE sessions (
    id integer NOT NULL,
    session_id character(26),
    data text DEFAULT ''::text,
    last_accessed timestamp without time zone
);
CREATE SEQUENCE sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE sessions_id_seq OWNED BY sessions.id;
SELECT pg_catalog.setval('sessions_id_seq', 47, true);
CREATE TABLE settings (
    key text NOT NULL,
    value text
);
CREATE TABLE stack (
    id integer NOT NULL,
    title text NOT NULL,
    dimension integer3d NOT NULL,
    resolution double3d NOT NULL,
    image_base text NOT NULL,
    comment text,
    trakem2_project boolean DEFAULT false NOT NULL,
    num_zoom_levels integer DEFAULT (-1) NOT NULL,
    file_extension text DEFAULT 'jpg'::text NOT NULL,
    tile_width integer DEFAULT 256 NOT NULL,
    tile_height integer DEFAULT 256 NOT NULL,
    tile_source_type integer DEFAULT 1 NOT NULL,
    metadata text DEFAULT ''::text NOT NULL
);
COMMENT ON COLUMN stack.dimension IS 'pixel';
COMMENT ON COLUMN stack.resolution IS 'nanometer per pixel';
COMMENT ON COLUMN stack.image_base IS 'base URL to the images';
COMMENT ON COLUMN stack.trakem2_project IS 'States if a TrakEM2 project file is available for this stack.';
CREATE SEQUENCE stack_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE stack_id_seq OWNED BY stack.id;
SELECT pg_catalog.setval('stack_id_seq', 6, true);
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
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE textlabel_id_seq OWNED BY textlabel.id;
SELECT pg_catalog.setval('textlabel_id_seq', 1, false);
CREATE SEQUENCE textlabel_location_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
SELECT pg_catalog.setval('textlabel_location_id_seq', 1, false);
CREATE TABLE textlabel_location (
    textlabel_id integer NOT NULL,
    location double3d NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    id integer DEFAULT nextval('textlabel_location_id_seq'::regclass) NOT NULL
);
CREATE TABLE treenode (
    parent_id bigint,
    radius double precision DEFAULT 0 NOT NULL,
    confidence integer DEFAULT 5 NOT NULL,
    skeleton_id bigint
)
INHERITS (location);
CREATE TABLE treenode_class_instance (
    treenode_id bigint NOT NULL,
    class_instance_id bigint NOT NULL
)
INHERITS (relation_instance);
CREATE TABLE treenode_connector (
    treenode_id bigint NOT NULL,
    connector_id bigint NOT NULL,
    skeleton_id bigint,
    confidence integer DEFAULT 5 NOT NULL
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
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE user_id_seq OWNED BY "user".id;
SELECT pg_catalog.setval('user_id_seq', 4, true);
ALTER TABLE ONLY class ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY class ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY class ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY class_class ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY class_class ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY class_class ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY class_instance ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY class_instance ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY class_instance_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY class_instance_class_instance ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY class_instance_class_instance ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY concept ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY connector ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY connector ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY connector ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY connector ALTER COLUMN reviewer_id SET DEFAULT (-1);
ALTER TABLE ONLY connector_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY connector_class_instance ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY connector_class_instance ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY location ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY location ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY location ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY log ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY log ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY log ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY message ALTER COLUMN id SET DEFAULT nextval('message_id_seq'::regclass);
ALTER TABLE ONLY "overlay" ALTER COLUMN id SET DEFAULT nextval('overlay_id_seq'::regclass);
ALTER TABLE ONLY project ALTER COLUMN id SET DEFAULT nextval('project_id_seq'::regclass);
ALTER TABLE ONLY relation ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY relation ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY relation ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY relation_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY relation_instance ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY relation_instance ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY sessions ALTER COLUMN id SET DEFAULT nextval('sessions_id_seq'::regclass);
ALTER TABLE ONLY stack ALTER COLUMN id SET DEFAULT nextval('stack_id_seq'::regclass);
ALTER TABLE ONLY textlabel ALTER COLUMN id SET DEFAULT nextval('textlabel_id_seq'::regclass);
ALTER TABLE ONLY treenode ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY treenode ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY treenode ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY treenode ALTER COLUMN reviewer_id SET DEFAULT (-1);
ALTER TABLE ONLY treenode_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY treenode_class_instance ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY treenode_class_instance ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY treenode_connector ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);
ALTER TABLE ONLY treenode_connector ALTER COLUMN creation_time SET DEFAULT now();
ALTER TABLE ONLY treenode_connector ALTER COLUMN edition_time SET DEFAULT now();
ALTER TABLE ONLY "user" ALTER COLUMN id SET DEFAULT nextval('user_id_seq'::regclass);
INSERT INTO applied_migrations (id) VALUES ('2011-07-10T19:23:39');
INSERT INTO applied_migrations (id) VALUES ('2011-07-12T17:22:30');
INSERT INTO applied_migrations (id) VALUES ('2011-07-12T17:30:44');
INSERT INTO applied_migrations (id) VALUES ('2011-07-12T19:48:11');
INSERT INTO applied_migrations (id) VALUES ('2011-10-19T08:33:49');
INSERT INTO applied_migrations (id) VALUES ('2011-10-20T15:14:59');
INSERT INTO applied_migrations (id) VALUES ('2011-10-30T16:10:19');
INSERT INTO applied_migrations (id) VALUES ('2011-11-23T10:18:23');
INSERT INTO applied_migrations (id) VALUES ('2011-11-24T14:35:19');
INSERT INTO applied_migrations (id) VALUES ('2011-12-13T17:21:03');
INSERT INTO applied_migrations (id) VALUES ('2011-12-14T13:42:27');
INSERT INTO applied_migrations (id) VALUES ('2011-12-14T18:42:00');
INSERT INTO applied_migrations (id) VALUES ('2011-12-20T13:42:27');
INSERT INTO applied_migrations (id) VALUES ('2011-12-12T10:18:23');
INSERT INTO applied_migrations (id) VALUES ('2011-12-27T12:51:12');
INSERT INTO applied_migrations (id) VALUES ('2012-01-15T14:45:48');
INSERT INTO applied_migrations (id) VALUES ('2012-02-07T15:50:32');
INSERT INTO applied_migrations (id) VALUES ('2012-02-14T08:46:38');
INSERT INTO applied_migrations (id) VALUES ('2012-02-14T14:32:05');
INSERT INTO applied_migrations (id) VALUES ('2012-02-27T13:10:42');
INSERT INTO applied_migrations (id) VALUES ('2012-03-08T10:00:16');
INSERT INTO applied_migrations (id) VALUES ('2012-03-22T20:16:56');
INSERT INTO applied_migrations (id) VALUES ('2012-03-25 T01:26:02');
INSERT INTO applied_migrations (id) VALUES ('2012-03-30T15:56:17');
INSERT INTO applied_migrations (id) VALUES ('2012-04-06T16:06:41');
INSERT INTO applied_migrations (id) VALUES ('2012-04-06T16:07:41');
INSERT INTO applied_migrations (id) VALUES ('2012-04-06T18:06:41');
INSERT INTO applied_migrations (id) VALUES ('2012-04-06T18:07:41');
INSERT INTO applied_migrations (id) VALUES ('2012-04-10T10:15:16');
INSERT INTO applied_migrations (id) VALUES ('2012-04-12T15:59:28');
INSERT INTO applied_migrations (id) VALUES ('2012-05-16T12:20:53');
INSERT INTO applied_migrations (id) VALUES ('2012-07-10T20:43:35');
INSERT INTO applied_migrations (id) VALUES ('2012-07-10T20:44:35');
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (5, 1, '2010-08-26 18:23:53.551017+02', '2010-08-26 18:23:53.551017+02', 3, 'neuron', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (14, 1, '2010-08-26 19:19:57.046457+02', '2010-08-26 19:19:57.046457+02', 3, 'skeleton', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (33, 3, '2010-08-27 17:28:08.713582+02', '2010-08-27 17:28:08.713582+02', 3, 'label', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (106, 3, '2010-10-12 09:42:55.856494+02', '2010-10-12 09:42:55.856494+02', 3, 'group', 'A group helps to organize the data, i.e. it can contain neuron or other groups.');
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (112, 3, '2010-10-12 11:29:38.385393+02', '2010-10-12 11:29:38.385393+02', 3, 'root', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (411, 3, '2011-10-04 19:32:34.506949+02', '2011-10-04 19:32:34.506949+02', 3, 'driver_line', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (412, 3, '2011-10-04 19:32:34.506949+02', '2011-10-04 19:32:34.506949+02', 3, 'cell_body_location', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (515, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'skeleton', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (516, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'neuron', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (517, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'group', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (518, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'label', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (519, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'root', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (520, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'synapse', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (521, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'presynaptic terminal', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (522, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'postsynaptic terminal', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (2325, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'skeleton', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (2326, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'neuron', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (2327, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'group', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (2328, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'label', NULL);
INSERT INTO class (id, user_id, creation_time, edition_time, project_id, class_name, description) VALUES (2329, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'root', NULL);
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (1, 3, '2011-09-04 13:53:41.243573+02', '2011-09-27 13:48:37.277312+02', 3, 14, 'dull skeleton');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2, 3, '2011-09-04 13:53:41.243573+02', '2011-09-27 13:48:29.997028+02', 3, 5, 'dull neuron');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (4, 3, '2011-09-04 13:53:41.243573+02', '2011-09-04 13:53:41.243573+02', 3, 106, 'Fragments');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (231, 3, '2011-09-27 13:48:43.167881+02', '2011-09-27 13:48:43.167881+02', 3, 106, 'group');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (233, 3, '2011-09-27 13:48:58.901501+02', '2011-09-27 13:50:32.627152+02', 3, 5, 'branched neuron');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (235, 3, '2011-09-27 13:49:15.802728+02', '2011-09-27 13:49:15.802728+02', 3, 14, 'skeleton 235');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (351, 3, '2011-09-27 13:56:45.641229+02', '2011-09-27 13:56:45.641229+02', 3, 33, 'TODO');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (361, 3, '2011-09-27 13:57:17.808802+02', '2011-09-27 13:57:17.808802+02', 3, 14, 'skeleton 361');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (362, 3, '2011-09-27 13:57:17.808802+02', '2011-09-27 13:59:24.247614+02', 3, 5, 'downstream-B');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (364, 3, '2011-09-27 13:57:17.808802+02', '2011-09-27 13:57:17.808802+02', 3, 106, 'Isolated synaptic terminals');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (373, 3, '2011-09-27 13:57:19.447829+02', '2011-09-27 13:57:19.447829+02', 3, 14, 'skeleton 373');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (374, 3, '2011-09-27 13:57:19.447829+02', '2011-09-27 13:59:15.32579+02', 3, 5, 'downstream-A');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (439, 3, '2011-10-11 18:08:06.575894+02', '2011-10-11 18:08:06.575922+02', 3, 411, '');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (440, 3, '2011-10-11 18:09:59.16995+02', '2011-10-11 18:09:59.169978+02', 3, 411, '');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (442, 3, '2011-10-11 18:10:50.221027+02', '2011-10-11 18:10:50.221056+02', 3, 411, '');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (444, 3, '2011-10-11 18:12:49.855074+02', '2011-10-11 18:12:49.855103+02', 3, 411, '');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (446, 3, '2011-10-11 18:13:53.305909+02', '2011-10-11 18:13:53.305937+02', 3, 411, '');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (448, 3, '2011-10-11 18:14:46.115604+02', '2011-10-11 18:14:46.115632+02', 3, 411, '');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (450, 3, '2011-10-11 18:14:59.661712+02', '2011-10-11 18:14:59.661739+02', 3, 411, '');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (452, 3, '2011-10-12 11:29:11.321693+02', '2011-10-12 11:29:11.321724+02', 3, 411, 'bye');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (454, 3, '2011-10-12 11:29:21.459321+02', '2011-10-12 11:29:21.459349+02', 3, 411, 'and');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (456, 3, '2011-10-12 11:29:27.759957+02', '2011-10-12 11:29:27.759991+02', 3, 411, 'more');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (458, 3, '2011-10-12 11:45:17.870791+02', '2011-10-12 11:45:17.870819+02', 3, 411, 'c005');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (460, 3, '2011-10-12 11:52:35.254227+02', '2011-10-12 11:52:35.254256+02', 3, 411, 'hello');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (462, 3, '2011-10-12 13:08:01.761541+02', '2011-10-12 13:08:01.76157+02', 3, 411, 'foo');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (465, 3, '2011-10-12 20:04:21.957305+02', '2011-10-12 20:04:21.957334+02', 3, 411, 'tubby bye bye');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (485, 3, '2011-10-14 11:01:46.885562+02', '2011-10-14 11:01:46.885595+02', 3, 412, 'Local');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (487, 3, '2011-10-14 11:02:09.927985+02', '2011-10-14 11:02:09.928013+02', 3, 412, 'Non-Local');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (523, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 519, 'neuropile');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2323, 3, '2011-01-13 15:10:41.563809+01', '2011-01-13 15:10:41.563809+01', 3, 112, 'neuropile');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2333, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 2329, 'neuropile');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2342, 3, '2011-10-31 10:22:24.134437+01', '2011-10-31 10:22:24.134437+01', 3, 33, 'uncertain end');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2345, 3, '2011-10-31 10:22:29.999663+01', '2011-10-31 10:22:29.999663+01', 3, 33, 't');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2353, 3, '2011-10-31 10:24:57.406099+01', '2011-10-31 10:24:57.406099+01', 3, 33, 'synapse with more targets');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2364, 2, '2011-11-01 17:54:42.122069+01', '2011-11-01 17:54:42.122069+01', 3, 14, 'skeleton 2364');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2365, 2, '2011-11-01 17:54:42.122069+01', '2011-11-01 17:54:42.122069+01', 3, 5, 'neuron 2365');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2381, 3, '2011-11-26 11:35:22.961336+01', '2011-11-26 11:35:22.961336+01', 3, 5, 'neuron 2381');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2388, 3, '2011-12-09 14:01:37.57599+01', '2011-12-09 14:01:37.57599+01', 3, 14, 'skeleton 2388');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2389, 3, '2011-12-09 14:01:37.57599+01', '2011-12-09 14:01:37.57599+01', 3, 5, 'neuron 2389');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2411, 3, '2011-12-09 14:01:59.149053+01', '2011-12-09 14:01:59.149053+01', 3, 14, 'skeleton 2411');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2412, 3, '2011-12-09 14:01:59.149053+01', '2011-12-09 14:01:59.149053+01', 3, 5, 'neuron 2412');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2433, 3, '2012-07-22 22:50:57.758826+02', '2012-07-22 22:50:57.758826+02', 3, 14, 'skeleton 2433');
INSERT INTO class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) VALUES (2434, 3, '2012-07-22 22:50:57.758826+02', '2012-07-22 22:50:57.758826+02', 3, 5, 'neuron 2434');
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (3, 3, '2011-09-04 13:53:41.243573+02', '2011-09-04 13:53:41.243573+02', 3, 10, 1, 2);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (5, 3, '2011-09-04 13:53:41.243573+02', '2011-09-04 13:53:41.243573+02', 3, 9, 4, 2323);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (6, 3, '2011-09-04 13:53:41.243573+02', '2011-09-04 13:53:41.243573+02', 3, 9, 2, 4);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (232, 3, '2011-09-27 13:48:43.167881+02', '2011-09-27 13:48:43.167881+02', 3, 9, 231, 2323);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (234, 3, '2011-09-27 13:48:58.901501+02', '2011-09-27 13:48:58.901501+02', 3, 9, 233, 231);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (236, 3, '2011-09-27 13:49:15.802728+02', '2011-09-27 13:49:15.802728+02', 3, 10, 235, 233);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (363, 3, '2011-09-27 13:57:17.808802+02', '2011-09-27 13:57:17.808802+02', 3, 10, 361, 362);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (365, 3, '2011-09-27 13:57:17.808802+02', '2011-09-27 13:57:17.808802+02', 3, 9, 364, 2323);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (366, 3, '2011-09-27 13:57:17.808802+02', '2011-09-27 13:57:17.808802+02', 3, 9, 362, 364);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (375, 3, '2011-09-27 13:57:19.447829+02', '2011-09-27 13:57:19.447829+02', 3, 10, 373, 374);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (376, 3, '2011-09-27 13:57:19.447829+02', '2011-09-27 13:57:19.447829+02', 3, 9, 374, 364);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (459, 3, '2011-10-12 11:45:38.932521+02', '2011-10-12 11:45:38.932558+02', 3, 413, 458, 233);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (467, 3, '2011-10-12 20:41:38.786729+02', '2011-10-12 20:41:38.786755+02', 3, 413, 462, 362);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (486, 3, '2011-10-14 11:01:47.280798+02', '2011-10-14 11:01:47.280841+02', 3, 414, 233, 485);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (488, 3, '2011-10-14 11:02:09.976416+02', '2011-10-14 11:02:09.976457+02', 3, 414, 374, 487);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (514, 3, '2011-10-28 10:57:18.966033+02', '2011-10-28 10:57:18.966067+02', 3, 413, 462, 374);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (2366, 2, '2011-11-01 17:54:42.122069+01', '2011-11-01 17:54:42.122069+01', 3, 10, 2364, 2365);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (2367, 2, '2011-11-01 17:54:42.122069+01', '2011-11-01 17:54:42.122069+01', 3, 9, 2365, 4);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (2383, 3, '2011-11-26 11:35:22.961336+01', '2011-11-26 11:35:22.961336+01', 3, 9, 2381, 4);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (2390, 3, '2011-12-09 14:01:37.57599+01', '2011-12-09 14:01:37.57599+01', 3, 10, 2388, 2389);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (2391, 3, '2011-12-09 14:01:37.57599+01', '2011-12-09 14:01:37.57599+01', 3, 9, 2389, 4);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (2413, 3, '2011-12-09 14:01:59.149053+01', '2011-12-09 14:01:59.149053+01', 3, 10, 2411, 2412);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (2414, 3, '2011-12-09 14:01:59.149053+01', '2011-12-09 14:01:59.149053+01', 3, 9, 2412, 4);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (2435, 3, '2012-07-22 22:50:57.758826+02', '2012-07-22 22:50:57.758826+02', 3, 10, 2433, 2434);
INSERT INTO class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) VALUES (2436, 3, '2012-07-22 22:50:57.758826+02', '2012-07-22 22:50:57.758826+02', 3, 9, 2434, 4);
INSERT INTO connector (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, confidence) VALUES (356, 3, '2011-09-27 13:57:15.967079+02', '2011-10-27 16:45:09.87073+02', 3, '(6730,2700,0)', -1, NULL, 5);
INSERT INTO connector (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, confidence) VALUES (421, 3, '2011-10-07 13:02:22.656859+02', '2011-10-07 13:02:30.396118+02', 3, '(6260,3990,0)', -1, NULL, 5);
INSERT INTO connector (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, confidence) VALUES (432, 3, '2011-10-11 16:49:08.042058+02', '2011-10-31 10:22:37.263519+01', 3, '(2640,3450,0)', -1, NULL, 5);
INSERT INTO connector (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, confidence) VALUES (2400, 3, '2011-12-09 14:01:43.965389+01', '2011-12-09 14:01:43.965389+01', 3, '(3400,5620,0)', -1, NULL, 5);
INSERT INTO connector_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, connector_id, class_instance_id) VALUES (2354, 3, '2011-10-31 10:24:57.406099+01', '2011-10-31 10:24:57.406099+01', 3, 35, 432, 2353);
INSERT INTO connector_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, connector_id, class_instance_id) VALUES (2355, 3, '2011-10-31 10:24:57.406099+01', '2011-10-31 10:24:57.406099+01', 3, 35, 432, 351);
INSERT INTO message (id, user_id, "time", read, title, text, action) VALUES (1, 3, '2011-12-19 16:46:01.360422+01', false, 'Message 1', 'Contents of message 1.', 'http://www.example.com/message1');
INSERT INTO message (id, user_id, "time", read, title, text, action) VALUES (2, 3, '2011-12-20 16:46:01.360422+01', false, 'Message 2', 'Contents of message 2.', 'http://www.example.com/message2');
INSERT INTO message (id, user_id, "time", read, title, text, action) VALUES (3, 3, '2011-12-21 16:46:01.360422+01', true, 'Message 3', 'Contents of message 3.', 'http://www.example.com/message3');
INSERT INTO message (id, user_id, "time", read, title, text, action) VALUES (4, 3, '2011-12-22 16:46:01.360422+01', true, 'Message 4', 'Contents of message 4.', 'http://www.example.com/message4');
INSERT INTO log (id, user_id, creation_time, edition_time, project_id, operation_type, location, freetext) VALUES (2439, 3, '2012-07-22 22:50:57.758826+02', '2012-07-22 22:50:57.758826+02', 3, 'create_neuron', '(5290,3930,279)', 'Create neuron 2434 and skeleton 2433');
INSERT INTO project (id, title, public, wiki_base_url) VALUES (1, 'Default Project', true, NULL);
INSERT INTO project (id, title, public, wiki_base_url) VALUES (2, 'Evaluation data set', true, NULL);
INSERT INTO project (id, title, public, wiki_base_url) VALUES (3, 'Focussed Ion Beam (FIB)', true, NULL);
INSERT INTO project (id, title, public, wiki_base_url) VALUES (5, 'Private version of the FIB data set', false, NULL);
INSERT INTO project_stack (project_id, stack_id, translation, id) VALUES (1, 1, '(0,0,0)', 1);
INSERT INTO project_stack (project_id, stack_id, translation, id) VALUES (3, 3, '(0,0,0)', 2);
INSERT INTO project_stack (project_id, stack_id, translation, id) VALUES (5, 5, '(0,0,0)', 3);
INSERT INTO project_stack (project_id, stack_id, translation, id) VALUES (5, 6, '(0,0,0)', 4);
INSERT INTO project_user (project_id, user_id, can_edit_any, can_view_any, inverse_mouse_wheel) VALUES (1, 1, true, true, false);
INSERT INTO project_user (project_id, user_id, can_edit_any, can_view_any, inverse_mouse_wheel) VALUES (1, 3, true, true, false);
INSERT INTO project_user (project_id, user_id, can_edit_any, can_view_any, inverse_mouse_wheel) VALUES (2, 3, true, true, false);
INSERT INTO project_user (project_id, user_id, can_edit_any, can_view_any, inverse_mouse_wheel) VALUES (3, 1, true, true, false);
INSERT INTO project_user (project_id, user_id, can_edit_any, can_view_any, inverse_mouse_wheel) VALUES (3, 3, true, true, false);
INSERT INTO project_user (project_id, user_id, can_edit_any, can_view_any, inverse_mouse_wheel) VALUES (5, 3, true, true, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (8, 1, '2010-08-26 19:08:19.488588+02', '2010-08-26 19:08:19.488588+02', 3, 'is_a', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (9, 1, '2010-08-26 19:15:22.408939+02', '2010-08-26 19:15:22.408939+02', 3, 'part_of', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (10, 1, '2010-08-26 19:15:31.939089+02', '2010-08-26 19:15:31.939089+02', 3, 'model_of', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (11, 1, '2010-08-26 19:15:41.060476+02', '2010-08-26 19:15:41.060476+02', 3, 'element_of', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (23, 1, '2010-08-26 21:20:51.55492+02', '2010-08-26 21:20:51.55492+02', 3, 'presynaptic_to', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (24, 1, '2010-08-26 21:21:35.859377+02', '2010-08-26 21:21:35.859377+02', 3, 'postsynaptic_to', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (35, 3, '2010-08-27 17:30:10.480635+02', '2010-08-27 17:30:10.480635+02', 3, 'labeled_as', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (413, 3, '2011-10-04 19:32:34.506949+02', '2011-10-04 19:32:34.506949+02', 3, 'expresses_in', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (414, 3, '2011-10-04 19:32:34.506949+02', '2011-10-04 19:32:34.506949+02', 3, 'has_cell_body', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (524, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'labeled_as', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (525, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'postsynaptic_to', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (526, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'presynaptic_to', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (527, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'element_of', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (528, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'model_of', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (529, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'part_of', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (530, 3, '2011-10-29 10:05:55.864926+02', '2011-10-29 10:05:55.864926+02', 4, 'is_a', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (2334, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'labeled_as', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (2335, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'postsynaptic_to', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (2336, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'presynaptic_to', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (2337, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'element_of', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (2338, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'model_of', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (2339, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'part_of', NULL, NULL, false);
INSERT INTO relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) VALUES (2340, 3, '2011-10-29 10:33:34.26307+02', '2011-10-29 10:33:34.26307+02', 5, 'is_a', NULL, NULL, false);
INSERT INTO settings (key, value) VALUES ('schema_version', '2012-07-10T20:44:35');
INSERT INTO stack (id, title, dimension, resolution, image_base, comment, trakem2_project, num_zoom_levels, file_extension, tile_width, tile_height, tile_source_type, metadata) VALUES (1, 'Original data.', '(4096,4096,16)', '(3.26140000000000008,3.26140000000000008,60)', 'http://fly.mpi-cbg.de/map/evaluation/original/', '<p>&copy;2007 by Stephan Saalfeld.</p> <p>Rendered with <a href="http://www.povray.org/">POV-Ray&nbsp;v3.6</a> using this <a href="http://fly.mpi-cbg.de/~saalfeld/download/volume.tar.bz2">scene-file</a>.</p>', false, -1, 'jpg', 256, 256, 1, '');
INSERT INTO stack (id, title, dimension, resolution, image_base, comment, trakem2_project, num_zoom_levels, file_extension, tile_width, tile_height, tile_source_type, metadata) VALUES (3, 'Focussed Ion Beam (FIB) stack of Rat Striatum	', '(2048,1536,460)', '(5,5,9)', 'http://incf.ini.uzh.ch/image-stack-fib/', '<p>&copy;2009 <a href="http://people.epfl.ch/graham.knott">Graham Knott</a>.</p> <p>Public INCF data set available at the <a href="http://www.incf.org/about/nodes/switzerland/data">Swiss INCF Node</a>.</p>', false, -1, 'jpg', 256, 256, 1, '');
INSERT INTO stack (id, title, dimension, resolution, image_base, comment, trakem2_project, num_zoom_levels, file_extension, tile_width, tile_height, tile_source_type, metadata) VALUES (5, 'FIB data, first stack', '(2048,1536,460)', '(5,5,9)', 'http://incf.ini.uzh.ch/image-stack-fib/', 'Stack 1 for testing purposes', false, -1, 'jpg', 256, 256, 1, '');
INSERT INTO stack (id, title, dimension, resolution, image_base, comment, trakem2_project, num_zoom_levels, file_extension, tile_width, tile_height, tile_source_type, metadata) VALUES (6, 'FIB data, second stack', '(2048,1536,460)', '(5,5,9)', 'http://incf.ini.uzh.ch/image-stack-fib/', 'Stack 2 for testing purposes', false, -1, 'jpg', 256, 256, 1, '');
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (7, 3, '2011-09-04 13:53:41.243573+02', '2011-12-05 19:51:36.955507+01', 3, '(3590,3240,0)', -1, NULL, NULL, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (11, 3, '2011-09-04 13:54:16.301746+02', '2011-12-05 19:51:36.955507+01', 3, '(3600,3250,9)', -1, NULL, 7, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (13, 3, '2011-09-04 13:54:24.528781+02', '2011-12-05 19:51:36.955507+01', 3, '(3600,3250,18)', -1, NULL, 11, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (15, 3, '2011-09-04 13:54:26.464274+02', '2011-12-05 19:51:36.955507+01', 3, '(3590,3250,27)', -1, NULL, 13, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (17, 3, '2011-09-04 13:54:28.52379+02', '2011-12-05 19:51:36.955507+01', 3, '(3590,3250,36)', -1, NULL, 15, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (237, 3, '2011-09-27 13:49:15.802728+02', '2011-12-05 19:51:36.955507+01', 3, '(1065,3035,0)', -1, NULL, NULL, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (239, 3, '2011-09-27 13:49:16.553595+02', '2011-12-05 19:51:36.955507+01', 3, '(1135,2800,0)', -1, NULL, 237, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (241, 3, '2011-09-27 13:49:17.217158+02', '2011-12-05 19:51:36.955507+01', 3, '(1340,2660,0)', -1, NULL, 239, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (243, 3, '2011-09-27 13:49:17.660828+02', '2011-12-05 19:51:36.955507+01', 3, '(1780,2570,0)', -1, NULL, 241, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (245, 3, '2011-09-27 13:49:18.343749+02', '2011-12-05 19:51:36.955507+01', 3, '(1970,2595,0)', -1, NULL, 243, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (247, 3, '2011-09-27 13:49:19.012273+02', '2011-12-05 19:51:36.955507+01', 3, '(2610,2700,0)', -1, NULL, 245, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (249, 3, '2011-09-27 13:49:19.88757+02', '2011-12-05 19:51:36.955507+01', 3, '(2815,2590,0)', -1, NULL, 247, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (251, 3, '2011-09-27 13:49:20.514048+02', '2011-12-05 19:51:36.955507+01', 3, '(3380,2330,0)', -1, NULL, 249, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (253, 3, '2011-09-27 13:49:21.493556+02', '2011-12-05 19:51:36.955507+01', 3, '(3685,2160,0)', -1, NULL, 251, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (255, 3, '2011-09-27 13:49:22.835442+02', '2011-12-05 19:51:36.955507+01', 3, '(3850,1790,0)', -1, NULL, 253, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (257, 3, '2011-09-27 13:49:23.591338+02', '2011-12-05 19:51:36.955507+01', 3, '(3825,1480,0)', -1, NULL, 255, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (259, 3, '2011-09-27 13:49:24.87934+02', '2011-12-05 19:51:36.955507+01', 3, '(3445,1385,0)', -1, NULL, 257, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (261, 3, '2011-09-27 13:49:25.549003+02', '2011-12-05 19:51:36.955507+01', 3, '(2820,1345,0)', -1, NULL, 259, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (263, 3, '2011-09-27 13:49:27.637652+02', '2011-12-05 19:51:36.955507+01', 3, '(3915,2105,0)', -1, NULL, 253, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (265, 3, '2011-09-27 13:49:28.080247+02', '2011-12-05 19:51:36.955507+01', 3, '(4570,2125,0)', -1, NULL, 263, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (267, 3, '2011-09-27 13:49:28.515788+02', '2011-12-05 19:51:36.955507+01', 3, '(5400,2200,0)', -1, NULL, 265, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (269, 3, '2011-09-27 13:49:31.95298+02', '2011-12-05 19:51:36.955507+01', 3, '(4820,1900,0)', -1, NULL, 265, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (271, 3, '2011-09-27 13:49:32.376518+02', '2011-12-05 19:51:36.955507+01', 3, '(5090,1675,0)', -1, NULL, 269, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (273, 3, '2011-09-27 13:49:32.824781+02', '2011-12-05 19:51:36.955507+01', 3, '(5265,1610,0)', -1, NULL, 271, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (275, 3, '2011-09-27 13:49:33.254049+02', '2011-12-05 19:51:36.955507+01', 3, '(5800,1560,0)', -1, NULL, 273, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (277, 3, '2011-09-27 13:49:33.770048+02', '2011-12-05 19:51:36.955507+01', 3, '(6090,1550,0)', -1, NULL, 275, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (279, 3, '2011-09-27 13:49:35.689494+02', '2011-12-05 19:51:36.955507+01', 3, '(5530,2465,0)', -1, NULL, 267, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (281, 3, '2011-09-27 13:49:36.374347+02', '2011-12-05 19:51:36.955507+01', 3, '(5675,2635,0)', -1, NULL, 279, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (283, 3, '2011-09-27 13:49:36.843892+02', '2011-12-05 19:51:36.955507+01', 3, '(5985,2745,0)', -1, NULL, 281, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (285, 3, '2011-09-27 13:49:37.26997+02', '2011-12-05 19:51:36.955507+01', 3, '(6100,2980,0)', -1, NULL, 283, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (289, 3, '2011-09-27 13:49:38.607316+02', '2011-12-05 19:51:36.955507+01', 3, '(6210,3480,0)', -1, NULL, 285, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (293, 3, '2011-09-27 13:54:31.89119+02', '2011-12-05 19:51:36.955507+01', 3, '(3610,3230,45)', -1, NULL, 17, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (295, 3, '2011-09-27 13:54:33.793289+02', '2011-12-05 19:51:36.955507+01', 3, '(3610,3240,54)', -1, NULL, 293, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (297, 3, '2011-09-27 13:54:35.521465+02', '2011-12-05 19:51:36.955507+01', 3, '(3590,3270,63)', -1, NULL, 295, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (299, 3, '2011-09-27 13:54:37.211194+02', '2011-12-05 19:51:36.955507+01', 3, '(3560,3210,72)', -1, NULL, 297, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (301, 3, '2011-09-27 13:54:38.863037+02', '2011-12-05 19:51:36.955507+01', 3, '(3630,3290,81)', -1, NULL, 299, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (303, 3, '2011-09-27 13:54:40.603458+02', '2011-12-05 19:51:36.955507+01', 3, '(3620,3300,90)', -1, NULL, 301, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (305, 3, '2011-09-27 13:54:43.902817+02', '2011-12-05 19:51:36.955507+01', 3, '(3600,3290,99)', -1, NULL, 303, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (309, 3, '2011-09-27 13:55:15.319915+02', '2011-12-05 19:51:36.955507+01', 3, '(3630,3270,108)', -1, NULL, 305, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (311, 3, '2011-09-27 13:55:19.502968+02', '2011-12-05 19:51:36.955507+01', 3, '(3640,3290,117)', -1, NULL, 309, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (313, 3, '2011-09-27 13:55:21.329815+02', '2011-12-05 19:51:36.955507+01', 3, '(3620,3320,126)', -1, NULL, 311, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (315, 3, '2011-09-27 13:55:23.334674+02', '2011-12-05 19:51:36.955507+01', 3, '(3610,3340,135)', -1, NULL, 313, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (317, 3, '2011-09-27 13:55:25.13475+02', '2011-12-05 19:51:36.955507+01', 3, '(3620,3310,144)', -1, NULL, 315, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (319, 3, '2011-09-27 13:55:26.647592+02', '2011-12-05 19:51:36.955507+01', 3, '(3620,3320,153)', -1, NULL, 317, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (321, 3, '2011-09-27 13:55:28.081151+02', '2011-12-05 19:51:36.955507+01', 3, '(3640,3360,162)', -1, NULL, 319, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (323, 3, '2011-09-27 13:55:29.498386+02', '2011-12-05 19:51:36.955507+01', 3, '(3640,3370,171)', -1, NULL, 321, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (325, 3, '2011-09-27 13:55:30.721787+02', '2011-12-05 19:51:36.955507+01', 3, '(3630,3360,180)', -1, NULL, 323, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (335, 3, '2011-09-27 13:56:07.198877+02', '2011-12-05 19:51:36.955507+01', 3, '(3640,3320,189)', -1, NULL, 325, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (337, 3, '2011-09-27 13:56:10.196831+02', '2011-12-05 19:51:36.955507+01', 3, '(3610,3340,198)', -1, NULL, 335, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (339, 3, '2011-09-27 13:56:12.17487+02', '2011-12-05 19:51:36.955507+01', 3, '(3630,3350,207)', -1, NULL, 337, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (341, 3, '2011-09-27 13:56:14.347419+02', '2011-12-05 19:51:36.955507+01', 3, '(3620,3350,216)', -1, NULL, 339, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (343, 3, '2011-09-27 13:56:18.238698+02', '2011-12-05 19:51:36.955507+01', 3, '(3650,3330,225)', -1, NULL, 341, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (345, 3, '2011-09-27 13:56:19.96011+02', '2011-12-05 19:51:36.955507+01', 3, '(3650,3350,234)', -1, NULL, 343, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (347, 3, '2011-09-27 13:56:21.927429+02', '2011-12-05 19:51:36.955507+01', 3, '(3600,3370,243)', -1, NULL, 345, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (349, 3, '2011-09-27 13:56:24.082282+02', '2011-12-05 19:51:36.955507+01', 3, '(3580,3350,252)', -1, NULL, 347, -1, 5, 1);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (367, 3, '2011-09-27 13:57:17.808802+02', '2011-12-05 19:51:36.955507+01', 3, '(7030,1980,0)', -1, NULL, NULL, -1, 5, 361);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (377, 3, '2011-09-27 13:57:19.447829+02', '2011-12-05 19:51:36.955507+01', 3, '(7620,2890,0)', -1, NULL, NULL, -1, 5, 373);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (383, 3, '2011-09-27 13:57:24.747026+02', '2011-12-05 19:51:36.955507+01', 3, '(7850,1970,0)', -1, NULL, 367, -1, 5, 361);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (385, 3, '2011-09-27 13:57:25.555145+02', '2011-12-05 19:51:36.955507+01', 3, '(8530,1820,0)', -1, NULL, 383, -1, 5, 361);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (387, 3, '2011-09-27 13:57:26.310801+02', '2011-12-05 19:51:36.955507+01', 3, '(9030,1480,0)', -1, NULL, 385, -1, 5, 361);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (391, 3, '2011-09-27 13:57:34.626989+02', '2011-12-05 19:51:36.955507+01', 3, '(6740,1530,0)', -1, NULL, 367, -1, 5, 361);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (393, 3, '2011-09-27 13:57:35.676309+02', '2011-12-05 19:51:36.955507+01', 3, '(6910,990,0)', -1, NULL, 391, -1, 5, 361);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (395, 3, '2011-09-27 13:57:36.318101+02', '2011-12-05 19:51:36.955507+01', 3, '(6430,910,0)', -1, NULL, 393, -1, 5, 361);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (397, 3, '2011-09-27 13:57:36.995366+02', '2011-12-05 19:51:36.955507+01', 3, '(6140,640,0)', -1, NULL, 395, -1, 5, 361);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (399, 3, '2011-09-27 13:57:37.518822+02', '2011-12-05 19:51:36.955507+01', 3, '(5670,640,0)', -1, NULL, 397, -1, 5, 361);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (403, 3, '2011-09-27 13:57:55.026267+02', '2011-12-05 19:51:36.955507+01', 3, '(7840,2380,0)', -1, NULL, 377, -1, 5, 373);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (405, 3, '2011-09-27 13:57:57.310838+02', '2011-12-05 19:51:36.955507+01', 3, '(7390,3510,0)', -1, NULL, 377, -1, 5, 373);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (407, 3, '2011-09-27 13:57:57.97679+02', '2011-12-05 19:51:36.955507+01', 3, '(7080,3960,0)', -1, NULL, 405, -1, 5, 373);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (409, 3, '2011-09-27 13:57:58.454759+02', '2011-12-05 19:51:36.955507+01', 3, '(6630,4330,0)', -1, NULL, 407, -1, 5, 373);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (415, 3, '2011-10-07 13:02:13.511558+02', '2011-12-05 19:51:36.955507+01', 3, '(5810,3950,0)', -1, NULL, 289, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (417, 3, '2011-10-07 13:02:15.176506+02', '2011-12-05 19:51:36.955507+01', 3, '(4990,4200,0)', -1, NULL, 415, -1, 5, 235);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2368, 2, '2011-11-01 17:54:42.122069+01', '2011-12-05 19:51:36.955507+01', 3, '(1820,5390,0)', -1, NULL, NULL, -1, 5, 2364);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2370, 2, '2011-11-01 17:54:43.555782+01', '2011-12-05 19:51:36.955507+01', 3, '(2140,4620,0)', -1, NULL, 2368, -1, 5, 2364);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2372, 2, '2011-11-01 17:54:44.436062+01', '2011-12-05 19:51:36.955507+01', 3, '(2760,4600,0)', -1, NULL, 2370, -1, 5, 2364);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2374, 2, '2011-11-01 17:54:45.793073+01', '2011-12-05 19:51:36.955507+01', 3, '(3310,5190,0)', -1, NULL, 2372, -1, 5, 2364);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2376, 2, '2011-11-01 17:54:47.472158+01', '2011-12-05 19:51:36.955507+01', 3, '(3930,4330,0)', -1, NULL, 2374, -1, 5, 2364);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2378, 2, '2011-11-01 17:54:48.503117+01', '2011-12-05 19:51:36.955507+01', 3, '(4420,4880,0)', -1, NULL, 2376, -1, 5, 2364);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2392, 3, '2011-12-09 14:01:37.57599+01', '2011-12-09 14:01:37.57599+01', 3, '(2370,6080,0)', -1, NULL, NULL, -1, 5, 2388);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2394, 3, '2011-12-09 14:01:39.388026+01', '2011-12-09 14:01:48.933129+01', 3, '(3110,6030,0)', -1, NULL, 2392, -1, 5, 2388);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2396, 3, '2011-12-09 14:01:40.583568+01', '2011-12-09 14:01:40.583568+01', 3, '(3680,6550,0)', -1, NULL, 2394, -1, 5, 2388);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2415, 3, '2011-12-09 14:01:59.149053+01', '2011-12-09 14:01:59.149053+01', 3, '(4110,6080,0)', -1, NULL, NULL, -1, 5, 2411);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2417, 3, '2011-12-09 14:02:00.466912+01', '2011-12-09 14:02:00.466912+01', 3, '(4400,5730,0)', -1, NULL, 2415, -1, 5, 2411);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2419, 3, '2011-12-09 14:02:01.614859+01', '2011-12-09 14:02:01.614859+01', 3, '(5040,5650,0)', -1, NULL, 2417, -1, 5, 2411);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2423, 3, '2011-12-09 14:02:11.175624+01', '2011-12-09 14:02:11.175624+01', 3, '(4140,6460,0)', -1, NULL, 2415, -1, 5, 2411);
INSERT INTO treenode (id, user_id, creation_time, edition_time, project_id, location, reviewer_id, review_time, parent_id, radius, confidence, skeleton_id) VALUES (2437, 3, '2012-07-22 22:50:57.758826+02', '2012-07-22 22:50:57.758826+02', 3, '(5290,3930,279)', -1, NULL, NULL, -1, 5, 2433);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (8, 3, '2011-09-04 13:53:41.243573+02', '2011-09-04 13:53:41.243573+02', 3, 11, 7, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (12, 3, '2011-09-04 13:54:16.301746+02', '2011-09-04 13:54:16.301746+02', 3, 11, 11, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (14, 3, '2011-09-04 13:54:24.528781+02', '2011-09-04 13:54:24.528781+02', 3, 11, 13, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (16, 3, '2011-09-04 13:54:26.464274+02', '2011-09-04 13:54:26.464274+02', 3, 11, 15, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (18, 3, '2011-09-04 13:54:28.52379+02', '2011-09-04 13:54:28.52379+02', 3, 11, 17, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (238, 3, '2011-09-27 13:49:15.802728+02', '2011-09-27 13:49:15.802728+02', 3, 11, 237, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (240, 3, '2011-09-27 13:49:16.553595+02', '2011-09-27 13:49:16.553595+02', 3, 11, 239, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (242, 3, '2011-09-27 13:49:17.217158+02', '2011-09-27 13:49:17.217158+02', 3, 11, 241, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (244, 3, '2011-09-27 13:49:17.660828+02', '2011-09-27 13:49:17.660828+02', 3, 11, 243, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (246, 3, '2011-09-27 13:49:18.343749+02', '2011-09-27 13:49:18.343749+02', 3, 11, 245, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (248, 3, '2011-09-27 13:49:19.012273+02', '2011-09-27 13:49:19.012273+02', 3, 11, 247, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (250, 3, '2011-09-27 13:49:19.88757+02', '2011-09-27 13:49:19.88757+02', 3, 11, 249, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (252, 3, '2011-09-27 13:49:20.514048+02', '2011-09-27 13:49:20.514048+02', 3, 11, 251, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (254, 3, '2011-09-27 13:49:21.493556+02', '2011-09-27 13:49:21.493556+02', 3, 11, 253, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (256, 3, '2011-09-27 13:49:22.835442+02', '2011-09-27 13:49:22.835442+02', 3, 11, 255, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (258, 3, '2011-09-27 13:49:23.591338+02', '2011-09-27 13:49:23.591338+02', 3, 11, 257, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (260, 3, '2011-09-27 13:49:24.87934+02', '2011-09-27 13:49:24.87934+02', 3, 11, 259, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (262, 3, '2011-09-27 13:49:25.549003+02', '2011-09-27 13:49:25.549003+02', 3, 11, 261, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (264, 3, '2011-09-27 13:49:27.637652+02', '2011-09-27 13:49:27.637652+02', 3, 11, 263, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (266, 3, '2011-09-27 13:49:28.080247+02', '2011-09-27 13:49:28.080247+02', 3, 11, 265, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (268, 3, '2011-09-27 13:49:28.515788+02', '2011-09-27 13:49:28.515788+02', 3, 11, 267, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (270, 3, '2011-09-27 13:49:31.95298+02', '2011-09-27 13:49:31.95298+02', 3, 11, 269, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (272, 3, '2011-09-27 13:49:32.376518+02', '2011-09-27 13:49:32.376518+02', 3, 11, 271, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (274, 3, '2011-09-27 13:49:32.824781+02', '2011-09-27 13:49:32.824781+02', 3, 11, 273, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (276, 3, '2011-09-27 13:49:33.254049+02', '2011-09-27 13:49:33.254049+02', 3, 11, 275, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (278, 3, '2011-09-27 13:49:33.770048+02', '2011-09-27 13:49:33.770048+02', 3, 11, 277, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (280, 3, '2011-09-27 13:49:35.689494+02', '2011-09-27 13:49:35.689494+02', 3, 11, 279, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (282, 3, '2011-09-27 13:49:36.374347+02', '2011-09-27 13:49:36.374347+02', 3, 11, 281, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (284, 3, '2011-09-27 13:49:36.843892+02', '2011-09-27 13:49:36.843892+02', 3, 11, 283, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (286, 3, '2011-09-27 13:49:37.26997+02', '2011-09-27 13:49:37.26997+02', 3, 11, 285, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (290, 3, '2011-09-27 13:49:38.607316+02', '2011-09-27 13:49:38.607316+02', 3, 11, 289, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (294, 3, '2011-09-27 13:54:31.89119+02', '2011-09-27 13:54:31.89119+02', 3, 11, 293, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (296, 3, '2011-09-27 13:54:33.793289+02', '2011-09-27 13:54:33.793289+02', 3, 11, 295, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (298, 3, '2011-09-27 13:54:35.521465+02', '2011-09-27 13:54:35.521465+02', 3, 11, 297, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (300, 3, '2011-09-27 13:54:37.211194+02', '2011-09-27 13:54:37.211194+02', 3, 11, 299, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (302, 3, '2011-09-27 13:54:38.863037+02', '2011-09-27 13:54:38.863037+02', 3, 11, 301, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (304, 3, '2011-09-27 13:54:40.603458+02', '2011-09-27 13:54:40.603458+02', 3, 11, 303, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (306, 3, '2011-09-27 13:54:43.902817+02', '2011-09-27 13:54:43.902817+02', 3, 11, 305, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (310, 3, '2011-09-27 13:55:15.319915+02', '2011-09-27 13:55:15.319915+02', 3, 11, 309, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (312, 3, '2011-09-27 13:55:19.502968+02', '2011-09-27 13:55:19.502968+02', 3, 11, 311, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (314, 3, '2011-09-27 13:55:21.329815+02', '2011-09-27 13:55:21.329815+02', 3, 11, 313, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (316, 3, '2011-09-27 13:55:23.334674+02', '2011-09-27 13:55:23.334674+02', 3, 11, 315, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (318, 3, '2011-09-27 13:55:25.13475+02', '2011-09-27 13:55:25.13475+02', 3, 11, 317, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (320, 3, '2011-09-27 13:55:26.647592+02', '2011-09-27 13:55:26.647592+02', 3, 11, 319, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (322, 3, '2011-09-27 13:55:28.081151+02', '2011-09-27 13:55:28.081151+02', 3, 11, 321, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (324, 3, '2011-09-27 13:55:29.498386+02', '2011-09-27 13:55:29.498386+02', 3, 11, 323, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (326, 3, '2011-09-27 13:55:30.721787+02', '2011-09-27 13:55:30.721787+02', 3, 11, 325, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (336, 3, '2011-09-27 13:56:07.198877+02', '2011-09-27 13:56:07.198877+02', 3, 11, 335, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (338, 3, '2011-09-27 13:56:10.196831+02', '2011-09-27 13:56:10.196831+02', 3, 11, 337, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (340, 3, '2011-09-27 13:56:12.17487+02', '2011-09-27 13:56:12.17487+02', 3, 11, 339, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (342, 3, '2011-09-27 13:56:14.347419+02', '2011-09-27 13:56:14.347419+02', 3, 11, 341, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (344, 3, '2011-09-27 13:56:18.238698+02', '2011-09-27 13:56:18.238698+02', 3, 11, 343, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (346, 3, '2011-09-27 13:56:19.96011+02', '2011-09-27 13:56:19.96011+02', 3, 11, 345, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (348, 3, '2011-09-27 13:56:21.927429+02', '2011-09-27 13:56:21.927429+02', 3, 11, 347, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (350, 3, '2011-09-27 13:56:24.082282+02', '2011-09-27 13:56:24.082282+02', 3, 11, 349, 1);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (353, 3, '2011-09-27 13:56:45.996753+02', '2011-09-27 13:56:45.996753+02', 3, 35, 349, 351);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (368, 3, '2011-09-27 13:57:17.808802+02', '2011-09-27 13:57:17.808802+02', 3, 11, 367, 361);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (378, 3, '2011-09-27 13:57:19.447829+02', '2011-09-27 13:57:19.447829+02', 3, 11, 377, 373);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (384, 3, '2011-09-27 13:57:24.747026+02', '2011-09-27 13:57:24.747026+02', 3, 11, 383, 361);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (386, 3, '2011-09-27 13:57:25.555145+02', '2011-09-27 13:57:25.555145+02', 3, 11, 385, 361);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (388, 3, '2011-09-27 13:57:26.310801+02', '2011-09-27 13:57:26.310801+02', 3, 11, 387, 361);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (392, 3, '2011-09-27 13:57:34.626989+02', '2011-09-27 13:57:34.626989+02', 3, 11, 391, 361);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (394, 3, '2011-09-27 13:57:35.676309+02', '2011-09-27 13:57:35.676309+02', 3, 11, 393, 361);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (396, 3, '2011-09-27 13:57:36.318101+02', '2011-09-27 13:57:36.318101+02', 3, 11, 395, 361);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (398, 3, '2011-09-27 13:57:36.995366+02', '2011-09-27 13:57:36.995366+02', 3, 11, 397, 361);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (400, 3, '2011-09-27 13:57:37.518822+02', '2011-09-27 13:57:37.518822+02', 3, 11, 399, 361);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (404, 3, '2011-09-27 13:57:55.026267+02', '2011-09-27 13:57:55.026267+02', 3, 11, 403, 373);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (406, 3, '2011-09-27 13:57:57.310838+02', '2011-09-27 13:57:57.310838+02', 3, 11, 405, 373);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (408, 3, '2011-09-27 13:57:57.97679+02', '2011-09-27 13:57:57.97679+02', 3, 11, 407, 373);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (410, 3, '2011-09-27 13:57:58.454759+02', '2011-09-27 13:57:58.454759+02', 3, 11, 409, 373);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (416, 3, '2011-10-07 13:02:13.511558+02', '2011-10-07 13:02:13.511558+02', 3, 11, 415, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (418, 3, '2011-10-07 13:02:15.176506+02', '2011-10-07 13:02:15.176506+02', 3, 11, 417, 235);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2341, 3, '2011-10-31 10:21:43.998471+01', '2011-10-31 10:21:43.998471+01', 3, 35, 261, 351);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2357, 3, '2011-10-31 10:25:15.462041+01', '2011-10-31 10:25:15.462041+01', 3, 35, 403, 2342);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2369, 2, '2011-11-01 17:54:42.122069+01', '2011-11-01 17:54:42.122069+01', 3, 11, 2368, 2364);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2371, 2, '2011-11-01 17:54:43.555782+01', '2011-11-01 17:54:43.555782+01', 3, 11, 2370, 2364);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2373, 2, '2011-11-01 17:54:44.436062+01', '2011-11-01 17:54:44.436062+01', 3, 11, 2372, 2364);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2375, 2, '2011-11-01 17:54:45.793073+01', '2011-11-01 17:54:45.793073+01', 3, 11, 2374, 2364);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2377, 2, '2011-11-01 17:54:47.472158+01', '2011-11-01 17:54:47.472158+01', 3, 11, 2376, 2364);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2379, 2, '2011-11-01 17:54:48.503117+01', '2011-11-01 17:54:48.503117+01', 3, 11, 2378, 2364);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2393, 3, '2011-12-09 14:01:37.57599+01', '2011-12-09 14:01:37.57599+01', 3, 11, 2392, 2388);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2395, 3, '2011-12-09 14:01:39.388026+01', '2011-12-09 14:01:39.388026+01', 3, 11, 2394, 2388);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2397, 3, '2011-12-09 14:01:40.583568+01', '2011-12-09 14:01:40.583568+01', 3, 11, 2396, 2388);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2416, 3, '2011-12-09 14:01:59.149053+01', '2011-12-09 14:01:59.149053+01', 3, 11, 2415, 2411);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2418, 3, '2011-12-09 14:02:00.466912+01', '2011-12-09 14:02:00.466912+01', 3, 11, 2417, 2411);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2420, 3, '2011-12-09 14:02:01.614859+01', '2011-12-09 14:02:01.614859+01', 3, 11, 2419, 2411);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2424, 3, '2011-12-09 14:02:11.175624+01', '2011-12-09 14:02:11.175624+01', 3, 11, 2423, 2411);
INSERT INTO treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) VALUES (2438, 3, '2012-07-22 22:50:57.758826+02', '2012-07-22 22:50:57.758826+02', 3, 11, 2437, 2433);
INSERT INTO treenode_connector (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, connector_id, skeleton_id, confidence) VALUES (360, 3, '2011-09-27 13:57:15.967079+02', '2011-12-20 16:46:01.360422+01', 3, 23, 285, 356, 235, 5);
INSERT INTO treenode_connector (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, connector_id, skeleton_id, confidence) VALUES (372, 3, '2011-09-27 13:57:18.175214+02', '2011-12-20 16:46:01.360422+01', 3, 24, 367, 356, 361, 5);
INSERT INTO treenode_connector (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, connector_id, skeleton_id, confidence) VALUES (382, 3, '2011-09-27 13:57:19.797106+02', '2011-12-20 16:46:01.360422+01', 3, 24, 377, 356, 373, 5);
INSERT INTO treenode_connector (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, connector_id, skeleton_id, confidence) VALUES (425, 3, '2011-10-07 13:02:22.656859+02', '2011-12-20 16:46:01.360422+01', 3, 23, 415, 421, 235, 5);
INSERT INTO treenode_connector (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, connector_id, skeleton_id, confidence) VALUES (429, 3, '2011-10-07 13:02:29.728468+02', '2011-12-20 16:46:01.360422+01', 3, 24, 409, 421, 373, 5);
INSERT INTO treenode_connector (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, connector_id, skeleton_id, confidence) VALUES (437, 3, '2011-10-11 16:49:08.042058+02', '2011-12-20 16:46:01.360422+01', 3, 23, 247, 432, 235, 5);
INSERT INTO treenode_connector (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, connector_id, skeleton_id, confidence) VALUES (2405, 3, '2011-12-09 14:01:43.965389+01', '2011-12-20 16:46:01.360422+01', 3, 23, 2394, 2400, 2388, 5);
INSERT INTO treenode_connector (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, connector_id, skeleton_id, confidence) VALUES (2410, 3, '2011-12-09 14:01:48.525474+01', '2011-12-20 16:46:01.360422+01', 3, 24, 2374, 2400, 2364, 5);
INSERT INTO treenode_connector (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, connector_id, skeleton_id, confidence) VALUES (2429, 3, '2011-12-09 14:02:16.949105+01', '2011-12-20 16:46:01.360422+01', 3, 23, 2415, 2400, 2411, 5);
INSERT INTO "user" (id, name, pwd, longname) VALUES (1, 'saalfeld', '84789cbcbd2daf359a9fa4f34350e50f', 'Stephan Saalfeld');
INSERT INTO "user" (id, name, pwd, longname) VALUES (2, 'test', '098f6bcd4621d373cade4e832627b4f6', 'Theo Test');
INSERT INTO "user" (id, name, pwd, longname) VALUES (3, 'gerhard', '494524b27acdc356fb3dcb9f0b108267', 'Stephan Gerhard');
ALTER TABLE ONLY applied_migrations
    ADD CONSTRAINT applied_migrations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_slice_pkey PRIMARY KEY (id);
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
ALTER TABLE ONLY log
    ADD CONSTRAINT log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);
ALTER TABLE ONLY "overlay"
    ADD CONSTRAINT overlay_pkey PRIMARY KEY (id);
ALTER TABLE ONLY project
    ADD CONSTRAINT project_pkey PRIMARY KEY (id);
ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_pkey PRIMARY KEY (id);
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
ALTER TABLE ONLY sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);
ALTER TABLE ONLY stack
    ADD CONSTRAINT stack_pkey PRIMARY KEY (id);
ALTER TABLE ONLY textlabel_location
    ADD CONSTRAINT textlabel_location_pkey PRIMARY KEY (id);
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
CREATE TRIGGER apply_edition_time_update BEFORE UPDATE ON class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit BEFORE UPDATE ON textlabel FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit BEFORE UPDATE ON concept FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_class BEFORE UPDATE ON class FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_class_class BEFORE UPDATE ON class_class FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_class_instance BEFORE UPDATE ON class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_class_instance_class_instance BEFORE UPDATE ON class_instance_class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_connector BEFORE UPDATE ON connector FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_connector_class_instance BEFORE UPDATE ON connector_class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_location BEFORE UPDATE ON location FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_relation BEFORE UPDATE ON relation FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_relation_instance BEFORE UPDATE ON relation_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_treenode BEFORE UPDATE ON treenode FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_treenode_class_instance BEFORE UPDATE ON treenode_class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();
CREATE TRIGGER on_edit_treenode_connector BEFORE UPDATE ON treenode_connector FOR EACH ROW EXECUTE PROCEDURE on_edit();
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
    ADD CONSTRAINT connector_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id) REFERENCES class_instance(id) ON DELETE CASCADE;
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
ALTER TABLE ONLY "overlay"
    ADD CONSTRAINT overlay_stack_id_fkey FOREIGN KEY (stack_id) REFERENCES stack(id) ON DELETE CASCADE;
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
ALTER TABLE ONLY treenode_connector
    ADD CONSTRAINT treenode_connector_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES connector(id) ON DELETE CASCADE;
ALTER TABLE ONLY treenode_connector
    ADD CONSTRAINT treenode_connector_skeleton_id_fkey FOREIGN KEY (skeleton_id) REFERENCES class_instance(id) ON DELETE CASCADE;
ALTER TABLE ONLY treenode_connector
    ADD CONSTRAINT treenode_connector_treenode_id_fkey FOREIGN KEY (treenode_id) REFERENCES treenode(id) ON DELETE CASCADE;
ALTER TABLE ONLY treenode_connector
    ADD CONSTRAINT treenode_connector_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);
ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES treenode(id);
ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_skeleton_id_fkey FOREIGN KEY (skeleton_id) REFERENCES class_instance(id) ON DELETE CASCADE;
