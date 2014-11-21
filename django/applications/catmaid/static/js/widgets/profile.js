/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/**
 * profile.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 excanvas.js by Google for IE support
 *
 * @todo replace the canvas output by svg as soon as it is aplicable
 *
 */

/**
 */

var CK_CORNER = 0;
var CK_CUSP = 1;
var CK_LINE_BEFORE = 2;
var CK_LINE_AFTER = 3;
var CK_ASYMMETRIC = 4;
var CK_SYMMETRIC = 5;

/**
 * key of a Bezier curve, containing the edge point and the curve handles
 */

function CurveKey(
t, //!< int type {CK_CORNER, CK_CUSP, CK_LINE_BEFORE, CK_LINE_AFTER, CK_ASYMMETRIC, CK_SYMMETRIC}
x, //!< float edge.x
y, //!< float edge.y
xb, //!< before
yb, xa, //!< after
ya) {
  var self = this;
  this.setType = function (
  t, //!< string type {CK_CORNER, CK_CUSP, CK_LINE_BEFORE, CK_LINE_AFTER, CK_ASYMMETRIC, CK_SYMMETRIC}
  kb, //!< the key before the current one, if available
  ka //!< the key after the current one, if available
  ) {
    switch (t) {
    case CK_CORNER:
      type = t;
      self.before = {
        x: self.key.x,
        y: self.key.y
      };
      self.after = {
        x: self.key.x,
        y: self.key.y
      };
      break;
    case CK_CUSP:
      type = t;
      if (self.before.x == self.key.x && self.before.y == self.key.y) if (kb) {
        self.before.x = self.key.x - (self.key.x - kb.after.x) / 2;
        self.before.y = self.key.y - (self.key.y - kb.after.y) / 2;
      }
      if (self.after.x == self.key.x && self.after.y == self.key.y) if (ka) {
        self.after.x = self.key.x + (ka.before.x - self.key.x) / 2;
        self.after.y = self.key.y + (ka.before.y - self.key.y) / 2;
      }
      break;
    case CK_LINE_BEFORE:
      type = t;
      self.before = {
        x: self.key.x,
        y: self.key.y
      };
      if (self.after.x == self.key.x && self.after.y == self.key.y) if (ka) {
        self.after.x = self.key.x + (ka.before.x - self.key.x) / 2;
        self.after.y = self.key.y + (ka.before.y - self.key.y) / 2;
      }
      break;
    case CK_LINE_AFTER:
      type = t;
      self.after = {
        x: self.key.x,
        y: self.key.y
      };
      if (self.before.x == self.key.x && self.before.y == self.key.y) if (kb) {
        self.before.x = self.key.x - (self.key.x - kb.after.x) / 2;
        self.before.y = self.key.y - (self.key.y - kb.after.y) / 2;
      }
      break;
    case CK_ASYMMETRIC:
    case CK_SYMMETRIC:
      type = t;
      if (kb && ka) {
        var dx = (ka.x - kb.x) / 2;
        var dy = (ka.y - kb.y) / 2;
        self.before = {
          x: self.key.x - dx,
          y: self.key.y - dy
        };
        self.after = {
          x: self.key.x + dx,
          y: self.key.y + dy
        };
      }
      break;
    }
    return;
  };

  this.getType = function () {
    return type;
  };

  this.min = function () {
    var m = {
      x: Math.min(Math.min(self.key.x, self.before.x), self.after.x),
      y: Math.min(Math.min(self.key.y, self.before.y), self.after.y)
    };
    return m;
  };

  this.max = function () {
    var m = {
      x: Math.max(Math.max(self.key.x, self.before.x), self.after.x),
      y: Math.max(Math.max(self.key.y, self.before.y), self.after.y)
    };
    return m;
  };

  /**
   * move the key and its handles
   */
  this.moveKey = function (dx, dy) {
    self.key.x = self.key.x + dx;
    self.key.y = self.key.y + dy;

    self.before.x = self.before.x + dx;
    self.before.y = self.before.y + dy;
    self.after.x = self.after.x + dx;
    self.after.y = self.after.y + dy;
    return;
  };

  /**
   * move the before node
   */
  this.moveBefore = function (dx, dy) {
    self.before.x = self.before.x + dx;
    self.before.y = self.before.y + dy;
    switch (type) {
    case CK_SYMMETRIC:
      self.after.x = 2 * self.key.x - self.before.x;
      self.after.y = 2 * self.key.y - self.before.y;
      break;
    case CK_ASYMMETRIC:
      var bx = self.before.x - self.key.x;
      var by = self.before.y - self.key.y;
      var ax = self.after.x - self.key.x;
      var ay = self.after.y - self.key.y;
      var rl = Math.sqrt(ax * ax + ay * ay) / Math.sqrt(bx * bx + by * by);
      self.after.x = self.key.x - rl * bx;
      self.after.y = self.key.y - rl * by;
      break;
    }
    return;
  };

  /**
   * move the after node
   */
  this.moveAfter = function (dx, dy) {
    self.after.x = self.after.x + dx;
    self.after.y = self.after.y + dy;
    switch (type) {
    case CK_SYMMETRIC:
      self.before.x = 2 * self.key.x - self.after.x;
      self.before.y = 2 * self.key.y - self.after.y;
      break;
    case CK_ASYMMETRIC:
      var bx = self.before.x - self.key.x;
      var by = self.before.y - self.key.y;
      var ax = self.after.x - self.key.x;
      var ay = self.after.y - self.key.y;
      var rl = Math.sqrt(bx * bx + by * by) / Math.sqrt(ax * ax + ay * ay);
      self.before.x = self.key.x - rl * ax;
      self.before.y = self.key.y - rl * ay;
      break;
    }
    return;
  };


  // initialise all members
  var type;
  this.key = {
    x: x,
    y: y
  };
  this.before = {
    x: xb,
    y: yb
  };
  this.after = {
    x: xa,
    y: ya
  };

  this.setType(t);
}


/**
 * container for a profile
 *
 * a profile is a closed bezier curve
 */

function Profile() {
  var getContext = function () {
    if (!ctx) {
      try {
        if (canvas.getContext) {
          ctx = canvas.getContext("2d");
        } else if (G_vmlCanvasManager) //!< it could be an IE and we try to initialize the element first
        {
          canvas = G_vmlCanvasManager.initElement(canvas);
          ctx = canvas.getContext("2d");
        }
      } catch (e) {}
    }
    return ctx;
  };

  /**
   * get the view object
   */
  this.getView = function () {
    return view;
  };

  /**
   * get the bounding box of the profile
   * take care, that there are some points ...
   */
  var boundingBox = function () {
    min = keys[0].min();
    max = keys[0].max();
    for (var i = 1; i < keys.length; ++i) {
      var m = keys[i].min();
      min.x = Math.min(m.x, min.x);
      min.y = Math.min(m.y, min.y);
      m = keys[i].max();
      max.x = Math.max(m.x, max.x);
      max.y = Math.max(m.y, max.y);
    }
    var t = 3 / screen.scale;
    min.x = min.x - t;
    min.y = min.y - t;
    max.x = max.x + t;
    max.y = max.y + t;
    canvas.width = Math.floor((max.x - min.x) * screen.scale);
    canvas.style.width = view.style.width = canvas.width + "px";
    canvas.height = Math.floor((max.y - min.y) * screen.scale);
    canvas.style.height = view.style.height = canvas.height + "px";
    return;
  };

  /**
   * check, if a coordinate is inside the curve
   *
   * @todo check at least the inner box only, currently simply the bounding box is used, which might be confusing for the user
   *
   * @return boolean
   */
  this.isInside = function (x, y) {
    return (
    x >= min.x && x <= max.x && y >= min.y && y <= max.y);
  };

  /**
   * update the screen context
   * top, left, width, heigth and scale in world coordinates
   */
  this.updateScreen = function (l) {
    screen = l;
    boundingBox();
    return;
  };

  this.clearCanvas = function () {
    var ctx = getContext();
    if (ctx) ctx.clearRect(0, 0, max.x - min.x, max.y - min.y);
    return;
  };

  this.place = function () {
    view.style.top = Math.floor((min.y - screen.y) * screen.scale) + "px";
    view.style.left = Math.floor((min.x - screen.x) * screen.scale) + "px";
    return;
  };

  /**
   * draw the profile using all bezier points
   */
  this.draw = function () {
    var ctx = getContext();
    if (ctx) {
      ctx.fillStyle = "rgba(255,128,0,0.75)";

      ctx.beginPath();
      ctx.moveTo(
      screen.scale * (keys[0].key.x - min.x), screen.scale * (keys[0].key.y - min.y));
      var i;
      var n = keys.length;
      for (i = 1; i < n; ++i) {
        var p1 = keys[i - 1].after;
        var p2 = keys[i].before;
        var p3 = keys[i].key;

        p1x = (p1.x - min.x) * screen.scale;
        p1y = (p1.y - min.y) * screen.scale;
        p2x = (p2.x - min.x) * screen.scale;
        p2y = (p2.y - min.y) * screen.scale;
        p3x = (p3.x - min.x) * screen.scale;
        p3y = (p3.y - min.y) * screen.scale;

        ctx.bezierCurveTo(
        p1x, p1y, p2x, p2y, p3x, p3y);
      }
      ctx.bezierCurveTo(
      screen.scale * (keys[--i].after.x - min.x), screen.scale * (keys[i].after.y - min.y), screen.scale * (keys[0].before.x - min.x), screen.scale * (keys[0].before.y - min.y), screen.scale * (keys[0].key.x - min.x), screen.scale * (keys[0].key.y - min.y));
      ctx.fill();
    }
    return;
  };

  /**
   * draw the profiles outline using all bezier points
   */
  this.drawOutline = function () {
    var ctx = getContext();
    if (ctx) {
      ctx.strokeStyle = "rgba(255,128,0,0.75)";
      ctx.lineWidth = 4;

      ctx.beginPath();
      ctx.moveTo(
      screen.scale * (keys[0].key.x - min.x), screen.scale * (keys[0].key.y - min.y));
      var i;
      var n = keys.length;
      for (i = 1; i < n; ++i) {
        var p1 = keys[i - 1].after;
        var p2 = keys[i].before;
        var p3 = keys[i].key;

        p1x = (p1.x - min.x) * screen.scale;
        p1y = (p1.y - min.y) * screen.scale;
        p2x = (p2.x - min.x) * screen.scale;
        p2y = (p2.y - min.y) * screen.scale;
        p3x = (p3.x - min.x) * screen.scale;
        p3y = (p3.y - min.y) * screen.scale;

        ctx.bezierCurveTo(
        p1x, p1y, p2x, p2y, p3x, p3y);
      }
      ctx.bezierCurveTo(
      screen.scale * (keys[--i].after.x - min.x), screen.scale * (keys[i].after.y - min.y), screen.scale * (keys[0].before.x - min.x), screen.scale * (keys[0].before.y - min.y), screen.scale * (keys[0].key.x - min.x), screen.scale * (keys[0].key.y - min.y));
      ctx.stroke();
    }
    return;
  };

  /**
   * draw the handles of all bezier points
   */
  this.drawHandles = function () {
    var ctx = getContext();
    if (ctx) {
      ctx.strokeStyle = "rgb(0,0,255)";
      ctx.lineWidth = 0.5;
      var n = keys.length;
      for (var i = 0; i < n; ++i) {
        var p1x = (keys[i].before.x - min.x) * screen.scale;
        var p1y = (keys[i].before.y - min.y) * screen.scale;
        var p2x = (keys[i].key.x - min.x) * screen.scale;
        var p2y = (keys[i].key.y - min.y) * screen.scale;
        var p3x = (keys[i].after.x - min.x) * screen.scale;
        var p3y = (keys[i].after.y - min.y) * screen.scale;
        var t = keys[i].getType();

        if (t != CK_CORNER) {
          ctx.beginPath();
          ctx.moveTo(p1x, p1y);
          ctx.lineTo(p2x, p2y);
          ctx.lineTo(p3x, p3y);
          ctx.stroke();
        }

        ctx.fillStyle = "rgb(255,0,0)";
        ctx.fillRect(p2x - 3, p2y - 3, 6, 6);
        ctx.fillStyle = "rgb(0,0,255)";
        switch (t) {
        case CK_CUSP:
        case CK_LINE_AFTER:
        case CK_ASYMMETRIC:
        case CK_SYMMETRIC:
          ctx.fillRect(p1x - 3, p1y - 3, 6, 6);
        }
        switch (t) {
        case CK_CUSP:
        case CK_LINE_BEFORE:
        case CK_ASYMMETRIC:
        case CK_SYMMETRIC:
          ctx.fillRect(p3x - 3, p3y - 3, 6, 6);
        }
      }
    }
    return;
  };

  this.isVisible = function () {
    return (
    max.x >= screen.x && max.y >= screen.y && min.x <= screen.x + screen.width && min.y <= screen.y + screen.height);
  };

  this.onmousemove = function (e) {
    if (spi) {
      switch (spt) {
      case "key":
        spi.moveKey(ui.diffX / screen.scale, ui.diffY / screen.scale);
        break;
      case "before":
        spi.moveBefore(ui.diffX / screen.scale, ui.diffY / screen.scale);
        break;
      case "after":
        spi.moveAfter(ui.diffX / screen.scale, ui.diffY / screen.scale);
        break;
      }
    } else {
      for (var i = 0; i < keys.length; ++i) {
        keys[i].moveKey(ui.diffX / screen.scale, ui.diffY / screen.scale);
      }
    }
    boundingBox();
    self.place();
    self.clearCanvas();
    self.drawOutline();
    self.drawHandles();
    return false;
  };

  this.onmousedown = function (e) {
    spi = undefined;
    spt = undefined;
    var m = ui.getMouse(e, canvas);
    if (m) {
      var i;
      FOUND: for (i = 0; i < keys.length; ++i) {
        var x;
        var y;
        var d;
        var t = keys[i].getType();
        x = screen.scale * (keys[i].key.x - screen.x) - m.offsetX;
        y = screen.scale * (keys[i].key.y - screen.y) - m.offsetY;
        d = Math.sqrt(x * x + y * y);
        if (d < 4) {
          spt = "key";
          break;
        }
        switch (t) {
        case CK_CUSP:
        case CK_LINE_AFTER:
        case CK_ASYMMETRIC:
        case CK_SYMMETRIC:
          x = screen.scale * (keys[i].before.x - screen.x) - m.offsetX;
          y = screen.scale * (keys[i].before.y - screen.y) - m.offsetY;
          d = Math.sqrt(x * x + y * y);
          if (d < 4) {
            spt = "before";
            break FOUND;
          }
        }
        switch (t) {
        case CK_CUSP:
        case CK_LINE_BEFORE:
        case CK_ASYMMETRIC:
        case CK_SYMMETRIC:
          x = screen.scale * (keys[i].after.x - screen.x) - m.offsetX;
          y = screen.scale * (keys[i].after.y - screen.y) - m.offsetY;
          d = Math.sqrt(x * x + y * y);
          if (d < 4) {
            spt = "after";
            break FOUND;
          }
        }
      }
      if (spt) {
        spi = keys[i];
      }
    }
    return;
  };

  // initialise
  var self = this;
  if (!ui) ui = new UI();

  var view = document.createElement("div");
  view.className = "profileView";

  //! canvas based drawing area
  var canvas = document.createElement("canvas");
  view.appendChild(canvas);
  var ctx; //!< 2d drawing context
  if (canvas.getContext) {
    ctx = canvas.getContext("2d");
  }

  var screen = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    s: 0,
    scale: 1
  }; //!< screen coordinates
  var spi; //!< selected curve key
  var spt; //!< string {'before', 'key', 'after'} selected part of curve key
  //view.style.width = "200px";
  //view.style.height = "200px";
  var keys = new Array(); //!< curve points
  keys[0] = new CurveKey(
  CK_SYMMETRIC, 5000, 5000, 6000, 4000, 4000, 6000);
  keys[1] = new CurveKey(
  CK_ASYMMETRIC, 5000, 6000, 4000, 5000, 6000, 7000);
/*
	keys[ 2 ] = new CurveKey(
		CK_SYMMETRIC,
		5700,
		6200,
		5400,
		6200,
		6000,
		6200 );
	keys[ 3 ] = new CurveKey(
		CK_SYMMETRIC,
		7000,
		6200,
		6800,
		6500,
		7200,
		5900 );
	keys[ 4 ] = new CurveKey(
		CK_SYMMETRIC,
		6300,
		5500,
		6300,
		5800,
		6300,
		5200 );
	keys[ 5 ] = new CurveKey(
		CK_SYMMETRIC,
		6000,
		5000,
		6200,
		5000,
		5800,
		5000 );
	*/

  var min = {
    x: 0,
    y: 0
  };
  var max = {
    x: 0,
    y: 0
  };

  boundingBox();
}
