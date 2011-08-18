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


$from_id = isset( $_REQUEST[ 'from_id' ] ) ? intval( $_REQUEST[ 'from_id' ] ) : 0;
$to_id = isset( $_REQUEST[ 'to_id' ] ) ? intval( $_REQUEST[ 'to_id' ] ) : 0;

if ( $pid )
{
  if ( $uid )
  {
    $eleof = $db->getRelationId( $pid, "element_of" );
    if(!$eleof) { echo makeJSON( array( 'error' => 'Can not find "element_of" relation for this project' ) ); return; }
    
    // assume that target to is parent, so only have to set parent to from_id
    
    // retrieve skeleton id of from_id treenode
       $res = $db->getClassInstanceForTreenode( $pid, $from_id, "element_of" );
       if(!empty($res)) {
          $skelid_from = $res[0]['class_instance_id'];
        } else {
          echo makeJSON( array( 'error' => 'Can not find skeleton for from-treenode.' ) ); return; }

    // retrieve skeleton id of to_id treenode
       $res = $db->getClassInstanceForTreenode( $pid, $to_id, "element_of" );
       if(!empty($res)) {
          $skelid_to = $res[0]['class_instance_id'];
        } else {
          echo makeJSON( array( 'error' => 'Can not find skeleton for to-treenode.' ) ); return; }
        
    // check if the skeletons are the same, send an error because we do not want to introduce loops
    if($skelid_from == $skelid_to) {
        echo makeJSON( array( 'error' => 'Please do not join treenodes of the same skeleton. This introduces loops.' ) ); return;
    }
        
    // update element_of relationships of target skeleton
    // the target skeleton is removed and its treenode assume the skeleton id of the from-skeleton
    $ids = $db->update("treenode_class_instance", array("class_instance_id" => $skelid_from) ,' "class_instance_id" = '.$skelid_to.' AND 
           "relation_id" = '.$eleof);
            
      /*
       $tnlist = array();
       $res = $db->getTreenodeIdsForSkeleton( $pid, $skelid_to );
       if(!empty($res)) {
          
          foreach($res as $row)
          {
            $tnlist[] = $row['id'];
          }
          // update
          // AND "treenode_id" IN ('.implode(",", $tnlist).')');
          

          
        } else {
          echo makeJSON( array( 'error' => 'Can not retrieve any treenodes for skeleton.' ) ); return; }
    */
    
    // remove skeleton of to_id (should delete part of to neuron by cascade, 
    // leaving the parent neuron dangeling in the object tree)
    $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$skelid_to);
    
    // update the parent of to_id treenode
    $ids = $db->update("treenode", array("parent_id" => $from_id) ,' "treenode"."id" = '.$to_id);

      echo json_encode( array('message' => 'success', 'fromid' => $from_id, 'toid' => $to_id) );  
          
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to join treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
