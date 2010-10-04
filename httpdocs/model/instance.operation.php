<?php

ini_set( 'error_reporting', E_ALL );
ini_set( 'display_errors', true );

include_once( 'db.pg.class.php' );
include_once( 'session.class.php' );
include_once( 'tools.inc.php' );
include_once( 'json.inc.php' );

$db =& getDB();
$ses =& getSession();

$pid = isset( $_REQUEST[ 'pid' ] ) ? intval( $_REQUEST[ 'pid' ] ) : 0;
$uid = $ses->isSessionValid() ? $ses->getId() : 0;

# operation=rename_node&id=6&title=neuron1+%3Cneuron%3E+

$op = isset( $_REQUEST[ 'operation' ] ) ? $_REQUEST[ 'operation' ] : 0;
$name = isset( $_REQUEST[ 'title' ] ) ? $_REQUEST[ 'title' ] : 0;
$id = isset( $_REQUEST[ 'id' ] ) ? intval($_REQUEST[ 'id' ]) : 0;
$src = isset( $_REQUEST[ 'src' ] ) ? intval($_REQUEST[ 'src' ]) : 0;
$ref = isset( $_REQUEST[ 'ref' ] ) ? intval($_REQUEST[ 'ref' ]) : 0;

if ( $pid )
{
	if ( $uid )
	{
		
		if ( $op == 'rename_node')
		{
			
			$ids = $db->update("class_instance", array("name" => $name) ,' "class_instance"."id" = '.$id);
			echo "Updated.";
				
		}
		else if ( $op == 'remove_node')
		{
			// check if the object belongs to you
			$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$id);
			echo "Removed.";
			
		}
		else if ( $op == 'add_node')
		{
			// find out class id
			echo "Nothing done yet.";
			
		}
		else if ( $op == 'move_skeleton')
		{
			if ( $src && $ref )
			{
				// check if src and ref are already related by model_of
				// if so, update, otherwise create new
				
				// get id for relation 'model_of'
				$modelofres = $db->getResult(
				'SELECT "relation"."id" FROM "relation"
				WHERE "relation"."project_id" = '.$pid.' AND
				"relation"."relation_name" = \'model_of\'');
				$modid = !empty($modelofres) ? $modelofres[0]['id'] : 0;
				
				$res = $db->getResult(
				'SELECT "cici"."id" FROM "class_instance_class_instance" AS "cici" 
				WHERE "cici"."project_id" = '.$pid.' AND "cici"."relation_id" = '.$modid.' 
				AND "cici"."class_instance_a" = '.$src);
				
				if (empty($res)) {
					// insert it
					$ins = array('user_id' => $uid,
								 'project_id' => $pid,
								 'relation_id' => $modid,
								 'class_instance_a' => $src,
								 'class_instance_b' => $ref);
					$db->insertInto( "class_instance_class_instance", $ins);
					echo "Inserted";
					
				} else {
					// update it
					$up = array('class_instance_b' => $ref);
					$upw = 'user_id = '.$uid.' AND project_id = '.$pid.' AND relation_id = '.$modid.' AND class_instance_a = '.$src;
					$db->update( "class_instance_class_instance", $up, $upw);
					echo "Updated";
					
				}
				
			}	

		}
		
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to apply operation.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );

?>