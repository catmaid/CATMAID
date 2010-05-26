<?php

//setcookie( "TestCookie", time(), time() + 30 );

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );

$ses =& getSession();
$ses->create( '1' );

$db =& getDB();

echo "GET:\n";
print_r( $_GET );
echo "POST:\n";
print_r( $_POST );

print_r( $_COOKIE );
exit;

$users = $db->getResult( 'SELECT * FROM "users"' );

print_r( $users );


?>