/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

/* global
 project,
 fetchSkeletons,
 InstanceRegistry,
 SkeletonAnnotations,
 SynapseClustering,
 colorbrewer,
 d3
*/

(function(CATMAID) {

  "use strict";

  var SynapseFractions = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    // Appended neurons
    this.items = []; // An array of CATMAID.SkeletonGroup

    // Neurons receiving less than this number of synapses get stashed into the 'others' heap.
    this.threshold = 5;

    // Restrict partners to only these, stash all others to 'others' 
    this.only = null;

    // Whether to show the 'others' heap
    this.show_others = true;

    // Whether x axis labels should be rotated
    this.rotateXLabels = true;

    this.rotationXLabels = -65;

    // Color partner skeletons using these colors (only when set from the color picker)
    this.partner_colors = {};

    // Function to generate default colors
    this.colorFn = d3.scale.category20();

    // The loaded data for each arbor
    this.morphologies = {};
    // The loaded data for each arbor, filtered with skeleton node filters
    this.filtered_morphologies = {};

    // Map of group ID vs object with keys: id, name, color, and map of skids vs true
    this.groups = {};
    // Group IDs count towards minus inifinity
    this.next_group_id = -1;
    // Map from skeleton ID to group ID
    this.groupOf = {};

    this.mode = this.UPSTREAM;

    // Synapse confidence threshold, defaults to showing all (1 or larger)
    this.confidence_threshold = 1;

    this.other_source = new CATMAID.BasicSkeletonSource(this.getName() + ' partners', {
      owner: this
    });

    // Set of selected partners or partner groups, with shift+click
    this.selected_partners = {};

    // Whether to decorate selected partner boxes with a black contour or not
    this.hideSelectionDecorations = false;

    // Matching function: if an item's name matches, its legend is drawn in bold
    this.highlightFn = null;

    // Set of items to skip displaying, as a map of index vs true, defined by the "Show only" regex
    this.skip = {};

    // Whether to hide those not connected to selected
    this.hide_disconnected_from_selected = false;
    this.disconnected_fn = "all selected";

    // The minimum fraction amount to consider as connected, in percent
    this.connected_threshold = 0; // default 0%

    // Set of items to skip displaying, as a map of index vs true
    this.hide = {};

    this.sort_by_selected_partners = false;
    this.sort_composition_fn = "sum";
    this.sort_keep_equally_named_together = false;

    this.font_size = "11";

    // Some elements of the D3 SVG such as the text of the x-axis, y-axis and legends
    this.svg_elems = null;

    // A set of filter rules to apply to the handled skeletons
    this.filterRules = [];
    // Filter rules can optionally be disabled
    this.applyFilterRules = true;
  };

  SynapseFractions.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  SynapseFractions.prototype.constructor = SynapseFractions;

  $.extend(SynapseFractions.prototype, new InstanceRegistry());

  SynapseFractions.prototype.MODES = ["Downstream", "Upstream"];
  SynapseFractions.prototype.DOWNSTREAM = 1;
  SynapseFractions.prototype.UPSTREAM = 2;

  SynapseFractions.prototype.getWidgetConfiguration = function() {
    return {
      class: "synapse-fractions",
      contentID: "synapse_fractions_widget" + this.widgetID,
      createControls: function(controls) {
        var tabs = CATMAID.DOM.addTabGroup(controls, this.widgetID,
            ['Main', 'Filter/Highlight', 'Filter partners', 'Color', 'Groups', 'Partner groups', 'Options']);

        var partners_source = CATMAID.skeletonListSources.createPushSelect(this, "filter");
        partners_source.onchange = this.onchangeFilterPartnerSkeletons.bind(this);

        var modes = CATMAID.DOM.createSelect("synapse_fraction_mode" + this.widgetID, this.MODES);
        modes.selectedIndex = 1;
        modes.onchange = this.onchangeMode.bind(this, modes);

        var fileButton = CATMAID.DOM.createFileButton('sf-file-dialog-' + this.widgetID, false, (function(evt) { this.loadFromFiles(evt.target.files); }).bind(this));

        CATMAID.DOM.appendToTab(tabs['Main'],
            [[document.createTextNode('From')],
             [CATMAID.skeletonListSources.createSelect(this)],
             ['Append', this.loadSource.bind(this)],
             ['Append as group', this.appendAsGroup.bind(this)],
             ['Clear', this.clear.bind(this)],
             ['Refresh', this.update.bind(this)],
             [document.createTextNode(' - ')],
             [modes],
             [document.createTextNode(' - ')],
             ['Export SVG', this.exportSVG.bind(this)],
             ['Export CSV', this.exportCSV.bind(this)],
             [document.createTextNode(' - ')],
             ['Clone', this.cloneVisible.bind(this)],
             ['Save', this.saveToFile.bind(this)],
             ['Open', function() { fileButton.click(); }],
            ]);

        var compositionFns = CATMAID.DOM.createSelect("sf-composition-fn" + this.widgetID, ["sum", "max"]);
        compositionFns.onchange = (function() {
          this.sort_composition_fn = compositionFns.options[compositionFns.selectedIndex].value;
          this.redraw();
        }).bind(this);

        var disconnectedFns = CATMAID.DOM.createSelect("sf-disconnected-fn" + this.widgetID, ["all selected", "any selected"]);
        disconnectedFns.onchange = (function() {
          this.disconnected_fn = disconnectedFns.options[disconnectedFns.selectedIndex].value;
          this.redraw();
        }).bind(this);

        CATMAID.DOM.appendToTab(tabs['Filter/Highlight'],
            [[document.createTextNode('Show only: ')],
             [CATMAID.DOM.createTextField('sf-filter-by-regex' + this.widgetID, null, null, '', null, this.filterByRegex.bind(this), 10, null)],
             [document.createTextNode(' - Highlight: ')],
             [CATMAID.DOM.createTextField('sf-highlight' + this.widgetID, null, null, '', null, this.highlightByRegex.bind(this), 10, null)],
             ['Remove all highlighted', this.removeAllHighlighted.bind(this)],
             {
               type: 'checkbox',
               label: 'Sort by selected partners',
               title: 'Sort the X-axis according to the sum of fractions of selected partners, which are aggregated using a chosen composition function (default is sum)',
               value: this.sort_by_selected_partners,
               onclick: (function(ev) {
                 this.sort_by_selected_partners = ev.target.checked;
                 this.redraw();
               }).bind(this)
             },
             [document.createTextNode(" Compose with: ")],
             [compositionFns],
             {
               type: 'checkbox',
               label: 'Keep equally named together',
               title: 'When sorting, keep those equally named next to each other',
               id: 'sf-keep-equally-named-together' + this.widgetID,
               value: this.sort_keep_equally_named_together,
               onclick: (function(ev) {
                 this.sort_keep_equally_named_together = ev.target.checked;
                 this.redraw();
               }).bind(this)
             },
             {
               type: 'checkbox',
               label: 'Hide disconnected from',
               title: 'Hide any in the X-axis if they are not connected to selected partners, either to any or to all according to the composition function (default is all)',
               value: this.hide_unconnected_to_selected,
               id: 'sf-hide-disconnected-from-selected' + this.widgetID,
               onclick: (function(ev) {
                 this.hide_disconnected_from_selected = ev.target.checked;
                 this.redraw();
               }).bind(this)
             },
             [disconnectedFns],
             [CATMAID.DOM.createNumericField('sf-minimum-fraction-connected' + this.widgetID, "with a minimum of ", "Minimum fraction (in percent) to consider as connected when hiding", this.connected_threshold, '% connected',
                 (function(ev) {
                   var val = ev.target.value;
                   if ($.isNumeric(val)) {
                     if (val < 0 || val > 100) {
                       CATMAID.msg("Info", "Invalid value! Must range between 0 and 100.");
                     } else {
                       this.connected_threshold =  Math.min(100, Math.max(0, +val));
                       this.updateGraph();
                     }
                   } else {
                     CATMAID.msg("Info", "Not a number!");
                   }
                 }).bind(this), 5)],
            ]);

        var nf = CATMAID.DOM.createNumericField("synapse_threshold" + this.widgetID, // id
                                    "By synapse threshold: ",             // label
                                    "Below this number, neuron gets added to the 'others' heap", // title
                                    this.threshold,                            // initial value
                                    undefined,                               // postlabel
                                    this.onchangeSynapseThreshold.bind(this),    // onchange
                                    5);                                      // textfield length in number of chars

        var cb = CATMAID.DOM.createCheckbox('show others', this.show_others, this.toggleOthers.bind(this));

        var confidence = CATMAID.DOM.createSelect("synapse_confidence_threshold" + this.widgetID, [1, 2, 3, 4, 5]);
        confidence.selectedIndex = Math.max(0, Math.min(4, this.confidence_threshold - 1));
        confidence.onchange = this.onchangeSynapseConfidence.bind(this, confidence);

        CATMAID.DOM.appendToTab(tabs['Filter partners'],
            [[nf],
             [document.createTextNode(' - Only in: ')],
             [partners_source],
             ['Show "only" club', this.showOnly.bind(this)],
             [cb[0]],
             [cb[1]],
             [document.createTextNode(' - Synapse confidence threshold: ')],
             [confidence],
             [document.createTextNode(' - ')],
             {
               type: 'checkbox',
               label: 'Apply node filters',
               value: this.applyFilterRules,
               onclick: (function(e) {
                 this.applyFilterRules = e.target.checked;
                 if (this.filterRules.length > 0) {
                   this.updateGraph();
                 }
               }).bind(this)
             }
            ]);

        var partners_color = CATMAID.skeletonListSources.createPushSelect(this, "color");
        partners_color.onchange = this.onchangeColorPartnerSkeletons.bind(this);

        var c = CATMAID.DOM.createSelect('color-scheme-synapse-fractions' + this.widgetID,
            ['category10',
             'category20',
             'category20b',
             'category20c'].concat(Object.keys(colorbrewer)));

        c.selectedIndex = 1;
        c.onchange = this.onchangeColorScheme.bind(this, c);

        CATMAID.DOM.appendToTab(tabs['Color'],
            [[document.createTextNode("Color scheme: ")],
             [c],
             [document.createTextNode("Color by: ")],
             [partners_color]]);

        CATMAID.DOM.appendToTab(tabs['Groups'],
            [['Ungroup all', this.ungroupAll.bind(this)],
             ['Group equally named', this.groupEquallyNamed.bind(this)],
            ]);

        var partner_group = CATMAID.skeletonListSources.createPushSelect(this, "group");

        CATMAID.DOM.appendToTab(tabs['Partner groups'],
            [[partner_group],
             ['Create group', this.createPartnerGroup.bind(this)],
             [CATMAID.DOM.createTextField('sf-select-partners-regex' + this.widgetID, ' - Select: ', 'Select partner neurons or groups by regular expression matching', '', null, this.selectPartnersByRegex.bind(this), null)],
             ['Create group from selected', this.createPartnerGroupFromSelected.bind(this)],
             ['Group equally named partners', this.groupEquallyNamedPartners.bind(this)],
             ['Group all ungrouped', this.groupAllUngrouped.bind(this)],
             ['Ungroup all', this.ungroupAllPartnerGroups.bind(this)],
            ]);

        CATMAID.DOM.appendToTab(tabs['Options'],
            [{
               type: 'checkbox',
               label: 'Rotated labels',
               title: 'Rotate neuron name labels on X axis',
               value: this.rotateXLabels,
               id: 'sf-rotate-x-labels' + this.widgetID,
               onclick: (function(ev) {
                 this.rotateXLabels = ev.target.checked;
                 this.redraw();
               }).bind(this)
             },
             [CATMAID.DOM.createNumericField(
               "sf-rotation-x-labels" + this.widgetID,
               "X-axis label rotation: ",
               "The rotation of the text labels in the X axis",
               this.rotationXLabels,
               undefined,
               this.onchangeXLabelRotation.bind(this),
               5)],
             {
               type: 'checkbox',
               label: 'Hide selection decorations',
               title: 'Do not paint the contour of partner boxes in black',
               value: this.hideSelectionDecorations,
               id: 'sf-hide-selection-decorations' + this.widgetID,
               onclick: (function(ev) {
                 this.hideSelectionDecorations = ev.target.checked;
                 this.redraw();
               }).bind(this)
             },
             [CATMAID.DOM.createNumericField(
                 "sf-font-size" + this.widgetID,
                 "Font size: ",
                 "Font size for all text labels in axes and legend",
                 this.font_size,
                 undefined,
                 (function(ev) {
                   this.font_size = ev.target.value;
                   this.redraw();
                 }).bind(this),
                 5)],
            ]);



        $(controls).tabs();
      },
      createContent: function(content) {
        content.style.overflow = 'hidden';

        var graph = document.createElement('div');
        graph.setAttribute("id", "synapse_fractions" + this.widgetID);
        graph.style.width = "100%";
        graph.style.height = "100%";
        graph.style.backgroundColor = "#ffffff";
        content.appendChild(graph);
      },
      filter: {
        rules: this.filterRules,
        update: this.update.bind(this)
      },
      helpText: [
        '<h1>Synapse Fractions</h1>',
        '<p>Plot the fraction (in percent) of inputs or outputs allocated to synaptic partner neurons.</p>',
        '<h2>Main</h2>',
        '<p>Choose "Downstream" for outputs (postsynaptic partners), and "Upstream" for inputs (pre-synaptic partners).</p>',
        '<h2>Filter &amp; Highlight</h2>',
        '<ul>',
        '<li>Show only: type any text and push return. Will show only entries matching the text.</li>',
        '<li>Highlight: type any text and push return. Will render in bold text the labels of matching entries. </li>',
        '<li>Sort by selected partners: select some partners first (shift-click or via regex in the "Partner groups" tab) and then check this box to sort by the sum of fractions of the selected partners, descending.</li>',
        '<li>Hide disconnected from: hide entries that do not synapse with selected partners. With the choice of hiding those that do not synapse to all selected, or those that do not synapse to any selected.</li>',
        '<li></li>',
        '</ul>',
        '<p>Add leading "/" for regular expressions.</p>',
        '<p>Erase text and push return to reset.</p>',
        '<h2>Filter Partners</h2>',
        '<ul>',
        '<li>By synapse threshold: synaptic partners with less than the specified number of synapses will be throwninto the "others" group.</li>',
        '<li>Only in: partner neurons not included in the chosen list will be thrown into the "others" group, even if they belong to a partner group.</li>',
        '<li>Show others: whether the show the "others" group or not.</li>',
        '<li>Synapse confidence threshold: include synapses whose confidence value is the chosen number or higher. The default of "1" includes all synapses.</li>',
        '</ul>',
        '<p>The partner neurons are thrown into the "others" group or not following this order of tests:</p>',
        '<ol>',
        '<li>If there is an "only" club and the partner is not a member, throw into the "others" group.</li>',
        '<li>If the partner belongs to a group, render it as part of the group.</li>',
        '<li>If the partner makes less than threshold synapses, throw into the "others" group.</li>',
        '<li>Show the partner all by itself.</li>',
        '</ol>',
        '<h2>Color</h2>',
        '<p>Choose a colorizing function, and additionally use colors from the specified list (e.g. from a Selection Table).</p>',
        '<p>Notice that each color square in the legend is clickable and pops up a color picker for that neuron or group.</p>',
        '<h2>Partner groups</h2>',
        '<p>Create a new group of partner neurons from the selected neurons in the chosen list.</p>',
        '<p>Or select a bunch of partner neurons or groups (by matching text or a regular expression, pushing enter to select), and then create a partner group from them (just like pushing the "j" key).</p>',
        '<p>To edit the name or color of a group of partner skeletons, or to remove it, click on the group name in the legend to open a dialog.</p>',
        '<h2>Options</h2>',
        '<p>Choose whether the text labels in the X-axis are shown at an angle, which can be typed in. Type -90 for vertical labels.</p>',
        '<h2>Mouse operations</h2>',
        '<ul>',
        '<li>Mouse click:',
          '<ul>',
            '<li>Single neuron box: select that partner neuron in the stack viewer. The number of synapses is visible on mouse over as a floating text label.</li>',
            '<li>Groups of partner neurons or the "others" group: open a Connectivity Matrix widget showing the synapses in that box. With control+click, reuse an existing widget rather than opening a new one, and with control+alt+click, clears first the widget to reuse rather than appending to it. (If alt+click moves the whole window in your computer, use another modifier such as shift+alt+click.)</li>',
            '<li>Partner legend text: select that neuron, or for groups open the group editor dialog.</li>',
            '<li>Color box by the partner legend: open a color picker to change the color.</li>',
          '</ul>',
        '<li>Shift+click: toggle selected/deselected status of a partner neuron or group of partner neurons. Works on both the legend and the graph itself. Push "j" then to create a new partner group.</li>',
        '<li>Mouse over: show the name of the partner neuron or group, the number of synapses and the corresponding fraction. Also highlights the name on the x-axis.</li>',
        '<li>Control+Shift+click on an x-axis legend name: remove that neuron or group of neurons.</li>',
        '<li>Alt+click or meta+click on partner legend text: if it is a group of partners, open a Selection Table listing them.</li>',
        '</ul>',
        '<h2>Key bindings</h2>',
        '<p><b>J</b>: if more than two partner skeletons or groups are selected, create a new group. When a single group is selected, this provides the opportunity to rename the group.</p>',
        '<h2>Parner group editor dialog</h2>',
        '<p>Open the partner group editor dialog by clicking on the text of the legend (towards your right) of the group.</p>',
        '<p>The dialog enables renaming the group, setting its color (or leaving it as automatic color), and also appending to or replacing the partner neurons with those selected in another widget.</p>',
        '<p></p>',
      ].join('\n')
    };
  };

  SynapseFractions.prototype.getName = function() {
    return "Synapse Fractions " + this.widgetID;
  };

  SynapseFractions.prototype.destroy = function() {
    this.clear();
    this.other_source.destroy();
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
  };

  SynapseFractions.prototype.getSkeletons = function() {
    return this.items.reduce(function(a, item) {
      return a.concat(Object.keys(item.models));
    }, []);
  };

  SynapseFractions.prototype.getSelectedSkeletons = function() {
    return this.sortEntries().reduce(function(a, entry) {
      return a.concat(Object.keys(entry.item.models));
    }, []);
  };

  SynapseFractions.prototype.getSkeletonColor = function(skid) {
    var model = this.getSkeletonModel(skid);
    if (model) return model.color.clone();
    return new THREE.Color();
  };

  SynapseFractions.prototype.hasSkeleton = function(skid) {
    return this.items.some(function(item) {
      return item.models.hasOwnProperty(skid);
    });
  };

  SynapseFractions.prototype.getSkeletonModel = function(skid) {
    for (var i=0; i<this.items.length; ++i) {
      var model = items[i].models[skid];
      if (model) return model.clone();
    }
    return null;
  };

  SynapseFractions.prototype.getSkeletonModels = function() {
    return this.items.reduce(function(o, item) {
      return Object.keys(item.models).reduce(function(o, skid) {
        o[skid] = item.models[skid].clone();
        return o;
      }, o);
    }, {});
  };

  SynapseFractions.prototype.getSelectedSkeletonModels = function() {
    return this.sortEntries().reduce(function(o, entry) {
      Object.keys(entry.item.models).forEach(function(skid) {
        o[skid] = entry.item.models[skid].clone();
      });
      return o;
    }, {});
  };

  SynapseFractions.prototype.update = function() {
    if (0 === this.filterRules.length) {
      // Reset
      this.filtered_morphologies = {};
      this.updateGraph();
      return;
    }
    this.updateFilter()
      .then(this.updateGraph.bind(this))
      .catch(CATMAID.handleError);
  };

  SynapseFractions.prototype.resize = function() {
    this.redraw();
  };

  SynapseFractions.prototype.updateNeuronNames = function() {
    // Update names for single-neuron items
    var getName = CATMAID.NeuronNameService.getInstance().getName;
    this.items.forEach(function(item) {
      var skids = Object.keys(item.models);
      if (1 === skids.length) item.name = getName(skids[0]);
    });

    this.redraw();
  };

  SynapseFractions.prototype.clear = function() {
    this.items = [];
    this.only = null;
    this.morphologies = {};
    this.filtered_morphologies = {};
    this.other_source.clear();
    this.partner_colors = {};
    this.groups = {};
    this.groupOf = {};
    this.selected_partners = {};
    this.updateOtherSource();
    this.svg_elems = null;
    this.redraw();
  };

  SynapseFractions.prototype.append = function(models) {
    CATMAID.NeuronNameService.getInstance().registerAll(this, models,
        (function() { this._append(models); }).bind(this));
  };

  /** Existing skeletons will be ignored. */
  SynapseFractions.prototype._append = function(models) {
    var existing = this.getSkeletonModels();
    var updated = false;

    var to_add = Object.keys(models).reduce(function(o, skid) {
      if (existing.hasOwnProperty(skid)) {
        updated = true;
        existing[skid] = models[skid]; // update: might make it invisible, change color, etc
      } else {
        o[skid] = models[skid];
      }
      return o;
    }, {});

    var skids = Object.keys(to_add);
    if (0 === skids.length) {
      if (updated) this.redraw(); // not really necessary
      return;
    }

    skids.forEach(function(skid) {
      // register
      var model = models[skid].clone();
      this.items.push(new CATMAID.SkeletonGroup(
            {[skid]: model}, // [skid] evaluates skid
            CATMAID.NeuronNameService.getInstance().getName(skid), // will be updated upon invoking redraw, when sorting the entries into "sorted_entries"
            model.color));
    }, this);

    this.updateMorphologies(skids);
  };

  SynapseFractions.prototype.appendAsGroup = function() {
    var models = CATMAID.skeletonListSources.getSelectedSkeletonModels(this);
    CATMAID.NeuronNameService.getInstance().registerAll(this, models,
        (function() { this._appendAsGroup(models); }).bind(this));
  };

  SynapseFractions.prototype._appendAsGroup = function(models) {
    // Ask for group name
    var options = new CATMAID.OptionsDialog("Group properties");
    var groupname = options.appendField("Name:", "sf-name", "", null);
    options.appendCheckbox("Append number of neurons to name", "sf-number", true);
    options.onOK = (function() {
      var name = $('#sf-name').val();
      if (name && name.length > 0) {
        name = name.trim();
        this.appendGroup(models, name, $('#sf-number').prop('checked'));
        this.updateMorphologies(Object.keys(models));
      } else {
        return alert("Must provide a group name!");
      }
    }).bind(this);

    options.show(300, 500, true);
    groupname.focus();
  };

  /** If a skeleton already exists, it will be now shown as part of the group.
   *  You must call updateMorphologies after invoking this function one or more times. */
  SynapseFractions.prototype.appendGroup = function(models, group_name, append_count_to_name) {
    var skids = Object.keys(models);
    // At least one
    if (0 === skids.length) return;
    // Remove any skids from existing items if already present
    for (var i=0; i<this.items.length; ++i) {
      var item = items[i];
      for (var k=0; k<skids.length; ++k) {
        var skid = skids[k];
        if (item.models.hasOwnProperty(skid)) {
          delete item.models[skid];
        }
      }
      if (0 === Object.keys(item.models).length) {
        this.items.splice(i, 1);
        i--;
      }
    }

    if (append_count_to_name) group_name += ' [#' + skids.length + ']';

    // clone models
    models = Object.keys(models).reduce(function(o, skid) { o[skid] = models[skid].clone(); return o; }, {});

    // Add all as a new group
    this.items.push(new CATMAID.SkeletonGroup(models, group_name, models[skids[0]].color.clone()));
  };

  SynapseFractions.prototype.updateFilter = function(skids) {
    var models = this.getSkeletonModels();
    var filter = new CATMAID.SkeletonFilter(this.filterRules, models);
    return filter.execute()
      .then((function(filtered) {
        if (filtered.nNodes === 0) {
          CATMAID.warn("No skeleton nodes left after applying filters");
        }

        // Create filtered morphologies
        this.filtered_morphologies = {};

        // Nothing to do
        if (0 === this.filterRules.length) return;

        function isAllowed(row) {
          // row[0]: the skeleton treenode ID
          // this: the filtered.nodes dictionary
          /* jshint validthis:true */
          return !!this[row[0]];
        }

        Object.keys(models).forEach(function(skid) {
          this.filtered_morphologies[skid] = {synapses: this.morphologies[skid].synapses.filter(isAllowed, filtered.nodes)};
        }, this);

      }).bind(this));
  };

  /** Update arbor and synapse data, and then update the graph.
   * @skids An array of skeleton IDs to update. */
  SynapseFractions.prototype.updateMorphologies = function(skids) {
    fetchSkeletons(
        skids,
        function(skid) { return CATMAID.makeURL(project.id + '/' + skid + '/0/1/0/compact-arbor'); },
        function(skid) { return {}; }, // POST
        (function(skid, json) {
          // register
          this.morphologies[skid] = {synapses: json[1]}; // not using nodes or tags
        }).bind(this),
        (function(skid) {
          // Failed to load
          delete this.morphologies[skid];
          // Remove from items
          console.log("Removing skeleton which failed to load:", skid, CATMAID.NeuronNameService.getInstance().getName(skid));
          for (var i=0; i<this.items.length; ++i) {
            if (items[i].models.hasOwnProperty(skid)) {
              delete items[i].models[skid];
              // TODO update name if it has the number attached at the end
            }
            if (0 === Object.keys(items[i].models).length) {
              items.splice(i, 1);
            }
            break;
          }
        }).bind(this),
        (function() {
          if (this.filterRules.length > 0 && this.applyFilterRules) {
            this.updateFilter(skids)
              .then(this.updateGraph.bind(this))
              .catch(CATMAID.handleError);
          } else {
            this.updateGraph();
          }
        }).bind(this));
  };

  SynapseFractions.prototype.createPartnerGroup = function() {
    var source = CATMAID.skeletonListSources.getSelectedPushSource(this, "group");
    if (source) {
      var gid = this.next_group_id--;
      var name = prompt("Group name", "group" + gid);
      if (!name) return; // cancelled
      var skids = source.getSelectedSkeletons().filter(function(skid) {
        // Check that it doesn't belong to a group already
        return !this.groupOf[skid];
      }, this);
      if (0 === skids.length) {
        CATMAID.msg("WARNING", "All skeleton IDs already belong to an existing group.");
        return;
      }
      this.groups[gid] = {
        id: gid,
        skids: skids.reduce(function(o, skid) { o[skid] = true; return o; }, {}),
        name: name,
        autocolor: true,
        color: '#' + source.getSkeletonModel(skids[0]).color.getHexString()};
      skids.forEach(function(skid) { this.groupOf[skid] = gid; }, this);
    }
    this.updateGraph();
  };

  /** Takes into account any node filters. */
  SynapseFractions.prototype._makePartnerCountsMap = function(skid) {
    var morphology = this.applyFilterRules && this.filterRules.length > 0 ?
        this.filtered_morphologies[skid] : this.morphologies[skid];
    var type = this.mode === this.DOWNSTREAM ? 0 : 1; // 0 is pre, 1 is post
    return morphology.synapses.reduce((function(o, row) {
      // compact-arbor indices:
      // 1: confidence of synaptic relation between skid and connector
      // 3: confidence of synaptic relation between connector and other skid
      // 5: skeleton ID of the other skeleton
      // 6: relation_id for skid to connector
      if (row[6] === type && Math.min(row[1], row[3]) >= this.confidence_threshold) {
        var skid2 = row[5],
            count = o[skid2];
        o[skid2] = count ? count + 1 : 1;
      }
      return o;
    }).bind(this), {});
  };

  /** Updates fractions and this.other_source, and invokes redraw.  */
  SynapseFractions.prototype.updateGraph = function() {
    if (0 === this.items.length) return;

    var partner_skids = {};

    // An array of synapse counts, one per item in this.items
    this.items.forEach(function(item) {
      // For every model in items
      item.others_skids = {};
      item.fractions = Object.keys(item.models).reduce((function(fractions, skid) {
        // Collect counts of synapses with partner neurons
        var partners = this._makePartnerCountsMap(skid);
        // Filter partners and add up synapse counts
        Object.keys(partners).forEach((function(skid2) {
          partner_skids[skid2] = true;
          var count = partners[skid2];
          // Check if neuron is not a member of the exclusive "only" club,
          // and therefore must be throw into the "others" group:
          if (this.only && !this.only[skid2]) {
            fractions.others += count;
            item.others_skids[skid2] = true;
            return;
          }
          // Place either into a group or by itself, or in "others" if under threshold
          var gid = this.groupOf[skid2];
          if (gid) {
            var gcount = fractions[gid];
            fractions[gid] = (gcount ? gcount : 0) + count;
          } else if (count < this.threshold) {
            // Add to "others" the counts for partner skeletons that are under threshold
            fractions.others += count;
            item.others_skids[skid2] = true;
          } else {
            fractions[skid2] = count;
          }
        }).bind(this));
        return fractions;
      }).bind(this), {others: 0});
    }, this);

    // Some selected partner skeletons may not exist anymore
    this.updateOtherSource();

    this.redraw(partner_skids);
  };

  /** Optional parameter partner_skids. */
  SynapseFractions.prototype.redraw = function(partner_skids) {
    var containerID = '#synapse_fractions' + this.widgetID,
        container = $(containerID);

    // Clear prior graph if any
    container.empty();

    // Stop if empty
    if (0 === this.items.length || !this.items[0].fractions) return;

    var partner_models = partner_skids ?
      Object.keys(partner_skids).reduce(function(o, skid2) {
        o[skid2] = new CATMAID.SkeletonModel(skid2);
        return o;
      }, {})
      : {};

    // Load names of both pre and post skids
    CATMAID.NeuronNameService.getInstance().registerAll(
        this, partner_models,
        (function() { this._redraw(container, containerID); }).bind(this));
  };

  SynapseFractions.prototype._redraw = function(container, containerID) {

    var order = this.orderOfPartners();

    var sorted_entries = this.sortEntries();

    if (0 === sorted_entries.length) return;

    // Turn array into map
    // Need hashable keys for d3. The objects themselves won't do.
    sorted_entries = sorted_entries.reduce(function(o, entry, i) { o[i] = entry; return o; }, {});

    var colors = (function(partner_colors, colorFn, groups) {
          return order.reduce(function(o, id, index) {
            var c = id < 0 ? (groups[id].autocolor ? colorFn(index) : groups[id].color) : partner_colors[id];
            o[id] = c ? c : colorFn(index);
            return o;
          }, {});
        })(this.partner_colors, this.colorFn, this.groups);

    colors["others"] = '#f2f2f2';

    var margin = {top: 20, right: 100, bottom: 50, left: 40},
        width = container.width() - margin.left - margin.right,
        height = container.height() - margin.top - margin.bottom;

    var svg = d3.select(containerID).append("svg")
            .attr("id", 'svg_' + containerID)
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var x = d3.scale.ordinal().rangeRoundBands([0, width], 0.1);
    x.domain(Object.keys(sorted_entries));

    var xAxis = d3.svg.axis()
      .scale(x)
      .orient("bottom")
      .tickFormat(function(index) {
        return sorted_entries[index].name;
      });

    var xg = svg.append("g")
        .attr("class", "x axis")
        .attr("fill", "none")
        .attr("stroke", "black")
        .style("shape-rendering", "crispEdges")
        .call(xAxis);

    if (this.rotateXLabels) {
      var rotation = this.rotationXLabels;
      var anchor = rotation < 0 ? "end" : "start";
      var dx = rotation < 0 ? "-0.8em" : "0.8em";
      xg.selectAll('text').
          style("text-anchor", anchor)
          .attr("dx", dx)
          .attr("dy", "-0.40em")
          .attr("transform", "rotate(" + rotation + ")" );

        // Find max label height height, adjust the height accordingly and transform the x axis.
        var maxWidth = 0;
        xg.selectAll("text").each(function () {
          var boxWidth = this.getBBox().width;
          if (boxWidth > maxWidth) maxWidth = boxWidth;
        });
        // Only count the projected width, since we typically don't rotate 90 degree
        maxWidth = Math.abs(maxWidth * Math.sin(rotation * 2.0  * Math.PI / 360.0));
        height = height - maxWidth;
    }

    xg.attr("transform", "translate(0," + height + ")");

    var font_size = $.isNumeric(this.font_size) ? this.font_size : 11;

    xg.selectAll("text")
        .attr("fill", "black")
        .attr("stroke", "none")
        .style("text-shadow", "unset")
        .style("font-size", font_size + "px")
        .on("mousedown", (function(item_index) {
          // Remove item on control+shift+click on its text
          if (d3.event.shiftKey
           && d3.event.ctrlKey
           && !d3.event.altKey
           && !d3.event.metaKey) {
            var entry = sorted_entries[item_index];
            // Find the entry.item in this.items
            for (var i=0; i<this.items.length; ++i) {
              if (this.items[i].name === entry.item.name) {
                var skids = Object.keys(this.items[i].models);
                var count = 0;
                skids.forEach(function(skid) {
                  if (entry.item.models.hasOwnProperty(skid)) count++;
                });
                if (count === Object.keys(entry.item.models).length) {
                  // Found: remove item
                  this.items.splice(i, 1);
                  this.updateGraph();
                  return;
                }
              }
            }
          }
        }).bind(this));

    if (this.highlightFn) {
      xg.selectAll("text")
        .style("font-weight", (function(index) { return this.highlightFn(sorted_entries[index].name) ? "bold" : ""; }).bind(this));
    }

    var y = d3.scale.linear().rangeRound([height, 0]);
    var yAxis = d3.svg.axis()
      .scale(y)
      .orient("left")
      .tickFormat(d3.format(".0%"));

    var yg = svg.append("g")
        .attr("class", "y axis")
        .attr("fill", "none")
        .attr("stroke", "black")
        .style("shape-rendering", "crispEdges")
        .call(yAxis);
    yg.selectAll("text")
        .style("font-size", font_size + "px")
        .attr("fill", "black")
        .attr("stroke", "none");

    var state = svg.selectAll(".state")
      .data(Object.keys(sorted_entries))
      .enter()
      .append('g')
      .attr("class", "state")
      .attr("transform", function(d) { return "translate(" + x(d) + ",0)"; });

    // Sort according to order and compute cumulatives
    var prepare = function(entry, index) {
      var total = 0;
      var data = order.reduce(function(a, id) {
        var count = entry.item.fractions[id];
        if (!count) return a; // skid2 is not a partner
        total += count; // SIDE EFFECT
        a.push({id: id, // partner skid or gid
                item: entry.item,
                index: index, // relative to sorted entries
                counts: count,
                cumulative: 0, // for offset
                total: 0}); // to normalize
        return a;
      }, []);
      for (var i=0, cumulative = 0; i<data.length; ++i) {
        var d = data[i];
        d.cumulative += cumulative;
        cumulative += d.counts;
        d.total = total;
      }
      return data;
    };

    state.selectAll("rect")
      .data((function(index) {
        return prepare(sorted_entries[index], index);
      }).bind(this))
      .enter()
        .append('rect')
        .attr('width', x.rangeBand())
        .attr('y', function(d) {
          return y((d.cumulative + d.counts) / d.total);
        })
        .attr('height', function(d) {
          return y(d.cumulative / d.total) - y((d.cumulative + d.counts) / d.total);
        })
        .style("fill", function(d, i) {
          return colors[d.id];
        })
        .style("stroke", (function(d, i) {
          return !this.hideSelectionDecorations && this.selected_partners.hasOwnProperty(d.id) ? '#000000' : colors[d.id];
        }).bind(this))
        .on('mouseout', (function(d) {
          this.svg_elems.xg.selectAll('text').style('text-shadow', 'unset');
        }).bind(this))
        .on('mouseover', (function(d) {
          this.svg_elems.xg.selectAll('text')
            .style('text-shadow', function(index) {
              // indices relative to sorted_entries
              return d.index == index ? '0px 0px 15px red' : 'unset';
            });
        }).bind(this))
        .on('mousedown', (function(d) {
          if (d3.event.shiftKey
           && !d3.event.ctrlKey
           && !d3.event.altKey
           && !d3.event.metaKey) {
            d3.event.preventDefault();
            if (this.selected_partners.hasOwnProperty(d.id)) {
              delete this.selected_partners[d.id];
            } else {
              this.selected_partners[d.id] = true;
            }
            this.updateOtherSource();
            this.redraw();
          } else {
            // If others or a group (groups have negative IDs):
            if ("others" === d.id || d.id < 0) {
              // Extract data to display a connectivity matrix
              var item_models = d.item.models;
              var partner_skids;
              if (d.id < 0) {
                // A group
                // TODO: Filter the subset actually connected to the item
                partner_skids = this.groups[d.id].skids;
              } else {
                // Others: all that are under threshold or not in this.only
                partner_skids = d.item.others_skids;
              }
              var partner_models = Object.keys(partner_skids).reduce(function(o, skid2) {
                o[skid2] = new CATMAID.SkeletonModel(skid2, "", new THREE.Color(1, 1, 0));
                return o;
              }, {});

              // Open a connectivity matrix, sorted by total synapse count descending
              var CM = (d3.event.ctrlKey ? WindowMaker.show : WindowMaker.create)("connectivity-matrix");

              if (d3.event.altKey) {
                CM.widget.clear(true, true);
              }

              CM.widget.rowSorting = 5;
              CM.widget.rowSortingDesc = true;
              CM.widget.colSorting = 5;
              CM.widget.colSortingDesc = true;

              if (this.mode === this.UPSTREAM) {
                CM.widget.rowDimension.append(partner_models);
                CM.widget.colDimension.append(item_models);
              } else {
                CM.widget.rowDimension.append(item_models);
                CM.widget.colDimension.append(partner_models);
              }

            } else {
              CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', d.id);
            }
          }
        }).bind(this))
        .append('svg:title') // on mouse over
          .text((function(d) {
            var title = "";
            if (d.id == "others") title = d.id;
            else if (d.id < 0) title = this.groups[d.id].name;
            else title = CATMAID.NeuronNameService.getInstance().getName(d.id);
            return title + ": " + d.counts + " synapses (" + (Math.round((d.counts * 1000) / d.total) / 10) + "%)";
          }).bind(this));

    var legend = svg.selectAll(".legend")
      .data(order.map(function(a) { return a;}).reverse()) // no clone method
      .enter()
        .append("g")
        .attr("class", "legend")
        .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

    legend.append("rect")
      .attr("x", width + 80)
      .attr("width", 18)
      .attr("height", 18)
      .style("fill", function(id) { return colors[id]; });

    legend.append("text")
      .attr("x", width + 74)
      .attr("y", 9)
      .attr("dy", ".35em")
      .style("font-size", font_size + "px")
      .style("text-anchor", "end")
      .style("font-weight", (function(id) {
        return this.selected_partners && this.selected_partners[id] ? "bold" : "";
      }).bind(this))
      .text((function(id) {
        if ("others" === id) return id;
        if (id < 0) return this.groups[id].name;
        return CATMAID.NeuronNameService.getInstance().getName(id);
      }).bind(this));

    // Since our color picker refuses to work with SVG elements easily, we have
    // to jump through some hoops to have the color assigned to the correct
    // element. This keeps track of which element is currently modified.
    var currentElementId = null;

    // Show color picker if legend color box is clicked
    var colorDummy = document.createElement('button');
    colorDummy.style.border = "0";
    colorDummy.style.left = -100;
    //colorDummy.style.display = 'none';
    container.append(colorDummy);
    colorDummy.style.position = "absolute";
    CATMAID.ColorPicker.enable(colorDummy, {
      onColorChange: (function(color, alpha, colorChanged, alphaChanged) {
        if (!currentElementId || !(colorChanged || alphaChanged)) {
          return;
        }
        // Update color mapping
        var newColor = CATMAID.tools.rgbToHex(
            Math.round(255 * color.r), Math.round(255 * color.g),
            Math.round(255 * color.b));
        if (currentElementId < 0) {
          this.groups[currentElementId].autocolor = false;
          this.groups[currentElementId].color = newColor;
        } else {
          this.partner_colors[currentElementId] = newColor;
        }
        // Update graphics
        this.redraw();
      }).bind(this)
    });

    legend.selectAll('rect')
      .on("click", function(id) {
        // Move dummy button on top of current legend element
        var offset = $(container).offset();
        var legendPos = this.getBoundingClientRect();
        colorDummy.style.left = (legendPos.left - offset.left) + "px";
        colorDummy.style.top = (legendPos.top - offset.top) + "px";
        colorDummy.style.width = legendPos.width + "px";
        colorDummy.style.height = legendPos.height + "px";

        // Set color
        colorDummy.value = colors[id];
        currentElementId = id;

        // Click button
        window.setTimeout(colorDummy.click.bind(colorDummy), 0);
      });

    // Select nearest node in skeleton if legend text is clicked
    legend.selectAll('text')
      .on("mousedown", (function(id) {
        if (d3.event.shiftKey
         && !d3.event.altKey
         && !d3.event.metaKey
         && !d3.event.ctrlKey) {
          d3.event.preventDefault();
          if (this.selected_partners.hasOwnProperty(id)) {
            delete this.selected_partners[id];
          } else {
            this.selected_partners[id] = true;
          }
          this.updateOtherSource();
          this.redraw();
          return;
        }
        if ("others" === id) return;
        // negative when it is a group
        if (id < 0) {
          if ((d3.event.altKey || d3.event.metaKey) && !d3.event.ctrlKey) {
            // Open group in Selection Table
            var ST = WindowMaker.create("selection-table");
            ST.widget.append(Object.keys(this.groups[id].skids).reduce(function(o, skid) {
              o[skid] = new CATMAID.SkeletonModel(skid, "", new THREE.Color(colors[id]));
              return o;
            }, {}));
            return;
          }
          // Else
          this.groupEditor(id);
          return;
        }
        CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', id);
      }).bind(this));

    // Store some SVG elements for editing later
    this.svg_elems = {
      xg: xg, // the groups with text in the x Axis
      yg: yg, // the groups with text in the y Axis
      legend: legend
    };
  };

  /** Launch properties editor for the group. */
  SynapseFractions.prototype.groupEditor = function(id) {
    var group = this.groups[id];
    if (!group) {
      CATMAID.msg("WARNING", "Unknown group with id: " + id);
      return;
    }
    var od = new CATMAID.OptionsDialog("Edit group");

    od.appendMessage("The group '" + group.name + "' contains " + Object.keys(group.skids).length + " neurons.");

    // Edit title
    var title = od.appendField("Edit title: ", "group-title-synapse-fraction" + this.widgetID, group.name, true);

    // Edit color
    var color = null;
    var colorButton = document.createElement('button');
    colorButton.appendChild(document.createTextNode('Group color'));
    CATMAID.ColorPicker.enable(colorButton, {
      initialColor: group.color,
      onColorChange: (function(rgb, alpha, colorChanged, alphaChanged) {
        if (colorChanged) {
          color = CATMAID.tools.rgbToHex(Math.round(rgb.r * 255),
                                         Math.round(rgb.g * 255),
                                         Math.round(rgb.b * 255));
        }
      }).bind(this)
    });

    var auto = od.appendCheckbox("Automatic color", "group-autocolor-synapse-fraction" + this.widgetID, group.autocolor);

    var p = document.createElement('p');
    p.appendChild(colorButton);
    od.dialog.appendChild(p);

    // Enable deleting the group
    var remove = od.appendCheckbox("Remove group", "group-remove-synapse-fraction" + this.widgetID, false);

    // A source to update the group from (includes itself, which are the x-axis entries)

    od.appendMessage("Update partner list:");
    var methods = ["append", "replace"];
    var methodChoice = od.appendChoice("Method: ", "sf-group-update-method" + this.widgetID, methods, methods, 0);
    var p = document.createElement('p');
    p.innerHTML = "From: ";
    p.appendChild(CATMAID.skeletonListSources.createPushSelect({getName: function() { return ""; }}, "group"));
    od.dialog.appendChild(p);

    od.onOK = (function() {
      if ($(remove).prop('checked')) {
        Object.keys(group.skids).forEach(function(skid) { delete this.groupOf[skid]; }, this);
        delete this.groups[id];
        this.updateGraph(); // remake fractions
        return;
      }
      group.name = title.value;
      if (color) group.color = color;
      group.autocolor = $(auto).prop('checked');

      var source = CATMAID.skeletonListSources.getSelectedPushSource({getName: function() { return ""; }}, "group");
      if (source && confirm('Update group "' + group.name + '" with neurons from ' + source.getName() + ' ?')) {
        var models = source.getSelectedSkeletonModels();
        var method = methods[methodChoice.selectedIndex];
        var skids = Object.keys(models);
        if (skids.length > 0) {
          if ("append" === method) {
            skids.forEach(function(skid) {
              group.skids[skid] = true;
              this.groupOf[skid] = id;
            }, this);
          } else if ("replace" === method) {
            Object.keys(group.skids).forEach(function(skid) { delete this.groupOf[skid]; }, this);
            group.skids = {};
            skids.forEach(function(skid) {
              group.skids[skid] = true;
              this.groupOf[skid] = id;
            }, this);
          }

          // Ensure skids are not part of other groups
          Object.keys(this.groups).forEach(function(gid) {
            if (gid === id) return; // the group being edited
            var gskids = this.groups[gid].skids;
            skids.forEach(function(skid) {
              delete gskids[skid];
            });
            // Delete group if empty
            if (0 === Object.keys(gskids).length) {
              CATMAID.msg("Info", 'Removed absorbed group "' + this.groups[gid].name + '"');
              delete this.groups[gid];
            }
          }, this);

          // Update the fractions, given that the updated group may contain skeleton IDs from
          this.updateGraph();
          return;
        }
      }

      this.redraw();

    }).bind(this);

    od.show('auto', 'auto');
    return;
  };

  SynapseFractions.prototype.toggleOthers = function() {
    this.show_others = !this.show_others;
    this.redraw();
  };

  SynapseFractions.prototype.onchangeMode = function(choice) {
    var mode = choice.selectedIndex + 1;
    if (mode === this.mode) return;
    this.mode = mode;
    this.updateGraph();
  };

  SynapseFractions.prototype.onchangeFilterPartnerSkeletons = function() {
    var source = CATMAID.skeletonListSources.getSelectedPushSource(this, "filter");
    if (source) {
      this.only = source.getSelectedSkeletons().reduce(function(o, skid) { o[skid] = true; return o; }, {});
    } else {
      this.only = null;
    }
    this.updateGraph();
  };

  SynapseFractions.prototype.onchangeColorPartnerSkeletons = function() {
    var source = CATMAID.skeletonListSources.getSelectedPushSource(this, "color");
    if (source) {
      var models = source.getSelectedSkeletonModels();
      this.partner_colors = Object.keys(models).reduce(function(o, skid) {
        o[skid] = '#' + models[skid].color.getHexString();
        return o;
      }, {});
    } else {
      this.partner_colors = {};
    }
    this.updateGraph();
  };

  SynapseFractions.prototype.onchangeSynapseThreshold = function(ev) {
    // Get the number from the event soure, which is a textField
    var val = Number(ev.target.value);
    if (Number.isNaN(val)) {
      CATMAID.msg("Warning", "Invalid threshold value: not a number.");
      return;
    }

    if (val !== this.threshold) {
      this.threshold = val;
      this.updateGraph();
    }
  };

  SynapseFractions.prototype.onchangeColorScheme = function(c) {
    var scheme = c.options[c.selectedIndex].text;
    if (0 === scheme.indexOf('category')) {
      this.colorFn = d3.scale[scheme]();
    } else if (colorbrewer.hasOwnProperty(scheme)) {
      this.colorFn = (function(sets) {
        // circular indexing
        var keys = Object.keys(sets),
            largest = sets[keys.sort(function(a, b) { return a < b ? 1 : -1; })[0]];
        return (function(largest, i) { return largest[i % largest.length]; }).bind(null, largest);
      })(colorbrewer[scheme]);
    }
    this.redraw();
  };

  SynapseFractions.prototype.onchangeXLabelRotation = function(ev) {
    var val = Number(ev.target.value);
    if (Number.isNaN(val)) {
      CATMAID.msg("Warning", "Invalid number");
      return;
    }
    if (val !== this.rotationXLabels) {
      this.rotationXLabels = val;
      this.redraw();
    }
  };

  SynapseFractions.prototype.onchangeSynapseConfidence = function(choice) {
    var ct = choice.selectedIndex + 1;
    if (ct === this.confidence_threshold) return;
    this.confidence_threshold = ct;
    this.updateGraph();
  };

  SynapseFractions.prototype.handleKeyPress = function(event) {
  };

  SynapseFractions.prototype.handleKeyUp = function(event) {
    if (event.key === 'j') {
      this.createPartnerGroupFromSelected();
    }
  };

  SynapseFractions.prototype.createPartnerGroupFromSelected = function() {
    var ids = Object.keys(this.selected_partners);
    if (ids.length > 1) {
      var name = prompt("Group name", "");
      if (!name) return; // cancelled
      this._addPartnerGroupFrom(ids, name);
      // clear selection
      this.selected_partners = {};
      // Recompute fractions and redraw
      this.updateGraph();
    } else {
      CATMAID.msg("Info", "Select at least 2 partner skeletons or groups with shift+click or by regex.");
    }
  };

  // Create a partner group from an array of ids and a name
  SynapseFractions.prototype._addPartnerGroupFrom = function(ids, name) {
    // Collect skeleton IDs from partner groups and skeletons
    var groups = this.groups;
    var skids = ids.reduce(function(o, id) {
      if (id < 0) {
        // A group of partner skeletons
        $.extend(o, groups[id].skids);
        // Remove the group
        delete groups[id];
      } else {
        // A partner skeleton
        o[id] = true;
      }
      return o;
    }, {});
    // Create new partner skeleton group
    var gid = this.next_group_id--;
    this.groups[gid] = {
      id: gid,
      skids: skids,
      name: name,
      autocolor: true,
      color: '#ffff00'
    };
    Object.keys(skids).forEach(function(skid) { this.groupOf[skid] = gid; }, this);
  };

  /** Return an object with the necessary data for saving to JSON or cloning the widget. */
  SynapseFractions.prototype._packageData = function(visible_only) {
    // Missing: rotateXLabels, rotationXLabels and show_others, whose UI elements don't have IDs so the UI can't be updated.
    return {
      items: visible_only ? this.sortEntries().map(function(entry) { return entry.item; }) : this.items,
      threshold: this.threshold,
      only: this.only,
      partner_colors: this.partner_colors,
      groups: this.groups,
      mode: this.mode,
      confidence_threshold: this.confidence_threshold,
      font_size: this.font_size,
      connected_threshold: this.connected_threshold,
      // Don't: it's suprising when selecting partners on a loaded graph
      //selected: this.selected,
      //hide_disconnected_from_selected: this.hide_disconnected_from_selected,
      //disconnected_fn: this.disconnected_fn,
      hideSelectionDecorations: this.hideSelectionDecorations,
      rotateXLabels: this.rotateXLabels,
      rotationXLabels: this.rotationXLabels,
    };
  };

  SynapseFractions.prototype.saveToFile = function() {
    var today = new Date();
    var defaultFileName = 'synapse-fractions-' + today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate() + ".json";
    var filename = prompt('File name', defaultFileName);
    if (!filename) return;

    var data = this._packageData(false);

    saveAs(new Blob([JSON.stringify(data, null, ' ')], {type: 'text/plain'}), filename);
  };

  /** Clears the widget and populates it from the JSON data. */
  SynapseFractions.prototype.populateFrom = function(json) {
    this.clear();
    var skids = {};
    // Transform model data into SkeletonModel instances
    for (var i=0; i<json.items.length; ++i) {
      var item = json.items[i];
      item.models = Object.keys(item.models).reduce(function(o, skid) {
        if (skids.hasOwnProperty(skid)) {
          console.log("skeleton ID already seen", skid);
          return;
        } else {
          skids[skid] = true;
        }
        var pseudomodel = item.models[skid];
        var model = new CATMAID.SkeletonModel(skid, pseudomodel.baseName, new THREE.Color(pseudomodel.color.r, pseudomodel.color.g, pseudomodel.color.b));
        model.meta_visible = pseudomodel.meta_visible;
        model.opacity = pseudomodel.opacity;
        model.post_visible = pseudomodel.post_visible;
        model.pre_visible = pseudomodel.pre_visible;
        model.selected = pseudomodel.selected;
        model.text_visible = pseudomodel.text_visible;
        o[skid] = model;
        return o;
      }, {});
      var count = Object.keys(item.models).length;
      if (0 === count) continue; // skip item
      this.items.push(item);
      // Transform color data
      item.color = new THREE.Color(item.color.r, item.color.g, item.color.b);
      if (1 === count) {
        // Update name
        item.name = CATMAID.NeuronNameService.getInstance().getName(Object.keys(item.models)[0]);
      }
      // TODO: item.name might need an update when it is a group of more than 1 and some where repeated
    }
    // No need to transform anything for groups
    this.groups = json.groups;
    this.next_group_id = Math.min.apply(null, Object.keys(this.groups)) -1 || -1;
    // Generate groupOf
    this.groupOf = Object.keys(this.groups).reduce((function(o, gid) {
      var group = this.groups[gid];
      Object.keys(group.skids).forEach(function(skid) {
        o[skid] = gid;
      });
      return o;
    }).bind(this), {});
    // Other properties
    this.confidence_threshold = Math.max(1, Math.min(5, json.confidence_threshold)) || 1;
    $('#synapse_confidence_threshold' + this.widgetID)[0].value = this.confidence_threshold;
    this.mode = Math.max(1, Math.min(2, json.mode)) || 2;
    $('#synapse_fraction_mode' + this.widgetID).val(this.mode);
    this.only = json.only; // null or a map of skid vs true
    this.partner_colors = json.partner_colors; // colors in hex
    this.threshold = Math.max(0, json.threshold) || 5;
    $('#synapse_threshold' + this.widgetID)[0].value = this.threshold;
    this.font_size = json.font_size || 11;
    $('#sf-font-size' + this.widgetID)[0].value = this.font_size;
    this.connected_threshold = json.connected_threshold || 0;
    $('#sf-minimum-fraction-connected' + this.widgetID)[0].value = this.connected_threshold;
    // Don't: it's surprising when selecting partners on a loaded graph
    //this.selected_partners = json.selected_partners || {};
    //this.hide_disconnected_from_selected = json.hide_disconnected_from_selected || false;
    //$('#sf-hide-disconnected-from-selected' + this.widgetID)[0].checked = this.hide_disconnected_from_selected;
    this.disconnected_fn = json.disconnected_fn || "all selected";
    $('#sf-disconnected-fn' + this.widgetID).val(this.disconnected_fn);
    this.sort_keep_equally_named_together = json.sort_keep_equally_named_together || false;
    $('#sf-keep-equally-named-together' + this.widgetID)[0].checked = this.sort_keep_equally_named_together;
    this.hideSelectionDecorations = json.hideSelectionDecorations || false;
    $('#sf-hide-selection-decorations' + this.widgetID)[0].checked = this.hideSelectionDecorations;
    this.rotateXLabels = json.rotateXLabels || true;
    $('#sf-rotate-x-labels' + this.widgetID)[0].checked = this.rotateXLabels;
    this.rotationXLabels = json.rotationXLabels || -65;
    $('#sf-rotation-x-labels' + this.widgetID)[0].value = this.rotationXLabels;

    this.updateMorphologies(Object.keys(skids));
  };

  /**
   * Does not consider the case that some skeleton IDs don't exist. Will fail gracefully.
   */
  SynapseFractions.prototype.loadFromFiles = function(files) {
      if (!CATMAID.containsSingleValidFile(files, 'json')) {
        return;
      }

      var reader = new FileReader();

      // Register the skeletons and parse the JSON
      reader.onload = (function(e) {
        var json = JSON.parse(e.target.result);
        var pseudomodels = json.items.reduce(function(o, item) {
          $.extend(o, item.models);
          return o;
        }, {});
        CATMAID.NeuronNameService.getInstance().registerAll(this, pseudomodels,
            (function() { this.populateFrom(json); }).bind(this));
      }).bind(this);

      reader.readAsText(files[0]);
  };

  /** Show only those items whose name matches a text or a regular expression. */
  SynapseFractions.prototype.filterByRegex = function() {
    var text = $('#sf-filter-by-regex' + this.widgetID)[0].value.trim();
    if (!text || 0 === text.length) {
      this.skip = {}; // clear
      this.redraw();
    } else {
      var match = CATMAID.createTextMatchingFunction(text);
      if (match) {
        this.skip = {}; // clear
        this.items.forEach(function(item, i) {
          if (!match(item.name)) this.skip[i] = true;
        }, this);
        this.redraw();
      }
    }
  };

  /** Highlight with a bold legend those items whose name matches a text or a regular expression. */
  SynapseFractions.prototype.highlightByRegex = function() {
    var text = $('#sf-highlight' + this.widgetID)[0].value.trim();
    if (!text || 0 === text.length) {
      // Stop highlighting
      this.highlightFn = null;
      this.redraw();
    } else {
      // Setup matching function
      var match = CATMAID.createTextMatchingFunction(text);
      if (match) {
        this.highlightFn = match;
        this.redraw();
      }
    }
  };

  SynapseFractions.prototype.removeAllHighlighted = function() {
    if (this.highlightFn) {
      var indices_to_remove = [];
      for (var i=0; i<this.items.length; ++i) {
        if (this.highlightFn(this.items[i].name)) {
          indices_to_remove.push(i);
        }
      }
      if (0 === indices_to_remove.length) return;
      var check = confirm("Remove " + indices_to_remove.length + " entries?");
      if (check) {
        for (var i=0; i<indices_to_remove.length; ++i) {
          this.items.splice(indices_to_remove[i] - i, 1);
        }
        this.updateGraph();
      }
    }
  };

  /** Hide/show items disconnected from selected partners. */
  SynapseFractions.prototype.hideDisconnectedFromSelected = function() {
    this.hide = {};
    if (!this.hide_disconnected_from_selected) return;
    var selected = Object.keys(this.selected_partners);
    if (0 === selected.length) return;

    var sum = function(fractions) {
      return Object.keys(fractions).reduce(function(s, id) { return s + fractions[id]; }, 0);
    };

    if ("all selected" === this.disconnected_fn) {
      this.items.forEach(function(item, i) {
        var total = sum(item.fractions);
        // All: hide if any partner is disconnected
        for (var k=0; k<selected.length; ++k) {
          var count = item.fractions[selected[k]];
          if (!count || (count / total) * 100 < this.connected_threshold) {
            // At least one is disconnected: hide
            this.hide[i] = true;
            return;
          }
        }
      }, this);
    } else if ("any selected" === this.disconnected_fn) {
      this.items.forEach(function(item, i) {
        var total = sum(item.fractions);
        // Any: hide if all partners are disconnected
        for (var k=0; k<selected.length; ++k) {
          var count = item.fractions[selected[k]];
          if (count && (count / total) * 100 >= this.connected_threshold) {
            // At least one is connected: avoid hiding
            return;
          }
        }
        // None are connected, hence hide
        this.hide[i] = true;
      }, this);
    }
  };

  /** Get the set of unique partner skeleton IDs or group IDs, as a map of ids vs their names. */
  SynapseFractions.prototype.getPartnerIds = function() {
    var ids = this.items
      .map(function(item) { return item.fractions; })
      .reduce(function(o, counts) {
      return Object.keys(counts).reduce(function(o, id) {
        o[id] = null;
        return o;
      }, o);
    }, {});

    var getName = CATMAID.NeuronNameService.getInstance().getName;

    Object.keys(ids).forEach(function(id) {
      if (id < 0) ids[id] = this.groups[id].name; // a group has always a negative ID
      else ids[id] = getName(id);
    }, this);

    ids["others"] = "others";

    return ids;
  };

  /**
   * Select partner groups by matching text or regex.
   */
  SynapseFractions.prototype.selectPartnersByRegex = function() {
    var text = $('#sf-select-partners-regex' + this.widgetID)[0].value.trim();
    if (!text || 0 === text.length) {
      // Deselect all
      this.selected_partners = {};
      this.updateOtherSource();
      this.redraw();
    } else {
      var match = CATMAID.createTextMatchingFunction(text);
      if (match) {
        // Get set of unique partner skeleton IDs or group IDs
        var ids = this.getPartnerIds();
        // Find those that match
        this.selected_partners = {};
        Object.keys(ids).forEach(function(id) {
          if (match(ids[id])) this.selected_partners[id] = true;
        }, this);
        this.updateOtherSource();
        this.redraw();
      }
    }
  };

  /** Prepare the array of entries for redraw, sorted and filtered. */
  SynapseFractions.prototype.sortEntries = function() {

    var sortByValue = this.sort_by_selected_partners
                   && this.items.length > 1
                   && this.selected_partners
                   && Object.keys(this.selected_partners).length > 0;

    var getName = CATMAID.NeuronNameService.getInstance().getName;

    this.hideDisconnectedFromSelected();

    var skipFn = (function(item, i) {
      return !this.skip.hasOwnProperty(i)  // did not match regex
          && !this.hide.hasOwnProperty(i); // was disconnected from selected partners
    }).bind(this);

    var computeValueFn = (function(fractions) {
      var sumFn = function(sum, id) {
        var v = fractions[id]; // might not be a partner of this item
        return sum + (v ? v : 0);
      };
      // Default is "sum"
      var composeFn = sumFn;
      if ("max" == this.sort_composition_fn) {
        composeFn = function(m, id) {
          var v = fractions[id]; // might not be a partner of this item
          return v ? Math.max(m, v) : m;
        };
      }
      var partial = Object.keys(this.selected_partners).reduce(composeFn, 0);
      if (0 === partial) return 0;
      var total = Object.keys(fractions).reduce(sumFn, 0);
      return partial / total;
    }).bind(this);

    var makeEntryFn = (function(item) {
      var skids = Object.keys(item.models);
      return {item: item,
              name: 1 === skids.length ? getName(skids[0]) : item.name, // updated name for single-skeleton items
              value: sortByValue ? computeValueFn(item.fractions) : 0};
    }).bind(this);

    var sortFn = function(a, b) {
        if (a.value === b.value) {
          // Alphabetic when equal value
          //return a.name < b.name ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'});
        }
        // Descending
        return a.value > b.value ? -1 : 1;
    };

    var sorted_entries = this.items
      .map(makeEntryFn)
      .filter(skipFn) // must skip after making the entries, which depend on correlated index for fractions array
      .sort(sortFn);

    if (sortByValue && this.sort_keep_equally_named_together) {
      // For every entry, find if any other after it is equally named, and put it next to it.
      // Make a map first of names vs array of items with same names
      var equals = sorted_entries.reduce(function(o, item) {
        var a = o[item.name];
        if (a) a.push(item);
        else o[item.name] = [item];
        return o;
      }, {});
      var seen = {};
      return sorted_entries.reduce(function(a, item) {
        if (seen[item.name]) return a; // was done
        seen[item.name] = true;
        return a.concat(equals[item.name]);
      }, []);
    }

    return sorted_entries;
  };

  /** Return an array of sorted partner IDs */
  SynapseFractions.prototype.orderOfPartners = function() {
    // Map of partner skeleton IDs or group IDs, vs counts of synapses across all models,
    // useful for sorting later the blocks inside each column
    var partners = this.items
      .map(function(item) { return item.fractions; })
      .reduce(function(o, counts) {
      return Object.keys(counts).reduce(function(o, id) {
        var sum = o[id];
        o[id] = (sum ? sum : 0) + counts[id];
        return o;
      }, o);
    }, {});

    // List of partner skeleton IDs or group IDs, sorted from most synapses to least
    // with 'other' always at the end
    var other = partners['others'];
    delete partners['others'];
    var order = Object.keys(partners)
      .map(function(id) { return [id, partners[id]]; })
      .sort(function(a, b) { return a[1] < b[1] ? 1 : -1; }) // Descending
      .map(function(pair) { return pair[0]; });

    if (this.show_others) {
      // Append at the end
      order.push('others');
    }

    return order;
  };

  /** Ungroup all items, so that each item holds a single skeleton ID. */
  SynapseFractions.prototype.ungroupAll = function() {
    var getName = CATMAID.NeuronNameService.getInstance().getName;
    this.items = this.items.reduce(function(a, item) {
      var skids = Object.keys(item.models);
      if (1 === skids.length) a.push(item);
      else {
        skids.forEach(function(skid) {
          a.push(new CATMAID.SkeletonGroup({[skid]: item.models[skid]},
                                           getName(skid),
                                           item.models[skid].color.clone()));
        });
      }
      return a;
    }, []);
    this.updateGraph();
  };

  /** Find items with identical names and group them. */
  SynapseFractions.prototype.groupEquallyNamed = function() {
    var grouped_items = this.items.reduce(function(o, item) {
      var seen = o[item.name];
      if (seen) {
        $.extend(seen.models, item.models);
        seen.name = item.name + ' [#' + Object.keys(seen.models).length + ']';
      } else {
        o[item.name] = item;
      }
      return o;
    }, {});

    this.items = Object.keys(grouped_items).map(function(name) { return grouped_items[name]; });
    this.updateGraph();
  };

  SynapseFractions.prototype.groupEquallyNamedPartners = function() {
    if (0 === this.items.length) return;
    var ids = this.getPartnerIds();
    var grouped = Object.keys(ids).reduce(function(o, id) {
      var name = ids[id];
      var seen = o[name];
      if (seen) o[name].push(id);
      else o[name] = [id];
      return o;
    }, {});
    // Make groups for those with a count > 1
    Object.keys(grouped).forEach(function(name) {
      var a = grouped[name]; // an array
      if (a.length > 1) {
        this._addPartnerGroupFrom(a, name);
      }
    }, this);
    // Recompute fractions and redraw
    this.updateGraph();
  };

  SynapseFractions.prototype.groupAllUngrouped = function() {
    if (0 === this.items.length) return;
    var ids = this.getPartnerIds(); // skeleton IDs (positive) or group IDs (negative)
    delete ids["others"];
    var ungrouped = Object.keys(ids).reduce(function(a, id) {
      if (Number(id) > -1) a.push(id);
      return a;
    }, []);
    if (ungrouped.length > 1) {
      var name = prompt("Group name", "");
      if (!name) return; // cancelled
      this._addPartnerGroupFrom(ungrouped, name);
      this.updateGraph();
    } else {
      CATMAID.msg("Information", "None remain ungrouped");
    }
  };

  SynapseFractions.prototype.ungroupAllPartnerGroups = function() {
    this.groups = {};
    this.groupOf = {};
    this.next_group_id = -1;
    this.updateGraph();
  };

  /** Export a CSV matrix of entries as rows and fractions as columns. */
  SynapseFractions.prototype.exportCSV = function() {
    var today = new Date();
    var defaultFileName = 'synapse-fractions-' + today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate() + ".csv";
    var filename = prompt('File name', defaultFileName);
    if (!filename) return;

    var order = this.orderOfPartners(); // last is "others" if this.show_others
    var getName = CATMAID.NeuronNameService.getInstance().getName;
    var partner_names = order.map(function(id) {
      return id < 0 ? this.groups[id].name : getName(id);
    }, this);
    if (this.show_others) {
      partner_names[partner_names.length -1] = "others"; // was null from getName
    }
    var quote = function(s) { return '"' + s + '"'; };
    var rows = ["," + partner_names.map(quote).join(",")];
    this.sortEntries().forEach(function(entry) {
      var total = 0;
      var row = order
        .map(function(id) {
          var count = entry.item.fractions[id];
          if (!count) return 0; // id is not a partner of this entry
          total += count; // SIDE EFFECT
          return count;
        })
        .map(function(v) { return v / total; });
      row.unshift(quote(entry.name)); // prepend
      rows.push(row.join(','));
    });

    saveAs(new Blob([rows.join('\n')], {type: 'text/plain'}), filename);
  };

  SynapseFractions.prototype.exportSVG = function() {
    this.svg_elems.xg.selectAll('text').style('text-shadow', 'unset');
    CATMAID.svgutil.saveDivSVG('synapse_fractions_widget' + this.widgetID, "synapse_fractions.svg");
  };

  /** Clone currently visible x-axis items onto a new widget instance. */
  SynapseFractions.prototype.cloneVisible = function() {
    var SF = WindowMaker.create("synapse-fractions");
    SF.widget.populateFrom(JSON.parse(JSON.stringify(this._packageData(true))));
  };

  SynapseFractions.prototype.showOnly = function() {
    if (this.only) {
      var ST = WindowMaker.create("selection-table");
      ST.widget.append(Object.keys(this.only).reduce((function(o, skid) {
        o[skid] = new CATMAID.SkeletonModel(skid, "", new THREE.Color(1, 1, 0));
        return o;
      }).bind(this), {}));
    } else {
      CATMAID.msg("Info", "There isn't any \"only\" club defined.");
    }
  };

  SynapseFractions.prototype.updateOtherSource = function() {
    this.other_source.clear();
    var ids = Object.keys(this.selected_partners);
    if (0 === ids.length) return;
    var partners = this.getPartnerIds();
    var getName = CATMAID.NeuronNameService.getInstance().getName;

    var models = {};

    if (this.selected_partners["others"]) {
      this.items.forEach(function(item) {
        Object.keys(item.others_skids).forEach(function(skid2) {
          if (models[skid2]) return; // already present
          models[skid2] = new CATMAID.SkeletonModel(skid2, getName(skid2), new THREE.Color('#f2f2f2'));
        });
      });
      // Remove
      for (var i=0; i<ids.length; ++i) {
        if ("others" === ids[i]) {
          ids.splice(i, 1);
          break;
        }
      }
    }

    ids.forEach(function(id) {
      if (id < 0) {
        var group = this.groups[id];
        Object.keys(group.skids).forEach(function(skid2) {
          models[skid2] = new CATMAID.SkeletonModel(skid2, "", new THREE.Color(group.color));
        });
      } else {
        // TODO why is this side effect here
        if (!partners[id]) {
          // Remove from selection
          delete this.selected_partners[id];
          return;
        }
        // A skeleton ID
        models[id] = new CATMAID.SkeletonModel(id, getName(id), new THREE.Color(1, 1, 0));
      }
    }, this);

    this.other_source.append(models);
  };

  SynapseFractions.prototype.highlight = function(skid) {
  };

  // Export synapse plot into CATMAID namespace
  CATMAID.SynapseFractions = SynapseFractions;

  CATMAID.registerWidget({
    name: "Synapse Fractions",
    description: "Plot input/ouput fraction wrt. partner neurons",
    key: "synapse-fractions",
    creator: CATMAID.SynapseFractions
  });

})(CATMAID);
