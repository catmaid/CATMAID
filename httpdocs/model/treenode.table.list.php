<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );
include_once( 'utils.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

# Check preconditions:

# 1. There must be a project id
if ( ! $pid ) {
  echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 2. There must be a user id
if ( ! $uid ) {
    echo json_encode( array( 'error' => 'You are not logged in currently.  Please log in to be able to add treenodes.' ) );
	return;
}


// retrieve treenode id, when set retrieve skeleton id
$atnid = isset( $_REQUEST[ 'atnid' ] ) ? intval( $_REQUEST[ 'atnid' ] ) : 0;
// maximum number of rows to display
$maxrows = 3000;


// Utility data and associated function below
$columnToFieldArray = array( "tid",
					 "x",
					 "y",
					 "z",
					 "type",
					 "confidence",
					 "radius",
					 "username",
					 "labels",
					 "last_modified" );

function fnColumnToField( $i )
{
	global $columnToFieldArray;
	if ( $i < 0 || $i >= count($columnToFieldArray) )
		return "tid";
	else
		return $columnToFieldArray[$i];
}



// Start transaction: ensure all queries are consistent
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

	$tabinject = '';
	if ($atnid != 0) {
				 $res = $db->getClassInstanceForTreenode( $pid, $atnid, "element_of" );
				 if(!empty($res)) {
						$skelid = $res[0]['class_instance_id'];
						$skelcon = "AND (";
						$skelcon .= '"tci"."class_instance_id" = '.$skelid;
						$skelcon .= ")";
						//$skelcon .= 'AND "treenode"."id" = "tci"."treenode_id"';
						$tabinject = ', "treenode_class_instance" AS "tci"';
						
					} else {
						emitErrorAndExit( $db, 'Can not find skeleton for the selected treenode.' );
					}

	} else {
			// try to retrieve the sent skeleton ids

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
				if( $i != 0 )
					$skelcon .= 'OR ';
				$skelcon .= '"tci"."class_instance_id" = '. intval($_REQUEST['skeleton_'.$i]);
					}
					$skelcon .= ")";
					
				}
				else
				{
				// just not retrieve anything
					$skelcon = "AND false";
				}
			} else {
			// just not retrieve anything
				$skelcon = "AND false";
			}
	}

	/* Paging */
	$sLimit = "";
	$iDisplayStart = isset( $_REQUEST['iDisplayStart'] ) ? intval( $_REQUEST['iDisplayStart'] ) : 0;
	$iDisplayLength = isset( $_REQUEST['iDisplayLength'] ) ? intval( $_REQUEST['iDisplayLength'] ) : -1;

	if ( $iDisplayLength > 0 )
		$sLimit .= ' LIMIT '.$iDisplayLength;
	else
		$sLimit .= ' LIMIT '.$maxrows;
		
	if ( $iDisplayStart > 0 )
		$sLimit .= ' OFFSET '.$iDisplayStart;



	/* Ordering */
	if ( isset( $_REQUEST['iSortCol_0'] ) )
	{
		$sOrder = "ORDER BY  ";
		$sColumns = intval( $_REQUEST['iSortingCols'] );
		for ( $i=0 ; $i< $sColumns; $i++ )
		{
			$direction = (strtoupper($_REQUEST['sSortDir_'.$i]) === "DESC") ? "DESC" : "ASC";
			$columnIndex = intval( $_REQUEST['iSortCol_'.$i] );
			$sOrder .= fnColumnToField($columnIndex)." ".$direction.", ";
		}
		$sOrder = substr_replace( $sOrder, "", -2 );
	}



	// label logic

	// get id for relation 'labeled_as'      
			$tlabelrel_res = $db->getResult('SELECT "relation"."id" FROM "relation"
			WHERE "relation"."project_id" = '.$pid.' AND
			"relation"."relation_name" = \'labeled_as\'');

	if ( !empty($tlabelrel_res) )
	{
		$tlabelrel = $tlabelrel_res[0]['id'];

		// get treenode_class_instance rows
		$tlabel = $db->getResult(
		'SELECT "tci"."id", "tci"."treenode_id", "tci"."class_instance_id", "class_instance"."name" as "name"
		FROM "treenode_class_instance" AS "tci", "class_instance"
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
	$modid = $db->getRelationId( $pid, 'model_of' );
	if (!$modid) {
		emitErrorAndExit( $db, 'Can not find "model_of" relation for this project' );
	}


	// treenode list logic
	$t = $db->getResult(
		'SELECT DISTINCT "treenode"."id" AS "tid",
				"treenode"."radius" AS "radius",
				"treenode"."confidence" AS "confidence",
				"treenode"."parent_id" AS "parent_id",
				"treenode"."user_id" AS "user_id",
				"treenode"."edition_time" AS "edition_time",
				("treenode"."location")."x" AS "x",
				("treenode"."location")."y" AS "y",
				("treenode"."location")."z" AS "z",
				"user"."name" AS "username",
				( "treenode"."user_id" = '.$uid.' ) AS "can_edit",
				to_char("treenode"."edition_time", \'DD-MM-YYYY HH24:MI\') AS "last_modified"
				
			FROM "treenode", "user", "treenode_class_instance" AS "tci"
				
			WHERE "treenode"."project_id" = '.$pid.' AND
					"treenode"."user_id" = "user"."id"
					AND "treenode"."id" = "tci"."treenode_id"
					'.$skelcon.'
					'.$sOrder.'
					'.$sLimit.'
					');

	if (false === $t) {
		emitErrorAndExit($db, 'Cound not get the list of treenodes.');
	}

	$iTotal = count($t);

	// count treenode parents to derive
	// treenode type
	$tbranch = $db->getResult(
	'SELECT "t1"."id" AS "t1id", COUNT( "t2"."id" ) as cc 
		FROM "treenode" AS "t1", "treenode" AS "t2", "treenode_class_instance" AS "tci"
		WHERE "t1"."project_id" = '.$pid.' AND "t2"."parent_id" = "t1"."id"
			AND "t1"."id" = "tci"."treenode_id"
			'.$skelcon.'
		GROUP BY "t1"."id"');

	if (false === $tbranch) {
		emitErrorAndExit($db, 'Could not retrieve treenode parents.');
	}

	reset( $tbranch );
	// create simplified array keyed by id
	$tbranch2 = array();
	while ( list( $key, $val) = each( $tbranch ) )
	{
		$tbranch2[$val["t1id"]] = $val["cc"];
	}
	unset( $tbranch );
	// ***************

	reset( $t );

	// possibly add sort function for types using
	// array_multisort with php
	//print_r($tlabel2);
	$sOutput = '{';
	$sOutput .= '"iTotalRecords": '.$iTotal.', ';
	$sOutput .= '"iTotalDisplayRecords": '.$iTotal.', ';
	$sOutput .= '"aaData": [ ';
	$i = 0;
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
		
		if( array_key_exists($val['tid'], $tlabel2) )
		{
			$out = implode(', ', $tlabel2[$val['tid']]);
		}
		else
		{
			$out = '';
		}
		$vallabel = $out;
		$sRow .= '"'.addslashes($out).'",';
			

		// last modified
		$sRow .= '"'.addslashes($val["last_modified"]).'"';
		
		$sRow .= "]";
		
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
			$pos = strpos(strtoupper($vallabel), strtoupper($_REQUEST['sSearch_1']));

			if ( $pos !== false ) {
				$skip = False;
			} else {
				$skip = True;
			};

		}
		
		if ( !$skip ) {
					if($i!=0) { $sRow = ",".$sRow; }
			$sOutput .= $sRow;
					$i++;
				}
		
	}
	// $sOutput = substr_replace( $sOutput, "", -1 );
	$sOutput .= ']}';
  
  // Nothing to commit, but just to finish the transaction cleanly.
  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

	echo $sOutput;

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}


?>

