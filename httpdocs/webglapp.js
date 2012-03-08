
function WebGLViewer(divID) {

  self = this;

  this.divID = divID;
  this.divID_jQuery = '#' + divID;

  this.divWidth = $(this.divID_jQuery).width();
  this.divHeight = $(this.divID_jQuery).height();

  this.neurons = [];

  var camera, scene, renderer, grid_lines, scale, controls, light, zplane;
  var mouseX = 0, mouseY = 0;
  var project_id = project.id;
  var stack_id = project.focusedStack.id;

  var randomColors = [];
  randomColors[0] = [255, 255, 0]; // yellow
  randomColors[1] = [255, 0, 255]; // magenta
  randomColors[2] = [0, 255, 255]; // cyan
  randomColors[3] = [255, 255, 255]; // white
  randomColors[4] = [255, 128, 0]; // orange

  /* transform coordinates from CATMAID coordinate system
     to WebGL coordinate system: x->x, y->y+dy, z->-z
    */
  var transform_coordinates = function ( point ) {
    return [point[0],-point[1]+dimension.y*resolution.y,-point[2] ];
  }

  var resolution = project.focusedStack.resolution;
      dimension = project.focusedStack.dimension;
      translation = project.focusedStack.translation;

  var connectivity_types = new Array('neurite', 'presynaptic_to', 'postsynaptic_to');

  init();
  animate();
  debugaxes();
  draw_grid();
  drawmesh();

  function init() {
    container = document.getElementById(self.divID);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera( 75, self.divWidth / self.divHeight, 1, 3000 );
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

  var Skeleton = function( skeleton_data )
  {
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

    var type, from_vector, to_vector;

    this.line_material = new Object();
    this.geometry = new Object();
    this.actor = new Object();

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
    var labelspheregeometry = new THREE.SphereGeometry( 130 * scale, 32, 32, 1 );

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
            this.labelSphere[fromkey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0x0000ff } ) );
            this.labelSphere[fromkey].position.set( from_vector.x, from_vector.y, from_vector.z );
            this.labelSphere[fromkey].scale.set( 2, 2, 2 );
            scene.add( this.labelSphere[fromkey] );
        }
        if( ($.inArray( "soma", this.original_vertices[tokey]['labels'] ) !== -1) && (this.labelSphere[tokey]=== undefined) ) {
            this.labelSphere[tokey] = new THREE.Mesh( labelspheregeometry, new THREE.MeshBasicMaterial( { color: 0x0000ff  } ) );
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
        var w = 700, h = 600;
        $('#viewer-3d-webgl-canvas').width(w);
        $('#viewer-3d-webgl-canvas').height(h);
        $('#viewer-3d-webgl-canvas').css("background-color", "#000000");
        renderer.setSize( w, h );
        THREEx.FullScreen.cancel();

    } else {
        THREEx.FullScreen.request(document.getElementById(divID));
        var w = 1050, h = 900;
        //var w = window.innerWidth, h = window.innerHeight - 200;
        $('#viewer-3d-webgl-canvas').width(w);
        $('#viewer-3d-webgl-canvas').height(h);
        $('#viewer-3d-webgl-canvas').css("background-color", "#000000");
        renderer.setSize( w, h );
    };

  }

  this.createActiveNode = function( x, y, z)
  {
    sphere = new THREE.SphereGeometry( 130 * scale, 32, 32, 1 );
    active_node = new THREE.Mesh( sphere, new THREE.MeshBasicMaterial( { color: 0x00ff00, opacity:0.6, transparent:true } ) );
    // active_node.scale.set( 0.05, 0.05, 0.05 );
    active_node.position.set( x,y,z );
    scene.add( active_node );
  }

  this.removeActiveNode = function() {
    if(active_node) {
      scene.removeObject( active_node );
      active_node = null;
    }
  }

  this.updateActiveNode = function( x, y, z )
  {
    if(!active_node) {
      this.createActiveNode( 0, 0, 0 );
    }
    var co = transform_coordinates( [
      translation.x + ((x) / project.focusedStack.scale) * resolution.x,
      translation.y + ((y) / project.focusedStack.scale) * resolution.y,
      translation.z + z * resolution.z]
    );
    active_node.position.set( co[0]*scale, co[1]*scale, co[2]*scale );
  }

  this.randomizeColors = function()
  {
    var i = 0;
    for( var skeleton_id in skeletons)
		{
      if( i < randomColors.length ) {
        skeletons[skeleton_id].changeColor( randomColors[i] );
      } else {
        skeletons[skeleton_id].changeColor( [parseInt( Math.random() * 255 ),
          parseInt( Math.random() * 255 ),
          parseInt( Math.random() * 255 ) ] );
      }
      i=i+1;
    }
  }

  // add skeleton to scene
  this.addSkeleton = function( skeleton_id, skeleton_data )
  {
    var deleted=false;
    if( skeletons.hasOwnProperty(skeleton_id) ){
      // remove skeleton and refetch
      skeletons[skeleton_id].removeActorFromScene();
      delete skeletons[skeleton_id];
      deleted=true;
    }
    skeleton_data['id'] = skeleton_id;
    skeletons[skeleton_id] = new Skeleton( skeleton_data );
    if(!deleted) {
      self.addToSkeletonList( skeletons[skeleton_id] );
    }
    skeletons[skeleton_id].addCompositeActorToScene();
    return true;
  }

  this.changeSkeletonColor = function( skeleton_id, value )
  {
    if( !skeletons.hasOwnProperty(skeleton_id) ){
        alert("Skeleton "+skeleton_id+" does not exist. Cannot change color it!");
        return;
    } else {
        skeletons[skeleton_id].changeColor( value );
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
    // update camera
    camera.position.x = x;
    camera.position.y = y;
    camera.position.z = 200;
  }

  function addMesh( geometry, scale, x, y, z, rx, ry, rz, material ) {
    mesh = new THREE.Mesh( geometry, material );
    mesh.scale.set( scale, scale, scale );
    mesh.position.set( x, y, z );
    mesh.rotation.set( rx, ry, rz );
    mesh.doubleSided = true;
    scene.add( mesh );
	}

  function createScene( geometry, start ) {
    //addMesh( geometry, scale, 0, 0, 0,  0,0,0, new THREE.MeshPhongMaterial( { ambient: 0x030303, color: 0x030303, specular: 0x990000, shininess: 30 } ) );
    addMesh( geometry, scale, 0, 0, 0,  0,0,0, new THREE.MeshBasicMaterial( { color: 0xff0000, opacity:0.2, transparent:true } ) );
	}

  function drawmesh() {
    var loader = new THREE.JSONLoader( true );
    var s = Date.now(),
        callback = function( geometry ) { createScene( geometry, s ) };
    jQuery.ajax({
        //url: "../../model/export.skeleton.json.php",
        url: "dj/"+project_id+"/stack/"+stack_id+"/models",
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
            models[obj].vertices = vert2,
            loader.createModel( models[obj], callback );
          }
        }
      });
  }


  this.updateZPlane = function(zval) {
    // if disabled, deselect
    if( zval === -1 ) {
        scene.remove( zplane );
        zplane = null;
        return;
    }
    var newval;
    if( isNaN(zval) ) {
        zval = project.focusedStack.z;
    }
    newval = (-zval * resolution.z + translation.z) * scale;

    if( !zplane ) {
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


  this.addToSkeletonList = function ( skeleton ) {
    var newElement = $('<li/>'),
        linkElement, enclosingObject = this;
    newElement.attr('id', '3d-object-' + skeleton.baseName );
    newElement.text(skeleton.baseName + ' ');
    linkElement = $('<a/>');
    linkElement.attr('href', '#');
    linkElement.text("(remove)");
    enclosingObject = this;
    linkElement.click(function (e) {
      self.removeSkeleton( skeleton.id );
      newElement.remove();
    });
    newElement.append(linkElement);
  
    $('#view-3d-webgl-object-list').append(newElement);
    
    colorElement = $('<a/>');
    colorElement.attr('href', '#');
    colorElement.text("(change color)");
    colorElement.click(function (e) {
      $('#color-wheel-' + skeleton.id).toggle();
    });
    newElement.append(colorElement);

    var colorWheel = $('<div id="color-wheel-' +
      skeleton.id + '"><div class="colorwheel'+
      skeleton.id + '"></div></div>');
    newElement.append(colorWheel);
    $('#color-wheel-' + skeleton.id).hide();

    var cw = Raphael.colorwheel($("#color-wheel-"+skeleton.id+" .colorwheel"+skeleton.id)[0],150);
		cw.color("#FF9900");
    cw.onchange(function(color)
    {
      var colors = [parseInt(color.r), parseInt(color.g), parseInt(color.b)]
      self.changeSkeletonColor( skeleton.id, colors );
    })

  };

  this.addFromCATMAID = function (projectID, skeletonID, neuronName) {
    if( skeletonID !== undefined )
    {
        jQuery.ajax({
          //url: "../../model/export.skeleton.json.php",
          url: "dj/"+projectID+"/skeleton/" + skeletonID + "/json",
          type: "GET",
          dataType: "json",
          success: function (skeleton_data) {
            skeleton_data['baseName'] = neuronName;
            self.addSkeleton( parseInt(skeletonID), skeleton_data );
          }
        });
    }
  };

  this.toString = function () {
    return "WebGL Viewer(" + this.divID + ")";
  };

}

function nameFromCATMAIDInfo(info) {
  return info.skeleton_name + ' [' + info.neuron_name + ']';
}

function addNeuronFromCATMAID(divID, info) {

  var divID_jQuery = '#' + divID;

  if (!$(divID_jQuery).data('viewer')) {
    $(divID_jQuery).data('viewer', new WebGLViewer(divID));
  }

  $(divID_jQuery).data('viewer').addFromCATMAID(info.project_id, info.skeleton_id, nameFromCATMAIDInfo(info));
}

function createWebGLViewerFromCATMAID(divID) {

  var divID_jQuery = '#' + divID;

  if (!$(divID_jQuery).data('viewer')) {
    $(divID_jQuery).data('viewer', new WebGLViewer(divID));
  }
}

function updateZPlane(zindex) {

  var divID = 'viewer-3d-webgl-canvas';
  var divID_jQuery = '#' + divID;

  if( $('#enable_z_plane').attr('checked') != undefined ) {
      $(divID_jQuery).data('viewer').updateZPlane(zindex);
  } else {
      $(divID_jQuery).data('viewer').updateZPlane(-1);
  }



}

function update3DWebGLViewATN() {
  var atn = SkeletonAnnotations.getActiveNodePosition();

  var divID = 'viewer-3d-webgl-canvas';
  var divID_jQuery = '#' + divID;

  if (!$(divID_jQuery).data('viewer')) {
    $(divID_jQuery).data('viewer', new WebGLViewer(divID));
  }

  if (!atn) {
    alert("You must have an active node selected to add its skeleton to the 3D WebGL View.");
    $(divID_jQuery).data('viewer').removeActiveNode();
    return;
  }

  $(divID_jQuery).data('viewer').updateActiveNode( atn.x, atn.y, atn.z );
  
}

function addSkeletonTo3DWebGLView(project_id, skeleton_id, skeleton_name, neuron_name) {
  var e = new Object();
  e['project_id'] = project_id;
  e['skeleton_id'] = skeleton_id;
  e['skeleton_name'] = skeleton_name;
  e['neuron_name'] = neuron_name;
  addNeuronFromCATMAID('viewer-3d-webgl-canvas', e);
}

function fullscreenWebGL() {
  var divID = 'viewer-3d-webgl-canvas';
  var divID_jQuery = '#' + divID;
  $(divID_jQuery).data('viewer').fullscreenWebGL();
}

function randomizeWebGLColor() {
  var divID = 'viewer-3d-webgl-canvas';
  var divID_jQuery = '#' + divID;
  $(divID_jQuery).data('viewer').randomizeColors();

}

function addTo3DWebGLView() {
  var atn_id = SkeletonAnnotations.getActiveNodeId();
  if (!atn_id) {
    alert("You must have an active node selected to add its skeleton to the 3D WebGL View.");
    return;
  }
  if (SkeletonAnnotations.getActiveNodeType() != "treenode") {
    alert("You can only add skeletons to the 3D WebGL View at the moment - please select a node of a skeleton.");
    return;
  }
  requestQueue.register('model/treenode.info.php', 'POST', {
    pid: project.id,
    tnid: atn_id
  }, function (status, text, xml) {
    if (status == 200) {
      var e = eval("(" + text + ")");
      if (e.error) {
        alert(e.error);
      } else {
        e['project_id'] = project.id;
        addNeuronFromCATMAID('viewer-3d-webgl-canvas', e);
      }
    } else {
      alert("Bad status code " + status + " mapping treenode ID to skeleton and neuron");
    }
    return true;
  });
}
