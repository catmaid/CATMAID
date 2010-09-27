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
		
		// instances
				
		// get id for neuron class in this project
		$neures = $db->getResult(
		'SELECT "class"."id" FROM "class"
		WHERE "class"."project_id" = '.$pid.' AND
		"class"."class_name" = \'neuron\'');
		$nid = !empty($neures) ? $nid = $neures[0]['id'] : 0;
		
		// get id for skeleton class in this project
		$skidres = $db->getResult(
		'SELECT "class"."id" FROM "class"
		WHERE "class"."project_id" = '.$pid.' AND
		"class"."class_name" = \'skeleton\'');
		$skid = !empty($skidres) ? $skid = $skidres[0]['id'] : 0;
		
		// relations
		
		// get id for presynaptic_to
		$presyn = $db->getResult(
		'SELECT "relation"."id" FROM "relation"
		WHERE "relation"."project_id" = '.$pid.' AND
		"relation"."relation_name" = \'presynaptic_to\'');
		$presyn_id = !empty($presyn) ? $presyn[0]['id'] : 0;
		
		// get id for postsynaptic_to
		$postsyn = $db->getResult(
		'SELECT "relation"."id" FROM "relation"
		WHERE "relation"."project_id" = '.$pid.' AND
		"relation"."relation_name" = \'postsynaptic_to\'');
		$postsyn_id = !empty($postsyn) ? $postsyn[0]['id'] : 0;
		
		// get id for relation 'model_of'
		$modelofres = $db->getResult(
		'SELECT "relation"."id" FROM "relation"
		WHERE "relation"."project_id" = '.$pid.' AND
		"relation"."relation_name" = \'model_of\'');
		$modid = !empty($modelofres) ? $modelofres[0]['id'] : 0;
		
		
		// retrieve all the skeletons for a particular project
		$skel = $db->getResultKeyedById(
		'SELECT "ci"."id" as "id", "ci"."name" as "name" FROM "class_instance" AS "ci"
		WHERE "ci"."project_id" = '.$pid.' AND
		"ci"."class_id" = '.$skid.'', 'id');
		
		// retrieve all the neurons for a particular project
		$neurons = $db->getResultKeyedById(
		'SELECT "ci"."id" as "id", "ci"."name" as "name" FROM "class_instance" AS "ci"
		WHERE "ci"."project_id" = '.$pid.' AND
		"ci"."class_id" = '.$nid.'', 'id');

		// retrieve all skeleton model_of neuron relations
		$skel_m_neur = $db->getResult(
		'SELECT "cici"."class_instance_a" as "a", "cici"."class_instance_b" as "b" 
		FROM "class_instance_class_instance" AS "cici"
		WHERE "cici"."project_id" = '.$pid.' AND
		"cici"."relation_id" = '.$modid
		);
		
		$narr = array();
		foreach( $neurons as $neur ) {
			
			// generate skeleton children for a particular neuron
			// retrieve model_of relation
			$skarr = array();
			foreach($skel_m_neur as $rel) {
				if( $rel['b'] == $neur['id'] )
				{
					// retrieve skeleton with id a
					if( array_key_exists( $rel['a'], $skel) )
					{
						// add skeleton
						$skarr[] = array(
							'title' => $skel[$rel['a']]['name'],
							'type' => 'skeleton',
							'icon' => 'folder',
							'attr' => array('id' => 'node_'. $skel[$rel['a']]['id']),
							'children' => array()
						);
					}
				}
			}
			
			$narr[] = array(
				'title' => $neur['name'],
				'type' => 'neuron',
				'icon' => 'folder',
			 	'attr' => array('id' => 'node_'. $neur['id']),
				'children' => array(
							  array(
									'title' => 'model_of',
									'type' => 'relation',
									'icon' => '',
									'children' => $skarr),
							  /*
							  array(
									'title' => 'presynaptic_to',
									'type' => '',
									'icon' => '',
									'children' => array()),*/
							  )
			);
			
		}
		
		// generate big array
		$bigarr = array('title' => 'Root',
								   'type' => 'origin',
								   'icon' => '',
								   'attr' => array('id' => 'node_0'),
								   'children' => $narr);
		
		$sOutput = '[';
		$sOutput .= tv_node( $bigarr );
		$sOutput .= ']';
		echo $sOutput;
		
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve skeletons.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not retrieve skeletons.' ) );

?>