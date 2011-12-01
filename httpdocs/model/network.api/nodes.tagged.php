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

# Tag
$tag = isset( $_REQUEST[ 'tag' ] ) ? pg_escape_string( $_REQUEST[ 'tag' ] ) : false;

if (false === $tag) {
  echo json_encode( array('error' => 'Invalid text tag:"'.$tag.'"'));
  return;
}

# Max results
$limit = isset( $_REQUEST[ 'limit' ] ) ? intval( $_REQUEST[ 'limit' ] ) : 0;

# Check preconditions:

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

# Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}


try {

  # Relation 'labeled_as'
  $labeled_as_id = $db->getRelationId( $pid, 'labeled_as' );
  if (false === $labeled_as_id || !$labeled_as_id) {
    emitErrorAndExit( $db, 'Cannot find "labeled_as" relation for this project.' );
  }

  # Select treenodes labeled as tag
  $q = $db->getResult(
    'SELECT treenode.id,
            (treenode.location).x,
            (treenode.location).y, 
            (treenode.location).z,
            treenode.confidence,
            treenode.parent_id,
            treenode.user_id,
            tci.class_instance_id AS skeleton_id
    FROM treenode,
         treenode_class_instance AS tci,
         class_instance as ci
    WHERE tci.project_id = '.$pid.'
      AND tci.relation_id = '.$labeled_as_id.'
      AND tci.treenode_id = treenode.id
      AND ci.name = \''.$tag.'\'');

  if (false === $q) {
    emitErrorAndExit($db, 'Failed to retrieve treenodes with tag "'.$tag.'"');
  }

  foreach ($q as &$p) {
    # Each node may have more than one tag.
    # Select all text labels for each node that matched $tag
    $tags = $db->getResult(
      'SELECT "class_instance"."name"
      FROM "treenode_class_instance" AS "tci",
           "class_instance"
      WHERE "tci"."project_id" = '.$pid.'
        AND "tci"."treenode_id" = '.$p['id'].'
        AND "tci"."relation_id" = '.$labeled_as_id.'
        AND "tci"."class_instance_id" = "class_instance"."id"');
  
    if (false === $tags) {
      emitErrorAndExit( $db, 'Failed to retrieve tags for treenode '.$p['id']);
    }
    
    if (count($tags) > 0) {
      $a = array();
      foreach ($tags as $tag) { $a[] = $tag['name']; }
      $p['tags'] = $a;
    } else {
      $p['tags'] = null;
    }

    # Convert numeric entries to integers
    $p['id'] = (int)$p['id'];
    $p['x'] = (int)$p['x'];
    $p['y'] = (int)$p['y'];
    $p['z'] = (int)$p['z'];
    $p['confidence'] = (int)$p['confidence'];
    $p['user_id'] = (int)$p['user_id'];
    $p['parent_id'] = (int)$p['parent_id'];
    $p['skeleton_id'] = (int)$p['skeleton_id'];
  }

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

  echo json_encode( $q );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
