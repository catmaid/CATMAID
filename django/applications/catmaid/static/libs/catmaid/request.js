/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

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
 * Implements a cross browser HTTPrequest-FIFO-queue.
 */
RequestQueue = function()
{
  var self = this;
  var queue = [];		//!< queue of waiting requests
  var xmlHttp;
  var spinner = null;

  if ( typeof XMLHttpRequest != 'undefined' )
  {
    xmlHttp = new XMLHttpRequest();
  }
  else
  {
    try { xmlHttp = new ActiveXObject( "Msxml2.XMLHTTP" ); }
    catch( error )
    {
      try { xmlHttp = new ActiveXObject( "Microsoft.XMLHTTP" ); }
      catch( error2 ){ xmlHttp = null; }
    }
  }

  var encodeArray = function( a, p )
  {
    var q = "";
    for ( var i = 0; i < a.length; ++i )
    {
      var r = p + "[" + i + "]";
      
      switch ( typeof a[ i ] )
      {
      case "undefined":
        break;
      case "function":
      case "object":
        if ( a[ i ].constructor == Array && a[ i ].length > 0 )
          q += encodeArray( a[ i ], r ) + "&";
        else
          q += encodeObject( a[ i ], r ) + "&";
        break;
      default:
        q += r + "=" + encodeURIComponent( a[ i ] ) + "&";
        break;
      }
    }
    q = q.replace( /\&$/, "" );
    
    return q;
  };

  var encodeObject = function( o, p )
  {
    var q = "";
    for ( var k in o )
    {
      var r;
      if ( p )
        r = p + "[" + k + "]";
      else
        r = k;
      
      switch ( typeof o[ k ] )
      {
      case "undefined":
        break;
      case "function":
      case "object":
        if ( o[ k ].constructor == Array && o[ k ].length > 0 )
          q += encodeArray( o[ k ], r ) + "&";
        else
          q += encodeObject( o[ k ], r ) + "&";
        break;
      default:
        q += r + "=" + encodeURIComponent( o[ k ] ) + "&";
        break;
      }
    }
    q = q.replace( /\&$/, "" );
    
    return q;
  };

  var showSpinner = function()
  {
    if ( !spinner )
      spinner = document.getElementById( "spinner" );
    if ( spinner )
      spinner.style.display = "block";
  };

  var hideSpinner = function()
  {
    if ( !spinner )
      spinner = document.getElementById( "spinner" );
    if ( spinner )
      spinner.style.display = "none";
  };

  var send = function()
  {
    showSpinner();
    xmlHttp.open(
      queue[ 0 ].method,
      queue[ 0 ].request,
      true );
    xmlHttp.setRequestHeader( "X-Requested-With", "XMLHttpRequest");
    if ( queue[ 0 ].method == "POST" )
    {
      xmlHttp.setRequestHeader( "Content-type", "application/x-www-form-urlencoded" );
      // xmlHttp.setRequestHeader( "Content-length", queue[ 0 ].data.length );
      // xmlHttp.setRequestHeader( "Connection", "close" );
    }
    xmlHttp.setRequestHeader( "X-Requested-With", "XMLHttpRequest" );
    xmlHttp.onreadystatechange = callback;
    xmlHttp.send( queue[ 0 ].data );
    
    return;
  };

  var callback = function()
  {
    if ( xmlHttp.readyState == 4 )
    {
      hideSpinner();
      queue[ 0 ].callback( xmlHttp.status, xmlHttp.responseText, xmlHttp.responseXML );
      queue.shift();
      if ( queue.length > 0 )
        send();
    }
    return;
  };

  return {
    /**
     * Returns if there is some request pending or not.
     */
    busy : function(){ return ( queue.length > 0 ); },
    
    /**
     * Registers a request including a callback to the queue for waiting or
     * starts it imediately.
     */
    register : function(
        r,		//!< string  request
        m,		//!< string  method		"GET" or "POST"
        d,		//!< object  data		object with key=>value
        c,		//!< function callback
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
            data : encodeObject( d ),
            callback : c,
            id : id
          }
        );
        break;
      default:
  var request = "";
  var encoded = encodeObject( d );
  if (encoded !== "") {
    request = "?" + encoded;
  }
        queue.push(
          {
            request : r + request,
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
    },

    /**
     * Registers a request including a callback to the queue for waiting or
     * starts it imediately.  In case the requests id exists in the queue
     * already, the existing instance will be removed assuming that it is
     * outdated.
     */
    replace : function(
        r,		//!< string  request
        m,		//!< string  method		"GET" or "POST"
        d,		//!< object  data		object with key=>value
        c,		//!< funtion callback
        id		//!< string  id
    )
    {
      var removedRequest;
      for ( var i = 1; i < queue.length; ++i )
      {
        if ( queue[ i ].id == id )
        {
          removedRequest = queue.splice( i, 1 );
          CATMAID.statusBar.replaceLast( "replacing request ", + r );
          // Send a distinguishable error reponse with the callback:
          removedRequest[0].callback(200, JSON.stringify({'error': 'REPLACED'}), null);
        }
      }
      this.register( r, m, d, c, id );
      return;
    }
  };
};
