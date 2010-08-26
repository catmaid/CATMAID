<?php

/**
 * call this for keep-alive and to get a list of recent messages
 * for the current session
 */

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$uid = $ses->isSessionValid() ? $ses->getId() : 0;

if ( $uid && isset( $_SESSION[ 'msg' ] ) && is_array( $_SESSION ) )
{
	echo makeJSON( $_SESSION[ 'msg' ] );
	unset( $_SESSION[ 'msg' ] );
}

?>
