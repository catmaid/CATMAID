<?php

/**
 * session.class.php
 *
 * @author Stephan Saalfeld <saalfeld@phenomene.de>
 * @copyright Copyright (c) 2006, Stephan Saalfeld
 * @version 0.1 TrakEM2
 *
 */
/**
 */
include_once( 'db.pg.class.php' );

/* These functions for recording sessions in the database rather than
   the filesystem are are based on this article:
   http://tuxradar.com/practicalphp/10/3/7
*/

function sess_open($sess_path, $sess_name) {
    return true;
}

function sess_close() {
    return true;
}

function sess_read($sess_id) {
    $db =& getDB();
    $escaped_session_id = pg_escape_string($sess_id);
    $result = $db->getResult("SELECT data FROM sessions WHERE session_id = '$escaped_session_id'");
    $current_time = date('Y-m-d H:i:s');
    if($result) {
        $db->getResult("UPDATE sessions SET last_accessed = TIMESTAMP '$current_time' WHERE session_id = '$escaped_session_id'");
        return $result[0]['data'];
    } else {
        $db->getResult("INSERT INTO sessions (session_id, last_accessed) VALUES ('$escaped_session_id', TIMESTAMP '$current_time')");
        return '';
    }
}

function sess_write($sess_id, $data) {
    $db =& getDB();
    $escaped_session_id = pg_escape_string($sess_id);
    $escaped_data = pg_escape_string($data);
    $current_time = date('Y-m-d H:i:s');
    error_log('going to run UPDATE');
    $db->getResult("UPDATE sessions SET data = '$escaped_data', last_accessed = TIMESTAMP '$current_time' WHERE session_id = '$escaped_session_id'");
    error_log('after running UPDATE');
    return true;
}

function sess_destroy($sess_id) {
    $db =& getDB();
    $escaped_session_id = pg_escape_string($sess_id);
    $db->getResult("DELETE FROM sessions WHERE session_id = '$escaped_session_id'");
    return true;
}

function sess_gc($sess_maxlifetime) {
    $db =& getDB();
    $current_time = date('Y-m-d H:i:s');
    $db->getResult("DELETE FROM sessions WHERE (last_accessed + INTERVAL '$sess_maxlifetime seconds') < TIMESTAMP '$current_time'");
    return true;
}

session_set_save_handler("sess_open",
                         "sess_close",
                         "sess_read",
                         "sess_write",
                         "sess_destroy",
                         "sess_gc");

/**
 * factory method to get the single instance of the object
 *
 * @return Session singleton instance
 */
function &getSession()
{
	static $session;
	if ( !isset( $session ) )
	{
		$session = new Session();
	}
	return $session;
}

/**
 * Session
 *
 * provides Methods to instanciate a session and check permissions
 *
 * @package pRED
 */
class Session
{
	/**
	 * @var DB $db
	 *
	 * @access private
	 */
	var $db;

	/**
	 * @var string $session_key
	 *
	 * @access private
	 */
	var $session_key = '7gtmcy8g03457xg3hmuxdgregtyu45ty57ycturemuzm934etmvo56';

	/**
	 * @access private
	 */
	function Session() 
	{
		session_start();
		$this->db =& getDB();
	}
	
	/**
	 * create a session
	 *
	 * @param int $name user account (DB: "user"."name")
	 */
	function create( $id )
	{
		$_SESSION[ 'id' ] = $id;
		$_SESSION[ 'key' ] = $this->session_key;
		return;
	}
	
	/**
     * checks db if a user supplied correct password and if the user account is valid
	 *
	 * @param string $_user user account (DB: "user"."name")
	 * @param string $_pwd user password (DB: "user"."pwd")
	 *
	 * @return false|id
     */
	function isUserValid( $name, $pwd )
	{
		if ( $pwd == '' ) return FALSE;
		$v = $this->db->getResult(
			'SELECT	*
			
				FROM	"user"
				
				WHERE	"name" = \''.pg_escape_string( $name ).'\' AND
						"pwd" = MD5( \''.pg_escape_string( $pwd ).'\' )' );
		if ( $v && isset( $v[ 0 ] ) && isset( $v[ 0 ][ 'id' ] ) ) return $v[ 0 ][ 'id' ];
		else return false;
	}

	/**
	 * deletes current Session
	 *
	 * @return boolean true
	 */
	function deleteSession()
	{
		if ( isset( $_COOKIE[ session_name() ] ) )
		{
    		setcookie( session_name(), '', time() - 42000, '/' );
		}
		@session_destroy();
		return true;
	}

	/**
	 * open a session request, check permission
	 * if not permitted, wait for 2sec return an error and exit
	 *
	 * @return boolean true
	 */
	function open()
	{
		if ( $this->isSessionValid() )
			return true;
		else
		{
			sleep( 2 );
			$this->deleteSession();
			echo 'Invalid session.';
    		exit;
		}
	}

	/**
	 * get the id of the user holding the current session
	 *
	 * @return int $_SESSION[ 'id' ] that corresponds to (DB: "user"."id")
	 */
	function getId()
	{
		return $_SESSION[ 'id' ];
	}
	
	/**
	 * get the user data of the user who owns the current session
	 *
	 * @return array|false
	 */
	function getData()
	{
		$d = false;
		if ( $_SESSION[ 'id' ] )
			$d = $this->db->getResult(
				'SELECT	"id",
						"name",
						"longname"
				
					FROM	"user"
					
					WHERE	"id" = '.$_SESSION[ 'id' ] );
		if ( $d && isset( $d[ 0 ] ) ) return $d[ 0 ];
		else return false;
	}
	

	/**
	 * checks if the current session is still valid
	 *
	 * @return boolean
	 *
	 * @access private
	 */
	function isSessionValid()
	{
		return isset( $_SESSION[ 'id' ] ) && isset( $_SESSION[ 'key' ] ) && $_SESSION[ 'key' ] == $this->session_key;
	}
}

?>
