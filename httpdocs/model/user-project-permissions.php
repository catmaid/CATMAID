<?php

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );
include_once( 'utils.php' );

$db =& getDB( 'read' );
$ses =& getSession();

$uid = $ses->isSessionValid() ? $ses->getId() : 0;

if ($uid) {
    $rows = $db->getResult("
SELECT project_id, can_edit_any, can_view_any
FROM project_user
WHERE user_id = $uid");
    if (FALSE === $rows) {
        echo json_encode(array('error' => "Check the user's permissions failed"));
    } else {
        $result = array();
        foreach ($rows as $row) {
            $p = (int)$row['project_id'];
            $result[$p]['can_edit_any'] = $row['can_edit_any'] === 't';
            $result[$p]['can_view_any'] = $row['can_view_any'] === 't';
        }
        echo json_encode($result);
    }
} else {
    echo json_encode(array());
}
