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

// TODO: filter by skeleton_instance as parameter, so far, show all
// TODO: show treenodes from all user, so far, only show the ones for the currently logged in user

/* Paging */
$sLimit = "";
if ( isset( $_REQUEST['iDisplayStart'] ) )
{
	$sLimit = "LIMIT ".pg_escape_string( $_REQUEST['iDisplayLength'] )." ".
		"OFFSET ".pg_escape_string( $_REQUEST['iDisplayStart'] );
}
	
/* Ordering */
if ( isset( $_REQUEST['iSortCol_0'] ) )
{
	$sOrder = "ORDER BY  ";
	for ( $i=0 ; $i<pg_escape_string( $_REQUEST['iSortingCols'] ) ; $i++ )
	{
		$sOrder .= fnColumnToField(pg_escape_string( $_REQUEST['iSortCol_'.$i] ))."
		 	".pg_escape_string( $_REQUEST['sSortDir_'.$i] ) .", ";
	}
	$sOrder = substr_replace( $sOrder, "", -2 );
}

function fnColumnToField( $i )
{
	if ( $i == 0 )
		return "tid";
	else if ( $i == 1 )
		return "x";
	else if ( $i == 2 )
		return "y";
	else if ( $i == 3 )
		return "z";
	else if ( $i == 4 )
		return "confidence";
	else if ( $i == 5 )
		return "radius";
	else if ( $i == 6 )
		return "username";
	else if ( $i == 7 )
		return "tags";

}


if ( $pid )
{
	if ( $uid )
	{
		
			// columns: 	id 	user_id 	creation_time 	edition_time 	project_id 	parent_id 	location 	radius 	confidence
			// improvements: retrieve nodes for project members
			
			$t = $db->getResult(
				'SELECT	"treenode"."id" AS "tid",
						"treenode"."radius" AS "radius",
						"treenode"."confidence" AS "confidence",
						"treenode"."parent_id" AS "parent_id",
						"treenode"."user_id" AS "user_id",
						("treenode"."location")."x" AS "x",
						("treenode"."location")."y" AS "y",
						("treenode"."location")."z" AS "z",
						"user"."name" AS "username"

					FROM "treenode" INNER JOIN "user"
						ON "treenode"."user_id" = "user"."id"
						
					WHERE "treenode"."project_id" = '.$pid.' AND
						  "treenode"."user_id" = '.$uid.'
					'.$sOrder.'
					'.$sLimit.'
					');
			
			
			$iTotal = count($t);
			
			reset( $t );
			
			$sOutput = '{';
			$sOutput .= '"iTotalRecords": '.$iTotal.', ';
			$sOutput .= '"iTotalDisplayRecords": '.$iTotal.', ';
			$sOutput .= '"aaData": [ ';
			while ( list( $key, $val) = each( $t ) )
			{
				// TO REMOVE
				$val["tags"] = "blubb";
				
				$sOutput .= "[";
				$sOutput .= '"'.addslashes($val["tid"]).'",';
				$sOutput .= '"'.addslashes($val["x"]).'",';
				$sOutput .= '"'.addslashes($val["y"]).'",';
				$sOutput .= '"'.addslashes($val["z"]).'",';
				if ( $val["parent_id"] == "NULL" )
					$sOutput .= '"Root",';
				else
					$sOutput .= '"'.addslashes($val["confidence"]).'",';
				$sOutput .= '"'.addslashes($val["radius"]).'",';
				$sOutput .= '"'.addslashes($val["username"]).'",';
				$sOutput .= '"'.addslashes($val["tags"]).'",';
				$sOutput .= "],";
			}
			$sOutput = substr_replace( $sOutput, "", -1 );
			$sOutput .= '] }';
			
			echo $sOutput;
			

	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve treenodes.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not retrieve treenodes.' ) );

?>

