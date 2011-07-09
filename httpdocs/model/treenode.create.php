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

# Check preconditions:

# 1. There must be a project id
if ( ! $pid ) {
	echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 2. There must be a user id
if ( ! $uid ) {
		echo json_encode( array( 'error' => 'You are not logged in currently.	Please log in to be able to add treenodes.' ) );
	return;
}

# 3. The user must have permissions to edit this tree
# TODO -- currently all users can edit everything



// Add a new treenode to the database
// ----------------------------------

// 1. Add new treenode for a given skeleton id. Parent should not be empty.
// return: new treenode id

// 2. Add new treenode (root) and create a new skeleton (maybe for a given neuron)
// return: new treenode id and skeleton id.

// If a neuron id is given, use that one to create the skeleton as a model of it:
$neuronid = isset( $_REQUEST[ 'useneuron' ] ) ? intval( $_REQUEST[ 'useneuron' ] ) : -1;

// The ID of the parent treenode:
$parentid = isset( $_REQUEST[ 'parent_id' ] ) ? intval( $_REQUEST[ 'parent_id' ] ) : 0;

// The X,Y,Z coordinate of the treenode to be created, and its properties:
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$radius = isset( $_REQUEST[ 'radius' ] ) ? floatval( $_REQUEST[ 'radius' ] ) : 0;
$confidence = isset( $_REQUEST[ 'confidence' ] ) ? floatval( $_REQUEST[ 'confidence' ] ) : 0;
$targetgroup = isset( $_REQUEST[ 'targetgroup' ] ) ? $_REQUEST[ 'targetgroup' ] : 'none';




# Get IDs for the classes and relations in this project

$skid = $db->getClassId( $pid, "skeleton" );
if (!$skid) {
	echo json_encode( array( 'error' => 'Can not find "skeleton" class for this project' ) );
	return;
}

$nid = $db->getClassId( $pid, "neuron" );
if (!$nid) {
	echo json_encode( array( 'error' => 'Can not find "neuron" class for this project' ) );
	return;
}

$eleof = $db->getRelationId( $pid, "element_of" );
if (!$eleof) {
	echo json_encode( array( 'error' => 'Can not find "element_of" relation for this project' ) );
	return;
}

$modid = $db->getRelationId( $pid, "model_of" );
if (!$modid) {
	echo json_encode( array( 'error' => 'Can not find "model_of" relation for this project' ) );
	return;
}

$partof_id = $db->getRelationId( $pid, "part_of" );
if (!$partof_id) {
	echo json_encode( array( 'error' => 'Can not find "part_of" relation for this project' ) );
	return;
}


// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

	// The result JSON message, if any:
	$json = false;

	if ( $parentid != -1 )
	{
		// First case
		// A root node and parent node exist (if there wasn't one, $parentid would be -1).
		// See overlay.js and treenode.create.php.

		// Retrieve skeleton id of parent id
		// and skeleton group and element_of relation

		$skelid = $db->getResult('SELECT "tci"."class_instance_id" AS "cli"
								  FROM "treenode_class_instance" as "tci"
								  WHERE "tci"."treenode_id" = '.$parentid.'
								  AND "tci"."relation_id" = '.$eleof.'
								  AND "tci"."project_id" = '.$pid);

		if (false === $skelid || empty($skelid)) {
			 emitErrorAndExit( $db, 'Can not find skeleton for parent treenode '.$parentid.' in this project' );
		}

		$skid = intval($skelid[0]['cli']);
 
		$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'location' => '('.$x.','.$y.','.$z.')',
				'radius' => $radius,
				'confidence' => $confidence);
		
		// this is not a root node
		$data['parent_id'] = $parentid;
		
		$tnid = $db->insertIntoId('treenode', $data );

		if (false === $tnid) {
			emitErrorAndExit($db, 'Error while trying to insert treenode.');
		}

		$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'relation_id' => $eleof,
				'treenode_id' => $tnid,
				'class_instance_id' => $skid 
			);
			
		$q = $db->insertInto('treenode_class_instance', $data );

		if (false === $q) {
			emitErrorAndExit($db, 'Count not insert new treenode!');
		}

		// RESULT:
		$json = array( 'treenode_id' => $tnid, 'skeleton_id' => $skid);

	} else {
		// Second case: must create a new root node,
		// which needs a new skeleton and a new neuron to belong to.

		// Create new skeleton
		$data = array(
			'user_id' => $uid,
			'project_id' => $pid,
			'class_id' => $skid,
			'name' => 'skeleton'
			);

		$skelid = $db->insertIntoId('class_instance', $data );

		if (false === $skelid) {
			emitErrorAndExit($db, 'Could not insert new treenode instance!');
		}

		// Update skeleton name by adding its id to the end
		$up = array('name' => 'skeleton '.$skelid);
		$upw = 'id = '.$skelid;
		$nRows = $db->update( "class_instance", $up, $upw );

		if (0 === $nRows) {
			emitErrorAndExit($db, 'Could not append the skeleton id to the skeleton\'s name!');
		}

		// If a neuron already exists, use it:
		if (-1 != $neuronid) {

			// Make the skeleton a model of the existing neuron
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'relation_id' => $modid,
				'class_instance_a' => $skelid,
				'class_instance_b' => $neuronid 
				);
			$q = $db->insertInto('class_instance_class_instance', $data );

			if (false === $q) {
				emitErrorAndExit($db, 'Could not relate the neuron model to the new skeleton!');
			}

			// Create the new treenode
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'location' => '('.$x.','.$y.','.$z.')',
				'radius' => $radius,
				'confidence' => $confidence
				);

			// Only set parent_id if given, otherwise
			// NULL is default and it represents new root node
			if ( $parentid != -1 ) {
				$data['parent_id'] = $parentid;
			}

			$tnid = $db->insertIntoId('treenode', $data );

			if (false === $tnid) {
				emitErrorAndExit($db, 'Error while inserting treenode!');
			}

			// Make treenode an element_of skeleton
			$data = array(
					'user_id' => $uid,
					'project_id' => $pid,
					'relation_id' => $eleof,
					'treenode_id' => $tnid,
					'class_instance_id' => $skelid 
				);
			$q = $db->insertInto('treenode_class_instance', $data );

			if (false === $q) {
				emitErrorAndExit($db, 'Could not create element_of relation between treenode and skeleton!');
			}

			$json = array( 'treenode_id' => $tnid,
                     'skeleton_id' => $skelid,
                     'neuron_id' => $neuronid );

		} else {
			// A neuron does not exist, therefore we put the new skeleton
			// into a new neuron, and put the new neuron into the fragments group.

			// Create a new neuron
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'class_id' => $nid,
				'name' => 'neuron'
				);
			$neuid = $db->insertIntoId('class_instance', $data );

			if (false === $neuid) {
				emitErrorAndExit($db, 'Failed to insert new instance of a neuron.');
			}

			// Update neuron name by adding its id to the end
			$up = array('name' => 'neuron '.$neuid);
			$upw = 'id = '.$neuid;
			$nRows = $db->update( "class_instance", $up, $upw); 

			if (0 === $nRows) {
				emitErrorAndExit($db, 'Failed to append the neuron id to its name.');
			}

			// Add skeleton model_of neuron
			$data = array(
					'user_id' => $uid,
					'project_id' => $pid,
					'relation_id' => $modid,
					'class_instance_a' => $skelid,
					'class_instance_b' => $neuid 
				);
			$q = $db->insertInto('class_instance_class_instance', $data );

			if (false === $q) {
				emitErrorAndExit($db, 'Failed to insert new model_of relation between skeleton and neuron.');
			}

			// Add neuron to Fragments 
			$fid = $db->getResult('SELECT "ci"."id" FROM "class_instance" AS "ci"
														 WHERE "ci"."name" = \''.pg_escape_string($targetgroup).'\'
														 AND "ci"."project_id" = '.$pid);

			// If the fragments group does not exist yet, must create it and add it:
			if (!$fid) {
				$gid = $db->getClassId( $pid, "group" );

				if (false === $gid) {
					emitErrorAndExit($db, 'The query for class ID of "group" failed.');
				}
				if (!$gid) {
					emitErrorAndExit($db, 'Can not find "group" class for this project');
				}

				$data = array(
					'user_id' => $uid,
					'project_id' => $pid,
					'class_id' => $gid,
					'name' => $targetgroup
					);
				$frid = $db->insertIntoId('class_instance', $data );

				if (false === $frid) {
					emitErrorAndExit($db, 'Failed to insert new instance of group.');
				}

				// Add Fragments part_of root, but first find root id.
				$pari = $db->getResult('SELECT "class"."id" FROM "class"
										WHERE "class"."project_id" = '.$pid.' 
										AND "class"."class_name" = \'root\'');

				if (false === $pari) {
					emitErrorAndExit($db, 'Failed to select the root id.');
				}

				$paridc = !empty($pari) ? $pari[0]['id'] : 0;
				$parii = $db->getResult('SELECT "class_instance"."id"
										 FROM "class_instance"
										 WHERE "class_instance"."project_id" = '.$pid.'
										 AND "class_instance"."class_id" = '.$paridc);

				if (false === $parii) {
					emitErrorAndExit($db, 'Failed to select ids for class instances.');
				}

				$rootid = !empty($parii) ? $parii[0]['id'] : 0;

				$data = array(
						'user_id' => $uid,
						'project_id' => $pid,
						'relation_id' => $partof_id,
						'class_instance_a' => $frid,
						'class_instance_b' => $rootid
					);
				$q = $db->insertInto('class_instance_class_instance', $data );

				if (false === $q) {
					emitErrorAndExit($db, 'Failed to insert part_of relation between root node and fragments group.');
				}

			} else {
				$frid = intval($fid[0]['id']);
			}

			// Add neuron part_of fragments relation:
			$data = array(
					'user_id' => $uid,
					'project_id' => $pid,
					'relation_id' => $partof_id,
					'class_instance_a' => $neuid,
					'class_instance_b' => $frid
				);
			$q = $db->insertInto('class_instance_class_instance', $data );

			if (false === $q) {
				emitErrorAndExit($db, 'Failed to insert part_of relation between neuron id and fragments group.');
			}

			// Create a new treenode
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'location' => '('.$x.','.$y.','.$z.')',
				'radius' => $radius,
				'confidence' => $confidence);

			// Only set parent_id if given, otherwise
			// NULL is default and it represents new root node
			if ( $parentid != -1 ) {
				$data['parent_id'] = $parentid;
			}

			// Insert treenode into the skeleton
			$tnid = $db->insertIntoId('treenode', $data );

			if (false === $tnid) {
				emitErrorAndExit($db, 'Failed to insert treenode into skeleton.');
			}

			// Insert skeleton into the class instance table
			$data = array(
				'user_id' => $uid,
				'project_id' => $pid,
				'relation_id' => $eleof,
				'treenode_id' => $tnid,
				'class_instance_id' => $skelid 
				);
			$q = $db->insertInto('treenode_class_instance', $data);

			if (false === $q) {
				emitErrorAndExit($db, 'Failed to insert instance of treenode.');
			}
	
			$json = array( 'treenode_id' => $tnid,
							'skeleton_id' => $skelid,
						 	'neuron_id' => $neuid,
							'fragmentgroup_id' => $frid );

		}
	}

	if ($json) {
		if (! $db->commit() ) {
			emitErrorAndExit( $db, 'Failed to commit for expand!' );
		}
		echo json_encode( $json );
	} else {
		emitErrorAndExit( $db, 'Failed to produce a JSON string!' );
	}

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
