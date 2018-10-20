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

    // Keep track of selected point clouds
    this.pointCloudSelection = {};

    this.lastSimilarityQuery = null;
    this.showOnlyMatchesInResult = true;
    this.showPointCloudImages = false;
    // Whether or not the results are displayed in a dialog (rather than a
    // window).
    this.resultMode = 'window';

    // A currently displayed import job in the point cloud tab.
    this.importJob = null;

    this.mode = 'similarity';
    this.modes = ['similarity', 'configrations', 'pointclouds', 'pointcloud-import'];

    this.neuronNameService = CATMAID.NeuronNameService.getInstance();

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
    this.neuronNameService.unregister(this);
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
        this.updatePointClouds();
        CATMAID.Similarity.testEnvironment(project.id)
          .then(function(result) {
            if (!result || !result.setup_ok) {
              CATMAID.warn("The NBLAST back-end isn't set up properly.");
            }
          })
          .catch(CATMAID.handleError);
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

        '<p>Since this isn\'t always easy to provide, separate <em>transformation</em> files ',
        'can be loaded using the <kbd>Transformation CSVs</kbd> button. These CSV files can have ',
        'either <em>4, 7, 9 or 15 columns</em>. The individual lengths correspond to the following ',
        'values: <ul>',
        '<li>4 columns: <span class="inline-code">Landmark</span>, ',
        '<span class="inline-code">Source x</span>, <span class="inline-code">Source y</span>,',
        '<span class="inline-code">Source z</span> This maps each source location to an existing ',
        'CATMAID landmark. Requires that there is only one location linked to the referenced ',
        'landmark in CATMAID.</li>',
        '<li>7 columns: <span class="inline-code">Landmark</span>, ',
        '<span class="inline-code">Source left x</span>, <span class="inline-code">Source left y</span>, ',
        '<span class="inline-code">Source left z</span>, <span class="inline-code">Source right x</span>, ',
        '<span class="inline-code">Source right y</span>, <span class="inline-code">Source right z</span> ',
        'This is like the 4 column variant, but further distinguishes between left and right side per ',
        'landmark. This expect a left and right location to be linked to the target landmark.</li>',
        '<li>9 columns: <span class="inline-code">Name</span>, ',
        '<span class="inline-code">Source name</span>, <span class="inline-code">Target name</span>, ',
        '<span class="inline-code">Source x</span>, <span class="inline-code">Source y</span>, ',
        '<span class="inline-code">Source z</span>, <span class="inline-code">Target x</span>, ',
        '<span class="inline-code">Target y</span>, <span class="inline-code">Target z</span>. ',
        'This will describe point matches from the source space (<em>Point CSV</em>) to the ',
        'target (project) space.</li>',
        '<li>15 columns: <span class="inline-code">Name</span>, ',
        '<span class="inline-code">Source name</span>, <span class="inline-code">Target name</span>, ',
        '<span class="inline-code">Source left x</span>, <span class="inline-code">Source left y</span>, ',
        '<span class="inline-code">Source left z</span>, <span class="inline-code">Target left x</span>, ',
        '<span class="inline-code">Target left y</span>, <span class="inline-code">Target left z</span>, ',
        '<span class="inline-code">Source right x</span>, <span class="inline-code">Source right y</span>, ',
        '<span class="inline-code">Source right z</span>, <span class="inline-code">Target right x</span>, ',
        '<span class="inline-code">Target right y</span>, <span class="inline-code">Target right z</span> ',
        'This works like the 9 column format, but further distringuishes between point matches on the ',
        'left and on the right side, which is useful in some datasets.</li>',
        '</ul></p>',
        '<p>It is possible to load multiple transformation files and each can have a different format.</p>'
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

  /**
   * Add a new point cloud.
   *
   * @params swapZY  {Boolean}   (optional) Whether or not to transform the
   *                             point data from a left handed system into a
   *                             right handed one.
   * @params invertY {Boolean}   (optional) Whether or not to invert the input
   *                             data's Y values wrt. to the bounding box.
   * @params groupId {Number}    (optional) Id of a group that is allowed
   *                             exclusive access on this point cloud. No one
   *                             else cann see it.
   * @params sampleSize {Number} (optional) A sampling can be performed based on
   *                             the passed in spacing value in nm.
   */
  NeuronSimilarityWidget.prototype.addPointCloud = function(newPointcloudName,
      newPointcloudDescription, pointData, pointMatches, images, swapZY,
      invertY, groupId, sampleSize) {
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

      // Optionally, swap Y and Z
      if (swapZY) {
        pointData.forEach(p => lhToRhInPlace(p));
      }

      if (invertY) {
        let bb = CATMAID.tools.getPointBoundingBox(pointData);
        pointData.forEach(p => {
          p[1] = bb.max.y - p[1];
          return p;
        });
      }

      // Optionally, resampl point cloud
      if (sampleSize) {
        // Create a 3D grid with the respective sample size and find one point
        // in each cell.
        let cellConfig = pointData.reduce(addSampleToEmptyCell, {
          map: new Map(),
          sampleSize: sampleSize,
        });
        pointData = Array.from(cellConfig.map.values());
      }
    }

    return CATMAID.Pointcloud.add(project.id, newPointcloudName, pointData,
        newPointcloudDescription, images, groupId);
  };

  function addSampleToEmptyCell(target, point) {
    let cellX = Math.floor(point[0] / target.sampleSize),
        cellY = Math.floor(point[1] / target.sampleSize),
        cellZ = Math.floor(point[2] / target.sampleSize);
    let key = cellX + '_' + cellY + '_' + cellZ;
    if (!target.map.has(key)) {
      target.map.set(key, point);
    }
    return target;
  }

  function invertYInPlace(p) {
    p[1] = -p[1];
    return p;
  }

  function lhToRhInPlace(p) {
    let y = p[1];
    p[1] = p[2];
    p[2] = y;
    return p;
  }

  function listToStr(list) {
    if (list instanceof Array) {
      return '[' + list.join(', ') + ']';
    } else {
      return list;
    }
  }

  NeuronSimilarityWidget.prototype.getSelectedPointClouds = function() {
    return Object.keys(this.pointCloudSelection)
        .filter(pcId => this.pointCloudSelection[pcId])
        .map(pcId => parseInt(pcId, 10));
  };

  NeuronSimilarityWidget.prototype.updatePointClouds = function() {
    let widget = this;
    return CATMAID.Pointcloud.listAll(project.id)
      .then(function(result) {
        // Save new point clouds in selection map, default to selected.
        result.forEach(pc => {
          if (!widget.pointCloudSelection.hasOwnProperty(pc.id)) {
            widget.pointCloudSelection[pc.id] = true;
          }
        });

        return result;
      });
  };

  NeuronSimilarityWidget.Modes = {
    similarity: {
      title: "Neuron similarity",
      createControls: function(widget) {
        let newQueryName = '';
        let querySource = null;
        let targetSource = null;
        let configId = null;
        let queryType = 'skeleton';
        let targetType = 'skeleton';

        let newScoringSection = document.createElement('span');
        newScoringSection.classList.add('section-header');
        newScoringSection.appendChild(document.createTextNode('New query'));

        let querySelect = document.createElement('label');
        let querySourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName() + ' Query source');
        querySourceSelect.setAttribute('id', widget.idPrefix + 'query-source');
        querySelect.appendChild(querySourceSelect);
        querySource = querySourceSelect.value;
        querySourceSelect.onchange = function(e) {
          querySource = e.target.value;
        };

        let targetSelect = document.createElement('label');
        let targetSourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName() + ' Target source');
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
          id: widget.idPrefix + '-result-mode',
          type: 'select',
          label: 'View',
          title: 'Whether to view results in a window or a dialog',
          value: widget.resultMode,
          entries: [{
            title: 'Window',
            value: 'window'
          }, {
            title: 'Dialog',
            value: 'dialog'
          }],
          onchange: function() {
            widget.resultMode = this.value;
          }
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
          type: 'radio',
          label: 'Query skeletons',
          name: 'query',
          title: 'Query a set of skeletons',
          value: 'skeleton',
          checked: queryType === 'skeleton',
          onclick: function() {
            targetType = 'skeleton';
            querySelect.querySelector('select').disabled = false;
          },
        }, {
          type: 'child',
          element: querySelect,
        }, {
          type: 'radio',
          label: 'Query point clouds',
          name: 'query',
          checked: targetType === 'pointcloud',
          title: 'Query a set of point clouds selected in the "Point clouds" tab.',
          value: 'pointcloud',
          onclick: function() {
            queryType = 'pointcloud';
            querySelect.querySelector('select').disabled = true;
          },
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
          title: 'Query against the set of target point clouds selected in the "Point clouds" tab.',
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
            let queryIds = [];
            if (queryType === 'skeleton') {
              let querySkeletonSource = CATMAID.skeletonListSources.getSource(querySource);
              if (!querySkeletonSource) {
                CATMAID.error("Can't find source: " + querySource);
                return;
              }
              queryIds = querySkeletonSource.getSelectedSkeletons();
            } else if (queryType === 'pointcloud') {
              queryIds = widget.getSelectedPointClouds();
            } else {
              throw new CATMAID.ValueError("Unknown query type: " +  queryType);
            }

            let targetIds = [];
            if (targetType === 'skeleton') {
              let targetSkeletonSource = CATMAID.skeletonListSources.getSource(targetSource);
              if (!targetSkeletonSource) {
                CATMAID.error("Can't find source: " + targetSource);
                return;
              }
              targetIds = targetSkeletonSource.getSelectedSkeletons();
            } else if (targetType === 'pointcloud') {
              targetIds = widget.getSelectedPointClouds();
            } else {
              throw new CATMAID.ValueError("Unknown target type: " +  targetType);
            }

            // Make sure there is a selected config. Default to first element, if none was selected explicitly.
            if (configSelect.options.length > 0 && configSelect.value === -1) {
              configId = parseInt(configSelect.options[0].value, 10);
            }

            CATMAID.Similarity.computeSimilarity(project.id, configId,
                queryIds, targetIds, queryType, targetType, newQueryName)
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
              data: "query_objects",
              title: "Query objects",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let qo = row.query_objects;
                let allBins = qo.join(', ');
                let text = (qo && qo.length > 4) ?
                    (qo[0] + ', ' +  qo[1] +  ' … ' + qo[qo.length - 2] + ', ' + qo[qo.length - 1]) :
                    allBins;
                if (row.query_type === 'skeleton') {
                  return '<span title="' + qo.length + ' skeleton(s)"><em>Skeletons:</em> ' + text + '</span>';
                } else if (row.query_type === 'pointcloud') {
                  return '<span title="' + qo.length + ' point cloud(s)"><em>Point clouds:</em> ' + text + '</span>';
                } else {
                  return '<span title="' + qo.length + ' unknown object(s)"><em>Unknown type:</em> ' + text + '</span>';
                }
              }
            }, {
              data: "target_objects",
              title: "Target objects",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let to = row.target_objects;
                let allBins = to.join(', ');
                let text = (to && to.length > 4) ?
                    (to[0] + ', ' +  to[1] +  ' … ' + to[to.length - 2] + ', ' + to[to.length - 1]) :
                    allBins;
                if (row.target_type === 'skeleton') {
                  return '<span title="' + to.length + ' skeleton(s)"><em>Skeletons:</em> ' + text + '</span>';
                } else if (row.target_type === 'pointcloud') {
                  return '<span title="' + to.length + ' point cloud(s)"><em>Point clouds:</em> ' + text + '</span>';
                } else {
                  return '<span title="' + to.length + ' unknown object(s)"><em>Unknown type:</em> ' + text + '</span>';
                }
              }
            }, {
              data: "scoring",
              title: "Scoring",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if (row.scoring && row.scoring.length > 0) {
                  let allCells = '[' + row.scoring.map(listToStr).join('\n, ') + ']';
                  return '<a data-role="show-similarity" href="#" title="' + allCells + '">View</a>';
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
          widget.showSimilarity(data);
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
        let configSelect = document.getElementById(widget.idPrefix + 'config-select');
        if (!configSelect) throw new CATMAID.ValueError("Config select element not found");
        NeuronSimilarityWidget.updateConfigSelect(configSelect);
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
        let matchSourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName() + ' Match source');
        matchSourceSelect.setAttribute('id', widget.idPrefix + '-config-match-source');
        matchSelect.appendChild(matchSourceSelect);
        matchingSource = matchSourceSelect.value;
        matchSourceSelect.onchange = function(e) {
          matchingSource = e.target.value;
        };
        let randomSelect = document.createElement('label');
        randomSelect.appendChild(document.createTextNode('Random skeletons'));
        randomSelect.disabled = backendRandomSelection;
        let randomSourceSelect = CATMAID.skeletonListSources.createUnboundSelect(widget.getName() + ' Random source');
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
                  return '<a data-role="show-similarity" href="#" title="' + allCells + '">View</a>';
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
        let loadedTransforms = 0;
        let images = null;
        let swapZY = false;
        let invertY = false;
        let sample = true;
        let sampleSize = 1000;
        let leftDim = 'y';

        let newPointcloudSection = document.createElement('span');
        newPointcloudSection.classList.add('section-header');
        newPointcloudSection.appendChild(document.createTextNode('New point cloud'));

        // Group selection
        let groupSelectWrapper = document.createElement('label');
        groupSelectWrapper.appendChild(document.createTextNode('Restrict to group'));
        groupSelectWrapper.setAttribute('title', 'A group that has permission to see this point cloud. It is hidden for everyone else. Only groups this user is member of are shown.');
        let groupSelect = document.createElement('select');
        groupSelect.setAttribute('id', widget.idPrefix + 'group-select');
        groupSelectWrapper.appendChild(groupSelect);
        let groupId = groupSelect.value && groupSelect.value.length > 0 ?
            parseInt(groupSelect.value, 10) : null;
        groupSelect.onchange = function(e) {
          groupId = parseInt(e.target.value, 10);
        };

        // Add available groups to select
        NeuronSimilarityWidget.updateGroupSelect(groupSelect)
          .then(function() {
            // Select first option by default.
            if (groupSelect.options.length > 0 && !groupId && groupId !== 0) {
              groupId = groupSelect.options[0].value;
              groupSelect.value = groupId;
            }
          });

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
            loadedTransforms = 0;
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
            $('#neuron-similarity-new-pointcloud-transformation' + widget.widgetID + ' + input[type=button]')
              .val('Transformation CSVs');
            $('#neuron-similarity-new-pointcloud-points' + widget.widgetID)
              .closest('div')
              .find('.files-loaded')
              .removeClass('files-loaded');

            widget.importJob = null;
            widget.refresh();

            CATMAID.msg("Success", "Point cloud form reset");
          }
        }, {
          type: 'checkbox',
          label: 'With images',
          id: 'neuron-similarity-pointcloud-with-images' + widget.widgetID,
          value: widget.showPointCloudImages,
          onclick: function() {
            widget.showPointCloudImages = this.checked;
            widget.refresh();
          },
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
            csvLineSkip = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Swap Y/Z',
          id: 'neuron-similarity-new-pointcloud-swap-yz' + widget.widgetID,
          value: swapZY,
          onclick: function() {
            swapZY = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Invert Y',
          id: 'neuron-similarity-new-pointcloud-invert-y' + widget.widgetID,
          value: invertY,
          onclick: function() {
            invertY = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Resample (nm)',
          value: sample,
          onclick: function() {
            sample = this.checked;
            let sampleSizeInput = document.getElementById(
                'neuron-similarity-sample-size' + widget.widgetID);
            if (sampleSizeInput) {
              sampleSizeInput.disabled = !this.checked;
            }
          },
        }, {
          type: 'numeric',
          id: 'neuron-similarity-sample-size' + widget.widgetID,
          min: 0,
          length: 4,
          value: sampleSize,
          disabled: !sample,
          onchange: function() {
            let val = parseFloat(this.value);
            if (val !== undefined && !Number.isNaN(val)) {
              sampleSize = val;
            }
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
          type: 'select',
          label: 'Project left dir',
          title: 'Select the direction in project space (where all tracing data is) that represents a canonical "left" (as opposed to right) in the data set. This is only used when 7-column transformation data is imported to know which landmark location is left.',
          value: leftDim,
          entries: [
            {title: '+X', value: 'x'},
            {title: '+Y', value: 'y'},
            {title: '+Z', value: 'z'},
            {title: '-X', value: '-x'},
            {title: '-Y', value: '-y'},
            {title: '-Z', value: '-z'},
          ],
          onchange: function() {
            leftDim = this.value;
          },
        }, {
          type: 'file',
          label: 'Transformation CSVs',
          title: 'An optional set of CSV files that contain a set of point matches each that are used to build a transformation that is applied to the input points.',
          id: 'neuron-similarity-new-pointcloud-transformation' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length !== 1) {
              CATMAID.warn("Please select a single transformation CSV file");
              return;
            }
            let self = this;

            if (!pointMatches) {
              pointMatches = [];
            }

            CATMAID.NeuronSimilarityWidget.loadTransformationFile(e.target.files[0],
                csvLineSkip, leftDim)
              .then(function(loadedPointMatches) {
                ++loadedTransforms;
                Array.prototype.push.apply(pointMatches, loadedPointMatches);
                self.classList.add('files-loaded');
                clickedButton.classList.add('files-loaded');
                clickedButton.value = "Transformation CSVs (" + loadedTransforms + ")";
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
                  file: file,
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
          type: 'child',
          element: groupSelectWrapper,
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
            let effectiveGroupId = (groupId & groupId !== 'none') ?
                groupId : undefined;
            let effectiveSampleSize = (sample && sampleSize) ?
                sampleSize : undefined;
            widget.addPointCloud(newPointcloudName, newPointcloudDescription,
                pointData, pointMatches, images, swapZY, invertY, effectiveGroupId,
                effectiveSampleSize)
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
            widget.updatePointClouds()
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
              title: "",
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return '<input type="checkbox" data-role="select-pointcloud"' +
                    (widget.pointCloudSelection[row.id] ? ' checked' : '') + '></input>';
              }
            }, {
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
              title: "Images",
              orderable: false,
              class: "cm-center",
              visible: widget.showPointCloudImages,
              render: function(data, type, row, meta) {
                return `<span class="image-list" data-pointcloud-id="${row.id}"></span>`;
              }
            }, {
              title: "Action",
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return '<a href="#" data-role="delete-pointcloud">Delete</a> <a href="#" data-role="show-images">View images</a> <a href="#" data-role="show-pointcloud">View</a>';
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
          let pointcloudId = this.closest('tr').dataset.pointcloudId;
          if (pointcloudId) {
            // Show point cloud in a new 3D viewer dialog.
            let widget3d = WindowMaker.create('3d-viewer').widget;
            widget3d.showPointCloud(pointcloudId, true);
          }
        }).on('click', 'a[data-role=show-images]', function() {
          let pointcloudId = this.closest('tr').dataset.pointcloudId;
          if (pointcloudId) {
            // Show point cloud in a new 3D viewer dialog.
            NeuronSimilarityWidget.showPointCloudImages(project.id, pointcloudId, true);
          }
        }).on('click', 'input[data-role=select-pointcloud]', function() {
          let pointcloudId = this.closest('tr').dataset.pointcloudId;
          if (pointcloudId) {
            widget.pointCloudSelection[pointcloudId] = !widget.pointCloudSelection[pointcloudId];
          }
        }).on('draw', function() {
          // Update image colum, if visible
          if (widget.showPointCloudImages) {
            // Get image information on currently displayed point clouds
            let table = $(this).closest('table');
            let datatable = table.DataTable();
            let pageData = datatable.rows({'page': 'current'}).data();
            let pagePointcloudIds = pageData.map(function(p) { return p.id; }).toArray();
            if (pagePointcloudIds && pagePointcloudIds.length > 0) {
              CATMAID.Pointcloud.list(project.id, false, true, pagePointcloudIds)
                .then(function(result) {
                  // Find span elements of individual point clouds
                  result.forEach(function(pointcloud) {
                    let span = $(`span.image-list[data-pointcloud-id=${pointcloud.id}]`, table).empty();

                    for (let image of pointcloud.images) {
                      let imageSource = CATMAID.Pointcloud.getImagePath(project.id, pointcloud.id, image.id);
                      let description = image.description ? image.description : '(no description)';
                      let imageTitle = `${image.name} (${image.id}): ${description}`;
                      span.append('<img src="' + imageSource + '" title="' + imageTitle + '" style="height: 150px; margin: 0 0.4em 0 0.4em;" />');
                    }
                  });
                })
                .catch(CATMAID.handleError);
            }
          }
        });

        // Add a toggle-all checkbox for point cloud selection
        $($('th', table)[0]).append($('<input title="Toogle selection of all pointclouds" ' +
            'type="checkbox"></input>').on('change', function() {
              for (let pcid in widget.pointCloudSelection) {
                widget.pointCloudSelection[pcid] = this.checked;
              }
              datatable.rows().invalidate();
            }));
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'pointcloud-table');
        if (table) {
          let datatable = $(table).DataTable();
          datatable.column(6).visible(widget.showPointCloudImages);
          datatable.ajax.reload();

        }
      }
    },
    'pointcloud-import': {
      /**
       * Import a series of CSV files along with images and a shared
       * transformation.
       */
      title: "Point cloud import",
      createControls: function(widget) {
        let newPointcloudFilter = '';
        let newPointcloudSkipN = 0;
        let newPointcloudName = '%f';
        let newPointcloudDescription = '';
        let csvLineSkip = true;
        let pointMatches = null;
        let loadedTransforms = 0;
        let images = null;
        let swapZY = false;
        let invertY = false;
        let sample = true;
        let sampleSize = 1000;
        let csvFiles = [];
        let imageFileSets = [];
        let leftDim = 'y';

        let newPointcloudSection = document.createElement('span');
        newPointcloudSection.classList.add('section-header');
        newPointcloudSection.appendChild(document.createTextNode('New point clouds'));

        // Group selection
        let groupSelectWrapper = document.createElement('label');
        groupSelectWrapper.appendChild(document.createTextNode('Restrict to group'));
        groupSelectWrapper.setAttribute('title', 'A group that has permission to see this point cloud. It is hidden for everyone else. Only groups this user is member of are shown.');
        let groupSelect = document.createElement('select');
        groupSelect.setAttribute('id', widget.idPrefix + 'group-select');
        groupSelectWrapper.appendChild(groupSelect);
        let groupId = groupSelect.value && groupSelect.value.length > 0 ?
            parseInt(groupSelect.value, 10) : null;
        groupSelect.onchange = function(e) {
          groupId = parseInt(e.target.value, 10);
        };

        // Add available groups to select
        NeuronSimilarityWidget.updateGroupSelect(groupSelect)
          .then(function() {
            // Select first option by default.
            if (groupSelect.options.length > 0 && !groupId && groupId !== 0) {
              groupId = groupSelect.options[0].value;
              groupSelect.value = groupId;
            }
          });

        return [{
          type: 'button',
          label: 'Refresh',
          onclick: widget.refresh.bind(widget),
        }, {
          type: 'button',
          label: 'Reset',
          onclick: function() {
            self.importJob = null;
            newPointcloudName = '%f';
            newPointcloudFilter = '';
            newPointcloudSkipN = 0;
            newPointcloudDescription = '';
            csvLineSkip = true;
            pointMatches = null;
            loadedTransforms = 0;
            images = null;
            // Reset UI
            $('#neuron-similarity-new-import-pointcloud-name' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-description' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-header' + widget.widgetID)
              .prop('checked', true);
            $('#neuron-similarity-new-import-pointcloud-points' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-images' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-images' + widget.widgetID + ' + input[type=button]')
              .val('Images');
            $('#neuron-similarity-new-import-pointcloud-transformation' + widget.widgetID)
              .val('');
            $('#neuron-similarity-new-import-pointcloud-transformation' + widget.widgetID + ' + input[type=button]')
              .val('Transformation CSVs');
            $('#neuron-similarity-new-import-pointcloud-points' + widget.widgetID)
              .closest('div')
              .find('.files-loaded')
              .removeClass('files-loaded');
            $('#neuron-similarity-new-import-pointcloud-import' + widget.widgetID)
              .attr('disabled', 'disabled');

            CATMAID.msg("Success", "Point cloud form reset");
          }
        }, {
          type: 'child',
          element: newPointcloudSection,
        }, {
          type: 'text',
          label: 'Path filter',
          placeholder: 'Use \'/\' for RegEx',
          title: 'An optional filter for loaded data',
          id: 'neuron-similarity-new-import-pointcloud-filter' + widget.widgetID,
          value: newPointcloudFilter,
          length: 8,
          onchange: function() {
            newPointcloudFilter = this.value;
          }
        }, {
          type: 'numeric',
          label: 'Skip N',
          title: 'An optional offset to the available files from where to start to import',
          id: 'neuron-similarity-new-import-pointcloud-skip' + widget.widgetID,
          value: newPointcloudSkipN,
          length: 3,
          onchange: function() {
            let value = parseInt(this.value, 10);
            if (value && !Number.isNaN(value)) {
              newPointcloudSkipN = value;
            }
          }
        }, {
          type: 'text',
          label: 'Name',
          title: 'An optional name for this pointcloud. The placehoolder %f can be used for the file name without extension',
          id: 'neuron-similarity-new-import-pointcloud-name' + widget.widgetID,
          value: newPointcloudName,
          length: 8,
          onchange: function() {
            newPointcloudName = this.value;
          }
        }, {
          type: 'text',
          label: 'Descr.',
          title: 'An optional description of this pointcloud',
          id: 'neuron-similarity-new-import-pointcloud-description' + widget.widgetID,
          placeholder: '(optional)',
          value: newPointcloudDescription,
          length: 8,
          onchange: function() {
            newPointcloudDescription = this.value;
          }
        }, {
          type: 'checkbox',
          label: 'CSV header',
          id: 'neuron-similarity-new-import-pointcloud-header' + widget.widgetID,
          value: csvLineSkip,
          onclick: function() {
            csvLineSkip = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Swap Y/Z',
          id: 'neuron-similarity-new-import-pointcloud-swap-yz' + widget.widgetID,
          value: swapZY,
          onclick: function() {
            swapZY = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Invert Y',
          id: 'neuron-similarity-new-import-pointcloud-invert-y' + widget.widgetID,
          value: invertY,
          onclick: function() {
            invertY = this.checked;
          },
        }, {
          type: 'checkbox',
          label: 'Resample (nm)',
          value: sample,
          onclick: function() {
            sample = this.checked;
            let sampleSizeInput = document.getElementById(
                'neuron-similarity-sample-size' + widget.widgetID);
            if (sampleSizeInput) {
              sampleSizeInput.disabled = !this.checked;
            }
          },
        }, {
          type: 'numeric',
          id: 'neuron-similarity-sample-size' + widget.widgetID,
          min: 0,
          length: 4,
          value: sampleSize,
          disabled: !sample,
          onchange: function() {
            let val = parseFloat(this.value);
            if (val !== undefined && !Number.isNaN(val)) {
              sampleSize = val;
            }
          },
        }, {
          type: 'folder',
          label: 'Point CSV folder',
          title: 'Set a folder containing CSV file that contains each point of this pointcloud. Each row should have the x, y and z values.',
          id: 'neuron-similarity-new-import-pointcloud-points' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length == 0) {
              CATMAID.warn("No files found in folder");
              return;
            }
            csvFiles = Array.from(e.target.files);
            this.classList.add('files-loaded');
            clickedButton.classList.add('files-loaded');
            CATMAID.msg("Success", "Found " + e.target.files.length + " files in the selected folder");
          }
        }, {
          type: 'select',
          label: 'Project left dir',
          title: 'Select the direction in project space (where all tracing data is) that represents a canonical "left" (as opposed to right) in the data set. This is only used when 7-column transformation data is imported to know which landmark location is left.',
          value: leftDim,
          entries: [
            {title: '+X', value: 'x'},
            {title: '+Y', value: 'y'},
            {title: '+Z', value: 'z'},
            {title: '-X', value: '-x'},
            {title: '-Y', value: '-y'},
            {title: '-Z', value: '-z'},
          ],
          onchange: function() {
            leftDim = this.value;
          },
        }, {
          type: 'file',
          label: 'Transformation CSVs',
          title: 'A CSV file that contains an optional set of point matches that is used to build a transformation that is applied to the input points.',
          id: 'neuron-similarity-new-import-pointcloud-transformation' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            // Try loading point CSV file
            if (e.target.files.length !== 1) {
              CATMAID.warn("Please select a single transformation CSV file");
              return;
            }
            let self = this;

            if (!pointMatches) {
              pointMatches = [];
            }

            CATMAID.NeuronSimilarityWidget.loadTransformationFile(e.target.files[0],
                csvLineSkip, leftDim)
              .then(function(loadedPointMatches) {
                ++loadedTransforms;
                Array.prototype.push.apply(pointMatches, loadedPointMatches);
                self.classList.add('files-loaded');
                clickedButton.classList.add('files-loaded');
                clickedButton.value = "Transformation CSVs (" + loadedTransforms + ")";
                CATMAID.msg("Success", "Read " + pointMatches.length + " point matches");
              })
              .catch(CATMAID.handleError);
          }
        }, {
          type: 'folder',
          label: 'Image folders',
          title: 'An optional set of folders that contain image files that represent individual  pointclouds',
          id: 'neuron-similarity-new-import-pointcloud-images' + widget.widgetID,
          multiple: false,
          onclick: function(e, clickedButton) {
            let imageFiles = Array.from(e.target.files);
            // Try loading point CSV file
            if (imageFiles.length === 0) {
              CATMAID.warn("Could not find any file in the selected image folder");
              return;
            }
            let self = this;
            // Ask user for description for each image
            let dialog = new CATMAID.OptionsDialog("Image description");
            dialog.appendMessage("Please add a description for images from " +
                "this folder. You can use the placeholer %f to reference the " +
                "filename of an actual file (e.g. \"Skeleton projection %f\")");
            let description = dialog.appendField("Description", undefined, "", true);
            dialog.onOK = function() {
              imageFileSets.push({
                description: description.value,
                files: imageFiles,
              });
              self.classList.add('files-loaded');
              clickedButton.classList.add('files-loaded');
              clickedButton.value = "Images folders (" + imageFileSets.length + ")";
              CATMAID.msg("Success", "Image folder added");
            };
            dialog.show(500, "auto", true);
          }
        }, {
          type: 'child',
          element: groupSelectWrapper,
        }, {
          type: 'button',
          label: 'Load point clouds',
          onclick: function() {
            if (!newPointcloudName) {
              CATMAID.warn("Need a point cloud name");
              return;
            }
            if (!csvFiles || csvFiles.length === 0) {
              CATMAID.warn("No CSV file folder selected");
              return;
            }
            let effectiveGroupId = (groupId & groupId !== 'none') ?
                groupId : undefined;
            let effectiveSampleSize = (sample && sampleSize) ?
                sampleSize : undefined;

            NeuronSimilarityWidget.loadPointcloudsFromFiles(newPointcloudName, newPointcloudDescription,
                csvFiles, pointMatches, imageFileSets, swapZY, invertY, effectiveGroupId,
                effectiveSampleSize, newPointcloudFilter, newPointcloudSkipN)
              .then(function(importJob) {
                widget.importJob = importJob;
                widget.refresh();
                CATMAID.msg("Success", "Point clouds loaded");
              })
              .catch(CATMAID.handleError);
          },
        }, {
          type: 'button',
          label: 'Import point clouds',
          disabled: true,
          id: 'neuron-similarity-new-import-pointcloud-import' + widget.widgetID,
          onclick: function() {
            // Requires all fields to be set.
            if (widget.importJob) {
              widget.runQueuedPointcloudImport(widget.importJob);
            } else {
              CATMAID.warn("No data to import");
            }
          },
        }];
      },
      createContent: function(content, widget) {
        // Add a datatable, but hide it if no import job is created.
        let container = content.appendChild(document.createElement('div'));
        container.classList.add('container');
        container.style.display = widget.importJob ? 'block' : 'none';
        let p = container.appendChild(document.createElement('p'));
        p.classList.add('info-text');
        p.appendChild(document.createTextNode('This is an overview on the ' +
            'current import task. If everything looks like expected, the ' +
            'import can be started using the "Import point clouds" button above.'));
        let table = container.appendChild(document.createElement('table'));
        table.setAttribute('id', widget.idPrefix + 'pointcloud-import-table');
        let datatable = $(table).DataTable({
          dom: 'lfrtip',
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            let importData = widget.importJob ? Array.from(widget.importJob.pointClouds.values()) : [];
            callback({
              draw: data.draw,
              data: importData,
              recordsTotal: importData.length,
              recordsFiltered: importData.length,
            });
          },
          order: [[0, 'desc']],
          columns: [{
            data: 'name',
            title: 'Name',
            orderable: true,
          }, {
            data: 'file.name',
            title: 'File name',
            orderable: true,
          }, {
            data: 'path',
            title: 'Images',
            orderable: false,
            render: function(data, type, row, meta) {
              return '<a href="#" data-role="show-images">' + row.images.length + ' images</a>';
            },
          }],
        });
      },
      refresh: function(widget) {
        let table = document.getElementById(widget.idPrefix + 'pointcloud-import-table');
        if (table) {
          $(table).DataTable().ajax.reload();
        }
        let container = table.closest('div.container');
        if (container) {
          container.style.display = widget.importJob ? 'block' : 'none';
        }
        let importButton = document.getElementById('neuron-similarity-new-import-pointcloud-import' + widget.widgetID);
        if (importButton) {
          if (widget.importJob) {
            importButton.removeAttribute('disabled');
          } else {
            importButton.setAttribute('disabled', 'disabled');
          }
        }
      },
    },
  };

  function hasThreeElements(l) {
    return l.length === 3;
  }

  function makeRegularFilter(filter) {
    return function(value) {
      return value.indexOf(filter) !== -1;
    };
  }

  function makeRegExFilter(filter) {
    let re = new RegExp(filter);
    return function(value) {
      return re.test(value);
    };
  }

  /**
   * Try to load all CSV files and match them to the respective image files by
   * name.
   */
  NeuronSimilarityWidget.loadPointcloudsFromFiles = function(newPointcloudName,
      newPointcloudDescription, csvFiles, pointMatches, imageFileSets, swapZY,
      invertY, effectiveGroupId, effectiveSampleSize, newPointcloudFilter,
      newPointcloudSkipN) {
    newPointcloudSkipN = newPointcloudSkipN || 0;
    return new Promise(function(resolve, reject) {
      let csvFileWorkingSet = Array.from(csvFiles);
      let filter;
      if (newPointcloudFilter && newPointcloudFilter.length > 0) {
        // Treat filter as regex search if it stats with '/'.
        if (newPointcloudFilter[0] === '/') {
          filter = makeRegExFilter(newPointcloudFilter.substr(1));
        } else {
          filter = makeRegularFilter(newPointcloudFilter);
        }
      } else {
        filter = function() { return true; };
      }

      // Compute name matches and list imports in table
      let pointclouds = csvFiles.reduce(function(m, f, i) {
        if (i < newPointcloudSkipN) {
          return m;
        }
        let filename = CATMAID.tools.extractFileNameNoExt(f.name);
        if (!filter(filename)) {
          return m;
        }
        m.set(filename, {
          'file': f,
          'filename': filename,
          'name': newPointcloudName.replace(/%f/g, filename) || filename,
          'description': newPointcloudDescription.replace(/%f/g, filename) || '',
          'images': [],
        });
        return m;
      }, new Map());

      // Iterate over images and match them with CSV files.
      if (imageFileSets) {
        imageFileSets.forEach(function(ifs) {
          let description = ifs.description;
          let nIgnoredFiles = 0;
          for (let i=0; i<ifs.files.length; ++i) {
            let file = ifs.files[i];
            let filename = CATMAID.tools.extractFileNameNoExt(file.name);
            let pointcloud = pointclouds.get(filename);
            if (!pointcloud) {
              console.log('Filtering file: ' + file.name);
              ++nIgnoredFiles;
              continue;
            }
            pointcloud.images.push({
              'file': file,
              'description': description.replace(/%f/g, filename),
              'name': file.name,
            });
          }
        });
      }

      // Store a copy of the current import target.
      resolve({
        pointClouds: pointclouds,
        pointMatches: pointMatches,
        swapZY: swapZY,
        invertY: invertY,
        effectiveGroupId: effectiveGroupId,
        effectiveSampleSize: effectiveSampleSize,
      });
    });
  };

  /**
   * This imports a set of CSV files along with images.
   */
  NeuronSimilarityWidget.prototype.runQueuedPointcloudImport = function(importJob) {
    let self = this;
    let csvFiles = Array.from(importJob.pointClouds.keys());
    let nTotalImports = importJob.pointClouds.size;
    let successfulImports = 0;
    let attemptedImports = 0;
    let errors = [];

    if (!csvFiles || csvFiles.length === 0) {
      CATMAID.warn("No files to import");
      return;
    }

    function parseCSVFile(pointCloudInfo) {
      return CATMAID.parseCSVFile(pointCloudInfo.file, ',',
          importJob.csvLineSkip ? 1 : 0, hasThreeElements)
        .then(function(parsedPointData) {
          parsedPointData.forEach(function(p) {
            p[0] = parseFloat(p[0]);
            p[1] = parseFloat(p[1]);
            p[2] = parseFloat(p[2]);
          });

          return self.addPointCloud(pointCloudInfo.name, pointCloudInfo.description,
              parsedPointData, importJob.pointMatches, pointCloudInfo.images,
              importJob.swapZY, importJob.invertY, importJob.effectiveGroupId,
              importJob.effectiveSampleSize);
        });
    }

    function parseFiles() {
      let pointCloudName = csvFiles.pop();
      if (pointCloudName) {
        let csvFile = importJob.pointClouds.get(pointCloudName);
        return parseCSVFile(csvFile)
          .then(function(pointCloud) {
            ++successfulImports;
            ++attemptedImports;
            CATMAID.msg("Success", "Point cloud " + pointCloud.name +
                " imported (ID: " + pointCloud.id + ") - " +
                attemptedImports + '/' + nTotalImports);
            return parseFiles();
          })
          .catch(function(e) {
            ++attemptedImports;
            errors.push({
              'error': e,
              'fileDescription': csvFile,
            });
            return parseFiles();
          });
      }
      return Promise.resolve();
    }

    parseFiles()
      .then(function() {
        if (successfulImports === 0) {
          CATMAID.msg("No successful imports", "No file imported");
        } else {
          CATMAID.msg("Success", "Imported " + successfulImports + '/' +
              nTotalImports + " files successfully");
        }
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Show a dialog with all images linked to this point cloud.
   */
  NeuronSimilarityWidget.showPointCloudImages = function(projectId, pointcloudId) {
    CATMAID.Pointcloud.get(projectId, pointcloudId, false, true)
      .then(function(pointcloud) {

        if (!pointcloud.images || pointcloud.images.length === 0) {
          CATMAID.warn("No images are linked to this point cloud");
          return;
        }

        // Create a new dialog with image elements
        let dialog = new CATMAID.OptionsDialog("Images linked to point cloud " +
            pointcloud.name + " (" + pointcloud.id + ")", {
              'Ok': CATMAID.tools.noop,
            });

        let imageContainer = document.createElement('span');
        imageContainer.style.display = 'flex';

        for (let image of pointcloud.images) {
          let img = document.createElement('img');
          img.src = CATMAID.Pointcloud.getImagePath(projectId, pointcloud.id, image.id);
          let description = image.description ? image.description : '(no description)';
          img.title = `${image.name} (${image.id}): ${description}`;
          img.style.height = '400px';
          imageContainer.appendChild(img);
        }

        dialog.appendChild(imageContainer);
        dialog.show('auto', 'auto');
      })
      .catch(CATMAID.handleError);
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

  /**
   * Show a particular similarity result in a result dialog or result window,
   * depending on the widget settings.
   */
  NeuronSimilarityWidget.prototype.showSimilarity = function(similarity) {
    let self = this;
    if (this.resultMode === 'dialog') {
      let targetModels = CATMAID.Similarity.getReferencedSkeletonModels(similarity);
      let needsPointclouds = similarity.query_type === 'pointcloud' ||
          similarity.target_type === 'pointcloud';

      let prepare = [];
      if (!CATMAID.tools.isEmpty(targetModels)) {
        prepare.push(this.neuronNameService.registerAll(this, targetModels));
      }

      Promise.all(prepare)
        .then(function() {
          if (needsPointclouds) {
            return CATMAID.Pointcloud.listAll(project.id, true);
          }
        })
        .then(function(pointclouds) {
          NeuronSimilarityWidget.showSimilarityDialog(self, similarity, pointclouds);
        })
        .catch(CATMAID.handleError);
    } else if (this.resultMode === 'window') {
      NeuronSimilarityWidget.showSimilarityWindow(similarity);
    } else {
      throw new CATMAID.ValueError('Unknown result mode: ' + this.resultMode);
    }
  };

  NeuronSimilarityWidget.showSimilarityWindow = function(similarity) {
    let widgetInfo = CATMAID.WindowMaker.create('neuron-similarity-detail');
    widgetInfo.widget.setSimilarity(similarity);
  };

  /**
   * Show similarity results in a simple dialog.
   */
  NeuronSimilarityWidget.showSimilarityDialog = function(widget, similarity, pointClouds) {
    let dialog = new CATMAID.OptionsDialog("Similarity result", {
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
      theadTh1.appendChild(document.createTextNode('Query ' + similarity.query_type));
      let theadTh2 = theadTr.appendChild(document.createElement('th'));
      theadTh2.appendChild(document.createTextNode('Top 10 target ' + similarity.target_type + 's'));

      let tbody = table.appendChild(document.createElement('tbody'));

      let getQueryName;
      if (similarity.query_type === 'skeleton') {
        getQueryName = function(element) {
          return CATMAID.NeuronNameService.getInstance().getName(element);
        };
      } else if (similarity.query_type === 'pointcloud') {
        getQueryName = function(element) {
          let pc = pointClouds[element];
          return pc ? pc.name : (element + ' (not found)');
        };
      } else {
        getQueryName = function(element) {
          return element;
        };
      }

      let getTargetName;
      if (similarity.target_type === 'skeleton') {
        getTargetName = function(element) {
          return CATMAID.NeuronNameService.getInstance().getName(element);
        };
      } else if (similarity.target_type === 'pointcloud') {
        getTargetName = function(element) {
          let pc = pointClouds[element];
          return pc ? pc.name : (element + ' (not found)');
        };
      } else {
        getTargetName = function(element) {
          return element;
        };
      }

      let collectEntries = function(target, element, i) {
        if (element >= 0) {
          target.push([similarity.target_objects[i], getTargetName(similarity.target_objects[i]), element]);
        }
        return target;
      };

      let compareEntriesDesc = function(a, b) {
        if (a[2] > b[2]) return -1;
        if (a[2] < b[2]) return 1;
        return 0;
      };

      let dataAboveZero = similarity.query_objects.map(function(qskid, i) {
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
            return `<a href="#" data-skeleton-id="${row[0]}" data-role="select-skeleton">${getQueryName(row[0])}</a>`;
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
                elements.push(`<span class="result-element"><span class="li">${i+1}.</span><a href="#" data-skeleton-id="${entry[0]}" data-role="select-skeleton">${entry[1]}</a> (${entry[2]})</span>`);
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

  NeuronSimilarityWidget.updateGroupSelect = function (select) {
    return CATMAID.Group.list(CATMAID.session.userid)
      .then(function(groups) {
        let selectedIndex = select.selectedIndex;
        let selectedValue = selectedIndex === -1 ? null : select.value;

        // Clear options
        select.options.length = 0;

        // Add default option
        select.options.add(new Option("(none)", "none"));

        for (let i=0; i<groups.length; ++i) {
          let group = groups[i];
          let selected = group.id === selectedValue;
          let name = `${group.name} (${group.id})`;
          let option = new Option(name, group.id, selected, selected);
          select.options.add(option);
        }
      })
      .catch(CATMAID.handleError);
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

  /**
   * Return a Promise resolving into point matches from data with the following
   * 4-column format: Landmark, Source x, Source y, Source z.
   */
  NeuronSimilarityWidget.loadTransformationFrom4ColData = function(data) {
    let nColumns = 4;
    return CATMAID.Landmarks.list(project.id, true)
      .then(function(landmarks) {
        let pointMatches = [];
        let landmarkIndex = landmarks.reduce(function(m, l) {
          m.set(l.name, l);
          return m;
        }, new Map());
        data.forEach(function(p, i) {
          if (p.length !== nColumns) {
            CATMAID.warn("Skipping line " + (i + 1) + " due to unexpected number of columns");
            return;
          }
          let landmarkName = p[0],
              sourceX = parseFloat(p[1]), sourceY = parseFloat(p[2]), sourceZ = parseFloat(p[3]);

          // Find landmark and its location
          let landmark = landmarkIndex.get(landmarkName);
          if (!landmark) {
            CATMAID.warn("Could not find landmark \"" + landmarkName + "\"");
            return;
          }
          if (!landmark.locations || landmark.locations.length === 0) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" doesn't have any location linked.");
            return;
          }
          if (landmark.locations.length > 1) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" has more than one location linked.");
            return;
          }

          let name = landmarkName;
          let targetName = landmarkName;
          let target = landmark.locations[0];

          pointMatches.push({
            name: name,
            sourceName: sourceName,
            targetName: targetName,
            source: [sourceX, sourceY, sourceZ],
            target: [target.x, target.y, target.z],
          });
        });
        return pointMatches;
      });
  };

  /**
   * Return a Promise resolving into point matches from data with the following
   * 7-column format: Landmark, Source left x, Source left y, Source left z,
   * Source right x, Source right y, Source right z.
   *
   * @param {transformationData[]} data A list of lists, representing the data
   *                                    to parse.
   * @param {string} leftDim (optinal) Either "x", "y", "z", "-x", "-y" or "-z".
   *                         Represents the dimension which means "left".
   *                         Defaults to "y".
   */
  NeuronSimilarityWidget.loadTransformationFrom7ColData = function(data, leftDim) {
    leftDim = leftDim || 'y';
    let nColumns = 7;
    return CATMAID.Landmarks.list(project.id, true)
      .then(function(landmarks) {
        let pointMatches = [];
        let landmarkIndex = landmarks.reduce(function(m, l) {
          m.set(l.name, l);
          return m;
        }, new Map());
        data.forEach(function(p, i) {
          if (p.length !== nColumns) {
            CATMAID.warn("Skipping line " + (i + 1) + " due to unexpected number of columns");
            return;
          }
          let landmarkName = p[0],
              lSourceX = parseFloat(p[1]), lSourceY = parseFloat(p[2]), lSourceZ = parseFloat(p[3]),
              rSourceX = parseFloat(p[4]), rSourceY = parseFloat(p[5]), rSourceZ = parseFloat(p[6]);

          // Allow special case with only one linked location when lSource and
          // rSource are the same.
          let singleLocationAllowed = p[1] === p[4] && p[2] === p[5] && p[3] === p[6];

          // Find landmark and its location
          let landmark = landmarkIndex.get(landmarkName);
          if (!landmark) {
            CATMAID.warn("Could not find landmark \"" + landmarkName + "\"");
            return;
          }
          if (!landmark.locations || landmark.locations.length === 0) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" doesn't have any location linked. Need two (left and right).");
            return;
          }
          if (landmark.locations.length == 1 && !singleLocationAllowed) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" has only one location linked. Need two (left and right).");
            return;
          }
          if (landmark.locations.length > 2) {
            CATMAID.warn("Landmark \"" + landmarkName + "\" has more than two location linked. Need two (left and right).");
            return;
          }

          let name = landmarkName;
          let targetName = landmarkName;
          if (singleLocationAllowed) {
            let lTarget = landmark.locations[0];
            if ([lTarget.x, lTarget.y, lTarget.z].every(CATMAID.tools.isNumber)) {
              pointMatches.push({
                name: name,
                sourceName: landmarkName,
                targetName: targetName,
                source: [lSourceX, lSourceY, lSourceZ],
                target: [lTarget.x, lTarget.x, lTarget.z],
              });
            } else {
              CATMAID.warn("Skipping left target of " + i + ". entry. No numbers found.");
            }
          } else {
            // Find landmark location on 'left' side. Which dimension that is
            // exactly is specified by the caller.
            let location1 = landmark.locations[0], location2 = landmark.locations[1];
            let lTarget, rTarget;
            if (leftDim === 'x' || leftDim === 'y' || leftDim === 'z') {
              if (location1[leftDim] > location2[leftDim]) {
                lTarget = location1;
                rTarget = location2;
              } else {
                lTarget = location2;
                rTarget = location1;
              }
            } else if (leftDim === '-x' || leftDim === '-y' || leftDim === '-z') {
              if (location1[leftDim[1]] < location2[leftDim[1]]) {
                lTarget = location1;
                rTarget = location2;
              } else {
                lTarget = location2;
                rTarget = location1;
              }
            } else {
              throw new CATMAID.ValueError("Unknown project space 'left' dimension: " + leftDim);
            }

            let lSourceLocation = [lSourceX, lSourceY, lSourceZ];
            if (lSourceLocation.every(CATMAID.tools.isNumber)) {
              pointMatches.push({
                name: name,
                sourceName: landmarkName,
                targetName: targetName,
                source: lSourceLocation,
                target: [lTarget.x, lTarget.x, lTarget.z],
              });
            } else {
              CATMAID.warn("Skipping left target of " + i + ". entry. No numbers found.");
            }

            let rSourceLocation = [rSourceX, rSourceY, rSourceZ];
            if (rSourceLocation.every(CATMAID.tools.isNumber)) {
              pointMatches.push({
                name: name,
                sourceName: landmarkName,
                targetName: targetName,
                source: rSourceLocation,
                target: [rTarget.x, rTarget.y, rTarget.z],
              });
            } else {
              CATMAID.warn("Skipping right target of " + i + ". entry. No numbers found.");
            }
          }
        });
        return pointMatches;
      });
  };

  /**
   * Return a Promise resolving into point matches from data with the following
   * 9-column format: Name, Source name, Target name, Source x, Source y, Source
   * z, Target x, Target y, Target z
   *
   * @param {transformationData[]} data A list of lists, representing the data
   *                                    to parse.
   */
  NeuronSimilarityWidget.loadTransformationFrom9ColData = function(data) {
    let nColumns = 9;
    let pointMatches = [];
    data.forEach(function(p) {
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
    return Promise.resolve(pointMatches);
  };

  /**
   * Return a Promise resolving into point matches from data with the following
   * 9-column format: Name, Source name, Target name, Source left x, Source left
   * y, Source left z, Target left x, Target left y, Target left z, Source right
   * x, Source right y, Source right z, Target right x, Target right y, Target
   * right z
   *
   * @param {transformationData[]} data A list of lists, representing the data
   *                                    to parse.
   */
  NeuronSimilarityWidget.loadTransformationFrom15ColData = function(data) {
    let nColumns = 15;
    let pointMatches = [];
    data.forEach(function(p) {
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
    return Promise.resolve(pointMatches);
  };

  NeuronSimilarityWidget.loadTransformationFile = function(file, csvLineSkip, leftDim) {
    return CATMAID.parseCSVFile(file, ',', csvLineSkip ? 1 : 0)
      .then(function(transformationData) {
        if (!transformationData || transformationData.length === 0) {
          throw new CATMAID.ValueError("Could not find any transformation data");
        }

        let nColumns = transformationData[0].length;
        if (nColumns === 4) {
          return NeuronSimilarityWidget.loadTransformationFrom4ColData(transformationData);
        } else if (nColumns === 7) {
          return NeuronSimilarityWidget.loadTransformationFrom7ColData(transformationData, leftDim);
        } else if (nColumns === 9) {
          return NeuronSimilarityWidget.loadTransformationFrom9ColData(transformationData);
        } else if (nColumns === 15) {
          return NeuronSimilarityWidget.loadTransformationFrom15ColData(transformationData);
        }
        throw new CATMAID.ValueError("Expected 4, 7, 9 or 15 columns, found " + nColumns);
      });
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
    let header = ['""'].concat(similarity.target_objects.map(function(s) {
      return `"${s}"`;
    })).join(',');
    let data = [header];
    similarity.query_objects.forEach(function(s, i) {
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
