<?php
// Create the presynaptic/postsynaptic link between a treenode and a connector

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

$input_id = isset( $_REQUEST[ 'input_id' ] ) ? intval( $_REQUEST[ 'input_id' ] ) : 0;
$input_relation = isset( $_REQUEST[ 'input_relation' ] ) ? $_REQUEST[ 'input_relation' ] : 'none';
$input_type = isset( $_REQUEST[ 'input_type' ] ) ? $_REQUEST[ 'input_type' ] : 'none';

// presynaptic_to or postsynaptic_to
$input_location_relation = isset( $_REQUEST[ 'input_location_relation' ] ) ? $_REQUEST[ 'input_location_relation' ] : 'none';
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$location_id = isset( $_REQUEST[ 'location_id' ] ) ? intval( $_REQUEST[ 'location_id' ] ) : 0;
$location_type = isset( $_REQUEST[ 'location_type' ] ) ? $_REQUEST[ 'location_type' ] : 'none';
$location_relation = isset( $_REQUEST[ 'location_relation' ] ) ? $_REQUEST[ 'location_relation' ] : 'none';

if ( ! $input_id ) {
    echo json_encode( array( 'error' => 'You need to provide a valid input treenode id.' ) );
    return;
}

// the location id might be not existing, then create a new connector instance

# There must be a project id
if ( ! $pid ) {
    echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
    return;
}

# There must be a user id
if ( ! $uid ) {
    echo json_encode( array( 'error' => 'You are not logged in currently.  Please log in to be able to connect treenode and connector.' ) );
    return;
}

// retrieve class ids
$it_id = $db->getClassId( $pid, $input_type );
if(!$it_id) {
    echo json_encode( array( 'error' => 'Can not find "'.$input_type.'" class for this project' ) );
    return;
}

$lt_id = $db->getClassId( $pid, $location_type );
if(!$lt_id) {
    echo json_encode( array( 'error' => 'Can not find "'.$location_type.'" class for this project' ) );
    return;
}

// relation ids
$ir_id = $db->getRelationId( $pid, $input_relation );
if(!$ir_id) {
    echo json_encode( array( 'error' => 'Can not find "'.$input_relation.'" relation for this project' ) );
    return;
}

$ilr_id = $db->getRelationId( $pid, $input_location_relation );
if(!$ilr_id) {
    echo json_encode( array( 'error' => 'Can not find "'.$input_location_relation.'" relation for this project' ) );
    return;
}

$lr_id = $db->getRelationId( $pid, $location_relation );
if(!$lr_id) {
    echo json_encode( array( 'error' => 'Can not find "'.$location_relation.'" relation for this project' ) );
    return;
}

$elementof_id = $db->getRelationId( $pid, 'element_of');
if(!$elementof_id)  {
    echo json_encode( array( 'error' => 'Can not find "element_of" relation for this project' ) );
    return;
}


// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

  // class_instance
  // * synapseX <synapse>
  // * presynaptic terminal X <presynaptic terminal>
  if (!$location_id) { // only execute when location not yet existing
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'class_id' => $lt_id,
      'name' => $location_type
    );
    $location_type_instance_id = $db->insertIntoId('class_instance', $data );
    // rename location_type instance
    $up = array('name' => $location_type.' '.$location_type_instance_id);
    $db->update( "class_instance", $up, 'id = '.$location_type_instance_id);
  } else {
    // retrieve location type instance id
    // e.g. what is the id of the synapse
    $locationtype = $db->getResult('SELECT "lci"."class_instance_id" AS "id"
                                    FROM "connector_class_instance" AS "lci", "class_instance" AS "ci"
                                    WHERE "lci"."connector_id" = '.$location_id.' 
                                    AND "lci"."relation_id" = '.$lr_id.' 
                                    AND "ci"."id" = "lci"."class_instance_id" 
                                    AND "ci"."class_id" = '.$lt_id);
    
    if (false === $locationtype) {
      emitErrorAndExit($db, 'Failed to select class instances');
    }
    
    if (empty($locationtype)) {
      emitErrorAndExit('Location seems not to be a valid '.$location_relation.' a '.$location_type);
    } else {
      $location_type_instance_id = $locationtype[0]['id'];
    }
  }

  $data = array(
    'user_id' => $uid,
    'project_id' => $pid,
    'class_id' => $it_id,
    'name' => $input_type
    );
  $input_type_instance_id = $db->insertIntoId('class_instance', $data );
  
  if (false === $input_type_instance_id) {
    emitErrorAndExit($db, 'Failed to insert new instance.');
  }
  
  # rename location_type instance
  $up = array('name' => $input_type.' '.$input_type_instance_id);
  $q = $db->update( "class_instance", $up, 'id = '.$input_type_instance_id);
  
  if (false === $q) {
    emitErrorAndExit($db, 'Failed to update location_type instance.');
  }

  if (!$location_id) {
    #location
    # * new location L
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'location' => '('.$x.','.$y.','.$z.')'
      );
    $location_instance_id = $db->insertIntoId('connector', $data );
    
    if (false === $location_instance_id) {
      emitErrorAndExit($db, 'Failed to insert connector instance.');
    }

  } else {
    # we reuse the given location id
    $location_instance_id = $location_id;
  }
  
  # treenode_class_instance
  # * treenode model_of presynaptic terminal X
  $data = array(
    'user_id' => $uid,
    'project_id' => $pid,
    'relation_id' => $ir_id,
    'treenode_id' => $input_id,
    'class_instance_id' => $input_type_instance_id
    );
  $q = $db->insertInto('treenode_class_instance', $data );
  
  if (false === $q) {
    emitErrorAndExit($db, 'Failed to insert model_of presynaptic terminal.');
  }
  
  if (!$location_id) {
    #connector_class_instance
    #* L model_of synapseX
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'relation_id' => $lr_id,
      'connector_id' => $location_instance_id,
      'class_instance_id' => $location_type_instance_id
      );
    $db->insertInto('connector_class_instance', $data );
  }
  
  # class_instance_class_instance
  # * presynaptic terminal X presynaptic_to synapseX
  $data = array(
    'user_id' => $uid,
    'project_id' => $pid,
    'relation_id' => $ilr_id,
    'class_instance_a' => $input_type_instance_id,
    'class_instance_b' => $location_type_instance_id
    );
  $q = $db->insertInto('class_instance_class_instance', $data );
  
  if (false === $q) {
    emitErrorAndExit($db, 'Failed to insert CICI.');
  }
  
  # Create terminal part_of neuron
  # Retrieve skeleton_id (class_instance) for treenode
  $skeleton = $db->getResult('SELECT "tci"."class_instance_id" AS "id"
                              FROM "treenode_class_instance" AS "tci"
                              WHERE "tci"."relation_id" = '.$elementof_id.'
                              AND "tci"."treenode_id" = '.$input_id);
                              
  if (false === $skeleton) {
    emitErrorAndExit($db, 'Failed to select skeleton_id for treenode.');
  }

  if (empty($skeleton)) {
    emitErrorAndExit($db, 'There seems not to exist a skeleton for treenode id');
  } else {
    $skeleton_id = $skeleton[0]['id'];
  }
  
  // insert treenode-connector in geometry domain
  $data = array(
    'user_id' => $uid,
    'project_id' => $pid,
    'relation_id' => $ilr_id,
    'treenode_id' => $input_id,
    'connector_id' => $location_instance_id
    );
  $q = $db->insertInto('treenode_connector', $data );

  if (false === $q) {
    emitErrorAndExit($db, 'Fauled to insert treenode connector in geometry.');
  }

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

  echo json_encode( array( 'location_id' => $location_instance_id,
              'input_id' => $input_id,
              'connector_type_instance_id' => $location_type_instance_id
              ) );
  
} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
    
