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
    this.modes = ['skeleton-pairs', 'matching-pairs', 'pair-statistics'];

    this.neuronNameService = CATMAID.NeuronNameService.getInstance();

    // Filter all annotations using a simple filter, optionally interpreted as a
    // regular expression when it starts with "/".
    this.annotationFilter = '';
    this.metaAnnotationFilter = '';
    this.annotationGroupingPattern = '/(.*)_([lr])';
    this.minGroupInstances = 2;
    this.maxGroupInstances = 2;

    // Annotation groups
    this.groups = new Map();
    this.extraGroups = new Map();

    // Matching parameters
    this.newMatchName = '';

    // Group completeness parameters
    this.mainMaxOpenEnds = 0.03;
    this.mainMinNodes = 500;
    this.mainMinCable = 0;
    this.mainIgnoreFragments = true;

    // Extra group completeness parameters
    this.extraMaxOpenEnds = 0.05;
    this.extraMinNodes = 300;
    this.extraMinCable = 0;
    this.extraIgnoreFragments = false;

    this.groupSources = [];

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
    this.clearGroupSources();
  };

  PairStatisticsWidget.prototype.clearGroupSources = function() {
    for (let i=0; i<this.groupSources; ++i) {
      this.groupSources[i].destroy();
    }
    this.groupSources.length = [];
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

  /**
   * Take all neurons that are grouped by the annotation configuration in the
   * first tab (active neurons), remove incomple ones and match pairs between
   * the groups.
   */
  PairStatisticsWidget.prototype.matchActiveNeurons = function() {
    
  };

  PairStatisticsWidget.extractSubGroupSets = function(source, target) {
    return Array.from(source.keys()).reduce((t,g) => {
              let subgroups = source.get(g);
              for (let [sg, aid] of subgroups.entries()) {
                if (!t.has(sg)) {
                  t.set(sg, new Set());
                }
                t.get(sg).add(aid);
              }
              return t;
            }, target);
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
                // Store latest copy in widget
                widget.groups = groups;
                // Update table
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
    'matching-pairs': {
      title: 'Matching pairs',
      createControls: function(target) {
        let controls = [];

        controls.push({
          type: 'text',
          label: 'Match name',
          value: target.newGroupName,
          placeholder: '(optional)',
          onchange: e => {
            target.newGroupName = e.target.value;
          },
        });

        let mainCompletenessSection = document.createElement('span');
        mainCompletenessSection.classList.add('section-header');
        mainCompletenessSection.appendChild(document.createTextNode('Main completeness'));
        mainCompletenessSection.title = 'Completeness properties for all neurons ' +
            'annotated with annotations from the primary annotation grouping in the first tab.';
        controls.push({
          type: 'child',
          element: mainCompletenessSection,
        });

        controls.push({
          type: 'numeric',
          label: 'Max open ends',
          title: 'The percentage of of open ends per neurons to be considered complete.',
          value: target.mainMaxOpenEnds,
          length: 4,
          min: 0,
          max: 1,
          step: 0.01,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.mainMaxOpenEnds = value;
          }
        });

        controls.push({
          type: 'numeric',
          label: 'Min nodes',
          title: 'The minimum number of nodes for a neuron to be considered complete.',
          value: target.mainMinNodes,
          length: 4,
          min: 0,
          step: 50,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.mainMinNodes = value;
          }
        });

        controls.push({
          type: 'numeric',
          label: 'Min cable',
          title: 'The minimum cable length in nm for a neuron to be considered complete.',
          value: target.mainMinCable,
          length: 5,
          min: 0,
          step: 500,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.mainMinCable = value;
          }
        });

        controls.push({
          type: 'checkbox',
          label: 'Ignore fragments',
          title: 'Ignore all neurons that don\'t have a node tagged "soma" or a node tagged "out to nerve"',
          value: target.mainIgnoreFragments,
          onchange: e => {
            target.mainIgnoreFragments = e.target.checked;
          }
        });

        let extraCompletenessSection = document.createElement('span');
        extraCompletenessSection.classList.add('section-header');
        extraCompletenessSection.appendChild(document.createTextNode('Extra completeness'));
        mainCompletenessSection.title = 'Completeness properties for all neurons ' +
            'annotated with annotations from the extra annotation grouping in the first tab.';
        controls.push({
          type: 'child',
          element: extraCompletenessSection,
        });

        controls.push({
          type: 'numeric',
          label: 'Max open ends',
          title: 'The percentage of of open ends per neurons to be considered complete.',
          value: target.extraMaxOpenEnds,
          length: 4,
          min: 0,
          max: 1,
          step: 0.01,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.extraMaxOpenEnds = value;
          }
        });

        controls.push({
          type: 'numeric',
          label: 'Min nodes',
          title: 'The minimum number of nodes for a neuron to be considered complete.',
          value: target.extraMinNodes,
          length: 4,
          min: 0,
          step: 50,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.extraMinNodes = value;
          }
        });

        controls.push({
          type: 'numeric',
          label: 'Min cable',
          title: 'The minimum cable length in nm for a neuron to be considered complete.',
          value: target.extraMinCable,
          length: 5,
          min: 0,
          step: 500,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.extraMinCable = value;
          }
        });

        controls.push({
          type: 'checkbox',
          label: 'Ignore fragments',
          title: 'Ignore all neurons that don\'t have a node tagged "soma" or a node tagged "out to nerve"',
          value: target.extraIgnoreFragments,
          onchange: e => {
            target.extraIgnoreFragments = e.target.checked;
          }
        });

        // Filter complete
        controls.push({
          type: 'button',
          label: 'Match complete pairs',
          title: 'Find all matching skeleton pairs between active annotation groups',
          onclick: e => {
            target.matchActiveNeurons();
            target.update();
          },
        });

        return controls;
      },
      createContent: function(content, widget) {
        let currentGroupsHeader = content.appendChild(document.createElement('h1'));
        currentGroupsHeader.style.clear = 'both';
        currentGroupsHeader.appendChild(document.createTextNode('Active groups'));

        // Map subgroup identifier to sets of annotations
        let subGroupMap = new Map();
        PairStatisticsWidget.extractSubGroupSets(widget.groups, subGroupMap);
        PairStatisticsWidget.extractSubGroupSets(widget.extraGroups, subGroupMap);

        let annotationIdSet = new Set();
        for (let [sg, annotations] of subGroupMap.entries()) {
          annotationIdSet = annotationIdSet.union(annotations);
        }
        let annotationIds = Array.from(annotationIdSet);

        let subGroupList = content.appendChild(document.createElement('p'));
        if (subGroupMap.size === 0) {
          subGroupList.appendChild(document.createTextNode('Could not find any sub-groups'));
        } else {
          subGroupList.style.display = 'flex';
          subGroupList.style.flexWrap = 'wrap';
        }

        let prepare = [
          // Get skeletons for all annotations. Combining multiple annotations
          // in one entry, results in an OR query
          CATMAID.fetch(project.id + '/annotations/query-targets', 'POST', {
            'annotated_with': [annotationIds.join(',')],
            'annotation_reference': 'id',
            'type': ['neuron'],
            'with_annotations': true,
          }),
        ];

        Promise.all(prepare)
          .then(results => {
            let annotationMap = results[0].entities.reduce((t, e) => {
              for (let i=0; i<e.annotations.length; ++i) {
                let annotation = e.annotations[i];
                if (!t.has(annotation.id)) {
                  t.set(annotation.id, new Set());
                }
                let targetSet = t.get(annotation.id);
                for (let i=0; i<e.skeleton_ids.length; ++i) {
                  targetSet.add(e.skeleton_ids[i]);
                }
              }
              return t;
            }, new Map());

            widget.clearGroupSources();

            let skeletonIds = results[0];
            if (subGroupMap.size > 0) {
              let lut = new THREE.Lut("rainbow", annotationIds.length);
              lut.setMin(0);
              lut.setMax(annotationIds.length);
              // List number of active neurons for all available groups and update
              // skeleton sources.
              let counter = 0;
              for (let [sg, annotationIds] of subGroupMap.entries()) {
                let source = new CATMAID.BasicSkeletonSource('Pair statistics - sub-group ' + sg);
                widget.groupSources.push(source);

                let span1 = subGroupList.appendChild(document.createElement('span'));
                span1.style.width = '10%';
                span1.appendChild(document.createTextNode(sg));
                let annotationNames = Array.from(annotationIds).map(e => {
                  let color = lut.getColor(counter);
                  ++counter;

                  let name = CATMAID.annotations.getName(e);
                  let skeletonIds = Array.from(annotationMap.get(e));

                  let skeletonModels = skeletonIds ? skeletonIds.reduce((o,e) => {
                    o[e] = new CATMAID.SkeletonModel(e, undefined, color);
                    return o;
                  }, {}) : null;
                  if (skeletonModels) {
                    source.append(skeletonModels);
                  }

                  let skeletonLinks = skeletonIds ?
                      skeletonIds.map(skid => `<a class="neuron-selection-link" href="#" data-id="${skid}">${skid}</a>`) :
                      ['(none)'];
                  return `${name}: ${skeletonLinks.join(', ')}`;
                });
                let span2 = subGroupList.appendChild(document.createElement('span'));
                span2.style.width = '85%';
                span2.innerHTML = annotationNames.join(', ');
              }
            }

            // List matching ID pair information
          })
          .catch(CATMAID.handleError);

        $(subGroupList).on('click', 'a[data-id]', e => {
          let id = Number(e.target.dataset.id);
          if (Number.isNaN(id)) {
            CATMAID.warn("Could not parse ID: " + e.target.dataset.id);
            return;
          }
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', id);
        });

        let matchingPairsHeader = content.appendChild(document.createElement('h1'));
        matchingPairsHeader.style.clear = 'both';
        matchingPairsHeader.appendChild(document.createTextNode('Matching pairs'));
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
