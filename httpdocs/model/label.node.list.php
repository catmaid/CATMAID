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

$cid = isset( $_REQUEST[ 'cid' ] ) ? intval( $_REQUEST[ 'cid' ] ) : 0;
$nid = isset( $_REQUEST[ 'nid' ] ) ? intval( $_REQUEST[ 'nid' ] ) : 0;
$ntype = isset( $_REQUEST[ 'ntype' ] ) ? $_REQUEST[ 'ntype' ] : 'treenode';

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

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

  $label_id = $db->getClassId( $pid, 'label' );
  if(!$label_id) { echo makeJSON( array( 'error' => 'Can not find "label" class for this project' ) ); return; }
  
  $labeled_as_id = $db->getRelationId( $pid, 'labeled_as' );
  if(!$labeled_as_id) { echo makeJSON( array( 'error' => 'Can not find "labeled_as" relation for this project' ) ); return; }
  
  if ($ntype == "treenode") {
    $res = $db->getResult('SELECT "ci"."name" as "name" FROM "class_instance" as "ci", "treenode_class_instance" as "tci" WHERE
    "tci"."treenode_id" = '.$nid.' AND
    "tci"."class_instance_id" = "ci"."id" AND
    "tci"."relation_id" = '.$labeled_as_id.' AND
    "ci"."class_id" = '.$label_id.' AND 
    "ci"."project_id" = '.$pid);
    
  } else if ($ntype == "location") {
    $res = $db->getResult('SELECT "ci"."name" as "name" FROM "class_instance" as "ci", "connector_class_instance" as "cci" WHERE
    "cci"."connector_id" = '.$nid.' AND
    "cci"."class_instance_id" = "ci"."id" AND
    "cci"."relation_id" = '.$labeled_as_id.' AND
    "ci"."class_id" = '.$label_id.' AND 
    "ci"."project_id" = '.$pid);
    
  }
  
  if (false === $res) {
    emitErrorAndExit($db, 'Failed to select data for labels.');
  }

  $list = array();
  foreach($res as $key => $val) {
    if(empty($list[$nid]))
    {
      $list[$nid] = array();
      $list[$nid][] = $val['name'];
    } else {
      $list[$nid][] = $val['name'];
    }
    
  }
  
  if (! $db->commit() ) {
    // No need to commit, just be nice to postgres
    emitErrorAndExit( $db, 'Failed to commit!' );
  }
  
  echo json_encode( $list );
    
} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>

  
