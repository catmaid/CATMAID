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

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;


# Check preconditions:

# 1. There must be a treenode id
if ( ! $tnid ) {
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

// Single query: no need for an explicit transaction

$query = "SELECT ci.id as skeleton_id, ci.name as skeleton_name, ".
			"            ci2.id as neuron_id, ci2.name as neuron_name ".
			"FROM treenode_class_instance tci, relation r, relation r2, ".
			"     class_instance ci, class_instance ci2, class_instance_class_instance cici ".
			"WHERE ci.project_id = $pid AND ".
			"    tci.relation_id = r.id AND r.relation_name = 'element_of' AND ".
			"    tci.treenode_id = $tnid AND ci.id = tci.class_instance_id AND ".
			"    ci.id = cici.class_instance_a AND ci2.id = cici.class_instance_b AND ".
			"    cici.relation_id = r2.id AND r2.relation_name = 'model_of'";

$result = $db->getResult($query);

if ($result) {
	if (count($result) > 1) {
		echo json_encode( array( 'error' => "Found more than one skeleton and neuron for treenode $tnid" ) );
	} else {
		echo json_encode( $result[0] );
	}
} else {
	echo json_encode( array( 'error' => "No skeleton and neuron found for treenode $tnid" ) );
}
  
?>
