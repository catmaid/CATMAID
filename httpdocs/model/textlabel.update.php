<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );
include_once( 'utils.php' );

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

# 1. There must be a project id
if ( ! $pid ) {
  echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 2. There must be a user id
if ( ! $uid ) {
    echo json_encode( array( 'error' => 'You are not logged in.' ) );
	return;
}


// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

  $labelID = $db->getResult(
    'SELECT	"textlabel"."id" AS "tid"
      FROM "textlabel" INNER JOIN "project"
        ON "project"."id" = "textlabel"."project_id" INNER JOIN "project_user"
          ON "project"."id" = "project_user"."project_id"
          
      WHERE "textlabel"."id" = '.$tid.' AND
        "project_user"."user_id" = '.$uid.' AND
        "project_user"."project_id" = '.$pid );
        
  if (false === $labelID) {
    emitErrorAndExit($db, 'Failed to determine if the label can be edited.');
  }

  if ( $labelID ) {
    $data = array(
        'text' => $text,
        'type' => $type,
        'colour' => '('.$r.','.$g.','.$b.','.$a.')',
        'project_id' => $pid,
        'scaling' => $scaling );

    if ( $fontname ) $data[ 'font_name' ] = $fontame;
    if ( $fontstyle ) $data[ 'font_style' ] = $fontstyle;
    if ( $fontsize ) $data[ 'font_size' ] = $fontsize;

    $q = $db->update(
      'textlabel',
      $data,
      '"id" = '.$tid );
    
    if (false === $q) {
      emitErrorAndExit($db, 'Failed to update textlabel with id '.$tid);
    }
      
    $q = $db->update(
      'textlabel_location',
      array(
        'location' => '('.$x.','.$y.','.$z.')' ),
      '"textlabel_id" = '.$tid.' AND abs( ("location")."z" - '.$z.' ) < 0.001' );

    if (false === $q) {
      emitErrorAndExit($db, 'Failed to update the location of textlabel with id '.$tid);
    }

    echo " "; //!< one char for Safari, otherwise its xmlHttp.status is undefined...

  } else {
    emitErrorAndExit($db, 'You do not have the permission to edit this textlabel.');
  }

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
