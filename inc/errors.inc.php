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
 */

function handleError($errno, $errstr, $errfile, $errline)
{
    header("HTTP/1.1 500 Internal Server Error");

    if (!(error_reporting() & $errno)) {
        // This error code is not included in error_reporting
        return;
    }

    switch ($errno) {
    case E_USER_ERROR:
        echo "E_USER_ERROR [$errno] $errstr\n";
        echo "  Fatal error on line $errline in file $errfile";
        break;

    case E_USER_WARNING:
        echo "E_USER_WARNING [$errno] $errstr\n";
        break;

    case E_USER_NOTICE:
        echo "E_USER_NOTICE [$errno] $errstr\n";
        break;

    default:
        echo "Unknown error type: [$errno] $errstr\n";
        break;
    }

    /* Still execute the PHP internal error handler */
    return false;
}

set_error_handler('handleError');

?>
