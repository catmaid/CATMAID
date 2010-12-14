<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );

$db =& getDB( 'write' );
$ses =& getSession();

$uid = $ses->isSessionValid() ? $ses->getId() : 0;
$id = isset( $_GET[ 'id' ] ) ? $_GET[ 'id' ] : 0;

echo '<?xml version="1.0" encoding="us-ascii"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=us-ascii" />
<title>{ $url }</title>
</head>
<body onload="';

if ( $uid && $id )
{
	$db->update(
		'message',
		array( 'read'=>true ),
		'"id" = '.$id.' AND "user_id" = '.$uid );
	$message = $db->getResult(
        'SELECT "action" AS "action"

            FROM    "message"

            WHERE   "id" = '.$id.' AND
					"user_id" = '.$uid );
	
	
	if ( $message && isset( $message[ 0 ][ 'action' ] ) && $message[ 0 ][ 'action' ] )
		echo 'location.replace(\''.$message[ 0 ][ 'action' ].'\')">
<p>If not redirected automatically, please click <a href="'.$message[ 0 ][ 'action' ].'">here</a>.</p>';
	else
		echo 'history.back();">
<p>If not redirected automatically, please click <a href="javascript:history.back();">here</a>.</p>';
}
else
	echo 'history.back();">';
echo '</body>
</html>
';

?>
