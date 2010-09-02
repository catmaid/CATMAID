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

// TODO: filter by "is_model_of" "skeleton_instance" as parameter, so far, show all

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
		return "type";
	else if ( $i == 5 )
		return "confidence";
	else if ( $i == 6 )
		return "radius";
	else if ( $i == 7 )
		return "username";
	else if ( $i == 8 )
		return "tags";

}


if ( $pid )
{
	if ( $uid )
	{
		
			$tbranch = $db->getResult(
			'SELECT  "t1"."id" AS "t1id",
				COUNT( "t2"."id" ) as cc
				FROM "treenode" AS "t1"
				    JOIN "treenode" AS "t2"
				        ON "t2"."parent_id" = "t1"."id"
				
				WHERE
				"t1"."project_id" = '.$pid.'
				GROUP BY "t1"."id"');
			
			reset( $tbranch );
			$tbranch2 = array();
			while ( list( $key, $val) = each( $tbranch ) )
			{
				$tbranch2[$val["t1id"]] = $val["cc"];
				unset($tbranch[ $key ]);
			}
			
			$t = $db->getResult(
				'SELECT	"treenode"."id" AS "tid",
						"treenode"."radius" AS "radius",
						"treenode"."confidence" AS "confidence",
						"treenode"."parent_id" AS "parent_id",
						"treenode"."user_id" AS "user_id",
						("treenode"."location")."x" AS "x",
						("treenode"."location")."y" AS "y",
						("treenode"."location")."z" AS "z",
						"user"."name" AS "username",
						( "treenode"."user_id" = '.$uid.' ) AS "can_edit"
						
					FROM "treenode", "user"
						
					WHERE "treenode"."project_id" = '.$pid.' AND
						  "treenode"."user_id" = "user"."id"
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
				
				// find node type
				// R : root
				// S : slab
				// B : branch
				// L : leaf
				// X : undefined
				if ( $val["parent_id"] == "" )
					$sOutput .= '"R",';
				else
				{
					if( array_key_exists(intval($val["tid"]), $tbranch2 ) )
					{
						if( $tbranch2[intval($val["tid"])] == 1 )
						{
							$sOutput .= '"S",';
						}
						else if( $tbranch2[intval($val["tid"])] > 1 )
						{
							$sOutput .= '"B",';
						}
						else
						{
							$sOutput .= '"X",';
						}
					}
					else
					{
						$sOutput .= '"L",';
					}
				}					
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

