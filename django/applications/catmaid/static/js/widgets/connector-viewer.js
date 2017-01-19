/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  const CACHE_TIMEOUT = 5*60*1000;

  const DEFAULT_CONNECTOR_RELATION = 'presynaptic_to';

  const DEFAULT_SORT_FN_TITLE = 'Connector depth (proportion)';

  /**
   * Create a new connector viewer, optional with a set of initial skeleton
   * models.
   */
  var ConnectorViewer = function(skeletonModels)
  {
    this.widgetID = this.registerInstance();
    this.idPrefix = `connector-viewer${this.widgetID}-`;

    // This skeleton source takes care of internal skeleton management. It is
    // not registered. It is the input skeleton sink, but the output is handled
    // with a second source
    var update = this.update.bind(this);
    this.skeletonSource = new CATMAID.BasicSkeletonSource(this.getName() + " Input", {
      register: false,
      handleAddedModels: update,
      handleChangedModels: update,
      handleRemovedModels: update
    });
    // A skeleton source to collect results in
    this.resultSkeletonSource = new CATMAID.BasicSkeletonSource(this.getName());

    this.cache = new ConnectorViewerCache(this.skeletonSource);
    this.stackViewerGrid = null;  // instantiated in createContent()


    if (skeletonModels) {
      this.skeletonSource.append(skeletonModels);
    }
  };

  ConnectorViewer.prototype = {};
  $.extend(ConnectorViewer.prototype, new InstanceRegistry());

  ConnectorViewer.prototype.getName = function() {
    return "Connector Viewer " + this.widgetID;
  };

  ConnectorViewer.prototype.destroy = function() {
    this.stackViewerGrid.closeStackViewers();
    this.unregisterInstance();
  };

  ConnectorViewer.prototype.updateConnectorOrder = function(){
    var self = this;
    return this.cache
      .updateConnectorOrder(self.cache.currentConnectorRelation)
      .then(function(connectorOrder) {
          self.currentConnectorOrder = connectorOrder;
          return connectorOrder;
        });
  };

  ConnectorViewer.prototype.getWidgetConfiguration = function() {
    return {
      helpText: "Connector Viewer widget: Quickly view and compare connectors associated with given skeletons",
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var self = this;

        // CONNECTOR SELECTION CONTROLS

        // Create skeleton source drop-down without showing own result skeleton
        // source.
        var sourceSelect = CATMAID.skeletonListSources.createSelect(this.skeletonSource,
          [this.resultSkeletonSource.getName()]);
        controls.appendChild(sourceSelect);

        var add = document.createElement('input');
        add.setAttribute("type", "button");
        add.setAttribute("value", "Add");
        add.onclick = function() {
          self.skeletonSource.loadSource.bind(self.skeletonSource)();
        };
        controls.appendChild(add);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = function() {
          self.cache.clear();
          self.skeletonSource.clear();
        };
        controls.appendChild(clear);

        var refresh = document.createElement('input');
        refresh.setAttribute("type", "button");
        refresh.setAttribute("value", "Refresh");
        refresh.onclick = function() {
          self.cache.clear();
          self.stackViewerGrid.clear();
          self.stackViewerGrid.redrawPanels();
          self.update();
        };
        controls.appendChild(refresh);

        var relation = CATMAID.DOM.createSelect(
          self.idPrefix + "relation-type",
          [
            {title: 'Incoming connectors', value: "postsynaptic_to"},
            {title: 'Outgoing connectors', value: "presynaptic_to"},
            {title: 'Gap junction connectors', value: "gapjunction_with"},
            {title: 'Abutting connectors', value: "abutting"}
          ],
          this.cache.currentConnectorRelation
        );
        relation.onchange = function() {
          self.cache.currentConnectorRelation = this.value;
          self.update();
        };

        var relationLabel = document.createElement('label');
        relationLabel.appendChild(document.createTextNode('Type'));
        relationLabel.appendChild(relation);
        controls.appendChild(relationLabel);

        var sortingSelect = CATMAID.DOM.createSelect(
          self.idPrefix + "connector-sorting",
          [
            {title: 'Connector depth (proportion)', value: 'depthProportion'},
            {title: 'Connector depth (absolute)', value: 'depth'},
            {title: 'Connector ID', value: 'connId'},
            {title: 'Skeleton name', value: 'skelName'},
            {title: 'None', value: 'null'}
          ],
          DEFAULT_SORT_FN_TITLE  // might need to be value, not title
        );
        sortingSelect.onchange = function() {
          self.currentConnectorOrder = [];
          self.cache.setSortFn(this.value);
          self.update();
        };
        self.cache.setSortFn(sortingSelect.value);

        var sortingSelectLabel = document.createElement('label');
        sortingSelectLabel.appendChild(document.createTextNode('Connector sorting'));
        sortingSelectLabel.appendChild(sortingSelect);
        controls.appendChild(sortingSelectLabel);

        var openTable = document.createElement('input');
        openTable.setAttribute('type', 'button');
        openTable.setAttribute('value', 'Table');
        openTable.onclick = function() {
          var selectedModels = self.resultSkeletonSource.getSelectedSkeletonModels();
          var connTable = WindowMaker.create('connector-table', selectedModels).widget;
          document.getElementById(connTable.idPrefix + 'relation-type').value = self.cache.currentConnectorRelation;
          connTable.update();
        };
        controls.appendChild(openTable);

        controls.appendChild(document.createElement('br'));
      },
      contentID: this.idPrefix + 'content',
      createContent: function(container) {
        container.style.position = 'absolute';
      },
      init: function() {
        var self = this;
        var container = document.getElementById(self.idPrefix + 'content');
        this.stackViewerGrid = new CATMAID.StackViewerGrid(container, self.idPrefix);
        this.update();
      }
    };
  };

  var skelIDsToModels = function(skelIDs) {
    return skelIDs.reduce(function(obj, skelID) {
      obj[skelID]  = new CATMAID.SkeletonModel(skelID);
      return obj;
    }, {});
  };

  /**
   * Update result skeleton source, cache and connector order, and then panel stack viewer state.
   *
   * @returns Promise of connector order
   */
  ConnectorViewer.prototype.update = function() {
    var self = this;
    this._updateResultSkelSource();

    this.updateConnectorOrder().then(self.stackViewerGrid.setTargets.bind(self.stackViewerGrid));
  };

  ConnectorViewer.prototype._updateResultSkelSource = function() {
    this.resultSkeletonSource.clear();
    // Populate result skeleton source
    var models = skelIDsToModels(this.skeletonSource.getSelectedSkeletons());
    this.resultSkeletonSource.append(models);
  };

  // Export widget
  CATMAID.ConnectorViewer = ConnectorViewer;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: 'connector-viewer',
    creator: ConnectorViewer
  });

  /**
   * Acts as a cache and controls database access for the connector viewer.
   *
   * EDGE CASES:
   *  - Doesn't pick up if a treenode and connector lose their association during use
   *  - Doesn't pick up if a treenode's depth on a skeleton changes
   *  - Minor sort order changes due to skeleton selection changes which do not affect the connectors involved, but
   *  may impact on the sort order of the skeletons associated with the connector, may not be picked up
   *
   *  All are solved by clearing or refreshing the cache.
   *
   * @constructor
   */
  var ConnectorViewerCache = function(skeletonSource) {
    var self = this;
    this.relationTypes = {
      '0': 'presynaptic_to',
      '1': 'postsynaptic_to',
      '2': 'gapjunction_with',
      '-1': 'abutting'
    };

    /**
     *  {
     *    connID1: {
     *      'coords': {'x': _, 'y': _, 'z': _},
     *      'relationType': {
     *        'postsynaptic_to':   Set([treenodeID1, treenodeID2, ...]),
     *        'presynaptic_to':    Set([treenodeID1, treenodeID2, ...]),
     *        'gapjunction_with':  Set([treenodeID1, treenodeID2, ...]),
     *        'abutting':          Set([treenodeID1, treenodeID2, ...])
     *      },
     *      sortVal: null
     *    },
     *    connID2...
     *  }
     */
    this.connectors = {};

    /**
     *  {
     *    skelID1: {
     *      'arborTimestamp': _,
     *      'name': _,
     *      'nameTimestamp': _,
     *      'maxDepth': _
     *    },
     *    skelID2...
     *  }
     */
    this.skeletons = {};

    /**
     *  {
     *    treenodeID1: {
     *      'skelID': _,
     *      'depth': _
     *    },
     *    treenodeID2: ...
     *  }
     */
    this.treenodes = {};

    this.sortFnName = null;
    this.currentConnectorRelation = DEFAULT_CONNECTOR_RELATION;

    this.sortFns = new Map([
      ['depthProportion', this.getMinDepth.bind(this, true)],
      ['depth', this.getMinDepth.bind(this, false)],
      ['connId', function(_, connID) {return connID;}],
      ['skelName', function(relationType, connID) {return self.getSkelNames(relationType, connID).join(', ');}],
      ['null', function(){return '';}]
    ]);

    this.sorting = {
      'postsynaptic_to':   {sortFnName: '', order: new Set(), sorted: false, sortVals: {}},
      'presynaptic_to':    {sortFnName: '', order: new Set(), sorted: false, sortVals: {}},
      'gapjunction_with':  {sortFnName: '', order: new Set(), sorted: false, sortVals: {}},
      'abutting':          {sortFnName: '', order: new Set(), sorted: false, sortVals: {}}
    };

    this.skeletonSource = skeletonSource;
  };

  ConnectorViewerCache.prototype = {};

  ConnectorViewerCache.prototype.clear = function() {
    this.connectors = {};
    this.skeletons = {};
    this.sorting = {
      'postsynaptic_to':   {sortFnName: '', order: new Set(), sorted: false, sortVals: {}},
      'presynaptic_to':    {sortFnName: '', order: new Set(), sorted: false, sortVals: {}},
      'gapjunction_with':  {sortFnName: '', order: new Set(), sorted: false, sortVals: {}},
      'abutting':          {sortFnName: '', order: new Set(), sorted: false, sortVals: {}}
    };
    this.treenodes = {};
  };

  ConnectorViewerCache.prototype.refresh = function() {
    this.clear();
    return this.ensureValidCache();
  };

  /**
   * Convert a connector ID into the object consumed by the stack viewer grid using cached information.
   *
   * @param connID
   * @returns {{coords: (null|*|{x: *, y: *, z: *}|string|string|string), title: string, sortVal: *, note: (*|A|string)}}
   */
  ConnectorViewerCache.prototype.connectorIdToObj = function (connID) {
    var self = this;
    var selectedSkeletons = this.skeletonSource.getSelectedSkeletons();

    var sortVal = self.sorting[self.currentConnectorRelation].sortVals[connID];

    var sortValTxt;
    switch (self.sorting[self.currentConnectorRelation].sortFnName) {
      case 'depthProportion':
        sortValTxt = 'Depth (ppn): ' + sortVal.toFixed(3);
        break;
      case 'depth':
        sortValTxt = `Depth: ${sortVal.toFixed(0)}nm`;
        break;
      default:
        sortValTxt = '';
        break;
    }

    return {
      coords: self.connectors[connID].coords,
      title: 'connector ' + connID,
      sortVal: sortValTxt,
      note: Array.from(self.connectors[connID].relationType[self.currentConnectorRelation])
            .reduce(function(arr, treenodeID) {
              var skelID = self.treenodes[treenodeID].skelID;
              var skelName = self.skeletons[skelID].name;

              // only add distinct skeleton IDs, and only skeleton IDs which are in the selected skeletons
              if (!arr.includes(skelName) && selectedSkeletons.includes(skelID)) {
                arr.push(skelName);
              }

              return arr;
            }, []).sort().join(' | '),
    };
  };

  /**
   * Return the order of connectors associated with the current selected skeletons by the given relation type, using
   * the ConnectorViewerCache's stored sorting function.
   *
   * @param relationType
   * @returns Promise of connector order
   */
  ConnectorViewerCache.prototype.updateConnectorOrder = function(relationType) {
    var self = this;
    var order;

    return this.ensureValidCache().then(function() {
      var sortInfo = self.sorting[relationType];

      if (sortInfo.sorted && sortInfo.sortFnName === self.sortFnName) {
        order = Array.from(sortInfo.order);
      } else {
        // re-sort using the stored sort function
        sortInfo.sortFnName = self.sortFnName;

        var connIDs = Array.from(sortInfo.order);
        // make an object of connector IDs to the value on which they will be sorted
        var sortVals = connIDs.reduce(function (obj, connID) {
          obj[connID] = self.sortFns.get(sortInfo.sortFnName)(relationType, connID);
          return obj;
        }, {});

        order = connIDs.sort(function(connID1, connID2) {
          if (sortVals[connID1] < sortVals[connID2]) {return -1;}
          if (sortVals[connID1] > sortVals[connID2]) {return 1;}
          return 0;
        });

        // update the sorting cache
        sortInfo.order = new Set(order);
        sortInfo.sorted = true;
        sortInfo.sortVals = sortVals;
      }

      // turn the array of connector IDs into informative objects
      return order.map(self.connectorIdToObj.bind(self));
    });
  };

  /**
   * Ensure that all of the currently selected skeletons have recent representations in the cache.
   *
   * @returns {Promise.<*>}
   */
  ConnectorViewerCache.prototype.ensureValidCache = function() {
    var self = this;
    var promises = this.skeletonSource.getSelectedSkeletons().map(self.ensureValidCacheForSkel.bind(self));
    return Promise.all(promises);
  };

  /**
   * Ensure that a given skeleton has a recent representation in the cache.
   *
   * @param skelID
   * @returns {Promise}
   */
  ConnectorViewerCache.prototype.ensureValidCacheForSkel = function(skelID) {
    var self = this;
    var now = Date.now();

    if (skelID in this.skeletons && now - this.skeletons[skelID].arborTimestamp < CACHE_TIMEOUT) {
      return Promise.resolve();  // cache is recent for this skeleton
    }

    // cache is not recent for this skeleton: fetch it from the database
    return CATMAID.fetch(`${project.id}/skeletons/${skelID}/compact-detail`, 'GET', {with_connectors: true})
      .then(function(json) {
        var arborParser = new CATMAID.ArborParser();

        // this object will calculate treenode depth
        var arbor = arborParser.init('compact-skeleton', json).arbor;

        if (!(skelID in self.skeletons)) {
          // name uses a different API endpoint so needs a different timestamp
          self.skeletons[skelID] = {name: null, nameTimestamp: -CACHE_TIMEOUT};
        }
        self.skeletons[skelID].arborTimestamp = now;

        // get the maximum depth of the tree, as a sum of node-to-node euclidean distances, from the root
        var root = arbor.findRoot();
        var distancesObj = arbor.nodesDistanceTo(root, self.euclideanDistance.bind(self, arborParser.positions));
        self.skeletons[skelID].maxLength = distancesObj.max;

        // get all the connectors associated with the given skeleton by any relation type
        var connectorsResponse = json[1];
        for (var i = 0; i < connectorsResponse.length; i++) {
          // turn the array response into more readable objects
          var connectorResponse = connectorsResponse[i];
          var treenodeID = connectorResponse[0];
          var connID = connectorResponse[1];
          var relationType = self.relationTypes[connectorResponse[2]];
          var coords = {
            x: connectorResponse[3],
            y: connectorResponse[4],
            z: connectorResponse[5]
          };

          // insert information from this skeleton into the connectors cache
          if (!(connID in self.connectors)) {
            self.connectors[connID] = {
              coords: null,
              relationType: {
                postsynaptic_to: new Set(),
                presynaptic_to: new Set(),
                gapjunction_with: new Set(),
                abutting: new Set()
              }
            };
          }
          self.connectors[connID].coords = coords;
          self.connectors[connID].relationType[relationType].add(treenodeID);

          // insert information from this skeleton into the sorting cache if it's not there, and flag it for re-sorting
          if (!self.sorting[relationType].order.has(connID)) {
            self.sorting[relationType].order.add(connID);
            self.sorting[relationType].sorted = false;
            self.sorting[relationType].sortVals[connID] = undefined;
          }

          // insert information from this skeleton into the treenodes cache (only treenodes associated with connectors)
          self.treenodes[treenodeID] = {
            skelID: skelID,
            depth: distancesObj.distances[treenodeID]
          };
        }
      })
      .then(self.ensureValidCacheForSkelName.bind(self, skelID));  // ensure name is up-to-date
  };

  /**
   * Ensure that the given skeleton's name has a recent representation in the cache.
   *
   * @param skelID
   * @returns {*}
   */
  ConnectorViewerCache.prototype.ensureValidCacheForSkelName = function(skelID) {
    var self = this;
    var now = Date.now();

    if ( this.skeletons[skelID].name && now - this.skeletons[skelID].nameTimestamp < CACHE_TIMEOUT ) {
      // name is recent
      return Promise.resolve();
    } else {
      // get name from database and add it to the skeletons cache
      return CATMAID.fetch(project.id + '/skeleton/' + skelID + '/neuronname', 'GET').then(function(json) {
        self.skeletons[skelID].name = json.neuronname;
        self.skeletons[skelID].nameTimestamp = now;
      });
    }
  };

  /**
   * This is bound to the positions property of an initialised Arbor instance.
   *
   * @param positions - object of treenode ID : THREE.Vector instances of x y z position, as found in the
   * 'positions' property of an initialised Arbor instance.
   * @param child - a treenode ID
   * @param parent - a treenode ID
   * @returns {*|number}
   */
  ConnectorViewerCache.prototype.euclideanDistance = function(positions, child, parent) {
    return positions[child].distanceTo(positions[parent]);
  };

  /**
   *
   * @param sortFnName A string which is the property name, in the sortFns object, of a comparator function. The
   * function will be bound to the ConnectorViewerCache, and should have the signature
   * function(connector1ID, connector2ID, relationType, selectedSkeletons)
   */
  ConnectorViewerCache.prototype.setSortFn = function (sortFnName) {
    this.sortFnName = sortFnName; // todo: may need to bind to this
  };

  /**
   * Get the depth of a given connector on its associated selected skeleton by the given relationType, in absolute
   * terms or as a proportion of the skeleton's maximum depth.
   *
   * As connectors of some relation type can be associated with multiple skeletons, this only counts those which are
   * in the given selection, and if there are multiple such skeletons, returns the smallest depth.
   *
   * @param relationType
   * @param proportional
   * @param connID
   * @returns {Number}
   */
  ConnectorViewerCache.prototype.getMinDepth = function(proportional, relationType, connID) {
    var minConnDepth = Infinity;
    var selectedSkeletons = this.skeletonSource.getSelectedSkeletons();

    for (var treenodeID of this.connectors[connID].relationType[relationType]) {
      if (selectedSkeletons.includes(this.treenodes[treenodeID].skelID)) {
        var treenodeInfo = this.treenodes[treenodeID];
        var depth = proportional ? treenodeInfo.depth / this.skeletons[treenodeInfo.skelID].maxLength : treenodeInfo.depth;
        minConnDepth = Math.min(minConnDepth, depth);
      }
    }

    return minConnDepth;
  };

  /**
   * Get the array of skeleton names associated with a connector by the given relation type.
   *
   * As connectors of some relation type can be associated with multiple skeletons, this only counts those which are
   * in the given selection, and if there are multiple such skeletons, returns them in alphanumeric sort order.
   *
   * @param relationType
   * @param connID
   * @returns {Array}
   */
  ConnectorViewerCache.prototype.getSkelNames = function(relationType, connID) {
    var skelNames = [];
    var selectedSkeletons = this.skeletonSource.getSelectedSkeletons();

    for (var treenodeID of this.connectors[connID].relationType[relationType]) {
      if (selectedSkeletons.includes(this.treenodes[treenodeID].skelID)) {
        skelNames.push(this.skeletons[this.treenodes[treenodeID].skelID].name);
      }
    }

    return skelNames.sort();
  };

})(CATMAID);
