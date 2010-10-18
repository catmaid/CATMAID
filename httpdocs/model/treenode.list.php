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

// retrieve skeleton ids if set
if ( isset( $_REQUEST['skeleton_nr'] ))
{
	$skelnr = intval( $_REQUEST['skeleton_nr'] );
	
	if ( $skelnr )
	{
		$skelcon = "AND (";
		
		for ( $i = 0; $i < $skelnr; $i++ )
		{
			// $skelid[] = $_REQUEST['skeleton_'.$i];
			if( $i == 0 )
				$skelcon .= '"tci"."class_instance_id" = '. $_REQUEST['skeleton_'.$i];
			else
				$skelcon .= 'OR "tci"."class_instance_id" = '. $_REQUEST['skeleton_'.$i];
		}
		$skelcon .= ")";
		
	}
	else
	{
		$skelcon = "";
	}
	
	
}

/* Paging */
$sLimit = "";
$iDisplayStart = isset( $_REQUEST['iDisplayStart'] ) ? intval( $_REQUEST['iDisplayStart'] ) : 0;
$iDisplayLength = isset( $_REQUEST['iDisplayLength'] ) ? intval( $_REQUEST['iDisplayLength'] ) : -1;

if ( $iDisplayLength > 0 )
	$sLimit .= ' LIMIT '.$iDisplayLength;
if ( $iDisplayStart > 0 )
	$sLimit .= ' OFFSET '.$iDisplayStart;
	
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
		return "labels";
	else if ( $i == 9 )
		return "last_modified";

}


if ( $pid )
{
	if ( $uid )
	{
		
			// treenode type logic
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
			}
			unset( $tbranch );
			
			// label logic
			
			// get id for relation 'labeled_as'
			$tlabelrel_res = $db->getResult(
			'SELECT "relation"."id" FROM "relation"
			WHERE "relation"."project_id" = '.$pid.' AND
			"relation"."relation_name" = \'labeled_as\'');
			
			if( !empty($tlabelrel_res) )
			{
				$tlabelrel = $tlabelrel_res[0]['id'];
			
				// get treenode_class_instance rows
				$tlabel = $db->getResult(
				'SELECT "tci"."id", "tci"."treenode_id", "tci"."class_instance_id", "class_instance"."name" as "name"
				FROM "treenode_class_instance" AS "tci" , "class_instance"
				WHERE "tci"."project_id" = '.$pid.' AND "tci"."relation_id" = '.$tlabelrel.' AND "class_instance"."id" = "tci"."class_instance_id"'
				);
				
				reset( $tlabel );
				$tlabel2 = array();
				while ( list( $key, $val) = each( $tlabel ) )
				{
					$k = $val['treenode_id'];
					
					if( array_key_exists($k, $tlabel2) )
					 	$tlabel2[$k][] = $val['name']; // only append				
					else
						$tlabel2[$k] = array($val['name']);;
	
				}
				unset( $tlabel );
			}
			
			// retrieve model_of id
			$modelofres = $db->getResult(
			'SELECT "relation"."id" FROM "relation"
			WHERE "relation"."project_id" = '.$pid.' AND
			"relation"."relation_name" = \'model_of\'');
			$modid = !empty($modelofres) ? $modelofres[0]['id'] : 0;
			
			
			
			// treenode list logic
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
						( "treenode"."user_id" = '.$uid.' ) AS "can_edit",
						to_char("treenode"."edition_time", \'DD-MM-YYYY HH24:MI\') AS "last_modified",
						"tci"."class_instance_id"
						
					FROM "treenode", "user", "treenode_class_instance" AS "tci"
						
					WHERE "treenode"."project_id" = '.$pid.' AND
						  "treenode"."user_id" = "user"."id" AND
						  "treenode"."id" = "tci"."treenode_id"
						  '.$skelcon.'
					'.$sOrder.'
					'.$sLimit.'
					');
			
			$iTotal = count($t);
			
			reset( $t );
			
			// possibly add sort function for types using
			// array_multisort with php
			
			$sOutput = '{';
			$sOutput .= '"iTotalRecords": '.$iTotal.', ';
			$sOutput .= '"iTotalDisplayRecords": '.$iTotal.', ';
			$sOutput .= '"aaData": [ ';
			
			while ( list( $key, $val) = each( $t ) )
			{
				$sRow = "";
				$sRow .= "[";
				$sRow .= '"'.addslashes($val["tid"]).'",';
				$sRow .= '"'.addslashes($val["x"]).'",';
				$sRow .= '"'.addslashes($val["y"]).'",';
				$sRow .= '"'.addslashes($val["z"]).'",';
				
				// find node type
				// R : root
				// S : slab
				// B : branch
				// L : leaf
				// X : undefined
				if ( $val["parent_id"] == "" )
				{
					$sRow .= '"R",';
					$val["nodetype"] = "R";
				}
				else
				{
					if( array_key_exists(intval($val["tid"]), $tbranch2 ) )
					{
						if( $tbranch2[intval($val["tid"])] == 1 )
						{
							$sRow .= '"S",';
							$val["nodetype"] = "S";
						}
						else if( $tbranch2[intval($val["tid"])] > 1 )
						{
							$sRow .= '"B",';
							$val["nodetype"] = "B";
						}
						else
						{
							$sRow .= '"X",';
							$val["nodetype"] = "X";
						}
					}
					else
					{
						$sRow .= '"L",';
						$val["nodetype"] = "L";
					}
				}					
				$sRow .= '"'.addslashes($val["confidence"]).'",';
				$sRow .= '"'.addslashes($val["radius"]).'",';
				$sRow .= '"'.addslashes($val["username"]).'",';
				// use tags
				if(!empty($tlabel2))
				{
					if( array_key_exists($val['tid'], $tlabel2) )
					{
						$out = implode(', ', $tlabel2[$val['tid']]);
					}
					else
					{
						$out = '';
					}
					$val['label'] = $out;
					$sRow .= '"'.addslashes($out).'",';
						
				}
				else
				{
					$sRow .= '"",';
				}
				
				// last modified
				$sRow .= '"'.addslashes($val["last_modified"]).'",';
				
				$sRow .= "],";
				
				$skip = False;
				// if search by node type is set, only add this row
				// if it corresponds to the nodes we want to display
				// 0 -> node type
				// 1 -> label			
				if ( $_REQUEST['sSearch_0'] != "" )
				{
					if( strtoupper($_REQUEST['sSearch_0']) != $val["nodetype"])
					{
						$skip = True;
					}
				}

				if ( $_REQUEST['sSearch_1'] != "" )
				{
					$pos = strpos(strtoupper($val["label"]),strtoupper($_REQUEST['sSearch_1']));
					if ( $pos === false ) {
						$skip = True;
					}
				}
				
				if ( !$skip )
					$sOutput .= $sRow;
					
				
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

