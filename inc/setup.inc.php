<?php

//===============================================================================
// Database section
							
/**#@+
 * @global array
 *
 * database accounts
 *
 * @access private
 */
$db_host[ 'write' ]	= 'localhost';
$db_user[ 'write' ]	= 'catmaid_user';
$db_pw[ 'write' ]	= 'catmaid_user_password';
$db_db[ 'write' ]	= 'catmaid';
$db_host[ 'read' ]	= 'localhost';
$db_user[ 'read' ]	= 'catmaid_user';
$db_pw[ 'read' ]	= 'catmaid_user_password';
$db_db[ 'read' ]	= 'catmaid';
/**#@-*/


//===============================================================================

//===============================================================================
// Constants

// Format Strings

define( 'PG_DATETIME', 'YYYY-MM-DD HH24:MI:SS TZ' );

// Cache

define( 'CACHE_MINUTE', 60 );
define( 'CACHE_HOUR', 3600 );
define( 'CACHE_DAY', 86400 );
define( 'CACHE_WEEK', 604800 );
define( 'CACHE_MONTH', 2592000 );
define( 'CACHE_INFINITY', 322080000 );	//!< 20 years - this should be enough

// Directories

/**
 * directory for temporary files
 */
define( 'TMP_DIR', preg_replace( '=/[^/]*$=', '/', $_SERVER[ 'DOCUMENT_ROOT' ] ).'tmp/' );

/**
 * directory for temporary files
 */
define( 'JAVA_APP_DIR', preg_replace( '=/[^/]*$=', '/', $_SERVER[ 'DOCUMENT_ROOT' ] ).'bin/fiji/' );

// Images

define( 'TILE_WIDTH', 256 );	//!< width of a single tile
define( 'TILE_HIEGHT', 256 );	//!< height of a single tile

//===============================================================================

?>
