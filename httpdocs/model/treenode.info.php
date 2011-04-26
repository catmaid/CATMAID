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

if ( $pid )
{
	if ( $uid )
	{
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
			if (count($result) > 1)
				echo makeJSON( array( 'error' => "Found more than one skeleton and neuron for treenode $tnid" ) );
			else
				echo makeJSON( $result[0] );
		} else
			echo makeJSON( array( 'error' => "No skeleton and neuron found for treenode $tnid" ) );
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to get skeleton and neuron details' ) );
}
else
    echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>
