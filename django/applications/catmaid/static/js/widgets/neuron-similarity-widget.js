/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a new Neuron Similarity Widget. This widget allows users to explore
   * similarities between neurons.
   */
  var NeuronSimilarityWidget = function(options)
  {
    this.widgetID = this.registerInstance();
    this.idPrefix = "neuron-similarity-widget" + this.widgetID + '-';

    this.lastSimilarityQuery = null;
    this.showOnlyMatchesInResult = true;

    this.mode = 'similarity';
    this.modes = ['similarity', 'configrations'];

    CATMAID.Similarity.on(CATMAID.Similarity.EVENT_CONFIG_ADDED,
        this.handleAddedConfig, this);
    CATMAID.Similarity.on(CATMAID.Similarity.EVENT_CONFIG_DELETED,
        this.handleDeletedConfig, this);
  };

  NeuronSimilarityWidget.prototype = {};
  $.extend(NeuronSimilarityWidget.prototype, new InstanceRegistry());

  NeuronSimilarityWidget.prototype.getName = function() {
    return "Neuron Similarity " + this.widgetID;
  };

  NeuronSimilarityWidget.prototype.destroy = function() {
    this.unregisterInstance();
    CATMAID.Similarity.off(CATMAID.Similarity.EVENT_CONFIG_ADDED,
        this.handleAddedConfig, this);
    CATMAID.Similarity.off(CATMAID.Similarity.EVENT_CONFIG_DELETED,
        this.handleDeletedConfig, this);
  };

  NeuronSimilarityWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var self = this;
        var tabNames = this.modes.map(function(m) {
          return NeuronSimilarityWidget.Modes[m].title;
        }, this);
        var tabs = CATMAID.DOM.addTabGroup(controls, '-neuron-similarity', tabNames);
        this.modes.forEach(function(mode, i) {
          var mode = NeuronSimilarityWidget.Modes[mode];
          var tab = tabs[mode.title];
          CATMAID.DOM.appendToTab(tab, mode.createControls(this));
          tab.dataset.index = i;
        }, this);
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
        this.update();
      },
      helpText: [
        '<h1>Neuron Similarity Widget</h1>',
        '<p>This widget allows to compare neuron morphologies based on their spatial location and orientation.</p>'
      ].join('\n'),
    };
  };

  NeuronSimilarityWidget.prototype.refresh = function() {
    let mode = NeuronSimilarityWidget.Modes[this.mode];
    if (CATMAID.tools.isFn(mode.refresh)) {
      mode.refresh(this);
    }
  };

  NeuronSimilarityWidget.prototype.update = function() {
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

    let mode = NeuronSimilarityWidget.Modes[this.mode];

    // Update actual content
    delete this.content.dataset.msg;
    mode.createContent(this.content, this);
  };

  NeuronSimilarityWidget.prototype.setMode = function(mode) {
    var index = this.modes.indexOf(mode);
    if (index === -1) {
      throw new CATMAID.ValueError('Unknown Neuron Similarity Widget mode: ' + mode);
    }
    this.mode = mode;
    this.update();
    return true;
  };

  NeuronSimilarityWidget.prototype.handleAddedConfig = function(config) {
    for (let modeName in NeuronSimilarityWidget.Modes) {
      let mode = NeuronSimilarityWidget.Modes[modeName];
      if (CATMAID.tools.isFn(mode.handleAddedConfig)) {
        mode.handleAddedConfig(this, config);
      }
    }
  };

  NeuronSimilarityWidget.prototype.handleDeletedConfig = function(config) {
    for (let modeName in NeuronSimilarityWidget.Modes) {
      let mode = NeuronSimilarityWidget.Modes[modeName];
      if (CATMAID.tools.isFn(mode.handleDeletedConfig)) {
        mode.handleDeletedConfig(this, config);
      }
    }
  };

  function listToStr(list) {
    if (list instanceof Array) {
      return '[' + list.join(', ') + ']';
    } else {
      return list;
    }
  }

  NeuronSimilarityWidget.Modes = {
    similarity: {
      title: "Neuron similarity",
      createControls: function(widget) {
        let newQueryName = '';
        let querySource = null;
        let targetSource = null;
        let configId = null;

        let newScoringSection = document.createElement('span');
        newScoringSection.classList.add('section-header');
        newScoringSection.appendChild(document.createTextNode('New query'));

        let querySelect = document.createElement('label');
        querySelect.appendChild(document.createTextNode('Query skeletons'));
        let querySourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName + ' Query source');
        querySourceSelect.setAttribute('id', widget.idPrefix + 'query-source');
        querySelect.appendChild(querySourceSelect);
        querySource = querySourceSelect.value;
        querySourceSelect.onchange = function(e) {
          querySource = e.target.value;
        };
        let targetSelect = document.createElement('label');
        targetSelect.appendChild(document.createTextNode('Target skeletons'));
        let targetSourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName + ' Target source');
        targetSourceSelect.setAttribute('id', widget.idPrefix + 'target-source');
        targetSelect.appendChild(targetSourceSelect);
        targetSource = targetSourceSelect.value;
        targetSourceSelect.onchange = function(e) {
          targetSource = e.target.value;
        };
        let configSelectWrapper = document.createElement('label');
        configSelectWrapper.appendChild(document.createTextNode('Config'));
        configSelectWrapper.setAttribute('title', 'Select a configuration to use (has to be complete)');
        let configSelect = document.createElement('select');
        configSelect.setAttribute('id', widget.idPrefix + 'config-select');
        configSelectWrapper.appendChild(configSelect);
        configId = configSelect.value && configSelect.value.length > 0 ?
            parseInt(configSelect.value, 10) : null;
        configSelect.onchange = function(e) {
          configId = configSelect.value === 'none' ? null :
              configId = parseInt(configSelect.value, 10);
        };

        // Add available configs to select
        NeuronSimilarityWidget.updateConfigSelect(configSelect)
          .then(function() {
            // Select first option by default.
            if (configSelect.options.length > 0 && !configId && configId !== 0) {
              configId = configSelect.options[0].value;
              configSelect.value = configId;
            }
          });

        return [{
          type: 'button',
          label: 'Refresh',
          onclick: widget.refresh.bind(widget),
        }, {
          type: 'child',
          element: newScoringSection,
        }, {
          type: 'text',
          label: 'Name',
          title: 'An optional name for this query',
          placeholder: '(optional)',
          value: newQueryName,
          length: 8,
          onchange: function() {
            newQueryName = this.value;
          }
        }, {
          type: 'child',
          element: querySelect,
        }, {
          type: 'child',
          element: targetSelect,
        }, {
          type: 'child',
          element: configSelectWrapper,
        }, {
          type: 'button',
          label: 'Compute similarity',
          onclick: function() {
            let querySkeletonSource = CATMAID.skeletonListSources.getSource(querySource);
            if (!querySkeletonSource) {
              CATMAID.error("Can't find source: " + querySource);
              return;
            }
            let querySkeletonIds = querySkeletonSource.getSelectedSkeletons();

            let targetSkeletonSource = CATMAID.skeletonListSources.getSource(targetSource);
            if (!targetSkeletonSource) {
              CATMAID.error("Can't find source: " + targetSource);
              return;
            }
            let targetSkeletonIds = targetSkeletonSource.getSelectedSkeletons();

            // Make sure there is a selected config. Default to first element, if none was selected explicitly.
            if (configSelect.options.length > 0 && configSelect.value === -1) {
              configId = parseInt(configSelect.options[0].value, 10);
            }

            CATMAID.Similarity.computeSimilarity(project.id, configId,
                querySkeletonIds, targetSkeletonIds, newQueryName)
              .then(function(response) {
                widget.lastSimilarityQuery = response;
                return widget.update();
              })
              .catch(function(error) {
                widget.lastSimilarityQuery = null;
                CATMAID.handleError(error);
              });
          }
        }];
      },
      createContent: function(content, widget) {
        // Create table of all visible configurations.
        let container = content.appendChild(document.createElement('div'));
        container.classList.add('container');
        let p = container.appendChild(document.createElement('p'));
        p.classList.add('info-text');
        p.appendChild(document.createTextNode('Similarity computations are ' +
            'done asyncronously and individual requests are queued as tasks ' +
            'that are listed below.'));
        let table = container.appendChild(document.createElement('table'));
        table.setAttribute('id', widget.idPrefix + 'similarity-table');
        let datatable = $(table).DataTable({
          dom: 'lfrtip',
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            CATMAID.Similarity.listAllSkeletonSimilarities(project.id)
              .then(function(result) {
                callback({
                  draw: data.draw,
                  data: result,
                  recordsTotal: result.length,
                  recordsFiltered: result.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [[5, 'desc']],
          columns: [{
              data: "id",
              title: "Id",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.id;
              }
            }, {
              data: "name",
              title: "Name",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if ("display") {
                  return '<a href="#" data-action="select-group" data-group-id="' +
                      row.id + '" >' + row.name + '</a>';
                } else {
                  return row.name;
                }
              }
            }, {
              title: "User",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user_id).login;
              }
            }, {
              data: "status",
              title: "Status",
              orderable: true,
              class: 'cm-center',
            }, {
              data: "config_id",
              title: "Config",
              orderable: true,
              class: 'cm-center',
            }, {
              data: "creation_time",
              title: "Created on (UTC)",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = CATMAID.tools.isoStringToDate(row.creation_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            }, {
              data: "query_skeleton_ids",
              title: "Query skeletons",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let qs = row.query_skeleton_ids;
                let allBins = qs.join(', ');
                let text = (qs && qs.length > 4) ?
                    (qs[0] + ', ' +  qs[1] +  ' … ' + qs[qs.length - 2] + ', ' + qs[qs.length - 1]) :
                    allBins;
                return '<span title="' + qs.length + ' skeletons">' + text + '</span>';
              }
            }, {
              data: "target_skeleton_ids",
              title: "Target skeletons",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let ts = row.target_skeleton_ids;
                let allBins = ts.join(', ');
                let text = (ts && ts.length > 4) ?
                    (ts[0] + ', ' +  ts[1] +  ' … ' + ts[ts.length - 2] + ', ' + ts[ts.length - 1]) :
                    allBins;
                return '<span title="' + ts.length + ' skeletons">' + text + '</span>';
              }
            }, {
              data: "scoring",
              title: "Scoring",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {

                if (row.scoring && row.scoring.length > 0) {
                  let allCells = '[' + row.scoring.map(listToStr).join('\n, ') + ']';
                  return '<a data-role="show-similarity" href="#" title="' + allCells + '">[…]</a>';
                } else {
                  return '-';
                }
              }
            }, {
              title: "Action",
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return '<a href="#" data-role="delete-similarity">Delete</a> <a href="#" data-role="recompute-similarity">Recompute</a>';
              }
            }]
        }).on('click', 'a[data-role=recompute-similarity]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          CATMAID.Similarity.recomputeSimilarity(project.id, data.id)
            .then(function() {
              CATMAID.msg('Success', 'NBLAST similarity recomputation queued');
              widget.refresh();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-role=delete-similarity]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          if (!confirm('Are you sure you want to to delete NBLAST similarity #' +
              data.id + '?')) {
            return;
          }
          CATMAID.Similarity.deleteSimilarity(project.id, data.id)
            .then(function() {
              CATMAID.msg('Success', 'NBLAST similarity deleted');
              widget.refresh();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-role=show-similarity]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          NeuronSimilarityWidget.showSimilarityDialog(widget, data);
        });
      },
      handleAddedConfig: function(widget, config) {
        let configSelect = document.getElementById(widget.idPrefix + 'config-select');
        if (!configSelect) throw new CATMAID.ValueError("Config select element not found");
        NeuronSimilarityWidget.updateConfigSelect(configSelect);
      },
      handleDeletedConfig: function(widget, config) {
        let configSelect = document.getElementById(widget.idPrefix + 'config-select');
        if (!configSelect) throw new CATMAID.ValueError("Config select element not found");
        NeuronSimilarityWidget.updateConfigSelect(configSelect);
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'similarity-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }
      }
    },
    configrations: {
      title: "Configurations",
      createControls: function(widget) {
        let newIndexName = '';
        let newDistBreaks = CATMAID.Similarity.defaultDistanceBreaks;
        let newDotBreaks = CATMAID.Similarity.defaultDotBreaks;
        let newTangentNeighbors = 20;
        let backendRandomSelection = true;
        let numRandomNeurons = 1000;
        let lengthRandomNeurons = 10000;
        let matchingSource = null;
        let randomSource = null;

        let newScoringSection = document.createElement('span');
        newScoringSection.classList.add('section-header');
        newScoringSection.appendChild(document.createTextNode('New config'));

        let matchSelect = document.createElement('label');
        matchSelect.appendChild(document.createTextNode('Similar skeletons'));
        let matchSourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName + ' Match source');
        matchSourceSelect.setAttribute('id', widget.idPrefix + '-config-match-source');
        matchSelect.appendChild(matchSourceSelect);
        matchingSource = matchSourceSelect.value;
        matchSourceSelect.onchange = function(e) {
          matchingSource = e.target.value;
        };
        let randomSelect = document.createElement('label');
        randomSelect.appendChild(document.createTextNode('Random skeletons'));
        randomSelect.disabled = backendRandomSelection;
        let randomSourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName + ' Random source');
        randomSourceSelect.setAttribute('id', widget.idPrefix + '-config-random-source');
        randomSourceSelect.disabled = backendRandomSelection;
        randomSelect.appendChild(randomSourceSelect);
        randomSource = randomSourceSelect.value;
        randomSourceSelect.onchange = function(e) {
          randomSource = e.target.value;
        };

        let randomBackendCount = document.createElement('label');
        randomBackendCount.appendChild(document.createTextNode('# Random skeletons'));
        let randomBackendCountInput = document.createElement('input');
        randomBackendCount.appendChild(randomBackendCountInput);
        randomBackendCountInput.setAttribute('type', 'number');
        randomBackendCountInput.setAttribute('step', '1');
        randomBackendCountInput.setAttribute('min', '1');
        randomBackendCountInput.setAttribute('value', numRandomNeurons);
        randomBackendCountInput.style.width = "6em";
        randomBackendCountInput.disabled = !backendRandomSelection;
        randomBackendCountInput.onchange = function() {
          let value = Number(this.value);
          if (Number.isNaN(value)) {
            CATMAID.warn("Invalid length");
          } else {
            numRandomNeurons = Math.floor(value);
          }
        };

        let randomBackendMinLength = document.createElement('label');
        randomBackendMinLength.appendChild(document.createTextNode('Min length (nm)'));
        randomBackendMinLength.setAttribute('title', 'A minimum length of accepted skeletons');
        let randomBackendMinLengthInput = document.createElement('input');
        randomBackendMinLength.appendChild(randomBackendMinLengthInput);
        randomBackendMinLengthInput.setAttribute('type', 'number');
        randomBackendMinLengthInput.setAttribute('step', '1');
        randomBackendMinLengthInput.setAttribute('min', '1');
        randomBackendMinLengthInput.setAttribute('value', lengthRandomNeurons);
        randomBackendMinLengthInput.style.width = "6em";
        randomBackendMinLengthInput.disabled = !backendRandomSelection;
        randomBackendMinLengthInput.onchange = function() {
          let value = Number(this.value);
          if (Number.isNaN(value)) {
            CATMAID.warn("Invalid length");
          } else {
            lengthRandomNeurons = value;
          }
        };

        return [{
          type: 'button',
          label: 'Refresh',
          onclick: widget.refresh.bind(widget),
        }, {
          type: 'child',
          element: newScoringSection,
        }, {
          type: 'text',
          label: 'Name',
          title: 'The name of the new scoring index',
          value: newIndexName,
          length: 8,
          onchange: function() {
            newIndexName = this.value;
          }
        }, {
          type: 'text',
          label: 'Distance breaks',
          title: 'The distance histogram bin boundary values. By default [0,500] with an increasing bin size.',
          value: newDistBreaks.join(', '),
          length: 7,
          onchange: function() {
            newDistBreaks = this.value.split(',').filter(
                function(s) {
                  s = s.trim();
                  return s.length > 0;
                }).map(function(s) {
                  var val = parseInt(s, 10);
                  if (isNaN(val)) {
                    throw new CATMAID.ValueError("No number: " + s.trim());
                  }
                  return val;
                });
          }
        }, {
          type: 'text',
          label: 'Dot breaks',
          title: 'The absolute dot product histogram bin boundary values. By default [0,1] with a 0.1 step.',
          value: newDotBreaks.join(', '),
          length: 7,
          onchange: function() {
            newDotBreaks = this.value.split(',').filter(
                function(s) {
                  s = s.trim();
                  return s.length > 0;
                }).map(function(s) {
                  var val = parseInt(s, 10);
                  if (isNaN(val)) {
                    throw new CATMAID.ValueError("No number: " + s.trim());
                  }
                  return val;
                });
          }
        }, {
          type: 'numeric',
          label: 'Tangent neighbors',
          title: 'The number of neighbor nodes that should be considered when computing a tangent vector.',
          value: newTangentNeighbors,
          min: 2,
          step: 1,
          length: 3,
          onchange: function() {
            newTangentNeighbors = parseInt(this.value, 10);
          }
        }, {
          type: 'child',
          element: matchSelect,
        }, {
          type: 'child',
          element: randomSelect,
        }, {
          type: 'checkbox',
          label: 'Auto random selection',
          id: widget.idPrefix + '-config-auto-random',
          value: backendRandomSelection,
          onclick: function() {
            backendRandomSelection = this.checked;

            randomSelect.disabled = backendRandomSelection;
            randomSourceSelect.disabled = backendRandomSelection;
            randomBackendCount.disabled = !backendRandomSelection;
            randomBackendCountInput.disabled = !backendRandomSelection;
            randomBackendMinLength.disabled = !backendRandomSelection;
            randomBackendMinLengthInput.disabled = !backendRandomSelection;
          }
        }, {
          type: 'child',
          element: randomBackendCount,
        }, {
          type: 'child',
          element: randomBackendMinLength,
        }, {
          type: 'button',
          label: 'Create similarity matrix',
          title: 'Create a new similarity matrix with the specified settings',
          onclick: function() {
            let matchingSkeletonSource = CATMAID.skeletonListSources.getSource(matchingSource);
            if (!matchingSkeletonSource) {
              CATMAID.error("Can't find source: " + matchingSource);
              return;
            }
            let matchingSkeletonIds = matchingSkeletonSource.getSelectedSkeletons();

            let randomSkeletonIds;
            if (backendRandomSelection) {
              randomSkeletonIds = 'backend';
            } else {
              let randomSkeletonSource = CATMAID.skeletonListSources.getSource(randomSource);
              if (!randomSkeletonSource) {
                CATMAID.error("Can't find source: " + randomSource);
                return;
              }
              randomSkeletonIds = randomSkeletonSource.getSelectedSkeletons();
            }

            CATMAID.Similarity.addConfig(project.id, newIndexName,
                matchingSkeletonIds, randomSkeletonIds, numRandomNeurons,
                lengthRandomNeurons, newDistBreaks, newDotBreaks, newTangentNeighbors)
              .then(function() {
                return widget.refresh();
              })
              .catch(CATMAID.handleError);
          }
        }];
      },
      createContent: function(content, widget) {
        // Create table of all visible configurations.
        let container = content.appendChild(document.createElement('div'));
        container.classList.add('container');
        let table = container.appendChild(document.createElement('table'));
        table.setAttribute('id', widget.idPrefix + 'config-table');
        let datatable = $(table).DataTable({
          dom: 'lfrtip',
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            CATMAID.Similarity.listAllConfigs(project.id)
              .then(function(result) {
                callback({
                  draw: data.draw,
                  data: result,
                  recordsTotal: result.length,
                  recordsFiltered: result.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [[4, 'desc']],
          columns: [{
              data: "id",
              title: "Id",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.id;
              }
            }, {
              data: "name",
              title: "Name",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if ("display") {
                  return '<a href="#" data-action="select-group" data-group-id="' +
                      row.id + '" >' + row.name + '</a>';
                } else {
                  return row.name;
                }
              }
            }, {
              title: "User",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user_id).login;
              }
            }, {
              data: "status",
              title: "Status",
              orderable: true,
              class: 'cm-center',
            }, {
              data: "creation_time",
              title: "Created on (UTC)",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = CATMAID.tools.isoStringToDate(row.creation_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            }, {
              title: "Distance bins",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.distance_breaks.length - 1;
              }
            }, {
              data: "distance_breaks",
              title: "Distance breaks",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let db = row.distance_breaks;
                let allBins = db.join(', ');
                let text = (db && db.length > 4) ?
                    (db[0] + ', ' +  db[1] +  ' … ' + db[db.length - 2] + ', ' + db[db.length - 1]) :
                    allBins;
                return '<span title="' + allBins + '">' + text + '</span>';
              }
            }, {
              title: "Dot product bins",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.dot_breaks.length - 1;
              }
            }, {
              data: "dot_breaks",
              title: "Dot product breaks",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let db = row.dot_breaks;
                let allBins = db.join(', ');
                let text = (db && db.length > 4) ?
                    (db[0] + ', ' +  db[1] +  ' … ' + db[db.length - 2] + ', ' + db[db.length - 1]) :
                    allBins;
                return '<span title="' + allBins + '">' + text + '</span>';
              }
            }, {
              data: "resample_step",
              title: "Resample (nm)",
              orderable: true,
              class: 'cm-center',
            }, {
              data: "tangent_neighbors",
              title: "Tangent neighbors",
              orderable: true,
              class: 'cm-center',
            }, {
              data: "match_sample",
              title: "Match sample",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if (row.match_sample) {
                  let ms = row.match_sample;
                  if (type === 'display') {
                    return '<a href="#" data-role="show-match-sample">ID: ' + ms.id +
                        ', Neurons: ' + ms.sample_neurons.length + '</a>';
                  }
                  return row.match_sample.id;
                }
                return '-';
              }
            }, {
              data: "random_sample",
              title: "Random sample",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if (row.random_sample) {
                  let rs = row.random_sample;
                  if (type === 'display') {
                    return '<a href="#" data-role="show-random-sample">ID: ' + rs.id +
                        ', Neurons: ' + rs.sample_neurons.length + '</a>';
                  }
                  return row.random_sample.id;
                }
                return '-';
              }
            }, {
              data: "scoring",
              title: "Scoring",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {

                if (row.scoring && row.scoring.length > 0) {
                  let allCells = '[' + row.scoring.map(listToStr).join('\n, ') + ']';
                  return '<a data-role="show-similarity" href="#" title="' + allCells + '">[…]</a>';
                } else {
                  return '-';
                }
              }
            }, {
              title: "Action",
              render: function(data, type, row, meta) {
                return '<a href="#" data-role="delete-config">Delete</a> <a href="#" data-role="recompute-config">Recompute</a>';
              }
            }]
        }).on('click', 'a[data-role=recompute-config]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          CATMAID.Similarity.recomputeConfig(project.id, data.id)
            .then(function() {
              CATMAID.msg('Success', 'NBLAST config recomputation queued');
              widget.refresh();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-role=delete-config]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          if (!confirm('Are you sure you want to to delete NBLAST configuration #' +
              data.id + '?')) {
            return;
          }
          CATMAID.Similarity.deleteConfig(project.id, data.id)
            .then(function() {
              CATMAID.msg('Success', 'NBLAST configuration deleted');
              widget.refresh();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-role=show-match-sample]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          NeuronSimilarityWidget.showSampleDialog(data, data.match_sample, "Matching sample");
        }).on('click', 'a[data-role=show-random-sample]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          NeuronSimilarityWidget.showSampleDialog(data, data.random_sample, "Random sample");
        }).on('click', 'a[data-role=show-similarity]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          NeuronSimilarityWidget.showSimilarityScoringDialog(data);
        });
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'config-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }
      }
    },
  };

  NeuronSimilarityWidget.showSimilarityScoringDialog = function(similarity) {
    let dialog = new CATMAID.OptionsDialog("Similarity configuration", {
      'Ok': function() {}
    });

    if (similarity.scoring && similarity.scoring.length > 0) {
      dialog.appendMessage('Scoring matrix for selected similar skeletons ' +
          'and random skeletons (columns: dot product, rows: distance).');
      let dataContainer = document.createElement('div');
      dataContainer.style.display = 'flex';
      dialog.appendChild(dataContainer);
      let table = dataContainer.appendChild(document.createElement('table'));
      table.classList.add('cm-center');

      let thead = table.appendChild(document.createElement('thead'));
      let th = thead.appendChild(document.createElement('tr'));
      th.appendChild(document.createElement('th'));
      for (let i=0; i<(similarity.dot_breaks.length - 1); ++i) {
        let td = th.appendChild(document.createElement('th'));
        let text = '(' + similarity.dot_breaks[i] + ',' +
            similarity.dot_breaks[i+1] + ']';
        td.appendChild(document.createTextNode(text));
      }

      let tbody = table.appendChild(document.createElement('tbody'));
      for (let i=0; i<similarity.scoring.length; ++i) {
        let column = similarity.scoring[i];
        let tr = tbody.appendChild(document.createElement('tr'));
        for (let j=-1; j<column.length; ++j) {
          let td = tr.appendChild(document.createElement('td'));
          if (j === -1) {
            let text = '(' + similarity.distance_breaks[i] + ',' +
                similarity.distance_breaks[i+1] + ']';
            td.appendChild(document.createTextNode(text));
            td.classList.add('row-head');
          } else {
            td.appendChild(document.createTextNode(Number(column[j]).toFixed(2)));
          }
        }
      }

      let plot = dataContainer.appendChild(document.createElement('div'));

      Plotly.newPlot(plot, [{
        type: 'surface',
        x: similarity.dot_breaks,
        y: similarity.distance_breaks,
        z: similarity.scoring
      }], {
        autosize: true,
        width: 300,
        height: 350,
        margin: {
          l: 10,
          r: 10,
          b: 30,
          t: 30,
          pad: 4
        },
        scene: {
          xaxis: {
            title: 'Absolute dot product',
            nticks: 6,
          },
          yaxis: {
            title: 'Distance (µm)',
          },
          zaxis: {
            title: 'Score',
          }
        }
      });
    } else {
      dialog.appendMessage("No scoring available");
    }

    dialog.show(880, 510, false);
  };

  function largerEqualZero(value) {
    return value >= 0;
  }

  NeuronSimilarityWidget.showSimilarityDialog = function(widget, similarity) {
    let dialog = new CATMAID.OptionsDialog("Similarity configuration", {
      'Ok': function() {},
    });

    dialog.dialog.setAttribute('id', 'no-confirm-dialog');

    if (similarity.scoring && similarity.scoring.length > 0) {
      dialog.appendMessage("Below you will find the top 10 matches for " +
          "each query skeleton with a score larger than zero, i.e. it " +
          "is more likely, the respecive skeleton is similar to the query " +
          "than random.");

      let table = document.createElement('table');
      table.classList.add('cm-center');

      let matchesOnly = dialog.appendCheckbox("Only show matches", undefined,
          widget.showOnlyMatchesInResult,
          "If checked, the result table will only show matches");
      matchesOnly.onchange = function() {
        widget.showOnlyMatchesInResult = this.checked;
        if (this.checked) {
          $(table).DataTable().columns(1).search('^(?!.*no match).*$', true, false, true).draw();
        } else {
          $(table).DataTable().columns(1).search('').draw();
        }
      };

      dialog.appendChild(table);

      let thead = table.appendChild(document.createElement('thead'));
      let theadTr = thead.appendChild(document.createElement('tr'));
      let theadTh1 = theadTr.appendChild(document.createElement('th'));
      theadTh1.appendChild(document.createTextNode('Query skeleton'));
      let theadTh2 = theadTr.appendChild(document.createElement('th'));
      theadTh2.appendChild(document.createTextNode('Top 10 target matches'));

      let tbody = table.appendChild(document.createElement('tbody'));

      let collectEntries = function(target, element, i) {
        if (element >= 0) {
          target.push([similarity.target_skeleton_ids[i], element]);
        }
        return target;
      };

      let compareEntriesDesc = function(a, b) {
        if (a[1] > b[1]) return -1;
        if (a[1] < b[1]) return 1;
        return 0;
      };

      let dataAboveZero = similarity.query_skeleton_ids.map(function(qskid, i) {
        let sortedMatches = similarity.scoring[i].reduce(collectEntries, []).sort(compareEntriesDesc);
        return [qskid, sortedMatches];
      });

      $(table).DataTable({
        dom: 'lfrtip',
        data: dataAboveZero,
        order: [],
        columns: [{
          orderable: true,
          class: 'cm-center',
          render: function(data, type, row, meta) {
            return `<a href="#" data-skeleton-id="${row[0]}" data-role="select-skeleton">${row[0]}</a>`;
          }
        }, {
          orderable: false,
          class: 'cm-left',
          render: function(data, type, row, meta) {
            if (row[1].length > 0) {
              let nTop10Elements = Math.min(10, row[1].length);
              let elements = ['<span class="result-list">'];
              for (let i=0; i<nTop10Elements; ++i) {
                let entry = row[1][i];
                elements.push(`<span class="result-element"><span>${i+1}.</span><a href="#" data-skeleton-id="${entry[0]}" data-role="select-skeleton">${entry[0]}</a> (${entry[1]})</span>`);
              }
              elements.push('</span>');
              return elements.join('');
            } else {
              return '(no match)';
            }
          }
        }]
      }).on('click', 'a[data-role=select-skeleton]', function() {
        let skeletonId = parseInt(this.dataset.skeletonId, 10);
        CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
      });

      if (widget.showOnlyMatchesInResult) {
        $(table).DataTable().columns(1).search('^(?!.*no match).*$', true, false, true).draw();
      }
    } else {
      dialog.appendMessage("No similarity data available");
    }

    dialog.show(700, 'auto', false);


    // A button to open the scoring matrix dialog
    let configButton = document.createElement('button');
    configButton.setAttribute('class', 'ui-button');
    configButton.classList.add('ui-button', 'ui-corner-all',
      'ui-state-default', 'ui-widget', 'ui-button-text-only');
    var configButtonLabel = configButton.appendChild(document.createElement('span'));
    configButtonLabel.classList.add('ui-button-text');
    configButtonLabel.appendChild(document.createTextNode('Show scoring matrix'));
    configButton.onclick = function() {
      CATMAID.Similarity.getConfig(project.id, similarity.config_id)
        .then(function(config) {
          NeuronSimilarityWidget.showSimilarityScoringDialog(config);
        })
        .catch(CATMAID.handleError);
    };

    // Download scoring matrix as CSV
    let downloadButton = document.createElement('button');
    downloadButton.setAttribute('class', 'ui-button');
    downloadButton.classList.add('ui-button', 'ui-corner-all',
      'ui-state-default', 'ui-widget', 'ui-button-text-only');
    var downloadButtonLabel = downloadButton.appendChild(document.createElement('span'));
    downloadButtonLabel.classList.add('ui-button-text');
    downloadButtonLabel.appendChild(document.createTextNode('Download scores as CSV'));
    downloadButton.onclick = function() {
      CATMAID.Similarity.getConfig(project.id, similarity.config_id)
        .then(function(config) {
          NeuronSimilarityWidget.exportNblastCSV(similarity, config);
          CATMAID.msg("Success", "CSV exported");
        })
        .catch(CATMAID.handleError);
    };

    dialog.appendExtraControls([{
      type: 'child',
      element: configButton,
    }, {
      type: 'child',
      element: downloadButton,
    }]);
  };

  NeuronSimilarityWidget.showSampleDialog = function(config, sample, title) {
    title = title || "NBLAST Sample";
    let dialog = new CATMAID.OptionsDialog(title, {
      'Ok': function() {}
    });

    dialog.appendMessage('Probability distribution for sample of ' +
        sample.sample_neurons.length + ' neurons.');

    if (sample.probability && sample.probability.length > 0) {
      let table = document.createElement('table');
      table.classList.add('cm-center');
      dialog.appendChild(table);

      let thead = table.appendChild(document.createElement('thead'));
      let th = thead.appendChild(document.createElement('tr'));
      th.appendChild(document.createElement('th'));
      for (let i=0; i<(config.dot_breaks.length - 1); ++i) {
        let td = th.appendChild(document.createElement('th'));
        let text = '(' + config.dot_breaks[i] + ',' +
            config.dot_breaks[i+1] + ']';
        td.appendChild(document.createTextNode(text));
      }

      let tbody = table.appendChild(document.createElement('tbody'));
      for (let i=0; i<config.scoring.length; ++i) {
        let column = sample.probability[i];
        let tr = tbody.appendChild(document.createElement('tr'));
        for (let j=-1; j<column.length; ++j) {
          let td = tr.appendChild(document.createElement('td'));
          if (j === -1) {
            let text = '(' + config.distance_breaks[i] + ',' +
                config.distance_breaks[i+1] + ']';
            td.appendChild(document.createTextNode(text));
            td.classList.add('row-head');
          } else {
            td.appendChild(document.createTextNode(Number(column[j]).toFixed(3)));
          }
        }
      }
    } else {
      dialog.appendMessage("No scoring available");
    }

    if (sample.sample_neurons && sample.sample_neurons.length > 0) {
      let a = document.createElement('a');
      a.href = '#';
      a.appendChild(document.createTextNode('Show all ' +
          sample.sample_neurons.length + ' sample skeletons in new Selection Table.'));
      a.onclick = function() {
        let widget = WindowMaker.create('selection-table').widget;
        widget.addSkeletons(sample.sample_neurons);
        CATMAID.msg(widget.getName(), 'Added ' + sample.sample_neurons.length +
            ' neurons to ' + widget.getName());
      };
      dialog.appendChild(a);
    } else {
      dialog.appendMessage("No sample skeletons linked");
    }

    dialog.show(620, 550, false);
  };

  NeuronSimilarityWidget.updateConfigSelect = function (select) {
    return CATMAID.Similarity.listAllConfigs(project.id, true)
      .then(function(configs) {
        let selectedIndex = select.selectedIndex;
        let selectedValue = selectedIndex === -1 ? null : select.value;

        // Clear options
        select.options.length = 0;

        // Add a default none option
        select.options.add(new Option("(none)", "none"));

        for (let i=0; i<configs.length; ++i) {
          let config = configs[i];
          if (config.status === 'complete') {
            let selected = config.id === selectedValue;
            let name = `${config.name} (${config.id})`;
            let option = new Option(name, config.id, selected, selected);
            select.options.add(option);
          }
        }
      })
      .catch(CATMAID.handleError);
  };

  function concatLine(line) {
    /* jshint validthis: true */
    return this.concat(line);
  }

  NeuronSimilarityWidget.exportNblastCSV = function(similarity, config) {
    // Create a CSV that includes the query skeletons as first column and the
    // target skeletons as first row/header.
    let today = new Date();
    let filename = 'catmaid-nblast-scores-' + today.getFullYear() +
        '-' + (today.getMonth() + 1) + '-' + today.getDate() + '.csv';
    let header = ['""'].concat(similarity.target_skeleton_ids.map(function(s) {
      return `"${s}"`;
    })).join(',');
    let data = [header];
    similarity.query_skeleton_ids.forEach(function(s, i) {
      let line = [`"${s}"`].concat(similarity.scoring[i]);
      data.push(line.join(','));
    });
    saveAs(new Blob([data.join('\n')], {type: 'text/plain'}), filename);
  };

  // Export widget
  CATMAID.NeuronSimilarityWidget = NeuronSimilarityWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Neuron similarity",
    description: "Compare neurons and rank them by similarity using NBLAST",
    key: "neuron-similarity",
    creator: NeuronSimilarityWidget
  });

})(CATMAID);
