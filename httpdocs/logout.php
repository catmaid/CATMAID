<?php

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'session.class.php' );

$ses =& getSession();
$ses->deleteSession();

echo "1";

?>
