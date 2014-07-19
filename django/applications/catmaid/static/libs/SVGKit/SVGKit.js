/***

SVGKit.js 0.1

See <http://svgkit.sourceforge.net/> for documentation, downloads, license, etc.

(c) 2006 Jason Gallicchio.
Licensed under the open source (GNU compatible) MIT License

    Some notes:
    http://www.sitepoint.com/article/oriented-programming-2
    http://www.sitepoint.com/article/javascript-objects
    
    At some point I'd like to auto-detect if user has SVG and if it's Adobe or W3C:
        http://blog.codedread.com/archives/2005/06/21/detecting-svg-viewer-capabilities/
        http://blog.codedread.com/archives/2006/01/13/inlaying-svg-with-html/
        http://www.adobe.com/svg/workflow/autoinstall.html
    Also, transmogrify <object> tags into <embed> tags automatically,
    perhaps using <!–[if IE]> and before the content loads.
    
    This should work if included in an SVG to for inline scripting.
    
    Do I want to do anything with events or just let the DOM and MochiKit handle them?
    Maybe some built-in zoom and scroll that you can turn on.
    
    toXML needs namespaces. Assign aliases at top and use (have some common ones defined.)
    
    svgDocument.getElementById(id) does not work for inline.  Is this because svgDocument is document?
    This is used in createUniqueID and leads to failure of SVGCanvas test 21: lineargradient.
    Probably for the same reason svgDocument.getElementsByTagName("defs") doesnt' work.
     * After the script runs, these work in the console.
     * After an error (or something) it seems to kind of work since test 22 works after test 21 fails, 
       but strangely the DOM tree and the printed source code are wrong.  Indeed, switching the order
       always makes the second of the two work graphically, but fail DOM/XML wise.
       
    IE doesn't seem to be able to pull anything out once it's put in:
      >>> document.svgkit.svgElement.getElementsByTagName('path')
      [undefined, undefined, undefined, undefined]
    It knows that I added four paths, but I can't get them out.  Same for svgElement.childNodes
    
    Problem of divs loading and unloading, especially with multiple writeln() in the interpreter.
    Perhaps on unload, save xml and then restore on a load.
    The problem is that each time the object or embed is shown (first time
      or after being hidden) there is a delay before the SVG content is
      accessible.
    Can't draw anything until it's loaded.  Really annoying in the interpreter.
    inline doesn't have this problem.  Maybe everything is going in that direction anyway.
    
    Bugs:
     * translate(1) and then call translate doesn't detect that this means x=1. 
        Code seems to be there, but regexp doesnt' match.
     * Dragging is sketchy when the mouse leavs the object.
     * Reading XML should read the namespaces into the SVGKit._namespaces dictionary.
    
    Integration with MochiKit:
     * See if it's any slower using iterators
     * See if MochiKit.Style and MochiKit.Visual effects work.
       yes: hideElement(circle) showElement(circle) setOpacity(circle, 0.2)
       no: elementDimensions(circle)
    
    Using SVG in the Browser:
     * Should always provide fallback content -- png, pdf, (shudder) swf
     * Interactivity requires SVG, but initial static content should have static fallback (for fast load)
     * Best effort to have it work on Firefox, Opera, Safari, IE+ASV, Batik, Rhino, GNOME, KDE
     * Text sucks -- different settings/browsers render it in vastly differens sizes.
     * Automatically generate links to an image translation server.
    
    Fatures:
     * Automatic resizing with browser window (like Google Maps)
     * Mouse tracking -- ala KevLinDev?  Do you need the clear 100% rectangle?
     * enablePan(element), enableZoom(element), enableFollow(), enableDrag() enablePanZoomImmunity()
     * Create PNGs: http://www.kevlindev.com/gui/utilities/js_png/index.htm
     
    Emulate Support For:
     * getURL and setURL to non-ASP: http://jibbering.com/2002/5/dynamic-update-svg.html
     * SMIL animation: http://www.vectoreal.com/smilscript/
    
    SVG (and most client-side web stuff) is depressing.  Things looked so bright back in
    1999 and here we are SEVEN years later and even I just learned about the standard.
    
    I want to show what can be done. I didn't have anything invested in SVG when I started, 
    but it's the only non-proprietary interactive vector graphics format.
    
    Make a MochiMin version as an option for inclusion instaed of full MochiKit.
    
    Conform SVG coding and output style to: http://jwatt.org/svg/authoring/
    specifically look into using name-space aware:
    getAttribute, removeAttribute, setAttribute
    
    Embed images where possible -- read binary data, convert to 64, then include directly.
    href to images don't work very well -- they translate into absolute URIs.
    
    TODO:  s.scale(10) should do the right thing.  Right now you NEED scale(10,10)
            also the scale(1,1)scale(1,1) returns scale(2,2) because right now it's always aditive
***/


////////////////////////////
//  Setup
////////////////////////////

if (typeof(dojo) != 'undefined') {
    dojo.provide("SVGKit");
    dojo.require("MochiKit.DOM");
}
if (typeof(JSAN) != 'undefined') {
    JSAN.use("MochiKit.Iter", []);
}

try {
    if (typeof(MochiKit.DOM) == 'undefined') {
        throw "";
    }
} catch (e) {
    throw "SVGKit depends on MochiKit.DOM!";
}

if (typeof(SVGKit) == 'undefined' || SVGCanvas == null) {
    // Constructor
    SVGKit = function(p1, p2, p3, p4, p5) {
        if (MochiKit.Base.isUndefinedOrNull(this.__init__)){
            log("You called SVG() as a fnuction without new.  Shame on you, but I'll give you a new object anyway");
            return new SVGKit(p1, p2, p3, p4, p5);
        }
        this.__init__(p1, p2, p3, p4, p5);
        return null;
    };
}

SVGKit.NAME = "SVGKit";
SVGKit.VERSION = "0.1";
SVGKit.__repr__ = function () {
    return "[" + SVGKit.NAME + " " + SVGKit.VERSION + "]";
};
SVGKit.prototype.__repr__ = SVGKit.__repr__;

SVGKit.toString = function () {
    return this.__repr__();
};
SVGKit.prototype.toString = SVGKit.toString;


SVGKit.EXPORT = [
];

SVGKit.EXPORT_OK = [
];


////////////////////////////
//  Defaults
////////////////////////////

//SVGKit._defaultType = 'embed';
//SVGKit._defaultType = 'object';
SVGKit._defaultType = 'inline';
SVGKit._namespaces = {
    'svg': 'http://www.w3.org/2000/svg',
    'xlink': 'http://www.w3.org/1999/xlink',
    'ev': 'http://www.w3.org/2001/xml-events',
    'xmlns': 'http://www.w3.org/2000/xmlns/'
}
SVGKit._svgMIME = 'image/svg+xml';
SVGKit._svgEmptyName = 'empty.svg';
SVGKit._SVGiKitBaseURI = '';
SVGKit._errorText = "You can't display SVG. Download the latest Firefox!" ;
SVGKit._cgi_dir = '/cgi-bin/'  // Should be customized to your own server
SVGKit._convert_url = SVGKit._cgi_dir+'convertsvg.py'  


////////////////////////////
//  Constructor
////////////////////////////

SVGKit.prototype.__init__ = function (p1, p2, p3, p4, p5) {
    // TODO:  Make thse work right.
    // __init__()                          For JavaScript included in an SVG.
    // __init__(node)                      Already have an HTML element -- autodetect the type
    // __init__(id)                        Have the id for an HTML element (if your id ends in .svg, pass in the node instead because strings ending in .svg will be treated as filenames.)
    // __init__(filename, id, type, width, height)        Create a new HTML element that references filename (must end in .svg)
    // __init__(width, height, id, type)   Create a new SVG from scratch with width, height, and id
    
    // The following are described at http://www.w3.org/TR/SVG/struct.html
    this.htmlElement = null;   // the <object> or <embed> html element the SVG lives in, otherwise null
    this.svgDocument = null;  // When an 'svg' element is embedded inline this will be document
    this.svgElement = null;   // corresponds to the 'svg' element
    //this._redrawId = null;   // The reference that SVG's suspendRedraw returns.  Needed to cancel suspension.
    //SVGKit._defaultType = // Determine a good default dynamically ('inline' , 'object', or 'embed')
    
    //log("SVGKit.__init__(", p1, p2, p3, p4, p5, ")");
    this.setBaseURI();
    if (MochiKit.Base.isUndefinedOrNull(p1)) {
        // This JS was included inside of an SVG file, and this was included in the
        // root element's onload event, which you need to to do get a target.
        /*
        var evt = p1;
        if ( window.svgDocument == null )
            this.svgDocument = evt.target.ownerDocument;
        */
        this.svgDocument = document;
        this.svgElement = this.svgDocument.rootElement;  // or svgDocument.documentElement; 
        this.htmlElement = this.svgElement;
    }
    else if (typeof(p1) == 'string') {
        if (p1.length>5 && p1.substr(p1.length-4,4).toLowerCase()=='.svg')  // IE doesn't do substr(-4)
            this.loadSVG(p1, p2, p3, p4, p5);
        else
            this.whenReady( bind(this.grabSVG, this, p1) );
    }
    else if (typeof(p1) == 'object') {  // Not <object> but a JS object
        this.grabSVG(p1);
    }
    else {
        this.createSVG(p1, p2, p3, p4)
    }
    // Note that this.svgDocument and this.svgElement may not be set at this point.  Must wait for onload callback.

    //log("Done creating/grabing svg.");
    this._addDOMFunctions();
    //log("Done with _addDOMFunctions");
    window.svgkit = this;  // For debugging, especially in IE
}


////////////////////////////
//  General Utilities
////////////////////////////

SVGKit.firstNonNull = function() {
    for (var i=0; i<arguments.length; i++)
        if ( !MochiKit.Base.isUndefinedOrNull(arguments[i]) )
            return arguments[i]
    return null;
}

////////////////////////////
//  Browser Related
////////////////////////////

SVGKit.prototype.setBaseURI = function() {
    /***
        To create an empty SVG using <object> or <embed> you need to give the tag
        a valid SVG file, so an empty one lives in the same directory as the JavaScript.
        This function finds that directory and sets the _SVGiKitBaseURI variable
        for future use.
    ***/
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].getAttribute("src");
        if (!src) {
            continue;
        }
        if (src.match(/SVGKit\.js$/)) {
            SVGKit._SVGiKitBaseURI = src.substring(0, src.lastIndexOf('SVGKit.js'));
        }
    }
}


SVGKit.prototype.isIE = function() {
    // Borrowed from PlotKit:
    var ie = navigator.appVersion.match(/MSIE (\d\.\d)/);
    var opera = (navigator.userAgent.toLowerCase().indexOf("opera") != -1);
    return ie && (ie[1] >= 6) && (!opera);
}


SVGKit.prototype.whenReady = function (func, every_time /* =false */) {
    /***
        Calls func when the SVG is ready.
        If you create or try to use an SVG inside of <embed> or <object>, the
        SVG file must be loaded.  The browser does this asynchronously, and 
        you can't do anything to the SVG until it's been loaded.
        If the file already loaded or you're working with an inline SVG, func
        will get called instantly.
        If it hasn't loaded yet, func will get added to the elemen's onload 
        event callstack.
        
        TODO: Should this happen every time the div surrounding the SVG is
        hidden and shown?  If you just add it to onload, it does.
        
        TODO: Fix the loading of SVG from XML file thing -- something more
        sophistocated than calling 0.5 seconds later.
    ***/
    if (this.svgElement != null && this.svgDocument != null && 
            !MochiKit.Base.isUndefinedOrNull(func) ) {
        //log("func=",func);
        func.call(this);
        //func.apply(this);
        //func();
        if (every_time)
            addToCallStack(this.htmlElement, 'onload', func);  // Incompatable with Mochikit.Signal
    }
    else if (this.htmlElement != null) {
        //log("adding to onload event for htmlElement=", this.htmlElement, " the func=", func);
        //if (every_time)
            addToCallStack(this.htmlElement, 'onload', func);  // Incompatable with Mochikit.Signal
        //else
        //    addToCallStack(this.htmlElement, 'onload', function() {func(); );
    }
    else {
        // Try again half a second later.  This is only for loaing an SVG from an XML file to an inline element.
        //log("doing callLater for func=", func);
        callLater(0.5, func);
    }
}

SVGKit.prototype.resize = function(width, height) {
    /***
        Sets the size of the htmlElement and svgElement.  No defaults given.
    ***/
    this.setSize(this.svgElement, width, height);
    this.setSize(this.htmlElement, width, height);
}

SVGKit.prototype.resizeSVGElement = function(width, height) {
    /***
        Sets the size of the svgElement 
        If no size is given, it's assumed you wnat to set the size
        based on the size of the htmlElement to get rid of scroll bars or something.
    ***/
    // I don't use first non-null because it would have to do two slow DOM lookups
    // to pass them as arguments.
    if (MochiKit.Base.isUndefinedOrNull(width))
        width = getNodeAttribute(this.htmlElement, 'width')
    if (MochiKit.Base.isUndefinedOrNull(height))
        height = getNodeAttribute(this.htmlElement, 'height')
    this.setSize(this.svgElement, width, height);
}

SVGKit.prototype.resizeHTMLElement = function(width, height) {
    /***
        Sets the size of the htmlElement
        If no size is given, it's assumed you
        want to set it based on the size of the SVG it contains
    ***/
    if (MochiKit.Base.isUndefinedOrNull(width))
        width = getNodeAttribute(this.svgElement, 'width')
    if (MochiKit.Base.isUndefinedOrNull(height))
        height = getNodeAttribute(this.svgElement, 'height')
    this.setSize(this.htmlElement, width, height);
}

SVGKit.prototype.setSize = function(element, width, height) {
    setNodeAttribute(element, 'width', width);
    setNodeAttribute(element, 'height', height);
}

SVGKit.prototype.conversionHTML = function(divElement) {
    var cgi = 'http://svgkit.sourceforge.net/cgi-bin/convertsvg.py'
    var types = ['svg','pdf','png','jpg','ps','xfig'];
    for (var i=0; i<types.length; i++) {
        appendChildNodes(divElement,
            MochiKit.DOM.createDOM('a',{href:cgi+types[i]}, types[i]), 
            ' ');
    }
}


////////////////////////////
//  Getting Hold of an SVG
////////////////////////////

SVGKit.prototype.createSVG = function (width, height, id /* optional */, type /* =default */) {
    /***
        Loads a blank SVG and sets its size and the size of any HTML
        element it lives in to the given width and height.
    ***/
    //log("createSVG(", width, height, id , type,")");
    
    type = SVGKit.firstNonNull(type, SVGKit._defaultType);
    //log("type=", type);
    
    if (type=='inline') {
        this.createInlineSVG(width, height, id);
    }
    else {
        this.loadSVG(SVGKit._svgEmptyName, id, type, width, height)
    }
}

SVGKit.prototype.createInlineSVG = function(width, height, id) {
    /***
        Make sure html tag has SVG namespace support: 
        <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"
            xmlns:svg="http://www.w3.org/2000/svg">
    ***/
    var attrs = {
        // Make sure this matches what's in empty.svg
        'xmlns': SVGKit._namespaces['svg'],      // for <circle> type tags with implicit namespace
        'xmlns:svg': SVGKit._namespaces['svg'],  // for <svg:circle ...> type tags with explicit namespace
        'xmlns:xlink': 'http://www.w3.org/1999/xlink',
        'xmlns:ev': 'http://www.w3.org/2001/xml-events',
        'version': '1.1',
        'baseProfile': 'full',
        'width': width,
        'height': height 
    };
    
    if (!MochiKit.Base.isUndefinedOrNull(id)) {
        attrs['id'] = id;
    }

    // Borrowed from PlotKit:
    if (!this.isIE()) {
        this.svgDocument = document;
        this.svgElement = this.createSVGDOM('svg', attrs);  // Create an element in the SVG namespace
        this.htmlElement = this.svgElement;   // html can work with the <svg> tag directly
        //this.svgDocument = this.svgElement.getSVGDocument()
        this.svgDocument = this.svgElement.ownerDocument;
        //log("in create: this.svgDocument=",this.svgDocument);
    }
    else
    {
        // IE
        log('createInlineSVG with IE.  width:', width, 'height:', height)
        var width = attrs["width"] ? attrs["width"] : "100";
        var height = attrs["height"] ? attrs["height"] : "100";
        var eid = attrs["id"] ? attrs["id"] : "notunique";

        var html = '<svg:svg width="' + width + '" height="' + height + '" ' +
                    'id="' + eid + '" version="1.1" baseProfile="full">';

        log('html:', html)
        log('document:', document)
        this.htmlElement = document.createElement(html);
        log('htmlElement:', this.htmlElement)
        
        // create embedded SVG inside SVG.
        this.svgDocument = this.htmlElement.getSVGDocument();
        log('svgDocument:', this.svgDocument)
        this.svgElement = this.svgDocument.createElementNS(SVGKit._namespaces['svg'], 'svg');
        log('svgElement:', this.svgElement)
        this.svgElement.setAttribute("width", width);
        this.svgElement.setAttribute("height", height);
        this.svgElement.setAttribute('xmlns:xlink', attrs['xmlns:xlink']);
        log("in create: this.svgElement=",this.svgElement);
        this.svgDocument.appendChild(this.svgElement);
    }
}

SVGKit.prototype.loadSVG = function (filename, id /* optional */, type /* =default */, width /* = from file */, height /* = from file */) {
    /***

        Create a new HTML DOM element of specified type ('object', 'embed', or 'svg')
        and set the attributes appropriately.  You'd never call this for JavaScript
        code within the SVG.
        
        If you're type is inline and you're loading from a file other than empty.svg, 
        you have to wait for the XML to load for the htmlElement to be set. In code
        that appends this htmlElement to the document, you have to call waitReady()
        Conversely, if you're type is embed or object, you CAN'T call whenReady to
        append the htmlElement to the document because it will ever be ready until it's
        displayed!  There must be a better way to handle this.
        
        For object and embed, createSVG just loads empty.svg, but for inline, create is
        more complicated and doesn't involve empty.svg.  It's loading that's hard.
        This code should be reworked.

        @param type: The tag that we will create

        @param width: default from file or 100

        @param height: default from file or 100
        
        @param id: Optionally assign the HTML element an id.

        @rtype: DOMElement

    ***/
    // TODO If it is new, default width and height are 100.  If it's from a file, defaults come from the file.
    //      You can still set the width and height if you want the thing to scroll.

    var attrs = {};
    
    if (!MochiKit.Base.isUndefinedOrNull(id)) {
        attrs['id'] = id;
    }
    type = SVGKit.firstNonNull(type, SVGKit._defaultType);
    
    //log("loadSVG(", filename, id, type, width, height,")");
    
    if (type=='inline') {
        if (this.isIE()) {
            this.createSVG(width, height, id, type);
            //log("after create: this.svgElement=",this.svgElement);
        }
        //this.htmlElement = null;  // This is required to tell whenReady that we won't be ready until the assynch request returns.
        var copyXMLtoSVG = function(event) {
            if (!this.isIE()) {
                var xmlDoc = event.currentTarget;
                this.htmlElement = xmlDoc.documentElement.cloneNode(true);
                this.svgDocument = document;
                this.svgElement = this.htmlElement;
            }
            else {
                var newElement = event.documentElement.cloneNode(true);
                this.svgDocument.replaceChild(newElement, this.svgDocument.rootElement);
                this.svgElement = newElement;
                /*
                for (var i=0; i<newElement.childNodes.length; i++) {
                    var clone = newElement.childNodes[i].cloneNode(true);
                    //log("in copyXMLtoSVG for loop this.svgElement=",this.svgElement);
                    this.svgElement.appendChild(clone);  // This doesn't work: this.svgElement is [disposed object]
                }
                */
            }
        }
        SVGKit.importXML(filename, bind(copyXMLtoSVG, this));
    }
    else if (type=='object') {  // IE:  Cannot support
        attrs['data'] = SVGKit._SVGiKitBaseURI + filename;
        attrs['type'] = SVGKit._svgMIME;
        //log('loadSVG, data =', attrs['data'], '  type =', attrs['type'])
        this.htmlElement = MochiKit.DOM.createDOM('object', attrs, SVGKit._errorText);
        //var svg = this;  // Define svg in context of function below.
        function finishObject(width, height, event) {
            // IE doesn't have contentDocument
            // IE would have to use some sort of SVG pool of objects
            // that add themselves to a list uppon load.
            this.svgDocument = this.htmlElement.contentDocument;
            this.svgElement = this.svgDocument.rootElement;  // svgDocument.documentElement works too.
            this.resize(width, height);
            //log('this.svgDocument', this.svgDocument, 'this.svgElement', this.svgElement)
        }
        this.whenReady( bind(finishObject, this, width, height) );
    }
    else if (type=='embed') { // IE:  Cannot support
        attrs['src'] = SVGKit._SVGiKitBaseURI + filename;
        attrs['type'] = SVGKit._svgMIME;
        attrs['pluginspage'] = 'http://www.adobe.com/svg/viewer/install/';
        log("Going to createDOM('embed')");
        this.htmlElement = MochiKit.DOM.createDOM('embed', attrs );
        function finishEmbed(width, height, event) {
            // IE doesn't load the embed when you include it in the DOM tree.
            // if no real fix, you could create an SVG "pool" of empty width=1, height=1 
            // and move them around. This seems to work in IE.
            // width=0, height=0 works in Firefox, but not IE.
            //log("new embed: this.htmlElement = " + this.htmlElement) ;
            //log("new embed: Going to this.htmlElement.getSVGDocumen() )") ;
            this.svgDocument = this.htmlElement.getSVGDocument();
            this.svgElement = this.svgDocument.rootElement;  // svgDocument.documentElement works too.
            this.resize(width, height);
        }
        this.whenReady( bind(finishEmbed, this, width, height) );
    }
}

SVGKit.importXML = function (file, onloadCallback) {
    /***
        Pass it a URL to load, it loads it asyncronously (the only way) and then
        calls callback when it's done.
        
        I use this to load SVG documents into an already existing SVG document.
    ***/
    // http://www.sitepoint.com/article/xml-javascript-mozilla/2
    // http://www-128.ibm.com/developerworks/web/library/wa-ie2mozgd/
    // http://www.quirksmode.org/dom/importxml.html
    var xmlDoc;
    var moz = (typeof document.implementation != 'undefined') && 
            (typeof document.implementation.createDocument != 'undefined');
    var ie = (typeof window.ActiveXObject != 'undefined');

    if (moz) {
        //var parser = new DOMParser(); 
        //xmlDoc = parser.parseFromString(xmlString, "text/xml"); 
        xmlDoc = document.implementation.createDocument("", "", null);
        xmlDoc.onload = onloadCallback;
    }
    else if (ie) {
        log("importXML for ie");
        xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
        xmlDoc.async = false;
        log("set xmlDoc.async = false");
        //document.xmlDoc = xmlDoc;
        //xmlDoc.loadXML(xmlString)
        //while(xmlDoc.readyState != 4) {};
        if (onloadCallback) {
            xmlDoc.onreadystatechange = function () {
                if (xmlDoc.readyState == 4) onloadCallback(xmlDoc)
            };
        }
    }
    xmlDoc.load(file);  // Same for both, surprisingly.
    return xmlDoc;
}


SVGKit.prototype.grabSVG = function (htmlElement) {
    /***
        Given an HTML element (or its id) that refers to an SVG, 
        get the SVGDocument object.
        If htmlElement is an 'object' use contentDocument.
        If htmlElement is an 'embed' use getSVGDocument().
        If htmlElement is an 'svg' or 'svg:svg' were inlnie.
            If you're w3C compatible like Firefox, svgElement is htmlElement
            If you're IE it's just like Embed.
        
        If is's an object or embed and it's not showing or
        the SVG file hasn't loaded, this won't work.
        
        @param htmlElement: either an id string or a dom element ('object', 'embed', 'svg)
    ***/
    log("grabSVG htmlElement (node or id) = ", htmlElement);
    this.htmlElement = MochiKit.DOM.getElement(htmlElement);
    log("htmlElement (node) = ", this.htmlElement);
    var tagName = this.htmlElement.tagName.toLowerCase();
    log("tagName = ", tagName, "  htmlElement.contentDocument=", this.htmlElement.contentDocument, "(this will be blank for inline)");
    var isInline = tagName == 'svg' || tagName == 'svg:svg';  // svg:svg is IE style
    if (isInline && !this.isIE())  {
        this.svgDocument = document;
        this.svgElement = this.htmlElement;
    }
    else if (tagName == 'embed' || isInline && this.isIE()) {
        // IE Bug:  htmlElement.getSVGDocument is undefined, but htmlElement.getSVGDocument() works, so you can't test for it.
        this.svgDocument = this.htmlElement.getSVGDocument();
        this.svgElement = this.svgDocument.rootElement;  // svgDocument.documentElement works too.
    }
    else if (tagName == 'object' && this.htmlElement.contentDocument) {
        // IE Bug: <object> SVGs display, but have no property to access their contents.
        this.svgDocument = this.htmlElement.contentDocument;
        this.svgElement = this.svgDocument.rootElement;  // svgDocument.documentElement works too.
    }
    log("grabSVG: type=",tagName, "  this.svgDocument = ", this.svgDocument, "  this.svgElement = ", this.svgElement);
}


////////////////////////////
//  Content Manipulation
////////////////////////////


SVGKit.prototype.updateNodeAttributesSVG = function (node, attrs) {
    /***
        Basically copied directly from MochiKit with some namespace stuff.
    ***/
    var elem = node;
    var self = MochiKit.DOM;
    if (typeof(node) == 'string') {
        elem = self.getElement(node);
    }
    if (attrs) {
        var updatetree = MochiKit.Base.updatetree;
        if (self.attributeArray.compliant) {
            // not IE, good.
            for (var k in attrs) {
                var v = attrs[k];
                if (typeof(v) == 'object' && typeof(elem[k]) == 'object') {
                    if (k == "style" && MochiKit.Style) {
                        MochiKit.Style.setStyle(elem, v);
                    } else {
                        updatetree(elem[k], v);
                    }
                }
                /* SVGKit Additions START */
                else if (k == 'xmlns') {
                    // No prefix
                    elem.setAttributeNS(SVGKit._namespaces['xmlns'], k, v);
                }
                else if (k.search(':') != -1) {
                    var tmp = k.split(':')
                    var prefix = tmp[0]
                    var localName = tmp[1]
                    //elem.setAttributeNS(SVGKit._namespaces[prefix], localName, v);
                    var uri = SVGKit._namespaces[prefix]
                    if (uri != null)
                        elem.setAttributeNS(uri, k, v);  // Second parameter is "qualified name"
                }
                /* SVGKit Additions END */
                else if (k.substring(0, 2) == "on") {
                    if (typeof(v) == "string") {
                        v = new Function(v);
                    }
                    elem[k] = v;
                } else {
                    elem.setAttributeNS(null, k, v);
                }
            }
        } else {
            // IE is insane in the membrane
            var renames = self.attributeArray.renames;
            for (k in attrs) {
                v = attrs[k];
                var renamed = renames[k];
                if (k == "style" && typeof(v) == "string") {
                    elem.style.cssText = v;
                } else if (typeof(renamed) == "string") {
                    elem[renamed] = v;
                } else if (typeof(elem[k]) == 'object'
                        && typeof(v) == 'object') {
                    if (k == "style" && MochiKit.Style) {
                        MochiKit.Style.setStyle(elem, v);
                    } else {
                        updatetree(elem[k], v);
                    }
                } else if (k.substring(0, 2) == "on") {
                    if (typeof(v) == "string") {
                        v = new Function(v);
                    }
                    elem[k] = v;
                } else {
                    elem.setAttribute(k, v);
                }
            }
        }
    }
    return elem;
},

SVGKit.prototype.createSVGDOM = function (name, attrs/*, nodes... */) {
    /***
        Like MochiKit.createDOM, but with the SVG namespace.
    ***/
    var elem;
    var dom = MochiKit.DOM;
    if (typeof(name) == 'string') {
        try {
            // W3C Complient
            elem = this.svgDocument.createElementNS(SVGKit._namespaces['svg'], name);
        }
        catch (e) {
            // IE
            log("Creating element with name=", name, " in SVG namespace for IE");
            elem = this.svgDocument.createElement(name);
            elem.setAttribute("xmlns", SVGKit._namespaces['svg']);
            //elem = this.svgDocument.createElement('svg:'+name);
        }
    } else {
        elem = name;  // Parameter "name" was really an object
    }
    if (attrs) {
        this.updateNodeAttributesSVG(elem, attrs);
    }
    if (arguments.length <= 2) {
        return elem;
    } 
    else {
        var args = MochiKit.Base.extend([elem], arguments, 2);
        return dom.appendChildNodes.apply(this, args);
    }
};

SVGKit.prototype.createSVGDOMFunc = function (/* tag, attrs, *nodes */) {
    /***

        Convenience function to create a partially applied createSVGDOM

        @param tag: The name of the tag

        @param attrs: Optionally specify the attributes to apply

        @param *nodes: Optionally specify any children nodes it should have

        @rtype: function

    ***/
    var m = MochiKit.Base;
    return m.partial.apply(
        this,
        m.extend([this.createSVGDOM], arguments)
    );
};


SVGKit.prototype.append = function (node) {
    /***
        Convenience method for appending to the root element of the SVG.
        Anything you draw by calling this will show up on top of everything else.
    ***/
    this.svgElement.appendChild(node);
}


SVGKit.prototype.circle = function() {
    /***
        Stupid function for quick testing.
    ***/
    var c = this.CIRCLE( {'cx':50, 'cy':50, 'r':20, 'fill':'purple', 'fill-opacity':.3} );
    this.append(c);
}

SVGKit.prototype.uniqueIdCount = 0;
SVGKit.prototype.createUniqueID = function(base) {
    /***
        For gradients and things, often you want them to have a unique id
        of the form 'gradient123' where the number is sequentially increasing.
        You would pass this function 'gradient' and it would look for the lowest
        number which returns no elements when you do a getElementByID.
        
        Right now it does a linear search because you typically don't create all
        that many of these, but maybe a hash table could be kept of the last 
        result for quick access.  This would have to be done on a per-SVG basis
        and is still no garuntee that the next number will be free if a node
        of that name/number gets created outside of this function.
    ***/
    //var uniqueIdCount=0;
    var id;
    var element;
    do {
        id = base + this.uniqueIdCount;
        this.uniqueIdCount++;
        element = this.svgDocument.getElementById(id);  // Works in IE and Firefox
        //element = this.svgElement.getElementById(id);  // Works in IE, not Firefox
        //log("createUniqueID: Going to try id=",id,"  element=", element);
    } while ( !MochiKit.Base.isUndefinedOrNull(element) );
    //log("Got unique id=",id);
    return id;
}

SVGKit.prototype.getDefs = function(createIfNeeded /* = false */) {
    /***
        Return the <defs> tag inside of the SVG document where definitions
        like gradients and markers are stored.
        
        @param createIfNeeded -- If this is true, a <defs> element will be created if
                                none already exists.
                                
        @returns the defs element.  If createIfNeeded is false, this my return null
    ***/
    var defs = this.svgElement.getElementsByTagName("defs");
    if (defs.length>0) {
        //log("getDefs... found defs: defs.length=",defs.length, " defs[0]=",defs[0])
        return defs[0];
    }
    if (!MochiKit.Base.isUndefinedOrNull(createIfNeeded) && !createIfNeeded) {
        //log("getDefs... returning null cuz createIfNeeded=",createIfNeeded)
        return null;
    }
    defs = this.DEFS(null);
    //log("Created defs", defs, "... going to insert first")
    this.svgElement.insertBefore(defs, this.svgElement.firstChild);
    //this.append(defs);
    //log("insert first worked")
    
    // Check to see if it actually got appended:
    //var defs2 = this.svgDocument.getElementsByTagName("defs");
    var defs2 = this.svgElement.getElementsByTagName("defs");
    //log("ending getDefs...defs2.length=",defs2.length, " defs2[0]=",defs2[0])
    
    return defs;
}

/*
// These are pretty redundant.  Use :
suspend_handle_id = this.svgElement.suspendRedraw(max_wait_milliseconds)
this.svgElement.unsuspendRedraw(suspend_handle_id)
this.svgElement.unsuspendRedrawAll()

SVGKit.prototype.suspendRedraw = function (miliseconds) {
    miliseconds = SVGKit.firstNonNull(miliseconds, 1000);
    var tempRedrawId = this.svgElement.suspendRedraw(miliseconds);
    this.unsuspendRedraw()
    this._redrawId = tempRedrawId
}

SVGKit.prototype.unsuspendRedraw = function () {
    if (this._redrawId != null) {
        this.svgElement.unsuspendRedraw(this._redrawId);
        this._redrawId = null;
    }
}
*/

SVGKit.prototype.deleteContent = function() {
    /***
        Deletes all graphics content, but leaves definitions
    ***/
    var defs = this.getDefs()
    MochiKit.DOM.replaceChildNodes(this.svgElement, defs)
}

////////////////////////////
//  Transformations
////////////////////////////


/*
    The following take an element and transforms it.  If the last item in
    the transform string is the same as the type of transformation that 
    you're trying to do (e.g. rotate), replace it for efficiency.
    If it's not the same, append to the end.
    Note that translate(2,0) gets turned into translate(2) by the browser, and
    this should be handled.
    If the elem passed is not an id for an element, it is treated as a
      string transformation which gets updated and returned.
    Regular Expressions are hard coded so they can be compiled once on load.
    
    TODO:  Make sure the arguments are valid numbers to avoid illegal transforms
*/


SVGKit.rotateRE = /(.*)rotate\(\s*([0-9eE\+\-\.]*)\s*\)\s*$/
SVGKit.prototype.rotate = function(elem, degrees) {
    /***
        Test: 
        SVGKit.prototype.rotate('translate( 1 ,2 ) rotate( 70)', -10)
        SVGKit.prototype.rotate('rotate(1) translate(2,2) ', -10)
    ***/
    var element = MochiKit.DOM.getElement(elem);
    if (MochiKit.Base.isUndefinedOrNull(element)) {
        return this._oneParameter(elem, degrees, 
                                   SVGKit.rotateRE, 'rotate')
    }
    var old_transform = element.getAttribute('transform')
    var new_transform = this._oneParameter(old_transform, degrees, 
                                            SVGKit.rotateRE, 'rotate')
    element.setAttribute('transform', new_transform);
    return new_transform;
}


SVGKit.translateRE = /(.*)translate\(\s*([0-9eE\+\-\.]*)\s*,?\s*([0-9eE\+\-\.]*)?\s*\)\s*$/
SVGKit.prototype.translate = function(elem, tx, ty) {
    /***
        SVGKit.prototype.:
        translate(' translate( 1 ,2 ) ', -10,-20)
        translate(' translate(1) ', -10,-20)
        translate(' translate(10,20) ', 0, -20)
        translate('translate(10,10) rotate(20)', 10, 10)  == 'translate(10,10) rotate(20)translate(10,10)'
        translate('translate(10,10)', -10, -10) ==  ''
        translate('translate(10)', -10)  == ''
    ***/
    var element = MochiKit.DOM.getElement(elem);
    if (MochiKit.Base.isUndefinedOrNull(element)) {
        return this._twoParameter(elem, tx, ty, 
                                   SVGKit.translateRE, 'translate')
    }
    var old_transform = element.getAttribute('transform')
    var new_transform = this._twoParameter(old_transform, tx, ty, 
                                            SVGKit.translateRE,'translate');
    element.setAttribute('transform', new_transform);
    return new_transform;
}

SVGKit.scaleRE = /(.*)scale\(\s*([0-9eE\+\-\.]*)\s*,?\s*([0-9eE\+\-\.]*)?\s*\)\s*$/
SVGKit.prototype.scale = function(elem, sx, sy) {
    var element = MochiKit.DOM.getElement(elem);
    if (MochiKit.Base.isUndefinedOrNull(element)) {
        return this._twoParameter(elem, sx, sy, 
                                   SVGKit.scaleRE, 'scale');
    }
    var old_transform = element.getAttribute('transform')
    var new_transform = this._twoParameter(old_transform, sx, sy, 
                                            SVGKit.scaleRE, 'scale');
    element.setAttribute('transform', new_transform);
    return new_transform;
}


SVGKit.matrixRE = null
SVGKit.prototype.matrix = function(elem, a, b, c, d, e, f) {
    var element = MochiKit.DOM.getElement(elem);
    if (MochiKit.Base.isUndefinedOrNull(element)) {
        return this._sixParameter(elem, a, b, c, d, e, f,
                                   SVGKit.matrixRE, 'matrix');
    }
    var old_transform = element.getAttribute('transform')
    var new_transform = this._sixParameter(old_transform, a, b, c, d, e, f,
                                            SVGKit.matrixRE, 'matrix');
    element.setAttribute('transform', new_transform);
    return new_transform;
}

SVGKit.prototype._oneParameter = function(old_transform, degrees, 
                                                 regexp, name) {
    /***
        rotate('translate(1,2)rotate(12)', -12)  -> 'translate(1,2)'
        rotate('translate(1,2)rotate(12)', -11)  -> 'translate(1,2)rotate(1)'
        rotate('rotate( 4 ) rotate( 12 )', -12)  -> 'rotate( 4 ) '
    ***/
    if (MochiKit.Base.isUndefinedOrNull(degrees) || degrees == 0)
        return old_transform;
    regexp.lastIndex = 0;
    //var transform = elem.getAttribute('transform')
    //var transform = elem;
    var new_transform, array;
    
    if (old_transform==null || old_transform=='')
        new_transform = name+'('+degrees+')'
    else if ( (array = regexp.exec(old_transform)) != null ) {
        var old_angle = parseFloat(array[2]);
        var new_angle = old_angle+degrees;
        new_transform = array[1];
        if (new_angle!=0)
            new_transform += 'rotate('+new_angle+')';
    }
    else
        new_transform = old_transform + 'rotate('+degrees+')';
    return new_transform;
}

SVGKit.prototype._twoParameter = function(old_transform, x, y, 
                                                 regexp, name) {
    // Test: SVGKit.prototype._twoParameter('translate( 1 ,2 ) scale( 3 , 4  )', 1, 1, SVGKit.scaleRE, 'scale')
    // Test: SVGKit.prototype._twoParameter('translate(3)', 1, 1, SVGKit.translateRE, 'translate')
    // Test: SVGKit.prototype._twoParameter('translate(10,20)', 0, -20, SVGKit.translateRE, 'translate')
    if (MochiKit.Base.isUndefinedOrNull(x) || MochiKit.Base.isUndefinedOrNull(name))
        return old_transform;
    // y = SVGKit.firstNonNull(y, 0);
    if (x==0 && y==0)
        return old_transform;
    regexp.lastIndex = 0;
    //var transform = elem
    var new_transform, array;
    
    if (MochiKit.Base.isUndefinedOrNull(old_transform) || old_transform=='')
        new_transform = name+'('+x+','+y+')';
    else if ( (array = regexp.exec(old_transform)) != null ) {
        var old_x = parseFloat(array[2]);
        var new_x = old_x+x;
        var old_y;
        if (array[3]!=null)
            old_y = parseFloat(array[3]);
        else
            old_y = 0;
        var new_y = old_y+y;
        new_transform = array[1];
        if (new_x!=0 || new_y!=0)
            new_transform += name+'('+new_x+','+new_y+')';
    }
    else
        new_transform = old_transform + name+'('+x+','+y+')';
    return new_transform
}

SVGKit.prototype._sixParameter = function(old_transform, a, b, c, d, e, f,
                                                 regexp, name) {
    if (MochiKit.Base.isUndefinedOrNull(d) || MochiKit.Base.isUndefinedOrNull(name))
        return old_transform;
    if (MochiKit.Base.isUndefinedOrNull(e))
        e = 0;
    if (MochiKit.Base.isUndefinedOrNull(f))
        f = 0;
    var new_transform = name+'('+a+','+b+','+c+','+d+','+e+','+f+')';
    return new_transform
}


////////////////////////////
// Output
////////////////////////////

SVGKit.prototype.toXML = function (dom /* = this.svgElement */, decorate /* = false */) {
    /***
        This doesn't work yet cuz toHTML converts everything to lower case.
        
        @param dom: Element to convert.  
        
        @param decorate: boolean: Include <?xml version="1.0" encoding="UTF-8" standalone="no"?> ?
        
        returns a string of XML.
    ***/
    dom = SVGKit.firstNonNull(dom, this.svgElement);
    var decoration = MochiKit.Base.isUndefinedOrNull(decorate) || !decorate ? '' : 
            '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
    
    var source = this.emitXML(dom).join("");
    return decoration + source.replace(/>/g, ">\n");  // Add newlines after all closing tags.
}


SVGKit.prototype.emitXML = function(dom, /* optional */lst) {
    /***
        A case insensitive and namespace aware version of MochiKit.DOM's emitHTML.
        My changes are marked with "SVGKit" comments.
        TODO:  Make namespace-aware.
    ***/
    if (typeof(lst) == 'undefined' || lst === null) {
        lst = [];
    }
    // queue is the call stack, we're doing this non-recursively
    var queue = [dom];
    var self = MochiKit.DOM;
    var escapeHTML = self.escapeHTML;
    var attributeArray = self.attributeArray;
    while (queue.length) {
        dom = queue.pop();
        if (typeof(dom) == 'string') {
            lst.push(dom);
        } else if (dom.nodeType == 1) {
            // we're not using higher order stuff here
            // because safari has heisenbugs.. argh.
            //
            // I think it might have something to do with
            // garbage collection and function calls.
            lst.push('<' + dom.nodeName);  // SVGKit: got rid of toLowerCase()
            var attributes = [];
            var domAttr = attributeArray(dom);
            for (var i = 0; i < domAttr.length; i++) {
                var a = domAttr[i];
                attributes.push([
                    " ",
                    a.name,
                    '="',
                    escapeHTML(a.value),
                    '"'
                ]);
            }
            attributes.sort();
            for (i = 0; i < attributes.length; i++) {
                var attrs = attributes[i];
                for (var j = 0; j < attrs.length; j++) {
                    lst.push(attrs[j]);
                }
            }
            if (dom.hasChildNodes()) {
                lst.push(">");
                // queue is the FILO call stack, so we put the close tag
                // on first
                queue.push("</" + dom.nodeName + ">");  // SVGKit: got rid of toLowerCase()
                var cnodes = dom.childNodes;
                for (i = cnodes.length - 1; i >= 0; i--) {
                    queue.push(cnodes[i]);
                }
            } else {
                lst.push('/>');
            }
        } else if (dom.nodeType == 3) {
            lst.push(escapeHTML(dom.nodeValue));
        }
    }
    return lst;
}

////////////////////////////
// Utilities for HTML
////////////////////////////


SVGKit.prototype.convertForm = function(options) {
    /***
        Returns HTML <form> element with a text area 
        that gets filled with SVG source and buttons
        The result of the form gets sent to a server for conversion to pdf, png, etc.
    ***/
    
    defaults = {
        converter_url : SVGKit._convert_url,
        new_window : true,
        update_button :  true,
        hide_textarea :  false,
        rows : 14,
        cols : 55,
        types : ['svg', 'pdf', 'ps', 'png', 'jpg']
    }
    var opts = {}
    if (!MochiKit.Base.isUndefinedOrNull(options))
        update(opts, options)
    setdefault(opts, defaults)
    
    var target = null
    if (opts.new_window)
        target = "_blank"
    
    // Form will open result in new window. 
    // target="_blank" is a deprecated feature, but very useful since you can't right click 
    // on the submit button to choose if you want to open it in a new window, and going back is SLOW
    var textArea = TEXTAREA({rows:opts.rows, cols:opts.cols, wrap:"off", name:'source'},
                                    "SVG Source")
    var form = FORM({name:'convert', method:'post', action:opts.converter_url, target:target},
                        textArea)
    
    var svg = this
    var setSrc = function() {
        // Uses newly created text Area
        replaceChildNodes(textArea, svg.toXML())
    }
    svg.whenReady(setSrc)
    
    if (opts.hide_textarea) 
        hideElement(textArea)
    else
        appendChildNodes(form, BR(null)) // Buttons get added below.
    
    if (opts.update_button) {
        var updateButton = INPUT({type:"button", value:"Update"})
        appendChildNodes(form, updateButton, " ")
        updateButton['onclick'] = setSrc
    }
    
    var make_convert_button = function(type) {
        var button=INPUT({type:"submit", name:"type", value:type})
        //if (!opts.update_button)
        //    button['onclick'] = setSrc // Happens before conversion?
        return SPAN(null, button, " ")  // Put a space after each button
    }
    appendChildNodes(form, map(make_convert_button, opts.types))
    return form
}

SVGKit.codeContainer = function(initial_code, doit, rows /*14*/, cols /*60*/) {
    /***
        Returns HTML <div> that contains code that can be 
        executed when the "Do It" button is pressed.
        
        The doit function is expected to take the parsed javascript
        
        The doit function is responsible for putting the svg where it belongs in the html page
        
        s = getElement('SVGKit_svg').childNodes[0]
        svg = new SVGKit(s)
        svg.append(svg.RECT({x:30, y:30, width:500, height:50}) )
    ***/
    
    rows = SVGKit.firstNonNull(rows, 14)
    cols = SVGKit.firstNonNull(cols, 50)
    
    var div, codeArea, buttonDoIt
    div = DIV(null, codeArea=TEXTAREA({rows:rows, cols:cols, wrap:"off"}, initial_code),
                BR(null),
                buttonDoIt=INPUT({type:"button", value:"Do It"}) 
             )
    
    var doit_button_hit = function() {
        // Need parens for weird ECMA Script conformance in FF3 https://bugzilla.mozilla.org/show_bug.cgi?id=378244
        var func = eval('('+codeArea.value+')')
        doit(func)
    }
    
    buttonDoIt['onclick'] = doit_button_hit
    return div
}


////////////////////////////
// Class Utilities
////////////////////////////

SVGKit.__new__ = function () {
    var m = MochiKit.Base;
    this.EXPORT_TAGS = {
        ":common": this.EXPORT,
        ":all": m.concat(this.EXPORT, this.EXPORT_OK)
    };
    m.nameFunctions(this);
}
SVGKit.__new__(this);

SVGKit.prototype._addDOMFunctions = function() {
    // The following has been converted by Zeba Wunderlich's Perl Script
    // from http://www.w3.org/TR/SVG/eltindex.html
    this.$ = function(id) { return this.svgDocument.getElementById(id) }
    this.A = this.createSVGDOMFunc("a")
    this.ALTGLYPH = this.createSVGDOMFunc("altGlyph")
    this.ALTGLYPHDEF = this.createSVGDOMFunc("altGlyphDef")
    this.ALTGLYPHITEM = this.createSVGDOMFunc("altGlyphItem")
    this.ANIMATE = this.createSVGDOMFunc("animate")
    this.ANIMATECOLOR = this.createSVGDOMFunc("animateColor")
    this.ANIMATEMOTION = this.createSVGDOMFunc("animateMotion")
    this.ANIMATETRANSFORM = this.createSVGDOMFunc("animateTransform")
    this.CIRCLE = this.createSVGDOMFunc("circle")
    this.CLIPPATH = this.createSVGDOMFunc("clipPath")
    this.COLOR_PROFILE = this.createSVGDOMFunc("color-profile")
    this.CURSOR = this.createSVGDOMFunc("cursor")
    this.DEFINITION_SRC = this.createSVGDOMFunc("definition-src")
    this.DEFS = this.createSVGDOMFunc("defs")
    this.DESC = this.createSVGDOMFunc("desc")
    this.ELLIPSE = this.createSVGDOMFunc("ellipse")
    this.FEBLEND = this.createSVGDOMFunc("feBlend")
    this.FECOLORMATRIX = this.createSVGDOMFunc("feColorMatrix")
    this.FECOMPONENTTRANSFER = this.createSVGDOMFunc("feComponentTransfer")
    this.FECOMPOSITE = this.createSVGDOMFunc("feComposite")
    this.FECONVOLVEMATRIX = this.createSVGDOMFunc("feConvolveMatrix")
    this.FEDIFFUSELIGHTING = this.createSVGDOMFunc("feDiffuseLighting")
    this.FEDISPLACEMENTMAP = this.createSVGDOMFunc("feDisplacementMap")
    this.FEDISTANTLIGHT = this.createSVGDOMFunc("feDistantLight")
    this.FEFLOOD = this.createSVGDOMFunc("feFlood")
    this.FEFUNCA = this.createSVGDOMFunc("feFuncA")
    this.FEFUNCB = this.createSVGDOMFunc("feFuncB")
    this.FEFUNCG = this.createSVGDOMFunc("feFuncG")
    this.FEFUNCR = this.createSVGDOMFunc("feFuncR")
    this.FEGAUSSIANBLUR = this.createSVGDOMFunc("feGaussianBlur")
    this.FEIMAGE = this.createSVGDOMFunc("feImage")
    this.FEMERGE = this.createSVGDOMFunc("feMerge")
    this.FEMERGENODE = this.createSVGDOMFunc("feMergeNode")
    this.FEMORPHOLOGY = this.createSVGDOMFunc("feMorphology")
    this.FEOFFSET = this.createSVGDOMFunc("feOffset")
    this.FEPOINTLIGHT = this.createSVGDOMFunc("fePointLight")
    this.FESPECULARLIGHTING = this.createSVGDOMFunc("feSpecularLighting")
    this.FESPOTLIGHT = this.createSVGDOMFunc("feSpotLight")
    this.FETILE = this.createSVGDOMFunc("feTile")
    this.FETURBULENCE = this.createSVGDOMFunc("feTurbulence")
    this.FILTER = this.createSVGDOMFunc("filter")
    this.FONT = this.createSVGDOMFunc("font")
    this.FONT_FACE = this.createSVGDOMFunc("font-face")
    this.FONT_FACE_FORMAT = this.createSVGDOMFunc("font-face-format")
    this.FONT_FACE_NAME = this.createSVGDOMFunc("font-face-name")
    this.FONT_FACE_SRC = this.createSVGDOMFunc("font-face-src")
    this.FONT_FACE_URI = this.createSVGDOMFunc("font-face-uri")
    this.FOREIGNOBJECT = this.createSVGDOMFunc("foreignObject")
    this.G = this.createSVGDOMFunc("g")
    this.GLYPH = this.createSVGDOMFunc("glyph")
    this.GLYPHREF = this.createSVGDOMFunc("glyphRef")
    this.HKERN = this.createSVGDOMFunc("hkern")
    this.IMAGE = this.createSVGDOMFunc("image")
    this.LINE = this.createSVGDOMFunc("line")
    this.LINEARGRADIENT = this.createSVGDOMFunc("linearGradient")
    this.MARKER = this.createSVGDOMFunc("marker")
    this.MASK = this.createSVGDOMFunc("mask")
    this.METADATA = this.createSVGDOMFunc("metadata")
    this.MISSING_GLYPH = this.createSVGDOMFunc("missing-glyph")
    this.MPATH = this.createSVGDOMFunc("mpath")
    this.PATH = this.createSVGDOMFunc("path")
    this.PATTERN = this.createSVGDOMFunc("pattern")
    this.POLYGON = this.createSVGDOMFunc("polygon")
    this.POLYLINE = this.createSVGDOMFunc("polyline")
    this.RADIALGRADIENT = this.createSVGDOMFunc("radialGradient")
    this.RECT = this.createSVGDOMFunc("rect")
    this.SCRIPT = this.createSVGDOMFunc("script")
    this.SET = this.createSVGDOMFunc("set")
    this.STOP = this.createSVGDOMFunc("stop")
    this.STYLE = this.createSVGDOMFunc("style")
    this.SVG = this.createSVGDOMFunc("svg")
    this.SWITCH = this.createSVGDOMFunc("switch")
    this.SYMBOL = this.createSVGDOMFunc("symbol")
    this.TEXT = this.createSVGDOMFunc("text")
    this.TEXTPATH = this.createSVGDOMFunc("textPath")
    this.TITLE = this.createSVGDOMFunc("title")
    this.TREF = this.createSVGDOMFunc("tref")
    this.TSPAN = this.createSVGDOMFunc("tspan")
    this.USE = this.createSVGDOMFunc("use")
    this.VIEW = this.createSVGDOMFunc("view")
    this.VKERN = this.createSVGDOMFunc("vkern")
}

// The following line probably isn't neccesary since I don't export anything:
// MochiKit.Base._exportSymbols(this, SVGKit);
