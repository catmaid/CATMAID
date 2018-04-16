/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
  */

(function(CATMAID) {

  var svgMimeType = 'image/svg+xml';

  var namespaces = {
    svg: 'http://www.w3.org/2000/svg',
    xlink: 'http://www.w3.org/1999/xlink',
    ev: 'http://www.w3.org/2001/xml-events',
    xmlns: 'http://www.w3.org/2000/xmlns/'
  };

  /**
   * Create new SVG documents with some basic line, text and circle primitives.
   * Viewport position and dimensions are optional.
   */
  var SVGFactory = function(width, height, viewX, viewY, viewWidth, viewHeight) {
    if (!width) {
      throw new CATMAID.ValueError("SVG needs valid width");
    }

    if (!height) {
      throw new CATMAID.ValueError("SVG needs valid height");
    }

    this.svgVersion = '1.1';

    this.svg = document.createElementNS(namespaces.svg, 'svg');
    this.svg.setAttributeNS(namespaces.xmlns, "xmlns:xlink",
        namespaces.xlink);
    this.svg.setAttribute('width', width);
    this.svg.setAttribute('height', height);

    if (undefined !== viewX && undefined !== viewY &&
        undefined !== viewWidth && undefined !== viewHeight) {
      this.svg.setAttribute('viewBox', viewX + " " + viewY + " " +
           viewWidth + " " + viewHeight);
    }

    this.markers = {};
    this.markerIds = {};
  };

  SVGFactory.prototype.getNamespaces = function() {
    return namespaces;
  };

  SVGFactory.prototype.addMarker = function(id, element, width, height, refX, refY, units, style, type) {
    if (style) {
      var svgStyle = this.createSvgStyle(style);
      if (svgStyle.length > 0) {
        element.setAttribute('style', svgStyle);
      }
    }
    var marker = document.createElementNS(this.getNamespaces().svg, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('markerWidth', width);
    marker.setAttribute('markerHeight', height);
    marker.setAttribute('refX', refX);
    marker.setAttribute('refY', refY);
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', units);

    if (type) marker.setAttribute('catmaidtype', type);

    marker.appendChild(element);

    this.defs = null;
    this.markers[id] = marker;
  };

  /** Please ensure that inputs are non-null and non-undefined, or the ID will be bogus. */
  SVGFactory.prototype.getMarkerId = function(type, color, width, height, refX, refY) {
    var hash = type + '-' + color + '-' + width + '-' + height + '-' + refX + '-' + refY;
    var markerId = this.markerIds[hash];
    return markerId === undefined ? ('marker-' + Object.keys(this.markers).length) : markerId;
  };

  /**
   * Return a string representing the path in SVG form
   * @param path An array of points, each as an array of length 2. */
  SVGFactory.prototype._asSVGPath = function(path, closed) {
    return 'M' + path[0].join(',') + ' '
           + path.slice(1).map(function(p) { return 'L' + p[0] + ',' + p[1]; }).join(' ')
           + (closed ? ' Z' : '');
  };

  SVGFactory.prototype.addArrowMarker = function(id, width, height, refX, refY, units, style) {
    var arrow = document.createElementNS(this.getNamespaces().svg, 'path');
    //
    //      0,height/2
    //       |\
    //       | \ width,0
    //       | /
    //       |/
    //      0,-height/2
    //
    var path = [[0,      0],
                [0,      height / 2.0],
                [width,  0],
                [0,     -height / 2.0],
                [0,      0]];

    arrow.setAttribute('d', this._asSVGPath(path, true));

    /*
    arrow.setAttribute('d',
         'M0,0' +
        ' L0,' + (height/2.0) +
        ' L' + width + ',0' +
        ' L0,' + (-height/2.0) +
        ' Z');
    */

    this.addMarker(id, arrow, width, height, refX, refY, units, style, "arrow");
  };

  SVGFactory.prototype.addTeeMarker = function(id, width, height, refX, refY, units, style) {
    var tee = document.createElementNS(this.getNamespaces().svg, 'path');
    //
    // 0,height/2    width/4,height/2
    //            --
    //            ||
    //            ||
    //            ||
    //            --
    // 0,-height/2   width/4,-height/2
    //
    
    var w4 = width / 4.0,
        h2 = height / 2.0;

    var path = [[-w4, h2],
                [0, h2],
                [0, -h2],
                [-w4, -h2]];

    tee.setAttribute('d', this._asSVGPath(path, true));

    this.addMarker(id, tee, width, height, refX, refY, units, style, "tee");
  };


  SVGFactory.prototype.addCircleMarker = function(id, width, height, refX, refY, units, style) {
    var circle = document.createElementNS(this.getNamespaces().svg, 'path');
    // Unit circle defined with bezier control points, scaled by width
    var r = width/2;
    var path = ["m", r, 0, "a",
                 r, r, "0 0 1",
                -r, r,
                 r, r, "0 0 1",
                -r,-r,
                 r, r, "0 0 1",
                 r,-r,
                 r, r, "0 0 1",
                 r, r, "z"];

    circle.setAttribute('d', path.join(" "));

    this.addMarker(id, circle, width, height, refX, refY, units, style, "circle");
  };

  SVGFactory.prototype.addSquareMarker = function(id, width, height, refX, refY, units, style) {
    var square = document.createElementNS(this.getNamespaces().svg, 'path');
    var h2 = height / 2.0;
    var path = [[-width, h2],
                [0, h2],
                [0, -h2],
                [-width, -h2]];
    square.setAttribute('d', this._asSVGPath(path, true));

    this.addMarker(id, square, width, height, refX, refY, units, style, "square");
  };

  SVGFactory.prototype.addDiamondMarker = function(id, width, height, refX, refY, units, style) {
    var diamond = document.createElementNS(this.getNamespaces().svg, 'path');
    var w2 = width / 2.0;
    var h2 = height / 2.0;
    var path = [[-w2, 0],
                [0, h2],
                [w2, 0],
                [0, -h2]];
    diamond.setAttribute('d', this._asSVGPath(path, true));

    this.addMarker(id, diamond, width, height, refX, refY, units, style, "diamond");
  };

  SVGFactory.prototype.addVeeMarker = function(id, width, height, refX, refY, units, style) {
    var vee = document.createElementNS(this.getNamespaces().svg, 'path');
    var w2 = width / 2.0;
    var h2 = height / 2.0;
    var path = [[-w2, h2],
                [ w2, 0],
                [-w2, -h2],
                [  0, 0]];
    vee.setAttribute('d', this._asSVGPath(path, true));

    this.addMarker(id, vee, width, height, refX, refY, units, style, "vee");
  };

  SVGFactory.prototype.addTriangleTeeMarker = function(id, width, height, refX, refY, units, style) {
    var tee = document.createElementNS(this.getNamespaces().svg, 'path');
    
    var w2 = width / 2.0,
        w4 = width / 4.0,
        h2 = height / 2.0;

    var path = [[     -w2, h2],
                [-w2 + w4, h2],
                [-w2 + w4, 0],
                [       0, 0],
                [       0, h2],
                [   width, 0],
                [       0, -h2],
                [       0, 0],
                [-w2 + w4, 0],
                [-w2 + w4, -h2],
                [     -w2, -h2]];

    tee.setAttribute('d', this._asSVGPath(path, true));

    this.addMarker(id, tee, width, height, refX, refY, units, style, "triangle-tee");
  };

  SVGFactory.prototype.createAndAddMarker = function(arrowId, options, arrowStyle) {
    var supported = {
      triangle: "Arrow",
      circle: "Circle",
      tee: "Tee",
      square: "Square",
      diamond: "Diamond",
      vee: "Vee",
      "triangle-tee": "TriangleTee",
    };

    var type = supported[options.arrow];

    if (!type) {
        console.log("Ignoring unknown end marker type: " + options.arrow);
        return;
    }

    var width = options.arrowWidth,
        height = options.arrowHeight,
        refX = options.refX,
        refY = options.refY,
        units = options.arrowUnit;

    width = width === undefined ? 3.0 : width;
    height = height === undefined ? width : height;
    refX = refX === undefined ? 0 : refX;
    refY = refY === undefined ? 0 : refY;
    units = units === undefined ? 'strokeWidth' : units;

    // Invoke the type-appropriate marker constructor
    this["add" + type + "Marker"](arrowId, width, height,
            refX, refY, units, arrowStyle);
  };

  function flattenStyle(key) {
    return key + ': ' + this[key];
  }

  /**
   * Parse a style object and create a SVG compatible syle string.
   */
  SVGFactory.prototype.createSvgStyle = function(styles) {
    return Object.keys(styles).map(flattenStyle, styles).join(';') + ";";
  };

  /**
   * Create a SVG circle element with the given properties.
   *
   * The passed in style is expected to contain CSS styles.
   */
  SVGFactory.prototype.createCircle = function(cx, cy, r, style) {
    var circle = document.createElementNS(this.getNamespaces().svg, 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', r);

    if (style) {
      var svgStyle = this.createSvgStyle(style);
      if (svgStyle.length > 0) {
        circle.setAttribute('style', svgStyle);
      }
    }

    return circle;
  };

  /**
   * Add a circle to the SVG, optionally with a label.
   */
  SVGFactory.prototype.drawCircle = function(cx, cy, r, style) {
    this.svg.appendChild(this.createCircle(cx, cy, r, style));
  };

  /**
   * Create a SVG circle grouped together with a label.
   */
  SVGFactory.prototype.createLabeledCircle = function(cx, cy, r, style, label,
      labelOffsetX, labelOffsetY, labelStyle) {
    var circle = this.createCircle(cx, cy, r, style);
    var text = this.createText(cx + labelOffsetX, cy + labelOffsetY, label,
        labelStyle);
    var group = document.createElementNS(this.getNamespaces().svg, 'g');
    group.appendChild(circle);
    group.appendChild(text);
    return group;
  };

  /**
   * Add a labeled circle to the SVG.
   */
  SVGFactory.prototype.drawLabeledCircle = function(cx, cy, r, style, label,
      labelOffsetX, labelOffsetY, labelStyle) {
    this.svg.appendChild(this.createLabeledCircle(cx, cy, r, style, label,
        labelOffsetX, labelOffsetY, labelStyle));
  };

  /**
   * Draw a labeled polygon path to the SVG document.
   */
  SVGFactory.prototype.drawLabeledPolygonPath = function(cx, cy, w, h, points, style,
      label, labelOffsetX, labelOffsetY, labelStyle) {
    this.svg.appendChild(this.createLabeledPolygonPath(cx, cy, w, h, points, style,
        label, labelOffsetX, labelOffsetY, labelStyle));
  };

  /**
   * Create a new labeled polygon path.
   */
  SVGFactory.prototype.createLabeledPolygonPath = function(cx, cy, w, h, points, style,
      label, labelOffsetX, labelOffsetY, labelStyle) {
    var polygonPath = this.createPolygonPath(cx, cy, w, h, points, style);
    var text = this.createText(cx + labelOffsetX, cy + labelOffsetY, label,
        labelStyle);
    var group = document.createElementNS(this.getNamespaces().svg, 'g');
    group.appendChild(polygonPath);
    group.appendChild(text);
    return group;
  };

  /**
   * Draw a polygon path to the SVG document.
   */
  SVGFactory.prototype.drawPolygonPath = function(cx, cy, w, h, points, style) {
    this.svg.appendChild(this.createPolygonPath(cx, cy, w, h, points, style));
  };

  /**
   * Create a new labeled polygon path.
   */
  SVGFactory.prototype.createPolygonPath = function(cx, cy, w, h, points, style) {
    var pathComponents = ['M'];
    var halfW = w / 2;
    var halfH = h / 2;

    for (var i=0; i<points.length; i = i+2) {
      if (i>0) {
        pathComponents.push('L');
      }
      var x = cx + halfW * points[i];
      var y = cy + halfH * points[i + 1];
      pathComponents.push(x + ',' + y);
    }
    pathComponents.push('Z');
    var pointString = pathComponents.join(' ');

    var path = document.createElementNS(this.getNamespaces().svg, 'path');
    path.setAttribute('d', pointString);

    if (style) {
      var svgStyle = this.createSvgStyle(style);
      if (svgStyle.length > 0) {
        path.setAttribute('style', svgStyle);
      }
    }

    return path;
  };



  /**
   * Creata a SVG text element.
   */
  SVGFactory.prototype.createText = function(x, y, content, style) {
    var text = document.createElementNS(this.getNamespaces().svg, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y);
    text.appendChild(document.createTextNode(content));

    if (style) {
      var svgStyle = this.createSvgStyle(style);
      if (svgStyle.length > 0) {
        text.setAttribute('style', svgStyle);
      }
    }

    return text;
  };

  /**
   * Create a SVG line element
   */
  SVGFactory.prototype.createLine = function(x1, y1, x2, y2, style, options) {
    var line, labelX, labelY;
    switch (options.edgeType) {
      case 'bezier':
      case 'self':
      case 'compound':
      case 'multibezier':
        line = document.createElementNS(this.getNamespaces().svg, 'path');
        var pathComponents = ['M', x1, y1];
        if (options.controlPoints.length === 2) {
          pathComponents.push('Q');
          pathComponents.push(options.controlPoints[0]);
          pathComponents.push(options.controlPoints[1]);
          labelX = ((x1 + x2) / 2 + options.controlPoints[0]) / 2;
          labelY = ((y1 + y2) / 2 + options.controlPoints[1]) / 2;
        } else if (options.controlPoints.length === 4) {
          pathComponents.push('Q');
          pathComponents.push(options.controlPoints[0]);
          pathComponents.push(options.controlPoints[1]);
          var mX = (options.controlPoints[0] + options.controlPoints[2]) / 2;
          var mY = (options.controlPoints[1] + options.controlPoints[3]) / 2;
          pathComponents.push(mX);
          pathComponents.push(mY);
          pathComponents.push('Q');
          pathComponents.push(options.controlPoints[2]);
          pathComponents.push(options.controlPoints[3]);
          labelX = ((x1 + x2) / 2 + mX) / 2;
          labelY = ((y1 + y2) / 2 + mY) / 2;
        } else {
          throw new CATMAID.ValueError('More than two control points per line are not supported');
        }
        pathComponents.push(x2);
        pathComponents.push(y2);
        line.setAttribute('d', pathComponents.join(' '));
        break;

      case 'straight':
      case 'segments':
      case 'haystack':
        line = document.createElementNS(this.getNamespaces().svg, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        labelX = (x1 + x2) / 2;
        labelY = (y1 + y2) / 2;
        break;
    }

    if (style) {
      var svgStyle = this.createSvgStyle(style);
      if (svgStyle.length > 0) {
        line.setAttribute('style', svgStyle);
      }
    }

    // Here "arrow" means "end marker" and can also be a circle, a tee, etc.
    var arrow = null;
    if (options.arrow && options.arrow !== 'none') {
      var color = style.stroke || '#000';
      var arrowId = this.getMarkerId(options.arrow, color, options.arrowWidth,
            options.arrowHeight, options.refX, options.refY);
      if (!this.markers[arrowId]) {
        var arrowStyle = {
          fill: color,
        };
        this.createAndAddMarker(arrowId, options, arrowStyle);
      }
      // The only way to convince Adobe Illustrator to read line markings and a
      // line seems to be by adding an invisible second line with the marker.
      if (options.arrowOnSeparateLine) {
        arrow = line.cloneNode();
        arrow.style.stroke = 'none';
        arrow.style.fill = 'none';
        arrow.setAttribute('marker-end', 'url(#' + arrowId + ')');
      } else {
        line.setAttribute('marker-end', 'url(#' + arrowId + ')');
      }

      // Additionally, shrink the actual line a little bit, so that it doesn't
      // overlap with the arrow head.
      var shrinkers = {
        "triangle": true,
        "triangle-tee": true,
        "diamond": true,
        "vee": true,
      };
      if (shrinkers[options.arrow]) {
        var vx = x2 - x1, vy = y2 - y1;
        var l = Math.sqrt(vx*vx + vy * vy);
        var vxUnit = vx / l, vyUnit = vy / l;
        var arrowLength;
        if (options.arrowUnit === 'userSpaceOnUse') {
          arrowLength = options.arrowWidth;
        } else {
          if (!options.strokeWidth) {
            throw new CATMAID.ValueError('Need strokeWidth option to calculate ' +
              'arrow length for relative arrow size');
          }
          arrowLength = options.strokeWidth * (options.arrowWidth ? options.arrowWidth : 3.0);
        }
        // Determine the fraction 'f' of the arrow length to shrink the line by:
        var f = 0;
        switch(options.arrow) {
          case "triangle":
          case "triangle-tee":
            f = 0.9;
            break;
          case "diamond":
          case "vee":
            f = 0.5;
            break;
          default:
            f = 0.0;
            break;
        }
        var af = l - arrowLength * f;
        line.setAttribute('x2', x1 + af * vxUnit);
        line.setAttribute('y2', y1 + af * vyUnit);
      }
    }

    if (options.label) {
      labelX = 'labelX' in options ? options.labelX : labelX;
      labelY = 'labelY' in options ? options.labelY : labelY;
      var text = this.createText(
          labelX + options.labelOffsetX,
          labelY + options.labelOffsetY,
          options.label, options.labelStyle);
      var group = document.createElementNS(this.getNamespaces().svg, 'g');
      group.appendChild(line);
      if (arrow) {
        group.appendChild(arrow);
      }
      group.appendChild(text);
      return group;
    } else {
      return line;
    }
  };

  /**
   * Add a SVG line element.
   */
  SVGFactory.prototype.drawLine = function(x1, y1, x2, y2, style, options) {
    this.svg.appendChild(this.createLine(x1, y1, x2, y2, style, options));
  };

  /**
   * Add text to the SVG.
   */
  SVGFactory.prototype.drawText = function(x, y, text, style) {
    this.svg.appendChild(this.createText(x, y, text, style));
  };

  SVGFactory.prototype.ensureDefs = function() {
    // Add markers
    if (!this.defs) {
      this.defs = document.createElementNS(this.getNamespaces().svg, 'defs');
      Object.keys(this.markers).forEach(function(key) {
        this.defs.appendChild(this.markers[key]);
      }, this);
      this.svg.appendChild(this.defs);
    }
  };

  SVGFactory.prototype.save = function(filename) {
    this.ensureDefs();

    // Export
    var s = new XMLSerializer().serializeToString(this.svg);
    // Insert line breaks for readibility and ease of parsing by text editors
    s = s.replace(/</g,'\n<');
    var blob = new Blob([s], {type: svgMimeType});
    saveAs(blob, filename);
  };

  CATMAID.SVGFactory = SVGFactory;

})(CATMAID);
