<?php
// return all labels in the project

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$cid = isset( $_REQUEST[ 'cid' ] ) ? intval( $_REQUEST[ 'cid' ] ) : 0;

if ( $pid )
{
  if ( $uid )
  {
    $label_id = $db->getClassId( $pid, 'label' );
    if(!$label_id) { echo makeJSON( array( 'error' => 'Can not find "label" class for this project' ) ); return; }
    
    $res = $db->getResult('SELECT DISTINCT "ci"."name" as "name" FROM "class_instance" as "ci" WHERE
    "ci"."class_id" = '.$label_id.' AND 
    "ci"."project_id" = '.$pid);
    
    $list = array();
    foreach($res as $key => $val) {
      $list[] = $val['name'];
    }
    
    echo json_encode( $list );
    
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve labels.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );

?>
