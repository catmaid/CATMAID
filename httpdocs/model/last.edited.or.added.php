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

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;
$skid = isset( $_REQUEST[ 'skid' ] ) ? intval( $_REQUEST[ 'skid' ] ) : -1;

if ( $pid )
{
	if ( $uid )
	{
		checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

        $query = "
    SELECT
        tn.id AS id,
        tn.skeleton_id AS skeleton_id,
        (tn.location).x as x,
        (tn.location).y as y,
        (tn.location).z AS z,
        greatest(tn.creation_time, tn.edition_time) AS most_recent,
        'treenode' as type
   FROM
        treenode tn
   WHERE
        tn.project_id = $pid AND
        tn.skeleton_id = $skid AND
        tn.user_id = $uid
   ORDER BY most_recent DESC
   LIMIT 1";

		$result = $db->getResult($query);
		if ($result) {
            echo makeJSON( $result[0] );
		} else
			echo makeJSON( array( 'error' => "No skeleton and neuron found for treenode $tnid" ) );
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to get the last modified treenode' ) );
}
else
    echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>
