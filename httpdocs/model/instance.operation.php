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

# operation=rename_node&id=6&title=neuron1+%3Cneuron%3E+

$op = isset( $_REQUEST[ 'operation' ] ) ? $_REQUEST[ 'operation' ] : 0;

$name = isset( $_REQUEST[ 'title' ] ) ? $_REQUEST[ 'title' ] : 0;
$id = isset( $_REQUEST[ 'id' ] ) ? intval($_REQUEST[ 'id' ]) : 0;
$src = isset( $_REQUEST[ 'src' ] ) ? intval($_REQUEST[ 'src' ]) : 0;
$ref = isset( $_REQUEST[ 'ref' ] ) ? intval($_REQUEST[ 'ref' ]) : 0;
$rel = isset( $_REQUEST[ 'rel' ] ) ? $_REQUEST[ 'rel' ] : 0;


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

# 3. Permissions?
checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED | $EDIT_ANY_ALLOWED);


// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}




// remove skeleton, i.e. treenodes and corresponding relations 
function remove_skeleton($db, $pid, $skelid) {

  $res = $db->getResult("DELETE FROM treenode WHERE skeleton_id = $skelid AND project_id = $pid");

  if (false === $res) {
    emitErrorAndExit($db, 'Failed to delete in treenode for skeleton #'.$skid);
  }

  $res = $db->getResult("DELETE FROM treenode_connector WHERE skeleton_id = $skelid AND project_id = $pid");

  if (false === $res) {
    emitErrorAndExit($db, 'Failed to delete in treenode_connector for skeleton #'.$skid);
  }

  if (false === $res) {
    emitErrorAndExit($db, 'Failed to delete treenodes for skeleton #'.$skid);
  }
}


function finish($output) {
  global $db;
  if (! $db->commit() ) {
    emitErrorAndExit( $db, 'Failed to commit!' );
  }
  echo makeJSON($output);
}


try {

  if ( $op == 'rename_node')
  {
    $ids = $db->update("class_instance", array("name" => $name) ,' "class_instance"."id" = '.$id);
    if (false === $ids) {
      emitErrorAndExit($db, 'Failed to update class instance.');
    }
    $classname = isset( $_REQUEST[ 'classname' ] ) ? $_REQUEST[ 'classname' ] : 0;
    insertIntoLog( $db, $uid, $pid, "rename_$classname", null , "Renamed $classname with ID $id to $name" );
    finish( array( 'class_instance_id' => $ids) );
  }
  else if ( $op == 'remove_node')
  {

      // check if node is a skeleton. if so, we have to remove its treenodes as well!
      if ( $rel ) {
        if ( $rel == "skeleton" )
        {
          remove_skeleton($db, $pid, $id);
          $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$id);

          if (false === $ids) {
            emitErrorAndExit($db, 'Failed to delete skeleton from instance able.');
          }

          insertIntoLog( $db, $uid, $pid, "remove_skeleton", null , "Removed skeleton with ID $id and name $name" );

          // finish("Removed skeleton successfully.");
          finish( array('status' => 1, 'message' => "Removed skeleton successfully.") );
        }
        else if( $rel == "neuron" )
        {
          // retrieve skeleton ids
          $model_of_id = $db->getRelationId( $pid, "model_of" );
          $res = $db->getResult('SELECT "cici"."class_instance_a" AS "skeleton_id"
                FROM "class_instance_class_instance" AS "cici"
                WHERE "cici"."class_instance_b" = '.$id.' AND "cici"."project_id" = '.$pid.'
                AND "cici"."relation_id" = '.$model_of_id);

          foreach($res as $key => $val) {
                remove_skeleton($db, $pid, $val['skeleton_id']);
                $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$val['skeleton_id']);
          }
          $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$id);

          if (false === $ids) {
            emitErrorAndExit($db, 'Failed to delete node from instance table.');
          }

          insertIntoLog( $db, $uid, $pid, "remove_neuron", null , "Removed neuron with ID $id and name $name" );

          finish( array('status' => 1, 'message' => "Removed neuron successfully.") );

        }
        else
        {
          $ids = $db->deleteFrom("class_instance", ' "class_instance"."id" = '.$id);

          if (false === $ids) {
            emitErrorAndExit($db, 'Failed to delete node from instance table.');
          }

          finish( array('status' => 1, 'message' => "Removed node successfully.") );
        }
      }

  }
  else if ( $op == 'create_node')
  {

    $classname = isset( $_REQUEST[ 'classname' ] ) ? $_REQUEST[ 'classname' ] : 0;
    $relname = isset( $_REQUEST[ 'relationname' ] ) ? $_REQUEST[ 'relationname' ] : 0;
    $objname = isset( $_REQUEST[ 'objname' ] ) ? $_REQUEST[ 'objname' ] : 0;
    $parentid = isset( $_REQUEST[ 'parentid' ] ) ? intval($_REQUEST[ 'parentid' ]) : 0;

    // These are both subsequently used directly in queries:
    $classname = pg_escape_string($classname);
    $relname = pg_escape_string($relname);

    // create class_instance
    $classi = $db->getResult('SELECT "class"."id" FROM "class"
                              WHERE "class"."project_id" = '.$pid.' 
                              AND "class"."class_name" = \''.$classname.'\'');
    if (false === $classi) {
      emitErrorAndExit($db, 'Failed to select class.');
    }

    $classid = !empty($classi) ? $classi[0]['id'] : 0;

    $ins = array('user_id' => $uid,
           'project_id' => $pid,
           'class_id' => $classid,
           'name' => $objname);
    
    $cid = $db->insertIntoId( "class_instance", $ins);
    
    if (false === $cid) {
      emitErrorAndExit($db, 'Failed to insert instance of class.');
    }

    insertIntoLog( $db, $uid, $pid, "create_$classname", null , "Created $classname with ID $cid" );
    
    // find correct root element
    if($parentid)
      $parid = $parentid;
    else
    {
      $pari = $db->getResult('SELECT "class"."id" FROM "class"
                              WHERE "class"."project_id" = '.$pid.' 
                              AND "class"."class_name" = \'root\'');
      if (false === $pari) {
        emitErrorAndExit($db, 'Failed to select root.');
      }

      $paridc = !empty($pari) ? $pari[0]['id'] : 0;
      $parii = $db->getResult('SELECT "class_instance"."id" FROM "class_instance"
                                WHERE "class_instance"."project_id" = '.$pid.' 
                                AND "class_instance"."class_id" = '.$paridc);
      if (false === $parii) {
        emitErrorAndExit($db, 'Failed to select pairdc.');
      }

      $parid = !empty($parii) ? $parii[0]['id'] : 0;
    }
    
    // create class_instance_class_instance with given relation
    $relres = $db->getResult('SELECT "relation"."id" FROM "relation"
                              WHERE "relation"."project_id" = '.$pid.' 
                              AND "relation"."relation_name" = \''.$relname.'\'');
    if (false === $relres) {
      emitErrorAndExit($db, 'Failed to select relation '.$relname);
    }
    $relid = !empty($relres) ? $relres[0]['id'] : 0;
    
    $ins = array('user_id' => $uid,
           'project_id' => $pid,
           'relation_id' => $relid,
           'class_instance_a' => $cid,
           'class_instance_b' => $parid);
    $q = $db->insertInto( "class_instance_class_instance", $ins);
    
    if (false === $q) {
      emitErrorAndExit($db, 'Failed to insert relation.');
    }
    
    finish( array( 'class_instance_id' => $cid) );

  }
  else if ( $op == 'move_node' )
  {
    if ( $src && $ref )
    {
      $classname = isset( $_REQUEST[ 'classname' ] ) ? $_REQUEST[ 'classname' ] : 0;
      $targetname = isset( $_REQUEST[ 'targetname' ] ) ? $_REQUEST[ 'targetname' ] : 0;
      if( $classname === 'skeleton' ) {
        // special case for model_of relationship
        $modid = $db->getRelationId( $pid, "model_of" );
        $up = array('class_instance_b' => $ref);
        $upw = 'project_id = '.$pid.' AND relation_id = '.$modid.' AND class_instance_a = '.$src;
        $q = $db->update( "class_instance_class_instance", $up, $upw);
        if (false === $q) {
          emitErrorAndExit($db, 'Failed to update model_of relation.');
        }
      } else {
        // otherwise update the part_of relationships
        $partof_id = $db->getRelationId( $pid, "part_of" );
        $up = array('class_instance_b' => $ref);
        $upw = 'project_id = '.$pid.' AND relation_id = '.$partof_id.' AND class_instance_a = '.$src;
        $q = $db->update( "class_instance_class_instance", $up, $upw);
        if (false === $q) {
          emitErrorAndExit($db, 'Failed to update part_of relation.');
        }
      }

      insertIntoLog( $db, $uid, $pid, "move_$classname", null , "Moved $classname with ID $src to $targetname with ID $ref" );

      finish( array( 'message' => 'Success.') );
    }
  }
  else if ( $op == 'has_relations' )
  {
    
    $relnr = isset( $_REQUEST[ 'relationnr' ] ) ? intval($_REQUEST[ 'relationnr' ]) : 0;
    
    $relwhere = "";
    for ($i = 0; $i < $relnr; $i++) {
      
      $re = isset( $_REQUEST[ 'relation'.$i ] ) ? $_REQUEST[ 'relation'.$i ] : "none";
      
        $relid = $db->getRelationId( $pid, $re );
        
        if (false === $relid) {
          emitErrorAndExit($db, 'Failed to select relation '.$re);
        }
        
        $relwhere .= 'relation_id = '.$relid;
        if( $i < ($relnr - 1)) {
          $relwhere .= ' OR ';
        };
    }
    
    $rels = $db->getResult('SELECT "cici"."id" FROM "class_instance_class_instance" AS "cici"
                            WHERE "cici"."project_id" = '.$pid.' 
                            AND "cici"."class_instance_b" = '.$id.' 
                            AND ('.$relwhere.')');
    if (false === $rels) {
      emitErrorAndExit($db, 'Failed to select CICI.');
    }
    $ret = !empty($rels) ? finish(array('has_relation' => 1)) : finish(array('has_relation' => 0));
    

  }


} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

?>
