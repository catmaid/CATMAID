/**
 * ui.js
 *
 * requirements:
 *   tools.js
 *
 */

(function(CATMAID) {

    "use strict";

    /**
     * container for generic user interface actions
     */
    CATMAID.UI = function()
    {
        var self = this;

        var screenWidth = 0;
        var screenHeight = 0;

        var leftMouseDown = false;
        var rightMouseDown = false;
        var shiftKeyDown = false;
        var ctrlKeyDown = false;
        var altKeyDown = false;
        var lastX = 0;
        var lastY = 0;
        var x = 0;
        var y = 0;

        var events = {};
        events[ "onmousemove" ] = [];	//!< bound to eventCatcher
        events[ "onmousedown" ] = [];
        events[ "onmouseup" ] = [];	//!< bound to eventCatcher
        events[ "onwheel" ] = [];
        events[ "onresize" ] = [];		//!< bound to the window itself

        var eventCatcher = document.createElement( "div" );
        eventCatcher.id = "eventCatcher";
        document.body.appendChild( eventCatcher );

        /* The focus catcher is used as a focus target when the active element should
         * be un-focused. It is required to have a 'href' attribute. Otherwise, a
         * focus() call will not succeed. */
        var focusCatcher = document.createElement( "a" );
        focusCatcher.id = "focusCatcher";
        focusCatcher.href = "#";
        document.body.appendChild( focusCatcher );

        var updateFrameHeight = function()
        {
            if ( window.innerHeight ) screenHeight = window.innerHeight;
            else
            {
                if ( document.documentElement && document.documentElement.clientHeight )
                    screenHeight = document.documentElement.clientHeight;
                else if ( document.body && document.body.clientHeight )
                    screenHeight = document.body.clientHeight;
            }
            return;
        };

        var updateFrameWidth = function()
        {
            if ( window.innerWidth ) screenWidth = window.innerWidth;
            else
            {
                if ( document.documentElement && document.documentElement.clientWidth )
                    screenWidth = document.documentElement.clientWidth;
                else if ( document.body && document.body.clientWidth )
                    screenWidth = document.body.clientWidth;
            }
            return;
        };

        /**
         * set the cursor style
         */
        this.setCursor = function(
                c		//!< string cursor
        )
        {
            eventCatcher.style.cursor = c;
            return;
        };

        /**
         * add a function to an event's queue
         */
        this.registerEvent = function(
                e,		//!< event
                h		//!< handler function
        )
        {
            events[ e ].push( h );
            return;
        };

        /**
         * remove a function from an event's queue
         */
        this.removeEvent = function(
                e,		//!< event
                h		//!< handler function
        )
        {
            for ( var i = 0; i < events[ e ].length; ++i )
            {
                if ( events[ e ][ i ] == h )
                {
                    events[ e ].splice( i, 1 );
                    break;
                }
            }
            return;
        };
        /**
         * clear an event's queue
         */
        this.clearEvent = function(
                e		//!< event
        )
        {
            delete events[ e ];
            events[ e ] = [];
        };

        this.getFrameWidth = function()
        {
            return screenWidth;
        };

        this.getFrameHeight = function()
        {
            return screenHeight;
        };

        this.onresize = function( e )
        {
            try // IE fails if window height <= 0
            {
                updateFrameHeight();
                updateFrameWidth();
            }
            catch ( exception ) {}

            var r = true;

            for ( var i = 0; i < events[ "onresize" ].length; ++i )
                r = r && events[ "onresize" ][ i ]( e );

            return r;
        };

        /**
         * get the mouse button normalized to gecko enumeration
         * 1 - left
         * 2 - middle
         * 3 - right
         */
        this.getMouseButton = function( e )
        {
            var which;
            if ( e && e.which )
            {
                which = e.which;
            }
            else if ( !( typeof event === "undefined" || event === null || event.button ) )
            {
                which = event.button;
                if ( which == 2 ) which = 3;	//!< right
                if ( which == 4 ) which = 2;	//!< middle
            }

            return which;
        };

        /**
         * get the direction of the mousewheel
         *  1 - up
         * -1 - down
         */
        this.getMouseWheel = function( e )
        {
            if ( e )
                return ((e.deltaX + e.deltaY) > 0 ? 1 : -1);
            else
                return undefined;
        };

        /**
         * get the mouse location absolute and relative to the element, which fired the event
         */
        this.getMouse = function( e, relativeTo, propagate )
        {
            var realPagePosition = CATMAID.UI.getRealPagePosition(e);
            var offset;
            var target;
            propagate = (typeof propagate == "undefined") ? false : propagate;
            var m = {};
            m.x = realPagePosition.x;
            m.y = realPagePosition.y;
            if (relativeTo) {
                offset = $(relativeTo).offset();
                m.offsetX = m.x - offset.left;
                m.offsetY = m.y - offset.top;
            }
            if ( e )
            {
                if (!propagate) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
            else if ( event )
            {
                if (!propagate) {
                    event.cancelBubble = true;
                }
            }
            else {
                m = undefined;
            }
            m.target = CATMAID.UI.getTargetElement(e || event);
            return m;
        };

        /**
         * get the key code
         */
        this.getKey = function( e )
        {
            var key;
            if ( e )
            {
                if ( e.keyCode ) key = e.keyCode;
                else if ( e.charCode ) key = e.charCode;
                else key = e.which;
            }
            else if ( event && event.keyCode )
                key = event.keyCode;
            else key = false;
            return key;
        };

        this.onmousemove = function( e )
        {
            var m = self.getMouse( e );
            if ( m )
            {
                self.diffX = m.x - lastX;
                self.diffY = m.y - lastY;
                lastX = m.x;
                lastY = m.y;

                var r = true;
                for ( var i = 0; r && i < events[ "onmousemove" ].length; ++i )
                    r = events[ "onmousemove" ][ i ]( e );

                return r;
            }
            else return false;
        };

        this.onmousedown = function( e )
        {
            var m = self.getMouse( e );
            if ( m )
            {
                lastX = m.x;
                lastY = m.y;
                self.diffX = 0;
                self.diffY = 0;

                var which = self.getMouseButton( e );

                if ( which )
                {
                    switch ( which )
                    {
                    case 1:
                        leftMouseDown = true;
                        break;
                    case 3:
                        rightMouseDown = true;
                        break;
                    }
                }

                var r = true;
                for ( var i = 0; i < events[ "onmousedown" ].length; ++i )
                    r = r && events[ "onmousedown" ][ i ]( e );

                return r;
            }
            else return;
        };

        this.onmouseup = function( e )
        {
            var m = self.getMouse( e );
            if ( m )
            {
                lastX = m.x;
                lastY = m.y;
                self.diffX = 0;
                self.diffY = 0;

                var which = self.getMouseButton( e );

                if ( which )
                {
                    switch ( which )
                    {
                    case 1:
                        leftMouseDown = false;
                        break;
                    case 3:
                        rightMouseDown = false;
                        break;
                    }
                }

                var r = true;
                for ( var i = 0; i < events[ "onmouseup" ].length; ++i )
                    r = r && events[ "onmouseup" ][ i ]( e );
                return r;
            }
            else return;
        };

        /**
         * catch mouse and keyboard events
         *
         * @todo recognise mouse button, catch keyboard events
         */
        this.catchEvents = function(
                c			//!< optional cursor style
        )
        {
            if ( c ) eventCatcher.style.cursor = c;
            eventCatcher.style.display = "block";
            return;
        };

        /**
         * release mouse and keyboard events
         */
        this.releaseEvents = function()
        {
            eventCatcher.style.cursor = "auto";
            eventCatcher.style.display = "none";
            return;
        };

        /**
         * catch focus which might be at a form element or an arbitrary anchor
         */
        this.catchFocus = function()
        {
            focusCatcher.focus();
        };

        window.onresize = this.onresize;
        window.onresize();

        eventCatcher.onmousedown = self.onmousedown;
        eventCatcher.onmouseout = eventCatcher.onmouseup = self.onmouseup;
        eventCatcher.onmousemove = self.onmousemove;
    };

    CATMAID.UI.getFrameHeight = function()
    {
        try
        {
            if (window.innerHeight)
                return window.innerHeight;
            else {
                if (document.documentElement && document.documentElement.clientHeight)
                    return document.documentElement.clientHeight;
                else
                    if (document.body && document.body.clientHeight)
                        return document.body.clientHeight;
            }
            return 0;
        }
        catch ( exception ) { return 0; }
    };

    CATMAID.UI.getFrameWidth = function()
    {
        try
        {
            if (window.innerWidth)
                return window.innerWidth;
            else {
                if (document.documentElement && document.documentElement.clientWidth)
                    return document.documentElement.clientWidth;
                else
                    if (document.body && document.body.clientWidth)
                        return document.body.clientWidth;
            }
            return 0;
        }
        catch ( exception ) { return 0; }
    };

    CATMAID.UI.getRealPagePosition = function (e) {
        // This function is taken from:
        //    http://www.quirksmode.org/js/events_properties.html#position
        var posx = 0;
        var posy = 0;
        if (!e)
            var e = window.event;
        if (e.pageX || e.pageY) {
            posx = e.pageX;
            posy = e.pageY;
        } else if (e.clientX || e.clientY) {
            posx = e.clientX + document.body.scrollLeft
                + document.documentElement.scrollLeft;
            posy = e.clientY + document.body.scrollTop
                + document.documentElement.scrollTop;
        }
        // posx and posy contain the mouse position relative to the document
        return {'x': posx, 'y': posy};
    };

    CATMAID.UI.getTargetElement = function (e) {
        var target;
        // This logic is from:
        // http://www.quirksmode.org/js/events_properties.html#target
        if (e.target)
            target = e.target;
        else if (e.srcElement)
            target = e.srcElement;
        if (target.nodeType == 3) // defeat Safari bug
            target = target.parentNode;
        return target;
    };

    /**
     * Global mouse position tracker.
     * @return {{x: number, y: number}} Mouse coordinates of the last bubbled event.
     */
    CATMAID.UI.getLastMouse = function () {
        var x = 0, y = 0;

        $(document).mousemove(function (e) {
            e = e || window.event;
            x = e.pageX || e.clientX;
            y = e.pageY || e.clientY;
        });

        return function () {
            // Return a copy to prevent mutation.
            return {x: x, y: y};
        };
    }();
})(CATMAID);
