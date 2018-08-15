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

    // Register to get updates two skeletons are joined
    CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETONS_JOINED,
        this.replaceSkeleton, this);

    // Register to get updates about deleted neurons
    CATMAID.Skeletons.on(CATMAID.Skeletons.EVENT_SKELETON_DELETED,
        this.removeSkeleton, this);

    // Register to active node changes to highlight skeleton in sources
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);
  };

  SkeletonSourceManager.prototype = {};
  CATMAID.asEventSource(SkeletonSourceManager.prototype);

  /**
   * Add a new source to this manager. It is references by its name
   * [source.getName()], which therefore should be unique.
   */
  SkeletonSourceManager.prototype.add = function(source) {
    this.sources[source.getName()] = source;
    this.orderedSources.push(source.getName());
    this.updateGUI();
    this.trigger(SkeletonSourceManager.EVENT_SOURCE_ADDED, this);
  };

  SkeletonSourceManager.prototype.destroy = function() {
    CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETONS_JOINED,
        this.replaceSkeleton);
    CATMAID.Skeletons.off(CATMAID.Skeletons.EVENT_SKELETON_DELETED,
        this.removeSkeleton);
    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange);
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
    this.trigger(SkeletonSourceManager.EVENT_SOURCE_REMOVED, this);
  };

  /**
   * Get a textual representation of all subscriptions of a source.
   */
  SkeletonSourceManager.prototype.getSubscriptionExpression = function(source) {
    var subscriptions = source.getSourceSubscriptions();
    if (subscriptions && subscriptions.length > 0) {
      // Special case where only one final element is part of the expression
      if (source.ignoreLocal && 1 === subscriptions.length) {
        return 'Widget skeletons = filtered subscription skeletons';
      }
      return 'Widget skeletons = ' + subscriptions.reduce(function(o, s, i) {
        var name = 'S' + (i + 1);
        if (0 === i) {
          var union = CATMAID.SkeletonSource.operations[CATMAID.SkeletonSource.UNION];
          return source.ignoreLocal ? name : ('(local ' + union + ' ' + name + ')');
        } else {
          return '(' + o + ' ' + CATMAID.SkeletonSource.operations[s.op] + ' ' + name + ')';
        }
      }, undefined);

    } else {
      return null;
    }
  };

  var defaultSourceControlOptions = {
    showColorOption: true,
    showGroupOption: true,
    showPullOption: false,
    colors: true,
    selectionBased: true,
    groups: false,
    showIgnoreLocal: true
  };

  /**
   * Create a complete set of source management controls.
   */
  SkeletonSourceManager.prototype.createSourceControls = function(source, options) {
    options = $.extend({}, defaultSourceControlOptions, options || {});
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

    // Selection basis checkbox
    var selectedCb = document.createElement('input');
    selectedCb.setAttribute('type', 'checkbox');
    if (options.selectionBased) {
      selectedCb.setAttribute('checked', 'checked');
    }
    var selected = document.createElement('label');
    selected.appendChild(selectedCb);
    selected.appendChild(document.createTextNode('Only selected'));
    controls.appendChild(selected);

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

    if (options.showPullOption) {
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
    } else {
      // Increase whitespace a little bit
      var whitespace = document.createElement('span');
      whitespace.innerHTML = '&nbsp;';
      controls.appendChild(whitespace);
    }

    // Select default value in a select element
    var selectDefault = function(select, value) {
      for (var i=0, max=select.options.length; i<max; ++i) {
        var o = select.options[i];
        if (!value || o.value === value) {
          o.defaultSelected = o.selected = true;
          break;
        }
      }
      return select;
    };

    // Subscriptions: combination operation
    var createOpSelector = function(value) {
      var opSelect = document.createElement('select');
      opSelect.options.add(new Option('Union', CATMAID.SkeletonSource.UNION));
      opSelect.options.add(new Option('Intersection', CATMAID.SkeletonSource.INTERSECTION));
      opSelect.options.add(new Option('Difference', CATMAID.SkeletonSource.DIFFERENCE));
      var defaultValue = (undefined === value) ? CATMAID.SkeletonSource.UNION : value;
      selectDefault(opSelect, defaultValue);
      return opSelect;
    };
    var opSelect = createOpSelector();
    var op = document.createElement('label');
    op.appendChild(document.createTextNode('Operator'));
    op.setAttribute('title', 'All operators are left-associative');
    op.appendChild(opSelect);
    controls.appendChild(op);

    // Subscriptions: subscription mode
    var createModeSelector = function(value) {
      var modeSelect = document.createElement('select');
      modeSelect.options.add(new Option('None', 'all'));
      modeSelect.options.add(new Option('Only additions', 'additions-only'));
      modeSelect.options.add(new Option('Only removals', 'removals-only'));
      modeSelect.options.add(new Option('Only updates', 'updates-only'));
      selectDefault(modeSelect, value);
      return modeSelect;
    };
    var modeSelect = createModeSelector('all');
    var mode = document.createElement('label');
    mode.appendChild(document.createTextNode('Filter'));
    mode.appendChild(modeSelect);
    controls.appendChild(mode);

    // Subscriptions: go
    var subscribe = document.createElement('button');
    subscribe.appendChild(document.createTextNode('Subscribe'));
    controls.appendChild(subscribe);

    if (options.showIgnoreLocal) {
      // Ignore local checkbox
      var ignoreLocalCb = document.createElement('input');
      ignoreLocalCb.setAttribute('type', 'checkbox');
      if (source.ignoreLocal) {
        ignoreLocalCb.setAttribute('checked', 'checked');
      }
      var ignoreLocal = document.createElement('label');
      ignoreLocal.appendChild(ignoreLocalCb);
      ignoreLocal.appendChild(document.createTextNode('Override existing'));
      ignoreLocal.setAttribute('title', 'If unchecked, subscriptions will be ' +
          'applied starting from the local model set.');
      controls.appendChild(ignoreLocal);

      ignoreLocalCb.onchange = function(e) {
        source.ignoreLocal = this.checked;
        datatable.rows(0).invalidate().draw();
      };
    }

    var helpButton = document.createElement('span');
    helpButton.setAttribute('class', 'extra-button');
    controls.appendChild(helpButton);
    var help = document.createElement('a');
    help.appendChild(document.createTextNode('?'));
    help.href = CATMAID.makeDocURL('user_faq.html#faq-source-subscriptions');
    help.target = '_blank';
    helpButton.appendChild(help);


    var listContainer = document.createElement('div');
    panel.appendChild(listContainer);
    panel.style.width = "100%";

    // Add a list entry for every source subscribed plus the this source
    var subscriptions = source.getSourceSubscriptions() || [];

    if (subscriptions.length < 1) {
      // Disable operators
    }

    // Populate a datatable
    var table = document.createElement('table');
    table.style.width = "100%";
    listContainer.appendChild(table);
    var datatable = $(table).DataTable({
      dom: "ti",
      data: subscriptions,
      infoCallback: this.getSubscriptionExpression.bind(this, source),
      autoWidth: false,
      columns: [{
        "width": "10px",
        "render": function(data, type, row, meta) {
          return '<span class="ui-icon ui-icon-close action-remove" alt="Remove" title="Remove"></span>';
        }
      }, {
        "data": "source.getName()"
      }, {
        "width": "10%",
        "render": function(data, type, row, meta) {
          var checked = row.colors ? 'checked="checked"' : '';
          return '<label><input class="action-colors" type="checkbox" ' +
              checked + ' />Colors</label>';
        }
      }, {
        "width": "10%",
        "render": function(data, type, row, meta) {
          if (0 === meta.row) {
            return (!row.target || row.target.ignoreLocal) ?
              '-' : "Union with local";
          } else {
            var opSelector = createOpSelector(row.op);
            opSelector.setAttribute('class', 'action-changeop');
            return opSelector.outerHTML;
          }
        }
      }, {
        "width": "10%",
        "render": function(data, type, row, meta) {
          var modeSelector = createModeSelector(row.mode);
          modeSelector.setAttribute('class', 'action-changemode');
          return modeSelector.outerHTML;
        }
      }],
      language: {
        "zeroRecords": "No skeleton sources subscribed to"
      }
    });

    $(table).on("click", "td .action-remove", source, function(e) {
      var tr = $(this).closest("tr");
      var subscription = datatable.row(tr).data();
      e.data.removeSubscription(subscription);
      datatable.row(tr).remove().draw();
    });
    $(table).on("change", "td .action-colors", source, function(e) {
      var tr = $(this).closest("tr");
      var subscription = datatable.row(tr).data();
      subscription.colors = this.checked;
      subscription.target.loadSubscriptions();
    });
    $(table).on("change", "td .action-changeop", source, function(e) {
      var tr = $(this).closest("tr");
      var subscription = datatable.row(tr).data();
      subscription.op = this.value;
      subscription.target.loadSubscriptions();
    });
    $(table).on("change", "td .action-changemode", source, function(e) {
      var tr = $(this).closest("tr");
      var subscription = datatable.row(tr).data();
      subscription.setMode(this.value);
      subscription.target.loadSubscriptions();
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
        var selectionBased = selectedCb.checked;
        // Create and store new subscription
        var subscription = new CATMAID.SkeletonSourceSubscription(
            fromSource, syncColors, selectionBased, op, mode, group);
        try {
          source.addSubscription(subscription);
          // Update UI
          datatable.row.add(subscription).draw();
        } catch (error) {
          if (error instanceof CATMAID.SubscriptionError) {
            CATMAID.warn(error.message);
          } else {
            CATMAID.handleError(error);
          }
        }
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
      var nEntries = select.options.length;

      var selectedIndex = (nEntries > 0 && select.selectedIndex === -1) ?
          0 : select.selectedIndex;
      var selected = selectedIndex === -1 ? null : select.options[selectedIndex].value;
      select.options.length = (nEntries > 0 && select.options[0].value === 'None') ?
          1 : 0; // preserve manually added initial void entry when present in push selects
      select.selectedIndex = 0;
      options().forEach(function(option, i) {
        // Ignore self
        if (option.value === name) return;
        // Ignore this option if it should be filtered.
        if (extraFilters && extraFilters.some(equals.bind(this, option.value))) {
          return;
        }

        select.options.add(option);
        if (selectedIndex !== -1 && option.value === selected) {
          select.selectedIndex = select.options.length - 1;
        }
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
    var selectLast = this.defaultSelectLastSource && nameIndex > 0;
    var currentIndex = nameIndex - 1;
    while (currentIndex > 0) {
      if (this.sources[this.orderedSources[currentIndex]].noDefaultSelection) {
        --currentIndex;
      } else {
        break;
      }
    }
    var selectedSourceName = selectLast ? this.orderedSources[currentIndex] :
        SkeletonAnnotations.activeSkeleton.getName();

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

  SkeletonSourceManager.prototype.getSourceNames = function() {
    return Object.keys(this.sources);
  };

  SkeletonSourceManager.prototype.getSelectedSkeletons = function(ref_source, silent) {
    var source = this.getSelectedSource(ref_source);
    if (!source) {
      console.log("No source found for reference source " + ref_source.getName());
      return [];
    }
    var skeletons = source.getSelectedSkeletons();
    if (0 === skeletons.length && !silent) {
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

  /**
   * React to a node change event by selecting this node in all souces.
   */
  SkeletonSourceManager.prototype.handleActiveNodeChange = function(node, skeletonChanged) {
    // (de)highlight in SkeletonSource instances if any if different from the last
    // activated skeleton
    if (skeletonChanged) {
      this.highlight(SkeletonAnnotations.activeSkeleton, node.skeleton_id);
    }
  };

  SkeletonSourceManager.prototype.highlight = function(caller, skeleton_id) {
    Object.keys(this.sources).forEach(function(name) {
      var source = this.sources[name];
      if (source === caller) return;
      source.highlight(skeleton_id);
    }, this);
  };

  SkeletonSourceManager.prototype.removeSkeleton = function(skeletonID) {
    return this.removeSkeletons([skeletonID]);
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

  /**
   * Get sources registered to a particular owner.
   *
   * @param {Object} owner Owner of source
   *
   * @returns A list of skeleton sources having the passed in owner. This list
   *          is empty of no owner is found.
   */
  SkeletonSourceManager.prototype.getSourcesOfOwner = function(owner) {
    return this.orderedSources.filter(function(sourceName) {
      var source = this.sources[sourceName];
      return source.owner === owner || source === owner;
    }, this).map(function(sourceName) {
      return this.sources[sourceName];
    }, this);
  };

  // Events
  SkeletonSourceManager.EVENT_SOURCE_ADDED = "skeleton_source_added";
  SkeletonSourceManager.EVENT_SOURCE_REMOVED = "skeleton_source_removed";

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
