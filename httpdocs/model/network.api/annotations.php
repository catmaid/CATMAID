<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );
include_once( 'utils.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

# Retrieve the annotation domain graph ( class_instances and their relation )
# in a JSON-object formatted to be consumed by Cytoscape Web
# Reference: http://cytoscapeweb.cytoscape.org/tutorial

# Check preconditions:

# 1. There must be a project id
if ( ! $pid ) {
  echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 2. There must be a user id
if ( ! $uid ) {
    echo json_encode( array( 'error' => 'You are not logged in.' ) );
	return;
}

# 3. The user must be allowed to view annotations:
checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
  # Check if relation 'model_of' exists
  $model_of_id = $db->getRelationId( $pid, 'model_of' );
  if (false === $model_of_id || !$model_of_id) {
    emitErrorAndExit( $db, 'Can not find "model_of" relation for this project' );
  }

  # Retrieve class_instances (nodes)
  $q0 = $db->getResult(
  'SELECT class_instance.id AS id,
    class_instance.name AS label,
    class.class_name AS type
  FROM class_instance, class
  WHERE class_instance.project_id = '.$pid.'
  AND class.id = class_instance.class_id');

  if (false === $q0) {
    emitErrorAndExit($db, 'Failed to retrieve annotations (nodes)');
  }
  
  # Retrieve class_instance_class_instances (edges)
  $q1 = $db->getResult(
  'SELECT cici.id AS id,
    cici.class_instance_a AS source,
    cici.class_instance_b AS target,
    relation.relation_name AS label
  FROM class_instance_class_instance AS cici, relation
  WHERE cici.project_id = '.$pid.'
  AND cici.relation_id = relation.id');

  if (false === $q1) {
    emitErrorAndExit($db, 'Failed to retrieve annotations (edges)');
  }

  $nodesDataSchema = array();
  $nodesDataSchema[] = array('name' => 'label', 'type' => 'string');
  $nodesDataSchema[] = array('name' => 'type', 'type' => 'string');

  $edgesDataSchema = array();
  $edgesDataSchema[] = array('name' => 'label', 'type' => 'string');
  $edgesDataSchema[] = array('name' => 'directed', 'type' => 'boolean', 'defValue' => True);


  $data = array( 'dataSchema' => array('nodes' => $nodesDataSchema, 'edges' => $edgesDataSchema),
                 'data' => array('nodes' => $q0, 'edges' => $q1) );

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}
  
  echo json_encode( $data );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
