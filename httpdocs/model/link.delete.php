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

$cid = isset( $_REQUEST[ 'cid' ] ) ? intval( $_REQUEST[ 'cid' ] ) : 0;
$tid = isset( $_REQUEST[ 'tid' ] ) ? intval( $_REQUEST[ 'tid' ] ) : 0;

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

  // delete connector from geometry domain
  $ids = $db->deleteFrom("treenode_connector", ' "connector_id" = '.$cid.' AND "treenode_id" = '.$tid);

  if (false === $ids) {
     emitErrorAndExit($db, 'Failed to delete connector #'.$cid.' from geometry domain');
  }

  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }

  echo makeJSON( array( 'result' => "Removed treenode to connector link") );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
