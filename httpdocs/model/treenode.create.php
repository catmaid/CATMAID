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

// add a new treenode to the database

// 1. add new treenode for a given skeleton id. parent should not be empty
// return: new treenode id

// 2. add new treenode (root) and create a new skeleton (maybe for a given neuron)
// return: new treenode id and skeleton idm ...

// $skelid = isset( $_REQUEST[ 'skeleton_id' ] ) ? intval( $_REQUEST[ 'skeleton_id' ] ) : 0;

// if a neuron id is given, use that one to create the skeleton
// as a model of it
$neuronid = isset( $_REQUEST[ 'useneuron' ] ) ? intval( $_REQUEST[ 'useneuron' ] ) : -1;

$parentid = isset( $_REQUEST[ 'parent_id' ] ) ? intval( $_REQUEST[ 'parent_id' ] ) : 0;
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$radius = isset( $_REQUEST[ 'radius' ] ) ? floatval( $_REQUEST[ 'radius' ] ) : 0;
$confidence = isset( $_REQUEST[ 'confidence' ] ) ? floatval( $_REQUEST[ 'confidence' ] ) : 0;
$targetgroup = isset( $_REQUEST[ 'targetgroup' ] ) ? $_REQUEST[ 'targetgroup' ] : 'none';

if ( $pid )
{
	if ( $uid )
	{

		
		// get id for skeleton class in this project
		$skid = $db->getClassId( $pid, "skeleton" );
		if(!$skid) { echo makeJSON( array( '"error"' => 'Can not find "skeleton" class for this project' ) ); return; }
		$nid = $db->getClassId( $pid, "neuron" );
		if(!$nid) { echo makeJSON( array( '"error"' => 'Can not find "neuron" class for this project' ) ); return; }
    
		// get id for relation 'element_of'
		$eleof = $db->getRelationId( $pid, "element_of" );
		if(!$eleof) { echo makeJSON( array( '"error"' => 'Can not find "element_of" relation for this project' ) ); return; }
		$modid = $db->getRelationId( $pid, "model_of" );
		if(!$modid) { echo makeJSON( array( '"error"' => 'Can not find "model_of" relation for this project' ) ); return; }
		$partof_id = $db->getRelationId( $pid, "part_of" );
		if(!$partof_id) { echo makeJSON( array( '"error"' => 'Can not find "part_of" relation for this project' ) ); return; }
    
		if ( $parentid != -1 )
		{
			// first case
			// this is not a root node (if it is a root node, $parentid would be -1)
			// see overlay.js treenode.create.php
			
			// retrieve skeleton id of parent id
			// skeleton group and element_of relation
			
      $skelid = $db->getResult('SELECT "tci"."class_instance_id" AS "cli" FROM "treenode_class_instance" as "tci"
      WHERE "tci"."treenode_id" = '.$parentid.' AND
      "tci"."relation_id" = '.$eleof.' AND
      "tci"."project_id" = '.$pid);

      if(empty($skelid)) {
         echo makeJSON( array( '"error"' => 'Can not find skeleton for parent treenode '.$parentid.' in this project' ) ); 
         return;
      }

      $skid = $skelid[0]['cli'];
      
			$data = array(
					'user_id' => $uid,
					'project_id' => $pid,
					'location' => '('.$x.','.$y.','.$z.')',
					'radius' => $radius,
					'confidence' => $confidence);
      
			// this is not a root node
			$data['parent_id'] = $parentid;
			
			$tnid = $db->insertIntoId('treenode', $data );

			if ( $tnid )
			{
				$data = array(
						'user_id' => $uid,
						'project_id' => $pid,
						'relation_id' => $eleof,
						'treenode_id' => $tnid,
						'class_instance_id' => $skid 
					);
					
				$db->insertInto('treenode_class_instance', $data );
				
				echo makeJSON( array( '"treenode_id"' => $tnid, '"skeleton_id"' => $skid) );
			}
			else {
				echo makeJSON( array( '"error"' => 'Error while trying to insert treenode.' ) );
			}
		}
		else
		{
			// second case
			
	if($neuronid != -1) {
		// we create for the treenode a new skeleton as model of the current neuron

		// create new skeleton
			/*
	       * Create a new skeleton
	       */
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'class_id' => $skid,
				'name' => 'skeleton'
				);
			$skelid = $db->insertIntoId('class_instance', $data );
		      // update skeleton name by adding its id to the end
		      $up = array('name' => 'skeleton '.$skelid);
		      $upw = 'id = '.$skelid;
		      $db->update( "class_instance", $up, $upw);     


		// make it model of neuron
		      $data = array(
			  'user_id' => $uid,
			  'project_id' => $pid,
			  'relation_id' => $modid,
			  'class_instance_a' => $skelid,
			  'class_instance_b' => $neuronid 
			);
		      $db->insertInto('class_instance_class_instance', $data );

		// create treenode
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'location' => '('.$x.','.$y.','.$z.')',
				'radius' => $radius,
				'confidence' => $confidence);

		      // only set parent_id if given, otherwise
		      // NULL is default and it represents new root node
		      if ( $parentid != -1 ) {
			$data['parent_id'] = $parentid;
		       }

			$tnid = $db->insertIntoId('treenode', $data );


		// make treenode element of skeleton
      
			if ( $tnid )
			{
				$data = array(
						'user_id' => $uid,
						'project_id' => $pid,
						'relation_id' => $eleof,
						'treenode_id' => $tnid,
						'class_instance_id' => $skelid 
					);
				$db->insertInto('treenode_class_instance',$data );
				
				echo makeJSON( array( '"treenode_id"' => $tnid,
									  '"skeleton_id"' => $skelid,
									  '"neuron_id"' => $neuronid,
                   		 ) );
			}
			else {
				echo makeJSON( array( '"error"' => 'Error while inserting treenode.' ) );
			}


	} else {
		// otherwise, we put it into fragments


			/*
       * Create a new skeleton
       */
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'class_id' => $skid,
				'name' => 'skeleton'
				);
			$skelid = $db->insertIntoId('class_instance', $data );
      // update skeleton name by adding its id to the end
      $up = array('name' => 'skeleton '.$skelid);
      $upw = 'id = '.$skelid;
      $db->update( "class_instance", $up, $upw);          

      /*
       * Create a new neuron
       */
      $data = array(
        'user_id' => $uid,
        'project_id' => $pid,
        'class_id' => $nid,
        'name' => 'neuron'
        );
      $neuid = $db->insertIntoId('class_instance', $data );
      // update skeleton name by adding its id to the end
      $up = array('name' => 'neuron '.$neuid);
      $upw = 'id = '.$neuid;
      $db->update( "class_instance", $up, $upw); 
      // add skeleton model_of neuron
      $data = array(
          'user_id' => $uid,
          'project_id' => $pid,
          'relation_id' => $modid,
          'class_instance_a' => $skelid,
          'class_instance_b' => $neuid 
        );
      $db->insertInto('class_instance_class_instance', $data );
        
      /*
       * Add neuron to Fragments 
       */
      $fid = $db->getResult('SELECT "ci"."id" FROM "class_instance" AS "ci"
      WHERE "ci"."name" = \''.$targetgroup.'\' AND
      "ci"."project_id" = '.$pid);
      if(!$fid) {
        // need to create a fragments group and add it
        $gid = $db->getClassId( $pid, "group" );
        if(!$gid) { echo makeJSON( array( '"error"' => 'Can not find "group" class for this project' ) ); return; }
        
        $data = array(
          'user_id' => $uid,
          'project_id' => $pid,
          'class_id' => $gid,
          'name' => $targetgroup
          );
        $frid = $db->insertIntoId('class_instance', $data );
        
        // add Fragments part_of root
        // first find root id
        $pari = $db->getResult(
        'SELECT "class"."id" FROM "class"
        WHERE "class"."project_id" = '.$pid.' AND
        "class"."class_name" = \'root\'');
        $paridc = !empty($pari) ? $pari[0]['id'] : 0;
        $parii = $db->getResult(
        'SELECT "class_instance"."id" FROM "class_instance"
        WHERE "class_instance"."project_id" = '.$pid.' AND
        "class_instance"."class_id" = '.$paridc);
        $rootid = !empty($parii) ? $parii[0]['id'] : 0;

        $data = array(
            'user_id' => $uid,
            'project_id' => $pid,
            'relation_id' => $partof_id,
            'class_instance_a' => $frid,
            'class_instance_b' => $rootid
          );
        $db->insertInto('class_instance_class_instance', $data );
        
      } else {
        $frid = $fid[0]['id'];
      }
      // add neuron part_of Fragments
      $data = array(
          'user_id' => $uid,
          'project_id' => $pid,
          'relation_id' => $partof_id,
          'class_instance_a' => $neuid,
          'class_instance_b' => $frid
        );
      $db->insertInto('class_instance_class_instance', $data );
      
      
      /*
       * Create a new treenode
       */
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'location' => '('.$x.','.$y.','.$z.')',
				'radius' => $radius,
				'confidence' => $confidence);

      // only set parent_id if given, otherwise
      // NULL is default and it represents new root node
      if ( $parentid != -1 ) {
        $data['parent_id'] = $parentid;
       }

	  $tnid = $db->insertIntoId('treenode', $data );

      // insert skeleton to Fragments group. Check first if fragment group
      // exists at all. If not, create. Create a neuron and attach skeleton to it
      // Add neuron to Fragments group  
      
      // *****************
      
			if ( $tnid )
			{
				$data = array(
						'user_id' => $uid,
						'project_id' => $pid,
						'relation_id' => $eleof,
						'treenode_id' => $tnid,
						'class_instance_id' => $skelid 
					);
				$db->insertInto('treenode_class_instance',$data );
				
				echo makeJSON( array( '"treenode_id"' => $tnid,
									  '"skeleton_id"' => $skelid,
									  '"neuron_id"' => $neuid,
									  '"fragmentgroup_id"' => $frid,
                    ) );
			}
			else {
				echo makeJSON( array( '"error"' => 'Error while inserting treenode.' ) );
			}
			
		} // inner if about if neuron exists already closed
		}
		
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to add treenodes.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
	
?>
