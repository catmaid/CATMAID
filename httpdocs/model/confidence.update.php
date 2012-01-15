<?php
// return all labels in the project

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

$confidence = isset( $_REQUEST[ 'confidence' ] ) ? intval( $_REQUEST[ 'confidence' ] ) : 0;

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : 0;
if (isset($_REQUEST['toconnector'])) {
    if ($_REQUEST['toconnector'] === 'true') {
        $toconnector = TRUE;
    } else {
        $toconnector = FALSE;
    }
} else {
    $toconnector = FALSE;
}

$connector = isset( $_REQUEST[ 'connector' ] ) ? intval( $_REQUEST[ 'cid' ] ) : 0;

# 1. There must be a project id
if ( ! $pid ) {
	echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 2. There must be a user id
if ( ! $uid ) {
	echo json_encode( array( 'error' => 'You are not logged in.' ) );
	return;
}

# 3. Permissions?
canEditOrExit($db, $uid, $pid);

# Is the confidence a valid value?
if ($confidence < 1 || $confidence > 5) {
	echo json_encode( array( 'error' => 'The confidence must be between 1 and 5 inclusive.') );
	return;
}

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

	if ($toconnector > 0) {
		// If both the connector ID and treenode ID are
		// presend, change the confidence of the corresponding
		// treenode_connector.

		$result = $db->update("treeenode_connector",
				      array("confidence" => $confidence),
				      "treenode_id = $tnid");

		if (false === $result) {
			emitErrorAndExit($db, "Failed to update confidence of treenode_connector between treenode $tnid and connector $cid");
		}

	} else {
		// Otherwise just chage the confidence of the treenode:
		$result = $db->update("treenode",
				      array("confidence" => $confidence),
				      "id = $tnid");
		if (false === $result) {
			emitErrorAndExit($db, "Failed to update confidence of treenode $tnid");
		}
	}

	if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

	echo json_encode( array('message' => 'success') );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
