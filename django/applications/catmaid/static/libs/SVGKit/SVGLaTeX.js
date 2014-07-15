/***

SVGLaTeX.js 0.1

See <http://svgkit.sourceforge.net/> for documentation, downloads, license, etc.

(c) 2006 Jason Gallicchio.
Licensed under the open source (GNU compatible) MIT License

***/


SVGLaTeX = {}

SVGLaTeX.base_url = SVGKit._cgi_dir+'latex2svg.py'

SVGLaTeX.getDefferedFromLaTeX = function(latex) {
    var url = SVGLaTeX.base_url + '?' + queryString({latex:latex})
    //var req = getXMLHttpRequest();
    //req.overrideMimeType("text/xml");
    //req.open("GET", url , true);
    //var d = sendXMLHttpRequest(req);
    var query = {latex:latex}
    var d = doXHR(SVGLaTeX.base_url, {method:'GET', queryString:query, mineType:'text/xml', sendContent:queryString(query)})
    return d
}

SVGLaTeX.doit = function(latex, success, failure) {
    var success_function = success
    var callback = function(req) {
        //window.xml = req.responseXML
        var xml = req.responseXML
        var content = xml.getElementById('content')
        //clone() ?
        success_function(content)
    }
    var d = SVGLaTeX.getDefferedFromLaTeX(latex)
    d.addCallback(callback)
    //d.addErrback(failure)
}

SVGLaTeX.fixBBox = function(content) {
    /***
        The SVG needs to be displayed on the screen for this to work
    ***/
    elem = xml.getElementById('content')
    var bbox = elem.getBBox()
}

