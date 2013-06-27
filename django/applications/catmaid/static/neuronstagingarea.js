
var NeuronStagingArea = new function()
{

  var self = this;
  var skeletonmodels = {};
  
  self.skeletonsColorMethod = 'random';
  var togglevisibleall = false;

  var SkeletonModel = function( id, neuronname )
  {
    var self = this;
    self.id = id;
    self.baseName = neuronname + ' (SkeletonID: ' + self.id + ')';

    self.selected = true;

    // color
    {
      var newHue = 0.0;
      
      if (Object.keys(skeletonmodels).length === 0) {
        // This is the first skeleton, pick a random hue.
        newHue = Math.random();
      } else {
        // Any subsequent skeleton added will be at the midpoint of the largest existing gap in the HSV color space.
        var existingHues = [];
        for (var skeletonID in skeletonmodels) {
          if (skeletonmodels.hasOwnProperty(skeletonID)) {
            existingHues.push(skeletonmodels[skeletonID].color.getHSL().h);
          }
        }
        existingHues.sort();
        existingHues.push(existingHues[0] + 1.0);
        var maxGap = 0.0;
        existingHues.slice(0, -1).forEach(function(hue, i) {
          if (existingHues[i + 1] - hue > maxGap) {
            newHue = ((existingHues[i + 1] + hue) / 2) % 1.0;
            maxGap = existingHues[i + 1] - hue;
          }
        });
      }
      
      self.color = new THREE.Color().setHSL(newHue, 1.0, 0.5);
    }
    
    // 3d viewer attributes
    self.pre_visible = true;
    self.post_visible = true;
    self.text_visible = false;

    // properties for up/downstream
    self.synaptic_count_high_pass = 0; // this number or higher
    self.node_count_high_pass = 400; // this number or higher

    self.property_dialog = function()
    {
      var dialog = document.createElement('div');
      dialog.setAttribute("id", "dialog-confirm");
      dialog.setAttribute("title", "Skeleton Properties");

      var entry = document.createElement('input');
      entry.setAttribute("type", "text");
      entry.setAttribute("id", "skeleton-selected");
      entry.setAttribute("value", self.selected );
      dialog.appendChild(entry);

      // dialog.appendChild( document.createTextNode("Restrict display to shared connectors between visible skeletons") );
      // var rand = document.createElement('input');
      // rand.setAttribute("type", "button");
      // rand.setAttribute("id", "toggle_connector");
      // rand.setAttribute("value", "Restrict connectors");
      // rand.onclick = WebGLApp.toggleConnector;
      // dialog.appendChild(rand);
      // dialog.appendChild( document.createElement("br"));

      // var rand = document.createElement('input');
      // rand.setAttribute("type", "checkbox");
      // rand.setAttribute("id", "enable_z_plane");
      // rand.setAttribute("value", "Enable z-plane");
      // rand.onclick = WebGLApp.updateZPlane;
      // dialog.appendChild(rand);
      // var rand = document.createTextNode('Enable z-plane');
      // dialog.appendChild(rand);
      // dialog.appendChild( document.createElement("br"));

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
        }
      });
    };

    self.skeleton_info = function() {
			// TODO if the skeleton is loaded in the WebGLApp, then all of this information
			// is already present in the client
			// Additionally, the node count should be continued by the user contribution
			// (that is, how many nodes each user contributed). Same for review status.
			// And the "Downstream skeletons" should be split into two: skeletons with more than one node, and skeletons with one single node (placeholder pre- or postsynaptic nodes).
        requestQueue.register(django_url + project.id + '/skeleton/' + self.id + '/statistics', "POST", {},
         function (status, text, xml) {
                if (status === 200) {
                    if (text && text !== " ") {
                        var e = $.parseJSON(text);
                        if (e.error) {
                            alert(e.error);
                        } else {
                            var dialog = document.createElement('div');
                            dialog.setAttribute("id", "dialog-confirm");
                            dialog.setAttribute("title", "Skeleton Information");
                            var msg = document.createElement('p');
                            msg.innerHTML = 
                                "Neuron Name: " + self.baseName + "<br />" +
                                "Node count: " + e.node_count + "<br />" +
                                "Postsynaptic sites: " + e.postsynaptic_sites + "<br />" +
                                "Upstream skeletons: " + e.input_count + "<br />" +
                                "Presynaptic sites: " + e.presynaptic_sites + "<br />" +
                                "Downstream skeletons: " + e.output_count + "<br />" +
                                "Cable length: " + e.cable_length + " nm <br />" +
                                "Construction time: " + e.measure_construction_time + "<br />" +
                                "Reviewed: " + e.percentage_reviewed + " %<br />";
                            dialog.appendChild(msg);

                            $(dialog).dialog({
                              height: 440,
                              modal: true,
                              buttons: {
                                "OK": function() {
                                  $(this).dialog("close");
                                }
                              }
                            });
                        }
                    }
                }
        });
    };
  };

  self.highlight_skeleton = function( new_skeleton_id ) {
      for( var skeleton_id in skeletonmodels ) {
        if( skeletonmodels.hasOwnProperty(skeleton_id) ) {
          $('#skeletonrow-' + skeleton_id).css('background-color', 'white');
        }
      }
    $('#skeletonrow-' + new_skeleton_id).css('background-color', '#FFFF00');
  }

  self.is_widget_open = function()
  {
    if( $( "#neuron_staging_table").length === 0 ) {
      return false;
    } else {
      return true;
    }      
  };

  var ensureOpen = function() {
    if (!self.is_widget_open()) {
      WindowMaker.show('neuron-staging-area');
    }
  };

  self.reinit_list_with_existing_skeleton = function()
  {
    for( var skeleton_id in skeletonmodels ) {
      if( skeletonmodels.hasOwnProperty(skeleton_id) ) {
      self._add_skeleton_to_table( skeletonmodels[ skeleton_id ] );
      }
    }

    // setup button handlers
    $('#webgl-show').click(function() {
      for( var skeleton_id in skeletonmodels ) {
        if( skeletonmodels.hasOwnProperty(skeleton_id) ) {
          self.select_skeleton( skeleton_id, togglevisibleall );
        }
      }
      togglevisibleall = !togglevisibleall;
      if( togglevisibleall )
        $('#webgl-show').text('select all');
      else
        $('#webgl-show').text('unselect all');
    });
  };

  self.add_skeleton_to_stage = function( id, neuronname, callback )
  {
    // if it does not exists yet, add it
    if( skeletonmodels.hasOwnProperty( id ) ) {
      console.log('Skeleton', id, ' already in table');
    } else {
      skeletonmodels[ id ] = new SkeletonModel( id, neuronname );
      self._add_skeleton_to_table( skeletonmodels[ id ] );
      self.update_skeleton_color_button( id );
      if( WebGLApp.is_widget_open() ) {
        WebGLApp.addSkeletonFromID( id, true );
      }
    }
    if (typeof callback !== "undefined" && callback instanceof Function) {
      callback();
    }
  }

  self.add_skeleton_to_stage_without_name = function( id, callback )
  {
    ensureOpen();
    if( id ) {
      var skeleton_id = parseInt( id );
      jQuery.ajax({
        url: django_url + project.id + '/skeleton/' + skeleton_id + '/neuronname',
        type: "POST", // GET gets cached by the browser
        dataType: "json",
        success: function ( data ) {
          self.add_skeleton_to_stage( skeleton_id, data['neuronname'], callback );
        }
      });
    }
  };

  self._remove_skeleton_from_table = function( id )
  {
    $('#skeletonrow-' + id).remove();
  };

  self.remove_skeleton = function( id )
  {
    if( skeletonmodels.hasOwnProperty( id ) ) {
      self._remove_skeleton_from_table( id );
      delete skeletonmodels[ id ];
      // remove from webgl if open
      if( WebGLApp.is_widget_open() ) {
        WebGLApp.removeSkeleton( id );
      }
    } else {
      console.log('Cannot remove skeleton', id, ' it is not in the list');
    }
  };

  self.remove_all_skeletons = function()
  {
      for( var skeleton_id in skeletonmodels ) {
        if( skeletonmodels.hasOwnProperty(skeleton_id) ) {
          // TODO: callback for other widgets
          self.remove_skeleton( skeleton_id );
        }
      }
  };
  
  self.set_skeletons_base_color = function() {
    // Set the color of all skeletons based on the state of the "Color" pop-up menu.
    var skeletons = self.get_all_skeletons();
    
    self.skeletonsColorMethod = $('#skeletons_base_color :selected').attr("value");
    
    if (self.skeletonsColorMethod === "random") {
      var hueStart = Math.random();
      var hueStep = 1.0 / skeletons.length;
      skeletons.forEach(function(skeletonID, i) {
        var newColor = new THREE.Color().setHSL((hueStart + i * hueStep) % 1.0, (skeletons.length > 6 ? 1.0 - i % 2.0 * 0.5 : 1.0), 0.5);
        skeletonmodels[ skeletonID ].color = newColor;
        self.update_skeleton_color_button( skeletonID );
        if( WebGLApp.has_skeleton( skeletonID ) ) {
          WebGLApp.changeSkeletonColor( skeletonID, newColor );
        }
      });
    } else {
      skeletons.forEach(function(skeletonID) {
        if( WebGLApp.has_skeleton(skeletonID) ) {
          WebGLApp.changeSkeletonColor(skeletonID);
        }
      });
    }
  };
  
  self.update_skeleton_color_button = function( id ) {
    $('#skeletonaction-changecolor-' + id).css("background-color", '#' + skeletonmodels[ id ].color.getHexString() );
  };

  self.update_skeleton_color_in_3d = function( id )
  {
      if( $('#view_in_3d_webgl_widget').length && WebGLApp.has_skeleton( id ) )
        WebGLApp.changeSkeletonColor( id, skeletonmodels[ id ].color );   
  };

  self.get_skeletonmodel = function( id )
  {
    return skeletonmodels[ id ];
  };

    self.get_color_of_skeleton = function( id )
    {
      return skeletonmodels[ id ].color.clone();
    }

  self.get_selected_skeletons = function()
  {
    var keys = [];
      for( var skeleton_id in skeletonmodels ) {  
          if( skeletonmodels.hasOwnProperty(skeleton_id) &&
            skeletonmodels[ skeleton_id ].selected ) {
              keys.push( skeleton_id )
          }
      }
      return keys;
  }

  self.get_selected_skeletons_data = function() {
    var skeletons = {};
    for (var skid in skeletonmodels) {
      if (skeletonmodels.hasOwnProperty(skid)) {
        var sk = skeletonmodels[skid];
        if (sk.selected) {
          skeletons[skid] = sk.baseName;
        }
      }
    }
    return skeletons;
  };

  self.get_all_skeletons = function()
  {
    return Object.keys( skeletonmodels );
  };

  self.add_active_object_to_stage = function( event ) {
    // add either a skeleton or an assembly based on the tool selected
    if( project.getTool().toolname === 'tracingtool' ) {
        var atn_id = SkeletonAnnotations.getActiveNodeId(),
            skeleton_id = SkeletonAnnotations.getActiveSkeletonId();
        if (!atn_id) {
            alert("You must have an active node selected to add its skeleton to the staging area.");
            return;
      }
        if (SkeletonAnnotations.getActiveNodeType() !== SkeletonAnnotations.TYPE_NODE) {
            alert("Select the node of a skeleton, not a connector, to add it to the staging area.");
            return;
        }
      var new_callback = function() {
        self.highlight_skeleton( skeleton_id );
      }
        self.add_skeleton_to_stage_without_name( skeleton_id, new_callback );
    }
  };

  // credit: http://stackoverflow.com/questions/638948/background-color-hex-to-javascript-variable-jquery
  function _rgb2hex(rgb) {
    rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    function hex(x) {
      return ("0" + parseInt(x).toString(16)).slice(-2);
    }
      return "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
  };

  function _componentToHex(c) {
      var hex = c.toString(16);
      return hex.length === 1 ? "0" + hex : hex;
  };

  function _rgbarray2hex(rgb) {
      return "#" + _componentToHex(rgb[0]) + _componentToHex(rgb[1]) + _componentToHex(rgb[2]);
  };

  function _hex2rgb(hex) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
  };

  self._add_skeleton_to_table = function ( skeleton ) {
    if( $('#skeletonrow-' + skeleton.id ).length > 0 ) {
      return;
    }

    var rowElement = $('<tr/>').attr({
      id: 'skeletonrow-' + skeleton.id
    });
    // $('#webgl-skeleton-table > tbody:last').append( rowElement );
    $('#webgl-skeleton-table > tbody:last').append( rowElement );

    var td = $(document.createElement("td"));
    td.append( $(document.createElement("img")).attr({
      id:    'skeletonaction-activate-' + skeleton.id,
      value: 'Nearest node'
    })
      .click( function( event )
      {
        TracingTool.goToNearestInNeuronOrSkeleton( 'skeleton', skeleton.id );
      })
      .attr('src', STATIC_URL_JS + 'widgets/themes/kde/activate.gif')
    );
    td.append( $(document.createElement("img")).attr({
          id:    'skeletonaction-remove-' + skeleton.id,
          value: 'Remove'
          })
          .click( function( event )
          {
            self.remove_skeleton( skeleton.id );
          })
          .attr('src', STATIC_URL_JS + 'widgets/themes/kde/delete.png')
          .text('Remove!')
    );
    rowElement.append( td );

    rowElement.append(
      $(document.createElement("td")).text( skeleton.baseName )
    );

    // show skeleton
    rowElement.append(
      $(document.createElement("td")).append(
        $(document.createElement("input")).attr({
                  id:    'skeletonshow-' + skeleton.id,
                  name:  skeleton.baseName,
                  value: skeleton.id,
                  type:  'checkbox',
                  checked: true
          })
          .click( function( event )
          {
            var vis = $('#skeletonshow-' + skeleton.id).is(':checked')
            skeletonmodels[ skeleton.id ].selected = vis;
            if( WebGLApp.is_widget_open() ) {
              self.select_skeleton( skeleton.id, vis );
            }
              
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
            skeletonmodels[ skeleton.id ].pre_visible = $('#skeletonpre-' + skeleton.id).is(':checked');
            if( WebGLApp.is_widget_open() )
              WebGLApp.setSkeletonPreVisibility( skeleton.id, skeletonmodels[ skeleton.id ].pre_visible);

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
            skeletonmodels[ skeleton.id ].post_visible = $('#skeletonpost-' + skeleton.id).is(':checked');
            if( WebGLApp.is_widget_open() )
              WebGLApp.setSkeletonPostVisibility( skeleton.id, skeletonmodels[ skeleton.id ].post_visible);
          } )
    ));

    rowElement.append(
      $(document.createElement("td")).append(
        $(document.createElement("input")).attr({
                  id:    'skeletontext-' + skeleton.id,
                  name:  skeleton.baseName,
                  value: skeleton.id,
                  type:  'checkbox',
                  checked:false
          })
          .click( function( event )
          {
            skeletonmodels[ skeleton.id ].text_visible = $('#skeletontext-' + skeleton.id).is(':checked');
            if( WebGLApp.is_widget_open() )
              WebGLApp.setSkeletonTextVisibility( skeleton.id, skeletonmodels[ skeleton.id ].text_visible);
          } )
    ));

    var td = $(document.createElement("td"));
    td.append(
      $(document.createElement("button")).attr({
        id:    'skeletonaction-properties-' + skeleton.id,
        value: 'Properties'
      })
        .click( function( event )
        {
          skeletonmodels[ skeleton.id ].property_dialog();
        })
        .text('Properties')
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
    td.append(
      $(document.createElement("button")).attr({
        id:    'skeletonaction-skeletoninfo-' + skeleton.id,
        value: 'Info'
      })
        .click( function( event )
        {
          skeletonmodels[ skeleton.id ].skeleton_info();
        })
        .text('Info')
    );
    rowElement.append( td );

    var cw = Raphael.colorwheel($("#color-wheel-"+skeleton.id+" .colorwheel"+skeleton.id)[0],150);
    cw.color("#FFFF00");
    $('#skeletonaction-changecolor-' + skeleton.id).css("background-color","#FFFF00");
    cw.onchange(function(color)
    {
      skeletonmodels[ skeleton.id ].color = new THREE.Color().setRGB(parseInt(color.r) / 255.0, parseInt(color.g) / 255.0, parseInt(color.b) / 255.0);
      self.update_skeleton_color_button( skeleton.id);
      self.update_skeleton_color_in_3d( skeleton.id );

    })
    $('#color-wheel-' + skeleton.id).hide();
  };

  self.select_skeleton = function( skeleton_id, vis ) {
    if( !skeletonmodels.hasOwnProperty( skeleton_id ) ) {
      return;
    }
    var vis;
    if( vis === undefined) {
      vis = !skeletonmodels[ skeleton_id ].selected;
    }
    var skeleton = skeletonmodels[ skeleton_id ];
    $('#skeletonshow-' + skeleton.id).attr('checked', vis);
    skeletonmodels[ skeleton.id ].selected = vis;
    if( WebGLApp.is_widget_open() ) {
      var connector_filter = WebGLApp.setSkeletonVisibility(skeleton.id, vis);
      if (!connector_filter) {
        skeletonmodels[ skeleton.id ].pre_visible = vis;
        $('#skeletonpre-' + skeleton.id).attr('checked', vis);
        WebGLApp.setSkeletonPreVisibility( skeleton.id,  vis );

        skeletonmodels[ skeleton.id ].post_visible = vis;
        $('#skeletonpost-' + skeleton.id).attr('checked', vis);
        WebGLApp.setSkeletonPostVisibility( skeleton.id, vis );
      }
    }
  };

  self.save_skeleton_list = function() {
    var shortname = prompt('Short name reference for skeleton list?');
    if (!shortname) return;
    shortname = shortname.trim();
    if (0 === shortname.length) return; // can't save a no-name list
    jQuery.ajax({
      url: django_url + project.id + '/skeletonlist/save',
      data: { 
        shortname: shortname,
        skeletonlist: self.get_selected_skeletons()
      },
      type: "POST",
      dataType: "json",
      success: function () {}
    });
  };

  self.load_skeleton_list = function() {
    var shortname = prompt('Short name reference?');
    if (!shortname) return;
    jQuery.ajax({
      url: django_url + project.id + '/skeletonlist/load',
      data: { shortname: shortname },
      type: "POST",
      dataType: "json",
      success: function ( data ) {
        for( var idx in data['skeletonlist'])
        {
          self.add_skeleton_to_stage_without_name( data['skeletonlist'][idx] );
        }
      }
    });
  };

  self.usercolormap_dialog = function() {

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

	self.measure = function() {
		var skeleton_ids = self.get_selected_skeletons();
		if (0 === skeleton_ids.length) return;
    requestQueue.register(django_url + project.id + '/skeletons/measure', "POST",
			{skeleton_ids: skeleton_ids},
			function(status, text) {
				if (200 !== status) return;
				var json = $.parseJSON(text);
				if (json.error) {
					alert(json.error);
					return;
				}
				SkeletonMeasurementsTable.populate(json.map(function(row) {
					row.unshift(skeletonmodels[row[0]].baseName);
					return row;
				}));
			});
	};
};
