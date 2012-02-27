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

# Treenode id
$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;

# Check preconditions:

# 1. There must be a treenode id
if ( ! $tnid ) {
	echo json_encode( array( 'error' => 'A treenode id has not been provided!' ) );
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

# 4. The user must be allowed to view annotations:
checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
  # Relation 'element_of'
  $ele_id = $db->getRelationId( $pid, 'element_of' );
  if (false === $ele_id || !$ele_id) {
    emitErrorAndExit( $db, 'Cannot find "element_of" relation for this project.' );
  }
  # Relation 'labeled_as'
  $labeled_as_id = $db->getRelationId( $pid, 'labeled_as' );
  if (false === $labeled_as_id || !$labeled_as_id) {
    emitErrorAndExit( $db, 'Cannot find "labeled_as" relation for this project.' );
  }

  # Select info for the given treenode ID
  $q = $db->getResult(
  'SELECT treenode.id,
          (treenode.location).x,
          (treenode.location).y,
          (treenode.location).z,
          treenode.confidence,
          treenode.user_id,
          treenode.parent_id,
          tci.class_instance_id AS skeleton_id
  FROM treenode_class_instance AS tci,
       treenode
  WHERE tci.project_id = '.$pid.'
    AND treenode.id = '.$tnid.'
    AND tci.relation_id = '.$ele_id.'
    AND treenode.id = tci.treenode_id');

  if (false === $q) {
    emitErrorAndExit($db, 'Failed to retrieve information for treenode #'.$tnid);
  }

  if (count($q) > 1) {
    emitErrorAndExit($db, 'Found not 1 but '.count($q).' nodes in the database!');
  }

  # Only one row expected
  $q = $q[0];
  
  # Convert numeric entries to integers
  $q['id'] = (int)$q['id'];
  $q['x'] = (int)$q['x'];
  $q['y'] = (int)$q['y'];
  $q['z'] = (int)$q['z'];
  $q['confidence'] = (int)$q['confidence'];
  $q['user_id'] = (int)$q['user_id'];
  $q['parent_id'] = (int)$q['parent_id'];
  $q['skeleton_id'] = (int)$q['skeleton_id'];


  # Select text labels for node $tnid
  $tags = $db->getResult(
		'SELECT "class_instance"."name"
		FROM "treenode_class_instance" AS "tci",
         "class_instance"
		WHERE "tci"."project_id" = '.$pid.'
      AND "tci"."treenode_id" = '.$tnid.'
      AND "tci"."relation_id" = '.$labeled_as_id.'
      AND "tci"."class_instance_id" = "class_instance"."id"');

  if (false === $tags) {
    emitErrorAndExit( $db, 'Failed to retrieve tags for treenode '.$tnid);
  }

  if (count($tags) > 0) {
    $a = array();
    foreach ($tags as $tag) { $a[] = $tag['name']; }
    $q['tags'] = $a;
  } else {
    $q['tags'] = null;
  }

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

  echo json_encode( $q );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
