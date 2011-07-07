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
// relation type
// use, 0 for presynaptic_to, 1 for postsynaptic_to
$relation_type = isset( $_REQUEST[ 'relation_type' ] ) ? intval( $_REQUEST[ 'relation_type' ] ) : 0;
// skeleton id used

/* Paging */
$sLimit = "";
if ( isset( $_REQUEST['iDisplayStart'] ) )
{
	$displayLength = intval( $_REQUEST['iDisplayLength'] );
	$displayStart = intval( $_REQUEST['iDisplayStart'] );
	$sLimit = "LIMIT ".$displayLength." OFFSET ".$displayStart;
}

$columnToFieldArray = array( "instance_name",
			     "tnid",
			     "username",
			     "labels",
			     "last_modified",
			     "instance_id" );

function fnColumnToField( $i )
{
	global $columnToFieldArray;
	if ( $i < 0 || $i >= count($columnToFieldArray) )
		return "tnid";
	else
		return $columnToFieldArray[$i];
}

/* Ordering */
if ( isset( $_REQUEST['iSortCol_0'] ) )
{
	$sOrder = "ORDER BY  ";
	$sColumns = intval( $_REQUEST['iSortingCols'] );
	for ( $i=0 ; $i<$sColumns ; $i++ )
	{
		$direction = (strtoupper($_REQUEST['sSortDir_'.$i]) === "DESC") ? "DESC" : "ASC";
		$columnIndex = intval( $_REQUEST['iSortCol_'.$i] );
		$sOrder .= fnColumnToField($columnIndex)." ".$direction.", ";
	}
	$sOrder = substr_replace( $sOrder, "", -2 );
}

# There must be a project id
if ( ! $pid ) {
    echo makeJSON( array( 'error' => 'Project closed. Cannot apply operation.' ) );
    return;
}

# There must be a user id
if ( ! $uid ) {
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve connector list.' ) );
    return;
}

// Retrieve relation IDs
$presyn_id = $db->getRelationId( $pid, 'presynaptic_to' );
if(!$presyn_id) {
    echo makeJSON( array( 'error' => 'Can not find "presynaptic_to" relation for this project' ) );
    return;
}

$postsyn_id = $db->getRelationId( $pid, 'postsynaptic_to' );
if(!$postsyn_id) {
    echo makeJSON( array( 'error' => 'Can not find "postsynaptic_to" relation for this project' ) );
    return;
}

$labeledas_id = $db->getRelationId( $pid, 'labeled_as' );
if(!$labeledas_id) {
    echo makeJSON( array( 'error' => 'Can not find "labeled_as" relation for this project' ) );
    return;
}

/*
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
*/

// class_instance_id name, username, treenode id

if ( $pre )
{

    $t = $db->getResult('SELECT	"tc"."treenode_id" AS "tnid",
        "tc"."connector_id" AS "cnid",
        "tc"."user_id" AS "user_id",
        to_char("ci"."edition_time", \'DD-MM-YYYY HH24:MI\') AS "last_modified"
        FROM "treenode_connector" as "tc"
        WHERE "tci"."relation_id" = '.$presyn_id.' AND
        "tci"."project_id" = '.$pid.'
        '.$sOrder.'
        '.$sLimit
        );
    print_r($t);
    
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

?>

