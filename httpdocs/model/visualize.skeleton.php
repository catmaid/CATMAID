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

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : 0;

if ( $pid )
{
  if ( $uid )
  {
    
    // retrieve skeleton for treenode
    $res = $db->getClassInstanceForTreenode( $pid, $tnid, "element_of");
    
    if(!empty($res)) { $skelid = $res[0]['class_instance_id']; } 
    else {
      echo makeJSON( array( '"error"' => 'There seems not to exist a skeleton for treenode id '));
      return;
    }
    
    $res = $db->getTreenodeIdsForSkeleton($pid, $skelid);
    
    // XXX retrieve treenodes with parent and location information
    
    echo json_encode($res);
    
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not retrieve synapses.' ) );

?>
