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

$stacks = $_GET["stacks"]; // the stacks to process

// Start transaction
if (! $db->begin() ) {
	echo json_encode( array( 'error' => 'Could not start transaction.' ) );
	return;
}

$project_stacks = false;

try {

  $project_stacks = $db->getResult(
    'SELECT DISTINCT "stack"."id" as "sid",
        "stack"."image_base" AS "image_base"        
      FROM "project" LEFT JOIN "project_user"
          ON "project"."id" = "project_user"."project_id" INNER JOIN "project_stack"
            ON "project"."id" = "project_stack"."project_id" INNER JOIN "stack"
              ON "stack"."id" = "project_stack"."stack_id"
        
        WHERE   "project"."id" = '.$pid.' AND
            "stack"."id" = '.$sid.' AND
            ( "project_user"."user_id" = 1 OR
              "project"."public" )'
  );
  
  if (false === $project_stacks) {
    emitErrorAndExit($db, 'Failed to retrieve stack data.');
  }
  
  if ( $project_stacks )
  {
    if (! $db->commit() ) {
      emitErrorAndExit( $db, 'Failed to commit!' );
    }

    echo makeJSON( $project_stack );

  } else {
    echo emitErrorAndExit($db, 'Invalid project stack selection.' );
  }

} catch (Exception $e) {
	emitErrorAndExit( $db, 'ERROR: '.$e );
}

// TODO: Make sure the whole URL can be used with Gmagick
$url = str_replace("http://rablibrary.mpi-cbg.de/catmaid", "..", $url);

//Instantiate a new Gmagick object
$image = new Gmagick( $url );

$image->modulateImage(100, 100, 100);

//Create a border around the image, then simulate how the image will look like as an oil painting
//Notice the chaining of mutator methods which is supported in gmagick
//$image->borderImage("yellow", 8, 8)->oilPaintImage(0.3);

header( 'content-type: image/' . $type );
echo $image;

?>
