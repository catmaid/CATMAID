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
    this.modes = ['similarity', 'configrations', 'pointclouds'];

    CATMAID.Similarity.on(CATMAID.Similarity.EVENT_CONFIG_ADDED,
        this.handleAddedConfig, this);
    CATMAID.Similarity.on(CATMAID.Similarity.EVENT_CONFIG_DELETED,
        this.handleDeletedConfig, this);
  };

  NeuronSimilarityWidget.prototype = {};
  $.extend(NeuronSimilarityWidget.prototype, new InstanceRegistry());

  CATMAID.asEventSource(NeuronSimilarityWidget.prototype);

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
        '<p>This widget allows to compare neuron morphologies based on their spatial location and orientation.</p>',
        '<h2>Neuron similarity</h2>',
        '<h2>Configurations</h2>',
        '<h2>Point clouds</h2>',
        '<p>This tab list all registered point clouds and allows to add single new point clouds. ',
        'To add new point clouds a <em>name</em> is needed as well as a set of points. By clicking ',
        'the <kbd>Point CSV</kbd> button, points can be loaded from a file. This CSV file is ',
        'expected to have three columns: <em>X, Y and Z</em>. When storing new point clouds in ',
        'the database, the coordinates are expected to be in <em>project space</em>.</p>',

        '<p>Since this isn\'t always easy to provide, a separate <em>transformation</em> file ',
        'can be loaded using the <kbd>Transformation CSV</kbd> button. This CSV file can have ',
        'either <em>9 or 15 columns</em>. If 9 columns are provided, they are expected to ',
        'represent the following: <span class="inline-code">Name</span>, ',
        '<span class="inline-code">Source name</span>, <span class="inline-code">Target name</span>, ',
        '<span class="inline-code">Source x</span>, <span class="inline-code">Source y</span>, ',
        '<span class="inline-code">Source z</span>, <span class="inline-code">Target x</span>, ',
        '<span class="inline-code">Target y</span>, <span class="inline-code">Target z</span>. ',
        'This will describe point matches from the source space (<em>Point CSV</em>) to the ',
        'target (project) space. Alternatively, a 15 column format can be used, which ',
        'further distringuishes between point matches on the left and on the right side, which ',
        'is useful in some datasets. Those 15 columns are: <span class="inline-code">Name</span>, ',
        '<span class="inline-code">Source name</span>, <span class="inline-code">Target name</span>, ',
        '<span class="inline-code">Source left x</span>, <span class="inline-code">Source left y</span>, ',
        '<span class="inline-code">Source left z</span>, <span class="inline-code">Target left x</span>, ',
        '<span class="inline-code">Target left y</span>, <span class="inline-code">Target left z</span>, ',
        '<span class="inline-code">Source right x</span>, <span class="inline-code">Source right y</span>, ',
        '<span class="inline-code">Source right z</span>, <span class="inline-code">Target right x</span>, ',
        '<span class="inline-code">Target right y</span>, <span class="inline-code">Target right z</span>.</p>',
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

  NeuronSimilarityWidget.prototype.handleConfigStatusChange = function(configId, status) {
    for (let modeName in NeuronSimilarityWidget.Modes) {
      let mode = NeuronSimilarityWidget.Modes[modeName];
      if (CATMAID.tools.isFn(mode.handleConfigStatusChange)) {
        mode.handleConfigStatusChange(this, configId, status);
      }
    }
  };

  NeuronSimilarityWidget.prototype.handleSimilarityStatusChange = function(similarityId, status) {
    for (let modeName in NeuronSimilarityWidget.Modes) {
      let mode = NeuronSimilarityWidget.Modes[modeName];
      if (CATMAID.tools.isFn(mode.handleSimilarityStatusChange)) {
        mode.handleSimilarityStatusChange(this, similarityId, status);
      }
    }
  };

  NeuronSimilarityWidget.prototype.addPointCloud = function(newPointcloudName,
      newPointcloudDescription, pointData, pointMatches, images) {
    if (!newPointcloudName) {
      throw new CATMAID.ValueError("Need a point cloud name");
    }
    if (!pointData) {
      throw new CATMAID.ValueError("Need point data for point cloud");
    }

    // If there are point matches, transform the input point data.
    if (pointMatches) {
      let matches = pointMatches.map(m => new CATMAID.transform.PointMatch(
          new CATMAID.transform.Point(m.source),
          new CATMAID.transform.Point(m.target), 1.0));

      if (!matches || matches.length === 0) {
        throw new CATMAID.ValueError("Could not create point matches for point cloud");
      }

      var mls = new CATMAID.transform.MovingLeastSquaresTransform();
      var model = new CATMAID.transform.AffineModel3D();
      mls.setModel(model);

      try {
        mls.setMatches(matches);
      } catch (error) {
        throw new CATMAID.ValueError("Could not fit model for point cloud transformation");
      }


      // Get a transformed copy of each point.
      pointData = pointData.map(p => mls.apply(p));
    }

    return CATMAID.Pointcloud.add(project.id, newPointcloudName, pointData,
        newPointcloudDescription, images);
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
        let targetType = 'skeleton';

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
          type: 'radio',
          label: 'Target skeletons',
          name: 'target',
          title: 'Query against a set of target skeletons',
          value: 'skeleton',
          checked: targetType === 'skeleton',
          onclick: function() {
            targetType = 'skeleton';
            targetSelect.querySelector('select').disabled = false;
          },
        }, {
          type: 'child',
          element: targetSelect,
        }, {
          type: 'radio',
          label: 'Target point clouds',
          name: 'target',
          checked: targetType === 'pointcloud',
          title: 'Query against a set of target point clouds',
          value: targetType === 'pointcloud',
          onclick: function() {
            targetType = 'pointcloud';
            targetSelect.querySelector('select').disabled = true;
          },
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
      handleConfigStatusChange: function(widget, configId, status) {
        if (status === 'complete') {
          let configSelect = document.getElementById(widget.idPrefix + 'config-select');
          if (!configSelect) throw new CATMAID.ValueError("Config select element not found");
          NeuronSimilarityWidget.updateConfigSelect(configSelect);
        }
      },
      handleSimilarityStatusChange: function(widget, similarityId, status) {
        if (status === 'complete') {
          let table = document.getElementById(widget.idPrefix + 'similarity-table');
          if (table) {
            $(table).DataTable().ajax.reload();
          }
        }
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
      handleConfigStatusChange: function(widget, configId, status) {
        let table = document.getElementById(widget.idPrefix + 'config-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'config-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }
      }
    },
    pointclouds: {
      title: "Point clouds",
      createControls: function(widget) {
        let newPointcloudName = '';
        let newPointcloudDescription = '';
        let csvLineSkip = true;
        let pointData = null;
        let pointMatches = null;
        let images = null;

        let newPointcloudSection = document.createElement('span');
        newPointcloudSection.classList.add('section-header');
        newPointcloudSection.appendChild(document.createTextNode('New point cloud'));

        return [{
          type: 'button',
          label: 'Refresh',
          onclick: widget.refresh.bind(widget),
        }, {
          type: 'button',
          label: 'Reset',
          onclick: function() {
            newPointcloudName = '';
            newPointcloudDescription = '';
            csvLineSkip = true;
            pointData = null;
            pointMatches = null;
            images = null;
            // Reset UI
            $('#neuron-similarity-new-pointcloud-name' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-description' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-header' + widget.widgetID)
              .prop('checked', true);
            $('#neuron-similarity-new-pointcloud-points' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-images' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-images' + widget.widgetID + ' + input[type=button]')
              .val('Images');
            $('#neuron-similarity-new-pointcloud-transformation' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-pointcloud-points' + widget.widgetID)
              .closest('div')
              .find('.files-loaded')
              .removeClass('files-loaded');

            CATMAID.msg("Success", "Point cloud form reset");
          }
        }, {
          type: 'child',
          element: newPointcloudSection,
        }, {
          type: 'text',
          label: 'Name',
          title: 'An optional name for this pointcloud',
          id: 'neuron-similarity-new-pointcloud-name' + widget.widgetID,
          value: newPointcloudName,
          length: 8,
          onchange: function() {
            newPointcloudName = this.value;
          }
        }, {
          type: 'text',
          label: 'Descr.',
          title: 'An optional description of this pointcloud',
          id: 'neuron-similarity-new-pointcloud-description' + widget.widgetID,
          placeholder: '(optional)',
          value: newPointcloudDescription,
          length: 8,
          onchange: function() {
            newPointcloudDescription = this.value;
          }
        }, {
          type: 'checkbox',
          label: 'CSV header',
          id: 'neuron-similarity-new-pointcloud-header' + widget.widgetID,
          value: csvLineSkip,
          onclick: function() {
            csvLineSkip = this.value;
          },
        }, {
          type: 'file',
          label: 'Point CSV',
          title: 'A CSV file that contains each point of this pointcloud. Each row should have the x, y and z values.',
          id: 'neuron-similarity-new-pointcloud-points' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length !== 1) {
              CATMAID.warn("Please select a single point CSV file");
              return;
            }
            let self = this;
            CATMAID.parseCSVFile(e.target.files[0], ',', csvLineSkip ? 1 : 0,
                hasThreeElements)
              .then(function(parsedPointData) {
                parsedPointData.forEach(function(p) {
                  p[0] = parseFloat(p[0]);
                  p[1] = parseFloat(p[1]);
                  p[2] = parseFloat(p[2]);
                });
                pointData = parsedPointData;
                self.classList.add('files-loaded');
                clickedButton.classList.add('files-loaded');
                CATMAID.msg("Success", "Read " + parsedPointData.length + " points");
              })
              .catch(CATMAID.handleError);
          }
        }, {
          type: 'file',
          label: 'Transformation CSV',
          title: 'A CSV file that contains an optional set of point matches that is used to build a transformation that is applied to the input points.',
          id: 'neuron-similarity-new-pointcloud-transformation' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length !== 1) {
              CATMAID.warn("Please select a single transformation CSV file");
              return;
            }
            let self = this;
            CATMAID.parseCSVFile(e.target.files[0], ',', csvLineSkip ? 1 : 0)
              .then(function(transformationData) {
                if (!transformationData || transformationData.length === 0) {
                  throw new CATMAID.ValueError("Could not find any transformation data");
                }
                let nColumns = transformationData[0].length;
                if (nColumns !== 9 && nColumns !== 15) {
                  throw new CATMAID.ValueError("Expected 9 or 15 columns, found " + nColumns);
                }
                let hasMirrorData = nColumns === 15;

                pointMatches = [];

                if (hasMirrorData) {
                  transformationData.forEach(function(p) {
                    if (p.length !== nColumns) {
                      return;
                    }
                    let name = p[0], sourceName = p[1], targetName = p[2],
                        lSourceX = parseFloat(p[3]), lSourceY = parseFloat(p[4]), lSourceZ = parseFloat(p[5]),
                        lTargetX = parseFloat(p[6]), lTargetY = parseFloat(p[7]), lTargetZ = parseFloat(p[8]),
                        rSourceX = parseFloat(p[9]), rSourceY = parseFloat(p[10]), rSourceZ = parseFloat(p[11]),
                        rTargetX = parseFloat(p[12]), rTargetY = parseFloat(p[13]), rTargetZ = parseFloat(p[14]);
                    pointMatches.push({
                      name: name,
                      sourceName: sourceName,
                      targetName: targetName,
                      source: [lSourceX, lSourceY, lSourceZ],
                      target: [lTargetX, lTargetY, lTargetZ],
                    });
                    pointMatches.push({
                      name: name,
                      sourceName: sourceName,
                      targetName: targetName,
                      source: [rSourceX, rSourceY, rSourceZ],
                      target: [rTargetX, rTargetY, rTargetZ],
                    });
                  });
                } else {
                  transformationData.forEach(function(p) {
                    if (p.length !== nColumns) {
                      return;
                    }
                    let name = p[0], sourceName = p[1], targetName = p[2],
                        sourceX = parseFloat(p[3]), sourceY = parseFloat(p[4]), sourceZ = parseFloat(p[5]),
                        targetX = parseFloat(p[6]), targetY = parseFloat(p[7]), targetZ = parseFloat(p[8]);
                    pointMatches.push({
                      name: name,
                      sourceName: sourceName,
                      targetName: targetName,
                      source: [sourceX, sourceY, sourceZ],
                      target: [targetX, targetY, targetZ],
                    });
                  });
                }

                self.classList.add('files-loaded');
                clickedButton.classList.add('files-loaded');
                CATMAID.msg("Success", "Read " + pointMatches.length + " point matches");
              })
              .catch(CATMAID.handleError);
          }
        }, {
          type: 'file',
          label: 'Images',
          title: 'An optional set of image files that represents the pointcloud',
          id: 'neuron-similarity-new-pointcloud-images' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length !== 1) {
              CATMAID.warn("Please select a single image file at a time");
              return;
            }
            let self = this;
            let file = e.target.files[0];
            let reader = new FileReader();
            reader.onload = function() {
              let dataURL = reader.result;
              // Ask user for description for each image
              let dialog = new CATMAID.OptionsDialog("Image description");
              dialog.appendMessage("Please add a description for image \"" + file.name +"\".");
              let description = dialog.appendField("Description", undefined, "", true);
              dialog.onOK = function() {
                if (!images) {
                  images = [];
                }
                images.push({
                  description: description.value,
                  image: dataURL,
                  name: file.name,
                });
                self.classList.add('files-loaded');
                clickedButton.classList.add('files-loaded');
                clickedButton.value = "Images (" + images.length + ")";
                CATMAID.msg("Success", "Image \"" + file.name + "\" added");
              };
              dialog.show("auto", "auto");
            };
            reader.readAsDataURL(file);
          }
        }, {
          type: 'button',
          label: 'Add point cloud',
          onclick: function() {
            if (!newPointcloudName) {
              CATMAID.warn("Need a point cloud name");
              return;
            }
            if (!pointData) {
              CATMAID.warn("Need point data for point cloud");
              return;
            }
            widget.addPointCloud(newPointcloudName, newPointcloudDescription,
                pointData, pointMatches, images)
              .then(function() {
                widget.refresh();
                CATMAID.msg("Success", "Point cloud created");
              })
              .catch(CATMAID.handleError);
          },
        }];
      },
      createContent: function(content, widget) {
        // Create table of all visible configurations.
        let container = content.appendChild(document.createElement('div'));
        container.classList.add('container');
        let table = container.appendChild(document.createElement('table'));
        table.setAttribute('id', widget.idPrefix + 'pointcloud-table');
        let datatable = $(table).DataTable({
          dom: 'lfrtip',
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            CATMAID.Pointcloud.listAll(project.id)
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
          order: [],
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
              data: "description",
              title: "Description",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return data && data.length > 0 ? data : '(none)';
              }
            }, {
              title: "User",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user_id).login;
              }
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
              title: "Action",
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return '<a href="#" data-role="delete-pointcloud">Delete</a> <a href="#" data-role="show-points">View</a>';
              }
            }],
          createdRow: function( row, data, dataIndex ) {
            row.setAttribute('data-pointcloud-id', data.id);
          },
        }).on('click', 'a[data-role=delete-pointcloud]', function() {
          let pointcloudId = this.closest('tr').dataset.pointcloudId;
          if (pointcloudId) {
            CATMAID.Pointcloud.delete(project.id, pointcloudId)
              .then(result => {
                datatable.ajax.reload();
                CATMAID.msg("Success", "Deleted point cloud #" + result.pointcloud_id);
              })
              .catch(CATMAID.handleError);
          }
        }).on('click', 'a[data-role=show-pointcloud]', function() {

        });
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'pointcloud-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }
      }
    },
  };

  function hasThreeElements(l) {
    return l.length === 3;
  }

  NeuronSimilarityWidget.parsePointCSVFile = function(file, skipHeader) {
    return Promise(function(resolve, reject) {

    });
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
    creator: NeuronSimilarityWidget,
    websocketHandlers: {
      'similarity-config-update': function(client, payload) {
        let id = payload.config_id;
        let status = payload.config_status;

        // Show a status message
        if (status === 'complete') {
          CATMAID.msg('Success', 'NBLAST config #' + id + ' can now be used');
        } else if (status === 'error') {
          CATMAID.warn('There was an error during the computation of NBLAST config #' + id);
        } else {
          CATMAID.msg('NBLAST config #' + id + ' status change', 'New status: ' + status);
        }

        // Update all neuron similarity matrix widgets
        let windowMap = WindowMaker.getOpenWindows('neuron-similarity', false, null, true);
        if (windowMap) {
          for (let widget of windowMap.values()) {
            widget.handleConfigStatusChange(id, status);
          }
        }
      },
      'similarity-update': function(client, payload) {
        var status = payload.similarity_status;
        var id = payload.similarity_id;

        // Show a status message
        if (status === 'complete') {
          CATMAID.msg('Success', 'NBLAST similarity #' + id + ' is now computed');
        } else if (status === 'error') {
          CATMAID.warn('There was an error during the computation of NBLAST similarity #' + id);
        } else {
          CATMAID.msg('NBLAST similarity #' + id + ' status change', 'New status: ' + status);
        }

        // Update all neuron similarity matrix widgets
        let windowMap = WindowMaker.getOpenWindows('neuron-similarity', false, null, true);
        if (windowMap) {
          for (let widget of windowMap.values()) {
            widget.handleSimilarityStatusChange(id, status);
          }
        }
      }
    }
  });

})(CATMAID);
