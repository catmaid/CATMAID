<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

# Treenode id
$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;

# Check preconditions:

# 1. There must be a treenode id
if ( ! $tnid ) {
	echo makeJSON( array( 'error' => 'A treenode id has not been provided!' ) );
	return;
}

# 2. There must be a project id
if ( ! $pid ) {
  echo makeJSON( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 3. There must be a user id
if ( ! $uid ) {
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to add treenodes.' ) );
	return;
}

# 4. The user must have permissions to edit this tree
# TODO -- currently all users can edit everything


# Preconditions passed!
# Proceed to split the given node from its parent,
# so that the node becomes the root of its own subtree in a new skeleton.

# TODO: TRANSACTIONAL! Put all database queries into a single transaction.

// Split treenode

$modof = 'model_of';
$eleof = 'element_of';

// relation ids
$modof_id = $db->getRelationId( $pid, $modof );
if(!$modof_id) { echo makeJSON( array( 'error' => 'Cannot find "'.$modof.'" relation for this project' ) ); return; }

$eleof_id = $db->getRelationId( $pid, $eleof );
if(!$eleof_id) { echo makeJSON( array( 'error' => 'Cannot find "'.$eleof.'" relation for this project' ) ); return; }

$skeletonClassID = $db->getClassId( $pid, "skeleton" );
if(!$skeletonClassID) { echo makeJSON( array( 'error' => 'Cannot find "skeleton" class for this project' ) ); return; }

// retrieve class_instances for the treenode, should only be one id
//$ci_id = $db->getClassInstanceForTreenode( $pid, $tnid, 'model_of');
// delete the model of, assume only one
//$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$ci_id[0]['class_instance_id']);

// retrieve skeleton id
$sk = $db->getClassInstanceForTreenode( $pid, $tnid, $eleof );
if (!empty($sk)) {
	// DECLARE sk_id for the first time
	$sk_id = $sk[0]['class_instance_id'];
} else {
	echo makeJSON( array( 'error' => 'Cannot find skeleton for treenode with id: '.$tnid ) );
	return;
}

// retrieve neuron id of the skeleton
// getCIFromCI means "getClassInstanceFromClassInstance"
$neu = $db->getCIFromCI( $pid, $sk_id, 'model_of' );
if (!empty($neu)) {
	// DECLARE neu_id for the first time
	$neu_id = $neu[0]['id'];
} else {
	echo makeJSON( array( 'error' => 'Cannot find neuron for the skeleton with id: '.$sk_id ) );
	return;
}

// Split $tnid from its parent in $sk_id
$ids = $db->getResult('UPDATE "treenode" SET "parent_id" = NULL WHERE "treenode"."id" = '.$tnid);

// Create new skeleton that will be used for each children treenode
//   which becomes the root of a new skeleton
$data = array(
  'user_id' => $uid,
  'project_id' => $pid,
  'class_id' => $skeletonClassID,
  'name' => 'skeleton'
  );
$newSkeletonID = $db->insertIntoId('class_instance', $data );

// Update skeleton name by adding its id to the end
$up = array('name' => 'skeleton '.$newSkeletonID);
$upw = 'id = '.$newSkeletonID;
$db->update( "class_instance", $up, $upw);

// Attach skeleton to neuron
$data = array(
    'user_id' => $uid,
    'project_id' => $pid,
    'relation_id' => $modof_id,
    'class_instance_a' => $newSkeletonID,
    'class_instance_b' => $neu_id 
  );
$db->insertInto('class_instance_class_instance', $data );

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
};


echo json_encode( array( 'message' => 'success' ) );
  
?>
