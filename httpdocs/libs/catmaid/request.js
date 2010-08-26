/**
 * request.js
 *
 * requirements:
 *	 tools.js
 *
 */

/**
 */

/**
 * implements a cross browser HTTPrequest-FIFO-queue
 */
RequestQueue = function()
{
	var encode = function( o, p )
	{
		var q = "";
		for ( var k in o )
		{
			var r = k;
			if ( p )
				r = p + "[" + k + "]";
			switch ( typeof o[ k ] )
			{
			case "undefined":
				break;
			case "function":
			case "object":
				q += encode( o[ k ], r );
				break;
			default:
				q += r + "=" + encodeURIComponent( o[ k ] ) + "&";
				break;
			}
		}
		if ( !p ) q = q.replace( /\&$/, "" );
		
		return q;
	}
	
	/**
	 * returns if there is some request pending or not
	 */
	this.busy = function()
	{
		return ( queue.length > 0 );
	}
	
	var send = function()
	{
		xmlHttp.open(
			queue[ 0 ].method,
			queue[ 0 ].request,
			true );
		if ( queue[ 0 ].method == "POST" )
		{
			xmlHttp.setRequestHeader( "Content-type", "application/x-www-form-urlencoded" );
			xmlHttp.setRequestHeader( "Content-length", queue[ 0 ].data.length );
			xmlHttp.setRequestHeader( "Connection", "close" );
		}
		xmlHttp.onreadystatechange = callback;
		xmlHttp.send( queue[ 0 ].data );
		return;
	}
	
	var callback = function()
	{
		if ( xmlHttp.readyState == 4 )
		{
			queue[ 0 ].callback( xmlHttp.status, xmlHttp.responseText, xmlHttp.responseXML );
			queue.shift();
			if ( queue.length > 0 )
				send();
		}
		return;
	}
	
	
	/**
	 * registers a request including a callback function to the queue for waiting or starts it imediately
	 */
	this.register = function(
			r,		//!< string  request
			m,		//!< string  method		"GET" or "POST"
			d,		//!< object  data		object with key=>value
			c,		//!< funtion callback
			id		//!< string  id
	)
	{
		switch( m )
		{
		case "POST":
			queue.push(
				{
					request : r,
					method : m,
					data : encode( d ),
					callback : c,
					id : id
				}
			);
			break;
		default:
			queue.push(
				{
					request : r + "?" + encode( d ),
					method : m,
					data : null,
					callback : c,
					id : id
				}
			);
		}
		if ( queue.length == 1 )
		{
			send();
		}
		return;
	}

	/**
	 * registers a request including a callback function to the queue for waiting or starts it imediately
	 * if the requests id already exists in the queue, the existing instance will be removed assuming that it is outdated
	 */
	this.replace = function(
			r,		//!< string  request
			m,		//!< string  method		"GET" or "POST"
			d,		//!< object  data		object with key=>value
			c,		//!< funtion callback
			id		//!< string  id
	)
	{
		for ( var i = 1; i < queue.length; ++i )
		{
			if ( queue[ i ].id == id )
			{
				queue.splice( i, 1 );
				console.replaceLast( "replacing request ", + r );				
			}
		}
		this.register( r, m, d, c, id );
		console.replaceLast( "queue.length = " + queue.length );
		return;
	}

	
	// initialize
	var self = this;
	var queue = new Array();		//!< queue of waiting requests
	var xmlHttp;
	if ( typeof XMLHttpRequest != 'undefined' )
	{
		xmlHttp = new XMLHttpRequest();
	}
	else
	{
		try
		{
			xmlHttp = new ActiveXObject( "Msxml2.XMLHTTP" );
		}
		catch(e)
		{
			try
			{
				xmlHttp = new ActiveXObject( "Microsoft.XMLHTTP" );
			}
			catch(e)
			{
				xmlHttp = null;
			}
		}
	}
}
