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

// update treenode coordinates to the database

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;

if ( $pid )
{
  if ( $uid )
  {
      if ( $tnid != -1 ) {
        $treenodes = $db->getResult('SELECT "treenode"."id" AS "tnid" FROM "treenode" WHERE "treenode"."parent_id" = '.$tnid);
        // loop ofer treenodes and set to zero
        foreach($treenodes as $key => $tn) {
          $ids = $db->getResult('UPDATE "treenode" SET "parent_id" = NULL WHERE "treenode"."id" = '.$tn['tnid']);
        };
        $ids = $db->deleteFrom("treenode_class_instance", ' "treenode_class_instance"."treenode_id" = '.$tnid);
        $ids = $db->deleteFrom("treenode", ' "treenode"."id" = '.$tnid);
        echo "Removed treenode successfully.";
      }
        
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to delete treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>