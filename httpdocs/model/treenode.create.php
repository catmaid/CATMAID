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

// add a new treenode to the database

// need to know id if element_of relation for treenode_class_instance
// isset? parentid, location, radius, confidence

// 1. add new treenode for a given skeleton id
// return: new treenode id

// 2. add new treenode and create a new skeleton
// return: new treenode id and skeleton id

$skelid = isset( $_REQUEST[ 'skeleton_id' ] ) ? intval( $_REQUEST[ 'skeleton_id' ] ) : 0;

$parentid = isset( $_REQUEST[ 'parent_id' ] ) ? intval( $_REQUEST[ 'parent_id' ] ) : 0;
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$radius = isset( $_REQUEST[ 'radius' ] ) ? floatval( $_REQUEST[ 'radius' ] ) : 0;
$confidence = isset( $_REQUEST[ 'confidence' ] ) ? floatval( $_REQUEST[ 'confidence' ] ) : 0;

if ( $pid )
{
	if ( $uid )
	{
		
		// get id for skeleton class in this project
		$skidres = $db->getResult(
		'SELECT "class"."id" FROM "class"
		WHERE "class"."project_id" = '.$pid.' AND
		"class"."class_name" = \'skeleton\'');
		$skid = !empty($skidres) ? $skidres[0]['id'] : 0;

		// get id for relation 'element_of'
		$eleres = $db->getResult(
		'SELECT "relation"."id" FROM "relation"
		WHERE "relation"."project_id" = '.$pid.' AND
		"relation"."relation_name" = \'element_of\'');
		$eleof = !empty($eleres) ? $eleres[0]['id'] : 0;
		
		if ( $skelid )
		{
			// first case
			$data = array(
					'user_id' => $uid,
					'project_id' => $pid,
					'parent_id' => $parentid,
					'location' => '('.$x.','.$y.','.$z.')',
					'radius' => $radius,
					'confidence' => $confidence);
			
			$tnid = $db->insertIntoId(
				'treenode',
				$data );

			if ( $tnid )
			{
				$data = array(
						'user_id' => $uid,
						'project_id' => $pid,
						'relation_id' => $eleof,
						'treenode_id' => $tnid,
						'class_instance_id' => $skelid 
					);
					
				$db->insertInto(
					'treenode_class_instance',
					$data );
				
				echo makeJSON( array( 'treenode_id' => $tnid) );
			}
			else {
				echo makeJSON( array( 'error' => 'Error while trying to insert treenode.' ) );
			}
		}
		else
		{
			// second case
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'class_id' => $skid,
				'name' => 'new skeleton'
				);
			
			$skelid = $db->insertIntoId(
				'class_instance',
				$data );
							
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'parent_id' => $parentid,
				'location' => '('.$x.','.$y.','.$z.')',
				'radius' => $radius,
				'confidence' => $confidence);
			
			$tnid = $db->insertIntoId(
				'treenode',
				$data );

			// update skeleton name by adding its id to the end
			$up = array('name' => 'new skeleton '.$tnid);
			$upw = 'id = '.$skelid;
			$db->update( "class_instance", $up, $upw);					
				
			if ( $tnid )
			{
				$data = array(
						'user_id' => $uid,
						'project_id' => $pid,
						'relation_id' => $eleof,
						'treenode_id' => $tnid,
						'class_instance_id' => $skelid 
					);
					
				$db->insertInto(
					'treenode_class_instance',
					$data );
				
				echo makeJSON( array( 'treenode_id' => $tnid,
									  'skeleton_id' => $skelid) );
			}
			else {
				echo makeJSON( array( 'error' => 'Error while trying to insert treenode.' ) );
			}
			
		}
		
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to add treenodes.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
	
?>