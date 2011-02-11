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

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;

if ( $pid )
{
	if ( $uid )
	{

		$modof_id = $db->getRelationId( $pid, 'model_of' );
		if(!$modof_id) { echo makeJSON( array( '"error"' => 'Can not find "model_of" relation for this project' ) ); return; }

		$eleof_id = $db->getRelationId( $pid, 'element_of' );
		if(!$eleof_id) { echo makeJSON( array( '"error"' => 'Can not find "element_of" relation for this project' ) ); return; }

		// for labels, only remove the relation
		$lab_id = $db->getRelationId( $pid, 'labeled_as' );
		if(!$lab_id) { echo makeJSON( array( '"error"' => 'Can not find "labeled_as" relation for this project' ) ); return; }

		$skid = $db->getClassId( $pid, "skeleton" );
		if(!$skid) { echo makeJSON( array( '"error"' => 'Can not find "skeleton" class for this project' ) ); return; }

		if ( $tnid != -1 ) 
		{
			// check if treenode is root
			$forpar = $db->getResult('SELECT "treenode"."parent_id" AS "parent" FROM "treenode" WHERE "treenode"."id" = '.$tnid);
			if(empty($forpar[0]['parent']))
			{
				// treenode is root
				// each child treenode needs its own skeleton that is part
				// of the original neuron

				// retrieve the original neuron id of this treenode's skeleton

				$sk = $db->getClassInstanceForTreenode( $pid, $tnid, 'element_of');
				if(!empty($sk)) { $sk_id = $sk[0]['class_instance_id']; } else {
				echo makeJSON( array( '"error"' => 'Can not find skeleton for this treenode.' ) ); return; }

				$neu = $db->getCIFromCI( $pid, $sk_id, 'model_of' );
				if(!empty($neu)) { $neu_id = $neu[0]['id']; } else {
				echo makeJSON( array( '"error"' => 'Can not find neuron for the skeleton.' ) ); return; }

				// remove original skeleton
				$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$sk_id);

				// loop over all children
				$treenodes = $db->getResult('SELECT "treenode"."id" AS "tnid" FROM "treenode" WHERE "treenode"."parent_id" = '.$tnid);
				foreach($treenodes as $key => $tn) {
					
					// update all the children to become root
					$ids = $db->getResult('UPDATE "treenode" SET "parent_id" = NULL WHERE "treenode"."id" = '.$tn['tnid']);
					
					// create a new skeleton for each child
					$data = array(
						'user_id' => $uid,
						'project_id' => $pid,
						'class_id' => $skid,
						'name' => 'skeleton'
						);
					$skelid = $db->insertIntoId('class_instance', $data );
					
					// update skeleton name by adding its id to the end
					$up = array('name' => 'skeleton '.$skelid);
					$upw = 'id = '.$skelid;
					$db->update( "class_instance", $up, $upw);     

					// make new skeleton model_of neuron
					$data = array(
					  'user_id' => $uid,
					  'project_id' => $pid,
					  'relation_id' => $modof_id,
					  'class_instance_a' => $skelid,
					  'class_instance_b' => $neu_id 
					);
					$db->insertInto('class_instance_class_instance', $data );
					  
					// update the element_of relationship for each of the treenode children recursively
					$allchi = $db->getAllTreenodeChildrenRecursively( $pid, $tn['tnid'] );
					foreach($allchi as $key => $chitn) {
						error_log("Updating element_of of treenode id".$chitn['id']." to new skeleton id ".$skelid);
						// update the element_of to the newly created skeleton
						// and the new root treenode
						$ids = $db->getResult('UPDATE "treenode_class_instance" SET "class_instance_id" = '.$skelid.' WHERE
						"treenode_class_instance"."treenode_id" = '.$chitn['id'].' AND
						"treenode_class_instance"."relation_id" = '.$eleof_id);
					};

				};

				// retrieve model_of class instances for removal
				$treein = $db->getResult('SELECT "tci"."class_instance_id" AS "id" FROM "treenode_class_instance" AS "tci"
				WHERE "tci"."relation_id" = '.$modof_id.' AND "tci"."treenode_id" = '.$tnid.' AND "tci"."project_id" = '.$pid);

				// delete class_instance
				if(!empty($treein)) {
					foreach($treein as $key => $tn) {
						$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$tn['id']);
					}
				}

				// finally delete the treenode to be consistent with the foreign key constraint
				// with on cascade delete, this will delete all its labels
				$ids = $db->deleteFrom("treenode", ' "treenode"."id" = '.$tnid);

				echo "Removed treenode successfully.";  

        }
        else
        {
			// treenode is not a root
			// it has a parent and children. we need to reconnect all the children
			// to the parent, and do not update the treenode element_of skeleton relationship

			// no root, reconnect to parent
			$parentid = $forpar[0]['parent'];

			// update all the children to become root
			// first update parent
			$treenodes = $db->getResult('SELECT "treenode"."id" AS "tnid" FROM "treenode" WHERE "treenode"."parent_id" = '.$tnid);
			foreach($treenodes as $key => $tn) {
				$ids = $db->getResult('UPDATE "treenode" SET "parent_id" = '.$parentid.' WHERE "treenode"."id" = '.$tn['tnid']);
			};

			// before deleting the treenode
			// make sure that we delete all anotations (model_of) of the treenode
			// from the class_instance table
			// remove model_of, e.g. pre- or postsynaptic terminals
			// remove model_of, includes deleting the class_instances
			$treein = $db->getResult('SELECT "tci"."class_instance_id" AS "id" FROM "treenode_class_instance" AS "tci"
			WHERE "tci"."relation_id" = '.$modof_id.' AND "tci"."treenode_id" = '.$tnid.' AND "tci"."project_id" = '.$pid);

			// delete class_instance
			if(!empty($treein)) {
				foreach($treein as $key => $tn) {
					$ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$tn['id']);
				}
			}

			// finally delete the treenode to be consistent with the foreign key constraint
			// with on cascade delete, this will delete all its labels
			$ids = $db->deleteFrom("treenode", ' "treenode"."id" = '.$tnid);

			echo "Removed treenode successfully.";  

        }
        
      }
        
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to delete treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>
