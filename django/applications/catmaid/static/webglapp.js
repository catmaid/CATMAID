/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/* Only methods of the WebGLApplication object elicit a render. All other methods
 * do not, except for those that use continuations to load data (meshes) or to
 * compute with web workers (betweenness centrality shading). */
var WebGLApplication = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();
  // Indicates whether init has been called
  this.initialized = false;
};

WebGLApplication.prototype = {};
$.extend(WebGLApplication.prototype, new InstanceRegistry());
$.extend(WebGLApplication.prototype, new SkeletonSource());

WebGLApplication.prototype.init = function(canvasWidth, canvasHeight, divID) {
	if (this.initialized) {
		return;
	}
	this.divID = divID;
	this.container = document.getElementById(divID);
	this.stack = project.focusedStack;
  this.submit = new submitterFn();
	this.options = new WebGLApplication.prototype.OPTIONS.clone();
	this.space = new this.Space(canvasWidth, canvasHeight, this.container, this.stack);
  this.updateActiveNodePosition();
	this.initialized = true;
};

WebGLApplication.prototype.getName = function() {
  return "3D View " + this.widgetID;
};

WebGLApplication.prototype.destroy = function() {
  this.unregisterInstance();
  this.unregisterSource();
  this.space.destroy();
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

WebGLApplication.prototype.getSelectedSkeletonModels = function() {
	var skeletons = this.space.content.skeletons;
	return Object.keys(skeletons).reduce(function(m, skid) {
    var skeleton = skeletons[skid];
    if (skeleton.visible) {
      m[skid] = new SelectionTable.prototype.SkeletonModel(skid, skeleton.skeletonmodel.baseName, skeleton.actorColor.clone());
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

    this.space.setSize(canvasWidth, canvasHeight);

    this.space.render();
  }
};

WebGLApplication.prototype.fullscreenWebGL = function() {
	if (THREEx.FullScreen.activated()){
		var w = canvasWidth, h = canvasHeight;
		this.resizeView( w, h );
		THREEx.FullScreen.cancel();
	} else {
		THREEx.FullScreen.request(document.getElementById('viewer-3d-webgl-canvas' + this.widgetID));
		var w = window.innerWidth, h = window.innerHeight;
		this.resizeView( w, h );
	}
	this.space.render();
};

WebGLApplication.prototype.Options = function() {
	this.show_meshes = false;
  this.meshes_color = "0xffffff";
	this.show_missing_sections = false;
	this.missing_section_height = 20;
	this.show_active_node = true;
	this.show_floor = true;
	this.show_background = true;
	this.show_box = true;
	this.show_zplane = false;
	this.connector_filter = false;
  this.shading_method = 'none';
  this.color_method = 'none';
  this.connector_color = 'cyan-red';
  this.lean_mode = false;
  this.synapse_clustering_bandwidth = 5000;
  this.smooth_skeletons = false;
  this.smooth_skeletons_sigma = 200; // nm
  this.resample_skeletons = false;
  this.resampling_delta = 3000; // nm
  this.skeleton_line_width = 3;
};

WebGLApplication.prototype.Options.prototype = {};

WebGLApplication.prototype.Options.prototype.clone = function() {
	var src = this;
	return Object.keys(this).reduce(
			function(copy, key) { copy[key] = src[key]; return copy; },
			new WebGLApplication.prototype.Options());
};

WebGLApplication.prototype.Options.prototype.validateOctalString = function(id, default_color_string) {
  var sf = $(id);
  if (!sf) {
    return default_color_string;
  }
  var s = sf.val();
  if (8 === s.length && '0' === s[0] && 'x' === s[1] && /0x[0-9a-f]{6}/.exec(s)) {
    return s;
  }
  return default_color_string;
};

WebGLApplication.prototype.Options.prototype.createMeshMaterial = function(id) {
  var color;
  if (id) color = parseInt(this.validateOctalString(id, this.meshes_color));
  else color = parseInt(this.meshes_color);
  return new THREE.MeshBasicMaterial({color: color, opacity:0.2, wireframe: true});
};


/** Persistent options, get replaced every time the 'ok' button is pushed in the dialog. */
WebGLApplication.prototype.OPTIONS = new WebGLApplication.prototype.Options();

WebGLApplication.prototype.updateZPlane = function() {
	this.space.staticContent.updateZPlanePosition(this.stack);
	this.space.render();
};

WebGLApplication.prototype.staticUpdateZPlane = function() {
  this.getInstances().forEach(function(instance) {
    instance.updateZPlane();
  });
};

/** Receives an extra argument (an event) which is ignored. */
WebGLApplication.prototype.updateColorMethod = function(colorMenu) {
  this.options.color_method = colorMenu.value;
  this.updateSkeletonColors();
};

WebGLApplication.prototype.updateSkeletonColors = function(callback) {
  var fnRecolor = (function() {
    Object.keys(this.space.content.skeletons).forEach(function(skeleton_id) {
      this.space.content.skeletons[skeleton_id].updateSkeletonColor(this.options);
    }, this);
    if (typeof callback === "function") {
      try { callback(); } catch (e) { alert(e); }
    }
    this.space.render();
  }).bind(this);

  if (-1 !== this.options.color_method.indexOf('reviewed')) {
    var skeletons = this.space.content.skeletons;
    // Find the subset of skeletons that don't have their reviews loaded
    var skeleton_ids = Object.keys(skeletons).filter(function(skid) {
      return !skeletons[skid].reviews;
    });
    // Will invoke fnRecolor even if the list of skeleton_ids is empty
    fetchSkeletons(
        skeleton_ids,
        function(skeleton_id) {
          return django_url + project.id + '/skeleton/' + skeleton_id + '/reviewed-nodes';
        },
        function(skeleton_id) { return {}; }, // post
        function(skeleton_id, json) {
          skeletons[skeleton_id].reviews = json;
        },
        function(skeleton_id) {
          // Failed loading
          skeletons[skeleton_id].reviews = {}; // dummy
          console.log('ERROR: failed to load reviews for skeleton ' + skeleton_id);
        },
        fnRecolor);
  } else if ('axon-and-dendrite' === this.options.color_method) {
    var skeletons = this.space.content.skeletons;
    // Find the subset of skeletons that don't have their axon loaded
    var skeleton_ids = Object.keys(skeletons).filter(function(skid) {
      return !skeletons[skid].axon;
    });
    fetchSkeletons(
        skeleton_ids,
        function(skid) {
          return django_url + project.id + '/' + skid + '/0/1/0/compact-arbor';
        },
        function(skid) { return {}; }, // post
        function(skid, json) {
          skeletons[skid].axon = skeletons[skid].splitByFlowCentrality(json);
        },
        function(skid) {
          // Failed loading
          skeletons[skid].axon = {}; // dummy
          console.log('ERROR: failed to load axon-and-dendrite for skeleton ' + skid);
        },
        fnRecolor);
  } else {
    fnRecolor();
  }
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

WebGLApplication.prototype.toggleConnectors = function() {
  this.options.connector_filter = ! this.options.connector_filter;

  var f = this.options.connector_filter;
  var skeletons = this.space.content.skeletons;
  var skids = Object.keys(skeletons);

  skids.forEach(function(skid) {
    skeletons[skid].setPreVisibility( !f );
    skeletons[skid].setPostVisibility( !f );
    $('#skeletonpre-'  + skid).attr('checked', !f );
    $('#skeletonpost-' + skid).attr('checked', !f );
  });

  if (this.options.connector_filter) {
    this.refreshRestrictedConnectors();
  } else {
    skids.forEach(function(skid) {
      skeletons[skid].remove_connector_selection();
    });
    this.space.render();
  }
};

WebGLApplication.prototype.refreshRestrictedConnectors = function() {
	if (!this.options.connector_filter) return;
	// Find all connector IDs referred to by more than one skeleton
	// but only for visible skeletons
	var skeletons = this.space.content.skeletons;
	var visible_skeletons = Object.keys(skeletons).filter(function(skeleton_id) { return skeletons[skeleton_id].visible; });
  var synapticTypes = this.space.Skeleton.prototype.synapticTypes;

	var counts = visible_skeletons.reduce(function(counts, skeleton_id) {
    return synapticTypes.reduce(function(counts, type) {
      var vertices = skeletons[skeleton_id].geometry[type].vertices;
      // Vertices is an array of Vector3, every two a pair, the first at the connector and the second at the node
      for (var i=vertices.length-2; i>-1; i-=2) {
        var connector_id = vertices[i].node_id;
        if (!counts.hasOwnProperty(connector_id)) {
          counts[connector_id] = {};
        }
        counts[connector_id][skeleton_id] = null;
      }
      return counts;
    }, counts);
  }, {});

	var common = {};
	for (var connector_id in counts) {
		if (counts.hasOwnProperty(connector_id) && Object.keys(counts[connector_id]).length > 1) {
			common[connector_id] = null; // null, just to add something
		}
	}

  var visible_set = visible_skeletons.reduce(function(o, skeleton_id) {
    o[skeleton_id] = null;
    return o;
  }, {});

  for (var skeleton_id in skeletons) {
    if (skeletons.hasOwnProperty(skeleton_id)) {
      skeletons[skeleton_id].remove_connector_selection();
      if (skeleton_id in visible_set) {
        skeletons[skeleton_id].create_connector_selection( common );
      }
    }
	}

	this.space.render();
};

WebGLApplication.prototype.set_shading_method = function() {
  // Set the shading of all skeletons based on the state of the "Shading" pop-up menu.
  this.options.shading_method = $('#skeletons_shading' + this.widgetID + ' :selected').attr("value");

  var skeletons = this.space.content.skeletons;
  try {
    $.blockUI();
    Object.keys(skeletons).forEach(function(skid) {
      skeletons[skid].updateSkeletonColor(this.options);
    }, this);
  } catch (e) {
    console.log(e, e.stack);
    alert(e);
  }
  $.unblockUI();

  this.space.render();
};

WebGLApplication.prototype.look_at_active_node = function() {
	this.space.content.active_node.updatePosition(this.space, this.options);
	this.space.view.controls.target = this.space.content.active_node.mesh.position.clone();
	this.space.render();
};

WebGLApplication.prototype.updateActiveNodePosition = function() {
	this.space.content.active_node.updatePosition(this.space, this.options);
  if (this.space.content.active_node.mesh.visible) {
    this.space.render();
  }
};

WebGLApplication.prototype.staticUpdateActiveNodePosition = function() {
  this.getInstances().map(function(instance) {
    instance.updateActiveNodePosition();
  });
};

WebGLApplication.prototype.has_skeleton = function(skeleton_id) {
	return this.space.content.skeletons.hasOwnProperty(skeleton_id);
};

/** Reload only if present. */
WebGLApplication.prototype.staticReloadSkeletons = function(skeleton_ids) {
  this.getInstances().forEach(function(instance) {
    var models = skeleton_ids.filter(instance.hasSkeleton, instance)
                             .reduce(function(m, skid) {
                               if (instance.hasSkeleton(skid)) m[skid] = instance.getSkeletonModel(skid);
                               return m;
                             }, {});
    instance.space.removeSkeletons(skeleton_ids);
    instance.updateModels(models);
  });
};

/** Fetch skeletons one by one, and render just once at the end. */
WebGLApplication.prototype.addSkeletons = function(models, callback) {
  // Update skeleton properties for existing skeletons, and remove them from models
  var skeleton_ids = Object.keys(models).filter(function(skid) {
    if (skid in this.space.content.skeletons) {
      var model = models[skid],
          skeleton = this.space.content.skeletons[skid];
      skeleton.skeletonmodel = model;
      skeleton.setActorVisibility(model.selected);
      skeleton.setPreVisibility(model.pre_visible);
      skeleton.setPostVisibility(model.post_visible);
      skeleton.setTextVisibility(model.text_visible);
      skeleton.actorColor = model.color.clone();
      skeleton.updateSkeletonColor(this.options);
      return false;
    }
    return true;
  }, this);

  if (0 === skeleton_ids.length) return;

  var options = this.options;
  var url1 = django_url + project.id + '/',
      lean = options.lean_mode ? 0 : 1,
      url2 = '/' + lean  + '/' + lean + '/compact-skeleton';


  fetchSkeletons(
      skeleton_ids,
      function(skeleton_id) {
        return url1 + skeleton_id + url2;
      },
      function(skeleton_id) {
        return {}; // the post
      },
      (function(skeleton_id, json) {
        var sk = this.space.updateSkeleton(models[skeleton_id], json, options);
        if (sk) sk.show(this.options);
      }).bind(this),
      function(skeleton_id) {
        // Failed loading: will be handled elsewhere via fnMissing in fetchCompactSkeletons
      },
      (function() {
        this.updateSkeletonColors(
          (function() {
              if (this.options.connector_filter) this.refreshRestrictedConnectors();
              if (typeof callback === "function") {
                try { callback(); } catch (e) { alert(e); }
              }
          }).bind(this));
      }).bind(this));
};

/** Reload skeletons from database. */
WebGLApplication.prototype.updateSkeletons = function() {
  var models = this.getSelectedSkeletonModels(); // visible ones
  this.clear();
  this.append(models);
};

WebGLApplication.prototype.append = function(models) {
  if (0 === Object.keys(models).length) {
    growlAlert("Info", "No skeletons selected!");
    return;
  }
  this.addSkeletons(models, false);
  if (this.options.connector_filter) {
    this.refreshRestrictedConnectors();
  } else {
    this.space.render();
  }
};

WebGLApplication.prototype.clear = function() {
  this.removeSkeletons(Object.keys(this.space.content.skeletons));
  this.space.render();
};

WebGLApplication.prototype.getSkeletonColor = function( skeleton_id ) {
  if (skeleton_id in this.space.content.skeletons) {
    return this.space.content.skeletons[skeleton_id].actorColor.clone();
  }
  return new THREE.Color().setRGB(1, 0, 1);
};

WebGLApplication.prototype.hasSkeleton = function(skeleton_id) {
  return skeleton_id in this.space.content.skeletons;
};

WebGLApplication.prototype.removeSkeletons = function(skeleton_ids) {
  if (!this.space) return;
  this.space.removeSkeletons(skeleton_ids);
  if (this.options.connector_filter) this.refreshRestrictedConnectors();
  else this.space.render();
};

WebGLApplication.prototype.changeSkeletonColors = function(skeleton_ids, colors) {
  var skeletons = this.space.content.skeletons;

  skeleton_ids.forEach(function(skeleton_id, index) {
    if (!skeletons.hasOwnProperty(skeleton_id)) {
      console.log("Skeleton "+skeleton_id+" does not exist.");
    }
    if (undefined === colors) skeletons[skeleton_id].updateSkeletonColor(this.options);
    else skeletons[skeleton_id].changeColor(colors[index], this.options);
  }, this);

  this.space.render();
  return true;
};

// TODO obsolete code from segmentationtool.js
WebGLApplication.prototype.addActiveObjectToStagingArea = function() {
  alert("The function 'addActiveObjectToStagingArea' is no longer in use.");
};

WebGLApplication.prototype.showActiveNode = function() {
  this.space.content.active_node.setVisible(true);
};


WebGLApplication.prototype.configureParameters = function() {
  var space = this.space;
  var options = this.options;
  var updateSkeletons = this.updateSkeletons.bind(this);

  var dialog = document.createElement('div');
  dialog.setAttribute("id", "dialog-confirm");
  dialog.setAttribute("title", "Configuration");

  var msg = document.createElement('p');
  msg.innerHTML = "Missing sections height [0,100]:";
  dialog.appendChild(msg);

  var missingsectionheight = document.createElement('input');
  missingsectionheight.setAttribute("type", "text");
  missingsectionheight.setAttribute("id", "missing-section-height");
  missingsectionheight.setAttribute("value", options.missing_section_height);
  dialog.appendChild(missingsectionheight);
  dialog.appendChild(document.createElement("br"));

  var bzplane = document.createElement('input');
  bzplane.setAttribute("type", "checkbox");
  bzplane.setAttribute("id", "enable_z_plane");
  bzplane.setAttribute("value", "Enable z-plane");
  if ( options.show_zplane )
    bzplane.setAttribute("checked", "true");
  dialog.appendChild(bzplane);
  dialog.appendChild(document.createTextNode('Enable z-plane'));
  dialog.appendChild(document.createElement("br"));

  var bmeshes = document.createElement('input');
  bmeshes.setAttribute("type", "checkbox");
  bmeshes.setAttribute("id", "show_meshes");
  bmeshes.setAttribute("value", "Show meshes");
  if( options.show_meshes )
    bmeshes.setAttribute("checked", "true");
  dialog.appendChild(bmeshes);
  dialog.appendChild(document.createTextNode('Show meshes, with color: '));

  var c = document.createElement('input');
  c.setAttribute('type', 'text');
  c.setAttribute('id', 'meshes-color');
  c.setAttribute('value', '0xff0000');
  c.setAttribute('size', '10');
  $(document).on('keyup', "#meshes-color", function (e) {
    var code = (e.keyCode ? e.keyCode : e.which);
    if (13 === code) {
      // Enter was pressed
      if (options.show_meshes) {
        var material = options.createMeshMaterial("#meshes-color");
        space.content.meshes.forEach(function(mesh) {
          mesh.material = material;
        });
        space.render();
      }
    }
  });
  dialog.appendChild(c);
  dialog.appendChild(document.createElement("br"));

  var bactive = document.createElement('input');
  bactive.setAttribute("type", "checkbox");
  bactive.setAttribute("id", "enable_active_node");
  bactive.setAttribute("value", "Enable active node");
  if( options.show_active_node )
    bactive.setAttribute("checked", "true");
  dialog.appendChild(bactive);
  dialog.appendChild(document.createTextNode('Enable active node'));
  dialog.appendChild(document.createElement("br"));

  var bmissing = document.createElement('input');
  bmissing.setAttribute("type", "checkbox");
  bmissing.setAttribute("id", "enable_missing_sections");
  bmissing.setAttribute("value", "Missing sections");
  if( options.show_missing_sections )
    bmissing.setAttribute("checked", "true");
  dialog.appendChild(bmissing);
  dialog.appendChild(document.createTextNode('Missing sections'));
  dialog.appendChild(document.createElement("br"));

  /*var bortho = document.createElement('input');
  bortho.setAttribute("type", "checkbox");
  bortho.setAttribute("id", "toggle_ortho");
  bortho.setAttribute("value", "Toggle Ortho");
  container.appendChild(bortho);
  container.appendChild(document.createTextNode('Toggle Ortho'));*/

  var bfloor = document.createElement('input');
  bfloor.setAttribute("type", "checkbox");
  bfloor.setAttribute("id", "toggle_floor");
  bfloor.setAttribute("value", "Toggle Floor");
  if( options.show_floor )
    bfloor.setAttribute("checked", "true");
  dialog.appendChild(bfloor);
  dialog.appendChild(document.createTextNode('Toggle floor'));
  dialog.appendChild(document.createElement("br"));

  var bbox = document.createElement('input');
  bbox.setAttribute("type", "checkbox");
  bbox.setAttribute("id", "toggle_aabb");
  bbox.setAttribute("value", "Toggle Bounding Box");
  if( options.show_box )
    bbox.setAttribute("checked", "true");
  dialog.appendChild(bbox);
  dialog.appendChild(document.createTextNode('Toggle Bounding Box'));
  dialog.appendChild(document.createElement("br"));

  var bbackground = document.createElement('input');
  bbackground.setAttribute("type", "checkbox");
  bbackground.setAttribute("id", "toggle_bgcolor");
  bbackground.setAttribute("value", "Toggle Background Color");
  if( options.show_background )
    bbackground.setAttribute("checked", "true");
  dialog.appendChild(bbackground);
  dialog.appendChild(document.createTextNode('Toggle Background Color'));
  dialog.appendChild(document.createElement("br"));

  var blean = document.createElement('input');
  blean.setAttribute("type", "checkbox");
  blean.setAttribute("id", "toggle_lean");
  if( options.lean_mode )
    blean.setAttribute("checked", "true");
  dialog.appendChild(blean);
  dialog.appendChild(document.createTextNode('Toggle lean mode (no synapses, no tags)'));
  dialog.appendChild(document.createElement("br"));

  dialog.appendChild(document.createTextNode('Synapse clustering bandwidth: '));
  var ibandwidth = document.createElement('input');
  ibandwidth.setAttribute('type', 'text');
  ibandwidth.setAttribute('id', 'synapse-clustering-bandwidth');
  ibandwidth.setAttribute('value', options.synapse_clustering_bandwidth);
  ibandwidth.setAttribute('size', '7');
  dialog.appendChild(ibandwidth);
  dialog.appendChild(document.createTextNode(' nm.'));
  dialog.appendChild(document.createElement("br"));

  var optionField = function(label, units, size, checkboxKey, valueKey) {
    var checkbox;
    if (checkboxKey) {
      checkbox = document.createElement('input');
      checkbox.setAttribute("type", "checkbox");
      if (options[checkboxKey])
        checkbox.setAttribute("checked", true);
      dialog.appendChild(checkbox);
    }
    dialog.appendChild(document.createTextNode(label));
    var number = document.createElement('input');
    number.setAttribute('type', 'text');
    number.setAttribute('value', options[valueKey]);
    number.setAttribute('size', size);
    dialog.appendChild(number);
    dialog.appendChild(document.createTextNode(units));
    dialog.appendChild(document.createElement("br"));
    return [checkbox, number];
  };

  var smooth = optionField('Toggle smoothing skeletons by Gaussian convolution of the slabs, with sigma: ', ' nm.', 5, 'smooth_skeletons', 'smooth_skeletons_sigma');

  var resample = optionField('Toogle resampling skeleton slabs, with delta: ', ' nm.', 5, 'resample_skeletons', 'resampling_delta');

  var linewidth = optionField('Skeleton rendering line width: ', ' pixels.', 5, null, 'skeleton_line_width');

  var submit = this.submit;

  $(dialog).dialog({
    height: 440,
    width: 600,
    modal: true,
    buttons: {
      "Cancel": function() {
        $(this).dialog("close");
      },
      "OK": function() {
        var missing_section_height = missingsectionheight.value;  
        try {
          missing_section_height = parseInt(missing_section_height);
          if (missing_section_height < 0) missing_section_height = 20;
        } catch (e) {
          alert("Invalid value for the height of missing sections!");
        }

        options.missing_section_height = missing_section_height;
        options.show_zplane = bzplane.checked;
        options.show_missing_sections = bmissing.checked;
        options.show_floor = bfloor.checked;
        options.show_box = bbox.checked;
        options.show_background = bbackground.checked;

        options.show_active_node = bactive.checked;
        options.show_meshes = bmeshes.checked;
        options.meshes_color = options.validateOctalString("#meshes-color", options.meshes_color);
        options.lean_mode = blean.checked;

        var read = function(checkbox, checkboxKey, valueField, valueKey) {
          var old_value = options[checkboxKey];
          if (checkbox) options[checkboxKey] = checkbox.checked;
          try {
            var new_value = parseInt(valueField.value);
            if (new_value > 0) {
              options[valueKey] = new_value;
              return old_value != new_value;
            } else alert("'" + valueKey + "' must be larger than zero.");
          } catch (e) {
            alert("Invalid value for '" + valueKey + "': " + valueField.value);
          }
          return false;
        };

        var changed_sigma = read(smooth[0], 'smooth_skeletons', smooth[1], 'smooth_skeletons_sigma'),
            changed_bandwidth = read(null, null, ibandwidth, 'synapse_clustering_bandwidth', null),
            changed_delta = read(resample[0], 'resample_skeletons', resample[1], 'resampling_delta'),
            changed_line_width = read(null, null, linewidth[1], 'skeleton_line_width', null);

        space.staticContent.adjust(options, space);
        space.content.adjust(options, space, submit, changed_bandwidth, changed_line_width);

        // Copy
        WebGLApplication.prototype.OPTIONS = options.clone();

        if (changed_sigma || changed_delta) updateSkeletons();
        else space.render();

        $(this).dialog("close");
      }
    },
    close: function(event, ui) {
      $('#dialog-confirm').remove();

      // Remove the binding
      $(document).off('keyup', "#meshes-color");
    }
  });
};



/** Defines the properties of the 3d space and also its static members like the bounding box and the missing sections. */
WebGLApplication.prototype.Space = function( w, h, container, stack ) {
	this.stack = stack;
  this.container = container; // used by MouseControls

	this.canvasWidth = w;
	this.canvasHeight = h;
	this.yDimension = stack.dimension.y * stack.resolution.y;

	// Absolute center in Space coordinates (not stack coordinates)
	this.center = this.createCenter();
	this.dimensions = new THREE.Vector3(stack.dimension.x * stack.resolution.x,
                                      stack.dimension.y * stack.resolution.y,
                                      stack.dimension.z * stack.resolution.z);

	// WebGL space
	this.scene = new THREE.Scene();
	this.view = new this.View(this);
	this.lights = this.createLights(stack.dimension, stack.resolution, this.view.camera);
	this.lights.forEach(this.scene.add, this.scene);

	// Content
	this.staticContent = new this.StaticContent(this.dimensions, stack, this.center);
	this.scene.add(this.staticContent.box);
	this.scene.add(this.staticContent.floor);

	this.content = new this.Content();
	this.scene.add(this.content.active_node.mesh);
};

WebGLApplication.prototype.Space.prototype = {};

WebGLApplication.prototype.Space.prototype.setSize = function(canvasWidth, canvasHeight) {
	this.canvasWidth = canvasWidth;
	this.canvasHeight = canvasHeight;
	this.view.camera.setSize(canvasWidth, canvasHeight);
	this.view.camera.toPerspective(); // invokes update of camera matrices
	this.view.renderer.setSize(canvasWidth, canvasHeight);
};

/** Transform a THREE.Vector3d from stack coordinates to Space coordinates.
	 In other words, transform coordinates from CATMAID coordinate system
	 to WebGL coordinate system: x->x, y->y+dy, z->-z */
WebGLApplication.prototype.Space.prototype.toSpace = function(v3) {
	v3.y = this.yDimension - v3.y;
	v3.z = -v3.z;
	return v3;
};

/** Transform axes but do not scale. */
WebGLApplication.prototype.Space.prototype.coordsToUnscaledSpace = function(x, y, z) {
	return [x, this.yDimension - y, -z];
};

/** Starting at i, edit i, i+1 and i+2, which represent x, y, z of a 3d point. */
WebGLApplication.prototype.Space.prototype.coordsToUnscaledSpace2 = function(vertices, i) {
	// vertices[i] equal
	vertices[i+1] =  this.yDimension -vertices[i+1];
	vertices[i+2] = -vertices[i+2];
};

WebGLApplication.prototype.Space.prototype.createCenter = function() {
	var d = this.stack.dimension,
			r = this.stack.resolution,
			t = this.stack.translation,
      center = new THREE.Vector3((d.x * r.x) / 2.0 + t.x,
                                 (d.y * r.y) / 2.0 + t.y,
                                 (d.z * r.z) / 2.0 + t.z);

	// Bring the stack center to Space coordinates
	this.toSpace(center);

	return center;
};


WebGLApplication.prototype.Space.prototype.createLights = function(dimension, resolution, camera) {
	var ambientLight = new THREE.AmbientLight( 0x505050 );

  var pointLight = new THREE.PointLight( 0xffaa00 );
	pointLight.position.set(dimension.x * resolution.x,
                          dimension.y * resolution.y,
													50);

	var light = new THREE.SpotLight( 0xffffff, 1.5 );
	light.position.set(dimension.x * resolution.x / 2,
										 dimension.y * resolution.y / 2,
										 50);
	light.castShadow = true;
	light.shadowCameraNear = 200;
	light.shadowCameraFar = camera.far;
	light.shadowCameraFov = 50;
	light.shadowBias = -0.00022;
	light.shadowDarkness = 0.5;
	light.shadowMapWidth = 2048;
	light.shadowMapHeight = 2048;

	return [ambientLight, pointLight, light];
};

WebGLApplication.prototype.Space.prototype.add = function(mesh) {
	this.scene.add(mesh);
};

WebGLApplication.prototype.Space.prototype.remove = function(mesh) {
	this.scene.remove(mesh);
};

WebGLApplication.prototype.Space.prototype.render = function() {
	this.view.render();
};

WebGLApplication.prototype.Space.prototype.destroy = function() {
  // remove active_node and project-wise meshes
	this.scene.remove(this.content.active_node.mesh);
	this.content.meshes.forEach(this.scene.remove, this.scene);

  // dispose active_node and meshes
  this.content.dispose();

  // dispose and remove skeletons
  this.removeSkeletons(Object.keys(this.content.skeletons));

	this.lights.forEach(this.scene.remove, this.scene);

  // dispose meshes and materials
  this.staticContent.dispose();

  // remove meshes
	this.scene.remove(this.staticContent.box);
	this.scene.remove(this.staticContent.floor);
	if (this.staticContent.zplane) this.scene.remove(this.staticContent.zplane);
	this.staticContent.missing_sections.forEach(this.scene.remove, this.scene);

	this.view.destroy();

  Object.keys(this).forEach(function(key) { delete this[key]; }, this);
};

WebGLApplication.prototype.Space.prototype.removeSkeletons = function(skeleton_ids) {
	skeleton_ids.forEach(this.removeSkeleton, this);
};

WebGLApplication.prototype.Space.prototype.removeSkeleton = function(skeleton_id) {
	if (skeleton_id in this.content.skeletons) {
		this.content.skeletons[skeleton_id].destroy();
		delete this.content.skeletons[skeleton_id];
	}
};

WebGLApplication.prototype.Space.prototype.updateSplitShading = function(old_skeleton_id, new_skeleton_id, options) {
  if ('active_node_split' === options.shading_method) {
    if (old_skeleton_id !== new_skeleton_id) {
      if (old_skeleton_id && old_skeleton_id in this.content.skeletons) this.content.skeletons[old_skeleton_id].updateSkeletonColor(options);
    }
    if (new_skeleton_id && new_skeleton_id in this.content.skeletons) this.content.skeletons[new_skeleton_id].updateSkeletonColor(options);
  }
};


WebGLApplication.prototype.Space.prototype.TextGeometryCache = function() {
	this.geometryCache = {};

	this.getTagGeometry = function(tagString) {
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
			font: "helvetiker"
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

  this.createTextMesh = function(tagString, material) {
    var text = new THREE.Mesh(this.getTagGeometry(tagString), material);
    text.visible = true;
    return text;
  };

  this.destroy = function() {
    Object.keys(this.geometryCache).forEach(function(entry) {
      entry.geometry.dispose();
    });
    delete this.geometryCache;
  };
};

WebGLApplication.prototype.Space.prototype.StaticContent = function(dimensions, stack, center) {
	// Space elements
	this.box = this.createBoundingBox(center, stack.dimension, stack.resolution);
	this.floor = this.createFloor(center, dimensions);

	this.zplane = null;

	this.missing_sections = [];

	// Shared across skeletons
  this.labelspheregeometry = new THREE.OctahedronGeometry( 130, 3);
  this.radiusSphere = new THREE.OctahedronGeometry( 40, 3);
  this.icoSphere = new THREE.IcosahedronGeometry(1, 2);
  this.cylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
  this.textMaterial = new THREE.MeshNormalMaterial( { color: 0xffffff, overdraw: true } );
  // Mesh materials for spheres on nodes tagged with 'uncertain end', 'undertain continuation' or 'TODO'
  this.labelColors = {uncertain: new THREE.MeshBasicMaterial({color: 0xff8000, opacity:0.6, transparent: true}),
                      todo: new THREE.MeshBasicMaterial({color: 0xff0000, opacity:0.6, transparent: true})};
  this.textGeometryCache = new WebGLApplication.prototype.Space.prototype.TextGeometryCache();
  this.synapticColors = [new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.6, transparent:false  } ), new THREE.MeshBasicMaterial( { color: 0x00f6ff, opacity:0.6, transparent:false  } )];
  this.connectorLineColors = {'presynaptic_to': new THREE.LineBasicMaterial({color: 0xff0000, opacity: 1.0, linewidth: 6}),
                              'postsynaptic_to': new THREE.LineBasicMaterial({color: 0x00f6ff, opacity: 1.0, linewidth: 6})};
};

WebGLApplication.prototype.Space.prototype.StaticContent.prototype = {};

WebGLApplication.prototype.Space.prototype.StaticContent.prototype.dispose = function() {
  // dispose ornaments
  this.box.geometry.dispose();
  this.box.material.dispose();
  this.floor.geometry.dispose();
  this.floor.material.dispose();
  this.missing_sections.forEach(function(s) {
    s.geometry.dispose();
    s.material.dispose(); // it is ok to call more than once
  });
  if (this.zplane) {
    this.zplane.geometry.dispose();
    this.zplane.material.dispose();
  }
 
  // dispose shared geometries
  [this.labelspheregeometry, this.radiusSphere, this.icoSphere, this.cylinder].forEach(function(g) { 
    g.dispose();
  });
  this.textGeometryCache.destroy();

  // dispose shared materials
  this.textMaterial.dispose();
  this.labelColors.uncertain.dispose();
  this.labelColors.todo.dispose();
  this.synapticColors[0].dispose();
  this.synapticColors[1].dispose();
};

WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createBoundingBox = function(center, dimension, resolution) {
  var width = dimension.x * resolution.x;
  var height = dimension.y * resolution.y;
  var depth = dimension.z * resolution.z;
  var geometry = new THREE.CubeGeometry( width, height, depth );
  var material = new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: true } );
  var mesh = new THREE.Mesh( geometry, material );
  mesh.position.set(center.x, center.y, center.z);
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
    var line_material = new THREE.LineBasicMaterial( { color: o['color'] || 0x535353 } );
    var floor = o['floor'] || 0.0;

    // 10 steps in each dimension of the bounding box
    var nBaseLines = o['nBaseLines'] || 10.0;
    var xStep = dimensions.x / nBaseLines;
    var zStep = dimensions.z / nBaseLines;
    // Extend this around the bounding box
    var xExtent = o['xExtent'] || Math.ceil(2.0 * dimensions.y / xStep);
    var zExtent = o['zExtent'] || Math.ceil(2.0 * dimensions.y / zStep);
    // Offset from origin
    var xOffset = dimensions.x * 0.5 - center.x;
    var zOffset = dimensions.z * 0.5 + center.z;
    // Get min and max coordinates of grid
    var min_x = -1.0 * xExtent * xStep + xOffset,
        max_x = dimensions.x + (xExtent * xStep) + xOffset;
    var min_z = -1.0 * dimensions.z - zExtent * zStep + zOffset,
        max_z = zExtent * zStep + zOffset;

    var geometry = new THREE.Geometry();
    for (var i = 0; i <= nBaseLines + 2 * xExtent; ++i) {
      for (var j = 0; j <= nBaseLines + 2 * zExtent; ++j) {
        var x = min_x + i * xStep;
        geometry.vertices.push( new THREE.Vector3( x, floor, min_z ) );
        geometry.vertices.push( new THREE.Vector3( x, floor, max_z ) );
        var z = min_z + j * zStep;
        geometry.vertices.push( new THREE.Vector3( min_x, floor, z ) );
        geometry.vertices.push( new THREE.Vector3( max_x, floor, z ) );
      }
    }

    return new THREE.Line( geometry, line_material, THREE.LinePieces );
};


/** Adjust visibility of static content according to the persistent options. */
WebGLApplication.prototype.Space.prototype.StaticContent.prototype.adjust = function(options, space) {
	if (options.show_missing_sections) {
    if (0 === this.missing_sections.length) {
      this.missing_sections = this.createMissingSections(space, options.missing_section_height);
      this.missing_sections.forEach(space.scene.add, space.scene);
    }
	} else {
		this.missing_sections.forEach(space.scene.remove, space.scene);
		this.missing_sections = [];
	}

	if (options.show_background) {
		space.view.renderer.setClearColor(0x000000, 1);
	} else {
		space.view.renderer.setClearColor(0xffffff, 1);
	}

	this.floor.visible = options.show_floor;

	this.box.visible = options.show_box;

	if (this.zplane) space.scene.remove(this.zplane);
	if (options.show_zplane) {
		this.zplane = this.createZPlane(space.stack);
    this.updateZPlanePosition(space.stack);
		space.scene.add(this.zplane);
	} else {
		this.zplane = null;
	}
};

WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createZPlane = function(stack) {
	var geometry = new THREE.Geometry(),
	    xwidth = stack.dimension.x * stack.resolution.x,
			ywidth = stack.dimension.y * stack.resolution.y,
	    material = new THREE.MeshBasicMaterial( { color: 0x151349, side: THREE.DoubleSide } );

	geometry.vertices.push( new THREE.Vector3( 0,0,0 ) );
	geometry.vertices.push( new THREE.Vector3( xwidth,0,0 ) );
	geometry.vertices.push( new THREE.Vector3( 0,ywidth,0 ) );
	geometry.vertices.push( new THREE.Vector3( xwidth,ywidth,0 ) );
	geometry.faces.push( new THREE.Face4( 0, 1, 3, 2 ) );

	return new THREE.Mesh( geometry, material );
};

WebGLApplication.prototype.Space.prototype.StaticContent.prototype.updateZPlanePosition = function(stack) {
	if (this.zplane) {
		this.zplane.position.z = (-stack.z * stack.resolution.z - stack.translation.z);
	}
};

/** Returns an array of meshes representing the missing sections. */
WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createMissingSections = function(space, missing_section_height) {
	var d = space.stack.dimension,
			r = space.stack.resolution,
			t = space.stack.translation,
	    geometry = new THREE.Geometry(),
	    xwidth = d.x * r.x,
			ywidth = d.y * r.y * missing_section_height / 100.0,
	    materials = [new THREE.MeshBasicMaterial( { color: 0x151349, opacity:0.6, transparent: true, side: THREE.DoubleSide } ),
	                 new THREE.MeshBasicMaterial( { color: 0x00ffff, wireframe: true, wireframeLinewidth: 5, side: THREE.DoubleSide } )];

	geometry.vertices.push( new THREE.Vector3( 0,0,0 ) );
	geometry.vertices.push( new THREE.Vector3( xwidth,0,0 ) );
	geometry.vertices.push( new THREE.Vector3( 0,ywidth,0 ) );
	geometry.vertices.push( new THREE.Vector3( xwidth,ywidth,0 ) );
	geometry.faces.push( new THREE.Face4( 0, 1, 3, 2 ) );

  return space.stack.broken_slices.reduce(function(missing_sections, sliceZ) {
		var z = -sliceZ * r.z - t.z;
		return missing_sections.concat(materials.map(function(material) {
			var mesh = new THREE.Mesh(geometry, material);
			mesh.position.z = z;
			return mesh;
		}));
	}, []);
};

WebGLApplication.prototype.Space.prototype.Content = function() {
	// Scene content
	this.active_node = new this.ActiveNode();
	this.meshes = [];
	this.skeletons = {};
};

WebGLApplication.prototype.Space.prototype.Content.prototype = {};

WebGLApplication.prototype.Space.prototype.Content.prototype.dispose = function() {
  this.active_node.mesh.geometry.dispose();
  this.active_node.mesh.material.dispose();

  this.meshes.forEach(function(mesh) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
};

WebGLApplication.prototype.Space.prototype.Content.prototype.loadMeshes = function(space, submit, material) {
  submit(django_url + project.id + "/stack/" + space.stack.id + "/models",
         {},
         function (models) {
           var ids = Object.keys(models);
           if (0 === ids.length) return;
           var loader = space.content.newJSONLoader();
           ids.forEach(function(id) {
             var vs = models[id].vertices;
             for (var i=0; i < vs.length; i+=3) {
               space.coordsToUnscaledSpace2(vs, i);
             }
             var geometry = loader.parse(models[id]).geometry;
             var mesh = space.content.newMesh(geometry, material);
             mesh.position.set(0, 0, 0);
             mesh.rotation.set(0, 0, 0);
             space.content.meshes.push(mesh);
             space.add(mesh);
           });
           space.render();
        });
};

WebGLApplication.prototype.Space.prototype.Content.prototype.newMesh = function(geometry, material) {
  return new THREE.Mesh(geometry, material);
};

WebGLApplication.prototype.Space.prototype.Content.prototype.newJSONLoader = function() {
  return new THREE.JSONLoader(true);
};

/** Adjust content according to the persistent options. */
WebGLApplication.prototype.Space.prototype.Content.prototype.adjust = function(options, space, submit, changed_bandwidth, changed_line_width) {
	if (options.show_meshes) {
    if (0 === this.meshes.length) {
		  this.loadMeshes(space, submit, options.createMeshMaterial());
    }
	} else {
		this.meshes.forEach(space.scene.remove, space.scene);
		this.meshes = [];
	}

	this.active_node.setVisible(options.show_active_node);

  if (changed_bandwidth && 'synapse-clustering' === options.connector_color) {
    space.updateConnectorColors(options, Object.keys(this.skeletons).map(function(skid) { return this.skeletons[skid]; }, this));
  }

  if (changed_line_width) {
    Object.keys(this.skeletons).forEach(function(skid) {
      this.skeletons[skid].changeSkeletonLineWidth(options.skeleton_line_width);
    }, this);
  }
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
  * frustum's far culling plane is three times the longest size of the
  * displayed space. The near plan starts at one. */
  var d = this.space.dimensions;
  var fov = 75;
  var near = 1;
  var far = 3 * Math.max(d.x, Math.max(d.y, d.z))
  var orthoNear = 1;
  var orthoFar =  far;
	this.camera = new THREE.CombinedCamera(-this.space.canvasWidth,
      -this.space.canvasHeight, fov, near, far, orthoNear, orthoFar);
  this.camera.frustumCulled = false;

	this.projector = new THREE.Projector();

	this.renderer = new THREE.WebGLRenderer({ antialias: true });
  this.renderer.sortObjects = false;
  this.renderer.setSize( this.space.canvasWidth, this.space.canvasHeight );

	this.controls = this.createControls();

  this.space.container.appendChild(this.renderer.domElement);

  this.mouse = {position: new THREE.Vector2(),
                is_mouse_down: false};

  this.mouseControls = new this.MouseControls();
  this.mouseControls.attach(this, this.renderer.domElement);
};


WebGLApplication.prototype.Space.prototype.View.prototype.destroy = function() {
  this.controls.removeListeners();
  this.mouseControls.detach(this.renderer.domElement);
  this.space.container.removeChild(this.renderer.domElement);
  Object.keys(this).forEach(function(key) { delete this[key]; }, this);
};

WebGLApplication.prototype.Space.prototype.View.prototype.createControls = function() {
	var controls = new THREE.TrackballControls( this.camera, this.space.container );
  controls.rotateSpeed = 1.0;
  controls.zoomSpeed = 3.2;
  controls.panSpeed = 1.5;
  controls.noZoom = false;
  controls.noPan = false;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.3;
	controls.target = this.space.center.clone();
	return controls;
};

WebGLApplication.prototype.Space.prototype.View.prototype.render = function() {
	this.controls.update();
	if (this.renderer) {
		this.renderer.clear();
		this.renderer.render(this.space.scene, this.camera);
	}
};


WebGLApplication.prototype.Space.prototype.View.prototype.XY = function() {
	var center = this.space.center,
			dimensions = this.space.dimensions;
	this.controls.target = center;
	this.camera.position.x = center.x;
	this.camera.position.y = center.y;
	this.camera.position.z = (dimensions.z / 2) + center.z + 100;
	this.camera.up.set(0, 1, 0);
};

WebGLApplication.prototype.Space.prototype.View.prototype.XZ = function() {
	var center = this.space.center,
			dimensions = this.space.dimensions;
	this.controls.target = center;
	this.camera.position.x = center.x;
	this.camera.position.y = dimensions.y * 2;
	this.camera.position.z = center.z;
	this.camera.up.set(0, 0, 1);
};

WebGLApplication.prototype.Space.prototype.View.prototype.ZY = function() {
	var center = this.space.center,
			dimensions = this.space.dimensions;
	this.controls.target = center;
	this.camera.position.x = dimensions.x * 2;
	this.camera.position.y = center.y;
	this.camera.position.z = center.z;
	this.camera.up.set(0, 1, 0);
};

WebGLApplication.prototype.Space.prototype.View.prototype.ZX = function() {
	var center = this.space.center,
			dimensions = this.space.dimensions;
	this.controls.target = center;
	this.camera.position.x = center.x;
	this.camera.position.y = dimensions.y * 2;
	this.camera.position.z = center.z;
	this.camera.up.set(-1, 0, 0);
};

/** Construct mouse controls as objects, so that no context is retained. */
WebGLApplication.prototype.Space.prototype.View.prototype.MouseControls = function() {

  this.attach = function(view, domElement) {
    domElement.CATMAID_view = view;
  
    domElement.addEventListener('mousewheel', this.MouseWheel, false);
    domElement.addEventListener('mousemove', this.MouseMove, false);
    domElement.addEventListener('mouseup', this.MouseUp, false);
    domElement.addEventListener('mousedown', this.MouseDown, false);
  };

  this.detach = function(domElement) {
    domElement.CATMAID_view = null;
    delete domElement.CATMAID_view;

    domElement.removeEventListener('mousewheel', this.MouseWheel, false);
    domElement.removeEventListener('mousemove', this.MouseMove, false);
    domElement.removeEventListener('mouseup', this.MouseUp, false);
    domElement.removeEventListener('mousedown', this.MouseDown, false);

    Object.keys(this).forEach(function(key) { delete this[key]; }, this);
  };

  this.MouseWheel = function(ev) {
    this.CATMAID_view.space.render();
  };

  this.MouseMove = function(ev) {
    var mouse = this.CATMAID_view.mouse,
        space = this.CATMAID_view.space;
    mouse.position.x =  ( ev.offsetX / space.canvasWidth  ) * 2 -1;
    mouse.position.y = -( ev.offsetY / space.canvasHeight ) * 2 +1;

    if (mouse.is_mouse_down) {
      space.render();
    }

    space.container.style.cursor = 'pointer';
  };

  this.MouseUp = function(ev) {
    var mouse = this.CATMAID_view.mouse,
        controls = this.CATMAID_view.controls,
        space = this.CATMAID_view.space;
		mouse.is_mouse_down = false;
    controls.enabled = true;
    space.render(); // May need another render on occasions
  };

  this.MouseDown = function(ev) {
    var mouse = this.CATMAID_view.mouse,
        space = this.CATMAID_view.space,
        camera = this.CATMAID_view.camera,
        projector = this.CATMAID_view.projector;
    mouse.is_mouse_down = true;
		if (!ev.shiftKey) return;

		// Find object under the mouse
		var vector = new THREE.Vector3(mouse.position.x, mouse.position.y, 0.5);
		projector.unprojectVector(vector, camera);
		var raycaster = new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize());

		// Attempt to intersect visible skeleton spheres, stopping at the first found
		var fields = ['specialTagSpheres', 'synapticSpheres', 'radiusVolumes'];
    var skeletons = space.content.skeletons;
		if (Object.keys(skeletons).some(function(skeleton_id) {
			var skeleton = skeletons[skeleton_id];
			if (!skeleton.visible) return false;
			var all_spheres = fields.map(function(field) { return skeleton[field]; })
						                  .reduce(function(a, spheres) {
                                return Object.keys(spheres).reduce(function(a, id) {
                                  a.push(spheres[id]);
                                  return a;
                                }, a);
                              }, []);
			var intersects = raycaster.intersectObjects(all_spheres, true);
			if (intersects.length > 0) {
				return all_spheres.some(function(sphere) {
					if (sphere.id !== intersects[0].object.id) return false;
					SkeletonAnnotations.staticMoveToAndSelectNode(sphere.node_id);
					return true;
				});
			}
			return false;
		})) {
			return;
		}

		growlAlert("Oops", "Couldn't find any intersectable object under the mouse.");
  };
};


WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode = function() {
  this.skeleton_id = null;
  this.mesh = new THREE.Mesh( new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial( { color: 0x00ff00, opacity:0.8, transparent:true } ) );
  this.mesh.scale.x = this.mesh.scale.y = this.mesh.scale.z = 160;
};

WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode.prototype = {};

WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode.prototype.setVisible = function(visible) {
	this.mesh.visible = visible ? true : false;
};

WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode.prototype.updatePosition = function(space, options) {
	var pos = SkeletonAnnotations.getActiveNodePosition();
	if (!pos) {
    space.updateSplitShading(this.skeleton_id, null, options);
    this.skeleton_id = null;
    return;
  }

  var skeleton_id = SkeletonAnnotations.getActiveSkeletonId();
  space.updateSplitShading(this.skeleton_id, skeleton_id, options);
  this.skeleton_id = skeleton_id;

	var stack = space.stack,
      t = stack.translation,
			r = stack.resolution,
			// Get world coordinates of active node (which is already unscaled)
			c = new THREE.Vector3(t.x + pos.x * r.x,
														t.y + pos.y * r.y,
														t.z + pos.z * r.z);

	space.toSpace(c);

	this.mesh.position.set(c.x, c.y, c.z);
};

WebGLApplication.prototype.Space.prototype.updateSkeleton = function(skeletonmodel, json, options) {
  if (!this.content.skeletons.hasOwnProperty(skeletonmodel.id)) {
    this.content.skeletons[skeletonmodel.id] = new this.Skeleton(this, skeletonmodel);
  }
  this.content.skeletons[skeletonmodel.id].reinit_actor(skeletonmodel, json, options);
  return this.content.skeletons[skeletonmodel.id];
};

/** An object to represent a skeleton in the WebGL space.
 *  The skeleton consists of three geometries:
 *    (1) one for the edges between nodes, represented as a list of contiguous pairs of points; 
 *    (2) one for the edges representing presynaptic relations to connectors;
 *    (3) one for the edges representing postsynaptic relations to connectors.
 *  Each geometry has its own mesh material and can be switched independently.
 *  In addition, each skeleton node with a pre- or postsynaptic relation to a connector
 *  gets a clickable sphere to represent it.
 *  Nodes with an 'uncertain' or 'todo' in their text tags also get a sphere.
 *
 *  When visualizing only the connectors among the skeletons visible in the WebGL space, the geometries of the pre- and postsynaptic edges are hidden away, and a new pair of geometries are created to represent just the edges that converge onto connectors also related to by the other skeletons.
 *
 */
WebGLApplication.prototype.Space.prototype.Skeleton = function(space, skeletonmodel) {
  // TODO id, baseName, actorColor are all redundant with the skeletonmodel
	this.space = space;
	this.id = skeletonmodel.id;
	this.baseName = skeletonmodel.baseName;
  this.synapticColors = space.staticContent.synapticColors;
  this.skeletonmodel = skeletonmodel;
  // This is an index mapping treenode IDs to lists of reviewers. Attaching them
  // directly to the nodes is too much of a performance hit.
  // Gets loaded dynamically, and erased when refreshing (because a new Skeleton is instantiated with the same model).
  this.reviews = null;
  // A map of nodeID vs true for nodes that belong to the axon, as computed by splitByFlowCentrality. Loaded dynamically, and erased when refreshing like this.reviews.
  this.axon = null;
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype = {};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.CTYPES = ['neurite', 'presynaptic_to', 'postsynaptic_to'];
WebGLApplication.prototype.Space.prototype.Skeleton.prototype.synapticTypes = ['presynaptic_to', 'postsynaptic_to'];

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.initialize_objects = function(options) {
	this.visible = true;
	if (undefined === this.skeletonmodel) {
		console.log('Can not initialize skeleton object');
		return;
	}
	this.actorColor = this.skeletonmodel.color.clone();
	var CTYPES = this.CTYPES;
	this.line_material = new THREE.LineBasicMaterial({color: 0xffff00, opacity: 1.0, linewidth: options.skeleton_line_width});

	this.geometry = {};
	this.geometry[CTYPES[0]] = new THREE.Geometry();
	this.geometry[CTYPES[1]] = new THREE.Geometry();
	this.geometry[CTYPES[2]] = new THREE.Geometry();

      this.actor = {}; // has three keys (the CTYPES), each key contains the edges of each type
      this.actor[CTYPES[0]] = new THREE.Line(this.geometry[CTYPES[0]], this.line_material, THREE.LinePieces);
      this.actor[CTYPES[1]] = new THREE.Line(this.geometry[CTYPES[1]], this.space.staticContent.connectorLineColors[CTYPES[1]], THREE.LinePieces);
      this.actor[CTYPES[2]] = new THREE.Line(this.geometry[CTYPES[2]], this.space.staticContent.connectorLineColors[CTYPES[2]], THREE.LinePieces);

	this.specialTagSpheres = {};
	this.synapticSpheres = {};
	this.radiusVolumes = {}; // contains spheres and cylinders
	this.textlabels = {};

  // Used only with restricted connectors
	this.connectoractor = {};
	this.connectorgeometry = {};
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.destroy = function() {
	this.removeActorFromScene();
	[this.actor, this.geometry, this.connectorgeometry, this.connectoractor,
	 this.specialTagSpheres, this.synapticSpheres,
	 this.radiusVolumes, this.textlabels].forEach(function(ob) {
		 if (ob) {
			 for (var key in ob) {
			 	if (ob.hasOwnProperty(key)) delete ob[key];
			 }
		 }
	});
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.removeActorFromScene = function() {
  // Dispose of both geometry and material, unique to this Skeleton
  this.actor[this.CTYPES[0]].geometry.dispose();
  this.actor[this.CTYPES[0]].material.dispose();

  // Dispose only of the geometries. Materials for connectors are shared
  this.actor[this.CTYPES[1]].geometry.dispose();
  this.actor[this.CTYPES[2]].geometry.dispose();

	[this.actor, this.synapticSpheres, this.radiusVolumes,
	 this.specialTagSpheres].forEach(function(ob) {
		if (ob) {
			for (var key in ob) {
				if (ob.hasOwnProperty(key)) this.space.remove(ob[key]);
			}
		}
	}, this);

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

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setSynapticVisibilityFn = function(type) {
	return function(vis) {
		this.visibilityCompositeActor(type, vis);
		for (var idx in this.synapticSpheres) {
			if (this.synapticSpheres.hasOwnProperty(idx)
			 && this.synapticSpheres[idx].type === type) {
				this.synapticSpheres[idx].visible = vis;
			}
		}
	};
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setPreVisibility = WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setSynapticVisibilityFn('presynaptic_to');

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setPostVisibility = WebGLApplication.prototype.Space.prototype.Skeleton.prototype.setSynapticVisibilityFn('postsynaptic_to');

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createTextMeshes = function() {
	// Sort out tags by node: some nodes may have more than one
	var nodeIDTags = {};
	for (var tag in this.tags) {
		if (this.tags.hasOwnProperty(tag)) {
			this.tags[tag].forEach(function(nodeID) {
				if (nodeIDTags.hasOwnProperty(nodeID)) {
					nodeIDTags[nodeID].push(tag);
				} else {
					nodeIDTags[nodeID] = [tag];
				}
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
  var vs = this.geometry['neurite'].vertices.reduce(function(o, v) {
    if (v.node_id in nodeIDTags) o[v.node_id] = v;
    return o;
  }, {});

	// Create meshes for the tags for all nodes that need them, reusing the geometries
	var cache = this.space.staticContent.textGeometryCache,
			textMaterial = this.space.staticContent.textMaterial;
	for (var tagString in tagNodes) {
		if (tagNodes.hasOwnProperty(tagString)) {
			tagNodes[tagString].forEach(function(nodeID) {
        var text = cache.createTextMesh(tagString, textMaterial);
        var v = vs[nodeID];
        text.position.x = v.x;
        text.position.y = v.y;
        text.position.z = v.z;
				this.textlabels[nodeID] = text;
				this.space.add(text);
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

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createSynapseClustering = function(bandwidth) {
  var locations = this.geometry['neurite'].vertices.reduce(function(vs, v) {
    vs[v.node_id] = v.clone();
    return vs;
  }, {});
  
  return new SynapseClustering(this.createArbor(), locations, this.createSynapseCounts(), bandwidth);
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createSynapseCounts = function() {
  return this.synapticTypes.reduce((function(o, type, k) {
    var vs = this.geometry[type].vertices;
    for (var i=0, l=vs.length; i<l; i+=2) {
      var treenode_id = vs[i+1].node_id,
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
      var treenode_id = vs[i+1].node_id,
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
          treenode_id = vs[i+1].node_id,
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
          treenode_id = vs[i+1].node_id,
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

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createArbor = function() {
  return new Arbor().addEdges(this.geometry['neurite'].vertices,
                              function(v) { return v.node_id; });
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.getPositions = function() {
  return this.geometry['neurite'].vertices.reduce(function(o, v) { o[v.node_id] = v; return o; }, {});
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

    var syn = new ArborParser().synapses(json[1]),
        flow_centrality = arbor.flowCentrality(syn.outputs, syn.inputs, syn.n_outputs, syn.n_inputs);

    if (!flow_centrality) return null;

    var max = 0,
        nodes = Object.keys(flow_centrality);
    for (var i=0; i<nodes.length; ++i) {
      var node = nodes[i],
          fc = flow_centrality[node].centrifugal;
      if (fc > max) {
        max = fc;
      }
    }

    var above = [],
        threshold = 0.9 * max;
    for (var i=0; i<nodes.length; ++i) {
      var node = nodes[i];
      if (flow_centrality[node].centrifugal > threshold) {
        above.push(node);
      }
    }

    var cut = SynapseClustering.prototype.findAxonCut(arbor, syn.outputs, above);

    return arbor.subArbor(cut).nodes();
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.updateSkeletonColor = function(options) {
  var node_weights;

  if ('none' === options.shading_method) {
    node_weights = null;
  } else {
    var arbor = this.createArbor(),
        node_weights;

    if (-1 !== options.shading_method.lastIndexOf('centrality')) {
      // Darken the skeleton based on the betweenness calculation.
      var c;
      if (0 === options.shading_method.indexOf('betweenness')) {
        c = arbor.betweennessCentrality(true);
      } else if (0 === options.shading_method.indexOf('slab')) {
        c = arbor.slabCentrality(true); // branch centrality
      } else {
        // Flow centrality
        var io = this.createPrePostCounts();
        if (0 === io.postsynaptic_to_count || 0 === io.presynaptic_to_count) {
          growlAlert('WARNING', 'Neuron "' + this.skeletonmodel.baseName + '" lacks input or output synapses.');
          c = arbor.nodesArray().reduce(function(o, node) {
            // All the same
            o[node] = 1;
            return o;
          }, {});
        } else {
          var key = 'sum';
          if (0 === options.shading_method.indexOf('centrifugal')) {
            key = 'centrifugal';
          } else if (0 === options.shading_method.indexOf('centripetal')) {
            key = 'centripetal';
          }
          var fc = arbor.flowCentrality(io.presynaptic_to, io.postsynaptic_to, io.presynaptic_to_count, io.postsynaptic_to_count),
              c = {},
              nodes = Object.keys(fc);
          for (var i=0; i<nodes.length; ++i) {
            var node = nodes[i];
            c[node] = fc[node][key];
          }
        }
      }

      var node_ids = Object.keys(c),
          max = node_ids.reduce(function(a, node_id) {
            return Math.max(a, c[node_id]);
          }, 0);

      // Normalize c in place
      node_ids.forEach(function(node_id) {
        c[node_id] = c[node_id] / max;
      });

      node_weights = c;

    } else if ('distance_to_root' === options.shading_method) {
      var locations = this.geometry['neurite'].vertices.reduce(function(vs, v) {
        vs[v.node_id] = v;
        return vs;
      }, {});

      var distanceFn = (function(child, paren) {
        return this[child].distanceTo(this[paren]);
      }).bind(locations);

      var dr = arbor.nodesDistanceTo(arbor.root, distanceFn),
          distances = dr.distances,
          max = dr.max;

      // Normalize by max in place
      Object.keys(distances).forEach(function(node) {
        distances[node] = 1 - (distances[node] / max);
      });

      node_weights = distances;

    } else if ('downstream_amount' === options.shading_method) {
      var locations = this.geometry['neurite'].vertices.reduce(function(vs, v) {
        vs[v.node_id] = v;
        return vs;
      }, {});

      var distanceFn = (function(paren, child) {
        return this[child].distanceTo(this[paren]);
      }).bind(locations);

      node_weights = arbor.downstreamAmount(distanceFn, true);

    } else if ('active_node_split' === options.shading_method) {
      var atn = SkeletonAnnotations.getActiveNodeId();
      if (arbor.contains(atn)) {
        node_weights = arbor.subArbor(atn)
          .nodesArray().reduce(function(o, node) {
            o[node] = 0.5;
            return o;
          }, {});
      } else {
        // Don't shade any
        node_weights = {};
      }

    } else if ('partitions' === options.shading_method) {
      // Shade by euclidian length, relative to the longest branch
      var locations = this.geometry['neurite'].vertices.reduce(function(vs, v) {
        vs[v.node_id] = v;
        return vs;
      }, {});
      var partitions = arbor.partitionSorted();
      node_weights = partitions.reduce(function(o, seq, i) {
        var loc1 = locations[seq[0]],
            loc2,
            plen = 0;
        for (var i=1, len=seq.length; i<len; ++i) {
          loc2 = locations[seq[i]];
          plen += loc1.distanceTo(loc2);
          loc1 = loc2;
        }
        return seq.reduce(function(o, node) {
          o[node] = plen;
          return o;
        }, o);
      }, {});
      // Normalize by the length of the longest partition, which ends at root
      var max_length = node_weights[arbor.root];
      Object.keys(node_weights).forEach(function(node) {
        node_weights[node] /= max_length;
      });

    } else if ('strahler' === options.shading_method) {
      node_weights = arbor.strahlerAnalysis();
      var max = node_weights[arbor.root];
      Object.keys(node_weights).forEach(function(node) {
        node_weights[node] /= max;
      });
    }
  }

  if (node_weights || 'none' !== options.color_method) {
    // The skeleton colors need to be set per-vertex.
    this.line_material.vertexColors = THREE.VertexColors;
    this.line_material.needsUpdate = true;

    var pickColor;
    var actorColor = this.actorColor;
    var unreviewedColor = new THREE.Color().setRGB(0.2, 0.2, 0.2);
    var reviewedColor = new THREE.Color().setRGB(1.0, 0.0, 1.0);
    var axonColor = new THREE.Color().setRGB(0, 1, 0),
        dendriteColor = new THREE.Color().setRGB(0, 0, 1),
        notComputable = new THREE.Color().setRGB(0.4, 0.4, 0.4);
    if ('creator' === options.color_method) {
      pickColor = function(vertex) { return User(vertex.user_id).color; };
    } else if ('all-reviewed' === options.color_method) {
      pickColor = this.reviews ?
        (function(vertex) {
          var reviewers = this.reviews[vertex.node_id];
          return reviewers && reviewers.length > 0 ?
            reviewedColor : unreviewedColor;
        }).bind(this)
        : function() { return notComputable; };
    } else if ('own-reviewed' === options.color_method) {
      pickColor = this.reviews ?
        (function(vertex) {
          var reviewers = this.reviews[vertex.node_id];
        return reviewers && -1 !== reviewers.indexOf(session.userid) ?
          reviewedColor : unreviewedColor;
      }).bind(this)
        : function() { return notComputable; };
    } else if ('axon-and-dendrite' === options.color_method) {
      pickColor = this.axon ?
        (function(vertex) {
        return this.axon[vertex.node_id] ? axonColor : dendriteColor;
      }).bind(this)
        : function() { return notComputable; };
    } else {
      pickColor = function() { return actorColor; };
    }

    // When not using shading, but using creator or reviewer:
    if (!node_weights) node_weights = {}

    var seen = {};
    this.geometry['neurite'].colors = this.geometry['neurite'].vertices.map(function(vertex) {
      var node_id = vertex.node_id,
          color = seen[node_id];
      if (color) return color;

      var weight = node_weights[node_id];
      weight = undefined === weight? 1.0 : weight * 0.9 + 0.1;

      var baseColor = pickColor(vertex);
      color = new THREE.Color().setRGB(baseColor.r * weight,
                                           baseColor.g * weight,
                                           baseColor.b * weight);

      seen[node_id] = color;

      // Side effect: color a volume at the node, if any
      var mesh = this.radiusVolumes[node_id];
      if (mesh) {
        var material = mesh.material.clone();
        material.color = color;
        mesh.setMaterial(material);
      }

      return color;
    }, this);

    this.geometry['neurite'].colorsNeedUpdate = true;
    this.actor['neurite'].material.color = new THREE.Color().setHex(0xffffff);
    this.actor['neurite'].material.needsUpdate = true; // TODO repeated, it's the line_material

  } else {
    // Display the entire skeleton with a single color.
    this.geometry['neurite'].colors = [];
    this.line_material.vertexColors = THREE.NoColors;
    this.line_material.needsUpdate = true;
    
    this.actor['neurite'].material.color = this.actorColor;
    this.actor['neurite'].material.needsUpdate = true; // TODO repeated it's the line_material

    var material = new THREE.MeshBasicMaterial({color: this.actorColor, opacity:1.0, transparent:false});

    for (var k in this.radiusVolumes) {
      if (this.radiusVolumes.hasOwnProperty(k)) {
        this.radiusVolumes[k].setMaterial(material);
      }
    }
  }
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.changeSkeletonLineWidth = function(width) {
    this.actor['neurite'].material.linewidth = width;
    this.actor['neurite'].material.needsUpdate = true;
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.changeColor = function(color, options) {
	this.actorColor = color;
	if (options.color_method === 'manual') {
		this.updateSkeletonColor(options);
	}
};

WebGLApplication.prototype.updateConnectorColors = function(select) {
  this.options.connector_color = select.value;
  var skeletons = Object.keys(this.space.content.skeletons).map(function(skid) {
    return this.space.content.skeletons[skid];
  }, this);
  this.space.updateConnectorColors(this.options, skeletons, this.space.render.bind(this.space));
};

WebGLApplication.prototype.Space.prototype.updateConnectorColors = function(options, skeletons, callback) {
  if ('cyan-red' === options.connector_color) {
    var pre = this.staticContent.synapticColors[0],
        post = this.staticContent.synapticColors[1];

    pre.color.setRGB(1, 0, 0); // red
    pre.vertexColors = THREE.NoColors;
    pre.needsUpdate = true;

    post.color.setRGB(0, 1, 1); // cyan
    post.vertexColors = THREE.NoColors;
    post.needsUpdate = true;

    skeletons.forEach(function(skeleton) {
      skeleton.completeUpdateConnectorColor(options);
    });

    if (callback) callback();

  } else if ('by-amount' === options.connector_color) {

    var skids = skeletons.map(function(skeleton) { return skeleton.id; });
    
    if (skids.length > 1) $.blockUI();

    requestQueue.register(django_url + project.id + "/skeleton/connectors-by-partner",
        "POST",
        {skids: skids},
        (function(status, text) {
          try {
            if (200 !== status) return;
            var json = $.parseJSON(text);
            if (json.error) return alert(json.error);

            skeletons.forEach(function(skeleton) {
              skeleton.completeUpdateConnectorColor(options, json[skeleton.id]);
            });

            if (callback) callback();
          } catch (e) {
            console.log(e, e.stack);
            alert(e);
          }
          $.unblockUI();
        }).bind(this));
  } else if ('synapse-clustering' === options.connector_color) {

    if (skeletons.length > 1) $.blockUI();

    try {

      skeletons.forEach(function(skeleton) {
        skeleton.completeUpdateConnectorColor(options);
      });

      if (callback) callback();
    } catch (e) {
      console.log(e, e.stack);
      alert(e);
    }

    $.unblockUI();
  } else if ('axon-and-dendrite' === options.connector_color) {
    fetchSkeletons(
        skeletons.map(function(skeleton) { return skeleton.id; }),
        function(skid) { return django_url + project.id + '/' + skid + '/0/1/0/compact-arbor'; },
        function(skid) { return {}; },
        (function(skid, json) { this.content.skeletons[skid].completeUpdateConnectorColor(options, json); }).bind(this),
        function(skid) { growlAlert("Failed to load synapses for: " + skid); },
        (function() { this.render(); }).bind(this));
  }
};

/** Operates in conjunction with updateConnectorColors above. */
WebGLApplication.prototype.Space.prototype.Skeleton.prototype.completeUpdateConnectorColor = function(options, json) {
  if ('cyan-red' === options.connector_color) {
    this.CTYPES.slice(1).forEach(function(type, i) {
      this.geometry[type].colors = [];
      this.geometry[type].colorsNeedUpdate = true;
      this.actor[type].material.vertexColors = THREE.NoColors;
      this.actor[type].material.color = this.synapticColors[this.CTYPES[1] === type ? 0 : 1].color;
      this.actor[type].material.needsUpdate = true;
    }, this);

    Object.keys(this.synapticSpheres).forEach(function(idx) {
      var mesh = this.synapticSpheres[idx];
      mesh.material = this.synapticColors[this.CTYPES[1] === mesh.type ? 0 : 1];
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
    var sc = this.createSynapseClustering(options.synapse_clustering_bandwidth),
        density_hill_map = sc.densityHillMap(),
        clusters = sc.clusterSizes(density_hill_map),
        colorizer = new Colorizer(),
        cluster_colors = Object.keys(clusters)
          .map(function(cid) { return [cid, clusters[cid]]; })
          .sort(function(a, b) {
            var la = a[1].length,
                lb = b[1].length;
            return la === lb ? 0 : (la > lb ? -1 : 1);
          })
          .reduce(function(o, c) {
            o[c[0]] = colorizer.pickColor();
            return o;
          }, {});

    var fnConnectorValue = function(node_id, connector_id) {
      return density_hill_map[node_id];
    };

    var fnMakeColor = function(value) {
      return cluster_colors[value];
    };

    this.synapticTypes.forEach(function(type) {
      this._colorConnectorsBy(type, fnConnectorValue, fnMakeColor);
    }, this);

  } else if ('axon-and-dendrite' === options.connector_color) {
    var axon = this.splitByFlowCentrality(json),
        fnMakeColor,
        fnConnectorValue;

    if (axon) {
      var colors = [new THREE.Color().setRGB(0, 1, 0),  // axon: green
                    new THREE.Color().setRGB(0, 0, 1)]; // dendrite: blue
      fnConnectorValue = function(node_id, connector_id) { return axon[node_id] ? 0 : 1; };
      fnMakeColor = function(value) { return colors[value]; }
    } else {
      // Not computable
      fnMakeColor = function() { return new THREE.Color().setRGB(0.4, 0.4, 0.4); };
      fnConnectorValue = function() { return 0; };
    }

    this.synapticTypes.forEach(function(type) {
      this._colorConnectorsBy(type, fnConnectorValue, fnMakeColor);
    }, this);
  }
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype._colorConnectorsBy = function(type, fnConnectorValue, fnMakeColor) {
  // Set colors per-vertex
  var seen = {},
      seen_materials = {},
      colors = [],
      vertices = this.geometry[type].vertices;

  for (var i=0; i<vertices.length; i+=2) {
    var connector_id = vertices[i].node_id,
        node_id = vertices[i+1].node_id,
        value = fnConnectorValue(node_id, connector_id);

    var color = seen[value];

    if (!color) {
      color = fnMakeColor(value);
      seen[value] = color;
    }

    // twice: for treenode and for connector
    colors.push(color);
    colors.push(color);

    var mesh = this.synapticSpheres[node_id];
    if (mesh) {
      mesh.material.color = color;
      mesh.material.needsUpdate = true;
      var material = seen_materials[value];
      if (!material) {
        material = mesh.material.clone();
        material.color = color;
        seen_materials[value] = material;
      }
      mesh.setMaterial(material);
    }
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
		this.space.add(this.actor[t]);
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
	if (this.connectoractor) {
		for (var i=0; i<2; ++i) {
      var ca = this.connectoractor[this.synapticTypes[i]];
			if (ca) {
        ca.geometry.dispose(); // do not dispose material, it is shared
				this.space.remove(ca);
				delete this.connectoractor[this.synapticTypes[i]];
			}
		}
		this.connectoractor = null;
	}
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.create_connector_selection = function( common_connector_IDs ) {
	this.connectoractor = {};
	this.connectorgeometry = {};
	this.connectorgeometry[this.CTYPES[1]] = new THREE.Geometry();
	this.connectorgeometry[this.CTYPES[2]] = new THREE.Geometry();

  this.synapticTypes.forEach(function(type) {
    // Vertices is an array of Vector3, every two a pair, the first at the connector and the second at the node
    var vertices1 = this.geometry[type].vertices;
    var vertices2 = this.connectorgeometry[type].vertices;
    for (var i=vertices1.length-2; i>-1; i-=2) {
      var v = vertices1[i];
      if (common_connector_IDs.hasOwnProperty(v.node_id)) {
        vertices2.push(vertices1[i+1]);
        vertices2.push(v);
      }
    }
		this.connectoractor[type] = new THREE.Line( this.connectorgeometry[type], this.space.staticContent.connectorLineColors[type], THREE.LinePieces );
		this.space.add( this.connectoractor[type] );
  }, this);
};

/** Place a colored sphere at the node. Used for highlighting special tags like 'uncertain end' and 'todo'. */
WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createLabelSphere = function(v, material) {
  if (this.specialTagSpheres.hasOwnProperty(v.node_id)) {
    // There already is a tag sphere at the node
    return;
  }
	var mesh = new THREE.Mesh( this.space.staticContent.labelspheregeometry, material );
	mesh.position.set( v.x, v.y, v.z );
	mesh.node_id = v.node_id;
	this.specialTagSpheres[v.node_id] = mesh;
	this.space.add( mesh );
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createEdge = function(v1, v2, type) {
	// Create edge between child (id1) and parent (id2) nodes:
	// Takes the coordinates of each node, transforms them into the space,
	// and then adds them to the parallel lists of vertices and vertexIDs
  var vs = this.geometry[type].vertices;
  vs.push(v1);
	vs.push(v2);
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createNodeSphere = function(v, radius, material) {
  if (this.radiusVolumes.hasOwnProperty(v.node_id)) {
    // There already is a sphere or cylinder at the node
    return;
  }
	// Reuse geometry: an icoSphere of radius 1.0
	var mesh = new THREE.Mesh(this.space.staticContent.icoSphere, material);
	// Scale the mesh to bring about the correct radius
	mesh.scale.x = mesh.scale.y = mesh.scale.z = radius;
	mesh.position.set( v.x, v.y, v.z );
	mesh.node_id = v.node_id;
	this.radiusVolumes[v.node_id] = mesh;
	this.space.add(mesh);
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createCylinder = function(v1, v2, radius, material) {
  if (this.radiusVolumes.hasOwnProperty(v1.node_id)) {
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
	mesh.rotation = new THREE.Vector3().setEulerFromQuaternion(arrow.quaternion);
	mesh.position = new THREE.Vector3().addVectors(v1, direction.multiplyScalar(0.5));

	mesh.node_id = v1.node_id;

	this.radiusVolumes[v1.node_id] = mesh;
	this.space.add(mesh);
};

/* The itype is 0 (pre) or 1 (post), and chooses from the two arrays: synapticTypes and synapticColors. */
WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createSynapticSphere = function(v, itype) {
  if (this.synapticSpheres.hasOwnProperty(v.node_id)) {
    // There already is a synaptic sphere at the node
    return;
  }
	var mesh = new THREE.Mesh( this.space.staticContent.radiusSphere, this.synapticColors[itype] );
	mesh.position.set( v.x, v.y, v.z );
	mesh.node_id = v.node_id;
	mesh.type = this.synapticTypes[itype];
	this.synapticSpheres[v.node_id] = mesh;
	this.space.add( mesh );
};


WebGLApplication.prototype.Space.prototype.Skeleton.prototype.reinit_actor = function(skeletonmodel, json, options) {
	if (this.actor) {
		this.destroy();
	}
  this.skeletonmodel = skeletonmodel;
	this.initialize_objects(options);

	var nodes = json[0];
	var connectors = json[1];
  var tags = json[2];

  var lean = options.lean_mode;

	// Map of node ID vs node properties array
	var nodeProps = nodes.reduce(function(ob, node) {
		ob[node[0]] = node;
		return ob;
	}, {});

	// Store for creation when requested
  // TODO could request them from the server when necessary
	this.tags = tags;

  // Cache for reusing Vector3d instances
  var vs = {};

	// Reused for all meshes
	var material = new THREE.MeshBasicMaterial( { color: this.getActorColorAsHex(), opacity:1.0, transparent:false } );
  material.opacity = this.skeletonmodel.opacity;
  material.transparent = material.opacity !== 1;

	// Create edges between all skeleton nodes
	// and a sphere on the node if radius > 0
	nodes.forEach(function(node) {
		// node[0]: treenode ID
		// node[1]: parent ID
    // node[2]: user ID
    // 3,4,5: x,y,z
		// node[6]: radius
		// node[7]: confidence
		// If node has a parent
    var v1;
		if (node[1]) {
			var p = nodeProps[node[1]];
      v1 = vs[node[0]];
      if (!v1) {
			  v1 = this.space.toSpace(new THREE.Vector3(node[3], node[4], node[5]));
        v1.node_id = node[0];
        v1.user_id = node[2];
        vs[node[0]] = v1;
      }
      var v2 = vs[p[0]];
      if (!v2) {
			  v2 = this.space.toSpace(new THREE.Vector3(p[3], p[4], p[5]));
        v2.node_id = p[0];
        v2.user_id = p[2];
        vs[p[0]] = v2;
      }
			var nodeID = node[0];
			if (node[6] > 0 && p[6] > 0) {
				// Create cylinder using the node's radius only (not the parent) so that the geometry can be reused
				this.createCylinder(v1, v2, node[6], material);
				// Create skeleton line as well
				this.createEdge(v1, v2, 'neurite');
			} else {
				// Create line
				this.createEdge(v1, v2, 'neurite');
				// Create sphere
				if (node[6] > 0) {
					this.createNodeSphere(v1, node[6], material);
				}
			}
		} else {
			// For the root node, which must be added to vs
			v1 = vs[node[0]];
      if (!v1) {
        v1 = this.space.toSpace(new THREE.Vector3(node[3], node[4], node[5]));
        v1.node_id = node[0];
        v1.user_id = node[2];
        vs[node[0]] = v1;
      }
      if (node[6] > 0) {
        // Clear the slot for a sphere at the root
        var mesh = this.radiusVolumes[v1.node_id];
        if (mesh) {
          this.space.remove(mesh);
          delete this.radiusVolumes[v1.node_id];
        }
			  this.createNodeSphere(v1, node[6], material);
      }
		}
		if (!lean && node[7] < 5) {
			// Edge with confidence lower than 5
			this.createLabelSphere(v1, this.space.staticContent.labelColors.uncertain);
		}
	}, this);

  if (options.smooth_skeletons) {
    var smoothed = this.createArbor().smoothPositions(vs, options.smooth_skeletons_sigma);
    Object.keys(vs).forEach(function(node_id) {
      vs[node_id].copy(smoothed[node_id]);
    });
  }

	// Create edges between all connector nodes and their associated skeleton nodes,
	// appropriately colored as pre- or postsynaptic.
	// If not yet there, create as well the sphere for the node related to the connector
	connectors.forEach(function(con) {
		// con[0]: treenode ID
		// con[1]: connector ID
		// con[2]: 0 for pre, 1 for post
		// indices 3,4,5 are x,y,z for connector
		// indices 4,5,6 are x,y,z for node
		var v1 = this.space.toSpace(new THREE.Vector3(con[3], con[4], con[5]));
    v1.node_id = con[1];
		var v2 = vs[con[0]];
		this.createEdge(v1, v2, this.synapticTypes[con[2]]);
		this.createSynapticSphere(v2, con[2]);
	}, this);

	// Place spheres on nodes with special labels, if they don't have a sphere there already
	for (var tag in this.tags) {
		if (this.tags.hasOwnProperty(tag)) {
			var tagLC = tag.toLowerCase();
			if (-1 !== tagLC.indexOf('todo')) {
				this.tags[tag].forEach(function(nodeID) {
					if (!this.specialTagSpheres[nodeID]) {
						this.createLabelSphere(vs[nodeID], this.space.staticContent.labelColors.todo);
					}
				}, this);
			} else if (-1 !== tagLC.indexOf('uncertain')) {
				this.tags[tag].forEach(function(nodeID) {
					if (!this.specialTagSpheres[nodeID]) {
						this.createLabelSphere(vs[nodeID], this.space.staticContent.labelColors.uncertain);
					}
				}, this);
			}
		}
	}

  if (options.resample_skeletons) {
    // WARNING: node IDs no longer resemble actual skeleton IDs.
    // All node IDs will now have negative values to avoid accidental similarities.
    var res = this.createArbor().resampleSlabs(vs, options.smooth_skeletons_sigma, options.resampling_delta, 2);
    var vs = this.geometry['neurite'].vertices;
    // Remove existing lines
    vs.length = 0;
    // Add all new lines
    var edges = res.arbor.edges,
        positions = res.positions;
    Object.keys(edges).forEach(function(nodeID) {
      // Fix up Vector3 instances
      var v_child = positions[nodeID];
      v_child.user_id = -1;
      v_child.node_id = -nodeID;
      // Add line
      vs.push(v_child);
      vs.push(positions[edges[nodeID]]); // parent
    });
    // Fix up root
    var v_root = positions[res.arbor.root];
    v_root.user_id = -1;
    v_root.node_id = -res.arbor.root;
  }
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.show = function(options) {

	this.addCompositeActorToScene();

	this.setActorVisibility( this.skeletonmodel.selected ); // the skeleton, radius spheres and label spheres

	if (options.connector_filter) {
		this.setPreVisibility( false ); // the presynaptic edges and spheres
		this.setPostVisibility( false ); // the postsynaptic edges and spheres
	} else {
		this.setPreVisibility( this.skeletonmodel.pre_visible ); // the presynaptic edges and spheres
		this.setPostVisibility( this.skeletonmodel.post_visible ); // the postsynaptic edges and spheres
	}

	this.setTextVisibility( this.skeletonmodel.text_visible ); // the text labels

  //this.updateSkeletonColor(options);

  // Will query the server
  if ('cyan-red' !== options.connector_color) this.space.updateConnectorColors(options, [this]);
};

/**
 * Toggles the display of a JQuery UI dialog that shows which user has which
 * color assigned.
 */
WebGLApplication.prototype.toggle_usercolormap_dialog = function() {
  // In case a color dialog exists already, close it and return.
  if ($('#user-colormap-dialog').length > 0) {
      $('#user-colormap-dialog').remove();
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

  var users = User.all();
  for (var userID in users) {
    if (users.hasOwnProperty(userID) && userID !== "-1") {
      var user = users[userID];
      var rowElement = $('<tr/>');
      rowElement.append( $('<td/>').text( user.login ) );
      rowElement.append( $('<td/>').text( user.fullName ) );
      rowElement.append( $('<div/>').css('width', '100px').css('height', '20px').css('background-color', '#' + user.color.getHexString()) );
      $('#usercolormap-table > tbody:last').append( rowElement );
    }
  }
};
