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

if ( $pid )
{
	if ( $uid )
	{
		
		// get id for skeleton class in this project
		$skidres = $db->getResult(
		'SELECT "class"."id" FROM "class"
		WHERE "class"."project_id" = '.$pid.' AND
		"class"."class_name" = \'skeleton\'');
		$skid = !empty($skidres) ? $skid = $skidres[0]['id'] : 0;
		
		// retrieve all the skeletons for a particular objects
		$skel = $db->getResult(
		'SELECT "ci"."id" as "id", "ci"."name" as "name" FROM "class_instance" AS "ci"
		WHERE "ci"."project_id" = '.$pid.' AND
		"ci"."class_id" = '.$skid.'');
		
		// generate result
		reset( $skel );
		$sOutput = '[';
		while ( list( $key, $val) = each( $skel ) )
		{
			$sOutput .= '{';
			
			$sOutput .= '"data" : {';
			$sOutput .= ' "title" : "'.$val["name"].' <skeleton>",';
			$sOutput .= ' "icon" : "folder",';
			$sOutput .= '},';
			
			// add the children here
			$sOutput .= '"children" : [ "presynaptic_to <relation>", "postsynaptic_to <relation>", "model_of <relation>"],';
			
			$sOutput .= '},';
		}
		$sOutput .= ']';
		unset( $skel );
			
		/*
		 * [
						{ 
							"data" : "A node", 
							"children" : [ "Child 1", "Child 2" ]
						},
						{ 
							"attr" : { "id" : "li.node.id" }, 
							"data" : { 
								"title" : "Long format demo", 
								"attr" : { "href" : "#" } 
							} 
						}
					
						],
						
		*/
		// show synapses that are presynaptic
		// show synapses that are postsynaptic
		
		echo $sOutput;
		
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve skeletons.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not retrieve skeletons.' ) );

?>