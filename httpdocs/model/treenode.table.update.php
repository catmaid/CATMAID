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

# Check preconditions:

# 1. There must be a project id
if ( ! $pid ) {
  echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 2. There must be a user id
if ( ! $uid ) {
  echo json_encode( array( 'error' => 'You are not logged in currently.' ) );
	return;
}

# 3. There must be some other data
$type = isset( $_REQUEST[ 'type' ] ) ? $_REQUEST[ 'type' ]  : "none";
$tnid = isset( $_REQUEST[ 'id' ] ) ? intval( $_REQUEST[ 'id' ] ) : 0;
$value = isset( $_REQUEST[ 'value' ] ) ? intval( $_REQUEST[ 'value' ] ) : 0;

if (! $type || ! $tnid || ! $value ) {
	echo json_encode( array( 'error' => 'Need type, treenode id and value.' );
	return;
}


# Update confidence value for treenode
if ($type == "confidence")
{
	$q = $db->update(
		'treenode',
		array(
			'confidence' => $value,
			'user_id' => $uid), // update the user who changed the confidence
		'"project_id" = '.$pid.' AND "id" = '.$tnid ); // ONLY for the specific project and treenode ID.

	if (false === $q) {
		echo json_encode( array ( 'error' => 'Could not update confidence for treenode '.$tnid ) );
		return;
	}
	// return value:
	echo $value;
}

?>
