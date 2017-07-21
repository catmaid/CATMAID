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

    // Color partner skeletons using these colors
    this.partner_colors = {};

    // Function to generate default colors
    this.colorFn = d3.scale.category20();

    // The loaded data for each arbor
    this.morphologies = {};

    // The data for redrawing
    this.fractions = null;

    // Map of group ID vs object with keys: id, name, color, and map of skids vs true
    this.groups = {};
    // Group IDs count towards minus inifinity
    this.next_group_id = -1;
    // Map from skeleton ID to group ID
    this.groupOf = {};

    this.mode = this.UPSTREAM;

    this.confidence_threshold = 1;

    this.other_source = new CATMAID.BasicSkeletonSource(this.getName() + ' partners');

    // Set of selected partners or partner groups, with shift+click
    this.selected_partners = {};

    // Whether to decorate selected partner boxes with a black contour or not
    this.hideSelectionDecorations = false;

    // Matching function: if an item's name matches, its legend is drawn in bold
    this.highlightFn = null;

    // Set of items to skip displaying, as a map of index vs true
    this.skip = {};
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
            ['Main', 'Filter/Highlight', 'Filter partners', 'Color', 'Partner groups', 'Options']);

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
             [document.createTextNode(' - ')],
             ['Save', this.saveToFile.bind(this)],
             ['Open', function() { fileButton.click(); }],
            ]);

        CATMAID.DOM.appendToTab(tabs['Filter/Highlight'],
            [[document.createTextNode('Show only: ')],
             [CATMAID.DOM.createTextField('sf-filter-by-regex' + this.widgetID, null, null, '', null, this.filterByRegex.bind(this), 10, null)],
             [document.createTextNode(' - Highlight: ')],
             [CATMAID.DOM.createTextField('sf-highlight' + this.widgetID, null, null, '', null, this.highlightByRegex.bind(this), 10, null)],
             {
               type: 'checkbox',
               label: 'Sort by selected partners',
               title: 'Sort the X-axis according to the sum of fractions of selected partners',
               value: this.sort_by_selected_partners,
               onclick: (function(ev) {
                 this.sort_by_selected_partners = ev.target.checked;
                 this.redraw();
               }).bind(this)
             }
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
             [cb[0]],
             [cb[1]],
             [document.createTextNode(' - Synapse confidence threshold: ')],
             [confidence]
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

        var partner_group = CATMAID.skeletonListSources.createPushSelect(this, "group");

        CATMAID.DOM.appendToTab(tabs['Partner groups'],
            [[partner_group],
             ['Create group', this.createPartnerGroup.bind(this)],
             [CATMAID.DOM.createTextField('sf-select-partners-regex' + this.widgetID, ' - Select: ', 'Select partner neurons or groups by regular expression matching', '', null, this.selectPartnersByRegex.bind(this), null)],
             ['Create group from selected', this.createGroupFromSelected.bind(this)],
            ]);

        CATMAID.DOM.appendToTab(tabs['Options'],
            [{
               type: 'checkbox',
               label: 'Rotated labels',
               title: 'Rotate neuron name labels on X axis',
               value: this.rotateXLabels,
               onclick: (function(ev) {
                 this.rotateXLabels = ev.target.checked;
                 this.redraw();
               }).bind(this)
             },
             [CATMAID.DOM.createNumericField(
               "rotation" + this.widgetID,
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
               onclick: (function(ev) {
                 this.hideSelectionDecorations = ev.target.checked;
                 this.redraw();
               }).bind(this)
             }
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
        '</ul>',
        '<p>Add leading "/" for regular expressions.</p>',
        '<p>Erase text and push return to reset.</p>',
        '<h2>Filter Partners</h2>',
        '<ul>',
        '<li>By synapse threshold: synaptic partners with less than the specified number of synapses will be throwninto the "others" group.</li>',
        '<li>Only in: partner neurons not included in the chosen list will be thrown into the "others" group.</li>',
        '<li>Show others: whether the show the "others" group or not.</li>',
        '<li>Synapse confidence threshold: include synapses whose confidence value is the chosen number or higher. The default of "1" includes all synapses.</li>',
        '</ul>',
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
        '<li>Mouse click: select that partner neuron in the stack viewer (does nothing for groups of partner neurons).</li>',
        '<li>Shift+click: toggle selected/deselected status of a partner neuron or group of partner neurons. Works on both the legend and the graph itself. Push "j" then to create a new partner group.</li>',
        '<li>Mouse over: show the name of the partner neuron.</li>',
        '</ul>',
        '<h2>Key bindings</h2>',
        '<p><b>J</b>: if more than two partner skeletons or groups are selected, create a new group. When a single group is selected, this provides the opportunity to rename the group.</p>',
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

  SynapseFractions.prototype.getSelectedSkeletons = function() {
    return this.items.reduce(function(a, item) {
      return a.concat(Object.keys(item.models));
    }, []);
  };

  SynapseFractions.prototype.getSkeletons = SynapseFractions.prototype.getSelectedSkeletons;

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

  SynapseFractions.prototype.getSelectedSkeletonModels = SynapseFractions.prototype.getSkeletonModels;

  SynapseFractions.prototype.update = function() {
    var morphologies = {};
    var fractions = null;
    this.updateMorphologies(this.getSkeletons());
  };

  SynapseFractions.prototype.resize = function() {
    this.redraw();
  };

  SynapseFractions.prototype.updateNeuronNames = function() {
    this.redraw();
  };

  SynapseFractions.prototype.clear = function() {
    this.items = [];
    this.only = null;
    this.morphologies = {};
    this.fractions = null;
    this.other_source.clear();
    this.partner_colors = {};
    this.groups = {};
    this.groupOf = {};
    this.selected_partners = {};
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
      var model = models[skid];
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

    // Add all as a new group
    this.items.push(new CATMAID.SkeletonGroup(models, group_name, models[skids[0]].color.clone()));
  };

  /** Update arbor and synapse data, and then update the graph.
   * @skids An array of skeleton IDs to update. */
  SynapseFractions.prototype.updateMorphologies = function(skids) {
    fetchSkeletons(
        skids,
        function(skid) { return django_url + project.id + '/' + skid + '/0/1/0/compact-arbor'; },
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
            if (0 == Object.keys(items[i].models).length) {
              items.splice(i, 1);
            }
            break;
          }
        }).bind(this),
        (function() { this.updateGraph(); }).bind(this));
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

  /** Updates this.fractions and this.other_source, and invokes redraw.  */
  SynapseFractions.prototype.updateGraph = function() {
    if (0 === this.items.length) return;

    var skids2 = {}; // unique partner skeleton IDs

    // An array of synapse counts, one per item in this.items
    this.fractions = this.items.map(function(item) {
      // For every model in items
      return Object.keys(item.models).reduce((function(fractions, skid) {
        var morphology = this.morphologies[skid];
        // Collect counts of synapses with partner neurons
        var type = this.mode === this.DOWNSTREAM ? 0 : 1; // 0 is pre, 1 is post
        var partners = morphology.synapses.reduce((function(o, row) {
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
        // Filter partners and add up synapse counts
        Object.keys(partners).forEach((function(skid2) {
          var count = partners[skid2];
          if (count < this.threshold
            || (this.only && !this.only[skid2])) {
            // Add to others the counts for partner skeletons that are under threshold or not in the exclusive "only" list
            fractions.others += count;
          } else {
            // Place either into a group or by itself
            var gid = this.groupOf[skid2];
            if (gid) {
              var gcount = fractions[gid];
              fractions[gid] = (gcount ? gcount : 0) + count;
            } else {
              fractions[skid2] = count;
            }
            // SIDE EFFECT: accumulate unique skeleton IDs
            skids2[skid2] = true;
          }
        }).bind(this));
        return fractions;
      }).bind(this), {others: 0});
    }, this);

    this.other_source.clear();
    var models = Object.keys(skids2).reduce(function(o, skid2) {
      o[skid2] = new CATMAID.SkeletonModel(skid2, "", new THREE.Color(1, 1, 1));
      return o;
    }, {});
    this.other_source.append(models);

    this.redraw();
  };

  SynapseFractions.prototype.redraw = function() {
    var containerID = '#synapse_fractions' + this.widgetID,
        container = $(containerID);

    // Clear prior graph if any
    container.empty();

    // Stop if empty
    if (!this.fractions || 0 === this.fractions.length) return;

    // Load names of both pre and post skids
    CATMAID.NeuronNameService.getInstance().registerAll(
        this, this.other_source.getSkeletonModels(),
        (function() { this._redraw(container, containerID); }).bind(this));
  };

  SynapseFractions.prototype._redraw = function(container, containerID) {
    // Map of partner skeletin IDs or group IDs, vs counts of synapses across all models,
    // useful for sorting later the blocks inside each column
    var partners = this.fractions.reduce(function(o, counts) {
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

    var sorted_entries = this.sortEntries();

    if (0 === sorted_entries.length) return;

    // Turn array into map
    // Need hashable keys for d3. The objects themselves won't do.
    sorted_entries = sorted_entries.reduce(function(o, entry, i) { o[i] = entry; return o; }, {});

    var colors = (function(partner_colors, colorFn, groups) {
          var i = 0;
          return order.reduce(function(o, id) {
            var c = id < 0 ? (groups[id].autocolor ? colorFn(i++) : groups[id].color) : partner_colors[id];
            o[id] = c ? c : colorFn(i++);
            return o;
          }, {});
        })(this.partner_colors, this.colorFn, this.groups);

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
      xg.selectAll('text').
          style("text-anchor", "end")
          .attr("dx", "-0.8em")
          .attr("dy", ".15em")
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

    xg.selectAll("text")
        .attr("fill", "black")
        .attr("stroke", "none");

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
        .attr("fill", "black")
        .attr("stroke", "none");

    var state = svg.selectAll(".state")
      .data(Object.keys(sorted_entries))
      .enter()
      .append('g')
      .attr("class", "state")
      .attr("transform", function(d) { return "translate(" + x(d) + ",0)"; });

    // Sort according to order and compute cumulatives
    var prepare = function(fractions) {
      var total = 0;
      var data = order.reduce(function(a, id) {
        var count = fractions[id];
        if (!count) return a; // skid2 is not a partner
        total += count; // SIDE EFFECT
        a.push({id: id, // skid or gid
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
        return prepare(sorted_entries[index].fractions);
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
        .on('mousedown', (function(d) {
          if (d3.event.shiftKey) {
            d3.event.preventDefault();
            if (this.selected_partners.hasOwnProperty(d.id)) {
              delete this.selected_partners[d.id];
            } else {
              this.selected_partners[d.id] = true;
            }
            this.redraw();
          } else {
            if ("others" === d.id || d.id < 0) return; // negative when it is a group
            CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', d.id);
          }
        }).bind(this))
        .append('svg:title') // on mouse over
          .text((function(d) {
            var title = "";
            if (d.id == "others") title = d.id;
            else if (d.id < 0) title = this.groups[d.id].name;
            else title = CATMAID.NeuronNameService.getInstance().getName(d.id);
            return title + ": " + d.counts + " synapses";
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
        if (d3.event.shiftKey) {
          d3.event.preventDefault();
          if (this.selected_partners.hasOwnProperty(id)) {
            delete this.selected_partners[id];
          } else {
            this.selected_partners[id] = true;
          }
          this.redraw();
          return;
        }
        if ("others" === id) return;
        // negative when it is a group
        if (id < 0) {
          this.groupEditor(id);
          return;
        }
        CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', id);
      }).bind(this));

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

    od.onOK = (function() {
      if ($(remove).prop('checked')) {
        Object.keys(group.skids).forEach(function(skid) { delete this.groupOf[skid]; }, this);
        delete this.groups[id];
        this.updateGraph(); // remake this.fractions
        return;
      }
      group.name = title.value;
      if (color) group.color = color;
      group.autocolor = $(auto).prop('checked');

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
      this.createGroupFromSelected();
    }
  };

  SynapseFractions.prototype.createGroupFromSelected = function() {
    var ids = Object.keys(this.selected_partners);
    if (ids.length > 1) {
      var name = prompt("Group name", "");
      if (!name) return; // cancelled
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
      // clear selection
      this.selected_partners = {};
      // Recompute fractions and redraw
      this.updateGraph();
    } else {
      CATMAID.msg("Info", "Select at least 2 partner skeletons or groups with shift+click or by regex.");
    }
  };

  SynapseFractions.prototype.saveToFile = function() {
    var today = new Date();
    var defaultFileName = 'synapse-fractions-' + today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate() + ".json";
    var filename = prompt('File name', defaultFileName);
    if (!filename) return;

    // Missing: rotateXLabels, rotationXLabels and show_others, whose UI elements don't have IDs so the UI can't be updated.
    var data = {
      items: this.items,
      threshold: this.threshold,
      only: this.only,
      partner_colors: this.partner_colors,
      groups: this.groups,
      mode: this.mode,
      confidence_threshold: this.confidence_threshold
    };

    saveAs(new Blob([JSON.stringify(data, null, ' ')], {type: 'text/plain'}), filename);
  };

  /**
   * Does not consider the case that some skeleton IDs don't exist. Will fail gracefully.
   */
  SynapseFractions.prototype.loadFromFiles = function(files) {
      if (!CATMAID.isValidJSONFile(files)) {
        return;
      }
      this.clear();
      var self = this;

      var parse = function(json) {
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
          self.items.push(item);
          // Transform color data
          item.color = new THREE.Color(item.color.r, item.color.g, item.color.b);
          if (1 === count) {
            // Update name
            item.name = CATMAID.NeuronNameService.getInstance().getName(Object.keys(item.models)[0]);
          }
          // TODO: item.name might need an update when it is a group of more than 1 and some where repeated
        }
        // No need to transform anything for groups
        self.groups = json.groups;
        self.next_group_id = Math.min.apply(null, Object.keys(self.groups)) -1 || -1;
        // Generate groupOf
        self.groupOf = Object.keys(self.groups).reduce(function(o, gid) {
          var group = self.groups[gid];
          Object.keys(group.skids).forEach(function(skid) {
            o[skid] = gid;
          });
          return o;
        }, {});
        // Other properties
        self.confidence_threshold = Math.max(1, Math.min(5, json.confidence_threshold)) || 1;
        $('#synapse_confidence_threshold' + self.widgetID)[0].value = self.confidence_threshold;
        self.mode = Math.max(1, Math.min(2, json.mode)) || 2;
        $('#synapse_fraction_mode' + self.widgetID)[0].value = self.mode;
        self.only = json.only; // null or a map of skid vs true
        self.partner_colors = json.partner_colors; // colors in hex
        self.threshold = Math.max(0, json.threshold) || 5;
        $('#synapse_threshold' + self.widgetID)[0].value = self.threshold;

        self.updateMorphologies(Object.keys(skids));
      };
      
      var registerAndParse = function(json) {
        var pseudomodels = json.items.reduce(function(o, item) {
          $.extend(o, item.models);
          return o;
        }, {});
        CATMAID.NeuronNameService.getInstance().registerAll(self, pseudomodels, function() { parse(json); });
      };

      var reader = new FileReader();

      reader.onload = function(e) {
        var json = JSON.parse(e.target.result);
        registerAndParse(json);
      };

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

  /**
   * Select partner groups by matching text or regex.
   */
  SynapseFractions.prototype.selectPartnersByRegex = function() {
    var text = $('#sf-select-partners-regex' + this.widgetID)[0].value.trim();
    if (!text || 0 === text.length) {
      // Deselect all
      this.selected_partners = {};
      this.redraw();
    } else {
      var match = CATMAID.createTextMatchingFunction(text);
      if (match && this.fractions) {
        // Get set of unique partner skeleton IDs or group IDs
        var ids = this.fractions.reduce(function(o, counts) {
          return Object.keys(counts).reduce(function(o, id) {
            o[id] = null;
            return o;
          }, o);
        }, {});
        // Find those that match
        this.selected_partners = {};
        var getName = CATMAID.NeuronNameService.getInstance().getName;
        Object.keys(ids).forEach(function(id) {
          if (id < 0) {
            // A group
            if (match(this.groups[id].name)) this.selected_partners[id] = true;
          } else {
            // A skeleton ID
            var text = getName(id);
            if (text && match(text)) this.selected_partners[id] = true;
          }
        }, this);
        this.redraw();
      }
    }
  };

  SynapseFractions.prototype.sortEntries = function() {

    var sortByValue = this.sort_by_selected_partners
                   && this.fractions
                   && this.items.length > 1
                   && this.selected_partners
                   && Object.keys(this.selected_partners).length > 0;

    var getName = CATMAID.NeuronNameService.getInstance().getName;

    var skipFn = (function(item, i) { return !this.skip.hasOwnProperty(i); }).bind(this);

    var computeValueFn = (function(i) {
      var fractions = this.fractions[i];
      var sumFn = function(sum, id) {
        var v = fractions[id]; // might not be a partner of this item
        return sum + (v ? v : 0);
      };
      var partial = Object.keys(this.selected_partners).reduce(sumFn, 0);
      if (0 === partial) return 0;
      var total = Object.keys(fractions).reduce(sumFn, 0);
      return partial / total;
    }).bind(this);

    var makeEntryFn = (function(item, i) {
      var skids = Object.keys(item.models);
      return {item: item,
              name: 1 === skids.length ? getName(skids[0]) : item.name, // updated name for single-skeleton items
              fractions: this.fractions[i],
              value: sortByValue ? computeValueFn(i) : 0};
    }).bind(this);

    var sortFn = function(a, b) {
        if (a.value === b.value) {
          // Alphabetic when equal value
          return a.name < b.name ? -1 : 1;
        }
        // Descending
        return a.value > b.value ? -1 : 1;
    };

    return this.items
      .filter(skipFn)
      .map(makeEntryFn)
      .sort(sortFn);
  };

  SynapseFractions.prototype.exportCSV = function() {
    // TODO
  };

  SynapseFractions.prototype.exportSVG = function() {
    CATMAID.svgutil.saveDivSVG('synapse_fractions_widget' + this.widgetID, "synapse_fractions.svg");
  };

  SynapseFractions.prototype.highlight = function(skid) {
  };

  // Export synapse plot into CATMAID namespace
  CATMAID.SynapseFractions = SynapseFractions;

  CATMAID.registerWidget({
    key: "synapse-fractions",
    creator: CATMAID.SynapseFractions
  });

})(CATMAID);
