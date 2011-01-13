<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;
$pre = isset( $_REQUEST[ 'pre' ] ) ? intval( $_REQUEST[ 'pre' ] ) : 0;

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
		return "instance_name";
	else if ( $i == 1 )
		return "tnid";
	else if ( $i == 2 )
		return "username";
	else if ( $i == 3 )
		return "labels";
	else if ( $i == 4 )
		return "last_modified";
	else if ( $i == 5 )
		return "instance_id";
		
}


if ( $pid )
{
	if ( $uid )
	{
		
			// get id for presynaptic_to
			$presyn = $db->getResult(
			'SELECT "relation"."id" FROM "relation"
			WHERE "relation"."project_id" = '.$pid.' AND
			"relation"."relation_name" = \'presynaptic_to\'');
			$presyn_id = !empty($presyn) ? $presyn[0]['id'] : 0;
			
			// get id for postsynaptic_to
			$postsyn = $db->getResult(
			'SELECT "relation"."id" FROM "relation"
			WHERE "relation"."project_id" = '.$pid.' AND
			"relation"."relation_name" = \'postsynaptic_to\'');
			$postsyn_id = !empty($postsyn) ? $postsyn[0]['id'] : 0;
			
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
				'SELECT "cici"."class_instance_a" as "cia", "class_instance"."name" as "label"
				FROM "class_instance_class_instance" AS "cici" , "class_instance"
				WHERE "cici"."project_id" = '.$pid.' AND "cici"."relation_id" = '.$tlabelrel.' AND "class_instance"."id" = "cici"."class_instance_b"'
				);
				
				reset( $tlabel );
				$tlabel2 = array();
				while ( list( $key, $val) = each( $tlabel ) )
				{
					$k = $val['cia'];
					if( array_key_exists($k, $tlabel2) )
					 	$tlabel2[$k][] = $val['label']; // only append				
					else
						$tlabel2[$k] = array($val['label']);;
				}
				unset( $tlabel );
			}

			
			// class_instance_id name, username, treenode id
	
			if ( $pre )
			{
				
			// retrieve from treenode_class_instance for relation ids
			$t = $db->getResult(
				'SELECT	"tci"."treenode_id" AS "tnid",
				"tci"."user_id" AS "user_id",
				"user"."name" AS "username",
				"ci"."name" AS "instance_name",
				"ci"."id" AS "instance_id",
				( "tci"."user_id" = '.$uid.' ) AS "can_edit",
				to_char("ci"."edition_time", \'DD-MM-YYYY HH24:MI\') AS "last_modified"
				FROM "treenode_class_instance" as "tci", "user", "class_instance" as "ci"
				WHERE "tci"."relation_id" = '.$presyn_id.' AND
				"tci"."project_id" = '.$pid.' AND
				"tci"."user_id" = "user"."id" AND
				"tci"."class_instance_id" = "ci"."id"
				'.$sOrder.'
				'.$sLimit
				);
			}
			else
			{

			$t = $db->getResult(
				'SELECT	"tci"."treenode_id" AS "tnid",
				"tci"."user_id" AS "user_id",
				"user"."name" AS "username",
				"ci"."name" AS "instance_name",
				"ci"."id" AS "instance_id",
				( "tci"."user_id" = '.$uid.' ) AS "can_edit",
				to_char("ci"."edition_time", \'DD-MM-YYYY HH24:MI\') AS "last_modified"
				FROM "treenode_class_instance" as "tci", "user", "class_instance" as "ci"
				WHERE "tci"."relation_id" = '.$postsyn_id.' AND
				"tci"."project_id" = '.$pid.' AND
				"tci"."user_id" = "user"."id" AND
				"tci"."class_instance_id" = "ci"."id"
				'.$sOrder.'
				'.$sLimit
				);
			}
			
			// synapse list logic
			
			$iTotal = count($t);
			
			reset( $t );
			
			$sOutput = '{';
			$sOutput .= '"iTotalRecords": '.$iTotal.', ';
			$sOutput .= '"iTotalDisplayRecords": '.$iTotal.', ';
			$sOutput .= '"aaData": [ ';
			
			while ( list( $key, $val) = each( $t ) )
			{
				$sRow = "";
				$sRow .= "[";
				$sRow .= '"'.addslashes($val["instance_name"]).'",';
				$sRow .= '"'.addslashes($val["tnid"]).'",';
				$sRow .= '"'.addslashes($val["username"]).'",';

				// use tags
				if(!empty($tlabel2))
				{
					if( array_key_exists($val['instance_id'], $tlabel2) )
					{
						$out = implode(', ', $tlabel2[$val['instance_id']]);
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
				// instance_id
				$sRow .= '"'.addslashes($val["instance_id"]).'",';
				
				$sRow .= "],";
				
				$skip = False;
				if ( $_GET['sSearch_2'] != "" )
				{
					$pos = strpos(strtoupper($val["label"]),strtoupper($_GET['sSearch_2']));
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
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve synapses.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not retrieve synapses.' ) );

?>

