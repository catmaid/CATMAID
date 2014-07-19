/***

SVGPlot.js 0.1

See <http://svgkit.sourceforge.net/> for documentation, downloads, license, etc.

(c) 2006 Jason Gallicchio.
Licensed under the open source (GNU compatible) MIT License

   
   Everything is object-oriented, but objects get created for you rather than 
   having to call constructors and link them in.  Complimentary like SVG DOM vs Canvas.
   You can always access the objects through the scene-tree.

   This is all represented in the XML structure of the SVG with custom namespace to 
   completly reconstruct these objects uppon load like Inkscape.  Would like to have:
    * API & script commands common across languages: JS, Java, Python, C++
    * Data format just Plain XML (plot data), Plain SVG, or Combined
    * Write quickly with small script, but have ability to modify tree later by graphical manipulation. 
         (Does origional script get stored and added to?)
   Select plot or layer by color (or some other characteristic) rather than reference.
   
   Another concept.  Rather than heirarchial, since single plots are the common case, maybe
   there should just be links to things like Axes rather than beging continaed.
   In a long array of plots, they could all be linked to the same axis rather than be
   contained in it.  This way when the axis changes, the plots do too.
   
   When you call something, it sets up reasonable defaults for everything else.

   autoColorIncrement = true // cycle through predefined nice default colors

   be able to pass in error bars or stock scales with any plot
   ledgend and/or labeling of plots is automatic, alpha blended, unobtrusive, and auto-positioned.
   
   Programming interface concept:  Too many objects and layers, so expose each one's functionality
   to its children and its parents.  When you call a high-layer method on a child, it works.
   When you call a child method on a parent, it picks either the "" one or the default (first) one.
   
   The key to adoption is good defaults.
   The key to staying is extensible options.
   Have good practices (like Tufte) inspire the defaults.
   Web page:
     -- Galery both in PNG and in JS.  JS has "Do It" button
     -- Tutorial with inline JS.  Find interesting data sources to plot.  Census, etc.
     -- Document code, document defaults.  Document which level in the heirarchy is affected with Color Overlays
   
   Box Layout information:  Since you've already got an array of a certain size, it makes sense to store the layout information
   in the children, but in some sense it doesn't belong there because you should be able to move children around freely.
   In this scheme you'd have to change the layout information explicitly.
   
   Typical GUI thinking:
    -- Overall graph layout
    -- Views and their scales
    -- Axes, labels, ticks
    -- Data
    -- Data style

  Change types (rather than redrawing whole graph):
   -- Layout Change (includes adding new axes/labels/etc)
   -- Scale Change
   -- Data Change
   -- Style Change
    
   How to handle click on graphs:
     -- Want to do a trace where (x,y) or (r,th) components show up as float.
     -- Want to drag to manipulate data points (undo?) Need explicit SVG G's rather than Markers?
     -- Want to drag to move graph around.
     -- Drag on axes to zoom
          * always from origin?  For date plots this is dumb.
          * how to zoom uniformly to keep axis ratios fixed?   Locked checkbox?
          * Zoom in around where you first clicked (keeping that point fixed)
            by an amount determined by how much you drag.
    
  Drawing Function can take all of the row and do whatever it wants.
    it draws a shape around the origin given the parameters, 
    which gets translated to the right spot based on the x,y coords.
  Predefined Drawing Functions include:
    -- Change shape based on category
    -- Change color based on category
    -- Error bars dx, dy, dx&dy
    -- Error elipse dx, dy, theta
  Drawing functions can either by Canvas-like, ending in a stroke() and/or fill() or
    SVG-like returning a node which the drawing function can add events like mouseover to.
  Use this feature to re-impliment the star viewer with displayed coordinates and 
    mouseover star names.
    
  TODO
    -- Make all list parameters both comma or space seperated like in SVG.
    -- Grid lines function like ticks.  Just Extended ticks?  what about checkerboard/stripes?
    -- Tests with multiple boxes and box layout.
    -- Integer-only axis labels/ticks (a parameter of the auto-axis)
    -- Auto scale has options like "always include zero"
    -- Be able to draw using lineTo and things using plot coordinates, not screen coordinates. 
    -- You want to draw over a graph.  This means mapping into plot coordinates without distorting your
        line widths and shapes in some crazy way.  You obviously map (x,y) to (i,j) but do you map 
        widths, heights, and radii?  Not if you want to draw a normal looking arrow, but yes if you
        want to draw a circle or an arc that is in a specific place on the graph. Things like arrow-heads are
        problematic -- you want the start and end to be in (x,y) but the size of the arrow head to be the same always.
    -- When you change scales, you want decorations you've drawn to move too.  Decorations can be tied to point on plot.
    -- CSS Colors and Fonts
    -- For tickLabels at the edge, either move them to fit on plot or make plot bigger to accomodate them.
    -- Check scale for zeros better.  Don't print a zero right over the other axis.
    -- Box background and plot area background.
    -- Axes, ticks, and grids align themselves to nearest pixel.
    -- Smooth connect plot lines using bezier and "stroke-linejoin:round"
    -- Autoscale so that at least the line-width fits.
    -- Plot title
    -- Plot Ledgend, recording attributes of lines and glyphs
    -- Plot arrows pointing to the different types (better than a ledgend where appropriate -- pre-computer plots use this and are more clear)
    -- Exponents 2e12 or 2 10^12 or just 10^12 on log plots, etc.
    -- Pie, optional pullout of wedges, optional 2nd parameter setting slice area "Spie  Chart"
    -- Excel has tick positions 'inside' 'outside' and 'cross'.  This makes more sense when 
          axes are on the sides, but not when it's in the middle.  We should have a 'cross' though.
    -- Option like Excel to drop grid lines from plot to axis (a partial grid)
    -- Auto ticks works differently for numberical versus category data, at least for bar graphs
         For categories, often you want ticks/grid in between bars and labels on bars. Same with dates, but not times.
    -- How much to mix state-machine vs explicit options.  When you draw a box, do you take the
         current style and transform from the current state, or as a parameter?  Some things only require
         one or two style parameters and it's nicer just to set them.  
         Some like boxBG and plotAreaBG require lots and state is bad.
         Also, setting the fillStyle instead of the strokeStyle for text is confusing, but Canvas and SVG standard
    -- How to handle polar plots?  Keep (x,y) scale, but just add a polar grid/tickLabels/ticks/etc or
         completely change to a polar scale where (x,y) now mean (r,phi)
    -- Some general mapping from (p,q) into (x,y) which gets mapped to (i,j)?  Might want both (x,y) ticks and (p,q) ticks
    -- TickLabels appearing over axes or other elements should be somehow avoided -- constrained layout is hard, though.
    -- Right now if you want to set something, you have to either:
        * Plot a function and get the default stuff
        * Explicitly add a box and it's defaults or whatever you want, then set it
        * Explicitly add everything starting with the box, which is unintuitive.  Should be able to 
               just addAxis or addXTickLabels and have it use those when I plot, even if it has to add an axis or box.
    -- Plot with both a line and a point component.  options:
        * Have to plot twice to get a drawingFunction for each point.
        * 'connected' is an option of scatter plot, which uses a drawingFunction.  This is easy to do.
        * 'markers' is a style parameter of line plot? No. Can't have data-dependent markers.
    -- Must have a way to generate data for line plots at a level so that it's straightforward to shade between two:
            var s = plotFunction(Sin)
            var c = plotFunction(Cos)
            shadeBetween(s, c, 0, pi)  // optional start and stop
    -- In above example, should plotFunction return the whole plot, a reference to just
         the function ploted, the SVGElement that corresponds to what was plotted, what?
    -- Plot boxes to show relative scales between plots like in Global Warming example.
    -- Combeine Ticks with TickLables they come together. Want labels without ticks? Set tick-length to zero
          what happens with multiple sets of ticks/ tickLabels on the same graph?
    -- Seperate types from scales.
        * types: number, datetime, string, money
        * scales: relative, category
       For example, you might want to plot a series of numbers as a bar chart where x is just integers
       this is true also for dates.  Hits/day is more of a category thing than a linear scale thing.
       Histograms are categories, but what happens when the categories are ranges that are real numbers: 10-20, 20-30, etc?
       Each type has a set of formatting codes that you can specify for tickLabels
    -- Different Defaults for Plot Styles:
        * Textbook functions (arrows on the axes, thick lines, no ticks or stubs)
        * Data plotting (box/frame with ticks, stubs, grid)
        * Flashy graphics with gradients, shadows, and subdued image background
    -- Strike a balance between ultra-dense plotting and leaving some room for comfort
    -- Strike a balance between optimizing for the screen (pixel alignment) and a printer
    -- xtoi and ytoj should take into account transformation to currentGroup
    -- When plotting something with too many tick labels,  first go to double row, then to diagonal, then to vertical
            when text is rotated (up to 90 deg) have it non-centered
    -- Data Rectangle smaller than plot rectangle by thee methods: 2%, 5px, fixed offset of data
        (so zero doesn't lie in corner, there is padding around glyphs, and zero label fits)
    -- Have the GUI teach about the plotting API by having a running script that you add to.
    
    -- horizontalLine(value, color)
    -- horizontalLines(data, colors)
    -- horizontalStrip(start, end, color?)  // Draws a rect with given stroke and fill settings  What about stroking ends?
    -- horizontalStrips([[1,2], [2,3]], ['red', 'green'])  
    
    -- Filter out invalid data at some point.  Can't pass invalid data to newScaleFromType!
    
    -- SQL Injection attacts, strip out
        [";", "--", "xp_", "select", "update", "drop", "insert", "delete", "create", "alter", "truncate"]

    Things to get done with dates
    -- Get comparisons to work
    -- Get max/min to work
    -- Pass in formatting string to tickLabels
    -- Auto-generate appropriate formatting string
    -- Two-row labeling
    
    What to do about histograms and data analysis:
    * JavaScript
    * Server-side python
    * SQL generated by JS or by Python
    
    Example:
    with p {
        createBoxes(1,2,2) // One plot on the first line, two on the second, etc.
        plot([1,2,3], [1,4,9], {color: "red"})
        nextBox()
        plotFunction("sin(x)", {"x", -6, 6}, {color: "blue"})
    }
    
    Interesting tests:
    * stocks
    * weather
    * weblog
    * fake temp data (year/month/day cyclic plus random noise)
    * trace real plots to extract data
    * CIA World Factbook
    * US Census data
    * Starchart
    * Maps of earth in different projections and GIS overlay
    * real-time mouse movement (distance, location, time spent up/down, correlations)
    * Chromaticity diagram
    
    
    Annotations:
    * Label on plot
    * Pointer with label kinked or curved arrow: horizontal near text, perpendicular to plot)
      - Sometimes more than one plot corresponds to same label
    * Labeled point
    * Labeled vector
    * Labeled span, which auto-adjusts based on length (curved verions for angles)
      - Biggest has arrows on ends and label in middle (optional bars at end of arrows)
      - Smallest has arrows outside pointing in with label to right/left or above
      - One sided arrows from an axis, for example
    * Angle 1, angle 2, right angle
    * line 1, similar to line 2, etc.
    * Speudo shading (hash marks on one side of curve) Maybe with soft gradient
    
    Function Plotting:
    * Special cases for sin(x)/x
    
***/



////////////////////////////
//  Setup
////////////////////////////


if (typeof(dojo) != 'undefined') {
    dojo.provide("SVGPlot");
    dojo.require("SVGCanvas");
}
if (typeof(JSAN) != 'undefined') {
    JSAN.use("MochiKit.Iter", []);
}

try {
    if (typeof(SVGCanvas) == 'undefined') {
        throw "";
    }
} catch (e) {
    throw "SVGPlot depends on SVGCanvas!";
}

if (typeof(SVGPlot) == 'undefined' || SVGCanvas == null) {
    // Constructor
    SVGPlot = function (widthOrIdOrNode /*=100*/, height /*=100*/, id /*optional*/) {
        if (arguments.length>0)
            this.__init__(widthOrIdOrNode, height, id);
        if (typeof(this.__init__)=='undefined' || this.__init__ == null) {
            //log("You called SVGPlot() as a fnuction without new.  Shame on you, but I'll give you a new object anyway");
            return new SVGPlot(widthOrIdOrNode, height, id);  // Ends up calling this constructor again, but returning an object.
        }
        return null;
    };
}

// In order for forceRedraw and getBBox to work, you need to have an object type.  TODO: get rid of this when working
//SVGKit._defaultType = 'object';
SVGKit._defaultType = 'inline';  // uncaught exception: [Exception... "Component returned failure code: 0x80004005 (NS_ERROR_FAILURE) [nsIDOMSVGSVGElement.forceRedraw]"

// Inheritance ala http://www.kevlindev.com/tutorials/javascript/inheritance/
//SVGPlot.prototype = new SVGCanvas();  // TODO: Fix Inheritance
SVGPlot.inherit = function(child, parent) {
    MochiKit.Base.setdefault(child.prototype, parent.prototype)
    child.prototype.constructor = child;
    child.superclass = parent.prototype;
    child.prototype.superclass = parent.prototype;
}

SVGPlot.inherit(SVGPlot, SVGCanvas);

SVGPlot.NAME = "SVGPlot";
SVGPlot.VERSION = "0.1";
SVGPlot.__repr__ = function () {
    return "[" + SVGPlot.NAME + " " + SVGPlot.VERSION + "]";
};
SVGPlot.prototype.__repr__ = SVGPlot.__repr__;

SVGPlot.toString = function () {
    return this.__repr__();
};
SVGPlot.prototype.toString = SVGPlot.toString;


SVGPlot.EXPORT = [
    "SVGPlot"
];

SVGPlot.EXPORT_OK = [
];



////////////////////////////
//  Defaults
////////////////////////////


SVGPlot.plotNS = "http://svgkit.sourceforge.net/";
SVGPlot.defaultAxisStrokeWidth = 1;
SVGPlot.defaultMargins = 0;
SVGPlot.defaultTickLength = 2;
SVGPlot.defaultStyle = null;   // To be set by resetPlot()


////////////////////////////
//  Constructor
////////////////////////////

SVGPlot.prototype.__init__ = function (widthOrIdOrNode, height, id /*optional*/) {
    /***
        Can pass it in an SVG object, or can pass it things that the SVG constructor uses.
    ***/
    // Aditional State:
    SVGCanvas.startingState.plotCoordinates = false // instead of (i,j) use (x,y) or (r,theta) or (category, date) or whatever
    SVGCanvas.startingState.pointFunction = null // a function that takes a row of data and draws a point
    SVGCanvas.startingState.lineFunction = null // takes start and stop and draws a line (possibly smooth or of varying thickness/color.)
    SVGPlot.superclass.__init__.call(this, widthOrIdOrNode, height, id);
    this.svg.whenReady( bind(this.resetPlot, this, null) );
}


// text_width and text_height are used to estimate the bounding boxes since getBBox() doesn't work
SVGPlot.text_width = 9; 
SVGPlot.text_height = 9;

SVGPlot.prototype.resetPlot = function() {
    // SVGCanvas already has a reset()
    //log("Constructing SVGPlot in SVGPlot.reset");
    this.boxes = [];
    this.box = null;
    this.element = this.svg.svgElement;
    //this.fontFamily = "Verdana, Arial, Helvetica, Sans";
    //this.fontFamily = "Bitstream Vera Sans";
    this.fontFamily = "Bitstream Vera Sans, Verdana, Arial, Helvetica, Sans";
    this.fontSize = this.text_width+'px';  // TODO: This comes from a temporary hack to extimate bounding box
    SVGPlot.defaultStyle = this.getStyle();
}



////////////////////////////
//  Plot Class Initializations
////////////////////////////


// All objects have an element and svgPlot member.

                
/*

Alternative layout where things have links to the scale rather than being contained in a scale.  Flatter, but more interlinked heirarchy -- harder for XML

SVGPlot.Layout = {}
SVGPlot.Box = {}     // box
    SVGPlot.Graphic = {}  // Random shapes tied to (i,j) not (x,y) coordinates.  When plot is zoomed/moved, do these go too?
    SVGPlot.Ledgend = {} // List of the names of the plots.  Auto or manual.
    SVGPlot.Scale = {} // becomes a list of scales that can be linked to by everything else.
    SVGPlot.LinePlot = {}   // plot  (xscale and yscale)
    SVGPlot.ScatterPlot = {}   // plot  (xscale and yscale)
    SVGPlot.Decoration = {}  // (xscale and yscale) like arrows pointing to specific places on the plot.  tied to (x,y) not (i,j).  When plot is zoomed/moved, these move around.
    SVGPlot.Axis = {}   // xAxis, yAxis (xscale or yscale)
        SVGPlot.AxisTitle = {}  // xAxisTitle, yAxisTitle
        SVGPlot.Ticks = {}  // xTicks, yTicks
        SVGPlot.TickLabels = {}  // xTickLabels, yTickLabels
        SVGPlot.Gridlines = {} // xGridlines, yGridlines

*/

SVGPlot.Layout = {}
SVGPlot.Box = {}     // box
    SVGPlot.PlotTitle = {}  // either outside of plot area or overlaid
    SVGPlot.Ledgend = {} // List of the names of the plots.  Auto or manual.
    SVGPlot.Graphic = {}  // Random shapes tied to (i,j) not (x,y) coordinates.  When plot is zoomed/moved, do these go too?
    SVGPlot.View = {}   // view  manages xtoi(), the mapping from plot coordinates to pixel coordinates (can be log)
        SVGPlot.LinePlot = {}   // plot: line or step
        SVGPlot.ScatterPlot = {}   // plot
        SVGPlot.Decoration = {}  // like arrows pointing to specific places on the plot.  tied to (x,y) not (i,j).  When plot is zoomed/moved, these move around.
        SVGPlot.Scale = {}      // xScale, yScale
            SVGPlot.Axis = {}   // xAxis, yAxis -- refers to the line itself and its decorations
                SVGPlot.AxisTitle = {}  // xAxisTitle, yAxisTitle
                SVGPlot.Ticks = {}  // xTicks, yTicks
                SVGPlot.TickLabels = {}  // xTickLabels, yTickLabels
                SVGPlot.Gridlines = {} // xGridlines, yGridlines




SVGPlot.Box.prototype = {}
    SVGPlot.PlotTitle.prototype = {}
    SVGPlot.Ledgend.prototype = {}
    SVGPlot.Graphic.prototype = {}
    SVGPlot.View.prototype = {}
        SVGPlot.LinePlot.prototype = {}
        SVGPlot.ScatterPlot.prototype = {}
        SVGPlot.Decoration.prototype = {}
        SVGPlot.Scale.prototype = {}
            SVGPlot.Axis.prototype = {}
                SVGPlot.AxisTitle.prototype = {}
                SVGPlot.Ticks.prototype = {}
                SVGPlot.TickLabels.prototype = {}
                SVGPlot.Gridlines.prototype = {}


/*
Setters set properties of current object.
    If the current object doesnt' exist, it creates a new one
    If you pass in null or don't pass anything retains current value.
        If the current value doesn't exist, it choses a reasonable default value.
Adders create a new object and call the Setter.
Removers remove the object.
*/


////////////////////////////
//  Helper Objects
////////////////////////////

/***
    Should have two classes: continuous and discrete
    Within each, there are different data types supported: number, real, money, string
    
    TODO: Should these just map to 0.0 to 1.0, or should they map to pixels?
    TODO: Should Scale be a generic parent class from which RealScale, DateTimeScale, and CategoryScale are derived?
***/

// Scale -- Mapping from data to a position between 0.0 and 1.0 and back.

SVGPlot.ScaleReal = function(min /* ='auto' */, 
                               max /* ='auto' */, 
                               interpolation /* ='linear' */, 
                               reversed /* ='false' */, 
                               required /* =[] */) {
    /***
        Constructor for ScaleReal: Mapping real values to positions.
    ***/
    this.set(min, max, interpolation, reversed, required);
}

SVGPlot.ScaleReal.prototype = {
    type: "ScaleReal",
    _min: null,  // Calculated if min is 'auto', set otherwise
    _max: null,
    set: function(min, max, interpolation, reversed, required) {
        /***
            Constructor.
            If a parameter is not specified, AND it's not already set, 
            set it to a default
        ***/
          this.dataSets = []  // Lists of data, each in form [1,7,4,6]
        this.min = SVGKit.firstNonNull(min, this.min, 'auto')
        this.max = SVGKit.firstNonNull(max, this.max, 'auto')
        if (this.min != 'auto')
            this._min = this.min
        if (this.max != 'auto')
            this._max = this.max
        this.interpolation = SVGKit.firstNonNull(interpolation, this.interpolation, 'linear')  // 'log', 'ln', 'lg', 'sqrt', 'atan'
        this.reversed = SVGKit.firstNonNull(reversed, this.reversed, false)
        this.includezero = false
        this.symmetric_around_zero = false
        //this.overshoot = 0.05
        this.required = SVGKit.firstNonNull(required, this.required, []) // list of values that must be included when min or max are 'auto'
    },
    position: function(value) {
        /*** 
            @returns a float from 0.0->1.0 if value is between _max and _min, 
              but can return a number outside this range if input is outside range.
              If _max or _min have not yet been set or set illegally, this returns null.
        ***/
        if (this._min==null || this._max==null || this._min > this._max)
            return null
        var interpolation_function = this.interpolation_functions[this.interpolation]
        var pos = interpolation_function.call(this, value)
        return pos
    },
    interpolation_functions: {
        linear: function(value) {
            return (value-this._min)/(this._max-this._min)
        },
        log: function(value) {
            if (this._min <= 0.0)
                return null;
            return (Math.log(value)-Math.log(this._min))/(Math.log(this._max)-Math.log(this._min))
        },
        sqrt: function(value) {
            return (Math.sqrt(value)-Math.sqrt(this._min))/(Math.sqrt(this._max)-Math.sqrt(this._min))
        },
        atan: function(value) {
            var middle = (this._max-this._min)/2.0
            return Math.atan(value-middle)/Math.PI+0.5
            // TODO -- max and min should provide some scaling for the width of the atan.
        }
    },
    setAuto: function() {
        /***
            Set _max and _min.
            If either max or min are 'auto',
            Take the list of dataSets and find their overall max and min
            
            If there are no plots, or the plots are flat,
            make sure _max and _min have a reasonable value.
            
            @returns a dictionary containing {'min', 'max'}
        ***/
        
        if (this.min != 'auto' && this.max != 'auto') {
            // Bypass calculating the min and max
            this._min = this.min
            this._max = this.max
            return {'min':this.min, 'max':this.max}
        }
        var extents = {'min':Number.MAX_VALUE,
                       'max':-Number.MAX_VALUE }
        
        this.dataSets.push(this.required)  // Add this list of required vals to be poped at end
        // TODO:  Remove duplicates so we only to expensive calculation of min/max once.
        for (var i=0; i<this.dataSets.length; i++) {
            var data = this.dataSets[i]
            if (data.length > 0) {
                var notNaN = function(number) {
                    return !isNaN(number)
                }
                var filtered = filter(notNaN, data)
                extents.min = Math.min(extents.min, listMin(filtered))
                extents.max = Math.max(extents.max, listMax(filtered))
            }
        }
        this.dataSets.pop()
        
        /*
        var total = extents.max - extents.min;
        
        // If the max or min are close to zero, include zero.
        if (extents.min>0.0 && ( extents.min<total*SVGPlot.autoViewMarginFactor ||
                          (typeof(include_zero) != 'undefined' && include_zero == true) ) )
            extents.min = 0.0;
        if (extents.max<0.0 && (-extents.max<total*SVGPlot.autoViewMarginFactor ||
                          (typeof(include_zero) != 'undefined' && include_zero == true) ) )
            extents.max = 0.0;
        
        // If neither one lies on the origin, give them a little extra room.  TODO Make this an option
        if (extents.min!=0.0)
            extents.min = extents.min - total * SVGPlot.autoViewMarginFactor;
        if (extents.max!=0.0)
            extents.max = extents.max + total * SVGPlot.autoViewMarginFactor;
        */
        
        if (extents.max<extents.min) {  // Shouldn't happen unless there were no datasets
            extents = {'min':-10, 'max':10 }
        }
        if (extents.max==extents.min) {  // Happens if data is all the same.
            extents.min -= 1
            extents.max += 1
        }
        
        this._min = (this.min!='auto') ? this.min : extents.min
        this._max = (this.max!='auto') ? this.max : extents.max
        return extents
    },
    defaultLocations : function(/* arguments to be passed on to location_function */) {
        var location_function = this.location_functions[this.interpolation]
        var locations = location_function.apply(this, arguments)
        return locations
    },
    location_functions: {
        linear: function(type, 
                         interval /* defaultInterval */, 
                         number /* =7 */, 
                         avoid /* = [min, max] */, 
                         offset /* = 0*/) {
            /***
                Come up with locations for the ticks/grids/tickLabels, etc.
                @param type -- 'ticks' or 'tickLabels' can be used to decide 'between' or 'on'
                @param interval -- the interval at which you want the ticks, usually 1, 2, 3, 5, 10, 20, etc.
                @param number -- the number of locations to return
                @param avoid -- an array of locations to avoid putting a mark (usually the axes and endpoints.)
                @param offset -- the ticks start counting around here (defaults to zero)
                
                @returns an array of floats which list the tick locations.
            ***/
            var min = this._min
            var max = this._max
            
            if (typeof(avoid)=='undefined' || avoid==null)
                avoid = []; //[min, max];
            if (typeof(offset)=='undefined' || offset==null)
                offset = 0;
            if (typeof(interval)=='undefined' || interval==null || isNaN(interval))
                interval = this.defaultInterval(number)
            
            // Make sure we won't loop forever:
            interval = Math.abs(interval)
            if (interval==0)
                interval = 1;
            
            var locations = [];
            var avoidance = (max-min)*SVGPlot.autoViewMarginFactor
            var mark = Math.ceil( (min-offset)/interval ) * interval + offset
            while (mark < max) {
                var reject = false;
                for (var i=0; i<avoid.length; i++)
                    if (Math.abs(mark-avoid[i]) < avoidance/2)
                        reject = true;
                if ( reject==false )
                    locations.push(mark)
                mark += interval
            }
            return locations;
        },
        log: function(type, 
                        base /* = 10 */, 
                        sub_marks /*= false*/) {
            /***
                Locations for ticks/trids/tickLabels for log scale
                @param sub_marks adds nine marks between each decade
                making the familiar "log scale"
            ***/
            var min = this._min
            var max = this._max
            
            if (min <=0)
                return []
            
            base = SVGPlot.firstNonNull(base, this.base, 10)
            sub_marks = SVGPlot.firstNonNull(sub_marks, this.sub_marks, type=='ticks')
            
            var logbase = Math.log(base)
            var logmin = Math.log(min)/logbase
            var logmax = Math.log(max)/logbase
            var logstart = Math.floor(logmin)
            var logend = Math.ceil(logmax)
            
            var locations = []
            for (var logmark = logstart; logmark <= logend; logmark++) {
                var mark = Math.pow(base, logmark)
                locations.push(mark)
                if (sub_marks && logmark != logend) {
                    var next_mark = Math.pow(base, logmark+1)
                    for (var sub_mark = mark+mark; sub_mark < next_mark; sub_mark += mark) {
                        locations.push(sub_mark)
                    }
                }
            }
            return locations;
        },
        sqrt: function() {
            return []
        },
        atan: function() {
            return []
        }
    },
    defaultInterval : function(number /* =7 */) {
        /***
            utility function used in defaultLocations
            return a nice spacing interval.  Nice is a power of 10,
            or a power of ten times 2, 3, or 5.  What you get out is one of:
            ..., .1, .2, .3, .5, 1, 2, 3, 5, 10, 20, 30, 50, 100, ...
        ***/
        var min = this._min
        var max = this._max
        
        if (typeof(number)=='undefined' || number==null || isNaN(number))
            number = 7;
        var raw_interval = (max-min)/number;
        // First find the nearest power of ten
        var log_base10 = Math.log(raw_interval)/Math.LN10;
        var power_of_ten = Math.pow(10, Math.floor(log_base10));
        // Find what you have to multiply this nearest power of ten by to get the interval
        var increment_multiple = raw_interval/power_of_ten;
        function log_closest_to(x, array) {
            var logx = Math.log(x);
            var best_value = -1;
            var best_distance = Number.MAX_VALUE;
            for (var i=0; i<array.length; i++) {
                var log_distance = Math.abs(logx - Math.log(array[i]));
                if (log_distance<best_distance) {
                    best_distance = log_distance;
                    best_value = array[i];
                }
            }
            return best_value;
        }
        // Finally find the round multiple to get closest.
        var increment = power_of_ten * log_closest_to(increment_multiple, [1, 2, 5, 10]);
        return increment;
    },
    defaultLabels : function(locations) {
        return map(SVGPlot.prettyNumber, locations)
    }
}


SVGPlot.ScaleDateTime = function(min, max, interval, reversed, required) {
    /***
        Mapping date/time values to positions.
        interval can be 'minute', 'day' or whatever.  It determines where ticks will be.
        
        Decide what the most reasonable interval is and make ticks based on that
        
        omitweekends option where Friday is followed directly by monday
        elapsed time can be more than 24 hrs.
        Datetime with time windowing for just showing work/day
        
        ScaleDateTime has burried in it a ScaleReal object which stores miliseconds since the epoc
        and is used to do all of the auto-everything.
    ***/
    this.set(min, max, interval, reversed, required)
}
//SVGPlot.inherit(SVGPlot.ScaleDateTime, SVGPlot.ScaleReal);
SVGPlot.ScaleDateTime.prototype = {
    type: "ScaleDateTime",
    _min: null,
    _max: null,
    _realScale: null,
    
    /*
    milliseconds : function(value) {
        // Can be used in map()
        // value can either be an ISO timestamp string or a Date object
        if ( typeof(valye) == "string" )
            return isoTimestamp(str).getTime()
        if ( typeof(value) == "object" && value.constructor == Date )
            return value.getTime()
    },
    */
    set: function(min, max, interval, reversed, required) {
        /*** Sets defaults ***/
        this.dataSets = [];
        this.min = SVGKit.firstNonNull(min, this.min, 'auto');
        this.max = SVGKit.firstNonNull(max, this.max, 'auto');
        if (this.min != 'auto')
            this._min = this.min
        if (this.max != 'auto')
            this._max = this.max
        // TODO: Convert min and max from JavaScript Date or ISO strings to datetime
        this.interval = SVGKit.firstNonNull(interval, this.interval, 'auto');
        this.reversed = SVGKit.firstNonNull(reversed, this.reversed, false);
        this.required = SVGKit.firstNonNull(required, this.required, []); // list of values that must be included when min or max are 'auto'
        
        // Convert min, max, and required into miliseconds since 1970 
        // to pass to the underlying _realScale
        
        var min_ord = this.min;  // Could be 'auto', or a datetime that will get converted to an ordinal
        var max_ord = this.max;
        var required_ord = [];
        
        if (this.min != 'auto')
            min_ord = datetime.ordinalDay( datetime.datetime(min) )
        if (this.max != 'auto')
            max_ord = datetime.ordinalDay( datetime.datetime(max) )
        if ( this.required.length != 0 )
            required_ord = map(datetime.ordinalDay, map(datetime.datetime, this.required))
        this._realScale = new SVGPlot.ScaleReal(min_ord, max_ord, 'linear', reversed, required_ord)
    },
    position: function(value) {
        //log('position', value, value.year, value.month, value.day, value.hour, value.minute, value.second)
        if (typeof(value) == 'string')
            value = datetime.parse(value)
        // TODO:  Check if it's  a Date() object
        var ord = datetime.ordinalDay(value)
        var position = this._realScale.position(ord)
        //log(value, datetime.toISOTimestamp(value), ord, position)
        return position
    },
    setAuto: function() {
        /***
        ***/
        
        extents = null
        
        if (this.min != 'auto' && this.max != 'auto') {
            // Bypass calculating the min and max
            extents = {'min':this.min, 'max':this.max};
            extents.min_ord = datetime.ordinalDay(extents.min)
            extents.max_ord = datetime.ordinalDay(extents.max)
        }
        else {
            var datetime_array_map = function(str_array) {
                return map(datetime.datetime, str_array)
            }
            
            this.dataSets.push(this.required)  // Add this list of required vals to be poped at end
            var datetimes = map(datetime_array_map, this.dataSets)
            this.dataSets.pop()
            
            // Some default extents that go one day before to one day after now
            var now = datetime.now()
            var now_ord = datetime.ordinalDay(now)
            var extents = {min:now,         max:now, 
                           min_ord:now_ord, max_ord:now_ord}  // Some default where they're equal to pass test below if left unchanged
            
            // Concat all of the datasets together and find the min/max of the whole list
            var all = []
            for (i in datetimes)
                all = all.concat(datetimes[i])
            if (all.length > 0)
                extents = datetime.minmax(all)
        }
        if (extents.min_ord == extents.max_ord) { // Happens if max and min are the same or all.length == 0
            extents.min = datetime.subPeriod(extents.min, {day:1})
            extents.max = datetime.addPeriod(extents.max, {day:1})
            extents.min_ord = datetime.ordinalDay(extents.min)
            extents.max_ord = datetime.ordinalDay(extents.max)
        }
        
        this._min = extents.min
        this._max = extents.max
        this._realScale.set(extents.min_ord, extents.max_ord)
        
        this._min = (this.min!='auto') ? this.min : extents.min;
        this._max = (this.max!='auto') ? this.max : extents.max;
        return extents
    },
    intervals: {
        year: [1, 2, 4, 5, 10, 20, 40, 50, 100, 200, 400, 500, 1000],  // No 3s because 1995,1998,2001,2004 looks dumb
        month: [1, 2, 3, 4, 6],
        day: [1, 2, 3, 5, 10],
        hour: [1, 2, 3, 4, 6, 12],
        minute: [1, 2, 3, 5, 10, 15, 20, 30],
        second: [1, 2, 3, 5, 10, 15, 20, 30],
        microsecond: [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000]
    },
    approxDiffDays : function(min, max) {
        var diff_days = 0
        var days = datetime.days
        forEach(datetime.keys, function(key) {
            if (max[key] != null)
                diff_days += max[key] * days[key]
            if (min[key] != null)
                diff_days -= min[key] * days[key]
        })
        return diff_days
    },
        
    /***
        Special cases:
        weeks
        days in year
        days, hours, minutes, seconds that go forever just use the real-scale algorithm
        (same for years and miliseconds. If the interval is too long or too short, just
        the real algorithm.)
        
        Algorithm takes start, end, and goal number of intervals
        Returns the interval that comes cloest to dividing the 
        time into goal number of intervals
    ***/
    defaultInterval : function(number /* 7 */) {
        /***
            var s = new SVGPlot.ScaleDateTime({year:1980}, {year:2010})
            s.defaultInterval()
            @returns a datetime interval object like {'month': 2}
        ***/
        number = SVGKit.firstNonNull(number, 7);
        var min = this._min
        var max = this._max
        //var diff = datetime.subtract(max, min)
        //var diff_ord = datetime.ordinalDay(max) - datetime.ordinalDay(min)
        
        var diff_days = this.approxDiffDays(min, max)
        var days = datetime.days
        var intervals = this.intervals
        
        // Go through to find interval that would give closest to number spacings
        var best_score = 999999 
        var best_interval = {}  // Eventually set to something like {'month': 2}
        forEach(datetime.keys, function(key) {
            forEach(intervals[key], function(interval) {
                var interval_count = diff_days / (days[key]*interval)
                var score = Math.abs(Math.log(number/interval_count))
                //log(key, interval, score)
                if (score < best_score) {
                    best_score = score
                    best_interval =  {}
                    best_interval[key] = interval
                }
            })
        })
        return best_interval
    },
    
    defaultLocations : function(type, 
                                 interval /* defaultInterval */, 
                                 number /* =7 */, 
                                 avoid /* = [min, max] */, 
                                 offset /* = 0*/) {
        /***
            function(type, number / =7 /, extend_to_nearest / =false /) 
            var s = new SVGPlot.ScaleDateTime({year:1980}, {year:2010})
            s.defaultLocations()
        ***/
        number = SVGKit.firstNonNull(number, 7);
        var min = this._min
        var max = this._max
        //var diff = datetime.subtract(max, min)
        //var diff_days = datetime.ordinalDay(max) - datetime.ordinalDay(min)
        
        
        // If there are many years, return evenly spaced years
        /*
        if (diff.year >= number) {
            var s = new SVGPlot.Scale(this._min, this._max)
            var years = s.defaultLocations(number)
            return map(function(year) {return {year:year}} , years)
        }
        */
        var interval = this.defaultInterval(number)
        // Unpack the interval
        var pair = items(interval)[0]
        var key = pair[0]
        var length = pair[1]
        var locations = []  // Start with an empty array
        // Now find the nearest datetime that is an even multiple of the interval
        var start = datetime.round(min, key, 'down', length)
        var end = datetime.round(max, key, 'up', length)
        var current = start
        var count = 0
        while (datetime.compareDatetimes(current, end) == -1 && count <= number+1) {
            count += 1
            locations.push(current)
            current = datetime.addPeriod(current, interval)
            // Have to round each one.  This applies almost exclusively 
            // to adding some number of days and having the month roll over
            current = datetime.round(current, key, 'nearest', length)
        }
        return locations
    },
    
    defaultLabels : function(locations) {
        /***
            datetime.subDatetimes(locations[1], locations[0])
            doesn't work becuase it doesn't try to roll over months and days
            
            Should default labels have to do with the spacing between ticks or 
            the overall difference between max and min?
        ***/
        if (locations.length <= 1)
            return map(datetime.toISOTimestamp, locations)
        
        var smallest_difference = 'month'; // Default to a clear, if useless representation
        
        var diff_days = datetime.ordinalDay(locations[1]) - 
                        datetime.ordinalDay(locations[0])
        var code = 'yyyy-mm'
        var days = datetime.days
        if (diff_days >= days['year'])
            code = 'yyyy'
        else if (diff_days >= days['month'])
            code = 'yyyy-m'
        else if (diff_days >= days['day'])
            code = 'm-dd'
        else if (diff_days >= days['hour'])
            code = 'd h:nn'
        else if (diff_days >= days['minute'])
            code = 'h:nn'
        else if (diff_days >= days['second'])
            code = 'n:ss'
        else
            code = 's.uu'
        
        var disp = function(dt) {
            return datetime.format(dt, code)
        }
        return map(disp, locations)
        //return map(datetime.toISOTimestamp, locations)
    },
    
    oneRow : function(start, end, extend_to_nearest) {
        /***
            DEFUNCT
            Returns a list of pairs [date Object, field]
            in evenly spaced intervals of the biggest change.
            If you go from 1:00 to 1:59, it will return 60 pairs spaced by one minute
            
            If extend_to_nearest is true, the list that gets returned will
            have its first element before or at the start and 
            its last element after or at the end
            
            The list returned for (2:00:01 to 6:59:59) won't include 
            2:00 and 7:00 if extend_to_nearest is false.
            Instead it will return the list  [3:00, 4:00, 5:00, 6:00]
            
            If extend_to_nearestis set, the plot has to be re-auto-ranged to include
            these possible new endpoints, otherwise they'll print off the scale.
        ***/
        /*
        if (start.getTime() >= end.getTime())
            return null
        
        var i = this.firstDifferent(start, end)
        var getter = 'get' + this.fields[i]
        var setter = 'set' + this.fields[i]
        
        var iter = this.roundDate(start, i, !extend_to_nearest)
        var field = iter[getter]()
        result = [ [iter, field] ]
        while ( iter[getter]() < end[getter]() && extend_to_nearest==false ||
                 iter[getter]() <= end[getter]() && extend_to_nearest==true ) {
            iter[setter](field+1)
            field = iter[getter]()
            result.push( [iter, field] )
        }
        return result
        */
    },
    twoRows : function() {
    }
}

test = function() {
   // test datetime stuff
   var s = new SVGPlot.ScaleDateTime()
   var start = isoTimestamp('2007-01-27 10:17')
   var end = isoTimestamp('2007-01-27 10:23')
   log('s.firstDifferent(start,end) == 4 ?', s.firstDifferent(start,end) == 4)
   log('s.commonPart(start,end) == "2007-00-27 10:00" ?', s.commonPart(start,end) == "2007-00-27 10:00")
   for (var i=0; i<s.fields.length; i++) {
       log('s.roundDate down to', s.fields[i], toISOTimestamp(s.roundDate(start, i, false)) )
       log('s.roundDate up to', s.fields[i], toISOTimestamp(s.roundDate(start, i, true)) )
   }
   return s.oneRow(start, end)
}

/*
Discrete and Category scales are the same concept.
They are used for things like bar charts and histograms.
When you fit a function on top of a histogram, do you need two different scales?
Rather than a range of real numbers, there are a fixed number of items N
Things can be sorted by the category name itself or by another column
What you want it to return is one of the following:
* beginning
* middle
* end
* size (end-beginning)
* beginning of rectangle that doesn't take up the whole space
* end of rectangle

Discrete plot takes integer values from min to max with spacing interval
Category plot takes a list of strings
DateTime Category takes a beginning, end, and interval (useful for datetime hisogram)

3      *   *   *
2  *   *   *   *
1  *   *   *   *   *
0 -0-|-1-|-2-|-3-|-4-

*/

SVGPlot.ScaleDiscrete = function(min, max, interval, placement, reversed, required) {
    /***
        Mapping discrete values to positions.
    ***/
    this.set(min, max, interval, placement, reversed, required)
}
SVGPlot.ScaleDiscrete.prototype = {
    type: "ScaleDiscrete",
    _min: null,
    _max: null,
    set: function(min, max, interval, placement, reversed, required) {
        this.min = SVGKit.firstNonNull(min, 'auto');
        this.max = SVGKit.firstNonNull(max, 'auto');
        if (this.min != 'auto')
            this._min = this.min
        if (this.max != 'auto')
            this._max = this.max
        this.interval = SVGKit.firstNonNull(interval, 1);  // spacing between discrete values.  Can be any real number.
        this.placement = SVGKit.firstNonNull(placement, 'on');  // 'betweeen' Plot on or between grid lines.  (should this be a property of the grid?)
        this.reversed = SVGKit.firstNonNull(reversed, false);
        this.required = SVGKit.firstNonNull(required, []); // list of values that must be included when min or max are 'auto'
    },
    position: function(value) {
        if (this._min==null || this._max==null)
            return null;
        var length = this._max - this._min
        var count = length/this.interval+1;
        var index = (value-this._min)/this.interval
        return this.discreteToPosition(index, count);
    },
    discreteToPosition: function(index, count) {
        if (this.placement == 'on')
            return index/(count-1)
        else
            return (index+0.5)/count
    }
}

/*
var s = new SVGPlot.ScaleDiscrete(0, 3)
s.position(0) == 0.0
s.position(1) == 1.0/3.0
s.position(3) == 1.0
s.placement = 'off'
s.position(0) == 0.125
s.position(1) == 0.375
s.position(3) == 0.875

var s = new SVGPlot.ScaleDiscrete(-3, 3)
s.position(0) == 0.5
s.placement = 'off'
s.position(0) == 0.5
*/


SVGPlot.ScaleBoolean = function(placement, reversed) {
    /***
        Mapping boolean values to positions.
    ***/
    this.set(placement, reversed)
}
SVGPlot.ScaleBoolean.prototype = {
    type: "ScaleBoolean",
    _categories: [false, true],
    _min: false,
    _max: true,
    dataSets: [],
    set: function(placement, reversed) {
        this.placement = SVGKit.firstNonNull(placement, 'betweeen');  // 'betweeen' Plot on or between grid lines.  (should this be a property of the grid?)
        this.reversed = SVGKit.firstNonNull(reversed, false);
    },
    position: function(value) {
        var top = value && !this.reversed || !value && this.reversed
        if (this.placement == 'on') {
            if (top)
                return 1.0
            else
                return 0.0
        }
        else {
            if (top)
                return 0.75
            else
                return 0.25
        }
    },
    setAuto: function() {
        return {'min':this._min, 'max':this._max}
    },
    defaultLocations : function() {
        return this._categories
    },
    defaultLabels : function(locations) {
        return ['false', 'true']
    }
}


/*
var s = new SVGPlot.ScaleBoolean()
s.position(false) == 0.0
s.position(true) == 1.0
s.reversed = true
s.position(false) == 1.0
s.position(true) == 0.0
s.placement = 'off'
s.position(false) == 0.75
s.position(true) == 0.25
s.reversed = false
s.position(false) == 0.25
s.position(true) == 0.75
*/


SVGPlot.ScaleCategory = function(categories, placement, reversed, required) {
    /***
        Mapping category values to positions.
        If you pass categories to the constructor, they have to be unique
    ***/
    this.set(categories, placement, reversed, required)
}
SVGPlot.ScaleCategory.prototype = {
    type: "ScaleCategory",
    _categories: [],  // of the form ['bob', 'jim']
    _min: null,
    _max: null,
    dataSets: [],
    set: function(categories, placement, reversed, required) {
        this.categories = SVGKit.firstNonNull(categories, 'auto');
        if (this.categories != 'auto') {
            this._categories = this.categories
            this._min = this.categories[0]
            this._max = this.categories[this.categories.length-1]
        }
        //this.placement = SVGKit.firstNonNull(placement, 'on');  // 'betweeen' Plot on or between grid lines.  (should this be a property of the grid?)
        this.placement = SVGKit.firstNonNull(placement, 'betweeen');  // 'betweeen' Plot on or between grid lines.  (should this be a property of the grid?)
        this.reversed = SVGKit.firstNonNull(reversed, false);
        this.required = SVGKit.firstNonNull(required, []); // list of values that must be included when min or max are 'auto'
    },
    discreteToPosition: SVGPlot.ScaleDiscrete.prototype.discreteToPosition,
    position: function(value) {
        var count = this._categories.length;
        for (var i=0; i<count; i++) {
            if (this._categories[i] == value)
                return this.discreteToPosition(i, count);
        }
        //return null;
        return 0.5
    },
    
    setAuto: function() {
        /***
            Take the list of dataSets and accumulate the items.
            
            If there are no plots, or the plots are flat,
            make sure _max and _min have a reasonable value.
            
            @returns a dictionary containing {'min', 'max'}
        ***/
        
        if (this.categories != 'auto') {
            // Bypass
            this._categories = this.categories
        }
        else {
            this.dataSets.push(this.required)  // Add this list of required vals to be poped at end
            var category_dict = {}
            for (var i=0; i<this.dataSets.length; i++) {
                var dataSet = this.dataSets[i]
                for (var j=0; j<dataSet.length; j++) {
                    category_dict[dataSet[j]] = true
                }
            }
            this._categories = keys(category_dict).sort()
            this.dataSets.pop()
        }
        var len = this._categories.length
        this._min = this._categories[0]
        this._max = this._categories[len-1]
        return {'min':this._min, 'max':this._max}
    },
    defaultLocations : function() {
        return this._categories
    },
    defaultLabels : function(locations) {
        return this._categories
    }
}

/*
var s = new SVGPlot.ScaleCategory(['a','b','c'])
s.position('a') = 0.0
s.position('b')
s.position('c')
s.placement = 'off'
s.position('a')
s.position('b')
s.position('c')

var s = new SVGPlot.ScaleCategory()
s.dataSets.push(['a','bb','ccc','dddd','eeeee', 'ccc', 'a'])
s.setAuto()
s.position('ccc')
*/


SVGPlot.ScaleSegments = function(segments) {
    // This is for splitting the scale into many regions, each of which should have the same type
    // Check for non-overlap
    // Find overall min and max (only one of each can be 'auto')
    // Check for all same value of 'reversed'
}

SVGPlot.newScaleFromType = function(example) {
    // Return a new scale object that's appropriate for the type of data passed in
    // Priority to resolve ambiguity: Real, DateTime, category
    // Right now, the only strings that will be recognized as dates 
    // (and therefore not categories) are ISO timestamps: YYYY-MM-DD hh:mm:ss
    if (example==null)
        return null
    var type = typeof(example)
    if ( type == 'number' )
        return new SVGPlot.ScaleReal()
    if ( type == 'boolean' )
        return new SVGPlot.ScaleBoolean()
    if ( type == 'string' ) {
        if ( isoTimestamp(example) != null || datetime.parse(example) != null)
            return new SVGPlot.ScaleDateTime()
        else
            return new SVGPlot.ScaleCategory()
    }
    if ( type == 'object' && example.constructor == Date ) {
        log("Making new ScaleDateTime")
        return new SVGPlot.ScaleDateTime()
    }
    return null
}


////////////////////////////
//  Graphical Plot Objects
////////////////////////////

SVGPlot.genericConstructor = function(self, svgPlot, parent) {
    self.svgPlot = svgPlot;
    self.parent = parent;
    self.element = null;
    self.style = svgPlot.getStyle();
}


// Box -- The area that the plot and axes appear.  Seperate background for box and plotArea

SVGPlot.Box = function(svgPlot, parent,
                        layout /* ='float' */, x /* =0 */, y /* =0 */, width /* =svgWidth */, height /* =svgHeight */) {
    SVGPlot.genericConstructor(this, svgPlot, parent);
    parent.boxes.push(this)
    svgPlot.box = this
    /*
    this.boxBackgroundStroke = null;
    this.boxBackgroundFill = null;
    this.plotAreaBackgroundStroke = null;
    this.plotAreaBackgroundFill = null;
    */
    this.set(layout, x, y, width, height);
    this.views = [];
}

SVGPlot.Box.prototype.set = function(layout /* ='float' */, x /* =0 */, y /* =0 */, width /* =svgWidth */, height /* =svgHeight */) {
    this.x = SVGPlot.firstNonNull(x, this.x, 0);
    this.y = SVGPlot.firstNonNull(y, this.y, 0);
    var svg_width  = parseFloat(this.svgPlot.svg.htmlElement.getAttribute('width'));
    var svg_height = parseFloat(this.svgPlot.svg.htmlElement.getAttribute('height'));
    this.width  = SVGPlot.firstNonNull(width,  this.width,  svg_width);
    this.height = SVGPlot.firstNonNull(height, this.height, svg_height);
}

SVGPlot.Box.prototype.addDefaults = function() {
    // TODO:  Don't rely on svgPlot to do this
    var p = this.svgPlot;
    p.save();
    p.setStyle(SVGPlot.defaultStyle);
    var view = new SVGPlot.View(p, this)
    view.addDefaults();
    p.restore();
}

SVGPlot.prototype.setBox = function(layout /* ='float' */, x /* =0 */, y /* =0 */, width /* =svgWidth */, height /* =svgHeight */) {
    this.box.set(layout, x, y, width, height);
    return this.box;
}

SVGPlot.prototype.addBox  = function(layout /* ='float' */, x /* =0 */, y /* =0 */, width /* =svgWidth */, height /* =svgHeight */)  {
    this.box = new SVGPlot.Box(this, this, layout, x, y, width, height);
    return this.box;
}

// View  -- View eventually defines mapping (x,y) -> (i,j).  What about polar?  What about map projections?
// TODO:  This only makes ScaleReal, not ScaleCateory, etc.

SVGPlot.View = function(svgPlot, parent) {
    SVGPlot.genericConstructor(this, svgPlot, parent);
    parent.views.push(this);  // add ourselves to our parent Box's list of views
    svgPlot.view = this;
    this.xScale = new SVGPlot.ScaleReal();
    svgPlot.xScale = this.xScale;
    this.yScale = new SVGPlot.ScaleReal();
    svgPlot.yScale = this.yScale;
    this.plots = [];  // Plots to be drawn with this coordinate system
    this.xAxes = [];  // X-Axes to be drawn with this coordinate system
    this.yAxes = [];  // Y-Axes to be drawn with this coordinate system
}

SVGPlot.View.prototype = {
    addDefaults : function() {
        /***
            Adds axes and axes defaults to current Scale.
        ***/
        // TODO don't rely on svgPlot for this.
        this.svgPlot.save();
        this.svgPlot.setStyle(SVGPlot.defaultStyle);
        
        var xAxis = new SVGPlot.Axis(this.svgPlot, this, 'x');
        xAxis.addDefaults()
        
        var yAxis = new SVGPlot.Axis(this.svgPlot, this, 'y');
        yAxis.addDefaults()
        
        this.svgPlot.restore();
    }
}

SVGPlot.prototype.addView = function() { 
    view = new SVGPlot.View(this, this.box);
    return view;
}

SVGPlot.prototype.setXScale = function(
                          min /* ='auto' */, 
                          max /* ='auto' */, 
                          interpolation /* ='linear' */, 
                          reversed /* ='false' */, 
                          required /* =[] */) {
    if (this.view == null)
        this.view = new SVGPlot.View(this, this.box);
    this.view.xScale.set(min, max, interpolation, reversed, required);
    return this.view.xScale;
}

SVGPlot.prototype.setYScale = function(
                          min /* ='auto' */, 
                          max /* ='auto' */, 
                          interpolation /* ='linear' */, 
                          reversed /* ='false' */, 
                          required /* =[] */) {
    if (this.view == null)
        this.view = new SVGPlot.View(this, this.box);
    this.view.yScale.set(min, max, interpolation, reversed, required);
    return this.view.yScale;
}

// Axis

SVGPlot.Axis = function(svgPlot, parent, type, position /* = 'bottom' or 'left' */, scale_type /* ='linear' */) {
    SVGPlot.genericConstructor(this, svgPlot, parent);
    this.set(type, position, scale_type);
    if (type == 'x') {
        parent.xAxes.push(this);
        svgPlot.xAxis = this;
    }
    else if (type == 'y') {
        parent.yAxes.push(this);
        svgPlot.yAxis = this;
    }
    this.ticks = [];
    this.tickLabels = [];
    this.axisTitles = [];
}

SVGPlot.Axis.prototype.set = function(type, position /* 'bottom' or 'left' */, scale_type /* ='linear' */) {
    this.type = type
    if (type == 'x')
        this.position = SVGPlot.firstNonNull(position, this.position, 'bottom');
    else if (type == 'y')
        this.position = SVGPlot.firstNonNull(position, this.position, 'left');
    this.scale_type = SVGPlot.firstNonNull(scale_type, this.scale_type, 'linear');
}

SVGPlot.Axis.prototype.addDefaults = function() {
    // TODO:  Don't rely on svgPlot to do this
    this.svgPlot.save();
    this.svgPlot.setStyle(SVGPlot.defaultStyle);
    var ticks = new SVGPlot.Ticks(this.svgPlot, this);
    var tickLabels = new SVGPlot.TickLabels(this.svgPlot, this);
    this.svgPlot.restore();
}

SVGPlot.prototype.addXAxis = function(position /* 'bottom' */, scale_type /* ='lnear' */) {
    this.xAxis = new SVGPlot.Axis(this, this.view, 'x', position, scale_type);
    return this.xAxis;
}

SVGPlot.prototype.addYAxis = function(position /* 'left' */, scale_type /* ='lnear' */) {
    this.yAxis = new SVGPlot.Axis(this, this.view, 'y', position, scale_type);
    return this.yAxis;
}

SVGPlot.prototype.setXAxis = function(position /* 'bottom' */, scale_type /* ='lnear' */) {
    if (this.xAxis == null)
        this.xAxis = new SVGPlot.Axis(this, this.view, 'x', position, scale_type);
    else
        this.xAxis.set('x', position, scale_type);
}

SVGPlot.prototype.setYAxis = function(position /* 'left' */, scale_type /* ='lnear' */) {
    if (this.yAxis == null)
        this.yAxis = new SVGPlot.Axis(this, this.view, 'y', position, scale_type);
    else
        this.yAxis.set('y', position, scale_type);
}


// AxisTitle

SVGPlot.AxisTitle = function(svgPlot, parent,
                               text, location /* ='50%' */, position /* 'bottom' or 'left' */) {
    SVGPlot.genericConstructor(this, svgPlot, parent);
    parent.axisTitles.push(this);
    if (parent.type == 'x') {
        svgPlot.xAxisTitle = this;
    }
    else if (parent.type == 'y') {
        svgPlot.yAxisTitle = this;
    }
    this.set(text, location, position);
}

SVGPlot.AxisTitle.prototype.set = function(text, location /* ='50%' */, position /* 'bottom' or 'left' */) {
    this.text = text;
    this.location = SVGPlot.firstNonNull(location, this.loc, '50%');
    if (this.parent.type == 'x')
        this.position = SVGPlot.firstNonNull(position, this.position, 'bottom');
    if (this.parent.type == 'y')
        this.position = SVGPlot.firstNonNull(position, this.position, 'left');
}

SVGPlot.prototype.addXAxisTitle = function(text, loc /* ='50%' */, position /* 'bottom' */) {
    this.xAxisTitle = new SVGPlot.AxisTitle(this, this.xAxis, text, location, position);
    return this.xAxisTitle;
}

SVGPlot.prototype.addYAxisTitle = function(text, loc /* ='50%' */, position /* 'left' */) {
    this.yAxisTitle = new SVGPlot.AxisTitle(this, this.yAxis, text, location, position);
    return this.yAxisTitle;
}

SVGPlot.prototype.setXAxisTitle = function(text, location /* ='50%' */, position /* 'bottom' */) {
    if (this.xAxisTitle == null)
        this.xAxisTitle = new SVGPlot.AxisTitle(this, this.xAxis, text, location, position);
    else
        this.xAxisTitle.set(text, location, position);
}

SVGPlot.prototype.setYAxisTitle = function(text, location /* ='50%' */, position /* 'left' */) {
    if (this.yAxisTitle == null)
        this.yAxisTitle = new SVGPlot.AxisTitle(this, this.yAxis, text, location, position);
    else
        this.yAxisTitle.set(text, location, position);
}



// AxisItem -- Ticks, TickLabels, Gridlines

SVGPlot.AxisItem = function(svgPlot, parent, locations /*='auto'*/, position /* ='bottom' or 'left' */) {
    SVGPlot.genericConstructor(this, svgPlot, parent);
    this.set(type, locations, position);
}

SVGPlot.AxisItem.prototype.set = function(locations /*='auto'*/, position /* ='bottom' or 'left' */) {
    this.locations = SVGPlot.firstNonNull(locations, this.locations, 'auto');
    if (this.parent.type == 'x')
        this.position = SVGPlot.firstNonNull(position, this.position, 'bottom');
    if (this.parent.type == 'y')
        this.position = SVGPlot.firstNonNull(position, this.position, 'left');
}

SVGPlot.AxisItem.prototype.getDefaultLocations = function(type) {
    if (this.parent.type=='x')
        this._locations = this.parent.parent.xScale.defaultLocations(type)
    else if (this.parent.type=='y')
        this._locations = this.parent.parent.yScale.defaultLocations(type)
}

// Ticks -- includes functionality also for TickLabels and TickLines (grid)

SVGPlot.Ticks = function(svgPlot, parent,
                          locations /*='auto'*/, position /* ='bottom' or 'left' */, length /* =2 */, 
                          minorPerMajor /* = 4 */, minorLength /* =length/2 */) {
    SVGPlot.genericConstructor(this, svgPlot, parent);
    parent.ticks.push(this);
    if (parent.type == 'x')
        svgPlot.xTicks = this;
    else if (parent.type == 'y')
        svgPlot.yTicks = this;
    this.set(locations, position, length, minorPerMajor, minorLength);
}
SVGPlot.inherit(SVGPlot.Ticks, SVGPlot.AxisItem)

SVGPlot.Ticks.prototype.set = function(locations /*='auto'*/, position /* ='bottom' or 'left' */, length /* =2 */, 
                                         minorPerMajor /* = 4 */, minorLength /* =length/2 */) {
    SVGPlot.AxisItem.prototype.set.call(this, locations, position)
    this.length = SVGPlot.firstNonNull(length, this.length, 2);
    this.minorPerMajor = SVGPlot.firstNonNull(minorPerMajor, this.minorPerMajor, 4);
    this.minorLength = SVGPlot.firstNonNull(minorLength, this.minorLength, this.length/2);
}

SVGPlot.prototype.addXTicks = function(locations /*='auto'*/, position /* ='bottom' */, length /* =2 */, 
                                         minorPerMajor /* = 4 */, minorLength /* =length/2 */) {
    this.xTicks = new SVGPlot.Ticks(this, this.xAxis, locations, position, length, minorPerMajor, minorLength);
    return this.xTicks;
}

SVGPlot.prototype.addYTicks = function(locations /*='auto'*/, position /* ='left' */, length /* =2 */, 
                                         minorPerMajor /* = 4 */, minorLength /* =length/2 */) {
    this.yTicks = new SVGPlot.Ticks(this, this.yAxis, locations, position, length, minorPerMajor, minorLength);
    return this.yTicks;
}

SVGPlot.prototype.setXTicks = function(locations /*='auto'*/, position /* ='bottom' */, length /* =2 */, 
                                         minorPerMajor /* = 4 */, minorLength /* =length/2 */) {
    if (this.xTicks == null)
        this.xTicks = new SVGPlot.Ticks(this, this.xAxis, locations, position, length, minorPerMajor, minorLength)
    else
        this.xTicks.set(locations, position, length, minorPerMajor, minorLength)
}

SVGPlot.prototype.setYTicks = function(locations /*='auto'*/, position /* ='left' */, length /* =2 */, 
                                         minorPerMajor /* = 4 */, minorLength /* =length/2 */) {
    if (this.yTicks == null)
        this.yTicks = new SVGPlot.Ticks(this, this.yAxis, locations, position, length, minorPerMajor, minorLength)
    else
        this.yTicks.set(locations, position, length, minorPerMajor, minorLength)
}

SVGPlot.prototype.removeXTicks = function() {
    
}

SVGPlot.prototype.removeYTicks = function() {
    
}

// TickLabels

SVGPlot.TickLabels = function(svgPlot, parent,
                               locations /*='auto'*/, labels /* ='auto' */, position /* ='bottom' or 'left' */) {
    SVGPlot.genericConstructor(this, svgPlot, parent);
    parent.tickLabels.push(this)
    if (parent.type == 'x') {
        svgPlot.xTickLabels = this;
    }
    else if (parent.type == 'y') {
        svgPlot.yTickLabels = this;
    }
    this.set(locations, labels, position);
}
SVGPlot.inherit(SVGPlot.TickLabels, SVGPlot.AxisItem)

SVGPlot.TickLabels.prototype.set = function(locations /*='auto'*/, labels /* ='auto' */, position /* ='bottom' or 'left' */) {
    SVGPlot.AxisItem.prototype.set.call(this, locations, position);
    this.labels = SVGPlot.firstNonNull(labels, 'auto');
}

SVGPlot.TickLabels.prototype.getDefaultLabels = function(locations) {
    if (this.parent.type=='x')
        this._labels = this.parent.parent.xScale.defaultLabels(locations)
    else if (this.parent.type=='y')
        this._labels = this.parent.parent.yScale.defaultLabels(locations)
}

SVGPlot.prototype.addXTickLabels = function(locations /*='auto'*/, labels /* ='auto' */, position /* ='bottom' */) {
    this.xTickLabels = new SVGPlot.TickLabels(this, this.xAxis, locations, labels, position);
    return this.xTickLabels;
}

SVGPlot.prototype.addYTickLabels = function(locations /*='auto'*/, labels /* ='auto' */, position /* ='left' */) {
    this.yTickLabels = new SVGPlot.TickLabels(this, this.yAxis, locations, labels, position);
    return this.yTickLabels;
}

SVGPlot.prototype.setXTickLabels = function(locations /*='auto'*/, labels /* ='auto' */, position /* ='bottom' */) {
    if (this.xTickLabels == null)
        this.xTickLabels = new SVGPlot.TickLabels(this, this.xAxis, locations, labels, position)
    else
        this.xTickLabels.set(locations, labels, position)
}

SVGPlot.prototype.setYTickLabels = function(locations /*='auto'*/, labels /* ='auto' */, position /* ='left' */) {
    if (this.yTickLabels == null)
        this.yTickLabels = new SVGPlot.TickLabels(this, this.yAxis, locations, labels, position)
    else
        this.yTickLabels.set(locations, labels, position)
}

SVGPlot.prototype.removeXTickLabels = function() {
    
}

SVGPlot.prototype.removeYTickLabels = function() {
    
}


////////////////////////////
//  createElements(), layout(), and render()  functions for all graphic objects
////////////////////////////

SVGPlot.prototype.render = function () {
    /***
        This can be called many times recursively and will just set a flag.
        It ends when a render is complete and there are no pending requests.
    ***/
    //var suspend_id = this.svg.svgElement.suspendRedraw(100)
    this.layoutBoxes();
    /*
    if ( !this._rendering==true ) {
        this._rendering = true;
        do {
            this._renderAgain = false;
            this._doBoxLayout();
        } while (this._renderAgain == true) 
        this._rendering = false;
    }
    else {
        this._renderAgain = true;
    }
    */
    //this.svg.svgElement.unsuspendRedraw(suspend_id)
}

SVGPlot.prototype.layoutBoxes = function () {

    var width = parseFloat( this.svg.htmlElement.getAttribute('width') );
    var height = parseFloat( this.svg.htmlElement.getAttribute('height') );
    var across, down
    if (typeof(this.layout)!='undefined' && this.layout!=null) {
        var across = this.layout.across;
        var down = this.layout.down;
   }
    var i=0;
    var j=0;
    for (var n=0; n<this.boxes.length; n++) {
        /*
        // TODO Check this better. Different kinds of layout management.
        if ( boxes[n].layout != null && boxes[n].layout != null && boxes[n].layout != 'float') {
            this.boxes[n].x = i*width/across;
            this.boxes[n].y = j*height/down;
            this.boxes[n].width = width/across;
            this.boxes[n].height = height/down;
            i++;
            if (i == across) {
                i = 0;
                j++;
            }
        }
        */
        this.boxes[n].render();
    }
}

SVGPlot.Box.prototype.render = function () {
    /* x, y, width, and height must all be set */
    SVGPlot.createGroupIfNeeded(this, 'box', 'stroke');
    
    // Transform the box to the right place
    this.element.setAttribute('transform', 'translate('+this.x+','+this.y+')');
    // Add a clipping box (optional and not yet implimented) data shouldn't leak out (or should it?)
    
    
    // Set any auto-scales before we create any tickLabels. If the tickLabels are 'auto', they need to know the scale.
    for (var i=0; i<this.views.length; i++) {
        this.views[i].setAutoView();
        this.views[i].createElements();
    }
    
    //this.svgPlot.svg.svgElement.forceRedraw();  // So that all of the tickLabels have bounding boxes for the layout.  (doesn't work for inline SVG in firefox)
    
    var totalXSize = {'left':0, 'right':0, 'first_left':true, 'first_right':true};
    var totalYSize = {'top':0, 'bottom':0, 'first_top':true, 'first_bottom':true};
    
    for (var i=0; i<this.views.length; i++) {
        this.views[i].layout(totalXSize, totalYSize);
    }
    
    // Find the Plot Area bounds
    var top = totalYSize.top;
    var bottom = this.height-totalYSize.bottom;
    var left = totalXSize.left;
    var right = this.width-totalXSize.right;
    
    for (var i=0; i<this.views.length; i++) {
        this.views[i].render(left, right, top, bottom)
    }
}

SVGPlot.View.prototype.createElements = function() {
    SVGPlot.createGroupIfNeeded(this, 'view');
    
    for (var j=0; j<this.xAxes.length; j++) {
        this.xAxes[j].createElements();
    }
    for (var j=0; j<this.yAxes.length; j++) {
        this.yAxes[j].createElements();
    }
    for (var j=0; j<this.plots.length; j++) {
        this.plots[j].createElements();
    }
}

SVGPlot.Axis.prototype.createElements = function() {
    SVGPlot.createGroupIfNeeded(this, 'axis', 'stroke');
    
    for (var k=0; k<this.ticks.length; k++)
        this.ticks[k].createElements()
    for (var k=0; k<this.tickLabels.length; k++)
        this.tickLabels[k].createElements()
    for (var k=0; k<this.axisTitles.length; k++)
        this.axisTitles[k].createElements()
}


SVGPlot.Ticks.prototype.createElements = function() {
    SVGPlot.createGroupIfNeeded(this, 'ticks', 'stroke');
}

SVGPlot.TickLabels.prototype.createElements = function() {
    SVGPlot.createGroupIfNeeded(this, 'tickLabels', 'text');
    
    this._locations = this.locations;
    if (this.locations=='auto')
        this.getDefaultLocations('tickLabels');
    
    this._labels = this.labels
    if (this.labels=='auto')
        this.getDefaultLabels(this._locations);
    
    MochiKit.DOM.replaceChildNodes(this.element);
    this._texts = [];
    
    var p = this.svgPlot;
    p.save();
    /*  In case you want to set the position here rather than let the layout manager take care of it.
    if (this.position=='bottom' || this.position=='top')
        this.textAnchor = 'middle'
    else if (this.position=='left')
        this.textAnchor = 'start'
    else if (this.position=='right')
        this.textAnchor = 'end'
    */
    p.setGroup(this.element);
    for (var i=0; i<this._locations.length && i<this._labels.length; i++) {
        p.applyStyles = false;
        var text = p.text(this._labels[i]);
        this._texts.push(text);
    }
    p.restore();
}

SVGPlot.AxisTitle.prototype.createElements = function() {
    SVGPlot.createGroupIfNeeded(this, 'axisTitle', 'text');

    MochiKit.DOM.replaceChildNodes(this.element);

    var p = this.svgPlot;
    p.save();
    p.setGroup(this.element);
    if (this.position=='left')
        p.rotate(-Math.PI/2)
    else if (this.position=='right')
        p.rotate(Math.PI/2)
    p.applyStyles = false;
    this._text = p.text(this.text);
    p.restore();
}

SVGPlot.autoViewMarginFactor = 0.05;

SVGPlot.View.prototype.setAutoView = function() {
    this.xScale.setAuto();
    this.yScale.setAuto();
}

SVGPlot.View.prototype.bankTo45deg = function(/*[ { xextents:[xmin, xmax], 
                                                      yextents:[ymin, ymax], 
                                                      curve:[[x,y],[x,y]...] }, ...]*/) {
    /***
        For good perception of rates of change, you want the median line-segment to
        be banked at 45 degrees (prhaps weighted by the length of the segments.)
        
        The curve is given by an ordered list of x,y coordinates.
        
        If you're plotting multiple curves on one graph, or plotting curves in many 
        panels, the banking to 45deg should include the effects of all curves.
        Because different curves can have different min/max, this information must
        be passed in for each curve.
        
        @returns aspect ratio as a float.  This can be used to size the physical graph.
    ***/
}

SVGPlot.View.prototype.layout = function (totalXSize, totalYSize) {
    for (var i=0; i<this.xAxes.length; i++)
        this.xAxes[i].layout(totalXSize, totalYSize);
    for (var i=0; i<this.yAxes.length; i++)
        this.yAxes[i].layout(totalXSize, totalYSize);
}

SVGPlot.axisMargin = 1;  // between one axis and a second
SVGPlot.componentMargin = 1;  // between ticks, tickLabels, and axisLabels

SVGPlot.Axis.prototype.layout = function(totalXSize, totalYSize) {
    var offsets = {'above':0.5, 'below':0.5};  // TODO actually find line-width
    
    var components = [this.ticks, this.tickLabels, this.axisTitles];
    
    // Layout ticks, tickLabels, labels
    for (var i=0; i<components.length; i++) {
        var extents = {'above':0, 'below':0};
        for(var j=0; j<components[i].length; j++) {
            var component = components[i][j];
            var size = component.getSize(this.type);
            var position = component.position;
            var direction = (position=='top' || position=='left') ? -1 : 1
            if (position=='top' || position=='right') {
                component._offset = direction*offsets.above;
                extents.above = Math.max(extents.above, size+SVGPlot.componentMargin);
            }
            else if (position=='bottom' || position=='left') {
                component._offset = direction*offsets.below;
                extents.below = Math.max(extents.below, size+SVGPlot.componentMargin);
            }
        }
        offsets.above += extents.above;
        offsets.below += extents.below;
    }
    
    this._offset = 0;  // Signed-distance from the plot area, which we don't know yet.
    if (this.position=='bottom') {
        this._offset = totalYSize.bottom;
        if (totalYSize.first_bottom==false) {
            totalYSize.bottom += offsets.above + SVGPlot.axisMargin;
            this._offset += offsets.above + SVGPlot.axisMargin;
        }
        totalYSize.bottom += offsets.below + SVGPlot.axisMargin;
        totalYSize.first_bottom = false;
    }
    else if (this.position=='top') {
        this._offset = -totalYSize.top;
        if (totalYSize.first_top==false) {
            totalYSize.top += offsets.below + SVGPlot.axisMargin;
            this._offset -= offsets.below + SVGPlot.axisMargin;
        }
        totalYSize.top += offsets.above + SVGPlot.axisMargin;
        totalYSize.first_top = false;
    }
    else if (this.position=='left'){
        this._offset = -totalXSize.left;
        if (totalXSize.first_left==false) {
            totalXSize.left += offsets.above + SVGPlot.axisMargin;
            this._offset -= offsets.above + SVGPlot.axisMargin;
        }
        totalXSize.left += offsets.below + SVGPlot.axisMargin;
        totalXSize.first_left = false;
    }
    else if (this.position=='right'){
        this._offset = totalXSize.right;
        if (totalXSize.first_right==false) {
            totalXSize.right += offsets.below + SVGPlot.axisMargin;
            this._offset += offsets.below + SVGPlot.axisMargin;
        }
        totalXSize.right += offsets.above + SVGPlot.axisMargin;
        totalXSize.first_right = false;
    }
}


SVGPlot.Ticks.prototype.getSize = function(type) {
    return this.length;
}

SVGPlot.TickLabels.prototype.getSize = function(type) {
    return SVGPlot.getTextSize(this.element, type);
}

SVGPlot.AxisTitle.prototype.getSize = function(type) {
    return SVGPlot.getTextSize(this.element, type);
}

SVGPlot.getBBoxWidth = function(element) {
    // This is a workaround for the fact that getBBox doesn't work
    // in inline mode on Firefox.  TODO:  Find a better alternative
    if (element.nodeName == "text" && 
            (MochiKit.Base.isUndefinedOrNull(element.getAttribute("transform")) || 
            element.getAttribute("transform").indexOf("rotate")==-1) ) {
        return element.childNodes[0].length * SVGPlot.text_width;
    }
    
    var width = SVGPlot.text_width;
    if (element.nodeName == "g") {
        for (var i=0; i<element.childNodes.length; i++) {
            var child = element.childNodes[i];
            width = Math.max(width, SVGPlot.getBBoxWidth(child));
        }
        return width;
    }
    return width;
}

SVGPlot.getTextSize = function(element, type) {
    // Add up the space that tickLabels and labels take up, but only if they are not covering the graph.
    window.blah = element
    //var bbox = element.getBBox();  // Doesn't work for inline SVG in Firefox
    var bbox = {height:SVGPlot.text_height, width:SVGPlot.getBBoxWidth(element)};
    if (type=='x')
        return bbox.height;
    else if (type=='y')
        return bbox.width;
}

SVGPlot.View.prototype.render = function(left, right, top, bottom) {
    this._left = left;
    this._right = right;
    this._top = top;
    this._bottom = bottom;
    
    var width = right-left;
    var height = bottom-top;
    var xScale = this.xScale;
    var yScale = this.yScale;
    
    this.xtoi = function(x) {
        return width*xScale.position(x)
    }
    
    this.ytoj = function(y) {
        return height*(1.0-yScale.position(y))
    }
    
    /*
    function xtoi(xmin, yfactor, x) { return (x-xmin)*yfactor }
    this.xtoi = partial(xtoi, this.xScale._min, xfactor);
    function ytoj(ymin, yfactor, height, y) { return height - (y-ymin)*yfactor }
    this.ytoj = partial(ytoj, this.yScale._min, yfactor, this._height);
    */
    
    for (var i=0; i<this.xAxes.length; i++)
        this.xAxes[i].render(left, right, top, bottom);
    for (var i=0; i<this.yAxes.length; i++)
        this.yAxes[i].render(left, right, top, bottom);
    for (var i=0; i<this.plots.length; i++)
        this.plots[i].render(left, right, top, bottom);
}

SVGPlot.Axis.prototype.render = function(left, right, top, bottom) {
    var min, max, map;
    if (this.type=='x') {
        min = this.parent.xScale._min;
        max = this.parent.xScale._max;
        map = this.parent.xtoi;
    }
    else if (this.type=='y') {
        min = this.parent.yScale._min;
        max = this.parent.yScale._max;
        map = this.parent.ytoj;
    }
    
    // First position the axis as a whole with a transform on its group.
    var translate_x = 0;
    var translate_y = 0;
    if (this.position=='top') {
        translate_x = left;
        translate_y = top+this._offset;
    }
    else if (this.position=='bottom') {
        translate_x = left;
        translate_y = bottom+this._offset;
    }
    else if (this.position=='left') {
        translate_x = left+this._offset;
        translate_y = top;
    }
    else if (this.position=='right') {
        translate_x = right+this._offset;
        translate_y = top;
    }
    else {
        if (this.type=='x') {
            translate_x = left
            translate_y = top + this.parent.ytoj(this.position);
        }
        else if (this.type=='y') {
            translate_x = left + this.parent.xtoi(this.position)
            translate_y = top;
        }
    }
    this.element.setAttribute('transform', 'translate('+translate_x+', '+translate_y+')');

    
    // Just render it as if you start at the origin.  A transform has already been applied
    // Different namespace for calculated/default versus explicitly defined attributes.
    // TODO Something about the corners where the axes meet.
    // TODO Add in margins
    // TODO Grid lines
    // TODO Maybe move the ticks to along the zero-line rather than taking into account the axis thickness.

    
    // Render Axes
    var path;
    if (this.type=='x')
        path = 'M 0,0 h '+(right-left);
    else if (this.type=='y')
        path = 'M 0,'+(bottom-top)+' v '+(top-bottom);
    var pathElem = this.svgPlot.svg.PATH({'d': path, 'stroke-linecap': 'square'});
    // stroke-linecap:square so there is no corner cut out where two axes meet
    //MochiKit.DOM.replaceChildNodes(this.element);  // TODO Remove the paths.
    this.element.appendChild(pathElem);
    
    var components = [this.ticks, this.tickLabels, this.axisTitles];
    
    // Translate and then render ticks, tickLabels, axisTitles
    for (var i=0; i<components.length; i++) {
        for (var j=0; j<components[i].length; j++) {
            var offset = components[i][j]._offset;
            if (this.type=='x')
                components[i][j].element.setAttribute('transform', 'translate(0,'+offset+')');
            else if (this.type=='y')
                components[i][j].element.setAttribute('transform', 'translate('+offset+',0)');
            components[i][j].render(min, max, map);
        }
    }
}

SVGPlot.safemap = function(mapped_min, mapped_max, map, location) {
    /***
        Handles cases where lcoation is a percent "50%",
        where mapped_min and mapped_max are the same, etc.
    ***/
    var mapped = 0
    
    if (mapped_min==mapped_max)
        return mapped_min
        
    // Check if location is a percent
    if (typeof(location)=='string' && location[location.length-1] == '%')
        return mapped_min + parseFloat(location.substring(0, location.length-1)) / 100 * (mapped_max-mapped_min)
    else
        return map(location)
}

SVGPlot.inbounds = function(mapped_min, mapped_max, mapped) {
    // Do all of the comparisons in plot-coordinates rather than as raw data (eg. dates)
    // Check if location is within max and min (vertical axis gets mapped backward)
    // Used both in render() and renderText()
    return  mapped>=mapped_min && mapped<=mapped_max ||
             mapped<=mapped_min && mapped>=mapped_max
}

SVGPlot.Ticks.prototype.render = function(min, max, map) {
    SVGPlot.createGroupIfNeeded(this, 'ticks', 'stroke');
    
    this._locations = this.locations
    if (this.locations=='auto') {
        this.getDefaultLocations('ticks');
    }
    var locations = this._locations;
    var path = '';
    
    var mapped_min = map(min)
    var mapped_max = map(max)
    
    for (var k=0; k<locations.length; k++) {
        var mapped = SVGPlot.safemap(mapped_min, mapped_max, map, locations[k])
        if (SVGPlot.inbounds(mapped_min, mapped_max, mapped)) {
            if (this.position=='top')
                path += ' M '+map(locations[k])+' 0 '+'v '+(-this.length);
            else if (this.position=='bottom')
                path += ' M '+map(locations[k])+' 0 '+'v '+(this.length);
            else if (this.position=='right')
                path += ' M 0 '+map(locations[k])+'h '+(this.length);
            else if (this.position=='left')
                path += ' M 0 '+map(locations[k])+'h '+(-this.length);
        }
    }
    MochiKit.DOM.replaceChildNodes(this.element);
    this.element.appendChild( this.svgPlot.svg.PATH({'d':path}) );
}

SVGPlot.TickLabels.prototype.render = function(min, max, map) {
    SVGPlot.translateBottomText(this)
    for (var i=0; i<this._texts.length; i++) {
        //var bbox = this._texts[i].getBBox();  // Doesn't work for inline SVG in Firefox
        var bbox = {height:SVGPlot.text_height, width:SVGPlot.getBBoxWidth(this._texts[i])};
        SVGPlot.renderText(this._texts[i], this._locations[i], 
                             bbox, 
                             this.position, min, max, map)
    }
}

SVGPlot.AxisTitle.prototype.render = function(min, max, map) {
    SVGPlot.translateBottomText(this)
    // When rotation is applied to a <text>, the bounding box doens't change.
    // It does, however, change for any group that contains it.
    //var bbox = this._text.parentNode.getBBox();  // Doesn't work for inline SVG in Firefox
    bbox = {height:SVGPlot.text_height, width:SVGPlot.getBBoxWidth(this._text.parentNode)};
    SVGPlot.renderText(this._text, this.location, 
                             bbox, 
                             this.position, min, max, map)
}

SVGPlot.translateBottomText = function(component) {
    if (component.position=='bottom') {
        //var bbox = component.element.getBBox();  // Doesn't work for inline SVG in Firefox
        var bbox = {height:SVGPlot.text_height, width:SVGPlot.getBBoxWidth(component.element)};
        var transform = component.element.getAttribute('transform');
        transform += 'translate(0,'+(bbox.height-1)+')'
        component.element.setAttribute('transform', transform);
    }
}

SVGPlot.renderText = function (text, location, bbox, position, min, max, map) {
    /***
        Render the stubs and axis titles
        TODO:  Y-Axis titles that are rotated do not get centered properly any more
    ***/
    
    var mapped_min = map(min)
    var mapped_max = map(max)
    var mapped = SVGPlot.safemap(mapped_min, mapped_max, map, location)
    
    // Check if location is off the edge (vertical axis gets mapped backward)
    if (SVGPlot.inbounds(mapped_min, mapped_max, mapped))
        text.removeAttribute('display');
    else
        text.setAttribute('display', 'none');
        
    var transform = text.getAttribute('transform');
    if (typeof(transform)=='undefined' || transform == null)
        transform = '';
    //var bbox = text.getBBox(); //{'x':0, 'y':0, 'width':10, 'height':10};
    
    var textanchor = 'middle'
    
    var rotated = transform.indexOf('rotate') >= 0
    if (position=='right' && !rotated)
        textanchor = 'start'
    else if (position=='left' && !rotated)
        textanchor = 'end'
    
    //log('bbox.height', bbox.height)
    /* TODO Since only height of text matters, really all we 
            need is the font size, not the bounding box
            This is true here, but when you have long labels 
            on the left side, elsewhere you need to have their 
            bbox so you can move the axis title over
    */
    var vertical_shift = rotated ? 0 : bbox.height/2
    
    if (position=='top')
        transform = 'translate('+(mapped)+', 0)' + transform
    else if (position=='bottom')
        transform = 'translate('+(mapped)+', 0)' + transform
    else if (position=='right')
        transform = 'translate(0, '+(mapped+vertical_shift)+')' + transform
    else if (position=='left')
        transform = 'translate(0, '+(mapped+vertical_shift)+')' + transform
        
    text.setAttribute('transform', transform)
    text.setAttribute('text-anchor', textanchor)
}


////////////////////////////
//  plot commands
////////////////////////////

SVGPlot.prototype.plot = function() {
    /***
        Does the right thing depending on the data passed
        If there's no plot, assume 
        (y1) to be plotted against integers for one argument
        and (x, y1, y2, ...) for more than one argument.
        If there is already a plot, should we assume 
        (x2, y3, y4) again, or assume (y3, y4, y5...)?
        
        Does this take object of lists AND list of objects?
        
        Does it take an optional final parameter that is a mapping to override
        the current settings?
    ***/
    if ( typeof(arguments[0]) == 'string')  // if passed 'sin(x)'
        return this.plotFunction.apply(this, arguments)
    else if ( typeof(arguments[0].length) == 'number')  // If passed an array
        return this.plotLine.apply(this, arguments)
}

SVGPlot.prototype.logplot = function() {
    var plot = this.plot.apply(this, arguments)
    this.yScale.interpolation = 'log'
    return plot
}

SVGPlot.prototype.loglogplot = function() {
    var plot = this.plot.apply(this, arguments)
    this.xScale.interpolation = 'log'
    this.yScale.interpolation = 'log'
    return plot
}


////////////////////////////
//  Line Plot
////////////////////////////


// TODO: Determine the type of data and create scales appropriatly here, not before.

SVGPlot.prototype.plotLine = function(data /* ydata1, ydata2, ... */) {

    if (arguments.length==1) {
        // If only one argument given, treat it as a y array and plot it against the integers.
        var xdata = new Array(data.length);  // ydata = data;
        for (var i=0; i<data.length; i++)
            xdata[i] = i;
        this.plotLine(xdata, data);  // Call myself again with two arguments this time.
    }
    
    var isUndefinedOrNull = MochiKit.Base.isUndefinedOrNull
    
    if ( isUndefinedOrNull(this.box) || isUndefinedOrNull(this.view) ) {
        this.addBox();
        this.box.addDefaults();
    }
    
    for (var i=1; i<arguments.length; i++)
        this.plot = new SVGPlot.LinePlot(this, this.view, data, arguments[i], 'linear');
    return this.plot;  // Return the last line plot.  Not of much use, really.
}


SVGPlot.prototype.plotSteps = function(data /* ydata1, ydata2, ... */) {
    /*** Like plotLine, but this creates new LinePlot with 'steps' as an argument ***/
    if (arguments.length==1) {
        // If only one argument given, treat it as a y array and plot it against the integers.
        var xdata = new Array(data.length);  // ydata = data;
        for (var i=0; i<data.length; i++)
            xdata[i] = i;
        this.plotSteps(xdata, data);  // Call myself again with two arguments this time.
    }
    
   var isUndefinedOrNull = MochiKit.Base.isUndefinedOrNull
   
    if ( isUndefinedOrNull(this.box) || isUndefinedOrNull(this.view) ) {
        this.addBox();
        this.box.addDefaults();
    }
    
    for (var i=1; i<arguments.length; i++)
        this.plot = new SVGPlot.LinePlot(this, this.view, data, arguments[i], 'steps');
    return this.plot;  // Return the last line plot.  Not of much use, really.
}

SVGPlot.LinePlot = function(svgPlot, parent, xdata, ydata, style /* = 'linear' */) {
    if ( MochiKit.Base.isUndefinedOrNull(style) ) {
       style = 'linear';
    }
    this.lineStyle = style;
    //log('LinePlot constructor: '+this.lineStyle)
    
    SVGPlot.genericConstructor(this, svgPlot, parent);
    var view = parent
    view.plots.push(this)  // Add this plot to the view
    this.xdata = xdata;
    this.ydata = ydata;
    
    // Add this data to the x and y scales for autoScaling
    
    var xScaleNew = SVGPlot.newScaleFromType(xdata[0])
    if (view.xScale.type != xScaleNew.type) {
        view.xScale = xScaleNew
        svgPlot.xScale = xScaleNew
    }
    view.xScale.dataSets.push(xdata)
    
    var yScaleNew = SVGPlot.newScaleFromType(ydata[0])
    if (view.yScale.type != yScaleNew.type) {
        view.yScale = yScaleNew
        svgPlot.yScale = yScaleNew
    }
    view.yScale.dataSets.push(ydata)
}

SVGPlot.LinePlot.prototype.createElements = function () {
    var p = this.svgPlot;
    var type = 'both';
    //if (p.strokeStyle!=null && p.fillStyle!=null)
    if (p.fillStyle==null)
       type = 'stroke'
    if (p.strokeStyle==null)
       type = 'fill'
    //SVGPlot.createGroupIfNeeded(this, 'line-plot', 'stroke');
    SVGPlot.createGroupIfNeeded(this, 'line-plot', type);
}

SVGPlot.LinePlot.prototype.render = function(left, right, top, bottom) {
    MochiKit.DOM.replaceChildNodes(this.element);
    
    var p = this.svgPlot;
    
    p.save();
    p.applyStyles = false;  // Let the group styles inherit
    p.setGroup(this.element);
    //var rect = this.getDatasetRect();
    p.clipRect(left, top, right-left, bottom-top);
    //this.translate(rect.x, rect.y);
    //plotDataset.plot();
    
    // Should really loop through and draw only one point off of each side if it exists?
    // Maybe not becuase you can plot arbitrary loopy xy sets and make 
    // crazy lines which can exit and enter, so SVG should have all points.
    p.translate(left, top);
    p.beginPath();
    // Handle infinite and NaN properly.
    var drawingFunction = p.moveTo;
    // TODO Handle cases where the plot goes WAY off the  scales.
    var legal = function(s) {
       return (!isNaN(s) && s!=Number.MAX_VALUE && s!=Number.MIN_VALUE &&
                s!=Number.NEGATIVE_INFINITY && s!=Number.POSITIVE_INFINITY)
    }
    for (i=0; i<this.ydata.length; i++) {
        var sx = this.parent.xtoi(this.xdata[i]);
        var sy = this.parent.ytoj(this.ydata[i]);
        if  ( legal(sx) && legal(sy) ) {
            //log("Plotting point ("+sx+","+sy+")  "+this.lineStyle);
            if (this.lineStyle=='steps' && i==0) {
                // very first step need to start at the horizontal axis
                drawingFunction.call(p, sx, this.parent.ytoj(0.0));
                drawingFunction = p.lineTo;
            }
            drawingFunction.call(p, sx, sy);
            drawingFunction = p.lineTo;
            if (this.lineStyle=='steps') {
                // extra call to drawingFunction to march right to next data point
                var last_point = (i == this.xdata.length-1);
                var dxnext =  last_point ? 
                     this.xdata[i]+(this.xdata[i]-this.xdata[i-1]) :  // last point needs a box of some non-zero width
                     this.xdata[i+1]; // normal case; 
                var sxnext = this.parent.xtoi(dxnext);
                //log("Plotting steps ("+sxnext+","+sy+")");
                drawingFunction.call(p, sxnext, sy);
                if (last_point) {
                  drawingFunction.call(p, sxnext, this.parent.ytoj(0.0));  // End last box at the horizontal axis
                }
            }
        }
    }
    var plot = p.stroke();
    // Add our own stuff to the attributes produced.
    
    p.restore();
    return plot;
}

SVGPlot.prototype.plotFunction = function(func, name, xmin, xmax) {
    var POINT_COUNT = 40;
    var xdata = Array(POINT_COUNT);
    var ydata = Array(POINT_COUNT);
    var begin_eval_str = "var "+name+" = ";
    var end_eval_str = "; "+func;
    for (var i=0; i<POINT_COUNT; i++) {
        x = xmin + (xmax-xmin)*i/POINT_COUNT;
        xdata[i] = x;
        ydata[i] = eval(begin_eval_str + x + end_eval_str);  // This is slow, but eval.call(context, func) gives error in FF3 
    }
    //log("Calling plotLine with data");
    return this.plotLine(xdata, ydata);
    // Maybe this should be in a <plotFunction> <plotLine/> <plotFunction>
}


// ScatterPlot

SVGPlot.prototype.plotScatter1D = function(data) {
    var isUndefinedOrNull = MochiKit.Base.isUndefinedOrNull
    
    if ( isUndefinedOrNull(this.box) || isUndefinedOrNull(this.view) ) {
        this.addBox();
        this.box.addDefaults();
        this.box.view.removeYAxis();
    }
    
    this.plot = new SVGPlot.ScatterPlot1D(this, this.view, data);
}

SVGPlot.ScatterPlot1D = function(svgPlot, parent, data) {
    SVGPlot.genericConstructor(this, svgPlot, parent);
    parent.plots.push(this)  // Add this plot to the view
    this.data = data;
    // Add this data to the x and y scales for autoScaling
    parent.xScale.dataSets.push(data)
    parent.yScale.dataSets.push([0]*data.length)
}

SVGPlot.ScatterPlot1D.prototype.createElements = function () {
    SVGPlot.createGroupIfNeeded(this, 'scatter1D-plot', 'stroke');
}

SVGPlot.ScatterPlot1D.prototype.render = function(left, right, top, bottom) {
    // Should this be treated exactly like 2D scatter plot with all y-values zero?
    
    // Deal with degeneracies (bigger symbol, stacked symbols?)
    // Plot points on axis
}


SVGPlot.prototype.plotScatter = function(xdata, ydata, plotFunctionOrOptions) {
}

// scatterplot(xdata, ydata, f)
// scatterplot(xdata, ydata, {color:'red', size:3, shape:'triangle'})
// scatterplot(xdata, ydata, {hue:0.3, saturation:0.5, brightness:0.7, size:3, shape:'triangle'})
// scatterplot(xdata, ydata, {red:0.5, green:0.5, blue:0.5, alpha:0.5, size:3, shape:'triangle'})

SVGPlot.prototype.plotScatterStyle = function(xdata, ydata /* val1, val2, val3 */) {
}

// Color Functions

/*
    If you passed plotLine(x, y, p, q) for each point the
    color function gets passed colorFunction([x, xin, xmax], [y, ymin, ymax],
                                             [p, pmin, pmax], [q, qmin, qmax])
    and it has to return an [r, g, b, a] value.  For line plots and area plots,
    a gradient is constructed from the color functions.  For scatterPlots and columns
    and stuff, 
*/

SVGPlot.prototype.colorCycle = function(colorList) {
}

SVGPlot.prototype.colorDarken = function() {
}


// Marker Fnuctions
/*
    This allows you do draw things like error bars, set colors, draw
    funny shapes, draw whiskers that point in a given direction.
*/

SVGPlot.prototype.markerShapeCycle = function(shapeList) {
}

SVGPlot.prototype.markerSize = function() {
}

SVGPlot.prototype.markerColor = function() {
}



////////////////////////////
// Shapes, all unit area
////////////////////////////

// Does unit perimeter matter more perceptually when stroked rather than filled?
// These functions don't stroke or fill, just create the path
// They can be passed as shape functions
// Drawing functions need to be stroked and/or filled and can affect the style.

SVGPlot.prototype.shapeFunctions = {
    circle : function() {
    },
    square : function() {
        // Same as SVGCanvas.prototype.pollygon(4, 1)
        this.beginPath()
        this.moveTo( 0.5,  0.5)
        this.lineTo( 0,5, -0.5)
        this.lineTo(-0,5, -0.5)
        this.lineTo(-0,5,  0.5)
        this.closePath();
    },
    triangle : function() {
    },
    diamond : function() {
        this.save()
        this.rotate(45)
        this.square()
        this.restore()
    }
    // Should have polygons up to n=3, 4, 5, 6, 8
    // Stars n=4, 5, 6, 8
    // Asterisks, pluses, and crosses? Can only be stroked, unless thickened.
}

SVGPlot.prototype.strokeFunctions = {}
SVGPlot.prototype.fillFunctions = {}
SVGPlot.prototype.drawFunctions = {}
// Add wrappers arond the shape functions to stroke and/or fill
// Can add half-filled, diagonally-filled, plused, and crossed shapes




////////////////////////////
// Utility Functions
////////////////////////////



SVGPlot.add = function (self, child, array, Name) {
    /***
        used all over the place to add elements to arrays and svg elements before or after other
        custom processing.
        
        @param child -- If this is a string, treat it as the name of a constructor.
    ***/
    if (typeof(child)=='string')
        child = new SVGPlot[child]();
    array.push(child);
    if (typeof(Name) != 'undefined' && Name != null)
        self.svgPlot[Name] = object;
    self.element.appendChild(child.element);
}

SVGPlot.remove = function(self, child, array, Name) {
    if (typeof(child) == 'undefined' || child == null)
        child = self[Name];
    
    // Remove its element from the DOM tree
    self.element.removeChild(child.element);
    // Remove it from the JS array since JS doen't have array.remove(object)
    for(var i=0; i<array.length; i++) {
        if (array[i]==object) {
            array[i] = array[array.length-1];  // Move it to the end
            array.length--;  // Delete it.
        }
    }
    if (Name!='undefined' && Name!=null && self[Name] == child) {
        self.svgPlot[Name] = (array.length>0) ? array[array.length-1] : null;  // Set  to the last item or null
    }
    return child;
}

SVGPlot.firstNonNull = function() {
    for (var i=0; i<arguments.length; i++)
        if ( typeof(arguments[i])!='undefined' && arguments[i]!=null )
            return arguments[i]
    return null;
}

SVGPlot.prettyNumber = function(number) {
    /***
        tests:
        p.prettyNumber(3.000000000000001)
        p.prettyNumber(0.39999999999999997)
        p.prettyNumber(3.9999999999999997)
        p.prettyNumber(.9999999999999997)
    ***/
    var str = ''+number;
    if (str.length > 15) {  // TODO check for exponential
        // Chop off the last digit
        var loc = str.length-2;
        if (str[loc] == '0') {
            while (str[loc] == '0')
                loc--;
            if (str[loc]=='.')
                return str.slice(0, loc);
            return str.slice(0, loc+1);
        }
        if (str[loc]  == '9') {
            while (str[loc] == '9')
                loc--;
            var last = str[loc];
            if (last == '.') {
                loc--
                last = str[loc];
            }
            return str.slice(0,loc)+(parseInt(last)+1)
        }
    }
    return str;
}

SVGPlot.arrayToString = function(array, seperator /* =' '*/) {
    /***
    Turns [1,2,3] into '1 2 3' for the seperator being a space (the default)
    ***/
    seperator = this.firstNonNull(seperator, ' ')
    var str = '';
    for (var i=0; i<array.length; i++) {
        if (typeof(array[i]) == 'number' || typeof(array[i]) == 'string') {
            if (i!=0)
                str += seperator;
            str += array[i];
        }
    }
    return str;
}

SVGPlot.createGroupIfNeeded = function(self, cmd, style_type /* 'stroke' 'fill' 'both' or 'text' */) {
    if (self.element == null) {
        self.element = self.svgPlot.svg.G();
    }
    self.parent.element.appendChild(self.element);
    
    SVGPlot.setPlotAttributes(self, cmd);
    
    if (typeof(style_type)=='string')
        SVGPlot.setStyleAttributes(self, style_type);  // 'stroke' 'fill' or 'text
}



SVGPlot.setPlotAttributes = function(self, cmd) {
    var plotNS = SVGPlot.plotNS
    // Set the command property
    self.element.setAttributeNS(plotNS, 'cmd', cmd)
    var id = self.svgPlot.svg.createUniqueID(cmd)
    self.element.setAttribute('id', id)   
    
    // Set all of the string, number, and arrays -- Store the data in the SVG DOM
    var members = keys(self)
    for (var i=0; i<members.length; i++) {
        if (members[i][0] != '_' && self[members[i]] != null && typeof(self[members[i]])!='undefined' ) {
            if (typeof(self[members[i]]) == 'number' || typeof(self[members[i]]) == 'string')
                self.element.setAttributeNS(plotNS, members[i], self[members[i]])
            else if ( typeof(self[members[i]].length) != 'undefined' && typeof(self[members[i]].length) != null ) {
                // It's an array, so concatinate all of its elements togetner in a big string.
                var str = SVGPlot.arrayToString(self[members[i]])
                if (str != '') {
                    self.element.setAttributeNS(plotNS, members[i], str)
                }
            }
        }
    }
}

SVGPlot.setStyleAttributes = function(self, style_type /* 'stroke' 'fill' 'both' or 'text' */) {
    var p = self.svgPlot
    var backupStyle = p.getStyle();
    p.setStyle(self.style);
    
    if (style_type=='text') {
        p._setFontAttributes(self.element);
        style_type = 'fill'
    }
    p._setGraphicsAttributes(self.element, style_type);
    
    p.setStyle(backupStyle);
}




////////////////////////////
// Plot Data
////////////////////////////


SVGPlot.prototype.listToObject = function(list) {
    /***
        Converts SQL/JSON style data of the form "list of objects":
        [{x:7, y:3, a:6}, {x:4, y:2, a:9}, ...]
        
        Into array style data "object of lists":
        { x:[7, 4, ...], 
          y:[3, 2, ...],
          a:[6, 9, ...] }
    ***/
    // Should there be any checking of consistency: 
    // each row having exactly the same fields?
    var object = {}
    forEach(list, function(row) {
        for (key in row) {
            if (object[key] == null)  // object doens't array of this name yet
                object[key] = []
            object[key].push(row[key])
        }
    })
    return object
}



SVGPlot.prototype.transpose = function(table) {
    /***
        Transposes the rows and columns of a table.
        Useful after you read in CSV data and want columns to plot
        
        transpose([[1,2],[3,4],[5,6]]) => [[1,3,5],[2,4,6]]
    ***/
    var result = []
    forEach(table, function(row) {
        for (var i=0; i<row.length; i++) {
            if (i >= result.length)
                result.push([])
            result[i].push(row[i])
        }
    })
    return result
}


/***
    The following work for array style data of the form:
    { x:[7, 4, ...], 
      y:[3, 2, ...],
      a:[6, 9, ...] }
***/

SVGPlot.prototype.maxmin = function(data, max, min) {
    for (key in data) {
        min[key] = reduce(Math.min, data[key]);
        max[key] = reduce(Math.max, data[key]);
    }
}

/***
    The following work for SQL/JSON style data of the form:
    [{x:7, y:3, a:6}, {x:4, y:2, a:9}, ...]
***/

SVGPlot.prototype.maxmin = function(data, max, min) {
    /***
    
        Call this with:
            var max = {}
            var min = {}
            maxmin(data, max, min);
        It will fill in max and min.
        If data is empty, max and min are unchanged.
    ***/
    //reduce(max_fn, data)
    forEach(data, function(raw_row) {
        row = this.evaluate_row(MochiKit.Base.clone(raw_row));
        foreach(key in keys, function(key) {
            if (MochiKit.Base.isUndefinedOrNull(max[key]) || row[key]>max[key])
                max[key] = row[key];
            if (MochiKit.Base.isUndefinedOrNull(min[key]) || row[key]<mix[key])
                min[key] = row[key];
        })
    })
}

/* Some spreadsheet-like functions to evaluate a row where
   some of the items are functions.  */
SVGPlot.prototype.evaluate_table = function(raw_table) {
    return applymap(this.evaluate_row, raw_table);
}

SVGPlot.prototype.evaluate_row = function(raw_row) {
    var row = MochiKit.Base.clone(raw_row)
    for(key in row) {
        if (typeof(row[key])=='function') {
            this.evaluate_item(row, key)
        }
    }
    return row;
}

SVGPlot.prototype.evaluate_item = function(row, key) {
    if(MochiKit.Base.isUndefinedOrNull(row['__circular_check__'])) {
        row['__circular_check__']= {}
    }
    if (!MochiKit.Base.isUndefinedOrNull(row['__circular_check__'][key])) {
        throw "Circular reference in "+row+" for item "+key;
    }
    else {
        row['__circular_check__'][key] = 1;
        row[key] = row[key].call(this, row);  // Each function needs to call evaluate_item()
        row['__circular_check__'][key] = null;
    }
}

////////////////////////////
//  Drawer / Mapper / Renderer / DrawingFunction
////////////////////////////

/***
    The concept behind the mapper is that sometimes you want to write a
    funcion that takes a row of data {x:1, y:2, a:3, b:4, c:'bob'} and draws
    a point on the graph -- you want complete control of the color, shape, and size
    as some complicated function of each row's elements.
    
    Other times you want a simple interface that says, "get (x,y) position
    from the x and y fields, map a to the shape, b to the color, and have a constant size,
    and finally stick a label on each point given by c.
    
    There can be combinations too where you want to write your own function
    to calculate the color based on some combination of the elements,
    but you want the shape to be determined by parameter a and the color
    to be the next constant color in line.
    
    What's the best way to do this so the interface is simple and intuitive for
    everybody?
    
    You want to set these things to one of three things: a constant, a function, or a field name.
    How to distinguish between constants that are strings and field names that are too?
    
    Each variable must keep a scale to map between inputs and outputs.  Maybe sometimes
    you want the color to be mapped logarithmically, but you still don't want to write a custom function.
    
    pm = new PointMapper()
    pm.position = ['x', 'y']
    // pm.x = 'x'; pm.y = 'y'
    pm.shape = 'square'
    pm.color = function(row, max, min) {
        var a = row['a']
        var b = row['b']
        var mag = Math.sqrt(a*a+b*b)
        var phase = Math.atan2(b,a)
        retrurn hsv(pase, mag, 1.0)
    }
    p.scatterPlot(dataset, pm)
    
    // Alternative way to go:
    var cmap = map('c')
    scatterplot(datasource1, {x:'x', y,'y', shape:'square',   fill_lightness:cmap})
    scatterplot(datasource2, {x:'x', y,'y', shape:'triangle', fill_lightness:cmap})
    //lineplot, areaplot, barplot, ...

    // Discrete variables are easy: just pass in a selector and an explicit map
    var shapemap = {1:'circle', 2:'square', 3: 'triangle'}
    scatterplot(datasource, {x:'x', y,'y', shape:['s', shapemap], fill_color:'black'})
    
    // Should we use this trick with continuous things?
    scatterplot(datasource, {x:'x', y,'y',  fill_color:['c', rainbow]})
    
    If no map is given, check the datatype and construct a map of the appropriate type
    going from the data to the appropriate type of thing (position, color, shape, etc.)
    
    Before the plot is rendered, this will find the max/min of the datasources
    and add them to the map.  They share a color map.

    map(name, explicit_min, explicit_max)
        returns a function that takes the current row, row of mins, row of maxs
    function(row, max, min)
        which returns a number from 0.0 to 1.0 (unless it is out of range of explicit min/max.)
        
        
    
    Plot Dataset (xoffset, yoffset) -- a checkbox for each of these:
    * Markers (shape, size, fillStyle, strokeStyle, thickness) (marker only every n'th)
    * Line (gaps - do you stop and restart the plot?)
    * Sticks (to another dataset?) (+- different positive/negative colors)
    * Area/Fill (to another dataset?) (+-) (strokeStyle, fillStyle, fill pattern, option for "same style, but 25% or 50% lighter)
    * Bars/Cityscape (to another dataset?) (fill options like above)
    * Error bars for X and Y: None, percent of base, sqrt of base, constant, + & - come from another dataset
    - box-and-whisker candlesticks
    - hi-low-open-close
***/
/*
Trace() // A plotted dataset which caries a pointer to the dataset and a lot of options
Trace.prototype = {

    rows : dataset,
    max : max(dataset),
    min: min(dataset),
    
    drawDataset : function() {
        drawBars()
        drawArea()
        drawSticks()
        drawLine()
        var n = 1 // Draw every nth marker
        for (var i=0; i<rows.length; i += n) {
            drawMarker(row)
        }
    },

    drawMarker : function(row) {
        var group
        var style // fill, stroke, thickness, etc
        var size = getParam('size', row)
        var shape
        var rotation
        var plot_coords = mapToXY(row)
        var svg_copords = mapToIJ(plot_coords)
        moveTo(coords.x, coords.y)
    },
    
    getParam : function(object, field, row) {
        var value = object[field]
        if (value == null)
            return defaultValue
        if (typeof(value) == 'number')
            return value
        if (typeof(value) == 'string')
            return value  // Or should we check to see if this is referring to a column name?
        if (typeof(value) == 'function')
            return value(row, this.min, this.max)
        if (typeof(value) == 'object')
            return some_sort_of_mapping
    }
}
*/

SVGPlot.PointMapper = function() {
}


SVGPlot.PositionMapper = function() {
    /*** Maps data to x,y location (handles percents and other specials?)
         common for points, lines, areas, & bars ****/
}

SVGPlot.PositionMapper.prototype = {
    position: function(row, max, min) {},
    x: 'x',
    y: 'y',
}

SVGPlot.PanelMapper = function() {
}
SVGPlot.PanelMapper.prototype = {
    panel: function(row, max, min) {},
}

SVGPlot.PointMapper.prototype = {
    draw: function(row, max, min) {},
    rotation: null,
    size: null,
    aspect_ratio: null,
    
    shape: function(row, max, min) {},  // returns 'square' or draws a square?
    shape_cycle: false,  // Each plot gets its own shape
    shape_indexed: null, // The column that indexes the shapes
    shape_index: {'s':'square', 'c':'circle'},
    
    fill_rgba : function(row, max, min) {},
    fill_alpha: function(row, max, min) {},
    fill_color: function(row, max, min) {},
    fill_color_cycle: false,
    fill_color_indexed: null,
    fill_color_index: {'r': 'red', 'g':'green'},
    fill_rgb: function(row, max, min) {},
    fill_red: null,
    fill_green: null,
    fill_blue: null,
    fill_red_green: null,
    fill_yellow_blue: null,
    fill_black_white: null,
    fill_color_scale: null,  // Temperature map, height map, etc.
    fill_color_scale2d: null,  // (red, blue), (hue, saturation) or (red_green, yellow_blue)
    fill_hue: null,
    fill_saturation: null,
    fill_value: null,  // cone
    fill_lightness: null,  // double cone (also called brightness)
    
    stroke_rgba : function(row, max, min) {},  // "rgba(100, 0, 200, .5)"
    stroke_alpha: function(row, max, min) {},  // number 0.0 to 1.0
    stroke_color: function(row, max, min) {},  // "rgb(100, 0, 200)"
    stroke_color_cycle: false,
    stroke_color_indexed: null,
    stroke_color_index: {'r': 'red', 'g':'green'},
    stroke_rgb: function(row, max, min) {},
    stroke_red: null,
    stroke_green: null,
    stroke_blue: null,
    stroke_red_green: null,
    stroke_yellow_blue: null,
    stroke_black_white: null,
    stroke_color_scale: null,  // Temp map, height map, etc.
    stroke_hue: null,
    stroke_saturation: null,
    stroke_value: null,  // cone
    stroke_lightness: null,  // double cone (also called brightness)
    
    //'lineCap': "butt", // also "round" and "square"
    //'lineJoin': "miter", // also "round" and "bevel"
    //'lineWidth': 1.0, // surrounds the center of the path
    //'miterLimit': null, 
    //'dasharray' : null,  // a string list "1,2" to make strokes dashed
    //'dashoffset' : null, // a number like 3 which specifies how to start the dashing
}


SVGPlot.LineMapper = function() {
}
// Thickness and dashing are included along with join-type: angle, smooth, etc.

SVGPlot.ShadingMapper = function() {
}
// Shade to where?  x-axis, y-axis, another plot?

SVGPlot.LabelMapper = function() {
}
// rgba, font, size, position, orientation

SVGPlot.BarMapper = function() {
}
// stroke, fill, width_percent, location, horizontal/vertical, 


// Utility functions for maps

SVGPlot.clamp = function(value, min /* =0.0 */, max /* =1.0 */) {
    /***
        Many maps (e.g. color) require inputs be locked between 0.0 and 1.0,
        so data that's out of range has to be clamped between those values.
    ***/
    min = SVGKit.firstNonNull(min, 0.0)
    max = SVGKit.firstNonNull(max, 1.0)
    if (value <= min )
        return min
    if (value >= max)
        return max
    return value
}

SVGPlot.to255 = function(value) {
    /***
        Color components need to be integers between 0 and 255.
        This takes a real number, clamps it between 0.0 and 1.0,
        then returns an integer between 0 and 255
    ***/
    return Math.round(SVGPlot.clamp(value)*255.0)
}


////////////////////////////
//  Override SVGCanvas to use Plot Coordinates
////////////////////////////

/*
SVGPlot.map_xtoi = function(x) {
    if (this.plotView && typeof(x) != 'undefined' && x != null)
        return this.xtoi(x);
    return x;
}
SVGPlot.map_ytoj = function(y) {
    if (this.plotView && typeof(y) != 'undefined' && y != null)
        return this.ytoj(y);
    return y;
}
SVGPlot.map_width = function(width) {
    if (this.plotView && typeof(width) != 'undefined' && width != null)
        return Math.abs(this.xtoi(width) - this.xtoi(0))
    return width;
}
SVGPlot.map_height = function(height) {
    if (this.plotView && typeof(height) != 'undefined' && height != null)
        return Math.abs(this.ytoj(height) - this.ytoj(0))
    return height;
}
SVGPlot.map_radius = function(radius) {
}
*/
/*
SVGPlot.prototype.translate = function(tx, ty) {}
SVGPlot.prototype.moveTo = function(x, y) {}
SVGPlot.prototype.lineTo = function(x, y) {}
SVGPlot.prototype.quadraticCurveTo = function (cpx, cpy, x, y) {}
SVGPlot.prototype.bezierCurveTo = function (cp1x, cp1y, cp2x, cp2y, x, y) {}
SVGPlot.prototype.rect = function (x, y, w, h) {}
SVGPlot.prototype.arcTo = function (x1, y1, x2, y2, radius) {}
SVGPlot.prototype.arc = function (x, y, radius, startAngle, endAngle, anticlockwise) {}
SVGPlot.prototype.clip = function (x, y, width, height) {}
SVGPlot.prototype.clipRect = function(x, y, w, h) {}
SVGPlot.prototype.strokeRect = function (x, y, w, h) {}
SVGPlot.prototype.fillRect = function (x, y, w, h) {}
SVGPlot.prototype.clearRect = function (x, y, w, h) {}
SVGPlot.prototype.text = function(text, x , y) {}
SVGPlot.prototype.createLinearGradient = function (x0, y0, x1, y1) {}
SVGPlot.prototype.createRadialGradient = function (x0, y0, r0, x1, y1, r1) {}
SVGPlot.prototype.drawImage = function (image, sx, sy, sw, sh, dx, dy, dw, dh) {}
*/


// set add delete replace actions

// plotLine(xdata, ydata)  // If xdata is the same as  overlay, adds ydata to it.  Otherwise creates new overlay.
// plotLine(ydata)  // Uses  xdata in overlay or automatically creates (0,1,2,3,...) or (1,2,3,4,...)
// plotSmooth(ydata)
// plotStock(data)
// plotBoxAndWhisker()  // Zeba's statistical (min, 25%, median, 75%, max) Good instead of 100 histograms.
// plotStackedArea()
// plotPercentageArea()
// plotClusteredBar()  // Different categories are next to each other
// plotStackedBar()
// plotPercentBar()
// plotClusteredColumn()
// plotStackedColumn()
// plotPercentColumn()
// plotHistogram(data, bins)
// plotFunction(func, x, min, max)  // defines sin, cos, etc in context and does eval()
// plotScatter(datax, datay)  // dots proportional to size, dots with error bars in y and/or x, dots with error areas.
// plotPie(data, /* optional labels */)
// plotPolar()  // similar implimentation to plotPie
// plotParametric()

// independent vertical scales on same plot for different types of data overlayed
// that have the same x-axis.  Dependent scales like foot and meter.

// Be able to set defaults for all plots.
// defaultColor = 'auto-increment'
// defaultXAxis = 'auto'

// At any point be able to print out your "context" -- the path into the tree where you're working.

// 
// addColorFunction() // for complex plots and such.
// setColor()
// setDashes(a, b, c, ...)  // List the stroke-dasharray explicitly 
// setDashOffset(offset)
// setAxisDirection('up') // 'down' 'right' 'left'  for screen graphics and non-western hotties.
// addXAxis()  // To get more than the default.
// setXAxisloc('edge')  // These return an Axis list so you can set Axis yourself
// setXAxisloc('zero')  // For classic sin(x) plots
// setXAxisloc('box')
// replaceAxis(axesToReplace /* optional */) // If no parameter is given, all axes replaced
// deleteAxis()
// setXTicks('linear')  // Assumes default axis otherwise you can change Axis
// setXTicks('linear', everyn, offset)  // Multiples of pi, Months, time, 10^1, 10^2...
// setXTicks('log')  // Minor ticks bunch up toward the regularly spaced big ticks.
// setXTicks('log', everyn offset)
// setXTicks(list)
// repeated for setMinorXTicks()
// setXGridLines(/*same as above*/)   // Gridlines is not a word. Grid might not be enough.
// setYGridLines()
// addXGridLines()  // Add another set, possibly with a different spacing, usually for specific lines.
// setXGridLinesStyle('light-grey')
// setXMinorGridLines(/*same as above*/)
// addHorizontalLine()  // For a horizontal line across at a specific x loc.  Just like gridlines, but only one.
// addVerticalLine()  // For a horizontal line across at a specific x loc.


// labelXAxis('linear')
// ... same as Ticks plus one more:
// labelXAxis(data, values)
