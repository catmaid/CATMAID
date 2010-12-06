<?php

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$top = isset( $_REQUEST[ 'top' ] ) ? floatval( $_REQUEST[ 'top' ] ) : 0;
$left = isset( $_REQUEST[ 'left' ] ) ? floatval( $_REQUEST[ 'left' ] ) : 0;
$width = isset( $_REQUEST[ 'width' ] ) ? floatval( $_REQUEST[ 'width' ] ) : 0;
$height = isset( $_REQUEST[ 'height' ] ) ? floatval( $_REQUEST[ 'height' ] ) : 0;
$zres = isset( $_REQUEST[ 'zres' ] ) ? floatval( $_REQUEST[ 'zres' ] ) : 0;

// the scale factor to volume bound the query in z-direction based on the z-resolution
$zbound = 0.5;


if ( $pid )
{
  if ( $uid )
  {
    
    $treenodes = $db->getResult(
      'SELECT DISTINCT ON ( "tlnid" ) "treenode"."id" AS "tlnid",
          "treenode"."parent_id" AS "parentid",
          ("treenode"."location")."x" AS "x",
          ("treenode"."location")."y" AS "y",
          ("treenode"."location")."z" AS "z",
          "treenode"."confidence" AS "confidence",
          "treenode"."user_id" AS "user_id",
          "treenode"."radius" AS "radius",
          abs( ("treenode"."location")."z" - ("treenode"."location")."z" ) AS "z_diff"
        
        FROM "treenode" INNER JOIN "project"
            ON "project"."id" = "treenode"."project_id" LEFT JOIN "project_user"
              ON "project"."id" = "project_user"."project_id" INNER JOIN "project_stack"
                ON "project"."id" = "project_stack"."project_id"
          
          WHERE "project"."id" = '.$pid.' AND
              ( "project_user"."user_id" = '.$uid.' OR
                "project"."public" ) AND
              ("treenode"."location")."x" >= '.$left.' AND
              ("treenode"."location")."x" <= '.( $left + $width ).' AND
              ("treenode"."location")."y" >= '.$top.' AND
              ("treenode"."location")."y" <= '.( $top + $height ).' AND
              ("treenode"."location")."z" >= '.$z.' - '.$zbound.' * '.$zres.' AND
              ("treenode"."location")."z" <= '.$z.' + '.$zbound.' * '.$zres.'
          
          ORDER BY "tlnid", "z_diff"'
    );
  
    echo makeJSON( $treenodes );

  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to list treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>