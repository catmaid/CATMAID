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

$skeleton_id = isset( $_REQUEST[ 'skeleton_id' ] ) ? intval( $_REQUEST[ 'skeleton_id' ] ) : -1;

# Check preconditions:

# 1. There must be a skeleton id
if ( $skeleton_id < 0 ) {
	echo json_encode( array( 'error' => 'A treenode id has not been provided!' ) );
	return;
}

# 2. There must be a project id
if ( ! $pid ) {
  echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 3. There must be a user id
if ( ! $uid ) {
  echo json_encode( array( 'error' => 'You are not logged in.' ) );
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
$required_relations = array('model_of', 'part_of');
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

$neuron_rows = $db->getResult(
    "SELECT neuron.name AS neuron_name,
            neuron.id AS neuron_id
       FROM class_instance neuron,
            class_instance_class_instance s_to_n
       WHERE s_to_n.class_instance_a = $skeleton_id
         AND s_to_n.relation_id = {$relations['model_of']}
         AND s_to_n.class_instance_b = neuron.id");

if ($neuron_rows === FALSE) {
    echo json_encode( array( 'error' => 'The search query failed.' ) );
    return;
}

if (count($neuron_rows) === 0) {
    echo json_encode( array( 'error' => "No neuron was found that the skeleton $skeleton_id models" ) );
    return;
} elseif (count($neuron_rows) > 1) {
    echo json_encode( array( 'error' => "More than one neuron was found that the skeleton $skeleton_id models" ) );
    return;
}

$ancestry = array();

$ancestry[] = array('name' => $neuron_rows[0]['neuron_name'],
                    'id' => $neuron_rows[0]['neuron_id'],
                    'class' => 'neuron');

$current_class_instance_id = $neuron_rows[0]['neuron_id'];

// Doing this query in a loop is horrible, but it should be very rare
// for the hierarchy to be more than 4 deep or so.  (This is a classic
// problem of not being able to do recursive joins in pure SQL.)  Just
// in case a loop has somehow been introduced, limit the number of
// parents that may be found to 10.

$found = 0;

while ($current_class_instance_id >= 0 && $found < 10) {

    $parent_rows = $db->getResult(
        "SELECT ci.name AS ci_name,
                ci.id AS ci_id,
                c.class_name AS class_name
           FROM class_instance ci,
                class_instance_class_instance cici,
                class c
          WHERE ci.class_id = c.id
            AND cici.class_instance_a = $current_class_instance_id
            AND cici.class_instance_b = ci.id
            AND cici.relation_id = {$relations['part_of']}");

    if (count($parent_rows) === 0) {
        // Then we reached the top of the hierarchy, set the
        // current_class_instance_id to -1 to break the loop.
        $current_class_instance_id = -1;
    } elseif (count($parent_rows) > 1) {
        echo json_encode( array( 'error' => "More than one class_instance was found that the class_instance $current_class_instance_id is part_of" ) );
        return;
    } else {
        $ancestry[] = array('name' => $parent_rows[0]['ci_name'],
                            'id' => $parent_rows[0]['ci_id'],
                            'class' => $parent_rows[0]['class_name']);
        ++ $found;
        $current_class_instance_id = $parent_rows[0]['ci_id'];
    }
}

echo json_encode( $ancestry );

?>
