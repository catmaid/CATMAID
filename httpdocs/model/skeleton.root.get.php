<?php
// return all labels in the project

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$skelid = isset( $_REQUEST[ 'skeletonid' ] ) ? intval( $_REQUEST[ 'skeletonid' ] ) : 0;

if ( $pid )
{
  if ( $uid )
  {

    $eof_id = $db->getRelationId( $pid, 'element_of' );
    if(!$eof_id) { echo makeJSON( array( 'error' => 'Can not find "element_of" relation for this project' ) ); return; }
    
    // retrieve parent from tci
	  $res = $db->getResult('SELECT "tci"."treenode_id" AS "id", "tn"."parent_id" AS "parent",
	  					("tn"."location")."x" AS "x",
						("tn"."location")."y" AS "y",
						("tn"."location")."z" AS "z" 
	   FROM "treenode_class_instance" as "tci", "treenode" as "tn"
		WHERE 
		"tci"."treenode_id" = "tn"."id" AND
		"tci"."project_id" = '.$pid.' AND
		"tci"."class_instance_id" = '.$skelid.' AND
		"tci"."relation_id" = '.$eof_id.' AND
		"tn"."parent_id" is null');
     
    if(!empty($res)) {
		echo makeJSON( array( 'root_id' => $res[0]['id'],
		 'x' => $res[0]['x'],
		 'y' => $res[0]['y'],
		 'z' => $res[0]['z']) );
    } else {
		echo makeJSON( array( 'error' => 'Could not find a root node for skeleton. You might want to remove it.' ) );
    }
    
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to get the root node.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
