<?php

//sleep( 2 );

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

if ( $ses->isSessionValid() )
{
	$pprojects = $db->getResult(
		'SELECT	"project"."id" AS "pid",
				"project"."title" AS "ptitle",
				"stack"."id" AS "sid",
				"stack"."title" AS "stitle",
				"stack"."comment" AS "comment",
				"project"."public" AS "public",
				( "project_user"."user_id" IS NOT NULL ) AS "editable"
				
			FROM "project" LEFT JOIN "project_user"
				ON "project"."id" = "project_user"."project_id" INNER JOIN "project_stack"
					ON "project"."id" = "project_stack"."project_id" INNER JOIN "stack"
						ON "stack"."id" = "project_stack"."stack_id"
			
			WHERE	"project_user"."user_id" = '.$ses->getId().' OR
					"project"."public"
					
			ORDER BY "ptitle"'
	);
}
else
{
	$pprojects = $db->getResult(
		'SELECT	"project"."id" AS "pid",
				"project"."title" AS "ptitle",
				"stack"."id" AS "sid",
				"stack"."title" AS "stitle",
				"stack"."comment" AS "comment",
				"project"."public" AS "public",
				false AS "editable"
				
			FROM "project" INNER JOIN "project_stack"
				ON "project"."id" = "project_stack"."project_id" INNER JOIN "stack"
					ON "stack"."id" = "project_stack"."stack_id"
			
			WHERE	"project"."public"
					
			ORDER BY "ptitle"'
	);
}
/*
if ( $ses->isSessionValid() )
{
	$private_projects = $db->getResult(
		'SELECT	"project"."id" AS "pid",
				"project"."title" AS "ptitle",
				"stack"."id" AS "sid",
				"stack"."title" AS "stitle",
				"project"."public" AS "public"
				
			FROM "project" INNER JOIN "project_user"
				ON "project"."id" = "project_user"."project_id" INNER JOIN "project_stack"
					ON "project"."id" = "project_stack"."project_id" INNER JOIN "stack"
						ON "stack"."id" = "project_stack"."stack_id"
			
			WHERE	"project_user"."user_id" = '.$ses->getId().' AND
					NOT "project"."public"'
	);
}
else
	$private_projects = array();
*/

//! !!IMPORTANT!! Do not forget, that "public" is a javascript keyword in Safari(!) due to some ovious reasons

$projects = array();
foreach ( $pprojects as $p )
{
	if ( !isset( $projects[ $p[ 'pid' ] ] ) )
	{
		$projects[ $p[ 'pid' ] ] = array(
				'title'		=> $p[ 'ptitle' ],
				'public_project'	=> $p[ 'public' ] == 't',
				'action'	=> array(),
				'editable'	=> $p[ 'editable' ] == 't',
				'note'		=> ( $p[ 'editable' ] == 't' ? '[ editable ]' : '' ) );
	}
	$projects[ $p[ 'pid' ] ][ 'action' ][ $p[ 'sid' ] ] = array(
			'title' => $p[ 'stitle' ],
			'comment' => $p[ 'comment' ],
			'action' => 'javascript:openProjectStack( '.$p[ 'pid' ].', '.$p[ 'sid' ].' )',
			'note' => '' );
}
/*
foreach ( $private_projects as $p )
{
	if ( !isset( $projects[ $p[ 'pid' ] ] ) )
	{
		$projects[ $p[ 'pid' ] ] = array(
				'title'		=> $p[ 'stitle' ],
				'public_project'	=> $p[ 'public' ] == "t",
				'action'	=> array(),
				'note'		=> '[ private ]' );
	}
	$projects[ $p[ 'pid' ] ][ 'action' ][ $p[ 'sid' ] ] = array(
			'title' => $p[ 'stitle' ],
			'action' => 'javascript:openProjectStack( '.$p[ 'pid' ].', '.$p[ 'sid' ].' )',
			'note' => '' );
}
*/

if ( $projects )
	echo makeJSON( $projects );
else
	echo makeJSON( array( 'error' => 'No projects available.' ) );

?>
