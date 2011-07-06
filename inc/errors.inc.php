<?php

// Configure the error reporting here:

ini_set( 'error_reporting', -1 );
ini_set( 'display_errors', true );

/* First, set a default exception handler with set_exception_handler:
 *   http://php.net/manual/en/function.set-exception-handler.php
 */

function handleException($e) {
    header('HTTP/1.1 500 Internal Server Error');
    $message = "Uncaught exception with class: " . get_class($e) . ", message: " . $e->getMessage() . " at line: " . $e->getLine();
    error_log($message);
    echo($message);
}

set_exception_handler('handleException');

/* Also set an error handler with set_error_handler, following the
 * example here:
 *   http://php.net/manual/en/function.set-error-handler.php
 *	
 *	Test with:
 *	trigger_error('Blabla', E_USER_ERROR);
 */

function handleError($errno, $errstr, $errfile, $errline)
{

    if (!(error_reporting() & $errno)) {
        // This error code is not included in error_reporting
        return;
    }

		// Sent to the try/catch if any,
		// or else goes to the default exception handler (see above)
		// which according to the manual dies after execution.
 		throw new ErrorException($errstr, 0, $errno, $errfile, $errline);

    /* Still execute the PHP internal error handler */

		// NEVER die here or transactions cannot be rolled back.
		// NEVER return anything or execution doesn't stop.
}

set_error_handler('handleError');

?>
