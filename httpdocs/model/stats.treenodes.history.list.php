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

$start_date = isset( $_REQUEST[ 'start_date' ] ) ?  $_REQUEST[ 'start_date' ]  : date('Ymd', time() - 7 * 24 * 60 * 60);
$end_date = isset( $_REQUEST[ 'end_date' ] ) ?  $_REQUEST[ 'end_date' ]  : date('Ymd');

if ( $pid )
{
	if ( $uid )
	{

		checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

		$users_treenodes = $db->getResult('SELECT "us"."name", to_char("tn"."edition_time", \'YYYYMMDD\') as "date", COUNT("tn"."id") AS "cnt" FROM "treenode" AS "tn",
		    "user" AS "us" WHERE "us"."id" = "tn"."user_id" AND "tn"."project_id" = '.$pid.' 
		    AND to_char("tn"."edition_time", \'YYYYMMDD\') >= \''.$start_date.'\' AND to_char("tn"."edition_time", \'YYYYMMDD\') <= \''.$end_date.'\' GROUP BY 1, 2 ORDER BY 1, 2 ');

        if(!empty($users_treenodes))
        {
          $entries = array();
          foreach($users_treenodes as $key => $ele)
          {
            $entries[] = array('name' => $ele['name'], 'date' => $ele['date'], 'count' => intval($ele['cnt']));
          }
          echo json_encode( $entries );
        }
        else
        {
          echo json_encode( array('values' => array(), 'users' => array() , 'dates' => array() ) );
        }

	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve the statistics.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not retrieve the statistics.' ) );

?>