-- Merge one project into another. After this operation every spatial and
-- semantic element that was part of the source project will be part of the
-- target project. If the target project contains already classes and relations
-- with the same name as the ones referenced in the source project, the source
-- data will be rewritten to refer to the existing classes and relations.
CREATE OR REPLACE FUNCTION merge_projects(fromID integer, toID integer)
  RETURNS TABLE(
    updated_relations integer,
    deleted_relations integer,
    updated_classes integer,
    deleted_classes integer,
    updated_concepts integer,
    updated_locations integer
  ) AS
$func$
DECLARE
    updated_relations integer;
    deleted_relations integer;
    updated_classes integer;
    deleted_classes integer;
    updated_concepts integer;
    updated_locations integer;
    tmp_count integer;
BEGIN

  -- Make sure all constraints are tested immediately
  SET CONSTRAINTS ALL IMMEDIATE;


  -- Update relations references in 'from' project to point to existing relations
  -- with same name in 'to' project.
  UPDATE relation_instance AS ri SET relation_id=rt.id
  FROM relation rf JOIN relation rt
    ON rf.relation_name = rt.relation_name
  WHERE ri.relation_id = rf.id
    AND ri.project_id = rf.project_id
    AND rf.project_id = fromID
    AND rt.project_id = toID;
  GET DIAGNOSTICS updated_relations = ROW_COUNT;

  -- Delete all relations in 'from' project that are not used anymore
  DELETE FROM relation r
  WHERE r.project_id = fromID
    AND NOT EXISTS (
      SELECT * FROM relation_instance ri WHERE ri.relation_id = r.id );
  GET DIAGNOSTICS deleted_relations = ROW_COUNT;


  -- Update class references in 'from' project to point to existing classes with
  -- same name in 'to' project. A class should only be referenced from class_class
  -- and class_instance tables.
  UPDATE class_instance AS ci SET class_id=ct.id
  FROM class cf JOIN class ct
    ON cf.class_name = ct.class_name
  WHERE ci.class_id = cf.id
    AND ci.project_id = cf.project_id
    AND cf.project_id = fromID
    AND ct.project_id = toID;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  updated_classes = tmp_count;

  UPDATE class_class AS cc SET class_a=ct.id
  FROM class cf JOIN class ct
    ON cf.class_name = ct.class_name
  WHERE cc.class_a = cf.id
    AND cc.project_id = cf.project_id
    AND cf.project_id = fromID
    AND ct.project_id = toID;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  updated_classes = updated_classes + tmp_count;

  UPDATE class_class AS cc SET class_b=ct.id
  FROM class cf JOIN class ct
    ON cf.class_name = ct.class_name
  WHERE cc.class_b = cf.id
    AND cc.project_id = cf.project_id
    AND cf.project_id = fromID
    AND ct.project_id = toID;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  updated_classes = updated_classes + tmp_count;

  -- Delete all classes in 'from' project that are not used anymore
  DELETE FROM class c
  WHERE c.project_id = fromID
    AND NOT EXISTS (
      SELECT * FROM class_instance ci WHERE ci.class_id = c.id )
    AND NOT EXISTS (
      SELECT * FROM class_class cc WHERE cc.class_a = c.id OR cc.class_b = c.id );
  GET DIAGNOSTICS deleted_classes = ROW_COUNT;


  -- Now all elements of the source project can be updated to refer to the
  -- target project.

  -- Update semantic data
  UPDATE concept SET project_id=toID WHERE project_id=fromID;
  GET DIAGNOSTICS updated_concepts = ROW_COUNT;

  -- Update location data
  UPDATE location SET project_id=toID WHERE project_id=fromID;
  GET DIAGNOSTICS updated_locations = ROW_COUNT;

  RETURN QUERY SELECT updated_relations, deleted_relations, updated_classes,
    deleted_classes, updated_concepts, updated_locations;
END
$func$ LANGUAGE plpgsql;
