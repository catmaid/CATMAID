<?php

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

# Connector id
$cid = isset( $_REQUEST[ 'cid' ] ) ? intval( $_REQUEST[ 'cid' ] ) : -1;

# Check preconditions:

# 1. There must be a connector id
if ( ! $cid ) {
	echo json_encode( array( 'error' => 'A connector id has not been provided!' ) );
	return;
}

# 2. There must be a project id
if ( ! $pid ) {
  echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 3. There must be a user id
if ( ! $uid ) {
    echo json_encode( array( 'error' => 'You are not logged in.' ) );
	return;
}

# Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
  $elementof_id = $db->getRelationId( $pid, 'element_of' );
  if (false === $elementof_id || !$elementof_id) {
    emitErrorAndExit( $db, 'Cannot find "element_of" relation for this project' );
  }
  $presyn_id = $db->getRelationId( $pid, 'presynaptic_to' );
  if (false === $presyn_id) {
    echo emitErrorAndExit($db, 'Cannot find "presynaptic_to" relation for this project');
    return;
  }
  $postsyn_id = $db->getRelationId( $pid, 'postsynaptic_to' );
  if (false === $postsyn_id) {
    echo emitErrorAndExit($db, 'Cannot find "postsynaptic_to" relation for this project');
    return;
  }

  # Select connector with ID $cid
  $p = $db->getResult(
    'SELECT	id,
            user_id,
            ("location")."x" AS "x",
            ("location")."y" AS "y",
            ("location")."z" AS "z"
    FROM connector
    WHERE project_id = '.$pid.'
      AND id = '.$cid);

  if (false === $p) {
    emitErrorAndExit($db, 'Failed to retrieve connectors for skeleton #'.$skid);
  }
  
  if (1 != count($p)) {
    emitErrorAndExit($db, 'Found not 1 but '.count($p).' rows for connector with ID #'.cid);
  }
  
  # Expecting only one entry
  $p = $p[0];

  # Fetch all presynaptic and postsynaptic node IDs and their skeleton IDs
  $pp = $db->getResult(
    'SELECT "tc"."treenode_id" AS "node_id",
            "tc"."relation_id",
            "tci"."class_instance_id" AS "skeleton_id"
    FROM "treenode_connector" AS "tc",
         "treenode_class_instance" AS "tci"
    WHERE "tci"."project_id" = '.$pid.'
      AND ("tc"."relation_id" = '.$presyn_id.' OR "tc"."relation_id" = '.$postsyn_id.')
      AND "tc"."connector_id" = '.$cid.'
      AND "tc"."treenode_id" = "tci"."treenode_id"
      AND "tci"."relation_id" = '.$elementof_id);

  if (false === $pp) {
    emitErrorAndExit($db, 'Failed to retrieve treenodes for connector '.$p['id']);
  }

  # Separate them into pre and post
  $pPre = array();
  $pPost = array();

  foreach ($pp as &$t) {
    # As ints
    $t['node_id'] = (int)$t['node_id'];
    $t['skeleton_id'] = (int)$t['skeleton_id'];
    $rel = $t['relation_id'];
    # Remove
    unset($t['relation_id']);
    # Sort
    if ($presyn_id == $rel) {
      $pPre[] = $t; # passes a copy
    } else {
      $pPost[] = $t;
    }
  }

  # Convert numeric entries to integers
  $p['id'] = (int)$p['id'];
  $p['user_id'] = (int)$p['user_id'];
  $p['x'] = (int)$p['x'];
  $p['y'] = (int)$p['y'];
  $p['z'] = (int)$p['z'];

  # Add all found pre and post treenodes and skeletons
  $p['pre'] = $pPre;
  $p['post'] = $pPost;

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

  echo json_encode( $p );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>


