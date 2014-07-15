/***

SVGCanvasPaths.js 0.1

See <http://svgkit.sourceforge.net/> for documentation, downloads, license, etc.

(c) 2006 Jason Gallicchio.
Licensed under the open source (GNU compatible) MIT License

Additional Paths and Inkscape Markers that are sometimes useful.
        
***/



////////////////////////////
//  Setup
////////////////////////////

if (typeof(dojo) != 'undefined') {
    dojo.require("SVGCanvas");
}

try {
    if (typeof(SVGCanvas) == 'undefined') {
        throw "";
    }
} catch (e) {
    throw "SVGCanvasPaths depends on SVGCanvas!";
}

////////////////////////////
//  Standard Paths (can be used as Markers)
////////////////////////////


SVGCanvas.prototype.pollygon = function(n, size /* =10 */, rotation /* =0 */, method /* ='area' */) {
    /***
        SVG Only
        Issue commands (but don't stroke or fill) for a pollygon based on its:
        'outer' radiu, 'inner' radius, or 'area'
        The area method is good for plots where people perceive area as magnitude, not direction.
        TODO: Inkscape's rounded corners, randomization, and non-regular stars.
    ***/
    rotation = SVGKit.firstNonNull(rotation, 0);
    method = SVGKit.firstNonNull(method, 'area');
    size = SVGKit.firstNonNull(size, 10);
    
    var outer_radius = size;
    if (method == 'area')
        outer_radius = Math.sqrt(2*size*size/n/Math.sin(2*Math.PI/n));
    else if (method == 'inner')
        outer_radius = Math.sqrt(size*Math.Sin(Math.PI/n));
        
    this.beginPath();
    var th = rotation - Math.PI/2;
    this.moveTo(outer_radius*Math.cos(th), outer_radius*Math.sin(th));
    for (var i=1; i<n; i++) {
        th = th + 2*Math.PI/n;
        this.lineTo(outer_radius*Math.cos(th), outer_radius*Math.sin(th));
    }
    this.closePath();
}

SVGCanvas.prototype.star = function(n, outer_radius /* =10 */, inner_radius /* =outer_radius/3 */, rotation /* =0 */) {
    /***
        SVG Only
        Issue commands (but don't stroke or fill) for a star based on its inner and outer radius
    ***/
    outer_radius = SVGKit.firstNonNull(outer_radius, 10);
    inner_radius = SVGKit.firstNonNull(inner_radius, outer_radius/3);
    rotation = SVGKit.firstNonNull(rotation, 0);
    
    this.beginPath();
    var th = rotation - Math.PI/2;
    this.moveTo(outer_radius*Math.cos(th), outer_radius*Math.sin(th));
    for (var i=0; i<n; i++) {
        this.lineTo(outer_radius*Math.cos(th), outer_radius*Math.sin(th));
        th = th + Math.PI/(n);
        this.lineTo(inner_radius*Math.cos(th), inner_radius*Math.sin(th));
        th = th + Math.PI/(n);
    }
    this.closePath();
}

SVGCanvas.prototype.gear = function(n /*... f1, r1, f2, r2 */) {
    /***
        SVG Only
        Issue commands (but don't stroke or fill) for a regular gear-like shape.
        f_n is the fraction of the way to the next radius (0-1)
        r_n is the nth radius. 
    ***/
    this.beginPath();
    //var th = rotation - Math.PI/2;
    var th = 0;
    th = - Math.PI/2;
    this.moveTo(arguments[2]*Math.cos(th), arguments[2]*Math.sin(th));
    for (var i=0; i<n; i++) {
        for (var j=0; j<(arguments.length-1)/2; j++) {
            var angle = th + 2*Math.PI*arguments[2*j+1]/(n);
            var r = arguments[2*j+2];
            this.lineTo(r*Math.cos(angle), r*Math.sin(angle));
        }
        th = th + 2*Math.PI/(n);
    }
    this.closePath();
}

/*
function (ctx) {
 ctx.translate(100,100);
 ctx.strokeCircle(0,0,38);
 ctx.gear(30, .2,40, .3,55, .4,60, .6,60,  .7,55, .8,40);
 var elem = ctx.stroke();
 ctx.svg.rotate(elem,-360/5)
} 
*/

SVGCanvas.prototype.asterisk = function(n, outer_radius /* =10 */, inner_radius /* =0 */, rotation /* = 0 */) {
    /***
        Issue commands (but don't stroke or fill) for an open star or asterisk based on its inner and outer radius
    ***/
    outer_radius = SVGKit.firstNonNull(outer_radius, 10);
    inner_radius = SVGKit.firstNonNull(inner_radius, 0);
    rotation = SVGKit.firstNonNull(rotation, 0);
    
    this.beginPath();
    var th = rotation - Math.PI/2;
    for (var i=0; i<n; i++) {
        this.moveTo(inner_radius*Math.cos(th), inner_radius*Math.sin(th));
        this.lineTo(outer_radius*Math.cos(th), outer_radius*Math.sin(th));
        th = th + 2*Math.PI/n;
    }
}


////////////////////////////
//  Inkscape Stock Markers (all but Torso and Legs)
////////////////////////////


SVGCanvas.prototype.inkscapeArrow1 = function() {
    /*
    style="fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none"
    d="M 0.0,0.0 L 5.0,-5.0 L -12.5,0.0 L 5.0,5.0 L 0.0,0.0 z "
    */
    this.lineWidth = 1.0;
    this.beginPath();
    this.moveTo(0.0,0.0);
    this.lineTo(5.0,-5.0);
    this.lineTo(-12.5,0.0);
    this.lineTo(5.0,5.0);
    this.lineTo(0.0,0.0);
    this.closePath();
    this.fill();
    this.stroke();
}

SVGCanvas.prototype.inkscapeArrow1Lstart = function() {
    this.scale(0.8);
    this.inkscapeArrow1();
}

SVGCanvas.prototype.inkscapeArrow1Lend = function() {
    this.scale(0.8);
    this.rotate(Math.PI);
    this.inkscapeArrow1();
}

SVGCanvas.prototype.inkscapeArrow1Mstart = function() {
    this.scale(0.4);
    this.inkscapeArrow1()
}

SVGCanvas.prototype.inkscapeArrow1Mend = function() {
    this.scale(0.4);
    this.rotate(Math.PI);
    this.inkscapeArrow1();
}

SVGCanvas.prototype.inkscapeArrow1Sstart = function() {
    this.scale(0.2);
    this.inkscapeArrow1();
}

SVGCanvas.prototype.inkscapeArrow1Send = function() {
    this.scale(0.2);
    this.rotate(Math.PI);
    this.inkscapeArrow1();
}

SVGCanvas.prototype.inkscapeArrow2 = function() {
    /*
    style="font-size:12.0;fill-rule:evenodd;stroke-width:0.62500000;stroke-linejoin:round"   
    d="M 8.7185878,4.0337352 L -2.2072895,0.016013256 L 8.7185884,-4.0017078 C 6.9730900,-1.6296469 6.9831476,1.6157441 8.7185878,4.0337352 z "      
    */
    this.translate(-5,0);
    this.lineWidth = 0.62500000;
    this.lineJoin = 'round';
    this.beginPath();
    this.moveTo(8.7185878,4.0337352);
    this.lineTo(-2.2072895,0.016013256);
    this.lineTo(8.7185884,-4.0017078);
    this.bezierCurveTo(6.9730900,-1.6296469, 6.9831476,1.6157441, 8.7185878,4.0337352);
    this.closePath();
    this.fill();
    this.stroke();
}


SVGCanvas.prototype.inkscapeArrow2Lstart = function() {
    this.scale(1.1);
    this.inkscapeArrow2()
}

SVGCanvas.prototype.inkscapeArrow2Lend = function() {
    this.scale(1.1);
    this.rotate(Math.PI);
    this.inkscapeArrow2();
}

SVGCanvas.prototype.inkscapeArrow2Mstart = function() {
    this.scale(0.6);
    this.inkscapeArrow2()
}

SVGCanvas.prototype.inkscapeArrow2Mend = function() {
    this.scale(0.6);
    this.rotate(Math.PI);
    this.inkscapeArrow2();
}

SVGCanvas.prototype.inkscapeArrow2Sstart = function() {
    this.scale(0.3);
    this.inkscapeArrow2()
}

SVGCanvas.prototype.inkscapeArrow2Send = function() {
    this.scale(0.3);
    this.rotate(Math.PI);
    this.inkscapeArrow2();
}

SVGCanvas.prototype.inkscapeTail = function() {
    /*
    style="fill:none;fill-rule:evenodd;stroke:#000000;stroke-width:0.8;marker-start:none;marker-end:none;stroke-linecap:round" />
    d="M -3.8048674,-3.9585227 L 0.54352094,-0.00068114835"
    d="M -1.2866832,-3.9585227 L 3.0617053,-0.00068114835"
    d="M 1.3053582,-3.9585227 L 5.6537466,-0.00068114835"
    d="M -3.8048674,4.1775838 L 0.54352094,0.21974226"
    d="M -1.2866832,4.1775838 L 3.0617053,0.21974226"
    d="M 1.3053582,4.1775838 L 5.6537466,0.21974226"
    */
    this.scale(-1.2)
    this.lineWidth = 0.8;
    this.lineJoin = 'round';
    this.beginPath();
    this.moveTo(-3.8048674,-3.9585227);
    this.lineTo(0.54352094,-0.00068114835);
    this.stroke();
    this.moveTo(-1.2866832,-3.9585227);
    this.lineTo(3.0617053,-0.00068114835);
    this.stroke();
    this.moveTo(1.3053582,-3.9585227);
    this.lineTo(5.6537466,-0.00068114835);
    this.stroke();
    this.moveTo(-3.8048674,4.1775838);
    this.lineTo(0.54352094,0.21974226);
    this.stroke();
    this.moveTo(-1.2866832,4.1775838);
    this.lineTo(3.0617053,0.21974226);
    this.stroke();
    this.moveTo(1.3053582,4.1775838);
    this.lineTo(5.6537466,0.21974226);
    this.stroke();
}


SVGCanvas.prototype.inkscapeDistance = function() {
    /*
    style="fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none" />
    d="M 0.0,0.0 L 5.0,-5.0 L -12.5,0.0 L 5.0,5.0 L 0.0,0.0 z "
    style="fill:none;fill-opacity:0.75000000;fill-rule:evenodd;stroke:#000000;stroke-width:1.2pt;marker-start:none" 
    d="M -14.759949,-7 L -14.759949,65"
    */
    this.translate(8,0)
    this.inkscapeArrow1()
    this.strokeWidth = 1.2;
    this.beginPath();
    this.moveTo(-14.759949,-7);
    this.lineTo(-14.759949,65);
    this.stroke();
}

SVGCanvas.prototype.inkscapeDistanceIn = function() {
    this.scale(0.6,0.6)
    this.inkscapeDistance();
}

SVGCanvas.prototype.inkscapeDistanceOut = function() {
    this.scale(-0.6,0.6)
    this.inkscapeDistance();
}

SVGCanvas.prototype.inkscapeDot = function() {
    /*
    d="M -2.5,-1.0 C -2.5,1.7600000 -4.7400000,4.0 -7.5,4.0 C -10.260000,4.0 -12.5,1.7600000 -12.5,-1.0 C -12.5,-3.7600000 -10.260000,-6.0 -7.5,-6.0 C -4.7400000,-6.0 -2.5,-3.7600000 -2.5,-1.0 z "
    style="fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none;marker-end:none"
    transform="scale(0.8) translate(7.125493, 1)"
    */
    this.strokeWidth = 1.0;
    this.translate(7.125493, 1);
    this.beginPath();
    this.moveTo(-2.5,-1.0);
    this.bezierCurveTo(-2.5,1.76, -4.74,4.0, -7.5,4.0);
    this.bezierCurveTo(-10.26,4.0, -12.5,1.76, -12.5,-1.0);
    this.bezierCurveTo(-12.5,-3.76, -10.26,-6.0, -7.5,-6.0);
    this.bezierCurveTo( -4.74,-6.0, -2.5,-3.76, -2.5,-1.0);
    this.closePath();
    this.fill();
    this.stroke();
}

SVGCanvas.prototype.inkscapeDot_l = function() {
    this.scale(0.8)
    this.inkscapeDot();
}

SVGCanvas.prototype.inkscapeDot_m = function() {
    this.scale(0.4)
    this.inkscapeDot();
}

SVGCanvas.prototype.inkscapeDot_s = function() {
    this.scale(0.2)
    this.inkscapeDot();
}

SVGCanvas.prototype.inkscapeSquare = function() {
    /*
    style="fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none"
    d="M -5.0,-5.0 L -5.0,5.0 L 5.0,5.0 L 5.0,-5.0 L -5.0,-5.0 z "
    */
    this.strokeWidth = 1.0;
    this.beginPath();
    this.moveTo(-5.0,-5.0);
    this.lineTo(-5.0,5.0);
    this.lineTo(5.0,5.0);
    this.lineTo(5.0,-5.0);
    this.lineTo(-5.0,-5.0);
    this.closePath();
    this.fill();
    this.stroke();
}

SVGCanvas.prototype.inkscapeSquareL = function() {
    this.scale(0.8)
    this.inkscapeSquare();
}

SVGCanvas.prototype.inkscapeSquareM = function() {
    this.scale(0.4)
    this.inkscapeSquare();
}

SVGCanvas.prototype.inkscapeSquareS = function() {
    this.scale(0.2)
    this.inkscapeSquare();
}


SVGCanvas.prototype.inkscapeDiamond = function() {
    /*
    style="fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none"
    d="M -2.1579186e-005,-7.0710768 L -7.0710894,-8.9383918e-006 L -2.1579186e-005,7.0710589 L 7.0710462,-8.9383918e-006 L -2.1579186e-005,-7.0710768 z "
    */
    this.strokeWidth = 1.0;
    this.beginPath();
    this.moveTo(0,-7.0710768);
    this.lineTo(-7.0710894,0);
    this.lineTo(0,7.0710589);
    this.lineTo(7.0710462,0);
    this.lineTo(0,-7.0710768);
    this.closePath();
    this.fill();
    this.stroke();
}

SVGCanvas.prototype.inkscapeDiamondL = function() {
    this.scale(0.8)
    this.inkscapeDiamond();
}

SVGCanvas.prototype.inkscapeDiamondM = function() {
    this.scale(0.4)
    this.inkscapeDiamond();
}

SVGCanvas.prototype.inkscapeDiamondS = function() {
    this.scale(0.2)
    this.inkscapeDiamond();
}

SVGCanvas.prototype.inkscapeTriangle = function() {
    /*
    style="fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none"
    d="M 5.77,0.0 L -2.88,5.0 L -2.88,-5.0 L 5.77,0.0 z "
    */
    this.strokeWidth = 1.0;
    this.beginPath();
    this.moveTo(5.77,0.0);
    this.lineTo(-2.88,5.0);
    this.lineTo(-2.88,-5.0);
    this.lineTo(5.77,0.0);
    this.closePath();
    this.fill();
    this.stroke();
}

SVGCanvas.prototype.inkscapeTriangleInL = function() {
    this.scale(-0.8)
    this.inkscapeTriangle();
}

SVGCanvas.prototype.inkscapeTriangleInM = function() {
    this.scale(-0.4)
    this.inkscapeTriangle();
}

SVGCanvas.prototype.inkscapeTriangleInS = function() {
    this.scale(-0.2)
    this.inkscapeTriangle();
}

SVGCanvas.prototype.inkscapeTriangleOutL = function() {
    this.scale(0.8)
    this.inkscapeTriangle();
}

SVGCanvas.prototype.inkscapeTriangleOutM = function() {
    this.scale(0.4)
    this.inkscapeTriangle();
}

SVGCanvas.prototype.inkscapeTriangleOutS = function() {
    this.scale(0.2)
    this.inkscapeTriangle();
}

SVGCanvas.prototype.inkscapeStop = function() {
    /*
    style="fill:none;fill-opacity:0.75000000;fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt"
    d="M 0.0,5.65 L 0.0,-5.65"
    */
    this.strokeWidth = 1.0;
    this.beginPath();
    this.moveTo(0.0,5.65);
    this.lineTo(0.0,-5.65);
    this.stroke();
}

SVGCanvas.prototype.inkscapeStopL = function() {
    this.scale(0.8)
    this.inkscapeStop();
}

SVGCanvas.prototype.inkscapeStopM = function() {
    this.scale(0.4)
    this.inkscapeStop();
}

SVGCanvas.prototype.inkscapeStopS = function() {
    this.scale(0.2)
    this.inkscapeStop();
}


SVGCanvas.prototype.inkscapeSemiCircleIn = function() {
    /*
    style="fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none;marker-end:none"
    d="M -0.37450702,-0.045692580 C -0.37450702,2.7143074 1.8654930,4.9543074 4.6254930,4.9543074 L 4.6254930,-5.0456926 C 1.8654930,-5.0456926 -0.37450702,-2.8056926 -0.37450702,-0.045692580 z "
    */
    this.scale(0.6);
    this.strokeWidth = 1.0;
    this.beginPath();
    this.moveTo(-0.37450702,-0.045692580);
    this.bezierCurveTo(-0.37450702,2.7143074, 1.8654930,4.9543074, 4.6254930,4.9543074);
    this.lineTo(4.6254930,-5.0456926);
    this.bezierCurveTo(1.8654930,-5.0456926, -0.37450702,-2.8056926, -0.37450702,-0.045692580);
    this.closePath();
    this.fill();
    this.stroke();
}

SVGCanvas.prototype.inkscapeSemiCircleOut = function() {
    /*
    style="fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none;marker-end:none"
    M -2.5,-0.80913858 C -2.5,1.9508614 -4.7400000,4.1908614 -7.5,4.1908614 L -7.5,-5.8091386 C -4.7400000,-5.8091386 -2.5,-3.5691386 -2.5,-0.80913858 z
    */
    this.scale(0.6)
    this.translate(7.125493,0.763446)
    this.strokeWidth = 1.0;
    this.beginPath();
    this.moveTo(-2.5,-0.80913858);
    this.bezierCurveTo(-2.5,1.9508614, -4.7400000,4.1908614, -7.5,4.1908614);
    this.lineTo( -7.5,-5.8091386);
    this.bezierCurveTo(-4.7400000,-5.8091386, -2.5,-3.5691386, -2.5,-0.80913858);
    this.closePath();
    this.fill();
    this.stroke();
}

SVGCanvas.prototype.inkscapeSemiCurveIn = function() {
    /*
    style="fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none;marker-end:none;fill:none"
    d="M 4.6254930,-5.0456926 C 1.8654930,-5.0456926 -0.37450702,-2.8056926 -0.37450702,-0.045692580 C -0.37450702,2.7143074 1.8654930,4.9543074 4.6254930,4.9543074"
    */
    this.scale(0.6);
    this.strokeWidth = 1.0;
    this.beginPath();
    this.moveTo(4.6254930,-5.0456926);
    this.bezierCurveTo(1.8654930,-5.0456926, -0.37450702,-2.8056926, -0.37450702,-0.045692580);
    this.bezierCurveTo( -0.37450702,2.7143074, 1.8654930,4.9543074, 4.6254930,4.9543074);
    this.stroke();
}

SVGCanvas.prototype.inkscapeSemiCurveOut = function() {
    /*
    style="fill:none;fill-rule:evenodd;stroke:#000000;stroke-width:1.0pt;marker-start:none;marker-end:none"
    d="M -5.4129913,-5.0456926 C -2.6529913,-5.0456926 -0.41299131,-2.8056926 -0.41299131,-0.045692580 C -0.41299131,2.7143074 -2.6529913,4.9543074 -5.4129913,4.9543074"
    */
    this.scale(0.6);
    this.strokeWidth = 1.0;
    this.beginPath();
    this.moveTo(-5.4129913,-5.0456926);
    this.bezierCurveTo(-2.6529913,-5.0456926, -0.41299131,-2.8056926, -0.41299131,-0.045692580);
    this.bezierCurveTo(-0.41299131,2.7143074, -2.6529913,4.9543074, -5.4129913,4.9543074);
    this.stroke();
}


SVGCanvas.prototype.inkscapeSemiCurvyCross = function() {
    this.save();
    this.inkscapeSemiCurveIn()
    this.restore();
    this.inkscapeSemiCurveOut()
}


SVGCanvas.prototype.inkscapeSemiScissors = function() {
    this.beginPath();
    this.moveTo(9.0898857,-3.6061018);
    this.bezierCurveTo(8.1198849,-4.7769976, 6.3697607,-4.7358294, 5.0623558,-4.2327734 );
    this.lineTo(-3.1500488,-1.1548705 );
    this.bezierCurveTo(-5.5383421,-2.4615840, -7.8983361,-2.0874077, -7.8983361,-2.7236578 );
    this.bezierCurveTo(-7.8983361,-3.2209742, -7.4416699,-3.1119800, -7.5100293,-4.4068519 );
    this.bezierCurveTo(-7.5756648,-5.6501286, -8.8736064,-6.5699315, -10.100428,-6.4884954 );
    this.bezierCurveTo(-11.327699,-6.4958500, -12.599867,-5.5553341, -12.610769,-4.2584343 );
    this.bezierCurveTo(-12.702194,-2.9520479, -11.603560,-1.7387447, -10.304005,-1.6532027 );
    this.bezierCurveTo(-8.7816644,-1.4265411, -6.0857470,-2.3487593, -4.8210600,-0.082342643 );
    this.bezierCurveTo(-5.7633447,1.6559151, -7.4350844,1.6607341, -8.9465707,1.5737277 );
    this.bezierCurveTo(-10.201445,1.5014928, -11.708664,1.8611256, -12.307219,3.0945882 );
    this.bezierCurveTo(-12.885586,4.2766744, -12.318421,5.9591904, -10.990470,6.3210002 );
    this.bezierCurveTo(-9.6502788,6.8128279, -7.8098011,6.1912892, -7.4910978,4.6502760 );
    this.bezierCurveTo(-7.2454393,3.4624530, -8.0864637,2.9043186, -7.7636052,2.4731223 );
    this.bezierCurveTo(-7.5199917,2.1477623, -5.9728246,2.3362771, -3.2164999,1.0982979 );
    this.lineTo(5.6763468,4.2330688 );
    this.bezierCurveTo(6.8000164,4.5467672, 8.1730685,4.5362646, 9.1684433,3.4313614 );
    this.lineTo(-0.051640930,-0.053722219 );
    this.lineTo(9.0898857,-3.6061018 );
    this.closePath();
    this.moveTo(-9.2179159,-5.5066058 );
    this.bezierCurveTo(-7.9233569,-4.7838060, -8.0290767,-2.8230356, -9.3743431,-2.4433169 );
    this.bezierCurveTo(-10.590861,-2.0196559, -12.145370,-3.2022863, -11.757521,-4.5207817 );
    this.bezierCurveTo(-11.530373,-5.6026336, -10.104134,-6.0014137, -9.2179159,-5.5066058 );
    this.closePath();
    this.moveTo(-9.1616516,2.5107591);
    this.bezierCurveTo(-7.8108215,3.0096239, -8.0402087,5.2951947, -9.4138723,5.6023681 );
    this.bezierCurveTo(-10.324932,5.9187072, -11.627422,5.4635705, -11.719569,4.3902287 );
    this.bezierCurveTo(-11.897178,3.0851737, -10.363484,1.9060805, -9.1616516,2.5107591 );
    this.closePath();
    this.stroke();
}

SVGCanvas.prototype.inkscapeSemiClub = function() {
    /*
    style="fill-rule:evenodd;stroke:#000000;stroke-width:0.74587913pt;marker-start:none"
    */
    this.scale(0.6);
    this.strokeWidth = 0.74587913;
    this.beginPath();
    this.moveTo(-1.5971367,-7.0977635 );
    this.bezierCurveTo(-3.4863874,-7.0977635, -5.0235187,-5.5606321, -5.0235187,-3.6713813 );
    this.bezierCurveTo(-5.0235187,-3.0147015, -4.7851656,-2.4444556, -4.4641095,-1.9232271 );
    this.bezierCurveTo(-4.5028609,-1.8911157, -4.5437814,-1.8647646, -4.5806531,-1.8299921 );
    this.bezierCurveTo(-5.2030765,-2.6849849, -6.1700514,-3.2751330, -7.3077730,-3.2751330 );
    this.bezierCurveTo(-9.1970245,-3.2751331, -10.734155,-1.7380016, -10.734155,0.15124914 );
    this.bezierCurveTo(-10.734155,2.0404999, -9.1970245,3.5776313, -7.3077730,3.5776313 );
    this.bezierCurveTo(-6.3143268,3.5776313, -5.4391540,3.1355702, -4.8137404,2.4588126 );
    this.bezierCurveTo(-4.9384274,2.8137041, -5.0235187,3.1803000, -5.0235187,3.5776313 );
    this.bezierCurveTo(-5.0235187,5.4668819, -3.4863874,7.0040135, -1.5971367,7.0040135 );
    this.bezierCurveTo(0.29211394,7.0040135, 1.8292454,5.4668819, 1.8292454,3.5776313 );
    this.bezierCurveTo(1.8292454,2.7842354, 1.5136868,2.0838028, 1.0600576,1.5031550 );
    this.bezierCurveTo(2.4152718,1.7663868, 3.7718375,2.2973711, 4.7661444,3.8340272 );
    this.bezierCurveTo(4.0279463,3.0958289, 3.5540908,1.7534117, 3.5540908,-0.058529361); 
    this.lineTo(2.9247554,-0.10514681 );
    this.lineTo(3.5074733,-0.12845553 );
    this.bezierCurveTo(3.5074733,-1.9403966, 3.9580199,-3.2828138, 4.6962183,-4.0210121 );
    this.bezierCurveTo(3.7371277,-2.5387813, 2.4390549,-1.9946496, 1.1299838,-1.7134486 );
    this.bezierCurveTo(1.5341802,-2.2753578, 1.8292454,-2.9268556, 1.8292454,-3.6713813 );
    this.bezierCurveTo(1.8292454,-5.5606319, 0.29211394,-7.0977635, -1.5971367,-7.0977635 );
    this.closePath();
    this.fill();
    this.stroke();
}
