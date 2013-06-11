/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
var WebGLApp = (function() { return new function () {

  var self = this;
  self.neurons = [];

  // Queue server requests, awaiting returns
  var submit = typeof submitterFn!= "undefined" ? submitterFn() : undefined;

  var camera, scene, renderer, scale, controls, zplane = null, meshes = [];
  var resolution, dimension, translation, canvasWidth, canvasHeight, ortho = false, projector, contour_objects = [],
      bbmesh, floormesh, debugax, togglevisibleall = false, missing_sections = [], mouse = new THREE.Vector2();
  var pointLight, light, ambientLight;
  var is_mouse_down = false, connector_filter = false, missing_section_height = 20, soma_scale = 30.0;

  var labelspheregeometry;
  var radiusSphere;

  var show_meshes = false,
      show_active_node = true,
      show_missing_sections = false,
      show_zplane = false,
      show_boundingbox = true,
      show_floor = true,
      show_background = true;
  
  var shading_method = 'none';

  this.init = function( divID ) {

    self.stack_id = project.focusedStack.id;

    self.divID = divID;
    self.divID_jQuery = '#' + divID;

    resolution = project.focusedStack.resolution;
    dimension = project.focusedStack.dimension;
    translation = project.focusedStack.translation;
  }

  /** Clean up after closing the 3d viewer. */
  this.destroy = function() {
    renderer.domElement.removeEventListener('mousedown', onMouseDown, false);
    renderer.domElement.removeEventListener('mouseup', onMouseUp, false);
    renderer.domElement.removeEventListener('mousemove', onMouseMove, false);
    renderer.domElement.removeEventListener('mousewheel', onMouseWheel, false);
    renderer = null;
    self.removeAllSkeletons();
    self.destroy_all_non_skeleton_data();
  };

  this.destroy_all_non_skeleton_data = function() {
    scene.remove( pointLight );
    scene.remove( light );
    scene.remove( ambientLight );

    if( active_node !== null) {
      scene.remove( active_node );
      active_node = null;
    }

    if( floormesh !== null) {
      scene.remove( floormesh );
      floormesh = null;
    }

    if( zplane !== null) {
      scene.remove( zplane );
      zplane = null;
    }

    if( floormesh !== null) {
      scene.remove( floormesh );
      floormesh = null;
    }

    if( bbmesh !== null) {
      scene.remove( bbmesh );
      bbmesh = null;
    }

    if( debugax !== null) {
      scene.remove( debugax );
      debugax = null;
    }

    if (meshes && meshes.length > 0) {
      meshes.forEach(function(mesh) {
        scene.remove(mesh);
      });
      meshes = [];
    }

    self.removeMissingSections();
  };

  /* transform coordinates from CATMAID coordinate system
     to WebGL coordinate system: x->x, y->y+dy, z->-z
    */
  var transform_coordinates = function ( point ) {
    return [point[0],-point[1]+dimension.y*resolution.y,-point[2] ];
  };

  var connectivity_types = new Array('neurite', 'presynaptic_to', 'postsynaptic_to');

  function init_webgl() {

    container = document.getElementById(self.divID);

    scene = new THREE.Scene();
    camera = new THREE.CombinedCamera( -canvasWidth, -canvasHeight, 75, 1, 3000, -1000, 1, 500 );
    camera.frustumCulled = false;

    controls = new THREE.TrackballControls( camera, container );
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 3.2;
    controls.panSpeed = 1.5;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;

    // lights
    ambientLight = new THREE.AmbientLight( 0x505050 )
    scene.add( ambientLight );
    pointLight = new THREE.PointLight( 0xffaa00 );
    scene.add( pointLight );

    light = new THREE.SpotLight( 0xffffff, 1.5 );
    light.castShadow = true;
    light.shadowCameraNear = 200;
    light.shadowCameraFar = camera.far;
    light.shadowCameraFov = 50;
    light.shadowBias = -0.00022;
    light.shadowDarkness = 0.5;
    light.shadowMapWidth = 2048;
    light.shadowMapHeight = 2048;
    scene.add( light );

    projector = new THREE.Projector();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.sortObjects = false;
    renderer.setSize( canvasWidth, canvasHeight );
    
    container.appendChild( renderer.domElement )
    renderer.domElement.addEventListener('mousedown', onMouseDown, false);
    renderer.domElement.addEventListener('mouseup', onMouseUp, false);
    renderer.domElement.addEventListener('mousemove', onMouseMove, false);
    renderer.domElement.addEventListener('mousewheel', onMouseWheel, false);

    var x_middle = (dimension.x*resolution.x)/2.0 + translation.x,
        y_middle = (dimension.y*resolution.y)/2.0 + translation.y,
        z_middle = (dimension.z*resolution.z)/2.0 + translation.z;

    scale = 50./dimension.x;

    var coord = transform_coordinates([x_middle, y_middle, z_middle]);

    create_stackboundingbox(
            coord[0]*scale,
            coord[1]*scale,
            coord[2]*scale,
            dimension.x*resolution.x*scale,
            dimension.y*resolution.y*scale,
            dimension.z*resolution.z*scale
    );

    pointLight.position.set( 
      dimension.x*resolution.x*scale,
      dimension.y*resolution.y*scale, 
      50 );

    light.position.set( 
      dimension.x*resolution.x*scale / 2,
      dimension.y*resolution.y*scale / 2, 
      50 );

    controls.target = new THREE.Vector3(coord[0]*scale,coord[1]*scale,coord[2]*scale);

    // new THREE.SphereGeometry( 160 * scale, 32, 32, 1 );
    labelspheregeometry = new THREE.OctahedronGeometry( 130 * scale, 4);
    radiusSphere = new THREE.OctahedronGeometry( 40 * scale, 4);

    debugaxes();
    draw_grid();
    XYView();
    self.createActiveNode();

    // Acknowledge persistent options
    // (if the 3d window was opened, options set, and then closed, and then reopened)
    if (show_missing_sections) {
      self.createMissingSections();
    }
    if (show_meshes) {
      show_meshes = false;
      self.toggleMeshes(); // show them
    }
    if (!show_active_node) {
      self.hideActiveNode();
    }
    if (!show_floor) {
      show_floor = true;
      self.toggleFloor(); // hide it
    }
    if (!show_background) {
      show_background = true;
      self.toggleBackground(); // hide it
    }
    if (!show_zplane) {
      show_zplane = true;
      self.toggleZplane(); // hide it
    }

    // Skeleton autoloading triggers:
    var skids = NeuronStagingArea.get_selected_skeletons();
    // If the staging area contains skeletons, add them
    skids.forEach(self.addSkeletonFromID);
    // If the staging area is empty but a node is active, add its skeleton
    if (0 === skids.length && SkeletonAnnotations.getActiveNodeId()) {
      NeuronStagingArea.add_active_object_to_stage();
    }
  };

  function toggleOrthographic() {
      if( ortho ) {
          camera.toPerspective();
          ortho = false;
      } else {
          camera.toOrthographic();
          ortho = true;
      }
      self.render();
  }
  self.toggleOrthographic = toggleOrthographic;

  function getBBDimension()
  {
    return new THREE.Vector3(
      dimension.x*resolution.x*scale,
      dimension.y*resolution.y*scale,
      dimension.z*resolution.z*scale);
  }

  function getBBCenterTarget()
  {
    var x_middle = (dimension.x*resolution.x)/2.0 + translation.x,
        y_middle = (dimension.y*resolution.y)/2.0 + translation.y,
        z_middle = (dimension.z*resolution.z)/2.0 + translation.z,
        coord = transform_coordinates([x_middle, y_middle, z_middle]);
    return new THREE.Vector3(coord[0]*scale,coord[1]*scale,coord[2]*scale);
  }

  function XYView()
  {
    var pos = getBBCenterTarget(),
      dim = getBBDimension();
    controls.target = pos;
    camera.position.x = pos.x;
    camera.position.y = pos.y;
    camera.position.z = (dim.z/2)+pos.z+100;
    camera.up.set(0, 1, 0);
    self.render();
  }
  self.XYView = XYView;

  function XZView()
  {
    var pos = getBBCenterTarget(),
      dim = getBBDimension();
    controls.target = pos;
    camera.position.x = pos.x;
    camera.position.y = (dim.y/2)+150;
    camera.position.z = pos.z;
    camera.up.set(0, 0, -1);
    self.render();
  }
  self.XZView = XZView;

  function YZView()
  {
    var pos = getBBCenterTarget(),
      dim = getBBDimension();
    controls.target = pos;
    camera.position.x = (dim.x/2)+150;
    camera.position.y = pos.y;
    camera.position.z = pos.z;
    camera.up.set(0, 1, 0);
    self.render();
  }
  self.YZView = YZView;

  var Assembly = function( assembly_data, high_res )
  {

    var self = this;
    self.id = assembly_data.id;
    self.baseName = assembly_data.baseName;
    self.assembly_slices = assembly_data.slices;
    var contours = [];
    var high_res = high_res;

    var ProcessSlice = function( index ) {
      //console.log('index', index, self.assembly_slices.length, self.assembly_slices)
      if( index === self.assembly_slices.length ) {
        self.add_to_scene();
        WebGLApp.render();
        return;
      } 
      var slice = assembly_data.slices[ index ];
      var fetchurl;
      if( high_res )
        fetchurl = django_url + project.id + "/stack/" + project.focusedStack.id + '/slice/contour-highres';
      else
        fetchurl = django_url + project.id + "/stack/" + project.focusedStack.id + '/slice/contour';
      requestQueue.register(fetchurl, "GET", {
          nodeid: self.assembly_slices[ index ].node_id
      }, function (status, text, xml) {
              if (status === 200) {
                  if (text && text !== " ") {
                      var e = $.parseJSON(text);
                      if (e.error) {
                          alert(e.error);
                      } else {
                          for (var i=0; i<e.length; i++) {
                            var contourPoints = [];
                            for (var j=0; j<e[i].length; j = j + 2) {
                              // TODO: not add min_x/y, but translate the complete mesh
                              var xx = (slice.min_x+e[i][j])*resolution.x*scale,
                                  yy = -(slice.min_y+e[i][j+1])*resolution.y*scale+dimension.y*resolution.y*scale;
                                  contourPoints.push( new THREE.Vector2 ( xx, yy ) );
                            }
                            self.addContour( slice.node_id, contourPoints, slice.bb_center_x, slice.bb_center_y, slice.sectionindex );
                            index++;
                            ProcessSlice( index );
                          }
                      }
                  }
              }
      });
    }

    ProcessSlice( 0 );

    this.addContour = function( id, contourPoints, bb_center_x, bb_center_y, sectionindex ) {
         //console.log('add contours for slice', id, contourPoints, bb_center_x, bb_center_y, sectionindex)
        var extrusionSettings = {
          size: 10, height: 4, curveSegments: 3, amount:2,
          bevelThickness: 0.5, bevelSize: 0.5, bevelEnabled: false,
          //bevelThickness:1,
          material: 0, extrudeMaterial: 1
        };

        var contourShape = new THREE.Shape( contourPoints );
        var contourGeometry = new THREE.ExtrudeGeometry( contourShape, extrusionSettings );
        
        // TODO: for light: MeshLambertMaterial
        var materialFront = new THREE.MeshLambertMaterial( { color: 0xffff00 } );
        var materialSide = new THREE.MeshLambertMaterial( { color: 0xff8800 } );
        var materialArray = [ materialFront, materialSide ];
        // contourGeometry.materials = materialArray;
        
        //var contour = new THREE.Mesh( contourGeometry, new THREE.MeshFaceMaterial() );

        var contour = THREE.SceneUtils.createMultiMaterialObject( contourGeometry, materialArray );
        contour.node_id = id;

        /*contour.position.x = bb_center_x*resolution.x*scale;
        contour.position.y = -bb_center_y*resolution.y*scale+dimension.y*resolution.y*scale;*/
        contour.position.z = -sectionindex*resolution.z*scale;
        contours[ id ] = contour;
    }

    // TODO: use extrusion
    // http://stemkoski.github.com/Three.js/Extrusion.html
    this.add_to_scene = function() {
      for(var node_id in contours) {
        if( contours.hasOwnProperty(node_id)) {
          scene.add( contours[ node_id ] );
          contour_objects.push( contours[ node_id ] );
        }
      }
    }

    this.remove_from_scene = function() {
      for(var node_id in contours) {
        if( contours.hasOwnProperty(node_id)) {
          scene.remove( contours[ node_id ] );
        }
      }
      contour_objects = []; // garbage collection should remove the objects
    }

  }

  // Shared across all text labels
  var textMaterial = new THREE.MeshNormalMaterial( { color: 0xffffff, overdraw: true } );

  var geometryCache = {};
  /** Memoized function to reuse geometries for text tags. With reference counting.
   *  All skeletons share the same geometry for the same node text tag. */
  var getTagGeometry = function(tagString) {
      if (tagString in geometryCache) {
        var e = geometryCache[tagString];
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
      geometryCache[tagString] = {geometry: text3d, refs: 1};
      return text3d;
   };

  var releaseTagGeometry = function(tagString) {
    if (tagString in geometryCache) {
      var e = geometryCache[tagString];
      e.refs -= 1;
      if (0 === e.refs) {
        delete geometryCache[tagString].geometry;
        delete geometryCache[tagString];
      }
    }
  };

  // Mesh materials for spheres on nodes tagged with 'uncertain end', 'undertain continuation' or 'TODO'
  var labelColors = {uncertain: new THREE.MeshBasicMaterial( { color: 0xff8000, opacity:0.6, transparent:true  } ),
                     todo: new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.6, transparent:true  } )};


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
  var Skeleton = function()
  {
    var self = this;

    this.init = function(skeleton_id, skeleton_data) {
      self.id = skeleton_id;
      self.baseName = skeleton_data[0];
      self.reinit_actor( skeleton_data );
    };

    this.initialize_objects = function()
    {
      this.skeletonmodel = NeuronStagingArea.get_skeletonmodel( self.id );
      this.line_material = new Object();
      this.actorColor = new THREE.Color(0xffff00);
      this.visible = true;
      if( this.skeletonmodel === undefined ) {
        console.log('Can not initialize skeleton object');
        return;
      }
      this.line_material[connectivity_types[0]] = new THREE.LineBasicMaterial( { color: 0xffff00, opacity: 1.0, linewidth: 3 } );
      this.line_material[connectivity_types[1]] = new THREE.LineBasicMaterial( { color: 0xff0000, opacity: 1.0, linewidth: 6 } );
      this.line_material[connectivity_types[2]] = new THREE.LineBasicMaterial( { color: 0x00f6ff, opacity: 1.0, linewidth: 6 } );

      this.nodeProps = null;
      this.connectorProps = null;
      this.geometry = new Object();
      this.actor = new Object(); // has three keys (the connectivity_types), each key contains the edges of each type
      this.geometry[connectivity_types[0]] = new THREE.Geometry();
      this.geometry[connectivity_types[1]] = new THREE.Geometry();
      this.geometry[connectivity_types[2]] = new THREE.Geometry();
      this.vertexcolors = [];
      this.vertexIDs = new Object();
      this.vertexIDs[connectivity_types[0]] = [];
      this.vertexIDs[connectivity_types[1]] = [];
      this.vertexIDs[connectivity_types[2]] = [];
      
      for ( var i=0; i<connectivity_types.length; ++i ) {
        this.actor[connectivity_types[i]] = new THREE.Line( this.geometry[connectivity_types[i]],
          this.line_material[connectivity_types[i]], THREE.LinePieces );
      }
      this.labelSphere = new Object();
      this.synapticSpheres = new Object();
      this.radiusSpheres = new Object();
      this.textlabels = new Object();

      this.connectoractor = new Object();
      this.connectorgeometry = new Object();
    };

    this.destroy_data = function() {

      for ( var i=0; i<connectivity_types.length; ++i ) {
        if( this.actor.hasOwnProperty(connectivity_types[i]) ) {
          delete this.actor[connectivity_types[i]];
        }

        if( this.geometry.hasOwnProperty(connectivity_types[i]) ) {
          delete this.geometry[connectivity_types[i]];
        }

        if( this.connectorgeometry.hasOwnProperty(connectivity_types[i]) ) {
          delete this.connectorgeometry[connectivity_types[i]];
        }        
      }

      for ( var i=0; i<connectivity_types.length; ++i ) {
        if( connectivity_types[i] === 'presynaptic_to' || connectivity_types[i] === 'postsynaptic_to') {
          if( this.connectoractor && this.connectoractor[connectivity_types[i]] ) {
            delete this.connectoractor[connectivity_types[i]];
          }
        }
      }
      for ( var k in this.labelSphere ) {
        if( this.labelSphere.hasOwnProperty( k ) )
          delete this.labelSphere[k];
      }
      for ( var k in this.synapticSpheres ) {
        if( this.synapticSpheres.hasOwnProperty( k ) )
          delete this.synapticSpheres[k];
      }
      for ( var k in this.radiusSpheres ) {
        if( this.radiusSpheres.hasOwnProperty( k ) )
          delete this.radiusSpheres[k];
      }
      for ( var k in this.textlabels ) {
        if( self.textlabels.hasOwnProperty( k ))
          delete this.textlabels[k];
      }

      this.nodeProps = null;
      this.connectorProps = null;
    };

    this.removeActorFromScene = function()
    {
      for ( var i=0; i<connectivity_types.length; ++i ) {
        if( this.actor.hasOwnProperty(connectivity_types[i]) )
          scene.remove( this.actor[connectivity_types[i]] );
      }
      this.remove_connector_selection();
      for ( var k in this.synapticSpheres ) {
        if( this.synapticSpheres.hasOwnProperty( k ) )
          scene.remove( this.synapticSpheres[k] );
      }
      for ( var k in this.radiusSpheres ) {
        if( this.radiusSpheres.hasOwnProperty( k ) )
          scene.remove( this.radiusSpheres[k] );
      }
      removeTextMeshes();
    };

    /** Set the visibility of the skeleton, radius spheres and label spheres. Does not set the visibility of the synaptic spheres or edges. */
    this.setActorVisibility = function( vis ) {
      self.visible = vis;
      self.visibilityCompositeActor( 'neurite', vis );
      for( var idx in self.radiusSpheres ) {
        if( self.radiusSpheres.hasOwnProperty( idx )) {
          self.radiusSpheres[ idx ].visible = vis;
        }
      }
      for( var idx in self.labelSphere ) {
        if( self.labelSphere.hasOwnProperty( idx )) {
          self.labelSphere[ idx ].visible = vis;
        }
      }
    };

    var setSynapticVisibilityFn = function(type) {
      return function(vis) {
        self.visibilityCompositeActor(type, vis);
        for (var idx in self.synapticSpheres) {
          if (self.synapticSpheres.hasOwnProperty(idx)
           && self.synapticSpheres[idx].type === type) {
            self.synapticSpheres[idx].visible = vis;
          }
        }
      };
    };

    this.setPreVisibility = setSynapticVisibilityFn('presynaptic_to');

    this.setPostVisibility = setSynapticVisibilityFn('postsynaptic_to');

    var createTextMeshes = function() {
      // Sort out tags by node: some nodes may have more than one
      var nodeIDTags = {};
      for (var tag in self.tags) {
        if (self.tags.hasOwnProperty(tag)) {
          self.tags[tag].forEach(function(nodeID) {
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

      // Create meshes for the tags for all nodes that need them, reusing the geometries
      for (var tagString in tagNodes) {
        if (tagNodes.hasOwnProperty(tagString)) {
          tagNodes[tagString].forEach(function(nodeID) {
            var node = self.nodeProps[nodeID];
            var v = pixelSpaceVector(node[4], node[5], node[6]);
            var text = new THREE.Mesh( getTagGeometry(tagString), textMaterial );
            text.position.x = v.x;
            text.position.y = v.y;
            text.position.z = v.z;
            text.visible = true;
            self.textlabels[nodeID] = text;
            scene.add( text );
          });
        }
      }

      var createLabelSphere = function(nodeID, color) {
        var node = self.nodeProps[nodeID];
        var v = pixelSpaceVector(node[4], node[5], node[6]);
        var mesh = new THREE.Mesh( labelspheregeometry, color );
        mesh.position.set( v.x, v.y, v.z );
        mesh.node_id = nodeID;
        mesh.skeleton_id = self.id;
        mesh.orig_coord = {x: node[4], y: node[5], z: node[6]};
        self.labelSphere[nodeID] = mesh;
        scene.add( mesh );
      };

      // Place spheres on nodes with special labels:
      for (var tag in self.tags) {
        if (self.tags.hasOwnProperty(tag)) {
          var tagLC = tag.toLowerCase();
          if (-1 !== tagLC.indexOf('todo')) {
            self.tags[tag].forEach(function(nodeID) {
              if (!self.labelSphere[nodeID]) {
                createLabelSphere(nodeID, labelColors.todo);
              }
            });
          } else if (-1 !== tagLC.indexOf('uncertain')) {
            self.tags[tag].forEach(function(nodeID) {
              if (!self.labelSphere[nodeID]) {
                createLabelSphere(nodeID, labelColors.uncertain);
              }
            });
          }
        }
      }
    };

    var removeTextMeshes = function() {
      for (var k in self.textlabels) {
        if (self.textlabels.hasOwnProperty(k))
          var tagString = self.textlabels[k];
          scene.remove(self.textlabels[k]);
          releaseTagGeometry(tagString);
          delete self.textlabels[k];
      }
      for (var k in self.labelSphere) {
        if (self.labelSphere.hasOwnProperty(k) ) {
          scene.remove(self.labelSphere[k]);
          delete self.labelSphere[k];
        }
      }
    };

    this.setTextVisibility = function( vis ) {
      // Create text meshes if not there, or destroy them if to be hidden
      if (vis && 0 === Object.keys(self.textlabels).length) {
        createTextMeshes();
      } else if (!vis) {
        removeTextMeshes();
      }
    };

    this.translate = function( dx, dy, dz )
    {
      for ( var i=0; i<connectivity_types.length; ++i ) {
        if( dx ) {
          this.actor[connectivity_types[i]].translateX( dx );
        }
        if( dy ) {
          this.actor[connectivity_types[i]].translateY( dy );
        }
        if( dz ) {
          this.actor[connectivity_types[i]].translateZ( dz );
        }
      }
    };

    this.updateSkeletonColor = function() {
      if (NeuronStagingArea.skeletonsColorMethod === 'creator' || NeuronStagingArea.skeletonsColorMethod === 'reviewer' || shading_method !== 'none') {
        // The skeleton colors need to be set per-vertex.
        self.line_material['neurite'].vertexColors = THREE.VertexColors;
        self.line_material['neurite'].needsUpdate = true;
        self.geometry['neurite'].colors = [];
        var edgeWeights = {};
        if (shading_method === 'betweenness_centrality') {
          // Darken the skeleton based on the betweenness calculation.
          edgeWeights = self.betweenness;
        } else if (shading_method === 'branch_centrality') {
          // TODO: Darken the skeleton based on the branch calculation.
          edgeWeights = self.branchCentrality;
        }
        self.vertexIDs['neurite'].forEach(function(vertexID) {
          var vertex = self.nodeProps[vertexID];
          
          // Determine the base color of the vertex.
          var baseColor = self.actorColor;
          if (NeuronStagingArea.skeletonsColorMethod === 'creator') {
            baseColor = User(vertex[2]).color; // vertex[2] is user_id
          } else if (NeuronStagingArea.skeletonsColorMethod === 'reviewer') {
            baseColor = User(vertex[3]).color; // vertex[3] is reviewer_id
          }
          
          // Darken the color by the average weight of the vertex's edges.
          var weight = 0;
          var neighbors = self.graph.neighbors(vertexID);
          neighbors.forEach(function(neighbor) {
            var edge = [vertexID, neighbor].sort();
            weight += (edge in edgeWeights ? edgeWeights[edge] : 1.0);
          });
          weight = (weight / neighbors.length) * 0.75 + 0.25;
          var color = new THREE.Color().setRGB(baseColor.r * weight, baseColor.g * weight, baseColor.b * weight);
          self.geometry['neurite'].colors.push(color);
          
          if (vertexID in self.radiusSpheres) {
            self.radiusSpheres[vertexID].material.color = baseColor;
            self.radiusSpheres[vertexID].material.needsUpdate = true;
          }
        });
        self.geometry['neurite'].colorsNeedUpdate = true;
        
        self.actor['neurite'].material.color = new THREE.Color(0xffffff);
        self.actor['neurite'].material.needsUpdate = true;
      } else {
        // Display the entire skeleton with a single color.
        self.line_material['neurite'].vertexColors = THREE.NoColors;
        self.line_material['neurite'].needsUpdate = true;
        
        self.actor['neurite'].material.color = self.actorColor;
        self.actor['neurite'].material.needsUpdate = true;
      
        for ( var k in self.radiusSpheres ) {
          self.radiusSpheres[k].material.color = self.actorColor;
          self.radiusSpheres[k].material.needsUpdate = true;
        }
      }
    };

    this.changeColor = function( color ) {
      self.actorColor = color;
      
      if (NeuronStagingArea.skeletonsColorMethod === 'random' || NeuronStagingArea.skeletonsColorMethod === 'manual') {
        self.updateSkeletonColor();
      }
    };

    this.addCompositeActorToScene = function()
    {
      for ( var i=0; i<connectivity_types.length; ++i ) {
        scene.add( this.actor[connectivity_types[i]] );
      }
    };

    /** Three possible types of actors: 'neurite', 'presynaptic_to', and 'postsynaptic_to', each consisting, respectibly, of the edges of the skeleton, the edges of the presynaptic sites and the edges of the postsynaptic sites. */
    this.visibilityCompositeActor = function( type, visible )
    {
      this.actor[type].visible = visible;
    };

    this.getActorColorAsHTMLHex = function () {
      return this.actorColor.getHexString();
    };

    this.getActorColorAsHex = function()
    {
      return this.actorColor.getHex();
    };

    this.remove_connector_selection = function()
    {
      if (self.connectoractor) {
        for (var i=0; i<2; ++i) {
          if (self.connectoractor[synapticTypes[i]]) {
            scene.remove(self.connectoractor[synapticTypes[i]]);
            delete self.connectoractor[synapticTypes[i]];
          }
        }
        self.connectoractor = null;
      }
    };

    this.create_connector_selection = function( common_connector_IDs )
    {
      self.connectoractor = new Object();
      self.connectorgeometry = new Object();
      self.connectorgeometry[connectivity_types[1]] = new THREE.Geometry();
      self.connectorgeometry[connectivity_types[2]] = new THREE.Geometry();

      for (var connectorID in self.connectorProps) {
        if (self.connectorProps.hasOwnProperty(connectorID) && common_connector_IDs.hasOwnProperty(connectorID)) {
          var con = self.connectorProps[connectorID];
          var node = self.nodeProps[con[0]]; // 0 is the treenode ID
          var v1 = pixelSpaceVector(node[4], node[5], node[6]); // x, y, z
          var v2 = pixelSpaceVector(con[3], con[4], con[5]); // x, y, z
          // con[2] is 0 for presynaptic_to and 1 for postsynaptic_to
          var vertices = self.connectorgeometry[synapticTypes[con[2]]].vertices;
          vertices.push( v1 );
          vertices.push( v2 );
        }
      }

      for (var i=0; i<2; ++i) {
        var type = synapticTypes[i];
        self.connectoractor[type] = new THREE.Line( this.connectorgeometry[type], this.line_material[type], THREE.LinePieces );
        scene.add( this.connectoractor[type] );
      }
    };

    /* Transfer from world coordinates (in nanometers) to pixel coordinates,
       reversing two axes and scaling as appropriate, and return a vector.
       In other words, transform coordinates from CATMAID coordinate system
       to WebGL coordinate system: x->x, y->y+dy, z->-z */
    var pixelSpaceVector = function(x, y, z) {
      return new THREE.Vector3(x * scale,
                               (-y + dimension.y * resolution.y) * scale,
                               -z * scale);
    };

    // 0 is pre, 1 is post
    var synapticTypes = ['presynaptic_to', 'postsynaptic_to'];
    var synapticColors = [new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.6, transparent:false  } ),
                          new THREE.MeshBasicMaterial( { color: 0x00f6ff, opacity:0.6, transparent:false  } )];


    this.reinit_actor = function ( skeleton_data )
    {
      if (self.actor) {
        self.removeActorFromScene();
        self.destroy_data();
      }
      self.initialize_objects();

      //var textlabel_visibility = $('#skeletontext-' + self.id).is(':checked');
      var colorkey;
      
      // Populate the graph for calculating the centrality-based shading
      this.graph = jsnx.Graph();
      this.betweenness = {};
      this.branchCentrality = {};

      var nodes = skeleton_data[1];
      var tags = skeleton_data[2];
      var connectors = skeleton_data[3];

      // Map of node ID vs node properties
      var nodeProps = nodes.reduce(function(ob, node) {
        ob[node[0]] = node;
        return ob;
      }, {});

      // Store for reuse in other functions
      self.nodeProps = nodeProps;
      self.connectorProps = connectors.reduce(function(ob, con) {
        ob[con[1]] = con;
        return ob;
      }, {});

      // Store for creation when requested
      self.tags = tags;


      var createEdge = function(id1, x1, y1, z1,
                                id2, x2, y2, z2,
                                type) {
        // Create edge between child (id1) and parent (id2) nodes:
        // Takes the coordinates of each node, transforms them into the space,
        // and then adds them to the parallel lists of vertices and vertexIDs
        var v1 = pixelSpaceVector(x1, y1, z1);
        self.geometry[type].vertices.push( v1 );
        self.vertexIDs[type].push(id1);

        var v2 = pixelSpaceVector(x2, y2, z2);
        self.geometry[type].vertices.push( v2 );
        self.vertexIDs[type].push(id2);

        return v1;
      };

      var createNodeSphere = function(id, x, y, z, v, radius) {
        // TODO replace with IcosahedronGeometry: less vertices
        var radiusCustomSphere = new THREE.SphereGeometry( radius, 32, 32, 1 );
        var mesh = new THREE.Mesh( radiusCustomSphere, new THREE.MeshBasicMaterial( { color: self.getActorColorAsHex(), opacity:1.0, transparent:false  } ) );
        if (!v) v = pixelSpaceVector(x, y, z);
        mesh.position.set( v.x, v.y, v.z );
        mesh.node_id = id;
        mesh.orig_coord = {x: x, y: y, z: z};
        mesh.skeleton_id = self.id;
        self.radiusSpheres[id] = mesh;
        scene.add( mesh );
      };

      // Create edges between all skeleton nodes
      // and a sphere on the node if radius > 0
      nodes.forEach(function(node) {
        // node[0]: treenode ID
        // node[1]: parent ID
        // node[7]: radius
        var v; // for reuse in translating the sphere if any
        // If node has a parent
        if (node[1]) {
          self.graph.add_edge(node[0], node[1]);
      
          // indices 4,5,6 are x,y,z
          var p = nodeProps[node[1]];
          v = createEdge(node[0], node[4], node[5], node[6],
                         p[0], p[4], p[5], p[6],
                         'neurite');
        }
        if (node[7] > 0) {
          createNodeSphere(node[0], node[4], node[5], node[6], v, node[7] * scale);
        }
      });

      // The itype is 0 (pre) or 1 (post), and chooses from the two arrays above
      var createSynapticSphere = function(nodeID, x, y, z, itype) {
        var v = pixelSpaceVector(x, y, z);
        var mesh = new THREE.Mesh( radiusSphere, synapticColors[itype] );
        mesh.position.set( v.x, v.y, v.z );
        mesh.node_id = nodeID;
        mesh.orig_coord = {x: x, y: y, z: z};
        mesh.skeleton_id = self.id;
        mesh.type = synapticTypes[itype];
        self.synapticSpheres[nodeID] = mesh;
        scene.add( mesh );
      };

      // Create edges between all connector nodes and their associated skeleton nodes,
      // appropriately colored as pre- or postsynaptic.
      // If not yet there, create as well the sphere for the node related to the connector
      connectors.forEach(function(con) {
        // con[0]: treenode ID
        // con[1]: connector ID
        // con[2]: 0 for pre, 1 for post
        var node = nodeProps[con[0]];
        // indices 3,4,5 are x,y,z for connector
        // indices 4,5,6 are x,y,z for node
        createEdge(con[1], con[3], con[4], con[5],
                   node[0], node[4], node[5], node[6],
                   synapticTypes[con[2]]);
        if (!self.synapticSpheres.hasOwnProperty(node[0])) {
          // con[2] is 0 for presynaptic and 1 for postsynaptic
          createSynapticSphere(node[0], node[4], node[5], node[6], con[2]);
        }
      });


      self.addCompositeActorToScene();

      self.setActorVisibility( self.skeletonmodel.selected ); // the skeleton, radius spheres and label spheres

      if (connector_filter) {
        self.setPreVisibility( false ); // the presynaptic edges and spheres
        self.setPostVisibility( false ); // the postsynaptic edges and spheres
      } else {
        self.setPreVisibility( self.skeletonmodel.pre_visible ); // the presynaptic edges and spheres
        self.setPostVisibility( self.skeletonmodel.post_visible ); // the postsynaptic edges and spheres
      }

      self.setTextVisibility( self.skeletonmodel.text_visible ); // the text labels
      
      self.actorColor = self.skeletonmodel.color;

      self.shaderWorkers();
    };

    /** Populate datastructures for skeleton shading methods, and trigger a render
     * when done and if appropriate. Does none of that and updates skeleton color
     * when the shading method is none, or the graph data structures are already
     * populated. */
    this.shaderWorkers = function() {
      // Update color and return if calculations were already done or are not requested
      if ('none' === shading_method || Object.keys(self.betweenness).length > 0) {
        self.updateSkeletonColor();
        WebGLApp.render();
        return;
      }

      if (typeof(Worker) !== "undefined")
      {
        // Put up some kind of indicator that calculations are underway.
        $.blockUI({message: '<h2><img src="' + STATIC_URL_JS + 'widgets/busy.gif" /> Computing... just a moment...</h2>'});
      
        // Calculate the betweenness centrality of the graph in another thread.
        // (This will run once the simplified graph has been created by w3 below.)
        var w1 = new Worker(STATIC_URL_JS + "graph_worker.js");
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
          if (shading_method === 'betweenness_centrality') {
            $.unblockUI();
            self.updateSkeletonColor();
            WebGLApp.render();
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
          if (shading_method === 'branch_centrality') {
            $.unblockUI();
            self.updateSkeletonColor();
            WebGLApp.render();
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
      }
      else
      {
        $('#growl-alert').growlAlert({
          autoShow: true,
          content: "Cannot calculate graph centrality, your browser does not support Web Workers...",
          title: 'Warning',
          position: 'top-right',
          delayTime: 2000,
          onComplete: function() {  }
        });
      }
    };
  };





  // array of skeletons
  var skeletons = new Object();

  // all assemblies
  var assemblies = {};

  // active node geometry
  var active_node;

  this.fullscreenWebGL = function()
  {
    var divID = 'view_in_3d_webgl_widget'; //'viewer-3d-webgl-canvas';
    if( THREEx.FullScreen.activated() ){
        var w = canvasWidth, h = canvasHeight;
        self.resizeView( w, h );
        THREEx.FullScreen.cancel();
    } else {
        THREEx.FullScreen.request(document.getElementById('viewer-3d-webgl-canvas'));
        var w = window.innerWidth, h = window.innerHeight;
        self.resizeView( w, h );
    }
    self.render();
  }

  self.resizeView = function (w, h) {
    canvasWidth = w;
    canvasHeight = h;
    if( self.divID === undefined ) {
      return;
    }
    if( renderer === undefined || renderer === null ) {
      init_webgl();
    }

    if( renderer && !THREEx.FullScreen.activated() ) {
      $('#view_in_3d_webgl_widget').css('overflowY', 'hidden');
      if( isNaN(h) && isNaN(w) ) {
        canvasHeight = 800;
        canvasWidth = 600;
      }
      // use 4:3
      if( isNaN(h) ) {
        canvasHeight = canvasWidth / 4 * 3;
      } else if( isNaN(w) ) {
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
      
      camera.setSize(canvasWidth, canvasHeight);
      camera.toPerspective(); // invokes update of camera matrices
      renderer.setSize( canvasWidth, canvasHeight );

      self.render();
    }
  }

  self.look_at_active_node = function()
  {
    if( active_node ) {
      // always fetch the update node coordinates first
      self.updateActiveNodePosition();
      controls.target = new THREE.Vector3(active_node.position.x,
        active_node.position.y,
        active_node.position.z);
      self.render();      
    }
  }

  self.createActiveNode = function()
  {
    var sphere = new THREE.SphereGeometry( 160 * scale, 32, 32, 1 );
    active_node = new THREE.Mesh( sphere, new THREE.MeshBasicMaterial( { color: 0x00ff00, opacity:0.8, transparent:true } ) );
    active_node.position.set( 0,0,0 );
    scene.add( active_node );
  }

  this.hideActiveNode = function() {
    if(active_node)
      active_node.visible = false;
  }

  this.showActiveNode = function() {
    if(active_node)
      active_node.visible = true;
  }

  this.updateActiveNodePosition = function()
  {
    if(!active_node)
      return;
    var atn_pos = SkeletonAnnotations.getActiveNodePosition();
    if( show_active_node & (atn_pos !== null) ) {
        self.showActiveNode();
        var co = transform_coordinates( [
          translation.x + ((atn_pos.x) / project.focusedStack.scale) * resolution.x,
          translation.y + ((atn_pos.y) / project.focusedStack.scale) * resolution.y,
          translation.z + atn_pos.z * resolution.z]
        );
        active_node.position.set( co[0]*scale, co[1]*scale, co[2]*scale );
        self.render();
    }
  }

  this.saveImage = function() {
      self.render();
      window.open(renderer.domElement.toDataURL("image/png"));
  }

  this.addAssembly = function( assembly_data, high_res )
  {
    if( assemblies.hasOwnProperty( assembly_data.id ) ) {
      self.removeAssembly( assembly_data.id );
    }
    assemblies[ assembly_data.id ] = new Assembly( assembly_data, high_res );
    return assemblies[ assembly_data.id ];
  }

  this.has_skeleton = function( skeleton_id ) {
    return skeletons.hasOwnProperty(skeleton_id);
  }

  this.removeAllSkeletons = function() {
    for( var skeleton_id in skeletons)
    {
      if( skeletons.hasOwnProperty(skeleton_id) ) {
        self.removeSkeleton( skeleton_id );
      }
    }
    if( renderer !== null )
      self.render();
  }

  this.getColorOfSkeleton = function( skeleton_id ) {
    if( skeleton_id in skeletons) {
      return skeletons[skeleton_id].getActorColorAsHTMLHex();
    } else {
      return '#FF0000';
    }
  };

  // add skeleton to scene
  this.addSkeletonFromData = function( skeleton_id, skeleton_data )
  {
    if( skeletons.hasOwnProperty(skeleton_id) ){
      // skeleton already in the list, just reinitialize
      skeletons[skeleton_id].reinit_actor( skeleton_data );
    } else {
      skeletons[skeleton_id] = new Skeleton();
      skeletons[skeleton_id].init( skeleton_id, skeleton_data );
    }
    self.render();
  };

  this.changeSkeletonColor = function( skeleton_id, color )
  {
    if( !skeletons.hasOwnProperty(skeleton_id) ){
        console.log("Skeleton "+skeleton_id+" does not exist.");
        return;
    } else {
        if (color === undefined) {
            skeletons[skeleton_id].updateSkeletonColor();
        } else {
            skeletons[skeleton_id].changeColor( color );
        }
        self.render();
        return true;
    }
  };

  this.removeAssembly = function( assembly_id ) {

    if( !assemblies.hasOwnProperty(assembly_id) ){
        $('#growl-alert').growlAlert({
          autoShow: true,
          content: "Assembly "+skeleton_id+" does not exist. Cannot remove it!",
          title: 'Warning',
          position: 'top-right',
          delayTime: 2000,
          onComplete: function() {  }
        });
        return;
    } else {
        $('#assemblyrow-' + assembly_id).remove();
        assemblies[ assembly_id ].remove_from_scene();
        delete assemblies[ assembly_id ];
        self.render();
        return true;
    }
  }

  // remove skeleton from scence
  this.removeSkeleton = function( skeleton_id )
  {
    if( !skeletons.hasOwnProperty(skeleton_id) ){
        $('#growl-alert').growlAlert({
          autoShow: true,
          content: "Skeleton "+skeleton_id+" does not exist. Cannot remove it!",
          title: 'Warning',
          position: 'top-right',
          delayTime: 2000,
          onComplete: function() {  }
        });
        return;
    } else {
        skeletons[skeleton_id].removeActorFromScene();
        skeletons[skeleton_id].destroy_data();
        delete skeletons[skeleton_id];
        if (connector_filter) {
          refreshRestrictedConnectors();
        } else {
          self.render();
        }
        return true;
    }
  }

  self.toggleBackground = function()
  {
      if( show_background ) {
          renderer.setClearColorHex( 0xffffff, 1 );
          show_background = false;
      } else {
          renderer.setClearColorHex( 0x000000, 1 );
          show_background = true;
      }
      self.render();
  }

  self.toggleFloor = function()
  {
      if( show_floor ) {
          floormesh.visible = false;
          show_floor = false;
      } else {
          floormesh.visible = true;
          show_floor = true;
      }
      self.render();
  }

  self.toggleBB = function()
  {
      if( show_boundingbox ) {
          // disable floor
          bbmesh.visible = false;
          debugax.visible = false;
          show_boundingbox = false;
      } else {
          // enable floor
          bbmesh.visible = true;
          debugax.visible = true;
          show_boundingbox = true;
      }
      self.render();
  }

  function create_stackboundingbox(x, y, z, dx, dy, dz)
  {
    //console.log('bouding box', x, y, z, dx, dy, dz);
    var gg = new THREE.CubeGeometry( dx, dy, dz );
    var mm = new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: true } );
    bbmesh = new THREE.Mesh( gg, mm );
    bbmesh.position.set(x, y, z);
    scene.add( bbmesh );
  }

  function addMesh( geometry, scale, x, y, z, rx, ry, rz, material ) {
    var mesh = new THREE.Mesh( geometry, material );
    mesh.scale.set( scale, scale, scale );
    mesh.position.set( x, y, z );
    mesh.rotation.set( rx, ry, rz );
    meshes.push( mesh );
    scene.add( mesh );
  }

  function createScene( geometry, start ) {
    //addMesh( geometry, scale, 0, 0, 0,  0,0,0, new THREE.MeshPhongMaterial( { ambient: 0x030303, color: 0x030303, specular: 0x990000, shininess: 30 } ) );
    addMesh( geometry, scale, 0, 0, 0,  0,0,0, new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.2, wireframe:true } ) ); // , transparent:true
  }

  function drawmesh() {
    var loader = new THREE.JSONLoader( true );
    var s = Date.now(),
        callback = function( geometry ) { createScene( geometry, s ) };
    jQuery.ajax({
        url: django_url + project.id + "/stack/" + self.stack_id + "/models",
        type: "GET",
        dataType: "json",
        success: function (models) {
          // loop over objects
          for( var obj in models) {
            if( models.hasOwnProperty( obj )) {
              var vert = models[obj].vertices;
              var vert2 = [];
              for ( var i = 0; i < vert.length; i+=3 ) {
                var fv = transform_coordinates([vert[i],vert[i+1],vert[i+2]]);
                vert2.push( fv[0] );
                vert2.push( fv[1] );
                vert2.push( fv[2] );
              }
              models[obj].vertices = vert2;
              var parsed = loader.parse( models[obj] );
              createScene( parsed['geometry'] )

            }
          }
        }
      });
  }

  self.toggleMeshes = function() {
    if( show_meshes ) {
      for(var i=0; i<meshes.length; i++) {
        scene.remove( meshes[i] );
      }
      meshes = [];
      show_meshes = false;
    } else {
      // add them
      drawmesh();
      show_meshes = true;
    }
    self.render();
  }

  self.removeMissingSections = function() {
    for(var i = 0; i < missing_sections.length; i++) {
      scene.remove( missing_sections[i] );
    }
    missing_sections = [];
  }

  self.createMissingSections = function() {

    var geometry = new THREE.Geometry();
    var xwidth = dimension.x*resolution.x*scale,
        ywidth = dimension.y*resolution.y*scale * missing_section_height / 100.;
    geometry.vertices.push( new THREE.Vector3( 0,0,0 ) );
    geometry.vertices.push( new THREE.Vector3( xwidth,0,0 ) );
    geometry.vertices.push( new THREE.Vector3( 0,ywidth,0 ) );
    geometry.vertices.push( new THREE.Vector3( xwidth,ywidth,0 ) );
    geometry.faces.push( new THREE.Face4( 0, 1, 3, 2 ) );

    var material = new THREE.MeshBasicMaterial( { color: 0x151349, opacity:0.6, transparent: true, side: THREE.DoubleSide } );
    var material2 = new THREE.MeshBasicMaterial( { color: 0x00ffff, wireframe: true, wireframeLinewidth: 5, side: THREE.DoubleSide } );
    
    var newval, msect;
    for(var i = 0; i < project.focusedStack.broken_slices.length; i++) {
      newval = (-project.focusedStack.broken_slices[ i ] * resolution.z - translation.z) * scale;
      msect = new THREE.Mesh( geometry, material );
      msect.position.z = newval;
      missing_sections.push( msect );
      scene.add( msect );  
      msect = new THREE.Mesh( geometry, material2 );
      msect.position.z = newval;
      scene.add( msect );  
      missing_sections.push( msect );    
    }
    self.render();
  }

  self.toggleMissingSections = function() {
    if( show_missing_sections ) {
      self.removeMissingSections();
      show_missing_sections = false;
    } else {
      self.createMissingSections();
      show_missing_sections = true;
    }
    self.render();
  }

  self.toggleActiveNode = function() {
    if( show_active_node ) {
      self.hideActiveNode();
      show_active_node = false;
    } else {
      self.showActiveNode();
      show_active_node = true;
    }
    self.render();
  }

  self.configure_parameters = function() {
    var dialog = document.createElement('div');
    dialog.setAttribute("id", "dialog-confirm");
    dialog.setAttribute("title", "Configuration");

    var msg = document.createElement('p');
    msg.innerHTML = "Missing sections height [0,100]:";
    dialog.appendChild(msg);

    var missingsectionheight = document.createElement('input');
    missingsectionheight.setAttribute("type", "text");
    missingsectionheight.setAttribute("id", "missing-section-height");
    missingsectionheight.setAttribute("value", missing_section_height);
    dialog.appendChild(missingsectionheight);

    var msg = document.createElement('p');
    msg.innerHTML = "Soma sphere scale factor:";
    dialog.appendChild(msg);

    var somascale = document.createElement('input');
    somascale.setAttribute("type", "text");
    somascale.setAttribute("id", "soma-scale");
    somascale.setAttribute("value", soma_scale);
    dialog.appendChild( somascale );
    dialog.appendChild( document.createElement("br"));

    /*var rand = document.createElement('input');
    rand.setAttribute("type", "button");
    rand.setAttribute("id", "save_image");
    rand.setAttribute("value", "Screenshot");
    rand.onclick = WebGLApp.saveImage;
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));*/

    var rand = document.createElement('input');
    rand.setAttribute("type", "checkbox");
    rand.setAttribute("id", "enable_z_plane");
    rand.setAttribute("value", "Enable z-plane");
    if( show_zplane )
      rand.setAttribute("checked", "true");
    rand.onclick = WebGLApp.toggleZplane;
    dialog.appendChild(rand);
    var rand = document.createTextNode('Enable z-plane');
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));

    var rand = document.createElement('input');
    rand.setAttribute("type", "checkbox");
    rand.setAttribute("id", "show_meshes");
    rand.setAttribute("value", "Show meshes");
    if( show_meshes )
      rand.setAttribute("checked", "true");
    rand.onclick = WebGLApp.toggleMeshes;
    dialog.appendChild(rand);
    var rand = document.createTextNode('Show meshes');
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));

    var rand = document.createElement('input');
    rand.setAttribute("type", "checkbox");
    rand.setAttribute("id", "enable_active_node");
    rand.setAttribute("value", "Enable active node");
    if( show_active_node )
      rand.setAttribute("checked", "true");
    rand.onclick = WebGLApp.toggleActiveNode;
    dialog.appendChild(rand);
    var rand = document.createTextNode('Enable active node');
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));

    var rand = document.createElement('input');
    rand.setAttribute("type", "checkbox");
    rand.setAttribute("id", "enable_missing_sections");
    rand.setAttribute("value", "Missing sections");
    if( show_missing_sections )
      rand.setAttribute("checked", "true");
    rand.onclick = WebGLApp.toggleMissingSections;
    dialog.appendChild(rand);
    var rand = document.createTextNode('Missing sections');
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));

    /*var rand = document.createElement('input');
    rand.setAttribute("type", "checkbox");
    rand.setAttribute("id", "toggle_ortho");
    rand.setAttribute("value", "Toggle Ortho");
    rand.onclick = WebGLApp.toggleOrthographic;
    container.appendChild(rand);
    var rand = document.createTextNode('Toggle Ortho');
    container.appendChild(rand);*/

    var rand = document.createElement('input');
    rand.setAttribute("type", "checkbox");
    rand.setAttribute("id", "toggle_floor");
    rand.setAttribute("value", "Toggle Floor");
    if( show_floor )
      rand.setAttribute("checked", "true");
    rand.onclick = WebGLApp.toggleFloor;
    dialog.appendChild(rand);
    var rand = document.createTextNode('Toggle floor');
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));

    var rand = document.createElement('input');
    rand.setAttribute("type", "checkbox");
    rand.setAttribute("id", "toggle_aabb");
    rand.setAttribute("value", "Toggle Bounding Box");
    if( show_boundingbox )
      rand.setAttribute("checked", "true");
    rand.onclick = WebGLApp.toggleBB;
    dialog.appendChild(rand);
    var rand = document.createTextNode('Toggle Bounding Box');
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));

    var rand = document.createElement('input');
    rand.setAttribute("type", "checkbox");
    rand.setAttribute("id", "toggle_bgcolor");
    rand.setAttribute("value", "Toggle Background Color");
    if( show_background )
      rand.setAttribute("checked", "true");
    rand.onclick = WebGLApp.toggleBackground;
    dialog.appendChild(rand);
    var rand = document.createTextNode('Toggle Background Color');
    dialog.appendChild(rand);
    dialog.appendChild( document.createElement("br"));

    $(dialog).dialog({
      height: 440,
      modal: true,
      buttons: {
        "Cancel": function() {
          $(this).dialog("close");
        },
        "OK": function() {
          $(this).dialog("close");
        }
      },
      close: function(event, ui) {

          missing_section_height = $('#missing-section-height').val();
          soma_scale = $('#soma-scale').val();
          if( show_missing_sections ) {
            self.removeMissingSections();
            self.createMissingSections();            
          }
          $('#dialog-confirm').remove();
      }
    });
  }

  self.toggleZplane = function() {
    if( show_zplane ) {
      scene.remove( zplane );
      zplane = null;
      show_zplane = false;
    } else {
      // create
      var geometry = new THREE.Geometry();
      var xwidth = dimension.x*resolution.x*scale,
          ywidth = dimension.y*resolution.y*scale;

      geometry.vertices.push( new THREE.Vector3( 0,0,0 ) );
      geometry.vertices.push( new THREE.Vector3( xwidth,0,0 ) );
      geometry.vertices.push( new THREE.Vector3( 0,ywidth,0 ) );
      geometry.vertices.push( new THREE.Vector3( xwidth,ywidth,0 ) );
      geometry.faces.push( new THREE.Face4( 0, 1, 3, 2 ) );

      var material = new THREE.MeshBasicMaterial( { color: 0x151349, side: THREE.DoubleSide } );
      zplane = new THREE.Mesh( geometry, material );
      scene.add( zplane );
      show_zplane = true;
      self.updateZPlane();
    }
    self.render();

  }

  self.updateZPlane = function() {
    if( !show_zplane )
      return;
    var newval = (-project.focusedStack.z * resolution.z - translation.z) * scale;
    zplane.position.z = newval;
    self.render();
  }

  function debugaxes() {
    debugax = new THREE.AxisHelper();
    debugax.position.set( -1, -1, 0 );
    debugax.scale.x = debugax.scale.y = debugax.scale.z = 0.1;
    scene.add( debugax );
  }

  function draw_grid() {
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
    floormesh = new THREE.Line( geometry, line_material, THREE.LinePieces );
    scene.add( floormesh );
  }

  function onMouseDown(event) {
    is_mouse_down = true;
    if( event.shiftKey ) {
      var vector = new THREE.Vector3( mouse.x, mouse.y, 0.5 );
      projector.unprojectVector( vector, camera );

      var raycaster = new THREE.Raycaster( camera.position, vector.sub( camera.position ).normalize() );    
      var intersects = raycaster.intersectObjects( contour_objects, true );
      if ( intersects.length > 0 ) {
        // console.log('found intersecting slices', intersects);
        controls.enabled = false;
        SegmentationAnnotations.goto_slice( intersects[0].object.parent.node_id, true );
        container.style.cursor = 'move';
      }

      // intersect connectors
      var sphere_objects = [];
      for( var skeleton_id in skeletons) {
        if( skeletons.hasOwnProperty( skeleton_id )) {
          if( !skeletons[skeleton_id].visible )
            continue;
          for(var idx in skeletons[ skeleton_id ].labelSphere) {
            if( skeletons[ skeleton_id ].labelSphere.hasOwnProperty( idx )) {
              sphere_objects.push( skeletons[ skeleton_id ].labelSphere[ idx ] )
            }
          }

          for(var idx in skeletons[ skeleton_id ].synapticSpheres) {
            if( skeletons[ skeleton_id ].synapticSpheres.hasOwnProperty( idx )) {
              sphere_objects.push( skeletons[ skeleton_id ].synapticSpheres[ idx ] )
            }
          }

          var intersects = raycaster.intersectObjects( sphere_objects, true );
          // console.log('intersects sphere objects', intersects)
          if ( intersects.length > 0 ) {
            for( var i = 0; i < sphere_objects.length; i++) {
              if( sphere_objects[i].id === intersects[0].object.id ) {
                  var jso = sphere_objects[i];
                  project.moveTo(jso.orig_coord.z, jso.orig_coord.y, jso.orig_coord.x, undefined, function() { 
                    SkeletonAnnotations.staticSelectNode(parseInt(jso.node_id, 10), parseInt(jso.skeleton_id, 10)) });
              }
            }
          }


        } // has own skeleton
      }  // end for

    } // end shift key
  }

  function onMouseUp(event) {
    is_mouse_down = false;
    controls.enabled = true;
    self.render(); // May need another render on occasions
  }

  /** To execute every time the mouse is moved. */
  function onMouseMove(event) {
    //var mouseX = ( event.clientX - self.divWidth );
    //var mouseY = ( event.clientY - self.divHeight );
    // mouse.x = ( event.clientX / self.divWidth );
    //mouse.y = -( event.clientY / self.divHeight );

    mouse.x = ( event.offsetX / canvasWidth )*2-1;
    mouse.y = -( event.offsetY / canvasHeight )*2+1;
    //mouse.x = ( event.clientX - self.divWidth );
    //mouse.y = ( event.clientY - self.divHeight );

    //console.log(mouse.x, mouse.y, event.clientX);

    if (is_mouse_down) {
      self.render();
    }

    container.style.cursor = 'pointer';

  }

  /** To execute every time the mouse wheel turns. */
  function onMouseWheel(event) {
    self.render();
  }

  self.render = function render() {
    controls.update();
    if (renderer) {
      renderer.clear();
      renderer.render( scene, camera );
    }
  };

  self.addAssemblyToTable = function ( assembly ) {
    var rowElement = $('<tr/>').attr({
      id: 'assemblyrow-' + assembly.id
    });
    // $('#webgl-assembly-table > tbody:last').append( rowElement );
    $('#webgl-skeleton-table > tbody:last').append( rowElement );
    
    var td = $(document.createElement("td"));
    /*td.append( $(document.createElement("img")).attr({
      id:    'assemblyaction-activate-' + assembly.id,
      value: 'Nearest node'
    })
      .click( function( event )
      {
        console.log('TODO: active assembly');
      })
      .attr('src',STATIC_URL_JS+'widgets/themes/kde/activate.gif')
    );*/
    td.append( $(document.createElement("img")).attr({
          id:    'assemblyaction-remove-' + assembly.id,
          value: 'Remove'
          })
          .click( function( event )
          {
            self.removeAssembly( assembly.id );
          })
          .attr('src', STATIC_URL_JS + 'widgets/themes/kde/delete.png')
          .text('Remove!')
    );
    rowElement.append( td );

    rowElement.append(
      $(document.createElement("td")).text( assembly.baseName + ' (AssemblyID: ' + assembly.id + ')' )
    );

    // show assembly
    rowElement.append(
      $(document.createElement("td")).append(
        $(document.createElement("input")).attr({
                  id:    'idshow-' + assembly.id,
                  name:  assembly.baseName,
                  value: assembly.id,
                  type:  'checkbox',
                  checked: true
          })
          .click( function( event )
          {
            // TODO: toggle show              
            self.render();
          } )
    ));

    // show pre
    rowElement.append(
      $(document.createElement("td")).append(
        $(document.createElement("input")).attr({
                  id:    'assemblypre-' + assembly.id,
                  name:  assembly.baseName,
                  value: assembly.id,
                  type:  'checkbox',
                  checked:true
          })
          .click( function( event )
          {
            
            self.render();
          } )
    ));

    // show post
    rowElement.append(
      $(document.createElement("td")).append(
        $(document.createElement("input")).attr({
                  id:    'assemblypost-' + assembly.id,
                  name:  assembly.baseName,
                  value: assembly.id,
                  type:  'checkbox',
                  checked:true
          })
          .click( function( event )
          {
            
            self.render();
          } )
    ));

    rowElement.append(
      $(document.createElement("td")).append(
        $(document.createElement("input")).attr({
                  id:    'assemblytext-' + assembly.id,
                  name:  assembly.baseName,
                  value: assembly.id,
                  type:  'checkbox',
                  checked:false
          })
          .click( function( event )
          {
            
            self.render();
          } )
    ));

    var td = $(document.createElement("td"));
    rowElement.append( td );

  }

  self.is_widget_open = function() {
    if( $('#view_in_3d_webgl_widget').length ) 
      return true;
    else
      return false;
  }

  self.setSkeletonPreVisibility = function( skeleton_id, value ) {
    if( skeletons.hasOwnProperty(skeleton_id) ) {
      skeletons[skeleton_id].setPreVisibility( value );
      self.render();
    }
  }

  self.setSkeletonPostVisibility = function( skeleton_id, value ) {
    if( skeletons.hasOwnProperty(skeleton_id) ) {
      skeletons[skeleton_id].setPostVisibility( value );
      self.render();
    }
  }

  self.setSkeletonTextVisibility = function( skeleton_id, value ) {
    if( skeletons.hasOwnProperty(skeleton_id) ) {
      skeletons[skeleton_id].setTextVisibility( value );
      self.render();
    }
  };

  self.setSkeletonVisibility = function( skeleton_id, vis ) {
    if (!skeletons.hasOwnProperty(skeleton_id)) return;
    skeletons[skeleton_id].setActorVisibility( vis );
    if (connector_filter) {
      refreshRestrictedConnectors();
    } else {
      self.render();
    }
    return connector_filter;
  };

  self.addActiveObjectToStagingArea = function() {
    // add either a skeleton or an assembly based on the tool selected
    if( project.getTool().toolname === 'segmentationtool' ) {
      self.addActiveAssemblyToView();
    } else if( project.getTool().toolname === 'tracingtool' ) {
      self.addActiveSkeletonToView();
    }
  }

  self.addActiveAssemblyToView = function() {
    requestQueue.register(django_url + project.id + '/assembly/' + SegmentationAnnotations.current_active_assembly + '/neuronname', "POST", {}, function (status, text, xml) {
      var e;
      if (status === 200) {
        if (text && text !== " ") {
          e = $.parseJSON(text);
          if (e.error) {
            alert(e.error);
            return;
          }
          var assembly_data = SegmentationAnnotations.get_assemblydata_to_visualize();
          assembly_data['baseName'] = e['neuronname'];
          var assembly = self.addAssembly( assembly_data, false ); // TODO: how to active highres?
          self.addAssemblyToTable( assembly );
      }}});
  }


  self.addSkeletonFromID = function (skeletonID, refresh_restricted_connectors) {
    if (!skeletonID) return;
    var skeleton_id = parseInt(skeletonID);
    submit(django_url + project.id + '/skeleton/' + skeleton_id + '/compact-json',
          {},
          function(json) {
            self.addSkeletonFromData(skeleton_id, json);
            if (refresh_restricted_connectors) {
              refreshRestrictedConnectors();
            }
          });
  };

  self.getListOfSkeletonIDs = function(only_visible) {
    var keys = [];
    for( var skeleton_id in skeletons)
    {
        if( skeletons.hasOwnProperty(skeleton_id) ) {
          if(only_visible) {
            if(skeletons[skeleton_id].visible)
              keys.push( parseInt(skeleton_id) );
          } else {
            keys.push( parseInt(skeleton_id) );
          }
        }
    }
    return keys;
  };

  self.add_active_and_refresh_skeletons = function() {
      NeuronStagingArea.add_active_object_to_stage( WebGLApp.refresh_skeletons );
  }

  // use the staging skeleton list to refresh all neurons
  self.refresh_skeletons = function() {
    // self.removeAllSkeletons(); // TODO: is this slower than use reinit actor and remove only the rest?
    var skeletons_to_remove = {};
    for(var skeleton_id in skeletons) {
      if( skeletons.hasOwnProperty( skeleton_id )) {
        skeletons_to_remove[ skeleton_id ] = true;
      }
    }
    var stageSkeletons = NeuronStagingArea.get_selected_skeletons();
    for(var i = 0; i < stageSkeletons.length; i++) {
      var skeleton_id = parseInt( stageSkeletons[ i ] );
      skeletons_to_remove[ skeleton_id ] = false;
    }
    for(var skeleton_id in skeletons_to_remove) {
      if( skeletons_to_remove.hasOwnProperty( skeleton_id )) {
        if( skeletons_to_remove[ skeleton_id ] ) {
          self.removeSkeleton( skeleton_id );
        } else {
          self.addSkeletonFromID( skeleton_id );
        }
      }
    }

    // When all finish loading, then update restricted connectors
    if (connector_filter) {
      submit(null, null, refreshRestrictedConnectors);
    }
  };

  self.toggleConnector = function() {
    if( connector_filter ) {
      connector_filter = false;
    } else {
      connector_filter = true;
    }
    for( var skeleton_id in skeletons)
    {
      if( skeletons.hasOwnProperty(skeleton_id) ) {
        skeletons[skeleton_id].setPreVisibility( !connector_filter );
        skeletons[skeleton_id].setPostVisibility( !connector_filter );
        $('#skeletonpre-' + skeleton_id).attr('checked', !connector_filter );
        $('#skeletonpost-' + skeleton_id).attr('checked', !connector_filter );
      }
    }

    if (connector_filter) {
      refreshRestrictedConnectors();
    } else {
      // Restore all connectors
      for (var skeleton_id in skeletons) {
        if (skeletons.hasOwnProperty(skeleton_id)) {
          skeletons[skeleton_id].remove_connector_selection();
        }
      }
      self.render();
    }
  };

  var refreshRestrictedConnectors = function() {
    if (!connector_filter) return;
    // Find all connector IDs referred to by more than one skeleton
    // but only for visible skeletons
    var counts = {};
    var visible_skeletons = [];
    var invisible_skeletons = [];
    for (var skeleton_id in skeletons) {
      if (skeletons.hasOwnProperty(skeleton_id)) {
        if ($('#skeletonshow-' + skeleton_id).is(':checked')) {
          visible_skeletons.push(skeleton_id);
          var sk = skeletons[skeleton_id];
          for (var connectorID in sk.connectorProps) {
            if (sk.connectorProps.hasOwnProperty(connectorID)) {
              if (counts.hasOwnProperty(connectorID)) {
                counts[connectorID][skeleton_id] = null;
              } else {
                counts[connectorID] = {};
                counts[connectorID][skeleton_id] = null;
              }
            }
          }
        } else {
          invisible_skeletons.push(skeleton_id);
        }
      }
    }
    var common = {};
    for (var connectorID in counts) {
      if (Object.keys(counts[connectorID]).length > 1) {
        common[connectorID] = null; // null, just to add something
      }
    }
    visible_skeletons.forEach(function(skeleton_id) {
      skeletons[skeleton_id].remove_connector_selection();
      skeletons[skeleton_id].create_connector_selection( common );
    });
    invisible_skeletons.forEach(function(skeleton_id) {
      skeletons[skeleton_id].remove_connector_selection();
    });
    self.render();
  };
  
  self.set_shading_method = function() {
    // Set the shading of all skeletons based on the state of the "Shading" pop-up menu.
    shading_method = $('#skeletons_shading :selected').attr("value");
    
    for (var skeleton_id in skeletons) {
      if (skeletons.hasOwnProperty(skeleton_id)) {
        skeletons[skeleton_id].shaderWorkers();
      }
    }
  };
}; })();
