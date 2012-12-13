<?php

# Return the integer count of skeleton treenodes for the given skeleton id.

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

checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

try {

  $skid = isset( $_REQUEST[ 'skid' ] ) ? intval( $_REQUEST[ 'skid' ] ) : 0;

  $n_treenodes = $db->countEntries('treenode', 'skeleton_id='.$skid);

	echo json_encode( array("count" => intval($n_treenodes)) );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
