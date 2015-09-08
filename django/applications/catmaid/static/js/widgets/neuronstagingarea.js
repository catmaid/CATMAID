/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
  Colorizer,
  InstanceRegistry,
  NeuronNameService,
  project,
  requestQueue,
  session,
  SkeletonAnnotations,
  User,
  WindowMaker
*/

"use strict";

var SelectionTable = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();

  this.skeletons = [];
  this.skeleton_ids = {}; // skeleton_id vs index in skeleton array
  this.reviews = {};  // skeleton_id vs review percentage
  this.review_filter = 'Union'; // filter for review percentage: 'Union', 'Team' or 'Self'
  this.all_visible = true;
  this.all_items_visible = {pre: true, post: true, text: false, meta: true};
  this.next_color_index = 0;
  this.order = [[0, 'asc']];
  this.gui = new this.GUI(this);

  // Listen to change events of the active node and skeletons
  SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
      this.selectActiveNode, this);
};

SelectionTable._lastFocused = null; // Static reference to last focused instance

SelectionTable.prototype = {};
$.extend(SelectionTable.prototype, new InstanceRegistry());
$.extend(SelectionTable.prototype, new CATMAID.SkeletonSource());
$.extend(SelectionTable.prototype, new Colorizer());

SelectionTable.prototype.highlighting_color = "#d6ffb5";

SelectionTable.prototype.getName = function() {
  return "Selection " + this.widgetID;
};

SelectionTable.prototype.destroy = function() {
  delete this.linkTarget;
  this.clear(); // clear after clearing linkTarget, so it doesn't get cleared
  this.unregisterInstance();
  this.unregisterSource();
  NeuronNameService.getInstance().unregister(this);
  if (SelectionTable._lastFocused === this) SelectionTable._lastFocused = null;
  SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
      this.selectActiveNode, this);
};

SelectionTable.prototype.updateModels = function(models, source_chain) {
  if (source_chain && (this in source_chain)) return; // break propagation loop
  if (!source_chain) source_chain = {};
  source_chain[this] = this;

  var new_models = {};
  Object.keys(models).forEach(function(skid) {
    var model = models[skid];
    if (skid in this.skeleton_ids) {
      this.skeletons[this.skeleton_ids[model.id]] = model.clone();
    } else {
      new_models[skid] = model;
    }
  }, this);

  if (Object.keys(new_models).length > 0) this.append(new_models);
  else this.gui.update();

  this.updateLink(models, source_chain);
};

SelectionTable.prototype.SkeletonModel = function( id, neuronname, color ) {
    this.id = parseInt(id);
    this.baseName = neuronname;
    this.selected = true;
    this.pre_visible = true;
    this.post_visible = true;
    this.text_visible = false;
    this.meta_visible = true;
    this.color = color;
    this.opacity = 1; // from 0 to 1
};

SelectionTable.prototype.SkeletonModel.prototype = {};

SelectionTable.prototype.SkeletonModel.prototype.setVisible = function(v) {
    this.selected = v;
    this.pre_visible = v;
    this.post_visible = v;
    if (!v) this.text_visible = v;
    this.meta_visible = v;
};

SelectionTable.prototype.SkeletonModel.prototype.clone = function() {
  var m = new SelectionTable.prototype.SkeletonModel(this.id, this.baseName, this.color.clone());
  m.selected = this.selected;
  m.pre_visible = this.pre_visible;
  m.post_visible = this.post_visible;
  m.text_visible = this.text_visible;
  m.meta_visible = this.meta_visible;
  m.opacity = this.opacity;
  return m;
};

SelectionTable.prototype.summary_info = function() {
  var skids = this.getSelectedSkeletons();
  if (0 === skids.length) return CATMAID.msg("Add or select skeletons first!");
  this.skeleton_info(skids);
};

SelectionTable.prototype.skeleton_info = function(skeleton_ids) {
  // If the skeleton is loaded in the WebGLApp, then all of this information is already present in the client, but potentially not up to date: so reload.
  requestQueue.register(django_url + project.id + '/skeleton/contributor_statistics_multiple', "POST", {skids: skeleton_ids},
      (function (status, text, xml) {
        if (200 !== status) return;
        if (!text || text === " ") return;
        var json = $.parseJSON(text);
        if (json.error) return alert(json.error);

        var dialog = document.createElement('div');
        dialog.setAttribute("id", "dialog-confirm");
        dialog.setAttribute("title", "Skeleton Information");

        var users = User.all();
        var format = function(contributors) {
          return "<br /><table>" + Object.keys(contributors)
            .reduce(function(a, user_id) {
              a.push([users[user_id] ? users[user_id].login : "?",
                  contributors[user_id]]);
              return a;
            }, [])
            .sort(function(a, b) {
              return a[1] === b[1] ? 0 : (a[1] < b[1] ? 1 : -1); // descending
            })
            .map(function(a) {
              return '<tr><td>' + a[0] + '</td><td>' + a[1] + '</td></tr>';
            })
            .join('') + "</table>";
        };

        var formatTime = function(minutes) {
          var time = {};
          time.hour = (minutes / 60) | 0;
          time.minute = minutes % 60;
          return ['hour', 'minute'].reduce(function(s, unit) {
            var v = time[unit];
            return s + (s.length > 0 ? " " : "")
                     + (0 === v ? "" : v + " " + unit + (v > 1 ? "s" : ""));
          }, "");
        };

        var time_string = formatTime(json.construction_minutes),
            review_time_string = formatTime(json.min_review_minutes),
            review_time_string2 = formatTime(json.multiuser_review_minutes);


        var table = document.createElement('table');
        table.style.border = 1;
        table.innerHTML = [
          [(1 === skeleton_ids.length) ? "Neuron name:" : "Number of skeletons:",
           (1 === skeleton_ids.length) ? NeuronNameService.getInstance().getName(skeleton_ids[0]) : skeleton_ids.length],
          ["Node count: ", json.n_nodes],
          ["Nodes contributed by: ", format(json.node_contributors)],
          ["Number of presynaptic sites: ", json.n_pre],
          ["Presynapses contributed by: ", format(json.pre_contributors)],
          ["Number of postsynaptic sites: ", json.n_post],
          ["Postsynapses contributed by: ", format(json.post_contributors)],
          ["Construction time: ", time_string],
          ["Minimal review time (min): ", review_time_string],
          ["Multiuser review time (min): ", review_time_string2]
        ].map(function(row) {
          return "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>";
        }).join('');

        dialog.appendChild(table);

        $(dialog).dialog({
          height: 440,
          modal: true,
          buttons: {
            "OK": function() {
              $(this).dialog("close");
            }
          }
        });
      }).bind(this));
};

/**
 * Will highlight the active node, if its skeleton is part of this table.
 */
SelectionTable.prototype.selectActiveNode = function(activeNode)
{
  this.highlight(activeNode ? activeNode.skeleton_id : null);
};

/**
 * Will highlight the active node, if its skeleton is part of this table.
 * Otherwise, all existing highlighting will be removed.
 */
SelectionTable.prototype.highlight = function(skeleton_id) {
  var table = $("table#skeleton-table" + this.widgetID);
  // Reset highlighting
  $('tbody tr', table).css('background-color', '');
  // Add new highlighting
  if (skeleton_id && skeleton_id in this.skeleton_ids) {
    $('tbody tr[data-skeleton-id=' + skeleton_id + ']', table).css(
        'background-color', this.highlighting_color);
  }
};

/** Static access to the first selection table found. */
SelectionTable.prototype.getOrCreate = function() {
  var selection = SelectionTable.prototype.getFirstInstance();
  if (!selection) WindowMaker.create('neuron-staging-area');
  return SelectionTable.prototype.getFirstInstance();
};

SelectionTable.prototype.setLastFocused = function () {
  SelectionTable._lastFocused = this;
};

SelectionTable.getLastFocused = function () {
  if (SelectionTable._lastFocused === null)
    SelectionTable._lastFocused = SelectionTable.prototype.getOrCreate();

  return SelectionTable._lastFocused;
};

SelectionTable.prototype.toggleSelectAllSkeletonsUI = function() {
  this.all_visible = !this.all_visible;
  var updated = {};
  // Update table header
  ['pre', 'post', 'text', 'meta'].forEach(function(suffix, i) {
    if (2 === i && this.all_visible) return; // don't turn on text
    $('#selection-table-show-all-' + suffix + this.widgetID).prop('checked', this.all_visible);
  }, this);
  // Update models
  this.filteredSkeletons(false).forEach(function(skeleton) {
      skeleton.setVisible(this.all_visible);
      updated[skeleton.id] = skeleton.clone();
    }, this);
  if (this.linkTarget && Object.keys(updated).length > 0) {
    this.updateLink(updated);
  }
  // Update UI
  this.gui.invalidate();
};

/** Where 'type' is 'pre' or 'post' or 'text' or 'meta', which are the prefixes of
 * the keys in SkeletonModel that end with "_visible". */
SelectionTable.prototype.toggleAllKeyUI = function(type) {
  var state = !this.all_items_visible[type];
  this.all_items_visible[type] = state;
  var skeletons = this.filteredSkeletons(true);
  var key = type + '_visible';
  skeletons.forEach(function(skeleton) {
    skeleton[key] = state;
  }, this);
  if (this.linkTarget && skeletons.length > 0) {
    this.updateLink(skeletons.reduce(function(o, skeleton) {
      o[skeleton.id] = skeleton.clone();
      return o;
    }, {}));
  }
  // Update UI
  this.gui.invalidate();
};

/** setup button handlers */
SelectionTable.prototype.init = function() {
  $('#selection-table-remove-all' + this.widgetID).click((function() {
    if (confirm("Remove selected from table?")) {
      this.removeSkeletons(this.getSelectedSkeletons());
    }
  }).bind(this));

  $('#selection-table-show-all' + this.widgetID).click(this.toggleSelectAllSkeletonsUI.bind(this));

  ['pre', 'post', 'text', 'meta'].forEach(function(suffix) {
    $('#selection-table-show-all-' + suffix + this.widgetID).click(this.toggleAllKeyUI.bind(this, suffix));
  }, this);

  this.gui.update();
};

/** sks: object with skeleton_id as keys and neuron names as values. */
SelectionTable.prototype.insertSkeletons = function(sks, callback) {
  var models = {};
  Object.keys(sks).forEach(function(id) {
    models[id] = new this.SkeletonModel(id, sks[id], this.pickColor());
  }, this);
  this.append(models);

  this.gui.update();

  if (callback) callback();
};

SelectionTable.prototype.addSkeletons = function(ids, callback) {
  var skeleton_ids = this.skeleton_ids;
  ids = ids.reduce(function(a, skid) {
    if (!(skid in skeleton_ids)) a.push(parseInt(skid));
    return a;
  }, []);
  var self = this;
  requestQueue.register(django_url + project.id + '/skeleton/neuronnames', 'POST',
    {skids: ids},
    function(status, text) {
      if (200 !== status) return;
      var json = $.parseJSON(text);
      if (json.error) { alert(json.error); return; }
      self.insertSkeletons(json, callback);
    });
};

SelectionTable.prototype.append = function(models) {
  var skeleton_ids = Object.keys(models);
  if (0 === skeleton_ids.length) {
    CATMAID.info("No skeletons selected!"); // at source
    return;
  }

  // Retrieve review status before doing anything else
  var postData = {
      skeleton_ids: skeleton_ids,
      whitelist: this.review_filter === 'Team'};
  if (this.review_filter === 'Self') postData.user_ids = [session.userid];
  requestQueue.register(django_url + project.id + '/skeleton/review-status', 'POST',
    postData,
    (function(status, text) {
      if (200 !== status) return;
      var json = $.parseJSON(text);
      if (json.error) {
        new CATMAID.ErrorDialog(json.error, json.detail).show();
        return;
      }

      var valid_skeletons = skeleton_ids.filter(function(skid) {
        return !!this[skid];
      }, json);

      valid_skeletons.forEach(function(skeleton_id) {
        // Make sure existing widget settings are respected
        var model = models[skeleton_id];
        model.meta_visible = this.all_items_visible['meta'];
        model.text_visible = this.all_items_visible['text'];
        model.pre_visible = this.all_items_visible['pre'];
        model.post_visible = this.all_items_visible['post'];

        if (skeleton_id in this.skeleton_ids) {
          // Update skeleton
          this.skeletons[this.skeleton_ids[skeleton_id]] = model;
          return;
        }
        this.skeletons.push(model);
        var counts = json[skeleton_id];
        this.reviews[skeleton_id] = parseInt(Math.floor(100 * counts[1] / counts[0]));
        this.skeleton_ids[skeleton_id] = this.skeletons.length -1;
      }, this);

      // Add skeletons
      NeuronNameService.getInstance().registerAll(this, models,
          this.gui.update.bind(this.gui));

      this.updateLink(models);

      // Notify user if not all skeletons are valid
      var nInvalid = skeleton_ids.length - valid_skeletons.length;
      if (0 !== nInvalid) {
        var missing = skeleton_ids.filter(function(skid) {
          return !this[skid];
        }, json);
        var msg = 'Could not load ' + nInvalid + ' skeletons, because they could ' +
            'not be found. See details for more info.';
        var detail =  'Thie following skeletons are missing: ' + missing.join(', ');
        CATMAID.error(msg, detail);
      }
    }).bind(this));
};

/**
 * This method is called from the neuron name service, if neuron names are
 * changed.
 */
SelectionTable.prototype.updateNeuronNames = function() {
  this.gui.update();
};

/** ids: an array of Skeleton IDs. */
SelectionTable.prototype.removeSkeletons = function(ids) {
  if (1 === ids.length) {
    if (ids[0] in this.skeleton_ids) {
      // Remove element
      this.skeletons.splice(this.skeleton_ids[ids[0]], 1);
    }
  } else {
    var ids_set = ids.reduce(function(o, id) { o[id] = null; return o; }, {});
    // Recreate skeletons array
    this.skeletons = this.skeletons.filter(function(sk) {
      return !(sk.id in ids_set);
    });
  }

  // Recreate map of indices
  this.skeleton_ids = this.skeletons.reduce(function(o, sk, i) {
    o[sk.id] = i;
    return o;
  }, {});

  this.gui.update();

  if (this.linkTarget) {
    // Prevent propagation loop by checking if the target has the skeletons anymore
    if (ids.some(this.linkTarget.hasSkeleton, this.linkTarget)) {
      this.linkTarget.removeSkeletons(ids);
    }
  }
};

SelectionTable.prototype.clear = function(source_chain) {
  this.skeletons = [];
  this.skeleton_ids = {};
  this.reviews = {};
  this.gui.clear();
  this.next_color_index = 0;

  this.clearLink(source_chain);
};
 
/** Set the color of all skeletons based on the state of the "Color" pulldown menu. */
SelectionTable.prototype.randomizeColorsOfSelected = function() {
  this.next_color_index = 0; // reset
  this.filteredSkeletons(true).forEach(function(skeleton) {
    skeleton.color = this.pickColor();
  }, this);
  this.updateLink(this.getSelectedSkeletonModels());
  // Update UI
  this.gui.invalidate();
};

SelectionTable.prototype.colorizeWith = function(scheme) {
  if ('CATMAID' === scheme) return this.randomizeColorsOfSelected();

  var skeletons = this.filteredSkeletons(true),
      colorFn;

  if (0 === scheme.indexOf('category') && d3.scale.hasOwnProperty(scheme)) {
    colorFn = d3.scale[scheme]();
  } else if (colorbrewer.hasOwnProperty(scheme)) {
    var sets = colorbrewer[scheme];
    if (skeletons.size <= 3) {
      colorFn = function(i) { return sets[3][i]; };
    } else if (sets.hasOwnProperty(skeletons.size)) {
      colorFn = function(i) { return sets[skeletons.size][i]; };
    } else {
      // circular indexing
      var keys = Object.keys(sets),
          largest = sets[keys.sort(function(a, b) { return a < b ? 1 : -1; })[0]];
      colorFn = function(i) { return largest[i % largest.length]; };
    }
  }

  if (colorFn) {
    skeletons.forEach(function(sk, i) {
      sk.color.setStyle(colorFn(i));
    }, this);
    this.updateLink(this.getSelectedSkeletonModels());
    // Update UI
    this.gui.invalidate();
  }
};
 
SelectionTable.prototype.getSkeletonModel = function( id ) {
  if (id in this.skeleton_ids) {
    return this.skeletons[this.skeleton_ids[id]].clone();
  }
};

/** Returns a clone of each model. */
SelectionTable.prototype.getSelectedSkeletonModels = function() {
  return this.filteredSkeletons(true).reduce(function(m, sk) {
    m[sk.id] = sk.clone();
    return m;
  }, {});
};

SelectionTable.prototype.getSkeletonModels = function() {
  return this.skeletons.reduce(function(o, model) {
      o[model.id] = model.clone();
    return o;
  }, {});
};

/** Update neuron names and remove stale non-existing skeletons while preserving
 *  ordering and properties of each skeleton currently in the selection. */
SelectionTable.prototype.update = function() {
  var self = this;
  var models = this.skeletons.reduce(function(o, sk) { o[sk.id] = sk; return o; }, {});
  var indices = this.skeleton_ids;
  var skeleton_ids = Object.keys(models);

  requestQueue.register(django_url + project.id + '/skeleton/neuronnames', 'POST',
    {skids: Object.keys(models)},
    function(status, text) {
      if (200 !== status) return;
      var json = $.parseJSON(text);
      var o = {};
      Object.keys(json).forEach(function(skid) {
        o[indices[skid]] = skid;
      });
      var new_models = {};
      self.skeletons = [];
      self.skeleton_ids = {};
      Object.keys(o).map(Number).sort(function(a, b) { return a - b; }).forEach(function(index) {
        var skid = o[index],
            model = models[skid];
        if (model.baseName !== json[skid]) {
          new_models[skid] = model;
          model.baseName = json[skid];
        }
        self.skeletons.push(models[skid]);
        self.skeleton_ids[skid] = self.skeletons.length -1;
      });

      // Retrieve review status
      skeleton_ids = skeleton_ids.concat(Object.keys(new_models));
      var postData = {
          skeleton_ids: skeleton_ids,
          whitelist: self.review_filter === 'Team'};
      if (self.review_filter === 'Self') postData.user_ids = [session.userid];
      requestQueue.register(django_url + project.id + '/skeleton/review-status', 'POST',
        postData,
        CATMAID.jsonResponseHandler(function(json) {
          // Update review information
          skeleton_ids.forEach(function(skeleton_id) {
            var counts = json[skeleton_id];
            self.reviews[skeleton_id] = parseInt(Math.floor(100 * counts[1] / counts[0]));
          }, this);
          // Update user interface
          self.gui.update();
          self.updateLink(new_models);
        }));
    });
};

SelectionTable.prototype.getSkeletonColor = function( id ) {
  var sk = this.getSkeletonModel(id);
  if (sk) return sk.color.clone();
};

/** Return an array of selected Skeleton IDs. */
SelectionTable.prototype.getSelectedSkeletons = function() {
  return this.filteredSkeletons(true).map(function(s) { return s.id; });
};

SelectionTable.prototype.hasSkeleton = function(skeleton_id) {
  return skeleton_id in this.skeleton_ids;
};

SelectionTable.prototype.getSelectedSkeletonNames = function() {
  return this.skeletons.reduce(function(o, skeleton) {
    if (skeleton.selected) o[skeleton.id] = skeleton.baseName;
    return o;
  }, {});
};

SelectionTable.prototype.setVisbilitySettingsVisible = function(visible) {
  this.gui.setVisbilitySettingsVisible(visible);
};

SelectionTable.prototype.setVisible = function(skeleton_ids, visible) {
  skeleton_ids.forEach(function(skid) {
    if (skid in this.skeleton_ids) {
      this.skeletons[this.skeleton_ids[skid]].selected = visible;
    }
  }, this);
  this.gui.update();
};

SelectionTable.prototype.get_all_skeletons = function() {
  return Object.keys( this.skeleton_ids );
};

SelectionTable.prototype.GUI = function(table) {
  this.table = table;
  this.page = 0;
  this.entriesPerPage = 25;
  this.showVisibilityControls = true;
};

SelectionTable.prototype.GUI.prototype = {};

SelectionTable.prototype.GUI.prototype.setVisbilitySettingsVisible = function(visible) {
  var tableSelector = "table#skeleton-table" + this.table.widgetID;
  if ($.fn.DataTable.isDataTable(tableSelector)) {
    this.showVisibilityControls = visible;
    var datatable = $(tableSelector).DataTable();
    datatable.columns([5, 6, 7, 8]).visible(visible);
    datatable.columns.adjust().draw( false ); // adjust column sizing and redraw
  }
};

SelectionTable.prototype.GUI.prototype.clear = function() {
  this.update();
};

/**
 * Make the UI reload all cached data and refresh the display.
 */
SelectionTable.prototype.GUI.prototype.invalidate = function() {
  var tableSelector = "table#skeleton-table" + this.table.widgetID;
  if ($.fn.DataTable.isDataTable(tableSelector)) {
    var datatable = $(tableSelector).DataTable();
    if (datatable) {
      datatable.rows().invalidate();
    }
  }
};

SelectionTable.prototype.GUI.prototype.update_skeleton_color_button = function(skeleton) {
  var button = $('#skeletonaction-changecolor-' + this.table.widgetID + '-' + skeleton.id);
  var color = '#' + skeleton.color.getHexString();
  button.css("background-color", color);
  // Set data of table cell for sorting and invalidate it to update data table
  button.closest('td').attr('data-color', color);
};

/** Remove all, and repopulate with the current range. */
SelectionTable.prototype.GUI.prototype.update = function() {

  var skeletons = this.table.filteredSkeletons(false),
      skeleton_ids = skeletons.reduce(function(o, sk, i) { o[sk.id] = i; return o; }, {});

  // Update GUI state
  var widgetID = this.table.widgetID;

  // Remember number of entries on page and destroy table, if it exists.
  var tableSelector = "table#skeleton-table" + widgetID;
  if ($.fn.DataTable.isDataTable(tableSelector)) {
    var datatable = $(tableSelector).DataTable();
    if (datatable) {
      this.page = datatable.page();
      this.entriesPerPage = datatable.page.len();
      this.order = datatable.order();
      datatable.destroy();
    }
  }

  // Remove all table rows
  $("tr[id^='skeletonrow" + widgetID + "']").remove();

  // Re-create table, let DataTables take care of paging
  var reviews = this.table.reviews;
  var data = skeletons.reduce(function(d, s, i) {
    d[i] = {
      index: i, // For initial sorting
      skeleton: s,
      name: NeuronNameService.getInstance().getName(s.id),
      reviewPercentage: reviews[s.id],
    };
    return d;
  }, new Array(skeletons.length));

  var createCheckbox = function(key, skeleton) {
    var id = 'skeleton' + key + widgetID + '-' + skeleton.id;
    return '<input type="checkbox" class="action-visibility" id="' + id +
      '" value="' + skeleton.id + '" data-action="' + key + '"' +
      (skeleton[key] ? ' checked' : '') + ' />';
  };

  var table = $("table#skeleton-table" + widgetID ).DataTable({
    data: data,
    destroy: true,
    dom: "lrptip",
    paging: true,
    displayStart: this.entriesPerPage * this.page,
    pageLength: this.entriesPerPage,
    lengthMenu: [[10, 25, 100, -1], [10, 25, 100, "All"]],
    processing: true,
    serverSide: false,
    autoWidth: false,
    order: this.order,
    orderCellsTop: true,
    columns: [
      {
        "type": "text",
        "visible": false,
        "render": function(data, type, row, meta) {
          return row.index + '';
        }
      },
      {
        "orderable": false,
        "render": function(data, type, row, meta) {
          return '<span class="ui-icon ui-icon-close action-remove" alt="Remove" title="Remove"></span>';
        }
      },
      {
        "type": "text",
        "render": function(data, type, row, meta) {
          return '<a href="#" class="neuron-selection-link action-select">' +
            (row.name ? row.name : "undefined") + '</a>';
        }
      },
      {
        "type": "text",
        "render": function(data, type, row, meta) {
          return row.reviewPercentage + "%";
        }
      },
      {
        "orderDataType": "dom-checkbox",
        "render": function(data, type, row, meta) {
          return createCheckbox('selected', row.skeleton);
        }
      },
      {
        "orderDataType": "dom-checkbox",
        "visible": this.showVisibilityControls,
        "render": function(data, type, row, meta) {
          return createCheckbox('pre_visible', row.skeleton);
        }
      },
      {
        "orderDataType": "dom-checkbox",
        "visible": this.showVisibilityControls,
        "render": function(data, type, row, meta) {
          return createCheckbox('post_visible', row.skeleton);
        }
      },
      {
        "orderDataType": "dom-checkbox",
        "visible": this.showVisibilityControls,
        "render": function(data, type, row, meta) {
          return createCheckbox('text_visible', row.skeleton);
        }
      },
      {
        "orderDataType": "dom-checkbox",
        "visible": this.showVisibilityControls,
        "render": function(data, type, row, meta) {
          return createCheckbox('meta_visible', row.skeleton);
        }
      },
      {
        "orderDataType": "dom-color-property",
        "type": "hslcolor",
        "render": function(data, type, row, meta) {
          return '<button value="color" class="action-changecolor" ' +
              'id="skeletonaction-changecolor-' + widgetID + '-' + row.skeleton.id +
              '" style="background-color: #' + row.skeleton.color.getHexString() +
              '">color</button>' +
              '<div style="display: none" id="color-wheel' + widgetID + '-' + row.skeleton.id +
              '"><div><label><input type="checkbox" />all selected</label></div><div class="colorwheel"></div></div>';
        }
      },
      {
        "orderable": false,
        "render": function(data, type, row, meta) {
          return '<span class="ui-icon ui-icon-tag action-annotate" ' +
            'alt="Annotate" title="Annotate skeleton"></span>' +
            '<span class="ui-icon ui-icon-info action-info" alt="Info" ' +
            'title="Open skeleton information"></span>' +
            '<span class="ui-icon ui-icon-folder-collapsed action-navigator" ' +
            'alt="Navigator" title="Open neuron navigator for skeleton"></span>';
        }
      }
    ],
    createdRow: function(row, data, index) {
      var tds = $('td', row);
      // Store skeleton ID in row
      $(row).attr('data-skeleton-id', data.skeleton.id);
      // Add 'expanding' class to name cell
      tds.eq(1).addClass('expanding');
      // Add review background color
      tds.eq(2).css('background-color',
          CATMAID.ReviewSystem.getBackgroundColor(data.reviewPercentage));
      // Prepare color wheel cell
      tds.eq(-2).addClass('centering').attr(
          'data-color', data.skeleton.color.getHexString());
      // Prepare action cell
      tds.eq(-1).addClass('centering').css('white-space', 'nowrap');
    }
  });

  // If the skeleton order changed through the datatable, propagate this change
  // back to the internal skeleton ID list.
  table.on("order.dt", this, function(e) {
    // Get the current order of skeletons
    var data = $(this).DataTable().rows({order: 'current'}).data().toArray();
    // Update the widget's internal representation
    var widget = e.data.table;
    widget.skeletons = data.map(function(d) {
      return d.skeleton;
    });
    widget.skeleton_ids = widget.skeletons.reduce(function(o, sk, i) {
      o[sk.id] = i;
      return o;
    }, {});
  });

  // On every redraw make sure no color wheel is still attached to a skeleton
  table.on("draw.dt", this, function(e) {
      // Remove all color wheels
      e.data.table.skeletons.forEach(function(s) {
        if (s.cw) {
          delete s.cw;
        }
      });
  });

  // If the active skeleton is within the range, highlight it
  var selectedSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
  if (selectedSkeletonId) this.table.highlight(selectedSkeletonId);
};

SelectionTable.prototype.selectSkeletonById = function(id) {
  if (id in this.skeleton_ids) {
    this.selectSkeleton(this.skeletons[this.skeleton_ids[id]], true);
  }
};

SelectionTable.prototype.selectSkeleton = function( skeleton, vis ) {
  $('#skeletonselect' + this.widgetID + '-' + skeleton.id).prop('checked', vis);
  skeleton.setVisible(vis);
  this.notifyLink(skeleton);
};

SelectionTable.prototype.measure = function() {
  var models = this.getSelectedSkeletonModels();
  if (0 === Object.keys(models).length) return;

  if (this.measurements_table && this.measurements_table.table) {
    this.measurements_table.append(models);
  } else {
    WindowMaker.show('skeleton-measurements-table');
    this.measurements_table = CATMAID.SkeletonMeasurementsTable.prototype.getLastInstance();
    this.measurements_table.append(models);
  }
};

/** Filtering by an empty text resets to no filtering. */
SelectionTable.prototype.filterBy = function(text) {
  if (!text || 0 === text.length) {
    delete this.match;
  } else {
    this.match = text;
  }
  this.gui.update();
};

/** Returns an array of Skeleton instances,
 * filtered by this.match if the latter exists,
 * and containing only those selected if so indicated by only_selected. */
SelectionTable.prototype.filteredSkeletons = function(only_selected) {
  if (0 === this.skeletons.length) return this.skeletons;
  if (this.match) {
    try {
      return this.skeletons.filter(function(skeleton) {
        if (only_selected && !skeleton.selected) return false;
        var matches = NeuronNameService.getInstance().getName(skeleton.id).match(this);
        return matches && matches.length > 0;
      }, new RegExp(this.match));
    } catch (e) {
      alert(e.message);
      return [];
    }
  }
  if (only_selected) return this.skeletons.filter(function(skeleton) { return skeleton.selected; });
  return this.skeletons;
};

SelectionTable.prototype.batchColorSelected = function(rgb, alpha, colorChanged, alphaChanged) {
  var c = [parseInt(rgb.r) / 255.0,
           parseInt(rgb.g) / 255.0,
           parseInt(rgb.b) / 255.0];
  this.getSelectedSkeletons().forEach(function(skid) {
    var skeleton = this.skeletons[this.skeleton_ids[skid]];
    if (colorChanged) {
      // Set color only if it was actually changed
      skeleton.color.setRGB(c[0], c[1], c[2]);
    }
    skeleton.opacity = alpha;
    this.notifyLink(skeleton); // TODO need a batchNotifyLink
  }, this);
  $('#selection-table-batch-color-button' + this.widgetID)[0].style.backgroundColor = rgb.hex;
  this.gui.invalidate();
};

SelectionTable.prototype.toggleBatchColorWheel = function() {
  var div = $('#selection-table-batch-color-wheel' + this.widgetID);
  if (this.batch_cw) {
    // hide it
    delete this.batch_cw;
    $('#selection-table-batch-color-wheel' + this.widgetID).hide();
    div.empty();
  } else {
    // show it
    this.batch_cw = Raphael.colorwheel(div[0], 150);
    var c = $('#selection-table-batch-color-button' + this.widgetID)[0].style.backgroundColor;
    var rgb = c.substring(c.indexOf('(') + 1, c.lastIndexOf(')')).split(',').map(Number);
    this.batch_cw.color(this._rgbarray2hex(rgb));
    this.batch_cw.onchange(this.batchColorSelected.bind(this));
    $('#selection-table-batch-color-wheel' + this.widgetID).show();
  }
};


/** credit: http://stackoverflow.com/questions/638948/background-color-hex-to-javascript-variable-jquery */
SelectionTable.prototype._rgb2hex = function(rgb) {
  rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  var hex = function(x) {
    return ("0" + parseInt(x).toString(16)).slice(-2);
  };
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
