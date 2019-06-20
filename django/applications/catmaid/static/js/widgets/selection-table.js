/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  InstanceRegistry,
  project,
  Set,
  SkeletonAnnotations,
  WindowMaker,
  Set
*/

(function(CATMAID) {

  "use strict";

  var SelectionTable = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);
    this.APPEND_WARNING_THRESHOLD = 1000;

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
    this.orderLocked = false;
    this.linkVisibilities = true;

    // Listen to change events of the active node and skeletons
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.selectActiveNode, this);

    // Listen to annotation change events to update self when needed
    CATMAID.Annotations.on(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
        this.handleAnnotationUpdate, this);
  };

  // Skeleton properties that are referenced at various locations.
  SelectionTable.KnownVisibilities = ['pre', 'post', 'text', 'meta'];
  SelectionTable.KnownVisibilityFields = ['pre_visible', 'post_visible', 'text_visible', 'meta_visible'];

  SelectionTable._lastFocused = null; // Static reference to last focused instance

  SelectionTable.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  SelectionTable.prototype.constructor = SelectionTable;

  $.extend(SelectionTable.prototype, new InstanceRegistry());
  CATMAID.asColorizer(SelectionTable.prototype);

  SelectionTable.prototype.highlighting_color = "#d6ffb5";

  SelectionTable.prototype.getName = function() {
    return "Selection " + this.widgetID;
  };

  SelectionTable.prototype.getWidgetConfiguration = function() {
    return {
      class: "selection-table",
      subscriptionSource: [this],
      createControls: function(buttons) {
        var self = this;
        buttons.appendChild(document.createTextNode('From'));
        buttons.appendChild(CATMAID.skeletonListSources.createSelect(this));

        var load = document.createElement('input');
        load.setAttribute("type", "button");
        load.setAttribute("value", "Append");
        load.onclick = this.loadSource.bind(this);
        buttons.appendChild(load);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = this.clear.bind(this);
        buttons.appendChild(clear);

        var update = document.createElement('input');
        update.setAttribute("type", "button");
        update.setAttribute("value", "Refresh");
        update.onclick = this.update.bind(this);
        buttons.appendChild(update);

        var csvFileButton = buttons.appendChild(CATMAID.DOM.createFileButton(
            'st-file-dialog-' + this.widgetID, false, function(evt) {
              self.loadFromCSVFile(evt.target.files)
                .then(function() {
                  evt.target.value = '';
                });
            }));
        var openCSV = document.createElement('input');
        openCSV.setAttribute("type", "button");
        openCSV.setAttribute("value", "Open CSV");
        openCSV.onclick = function() { csvFileButton.click(); };
        buttons.appendChild(openCSV);

        var fileButton = buttons.appendChild(CATMAID.DOM.createFileButton(
            'st-file-dialog-' + this.widgetID, false, function(evt) {
              self.loadFromJSONFiles(evt.target.files);
            }));
        var open = document.createElement('input');
        open.setAttribute("type", "button");
        open.setAttribute("value", "Open JSON");
        open.onclick = function() { fileButton.click(); }; buttons.appendChild(open);

        var save = document.createElement('input');
        save.setAttribute("type", "button");
        save.setAttribute("value", "Save JSON");
        save.onclick = this.saveToFile.bind(this);
        buttons.appendChild(save);

        var annotate = document.createElement('input');
        annotate.setAttribute("type", "button");
        annotate.setAttribute("value", "Annotate");
        annotate.style.marginLeft = '1em';
        annotate.onclick = this.annotate_skeleton_list.bind(this);
        buttons.appendChild(annotate);

        var annotateName = document.createElement('input');
        annotateName.setAttribute("type", "button");
        annotateName.setAttribute("value", "Add name ann.");
        annotateName.setAttribute('title', 'Add all neuron names as annotations, meta-annotated with "Name"');
        annotateName.onclick = function() {
          self.annotateSkeletonsWithName()
            .then(function() {
              CATMAID.msg("Success", "Added name annotations");
            })
            .catch(CATMAID.handleError);
        };
        buttons.appendChild(annotateName);

        var c = CATMAID.DOM.appendSelect(buttons, null, 'Color scheme ',
            ['CATMAID',
             'category10',
             'category20',
             'category20b',
             'category20c'].concat(Object.keys(colorbrewer)));

        var random = document.createElement('input');
        random.setAttribute("type", "button");
        random.setAttribute("value", "Colorize");
        random.onclick = function() { self.colorizeWith(c.options[c.selectedIndex].text); };
        buttons.appendChild(random);

        var measure = document.createElement('input');
        measure.setAttribute('type', 'button');
        measure.setAttribute('value', 'Measure');
        measure.onclick = this.measure.bind(this);
        buttons.appendChild(measure);

        var summaryInfoButton = document.createElement('input');
        summaryInfoButton.setAttribute('type', 'button');
        summaryInfoButton.setAttribute('value', 'Summary info');
        summaryInfoButton.setAttribute('id', 'selection-table-info' + this.widgetID);
        summaryInfoButton.onclick = this.summary_info.bind(this);
        buttons.appendChild(summaryInfoButton);

        var appendWithBatchColorCb = document.createElement('input');
        appendWithBatchColorCb.setAttribute('type', 'checkbox');
        appendWithBatchColorCb.onchange = function() {
          self.appendWithBatchColor = this.checked;
        };
        var appendWithBatchColor = document.createElement('label');
        appendWithBatchColor.appendChild(appendWithBatchColorCb);
        appendWithBatchColorCb.checked = this.appendWithBatchColor;
        appendWithBatchColor.appendChild(document.createTextNode(
              'Append with batch color'));
        buttons.appendChild(appendWithBatchColor);

        var hideVisibilitySettigsCb = document.createElement('input');
        hideVisibilitySettigsCb.setAttribute('type', 'checkbox');
        hideVisibilitySettigsCb.onchange = function() {
          self.setVisibilitySettingsVisible(this.checked);
        };
        var hideVisibilitySettigs = document.createElement('label');
        hideVisibilitySettigs.appendChild(hideVisibilitySettigsCb);
        hideVisibilitySettigsCb.checked = true;
        hideVisibilitySettigs.appendChild(document.createTextNode(
              'Show visibility controls'));
        buttons.appendChild(hideVisibilitySettigs);

        var lockOrderSettigsCb = document.createElement('input');
        lockOrderSettigsCb.setAttribute('type', 'checkbox');
        lockOrderSettigsCb.onchange = function() {
          self.orderLocked = this.checked;
        };
        var lockOrderSettigs = document.createElement('label');
        lockOrderSettigs.appendChild(lockOrderSettigsCb);
        lockOrderSettigsCb.checked = this.orderLocked;
        lockOrderSettigs.appendChild(document.createTextNode(
              'Lock order'));
        buttons.appendChild(lockOrderSettigs);

        var linkVizSettigsCb = document.createElement('input');
        linkVizSettigsCb.setAttribute('type', 'checkbox');
        linkVizSettigsCb.onchange = function() {
          self.linkVisibilities = this.checked;
        };
        var linkVizSettigs = document.createElement('label');
        linkVizSettigs.setAttribute('title', 'If unchecked, pre/post/text/meta ' +
            'visibility can also be controlled for all skeletons regardless of ' +
            'their visibility.');
        linkVizSettigs.appendChild(linkVizSettigsCb);
        linkVizSettigsCb.checked = this.linkVisibilities;
        linkVizSettigs.appendChild(document.createTextNode(
              'Link visibility'));
        buttons.appendChild(linkVizSettigs);
      },
      createContent: function(content) {
        var self = this;
        var tab = document.createElement('table');
        tab.setAttribute("id", "skeleton-table" + this.widgetID);
        tab.setAttribute("class", "skeleton-table");
        tab.innerHTML =
            '<thead>' +
              '<tr>' +
                '<th>nr</th>' +
                '<th title="Remove one or all neurons"></th>' +
                '<th class="expanding" title="Neuron name">name</th>' +
                '<th title="% reviewed">rev</th>' +
                '<th title="Select a neuron and control its visibility (3D viewer)">selected</th>' +
                '<th title="Control visibility of pre-synaptic connections (3D viewer)">pre</th>' +
                '<th title="Control visibility of post-synaptic connections (3D viewer)">post</th>' +
                '<th title="Control visibility of tags (3D viewer)">text</th>' +
                '<th title="Control visibility of special nodes (3D viewer)">meta</th>' +
                '<th title="Control the color of a neuron (3D viewer)">color</th>' +
                '<th>actions</th>' +
              '</tr>' +
              '<tr>' +
                '<th></th>' +
                '<th><i class="fa fa-close" id="selection-table-remove-all' + this.widgetID + '" title="Remove all"></i></th>' +
                '<th class="expanding"><input type="button" value="Filter" class="filter" />' +
                  '<input class="filter" type="text" title="Use / for regex" placeholder="name filter" id="selection-table-filter' + this.widgetID + '" />' +
                  '<input class="filter" type="text" title="Use / for regex" placeholder="annotation filter" id="selection-table-ann-filter' + this.widgetID + '" /></th>' +
                '<th><select class="review-filter">' +
                  '<option value="Union" selected>Union</option>' +
                  '<option value="Team">Team</option>' +
                  '<option value="Self">Self</option>' +
                '</select></th>' +
                '<th><input type="checkbox" id="selection-table-show-all' + this.widgetID + '" checked /></th>' +
                '<th><input type="checkbox" id="selection-table-show-all-pre' + this.widgetID + '" checked style="float: left" /></th>' +
                '<th><input type="checkbox" id="selection-table-show-all-post' + this.widgetID + '" checked style="float: left" /></th>' +
                '<th><input type="checkbox" id="selection-table-show-all-text' + this.widgetID + '" style="float: left" /></th>' +
                '<th><input type="checkbox" id="selection-table-show-all-meta' + this.widgetID + '" checked style="float: left" /></th>' +
                '<th><button id="selection-table-batch-color-button' + this.widgetID +
                    '" type="button" value="' + this.batchColor + '" style="background-color: ' + this.batchColor + '">Batch color</button></th>' +
                '<th></th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
            '</tbody>';
        content.appendChild(tab);

        $("select.review-filter", tab).on("change",  function () {
          self.review_filter = this.value;
          self.update();
        });
        $("button#selection-table-batch-color-button" + this.widgetID, tab).on("click",
            function() {
              if (CATMAID.ColorPicker.visible()) {
                CATMAID.ColorPicker.hide(this);
                // Apply color on closing, even if the color picker itself wasn't
                // touched. This allows easier re-use of a previously set batch
                // color.
                var rgb = new THREE.Color(self.batchColor);
                self.batchColorSelected(rgb, self.batchOpacity, true, true);
              } else {
                CATMAID.ColorPicker.show(this, {
                  onColorChange: self.batchColorSelected.bind(self),
                  initialColor: self.batchColor,
                  initialAlpha: self.batchOpacity
                });
              }
            });
        $('th input[type=button].filter', tab).on("click", filterNeuronList);
        $('th input[type=text].filter', tab).on("keyup", function(e) {
          if ('Enter' === e.key) filterNeuronList();
        });
        $('th', tab).on("click", this, function(e) {
          // Prevent sorting if order is locked
          var widget = e.data;
          if (widget.orderLocked) {
            e.stopImmediatePropagation();
            CATMAID.warn("Table order is locked");
          }
        });

        /**
         * Trigger list filter.
         */
        function filterNeuronList() {
          var filters = $('th input[type=text].filter', tab);
          var nameFilter = filters[0].value;
          var annotationFilter = filters[1].value;
          self.filterBy(nameFilter, annotationFilter);
        }

        $(tab)
          .on("click", "td .action-remove", this, function(e) {
            var skeletonID = rowToSkeletonID(this);
            e.data.removeSkeletons([skeletonID]);
          })
          .on("click", "td .action-select", this, function(e) {
            var skeletonID = rowToSkeletonID(this);
            CATMAID.TracingTool.goToNearestInNeuronOrSkeleton( 'skeleton', skeletonID );
          })
          .on("click", "td .action-annotate", function() {
            var skeletonID = rowToSkeletonID(this);
            CATMAID.annotate_neurons_of_skeletons([skeletonID]);
          })
          .on("click", "td .action-info", function() {
            var skeletonID = rowToSkeletonID(this);
            CATMAID.SelectionTable.prototype.skeleton_info([skeletonID]);
          })
          .on("click", "td .action-navigator", function() {
            var skeletonID = rowToSkeletonID(this);
            var navigator = new CATMAID.NeuronNavigator();
            WindowMaker.create('neuron-navigator', navigator);
            navigator.set_neuron_node_from_skeleton(skeletonID);
          })
          .on("click", "td .action-moveup", this, function(e) {
            var widget = e.data;
            var skeletonId = rowToSkeletonID(this);
            widget.moveSkeletonUp(skeletonId);
          })
          .on("click", "td .action-movedown", this, function(e) {
            var widget = e.data;
            var skeletonId = rowToSkeletonID(this);
            widget.moveSkeletonDown(skeletonId);
          })
          .on("click", "td input.action-visibility", this, function(e) {
            var table = e.data;
            var skeletonID = rowToSkeletonID(this);
            var action = this.dataset.action;
            var skeleton = table.skeletons[table.skeleton_ids[skeletonID]];
            var visible = this.checked;
            skeleton[action] = visible;

            // The first checkbox controls all others
            if ("selected" === action) {
              ['pre_visible', 'post_visible', 'text_visible', 'meta_visible'].forEach(function(other, k) {
                if (visible && 2 === k) return; // don't make text visible
                skeleton[other] = visible;
                $('#skeleton' + other + table.widgetID + '-' + skeletonID).prop('checked', visible);
              });
              // Update table information
              table.updateTableInfo();
            }
            table.triggerChange(CATMAID.tools.idMap(skeleton));
          })
          .on("click", "td .action-changecolor", this, function(e) {
            var table = e.data;
            var skeletonID = rowToSkeletonID(this);
            CATMAID.ColorPicker.toggle(this, {
              onColorChange: table.colorSkeleton.bind(table, skeletonID, false)
            });
          });

        /**
         * Find the closest table row element and read out skeleton ID.
         */
        function rowToSkeletonID(element) {
          var skeletonID = $(element).closest("tr").attr("data-skeleton-id");
          if (!skeletonID) throw new Error("Couldn't find skeleton ID");
          return skeletonID;
        }
      },
      init: function(win) {
        // Add auto completetion to annotation filter
        CATMAID.annotations.add_autocomplete_to_input(
            $("#selection-table-ann-filter" + this.widgetID));
        this.init();
        this.focus();
      },
      helpPath: 'selection-table.html',
    };
  };

  SelectionTable.prototype.focus = function() {
    this.setLastFocused();
  };

  SelectionTable.prototype.destroy = function() {
    this.clear();
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
    if (SelectionTable._lastFocused === this) SelectionTable._lastFocused = null;
    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.selectActiveNode, this);
    CATMAID.Annotations.off(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
        this.handleAnnotationUpdate, this);
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
    CATMAID.fetch(project.id + '/skeleton/contributor_statistics_multiple', "POST",
        {skids: skeleton_ids})
      .then((function(json) {
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
            ["Multiuser review time (min): ", review_time_string2],
            ["Reviewed skeleton nodes:", format(json.review_contributors)],
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
   * Update internal annotation based controls.
   */
  SelectionTable.prototype.handleAnnotationUpdate = function(targets, annotations) {
    // Update auto completion for input fields
    $("#selection-table-ann-filter" + this.widgetID).autocomplete(
        "option", {source: CATMAID.annotations.getAllNames()});
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
  SelectionTable.getOrCreate = function() {
    var selection = SelectionTable.prototype.getFirstInstance();
    if (!selection) WindowMaker.create('selection-table');
    return SelectionTable.prototype.getFirstInstance();
  };

  SelectionTable.prototype.setLastFocused = function () {
    SelectionTable._lastFocused = this;
  };

  SelectionTable.getLastFocused = function () {
    if (SelectionTable._lastFocused === null)
      SelectionTable._lastFocused = SelectionTable.getOrCreate();

    return SelectionTable._lastFocused;
  };

  SelectionTable.prototype.toggleSelectAllSkeletonsUI = function() {
    this.all_visible = !this.all_visible;
    var updated = {};
    // Update table header
    if (this.linkVisibilities) {
      SelectionTable.KnownVisibilities.forEach(function(suffix, i) {
        if (2 === i && this.all_visible) return; // don't turn on text
        this.all_items_visible[suffix] = this.all_visible;
        $('#selection-table-show-all-' + suffix + this.widgetID).prop('checked',
            this.all_items_visible[suffix]);
      }, this);
    }
    // Update models
    this.filteredSkeletons().forEach(function(skeleton) {
        skeleton.setVisible(this.all_visible);
        if (!this.linkVisibilities) {
          for (let i=0; i<SelectionTable.KnownVisibilities.length; ++i) {
            skeleton[SelectionTable.KnownVisibilityFields[i]] =
                this.all_items_visible[SelectionTable.KnownVisibilities[i]];
          }
        }
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
    var skeletons = this.filteredSkeletons(this.linkVisibilities);
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

    SelectionTable.KnownVisibilities.forEach(function(suffix) {
      $('#selection-table-show-all-' + suffix + this.widgetID).click(this.toggleAllKeyUI.bind(this, suffix));
    }, this);

    this.gui.update();
  };

  /**
   * Move passed in skeleton up in table. Displays a warning if skeleton is not
   * in table.
   *
   * @params {Number} skeletonId Skeleton to move up.
   */
  SelectionTable.prototype.moveSkeletonUp = function(skeletonId) {
    var skeletonIndex = this.skeleton_ids[skeletonId];
    if (-1 === skeletonIndex) {
      CATMAID.warn("Skeleton not in table");
      return;
    }
    if (0 === skeletonIndex) {
      CATMAID.warn("Skeleton is already first in list");
      return;
    }
    var skeleton = this.skeletons[skeletonIndex];
    var previous = this.skeletons[skeletonIndex - 1];
    this.skeletons[skeletonIndex - 1] = skeleton;
    this.skeletons[skeletonIndex] = previous;
    this.refreshSkeletonIndex();
    this.gui.update();
  };

  /**
   * Move passed in skeleton down in table. Displays a warning if skeleton is
   * not in table.
   *
   * @params {Number} skeletonId Skeleton to move up.
   */
  SelectionTable.prototype.moveSkeletonDown = function(skeletonId) {
    var skeletonIndex = this.skeleton_ids[skeletonId];
    if (-1 === skeletonIndex) {
      CATMAID.warn("Skeleton not in table");
      return;
    }
    if ((this.skeletons.length - 1) === skeletonIndex) {
      CATMAID.warn("Skeleton is already last in table");
      return;
    }
    var skeleton = this.skeletons[skeletonIndex];
    var next = this.skeletons[skeletonIndex + 1];
    this.skeletons[skeletonIndex + 1] = skeleton;
    this.skeletons[skeletonIndex] = next;
    this.refreshSkeletonIndex();
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
    return CATMAID.fetch(project.id + '/skeleton/neuronnames', 'POST',
        {skids: ids})
      .then((function(json) {
        this.insertSkeletons(json, callback);
      }).bind(this));
  };

  SelectionTable.prototype.append = function(models) {
    return this._append(models);
  };

  /**
   * Append skeleton models, optionally in an ordered fashion.
   */
  SelectionTable.prototype._append = function(models, orderedSkeletonIds) {
    var skeleton_ids = Object.keys(models);
    if (0 === skeleton_ids.length) {
      CATMAID.info("No skeletons selected!"); // at source
      return;
    }
    if (orderedSkeletonIds) {
      // Make sure that the list of ordered skeleton Ids contain all required
      // skeletons
      let orderSet = new Set(orderedSkeletonIds);
      for (var i=0, imax=skeleton_ids.length; i<imax; ++i) {
        let skeletonId = parseInt(skeleton_ids[i], 10);
        if (!orderSet.has(skeletonId)) {
          throw new CATMAID.ValueError("Missing skeleton " + skeletonId + " inf ordered input list");
        }
      }
      if (skeleton_ids.length !== orderedSkeletonIds.length) {
        throw new CATMAID.ValueError("The number of ordered skeleton Ids doesn't match models");
      }
      skeleton_ids = orderedSkeletonIds;
    }

    // Retrieve review status before doing anything else
    var postData = {
        skeleton_ids: skeleton_ids,
        whitelist: this.review_filter === 'Team'};
    if (this.review_filter === 'Self') postData.user_ids = [CATMAID.session.userid];
    CATMAID.fetch(project.id + '/skeletons/review-status', 'POST', postData)
      .then((function(json) {
        var noReviewInfoSkeletonIds = skeleton_ids.filter(function(skid) {
          return !this[skid];
        }, json);

        var valid_skeletons = skeleton_ids;

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
          var counts = json[skeleton_id] || [1, 0];
          this.reviews[skeleton_id] = parseInt(Math.floor(100 * counts[1] / counts[0]));
          this.skeleton_ids[skeleton_id] = this.skeletons.length -1;
          addedModels[skeleton_id] = model;
          // Force update of annotations as soon as they are used
          this.annotationMapping = null;
        }, this);

        // Add skeletons
        CATMAID.NeuronNameService.getInstance().registerAll(this, models,
            (function () {
              // Make sure current sorting is applied
              this.reapplyOrder();
              this.gui.update();
            }).bind(this));

        if (!CATMAID.tools.isEmpty(addedModels)) {
          this.triggerAdd(addedModels);
        }

        if (!CATMAID.tools.isEmpty(updatedModels)) {
          this.triggerChange(updatedModels);
        }

        // Notify user if not all skeletons are valid
        if (0 !== noReviewInfoSkeletonIds.length) {
          var missing = skeleton_ids.filter(function(skid) {
            return !this[skid];
          }, json);
          var msg = 'Could not find review summary for ' + noReviewInfoSkeletonIds.length +
              ' skeletons: ' + noReviewInfoSkeletonIds.join(', ');
          CATMAID.warn(msg);
          console.log(msg);
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

    CATMAID.fetch(project.id + '/skeleton/neuronnames', 'POST',
        {skids: Object.keys(models)})
      .then(function(json) {
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
          if (self.review_filter === 'Self') postData.user_ids = [CATMAID.session.userid];
          CATMAID.fetch(project.id + '/skeletons/review-status', 'POST', postData)
            .then(function(json) {
              // Update review information
              skeleton_ids.forEach(function(skeleton_id) {
                var counts = json[skeleton_id];
                self.reviews[skeleton_id] = parseInt(Math.floor(100 * counts[1] / counts[0]));
              }, this);
              // Update user interface
              self.gui.update();
            });
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

  SelectionTable.prototype.setVisibilitySettingsVisible = function(visible) {
    this.gui.setVisibilitySettingsVisible(visible);
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

  SelectionTable.prototype.GUI.prototype.setVisibilitySettingsVisible = function(visible) {
    var tableSelector = "table#skeleton-table" + this.table.widgetID;
    if ($.fn.DataTable.isDataTable(tableSelector)) {
      this.showVisibilityControls = visible;
      var datatable = $(tableSelector).DataTable();
      datatable.columns([5, 6, 7, 8]).visible(visible);
      datatable.columns.adjust().draw( false ); // adjust column sizing and redraw
    }
  };

  SelectionTable.prototype.GUI.prototype.clear = function() {
    if (this.datatable) {
      // Reset pagination
      this.datatable.page(0);
    }
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
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
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
          // Save new ordering
          this.table.order = [[col, dir]];
          this.table.reapplyOrder();
        }

        var request = (function() {
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
        }).bind(this);

        if (this.table.annotationFilter) {
          this.table._updateAnnotationMap().then(request)
            .catch(CATMAID.handleError);
        } else {
          request();
        }
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
          "className": "dt-center cm-center",
          "render": function(data, type, row, meta) {
            return '<i class="fa fa-remove fa-fw clickable action-remove" alt="Remove" title="Remove"></i>';
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
          "className": "dt-center cm-center",
          "render": {
            "_": function(data, type, row, meta) {
              return row.skeleton.color.getHSL({});
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
            return '<i class="fa fa-tag fa-fw clickable action-annotate" ' +
              'alt="Annotate" title="Annotate skeleton"></i>' +
              '<i class="fa fa-info-circle fa-fw clickable action-info" alt="Info" ' +
              'title="Open skeleton information"></i>' +
              '<i class="fa fa-folder fa-fw clickable action-navigator" ' +
              'alt="Navigator" title="Open neuron navigator for skeleton"></i>' +
              '<i class="fa fa-caret-up fa-fw clickable action-moveup" ' +
              'alt="Move up" title="Move skeleton up in list"></i>' +
              '<i class="fa fa-caret-down fa-fw clickable action-movedown" ' +
              'alt="Move down" title="Move skeleton down in list"></i>';
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
      this.gui.update();
    } else {
      // Build a regular expression for the search
      var pattern = '/' === annotation.substr(0, 1) ? annotation.substr(1) :
          CATMAID.tools.escapeRegEx(annotation);
      this.annotationFilter = new RegExp(pattern);

      // Make sure local annotation mapping is available and update UI
      this._updateAnnotationMap()
        .then((function() {
          this.gui.update();
        }).bind(this));
    }
  };

  /**
   * Update the local annotation cache.
   */
  SelectionTable.prototype._updateAnnotationMap = function(force) {
    var get;
    if (!this.annotationMapping || force) {
      // Get all data that is needed for the fallback list
      get = CATMAID.fetch(project.id + '/skeleton/annotationlist', 'POST', {
            skeleton_ids: Object.keys(this.skeleton_ids),
            metaannotations: 0,
            neuronnames: 0,
          })
        .then((function(json) {
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
          return this.annotationMapping;
        }).bind(this));
    } else {
      get = Promise.resolve(this.annotationMapping);
    }

    return get;
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

    this.refreshSkeletonIndex();

    if (update) {
      this.gui.update();
    }
  };


  /**
   * Refresh index of skeletons -> skeletons array index.
   */
  SelectionTable.prototype.refreshSkeletonIndex = function() {
    // Refresh indices
    this.skeleton_ids = this.skeletons.reduce(function(o, sk, i) {
      o[sk.id] = i;
      return o;
    }, {});
  };

  /**
   * Re-apply current order to skeleton list.
   */
  SelectionTable.prototype.reapplyOrder = function() {
    var col = this.order[0][0];
    var desc = 'desc' === this.order[0][1];

    // Use only first level sort
    if (2 === col) { // Name
      this.sortByName(desc);
    } else if (3 === col) { // Review
      this.sortByReview(desc);
    } else if (4 === col) { // Selected
      this.sortBySelected(desc);
    } else if (9 === col) { // Color
      this.sortByColor(desc);
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
      var hsl1 = sk1.color.getHSL({}),
          hsl2 = sk2.color.getHSL({});
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

  SelectionTable.prototype.loadFromCSVFile = function(files) {
    if (!CATMAID.containsSingleValidFile(files, 'csv')) {
      return Promise.reject();
    }
    let csvFile = files[0];
    let nLinesToSkip = 0;
    var self = this;

    return CATMAID.parseCSVFile(csvFile, ',', nLinesToSkip)
      .then(function(csvLines) {
        if (csvLines.length === 0) {
          CATMAD.warn('CSV file does not contain any usable lines');
          return;
        }

        // Show dialog with first three lines
        let dialog = new CATMAID.OptionsDialog("Import CSV");
        dialog.appendMessage("The first two lines of the file you are going to " +
            "import are shown below. Please select the appropriate import options.");
        let tableContainer = document.createElement('div');
        tableContainer.classList.add('help');
        let table = document.createElement('table');
        table.style.width = "100%";
        let nPreviewRows = csvLines.length > 1 ? 2 : 1;
        for (var i=0; i<nPreviewRows; ++i) {
          let tr = document.createElement('tr');
          let data = csvLines[i];
          for (var j=0; j<data.length; ++j) {
            let td = document.createElement('td');
            td.appendChild(document.createTextNode(data[j]));
            tr.appendChild(td);
          }
          table.appendChild(tr);
        }
        tableContainer.appendChild(table);
        dialog.appendChild(tableContainer);

        // Get maximum skeleton column number from first row
        var nColumns = csvLines[0].length;

        // Add option to change line skipping
        var lineSkipField = dialog.appendNumericField(
            'Skip first n lines', 'csv-import-line-skip',
            0, 0, csvLines.length - 1, 1);
        // Add option to select column to read skeleton IDs from
        var skeletonIdColumnField = dialog.appendNumericField(
            'Skeleton ID column (1 indexed)', 'csv-import-skeleton-col',
            1, 1, nColumns, 1);

        dialog.onOK = function() {
          let lineSkip = parseInt(lineSkipField.value, 10);
          let skeletonIdColumn = parseInt(skeletonIdColumnField.value, 10) - 1;
          if ((csvLines.length - lineSkip) <= 0) {
            CATMAD.warn('CSV file does not contain any usable lines');
            return;
          }

          // Make sure all skeletons have at least a skeleton ID
          var validSkeletons = csvLines.filter(function(row, i) {
            var val = row[skeletonIdColumn];
            if (i < lineSkip || val === undefined) {
              return false;
            }
            if (val.length) {
              val = val.replace(/["']/, '');
            }
            val = parseInt(val, 10);
            if (Number.isNaN(val)) {
              return false;
            }
            // Store parsed ID in CSV row
            row[skeletonIdColumn] = val;
            return true;
          });
          var skeletonIds = validSkeletons.map(function(row) {
            return row[skeletonIdColumn];
          });

          if (skeletonIds.length === 0) {
            CATMAID.wan('CSV file does not contain any usable lines');
            return;
          }
          // Get names
          CATMAID.fetch(project.id + '/skeleton/neuronnames', 'POST',
              {skids: skeletonIds})
            .then(function(json) {
              // Check if there are skeletons missing
              var foundSkeletons = skeletonIds.filter(function(skid) {
                return undefined !== json[skid];
              });
              var missing = skeletonIds.length - foundSkeletons.length;
              if (missing> 0) {
                if (missing === skeletonIds.length) {
                  CATMAID.warn("Could not find any of the " + missing + " passed in skeleton IDs");
                  return;
                } else {
                  CATMAID.warn("Could not load " + missing + " missing skeleton" +
                      (1 === missing ? "" : "s"));
                }
              }

              // Create models for valid skeletons
              var models = foundSkeletons.reduce(function(m, skeletonId) {
                var model = new CATMAID.SkeletonModel(skeletonId, "",
                    new THREE.Color(self.batchColor));
                model.opacity = self.batchOpacity;
                m[skeletonId] = model;
                return m;
              }, {});

              // Load models, respecting their order
              self._append(models, skeletonIds);
          });
        };

        dialog.show('800', 'auto');
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Open a list of skeletons including their colors from a file.
   */
  SelectionTable.prototype.loadFromJSONFiles = function(files) {
      if (!CATMAID.containsSingleValidFile(files, 'json')) {
        return;
      }

      var self = this;
      var reader = new FileReader();
      reader.onload = function(e) {
          var skeletons = JSON.parse(e.target.result);

          // Check if the parsed data structure is in fact the expected array.
          if (!(skeletons && skeletons instanceof Array)) {
            CATMAID.warn('File has different format than expected');
            return;
          }

          // Make sure all skeletons have at least a skeleton ID
          var validSkeletons = skeletons.filter(function(s) {
            return s.skeleton_id !== undefined;
          });
          var skeletonIds = validSkeletons.map(function(s) {
            return s.skeleton_id;
          });
          // Get names
          CATMAID.fetch(project.id + '/skeleton/neuronnames', 'POST',
              {skids: skeletonIds})
            .then(function(json) {
              // Check if there are skeletons missing
              var foundSkeletons = skeletons.filter(function(s) {
                return undefined !== json[s.skeleton_id];
              });
              var missing = skeletonIds.length - foundSkeletons.length;
              if (missing> 0) {
                CATMAID.warn("Could not load " + missing + " missing skeleton" +
                    (1 === missing ? "" : "s"));
              }

              // Create models for valid skeletons
              var models = foundSkeletons.reduce(function(m, s) {
                var color = s.color ? s.color : self.batchColor;
                var name = json[s.skeleton_id];
                var model = new CATMAID.SkeletonModel(s.skeleton_id, name,
                    new THREE.Color(color));
                model.opacity = s.opacity ? s.opacity : self.batchOpacity;
                m[s.skeleton_id] = model;
                return m;
              }, {});

              // Load models, respecting their order
              self._append(models, foundSkeletons.map(s => s.skeleton_id));
          });
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

    var data = this.filteredSkeletons().map(function(skeleton) {
      return {
        'skeleton_id': skeleton.id,
        'color': '#' + skeleton.color.getHexString(),
        'opacity': skeleton.opacity
      };
    });

    saveAs(new Blob([JSON.stringify(data, null, ' ')], {type: 'text/plain'}), filename);
  };

  // Export selection table
  CATMAID.SelectionTable = SelectionTable;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Selection Table",
    description: "Manage lists of neurons",
    key: 'selection-table',
    creator: SelectionTable
  });

})(CATMAID);
