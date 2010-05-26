<?php

/**
 * json.inc.php
 *
 * @author Stephan Saalfeld <saalfeld@phenomene.de>
 * @copyright Copyright (c) 2007, Stephan Saalfeld
 * @version 0.1 TrakEM2
 *
 */
/**
 */

/**
 * create a JSON string from an assoziative array
 *
 * @uses makeJSON() recursively
 *
 * @return string
 */
function makeJSON( $data )
{
	if ( is_null( $data ) )
		return 'null';
	if ( is_bool( $data ) )
		return $data ? 1 : 0;
	if ( is_numeric( $data ) )
		return $data;
	elseif ( is_string( $data ) )
	{
		$date = addslashes( $data );
		$data = str_replace( "\n", '\n', $data );
		$data = str_replace( "\r", '\r', $data );
		$data = str_replace( "\t", '\t', $data );
		$data = str_replace( '"', '\"', $data );
		return '"'.$data.'"';
	}
	elseif ( is_array( $data ) )
	{
		$str = '{ ';
		reset( $data );
		while ( list( $key, $val ) = each( $data ) )
		{
			$str .= $key.' : '.makeJSON( $val ).', ';
		}
		if ( sizeof( $data ) > 0 )
			return substr( $str, 0, -2 ).' }';
		else
			return substr( $str, 0, -1 ).'}';
	}
	else return '';
}
