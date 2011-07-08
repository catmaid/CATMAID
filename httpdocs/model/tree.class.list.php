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

if ( $pid )
{
	if ( $uid )
	{
		
		// retrieve all the classes for a project in a flat list for now
		
		$class = $db->getResult(
		'SELECT "class"."id", "class"."class_name", "class"."uri", "class"."description" 
		FROM "class" WHERE "class"."project_id" = '.$pid.' AND "class"."showintree"');
		
		$narr = array();

		foreach( $class as $cl ) {
			
			// setting a set of class hardcoded
			
			if( $cl['class_name'] == 'neuron')
				$rel = 'neuron';
			else if( $cl['class_name'] == 'skeleton')
				$rel = 'skeleton';
			else if( $cl['class_name'] == 'synapse')
				$rel = 'synapse';
			else if( $cl['class_name'] == 'group')
				$rel = 'group';
			else if( $cl['class_name'] == 'neurongroup')
				$rel = 'neurongroup';
      else if( $cl['class_name'] == 'soma')
        $rel = 'soma';
			else
				$rel = 'anything';
			
			$narr[] = array(
				'data' => array(
					'title' => $cl['class_name'],
					),
		 		'attr' => array('id' => 'node_'. $cl['id'],
								'href' => $cl['uri'],
								'rel' => $rel),
				'children' => array()
				);
		}
					
		// generate big array
		$bigarr = array('data' => array(
										'title' => 'Root',
										),
						'attr' => array('id' => 'node_0',
						 				'rel' => 'root'),
						'state' => 'open',
						'children' => $narr);
		
		$sOutput = '[';
		$sOutput .= tv_node( $bigarr );
		$sOutput .= ']';
		echo $sOutput;
		
	}
	else
		echo json_encode( array( 'error' => 'You are not logged in currently.  Please log in to be able to retrieve the tree.' ) );
}
else
	echo json_encode( array( 'error' => 'Project closed. Can not retrieve the tree.' ) );

?>
