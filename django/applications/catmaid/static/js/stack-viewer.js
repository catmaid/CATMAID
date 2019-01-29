/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * StackViewer is the core data viewer and interaction element.  It displays a
   * list of layers of an x,y-plane in an n-dimensional data set, tracks the
   * navigation/edit mode and organizes access to user interface elements such
   * as navigation sliders and buttons.  x, y dimensions are shown in the plane,
   * for all other dimensions, a slider is used.
   *
   * Layers can be images, text, SVG or arbitrary other overlays.
   *
   * Properties of the primary stack limit the field of view and the slider
   * ranges.
   */
  function StackViewer(
      project,          //!< {CATMAID.Project} reference to the parent project
      primaryStack,
      catmaidWindow
  ) {
    this._project = project;
    this.primaryStack = primaryStack;
    this._stacks = [primaryStack];

    // The stacks broken slices should be respected of
    this._brokenSliceStacks = new Set([this.primaryStack]);
    // An updated list of valid sections
    this._validSections = null;
    this._updateValidSections();

    this._offset = [0, 0, 0];

    this._widgetId = this.registerInstance();

    // take care, that all values are within a proper range
    // Declare the x,y,z,s as coordinates in pixels
    this.z = this.toValidZ(0, 1);
    this.y = Math.floor( primaryStack.MAX_Y / 2 );
    this.x = Math.floor( primaryStack.MAX_X / 2 );
    this.s = primaryStack.MAX_S;
    this.plane = new THREE.Plane(this.normal(), 0);
    this._updatePlane();

    this.old_z = -1;
    this.old_y = this.y;
    this.old_x = this.x;
    this.old_s = this.s;

    this.yc = 0;
    this.xc = 0;

    /**
     * Ratio of screen pixels to (scale level 0) stack space pixels.
     */
    this.scale = this.primaryStack.effectiveDownsampleFactor(0) / this.primaryStack.effectiveDownsampleFactor(this.s);
    this.old_scale = this.scale;

    this.navigateWithProject = true;
    this.showScaleBar = true;

    this._tool = null;
    this._layers = new Map();
    this._layerOrder = [];

    /**
     * Whether redraws in this stack viewer should be blocking, that is,
     * whether layers that have asynchronous redraws must wait for redraw to
     * be complete before invoking callbacks. Note that layers can choose to
     * be blocking even if this is false (e.g., the tracing overlay).
     * @type {Boolean}
     */
    this.blockingRedraws = false;

    //-------------------------------------------------------------------------

    this._stackWindow = catmaidWindow || new CMWWindow( primaryStack.title );
    this._view = this._stackWindow.getFrame();
    this._view.classList.add('stackViewer');
    this._layersView = document.createElement("div");
    this._view.appendChild(this._layersView);

    this.viewWidth = this._stackWindow.getFrame().offsetWidth;
    this.viewHeight = this._stackWindow.getFrame().offsetHeight;

    this._stackWindow.addListener(this._handleWindowSignal.bind(this));

    this.overview = new CATMAID.Overview( this );
    this._view.appendChild( this.overview.getView() );

    this.layercontrol = new CATMAID.LayerControl( this );
    $(this.layercontrol.getView()).hide();
    this._view.appendChild( this.layercontrol.getView() );

    // Ask for confirmation before closing the stack via the close button
    $(this._stackWindow.getFrame()).find('.stackClose').get(0).onpointerdown = (function (e) {
      var notLastStackViewer = this._project.getStackViewers().length > 1;
      var noConfirm = !CATMAID.Client.Settings.session.confirm_project_closing;
      if (notLastStackViewer || noConfirm ||
            confirm('Closing this window will exit the project. Proceed?')) {
        this._stackWindow.close(e);
      } else {
        e.stopPropagation();
      }
    }).bind(this);

    this._scaleBar = new CATMAID.ScaleBar(document.createElement("div"));
    this._scaleBar.setVisibility(this.showScaleBar);
    this._view.appendChild(this._scaleBar.getView());

    var controlToggle = document.createElement( "div" );
    controlToggle.className = "stackControlToggle_hidden";
    controlToggle.title = "show/hide layer controls";
    controlToggle.onpointerdown = function(e) {
      if ( typeof event != "undefined" && event )
        event.cancelBubble = true;
      if ( e && e.stopPropagation )
        e.stopPropagation();
      var state = $(this).siblings('.LayerControl').toggle().is(':visible');
      $(this).attr('class', state ? 'stackControlToggle' : 'stackControlToggle_hidden');
    };
    this._view.appendChild( controlToggle );

    var indicatorbar = document.createElement( "div" );
    indicatorbar.className = "indicatorbar";
    this._view.appendChild( indicatorbar );

    // Display horizontal and vertical reference lines if wanted.
    this._vert = document.createElement( "div" );
    this._horr = document.createElement( "div" );
    this._vert.style.height = this._horr.style.width = "100%";
    this._vert.style.width = this._horr.style.height = "1px";
    this._vert.style.position = this._horr.style.position = "absolute";
    this._vert.style.top = this._horr.style.left = "0px";
    this._vert.style.left = this._horr.style.top = "50%";
    this._vert.style.zIndex = this._horr.style.zIndex = "1";
    this._vert.style.backgroundColor = this._horr.style.backgroundColor = "#ffffff";
    this._vert.style.opacity = this._horr.style.opacity = "0.5";
    this._view.appendChild( this._vert );
    this._view.appendChild( this._horr );
    this.showReferenceLines(StackViewer.Settings.session.display_stack_reference_lines);

    if (primaryStack.description.length > 0) {
      this.addLayer('Stack description', new CATMAID.MetadataLayer(this, primaryStack.description));
    }
  }

  StackViewer.prototype = {};
  $.extend(StackViewer.prototype, new InstanceRegistry());
  StackViewer.prototype.constructor = StackViewer;

  StackViewer.EVENT_STACK_LAYER_ADDED = 'stackviewer_stack_layer_added';
  StackViewer.EVENT_STACK_LAYER_REMOVED = 'stackviewer_stack_layer_removed';
  CATMAID.asEventSource(StackViewer);

  /**
   * Get a valid Z location based on all stacks that are selected to be
   * respected.
   *
   * @params {Number}  z         The z location to verify
   * @params {Number}  step      The number of sections to move in case of a
   *                             broken section.
   * @params {Boolean} allowZero Optional, whether a distance of zero should be
   *                             returned if the passed in Z is valid. Default
   *                             is false.
   * @return The passed in Z is valid, otherwise the next valid Z either after
   *         or before (<step> sections away). Optionally, a zero distance can
   *         be allowed as well.
   */
  StackViewer.prototype.validZDistanceByStep = function(z, step, allowZero) {
    if (allowZero) {
      // If a zero step is allowed, check if the passed in Z is valid.
      if (this.isValidZ(z)) {
        return 0;
      }
    }
    // Without any stacks that should be tested for broken sections, the new
    // section is only invalid if it is below zero or above the max Z of the
    // reference stack.
    if (this._brokenSliceStacks.size === 0) {
      var newSection = z + step;
      return (newSection < 0 || newSection > referenceStack.MAX_Z) ? null : step;
    }
    // Find Z that is valid for all respected stacks. Use a random reference
    // stack with broken sections to do better informed steps.
    var referenceStack = Array.from(this._brokenSliceStacks.keys())[0];
    var testDistance = step;
    while (true) {
      var newSection = z + testDistance;
      if (newSection < 0 || newSection > this.primaryStack.MAX_Z) {
        return null;
      }
      if (!this.isSliceBroken(newSection)) {
        return testDistance;
      }
      var distance = referenceStack.validZDistanceByStep(newSection, step);
      if (!distance) {
        return null;
      }
      testDistance += distance;
    }
  };

  StackViewer.prototype.getValidSections = function() {
    return this._validSections;
  };

  StackViewer.prototype.isValidZ = function(z) {
    return (z < 0 || z > this.primaryStack.MAX_Z) ?
        null : !this.isSliceBroken(z);
  };

  /**
   * Returns the passed in Z if it is valid, otherwise the next valid step
   * spaced Z.
   */
  StackViewer.prototype.toValidZ = function(z, step) {
    var distance = this.validZDistanceByStep(z, step, true);
    if (distance === null || distance === undefined) {
      throw new CATMAID.Warning("Couldn't find valid Z section");
    }
    // If the returned valid distance is exactly one step,
    return z + distance;
  };

  StackViewer.prototype.validZDistanceBefore = function(z) {
    return this.validZDistanceByStep(z, -1);
  };

  StackViewer.prototype.validZDistanceAfter = function(z) {
    return this.validZDistanceByStep(z, 1);
  };

  /**
   * Test if a particular Z section is broken in at least one stack that is
   * respected for this operation.
   */
  StackViewer.prototype.isSliceBroken = function(z) {
    // This uses layers
    for (var stack of this._brokenSliceStacks) {
      if (stack.isSliceBroken(z)) {
        return true;
      }
    }
    return false;
  };

  StackViewer.prototype.addBrokenSliceStack = function(stack) {
    this._brokenSliceStacks.add(stack);
    this._updateValidSections();
  };

  StackViewer.prototype.removeBrokenSliceStack = function(stack) {
    this._brokenSliceStacks.delete(stack);
    this._updateValidSections();
  };

  StackViewer.prototype._updateValidSections = function() {
    var validSections = new Set();
    for (var stack of this._brokenSliceStacks) {
      var validStackSections = stack.slices;
      for (var i=0, max=validStackSections.length; i<max; ++i) {
        validSections.add(validStackSections[i]);
      }
    }
    this._validSections = Array.from(validSections).sort(CATMAID.tools.compareNumbers);
  };

  StackViewer.LayerInsertionStrategy = {
    "append": {
      move: function(stackViewer, layer, key) {
        // Nothing to do, appending is default
      }
    },
    "image-data-first": {
      move: function(stackViewer, layer, key) {
        // If the new layer is orderable, find last non image data layer and
        // insert before. Otherwise, don't do anything and append to end.
        if (!layer.isOrderable) {
          return;
        }
        var beforeKey = null;
        for (var i=0; i<stackViewer._layerOrder.length; ++i) {
          var refLayerName = stackViewer._layerOrder[i];
          if (refLayerName === key) {
            continue;
          }
          var refLayer = stackViewer._layers.get(refLayerName);
          if (!refLayer.isOrderable) {
            beforeKey = refLayerName;
            break;
          }
        }
        if (beforeKey) {
          stackViewer.moveLayer(key, beforeKey);
        }
      },
    }
  };

  /**
   * Update stack viewer window title combined with the currently used mirror.
   */
  StackViewer.prototype.updateTitle = function() {
    var title = this.primaryStack.title;
    var stackLayer = this._layers.get('StackLayer');
    if (stackLayer) {
      var mirror = this.primaryStack.mirrors[stackLayer.mirrorIndex];
      title = title + " | " + mirror.title;
    }

    if (this._offset && this._offset.some(Math.abs)) {
      title = title + ' (Offset ' + this._offset.join(', ') + ')';
    }

    title = title + " | " + CATMAID.Stack.ORIENTATION_NAMES[this.primaryStack.orientation];

    this._stackWindow.setTitle(title);
  };

  /**
   * update the scale bar (minimum planar resolution) to a proper size
   * @param showScaleBar optional boolean, whether to show the scale bar on update. Default: do not change.
   */
  StackViewer.prototype.updateScaleBar = function (showScaleBar) {
    if (showScaleBar !== undefined && this.showScaleBar !== showScaleBar) {
      this.showScaleBar = showScaleBar;
      this._scaleBar.setVisibility(showScaleBar);
      this.layercontrol.refresh();
    }
    this._scaleBar.update(this.pxPerNm(), this.viewWidth / 5);
  };

  /**
   * update all state informations and the screen content
   */
  StackViewer.prototype.update = function (completionCallback, errorCallback) {
    this._updatePlane();
    this.overview.redraw();
    if (this.s !== this.old_s) this.updateScaleBar();

    this.redraw(completionCallback);

    if( this._tool ) {
      this._tool.redraw();
    }
  };

  StackViewer.prototype._updatePlane = function () {
    switch (this.primaryStack.orientation) {
      case CATMAID.Stack.ORIENTATION_XY:
        this.plane.constant = this.primaryStack.stackToProjectZ(this.z, 0, 0);
        break;
      case CATMAID.Stack.ORIENTATION_XZ:
        this.plane.constant = this.primaryStack.stackToProjectY(this.z, 0, 0);
        break;
      case CATMAID.Stack.ORIENTATION_ZY:
        this.plane.constant = this.primaryStack.stackToProjectX(this.z, 0, 0);
        break;
      default:
        throw new CATMAID.ValueError("Unknown stack orientation: " +
            this.primaryStack.orientation);
    }
  };

  /**
   * Get inclusive zoom level extents for all stacks in the viewer.
   */
  StackViewer.prototype.getZoomExtents = function () {
    var extents = this._stacks.reduce(function (extents, stack) {
      extents.min = Math.min(extents.min, stack.stackToProjectSMP(stack.MIN_S));
      extents.max = Math.max(extents.max, stack.stackToProjectSMP(stack.MAX_S));
      return extents;
    }, {min: Infinity, max: -Infinity});

    return {
      min: this.primaryStack.projectToStackSMP(extents.min),
      max: this.primaryStack.projectToStackSMP(extents.max)
    };
  };

  /**
   * Get stack coordinates of the current view's top left corner.
   * These values might be used as an offset to get the stack coordinates of a
   * pointer event handled by the stack.
   */
  StackViewer.prototype.screenPosition = function () {
    var width = this.viewWidth / this.scale / this.primaryStack.anisotropy(0).x;
    var height = this.viewHeight / this.scale / this.primaryStack.anisotropy(0).y;
    var l = {
      top: this.y - height / 2,
      left: this.x - width / 2
    };
    return l;
  };

  /**
   * Project coordinates of the current view.
   */
  StackViewer.prototype.projectCoordinates = function () {
    var l =
    {
      z : this.primaryStack.stackToProjectZ( this.z, this.y, this.x ),
      y : this.primaryStack.stackToProjectY( this.z, this.y, this.x ),
      x : this.primaryStack.stackToProjectX( this.z, this.y, this.x ),
      s : this.primaryStack.stackToProjectSMP( this.s )
    };
    return l;
  };

  /**
   * Scaled stack coordinates of the current view's top left corner for the given
   * stack.
   *
   * @param  {Stack} stack    Target stack for the scaled view coordinates.
   * @return {{xc, yc, z, s}} Top left view scaled coordinates in the target stack.
   */
  StackViewer.prototype.scaledPositionInStack = function (stack) {
    if (stack.id === this.primaryStack.id) {
      return {
        xc: this.xc,
        yc: this.yc,
        z: this.z,
        s: this.s
      };
    } else {
      var pc = this.projectCoordinates();
      return {
        xc: Math.floor(stack.projectToUnclampedStackX(pc.z, pc.y, pc.x)
          / Math.pow(2, stack.projectToStackSX(pc.s)) - this.viewWidth / 2),
        yc: Math.floor(stack.projectToUnclampedStackY(pc.z, pc.y, pc.x)
          / Math.pow(2, stack.projectToStackSY(pc.s)) - this.viewHeight / 2),
        z:  stack.projectToUnclampedStackZ(pc.z, pc.y, pc.x),
        s:  stack.projectToStackSMP(pc.s)
      };
    }
  };


  /**
   * Write the limiting coordinates of the current stack view's bounding box
   * into stackBox.  Faster than creating a new box.
   *
   *  @param stackBox {{min: {x, y, z}, max: {x, y, z}}}
   */
  StackViewer.prototype.stackViewBox = function (stackBox) {
    var w2 = this.viewWidth / this.scale / 2 / this.primaryStack.anisotropy(0).x;
    var h2 = this.viewHeight / this.scale / 2 / this.primaryStack.anisotropy(0).y;

    stackBox.min.x = this.x - w2;
    stackBox.min.y = this.y - h2;
    stackBox.min.z = this.z;

    stackBox.max.x = this.x + w2;
    stackBox.max.y = this.y + h2;
    stackBox.max.z = this.z + 1;

    return stackBox;
  };


  /**
   * Create the bounding box of the current stack view.
   *
   *  @return {{min: {x, y, z}, max: {x, y, z}}}
   */
  StackViewer.prototype.createStackViewBox = function () {
    return this.stackViewBox({min: {}, max: {}});
  };


  /**
   * Write the limiting coordinates of the current stack view's bounding box
   * plus some excess padding space into stackBox.  Faster than creating a
   * new box.
   *
   *  @param stackBox {{min: {x, y, z}, max: {x, y, z}}}
   *  @param padScreenX x-padding in screen coordinates
   *  @param padScreenY y-padding in screen coordinates
   *  @param padScreenZ z-padding in screen coordinates (==stack coordinates as z is not scaled)
   */
  StackViewer.prototype.paddedStackViewBox = function (stackBox, padScreenX, padScreenY, padScreenZ) {
    var w2 = ( this.viewWidth / 2 + padScreenX ) / this.scale / this.primaryStack.anisotropy(0).x;
    var h2 = ( this.viewHeight / 2 + padScreenY ) / this.scale / this.primaryStack.anisotropy(0).y;
    var d2 = 0.5 + padScreenZ;

    stackBox.min.x = this.x - w2;
    stackBox.min.y = this.y - h2;
    stackBox.min.z = this.z - d2;

    stackBox.max.x = this.x + w2;
    stackBox.max.y = this.y + h2;
    stackBox.max.z = this.z + d2;

    return stackBox;
  };


  /**
   * Create the bounding box of the current stack view plus some excess
   * padding space.
   *
   *  @param padScreenX x-padding in screen coordinates
   *  @param padScreenY y-padding in screen coordinates
   *  @param padScreenZ z-padding in screen coordinates (==stack coordinates as z is not scaled)
   */
  StackViewer.prototype.createPaddedStackViewBox = function (padScreenX, padScreenY, padScreenZ) {
    return this.paddedStackViewBox({min: {}, max: {}}, padScreenX, padScreenY, padScreenZ);
  };


  /**
   * Normal of the view plane in project space.
   * @return {THREE.Vector3} Unit length plane normal.
   */
  StackViewer.prototype.normal = function () {
    switch (this.primaryStack.orientation) {
      case CATMAID.Stack.ORIENTATION_XY:
        return new THREE.Vector3(0, 0, -1);
      case CATMAID.Stack.ORIENTATION_XZ:
        return new THREE.Vector3(0, -1, 0);
      case CATMAID.Stack.ORIENTATION_ZY:
        return new THREE.Vector3(-1, 0, 0);
    }
  };


  /**
   * Pixels per nanometer of the minimal planar resolution at the current
   * scale.
   * @return {number}
   */
  StackViewer.prototype.pxPerNm = function () {
    return this.scale / this.primaryStack.minPlanarRes;
  };


  /**
   * align and update the stacks to be ( x, y ) in the image center
   */
  StackViewer.prototype.redraw = function (completionCallback) {
    var allQueued = false, semaphore = 0, layer,
              onAnyCompletion = function () {
      -- semaphore;
      if (allQueued && semaphore === 0) {
        if (typeof completionCallback !== "undefined") {
          completionCallback();
        }
      }
    };

    this.yc = Math.floor( this.y * this.scale * this.primaryStack.anisotropy(0).y - ( this.viewHeight / 2 ) );
    this.xc = Math.floor( this.x * this.scale * this.primaryStack.anisotropy(0).x - ( this.viewWidth / 2 ) );

    // If using WebGL/Pixi, must explicitly tell all layers beforehand that a
    // a redraw is beginning.
    var context = CATMAID.PixiLayer.contexts.get(this);
    if (context) context.resetRenderReadiness();

    // Semaphore pattern from: http://stackoverflow.com/a/3709809/223092
    for (var i = 0; i < this._layerOrder.length; i++) {
      layer = this._layers.get(this._layerOrder[i]);
      // If a layer is invisble, continue with the next one.
      if (layer.hasOwnProperty('visible') && !layer.visible && !layer.updateHidden) {
        continue;
      }
      ++ semaphore;
      layer.redraw(onAnyCompletion, this.blockingRedraws);
    }

    this.old_z = this.z;
    this.old_y = this.y;
    this.old_x = this.x;
    this.old_s = this.s;
    this.old_scale = this.scale;
    this.old_yc = this.yc;
    this.old_xc = this.xc;

    allQueued = true;
    /* Also check at the end, in case none of these
       redraws invovled an AJAX call: */
    if (semaphore === 0) {
      if (typeof completionCallback !== "undefined") {
        completionCallback();
      }
    }
  };

  /**
   * Get the view element
   */
  StackViewer.prototype.getView = function () {
    return this._view;
  };

  /**
   * Get the view element containing layer views.
   * @return {Element} An element whose children are layer views.
   */
  StackViewer.prototype.getLayersView = function () {
    return this._layersView;
  };

  /**
   * Get layers
   */
  StackViewer.prototype.getLayers = function () {
      return this._layers;
  };

  /**
   * Get offset translation.
   * @return {number[]} Offset translation as [x, y, z].
   */
  StackViewer.prototype.getOffset = function () {
    return this._offset.slice(); // Clone array.
  };

  /**
   * Set offset translation and update UI as necessary.
   * @param {number[]} offset Translation as [x, y, z].
   */
  StackViewer.prototype.setOffset = function (offset) {
    this._offset = offset;
    this.updateTitle();
    this.moveToPixel(this.z, this.y, this.x, this.s);
  };

  /**
   * Indicate if location changes are blocked for this stack viewer. In
   * contrast to not navigating with a project, this setting is checked
   * before any attempt to move the project. If one stack viewer blocks
   * the location change, no stack viewer is moved. Location changes are
   * blocked if any layer has the 'blockLocationChange' flag set.
   */
  StackViewer.prototype.canMove = function() {
    var blocked = false;
    this._layers.forEach(function(layer) {
      blocked = blocked || layer.blockLocationChange;
    });
    return !blocked;
  };

  /**
   * Move this stack to the given project coordinates and call the completion
   * callback as a continuation of the update() call. Before the actual move,
   * all layers in <layersWithBeforeMove> are notified about the upcoming move
   * with the help of their beforeMove() function. When doing so, this function
   * passes a call to itself as a continuation to beforeMove(). That is to wait
   * for the return of potential asynchronous calls during beforeMove().
   * Similar to the moveTo functionality in project.js, this wouldn't be
   * possible to do with loops.
   */
  StackViewer.prototype.moveToAfterBeforeMoves = function (zp, yp, xp, sp,
      layersWithBeforeMove) {
    var layerWithBeforeMove;

    if ( layersWithBeforeMove.length === 0 )
    {
      // Then carry on to the actual move:

      if ( typeof sp == "number" )
      {
        var sExtents = this.getZoomExtents();
        this.s = Math.max( sExtents.min, Math.min( sExtents.max, sp ) );
        this.scale = 1.0 / this.primaryStack.effectiveDownsampleFactor(this.s);
      }

      this.x = this.primaryStack.projectToUnclampedStackX( zp, yp, xp ) + this._offset[0];
      this.y = this.primaryStack.projectToUnclampedStackY( zp, yp, xp ) + this._offset[1];
      this.z = this.primaryStack.projectToUnclampedStackZ( zp, yp, xp ) + this._offset[2];

      return new Promise((function(resolve, reject) {
        this.update(resolve, reject);
      }).bind(this));
    }
    else
    {
      // Otherwise do the next layer's beforeMove() and call self recursively as
      // a continuation of it.
      layerWithBeforeMove = layersWithBeforeMove.shift();
      return layerWithBeforeMove.beforeMove()
        .then(this.moveToAfterBeforeMoves.bind(this, zp, yp, xp, sp,
            layersWithBeforeMove));
    }
  };

  /**
   * Move to project-coordinates and execute a completion callback when
   * finished.
   *
   * @Deprecated Do not use this method as it mixes project coordinates with a stack-dependent scale level parameter
   */
  StackViewer.prototype.moveTo = function (zp, yp, xp, sp, completionCallback) {
    // Cancel move if there are blocking layers
    if (!this.canMove()) {
      return Project.reject('The location of this viewer can\'t be changed at the moment');
    }
    // Collect all layers in this stack that require a call before the stack is
    // moved (that is all the layers that have a beforeMove() function).
    var layersWithBeforeMove = [];

    this._layers.forEach(function (layer) {
      if( typeof layer.beforeMove === 'function') {
        layersWithBeforeMove.push(layer);
      }
    });

    var afterBeforeMoves = this.moveToAfterBeforeMoves(zp, yp, xp, sp, layersWithBeforeMove);
    if (completionCallback) {
      afterBeforeMoves.then(completionCallback);
    }
    return afterBeforeMoves;
  };

  /**
   * move to project-coordinates passing project coordinates and resolution
   *
   * This assumes that all layers have identical scale levels and
   * resolution, i.e. that of the stack, fix as needed.
   *
   * @param res spatial resolution in units per pixel
   */
  StackViewer.prototype.moveToProject = function (zp, yp, xp, res, completionCallback) {
    var sp = this.primaryStack.projectToStackSMP( res );

    return this.moveTo( zp, yp, xp, sp, completionCallback );
  };

  /**
   * move to pixel coordinates
   */
  StackViewer.prototype.moveToPixel = function (zs, ys, xs, ss, completionCallback) {
    if (this.navigateWithProject) {
      zs -= this._offset[2];
      ys -= this._offset[1];
      xs -= this._offset[0];
      return this._project.moveToProject(
        this.primaryStack.stackToProjectZ( zs, ys, xs ),
        this.primaryStack.stackToProjectY( zs, ys, xs ),
        this.primaryStack.stackToProjectX( zs, ys, xs ),
        this.primaryStack.stackToProjectSMP( ss ),
        completionCallback);
    } else {
      return this.moveTo(
        this.primaryStack.stackToProjectZ( zs, ys, xs ),
        this.primaryStack.stackToProjectY( zs, ys, xs ),
        this.primaryStack.stackToProjectX( zs, ys, xs ),
        ss,
        completionCallback);
    }
  };

  StackViewer.prototype.resize = function () {
    var width = this.viewWidth = this._view.offsetWidth;
    var height = this.viewHeight = this._view.offsetHeight;

    this._layers.forEach(function (layer) {
      layer.resize(width, height);
    });

    this.updateScaleBar();

    this.overview.redraw();
  };

  /**
   * Get the stack window.
   */
  StackViewer.prototype.getWindow = function () { return this._stackWindow; };

  /**
   * Handle signals sent to the stack viewer's window.
   */
  StackViewer.prototype._handleWindowSignal = function(callingWindow, signal) {
    switch (signal) {
      case CMWWindow.CLOSE:
        this.destroy();
        break;

      case CMWWindow.RESIZE:
        this.resize();
        this.redraw();
        break;

      case CMWWindow.FOCUS:
        this.overview.getView().style.zIndex = "6";
        this._project.setFocusedStackViewer(this);
        break;

      case CMWWindow.BLUR:
        this.overview.getView().style.zIndex = "5";
        if (this._tool) {
          this._tool.unregister();
        }
        this._tool = null;
        break;

      case CMWWindow.POINTER_ENTER:
        if (CATMAID.FOCUS_ALL === CATMAID.focusBehavior ||
            CATMAID.FOCUS_STACKS === CATMAID.focusBehavior) {
          callingWindow.focus();
        }
        break;
    }
    return true;
  };

  StackViewer.prototype.destroy = function() {
    this._layers.forEach(function (layer) {
      if (typeof layer.unregister === 'function') {
        layer.unregister();
      }
    });
    this._layers.clear();
    this._layerOrder.length = 0;
    this._project.removeStackViewer(this.getId());
  };

  /**
   * Get the project.
   */
  StackViewer.prototype.getProject = function () { return this._project; };

  /**
   * Get unique stack viewer identifier.
   */
  StackViewer.prototype.getId = function () { return this._widgetId; };

  /**
   * Determines whether this stack is semantically equal to the provided stack.
   */
  StackViewer.prototype.isEqual = function (otherStack) {
    return this.getId() === otherStack.getId();
  };

  /**
   * Get a layer. Layers are associated by a unique key.
   *
   * @param key
   */
  StackViewer.prototype.getLayer = function (key) {
    return this._layers.get(key);
  };

  /**
   * Return an array of layers which are instances of the given type.
   *
   * @param type
   */
  StackViewer.prototype.getLayersOfType = function(type) {
    return Array.from(this.getLayers().values()).filter(function(layer) {
      return layer instanceof type;
    });
  };

  /**
   * Return an ordered array of layers which are instances of the given type.
   *
   * @param type
   */
  StackViewer.prototype.getOrderedLayersOfType = function(type) {
    return this._layerOrder.map(function(key) {
      return this.get(key);
    }, this.getLayers()).filter(function(layer) {
      return layer instanceof type;
    });
  };

  /**
   * Look up a layer's key using the layer itself.
   *
   * @param  {Object}  needle The layer object.
   * @return {?Object}        The layer key, or null if not in this viewer.
   */
  StackViewer.prototype.getLayerKey = function (needle) {
    var layerKey = null;

    this._layers.forEach(function (layer, key) {
        if (layer === needle) {
          layerKey = key;
        }
      });

    return layerKey;
  };

  /**
   * Get an array of layer keys in their rendering order (back to front).
   * @return {string[]} An array of layer keys.
   */
  StackViewer.prototype.getLayerOrder = function () {
    return this._layerOrder;
  };

  /**
   * Add a layer.  Layers are associated by a unique key.
   * If a layer with the passed key exists, then this layer will be replaced.
   *
   * @param key
   * @param layer
   */
  StackViewer.prototype.addLayer = function (key, layer) {
    if (this._layers.has(key))
      this._layers.get(key).unregister();
    this._layers.set(key, layer);
    if (this._layerOrder.indexOf(key) === -1) {
      this._layerOrder.push(key);

      var strategyName = StackViewer.Settings.session.layer_insertion_strategy ;
      var insertionStrategy = StackViewer.LayerInsertionStrategy[strategyName];
      if (insertionStrategy) {
        insertionStrategy.move(this, layer, key);
      } else {
       throw new CATMAID.ValueError("Unknown layer insertion strategt: " + strategyName);
      }
    }
    this.layercontrol.refresh();
    this.updateTitle();
  };

  /**
   * Remove a layer specified by its key.  If no layer with this key exists,
   * then nothing will happen.  The layer is returned;
   *
   */
  StackViewer.prototype.removeLayer = function (key) {
    var layer = this._layers.get(key);
    if ( typeof layer !== "undefined" && layer )
    {
      layer.unregister();
      this._layers.delete(key);
      this._layerOrder.splice(this._layerOrder.indexOf(key), 1);

      if (layer instanceof CATMAID.StackLayer) {
        var self = this;
        var otherStackLayers = this._layers.forEach(function (otherLayer) {
          return otherLayer instanceof CATMAID.StackLayer && otherLayer.stack.id === layer.stack.id;
        });

        // If this was the last stack layer for a particular stack...
        if (!otherStackLayers) {
          // Remove that stack from this stack viewer and update the tool.
          this._stacks = this._stacks.filter(function (s) { return s.id !== layer.stack.id; });
          this._brokenSliceStacks.delete(layer.stack);
          if (this._tool) {
            this._tool.unregister(this);
            this._tool.register(this);
          }
        }

        StackViewer.trigger(StackViewer.EVENT_STACK_LAYER_REMOVED, layer, this);
      }

      this.layercontrol.refresh();
      return layer;
    }
    else
      return null;
  };

  /**
   * Detemines whether a layer can be removed from this stack viewer.
   * @param  {*} key      Key of the layer to test.
   * @return {Boolean}    Whether the layer is removable.
   */
  StackViewer.prototype.isLayerRemovable = function (key) {
    if (this._layers.size === 1) return false;

    var layer = this._layers.get(key);
    if ( typeof layer !== "undefined" && layer && layer instanceof CATMAID.StackLayer ) {
      if (layer.stack.id === this.primaryStack.id) {
        // If this layer is for the primary stack, it is only removable if
        // there are other primary stack layers.
        return this.getLayersOfType(CATMAID.StackLayer)
          .filter(s => s.stack.id === this.primaryStack.id)
          .length > 1;
      }

      return true;
    }
    else
      return false;
  };

  /**
   * Move a layer to a new position in the layer order.
   * @param {*} key       Key of the layer to move.
   * @param {*} beforeKey Key of the layer to move the layer before or null to
   *                      move to the end.
   */
  StackViewer.prototype.moveLayer = function (key, beforeKey) {
    var currIndex = this._layerOrder.indexOf(key);
    var newIndex = beforeKey === null ? this._layerOrder.length - 1 : this._layerOrder.indexOf(beforeKey);

    if (currIndex === -1 || newIndex === -1) return; // Invalid arguments.

    var layerA = this._layers.get(key),
        layerB = beforeKey === null ? null : this._layers.get(beforeKey);

    if (layerB !== null && layerB.getView) {
      var viewA = layerA.getView(),
        viewB = layerB.getView();
      if (!this._layersView.contains(viewA) || !this._layersView.contains(viewB)) return;
      this._layersView.insertBefore(viewA, viewB);
    } else this._layersView.appendChild(layerA.getView());

    if (typeof layerA.notifyReorder !== 'undefined')
      layerA.notifyReorder(layerB);

    this._layerOrder.splice(newIndex, 0, this._layerOrder.splice(currIndex, 1)[0]);
    this.layercontrol.refresh();
  };

  /**
   * Add a stack layer to this stack viewer.
   * @param {Stack} stack The stack associated with this layer.
   * @param {Object} layer The layer to add.
   */
  StackViewer.prototype.addStackLayer = function (stack, layer) {
    if (stack.orientation !== this.primaryStack.orientation) {
      throw new Error('Stacks must have the same orientation as the primary stack');
    }

    this._stacks.push(stack);
    if (StackViewer.Settings.session.respect_broken_sections_new_stacks) {
      this._brokenSliceStacks.add(stack);
    }

    // Create a unique key for this layer.
    let base_key = 'StackLayer' + stack.id;
    var key = base_key;
    var duplicate = 1;
    while (this._layers.has(key)) {
      key = base_key + '-' + duplicate;
      duplicate += 1;
    }

    this.addLayer(key, layer);
    if (this._tool) {
      this._tool.unregister(this);
      this._tool.register(this);
    }
    this.resize();

    StackViewer.trigger(StackViewer.EVENT_STACK_LAYER_ADDED, layer, this);
  };

  /**
   * Replace a stack's layer with a new one.
   *
   * @param {Object} oldLayerKey Key for the layer to be replaced.
   * @param {Object} newLayer    New layer, must be a stack layer for the
   *                             same stack as the existing layer.
   */
  StackViewer.prototype.replaceStackLayer = function (oldLayerKey, newLayer) {
    var oldLayer = this._layers.get(oldLayerKey);

    if (!oldLayer || oldLayer.stack !== newLayer.stack) {
      throw new Error('Can only replace a stack layer with a new layer for the same stack.');
    }

    this._layers.set(oldLayerKey, newLayer);

    if (this._tool) {
      this._tool.unregister(this);
      this._tool.register(this);
    }

    oldLayer.unregister();

    var oldLayerOrderIdx = this._layerOrder.indexOf(oldLayerKey);
    var nextLayerKey = this._layerOrder[oldLayerOrderIdx + 1];
    if (nextLayerKey) {
      if (CATMAID.tools.isFn(newLayer.notifyReorder)) {
        newLayer.notifyReorder(this._layers.get(nextLayerKey));
      }
    }

    this.resize();

    StackViewer.trigger(StackViewer.EVENT_STACK_LAYER_REMOVED, oldLayer, this);
    StackViewer.trigger(StackViewer.EVENT_STACK_LAYER_ADDED, newLayer, this);

    this.layercontrol.refresh();
    this.updateTitle();
    this.redraw();
  };

  /**
   * Register a tool at this stack.  Unregisters the current tool and then
   * makes the tool working.
   */
  StackViewer.prototype.setTool = function (newTool) {
  //    if ( typeof tool != "undefined" && tool )
  //      tool.unregister();
    // If this tool is already registered to this stack, do nothing.
    if ( this._tool === newTool ) return;
    this._tool = newTool;
    if ( typeof this._tool != "undefined" && this._tool )
      this._tool.register( this );
  };

  /** Return the current tool. */
  StackViewer.prototype.getTool = function () {
    return this._tool;
  };

  /**
   * Shows and hides reference lines that meet on the center of each slice.
   */
  StackViewer.prototype.showReferenceLines = function (show) {
    this._vert.style.display = show ? "block" : "none";
    this._horr.style.display = show ? "block" : "none";
  };

  /**
   * Pulsate reference lines using jQuery UI
   */
  StackViewer.prototype.pulseateReferenceLines = function (times, delay) {
    var visible = this._vert.style.display !== "none";
    var halfDelay = delay * 0.5;
    this.showReferenceLines(true);
    var refLines = $(this._vert).add(this._horr);
    for (var i=0; i<times; ++i) {
      refLines = refLines.fadeOut(halfDelay).fadeIn(halfDelay);
    }
    refLines = refLines.fadeOut(delay, (function() {
      this.showReferenceLines(visible);
    }).bind(this));
  };

  /**
   * Renderer the WebGL content of this viewer to a URL-encoded type.
   * @param  {@string} type               URL encoding format, e.g., 'image/png'
   * @param  {@PIXI.RenderTexture} canvas Target render texture, to reuse.
   * @return {string}                     URL-encoded content.
   */
  StackViewer.prototype.toDataURL = function (type, canvas) {
    let context = CATMAID.PixiLayer.contexts.get(this);
    if (context) return context.toDataURL(type, canvas);
  };

  StackViewer.Settings = new CATMAID.Settings(
      'stack-viewer',
      {
        version: 0,
        entries: {
          display_stack_reference_lines: {
            default: false
          },
          layer_insertion_strategy: {
            default: "image-data-first"
          },
          respect_broken_sections_new_stacks: {
            default: false
          },
        },
        migrations: {}
      });

  CATMAID.StackViewer = StackViewer;

})(CATMAID);
