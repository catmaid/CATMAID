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

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;

if ( $pid )
{
  if ( $uid )
  {
    // rereoot skeleton
    //rerootSkeleton( $pid, $uid, $tnid );
    
    $current_id = $tnid;
    $parent_res = $db->getResult('SELECT "treenode"."parent_id" AS "parent_id" FROM "treenode" WHERE
        "treenode"."id" = '.$current_id.' AND
        "treenode"."project_id" = '.$pid); 
 
   if(!empty($parent_res)) {
    
    $parent_id = $parent_res[0]['parent_id'];
    
    while($parent_id != null ) {
      
      // echo current_id with parent
      
      // temporary retrieval of parents's parent
      $parents_parent_res = $db->getResult('SELECT "treenode"."parent_id" AS "parent_id" FROM "treenode" WHERE
        "treenode"."id" = '.$parent_id.' AND "treenode"."project_id" = '.$pid); 
      $par_tmp = $parents_parent_res[0]['parent_id'];
      
      // update(parent).parentid = current_id
      $ids = $db->update("treenode", array("parent_id" => $current_id) ,' "treenode"."id" = '.$parent_id);
      
      // current = parrent
      $current_id = $parent_id;
      // parent = select(current).parent (already updated, need to retrieve it before)
      $parent_id = $par_tmp;      
    }
    
    // finally make tnid root
    $ids = $db->getResult('UPDATE "treenode" SET "parent_id" = NULL WHERE "treenode"."id" = '.$tnid);
      
    // echo "Successfully rerooted";
    echo json_encode( array( 'newroot' => $tnid ) );
    
   }
    else {
      // no parent found or is root, then return
      echo makeJSON( array( 'error' => 'An error occured while rerooting. No valid query result.' ) );
    }

  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to add treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>