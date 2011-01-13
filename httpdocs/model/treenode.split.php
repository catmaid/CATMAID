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

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;

if ( $pid )
{
  if ( $uid )
  {
    // split treenode
    $db->splitSkeleton( $pid, $uid, $tnid );
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to add treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>