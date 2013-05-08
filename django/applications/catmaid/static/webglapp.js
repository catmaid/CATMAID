var camera;
var WebGLApp = new function () {

  self = this;
  self.neurons = [];

  var scene, renderer, scale, controls, zplane = null, meshes = [];
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

  this.init = function( divID ) {

    self.project_id = project.id;
    self.stack_id = project.focusedStack.id;

    self.divID = divID;
    self.divID_jQuery = '#' + divID;

    // self.divWidth = $(this.divID_jQuery).width();
    // self.divHeight = $(this.divID_jQuery).height();

    resolution = project.focusedStack.resolution;
    dimension = project.focusedStack.dimension;
    translation = project.focusedStack.translation;

    $('#webgl-show').click(function() {
      for( var skeleton_id in skeletons)
      {
        if( skeletons.hasOwnProperty(skeleton_id) ) {
          skeletons[ skeleton_id ].setCompleteActorVisibility( togglevisibleall );
          $('#skeletonshow-' + skeleton_id).attr('checked', togglevisibleall );
          $('#skeletonpre-' + skeleton_id).attr('checked', togglevisibleall );
          $('#skeletonpost-' + skeleton_id).attr('checked', togglevisibleall );
          if( togglevisibleall === false )
            $('#skeletontext-' + skeleton_id).attr('checked', togglevisibleall );
        }
      }
      togglevisibleall = !togglevisibleall;
      if( togglevisibleall )
        $('#webgl-show').text('show');
      else
        $('#webgl-show').text('hide');
      self.render();
    })
    
    // self.render();
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
      delete active_node;
      active_node = null;
    }

    if( floormesh !== null) {
      scene.remove( floormesh );
      delete floormesh;
      floormesh = null;
    }

    if( zplane !== null) {
      scene.remove( zplane );
      delete zplane;
      zplane = null;
    }

    if( floormesh !== null) {
      scene.remove( floormesh );
      delete floormesh;
      floormesh = null;
    }

    if( bbmesh !== null) {
      scene.remove( bbmesh );
      delete bbmesh;
      bbmesh = null;
    }

    if( debugax !== null) {
      scene.remove( debugax );
      delete debugax;
      debugax = null;
    }

    // TODO: remove meshes
    // TODO: remove missing sections

  }

  /* transform coordinates from CATMAID coordinate system
     to WebGL coordinate system: x->x, y->y+dy, z->-z
    */
  var transform_coordinates = function ( point ) {
    return [point[0],-point[1]+dimension.y*resolution.y,-point[2] ];
  }

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
    ambienteLight = new THREE.AmbientLight( 0x505050 )
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

    // // if there is an active skeleton, add it to the view if staging area is empty
    if(SkeletonAnnotations.getActiveNodeId() && NeuronStagingArea.get_selected_skeletons().length === 0) {
      NeuronStagingArea.add_active_object_to_stage( WebGLApp.refresh_skeletons );
    }


  }

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

  // credit: http://stackoverflow.com/questions/638948/background-color-hex-to-javascript-variable-jquery
  function rgb2hex(rgb) {
   rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
   function hex(x) {
    return ("0" + parseInt(x).toString(16)).slice(-2);
   }
   return "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
  }

  function rgb2hex2(rgb) {
    rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    function hex(x) {
      return ("0" + parseInt(x).toString(16)).slice(-2);
    }
    return "0x" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
  }

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
        render();
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

  var Skeleton = function( skeleton_data )
  {
    var self = this;
    var type, from_vector, to_vector;

    self.id = skeleton_data.id;
    self.baseName = skeleton_data.baseName;
    
    this.destroy_data = function() {

      for ( var i=0; i<connectivity_types.length; ++i ) {
        if( this.actor.hasOwnProperty(connectivity_types[i]) ) {
          delete this.actor[connectivity_types[i]];
          this.actor[connectivity_types[i]] = null;
        }

        if( this.geometry.hasOwnProperty(connectivity_types[i]) ) {
          delete this.geometry[connectivity_types[i]];
          this.geometry[connectivity_types[i]] = null;
        }

        if( this.connectorgeometry.hasOwnProperty(connectivity_types[i]) ) {
          delete this.connectorgeometry[connectivity_types[i]];
          this.connectorgeometry[connectivity_types[i]] = null;
        }        

      }

      for ( var i=0; i<connectivity_types.length; ++i ) {
        if( connectivity_types[i] === 'presynaptic_to' || connectivity_types[i] === 'postsynaptic_to') {
          if( this.connectoractor && this.connectoractor[connectivity_types[i]] ) {
            delete this.connectoractor[connectivity_types[i]];
            this.connectoractor[connectivity_types[i]] = null;
          }
        }
      }
      // for ( var i=0; i<connectivity_types.length; ++i ) {
      //   if( this.actor.hasOwnProperty(connectivity_types[i]) )
      //     scene.remove( this.actor[connectivity_types[i]] );
      // }
      for ( var k in this.labelSphere ) {
        if( this.labelSphere.hasOwnProperty( k ) )
          delete this.labelSphere[k];
          this.labelSphere[k] = null;
      }
      for ( var k in this.otherSpheres ) {
        if( this.otherSpheres.hasOwnProperty( k ) )
          delete this.otherSpheres[k];
          this.otherSpheres[k] = null;
      }
      for ( var k in this.radiusSpheres ) {
        if( this.radiusSpheres.hasOwnProperty( k ) )
          delete this.radiusSpheres[k];
          this.radiusSpheres[k] = null;
      }
      for ( var k in this.textlabels ) {
        if( self.textlabels.hasOwnProperty( k ))
          delete this.textlabels[k];
          this.textlabels[k] = null;
      }

      delete this.original_vertices;
      this.original_vertices = null;
      delete this.original_connectivity;
      this.original_connectivity = null;

      self.initialize_objects();

    }

    this.removeActorFromScene = function()
    {
      for ( var i=0; i<connectivity_types.length; ++i ) {
        if( this.actor.hasOwnProperty(connectivity_types[i]) )
          scene.remove( this.actor[connectivity_types[i]] );
      }
      this.remove_connector_selection();
      // for ( var i=0; i<connectivity_types.length; ++i ) {
      //   if( this.actor.hasOwnProperty(connectivity_types[i]) )
      //     scene.remove( this.actor[connectivity_types[i]] );
      // }
      for ( var k in this.labelSphere ) {
        if( this.labelSphere.hasOwnProperty( k ) )
          scene.remove( this.labelSphere[k] );
      }
      for ( var k in this.otherSpheres ) {
        if( this.otherSpheres.hasOwnProperty( k ) )
          scene.remove( this.otherSpheres[k] );
      }
      for ( var k in this.radiusSpheres ) {
        if( this.radiusSpheres.hasOwnProperty( k ) )
          scene.remove( this.radiusSpheres[k] );
      }
      for ( var k in this.textlabels ) {
        if( self.textlabels.hasOwnProperty( k ))
          scene.remove( this.textlabels[k] );
      }
    }

    this.remove_connector_selection = function()
    {
      for ( var i=0; i<connectivity_types.length; ++i ) {
        if( connectivity_types[i] === 'presynaptic_to' || connectivity_types[i] === 'postsynaptic_to') {
          if( this.connectoractor && this.connectoractor[connectivity_types[i]] ) {
            scene.remove( this.connectoractor[connectivity_types[i]] );
          }
        }
      }
    }

    this.initialize_objects = function()
    {
      this.skeletonmodel = NeuronStagingArea.get_skeletonmodel( self.id );
      this.line_material = new Object();
      this.actorColor = [255, 255, 0]; // color from staging area?
      this.visible = true;
      if( this.skeletonmodel === undefined ) {
        console.log('Can not initialize skeleton object');
        return;
      }
      if( this.skeletonmodel.usercolor_visible || this.skeletonmodel.userreviewcolor_visible )
        this.line_material[connectivity_types[0]] = new THREE.LineBasicMaterial( { color: 0xffff00, opacity: 1.0, linewidth: 3, vertexColors: THREE.VertexColors } );
      else
        this.line_material[connectivity_types[0]] = new THREE.LineBasicMaterial( { color: 0xffff00, opacity: 1.0, linewidth: 3 } );
      this.line_material[connectivity_types[1]] = new THREE.LineBasicMaterial( { color: 0xff0000, opacity: 1.0, linewidth: 6 } );
      this.line_material[connectivity_types[2]] = new THREE.LineBasicMaterial( { color: 0x00f6ff, opacity: 1.0, linewidth: 6 } );

      this.original_vertices = null;
      this.original_connectivity = null;
      this.geometry = new Object();
      this.actor = new Object();
      this.geometry[connectivity_types[0]] = new THREE.Geometry();
      this.geometry[connectivity_types[1]] = new THREE.Geometry();
      this.geometry[connectivity_types[2]] = new THREE.Geometry();
      this.vertexcolors = [];

      for ( var i=0; i<connectivity_types.length; ++i ) {
        this.actor[connectivity_types[i]] = new THREE.Line( this.geometry[connectivity_types[i]],
          this.line_material[connectivity_types[i]], THREE.LinePieces );
      }
      this.labelSphere = new Object();
      this.otherSpheres = new Object();
      this.radiusSpheres = new Object();
      this.textlabels = new Object();

      this.connectoractor = new Object();
      this.connectorgeometry = new Object();
    }

    self.initialize_objects();

    this.setCompleteActorVisibility = function( vis ) {
      self.visible = vis;
      self.setActorVisibility( vis );
      self.setPreVisibility( vis );
      self.setPostVisibility( vis );
      if( vis ===  false)
        self.setTextVisibility( vis );
    };

    this.setActorVisibility = function( vis ) {
      self.visible = vis;
      self.visiblityCompositeActor( 0, vis );
      // also show and hide spheres
      for( var idx in self.otherSpheres ) {
        if( self.otherSpheres.hasOwnProperty( idx )) {
          self.otherSpheres[ idx ].visible = vis;
        }
      }
      for( var idx in self.radiusSpheres ) {
        if( self.radiusSpheres.hasOwnProperty( idx )) {
          self.radiusSpheres[ idx ].visible = vis;
        }
      }
      for( var idx in self.labelSphere ) {
        if( self.textlabels.hasOwnProperty( idx )) {
          self.labelSphere[ idx ].visible = vis;
        }
      }
      
    };

    this.setPreVisibility = function( vis ) {
      self.visiblityCompositeActor( 1, vis );
      for( var idx in self.otherSpheres ) {
        if( self.otherSpheres.hasOwnProperty( idx )) {
          if( self.otherSpheres[ idx ].type == 'presynaptic_to')
            self.otherSpheres[ idx ].visible = vis;
        }
      }
    };

    this.setPostVisibility = function( vis ) {
      self.visiblityCompositeActor( 2, vis );
      for( var idx in self.otherSpheres ) {
        if( self.otherSpheres.hasOwnProperty( idx )) {
          if( self.otherSpheres[ idx ].type == 'postsynaptic_to')
            self.otherSpheres[ idx ].visible = vis;
        }
      }

    };

    this.setTextVisibility = function( vis ) {
      for( var idx in self.textlabels ) {
        if( self.textlabels.hasOwnProperty( idx )) {
          self.textlabels[ idx ].visible = vis;
        }
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
    }

    this.updateSkeletonColor = function() {
      this.actor[connectivity_types[0]].material.color.setRGB( this.actorColor[0]/255., this.actorColor[1]/255., this.actorColor[2]/255. );
      for ( var k in this.radiusSpheres ) {
        this.radiusSpheres[k].material.color.setRGB( this.actorColor[0]/255., this.actorColor[1]/255., this.actorColor[2]/255. );
      }
    }

    this.changeColor = function( value ) {
      // changing color if one of the options is activated should have no effect
      // this prevents the bug (?) which changes the transparency of the lines
      // when changing the skeleton colors
      if(this.skeletonmodel.usercolor_visible || this.skeletonmodel.userreviewcolor_visible )
        return;

      self.actorColor = value;
      self.updateSkeletonColor();
    }

    this.addCompositeActorToScene = function()
    {
      for ( var i=0; i<connectivity_types.length; ++i ) {
        scene.add( this.actor[connectivity_types[i]] );
      }
    }

    this.visiblityCompositeActor = function( type_index, visible )
    {
      this.actor[connectivity_types[type_index]].visible = visible;
    }

    this.getActorColorAsHTMLHex = function () {
      return rgb2hex( 'rgb('+this.actorColor[0]+','+
        this.actorColor[1]+','+
        this.actorColor[2]+')' );
    }

    this.getActorColorAsHex = function()
    {
      return parseInt( rgb2hex2( 'rgb('+this.actorColor[0]+','+
        this.actorColor[1]+','+
        this.actorColor[2]+')' ), 16);
    };

    this.create_connector_selection = function( connector_data )
    {
      this.connectoractor = new Object();
      this.connectorgeometry = new Object();
      this.connectorgeometry[connectivity_types[0]] = new THREE.Geometry();
      this.connectorgeometry[connectivity_types[1]] = new THREE.Geometry();
      this.connectorgeometry[connectivity_types[2]] = new THREE.Geometry();

      for (var fromkey in this.original_connectivity) {
        var to = this.original_connectivity[fromkey];
        for (var tokey in to) {

          // check if fromkey or tokey point to the correct connector type, otherwise skip
          if( this.original_vertices[fromkey]['type'] !== 'connector' &&
            this.original_vertices[tokey]['type'] !== 'connector') {
            continue;
          }

          // check if connector is in selection list
          if( !(parseInt(fromkey) in connector_data) && !(parseInt(tokey) in connector_data) ) {
            continue;
          }

          type = connectivity_types[connectivity_types.indexOf(this.original_connectivity[fromkey][tokey]['type'])];

          var fv=transform_coordinates([
            this.original_vertices[fromkey]['x'],
            this.original_vertices[fromkey]['y'],
            this.original_vertices[fromkey]['z']
          ]);
          var from_vector = new THREE.Vector3(fv[0], fv[1], fv[2] );

          // transform
          from_vector.multiplyScalar( scale );

          this.connectorgeometry[type].vertices.push( from_vector );

          var tv=transform_coordinates([
            this.original_vertices[tokey]['x'],
            this.original_vertices[tokey]['y'],
            this.original_vertices[tokey]['z']
          ]);
          var to_vector = new THREE.Vector3(tv[0], tv[1], tv[2] );

          // transform
          // to_vector.add( translate_x, translate_y, translate_z );
          to_vector.multiplyScalar( scale );

          this.connectorgeometry[type].vertices.push( to_vector );

        }
      }

    for ( var i=0; i<connectivity_types.length; ++i ) {
      if( connectivity_types[i] === 'presynaptic_to' || connectivity_types[i] === 'postsynaptic_to') {
        this.connectoractor[connectivity_types[i]] = new THREE.Line( this.connectorgeometry[connectivity_types[i]], this.line_material[connectivity_types[i]], THREE.LinePieces );
        scene.add( this.connectoractor[connectivity_types[i]] );
      }
    }

    }

    this.reinit_actor = function ( skeleton_data )
    {

      self.removeActorFromScene();
      self.destroy_data();
      self.initialize_objects();

      this.original_vertices = skeleton_data.vertices;
      this.original_connectivity = skeleton_data.connectivity;
      var textlabel_visibility = $('#skeletontext-' + self.id).is(':checked');
      var colorkey;

      for (var fromkey in this.original_connectivity) {
        var to = this.original_connectivity[fromkey];
        for (var tokey in to) {

          type = connectivity_types[connectivity_types.indexOf(this.original_connectivity[fromkey][tokey]['type'])];
          var fv=transform_coordinates([
                   this.original_vertices[fromkey]['x'],
                   this.original_vertices[fromkey]['y'],
                   this.original_vertices[fromkey]['z']
              ]);
          var from_vector = new THREE.Vector3(fv[0], fv[1], fv[2] );

          // transform
          from_vector.multiplyScalar( scale );

          this.geometry[type].vertices.push( from_vector );

          var tv=transform_coordinates([
                   this.original_vertices[tokey]['x'],
                   this.original_vertices[tokey]['y'],
                   this.original_vertices[tokey]['z']
              ]);
          var to_vector = new THREE.Vector3(tv[0], tv[1], tv[2] );

          // transform
          // to_vector.add( translate_x, translate_y, translate_z );
          to_vector.multiplyScalar( scale );

          this.geometry[type].vertices.push( to_vector );

          if( !(fromkey in this.otherSpheres) && type === 'presynaptic_to') {
            this.otherSpheres[fromkey] = new THREE.Mesh( radiusSphere, new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.6, transparent:false  } ) );
            this.otherSpheres[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
            this.otherSpheres[fromkey].node_id = fromkey;
            this.otherSpheres[fromkey].orig_coord = this.original_vertices[fromkey];
            this.otherSpheres[fromkey].skeleton_id = self.id;
            this.otherSpheres[fromkey].type = type;
            scene.add( this.otherSpheres[fromkey] );
          }
          if( !(fromkey in this.otherSpheres) && type === 'postsynaptic_to') {
            this.otherSpheres[fromkey] = new THREE.Mesh( radiusSphere, new THREE.MeshBasicMaterial( { color: 0x00f6ff, opacity:0.6, transparent:false  } ) );
            this.otherSpheres[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
            this.otherSpheres[fromkey].node_id = fromkey;
            this.otherSpheres[fromkey].orig_coord = this.original_vertices[fromkey];
            this.otherSpheres[fromkey].skeleton_id = self.id;
            this.otherSpheres[fromkey].type = type;
            scene.add( this.otherSpheres[fromkey] );
          }

          if( (this.skeletonmodel.usercolor_visible || this.skeletonmodel.userreviewcolor_visible ) && type ==='neurite' ) {

            if( this.skeletonmodel.usercolor_visible )
              colorkey = 'user_id_color';
            else
              colorkey = 'reviewuser_id_color';

            var newcolor = new THREE.Color( 0x00ffff );
            // newcolor.setHSL( 0.6, 1.0, Math.max( 0, ( 200 - from_vector.x ) / 400 ) * 0.5 + 0.5 );
            newcolor.setRGB( this.original_vertices[fromkey][colorkey][0],
              this.original_vertices[fromkey][colorkey][1],
              this.original_vertices[fromkey][colorkey][2] );
            this.vertexcolors.push( newcolor );
            var newcolor = new THREE.Color( 0x00ffff );
            newcolor.setRGB( this.original_vertices[tokey][colorkey][0],
              this.original_vertices[tokey][colorkey][1],
              this.original_vertices[tokey][colorkey][2] );
            this.vertexcolors.push( newcolor );

          }

          // check if either from or to key vertex has a sphere associated with it
          var radiusFrom = parseFloat( this.original_vertices[fromkey]['radius'] );
          if( !(fromkey in this.radiusSpheres) && radiusFrom > 0 ) {
            radiusCustomSphere = new THREE.SphereGeometry( scale * radiusFrom, 32, 32, 1 );
            this.radiusSpheres[fromkey] = new THREE.Mesh( radiusCustomSphere, new THREE.MeshBasicMaterial( { color: this.getActorColorAsHex(), opacity:1.0, transparent:false  } ) );
            this.radiusSpheres[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
            this.radiusSpheres[fromkey].node_id = fromkey;
            this.radiusSpheres[fromkey].orig_coord = this.original_vertices[fromkey];
            this.radiusSpheres[fromkey].skeleton_id = self.id;
            scene.add( this.radiusSpheres[fromkey] );
          }

          var radiusTo = parseFloat( this.original_vertices[tokey]['radius'] );
          if( !(tokey in this.radiusSpheres) && radiusTo > 0 ) {
            radiusCustomSphere = new THREE.SphereGeometry( scale * radiusTo, 32, 32, 1 );
            this.radiusSpheres[tokey] = new THREE.Mesh( radiusCustomSphere, new THREE.MeshBasicMaterial( { color: this.getActorColorAsHex(), opacity:1.0, transparent:false  } ) );
            this.radiusSpheres[tokey].position.set( to_vector.x, to_vector.y, to_vector.z );
            this.radiusSpheres[tokey].orig_coord = this.original_vertices[fromkey];
            this.radiusSpheres[tokey].skeleton_id = self.id;
            scene.add( this.radiusSpheres[tokey] );
          }

          // text labels
          if( this.original_vertices[fromkey]['labels'].length > 0) {

            var theText = this.original_vertices[fromkey]['labels'].join();
            var text3d = new THREE.TextGeometry( theText, {
              size: 100 * scale,
              height: 20 * scale,
              curveSegments: 1,
              font: "helvetiker"
            });
            text3d.computeBoundingBox();
            var centerOffset = -0.5 * ( text3d.boundingBox.max.x - text3d.boundingBox.min.x );

            var textMaterial = new THREE.MeshNormalMaterial( { color: 0xffffff, overdraw: true } );
            text = new THREE.Mesh( text3d, textMaterial );
            text.position.x = from_vector.x;
            text.position.y = from_vector.y;
            text.position.z = from_vector.z;
            text.visible = textlabel_visibility;

            if( !this.textlabels.hasOwnProperty( fromkey )) {
              this.textlabels[ fromkey ] = text;
              scene.add( text );
            }
            
          }

          // if either from or to have a relevant label, and they are not yet
          // created, create one
          if( ($.inArray( "uncertain", this.original_vertices[fromkey]['labels'] ) !== -1) && (this.labelSphere[fromkey]=== undefined) ) {
              this.labelSphere[fromkey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xff8000, opacity:0.6, transparent:true  } ) );
              this.labelSphere[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
              this.labelSphere[fromkey].node_id = fromkey;
              this.labelSphere[fromkey].skeleton_id = self.id;
              this.labelSphere[fromkey].orig_coord = this.original_vertices[fromkey];
              scene.add( this.labelSphere[fromkey] );
          }
          if( ($.inArray( "uncertain", this.original_vertices[tokey]['labels'] ) !== -1) && (this.labelSphere[tokey]=== undefined) ) {
              this.labelSphere[tokey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xff8000, opacity:0.6, transparent:true  } ) );
              this.labelSphere[tokey].position.set( to_vector.x, to_vector.y, to_vector.z );
              this.labelSphere[tokey].node_id = fromkey;
              this.labelSphere[tokey].skeleton_id = self.id;
              this.labelSphere[tokey].orig_coord = this.original_vertices[fromkey];
              scene.add( this.labelSphere[tokey] );
          }
          if( ($.inArray( "todo", this.original_vertices[fromkey]['labels'] ) !== -1) && (this.labelSphere[fromkey]=== undefined) ) {
              this.labelSphere[fromkey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.6, transparent:true  } ) );
              this.labelSphere[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
              this.labelSphere[fromkey].node_id = fromkey;
              this.labelSphere[fromkey].skeleton_id = self.id;
              this.labelSphere[fromkey].orig_coord = this.original_vertices[fromkey];
              scene.add( this.labelSphere[fromkey] );
          }
          if( ($.inArray( "todo", this.original_vertices[tokey]['labels'] ) !== -1) && (this.labelSphere[tokey]=== undefined) ) {
              this.labelSphere[tokey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.6, transparent:true  } ) );
              this.labelSphere[tokey].position.set( to_vector.x, to_vector.y, to_vector.z );
              this.labelSphere[tokey].node_id = fromkey;
              this.labelSphere[tokey].skeleton_id = self.id;
              this.labelSphere[tokey].orig_coord = this.original_vertices[fromkey];
              this.labelSphere[tokey].skeleton_id = self.id;
              scene.add( this.labelSphere[tokey] );
          }
          if( ( ($.inArray( "soma", this.original_vertices[fromkey]['labels'] ) !== -1) ||
            ($.inArray( "cell body", this.original_vertices[fromkey]['labels'] ) !== -1 ) ) && (this.radiusSpheres[fromkey]=== undefined) ) {
              this.radiusSpheres[fromkey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xffff00 } ) );
              this.radiusSpheres[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
              this.radiusSpheres[fromkey].scale.set( soma_scale, soma_scale, soma_scale );
              this.radiusSpheres[fromkey].node_id = fromkey;
              this.radiusSpheres[fromkey].orig_coord = this.original_vertices[fromkey];
              this.radiusSpheres[fromkey].skeleton_id = self.id;
              scene.add( this.radiusSpheres[fromkey] );
          }
          if( ( ($.inArray( "soma", this.original_vertices[tokey]['labels'] ) !== -1) ||
              ($.inArray( "cell body", this.original_vertices[tokey]['labels'] ) !== -1) ) && (this.radiusSpheres[tokey]=== undefined) ) {
              this.radiusSpheres[tokey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xffff00  } ) );
              this.radiusSpheres[tokey].position.set( to_vector.x, to_vector.y, to_vector.z );
              this.radiusSpheres[tokey].scale.set( soma_scale, soma_scale, soma_scale );
              this.radiusSpheres[tokey].node_id = fromkey;
              this.radiusSpheres[tokey].orig_coord = this.original_vertices[fromkey];
              this.radiusSpheres[tokey].skeleton_id = self.id;
              scene.add( this.radiusSpheres[tokey] );
          }

        }
      }

      this.addCompositeActorToScene();

      self.setActorVisibility( this.skeletonmodel.selected );
      self.setPreVisibility( this.skeletonmodel.pre_visible );
      self.setPostVisibility( this.skeletonmodel.post_visible );
      self.setTextVisibility( this.skeletonmodel.text_visible );

      if( this.skeletonmodel.usercolor_visible || this.skeletonmodel.userreviewcolor_visible )
        this.geometry['neurite'].colors = this.vertexcolors;

      self.actorColor = this.skeletonmodel.colorrgb;
      this.updateSkeletonColor();

    }

    self.reinit_actor( skeleton_data );

  }

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
    sphere = new THREE.SphereGeometry( 160 * scale, 32, 32, 1 );
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
  }

  // add skeleton to scene
  this.addSkeletonFromData = function( skeleton_id, skeleton_data )
  {
    if( skeletons.hasOwnProperty(skeleton_id) ){
      // skeleton already in the list, just reinitialize
      skeletons[skeleton_id].reinit_actor( skeleton_data );
    } else {
      skeleton_data['id'] = skeleton_id;
      skeletons[skeleton_id] = new Skeleton( skeleton_data );
    }
    self.render();
    return skeletons[skeleton_id];
  }

  this.changeSkeletonColor = function( skeleton_id, value )
  {
    if( !skeletons.hasOwnProperty(skeleton_id) ){
        console.log("Skeleton "+skeleton_id+" does not exist.");
        return;
    } else {
        skeletons[skeleton_id].changeColor( value );
        self.render();
        return true;
    }
  }

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
        if( renderer !== null )
          self.render();
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
        url: django_url+self.project_id+"/stack/"+self.stack_id+"/models",
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
    rand.onclick = WebGLApp.toggle_zplane;
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

  self.toggle_zplane = function() {
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
      floor = 0, step = 25;
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

          for(var idx in skeletons[ skeleton_id ].otherSpheres) {
            if( skeletons[ skeleton_id ].otherSpheres.hasOwnProperty( idx )) {
              sphere_objects.push( skeletons[ skeleton_id ].otherSpheres[ idx ] )
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

  var render = function render() {
    controls.update();
    renderer.clear();
    renderer.render( scene, camera );
  }
  self.render = render;

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
    }
    self.render();
  }

  self.setSkeletonPostVisibility = function( skeleton_id, value ) {
    if( skeletons.hasOwnProperty(skeleton_id) ) {
      skeletons[skeleton_id].setPostVisibility( value );
    }
    self.render();
  }

  self.setSkeletonTextVisibility = function( skeleton_id, value ) {
    if( skeletons.hasOwnProperty(skeleton_id) ) {
      skeletons[skeleton_id].setTextVisibility( value );
    }
    self.render();
  }

  self.setSkeletonAllVisibility = function( skeleton_id, value ) {
    if( skeletons.hasOwnProperty(skeleton_id) ) {
      skeletons[skeleton_id].setActorVisibility( value );
    }
    self.render();
  }

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

  self.addSkeletonFromID = function (skeletonID) {
    if( skeletonID !== undefined )
    {
      var skeleton_id = parseInt( skeletonID );
      jQuery.ajax({
        url: django_url + project.id + '/skeleton/' + skeleton_id + '/json',
        type: "GET",
        dataType: "json",
        success: function (skeleton_data) {
          skeleton_data['baseName'] = skeleton_data['neuron']['neuronname'];
          var skeleton = self.addSkeletonFromData( skeleton_id, skeleton_data );
        }
      });
    }
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
    var stageskeletons = NeuronStagingArea.get_selected_skeletons();
    for(var i = 0; i < stageskeletons.length; i++) {
      var skeleton_id = parseInt( stageskeletons[ i ] );
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
  }

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
    // call magic
    jQuery.ajax({
      url: django_url + project.id + '/skeletongroup/all_shared_connectors',
      data: { skeletonlist: self.getListOfSkeletonIDs(true) },
      type: "POST",
      dataType: "json",
      success: function ( data ) {
        for( var skeleton_id in skeletons)
        {
          if( skeletons.hasOwnProperty(skeleton_id) ) {
            if( connector_filter ) {
              skeletons[skeleton_id].create_connector_selection( data );
            } else {
              skeletons[skeleton_id].remove_connector_selection();
            }

          }
        }
        self.render();
      }
    });
  }
}
