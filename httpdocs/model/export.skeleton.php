<?php

// writes skeleton to SWC

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );
include_once( 'utils.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : 0;

# 1. There must be a project id
if ( ! $pid ) {
  echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
  return;
}

# 2. There must be a user id
if ( ! $uid ) {
    echo json_encode( array( 'error' => 'You are not logged in.' ) );
  return;
}

# 3. Permissions?
canEditOrExit($db, $uid, $pid);

// Start transaction
if (! $db->begin() ) {
  echo json_encode( array( 'error' => 'Could not start transaction.' ) );
  return;
}

try {
  $ele_id = $db->getRelationId( $pid, 'element_of' );
  if (!$ele_id) { echo makeJSON( array( 'error' => 'Can not find "element_of" relation for this project' ) ); return; }

  $skelid = isset( $_REQUEST[ 'skeletonid' ] ) ? intval( $_REQUEST[ 'skeletonid' ] ) : 0;
  if( ! $skelid ) {
      if( ! $tnid ) {
          emitErrorAndExit( $db, 'export.skeleton.php requires either a treenode ID or a skeleton ID');
      }
      // retrieve skeleton for treenode
      $res = $db->getClassInstanceForTreenode( $pid, $tnid, "element_of");

      if(!empty($res)) {$skelid = $res[0]['class_instance_id']; }
      else {
          emitErrorAndExit( $db, 'There seems not to exist a skeleton for treenode id ');
      }
  }
  // SWC columns are
  // unique identity value for trace point, structure type, x coordinate, y coordinate,
  // z coordinate, radius, identity value for parent
  
  $res = $db->getResult(
  'SELECT "treenode"."id", ("treenode"."location")."x", ("treenode"."location")."y", 
  ("treenode"."location")."z",
  "treenode"."confidence", "treenode"."parent_id" FROM "treenode_class_instance" AS "tci", "treenode"
  WHERE "tci"."project_id" = '.$pid.' AND
  "tci"."relation_id" = '.$ele_id.' AND
  "tci"."class_instance_id" = '.$skelid.' AND
  "treenode"."id" = "tci"."treenode_id"
  ORDER BY "treenode"."parent_id" DESC');
  
  if (false === $res) {
    emitErrorAndExit($db, 'Failed to select list of treenodes for skeleton #'.$skelid);
  }

  foreach ($res as $key => $ele) {
    $out = "";
    $out .= $ele['id']." ";
    $out .= '0 '; // SWC type
    $out .= $ele['x']." ";
    $out .= $ele['y']." ";
    $out .= $ele['z']." ";
    $out .= "0 "; // radius
    if ("" == $ele['parent_id'])
      $out .= "-1\n";
    else
      $out .= $ele['parent_id']."\n";
    
    echo $out;
  }
    //header("Cache-Control: must-revalidate, post-check=0, pre-check=0");
    //header('Content-Type: application/csv');
    //header('Content-Disposition: attachment; filename=test.csv');
    //header("Content-Length: " . strlen($out));
    //echo(var_dump($res));
    //echo date("l");
    //echo "\r\n";
    // XXX retrieve treenodes with parent and location information
    //exit;
    //echo json_encode($res);
  
  // Commit after echo'ing: ok because it's all reading only.
  if (! $db->commit() ) {
    // Not needed, but be nice to postgres
    emitErrorAndExit( $db, 'Failed to commit!' );
  }
    
} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
