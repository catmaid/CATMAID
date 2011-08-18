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


// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
	 
	$current_id = $tnid;
	$parent_res = $db->getResult('SELECT "treenode"."parent_id" AS "parent_id"
																FROM "treenode"
																WHERE "treenode"."id" = '.$current_id.'
																AND "treenode"."project_id" = '.$pid);

	if (false === $parent_res) {
		emitErrorAndExit($db, 'Failed to select treenode with id '.$current_id);
	}

	if (empty($parent_res)) {
		// no parent found or is root, then return
		emitErrorAndExit( $db, 'An error occured while rerooting. No valid query result.' );
	}


	$parent_id = $parent_res[0]['parent_id'];
	 
	while ( null != $parent_id ) {
		// echo current_id with parent
		// temporary retrieval of parents's parent
		$parents_parent_res = $db->getResult('SELECT "treenode"."parent_id" AS "parent_id"
																					FROM "treenode"
																					WHERE "treenode"."id" = '.$parent_id.'
																					AND "treenode"."project_id" = '.$pid);
		
		if (false === $parents_parent_res || empty($parents_parent_res)) {
			emitErrorAndExit($db, 'Failed to select parent with id: '.$parent_id);
		}

		$par_tmp = $parents_parent_res[0]['parent_id'];
	 
		$ids = $db->update("treenode", array("parent_id" => $current_id) ,' "treenode"."id" = '.$parent_id);

		if (false === $ids) {
			emitErrorAndExit($db, 'Failed to update treenode with id '.$current_id.' to id '.$parent_id);
		}

		$current_id = $parent_id;
		$parent_id = $par_tmp;      
	}

	// finally make tnid root
	$ids = $db->getResult('UPDATE "treenode" SET "parent_id" = NULL
												 WHERE "treenode"."id" = '.$tnid);

	if (false === $ids) {
		emitErrorAndExit($db, 'Failed to set treenode '.$tnid.' as root');
	}

	if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit split!' );
	}

	// echo "Successfully rerooted";
	echo json_encode( array( 'newroot' => $tnid ) );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
