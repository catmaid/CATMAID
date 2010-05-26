<?php

set_time_limit( 0 );

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'setup.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB( 'write' );
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$sid = isset( $_REQUEST[ 'sid' ] ) ? intval( $_REQUEST[ 'sid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$left = isset( $_REQUEST[ 'left' ] ) ? floatval( $_REQUEST[ 'left' ] ) : 0;
$top = isset( $_REQUEST[ 'top' ] ) ? floatval( $_REQUEST[ 'top' ] ) : 0;
$front = isset( $_REQUEST[ 'front' ] ) ? floatval( $_REQUEST[ 'front' ] ) : 0;
$right = isset( $_REQUEST[ 'right' ] ) ? floatval( $_REQUEST[ 'right' ] ) : 0;
$bottom = isset( $_REQUEST[ 'bottom' ] ) ? floatval( $_REQUEST[ 'bottom' ] ) : 0;
$back = isset( $_REQUEST[ 'back' ] ) ? floatval( $_REQUEST[ 'back' ] ) : 0;
$scale = isset( $_REQUEST[ 'scale' ] ) ? floatval( $_REQUEST[ 'scale' ] ) : 1;
$reregister = ( isset( $_REQUEST[ 'reregister' ] ) && $_REQUEST[ 'reregister' ] == 1 ) ? 'true' : 'false';

if ( $pid )
{
	if ( $uid )
	{
		// check if stack and project exist and if the user can edit the project
		$stacks = $db->getResult(
				'SELECT	DISTINCT ON ( "sid" ) "stack"."id" AS "sid",
						("project_stack"."translation")."x" AS "t.x",
						("project_stack"."translation")."y" AS "t.y",
						("project_stack"."translation")."z" AS "t.z",
						("stack"."resolution")."x" AS "r.x",
						("stack"."resolution")."y" AS "r.y",
						("stack"."resolution")."z" AS "r.z",
						"stack"."image_base" AS "image_base"
			
					FROM "project_user" INNER JOIN "project_stack"
								ON "project_user"."project_id" = "project_stack"."project_id" INNER JOIN "stack"
									ON "stack"."id" = "project_stack"."stack_id"
			
						WHERE	"project_user"."project_id" = '.$pid.' AND
								"stack"."id" = '.$sid.' AND
								"project_user"."user_id" = '.$uid );
				
		$canEdit = sizeof( $stacks ) > 0;
		
		if ( $canEdit )
		{
			$stack =& $stacks[ 0 ];
			
			$x1 = ( $left - $stack[ 't.x' ] ) / $stack[ 'r.x' ];
			$y1 = ( $top - $stack[ 't.y' ] ) / $stack[ 'r.y' ];
			$z1 = ( $front - $stack[ 't.z' ] ) / $stack[ 'r.z' ];
			
			$x2 = ( $right - $stack[ 't.x' ] ) / $stack[ 'r.x' ];
			$y2 = ( $bottom - $stack[ 't.y' ] ) / $stack[ 'r.y' ];
			$z2 = ( $back - $stack[ 't.z' ] ) / $stack[ 'r.z' ];
					
			$stack_name = uniqid( 'crop' ).'.tif';
			
			// TrakEM2_.jar is included from jars instead of plugins because it is a non-tracked experimental thing
			$cmd =
//					'Xvfb :15 &; '.
					'DISPLAY=:15 java -Xmx768m -classpath '.
					JAVA_APP_DIR.':'.
					JAVA_APP_DIR.'ij.jar:'.
					JAVA_APP_DIR.'plugins/VIB_.jar:'.
					JAVA_APP_DIR.'jars/Jama-1.0.2.jar:'.
					JAVA_APP_DIR.'jars/edu_mines_jtk.jar:'.
					JAVA_APP_DIR.'jars/postgresql-8.2-506.jdbc3.jar:'.
					JAVA_APP_DIR.'jars/jzlib-1.0.7.jar:'.
					JAVA_APP_DIR.'jars/TrakEM2_.jar Microcube_Maker '.
					$stack[ 'image_base' ].'project.xml '.
					$x1.' '.$y1.' '.$z1.' '.
					$x2.' '.$y2.' '.$z2.' '.
					$scale.' '.$reregister.' '.
			//		TMP_DIR.$stack_name.' 2>&1';
					TMP_DIR.$stack_name.' 2>&1 >> '.TMP_DIR.$stack_name.'.log';
			
			//echo makeJSON( array( 'error' => $cmd ) );
			//$out =  shell_exec( $cmd );
			//$out =  shell_exec( 'which java' );
			//echo makeJSON( array( 'error' => $out ) );
			
			$url = 'http://'.$_SERVER[ 'SERVER_NAME' ].preg_replace( '/\/[^\/]*$/', '/', $_SERVER[ 'PHP_SELF' ] );

			//echo makeJSON( array( 'error' => $url ) );
			//exit;

			//! @todo invoke the crop process here and implement an appropriate answer
			
			//ob_end_clean();
			header( 'Connection: close' );
			ignore_user_abort( true );
			ob_start();
			
			echo makeJSON( '' );
			
			header( 'Content-Length: '.ob_get_length() );
			ob_end_flush();
			flush();
			
			shell_exec( $cmd );
			
					
			$db->insertInto(
				'message',
				array(
					'user_id' => $uid,
					'title' => 'Microstack finished',
					'text' => 'The requested microstack ( '.$left.', '.$top.', '.$front.' ) -> ( '.$right.', '.$bottom.', '.$back.' ) is finished.  You can download it from this location: '.$url.'crop.download.php?file='.$stack_name,
//					'text' => $out,
					'action' => $url.'crop.download.php?file='.$stack_name ) );
		}
		else
			echo makeJSON( array( 'error' => 'You do not have the permission to crop from this stack.' ) );
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to crop microstacks.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed while cropping a microstack. Please re-open project and stack and try again.' ) );
	
?>
