/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a new Neuron Similarity Result Widget. It lists neuron similarities.
   */
  var NeuronSimilarityDetailWidget = function(options) {
    options = options || {};

    this.widgetID = this.registerInstance();
    this.idPrefix = "neuron-similarity-detail" + this.widgetID + '-';

    // The currently selected similarity query result.
    this.similarity = null;
    // A dicrionary of point clouds
    this.pointClouds = new Map();
    // A dicrionary of point sets
    this.pointSets = new Map();
    // Whether or not only positive scores (i.e. matches) should be displayed.
    this.onlyPositiveScores = true;
    // Show a top N of result matches
    this.showTopN = 10;
    // A percentage that is used to sample result point clouds when displayed in
    // a 3D Viewer.
    this.pointCloudDisplaySample = 1.0;

    // We expect the content DOM element to be available after initialization.
    this.content = null;

    if (options.similarityId) {
      this.setSimilarityFromId(options.similarityId);
    }
  };

  $.extend(NeuronSimilarityDetailWidget.prototype, new InstanceRegistry());

  NeuronSimilarityDetailWidget.prototype.getName = function() {
    return "Neuron Similarity Detail " + this.widgetID;
  };

  NeuronSimilarityDetailWidget.prototype.destroy = function() {
    this.unregisterInstance();
    CATMAID.NeuronNameService.getInstance().unregister(this);
  };

  NeuronSimilarityDetailWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        let self = this;

        // Update point cloud list
        var initSimilarityList = function() {
          return CATMAID.Similarity.listAllSkeletonSimilarities(project.id)
            .then(function(json) {
              let similarityId = self.similarity ? self.similarity.id : null;
              var similarities = json.sort(function(a, b) {
                return CATMAID.tools.compareStrings(a.name, b.name);
              }).map(function(similarity) {
                let entry = {
                  title: similarity.name + ' (' + similarity.id + ')',
                  value: similarity.id
                };
                if (similarity.id == similarityId) {
                  entry.checked = true;
                }
                return entry;
              });
              var selectedSimilarity = self.similarityId;
              // Create actual element based on the returned data
              var node = CATMAID.DOM.createRadioSelect('Similarity', similarities,
                  selectedSimilarity, true);
              // Add a selection handler
              node.onchange = function(e) {
                var similarityId = parseInt(e.target.value, 10);
                self.setSimilarityFromId(similarityId);
              };
              return node;
            });
        };

        CATMAID.DOM.appendElement(controls, {
          type: 'button',
          label: 'Refresh',
          onclick: self.refresh.bind(self),
        });

        // Create async selection and wrap it in container to have handle on initial
        // DOM location
        var similaritySelection = CATMAID.DOM.createAsyncPlaceholder(initSimilarityList());
        var similaritySelectionWrapper = controls.appendChild(document.createElement('span'));
        similaritySelectionWrapper.appendChild(similaritySelection);

        // Replace point cloud selection wrapper children with new select
        var refreshSimilarityList = function() {
          while (0 !== similaritySelectionWrapper.children.length) {
            similaritySelectionWrapper.removeChild(similaritySelectionWrapper.children[0]);
          }
          var pointcloudSelection = CATMAID.DOM.createAsyncPlaceholder(initSimilarityList());
          similaritySelectionWrapper.appendChild(pointcloudSelection);
        };

        CATMAID.DOM.appendElement(controls, {
          type: 'checkbox',
          label: 'Only positive scores',
          value: self.onlyPositiveScores,
          onclick: function() {
            self.onlyPositiveScores = this.checked;
            self.refresh();
          }
        });

        CATMAID.DOM.appendElement(controls, {
          type: 'numeric',
          label: 'Top N results',
          title: 'Show only the top N matches for a query, zero shows all results',
          length: 3,
          value: self.showTopN,
          onchange: function() {
            let value = parseInt(this.value, 10);
            if (value !== undefined && !Number.isNaN(value)) {
              self.showTopN = value;
              self.refresh();
            }
          },
        });

        CATMAID.DOM.appendElement(controls, {
          type: 'numeric',
          label: 'Result point cloud sample',
          title: 'A value from 0-100 that represents what percentage of a point cloud should be displayed in a 3D Viewer.',
          length: 4,
          min: 0,
          max: 100,
          value: self.pointCloudDisplaySample * 100,
          onchange: function() {
            let value = parseInt(this.value, 10);
            if (value !== undefined && !Number.isNaN(value)) {
              self.pointCloudDisplaySample = value / 100;
              self.refresh();
            }
          },
        });

        CATMAID.DOM.appendElement(controls, {
          type: 'button',
          label: 'Show scoring matrix',
          onclick: function() {
            if (!self.similarity) {
              CATMAID.warn("No similarity query selected");
              return;
            }
            CATMAID.Similarity.getConfig(project.id, self.similarity.config_id)
              .then(function(config) {
                CATMAID.NeuronSimilarityWidget.showSimilarityScoringDialog(config);
              })
              .catch(CATMAID.handleError);
          },
        });

        CATMAID.DOM.appendElement(controls, {
          type: 'button',
          label: 'Download scores as CSV',
          onclick: function() {
            if (!self.similarity) {
              CATMAID.warn("No similarity query selected");
              return;
            }
            CATMAID.Similarity.getConfig(project.id, self.similarity.config_id)
              .then(function(config) {
                CATMAID.NeuronSimilarityWidget.exportNblastCSV(self.similarity, config);
                CATMAID.msg("Success", "CSV exported");
              })
              .catch(CATMAID.handleError);
          },
        });
      },
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        this.content = content;
      },
      init: function() {
        this.refresh();
      },
    };
  };

  /**
   * Set a new similarity object to be the active similarity object.
   */
  NeuronSimilarityDetailWidget.prototype.setSimilarity = function(similarity) {
    let prepare;
    if (similarity.status === 'complete' && (!similarity.scoring || similarity.scoring.length === 0)) {
      prepare = CATMAID.Similarity.getSimilarity(project.id, similarity.id, true, true);
    } else {
      prepare = Promise.resolve(similarity);
    }

    prepare
      .then(updatedSimulatiry => {
        this.similarity = updatedSimulatiry;
        let targetModels = CATMAID.Similarity.getReferencedSkeletonModels(this.similarity);
        return CATMAID.NeuronNameService.getInstance().registerAll(this, targetModels);
      })
      .then(() => this.refresh())
      .catch(CATMAID.handleError);
  };

  NeuronSimilarityDetailWidget.prototype.setSimilarityFromId = function(similarityId) {
    CATMAID.Similarity.getSimilarity(project.id, similarityId, true)
      .then((function(similarity) {
        this.setSimilarity(similarity);
      }).bind(this))
      .catch(CATMAID.handleError);
  };

  NeuronSimilarityDetailWidget.prototype.refresh = function() {
    // Clear content
    while (this.content.lastChild) {
      this.content.removeChild(this.content.lastChild);
    }

    // Reset message and if no similarity is set, set a message and return
    // early.
    this.content.dataset.msg = '';
    if (!this.similarity) {
      this.content.dataset.msg = 'Please select a similarity query result';
      return;
    }

    let table = this.content.appendChild(document.createElement('table'));
    table.classList.add('result-table');

    let thead = table.appendChild(document.createElement('thead'));
    let theadTr = thead.appendChild(document.createElement('tr'));
    let theadTh1 = theadTr.appendChild(document.createElement('th'));
    theadTh1.appendChild(document.createTextNode('Query ' + this.similarity.query_type));
    let theadTh2 = theadTr.appendChild(document.createElement('th'));
    theadTh2.appendChild(document.createTextNode(`Top ${this.showTopN} target ${this.similarity.target_type}s`));
    let theadTh3 = theadTr.appendChild(document.createElement('th'));
    theadTh3.appendChild(document.createTextNode('Action'));
    let tbody = table.appendChild(document.createElement('tbody'));

    NeuronSimilarityDetailWidget.createSimilarityTable(this.similarity,
        this.onlyPositiveScores, this.showTopN, this.pointClouds,
        this.pointSets, table, this.pointCloudDisplaySample);

    let invQ = this.similarity.invalid_query_objects;
    let invT = this.similarity.invalid_target_objects;
    let invalidQObjectsMsg = invQ && invQ.length > 0 ?
            `Invalid query objects: ${invQ.join(', ')}` : 'Invalid query objects: none';
    let invalidTObjectsMsg = invT && invT.length > 0 ?
            `Invalid target objects: ${invT.join(', ')}` : 'Invalid target objects: none';

    let topText = this.content.appendChild(document.createElement('p'));
    topText.classList.add('info-text');
    topText.appendChild(document.createTextNode(invalidQObjectsMsg));
    topText.appendChild(document.createElement('br'));
    topText.appendChild(document.createTextNode(invalidTObjectsMsg));
  };

  NeuronSimilarityDetailWidget.createSimilarityTable = function(similarity,
      matchesOnly, showTopN, pointClouds, pointSets, table, pointcloudSample) {
    if (!table) {
      table = document.createElement('table');
    }

    let getQueryName;
    if (similarity.query_type === 'skeleton') {
      getQueryName = function(element) {
        return CATMAID.NeuronNameService.getInstance().getName(element);
      };
    } else if (similarity.query_type === 'pointcloud') {
      getQueryName = function(element) {
        let pc = pointClouds.get(element);
        return pc ? pc.name : (element + ' (not found)');
      };
    } else if (similarity.query_type === 'pointset') {
      getQueryName = function(element) {
        let ps = pointClouds.get(element);
        return ps ? ps.name : (element + ' (not found)');
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
        let pc = pointClouds.get(element);
        return pc ? pc.name : (element + ' (not found)');
      };
    } else if (similarity.target_type === 'pointset') {
      getTargetName = function(element) {
        let ps = pointSets.get(element);
        return ps ? ps.name : (element + ' (not found)');
      };
    } else {
      getTargetName = function(element) {
        return element;
      };
    }

    let collectEntries = function(target, element, i) {
      if (!matchesOnly || element >= 0) {
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

    // Get detailed point cloud and point set information
    let referencedPointclouds = [];
    let referencedPointsets = [];
    if (similarity) {
      let getReferncedObjectIds = function (type) {
        let workingset;
        if (similarity.query_type === type) {
          workingset = new Set(similarity.query_objects.slice());
        }
        if (similarity.target_type === type) {
          workingset = dataAboveZero.reduce(function(a, p) {
            let topNElements = Math.min(showTopN, p[1].length);
            for (let i=0; i<topNElements; ++i) {
              let entry = p[1][i];
              a.add(entry[0]);
            }
            return a;
          }, workingset ? workingset : new Set());
        }
        return workingset ? Array.from(workingset) : [];
      };

      referencedPointclouds = getReferncedObjectIds('pointcloud');
      referencedPointsets = getReferncedObjectIds('pointset');
    }

    // Find unknown referenced objects
    let getMissingReferencedObjects = function (referencedObjects, index) {
      return referencedObjects.reduce(function(m, o) {
        if (!index.has(o)) {
          m.push(o);
        }
        return m;
      }, []);
    };

    let missingPointClouds = getMissingReferencedObjects(referencedPointclouds, pointClouds);
    let missingPointSets = getMissingReferencedObjects(referencedPointsets, pointSets);

    let preparePromises = [];
    if (missingPointClouds.length > 0) {
      preparePromises.push(CATMAID.Pointcloud.list(project.id, false, true,
          missingPointClouds)
        .then(function(result) {
          result.forEach(function(e) {
            pointClouds.set(e.id, e);
          });
        }));
    }
    if (missingPointSets.length > 0) {
      preparePromises.push(CATMAID.Pointset.list(project.id, false,
          missingPointClouds)
        .then(function(result) {
          result.forEach(function(e) {
            pointClouds.set(e.id, e);
          });
        }));
    }

    let prepare = Promise.all(preparePromises);

    let nTargetObjects = similarity.target_objects.length;
    let nTargetObjectsToAdd = showTopN ? Math.min(showTopN, nTargetObjects) : nTargetObjects;
    let lut = new THREE.Lut("greenred", 10);
    // Set the LUT range to the number of displayed objects. If there is only
    // one, make sure, the LUT range is [0,1], because it won't provide colors
    // otherwise.
    lut.setMax(Math.max(1, nTargetObjectsToAdd - 1));

    $(table).DataTable({
      dom: 'lfrtip',
      autoWidth: false,
      ajax: function(data, callback, settings) {
        // Load data dependencies
        prepare.then(function(result) {
            callback({
              draw: data.draw,
              data: dataAboveZero,
              recordsTotal: dataAboveZero.length,
              recordsFiltered: dataAboveZero.length
            });
          })
          .catch(CATMAID.handleError);
      },
      order: [],
      columns: [{
        orderable: true,
        class: 'cm-center cm-top',
        render: function(data, type, row, meta) {
          return `<a href="#" data-skeleton-id="${row[0]}" data-role="select-skeleton">${getQueryName(row[0])}</a>`;
        }
      }, {
        orderable: false,
        class: 'cm-left',
        render: function(data, type, row, meta) {
          if (row[1].length > 0) {
            let topNElements = Math.min(showTopN, row[1].length);
            if (similarity.target_type === 'pointcloud') {
              let elements = ['<span class="result-list-vertical">'];
              for (let i=0; i<topNElements; ++i) {
                let color = lut.getColor(i);
                let entry = row[1][i];
                let name =  getTargetName(entry[0]);
                elements.push(`<span class="result-element"><span class="li">${i+1}.</span><span class="li-body"><span class="result-info"><a href="#" data-color="${color.getStyle()}"  data-pointcloud-id="${entry[0]}" data-role="select-pointcloud">${name}</a><span class="score">Score: ${entry[2]}</span><span class="color"><i class="fa fa-circle" style="color: ${color.getStyle()}"></i></span><span class="actions" data-pointcloud-id="${entry[0]}"><a href="#" data-role="show-single-3d" data-target-index="${i}">3D Viewer</a><a href="#" data-role="show-images">Images</a></span></span>`);
                elements.push('<span class="result-images">');
                let pointcloud = pointClouds.get(entry[0]);
                if (pointcloud && pointcloud.images) {
                  for (let image of pointcloud.images) {
                    let imageSource = CATMAID.Pointcloud.getImagePath(project.id, pointcloud.id, image.id);
                    let description = image.description ? image.description : '(no description)';
                    let imageTitle = `${image.name} (${image.id}): ${description}`;
                    elements.push('<img src="' + imageSource + '" title="' + imageTitle + '" style="height: 200px;" />');
                  }
                }
                elements.push('</span></span></span>');
              }
              elements.push('</span>');
              return elements.join('');
            } else if (similarity.target_type === 'skeleton') {
              let elements = ['<span class="result-list-vertical">'];
              for (let i=0; i<topNElements; ++i) {
                let color = lut.getColor(i);
                let entry = row[1][i];
                let name =  getTargetName(entry[0]);
                elements.push(`<span class="result-element"><span class="li">${i+1}.</span><a href="#" data-skeleton-id="${entry[0]}" data-role="select-skeleton">${name}</a><span class="score">Score: ${entry[2]}</span><span class="color"><i class="fa fa-circle" style="color: ${color.getStyle()}"></i></span></span>`);
              }
              elements.push('</span>');
              return elements.join('');
            } else if (similarity.target_type === 'pointset') {
              let elements = ['<span class="result-list-vertical">'];
              for (let i=0; i<topNElements; ++i) {
                let color = lut.getColor(i);
                let entry = row[1][i];
                let name =  getTargetName(entry[0]);
                elements.push(`<span class="result-element"><span class="li">${i+1}.</span>${name}<span class="score">Score: ${entry[2]}</span><span class="color"><i class="fa fa-circle" style="color: ${color.getStyle()}"></i></span></span>`);
              }
              elements.push('</span>');
              return elements.join('');
            }
          } else {
            return '(no match)';
          }
        }
      }, {
        orderable: false,
        class: "cm-center cm-top",
        render: function(data, type, row, meta) {
          return '<a href="#" data-role="show-all-3d">Show 3D</a>';
        }
      }]
    }).on('click', 'a[data-role=select-skeleton]', function() {
      let skeletonId = parseInt(this.dataset.skeletonId, 10);
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
    }).on('click', 'a[data-role=select-pointcloud]', function() {
      let pointcloudId = parseInt(this.dataset.pointcloudId, 10);
      let color = this.dataset.color;
      NeuronSimilarityDetailWidget.showPointcloud3d(pointcloudId, color);
    }).on('click', 'a[data-role=show-all-3d]', function() {
      var table = $(this).closest('table');
      var tr = $(this).closest('tr');
      var data = $(table).DataTable().row(tr).data();
      NeuronSimilarityDetailWidget.showAllSimilarityResults(similarity,
          matchesOnly, showTopN, pointcloudSample);
    }).on('click', 'a[data-role=show-single-3d]', function() {
      var pointcloudId = parseInt(this.parentNode.dataset.pointcloudId, 10);
      if (!CATMAID.tools.isNumber(pointcloudId)) {
        return;
      }
      var targetIndex = parseInt(this.dataset.targetIndex, 10);
      var table = $(this).closest('table');
      var tr = $(this).closest('tr');
      var data = $(table).DataTable().row(tr).data();
      NeuronSimilarityDetailWidget.showSingleSimilarityResult(similarity,
          data[0], pointcloudId, targetIndex, showTopN, pointcloudSample);
    }).on('click', 'a[data-role=show-images]', function() {
      var pointcloudId = parseInt(this.parentNode.dataset.pointcloudId, 10);
      if (!CATMAID.tools.isNumber(pointcloudId)) {
        return;
      }
      CATMAID.NeuronSimilarityWidget.showPointCloudImages(project.id,
          pointcloudId, true);
    });

    if (matchesOnly) {
      $(table).DataTable().columns(1).search('^(?!.*no match).*$', true, false, true).draw();
    }

    return table;
  };

  NeuronSimilarityDetailWidget.showSingleSimilarityResult = function(
      similarity, queryObjectId, targetObjectId, targetIndex, showTopN,
      pointcloudSample) {
    let widget3d = WindowMaker.create('3d-viewer').widget;
    widget3d.options.shading_method = 'none';
    widget3d.options.color_method = 'none';
    widget3d.options.pointcloud_sample = pointcloudSample || 1.0;

    if (similarity.query_type === 'skeleton') {
      let models = {};
      models[queryObjectId] = new CATMAID.SkeletonModel(queryObjectId);
      widget3d.append(models);
    } else if (similarity.query_type === 'pointcloud') {
      widget3d.showPointCloud(queryObjectId, true);
    }

    let nTargetObjects = similarity.target_objects.length;
    let nTargetObjectsToAdd = showTopN ? Math.min(showTopN, nTargetObjects) : nTargetObjects;
    let lut = new THREE.Lut("greenred", 10);
    lut.setMax(nTargetObjectsToAdd - 1);
    let color = lut.getColor(targetIndex || 0);

    if (similarity.target_type === 'skeleton') {
      let models = {};
      models[queryObjectId] = new CATMAID.SkeletonModel(targetObjectId, undefined, color);
      widget3d.append(models);
    } else if (similarity.target_type === 'pointcloud') {
      widget3d.showPointCloud(targetObjectId, true, color);
    }
  };

  /**
   * Open a new 3D Viewer and show a particular point cloud in it, optionally in
   * a predefiend color.
   */
  NeuronSimilarityDetailWidget.showPointcloud3d = function(pointcloudId, color, pointcloudSample) {
    let widget3d = WindowMaker.create('3d-viewer').widget;
    widget3d.options.shading_method = 'none';
    widget3d.options.color_method = 'none';
    widget3d.options.pointcloud_sample = pointcloudSample || 1.0;
    widget3d.showPointCloud(pointcloudId, true,
        color ? new THREE.Color(color) : undefined);
  };

  NeuronSimilarityDetailWidget.showAllSimilarityResults = function(similarity,
      matchesOnly, showTopN, pointcloudSample) {
    let widget3dInfo = WindowMaker.create('3d-viewer');
    let widget3d = widget3dInfo.widget;
    // Try to find the Selection Table that has been opened along with the 3D
    // Viewer. If it can't be found, the 3D Viewer will be used to add
    // skeletons.
    let splitNode = widget3dInfo.window.getParent();
    let skeletonTarget = widget3d;
    if (splitNode) {
      let children = splitNode.getChildren();
      for (let i=0; i<children.length; ++i) {
        let win = children[i];
        if (win === widget3dInfo.window) continue;
        let widgetInfo = CATMAID.WindowMaker.getWidgetKeyForWindow(win);
        if (widgetInfo && widgetInfo.widget instanceof CATMAID.SelectionTable) {
          skeletonTarget = widgetInfo.widget;
          break;
        }
      }
    }

    widget3d.options.shading_method = 'none';
    widget3d.options.color_method = 'none';
    widget3d.options.pointcloud_sample = pointcloudSample || 1.0;

    if (similarity.query_type === 'skeleton') {
      let models = similarity.query_objects.reduce(function(o, s) {
        o[s] = new CATMAID.SkeletonModel(s);
        return o;
      }, {});
      skeletonTarget.append(models);
    } else if (similarity.query_type === 'pointcloud') {
      for (let i=0; i<similarity.query_objects.length; ++i) {
        let pointCloudId = similarity.query_objects[i];
        widget3d.showPointCloud(pointCloudId, true);
      }
    }

    let nTargetObjects = similarity.target_objects.length;
    let nTargetObjectsToAdd = showTopN ? Math.min(showTopN, nTargetObjects) : nTargetObjects;
    let lut = new THREE.Lut("greenred", 10);
    lut.setMax(nTargetObjectsToAdd - 1);

    let compareScore = function(a, b) {
      if (b[1] === undefined) return -1;
      if (a[1] === undefined) return 1;
      if (a[1] > b[1]) return -1;
      if (a[1] < b[1]) return 1;
      return 0;
    };

    let withScore = function(oid, i) {
      // TODO: For now only the first query object scoring is respected.
      return [oid, similarity.scoring[0][i]];
    };


    let sortedTargetObjects = similarity.target_objects.map(withScore).sort(compareScore);
    let sourceObjectIds = new Set(similarity.query_objects);
    let sourceTargetTypesMatch = similarity.target_type === similarity.query_type;

    if (similarity.target_type === 'skeleton') {
      let nAddedModels = 0;
      let models = sortedTargetObjects.reduce(function(o, s, i) {
        let matchOkay = !matchesOnly || s[1] > 0;
        let topNOkay = !showTopN || i < showTopN;
        if (matchOkay && topNOkay) {
          if (!(sourceObjectIds.has(s[0]) && sourceTargetTypesMatch)) {
            o[s[0]] = new CATMAID.SkeletonModel(s[0], undefined, lut.getColor(i));
            ++nAddedModels;
          }
        }
        return o;
      }, {});
      skeletonTarget.append(models);
    } else if (similarity.target_type === 'pointcloud') {
      let nAddedPointClouds = 0;
      for (let i=0; i<sortedTargetObjects.length; ++i) {
        let s = sortedTargetObjects[i];
        let matchOkay = !matchesOnly || s[1] > 0;
        let topNOkay = !showTopN || i < showTopN;
        if (matchOkay && topNOkay) {
          if (!(sourceObjectIds.has(s[0]) && sourceTargetTypesMatch)) {
            widget3d.showPointCloud(s[0], true, lut.getColor(i));
          }
        }
      }
    }
  };


  // Export into CATMAID namespace
  CATMAID.NeuronSimilarityDetailWidget = NeuronSimilarityDetailWidget;


  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Neuron similarity detail",
    description: "Show details of a neuron similarity query",
    key: "neuron-similarity-detail",
    creator: NeuronSimilarityDetailWidget,
  });

})(CATMAID);
