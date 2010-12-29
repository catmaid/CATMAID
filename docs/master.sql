--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = off;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET escape_string_warning = off;

--
-- Name: public2; Type: SCHEMA; Schema: -; Owner: stephan
--

CREATE SCHEMA public2;


ALTER SCHEMA public2 OWNER TO stephan;

--
-- Name: plpgsql; Type: PROCEDURAL LANGUAGE; Schema: -; Owner: catmaid_user
--

CREATE PROCEDURAL LANGUAGE plpgsql;


ALTER PROCEDURAL LANGUAGE plpgsql OWNER TO catmaid_user;

SET search_path = public, pg_catalog;

--
-- Name: double3d; Type: TYPE; Schema: public; Owner: catmaid_user
--

CREATE TYPE double3d AS (
	x double precision,
	y double precision,
	z double precision
);


ALTER TYPE public.double3d OWNER TO catmaid_user;

--
-- Name: integer3d; Type: TYPE; Schema: public; Owner: catmaid_user
--

CREATE TYPE integer3d AS (
	x integer,
	y integer,
	z integer
);


ALTER TYPE public.integer3d OWNER TO catmaid_user;

--
-- Name: rgba; Type: TYPE; Schema: public; Owner: catmaid_user
--

CREATE TYPE rgba AS (
	r real,
	g real,
	b real,
	a real
);


ALTER TYPE public.rgba OWNER TO catmaid_user;

SET search_path = public2, pg_catalog;

--
-- Name: double3d; Type: TYPE; Schema: public2; Owner: catmaid_user
--

CREATE TYPE double3d AS (
	x double precision,
	y double precision,
	z double precision
);


ALTER TYPE public2.double3d OWNER TO catmaid_user;

--
-- Name: integer3d; Type: TYPE; Schema: public2; Owner: catmaid_user
--

CREATE TYPE integer3d AS (
	x integer,
	y integer,
	z integer
);


ALTER TYPE public2.integer3d OWNER TO catmaid_user;

--
-- Name: rgba; Type: TYPE; Schema: public2; Owner: catmaid_user
--

CREATE TYPE rgba AS (
	r real,
	g real,
	b real,
	a real
);


ALTER TYPE public2.rgba OWNER TO catmaid_user;

SET search_path = public, pg_catalog;

--
-- Name: on_edit(); Type: FUNCTION; Schema: public; Owner: catmaid_user
--

CREATE FUNCTION on_edit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

    NEW."edition_time" := now();

    RETURN NEW;

END;

$$;


ALTER FUNCTION public.on_edit() OWNER TO catmaid_user;

SET search_path = public2, pg_catalog;

--
-- Name: on_edit(); Type: FUNCTION; Schema: public2; Owner: catmaid_user
--

CREATE FUNCTION on_edit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

    NEW."edition_time" := now();

    RETURN NEW;

END;

$$;


ALTER FUNCTION public2.on_edit() OWNER TO catmaid_user;

SET search_path = public, pg_catalog;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: bezierkey; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE bezierkey (
    key point NOT NULL,
    before point,
    after point,
    profile_id integer
);


ALTER TABLE public.bezierkey OWNER TO catmaid_user;

--
-- Name: COLUMN bezierkey.key; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN bezierkey.key IS 'nanometer';


--
-- Name: profile; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE profile (
    id integer NOT NULL,
    z double precision NOT NULL,
    object_id integer
);


ALTER TABLE public.profile OWNER TO catmaid_user;

--
-- Name: profile_id_seq; Type: SEQUENCE; Schema: public; Owner: catmaid_user
--

CREATE SEQUENCE profile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.profile_id_seq OWNER TO catmaid_user;

--
-- Name: profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: catmaid_user
--

ALTER SEQUENCE profile_id_seq OWNED BY profile.id;


--
-- Name: profile_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catmaid_user
--

SELECT pg_catalog.setval('profile_id_seq', 1, false);


--
-- Name: bezierprofile; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE bezierprofile (
)
INHERITS (profile);


ALTER TABLE public.bezierprofile OWNER TO catmaid_user;

--
-- Name: broken_slice; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE broken_slice (
    stack_id integer NOT NULL,
    index integer NOT NULL
);


ALTER TABLE public.broken_slice OWNER TO catmaid_user;

--
-- Name: concept; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE concept (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    creation_time timestamp with time zone DEFAULT now() NOT NULL,
    edition_time timestamp with time zone DEFAULT now() NOT NULL,
    project_id bigint NOT NULL
);


ALTER TABLE public.concept OWNER TO catmaid_user;

--
-- Name: concept_id_seq; Type: SEQUENCE; Schema: public; Owner: catmaid_user
--

CREATE SEQUENCE concept_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.concept_id_seq OWNER TO catmaid_user;

--
-- Name: concept_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: catmaid_user
--

ALTER SEQUENCE concept_id_seq OWNED BY concept.id;


--
-- Name: concept_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catmaid_user
--

SELECT pg_catalog.setval('concept_id_seq', 1233, true);


--
-- Name: class; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE class (
    class_name character varying(255) NOT NULL,
    uri character varying(2048),
    description text,
    showintree boolean DEFAULT true
)
INHERITS (concept);


ALTER TABLE public.class OWNER TO catmaid_user;

--
-- Name: COLUMN class.showintree; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN class.showintree IS 'does the element appear in the class tree widget?';


--
-- Name: relation_instance; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE relation_instance (
    relation_id bigint NOT NULL
)
INHERITS (concept);


ALTER TABLE public.relation_instance OWNER TO catmaid_user;

--
-- Name: TABLE relation_instance; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON TABLE relation_instance IS 'despite the table names, it is an abstract table only used for inheritance';


--
-- Name: class_class; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE class_class (
    class_a bigint,
    class_b bigint
)
INHERITS (relation_instance);


ALTER TABLE public.class_class OWNER TO catmaid_user;

--
-- Name: TABLE class_class; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON TABLE class_class IS 'relates two classes';


--
-- Name: class_instance; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE class_instance (
    class_id bigint NOT NULL,
    name character varying(255) NOT NULL
)
INHERITS (concept);


ALTER TABLE public.class_instance OWNER TO catmaid_user;

--
-- Name: class_instance_class_instance; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE class_instance_class_instance (
    class_instance_a bigint,
    class_instance_b bigint
)
INHERITS (relation_instance);


ALTER TABLE public.class_instance_class_instance OWNER TO catmaid_user;

--
-- Name: TABLE class_instance_class_instance; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON TABLE class_instance_class_instance IS 'relates two class_instances';


--
-- Name: location; Type: TABLE; Schema: public; Owner: stephan; Tablespace: 
--

CREATE TABLE location (
    location double3d NOT NULL
)
INHERITS (concept);


ALTER TABLE public.location OWNER TO stephan;

--
-- Name: location_class_instance; Type: TABLE; Schema: public; Owner: stephan; Tablespace: 
--

CREATE TABLE location_class_instance (
    location_id bigint NOT NULL,
    class_instance_id bigint NOT NULL
)
INHERITS (relation_instance);


ALTER TABLE public.location_class_instance OWNER TO stephan;

--
-- Name: message; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE message (
    id integer NOT NULL,
    user_id integer NOT NULL,
    "time" timestamp with time zone DEFAULT now() NOT NULL,
    read boolean DEFAULT false NOT NULL,
    title text DEFAULT 'New message'::text NOT NULL,
    text text,
    action text
);


ALTER TABLE public.message OWNER TO catmaid_user;

--
-- Name: COLUMN message.action; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN message.action IS 'URL to be executed (remember that this is not safe against man in the middle when not encrypted)';


--
-- Name: message_id_seq; Type: SEQUENCE; Schema: public; Owner: catmaid_user
--

CREATE SEQUENCE message_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.message_id_seq OWNER TO catmaid_user;

--
-- Name: message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: catmaid_user
--

ALTER SEQUENCE message_id_seq OWNED BY message.id;


--
-- Name: message_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catmaid_user
--

SELECT pg_catalog.setval('message_id_seq', 1, false);


--
-- Name: object; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE object (
    id integer NOT NULL,
    class character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    project_id integer NOT NULL,
    colour rgba DEFAULT ROW((1)::real, (0.5)::real, (0)::real, (0.75)::real) NOT NULL
);


ALTER TABLE public.object OWNER TO catmaid_user;

--
-- Name: object_id_seq; Type: SEQUENCE; Schema: public; Owner: catmaid_user
--

CREATE SEQUENCE object_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.object_id_seq OWNER TO catmaid_user;

--
-- Name: object_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: catmaid_user
--

ALTER SEQUENCE object_id_seq OWNED BY object.id;


--
-- Name: object_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catmaid_user
--

SELECT pg_catalog.setval('object_id_seq', 1, false);


--
-- Name: project; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE project (
    id integer NOT NULL,
    title text NOT NULL,
    public boolean DEFAULT true NOT NULL
);


ALTER TABLE public.project OWNER TO catmaid_user;

--
-- Name: project_id_seq; Type: SEQUENCE; Schema: public; Owner: catmaid_user
--

CREATE SEQUENCE project_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.project_id_seq OWNER TO catmaid_user;

--
-- Name: project_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: catmaid_user
--

ALTER SEQUENCE project_id_seq OWNED BY project.id;


--
-- Name: project_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catmaid_user
--

SELECT pg_catalog.setval('project_id_seq', 3, true);


--
-- Name: project_stack; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE project_stack (
    project_id integer NOT NULL,
    stack_id integer NOT NULL,
    translation double3d DEFAULT ROW((0)::double precision, (0)::double precision, (0)::double precision) NOT NULL
);


ALTER TABLE public.project_stack OWNER TO catmaid_user;

--
-- Name: COLUMN project_stack.translation; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN project_stack.translation IS 'nanometer';


--
-- Name: project_user; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE project_user (
    project_id integer NOT NULL,
    user_id integer NOT NULL
);


ALTER TABLE public.project_user OWNER TO catmaid_user;

--
-- Name: relation; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE relation (
    relation_name character varying(255) NOT NULL,
    uri text,
    description text,
    isreciprocal boolean DEFAULT false NOT NULL
)
INHERITS (concept);


ALTER TABLE public.relation OWNER TO catmaid_user;

--
-- Name: COLUMN relation.isreciprocal; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN relation.isreciprocal IS 'Is the converse of the relationship valid?';


--
-- Name: stack; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE stack (
    id integer NOT NULL,
    title text NOT NULL,
    dimension integer3d NOT NULL,
    resolution double3d NOT NULL,
    image_base text NOT NULL,
    comment text,
    trakem2_project boolean DEFAULT false NOT NULL
);


ALTER TABLE public.stack OWNER TO catmaid_user;

--
-- Name: COLUMN stack.dimension; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN stack.dimension IS 'pixel';


--
-- Name: COLUMN stack.resolution; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN stack.resolution IS 'nanometer per pixel';


--
-- Name: COLUMN stack.image_base; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN stack.image_base IS 'base URL to the images';


--
-- Name: COLUMN stack.trakem2_project; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN stack.trakem2_project IS 'States if a TrakEM2 project file is available for this stack.';


--
-- Name: stack_id_seq; Type: SEQUENCE; Schema: public; Owner: catmaid_user
--

CREATE SEQUENCE stack_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.stack_id_seq OWNER TO catmaid_user;

--
-- Name: stack_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: catmaid_user
--

ALTER SEQUENCE stack_id_seq OWNED BY stack.id;


--
-- Name: stack_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catmaid_user
--

SELECT pg_catalog.setval('stack_id_seq', 2, true);


--
-- Name: textlabel; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

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


ALTER TABLE public.textlabel OWNER TO catmaid_user;

--
-- Name: textlabel_id_seq; Type: SEQUENCE; Schema: public; Owner: catmaid_user
--

CREATE SEQUENCE textlabel_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.textlabel_id_seq OWNER TO catmaid_user;

--
-- Name: textlabel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: catmaid_user
--

ALTER SEQUENCE textlabel_id_seq OWNED BY textlabel.id;


--
-- Name: textlabel_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catmaid_user
--

SELECT pg_catalog.setval('textlabel_id_seq', 22, true);


--
-- Name: textlabel_location; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE textlabel_location (
    textlabel_id integer NOT NULL,
    location double3d NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.textlabel_location OWNER TO catmaid_user;

--
-- Name: treenode; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE treenode (
    parent_id bigint,
    radius double precision DEFAULT 0 NOT NULL,
    confidence integer DEFAULT 5 NOT NULL
)
INHERITS (location);


ALTER TABLE public.treenode OWNER TO catmaid_user;

--
-- Name: treenode_class_instance; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE treenode_class_instance (
    treenode_id bigint NOT NULL,
    class_instance_id bigint NOT NULL
)
INHERITS (relation_instance);


ALTER TABLE public.treenode_class_instance OWNER TO catmaid_user;

--
-- Name: user; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE "user" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    pwd character varying(255) NOT NULL,
    longname text
);


ALTER TABLE public."user" OWNER TO catmaid_user;

--
-- Name: user_id_seq; Type: SEQUENCE; Schema: public; Owner: catmaid_user
--

CREATE SEQUENCE user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public.user_id_seq OWNER TO catmaid_user;

--
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: catmaid_user
--

ALTER SEQUENCE user_id_seq OWNED BY "user".id;


--
-- Name: user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: catmaid_user
--

SELECT pg_catalog.setval('user_id_seq', 3, true);


SET search_path = public2, pg_catalog;

--
-- Name: bezierkey; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE bezierkey (
    key point NOT NULL,
    before point,
    after point,
    profile_id integer
);


ALTER TABLE public2.bezierkey OWNER TO catmaid_user;

--
-- Name: COLUMN bezierkey.key; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON COLUMN bezierkey.key IS 'nanometer';


--
-- Name: profile; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE profile (
    id integer NOT NULL,
    z double precision NOT NULL,
    object_id integer
);


ALTER TABLE public2.profile OWNER TO catmaid_user;

--
-- Name: profile_id_seq; Type: SEQUENCE; Schema: public2; Owner: catmaid_user
--

CREATE SEQUENCE profile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public2.profile_id_seq OWNER TO catmaid_user;

--
-- Name: profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public2; Owner: catmaid_user
--

ALTER SEQUENCE profile_id_seq OWNED BY profile.id;


--
-- Name: profile_id_seq; Type: SEQUENCE SET; Schema: public2; Owner: catmaid_user
--

SELECT pg_catalog.setval('profile_id_seq', 1, false);


--
-- Name: bezierprofile; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE bezierprofile (
)
INHERITS (profile);


ALTER TABLE public2.bezierprofile OWNER TO catmaid_user;

--
-- Name: broken_slice; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE broken_slice (
    stack_id integer NOT NULL,
    index integer NOT NULL
);


ALTER TABLE public2.broken_slice OWNER TO catmaid_user;

--
-- Name: concept; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE concept (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    creation_time timestamp with time zone DEFAULT now() NOT NULL,
    edition_time timestamp with time zone DEFAULT now() NOT NULL,
    project_id bigint NOT NULL
);


ALTER TABLE public2.concept OWNER TO catmaid_user;

--
-- Name: concept_id_seq; Type: SEQUENCE; Schema: public2; Owner: catmaid_user
--

CREATE SEQUENCE concept_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public2.concept_id_seq OWNER TO catmaid_user;

--
-- Name: concept_id_seq; Type: SEQUENCE OWNED BY; Schema: public2; Owner: catmaid_user
--

ALTER SEQUENCE concept_id_seq OWNED BY concept.id;


--
-- Name: concept_id_seq; Type: SEQUENCE SET; Schema: public2; Owner: catmaid_user
--

SELECT pg_catalog.setval('concept_id_seq', 768, true);


--
-- Name: class; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE class (
    class_name character varying(255) NOT NULL,
    uri character varying(2048),
    description text,
    showintree boolean DEFAULT true
)
INHERITS (concept);


ALTER TABLE public2.class OWNER TO catmaid_user;

--
-- Name: COLUMN class.showintree; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON COLUMN class.showintree IS 'does the element appear in the class tree widget?';


--
-- Name: relation_instance; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE relation_instance (
    relation_id bigint NOT NULL
)
INHERITS (concept);


ALTER TABLE public2.relation_instance OWNER TO catmaid_user;

--
-- Name: TABLE relation_instance; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON TABLE relation_instance IS 'despite the table names, it is an abstract table only used for inheritance';


--
-- Name: class_class; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE class_class (
    class_a bigint,
    class_b bigint
)
INHERITS (relation_instance);


ALTER TABLE public2.class_class OWNER TO catmaid_user;

--
-- Name: TABLE class_class; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON TABLE class_class IS 'relates two classes';


--
-- Name: class_instance; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE class_instance (
    class_id bigint NOT NULL,
    name character varying(255) NOT NULL
)
INHERITS (concept);


ALTER TABLE public2.class_instance OWNER TO catmaid_user;

--
-- Name: class_instance_class_instance; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE class_instance_class_instance (
    class_instance_a bigint,
    class_instance_b bigint
)
INHERITS (relation_instance);


ALTER TABLE public2.class_instance_class_instance OWNER TO catmaid_user;

--
-- Name: TABLE class_instance_class_instance; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON TABLE class_instance_class_instance IS 'relates two class_instances';


--
-- Name: location; Type: TABLE; Schema: public2; Owner: stephan; Tablespace: 
--

CREATE TABLE location (
    location double3d NOT NULL
)
INHERITS (concept);


ALTER TABLE public2.location OWNER TO stephan;

--
-- Name: location_class_instance; Type: TABLE; Schema: public2; Owner: stephan; Tablespace: 
--

CREATE TABLE location_class_instance (
    location_id bigint NOT NULL,
    class_instance_id bigint NOT NULL
)
INHERITS (relation_instance);


ALTER TABLE public2.location_class_instance OWNER TO stephan;

--
-- Name: message; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE message (
    id integer NOT NULL,
    user_id integer NOT NULL,
    "time" timestamp with time zone DEFAULT now() NOT NULL,
    read boolean DEFAULT false NOT NULL,
    title text DEFAULT 'New message'::text NOT NULL,
    text text,
    action text
);


ALTER TABLE public2.message OWNER TO catmaid_user;

--
-- Name: COLUMN message.action; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON COLUMN message.action IS 'URL to be executed (remember that this is not safe against man in the middle when not encrypted)';


--
-- Name: message_id_seq; Type: SEQUENCE; Schema: public2; Owner: catmaid_user
--

CREATE SEQUENCE message_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public2.message_id_seq OWNER TO catmaid_user;

--
-- Name: message_id_seq; Type: SEQUENCE OWNED BY; Schema: public2; Owner: catmaid_user
--

ALTER SEQUENCE message_id_seq OWNED BY message.id;


--
-- Name: message_id_seq; Type: SEQUENCE SET; Schema: public2; Owner: catmaid_user
--

SELECT pg_catalog.setval('message_id_seq', 1, false);


--
-- Name: object; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE object (
    id integer NOT NULL,
    class character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    project_id integer NOT NULL,
    colour rgba DEFAULT ROW((1)::real, (0.5)::real, (0)::real, (0.75)::real) NOT NULL
);


ALTER TABLE public2.object OWNER TO catmaid_user;

--
-- Name: object_id_seq; Type: SEQUENCE; Schema: public2; Owner: catmaid_user
--

CREATE SEQUENCE object_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public2.object_id_seq OWNER TO catmaid_user;

--
-- Name: object_id_seq; Type: SEQUENCE OWNED BY; Schema: public2; Owner: catmaid_user
--

ALTER SEQUENCE object_id_seq OWNED BY object.id;


--
-- Name: object_id_seq; Type: SEQUENCE SET; Schema: public2; Owner: catmaid_user
--

SELECT pg_catalog.setval('object_id_seq', 1, false);


--
-- Name: project; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE project (
    id integer NOT NULL,
    title text NOT NULL,
    public boolean DEFAULT true NOT NULL
);


ALTER TABLE public2.project OWNER TO catmaid_user;

--
-- Name: project_id_seq; Type: SEQUENCE; Schema: public2; Owner: catmaid_user
--

CREATE SEQUENCE project_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public2.project_id_seq OWNER TO catmaid_user;

--
-- Name: project_id_seq; Type: SEQUENCE OWNED BY; Schema: public2; Owner: catmaid_user
--

ALTER SEQUENCE project_id_seq OWNED BY project.id;


--
-- Name: project_id_seq; Type: SEQUENCE SET; Schema: public2; Owner: catmaid_user
--

SELECT pg_catalog.setval('project_id_seq', 3, true);


--
-- Name: project_stack; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE project_stack (
    project_id integer NOT NULL,
    stack_id integer NOT NULL,
    translation double3d DEFAULT ROW((0)::double precision, (0)::double precision, (0)::double precision) NOT NULL
);


ALTER TABLE public2.project_stack OWNER TO catmaid_user;

--
-- Name: COLUMN project_stack.translation; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON COLUMN project_stack.translation IS 'nanometer';


--
-- Name: project_user; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE project_user (
    project_id integer NOT NULL,
    user_id integer NOT NULL
);


ALTER TABLE public2.project_user OWNER TO catmaid_user;

--
-- Name: relation; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE relation (
    relation_name character varying(255) NOT NULL,
    uri text,
    description text,
    isreciprocal boolean DEFAULT false NOT NULL
)
INHERITS (concept);


ALTER TABLE public2.relation OWNER TO catmaid_user;

--
-- Name: COLUMN relation.isreciprocal; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON COLUMN relation.isreciprocal IS 'Is the converse of the relationship valid?';


--
-- Name: stack; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE stack (
    id integer NOT NULL,
    title text NOT NULL,
    dimension integer3d NOT NULL,
    resolution double3d NOT NULL,
    image_base text NOT NULL,
    comment text,
    trakem2_project boolean DEFAULT false NOT NULL
);


ALTER TABLE public2.stack OWNER TO catmaid_user;

--
-- Name: COLUMN stack.dimension; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON COLUMN stack.dimension IS 'pixel';


--
-- Name: COLUMN stack.resolution; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON COLUMN stack.resolution IS 'nanometer per pixel';


--
-- Name: COLUMN stack.image_base; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON COLUMN stack.image_base IS 'base URL to the images';


--
-- Name: COLUMN stack.trakem2_project; Type: COMMENT; Schema: public2; Owner: catmaid_user
--

COMMENT ON COLUMN stack.trakem2_project IS 'States if a TrakEM2 project file is available for this stack.';


--
-- Name: stack_id_seq; Type: SEQUENCE; Schema: public2; Owner: catmaid_user
--

CREATE SEQUENCE stack_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public2.stack_id_seq OWNER TO catmaid_user;

--
-- Name: stack_id_seq; Type: SEQUENCE OWNED BY; Schema: public2; Owner: catmaid_user
--

ALTER SEQUENCE stack_id_seq OWNED BY stack.id;


--
-- Name: stack_id_seq; Type: SEQUENCE SET; Schema: public2; Owner: catmaid_user
--

SELECT pg_catalog.setval('stack_id_seq', 2, true);


--
-- Name: textlabel; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

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


ALTER TABLE public2.textlabel OWNER TO catmaid_user;

--
-- Name: textlabel_id_seq; Type: SEQUENCE; Schema: public2; Owner: catmaid_user
--

CREATE SEQUENCE textlabel_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public2.textlabel_id_seq OWNER TO catmaid_user;

--
-- Name: textlabel_id_seq; Type: SEQUENCE OWNED BY; Schema: public2; Owner: catmaid_user
--

ALTER SEQUENCE textlabel_id_seq OWNED BY textlabel.id;


--
-- Name: textlabel_id_seq; Type: SEQUENCE SET; Schema: public2; Owner: catmaid_user
--

SELECT pg_catalog.setval('textlabel_id_seq', 22, true);


--
-- Name: textlabel_location; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE textlabel_location (
    textlabel_id integer NOT NULL,
    location double3d NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public2.textlabel_location OWNER TO catmaid_user;

--
-- Name: treenode; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE treenode (
    parent_id bigint,
    location double3d NOT NULL,
    radius double precision DEFAULT 0 NOT NULL,
    confidence integer DEFAULT 5 NOT NULL
)
INHERITS (concept);


ALTER TABLE public2.treenode OWNER TO catmaid_user;

--
-- Name: treenode_class_instance; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE treenode_class_instance (
    treenode_id bigint NOT NULL,
    class_instance_id bigint NOT NULL
)
INHERITS (relation_instance);


ALTER TABLE public2.treenode_class_instance OWNER TO catmaid_user;

--
-- Name: user; Type: TABLE; Schema: public2; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE "user" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    pwd character varying(255) NOT NULL,
    longname text
);


ALTER TABLE public2."user" OWNER TO catmaid_user;

--
-- Name: user_id_seq; Type: SEQUENCE; Schema: public2; Owner: catmaid_user
--

CREATE SEQUENCE user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO MINVALUE
    CACHE 1;


ALTER TABLE public2.user_id_seq OWNER TO catmaid_user;

--
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public2; Owner: catmaid_user
--

ALTER SEQUENCE user_id_seq OWNED BY "user".id;


--
-- Name: user_id_seq; Type: SEQUENCE SET; Schema: public2; Owner: catmaid_user
--

SELECT pg_catalog.setval('user_id_seq', 3, true);


SET search_path = public, pg_catalog;

--
-- Name: id; Type: DEFAULT; Schema: public; Owner: catmaid_user
--

ALTER TABLE concept ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: catmaid_user
--

ALTER TABLE message ALTER COLUMN id SET DEFAULT nextval('message_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: catmaid_user
--

ALTER TABLE object ALTER COLUMN id SET DEFAULT nextval('object_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: catmaid_user
--

ALTER TABLE profile ALTER COLUMN id SET DEFAULT nextval('profile_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: catmaid_user
--

ALTER TABLE project ALTER COLUMN id SET DEFAULT nextval('project_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: catmaid_user
--

ALTER TABLE stack ALTER COLUMN id SET DEFAULT nextval('stack_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: catmaid_user
--

ALTER TABLE textlabel ALTER COLUMN id SET DEFAULT nextval('textlabel_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: catmaid_user
--

ALTER TABLE "user" ALTER COLUMN id SET DEFAULT nextval('user_id_seq'::regclass);


SET search_path = public2, pg_catalog;

--
-- Name: id; Type: DEFAULT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE concept ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE message ALTER COLUMN id SET DEFAULT nextval('message_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE object ALTER COLUMN id SET DEFAULT nextval('object_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE profile ALTER COLUMN id SET DEFAULT nextval('profile_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE project ALTER COLUMN id SET DEFAULT nextval('project_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE stack ALTER COLUMN id SET DEFAULT nextval('stack_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE textlabel ALTER COLUMN id SET DEFAULT nextval('textlabel_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE "user" ALTER COLUMN id SET DEFAULT nextval('user_id_seq'::regclass);


SET search_path = public, pg_catalog;

--
-- Data for Name: bezierkey; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY bezierkey (key, before, after, profile_id) FROM stdin;
\.


--
-- Data for Name: bezierprofile; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY bezierprofile (id, z, object_id) FROM stdin;
\.


--
-- Data for Name: broken_slice; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY broken_slice (stack_id, index) FROM stdin;
\.


--
-- Data for Name: class; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY class (id, user_id, creation_time, edition_time, project_id, class_name, uri, description, showintree) FROM stdin;
14	1	2010-08-26 19:19:57.046457+02	2010-08-26 19:19:57.046457+02	3	skeleton	\N	\N	t
5	1	2010-08-26 18:23:53.551017+02	2010-08-26 18:23:53.551017+02	3	neuron	http://flybase.org/.bin/cvreport.html?cvterm=FBbt:00005106+childdepth=2+parentdepth=all	\N	t
106	3	2010-10-12 09:42:55.856494+02	2010-10-12 09:42:55.856494+02	3	group	\N	A group helps to organize the data, i.e. it can contain neuron or other groups.	t
33	3	2010-08-27 17:28:08.713582+02	2010-08-27 17:28:08.713582+02	3	label	\N	\N	f
107	3	2010-10-12 10:11:23.015507+02	2010-10-12 10:11:23.015507+02	3	neurongroup	\N	a group of neurons	t
112	3	2010-10-12 11:29:38.385393+02	2010-10-12 11:29:38.385393+02	3	root	\N	\N	f
12	1	2010-08-26 19:18:02.355176+02	2010-08-26 19:18:02.355176+02	3	soma	http://flybase.org/cgi-bin/cvreport.html?rel=is_a&id=FBbt:00005107	\N	t
7	3	2010-08-26 18:30:53.288021+02	2010-08-26 18:30:53.288021+02	3	synapse	http://flybase.org/.bin/cvreport.html?cvterm=GO:0045202	\N	t
755	3	2010-12-20 16:17:48.122167+01	2010-12-20 16:17:48.122167+01	3	presynaptic terminal			t
756	3	2010-12-20 16:18:07.231631+01	2010-12-20 16:18:07.231631+01	3	postsynaptic terminal			t
\.


--
-- Data for Name: class_class; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY class_class (id, user_id, creation_time, edition_time, project_id, relation_id, class_a, class_b) FROM stdin;
19	1	2010-08-26 20:45:12.094786+02	2010-08-26 20:45:12.094786+02	1	9	12	5
769	3	2010-12-29 10:10:55.250768+01	2010-12-29 10:10:55.250768+01	3	9	106	112
770	3	2010-12-29 10:11:44.5468+01	2010-12-29 10:11:44.5468+01	3	9	5	106
771	3	2010-12-29 10:12:03.429698+01	2010-12-29 10:12:03.429698+01	3	10	14	5
772	3	2010-12-29 10:13:36.325314+01	2010-12-29 10:13:36.325314+01	3	23	755	7
773	3	2010-12-29 10:14:17.197382+01	2010-12-29 10:14:17.197382+01	3	24	756	7
\.


--
-- Data for Name: class_instance; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) FROM stdin;
1130	3	2010-12-29 16:51:12.464135+01	2010-12-29 16:51:12.475947+01	3	7	synapse 1130
1131	3	2010-12-29 16:51:12.483692+01	2010-12-29 16:51:12.492144+01	3	755	presynaptic terminal 1131
1136	3	2010-12-29 17:04:35.537424+01	2010-12-29 17:04:35.554834+01	3	14	new skeleton 1136
1137	3	2010-12-29 17:04:35.562584+01	2010-12-29 17:04:35.571137+01	3	5	new neuron 1137
1142	3	2010-12-29 17:04:35.756465+01	2010-12-29 17:04:35.761871+01	3	756	postsynaptic terminal 1142
1151	3	2010-12-29 17:04:51.807453+01	2010-12-29 17:04:51.817884+01	3	14	new skeleton 1151
1152	3	2010-12-29 17:04:51.825683+01	2010-12-29 17:04:51.83419+01	3	5	new neuron 1152
1157	3	2010-12-29 17:04:52.01294+01	2010-12-29 17:04:52.016683+01	3	756	postsynaptic terminal 1157
1160	3	2010-12-29 17:04:54.795298+01	2010-12-29 17:04:54.844915+01	3	14	new skeleton 1160
1161	3	2010-12-29 17:04:54.85267+01	2010-12-29 17:04:54.861168+01	3	5	new neuron 1161
1166	3	2010-12-29 17:04:55.031718+01	2010-12-29 17:04:55.035685+01	3	756	postsynaptic terminal 1166
1169	3	2010-12-29 17:08:38.909588+01	2010-12-29 17:08:38.926548+01	3	14	new skeleton 1169
1170	3	2010-12-29 17:08:38.934716+01	2010-12-29 17:08:38.943138+01	3	5	new neuron 1170
1175	3	2010-12-29 17:08:39.113064+01	2010-12-29 17:08:39.117739+01	3	756	postsynaptic terminal 1175
1192	3	2010-12-29 17:09:06.573571+01	2010-12-29 17:09:06.593172+01	3	7	synapse 1192
1193	3	2010-12-29 17:09:06.600968+01	2010-12-29 17:09:06.609424+01	3	755	presynaptic terminal 1193
1198	3	2010-12-29 17:09:37.841267+01	2010-12-29 17:09:37.850188+01	3	14	new skeleton 1198
1199	3	2010-12-29 17:09:37.858047+01	2010-12-29 17:09:37.866477+01	3	5	new neuron 1199
1204	3	2010-12-29 17:09:38.037955+01	2010-12-29 17:09:38.048918+01	3	756	postsynaptic terminal 1204
1207	3	2010-12-29 17:09:53.918949+01	2010-12-29 17:09:53.939007+01	3	14	new skeleton 1207
1208	3	2010-12-29 17:09:53.946895+01	2010-12-29 17:09:53.955446+01	3	5	new neuron 1208
1213	3	2010-12-29 17:09:54.127165+01	2010-12-29 17:09:54.146458+01	3	756	postsynaptic terminal 1213
1220	3	2010-12-29 17:11:18.030745+01	2010-12-29 17:11:18.040533+01	3	14	new skeleton 1220
1221	3	2010-12-29 17:11:18.048297+01	2010-12-29 17:11:18.056936+01	3	5	new neuron 1221
1111	3	2010-12-29 16:47:42.321192+01	2010-12-29 16:47:42.321192+01	3	112	neuropi
1112	3	2010-12-29 16:47:53.249174+01	2010-12-29 16:47:53.265007+01	3	14	new skeleton 1112
1113	3	2010-12-29 16:47:53.272744+01	2010-12-29 16:47:53.281366+01	3	5	new neuron 1113
1115	3	2010-12-29 16:47:53.298402+01	2010-12-29 16:47:53.298402+01	3	106	Fragments
1124	3	2010-12-29 16:47:57.024596+01	2010-12-29 16:47:57.038447+01	3	7	synapse 1124
1125	3	2010-12-29 16:47:57.046217+01	2010-12-29 16:47:57.05474+01	3	755	presynaptic terminal 1125
\.


--
-- Data for Name: class_instance_class_instance; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) FROM stdin;
1135	3	2010-12-29 16:51:12.525311+01	2010-12-29 16:51:12.525311+01	3	23	1131	1130
1138	3	2010-12-29 17:04:35.579228+01	2010-12-29 17:04:35.579228+01	3	10	1136	1137
1139	3	2010-12-29 17:04:35.59628+01	2010-12-29 17:04:35.59628+01	3	9	1137	1115
1144	3	2010-12-29 17:04:35.778271+01	2010-12-29 17:04:35.778271+01	3	24	1142	1124
1153	3	2010-12-29 17:04:51.842272+01	2010-12-29 17:04:51.842272+01	3	10	1151	1152
1154	3	2010-12-29 17:04:51.850919+01	2010-12-29 17:04:51.850919+01	3	9	1152	1115
1159	3	2010-12-29 17:04:52.032956+01	2010-12-29 17:04:52.032956+01	3	24	1157	1124
1162	3	2010-12-29 17:04:54.869293+01	2010-12-29 17:04:54.869293+01	3	10	1160	1161
1163	3	2010-12-29 17:04:54.878105+01	2010-12-29 17:04:54.878105+01	3	9	1161	1115
1168	3	2010-12-29 17:04:55.051868+01	2010-12-29 17:04:55.051868+01	3	24	1166	1124
1171	3	2010-12-29 17:08:38.951218+01	2010-12-29 17:08:38.951218+01	3	10	1169	1170
1172	3	2010-12-29 17:08:38.959979+01	2010-12-29 17:08:38.959979+01	3	9	1170	1115
1177	3	2010-12-29 17:08:39.133789+01	2010-12-29 17:08:39.133789+01	3	24	1175	1130
1197	3	2010-12-29 17:09:06.642369+01	2010-12-29 17:09:06.642369+01	3	23	1193	1192
1200	3	2010-12-29 17:09:37.874671+01	2010-12-29 17:09:37.874671+01	3	10	1198	1199
1201	3	2010-12-29 17:09:37.883311+01	2010-12-29 17:09:37.883311+01	3	9	1199	1115
1206	3	2010-12-29 17:09:38.065302+01	2010-12-29 17:09:38.065302+01	3	24	1204	1192
1209	3	2010-12-29 17:09:53.963344+01	2010-12-29 17:09:53.963344+01	3	10	1207	1208
1210	3	2010-12-29 17:09:53.972335+01	2010-12-29 17:09:53.972335+01	3	9	1208	1115
1215	3	2010-12-29 17:09:54.162473+01	2010-12-29 17:09:54.162473+01	3	24	1213	1192
1222	3	2010-12-29 17:11:18.064857+01	2010-12-29 17:11:18.064857+01	3	10	1220	1221
1223	3	2010-12-29 17:11:18.073599+01	2010-12-29 17:11:18.073599+01	3	9	1221	1115
1114	3	2010-12-29 16:47:53.289365+01	2010-12-29 16:47:53.289365+01	3	10	1112	1113
1116	3	2010-12-29 16:47:53.307047+01	2010-12-29 16:47:53.307047+01	3	9	1115	1111
1117	3	2010-12-29 16:47:53.314195+01	2010-12-29 16:47:53.314195+01	3	9	1113	1115
1129	3	2010-12-29 16:47:57.087627+01	2010-12-29 16:47:57.087627+01	3	23	1125	1124
\.


--
-- Data for Name: concept; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY concept (id, user_id, creation_time, edition_time, project_id) FROM stdin;
\.


--
-- Data for Name: location; Type: TABLE DATA; Schema: public; Owner: stephan
--

COPY location (id, user_id, creation_time, edition_time, project_id, location) FROM stdin;
1194	3	2010-12-29 17:09:06.617506+01	2010-12-29 17:09:06.617506+01	3	(5790,3200,36)
1126	3	2010-12-29 16:47:57.062781+01	2010-12-29 16:47:57.062781+01	3	(3570,3090,9)
1132	3	2010-12-29 16:51:12.500211+01	2010-12-29 16:51:12.500211+01	3	(4720,3670,9)
\.


--
-- Data for Name: location_class_instance; Type: TABLE DATA; Schema: public; Owner: stephan
--

COPY location_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, location_id, class_instance_id) FROM stdin;
1128	3	2010-12-29 16:47:57.07936+01	2010-12-29 16:47:57.07936+01	3	10	1126	1124
1134	3	2010-12-29 16:51:12.516879+01	2010-12-29 16:51:12.516879+01	3	10	1132	1130
1196	3	2010-12-29 17:09:06.634158+01	2010-12-29 17:09:06.634158+01	3	10	1194	1192
\.


--
-- Data for Name: message; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY message (id, user_id, "time", read, title, text, action) FROM stdin;
\.


--
-- Data for Name: object; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY object (id, class, name, project_id, colour) FROM stdin;
\.


--
-- Data for Name: profile; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY profile (id, z, object_id) FROM stdin;
\.


--
-- Data for Name: project; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY project (id, title, public) FROM stdin;
1	Default Project	t
2	Evaluation data set	t
3	Focussed Ion Beam (FIB)	t
\.


--
-- Data for Name: project_stack; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY project_stack (project_id, stack_id, translation) FROM stdin;
1	1	(0,0,0)
3	2	(0,0,0)
\.


--
-- Data for Name: project_user; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY project_user (project_id, user_id) FROM stdin;
1	1
3	1
1	3
3	3
2	3
\.


--
-- Data for Name: relation; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) FROM stdin;
35	3	2010-08-27 17:30:10.480635+02	2010-08-27 17:30:10.480635+02	3	labeled_as	\N	\N	f
24	1	2010-08-26 21:21:35.859377+02	2010-08-26 21:21:35.859377+02	3	postsynaptic_to	\N	\N	f
23	1	2010-08-26 21:20:51.55492+02	2010-08-26 21:20:51.55492+02	3	presynaptic_to	\N	\N	f
11	1	2010-08-26 19:15:41.060476+02	2010-08-26 19:15:41.060476+02	3	element_of	\N	\N	f
10	1	2010-08-26 19:15:31.939089+02	2010-08-26 19:15:31.939089+02	3	model_of	\N	\N	f
9	1	2010-08-26 19:15:22.408939+02	2010-08-26 19:15:22.408939+02	3	part_of	\N	\N	f
8	1	2010-08-26 19:08:19.488588+02	2010-08-26 19:08:19.488588+02	3	is_a	\N	\N	f
\.


--
-- Data for Name: relation_instance; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY relation_instance (id, user_id, creation_time, edition_time, project_id, relation_id) FROM stdin;
\.


--
-- Data for Name: stack; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY stack (id, title, dimension, resolution, image_base, comment, trakem2_project) FROM stdin;
1	Original data.	(4096,4096,16)	(3.2614000000000001,3.2614000000000001,60)	http://fly.mpi-cbg.de/map/evaluation/original/	<p>&copy;2007 by Stephan Saalfeld.</p>\n<p>Rendered with <a href="http://www.povray.org/">POV-Ray&nbsp;v3.6</a> using this <a href="http://fly.mpi-cbg.de/~saalfeld/download/volume.tar.bz2">scene-file</a>.</p>	f
2	Focussed Ion Beam (FIB) stack of Rat Striatum	(2048,1536,460)	(5,5,9)	http://incf.ini.uzh.ch/image-stack-fib/	<p>&copy;2009 <a href="http://people.epfl.ch/graham.knott">Graham Knott</a>.</p>\n<p>Public INCF data set available at the <a href="http://www.incf.org/about/nodes/switzerland/data">Swiss INCF Node</a>.</p>	f
\.


--
-- Data for Name: textlabel; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY textlabel (id, type, text, colour, font_name, font_style, font_size, project_id, scaling, creation_time, edition_time, deleted) FROM stdin;
3	text	Schoen	(1,0.49803922,0,1)	\N	bold	978	1	t	2010-08-27 12:38:40.980952+02	2010-08-27 12:39:00.6389+02	f
2	text	Edit this text...	(1,0.8509804,0,1)	\N	bold	1196	1	t	2010-08-26 12:36:48.24755+02	2010-08-26 12:36:50.836827+02	t
5	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	250	3	t	2010-09-13 11:50:47.159475+02	2010-09-13 11:50:49.604793+02	t
6	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-10-11 14:15:31.168282+02	2010-10-11 14:15:33.854817+02	t
7	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-10-11 14:16:05.826567+02	2010-10-11 14:16:08.769985+02	t
8	text	MYTEST\n	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-10-18 09:38:47.088904+02	2010-10-18 09:39:33.143551+02	t
9	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-10-18 09:44:24.225973+02	2010-10-18 09:44:29.548195+02	t
4	text	Test	(1,0.49803922,0,1)	\N	bold	250	3	t	2010-08-27 15:19:17.197702+02	2010-12-20 09:31:47.015919+01	t
13	text	Myelinated axon	(0,0,1,1)	\N	bold	150	3	t	2010-12-01 09:43:16.700626+01	2010-12-20 09:36:28.343518+01	t
15	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 09:37:38.285231+01	2010-12-20 09:37:44.347119+01	t
14	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 09:36:39.000766+01	2010-12-20 09:38:43.094581+01	t
16	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:10:26.269007+01	2010-12-20 10:10:29.762499+01	t
17	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:10:53.579777+01	2010-12-20 10:14:46.224959+01	t
18	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:10:54.103042+01	2010-12-20 10:15:57.32196+01	t
19	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:16:12.935654+01	2010-12-20 10:16:21.208902+01	t
21	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:16:14.335655+01	2010-12-20 10:16:25.638116+01	t
10	text	*	(0,0,1,1)	\N	bold	260	3	t	2010-12-01 09:41:45.68728+01	2010-12-01 09:42:08.359032+01	f
20	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:16:13.782039+01	2010-12-20 10:16:29.660556+01	t
22	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:19:56.8591+01	2010-12-20 10:19:56.8591+01	f
11	text	Mitochondria	(0,0,1,1)	\N	bold	160	3	t	2010-12-01 09:42:09.159965+01	2010-12-20 12:37:54.40121+01	f
1	text	Guten Tag!	(1,0.8509804,0,1)	\N	bold	864	1	t	2010-08-26 12:35:10.72796+02	2010-12-20 17:38:32.970317+01	f
12	text	*	(0,0,1,1)	\N	bold	260	3	t	2010-12-01 09:42:35.406046+01	2010-12-01 09:42:56.152671+01	f
\.


--
-- Data for Name: textlabel_location; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY textlabel_location (textlabel_id, location, deleted) FROM stdin;
3	(8580.7433999999994,5945.5321999999996,60)	f
2	(7501.2200000000003,7798.0074000000004,60)	t
5	(4820,2375,9)	t
6	(3420,3640,153)	t
7	(2175,4200,9)	t
8	(1440,4145,99)	t
9	(2035,4005,9)	t
10	(5240,2380,45)	f
12	(5725,2360,45)	f
4	(2690,2767.5,9)	t
13	(5150,3705,45)	t
15	(3605,4185,9)	t
14	(4085,4015,0)	t
16	(1665,3065,0)	t
17	(2115,4135,0)	t
18	(4885,4135,0)	t
19	(3105,3195,0)	t
21	(4055,4705,0)	t
20	(5495,4145,0)	t
22	(3225,3725,0)	f
11	(5680,1785,45)	f
1	(4393.1058000000003,3701.6889999999999,60)	f
\.


--
-- Data for Name: treenode; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY treenode (id, user_id, creation_time, edition_time, project_id, location, parent_id, radius, confidence) FROM stdin;
1122	3	2010-12-29 16:47:54.437281+01	2010-12-29 16:47:54.437281+01	3	(4260,3470,9)	1120	4	5
1118	3	2010-12-29 16:47:53.32253+01	2010-12-29 16:47:53.32253+01	3	(2790,4160,9)	\N	4	5
1140	3	2010-12-29 17:04:35.604212+01	2010-12-29 17:04:35.604212+01	3	(3570,2540,9)	\N	4	5
1145	3	2010-12-29 17:04:42.953017+01	2010-12-29 17:04:42.953017+01	3	(3930,2510,9)	1140	4	5
1147	3	2010-12-29 17:04:43.831081+01	2010-12-29 17:04:43.831081+01	3	(4270,2490,9)	1145	4	5
1149	3	2010-12-29 17:04:47.202532+01	2010-12-29 17:04:47.202532+01	3	(4390,2340,9)	1147	4	5
1155	3	2010-12-29 17:04:51.85884+01	2010-12-29 17:04:51.85884+01	3	(3090,2560,9)	\N	4	5
1164	3	2010-12-29 17:04:54.885942+01	2010-12-29 17:04:54.885942+01	3	(2810,2880,9)	\N	4	5
1173	3	2010-12-29 17:08:38.967858+01	2010-12-29 17:08:38.967858+01	3	(5050,3290,9)	\N	4	5
1178	3	2010-12-29 17:08:41.264982+01	2010-12-29 17:08:41.264982+01	3	(5040,2970,9)	1173	4	5
1182	3	2010-12-29 17:08:42.500573+01	2010-12-29 17:08:42.500573+01	3	(5380,2870,9)	1180	4	5
1184	3	2010-12-29 17:08:44.925466+01	2010-12-29 17:08:44.925466+01	3	(5300,2390,9)	1180	4	5
1180	3	2010-12-29 17:08:41.889629+01	2010-12-29 17:08:41.889629+01	3	(5170,2550,9)	1178	4	5
1188	3	2010-12-29 17:08:52.633665+01	2010-12-29 17:08:52.633665+01	3	(5760,2670,27)	1186	4	5
1190	3	2010-12-29 17:08:55.118632+01	2010-12-29 17:08:55.118632+01	3	(5910,2920,36)	1188	4	5
1202	3	2010-12-29 17:09:37.891164+01	2010-12-29 17:09:37.891164+01	3	(5510,3570,45)	\N	4	5
1211	3	2010-12-29 17:09:53.979968+01	2010-12-29 17:09:53.979968+01	3	(6290,3420,45)	\N	4	5
1216	3	2010-12-29 17:10:12.32923+01	2010-12-29 17:10:12.32923+01	3	(6460,3220,54)	1211	4	5
1218	3	2010-12-29 17:10:16.110263+01	2010-12-29 17:10:16.110263+01	3	(6500,2950,63)	1216	4	5
1186	3	2010-12-29 17:08:48.776107+01	2010-12-29 17:08:48.776107+01	3	(5560,2540,18)	1184	4	5
1226	3	2010-12-29 17:11:33.787753+01	2010-12-29 17:11:33.787753+01	3	(2910,3330,9)	1224	4	5
1224	3	2010-12-29 17:11:18.081519+01	2010-12-29 17:11:18.081519+01	3	(3120,3550,9)	\N	4	5
1228	3	2010-12-29 17:13:21.103371+01	2010-12-29 17:13:21.103371+01	3	(2910,3710,9)	1224	4	5
1232	3	2010-12-29 17:13:37.718586+01	2010-12-29 17:13:37.718586+01	3	(4435,4250,9)	1230	4	5
1230	3	2010-12-29 17:13:32.142179+01	2010-12-29 17:13:32.142179+01	3	(3590,4130,9)	1226	4	5
1120	3	2010-12-29 16:47:53.86612+01	2010-12-29 16:47:53.86612+01	3	(3570,3720,9)	1118	4	5
\.


--
-- Data for Name: treenode_class_instance; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) FROM stdin;
1133	3	2010-12-29 16:51:12.508739+01	2010-12-29 16:51:12.508739+01	3	10	1122	1131
1141	3	2010-12-29 17:04:35.612734+01	2010-12-29 17:04:35.612734+01	3	11	1140	1136
1143	3	2010-12-29 17:04:35.770088+01	2010-12-29 17:04:35.770088+01	3	10	1140	1142
1146	3	2010-12-29 17:04:42.969004+01	2010-12-29 17:04:42.969004+01	3	11	1145	1136
1148	3	2010-12-29 17:04:43.872733+01	2010-12-29 17:04:43.872733+01	3	11	1147	1136
1150	3	2010-12-29 17:04:47.206936+01	2010-12-29 17:04:47.206936+01	3	11	1149	1136
1156	3	2010-12-29 17:04:51.86749+01	2010-12-29 17:04:51.86749+01	3	11	1155	1151
1158	3	2010-12-29 17:04:52.024715+01	2010-12-29 17:04:52.024715+01	3	10	1155	1157
1165	3	2010-12-29 17:04:54.894458+01	2010-12-29 17:04:54.894458+01	3	11	1164	1160
1167	3	2010-12-29 17:04:55.043501+01	2010-12-29 17:04:55.043501+01	3	10	1164	1166
1174	3	2010-12-29 17:08:38.976535+01	2010-12-29 17:08:38.976535+01	3	11	1173	1169
1176	3	2010-12-29 17:08:39.125544+01	2010-12-29 17:08:39.125544+01	3	10	1173	1175
1179	3	2010-12-29 17:08:41.330948+01	2010-12-29 17:08:41.330948+01	3	11	1178	1169
1181	3	2010-12-29 17:08:41.895776+01	2010-12-29 17:08:41.895776+01	3	11	1180	1169
1183	3	2010-12-29 17:08:42.509452+01	2010-12-29 17:08:42.509452+01	3	11	1182	1169
1185	3	2010-12-29 17:08:44.939561+01	2010-12-29 17:08:44.939561+01	3	11	1184	1169
1187	3	2010-12-29 17:08:48.779315+01	2010-12-29 17:08:48.779315+01	3	11	1186	1169
1189	3	2010-12-29 17:08:52.643593+01	2010-12-29 17:08:52.643593+01	3	11	1188	1169
1191	3	2010-12-29 17:08:55.123239+01	2010-12-29 17:08:55.123239+01	3	11	1190	1169
1195	3	2010-12-29 17:09:06.626038+01	2010-12-29 17:09:06.626038+01	3	10	1190	1193
1203	3	2010-12-29 17:09:37.899656+01	2010-12-29 17:09:37.899656+01	3	11	1202	1198
1205	3	2010-12-29 17:09:38.057164+01	2010-12-29 17:09:38.057164+01	3	10	1202	1204
1212	3	2010-12-29 17:09:53.988501+01	2010-12-29 17:09:53.988501+01	3	11	1211	1207
1214	3	2010-12-29 17:09:54.154244+01	2010-12-29 17:09:54.154244+01	3	10	1211	1213
1217	3	2010-12-29 17:10:12.341556+01	2010-12-29 17:10:12.341556+01	3	11	1216	1207
1219	3	2010-12-29 17:10:16.114864+01	2010-12-29 17:10:16.114864+01	3	11	1218	1207
1225	3	2010-12-29 17:11:18.09003+01	2010-12-29 17:11:18.09003+01	3	11	1224	1220
1227	3	2010-12-29 17:11:33.805859+01	2010-12-29 17:11:33.805859+01	3	11	1226	1220
1229	3	2010-12-29 17:13:21.16942+01	2010-12-29 17:13:21.16942+01	3	11	1228	1220
1231	3	2010-12-29 17:13:32.157946+01	2010-12-29 17:13:32.157946+01	3	11	1230	1220
1233	3	2010-12-29 17:13:37.730946+01	2010-12-29 17:13:37.730946+01	3	11	1232	1220
1119	3	2010-12-29 16:47:53.330982+01	2010-12-29 16:47:53.330982+01	3	11	1118	1112
1121	3	2010-12-29 16:47:53.870024+01	2010-12-29 16:47:53.870024+01	3	11	1120	1112
1123	3	2010-12-29 16:47:54.442624+01	2010-12-29 16:47:54.442624+01	3	11	1122	1112
1127	3	2010-12-29 16:47:57.071321+01	2010-12-29 16:47:57.071321+01	3	10	1120	1125
\.


--
-- Data for Name: user; Type: TABLE DATA; Schema: public; Owner: catmaid_user
--

COPY "user" (id, name, pwd, longname) FROM stdin;
1	saalfeld	84789cbcbd2daf359a9fa4f34350e50f	Stephan Saalfeld
2	test	098f6bcd4621d373cade4e832627b4f6	Theo Test
3	gerhard	494524b27acdc356fb3dcb9f0b108267	Stephan Gerhard
\.


SET search_path = public2, pg_catalog;

--
-- Data for Name: bezierkey; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY bezierkey (key, before, after, profile_id) FROM stdin;
\.


--
-- Data for Name: bezierprofile; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY bezierprofile (id, z, object_id) FROM stdin;
\.


--
-- Data for Name: broken_slice; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY broken_slice (stack_id, index) FROM stdin;
\.


--
-- Data for Name: class; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY class (id, user_id, creation_time, edition_time, project_id, class_name, uri, description, showintree) FROM stdin;
14	1	2010-08-26 19:19:57.046457+02	2010-08-26 19:19:57.046457+02	3	skeleton	\N	\N	t
5	1	2010-08-26 18:23:53.551017+02	2010-08-26 18:23:53.551017+02	3	neuron	http://flybase.org/.bin/cvreport.html?cvterm=FBbt:00005106+childdepth=2+parentdepth=all	\N	t
106	3	2010-10-12 09:42:55.856494+02	2010-10-12 09:42:55.856494+02	3	group	\N	A group helps to organize the data, i.e. it can contain neuron or other groups.	t
33	3	2010-08-27 17:28:08.713582+02	2010-08-27 17:28:08.713582+02	3	label	\N	\N	f
107	3	2010-10-12 10:11:23.015507+02	2010-10-12 10:11:23.015507+02	3	neurongroup	\N	a group of neurons	t
112	3	2010-10-12 11:29:38.385393+02	2010-10-12 11:29:38.385393+02	3	root	\N	\N	f
12	1	2010-08-26 19:18:02.355176+02	2010-08-26 19:18:02.355176+02	3	soma	http://flybase.org/cgi-bin/cvreport.html?rel=is_a&id=FBbt:00005107	\N	t
7	3	2010-08-26 18:30:53.288021+02	2010-08-26 18:30:53.288021+02	3	synapse	http://flybase.org/.bin/cvreport.html?cvterm=GO:0045202	\N	t
755	3	2010-12-20 16:17:48.122167+01	2010-12-20 16:17:48.122167+01	3	presynaptic terminal			t
756	3	2010-12-20 16:18:07.231631+01	2010-12-20 16:18:07.231631+01	3	postsynaptic terminal			t
\.


--
-- Data for Name: class_class; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY class_class (id, user_id, creation_time, edition_time, project_id, relation_id, class_a, class_b) FROM stdin;
19	1	2010-08-26 20:45:12.094786+02	2010-08-26 20:45:12.094786+02	1	9	12	5
\.


--
-- Data for Name: class_instance; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY class_instance (id, user_id, creation_time, edition_time, project_id, class_id, name) FROM stdin;
747	3	2010-12-20 15:42:36.858473+01	2010-12-20 15:42:36.875538+01	3	14	new skeleton 747
748	3	2010-12-20 15:42:36.883434+01	2010-12-20 15:42:36.891995+01	3	5	new neuron 748
750	3	2010-12-20 15:42:36.909055+01	2010-12-20 15:42:36.909055+01	3	106	Fragments
757	3	2010-12-20 17:17:32.691623+01	2010-12-20 17:17:32.718677+01	3	7	synapse 757
758	3	2010-12-20 17:17:32.72668+01	2010-12-20 17:17:32.735071+01	3	755	presynaptic terminal 758
746	3	2010-12-20 15:41:16.704306+01	2010-12-20 15:41:16.704306+01	3	112	neuropile
\.


--
-- Data for Name: class_instance_class_instance; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY class_instance_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, class_instance_a, class_instance_b) FROM stdin;
749	3	2010-12-20 15:42:36.900035+01	2010-12-20 15:42:36.900035+01	3	10	747	748
751	3	2010-12-20 15:42:36.917779+01	2010-12-20 15:42:36.917779+01	3	9	750	746
752	3	2010-12-20 15:42:36.924986+01	2010-12-20 15:42:36.924986+01	3	9	748	750
762	3	2010-12-20 17:17:32.776385+01	2010-12-20 17:17:32.776385+01	3	23	758	757
\.


--
-- Data for Name: concept; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY concept (id, user_id, creation_time, edition_time, project_id) FROM stdin;
\.


--
-- Data for Name: location; Type: TABLE DATA; Schema: public2; Owner: stephan
--

COPY location (id, user_id, creation_time, edition_time, project_id, location) FROM stdin;
759	3	2010-12-20 17:17:32.743181+01	2010-12-20 17:17:32.743181+01	3	(4580,3960,9)
\.


--
-- Data for Name: location_class_instance; Type: TABLE DATA; Schema: public2; Owner: stephan
--

COPY location_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, location_id, class_instance_id) FROM stdin;
761	3	2010-12-20 17:17:32.768209+01	2010-12-20 17:17:32.768209+01	3	10	759	757
\.


--
-- Data for Name: message; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY message (id, user_id, "time", read, title, text, action) FROM stdin;
\.


--
-- Data for Name: object; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY object (id, class, name, project_id, colour) FROM stdin;
\.


--
-- Data for Name: profile; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY profile (id, z, object_id) FROM stdin;
\.


--
-- Data for Name: project; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY project (id, title, public) FROM stdin;
1	Default Project	t
2	Evaluation data set	t
3	Focussed Ion Beam (FIB)	t
\.


--
-- Data for Name: project_stack; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY project_stack (project_id, stack_id, translation) FROM stdin;
1	1	(0,0,0)
3	2	(0,0,0)
\.


--
-- Data for Name: project_user; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY project_user (project_id, user_id) FROM stdin;
1	1
3	1
1	3
3	3
2	3
\.


--
-- Data for Name: relation; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY relation (id, user_id, creation_time, edition_time, project_id, relation_name, uri, description, isreciprocal) FROM stdin;
35	3	2010-08-27 17:30:10.480635+02	2010-08-27 17:30:10.480635+02	3	labeled_as	\N	\N	f
24	1	2010-08-26 21:21:35.859377+02	2010-08-26 21:21:35.859377+02	3	postsynaptic_to	\N	\N	f
23	1	2010-08-26 21:20:51.55492+02	2010-08-26 21:20:51.55492+02	3	presynaptic_to	\N	\N	f
11	1	2010-08-26 19:15:41.060476+02	2010-08-26 19:15:41.060476+02	3	element_of	\N	\N	f
10	1	2010-08-26 19:15:31.939089+02	2010-08-26 19:15:31.939089+02	3	model_of	\N	\N	f
9	1	2010-08-26 19:15:22.408939+02	2010-08-26 19:15:22.408939+02	3	part_of	\N	\N	f
8	1	2010-08-26 19:08:19.488588+02	2010-08-26 19:08:19.488588+02	3	is_a	\N	\N	f
\.


--
-- Data for Name: relation_instance; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY relation_instance (id, user_id, creation_time, edition_time, project_id, relation_id) FROM stdin;
\.


--
-- Data for Name: stack; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY stack (id, title, dimension, resolution, image_base, comment, trakem2_project) FROM stdin;
1	Original data.	(4096,4096,16)	(3.2614000000000001,3.2614000000000001,60)	http://fly.mpi-cbg.de/map/evaluation/original/	<p>&copy;2007 by Stephan Saalfeld.</p>\n<p>Rendered with <a href="http://www.povray.org/">POV-Ray&nbsp;v3.6</a> using this <a href="http://fly.mpi-cbg.de/~saalfeld/download/volume.tar.bz2">scene-file</a>.</p>	f
2	Focussed Ion Beam (FIB) stack of Rat Striatum	(2048,1536,460)	(5,5,9)	http://incf.ini.uzh.ch/image-stack-fib/	<p>&copy;2009 <a href="http://people.epfl.ch/graham.knott">Graham Knott</a>.</p>\n<p>Public INCF data set available at the <a href="http://www.incf.org/about/nodes/switzerland/data">Swiss INCF Node</a>.</p>	f
\.


--
-- Data for Name: textlabel; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY textlabel (id, type, text, colour, font_name, font_style, font_size, project_id, scaling, creation_time, edition_time, deleted) FROM stdin;
3	text	Schoen	(1,0.49803922,0,1)	\N	bold	978	1	t	2010-08-27 12:38:40.980952+02	2010-08-27 12:39:00.6389+02	f
2	text	Edit this text...	(1,0.8509804,0,1)	\N	bold	1196	1	t	2010-08-26 12:36:48.24755+02	2010-08-26 12:36:50.836827+02	t
5	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	250	3	t	2010-09-13 11:50:47.159475+02	2010-09-13 11:50:49.604793+02	t
6	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-10-11 14:15:31.168282+02	2010-10-11 14:15:33.854817+02	t
7	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-10-11 14:16:05.826567+02	2010-10-11 14:16:08.769985+02	t
8	text	MYTEST\n	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-10-18 09:38:47.088904+02	2010-10-18 09:39:33.143551+02	t
9	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-10-18 09:44:24.225973+02	2010-10-18 09:44:29.548195+02	t
4	text	Test	(1,0.49803922,0,1)	\N	bold	250	3	t	2010-08-27 15:19:17.197702+02	2010-12-20 09:31:47.015919+01	t
13	text	Myelinated axon	(0,0,1,1)	\N	bold	150	3	t	2010-12-01 09:43:16.700626+01	2010-12-20 09:36:28.343518+01	t
15	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 09:37:38.285231+01	2010-12-20 09:37:44.347119+01	t
14	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 09:36:39.000766+01	2010-12-20 09:38:43.094581+01	t
16	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:10:26.269007+01	2010-12-20 10:10:29.762499+01	t
17	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:10:53.579777+01	2010-12-20 10:14:46.224959+01	t
18	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:10:54.103042+01	2010-12-20 10:15:57.32196+01	t
19	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:16:12.935654+01	2010-12-20 10:16:21.208902+01	t
21	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:16:14.335655+01	2010-12-20 10:16:25.638116+01	t
10	text	*	(0,0,1,1)	\N	bold	260	3	t	2010-12-01 09:41:45.68728+01	2010-12-01 09:42:08.359032+01	f
20	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:16:13.782039+01	2010-12-20 10:16:29.660556+01	t
22	text	Edit this text...	(1,0.49803922,0,1)	\N	bold	160	3	t	2010-12-20 10:19:56.8591+01	2010-12-20 10:19:56.8591+01	f
11	text	Mitochondria	(0,0,1,1)	\N	bold	160	3	t	2010-12-01 09:42:09.159965+01	2010-12-20 12:37:54.40121+01	f
1	text	Guten Tag!	(1,0.8509804,0,1)	\N	bold	864	1	t	2010-08-26 12:35:10.72796+02	2010-12-20 17:38:32.970317+01	f
12	text	*	(0,0,1,1)	\N	bold	260	3	t	2010-12-01 09:42:35.406046+01	2010-12-01 09:42:56.152671+01	f
\.


--
-- Data for Name: textlabel_location; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY textlabel_location (textlabel_id, location, deleted) FROM stdin;
3	(8580.7433999999994,5945.5321999999996,60)	f
2	(7501.2200000000003,7798.0074000000004,60)	t
5	(4820,2375,9)	t
6	(3420,3640,153)	t
7	(2175,4200,9)	t
8	(1440,4145,99)	t
9	(2035,4005,9)	t
10	(5240,2380,45)	f
12	(5725,2360,45)	f
4	(2690,2767.5,9)	t
13	(5150,3705,45)	t
15	(3605,4185,9)	t
14	(4085,4015,0)	t
16	(1665,3065,0)	t
17	(2115,4135,0)	t
18	(4885,4135,0)	t
19	(3105,3195,0)	t
21	(4055,4705,0)	t
20	(5495,4145,0)	t
22	(3225,3725,0)	f
11	(5680,1785,45)	f
1	(4393.1058000000003,3701.6889999999999,60)	f
\.


--
-- Data for Name: treenode; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY treenode (id, user_id, creation_time, edition_time, project_id, parent_id, location, radius, confidence) FROM stdin;
753	3	2010-12-20 15:42:36.933346+01	2010-12-20 15:42:36.933346+01	3	\N	(4330,4190,9)	4	5
763	3	2010-12-29 09:05:36.171769+01	2010-12-29 09:05:36.171769+01	3	753	(4600,3930,9)	4	5
765	3	2010-12-29 09:05:44.024585+01	2010-12-29 09:05:44.024585+01	3	763	(4740,3710,18)	4	5
767	3	2010-12-29 09:05:48.5136+01	2010-12-29 09:05:48.5136+01	3	765	(5040,3720,27)	4	5
\.


--
-- Data for Name: treenode_class_instance; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY treenode_class_instance (id, user_id, creation_time, edition_time, project_id, relation_id, treenode_id, class_instance_id) FROM stdin;
754	3	2010-12-20 15:42:36.941852+01	2010-12-20 15:42:36.941852+01	3	11	753	747
760	3	2010-12-20 17:17:32.751739+01	2010-12-20 17:17:32.751739+01	3	10	753	758
764	3	2010-12-29 09:05:36.200946+01	2010-12-29 09:05:36.200946+01	3	11	763	747
766	3	2010-12-29 09:05:44.037879+01	2010-12-29 09:05:44.037879+01	3	11	765	747
768	3	2010-12-29 09:05:48.524744+01	2010-12-29 09:05:48.524744+01	3	11	767	747
\.


--
-- Data for Name: user; Type: TABLE DATA; Schema: public2; Owner: catmaid_user
--

COPY "user" (id, name, pwd, longname) FROM stdin;
1	saalfeld	84789cbcbd2daf359a9fa4f34350e50f	Stephan Saalfeld
2	test	098f6bcd4621d373cade4e832627b4f6	Theo Test
3	gerhard	494524b27acdc356fb3dcb9f0b108267	Stephan Gerhard
\.


SET search_path = public, pg_catalog;

--
-- Name: broken_layer_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_layer_pkey PRIMARY KEY (stack_id, index);


--
-- Name: class_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class
    ADD CONSTRAINT class_id_key UNIQUE (id);


--
-- Name: class_instance_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_id_key UNIQUE (id);


--
-- Name: class_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_pkey PRIMARY KEY (id);


--
-- Name: class_instance_relation_instance_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_id_key UNIQUE (id);


--
-- Name: class_instance_relation_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_pkey PRIMARY KEY (id);


--
-- Name: class_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class
    ADD CONSTRAINT class_pkey PRIMARY KEY (id);


--
-- Name: class_relation_instance_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_id_key UNIQUE (id);


--
-- Name: class_relation_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_pkey PRIMARY KEY (id);


--
-- Name: concept_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY concept
    ADD CONSTRAINT concept_id_key UNIQUE (id);


--
-- Name: concept_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY concept
    ADD CONSTRAINT concept_pkey PRIMARY KEY (id);


--
-- Name: location_class_instance_id_key; Type: CONSTRAINT; Schema: public; Owner: stephan; Tablespace: 
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_id_key UNIQUE (id);


--
-- Name: location_class_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: stephan; Tablespace: 
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_pkey PRIMARY KEY (id);


--
-- Name: location_id_key; Type: CONSTRAINT; Schema: public; Owner: stephan; Tablespace: 
--

ALTER TABLE ONLY location
    ADD CONSTRAINT location_id_key UNIQUE (id);


--
-- Name: location_pkey; Type: CONSTRAINT; Schema: public; Owner: stephan; Tablespace: 
--

ALTER TABLE ONLY location
    ADD CONSTRAINT location_pkey PRIMARY KEY (id);


--
-- Name: message_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: object_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY object
    ADD CONSTRAINT object_id_key UNIQUE (id);


--
-- Name: object_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY object
    ADD CONSTRAINT object_pkey PRIMARY KEY (class, name);


--
-- Name: profile_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY profile
    ADD CONSTRAINT profile_pkey PRIMARY KEY (id);


--
-- Name: project_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY project
    ADD CONSTRAINT project_pkey PRIMARY KEY (id);


--
-- Name: project_stack_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_pkey PRIMARY KEY (project_id, stack_id);


--
-- Name: project_user_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY project_user
    ADD CONSTRAINT project_user_pkey PRIMARY KEY (project_id, user_id);


--
-- Name: relation_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_id_key UNIQUE (id);


--
-- Name: relation_instance_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_id_key UNIQUE (id);


--
-- Name: relation_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_pkey PRIMARY KEY (id);


--
-- Name: relation_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_pkey PRIMARY KEY (id);


--
-- Name: stack_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY stack
    ADD CONSTRAINT stack_pkey PRIMARY KEY (id);


--
-- Name: textlabel_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY textlabel
    ADD CONSTRAINT textlabel_pkey PRIMARY KEY (id);


--
-- Name: treenode_class_instance_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_id_key UNIQUE (id);


--
-- Name: treenode_class_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_pkey PRIMARY KEY (id);


--
-- Name: treenode_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_id_key UNIQUE (id);


--
-- Name: treenode_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_pkey PRIMARY KEY (id);


--
-- Name: users_name_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY "user"
    ADD CONSTRAINT users_name_key UNIQUE (name);


--
-- Name: users_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY "user"
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


SET search_path = public2, pg_catalog;

--
-- Name: broken_layer_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_layer_pkey PRIMARY KEY (stack_id, index);


--
-- Name: class_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class
    ADD CONSTRAINT class_id_key UNIQUE (id);


--
-- Name: class_instance_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_id_key UNIQUE (id);


--
-- Name: class_instance_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_pkey PRIMARY KEY (id);


--
-- Name: class_instance_relation_instance_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_id_key UNIQUE (id);


--
-- Name: class_instance_relation_instance_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_pkey PRIMARY KEY (id);


--
-- Name: class_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class
    ADD CONSTRAINT class_pkey PRIMARY KEY (id);


--
-- Name: class_relation_instance_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_id_key UNIQUE (id);


--
-- Name: class_relation_instance_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_pkey PRIMARY KEY (id);


--
-- Name: concept_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY concept
    ADD CONSTRAINT concept_id_key UNIQUE (id);


--
-- Name: concept_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY concept
    ADD CONSTRAINT concept_pkey PRIMARY KEY (id);


--
-- Name: location_class_instance_id_key; Type: CONSTRAINT; Schema: public2; Owner: stephan; Tablespace: 
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_id_key UNIQUE (id);


--
-- Name: location_class_instance_pkey; Type: CONSTRAINT; Schema: public2; Owner: stephan; Tablespace: 
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_pkey PRIMARY KEY (id);


--
-- Name: location_id_key; Type: CONSTRAINT; Schema: public2; Owner: stephan; Tablespace: 
--

ALTER TABLE ONLY location
    ADD CONSTRAINT location_id_key UNIQUE (id);


--
-- Name: location_pkey; Type: CONSTRAINT; Schema: public2; Owner: stephan; Tablespace: 
--

ALTER TABLE ONLY location
    ADD CONSTRAINT location_pkey PRIMARY KEY (id);


--
-- Name: message_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: object_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY object
    ADD CONSTRAINT object_id_key UNIQUE (id);


--
-- Name: object_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY object
    ADD CONSTRAINT object_pkey PRIMARY KEY (class, name);


--
-- Name: profile_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY profile
    ADD CONSTRAINT profile_pkey PRIMARY KEY (id);


--
-- Name: project_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY project
    ADD CONSTRAINT project_pkey PRIMARY KEY (id);


--
-- Name: project_stack_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_pkey PRIMARY KEY (project_id, stack_id);


--
-- Name: project_user_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY project_user
    ADD CONSTRAINT project_user_pkey PRIMARY KEY (project_id, user_id);


--
-- Name: relation_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_id_key UNIQUE (id);


--
-- Name: relation_instance_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_id_key UNIQUE (id);


--
-- Name: relation_instance_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_pkey PRIMARY KEY (id);


--
-- Name: relation_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_pkey PRIMARY KEY (id);


--
-- Name: stack_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY stack
    ADD CONSTRAINT stack_pkey PRIMARY KEY (id);


--
-- Name: textlabel_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY textlabel
    ADD CONSTRAINT textlabel_pkey PRIMARY KEY (id);


--
-- Name: treenode_class_instance_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_id_key UNIQUE (id);


--
-- Name: treenode_class_instance_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_pkey PRIMARY KEY (id);


--
-- Name: treenode_id_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_id_key UNIQUE (id);


--
-- Name: treenode_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_pkey PRIMARY KEY (id);


--
-- Name: users_name_key; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY "user"
    ADD CONSTRAINT users_name_key UNIQUE (name);


--
-- Name: users_pkey; Type: CONSTRAINT; Schema: public2; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY "user"
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


SET search_path = public, pg_catalog;

--
-- Name: apply_edition_time_update; Type: TRIGGER; Schema: public; Owner: catmaid_user
--

CREATE TRIGGER apply_edition_time_update
    BEFORE UPDATE ON class_instance
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit; Type: TRIGGER; Schema: public; Owner: catmaid_user
--

CREATE TRIGGER on_edit
    BEFORE UPDATE ON textlabel
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit; Type: TRIGGER; Schema: public; Owner: catmaid_user
--

CREATE TRIGGER on_edit
    BEFORE UPDATE ON concept
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();


SET search_path = public2, pg_catalog;

--
-- Name: apply_edition_time_update; Type: TRIGGER; Schema: public2; Owner: catmaid_user
--

CREATE TRIGGER apply_edition_time_update
    BEFORE UPDATE ON class_instance
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit; Type: TRIGGER; Schema: public2; Owner: catmaid_user
--

CREATE TRIGGER on_edit
    BEFORE UPDATE ON textlabel
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit; Type: TRIGGER; Schema: public2; Owner: catmaid_user
--

CREATE TRIGGER on_edit
    BEFORE UPDATE ON concept
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();


SET search_path = public, pg_catalog;

--
-- Name: bezierkey_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY bezierkey
    ADD CONSTRAINT bezierkey_profile_fkey FOREIGN KEY (profile_id) REFERENCES profile(id);


--
-- Name: broken_layer_stack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_layer_stack_id_fkey FOREIGN KEY (stack_id) REFERENCES stack(id);


--
-- Name: class_class_class_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_class_class_a_fkey FOREIGN KEY (class_a) REFERENCES class(id) ON DELETE CASCADE;


--
-- Name: class_class_class_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_class_class_b_fkey FOREIGN KEY (class_b) REFERENCES class(id) ON DELETE CASCADE;


--
-- Name: class_instance_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_class_id_fkey FOREIGN KEY (class_id) REFERENCES class(id);


--
-- Name: class_instance_class_instance_class_instance_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_class_instance_class_instance_a_fkey FOREIGN KEY (class_instance_a) REFERENCES class_instance(id) ON DELETE CASCADE;


--
-- Name: class_instance_class_instance_class_instance_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_class_instance_class_instance_b_fkey FOREIGN KEY (class_instance_b) REFERENCES class_instance(id) ON DELETE CASCADE;


--
-- Name: class_instance_relation_instance_relation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);


--
-- Name: class_instance_relation_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: class_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: class_relation_instance_relation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);


--
-- Name: class_relation_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: class_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY class
    ADD CONSTRAINT class_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: concept_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY concept
    ADD CONSTRAINT concept_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: location_class_instance_class_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id) REFERENCES class_instance(id);


--
-- Name: location_class_instance_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_location_id_fkey FOREIGN KEY (location_id) REFERENCES location(id) ON DELETE CASCADE;


--
-- Name: location_class_instance_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: location_class_instance_relation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);


--
-- Name: location_class_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: message_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY message
    ADD CONSTRAINT message_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: object_project_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY object
    ADD CONSTRAINT object_project_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: profile_object_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY profile
    ADD CONSTRAINT profile_object_fkey FOREIGN KEY (object_id) REFERENCES object(id);


--
-- Name: project_stack_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: project_stack_stack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_stack_id_fkey FOREIGN KEY (stack_id) REFERENCES stack(id);


--
-- Name: project_user_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY project_user
    ADD CONSTRAINT project_user_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: project_user_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY project_user
    ADD CONSTRAINT project_user_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: relation_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: relation_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: textlabel_location_textlabel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY textlabel_location
    ADD CONSTRAINT textlabel_location_textlabel_id_fkey FOREIGN KEY (textlabel_id) REFERENCES textlabel(id);


--
-- Name: textlabel_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY textlabel
    ADD CONSTRAINT textlabel_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: treenode_class_instance_class_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id) REFERENCES class_instance(id);


--
-- Name: treenode_class_instance_relation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);


--
-- Name: treenode_class_instance_treenode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_treenode_id_fkey FOREIGN KEY (treenode_id) REFERENCES treenode(id) ON DELETE CASCADE;


--
-- Name: treenode_class_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: treenode_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES treenode(id);


SET search_path = public2, pg_catalog;

--
-- Name: bezierkey_profile_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY bezierkey
    ADD CONSTRAINT bezierkey_profile_fkey FOREIGN KEY (profile_id) REFERENCES profile(id);


--
-- Name: broken_layer_stack_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_layer_stack_id_fkey FOREIGN KEY (stack_id) REFERENCES stack(id);


--
-- Name: class_class_class_a_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_class_class_a_fkey FOREIGN KEY (class_a) REFERENCES class(id) ON DELETE CASCADE;


--
-- Name: class_class_class_b_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_class_class_b_fkey FOREIGN KEY (class_b) REFERENCES class(id) ON DELETE CASCADE;


--
-- Name: class_instance_class_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_class_id_fkey FOREIGN KEY (class_id) REFERENCES class(id);


--
-- Name: class_instance_class_instance_class_instance_a_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_class_instance_class_instance_a_fkey FOREIGN KEY (class_instance_a) REFERENCES class_instance(id) ON DELETE CASCADE;


--
-- Name: class_instance_class_instance_class_instance_b_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_class_instance_class_instance_b_fkey FOREIGN KEY (class_instance_b) REFERENCES class_instance(id) ON DELETE CASCADE;


--
-- Name: class_instance_relation_instance_relation_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);


--
-- Name: class_instance_relation_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_relation_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: class_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: class_relation_instance_relation_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);


--
-- Name: class_relation_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_relation_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: class_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY class
    ADD CONSTRAINT class_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: concept_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY concept
    ADD CONSTRAINT concept_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: location_class_instance_class_instance_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id) REFERENCES class_instance(id);


--
-- Name: location_class_instance_location_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_location_id_fkey FOREIGN KEY (location_id) REFERENCES location(id) ON DELETE CASCADE;


--
-- Name: location_class_instance_project_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: location_class_instance_relation_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);


--
-- Name: location_class_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: stephan
--

ALTER TABLE ONLY location_class_instance
    ADD CONSTRAINT location_class_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: message_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY message
    ADD CONSTRAINT message_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: object_project_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY object
    ADD CONSTRAINT object_project_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: profile_object_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY profile
    ADD CONSTRAINT profile_object_fkey FOREIGN KEY (object_id) REFERENCES object(id);


--
-- Name: project_stack_project_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: project_stack_stack_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_stack_id_fkey FOREIGN KEY (stack_id) REFERENCES stack(id);


--
-- Name: project_user_project_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY project_user
    ADD CONSTRAINT project_user_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: project_user_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY project_user
    ADD CONSTRAINT project_user_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: relation_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: relation_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: textlabel_location_textlabel_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY textlabel_location
    ADD CONSTRAINT textlabel_location_textlabel_id_fkey FOREIGN KEY (textlabel_id) REFERENCES textlabel(id);


--
-- Name: textlabel_project_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY textlabel
    ADD CONSTRAINT textlabel_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: treenode_class_instance_class_instance_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id) REFERENCES class_instance(id);


--
-- Name: treenode_class_instance_relation_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_relation_id_fkey FOREIGN KEY (relation_id) REFERENCES relation(id);


--
-- Name: treenode_class_instance_treenode_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_treenode_id_fkey FOREIGN KEY (treenode_id) REFERENCES treenode(id) ON DELETE CASCADE;


--
-- Name: treenode_class_instance_user_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: treenode_parent_id_fkey; Type: FK CONSTRAINT; Schema: public2; Owner: catmaid_user
--

ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES treenode(id);


--
-- Name: public; Type: ACL; Schema: -; Owner: stephan
--

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM stephan;
GRANT ALL ON SCHEMA public TO stephan;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- Name: public2; Type: ACL; Schema: -; Owner: stephan
--

REVOKE ALL ON SCHEMA public2 FROM PUBLIC;
REVOKE ALL ON SCHEMA public2 FROM stephan;
GRANT ALL ON SCHEMA public2 TO stephan;
GRANT ALL ON SCHEMA public2 TO postgres;
GRANT ALL ON SCHEMA public2 TO PUBLIC;


SET search_path = public, pg_catalog;

--
-- Name: bezierkey; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE bezierkey FROM PUBLIC;
REVOKE ALL ON TABLE bezierkey FROM catmaid_user;
GRANT ALL ON TABLE bezierkey TO catmaid_user;


--
-- Name: profile; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE profile FROM PUBLIC;
REVOKE ALL ON TABLE profile FROM catmaid_user;
GRANT ALL ON TABLE profile TO catmaid_user;


--
-- Name: bezierprofile; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE bezierprofile FROM PUBLIC;
REVOKE ALL ON TABLE bezierprofile FROM catmaid_user;
GRANT ALL ON TABLE bezierprofile TO catmaid_user;


--
-- Name: broken_slice; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE broken_slice FROM PUBLIC;
REVOKE ALL ON TABLE broken_slice FROM catmaid_user;
GRANT ALL ON TABLE broken_slice TO catmaid_user;


--
-- Name: message; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE message FROM PUBLIC;
REVOKE ALL ON TABLE message FROM catmaid_user;
GRANT ALL ON TABLE message TO catmaid_user;


--
-- Name: message_id_seq; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON SEQUENCE message_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE message_id_seq FROM catmaid_user;
GRANT ALL ON SEQUENCE message_id_seq TO catmaid_user;


--
-- Name: object; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE object FROM PUBLIC;
REVOKE ALL ON TABLE object FROM catmaid_user;
GRANT ALL ON TABLE object TO catmaid_user;


--
-- Name: project; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE project FROM PUBLIC;
REVOKE ALL ON TABLE project FROM catmaid_user;
GRANT ALL ON TABLE project TO catmaid_user;


--
-- Name: project_stack; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE project_stack FROM PUBLIC;
REVOKE ALL ON TABLE project_stack FROM catmaid_user;
GRANT ALL ON TABLE project_stack TO catmaid_user;


--
-- Name: project_user; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE project_user FROM PUBLIC;
REVOKE ALL ON TABLE project_user FROM catmaid_user;
GRANT ALL ON TABLE project_user TO catmaid_user;


--
-- Name: stack; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE stack FROM PUBLIC;
REVOKE ALL ON TABLE stack FROM catmaid_user;
GRANT ALL ON TABLE stack TO catmaid_user;


--
-- Name: textlabel; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE textlabel FROM PUBLIC;
REVOKE ALL ON TABLE textlabel FROM catmaid_user;
GRANT ALL ON TABLE textlabel TO catmaid_user;


--
-- Name: textlabel_id_seq; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON SEQUENCE textlabel_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE textlabel_id_seq FROM catmaid_user;
GRANT ALL ON SEQUENCE textlabel_id_seq TO catmaid_user;


--
-- Name: textlabel_location; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE textlabel_location FROM PUBLIC;
REVOKE ALL ON TABLE textlabel_location FROM catmaid_user;
GRANT ALL ON TABLE textlabel_location TO catmaid_user;


--
-- Name: user; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE "user" FROM PUBLIC;
REVOKE ALL ON TABLE "user" FROM catmaid_user;
GRANT ALL ON TABLE "user" TO catmaid_user;


SET search_path = public2, pg_catalog;

--
-- Name: bezierkey; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE bezierkey FROM PUBLIC;
REVOKE ALL ON TABLE bezierkey FROM catmaid_user;
GRANT ALL ON TABLE bezierkey TO catmaid_user;


--
-- Name: profile; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE profile FROM PUBLIC;
REVOKE ALL ON TABLE profile FROM catmaid_user;
GRANT ALL ON TABLE profile TO catmaid_user;


--
-- Name: bezierprofile; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE bezierprofile FROM PUBLIC;
REVOKE ALL ON TABLE bezierprofile FROM catmaid_user;
GRANT ALL ON TABLE bezierprofile TO catmaid_user;


--
-- Name: broken_slice; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE broken_slice FROM PUBLIC;
REVOKE ALL ON TABLE broken_slice FROM catmaid_user;
GRANT ALL ON TABLE broken_slice TO catmaid_user;


--
-- Name: message; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE message FROM PUBLIC;
REVOKE ALL ON TABLE message FROM catmaid_user;
GRANT ALL ON TABLE message TO catmaid_user;


--
-- Name: message_id_seq; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON SEQUENCE message_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE message_id_seq FROM catmaid_user;
GRANT ALL ON SEQUENCE message_id_seq TO catmaid_user;


--
-- Name: object; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE object FROM PUBLIC;
REVOKE ALL ON TABLE object FROM catmaid_user;
GRANT ALL ON TABLE object TO catmaid_user;


--
-- Name: project; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE project FROM PUBLIC;
REVOKE ALL ON TABLE project FROM catmaid_user;
GRANT ALL ON TABLE project TO catmaid_user;


--
-- Name: project_stack; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE project_stack FROM PUBLIC;
REVOKE ALL ON TABLE project_stack FROM catmaid_user;
GRANT ALL ON TABLE project_stack TO catmaid_user;


--
-- Name: project_user; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE project_user FROM PUBLIC;
REVOKE ALL ON TABLE project_user FROM catmaid_user;
GRANT ALL ON TABLE project_user TO catmaid_user;


--
-- Name: stack; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE stack FROM PUBLIC;
REVOKE ALL ON TABLE stack FROM catmaid_user;
GRANT ALL ON TABLE stack TO catmaid_user;


--
-- Name: textlabel; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE textlabel FROM PUBLIC;
REVOKE ALL ON TABLE textlabel FROM catmaid_user;
GRANT ALL ON TABLE textlabel TO catmaid_user;


--
-- Name: textlabel_id_seq; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON SEQUENCE textlabel_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE textlabel_id_seq FROM catmaid_user;
GRANT ALL ON SEQUENCE textlabel_id_seq TO catmaid_user;


--
-- Name: textlabel_location; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE textlabel_location FROM PUBLIC;
REVOKE ALL ON TABLE textlabel_location FROM catmaid_user;
GRANT ALL ON TABLE textlabel_location TO catmaid_user;


--
-- Name: user; Type: ACL; Schema: public2; Owner: catmaid_user
--

REVOKE ALL ON TABLE "user" FROM PUBLIC;
REVOKE ALL ON TABLE "user" FROM catmaid_user;
GRANT ALL ON TABLE "user" TO catmaid_user;


--
-- PostgreSQL database dump complete
--


