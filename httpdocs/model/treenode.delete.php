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

$tnid = isset( $_REQUEST[ 'tnid' ] ) ? intval( $_REQUEST[ 'tnid' ] ) : -1;

# Check preconditions:

# 1. There must be a treenode id
if ( ! $tnid ) {
	echo json_encode( array( 'error' => 'A treenode id has not been provided!' ) );
	return;
}

# 2. There must be a project id
if ( ! $pid ) {
  echo json_encode( array( 'error' => 'Project closed. Cannot apply operation.' ) );
	return;
}

# 3. There must be a user id
if ( ! $uid ) {
    echo json_encode( array( 'error' => 'You are not logged in.' ) );
	return;
}

# 4. The user must have permissions to edit this tree
# TODO -- currently all users can edit everything

$modof_id = $db->getRelationId( $pid, 'model_of' );
if(!$modof_id) { echo json_encode( array( 'error' => 'Can not find "model_of" relation for this project' ) ); return; }

$eleof_id = $db->getRelationId( $pid, 'element_of' );
if(!$eleof_id) { echo json_encode( array( 'error' => 'Can not find "element_of" relation for this project' ) ); return; }

// for labels, only remove the relation
$lab_id = $db->getRelationId( $pid, 'labeled_as' );
if(!$lab_id) { echo json_encode( array( 'error' => 'Can not find "labeled_as" relation for this project' ) ); return; }

$skid = $db->getClassId( $pid, "skeleton" );
if(!$skid) { echo json_encode( array( 'error' => 'Can not find "skeleton" class for this project' ) ); return; }


// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

try {
  // check if treenode is root
  $forpar = $db->getResult('SELECT "treenode"."parent_id" AS "parent" FROM "treenode" WHERE "treenode"."id" = '.$tnid);
 
  if (false === $forpar) {
    emitErrorAndExit($db, 'Could not determine if it is root.');
  }
 
  if (empty($forpar[0]['parent']))
  {
    // treenode is root
    // each child treenode needs its own skeleton that is part_of the original neuron
    // retrieve the original neuron id of this treenode's skeleton

    $sk = $db->getClassInstanceForTreenode( $pid, $tnid, 'element_of');
    
    if (false === $sk) {
      emitErrorAndExit($db, 'Could not retrieve skeleton id.');
    }
    
    if (!empty($sk)) {
      $sk_id = $sk[0]['class_instance_id'];
    } else {
      emitErrorAndExit($db, 'Can not find skeleton for this treenode.');
    }

    $neu = $db->getCIFromCI( $pid, $sk_id, 'model_of' );
    if (false === $neu) {
      emitErrorAndExit($db, 'Coult not retrieve neuron!');
    }
    if (!empty($neu)) {
      $neu_id = $neu[0]['id'];
    } else {
      emitErrorAndExit($db, 'Can not find neuron for the skeleton.');
    }

    // loop over all children
    $treenodes = $db->getResult('SELECT "treenode"."id" AS "tnid" FROM "treenode" WHERE "treenode"."parent_id" = '.$tnid);

    if (false === $treenodes) {
      emitErrorAndExit($db, 'Coult not retrieve children nodes.');
    }

    foreach($treenodes as $key => $tn) {
      
      // update all the children to become root
      $ids = $db->getResult('UPDATE "treenode" SET "parent_id" = NULL WHERE "treenode"."id" = '.$tn['tnid']);
      
      if (false === $ids) {
        emitErrorAndExit($db, 'Could not update children to become root.');
      }
      
      // create a new skeleton for each child
      $data = array(
        'user_id' => $uid,
        'project_id' => $pid,
        'class_id' => $skid,
        'name' => 'skeleton'
        );
      $skelid = $db->insertIntoId('class_instance', $data );
      
      if (false === $skelid) {
        emitErrorAndExit($db, 'Could not create a new skeleton for each child.');
      }
      
      // update skeleton name by adding its id to the end
      $up = array('name' => 'skeleton '.$skelid);
      $upw = 'id = '.$skelid;
      $db->update( "class_instance", $up, $upw);     
      
      if (false === $db) {
        emitErrorAndExit($db, 'Could not rename skeleton.');
      }

      // make new skeleton model_of neuron
      $data = array(
        'user_id' => $uid,
        'project_id' => $pid,
        'relation_id' => $modof_id,
        'class_instance_a' => $skelid,
        'class_instance_b' => $neu_id 
      );
      $db->insertInto('class_instance_class_instance', $data );
      
      if (false === $db) {
        emitErrorAndExit($db, 'Could not set relation between skeleton and neuron.');
      }

      // update the element_of relationship for each of the treenode children recursively
      $allchi = $db->getAllTreenodeChildrenRecursively( $pid, $tn['tnid'] );
      
      if (false === $alchi) {
        emitErrorAndExit($db, 'Could not retrieve all treenode children.');
      }
      
      foreach($allchi as $key => $chitn) {
        error_log("Updating element_of of treenode id".$chitn['id']." to new skeleton id ".$skelid);
        // update the element_of to the newly created skeleton
        // and the new root treenode
        $ids = $db->getResult('UPDATE "treenode_class_instance" SET "class_instance_id" = '.$skelid.' WHERE
        "treenode_class_instance"."treenode_id" = '.$chitn['id'].' AND
        "treenode_class_instance"."relation_id" = '.$eleof_id);
        
        if (false === $ids) {
          emitErrorAndExit($db, 'Could not update skeleton id of children treenodes.');
        }
      }
    }

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

    // remove original skeleton
    $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$sk_id);

    echo "Removed treenode successfully.";  

  } else {
    // treenode is not root
    // it has a parent and children. We need to reconnect all the children
    // to the parent, and do not update the treenode element_of skeleton relationship
  
    // no root, reconnect to parent
    $parentid = $forpar[0]['parent'];
  
    // update all the children to become root
    // first update parent
    $treenodes = $db->getResult('SELECT "treenode"."id" AS "tnid" FROM "treenode" WHERE "treenode"."parent_id" = '.$tnid);
    
    if (false === $treenodes) {
      emitErrorAndExit($db, 'Could not retrieve children of non-root treenode '.$tnid);
    }
    
    foreach($treenodes as $key => $tn) {
      $ids = $db->getResult('UPDATE "treenode" SET "parent_id" = '.$parentid.' WHERE "treenode"."id" = '.$tn['tnid']);
      if (false === $ids) {
        emitErrorAndExit($db, 'Could not update parent id of children nodes.');
      }
    }
  
    // Before deleting the treenode
    // make sure that we delete all anotations (model_of) of the treenode
    // from the class_instance table.
    // Remove model_of, e.g. pre- or postsynaptic terminals
    // Remove model_of, includes deleting the class_instances
    $treein = $db->getResult('SELECT "tci"."class_instance_id" AS "id" FROM "treenode_class_instance" AS "tci"
                              WHERE "tci"."relation_id" = '.$modof_id.'
                              AND "tci"."treenode_id" = '.$tnid.'
                              AND "tci"."project_id" = '.$pid);
  
    if (false === $treein) {
      emitErrorAndExit($db, 'Could not select class instances.');
    }
  
    // delete class_instance
    if(!empty($treein)) {
      foreach($treein as $key => $tn) {
        $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$tn['id']);
        if (false === $ids) {
          emitErrorAndExit($db, 'Could not delete class instances.');
        }
      }
    }
  
    // Finally delete the treenode to be consistent with the foreign key constraint
    // with on cascade delete, this will delete all its labels
    $ids = $db->deleteFrom("treenode", ' "treenode"."id" = '.$tnid);
    
    if (false === $ids) {
      emitErrorAndExit($db, 'Could not delete treenode #'.$tnid);
    }
  
    echo "Removed treenode successfully.";  

  }

  if (! $db->commit() ) {
		emitErrorAndExit( $db, 'Failed to commit!' );
	}

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}      

?>
