<?php

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

$parentid = isset( $_REQUEST[ 'parentid' ] ) ? intval($_REQUEST[ 'parentid' ]) : 0;
// extend it by giving a set of relationship types
// limit number of nodes retrievable
$maxnodes = 1000;


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


// instances to display
$nid = $db->getClassId( $pid, "neuron" );
if(!$nid) { echo makeJSON( array( 'error' => 'Can not find "neuron" class for this project' ) ); return; }
$skid = $db->getClassId( $pid, "skeleton" );
if(!$skid) { echo makeJSON( array( 'error' => 'Can not find "skeleton" class for this project' ) ); return; }
$gid = $db->getClassId( $pid, "group" );
if(!$gid) { echo makeJSON( array( 'error' => 'Can not find "group" class for this project' ) ); return; }
$rid = $db->getClassId( $pid, "root" );
if(!$rid) { echo makeJSON( array( 'error' => 'Can not find "root" class for this project' ) ); return; }

// relations
$modid = $db->getRelationId( $pid, "model_of" );
if(!$modid) { echo makeJSON( array( 'error' => 'Can not find "model_of" relation for this project' ) ); return; }
$partof_id = $db->getRelationId( $pid, "part_of" );
if(!$partof_id) { echo makeJSON( array( 'error' => 'Can not find "part_of" relation for this project' ) ); return; }


# Just one select query, no transaction needed:
if ( !$parentid ) {
  # Retrieve the id of the root node for this project
  $res = $db->getResult('SELECT "ci"."id", "ci"."name"
                         FROM "class_instance" AS "ci" 
                         WHERE "ci"."project_id" = '.$pid.'
                         AND "ci"."class_id" = '.$rid);

  if (false === $res) {
    emitErrorAndExit($db, 'Could not select the id of the root node.');
  }

  $parid = !empty($res) ? $res[0]['id'] : 0;
  $parname = !empty($res) ? $res[0]['name'] : 'noname';

  $sOutput = '[';
  $ar = array(		
        'data' => array(
          'title' => $parname,
        ),
        'attr' => array('id' => 'node_'. $parid,
                'rel' => "root"),
        'state' => 'closed'								
        );

  $sOutput .= tv_node( $ar );
  $sOutput .= ']';
  echo $sOutput;
  return;
}
  
  
# Just one select query, no transaction needed:
$res = $db->getResult(
  'SELECT "ci"."id", "ci"."name", "ci"."class_id", "user"."name" AS "username",
          "cici"."relation_id", "cici"."class_instance_b" AS "parent", "cl"."class_name"
  FROM "class_instance" AS "ci"
  INNER JOIN "class_instance_class_instance" AS "cici" 
    ON "ci"."id" = "cici"."class_instance_a" 
    INNER JOIN "class" AS "cl" 
      ON "ci"."class_id" = "cl"."id"
      INNER JOIN "user"
      ON "ci"."user_id" = "user"."id"
  WHERE "ci"."project_id" = '.$pid.' AND
     "cici"."class_instance_b" = '.$parentid.' AND
     ("cici"."relation_id" = '.$modid.'
    OR "cici"."relation_id" = '.$partof_id.')
  ORDER BY "ci"."edition_time" DESC
  LIMIT '.$maxnodes);

# Loop through the array and generate children to return
$sOutput = '[';
$i = 0;
foreach($res as $key => $ele) {

  if( $ele['class_name'] == "skeleton" ) {
    $add = ' ('.$ele['username'].')';
  } else {
    $add = '';
  }

  $ar = array(		
        'data' => array(
          'title' => $ele['name'].$add,
        ),
        'attr' => array('id' => 'node_'. $ele['id'],
        // replace whitespace because of tree object types
                'rel' => str_replace(" ", "", $ele['class_name'])),
        'state' => 'closed'								
        );
  if($i!=0)  { $sOutput .= ','; }
  $sOutput .= tv_node( $ar );
  $i++;
  
};
$sOutput .= ']';

echo $sOutput;

?>
