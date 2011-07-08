/**
 * transition object for general animations
 */
function Transition()
{
	/**
	 * returns if there is some transition running or not
	 */
	this.busy = function()
	{
		return ( this.timeout !== false );
	}
	
	/**
	 * returns true, if the requested function is still queued
	 */
	this.queued = function( f )
	{
		q = false;
		for ( var i = 0; i < queue.length; ++i )
		{
			if ( queue[ i ] == f )
			{
				statusBar.replaceLast( "already queued in slot " + i + " of " + queue.length + "." );
				q = true;
				break;
			}
		}
		return q;
	}
	
	/**
	 * forces the transition to finish by setting step = 1
	 */
	this.finish = function()
	{
		step = 1.0;
		return;
	}
	
	/**
	 * registers a function to the queue for waiting or starts it immediately
	 * each function gets the current step as parameter and has to return the next step value
	 */
	this.register = function( t )
	{
		queue.push( t );
		if ( !timeout )
			t();
			timeout = window.setTimeout( run, 25 );
		return;
	}
	
	/**
	 * runs the first element of the queue
	 */
	var run = function()
	{
		if ( timeout ) window.clearTimeout( timeout );
		if ( queue.length > 0 )
			step = queue[ 0 ]( step );
		if ( step > 1 )
		{
			step = 0;
			if ( queue.length > 0 )
				queue.shift();
			//statusBar.replaceLast( "running step " + step + " queue.length " + queue.length );
		}
		if ( queue.length > 0 )
			timeout = window.setTimeout( run, 25 );
		else
			timeout = false;
		return;
	}
	
	// initialize
	var self = this;
	var step = 0;					//!< the transitions state [0.0, ..., 1.0]
	var queue = new Array();		//!< queue of waiting transitions
	var FINISH = false;				//!< set this to force the transition to make an end
	var timeout = false;			//!< window.timeout
}
