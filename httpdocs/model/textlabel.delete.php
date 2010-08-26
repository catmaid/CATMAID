<?php

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB( 'write' );
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$tid = isset( $_REQUEST[ 'tid' ] ) ? intval( $_REQUEST[ 'tid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;

if ( $pid )
{
	if ( $uid )
	{
	
		//! @todo do that all in a transition
		
		$canEdit = $db->getResult(
			'SELECT	"textlabel"."id" AS "tid"
			
				FROM "textlabel" INNER JOIN "project"
					ON "project"."id" = "textlabel"."project_id" INNER JOIN "project_user"
						ON "project"."id" = "project_user"."project_id"
						
				WHERE "textlabel"."id" = '.$tid.' AND
					"project_user"."user_id" = '.$uid.' AND
					"project_user"."project_id" = '.$pid );
		
		if ( $canEdit )
		{
/*
			$db->deleteFrom(
				'textlabel_location',
				'"textlabel_id" = '.$tid.' AND
				abs( ("location")."x" - '.$x.' ) < 0.001 AND
				abs( ("location")."y" - '.$y.' ) < 0.001 AND
				abs( ("location")."z" - '.$z.' ) < 0.001' );
*/
			$db->update(
				'textlabel_location',
				array( 'deleted' => true ),
				'"textlabel_id" = '.$tid.' AND
				abs( ("location")."x" - '.$x.' ) < 0.001 AND
				abs( ("location")."y" - '.$y.' ) < 0.001 AND
				abs( ("location")."z" - '.$z.' ) < 0.001' );
																							
			$l = $db->countEntries(
				'textlabel_location',
				'"textlabel_id" = '.$tid.' AND NOT "deleted"' );
			
			if ( $l < 1 )
/*				$db->deleteFrom(
					'textlabel',
					'"id" = '.$tid );
*/
				$db->update(
					'textlabel',
					array( 'deleted' => true ),
					'"id" = '.$tid );
			
			echo " "; //!< one char for Safari, otherwise its xmlHttp.status is undefined...
		}
		else
			echo makeJSON( array( 'error' => 'You do not have the permission to edit this textlabel.' ) );
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to edit textlabels.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed while editing text. Last changes might be lost.' ) );

?>
