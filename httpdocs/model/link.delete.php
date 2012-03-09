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

  // relation ids
  $cir_id = $db->getRelationId( $pid, 'model_of' );
  if(!$cir_id) { echo makeJSON( array( 'error' => 'Can not find "model_of" relation for this project' ) ); return; }

  // retrieve class instance id
  $classin = $db->getResult('SELECT "id" FROM "treenode_class_instance" AS "tci"
   WHERE "tci"."relation_id" = '.$cir_id.' AND "tci"."treenode_id" = '.$tid.' AND
   "tci"."project_id" = '.$pid);

  if (false === $classin) {
    emitErrorAndExit($db, 'Failed to select instance ID.');
  }

  if(!empty($classin)) { $classin_id = $classin[0]['id']; } else {
    echo makeJSON( array( 'error' => 'Can not find class_instance of for treenode in this project' ) );
    return;
  }

  // delete connector from geometry domain
  $ids = $db->deleteFrom("treenode_connector", ' "connector_id" = '.$cid.' AND "treenode_id" = '.$tid);

  if (false === $ids) {
     emitErrorAndExit($db, 'Failed to delete connector #'.$cid.' from geometry domain');
  }

  // remove class_instance
  $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$classin_id);

  if (false === $ids) {
     emitErrorAndExit($db, 'Failed to delete class_instance '.$classin_id.' for treenode.');
  }

  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }

  echo makeJSON( array( 'result' => "Removed treenode to connector link") );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
