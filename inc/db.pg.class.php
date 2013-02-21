<?php

/**
 * db.pg.class.php
 *
 * @author Stephan Saalfeld <saalfeld@phenomene.de>
 * @copyright Copyright (c) 2006, Stephan Saalfeld
 * @version 0.1
 */
/**
 */
include_once( 'setup.inc.php' );
include_once( 'migrations.php' );

/**
 * factory method to get the single instance of the object
 *
 * @param string $mode 'read'|'write'
 *
 * @return DB singleton instance
 *
 * @todo every PHP script can get write access to the database calling getDB( 'write' ), should it be restricted?
 *  possible 'solution':  different include paths for HTTPS and HTTP, HTTP-includes only contain SQL-read login...
 */
function &getDB( $mode = 'read' )
{
	static $singleton_database;
	if ( !isset( $singleton_database ) )
	{
		$singleton_database = new DB( $mode );
	}
	return $singleton_database;
}

/**
 * DB
 *
 * provides access to the database and some specific methods
 *
 * @todo every PHP script can get write access to the database calling DB( 'write' )
 * @see getDB()
 */
class DB
{
	/**#@+
	 * @var string
	 * @access private
	 */
	var $host;
	var $user;
	var $pw;
	var $db;
	var $port;
	var $handle;

    var $debug = false;
    var $debugTimings = false;

	/**
	 * Constructor
	 */  
	function DB( $mode = 'read' )
	{
		global $db_host, $db_user, $db_pw, $db_db, $db_port;
		$this->host = $db_host[ $mode ];
		$this->user = $db_user[ $mode ];
		$this->pw = $db_pw[ $mode ];
		$this->db = $db_db[ $mode ];
		$this->port = isset( $db_port[ $mode ] ) ? $db_port[ $mode ] : 5432;

		$this->handle = pg_connect( 'host='.$this->host.' port='.$this->port.' dbname='.$this->db.' user='.$this->user.' password= '.$this->pw ) or die( pg_last_error() );
	}
	/**#@-*/
	
	/**
	 * get the last error if there was one
	 *
	 * @return string
	 */
	function getError()
	{
		return pg_last_error();
	}
	
	/**
	 * get the results of an SQL query
	 *
	 * @param string $query SQL query
	 *
	 * @return false|array associative index=>name=>value
	 */
	function getResult( $query )
	{
        if ($this->debugTimings)
            $queryStart = microtime(TRUE);
		if( $this->debug )
			error_log("In getResult: ".preg_replace('/\s+/', ' ', $query));
		$result = array();
		if ( $temp = pg_query( $this->handle, $query ) )
		{
			while ( $result[] = @pg_fetch_assoc( $temp ) ) {}
			array_pop( $result );
		}
		else
			$result = false;
        if ($this->debugTimings)
            error_log(sprintf("Query took: %.3f seconds", (microtime(TRUE) - $queryStart)));
		return $result;
	}

	/** Begin a transaction. Must be followed by zero or more
	 * queries and insertions and then, finally, by a call to commit().
	 */
	function begin()
	{
		return pg_query( $this->handle, "BEGIN" );
	}

	function rollback()
	{
		return pg_query( $this->handle, "ROLLBACK" );
	}

	function commit()
	{
		return pg_query( $this->handle, "COMMIT" );
	}
	
	/**
	 * get the results of an SQL query keyed by id
	 *
	 * @param string $query SQL query, $id for what name for key
	 *
	 * @return false|array associative index=>name=>value
	 */
	function getResultKeyedById( $query, $id )
	{
		if( $this->debug )
			error_log("In getResultKeyedById with id ".$id.": ".preg_replace('/\s+/', ' ', $query));
		$result = array();
		if ( $temp = pg_query( $this->handle, $query ) )
		{
			while ( $result[] = @pg_fetch_assoc( $temp ) ) {}
			array_pop( $result );
		}
		else
		{
			return false;
		}

		$nresult = array();
		
		if( $result ) {
			foreach( $result as $value ) {
				$nresult[$value[$id]] = $value; 
			}
		}
		return $nresult;
	}
	
	/**
	 * count the entries of a table that match an optional condition
	 *
	 * @param string $table
	 * @param string $cond condition
	 *
	 * @return int
	 */
	function countEntries( $table, $cond = '1' )
	{
		$entries = $this->getResult( 'SELECT count( * ) AS "count" FROM "'.$table.'" WHERE '.$cond );
		//echo( "SELECT count(*) AS 'count' FROM `".$table."` WHERE ".$cond );
		if (false === $entries) return false;
		return ( $entries[ 0 ][ 'count' ] );
	}

	/**
	 * close the connection
	 *
	 * @return void
	 */
	function close()
	{
		pg_close( $this->handle );
		return;
	}
	
	/**
	 * insert an entry into a table
	 *
	 * @param string $table
	 * @param array $values associative name=>value
	 *
	 * @return void
	 */
	function insertInto( $table, $values )
	{
		$queryStr = 'INSERT INTO "'.$table.'" (';
		$keys = array_keys( $values );
		$max = sizeof( $keys ) - 1;
		for ( $i = 0; $i < $max; ++$i )
		{
			$queryStr .= '"'.$keys[ $i ].'", ';
		}
		$queryStr .= '"'.$keys[ $max ].'") VALUES (';
		for ( $i = 0; $i <= $max; ++$i )
		{
			if ( is_numeric( $values[ $keys[ $i ] ] ) ) $queryStr .= $values[ $keys[ $i ] ];
			elseif ( is_string( $values[ $keys[ $i ] ] ) ) $queryStr .= "'".pg_escape_string( $values[ $keys[ $i ] ] )."'";
			elseif ( is_bool( $values[ $keys[ $i ] ] ) ) $queryStr .= ( $values[ $keys[ $i ] ] ? 'TRUE' : 'FALSE' );
			if ( $i != $max ) $queryStr .= ', ';
		}
		$queryStr .= ')';
		//echo $queryStr, "<br />\n";
		if( $this->debug )
			error_log("In insertInto: ".preg_replace('/\s+/', ' ', $queryStr));
		return pg_query( $this->handle, $queryStr );
	}
	
	/**
	 * insert an entry into a table
	 * return the automatically set id (sequence)
	 *
	 * @param string $table
	 * @param array $values associative name=>value
	 *
	 * @return int id
	 */
	function insertIntoId( $table, $values )
	{
		$this->insertInto( $table, $values );
		$id = $this->getResult( 'SELECT lastval() AS "id"' );
		if (false === $id) return false; // query failed
		return intval($id[ 0 ][ 'id' ]);
	}
	
	/**
	 * update an entry of a table
	 *
	 * @param string $table
	 * @param array $values associative name=>value
	 * @param string $cond condition
	 *
	 * @return int affected rows
	 */
	function update( $table, $values, $cond = '0' )
	{
		$query	= 'UPDATE "'.$table.'" SET ';
		$keys	= array_keys( $values );
		$max	= sizeof( $values );
		for ( $i = 0; $i < $max; ++$i )
		{
			$query .= '"'.$keys[ $i ].'" = ';
			if ( is_numeric( $values[ $keys[ $i ] ] ) ) $query .= $values[ $keys[ $i ] ];
			elseif ( is_string( $values[ $keys[ $i ] ] ) ) $query .= "'".pg_escape_string( $values[ $keys[ $i ] ] )."'";
			elseif ( is_bool( $values[ $keys[ $i ] ] ) ) $query .= ( $values[ $keys[ $i ] ] ? 'TRUE' : 'FALSE' );
			if ( $i != $max - 1 ) $query .= ', ';
		}
		$query .= ' WHERE '.$cond;
		//echo $query;
		if( $this->debug )
			error_log("In update: ".preg_replace('/\s+/', ' ', $query));	
		$r = pg_query( $this->handle, $query );
		if (false === $r) return false; // failed
		return pg_affected_rows( $r );
	}
	
	/**
	 * delete an entry from a table
	 *
	 * @param string $table
	 * @param string $cond condition
	 *
	 * @return int affected rows
	 */
	function deleteFrom( $table, $cond = '0' )
	{
		//print("DELETE FROM `".$table."` WHERE ".$cond.";<br />\n");
		$query = 'DELETE FROM "'.$table.'" WHERE '.$cond;
		if( $this->debug )
			error_log("In delete: ".preg_replace('/\s+/', ' ', $query));
		$r = pg_query( $this->handle, $query );
		if (false === $r) return false; // failed
		return pg_affected_rows( $r );
	}
	
	/**
	 * get a branch of a recursive tree
	 *
	 * a recursive tree contains a key and a reference to the parent nodes key
	 * get a branch through climbing up the tree from the given node to the root
	 *
	 * @param string $table
	 * @param string $id id of the "youngest" node
	 * @param string $idName name of the id collumn
	 * @param string $pidName name of the parent id reference collumn
	 * @param string $cond condition
	 *
	 * @return array
	 *
	 * @todo sloppy fixed for postgres, never checked
	 */
	function getTreeBranch( $table, $id, $idName = 'id',$pidName = 'parent_id', $cond = '1' )
	{
		$ret = array();	
		do
		{
			$cur = $this->getResult( 'SELECT * FROM "'.$table.'" WHERE "'.$idName.'" = \''.$id.'\' AND '.$cond.' LIMIT 1' );
			$ret[] = $cur[ 0 ];
			$id = $cur[ 0 ][ $pidName ];
		}
		while ( sizeof( $cur ) > 0 && $cur[ 0 ][ $pidName ] );
		return $ret;
	}
	
	/**
	 * get a nodes children, childrens children and so on of parent node in a recursive tree
	 *
	 * a recursive tree contains a key and a reference to the parent nodes key
	 * children all have got the same parent node, every child can have children
	 *
	 * @uses DB::getTreeChildren() recursively
	 *
	 * @param string $table
	 * @param string $pid id of the parent node
	 * @param string $idName name of the id collumn
	 * @param string $pidName name of the parent id reference collumn
	 * @param string $cond condition
	 *
	 * @return array|0
	 *
	 * @todo sloppy fixed for postgres, never checked
	 */
	function getTreeChildren( $table, $pid, $idName = 'id', $pidName = 'parent_id', $cond = '1' )
	{
		$cur = $this->getResult( 'SELECT * FROM "'.$table.'" WHERE "'.$pidName.'" = \''.$pid.'\' AND '.$cond );
		$anz = sizeof( $cur );
		if ( $anz > 0 )
		{
			for ( $i = 0; $i < $anz; $i++ )
			{
				$ret[$i] = array(
						'node' => $cur[ $i ],
						'children' => $this->getTreeChildren(
							$table,
							$cur[ $i ][ $idName ],
							$idName,
							$pidName,
							$cond ) );
			}
		}
		else $ret = 0;
		return $ret;
	}
	
	/**
	 * get a nodes children, childrens children and so on of a parent node and the parent node as root in a recursive tree
	 *
	 * a recursive tree contains a key and a reference to the parent nodes key
	 * children all have got the same parent node, every child can have children
	 *
	 * @uses DB::getTreeChildren()
	 *
	 * @param string $table
	 * @param string $id id of the node
	 * @param string $idName name of the id collumn
	 * @param string $pidName name of the parent id reference collumn
	 * @param string $cond condition
	 *
	 * @return array|0
	 *
	 * @todo sloppy fixed for postgres, never checked
	 */
	function getTree( $table, $id, $idName = 'id', $pidName = 'parent_id', $cond = '1' )
	{
		$cur = $this->getResult( 'SELECT * FROM "'.$table.'" WHERE "'.$idName.'" = \''.$id.'\' AND '.$cond.' LIMIT 1' );
		if ( sizeof($cur) > 0 )
		{
			$ret = array( 'node' => $cur[0], 'children' => $this->getTreeChildren( $table, $id, $idName, $pidName, $cond ) );
		}
		else
		{
			$ret = 0;
		}
		return $ret;
	}
	
	/*
	 * Retrieve relation id for a relation class in a given project
	 */
	function getRelationId( $pid, $relationname )
	{
		$escaped_relationname = pg_escape_string($relationname);
		$res = $this->getResult(
		"SELECT relation.id FROM relation ".
		"WHERE relation.project_id = $pid AND ".
		"relation.relation_name = '$escaped_relationname'");
		$resid = !empty($res) ? $res[0]['id'] : 0;
		return $resid;
	}

	/*
	 * Retrieve class id for a class name in a given project
	 */
	function getClassId( $pid, $classname )
	{
		$escaped_classname = pg_escape_string($classname);
		$res = $this->getResult(
		"SELECT class.id FROM class ".
		"WHERE class.project_id = $pid AND ".
		"class.class_name = '$escaped_classname'");
		if (false === $res) return false;
		$resid = !empty($res) ? $res[0]['id'] : 0;
		return $resid;
	}

	/* Retrieve all classes or relations for a given project */
	function getMap( $pid, $type ) {
		if (!($type === "class" || $type === "relation")) {
			throw new Exception("The type passed to getMap must be 'class' or 'relation'");
		}
		$result = array();
		$query_result = pg_query($this->handle,
					 "SELECT {$type}_name, id FROM $type WHERE project_id = $pid");
		if (!$query_result) {
			return FALSE;
		}
		while ($row = pg_fetch_array($query_result, NULL, PGSQL_NUM)) {
			$result[$row[0]] = $row[1];
		}
		return $result;
	}

  /*
   * return all treenode ids for a skeleton starting with root node as a flat list
   * using the element_of relationship of the treenodes
   */
   function getTreenodeIdsForSkeleton( $pid, $skelid )
   {
    // element of id
    $ele_id = $this->getRelationId( $pid, 'element_of' );
    if(!$ele_id) { echo makeJSON( array( '"error"' => 'Can not find "element_of" relation for this project' ) ); return; }

    $res = $this->getResult(
    'SELECT "tci"."id" FROM "treenode_class_instance" AS "tci", "treenode"
    WHERE "tci"."project_id" = '.$pid.' AND
    "tci"."relation_id" = '.$ele_id.' AND
    "tci"."class_instance_id" = '.$skelid.' AND
    "treenode"."id" = "tci"."treenode_id"
    ORDER BY "treenode"."parent_id" DESC');

    return $res;
   }

   /*
    * return the number of treenodes for a skeleton
    */
   function getTreenodeCountForSkeleton( $pid, $skelid )
   {
    return count( $this->getTreenodeIdsForSkeleton( $pid, $skelid ) );
   }
   
   /*
    * return class_instance id of a treenode for a given relation in a project
    */
   function getClassInstanceForTreenode( $pid, $tnid, $relation )
   {
    // element of id
    $rel_id = $this->getRelationId( $pid, $relation );
    if(!$rel_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$relation.'" relation for this project' ) ); return; }

    $res = $this->getResult(
    'SELECT "tci"."class_instance_id" FROM "treenode_class_instance" AS "tci"
    WHERE "tci"."project_id" = '.$pid.' AND
    "tci"."relation_id" = '.$rel_id.' AND
    "tci"."treenode_id" = '.$tnid);
    
    return $res;
   }

  /*
   * create class instance for treenode
   * Returns: class_instance_id
   */
   function createClassInstanceForTreenode( $pid, $uid, $tnid, $relation, $class, $class_instance_name = "" )
   {
    $rel_id = $this->getRelationId( $pid, $relation );
    if(!$rel_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$relation.'" relation for this project' ) ); return; }

    $class_id = $this->getClassId( $pid, $class );
    if(!$class_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$class.'" class for this project' ) ); return; }
    
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'class_id' => $class_id,
      'name' => $class
      );
    $ci_id = $this->insertIntoId('class_instance', $data );
    if (false === $ci_id) return false; // failed
    // update with class_instance_name
    $q = false;
    if($class_instance_name == "") {
      $up = array('name' => $class.' '.$ci_id);
      $q = $this->update( "class_instance", $up, 'id = '.$ci_id); 
    } else {
      // use it as name
      $up = array('name' => $class_instance_name);
      $q = $this->update( "class_instance", $up, 'id = '.$ci_id); 
    }
    
    if (false === $q) return false; // failed
    
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'relation_id' => $rel_id,
      'treenode_id' => $tnid,
      'class_instance_id' => $ci_id
      );
    $q = $this->insertInto('treenode_class_instance', $data );
    
    if (false === $q) return false; // failed
    
    return $ci_id;
   }

  /*
   * create class instance for connector
   * Returns: class_instance_id
   */
   function createClassInstanceForConnector( $pid, $uid, $cid, $relation, $class, $class_instance_name = "" )
   {
    $rel_id = $this->getRelationId( $pid, $relation );
    if(!$rel_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$relation.'" relation for this project' ) ); return; }

    $class_id = $this->getClassId( $pid, $class );
    if(!$class_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$class.'" class for this project' ) ); return; }
    
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'class_id' => $class_id,
      'name' => $class
      );
    $ci_id = $this->insertIntoId('class_instance', $data );
    if (false === $ci_id) return false;
  
    // update with class_instanstance_name
    $q = false;
    if($class_instance_name == "") {
      $up = array('name' => $class.' '.$ci_id);
      $q = $this->update( "class_instance", $up, 'id = '.$ci_id); 
    } else {
      // use it as name
      $up = array('name' => $class_instance_name);
      $q = $this->update( "class_instance", $up, 'id = '.$ci_id); 
    }
    if (false === $q) return false; // failed
    
    $data = array(
      'user_id' => $uid,
      'project_id' => $pid,
      'relation_id' => $rel_id,
      'connector_id' => $cid,
      'class_instance_id' => $ci_id
      );
    $q = $this->insertInto('connector_class_instance', $data );
    
    if (false === $q) return false; // failed
    
    return $ci_id;
   }

   /*
    * return class_instance id of a connector for a given relation in a project
    */
   function getClassInstanceForConnector( $pid, $cid, $relation )
   {
    // element of id
    $rel_id = $this->getRelationId( $pid, $relation );
    if(!$rel_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$relation.'" relation for this project' ) ); return; }

    $res = $this->getResult(
    'SELECT "cci"."class_instance_id" FROM "connector_class_instance" AS "cci"
    WHERE "cci"."project_id" = '.$pid.' AND
    "cci"."relation_id" = '.$rel_id.' AND
    "cci"."connector_id" = '.$cid);
    
    return $res;
   }

  /*
   * get class_instance parent from a class_instance given its relation
   */
   function getCIFromCI( $pid, $cid, $relation )
   {
    // element of id
    $rel_id = $this->getRelationId( $pid, $relation );
    if(!$rel_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$relation.'" relation for this project' ) ); return; }

    $res = $this->getResult(
    'SELECT "cici"."class_instance_b" as "id" FROM "class_instance_class_instance" AS "cici"
    WHERE "cici"."project_id" = '.$pid.' AND
    "cici"."relation_id" = '.$rel_id.' AND
    "cici"."class_instance_a" = '.$cid);
    
    return $res;
   }

  /*
   * get class_instance parent from a class_instance given its relation
	 * with additional table information in the results.
   */
   function getCIFromCIWithClassNameAndId( $pid, $cid, $relation )
   {
    // element of id
    $rel_id = $this->getRelationId( $pid, $relation );
    if(!$rel_id) { echo makeJSON( array( '"error"' => 'Can not find "'.$relation.'" relation for this project' ) ); return; }

    $res = $this->getResult(
			'SELECT "hierarchy"."class_instance_b" as "parent_id",
			        "objects"."class_id",
							"class"."class_name"
			 FROM "class_instance_class_instance" AS "hierarchy",
			      "class_instance" AS "objects",
			      "class"
			 WHERE "hierarchy"."project_id" = '.$pid.'
			       AND "hierarchy"."relation_id" = '.$rel_id.'
						 AND "hierarchy"."class_instance_a" = '.$cid.'
					   AND "hierarchy"."class_instance_b" = "objects"."id" AND "objects"."class_id" = "class"."id"');
    
    return $res;
   }
   
   /*
    * get children of a treenode in a flat list
    */
   function getTreenodeChildren( $pid, $tnid )
   {
    $res = $this->getResult(
    'SELECT "treenode"."id" AS "tnid" FROM "treenode" WHERE 
    "treenode"."project_id" = '.$pid.' AND
    "treenode"."parent_id" = '.$tnid);
    
    return $res;
   }

  /*
   * get all downstream treenodes for a given treenode
   */
   function getAllTreenodeChildrenRecursively( $pid, $tnid )
   {
    $res = $this->getResult(
    "SELECT * FROM connectby('treenode', 'id', 'parent_id', 'parent_id', '".$tnid."', 0)
    AS t(id int, parent_id int, level int, branch int);");
    
    return $res;
   }

	function getCurrentSchemaVersion()
	{
		try {
			$this->getResult("SAVEPOINT get_schema_version");
			$res = $this->getResult("SELECT value FROM settings WHERE key = 'schema_version'");
			return $res[0]['value'];
		} catch (Exception $e) {
			$this->getResult("ROLLBACK TO SAVEPOINT get_schema_version");
			return NULL;
		}
	}

	function appliedMigrationsTableExists()
	{
		$result = $this->getResult("SELECT * FROM pg_tables WHERE tablename = 'applied_migrations'");
		if ($result === FALSE) {
			throw new Exception("Checking if the 'applied_migrations' table exists failed");
		}
		return count($result) > 0;
	}

	function getAppliedMigrationsSet()
	{
		$rows = $this->getResult("SELECT * FROM applied_migrations");
		if ($rows === FALSE) {
			throw new Exception("Fetching the already applied migrations failed");
		}
		$result = array();
		foreach ($rows as $row) {
			$result[$row['id']] = TRUE;
		}
		return $result;
	}

	function markMigrationApplied( $migrationID )
	{
		try {
			$this->getResult("SAVEPOINT mark_migration");
			$result = $this->getResult("INSERT INTO applied_migrations (id) VALUES ('$migrationID')");
			if ($result === FALSE) {
				$this->getResult("ROLLBACK TO SAVEPOINT mark_migration");
				return FALSE;
			}
		} catch (Exception $e) {
			$this->getResult("ROLLBACK TO SAVEPOINT mark_migration");
			return FALSE;
		}
		return TRUE;
	}

	/* Ensure that the database is up to date */
	function migrate()
	{
		global $migrations;

		// Within this transaction, we use savepoints to allow
		// individual queries to fail without stopping further
		// queries from working.  See:
		//     http://stackoverflow.com/q/2741919/223092
		$this->begin();

		try {
			// FIXME: should just remove this option,
			// since it's unused:
			$ignoreErrors = FALSE;

			// Fetch the schema version from the database:
			$currentSchemaVersion = $this->getCurrentSchemaVersion();

			// Sort all the available migrations, and find the latest
			// one (last in the list).
			ksort($migrations);
			end($migrations);
			$mostRecentSchemaVersion = key($migrations);
			reset($migrations);

			// Now make sure that the settings table exists:
			try {
				$this->getResult("SAVEPOINT create_settings_table");
				$this->getResult("CREATE TABLE settings (key text PRIMARY KEY, value text)");
			} catch (Exception $e) {
				$this->getResult("ROLLBACK TO SAVEPOINT create_settings_table");
				error_log("The settings table already exists");
			}

			// This is some legacy code from the previous migrations
			// system, which just tracked the most recent migration,
			// rather than every migration that had been applied.  If
			// the 'applied_migrations' table doesn't exist, that
			// means that the migration $addAppliedMigrationsMigration
			// has never been applied.  In that case, go through every
			// known migration up to and including that one - apply
			// any that are before the $currentSchemaVersion.  Then
			// insert all of those migations into the
			// applied_migrations table.

			$lastMigrationJustApplied = NULL;

			$addAppliedMigrationsMigration = "2011-10-20T15:14:59";

			if (!$this->appliedMigrationsTableExists()) {

				$toMarkAsApplied = array();

				foreach ($migrations as $migrationID => $migration) {

					$pretty = $migrationID." (".$migration->name.")";

					if ($migrationID === $addAppliedMigrationsMigration) {
						// Then this is the last one to apply, and we
						// must apply it in order to create the
						// 'applied_migrations' table, even if the
						// currentSchemaVersion is more recent.
						error_log("Applying the special migration '".$pretty.'"');
						$migration->apply($this, $ignoreErrors);
						$toMarkAsApplied[] = $migrationID;
						$lastMigrationJustApplied = $migrationID;
						break;
					}

					if ($currentSchemaVersion &&
					    $currentSchemaVersion >= $migrationID) {
						error_log("Skipping migration '".$pretty.'"');
						$toMarkAsApplied[] = $migrationID;
					} else {
						// Otherwise try to apply it:
						error_log("Applying the migration '".$pretty.'"');
						$migration->apply($this, $ignoreErrors);
						$toMarkAsApplied[] = $migrationID;
						$lastMigrationJustApplied = $migrationID;
					}
				}

				// Now mark all the applied migrations
				// as applied in the database.  We
				// have to do this at the end or the
				// applied_migrations table won't have
				// been created yet.
				foreach( $toMarkAsApplied as $migrationID ) {
					$this->markMigrationApplied($migrationID);
				}
			}

			// Now we can start with the intended migration behaviour.
			// Go through every migration in $migrations, and apply
			// any that are not in the 'applied_migrations' table.

			$appliedMigrations = $this->getAppliedMigrationsSet();

			foreach ($migrations as $migrationID => $migration) {
				if (!array_key_exists($migrationID, $appliedMigrations)) {
					$migration->apply($this, $ignoreErrors);
					$this->markMigrationApplied($migrationID);
					$lastMigrationJustApplied = $migrationID;
				}
			}

			// Usually, we would update to the last
			// migration just applied, but after a merge,
			// we may end up only applying migrations with
			// IDs earlier than the current schema version
			// in the database, in which case just use
			// that value.  (In fact this entry in the
			// database is of no use once we have the
			// applied_migrations table, but we should
			// nonetheless attempt to make sure that its
			// value is correct.)
			$newSchemaVersion = max($lastMigrationJustApplied, $currentSchemaVersion);

			error_log("Updating the schema version to ".$newSchemaVersion);

			try {
				$this->getResult("SAVEPOINT updating_schema");
				$this->getResult("INSERT INTO settings (key, value) VALUES ('schema_version', '".pg_escape_string($newSchemaVersion)."')");
			} catch (Exception $e) {
				$this->getResult("ROLLBACK TO SAVEPOINT updating_schema");
				error_log("There is already a schema_version entry in settings");
			}

			$this->getResult("UPDATE settings SET value = '".pg_escape_string($newSchemaVersion)."' WHERE key = 'schema_version'");

			$this->commit();

		} catch (Exception $e) {
			error_log("Migrating the database failed: ".$e);
			$this->rollback();
			echo json_encode( array ( 'error' => 'Migrating the database failed.  See http://bit.ly/nGVIB6 for help.' ) );
			exit();
		}

	}

}

?>
