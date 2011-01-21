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

// retrieve treenode id, when set retrieve skeleton id
$type = isset( $_REQUEST[ 'type' ] ) ? $_REQUEST[ 'type' ]  : "none";
$tnid = isset( $_REQUEST[ 'id' ] ) ? intval( $_REQUEST[ 'id' ] ) : 0;
$value = isset( $_REQUEST[ 'value' ] ) ? intval( $_REQUEST[ 'value' ] ) : 0;

if ( $pid )
{
  if ( $uid )
  {
    
    // update confidence
    if($type == "confidence") {
      // update confidence value for treenode
      $db->update(
        'treenode',
        array(
          'confidence' => $value,
          'user_id' => $uid), // update the user who changed the confidence
        '"project_id" = '.$pid.' AND "id" = '.$tnid );
      // return value
      echo $value;
    }

  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to modify treenode table.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not retrieve treenodes.' ) );


?>