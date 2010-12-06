<?php

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

// update treenode coordinates to the database

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$radius = isset( $_REQUEST[ 'radius' ] ) ? floatval( $_REQUEST[ 'radius' ] ) : 0;
$confidence = isset( $_REQUEST[ 'confidence' ] ) ? floatval( $_REQUEST[ 'confidence' ] ) : 0;

if ( $pid )
{
  if ( $uid )
  {
      if ( $tnid != -1 ) {
        $ids = $db->update("treenode", array('location' => '('.$x.','.$y.','.$z.')' ), '"treenode"."id" = '.$tnid);
        echo makeJSON( array( 'updated_treenode_id' => $ids ) );
      }
        
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to update treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>