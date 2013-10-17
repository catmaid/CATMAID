/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

SelectionTable = function() {
  this.skeletons = [];
  this.skeleton_ids = {}; // skeleton_id vs index in skeleton array
  this.skeletonsColorMethod = 'random';
  this.togglevisibleall = false;
  this.selected_skeleton_id = null;
  this.highlighting_color = "#d6ffb5";
  this.next_color_index = 0;
  this.gui = new this.GUI(this, 20);
};

SelectionTable.prototype = {};

SelectionTable.prototype.fn = function(fnName) {
  return function() {
    NeuronStagingArea[fnName].apply(NeuronStagingArea, arguments);
  };
};

SelectionTable.prototype.SkeletonModel = function( id, neuronname, color ) {
    this.id = parseInt(id);
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


SelectionTable.prototype.pickColor = function() {
  var c = this.COLORS[this.next_color_index % this.COLORS.length];
  var color = new THREE.Color().setRGB(c[0], c[1], c[2]);
  if (this.next_color_index < this.COLORS.length) {
    this.next_color_index += 1;
    return color;
  }
  // Else, play a variation on the color's hue (+/- 0.25) and saturation (from 0.5 to 1)
  var hsl = color.getHSL();
  color.setHSL((hsl.h + (Math.random() - 0.5) / 2.0) % 1.0,
               Math.max(0.5, Math.min(1.0, (hsl.s + (Math.random() - 0.5) * 0.3))),
               hsl.l);
  this.next_color_index += 1;
  return color;
};

SelectionTable.prototype.highlight = function( skeleton_id ) {
  if (this.selected_skeleton_id in this.skeleton_ids) {
    $('#skeletonrow-' + this.selected_skeleton_id).css('background-color', 'white');
    this.selected_skeleton_id = null;
  }
  if (skeleton_id in this.skeleton_ids) {
    $('#skeletonrow-' + skeleton_id).css('background-color', this.highlighting_color);
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

/** setup button handlers */
SelectionTable.prototype.reinit_list_with_existing_skeleton = function() {
  
  if (SkeletonAnnotations.getActiveSkeletonId()) this.addActive();

  var self = this;

  $('#webgl-rmall').click(function() {
    if (confirm("Empty selection table?")) {
      self.clear();
    }
  });

  $('#webgl-show').click(function() {
    self.skeletons.forEach(function(skeleton) {
      self.selectSkeleton(skeleton, self.togglevisibleall);
    });
    self.togglevisibleall = !self.togglevisibleall;
  });

  // TODO add similar buttons and handlers for pre and post
};

/** sks: object with skeleton_id as keys and neuron names as values. */
SelectionTable.prototype.insertSkeletons = function(sks, callback) {
  var skids = Object.keys(sks).filter(function(id) {
    if (id in this.skeleton_ids) {
      // Already in table
      return false;
    }
    var neuronname = sks[id];
    this.skeletons.push(new this.SkeletonModel(id, neuronname, this.pickColor()));
    this.skeleton_ids[id] = this.skeletons.length -1;
    return true;
  }, this);

  this.gui.update();

  if (WebGLApp.is_widget_open()) {
    WebGLApp.addSkeletons(skids, true, callback);
  } else {
    if (callback) callback();
  }
};

SelectionTable.prototype.addSkeletons = function(ids, callback) {
  this.ensureOpen();
  var self = this;
  requestQueue.register(django_url + project.id + '/skeleton/neuronnames', 'POST',
    { skids: ids.map(function(id) { return parseInt(id); }) },
    function(status, text) {
      if (200 !== status) return;
      var json = $.parseJSON(text);
      if (json.error) { alert(json.error); return; }
      self.insertSkeletons(json, callback);
    });
};

/** ids: an array of Skeleton IDs. */
SelectionTable.prototype.removeSkeletons = function(ids) {
  if (1 === ids.length) {
    var index = this.skeleton_ids[ids[0]];
    if (!index) return;
    // Remove element
    this.skeletons.splice(index, 1);
    // Edit selection
    if (ids[0] === this.selected_skeleton_id) {
      this.selected_skeleton_id = null;
    }
  } else {
    var ids_set = ids.reduce(function(o, id) { o[id] = null; return o; }, {});
    // Recreate skeletons array
    this.skeletons = this.skeletons.filter(function(sk) {
      return !(sk.id in ids_set);
    });
    // Edit selection
    if (this.selected_skeleton_id in ids_set) {
      this.selected_skeleton_id = null;
    }
  }

  // Recreate map of indices
  this.skeleton_ids = this.skeletons.reduce(function(o, sk, i) {
    o[sk.id] = i;
    return o;
  }, {});

  this.gui.update();

  if (WebGLApp.is_widget_open()) {
    WebGLApp.removeSkeletons(ids);
  }
};

SelectionTable.prototype.clear = function() {
  WebGLApp.removeSkeletons(Object.keys(this.skeleton_ids));
  this.skeletons = [];
  this.skeleton_ids = {};
  this.gui.clear();
  this.selected_skeleton_id = null;
  this.next_color_index = 0;
};
 
/** Set the color of all skeletons based on the state of the "Color" pulldown menu. */
SelectionTable.prototype.set_skeletons_base_color = function() {
  this.skeletonsColorMethod = $('#skeletons_base_color :selected').attr("value");
  var skeleton_ids = Object.keys(this.skeleton_ids);
  
  if ("random" === this.skeletonsColorMethod) {
    this.next_color_index = 0; // reset
    var colors = this.skeletons.map(function(skeleton) {
      skeleton.color = this.pickColor();
      this.gui.update_skeleton_color_button(skeleton);
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
 
SelectionTable.prototype.update_skeleton_color_in_3d = function( skeleton ) {
  if( $('#view_in_3d_webgl_widget').length && WebGLApp.has_skeleton( skeleton.id ) ) {
    WebGLApp.changeSkeletonColors( [skeleton.id], [skeleton.color] );
  }
};

SelectionTable.prototype.getSkeleton = function( id ) {
  if (id in this.skeleton_ids) {
    return this.skeletons[this.skeleton_ids[id]];
  }
};

SelectionTable.prototype.getSkeletonColor = function( id ) {
  var sk = this.getSkeleton(id);
  if (sk) return sk.color.clone();
};

SelectionTable.prototype.getSelectedSkeletons = function() {
  return this.skeletons.reduce(function(a, skeleton) {
    if (skeleton.selected) a.push(skeleton.id);
    return a;
  }, []);
};

SelectionTable.prototype.getSelectedSkeletonNames = function() {
  return this.skeletons.reduce(function(o, skeleton) {
    if (skeleton.selected) o[skeleton.id] = skeleton.baseName;
    return o;
  }, {});
};

SelectionTable.prototype.get_all_skeletons = function() {
  return Object.keys( skeleton_ids );
};

SelectionTable.prototype.addActive = function() {
  // add either a skeleton or an assembly based on the tool selected
  if ('tracingtool' === project.getTool().toolname) {
    var atn_id = SkeletonAnnotations.getActiveNodeId(),
        skeleton_id = SkeletonAnnotations.getActiveSkeletonId();
    if (!atn_id) {
        growlAlert("Information", "You must have an active node selected to add its skeleton to the staging area.");
        return;
    }
    if (SkeletonAnnotations.getActiveNodeType() !== SkeletonAnnotations.TYPE_NODE) {
      alert("Select the node of a skeleton, not a connector, to add it to the Selection Table");
      return;
    }
    var self = this;
    var new_callback = function() {
      self.highlight( skeleton_id );
    }
    this.addSkeletons( [skeleton_id], new_callback );
  }
};

SelectionTable.prototype.showPrevious = function() {
  this.gui.showPrevious();
};

SelectionTable.prototype.showNext = function() {
  this.gui.showNext();
};


SelectionTable.prototype.GUI = function(table, max) {
  this.table = table;
  this.first = 0;
  this.max = max;
};

SelectionTable.prototype.GUI.prototype = {};

SelectionTable.prototype.GUI.prototype.clear = function() {
  this.first = 0;
  this.update();
};

SelectionTable.prototype.GUI.prototype.showPrevious = function() {
  if (0 === this.first) return;
  this.first -= this.max;
  this.update();
};

SelectionTable.prototype.GUI.prototype.showNext = function() {
  if (this.first + this.max > this.table.skeletons.length) return;
  this.first += this.max;
  this.update();
};

SelectionTable.prototype.GUI.prototype.update_skeleton_color_button = function(skeleton) {
  $('#skeletonaction-changecolor-' + skeleton.id).css("background-color", '#' + skeleton.color.getHexString() );
};

/** Remove all, and repopulate with the current range. */
SelectionTable.prototype.GUI.prototype.update = function() {
  // Cope with changes in size
  if (this.first >= this.table.skeletons.length) {
    this.first = Math.max(0, this.table.skeletons.length - this.max);
  }

  // Update GUI state
  var one = 0 === this.table.skeletons.length? 0 : 1;
  $('#selection_table_first').text(this.first + one);
  $('#selection_table_last').text(Math.min(this.first + this.max + one, this.table.skeletons.length));
  $('#selection_table_length').text(this.table.skeletons.length);

  // Remove all table rows
  $("tr[id^='skeletonrow-']").remove();
  // Re-add the range
  this.table.skeletons.slice(this.first, this.first + this.max).forEach(this.append, this);
};

SelectionTable.prototype.GUI.prototype.append = function (skeleton) {
  var table = this.table;

  var rowElement = $('<tr/>').attr({
    id: 'skeletonrow-' + skeleton.id
  });

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
          table.removeSkeletons( [skeleton.id] );
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
                checked: skeleton.selected
        })
        .click( function( event )
        {
          var vis = $('#skeletonshow-' + skeleton.id).is(':checked')
          skeleton.selected = vis;
          if( WebGLApp.is_widget_open() ) {
            table.selectSkeleton( skeleton, vis );
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
          skeleton.pre_visible = $('#skeletonpre-' + skeleton.id).is(':checked');
          if( WebGLApp.is_widget_open() )
            WebGLApp.setSkeletonPreVisibility( skeleton.id, skeleton.pre_visible);

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
          skeleton.post_visible = $('#skeletonpost-' + skeleton.id).is(':checked');
          if( WebGLApp.is_widget_open() )
            WebGLApp.setSkeletonPostVisibility( skeleton.id, skeleton.post_visible);
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
          skeleton.text_visible = $('#skeletontext-' + skeleton.id).is(':checked');
          if( WebGLApp.is_widget_open() )
            WebGLApp.setSkeletonTextVisibility( skeleton.id, skeleton.text_visible);
        } )
  ));

  var td = $(document.createElement("td"));
  td.append(
    $(document.createElement("button")).attr({
      id:    'skeletonaction-properties-' + skeleton.id,
      value: 'P'
    })
      .click( function( event )
      {
        skeleton.property_dialog();
      })
      .text('P')
  );
  td.append(
    $(document.createElement("button")).attr({
      id:    'skeletonaction-changecolor-' + skeleton.id,
      value: 'color'
    })
      .click( function( event )
      {
        // Select the inner div, which will contain the color wheel
        var sel = $('#color-wheel-' + skeleton.id + ' .colorwheel' + skeleton.id);
        if (skeleton.cw) {
          delete skeleton.cw;
          $('#color-wheel-' + skeleton.id).hide();
          sel.empty();
        } else {
          var cw = Raphael.colorwheel(sel[0], 150);
          cw.color('#' + skeleton.color.getHexString());
          cw.onchange(function(color) {
            skeleton.color = new THREE.Color().setRGB(parseInt(color.r) / 255.0, parseInt(color.g) / 255.0, parseInt(color.b) / 255.0);
            table.gui.update_skeleton_color_button(skeleton);
            table.update_skeleton_color_in_3d(skeleton);
          });
          skeleton.cw = cw;
          $('#color-wheel-' + skeleton.id).show();
        }
      })
      .text('color')
      .css("background-color", '#' + skeleton.color.getHexString())
  );
  td.append(
    $('<div id="color-wheel-' + skeleton.id + '"><div class="colorwheel' + skeleton.id + '"></div></div>')
  );
  td.append(
    $(document.createElement("button")).attr({
      id:    'skeletonaction-skeletoninfo-' + skeleton.id,
      value: 'Info'
    })
      .click( function( event )
      {
        skeleton.skeleton_info();
      })
      .text('Info')
  );

  rowElement.append( td );

  $('#webgl-skeleton-table > tbody:last').append( rowElement );
 
  if (skeleton.id === this.table.selected_skeleton_id) {
    this.table.highlight(skeleton.id);
  }
};

SelectionTable.prototype.selectSkeletonById = function(id) {
  if (id in this.skeleton_ids) {
    this.selectSkeleton(this.skeletons[this.skeleton_ids[id]], true);
  }
};

SelectionTable.prototype.selectSkeleton = function( skeleton, vis ) {
  $('#skeletonshow-' + skeleton.id).attr('checked', vis);
  skeleton.selected = vis;
  if( WebGLApp.is_widget_open() ) {
    var connector_filter = WebGLApp.setSkeletonVisibility(skeleton.id, vis);
    if (!connector_filter) {
      skeleton.pre_visible = vis;
      $('#skeletonpre-' + skeleton.id).attr('checked', vis);
      WebGLApp.setSkeletonPreVisibility( skeleton.id,  vis );

      skeleton.post_visible = vis;
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
      skeletonlist: self.getSelectedSkeletons()
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
      self.addSkeletons(data['skeletonlist']);
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
  var skids = this.getSelectedSkeletons();
  if (0 === skids.length) return;
  var self = this;
  requestQueue.register(django_url + project.id + '/skeletons/measure', "POST",
    {skeleton_ids: skids},
    function(status, text) {
      if (200 !== status) return;
      var json = $.parseJSON(text);
      if (json.error) {
        alert(json.error);
        return;
      }
      SkeletonMeasurementsTable.populate(json.map(function(row) {
        row.unshift(self.skeletons[self.skeleton_ids[row[0]]].baseName);
        return row;
      }));
    });
};


window.NeuronStagingArea = new SelectionTable();


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
