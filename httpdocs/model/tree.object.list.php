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

$parentid = isset( $_REQUEST[ 'parentid' ] ) ? intval($_REQUEST[ 'parentid' ]) : 0;
// extend it by giving a set of relationship types

if ( $pid )
{
	if ( $uid )
	{
		// instances to display
		$nid = $db->getClassId( $pid, "neuron" );
		$skid = $db->getClassId( $pid, "skeleton" );
		$gid = $db->getClassId( $pid, "group" );
		$rid = $db->getClassId( $pid, "root" );
		
		// relations
		$presyn_id = $db->getRelationId( $pid, "presynaptic_to" );
		$postsyn_id = $db->getRelationId( $pid, "postsynaptic_to" );
		$modid = $db->getRelationId( $pid, "model_of" );
		$partof_id = $db->getRelationId( $pid, "part_of" );

		if ( !$parentid ) {
			// retrieve the id of the root node for this project
			$res = $db->getResult('SELECT "ci"."id", "ci"."name" FROM "class_instance" AS "ci" 
			WHERE "ci"."project_id" = '.$pid.' AND "ci"."class_id" = '.$rid);
			
			$parid = !empty($res) ? $res[0]['id'] : 0;
			$parname = !empty($res) ? $res[0]['name'] : 'noname';
			
			$sOutput = '[';
			$ar = array(		
						'data' => array(
 							'title' => $parname,
						),
						'attr' => array('id' => 'node_'. $parid,
										'rel' => "root"),
						'state' => 'closed'								
						);
						
			$sOutput .= tv_node( $ar );
			$sOutput .= ']';
			echo $sOutput;
			return;
		}
		
		// XXX: inc case we need to show relation_names
	/*	$res = $db->getResult('SELECT "ci"."id", "ci"."name", "ci"."class_id",
		"cici"."relation_id", "cici"."class_instance_b" AS "parent", "rl"."relation_name"
		FROM "class_instance" AS "ci"
		INNER JOIN "class_instance_class_instance" AS "cici" 
			ON "ci"."id" = "cici"."class_instance_a" 
			INNER JOIN "relation" AS "rl" 
				ON "cici"."relation_id" = "rl"."id"
		WHERE "ci"."project_id" = '.$pid.' AND
		   "cici"."class_instance_b" = '.$parid.' AND
		   ("cici"."relation_id" = '.$presyn_id.'
			OR "cici"."relation_id" = '.$postsyn_id.'
			OR "cici"."relation_id" = '.$modid.'
			OR "cici"."relation_id" = '.$partof_id.')');
*/
		$res = $db->getResult('SELECT "ci"."id", "ci"."name", "ci"."class_id",
		"cici"."relation_id", "cici"."class_instance_b" AS "parent", "cl"."class_name"
		FROM "class_instance" AS "ci"
		INNER JOIN "class_instance_class_instance" AS "cici" 
			ON "ci"."id" = "cici"."class_instance_a" 
			INNER JOIN "class" AS "cl" 
				ON "ci"."class_id" = "cl"."id"
		WHERE "ci"."project_id" = '.$pid.' AND
		   "cici"."class_instance_b" = '.$parentid.' AND
		   ("cici"."relation_id" = '.$presyn_id.'
			OR "cici"."relation_id" = '.$postsyn_id.'
			OR "cici"."relation_id" = '.$modid.'
			OR "cici"."relation_id" = '.$partof_id.')');

		// loop through the array and generate children to return
		$sOutput = '[';
		foreach($res as $key => $ele) {
			$ar = array(		
						'data' => array(
 							'title' => $ele['name'],
						),
						'attr' => array('id' => 'node_'. $ele['id'],
										'rel' => $ele['class_name']),
						'state' => 'closed'								
						);
			$sOutput .= tv_node( $ar );
			
		};
		$sOutput .= ']';
		
		echo $sOutput;

	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve the tree.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not retrieve the tree.' ) );

?>