<?php

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

$from_id = isset( $_REQUEST[ 'from_id' ] ) ? intval( $_REQUEST[ 'from_id' ] ) : 0;
$from_relation = isset( $_REQUEST[ 'from_relation' ] ) ? $_REQUEST[ 'from_relation' ] : 'none';

$link_type = isset( $_REQUEST[ 'link_type' ] ) ? $_REQUEST[ 'link_type' ] : 'none';

$to_id = isset( $_REQUEST[ 'to_id' ] ) ? intval( $_REQUEST[ 'to_id' ] ) : 0;
$to_relation = isset( $_REQUEST[ 'to_relation' ] ) ? $_REQUEST[ 'to_relation' ] : 'none';


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


  // relation ids
  $link_type_ID = $db->getRelationId( $pid, $link_type);
  if(!$link_type_ID)  { echo makeJSON( array( 'error' => 'Can not find "'.$link_type.'" relation for this project' ) ); return; }

  $elementof_id = $db->getRelationId( $pid, 'element_of');
  if(!$elementof_id)  { echo makeJSON( array( 'error' => 'Can not find "element_of" relation for this project' ) ); return; }
  
  $partof_id = $db->getRelationId( $pid, 'part_of');
  if(!$partof_id)  { echo makeJSON( array( 'error' => 'Can not find "part_of" relation for this project' ) ); return; }

  // case distinctions for links
  if ($link_type == "presynaptic_to") {
    $from_class = "presynaptic terminal";
    $to_class = "synapse";
       
    // check if from has classinstance, if not, create it
    $res = $db->getClassInstanceForTreenode( $pid, $from_id, $from_relation );
    
    if (false === $res) {
      emitErrorAndExit($db, 'Failed to get instance for treenode.');
    }
    
    if (!empty($res)) {
      $from_ci_id = $res[0]['class_instance_id'];
    } else {
      // create it
      $from_ci_id = $db->createClassInstanceForTreenode( $pid, $uid, $from_id, "model_of", $from_class );
      
      if (false === $from_ci_id) {
        emitErrorAndExit($db, 'Failed to create instance of treenode.');
      }
    }

    // check if to has classinstance, if not, create it
    $res = $db->getClassInstanceForConnector( $pid, $to_id, $to_relation );
    
    if (false === $res) {
      emitErrorAndExit($db, 'Failed to get instance of connector.');
    }
    
    if (!empty($res)) {
      $to_ci_id = $res[0]['class_instance_id'];
    } else {
      // create it
      $to_ci_id = $db->createClassInstanceForConnector( $pid, $uid, $to_id, "model_of", $to_class );
      if (false === $to_ci_id) {
        emitErrorAndExit($db, 'Failed to create instance of connector.');
      }
    }
    
    // if from is treenode, retrieve skeleton and connect with part_of
     $res = $db->getClassInstanceForTreenode( $pid, $from_id, "element_of" );
     
     if (false === $res) {
       emitErrorAndExit($db, 'Failed to get instance of treenode.');
     }
     
     if(!empty($res)) {
        $skelid = $res[0]['class_instance_id'];
        $data = array(
          'user_id' => $uid,
          'project_id' => $pid,
          'relation_id' => $partof_id,
          'class_instance_a' => $from_ci_id,
          'class_instance_b' => $skelid
          );
        $q = $db->insertInto('class_instance_class_instance', $data );
        if (false === $q) {
          emitErrorAndExit($db, 'Failed to create relation between treenode and connector instances.');
        }
     } else {
        echo makeJSON( array( 'error' => 'Can not find skeleton for this treenode.' ) );
        return;
     }

    // connect the two
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'relation_id' => $link_type_ID,
      'class_instance_a' => $from_ci_id,
      'class_instance_b' => $to_ci_id
      );
    $q = $db->insertInto('class_instance_class_instance', $data );
    
    if (false === $q) {
      emitErrorAndExit($db, 'Failed to create instance of relation.');
    }

    $treenode_id = $from_id;
    $connector_id = $to_id;

  } else if ($link_type == "postsynaptic_to") {
     $from_class = "synapse";
     $to_class = "postsynaptic terminal";

    // check if from has classinstance, if not, create it
    $res = $db->getClassInstanceForConnector( $pid, $from_id, $from_relation );
    
    if (false === $res) {
      emitErrorAndExit($db, 'Failed to get connector class.');
    }
    
    if(!empty($res)) {
      $from_ci_id = $res[0]['class_instance_id'];
    } else {
      // create it
      $from_ci_id = $db->createClassInstanceForConnector( $pid, $uid, $from_id, "model_of", $from_class );
      if (false === $from_ci_id) {
        emitErrorAndExit($db, 'Failed to create instance of connector.');
      }
    }

    // check if to has classinstance, if not, create it
    $res = $db->getClassInstanceForTreenode( $pid, $to_id, $to_relation );
    
    if (false === $res) {
      emitErrorAndExit($db, 'Failed to get instance of treenode.');
    }
    
    if(!empty($res)) {
      $to_ci_id = $res[0]['class_instance_id'];
    } else {
      // create it
      $to_ci_id = $db->createClassInstanceForTreenode( $pid, $uid, $to_id, "model_of", $to_class );
      if (false === $to_ci_id) {
        emitErrorAndExit($db, 'Failed to create instance of treenode.');
      }
    }

     // if to is treenode, retrieve skeleton and connect with part_of
     $res = $db->getClassInstanceForTreenode( $pid, $to_id, "element_of" );
     if (false === $res) {
       emitErrorAndExit($db, 'Failed to get instance of treenode.');
     }
     if(!empty($res)) {
        $skelid = $res[0]['class_instance_id'];
        $data = array(
          'user_id' => $uid,
          'project_id' => $pid,
          'relation_id' => $partof_id,
          'class_instance_a' => $to_ci_id,
          'class_instance_b' => $skelid
          );
        $q = $db->insertInto('class_instance_class_instance', $data );
        if (false === $q) {
          emitErrorAndExit($db, 'Failed to insert part_of relation between post and skeleton.');
        }
      } else {
        echo makeJSON( array( 'error' => 'Can not find skeleton for this treenode.' ) ); return; }

    // connect the two, take care, it is
    // presynaptic terminal presynaptic_to synapse
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'relation_id' => $link_type_ID,
      'class_instance_a' => $to_ci_id,
      'class_instance_b' => $from_ci_id
      );
    $q = $db->insertInto('class_instance_class_instance', $data );
    
    if (false === $q) {
      emitErrorAndExit($db, 'Failed to insert relation between pre and pre-syn.');
    }

    $treenode_id = $to_id;
    $connector_id = $from_id;

  }

  // update the treenode_connector table to reflect
  $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'relation_id' => $link_type_ID,
      'treenode_id' => $treenode_id,
      'connector_id' => $connector_id
  );
  $q = $db->insertInto('treenode_connector', $data );
  
  if (false === $q) {
    emitErrorAndExit($db, 'Failed to insert relation between treenode and connector.');
  }
  
  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }

  echo makeJSON( array( 'from_ci' => $from_ci_id,
              'to_ci' => $to_ci_id,
              ) );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}
  
?>
