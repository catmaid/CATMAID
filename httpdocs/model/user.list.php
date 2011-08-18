<?php

sleep( 2 );

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$uid = $ses->isSessionValid() ? $ses->getId() : 0;

if ( $uid )
{
	$messages = $db->getResult(
		'SELECT	"id" AS "id",
			   	"name" AS "name",
				"longname" AS "longname"

			FROM	"user"
			
			ORDER BY "longname" ASC'
	);
	
	echo makeJSON( $messages );
}
else
	echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to list registered users.' ) );

?>
