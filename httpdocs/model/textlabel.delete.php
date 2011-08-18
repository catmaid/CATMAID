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
$tid = isset( $_REQUEST[ 'tid' ] ) ? intval( $_REQUEST[ 'tid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;

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

# 3. There must be a textlabel id
if ( ! $tid ) {
    echo json_encode( array( 'error' => 'No treenode id provided.' ) );
	return;
}


// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

  $canEdit = $db->getResult(
    'SELECT	"textlabel"."id" AS "tid"
    
      FROM "textlabel" INNER JOIN "project"
        ON "project"."id" = "textlabel"."project_id" INNER JOIN "project_user"
          ON "project"."id" = "project_user"."project_id"
          
      WHERE "textlabel"."id" = '.$tid.' AND
        "project_user"."user_id" = '.$uid.' AND
        "project_user"."project_id" = '.$pid );
  
  if (false === $canEdit) {
    emitErrorAndExit($db, 'Could not select textlabels for treenode #'.$tid);
  }
  
  if ( $canEdit )
  {
/*
    $db->deleteFrom(
      'textlabel_location',
      '"textlabel_id" = '.$tid.' AND
      abs( ("location")."x" - '.$x.' ) < 0.001 AND
      abs( ("location")."y" - '.$y.' ) < 0.001 AND
      abs( ("location")."z" - '.$z.' ) < 0.001' );
*/
    $q = $db->update(
      'textlabel_location',
      array( 'deleted' => true ),
      '"textlabel_id" = '.$tid.' AND
      abs( ("location")."x" - '.$x.' ) < 0.001 AND
      abs( ("location")."y" - '.$y.' ) < 0.001 AND
      abs( ("location")."z" - '.$z.' ) < 0.001' );
      
    if (false === $q) {
      emitErrorAndExit($db, 'Could not update textlabel location.');
    }
                                            
    $l = $db->countEntries(
      'textlabel_location',
      '"textlabel_id" = '.$tid.' AND NOT "deleted"' );
      
    if (false === $l) {
      emitErrorAndExit($db, 'Could not count entries.');
    }
    
    if ( $l < 1 ) {
      $q = $db->update(
        'textlabel',
        array( 'deleted' => true ),
        '"id" = '.$tid );
        
      if (false === $q) {
        emitErrorAndExit($db, 'Could not delete labels for treenode #'.$tid);
      }
    }

    // Success:
    echo " "; //!< one char for Safari, otherwise its xmlHttp.status is undefined...

  } else {  
    emitErrorAndExit($db, 'You do not have permissions to edit this label.');
  }

  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
