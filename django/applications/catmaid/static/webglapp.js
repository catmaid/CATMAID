/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */


/* Only methods of the WebGLApplication object elicit a render. All other methods
 * do not, except for those that use continuations to load data (meshes) or to
 * compute with web workers (betweenness centrality shading). */
WebGLApplication = function() {};

WebGLApplication.prototype = {};

/** Static, empty instance. Call its init method to create the 3d space. */
window.WebGLApp = new WebGLApplication();

WebGLApplication.prototype.fn = function(name) {
  var self = this;
  return function() { self[name](); };
};

WebGLApplication.prototype.init = function(canvasWidth, canvasHeight, divID) {
	this.divID = divID;
	this.container = document.getElementById(divID);
	this.stack = project.focusedStack;
	this.scale = 50.0 / this.stack.dimension.x;
  this.submit = new submitterFn();
	this.options = new WebGLApplication.prototype.OPTIONS.clone();
	this.space = new this.Space(canvasWidth, canvasHeight, this.container, this.stack, this.scale);
};

WebGLApplication.prototype.destroy = function() {
  this.space.destroy();
  Object.keys(this).forEach(function(key) { delete this[key]; }, this);
};

WebGLApplication.prototype.resizeView = function(w, h) {
  if (!this.space) {
    this.init(w, h);
  }

  var canvasWidth = w,
      canvasHeight = h;

  if (!THREEx.FullScreen.activated()) {
    $('#view_in_3d_webgl_widget').css('overflowY', 'hidden');
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

    $('#viewer-3d-webgl-canvas').width(canvasWidth);
    $('#viewer-3d-webgl-canvas').height(canvasHeight);
    $('#viewer-3d-webgl-canvas').css("background-color", "#000000");

    this.space.setSize(canvasWidth, canvasHeight);

    this.space.render();
  }
};

WebGLApplication.prototype.fullscreenWebGL = function() {
	var divID = 'view_in_3d_webgl_widget'; //'viewer-3d-webgl-canvas';
	if (THREEx.FullScreen.activated()){
		var w = canvasWidth, h = canvasHeight;
		this.resizeView( w, h );
		THREEx.FullScreen.cancel();
	} else {
		THREEx.FullScreen.request(document.getElementById('viewer-3d-webgl-canvas'));
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
  console.log(sf, sf.val());
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
	this.space.staticContent.updateZPlanePosition(this.stack, this.scale);
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

WebGLApplication.prototype.is_widget_open = function() {
	// TODO must change to accomodate multiple 3D Viewers
  if( $('#view_in_3d_webgl_widget').length ) 
    return true;
  else
    return false;
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

WebGLApplication.prototype.setSkeletonVisibility = function( skeleton_id, vis ) {
	var skeletons = this.space.content.skeletons;
	if (!skeletons.hasOwnProperty(skeleton_id)) return;
	skeletons[skeleton_id].setActorVisibility( vis );
	if (this.options.connector_filter) {
		this.refreshRestrictedConnectors();
	} else {
		this.space.render();
	}
	return this.options.connector_filter;
};

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
	var visible_skeletons = NeuronStagingArea.getSelectedSkeletons();
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
	this.options.shading_method = $('#skeletons_shading :selected').attr("value");

	var skeletons = this.space.content.skeletons;
	for (var skeleton_id in skeletons) {
		if (skeletons.hasOwnProperty(skeleton_id)) {
			skeletons[skeleton_id].shaderWorkers(this.options);
		}
	}
};

WebGLApplication.prototype.look_at_active_node = function() {
	this.updateActiveNodePosition();
	this.space.view.controls.target = this.space.content.active_node.mesh.position.clone();
	this.space.render();
};

WebGLApplication.prototype.updateActiveNodePosition = function() {
	var a = this.space.content.active_node;
	a.updatePosition(this.space);
  this.space.render();
};


WebGLApplication.prototype.has_skeleton = function(skeleton_id) {
	return this.space.content.skeletons.hasOwnProperty(skeleton_id);
};

/** Fetch skeletons one by one, and render just once at the end. */
WebGLApplication.prototype.addSkeletons = function(skeletonIDs, refresh_restricted_connectors, callback) {
	if (!skeletonIDs || 0 === skeletonIDs.length) return;
	var skeleton_ids = skeletonIDs.map(function(id) { return parseInt(id); });
	var self = this;
  var i = 0;
  var missing = [];
  var unloadable = [];

  var fnMissing = function() {
    if (missing.length > 0 && confirm("Skeletons " + missing.join(', ') + " do not exist. Remove them from the Selection Table?")) {
      NeuronStagingArea.removeSkeletons(missing);
    }
    if (unloadable.length > 0) {
      alert("Could not load skeletons: " + unloadable.join(', '));
    }
  };

  var fn = function(skeleton_id) {
    // NOTE: cannot use 'submit': on error, it would abort the chain of calls and show an alert
    requestQueue.register(django_url + project.id + '/skeleton/' + skeleton_id + '/compact-json', 'POST', {},
        function(status, text) {
          try {
            if (200 === status) {
              var json = $.parseJSON(text);
              if (json.error) {
                // e.g. the skeleton as listed in the selection table does not exist in the database
                console.log(json.error);
                self.space.removeSkeleton(skeleton_id);
                if (0 === json.error.indexOf("Skeleton #" + skeleton_id + " doesn't exist")) {
                  missing.push(skeleton_id);
                } else {
                  unloadable.push(skeleton_id);
                }
              } else {
                var sk = self.space.updateSkeleton(skeleton_id, json);
                if (sk) sk.show(self.options);
              }
            } else {
              unloadable.push(skeleton_id);
            }
            i += 1;
            $('#counting-loaded-skeletons').text(i + " / " + skeleton_ids.length);
            if (i < skeleton_ids.length) {
              fn(skeleton_ids[i]);
            } else {
              if (refresh_restricted_connectors) self.refreshRestrictedConnectors();
              self.space.render();
              if (callback) {
                try { callback(); } catch (e) { alert(e); }
              }
              if (skeleton_ids.length > 1) {
                $.unblockUI();
              }
              fnMissing();
            }
          } catch(e) {
            $.unblockUI();
            console.log(e, new Error(e).stack);
            growlAlert("ERROR", "Loaded only " + i + " / " + skeleton_ids.length + " skeletons!");
            fnMissing();
          }
        });
  };
  if (skeleton_ids.length > 1) {
    $.blockUI({message: '<img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> <h2>Loading skeletons <div id="counting-loaded-skeletons">0 / ' + skeleton_ids.length + '</div></h2>'});
  }
  fn(skeleton_ids[0]);
};

WebGLApplication.prototype.refresh_skeletons = function() {
  var selected = NeuronStagingArea.getSelectedSkeletons();
  var selected_set = selected.reduce(function(o, id) { o[id] = id; return o;}, {});

  var skeletons = this.space.content.skeletons;

  var remove = Object.keys(skeletons).filter(function(skid) { return !(skid in selected_set); });

  if (remove.length > 0) this.space.removeSkeletons(remove);
  if (selected.length > 0) {
    this.addSkeletons(selected, false);
    this.space.render();
  } else if (Object.keys(skeletons).length > 0) {
    this.refreshRestrictedConnectors();
  } else {
    this.space.render();
  }
};

WebGLApplication.prototype.getListOfSkeletonIDs = function(only_visible) {
	growlAlert("OBSOLETE", "You should be grabbing the list from the Selection Table!");
	var skeletons = this.space.content.skeletons;
	if (only_visible) return Object.keys(skeletons).filter(function(skid) { return skeletons[skid].visible; }).map(parseInt);
	return Object.keys(skeletons).map(parseInt);
};


WebGLApplication.prototype.getColorOfSkeleton = function( skeleton_id ) {
	growlAlert("OBSOLETE", "You should be grabbing the color from the Selection Table!");
	if (skeleton_id in skeletons) {
		return skeletons[skeleton_id].getActorColorAsHTMLHex();
	} else {
		return '#FF0000';
	}
};

WebGLApplication.prototype.removeSkeletons = function(skeleton_ids) {
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
	this.space.content.active_node.visible = true;
};


WebGLApplication.prototype.configureParameters = function() {
	var space = this.space;
	var options = this.options;

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

  var submit = this.submit;

	$(dialog).dialog({
		height: 440,
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

				space.staticContent.adjust(options, space);
				space.content.adjust(options, space, submit);

        space.render();

				// Copy
				WebGLApplication.prototype.OPTIONS = options.clone();

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
WebGLApplication.prototype.Space = function( w, h, container, stack, scale ) {
	this.stack = stack;
  this.container = container; // used by MouseControls

	// Scale at which to show the objects
	this.scale = scale;

	this.canvasWidth = w;
	this.canvasHeight = h;
	this.yDimensionUnscaled = stack.dimension.y * stack.resolution.y;

	// Absolute center in Space coordinates (not stack coordinates)
	this.center = this.createCenter();
	this.dimensions = new THREE.Vector3(stack.dimension.x * stack.resolution.x * scale, stack.dimension.y * stack.resolution.y * scale, stack.dimension.z * stack.resolution.z * scale);

	// WebGL space
	this.scene = new THREE.Scene();
	this.view = new this.View(container, this);
	this.lights = this.createLights(stack.dimension, stack.resolution, scale, this.view.camera);
	this.lights.forEach(this.scene.add, this.scene);

	// Content
	this.staticContent = new this.StaticContent(stack, this.center, scale);
	this.scene.add(this.staticContent.box);
	this.scene.add(this.staticContent.floor);

	this.content = new this.Content(scale);
  this.content.active_node.updatePosition(this);
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
	v3.x *= this.scale;
	v3.y = this.scale * (this.yDimensionUnscaled - v3.y);
	v3.z = -v3.z * this.scale;
	return v3;
};

/** Transform axes but do not scale. */
WebGLApplication.prototype.Space.prototype.coordsToUnscaledSpace = function(x, y, z) {
	return [x, this.yDimensionUnscaled - y, -z];
};

/** Starting at i, edit i, i+1 and i+2, which represent x, y, z of a 3d point. */
WebGLApplication.prototype.Space.prototype.coordsToUnscaledSpace2 = function(vertices, i) {
	// vertices[i] equal
	vertices[i+1] =  this.yDimensionUnscaled -vertices[i+1];
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


WebGLApplication.prototype.Space.prototype.createLights = function(dimension, resolution, scale, camera) {
	var ambientLight = new THREE.AmbientLight( 0x505050 );

  var pointLight = new THREE.PointLight( 0xffaa00 );
	pointLight.position.set(dimension.x * resolution.x * scale,
                          dimension.y * resolution.y * scale,
													50);

	var light = new THREE.SpotLight( 0xffffff, 1.5 );
	light.position.set(dimension.x * resolution.x * scale / 2,
										 dimension.y * resolution.y * scale / 2,
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
	this.view.destroy();
	this.view = null;

	this.lights.forEach(this.scene.remove, this.scene);
	this.scene.remove(this.staticContent.box);
	this.scene.remove(this.staticContent.floor);
	if (this.staticContent.zplane) this.scene.remove(this.staticContent.zplane);
	this.staticContent.missing_sections.forEach(this.scene.remove, this.scene);

  this.removeSkeletons(Object.keys(this.content.skeletons));
	this.scene.remove(this.content.active_node.mesh);
	this.content.meshes.forEach(this.scene.remove, this.scene);
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


WebGLApplication.prototype.Space.prototype.TextGeometryCache = function() {
	this.geometryCache = {};

	this.getTagGeometry = function(tagString, scale) {
		if (tagString in this.geometryCache) {
			var e = this.geometryCache[tagString];
			e.refs += 1;
			return e.geometry;
		}
		// Else create, store, and return a new one:
		var text3d = new THREE.TextGeometry( tagString, {
			size: 100 * scale,
			height: 20 * scale,
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
};

WebGLApplication.prototype.Space.prototype.StaticContent = function(stack, center, scale) {
	// Space elements
	this.box = this.createBoundingBox(center, stack.dimension, stack.resolution, scale);
	this.floor = this.createFloor();

	this.zplane = null;

	this.missing_sections = [];

	// Shared across skeletons
  this.labelspheregeometry = new THREE.OctahedronGeometry( 130 * scale, 3);
  this.radiusSphere = new THREE.OctahedronGeometry( 40 * scale, 3);
  this.icoSphere = new THREE.IcosahedronGeometry(1, 2);
  this.cylinder = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
  this.textMaterial = new THREE.MeshNormalMaterial( { color: 0xffffff, overdraw: true } );
  // Mesh materials for spheres on nodes tagged with 'uncertain end', 'undertain continuation' or 'TODO'
  this.labelColors = {uncertain: new THREE.MeshBasicMaterial({color: 0xff8000, opacity:0.6, transparent: true}),
                      todo: new THREE.MeshBasicMaterial({color: 0xff0000, opacity:0.6, transparent: true})};
  this.textGeometryCache = new WebGLApplication.prototype.Space.prototype.TextGeometryCache();
  this.synapticColors = [new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.6, transparent:false  } ), new THREE.MeshBasicMaterial( { color: 0x00f6ff, opacity:0.6, transparent:false  } )];

};


WebGLApplication.prototype.Space.prototype.StaticContent.prototype = {};

WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createBoundingBox = function(center, dimension, resolution, scale) {
  var width = dimension.x * resolution.x * scale;
  var height = dimension.y * resolution.y * scale;
  var depth = dimension.z * resolution.z * scale;
  var geometry = new THREE.CubeGeometry( width, height, depth );
  var material = new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: true } );
  var mesh = new THREE.Mesh( geometry, material );
  mesh.position.set(center.x, center.y, center.z);
	return mesh;
};

WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createFloor = function() {
    var line_material = new THREE.LineBasicMaterial( { color: 0x535353 } ),
        geometry = new THREE.Geometry(),
        floor = 0,
        step = 25;
    for ( var i = 0; i <= 40; i ++ ) {
      geometry.vertices.push( new THREE.Vector3( - 500, floor, i * step - 500 ) );
      geometry.vertices.push( new THREE.Vector3(   500, floor, i * step - 500 ) );
      geometry.vertices.push( new THREE.Vector3( i * step - 500, floor, -500 ) );
      geometry.vertices.push( new THREE.Vector3( i * step - 500, floor,  500 ) );

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
		space.view.renderer.setClearColorHex(0x000000, 1);
	} else {
		space.view.renderer.setClearColorHex(0xffffff, 1);
	}

	this.floor.visible = options.show_floor;

	this.box.visible = options.show_box;

	if (this.zplane) space.scene.remove(this.zplane);
	if (options.show_zplane) {
		this.zplane = this.createZPlane(space.stack, space.scale);
    this.updateZPlanePosition(space.stack, space.scale);
		space.scene.add(this.zplane);
	} else {
		this.zplane = null;
	}
};

WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createZPlane = function(stack, scale) {
	var geometry = new THREE.Geometry(),
	    xwidth = stack.dimension.x * stack.resolution.x * scale,
			ywidth = stack.dimension.y * stack.resolution.y * scale,
	    material = new THREE.MeshBasicMaterial( { color: 0x151349, side: THREE.DoubleSide } );

	geometry.vertices.push( new THREE.Vector3( 0,0,0 ) );
	geometry.vertices.push( new THREE.Vector3( xwidth,0,0 ) );
	geometry.vertices.push( new THREE.Vector3( 0,ywidth,0 ) );
	geometry.vertices.push( new THREE.Vector3( xwidth,ywidth,0 ) );
	geometry.faces.push( new THREE.Face4( 0, 1, 3, 2 ) );

	return new THREE.Mesh( geometry, material );
};

WebGLApplication.prototype.Space.prototype.StaticContent.prototype.updateZPlanePosition = function(stack, scale) {
	if (this.zplane) {
		this.zplane.position.z = (-stack.z * stack.resolution.z - stack.translation.z) * scale;
	}
};

/** Returns an array of meshes representing the missing sections. */
WebGLApplication.prototype.Space.prototype.StaticContent.prototype.createMissingSections = function(space, missing_section_height) {
	var d = space.stack.dimension,
			r = space.stack.resolution,
			t = space.stack.translation,
			s = space.scale,
	    geometry = new THREE.Geometry(),
	    xwidth = d.x * r.x * s,
			ywidth = d.y * r.y * s * missing_section_height / 100.0,
	    materials = [new THREE.MeshBasicMaterial( { color: 0x151349, opacity:0.6, transparent: true, side: THREE.DoubleSide } ),
	                 new THREE.MeshBasicMaterial( { color: 0x00ffff, wireframe: true, wireframeLinewidth: 5, side: THREE.DoubleSide } )];

	geometry.vertices.push( new THREE.Vector3( 0,0,0 ) );
	geometry.vertices.push( new THREE.Vector3( xwidth,0,0 ) );
	geometry.vertices.push( new THREE.Vector3( 0,ywidth,0 ) );
	geometry.vertices.push( new THREE.Vector3( xwidth,ywidth,0 ) );
	geometry.faces.push( new THREE.Face4( 0, 1, 3, 2 ) );

  return space.stack.broken_slices.reduce(function(missing_sections, sliceZ) {
		var z = (-sliceZ * r.z - t.z) * s;
		return missing_sections.concat(materials.map(function(material) {
			var mesh = new THREE.Mesh(geometry, material);
			mesh.position.z = z;
			return mesh;
		}));
	}, []);
};

WebGLApplication.prototype.Space.prototype.Content = function(scale) {
	// Scene content
	this.active_node = new this.ActiveNode(scale);
	this.meshes = [];
	this.skeletons = {};
};

WebGLApplication.prototype.Space.prototype.Content.prototype = {};

WebGLApplication.prototype.Space.prototype.Content.prototype.loadMeshes = function(space, submit, material) {
  submit(django_url + project.id + "/stack/" + space.stack.id + "/models",
         {},
         function (models) {
           var ids = Object.keys(models);
           if (0 === ids.length) return;
           var loader = new THREE.JSONLoader( true );
           var scale = space.scale;
           ids.forEach(function(id) {
             var vs = models[id].vertices;
             for (var i=0; i < vs.length; i+=3) {
               space.coordsToUnscaledSpace2(vs, i);
             }
             var geometry = loader.parse(models[id]).geometry;
             var mesh = new THREE.Mesh(geometry, material);
             mesh.scale.set(scale, scale, scale);
             mesh.position.set(0, 0, 0);
             mesh.rotation.set(0, 0, 0);
             space.content.meshes.push(mesh);
             space.add(mesh);
           });
           space.render();
        });
};

/** Adjust visibility of static content according to the persistent options. */
WebGLApplication.prototype.Space.prototype.Content.prototype.adjust = function(options, space, submit) {
	if (options.show_meshes) {
    if (0 === this.meshes.length) {
		  this.loadMeshes(space, submit, options.createMeshMaterial());
    }
	} else {
		this.meshes.forEach(space.scene.remove, space.scene);
		this.meshes = [];
	}

	this.active_node.setVisible(options.show_active_node);
};


WebGLApplication.prototype.Space.prototype.View = function(container, space) {
	this.space = space;

	this.camera = new THREE.CombinedCamera( -space.canvasWidth, -space.canvasHeight, 75, 1, 3000, -1000, 1, 500 );
  this.camera.frustumCulled = false;

	this.projector = new THREE.Projector();

	this.renderer = new THREE.WebGLRenderer({ antialias: true });
  this.renderer.sortObjects = false;
  this.renderer.setSize( space.canvasWidth, space.canvasHeight );

	this.controls = this.createControls( this.camera, container, this.space.center );
	this.mouseControls = new this.MouseControls(this.space, this.controls, this.projector, this.camera);

	// Initialize
	var e = this.renderer.domElement;
  container.appendChild(e);
  e.addEventListener('mousedown', this.mouseControls.onMouseDown, false);
  e.addEventListener('mouseup', this.mouseControls.onMouseUp, false);
  e.addEventListener('mousemove', this.mouseControls.onMouseMove, false);
  e.addEventListener('mousewheel', this.mouseControls.onMouseWheel, false);

	// Initial view
	this.XY();
};

WebGLApplication.prototype.Space.prototype.View.prototype = {};

WebGLApplication.prototype.Space.prototype.View.prototype.destroy = function() {
	var e = this.renderer.domElement;
  e.removeEventListener('mousedown', this.mouseControls.onMouseDown, false);
  e.removeEventListener('mouseup', this.mouseControls.onMouseUp, false);
  e.removeEventListener('mousemove', this.mouseControls.onMouseMove, false);
  e.removeEventListener('mousewheel', this.mouseControls.onMouseWheel, false);
  this.renderer = null;
};

WebGLApplication.prototype.Space.prototype.View.prototype.createControls = function( camera, container, center ) {
	var controls = new THREE.TrackballControls( camera, container );
  controls.rotateSpeed = 1.0;
  controls.zoomSpeed = 3.2;
  controls.panSpeed = 1.5;
  controls.noZoom = false;
  controls.noPan = false;
  controls.staticMoving = true;
  controls.dynamicDampingFactor = 0.3;
	controls.target = center.clone();
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

WebGLApplication.prototype.Space.prototype.View.prototype.MouseControls = function(space, controls, projector, camera) {
	var is_mouse_down = false;
	var mouse = new THREE.Vector2();

  this.onMouseWheel = function(ev) {
    space.render();
  };

	this.onMouseMove = function(ev) {
    mouse.x =  ( ev.offsetX / space.canvasWidth  ) * 2 -1;
    mouse.y = -( ev.offsetY / space.canvasHeight ) * 2 +1;

    if (is_mouse_down) {
      space.render();
    }

    space.container.style.cursor = 'pointer';
	};

	this.onMouseUp = function(ev) {
		is_mouse_down = false;
    controls.enabled = true;
    space.render(); // May need another render on occasions
	};

	this.onMouseDown = function(ev) {
    is_mouse_down = true;
		if (!ev.shiftKey) return;

		// Find object under the mouse
		var vector = new THREE.Vector3(mouse.x, mouse.y, 0.5);
		projector.unprojectVector(vector, camera);
		var raycaster = new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize());

		// Attempt to intersect visible skeleton spheres, stopping at the first found
		var fields = ['specialTagSpheres', 'synapticSpheres', 'radiusVolumes'];
		if (Object.keys(space.content.skeletons).some(function(skeleton_id) {
			var skeleton = space.content.skeletons[skeleton_id];
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


WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode = function(scale) {
  this.geometry = new THREE.IcosahedronGeometry(1, 2);
  this.mesh = new THREE.Mesh( this.geometry, new THREE.MeshBasicMaterial( { color: 0x00ff00, opacity:0.8, transparent:true } ) );
  this.mesh.scale.x = this.mesh.scale.y = this.mesh.scale.z = 160 * scale;
};

WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode.prototype = {};

WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode.prototype.setVisible = function(visible) {
	this.mesh.visible = visible ? true : false;
};

WebGLApplication.prototype.Space.prototype.Content.prototype.ActiveNode.prototype.updatePosition = function(space) {
	var pos = SkeletonAnnotations.getActiveNodePosition();
	if (!pos) return;

	var stack = space.stack,
      t = stack.translation,
			r = stack.resolution,
			c = new THREE.Vector3(t.x + (pos.x / stack.scale) * r.x,
			                      t.y + (pos.y / stack.scale) * r.y,
														t.z + pos.z * r.z);

	space.toSpace(c);

	this.mesh.position.set(c.x, c.y, c.z);
	this.setVisible(true);
};

WebGLApplication.prototype.Space.prototype.updateSkeleton = function(skeleton_id, json) {
  if (!NeuronStagingArea.getSkeleton(skeleton_id)) {
    // Skeleton was removed from selection while json was loading
    // Remove if present
    this.removeSkeleton(skeleton_id);
    return false;
  }

  if (this.content.skeletons.hasOwnProperty(skeleton_id)) {
    this.content.skeletons[skeleton_id].reinit_actor(json);
  } else {
    this.content.skeletons[skeleton_id] = new this.Skeleton(this, skeleton_id, json);
  }
  return this.content.skeletons[skeleton_id];
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
WebGLApplication.prototype.Space.prototype.Skeleton = function(space, skeleton_id, json) {
	this.space = space;
	this.id = skeleton_id;
	this.baseName = json[0];
  this.synapticColors = space.staticContent.synapticColors;
	this.reinit_actor(json);
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype = {};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.CTYPES = ['neurite', 'presynaptic_to', 'postsynaptic_to'];
WebGLApplication.prototype.Space.prototype.Skeleton.prototype.synapticTypes = ['presynaptic_to', 'postsynaptic_to'];

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.initialize_objects = function() {
	this.skeletonmodel = NeuronStagingArea.getSkeleton( this.id );
	this.line_material = {};
	this.actorColor = new THREE.Color(0xffff00);
	this.visible = true;
	if (undefined === this.skeletonmodel) {
		console.log('Can not initialize skeleton object');
		return;
	}
	var CTYPES = this.CTYPES;
	this.line_material[CTYPES[0]] = new THREE.LineBasicMaterial({color: 0xffff00, opacity: 1.0, linewidth: 3});
	this.line_material[CTYPES[1]] = new THREE.LineBasicMaterial({color: 0xff0000, opacity: 1.0, linewidth: 6});
	this.line_material[CTYPES[2]] = new THREE.LineBasicMaterial({color: 0x00f6ff, opacity: 1.0, linewidth: 6});

	this.geometry = {};
	this.geometry[CTYPES[0]] = new THREE.Geometry();
	this.geometry[CTYPES[1]] = new THREE.Geometry();
	this.geometry[CTYPES[2]] = new THREE.Geometry();

	this.actor = {}; // has three keys (the CTYPES), each key contains the edges of each type
	for (var i=0; i<CTYPES.length; ++i) {
		this.actor[CTYPES[i]] = new THREE.Line(this.geometry[CTYPES[i]], this.line_material[CTYPES[i]], THREE.LinePieces);
	}

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
        var v = vs[nodeID];
				var text = new THREE.Mesh( cache.getTagGeometry(tagString, this.space.scale), textMaterial );
				text.position.x = v.x;
				text.position.y = v.y;
				text.position.z = v.z;
				text.visible = true;
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

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.updateSkeletonColor = function(options) {
	if ('creator' === NeuronStagingArea.skeletonsColorMethod
	 || 'reviewer' === NeuronStagingArea.skeletonsColorMethod
	 || 'none' !== options.shading_method)
	{
		// The skeleton colors need to be set per-vertex.
		this.line_material['neurite'].vertexColors = THREE.VertexColors;
		this.line_material['neurite'].needsUpdate = true;
		this.geometry['neurite'].colors = [];
		var edgeWeights = {};
		if ('betweenness_centrality' === options.shading_method) {
			// Darken the skeleton based on the betweenness calculation.
			edgeWeights = this.betweenness;
		} else if ('branch_centrality' === options.shading_method) {
			// TODO: Darken the skeleton based on the branch calculation.
			edgeWeights = this.branchCentrality;
		}

    var pickColor;
    var actorColor = this.actorColor;
    if ('creator' === NeuronStagingArea.skeletonsColorMethod) {
      pickColor = function(vertex) { return User(vertex.user_id).color; };
    } else if ('reviewer' === NeuronStagingArea.skeletonsColorMethod) {
      pickColor = function(vertex) { return User(vertex.reviewer_id).color; };
    } else {
      pickColor = function() { return actorColor; };
    }

		this.geometry['neurite'].vertices.forEach(function(vertex) {
			// Determine the base color of the vertex.
			var baseColor = pickColor(vertex);

			if (!this.graph) this.graph = this.createGraph();

			// Darken the color by the average weight of the vertex's edges.
			var weight = 0;
			var neighbors = this.graph.neighbors(vertex.node_id);
			neighbors.forEach(function(neighbor) {
				var edge = [vertex.node_id, neighbor].sort();
				weight += (edge in edgeWeights ? edgeWeights[edge] : 1.0);
			});
			weight = (weight / neighbors.length) * 0.75 + 0.25;
			var color = new THREE.Color().setRGB(baseColor.r * weight, baseColor.g * weight, baseColor.b * weight);
			this.geometry['neurite'].colors.push(color);

			if (vertex.node_id in this.radiusVolumes) {
				var mesh = this.radiusVolumes[vertex.node_id];
				var material = mesh.material.clone();
				material.color = color;
				mesh.setMaterial(material);
			}
		}, this);
		this.geometry['neurite'].colorsNeedUpdate = true;

		this.actor['neurite'].material.color = new THREE.Color(0xffffff);
		this.actor['neurite'].material.needsUpdate = true;
	} else {
		// Display the entire skeleton with a single color.
		this.line_material['neurite'].vertexColors = THREE.NoColors;
		this.line_material['neurite'].needsUpdate = true;
		
		this.actor['neurite'].material.color = this.actorColor;
		this.actor['neurite'].material.needsUpdate = true;

		var material = new THREE.MeshBasicMaterial({color: this.actorColor, opacity:1.0, transparent:false});

		for ( var k in this.radiusVolumes ) {
			this.radiusVolumes[k].setMaterial(material);
		}
	}
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.changeColor = function(color, options) {
	this.actorColor = color;
	
	if (NeuronStagingArea.skeletonsColorMethod === 'random' || NeuronStagingArea.skeletonsColorMethod === 'manual') {
		this.updateSkeletonColor(options);
	}
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
			if (this.connectoractor[this.synapticTypes[i]]) {
				this.space.remove(this.connectoractor[this.synapticTypes[i]]);
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
		this.connectoractor[type] = new THREE.Line( this.connectorgeometry[type], this.line_material[type], THREE.LinePieces );
		this.space.add( this.connectoractor[type] );
  }, this);
};

/** Place a colored sphere at the node. Used for highlighting special tags like 'uncertain end' and 'todo'. */
WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createLabelSphere = function(v, material) {
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
	var mesh = new THREE.Mesh( this.space.staticContent.radiusSphere, this.synapticColors[itype] );
	mesh.position.set( v.x, v.y, v.z );
	mesh.node_id = v.node_id;
	mesh.type = this.synapticTypes[itype];
	this.synapticSpheres[v.node_id] = mesh;
	this.space.add( mesh );
};


WebGLApplication.prototype.Space.prototype.Skeleton.prototype.reinit_actor = function(skeleton_data) {
	if (this.actor) {
		this.destroy();
	}
	this.initialize_objects();

	// Graph for calculating the centrality-based shading will be created when needed
	this.graph = null;
	this.betweenness = {};
	this.branchCentrality = {};

	var nodes = skeleton_data[1];
	var tags = skeleton_data[2];
	var connectors = skeleton_data[3];

	var scale = this.space.scale;

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

	// Create edges between all skeleton nodes
	// and a sphere on the node if radius > 0
	nodes.forEach(function(node) {
		// node[0]: treenode ID
		// node[1]: parent ID
    // node[2]: user ID
    // node[3]: reviewer ID
    // 4,5,6: x,y,z
		// node[7]: radius
		// node[8]: confidence
		// If node has a parent
    var v1;
		if (node[1]) {
			var p = nodeProps[node[1]];
      v1 = vs[node[0]];
      if (!v1) {
			  v1 = this.space.toSpace(new THREE.Vector3(node[4], node[5], node[6]));
        v1.node_id = node[0];
        v1.user_id = node[2];
        v1.reviewer_id = node[3];
        vs[node[0]] = v1;
      }
      var v2 = vs[p[0]];
      if (!v2) {
			  v2 = this.space.toSpace(new THREE.Vector3(p[4], p[5], p[6]));
        v2.node_id = p[0];
        v2.user_id = p[2];
        v2.reviewer_id = p[3];
        vs[p[0]] = v2;
      }
			var nodeID = node[0];
			if (node[7] > 0 && p[7] > 0) {
				// Create cylinder using the node's radius only (not the parent) so that the geometry can be reused
				var scaled_radius = node[7] * scale;
				this.createCylinder(v1, v2, scaled_radius, material);
				// Create skeleton line as well
				this.createEdge(v1, v2, 'neurite');
			} else {
				// Create line
				this.createEdge(v1, v2, 'neurite');
				// Create sphere
				if (node[7] > 0) {
					this.createNodeSphere(v1, node[7] * scale, material);
				}
			}
		} else {
			// For the root node, which must be added to vs
			v1 = vs[node[0]];
      if (!v1) {
        v1 = this.space.toSpace(new THREE.Vector3(node[4], node[5], node[6]));
        v1.node_id = node[0];
        v1.user_id = node[2];
        v1.reviewer_id = node[3];
        vs[node[0]] = v1;
      }
      if (node[7] > 0) {
			  this.createNodeSphere(v1, node[7] * scale, material);
      }
		}
		if (node[8] < 5) {
			// Edge with confidence lower than 5
			this.createLabelSphere(v1, this.space.staticContent.labelColors.uncertain);
		}
	}, this);

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
		if (!this.synapticSpheres.hasOwnProperty(v2.node_id)) {
			this.createSynapticSphere(v2, con[2]);
		}
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
	
	this.actorColor = this.skeletonmodel.color;

  this.shaderWorkers(options);
};

WebGLApplication.prototype.Space.prototype.Skeleton.prototype.createGraph = function() {
  // Every consecutive pair of nodes represents an edge, and with the node id, one can recreate the graph easily.
  var nodes = this.geometry['neurite'].vertices,
			graph = jsnx.Graph();
  for (var i=0; i<nodes.length; i+=2) {
    graph.add_edge(nodes[i].node_id, nodes[i+1].node_id);
  }
	return graph;
};

/** Populate datastructures for skeleton shading methods, and trigger a render
 * when done and if appropriate. Does none of that and updates skeleton color
 * when the shading method is none, or the graph data structures are already
 * populated. */
WebGLApplication.prototype.Space.prototype.Skeleton.prototype.shaderWorkers = function(options) {
	// Update color and return if calculations were already done or are not requested
	if ('none' === options.shading_method || Object.keys(this.betweenness).length > 0) {
		this.updateSkeletonColor(options);
		return;
	}

	if (typeof(Worker) === "undefined") {
		growlAlert("Warning", "Cannot calculate graph centrality, your browser does not support Web Workers");
		return;
	}

	if (!this.graph) this.graph = this.createGraph();

	// Put up some kind of indicator that calculations are underway.
	$.blockUI({message: '<h2><img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> Computing... just a moment...</h2>'});

	// Calculate the betweenness centrality of the graph in another thread.
	// (This will run once the simplified graph has been created by w3 below.)
	var w1 = new Worker(STATIC_URL_JS + "graph_worker.js");
	var self = this;
	w1.onmessage = function (event) {
		// Map the betweenness values back to the original graph.
		for (var simplifiedEdge in event.data) {
			if (event.data.hasOwnProperty(simplifiedEdge)) {
				// Assign the value to all edges in the original graph that map to the edge in the simplified graph.
				var value = event.data[simplifiedEdge];
				simplifiedEdge = simplifiedEdge.split(',');
				var edgeData = self.simplifiedGraph.get_edge_data(simplifiedEdge[0], simplifiedEdge[1]);
				if (!('map' in edgeData)) {
					edgeData.map = [simplifiedEdge];
				}
				edgeData.map.forEach(function(originalEdge) {
					self.betweenness[originalEdge.sort()] = value;
				});
				}
			}
			if (options.shading_method === 'betweenness_centrality') {
				$.unblockUI();
				self.updateSkeletonColor(options);
				self.space.render();
			}
		};

	// Calculate the branch centrality of the graph in another thread.
	// (This will run once the simplified graph has been created by w3 below.)
	var w2 = new Worker(STATIC_URL_JS + "graph_worker.js");
	w2.onmessage = function (event) {
		// Map the centrality values back to the original graph.
		for (var simplifiedEdge in event.data) {
			if (event.data.hasOwnProperty(simplifiedEdge)) {
				// Assign the value to all edges in the original graph that map to the edge in the simplified graph.
				var value = event.data[simplifiedEdge];
				simplifiedEdge = simplifiedEdge.split(',');
				var edgeData = self.simplifiedGraph.get_edge_data(simplifiedEdge[0], simplifiedEdge[1]);
				if (!('map' in edgeData)) {
					edgeData.map = [simplifiedEdge];
				}
					
//               // Label each segment with it's value.
//               if( !self.textlabels.hasOwnProperty( simplifiedEdge )) {
//                 var text3d = new THREE.TextGeometry( parseInt(value * self.simplifiedGraph.number_of_edges()), {
//                   size: 100 * scale,
//                   height: 20 * scale,
//                   curveSegments: 1,
//                   font: "helvetiker"
//                 });
//                 text3d.computeBoundingBox();
//                 var centerOffset = -0.5 * ( text3d.boundingBox.max.x - text3d.boundingBox.min.x );
//                 
//                 var originalEdge = edgeData.map[0];
//                 var fv = transform_coordinates([self.original_vertices[originalEdge[0]].x, self.original_vertices[originalEdge[0]].y, self.original_vertices[originalEdge[0]].z]);
//                 var from_vector = new THREE.Vector3(fv[0], fv[1], fv[2] );
//                 from_vector.multiplyScalar( scale );
//                 var tv = transform_coordinates([self.original_vertices[originalEdge[1]].x, self.original_vertices[originalEdge[1]].y, self.original_vertices[originalEdge[1]].z]);
//                 var to_vector = new THREE.Vector3(tv[0], tv[1], tv[2] );
//                 to_vector.multiplyScalar( scale );
//                 
//                 var textMaterial = new THREE.MeshNormalMaterial( { color: 0xffffff, overdraw: true } );
//                 var text = new THREE.Mesh( text3d, textMaterial );
//                 text.position.x = (from_vector.x + to_vector.x) / 2.0;
//                 text.position.y = (from_vector.y + to_vector.y) / 2.0;
//                 text.position.z = (from_vector.z + to_vector.z) / 2.0;
//                 text.visible = textlabel_visibility;
//                 
//                 self.textlabels[ simplifiedEdge ] = text;
//                 scene.add( text );
//               }
					
				edgeData.map.forEach(function(originalEdge) {
					self.branchCentrality[originalEdge.sort()] = value;
				});
			}
		}
		if (options.shading_method === 'branch_centrality') {
			$.unblockUI();
			self.updateSkeletonColor(options);
			self.space.render();
		}
	};

	// Make a simplified version of the graph that combines all nodes between branches and leaves.
	var w3 = new Worker(STATIC_URL_JS + "graph_worker.js");
	w3.onmessage = function (event) {
		self.simplifiedGraph = jsnx.convert.to_networkx_graph(event.data);

		// Export the simplified graph to GraphViz DOT format:
//           var dot = 'graph {\n';
//           self.simplifiedGraph.edges().forEach(function(edge) {
//             var edgeData = self.simplifiedGraph.get_edge_data(edge[0], edge[1]);
//             dot += edge[0] + '--' + edge[1] + ' [ label="' + ('map' in edgeData ? edgeData.map.length : 1) + '" ];\n';
//           });
//           dot += '}\n';
//           console.log(dot);

		// Calculate the betweenness and branch centralities of the simplified graph.
		w1.postMessage({graph: event.data, action:'edge_betweenness_centrality'});
		w2.postMessage({graph: event.data, action:'branch_centrality'});
	};
	w3.postMessage({graph: jsnx.convert.to_edgelist(self.graph), action:'simplify'});
};
