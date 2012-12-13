<?php
// should delete the class instance, the connector, and all pre and post
// synaptic links associated to terminals. if the links are the only ones
// one can delete the terminal instances as well.
// assume that one treenode can only be of one termial type

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

$cid = isset( $_REQUEST[ 'cid' ] ) ? intval( $_REQUEST[ 'cid' ] ) : 0;

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

# 3. Permissions?
checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED | $EDIT_ANY_ALLOWED);

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

  // delete connector
  $ids = $db->deleteFrom("connector", ' "connector"."id" = '.$cid);

  if (false === $ids) {
    emitErrorAndExit($db, 'Failed to delete connector #'.$cid);
  }

  // delete connector from geometry domain
  $ids = $db->deleteFrom("treenode_connector", ' "connector_id" = '.$cid);

  if (false === $ids) {
    emitErrorAndExit($db, 'Failed to delete connector #'.$cid.' from geometry domain');
  }

  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }
  
  echo makeJSON( array( 'message' => "Removed connector and class_instances",
              'connector_id' => $cid) );
  
} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
