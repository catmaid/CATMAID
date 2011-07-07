<?php

/** Rollback, echo an error message as JSON and terminate execution. */
function emitErrorAndExit( $db, $error ) {
	if (! $db->rollback() ) {
		$error = $error." AND FAILED TO ROLLBACK!";
	}
	echo json_encode( array ( 'error' => $error ) );
	exit();
}


?>
