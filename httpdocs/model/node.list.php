<?php

  /*

I've included below some example JSON output from this script.  First,
a couple of normal treenodes, then a connector with no pre- or post-
synaptic relationships, finally a connector with some of both:

[
    {
        "confidence": "5",
        "id": "410",
        "parentid": null,
        "radius": "-1",
        "skeleton_id": "406",
        "type": "treenode",
        "user_id": "3",
        "x": "4440",
        "y": "5330",
        "z": "9",
        "z_diff": "9"
    },
    {
        "confidence": "5",
        "id": "424",
        "parentid": "422",
        "radius": "-1",
        "skeleton_id": "406",
        "type": "treenode",
        "user_id": "3",
        "x": "7640",
        "y": "5990",
        "z": "9",
        "z_diff": "9"
    },
    {
        "id": "125",
        "type": "connector",
        "user_id": "3",
        "x": "8290",
        "y": "3900",
        "z": "9",
        "z_diff": "9"
    },
    {
        "id": "284",
        "confidence": "5",
        "post": [
            {
                "tnid": "293",
                "confidence": "4"
            },
            {
                "tnid": "303",
                "confidence": "5"
            },
            {
                "tnid": "313",
                "confidence": "3"
            }
        ],
        "pre": [
            {
                "tnid": "280",
                "confidence": "5"
            },
            {
                "tnid": "370",
                "confidence": "5"
            }
        ],
        "type": "connector",
        "user_id": "3",
        "x": "3860",
        "y": "1360",
        "z": "0",
        "z_diff": "0"
    }
]

   */


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


$z = isset( $_REQUEST[ 'z' ] ) ? floatval( $_REQUEST[ 'z' ] ) : 0;
$top = isset( $_REQUEST[ 'top' ] ) ? floatval( $_REQUEST[ 'top' ] ) : 0;
$left = isset( $_REQUEST[ 'left' ] ) ? floatval( $_REQUEST[ 'left' ] ) : 0;
$width = isset( $_REQUEST[ 'width' ] ) ? floatval( $_REQUEST[ 'width' ] ) : 0;
$height = isset( $_REQUEST[ 'height' ] ) ? floatval( $_REQUEST[ 'height' ] ) : 0;
$zres = isset( $_REQUEST[ 'zres' ] ) ? floatval( $_REQUEST[ 'zres' ] ) : 0;
$active_skeleton_id = isset( $_REQUEST[ 'as' ] ) ? intval( $_REQUEST[ 'as' ] ) : 0;

// the scale factor to volume bound the query in z-direction based on the z-resolution
$zbound = 1.0;
// limit number of retrieved treenodes
$limit = 400;

$classes = $db->getMap( $pid, 'class' );
if (!$classes) {
    echo makeJSON( array( 'error' => "Could not find classes for project $pid" ) );
    return;
}

$relations = $db->getMap( $pid, 'relation' );
if (!$relations) {
    echo makeJSON( array( 'error' => "Could not find relations for project $pid" ) );
    return;
}

// Check that this returned all the required IDs:
$required_classes = array('synapse', 'presynaptic terminal', 'postsynaptic terminal', 'skeleton');
$required_relations = array('model_of', 'presynaptic_to', 'postsynaptic_to', 'element_of');
foreach ($required_classes as $class) {
    if (!array_key_exists($class, $classes)) {
        echo makeJSON( array( 'error' => "Failed to find the required class '$class'" ) );
        return;
    }
}
foreach ($required_relations as $relation) {
    if (!array_key_exists($relation, $relations)) {
        echo makeJSON( array( 'error' => "Failed to find the required relation '$relation'" ) );
        return;
    }
}

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

  if ($active_skeleton_id) {
    $skeleton_condition = "(skeleton_id = $active_skeleton_id)";
  } else {
	  $skeleton_condition = 'FALSE';
  }

  $treenodes = $db->getResult(
    "SELECT treenode.id AS id,
         treenode.parent_id AS parentid,
         (treenode.location).x AS x,
         (treenode.location).y AS y,
         (treenode.location).z AS z,
         treenode.confidence AS confidence,
         treenode.user_id AS user_id,
         treenode.radius AS radius,
         ((treenode.location).z - $z) AS z_diff,
         skeleton_id
     FROM treenode
     WHERE
      $skeleton_condition
      OR (treenode.project_id = $pid
          AND (treenode.location).x >= $left
          AND (treenode.location).x <= ($left + $width)
          AND (treenode.location).y >= $top
          AND (treenode.location).y <= ($top + $height)
          AND (treenode.location).z >= ($z - $zbound * $zres)
          AND (treenode.location).z <= ($z + $zbound * $zres))
      ORDER BY parentid DESC, id, z_diff
      LIMIT $limit"
  );

  if (false === $treenodes) {
    emitErrorAndExit($db, 'Failed to query treenodes.');
  }

  // loop over and add type
  while ( list( $key, $val) = each( $treenodes ) )
  {
    $treenodes[$key]['type'] = "treenode";
  }

  // retrieve connectors that are synapses - do a LEFT OUTER JOIN with
  // the treenode_connector table, so that we get entries even if the
  // connector is not connected to any treenodes
  $connectors = $db->getResult(
    "SELECT connector.id AS id,
        (connector.location).x AS x,
        (connector.location).y AS y,
        (connector.location).z AS z,
        connector.confidence AS confidence,
        connector.user_id AS user_id,
        ((connector.location).z - $z) AS z_diff,
        treenode_connector.relation_id AS treenode_relation_id,
        treenode_connector.treenode_id AS tnid,
        treenode_connector.confidence AS tc_confidence
     FROM connector LEFT OUTER JOIN treenode_connector
             ON treenode_connector.connector_id = connector.id
        WHERE connector.project_id = $pid AND
            (connector.location).x >= $left AND
            (connector.location).x <= ($left + $width) AND
            (connector.location).y >= $top AND
            (connector.location).y <= ($top + $height) AND
            (connector.location).z >= ($z - $zbound * $zres) AND
            (connector.location).z <= ($z + $zbound * $zres)
        ORDER BY id, z_diff LIMIT $limit"
  );

  if (false === $connectors) {
    emitErrorAndExit($db, 'Failed to query connector locations.');
  }

  $already_seen_connectors = array();
  $pushed_treenodes = count($treenodes);
  while ( list( $key, $val) = each( $connectors ) )
  {
      $val['type'] = "connector";
      $connector_id = $val['id'];

      if (isset($val['tnid'])) {
          $tnid = $val['tnid'];
          $relationship = ($val['treenode_relation_id'] === $relations['presynaptic_to']) ? "pre" : "post";
          $tc_confidence = $val['tc_confidence'];
      } else {
          // The connector wasn't connected to any treenodes
          $tnid = NULL;
          $relationship = NULL;
          $tc_confidence = NULL;
      }
      // Now we've saved those values, remove them from the top level:
      unset($val['tnid']);
      unset($val['treenode_relation_id']);
      unset($val['tc_confidence']);

      // Should we push a new item onto the $treenodes
      // array or just reuse the existing one?
      $reuse = isset($already_seen_connectors[$connector_id]);

      if ($reuse) {
          $existing_index = $already_seen_connectors[$connector_id];
          if ($tnid) {
              $val = $treenodes[$existing_index];
          } else {
              // Otherwise, we have no new information to add:
              $val = NULL;
          }
      }

      if ($val) {
          if ($tnid) {
              if (!isset($val[$relationship])) {
                  $val[$relationship] = array();
              }
              array_push($val[$relationship],array('tnid' => $tnid, 'confidence' => $tc_confidence));
          }

          if ($reuse) {
              $treenodes[$existing_index] = $val;
          } else {
              array_push($treenodes, $val);
              $already_seen_connectors[$connector_id] = $pushed_treenodes;
              ++$pushed_treenodes;
          }
      }
  }

  echo json_encode( $treenodes );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}
  
?>
