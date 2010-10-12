<?php

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

if ( $pid )
{
	if ( $uid )
	{
		
		// instances to display
		$nid = $db->getClassId( $pid, "neuron" );
		$skid = $db->getClassId( $pid, "skeleton" );
		$ngid = $db->getClassId( $pid, "neurongroup" );
		$gid = $db->getClassId( $pid, "group" );
		$rid = $db->getClassId( $pid, "root" );
		
		// relations
		$presyn_id = $db->getRelationId( $pid, "presynaptic_to" );
		$postsyn_id = $db->getRelationId( $pid, "postsynaptic_to" );
		$modid = $db->getRelationId( $pid, "model_of" );
		$partof_id = $db->getRelationId( $pid, "part_of" );

		
		$ret = $db->getTree( "class_instance_class_instance", "117", $idName = 'id', $pidName = 'class_instance_b', $cond = '1' );
			
		echo $ret;
		
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve the tree.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not retrieve the tree.' ) );

?>