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
	var $handle;

	/**
	 * Constructor
	 */  
	function DB( $mode = 'read' )
	{
		global $db_host, $db_user, $db_pw, $db_db;
		$this->host = $db_host[ $mode ];
		$this->user = $db_user[ $mode ];
		$this->pw = $db_pw[ $mode ];
		$this->db = $db_db[ $mode ];
		
		$this->handle = pg_connect( 'host='.$this->host.' port=5432 dbname='.$this->db.' user='.$this->user.' password= '.$this->pw ) or die( pg_last_error() );
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
		$result = array();
		if ( $temp = pg_query( $this->handle, $query ) )
		{
			while ( $result[] = @pg_fetch_assoc( $temp ) ) {}
			array_pop( $result );
		}
		else
			$result = false;
		return $result;
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
		pg_query( $this->handle, $queryStr );
		return;
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
		return $id[ 0 ][ 'id' ];
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
		$r = pg_query( $this->handle, $query );
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
		$r = pg_query( $this->handle, 'DELETE FROM "'.$table.'" WHERE '.$cond );
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
}

?>
