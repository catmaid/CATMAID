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

$terminid = isset( $_REQUEST[ 'terminalid' ] ) ? intval( $_REQUEST[ 'terminalid' ] ) : 0;

if ( $pid )
{
	if ( $uid )
	{

    checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);


    $eof_id = $db->getRelationId( $pid, 'model_of' );
    if(!$eof_id) { echo makeJSON( array( 'error' => 'Can not find "model_of" relation for this project' ) ); return; }

	$relationtype = isset( $_REQUEST[ 'relationtype' ] ) ? $_REQUEST[ 'relationtype' ]  : "presynaptic_to";

    $relationtype_id = $db->getRelationId( $pid, $relationtype );
    if(!$relationtype_id) { echo makeJSON( array( 'error' => 'Can not find "'.$relationtype.'" relation for this project' ) ); return; }
	
	
	$res = $db->getResult('SELECT "cn"."id" AS "id", ("cn"."location")."x" AS "x", ("cn"."location")."y" AS "y", ("cn"."location")."z" AS "z" 
						   FROM "connector" as "cn", "connector_class_instance" as "cci", "class_instance_class_instance" as "cici" 
						   WHERE "cci"."connector_id" = "cn"."id" AND 
						   "cici"."class_instance_a" = '.$terminid.' AND
						   "cici"."class_instance_b" = "cci"."class_instance_id" AND
						   "cici"."relation_id" = '.$relationtype_id.' AND
						   "cci"."relation_id" = '.$eof_id.' AND 
						   "cn"."project_id" = '.$pid);
     
    if(!empty($res)) {
		echo makeJSON( array( 'connector_id' => $res[0]['id'],
		 'x' => $res[0]['x'],
		 'y' => $res[0]['y'],
		 'z' => $res[0]['z']) );
    }
    
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve the connector location.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
