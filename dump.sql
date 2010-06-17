--
-- PostgreSQL database dump
--

--
-- Role: catmaid_user
--

CREATE ROLE "catmaid_user" LOGIN PASSWORD 'catmaid_user_password';


--
-- Database: catmaid
--

CREATE DATABASE "catmaid" OWNER "catmaid_user";

\c catmaid


SET client_encoding = 'UTF8';
SET check_function_bodies = false;
SET client_min_messages = warning;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS 'Standard public schema';


--
-- Name: plpgsql; Type: PROCEDURAL LANGUAGE; Schema: -; Owner: 
--

CREATE PROCEDURAL LANGUAGE plpgsql;


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

--
-- Name: on_edit(); Type: FUNCTION; Schema: public; Owner: catmaid_user
--

CREATE FUNCTION on_edit() RETURNS "trigger"
    AS $$BEGIN
    NEW."edition_time" := now();
    RETURN NEW;
END;
$$
    LANGUAGE plpgsql;


ALTER FUNCTION public.on_edit() OWNER TO catmaid_user;

SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: bezierkey; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE bezierkey (
    "key" point NOT NULL,
    "before" point,
    "after" point,
    profile_id integer
);


ALTER TABLE public.bezierkey OWNER TO catmaid_user;

--
-- Name: COLUMN bezierkey."key"; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN bezierkey."key" IS 'nanometer';


--
-- Name: profile; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE profile (
    id serial NOT NULL,
    z double precision NOT NULL,
    object_id integer
);


ALTER TABLE public.profile OWNER TO catmaid_user;

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
    "index" integer NOT NULL
);


ALTER TABLE public.broken_slice OWNER TO catmaid_user;

--
-- Name: message; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE message (
    id serial NOT NULL,
    user_id integer NOT NULL,
    "time" timestamp with time zone DEFAULT now() NOT NULL,
    "read" boolean DEFAULT false NOT NULL,
    title text DEFAULT 'New message'::text NOT NULL,
    text text,
    "action" text
);


ALTER TABLE public.message OWNER TO catmaid_user;

--
-- Name: COLUMN message."action"; Type: COMMENT; Schema: public; Owner: catmaid_user
--

COMMENT ON COLUMN message."action" IS 'URL to be executed (remember that this is not safe against man in the middle when not encrypted)';


--
-- Name: object; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE "object" (
    id serial NOT NULL,
    "class" character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    project_id integer NOT NULL,
    colour rgba DEFAULT ROW((1)::real, (0.5)::real, (0)::real, (0.75)::real) NOT NULL
);


ALTER TABLE public."object" OWNER TO catmaid_user;

--
-- Name: project; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE project (
    id serial NOT NULL,
    title text NOT NULL,
    public boolean DEFAULT true NOT NULL
);


ALTER TABLE public.project OWNER TO catmaid_user;

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
-- Name: stack; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE stack (
    id serial NOT NULL,
    title text NOT NULL,
    dimension integer3d NOT NULL,
    resolution double3d NOT NULL,
    image_base text NOT NULL,
    "comment" text,
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
-- Name: textlabel; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE textlabel (
    id serial NOT NULL,
    "type" character varying(32) NOT NULL,
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
    CONSTRAINT textlabel_type_check CHECK (((("type")::text = 'text'::text) OR (("type")::text = 'bubble'::text)))
);


ALTER TABLE public.textlabel OWNER TO catmaid_user;

--
-- Name: textlabel_location; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE textlabel_location (
    textlabel_id integer NOT NULL,
    "location" double3d NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.textlabel_location OWNER TO catmaid_user;

--
-- Name: user; Type: TABLE; Schema: public; Owner: catmaid_user; Tablespace: 
--

CREATE TABLE "user" (
    id serial NOT NULL,
    name character varying(255) NOT NULL,
    pwd character varying(255) NOT NULL,
    longname text
);


ALTER TABLE public."user" OWNER TO catmaid_user;

--
-- Name: broken_layer_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_layer_pkey PRIMARY KEY (stack_id, "index");


--
-- Name: message_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: object_id_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY "object"
    ADD CONSTRAINT object_id_key UNIQUE (id);


--
-- Name: object_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY "object"
    ADD CONSTRAINT object_pkey PRIMARY KEY ("class", name);


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
-- Name: users_name_key; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY "user"
    ADD CONSTRAINT users_name_key UNIQUE (name);


--
-- Name: users_pkey; Type: CONSTRAINT; Schema: public; Owner: catmaid_user; Tablespace: 
--

ALTER TABLE ONLY "user"
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: on_edit; Type: TRIGGER; Schema: public; Owner: catmaid_user
--

CREATE TRIGGER on_edit
    BEFORE UPDATE ON textlabel
    FOR EACH ROW
    EXECUTE PROCEDURE on_edit();


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
-- Name: message_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY message
    ADD CONSTRAINT message_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id);


--
-- Name: object_project_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY "object"
    ADD CONSTRAINT object_project_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: profile_object_fkey; Type: FK CONSTRAINT; Schema: public; Owner: catmaid_user
--

ALTER TABLE ONLY profile
    ADD CONSTRAINT profile_object_fkey FOREIGN KEY (object_id) REFERENCES "object"(id);


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
-- Name: public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM postgres;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- Name: bezierkey; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE bezierkey FROM PUBLIC;
REVOKE ALL ON TABLE bezierkey FROM catmaid_user;
GRANT ALL ON TABLE bezierkey TO catmaid_user;
GRANT SELECT ON TABLE bezierkey TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE bezierkey TO catmaid_user;


--
-- Name: profile; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE profile FROM PUBLIC;
REVOKE ALL ON TABLE profile FROM catmaid_user;
GRANT ALL ON TABLE profile TO catmaid_user;
GRANT SELECT ON TABLE profile TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE profile TO catmaid_user;


--
-- Name: bezierprofile; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE bezierprofile FROM PUBLIC;
REVOKE ALL ON TABLE bezierprofile FROM catmaid_user;
GRANT ALL ON TABLE bezierprofile TO catmaid_user;
GRANT SELECT ON TABLE bezierprofile TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE bezierprofile TO catmaid_user;


--
-- Name: broken_slice; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE broken_slice FROM PUBLIC;
REVOKE ALL ON TABLE broken_slice FROM catmaid_user;
GRANT ALL ON TABLE broken_slice TO catmaid_user;
GRANT SELECT ON TABLE broken_slice TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE broken_slice TO catmaid_user;


--
-- Name: message; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE message FROM PUBLIC;
REVOKE ALL ON TABLE message FROM catmaid_user;
GRANT ALL ON TABLE message TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE message TO catmaid_user;
GRANT SELECT ON TABLE message TO catmaid_user;


--
-- Name: message_id_seq; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE message_id_seq FROM PUBLIC;
REVOKE ALL ON TABLE message_id_seq FROM catmaid_user;
GRANT ALL ON TABLE message_id_seq TO catmaid_user;
GRANT ALL ON TABLE message_id_seq TO catmaid_user;


--
-- Name: object; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE "object" FROM PUBLIC;
REVOKE ALL ON TABLE "object" FROM catmaid_user;
GRANT ALL ON TABLE "object" TO catmaid_user;
GRANT SELECT ON TABLE "object" TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE "object" TO catmaid_user;


--
-- Name: project; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE project FROM PUBLIC;
REVOKE ALL ON TABLE project FROM catmaid_user;
GRANT ALL ON TABLE project TO catmaid_user;
GRANT SELECT ON TABLE project TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE project TO catmaid_user;


--
-- Name: project_stack; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE project_stack FROM PUBLIC;
REVOKE ALL ON TABLE project_stack FROM catmaid_user;
GRANT ALL ON TABLE project_stack TO catmaid_user;
GRANT SELECT ON TABLE project_stack TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE project_stack TO catmaid_user;


--
-- Name: project_user; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE project_user FROM PUBLIC;
REVOKE ALL ON TABLE project_user FROM catmaid_user;
GRANT ALL ON TABLE project_user TO catmaid_user;
GRANT SELECT ON TABLE project_user TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE project_user TO catmaid_user;


--
-- Name: stack; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE stack FROM PUBLIC;
REVOKE ALL ON TABLE stack FROM catmaid_user;
GRANT ALL ON TABLE stack TO catmaid_user;
GRANT SELECT ON TABLE stack TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE stack TO catmaid_user;


--
-- Name: textlabel; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE textlabel FROM PUBLIC;
REVOKE ALL ON TABLE textlabel FROM catmaid_user;
GRANT ALL ON TABLE textlabel TO catmaid_user;
GRANT SELECT ON TABLE textlabel TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE textlabel TO catmaid_user;


--
-- Name: textlabel_id_seq; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE textlabel_id_seq FROM PUBLIC;
REVOKE ALL ON TABLE textlabel_id_seq FROM catmaid_user;
GRANT ALL ON TABLE textlabel_id_seq TO catmaid_user;
GRANT ALL ON TABLE textlabel_id_seq TO catmaid_user;


--
-- Name: textlabel_location; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE textlabel_location FROM PUBLIC;
REVOKE ALL ON TABLE textlabel_location FROM catmaid_user;
GRANT ALL ON TABLE textlabel_location TO catmaid_user;
GRANT SELECT ON TABLE textlabel_location TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE textlabel_location TO catmaid_user;


--
-- Name: user; Type: ACL; Schema: public; Owner: catmaid_user
--

REVOKE ALL ON TABLE "user" FROM PUBLIC;
REVOKE ALL ON TABLE "user" FROM catmaid_user;
GRANT ALL ON TABLE "user" TO catmaid_user;
GRANT SELECT ON TABLE "user" TO catmaid_user;
GRANT INSERT,SELECT,UPDATE,DELETE ON TABLE "user" TO catmaid_user;


--
-- PostgreSQL database dump complete
--

