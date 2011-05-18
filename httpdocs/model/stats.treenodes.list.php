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


if ( $pid )
{
	if ( $uid )
	{

		$users_treenodes = $db->getResult('SELECT "us"."name", COUNT("tn"."id") AS "cnt" FROM "treenode" AS "tn",
		    "user" AS "us" WHERE "us"."id" = "tn"."user_id" AND "tn"."project_id" = '.$pid.' GROUP BY "us"."name" ORDER BY "cnt" ');

        if(!empty($users_treenodes))
        {
          $dat = array();
          $name = array();
          foreach($users_treenodes as $key => $ele)
          {
            $dat[] = $ele['cnt'];
            $name[] = $ele['name'].' ('.$ele['cnt'].')';
          }
          echo json_encode( array('values' => $dat, 'users' => $name ) );
        }
        else
        {
          echo json_encode( array('values' => array(), 'users' => array() ) );
        }

	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve the statistics.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not retrieve the statistics.' ) );

?>