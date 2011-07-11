<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );
include_once( 'utils.php' );

$db =& getDB( 'write' );
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$text = isset( $_REQUEST[ 'text' ] ) ? $_REQUEST[ 'text' ] : 'Edit this text...';
$type = isset( $_REQUEST[ 'type' ] ) ? $_REQUEST[ 'type' ] : 'text';
if ( $type != 'bubble' ) $type = 'text';
$r = isset( $_REQUEST[ 'r' ] ) ? floatval( $_REQUEST[ 'r' ] ) : 1;
$g = isset( $_REQUEST[ 'g' ] ) ? floatval( $_REQUEST[ 'g' ] ) : 0.5;
$b = isset( $_REQUEST[ 'b' ] ) ? floatval( $_REQUEST[ 'b' ] ) : 0;
$a = isset( $_REQUEST[ 'a' ] ) ? floatval( $_REQUEST[ 'a' ] ) : 1;
$fontname = isset( $_REQUEST[ 'fontname' ] ) ? $_REQUEST[ 'fontname' ] : false;
$fontstyle = isset( $_REQUEST[ 'fontstyle' ] ) ? $_REQUEST[ 'fontstyle' ] : false;
$fontsize = isset( $_REQUEST[ 'fontsize' ] ) ? intval( $_REQUEST[ 'fontsize' ] ) : false;
$scaling = ( isset( $_REQUEST[ 'scaling' ] ) && $_REQUEST[ 'scaling' ] ) ? true : false;


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

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

  $entryCount = $db->countEntries(
    'project_user',
    '"project_id" = '.$pid.' AND "user_id" = '.$uid );

  if (false === $entryCount) {
    emitErrorAndExit()
  }

  if ( $entryCount > 0 )
  {
    # TODO
    emitErrorAndExit($db, 'project.create.php is NOT operative yet.');

 
    if (! $db->commit() ) {
      emitErrorAndExit( $db, 'Failed to commit split!' );
    }

    makeJSON( array( 'tid' => $tid ) );
 
  } else {
    emitErrorAndExit($db, 'You lack permissions to create a project.');
  }

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}


?>
