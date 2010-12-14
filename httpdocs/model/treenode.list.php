<?php

include_once( 'errors.inc.php' );
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
$zbound = 1.0;
// limit number of retrieved treenodes
$limit = 400;

if ( $pid )
{
  if ( $uid )
  {
    
    $treenodes = $db->getResult(
      'SELECT "treenode"."id" AS "tlnid",
          "treenode"."parent_id" AS "parentid",
          ("treenode"."location")."x" AS "x",
          ("treenode"."location")."y" AS "y",
          ("treenode"."location")."z" AS "z",
          "treenode"."confidence" AS "confidence",
          "treenode"."user_id" AS "user_id",
          "treenode"."radius" AS "radius",
          ( ("treenode"."location")."z" - '.$z.' ) AS "z_diff"
        
        FROM "treenode" INNER JOIN "project"
            ON "project"."id" = "treenode"."project_id"
          
          WHERE "project"."id" = '.$pid.' AND
              ("treenode"."location")."x" >= '.$left.' AND
              ("treenode"."location")."x" <= '.( $left + $width ).' AND
              ("treenode"."location")."y" >= '.$top.' AND
              ("treenode"."location")."y" <= '.( $top + $height ).' AND
              ("treenode"."location")."z" >= '.$z.' - '.$zbound.' * '.$zres.' AND
              ("treenode"."location")."z" <= '.$z.' + '.$zbound.' * '.$zres.'
          
          ORDER BY "parentid" DESC,"tlnid", "z_diff" LIMIT '.$limit
    );
    echo json_encode( $treenodes );

  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to list treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>