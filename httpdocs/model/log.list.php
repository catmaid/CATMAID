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

checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

// relation type
// use, 0 for presynaptic_to, 1 for postsynaptic_to
$user_id = isset( $_REQUEST[ 'user_id' ] ) ? intval( $_REQUEST[ 'user_id' ] ) : 0;
$maxrows = 200;

$columnToFieldArray = array( "user_id", "operation", "timestamp", "x", "y", "z", "freetext");

function fnColumnToField( $i ) {
    global $columnToFieldArray;
    return $columnToFieldArray[$i];
}

// Start transaction: ensure all queries are consistent
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

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

    $userId = isset( $_REQUEST['user_id'] ) ? intval( $_REQUEST['user_id'] ) : 0;

    if( $userId !== 0 && $userId !== -1 ) {
        $userWhere = 'AND "log"."user_id" = '.$userId;
    } else {
        $userWhere = '';
    }

	// get log
	$t = $db->getResult(
		'SELECT "log"."operation_type" AS "operation",
				"log"."freetext" AS "freetext",
				("log"."location")."x" AS "x",
				("log"."location")."y" AS "y",
				("log"."location")."z" AS "z",
				"user"."name" AS "username",
				to_char("log"."creation_time", \'DD-MM-YYYY HH24:MI\') AS "timestamp"
			FROM "log", "user"
			WHERE "log"."project_id" = '.$pid.' AND
			      "log"."user_id" = "user"."id"
			      '.$userWhere.'
				  '.$sOrder.'
				  '.$sLimit);

	if (false === $t) {
		emitErrorAndExit($db, 'Cound not get the log list.');
	}

	$iTotal = count($t);
	reset( $t );
	$sOutput = '{';
	$sOutput .= '"iTotalRecords": '.$iTotal.', ';
	$sOutput .= '"iTotalDisplayRecords": '.$iTotal.', ';
	$sOutput .= '"aaData": [ ';
	$i = 0;
	while ( list( $key, $val) = each( $t ) )
	{
		$sRow = "";
		$sRow .= "[";
		$sRow .= json_encode($val["username"]).',';
		$sRow .= json_encode($val["operation"]).',';
		$sRow .= json_encode($val["timestamp"]).',';
		$sRow .= json_encode(sprintf("%.2f",$val["x"])).',';
		$sRow .= json_encode(sprintf("%.2f",$val["y"])).',';
		$sRow .= json_encode(sprintf("%.2f",$val["z"])).',';
		$sRow .= json_encode($val["freetext"]);
		$sRow .= "]";
		$i++;
		if( $iTotal < $i || $i === 1 ) {
		    $sOutput .= $sRow;
		} else {
		    $sOutput .= ','.$sRow;
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
