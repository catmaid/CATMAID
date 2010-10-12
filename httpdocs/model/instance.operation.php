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
			echo "Renamed successfully.";
		}
		else if ( $op == 'remove_node')
		{
			// check if the object belongs to you
			$isuser = $db->getResult('SELECT "ci"."id" FROM "class_instance" AS "ci", WHERE
			"ci"."id" = '.$id.'
			"ci"."user_id" = '.$uid);
			if( $isuser )
			{
				$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$id);
				echo "Removed successfully.";
			}
			else
			{
				echo "You are not the creator of the object, thus you can not remove it.";
			}
			
			
		}
		else if ( $op == 'create_node')
		{

			// XXX: is this a security leak?
			$classname = isset( $_REQUEST[ 'classname' ] ) ? $_REQUEST[ 'classname' ] : 0;
			$relname = isset( $_REQUEST[ 'relationname' ] ) ? $_REQUEST[ 'relationname' ] : 0;
			$objname = isset( $_REQUEST[ 'objname' ] ) ? $_REQUEST[ 'objname' ] : 0;
			$parentid = isset( $_REQUEST[ 'parentid' ] ) ? intval($_REQUEST[ 'parentid' ]) : 0;
			
			// create class_instance
			$classi = $db->getResult(
			'SELECT "class"."id" FROM "class"
			WHERE "class"."project_id" = '.$pid.' AND
			"class"."class_name" = \''.$classname.'\'');
			$classid = !empty($classi) ? $classi[0]['id'] : 0;

			$ins = array('user_id' => $uid,
						 'project_id' => $pid,
						 'class_id' => $classid,
						 'name' => $objname);
			
			$cid = $db->insertIntoId( "class_instance", $ins);
			
			// find correct root element
			if($parentid)
				$parid = $parentid;
			else
			{
				$pari = $db->getResult(
				'SELECT "class"."id" FROM "class"
				WHERE "class"."project_id" = '.$pid.' AND
				"class"."class_name" = \'root\'');
				$paridc = !empty($pari) ? $pari[0]['id'] : 0;
				$parii = $db->getResult(
				'SELECT "class_instance"."id" FROM "class_instance"
				WHERE "class_instance"."project_id" = '.$pid.' AND
				"class_instance"."class_id" = '.$paridc);
				$parid = !empty($parii) ? $parii[0]['id'] : 0;
			}
			
			// create class_instance_class_instance with given relation
			$relres = $db->getResult(
			'SELECT "relation"."id" FROM "relation"
			WHERE "relation"."project_id" = '.$pid.' AND
			"relation"."relation_name" = \''.$relname.'\'');
			$relid = !empty($relres) ? $relres[0]['id'] : 0;
			
			$ins = array('user_id' => $uid,
						 'project_id' => $pid,
						 'relation_id' => $relid,
						 'class_instance_a' => $cid,
						 'class_instance_b' => $parid);
			$db->insertInto( "class_instance_class_instance", $ins);
			
			echo makeJSON( array( '"class_instance_id"' => $cid) );
			
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