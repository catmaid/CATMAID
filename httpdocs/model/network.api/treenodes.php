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

# Skeleton id
$skid = isset( $_REQUEST[ 'skid' ] ) ? intval( $_REQUEST[ 'skid' ] ) : -1;

# Check preconditions:

# 1. There must be a skeleton id
if ( ! $skid ) {
	echo json_encode( array( 'error' => 'A skeleton id has not been provided!' ) );
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
  # Relation 'labeled_as'
  $labeled_as_id = $db->getRelationId( $pid, 'labeled_as' );
  if (false === $labeled_as_id || !$labeled_as_id) {
    emitErrorAndExit( $db, 'Cannot find "labeled_as" relation for this project.' );
  }

  # Select all treenodes of the skeleton
  $q = $db->getResult(
    'SELECT treenode.id,
            (treenode.location).x,
            (treenode.location).y, 
            (treenode.location).z,
            treenode.confidence,
            treenode.parent_id,
            treenode.user_id,
						treenode.skeleton_id
    FROM treenode
    WHERE treenode.skeleton_id = '.$skid);

  if (false === $q) {
    emitErrorAndExit($db, 'Failed to retrieve information for treenode #'.$tnid);
  }

  # Select all tag-labeled treenodes of the skeleton
	$tags = $db->getResult(
		'SELECT "class_instance"."name",
		        "treenode"."id"
		 FROM "treenode_class_instance" AS "tci",
		      "class_instance",
					"treenode"
		 WHERE "treenode"."skeleton_id" = '.$skid.'
       AND "treenode"."id" = "tci"."treenode_id"
       AND "tci"."relation_id" = '.$labeled_as_id.'
			 AND "tci"."class_instance_id" = "class_instance"."id"');

  if (false === $tags) {
    emitErrorAndExit( $db, 'Failed to retrieve tags for treenodes of skeleton '.$skid);
  }

	# Prepare a map of id vs array of tags, for each tagged node
	$tagged = array();
	foreach ($tags as &$t) {
	  if (!isset($tagged[$t['id']])) {
			$tagged[$t['id']] = array();
		}
		$tagged[$t['id']][] = $t['name'];
	}

	# Add the 'tags' entry and convert numeric entries to integers
	foreach ($q as &$p) {
		# Add tags
		if (isset($tagged[$p['id']])) $p['tags'] = $tagged[$p['id']];
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
