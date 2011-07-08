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

$stu = isset( $_REQUEST[ 'nods' ] ) ? $_REQUEST[ 'nods' ]  : 0;
$ntype = isset( $_REQUEST[ 'ntype' ] ) ? $_REQUEST[ 'ntype' ] : 'treenode';

if ( $pid )
{
  if ( $uid )
  {
    $label_id = $db->getClassId( $pid, 'label' );
    if(!$label_id) { echo makeJSON( array( 'error' => 'Can not find "label" class for this project' ) ); return; }
    
    $labeled_as_id = $db->getRelationId( $pid, 'labeled_as' );
    if(!$labeled_as_id) { echo makeJSON( array( 'error' => 'Can not find "labeled_as" relation for this project' ) ); return; }
   
	// create select where in statement part
	$studec = json_decode($stu);
	$stuimp = array();
	foreach($studec as $key => $val) {
		$stuimp[] = intval($val);
	}
    
    if(count($stuimp) == 0) {
    	$stuw = "false AND";
        $stuw2 = "false AND";
    } else {
    	$stuw = '"tci"."treenode_id" IN (';
    	$stuw .= implode(",", $stuimp);
    	$stuw .= ") AND";

    	$stuw2 = '"cci"."connector_id" IN (';
    	$stuw2 .= implode(",", $stuimp);
    	$stuw2 .= ") AND";
    }

    $res = $db->getResult('SELECT "tci"."treenode_id" as "id", "ci"."name" as "name" FROM "class_instance" as "ci", "treenode_class_instance" as "tci" WHERE
    '.$stuw.'
    "tci"."class_instance_id" = "ci"."id" AND
    "tci"."relation_id" = '.$labeled_as_id.' AND
    "ci"."class_id" = '.$label_id.' AND
    "ci"."project_id" = '.$pid);

    $res2 = $db->getResult('SELECT "cci"."connector_id" as "id", "ci"."name" as "name"
     FROM "class_instance" as "ci", "connector_class_instance" as "cci" WHERE
    '.$stuw2.'
    "cci"."class_instance_id" = "ci"."id" AND
    "cci"."relation_id" = '.$labeled_as_id.' AND
    "ci"."class_id" = '.$label_id.' AND
    "ci"."project_id" = '.$pid);

    $result = array_merge( $res, $res2 );

    $list = array();
    foreach($result as $key => $val) {
      if(empty($list[$val['id']]))
      {
        $list[$val['id']] = array();
        $list[$val['id']][] = $val['name'];
      } else {
        $list[$val['id']][] = $val['name'];
      }
      
    }
    
    echo json_encode( $list );
    
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve labels.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  