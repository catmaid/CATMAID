<?php

//sleep( 2 );

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
			   	"title" AS "title",
				"action" AS "action",
				"text" AS "text",
				"time" AS "time",				
				to_char( "time", \''.PG_DATETIME.'\' ) AS "time_formatted"

			FROM	"message"
			
			WHERE	"user_id" = '.$uid.' AND
					NOT "read"
			
			ORDER BY "time" DESC'
	);

	echo makeJSON( $messages );
}
else
	echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to see your recent messages.' ) );

?>
