<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );

$db =& getDB();

$db->migrate();

echo json_encode( array( 'success' => 'The database schema is up to date' ) );

?>
