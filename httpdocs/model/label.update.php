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

$tags = isset( $_REQUEST[ 'tags' ] ) ? $_REQUEST[ 'tags' ] : '[]';
$ntype = isset( $_REQUEST[ 'ntype' ] ) ? $_REQUEST[ 'ntype' ] : 'treenode';


if ( $pid )
{
  if ( $uid )
  {
    $label_id = $db->getClassId( $pid, 'label' );
    if(!$label_id) { echo makeJSON( array( '"error"' => 'Can not find "label" class for this project' ) ); return; }
    
    $labeled_as_id = $db->getRelationId( $pid, 'labeled_as' );
    if(!$labeled_as_id) { echo makeJSON( array( '"error"' => 'Can not find "labeled_as" relation for this project' ) ); return; }
    
    // delete all treenode_class_instance to labels
    
    if($ntype == "treenode") {
      
      $ids = $db->deleteFrom("treenode_class_instance", ' "treenode_class_instance"."treenode_id" = '.$nid.' AND
      "treenode_class_instance"."relation_id" = '.$labeled_as_id);
    
    } else if ($ntype == "location") {

      $ids = $db->deleteFrom("connector_class_instance", ' "connector_class_instance"."connector_id" = '.$nid.' AND
      "connector_class_instance"."relation_id" = '.$labeled_as_id);

    }
    
    // see which labels have to be created a new and which ones are retrieved
    $ta = explode(',', $tags);
    // remove empty strings
    foreach($ta as $val) {
      // exclusion criteria
      // if value empty, skip
      if(empty($val))
        continue;
      
      // see if label exists
      $res = $db->getResult('SELECT "ci"."name" as "name", "ci"."id" as "id" FROM "class_instance" as "ci" WHERE
      "ci"."class_id" = '.$label_id.' AND 
      "ci"."name" = \''.$val.'\' AND
      "ci"."project_id" = '.$pid);
      if(empty($res)) {
        // create class_instance of label
        $data = array(
          'user_id' => $uid,
          'project_id' => $pid,
          'class_id' => $label_id,
          'name' => $val
          );
        $lab_ci_id = $db->insertIntoId('class_instance', $data );
      } else {
        // retrieve class_instance id
        $lab_ci_id = $res[0]['id'];
      }
      // add relation
      
      if($ntype == "treenode") {

        $data = array(
          'user_id' => $uid,
          'project_id' => $pid,
          'relation_id' => $labeled_as_id,
          'treenode_id' => $nid,
          'class_instance_id' => $lab_ci_id
          );
        $lab_ci_id = $db->insertIntoId('treenode_class_instance', $data );
        
      } else if ($ntype == "location") {

        $data = array(
          'user_id' => $uid,
          'project_id' => $pid,
          'relation_id' => $labeled_as_id,
          'connector_id' => $nid,
          'class_instance_id' => $lab_ci_id
          );
        $lab_ci_id = $db->insertIntoId('connector_class_instance', $data );
        
      }
    


    }
     // echo makeJSON( array( 'message' => 'success' ) );
      echo json_encode( array('message' => 'success') );  
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve labels.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  