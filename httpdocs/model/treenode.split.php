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

# Treenode id
$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;

# Check preconditions:

# 1. There must be a treenode id
if ( ! $tnid ) {
	echo json_encode( array( 'error' => 'A treenode id has not been provided!' ) );
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
# Proceed to split the given node from its parent,
# so that the node becomes the root of its own subtree in a new skeleton.

// Split treenode

$modof = 'model_of';
$eleof = 'element_of';

// relation ids
$modof_id = $db->getRelationId( $pid, $modof );
if(!$modof_id) { echo json_encode( array( 'error' => 'Cannot find "'.$modof.'" relation for this project' ) ); return; }

$eleof_id = $db->getRelationId( $pid, $eleof );
if(!$eleof_id) { echo json_encode( array( 'error' => 'Cannot find "'.$eleof.'" relation for this project' ) ); return; }

$skeletonClassID = $db->getClassId( $pid, "skeleton" );
if(!$skeletonClassID) { echo json_encode( array( 'error' => 'Cannot find "skeleton" class for this project' ) ); return; }

// retrieve class_instances for the treenode, should only be one id
//$ci_id = $db->getClassInstanceForTreenode( $pid, $tnid, 'model_of');
// delete the model of, assume only one
//$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$ci_id[0]['class_instance_id']);



// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

	// retrieve skeleton id
	$sk = $db->getClassInstanceForTreenode( $pid, $tnid, $eleof );
	if (!empty($sk)) {
		// DECLARE sk_id for the first time
		$sk_id = $sk[0]['class_instance_id'];
	} else {
		emitErrorAndExit( $db, 'Cannot find skeleton for treenode with id: '.$tnid );
	}

	// retrieve neuron id of the skeleton
	// getCIFromCI means "getClassInstanceFromClassInstance"
	$neu = $db->getCIFromCI( $pid, $sk_id, 'model_of' );
	if (!empty($neu)) {
		// DECLARE neu_id for the first time
		$neu_id = $neu[0]['id'];
	} else {
		emitErrorAndExit( 'Cannot find neuron for the skeleton with id: '.$sk_id );
	}

	// Split $tnid from its parent in $sk_id
	$ids = $db->getResult('UPDATE "treenode" SET "parent_id" = NULL WHERE "treenode"."id" = '.$tnid);

	if ( false === $ids ) {
		emitErrorAndExit($db, 'Failed to update treenode with id '.$tnid);
	}

	// Create new skeleton that will be used for each children treenode
	//   which becomes the root of a new skeleton
	$data = array(
		'user_id' => $uid,
		'project_id' => $pid,
		'class_id' => $skeletonClassID,
		'name' => 'skeleton'
		);
	$newSkeletonID = $db->insertIntoId('class_instance', $data );

	if ( false === $newSkeletonID ) {
		emitErrorAndExit($db, 'Failed to create a new skeleton');
	}

	// Update skeleton name by adding its id to the end
	$up = array('name' => 'skeleton '.$newSkeletonID);
	$upw = 'id = '.$newSkeletonID;

	if (0 == $db->update( "class_instance", $up, $upw)) {
		emitErrorAndExit($db, 'Failed to update the name of the skeleton');
	}

	// Attach skeleton to neuron
	$data = array(
			'user_id' => $uid,
			'project_id' => $pid,
			'relation_id' => $modof_id,
			'class_instance_a' => $newSkeletonID,
			'class_instance_b' => $neu_id 
		);
	if ( false === $db->insertInto('class_instance_class_instance', $data ) ) {
		emitErrorAndExit($db, 'Failed to update the name of the skeleton');
	}

	// Traverse the entire subtree starting at $tnid and set their skeleton to a new one
	//    Update element_of of sub-skeleton
	//    Retrieve all treenode ids by traversing the subtree
	$children = $db->getAllTreenodeChildrenRecursively( $pid, $tnid );
	foreach($children as $key => $childTreenode) {
		// Update the element_of to the newly created skeleton
		// and the new root treenode
		$ids = $db->getResult('UPDATE "treenode_class_instance" SET "class_instance_id" = '.$newSkeletonID.'
													 WHERE "treenode_class_instance"."treenode_id" = '.$childTreenode['id'].'
																 AND "treenode_class_instance"."relation_id" = '.$eleof_id);
		if ( false === $ids ) {
			emitErrorAndExit($db, 'Failed to update the skeleton id of the splitted nodes.');
		}
	};

	if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit split!' );
	}

	echo json_encode( array( 'message' => 'success' ) );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}
 
?>
