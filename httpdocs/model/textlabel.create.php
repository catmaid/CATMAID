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
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$y = isset( $_REQUEST[ 'y' ] ) ? floatval( $_REQUEST[ 'y' ] ) : 0;
$x = isset( $_REQUEST[ 'x' ] ) ? floatval( $_REQUEST[ 'x' ] ) : 0;
$text = isset( $_REQUEST[ 'text' ] ) ? $_REQUEST[ 'text' ] : 'Edit this text...';
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

if ( $pid )
{
	if ( $uid )
	{
	
		//! @todo do that all in a transition
		
		$canEdit = $db->countEntries(
			'project_user',
			'"project_id" = '.$pid.' AND "user_id" = '.$uid ) > 0;
		
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
			
			$tid = $db->insertIntoId(
				'textlabel',
				$data );
			
			$db->insertInto(
				'textlabel_location',
				array(
					'location' => '('.$x.','.$y.','.$z.')',
					'textlabel_id' => $tid ) );
			
			makeJSON( array( 'tid' => $tid ) );
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
