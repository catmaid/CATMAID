<?php

include_once( 'errors.inc.php' );
include_once( 'session.class.php' );

$ses =& getSession();
$ses->deleteSession();

echo "1";

?>
