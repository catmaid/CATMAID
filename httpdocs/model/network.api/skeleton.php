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

# Skeleton id
$skid = isset( $_REQUEST[ 'skid' ] ) ? intval( $_REQUEST[ 'skid' ] ) : -1;

# Check preconditions:

# 1. There must be a skeleton id
if ( ! $skid ) {
	echo json_encode( array( 'error' => 'A skeleton id has not been provided!' ) );
	return;
}

# 2. There must be a project id
if ( ! $pid ) {
  echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 3. There must be a user id
if ( ! $uid ) {
    echo json_encode( array( 'error' => 'You are not logged in.' ) );
	return;
}

# 4. The user must be allowed to view annotations:
checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
  # Retrieve relation 'model_of'
  $model_of_id = $db->getRelationId( $pid, 'model_of' );
  if (false === $model_of_id || !$model_of_id) {
    emitErrorAndExit( $db, 'Cannot find "model_of" relation for this project' );
  }

  # Retrieve class 'skeleton'
  $skeleton_class_id = $db->getResult(
    'SELECT class.id FROM class WHERE class.class_name = \'skeleton\'');
  if (false === $skeleton_class_id) {
    emitErrorAndExit( $db, 'Cannot find class "skeleton".' );
  }
  $skeleton_class_id = $skeleton_class_id[0]['id'];

  # Select info for the given skeleton ID
  # Skeleton is a 'model_of' a Neuron
  $q = $db->getResult(
  'SELECT class_instance.id,
          class_instance.user_id,
          class_instance.name,
          cici.class_instance_b AS neuron_id
  FROM class_instance,
       class_instance_class_instance AS cici
  WHERE class_instance.project_id = '.$pid.'
    AND class_instance.id = '.$skid.'
    AND class_instance.class_id = '.$skeleton_class_id.'
    AND cici.class_instance_a = '.$skid.'
    AND cici.relation_id = '.$model_of_id);

  # WARNING: ASSUMES that class_instance_b will be an ID of an instance of a neuron.

  if (false === $q) {
    emitErrorAndExit($db, 'Failed to retrieve information for skeleton #'.$skid);
  }

  if (1 != count($q)) {
    emitErrorAndExit($db, 'Found not 1 but '.count($q).' skeletons with ID #'.$skid);
  }

  # Only one row expected
  $q = $q[0];
  
  # Convert numeric entries to integers
  $q['id'] = (int)$q['id'];
  $q['user_id'] = (int)$q['user_id'];
  $q['neuron_id'] = (int)$q['neuron_id'];

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

  echo json_encode( $q );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
