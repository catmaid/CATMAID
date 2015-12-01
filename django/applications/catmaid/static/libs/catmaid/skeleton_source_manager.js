/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  // A prototype for a manager of existing skeleton sources
  var SkeletonSourceManager = function() {
    this.sources = {};
    // Keep track of the order in which sources were added
    this.orderedSources = [];
    // Indicate if new select elements should select the last skeleton
    // source created by default.
    this.defaultSelectLastSource = true;

    // Register with neuron manager to get updates two skeletons are joined
    CATMAID.neuronController.on(CATMAID.neuronController.EVENT_SKELETONS_JOINED,
        this.replaceSkeleton, this);

    // Register with neuron manager to get updates about deleted neurons
    CATMAID.neuronController.on(CATMAID.neuronController.EVENT_SKELETON_DELETED,
      function(skeletonID) { this.removeSkeletons([skeletonID]); }, this);
  };

  SkeletonSourceManager.prototype = {};

  /**
   * Add a new source to this manager. It is references by its name
   * [source.getName()], which therefore should be unique.
   */
  SkeletonSourceManager.prototype.add = function(source) {
    this.sources[source.getName()] = source;
    this.orderedSources.push(source.getName());
  };

  /**
   * Remove a source from this manager. It is references by its name
   * [source.getName()], which therefore should be unique.
   */
  SkeletonSourceManager.prototype.remove = function(source) {
    delete this.sources[source.getName()];
    var orderIndex = this.orderedSources.indexOf(source.getName());
    if (-1 !== orderIndex) {
      this.orderedSources.splice(orderIndex, 1);
    }
    this.updateGUI();
    Object.keys(this.sources).forEach(function(name) {
      var s = this.sources[name];
      if (s.linkTarget === source) delete s.linkTarget;
    }, this);
  };

  var defaultSourceControlOptions = {
    showColorOption: true,
    showGroupOption: true,
    colors: true,
    groups: false
  };

  /**
   * Create a complete set of source management controls.
   */
  SkeletonSourceManager.prototype.createSourceControls = function(source, options) {
    options = options || defaultSourceControlOptions;
    // The panel wraps both controls and source list
    var panel = document.createElement('div');


    var controls = document.createElement('div');
    panel.appendChild(controls);

    // Source select
    var from = document.createElement('label');
    var fromSelect = this.createUnboundSelect(source.getName());
    from.appendChild(document.createTextNode('From'));
    from.appendChild(fromSelect);
    controls.appendChild(from);

    // Color checkbox
    var colorsCb = document.createElement('input');
    colorsCb.setAttribute('type', 'checkbox');
    if (options.colors) {
      colorsCb.setAttribute('checked', 'checked');
    }
    var colors = document.createElement('label');
    colors.appendChild(colorsCb);
    colors.appendChild(document.createTextNode('Use colors'));

    if (options.showColorOption) {
      controls.appendChild(colors);
    }

    // Groups
    /*
    var groupsCb = document.createElement('input');
    groupsCb.setAttribute('type', 'checkbox');
    if (options.groups) {
      groupsCb.setAttribute('checked', 'checked');
    }
    var groups = document.createElement('label');
    groups.appendChild(groupsCb);
    groups.appendChild(document.createTextNode('As group'));

    if (options.showColorOption) {
      controls.appendChild(groups);
    }
    */

    // Pull button
    var append = document.createElement('button');
    append.appendChild(document.createTextNode('Pull'));
    controls.appendChild(append);
    append.onclick = (function(e) {
      var fromSource = this.getSource(fromSelect.value);
      if (fromSource) {
        var models = fromSource.getSelectedSkeletonModels();
        source.append(models);
      }
    }).bind(this);

    // Subscriptions: combination operation
    var op = document.createElement('label');
    var opSelect = document.createElement('select');
    opSelect.options.add(new Option('Union', 'and'));
    opSelect.options.add(new Option('Subtract', 'subtract'));
    op.appendChild(document.createTextNode('Operation'));
    op.appendChild(opSelect);
    controls.appendChild(op);

    // Subscriptions: subscription mode
    var mode = document.createElement('label');
    var modeSelect = document.createElement('select');
    modeSelect.options.add(new Option('None', 'all', true, true));
    modeSelect.options.add(new Option('Only additions', 'additions-only'));
    modeSelect.options.add(new Option('Only removals', 'removals-only'));
    modeSelect.options.add(new Option('Only updates', 'updates-only'));
    mode.appendChild(document.createTextNode('Filter'));
    mode.appendChild(modeSelect);
    controls.appendChild(mode);

    // Subscriptions: go
    var subscribe = document.createElement('button');
    subscribe.appendChild(document.createTextNode('Subscribe'));
    controls.appendChild(subscribe);

    var listContainer = document.createElement('div');
    panel.appendChild(listContainer);
    panel.style.width = "100%";

    // Add a list entry for every source subscribed plus the this source
    var subscriptions = source.getSourceSubscriptions();

    // Populate a datatable
    var table = document.createElement('table');
    table.style.width = "100%";
    listContainer.appendChild(table);
    var datatable = $(table).DataTable({
      dom: "t",
      data: subscriptions,
      columns: [{
        "width": "10px",
        "render": function(data, type, row, meta) {
          return '<span class="ui-icon ui-icon-close action-remove" alt="Remove" title="Remove"></span>';
        }
      }, {
        "data": "source.getName()"
      }, {
        "render": function(data, type, row, meta) {
          var checked = row.colors ? 'checked="checked"' : '';
          return '<label><input type="checkbox" ' + checked + ' />Colors</label>'
        }
      }, {
        "render": function(data, type, row, meta) {
          return row.op;
        }
      }, {
        "render": function(data, type, row, meta) {
          return row.mode;
        }
      }],
      language: {
        "zeroRecords": "No skeleton sources subscribed to"
      }
    });

    $(table).on("click", "td .action-remove", source, function(e) {
      var tr = $(this).closest("tr");
      var subscription = datatable.row(tr).data();
      e.data.removeSubscripition(subscription);
      datatable.row(tr).remove().draw();
    });

    // Add subscription handler
    subscribe.onclick = (function(e) {
      var fromSource = this.getSource(fromSelect.value);
      if (fromSource) {
        var group;
        /*
        if (groupsCb.checked) {
          // TODO: ask for group name
          group = "Testgroup";
        }
        */
        var syncColors = colorsCb.checked;
        var op = opSelect.value;
        var mode = modeSelect.value;
        // Create and store new subscription
        var subscription = new CATMAID.SkeletonSourceSubscription(
            fromSource, syncColors, op, mode, group);
        source.addSubscription(subscription);
        // Update UI
        datatable.row.add(subscription).draw();
      }
    }).bind(this);

    return panel;
  };

  /**
   * Create a list of Option instances, one for each registered source. This is
   * useful to create select elements for all managed sources.
   */
  SkeletonSourceManager.prototype.createOptions = function() {
    return Object.keys(this.sources).sort().map(function(name) {
      return new Option(name, name);
    }, this);
  };

  /**
   * Updates all existing 'select' GUI elements listing sources. Assumes names
   * are unique.
   */
  SkeletonSourceManager.prototype.updateGUI = function() {
    var options = this.createOptions.bind(this);
    var sources = this.sources;
    $('.skeleton-source-select').each(function(index, select) {
      var name = $(this).data('name');
      var extraFilters = $(this).data('filters');

      var selectedIndex = select.selectedIndex === -1 ? 0 : select.selectedIndex;
      var selected = select.options[selectedIndex].value;
      select.options.length = select.options[0].value === 'None' ? 1 : 0; // preserve manually added initial void entry when present in push selects
      select.selectedIndex = 0;
      options().forEach(function(option, i) {
        // Ignore self
        if (option.value === name) return;
        // Ignore this option if it should be filtered.
        if (extraFilters && extraFilters.some(equals.bind(this, option.value))) {
          return;
        }

        select.options.add(option);
        if (option.value === selected) select.selectedIndex = select.options.length -1;
      });
    });
  };

  SkeletonSourceManager.prototype.createSelectID = function(source) {
    return 'skeleton-source-select-' + source.getName().replace(/ /g, '-');
  };

  SkeletonSourceManager.prototype.createSelectClass = function() {
    return 'skeleton-source-select';
  };

  /**
   * Create a select element that contains all managed skeleton sources, except
   * the specified source and the ones listed in the passed in array.
   *
   * @param source {object} Associated skeleton source.
   * @param extraFilters {String[]} Source names  that won't be shown in created select
   */
  SkeletonSourceManager.prototype.createSelect = function(source, extraFilters) {
    var select = this.createUnboundSelect(source.getName(), extraFilters);
    select.setAttribute('id', this.createSelectID(source));
    return select;
  };

  /**
   * Create a select element that contains all managed skeleton sources, except
   * the ones listed in the passed in array.
   *
   * @param name {String} A name that is associated with this select.
   * @param extraFilters {String[]} Source names that won't be shown in created select
   */
  SkeletonSourceManager.prototype.createUnboundSelect = function(name, extraFilters) {
    var select = document.createElement('select');
    select.setAttribute('class', this.createSelectClass());
    // Store name and filter information with the select
    $(select).data('name', name);
    $(select).data('filters', extraFilters);

    // Get ordererd sources up to where 'name' was added
    var nameIndex = this.orderedSources.indexOf(name);
    var selectedSourceName = this.defaultSelectLastSource && nameIndex > 0 ?
      this.orderedSources[nameIndex - 1] : SkeletonAnnotations.activeSkeleton.getName();

    this.createOptions().forEach(function(option, i) {
      // Ignore this option if it should be filtered.
      if (extraFilters && extraFilters.some(equals.bind(this, option.value))) {
        return;
      }

      if (option.value !== name) select.options.add(option);
      if (option.value === selectedSourceName) {
        option.selected = true;
        option.defaultSelected = true;
      }
    });

    return select;
  };

  SkeletonSourceManager.prototype.createPushSelect = function(source, suffix) {
    var select = document.createElement('select');
    select.setAttribute('class', this.createSelectClass());
    select.setAttribute('id', this.createSelectID(source) + '-push-' + suffix);
    select.options.add(new Option('None', 'None'));
    var name = source.getName();
    this.createOptions().forEach(function(option) {
      if (option.value !== name) select.options.add(option);
    });
    return select;
  };

  SkeletonSourceManager.prototype.getSelectedSource = function(ref_source) {
    return this.sources[$('#' + this.createSelectID(ref_source)).val()];
  };

  SkeletonSourceManager.prototype.getSelectedPushSource = function(ref_source, suffix) {
    return this.sources[$('#' + this.createSelectID(ref_source) + "-push-" + suffix).val()];
  };

  SkeletonSourceManager.prototype.getSource = function(name) {
    return this.sources[name];
  };

  SkeletonSourceManager.prototype.getSelectedSkeletons = function(ref_source) {
    var source = this.getSelectedSource(ref_source);
    if (!source) {
      console.log("No source found for reference source " + ref_source.getName());
      return [];
    }
    var skeletons = source.getSelectedSkeletons();
    if (0 === skeletons.length) {
      CATMAID.info('No skeletons available at ' + source.getName());
    }
    return skeletons;
  };

  SkeletonSourceManager.prototype.getSelectedSkeletonModels = function(ref_source) {
    var source = this.getSelectedSource(ref_source);
    if (!source) {
      console.log("No source found for reference source " + ref_source.getName());
      return [];
    }
    var models = source.getSelectedSkeletonModels();
    if (0 === models.length) {
      CATMAID.info('No skeletons selected at ' + source.getName());
    }
    return models;
  };

  /** Return the subset of models not present in source. */
  SkeletonSourceManager.prototype.findDifference = function(source, models) {
      return Object.keys(models).reduce(function(o, skid) {
        if (!source.hasSkeleton(skid)) o[skid] = models[skid];
        return o;
      }, {});
  };

  SkeletonSourceManager.prototype.highlight = function(caller, skeleton_id) {
    Object.keys(this.sources).forEach(function(name) {
      var source = this.sources[name];
      if (source === caller) return;
      source.highlight(skeleton_id);
    }, this);
  };

  SkeletonSourceManager.prototype.removeSkeletons = function(skeleton_ids) {
    Object.keys(this.sources).forEach(function(name) {
      this.sources[name].removeSkeletons(skeleton_ids);
    }, this);
  };

  SkeletonSourceManager.prototype.setVisible = function(skeleton_ids, visible) {
    Object.keys(this.sources).forEach(function(name) {
      var source = this.sources[name];
      if (typeof(source['setVisible']) === 'function') {
        source.setVisible(skeleton_ids, visible);
      }
    }, this);
  };

  /**
   * Replace a skeleton in all widgets containing it with another one. This is
   * usefult to e.g. handle the join of two skeletons.
   */
  SkeletonSourceManager.prototype.replaceSkeleton = function(oldSkeletonID, newSkeletonID) {
    // Get a list sources that refer to the deleted skeletons
    Object.keys(this.sources).forEach(function(name) {
      var source = this.sources[name];
      // If a source contains the old skeleton, it is removed and the new
      // skeleton is added.
      if (source.hasSkeleton(oldSkeletonID)) {
        // Clone the existing model as a base for the new one and update its
        // sekelton ID.
        var model = source.getSkeletonModel(oldSkeletonID).clone();
        model.id = newSkeletonID;
        // Append this modified model to the source
        var models = {};
        models[newSkeletonID] = model;
        source.append(models);
        // Remove old skeleton
        source.removeSkeletons([oldSkeletonID]);
      }
    }, this);
  };

  // Make source manager available in CATMAID namespace
  CATMAID.SkeletonSourceManager = SkeletonSourceManager;

  // Create a default instance within the CATMAID namespace
  var singleton;
  Object.defineProperty(CATMAID, "skeletonListSources", {
    get: function() {
      if (!singleton) {
        singleton = new SkeletonSourceManager();
      }
      return singleton;
    },
    set: function() { /* No setting */ }
  });

  /**
   * Helper function to  test if to values are the same.
   */
  function equals(val1, val2) {
    return val1 === val2;
  }

})(CATMAID);
