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

$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$confi = isset( $_REQUEST[ 'confidence' ] ) ? floatval( $_REQUEST[ 'confidence' ] ) : 5;

$ci_type = isset( $_REQUEST[ 'class_instance_type' ] ) ? $_REQUEST[ 'class_instance_type' ] : 'none';
$ci_relation = isset( $_REQUEST[ 'class_instance_relation' ] ) ? $_REQUEST[ 'class_instance_relation' ] : 'none';

if ( $pid )
{
  if ( $uid )
  {
    $cit_id = $db->getClassId( $pid, $ci_type );
    if(!$cit_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$ci_type.'" class for this project' ) ); return; }
    
    // relation ids
    $cir_id = $db->getRelationId( $pid, $ci_relation );
    if(!$cir_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$ci_relation.'" relation for this project' ) ); return; }

    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'location' => '('.$x.','.$y.','.$z.')',
      'confidence' => $confi
      );
    $connector_id = $db->insertIntoId('connector', $data );
    
    // create class instance
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'class_id' => $cit_id,
      'name' => $ci_type
      );
    $class_instance_id = $db->insertIntoId('class_instance', $data );
    // rename it
    $up = array('name' => $ci_type.' '.$class_instance_id);
    $db->update( "class_instance", $up, 'id = '.$class_instance_id); 
      
    // create connector_class_instance
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'relation_id' => $cir_id,
      'connector_id' => $connector_id,
      'class_instance_id' => $class_instance_id
      );
    $db->insertInto('connector_class_instance', $data );
    
    echo makeJSON( array( '"connector_id"' => $connector_id,
                '"class_instance_id"' => $class_instance_id
                ) );
    
  } 
}
    