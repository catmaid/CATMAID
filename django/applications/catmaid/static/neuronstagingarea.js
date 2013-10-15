/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

SelectionTable = function() {
  this.skeletonmodels = {};
  this.skeletonsColorMethod = 'random';
  this.togglevisibleall = false;
  this.selected_skeleton_id = null;
};

SelectionTable.prototype = {};

window.NeuronStagingArea = new SelectionTable();

SelectionTable.prototype.fn = function(fnName) {
  return function() {
    NeuronStagingArea[fnName].apply(NeuronStagingArea, arguments);
  };
};

SelectionTable.prototype.SkeletonModel = function( id, neuronname, color ) {
    this.id = id;
    this.baseName = neuronname + ' - #' + id;
    this.selected = true;
    // 3d viewer attributes
    this.pre_visible = true;
    this.post_visible = true;
    this.text_visible = false;

    // properties for up/downstream
    this.synaptic_count_high_pass = 0; // this number or higher
    this.node_count_high_pass = 400; // this number or higher

    this.color = color;
};

SelectionTable.prototype.SkeletonModel.prototype = {};

// TODO doesn't do anything?
SelectionTable.prototype.SkeletonModel.prototype.property_dialog = function() {
  var dialog = document.createElement('div');
  dialog.setAttribute("id", "dialog-confirm");
  dialog.setAttribute("title", "Skeleton Properties");

  var entry = document.createElement('input');
  entry.setAttribute("type", "text");
  entry.setAttribute("id", "skeleton-selected");
  entry.setAttribute("value", self.selected );
  dialog.appendChild(entry);

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

SelectionTable.prototype.SkeletonModel.prototype.skeleton_info = function() {
  // TODO if the skeleton is loaded in the WebGLApp, then all of this information
  // is already present in the client
  // Additionally, the node count should be continued by the user contribution
  // (that is, how many nodes each user contributed). Same for review status.
  // And the "Downstream skeletons" should be split into two: skeletons with more than one node, and skeletons with one single node (placeholder pre- or postsynaptic nodes).
  requestQueue.register(django_url + project.id + '/skeleton/' + this.id + '/statistics', "POST", {},
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




SelectionTable.prototype.getNSkeletons = function() {
  var count = 0;
  for (var key in this.skeletonmodels) if (this.skeletonmodels.hasOwnProperty(key)) ++count;
  return count;
};

SelectionTable.prototype.COLORS = [[1, 1, 0], // yellow
                                   [1, 0, 1], // magenta
                                   [0.5, 0.5, 1], // light blue
                                   [1, 0, 0], // red
                                   [1, 1, 1], // white
                                   [0, 1, 0], // green
                                   [0, 1, 1], // cyan
                                   [1, 0.5, 0], // orange
                                   [0, 0, 1], // blue
                                   [0.75, 0.75, 0.75], // silver
                                   [1, 0.5, 0.5], // pinkish
                                   [0.5, 1, 0.5], // light cyan
                                   [0.5, 1, 0], // light green
                                   [0, 1, 0.5], // pale green
                                   [1, 0, 0.5], // purplish
                                   [0.5, 0, 0], // maroon
                                   [0.5, 0.5, 0.5], // grey
                                   [0.5, 0, 0.5], // purple
                                   [0, 0, 0.5], // navy blue
                                   [1, 0.38, 0.28], // tomato
                                   [0.85, 0.64, 0.12], // gold
                                   [0.25, 0.88, 0.82], // turquoise
                                   [1, 0.75, 0.79]]; // pink


SelectionTable.prototype.pickColor = function(index) {
  var c = this.COLORS[index % this.COLORS.length];
  var color = new THREE.Color().setRGB(c[0], c[1], c[2]);
  if (index < this.COLORS.length) {
    return color;
  }
  // Else, play a variation on the color's hue (+/- 0.25) and saturation (from 0.5 to 1)
  var hsl = color.getHSL();
  color.setHSL((hsl.h + (Math.random() - 0.5) / 2.0) % 1.0,
               Math.max(0.5, Math.min(1.0, (hsl.s + (Math.random() - 0.5) * 0.3))),
               hsl.l);
  return color;
};

SelectionTable.prototype.highlight_skeleton = function( skeleton_id ) {
  if (this.selected_skeleton_id === skeleton_id) return;
  if (this.selected_skeleton_id in this.skeletonmodels) {
    $('#skeletonrow-' + this.selected_skeleton_id).css('background-color', 'white');
    this.selected_skeleton_id = null;
  }
  if (skeleton_id in this.skeletonmodels) {
    $('#skeletonrow-' + skeleton_id).css('background-color', '#FFFF00');
    this.selected_skeleton_id = skeleton_id;
  }
};

SelectionTable.prototype.is_widget_open = function() {
  return 0 !== $("#neuron_staging_table").length;
};

SelectionTable.prototype.ensureOpen = function() {
  if (!this.is_widget_open()) {
    WindowMaker.show('neuron-staging-area');
  }
};

SelectionTable.prototype.reinit_list_with_existing_skeleton = function() {
  for (var skeleton_id in this.skeletonmodels) {
    if (this.skeletonmodels.hasOwnProperty(skeleton_id)) {
      this._add_skeleton_to_table(this.skeletonmodels[skeleton_id]);
    }
  }

  // setup button handlers
  var self = this;
  $('#webgl-show').click(function() {
    for( var skeleton_id in self.skeletonmodels ) {
      if( self.skeletonmodels.hasOwnProperty(skeleton_id) ) {
        self.select_skeleton( skeleton_id, self.togglevisibleall );
      }
    }
    self.togglevisibleall = !self.togglevisibleall;
    if( self.togglevisibleall )
      $('#webgl-show').text('select all');
    else
      $('#webgl-show').text('unselect all');
  });
};

SelectionTable.prototype.add_skeleton_to_stage = function( id, neuronname, callback ) {
  // if it does not exists yet, add it
  if( this.skeletonmodels.hasOwnProperty( id ) ) {
    console.log('Skeleton', id, ' already in table');
  } else {
    this.skeletonmodels[ id ] = new this.SkeletonModel(id, neuronname, this.pickColor(this.getNSkeletons()));
    this._add_skeleton_to_table( this.skeletonmodels[ id ] );
    this.update_skeleton_color_button( id );
    if( WebGLApp.is_widget_open() ) {
      WebGLApp.addSkeletons( [id], true );
    }
  }
  if (typeof callback !== "undefined" && callback instanceof Function) {
    callback();
  }
};

/** sks: object with skeleton_id as keys and neuron names as values. */
SelectionTable.prototype.add_skeletons_to_stage = function(sks, callback) {
  var self = this;
  var n = this.getNSkeletons();
  var skids = Object.keys(sks).filter(function(id) {
    if (self.skeletonmodels.hasOwnProperty(id)) {
      // Already in table
      return false;
    }
    var neuronname = sks[id];
    self.skeletonmodels[id] = new self.SkeletonModel(id, neuronname, self.pickColor(n++));
    self._add_skeleton_to_table(self.skeletonmodels[id]);
    self.update_skeleton_color_button( id );
    return true;
  });
  if (WebGLApp.is_widget_open()) {
    WebGLApp.addSkeletons(skids, true, callback);
  }
};

SelectionTable.prototype.add_skeleton_to_stage_without_name = function( id, callback ) {
  this.ensureOpen();
  if (id) {
    var skeleton_id = parseInt(id),
        self = this;
    jQuery.ajax({
      url: django_url + project.id + '/skeleton/' + skeleton_id + '/neuronname',
      type: "POST", // GET gets cached by the browser
      dataType: "json",
      success: function (data) {
        self.add_skeleton_to_stage( skeleton_id, data['neuronname'], callback );
      }
    });
  }
};

SelectionTable.prototype.add_skeletons = function(ids, callback) {
  this.ensureOpen();
  var self = this;
  jQuery.ajax({
    url: django_url + project.id + '/skeleton/neuronnames',
    data : {
      skids: ids.map(function(id) { return parseInt(id); })
    },
    type: "POST", // GET gets cached by the browser
    dataType: "json",
    success: function ( json ) {
      self.add_skeletons_to_stage(json, callback );
    }
  });
};

SelectionTable.prototype._remove_skeleton_from_table = function( id ) {
  $('#skeletonrow-' + id).remove();
};

SelectionTable.prototype.remove_skeleton = function( id ) {
  if (this.skeletonmodels.hasOwnProperty(id) ) {
    if (id === this.selected_skeleton_id) {
      this.selected_skeleton_id = null;
    }
    this._remove_skeleton_from_table(id);
    delete this.skeletonmodels[id];
    // remove from webgl if open
    if (WebGLApp.is_widget_open() ) {
      WebGLApp.removeSkeletons([id]);
    }
  } else {
    console.log('Cannot remove skeleton', id, ' it is not in the list');
  }
};

SelectionTable.prototype.remove_skeletons = function(ids) {
  ids.forEach(function(id) {
    if (id === this.selected_skeleton_id) {
      this.selected_skeleton_id = null;
    }
    this._remove_skeleton_from_table(id);
    delete this.skeletonmodels[id];
  }, this);
  if (WebGLApp.is_widget_open()) {
    WebGLApp.removeSkeletons(ids);
  }
};

SelectionTable.prototype.remove_all_skeletons = function() {
  this.remove_skeletons(Object.keys(this.skeletonmodels));
};
 
/** Set the color of all skeletons based on the state of the "Color" pulldown menu. */
SelectionTable.prototype.set_skeletons_base_color = function() {
  this.skeletonsColorMethod = $('#skeletons_base_color :selected').attr("value");
  var skeleton_ids = Object.keys(this.skeletonmodels);
  
  if ("random" === this.skeletonsColorMethod) {
    var colors = skeleton_ids.map(function(skeleton_id, index) {
      var skeleton = this.skeletonmodels[skeleton_id];
      skeleton.color = this.pickColor(index);
      this.update_skeleton_color_button(skeleton_id);
      return skeleton.color;
    }, this);
    if (WebGLApp.is_widget_open()) {
      WebGLApp.changeSkeletonColors(skeleton_ids, colors);
    }
  } else {
    if (WebGLApp.is_widget_open()) {
      WebGLApp.changeSkeletonColors(skeleton_ids);
    }
  }
};
 
SelectionTable.prototype.update_skeleton_color_button = function( id ) {
  $('#skeletonaction-changecolor-' + id).css("background-color", '#' + this.skeletonmodels[ id ].color.getHexString() );
};

SelectionTable.prototype.update_skeleton_color_in_3d = function( id ) {
  if( $('#view_in_3d_webgl_widget').length && WebGLApp.has_skeleton( id ) ) {
    WebGLApp.changeSkeletonColors( [id], [this.skeletonmodels[ id ].color] );
  }
};

SelectionTable.prototype.get_skeletonmodel = function( id ) {
  return this.skeletonmodels[ id ];
};

SelectionTable.prototype.get_color_of_skeleton = function( id ) {
  return this.skeletonmodels[ id ].color.clone();
};

SelectionTable.prototype.get_selected_skeletons = function() {
  var keys = [];
  for (var id in this.skeletonmodels) {  
    if (this.skeletonmodels.hasOwnProperty(id) && this.skeletonmodels[id].selected) {
      keys.push(id)
    }
  }
  return keys;
};

SelectionTable.prototype.get_selected_skeletons_names = function() {
  var skeletons = {};
  for (var skid in this.skeletonmodels) {
    if (this.skeletonmodels.hasOwnProperty(skid)) {
      var sk = this.skeletonmodels[skid];
      if (sk.selected) {
        skeletons[skid] = sk.baseName;
      }
    }
  }
  return skeletons;
};

SelectionTable.prototype.get_all_skeletons = function() {
  return Object.keys( skeletonmodels );
};

SelectionTable.prototype.add_active_object_to_stage = function( event ) {
  // add either a skeleton or an assembly based on the tool selected
  if ('tracingtool' === project.getTool().toolname) {
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
    var self = this;
    var new_callback = function() {
      self.highlight_skeleton( skeleton_id );
    }
    this.add_skeleton_to_stage_without_name( skeleton_id, new_callback );
  }
};

SelectionTable.prototype._add_skeleton_to_table = function ( skeleton ) {
  if( $('#skeletonrow-' + skeleton.id ).length > 0 ) {
    return;
  }

  var self = this;

  var rowElement = $('<tr/>').attr({
    id: 'skeletonrow-' + skeleton.id
  });
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
          self.skeletonmodels[ skeleton.id ].selected = vis;
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
          self.skeletonmodels[ skeleton.id ].pre_visible = $('#skeletonpre-' + skeleton.id).is(':checked');
          if( WebGLApp.is_widget_open() )
            WebGLApp.setSkeletonPreVisibility( skeleton.id, self.skeletonmodels[ skeleton.id ].pre_visible);

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
          self.skeletonmodels[ skeleton.id ].post_visible = $('#skeletonpost-' + skeleton.id).is(':checked');
          if( WebGLApp.is_widget_open() )
            WebGLApp.setSkeletonPostVisibility( skeleton.id, self.skeletonmodels[ skeleton.id ].post_visible);
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
          self.skeletonmodels[ skeleton.id ].text_visible = $('#skeletontext-' + skeleton.id).is(':checked');
          if( WebGLApp.is_widget_open() )
            WebGLApp.setSkeletonTextVisibility( skeleton.id, self.skeletonmodels[ skeleton.id ].text_visible);
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
        self.skeletonmodels[ skeleton.id ].property_dialog();
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
        self.skeletonmodels[ skeleton.id ].skeleton_info();
      })
      .text('Info')
  );
  rowElement.append( td );

  // TODO don't create one for each!
  var cw = Raphael.colorwheel($("#color-wheel-"+skeleton.id+" .colorwheel"+skeleton.id)[0],150);
  cw.color("#FFFF00");
  $('#skeletonaction-changecolor-' + skeleton.id).css("background-color","#FFFF00");
  cw.onchange(function(color)
  {
    self.skeletonmodels[ skeleton.id ].color = new THREE.Color().setRGB(parseInt(color.r) / 255.0, parseInt(color.g) / 255.0, parseInt(color.b) / 255.0);
    self.update_skeleton_color_button( skeleton.id);
    self.update_skeleton_color_in_3d( skeleton.id );

  });
  // TODO just call the proper method of cw, no need to jQuery-select it
  $('#color-wheel-' + skeleton.id).hide();
};

SelectionTable.prototype.select_skeleton = function( skeleton_id, vis ) {
  if( !this.skeletonmodels.hasOwnProperty( skeleton_id ) ) {
    return;
  }
  if (undefined === vis) {
    vis = !this.skeletonmodels[ skeleton_id ].selected;
  }
  var skeleton = this.skeletonmodels[ skeleton_id ];
  $('#skeletonshow-' + skeleton.id).attr('checked', vis);
  this.skeletonmodels[ skeleton.id ].selected = vis;
  if( WebGLApp.is_widget_open() ) {
    var connector_filter = WebGLApp.setSkeletonVisibility(skeleton.id, vis);
    if (!connector_filter) {
      this.skeletonmodels[ skeleton.id ].pre_visible = vis;
      $('#skeletonpre-' + skeleton.id).attr('checked', vis);
      WebGLApp.setSkeletonPreVisibility( skeleton.id,  vis );

      this.skeletonmodels[ skeleton.id ].post_visible = vis;
      $('#skeletonpost-' + skeleton.id).attr('checked', vis);
      WebGLApp.setSkeletonPostVisibility( skeleton.id, vis );
    }
  }
};


SelectionTable.prototype.save_skeleton_list = function() {
  var shortname = prompt('Short name reference for skeleton list?');
  if (!shortname) return;
  shortname = shortname.trim();
  if (0 === shortname.length) return; // can't save a no-name list
  var self = this;
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

SelectionTable.prototype.load_skeleton_list = function() {
  var shortname = prompt('Short name reference?');
  if (!shortname) return;
  var self = this;
  jQuery.ajax({
    url: django_url + project.id + '/skeletonlist/load',
    data: { shortname: shortname },
    type: "POST",
    dataType: "json",
    success: function ( data ) {
      for( var idx in data['skeletonlist']) {
        self.add_skeleton_to_stage_without_name( data['skeletonlist'][idx] );
      }
    }
  });
};

SelectionTable.prototype.usercolormap_dialog = function() {
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

SelectionTable.prototype.measure = function() {
  var skeleton_ids = this.get_selected_skeletons();
  if (0 === skeleton_ids.length) return;
  var self = this;
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
        row.unshift(self.skeletonmodels[row[0]].baseName);
        return row;
      }));
    });
};

/** credit: http://stackoverflow.com/questions/638948/background-color-hex-to-javascript-variable-jquery */
SelectionTable.prototype._rgb2hex = function(rgb) {
  rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  var hex = function(x) {
    return ("0" + parseInt(x).toString(16)).slice(-2);
  }
  return "#" + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
};

SelectionTable.prototype._componentToHex = function(c) {
  var hex = c.toString(16);
  return hex.length === 1 ? "0" + hex : hex;
};

SelectionTable.prototype._rgbarray2hex = function(rgb) {
  return "#" + this._componentToHex(rgb[0]) + this._componentToHex(rgb[1]) + this._componentToHex(rgb[2]);
};

SelectionTable.prototype._hex2rgb = function(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
};
