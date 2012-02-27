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
checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED | $EDIT_ANY_ALLOWED);


$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$confi = isset( $_REQUEST[ 'confidence' ] ) ? floatval( $_REQUEST[ 'confidence' ] ) : 5;

$ci_type = isset( $_REQUEST[ 'class_instance_type' ] ) ? $_REQUEST[ 'class_instance_type' ] : 'none';
$ci_relation = isset( $_REQUEST[ 'class_instance_relation' ] ) ? $_REQUEST[ 'class_instance_relation' ] : 'none';
  

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

  $cit_id = $db->getClassId( $pid, $ci_type );
  if(!$cit_id) { echo makeJSON( array( 'error' => 'Can not find "'.$ci_type.'" class for this project' ) ); return; }
  
  // relation ids
  $cir_id = $db->getRelationId( $pid, $ci_relation );
  if(!$cir_id) { echo makeJSON( array( 'error' => 'Can not find "'.$ci_relation.'" relation for this project' ) ); return; }

  $data = array(
    'user_id' => $uid,
    'project_id' => $pid,
    'location' => '('.$x.','.$y.','.$z.')',
    'confidence' => $confi
    );
  $connector_id = $db->insertIntoId('connector', $data );
  
  if (false === $connector_id) {
    emitErrorAndExit($db, 'Fauled to insert new connector');
  }
  
  // create class instance
  $data = array(
    'user_id' => $uid,
    'project_id' => $pid,
    'class_id' => $cit_id,
    'name' => $ci_type
    );
  $class_instance_id = $db->insertIntoId('class_instance', $data );
  
  if (false === $class_instance_id) {
    emitErrorAndExit($db, 'Failed to insert instance of new connector.');
  }

  // rename it
  $up = array('name' => $ci_type.' '.$class_instance_id);
  $q = $db->update( "class_instance", $up, 'id = '.$class_instance_id);
  
  if (false === $q) {
    emitErrorAndExit($db, 'Failed to rename connector instance.');
  }
    
  // create connector_class_instance
  $data = array(
    'user_id' => $uid,
    'project_id' => $pid,
    'relation_id' => $cir_id,
    'connector_id' => $connector_id,
    'class_instance_id' => $class_instance_id
    );
  $q = $db->insertInto('connector_class_instance', $data );
  
  if (false === $q) {
    emitErrorAndExit($db, 'Failed to create relation connector_class_instance.');
  }

  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }

  echo makeJSON( array( 'connector_id' => $connector_id,
              'class_instance_id' => $class_instance_id
              ) );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}
    
?>
