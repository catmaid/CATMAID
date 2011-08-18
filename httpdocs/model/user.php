<?php

//setcookie( "TestCookie", time(), time() + 30 );

include_once( 'errors.inc.php' );
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


$users = $db->getResult( 'SELECT * FROM "user"' );

print_r( $users[0]['id'] );


?>