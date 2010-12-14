<?php

include_once( 'errors.inc.php' );
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
$text = isset( $_REQUEST[ 'text' ] ) ? $_REQUEST[ 'text' ] : 'Textlabel';
$type = isset( $_REQUEST[ 'type' ] ) ? $_REQUEST[ 'type' ] : 'text';
if ( $type != 'bubble' ) $type = 'text';
$r = isset( $_REQUEST[ 'r' ] ) ? floatval( $_REQUEST[ 'r' ] ) : 1;
$g = isset( $_REQUEST[ 'g' ] ) ? floatval( $_REQUEST[ 'g' ] ) : 0.5;
$b = isset( $_REQUEST[ 'b' ] ) ? floatval( $_REQUEST[ 'b' ] ) : 0;
$a = isset( $_REQUEST[ 'a' ] ) ? floatval( $_REQUEST[ 'a' ] ) : 1;
$fontname = isset( $_REQUEST[ 'fontname' ] ) ? $_REQUEST[ 'fontname' ] : false;
$fontstyle = isset( $_REQUEST[ 'fontstyle' ] ) ? $_REQUEST[ 'fontstyle' ] : false;
$fontsize = isset( $_REQUEST[ 'fontsize' ] ) ? intval( $_REQUEST[ 'fontsize' ] ) : false;
$scaling = ( isset( $_REQUEST[ 'scaling' ] ) && $_REQUEST[ 'scaling' ] ) ? true : false;

//$text = preg_replace( '/\r?\n/', "\r\n", $text );


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
			$data = array(
					'text' => $text,
					'type' => $type,
					'colour' => '('.$r.','.$g.','.$b.','.$a.')',
					'project_id' => $pid,
					'scaling' => $scaling );
			
			if ( $fontname ) $data[ 'font_name' ] = $fontame;
			if ( $fontstyle ) $data[ 'font_style' ] = $fontstyle;
			if ( $fontsize ) $data[ 'font_size' ] = $fontsize;
			
			$db->update(
				'textlabel',
				$data,
				'"id" = '.$tid );
			$db->update(
				'textlabel_location',
				array(
					'location' => '('.$x.','.$y.','.$z.')' ),
				'"textlabel_id" = '.$tid.' AND abs( ("location")."z" - '.$z.' ) < 0.001' );
			
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


//print_r( $_REQUEST );

?>
