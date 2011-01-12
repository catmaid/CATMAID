<?php
// should delete the class instance, the connector, and all pre and post
// synaptic links associated to terminals. if the links are the only ones
// one can delete the terminal instances as well.
// assume that one treenode can only be of one termial type

include_once( 'errors.inc.php' );
include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

$cid = isset( $_REQUEST[ 'cid' ] ) ? intval( $_REQUEST[ 'x' ] ) : 0;
$ci_type = isset( $_REQUEST[ 'class_instance_type' ] ) ? $_REQUEST[ 'class_instance_type' ] : 'none';
$ci_relation = isset( $_REQUEST[ 'class_instance_relation' ] ) ? $_REQUEST[ 'class_instance_relation' ] : 'none';

if ( $pid )
{
  if ( $uid )
  {
    $cit_id = $db->getClassId( $pid, $ci_type );
    if(!$cit_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$ci_type.'" class for this project' ) ); return; }
    
    // relation ids
    $cir_id = $db->getRelationId( $pid, $ci_relation );
    if(!$cir_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$ci_relation.'" relation for this project' ) ); return; }

    // retrieve class instance id
    $classin = $db->getResult('SELECT "cci"."class_instance_id" AS "id" FROM "connector_class_instance" AS "cci"
     WHERE "cci"."relation_id" = '.$cir_id.' AND "cci"."connector_id" = '.$cid.' AND 
     "cci"."project_id" = '.$pid);
    if(!empty($classin)) { $classin_id = $classin[0]['id']; } else {
      echo makeJSON( array( '"error"' => 'Can not find class_instance of "'.$ci_type.'" class for this project' ) );
      return;
    }
     
    // check if the object belongs to you (XXX: or if you are admin)
    $isuser = $db->getResult('SELECT "ci"."id" FROM "class_instance" AS "ci" WHERE
    "ci"."id" = '.$classin_id.' AND
    "ci"."user_id" = '.$uid);     
    if( !empty($isuser) )
    {
      // delete connector
      $ids = $db->deleteFrom("connector", ' "connector"."id" = '.$cid);
      // delete class_instance
      $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$classin_id);
    }
      
    echo makeJSON( array( '"result"' => "Removed connector and class_instance",
                '"connector_id"' => $cid,
                '"class_instance_id"' => $classin_id
                ) );

  } 
}
    