/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  InstanceRegistry,
  project,
  requestQueue,
  session,
  Set,
  SkeletonAnnotations,
  WindowMaker,
  Set
*/

(function(CATMAID) {

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
    this.batchColor = '#ffff00';
    this.batchOpacity = 1.0;
    this.order = [[0, 'asc']];
    this.annotationFilter = null;
    this.appendWithBatchColor = false;
    this.gui = new this.GUI(this);

    // Listen to change events of the active node and skeletons
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.selectActiveNode, this);
  };

  SelectionTable._lastFocused = null; // Static reference to last focused instance

  SelectionTable.prototype = {};
  $.extend(SelectionTable.prototype, new InstanceRegistry());
  $.extend(SelectionTable.prototype, new CATMAID.SkeletonSource());
  CATMAID.asColorizer(SelectionTable.prototype);

  SelectionTable.prototype.highlighting_color = "#d6ffb5";

  SelectionTable.prototype.getName = function() {
    return "Selection " + this.widgetID;
  };

  SelectionTable.prototype.destroy = function() {
    this.clear();
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
    if (SelectionTable._lastFocused === this) SelectionTable._lastFocused = null;
    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.selectActiveNode, this);
  };

  SelectionTable.prototype.updateModels = function(models, source_chain) {
    var addedModels = {};
    var updatedModels = {};
    Object.keys(models).forEach(function(skid) {
      var model = models[skid];
      if (skid in this.skeleton_ids) {
        var m = model.clone();
        this.skeletons[this.skeleton_ids[m.id]] = m;
        updatedModels[m.id] = m;
      } else {
        addedModels[skid] = model;
      }
    }, this);

    if (CATMAID.tools.isEmpty(addedModels)) {
      this.gui.update();
    } else {
      this.append(addedModels);
    }

    if (!CATMAID.tools.isEmpty(updatedModels)) {
      this.triggerChange(updatedModels);
    }
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

          var users = CATMAID.User.all();
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
             (1 === skeleton_ids.length) ? CATMAID.NeuronNameService.getInstance().getName(skeleton_ids[0]) : skeleton_ids.length],
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
    if (!CATMAID.tools.isEmpty(updated)) {
      this.triggerChange(updated);
    }
    // Update UI
    this.gui.invalidate();
    this.updateTableInfo();
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
    // Update UI
    this.gui.invalidate();
    // Notify change
    if (skeletons.length > 0) {
      var updated = CATMAID.tools.listToIdMap(skeletons.map(function(s) {
        return s.clone();
      }));
      this.triggerChange(updated);
    }
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
      models[id] = new CATMAID.SkeletonModel(id, sks[id], this.pickColor());
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
    requestQueue.register(django_url + project.id + '/skeletons/review-status', 'POST',
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

        var addedModels = {};
        var updatedModels = {};

        valid_skeletons.forEach(function(skeleton_id) {
          // Make sure existing widget settings are respected
          var model = models[skeleton_id];
          model.meta_visible = this.all_items_visible['meta'];
          model.text_visible = this.all_items_visible['text'];
          model.pre_visible = this.all_items_visible['pre'];
          model.post_visible = this.all_items_visible['post'];

          if (this.appendWithBatchColor) {
            model.color.setStyle(this.batchColor);
            model.opacity = this.batchOpacity;
          }

          if (skeleton_id in this.skeleton_ids) {
            // Update skeleton
            this.skeletons[this.skeleton_ids[skeleton_id]] = model;
            updatedModels[skeleton_id] = model;
            return;
          }
          this.skeletons.push(model);
          var counts = json[skeleton_id];
          this.reviews[skeleton_id] = parseInt(Math.floor(100 * counts[1] / counts[0]));
          this.skeleton_ids[skeleton_id] = this.skeletons.length -1;
          addedModels[skeleton_id] = model;
          // Force update of annotations as soon as they are used
          this.annotationMapping = null;
        }, this);

        // Add skeletons
        CATMAID.NeuronNameService.getInstance().registerAll(this, models,
            this.gui.update.bind(this.gui));

        if (!CATMAID.tools.isEmpty(addedModels)) {
          this.triggerAdd(addedModels);
        }

        if (!CATMAID.tools.isEmpty(updatedModels)) {
          this.triggerChange(updatedModels);
        }

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
    this.gui.invalidate();
  };

  /**
   * Make GUI update the table's status information.
   */
  SelectionTable.prototype.updateTableInfo = function() {
    this.gui.updateTableInfo();
  };

  /** ids: an array of Skeleton IDs. */
  SelectionTable.prototype.removeSkeletons = function(ids) {
    var removedModels = {};
    if (1 === ids.length) {
      var skid = ids[0];
      if (skid in this.skeleton_ids) {
        // Remove element
        var m = this.skeletons.splice(this.skeleton_ids[skid], 1);
        if (0 === m.length) {
          throw new CATMAID.ValueError("No skeleton available for given index");
        }
        removedModels[skid] = m[0];
      }
    } else {
      var ids_set = ids.reduce(function(o, id) { o[id] = null; return o; }, {});
      // Recreate skeletons array
      this.skeletons = this.skeletons.filter(function(sk) {
        var remove = sk.id in ids_set;
        if (remove) {
          removedModels[sk.id] = sk;
        }
        return !remove;
      });
    }

    // Recreate map of indices
    this.skeleton_ids = this.skeletons.reduce(function(o, sk, i) {
      o[sk.id] = i;
      return o;
    }, {});

    this.gui.update();

    if (!CATMAID.tools.isEmpty(removedModels)) {
      this.triggerRemove(removedModels);
    }
  };

  SelectionTable.prototype.clear = function(source_chain) {
    var removedModels = CATMAID.tools.listToIdMap(this.skeletons);
    this.skeletons = [];
    this.skeleton_ids = {};
    this.reviews = {};
    this.gui.clear();
    this.next_color_index = 0;
    this.annotationMapping = null;

    if (!CATMAID.tools.isEmpty(removedModels)) {
      this.triggerRemove(removedModels);
    }
  };
   
  /** Set the color of all skeletons based on the state of the "Color" pulldown menu. */
  SelectionTable.prototype.randomizeColorsOfSelected = function() {
    this.next_color_index = 0; // reset
    var updatedSkeletonIDs = this.filteredSkeletons(true).map(function(skeleton) {
      skeleton.color = this.pickColor();
      return skeleton.id;
    }, this);

    if (updatedSkeletonIDs.length > 0) {
      this.triggerChange(this.getSelectedSkeletonModels());
    }
    // Update UI
    this.gui.invalidate(updatedSkeletonIDs);
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
      if (skeletons.length > 0) {
        this.triggerChange(this.getSelectedSkeletonModels());
        // Update UI
        this.gui.invalidate();
      }
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
    var prev_skeleton_ids = Object.keys(models);

    requestQueue.register(django_url + project.id + '/skeleton/neuronnames', 'POST',
      {skids: Object.keys(models)},
      function(status, text) {
        if (200 !== status) return;
        var json = $.parseJSON(text);
        var o = {};
        Object.keys(json).forEach(function(skid) {
          o[indices[skid]] = skid;
        });

        self.skeletons = [];
        self.skeleton_ids = {};

        var updated_models = {};
        Object.keys(o).map(Number).sort(function(a, b) { return a - b; }).forEach(function(index) {
          var skid = o[index],
              model = models[skid];
          if (model.baseName !== json[skid]) {
            model.baseName = json[skid];
            updated_models[skid] = model;
          }
          self.skeletons.push(models[skid]);
          self.skeleton_ids[skid] = self.skeletons.length -1;
        });

        // Let the user know, if there are now less skeletons than before.
        var removedNeurons = prev_skeleton_ids.length - self.skeletons.length;
        var removed_models;
        if (removedNeurons > 0) {
          removed_models = prev_skeleton_ids.reduce(function(o, skid) {
            var s = models[skid]; if (s) { o[skid] = s; } return o;
          }, {});
          CATMAID.warn(removedNeurons + " neuron(s) were removed");
        }

        // Retrieve review status, if there are any skeletons
        if (self.skeletons.length > 0 ) {
          var skeleton_ids = Object.keys(self.skeleton_ids);
          var postData = {
              skeleton_ids: skeleton_ids,
              whitelist: self.review_filter === 'Team'};
          if (self.review_filter === 'Self') postData.user_ids = [session.userid];
          requestQueue.register(django_url + project.id + '/skeletons/review-status', 'POST',
            postData,
            CATMAID.jsonResponseHandler(function(json) {
              // Update review information
              skeleton_ids.forEach(function(skeleton_id) {
                var counts = json[skeleton_id];
                self.reviews[skeleton_id] = parseInt(Math.floor(100 * counts[1] / counts[0]));
              }, this);
              // Update user interface
              self.gui.update();
            }));
        } else {
          // Update user interface
          self.gui.update();
        }

        if (!CATMAID.tools.isEmpty(updated_models)) {
          self.triggerChange(updated_models);
        }

        if (!CATMAID.tools.isEmpty(removed_models)) {
          self.triggerRemove(removed_models);
        }
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
    this.datatable = null;
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
   * Make the UI reload all cached data and refresh the display. If skeletonIDs is
   * an array with skeleton IDs, only rows representing these skeletons will be
   * invalidated.
   */
  SelectionTable.prototype.GUI.prototype.invalidate = function(skeletonIDs) {
    var tableSelector = "table#skeleton-table" + this.table.widgetID;
    if ($.fn.DataTable.isDataTable(tableSelector)) {
      var datatable = $(tableSelector).DataTable();
      if (datatable) {
        var filter;
        if (skeletonIDs) {
          filter = skeletonIDs.map(function(skid) {
            return '[data-skeleton-id=' + skid + ']';
          });
        }
        datatable.rows(filter).invalidate();
      }
    }
  };

  /**
   * Update the table's status information.
   */
  SelectionTable.prototype.GUI.prototype.updateTableInfo = function() {
    // Select info sibling of table
    var infoContainer = $('table#skeleton-table' + this.table.widgetID +
        ' + div.dataTables_info');
    infoContainer.text(this.getTableInfo());
  };

  /**
   * Get a string representation of the table's status.
   */
  SelectionTable.prototype.GUI.prototype.getTableInfo = function() {
    var info;
    var tableSelector = "table#skeleton-table" + this.table.widgetID;
    if ($.fn.DataTable.isDataTable(tableSelector)) {
      var datatable = $(tableSelector).DataTable();
      if (datatable) {
        var nSelected =  this.table.skeletons.reduce(function(n, s) {
          return s.selected ? n + 1 : n;
        }, 0);
        var i = datatable.page.info();
        // Add selection info
        info = "Selected " + nSelected + " and showing " + (i.end - i.start) +
            " of " + i.recordsDisplay + " neurons";
        if (i.recordsTotal !== i.recordsDisplay) {
          info += " (filtered from " + i.recordsTotal + " total neurons)";
        }
      }
    }
    return info;
  };

  /**
   * Initialize a new datatable, if there was non created, yet. Update the
   * existing table otherwise.
   */
  SelectionTable.prototype.GUI.prototype.update = function() {
    if (this.datatable) {
      // Reload data from widget without resetting the paging
      this.datatable.ajax.reload(null, false);
    } else {
      // Initialize a new DataTable instance
      this.init();
    }
  };

  /**
   * Remove all and initialize a new datatable that gets its content from the
   * widget.
   */
  SelectionTable.prototype.GUI.prototype.init = function() {
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
    this.datatable = null;

    // Remove all table rows
    $("tr[id^='skeletonrow" + widgetID + "']").remove();

    var createCheckbox = function(key, skeleton) {
      var id = 'skeleton' + key + widgetID + '-' + skeleton.id;
      return '<input type="checkbox" class="action-visibility" id="' + id +
        '" value="' + skeleton.id + '" data-action="' + key + '"' +
        (skeleton[key] ? ' checked' : '') + ' />';
    };

    this.datatable = $("table#skeleton-table" + widgetID ).DataTable({
      destroy: true,
      dom: "lrptip",
      paging: true,
      infoCallback: this.getTableInfo.bind(this),
      displayStart: this.entriesPerPage * this.page,
      pageLength: this.entriesPerPage,
      lengthMenu: [[10, 25, 100, -1], [10, 25, 100, "All"]],
      processing: true,
      // Load data from widget through ajax option. This allows for complete
      // control over the data and allows for manual filtering and sorting.
      serverSide: true,
      ajax: (function(data, callback, settings) {
        // Sort data if ordering changed
        var col = data.order[0].column;
        var dir = data.order[0].dir;
        if (!this.table.order || this.table.order[0][0] !== col ||
            this.table.order[0][1] !== dir) {
          var desc = dir === 'desc';
          // Use only first level sort
          if (2 === col) { // Name
            this.table.sortByName(desc);
          } else if (3 === col) { // Review
            this.table.sortByReview(desc);
          } else if (4 === col) { // Selected
            this.table.sortBySelected(desc);
          } else if (9 === col) { // Color
            this.table.sortByColor(desc);
          }

          // Save new ordering
          this.table.order = [[col, dir]];
        }

        // Filtering
        var filteredSkeletons = this.table.filteredSkeletons(false);

        // Pagination, if data.length is -1, all skeletons should be displayed
        var skeletonsOnPage;
        if (-1 === data.length) {
          skeletonsOnPage = filteredSkeletons;
        } else {
          var lastIndex = Math.min(filteredSkeletons.length, data.start + data.length);
          skeletonsOnPage = filteredSkeletons.slice(data.start, lastIndex);
        }

        var reviews = this.table.reviews;
        var skeletonData = skeletonsOnPage.reduce(function(d, s, i) {
          d[i] = {
            index: i, // For initial sorting
            skeleton: s,
            reviewPercentage: reviews[s.id],
          };
          return d;
        }, new Array(skeletonsOnPage.length));

        callback({
          draw: data.draw,
          recordsTotal: this.table.skeletons.length,
          recordsFiltered: filteredSkeletons.length,
          data: skeletonData
        });
      }).bind(this),
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
          "render": {
            "display": function(data, type, row, meta) {
              var name = CATMAID.NeuronNameService.getInstance().getName(row.skeleton.id);
              return '<a href="#" class="neuron-selection-link action-select">' +
                (name ? name : "undefined") + '</a>';
            },
            "_": function(data, type, row, meta) {
              var name = CATMAID.NeuronNameService.getInstance().getName(row.skeleton.id);
              return name ? name : "undefined";
            }
          }
        },
        {
          "type": "text",
          "render": function(data, type, row, meta) {
            return row.reviewPercentage + "%";
          }
        },
        {
          "render": function(data, type, row, meta) {
            return createCheckbox('selected', row.skeleton);
          }
        },
        {
          "orderable": false,
          "visible": this.showVisibilityControls,
          "render": function(data, type, row, meta) {
            return createCheckbox('pre_visible', row.skeleton);
          }
        },
        {
          "orderable": false,
          "visible": this.showVisibilityControls,
          "render": function(data, type, row, meta) {
            return createCheckbox('post_visible', row.skeleton);
          }
        },
        {
          "orderable": false,
          "visible": this.showVisibilityControls,
          "render": function(data, type, row, meta) {
            return createCheckbox('text_visible', row.skeleton);
          }
        },
        {
          "orderable": false,
          "visible": this.showVisibilityControls,
          "render": function(data, type, row, meta) {
            return createCheckbox('meta_visible', row.skeleton);
          }
        },
        {
          "type": "hslcolor",
          "render": {
            "_": function(data, type, row, meta) {
              return row.skeleton.color.getHSL();
            },
            "display": function(data, type, row, meta) {
              var color = row.skeleton.color.getHexString();
              var id = 'skeletonaction-changecolor-' + widgetID + '-' + row.skeleton.id;
              return '<button class="action-changecolor" id="' + id  + '" value="#' +
                  color + '" style="background-color: #' + color + ';color: ' +
                  CATMAID.tools.getContrastColor(color) + '">color</button>';
            }
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
      createdRow: (function(row, data, index) {
        var tds = $('td', row);
        // Store skeleton ID in row
        $(row).attr('data-skeleton-id', data.skeleton.id);
        // Add 'expanding' class to name cell
        tds.eq(1).addClass('expanding');
        // Add review background color
        tds.eq(2).css('background-color',
            CATMAID.ReviewSystem.getBackgroundColor(data.reviewPercentage));
        // Prepare color wheel cell
        tds.eq(-2).addClass('centering');
        // Prepare action cell
        tds.eq(-1).addClass('centering').css('white-space', 'nowrap');
        // Highlight if this is the active skeleton
        var activeSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
        if (data.skeleton.id == activeSkeletonId) {
          $(row).css('background-color', this.table.highlighting_color);
        }
      }).bind(this)
    });
  };

  SelectionTable.prototype.selectSkeletonById = function(id) {
    if (id in this.skeleton_ids) {
      this.selectSkeleton(this.skeletons[this.skeleton_ids[id]], true);
    }
  };

  SelectionTable.prototype.selectSkeleton = function( skeleton, vis ) {
    $('#skeletonselect' + this.widgetID + '-' + skeleton.id).prop('checked', vis);
    skeleton.setVisible(vis);
    this.triggerChange(CATMAID.tools.idMap(skeleton));
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
  SelectionTable.prototype.filterBy = function(name, annotation) {
    if (!name || 0 === name.length) {
      delete this.nameMatch;
    } else {
      this.nameMatch = name;
    }
    if (!annotation || 0 === annotation.length) {
      this.annotationFilter = null;
    } else {
      // Build a regular expression for the search
      var pattern = '/' === annotation.substr(0, 1) ? annotation.substr(1) :
          CATMAID.tools.escapeRegEx(annotation);
      this.annotationFilter = new RegExp(pattern);

      // Update local annotation information
      if (!this.annotationMapping) {
        // Get all data that is needed for the fallback list
        requestQueue.register(django_url + project.id + '/skeleton/annotationlist',
          'POST',
          {
            skeleton_ids: Object.keys(this.skeleton_ids),
            metaannotations: 0,
            neuronnames: 0,
          },
          CATMAID.jsonResponseHandler((function(json) {
            // Store mapping and update UI
            this.annotationMapping = new Map();
            for (var skeletonID in json.skeletons) {
              // We know that we want to use this for filtering, so we can store
              // the annotation names directly.
              var annotations = json.skeletons[skeletonID].annotations.map(function(a) {
                return json.annotations[a.id];
              });
              this.annotationMapping.set(parseInt(skeletonID, 10), annotations);
            }
            this.gui.update();
          }).bind(this)));
        // Return without update
        return;
      }
    }
    this.gui.update();
  };

  /** Returns an array of Skeleton instances,
   * filtered by this.match if the latter exists,
   * and containing only those selected if so indicated by only_selected. */
  SelectionTable.prototype.filteredSkeletons = function(only_selected) {
    if (0 === this.skeletons.length) return this.skeletons;

    var filteredSkeletons = this.skeletons;

    // Filter selected
    if (only_selected) {
      filteredSkeletons = filteredSkeletons.filter(function(skeleton) {
        return skeleton.selected;
      });
    }

    // Filter skeletons by name
    if (this.nameMatch) {
      try {
        // If the search string starts with a slash, treat it as a regular
        // expression. Otherwise do a simple search in the neuron name.
        if (this.nameMatch.substr(0, 1) === '/') {
          filteredSkeletons = filteredSkeletons.filter(function(skeleton) {
            var nameMatch = CATMAID.NeuronNameService.getInstance().getName(skeleton.id).match(this);
            return nameMatch && nameMatch.length > 0;
          }, new RegExp(this.nameMatch.substr(1)));
        } else {
          filteredSkeletons = filteredSkeletons.filter(function(skeleton) {
            return -1 !== CATMAID.NeuronNameService.getInstance().getName(skeleton.id).indexOf(this);
          }, this.nameMatch);
        }
      } catch (e) {
        CATMAID.error(e.message, e);
        return [];
      }
    }

    // Filter skeletons by annotation
    if (this.annotationFilter) {
      try {
        filteredSkeletons = filteredSkeletons.filter(function(skeleton) {
          // Keep skeleton if at least one of its annotations matches the
          // regular expression.
          var annotations = this.annotationMapping.get(skeleton.id);
          if (annotations) {
            return annotations.some(function(annotation) {
              return this.test(annotation);
            }, this.annotationFilter);
          }
          return false;
        }, this);
      } catch (e) {
        CATMAID.error(e.message, e);
        return [];
      }
    }

    return filteredSkeletons;
  };

  SelectionTable.prototype.sort = function(sortingFn, update) {
    this.skeletons.sort(sortingFn);

    // Refresh indices
    this.skeleton_ids = this.skeletons.reduce(function(o, sk, i) {
      o[sk.id] = i;
      return o;
    }, {});

    if (update) {
      this.gui.update();
    }
  };

  SelectionTable.prototype.sortByName = function(desc) {
    var factor = desc ? -1 : 1;
    this.sort(function(sk1, sk2) {
      var name1 = CATMAID.NeuronNameService.getInstance().getName(sk1.id).toLowerCase(),
          name2 = CATMAID.NeuronNameService.getInstance().getName(sk2.id).toLowerCase();
      return factor * CATMAID.tools.compareStrings(name1, name2);
    });
  };

  SelectionTable.prototype.sortByReview = function(desc) {
    var factor = desc ? -1 : 1;
    var self = this;
    this.sort(function(sk1, sk2) {
      var r1 = self.reviews[sk1.id];
      var r2 = self.reviews[sk2.id];
      return factor * (r1 < r2 ? -1 : (r1 > r2 ? 1 : 0));
    });
  };

  SelectionTable.prototype.sortBySelected = function(desc) {
    var factor = desc ? -1 : 1;
    this.sort(function(sk1, sk2) {
      var s1 = sk1.selected ? 1 : 0;
      var s2 = sk2.selected ? 1 : 0;
      return factor * (s1 < s2 ? -1 : (s1 > s2 ? 1 : 0));
    });
  };

  /** Sort by hue, then saturation, then luminance. */
  SelectionTable.prototype.sortByColor = function(desc) {
    var factor = desc ? -1 : 1;
    this.sort(function(sk1, sk2) {
      var hsl1 = sk1.color.getHSL(),
          hsl2 = sk2.color.getHSL();
      return factor * CATMAID.tools.compareHSLColors(hsl1, hsl2);
    });
  };

  SelectionTable.prototype.colorSkeleton = function(skeletonID, allSelected, rgb,
      alpha, colorChanged, alphaChanged) {
    var skeleton = this.skeletons[this.skeleton_ids[skeletonID]];
    // Only update the color if it was changed
    if (colorChanged) {
      skeleton.color.setRGB(rgb.r, rgb.g, rgb.b);
    }
    if (alphaChanged) {
      skeleton.opacity = alpha;
    }

    if (colorChanged || alphaChanged) {
      this.triggerChange(CATMAID.tools.idMap(skeleton));
    }

    if (allSelected) {
      colorAllSelected(this, skeleton.color, skeleton.opacity);
    }

    function colorAllSelected(table, color, alpha) {
      table.getSelectedSkeletons().forEach(function(skid) {
        var s = table.skeletons[table.skeleton_ids[skid]];
        s.color.copy(color);
        s.opacity = alpha;
      });
      table.triggerChange(table.getSelectedSkeletonModels());
    }

    this.gui.invalidate([skeletonID]);
  };

  SelectionTable.prototype.batchColorSelected = function(rgb, alpha, colorChanged, alphaChanged) {
    var selectedSkeletonIDs = this.getSelectedSkeletons();

    if (colorChanged) {
      this.batchColor = '#' + new THREE.Color(rgb.r, rgb.g, rgb.b).getHexString();
    }
    if (alphaChanged) {
      this.batchOpacity = alpha;
    }

    var changedModels = selectedSkeletonIDs.reduce((function(o, skid) {
      var skeleton = this.skeletons[this.skeleton_ids[skid]];
      if (colorChanged) {
        // Set color only if it was actually changed
        skeleton.color.setRGB(rgb.r, rgb.g, rgb.b);
      }
      skeleton.opacity = alpha;
      o[skid] = skeleton;
      return o;
    }).bind(this), {});
    //$('#selection-table-batch-color-button' + this.widgetID)[0].style.backgroundColor = rgb.hex;
    this.gui.invalidate(selectedSkeletonIDs);
    // Update link if models were changed
    if (colorChanged || alphaChanged) {
      this.triggerChange(changedModels);
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

  /**
   * Open a list of skeletons including their colors from a file.
   */
  SelectionTable.prototype.loadFromFiles = function(files) {
      if (0 === files.length) {
        CATMAID.error("Choose at least one file!");
        return;
      }
      if (files.length > 1) {
        CATMAID.error("Choose only one file!");
        return;
      }

      var name = files[0].name;
      if (name.lastIndexOf('.json') !== name.length - 5) {
        CATMAID.error("File extension must be '.json'");
        return;
      }

      var self = this;
      var reader = new FileReader();
      reader.onload = function(e) {
          var skeletons = JSON.parse(e.target.result);
          // Make sure all skeletons have at least a skeleton ID
          var validSkeletons = skeletons.filter(function(s) {
            return s.skeleton_id !== undefined;
          });
          var skeletonIds = validSkeletons.map(function(s) {
            return s.skeleton_id;
          });
          // Get names
          requestQueue.register(CATMAID.makeURL(project.id + '/skeleton/neuronnames'),
              "POST", {skids: skeletonIds}, CATMAID.jsonResponseHandler(function(json) {
                // Check if there are skeletons missing
                var foundSkeletons = skeletonIds.filter(function(skid) {
                  return undefined !== json[skid];
                });
                var missing = skeletonIds.length - foundSkeletons.length;
                if (missing> 0) {
                  CATMAID.warn("Could not load " + missing + " missing skeleton" +
                      (1 === missing ? "" : "s"));
                }

                // Create models for valid skeletons
                var models = validSkeletons.reduce(function(m, s) {
                  var color = s.color ? s.color : self.batchColor;
                  var name = json[s.skeleton_id];
                  var model = new CATMAID.SkeletonModel(s.skeleton_id, name,
                      new THREE.Color(color));
                  model.opacity = s.opacity ? s.opacity : self.batchOpacity;
                  m[s.skeleton_id] = model;
                  return m;
                }, {});

                // Load models
                self.append(models);
          }));
      };
      reader.readAsText(files[0]);
  };

  /**
   * Save the current list of skeletons including their colors to a file.
   */
  SelectionTable.prototype.saveToFile = function() {
    var today = new Date();
    var defaultFileName = 'catmaid-skeletons-' + today.getFullYear() + '-' +
        (today.getMonth() + 1) + '-' + today.getDate() + '.json';
    var filename = prompt('File name', defaultFileName);
    if (!filename) return;

    // Create a list of all skeletons along with their color and opacity
    var data = this.skeletons.map(function(skeleton) {
      return {
        'skeleton_id': skeleton.id,
        'color': '#' + skeleton.color.getHexString(),
        'opacity': skeleton.opacity
      };
    }, this);

    saveAs(new Blob([JSON.stringify(data, null, ' ')], {type: 'text/plain'}), filename);
  };


  // Export selection table
  CATMAID.SelectionTable = SelectionTable;

})(CATMAID);
