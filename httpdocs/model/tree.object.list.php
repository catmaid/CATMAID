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
$parentname = isset( $_REQUEST[ 'parentname' ] ) ? $_REQUEST[ 'parentname' ] : "";

if (isset($_REQUEST['expandtarget'])) {
    $expandRequest = array_map("intval",
                               explode(',', $_REQUEST['expandtarget']));
} else {
    $expandRequest = array();
}

// extend it by giving a set of relationship types
// limit number of nodes retrievable
$maxnodes = 5000;


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

# 3. The user must be allowed to view annotations:
checkPermissionsOrExit($db, $uid, $pid, $VIEW_ANY_ALLOWED);

$classes = $db->getMap( $pid, 'class' );
if (!$classes) {
    echo makeJSON( array( 'error' => "Could not find classes for project $pid" ) );
    return;
}

$relations = $db->getMap( $pid, 'relation' );
if (!$relations) {
    echo makeJSON( array( 'error' => "Could not find relations for project $pid" ) );
    return;
}

// Check that this returned all the required IDs:
$required_classes = array('neuron', 'skeleton', 'group', 'root');
$required_relations = array('model_of', 'part_of');
foreach ($required_classes as $class) {
    if (!array_key_exists($class, $classes)) {
        echo makeJSON( array( 'error' => "Failed to find the required class '$class'" ) );
        return;
    }
}
foreach ($required_relations as $relation) {
    if (!array_key_exists($relation, $relations)) {
        echo makeJSON( array( 'error' => "Failed to find the required relation '$relation'" ) );
        return;
    }
}

# Just one select query, no transaction needed:
if ( !$parentid ) {
  # Retrieve the id of the root node for this project
  $res = $db->getResult('SELECT "ci"."id", "ci"."name"
                         FROM "class_instance" AS "ci" 
                         WHERE "ci"."project_id" = '.$pid.'
                         AND "ci"."class_id" = '.$classes['root']);

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

if (strpos($parentname, "Isolated synaptic terminals")) {

    $res = $db->getResult(
        "SELECT count(tci.id) as treenodes,
                ci.id,
                ci.name,
                ci.class_id, cici.relation_id,
                cici.class_instance_b AS parent,
                sk.id AS skeleton_id,
                u.name AS username,
                cl.class_name
         FROM class_instance ci,
              class cl,
              class_instance_class_instance cici,
              class_instance_class_instance modof,
              class_instance sk,
              treenode_class_instance tci,
              \"user\" u
         WHERE cici.class_instance_b = $parentid AND
               cici.class_instance_a = ci.id AND
               cl.id = ci.class_id AND
               modof.class_instance_b = cici.class_instance_a AND
               modof.relation_id = {$relations['model_of']} AND
               sk.id = modof.class_instance_a AND
               tci.class_instance_id = sk.id AND
               tci.relation_id = {$relations['element_of']} AND
               u.id = ci.user_id AND
               ci.project_id = $pid
         GROUP BY ci.id,
                  ci.name,
                  ci.class_id,
                  cici.relation_id,
                  cici.class_instance_b,
                  skeleton_id,
                  u.name,
                  cl.class_name
         HAVING count(tci.id) > 1");

    if ($res === FALSE) {
        echo makeJSON( array( 'error' => "Failed to find children of the Isolated synaptic terminals" ) );
        return;
    }

    // If this list is part of an expansion caused by selecting a
    // particular skeleton that is part of a neuron that is in the
    // 'Isolated synaptic terminals', add that to the results.
    $isolated_group_index = array_search($parentid, $expandRequest);

    error_log("got isolated_group_index $isolated_group_index");
    error_log("got count(expandRequest)".count($expandRequest));

    if (($isolated_group_index !== FALSE) &&
        ($isolated_group_index < count($expandRequest))) {

        $neuron_id = $expandRequest[$isolated_group_index + 1];

        $extra_res = $db->getResult(
            "SELECT ci.id,
                    ci.name,
                    ci.class_id,
                    u.name AS username,
                    cici.relation_id,
                    cici.class_instance_b AS parent,
                    cl.class_name
             FROM class_instance AS ci
               INNER JOIN class_instance_class_instance AS cici
                 ON ci.id = cici.class_instance_a
               INNER JOIN class AS cl
                 ON ci.class_id = cl.id
               INNER JOIN \"user\" AS u
                 ON ci.user_id = u.id
             WHERE ci.id = $neuron_id AND
                   ci.project_id = $pid AND
                   cici.class_instance_b = $parentid AND
                   (cici.relation_id = ${relations['model_of']}
                    OR cici.relation_id = ${relations['part_of']})
             ORDER BY ci.name
             LIMIT $maxnodes");

        error_log("got extra_res ".print_r($extra_res, TRUE));

        if ($extra_res === FALSE) {
            echo makeJSON( array( 'error' => "Failed to find the requested neuron" ) );
            return;
        }

        $res = array_merge($res, $extra_res);
    }

} else {

  # Just one select query, no transaction needed:
  $res = $db->getResult(
      "SELECT ci.id,
              ci.name,
              ci.class_id,
              \"user\".name AS username,
              cici.relation_id,
              cici.class_instance_b AS parent,
              cl.class_name
       FROM class_instance AS ci
         INNER JOIN class_instance_class_instance AS cici
           ON ci.id = cici.class_instance_a
         INNER JOIN class AS cl
           ON ci.class_id = cl.id
         INNER JOIN \"user\"
          ON ci.user_id = \"user\".id
       WHERE ci.project_id = $pid AND
             cici.class_instance_b = $parentid AND
             (cici.relation_id = {$relations['model_of']}
              OR cici.relation_id = {$relations['part_of']})
       ORDER BY ci.name ASC
       LIMIT $maxnodes");

}

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
