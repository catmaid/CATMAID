<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );
include_once( 'utils.php' );

$db =& getDB();
$ses =& getSession();

# Project id
$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
# User id
$uid = $ses->isSessionValid() ? $ses->getId() : 0;
# Skeleton id
$skeletonID = isset( $_REQUEST[ 'skeleton_id' ] ) ? intval( $_REQUEST[ 'skeleton_id' ] ) : -1;

# Check preconditions:

# 1. There must be a skeleton id
if ( ! $skeletonID ) {
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

# 4. The user must have permissions to edit this tree
# TODO -- currently all users can edit everything


# Preconditions passed!

# Treenode is element_of class_instance (skeleton), which is model_of (neuron) which is part_of class_instance (?), recursively, until reaching class_instance ('root').


// 0. Relation ids. Useful for querying parents.
$model_of = 'model_of';
$element_of = 'element_of';
$part_of = 'part_of';


// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

	# 1. Retrieve neuron id of the skeleton
	# (getCIFromCI means "getClassInstanceFromClassInstance")
	$neuron = $db->getCIFromCI( $pid, $skeletonID, $model_of );
	if ( false === $neuron || empty($neuron) ) {
		emitErrorAndExit( $db, 'Cannot find neuron for the skeleton with id: '.$skeletonID );
	}

	$neuronID = $neuron[0]['id'];

	# 2. Retrieve, recursively, all the nodes of which the neuron is a part of.
	$path = array( $skeletonID, $neuronID );
	while(true) {
		$q = $db->getCIFromCIWithClassNameAndId( $pid, end($path), $part_of );
		if (false === $q || empty($q)) {
			emitErrorAndExit( $db, 'Cannot find parent instance for instance with id: '.end($path) );
		}
		// Append the child at the last position in the path array
		$path[count($path)] = $q[0]['parent_id'];
		// If we reached the root, stop
		if (0 == strcmp('root', $q[0]['class_name'])) {
			break;
		}
	}

	// There is nothing to commit but the transaction has to be closed:
	if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit for expand!' );
	}

	# 3. Return the list of ids that represent the path from the root id to the skeleton id in the object hierarchy:
	echo json_encode( array_reverse($path) );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
