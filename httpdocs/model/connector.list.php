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

# There must be a project id
if ( ! $pid ) {
    echo makeJSON( array( 'error' => 'Project closed. Cannot apply operation.' ) );
    return;
}

# There must be a user id
if ( ! $uid ) {
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve connector list.' ) );
    return;
}

// relation type
// use, 0 for presynaptic_to, 1 for postsynaptic_to
$relation_type = isset( $_REQUEST[ 'relation_type' ] ) ? intval( $_REQUEST[ 'relation_type' ] ) : 0;
// skeleton id used
$skeletonID = isset( $_REQUEST[ 'skeleton_id' ] ) ? intval( $_REQUEST[ 'skeleton_id' ] ) : 0;

// if there is no valid skeleton id, just return an empty table
if ( ! $skeletonID ) {
    $sOutput = '{';
	$sOutput .= '"iTotalRecords": 0, ';
	$sOutput .= '"iTotalDisplayRecords": 0, ';
	$sOutput .= '"aaData": [] } ';
    echo $sOutput;
    return;
}

/* Paging */
if ( isset( $_REQUEST['iDisplayStart'] ) )
{
    $displayLength = intval( $_REQUEST['iDisplayLength'] );
    $displayStart = intval( $_REQUEST['iDisplayStart'] );
}

$columnToFieldArray = array( "connector_id", "other_skeleton_id", "x", "y", "z", "labels", "nr_treenodes", "username", "treenode_id");

function fnColumnToField( $i ) {
    global $columnToFieldArray;
    return $columnToFieldArray[$i];
}

$direction = (strtoupper($_REQUEST['sSortDir_0']) === "DESC") ? "DESC" : "ASC";

if ( isset( $_REQUEST['iSortCol_0'] ) ) {
    $columnIndex = intval( $_REQUEST['iSortCol_0'] );
} else {
    $columnIndex = 0;
}

$columnFieldName = fnColumnToField($columnIndex);

function compare_rows($a_row, $b_row) {
    global $direction, $columnIndex, $columnFieldName;
    $a = $a_row[$columnIndex];
    $b = $b_row[$columnIndex];
    if ($a === $b) {
        return 0;
    }
    if ($columnFieldName === 'labels' || $columnFieldName === 'username') {
        $result = strcasecmp($a, $b);
    } else {
        $result = ($a < $b) ? -1 : 1;
    }
    if ($direction === 'DESC') {
        return -1 * $result;
    } else {
        return $result;
    }
}

$relations = $db->getMap( $pid, 'relation' );
if (!$relations) {
    echo makeJSON( array( 'error' => "Could not find relations for project $pid" ) );
    return;
}

$required_relations = array('presynaptic_to', 'postsynaptic_to', 'element_of', 'labeled_as');
foreach ($required_relations as $relation) {
    if (!array_key_exists($relation, $relations)) {
        echo makeJSON( array( 'error' => "Failed to find the required relation '$relation'" ) );
        return;
    }
}

if ( $relation_type )
{
    $relation_id = $relations['presynaptic_to'];
    // inverse relation to fetch postsynaptic skeletons
    $relation_inverse_id = $relations['postsynaptic_to'];
} else {
    $relation_id = $relations['postsynaptic_to'];
    $relation_inverse_id = $relations['presynaptic_to'];
}

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {

  // Retrieve all the connector ids that are presynaptic or
  // postsynaptic to the treenodes of the given skeleton:

  $connector_rows = $db->getResult("
    SELECT
      connector.id AS connector_id,
      connector.user_id AS connector_user_id,
      connector_user.name AS connector_username,
      (connector.location).x AS connector_x,
      (connector.location).y AS connector_y,
      (connector.location).z AS connector_z,
      tn_other.id AS other_treenode_id,
      (tn_other.location).x AS other_treenode_x,
      (tn_other.location).y AS other_treenode_y,
      (tn_other.location).z AS other_treenode_z,
      tn_other.skeleton_id AS other_skeleton_id,
      (tn_this.location).x AS this_treenode_x,
      (tn_this.location).y AS this_treenode_y,
      (tn_this.location).z AS this_treenode_z,
      tn_this.id AS this_treenode_id,
      tc_this.relation_id AS this_to_connector_relation_id,
      tc_other.relation_id AS connector_to_other_relation_id
    FROM
      treenode tn_other,
      treenode_connector tc_other,
      connector,
      \"user\" connector_user,
      treenode_connector tc_this,
      treenode tn_this,
      treenode_class_instance tci_this
    WHERE
      tn_other.id = tc_other.treenode_id AND
      tc_other.connector_id = connector.id AND
      tc_other.relation_id = $relation_inverse_id AND
      connector_user.id = tc_other.user_id AND
      tc_this.connector_id = connector.id AND
      tn_this.id = tc_this.treenode_id AND
      tc_this.relation_id = $relation_id AND
      tci_this.treenode_id = tn_this.id AND
      tci_this.relation_id = {$relations['element_of']} AND
      tci_this.class_instance_id = $skeletonID
    ORDER BY
      connector_id, other_treenode_id, this_treenode_id");

  if (FALSE === $connector_rows) {
    emitErrorAndExit($db, 'Failed to select connectors.');
  }

  // Get the sets of "other skeletons" and connector IDs:

  $other_skeletons = array();
  $connector_ids = array();

  foreach($connector_rows as $row) {
      $other_skeletons[$row['other_skeleton_id']] = TRUE;
      $connector_ids[$row['connector_id']] = TRUE;
  }

  // For each of the other skeletons, find the number of treenodes in
  // that skeleton:

  $comma_separated_skeleton_ids = implode(", ", array_keys($other_skeletons));

  $count_rows = array();

  if (count($other_skeletons) > 0) {
      $count_rows = $db->getResult("
    SELECT skeleton_id, count(skeleton_id) as skeleton_count
    FROM treenode
    WHERE skeleton_id IN ($comma_separated_skeleton_ids)
    GROUP BY skeleton_id");

      if (FALSE === $count_rows) {
          emitErrorAndExit($db, 'Failed to find counts of treenodes in skeletons.');
      }
  }

  $skeleton_id_to_treenode_counts = array();
  foreach ($count_rows as $row) {
      $skeleton_id_to_treenode_counts[$row['skeleton_id']] = $row['skeleton_count'];
  }

  // For each of the connectors, find all of its labels:

  $comma_separated_connector_ids = implode(", ", array_keys($connector_ids));

  $labels_rows = array();

  if (count($connector_ids) > 0) {

      $labels_rows = $db->getResult("
    SELECT
      connector_id,
      class_instance.name as label
    FROM
      connector_class_instance AS cci,
      class_instance
    WHERE
      cci.project_id = $pid AND
      cci.connector_id IN ($comma_separated_connector_ids) AND
      cci.relation_id = {$relations['labeled_as']} AND
      cci.class_instance_id = class_instance.id");

      if (FALSE === $labels_rows) {
          emitErrorAndExit($db, 'Failed to find the labels for connectors');
      }
  }

  $connector_id_to_labels = array();

  foreach ($labels_rows as $row) {
      $connector_id = $row['connector_id'];
      if (!array_key_exists($connector_id, $connector_id_to_labels)) {
          $connector_id_to_labels[$connector_id] = array();
      }
      $connector_id_to_labels[$connector_id][] = $row['label'];
  }

  // Now sort each of the label lists, and join them into a string:
  foreach ($connector_id_to_labels as $connector_id => $label_array) {
      asort($label_array);
      $labels = implode(", ", $label_array);
      $connector_id_to_labels[$connector_id] = $labels;
  }

  $output_results = array();

  // Now assemble the output:

  $row_index = 0;

  foreach ($connector_rows as $row) {

      $connector_id = $row['connector_id'];
      $other_skeleton_id = $row['other_skeleton_id'];

      $row_index_in_range;

      if ($displayLength === -1) {
          $row_index_in_range = TRUE;
      } else {
          if (($row_index >= $displayStart) && ($row_index < ($displayStart + $displayLength))) {
              $row_index_in_range = TRUE;
          } else {
              $row_index_in_range = FALSE;
          }
      }

      if ($row_index_in_range) {

          $output_row = array();

          $output_row[] = $connector_id;
          $output_row[] = $other_skeleton_id;
          $output_row[] = sprintf("%.2f", $row['other_treenode_x']);
          $output_row[] = sprintf("%.2f", $row['other_treenode_y']);
          $output_row[] = sprintf("%.2f", $row['other_treenode_z']);
          if (array_key_exists($connector_id, $connector_id_to_labels)) {
              $output_row[] = $connector_id_to_labels[$connector_id];
          } else {
              $output_row[] = '';
          }
          $output_row[] = $skeleton_id_to_treenode_counts[$other_skeleton_id];
          $output_row[] = $row['connector_username'];
          $output_row[] = $row['other_treenode_id'];

          $output_results[] = $output_row;
      }

      ++ $row_index;
  }

  usort($output_results, 'compare_rows');

  if (! $db->commit() ) {
    // Not needed, but be nice to postgres
    emitErrorAndExit( $db, 'Failed to commit!' );
  }

  echo json_encode(array("iTotalRecords" => $row_index,
                         "iTotalDisplayRecords" => $row_index,
                         "aaData" => $output_results));

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
