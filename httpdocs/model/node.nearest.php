<?php

/* */

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
    echo json_encode( array( 'error' => 'You are not logged in.' ) );
	return;
}

checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;

$skeletonID = isset( $_REQUEST[ 'skeleton_id' ] ) ? intval( $_REQUEST[ 'skeleton_id' ] ) : -1;
$neuronID = isset( $_REQUEST[ 'neuron_id' ] ) ? intval( $_REQUEST[ 'neuron_id' ] ) : -1;

if (($skeletonID < 0) && ($neuronID < 0)) {
    echo json_encode( array( 'error' => 'You must specify either a skeleton or a neuron' ) );
	return;
}

$classes = $db->getMap( $pid, 'class' );
if (!$classes) {
    echo makeJSON( array( 'error' => "Could not find classes for project $pid" ) );
    return;
}

$relations = $db->getMap( $pid, 'relation' );
if (!$relations) {
    echo makeJSON( array( 'error' => "Could not find relations for project $pid" ) );
    return;
}

// Check that this returned all the required IDs:
$required_classes = array('neuron', 'skeleton');
$required_relations = array('part_of');

foreach ($required_classes as $class) {
    if (!array_key_exists($class, $classes)) {
        echo makeJSON( array( 'error' => "Failed to find the required class '$class'" ) );
        return;
    }
}
foreach ($required_relations as $relation) {
    if (!array_key_exists($relation, $relations)) {
        echo makeJSON( array( 'error' => "Failed to find the required relation '$relation'" ) );
        return;
    }
}

$skeletons = array();

if ($skeletonID > 0) {
    $skeletons[] = $skeletonID;
}

if ($neuronID > 0) {

    $skeleton_rows = $db->getResult(
    "SELECT class_instance_a as skeleton_id FROM class_instance_class_instance cici, class_instance ca, class_instance cb WHERE relation_id = {$relations['model_of']} AND class_instance_b = $neuronID AND cici.class_instance_a = ca.id AND cici.class_instance_b = cb.id AND ca.class_id = {$classes['skeleton']} AND cb.class_id = {$classes['neuron']}");

    if ($skeleton_rows === FALSE) {
        echo makeJSON( array( 'error' => "Finding the skeletons failed" ) );
        return;
    }

    foreach( $skeleton_rows as $row ) {
        $skeletons[] = $row['skeleton_id'];
    }

}

if (!$skeletons) {
    echo makeJSON( array( 'error' => "Could not find any skeletons" ) );
    return;
}

$comma_separated_skeleton_ids = implode(", ", $skeletons);

$treenode_rows = $db->getResult(
   "SELECT id AS treenode_id, (tn.location).x AS x, (tn.location).y AS y, (tn.location).z AS z, skeleton_id
    FROM treenode tn
    WHERE project_id = $pid AND skeleton_id IN ($comma_separated_skeleton_ids)");

if ($treenode_rows === FALSE) {
    echo makeJSON( array( 'error' => "Finding the treenodes failed" ) );
    return;
}

$minimumDistanceSquared = -1;
$nearestRow = NULL;

foreach ($treenode_rows as $row) {
    $xdiff = $x - $row['x'];
    $ydiff = $y - $row['y'];
    $zdiff = $z - $row['z'];
    $distanceSquared = $xdiff * $xdiff + $ydiff * $ydiff + $zdiff * $zdiff;
    if ($distanceSquared < $minimumDistanceSquared || $minimumDistanceSquared < 0) {
        $nearestRow = $row;
        $minimumDistanceSquared = $distanceSquared;
    }
}

if (!$nearestRow) {
    echo makeJSON( array( 'error' => "No treenodes were found" ) );
    return;
}

echo json_encode($nearestRow);

?>
