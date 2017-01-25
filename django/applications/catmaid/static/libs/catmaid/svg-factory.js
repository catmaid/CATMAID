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
  };

  SVGFactory.prototype.addMarker = function(id, element, width, height, refX, refY) {
    var marker = document.createElementNS(namespaces.svg, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('markerWidth', width);
    marker.setAttribute('markerHeight', height);
    marker.setAttribute('refX', refX);
    marker.setAttribute('refY', refY);
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', 'strokeWidth');

    marker.appendChild(element);

    this.defs = null;
    this.markers[id] = marker;
  };

  SVGFactory.prototype.addArrowMarker = function(id, width, height, refX, refY, style) {
    refX = refX || 9;
    refY = refY || 3;
    var arrow = document.createElementNS(namespaces.svg, 'path');
    arrow.setAttribute('d', 'M0,0 L0,6 L9,3 Z');

    if (style) {
      var svgStyle = this.createSvgStyle(style);
      if (svgStyle.length > 0) {
        arrow.setAttribute('style', svgStyle);
      }
    }

    this.addMarker(id, arrow, width, height, refX, refY, style);
  };

  function flattenStyle(key) {
    return key + ': ' + this[key];
  }

  /**
   * Parse a style object and create a SVG compatible syle string.
   */
  SVGFactory.prototype.createSvgStyle = function(styles) {
    return Object.keys(styles).map(flattenStyle, styles).join(';');
  };

  /**
   * Create a SVG circle element with the given properties.
   *
   * The passed in style is expected to contain CSS styles.
   */
  SVGFactory.prototype.createCircle = function(cx, cy, r, style) {
    var circle = document.createElementNS(namespaces.svg, 'circle');
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
    var group = document.createElementNS(namespaces.svg, 'g');
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
    var group = document.createElementNS(namespaces.svg, 'g');
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

    var path = document.createElementNS(namespaces.svg, 'path');
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
    var text = document.createElementNS(namespaces.svg, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y);
    text.setAttribute('text-anchor', 'middle');

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
        line = document.createElementNS(namespaces.svg, 'path');
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
        line = document.createElementNS(namespaces.svg, 'line');
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

    if (options.arrow && options.arrow !== 'none') {
      var color = style.stroke || '#000';
      var arrowId = 'arrow-' + color.replace(/#/, '');
      if (!this.markers[arrowId]) {
        var arrowStyle = {
          fill: color,
        };
        this.addArrowMarker(arrowId, options.arrowWidth, options.arrowHeight,
            options.refX, options.refY, arrowStyle);
      }
      line.setAttribute('marker-end', 'url(#' + arrowId + ')');
    }

    if (options.label) {
      labelX = 'labelX' in options ? options.labelX : labelX;
      labelY = 'labelY' in options ? options.labelY : labelY;
      var text = this.createText(
          labelX + options.labelOffsetX,
          labelY + options.labelOffsetY,
          options.label, options.labelStyle);
      var group = document.createElementNS(namespaces.svg, 'g');
      group.appendChild(line);
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

  SVGFactory.prototype.save = function(filename) {
    // Add markers
    if (!this.defs) {
      var self = this;
      this.defs = document.createElementNS(namespaces.svg, 'defs');
      Object.keys(this.markers).forEach(function(key) {
        self.defs.appendChild(self.markers[key]);
      });
      this.svg.appendChild(this.defs);
    }

    // Export
    var s = new XMLSerializer().serializeToString(this.svg);
    var blob = new Blob([s], {type: svgMimeType});
    saveAs(blob, filename);
  };

  CATMAID.SVGFactory = SVGFactory;

})(CATMAID);
