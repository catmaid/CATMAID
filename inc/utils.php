<?php

$EDIT_ANY_ALLOWED = 0x01;
$VIEW_ANY_ALLOWED = 0x02;

/** Rollback, echo an error message as JSON and terminate execution. */
function emitErrorAndExit( $db, $error ) {
	if (! $db->rollback() ) {
		$error = $error." AND FAILED TO ROLLBACK!";
	}
	echo json_encode( array ( 'error' => $error ) );
	exit();
}

/** Check if the user with ID $uid can edit the project with ID $pid. */
function checkPermissionsOrExit( $db, $uid, $pid, $permissions ) {
    global $EDIT_ANY_ALLOWED, $VIEW_ANY_ALLOWED;
    $whereCondition = "project_id = $pid AND user_id = $uid";
    if ($permissions & $EDIT_ANY_ALLOWED) {
        $whereCondition .= " AND can_edit_any";
    }
    if ($permissions & $VIEW_ANY_ALLOWED) {
        $whereCondition .= " AND can_view_any";
    }
    $entryCount = $db->countEntries('project_user', $whereCondition);
    if (false === $entryCount || $entryCount < 1) {
        echo json_encode( array ( 'error' => "Permission denied to user with ID $uid to project ID $pid" ) );
        exit();
    }
}

?>
