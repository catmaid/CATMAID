<?php

/* */

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

checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

$search_string = isset( $_REQUEST['substring'] ) ? $_REQUEST['substring'] : "";
$escaped_search_string = pg_escape_string($search_string);

$rows = $db->getResult(
  "SELECT ci.id, ci.name, c.class_name
   FROM class_instance ci inner join class c ON ci.class_id = c.id
   WHERE name ilike '%{$escaped_search_string}%' order by class_name, name");

if ($rows === FALSE) {
    echo json_encode( array( 'error' => 'The search query failed.' ) );
    return;
}

echo json_encode($rows);

?>
