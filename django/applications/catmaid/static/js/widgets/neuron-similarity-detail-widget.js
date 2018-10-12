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
    // Whether or not only positive scores (i.e. matches) should be displayed.
    this.onlyPositiveScores = true;
    // Show a top N of result matches
    this.showTopN = 10;

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
    this.similarity = similarity;
    let targetModels = CATMAID.Similarity.getReferencedSkeletonModels(similarity);
    let self = this;
    CATMAID.NeuronNameService.getInstance().registerAll(this, targetModels)
      .then(function() {
        // Update all point clouds, if they are not yet available
        if (!self.pointClouds || self.pointClouds.size === 0) {
          return CATMAID.Pointcloud.listAll(project.id, true)
            .then(function(result) {
              self.pointClouds = result.reduce(function(m, e) {
                m.set(e.id, e);
                return m;
              }, new Map());
            });
        }
      })
      .then(function() {
        self.refresh();
      })
      .catch(CATMAID.handleError);
  };

  NeuronSimilarityDetailWidget.prototype.setSimilarityFromId = function(similarityId) {
    CATMAID.Similarity.getSimilarity(project.id, similarityId)
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

    let thead = table.appendChild(document.createElement('thead'));
    let theadTr = thead.appendChild(document.createElement('tr'));
    let theadTh1 = theadTr.appendChild(document.createElement('th'));
    theadTh1.appendChild(document.createTextNode('Query ' + this.similarity.query_type));
    let theadTh2 = theadTr.appendChild(document.createElement('th'));
    theadTh2.appendChild(document.createTextNode(`Top ${this.showTopN} target ${this.similarity.target_type}s`));
    let tbody = table.appendChild(document.createElement('tbody'));

    NeuronSimilarityDetailWidget.createSimilarityTable(this.similarity,
        this.onlyPositiveScores, this.showTopN, this.pointClouds, table);
  };

  NeuronSimilarityDetailWidget.createSimilarityTable = function(similarity,
      matchesOnly, showTopN, pointClouds, table) {
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
      if (a[2] > b[1]) return -1;
      if (a[2] < b[1]) return 1;
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
            let topNElements = Math.min(showTopN, row[1].length);
            let elements = ['<span class="result-list">'];
            for (let i=0; i<topNElements; ++i) {
              let entry = row[1][i];
              elements.push(`<span class="result-element"><span>${i+1}.</span><a href="#" data-skeleton-id="${entry[0]}" data-role="select-skeleton">${entry[1]}</a> (${entry[2]})</span>`);
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

    if (matchesOnly) {
      $(table).DataTable().columns(1).search('^(?!.*no match).*$', true, false, true).draw();
    }

    return table;
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
