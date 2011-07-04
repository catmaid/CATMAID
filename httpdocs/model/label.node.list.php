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
$nid = isset( $_REQUEST[ 'nid' ] ) ? intval( $_REQUEST[ 'nid' ] ) : 0;
$ntype = isset( $_REQUEST[ 'ntype' ] ) ? $_REQUEST[ 'ntype' ] : 'treenode';

if ( $pid )
{
  if ( $uid )
  {
    $label_id = $db->getClassId( $pid, 'label' );
    if(!$label_id) { echo makeJSON( array( 'error' => 'Can not find "label" class for this project' ) ); return; }
    
    $labeled_as_id = $db->getRelationId( $pid, 'labeled_as' );
    if(!$labeled_as_id) { echo makeJSON( array( 'error' => 'Can not find "labeled_as" relation for this project' ) ); return; }
    
    if($ntype == "treenode") {
      $res = $db->getResult('SELECT "ci"."name" as "name" FROM "class_instance" as "ci", "treenode_class_instance" as "tci" WHERE
      "tci"."treenode_id" = '.$nid.' AND
      "tci"."class_instance_id" = "ci"."id" AND
      "tci"."relation_id" = '.$labeled_as_id.' AND
      "ci"."class_id" = '.$label_id.' AND 
      "ci"."project_id" = '.$pid);
      
    } else if ($ntype == "location") {
      $res = $db->getResult('SELECT "ci"."name" as "name" FROM "class_instance" as "ci", "connector_class_instance" as "cci" WHERE
      "cci"."connector_id" = '.$nid.' AND
      "cci"."class_instance_id" = "ci"."id" AND
      "cci"."relation_id" = '.$labeled_as_id.' AND
      "ci"."class_id" = '.$label_id.' AND 
      "ci"."project_id" = '.$pid);
      
    }

    $list = array();
    foreach($res as $key => $val) {
      if(empty($list[$nid]))
      {
        $list[$nid] = array();
        $list[$nid][] = $val['name'];
      } else {
        $list[$nid][] = $val['name'];
      }
      
    }
    
    echo json_encode( $list );
    
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve labels.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  