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
        $query = "SELECT tn.id AS id, tn.location AS location, greatest(tn.creation_time, tn.edition_time) AS most_recent ".
            "FROM treenode_class_instance tcn, relation r, treenode_class_instance tcn2, treenode tn ".
            "WHERE ".
            "  tcn.treenode_id = $tnid AND ".
            "  r.relation_name = 'element_of' AND ".
            "  tcn.relation_id = r.id AND ".
            "  tcn.class_instance_id = tcn2.class_instance_id AND ".
            "  tn.id = tcn2.treenode_id ".
            "ORDER BY most_recent DESC ".
            "LIMIT 1";

		$result = $db->getResult($query);
		if ($result) {
            echo makeJSON( $result[0] );
		} else
			echo makeJSON( array( '"error"' => "No skeleton and neuron found for treenode $tnid" ) );
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to get the last modified treenode' ) );
}
else
    echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>
