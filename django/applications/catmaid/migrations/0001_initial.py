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

# This is the database schema of CATMAID 2015.12.21 without owner information.
initial_schema = """
--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

SET search_path = public, pg_catalog;

--
-- Name: double3d; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE double3d AS (
    x double precision,
    y double precision,
    z double precision
);


--
-- Name: feature_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE feature_type AS (
    links integer[]
);


--
-- Name: float3d; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE float3d AS (
    x real,
    y real,
    z real
);


--
-- Name: integer3d; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE integer3d AS (
    x integer,
    y integer,
    z integer
);


--
-- Name: rgba; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE rgba AS (
    r real,
    g real,
    b real,
    a real
);


SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: concept; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE concept (
    id integer NOT NULL,
    user_id integer NOT NULL,
    creation_time timestamp with time zone DEFAULT now() NOT NULL,
    edition_time timestamp with time zone DEFAULT now() NOT NULL,
    project_id integer NOT NULL
);


--
-- Name: relation_instance; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE relation_instance (
    relation_id integer NOT NULL
)
INHERITS (concept);


--
-- Name: treenode_connector; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE treenode_connector (
    treenode_id bigint NOT NULL,
    connector_id bigint NOT NULL,
    skeleton_id integer,
    confidence smallint DEFAULT 5 NOT NULL
)
INHERITS (relation_instance);


--
-- Name: check_treenode_connector_related_reviews(treenode_connector); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: filter_used_features(anyarray, anyarray); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: get_feature_paths(integer, integer, boolean, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION get_feature_paths(_parent_id integer, _workspace_id integer, _add_non_leafs boolean, _depth integer DEFAULT 0, _max_depth integer DEFAULT 100) RETURNS SETOF feature_type
    LANGUAGE plpgsql STRICT
    AS $$
                DECLARE
                    is_a_rel relation.id%TYPE;
                    link class_class%rowtype;
                    subtype class_class%rowtype;
                    num_is_a_links class_class.id%TYPE;
                    feature_links integer[][];
                    add_single_link boolean;
                    child_count int;
                    child_feature_link feature_type%rowtype;
                BEGIN
                    -- Get ID of 'is_a' relationshap
                    SELECT INTO is_a_rel r.id FROM relation r
                        WHERE relation_name='is_a' AND project_id=_workspace_id LIMIT 1;

                    -- Get all links, but exclude 'is_a' relationshaps
                    FOR link IN
                        SELECT * FROM class_class cc
                            WHERE cc.class_b = _parent_id AND cc.relation_id != is_a_rel
                    -- Check if each link is followed by an 'is_a' relationship.
                    -- If so, use the classes below this relation.
                    LOOP
                        WITH is_a_links AS (
                                SELECT cc.id FROM class_class cc
                                WHERE cc.class_b=link.class_a AND cc.relation_id=is_a_rel
                            )
                        SELECT INTO num_is_a_links COUNT(l.id) FROM is_a_links l;
                        -- Add all sub-classes instead of the root if there is
                        -- at least one.
                        IF num_is_a_links > 0 THEN
                            -- Add all sub types as feature links to result
                            FOR subtype IN
                                SELECT * FROM class_class cc
                                    WHERE cc.class_b=link.class_a AND cc.relation_id=is_a_rel
                            LOOP
                                feature_links := array_cat(feature_links, ARRAY[ARRAY[
                                    subtype.class_a, link.class_b, link.relation_id, link.class_a]]);
                            END LOOP;
                        ELSE
                            -- Add feature link information to 2d links array
                            feature_links := array_cat(feature_links, ARRAY[ARRAY[
                               link.class_a, link.class_b, link.relation_id, null]]);
                        END IF;
                    END LOOP;

                    -- Look at the featue link paths and collect children
                    -- Don't loop if there are no feature links (i.e. feature_links is NULL)
                    -- Give a group id to every path
                    FOR i IN 1..coalesce(array_length(feature_links, 1), 0)
                    LOOP
                        add_single_link := FALSE;
                        IF _depth < _max_depth THEN
                            -- Increase depth
                            _depth := _depth + 1;

                            -- Iterate and count children of current feature's class a
                            child_count := 0;
                            FOR child_feature_link IN SELECT * FROM
                                get_feature_paths(feature_links[i][1], _workspace_id,
                                    _add_non_leafs, _depth, _max_depth)
                            LOOP
                                -- Prepend each child feature to parent
                                RETURN QUERY SELECT array_cat(
                                        ARRAY[ARRAY[
                                            feature_links[i][1], feature_links[i][2],
                                            feature_links[i][3], feature_links[i][4]]],
                                        child_feature_link.links);
                                child_count := child_count + 1;
                            END LOOP;

                            -- If there is a super class, get the children in addition
                            -- to the children of the current class.
                            IF feature_links[i][4] IS DISTINCT FROM NULL THEN
                                FOR child_feature_link IN SELECT * FROM
                                    get_feature_paths(feature_links[i][4], _workspace_id,
                                        _add_non_leafs, _depth, _max_depth)
                                LOOP
                                    -- Prepend each child feature to parent
                                    RETURN QUERY SELECT array_cat(
                                            ARRAY[ARRAY[
                                                feature_links[i][1], feature_links[i][2],
                                                feature_links[i][3], feature_links[i][4]]],
                                            child_feature_link.links);
                                    child_count := child_count + 1;
                                END LOOP;
                            END IF;


                            -- Remember the path to this node as feature if a
                            -- leaf is reached or if non-leaf nodes should be
                            -- added, too.
                            IF child_count = 0 OR _add_non_leafs THEN
                                add_single_link := TRUE;
                            END IF;
                        ELSE
                            -- Add current node if we reached the maximum depth
                            -- and don't recurse any further.
                            add_single_link := TRUE;
                        END IF;

                        IF add_single_link THEN
                            -- Add single link if no more children are found/wanted
                            RETURN QUERY SELECT ARRAY[ARRAY[feature_links[i][1], feature_links[i][2], feature_links[i][3], feature_links[i][4]]];
                        END IF;
                    END LOOP;

                    RETURN;
                END
            $$;


--
-- Name: on_create_treenode_connector_check_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_create_treenode_connector_check_review() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            -- Mark linked treenodes as unreviewed. If relation is postsynaptic,
            -- mark only one, otherwise mark all treenodes related to connector.
            PERFORM check_treenode_connector_related_reviews(NEW);
            RETURN NEW;
            END;
            $$;


--
-- Name: on_delete_treenode_connector_check_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_delete_treenode_connector_check_review() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            -- Mark linked treenodes as unreviewed. If relation is postsynaptic,
            -- mark only one, otherwise mark all treenodes related to connector.
            PERFORM check_treenode_connector_related_reviews(OLD);
            RETURN OLD;
            END;
            $$;


--
-- Name: on_delete_treenode_update_edges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_delete_treenode_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

                DELETE FROM treenode_edge WHERE id=OLD.id;
                RETURN OLD;
            END;
            $$;


--
-- Name: on_delete_treenode_update_suppressed_virtual_treenodes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_delete_treenode_update_suppressed_virtual_treenodes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            -- Delete suppressed virtual treenodes if child treenode is deleted.
            DELETE FROM suppressed_virtual_treenode WHERE child_id=OLD.id;
            RETURN OLD;
            END;
            $$;


--
-- Name: on_edit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_edit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN
    NEW."edition_time" := now();
    RETURN NEW;
END;
$$;


--
-- Name: on_edit_connector_check_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_edit_connector_check_review() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            -- Mark linked treenodes as unreviewed if connector changes location.
            IF OLD.location_x != NEW.location_x OR
               OLD.location_y != NEW.location_y OR
               OLD.location_z != NEW.location_z THEN
              DELETE FROM review r
                USING treenode_connector tc
                WHERE r.treenode_id = tc.treenode_id
                  AND tc.connector_id = OLD.id;
            END IF;
            RETURN NEW;
            END;
            $$;


--
-- Name: on_edit_treenode_check_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_edit_treenode_check_review() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            -- Mark node as unreviewed if it changes location or parent
            if OLD.location_x != NEW.location_x OR
                 OLD.location_y != NEW.location_y OR
                 OLD.location_z != NEW.location_z then
                DELETE FROM review WHERE treenode_id=OLD.id;
            end if;
            RETURN NEW;
            END;
            $$;


--
-- Name: on_edit_treenode_connector_check_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_edit_treenode_connector_check_review() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            -- Mark treenode as unreviewed if a connector link changes. If
            -- relation is postsynaptic, mark only one, otherwise mark all
            -- treenodes related to connector. Check for both old and new
            -- relations, treenodes and connectors.
            IF OLD.treenode_id != NEW.treenode_id OR
               OLD.connector_id != NEW.connector_id OR
               OLD.relation_id != NEW.relation_id THEN
              -- Check reviews based upon old values.
              PERFORM check_treenode_connector_related_reviews(OLD);
              -- Check reviews based upon new values.
              PERFORM check_treenode_connector_related_reviews(NEW);
            END IF;
            RETURN NEW;
            END;
            $$;


--
-- Name: on_edit_treenode_update_edges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_edit_treenode_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            if OLD.parent_id IS DISTINCT FROM NEW.parent_id OR
                   OLD.location_x != NEW.location_x OR
                   OLD.location_y != NEW.location_y OR
                   OLD.location_z != NEW.location_z then
                DELETE FROM treenode_edge WHERE id=OLD.id;
                INSERT INTO treenode_edge (id, project_id, edge) (
                    SELECT NEW.id, NEW.project_id, ST_MakeLine(
                        ST_MakePoint(NEW.location_x, NEW.location_y, NEW.location_z),
                        ST_MakePoint(p.location_x, p.location_y, p.location_z))
                    FROM treenode p
                    WHERE (NEW.parent_id IS NOT NULL AND p.id = NEW.parent_id) OR
                          (NEW.parent_id IS NULL AND NEW.id = p.id));
            end if;
            RETURN NEW;
            END;
            $$;


--
-- Name: on_edit_treenode_update_suppressed_virtual_treenodes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_edit_treenode_update_suppressed_virtual_treenodes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            -- Delete suppressed virtual treenodes if parent is changed.
            IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
                DELETE FROM suppressed_virtual_treenode WHERE child_id=OLD.id;
            END IF;
            RETURN NEW;
            END;
            $$;


--
-- Name: on_insert_treenode_update_edges(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION on_insert_treenode_update_edges() RETURNS trigger
    LANGUAGE plpgsql
    AS $$BEGIN

            INSERT INTO treenode_edge (id, project_id, edge) (
                SELECT c.id, c.project_id, ST_MakeLine(
                    ST_MakePoint(c.location_x, c.location_y, c.location_z),
                    ST_MakePoint(p.location_x, p.location_y, p.location_z))
                FROM treenode c JOIN treenode p ON
                    (c.parent_id = p.id) OR (c.parent_id IS NULL AND c.id = p.id)
                WHERE c.id=NEW.id);
            RETURN NEW;
            END;
            $$;


--
-- Name: broken_slice; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE broken_slice (
    id integer NOT NULL,
    stack_id integer NOT NULL,
    index integer NOT NULL
);


--
-- Name: broken_slice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE broken_slice_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: broken_slice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE broken_slice_id_seq OWNED BY broken_slice.id;


--
-- Name: restriction; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE restriction (
    enabled boolean DEFAULT true NOT NULL,
    restricted_link_id integer NOT NULL
)
INHERITS (concept);


--
-- Name: cardinality_restriction; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE cardinality_restriction (
    cardinality_type integer NOT NULL,
    value integer NOT NULL
)
INHERITS (restriction);


--
-- Name: catmaid_userprofile; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE catmaid_userprofile (
    id integer NOT NULL,
    user_id integer NOT NULL,
    show_text_label_tool boolean NOT NULL,
    show_tagging_tool boolean NOT NULL,
    show_cropping_tool boolean NOT NULL,
    show_segmentation_tool boolean NOT NULL,
    show_tracing_tool boolean NOT NULL,
    show_ontology_tool boolean NOT NULL,
    independent_ontology_workspace_is_default boolean NOT NULL,
    color rgba NOT NULL,
    show_roi_tool boolean NOT NULL
);


--
-- Name: catmaid_userprofile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE catmaid_userprofile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catmaid_userprofile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE catmaid_userprofile_id_seq OWNED BY catmaid_userprofile.id;


--
-- Name: catmaid_volume; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE catmaid_volume (
    id integer NOT NULL,
    user_id integer NOT NULL,
    project_id integer NOT NULL,
    creation_time timestamp with time zone NOT NULL,
    edition_time timestamp with time zone NOT NULL,
    editor_id integer NOT NULL,
    name character varying(255) NOT NULL,
    comment text,
    geometry geometry(GeometryZ) NOT NULL
);


--
-- Name: catmaid_volume_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE catmaid_volume_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: catmaid_volume_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE catmaid_volume_id_seq OWNED BY catmaid_volume.id;


--
-- Name: change_request; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE change_request (
    type character varying(32) NOT NULL,
    description text NOT NULL,
    status integer NOT NULL,
    recipient_id integer NOT NULL,
    location float3d NOT NULL,
    treenode_id integer,
    connector_id integer,
    validate_action text NOT NULL,
    approve_action text NOT NULL,
    reject_action text NOT NULL,
    completion_time timestamp with time zone
)
INHERITS (concept);


--
-- Name: change_request_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE change_request_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: change_request_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE change_request_id_seq OWNED BY change_request.id;


--
-- Name: class; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE class (
    class_name character varying(255) NOT NULL,
    description text
)
INHERITS (concept);


--
-- Name: class_class; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE class_class (
    class_a integer,
    class_b integer
)
INHERITS (relation_instance);


--
-- Name: class_instance; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE class_instance (
    class_id integer NOT NULL,
    name character varying(255) NOT NULL
)
INHERITS (concept);


--
-- Name: class_instance_class_instance; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE class_instance_class_instance (
    class_instance_a integer,
    class_instance_b integer
)
INHERITS (relation_instance);


--
-- Name: client_data; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE client_data (
    id integer NOT NULL,
    datastore_id integer NOT NULL,
    project_id integer,
    user_id integer,
    key character varying(255) NOT NULL,
    value text NOT NULL
);


--
-- Name: client_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE client_data_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE client_data_id_seq OWNED BY client_data.id;


--
-- Name: client_datastore; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE client_datastore (
    id integer NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: client_datastore_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE client_datastore_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: client_datastore_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE client_datastore_id_seq OWNED BY client_datastore.id;


--
-- Name: concept_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE concept_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: concept_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE concept_id_seq OWNED BY concept.id;


--
-- Name: location; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE location (
    id bigint NOT NULL,
    project_id integer NOT NULL,
    location_x real NOT NULL,
    location_y real NOT NULL,
    location_z real NOT NULL,
    editor_id integer NOT NULL,
    user_id integer NOT NULL,
    creation_time timestamp with time zone DEFAULT now() NOT NULL,
    edition_time timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT location_x_finite CHECK (((location_x <> 'NaN'::real) AND (location_x <> 'Infinity'::real))),
    CONSTRAINT location_y_finite CHECK (((location_y <> 'NaN'::real) AND (location_y <> 'Infinity'::real))),
    CONSTRAINT location_z_finite CHECK (((location_z <> 'NaN'::real) AND (location_z <> 'Infinity'::real)))
);


--
-- Name: connector; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE connector (
    confidence smallint DEFAULT 5 NOT NULL
)
INHERITS (location);


--
-- Name: connector_class_instance; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE connector_class_instance (
    connector_id bigint NOT NULL,
    class_instance_id integer NOT NULL
)
INHERITS (relation_instance);


--
-- Name: data_view; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE data_view (
    id integer NOT NULL,
    title text NOT NULL,
    data_view_type_id integer NOT NULL,
    config text NOT NULL,
    is_default boolean NOT NULL,
    "position" integer NOT NULL,
    comment text
);


--
-- Name: data_view_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE data_view_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_view_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE data_view_id_seq OWNED BY data_view.id;


--
-- Name: data_view_type; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE data_view_type (
    id integer NOT NULL,
    title text NOT NULL,
    code_type text NOT NULL,
    comment text
);


--
-- Name: data_view_type_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE data_view_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: data_view_type_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE data_view_type_id_seq OWNED BY data_view_type.id;


--
-- Name: location_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE location_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: location_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE location_id_seq OWNED BY location.id;


--
-- Name: log; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE log (
    operation_type character varying(255) NOT NULL,
    location float3d,
    freetext text
)
INHERITS (concept);


--
-- Name: message; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE message (
    id integer NOT NULL,
    user_id integer NOT NULL,
    "time" timestamp with time zone NOT NULL,
    read boolean NOT NULL,
    title text NOT NULL,
    text text,
    action text
);


--
-- Name: message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE message_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE message_id_seq OWNED BY message.id;


--
-- Name: overlay; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE "overlay" (
    id integer NOT NULL,
    title text NOT NULL,
    stack_id integer NOT NULL,
    image_base text NOT NULL,
    default_opacity integer NOT NULL,
    file_extension text NOT NULL,
    tile_width integer NOT NULL,
    tile_height integer NOT NULL,
    tile_source_type integer NOT NULL
);


--
-- Name: overlay_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE overlay_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: overlay_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE overlay_id_seq OWNED BY "overlay".id;


--
-- Name: project; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE project (
    id integer NOT NULL,
    title text NOT NULL,
    comment text
);


--
-- Name: project_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE project_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE project_id_seq OWNED BY project.id;


--
-- Name: project_stack; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE project_stack (
    id integer NOT NULL,
    project_id integer NOT NULL,
    stack_id integer NOT NULL,
    translation double3d NOT NULL,
    orientation integer NOT NULL
);


--
-- Name: project_stack_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE project_stack_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_stack_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE project_stack_id_seq OWNED BY project_stack.id;


--
-- Name: region_of_interest; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE region_of_interest (
    stack_id integer NOT NULL,
    zoom_level integer NOT NULL,
    width real NOT NULL,
    height real NOT NULL,
    rotation_cw real NOT NULL
)
INHERITS (location);


--
-- Name: region_of_interest_class_instance; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE region_of_interest_class_instance (
    region_of_interest_id bigint,
    class_instance_id integer
)
INHERITS (relation_instance);


--
-- Name: relation; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE relation (
    relation_name character varying(255) NOT NULL,
    uri text,
    description text,
    isreciprocal boolean DEFAULT false NOT NULL
)
INHERITS (concept);


--
-- Name: review; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE review (
    id integer NOT NULL,
    project_id integer NOT NULL,
    reviewer_id integer NOT NULL,
    review_time timestamp with time zone NOT NULL,
    skeleton_id integer NOT NULL,
    treenode_id bigint NOT NULL
);


--
-- Name: review_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE review_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: review_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE review_id_seq OWNED BY review.id;


--
-- Name: reviewer_whitelist; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE reviewer_whitelist (
    id integer NOT NULL,
    project_id integer NOT NULL,
    user_id integer NOT NULL,
    reviewer_id integer NOT NULL,
    accept_after timestamp with time zone NOT NULL
);


--
-- Name: reviewer_whitelist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE reviewer_whitelist_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reviewer_whitelist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE reviewer_whitelist_id_seq OWNED BY reviewer_whitelist.id;


--
-- Name: stack; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE stack (
    id integer NOT NULL,
    title text NOT NULL,
    dimension integer3d NOT NULL,
    resolution double3d NOT NULL,
    image_base text NOT NULL,
    comment text,
    trakem2_project boolean NOT NULL,
    num_zoom_levels integer NOT NULL,
    file_extension text NOT NULL,
    tile_width integer NOT NULL,
    tile_height integer NOT NULL,
    tile_source_type integer NOT NULL,
    metadata text NOT NULL
);


--
-- Name: stack_class_instance; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE stack_class_instance (
    stack_id integer,
    class_instance_id integer
)
INHERITS (relation_instance);


--
-- Name: stack_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE stack_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stack_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE stack_id_seq OWNED BY stack.id;


--
-- Name: suppressed_virtual_treenode; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE suppressed_virtual_treenode (
    id integer NOT NULL,
    user_id integer NOT NULL,
    project_id integer NOT NULL,
    creation_time timestamp with time zone NOT NULL,
    edition_time timestamp with time zone NOT NULL,
    child_id integer NOT NULL,
    location_coordinate double precision NOT NULL,
    orientation smallint NOT NULL
);


--
-- Name: suppressed_virtual_treenode_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE suppressed_virtual_treenode_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppressed_virtual_treenode_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE suppressed_virtual_treenode_id_seq OWNED BY suppressed_virtual_treenode.id;


--
-- Name: textlabel; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE textlabel (
    id integer NOT NULL,
    type character varying(32) NOT NULL,
    text text NOT NULL,
    colour rgba NOT NULL,
    font_name text,
    font_style text,
    font_size double precision NOT NULL,
    project_id integer NOT NULL,
    scaling boolean NOT NULL,
    creation_time timestamp with time zone NOT NULL,
    edition_time timestamp with time zone NOT NULL,
    deleted boolean NOT NULL,
    CONSTRAINT textlabel_type_check CHECK ((((type)::text = 'text'::text) OR ((type)::text = 'bubble'::text)))
);


--
-- Name: textlabel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE textlabel_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: textlabel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE textlabel_id_seq OWNED BY textlabel.id;


--
-- Name: textlabel_location; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE textlabel_location (
    id integer NOT NULL,
    textlabel_id integer NOT NULL,
    location double3d NOT NULL,
    deleted boolean NOT NULL
);


--
-- Name: textlabel_location_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE textlabel_location_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: textlabel_location_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE textlabel_location_id_seq OWNED BY textlabel_location.id;


--
-- Name: treenode; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE treenode (
    skeleton_id integer NOT NULL,
    radius real DEFAULT 0 NOT NULL,
    confidence smallint DEFAULT 5 NOT NULL,
    parent_id bigint
)
INHERITS (location);


--
-- Name: treenode_class_instance; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE treenode_class_instance (
    treenode_id bigint NOT NULL,
    class_instance_id integer NOT NULL
)
INHERITS (relation_instance);


--
-- Name: treenode_edge; Type: TABLE; Schema: public; Owner: -; Tablespace:
--

CREATE TABLE treenode_edge (
    id bigint NOT NULL,
    project_id integer NOT NULL,
    edge geometry(LineStringZ)
);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY broken_slice ALTER COLUMN id SET DEFAULT nextval('broken_slice_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cardinality_restriction ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cardinality_restriction ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: enabled; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cardinality_restriction ALTER COLUMN enabled SET DEFAULT true;


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY catmaid_userprofile ALTER COLUMN id SET DEFAULT nextval('catmaid_userprofile_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY catmaid_volume ALTER COLUMN id SET DEFAULT nextval('catmaid_volume_id_seq'::regclass);

--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY change_request ALTER COLUMN id SET DEFAULT nextval('change_request_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY change_request ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY change_request ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_class ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_class ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_class ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_instance ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_instance ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_instance_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_instance_class_instance ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY class_instance_class_instance ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY client_data ALTER COLUMN id SET DEFAULT nextval('client_data_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY client_datastore ALTER COLUMN id SET DEFAULT nextval('client_datastore_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY connector ALTER COLUMN id SET DEFAULT nextval('location_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY connector ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY connector ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY connector_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY connector_class_instance ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY connector_class_instance ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY data_view ALTER COLUMN id SET DEFAULT nextval('data_view_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY data_view_type ALTER COLUMN id SET DEFAULT nextval('data_view_type_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY location ALTER COLUMN id SET DEFAULT nextval('location_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY log ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY log ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY log ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY message ALTER COLUMN id SET DEFAULT nextval('message_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "overlay" ALTER COLUMN id SET DEFAULT nextval('overlay_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY project ALTER COLUMN id SET DEFAULT nextval('project_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY project_stack ALTER COLUMN id SET DEFAULT nextval('project_stack_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY region_of_interest ALTER COLUMN id SET DEFAULT nextval('location_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY region_of_interest ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY region_of_interest ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY region_of_interest_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY region_of_interest_class_instance ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY region_of_interest_class_instance ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY relation ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY relation ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY relation ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY relation_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY relation_instance ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY relation_instance ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY restriction ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY restriction ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY review ALTER COLUMN id SET DEFAULT nextval('review_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY reviewer_whitelist ALTER COLUMN id SET DEFAULT nextval('reviewer_whitelist_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY stack ALTER COLUMN id SET DEFAULT nextval('stack_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY stack_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY stack_class_instance ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY stack_class_instance ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY suppressed_virtual_treenode ALTER COLUMN id SET DEFAULT nextval('suppressed_virtual_treenode_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY textlabel ALTER COLUMN id SET DEFAULT nextval('textlabel_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY textlabel_location ALTER COLUMN id SET DEFAULT nextval('textlabel_location_id_seq'::regclass);


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode ALTER COLUMN id SET DEFAULT nextval('location_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode_class_instance ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode_class_instance ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode_class_instance ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode_connector ALTER COLUMN id SET DEFAULT nextval('concept_id_seq'::regclass);


--
-- Name: creation_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode_connector ALTER COLUMN creation_time SET DEFAULT now();


--
-- Name: edition_time; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode_connector ALTER COLUMN edition_time SET DEFAULT now();


--
-- Name: broken_slice_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_slice_pkey PRIMARY KEY (id);


--
-- Name: catmaid_userprofile_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY catmaid_userprofile
    ADD CONSTRAINT catmaid_userprofile_pkey PRIMARY KEY (id);


--
-- Name: catmaid_userprofile_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY catmaid_userprofile
    ADD CONSTRAINT catmaid_userprofile_user_id_key UNIQUE (user_id);


--
-- Name: catmaid_volume_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY catmaid_volume
    ADD CONSTRAINT catmaid_volume_pkey PRIMARY KEY (id);


--
-- Name: change_request_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY change_request
    ADD CONSTRAINT change_request_pkey PRIMARY KEY (id);


--
-- Name: class_class_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY class_class
    ADD CONSTRAINT class_class_pkey PRIMARY KEY (id);


--
-- Name: class_instance_class_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY class_instance_class_instance
    ADD CONSTRAINT class_instance_class_instance_pkey PRIMARY KEY (id);


--
-- Name: class_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY class_instance
    ADD CONSTRAINT class_instance_pkey PRIMARY KEY (id);


--
-- Name: class_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY class
    ADD CONSTRAINT class_pkey PRIMARY KEY (id);


--
-- Name: client_data_datastore_id_34e103e6df585a7b_uniq; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY client_data
    ADD CONSTRAINT client_data_datastore_id_34e103e6df585a7b_uniq UNIQUE (datastore_id, key, project_id, user_id);


--
-- Name: client_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY client_data
    ADD CONSTRAINT client_data_pkey PRIMARY KEY (id);


--
-- Name: client_datastore_name_key; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY client_datastore
    ADD CONSTRAINT client_datastore_name_key UNIQUE (name);


--
-- Name: client_datastore_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY client_datastore
    ADD CONSTRAINT client_datastore_pkey PRIMARY KEY (id);


--
-- Name: connector_class_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY connector_class_instance
    ADD CONSTRAINT connector_class_instance_pkey PRIMARY KEY (id);


--
-- Name: connector_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY connector
    ADD CONSTRAINT connector_pkey PRIMARY KEY (id);


--
-- Name: data_view_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY data_view
    ADD CONSTRAINT data_view_pkey PRIMARY KEY (id);


--
-- Name: data_view_type_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY data_view_type
    ADD CONSTRAINT data_view_type_pkey PRIMARY KEY (id);


--
-- Name: location_pkey1; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY location
    ADD CONSTRAINT location_pkey1 PRIMARY KEY (id);


--
-- Name: log_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY log
    ADD CONSTRAINT log_pkey PRIMARY KEY (id);


--
-- Name: message_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: overlay_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY "overlay"
    ADD CONSTRAINT overlay_pkey PRIMARY KEY (id);


--
-- Name: project_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY project
    ADD CONSTRAINT project_pkey PRIMARY KEY (id);


--
-- Name: project_stack_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_pkey PRIMARY KEY (id);


--
-- Name: region_of_interest_class_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY region_of_interest_class_instance
    ADD CONSTRAINT region_of_interest_class_instance_pkey PRIMARY KEY (id);


--
-- Name: relation_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY relation_instance
    ADD CONSTRAINT relation_instance_pkey PRIMARY KEY (id);


--
-- Name: relation_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY relation
    ADD CONSTRAINT relation_pkey PRIMARY KEY (id);


--
-- Name: review_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY review
    ADD CONSTRAINT review_pkey PRIMARY KEY (id);


--
-- Name: reviewer_whitelist_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY reviewer_whitelist
    ADD CONSTRAINT reviewer_whitelist_pkey PRIMARY KEY (id);


--
-- Name: reviewer_whitelist_project_id_40247204996243a5_uniq; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY reviewer_whitelist
    ADD CONSTRAINT reviewer_whitelist_project_id_40247204996243a5_uniq UNIQUE (project_id, user_id, reviewer_id);


--
-- Name: stack_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY stack
    ADD CONSTRAINT stack_pkey PRIMARY KEY (id);


--
-- Name: suppressed_virtual_treenode_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY suppressed_virtual_treenode
    ADD CONSTRAINT suppressed_virtual_treenode_pkey PRIMARY KEY (id);


--
-- Name: textlabel_location_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY textlabel_location
    ADD CONSTRAINT textlabel_location_pkey PRIMARY KEY (id);


--
-- Name: textlabel_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY textlabel
    ADD CONSTRAINT textlabel_pkey PRIMARY KEY (id);


--
-- Name: treenode_class_instance_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_pkey PRIMARY KEY (id);


--
-- Name: treenode_connector_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY treenode_connector
    ADD CONSTRAINT treenode_connector_pkey PRIMARY KEY (id);


--
-- Name: treenode_connector_project_id; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY treenode_connector
    ADD CONSTRAINT treenode_connector_project_id_uniq UNIQUE (project_id, treenode_id, connector_id, relation_id);


--
-- Name: treenode_edge_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY treenode_edge
    ADD CONSTRAINT treenode_edge_pkey PRIMARY KEY (id);


--
-- Name: treenode_pkey; Type: CONSTRAINT; Schema: public; Owner: -; Tablespace:
--

ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_pkey PRIMARY KEY (id);


--
-- Name: broken_slice_stack_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX broken_slice_stack_id ON broken_slice USING btree (stack_id);


--
-- Name: catmaid_volume_editor_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX catmaid_volume_editor_id ON catmaid_volume USING btree (editor_id);


--
-- Name: catmaid_volume_geometry_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX catmaid_volume_geometry_id ON catmaid_volume USING gist (geometry gist_geometry_ops_nd);


--
-- Name: catmaid_volume_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX catmaid_volume_project_id ON catmaid_volume USING btree (project_id);


--
-- Name: catmaid_volume_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX catmaid_volume_user_id ON catmaid_volume USING btree (user_id);


--
-- Name: change_request_connector_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX change_request_connector_id ON change_request USING btree (connector_id);


--
-- Name: change_request_recipient_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX change_request_recipient_id ON change_request USING btree (recipient_id);


--
-- Name: change_request_treenode_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX change_request_treenode_id ON change_request USING btree (treenode_id);


--
-- Name: class_class_class_a; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_class_class_a ON class_class USING btree (class_a);


--
-- Name: class_class_class_b; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_class_class_b ON class_class USING btree (class_b);


--
-- Name: class_class_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_class_project_id ON class_class USING btree (project_id);


--
-- Name: class_class_relation_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_class_relation_id ON class_class USING btree (relation_id);


--
-- Name: class_class_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_class_user_id ON class_class USING btree (user_id);


--
-- Name: class_instance_class_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_instance_class_id ON class_instance USING btree (class_id);


--
-- Name: class_instance_class_instance_class_instance_a; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_instance_class_instance_class_instance_a ON class_instance_class_instance USING btree (class_instance_a);


--
-- Name: class_instance_class_instance_class_instance_b; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_instance_class_instance_class_instance_b ON class_instance_class_instance USING btree (class_instance_b);


--
-- Name: class_instance_class_instance_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_instance_class_instance_project_id ON class_instance_class_instance USING btree (project_id);


--
-- Name: class_instance_class_instance_relation_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_instance_class_instance_relation_id ON class_instance_class_instance USING btree (relation_id);


--
-- Name: class_instance_class_instance_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_instance_class_instance_user_id ON class_instance_class_instance USING btree (user_id);


--
-- Name: class_instance_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_instance_project_id ON class_instance USING btree (project_id);


--
-- Name: class_instance_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_instance_user_id ON class_instance USING btree (user_id);


--
-- Name: class_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_project_id ON class USING btree (project_id);


--
-- Name: class_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX class_user_id ON class USING btree (user_id);


--
-- Name: client_data_datastore_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX client_data_datastore_id ON client_data USING btree (datastore_id);


--
-- Name: client_data_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX client_data_project_id ON client_data USING btree (project_id);


--
-- Name: client_data_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX client_data_user_id ON client_data USING btree (user_id);


--
-- Name: client_datastore_name_like; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX client_datastore_name_like ON client_datastore USING btree (name varchar_pattern_ops);


--
-- Name: connector_class_instance_class_instance_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX connector_class_instance_class_instance_id ON connector_class_instance USING btree (class_instance_id);


--
-- Name: connector_class_instance_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX connector_class_instance_project_id ON connector_class_instance USING btree (project_id);


--
-- Name: connector_class_instance_relation_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX connector_class_instance_relation_id ON connector_class_instance USING btree (relation_id);


--
-- Name: connector_class_instance_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX connector_class_instance_user_id ON connector_class_instance USING btree (user_id);


--
-- Name: connector_creation_time_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX connector_creation_time_index ON connector USING btree (creation_time);


--
-- Name: connector_edition_time_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX connector_edition_time_index ON connector USING btree (edition_time);


--
-- Name: connector_project_location; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX connector_project_location ON connector USING btree (project_id, location_x, location_y, location_z);


--
-- Name: data_view_data_view_type_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX data_view_data_view_type_id ON data_view USING btree (data_view_type_id);


--
-- Name: location_creation_time_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX location_creation_time_index ON location USING btree (creation_time);


--
-- Name: location_edition_time_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX location_edition_time_index ON location USING btree (edition_time);


--
-- Name: location_location_x_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX location_location_x_index ON location USING btree (project_id, location_x);


--
-- Name: location_location_y_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX location_location_y_index ON location USING btree (project_id, location_y);


--
-- Name: location_location_z_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX location_location_z_index ON location USING btree (project_id, location_z);


--
-- Name: message_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX message_user_id ON message USING btree (user_id);


--
-- Name: overlay_stack_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX overlay_stack_id ON "overlay" USING btree (stack_id);


--
-- Name: project_stack_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX project_stack_project_id ON project_stack USING btree (project_id);


--
-- Name: project_stack_stack_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX project_stack_stack_id ON project_stack USING btree (stack_id);


--
-- Name: region_of_interest_creation_time_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX region_of_interest_creation_time_index ON region_of_interest USING btree (creation_time);


--
-- Name: region_of_interest_edition_time_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX region_of_interest_edition_time_index ON region_of_interest USING btree (edition_time);


--
-- Name: review_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX review_project_id ON review USING btree (project_id);


--
-- Name: review_reviewer_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX review_reviewer_id ON review USING btree (reviewer_id);


--
-- Name: review_skeleton_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX review_skeleton_id ON review USING btree (skeleton_id);


--
-- Name: review_treenode_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX review_treenode_id ON review USING btree (treenode_id);


--
-- Name: reviewer_whitelist_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX reviewer_whitelist_project_id ON reviewer_whitelist USING btree (project_id);


--
-- Name: reviewer_whitelist_reviewer_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX reviewer_whitelist_reviewer_id ON reviewer_whitelist USING btree (reviewer_id);


--
-- Name: reviewer_whitelist_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX reviewer_whitelist_user_id ON reviewer_whitelist USING btree (user_id);


--
-- Name: suppressed_virtual_treenode_child_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX suppressed_virtual_treenode_child_id ON suppressed_virtual_treenode USING btree (child_id);


--
-- Name: suppressed_virtual_treenode_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX suppressed_virtual_treenode_project_id ON suppressed_virtual_treenode USING btree (project_id);


--
-- Name: suppressed_virtual_treenode_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX suppressed_virtual_treenode_user_id ON suppressed_virtual_treenode USING btree (user_id);


--
-- Name: textlabel_location_textlabel_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX textlabel_location_textlabel_id ON textlabel_location USING btree (textlabel_id);


--
-- Name: textlabel_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX textlabel_project_id ON textlabel USING btree (project_id);


--
-- Name: treenode_class_instance_class_instance_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_class_instance_class_instance_id ON treenode_class_instance USING btree (class_instance_id);


--
-- Name: treenode_class_instance_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_class_instance_project_id ON treenode_class_instance USING btree (project_id);


--
-- Name: treenode_class_instance_relation_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_class_instance_relation_id ON treenode_class_instance USING btree (relation_id);


--
-- Name: treenode_class_instance_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_class_instance_user_id ON treenode_class_instance USING btree (user_id);


--
-- Name: treenode_connector_connector_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_connector_connector_id ON treenode_connector USING btree (connector_id);


--
-- Name: treenode_connector_project_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_connector_project_id ON treenode_connector USING btree (project_id);


--
-- Name: treenode_connector_relation_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_connector_relation_id ON treenode_connector USING btree (relation_id);


--
-- Name: treenode_connector_skeleton_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_connector_skeleton_id ON treenode_connector USING btree (skeleton_id);


--
-- Name: treenode_connector_treenode_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_connector_treenode_id ON treenode_connector USING btree (treenode_id);


--
-- Name: treenode_connector_user_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_connector_user_id ON treenode_connector USING btree (user_id);


--
-- Name: treenode_creation_time_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_creation_time_index ON treenode USING btree (creation_time);


--
-- Name: treenode_edge_gix; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_edge_gix ON treenode_edge USING gist (edge gist_geometry_ops_nd);


--
-- Name: treenode_edge_project_id_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_edge_project_id_index ON treenode_edge USING btree (project_id);


--
-- Name: treenode_edition_time_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_edition_time_index ON treenode USING btree (edition_time);


--
-- Name: treenode_location_x_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_location_x_index ON treenode USING btree (project_id, location_x);


--
-- Name: treenode_location_y_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_location_y_index ON treenode USING btree (project_id, location_y);


--
-- Name: treenode_location_z_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_location_z_index ON treenode USING btree (project_id, location_z);


--
-- Name: treenode_parent_id; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_parent_id ON treenode USING btree (parent_id);


--
-- Name: treenode_project_id_skeleton_id_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_project_id_skeleton_id_index ON treenode USING btree (project_id, skeleton_id);


--
-- Name: treenode_project_id_user_id_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_project_id_user_id_index ON treenode USING btree (project_id, user_id);


--
-- Name: treenode_skeleton_id_index; Type: INDEX; Schema: public; Owner: -; Tablespace:
--

CREATE INDEX treenode_skeleton_id_index ON treenode USING btree (skeleton_id);


--
-- Name: on_create_treenode_connector_check_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_create_treenode_connector_check_review AFTER INSERT ON treenode_connector FOR EACH ROW EXECUTE PROCEDURE on_create_treenode_connector_check_review();


--
-- Name: on_delete_treenode_connector_check_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_delete_treenode_connector_check_review AFTER DELETE ON treenode_connector FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_connector_check_review();


--
-- Name: on_delete_treenode_update_edges; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_delete_treenode_update_edges BEFORE DELETE ON treenode FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_update_edges();


--
-- Name: on_delete_treenode_update_suppressed_virtual_treenodes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_delete_treenode_update_suppressed_virtual_treenodes BEFORE DELETE ON treenode FOR EACH ROW EXECUTE PROCEDURE on_delete_treenode_update_suppressed_virtual_treenodes();


--
-- Name: on_edit_change_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_change_request BEFORE UPDATE ON change_request FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_class; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_class BEFORE UPDATE ON class FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_class_class; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_class_class BEFORE UPDATE ON class_class FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_class_instance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_class_instance BEFORE UPDATE ON class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_class_instance_class_instance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_class_instance_class_instance BEFORE UPDATE ON class_instance_class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_concept; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_concept BEFORE UPDATE ON concept FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_connector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_connector BEFORE UPDATE ON connector FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_connector_check_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_connector_check_review AFTER UPDATE ON connector FOR EACH ROW EXECUTE PROCEDURE on_edit_connector_check_review();


--
-- Name: on_edit_connector_class_instance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_connector_class_instance BEFORE UPDATE ON connector_class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_location BEFORE UPDATE ON location FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_region_of_interest; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_region_of_interest BEFORE UPDATE ON region_of_interest FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_relation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_relation BEFORE UPDATE ON relation FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_relation_instance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_relation_instance BEFORE UPDATE ON relation_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_textlabel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_textlabel BEFORE UPDATE ON textlabel FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_treenode; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_treenode BEFORE UPDATE ON treenode FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_treenode_check_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_treenode_check_review AFTER UPDATE ON treenode FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_check_review();


--
-- Name: on_edit_treenode_class_instance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_treenode_class_instance BEFORE UPDATE ON treenode_class_instance FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_treenode_connector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_treenode_connector BEFORE UPDATE ON treenode_connector FOR EACH ROW EXECUTE PROCEDURE on_edit();


--
-- Name: on_edit_treenode_connector_check_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_treenode_connector_check_review AFTER UPDATE ON treenode_connector FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_connector_check_review();


--
-- Name: on_edit_treenode_update_edges; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_treenode_update_edges AFTER UPDATE ON treenode FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_update_edges();


--
-- Name: on_edit_treenode_update_suppressed_virtual_treenodes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_edit_treenode_update_suppressed_virtual_treenodes AFTER UPDATE ON treenode FOR EACH ROW EXECUTE PROCEDURE on_edit_treenode_update_suppressed_virtual_treenodes();


--
-- Name: on_insert_treenode_update_edges; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_insert_treenode_update_edges AFTER INSERT ON treenode FOR EACH ROW EXECUTE PROCEDURE on_insert_treenode_update_edges();


--
-- Name: change_request_connector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY change_request
    ADD CONSTRAINT change_request_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES connector(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: change_request_treenode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY change_request
    ADD CONSTRAINT change_request_treenode_id_fkey FOREIGN KEY (treenode_id) REFERENCES treenode(id) ON DELETE CASCADE;


--
-- Name: change_request_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY change_request
    ADD CONSTRAINT change_request_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_user(id);


--
-- Name: suppressed_vnodes_child_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY suppressed_virtual_treenode
    ADD CONSTRAINT suppressed_vnodes_child_id_refs_id FOREIGN KEY (child_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: connector_class_instance_connector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY connector_class_instance
    ADD CONSTRAINT connector_class_instance_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES connector(id) ON DELETE CASCADE;


--
-- Name: data_view_type_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY data_view
    ADD CONSTRAINT data_view_type_id_refs_id FOREIGN KEY (data_view_type_id) REFERENCES data_view_type(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: datastore_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY client_data
    ADD CONSTRAINT datastore_id_refs_id FOREIGN KEY (datastore_id) REFERENCES client_datastore(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: volume_editor_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY catmaid_volume
    ADD CONSTRAINT volume_editor_id_refs_id FOREIGN KEY (editor_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: location_editor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY location
    ADD CONSTRAINT location_editor_id_fkey FOREIGN KEY (editor_id) REFERENCES auth_user(id);


--
-- Name: location_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY location
    ADD CONSTRAINT location_project_id_fkey FOREIGN KEY (project_id) REFERENCES project(id);


--
-- Name: location_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY location
    ADD CONSTRAINT location_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth_user(id);


--
-- Name: reviewer_whitelist_project_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY reviewer_whitelist
    ADD CONSTRAINT reviewer_whitelist_project_id_refs_id FOREIGN KEY (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: textlabel_project_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY textlabel
    ADD CONSTRAINT textlabel_project_id_refs_id FOREIGN KEY (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: project_stack_project_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_project_id_refs_id FOREIGN KEY (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: review_project_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY review
    ADD CONSTRAINT review_project_id_refs_id FOREIGN KEY (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: client_data_project_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY client_data
    ADD CONSTRAINT client_data_project_id_refs_id FOREIGN KEY (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: volume_project_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY catmaid_volume
    ADD CONSTRAINT volume_project_id_refs_id FOREIGN KEY (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: suppressed_vnodes_project_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY suppressed_virtual_treenode
    ADD CONSTRAINT suppressed_vnodes_project_id_refs_id FOREIGN KEY (project_id) REFERENCES project(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: recipient_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY change_request
    ADD CONSTRAINT recipient_id_refs_id FOREIGN KEY (recipient_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: region_of_interest_class_instance_class_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY region_of_interest_class_instance
    ADD CONSTRAINT region_of_interest_class_instance_class_instance_id_fkey FOREIGN KEY (class_instance_id) REFERENCES class_instance(id);


--
-- Name: region_of_interest_stack_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY region_of_interest
    ADD CONSTRAINT region_of_interest_stack_id_fkey1 FOREIGN KEY (stack_id) REFERENCES stack(id);


--
-- Name: restricted_link_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY restriction
    ADD CONSTRAINT restricted_link_fkey FOREIGN KEY (restricted_link_id) REFERENCES class_class(id);


--
-- Name: reviewer_whitelist_reviewer_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY reviewer_whitelist
    ADD CONSTRAINT reviewer_whitelist_reviewer_id_refs_id FOREIGN KEY (reviewer_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: review_reviewer_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY review
    ADD CONSTRAINT review_reviewer_id_refs_id FOREIGN KEY (reviewer_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: review_skeleton_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY review
    ADD CONSTRAINT review_skeleton_id_refs_id FOREIGN KEY (skeleton_id) REFERENCES class_instance(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: project_stack_stack_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY project_stack
    ADD CONSTRAINT project_stack_stack_id_refs_id FOREIGN KEY (stack_id) REFERENCES stack(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: stack_ci_stack_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY stack_class_instance
    ADD CONSTRAINT stack_ci_stack_id_refs_id FOREIGN KEY (stack_id) REFERENCES stack(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: stack_class_instance_stack_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY stack_class_instance
    ADD CONSTRAINT stack_class_instance_stack_id_fkey FOREIGN KEY (stack_id) REFERENCES stack(id);


--
-- Name: broken_slices_stack_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY broken_slice
    ADD CONSTRAINT broken_slices_stack_id_refs_id FOREIGN KEY (stack_id) REFERENCES stack(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: overlay_stack_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "overlay"
    ADD CONSTRAINT overlay_stack_id_refs_id FOREIGN KEY (stack_id) REFERENCES stack(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: textlabel_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY textlabel_location
    ADD CONSTRAINT textlabel_id_refs_id FOREIGN KEY (textlabel_id) REFERENCES textlabel(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: treenode_class_instance_treenode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode_class_instance
    ADD CONSTRAINT treenode_class_instance_treenode_id_fkey FOREIGN KEY (treenode_id) REFERENCES treenode(id) ON DELETE CASCADE;


--
-- Name: treenode_connector_connector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode_connector
    ADD CONSTRAINT treenode_connector_connector_id_fkey FOREIGN KEY (connector_id) REFERENCES connector(id) ON DELETE CASCADE;


--
-- Name: treenode_connector_treenode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode_connector
    ADD CONSTRAINT treenode_connector_treenode_id_fkey FOREIGN KEY (treenode_id) REFERENCES treenode(id) ON DELETE CASCADE;


--
-- Name: treenode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY review
    ADD CONSTRAINT treenode_id_fkey FOREIGN KEY (treenode_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: treenode_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES treenode(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: treenode_skeleton_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY treenode
    ADD CONSTRAINT treenode_skeleton_id_fkey FOREIGN KEY (skeleton_id) REFERENCES class_instance(id) ON DELETE CASCADE;


--
-- Name: userprofile_user_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY catmaid_userprofile
    ADD CONSTRAINT userpofile_user_id_refs_id FOREIGN KEY (user_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: message_user_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY message
    ADD CONSTRAINT message_user_id_refs_id FOREIGN KEY (user_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: reviewer_whitelist_user_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY reviewer_whitelist
    ADD CONSTRAINT reviewer_whitelist_user_id_refs_id FOREIGN KEY (user_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: suppressed_vnodes_user_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY suppressed_virtual_treenode
    ADD CONSTRAINT suppressed_vnodes_user_id_refs_id FOREIGN KEY (user_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: client_data_user_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY client_data
    ADD CONSTRAINT client_data_user_id_refs_id FOREIGN KEY (user_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: volume_user_id_refs_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY catmaid_volume
    ADD CONSTRAINT volume_user_id_refs_id FOREIGN KEY (user_id) REFERENCES auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: public; Type: ACL; Schema: -; Owner: -
--

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

"""

initial_state_operations = [
    migrations.CreateModel(
        name='BrokenSlice',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('index', models.IntegerField()),
        ],
        options={
            'db_table': 'broken_slice',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='CardinalityRestriction',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('enabled', models.BooleanField(default=True)),
            ('cardinality_type', models.IntegerField()),
            ('value', models.IntegerField()),
        ],
        options={
            'db_table': 'cardinality_restriction',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='ChangeRequest',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('type', models.CharField(max_length=32)),
            ('description', models.TextField()),
            ('status', models.IntegerField(default=0)),
            ('location', catmaid.fields.Double3DField()),
            ('validate_action', models.TextField()),
            ('approve_action', models.TextField()),
            ('reject_action', models.TextField()),
            ('completion_time', models.DateTimeField(default=None, null=True)),
        ],
        options={
            'db_table': 'change_request',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Class',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('class_name', models.CharField(max_length=255)),
            ('description', models.TextField()),
        ],
        options={
            'db_table': 'class',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='ClassClass',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('class_a', models.ForeignKey(related_name='classes_a', db_column='class_a', to='catmaid.Class', on_delete=models.CASCADE)),
            ('class_b', models.ForeignKey(related_name='classes_b', db_column='class_b', to='catmaid.Class', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'class_class',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='ClassInstance',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('name', models.CharField(max_length=255)),
            ('class_column', models.ForeignKey(to='catmaid.Class', db_column='class_id', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'class_instance',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='ClassInstanceClassInstance',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('class_instance_a', models.ForeignKey(related_name='cici_via_a', db_column='class_instance_a', to='catmaid.ClassInstance', on_delete=models.CASCADE)),
            ('class_instance_b', models.ForeignKey(related_name='cici_via_b', db_column='class_instance_b', to='catmaid.ClassInstance', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'class_instance_class_instance',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='ClassInstanceClassInstanceProxy',
        fields=[
        ],
        options={
            'proxy': True,
        },
        bases=('catmaid.classinstanceclassinstance',),
    ),
    migrations.CreateModel(
        name='ClassInstanceProxy',
        fields=[
        ],
        options={
            'proxy': True,
        },
        bases=('catmaid.classinstance',),
    ),
    migrations.CreateModel(
        name='ClassProxy',
        fields=[
        ],
        options={
            'proxy': True,
        },
        bases=('catmaid.class',),
    ),
    migrations.CreateModel(
        name='GroupProxy',
        fields=[
        ],
        options={
            'proxy': True,
        },
        bases=('auth.group',),
        managers=[
            ('objects', django.contrib.auth.models.GroupManager()),
        ],
    ),
    migrations.CreateModel(
        name='UserProxy',
        fields=[
        ],
        options={
            'proxy': True,
        },
        bases=('auth.user',),
        managers=[
            ('objects', django.contrib.auth.models.UserManager()),
        ],
    ),
    migrations.CreateModel(
        name='ClientData',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('key', models.CharField(max_length=255)),
            ('value', jsonfield.fields.JSONField(default={})),
        ],
        options={
            'db_table': 'client_data',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='ClientDatastore',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('name', models.CharField(unique=True, max_length=255, validators=[django.core.validators.RegexValidator(b'^[\\w-]+$', b'Only alphanumeric characters and hyphens are allowed.')])),
        ],
        options={
            'db_table': 'client_datastore',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Concept',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
        ],
        options={
            'db_table': 'concept',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Connector',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('location_x', models.FloatField()),
            ('location_y', models.FloatField()),
            ('location_z', models.FloatField()),
            ('confidence', models.IntegerField(default=5)),
            ('editor', models.ForeignKey(related_name='connector_editor', db_column='editor_id', to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'connector',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='ConnectorClassInstance',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('class_instance', models.ForeignKey(to='catmaid.ClassInstance', on_delete=models.CASCADE)),
            ('connector', models.ForeignKey(to='catmaid.Connector', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'connector_class_instance',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='DataView',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('title', models.TextField()),
            ('config', models.TextField(default='{}')),
            ('is_default', models.BooleanField(default=False)),
            ('position', models.IntegerField(default=0)),
            ('comment', models.TextField(default='', null=True, blank=True)),
        ],
        options={
            'ordering': ('position',),
            'db_table': 'data_view',
            'permissions': (('can_administer_dataviews', 'Can administer data views'), ('can_browse_dataviews', 'Can browse data views')),
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='DataViewType',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('title', models.TextField()),
            ('code_type', models.TextField()),
            ('comment', models.TextField(null=True, blank=True)),
        ],
        options={
            'db_table': 'data_view_type',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Location',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('location_x', models.FloatField()),
            ('location_y', models.FloatField()),
            ('location_z', models.FloatField()),
            ('editor', models.ForeignKey(related_name='location_editor', db_column='editor_id', to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'location',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Log',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('operation_type', models.CharField(max_length=255)),
            ('location', catmaid.fields.Double3DField()),
            ('freetext', models.TextField()),
        ],
        options={
            'db_table': 'log',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Message',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('time', models.DateTimeField(default=timezone.now)),
            ('read', models.BooleanField(default=False)),
            ('title', models.TextField()),
            ('text', models.TextField(default='New message', null=True, blank=True)),
            ('action', models.TextField(null=True, blank=True)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'message',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Overlay',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('title', models.TextField()),
            ('image_base', models.TextField()),
            ('default_opacity', models.IntegerField(default=0)),
            ('file_extension', models.TextField()),
            ('tile_width', models.IntegerField(default=512)),
            ('tile_height', models.IntegerField(default=512)),
            ('tile_source_type', models.IntegerField(default=1)),
        ],
        options={
            'db_table': 'overlay',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Project',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('title', models.TextField()),
            ('comment', models.TextField(null=True, blank=True)),
        ],
        options={
            'db_table': 'project',
            'managed': True,
            'permissions': (('can_administer', 'Can administer projects'), ('can_annotate', 'Can annotate projects'), ('can_browse', 'Can browse projects')),
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='ProjectStack',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('translation', catmaid.fields.Double3DField(default=(0, 0, 0))),
            ('orientation', models.IntegerField(default=0, choices=[(0, 'xy'), (1, 'xz'), (2, 'zy')])),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'project_stack',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='RegionOfInterest',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('location_x', models.FloatField()),
            ('location_y', models.FloatField()),
            ('location_z', models.FloatField()),
            ('zoom_level', models.IntegerField()),
            ('width', models.FloatField()),
            ('height', models.FloatField()),
            ('rotation_cw', models.FloatField()),
            ('editor', models.ForeignKey(related_name='roi_editor', db_column='editor_id', to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'region_of_interest',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='RegionOfInterestClassInstance',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('class_instance', models.ForeignKey(to='catmaid.ClassInstance', on_delete=models.CASCADE)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('region_of_interest', models.ForeignKey(to='catmaid.RegionOfInterest', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'region_of_interest_class_instance',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Relation',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('relation_name', models.CharField(max_length=255)),
            ('uri', models.TextField()),
            ('description', models.TextField()),
            ('isreciprocal', models.BooleanField(default=False)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'relation',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='RelationInstance',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('relation', models.ForeignKey(to='catmaid.Relation', on_delete=models.CASCADE)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'relation_instance',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Restriction',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('enabled', models.BooleanField(default=True)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('restricted_link', models.ForeignKey(to='catmaid.ClassClass', on_delete=models.CASCADE)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'restriction',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Review',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('review_time', models.DateTimeField(default=timezone.now)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('reviewer', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
            ('skeleton', models.ForeignKey(to='catmaid.ClassInstance', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'review',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='ReviewerWhitelist',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('accept_after', models.DateTimeField(default=datetime.utcfromtimestamp(0))),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('reviewer', models.ForeignKey(related_name='+', to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'reviewer_whitelist',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Stack',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('title', models.TextField(help_text='Descriptive title of this stack.')),
            ('dimension', catmaid.fields.Integer3DField(help_text='The pixel dimensionality of the stack.')),
            ('resolution', catmaid.fields.Double3DField(help_text='The resolution of the stack in nanometers.')),
            ('image_base', models.TextField(help_text='Fully qualified URL where the tile data can be found.')),
            ('comment', models.TextField(help_text='A comment that describes the image data.', null=True, blank=True)),
            ('trakem2_project', models.BooleanField(default=False, help_text='Is TrakEM2 the source of this stack?')),
            ('num_zoom_levels', models.IntegerField(default=-1, help_text="The number of zoom levels a stack has data for. A value of -1 lets CATMAID dynamically determine the actual value so that at this value the largest extent (X or Y) won't be smaller than 1024 pixels. Values larger -1 will be used directly.")),
            ('file_extension', models.TextField(default='jpg', help_text='The file extension of the data files.', blank=True)),
            ('tile_width', models.IntegerField(default=256, help_text='The width of one tile.')),
            ('tile_height', models.IntegerField(default=256, help_text='The height of one tile.')),
            ('tile_source_type', models.IntegerField(default=1, help_text='This represents how the tile data is organized. See <a href="http://catmaid.org/page/tile_sources.html">tile source conventions documentation</a>.', choices=[(1, b'1: File-based image stack'), (2, b'2: Request query-based image stack'), (3, b'3: HDF5 via CATMAID backend'), (4, b'4: File-based image stack with zoom level directories'), (5, b'5: Directory-based image stack'), (6, b'6: DVID imageblk voxels'), (7, b'7: Render service'), (8, b'8: DVID imagetile tiles')])),
            ('metadata', models.TextField(default='', help_text='Arbitrary text that is displayed alongside the stack.', blank=True)),
            ('tags', taggit.managers.TaggableManager(to='taggit.Tag', through='taggit.TaggedItem', blank=True, help_text='A comma-separated list of tags.', verbose_name='Tags')),
        ],
        options={
            'db_table': 'stack',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='StackClassInstance',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('class_instance', models.ForeignKey(to='catmaid.ClassInstance', on_delete=models.CASCADE)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('relation', models.ForeignKey(to='catmaid.Relation', on_delete=models.CASCADE)),
            ('stack', models.ForeignKey(to='catmaid.Stack', on_delete=models.CASCADE)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'stack_class_instance',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='SuppressedVirtualTreenode',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('location_coordinate', models.FloatField()),
            ('orientation', models.SmallIntegerField(choices=[(0, 'z'), (1, 'y'), (2, 'x')])),
        ],
        options={
            'db_table': 'suppressed_virtual_treenode',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Textlabel',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('type', models.CharField(max_length=32)),
            ('text', models.TextField(default='Edit this text ...')),
            ('colour', catmaid.fields.RGBAField(default=(1, 0.5, 0, 1))),
            ('font_name', models.TextField(null=True)),
            ('font_style', models.TextField(null=True)),
            ('font_size', models.FloatField(default=32)),
            ('scaling', models.BooleanField(default=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('deleted', models.BooleanField(default=False)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'textlabel',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='TextlabelLocation',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('location', catmaid.fields.Double3DField()),
            ('deleted', models.BooleanField(default=False)),
            ('textlabel', models.ForeignKey(to='catmaid.Textlabel', on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'textlabel_location',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Treenode',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('location_x', models.FloatField()),
            ('location_y', models.FloatField()),
            ('location_z', models.FloatField()),
            ('radius', models.FloatField()),
            ('confidence', models.IntegerField(default=5)),
            ('editor', models.ForeignKey(related_name='treenode_editor', db_column='editor_id', to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
            ('parent', models.ForeignKey(related_name='children', to='catmaid.Treenode', null=True, on_delete=models.CASCADE)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('skeleton', models.ForeignKey(to='catmaid.ClassInstance', on_delete=models.CASCADE)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'treenode',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='TreenodeClassInstance',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('class_instance', models.ForeignKey(to='catmaid.ClassInstance', on_delete=models.CASCADE)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('relation', models.ForeignKey(to='catmaid.Relation', on_delete=models.CASCADE)),
            ('treenode', models.ForeignKey(to='catmaid.Treenode', on_delete=models.CASCADE)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'treenode_class_instance',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='TreenodeConnector',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('confidence', models.IntegerField(default=5)),
            ('connector', models.ForeignKey(to='catmaid.Connector', on_delete=models.CASCADE)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('relation', models.ForeignKey(to='catmaid.Relation', on_delete=models.CASCADE)),
            ('skeleton', models.ForeignKey(to='catmaid.ClassInstance', on_delete=models.CASCADE)),
            ('treenode', models.ForeignKey(to='catmaid.Treenode', on_delete=models.CASCADE)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'db_table': 'treenode_connector',
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='UserProfile',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('independent_ontology_workspace_is_default', models.BooleanField(default=False)),
            ('show_text_label_tool', models.BooleanField(default=False)),
            ('show_tagging_tool', models.BooleanField(default=False)),
            ('show_cropping_tool', models.BooleanField(default=False)),
            ('show_segmentation_tool', models.BooleanField(default=False)),
            ('show_tracing_tool', models.BooleanField(default=False)),
            ('show_ontology_tool', models.BooleanField(default=False)),
            ('show_roi_tool', models.BooleanField(default=False)),
            ('color', catmaid.fields.RGBAField(default=catmaid.models.distinct_user_color)),
            ('user', models.OneToOneField(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
        },
        bases=(models.Model,),
    ),
    migrations.CreateModel(
        name='Volume',
        fields=[
            ('id', models.AutoField(verbose_name='ID', serialize=False, auto_created=True, primary_key=True)),
            ('creation_time', models.DateTimeField(default=timezone.now)),
            ('edition_time', models.DateTimeField(default=timezone.now)),
            ('name', models.CharField(max_length=255)),
            ('comment', models.TextField(null=True, blank=True)),
            ('geometry', django.contrib.gis.db.models.fields.GeometryField(srid=0, dim=3)),
            ('editor', models.ForeignKey(related_name='editor', db_column='editor_id', to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
            ('project', models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE)),
            ('user', models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE)),
        ],
        options={
            'abstract': False,
        },
        bases=(models.Model,),
    ),
    migrations.AlterUniqueTogether(
        name='treenodeconnector',
        unique_together=set([('project', 'treenode', 'connector', 'relation')]),
    ),
    migrations.AddField(
        model_name='suppressedvirtualtreenode',
        name='child',
        field=models.ForeignKey(to='catmaid.Treenode', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='suppressedvirtualtreenode',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='suppressedvirtualtreenode',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AlterUniqueTogether(
        name='reviewerwhitelist',
        unique_together=set([('project', 'user', 'reviewer')]),
    ),
    migrations.AddField(
        model_name='review',
        name='treenode',
        field=models.ForeignKey(to='catmaid.Treenode', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='regionofinterestclassinstance',
        name='relation',
        field=models.ForeignKey(to='catmaid.Relation', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='regionofinterestclassinstance',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='regionofinterest',
        name='stack',
        field=models.ForeignKey(to='catmaid.Stack', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='regionofinterest',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='projectstack',
        name='stack',
        field=models.ForeignKey(to='catmaid.Stack', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='project',
        name='stacks',
        field=models.ManyToManyField(to='catmaid.Stack', through='catmaid.ProjectStack'),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='project',
        name='tags',
        field=taggit.managers.TaggableManager(to='taggit.Tag', through='taggit.TaggedItem', blank=True, help_text='A comma-separated list of tags.', verbose_name='Tags'),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='overlay',
        name='stack',
        field=models.ForeignKey(to='catmaid.Stack', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='log',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='log',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='location',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='location',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='dataview',
        name='data_view_type',
        field=models.ForeignKey(to='catmaid.DataViewType', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='connectorclassinstance',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='connectorclassinstance',
        name='relation',
        field=models.ForeignKey(to='catmaid.Relation', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='connectorclassinstance',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='connector',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='connector',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='concept',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='concept',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='clientdata',
        name='datastore',
        field=models.ForeignKey(to='catmaid.ClientDatastore', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='clientdata',
        name='project',
        field=models.ForeignKey(blank=True, to='catmaid.Project', null=True, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='clientdata',
        name='user',
        field=models.ForeignKey(blank=True, to=settings.AUTH_USER_MODEL, null=True, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AlterUniqueTogether(
        name='clientdata',
        unique_together=set([('datastore', 'key', 'project', 'user')]),
    ),
    migrations.AlterField(
        model_name='clientdatastore',
        name='name',
        field=models.CharField(max_length=255, unique=True, validators=[django.core.validators.RegexValidator('^[\\w-]+$', 'Only alphanumeric characters and hyphens are allowed.')]),
        ),
    migrations.AddField(
        model_name='classinstanceclassinstance',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='classinstanceclassinstance',
        name='relation',
        field=models.ForeignKey(to='catmaid.Relation', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='classinstanceclassinstance',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='classinstance',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='classinstance',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='classclass',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='classclass',
        name='relation',
        field=models.ForeignKey(to='catmaid.Relation', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='classclass',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='class',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='class',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='changerequest',
        name='connector',
        field=models.ForeignKey(to='catmaid.Connector', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='changerequest',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='changerequest',
        name='recipient',
        field=models.ForeignKey(related_name='change_recipient', db_column='recipient_id', to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='changerequest',
        name='treenode',
        field=models.ForeignKey(to='catmaid.Treenode', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='changerequest',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='cardinalityrestriction',
        name='project',
        field=models.ForeignKey(to='catmaid.Project', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='cardinalityrestriction',
        name='restricted_link',
        field=models.ForeignKey(to='catmaid.ClassClass', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='cardinalityrestriction',
        name='user',
        field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.AddField(
        model_name='brokenslice',
        name='stack',
        field=models.ForeignKey(to='catmaid.Stack', on_delete=models.CASCADE),
        preserve_default=True,
    ),
    migrations.CreateModel(
        name='StackGroup',
        fields=[
        ],
        options={
            'proxy': True,
        },
        bases=('catmaid.classinstance',),
    ),
    migrations.CreateModel(
        name='StackStackGroup',
        fields=[
        ],
        options={
            'proxy': True,
        },
        bases=('catmaid.stackclassinstance',),
    ),
]

def add_initial_data(apps, schema_editor):
    """Create initial data like data view types and instances"""

    DataViewType = apps.get_model("catmaid", "DataViewType")
    DataView = apps.get_model("catmaid", "DataView")

    # Create default data view types
    legacy_list = DataViewType.objects.create(title='Legacy project list view',
            code_type='legacy_project_list_data_view', comment='A simple list '
            'of all projects and their stacks. It is rendered in the browser '
            'with the help of JavaScript and it does not support any '
            'configuration options. The config field of a data view is '
            'therefore likely to read only {}.')
    project_list = DataViewType.objects.create(title='Project list view',
            code_type='project_list_data_view', comment='A simple adjustable '
            'list of all projects and their stacks. This view is rendered '
            'server side and supports the display of sample images. The '
            'following options are available: "filter_tags": [list of tags], '
            '"sample_images": [true|false], "sample_stack": ["first"|"last"], '
            '"sample_slice": [slice number|"first"|"center"|"last"], '
            '"sample_width": [pixel size] and "sample_height": [pixel size]. '
            'By default projects are sorted. Use "sort":false to turn this '
            'off. Thus, a valid sample configuration could look like: '
            '{"sample_images":true,"sample_stack":"last","sample_slice":'
            '"center","sample_width":100,"filter_tags":["TagA","TagB"]}')
    project_table = DataViewType.objects.create(title='Tabular project view',
            code_type='project_table_data_view', comment='A simple table of '
            'all projects and their stacks. This view is rendered server side '
            'and supports the display of sample images instead of stack names. '
            'The following options are available: "filter_tags": '
            '[list of tags], "sample_images": [true|false], "sample_slice": '
            '[slice number|"first"|"center"|"last"], "sample_width": '
            '[pixel size], "sample_height": [pixel size] and "sort": '
            '[true|false]. By default projects are sorted and displayed '
            'without images. A valid configuration could look like: '
            '{"sample_images":true,"sample_slice":"center","sample_height":'
            '42,"filter_tags":["TagA","TagB"]}')
    tag_table = DataViewType.objects.create(title='Tag project view',
            code_type='project_tags_data_view', comment='A table that allows '
            'to define tags for the columns and rows. This view is rendered '
            'server side and supports the display of sample images instead of '
            'stack names. The following options are available: "filter_tags": '
            '[list of tags], "col_tags": [list of tags], "row_tags": [list '
            'of tags], "sample_images": [true|false], "sample_slice": [slice '
            'number|"first"|"center"|"last"], "sample_width": [pixel size], '
            '"sample_height": [pixel size], "sort": [true|false]. By default '
            'projects are sorted and displayed without images. A valid '
            'configuration could look like: {"row_tags":["DAPI","Crb"],'
            '"col_tags":["Wing Disc","CNS"]}')
    dynamic_projects = DataViewType.objects.create(title='Dynamic projects view',
            code_type='dynamic_projects_list_data_view', comment='Loads '
            'project and stack information dynamically based on a JSON '
            'representation returned by configured URLs.')

    # Create default data views
    if settings.CREATE_DEFAULT_DATAVIEWS:
        list_view = DataView.objects.create(title='Project list',
                data_view_type=project_list, config='{}', is_default=False,
                position=0, comment='')
        table_view = DataView.objects.create(title='Project table with images',
                data_view_type=project_table, config='{"sample_images":true}',
                is_default=True, position=1, comment='')

    # Register composite type handlers now that the types exist in Postgres.
    catmaid.fields.composite_type_created.send(sender=catmaid.fields.Integer3DField, db_type='integer3d')


class Migration(migrations.Migration):
    """Migrate the database to the state of the last South migration"""

    initial = True

    dependencies = [
        ('taggit', '0001_initial'),
        ('pgcompat', '0001_prepare_postgres_9_6_compatibility'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunSQL(initial_schema, None, initial_state_operations),
        migrations.RunPython(add_initial_data)
    ]
