/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Compute statistics on pairs of neurons, e.g. to find homologues.
   */
  var PairStatisticsWidget = function(options)
  {
    this.widgetID = this.registerInstance();
    this.idPrefix = `pair-statistics-widget${this.widgetID}-`;

    // The current edit mode
    this.mode = 'skeleton-pairs';
    this.modes = ['skeleton-pairs', 'pair-statistics'];

    this.neuronNameService = CATMAID.NeuronNameService.getInstance();

    // Filter all annotations using a simple filter, optionally interpreted as a
    // regular expression when it starts with "/".
    this.annotationFilter = '';
    this.metaAnnotationFilter = '';
    this.annotationGroupingPattern = '/(.*)_([lr])';
    this.minGroupInstances = 2;
    this.maxGroupInstances = 2;
    this.extraGroups = new Map();

    // Some parts of the widget need to update when skeleton sources are added
    // or removed.
    CATMAID.skeletonListSources.on(CATMAID.SkeletonSourceManager.EVENT_SOURCE_ADDED,
        this.handleUpdatedSkeletonSources, this);
    CATMAID.skeletonListSources.on(CATMAID.SkeletonSourceManager.EVENT_SOURCE_REMOVED,
        this.handleUpdatedSkeletonSources, this);
  };


  PairStatisticsWidget.prototype = {};
  PairStatisticsWidget.prototype.constructor = PairStatisticsWidget;
  $.extend(PairStatisticsWidget.prototype, new InstanceRegistry());

  PairStatisticsWidget.prototype.getName = function() {
    return "Pair statistics " + this.widgetID;
  };

  PairStatisticsWidget.prototype.destroy = function() {
    this.unregisterInstance();
    this.neuronNameService.unregister(this);
    CATMAID.skeletonListSources.off(CATMAID.SkeletonSourceManager.EVENT_SOURCE_ADDED,
        this.handleUpdatedSkeletonSources, this);
    CATMAID.skeletonListSources.off(CATMAID.SkeletonSourceManager.EVENT_SOURCE_REMOVED,
        this.handleUpdatedSkeletonSources, this);
  };

  PairStatisticsWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var self = this;
        var tabNames = this.modes.map(m => PairStatisticsWidget.MODES[m].title);
        var tabs = CATMAID.DOM.addTabGroup(controls, '-pair-statistics', tabNames);
        this.modes.forEach((mode, i) => {
          var mode = PairStatisticsWidget.MODES[mode];
          var tab = tabs[mode.title];
          CATMAID.DOM.appendToTab(tab, mode.createControls(this));
          tab.dataset.index = i;
        });
        this.controls = controls;
        this.tabControls = $(controls).tabs({
          active: this.modes.indexOf(this.mode),
          activate: function(event, ui) {
            var oldStepIndex = parseInt(ui.oldPanel.attr('data-index'), 10);
            var newStepIndex = parseInt(ui.newPanel.attr('data-index'), 10);

            var tabs = $(self.tabControls);
            var activeIndex = tabs.tabs('option', 'active');
            if (activeIndex !== self.modes.indexOf(self.mode)) {
              if (!self.setMode(self.modes[activeIndex])) {
                // Return to old tab if selection was unsuccessful
                if (oldStepIndex !== newStepIndex) {
                  $(event.target).tabs('option', 'active', oldStepIndex);
                }
              }
              self.update();
            }
          }
        });
      },
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        this.content = content;
      },
      init: function() {
        this.updateEnvironment()
          .then(() => this.update());
      },
      helpPath: 'pair-statistics.html',
    };
  };

  PairStatisticsWidget.prototype.refresh = function() {
    this.update();
    //if (this.landmarkDataTable) {
    //  this.landmarkDataTable.rows().invalidate();
    //}
  };

  /**
   * Updaet display targets.
   */
  PairStatisticsWidget.prototype.handleUpdatedSkeletonSources = function() {
    if (!this.controls) {
      return;
    }
  };

  PairStatisticsWidget.prototype.updateEnvironment = function() {
    return Promise.all([
      CATMAID.annotations.update(),
    ]);
  };

  PairStatisticsWidget.prototype.update = function() {
    // Clear content
    while (this.content.lastChild) {
      this.content.removeChild(this.content.lastChild);
    }
    var tabs = $(this.tabControls);
    var activeIndex = tabs.tabs('option', 'active');
    var widgetIndex = this.modes.indexOf(this.mode);
    if (activeIndex !== widgetIndex) {
      tabs.tabs('option', 'active', widgetIndex);
    }

    // Update actual content
    let mode = PairStatisticsWidget.MODES[this.mode];
    mode.createContent(this.content, this);
  };

  PairStatisticsWidget.prototype.setMode = function(mode) {
    var index = this.modes.indexOf(mode);
    if (index === -1) {
      throw new CATMAID.ValueError('Unknown Pair Statistics Widget mode: ' + mode);
    }
    this.mode = mode;
    this.update();
    return true;
  };

  PairStatisticsWidget.MODES = {
    'skeleton-pairs': {
      title: 'Skeleton pairs',
      createControls: function(target) {
        let controls = [];

        // Annotation filter
        let updateAnnotationFilter = (e) => {
          target.annotationFilter = e.target.value;
          target.refresh();
        };
        controls.push({
          type: 'child',
          element: CATMAID.DOM.createInput('text', undefined, 'Annotation filter',
            'A simple search pattern or regular expression (if started with "/") that ' +
            'acts as a filter for all annotations. All remaining annotations form the ' +
            'pool of possible grouping annotations or additional meta-annotation filtering.',
            target.annotationFilter, undefined, updateAnnotationFilter, 8, 'Use / for RegEx',
            false, updateAnnotationFilter)
        });

        // Meta annotation
        let updateMetaAnnotationFilter = (e) => {
          target.metaAnnotationFilter = e.target.value;
          target.refresh();
        };
        controls.push({
          type: 'child',
          element: CATMAID.DOM.createInput('text', undefined, 'Meta-annotation',
            'Select a meta-annotation that candidate annotations need to have.',
            target.metaAnnotationFilter, undefined, updateMetaAnnotationFilter, 8, '(none)',
            false, updateMetaAnnotationFilter),
        });

        // Group/Subgroup pattern
        let updateGroupingPattern = (e) => {
          target.annotationGroupingPattern = e.target.value;
          target.refresh();
        };
        controls.push({
          type: 'child',
          element: CATMAID.DOM.createInput('text', undefined, 'Grouping pattern',
            'Define a regular expression that selects two groups: common group name ' +
            'and subgroup. E.g. consider annotations of the form BAla12_l and BAla12_r. ' +
            'They and others follow the form "group_subgroup". A pattern for this type ' +
            'of annotation name could be "/(.*)_([rl])". The parentheses represent ' +
            'groups, and exactly two need to be matched. This pattern would for ' +
            'instance match the annotations BAla12_l and BAla12_r into the common group ' +
            'name BAla12 with the two sub groups "l" and "r".',
            target.annotationGroupingPattern, undefined, updateGroupingPattern, 10,
            '(none)', false, updateGroupingPattern),
        });

        // Min subgroups
        controls.push({
          type: 'numeric',
          label: 'Min subgroups',
          title: 'The minimum number of sub-groups per group.',
          value: target.minGroupInstances,
          length: 3,
          onchange: (e) => {
            let value = Number(e.target.value);
            if (!Number.isNaN(value)) {
              target.minGroupInstances = Math.floor(value);
              target.refresh();
            }
          }
        });

        // Max subgroups
        controls.push({
          type: 'numeric',
          label: 'Max subgroups',
          title: 'The maximum number of sub-groups per group.',
          value: target.maxGroupInstances,
          length: 3,
          onchange: (e) => {
            let value = Number(e.target.value);
            if (!Number.isNaN(value)) {
              target.maxGroupInstances = Math.floor(value);
              target.refresh();
            }
          }
        });

        // Add groups/subgroups manually through a custom drop down
        let newGroupingSection = document.createElement('span');
        newGroupingSection.classList.add('section-header');
        newGroupingSection.appendChild(document.createTextNode('New group'));
        controls.push({
          type: 'child',
          element: newGroupingSection,
        });

        let newGroupName = '';
        controls.push({
          type: 'text',
          label: 'Group name',
          title: 'The name of the new group',
          onchange: (e) => newGroupName = e.target.value,
        });

        let newSubGroupName = '';
        controls.push({
          type: 'text',
          label: 'Subgroups',
          title: 'The name of each subgroup, along with its annotation. ' +
            'Each entry is comma separated from other and of the form ' +
            '"subgroup|annotation", e.g. "l|Brain&SEZ sensory left, r|Brain&SEZ sensory right".',
          onchange: (e) => newSubGroupName = e.target.value,
        });

        controls.push({
          type: 'button',
          label: 'Add',
          onclick: (e) => {
            if (!newGroupName || !newGroupName.length) {
              CATMAID.warn('Need valid group name');
              return;
            }
            if (!newSubGroupName || !newSubGroupName.length) {
              CATMAID.warn('Need valid sub-group name(s)');
              return;
            }
            let subGroupEntries = newSubGroupName.split(',').map(e => e.trim());
            if (!subGroupEntries || !subGroupEntries.length) {
              CATMAID.warn('Need valid sub-group name(s)');
              return;
            }
            let subGroups = new Map(subGroupEntries.map(sge => {
              let parts = sge.split('|');
              if (!parts || parts.length !== 2) {
                CATMAID.warn('Could not parse extra sub-group entry: ' + sge);
                return null;
              }
              let annotationId = CATMAID.annotations.getID(parts[1]);
              if (annotationId === undefined || annotationId === null) {
                CATMAID.warn('Could not find ID for annotation: ' + parts[1]);
                return null;
              }
              return [parts[0], annotationId];
            }).filter(sge => sge !== null));
            // Add extra groups
            target.extraGroups.set(newGroupName, subGroups);
            CATMAID.msg('Success', 'Added new extra group: ' + newGroupName);
            target.update();
          },
        });

        // Global parameters:
        // Max open ends (0.03)
        // Min node count (500)
        // Allow fragments (false)
        // Pair meta annotation: ('')
        // Skip annotation list: ([])

        return controls;
      },
      createContent: function(content, widget) {
        // Show table with current groups and sub groups.
        let groupTable = content.appendChild(document.createElement('table'));
        groupTable.appendChild(document.createElement('thead'));
        groupTable.appendChild(document.createElement('tbody'));

        let groupDataTable = $(groupTable).DataTable({
          dom: "lfrtip",
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          paging: true,
          order: [[0, 0]],
          ajax: (data, callback, settings) => {
            // Recompute groups and sub-groups
            CATMAID.Annotations.findGroupsAndSubgroups(
                widget.annotationFilter, widget.metaAnnotationFilter,
                widget.annotationGroupingPattern, widget.minGroupInstances,
                widget.maxGroupInstances, CATMAID.annotations)
              .then(groups => {
                callback({
                  'draw': data.draw,
                  'data': Array.from(groups.keys()).reduce((o,k) => {
                    o.push([
                      k,
                      Array.from(groups.get(k).keys()),
                      Array.from(groups.get(k).values()).map(id => CATMAID.annotations.getName(id)),
                    ]);
                    return o;
                  }, []),
                });
              })
              .catch(CATMAID.handleError);
          },
          columns: [{
            name: 'Group',
            width: '25%',
          }, {
            name: 'Sub-groups',
            render: function(data, type, row, meta) {
              return data.join(', ');
            },
          }, {
            name: 'Sub-group annotations',
            render: function(data, type, row, meta) {
              return data.join(', ');
            },
          }],
        });

        // Show table with extra groups
        let extraGroupHeader = content.appendChild(document.createElement('h1'));
        extraGroupHeader.style.clear = 'both';
        extraGroupHeader.appendChild(document.createTextNode('Extra groups'));
        let extraGroupTable = content.appendChild(document.createElement('table'));
        extraGroupTable.appendChild(document.createElement('thead'));
        extraGroupTable.appendChild(document.createElement('tbody'));

        let extraGroupDataTable = $(extraGroupTable).DataTable({
          dom: "lfrtip",
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          paging: true,
          order: [[0, 0]],
          ajax: (data, callback, settings) => {
            callback({
              'draw': data.draw,
              'data': Array.from(widget.extraGroups.keys()).reduce((o,k) => {
                o.push([
                  k,
                  Array.from(widget.extraGroups.get(k).keys()),
                  Array.from(widget.extraGroups.get(k).values()).map(id => CATMAID.annotations.getName(id)),
                ]);
                return o;
              }, []),
            });
          },
          columns: [{
            name: 'Group',
            width: '25%',
          }, {
            name: 'Sub-groups',
            render: function(data, type, row, meta) {
              return data.join(', ');
            },
          }, {
            name: 'Sub-group annotations',
            render: function(data, type, row, meta) {
              return data.join(', ');
            },
          }, {
            name: 'Action',
            render: function(data, type, row, meta) {
              return '<a href="#" data-role="delete-extra-group">Delete</a>';
            },
          }],
        }).on('click', 'a[data-role=delete-extra-group]', (e) => {
          var table = $(e.target).closest('table');
          var tr = $(e.target).closest('tr');
          var data =  $(table).DataTable().row(tr).data();
          widget.extraGroups.delete(data[0]);
          widget.update();
        });
      }
    },
    'pair-statistics': {
      title: 'Pair statistics',
      createControls: function(target) {
        return [];
      },
      createContent: function(content, widget) {
      }
    },
  };

  // Export widget
  CATMAID.PairStatisticsWidget = PairStatisticsWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Pair statistics",
    description: "Get information on similarity of pairs of neurons, e.g. to find homologues.",
    key: "pair-statistics",
    creator: PairStatisticsWidget,
    state: {
      getState: function(widget) {
        return {
          //importAllowNonEmptyGroups: widget.importAllowNonEmptyGroups,
        };
      },
      setState: function(widget, state) {
        //CATMAID.tools.copyIfDefined(state, widget, 'importAllowNonEmptyGroups');
      }
    }
  });

})(CATMAID);
