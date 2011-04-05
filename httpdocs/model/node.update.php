<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

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

$required_keys = array( 'pid', 'node_id', 'x', 'y', 'z', 'type' );

$nodes_updated = 0;

foreach( $nodes as $node ) {
    foreach( $required_keys as $required_key ) {
        if( ! array_key_exists($required_key,$node) ) {
            echo makeJSON( array( 'error' => "Missing key: '$required_key' in index '$index'" ) );
            return;
        }
    }
    $pid = intval( $node['pid'] );
    if( ! $pid ) {
        /* FIXME: also check that this a project the user
           has access to.  This needs to be done *everywhere* ... */
        echo makeJSON( array( 'error' => 'Invalid project' ) );
        return;
    }
    $node_id = intval( $node['node_id'] );
    $x = floatval( $node['x'] );
    $y = floatval( $node['y'] );
    $z = floatval( $node['z'] );
    $type = $node['type'];
    if( $type == "treenode") {
        $db->update("treenode", array('location' => '('.$x.','.$y.','.$z.')' ), 'treenode.id = '.$node_id);
    } elseif ( $type == "location") {
        $db->update("location", array('location' => '('.$x.','.$y.','.$z.')' ), 'location.id = '.$node_id);
    } else {
        echo makeJSON( array( 'error' => "Unknown node type: '$type'" ) );
        return;
    }

    ++ $nodes_updated;
}

echo makeJSON( array( 'updated' => $nodes_updated ) );
return;

?>
