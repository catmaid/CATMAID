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
$skeletonID = isset( $_REQUEST[ 'skeleton_id' ] ) ? intval( $_REQUEST[ 'skeleton_id' ] ) : 0;

// if there is no valid skeleton id, just return an empty table
if ( ! $skeletonID ) {
    $sOutput = '{';
	$sOutput .= '"iTotalRecords": 0, ';
	$sOutput .= '"iTotalDisplayRecords": 0, ';
	$sOutput .= '"aaData": [] } ';
    echo $sOutput;
    return;
}

/* Paging */
$sLimit = "";
if ( isset( $_REQUEST['iDisplayStart'] ) )
{
    $displayLength = intval( $_REQUEST['iDisplayLength'] );
    $displayStart = intval( $_REQUEST['iDisplayStart'] );
    $sLimit = "LIMIT ".$displayLength." OFFSET ".$displayStart;
}

$columnToFieldArray = array( "connector_id", "x", "y", "z", "labels", "nr_treenodes", "username");

function fnColumnToField( $i ) {
    global $columnToFieldArray;
    return $columnToFieldArray[$i];
}

$direction = (strtoupper($_REQUEST['sSortDir_0']) === "DESC") ? "DESC" : "ASC";

function subval_sort($a,$subkey) {
    global $direction;
    foreach($a as $k=>$v) {
        $b[$k] = strtolower($v[$subkey]);
    }
    if( $direction === 'DESC' ) {
        asort($b);
    } else {
        arsort($b);
    }

    foreach($b as $key=>$val) {
        $c[] = $a[$key];
    }
    return $c;
}

/* Ordering */
/*
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
}*/

if ( isset( $_REQUEST['iSortCol_0'] ) ) {
    $columnIndex = intval( $_REQUEST['iSortCol_0'] );
} else {
    $columnIndex = 0;
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

$elementof_id = $db->getRelationId( $pid, 'element_of' );
if(!$elementof_id) {
    echo makeJSON( array( 'error' => 'Can not find "element_of" relation for this project' ) );
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
    WHERE "cici"."project_id" = '.$pid.' AND "cici"."relation_id" = '.$tlabelrel.' AND
     "class_instance"."id" = "cici"."class_instance_b"'
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

if ( $relation_type )
{
    $relation_id = $presyn_id;
    // inverse relation to fetch postsynaptic skeletons
    $relation_inverse_id = $postsyn_id;
} else {
    $relation_id = $postsyn_id;
    $relation_inverse_id = $presyn_id;
}

// Retrieve all the connector ids that are presynaptic or
// postsynaptic to the treenodes of the given skeleton

$t = $db->getResult('SELECT	"tc"."connector_id" AS "connector_id",
        "tc"."user_id" AS "user_id",
        "user"."name" AS "username",
        ("connector"."location")."x" AS "x",
        ("connector"."location")."y" AS "y",
        ("connector"."location")."z" AS "z"
        FROM "treenode_connector" as "tc", "treenode_class_instance" as "tci", "user", "connector"
        WHERE "tc"."relation_id" = '.$relation_id.' AND
        "tc"."user_id" = "user"."id" AND
        "tci"."project_id" = '.$pid.' AND
        "tc"."treenode_id" = "tci"."treenode_id" AND
        "tci"."class_instance_id" = '.$skeletonID.' AND
        "tci"."relation_id" = '.$elementof_id.' AND
        "connector"."id" = "tc"."connector_id"
        '.$sLimit
);

$result = array();

// For each connector, find all the pre/postsynaptic treenodes
// and retrieve the number of treenodes for a given skeleton id
foreach($t as $key => $value) {

    // populate resulting connectors with labels
    $tlabel = $db->getResult('SELECT "class_instance"."name" as "label"
                              FROM "connector_class_instance" AS "cci", "class_instance"
                              WHERE "cci"."project_id" = '.$pid.' AND
                                    "cci"."connector_id" = '.$value["connector_id"].' AND
                                    "cci"."relation_id" = '.$labeledas_id.' AND
                                    "cci"."class_instance_id" = "class_instance"."id" ');
    
    $label_arr = array();
    while ( list( $key, $val) = each( $tlabel ) )
    {
        $label_arr[] = $val['label'];
    }

    if(!empty($tlabel)) {
        $label_string = implode(",", $label_arr);
    } else {
        $label_string = "";
    }

    // Retrieve the treenodes on the "other" side first
    // then retrieve the skeleton ids and count their number of treenodes

    $t2 = $db->getResult('SELECT "tc"."treenode_id" AS "treenode_id",
        "tci"."class_instance_id" AS "skeleton_id",
        "tc"."user_id" AS "user_id"
        FROM "treenode_connector" as "tc", "treenode_class_instance" as "tci"
        WHERE "tc"."relation_id" = '.$relation_inverse_id.' AND
        "tci"."project_id" = '.$pid.' AND
        "tc"."connector_id" = '.$value["connector_id"].' AND
        "tc"."treenode_id" = "tci"."treenode_id" AND
        "tci"."relation_id" = '.$elementof_id.'
        '.$sLimit
    );

    if(!empty($t2)) {
        // loop over treenodes and count the number
        foreach($t2 as $key2 => $value2 ) {
            $data = $value;
            $data["nr_treenodes"] = $db->getTreenodeCountForSkeleton( $pid, $value2["skeleton_id"] );
            $data["labels"] = $label_string;
            $data["treenode_id"] = $value2["treenode_id"];
            $result[] = $data;
        }

    } else {
        // a connector no treenodes beyond counts as zero
        $data = $value;
        $data["nr_treenodes"] = 0;
        $data["labels"] = $label_string;
        $data["treenode_id"] = 0;
        $result[] = $data;
    }

}

// if not empty, sort it
if( !empty($result) ) {
    $result2 = subval_sort($result, fnColumnToField($columnIndex) );
} else {
    $result2 = $result;
}

// build table

$iTotal = count($result2);

reset( $t );

$sOutput = '{';
$sOutput .= '"iTotalRecords": '.$iTotal.', ';
$sOutput .= '"iTotalDisplayRecords": '.$iTotal.', ';
$sOutput .= '"aaData": [ ';

while ( list( $key, $val) = each( $result2 ) )
{
    $sRow = "";
    $sRow .= "[";
    $sRow .= '"'.addslashes($val["connector_id"]).'",';

    $sRow .= '"'.addslashes($val["x"]).'",';
    $sRow .= '"'.addslashes($val["y"]).'",';
    $sRow .= '"'.addslashes($val["z"]).'",';
    $sRow .= '"'.addslashes($val["labels"]).'",';
    $sRow .= '"'.addslashes($val["nr_treenodes"]).'",';
    $sRow .= '"'.addslashes($val["username"]).'",';
    $sRow .= '"'.addslashes($val["treenode_id"]).'"';

    $sRow .= "],";

    /* dummy tag search logic
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
    */
    $sOutput .= $sRow;

}
$sOutput = substr_replace( $sOutput, "", -1 );
$sOutput .= '] }';

echo $sOutput;

?>