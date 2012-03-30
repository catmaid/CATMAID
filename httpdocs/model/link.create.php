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

$from_id = isset( $_REQUEST[ 'from_id' ] ) ? intval( $_REQUEST[ 'from_id' ] ) : 0;
$link_type = isset( $_REQUEST[ 'link_type' ] ) ? $_REQUEST[ 'link_type' ] : 'none';
$to_id = isset( $_REQUEST[ 'to_id' ] ) ? intval( $_REQUEST[ 'to_id' ] ) : 0;

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

  $link_type_ID = $db->getRelationId( $pid, $link_type);
  if(!$link_type_ID)  { echo makeJSON( array( 'error' => 'Can not find "'.$link_type.'" relation for this project' ) ); return; }

  $q = $db->getResult(
        'SELECT treenode.skeleton_id AS skeleton_id
        FROM treenode WHERE treenode.project_id = '.$pid.' AND treenode.id = '.$from_id);

  if (false === $q) {
    emitErrorAndExit($db, 'Failed to retrieve skeleton id of treenode #'.$from_id);
  }

  if (1 != count($q)) {
    emitErrorAndExit($db, 'Found not 1 but '.count($q).' rows for treenode with ID #'.$from_id);
  }

  // update the treenode_connector table to reflect
  $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'relation_id' => $link_type_ID,
      'treenode_id' => $from_id,
      'connector_id' => $to_id,
      'skeleton_id' => $q[0]['skeleton_id']
  );
  $q = $db->insertInto('treenode_connector', $data );
    if (false === $q) {
    emitErrorAndExit($db, 'Failed to insert relation between treenode and connector.');
  }
  
  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }

  echo makeJSON( array( 'message' => 'success') );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}
  
?>
