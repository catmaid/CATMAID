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

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
  // Check if relation 'model_of' exists
  $model_of_id = $db->getRelationId( $pid, 'model_of' );
  if (false === $model_of_id || !$model_of_id) {
    emitErrorAndExit( $db, 'Can not find "model_of" relation for this project' );
  }

  /*
  // Retrieve skeleton for treenode
  $q = $db->getClassInstanceForTreenode( $pid, $tnid, "element_of");

  if (false === $q || !$q) {
    emitErrorAndExit( $db, array( '"error"' => 'There seems not to exist a skeleton for treenode id ') );
  }

  $skeletonID = $q[0]['class_instance_id']; }
  
  // Select all treenodes of the skeleton
  $q = $db->getResult(
    'SELECT "treenode"."id",
            ("treenode"."location")."x",
            ("treenode"."location")."y", 
            ("treenode"."location")."z",
            "treenode"."confidence",
            "treenode"."parent_id"
    FROM "treenode_class_instance" AS "tci",
         "treenode"
    WHERE "tci"."project_id" = '.$pid.'
    AND "tci"."relation_id" = '.$ele_id.'
    AND "tci"."class_instance_id" = '.$skelid.'
    AND "treenode"."id" = "tci"."treenode_id"
    ORDER BY "treenode"."parent_id" DESC');
  */

  # Select info for the given skeleton ID
  $q = $db->getResult(
  'SELECT class_instance.id,
          class_instance.user_id,
          cici.class_instance_b AS neuron_id
  FROM class_instance,
       class_instance_class_instance AS cici
  WHERE class_instance.project_id = '.$pid.'
    AND class_instance.id = '.$skid.'
    AND cici.class_instance_a = '.$skid.'
    AND cici.relation_id = '.$model_of_id);

  if (false === $q) {
    emitErrorAndExit($db, 'Failed to retrieve information for skeleton #'.$skid);
  }

  if (1 != count($q)) {
    emitErrorAndExit($db, 'Found not 1 but '.count($q).' skeletons with ID #'.$skid);
  }

  # Only one row expected
  $q = $q[0];
  
  # Convert numeric entries to integers
  $q['id'] = (int)$q['id'];
  $q['user_id'] = (int)$q['user_id'];
  $q['neuron_id'] = (int)$q['neuron_id']; # TODO check that it really is a neuron and not something else

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

  echo json_encode( $q );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
