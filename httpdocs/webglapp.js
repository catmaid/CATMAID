
var WebGLApp = new function () {

  self = this;
  self.neurons = [];

  var camera, scene, renderer, grid_lines, scale, controls, light, zplane = null, meshes = [], show_meshes = false, show_active_node = false;
  var project_id, stack_id, resolution, dimension, translation, canvasWidth, canvasHeight;

  this.init = function( divID ) {

    self.project_id = project.id;
    self.stack_id = project.focusedStack.id;

    self.divID = divID;
    self.divID_jQuery = '#' + divID;

    self.divWidth = $(this.divID_jQuery).width();
    self.divHeight = $(this.divID_jQuery).height();

    resolution = project.focusedStack.resolution;
    dimension = project.focusedStack.dimension;
    translation = project.focusedStack.translation;

    init_webgl();
    animate();
    debugaxes();
    draw_grid();
    XYView();

    // if active skeleton exists, add it to the view
    var ID = SkeletonAnnotations.getActiveNodeId();
    if(ID) {
      self.addSkeletonFromID( self.project_id, SkeletonAnnotations.getActiveSkeletonId() );

      // and create active node
      $('#enable_active_node').attr('checked', true);
      self.createActiveNode();
    }


  }

  var randomColors = [];
  randomColors[0] = [255, 255, 0]; // yellow
  randomColors[1] = [255, 0, 255]; // magenta
  // randomColors[2] = [0, 255, 255]; // cyan
  randomColors[2] = [255, 255, 255]; // white
  randomColors[3] = [255, 128, 0]; // orange

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
    camera = new THREE.PerspectiveCamera( 75, self.divWidth / self.divHeight, 1, 3000 );
    // camera = new THREE.OrthographicCamera( self.divWidth / -2, self.divWidth / 2, self.divHeight / 2, self.divHeight / -2, 1, 1000 );
    controls = new THREE.TrackballControls( camera, container );
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;


    var ambient = new THREE.AmbientLight( 0x101010 );
    scene.add( ambient );

    directionalLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
    directionalLight.position.set( 1, 1, 2 ).normalize();
    scene.add( directionalLight );

    pointLight = new THREE.PointLight( 0xffaa00 );
    pointLight.position.set( 0, 0, 0 );
    scene.add( pointLight );
/*
    // light representation

    sphere = new THREE.SphereGeometry( 100, 16, 8, 1 );
    lightMesh = new THREE.Mesh( sphere, new THREE.MeshBasicMaterial( { color: 0xffaa00 } ) );
    lightMesh.scale.set( 0.05, 0.05, 0.05 );
    lightMesh.position = pointLight.position;
    scene.add( lightMesh );
*/

    renderer = new THREE.WebGLRenderer({ antialias: true });
    //renderer = new THREE.CanvasRenderer();
    renderer.setSize( self.divWidth, self.divHeight );

    // Follow size
    // THREEx.WindowResize.bind(renderer, camera);

    container.appendChild( renderer.domElement )

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

    controls.target = new THREE.Vector3(coord[0]*scale,coord[1]*scale,coord[2]*scale);

  }

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
    camera.position.z = (dim.z/2)+100+pos.z;
    camera.up.set(0, 1, 0);
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

  var Skeleton = function( skeleton_data )
  {
    var self = this;
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

    this.changeColor = function( value )
    {
      this.actor[connectivity_types[0]].material.color.setRGB( value[0]/255., value[1]/255., value[2]/255. );
      this.actorColor = value;
      $('#skeletonaction-changecolor-' + self.id).css("background-color", rgb2hex( 'rgb('+value[0]+','+value[1]+','+value[2]+')' ) );
    }

    this.updateCompositeActor = function()
    {
      for ( var i=0; i<connectivity_types.length; ++i ) {
        this.actor[connectivity_types[i]] = new THREE.Line( this.geometry[connectivity_types[i]],
            this.line_material[connectivity_types[i]], THREE.LinePieces );
      }
    }

    this.removeActorFromScene = function()
    {
      for ( var i=0; i<connectivity_types.length; ++i ) {
        scene.removeObject( this.actor[connectivity_types[i]] );
      }
      for ( var k in this.labelSphere ) {
          scene.removeObject( this.labelSphere[k] );
      }
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

    var type, from_vector, to_vector;

    this.line_material = new Object();
    this.geometry = new Object();
    this.actor = new Object();
    this.actorColor = [255, 255, 0];
    
    this.geometry[connectivity_types[0]] = new THREE.Geometry();
    this.geometry[connectivity_types[1]] = new THREE.Geometry();
    this.geometry[connectivity_types[2]] = new THREE.Geometry();

    this.line_material[connectivity_types[0]] = new THREE.LineBasicMaterial( { color: 0xffff00, opacity: 1.0, linewidth: 3 } );
    this.line_material[connectivity_types[1]] = new THREE.LineBasicMaterial( { color: 0xff0000, opacity: 1.0, linewidth: 6 } )
    this.line_material[connectivity_types[2]] = new THREE.LineBasicMaterial( { color: 0x00f6ff, opacity: 1.0, linewidth: 6 } )

    this.original_vertices = skeleton_data.vertices;
    this.original_connectivity = skeleton_data.connectivity;
    this.id = skeleton_data.id;
    this.baseName = skeleton_data.baseName;

    this.labelSphere = new Object();
    var labelspheregeometry = new THREE.SphereGeometry( 130 * scale, 32, 32, 1),
      somasphere = new THREE.SphereGeometry( 200 * scale, 32, 32, 1);


    for (var fromkey in this.original_connectivity) {
      var to = this.original_connectivity[fromkey];
      for (var tokey in to) {

        type = connectivity_types[connectivity_types.indexOf(this.original_connectivity[fromkey][tokey]['type'])];
        var fv=transform_coordinates([
                 this.original_vertices[fromkey]['x'],
                 this.original_vertices[fromkey]['y'],
                 this.original_vertices[fromkey]['z']
            ]);
        from_vector = new THREE.Vector3(fv[0], fv[1], fv[2] );

        // transform
        from_vector.multiplyScalar( scale );

        this.geometry[type].vertices.push( new THREE.Vertex( from_vector ) );

        var tv=transform_coordinates([
                 this.original_vertices[tokey]['x'],
                 this.original_vertices[tokey]['y'],
                 this.original_vertices[tokey]['z']
            ]);
        to_vector = new THREE.Vector3(tv[0], tv[1], tv[2] );

        // transform
        // to_vector.add( translate_x, translate_y, translate_z );
        to_vector.multiplyScalar( scale );

        this.geometry[type].vertices.push( new THREE.Vertex( to_vector ) );

        // if either from or to have a relevant label, and they are not yet
        // created, create one
        if( ($.inArray( "uncertain", this.original_vertices[fromkey]['labels'] ) !== -1) && (this.labelSphere[fromkey]=== undefined) ) {
            this.labelSphere[fromkey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xff8000, opacity:0.6, transparent:true  } ) );
            this.labelSphere[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
            scene.add( this.labelSphere[fromkey] );
        }
        if( ($.inArray( "uncertain", this.original_vertices[tokey]['labels'] ) !== -1) && (this.labelSphere[tokey]=== undefined) ) {
            this.labelSphere[tokey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xff8000, opacity:0.6, transparent:true  } ) );
            this.labelSphere[tokey].position.set( to_vector.x, to_vector.y, to_vector.z );
            scene.add( this.labelSphere[tokey] );
        }
        if( ($.inArray( "todo", this.original_vertices[fromkey]['labels'] ) !== -1) && (this.labelSphere[fromkey]=== undefined) ) {
            this.labelSphere[fromkey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.6, transparent:true  } ) );
            this.labelSphere[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
            scene.add( this.labelSphere[fromkey] );
        }
        if( ($.inArray( "todo", this.original_vertices[tokey]['labels'] ) !== -1) && (this.labelSphere[tokey]=== undefined) ) {
            this.labelSphere[tokey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.6, transparent:true  } ) );
            this.labelSphere[tokey].position.set( to_vector.x, to_vector.y, to_vector.z );
            scene.add( this.labelSphere[tokey] );
        }
        if( ($.inArray( "soma", this.original_vertices[fromkey]['labels'] ) !== -1) && (this.labelSphere[fromkey]=== undefined) ) {
            this.labelSphere[fromkey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xffff00 } ) );
            this.labelSphere[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
            this.labelSphere[fromkey].scale.set( 2, 2, 2 );
            scene.add( this.labelSphere[fromkey] );
        }
        if( ($.inArray( "soma", this.original_vertices[tokey]['labels'] ) !== -1) && (this.labelSphere[tokey]=== undefined) ) {
            this.labelSphere[tokey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0xffff00  } ) );
            this.labelSphere[tokey].position.set( to_vector.x, to_vector.y, to_vector.z );
            this.labelSphere[tokey].scale.set( 2, 2, 2 );
            scene.add( this.labelSphere[tokey] );
        }

      }
    }

    this.updateCompositeActor();

  }

  // array of skeletons
  var skeletons = new Object();

  // active node geometry
  var active_node;

  this.fullscreenWebGL = function()
  {
    var divID = 'view_in_3d_webgl_widget'; //'viewer-3d-webgl-canvas';
    if( THREEx.FullScreen.activated() ){
        var w = canvasWidth, h = canvasHeight;
        $('#viewer-3d-webgl-canvas').width(w);
        $('#viewer-3d-webgl-canvas').height(h);
        $('#viewer-3d-webgl-canvas').css("background-color", "#000000");
        renderer.setSize( w, h );
        THREEx.FullScreen.cancel();
    } else {
        THREEx.FullScreen.request(document.getElementById('viewer-3d-webgl-canvas'));
        var w = window.innerWidth, h = window.innerHeight;
        $('#viewer-3d-webgl-canvas').width(w);
        $('#viewer-3d-webgl-canvas').height(h);
        $('#viewer-3d-webgl-canvas').css("background-color", "#000000");
        renderer.setSize( w, h );
    };
  }

  self.resizeView = function (w, h) {
    if( renderer && !THREEx.FullScreen.activated() ) {
      $('#view_in_3d_webgl_widget').css('overflowY', 'hidden');
      var canvasWidth = w, canvasHeight = h;
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
      $('#viewer-3d-webgl-canvas').width(canvasWidth-20);
      $('#viewer-3d-webgl-canvas').height(canvasHeight);
      $('#viewer-3d-webgl-canvas').css("background-color", "#000000");
      renderer.setSize( canvasWidth-20, canvasHeight );

      // resize list view, needs frame height to fill it
      var heightAvailable = $('#view_in_3d_webgl_widget').height() - canvasHeight;
      if( heightAvailable < 150 ) {
          $('#view-3d-webgl-skeleton-table-div').height(150);
      } else {
          $('#view-3d-webgl-skeleton-table-div').height(heightAvailable - 30);
      }

    }
  }

  self.createActiveNode = function()
  {
    if( !SkeletonAnnotations.getActiveNodeId() ) {
      // alert("You must have an active node selected to add its skeleton to the 3D WebGL View.");
      return;
    }
    sphere = new THREE.SphereGeometry( 160 * scale, 32, 32, 1 );
    active_node = new THREE.Mesh( sphere, new THREE.MeshBasicMaterial( { color: 0x00ff00, opacity:0.8, transparent:true } ) );
    active_node.position.set( 0,0,0 );
    scene.add( active_node );
    self.updateActiveNode();
    show_active_node = true;
  }

  this.removeActiveNode = function() {
    if(active_node) {
      scene.removeObject( active_node );
      active_node = null;
    }
  }

  this.updateActiveNode = function()
  {
    if(active_node) {
      var atn_pos = SkeletonAnnotations.getActiveNodePosition();
      var co = transform_coordinates( [
        translation.x + ((atn_pos.x) / project.focusedStack.scale) * resolution.x,
        translation.y + ((atn_pos.y) / project.focusedStack.scale) * resolution.y,
        translation.z + atn_pos.z * resolution.z]
      );
      active_node.position.set( co[0]*scale, co[1]*scale, co[2]*scale );
    }
  }

  this.randomizeColors = function()
  {
    var i = 0, col;
    for( var skeleton_id in skeletons)
		{
      if( i < randomColors.length ) {
        col = randomColors[i];
      } else {
        col = [parseInt( Math.random() * 255 ),
          parseInt( Math.random() * 255 ),
          parseInt( Math.random() * 255 ) ];

      }
      i=i+1;
      skeletons[skeleton_id].changeColor( col );
    }
  }


  this.removeAllSkeletons = function() {
    for( var skeleton_id in skeletons)
    {
      if( skeletons.hasOwnProperty(skeleton_id) ) {
        self.removeSkeleton( skeleton_id );
      }
    }
  }


  // add skeleton to scene
  this.addSkeleton = function( skeleton_id, skeleton_data )
  {
    if( skeletons.hasOwnProperty(skeleton_id) ){
      self.removeSkeleton( skeleton_id );
      // remove skeleton and refetch
      /*
      skeletons[skeleton_id].removeActorFromScene();
      delete skeletons[skeleton_id];*/
    }

    skeleton_data['id'] = skeleton_id;
    skeletons[skeleton_id] = new Skeleton( skeleton_data );
    self.addSkeletonToTable( skeletons[skeleton_id] );
    return true;
  }

  this.changeSkeletonColor = function( skeleton_id, value, color )
  {
    if( !skeletons.hasOwnProperty(skeleton_id) ){
        alert("Skeleton "+skeleton_id+" does not exist. Cannot change color it!");
        return;
    } else {
        skeletons[skeleton_id].changeColor( value );
        $('#skeletonaction-changecolor-' + skeleton_id).css("background-color",color.hex);
        return true;
    }
  }

  // remove skeleton from scence
  this.removeSkeleton = function( skeleton_id )
  {
    if( !skeletons.hasOwnProperty(skeleton_id) ){
        alert("Skeleton "+skeleton_id+" does not exist. Cannot remove it!");
        return;
    } else {
        $('#skeletonrow-' + skeleton_id).remove();
        skeletons[skeleton_id].removeActorFromScene();
        delete skeletons[skeleton_id];
        return true;
    }
  }

  function create_stackboundingbox(x, y, z, dx, dy, dz)
  {
    //console.log('bouding box', x, y, z, dx, dy, dz);
    var gg = new THREE.CubeGeometry( dx, dy, dz );
    var mm = new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: true } );
    var mesh = new THREE.Mesh( gg, mm );
    mesh.position.set(x, y, z);
    scene.add( mesh );
  }

  function addMesh( geometry, scale, x, y, z, rx, ry, rz, material ) {
    var mesh = new THREE.Mesh( geometry, material );
    mesh.scale.set( scale, scale, scale );
    mesh.position.set( x, y, z );
    mesh.rotation.set( rx, ry, rz );
    mesh.doubleSided = true;
    meshes.push( mesh );
    scene.add( mesh );
	}

  function createScene( geometry, start ) {
    //addMesh( geometry, scale, 0, 0, 0,  0,0,0, new THREE.MeshPhongMaterial( { ambient: 0x030303, color: 0x030303, specular: 0x990000, shininess: 30 } ) );
    addMesh( geometry, scale, 0, 0, 0,  0,0,0, new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.2 } ) ); // , transparent:true
	}

  function drawmesh() {
    var loader = new THREE.JSONLoader( true );
    var s = Date.now(),
        callback = function( geometry ) { createScene( geometry, s ) };
    jQuery.ajax({
        url: "dj/"+self.project_id+"/stack/"+self.stack_id+"/models",
        type: "GET",
        dataType: "json",
        success: function (models) {
          // loop over objects
          for( var obj in models) {
            var vert = models[obj].vertices;
            var vert2 = [];
            for ( var i = 0; i < vert.length; i+=3 ) {
              var fv = transform_coordinates([vert[i],vert[i+1],vert[i+2]]);
              vert2.push( fv[0] );
              vert2.push( fv[1] );
              vert2.push( fv[2] );
            }
            models[obj].vertices = vert2;
            loader.createModel( models[obj], callback );
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
  }

  self.toggleActiveNode = function() {
    if( show_active_node ) {
      self.removeActiveNode();
      show_active_node = false;
    } else {
      self.createActiveNode();
      show_active_node = true;
    }
  }

  self.updateZPlane = function() {
    var zval;
    if( $('#enable_z_plane').attr('checked') != undefined ) {
      zval = project.focusedStack.z;
    } else {
      zval = -1;
    }
    // if disabled, deselect
    if( zval === -1 ) {
        scene.remove( zplane );
        zplane = null;
        return;
    }
    var newval;
    newval = (-zval * resolution.z - translation.z) * scale;
    if( zplane === null ) {
        var geometry = new THREE.Geometry();
        var xwidth = dimension.x*resolution.x*scale,
            ywidth = dimension.y*resolution.y*scale;
        geometry.vertices.push( new THREE.Vertex( new THREE.Vector3( 0,0,0 ) ) );
        geometry.vertices.push( new THREE.Vertex( new THREE.Vector3( xwidth,0,0 ) ) );
        geometry.vertices.push( new THREE.Vertex( new THREE.Vector3( 0,ywidth,0 ) ) );
        geometry.vertices.push( new THREE.Vertex( new THREE.Vector3( xwidth,ywidth,0 ) ) );
        geometry.faces.push( new THREE.Face4( 0, 1, 3, 2 ) );

        var material = new THREE.MeshBasicMaterial( { color: 0x151349 } );
        zplane = new THREE.Mesh( geometry, material );
        zplane.doubleSided = true;
        zplane.position.z = newval;
        scene.add( zplane );
        return;
    }
    zplane.position.z = newval;
    
  }

  function debugaxes() {
    var object = new THREE.AxisHelper();
    object.position.set( -1, -1, 0 );
    object.scale.x = object.scale.y = object.scale.z = 0.1;
    scene.add( object );
  }

  function draw_grid() {
    // Grid
    var line_material = new THREE.LineBasicMaterial( { color: 0xffffff, opacity: 0.2 } ),
      geometry = new THREE.Geometry(),
      floor = 0, step = 25;
    for ( var i = 0; i <= 40; i ++ ) {
      geometry.vertices.push( new THREE.Vertex( new THREE.Vector3( - 500, floor, i * step - 500 ) ) );
      geometry.vertices.push( new THREE.Vertex( new THREE.Vector3(   500, floor, i * step - 500 ) ) );
      geometry.vertices.push( new THREE.Vertex( new THREE.Vector3( i * step - 500, floor, -500 ) ) );
      geometry.vertices.push( new THREE.Vertex( new THREE.Vector3( i * step - 500, floor,  500 ) ) );

    }
    grid_lines = new THREE.Line( geometry, line_material, THREE.LinePieces );
    scene.add( grid_lines );
  }

  function animate() {
    requestAnimationFrame( animate );
    render();
  }
/*
  function onDocumentMouseMove(event) {
    mouseX = ( event.clientX - self.divWidth );
    mouseY = ( event.clientY - self.divHeight );
  }*/

  function render() {
    controls.update();
    renderer.clear();
    renderer.render( scene, camera );
  }

  self.addSkeletonToTable = function ( skeleton ) {

    var rowElement = $('<tr/>').attr({
      id: 'skeletonrow-' + skeleton.id
    });
    // $('#webgl-skeleton-table > tbody:last').append( rowElement );
    $('#webgl-skeleton-table > tbody:last').append( rowElement );
    
    // show skeleton
    rowElement.append(
      $(document.createElement("td")).append(
        $(document.createElement("input")).attr({
                  id:    'skeletonshow-' + skeleton.id,
                  name:  skeleton.baseName,
                  value: skeleton.id,
                  type:  'checkbox',
                  checked:true
          })
          .click( function( event )
          {
            var vis = $('#skeletonshow-' + skeleton.id).is(':checked');
            skeletons[skeleton.id].visiblityCompositeActor( 0, vis);
            skeletons[skeleton.id].visiblityCompositeActor( 1, vis);
            skeletons[skeleton.id].visiblityCompositeActor( 2, vis);
          } )
    ));

    // show pre
    rowElement.append(
      $(document.createElement("td")).append(
        $(document.createElement("input")).attr({
                  id:    'skeletonpre-' + skeleton.id,
                  name:  skeleton.baseName,
                  value: skeleton.id,
                  type:  'checkbox',
                  checked:true
          })
          .click( function( event )
          {
            skeletons[skeleton.id].visiblityCompositeActor( 1, $('#skeletonpre-' + skeleton.id).is(':checked') );
          } )
    ));

    // show post
    rowElement.append(
      $(document.createElement("td")).append(
        $(document.createElement("input")).attr({
                  id:    'skeletonpost-' + skeleton.id,
                  name:  skeleton.baseName,
                  value: skeleton.id,
                  type:  'checkbox',
                  checked:true
          })
          .click( function( event )
          {
            skeletons[skeleton.id].visiblityCompositeActor( 2, $('#skeletonpost-' + skeleton.id).is(':checked') );
          } )
    ));

    var td = $(document.createElement("td"));
    td.append( $(document.createElement("button")).attr({
          id:    'skeletonaction-remove-' + skeleton.id,
          value: 'Remove'
          })
          .click( function( event )
          {
            self.removeSkeleton( skeleton.id );
          })
          .text('Remove!')
    );
    td.append(
        $(document.createElement("button")).attr({
          id:    'skeletonaction-changecolor-' + skeleton.id,
          value: 'Change color'
          })
          .click( function( event )
          {
            $('#color-wheel-' + skeleton.id).toggle();
          })
          .text('Change color')
      );
    td.append(
      $('<div id="color-wheel-' +
        skeleton.id + '"><div class="colorwheel'+
        skeleton.id + '"></div></div>')
    );
    rowElement.append( td );

    var cw = Raphael.colorwheel($("#color-wheel-"+skeleton.id+" .colorwheel"+skeleton.id)[0],150);
    cw.color("#FFFF00");
    $('#skeletonaction-changecolor-' + skeleton.id).css("background-color","#FFFF00");
    cw.onchange(function(color)
    {
      var colors = [parseInt(color.r), parseInt(color.g), parseInt(color.b)]
      self.changeSkeletonColor( skeleton.id, colors, color );
    })

    $('#color-wheel-' + skeleton.id).hide();

    rowElement.append(
      $(document.createElement("td")).text( skeleton.baseName + ' (SkeletonID: ' + skeleton.id + ')' )
    );

    skeleton.addCompositeActorToScene();

  }

  self.addActiveSkeletonToView = function() {
    var atn_id = SkeletonAnnotations.getActiveNodeId(),
        skeleton_id = SkeletonAnnotations.getActiveSkeletonId();
    if (!atn_id) {
      alert("You must have an active node selected to add its skeleton to the 3D WebGL View.");
      return;
    }
    if (SkeletonAnnotations.getActiveNodeType() != "treenode") {
      alert("You can only add skeletons to the 3D WebGL View at the moment - please select a node of a skeleton.");
      return;
    }
    self.addSkeletonFromID( project.id, skeleton_id );
  }

  self.addSkeletonFromID = function (projectID, skeletonID) {
    if( skeletonID !== undefined )
    {
        jQuery.ajax({
          //url: "../../model/export.skeleton.json.php",
          url: "dj/"+projectID+"/skeleton/" + skeletonID + "/json",
          type: "GET",
          dataType: "json",
          success: function (skeleton_data) {
            skeleton_data['baseName'] = skeleton_data['neuron']['neuronname'];
            self.addSkeleton( parseInt(skeletonID), skeleton_data );
          }
        });
    }
  };

  self.getListOfAllSkeletonIDs = function() {
    var data = new Object(), hexcol;
    data['nodes'] = {};
    data['edges'] = {};

    for( var skeleton_id in skeletons)
    {
      if( skeletons.hasOwnProperty(skeleton_id) ) {
        hexcol = rgb2hex( 'rgb('+skeletons[skeleton_id].actorColor[0]+','+
          skeletons[skeleton_id].actorColor[1]+','+
          skeletons[skeleton_id].actorColor[2]+')' )
        data['nodes'][skeleton_id] = {
          color: hexcol,
          id: skeletons[skeleton_id].id,
          baseName: skeletons[skeleton_id].baseName
        }
        // add connectivity
        for (var fromkey in this.original_connectivity) {
          var to = this.original_connectivity[fromkey];
          for (var tokey in to) {
            if(data['edges'][fromkey]) {
              if(data['edges'][fromkey][tokey]) {
                data['edges'][fromkey][tokey]['weight'] += 1;
              } else {
                data['edges'][fromkey][tokey]['weight'] = 1;
              }
            } else {
              data['edges'][fromkey] = {};
              data['edges'][fromkey][tokey] = {};
              data['edges'][fromkey][tokey]['weight'] = 1;
            }
          }
        }
      }
    }
    return data;
  }

}