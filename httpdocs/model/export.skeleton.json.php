<?php

// writes skeleton to SWC

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : 0;

if ( $pid )
{
  if ( $uid )
  {
    
    $ele_id = $db->getRelationId( $pid, 'element_of' );
    if(!$ele_id) { echo makeJSON( array( '"error"' => 'Can not find "element_of" relation for this project' ) ); return; }
    
    // retrieve skeleton for treenode
    $res = $db->getClassInstanceForTreenode( $pid, $tnid, "element_of");
    
    if(!empty($res)) { $skelid = $res[0]['class_instance_id']; } 
    else {
      echo makeJSON( array( '"error"' => 'There seems not to exist a skeleton for treenode id '));
      return;
    }
    // SWC columns are
    // unique identity value for trace point, structure type, x coordinate, y coordinate,
    // z coordinate, radius, identity value for parent
    
    $res = $db->getResult(
    'SELECT "treenode"."id", ("treenode"."location")."x", ("treenode"."location")."y", 
    ("treenode"."location")."z",
    "treenode"."confidence", "treenode"."parent_id" FROM "treenode_class_instance" AS "tci", "treenode"
    WHERE "tci"."project_id" = '.$pid.' AND
    "tci"."relation_id" = '.$ele_id.' AND
    "tci"."class_instance_id" = '.$skelid.' AND
    "treenode"."id" = "tci"."treenode_id"
    ORDER BY "treenode"."parent_id" DESC');
    
    echo json_encode($res); /*
	foreach($res as $key => $ele) {
		$out = "";
		$out .= $ele['id']." ";
		$out .= $ele['x']." ";
		$out .= $ele['y']." ";
		$out .= $ele['z']." ";
		$out .= $ele['confidence']." ";
		if($ele['parent_id']=="")
			$out .= "-1\n";
		else
			$out .= $ele['parent_id']."\n";
		
		echo $out;
	}*/
    //header("Cache-Control: must-revalidate, post-check=0, pre-check=0");
    //header('Content-Type: application/csv');
    //header('Content-Disposition: attachment; filename=test.csv');
    //header("Content-Length: " . strlen($out));
    //echo(var_dump($res));
    //echo date("l");
    //echo "\r\n";
    // XXX retrieve treenodes with parent and location information
    //exit;
    //echo json_encode($res);
    
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not retrieve synapses.' ) );

?>
