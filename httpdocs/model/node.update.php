<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );
include_once( 'utils.php' );

$db =& getDB();
$ses =& getSession();

$uid = $ses->isSessionValid() ? $ses->getId() : 0;
if ( ! $uid ) {
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to update treenodes.' ) );
    return;
}

$nodes = array();

foreach( $_REQUEST as $key => $value ) {
    preg_match('/^(\w+)([0-9]+)$/', $key, $matches);
    $real_key = $matches[1];
    $index = $matches[2];
    if( ! array_key_exists($index,$nodes) ) {
        $nodes[$index] = array();
    }
    $nodes[$index][$real_key] = $value;
}

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
  
  $required_keys = array( 'pid', 'node_id', 'x', 'y', 'z', 'type' );
  
  $nodes_updated = 0;
  
  $first_pid = -1;
  
  foreach( $nodes as $node ) {
    foreach( $required_keys as $required_key ) {
        if( ! array_key_exists($required_key,$node) ) {
            echo makeJSON( array( 'error' => "Missing key: '$required_key' in index '$index'" ) );
            return;
        }
    }
    $pid = intval( $node['pid'] );
    if( ! $pid ) {
        echo makeJSON( array( 'error' => 'Invalid project' ) );
        return;
    }
    if (-1 === $first_pid) {
      $first_pid = $pid;
      // CHECK permissions
      canEditOrExit( $db, $uid, $pid );
    } else if ($pid !== $first_pid) {
      echo emitErrorAndExit($db, 'Can only edit treenodes belonging to the same project!');
    }
    
    $node_id = intval( $node['node_id'] );
    $x = floatval( $node['x'] );
    $y = floatval( $node['y'] );
    $z = floatval( $node['z'] );
    $type = $node['type'];

    $q = false;
    if( $type == "treenode") {
        $q = $db->update("treenode", array('location' => '('.$x.','.$y.','.$z.')' ), 'treenode.id = '.$node_id);
    } elseif ( $type == "location") {
        $q = $db->update("location", array('location' => '('.$x.','.$y.','.$z.')' ), 'location.id = '.$node_id);
    } else {
        echo makeJSON( array( 'error' => "Unknown node type: '$type'" ) );
        return;
    }
    
    if (false === $q) {
      emitErrorAndExit($db, 'Failed to update treenode #'.$node_id);
    }

    ++ $nodes_updated;
  }

  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }

  echo json_encode( array( 'updated' => $nodes_updated ) );

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
