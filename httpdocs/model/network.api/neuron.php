
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

# Neuron id
$neuron_id = isset( $_REQUEST[ 'neuron_id' ] ) ? intval( $_REQUEST[ 'neuron_id' ] ) : -1;

# Check preconditions:

# 1. There must be a neuron id
if ( ! $neuron_id ) {
	echo json_encode( array( 'error' => 'A neuron id has not been provided!' ) );
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
  # Check if relation 'model_of' exists
  $model_of_id = $db->getRelationId( $pid, 'model_of' );
  if (false === $model_of_id || !$model_of_id) {
    emitErrorAndExit( $db, 'Can not find "model_of" relation for this project' );
  }

  # Retrieve class 'neuron'
  $neuron_class_id = $db->getResult(
    'SELECT class.id FROM class WHERE class.class_name = \'neuron\'');
  if (false === $neuron_class_id) {
    emitErrorAndExit( $db, 'Cannot find class "neuron".' );
  }
  $neuron_class_id = $neuron_class_id[0]['id'];

  # Retrieve neuron properties
  # Skeleton is a 'model_of' a Neuron
  $q = $db->getResult(
  'SELECT class_instance.id,
          class_instance.user_id,
          class_instance.name,
          cici.class_instance_a AS skeleton_id
  FROM class_instance,
       class_instance_class_instance AS cici
  WHERE class_instance.project_id = '.$pid.'
    AND class_instance.id = '.$neuron_id.'
    AND class_instance.class_id = '.$neuron_class_id.'
    AND cici.class_instance_b = '.$neuron_id.'
    AND cici.relation_id = '.$model_of_id);

  # WARNING: ASSUMES that class_instance_a will be an ID of an instance of a skeleton.

  if (false === $q) {
    emitErrorAndExit($db, 'Failed to retrieve information for neuron #'.$neuron_id);
  }

  if (1 != count($q)) {
    emitErrorAndExit($db, 'Found not 1 but '.count($q).' rows for neuron with ID #'.$neuron_id);
  }

  # Only one row expected -- TODO a neuron may have multiple skeletons!
  $q = $q[0];
  
  # Convert numeric entries to integers
  $q['id'] = (int)$q['id'];
  $q['user_id'] = (int)$q['user_id'];
  $q['skeleton_id'] = (int)$q['skeleton_id'];

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

  echo json_encode( $q );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
