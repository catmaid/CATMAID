/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a new connector table, optional with a set of initial skeleton
   * models.
   */
  var ConnectorList = function(options)
  {
    options = options || {};

    this.widgetID = this.registerInstance();
    this.idPrefix = `connector-list${this.widgetID}-`;

    // A skeleton source to collect results in
    this.resultSkeletonSource = new CATMAID.BasicSkeletonSource(this.getName(), {
      owner: this
    });

    // A skeleton source that is selected to provide skeleton ID constraints for
    // listing links with specific skeletons.
    this.focusSetSource = 'none';
    this.focusSetRelation = options.focusSetRelationId || 'none';
    this.partnerSetSource = options.partnerSetSource || 'none';
    this.partnerSetExcludedSkeletonIds = new Set(options.partnerSetExcludedSkeletonIds || []);
    this.partnerSetRelation = options.partnerSetRelationId || 'none';

    // The displayed data table
    this.connectorTable = null;

    this.data = options.data;

    // A set of filter rules to apply to the handled connectors
    this.filterRules = [];
    // Filter rules can optionally be disabled
    this.applyFilterRules = true;

    CATMAID.skeletonListSources.on(CATMAID.SkeletonSourceManager.EVENT_SOURCE_ADDED,
        this.updateSkeletonConstraintSources, this);
    CATMAID.skeletonListSources.on(CATMAID.SkeletonSourceManager.EVENT_SOURCE_REMOVED,
        this.updateSkeletonConstraintSources, this);
  };

  /**
   * Create a new Connector Table based on an array of arrays, each one
   * representing a connector link. The expected format is:
   *
   * [connector_id, x, y, z, skeleton_id, confidence, creator_id, creation_time,
   * edition_time, relation_id]
   *
   * Optionally, relation ID filters for the focused set and the partner set can
   * be provided.
   *
   * @returns {Object} Window handle and widget instance.
   */
  ConnectorList.fromRawData = function(data, focusSetRelationId,
      partnerSetRelationId, partnerSetExcludedSkeletonIds, partnerSetSource) {
    return CATMAID.WindowMaker.create('connector-list', {
      data: data,
      focusSetRelationId: focusSetRelationId,
      partnerSetRelationId: partnerSetRelationId,
      partnerSetExcludedSkeletonIds: partnerSetExcludedSkeletonIds,
      partnerSetSource: partnerSetSource,
    });
  };

  ConnectorList.fromSkeletonIds = function(skeletonIds, queryRelation, nodeIds,
      source) {
    let containsAllowedNode;
    if (nodeIds) {
      let allowedNodeIds = new Set(nodeIds.map(Number));
      containsAllowedNode = function(p) {
        return allowedNodeIds.has(p[1]);
      };
    }

    CATMAID.fetch(project.id + '/connectors/', 'POST', {
        'skeleton_ids': skeletonIds,
        'with_tags': 'false',
        'relation_type': queryRelation,
        'with_partners': true,
      })
      .then(function(result) {
        // Only allow links that are connecting to nodes in the passed in list.
        let allowedConnectors;
        if (nodeIds) {
          allowedConnectors = result.connectors.filter(function(c) {
            let partners = result.partners[c[0]];
            return partners.some(containsAllowedNode);
          });
        } else {
          allowedConnectors = result.connectors;
        }
        let skeletonIdSet = new Set(skeletonIds);
        // Create entries of the following format:
        // [connector_id, x, y, z, skeleton_id, confidence, creator_id,
        // treenode_id, creation_time, edition_time, relation_id]
        let connectorData = allowedConnectors.reduce(function(o, c) {
          let partners = result.partners[c[0]];
          for (let i=0; i<partners.length; ++i) {
            // Partners: link_id, treenode_id, skeleton_id, relation_id,
            // confidence, user_id, creation_time, edition_time
            let p = partners[i];
            // We don't want links to the focused skeletons
            if (skeletonIdSet.has(p[2])) {
              o.push([c[0], c[1], c[2], c[3], p[2], p[4], p[5], p[1], p[6], p[7], p[3]]);
            }
          }
          return o;
        }, []);

        return Promise.all([
          connectorData,
          CATMAID.Relations.list(project.id),
        ]);
      })
      .then(function(results) {
        let connectorData = results[0];
        let relationMap = results[1];

        let focusSetRelationId;// = relationMap[relation];
        let connectorList = CATMAID.ConnectorList.fromRawData(
          connectorData, focusSetRelationId, undefined, undefined,
          source).widget;
      })
      .catch(CATMAID.handleError);
  };

  $.extend(ConnectorList.prototype, new InstanceRegistry());

  ConnectorList.prototype.getName = function() {
    return "Connector list " + this.widgetID;
  };

  ConnectorList.prototype.destroy = function() {
    this.unregisterInstance();
    this.resultSkeletonSource.destroy();

    SkeletonAnnotations.off(CATMAID.SkeletonSourceManager.EVENT_SOURCE_ADDED,
        this.updateSkeletonConstraintSources, this);
    SkeletonAnnotations.off(CATMAID.SkeletonSourceManager.EVENT_SOURCE_REMOVED,
        this.updateSkeletonConstraintSources, this);
  };

  ConnectorList.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var exportCSV = document.createElement('input');
        exportCSV.setAttribute("type", "button");
        exportCSV.setAttribute("value", "Export links as CSV");
        exportCSV.setAttribute("title", "Export a CSV file for the currently displayed table");
        exportCSV.onclick = this.exportCSV.bind(this);
        controls.appendChild(exportCSV);

        var exportConnectorCSV = document.createElement('input');
        exportConnectorCSV.setAttribute("type", "button");
        exportConnectorCSV.setAttribute("value", "Export connectors as CSV");
        exportConnectorCSV.setAttribute("title", "Export a CSV file including all connector IDs and locations");
        exportConnectorCSV.onclick = this.exportConnectorCSV.bind(this);
        controls.appendChild(exportConnectorCSV);

        var self = this;

        var sourceSelect = CATMAID.DOM.appendSelect(
            controls,
            "skeleton-constraint-source",
            "Skeletons",
            [{title: '(any)', value: 'none'}],
            "Only list links with skeletons from this skeleton source",
            'none',
            function(e) {
              self.focusSetSource = this.value;
              self.updateFilters();
            });
        this.updateSkeletonConstraintSourceSelect(sourceSelect);

        var skeletonRelSelect = CATMAID.DOM.appendSelect(
            controls,
            "skeleton-relation",
            "Relation",
            [{title: '(any)', value: 'none'}],
            "Only list links with this relation.",
            'none',
            function(e) {
              self.focusSetRelation = parseInt(this.value, 10);
              self.updateFilters();
            });
        this.updateRelationSelect(skeletonRelSelect, this.focusSetRelation);

        var partnerSelect = CATMAID.DOM.appendSelect(
            controls,
            "partner-constraint-source",
            "Partner skeletons",
            [{title: '(any)', value: 'none'}],
            "Only list links which connect to a connector which is linked to " +
                "at least one skeleton from the selected source.",
            'none',
            function(e) {
              self.partnerSetSource = this.value;
              self.partnerSetExcludedSkeletonIds.clear();
              self.updateFilters();
            });
        this.updateSkeletonConstraintSourceSelect(partnerSelect);

        var partnerRelSelect = CATMAID.DOM.appendSelect(
            controls,
            "partner-relation",
            "Partner relation",
            [{title: '(any)', value: 'none'}],
            "Only list links which connect to a connector which is linked to " +
                "a skeleton using this relation",
            'none',
            function(e) {
              self.partnerSetRelation = parseInt(this.value, 10);
              self.updateFilters();
            });
        this.updateRelationSelect(partnerRelSelect, this.partnerSetRelation);
      },
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        var container = document.createElement('div');
        content.appendChild(container);

        var table = document.createElement('table');
        table.style.width = "100%";
        content.appendChild(table);

        var relationNames = null;
        var abbrevMap = {
          'presynaptic_to': 'pre',
          'postsynaptic_to': 'post',
        };

        var self = this;
        this.connectorTable = $(table).DataTable({
          dom: "lrfphtip",
          paging: true,
          order: [],
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {


              // Locally resolve request if no skeletons are provided
            Promise.all([
                self.getData(),
                CATMAID.Relations.getNameMap(project.id)
              ])
              .then(function(results) {
                if (!relationNames) {
                  relationNames = results[1];
                }
                return self.filterResults(results[0]);
              })
              .then(function(connectorData) {
                callback({
                  draw: data.draw,
                  recordsTotal: connectorData.length,
                  recordsFiltered: connectorData.length,
                  data: connectorData,
                });

                self.updateFilters();

                // Populate result skeleton source
                var models = connectorData.reduce(function(o, link) {
                  var skid = link[4];
                  o[skid]  = new CATMAID.SkeletonModel(skid);
                  return o;
                }, {});
                self.resultSkeletonSource.clear();
                self.resultSkeletonSource.append(models);
              })
              .catch(CATMAID.handleError);
          },
          columns: [
            {data: 4, className: "cm-center", title: "Skeleton ID"},
            {data: 0, className: "cm-center", title: "Connector ID"},
            {
              data: 10,
              title: "Relation",
              className: "cm-center",
              render: function(data, type, row, meta) {
                let relationId = data;
                let relationName = relationNames[relationId];
                if (type === 'display') {
                  if (relationName === undefined) {
                    return '(unknown - id: ' + relationId + ')';
                  }
                  return abbrevMap[relationName] || relationName;
                } else if (type === 'filter') {
                  return relationId;
                }
                return relationName;
              }
            },
            {data: 1, className: "cm-center", title: "X"},
            {data: 2, className: "cm-center", title: "Y"},
            {data: 3, className: "cm-center", title: "Z"},
            {
              data: 3,
              title: "S",
              className: "cm-center",
              render: function(data, type, row, meta) {
                return project.focusedStackViewer.primaryStack.projectToStackZ(row[3], row[2], row[1]);
              },
            }, // section index
            {data: 5, className: "cm-center", title: "Link confidence"},
            {
              data: 6,
              className: "cm-center",
              title: "User",
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(data).login;
              }
            },
            {data: 7, className: "cm-center", title: "Treenode ID"},
            {
              data: 8,
              title: "Created on",
              className: "cm-center",
              render: function(data, type, row, meta) {
                var d = new Date(data);
                return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
                    + ' ' + d.getHours() + ':' + d.getMinutes();
              }
            },
            {
              data: 9,
              title: "Last modified",
              className: "cm-center",
              render: function(data, type, row, meta) {
                var d = new Date(data);
                return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()
                    + ' ' + d.getHours() + ':' + d.getMinutes();
              }
            },
          ]
        }).on('dblclick', 'tbody td', function() {
          var cell = self.connectorTable.cell( this );
          var col = cell[0][0].column;
          if (!cell || col !== 9) {
            return;
          }

          var clickedId = cell.data();
          SkeletonAnnotations.staticMoveToAndSelectNode(clickedId);

          return false;
        }).on('dblclick', 'tbody tr', function () {
          var row = self.connectorTable.row(this);
          var data = row.data();
          var connectorId = data[0];
          SkeletonAnnotations.staticMoveToAndSelectNode(connectorId);
        });
      },
      filter: {
        rules: this.filterRules,
        update: this.update.bind(this),
        type: 'node',
      }
    };
  };

  /**
   * Re-apply all current filters.
   */
  ConnectorList.prototype.updateFilters = function() {
    if (!this.connectorTable) {
      return;
    }

    let allowedSkeletonIds = [];
    if (this.focusSetSource && this.focusSetSource !== 'none') {
      let source = CATMAID.skeletonListSources.getSource(this.focusSetSource);
      if (!source) {
        throw new CATMAID.ValueError("Can't find skeleton source: " +
            this.focusSetSource);
      }
      let skeletonIds = source.getSelectedSkeletons();
      Array.prototype.push.apply(allowedSkeletonIds, skeletonIds);
    }

    let focusSetRelationId;
    if (this.focusSetRelation && this.focusSetRelation !== 'none') {
      focusSetRelationId = this.focusSetRelation;
    }


    let partnerSetSkeletonIds;
    if (this.partnerSetSource && this.partnerSetSource!== 'none') {
      let source = CATMAID.skeletonListSources.getSource(this.partnerSetSource);
      if (!source) {
        throw new CATMAID.ValueError("Can't find skeleton source: " +
            this.partnerSetSource);
      }
      let skeletonIds = source.getSelectedSkeletons();
      if (skeletonIds.length > 0) {
        partnerSetSkeletonIds = skeletonIds.map(Number);
      }
    }

    let partnerSetRelationId;
    if (this.partnerSetRelation && this.partnerSetRelation !== 'none') {
      partnerSetRelationId = this.partnerSetRelation;
    }

    let partnerSetExcludedSkeletonIds = this.partnerSetExcludedSkeletonIds;

    // Find all allowed rows. They are the ones with connectors that have links
    // to allowed partner skeletons.
    let allowedConnectorIds;
    if (partnerSetSkeletonIds || partnerSetRelationId || partnerSetExcludedSkeletonIds) {
      allowedConnectorIds = this.connectorTable.rows().data().toArray()
        .reduce(function(target, row) {
          // If a row's skeleton ID is part of the partner set, remember its
          // connector ID. If a partner relation requirement is defined,
          // remember the connector ID only on a match
          let skeletonMatch = !partnerSetSkeletonIds ||
              partnerSetSkeletonIds.indexOf(row[4]) !== -1;
          let relationMatch = !partnerSetRelationId ||
              row[10] === partnerSetRelationId;
          let skeletonNotExcluded = partnerSetExcludedSkeletonIds.size === 0 ||
              !partnerSetExcludedSkeletonIds.has(row[4]);
          if (skeletonMatch && relationMatch && skeletonNotExcluded) {
            target.push(row[0]);
          }
          return target;
        }, []);
    }


    let allowedSkeletonIdsRegEx = '.*';
    if (allowedSkeletonIds && allowedSkeletonIds.length > 0) {
      allowedSkeletonIdsRegEx = '(' + allowedSkeletonIds.join(')|(') + ')';
    }
    this.connectorTable.columns(0).search(allowedSkeletonIdsRegEx, true, false, true);

    var allowedConnectorIdsRegEx;
    if (allowedConnectorIds) {
      if (allowedConnectorIds.length) {
        allowedConnectorIdsRegEx = '(' + allowedConnectorIds.join(')|(') + ')';
      } else {
        allowedConnectorIdsRegEx = '^$';
      }
    }
    this.connectorTable.columns(1).search(allowedConnectorIdsRegEx || '.*', true, false, true);

    this.connectorTable.columns(2).search(focusSetRelationId || '');

    this.connectorTable.draw();
  };

  /**
   *
   */
  ConnectorList.prototype.updateSkeletonConstraintSources = function() {
    let sourceSelectSelector = "select#connector-list" +
        this.widgetID +"-controls_skeleton-constraint-source";
    let sourceSelect = document.querySelector(sourceSelectSelector);
    if (sourceSelect) {
      this.updateSkeletonConstraintSourceSelect(sourceSelect);
      this.selectedSkeletonConstraintSource = sourceSelect.value;
    }

    let partnerSelectSelector = "select#connector-list" +
        this.widgetID + "-controls_partner-constraint-source";
    let partnerSelect = document.querySelector(partnerSelectSelector);
    if (partnerSelect) {
      this.updateSkeletonConstraintSourceSelect(partnerSelect);
      this.selectedSkeletonConstraintSource = partnerSelect.value;
    }
  };

  ConnectorList.prototype.updateRelationSelect = function(relationSelect, selectedLinkType) {
    return CATMAID.Connectors.linkTypes(project.id)
      .then(function(json) {
        var seenLinkTypes = new Set();
        var linkTypes = json.sort(function(a, b) {
            return CATMAID.tools.compareStrings(a.name, b.name);
          })
          .map(function(lt) {
            return {
              title: lt.name,
              value: lt.relation_id
            };
          });

        let newIndexInNewSelect = -1;
        for (let i=0; i<linkTypes.length; ++i) {
          if (linkTypes[i] === selectedLinkType) {
            newIndexInNewSelect = i;
            break;
          }
        }
      var linkOptions = [{title: '(any)', value: 'none'}].concat(linkTypes);
      CATMAID.DOM.appendOptionsToSelect(relationSelect, linkOptions,
          selectedLinkType, true);
      });
  };

  /**
   * Update a particular select element with the most recent sources.
   */
  ConnectorList.prototype.updateSkeletonConstraintSourceSelect = function(sourceSelect) {
    // Find index of current value in new source list
    let availableSources = CATMAID.skeletonListSources.getSourceNames();
    let newIndexInNewSources = -1;
    for (let i=0; i<availableSources.length; ++i) {
      if (availableSources[i] === this.selectedSkeletonConstraintSource) {
        newIndexInNewSources = i;
        break;
      }
    }
    var sourceOptions = availableSources.reduce(function(o, name) {
      o.push({
        title: name,
        value: name
      });
      return o;
    }, [{title: '(any)', value: 'none'}]);

    CATMAID.DOM.appendOptionsToSelect(sourceSelect, sourceOptions,
        this.selectedSkeletonConstraintSource, true);
  };

  ConnectorList.prototype.getData = function() {
    return this.data ? Promise.resolve(this.data) : Promise.resolve([]);
  };

  /**
   * Update display based on current skeleton source content.
   */
  ConnectorList.prototype.update = function() {
    if (this.connectorTable) {
      this.connectorTable.ajax.reload();
    }
  };

  /**
   * Apply current filter set, if any, to the input data and return a promise
   * which resolves with the filtered data.
   */
  ConnectorList.prototype.filterResults = function(data) {
    var hasResults = data && data.length > 0;
    if (this.filterRules.length > 0 && this.applyFilterRules && hasResults) {
      // Collect connector models from input
      var connectors = data.reduce(function(o, link) {
        var connectorId = link[0];
        var x = link[1], y = link[2], z = link[3];
        o.set(connectorId, new CATMAID.ConnectorModel(connectorId, x, y, z));
        return o;
      }, new Map());
      var filter = new CATMAID.NodeFilter(this.filterRules, connectors);
      return filter.execute()
        .then(function(filtered) {
          if (filtered.nodes.size === 0) {
            CATMAID.warn("No connectors left after filter application");
            data= [];
            return Promise.resolve(data);
          }
          // Filter links
          let allowedNodes = new Set(Object.keys(filtered.nodes).map(function(n) {
            return parseInt(n, 10);
          }));
          data = data.filter(function(link) {
            let connectorId = link[0];
            return allowedNodes.has(connectorId);
          });
          return Promise.resolve(data);
        });
    }
    return Promise.resolve(data);
  };

  /**
   * Export the currently displayed table as CSV.
   */
  ConnectorList.prototype.exportCSV = function() {
    if (!this.connectorTable) return;
    var header = this.connectorTable.columns().header().map(function(h) {
      return $(h).text();
    });
    // Remove "S" column
    header.splice(5, 1);

    CATMAID.Relations.getNameMap(project.id)
      .then(relationNames => {
        // Use original data, but change order to match the table
        var connectorRows = this.connectorTable.rows({"order": "current", "search": 'applied'})
            .data().map(function(row) {
              let relationId = row[10];
              let relationName = relationNames[relationId];
              if (relationName === undefined) {
                relationName = relationId;
              }
              return [row[4], row[0], relationName, row[1], row[2], row[3],
                  row[5], row[6], row[7], row[8], row[9]];
            });
        var csv = header.join(',') + '\n' + connectorRows.map(function(row) {
          return row.join(',');
        }).join('\n');
        var blob = new Blob([csv], {type: 'text/plain'});
        saveAs(blob, "catmaid-connector-link-list.csv");
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Export the currently displayed connectors as CSV.
   */
  ConnectorList.prototype.exportConnectorCSV = function() {
    if (!this.connectorTable) return;

    let header = ['Connector ID', 'X', 'Y', 'Z'];

    // Use original data, but change order to match the table
    let seenConnectors = new Set();
    var connectorRows = this.connectorTable.rows({"order": "current"})
        .data().reduce(function(target, row, i) {
          if (!seenConnectors.has(row[0])) {
            target.push([row[0], row[1], row[2], row[3]]);
          }
          return target;
        }, []);

    var csv = header.join(',') + '\n' + connectorRows.map(function(row) {
      return row.join(',');
    }).join('\n');
    var blob = new Blob([csv], {type: 'text/plain'});
    saveAs(blob, "catmaid-connector-list.csv");
  };

  // Export widget
  CATMAID.ConnectorList = ConnectorList;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Connector List",
    description: "List connectors",
    key: 'connector-list',
    creator: ConnectorList,
    hidden: true,
  });

})(CATMAID);
