<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$sid = isset( $_REQUEST[ 'sid' ] ) ? intval( $_REQUEST[ 'sid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$top = isset( $_REQUEST[ 'top' ] ) ? floatval( $_REQUEST[ 'top' ] ) : 0;
$left = isset( $_REQUEST[ 'left' ] ) ? floatval( $_REQUEST[ 'left' ] ) : 0;
$width = isset( $_REQUEST[ 'width' ] ) ? floatval( $_REQUEST[ 'width' ] ) : 0;
$height = isset( $_REQUEST[ 'height' ] ) ? floatval( $_REQUEST[ 'height' ] ) : 0;
$scale = isset( $_REQUEST[ 'scale' ] ) ? floatval( $_REQUEST[ 'scale' ] ) : 1;
$resolution = isset( $_REQUEST[ 'resolution' ] ) ? floatval( $_REQUEST[ 'resolution' ] ) : 1;


$textlabels = $db->getResult(
	'SELECT	DISTINCT ON ( "tid" ) "textlabel"."id" AS "tid",
			"textlabel"."type" AS "type",
			"textlabel"."text" AS "text",
			"textlabel"."font_name" AS "font_name",
			"textlabel"."font_style" AS "font_style",
			"textlabel"."font_size" AS "font_size",
			"textlabel"."scaling" AS "scaling",
			floor(255*("textlabel"."colour")."r") AS "r",
			floor(255*("textlabel"."colour")."g") AS "g",
			floor(255*("textlabel"."colour")."b") AS "b",
			("textlabel"."colour")."a" AS "a",
			("textlabel_location"."location")."x" AS "x",
			("textlabel_location"."location")."y" AS "y",
			("textlabel_location"."location")."z" AS "z",
			abs( ("textlabel_location"."location")."z" - ("textlabel_location"."location")."z" ) AS "z_diff"
			
		
		FROM "textlabel" INNER JOIN "textlabel_location"
			ON "textlabel"."id" = "textlabel_location"."textlabel_id" INNER JOIN "project"
				ON "project"."id" = "textlabel"."project_id" LEFT JOIN "project_user"
					ON "project"."id" = "project_user"."project_id" INNER JOIN "project_stack"
						ON "project"."id" = "project_stack"."project_id" INNER JOIN "stack"
							ON "stack"."id" = "project_stack"."stack_id"
			
			WHERE	"project"."id" = '.$pid.' AND
					"stack"."id" = '.$sid.' AND
					( "project_user"."user_id" = '.$uid.' OR
					  "project"."public" ) AND
					NOT "textlabel"."deleted" AND
					NOT "textlabel_location"."deleted" AND
					("textlabel_location"."location")."x" >= '.$left.' AND
					("textlabel_location"."location")."x" <= '.( $left + $width ).' AND
					("textlabel_location"."location")."y" >= '.$top.' AND
					("textlabel_location"."location")."y" <= '.( $top + $height ).' AND
					("textlabel_location"."location")."z" >= '.$z.' - 0.5 * ("stack"."resolution")."z" AND
					("textlabel_location"."location")."z" <= '.$z.' + 0.5 * ("stack"."resolution")."z" AND
					( ( "textlabel"."scaling" AND "textlabel"."font_size" * '.( $scale / $resolution ).' >= 3 ) OR
						NOT "textlabel"."scaling" )
			
			ORDER BY "tid", "z_diff"'
);

reset( $textlabels );
while ( list( $key, $val) = each( $textlabels ) )
{
	$textlabels[ $key ][ 'colour' ] = array(
			'r' => $textlabels[ $key ][ 'r' ],
			'g' => $textlabels[ $key ][ 'g' ],
			'b' => $textlabels[ $key ][ 'b' ],
			'a' => $textlabels[ $key ][ 'a' ] );
	unset( $textlabels[ $key ][ 'r' ] );
	unset( $textlabels[ $key ][ 'g' ] );
	unset( $textlabels[ $key ][ 'b' ] );
	unset( $textlabels[ $key ][ 'a' ] );
	$textlabels[ $key ][ 'location' ] = array(
			'x' => $textlabels[ $key ][ 'x' ],
			'y' => $textlabels[ $key ][ 'y' ],
			'z' => $textlabels[ $key ][ 'z' ] );
	unset( $textlabels[ $key ][ 'x' ] );
	unset( $textlabels[ $key ][ 'y' ] );
	unset( $textlabels[ $key ][ 'z' ] );
	$textlabels[ $key ][ 'scaling' ] = $textlabels[ $key ][ 'scaling' ] == 't';
}

echo json_encode( $textlabels );

?>
