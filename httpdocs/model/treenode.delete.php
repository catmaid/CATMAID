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
    // make sure to delete also all model_of and element_of relationships
    // if deleted from treenode, should be automatically deleted from
    // treenode_class_instance by cascade delete of postgres
      $modof_id = $db->getRelationId( $pid, 'model_of' );
      if(!$modof_id) { echo makeJSON( array( '"error"' => 'Can not find "model_of" relation for this project' ) ); return; }

      $eleof_id = $db->getRelationId( $pid, 'element_of' );
      if(!$eleof_id) { echo makeJSON( array( '"error"' => 'Can not find "element_of" relation for this project' ) ); return; }

      // for labels, only remove the relation
      $lab_id = $db->getRelationId( $pid, 'labeled_as' );
      if(!$lab_id) { echo makeJSON( array( '"error"' => 'Can not find "labeled_as" relation for this project' ) ); return; }
         
      if ( $tnid != -1 ) {
       
        // check if treenode is root
        $forpar = $db->getResult('SELECT "treenode"."parent_id" AS "parent" FROM "treenode" WHERE "treenode"."id" = '.$tnid);
        if(empty($forpar[0]['parent']))
        {
          // it is root, just delete it

          // update all the children to become root
          $treenodes = $db->getResult('SELECT "treenode"."id" AS "tnid" FROM "treenode" WHERE "treenode"."parent_id" = '.$tnid);
          foreach($treenodes as $key => $tn) {
            $ids = $db->getResult('UPDATE "treenode" SET "parent_id" = NULL WHERE "treenode"."id" = '.$tn['tnid']);
          };

          // check length of array, only if 1 (i.e. the treenode is the only node left of the
          // skeleton, remove the skeleton, otherwise not)
          // retrieve number of treenodes in skeleton
          $remainingnodes = $db->getAllTreenodeChildrenRecursively( $pid, $tnid );

          if(count($remainingnodes) == 1 ) {
            // remove skeleton as well from treenode_class_instance
            $remskel = 'OR "tci"."relation_id" = '.$eleof_id.")";            
          } else {
            $remskel = "OR false)";
          }
        }
        else
        {
          // no root, reconnect to parent
          $parentid = $forpar[0]['parent'];

          // update all the children to become root
          $treenodes = $db->getResult('SELECT "treenode"."id" AS "tnid" FROM "treenode" WHERE "treenode"."parent_id" = '.$tnid);
          foreach($treenodes as $key => $tn) {
            $ids = $db->getResult('UPDATE "treenode" SET "parent_id" = '.$parentid.' WHERE "treenode"."id" = '.$tn['tnid']);
          };
          // first update parent and then delete to be consistent with the foreign key constraint
          $ids = $db->deleteFrom("treenode", ' "treenode"."id" = '.$tnid);
          // do not remove skeleton
          $remskel = "OR false)";
        }

        // remove model_of, e.g. pre- or postsynaptic terminals
        // remove model_of, includes deleting the class_instances
        $treein = $db->getResult('SELECT "tci"."class_instance_id" AS "id" FROM "treenode_class_instance" AS "tci"
         WHERE ("tci"."relation_id" = '.$modof_id.' '.$remskel.' AND "tci"."treenode_id" = '.$tnid.' AND 
         "tci"."project_id" = '.$pid);
         
        // delete treenode
        $ids = $db->deleteFrom("treenode", ' "treenode"."id" = '.$tnid);
        
        // delete class_instance
        if(!empty($treein)) {
          foreach($treein as $key => $tn) {
             $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$tn['id']);
          }
        }

        // delete label relationships without deleting the class_instance labels
        $ids = $db->deleteFrom("treenode_class_instance", ' "treenode_class_instance"."treenode_id" = '.$tnid.' AND
        "treenode_class_instance"."relation_id" = '.$lab_id);
        
        echo "Removed treenode successfully.";
      }
        
  }
  else
    echo makeJSON( array( 'error' => 'You are not logged in currently.  Please log in to be able to delete treenodes.' ) );
}
else
  echo makeJSON( array( 'error' => 'Project closed. Can not apply operation.' ) );
  
?>