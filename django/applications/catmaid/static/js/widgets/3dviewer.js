/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  Arbor,
  fetchSkeletons,
  InstanceRegistry,
  project,
  SkeletonAnnotations,
  SkeletonRegistry,
  SynapseClustering,
  WindowMaker
 */

(function(CATMAID) {

  "use strict";

  /* Only methods of the WebGLApplication object elicit a render. All other methods
   * do not, except for those that use continuations to load data (meshes) or to
   * compute with web workers (betweenness centrality shading). */
  var WebGLApplication = function(options) {
    options = options || {};

    this.widgetID = this.registerInstance();
    var registerSource = CATMAID.tools.getDefined(options.registerSource, true);
    CATMAID.SkeletonSource.call(this, registerSource);

    this.APPEND_WARNING_THRESHOLD = 1000;
    // Indicates whether init has been called
    this.initialized = false;
    // Indicates if there is an animation running
    this.animationRequestId = undefined;
    // The current animation, if any
    this.animation = undefined;
    // Indicates if there is a history animation running
    this.historyRequestId = undefined;
    // The current history animation, if any
    this.history = undefined;
    // Map loaded volume IDs to a volume discription incl. an array of Three.js meshes
    this.loadedVolumes = new Map();
    // Map loaded landmark group IDs to an array of Three.js meshes
    this.loadedLandmarkGroups = {};
    // A set of loaded landmark based transformations
    this.loadedLandmarkTransforms = {};
    // Map loaded point cloud IDs to an array of Three.js meshes
    this.loadedPointClouds = {};
    // Map loaded point set IDs to an array of Three.js meshes
    this.loadedPointSets = {};
    // Current set of filtered connectors (if any)
    this.filteredConnectors = null;

    // A set of filter rules to apply to the handled skeletons
    this.filterRules = [];
    // A set of nodes allowed by node filters
    this.allowedNodes = new Set();

    this.options = this.getInitialOptions();

    // Listen to changes of the active node
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
      this.updateActiveNode, this);

    CATMAID.Nodes.on(CATMAID.Nodes.EVENT_NODE_RADIUS_CHANGED,
        this.handleRadiusChange, this);
    CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
      this.handleSkeletonUpdate, this);
  };

  WebGLApplication.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  WebGLApplication.prototype.constructor = WebGLApplication;

  $.extend(WebGLApplication.prototype, new InstanceRegistry());

  WebGLApplication.prototype.getInitialOptions = function() {
    let options = new WebGLApplication.prototype.OPTIONS.clone();
    options.interpolated_sections_x = Array.from(project.interpolatableSections.x);
    options.interpolated_sections_y = Array.from(project.interpolatableSections.y);
    options.interpolated_sections_z = Array.from(project.interpolatableSections.z);

    // If a project and a loaded stack is available, initialize the node scaling
    // for skeletons so that it makes nodes not too big for higher resolutions
    // and not too small for lower ones.
    if (project && project.focusedStackViewer) {
      let stack = project.focusedStackViewer.primaryStack;
      options.skeleton_node_scaling = 2 * Math.min(stack.resolution.x,
          stack.resolution.y, stack.resolution.z);
      options.link_node_scaling = 2 * Math.min(stack.resolution.x,
          stack.resolution.y, stack.resolution.z);
    }

    // Make the scaling factor look a bit prettier by rounding to two decimals
    options.skeleton_node_scaling = Number(options.skeleton_node_scaling.toFixed(2));
    options.link_node_scaling = Number(options.link_node_scaling.toFixed(2));

    return options;
  };

  WebGLApplication.prototype.init = function(canvasWidth, canvasHeight, container) {
    if (this.initialized) {
      return;
    }
    this.container = container;
    this.submit = new CATMAID.submitterFn();
    this.space = new this.Space(canvasWidth, canvasHeight, this.container,
        project.focusedStackViewer.primaryStack, this.loadedVolumes, this.options);
    this.updateActiveNode();
    project.on(CATMAID.Project.EVENT_STACKVIEW_FOCUS_CHANGED, this.adjustStaticContent, this);
    project.on(CATMAID.Project.EVENT_LOCATION_CHANGED, this.handlelLocationChange, this);
    this.initialized = true;
  };

  // Store views in the prototype to make them available for all instances.
  WebGLApplication.prototype.availableViews = {};

  WebGLApplication.prototype.getName = function() {
    return "3D View " + this.widgetID;
  };

  WebGLApplication.prototype.destroy = function() {
    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.updateActiveNode, this);
    CATMAID.Nodes.off(CATMAID.Nodes.EVENT_NODE_RADIUS_CHANGED,
        this.handleRadiusChange, this);
    CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
      this.handleSkeletonUpdate, this);
    project.off(CATMAID.Project.EVENT_STACKVIEW_FOCUS_CHANGED, this.adjustStaticContent, this);
    project.off(CATMAID.Project.EVENT_LOCATION_CHANGED, this.handlelLocationChange, this);
    this.stopAnimation();
    this.unregisterInstance();
    this.unregisterSource();
    this.space.destroy();
    CATMAID.NeuronNameService.getInstance().unregister(this);
    Object.keys(this).forEach(function(key) { delete this[key]; }, this);
  };

  WebGLApplication.prototype.updateModels = function(models) {
    this.append(models);
  };

  WebGLApplication.prototype.getSelectedSkeletons = function() {
    var skeletons = this.space.content.skeletons;
    return Object.keys(skeletons).filter(function(skid) { return skeletons[skid].visible; }).map(Number);
  };

  WebGLApplication.prototype.getSkeletonModel = function(skeleton_id) {
    if (skeleton_id in this.space.content.skeletons) {
      return this.space.content.skeletons[skeleton_id].skeletonmodel.clone();
    }
    return null;
  };

  WebGLApplication.prototype.getSkeletonModels = function() {
    var skeletons = this.space.content.skeletons;
    return Object.keys(skeletons).reduce(function(m, skid) {
      var skeleton = skeletons[skid];
      m[skid] = skeleton.skeletonmodel.clone();
      return m;
    }, {});
  };

  WebGLApplication.prototype.getSelectedSkeletonModels = function() {
    var skeletons = this.space.content.skeletons;
    return Object.keys(skeletons).reduce(function(m, skid) {
      var skeleton = skeletons[skid];
      if (skeleton.visible) {
        m[skid] = skeleton.skeletonmodel.clone();
      }
      return m;
    }, {});
  };

  WebGLApplication.prototype.highlight = function(skeleton_id) {
     // Do nothing, for now
  };

  WebGLApplication.prototype.resizeView = function(w, h) {
    if (!this.space) {
      // WebGLView has not been initialized, can't resize!
      return;
    }

    var canvasWidth = w,
        canvasHeight = h;

    if (!THREEx.FullScreen.activated()) {
      $('#view_in_3d_webgl_widget' + this.widgetID).css('overflowY', 'hidden');
      if(isNaN(h) && isNaN(w)) {
        canvasHeight = 800;
        canvasWidth = 600;
      }

      // use 4:3
      if (isNaN(h)) {
        canvasHeight = canvasWidth / 4 * 3;
      } else if (isNaN(w)) {
        canvasHeight = canvasHeight - 100;
        canvasWidth = canvasHeight / 3 * 4;
      }

      if (canvasWidth < 80 || canvasHeight < 60) {
        canvasWidth = 80;
        canvasHeight = 60;
      }

      $('#viewer-3d-webgl-canvas' + this.widgetID).width(canvasWidth);
      $('#viewer-3d-webgl-canvas' + this.widgetID).height(canvasHeight);
      $('#viewer-3d-webgl-canvas' + this.widgetID).css("background-color", "#000000");

      this.space.setSize(canvasWidth, canvasHeight, this.options);

      this.space.render();
    }
  };

  /**
   * Reevaluate the current set of node filter rules to update the set of
   * allowed nodes.
   */
  WebGLApplication.prototype.updateNodeWhitelist = function(options) {
    var skeletons = this.space.content.skeletons;
    var skeletonIds = Object.keys(skeletons);
    if (skeletonIds.length === 0) {
      if (this.allowedNodes) {
        this.allowedNodes.clear();
      }
      return Promise.resolve();
    }

    var self = this;
    var filter = new CATMAID.SkeletonFilter(this.filterRules, skeletons);
    return filter.execute()
      .then(function(filteredNodes) {
        self.allowedNodes = new Set(Object.keys(filteredNodes.nodes).map(function(n) {
          return parseInt(n, 10);
        }));
        if (0 === self.allowedNodes.length) {
          CATMAID.warn("No points left after filter application");
        }
      });
  };

  WebGLApplication.prototype.insertIntoNodeWhitelist = function(models) {
    var self = this;
    var filter = new CATMAID.SkeletonFilter(this.filterRules, models);
    return filter.execute()
      .then(function(filteredNodes) {
        if (self.allowedNodes) {
          var allowedSkeletonNodes = Object.keys(filteredNodes.nodes).map(function(n) {
            return parseInt(n, 10);
          });
          if (0 === allowedSkeletonNodes.length) {
            CATMAID.warn("No points left after filter application");
          } else if (self.allowedNodes) {
              self.allowedNodes.addAll(allowedSkeletonNodes);
          }
        }
      });
  };

  WebGLApplication.prototype.updateFilter = function(options) {
    var self = this;
    this.updateNodeWhitelist(options)
      .then(function() {
        self.updateSkeletons();
      })
      .catch(CATMAID.handleError);
  };

  WebGLApplication.prototype.fullscreenWebGL = function() {
    if (THREEx.FullScreen.activated()){
      THREEx.FullScreen.cancel();
    } else {
      THREEx.FullScreen.request(document.getElementById('viewer-3d-webgl-canvas' + this.widgetID));
      var w = window.innerWidth, h = window.innerHeight;
      this.resizeView( w, h );
      // Explicitly resize controls, because the internal resize handler of the
      // oribit controls isn't aware of full screen mode.
      this.space.resizeControls(0, 0, w, h);
    }
    this.space.render();
  };

  WebGLApplication.prototype.webVRSetup = function(button, checkbox) {
    if (this.vrInterface) {
      // If an interface already exists, destroy it so that a new one can be
      // created. This can fix cases like the device or VRManager being in a
      // bad state.
      this.vrInterface.stop();
      this.vrInterface.clearAllEvents();
      this.vrInterface = undefined;
      button.textContent = 'Enter';
      button.disabled = true;
    }

    if (!checkbox.checked) return;

    // Clear checkbox, since it should only be checked once a device is found.
    checkbox.checked = false;
    checkbox.disabled = true;

    if ('getVRDisplays' in navigator) {
      navigator.getVRDisplays()
        .then(displays => {

          if (displays.length > 0) {
            let device = displays[0];
            this.vrInterface = new CATMAID.WebVRInterface(this.space.view, device);

            this.vrInterface.on(
                CATMAID.WebVRInterface.EVENT_VR_START,
                () => {
                  button.textContent = 'Exit';
                  button.onclick = this.vrInterface.stop.bind(this.vrInterface);
                });
            this.vrInterface.on(
                CATMAID.WebVRInterface.EVENT_VR_END,
                () => {
                  button.textContent = 'Enter';
                  button.onclick = this.vrInterface.start.bind(this.vrInterface);
                });

            button.onclick = this.vrInterface.start.bind(this.vrInterface);
            button.disabled = false;
            checkbox.checked = true;
          } else {
            CATMAID.warn("No VR device found");
          }

          checkbox.disabled = false;
        })
        .catch(() => { checkbox.disabled = false; });
    } else {
      CATMAID.warn("WebVR is not supported on your system");
      checkbox.disabled = false;
    }
  };

  /**
   * Show a dialog to ask the user for image dimensions, resize the view to the
   * new dimensions,execute the given function and return to the original
   * dimension afterwards.
   */
  WebGLApplication.prototype.askForDimensions = function(title, defaultFileName, fn, block) {
    if (!defaultFileName) {
      defaultFileName = "catmaid-3d-viewer.png";
    }
    var dialog = new CATMAID.OptionsDialog(title);
    dialog.appendMessage("Please adjust the dimensions to your liking. They " +
        "default to the current size of the 3D viewer");
    var imageWidthField = dialog.appendField("Image width (px): ",
        "image-width", this.space.canvasWidth);
    var imageHeightField = dialog.appendField("Image height (px): ",
        "image-height", this.space.canvasHeight);
    var fileNameField = dialog.appendField("File name: ",
        "filename", defaultFileName);

    dialog.onOK = handleOK.bind(this);
    dialog.show(350, "auto", true);

    function handleOK() {
      /* jshint validthis: true */ // `this` is bound to this WebGLApplication
      if (block) {
        $.blockUI({message: '<img src="' + CATMAID.staticURL +
            'images/busy.gif" /> <span>Please wait</span>'});
      }

      var originalWidth, originalHeight;
      try {
        var width = parseInt(imageWidthField.value);
        var height = parseInt(imageHeightField.value);
        let fileName = fileNameField.value.trim();

        if (!width || !height) {
          throw new CATMAID.ValueError("Please use valid width and height values");
        }

        // Save current dimensions and set new ones, if available
        if (width !== this.space.canvasWidth || height !== this.space.canvasHeight) {
          originalWidth = this.space.canvasWidth;
          originalHeight = this.space.canvasHeight;
          this.resizeView(width, height);
        } else {
          this.space.render();
        }

        // Call passed in function
        if (CATMAID.tools.isFn(fn)) fn(fileName);
      } catch (e) {
        CATMAID.error("An error occurred", e);
      }

      // Restore original dimensions
      if (originalWidth && originalHeight) {
        this.resizeView(originalWidth, originalHeight);
      }

      if (block) {
        $.unblockUI();
      }
    }
  };


  /**
   * Store the current view as PNG image.
   */
  WebGLApplication.prototype.exportPNG = function() {
    this.askForDimensions("PNG export", "catmaid-3d-viewer.png", (function(fileName) {
      try {
        /* jshint validthis: true */ // `this` is bound to this WebGLApplication
        var imageData = this.space.view.getImageData();
        var blob = CATMAID.tools.dataURItoBlob(imageData);
        CATMAID.info("The exported PNG will have a transparent background");
        CATMAID.FileExporter.saveAs(blob, fileName);
      } catch(e) {
        CATMAID.error("Could not export current 3D view, there was an error: " + e,
            e.stack);
      }
    }).bind(this), true);
  };

  /**
   * Store the current view as SVG image.
   */
  WebGLApplication.prototype.exportSVG = function() {
    if (this.options.triangulated_lines) {
      CATMAID.warn('Volumetric lines (View settings) need to be disabled for the SVG export to work. Try switching them off for the export.');
    }
    this.askForDimensions("SVG export", "catmid-3d-viewer.svg", (function(fileName) {
      $.blockUI({message: '<img src="' + CATMAID.staticURL +
          'images/busy.gif" /> <span id="block-export-svg">Please wait</span>'});
      var label = $('#block-export-svg');
      label.text("Exporting SVG");

      // Queue individual steps as tasks to have better UI feedback. To give the
      // browser a chance to render progress messages, setTimeout() has to be
      // used instead of promises. The former queue an tasks and the latter
      // queue microtasks. Rendering happens only between tasks.
      var error = false, start, last;
      function queue(msg, fn) {
        var f = function() {
          if (msg) {
            // Update message and start task
            label.text(msg);
          }
          setTimeout(function() {
            if (error) return;
            try {
              fn();
              if (f.callback) {
                f.callback();
              }
            } catch (e) {
              $.unblockUI();
              error = true;
              CATMAID.error("Could not export current 3D view, there was an error: " + e,
                  e.stack);
            }
          }, 0);
        };

        // If there is no function queued yet, make this function the first. If
        // there is at least one function queued, run this function as a
        // callback of the last function.
        if (!start) {
          start = f;
        } else if (last) {
          last.callback = f;
        }
        // Make this function the last one added
        last = f;
      }

      var self = this, svg;
      queue("Rendering SVG", function() {
        svg = self.space.view.getSVGData();
      });

      queue("Postprocessing", function() {
          CATMAID.svgutil.reduceCoordinatePrecision(svg, 1);
          CATMAID.svgutil.stripStyleProperties(svg, {
            'fill': 'none',
            'stroke-opacity': 1,
            'stroke-linejoin': undefined
          });
          CATMAID.svgutil.reduceStylePrecision(svg, 1);
      });

      queue("Generating output", function() {
        var styleDict = CATMAID.svgutil.classifyStyles(svg);

        var styles = Object.keys(styleDict).reduce(function(o, s) {
          var cls = styleDict[s];
          o = o + "." + cls + "{" + s + "}";
          return o;
        }, "");

        var xml = $.parseXML(new XMLSerializer().serializeToString(svg));
        CATMAID.svgutil.addStyles(xml, styles);

        var data = new XMLSerializer().serializeToString(xml);
        CATMAID.FileExporter.saveAs(data, fileName, 'text/svg');
      });

      queue(false, function() {
        setTimeout($.unblockUI, 0);
      });

      // Start processing and give the browser a chance to render progress
      // information.
      setTimeout(start, 100);

    }).bind(this));
  };

  /**
   * Create an store a neuron catalog SVG for the current view.
   */
  WebGLApplication.prototype.exportCatalogSVG = function() {
    if (this.options.triangulated_lines) {
      CATMAID.warn('Volumetric lines (View settings) need to be disabled for the SVG export to work. Try switching them off during the export.');
    }
    var dialog = new CATMAID.OptionsDialog("Catalog export options");
    dialog.appendMessage('Adjust the catalog export settings to your liking.');

    var globalNns = CATMAID.NeuronNameService.getInstance();

    // Create a new empty neuron name service that takes care of the sorting names
    var ns = CATMAID.NeuronNameService.newInstance(true);
    var namingOptions = ns.getOptions();
    var namingOptionNames = namingOptions.reduce(function(l, o) {
      l.push(o.name);
      return l;
    }, ['Global name (Neuron name service)']);
    var namingOptionIds = namingOptions.reduce(function(l, o) {
      l.push(o.id);
      return l;
    }, ['global']);

    // Get available skeleton list sources
    var pinSourceOptions = CATMAID.skeletonListSources.createOptions();
    var pinSourceOptionNames = ["(None)"].concat(pinSourceOptions.map(function(o) { return o.text; }));
    var pinSourceOptionIds = ['null'].concat(pinSourceOptions.map(function(o) { return o.value; }));

    // Format options
    var panelFormatNames = ['SVG', 'PNG (1 x view size)', 'PNG (2 x view size)', 'PNG (4 x view size)'];
    var panelFormatIds = ['svg', 'png1', 'png2', 'png4'];

    // Scale options
    var orthoScaleOptionNames = ['No scale bar', 'Scale bar in first panel', 'Scale bar in all panels'];
    var orthoScaleOptionIds = ['none', 'first-panel', 'all-panels'];

    // Add options to dialog
    var columns = dialog.appendField("# Columns: ", "svg-catalog-num-columns", '2');
    var sorting = dialog.appendChoice("Sorting name: ", "svg-catalog-sorting",
        namingOptionNames, namingOptionIds);
    var pinSources = dialog.appendChoice("Skeletons to pin: ", "svg-catalog-pin-source",
        pinSourceOptionNames, pinSourceOptionIds);
    var panelFormats = dialog.appendChoice("Panel format: ", "svg-catalog-panel-format",
        panelFormatNames, panelFormatIds);
    var orthoScaleOption = dialog.appendChoice("Ortho scale bar: ", "svg-catalog-ortho-scale-bar",
        orthoScaleOptionNames, orthoScaleOptionIds);
    var displayNames = dialog.appendCheckbox('Display names', 'svg-catalog-display-names', true);
    var nSkeletonsPerPanelControl = dialog.appendNumericField("Skeletons per panel",
        'svg-catalog-skeletons-per-panel', '1', 1);
    var coordDigits = dialog.appendField("# Coordinate decimals", 'svg-catalog-coord-digits', '1');
    var fontsize = dialog.appendField("Fontsize: ", "svg-catalog-fontsize", '14');
    var margin = dialog.appendField("Margin: ", "svg-catalog-margin", '10');
    var padding = dialog.appendField("Padding: ", "svg-catalog-pading", '10');
    var title = dialog.appendField("Title: ", "svg-catalog-title", 'CATMAID neuron catalog');

    // Only allow scale bar configuration in orthographic mode
    var inOrthographicMode = this.options.camera_view === 'orthographic';
    if (!inOrthographicMode) {
      orthoScaleOption.setAttribute('disabled', 'disabled');
      orthoScaleOption.setAttribute('title', 'Can only be used in orthographic mode');
    }

    // Use change chandler of labeling select to ask user for annotations
    var labelingOption;
    $(sorting).on('change', function() {
      var newLabel = namingOptionIds[sorting.selectedIndex];
      if (newLabel === 'all-meta' || newLabel === 'own-meta') {
        // Ask for meta annotation
        var dialog = new CATMAID.OptionsDialog("Please enter meta annotation");
        var field = dialog.appendField("Meta annotation", 'meta-annotation',
            '', true);
        dialog.onOK = function() {
          labelingOption = field.value;
        };

        // Update all annotations before, showing the dialog
        CATMAID.annotations.update()
          .then(() => {
            dialog.show(300, 'auto');
            // Add auto complete to input field
            $(field).autocomplete({
              source: CATMAID.annotations.getAllNames()
            });
          })
          .catch(CATMAID.handleError);
      } else {
        labelingOption = undefined;
      }
    });

    dialog.onOK = handleOK.bind(this);

    dialog.show(400, 460, true);


    let backgroundColor = new THREE.Color(this.options.background_color);
    let isBackgroundDark = backgroundColor.getHSL({}).l < 0.5;

    function handleOK() {
      /* jshint validthis: true */ // `this` is bound to this WebGLApplication
      $.blockUI();
      // Get models of exported skeletons
      var models = this.getSelectedSkeletonModels();
      // Configure labeling of name service
      var labelingId = namingOptionIds[sorting.selectedIndex];
      ns.addLabeling(labelingId, labelingOption);

      // Check if there are pinned skeletons that have to be loaded first
      var pinnedSkeletonModels = {};
      if (pinSources.selectedIndex > 0) {
        var srcId = pinSourceOptionIds[pinSources.selectedIndex];
        var src = CATMAID.skeletonListSources.getSource(srcId);
        pinnedSkeletonModels = src.getSelectedSkeletonModels();
      }
      var pinnedSkeletonIds = Object.keys(pinnedSkeletonModels);
      var addedPinnendSkeletons = pinnedSkeletonIds.filter(function(skid) {
        return !(skid in models);
      });

      // Panel format
      var panelFormat = panelFormats.value;

      // Ortho scale bar
      var orthoScaleBar = orthoScaleOption.value;

      // Text color ins inverse of background.
      // TODO: The SVG export doesn't support black backgrounds currently, and
      // is therefore treated special.
      var textColor = isBackgroundDark && panelFormat != 'svg' ? 'white' : 'black';

      // Number of skeletons per panel
      var nSkeletonsPerPanel = parseInt(nSkeletonsPerPanelControl.value, 10);

      // Fetch names for the sorting
      ns.registerAll(dialog, models, (function() {
        if (0 === addedPinnendSkeletons.length) {
          createSVG.call(this);
        } else {
          // Make sure all pinned skeletons are available in the 3D viewer
          this.addSkeletons(pinnedSkeletonModels, (function() {
            this.space.render();
            createSVG.call(this);
            // Remove all added pinned skeletons again
            this.removeSkeletons(addedPinnendSkeletons);
          }).bind(this));
        }
      }).bind(this));

      function createSVG() {
        try {
          // Build sorting name list
          var skeletonIds = Object.keys(models);
          var sortingNames = skeletonIds.reduce(function(o, skid) {
            var name = labelingId === 'global' ? globalNns.getName(skid) : ns.getName(skid);
            if (!name) {
              throw "No valid name found for skeleton " + skid +
                  " with labeling " + labelingId +
                  labelingOption ? "(" + labelingOption + ")" : "";
            }
            o[skid] = name;
            return o;
          }, {});
          // Sort skeleton IDs based on the names
          skeletonIds.sort(function(a, b) {
            return sortingNames[a].localeCompare(sortingNames[b], 'en',
                {numeric: true});
          });

          // Collect options
          var options = {
            layout: 'catalog',
            columns: parseInt(columns.value),
            skeletons: skeletonIds,
            pinnedSkeletons: pinnedSkeletonIds,
            displaynames: Boolean(displayNames.checked),
            fontsize: parseFloat(fontsize.value),
            margin: parseInt(margin.value),
            padding: parseInt(padding.value),
            title: title.value,
            panelFormat: panelFormat,
            orthoScaleBar: orthoScaleBar,
            textColor: textColor,
          };

          if (nSkeletonsPerPanel) {
            options.skeletonsPerPanel = nSkeletonsPerPanel;
          }

          // Export catalog
          var svg = this.space.view.getSVGData(options);
          var precision = parseInt(coordDigits.value);
          CATMAID.svgutil.reduceCoordinatePrecision(svg, precision);
          CATMAID.svgutil.stripStyleProperties(svg, {
            'fill': 'none',
            'stroke-opacity': 1,
            'stroke-linejoin': undefined
          });
          CATMAID.svgutil.reduceStylePrecision(svg, precision);

          var styleDict = CATMAID.svgutil.classifyStyles(svg);

          var styles = Object.keys(styleDict).reduce(function(o, s) {
            var cls = styleDict[s];
            o = o + "." + cls + "{" + s + "}";
            return o;
          }, "");

          var xml = $.parseXML(new XMLSerializer().serializeToString(svg));
          CATMAID.svgutil.addStyles(xml, styles);

          var data = new XMLSerializer().serializeToString(xml);
          CATMAID.FileExporter.saveAs(data, "catmaid-neuron-catalog.svg", 'text/svg');
        } catch (e) {
          CATMAID.error("Could not export neuron catalog. There was an error.", e);
        }
        $.unblockUI();
      }
    }
  };

  WebGLApplication.prototype.exportSkeletonsAsCSV = function() {
    var sks = this.space.content.skeletons,
        getName = CATMAID.NeuronNameService.getInstance().getName,
        header = "skeleton_id, treenode_id, parent_treenode_id, x, y, z, r\n",
        exporter = CATMAID.FileExporter.export(header, "skeleton_coordinates.csv", 'text/csv');
    Object.keys(sks).forEach(function(skid) {
      var sk = sks[skid];
      if (!sk.visible) return;
      var vs = sk.getPositions(),
          arbor = sk.createArbor(),
          edges = arbor.edges,
          name = getName(skid);
      edges[arbor.root] = ''; // rather than null
      Object.keys(vs).forEach(function(tnid) {
        var v = vs[tnid];
        var mesh = sk.radiusVolumes[tnid];
        var r = mesh ? mesh.scale.x : 0; // See createNodeSphere and createCylinder
        exporter.write(`${skid}, ${tnid}, ${edges[tnid]}, ${v.x}, ${v.y}, ${v.z}, ${r}\n`);
      });
    });
    exporter.save();
  };

  WebGLApplication.prototype.exportNames = function() {
    var sks = this.space.content.skeletons,
        getName = CATMAID.NeuronNameService.getInstance().getName,
        exporter = CATMAID.FileExporter.export('"skeleton_id", "neuron_name"\n',
            "skeleton_names.csv", 'text/csv');
    Object.keys(sks).forEach(function(skid) {
      var sk = sks[skid];
      if (!sk.visible) return;
      exporter.write(`${skid}, "${getName(skid)}"\n`);
    });
    exporter.save();
  };

  /**
   * Return a new THREE.Mesh instance that adds "flesh to the bone".
   */
  WebGLApplication.prototype.toTriangleMeshes = function(skeletonId, material,
      radius, radiusSegments) {
    // Get Arbor and split into partitions
    let skeleton = this.space.content.skeletons[skeletonId];
    if (!skeleton) {
      throw new CATMAID.Warning("Skeleton " + skeletonId + " is not loaded");
    }
    let arbor = skeleton.createArbor();
    let partitions = arbor.partition();
    let positions = skeleton.getPositions();
    radius = CATMAID.tools.getDefined(radius, 10);
    radiusSegments = CATMAID.tools.getDefined(radiusSegments, 8);

    let addSphereAndEdge = function(p, i, partition) {
      let pos = this.positions[p];
      let hasParent = i < (partition.length - 1);
      let isNotRoot = hasParent || this.arbor.root != p;
      // Make sure we have an integer
      let id = parseInt(p, 10);
      let nodeSphere = this.nodes.get(id);
      if (!nodeSphere) {
        let r = isNotRoot ? radius : (3 * radius);
        let sphere = new THREE.SphereGeometry(r, radiusSegments, radiusSegments);
        sphere.translate(pos.x, pos.y, pos.z);
        this.nodes.set(id, nodeSphere);
        this.mesh.geometry.merge(sphere);
      }

      // We are walking a skeleton segment from leaf to root, only create
      // cylinders for nodes that have a partent in this segment.
      if (hasParent) {
        let parentId = partition[i + 1];
        let parentPos = this.positions[parentId];
        let distance = pos.distanceTo(parentPos);
        let cylinderAxis = new THREE.Vector3().subVectors(pos, parentPos);
        cylinderAxis.normalize();
        var theta = Math.acos(cylinderAxis.y);
        var rotationAxis = new THREE.Vector3();
        rotationAxis.crossVectors(cylinderAxis, new THREE.Vector3(0, 1, 0));
        rotationAxis.normalize();
        // The cylinder doesn't need to be capped, because of the spheres.
        let cylinder = new THREE.CylinderGeometry(radius, radius, distance,
            radiusSegments, 1, true);
        let m = new THREE.Matrix4();
        m.makeRotationAxis(rotationAxis, -theta);
        var position = new THREE.Vector3(
            (pos.x + parentPos.x) / 2,
            (pos.y + parentPos.y) / 2,
            (pos.z + parentPos.z) / 2);
        m.setPosition(position);
        cylinder.applyMatrix(m);
        this.mesh.geometry.merge(cylinder);
      }
    };

    // For each partition create a sphere for each node (if not yet available)
    // and connect to parent with a cylinder.
    let meshData = partitions.reduce(function(data, partition) {
      partition.forEach(addSphereAndEdge, data);
      return data;
    }, {
      mesh: new THREE.Mesh(new THREE.Geometry(), material),
      nodes: new Map(),
      positions: positions,
      arbor: arbor
    });

    return [meshData.mesh];
  };

  /**
   * Use Three.js to export the loaded skeleton ID as OBJ file.
   */
  WebGLApplication.prototype.exportObj = function(skeletonIds, lines) {
    var skeletons = skeletonIds.map(function(skeletonId) {
      let skeleton = this.space.content.skeletons[skeletonId];
      if (!skeleton) {
        throw new CATMAID.Warning("Skeleton " + skeletonId + " is not loaded");
      }
      return skeleton;
    }, this);
    let packAsZip = true;
    let exportColor = true;

    let self = this;
    let radius = 50, radiusSegments = 8;
    let filename = "catmaid-skeleton-" + skeletonIds.join("-");
    let doExport = function(asLines) {
      let header = "# CATMAID v" + CATMAID.CLIENT_VERSION + "\n" +
          "# File created: " + (new Date()) + '\n';
      let data = [header];
      let materialData = [header];
      if (exportColor) {
        data.push("mtllib " + filename + ".mtl");
      }
      let scene = new THREE.Scene();
      let exporter = new THREE.OBJExporter();
      let meshesToReAdd = [];
      let addedMaterials = [];
      for (let i=0; i < skeletons.length; ++i) {
        let skeleton = skeletons[i];
        let skeletonId = skeleton.id;
        let mesh = skeleton.actor['neurite'];
        let material = mesh.material;

        let skeletonData;
        if (asLines) {
          scene.add(mesh);
          meshesToReAdd.push(mesh);
        } else {
          let meshes = self.toTriangleMeshes(skeletonId, material,
              radius, radiusSegments);
          meshes.forEach(function(m) {
            scene.add(m);
          });
        }

        if (exportColor) {
          let c = material.color;
          let materialName = "mat_skeleton_" + skeletonId;
          materialData.push("newmtl " + materialName + "\n" +
            "Ka " + c.r + " " + c.g + " " + c.b + "\n" +
            "Kd " + c.r + " " + c.g + " " + c.b + "\n");
          addedMaterials.push(materialName);
        }
      }

      let skeletonData = exporter.parse(scene);
      for (let i=0; i<meshesToReAdd.length; ++i) {
        // Needed, because we reuse the existing mesh here and it seems to be
        // only able to be part of one scene at a time.
        self.space.scene.project.add(meshesToReAdd[i]);
      }

      // Replace created "o" elemnts (object grous) with group elements
      let nMatch = -1;
      skeletonData = skeletonData.replace(/^o.*/mg, function() {
        ++nMatch;
        let groupDefinition = "\n# Skeleton " + skeletonIds[nMatch] + "\n" +
            "g skeleton_" + skeletonIds[nMatch];
        if (exportColor) {
          // Add material reference to skeleton data
          groupDefinition += "\n" + "usemtl " + addedMaterials[nMatch] + "\n";
        }
        return groupDefinition;
      });

      data.push(skeletonData);

      data = data.join('\n');
      materialData = materialData.join('\n');

      if (packAsZip) {
        var zip = new JSZip();
        zip.file(filename + ".obj", data);
        if (exportColor) {
          zip.file(filename + ".mtl", materialData);
        }
        var content = zip.generate({type: "blob"});
        CATMAID.FileExporter.saveAs(content, filename + '.zip');
      } else {
        CATMAID.FileExporter.saveAs(data, filename + '.obj', 'text/obj');
        if (exportColor) {
          CATMAID.FileExporter.saveAs(materialData, filename + '.mtl', 'text/mtl');
        }
      }
    };

    let dialog = new CATMAID.OptionsDialog('Select type of export', {
        "Cancel": function() {
          $(this).dialog("close");
        },
        "Lines": function() {
          doExport(true);
          $(this).dialog("close");
        },
        "Mesh": function() {
          doExport(false);
          $(this).dialog("close");
        }
      });

    dialog.appendMessage("Please select whether the active skeleton should be " +
        "exported as a simple lines or triangle mesh. These exports tend to " +
        "become large quickly and in case of an error you might try to re-sample " +
        "the skeleton first (Skeleton filters tab), reduce the number of skeletons " +
        "or reduce the segment count below.");

    let zipSetting = CATMAID.DOM.createCheckboxSetting(
        "Create ZIP archive", packAsZip, "Result files can get easily bigger than 50MB " +
        "and are therefore compressed using ZIP by default.",
        function(e) {
          packAsZip = this.checked;
        });
    dialog.appendChild(zipSetting[0]);

    let colorSetting = CATMAID.DOM.createCheckboxSetting(
        "Include color information", exportColor, "A material file (.mtl) will " +
        "be createad and referenced from the object file.",
        function(e) {
          exportColor = this.checked;
        });
    dialog.appendChild(colorSetting[0]);

    let filenameSetting = CATMAID.DOM.createInputSetting(
        "Filename", filename, "The filename of the result file, without extension.",
        function(e) {
          filename = this.value;
        });
    $('input', filenameSetting).css('width', '25em');
    dialog.appendChild(filenameSetting[0]);

    let meshMsg = dialog.appendMessage("If a mesh result is requested, all " +
        "skeleton line segments are represented as tubes. They come with " +
        "additional parameters:");
    meshMsg.classList.add('clear');

    let radiusSetting = CATMAID.DOM.createNumericInputSetting(
        "Radius", radius, 1,
        "The radius of the generated tubes",
        function(e) {
          radius = parseInt(this.value, 10);
        });
    dialog.appendChild(radiusSetting[0]);

    let radiusSegmentsSetting = CATMAID.DOM.createNumericInputSetting(
        "Radius segments", radiusSegments, 1,
        "The number of segments that make up a crossection of the generated tubes",
        function(e) {
          radiusSegments = parseInt(this.value, 10);
        });
    dialog.appendChild(radiusSegmentsSetting[0]);

    dialog.show(600, 'auto');
  };

  /** Will export only those present in the 3D View, as determined by the connector restriction option.
   * By its generic nature, it will export even connectors whose relations to the skeleton are something
   * other than pre- or postsynaptic_to. */
  WebGLApplication.prototype.exportConnectorsAsCSV = function() {
    var sks = this.space.content.skeletons,
        header = "connector_id, skeleton_id, treenode_id, relation_id\n";
    let exporter = CATMAID.FileExporter.export(header, "connectors.csv", 'text/csv');
    Object.keys(sks).forEach(function(skid) {
      var sk = sks[skid];
      sk.synapticTypes.forEach(function(type) {
        var vs = (sk.connectoractor ? sk.connectorgeometry : sk.geometry)[type].vertices;
        for (var i=0; i<vs.length; i+=2) {
          exporter.write([vs[i].node_id, skid, vs[i].treenode_id, type].join(',') + '\n');
        }
      });
    });
    exporter.save();
  };

  WebGLApplication.prototype.exportSynapsesAsCSV = function() {
    var header = "pre_skeleton_id, pre_treenode_id, post_skeleton_id, post_treenode_id\n";
    let exporter = CATMAID.FileExporter.export(header, 'synapses.csv', 'text/csv');
    var unique = {};
    fetchSkeletons(
        this.getSelectedSkeletons(),
        function(skid) {
          return CATMAID.makeURL(project.id + '/' + skid + '/0/1/0/compact-arbor');
        },
        function(skid) { return {}; }, // POST
        function(skid, json) {
          unique[skid] = true;
          json[1].forEach(function(row) {
            if (0 === row[6]) {
              // skid  is pre
              exporter.write(`${skid}, ${row[0]}, ${row[5]}, ${row[4]}\n`);
            } else {
              // skid is post
              exporter.write(`${row[5]}, ${row[4]}, ${skid}, ${row[0]}\n`);
            }
            unique[row[5]] = true;
          });
        },
        function(skid) { CATMAID.msg("Error", "Failed to load synapses for: " + skid); },
        (function() {
          exporter.save();

          var nns = CATMAID.NeuronNameService.getInstance(),
              dummy = new THREE.Color(1, 1, 1);
          nns.registerAll(
              this,
              Object.keys(unique).reduce(function(o, skid) { o[skid] = new CATMAID.SkeletonModel(skid, "", dummy); return o; }, {}),
              function() {
                let nameExporter = CATMAID.FileExporter.saveAs('"Skeleton ID", "Neuron name"\n',
                    "neuron_name_vs_skeleton_id.csv", 'text/csv');
                var names = Object.keys(unique).forEach(function(skid) {
                  nameExporter.write(`${skid}, ${nns.getName(skid)}\n`);
                });
                nameExporter.save();
              });
        }).bind(this));
  };

  /** Return a list of skeleton IDs that have nodes within radius of the active node. */
  WebGLApplication.prototype.spatialSelect = function() {
    var active_skid = SkeletonAnnotations.getActiveSkeletonId(),
        skeletons = this.space.content.skeletons;
    if (!active_skid) return alert("No active skeleton!");
    if (!skeletons[active_skid]) return alert("Active skeleton is not present in the 3D view!");
    var od = new CATMAID.OptionsDialog("Spatial select"),
        choice = od.appendChoice("Select neurons ", "spatial-mode",
            ["in nearby space",
             "synapting with active neuron",
             "synapting and downstream of active node",
             "synapting and upstream of active node"],
             [0, 1, 2, 3], 1),
        field = od.appendField("... within distance from the active node (nm):", "spatial-distance", this.options.distance_to_active_node),
        choice2 = od.appendChoice("If synapting, pick ", "spatial-synapse-type",
            ["both",
             "downstream partner",
             "upstream partner"],
            [-1, 0, 1], -1),
        choice3 = od.appendChoice("... of which load: ", "spatial-filter",
            ["skeletons with more than 1 node",
             "skeletons with 1 single node",
             "all"],
            [0, 1, 2], 0),
        checkbox = od.appendCheckbox("Only among loaded in 3D view", "spatial-loaded", false);

    od.onOK = (function() {
      var distance = CATMAID.tools.validateNumber(field.value, "Invalid distance value", 1);
      if (!distance) return;
      var mode = Number(choice.value),
          distanceSq = distance * distance,
          synapse_mode = Number(choice2.value),
          skeleton_mode = Number(choice3.value),
          loaded_only = checkbox.checked,
          active_node = SkeletonAnnotations.getActiveNodeId(),
          p = SkeletonAnnotations.getActiveNodePositionW(),
          va = new THREE.Vector3(p.x, p.y, p.z),
          synapticTypes = WebGLApplication.prototype.Space.prototype.Skeleton.prototype.synapticTypes,
          near = null,
          query = null,
          post = null,
          filter = function(sk) {
            if (2 == skeleton_mode) return true;
            else if (0 === skeleton_mode) return sk.getVertexCount() > 1;
            else if (1 == skeleton_mode) return 1 === sk.getVertexCount();
          };
      // Restrict by synaptic relation
      switch (synapse_mode) {
        case 0: synapticTypes = synapticTypes.slice(0, 1); break;
        case 1: synapticTypes = synapticTypes.slice(1, 2); break;
      }

      var newSelection = function(skids) {
        if (0 === skids.length) return CATMAID.info("No skeletons found");
        var models = {};
        skids.forEach(function(skid) {
          models[skid] = new CATMAID.SkeletonModel(skid, "", new THREE.Color(0.5, 0.5, 0.5));
        });
        WindowMaker.create('selection-table');
        var sel = CATMAID.SelectionTable.prototype.getLastInstance();
        sel.append(models);
      };

      // Restrict by spatial position
      if (0 === mode) {
        // Intersect 3D viewer's skeletons
        if (loaded_only) {
          near = [];
          Object.keys(skeletons).forEach(function(skid) {
            if (active_skid == skid) return; // == to enable string vs int comparison
            var s = skeletons[skid];
            if (s.visible && filter(s) && s.someVertex(function(v) {
              return va.distanceToSquared(v) < distanceSq;
            })) {
              near.push(skid);
            }
          });
        } else {
          query = "within-spatial-distance";
          post = {distance: distance,
                  treenode_id: active_node,
                  size_mode: skeleton_mode};
        }
      } else {
        var sk = skeletons[active_skid],
            arbor = sk.createArbor();
        // Restrict part of the arbor to look at
        switch(mode) {
          case 2: // Only downstream
            arbor = arbor.subArbor(active_node);
            break;
          case 3: // Only upstream
            arbor.subArbor(active_node).nodesArray().forEach(function(node) {
              if (node === active_node) return;
              delete arbor.edges[node];
            });
        }
        var within = arbor.findNodesWithin(active_node,
            (function(child, paren) {
              return this[child].distanceTo(this[paren]);
            }).bind(sk.getPositions()),
            distance);
        // Find connectors within the part to look at
        var connectors = {};
        synapticTypes.forEach(function(type) {
          var vs = sk.geometry[type].vertices;
          for (var i=0; i<vs.length; i+=2) {
            if (within[vs[i].treenode_id]) connectors[vs[i].node_id] = true;
          }
        });
        // Find partner skeletons
        if (loaded_only) {
          near = [];
          // Find the same connectors in other loaded skeletons
          Object.keys(skeletons).forEach(function(skid) {
            if (skid === active_skid) return;
            var partner = skeletons[skid];
            if (!filter(partner)) return;
            synapticTypes.forEach(function(type) {
              var vs = partner.geometry[type].vertices;
              for (var i=0; i<vs.length; i+=2) {
                var connector_id = vs[i].node_id;
                if (connectors[connector_id]) {
                  near.push(skid);
                  break;
                }
              }
            });
          });
        } else {
          var cs = Object.keys(connectors).map(Number);
          if (cs.length > 0) {
            query = "partners-by-connector";
            post = {connectors: cs,
                    skid: active_skid,
                    relation: synapse_mode,
                    size_mode: skeleton_mode};
          } else {
            newSelection([]);
          }
        }
      }
      // List selected skeletons if any
      if (near) {
        newSelection(near);
      } else if (query) {
        CATMAID.fetch(project.id + '/skeletons/' + query, "POST", post)
          .then(function(json) {
            if (json.skeletons) {
              if (json.reached_limit) CATMAID.warn("Too many: loaded only a subset");
              newSelection(json.skeletons);
            } else {
              newSelection(json);
            }
          })
          .catch(CATMAID.handleError);
      }
    }).bind(this);

    od.show("auto", "auto", false);
  };



  WebGLApplication.prototype.Options = function() {
    this.debug = false;
    this.meshes_color = "#ffffff";
    this.meshes_opacity = 0.2;
    this.meshes_faces = false;
    this.meshes_subdiv = 0;
    this.meshes_boundingbox = false;
    this.meshes_boundingbox_color = '#72ff00';
    this.landmarkgroup_color = "#ffa500";
    this.landmarkgroup_opacity = 0.2;
    this.landmarkgroup_faces = true;
    this.landmarkgroup_bb = true;
    this.landmarkgroup_text = true;
    this.landmark_scale = 2000;
    this.pointcloud_color = "#ffa500";
    this.pointcloud_opacity = 0.2;
    this.pointcloud_box_color = '#ffa500';
    this.pointcloud_box_opacity = 0.2;
    this.pointcloud_faces = false;
    this.pointcloud_text = false;
    this.pointcloud_scale = 500;
    this.pointcloud_sample = 1.0;
    this.text_scaling = 1.0;
    this.show_missing_sections = false;
    this.missing_section_height = 20;
    this.show_active_node = true;
    this.active_node_on_top = false;
    this.active_node_respects_radius = true;
    this.show_axes = false;
    this.show_floor = true;
    this.floor_color = '#535353';
    this.background_color = '#000000';
    this.show_box = true;
    this.show_zplane = false;
    this.zplane_texture = true;
    this.zplane_zoomlevel = "max";
    this.zplane_size_check = true;
    this.zplane_opacity = 0.8;
    this.zplane_replace_background = false;
    this.zplane_min_bg_val = 0.0;
    this.zplane_max_bg_val = 0.0;
    this.zplane_replacement_bg_color = '#FFFFFF';
    this.show_ortho_scale_bar = true;
    this.custom_tag_spheres_regex = '';
    this.custom_tag_spheres_color = '#aa70ff';
    this.custom_tag_spheres_opacity = 0.6;
    this.neuron_material = 'lambert';
    this.connector_filter = false;
    this.show_connector_links = true;
    this.show_radius = true;
    this.shading_method = 'none';
    this.color_method = 'none';
    this.tag_regex = '';
    this.connector_color = 'cyan-red';
    this.custom_connector_colors = {
        'presynaptic_to': '#ffa500',
        'postsynaptic_to': '#005aff',
    };
    this.camera_view = 'perspective';
    this.lean_mode = false;
    this.synapse_clustering_bandwidth = 5000;
    this.smooth_skeletons = false;
    this.smooth_skeletons_sigma = 200; // nm
    this.resample_skeletons = false;
    this.resampling_delta = 3000; // nm
    this.collapse_artifactual_branches = false;
    this.triangulated_lines = true;
    this.skeleton_line_width = 3;
    this.skeleton_node_scaling = 1.0;
    this.link_node_scaling = 1.0;
    this.invert_shading = false;
    this.interpolate_vertex_colots = true;
    this.follow_active = false;
    this.update_active = false;
    this.distance_to_active_node = 5000; // nm
    this.min_synapse_free_cable = 5000; // nm
    this.lock_view = false;
    this.animation_fps = 25;
    this.animation_rotation_axis = "up";
    this.animation_rotation_time = 15;
    this.animation_back_forth = false;
    this.animation_animate_z_plane = false;
    this.animation_zplane_changes_per_sec = 10;
    this.animation_zplane_change_step = 2;
    this.animation_stepwise_visibility_type = 'all';
    this.animation_stepwise_visibility_options = null;
    this.animation_hours_per_tick = 4;
    this.animation_start_date = null;
    this.animation_end_date = null;
    this.animation_record_timerange = false;
    this.animation_history_include_merges = true;
    this.animation_history_empy_bout_length = 10;
    this.animation_history_reset_after_stop = false;
    this.strahler_cut = 2;
    this.use_native_resolution = true;
    this.interpolate_sections = true;
    this.interpolated_sections = [];
    this.interpolated_sections_x = [];
    this.interpolated_sections_y = [];
    this.interpolated_sections_z = [];
    this.interpolate_broken_sections = false;
    this.apply_filter_rules = true;
    this.volume_location_picking = false;
    this.allowed_sampler_domain_ids = [];
    this.allowed_sampler_interval_ids = [];
    this.sampler_domain_shading_other_weight = 0;
    this.polyadicity_colors = {
        0: 'white',
        1: 'red',
        2: 'green',
        3: 'cyan',
        4: 'blue',
        5: 'purple'
    };
  };

  WebGLApplication.prototype.Options.prototype = {};

  WebGLApplication.prototype.Options.prototype.clone = function() {
    var src = this;
    return Object.keys(this).reduce(function(copy, key) {
        copy[key] = CATMAID.tools.deepCopy(src[key]);
        return copy;
      }, new WebGLApplication.prototype.Options());
  };

  WebGLApplication.prototype.Options.prototype.createMeshMaterial = function(color, opacity) {
    color = color || new THREE.Color(this.meshes_color);
    if (typeof opacity === 'undefined') opacity = this.meshes_opacity;
    return new THREE.MeshLambertMaterial({color: color, opacity: opacity,
      transparent: opacity !== 1, wireframe: !this.meshes_faces, side: THREE.DoubleSide,
      depthWrite: opacity === 1});
  };

  WebGLApplication.prototype.Options.prototype.createLandmarkGroupMaterial = function(color, opacity) {
    color = color || new THREE.Color(this.landmarkgroup_color);
    if (typeof opacity === 'undefined') opacity = this.landmarkgroup_opacity;
    return new THREE.MeshLambertMaterial({color: color, opacity: opacity,
      transparent: opacity !== 1, wireframe: !this.landmarkgroup_faces, side: THREE.DoubleSide,
      depthWrite: opacity === 1});
  };

  WebGLApplication.prototype.Options.prototype.createLandmarkMaterial = function(color, opacity) {
    var material = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(generateSprite(color, opacity)),
        blending: THREE.AdditiveBlending,
        alphaTest: 0.5,
        depthWrite: false,
      });
    return material;
  };

  WebGLApplication.prototype.Options.prototype.createPointCloudBoxMaterial = function(color, opacity) {
    color = color || new THREE.Color(this.pointcloud_box_color);
    if (typeof opacity === 'undefined') opacity = this.pointcloud_box_opacity;
    return new THREE.MeshLambertMaterial({color: color, opacity: opacity,
      transparent: opacity !== 1, wireframe: !this.pointcloud_faces, side: THREE.DoubleSide,
      depthWrite: opacity === 1});
  };

  WebGLApplication.prototype.Options.prototype.createPointCloudMaterial = function(color, opacity) {
    var material = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(generateSprite(color, opacity)),
        blending: THREE.AdditiveBlending
      });
    return material;
  };

  WebGLApplication.prototype.Options.prototype.ensureFont = function() {
    if (this.font) {
      return Promise.resolve(this.font);
    }

    let self = this;
    return new Promise(function(resolve, reject) {
      var loader = new THREE.FontLoader();
      var url = CATMAID.makeStaticURL('libs/three.js/fonts/helvetiker_regular.typeface.json');
      loader.load(url, function(newFont) {
        // Share font
        self.font = newFont;
        resolve(newFont);
      }, undefined, reject);
    });
  };

  function generateSprite(color, opacity) {
    var canvas = document.createElement( 'canvas' );
    canvas.width = 16;
    canvas.height = 16;
    var context = canvas.getContext( '2d' );
    var gradient = context.createRadialGradient( canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width / 2 );
    gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
    if (color) {
      gradient.addColorStop( 0.2, color.getStyle());
      gradient.addColorStop( 0.4, color.getStyle());
    } else {
      gradient.addColorStop( 0.2, 'rgba(0,255,255,1)' );
      gradient.addColorStop( 0.4, 'rgba(0,0,64,1)' );
    }
    gradient.addColorStop( 1, 'rgba(0,0,0,1)' );
    context.fillStyle = gradient;
    context.fillRect( 0, 0, canvas.width, canvas.height );
    return canvas;
  }


  /** Persistent options, get replaced every time the 'ok' button is pushed in the dialog. */
  WebGLApplication.prototype.OPTIONS = new WebGLApplication.prototype.Options();

  /** Receives an extra argument (an event) which is ignored. */
  WebGLApplication.prototype.updateColorMethod = function(colorMenu) {
    if ('downstream-of-tag' === colorMenu.value) {
      var dialog = new CATMAID.OptionsDialog("Type in tag");
      dialog.appendMessage("Nodes downstream of tag: magenta.\nNodes upstream of tag: dark grey.");
      var input = dialog.appendField("Tag (regex): ", "tag_text", this.options.tag_regex);
      dialog.onOK = (function() {
        this.options.tag_regex = input.value;
        this.options.color_method = colorMenu.value;
        this.updateSkeletonColors()
          .then(this.render.bind(this));
      }).bind(this);
      dialog.onCancel = function() {
        // Reset to default (can't know easily what was selected before).
        colorMenu.selectedIndex = 0;
      };
      dialog.show();
      return;
    } else if ('x-lut' === colorMenu.value) {
      var stack = this.space.stack;
      this.options.xDim = stack.dimension.x * stack.resolution.x;
      this.options.xOffset = stack.translation.x;
    } else if ('y-lut' === colorMenu.value) {
      var stack = this.space.stack;
      this.options.yDim = stack.dimension.y * stack.resolution.y;
      this.options.yOffset = stack.translation.y;
    } else if ('z-lut' === colorMenu.value) {
      var stack = this.space.stack;
      this.options.zDim = stack.dimension.z * stack.resolution.z;
      this.options.zOffset = stack.translation.z;
    }

    this.options.color_method = colorMenu.value;
    this.space.userColormap = {};
    this.updateSkeletonColors()
      .then(this.render.bind(this));
  };

  WebGLApplication.prototype.updateSkeletonColors = function() {
    var skeletons = this.space.content.skeletons;
    var colorizer = CATMAID.makeSkeletonColorizer(this.options);
    return colorizer.prepare(skeletons)
      .then((function() {
        Object.keys(skeletons).forEach(function(skeleton_id) {
          skeletons[skeleton_id].updateSkeletonColor(colorizer);
        });
      }).bind(this));
  };

  WebGLApplication.prototype.render = function() {
    this.space.render();
  };

  WebGLApplication.prototype.setSkeletonShadingType = function(shading) {
    var skeletons = this.space.content.skeletons;
    Object.keys(skeletons).filter(function(skid) {
      skeletons[skid].setShadingType(shading);
    });
    this.space.render();
  };

  WebGLApplication.prototype.XYView = function() {
    this.space.view.XY();
    this.space.render();
  };

  WebGLApplication.prototype.XZView = function() {
    this.space.view.XZ();
    this.space.render();
  };

  WebGLApplication.prototype.ZYView = function() {
    this.space.view.ZY();
    this.space.render();
  };

  WebGLApplication.prototype.ZXView = function() {
    this.space.view.ZX();
    this.space.render();
  };

  /**
   * Store the current view with the given name.
   */
  WebGLApplication.prototype.storeCurrentView = function(name, callback) {
    if (!name) {
      var dialog = new CATMAID.OptionsDialog("Store current view");
      dialog.appendMessage('Please enter a name for the current view');
      var n = this.getStoredViews().length + 1;
      var nameField = dialog.appendField("Name: ", "new-view-name", 'View ' + n);

      // Call this function with a name as parameter
      dialog.onOK = (function() {
        this.storeCurrentView(nameField.value, callback);
      }).bind(this);
      dialog.show(300, 200, true);
    } else {
      // Abort if a view with this name exists already
      if (name in this.availableViews) {
        CATMAID.error("A view with the name \"" + name + "\" already exists.");
        return;
      }
      // Store view
      this.availableViews[name] = this.space.view.getView();

      if (callback) {
        callback();
      }
    }
  };

  /**
   * Return the list of stored views.
   */
  WebGLApplication.prototype.getStoredViews = function() {
    return Object.keys(this.availableViews);
  };

  /**
   * Set the view to a previously stored one and return true. Returns false if
   * no views was found under the given name.
   *
   * @param {String} name - name of the view to activate
   */
  WebGLApplication.prototype.activateView = function(name) {
    if (!(name in this.availableViews)) {
      CATMAID.error("There is no view named \"" + name + "\"!");
      return;
    }
    // Activate view by executing the stored function
    var view = this.availableViews[name];
    this.space.view.setView(view.target, view.position, view.up, view.zoom,
        view.orthographic);
    // Update options
    this.options.camera_view = view.orthographic ? 'orthographic' : 'perspective';
    // Render scene
    this.space.render();
  };

  /**
   * Activate or deactivate the use of native resolution. If activated, quality
   * is improved for HiDPI displays for the cost of performance.
   *
   * @param {boolean} useNativeResolution If native resolution should be used.
   */
  WebGLApplication.prototype.setNativeResolution = function(useNativeResolution) {
    this.options.use_native_resolution = !!useNativeResolution;
    this.space.view.initRenderer();
    this.space.render();
  };

  WebGLApplication.prototype._skeletonVizFn = function(field) {
    return function(skeleton_id, value) {
      var skeletons = this.space.content.skeletons;
      if (!skeletons.hasOwnProperty(skeleton_id)) return;
      skeletons[skeleton_id]['set' + field + 'Visibility'](value);
      this.space.render();
    };
  };

  WebGLApplication.prototype.setSkeletonPreVisibility = WebGLApplication.prototype._skeletonVizFn('Pre');
  WebGLApplication.prototype.setSkeletonPostVisibility = WebGLApplication.prototype._skeletonVizFn('Post');
  WebGLApplication.prototype.setSkeletonTextVisibility = WebGLApplication.prototype._skeletonVizFn('Text');
  WebGLApplication.prototype.setSkeletonMetaVisibility = WebGLApplication.prototype._skeletonVizFn('Meta');

  /**
   * Allow only connectors that have more than one partner in the current
   * selection
   */
  WebGLApplication.filterSharedConnectors = function(counts) {
    var common = {};
    for (var connector_id in counts) {
      if (counts.hasOwnProperty(connector_id) && counts[connector_id].length > 1) {
        common[connector_id] = null; // null, just to add something
      }
    }
    return common;
  };

  /**
   * Allow only connectors that have more than one partner in the current
   * selection
   */
  WebGLApplication.filterPrePostConnectors = function(counts) {
    var common = {};
    for (var connector_id in counts) {
      if (counts.hasOwnProperty(connector_id) &&
          counts[connector_id].some(isPresynaptic) &&
          counts[connector_id].some(isPostsynaptic)) {
        common[connector_id] = null; // null, just to add something
      }
    }
    return common;

    function isPresynaptic(value) { return 'presynaptic_to' === value[1]; }
    function isPostsynaptic(value) { return 'postsynaptic_to' === value[1]; }
  };

  /**
   * Allow only connectors that have more than one partner in the current
   * selection and that connect skeletons between the two groups.
   */
  WebGLApplication.filterGroupSharedConnectors = function(group1, group2, onlyPrePost, counts) {
    // Find all shared connecors
    var common = {};
    for (var connector_id in counts) {
      if (counts.hasOwnProperty(connector_id)) {
        // Only allow connectors that connect to both source groups, find links to
        // each group from the current connector.
        var inSource1 = [], inSource2 = [];
        var connectorCounts = counts[connector_id];
        for (var i=0, max=connectorCounts.length; i<max; ++i) {
          var link = connectorCounts[i];
          if (group1.hasOwnProperty(link[0])) inSource1.push(link);
          if (group2.hasOwnProperty(link[0])) inSource2.push(link);
        }

        // For being visible, the connector has to have links into both groups
        var visible = inSource1.length > 0 && inSource2.length > 0;
        // If at least one pre-post-connection between the two groups is required,
        // check for this.
        if (visible && (onlyPrePost[0] || onlyPrePost[1])) {
          var preIn1 = inSource1.some(isPresynaptic);
          var preIn2 = inSource2.some(isPresynaptic);
          var postIn1 = inSource1.some(isPostsynaptic);
          var postIn2 = inSource2.some(isPostsynaptic);
          visible = (onlyPrePost[0] && preIn1 && postIn2) ||
                    (onlyPrePost[1] && preIn2 && postIn1);
        }

        if (visible) {
          common[connector_id] = null; // null, just to add something
        }
      }
    }

    return common;

    function isPresynaptic(value) { return 'presynaptic_to' === value[1]; }
    function isPostsynaptic(value) { return 'postsynaptic_to' === value[1]; }
  };

  /**
   * Get user input for creating a goup share filter for connectors. It requires
   * two skeleton sources that form the groups between which connectors are
   * allowed.
   */
  WebGLApplication.makeGroupShareConnectorFilter = function(callback) {
    var source1, source2;

    // Add skeleton source message and controls
    var dialog = new CATMAID.OptionsDialog('Select groups');

    // Add user interface
    dialog.appendMessage('Please select two skeleton sources that represent ' +
        'groups. Only connections between neurons visible in the 3D viewer ' +
        'that link neurons from one group to the other will be shown.');
    var source1Input = addSourceInput(dialog.dialog, "Source 1:");
    var source2Input = addSourceInput(dialog.dialog, "Source 2:");
    var source1PrePost = dialog.appendCheckbox(
        "Restrict to pre->post from source 1 to source 2");
    var source2PrePost = dialog.appendCheckbox(
        "Restrict to pre->post from source 2 to source 1");

    // Add handler for initiating the export
    dialog.onOK = function() {
      var source1 = CATMAID.skeletonListSources.getSource($(source1Input).val());
      var source2 = CATMAID.skeletonListSources.getSource($(source2Input).val());
      if (!source1 || !source2) {
        CATMAID.error("Couldn't find expected skeleton sources");
        return;
      }
      var group1 = source1.getSelectedSkeletonModels();
      var group2 = source2.getSelectedSkeletonModels();
      if (!group1 || !group2) {
        CATMAID.error("Couldn't find expected skeleton models");
        return;
      }

      var filter =  WebGLApplication.filterGroupSharedConnectors.bind(
          this, group1, group2,
          [source1PrePost.checked, source2PrePost.checked]);

      if (CATMAID.tools.isFn(callback)) {
        callback(filter);
      }
    };

    dialog.onCancel = function() {
      if (CATMAID.tools.isFn(callback)) {
        callback(null);
      }
    };

    dialog.show(350, 320, true);

    function addSourceInput(d, name) {
      var select = document.createElement('select');
      CATMAID.skeletonListSources.createOptions().forEach(function(option, i) {
        select.options.add(option);
        if (option.value === 'Active skeleton') select.selectedIndex = i;
      });
      var label_p = document.createElement('p');
      var label = document.createElement('label');
      label.appendChild(document.createTextNode(name));
      label.appendChild(select);
      label_p.appendChild(label);
      d.appendChild(label_p);
      return select;
    }
  };

  WebGLApplication.prototype.setConnectorRestriction = function(restriction) {
    var self = this;

    if ('none' === restriction) {
      this.options.connector_filter = false;
    } else if ('all-shared' === restriction) {
      this.options.connector_filter = WebGLApplication.filterSharedConnectors;
    } else if ('all-pre-post' === restriction) {
      this.options.connector_filter = WebGLApplication.filterPrePostConnectors;
    } else if ('all-group-shared' === restriction) {
      WebGLApplication.makeGroupShareConnectorFilter(function(filter) {
        if (filter) {
          self.options.connector_filter = filter;
          self.refreshRestrictedConnectors();
          self.render();
        }
      });
      // Prevent application of filter. This is done in function above, once user
      // input is complete.
      return;
    } else {
      throw new CATMAID.ValueError('Unknown connector restriction: ' + restriction);
    }

    this.refreshRestrictedConnectors();
    this.render();
  };

  WebGLApplication.prototype.refreshRestrictedConnectors = function() {
    // Display regular markers only if no restriction is used
    var skeletons = this.space.content.skeletons;
    var skids = Object.keys(skeletons);

    if (this.options.connector_filter) {
      // Hide regular connector meshes
      skids.forEach(function(skid) {
        var skeleton = skeletons[skid];
        skeleton.setPreVisibility(false, true);
        skeleton.setPostVisibility(false, true);
      });

      var restriction = this.options.connector_filter;

      // Find all connector IDs referred to by more than one skeleton
      // but only for visible skeletons
      var visible_skeletons = Object.keys(skeletons).filter(function(skeleton_id) {
        return skeletons[skeleton_id].visible;
      });
      var synapticTypes = this.space.Skeleton.prototype.synapticTypes;

      // Map all connectors to the skeletons they connect to
      var counts = visible_skeletons.reduce(function(counts, skeleton_id) {
        return synapticTypes.reduce(function(counts, type) {
          var vertices = skeletons[skeleton_id].geometry[type].vertices;
          // Vertices is an array of Vector3, every two a pair, the first at the
          // connector and the second at the node
          for (var i=vertices.length-2; i>-1; i-=2) {
            var connector_id = vertices[i].node_id;
            if (!counts.hasOwnProperty(connector_id)) {
              counts[connector_id] = [];
            }
            // Store a reference to the type for each connector
            counts[connector_id].push([skeleton_id, type]);
          }
          return counts;
        }, counts);
      }, {});

      // Filter all connectors
      var common = restriction(counts);

      var visible_set = visible_skeletons.reduce(function(o, skeleton_id) {
        o[skeleton_id] = null;
        return o;
      }, {});

      // Remember current set of filtered connectors
      var filteredConnectorIds = Object.keys(common);
      this.filteredConnectors = {
        'connectorIds': filteredConnectorIds,
        'skeletonIds': filteredConnectorIds.length ? visible_skeletons : []
      };

      let updatedSkeletons = [];
      for (var skeleton_id in skeletons) {
        if (skeletons.hasOwnProperty(skeleton_id)) {
          skeletons[skeleton_id].remove_connector_selection();
          if (skeleton_id in visible_set) {
            skeletons[skeleton_id].create_connector_selection( common );
            skeletons[skeleton_id].updateConnectorRestictionVisibilities();
            updatedSkeletons.push(skeletons[skeleton_id]);
          }
        }
      }
      this.space.updateRestrictedConnectorColors(updatedSkeletons);
    } else {
      skids.forEach(function(skid) {
        skeletons[skid].remove_connector_selection();
      });
      // Declare that there is no filter used at the moment
      this.filteredConnectors = null;

      // Refresh regular connector visibility from models
      skids.forEach(function(skid) {
        var skeleton = skeletons[skid];
        skeleton.setPreVisibility(skeleton.skeletonmodel.pre_visible);
        skeleton.setPostVisibility(skeleton.skeletonmodel.post_visible);
      });
    }

    // Depending on the current settings, edges might not be visible.
    this.space.updateConnectorEdgeVisibility(this.options,
      skids.map(function(skid) { return this[skid]; }, skeletons));
  };

  /**
   * Set neuron visibility with the help of a dialog in case the visibility type
   * needs
   */
  WebGLApplication.prototype.setAnimationNeuronVisibility = function(type, options) {
    var visibility = CATMAID.WebGLApplication.AnimationNeuronVisibilities[type];
    if (!visibility) {
      throw new CATMAID.ValueError("Unknown neuron visibility type: " + type);
    }

    // Bind visibility to widget and option object
    this.options.animation_stepwise_visibility_type = type;
    this.options.animation_stepwise_visibility_options = options;
  };

  WebGLApplication.AnimationNeuronVisibilities = {
    'all': function() {},
    'n-per-rotation': function(options, skeletonIds, visibleSkeletons, r) {
      // Expect r to be the numnber of rotations done
      var skeletonIndex = parseInt(r * options.n);
      // Make next skeleton visible, if available
      for (var i=0; i<options.n; ++i) {
        if ((skeletonIndex + i) < skeletonIds.length) {
          visibleSkeletons.push(skeletonIds[skeletonIndex + i]);
        }
      }
    },
    'explicit-order': function(options, skeletonIds, visibleSkeletons, r) {
      if (r in options.rotations) {
        options.rotations[r].forEach(function(skeletonId) {
          visibleSkeletons.push(skeletonId);
        });
      }
    },
    'history': function(options, skeletonIds, visibleSkeletons, r) {
      console.log('animation visibility: ' + r);
    }
  };

  WebGLApplication.prototype.set_shading_method = function() {
    // Set the shading of all skeletons based on the state of the "Shading" pop-up menu.
    this.options.shading_method = $('#skeletons_shading' + this.widgetID + ' :selected').attr("value");

    this.updateSkeletonColors()
      .then(this.render.bind(this));
  };

  WebGLApplication.prototype.look_at_active_node = function() {
    this.space.content.active_node.updatePosition(this.space, this.options);
    this.lookAt(this.space.content.active_node.mesh.position);
  };

  /**
   * Look at a particular location.
   */
  WebGLApplication.prototype.lookAt = function(position) {
    if (position instanceof Array) {
      this.space.view.controls.target.set(position[0], position[1], position[2]);
    } else {
      this.space.view.controls.target.copy(position);
    }
    this.space.render();
  };

  /**
   * Look at the center of mass of a loaded skeleton.
   */
  WebGLApplication.prototype.lookAtSkeleton = function(skeletonId) {
    var skeleton = this.space.content.skeletons[skeletonId];
    if (!skeleton) {
      throw new CATMAID.ValueError("Skeleton " + skeletonId + " is not loaded");
    }
    this.lookAt(skeleton.getCenterOfMass());
  };

  WebGLApplication.prototype.updateActiveNode = function() {
    var activeNode = this.space.content.active_node;
    var activeNodeDisplayed = activeNode.mesh.visible;
    var activeNodeSelected = !!SkeletonAnnotations.getActiveNodeId();

    activeNode.setVisible(activeNodeSelected);
    activeNode.updatePosition(this.space, this.options);

    if (activeNode.mesh.visible && this.options.follow_active) {
      // Center the active node, if wanted
      this.look_at_active_node();
    } else if (activeNode.mesh.visible || activeNode.mesh.visible !== activeNodeDisplayed) {
      // Render if the active node is visible or if it was deselected
      this.space.render();
    }
  };

  WebGLApplication.prototype.handleRadiusChange = function(updatedNodes) {
    if (updatedNodes) {
      var updatedSkeletonIds = [];
      // Collect changed skeletons
      for (var nodeId in updatedNodes) {
        var skid = updatedNodes[nodeId].skeleton_id;
        if (skid && -1 == updatedSkeletonIds.indexOf(skid)) {
          updatedSkeletonIds.push(skid);
        }
      }
      // Update if we display a changed skeleton
      this.reloadSkeletons(updatedSkeletonIds);
    }
  };

  WebGLApplication.prototype.handleSkeletonUpdate = function(skeletonId) {
    // Update active skeleton, if enabled
    if (this.options.update_active) {
      var activeSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
      if (activeSkeletonId === skeletonId) {
        this.updateSkeleton(skeletonId, true);
      }
    }
  };

  WebGLApplication.prototype.hasSkeleton = function(skeleton_id) {
    return this.space.content.skeletons.hasOwnProperty(skeleton_id);
  };

  /** Reload only if present. */
  WebGLApplication.prototype.staticReloadSkeletons = function(skeleton_ids) {
    this.getInstances().forEach(function(instance) {
      instance.reloadSkeletons(skeleton_ids);
    });
  };

  WebGLApplication.prototype.hasActiveFilters = function() {
    return this.options.apply_filter_rules && this.filterRules.length > 0;
  };

  WebGLApplication.prototype.getActivesNodeWhitelist = function() {
    return this.hasActiveFilters() ? this.allowedNodes : null;
  };

  /** Fetch skeletons one by one, and render just once at the end. */
  WebGLApplication.prototype.addSkeletons = function(models, callback, nodeProvider) {
    // Handle multiple skeleton additions sequentially
    var prepare;
    if (this._activeLoading) {
      prepare = this._activeLoading;
    } else {
      prepare = Promise.resolve();
    }

    // Find missing skeletons
    prepare = prepare.then((function() {
      var missingSkeletonIds = Object.keys(models).filter(function(skid) {
        return !this.space.content.skeletons[skid];
      }, this).map(Number);

      if (missingSkeletonIds.length > 0) {
        var options = this.options;
        var lean = options.lean_mode;
        var self = this;

        if (!nodeProvider) {
          nodeProvider = new CATMAID.RegularNodeProvider();
        }

        // Register with the neuron name service and fetch the skeleton data
        return CATMAID.NeuronNameService.getInstance().registerAll(this, models)
          .then(function() {
            if (self.hasActiveFilters()) {
              return self.insertIntoNodeWhitelist(models);
            }
          })
          .then(function() {
            return nodeProvider.get(project.id, missingSkeletonIds, {
                with_tags: !lean,
                with_connectors: !lean,
                with_history: false
            }, function(skeletonId, json) {
              if (self.space) {
                var sk = self.space.updateSkeleton(models[skeletonId], json,
                   options, undefined, self.getActivesNodeWhitelist());
                if (sk) sk.show(options);
              }
            });
          })
          .catch(CATMAID.handleError);
      }
    }).bind(this));

    // Get colorizer for all skeletons
    var colorizer = CATMAID.makeSkeletonColorizer(this.options);
    prepare = prepare.then((function() {
      if (this.space) {
        return colorizer.prepare(this.space.content.skeletons);
      }
    }).bind(this));

    // Update skeleton properties
    var add = prepare.then((function() {
      if (!this.space) {
        return;
      }
      var availableSkletons = this.space.content.skeletons;
      var inputSkeletonIds = Object.keys(models);
      var updatedSkeletons = [];
      for (var i=0, max=inputSkeletonIds.length; i<max; ++i) {
        var skeletonId = inputSkeletonIds[i];
        var model = models[skeletonId];
        var skeleton = availableSkletons[skeletonId];
        if (skeleton) {
          skeleton.skeletonmodel = model;
          skeleton.setActorVisibility(model.selected);
          skeleton.setPreVisibility(model.pre_visible);
          skeleton.setPostVisibility(model.post_visible);
          skeleton.setTextVisibility(model.text_visible);
          skeleton.setMetaVisibility(model.meta_visible);
          skeleton.actorColor = model.color.clone();
          skeleton.opacity = model.opacity;
          skeleton.updateSkeletonColor(colorizer);
          updatedSkeletons.push(skeleton);
        }
      }
      // In case connectors are colored like skeletons, they have to be
      // updated, too.
      if ('skeleton' === this.options.connector_color) {
        return this.space.updateConnectorColors(this.options, updatedSkeletons);
      } else {
        this.space.updateConnectorEdgeVisibility(this.options, updatedSkeletons);
      }
    }).bind(this))
    .then((function() {
      if (!this.space) {
        return;
      }
      if (this.options && this.options.connector_filter) {
        this.refreshRestrictedConnectors();
      }
      CATMAID.tools.callIfFn(callback);
    }).bind(this))
    .catch(CATMAID.handleError);

    // Remember this addition as active loading
    this._activeLoading = add;

    return add;
  };

  /** Reload skeletons from database. */
  WebGLApplication.prototype.updateSkeletons = function() {
    var models = this.getSelectedSkeletonModels(); // visible ones
    this.clear();
    this.append(models);
  };

  /**
   * Update active skeleton, if is part of this 3D viewer.
   *
   * @params {quiet} If falsy, a message will be shown if active skeleton not in
   *                 3D viewer.
   */
  WebGLApplication.prototype.updateActiveSkeleton = function(quiet) {
    var skeletonId = SkeletonAnnotations.getActiveSkeletonId();
    if (!skeletonId) {
      if (!quiet) {
        CATMAID.info("No active skeleton");
        return;
      }
    }
    this.updateSkeleton(skeletonId, quiet);
  };

  /**
   * Update a skeleton if it is part of this 3D viewer.
   *
   * @params {Number}  skeletonId The ID of the skeleton to update.
   * @params {Boolean} quiet      If falsy, a message will be shown if active
   *                              skeleton not in 3D viewer.
   */
  WebGLApplication.prototype.updateSkeleton = function(skeletonId, quiet) {
    var sk = this.space.content.skeletons[skeletonId];
    if (!sk) {
      if (!quiet) {
        CATMAID.info("Active skeleton is not present in the 3D viewer");
      }
      return;
    }
    // Remove and re-add (without removing, only properties are updated upon append, not the geometry)
    this.space.removeSkeleton(sk.id);
    var models = {};
    models[sk.id] = sk.skeletonmodel;
    this.append(models);
  };

  WebGLApplication.prototype.append = function(models) {
    if (0 === Object.keys(models).length) {
      CATMAID.info("No skeletons selected!");
      return;
    }
    return this.addSkeletons(models, false)
      .then((function() {
        this.space.render();
      }).bind(this));
  };

  WebGLApplication.prototype.clear = function() {
    this.removeSkeletons(Object.keys(this.space.content.skeletons));
    this.space.render();
  };

  WebGLApplication.prototype.getSkeletonColor = function( skeleton_id ) {
    if (skeleton_id in this.space.content.skeletons) {
      return this.space.content.skeletons[skeleton_id].actorColor.clone();
    }
    return new THREE.Color(1, 0, 1);
  };

  WebGLApplication.prototype.hasSkeleton = function(skeleton_id) {
    return skeleton_id in this.space.content.skeletons;
  };

  /**
   * Remove and re-add all skeletons from the passed in list of IDs that are
   * currently loaded.
   */
  WebGLApplication.prototype.reloadSkeletons = function(skeleton_ids) {
    var models = skeleton_ids.filter(this.hasSkeleton, this)
        .reduce((function(m, skid) {
           m[skid] = this.getSkeletonModel(skid);
           return m;
        }).bind(this), {});
    this.space.removeSkeletons(skeleton_ids);
    this.updateModels(models);
  };

  WebGLApplication.prototype.removeSkeletons = function(skeleton_ids) {
    if (!this.space) return;
    this.space.removeSkeletons(skeleton_ids);
    if (this.options.connector_filter) {
      this.refreshRestrictedConnectors();
    }
    this.space.render();
  };

  WebGLApplication.prototype.changeSkeletonColors = function(skeleton_ids, colors) {
    var skeletons = this.space.content.skeletons;

    skeleton_ids.forEach(function(skeleton_id, index) {
      if (!skeletons.hasOwnProperty(skeleton_id)) {
        console.log("Skeleton "+skeleton_id+" does not exist.");
      }
      if (undefined === colors) {
        var colorizer = CATMAID.makeSkeletonColorizer(this.options);
        skeletons[skeleton_id].updateSkeletonColor(colorizer);
      } else {
        skeletons[skeleton_id].changeColor(colors[index], this.options);
      }
    }, this);

    this.space.render();
    return true;
  };

  WebGLApplication.prototype.showActiveNode = function() {
    this.space.content.active_node.setVisible(true);
  };

  /**
   * Display meshes in the passed-in object. Mesh IDs should be mapped to an
   * array following this format: [[points], [[faces]].
   *
   * @returns an object with a reference to the displayed meshes along with
   * "remove" function, which removes the displayed mesh when called.
   */
  WebGLApplication.prototype.showTriangleMeshes = function(meshes, color, opacity) {
    var addedObjects = [];
    var self = this;

    var renderedMeshes = Object.keys(meshes).filter(function(name) {
      var mesh = meshes[name];
      var points = mesh[0];
      var hull = mesh[1];
      if (!points || 0 === points.length || !hull || 0 === hull.length) {
        return false;
      }
      // Make the mesh with the faces specified in the hull array
      var geom = new THREE.Geometry();
      points.forEach(function(p) {
        this.vertices.push(new THREE.Vector3(p[0], p[1], p[2]));
      }, geom);
      hull.forEach(function(indices) {
        this.faces.push(new THREE.Face3(indices[0], indices[1], indices[2]));
      }, geom);
      geom.computeFaceNormals();

      // Create mesh based on volume color and opacity selected in 3D viewer.
      // Ignore the face setting for now to always show faces.
      opacity = opacity || self.options.meshes_opacity;
      var mesh = new THREE.Mesh(
          geom,
          new THREE.MeshLambertMaterial(
             {
              color: color || self.options.meshes_color,
              opacity: opacity,
              transparent: opacity !== 1.0,
              wireframe: false,
              depthWrite: opacity === 1.0,
              side: THREE.DoubleSide}));

      var wfh = new THREE.WireframeHelper(mesh, 0x000000);
      wfh.material.linewidth = 2;
      self.space.add(mesh);
      self.space.add(wfh);
      this.push(mesh);
      this.push(wfh);
      return true;
    }, addedObjects);

    if (0 < renderedMeshes.length) {
      this.space.render();
    }

    return {
      setColor: function(color, opacity) {
        // Only update the color of the mesh, ignore wireframe
        if (addedObjects.length > 0) {
          var o = addedObjects[0];
          o.material.color.set(color);
          if (o.material.opacity !== opacity) {
            o.material.opacity = opacity;
            o.material.transparent = opacity !== 1.0;
            o.material.depthWrite = opacity === 1.0;
            o.material.needsUpdate = true;
          }
          self.space.render();
        }
      },
      remove: function() {
        if (!self || !self.space) {
          // No need to remove anything if 3D viewer or its space are gone
          return;
        }
        addedObjects.forEach(function(o) {
            this.remove(o);
        }, self.space);
        self.space.render();
      }
    };
  };

  /**
   * Show or hide a stored volume with a given Id.
   *
   * @param {number} volumeId The volume to show or hide.
   * @param {bool}   visibke  Whether or not the volume should be visible
   * @param {string} color    Color of the referenced volume
   * @param {number} opacity  Opacity of the referenced volume in [0,1]
   * @param {bool}   faces    Whether to show faces or a wireframe
   * @param {number} subdivisions (optional) Number of smoothing subdivisions
   * @param {bool}   bb       (optional) Whether to show the bounding box of the volume
   */
  WebGLApplication.prototype.showVolume = function(volumeId, visible, color,
      opacity, faces, subdivisions, bb) {
    var existingVolume = this.loadedVolumes.get(volumeId);
    if (visible) {
      // Bail out if the volume in question is already visible
      if (existingVolume) {
        CATMAID.warn("Volume \"" + volumeId + "\" is already visible.");
        return Promise.resolve();
      }

      return CATMAID.Volumes.get(project.id, volumeId)
        .then((function(volume) {
          // Convert X3D mesh to simple VRML and have Three.js load it
          var vrml = CATMAID.Volumes.x3dToVrml(volume.mesh);
          var loader = new THREE.VRMLLoader();
          var scene = loader.parse(vrml);
          if (scene.children) {
            var material = this.options.createMeshMaterial(color, opacity);
            material.wireframe = !faces;

            var addedMeshes = scene.children.map(function(mesh) {
              mesh.material = material;
              this.space.scene.project.add(mesh);
              return mesh;
            }, this);
            var originalGeometries = addedMeshes.map(function(mesh) {
              return mesh.geometry;
            });
            // Store mesh reference
            this.loadedVolumes.set(volumeId, {
              meshes: addedMeshes,
              originalGeometries: originalGeometries,
              color: color,
              opacity: opacity,
              faces: faces,
              subdivisions: subdivisions,
              boundingBox: !!bb
            });
            this.space.render();
          } else {
            CATMAID.warn("Couldn't parse volume \"" + volumeId + "\"");
          }
        }).bind(this))
        .then((function() {
          // Set subdivisions
          this.setVolumeSubdivisions(volumeId, subdivisions);
        }).bind(this));
    } else if (existingVolume) {
      // Remove volume
      existingVolume.meshes.forEach(function(v) {
        this.space.scene.project.remove(v);
      }, this);
      this.loadedVolumes.delete(volumeId);
      this.space.render();
    }
    return Promise.resolve();
  };

  /**
   * Return IDs of the currently loaded volumes.
   */
  WebGLApplication.prototype.getLoadedVolumeIds = function() {
    return this.loadedVolumes ? this.loadedVolumes.keys() : [];
  };

  /**
   * Set color and alpha of a loaded volume. Color and alpha will only be
   * adjusted if the respective value is not null. Otherwise it is ignored.
   *
   * @param {Number} volumeId The ID of the volume to adjust.
   * @param {String} color    The new color as hex string of the volume or null.
   * @param {Number} alpha    The new alpha of the volume or null.
   */
  WebGLApplication.prototype.setVolumeColor = function(volumeId, color, alpha) {
    var volume = this.loadedVolumes.get(volumeId);
    if (!volume) {
      CATMAID.warn("Volume not loaded");
      return;
    }
    var existingMeshes = volume.meshes;
    for (var i=0; i<existingMeshes.length; ++i) {
      var material = existingMeshes[i].material;
      if (color !== null) {
        material.color.set(color);
        material.needsUpdate = true;
      }
      if (alpha !== null) {
        material.opacity = alpha;
        material.transparent = alpha !== 1;
        material.depthWrite = alpha === 1;
        material.needsUpdate = true;
      }
    }
    this.space.render();
  };

  /**
   * Set volume render style properties.
   *
   * @param {Boolean} faces    Whether mesh faces should be rendered.
   */
  WebGLApplication.prototype.setVolumeStyle = function(volumeId, faces) {
    var volume = this.loadedVolumes.get(volumeId);
    if (!volume) {
      CATMAID.warn("Volume not loaded");
      return;
    }
    var existingMeshes = volume.meshes;
    volume.faces = faces;
    for (var i=0; i<existingMeshes.length; ++i) {
      var material = existingMeshes[i].material;
      material.wireframe = !faces;
      material.needsUpdate = true;
    }
    this.space.render();
  };

  /**
   * Set visibility of the volume's bounding box.
   *
   * @param {Boolean} visible Whether to to display the volume's bounding box.
   */
  WebGLApplication.prototype.setVolumeBoundingBox = function(volumeId, visible) {
    var volume = this.loadedVolumes.get(volumeId);
    if (!volume) {
      CATMAID.warn("Volume not loaded");
      return;
    }

    if (visible === volume.boundingBox) {
      return;
    }

    volume.boundingBox = visible;

    if (volume.boundingBoxMeshes && volume.boundingBoxMeshes.length > 0) {
      this.space.scene.project.remove.apply(this.space.scene, volume.boundingBoxMeshes);
    }

    if (visible) {
      var color = this.options.meshes_boundingbox_color;
      if (!volume.boundingBoxMeshes) {
        volume.boundingBoxMeshes = [];
      }
      for (var i=0; i<volume.meshes.length; ++i) {
        var box = new THREE.BoxHelper(volume.meshes[i], color);
        volume.boundingBoxMeshes.push(box);
        this.space.scene.project.add(box);
      }
    }

    this.space.render();
  };

  /**
   * Set volume mesh subdivision number.
   *
   * @param {Number} subdivisions Number of mesh subdivisions.
   */
  WebGLApplication.prototype.setVolumeSubdivisions = function(volumeId, subdivisions) {
    var volume = this.loadedVolumes.get(volumeId);
    if (!volume) {
      CATMAID.warn("Volume not loaded");
      return;
    }

    if (subdivisions) {
      volume.meshes.forEach(function(mesh, i) {
        // Remove old representation
        this.space.scene.project.remove(mesh);
        // Reset to original geometry
        var originalGeometry = volume.originalGeometries[i];

        // Get regular geometry copy
        var smoothedGeometry;
        if (originalGeometry.isBufferGeometry) {
          smoothedGeometry = new THREE.Geometry().fromBufferGeometry(originalGeometry);
        } else {
          smoothedGeometry = originalGeometry.clone();
        }

        // Operate on a regular geometry
        smoothedGeometry.mergeVertices();
        var modifier = new THREE.SubdivisionModifier(subdivisions);
        modifier.modify(smoothedGeometry);

        // Store as buffer geometry
        smoothedGeometry.computeVertexNormals();
        smoothedGeometry.computeFaceNormals();
        mesh.geometry = new THREE.BufferGeometry().fromGeometry(smoothedGeometry);

        // Add new representation
        this.space.scene.project.add(mesh);
      }, this);
    } else {
      volume.meshes.forEach(function(mesh, i) {
        // Remove old representation
        this.space.scene.project.remove(mesh);
        // Reset to original geometry
        mesh.geometry = volume.originalGeometries[i];
        // Add new representation
        this.space.scene.project.add(mesh);
      }, this);
    }

    this.space.render();
  };

  /**
   * Show or hide a stored landmark transformations.
   */
  WebGLApplication.prototype.showLandmarkTransform = function(landmarkTransform, visible) {
    let landmarkTransformId = landmarkTransform.id;
    var existingLandmarkTransform = this.loadedLandmarkTransforms[landmarkTransformId];
    if (visible) {
      // Bail out if the landmarkTransform in question is already visible
      if (existingLandmarkTransform) {
        return;
      }

      // Mark this transformation as added by initializing its cache entry.
      // Meshes get asynchronously, so this can also prevent a race condition
      // when two showLandmarkTransform() calls with the same transformation are
      // performed after another before the promises resolve. A second set of
      // meshes would be added when not initializing the entry synchronously.
      this.loadedLandmarkTransforms[landmarkTransformId] = [];

      let options = this.options.clone();
      options['shading_method'] = 'none';
      options['color_method'] = 'actor-color';
      for (let i=0, imax=landmarkTransform.skeletons.length; i<imax; ++i) {
        let skeletonModel = landmarkTransform.skeletons[i];
        // Create transformed skeleton mesh and add it to scene
        let initPromise = landmarkTransform.nodeProvider.get(skeletonModel.id)
          .then((function(json) {
            let transform = this.loadedLandmarkTransforms[landmarkTransformId];

            // Create virtual skeleton
            let skeleton = new WebGLApplication.prototype.Space.prototype.Skeleton(
                this.space, skeletonModel);
            skeleton.loadJson(skeletonModel, json, options, false, undefined, false);

            // Use colorizer with simple source shading (see above)
            var colorizer = CATMAID.makeSkeletonColorizer(options);
            skeleton.updateSkeletonColor(colorizer);

            // Instead of displaying the skeleton using show(), we extract its
            // mesh and add it ourselves.
            let radiusVolumes = Object.values(skeleton.radiusVolumes);
            let tagSpheres = skeleton.specialTagSphereCollection ? [skeleton.specialTagSphereCollection] : [];
            let data = {
              meshes: [skeleton.actor.neurite].concat(radiusVolumes).concat(tagSpheres),
              skeleton: skeleton,
            };
            transform.push(data);

            for (let j=0, jmax=data.meshes.length; j<jmax; ++j) {
              this.space.scene.project.add(data.meshes[j]);
            }

            this.space.render();
          }).bind(this))
          .catch(error => {
            delete this.loadedLandmarkTransforms[landmarkTransformId];
            CATMAID.handleError(error);
          });
      }
    } else if (existingLandmarkTransform) {
      // Remove landmarkTransform
      existingLandmarkTransform.forEach(entry => {
        this.space.scene.project.remove(...entry.meshes);
      });
      delete this.loadedLandmarkTransforms[landmarkTransformId];
      this.space.render();
    }
  };

  WebGLApplication.prototype.setLandmarkTransformStyle = function(landmarkTransform) {
    let landmarkTransformId = landmarkTransform.id;
    var transform = this.loadedLandmarkTransforms[landmarkTransformId];
    if (!transform) {
      return;
    }

    // Use colorizer with simple source shading (see above)
    let options = this.options.clone();
    options['shading_method'] = 'none';
    options['color_method'] = 'actor-color';
    var colorizer = CATMAID.makeSkeletonColorizer(options);

    for (let i=0; i<transform.length; ++i) {
      // Update actor color
      let data = transform[i];
      data.skeleton.actorColor.copy(data.skeleton.skeletonmodel.color);
      data.skeleton.updateSkeletonColor(colorizer);
    }

    this.space.render();
  };

  /**
   * Show or hide a stored landmark group with a given Id.
   */
  WebGLApplication.prototype.showLandmarkGroup = function(landmarkGroupId, visible) {
    var existingLandmarkGroup = this.loadedLandmarkGroups[landmarkGroupId];
    if (visible) {
      // Bail out if the landmarkGroup in question is already visible
      if (existingLandmarkGroup) {
        CATMAID.warn("Landmark group \"" + landmarkGroupId + "\" is already visible.");
        return;
      }

      CATMAID.Landmarks.getGroup(project.id, landmarkGroupId, true, true, true)
        .then((function(landmarkGroup) {
          let bb = CATMAID.Landmarks.getBoundingBox(landmarkGroup);
          let min = bb.min;
          let max = bb.max;
          let meshes = [];

          // Create box mesh
          let groupMaterial = this.options.createLandmarkGroupMaterial();
          let groupGeometry = new THREE.BoxBufferGeometry(
              max.x - min.x,
              max.y - min.y,
              max.z - min.z);
          groupGeometry.translate(
              min.x + (max.x - min.x) * 0.5,
              min.y + (max.y - min.y) * 0.5,
              min.z + (max.z - min.z) * 0.5);
          let bbMesh = new THREE.Mesh(groupGeometry, groupMaterial);
          meshes.boundingBoxMeshes = [bbMesh];
          meshes.push(bbMesh);

          // Create landmark particles, optionally with text tag
          let locations = landmarkGroup.locations;
          let landmarkMaterial = this.options.createLandmarkMaterial();
          for (var j=0, jmax=locations.length; j<jmax; ++j) {
            let loc = locations[j];
            let particle = new THREE.Sprite(landmarkMaterial);
            particle.position.set(loc.x, loc.y, loc.z);
            particle.scale.x = particle.scale.y = this.options.landmark_scale;
            meshes.push(particle);
          }

          if (this.options.landmarkgroup_text) {
            // If landmark names should be shown, queue their rendering after
            // making sure we have a font.
            let textScaling = this.options.text_scaling;
            return this.options.ensureFont(this.options)
              .then(function(font) {
                let labelOptions ={
                  size: 100,
                  height: 40,
                  curveSegments: 1,
                  font: font
                };
                let textMaterial = new THREE.MeshNormalMaterial();
                for (var j=0, jmax=locations.length; j<jmax; ++j) {
                  let loc = locations[j];
                  let landmarkName = loc.names.join(', ');
                  let geometry = new THREE.TextGeometry(landmarkName, labelOptions);
                  geometry.computeBoundingBox();
                  var text = new THREE.Mesh(geometry, textMaterial);
                  text.position.set(loc.x, loc.y, loc.z);
                  // We need to flip up, because our cameras' up direction is -Y.
                  text.scale.set(textScaling, -textScaling, textScaling);
                  meshes.push(text);
                }
                return meshes;
              });
          }
          return meshes;
        }).bind(this))
        .then((function(meshes) {
          for (let j=0, jmax=meshes.length; j<jmax; ++j) {
            this.space.scene.project.add(meshes[j]);
          }

          // Store mesh reference
          this.loadedLandmarkGroups[landmarkGroupId] = meshes;
          this.space.render();
        }).bind(this))
        .catch(CATMAID.handleError);
    } else if (existingLandmarkGroup) {
      // Remove landmarkGroup
      existingLandmarkGroup.forEach(function(v) {
        this.space.scene.project.remove(v);
      }, this);
      delete this.loadedLandmarkGroups[landmarkGroupId];
      this.space.render();
    }
  };

  /**
   * Return IDs of the currently loaded landmark groups.
   */
  WebGLApplication.prototype.getLoadedLandmarkGroupIds = function() {
    return Object.keys(this.loadedLandmarkGroups);
  };

  /**
   * Set color and alpha of a loaded landmark group. Color and alpha will only
   * be adjusted if the respective value is not null. Otherwise it is ignored.
   *
   * @param {Number} volumeId The ID of the landmark group to adjust.
   * @param {String} color    The new color as hex string of the group or null.
   * @param {Number} alpha    The new alpha of the landmark group or null.
   */
  WebGLApplication.prototype.setLandmarkGroupColor = function(landmarkGroupId, color, alpha) {
    var existingMeshes = this.loadedLandmarkGroups[landmarkGroupId];
    if (!existingMeshes) {
      CATMAID.warn("Landmark group not loaded");
      return;
    }
    for (var i=0; i<existingMeshes.length; ++i) {
      var material = existingMeshes[i].material;

      // Text materials don't have colors at the moment.
      if (material.color !== undefined && color !== null) {
        material.color.set(color);
        material.needsUpdate = true;
      }
      if (alpha !== null) {
        material.opacity = alpha;
        material.transparent = alpha !== 1;
        material.depthWrite = alpha === 1;
        material.needsUpdate = true;
      }
    }
    this.space.render();
  };

  /**
   * Set landmark group render style properties.
   *
   * @param {Boolean} faces    Whether mesh faces should be rendered.
   */
  WebGLApplication.prototype.setLandmarkGroupStyle = function(landmarkGroupsId, property, value) {
    value = !!value;
    var existingMeshes = this.loadedLandmarkGroups[landmarkGroupsId];
    if (!existingMeshes) {
      CATMAID.warn("Landmark group not loaded");
      return;
    }
    if (property === 'faces') {
      for (var i=0; i<existingMeshes.length; ++i) {
        let mesh = existingMeshes[i];
        // Apply faces/wireframe change only to landmark bounding box
        if (mesh.geometry && mesh.geometry.type === 'BoxBufferGeometry') {
          var material = mesh.material;
          material.wireframe = !value;
          material.needsUpdate = true;
        }
      }
    } else if (property === 'text') {
      for (var i=0; i<existingMeshes.length; ++i) {
        let mesh = existingMeshes[i];
        // Apply faces/wireframe change only to landmark bounding box
        if (mesh.geometry && mesh.geometry.type === 'TextGeometry') {
          mesh.visible = value;
        }
      }
    }
    this.space.render();
  };

  /**
   * Set visibility of the landmark group's bounding box.
   *
   * @param {Boolean} visible Whether to to display the bounding box.
   */
  WebGLApplication.prototype.setLandmarkGroupBoundingBox = function(landmarkGroupId, visible) {
    var landmarkGroup = this.loadedLandmarkGroups[landmarkGroupId];
    if (!landmarkGroup) {
      CATMAID.warn("Landmark group not loaded");
      return;
    }

    if (visible === landmarkGroup.boundingBox) {
      return;
    }

    landmarkGroup.boundingBox = visible;

    if (landmarkGroup.boundingBoxMeshes && landmarkGroup.boundingBoxMeshes.length > 0) {
      this.space.scene.project.remove.apply(this.space.scene.project, landmarkGroup.boundingBoxMeshes);
    }

    if (visible) {
      var color = this.options.meshes_boundingbox_color;
      if (!landmarkGroup.boundingBoxMeshes) {
        landmarkGroup.boundingBoxMeshes = [];
      }
      for (var i=0; i<landmarkGroup.boundingBoxMeshes.length; ++i) {
        let box = landmarkGroup.boundingBoxMeshes[i];
        this.space.scene.project.add(box);
      }
    }

    this.space.render();
  };

  /**
   * Show or hide a stored point cloud with a given ID.
   */
  WebGLApplication.prototype.showPointCloud = function(pointCloudId, visible, color) {
    var existingPointCloud = this.loadedPointClouds[pointCloudId];
    if (visible) {
      // Bail out if the landmarkGroup in question is already visible
      if (existingPointCloud) {
        CATMAID.warn("Point cloud \"" + pointCloudId + "\" is already visible.");
        return;
      }

      CATMAID.Pointcloud.get(project.id, pointCloudId, true, false, this.options.pointcloud_sample)
        .then((function(pointCloud) {
          let bb = CATMAID.Pointcloud.getBoundingBox(pointCloud);
          let min = bb.min;
          let max = bb.max;
          let meshes = [];

          // Create box mesh
          let boxMaterial = this.options.createPointCloudBoxMaterial();
          boxMaterial.visible = this.options.pointcloud_faces;
          let boxGeometry = new THREE.BoxBufferGeometry(
              max.x - min.x,
              max.y - min.y,
              max.z - min.z);
          boxGeometry.translate(
              min.x + (max.x - min.x) * 0.5,
              min.y + (max.y - min.y) * 0.5,
              min.z + (max.z - min.z) * 0.5);
          meshes.push(new THREE.Mesh(boxGeometry, boxMaterial));

          // Create point cloud particles
          let locations = pointCloud.points;
          let pointCloudMaterial = this.options.createPointCloudMaterial(color);
          for (var j=0, jmax=locations.length; j<jmax; ++j) {
            let loc = locations[j];
            let particle = new THREE.Sprite(pointCloudMaterial);
            particle.position.set(loc[1], loc[2], loc[3]);
            particle.scale.x = particle.scale.y = this.options.pointcloud_scale;
            meshes.push(particle);
          }
          return meshes;
        }).bind(this))
        .then((function(meshes) {
          for (let j=0, jmax=meshes.length; j<jmax; ++j) {
            this.space.scene.project.add(meshes[j]);
          }

          // Store mesh reference
          this.loadedPointClouds[pointCloudId] = meshes;
          this.space.render();
        }).bind(this))
        .catch(CATMAID.handleError);
    } else if (existingPointCloud) {
      // Remove landmarkGroup
      existingPointCloud.forEach(function(v) {
        this.space.scene.project.remove(v);
      }, this);
      delete this.loadedPointClouds[pointCloudId];
      this.space.render();
    }
  };

  /**
   * Return IDs of the currently loaded point clouds.
   */
  WebGLApplication.prototype.getLoadedPointCloudIds = function() {
    return Object.keys(this.loadedPointClouds).map(p => parseInt(p, 10));
  };

  /**
   * Set color and alpha of a loaded point cloud. Color and alpha will only
   * be adjusted if the respective value is not null. Otherwise it is ignored.
   *
   * @param {Number} volumeId The ID of the point cloud to adjust.
   * @param {String} color    The new color as hex string or null.
   * @param {Number} alpha    The new alpha or null.
   */
  WebGLApplication.prototype.setPointCloudColor = function(pointCloudId, color, alpha) {
    var existingMeshes = this.loadedPointClouds[pointCloudId];
    if (!existingMeshes) {
      CATMAID.warn("Point cloud not loaded");
      return;
    }
    for (var i=0; i<existingMeshes.length; ++i) {
      var material = existingMeshes[i].material;
      if (color !== null) {
        material.color.set(color);
        material.needsUpdate = true;
      }
      if (alpha !== null) {
        material.opacity = alpha;
        material.transparent = alpha !== 1;
        material.depthWrite = alpha === 1;
        material.needsUpdate = true;
      }
    }
    this.space.render();
  };

  /**
   * Set point cloud render style properties.
   *
   * @param {Boolean} faces    Whether mesh faces should be rendered.
   */
  WebGLApplication.prototype.setPointCloudStyle = function(pointCloudId, property, value) {
    value = !!value;
    var existingMeshes = this.loadedPointClouds[pointCloudId];
    if (!existingMeshes) {
      CATMAID.warn("Point cloud not loaded");
      return;
    }
    if (property === 'faces') {
      for (var i=0; i<existingMeshes.length; ++i) {
        let mesh = existingMeshes[i];
        // Apply faces/wireframe change only to landmark bounding box
        if (mesh.geometry && mesh.geometry.type === 'BoxBufferGeometry') {
          var material = mesh.material;
          material.visible = !!value;
          material.wireframe = !value;
          material.needsUpdate = true;
        }
      }
    } else if (property === 'text') {
      for (var i=0; i<existingMeshes.length; ++i) {
        let mesh = existingMeshes[i];
        // Apply faces/wireframe change only to landmark bounding box
        if (mesh.geometry && mesh.geometry.type === 'TextGeometry') {
          mesh.visible = value;
        }
      }
    }
    this.space.render();
  };

  /**
   * Show or hide a stored point set with a given ID.
   */
  WebGLApplication.prototype.showPointSet = function(pointSetId, visible, color) {
    var existingPointSet = this.loadedPointSets[pointSetId];
    if (visible) {
      // Bail out if the landmarkGroup in question is already visible
      if (existingPointSet) {
        CATMAID.warn("Point set \"" + pointSetId + "\" is already visible.");
        return;
      }

      CATMAID.Pointset.get(project.id, pointSetId, true)
        .then((function(pointSet) {
          // Create point cloud particles
          let locations = pointSet.points;
          let pointSetMaterial = this.options.createPointSetMaterial(color);
          for (var j=0, jmax=locations.length; j<jmax; ++j) {
            let loc = locations[j];
            let particle = new THREE.Sprite(pointSetMaterial);
            particle.position.set(loc[1], loc[2], loc[3]);
            particle.scale.x = particle.scale.y = this.options.pointcloud_scale;
            meshes.push(particle);
          }
          return meshes;
        }).bind(this))
        .then((function(meshes) {
          for (let j=0, jmax=meshes.length; j<jmax; ++j) {
            this.space.scene.project.add(meshes[j]);
          }

          // Store mesh reference
          this.loadedPointSets[pointSetId] = meshes;
          this.space.render();
        }).bind(this))
        .catch(CATMAID.handleError);
    } else if (existingPointSet) {
      // Remove landmarkGroup
      existingPointSet.forEach(function(v) {
        this.space.scene.project.remove(v);
      }, this);
      delete this.loadedPointSets[pointSetId];
      this.space.updateConnectorColors(this.options, updatedSkeletons);
    }
  };

  WebGLApplication.prototype.editConnectorPolyadicityColors = function() {
    let dialog = new CATMAID.OptionsDialog("Edit polyadicity colors", {
      'Close': (e) => {},
    });

    dialog.appendMessage('The list below maps polyadicity values (i.e. number of connected partners per synapse) to colors. This list can be adjusted using the controls below.');

    let select = dialog.appendChoice('Polyadicity', 'polyadicity',
        Object.keys(this.options.polyadicity_colors).map(k => `${k}: ${this.options.polyadicity_colors[k]}`),
        Object.keys(this.options.polyadicity_colors));

    select.classList.add('multiline');
    select.setAttribute('size', '4');

    let removeSelected = document.createElement('button');
    removeSelected.appendChild(document.createTextNode('Remove selected'));
    removeSelected.onclick = (e) => {
      let selected = select.value;
      delete this.options.polyadicity_colors[selected];
      select.remove(select.selectedIndex);
      this.refreshConnnectorColors();
    };
    dialog.appendChild(removeSelected);

    let newIndexField = dialog.appendNumericField('Polyadicity', 'new-polyadicity-value', 0);
    let newColorField = dialog.appendField('Color', 'new-polyadicity-color', '');

    let addNewEntry = document.createElement('button');
    addNewEntry.appendChild(document.createTextNode('Add new entry'));
    addNewEntry.onclick = (e) => {
      let newIndex = parseInt(newIndexField.value, 10);
      let newColor = newColorField.value.trim();
      if (Number.isNaN(newIndex)) {
        CATMAID.warn("Index must be a polyadicity number");
        return;
      }
      if (newColor === 0) {
        CATMAID.warn("Color must be a valid color name, hex string or style");
        return;
      }
      if (this.options.polyadicity_colors[newIndex]) {
        CATMAID.warn("There is already an entry for polyadicity " + newIndex);
        return;
      }
      this.options.polyadicity_colors[newIndex] = newColor;
      let newOpt = document.createElement('option');
      newOpt.value = newIndex;
      newOpt.text = `${newIndex}: ${newColor}`;
      select.add(newOpt);
      this.refreshConnnectorColors();
    };
    dialog.appendChild(addNewEntry);

    dialog.show(500, "auto", true);
  };


  /** Defines the properties of the 3d space and also its static members like the bounding box and the missing sections. */
  WebGLApplication.prototype.Space = function( w, h, container, stack,
      loadedVolumes, options ) {
    this.stack = stack;
    this.loadedVolumes = loadedVolumes;
    this.container = container; // used by MouseControls
    this.options = options;
    // FIXME: If the expected container configuration isn't found, we create a
    // disconnected element to not have the scale bar constructor fail.
    this.scaleBar = new CATMAID.ScaleBar(this.container.children[0] || document.createElement('div'));
    this.scaleBar.setVisibility(
      this.options.show_ortho_scale_bar && this.options.camera_view == 'orthographic');

    // Axes
    this.axesRectWidth = 100;
    this.axesRectHeight = 100;
    this.axesDisplay = this.container.children[1] || document.createElement('div');
    this.setAxesVisibility(this.options.show_axes);

    this.canvasWidth = w;
    this.canvasHeight = h;

    var p = stack.createStackToProjectBox(stack.createStackExtentsBox());
    this.dimensions = {
      min: new THREE.Vector3(p.min.x, p.min.y, p.min.z),
      max: new THREE.Vector3(p.max.x, p.max.y, p.max.z)
    };
    // Absolute center in Space coordinates (not stack coordinates)
    this.center = this.createCenter();

    this.userColormap = {};

    // WebGL space
    this.scene = new THREE.Scene();
    // Group for all CATMAID project content, to allow separate scaling.
    this.scene.project = new THREE.Group();
    this.scene.add(this.scene.project);
    // A render target used for picking objects
    this.pickingTexture = new THREE.WebGLRenderTarget(w, h);
    this.pickingTexture.texture.generateMipmaps = false;

    this.view = new this.View(this);
    this.lights = this.createLights(this.dimensions, this.center, this.view.camera);
    this.lights.forEach(function(l) {
      this.add(l);
    }, this.scene);

    // Content
    this.staticContent = new this.StaticContent(this.dimensions, stack, this.center, options);
    this.scene.project.add(this.staticContent.box);
    this.scene.project.add(this.staticContent.floor);

    this.content = new this.Content(options);
    this.scene.project.add(this.content.active_node.mesh);

    // Axes camera and scene
    this.axesCamera = new THREE.PerspectiveCamera(50, this.axesRectWidth / this.axesRectHeight, 1, 1000);
    this.axesCamera.up = this.view.camera.up;
    let axisHelper = new THREE.AxesHelper(100);
    var colors = axisHelper.geometry.attributes.color;

    colors.setXYZ( 0, 1, 0, 0 ); // index, R, G, B
    colors.setXYZ( 1, 1, 0, 0 ); // red
    colors.setXYZ( 2, 0, 0.7, 0 );
    colors.setXYZ( 3, 0, 0.7, 0 ); // green
    colors.setXYZ( 4, 0, 0, 1 );
    colors.setXYZ( 5, 0, 0, 1 ); // blue

    this.axesScene = new THREE.Scene();
    this.axesScene.add(axisHelper);
  };

  WebGLApplication.prototype.Space.prototype = {};

  /**
   * Activate a separate camera which as a look on this the scene. Additionally,
   * a camera helper is activated for the main camera. This helper visualizes
   * the main camera's view frustum.
   */
  WebGLApplication.prototype.Space.prototype.setDebug = function(debug) {
    var camera;
    if (debug) {
      camera = this.view.debugCamera;
      this.cameraHelper = new THREE.CameraHelper(this.view.mainCamera);
      this.scene.project.add(this.cameraHelper);
    } else {
      camera = this.view.mainCamera;
      if (this.cameraHelper) {
        this.scene.project.remove(this.cameraHelper);
        this.cameraHelper = undefined;
      }
    }
    this.view.camera = camera;
    this.view.controls.object = camera;
  };

  WebGLApplication.prototype.Space.prototype.setSize = function(canvasWidth, canvasHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.view.camera.setSize(canvasWidth, canvasHeight);
    this.view.camera.updateProjectionMatrix();
    this.axesCamera.updateProjectionMatrix();
    this.pickingTexture.setSize(canvasWidth, canvasHeight);
    this.view.renderer.setSize(canvasWidth, canvasHeight);
    this.staticContent.setSize(canvasWidth, canvasHeight);
    if (this.view.controls) {
      this.view.controls.handleResize();
    }
    for (var skeletonId in this.content.skeletons) {
      var skeleton = this.content.skeletons[skeletonId];
      if (skeleton.line_material.resolution) {
        skeleton.line_material.resolution.set(canvasWidth, canvasHeight);
      }
    }
  };

  /**
   * Allow explicit control over the display area that is mapped to the
   * orbit controls.
   */
  WebGLApplication.prototype.Space.prototype.resizeControls = function(left, top, width, height) {
    if (this.view.controls) {
      this.view.controls.screen.left = left;
      this.view.controls.screen.top = top;
      this.view.controls.screen.width = width;
      this.view.controls.screen.height = height;
    }
  };

  WebGLApplication.prototype.Space.prototype.createCenter = function() {
    return this.dimensions.min.clone().lerp(this.dimensions.max, 0.5);
  };

  WebGLApplication.prototype.Space.prototype.updateScaleBar = function () {
    if (this.options.show_ortho_scale_bar && this.options.camera_view == 'orthographic') {
      this.scaleBar.setVisibility(true);
      var camera = this.view.camera;
      this.scaleBar.update(
        this.canvasWidth / (camera.cameraO.right - camera.cameraO.left),
        this.canvasWidth / 5);
    } else {
      this.scaleBar.setVisibility(false);
    }
  };

  WebGLApplication.prototype.Space.prototype.createLights = function(dimensions, center, camera) {
    var ambientLight = new THREE.AmbientLight(0x505050);
    var height = dimensions.max.y - dimensions.min.y;
    var hemiLight = new THREE.HemisphereLight( 0xffffff, 0x000000, 1 );
    hemiLight.position.set( center.x, - center.y - height, center.z);
    return [ambientLight, hemiLight];
  };

  WebGLApplication.prototype.Space.prototype.add = function(mesh) {
    this.scene.project.add(mesh);
  };

  WebGLApplication.prototype.Space.prototype.remove = function(mesh) {
    this.scene.project.remove(mesh);
  };

  WebGLApplication.prototype.Space.prototype.removeAll = function(objects) {
    this.scene.project.remove.apply(this.scene.project, objects);
  };

  WebGLApplication.prototype.Space.prototype.render = function() {
    if (this.view) {
      var beforeRender = this.staticContent.beforeRender.bind(
          this.staticContent);
      this.view.render(beforeRender);
    }
  };

  WebGLApplication.prototype.Space.prototype.destroy = function() {
    // remove active_node and project-wise meshes
    this.scene.project.remove(this.content.active_node.mesh);

    // dispose active_node and meshes
    this.content.dispose();

    // dispose and remove skeletons
    this.removeSkeletons(Object.keys(this.content.skeletons));

    this.lights.forEach(function(l) { this.remove(l); }, this.scene);

    // dispose meshes and materials
    this.staticContent.dispose();

    // remove meshes
    if (this.staticContent.box) this.scene.project.remove(this.staticContent.box);
    this.scene.project.remove(this.staticContent.floor);
    if (this.staticContent.zplane) this.scene.project.remove(this.staticContent.zplane);
    this.staticContent.missing_sections.forEach(function(m) { this.remove(m); }, this.scene);

    this.view.destroy();

    Object.keys(this).forEach(function(key) { delete this[key]; }, this);
  };

  WebGLApplication.prototype.Space.prototype.removeSkeletons = function(skeleton_ids) {
    // First remove all objects from the Three.js scene

    // Destroy all CATMAID parts of these objects
    var collection = [];
    skeleton_ids.forEach(function(skeleton_id) {
      this.removeSkeleton(skeleton_id, collection);
    }, this);
    this.removeAll(collection);
  };

  WebGLApplication.prototype.Space.prototype.removeSkeleton = function(skeleton_id, collection) {
    if (skeleton_id in this.content.skeletons) {
      this.content.skeletons[skeleton_id].destroy(collection);
      delete this.content.skeletons[skeleton_id];
    }
  };

  WebGLApplication.prototype.Space.prototype.updateSplitShading = function(old_skeleton_id, new_skeleton_id, options) {
    if ('active_node_split' === options.shading_method ||
        'near_active_node' === options.shading_method ||
        'near_active_node_z_project' === options.shading_method ||
        'near_active_node_z_camera' === options.shading_method) {
      if (old_skeleton_id !== new_skeleton_id) {
        if (old_skeleton_id && old_skeleton_id in this.content.skeletons) {
          var colorizer = CATMAID.makeSkeletonColorizer(options);
          this.content.skeletons[old_skeleton_id].updateSkeletonColor(colorizer);
        }
      }
      if (new_skeleton_id && new_skeleton_id in this.content.skeletons) {
        var colorizer = CATMAID.makeSkeletonColorizer(options);
        this.content.skeletons[new_skeleton_id].updateSkeletonColor(colorizer);
      }
    }
  };

  /**
   * Return an object containing visibility information on all loaded skeleton.
   */
  WebGLApplication.prototype.Space.prototype.getVisibilityMap = function()
  {
    var visibilityMap = {};
    for (var skid in this.content.skeletons) {
      var s = this.content.skeletons[skid];
      visibilityMap[skid] = {
        actor: s.visible,
        pre: s.skeletonmodel.pre_visible,
        post: s.skeletonmodel.post_visible,
        text: s.skeletonmodel.text_visible,
        meta: s.skeletonmodel.meta_visible
      };
    }

    return visibilityMap;
  };

  /**
   * Updates the visibility of all skeletons. If a skeleton ID is given as a
   * second argument, only this skeleton will be set visible (if it was visible
   * before), otherwise all skeletons are set to the state in the given map.
   */
  WebGLApplication.prototype.Space.prototype.setSkeletonVisibility = function(
      visMap, visibleSkids)
  {
    for (var skid in this.content.skeletons) {
      var s = this.content.skeletons[skid];
      var visible = visibleSkids ? (-1 !== visibleSkids.indexOf(skid)) : true;
      s.setActorVisibility(visMap[skid].actor ? visible : false);
      s.setPreVisibility(visMap[skid].pre ? visible : false);
      s.setPostVisibility(visMap[skid].post ? visible : false);
      s.setTextVisibility(visMap[skid].text ? visible : false);
      s.setMetaVisibility(visMap[skid].meta ? visible : false);
    }
  };

  WebGLApplication.prototype.Space.prototype.setAxesVisibility = function(visible) {
    this.axesDisplay.style.display = visible ? 'display' : 'none';
  };

  WebGLApplication.prototype.Space.prototype.TextGeometryCache = function(options) {
    this.geometryCache = {};

    // Load font asynchronously, text creation will wait
    var font;
    var prepare = options.ensureFont(options)
      .then(function(loadedFont) {
        font = loadedFont;
      });

    this.getTagGeometry = function(tagString, font) {
      if (tagString in this.geometryCache) {
        var e = this.geometryCache[tagString];
        e.refs += 1;
        return e.geometry;
      }
      // Else create, store, and return a new one:
      var text3d = new THREE.TextGeometry( tagString, {
        size: 100,
        height: 20,
        curveSegments: 1,
        font: font
      });
      text3d.computeBoundingBox();
      text3d.tagString = tagString;
      this.geometryCache[tagString] = {geometry: text3d, refs: 1};
      return text3d;
    };

    this.releaseTagGeometry = function(tagString) {
      if (tagString in this.geometryCache) {
        var e = this.geometryCache[tagString];
        e.refs -= 1;
        if (0 === e.refs) {
          delete this.geometryCache[tagString].geometry;
          delete this.geometryCache[tagString];
        }
      }
    };

    let textScaling = options.text_scaling;
    this._createMesh = function(tagString, material, font) {
      var geometry = this.getTagGeometry(tagString, font);
      var text = new THREE.Mesh(geometry, material);
      // We need to flip up, because our cameras' up direction is -Y.
      text.scale.set(textScaling, -textScaling, textScaling);
      text.visible = true;
      return text;
    };

    /**
     * Create text mesh and load font if it isn't already available yet.
     */
    this.createTextMesh = function(tagString, material, onSuccess) {
      // If font isn't loaded yet, load it and try again in 100ms.
      if (font) {
        var mesh = this._createMesh(tagString, material, font);
        onSuccess(mesh);
      } else {
        prepare.then(function() {
          if (font) {
            var mesh = this._createMesh(tagString, material, font);
            onSuccess(mesh);
          } else {
            throw new CATMAID.Error("3D viewer font couldn't be loaded");
          }
        });
      }
    };

    this.destroy = function() {
      Object.keys(this.geometryCache).forEach(function(entry) {
        this[entry].geometry.dispose();
      }, this.geometryCache);
      delete this.geometryCache;
    };
  };

  WebGLApplication.prototype.Space.prototype.StaticContent = function(dimensions, stack, center, options) {
    // Space elements
    this.box = this.createBoundingBox(project.focusedStackViewer.primaryStack);
    this.floor = this.createFloor(center, dimensions, {
      color: options.floor_color
    });

    this.zplane = null;
    this.zplaneLayerMeshes = null;
    this.zplaneScene = new THREE.Scene();
    this.lastZPlaneOptions = null;

    this.missing_sections = [];

    // Shared across skeletons
    this.labelspheregeometry = new THREE.OctahedronGeometry(32, 3);
    this.radiusSphere = new THREE.OctahedronGeometry(10, 3);
    this.icoSphere = new THREE.IcosahedronGeometry(1, 2);
    this.cylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
    this.textMaterial = new THREE.MeshNormalMaterial();

    // Make sure normals are computed on tempalte geometry
    this.labelspheregeometry.computeFaceNormals();
    this.labelspheregeometry.computeVertexNormals();

    // Mesh materials for spheres on nodes tagged with 'uncertain end', 'undertain continuation' or 'TODO'
    this.updateDynamicMaterials(options, false);
    this.textGeometryCache = new WebGLApplication.prototype.Space.prototype.TextGeometryCache(options);
    this.connectorLineColors = {'presynaptic_to': new THREE.LineBasicMaterial({color: 0xff0000, opacity: 1.0, linewidth: 6}),
                                'postsynaptic_to': new THREE.LineBasicMaterial({color: 0x00f6ff, opacity: 1.0, linewidth: 6}),
                                'gapjunction_with': new THREE.LineBasicMaterial({color: 0x9f25c2, opacity: 1.0, linewidth: 6})};
  };

  WebGLApplication.prototype.Space.prototype.StaticContent.prototype = {};

  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.dispose = function() {
    // dispose ornaments
    if (this.box) {
      this.box.geometry.dispose();
      this.box.material.dispose();
    }
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.missing_sections.forEach(function(s) {
      s.geometry.dispose();
      s.material.dispose(); // it is ok to call more than once
    });
    this.disposeZplane();

    // dispose shared geometries
    [this.labelspheregeometry, this.radiusSphere, this.icoSphere, this.cylinder].forEach(function(g) {
      g.dispose();
    });
    this.textGeometryCache.destroy();

    // dispose shared materials
    this.textMaterial.dispose();
    Object.keys(this.labelColors).forEach(function (labelType) {
      this.labelColors[labelType].dispose();
    }, this);
    this.synapticColors[0].dispose();
    this.synapticColors[1].dispose();
    this.synapticColors[2].dispose();
    this.synapticColors.default.dispose();
  };

  /**
   * Dispose a material instance and a bound texture if it has one.
   */
  var disposeMaterial = function(m) {
    if (m.map) {
      m.map.dispose();
    }
    m.dispose();
  };

  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.disposeZplane = function(space) {
    if (this.zplane) {
      this.zplane.geometry.dispose();
      this.zplane.material.dispose();

      if (space) {
        space.scene.project.remove(this.zplane);
      }
    }
    if (this.zplaneLayerMeshes) {
      for (var i=0; i<this.zplaneLayerMeshes.length; ++i) {
        this.zplaneLayerMeshes[i].geometry.dispose();
        // Dispose individual zplane tiles in texture mode.
        this.zplaneLayerMeshes[i].material.forEach(disposeMaterial);
      }

      if (this.zplaneScene) {
        this.zplaneScene.remove.apply(this.zplaneScene, this.zplaneLayerMeshes);
      }
    }

    if (this.zplaneRenderTarget) {
      this.zplaneRenderTarget.dispose();
    }

    this.zplane = null;
    this.zplaneLayerMeshes = null;
    this.zplaneLayers = null;
    this.zplaneRenderTarget = null;
  };


  /**
   * Update shared materials that can be updated during run-time.
   */
  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.updateDynamicMaterials = function(options, copyProperties) {
    // Material constructor depends on current options
    var Material = CATMAID.getSkeletonMaterialType(options['neuron_material']);

    function makeMaterial(defaultOptions, sourceObj, sourceField) {
      var properties;
      if (copyProperties && sourceObj) {
        var sourceMaterial = sourceObj[sourceField];
        properties = {
          color: sourceMaterial.color,
          opacity: sourceMaterial.opacity,
          transparent: sourceMaterial.transparent,
          depthWrite: sourceMaterial.depthWrite,
          side: sourceMaterial.side,
        };
      } else {
        properties = defaultOptions;
      }

      return new Material(properties);
    }

    this.labelColors = {uncertain: makeMaterial({color: 0xff8000, opacity:0.6, transparent: true}, this.labelColors, 'uncertain'),
                        todo:      makeMaterial({color: 0xff0000, opacity:0.6, transparent: true}, this.labelColors, 'todo'),
                        custom:    makeMaterial({color: options.custom_tag_spheres_color, opacity: options.custom_tag_spheres_opacity,
                                                 transparent: true}, this.labelColors, 'custom')};
    this.synapticColors = [makeMaterial({color: 0xff0000, opacity:1.0, transparent:false, depthWrite: true, side: THREE.DoubleSide}, this.synapticColors, 0),
                           makeMaterial({color: 0x00f6ff, opacity:1.0, transparent:false, depthWrite: true, side: THREE.DoubleSide}, this.synapticColors, 1),
                           makeMaterial({color: 0x9f25c2, opacity:1.0, transparent:false, depthWrite: true, side: THREE.DoubleSide}, this.synapticColors, 2)];
    this.synapticColors.default = makeMaterial({color: 0xff9100, opacity:0.6, transparent:false, depthWrite: true, side: THREE.DoubleSide});
  };

  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createBoundingBox = function(stack) {
    var p = stack.createStackToProjectBox(stack.createStackExtentsBox());

    var geometry = new THREE.Geometry();

    geometry.vertices.push(
      new THREE.Vector3(p.min.x, p.min.y, p.min.z),
      new THREE.Vector3(p.min.x, p.max.y, p.min.z),

      new THREE.Vector3(p.min.x, p.max.y, p.min.z),
      new THREE.Vector3(p.max.x, p.max.y, p.min.z),

      new THREE.Vector3(p.max.x, p.max.y, p.min.z),
      new THREE.Vector3(p.max.x, p.min.y, p.min.z),

      new THREE.Vector3(p.max.x, p.min.y, p.min.z),
      new THREE.Vector3(p.min.x, p.min.y, p.min.z),


      new THREE.Vector3(p.min.x, p.min.y, p.max.z),
      new THREE.Vector3(p.min.x, p.max.y, p.max.z),

      new THREE.Vector3(p.min.x, p.max.y, p.max.z),
      new THREE.Vector3(p.max.x, p.max.y, p.max.z),

      new THREE.Vector3(p.max.x, p.max.y, p.max.z),
      new THREE.Vector3(p.max.x, p.min.y, p.max.z),

      new THREE.Vector3(p.max.x, p.min.y, p.max.z),
      new THREE.Vector3(p.min.x, p.min.y, p.max.z),


      new THREE.Vector3(p.min.x, p.min.y, p.min.z),
      new THREE.Vector3(p.min.x, p.min.y, p.max.z),

      new THREE.Vector3(p.min.x, p.max.y, p.min.z),
      new THREE.Vector3(p.min.x, p.max.y, p.max.z),

      new THREE.Vector3(p.max.x, p.max.y, p.min.z),
      new THREE.Vector3(p.max.x, p.max.y, p.max.z),

      new THREE.Vector3(p.max.x, p.min.y, p.min.z),
      new THREE.Vector3(p.max.x, p.min.y, p.max.z)
    );

    var material = new THREE.LineBasicMaterial( { color: 0xff0000 } );
    var mesh = new THREE.LineSegments( geometry, material );

    mesh.computeLineDistances();

    mesh.position.set(0, 0, 0);

    // The bounding box will not move and automatic matrix update can be disabled.
    // However, we have to apply the initial position change by explicitely
    // updating the matrix.
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
  };

  /**
   * Creates a THREE.js line object that represents a floor grid. By default, it
   * extents around the bounding box by about twice the height of it. The grid
   * cells are placed so that they are divide the bouning box floor evenly. By
   * default, there are ten cells in each dimension within the bounding box. It is
   * positioned around the center of the dimensions. These settings can be
   * overridden with the options parameter.
   */
  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createFloor = function(center, dimensions, options) {
      var o = options || {};
      var floor = o['floor'] || dimensions.max.y;

      // 10 steps in each dimension of the bounding box
      var nBaseLines = o['nBaseLines'] || 10.0;
      var xStep = dimensions.max.x / nBaseLines;
      var zStep = dimensions.max.z / nBaseLines;
      // Extend this around the bounding box
      var xExtent = o['xExtent'] || Math.ceil(2.0 * dimensions.max.y / xStep);
      var zExtent = o['zExtent'] || Math.ceil(2.0 * dimensions.max.y / zStep);
      // Offset from origin
      var xOffset = dimensions.max.x * 0.5 - center.x;
      var zOffset = dimensions.max.z * 0.5 + center.z;
      // Get min and max coordinates of grid
      var min_x = -1.0 * xExtent * xStep + xOffset,
          max_x = dimensions.max.x + (xExtent * xStep) + xOffset;
      var min_z = -1.0 * dimensions.max.z - zExtent * zStep + zOffset,
          max_z = zExtent * zStep + zOffset;

      // Create planar mesh for floor
      var xLines = nBaseLines + 2 * xExtent + 1;
      var zLines = nBaseLines + 2 * zExtent + 1;
      var width = max_x - min_x;
      var height = max_z - min_z;

      // There are two three-component positions per line
      var positions = new Float32Array((xLines * 2 + zLines * 2) * 3);

      for (var z=0; z<zLines; ++z) {
        var i = z * 6;
        positions[i    ] = 0;
        positions[i + 1] = 0;
        positions[i + 2] = z*zStep;

        positions[i + 3] = width;
        positions[i + 4] = 0;
        positions[i + 5] = z*zStep;
      }

      for (var x=0; x<xLines; ++x) {
        var i = zLines * 6 + x * 6;
        positions[i    ] = x*xStep;
        positions[i + 1] = 0;
        positions[i + 2] = 0;

        positions[i + 3] = x*xStep;
        positions[i + 4] = 0;
        positions[i + 5] = height;
      }

      var geometry = new THREE.BufferGeometry();
      geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.computeBoundingSphere();

      var material = new THREE.LineBasicMaterial({
        color: o['color'] || 0x535353
      });
      var mesh = new THREE.LineSegments( geometry, material );

      mesh.position.set(min_x, floor, min_z);

      // The floor will not move and automatic matrix update can be disabled.
      // However, we have to apply the initial position change by explicitely
      // updating the matrix.
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();

      return mesh;
  };


  /** Adjust visibility of static content according to the persistent options. */
  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.adjust = function(options, space) {
    if (0 !== this.missing_sections.length) {
      this.missing_sections.forEach(function(m) { this.remove(m); }, space.scene);
      this.missing_sections = [];
    }
    if (options.show_missing_sections) {
      this.missing_sections = this.createMissingSections(project.focusedStackViewer.primaryStack,
                                                         options.missing_section_height);
      this.missing_sections.forEach(function(m) { this.add(m); }, space.scene);
    }

    space.view.renderer.setClearColor(options.background_color, 1);

    this.floor.visible = options.show_floor;
    this.floor.material.color.set(options.floor_color);
    this.floor.material.needsUpdate = true;

    if (this.box) {
      space.scene.project.remove(this.box);
      this.box.geometry.dispose();
      this.box.material.dispose();
      this.box = null;
    }
    if (options.show_box) {
      this.box = this.createBoundingBox(project.focusedStackViewer.primaryStack);
      this.box.visible = options.show_box;
      space.scene.project.add(this.box);
    }

    space.axesDisplay.style.display = options.show_axes ? 'block' : 'none';

    if (options.show_zplane) {
      var zplaneOptions = {
        focusedStackViewer: project.focusedStackViewer,
        texture: options.zplane_texture,
        zoomlevel: options.zplane_zoomlevel,
        opacity: options.zplane_opacity,
        sizeCheck: options.zplane_size_check
      };

      if (this.zplaneChanged(zplaneOptions)) {
        // Make sure we don't accidentally kill the user's browser by loading
        // too many images for the Z plane. Warn if the estimated pixel count
        // exceeds 100 MB, while expecting 3 Bytes per pixel.
        if (zplaneOptions.texture && options.zplane_size_check) {
          let estimatedPixelBytes = 3 * getZPlanePixelCountEstimate(
              project.focusedStackViewer, options.zplane_zoomlevel);
          let warningPixelBytes = 3 * 1024 * 1024 * 100;
          if (estimatedPixelBytes > warningPixelBytes) {
            if (!confirm("The current Z section zoom level configuration (" +
                options.zplane_zoomlevel + ") for the active stack viewer would " +
                "likely cause loading more than 100 MB of image data, risking " +
                "to freeze your browser window. Continue?")) {
              options.zplane_zoomlevel = 'max';
            }
          }
        }
        this.lastZPlaneOptions = zplaneOptions;
        this.createZPlane(space, project.focusedStackViewer,
            options.zplane_texture ? options.zplane_zoomlevel : null,
            options.zplane_opacity, options);
      }
    } else {
      this.lastZPlaneOptions = null;
      this.disposeZplane(space);
    }
  };

  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.zplaneChanged = function(options) {
    if (!this.lastZPlaneOptions) {
      return true;
    }

    for (var o in options) {
      if (this.lastZPlaneOptions.hasOwnProperty(o)) {
        if (this.lastZPlaneOptions[o] !== options[o]) {
          return true;
        }
      }
    }
    return false;
  };

  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createPlaneGeometry =
      function (stack, tileSource, tileZoomLevel) {
    var stackPlane = stack.createStackExtentsBox(),
        plane = stack.createStackToProjectBox(stackPlane),
        geometry, pDepth;

    var majorDimSeq = ['min', 'max', 'min', 'max'],
        minorDimSeq = ['min', 'min', 'max', 'max'],
        planeDimSeq = minorDimSeq,
        seq, pWidth, pHeight;

    switch (stack.orientation) {
      case CATMAID.Stack.ORIENTATION_XY:
        pDepth = plane.max.z - plane.min.z;
        plane.min.z = plane.max.z = 0;
        seq = {x: majorDimSeq, y: minorDimSeq, z: planeDimSeq};
        pWidth = plane.max.x - plane.min.x;
        pHeight = plane.max.y - plane.min.y;
        break;
      case CATMAID.Stack.ORIENTATION_XZ:
        pDepth = plane.max.y - plane.min.y;
        plane.min.y = plane.max.y = 0;
        seq = {x: majorDimSeq, y: planeDimSeq, z: minorDimSeq};
        pWidth = plane.max.x - plane.min.x;
        pHeight = plane.max.z - plane.min.z;
        break;
      case CATMAID.Stack.ORIENTATION_ZY:
        pDepth = plane.max.x - plane.min.x;
        plane.min.x = plane.max.x = 0;
        seq = {x: planeDimSeq, y: minorDimSeq, z: majorDimSeq};
        pWidth = plane.max.z - plane.min.z;
        pHeight = plane.max.y - plane.min.y;
        break;
    }

    if (tileSource && undefined !== tileZoomLevel) {
      var pTileWidth, pTileHeight;
      switch (stack.orientation) {
        case CATMAID.Stack.ORIENTATION_XY:
          pTileWidth = tileSource.tileWidth * stack.resolution.x;
          pTileHeight = tileSource.tileHeight * stack.resolution.y;
          break;
        case CATMAID.Stack.ORIENTATION_XZ:
          pTileWidth = tileSource.tileWidth * stack.resolution.x;
          pTileHeight = tileSource.tileHeight * stack.resolution.z;
          break;
        case CATMAID.Stack.ORIENTATION_ZY:
          pTileWidth = tileSource.tileWidth * stack.resolution.z;
          pTileHeight = tileSource.tileHeight * stack.resolution.y;
          break;
      }

      // Scale project tile width to the requested zoom level
      var scale = Math.pow(2, tileZoomLevel);
      pTileWidth *= scale;
      pTileHeight *= scale;
      // Create two triangles for every tile
      var tileWidth = tileSource.tileWidth;
      var tileHeight = tileSource.tileHeight;
      var nHTiles = getNZoomedParts(stack.dimension.x, tileZoomLevel, tileWidth);
      var nVTiles = getNZoomedParts(stack.dimension.y, tileZoomLevel, tileHeight);
      var transpose = tileSource.transposeTiles.has(stack.orientation);

      // Use THREE's plane geometry so that UVs and normals are set up aleady.
      var tilePlaneWidth = nHTiles * pTileWidth;
      var tilePlaneHeight = nVTiles * pTileHeight;

      // Get four corners of z plane: lower left, lower right,
      // upper left, upper right
      var planeVertices = new Array(4);
      for (var i = 0; i < 4; ++i) {
        planeVertices[i] = new THREE.Vector3(plane[seq.x[i]].x,
            plane[seq.y[i]].y, plane[seq.z[i]].z);
      }
      var hTileStep = planeVertices[1].clone().sub(planeVertices[0]).setLength(pTileWidth);
      var vTileStep = planeVertices[0].clone().sub(planeVertices[2]).setLength(pTileHeight);

      // Calculate some required tile overflow information
      var overflowH = tilePlaneWidth - pWidth;
      var overflowHCoRatio = 1 - overflowH / pTileWidth;
      var overflowV = tilePlaneHeight - pHeight;
      var overflowVCoRatio = 1 - overflowV / pTileHeight;

      // This will become the z plane.
      geometry = new THREE.PlaneGeometry(tilePlaneWidth, tilePlaneHeight, nHTiles, nVTiles);
      var tileVertices = new Array(4);
      for (var r=0; r<nVTiles; ++r) {
        for (var c=0; c<nHTiles; ++c) {
          var tileIndex = r * nHTiles + c;
          var faceIndex = tileIndex * 2;
          var face1 = geometry.faces[faceIndex];
          var face2 = geometry.faces[faceIndex + 1];
          var isLastCol = (c === nHTiles - 1);
          var isLastRow = (r === nVTiles - 1);
          var hTileFrac = isLastCol ? overflowHCoRatio : 1;
          var vTileFrac = isLastRow ? overflowVCoRatio : 1;

          // Move vertices to actual positions and clamp last row as well as
          // last column to stack bounds.
          var vertices = geometry.vertices;
          var ul = vertices[face1.a].copy(planeVertices[0])
              .addScaledVector(hTileStep, c)
              .addScaledVector(vTileStep,  -r);
          var ll = vertices[face1.b].copy(planeVertices[0])
              .addScaledVector(hTileStep, c)
              .addScaledVector(vTileStep, -r - vTileFrac);
          var lr = vertices[face2.b].copy(planeVertices[0])
              .addScaledVector(hTileStep, c + hTileFrac)
              .addScaledVector(vTileStep, -r - vTileFrac);
          var ur = vertices[face2.c].copy(planeVertices[0])
              .addScaledVector(hTileStep, c + hTileFrac)
              .addScaledVector(vTileStep, -r);

          // Set different material index for each tile
          face1.materialIndex = tileIndex;
          face2.materialIndex = tileIndex;

          // Set UVs so that our image tiles map nicely on our triangles
          var uvs1 = geometry.faceVertexUvs[0][faceIndex];
          var uvs2 = geometry.faceVertexUvs[0][faceIndex + 1];

          // Set UVs and clamp UVs of last row and column to stack bounds.
          uvs1[0].set(0, 1);
          uvs1[1].set(0, 1 - vTileFrac);
          uvs1[2].set(hTileFrac, 1);
          uvs2[0].set(0, 1 - vTileFrac);
          uvs2[1].set(hTileFrac, 1 - vTileFrac);
          uvs2[2].set(hTileFrac, 1);
        }
      }
      geometry.verticesNeedUpdate = true;
      geometry.uvsNeedUpdate = true;

      // If the stack tiles for this stack are transposed, its dimensions are
      // swapped and the stack has to be rotated by 90 degees.
      if (transpose) {
        // Mirror image diagonally
        var axis = planeVertices[3].clone().sub(planeVertices[0]).normalize();
        var rotation = new THREE.Matrix4();
        rotation.makeRotationAxis(axis, -Math.PI);
        geometry.applyMatrix(rotation);
      }
    } else {
      // Push vertices for lower left, lower right, upper left, upper right
      geometry = new THREE.Geometry();
      for (var i = 0; i < 4; ++i) {
        geometry.vertices.push( new THREE.Vector3( plane[seq.x[i]].x,
              plane[seq.y[i]].y, plane[seq.z[i]].z ) );
      }
      geometry.faces.push( new THREE.Face3( 0, 1, 2 ) );
      geometry.faces.push( new THREE.Face3( 1, 2, 3 ) );
    }

    return geometry;
  };

  /**
   * Get a pixel count estimation for loading a whole Z section of all stack
   * layers in the passed in stack viewer for the given zoom level.
   */
  function getZPlanePixelCountEstimate(stackViewer, textureZoomLevel) {
    let stackLayers = stackViewer.getLayersOfType(CATMAID.StackLayer);
    let pixelCountEstimate = 0;

    for (let i=0; i<stackLayers.length; ++i) {
      let stackLayer = stackLayers[i];
      let stack = stackLayer.getStack();
      // Estimate number of data to be transferred.
      let zoomLevel = "max" === textureZoomLevel ? stack.MAX_S : Math.min(stack.MAX_S, textureZoomLevel);
      let tileSource = stack.createTileSourceForMirror(stackLayer.mirrorIndex);
      let nHTiles = getNZoomedParts(stack.dimension.x, zoomLevel, tileSource.tileWidth);
      let nVTiles = getNZoomedParts(stack.dimension.y, zoomLevel, tileSource.tileHeight);

      pixelCountEstimate += nHTiles * tileSource.tileWidth * nVTiles * tileSource.tileHeight;
    }

    return pixelCountEstimate;
  }

  /**
   * Destroy an existing z plane and replace it with a new one.
   *
   * @param {Object}  space            Space to which the z plane should be added to
   * @param {Object}  stackViewer      The stack viewer to create z plane for
   * @param {Integer} textureZoomLevel (Optional) The zoom level used for
   *                                   image tile texture. If set to "max", the
   *                                   stack's maximum zoom level is used. If
   *                                   null/undefined, no texture will be used.
   * @param {Number}  opacity          A value in the range 0-1 representing the
   *                                   opacity of the z plane.
   */
  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createZPlane =
      function(space, stackViewer, textureZoomLevel, opacity, options) {
    this.disposeZplane(space);

    // Create geometry for plane based on primary stack
    var geometry = this.createPlaneGeometry(stackViewer.primaryStack);
    var material = new THREE.MeshBasicMaterial({
        color: 0x151349, side: THREE.DoubleSide, opacity: opacity,
        transparent: true});
    this.zplane = new THREE.Mesh(geometry, material);
    space.scene.project.add(this.zplane);

    if (textureZoomLevel || 0 === textureZoomLevel) {
      this.zplaneLayerMeshes = [];
      this.zplaneLayers = [];
      // Each layer ha its own mesh, which makes it easier to position
      // layers relative to each other and provides support for blending.
      var tileLayers = stackViewer.getLayersOfType(CATMAID.TileLayer);

      for (var l=0; l<tileLayers.length; ++l) {
        var tileLayer = tileLayers[l];
        // Only show visible tile layers
        if (!tileLayer.visible) {
          continue;
        }

        var zoomLevel = "max" === textureZoomLevel ? tileLayer.stack.MAX_S :
            Math.min(tileLayer.stack.MAX_S, textureZoomLevel);
        var tileSource = tileLayer.stack.createTileSourceForMirror(tileLayer.mirrorIndex);
        var geometry = this.createPlaneGeometry(tileLayer.stack, tileSource, zoomLevel);

        // Every tile in the z plane is made out of two triangles.
        var zplaneMaterials = new Array(geometry.faces.length / 2);
        for (var i=0; i<zplaneMaterials.length; ++i) {
          zplaneMaterials[i] = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            opacity: opacity,
            transparent: true,
          });
        }

        var mesh = new THREE.Mesh(geometry, zplaneMaterials);
        this.zplaneLayerMeshes.push(mesh);
        this.zplaneLayers.push({
          hasImages: true,
          mesh: mesh,
          tileSource: tileSource,
          materials: zplaneMaterials,
          zoomLevel: zoomLevel,
          stack: tileLayer.stack,
        });
      }

      this.zplaneScene.add.apply(this.zplaneScene, this.zplaneLayerMeshes);
    }

    this.updateZPlanePosition(space, stackViewer);
  };

  var getNZoomedParts = function(width, zoom, part) {
    return Math.floor((width * Math.pow(2, -zoom) - 1) / part) + 1;
  };

  // To get arround potential CORS restrictions load tile into image and
  // then into texture.
  var loadTile = function() {
    this.__material.visible = true;
    this.__material.map.needsUpdate = true;
    this.__material.needsUpdate = true;
    this.__notify();
  };

  var setDepth = function(target, stack, source, stackOffset = 0, projectOffset = 0) {
    switch (stack.orientation) {
      case CATMAID.Stack.ORIENTATION_XY:
        target.z = stack.stackToProjectZ(source.z + stackOffset, source.y, source.x) + projectOffset;
        break;
      case CATMAID.Stack.ORIENTATION_XZ:
        target.y = stack.stackToProjectY(source.z + stackOffset, source.y, source.x) + projectOffset;
        break;
      case CATMAID.Stack.ORIENTATION_ZY:
        target.x = stack.stackToProjectX(source.z + stackOffset, source.y, source.x) + projectOffset;
        break;
    }
    return target;
  };

  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.updateZPlanePosition = function(
      space, stackViewer, stackDepthOffset = 0, projectDepthOffset = 0) {
    var self = this;
    var zplane = this.zplane;
    if (!zplane) {
      return;
    }

    // Find reference stack position, add set location of current layer.
    var pos = new THREE.Vector3(0, 0, 0);
    setDepth(pos, stackViewer.primaryStack, stackViewer, stackDepthOffset, projectDepthOffset);
    zplane.position.copy(pos);

    if (!this.zplaneLayerMeshes) {
      return;
    }

    // Wait for all images to render (if any), from all layers. This is not used
    // for non-image z planes.
    self.zplaneTileCounter = 0;
    self.zplaneTileLoadErrors = [];
    for (var i=0; i<this.zplaneLayers.length; ++i) {
      var materials = this.zplaneLayers[i].materials;
      if (materials) {
        self.zplaneTileCounter += materials.length;
      }
    }

    return new Promise((resolve, reject) => {
      var notify = function() {
        self.zplaneTileCounter--;
        if (0 === self.zplaneTileCounter) {
          zplane.material.uniforms['zplane'].needsUpdate = true;
          space.render();
          resolve();
        }
      };
      var handleError = function(error) {
        this.__material.visible = false;
        this.__material.map.needsUpdate = false;
        this.__material.needsUpdate = true;
        self.zplaneTileCounter--;
        self.zplaneTileLoadErrors.push(error);
        if (self.zplaneTileCounter === 0) {
          //CATMAID.warn('Couldn\'t load ' + loadErrors.length + ' tile(s)');
          space.render();
          resolve();
        }
      };

      for (var i=0; i<this.zplaneLayers.length; ++i) {
        var layer = this.zplaneLayers[i];
        var stack = layer.stack;

        // Find reference stack position, add set location of current layer.
        var pos = new THREE.Vector3(0, 0, 0);
        setDepth(pos, stack, stackViewer, stackDepthOffset, projectDepthOffset);
        layer.mesh.position.copy(pos);
        let currentStackZ = stack.projectToStackZ(pos.z, pos.y, pos.x);

        // Also update tile textures, if enabled
        if (layer.hasImages) {
          // Create materials and textures
          var tileSource = layer.tileSource;
          var zoomLevel = layer.zoomLevel;
          var layerStack = layer.stack;
          var nCols = getNZoomedParts(layerStack.dimension.x, zoomLevel,
              tileSource.tileWidth);
          var materials = layer.materials;
          for (var m=0; m<materials.length; ++m) {
            var material = materials[m];
            var texture = material.map;
            var image;
            if (texture) {
              image = texture.image;
              // Make sure texture and material are not marked for updated before
              // images are loaded.
              texture.needsUpdate = false;
              material.needsUpdate = false;
            } else {
              image = new Image();
              image.crossOrigin = true;
              texture = new THREE.Texture(image);
              image.onload = loadTile;
              image.onerror = handleError;
              material.map = texture;
            }
            // Add some state information to image element to avoid creating a
            // closure for a new function.
            image.__material = material;
            image.__notify = notify;

            // Layers further up, will replace pixels from layers further down,
            // they are (currently) not combined.
            material.blending = THREE.CustomBlending;
            material.blendEquation = THREE.AddEquation;
            material.blendSrc = THREE.SrcAlphaFactor;
            material.blendDst = THREE.OneMinusSrcAlphaFactor;
            material.depthTest = false;

            var slicePixelPosition = [currentStackZ];
            var col = m % nCols;
            var row = (m - col) / nCols;
            image.src = tileSource.getTileURL(project.id, layerStack,
                slicePixelPosition, col, row, zoomLevel);
          }
          layer.mesh.material.needsUpdate = true;
        }
      }
    });
  };

  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.beforeRender =
      function(scene, renderer, camera, options) {
    // If z sections are displayed and show tile layer images, then the current
    // view has to be rendered first and provided as a texture for the main
    // scene z section.
    if (this.zplane && this.zplaneLayerMeshes) {
      // Make sure we have a render target
      if (!this.zplaneRenderTarget) {
        var size = renderer.getSize(new THREE.Vector2());
        this.zplaneRenderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter
        });
        var material = new CATMAID.ShaderMeshBasicMaterial();
        material.addUniforms({
          displayScale: { value: renderer.getPixelRatio() },
          zplane: { value: this.zplaneRenderTarget.texture },
          width: { value: size.width },
          height: { value: size.height },
          newColor: { value: new THREE.Color(options.zplane_replacement_bg_color) },
          minVal: { value: options.zplane_min_bg_val },
          maxVal: { value: options.zplane_max_bg_val },
        });
        material.insertSnippet('fragmentDeclarations', [
          'uniform float displayScale;',
          'uniform float width;',
          'uniform float height;',
          'uniform sampler2D zplane;',
          'uniform vec3 newColor;',
          'uniform float minVal;',
          'uniform float maxVal;',
          ''
        ].join('\n'));
        let fragmentShaderParts = [
          'float texWidth = width * displayScale;',
          'float texHeight = height * displayScale;',
          'vec2 texCoord = vec2((gl_FragCoord.x - 0.5) / texWidth, (gl_FragCoord.y - 0.5) / texHeight);',
          'vec4 diffuseColor = texture2D(zplane, texCoord);'
        ];
        if (options.zplane_replace_background) {
          fragmentShaderParts.push(
              'if (diffuseColor.r + diffuseColor.g + diffuseColor.b >= minVal && diffuseColor.r + diffuseColor.g + diffuseColor.b <= maxVal) { diffuseColor = vec4(newColor.rgb, diffuseColor.a); }');
        }
        material.insertSnippet('fragmentColor', fragmentShaderParts.join('\n'));

        material.side = THREE.DoubleSide;
        material.transparent = true;
        this.zplane.material = material;
      }
      // Render all zplane layers
      renderer.setRenderTarget(this.zplaneRenderTarget);
      renderer.clear();
      renderer.render(this.zplaneScene, camera);

      // If wanted, the z pane map can be exported
      var saveZplaneImage = false;
      if (saveZplaneImage) {
        var img = CATMAID.tools.createImageFromGlContext(renderer.getContext(),
            this.zplaneRenderTarget.width, this.zplaneRenderTarget.height);
        var blob = CATMAID.tools.dataURItoBlob(img.src);
        CATMAID.FileExporter.saveAs(blob, "catmaid-zplanemap.png");
      }

      // Wait for images with update
      this.zplane.material.needsUpdate = false;

      // Reset render target
      renderer.setRenderTarget(null);
    }
  };

  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.setSize = function(width, height) {
    if (this.zplaneRenderTarget) {
      this.zplaneRenderTarget.setSize(width, height);
      if (this.zplane) {
        this.zplane.material.uniforms['width'].value = width;
        this.zplane.material.uniforms['width'].needsUpdate = true;
        this.zplane.material.uniforms['height'].value = height;
        this.zplane.material.uniforms['height'].needsUpdate = true;
      }
    }
  };

  /** Returns an array of meshes representing the missing sections. */
  WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createMissingSections = function(stack, missing_section_height) {
    var geometry = this.createPlaneGeometry(stack),
        materials = [new THREE.MeshBasicMaterial( { color: 0x151349, opacity:0.6, transparent: true, side: THREE.DoubleSide } ),
                     new THREE.MeshBasicMaterial( { color: 0x00ffff, wireframe: true, wireframeLinewidth: 5, side: THREE.DoubleSide } )];

    // Use scaling to set missing section height.
    var scale = {x: 1, y: 1, z: 1};
    switch (stack.orientation) {
      case CATMAID.Stack.ORIENTATION_XY:
        scale.y = missing_section_height / 100;
        break;
      case CATMAID.Stack.ORIENTATION_XZ:
        scale.z = missing_section_height / 100;
        break;
      case CATMAID.Stack.ORIENTATION_ZY:
        scale.y = missing_section_height / 100;
        break;
    }

    return stack.broken_slices.reduce(function(missing_sections, sliceStackZ) {
      var x = stack.stackToProjectX(sliceStackZ, 0, 0),
          y = stack.stackToProjectY(sliceStackZ, 0, 0),
          z = stack.stackToProjectZ(sliceStackZ, 0, 0);
      return missing_sections.concat(materials.map(function(material) {
        var mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.scale.set(scale.x, scale.y, scale.z);
        return mesh;
      }));
    }, []);
  };

  /**
   * Constructor for an object that manages the content in a scene.
   */
  WebGLApplication.prototype.Space.prototype.Content = function(options) {
    // A representation of the active node
    this.active_node = new this.ActiveNode(options);
    // Map of skeleton IDs to skeleton representations
    this.skeletons = {};
  };

  WebGLApplication.prototype.Space.prototype.Content.prototype = {};

  WebGLApplication.prototype.Space.prototype.Content.prototype.dispose = function() {
    this.active_node.mesh.geometry.dispose();
    this.active_node.mesh.material.dispose();
  };

  WebGLApplication.prototype.Space.prototype.Content.prototype.newMesh = function(geometry, material) {
    return new THREE.Mesh(geometry, material);
  };

  /** Adjust content according to the persistent options. */
  WebGLApplication.prototype.Space.prototype.Content.prototype.adjust = function(options, space, submit) {
    this.active_node.mesh.material.depthTest = !options.active_node_on_top;
    this.active_node.setVisible(options.show_active_node);
    this.active_node.updatePosition(space, options);
  };

  WebGLApplication.prototype.Space.prototype.View = function(space) {
    this.space = space;

    this.init();

    // Initial view
    this.XY();
  };

  WebGLApplication.prototype.Space.prototype.View.prototype = {};

  WebGLApplication.prototype.Space.prototype.View.prototype.init = function() {
    /* Create a camera which generates a picture fitting in our canvas. The
    * frustum's far culling plane for the perspective camera is very far away.
    * This is needed to avoid some strange clipping of the floor geometry when a
    * logarithmic depth buffer is used (what we do). */
    var fov = 75;
    var d = this.space.dimensions;
    var regularFarPlane = 5 * Math.max(Math.abs(d.max.x - d.min.x),
                              Math.max(Math.abs(d.max.y - d.min.y),
                                       Math.abs(d.max.z - d.min.z)));
    var near = 1;
    var far = this.logDepthBuffer ? 1e27 : regularFarPlane;
    var orthoNear = -regularFarPlane;
    var orthoFar = regularFarPlane;

    this.logDepthBuffer = true;
    this.mainCamera = new THREE.CombinedCamera(-this.space.canvasWidth,
        -this.space.canvasHeight, fov, near, far, orthoNear, orthoFar);
    this.mainCamera.frustumCulled = false;

    this.camera = this.mainCamera;

    this.debugCamera = new THREE.CombinedCamera(-this.space.canvasWidth,
        -this.space.canvasHeight, fov, 1e-6, 1e27, orthoNear, orthoFar);
    this.debugCamera.position.x = 2 * d.max.x;
    this.debugCamera.position.y = -2 * d.max.y;
    this.debugCamera.position.z = 2 * d.max.z;
    this.debugCamera.up.set(0, -1, 0);
    this.debugCamera.lookAt(this.space.center);

    this.projector = new THREE.Projector();

    this.mouse = {position: new THREE.Vector2(),
                  is_mouse_down: false};

    this.initRenderer();

    // Create controls after the renderer's DOM element has been added, so they
    // are initialized with the correct dimensions right from the start.
    this.controls = this.createControls();
  };

  var renderContextLost = function(e) {
    e.preventDefault();
    // Notify user about reload
    CATMAID.error("Due to limited system resources the 3D display can't be " +
          "shown right now. Please try and restart the widget containing the " +
          "3D viewer.");
  };

  var destroyRenderer = function(renderer) {
    renderer.context.canvas.removeEventListener('webglcontextlost',
        renderContextLost);
    renderer.forceContextLoss();
    renderer.context = null;
    renderer.domElement = null;
    renderer.dispose();
  };

  /**
   * Create a new renderer and add its DOM element to the 3D viewer's container
   * element. If there is already a renderer, remove its DOM element and
   * handlers on it.
   *
   * @params {Boolean} destroyOld If true, an existing renderer will be
   *                              explicitly destroyed.
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.initRenderer = function(destroyOld) {
    var clearColor = null;
    // Remove existing elements if there is a current renderer
    if (this.renderer) {
      this.mouseControls.detach(this.renderer.domElement);
      this.space.container.removeChild(this.renderer.domElement);
      // Save clear color
      clearColor = this.renderer.getClearColor();

      // Destroy renderer, if wanted
      if (destroyOld) {
        destroyRenderer(this.renderer);
        this.renderer = null;
      }
    }

    this.renderer = this.createRenderer('webgl');
    if (clearColor) {
      this.renderer.setClearColor(clearColor);
    }

    this.axesRenderer = new THREE.WebGLRenderer({
      antialias: true,
    });
    this.axesRenderer.setClearColor(0xf0f0f0, 1);
    this.axesRenderer.setSize(this.space.axesRectWidth, this.space.axesRectHeight );
    while (this.space.axesDisplay.lastChild) {
      this.space.axesDisplay.removeChild(this.space.axesDisplay.lastChild);
    }
    this.space.axesDisplay.appendChild(this.axesRenderer.domElement);

    this.space.container.appendChild(this.renderer.domElement);
    this.mouseControls = new this.MouseControls();
    this.mouseControls.attach(this, this.renderer.domElement);

    // Add handlers for WebGL context lost and restore events
    this.renderer.context.canvas.addEventListener('webglcontextlost', renderContextLost, false);
    this.renderer.context.canvas.addEventListener('webglcontextrestored', (function(e) {
      this.initRenderer();
    }).bind(this), false);
  };


  /**
   * Crate and setup a WebGL or SVG renderer.
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.createRenderer = function(type) {
    var renderer = null;
    if ('webgl' === type) {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        logarithmicDepthBuffer: this.logDepthBuffer,
        checkShaderErrors: true,
      });
      // Set pixel ratio, needed for HiDPI displays, if enabled
      if (this.space.options.use_native_resolution) {
        renderer.setPixelRatio(window.devicePixelRatio || 1);
      }
    } else if ('svg' === type) {
      renderer = new THREE.SVGRenderer();
    } else {
      CATMAID.error("Unknon renderer type: " + type);
      return null;
    }

    renderer.sortObjects = false;
    renderer.setSize( this.space.canvasWidth, this.space.canvasHeight );

    return renderer;
  };

  WebGLApplication.prototype.Space.prototype.View.prototype.destroy = function() {
    this.mouseControls.detach(this.renderer.domElement);
    this.space.container.removeChild(this.renderer.domElement);
    destroyRenderer(this.renderer);
    Object.keys(this).forEach(function(key) { delete this[key]; }, this);
  };

  WebGLApplication.prototype.Space.prototype.View.prototype.createControls = function() {
    var controls = new THREE.TrackballControls( this.camera, this.space.container );
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 3.2;
    controls.panSpeed = 1.5;
    controls.noZoom = true;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.cylindricalRotation = false;
    controls.dynamicDampingFactor = 0.3;
    controls.target = this.space.center.clone();
    return controls;
  };

  WebGLApplication.prototype.Space.prototype.View.prototype.render = function(beforeRender) {
    if (this.controls) {
      this.controls.update();

      if (this.space.options.show_axes) {
        this.space.axesCamera.position.copy(this.camera.position);
        this.space.axesCamera.position.sub(this.controls.target);
        this.space.axesCamera.position.setLength(300);
        this.space.axesCamera.lookAt(this.space.axesScene.position);
      }
    }
    if (this.renderer) {
      CATMAID.tools.callIfFn(beforeRender, this.scene, this.renderer,
          this.camera, this.space.options);
      this.renderer.clear();
      this.renderer.render(this.space.scene, this.camera);
    }

    if (this.axesRenderer && this.space.options.show_axes) {
      this.axesRenderer.render(this.space.axesScene, this.space.axesCamera);
    }
  };

  /**
   * Get the toDataURL() image data of the renderer in PNG format.
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.getImageData = function(type) {
    type = type || "image/png";
    return this.renderer.domElement.toDataURL(type);
  };

  /**
   * Return SVG data of the rendered image. The rendered scene is slightly
   * modified to not include the triangle-heavy spheres. Instead, these spheres
   * are replaced with very short lines with a width that corresponds to the
   * diameter of the spheres.
   *
   * If createCatalog is true, a catalog representation is crated where each
   * neuron will be rendered in its own view, organized in a table.
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.getSVGData = function(options) {
    var self = this;
    var o = options || {};

    // Find all spheres
    var fields = ['radiusVolumes'];
    var skeletons = this.space.content.skeletons;
    let catalogExport = o['layout'] === 'catalog';
    let needsDataReplacement = !catalogExport || o['panelFormat'] === 'svg';
    let visibleSpheres;
    if (needsDataReplacement) {
      visibleSpheres = Object.keys(skeletons).reduce(function(o, skeleton_id) {
        var skeleton = skeletons[skeleton_id];
        if (!skeleton.visible) return o;

        var meshes = [];

        // Append all spheres
        fields.map(function(field) {
          return skeleton[field];
        }).forEach(function(spheres) {
          Object.keys(spheres).forEach(function(id) {
            var sphere = spheres[id];
            if (sphere.visible) {
              this.push(sphere);
            }
          }, this);
        }, meshes);

        // Append all individual buffer objects to be able to create replacements
        // for them. The whole buffers added below are only used to make all
        // objects of this bufffer invisible for rendering (doesn't work with with
        // the meshes only in SVG renderer).
        var bufferObjects = [];
        var bufferConnectorSpheres = skeleton['synapticSpheres'];
        for (var id in bufferConnectorSpheres) {
          var bo = bufferConnectorSpheres[id];
          bufferObjects.push(bo);
        }
        var bufferSpheres = skeleton['specialTagSpheres'];
        for (var id in bufferSpheres) {
          var bo = bufferSpheres[id];
          bufferObjects.push(bo);
        }

        o.meshes[skeleton_id] = meshes;
        o.bufferObjects[skeleton_id] = bufferObjects;
        o.buffers[skeleton_id] = [];
        if (skeleton.specialTagSphereCollection)
          o.buffers[skeleton_id].push(skeleton.specialTagSphereCollection);
        if (skeleton.connectorSphereCollection)
          o.buffers[skeleton_id].push(skeleton.connectorSphereCollection);

        return o;
      }, {
        meshes: {},
        bufferObjects: {},
        buffers: {}
      });
    }

    // Hide the active node
    var atnVisible = self.space.content.active_node.mesh.visible;
    self.space.content.active_node.mesh.visible = false;

    // Render
    var svgData = null;
    if (catalogExport) {
      svgData = createCatalogData(self, o, visibleSpheres);
    } else {
      svgData = renderSkeletonsSVG(visibleSpheres.meshes,
          visibleSpheres.bufferObjects, visibleSpheres.buffers);
    }

    // Show active node, if it was visible before
    self.space.content.active_node.mesh.visible = atnVisible;

    // Let 3D viewer update
    self.space.render();

    return svgData;

    /**
     * Set visibility of the given meshes.
     */
    function setVisibility(meshes, value)
    {
      // Hide all sphere meshes
      meshes.forEach(function(mesh) {
        mesh.visible = value;
      });
    }

    function addSphereReplacements(meshes, buffers, scene)
    {
      // Spheres will be replaced with very short lines
      var geometry = new THREE.Geometry();
      geometry.vertices.push(new THREE.Vector3(0, 0, 0));
      geometry.vertices.push(new THREE.Vector3(0, 0, 1));

      var addedData = {
        m: {},
        g: geometry,
        d: []
      };

      var tmp = new THREE.Vector3();
      var line = new THREE.Line3();
      // Use the camera's up vector to constuct a normalized vector embedded in
      // the screen space plane.
      var up = self.camera.up.clone().normalize();
      if (meshes) {
        var meshReplacements = meshes.map(function(mesh) {
          var hex = mesh.material.color.getHexString();
          // Get radius of sphere in 3D world coordinates, but only use a 3x3 world
          // matrix, since we don't need the translation.
          if (mesh instanceof THREE.Mesh) {
            tmp.set(mesh.geometry.boundingSphere.radius, 0, 0)
              .applyMatrix3(mesh.matrixWorld).length();
          } else {
            tmp.set(mesh.radius, 0, 0);
          }
          var r = tmp.length();
          // The radius has to be corrected for perspective
          var sr = tmp.copy(up).multiplyScalar(r);
          line.set(mesh.position.clone(), sr.add(mesh.position));
          line.start.project(self.camera);
          line.end.project(self.camera);
          // The projected line distance is given in a screen space that ranges from
          // (-1,-1) to (1,1). We therefore have to divide by 2 to get a normalized
          // value that we can use to create actual screen distances.  For the final
          // length, there is no need to be more precise than 1 decimal
          var l = (0.5 * line.distance() * self.space.canvasWidth).toFixed(1);
          // Get material from index or create a new one
          var key = hex + "-" + l;
          var material = this.m[key];
          if (!material) {
            material = new THREE.LineBasicMaterial({
              color: mesh.material.color.clone(),
              opacity: mesh.material.opacity,
              linewidth: l
            });
            this.m[key] = material;
          }
          var newMesh = new THREE.LineSegments( this.g, material );
          newMesh.computeLineDistances();
          // Move new mesh to position of replaced mesh and adapt size
          newMesh.position.copy(mesh.position);
          scene.add(newMesh);
          return newMesh;
        }, addedData);

        addedData.d = addedData.d.concat(meshReplacements);
      }


      if (buffers) {
        var bufferReplacements = buffers.filter(function(buffer) {
          return buffer.visible;
        }).map(function(buffer) {
          var hex = buffer.color.getHexString();
          tmp.set(buffer.boundingSphere.radius, 0, 0);
          var r = tmp.length();
          // The radius has to be corrected for perspective
          var sr = tmp.copy(up).multiplyScalar(r);
          line.set(buffer.position.clone(), sr.add(buffer.position));
          line.start.project(self.camera);
          line.end.project(self.camera);
          // The projected line distance is given in a screen space that ranges from
          // (-1,-1) to (1,1). We therefore have to divide by 2 to get a normalized
          // value that we can use to create actual screen distances.  For the final
          // length, there is no need to be more precise than 1 decimal
          var l = (0.5 * line.distance() * self.space.canvasWidth).toFixed(1);
          // Get material from index or create a new one
          var key = hex + "-" + l;
          var material = this.m[key];
          if (!material) {
            material = new THREE.LineBasicMaterial({
              color: buffer.color.clone(),
              opacity: buffer.alpha,
              linewidth: l
            });
            this.m[key] = material;
          }
          var newMesh = new THREE.LineSegments( this.g, material );
          newMesh.computeLineDistances();
          // Move new mesh to position of replaced mesh and adapt size
          newMesh.position.copy(buffer.position);
          scene.add(newMesh);
          return newMesh;
        }, addedData);

        addedData.d = addedData.d.concat(bufferReplacements);
      }

      return addedData;
    }

    function removeSphereReplacements(addedData, scene)
    {
      addedData.d.forEach(function(m) { scene.remove(m); });
      Object.keys(addedData.m).forEach(function(m) {
        this[m].dispose();
      }, addedData.m);
      addedData.g.dispose();
    }

    function getName(skeletonId) {
      return CATMAID.NeuronNameService.getInstance().getName(skeletonId);
    }

    /**
     * Create an SVG catalog of the current view.
     */
    function createCatalogData(view, options, replacementData) {
      let panelFormat = options['panelFormat'];
      let needsDataReplacement = panelFormat === 'svg';
      let sphereMeshes, bufferObjects, sphereBuffers;
      if (needsDataReplacement) {
        sphereMeshes = replacementData.meshes;
        bufferObjects = replacementData.bufferObjects;
        sphereBuffers = replacementData.buffers;
      }

      // Sort skeletons
      var skeletons;
      if (options['skeletons']) {
        // Make sure all requested skeletons are actually part of the 3D view
        var existingSkids = Object.keys(self.space.content.skeletons);
        options['skeletons'].forEach(function(s) {
          if (-1 === existingSkids.indexOf(s)) {
            throw "Only skeletons currently loaded in the 3D viewer can be exported";
          }
        });
        skeletons = options['skeletons'];
      } else {
        // If no skeletons where given, don't try to sort
        skeletons = Object.keys(self.space.content.skeletons);
      }

      // SVG namespace to use
      var namespace = 'http://www.w3.org/2000/svg';
      // Size of the label text
      var fontsize = options['fontsize'] || 14;
      var displayNames = options['displaynames'] === undefined ? true : options['displaynames'];

      // Orthographic mode
      var inOrthographicMode = self.space.options.camera_view === 'orthographic';
      var orthoCamera = self.camera.cameraO;
      var orthoCameraWidth = orthoCamera.right - orthoCamera.left;

      // Margin of whole document
      var margin = options['margin'] || 10;
      // Padding around each sub-svg
      var padding = options['padding'] || 10;

      var textColor = options['textColor'] || 'black';

      let nSkeletonsPerPanel = options['skeletonsPerPanel'] || 1;
      var imageWidth = self.space.canvasWidth;
      var imageHeight = self.space.canvasHeight;
      var numColumns = options['columns'] || 2;
      var numRows = Math.ceil(skeletons.length / nSkeletonsPerPanel / numColumns);

      // Crate a map of current visibility
      var visibilityMap = self.space.getVisibilityMap();

      // Append missing pinned skeletons
      var visibleSkids = options['pinnedSkeletons'] || [];

      // Iterate over skeletons and create SVG views
      var views = [];
      for (var i=0, l=skeletons.length; i<l; i = i + nSkeletonsPerPanel) {
        let currentSkeletonIds = [];
        for (let j=0; j<nSkeletonsPerPanel; ++j) {
          // If there are less skeletons than allowd in this batch, only show
          // what is available.
          if (i + j >= l) {
            break;
          }
          let skeletonIdx = i + j;
          var skid = skeletons[skeletonIdx];
          // Display only current skeleton along with pinned ones
          visibleSkids.push(skid);
          currentSkeletonIds.push(skid);
        }

        let askedToDisplayOthoScaleBar =
            (options['orthoScaleBar'] === 'all-panels') ||
            (options['orthoScaleBar'] === 'first-panel' && i === 0);
        let displayOrthoScaleBar = inOrthographicMode && askedToDisplayOthoScaleBar;

        self.space.setSkeletonVisibility(visibilityMap, visibleSkids);

        // Render view and replace sphere meshes of current skeleton, if needed
        let panel;
        if (panelFormat === 'svg') {
          let spheres = visibleSkids.reduce(function(o, s) {
            o.meshes[s] = sphereMeshes[s];
            o.buffers[s] = sphereBuffers[s];
            o.bufferObjects[s] = bufferObjects[s];
            return o;
          }, {
            meshes: {},
            bufferObjects: {},
            buffers: {}
          });

          panel = renderSkeletonsSVG(spheres.meshes, spheres.bufferObjects,
              spheres.buffers);
        } else {
          let panelImageWidth, panelImageHeight;
          if (panelFormat === 'png1') {
            panelImageWidth = imageWidth;
            panelImageHeight = imageHeight;
          } else if (panelFormat === 'png2') {
            panelImageWidth = 2 * imageWidth;
            panelImageHeight = 2 * imageHeight;
          } else if (panelFormat === 'png4') {
            panelImageWidth = 4 * imageWidth;
            panelImageHeight = 4 * imageHeight;
          } else {
            throw new CATMAID.ValueError("Unknown panel format: " + panelFormat);
          }
          panel = renderSkeletonsPNG(self, namespace, panelImageWidth,
              panelImageHeight, true);
        }

        let panelViewBox = panel.viewBox ? panel.viewBox.baseVal : {
          x: 0,
          y: 0,
          width: imageWidth,
          height: imageHeight,
        };

        // Add name of neuron, if enabled
        if (displayNames) {
          let text = document.createElementNS(namespace, 'text');
          text.setAttribute('x', panelViewBox.x + 5);
          text.setAttribute('y', panelViewBox.y + fontsize + 5);
          text.setAttribute('style', 'font-family: Arial; font-size: ' +
              fontsize + 'px; fill: ' + textColor + ';');
          let names = currentSkeletonIds.map(getName).join(', ');
          text.appendChild(document.createTextNode(names));
          panel.appendChild(text);
        }

        // Show ortho scale bar, if it should be shown for this panel
        if (displayOrthoScaleBar) {
          // Create temporary scale bar
          let scaleBar = new CATMAID.ScaleBar(document.createElement('div'));
          scaleBar.update(imageWidth / orthoCameraWidth, panelViewBox.width / 5);

          let xOffset = panelViewBox.x + Math.round(panelViewBox.width * 0.05);
          let yOffset = panelViewBox.y + Math.round(panelViewBox.height * 0.95);
          let strokeWidth = Math.max(2, panelViewBox.height * 0.002);

          let scaleBarGroup = document.createElementNS(namespace, 'g');
          let bar = document.createElementNS(namespace, 'line');
          bar.setAttribute('x1', xOffset);
          bar.setAttribute('y1', yOffset);
          bar.setAttribute('x2', xOffset + scaleBar.width);
          bar.setAttribute('y2', yOffset);
          bar.setAttribute('stroke', textColor);
          bar.setAttribute('stroke-width', strokeWidth);
          scaleBarGroup.appendChild(bar);

          let left = document.createElementNS(namespace, 'line');
          left.setAttribute('x1', xOffset - (strokeWidth / 2));
          left.setAttribute('y1', yOffset);
          left.setAttribute('x2', xOffset - (strokeWidth / 2));
          left.setAttribute('y2', yOffset - fontsize / 2);
          left.setAttribute('stroke', textColor);
          left.setAttribute('stroke-width', strokeWidth);
          left.setAttribute('stroke-linecap', 'square');
          scaleBarGroup.appendChild(left);

          let right = document.createElementNS(namespace, 'line');
          right.setAttribute('x1', xOffset + scaleBar.width + strokeWidth / 2);
          right.setAttribute('y1', yOffset);
          right.setAttribute('x2', xOffset + scaleBar.width + strokeWidth / 2);
          right.setAttribute('y2', yOffset - fontsize / 2);
          right.setAttribute('stroke', textColor);
          right.setAttribute('stroke-width', strokeWidth);
          right.setAttribute('stroke-linecap', 'square');
          scaleBarGroup.appendChild(right);

          let text = document.createElementNS(namespace, 'text');
          text.setAttribute('x', xOffset + scaleBar.width / 2);
          text.setAttribute('y', yOffset - strokeWidth * 3);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('style', 'font-family: Arial; font-size: ' +
              fontsize + 'px; fill: ' + textColor + ';');
          text.appendChild(document.createTextNode(scaleBar.text));
          scaleBarGroup.appendChild(text);

          panel.appendChild(scaleBarGroup);
        }

        // Remove current skeletons again from visibility list
        visibleSkids.splice(-nSkeletonsPerPanel, nSkeletonsPerPanel);

        // Store
        views.push(panel);
      }

      // Restore visibility
      self.space.setSkeletonVisibility(visibilityMap);

      // Create result svg
      var svg = document.createElementNS(namespace, 'svg');
      svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      svg.setAttribute('width', 2 * margin + numColumns * (imageWidth + 2 * padding));
      svg.setAttribute('height', 2 * margin + numRows * (imageHeight + 2 * padding));

      // Title
      var title = document.createElementNS(namespace, 'title');
      title.appendChild(document.createTextNode(options['title'] || 'CATMAID neuron catalog'));
      svg.appendChild(title);

      // Combine all generated panels into one SVG
      for (let i=0, l=views.length; i<l; ++i) {
        let data = views[i];

        // Add a translation to current image
        let col = i % numColumns;
        let row = Math.floor(i / numColumns);
        let xd = margin + col * imageWidth + (col * 2 + 1) * padding;
        let yd = margin + row * imageHeight + (row * 2 * padding) + padding;

        if (data.tagName === 'svg') {
          data.setAttribute('x', xd);
          data.setAttribute('y', yd);
        } else {
          data.setAttribute('transform', 'translate(' + xd + ',' + yd + ')');
        }

        // Append the group to the SVG
        svg.appendChild(data);
      }

      return svg;
    }

    /**
     * Render the current scene and replace the given sphere meshes beforehand.
     */
    function renderSkeletonsSVG(sphereMeshes, bufferObjects, bufferCollections, asGroup)
    {
      // Hide spherical meshes of all given skeletons
      var sphereReplacemens = {};
      for (var skid in sphereMeshes) {
        var meshes = sphereMeshes[skid];
        var skeletonBufferObjects = bufferObjects[skid];
        var skeletonBuffers = bufferCollections[skid];
        setVisibility(meshes, false);
        setVisibility(skeletonBuffers, false);
        sphereReplacemens[skid] = addSphereReplacements(meshes, skeletonBufferObjects, self.space);
      }

      // Create a new SVG renderer (which is faster than cleaning an existing one)
      // and render the image
      var svgRenderer = self.createRenderer('svg');
      svgRenderer.clear();
      svgRenderer.render(self.space.scene, self.camera);

      // Show spherical meshes again and remove substitutes
      for (skid in sphereMeshes) {
        var mesh = sphereMeshes[skid];
        var buffers = bufferCollections[skid];
        removeSphereReplacements(sphereReplacemens[skid], self.space);
        setVisibility(mesh, true);
        setVisibility(buffers, true);
      }

      if (asGroup) {
        let g = document.createElementNS(svgNamespace, 'g');
        g.setAttribute('width', originalWidth);
        g.setAttribute('height', originalHeight);
        g.appendChild(svgImage);
        return g;
      } else {
        return svgRenderer.domElement;
      }
    }

    /**
     * Render the current scene as PNG and return it embedded in an SVG image
     * element.
     */
    function renderSkeletonsPNG(view, svgNamespace, width, height, asGroup) {
      let originalWidth = view.space.canvasWidth;
      let originalHeight = view.space.canvasHeight;
      let needsSizeReset = false;
      if (width !== originalWidth || height !== originalHeight) {
        needsSizeReset = true;
        view.space.setSize(width, height, view.space.options);
      }

      view.space.render();

      let imageData = view.space.view.getImageData('image/png');

      // Restore original dimensions
      if (needsSizeReset) {
        view.space.setSize(originalWidth, originalHeight, view.space.options);
        view.space.render();
      }

      // Emebed generated image in an SVG image element of the original size.
      let svgImage = document.createElementNS(svgNamespace, 'image');
      svgImage.setAttribute('width', originalWidth);
      svgImage.setAttribute('height', originalHeight);
      svgImage.setAttribute('visibility', 'visible');
      svgImage.setAttribute('xlink:href', imageData);

      if (asGroup) {
        let g = document.createElementNS(svgNamespace, 'g');
        g.setAttribute('width', originalWidth);
        g.setAttribute('height', originalHeight);
        g.appendChild(svgImage);
        return g;
      } else {
        let svg = document.createElementNS(svgNamespace, 'svg');
        svg.setAttribute('xmlns', svgNamespace);
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        svg.setAttribute('viewBox', [0, 0, originalWidth, originalHeight].join(' '));
        svg.setAttribute('width', originalWidth);
        svg.setAttribute('height', originalHeight);
        svg.appendChild(svgImage);
        return svg;
      }
    }
  };

  /**
   * Set camera position so that the whole XY side of the bounding box facing +Z
   * can just be seen.
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.XY = function() {
    var center = this.space.center,
        dimensions = this.space.dimensions,
        vFOV = this.camera.fov * Math.PI / 180,
        bbDistance;
    if (this.height > this.width) {
      var hFOV = 2 * Math.atan( Math.tan( vFOV * 0.5 ) * this.width / this.height );
      bbDistance = (dimensions.max.x - dimensions.min.x) * 0.5 / Math.tan(hFOV * 0.5);
    } else {
      bbDistance = (dimensions.max.y - dimensions.min.y) * 0.5 / Math.tan(vFOV * 0.5);
    }
    this.controls.target = center;
    this.camera.position.x = center.x;
    this.camera.position.y = center.y;
    this.camera.position.z = center.z - (dimensions.max.z / 2) - bbDistance;
    this.camera.up.set(0, -1, 0);
  };

  /**
   * Set camera position so that the whole XZ side of the bounding box facing +Y
   * can just be seen.
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.XZ = function() {
    var center = this.space.center,
        dimensions = this.space.dimensions,
        vFOV = this.camera.fov * Math.PI / 180,
        bbDistance;
    if (this.height > this.width) {
      var hFOV = 2 * Math.atan( Math.tan( vFOV * 0.5 ) * this.width / this.height );
      bbDistance = (dimensions.max.x - dimensions.min.x) * 0.5 / Math.tan(hFOV * 0.5);
    } else {
      bbDistance = (dimensions.max.z - dimensions.min.z) * 0.5 / Math.tan(vFOV * 0.5);
    }
    this.controls.target = center;
    this.camera.position.x = center.x;
    this.camera.position.y = center.y - (dimensions.max.y / 2) - bbDistance;
    this.camera.position.z = center.z;
    this.camera.up.set(0, 0, -1);
  };

  /**
   * Set camera position so that the whole ZY side of the bounding box facing +X
   * can just be seen.
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.ZY = function() {
    var center = this.space.center,
        dimensions = this.space.dimensions,
        vFOV = this.camera.fov * Math.PI / 180,
        bbDistance;
    if (this.height > this.width) {
      var hFOV = 2 * Math.atan( Math.tan( vFOV * 0.5 ) * this.width / this.height );
      bbDistance = (dimensions.max.z - dimensions.min.z) * 0.5 / Math.tan(hFOV * 0.5);
    } else {
      bbDistance = (dimensions.max.y - dimensions.min.y) * 0.5 / Math.tan(vFOV * 0.5);
    }
    this.controls.target = center;
    this.camera.position.x = center.x + (dimensions.max.x / 2) + bbDistance;
    this.camera.position.y = center.y;
    this.camera.position.z = center.z;
    this.camera.up.set(0, -1, 0);
  };

  /**
   * Set camera position so that the whole ZX side of the bounding box facing +Y
   * can just be seen.
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.ZX = function() {
    var center = this.space.center,
        dimensions = this.space.dimensions,
        vFOV = this.camera.fov * Math.PI / 180,
        bbDistance;
    if (this.height > this.width) {
      var hFOV = 2 * Math.atan( Math.tan( vFOV * 0.5 ) * this.width / this.height );
      bbDistance = (dimensions.max.z - dimensions.min.z) * 0.5 / Math.tan(hFOV * 0.5);
    } else {
      bbDistance = (dimensions.max.x - dimensions.min.x) * 0.5 / Math.tan(vFOV * 0.5);
    }
    this.controls.target = center;
    this.camera.position.x = center.x;
    this.camera.position.y = center.y - (dimensions.max.y / 2) - bbDistance;
    this.camera.position.z = center.z;
    this.camera.up.set(-1, 0, 0);
  };

  /**
   * Get properties of current view.
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.getView = function() {
    return {
      target: this.controls.target.clone(),
      position: this.camera.position.clone(),
      up: this.camera.up.clone(),
      zoom: this.camera.zoom,
      orthographic: this.camera.inOrthographicMode,
    };
  };

  /**
   * Set properties of current view.
   *
   * @param {THREE.Vector3} target - the target of the camera
   * @param {THREE.Vector3} position - the position of the camera
   * @param {THREE.Vector3} up - up direction
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.setView = function(target, position, up, zoom, orthographic) {
    this.controls.target.copy(target);
    this.camera.position.copy(position);
    this.camera.up.copy(up);
    this.camera.zoom = zoom;
    this.setCameraMode(orthographic);
  };

  /**
   * Make the camera act as a perspective or an orthographic camera.
   *
   * @param {Boolean} orthographic - use orthographic or perspective mode
   */
  WebGLApplication.prototype.Space.prototype.View.prototype.setCameraMode = (function() {
    // Store the original far plane distance of the perspective camera privately.
    var originalFarPlaneP;

    // If a logarithmic depth buffer is used, the perspective camera's far
    // clipping plane has to be changed while the camera is set to
    // orthographic mode. This is because the perspective camera's far
    // clipping plan is used to calculate the orthographic camera's view
    // (initially as well as for later updates like zoom. Unfortunately, we
    // can't use a closer far clipping with logarithmic depth buffers (or some
    // strange near field clipping is happening).
    return function(orthographic) {
      if(orthographic) {
        if (this.logDepthBuffer) {
          originalFarPlaneP = this.camera.cameraP.far;
          this.camera.cameraP.far = this.camera.cameraO.far;
        }
        this.logDepthBuffer = false;
        this.camera.toOrthographic();
      } else {
        if (this.logDepthBuffer && originalFarPlaneP) {
          this.camera.cameraP.far = originalFarPlaneP;
        }
        this.logDepthBuffer = true;
        this.camera.toPerspective();
      }
      // Since we use different depth buffer types for perspective and
      // orthographic mode, the rendeer has to be re-initialized.
      this.initRenderer(true);
    };
  })();

  /** Construct mouse controls as objects, so that no context is retained. */
  WebGLApplication.prototype.Space.prototype.View.prototype.MouseControls = function() {

    this.attach = function(view, domElement) {
      domElement.CATMAID_view = view;

      domElement.addEventListener('wheel', this.MouseWheel, false);
      domElement.addEventListener('mousemove', this.MouseMove, false);
      domElement.addEventListener('mouseup', this.MouseUp, false);
      domElement.addEventListener('mousedown', this.MouseDown, false);
    };

    this.detach = function(domElement) {
      domElement.CATMAID_view = null;
      delete domElement.CATMAID_view;

      domElement.removeEventListener('wheel', this.MouseWheel, false);
      domElement.removeEventListener('mousemove', this.MouseMove, false);
      domElement.removeEventListener('mouseup', this.MouseUp, false);
      domElement.removeEventListener('mousedown', this.MouseDown, false);

      Object.keys(this).forEach(function(key) { delete this[key]; }, this);
    };

    /**
     * Modifies the zoom (and therefore the effective focal length) of the camera.
     * If the Ctrl-key is pressed and the camera is not in orthographic mode, the
     * camera (and target) is moved instead.
     */
    this.MouseWheel = function(ev) {
      if (this.CATMAID_view.space.options.lock_view) return;

      var camera = this.CATMAID_view.camera;
      if ((ev.ctrlKey || ev.altKey) && !camera.inOrthographicMode) {
        // Move the camera and the target in target direction
        var absUpdateDistance = 3500;
        var movingForward = ev.wheelDelta > 0;
        var dirFactor = movingForward ? -1 : 1;
        var distance = absUpdateDistance * dirFactor;
        var controls = this.CATMAID_view.controls;
        var change = new THREE.Vector3().copy(camera.position)
          .sub(controls.target);

        // If the distance to the target is smaller than the distance the camera
        // should move toward the target and we are moving forward, update the
        // moving distance to be half the target distance.
        var camTargetDistance = change.length();
        if (camTargetDistance < absUpdateDistance && movingForward) {
          absUpdateDistance = camTargetDistance * 0.5;
          distance = absUpdateDistance * dirFactor;
          // And cancel the location update if we are closer than ten units
          // (arbitary close distance).
          if (camTargetDistance - absUpdateDistance < 10) {
            return;
          }
        }

        // Scale change vector into usable range
        change.normalize().multiplyScalar(distance);
        camera.position.add(change);

        // Move the target only if Alt was pressed
        if (ev.altKey) {
          controls.target.add(change);
        }
      } else {
        // The distance to the target does not make any difference for an
        // orthographic projection, the depth is fixed.
        var new_zoom = camera.zoom;
        if ((ev.deltaX + ev.deltaY) < 0) {
          new_zoom += 0.25;
        } else {
          new_zoom -= 0.25;
        }
        new_zoom = Math.max(new_zoom, 1.0);
        camera.setZoom( new_zoom );

        if (camera.inOrthographicMode) {
          this.CATMAID_view.space.scaleBar.update(
            this.CATMAID_view.space.canvasWidth / (camera.cameraO.right - camera.cameraO.left),
            this.CATMAID_view.space.canvasWidth / 5);
        }
      }

      this.CATMAID_view.space.render();
    };

    this.MouseMove = function(ev) {
      var mouse = this.CATMAID_view.mouse,
          space = this.CATMAID_view.space;
      if (!space.options.lock_view) {
        mouse.position.x =  ( ev.offsetX / space.canvasWidth  ) * 2 -1;
        mouse.position.y = -( ev.offsetY / space.canvasHeight ) * 2 +1;

        if (mouse.is_mouse_down) {
          space.render();
        }
      }

      // Use a cross hair cursor if shift is pressed
      if (ev.shiftKey) {
        space.container.style.cursor = "url(" + STATIC_URL_JS + "images/svg-circle.cur) 15 15, crosshair";
      } else {
        space.container.style.cursor = 'pointer';
      }
    };

    this.MouseUp = function(ev) {
      var mouse = this.CATMAID_view.mouse,
          controls = this.CATMAID_view.controls,
          space = this.CATMAID_view.space;
      if (space.options.lock_view) return;
      mouse.is_mouse_down = false;
      controls.enabled = true;
      space.render(); // May need another render on occasions
    };

    this.MouseDown = function(ev) {
      var mouse = this.CATMAID_view.mouse,
          space = this.CATMAID_view.space,
          camera = this.CATMAID_view.camera,
          projector = this.CATMAID_view.projector;
      if (!space.options.lock_view) {
        mouse.is_mouse_down = true;
      }
      if (!ev.shiftKey) return;

      // Try to pick a node using a color map. This option is more precise, but
      // also slower than casting a ray, which is not used anymore because
      // buffer geometries don't support it.
      var pickResult = space.pickNodeWithColorMap(ev.offsetX, ev.offsetY,
          mouse.position.x, mouse.position.y, camera);
      if (!pickResult) {
        CATMAID.msg("Oops", "Couldn't find any intersectable object under the mouse.");
      } else {
        if ('node' === pickResult.type) {
          SkeletonAnnotations.staticMoveToAndSelectNode(pickResult.id);
        } else if ('location' === pickResult.type) {
          var loc = pickResult.location;
          project.moveTo(loc.z, loc.y, loc.x);
        } else if ('skeleton' === pickResult.type) {
          var loc = pickResult.location;
          var move = project.moveTo(loc.z, loc.y, loc.x);

          if (pickResult.skeletonId) {
            move.then(function() {
              // Select node closest to edge in any of the open views
              var respectVirtualNodes = true;
              SkeletonAnnotations.staticMoveToAndSelectClosestNode(loc.z, loc.y, loc.x,
                  pickResult.skeletonId, respectVirtualNodes);
            });
          }
        }
      }
    };
  };

  var decodeFloat = (function() {
    var UINT8_VIEW = new Uint8Array(4);
    var FLOAT_VIEW = new Float32Array(UINT8_VIEW.buffer);

    return function (rgba) {
      UINT8_VIEW[0] = rgba[3];
      UINT8_VIEW[1] = rgba[2];
      UINT8_VIEW[2] = rgba[1];
      UINT8_VIEW[3] = rgba[0];
      return FLOAT_VIEW[0];
    };
  })();

  /**
   * Tries to pick an element by creating a color map.
   *
   * @param x First mouse position component, relativ to WebGL canvas
   * @param y First mouse position component, relativ to WebGL canvas
   * @param xs First mouse position component, normalized screen scape [-1, 1]
   * @param ys First mouse position component, normalized screen scape [-1, 1]
   * @param camera The camera the picking map should be created with
   * @param savePickingMap Export the picking color map as PNG image
   * @return the picked node's ID or null if no node was found
   */
  WebGLApplication.prototype.Space.prototype.pickNodeWithColorMap =
      function(x, y, xs, ys, camera, savePickingMap) {
    var savePosTexture = false;
    var color = 0;
    var idMap = {};
    var skeletonIdMap = {};
    var skeletonMap = {};
    var submit = new CATMAID.submitterFn();
    var originalMaterials = new Map();
    var originalVisibility = {};
    var originalConnectorPreVisibility =
      this.staticContent.connectorLineColors.presynaptic_to.visible;
    var originalConnectorPostVisibility =
      this.staticContent.connectorLineColors.postsynaptic_to.visible;

    // Hide everthing unpickable
    var o = CATMAID.tools.deepCopy(this.options);
    o.show_missing_sections = false;
    o.show_active_node = false;
    o.show_floor = false;
    o.background_color = '#FFFFFF';
    o.show_box = false;
    this.staticContent.adjust(o, this);
    this.content.adjust(o, this, submit);
    // Hide pre and post synaptic flags
    this.staticContent.connectorLineColors.presynaptic_to.visible = false;
    this.staticContent.connectorLineColors.postsynaptic_to.visible = false;

    // Disable lighting and add plain ambient light
    var lightVisMap = this.lights.map(function(l) {
      var visible = l.visible;
      l.visible = false;
      return visible;
    });

    var ambientLight = new THREE.AmbientLight(0xffffff);
    this.scene.project.add(ambientLight);

    // Hide volumes if they aren't include in picking
    let originalVolumeVisibility = new Map();
    if (!o.volume_location_picking) {
      for (let volumeId of this.loadedVolumes.keys()) {
        let volume = this.loadedVolumes.get(volumeId);
        for (let i=0; i<volume.meshes.length; ++i) {
          let m = volume.meshes[i].material;
          originalVolumeVisibility.set(volumeId, m.visible);
          m.visible = false;
        }
      }
    }

    // Prepare all spheres for picking by coloring them with an ID.
    mapToPickables(this, this.content.skeletons, function(skeleton) {
      color++;
      var skeletonProperties = {
        id: skeleton.id
      };
      originalVisibility[skeleton.id] = skeleton.actor.neurite.visible;
      skeletonIdMap[color] = skeletonProperties;
      skeletonMap[skeleton.id] = skeletonProperties;

      var skeletonColor = new THREE.Color(color);

      // Re-color skeletons
      skeletonProperties.vertexColors = skeleton.line_material.vertexColors;
      skeletonProperties.actorColor = skeleton.actor['neurite'].material.color;
      skeletonProperties.opacity = skeleton.actor['neurite'].material.opacity;
      skeletonProperties.transparent = skeleton.actor['neurite'].material.transparent;
      skeletonProperties.vertexShader = skeleton.line_material.vertexShader;
      skeletonProperties.fragmentShader = skeleton.line_material.fragmentShader;

      skeleton.line_material.vertexColors = THREE.NoColors;
      skeleton.line_material.needsUpdate = true;

      skeleton.actor['neurite'].material.color = skeletonColor;
      skeleton.actor['neurite'].material.opacity = 1.0;
      skeleton.actor['neurite'].material.transparent = false;
      skeleton.actor['neurite'].material.needsUpdate = true;
    }, function(id, obj, isBuffer) {
      // IDs are expected to be 64 (bigint in Postgres) and can't be mapped to
      // colors directly. Since the space we are looking here at is likely to be
      // smaller, we can map colors to IDs ourself.
      color++;
      idMap[color] = id;
      if (isBuffer) {
        originalMaterials.set(obj, [obj.color, obj.alpha]);
        obj.color = new THREE.Color(color);
        obj.alpha = 1.0;
      } else {
        originalMaterials.set(obj, obj.material);
        obj.material = new THREE.MeshBasicMaterial({
          color: color,
          side: THREE.DoubleSide
        });
      }
    });

    // Prepare first Z plane for picking (the z plane for the primary stack), if
    // visible.
    var zplane = this.staticContent.zplane;
    if (o.show_zplane && zplane) {
      color++;
      idMap[color] = 'zplane';
      originalMaterials.set(zplane, zplane.material);
      zplane.material = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide
      });
    }

    // Render scene to picking texture
    var gl = this.view.renderer.getContext();

    // Find clicked skeleton color
    var pixelBuffer = new Uint8Array(4);

    //this.view.renderer.setRenderTarget(null);
    this.view.renderer.setRenderTarget(this.pickingTexture);
    this.view.renderer.render(this.scene, camera);

    gl.readPixels(x, this.pickingTexture.height - y, 1, 1, gl.RGBA,
        gl.UNSIGNED_BYTE, pixelBuffer);
    var colorId = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2]);

    // Nothing has been found if color Id is zero, try to look at neighboring
    // pixels, take first in surrounding 9x9 block.
    var offsetX = 0;
    var offsetY = 0;
    if (0 === colorId) {
        var retry = 0;
        var offsets = [[0,1], [1,1], [1,0], [1,-1], [0,-1], [-1,-1], [-1,0]];
        while (retry <  offsets.length) {
          var o = offsets[retry];
          var xq = x + o[0];
          var yq = y + o[1];
          if ((xq < 0 || xq >= this.pickingTexture.width) ||
              (yq < 0 || yq >= this.pickingTexture.height)) {
            continue;
          }

          gl.readPixels(xq, this.pickingTexture.height - yq, 1, 1, gl.RGBA,
              gl.UNSIGNED_BYTE, pixelBuffer);
          colorId = (pixelBuffer[0] << 16) | (pixelBuffer[1] << 8) | (pixelBuffer[2]);

          if (0 !== colorId) {
            offsetX = o[0];
            offsetY = 0[1];
            break;
          }
          ++retry;
        }
    }

    // If wanted, the picking map can be exported
    if (savePickingMap) {
      var img = CATMAID.tools.createImageFromGlContext(gl,
          this.pickingTexture.width, this.pickingTexture.height);
      var blob = CATMAID.tools.dataURItoBlob(img.src);
      CATMAID.FileExporter.saveAs(blob, "pickingmap.png");
    }

    // If no color ID has been found so far, we didn't hit anything.
    if (0 !== colorId) {
      // Find world location of clicked fragment
      var originalOverrideMaterial = this.scene.overrideMaterial;
      var originalShaders = new Map();
      let skeletons = this.content.skeletons;
      if (o.triangulated_lines) {
        for (let skeletonId in skeletons) {
          let skeleton = skeletons[skeletonId];
          originalShaders.set(skeleton.id, {
            vertexShader: skeleton.line_material.vertexShader,
            fragmentShader: skeleton.line_material.fragmentShader,
            skeleton: skeleton
          });
        }
      }

      // Get clicked fragment position
      var position = ["x", "y", "z"].map(function(c) {

        // In the case of buffer geometries (which are used by triangulated
        // lines), we can't use a generic override material, because the rending
        // really depends on the shader implementation.
        var postMaterial;
        if (o.triangulated_lines) {
          // Iterate over all skeletons and slighly adjust shader programs to
          // render 3D location information. An override material doesn't work,
          // because buffer geometries are in use (which store vertices as part
          // of the material.
          for (let skeletonData of originalShaders.values()) {
            let newVertexShader = skeletonData.vertexShader;
            newVertexShader = CATMAID.insertSnippetIntoShader(newVertexShader,
                CATMAID.PickingLineMaterial.INSERTION_LOCATIONS['vertexDeclarations'],
                'varying vec4 worldPosition;\n');
            newVertexShader = CATMAID.insertSnippetIntoShader(newVertexShader,
                CATMAID.PickingLineMaterial.INSERTION_LOCATIONS['vertexEnd'],
                'worldPosition = modelMatrix * vec4(instanceStart, 1.0);\n');

            let newFragmentShader = skeletonData.fragmentShader;
            newFragmentShader = CATMAID.insertSnippetIntoShader(newFragmentShader,
                CATMAID.PickingLineMaterial.INSERTION_LOCATIONS['fragmentDeclarations'],
                [
                  'varying vec4 worldPosition;',
                  CATMAID.ShaderLib.encodeFloat,
                  '\n'
                ].join('\n'));
            newFragmentShader = CATMAID.insertSnippetIntoShader(newFragmentShader,
                CATMAID.PickingLineMaterial.INSERTION_LOCATIONS['fragmentEnd'],
                'gl_FragColor = encode_float(worldPosition.' + c + ');\n');

            //postMaterial.addUniforms({
            //  cameraNear: { value: camera.near },
            //  cameraFar:  { value: camera.far },
            //});
            let skeleton = skeletonData.skeleton;
            skeleton.line_material.vertexShader = newVertexShader;
            skeleton.line_material.fragmentShader = newFragmentShader;
            skeleton.line_material.needsUpdate = true;
          }

          // The render target is still this.pickingTexture
          this.view.renderer.render(this.scene, camera);
        } else {
          postMaterial = new CATMAID.SimplePickingMaterial({
            cameraNear: camera.near,
            cameraFar:  camera.far,
            direction: c,
            // TODO: Has no effect on windows systems, due to ANGLE limitations,
            // see: https://threejs.org/docs/api/materials/ShaderMaterial.html
            linewidth: o.skeleton_line_width,
          });

          // Override material with custom shaders
          this.scene.overrideMaterial = postMaterial;

          // The render target is still this.pickingTexture
          this.view.renderer.render(this.scene, camera);
        }

        // Read pixel under cursor
        gl.readPixels(x + offsetX, this.pickingTexture.height - y + offsetY,
            1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);

        if (savePosTexture) {
          var img = CATMAID.tools.createImageFromGlContext(gl,
              this.pickingTexture.width, this.pickingTexture.height);
          var blob = CATMAID.tools.dataURItoBlob(img.src);
          CATMAID.FileExporter.saveAs(blob, "pos-tex-" + c + ".png");
        }

        // Map RGBA value to decoded float
        return decodeFloat(pixelBuffer);
      }, this);
    }

    if (o.triangulated_lines) {
      // Reset overwritten shaders
      for (let skeletonData of originalShaders.values()) {
        let skeleton = skeletonData.skeleton;
        skeleton.line_material.vertexShader = skeletonData.vertexShader;
        skeleton.line_material.fragmentShader = skeletonData.fragmentShader;
        skeleton.line_material.needsUpdate = true;
      }
    } else {
      // Reset override material to original state
      this.scene.overrideMaterial = originalOverrideMaterial;
    }

    // Reset materials
    mapToPickables(this, this.content.skeletons, function(skeleton) {
      skeleton.actor.neurite.visible = originalVisibility[skeleton.id];
      var skeletonProperties = skeletonMap[skeleton.id];
      if (skeletonProperties) {
        skeleton.line_material.vertexColors = skeletonProperties.vertexColors;
        skeleton.actor['neurite'].material.color = skeletonProperties.actorColor;
        skeleton.actor['neurite'].material.opacity = skeletonProperties.opacity;
        skeleton.actor['neurite'].material.transparent = skeletonProperties.transparent;

        skeleton.line_material.needsUpdate = true;
        skeleton.actor['neurite'].material.needsUpdate = true;
      }
    }, function(id, obj, isBuffer) {
      if (isBuffer) {
        var material = originalMaterials.get(obj);
        obj.color = material[0];
        obj.alpha = material[1];
      } else {
        obj.material = originalMaterials.get(obj);
      }
    });

    // Reset Z plane material and visibility
    if (o.show_zplane && zplane) {
      zplane.material = originalMaterials.get(zplane);
    }

    // Reset volumes to original visibility
    if (!o.volume_location_picking) {
      for (let volumeId of this.loadedVolumes.keys()) {
        let volume = this.loadedVolumes.get(volumeId);
        for (let i=0; i<volume.meshes.length; ++i) {
          volume.meshes[i].material.visible = originalVolumeVisibility.get(volumeId);
        }
      }
    }

    // Reset lighting, assuming no change in position
    this.scene.project.remove(ambientLight);
    this.lights.forEach(function(l, i) {
      l.visible = this[i];
    }, lightVisMap);

    // Reset visibility of unpickable things
    this.staticContent.adjust(this.options, this);
    this.content.adjust(this.options, this, submit);
    // Restore original pre and post synaptic visibility
    this.staticContent.connectorLineColors.presynaptic_to.visible =
      originalConnectorPreVisibility;
    this.staticContent.connectorLineColors.postsynaptic_to.visible =
      originalConnectorPostVisibility;

    // If no color ID was found, no element was hit.
    if (colorId === 0) {
      return null;
    }

    // Handle results
    var id = idMap[colorId];
    var skeleton = skeletonIdMap[colorId];
    var skeletonId = skeleton ? skeleton.id : null;

    // Check if a skeleton was found
    if (!id && !Number.isNaN(position[0]) &&
               !Number.isNaN(position[1]) &&
               !Number.isNaN(position[2])) {
      id = 'skeleton';
    }

    // Re-render scene to apply reset environment.
    this.view.renderer.setRenderTarget(null);
    this.view.renderer.render(this.scene, camera);

    if (!id) {
      return null;
    } else {
      if ('zplane' === id) {
        // Intersect ray with z plane to get location
        var intersection = this.getIntersectionWithRay(xs, ys, x, camera, [zplane]);
        if (intersection) {
          return {
            type: 'location',
            location: {
              x: Math.round(intersection.point.x),
              y: Math.round(intersection.point.y),
              z: Math.round(intersection.point.z)
            }
          };
        } else {
          return null;
        }
      } else if ('skeleton' === id) {
        return {
          type: 'skeleton',
          skeletonId: skeletonId,
          location: {
            x: Math.round(position[0]),
            y: Math.round(position[1]),
            z: Math.round(position[2])
          }
        };
      } else {
        return {
          type: 'node',
          id: id
        };
      }
    }

    /**
     * Execute a function for every skeleton and one for each of its pickable
     * elements (defined in fields).
     */
    function mapToPickables(space, skeletons, fnSkeleton, fnPickable) {
      var fields = ['radiusVolumes'];
      Object.keys(skeletons).forEach(function(skeleton_id) {
        var skeleton = skeletons[skeleton_id];
        fnSkeleton(skeleton);
        // Regular mesh fields
        fields.map(function(field) {
          return skeleton[field];
        }).forEach(function(spheres) {
          Object.keys(spheres).forEach(function(id) {
            fnPickable(id, spheres[id], false);
          });
        });
        // Buffer geometry
        var connectorSpheres = skeleton['synapticSpheres'];
        for (var id in connectorSpheres) {
          fnPickable(id, connectorSpheres[id], true);
        }
        var tagSpheres = skeleton['specialTagSpheres'];
        for (var id in tagSpheres) {
          fnPickable(id, tagSpheres[id], true);
        }
      });

    }
  };

  /**
   * Attempt to intersect passed in objects using raycasting, stopping at the
   * first found intersection.
   */
  WebGLApplication.prototype.Space.prototype.getIntersectionWithRay = function(x, y, xOffset, camera, objects) {
    // Step, which is normalized screen coordinates, is choosen so that it will
    // span half a pixel width in screen space.
    var adjPxNSC = ((xOffset + 1) / this.canvasWidth) * 2 - 1;
    var step = 0.5 * Math.abs(x - adjPxNSC);
    var increments = 1;

    // Setup ray caster
    var raycaster = new THREE.Raycaster();
    var setupRay = (function(raycaster, camera) {
      if (camera.inPerspectiveMode) {
        raycaster.ray.origin.copy(camera.position);
        //raycaster.ray.origin.set(0, 0, 0).unproject(camera);
        return function(x,y) {
          raycaster.ray.direction.set(x, y, -1).unproject(camera).sub(camera.position).normalize();
        };
      } else {
        raycaster.ray.direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
        return function(x, y) {
          raycaster.ray.origin.set(x, y, -1 ).unproject(camera);
        };
      }
    })(raycaster, camera);

    // Iterate over all objects and find the ones that are intersected
    var intersection = null;
    var intersectionFound = objects.some(function(object) {
      if (!object.visible) return false;
      intersection = intersect([object], x, y, step, increments, raycaster, setupRay);
      return intersection !== null;
    });

    return intersection;

    /**
     * Returns if a ray shot through X/Y (in normalized screen coordinates
     * [-1,1]) inersects at least one of the intersectable objects. If no
     * intersection is found for the click position, concentric circles are
     * created and rays are shoot along it. These circles are enlarged in every
     * iteration by <step> until a maximum of <increment> circles was tested or
     * an intersection was found. Every two circles, the radius is enlarged by
     * one screen space pixel.
     */
    function intersect(objects, x, y, step, increments, raycaster, setupRay)
    {
      var found = false;
      var intersection = null;
      for (var i=0; i<=increments; ++i) {
        var numRays = i ? 4 * i : 1;
        var a = 2 * Math.PI / numRays;
        for (var j=0; j<numRays; ++j) {
          setupRay(x + i * step * Math.cos(j * a),
                   y + i * step * Math.sin(j * a));

          // Test intersection
          var intersects = raycaster.intersectObjects(objects);
          if (intersects.length > 0) {
            found = objects.some(function(object) {
              if (object.id !== intersects[0].object.id) return false;
              intersection = intersects[0];
              return true;
            });
          }

          if (found) {
            break;
          }
        }
        if (found) {
          break;
        }
      }

      return intersection;
    }
  };

  WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode = function(options) {
    this.skeleton_id = null;
    this.mesh = new THREE.Mesh( new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial( { color: 0x00ff00, opacity:0.8, transparent:true } ) );
    CATMAID.tools.setXYZ(this.mesh.scale, options.skeleton_node_scaling);
  };

  WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode.prototype = {};

  WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode.prototype.setVisible = function(visible) {
    this.mesh.visible = visible ? true : false;
  };

  WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode.prototype.updatePosition = function(space, options) {
    var pos = SkeletonAnnotations.getActiveNodePositionW();
    if (!pos) {
      space.updateSplitShading(this.skeleton_id, null, options);
      this.skeleton_id = null;
      return;
    }

    var skeleton_id = SkeletonAnnotations.getActiveSkeletonId();
    space.updateSplitShading(this.skeleton_id, skeleton_id, options);
    this.skeleton_id = skeleton_id;

    this.mesh.position.set(pos.x, pos.y, pos.z);

    var radius = SkeletonAnnotations.getActiveNodeRadius();
    if (radius && radius > 0 && options.active_node_respects_radius) {
      radius = 1.5 * radius;
    } else {
      radius = 40 * options.skeleton_node_scaling;
    }
    this.mesh.scale.setScalar(radius);
  };

  WebGLApplication.prototype.Space.prototype.updateSkeleton =
      function(skeletonModel, json, options, with_history, nodeWhitelist) {

    var skeleton = this.content.skeletons[skeletonModel.id];
    if (!skeleton) {
      skeleton = new this.Skeleton(this, skeletonModel);
      this.content.skeletons[skeletonModel.id] = skeleton;
    }
    skeleton.loadJson(skeletonModel, json, options, with_history, nodeWhitelist);

    return skeleton;
  };

  /** An object to represent a skeleton in the WebGL space.
   *  The skeleton consists of three geometries:
   *    (1) one for the edges between nodes, represented as a list of contiguous pairs of points;
   *    (2) one for the edges representing presynaptic relations to connectors;
   *    (3) one for the edges representing postsynaptic relations to connectors.
   *  Each geometry has its own mesh material and can be switched independently.
   *  In addition, each skeleton node with a pre- or postsynaptic relation to a connector
   *  gets a clickable sphere to represent it.
   *  Nodes matching a custom tag filter or with an 'uncertain' or 'todo' in their
   *  text tags also get a sphere.
   *
   *  When visualizing only the connectors among the skeletons visible in the
   *  WebGL space, the geometries of the pre- and postsynaptic edges are hidden
   *  away, and a new pair of geometries are created to represent just the edges
   *  that converge onto connectors also related to by the other skeletons.
   *
   */
  WebGLApplication.prototype.Space.prototype.Skeleton = function(space, skeletonmodel) {
    // TODO id, baseName, actorColor are all redundant with the skeletonmodel
    this.space = space;
    this.id = skeletonmodel.id;
    this.baseName = skeletonmodel.baseName;
    this.synapticColors = space.staticContent.synapticColors;
    this.skeletonmodel = skeletonmodel;
    this.opacity = skeletonmodel.opacity;
    // This is an index mapping treenode IDs to lists of [reviewer_id,
    // review_time].  Attaching them directly to the nodes is too much of a
    // performance hit.  Gets loaded dynamically, and erased when refreshing
    // (because a new Skeleton is instantiated with the same model).
    this.reviews = null;
    // The arbor of the axon, as computed by splitByFlowCentrality. Loaded
    // dynamically, and erased when refreshing like this.reviews.
    this.axon = null;
    // Optional history information
    this.history = null;
    // A later set flag if lines are renderd as meshes
    this.triangulated_lines = false;
    // Keep track of node meta data like node IDs in a list ordered the same way
    // as skeleton nodes.
    this.nodeMetaData = null;
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype = {};

  // Find better way to define connector types
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.CTYPES = ['neurite', 'presynaptic_to', 'postsynaptic_to', 'gapjunction_with'];
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.synapticTypes = ['presynaptic_to', 'postsynaptic_to', 'gapjunction_with'];
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.synapticTypesToModelVisibility = {
    'presynaptic_to': 'pre_visible',
    'postsynaptic_to': 'post_visible'
  };
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.modelVisibilityToSynapticType = {
    'presynaptic_to': 'pre_visible',
    'postsynaptic_to': 'post_visible'
  };


  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.initialize_objects =
      function(options) {
    this.visible = true;
    if (undefined === this.skeletonmodel) {
      console.log('Can not initialize skeleton object');
      return;
    }
    this.triangulated_lines = options.triangulated_lines;

    this.actorColor = this.skeletonmodel.color.clone();
    var CTYPES = this.CTYPES;

    if (options.triangulated_lines) {
      this.line_material = new THREE.LineMaterial({
        color: 0xffff00,
        linewidth: options.skeleton_line_width,
        resolution: new THREE.Vector2(this.space.canvasWidth, this.space.canvasHeight)
      });
      this.line_material.uniforms.resolution.needsUpdate = true;
    } else {
      this.line_material = new THREE.LineBasicMaterial({
        color: 0xffff00,
        opacity: 1.0,
        linewidth: options.skeleton_line_width
      });
    }

    // Optional override material for a particular skeleton
    this.overrideMaterial = null;

    var GeometryType = options.triangulated_lines ?
          THREE.LineSegmentsGeometry : THREE.Geometry;

    // Connector links
    this.geometry = {};
    this.geometry[CTYPES[0]] = new GeometryType();
    this.geometry[CTYPES[1]] = new THREE.Geometry();
    this.geometry[CTYPES[2]] = new THREE.Geometry();
    this.geometry[CTYPES[3]] = new THREE.Geometry();

    var MeshType = options.triangulated_lines ?
          THREE.LineSegments2 : THREE.LineSegments;

    this.actor = {}; // has three keys (the CTYPES), each key contains the edges of each type
    this.actor[CTYPES[0]] = new MeshType(this.geometry[CTYPES[0]], this.line_material);
    this.actor[CTYPES[1]] = new THREE.LineSegments(this.geometry[CTYPES[1]], this.space.staticContent.connectorLineColors[CTYPES[1]]);
    this.actor[CTYPES[2]] = new THREE.LineSegments(this.geometry[CTYPES[2]], this.space.staticContent.connectorLineColors[CTYPES[2]]);
    this.actor[CTYPES[3]] = new THREE.LineSegments(this.geometry[CTYPES[3]], this.space.staticContent.connectorLineColors[CTYPES[3]]);

    this.specialTagSpheres = {};
    this.synapticSpheres = {};
    this.radiusVolumes = {}; // contains spheres and cylinders
    this.textlabels = {};

    // Visibility of connector types, read known model fields from model
    this.connectorVisibility = CTYPES.reduce((function(o, t) {
      var mapping = this.synapticTypesToModelVisibility[t];
      o[t] = mapping ? this.skeletonmodel[mapping] : true;
      return o;
    }).bind(this), {});

    // Used only with restricted connectors
    this.connectoractor = null;
    this.connectorgeometry = {};
    this.connectorSelection = null;
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.getBoundingBox = function() {
    let geometry = this.geometry['neurite'];
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    return geometry.boundingBox;
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.getVertexCount = function() {
    let geometry = this.geometry['neurite'];
    if (geometry.isBufferGeometry) {
      var start = geometry.attributes.instanceStart;
      return start.data.count;
    } else {
      return geometry.vertices.length;
    }
  };

  /**
   * The functionality of Array.some() for skeleton nodes.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.someVertex = function(f) {
    let geometry = this.geometry['neurite'];
    if (geometry.isBufferGeometry) {
        // Test each vertex
        var start = geometry.attributes.instanceStart;
        let pos = new THREE.Vector3();
        for (var i = 0, imax = start.count; i < imax; ++i) {
          pos.fromBufferAttribute(start, i);
          if (f(pos)) {
            return true;
          }
        }
    } else {
      return geometry['neurite'].vertices.some(f);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.destroy = function(collection) {
    this.removeActorFromScene(collection);
    [this.actor, this.geometry, this.connectorgeometry, this.connectoractor,
     this.connectorSelection, this.specialTagSpheres, this.synapticSpheres,
     this.radiusVolumes, this.textlabels].forEach(function(ob) {
       if (ob) {
         for (var key in ob) {
          if (ob.hasOwnProperty(key)) delete ob[key];
         }
       }
    });
  };

  /**
   * Dispose the skeleton's geometry and material, the connector geometry
   * (connector material is shared) and remove all actor and spehere meshes from
   * the scene. If @collection is given it is expected to be an array and meshes
   * won't be removed, but added to it. It is then the responsibiliy of the
   * caller to remove the objects from the scene.
   *
   * @param collection Optional array to collect meshes to be removed
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.removeActorFromScene = function(collection) {
    if (!this.actor) {
      return;
    }

    // Dispose of both geometry and material, unique to this Skeleton
    this.actor[this.CTYPES[0]].geometry.dispose();
    this.actor[this.CTYPES[0]].material.dispose();

    // Dispose only of the geometries. Materials for connectors are shared
    this.actor[this.CTYPES[1]].geometry.dispose();
    this.actor[this.CTYPES[2]].geometry.dispose();
    this.actor[this.CTYPES[3]].geometry.dispose();

    var meshes = collection || [];
    [this.actor, this.radiusVolumes].forEach(function(ob) {
      if (ob) {
        for (var key in ob) {
          if (ob.hasOwnProperty(key)) this.push(ob[key]);
        }
      }
    }, meshes);

    if (this.connectorSphereCollection) {
      this.connectorSphereCollection.geometry.dispose();
      this.connectorSphereCollection.geometry = null;
      this.connectorSphereCollection.material.dispose();
      this.connectorSphereCollection.material = null;
      meshes.push(this.connectorSphereCollection);
      this.connectorSphereCollection = null;
    }

    if (this.specialTagSphereCollection) {
      this.specialTagSphereCollection.geometry.dispose();
      this.specialTagSphereCollection.geometry = null;
      this.specialTagSphereCollection.material.dispose();
      this.specialTagSphereCollection.material = null;
      meshes.push(this.specialTagSphereCollection);
      this.specialTagSphereCollection = null;
    }

    // If no collection was given, remove objects right away
    if (!collection) {
      this.space.removeAll(meshes);
    }

    this.remove_connector_selection();
    this.removeTextMeshes();
  };

  /** Set the visibility of the skeleton, radius spheres and label spheres. Does not set the visibility of the synaptic spheres or edges. */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setActorVisibility = function(vis) {
    this.visible = vis;
    this.visibilityCompositeActor('neurite', vis);

    // radiusVolumes: the spheres where nodes have a radius larger than zero
    // specialTagSpheres: the spheres at special tags like 'TODO', 'Uncertain end', etc.
    [this.radiusVolumes, this.specialTagSpheres].forEach(function(ob) {
      for (var idx in ob) {
        if (ob.hasOwnProperty(idx)) ob[idx].visible = vis;
      }
    });
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.updateConnectorVisibilities = function() {
    for (var type in this.connectorVisibility) {
      var visible = this.connectorVisibility[type];
      this.updateConnectorVisibility(type, visible);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.updateConnectorVisibility = function(type, visible) {
    this.visibilityCompositeActor(type, visible);

    for (var idx in this.synapticSpheres) {
      if (this.synapticSpheres.hasOwnProperty(idx)
       && this.synapticSpheres[idx].type === type) {
        this.synapticSpheres[idx].visible = visible;
      }
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.updateConnectorRestictionVisibilities = function() {
    for (var type in this.connectorVisibility) {
      var visible = this.connectorVisibility[type];
      this.updateConnectorRestictionVisibility(type, visible);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.updateConnectorRestictionVisibility = function(type, visible) {
    if (this.connectorSelection) {
      this.synapticTypes.forEach(function(t) {
        if (t !== type) {
          return;
        }
        var selection = this.connectorSelection[type];
        if (selection) {
          //selection.mesh.geometry.visible = visible;
          //selection.mesh.visible = visible;
          //selection.mesh.needsUpdate = true;
          for (var nodeId in selection.objects) {
            selection.objects[nodeId].visible = visible;
          }
        }
      }, this);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setSynapticVisibilityFn = function(type) {
    return function(vis, temporary) {
      if (!temporary) {
        this.connectorVisibility[type] = vis;
      }
      if (this.connectorSelection && this.connectoractor) {
        this.updateConnectorRestictionVisibility(type, vis);
      } else {
        this.updateConnectorVisibility(type, vis);
      }
    };
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setPreVisibility = WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setSynapticVisibilityFn('presynaptic_to');

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setPostVisibility = WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setSynapticVisibilityFn('postsynaptic_to');

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setMetaVisibility = function(vis) {
    for (var idx in this.specialTagSpheres) {
      if (this.specialTagSpheres.hasOwnProperty(idx)) {
        this.specialTagSpheres[idx].visible = vis;
      }
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createTextMeshes = function() {
    // Sort out tags by node: some nodes may have more than one
    var nodeIDTags = {};
    let taggedNodeIds = new Set();
    for (var tag in this.tags) {
      if (this.tags.hasOwnProperty(tag)) {
        this.tags[tag].forEach(function(nodeID) {
          if (nodeIDTags.hasOwnProperty(nodeID)) {
            nodeIDTags[nodeID].push(tag);
          } else {
            nodeIDTags[nodeID] = [tag];
          }
          taggedNodeIds.add(nodeID);
        });
      }
    }

    // Sort and convert to string the array of tags of each node
    for (var nodeID in nodeIDTags) {
      if (nodeIDTags.hasOwnProperty(nodeID)) {
        nodeIDTags[nodeID] = nodeIDTags[nodeID].sort().join();
      }
    }

    // Group nodes by common tag string
    var tagNodes = {};
    for (var nodeID in nodeIDTags) {
      if (nodeIDTags.hasOwnProperty(nodeID)) {
        var tagString = nodeIDTags[nodeID];
        if (tagNodes.hasOwnProperty(tagString)) {
          tagNodes[tagString].push(nodeID);
        } else {
          tagNodes[tagString] = [nodeID];
        }
      }
    }

    // Find Vector3 of tagged nodes
    var vs = this.getPositions(taggedNodeIds);

    // Create meshes for the tags for all nodes that need them, reusing the geometries
    var cache = this.space.staticContent.textGeometryCache,
        textMaterial = this.space.staticContent.textMaterial;

    var addNode = function(nodeID, text) {
      var v = vs[nodeID];
      text.position.x = v.x;
      text.position.y = v.y;
      text.position.z = v.z;
      this.textlabels[nodeID] = text;
      this.space.add(text);
    };

    for (var tagString in tagNodes) {
      if (tagNodes.hasOwnProperty(tagString)) {
        tagNodes[tagString].forEach(function(nodeID) {
          cache.createTextMesh(tagString, textMaterial,
              addNode.bind(this, nodeID));
        }, this);
      }
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.removeTextMeshes = function() {
    var cache = this.space.staticContent.textGeometryCache;
    for (var k in this.textlabels) {
      if (this.textlabels.hasOwnProperty(k)) {
        this.space.remove(this.textlabels[k]);
        cache.releaseTagGeometry(this.textlabels[k].tagString);
        delete this.textlabels[k];
      }
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setTextVisibility = function( vis ) {
    // Create text meshes if not there, or destroy them if to be hidden
    if (vis && 0 === Object.keys(this.textlabels).length) {
      this.createTextMeshes();
    } else if (!vis) {
      this.removeTextMeshes();
    }
  };

  /* Unused
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.translate = function( dx, dy, dz ) {
    for ( var i=0; i<CTYPES.length; ++i ) {
      if( dx ) {
        this.actor[CTYPES[i]].translateX( dx );
      }
      if( dy ) {
        this.actor[CTYPES[i]].translateY( dy );
      }
      if( dz ) {
        this.actor[CTYPES[i]].translateZ( dz );
      }
    }
  };
  */

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createSynapseCounts = function() {
    return this.synapticTypes.reduce((function(o, type, k) {
      var vs = this.geometry[type].vertices;
      for (var i=0, l=vs.length; i<l; i+=2) {
        var treenode_id = vs[i].treenode_id,
            count = o[treenode_id];
        if (count) o[treenode_id] = count + 1;
        else o[treenode_id] = 1;
      }
      return o;
    }).bind(this), {});
  };

  /** Return a map with 4 elements:
   * {presynaptic_to: {}, // map of node ID vs count of presynaptic sites
   *  postsynaptic_to: {}, // map of node ID vs count of postsynaptic sites
   *  presynaptic_to_count: N,
   *  postsynaptic_to_count: M} */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createPrePostCounts = function() {
    return this.synapticTypes.reduce((function(o, type, k) {
      var vs = this.geometry[type].vertices,
          syn = {};
      for (var i=0, l=vs.length; i<l; i+=2) {
        var treenode_id = vs[i].treenode_id,
            count = syn[treenode_id];
        if (count) syn[treenode_id] = count + 1;
        else syn[treenode_id] = 1;
      }
      o[type] = syn;
      o[type + "_count"] = vs.length / 2;
      return o;
    }).bind(this), {});
  };

  /** Returns a map of treenode ID keys and lists of {type, connectorID} as values,
   * where type 0 is presynaptic and type 1 is postsynaptic. */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createSynapseMap = function() {
    return this.synapticTypes.reduce((function(o, type, k) {
      var vs = this.geometry[type].vertices;
      for (var i=0, l=vs.length; i<l; i+=2) {
        var connector_id = vs[i].node_id,
            treenode_id = vs[i].treenode_id,
            list = o[treenode_id],
            synapse = {type: k,
                       connector_id: connector_id};
        if (list) list.push(synapse);
        else o[treenode_id] = [synapse];
      }
      return o;
    }).bind(this), {});
  };

  /** Returns a map of connector ID keys and a list of treenode ID values.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createInverseSynapseMap = function() {
    return this.synapticTypes.reduce((function(o, type) {
      var vs = this.geometry[type].vertices;
      for (var i=0, l=vs.length; i<l; i+=2) {
        var connector_id = vs[i].node_id,
            treenode_id = vs[i].treenode_id,
            list = o[connector_id];
        if (list) {
          list.push(connector_id);
        } else {
          o[connector_id] = [treenode_id];
        }
      }
      return o;
    }).bind(this), {});
  };

  /** Return a map of node ID vs map of tag vs true. */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createTagMap = function() {
    var map = {};
    Object.keys(this.tags).forEach(function(tag) {
      this.tags[tag].forEach(function(node) {
        var o = map[node];
        if (o) o[tag] = true;
        else {
          o = {};
          o[tag] = true;
          map[node] = o;
        }
      }, this);
    }, this);
    return map;
  };

  /** For skeletons with a single node will return an Arbor without edges and with a null root,
   * given that it has no edges, and therefore no vertices, at all. */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createArbor = function() {
    let metaData = this.nodeMetaData;
    return new Arbor().addEdges(metaData,
        function(v, i) { return metaData[i].node_id; });
  };

  /** Second argument 'arbor' is optional. */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createUpstreamArbor = function(tag_regex, arbor) {
    var tags = this.tags,
        regex = new RegExp(tag_regex),
        cuts = Object.keys(tags).filter(function(tag) {
      return tag.match(regex);
    }).reduce(function(o, tag) {
      return tags[tag].reduce(function(o, nodeID) { o[nodeID] = true; return o;}, o);
    }, {});
    arbor = arbor ? arbor : this.createArbor();
    return arbor.upstreamArbor(cuts);
  };

  /**
   * Return a mapping of node IDs to positions.
   *
   * @params {Number[]} nodeIds (optional) Limit result mapping to the passed in
   *                                       node ID set.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.getPositions = function(nodeIds) {
    let metaData = this.nodeMetaData;
    if (this.geometry['neurite'].isBufferGeometry) {
      let result = {};
      if (nodeIds) {
        for (let i=0, imax=metaData.length; i<imax; ++i) {
          let node = metaData[i];
          if (node && nodeIds.has(node.node_id)) {
            result[node.node_id] = new THREE.Vector3(node.x, node.y, node.z);
          }
        }
      } else {
        for (let i=0, imax=metaData.length; i<imax; ++i) {
          let node = this.nodeMetaData[i];
          result[node.node_id] = new THREE.Vector3(node.x, node.y, node.z);
        }
      }
      return result;
    } else {
      if (nodeIds) {
        return this.geometry['neurite'].vertices.reduce(function(o, v, i) {
          let nodeId = metaData[i].node_id;
          if (nodeIds.has(nodeId)) o[nodeId] = v;
          return o;
        }, {});
      } else {
        return this.geometry['neurite'].vertices.reduce(function(o, v, i) {
          let nodeId = metaData[i].node_id;
          o[nodeId] = v;
          return o;
        }, {});
      }
    }
  };

  function createArborFromVertices(vertexList, metaData) {
    return new Arbor().addEdges(vertexList,
        function(v, i) { return metaData[i].node_id; });
  }

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.getCenterOfMass = function() {
    var nVertices = this.getVertexCount();
    if (!nVertices) {
      throw new CATMAID.ValueError("No vertices found for skeleton");
    }
    var weight = 1.0 / nVertices;

    if (this.geometry['neurite'].isBufferGeometry) {
      let start = this.geometry['neurite'].attributes.instanceStart;
      let center = new THREE.Vector3();
      let pos = new THREE.Vector3();
      for (var i=0, imax=start.count; i<imax; ++i) {
        pos.fromBufferAttribute(start, i);
        center.addScaledVector(pos, weight);
      }
      return center;
    } else {
      return this.geometry['neurite'].vertices.reduce(function(center, pos) {
        center.addScaledVector(pos, weight);
        return center;
      }, new THREE.Vector3());
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setSamplers = function(samplers) {
    this.samplers = samplers;
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createNodeDistanceFn = function() {
   return (function(child, paren) {
     return this[child].distanceTo(this[paren]);
   }).bind(this.getPositions());
  };

  /** Determine the nodes that belong to the axon by computing the centrifugal flow
   * centrality.
   * Takes as argument the json of compact-arbor, but uses only index 1: the inputs and outputs, parseable by the ArborParser.synapse function.
   * If only one node has the soma tag and it is not the root, will reroot at it.
   * Returns a map of node ID vs true for nodes that belong to the axon.
   * When the flowCentrality cannot be computed, returns null. */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.splitByFlowCentrality = function(json) {
      var arbor = this.createArbor();

      if (this.tags && this.tags['soma'] && 1 === this.tags['soma'].length) {
        var soma = this.tags['soma'][0];
        if (arbor.root != soma) arbor.reroot(soma);
      }

      var ap = new CATMAID.ArborParser();
      ap.arbor = arbor;
      ap.synapses(json[1]);

      return SynapseClustering.prototype.findAxon(ap, 0.9, this.getPositions());
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.updateSkeletonColor = function(colorizer) {
    this.line_material = this.actor.neurite.material = colorizer.material(this);
    var node_weights = colorizer.weights(this);

    if (this.overrideMaterial) {
      // If there is an override material set, make sure it is used as line material
      this.line_material = this.actor.neurite.material = this.overrideMaterial;
      if (CATMAID.tools.isFn(this.line_material.refresh)) {
        this.line_material.refresh();
      }
      return;
    }

    if (node_weights || colorizer.vertexColors) {
      // The skeleton colors need to be set per-vertex.
      this.line_material.vertexColors = THREE.VertexColors;
      this.line_material.needsUpdate = true;

      var pickColor = colorizer.colorPicker(this);
      var interpolate = colorizer.interpolateVertexColors;

      var seen = {};
      var last = null;
      // Map segment vertices to their colors. Each vertex is stored twice if it
      // is both beginning and end of two segments.
      let newVertexColors = this.nodeMetaData.map(function(md, i) {
        var node_id;
        if (interpolate) {
          node_id = md.node_id;
        } else {
          // Vertices are organized as pairs of child and parent for each
          // segment. If colors should not be interpolated, each parent gets
          // the color of its child (last). Otherwise, pairs of parents and
          // children will share a color.
          var isChild = (i % 2) === 0;
          node_id = isChild ? md.node_id : last;
        }

        var color = seen[node_id];
        if (color) return color;

        last = node_id;

        var weight = node_weights[node_id];
        weight = undefined === weight? 1.0 : weight * 0.9 + 0.1;

        var baseColor = pickColor(md);
        color = new THREE.Color(baseColor.r * weight,
                                baseColor.g * weight,
                                baseColor.b * weight);

        seen[node_id] = color;

        // Side effect: color a volume at the node, if any
        var mesh = this.radiusVolumes[node_id];
        if (mesh) {
          var material = mesh.material.clone();
          material.color = color;
          mesh.material = material;
        }

        return color;
      }, this);

      if (this.geometry['neurite'].isBufferGeometry) {
        let flattenedColors = new Float32Array(newVertexColors.length * 3);
        for (let i=0, imax=newVertexColors.length; i<imax; ++i) {
          flattenedColors[3 * i    ] = newVertexColors[i].r;
          flattenedColors[3 * i + 1] = newVertexColors[i].g;
          flattenedColors[3 * i + 2] = newVertexColors[i].b;
        }
        this.geometry['neurite'].setColors(flattenedColors);
      } else {
        this.geometry['neurite'].colors = newVertexColors;
        this.geometry['neurite'].colorsNeedUpdate = true;
      }
      // Setting the diffuse color to FFF is needed, because individual vertex
      // colors are multiplied with the diffuse color in the fragment shader.
      this.actor['neurite'].material.color.set(0xffffff);

      if (!colorizer.vertexColors) {
        this.actor['neurite'].material.opacity = this.opacity;
        this.actor['neurite'].material.transparent = this.opacity !== 1;
      } else {
        this.actor['neurite'].material.opacity = 1;
        this.actor['neurite'].material.transparent = false;
      }

      this.actor['neurite'].material.needsUpdate = true; // TODO repeated, it's the line_material

    } else {

      this.line_material.vertexColors = THREE.NoColors;
      this.line_material.needsUpdate = true;

      this.actor['neurite'].material.color = this.actorColor;
      this.actor['neurite'].material.transparent = this.opacity !== 1;

      // Display the entire skeleton with a single color.
      if (this.geometry['neurite'].isBufferGeometry) {
        this.actor['neurite'].material.uniforms.opacity.value = this.opacity;
      } else {
        this.geometry['neurite'].colors = [];

        this.actor['neurite'].material.opacity = this.opacity;
      }

      var material = new colorizer.SkeletonMaterial({
        color: this.actorColor,
        opacity: this.opacity,
        transparent: this.opacity !== 1
      });

      for (var k in this.radiusVolumes) {
        if (this.radiusVolumes.hasOwnProperty(k)) {
          this.radiusVolumes[k].material = material;
        }
      }
    }

    if (typeof this.line_material.refresh === 'function') this.line_material.refresh();
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.changeSkeletonLineWidth = function(width) {
      this.actor['neurite'].material.linewidth = width;
      this.actor['neurite'].material.needsUpdate = true;
  };

  /**
   * Set the material type for connector partner nodes, connector links and tag
   * nodes.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setShadingType = function(shading) {
    if (this.specialTagSphereCollection) {
      var bufferGeometry = this.specialTagSphereCollection.geometry;
      var newMaterial = bufferGeometry.createMaterial(shading);
      this.specialTagSphereCollection.material = newMaterial;
      this.specialTagSphereCollection.material.needsUpdate = true;
    }
    if (this.connectorSphereCollection) {
      var bufferGeometry = this.connectorSphereCollection.geometry;
      var newMaterial = bufferGeometry.createMaterial(shading, undefined, {
        depthWrite: this.connectorSphereCollection.material.depthWrite,
        side: this.connectorSphereCollection.material.side,
      });
      this.connectorSphereCollection.material = newMaterial;
      this.connectorSphereCollection.material.needsUpdate = true;
    }
  };

  /**
   * Scale node handles of a skeletons. These are the special tag spheres.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.scaleNodeHandles = function(value) {
    // Both special tag handlers and connector partner nodes are stored as
    // indexed buffer geometry. Therefore, only the template geometry has to be
    // scaled.
    if (this.specialTagSphereCollection) {
      this.specialTagSphereCollection.geometry.scaleTemplate(value, value, value);
    }
  };

  /**
   * Scale link node handles of a skeletons. These are all synaptic spheres.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.scaleLinkNodeHandles = function(value) {
    // Both special tag handlers and connector partner nodes are stored as
    // indexed buffer geometry. Therefore, only the template geometry has to be
    // scaled.
    if (this.connectorSphereCollection) {
      this.connectorSphereCollection.geometry.scaleTemplate(value, value, value);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.changeColor = function(color, options) {
    this.actorColor = color;
    if (options.color_method === 'manual') {
      this.updateSkeletonColor(options);
    }
  };

  WebGLApplication.prototype.updateCameraView = function(toOrthographic) {
    if(toOrthographic) {
      this.options.camera_view = 'orthographic';
      this.space.view.setCameraMode(true);
    } else {
      this.options.camera_view = 'perspective';
      this.space.view.camera.setZoom(1.0);
      this.space.view.setCameraMode(false);
    }
    this.space.updateScaleBar();
    this.space.render();
  };

  WebGLApplication.prototype.updateCustomTagColor = function(colorHex, alpha) {
    var update = false;
    if (colorHex) {
      this.options.custom_tag_spheres_color = colorHex;
      update = true;
    }
    if (alpha) {
      this.options.custom_tag_spheres_opacity = alpha;
      update = true;
    }
    if (update) {
      var skeletons = Object.keys(this.space.content.skeletons).map(function(skid) {
        return this.space.content.skeletons[skid];
      }, this);
      this.space.updateCustomTagColor(this.options, skeletons);
    }
  };

  WebGLApplication.prototype.Space.prototype.updateCustomTagColor = function(options, skeletons) {
    var labelTypeColor = this.staticContent.labelColors['custom'].color;
    labelTypeColor.setStyle(options.custom_tag_spheres_color);
    skeletons.forEach(function(skeleton) {
      skeleton.updateLabelTypeColor('custom', labelTypeColor, options.custom_tag_spheres_opacity);
    });
    this.render();
  };

  WebGLApplication.prototype.setConnectorLinkVisibility = function(visible) {
    this.options.show_connector_links = visible;
    var skeletons = Object.keys(this.space.content.skeletons).map(function(skid) {
      return this.space.content.skeletons[skid];
    }, this);
    this.space.updateConnectorColors(this.options, skeletons, this.space.render.bind(this.space));
  };

  WebGLApplication.prototype.setRadiusVisibility = function(visible) {
    let changed = this.options.show_radius !== visible;
    if (changed) {
      this.options.show_radius = visible;
      Object.values(this.space.content.skeletons).forEach(skeleton => {
        skeleton.setRadiusVisibility(visible);
      });
      this.render();
    }
  };

  WebGLApplication.prototype.updateConnectorColors = function(select) {
    if (select) {
      this.options.connector_color = select.value;
    }
    this.refreshConnnectorColors();
  };


  WebGLApplication.prototype.refreshConnnectorColors = function() {
    var skeletons = Object.keys(this.space.content.skeletons).map(function(skid) {
      return this.space.content.skeletons[skid];
    }, this);
    this.space.updateConnectorColors(this.options, skeletons, this.space.render.bind(this.space));
  };

  /**
   * If restriced connector geometry is in use, update their material and color
   * with the color of regular connectors. Only a reference is used.
   */
  WebGLApplication.prototype.Space.prototype.updateRestrictedConnectorColors = function(skeletons) {
    for (var i=0; i < skeletons.length; ++i) {
      var s = skeletons[i];
      // If there is restricted connector geometry displayed, update it, too
      if (s.connectorSelection && s.connectoractor) {
        s.synapticTypes.forEach(function(type) {
          // A reference is fine, the connectoractor material and geometry color
          // aren't modified directly.
          var ca = this.connectoractor[type];
          if (ca) {
            ca.material = this.actor[type].material;
            ca.material.needsUpdate = true;
          }
          var cg = this.connectorgeometry[type];
          if (cg) {
            cg.colors = this.geometry[type].colors;
            cg.colorsNeedUpdate = true;
          }
          var cs = this.connectorSelection[type];
          if (cs) {
            for (var nodeId in cs.objects) {
              var originalConnector = this.synapticSpheres[nodeId];
              if (originalConnector) {
                cs.objects[nodeId].color = originalConnector.color;
              }
            }
          }
        }, s);
      }
    }
  };

  /**
   * Show or hide connector edges by adjusting their opacity.
   */
  WebGLApplication.prototype.Space.prototype.updateConnectorEdgeVisibility = function(options, skeletons) {
    var linksVisible = options.show_connector_links;
    var restrictions = options.connector_filter;
    for (var i=0; i<skeletons.length; ++i) {
      var skeleton = skeletons[i];
      if (restrictions) {
        if (skeleton.connectorSelection && skeleton.connectoractor) {
          for (var j=0; j<skeleton.synapticTypes.length; ++j) {
            var type = skeleton.synapticTypes[j];
            var actor = skeleton.connectoractor[type];
            if (actor) {
              var modelVisibilityField = skeleton.synapticTypesToModelVisibility[type];
              actor.visible = linksVisible && skeleton.skeletonmodel[modelVisibilityField];
            }
          }
        }
      } else {
        // Ignore first actor type, because it is the neurite.
        for (var j=0; j<skeleton.synapticTypes.length; ++j) {
          var type = skeleton.synapticTypes[j];
          var actor = skeleton.actor[type];
          if (actor) {
            actor.visible = linksVisible && skeleton.connectorVisibility[type];
          }
        }
      }
    }
  };

  WebGLApplication.prototype.Space.prototype.updateConnectorColors = function(options, skeletons, callback) {
    // Make all
    var self = this;
    return new Promise(function(resolve, reject) {
      var done = function() {
        self.updateRestrictedConnectorColors(skeletons);
        self.updateConnectorEdgeVisibility(options, skeletons);
        resolve();
        if (CATMAID.tools.isFn(callback)) callback();
      };

      if ('cyan-red' === options.connector_color ||
          'cyan-red-dark' === options.connector_color ||
          'custom' === options.connector_color) {

        var pre = self.staticContent.synapticColors[0],
            post = self.staticContent.synapticColors[1];

        if ('custom' === options.connector_color) {
          pre.color.setStyle(options.custom_connector_colors['presynaptic_to']);
          post.color.setStyle(options.custom_connector_colors['postsynaptic_to']);
        } else {
          pre.color.setRGB(1, 0, 0); // red
          if ('cyan-red' === options.connector_color) post.color.setRGB(0, 1, 1); // cyan
          else post.color.setHex(0x00b7eb); // dark cyan
        }
        pre.vertexColors = THREE.NoColors;
        pre.needsUpdate = true;

        post.vertexColors = THREE.NoColors;
        post.needsUpdate = true;

        skeletons.forEach(function(skeleton) {
          skeleton.completeUpdateConnectorColor(options);
        });

        done();

      } else if ('by-amount' === options.connector_color) {

        var skids = skeletons.map(function(skeleton) { return skeleton.id; });

        if (skids.length > 1) $.blockUI();

        CATMAID.fetch(project.id + "/skeleton/connectors-by-partner", "POST",
            {skids: skids})
          .then(function(json) {
            skeletons.forEach(function(skeleton) {
              skeleton.completeUpdateConnectorColor(options, json[skeleton.id]);
            });
            done();
          })
          .catch(CATMAID.handleError)
          .then(function() {
            $.unblockUI();
          });
      } else if ('axon-and-dendrite' === options.connector_color || 'synapse-clustering' === options.connector_color) {
        fetchSkeletons(
            skeletons.map(function(skeleton) { return skeleton.id; }),
            function(skid) { return CATMAID.makeURL(project.id + '/' + skid + '/0/1/0/compact-arbor'); },
            function(skid) { return {}; },
            (function(skid, json) { self.content.skeletons[skid].completeUpdateConnectorColor(options, json); }).bind(self),
            function(skid) { CATMAID.msg("Error", "Failed to load synapses for: " + skid); },
            (function() {
              done();
              self.render();
            }).bind(self));
      } else if ('skeleton' === options.connector_color) {
        skeletons.forEach(function(skeleton) {
          var fnConnectorValue = function() { return 0; },
              fnMakeColor = function() { return skeleton.skeletonmodel.color.clone(); };
          skeleton.synapticTypes.forEach(function(type) {
            skeleton._colorConnectorsBy(type, fnConnectorValue, fnMakeColor);
          });
        });
        done();
      } else if ('global-polyadicity' === options.connector_color) {
        var skids = skeletons.map(function(skeleton) { return skeleton.id; });
        if (skids.length > 1) $.blockUI();

        CATMAID.fetch(project.id + "/skeletons/connector-polyadicity", "POST",
            {skeleton_ids: skids})
          .then(function(json) {
            skeletons.forEach(function(skeleton) {
              skeleton.completeUpdateConnectorColor(options, json[skeleton.id]);
            });
            done();
          })
          .catch(CATMAID.handleError)
          .then(function() {
            $.unblockUI();
          });
      }
    });
  };

  /** Operates in conjunction with updateConnectorColors above. */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.completeUpdateConnectorColor = function(options, json) {
    if ('cyan-red' === options.connector_color ||
        'cyan-red-dark' === options.connector_color ||
        'custom' === options.connector_color) {
      this.CTYPES.slice(1).forEach(function(type, i) {
        this.geometry[type].colors = [];
        this.geometry[type].colorsNeedUpdate = true;
        this.actor[type].material.vertexColors = THREE.NoColors;
        this.actor[type].material.color = this.synapticColors[this.CTYPES[1] === type ? 0 : 1].color;
        this.actor[type].material.needsUpdate = true;
      }, this);

      Object.keys(this.synapticSpheres).forEach(function(idx) {
        var bufferObject = this.synapticSpheres[idx];
        // TODO: Handle other connector types
        var meshType = this.CTYPES[1] === bufferObject.type ? 0 : 1;
        bufferObject.setFromMaterial(this.synapticColors[meshType]);
      }, this);

    } else if ('by-amount' === options.connector_color) {
      var ranges = {};
      ranges[this.CTYPES[1]] = function(ratio) {
        return 0.66 + 0.34 * ratio; // 0.66 (blue) to 1 (red)
      };
      ranges[this.CTYPES[2]] = function(ratio) {
        return 0.16 + 0.34 * (1 - ratio); //  0.5 (cyan) to 0.16 (yellow)
      };

      this.CTYPES.slice(1).forEach(function(type) {
        if (!json) return;
        var partners = json[type];
        if (!partners) return;
        var connectors = Object.keys(partners).reduce(function(o, skid) {
              return partners[skid].reduce(function(a, connector_id, i, arr) {
                a[connector_id] = arr.length;
                return a;
              }, o);
            }, {}),
            max = Object.keys(connectors).reduce(function(m, connector_id) {
              return Math.max(m, connectors[connector_id]);
            }, 0),
            range = ranges[type];

        var fnConnectorValue = function(node_id, connector_id) {
          var value = connectors[connector_id];
          if (!value) value = 1; // connector without partner skeleton
          return value;
        };

        var fnMakeColor = function(value) {
          return new THREE.Color().setHSL(1 === max ? range(0) : range((value -1) / (max -1)), 1, 0.5);
        };

        this._colorConnectorsBy(type, fnConnectorValue, fnMakeColor);

      }, this);

    } else if ('synapse-clustering' === options.connector_color) {
      if (!json) return;
      var synapse_map = new CATMAID.ArborParser().synapses(json[1]).createSynapseMap(),
          sc = new SynapseClustering(this.createArbor(), this.getPositions(), synapse_map, options.synapse_clustering_bandwidth),
          density_hill_map = sc.densityHillMap(),
          clusters = sc.clusterMaps(density_hill_map),
          colorizer = d3.scale.category10(),
          synapse_treenodes = Object.keys(sc.synapses);
      // Filter out clusters without synapses
      var clusterIDs = Object.keys(clusters).filter(function(id) {
        var treenodes = clusters[id];
        for (var k=0; k<synapse_treenodes.length; ++k) {
          if (treenodes[synapse_treenodes[k]]) return true;
        }
        return false;
      });
      var cluster_colors = clusterIDs
            .map(function(cid) { return [cid, clusters[cid]]; })
            .sort(function(a, b) {
              var la = a[1].length,
                  lb = b[1].length;
              return la === lb ? 0 : (la > lb ? -1 : 1);
            })
            .reduce(function(o, c, i) {
              o[c[0]] = new THREE.Color().set(colorizer(i));
              return o;
            }, {});
      var notComputableColor = new THREE.Color(0.4, 0.4, 0.4);

      var fnConnectorValue = function(node_id, connector_id) {
        return density_hill_map[node_id];
      };

      var fnMakeColor = function(value) {
        return cluster_colors[value] || notComputableColor;
      };

      this.synapticTypes.forEach(function(type) {
        this._colorConnectorsBy(type, fnConnectorValue, fnMakeColor);
      }, this);

    } else if ('axon-and-dendrite' === options.connector_color) {
      var axon = this.axon ? this.axon : null,
          fnMakeColor,
          fnConnectorValue;

      if (axon) {
        var colors = [new THREE.Color(0, 1, 0),  // axon: green
                      new THREE.Color(0, 0, 1)]; // dendrite: blue
        fnConnectorValue = function(node_id, connector_id) { return axon.contains(node_id) ? 0 : 1; };
        fnMakeColor = function(value) { return colors[value]; };
      } else {
        // Not computable
        fnMakeColor = function() { return new THREE.Color(0.4, 0.4, 0.4); };
        fnConnectorValue = function() { return 0; };
      }

      this.synapticTypes.forEach(function(type) {
        this._colorConnectorsBy(type, fnConnectorValue, fnMakeColor);
      }, this);
    } else if ('global-polyadicity' === options.connector_color) {
      var range = function(ratio) {
        return 0.66 + 0.34 * ratio; // 0.66 (blue) to 1 (red)
      };

      // Iterate over all supported synapse types
      this.CTYPES.slice(1).forEach(function(type) {
        if (!json) return;
        let polyadicities = json[type];
        if (!polyadicities) return;

        let max = Object.keys(polyadicities).reduce(function(m, connectorId) {
              return Math.max(m, polyadicities[connectorId]);
            }, 0);
        let maxColorIndex = Object.keys(options.polyadicity_colors).reduce((m, idx) => {
          let iidx = parseInt(idx, 10);
          return iidx > m ? iidx : m;
        }, 0);
        let minColorIndex = Object.keys(options.polyadicity_colors).reduce((m, idx) => {
          let iidx = parseInt(idx, 10);
          return iidx < m ? iidx : m;
        }, maxColorIndex);

        var fnConnectorValue = function(nodeId, connectorId) {
          var value = polyadicities[connectorId];
          if (!value) value = 0; // connector without partner skeleton
          return value;
        };

        var fnMakeColorFromRange = function(value) {
          return new THREE.Color().setHSL(1 === max ? range(0) : range((value -1) / (max -1)), 1, 0.5);
        };

        var fnMakeColor = function(value) {
          if (value <= minColorIndex) {
            return new THREE.Color(options.polyadicity_colors[minColorIndex]);
          }
          if (value >= maxColorIndex) {
            return new THREE.Color(options.polyadicity_colors[maxColorIndex]);
          }
          let lastMatch;
          while (!lastMatch) {
            lastMatch = options.polyadicity_colors[value];
            value -= 1;
          }
          return new THREE.Color(lastMatch);
        };

        this._colorConnectorsBy(type, fnConnectorValue, fnMakeColor);

      }, this);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype._colorConnectorsBy =
      function(type, fnConnectorValue, fnMakeColor) {
    // Set colors per-vertex
    var seen = {},
        seen_materials = {},
        colors = [];

    for (let nodeId in this.synapticSpheres) {
      let bufferObject = this.synapticSpheres[nodeId];
      if (bufferObject.type !== type) {
        continue;
      }

      var connector_id = bufferObject.connector_id,
          node_id = bufferObject.node_id,
          value = fnConnectorValue(node_id, connector_id);

      var color = seen[value];

      if (!color) {
        color = fnMakeColor(value);
        seen[value] = color;
      }

      // twice: for treenode and for connector
      colors.push(color);
      colors.push(color);

      bufferObject.color = color;
      // TODO: Might not be needed anymore: why should we store this extra
      // material anyway.
      var material = seen_materials[value];
      if (!material) {
        material = bufferObject.material.clone();
        material.color = color;
        seen_materials[value] = material;
      }
      bufferObject.material = material;
    }

    this.geometry[type].colors = colors;
    this.geometry[type].colorsNeedUpdate = true;
    var material = new THREE.LineBasicMaterial({color: 0xffffff, opacity: 1.0, linewidth: 6});
    material.vertexColors = THREE.VertexColors;
    material.needsUpdate = true;
    this.actor[type].material = material;
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.addCompositeActorToScene = function() {
    this.CTYPES.forEach(function(t) {
      var actor = this.actor[t];
      // Only add geometry to the scene that has at least one vertex. Not every
      // CTYPE actor is actually used, so this case can happen. Adding empty
      // geometry causes renderer warnings, which we want to avoid.
      if (actor) {
        var nNodes = actor.geometry.isBufferGeometry ?
            actor.geometry.index.count : actor.geometry.vertices.length;
        if (nNodes > 0) {
          this.space.add(this.actor[t]);
        }
      }
    }, this);
  };

  /** Three possible types of actors: 'neurite', 'presynaptic_to', and 'postsynaptic_to', each consisting, respectibly, of the edges of the skeleton, the edges of the presynaptic sites and the edges of the postsynaptic sites. */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.visibilityCompositeActor = function(type, visible) {
    this.actor[type].visible = visible;
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.getActorColorAsHTMLHex = function () {
    return this.actorColor.getHexString();
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.getActorColorAsHex = function() {
    return this.actorColor.getHex();
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.remove_connector_selection = function() {
    for (var i=0; i<this.synapticTypes.length; ++i) {
      var type = this.synapticTypes[i];

      if (this.connectoractor) {
        var ca = this.connectoractor[type];
        if (ca) {
          ca.geometry.dispose(); // do not dispose material, it is shared
          this.space.remove(ca);
          delete this.connectoractor[type];
        }
      }

      if (this.connectorSelection) {
        var cs = this.connectorSelection[type];
        if (cs) {
          cs.mesh.geometry.dispose(); // do not dispose material, it is shared
          this.space.remove(cs.mesh);
          delete this.connectoractor[type];
        }
      }
    }
    this.connectoractor = null;
    this.connectorgeometry = {};
    this.connectorSelection = null;
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.create_connector_selection =
      function( common_connector_IDs ) {
    this.connectorSelection = {};
    this.connectoractor = {};
    this.connectorgeometry = {};
    this.connectorgeometry[this.CTYPES[1]] = new THREE.Geometry();
    this.connectorgeometry[this.CTYPES[2]] = new THREE.Geometry();
    this.connectorgeometry[this.CTYPES[3]] = new THREE.Geometry();

    var scaling = this.space.options.link_node_scaling;
    var materialType = this.space.options.neuron_material;

    this.synapticTypes.forEach(function(type) {
      var material = this.actor[type].material;

      // Vertices is an array of Vector3, every two a pair, the first at the
      // node and the second at the connector.
      var vertices1 = this.geometry[type].vertices;
      var vertices2 = this.connectorgeometry[type].vertices;
      var connectors = [];
      for (var i=vertices1.length-2; i>-1; i-=2) {
        var v = vertices1[i];
        if (common_connector_IDs.hasOwnProperty(v.node_id)) {
          var v2 = vertices1[i+1];
          vertices2.push(v);
          vertices2.push(v2);
          connectors.push([v2, material, type, {connector_id: v.node_id, node_id: v.treenode_id}]);
        }
      }

      if (connectors.length > 0) {
        this.connectoractor[type] = new THREE.LineSegments(this.connectorgeometry[type],
            material);
        this.connectorgeometry[type].colors = this.geometry[type].colors;
        this.connectorgeometry[type].colorsNeedUpdate = true;
        this.space.add(this.connectoractor[type]);

        // Create buffer geometry for connector spheres
        var geometry = new CATMAID.MultiObjectInstancedBufferGeometry({
          templateGeometry: this.space.staticContent.radiusSphere,
          nObjects: connectors.length,
          scaling: scaling
        });

        var partnerSpheres = {};
        var visible = this.connectorVisibility[type];
        geometry.createAll(connectors, scaling, visible, null, function(v, m, o, bufferObject) {
          partnerSpheres[o[3].node_id] = bufferObject;
        });

        var sphereMaterial = geometry.createMaterial(materialType, undefined, {
          depthWrite: true,
          side: THREE.DoubleSide,
        });

        var sphereMesh = new THREE.Mesh(geometry, sphereMaterial);
        this.connectorSelection[type] = {
          mesh: sphereMesh,
          objects: partnerSpheres
        };
        this.space.add(sphereMesh);
      }

    }, this);
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.updateLabelTypeColor = function(labelType, color, opacity) {
    var labelTypeLabels = this.labelTypes.get(labelType);
    if (!labelTypeLabels) {
      return;
    }
    for (var i=0; i<labelTypeLabels.length; ++i) {
      var label = labelTypeLabels[i];
      var nodeIds = this.tags[label];
      if (!nodeIds) {
        continue;
      }
      for (var j=0; j<nodeIds.length; ++j) {
        var nodeId = nodeIds[j];
        var bufferObject = this.specialTagSpheres[nodeId];
        if (bufferObject) {
          if (color) {
            bufferObject.color = color;
          }
          if (opacity) {
              bufferObject.alpha = opacity;
          }
        }
      }
    }
  };

  /**
   * Remove all radius meshes and optionally recreate them.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setRadiusVisibility = function(visible) {
    // Remove all non-root radius cylinders
    let nodesToUpdate = this.nodeMetaData.filter(d => d.parent_id !== undefined && d.parent_id !== null);
    let nonRootRadiusMeshes = nodesToUpdate.map(d => {
      let mesh = this.radiusVolumes[d.node_id];
      delete this.radiusVolumes[d.node_id];
      return mesh;
    });
    this.space.removeAll(nonRootRadiusMeshes);

    // Build index to find parent nodes
    let nodeIndex = this.nodeMetaData.reduce((o, d) => {
      o[d.node_id] = d;
      return o;
    }, {});

    let v1 = new THREE.Vector3();
    let v2 = new THREE.Vector3();

    if (visible) {
      let material = this.getMeshMaterial(this.space.options);

      for (let i=0, max=nodesToUpdate.length; i<max; ++i) {
        let node = nodesToUpdate[i];
        if (node.radius === undefined || node.radius === 0) {
          continue;
        }
        let parentNode = nodeIndex[node.parent_id];
        if (!parentNode) {
          throw CATMAID.ValueError("Could not find parent of node " + node.node_id);
        }

        v1.set(node.x, node.y, node.z);

        // Create new radius representation
        if (parentNode.radius !== undefined && parentNode.radius > 0) {
          v2.set(parentNode.x, parentNode.y, parentNode.z);
          this.createCylinder(v1, v2, node.node_id, node.radius, material);
        } else {
          this.createNodeSphere(v1, node.node_id, node.radius, material);
        }
      }
    }
  };

  /**
   * Place a colored sphere at each node. Used for highlighting special tags like
   * 'uncertain end' and 'todo'. Implemented with buffer geometries to gain
   * better performance.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createLabelSpheres =
      function(labels, scaling, shading, preventSceneUpdate) {

    var geometry = new CATMAID.MultiObjectInstancedBufferGeometry({
      templateGeometry: this.space.staticContent.labelspheregeometry,
      nObjects: labels.length,
      scaling: scaling
    });

    geometry.createAll(labels, scaling, undefined, (function(v, m, o) {
      return !this.specialTagSpheres.hasOwnProperty(o[2]);
    }).bind(this), (function(v, m, o, bufferObject) {
      this.specialTagSpheres[o[2]] = bufferObject;
    }).bind(this));

    var material = geometry.createMaterial(shading);

    this.specialTagSphereCollection = new THREE.Mesh(geometry, material);
    if (!preventSceneUpdate) {
      this.space.add(this.specialTagSphereCollection);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.getLabelType = function(label, customRegEx) {
    label = label.toLowerCase();
    if (customRegEx && customRegEx.test(label)) {
      return 'custom';
    } else if (-1 !== label.indexOf('todo')) {
      return 'todo';
    } else if (-1 !== label.indexOf('uncertain')) {
      return 'uncertain';
    } else {
      return null;
    }
  };

  /**
   * The itype is 0 (pre) or 1 (post), and chooses from the two arrays:
   * synapticTypes and synapticColors.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createPartnerSpheres =
      function(connectors, scaling, shading, preventSceneUpdate) {

    var geometry = new CATMAID.MultiObjectInstancedBufferGeometry({
      templateGeometry: this.space.staticContent.radiusSphere,
      nObjects: connectors.length,
      scaling: scaling
    });

    geometry.createAll(connectors, scaling, undefined, (function(v, m, o) {
      // There already is a synaptic sphere at the node
      return !this.synapticSpheres.hasOwnProperty(o[3]);
    }).bind(this), (function(v, m, o, bufferObject) {
      let nodeId = o[3];
      bufferObject.node_id = nodeId;
      bufferObject.connector_id = o[4];
      bufferObject.type = this.synapticTypes[o[2]];
      this.synapticSpheres[nodeId] = bufferObject;
    }).bind(this));

    var material = geometry.createMaterial(shading, undefined, {
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    this.connectorSphereCollection = new THREE.Mesh(geometry, material);
    if (!preventSceneUpdate) {
      this.space.add(this.connectorSphereCollection);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createEdge = function(v1, v2, target) {
    // Create edge between child (id1) and parent (id2) nodes:
    // Takes the coordinates of each node, transforms them into the space,
    // and then adds them to the parallel lists of vertices and vertexIDs
    target.vertices.push(v1, v2);
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createNodeSphere =
      function(v, nodeId, radius, material, preventSceneUpdate=false) {
    if (this.radiusVolumes.hasOwnProperty(nodeId)) {
      // There already is a sphere or cylinder at the node
      return;
    }
    // Reuse geometry: an icoSphere of radius 1.0
    var mesh = new THREE.Mesh(this.space.staticContent.icoSphere, material);
    // Scale the mesh to bring about the correct radius
    mesh.scale.x = mesh.scale.y = mesh.scale.z = radius;
    mesh.position.set( v.x, v.y, v.z );
    mesh.node_id = nodeId;
    this.radiusVolumes[nodeId] = mesh;
    if (!preventSceneUpdate) {
      this.space.add(mesh);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createCylinder =
      function(v1, v2, nodeId, radius, material, preventSceneUpdate=false) {
    if (this.radiusVolumes.hasOwnProperty(nodeId)) {
      // There already is a sphere or cylinder at the node
      return;
    }
    var mesh = new THREE.Mesh(this.space.staticContent.cylinder, material);

    // BE CAREFUL with side effects: all functions on a Vector3 alter the vector and return it (rather than returning an altered copy)
    var direction = new THREE.Vector3().subVectors(v2, v1);

    mesh.scale.x = radius;
    mesh.scale.y = direction.length();
    mesh.scale.z = radius;

    var arrow = new THREE.ArrowHelper(direction.clone().normalize(), v1);
    mesh.quaternion.copy(arrow.quaternion);
    mesh.position.addVectors(v1, direction.multiplyScalar(0.5));

    mesh.node_id = nodeId;

    this.radiusVolumes[nodeId] = mesh;
    if (!preventSceneUpdate) {
      this.space.add(mesh);
    }
  };

  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.getMeshMaterial = function(options) {
    var Material = CATMAID.getSkeletonMaterialType(options['neuron_material']);
    var material = new Material( { color: this.getActorColorAsHex(), opacity:1.0, transparent:false } );
    material.opacity = this.skeletonmodel.opacity;
    material.transparent = material.opacity !== 1;
    return material;
  };

  /**
   * Recreate the skeleton represention based on the passed in JSON data. If
   * historic data is part of this, the skeleton will contain multiple
   * representations at the same time, where each node has a time stamp
   * associated when it became valid.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.loadJson =
      function(skeletonModel, json, options, withHistory, nodeWhitelist,
      preventSceneUpdate) {

    var nodes = json[0];
    var connectors = json[1];
    var tags = json[2];
    var history;
    var silent = false;

    // For section interpolation, the JSON data is updated so that the
    // respective locations are fixed.
    if (options.interpolate_sections || options.interpolate_broken_sections) {
      var wrongSections = options.interpolated_sections;

      // Calculate world space Z for missing sections in primary stack of
      // focused stack viewer.
      var focusedStack = project.focusedStackViewer.primaryStack;
      if (focusedStack.orientation !== CATMAID.Stack.ORIENTATION_XY) {
        CATMAID.warn("No XY stack found");
        wrongSections = [];
      } else if (options.interpolate_broken_sections) {
        wrongSections = wrongSections.concat(focusedStack.broken_slices);
      }

      let wrongProjectXs = [];
      let ix = options.interpolated_sections_x;
      for (let i=0, imax=ix.length; i<imax; ++i) {
        wrongProjectXs.push(ix[i]);
      }

      let wrongProjectYs = [];
      let iy = options.interpolated_sections_y;
      for (let i=0, imax=iy.length; i<imax; ++i) {
        wrongProjectYs.push(iy[i]);
      }

      var wrongProjectZs = wrongSections.map(function(s) {
        var projectZ = focusedStack.stackToProjectZ(s, 0, 0);
        return projectZ;
      });

      let iz = options.interpolated_sections_z;
      for (let i=0, imax=iz.length; i<imax; ++i) {
        wrongProjectZs.push(iz[i]);
      }

      if (wrongProjectZs.length > 0) {
        nodes = interpolateNodes(nodes, wrongProjectXs, wrongProjectYs,
            wrongProjectZs);
      }
    }

    if (nodeWhitelist) {
      // Remove all nodes that are not allowed.
      var nNodes = nodes.length;
      var n = nNodes;
      while (n--) {
        if (!nodeWhitelist.has(nodes[n][0])) {
          nodes.splice(n, 1);
        }
      }
      // Ignore missing parents during import, filtering could have cut some
      // away if nodes got removed.
      if (nodes.length !== nNodes) {
        silent = true;
      }
    }

    if (withHistory) {
      this.history = CATMAID.TimeSeries.makeHistoryIndex({
        nodes: {
          data: nodes,
          timeIndex: 8
        },
        connectors: {
          data: connectors,
          timeIndex: 6
        }
      });

      // Update to most recent skeleton
      this.resetToPointInTime(skeletonModel, options, null, true,
          preventSceneUpdate);
    } else {
      this.reinit_actor(skeletonModel, nodes, connectors, tags, null, options,
          silent, preventSceneUpdate);
    }
  };

  /**
   * Reset a skeleton to particular point in time. Expects skeleton history to
   * be available.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.resetToPointInTime =
      function(skeletonModel, options, timestamp, noCache, preventSceneUpdate) {

    if (!skeletonModel) {
      if (!this.skeletonmodel) {
        throw new CATMAID.ValueError("Need either own or new skeleton model");
      }
      skeletonModel = this.skeletonModel;
    }

    if (!this.history) {
      throw new CATMAID.ValueError(`Historic data for skeleton ${skeletonModel.id} missing`);
    }

    // If no timestamp is given, the present point in time is implied
    timestamp = timestamp || new Date();

    // Only generate a new skeleton version if new changes are visible at this
    // point in time (and if no next change time has been recorded yet).
    var nextChange = this.history.nextChange;
    if (undefined !== nextChange && !noCache) {
      if (!nextChange || nextChange > timestamp) {
        return;
      }
    }

    // The skeleton history is a regular JSON response with potentially
    // duplicate IDs and timestamps for each element. The first step is
    // therefore to find all nodes, connectors and tags that were valid at the
    // passed in timestamp.
    var nodesInfo = CATMAID.TimeSeries.getDataInWindow(this.history.nodes, null, timestamp);
    var connectorsInfo = CATMAID.TimeSeries.getDataInWindow(this.history.connectors, null, timestamp);
    var nodes = nodesInfo[0];
    var connectors = connectorsInfo[0];

    // TODO Tags are currently not supported by the history animation
    var tags = null;

    // Due to ambiguities with nodes that were modified without history tracking
    // being active, we silence node reference errors during skeleton
    // construction. The problem is we need such a node availabel starting from
    // its creation time, because it might referenced at that point in time.
    // However, its data is only valid stating from its edition time, which
    // makes it possible that it references a parent node that was not
    // available at its creation time.
    this.reinit_actor(skeletonModel, nodes, connectors, tags, this.history,
        options, true, preventSceneUpdate);

    // Remember this rebuild date
    this.history.rebuildTime = timestamp;

    // Set time of next change
    if (!noCache) {
      if (nodesInfo[1]) {
        if (connectorsInfo[1]) {
          this.history.nextChange = nodesInfo[1] < connectorsInfo[1] ?
              nodesInfo[1] : connectorsInfo[1];
        } else {
          this.history.nextChange = nodesInfo[1];
        }
      } else if (connectorsInfo[1]) {
        this.history.nextChange = connectorsInfo[1];
      } else {
        this.history.nextChange = null;
      }
    }
  };

  /**
   * Recreate the skeleton represention based on the passed in JSON data. If
   * historic data is part of this, the skeleton will contain multiple
   * representations at the same time, where each node has a time stamp
   * associated when it became valid.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.reinit_actor =
      function(skeletonmodel, nodes, connectors, tags, history, options, silent,
      preventSceneUpdate) {
    if (this.actor) {
      this.destroy();
    }
    this.skeletonmodel = skeletonmodel;
    this.initialize_objects(options);
    this.history = history;

    var lean = options.lean_mode;

    // Map of node ID vs node properties array
    var nodeProps = nodes.reduce(function(ob, node) {
      ob[node[0]] = node;
      return ob;
    }, {});

    if (options.collapse_artifactual_branches) {
      [nodes, connectors] = collapseArtifactualBranches(nodes, connectors, tags);
    }

    // Store for creation when requested
    // TODO could request them from the server when necessary
    this.tags = tags;

    // Cache for reusing Vector3d instances and node meta data
    var vs = {};

    // Reused for all meshes
    let material = this.getMeshMaterial(options);

    // Collect all labels first, before creating its geometry
    var partner_nodes = [];
    var labels = new Map();

    var edgeGeometry = this.triangulated_lines ?
          new THREE.Geometry() : this.geometry['neurite'];

    // Keeps track of node meta data like node ID and user ID.
    let nodeMetaData = this.nodeMetaData = [];
    let idToMetaData = new Map();

    // Create edges between all skeleton nodes
    // and a sphere on the node if radius > 0
    nodes.forEach(function(node, i) {
      // node[0]: treenode ID
      // node[1]: parent ID
      // node[2]: user ID
      // 3,4,5: x,y,z
      // node[6]: radius
      // node[7]: confidence
      // node[8]: edition timr, when queried
      // If node has a parent
      var v1;
      var hasParentNode = !!node[1];
      if (hasParentNode && silent) {
        // Silencing missing parent information is needed for history based
        // construction.
        hasParentNode = nodeProps.hasOwnProperty(node[1]);
      }
      if (hasParentNode) {
        v1 = vs[node[0]];
        if (!v1) {
          v1 = new THREE.Vector3(node[3], node[4], node[5]);
          vs[node[0]] = v1;
        }
        var p = nodeProps[node[1]];
        var v2 = vs[p[0]];
        if (!v2) {
          v2 = new THREE.Vector3(p[3], p[4], p[5]);
          vs[p[0]] = v2;
        }

        // Add node meta data
        let metaChild = idToMetaData.get(node[0]);
        if (!metaChild) {
          metaChild = {
            'node_id': node[0],
            'parent_id': node[1],
            'user_id': node[2],
            'x': node[3],
            'y': node[4],
            'z': node[5],
          };
          // Add radius information if available
          if (node[6] > 0) {
            metaChild.radius = node[6];
          }
          idToMetaData.set(node[0], metaChild);
        }
        let metaParent = idToMetaData.get(node[1]);
        if (!metaParent) {
          metaParent = {
            'node_id': p[0],
            'parent_id': p[1],
            'user_id': p[2],
            'x': p[3],
            'y': p[4],
            'z': p[5],
          };
          // Add radius information if available
          if (p[6] > 0) {
            metaParent.radius = p[6];
          }
          idToMetaData.set(p[0], metaParent);
        }
        nodeMetaData.push(metaChild, metaParent);

        // Create skeleton line
        this.createEdge(v1, v2, edgeGeometry);
        // Optionally, create radius representation
        if (options.show_radius) {
          if (node[6] > 0 && p[6] > 0) {
            // Create cylinder using the node's radius only (not the parent) so
            // that the geometry can be reused
            this.createCylinder(v1, v2, node[0], node[6], material, preventSceneUpdate);
          } else {
            // Create sphere
            if (node[6] > 0) {
              this.createNodeSphere(v1, node[0], node[6], material, preventSceneUpdate);
            }
          }
        }
      } else {
        // For the root node, which must be added to vs
        v1 = vs[node[0]];
        if (!v1) {
          v1 = new THREE.Vector3(node[3], node[4], node[5]);
          vs[node[0]] = v1;
        }
        if (node[6] > 0) {
          // Clear the slot for a sphere at the root
          var mesh = this.radiusVolumes[node[0]];
          if (mesh) {
            this.space.remove(mesh);
            delete this.radiusVolumes[node[0]];
          }
          this.createNodeSphere(v1, node[0], node[6], material, preventSceneUpdate);
        }
      }

      if (!lean && node[7] < 5) {
        // Edge with confidence lower than 5
        let nodeLabels = labels.get(v1);
        if (!nodeLabels) {
          nodeLabels = [];
          labels.set(v1, [node[0], nodeLabels]);
        }
        nodeLabels.push('uncertain');
      }
    }, this);

    // Special case, if there is only a single node
    if (nodes.length === 1) {
      var node = nodes[0];
      var metaData = {
        'node_id': node[0],
        'parent_id': node[1],
        'user_id': node[2],
        'x': node[3],
        'y': node[4],
        'z': node[5],
      };
      if (node[6] > 0) {
        metaData.radius = node[6];
      }
      edgeGeometry.vertices.push(vs[node[0]]);
      nodeMetaData.push(metaData, metaData);
    }

    if (options.smooth_skeletons) {
      var arbor = createArborFromVertices(edgeGeometry.vertices, nodeMetaData);
      if (arbor.root) {
        var smoothed = arbor.smoothPositions(vs, options.smooth_skeletons_sigma),
            vertices = edgeGeometry.vertices;
        // Iterate only even vertices: the children
        for (var i=0; i<vertices.length; i+=2) {
          var v = vertices[i]; // i: child, i+1: parent
          let nodeId = nodeMetaData[i].node_id;
          v.copy(smoothed[nodeId]);
        }
        // Root should not change position, but for completeness and future-proofing:
        vs[arbor.root].copy(smoothed[arbor.root]);

        // Update meta data
        for (let i=0; i<vertices.length; ++i) {
          let v = vertices[i];
          let md = nodeMetaData[i];
          md.x = v.x;
          md.y = v.y;
          md.z = v.z;
        }
      }
    }

    // Create edges between all connector nodes and their associated skeleton nodes,
    // appropriately colored as pre- or postsynaptic.
    // If not yet there, create as well the sphere for the node related to the connector
    connectors.forEach(function(con) {
      // con[0]: treenode ID
      // con[1]: connector ID
      // con[2]: 0 for pre, 1 for post, 2 for gap junction, -1 for other to be skipped
      // indices 3,4,5 are x,y,z for connector
      // indices 4,5,6 are x,y,z for node
      var type = con[2];
      if (type === -1) return;
      var v1 = new THREE.Vector3(con[3], con[4], con[5]);
      v1.treenode_id = con[0];
      v1.node_id = con[1];
      var v2 = vs[con[0]];
      if (v1 && v2) {
        this.createEdge(v1, v2, this.geometry[this.synapticTypes[type]]);
        var defaultMaterial = this.space.staticContent.synapticColors[type] ||
          this.space.staticContent.synapticColors.default;
        partner_nodes.push([v2, defaultMaterial, type, con[0], con[1]]);
      } else if (!silent) {
        throw new CATMAID.ValueError("Connector loading failed, not all vertices available");
      }
    }, this);

    // Place spheres on nodes with special labels, if they don't have a sphere there already
    var customTagRe = new RegExp(options.custom_tag_spheres_regex || 'a^', 'i');
    var labelTypes = new Map();
    for (var tag in this.tags) {
      if (this.tags.hasOwnProperty(tag)) {
        var labelType = this.getLabelType(tag, customTagRe);
        if (labelType) {
          // Store the mapping of label to label type.
          var labelTypeLabels = labelTypes.get(labelType);
          if (!labelTypeLabels) {
            labelTypeLabels = [];
            labelTypes.set(labelType, labelTypeLabels);
          }
          labelTypeLabels.push(tag);

          // Find used label Type for each labeled node
          this.tags[tag].forEach(function(nodeID) {
            if (!this.specialTagSpheres[nodeID] && (!(silent && !vs[nodeID]))) {
              let node = vs[nodeID];
              let nodeData = labels.get(node);
              if (!nodeData) {
                nodeData = [nodeID, []];
                labels.set(node, nodeData);
              }
              let nodeLabels = nodeData[1];
              if (labelType === 'custom') {
                // Promote custom tag matches to make sure they are displayed
                nodeLabels.unshift(labelType);
              } else {
                nodeLabels.push(labelType);
              }
            }
          }, this);
        }
      }
    }
    this.labelTypes = labelTypes;

    // Create buffer geometry for connectors
    if (partner_nodes.length > 0) {
      this.createPartnerSpheres(partner_nodes, options.link_node_scaling,
          options.neuron_material, preventSceneUpdate);
    }

    // Create buffer geometry for labels
    if (labels.size > 0) {
      let displayedLabels = Array.from(labels).map(function(l) {
        let nodeId = l[1][0];
        let nodeLabels = l[1][1];
        // Select first label, if multiple
        let labelType = nodeLabels[0];
        let color = this[labelType];
        return [l[0], color, nodeId];
      }, this.space.staticContent.labelColors);
      this.createLabelSpheres(displayedLabels, options.skeleton_node_scaling,
          options.neuron_material, preventSceneUpdate);
    }

    if (options.resample_skeletons) {
      if (options.smooth_skeletons) {
        // Can't both smooth and resample
        return;
      }
      // WARNING: node IDs no longer resemble actual skeleton IDs.
      // All node IDs will now have negative values to avoid accidental similarities.
      var arbor = createArborFromVertices(edgeGeometry.vertices, nodeMetaData);
      if (arbor.root) {
        var res = arbor.resampleSlabs(vs, options.smooth_skeletons_sigma, options.resampling_delta, 2);
        var vs = edgeGeometry.vertices;
        // Remove existing lines
        vs.length = 0;
        // Add all new lines
        var edges = res.arbor.edges,
            positions = res.positions;
        var idToResampledMetaData = {};
        nodeMetaData = this.nodeMetaData = [];

        Object.keys(edges).forEach(function(nodeID, i) {
          // Fix up Vector3 instances
          let v_child = positions[nodeID];
          let v_parent = positions[edges[nodeID]];
          // Add line from child to parent
          vs.push(v_child, v_parent);

          let parentId = edges[nodeID];
          let childMetaData = idToResampledMetaData[nodeID];
          if (!childMetaData) {
            childMetaData = {
              'node_id': -nodeID,
              'parent_id': parentId ? -parentId : parentId,
              'user_id': -1,
              'x': v_child.x,
              'y': v_child.y,
              'z': v_child.z,
            };
            idToResampledMetaData[nodeID] = childMetaData;
          }

          let parentMetaData = idToResampledMetaData[parentId];
          let parentParentId = edges[parentId];
          if (!parentMetaData) {
            parentMetaData = {
              'node_id': -parentId,
              'parent_id': parentParentId ? -parentParentId : parentParentId,
              'user_id': -1,
              'x': v_parent.x,
              'y': v_parent.y,
              'z': v_parent.z,
            };
            idToResampledMetaData[nodeID] = parentMetaData;
          }

          nodeMetaData.push(childMetaData, parentMetaData);
        });
        // Fix up root is not needed, its meta data is updated through edges
        // above.
        // var v_root = positions[res.arbor.root];
      }
    }

    // Mesh based lines need to be added as a whole
    if (this.geometry['neurite'].isBufferGeometry) {
      this.geometry['neurite'].setPositions(
          edgeGeometry.vertices.reduce(function(l, v, i) {
            l[i * 3] = v.x;
            l[i * 3 + 1] = v.y;
            l[i * 3 + 2] = v.z;
            return l;
          }, new Array(edgeGeometry.vertices.length * 3)));
      this.actor['neurite'].computeLineDistances();
      this.actor['neurite'].scale.set(1, 1, 1);
    }
  };

  var collapseArtifactualBranches = function(nodes, connectors, tags) {
    var arbor = new CATMAID.ArborParser().makeArbor(nodes).arbor;

    let connectorMap = connectors.reduce((o, c) => {
      let partnerTreenodeId = c[0];
      let entries = o[partnerTreenodeId];
      if (!entries) {
        entries = [];
        o[partnerTreenodeId] = entries;
      }
      entries.push(c);
      return o;
    }, {});

    let removedNodes = {};
    let movedConnectors = {};

    let addNodeId = nodeId => removedNodes[nodeId] = true;
    let addConnectors = function(nodeId) {
      // Assume <this> is branch node Id
      let connectors = connectorMap[nodeId];
      if (connectors) {
        for (let c of connectors) {
          // c[1] is the connecctor ID
          movedConnectors[c[1]] = this;
        }
      }
    };
    arbor.collapseArtifactualBranches(tags, (branchNodeId, removedNodeIds) => {
      removedNodeIds.forEach(addNodeId);
      // Find all connectors with that reference these nodes
      removedNodeIds.forEach(addConnectors, branchNodeId);
    });

    nodes = nodes.filter(n => !removedNodes[n[0]]);
    connectors = connectors.map(c => {
      let newPartnerNodeId = movedConnectors[c[1]];
      if (newPartnerNodeId !== undefined) {
        let newC = c.slice();
        // Set new partner node
        newC[0] = newPartnerNodeId;
        return newC;
      } else {
        return c;
      }
    });

    return [nodes, connectors];
  };

  /**
   * Update the node location of all nodes in the passed in node list (as
   * obtained from the compact-skeleton API) at the given project X, Y and Z
   * locations so that they are moved to the interpolated X/Y location of all
   * neighboring nodes (.
   */
  var interpolateNodes = function(nodes, xLocations, yLocations, zLocations) {
    if ((xLocations && xLocations.length > 0) || (yLocations && yLocations.length > 0)) {
      CATMAID.warn('Currently only Z based interpolation is supported');
    }
    // Iterate over all nodes to find the ones matching the problematic sections.
    // Each node is an array of treenode ID (0), parent ID (1), user ID (2), x
    // (3), y (4), z (5), radius (6), confidence (7).
    nodes.forEach(function(node, index, nodes) {
      // If a node is positioned on a 'wrong' section, make a correction to it
      var nodeMatches = false;
      for (var i=0; i<zLocations.length; ++i) {
        if (Math.abs(zLocations[i] - node[5]) < 0.0001) {
          nodeMatches = true;
          break;
        }
      }
      if (!nodeMatches) {
          return;
      }

      var nodeID = node[0];
      var parentID = node[1];
      var parentNode, childNode;

      // Find parent and (first) child to interpolate.
      for (var i=0, max=nodes.length; i<max && !(parentNode && childNode); ++i) {
        var other = nodes[i];
        if (parentID === other[0]) {
          parentNode = other;
        } else if (nodeID === other[1]) {
          childNode = other;
        }
      }

      if (!parentNode) {
        // If this node is a root, use its child's Z information
        if (!parentID) {
          parentNode = childNode;
        } else {
          throw new Error("Couldn't find parent of node " + nodeID);
        }
      }

       if (!childNode) {
        // If there is a parent node and no child, use a the parent for this
        // leaf node.
        if (parentNode) {
          childNode = parentNode;
        } else {
          throw new Error("Couldn't find child of node " + nodeID);
        }
      }

      // Simple linear interpolation of X and Y between child and parent
      node[3] = (parentNode[3] + childNode[3]) * 0.5;
      node[4] = (parentNode[4] + childNode[4]) * 0.5;
    });

    return nodes;
  };

  /**
   * Make a skeleton or parts of it visible. If the optional timestamp parameter
   * is passed in, only nodes/edges/connectors will be displayed that are
   * visible at this point in time.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.show = function(
      options) {

    this.addCompositeActorToScene();

    this.setActorVisibility(this.skeletonmodel.selected); // the skeleton, radius spheres and label spheres

    if (options.connector_filter) {
      this.setPreVisibility( false ); // the presynaptic edges and spheres
      this.setPostVisibility( false ); // the postsynaptic edges and spheres
    } else {
      this.setPreVisibility( this.skeletonmodel.pre_visible ); // the presynaptic edges and spheres
      this.setPostVisibility( this.skeletonmodel.post_visible ); // the postsynaptic edges and spheres
    }

    this.setTextVisibility( this.skeletonmodel.text_visible ); // the text labels
    this.setMetaVisibility( this.skeletonmodel.meta_visible ); // tags

    //this.updateSkeletonColor(options);

    // Will query the server
    if ('cyan-red' === options.connector_color) {
      this.space.updateConnectorEdgeVisibility(options, [this]);
    } else {
      this.space.updateConnectorColors(options, [this]);
    }
  };

  /**
   * Only show nodes of this skeleton if they are visible at the passed in point
   * in time. Expectes history information to be available.
   */
  WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setVisibileByTime =
      function(timestamp) {
    // Make sure there is history data available.
    if (!this.history) {
      throw new CATMAID.ValueError("Skeleton " + this.id +
          " doesn't have history data attached");
    }

  };

  /**
   * Toggles the display of a JQuery UI dialog that shows which user has which
   * color assigned.
   */
  WebGLApplication.prototype.toggleUserColormapDialog = function() {
    // In case a color dialog exists already, close it and return.
    if ($('#user-colormap-dialog').length > 0) {
        $('#user-colormap-dialog').remove();
        return;
    }

    var users = CATMAID.User.all();
    users = Object.keys(this.space.userColormap)
        .map(function (userID) { return users[userID]; })
        .filter(function (user) { return !!user && user.id !== "-1"; })
        .sort(CATMAID.User.displayNameCompare);

    if (0 === users.length) {
      CATMAID.warn("No user-based coloring mode selected");
      return;
    }

    // Create a new color dialog
    var dialog = document.createElement('div');
    dialog.setAttribute("id", "user-colormap-dialog");
    dialog.setAttribute("title", "User colormap");

    var tab = document.createElement('table');
    tab.setAttribute("id", "usercolormap-table");
    tab.innerHTML =
        '<thead>' +
          '<tr>' +
            '<th>login</th>' +
            '<th>name</th>' +
            '<th>color</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody></tbody>';
    dialog.appendChild(tab);
    users.forEach(function (user) {
      var userID = user.id;
      var rowElement = $('<tr/>');
      rowElement.append( $('<td/>').text( user.login ) );
      rowElement.append( $('<td/>').text( user.fullName ) );
      rowElement.append( $('<div/>').css('width', '100px').css('height', '20px').css('background-color', '#' + this.space.userColormap[userID].getHexString()) );
      $('tbody:last', tab).append( rowElement );
    }, this);

    $(dialog).dialog({
      height: 440,
      width: 340,
      modal: false,
      dialogClass: "no-close",
      buttons: {
        "OK": function() {
          $(this).dialog("close");
        }
      },
      close: function(event, ui) {
        $('#user-colormap-dialog').remove();
      }
    });
  };

  WebGLApplication.prototype.toggleInvertShading = function() {
    this.options.invert_shading = !this.options.invert_shading;
    if (this.options.shading_method === 'none') return;
    this.set_shading_method();
  };

  WebGLApplication.prototype.setInterpolateVertexColors = function(enabled) {
    this.options.interpolate_vertex_colots = enabled;
    this.updateSkeletonColors()
      .then(this.render.bind(this));
  };

  WebGLApplication.prototype.setFollowActive = function(value) {
    this.options.follow_active = value ? true : false;
    this.updateActiveNode();
  };

  WebGLApplication.prototype.setUpdateActive = function(value) {
    this.options.update_active = !!value;
    // If active skeleton update was enabled, update active skeleton right away
    if (value) {
      this.updateActiveSkeleton(true);
    }
  };

  WebGLApplication.prototype.adjustStaticContent = function() {
    this.space.staticContent.adjust(this.options, this.space);
    this.space.render();
  };

  WebGLApplication.prototype.adjustContent = function() {
    this.space.content.adjust(this.options, this.space, this.submit);
    this.space.render();
  };

  WebGLApplication.prototype.setDebug = function(debug) {
    this.options.debug = !!debug;
    this.space.setDebug(this.options.debug);
    this.space.render();
  };

  WebGLApplication.prototype.setAxesVisibility = function(visible) {
    this.options.show_axes = visible;
    this.space.setAxesVisibility(visible);
    this.space.render();
  };

  /**
   * Handle project location change. Static content like the z plane will be
   * updated.
   */
  WebGLApplication.prototype.handlelLocationChange = function() {
    this.space.staticContent.updateZPlanePosition(this.space, project.focusedStackViewer);
    this.space.render();
  };

  /**
   * Open a connector table with the connectors currently visisble in the 3D
   * viewer.
   */
  WebGLApplication.prototype.listConnectors = function() {
    if (this.filteredConnectors) {
      CATMAID.ConnectorSelection.showConnectors(
          this.filteredConnectors.connectorIds,
          this.filteredConnectors.skeletonIds);
    } else {
      var skeletonIds = this.getSelectedSkeletons();
      if (!skeletonIds.length) {
        CATMAID.warn('No skeletons loaded, no connectors to show');
        return;
      }
      CATMAID.ConnectorSelection.showConnectors(null, skeletonIds);
    }
  };

  WebGLApplication.prototype.updateSynapseClusteringBandwidth = function(value) {
    value = CATMAID.tools.validateNumber(value, "Invalid synapse clustering value", 1);
    if (!value) return;
    this.options.synapse_clustering_bandwidth = value;
    if ('synapse-clustering' === this.options.connector_color) {
      var skeletons = this.space.content.skeletons;
      this.space.updateConnectorColors(this.options, Object.keys(skeletons).map(function(skid) { return skeletons[skid]; }, this));
    }
    this.space.render();
  };

  WebGLApplication.prototype.updateSkeletonLineWidth = function(value) {
    value = CATMAID.tools.validateNumber(value, "Invalid skeleton line width value", 1);
    if (!value) return;
    this.options.skeleton_line_width = value;
    var sks = this.space.content.skeletons;
    Object.keys(sks).forEach(function(skid) { sks[skid].changeSkeletonLineWidth(value); });
    this.space.render();
  };

  WebGLApplication.prototype.updateSkeletonNodeHandleScaling = function(value) {
    value = CATMAID.tools.validateNumber(value, "Invalid skeleton node scaling value", 0);
    if (!value) return;
    this.options.skeleton_node_scaling = value;
    var sks = this.space.content.skeletons;
    Object.keys(sks).forEach(function(skid) { sks[skid].scaleNodeHandles(value); });
    this.space.render();
  };

  WebGLApplication.prototype.updateLinkNodeHandleScaling = function(value) {
    value = CATMAID.tools.validateNumber(value, "Invalid link node scaling value", 0);
    if (!value) return;
    this.options.link_node_scaling = value;
    var sks = this.space.content.skeletons;
    Object.keys(sks).forEach(function(skid) { sks[skid].scaleLinkNodeHandles(value); });
    this.space.render();
  };

  WebGLApplication.prototype.updateTextScaling = function(value) {
    value = CATMAID.tools.validateNumber(value, "Invalid text scaling value", 0);
    if (!value) return;
    this.options.text_scaling = value;

    this.space.scene.project.traverse(function(node) {
      if (node instanceof THREE.Mesh) {
        if (node.geometry && node.geometry.type === 'TextGeometry') {
          node.scale.set(value, -value, value);
        }
      }
    });
    this.space.render();
  };

  WebGLApplication.prototype.updateSmoothSkeletonsSigma = function(value) {
    value = CATMAID.tools.validateNumber(value, "Invalid sigma value", 1);
    if (!value) return;
    this.options.smooth_skeletons_sigma = value;
    if (this.options.smooth_skeletons) this.updateSkeletons();
  };

  WebGLApplication.prototype.updateResampleDelta = function(value) {
    value = CATMAID.tools.validateNumber(value, "Invalid resample delta", 1);
    if (!value) return;
    this.options.resampling_delta = value;
    if (this.options.resample_skeletons) this.updateSkeletons();
  };

  WebGLApplication.prototype.updateLocationFiltering = function() {
    // While updating interpolated nodes can be made faster by not reloading the
    // whole set of skeletons, this is a pragmatic implementation to allow a
    // basic version of this functionality.
    var skeletons = this.space.content.skeletons;
    this.reloadSkeletons(Object.keys(skeletons));
  };

  WebGLApplication.prototype.createMeshColorButton = function() {
    var buttonId = 'meshes-color' + this.widgetID,
        labelId = 'mesh-opacity' + this.widgetID;

    var onchange = (function(rgb, alpha, colorChanged, alphaChanged) {
      $('#' + labelId).text(alpha.toFixed(2));
      var color = new THREE.Color(rgb.r, rgb.g, rgb.b);
      this.options.meshes_color = '#' + color.getHexString();
      this.options.meshes_opacity = alpha;
    }).bind(this);

    // Defaults for initialization:
    var options = WebGLApplication.prototype.OPTIONS;

    var colorButton = document.createElement("button");
    colorButton.setAttribute('id', buttonId);
    colorButton.appendChild(document.createTextNode('color'));
    CATMAID.ColorPicker.enable(colorButton, {
      initialColor: options.meshes_color,
      initialAlpha: options.meshes_opacity,
      onColorChange: onchange
    });

    var div = document.createElement('span');
    div.appendChild(colorButton);
    div.appendChild($(
      '<span>(Opacity: <span id="' + labelId + '">' +
        options.meshes_opacity + '</span>)</span>').get(0));
    return div;
  };

  WebGLApplication.prototype.updateActiveNodeNeighborhoodRadius = function(value) {
    value = CATMAID.tools.validateNumber(value, "Invalid value", 1);
    if (!value) return;
    this.options.distance_to_active_node = value;
    if (this.options.shading_method.indexOf('near_active_node') !== -1) {
      var skid = SkeletonAnnotations.getActiveSkeletonId();
      if (skid) {
        var skeleton = this.space.content.skeletons[skid];
        if (skeleton) {
          var colorizer = CATMAID.makeSkeletonColorizer(this.options);
          skeleton.updateSkeletonColor(colorizer);
          this.space.render();
        }
      }
    }
  };

  /** @param shading_method A string with the name of the shading method (e.g. "dendritic-backbone") or an array of such strings.
   */
  WebGLApplication.prototype.updateShadingParameter = function(param, value, shading_method) {
    if (!this.options.hasOwnProperty(param)) {
      console.log("Invalid options parameter: ", param);
      return;
    }

    if (shading_method.constructor === Array) {
      for (var i=0; i<shading_method.length; ++i) {
        this.updateShadingParameter(param, value, shading_method[i]);
      }
      return;
    }

    if (shading_method === 'downstream-of-tag') {
      this.options[param] = value;
    } else {
      // Numerical only
      value = CATMAID.tools.validateNumber(value, "Invalid value", 1);
      if (!value) return;
      this.options[param] = value;
    }
    if (shading_method === this.options.shading_method) {
      this.updateSkeletonColors()
        .then(this.render.bind(this));
    }
  };

  /**
   * This will re-create all skeleton meshes if the shading changed.
   */
  WebGLApplication.prototype.updateNeuronShading = function(shading) {
    if ('basic' !== shading && 'lambert' !== shading) {
      CATMAID.error("Unknown shading: " + shading);
      return;
    }

    // Do nothing if the shading didn't change
    if (shading === this.options['neuron_material']) {
      return;
    }

    // Update shading and update material of all affected geometries
    this.options['neuron_material'] = shading;

    // Update nodeSphere and cylinder of each skeleton
    var staticContent = this.space.staticContent;
    staticContent.updateDynamicMaterials(this.options, true);
    this.setSkeletonShadingType(shading);
  };

  /**
   * Render loop for the given animation.
   */
  WebGLApplication.prototype.renderAnimation = (function() {
    let delta, now, then = Date.now();
    return function(animation, t, singleFrame, options) {
      let interval = 1000 / this.options.animation_fps;

      // Make sure we know this animation
      this.animation = animation;
      this.animationTime = t;
      // Quere next frame for next time point
      if (singleFrame) {
        // Update animation and then render
        animation.update(t, options)
          .then(() => this.space.render())
          .catch(CATMAID.handleError);
      } else {
        now = Date.now();
        delta = now - then;

        if (delta > interval) {
          then = now - (delta % interval);

          // Update animation and then render
          animation.update(t, options)
            .then(() => {
              this.space.render();
              this.animationRequestId = window.requestAnimationFrame(
                  this.renderAnimation.bind(this, animation, t + 1, false, options));
            })
            .catch(CATMAID.handleError);
        } else {
          this.animationRequestId = window.requestAnimationFrame(
              this.renderAnimation.bind(this, animation, t, false, options));
        }
      }
    };
  })();

  /**
   * Start the given animation.
   */
  WebGLApplication.prototype.startAnimation = function(animation, time)
  {
    if (this.animationRequestId) {
      CATMAID.info('There is already an animation running');
      return;
    }

    if (!animation) {
      CATMAID.error("Please provide an animation to play.");
      return;
    }

    // Start animation at time point 0
    this.renderAnimation(animation, time ? time : 0);
  };

  /**
   * Stop the current animation.
   *
   * @param {boolean} pause Don't dispose animation, only stop animating
   */
  WebGLApplication.prototype.stopAnimation = function(pause)
  {
    if (this.animationRequestId) {
      window.cancelAnimationFrame(this.animationRequestId);
      this.animationRequestId = undefined;
    }

    if (this.animation && !pause) {
      if (this.animation.stop) {
        this.animation.stop();
      }
      this.animation = undefined;
    }
  };

  /**
   * Find minimum date in in a set of nodes. Nodes are represented as a list of
   * different versions, ordered newest first. Each list elements consists of a
   * three element list: [validFrom, validTo, nodeData].
   */
  function findMinDate(nodes, currentMin, nodeId) {
    var versions = nodes[nodeId];
    // Expect at least one entry, should be safe
    var min = versions[0][0];
    for (var i=1; i<versions.length; ++i) {
      var d = versions[i][0];
      if (d < min) {
        min = d;
      }
    }
    if (null === currentMin) {
      currentMin = min;
    } else {
      if (min < currentMin) {
        currentMin = min;
      }
    }

    return currentMin;
  }

  /**
   * Find maximum date in in a set of nodes. Nodes are represented as a list of
   * different versions, ordered newest first. Each list elements consists of a
   * three element list: [validFrom, validTo, nodeData].
   */
  function findMaxDate(nodes, currentMax, nodeId) {
    var versions = nodes[nodeId];
    // Expect at least one entry, should be safe
    var max = versions[0][0];
    for (var i=1; i<versions.length; ++i) {
      var d = versions[i][0];
      if (d > max) {
        max = d;
      }
    }
    if (null === currentMax) {
      currentMax = max;
    } else {
      if (max > currentMax) {
        currentMax = max;
      }
    }

    return currentMax;
  }

  /**
   * Create a new animation, based on the 3D viewers current state.
   */
  WebGLApplication.prototype.createAnimation = function(type, params)
  {
    params = params || {};

    // Default to rotation type
    type = type || 'rotation';

    var activeNodeWhilelist = this.getActivesNodeWhitelist();

    if ('rotation' === type) {
      // For now it is always the Y axis rotation
      var options = {
        type: 'rotation',
        axis: this.options.animation_axis,
        camera: this.space.view.camera,
        target: this.space.view.controls.target,
        speed: 2 * Math.PI / (this.options.animation_rotation_time * this.options.animation_fps),
        backandforth: this.options.animation_back_forth,
      };

      let notifyListeners = [];
      let stopListeners = [];

      // Add a notification handler for stepwise visibility, if enabled and at least
      // one skeleton is loaded.
      var visType = this.options.animation_stepwise_visibility_type;
      if (visType !== 'all') {
        // Get current visibility map and create notify handler
        var visMap = this.space.getVisibilityMap();
        var visOpts = this.options.animation_stepwise_visibility_options;
        notifyListeners.push(this.createStepwiseVisibilityHandler(visMap,
            visType, visOpts));
        // Create a stop handler that resets visibility to the state we found before
        // the animation.
        stopListeners.push(this.createVisibibilityResetHandler(visMap));
      }

      if (this.options.animation_animate_z_plane) {
        notifyListeners.push(this.createZPlaneChangeHandler(
            this.options.animation_fps / Number(this.options.animation_zplane_changes_per_sec),
            Number(this.options.animation_zplane_change_step)));
        // Create a stop handler that resets visibility to the state we found before
        // the animation.
        stopListeners.push(this.createZPlaneResetHandler());
      }

      options['notify'] = function() {
        return Promise.all(notifyListeners.map(l => l(...arguments)));
      };

      options['stop'] = () => {
        for (let l of stopListeners) {
          l.apply(window, arguments);
        }
      };

      var animation = CATMAID.AnimationFactory.createAnimation(options);
      return Promise.resolve(animation);
    } else if ('history' === type) {
      // This animation type will make all existing skeletons invisible and add
      // history versions of the same skeletons to the scene. These will store
      // different versions of the skeletons and can switch on and off
      // individual edges based on a time.
      return new Promise((function(resolve, reject) {
        var options = {
          type: 'history'
        };
        // Get current visibility information and set per-skeleton visibility
        // mode to 'history'. This makes skeletons appear with the creation time
        // of their oldest node. Individual nodes and edges of the
        // representation may also be hidden by a location on a time line.
        var visType = 'history';
        // Create notify handler
        var visMap = this.space.getVisibilityMap();
        var visOpts = this.options.animation_stepwise_visibility_options;

        var widget = this;
        let isDone = false;
        if (params.completeHistory) {
          params['isDone'] = function() {
            return isDone;
          };
        }
        options['notify'] = function(currentDate, startDate, endDate) {
          CATMAID.tools.callIfFn(params.notify, currentDate, startDate, endDate);

          // Color skeletons
          var update = widget.updateSkeletonColors();
          if (widget.options.connector_filter) {
            update = update.then(widget.refreshRestrictedConnectors.bind(widget));
          }
          update.then(widget.render.bind(widget));

          // Stop if complete history is rendered
          if (params.completeHistory && currentDate > endDate) {
            isDone = true;
          }
        };
        // Create a stop handler that resets visibility to the state we found before
        // the animation.
        var resetVisibility = this.createVisibibilityResetHandler(visMap);
        options['stop'] = function() {
          if (widget.options.animation_history_reset_after_stop) {
            widget.reloadSkeletons(widget.getSelectedSkeletons());
          }
          resetVisibility();
        };
        options['tickLength'] = this.options.animation_hours_per_tick;
        options['emptyBoutLength'] = this.options.animation_history_empy_bout_length;
        options["skeletonOptions"] = this.options;
        options['completeHistory'] = params.completeHistory;

        var models = this.getSelectedSkeletonModels();
        var skeletonIds = this.getSelectedSkeletons();

        if (!skeletonIds || 0 === skeletonIds.length) {
          reject("No skeletons available");
          return;
        }
        var url1 = CATMAID.makeURL(project.id + '/skeletons/'),
            lean = this.options.lean_mode,
            url2 = '/compact-detail';
        // Get historic data of current skeletons. Create a map of events, Which
        // are consumed if their time is ready.
        var now = new Date();
        var include_merges = this.options.animation_history_include_merges;

        fetchSkeletons.call(this,
            skeletonIds,
            function(skeletonId) {
              return url1 + skeletonId + url2;
            },
            function(skeleton_id) {
              return {
                with_tags: !lean,
                with_connectors: !lean,
                with_history: true,
                with_merge_history: include_merges
              };
            },
            (function(skeleton_id, json) {
              // Update existing skeletons with history information
              this.space.updateSkeleton(models[skeleton_id], json, this.options,
                  true, activeNodeWhilelist);
            }).bind(this),
            function(skeleton_id) {
              // Failed loading: will be handled elsewhere via fnMissing in
              // fetchCompactSkeletons
            },
            (function() {

              // Create animation
              var skeletons = this.space.content.skeletons;
              options["skeletons"] = skeletons;
              if (!this.options.animation_record_timerange &&
                  this.options.animation_start_date) {
                options['startDate'] = this.options.animation_start_date;
              } else {
                options["startDate"] = Object.keys(skeletons).reduce(function(d, s) {
                  var skeleton = skeletons[s];
                  if (!skeleton.history) {
                    throw new CATMAID.ValueError('Skeleton ' + skeleton.id +
                        ' is missing history information');
                  }
                  // Find oldest node date
                  var nodes = skeleton.history.nodes;
                  var find = findMinDate.bind(this, nodes);
                  var minDate = Object.keys(nodes).reduce(find, null);

                  if (null === d) {
                    d = minDate;
                  } else if (minDate < d) {
                    d = minDate;
                  }

                  return d;
                }, null);
              }
              if (!this.options.animation_record_timerange &&
                  this.options.animation_end_date) {
                options['endDate'] = this.options.animation_end_date;
              } else {
                options["endDate"] = Object.keys(skeletons).reduce(function(d, s) {
                  var skeleton = skeletons[s];
                  if (!skeleton.history) {
                    throw new CATMAID.ValueError('Skeleton ' + skeleton.id +
                        ' is missing history information');
                  }
                  // Find newest node date
                  var nodes = skeleton.history.nodes;
                  var find = findMaxDate.bind(this, nodes);
                  var maxDate = Object.keys(nodes).reduce(find, null);

                  if (null === d) {
                    d = maxDate;
                  } else if (maxDate > d) {
                    d = maxDate;
                  }

                  return d;
                }, null);
              }

              var animation = CATMAID.AnimationFactory.createAnimation(options);
              resolve(animation);
            }).bind(this),
            'GET');
      }).bind(this));
    } else {
      throw new CATMAID.ValueError("Unknown animation type: " + type);
    }
  };

  /**
   * Create a notification handler to be used with animations that will make
   * an additional neuron visible with every call.
   */
  WebGLApplication.prototype.createStepwiseVisibilityHandler = function(
      visMap, type, options) {
    type = type || 'all';
    options = options || {};

    // Get all visible skeletons
    var skeletonIds = Object.keys(this.space.content.skeletons)
        .filter(function(skid) {
           return this[skid].visible;
        }, this.space.content.skeletons);

    // Return no-op handler if there are no skeletons
    if (skeletonIds.length === 0) {
      return function() {};
    }

    // Create function to animate neuron visibility
    var visibility = CATMAID.WebGLApplication.AnimationNeuronVisibilities[type];
    var widget = this;
    if ('all' === type) {
      // If all should be shown, make all visible and return no-op
      widget.space.setSkeletonVisibility(visMap, this.space.content.skeletons);
      return function() {};
    } else if (CATMAID.tools.isFn(visibility)) {
      var visibleSkeletons = [];
      let lastRotationSeen;
      return function (r, tr) {
        // Only act on new rotation counts.
        if (r === lastRotationSeen) {
          return;
        }
        lastRotationSeen = r;
        visibility(options, skeletonIds, visibleSkeletons, r);
        widget.space.setSkeletonVisibility(visMap, visibleSkeletons);
      };
    } else {
      throw new CATMAID.ValueError('Don\'t recognize neuron visibility ' +
          'animation mode "' + visibility + '".');
    }
  };

  /**
   * Create a handler function that resets visibility of all loaded skeletons.
   */
  WebGLApplication.prototype.createVisibibilityResetHandler = function(visMap)
  {
    return (function() {
      this.space.setSkeletonVisibility(visMap);
      this.space.render();
    }).bind(this);
  };

  WebGLApplication.prototype.createZPlaneChangeHandler = function(frameChangeRate, changeStep) {
    // Show Z plane
    this.options.show_zplane = true;
    this.adjustStaticContent();

    let steps = 0;
    return (rotation, frame) => {
      steps = Math.floor(frame / frameChangeRate);
      let offset = steps * changeStep;
      return this.space.staticContent.updateZPlanePosition(this.space, project.focusedStackViewer, offset);
    };
  };

  WebGLApplication.prototype.createZPlaneResetHandler = function(visible, zLocation) {
    return () => {
      this.space.staticContent.updateZPlanePosition(this.space, project.focusedStackViewer);
      this.options.show_zplane = visible;
      this.adjustStaticContent();
    };
  };

  /**
   * Export an animation as WebM video (if the browser supports it). First, a
   * dialog is shown to adjust export preferences.
   */
  WebGLApplication.prototype.exportAnimation = function()
  {
    var dialog = new CATMAID.OptionsDialog("Animation export options");
    dialog.appendMessage('Adjust the animation export settings to your liking. ' +
       'The resulting file will be in WebM format and might take some seconds ' +
       'to be generated. The default frame size matches the current size of ' +
       'the 3D viewer.');

    // Add options to dialog
    var historyField = dialog.appendCheckbox('Reconstruction history',
        'animation-export-history', false);
    var rotationsField = dialog.appendField("# Rotations: ",
        "animation-export-num-rotations", '1');
    var rotationtimeField = dialog.appendField("Rotation time (s): ",
        "animation-export-rotation-time", '15');
    var backforthField = dialog.appendCheckbox('Back and forth',
        'animation-export-backforth', this.options.animation_back_forth);
    var completeHistoryCheckbox = dialog.appendCheckbox('Complete history',
        'animation-complete-history', true);
    var nframesField = dialog.appendField("# Frames: ",
        "animation-export-nframes", '100');
    var framerateField = dialog.appendField("Frames per second: ",
        "animation-export-frame-rate", '25');
    var frameWidthField = dialog.appendField("Frame width (px): ",
        "animation-export-frame-width", this.space.canvasWidth % 2 === 0 ?
        this.space.canvasWidth : (this.space.canvasWidth - 1));
    var frameHeightField = dialog.appendField("Frame height (px): ",
        "animation-export-frame-height", this.space.canvasHeight % 2 === 0 ?
        this.space.canvasHeight : (this.space.canvasHeight - 1));
    var zSectionField = dialog.appendCheckbox('Animate stack Z plane',
        'animation-export-restore-view', this.options.show_zplane);
    var zSectionChangeRate = dialog.appendField("Z plane changes per sec: ",
        "animation-export-z-change-rate", this.options.animation_zplane_changes_per_sec);
    var zSectionStep = dialog.appendField("Z plane Change step (n): ",
        "animation-export-z-step", this.options.animation_zplane_change_step);

    if (!this.options.show_zplane) {
      zSectionChangeRate.parentNode.style.display = 'none';
      zSectionStep.parentNode.style.display = 'none';
    }

    var restoreViewField = dialog.appendCheckbox('Restore view',
        'animation-export-restore-view', true);
    var camera = this.space.view.camera;
    var target = this.space.view.controls.target;
    var rotationAxis = this.options.animation_axis;

    nframesField.parentNode.style.display = 'none';
    nframesField.disabled = true;
    completeHistoryCheckbox.parentNode.style.display = 'none';
    completeHistoryCheckbox.onchange = function() {
      nframesField.disabled = this.checked;
    };

    zSectionField.onchange = function() {
      let newDisplayVal = this.checked ? 'block' : 'none';
      zSectionChangeRate.parentNode.style.display = newDisplayVal;
      zSectionStep.parentNode.style.display = newDisplayVal;
    };

    historyField.onchange = function() {
      let rotationVisibility = this.checked ? 'none' : 'block';
      let historyVisibility = this.checked ? 'block' : 'none';
      rotationsField.parentNode.style.display = rotationVisibility;
      rotationtimeField.parentNode.style.display = rotationVisibility;
      backforthField.parentNode.style.display = rotationVisibility;
      nframesField.parentNode.style.display = historyVisibility;
      completeHistoryCheckbox.parentNode.style.display = historyVisibility;
    };

    var docURL = CATMAID.makeDocURL('user_faq.html#faq-3dviewer-webm');
    dialog.appendHTML('Note: you can convert the resulting WebM file to ' +
        'other formats. Have a look at the <a href="' + docURL +
        '" target="_blank">documentation</a> for more information.');

    dialog.onOK = handleOK.bind(this);

    dialog.show(400, "auto", true);

    function handleOK() {
      var width = parseInt(frameWidthField.value);
      var height = parseInt(frameHeightField.value);

      if (!width || width % 2 === 1) {
        throw new CATMAID.Warning("Please an even number as width");
      }
      if (!height || height % 2 === 1) {
        throw new CATMAID.Warning("Please an even number as height");
      }


      /* jshint validthis: true */ // `this` is bound to this WebGLApplication
      $.blockUI({message: '<img src="' + CATMAID.staticURL +
          'images/busy.gif" /> <span>Rendering animation frame ' +
          '<div id="counting-rendered-frames">0</div></span><div><p>' +
          '<input type="button" value="Cancel" id="block-ui-dialog-btn"></p></div>'});

      // Provide option to cancel
      var cancelationRequested = false;
      $(document).on('click', '#block-ui-dialog-btn', (function(){
        cancelationRequested = true;
      }).bind(this));

      var originalCameraView = this.space.view.getView();

      // Get current visibility
      var visMap = this.space.getVisibilityMap();

      createAnimation.call(this);

      function createAnimation() {
        // Get current visibility map and create notify handler
        var visMap = this.space.getVisibilityMap();

        try {
          var framerate = parseInt(framerateField.value);

          // Collect options
          let nframes;
          var options = {
            camera: camera,
            target: target,
          };
          if (historyField.checked) {
            nframes = parseInt(nframesField.value);
            options.completeHistory = completeHistoryCheckbox.checked;
          } else {
            var rotations = parseFloat(rotationsField.value);
            var rotationtime = parseFloat(rotationtimeField.value);
            nframes = Math.ceil(rotations * rotationtime * framerate);
            options.type = 'rotation';
            options.axis = rotationAxis;
            options.speed = 2 * Math.PI / (rotationtime * framerate);
            options.backandforth = backforthField.checked;
            options.restoreView = restoreViewField.checked;
          }

          let notifyListeners = [];
          let stopListeners = [];

          // Add a notification handler for stepwise visibility, if enabled and at least
          // one skeleton is loaded.
          if ('all' !== this.options.animation_stepwise_visibility_type) {
            var visType = this.options.animation_stepwise_visibility_type;
            var visOpts = this.options.animation_stepwise_visibility_options;
            notifyListeners.push(this.createStepwiseVisibilityHandler(visMap,
                visType, visOpts));
            // Create a stop handler that resets visibility to the state we found before
            // the animation.
            stopListeners.push(this.createVisibibilityResetHandler(visMap));
          }

          if (zSectionField.checked) {
            notifyListeners.push(this.createZPlaneChangeHandler(
                framerate / Number(zSectionChangeRate.value), Number(zSectionStep.value)));
            // Create a stop handler that resets visibility to the state we found before
            // the animation.
            stopListeners.push(this.createZPlaneResetHandler());
          }

          options['notify'] = function() {
            return Promise.all(notifyListeners.map(l => l(...arguments)));
          };

          options['stop'] = function() {
            for (let l of stopListeners) {
              l.apply(window, arguments);
            }
          };

          // Set up export without any existing information. An encoder is not
          // used, because we want to write binary data directly.
          let exporter = CATMAID.FileExporter.export(null, "catmaid_3d_view.webm",
              'video/webm', 'auto', null);

          // This mimiks a FileWriter that WebMWriter is able to handle and
          // redirects it to the exporter.
          let miniFileWriter = {
            pos: () => 0,
            write: (data) => {
              exporter.write(data);
              miniFileWriter.pos += data.size;
              if (CATMAID.tools.isFn(miniFileWriter.onwriteend)) {
                miniFileWriter.onwriteend();
              }
            },
            onwriteend: null,
            // Ignore seek requests, we work with a stream.
            seek: () => {},
            // A hack to to get the WebmWriter to give us binary data rather
            // than a blob that we would then have to convert again.
            acceptsBinary: true,
          };

          let webmWriter = new WebMWriter({
            fileWriter: miniFileWriter,
            frameRate: framerate,
          });

          let exportWasCanceled = false;
          let cleanup = () => {
              options.stop();
              // Reset visibility and unblock UI
              this.space.setSkeletonVisibility(visMap);

              if (options.restoreView || exportWasCanceled) {
                // Reset camera view
                this.space.view.setView(originalCameraView.target,
                    originalCameraView.position, originalCameraView.up,
                    originalCameraView.zoom, originalCameraView.orthographic);
                this.space.render();
              }

              if (reload) {
                this.reloadSkeletons(this.getSelectedSkeletons());
              }
              $.unblockUI();
          };

          // Indicate progress
          var counter = $('#counting-rendered-frames');
          var onStep = function(i, nframes, frameCanvas) {
            counter.text((i + 1) + " / " + nframes);
            try {
              webmWriter.addFrame(frameCanvas);
            } catch (e) {
              cancelationRequested = true;
              exportWasCanceled = true;
              CATMAID.handleError(e);
              cleanup();
            }
          };

          // Cancel, if askes for
          var shouldCancel = function() {
            return cancelationRequested;
          };

          // Save result to file
          var reload = historyField.checked;
          var onDone = (function(canceled) {
            if (canceled) {
              exportWasCanceled = true;
              CATMAID.warn("Animation export canceled");
              cleanup();
            } else {
              // Export movie
              webmWriter.complete()
                .then(() => exporter.save())
                .finally(() => cleanup());
            }
          }).bind(this);

          // Get frame images
          var prepare;
          if (historyField.checked) {
            prepare = this.createAnimation('history', options)
              .then(animation => {
                if (options.completeHistory) {
                  // Update frame number of frames to render.
                  nframes = Infinity;
                }
                return animation;
              });
          } else {
            prepare = Promise.resolve(CATMAID.AnimationFactory.createAnimation(options));
          }

          prepare.then((function(animation) {
              this.getAnimationFrames(animation, nframes, undefined,
                  width, height, onDone, onStep, shouldCancel, options);
            }).bind(this))
            .catch(error => {
              exportWasCanceled = true;
              cleanup();
              CATMAID.warn(error);
            });
        } catch (e) {
          // Unblock UI and re-throw exception
          this.space.setSkeletonVisibility(visMap);
          $.unblockUI();
          throw e;
        }
      }
    }
  };

  /**
   * Create a list of images for a given animation and the corresponding options.
   * By default, 100 frames are generated, starting from timepoint zero.
   * Optionally, a function can be passed in that is called after every exported
   * frame. Another optional function shouldCancel() can be passed in that is
   * asked every frame if the operation should be canceled.
   */
  WebGLApplication.prototype.getAnimationFrames = function(animation, nframes,
      startTime, width, height, onDone, onStep, shouldCancel, options)
  {
    // Save current dimensions and set new ones, if available
    var originalWidth, originalHeight;
    if (width && height) {
      if (width !== this.space.canvasWidth || height !== this.space.canvasHeight) {
        originalWidth = this.space.canvasWidth;
        originalHeight = this.space.canvasHeight;
      }
    }

    // Save current view
    var originalView = options.camera.position.clone();

    onStep = onStep || function() {};
    nframes = nframes || 100;
    startTime = startTime || 0;

    // An optional terminal function
    let isDone = CATMAID.tools.isFn(options.isDone) ? options.isDone : () => false;

    // Render each frame in own timeout to be able to update UI between frames.
    setTimeout(renderFrame.bind(this, animation, startTime, 0, nframes,
          width, height, onDone, onStep, shouldCancel), 5);

    function renderFrame(animation, startTime, i, nframes, w, h, onDone,
        onStep, shouldCancel) {
      if (shouldCancel && shouldCancel()) {
        onDone(true);
        return;
      }
      /* jshint validthis: true */ // `this` is bound to this WebGLApplication
      let promiseUpdate = animation.update(startTime + i);
      if (!promiseUpdate) {
        promiseUpdate = Promise.resolve();
      }
      // Make sure we still render with the correct size and redraw
      this.resizeView(w, h);
      // Add canvas to output array and callback
      onStep(i, nframes, this.space.view.renderer.domElement);

      // Render next frame if there are more frames
      var nextFrame = i + 1;
      if (nextFrame < nframes && (!isDone())) {
        promiseUpdate.then(() => {
          setTimeout(renderFrame.bind(this, animation, startTime, nextFrame,
                nframes, w, h, onDone, onStep, shouldCancel), 5);
        });
      } else {
        // Restore original view, if not disabled
        if (options.restoreView) {
          options.camera.position.copy(originalView);
        }
        // Restore original dimensions
        if (originalWidth && originalHeight) {
          this.resizeView(originalWidth, originalHeight);
        }

        onDone();
      }
    }
  };

  /** Measure distances along cable to synapses or other features, and count synapses. */
  WebGLApplication.prototype.countObjects = function() {

    if (0 === this.getSelectedSkeletons().length) {
      CATMAID.msg("Information", "Add one or more skeletons first!");
      return;
    }

    var dialog = new CATMAID.OptionsDialog("Count");
    dialog.appendMessage("(For measurements and synapse counts of whole arbors, plot morphological measurements in the Circuit Graph Plot (the [P] icon) and then export to CSV.)");

    var kind = dialog.appendChoice("Count: ", "kind",
        ["postsynaptic sites",
         "presynaptic sites",
         "skeleton nodes tagged with..."],
        ["pre",
         "post",
         "tags"]);

    var atags = (function(skeletons) {
      var tags = Object.keys(skeletons).reduce(function(o, skid) {
        Object.keys(skeletons[skid].tags).forEach(function(tag) { o[tag] = true; });
        return o;
      }, {});
      var a = Object.keys(tags);
      a.sort();
      return a;
    })(this.space.content.skeletons);

    var tag_choice = dialog.appendChoice("Tag (if applicable): ", "tag",
        atags,
        atags);

    var reference = dialog.appendChoice("Reference node: ", "ref",
        ["active node",
         "root node"],
        ["active",
         "root"]);

    var max_distance = dialog.appendField("Max. distance (nm): ", "max", this.options.distance_to_active_node, false);

    var mode = dialog.appendChoice("Mode: ", "mode",
        ["along cable (selected arbor only)",
         "Euclidean distance (all arbors)"],
        ["cable",
         "euclidean"]);

    dialog.onOK = (function() {
      var active_node = SkeletonAnnotations.getActiveNodeId();
      var active_skid = SkeletonAnnotations.getActiveSkeletonId();
      var max = Number(max_distance.value); // TODO may fail as non-numeric
      var sks = this.space.content.skeletons;
      var tag = atags.length > 0 ? atags[tag_choice.selectedIndex] : null;

      // Select skeletons
      var skids;
      if (0 === mode.selectedIndex) {
        // Along cable (selected arbor only)
        var sk = sks[active_skid];
        if (!sk || !sk.visible) {
          CATMAID.msg("Oops", "Active skeleton not among those in the 3D Viewer");
          return;
        }
        skids = [active_skid];
      } else {
        skids = Object.keys(this.space.content.skeletons);
      }

      var countRelationFn = function(type, synapse_map) {
        return function(node) {
          var relations = synapse_map[node];
          if (!relations) return 0;
          return relations.reduce(function(sum, relation) {
            return sum + (type === relation.type ? 1 : 0);
          }, 0);
        };
      };

      // Count function generator: 'o' is a synapse map or the map of text tags, keyed by treenode ID
      var counterFn = function(skid) {
        switch (kind.selectedIndex) {
          case 0: // postsynaptic site
            return countRelationFn(1, sks[skid].createSynapseMap());
          case 1: // presynaptic site
            return countRelationFn(0, sks[skid].createSynapseMap());
          case 2: // text tag
            if (tag && sks[skid].tags[tag]) {
              return (function(tag, node) {
                var tags = this[node]; // 'this' is the tag map
                return tags && tags[tag] ? 1 : 0;
              }).bind(sks[skid].createTagMap(), tag);
            } else {
              // not present in skeleton
              return null;
            }
            // Required to make JSHint stop complaining
            /*falls through*/
          default:
            CATMAID.msg("Error", "Unknown kind");
            return null;
        }
      };

      var origin = null;
      if (0 === reference.selectedIndex && 1 === mode.selectedIndex) {
        // Use active node as reference for all skeletons
        var p = SkeletonAnnotations.getActiveNodePositionW();
        origin = new THREE.Vector3d(p.x, p.y, p.z);
      }

      var rows = [];
      var exporter = CATMAID.FileExporter.export('"Skeleton ID", "Name", "Count"\n',
          'catmaid-object-count.csv', 'text/csv');

      skids.forEach(function(skid) {
        var counter = counterFn(skid); // will be null when nothing to count
        var count = 0;

        if (counter) {
          var positions = sks[skid].getPositions();
          var arbor = sks[skid].createArbor();

          if (0 === mode.selectedIndex) {
            // Along cable
            if (0 === reference.selectedIndex) {
              arbor.reroot(active_node); // guaranteed above to belong to the skeleton
            }
            var distances = arbor.nodesDistanceTo(arbor.root, function(child, paren) { return positions[child].distanceTo(positions[paren]); }).distances;
            arbor.nodesArray().forEach(function(node) {
              if (distances[node] < max) count += counter(node);
            });
          } else {
            // Euclidean distance
            var o = origin;
            if (1 === reference.selectedIndex) {
              var o = positions[arbor.root];
            }
            arbor.nodesArray().forEach(function(node) {
              if (o.distanceTo(positions[node]) < max) count += counter(node);
            });
          }
        }

        exporter.write(`${skid}, ${CATMAID.NeuronNameService.getInstance().getName(skid)}, ${count}\n`);
      }, this);

      exporter.save();

    }).bind(this);

    dialog.show(400, 300, false);
  };

  var fieldCoordMapping = {
    'interpolated_sections_x': 'x',
    'interpolated_sections_y': 'y',
    'interpolated_sections_z': 'z',
  };

  CATMAID.registerState(WebGLApplication, {
    key: "3d-viewer",
    getState: function(widget) {
      // Remove font, because it is too big for cookie storage
      var state = widget.options.clone();
      delete state['font'];
      // Add volume information
      let volumes = JSON.stringify(
          Array.from(widget.loadedVolumes.keys()).reduce(function(o, v) {
            let volume = widget.loadedVolumes.get(v);
            let meshes = volume.meshes;
            for (let i=0, imax=meshes.length; i<imax; ++i) {
              let mesh = meshes[i];
              o.push({
                'id': v,
                'color': mesh.material.color.getStyle(),
                'opacity': mesh.material.opacity,
                'wireframe': mesh.material.wireframe,
                'subdiv': volume.subdivisions,
                'bb': volume.boundingBox
              });
            }
            return o;
          }, []));
      return {
        options: state,
        volumes: volumes
      };
    },
    setState: function(widget, state) {
      if (state.options) {
        for (var field in widget.options) {
          // The interpolatable section settings pull also information from the
          // back-end. Merge this persisted information with the widget state
          // information.
          if (field === 'interpolated_sections_x' ||
              field === 'interpolated_sections_y' ||
              field === 'interpolated_sections_z') {
            var existingData = project.interpolatableSections[fieldCoordMapping[field]];
            var stateData = state.options[field];
            if (stateData) {
              var idx = new Set(existingData);
              for (var i=0; i<stateData.length; ++i) {
                if (!idx.has(stateData[i])) {
                  existingData.push(stateData[i]);
                }
              }
            }
            widget.options[field] = existingData;
          } else {
            CATMAID.tools.copyIfDefined(state.options, widget.options, field);
          }
        }
      }
      if (state.volumes) {
        let volumes = JSON.parse(state.volumes);
        volumes.forEach(function(v) {
          widget.showVolume(v.id, true, v.color, v.opacity, !v.wireframe,
              v.subdiv, v.bb)
            .catch(CATMAID.handleError);
        });
      }
    }
  });

  // Make 3D viewer available in CATMAID namespace
  CATMAID.WebGLApplication = WebGLApplication;


})(CATMAID);
