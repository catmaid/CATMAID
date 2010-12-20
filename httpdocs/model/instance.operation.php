<?php

include_once( 'errors.inc.php' );
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
$rel = isset( $_REQUEST[ 'rel' ] ) ? $_REQUEST[ 'rel' ] : 0;

// remove skeleton, i.e. treenodes and corresponding relations 
function remove_skeleton($db, $pid, $skelid) {
	
	$lablid = $db->getRelationId( $pid, "labeled_as" );
	$preid = $db->getRelationId( $pid, "presynaptic_to" );
	$postid = $db->getRelationId( $pid, "postsynaptic_to" );
	$elid = $db->getRelationId( $pid, "element_of" );
	
	// labeled_as, presynaptic_to, postsynaptic_to, element_of
	$relarr = array( $lablid, $preid, $postid );
	foreach( $relarr as $val ) {
		$res = $db->getResult('DELETE FROM 
			  "treenode_class_instance" AS "tci"
			 WHERE 
			  "tci"."treenode_id" IN (
			    SELECT "tn"."id"
			    FROM "treenode" AS "tn"
			    INNER JOIN "treenode_class_instance" AS "tci2"
			    ON "tci2"."treenode_id" = "tn"."id" 
			    WHERE "tci2"."class_instance_id" = '.$skelid.' AND "tci2"."project_id" = '.$pid.'
			  ) AND "tci"."relation_id" = '.$val);
	}
	// remove treenodes from treenode table, should remove the remaining
	// connected treenodes to the skeleton with the element_of relationship using cascade deletion (does it XXX?)
	$res = $db->getResult('DELETE FROM 
			 "treenode" AS "tn"
			 WHERE 
			  "tn"."id" IN (
			    SELECT "tci"."treenode_id"
			    FROM "treenode_class_instance" AS "tci"
			    WHERE "tci"."class_instance_id" = '.$skelid.' AND "tci"."project_id" = '.$pid.')');
	
}

if ( $pid )
{
	if ( $uid )
	{
		
		if ( $op == 'rename_node')
		{
			$ids = $db->update("class_instance", array("name" => $name) ,' "class_instance"."id" = '.$id);
			echo makeJSON( array( '"class_instance_id"' => $ids) );
		}
		else if ( $op == 'remove_node')
		{
			// check if the object belongs to you
			$isuser = $db->getResult('SELECT "ci"."id" FROM "class_instance" AS "ci" WHERE
			"ci"."id" = '.$id.' AND
			"ci"."user_id" = '.$uid);			
			if( !empty($isuser) )
			{
				// check if node is a skeleton. if so, we have to remove its treenodes as well!
				if ( $rel ) {
					if ( $rel == "skeleton" )
					{
						remove_skeleton($db, $pid, $id);
						$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$id);
						echo "Removed skeleton successfully.";		
					}
					else
					{
						$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$id);
						echo "Removed node successfully.";						
					}
				}
				
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
		else if ( $op == 'move_node' )
		{
			if ( $src && $ref )
			{
				$presyn_id = $db->getRelationId( $pid, "presynaptic_to" );
				$postsyn_id = $db->getRelationId( $pid, "postsynaptic_to" );
				$modid = $db->getRelationId( $pid, "model_of" );
				$partof_id = $db->getRelationId( $pid, "part_of" );
				
				// only update for updateable relations of the object tree
				$up = array('class_instance_b' => $ref);
				$upw = 'user_id = '.$uid.' AND project_id = '.$pid.' 
				AND (relation_id = '.$presyn_id.'
				OR relation_id = '.$postsyn_id.'
				OR relation_id = '.$modid.'
				OR relation_id = '.$partof_id.')
				AND class_instance_a = '.$src;
				$db->update( "class_instance_class_instance", $up, $upw);
				echo "True";	
			}
		}
			else if ( $op == 'has_relations' )
		{
			
			$relnr = isset( $_REQUEST[ 'relationnr' ] ) ? intval($_REQUEST[ 'relationnr' ]) : 0;
			
			$relwhere = "";
			for ($i = 0; $i < $relnr; $i++) {
				
				$re = isset( $_REQUEST[ 'relation'.$i ] ) ? $_REQUEST[ 'relation'.$i ] : "none";
				
			    $relid = $db->getRelationId( $pid, $re );
			    $relwhere .= 'relation_id = '.$relid;
			    if( $i < ($relnr - 1)) {
			    	$relwhere .= ' OR ';
			    };
			}
			
			$rels = $db->getResult(
			'SELECT "cici"."id" FROM "class_instance_class_instance" AS "cici"
			WHERE "cici"."project_id" = '.$pid.' AND
			"cici"."class_instance_b" = '.$id.' AND
			('.$relwhere.')');
			$ret = !empty($rels) ? "True" : "False";
			echo $ret;

		}
		
	}
	else
		echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to apply operation.' ) );
}
else
	echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );

?>