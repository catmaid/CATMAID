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
checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED | $EDIT_ANY_ALLOWED);

// The ID of the parent treenode:
$parentid = isset( $_REQUEST[ 'parent_id' ] ) ? intval( $_REQUEST[ 'parent_id' ] ) : 0;

// The X,Y,Z coordinate of the treenode to be created, and its properties:
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$radius = isset( $_REQUEST[ 'radius' ] ) ? floatval( $_REQUEST[ 'radius' ] ) : 0;
$confidence = isset( $_REQUEST[ 'confidence' ] ) ? floatval( $_REQUEST[ 'confidence' ] ) : 0;
$targetgroup = isset( $_REQUEST[ 'targetgroup' ] ) ? $_REQUEST[ 'targetgroup' ] : 'none';
$atnx = isset( $_REQUEST[ 'atnx' ] ) ? floatval( $_REQUEST[ 'atnx' ] ) : 0;
$atny = isset( $_REQUEST[ 'atny' ] ) ? floatval( $_REQUEST[ 'atny' ] ) : 0;
$atnz = isset( $_REQUEST[ 'atnz' ] ) ? floatval( $_REQUEST[ 'atnz' ] ) : 0;

$resx = isset( $_REQUEST[ 'resx' ] ) ? floatval( $_REQUEST[ 'resx' ] ) : 0;
$resy = isset( $_REQUEST[ 'resy' ] ) ? floatval( $_REQUEST[ 'resy' ] ) : 0;
$resz = isset( $_REQUEST[ 'resz' ] ) ? floatval( $_REQUEST[ 'resz' ] ) : 0;

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

    $tnid = 0;
    $steps = abs(intval( ($z - $atnz) / $resz ));

    if (0 === $steps) {
        emitErrorAndExit($db, 'Can not interpolate on the same section!');
    }

    $dx = ($x - $atnx) / $steps;
    $dy = ($y - $atny) / $steps;
    $dz = ($z - $atnz) / $steps;

    for ($i = 1; $i <= $steps; $i++) {

        // Loop the creation of treenodes in z resolution steps until target section is reached
        $data = array(
                'user_id' => $uid,
                'project_id' => $pid,
                'location' => '('.floatval($atnx+$dx*$i).','.floatval($atny+$dy*$i).','.floatval($atnz+$dz*$i).')',
                'radius' => $radius,
                'skeleton_id' => $skid,
                'confidence' => $confidence);

        // this is not a root node
        $data['parent_id'] = $parentid;

        $parentid = $db->insertIntoId('treenode', $data );

        if (false === $parentid) {
            emitErrorAndExit($db, 'Error while trying to insert treenode.');
        }

        $data = array(
                'user_id' => $uid,
                'project_id' => $pid,
                'relation_id' => $eleof,
                'treenode_id' => $parentid,
                'class_instance_id' => $skid
            );

        $q = $db->insertInto('treenode_class_instance', $data );

        if (false === $q) {
            emitErrorAndExit($db, 'Count not insert new treenode!');
        }
    }
    $tnid = $parentid;

    // RESULT:
    $json = array( 'treenode_id' => $tnid, 'skeleton_id' => $skid);

	if ($json) {
		if (! $db->commit() ) {
			emitErrorAndExit( $db, 'Failed to commit for expand!' );
		}

		// update last node to reset edition time
		$result = $db->update("treenode", array("confidence" => 5), "id = $tnid");
		if (false === $result) {
			emitErrorAndExit($db, "Failed to update last treenode.");
		}

		echo json_encode( $json );
	} else {
		emitErrorAndExit( $db, 'Failed to produce a JSON string!' );
	}

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
