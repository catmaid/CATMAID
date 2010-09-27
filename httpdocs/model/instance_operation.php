<?php

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

# operation=rename_node&id=6&title=neuron1+%3Cneuron%3E+

$op = isset( $_REQUEST[ 'operation' ] ) ? $_REQUEST[ 'operation' ] : 0;
$name = isset( $_REQUEST[ 'title' ] ) ? $_REQUEST[ 'title' ] : 0;
$id = isset( $_REQUEST[ 'id' ] ) ? $_REQUEST[ 'id' ] : 0;

if ( $pid )
{
	if ( $uid )
	{
		
		if ( $op == 'rename_node')
		{
			
			$ids = $db->update("class_instance", array("name" => $name) ,' "class_instance"."id" = '.$id);
			echo "Updated.";
				
		}
		
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to apply operation.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );

?>