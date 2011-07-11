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

# 3. User has permissions?
canEditOrExit( $db, $uid, $pid );


// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
  
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
  
  if (false === $tid) {
    emitErrorAndExit($db, 'Failed to insert new text label.');
  }
  
  $q = $db->insertInto(
    'textlabel_location',
    array(
      'location' => '('.$x.','.$y.','.$z.')',
      'textlabel_id' => $tid ) );

  if (false === $q) {
    emitErrorAndExit($db, 'Failed to insert text label location.');
  }

  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }

  json_encode( array( 'tid' => $tid ) );


} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
