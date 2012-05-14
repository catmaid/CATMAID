<?php

$EDIT_ANY_ALLOWED = 0x01;
$VIEW_ANY_ALLOWED = 0x02;

/** Rollback, echo an error message as JSON and terminate execution. */
function emitErrorAndExit( $db, $error ) {
	if (! $db->rollback() ) {
		$error = $error." AND FAILED TO ROLLBACK!";
	}
	echo json_encode( array ( 'error' => $error ) );
	exit();
}

/** Check if the user with ID $uid can edit the project with ID $pid. */
function checkPermissionsOrExit( $db, $uid, $pid, $permissions ) {
    global $EDIT_ANY_ALLOWED, $VIEW_ANY_ALLOWED;
    $whereCondition = "project_id = $pid AND user_id = $uid";
    if ($permissions & $EDIT_ANY_ALLOWED) {
        $whereCondition .= " AND can_edit_any";
    }
    if ($permissions & $VIEW_ANY_ALLOWED) {
        $whereCondition .= " AND can_view_any";
    }
    $entryCount = $db->countEntries('project_user', $whereCondition);
    if (false === $entryCount || $entryCount < 1) {
        echo json_encode( array ( 'error' => "Permission denied to user with ID $uid to project ID $pid" ) );
        exit();
    }
}

/** Retrieve name string of a class_instance */
function getClassInstanceName( $db, $pid, $cid ) {
    $node = $db->getResult(
     "SELECT class_instance.name AS name
      FROM class_instance
      WHERE
           class_instance.project_id = $pid
           AND class_instance.id = $cid
      LIMIT 1"
    );
    if(false === $node) {
     return null;
    }
    if( count($node) == 1 ) {
     return $node[0]['name'];
    } else {
     return null;
    }
}

/** Retrieve location string of a treenode or connector */
function getLocationAsString( $db, $pid, $node_id ) {
  $node = $db->getResult(
    "SELECT location.id AS id,
         (location.location).x AS x,
         (location.location).y AS y,
         (location.location).z AS z
     FROM location
     WHERE
          location.project_id = $pid
          AND location.id = $node_id
     LIMIT 1"
  );
  if(false === $node) {
    return null;
  }
  if( count($node) == 1 ) {
    return '('.$node[0]['x'].','.$node[0]['y'].','.$node[0]['z'].')';
  } else {
    return null;
  }
}

/** Insert operation into log table */
function insertIntoLog( $db, $uid, $pid, $op_type, $location, $freetext ) {
    // Valid operation_type:
    $operation_type_array = array(
     "create_neuron",
     "rename_neuron",
     "remove_neuron",
     "move_neuron",

     "create_group",
     "rename_group",
     "remove_group",
     "move_group",

     "create_skeleton",
     "rename_skeleton",
     "remove_skeleton",
     "move_skeleton",

     "split_skeleton",
     "join_skeleton",
     "reroot_skeleton",

     "change_confidence");
    // Login, Logout ?
    if( !in_array($op_type, $operation_type_array) ) {
        echo json_encode( array ( 'error' => "Operation type $op_type not valid" ) );
        exit();
    }
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'operation_type' => $op_type
      );
    if( $location != null ) {
        $data['location'] = $location;
    }
    if( $freetext != null ) {
        $data['freetext'] = pg_escape_string( $freetext );
    }
    $q = $db->insertIntoId('log', $data );
    if (false === $q) {
        echo json_encode( array ( 'error' => "Failed to insert operation $op_type for user $uid in project %pid." ) );
        exit();
    }
}

?>
