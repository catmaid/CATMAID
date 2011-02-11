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

    $modof = 'model_of';
    $eleof = 'element_of';
    
    // relation ids
    $modof_id = $db->getRelationId( $pid, $modof );
    if(!$modof_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$modof.'" relation for this project' ) ); return; }

    $eleof_id = $db->getRelationId( $pid, $eleof );
    if(!$eleof_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$eleof.'" relation for this project' ) ); return; }

    $skid = $db->getClassId( $pid, "skeleton" );
    if(!$skid) { echo makeJSON( array( '"error"' => 'Can not find "skeleton" class for this project' ) ); return; }
 
    // retrieve class_instances for the treenode, should only be one id
    //$ci_id = $db->getClassInstanceForTreenode( $pid, $tnid, 'model_of');
    // delete the model of, assume only one
    //$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$ci_id[0]['class_instance_id']);
    
    // retrieve skeleton id
    $sk = $db->getClassInstanceForTreenode( $pid, $tnid, 'element_of');
    if(!empty($sk)) { $sk_id = $sk[0]['class_instance_id']; } else {
      echo makeJSON( array( '"error"' => 'Can not find skeleton for this treenode.' ) ); return; }

    // retrieve neuron id of the skeleton
    $neu = $db->getCIFromCI( $pid, $sk_id, 'model_of' );
    if(!empty($neu)) { $neu_id = $neu[0]['id']; } else {
      echo makeJSON( array( '"error"' => 'Can not find neuron for the skeleton.' ) ); return; }
      
    
    $childrentreenodes = $db->getTreenodeChildren( $pid, $tnid );
    // for each children, set to root and create a new skeleton
    foreach($childrentreenodes as $key => $tn) {
      // set to root
      $ids = $db->getResult('UPDATE "treenode" SET "parent_id" = NULL WHERE "treenode"."id" = '.$tn['tnid']);
      // create new skeleton that will be used for each children treenode
      // which becomes the root of a new skeleton
      $data = array(
        'user_id' => $uid,
        'project_id' => $pid,
        'class_id' => $skid,
        'name' => 'skeleton'
        );
      $skelid = $db->insertIntoId('class_instance', $data );
      // update skeleton name by adding its id to the end
      $up = array('name' => 'skeleton '.$skelid);
      $upw = 'id = '.$skelid;
      $db->update( "class_instance", $up, $upw);
      
      // attach skeleton to neuron
      $data = array(
          'user_id' => $uid,
          'project_id' => $pid,
          'relation_id' => $modof_id,
          'class_instance_a' => $skelid,
          'class_instance_b' => $neu_id 
        );
      $db->insertInto('class_instance_class_instance', $data );
      
      // update element_of of sub-skeleton
      // retrieve all treenode ids by traversing the subtree
      $allchi = $db->getAllTreenodeChildrenRecursively( $pid, $tn['tnid'] );
      foreach($allchi as $key => $chitn) {
        // update the element_of to the newly created skeleton
        // and the new root treenode
        // XXX should use $chitn['id'] and $tn['tnid']
        $ids = $db->getResult('UPDATE "treenode_class_instance" SET "class_instance_id" = '.$skelid.' WHERE
        "treenode_class_instance"."treenode_id" = '.$chitn['id'].' AND
        "treenode_class_instance"."relation_id" = '.$eleof_id);
      };
    };
    
    echo json_encode( array( 'message' => 'success' ) );
    
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to add treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>