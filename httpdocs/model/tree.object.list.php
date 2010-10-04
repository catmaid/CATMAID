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
		$nid = !empty($neures) ? $neures[0]['id'] : 0;
		
		// get id for skeleton class in this project
		$skidres = $db->getResult(
		'SELECT "class"."id" FROM "class"
		WHERE "class"."project_id" = '.$pid.' AND
		"class"."class_name" = \'skeleton\'');
		$skid = !empty($skidres) ? $skidres[0]['id'] : 0;
		
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
		// leftover skeleton
		$loverske = array();
		foreach( $neurons as $neur ) {
			
			// outgoing synapses
			$insyn = array();
			// incoming synapses
			$outsyn = array();
			
			// generate skeleton children for a particular neuron
			// retrieve model_of relation
			$skarr = array();
			
			foreach($skel_m_neur as $rel) {
				// model of class_instance b should be a neuron
				if( $rel['b'] == $neur['id'] )
				{
					// retrieve skeleton with id a
					if( array_key_exists( $rel['a'], $skel) )
					{
						// add skeleton
						$skarr[] = array(
							'data' => array(
								'title' => $skel[$rel['a']]['name'],
							),
							'attr' => array('id' => 'node_'. $skel[$rel['a']]['id'],
											'rel' => 'skeleton'),
							'children' => array()
						);
						
					// retrieve all treenodes for skeleton
					// query outgoing synapses for skeleton id
					$incom_res = $db->getResult(
					'SELECT "tci2"."class_instance_id" as "id", "ci"."name" as "name"
					FROM "treenode_class_instance" as "tci", "treenode_class_instance" as "tci2",
					"class_instance" as "ci" WHERE "tci"."class_instance_id" = '.$skel[$rel['a']]['id'].' AND
					"tci"."treenode_id" = "tci2"."treenode_id" AND "tci2"."relation_id" = '.$presyn_id.'
					AND "ci"."id" = "tci2"."class_instance_id" AND "tci2"."project_id" = '.$pid);
					
					foreach($incom_res as $val)
					{
						$insyn[] = array(		
							'data' => array(
	 							'title' => $val['name'],
							),
							'attr' => array('id' => 'node_'. $val['id'],
											'rel' => 'synapse'),								
							'children' => array()
							);
					}
					
					// retrieve all treenodes for skeleton
					// query incoming synapses for skeleton id
					$outgo_res = $db->getResult(
					'SELECT "tci2"."class_instance_id" as "id", "ci"."name" as "name"
					FROM "treenode_class_instance" as "tci", "treenode_class_instance" as "tci2",
					"class_instance" as "ci" WHERE "tci"."class_instance_id" = '.$skel[$rel['a']]['id'].' AND
					"tci"."treenode_id" = "tci2"."treenode_id" AND "tci2"."relation_id" = '.$postsyn_id.'
					AND "ci"."id" = "tci2"."class_instance_id" AND "tci2"."project_id" = '.$pid);
					
					foreach($outgo_res as $val)
					{
						$outsyn[] = array(		
							'data' => array(
	 							'title' => $val['name'],
							),
							'attr' => array('id' => 'node_'. $val['id'],
											'rel' => 'synapse'),							
							'children' => array()
							);
					}
					
					// unset the worked on skeleton
					unset($skel[$rel['a']]);
					
					} // end if
				}
				
			} // end foreach that loope over all model_of relations between skeletons and neurons
			

			$narr[] = array(
				'data' => array(
					'title' => $neur['name']
				),
		 		'attr' => array('id' => 'node_'. $neur['id'],
								'rel' => 'neuron',
								'class' => 'jstree-drop'),
				'children' => array(
							  array(
							  		'data' => array(
										'title' => 'has models',
							  		),
							  		'attr' => array('rel' => 'modelof'),
							  		'state' => 'open',
									'children' => $skarr),
							  array(
							  		'data' => array(
										'title' => 'outgoing synapses',
							  		),
							  		'attr' => array('rel' => 'postsynaptic'),
							  		'state' => 'open',
									'children' => $outsyn),
							  array(
							  		'data' => array(
										'title' => 'incoming synapses',
						  			),
									'attr' => array('rel' => 'presynaptic'),
						  			'state' => 'open',
									'children' => $insyn),
							  
							  /*
							  array(
									'title' => 'presynaptic_to',
									'type' => '',
									'icon' => '',
									'children' => array()),*/
							  )
			);
			
		}
		
		// add remaining skeletons
		// for later dragging to a neuron
		foreach ($skel as $skelkey => $loverskel)
		{
			$narr[] = array(
				'data' => array(
					'title' => $loverskel['name'],
				),
				'attr' => array('id' => 'node_'. $skelkey,
								'rel' => 'skeleton'),
				'children' => array()
			);
		}
							
		// generate big array
		$bigarr = array('data' => array(
										'title' => 'Root',
										),
						'attr' => array('id' => 'node_0',
						 				'rel' => 'root'),
						'state' => 'open',
						'children' => $narr);
		
		$sOutput = '[';
		$sOutput .= tv_node( $bigarr );
		$sOutput .= ']';
		echo $sOutput;
		
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve the tree.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not retrieve the tree.' ) );

?>