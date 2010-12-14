<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

/*
$pid = isset( $_POST[ 'pid' ] ) ? intval( $_POST[ 'pid' ] ) : 0;
$sid = isset( $_POST[ 'sid' ] ) ? intval( $_POST[ 'sid' ] ) : 0;
*/
$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$sid = isset( $_REQUEST[ 'sid' ] ) ? intval( $_REQUEST[ 'sid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$project_stacks = $db->getResult(
	'SELECT	DISTINCT ON ( "pid", "sid" ) "project"."id" AS "pid",
			"stack"."id" AS "sid",
			"project"."title" AS "ptitle",
			"project_stack"."translation" AS "translation",
			"stack"."title" AS "stitle",
			"stack"."dimension" AS "dimension",
			"stack"."resolution" AS "resolution",
			"stack"."image_base" AS "image_base",
			"stack"."trakem2_project" AS "trakem2_project"
			
		FROM "project" LEFT JOIN "project_user"
				ON "project"."id" = "project_user"."project_id" INNER JOIN "project_stack"
					ON "project"."id" = "project_stack"."project_id" INNER JOIN "stack"
						ON "stack"."id" = "project_stack"."stack_id"
			
			WHERE	"project"."id" = '.$pid.' AND
					"stack"."id" = '.$sid.' AND
					( "project_user"."user_id" = '.$uid.' OR
					  "project"."public" )'
);

if ( $project_stacks )
{
	$editable = $db->countEntries(
		'project_user',
		'"project_id" = '.$pid.' AND "user_id" = '.$uid ) > 0;
	$broken_slices = $db->getResult(
		'SELECT "index" AS "i"
			
			FROM "broken_slice"
			
			WHERE	"stack_id" = '.$sid.'
			
			ORDER BY "i"'
	);
	
	$bs = array();
	foreach ( $broken_slices as $b )
	{
		$bs[ $b[ 'i' ] ] = 1;
	}
	
	$project_stack = $project_stacks[ 0 ];
	$project_stack[ 'editable' ] = $editable;
	$project_stack[ 'translation' ] = double3dXYZ( $project_stack[ 'translation' ] );
	$project_stack[ 'resolution' ] = double3dXYZ( $project_stack[ 'resolution' ] );
	$project_stack[ 'dimension' ] = integer3dXYZ( $project_stack[ 'dimension' ] );
	$project_stack[ 'broken_slices' ] = $bs;
	$project_stack[ 'trakem2_project' ] = $project_stack[ 'trakem2_project' ] == 't';
	
	echo makeJSON( $project_stack );
}
else
	echo makeJSON( array( 'error' => 'Invalid project stack selection.' ) );

?>
