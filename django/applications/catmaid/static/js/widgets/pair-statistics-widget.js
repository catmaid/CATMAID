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
    this.mode = 'groups';
    this.modes = ['groups', 'matching-pairs', 'pair-statistics'];

    this.neuronNameService = CATMAID.NeuronNameService.getInstance();

    // Filter all annotations using a simple filter, optionally interpreted as a
    // regular expression when it starts with "/".
    this.annotationFilter = '';
    this.metaAnnotationFilter = '';
    this.annotationGroupingPattern = '/(.*)_([lr])';
    this.minGroupInstances = 2;
    this.maxGroupInstances = 2;
    // Whether or not to do completeness tests for skeletons.
    this.useOnlyCompleteSkeletons = true;
    // How many skeletons to query completeness for at a time.
    this.completenessBatchSize = 100;

    // Annotation groups
    this.groups = new Map();
    this.extraGroups = new Map();

    // Matching parameters
    this.pairingMetaAnnotation = '';

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
                self.update();
              }
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

  PairStatisticsWidget.prototype.updateMatchReport = function() {
    return Promise.resolve();
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

  PairStatisticsWidget.updatePairSource = function(source, pairs) {
    // Update unmatched same group
    let lut = new THREE.Lut("rainbow", pairs.length);
    lut.setMin(0);
    lut.setMax(pairs.length);
    let counter = 0;
    let models = {};
    for (let pair of pairs) {
      let color = lut.getColor(counter);
      models[pair[0]] = new CATMAID.SkeletonModel(pair[0], undefined, color);
      models[pair[1]] = new CATMAID.SkeletonModel(pair[1], undefined, color);
      ++counter;
    }
    source.append(models);
  };

  PairStatisticsWidget.addPairListElements = function(target, pairs, friendlyName) {
    let selectedPairNames = pairs.map((pair, i) => {
      let name = `${i+1}`;
      let skeletonLinks = pair.map(skid => {
        return `<a class="neuron-selection-link" href="#" data-id="${skid}">${skid}</a>`;
      });
      return `<span class="neuron-link-group">${name}</span>: ${skeletonLinks.join(', ')}`;
    });
    let selectedPairList = target.appendChild(document.createElement('p'));
    if (pairs.length === 0) {
      selectedPairList.appendChild(document.createTextNode(`Could not find any ${friendlyName} pairs`));
    } else {
      selectedPairList.style.display = 'flex';
      selectedPairList.style.flexWrap = 'wrap';
    }
    let span = selectedPairList.appendChild(document.createElement('span'));
    span.style.width = '85%';
    span.innerHTML = selectedPairNames.join(', ');
  };

  PairStatisticsWidget.MODES = {
    'groups': {
      title: 'Groups',
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
        groupTable.style.width = '100%';
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
            title: 'Group',
            width: '25%',
          }, {
            title: 'Sub-groups',
            render: function(data, type, row, meta) {
              return data.join(', ');
            },
          }, {
            title: 'Sub-group annotations',
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
        extraGroupTable.style.width = '100%';
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
          type: 'numeric',
          label: 'Batch size',
          title: 'The number skeletons per completeness query. This can be tuned to get more throughput depending on the server setup.',
          value: target.completenessBatchSize,
          length: 4,
          min: 0,
          max: 10,
          step: 1,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.completenessBatchSize = Math.floor(value);
          }
        });

        controls.push({
          type: 'checkbox',
          label: 'Only completed neurons',
          title: 'Only completed neurons will be considered for pair statistics.',
          value: target.useOnlyCompleteSkeletons,
          onchange: e => {
            target.useOnlyCompleteSkeletons = e.target.checked;
          }
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

        let pairingSection = document.createElement('span');
        pairingSection.classList.add('section-header');
        pairingSection.appendChild(document.createTextNode('Pairing'));
        mainCompletenessSection.title = 'Pairing properties for all subgroup skeletons.';
        controls.push({
          type: 'child',
          element: pairingSection,
        });

        controls.push({
          type: 'text',
          label: 'Pairing meta-annotation',
          value: target.pairingMetaAnnotation,
          onchange: e => {
            target.pairingMetaAnnotation = e.target.value;
          },
        });

        // Filter complete
        controls.push({
          type: 'button',
          label: 'Match pairs',
          title: 'Find all matching skeleton pairs between active annotation groups',
          onclick: e => {
            target.updateMatchReport()
              .then(() => target.update())
              .catch(CATMAID.handleError);
          },
        });

        return controls;
      },
      createContent: function(content, widget) {
        let currentGroupContainer = CATMAID.DOM.addResultContainer(content,
            "Active groups", true, true, true)[0];
        let matchingPairsContainer = CATMAID.DOM.addResultContainer(content,
            "Matched pairs across sub-groups", false, true, true)[0];
        let ipsiPairsContainer = CATMAID.DOM.addResultContainer(content,
            "Pairs in same sub-group", true, true, true)[0];
        let contraPairsContainer = CATMAID.DOM.addResultContainer(content,
            "Unmatched pairs across sub-groups (having one matched skeleton)", true, true, true)[0];

        // Map subgroup identifier to sets of annotations
        let mainAnnotationMap = CATMAID.SkeletonMatching.extractSubGroupSets(widget.groups);
        let extraAnnotationMap = CATMAID.SkeletonMatching.extractSubGroupSets(widget.extraGroups);
        let subGroupMap = new Map([...mainAnnotationMap]);
        for (let [k,v] of extraAnnotationMap.entries()) {
          let set = subGroupMap.get(k);
          if (!set) {
            set = new Set();
            subGroupMap.set(k, set);
          }
          set.addAll(v);
        }

        let annotationIdSet = new Set();
        for (let [sg, annotations] of subGroupMap.entries()) {
          annotationIdSet = annotationIdSet.union(annotations);
        }
        let annotationIds = Array.from(annotationIdSet);

        let subGroupList = currentGroupContainer.appendChild(document.createElement('p'));
        if (subGroupMap.size === 0) {
          subGroupList.appendChild(document.createTextNode('Could not find any sub-groups'));
        } else {
          subGroupList.style.display = 'grid';
          subGroupList.style.gridGap = '0.5em';
          subGroupList.style.gridTemplateColumns = '10em minmax(10em, min-content) auto';
        }

        if (!widget.pairingMetaAnnotation || widget.pairingMetaAnnotation.length === 0) {
          // TODO: Allow regardless
          CATMAID.msg("Pairing meta annotation", "Please specify a pairing meta annotation");
          return;
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
          // Get all annotations that are annotated with the pairing meta-annotation.
          CATMAID.fetch(project.id + '/annotations/query-targets', 'POST', {
            'annotated_with': [widget.pairingMetaAnnotation],
            'annotation_reference': 'name',
            'type': ['annotation'],
          }),
        ];

        Promise.all(prepare)
          .then(results => {
            let pairingMetaTargetSet = results[1].entities.reduce((t, e) => {
              t.add(e.id);
              return t;
            }, new Set());

            // Map skeleton IDs to their pairing annotations
            let pairingMetaTargetMap = new Map();

            let annotationMap = results[0].entities.reduce((t, e) => {
              for (let i=0; i<e.annotations.length; ++i) {
                let annotation = e.annotations[i];

                // Collect valid pairing annotations per skeleton.
                if (pairingMetaTargetSet.has(annotation.id)) {
                  for (let j=0; j<e.skeleton_ids.length; ++j) {
                    let skeletonId = e.skeleton_ids[j];
                    if (!pairingMetaTargetMap.has(skeletonId)) {
                      pairingMetaTargetMap.set(skeletonId, new Set());
                    }
                    let targetSet = pairingMetaTargetMap.get(skeletonId);
                    targetSet.add(annotation.id);
                  }
                }

                // Store only annotation mappings from focus annotations.
                if (!annotationIdSet.has(annotation.id)) {
                  continue;
                }

                if (!t.has(annotation.id)) {
                  t.set(annotation.id, new Set());
                }
                let targetSet = t.get(annotation.id);
                for (let j=0; j<e.skeleton_ids.length; ++j) {
                  targetSet.add(e.skeleton_ids[j]);
                }
              }
              return t;
            }, new Map());

            let extraAnnotationIds = Array.from(extraAnnotationMap.values()).reduce((o,e) => {
               o.addAll(e);
               return o;
            }, new Set());

            let mainSkeletonIds = new Set();
            let extraSkeletonIds = new Set();
            for (let [annotationId, skids] of annotationMap.entries()) {
              if (extraAnnotationIds.has(annotationId)) {
                extraSkeletonIds.addAll(skids);
              } else {
                mainSkeletonIds.addAll(skids);
              }
            }

            // Get completeness for both main group and extra group, using their
            // respective configurations.
            let completenessPromises = [];
            if (mainSkeletonIds.size > 0) {
              let batches = [];
              let workingSet = Array.from(mainSkeletonIds);
              for (let i=0; i<mainSkeletonIds.size; i +=widget.completenessBatchSize) {
                let batch = workingSet.slice(i, Math.min(workingSet.length, i + widget.completenessBatchSize));
                completenessPromises.push(CATMAID.Skeletons.completeness(
                    project.id, batch, widget.mainMaxOpenEnds,
                    widget.mainMinNodes, widget.mainMinCable,
                    widget.mainIgnoreFragments, true));
                }
            }
            if (extraSkeletonIds.size > 0) {
              let batches = [];
              let workingSet = Array.from(extraSkeletonIds);
              for (let i=0; i<extraSkeletonIds.size; i +=widget.completenessBatchSize) {
                let batch = workingSet.slice(i, Math.min(workingSet.length, i + widget.completenessBatchSize));
                completenessPromises.push(CATMAID.Skeletons.completeness(
                    project.id, batch, widget.extraMaxOpenEnds,
                    widget.extraMinNodes, widget.extraMinCable,
                    widget.extraIgnoreFragments, true));
              }
            }

            return Promise.all(completenessPromises)
              .then(completenessResults => {
                let completionStatus = new Map();
                for (let r of completenessResults) {
                  for (let skeletonResult of r) {
                    completionStatus.set(skeletonResult[0], {
                      complete: skeletonResult[1],
                    });
                  }
                }
                return {
                  annotationMap: annotationMap,
                  completionStatus: completionStatus,
                  pairingMetaTargetMap: pairingMetaTargetMap,
                };
              });
          })
          .then(meta => {
            let annotationMap = meta.annotationMap;

            // Remove incomple skeletons from annotation map.
            let incompleSkeletons = 0;
            if (widget.useOnlyCompleteSkeletons) {
              for (let [k,v] of annotationMap.entries()) {
                for (let skeletonId of v) {
                  let status = meta.completionStatus.get(skeletonId);
                  if (!status || !status.complete) {
                    v.delete(skeletonId);
                    ++incompleSkeletons;
                  }
                }
              }
            }

            if (incompleSkeletons) {
              CATMAID.warn(`Ignored ${incompleSkeletons} incomple skeletons`);
            }

            widget.clearGroupSources();

            if (subGroupMap.size > 0) {
              let lut = new THREE.Lut("rainbow", annotationIds.length);
              lut.setMin(0);
              lut.setMax(annotationIds.length);
              // List number of active neurons for all available groups and update
              // skeleton sources.
              let header1 = subGroupList.appendChild(document.createElement('span'));
              header1.innerHTML = '<b>Subgroup</b>';
              let header2 = subGroupList.appendChild(document.createElement('span'));
              header2.innerHTML = '<b>Space</b>';
              let header3 = subGroupList.appendChild(document.createElement('span'));
              let completedInfo = widget.useOnlyCompleteSkeletons ? 'completed ' : '';
              header3.innerHTML = `<b>Subgroup-annotations and ${completedInfo}skeletons</b>`;

              let counter = 0;
              let landmarkGroupSelectMap = new Map();
              for (let [sg, annotationIds] of subGroupMap.entries()) {
                let source = new CATMAID.BasicSkeletonSource('Pair statistics - sub-group ' + sg);
                widget.groupSources.push(source);

                let span1 = subGroupList.appendChild(document.createElement('span'));
                span1.appendChild(document.createTextNode(sg));

                let span2 = subGroupList.appendChild(document.createElement('span'));
                span2.appendChild(document.createTextNode('...'));
                landmarkGroupSelectMap.set(sg, span2);

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
                  return `<span class="neuron-link-group">${name}</span>: ${skeletonLinks.join(', ')}`;
                });
                let span3 = subGroupList.appendChild(document.createElement('span'));
                span3.innerHTML = annotationNames.join(', ');
              }

              let prepare = CATMAID.Landmarks.listGroups(project.id).then(function(json) {
                return json.sort(function(a, b) {
                  return CATMAID.tools.compareStrings(a.name, b.name);
                }).map(function(landmarkGroup) {
                  return {
                    title: landmarkGroup.name,
                    value: landmarkGroup.id
                  };
                });
              });

              // Update all landmark group selectors once data becomes
              // available.
              let spaceGroupMapping = new Map();
              prepare
                .then(options => {
                  for (let [sg, wrapper] of landmarkGroupSelectMap.entries()) {
                    let select = CATMAID.DOM.createRadioSelect('Landmark group',
                      options, undefined, true, 'selected');
                    select.onchange = function(e) {
                      spaceGroupMapping.set(sg, e.target.value);
                    };
                    // Clear content
                    while (wrapper.lastChild) {
                      wrapper.removeChild(wrapper.lastChild);
                    }
                    wrapper.appendChild(select);
                  }
                })
                .catch(CATMAID.handleError);
            }

            // List matching ID pair information. Compute all matches between
            // neurons from each subgroup of a group. A neuron pair is matched
            // if they share an annotation (such as cell type), indicated by a
            // specific meta-annotation that needs to be shared by valid
            // matching annotations.
            let matchingPairSource = new CATMAID.BasicSkeletonSource('Skeleton pairs - matched across sub-group');
            widget.groupSources.push(matchingPairSource);

            let unmatchedIpsiPairSource = new CATMAID.BasicSkeletonSource('Skeleton pairs - unmatched same sub-group');
            widget.groupSources.push(unmatchedIpsiPairSource);

            let unmatchedContraPairSource = new CATMAID.BasicSkeletonSource('Skeleton pairs - unmatched across sub-group');
            widget.groupSources.push(unmatchedContraPairSource);

            let combinedGroups = CATMAID.SkeletonMatching.combineGroups([widget.groups, widget.extraGroups]);

            CATMAID.SkeletonMatching.createMatchReport(project.id,
                combinedGroups, meta.annotationMap, meta.pairingMetaTargetMap)
              .then(report => {
                this.matchReport = report;

                // Update matched partner skeleton source
                PairStatisticsWidget.updatePairSource(matchingPairSource,
                    report.matchedContraPairs);
                PairStatisticsWidget.updatePairSource(unmatchedIpsiPairSource,
                    report.allIpsiPairs);
                PairStatisticsWidget.updatePairSource(unmatchedContraPairSource,
                    report.unmatchedControPairs);

                // Update result display
                PairStatisticsWidget.addPairListElements(matchingPairsContainer,
                    report.matchedContraPairs, 'matched contra sub-group');
                PairStatisticsWidget.addPairListElements(ipsiPairsContainer,
                    report.allIpsiPairs, 'all same sub-group');
                PairStatisticsWidget.addPairListElements(contraPairsContainer,
                    report.unmatchedControPairs, 'unmatched contra sub-group');

                CATMAID.msg("Success", "Computed pairing sets");
              })
              .catch(CATMAID.handleError);
          })
          .catch(CATMAID.handleError);

        $(subGroupList).add(matchingPairsContainer).add(ipsiPairsContainer)
          .add(contraPairsContainer).on('click', 'a[data-id]', e => {
            let id = Number(e.target.dataset.id);
            if (Number.isNaN(id)) {
              CATMAID.warn("Could not parse ID: " + e.target.dataset.id);
              return;
            }
            CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', id);
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
