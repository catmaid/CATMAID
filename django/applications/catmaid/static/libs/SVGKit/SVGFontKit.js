/***

SVGFontKit.js 0.1

See <http://svgkit.sourceforge.net/> for documentation, downloads, license, etc.

(c) 2006 Jason Gallicchio.
Licensed under the open source (GNU compatible) MIT License

TODO:
* PATH parser (by token and by command)
  - "M30,30 L150,150 Q60,70 70,150 L30,30"
  - ['M', 30, 30, 'L', 150, 150, 'Q', 60, 70 70, 150, 'L', 30, 30]
  - [ ['M', 30, 30], 
      ['L', 150, 150], 
      ['Q', 60, 70 70, 150], 
      ['L', 30, 30] ]
  - calculateBBox(path, stroke_width)  do all control points fall inside BBox? Not arcs
  - check: http://www.kevlindev.com/dom/path_parser/index.htm
  - Built in:
      p = document.getElementsByTagName('path')[13]
      p.pathSegList.getItem(1).pathSegTypeAsLetter
      p.pathSegList.getItem(1).angle
* Font Metrics
  - layoutText(text, font)  returns a list of starting points and glyphs
  - calculateBBox(text, font, size, stroke_width)  needs path parser
  - Looks like you can getBBox as long as it's added to the file (even in the defs), 
    not just after it's created.
***/

////////////////////////////
//  Setup
////////////////////////////

if (typeof(dojo) != 'undefined') {
    dojo.provide("SVGFontKit");
    dojo.require("SVGKit");
}
if (typeof(JSAN) != 'undefined') {
    JSAN.use("MochiKit.Iter", []);
}

try {
    if (typeof(SVGKit) == 'undefined') {
        throw "";
    }
} catch (e) {
    throw "SVGFontKit depends on SVGKit!";
}

if (typeof(SVGFontKit) == 'undefined' || SVGFontKit == null) {
    // Constructor
    SVGFontKit = function (widthOrIdOrNode, height, id /* optional */) {
        if (typeof(this.__init__)=='undefined' || this.__init__ == null){
            //log("You called SVGFontKit() as a fnuction without new.  Shame on you, but I'll give you a new object anyway");
            return new SVGFontKit(widthOrIdOrNode, height, id, type);
        }
        //log("constructor got: ", widthOrIdOrNode, height, id);
        this.__init__(widthOrIdOrNode, height, id);
        return null;
    };
}

SVGFontKit.NAME = "SVGFontKit";
SVGFontKit.VERSION = "0.1";
SVGFontKit.__repr__ = function () {
    return "[" + SVGFontKit.NAME + " " + SVGFontKit.VERSION + "]";
};
SVGFontKit.prototype.__repr__ = SVGFontKit.__repr__;

SVGFontKit.toString = function () {
    return this.__repr__();
};
SVGFontKit.prototype.toString = SVGFontKit.toString;


SVGFontKit.EXPORT = [
    "SVGFontKit"
];

SVGFontKit.EXPORT_OK = [
];




SVGFontKit.fonts = {}  // Mapping of fonts to font objects

SVGFontKit.text2path = function(svg) {
    SVGFontKit.do_fonts(svg)
    SVGFontKit.do_text(svg)
}

SVGFontKit.do_fonts = function(svg) {
    var font_elements = svg.svgDocument.getElementsByTagName('font')
    forEach(font_elements, function(font_element) {
        var font = {
            font_element : font_element,
            face : font_element.getElementsByTagName('font-face')[0],
            missing : font_element.getElementsByTagName('missing-glyph')[0],
            glyphs : font_element.getElementsByTagName('glyph'),
            hkerns : font_element.getElementsByTagName('hkern'),
            
            horizontal_adv_x : {},
            horizontal_adv_y : {},
            hkern_dict : {},   // Dictionary mapping unicode pairs to hkern
            vkern_dict : {},
            name_to_unicode : {},
            unicodes : [],  // Ordered list of unicodes (possibly multiple characters for ligatures)
            
            font_attrs : SVGFontKit.getAttributes(font_element)
        }
        font.face_attrs = SVGFontKit.getAttributes(font.face)
        
        // Change the IDs of the <font> and <font-face> elements
        SVGFontKit.fixID(font_element)
        SVGFontKit.fixID(font.face)
        
        // Add this font to the dictionary of font families
        var font_name = font.face_attrs['font-family']
        SVGFontKit.fonts[font_name] = font
        
        // Start a group in the <defs> that all of our <path> glyphs will go into
        var font_group = svg.G(font.font_attrs)
        font_element.parentNode.appendChild(font_group)
        
        var add_glyph_path = function(glyph) {
            var attrs = SVGFontKit.getAttributes(glyph)
            var unicode = attrs['unicode']
            if (unicode == null)
                unicode = 'missing-glyph'
            else {
                font.name_to_unicode[attrs['glyph-name']] = unicode
                font.unicodes.push(unicode)
            }
            var horizontal_adv_x = attrs['horiz-adv-x']
            if (horizontal_adv_x != null)
                font.horizontal_adv_x[unicode] = parseFloat(horizontal_adv_x)
            attrs['id'] = font.face_attrs['font-family'] + ' _ ' + unicode
            var path = svg.PATH(attrs)
            font_group.appendChild(path)
            
            var bbox = path.getBBox()
            log('BBox for', unicode, bbox.x, bbox.y, bbox.width, bbox.height)
            
        }
        
        add_glyph_path(font.missing)
        forEach(font.glyphs, add_glyph_path)
    })
}


SVGFontKit.do_text = function(svg) {

    var text_elements = svg.svgDocument.getElementsByTagName('text')
    
    var handle_text = function(text, font) {
        // Handles <text> and <tspan> elements.  <text> recursively calls this for all of it's <tspan>
        
        if (font == null)
            font = getStyle(text, "font-family")
        
        // If we don't have this font, let the system handle it.
        if (SVGFontKit.fonts[font] == null)
            return
        
        // Do the following things only apply to <text> and not to <tspan>?
        var size = getStyle(text, 'font-size')  // "30px"
        var style = getStyle(text, "font-style")  // 'normal'
        var variant = getStyle(text, "font-variant")  // 'normal'
        var weight = getStyle(text, "font-weight")  // 'normal'
        var stretch = getStyle(text, "font-stretch")  // 'normal'
        var text_align = getStyle(text, "text-align")  // 'start'
        var text_anchor = getStyle(text, "text-anchor")  // 'start'
        
        log("getAttributes(text)")
        var attrs = SVGFontKit.getAttributes(text)
        // Give the text element a different id if it has one that a script might reference
        SVGFontKit.fixID(text)
        var group = svg.G(attrs)
        var handle_text_child = function(child) {
            if (child.nodeType == child.TEXT_NODE) {
                SVGFontKit.string2paths(child.nodeValue, attrs['x'], attrs['y'], font, size, group, svg)
            }
            else if (child.tagName == 'tspan') {
                handle_text(child, font)
            }
        }
        
        forEach(text.childNodes, handle_text_child)
        text.parentNode.appendChild(group)
        //hideElement(text)
    }
    
    forEach(text_elements, handle_text)
}

SVGFontKit.path2text = function() {
}

SVGFontKit.fixID = function(element) {
    var id = element.getAttribute('id')
    if (id != null)
        element.setAttribute('id', id+'_SVGFontKit')
}

SVGFontKit.getAttributes = function(node) {
    /***
        Takes a node and returns a dictionary of its attributes
        that can be passed to the node-creation functions like 
        G() and PATH()
        Should handle namespaces properly.
    ***/
    var dict = {}
    var attrs = node.attributes
    for (var i=0; i<attrs.length; i++) {
        dict[ attrs[i].name] = attrs[i].value
    }
    return dict
}

SVGFontKit.string2paths = function(string, x_str, y_str, font, size, outter_group, svg) {
    /***
        x & y may be a single number, a list for the first n characters, or empty, which means zero.
    ***/
    // Create an outter group that can hold the overall transform from em-square units to pixels

    
    var x = SVGFontKit.parseDefault(x_str, 0)
    var y = SVGFontKit.parseDefault(y_str, 0)
    
    var units_per_em = 2048.0  // Should come from font
    var size = 30  // Should be converted from the string "30px"
    var scale = size/units_per_em
    var transform = 'translate('+x+','+y+')scale('+scale+','+(-scale)+')'
    var g = svg.G({'transform':transform})
    
    x = 0.0
    y = 0.0
    
    // For each character in the string, check to see if you need to kern, place the character, update x-position
    for (var i=0; i<string.length; i++) {  // Don't know if a ligature will eat up more than one character.
        // TODO: Ligatures: Go through all of the glyphs in order to see if they match the first n letters of the string.  (This seems inefficient, but that's how it's defined.)
        var unicode = 'missing-glyph';
        var unicodes = SVGFontKit.fonts[font].unicodes
        var glyph_number = 0;
        while ( glyph_number < unicodes.length && 
                 string.substr(i, unicodes[glyph_number].length) != unicodes[glyph_number] )
            glyph_number++
        if (glyph_number != unicodes.length) {
            unicode = unicodes[glyph_number]
            i += unicode.length - 1;
        }
        
        var href = '#' + font + ' _ ' + unicode
        var use =  svg.USE({'x':x, 'y':y, 'xlink:href': href})
        g.appendChild(use)
        x += SVGFontKit.fonts[font].horizontal_adv_x[unicode]
        // TODO: hkern   How do you kern ligatures?
        // TODO:  missing-glyphs
    }
    outter_group.appendChild(g)
}

SVGFontKit.parseDefault = function(string, def) {
    if (string != null)
        return parseFloat(string)
    else
        return def
}

SVGFontKit.defaultWhitespace = function(string) {
    /***
        When xml:space="default", the SVG user agent will do the following 
        using a copy of the original character data content. First, it 
        will remove all newline characters. Then it will convert all tab 
        characters into space characters. Then, it will strip off all 
        leading and trailing space characters. Then, all contiguous 
        space characters will be consolidated.
    ***/
}
