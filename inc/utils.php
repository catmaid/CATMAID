<?php

/** Rollback, echo an error message as JSON and terminate execution. */
function emitErrorAndExit( $db, $error ) {
	if (! $db->rollback() ) {
		$error = $error." AND FAILED TO ROLLBACK!";
	}
	echo json_encode( array ( 'error' => $error ) );
	exit();
}

/** Check if the user with ID $uid can edit the project with ID $pid. */
function canEditOrExit( $db, $uid, $pid ) {
  $entryCount = $db->countEntries(
    'project_user',
    '"project_id" = '.$pid.' AND "user_id" = '.$uid );
  if (false === $entryCount || $entryCount < 1) {
    echo json_encode( array ( 'error' => 'User #'.$uid.' cannot edit project #'.$pid ) );
    exit();
  }
}

?>
