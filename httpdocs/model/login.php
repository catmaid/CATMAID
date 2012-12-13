<?php

include_once( 'errors.inc.php' );
include_once( 'session.class.php' );
include_once( 'json.inc.php' );

$name = isset( $_POST[ 'name' ] ) ? $_POST[ 'name' ] : '';
$pwd = isset( $_POST[ 'pwd' ] ) ? $_POST[ 'pwd' ] : '';

$ses =& getSession();
//$ses->deleteSession();

$id = 0;
if ( $name === '' && $pwd === '' && $ses->isSessionValid() )
	$id = $ses->getId();
else
	$id = $ses->isUserValid( $name, $pwd );
if ( !$id )
{
	$ses->deleteSession();
	if ( $name || $pwd )
	{
		sleep( 2 );
		echo '{ "error" : "Invalid account or password." }';
	}
	else
		echo '{ "notice" : "Session closed." }';
}
else
{
	$ses->create( $id );
	$d = $ses->getData();
	echo makeJSON( $d );
	//echo '{ id : ', $id, ', name : "', $name, '" }';
}

?>
