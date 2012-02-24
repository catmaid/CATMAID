<?php
// should delete the class instance, the connector, and all pre and post
// synaptic links associated to terminals. if the links are the only ones
// one can delete the terminal instances as well.
// assume that one treenode can only be of one termial type

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
$ci_type = isset( $_REQUEST[ 'class_instance_type' ] ) ? $_REQUEST[ 'class_instance_type' ] : 'none';


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
canEditOrExit($db, $uid, $pid);

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
  $cit_id = $db->getClassId( $pid, $ci_type );
  if(!$cit_id) { echo makeJSON( array( 'error' => 'Can not find "'.$ci_type.'" class for this project' ) ); return; }
  
  // relation ids
  $cir_id = $db->getRelationId( $pid, 'model_of' );
  if(!$cir_id) { echo makeJSON( array( 'error' => 'Can not find "model_of" relation for this project' ) ); return; }

  // for labels, only remove the relation
  $lab_id = $db->getRelationId( $pid, 'labeled_as' );
  if(!$lab_id) { echo makeJSON( array( 'error' => 'Can not find "labeled_as" relation for this project' ) ); return; }
     
  // retrieve class instance id
  $classin = $db->getResult('SELECT "cci"."class_instance_id" AS "id" FROM "connector_class_instance" AS "cci"
   WHERE "cci"."relation_id" = '.$cir_id.' AND "cci"."connector_id" = '.$cid.' AND 
   "cci"."project_id" = '.$pid);
   
  if (false === $classin) {
    emitErrorAndExit($db, 'Failed to select instance ID.');
  }

  if(!empty($classin)) { $classin_id = $classin[0]['id']; } else {
    echo makeJSON( array( 'error' => 'Can not find class_instance of "'.$ci_type.'" class for this project' ) );
    return;
  }
   
    // XXX: correct deletion of associated terminals
    $presyn_id = $db->getRelationId( $pid, "presynaptic_to" );
    if(!$presyn_id) { echo makeJSON( array( 'error' => 'Can not find "presynaptic_to" relation for this project' ) ); return; }
    $postsyn_id = $db->getRelationId( $pid, "postsynaptic_to" );
    if(!$postsyn_id) { echo makeJSON( array( 'error' => 'Can not find "postsynaptic_to" relation for this project' ) ); return; }

    // retrieve and delete pre and post terminal
    $conin = $db->getResult('SELECT "cici"."class_instance_a" AS "id" FROM "class_instance_class_instance" AS "cici"
     WHERE ("cici"."relation_id" = '.$presyn_id.' OR "cici"."relation_id" = '.$postsyn_id.')
     AND "cici"."class_instance_b" = '.$classin_id.' AND
     "cici"."project_id" = '.$pid);

    if (false === $conin) {
      emitErrorAndExit($db, 'Failed to select pre and post terminals.');
    }

    // delete connector
    $ids = $db->deleteFrom("connector", ' "connector"."id" = '.$cid);

    if (false === $ids) {
      emitErrorAndExit($db, 'Failed to delete connector #'.$cid);
    }

    // delete connector from geometry domain
    $ids = $db->deleteFrom("treenode_connector", ' "connector_id" = '.$cid);

    if (false === $ids) {
      emitErrorAndExit($db, 'Failed to delete connector #'.$cid.' from geometry domain');
    }

    // delete class_instance
    $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$classin_id);

    if (false === $ids) {
      emitErrorAndExit($db, 'Failed to delete connector #'.$cid.' class instance');
    }

    // delete class_instance
    if(!empty($conin)) {
      foreach($conin as $key => $tn) {
         $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$tn['id']);
         if (false === $ids) {
           emitErrorAndExit($db, 'Failed to delete connector class instance #'.$tn['id']);
         }
      }
    }

    // delete label relationships without deleting the class_instance labels
    $ids = $db->deleteFrom("treenode_class_instance", ' "treenode_class_instance"."treenode_id" = '.$classin_id.' AND
    "treenode_class_instance"."relation_id" = '.$lab_id);

    if (false === $ids) {
      emitErrorAndExit($db, 'Failed to delete label relationships with connector.');
    }


  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }
  
  echo makeJSON( array( 'result' => "Removed connector and class_instances",
              'connector_id' => $cid,
              'class_instance_id' => $classin_id
              ) );
  
} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
