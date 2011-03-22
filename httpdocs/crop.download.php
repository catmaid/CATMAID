<?php

include_once( 'errors.inc.php' );
include_once( 'setup.inc.php' );
include_once( 'tools.inc.php' );

$file = false;
if( isset( $_REQUEST[ 'file' ] ) ) {
	// Just use the first sequence of one or more word characters:
	$file = preg_replace( '/.*?([A-Za-z0-9\.\-_]+).*/', '\1', $_REQUEST[ 'file' ] );
}

clearstatcache();
$list = getFileList( TMP_DIR );
foreach ( $list as $item )
{
	// delete files older than two weeks
	//echo time(), ' - ', filemtime( TMP_DIR.$item ), ' = ', ( time() - filemtime( TMP_DIR.$item ) );
	if (
			preg_match( '/crop.*\.tif$/', $item ) &&
			( time() - filemtime( TMP_DIR.$item ) > 1209600 ) )
		unlink( TMP_DIR.$item );
}

if ( $file && $file_handle = @fopen( TMP_DIR.$file, 'r' ) )
{
	header( 'Content-Type: image/tiff' );
	header( 'Content-Disposition: attachment; filename="'.$file.'"' );
	fpassthru( $file_handle );
	
}
else
{
	sleep( 2 );
	echo 'File doesn\'t exist.';
}
	
?>
