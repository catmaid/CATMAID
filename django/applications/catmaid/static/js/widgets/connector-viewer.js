/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  const CACHE_TIMEOUT = 5*60*1000;

  const DEFAULT_CONNECTOR_TYPE = 'synaptic';

  const DEFAULT_SORT_FN_TITLE = 'Pre-connector node depth (proportion)';

  /**
   * Create a new Connector Viewer. Internal skeleton sources can be populated with objects mapping skeleton IDs to
   * SkeletonModel objects, which are themselves properties of initParams.
   *
   * initParams.connectionType should be either 'synaptic', 'gapjunction', 'other', or '' (all).
   *
   * @constructor
   */
  var ConnectorViewer = function()
  {
    this.widgetID = this.registerInstance();
    this.idPrefix = `connector-viewer${this.widgetID}-`;
    this.MIN_WEBGL_CONTEXTS = 1;

    // This skeleton source takes care of internal skeleton management. It is
    // not registered. It is the input skeleton sink, but the output is handled
    // with a second source
    var update = this.update.bind(this);
    this.skelSources = [
      new CATMAID.BasicSkeletonSource(this.getName() + " Input 1", {
        register: false,
        handleAddedModels: update,
        handleChangedModels: update,
        handleRemovedModels: update
      }),
      new CATMAID.BasicSkeletonSource(this.getName() + " Input 2", {
        register: false,
        handleAddedModels: update,
        handleChangedModels: update,
        handleRemovedModels: update
      })
      ];


    // A skeleton source to collect results in
    this.resultSkeletonSource = new CATMAID.BasicSkeletonSource(this.getName(), {
      owner: this
    });

    this.cache = new ConnectorViewerCache(this.skelSources);
    this.stackViewerGrid = null;  // instantiated in init()

    this.syncSources = false;

    this.currentConnectorOrder = [];
  };

  ConnectorViewer.prototype = {};
  $.extend(ConnectorViewer.prototype, new InstanceRegistry());

  ConnectorViewer.prototype.getName = function() {
    return "Connector Viewer " + this.widgetID;
  };

  ConnectorViewer.prototype.destroy = function() {
    this.stackViewerGrid.closeStackViewers();
    for (let i=0; i<this.skelSources.length; ++i) {
      this.skelSources[i].destroy();
    }
    this.resultSkeletonSource.destroy();
    this.unregisterInstance();
  };

  ConnectorViewer.prototype.updateConnectorOrder = function(){
    var self = this;
    return this.cache
      .updateConnectorOrder()
      .then(function(connectorOrder) {
          self.currentConnectorOrder = connectorOrder;
          return connectorOrder;
        });
  };

  /**
   * Make an element with a label, skeleton selection drop-down, Add and Clear button.
   *
   * @param skelSource
   * @param label
   * @param id
   * @returns {Element}
   */
  ConnectorViewer.prototype.makeSourceControls = function(skelSource, label, id) {
    var self = this;
    var sourceControls = document.createElement('label');
    if (id) {
      sourceControls.id = id;
    }
    sourceControls.classList.add('source-controls', 'extended-source-controls');

    sourceControls.appendChild(document.createTextNode(label));

    sourceControls.title = '0 skeletons selected';

    var sourceSelect = CATMAID.skeletonListSources.createSelect(skelSource, [self.resultSkeletonSource.getName()]);
    sourceControls.appendChild(sourceSelect);

    var add = document.createElement('input');
    add.type = "button";
    add.value = "Add";
    add.onclick = function() {
      // if syncSources is true, add to both skeleton sources
      for (var thisSkelSource of self.syncSources ? self.skelSources : [skelSource]) {
        thisSkelSource.loadSource.bind(thisSkelSource)();
      }
    };
    sourceControls.appendChild(add);

    var clear = document.createElement('input');
    clear.type = "button";
    clear.value = "Clear";
    clear.onclick = function() {
      self.cache.clear();
      sourceControls.title = '0 skeletons selected';

      // if syncSources is true, clear both skeleton sources
      for (var thisSkelSource of self.syncSources ? self.skelSources : [skelSource]) {
        thisSkelSource.clear();
      }
    };
    sourceControls.appendChild(clear);

    return sourceControls;
  };

  var tabs = {};
  var contentContainer = null;

  ConnectorViewer.prototype.getWidgetConfiguration = function() {
    var self = this;
    return {
      helpText: "Connector Viewer widget: Quickly view and compare connectors associated with given skeletons",
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var innerControls = document.createElement('div');
        controls.appendChild(innerControls);
        tabs = CATMAID.DOM.addTabGroup(
          innerControls, 'connector-viewer' + self.widgetID,
          ['Main', 'Connectors', 'Stack viewers']
        );

        // CONNECTOR SELECTION CONTROLS

        tabs['Main'].appendChild(self.makeSourceControls(
          self.skelSources[0], 'Pre- skeletons: ', self.idPrefix + 'source0-controls'
        ));
        tabs['Main'].appendChild(self.makeSourceControls(
          self.skelSources[1], 'Post- skeletons: ', self.idPrefix + 'source1-controls'
        ));

        var br = document.createElement('br');
        br.classList.add('extended-source-controls');
        tabs['Main'].appendChild(br);

        var syncSkelSourcesCb = document.createElement('input');
        syncSkelSourcesCb.type = 'checkbox';
        syncSkelSourcesCb.onchange = function() {
          self.syncSources = this.checked;

          if (self.syncSources) {
            var models0 = self.skelSources[0].getSkeletonModels();
            var models1 = self.skelSources[1].getSkeletonModels();
            self.skelSources[0].append(models1);
            self.skelSources[1].append(models0);
          }

          $(`#${self.idPrefix}source1-controls`).children().prop('disabled', self.syncSources);
          document.getElementById(self.idPrefix + 'reverse').disabled = self.syncSources;
        };

        var syncSkelSourcesLabel = document.createElement('label');
        syncSkelSourcesLabel.classList.add('extended-source-controls');
        syncSkelSourcesLabel.title = 'Set each skeleton source to the union of both sources and keep in sync';
        syncSkelSourcesLabel.appendChild(document.createTextNode('Sync skeletons: '));
        syncSkelSourcesLabel.appendChild(syncSkelSourcesCb);

        tabs['Main'].appendChild(syncSkelSourcesLabel);

        var reverseSkelSources = document.createElement('input');
        reverseSkelSources.type = 'button';
        reverseSkelSources.id = self.idPrefix + 'reverse';
        reverseSkelSources.classList.add('extended-source-controls');
        reverseSkelSources.value = 'Reverse';
        reverseSkelSources.title = 'Switch skeleton source contents';
        reverseSkelSources.onclick = function() {
          self.skelSources.reverse();
          self.update();
        };

        tabs['Main'].appendChild(reverseSkelSources);

        var refresh = document.createElement('input');
        refresh.type = "button";
        refresh.value = "Refresh";
        refresh.title = 'Refresh cache and re-initialise stack viewers (may take a few seconds)';
        refresh.onclick = function() {
          self.cache.clear();
          self.stackViewerGrid.clear();
          self.stackViewerGrid.redrawPanels();
          self.update();
        };
        tabs['Main'].appendChild(refresh);

        var connectorType = CATMAID.DOM.createSelect(
          self.idPrefix + "connector-type",
          [
            {title: 'Synapse', value: "synaptic"},
            {title: 'Gap Junction', value: "gapjunction"},
            {title: 'Other', value: "other"},
            {title: 'All', value: ''}
          ],
          self.cache.currentConnectorType
        );
        connectorType.onchange = function() {
          self.cache.currentConnectorType = this.value;
          self.update();
        };

        var relationLabel = document.createElement('label');
        relationLabel.appendChild(document.createTextNode('Type'));
        relationLabel.appendChild(connectorType);
        tabs['Connectors'].appendChild(relationLabel);

        var sortingSelect = CATMAID.DOM.createSelect(
          self.idPrefix + "connector-sorting",
          [
            {title: 'Pre-connector node depth (proportion)', value: 'depthPpnPre'},
            {title: 'Post-connector node depth (proportion)', value: 'depthPpnPost'},
            {title: 'Pre-connector node depth (absolute)', value: 'depthPre'},
            {title: 'Post-connector node depth (absolute)', value: 'depthPost'},
            {title: 'Connector ID', value: 'connId'},
            {title: 'Pre-connector skeleton name(s)', value: 'skelNamePre'},
            {title: 'Post-connector skeleton name(s)', value: 'skelNamePost'},
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
        tabs['Connectors'].appendChild(sortingSelectLabel);

        var openTable = document.createElement('input');
        openTable.type = 'button';
        openTable.id = self.idPrefix + 'open-table';
        openTable.value = 'Open Table';
        openTable.onclick = function() {
          var selectedModels;
          var relation;
          if (self.cache.currentConnectorType === 'synaptic') {
            // button disabled if >1 skeleton source is populated
            var selectedIdx = self.skelSources[0].getNumberOfSkeletons() ? 0 : 1;
            selectedModels = self.skelSources[selectedIdx].getSelectedSkeletonModels();
            relation = ['presynaptic_to', 'postsynaptic_to'][selectedIdx];
          } else {
            selectedModels = self.resultSkeletonSource.getSelectedSkeletonModels();
            relation = {  // button disabled if 'All'
              gapjunction: 'gapjunction_with',
              other: 'abutting'
            }[self.cache.currentConnectorType];
          }

          var connTable = WindowMaker.create('connector-table', selectedModels).widget;
          document.getElementById(connTable.idPrefix + 'relation-type').value = relation;
        };

        tabs['Connectors'].appendChild(openTable);

        var $innerControls = $(innerControls);
        $innerControls.tabs();
        $innerControls.on('tabsactivate', function() {
          self.stackViewerGrid.getGridWindow().redraw();
        });
      },
      contentID: this.idPrefix + 'content',
      createContent: function(container) {
        contentContainer = container;
        // container.style.position = 'absolute';
      },
      init: function() {
        var window = CATMAID.rootWindow.getWindows().find(function(cmwWindow) {
          return cmwWindow.title === self.getName();
        });
        CATMAID.DOM.addCaptionButton(
          window, 'fa fa-link', 'Show and hide skeleton source controls', function() {
            $('.extended-source-controls').toggle();
          }
        );
        this.stackViewerGrid = new CATMAID.StackViewerGrid(
          self.idPrefix, contentContainer, tabs['Stack viewers'], tabs['Main']
        );
        this.update();
      }
    };
  };

  var disableSortOptionsIfValueEndsWith = function (select, suffix, defaultOption) {
    defaultOption = defaultOption || 'null';

    var enableAll = !suffix;

    var options = select.getElementsByTagName('option');
    var shouldDisable;

    for (var option of options) {
      shouldDisable = !enableAll && option.value.endsWith(suffix);
      if (shouldDisable && option.selected) {
        // set to last option if current selection should be disabled
        select.value = defaultOption;
      }
      option.disabled = shouldDisable;
    }

    return select.value;
  };

  /**
   * Disable sort functions which are not possible with the current skeleton selection and enable those which are
   */
  ConnectorViewer.prototype.disableSortOptions = function() {
    var select = document.getElementById(this.idPrefix + "connector-sorting");

    if (this.skelSources[0].getNumberOfSkeletons() === 0) {
      return disableSortOptionsIfValueEndsWith(select, 'Pre');
    } else if (this.skelSources[1].getNumberOfSkeletons() === 0) {
      return disableSortOptionsIfValueEndsWith(select, 'Post');
    } else {
      return disableSortOptionsIfValueEndsWith(select);
    }
  };

  /**
   * Update result skeleton source, cache and connector order, and then panel stack viewer state.
   *
   * @returns Promise of connector order
   */
  ConnectorViewer.prototype.update = function() {
    var self = this;
    this._updateResultSkelSource();

    this.cache.sortFnName = this.disableSortOptions();
    this.cache.sorting.sorted = false;

    var sourceControls = document.getElementById(self.idPrefix + 'controls').getElementsByClassName('source-controls');

    var skelCounts = [];
    this.skelSources.forEach(function(skelSource, idx) {
      var skelCount = skelSource.getNumberOfSkeletons();
      skelCounts.push(skelCount);
      sourceControls[idx].title = `${skelCount} skeleton${skelCount === 1 ? '' : 's'} selected`;
    });

    var openTable = document.getElementById(self.idPrefix + 'open-table');
    if (skelCounts[0] && skelCounts [1]) {
        openTable.disabled = true;
        openTable.title = "Cannot open a Connector Table with both pre- and post- constraints";
    } else if (this.cache.currentConnectorType === '') {
      openTable.disabled = true;
      openTable.title = "Cannot open a Connector Table of connector type 'All'";
    } else {
      openTable.disabled = false;
      openTable.title = 'Open Connector Table';
    }

    this.updateConnectorOrder().then(self.stackViewerGrid.setTargets.bind(self.stackViewerGrid));
  };

  ConnectorViewer.prototype._updateResultSkelSource = function() {
    this.resultSkeletonSource.clear();
    // Populate result skeleton source
    this.resultSkeletonSource.append(this.skelSources[0].getSkeletonModels());
    this.resultSkeletonSource.append(this.skelSources[1].getSkeletonModels());
  };

  // Export widget
  CATMAID.ConnectorViewer = ConnectorViewer;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Connector Viewer",
    description: "View and edit connectors linked to a set of neurons",
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
  var ConnectorViewerCache = function(skeletonSources) {
    var self = this;
    this.relationTypes = {
      '0': 'presynaptic_to',
      '1': 'postsynaptic_to',
      '2': 'gapjunction_with',
      '-1': 'other'
    };
    this.connectorTypes = {
      '0': 'synaptic',
      '1': 'synaptic',
      '2': 'gapjunction',
      '-1': 'other'
    };

    /**
     *  {
     *    connID1: {
     *      'coords': {'x': _, 'y': _, 'z': _},
     *      'connectorType': 'synaptic' || 'gapjunction' || 'other',
     *      'treenodes': {
     *        // null if non-synapse
     *        'postsynaptic_to':    Set([treenodeID1, treenodeID2, ...]),
     *        // null if non-synapse
     *        'presynaptic_to':     Set([treenodeID1, treenodeID2, ...]),
     *        // null if synapse
     *        'all':                Set([treenodeID1, treenodeID2, ...]),
     *      }
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
    this.currentConnectorType = DEFAULT_CONNECTOR_TYPE;

    /**
     * Map where the values are functions which take one argument (connector ID) and return a value to be sorted on.
     *
     * @type {Map}
     */
    this.sortFns = new Map([
      ['depthPpnPre', this.getMinDepth.bind(this, true, 0)],
      ['depthPpnPost', this.getMinDepth.bind(this, true, 1)],
      ['depthPre', this.getMinDepth.bind(this, false, 0)],
      ['depthPost', this.getMinDepth.bind(this, false, 1)],
      ['connId', function(connID) {return connID;}],
      ['skelNamePre', function(connID) {return self.getSkelNames(0, connID).join(', ');}],
      ['skelNamePost', function(connID) {return self.getSkelNames(1, connID).join(', ');}],
      ['null', function(){return '';}]
    ]);

    this.sorting = {
      order: new Set(),
      sortVals: {},
      sorted: false,
      sortFnName: ''
    };

    this.skelSources = skeletonSources;
  };

  ConnectorViewerCache.prototype = {};

  ConnectorViewerCache.prototype.clear = function() {
    this.connectors = {};
    this.skeletons = {};
    this.sorting = {
      order: new Set(),
      sortVals: {},
      sorted: false,
      sortFnName: ''
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

    var sortVal = self.sorting.sortVals[connID];

    var sortValTxt = '';

    if (self.sorting.sortFnName.startsWith('depthPpn')) {
      sortValTxt = 'Depth (ppn): ' + sortVal.toFixed(3);
    } else if (self.sorting.sortFnName.startsWith('depth')) {
      sortValTxt = `Depth: ${sortVal.toFixed(0)}nm`;
    }

    return {
      coords: self.connectors[connID].coords,
      title: 'connector ' + connID,
      sortVal: sortValTxt,
      note: 'Connector type: ' + self.currentConnectorType
    };
  };

  ConnectorViewerCache.prototype.treenodeSetToSkelList = function(treenodes) {
    var skels = [];
    if (treenodes) {
      for (var treenodeID of treenodes) {
        skels.push(this.treenodes[treenodeID].skelID);
      }
    }

    return skels;
  };

  /**
   * Return a list of connector IDs relevant to the given selection of constraint skeletons.
   *
   * If both constraint skeleton sources are empty, return [].
   *
   * If either one of the constraint skeleton sources is empty, treat it as unconstrained on that side.
   *
   * If the connector is asymmetric (i.e. a chemical synapse), it must have at least one pre- skeleton in the first
   * skeleton source (if populated), and at least one post- skeleton in the second skeleton source (if populated).
   *
   * If the connector is symmetric, it must interact with at least one treenode attached to a skeleton in the first
   * skeleton source (if populated), and at least one OTHER treenode attached to a skeleton in the second skeleton
   * source (if populated).
   *
   * @returns {*}
   */
  ConnectorViewerCache.prototype.getRelevantConnectors = function() {
    var self = this;
    var constraintSkelSets = self.skelSources.map(function(skelSource) {return new Set(skelSource.getSelectedSkeletons());});

    // no skeletons are selected
    if (constraintSkelSets[0].union(constraintSkelSets[1]).size === 0) {
      return [];
    }

    return Object.keys(this.connectors).filter(function(connID) {
      var connDetails = self.connectors[connID];
      if (!connDetails.connectorType.includes(self.currentConnectorType)) {
        return false;
      }

      if (connDetails.connectorType === 'synaptic') {
        var preSkelIDs = self.treenodeSetToSkelList(connDetails.treenodes.presynaptic_to);
        var postSkelIDs = self.treenodeSetToSkelList(connDetails.treenodes.postsynaptic_to);

        // (there are no 'pre' constraints OR >1 of the 'pre' constraints are in the connector's 'pre' set) AND
        // (there are no 'post' constraints OR >1 of the 'post' constraints are in the connector's 'post' set)
        return (!constraintSkelSets[0].size || constraintSkelSets[0].intersection(preSkelIDs).size) &&
          (!constraintSkelSets[1].size || constraintSkelSets[1].intersection(postSkelIDs).size);

      } else {
        var connectorSkelList = self.treenodeSetToSkelList(connDetails.treenodes.all);

        if (constraintSkelSets[0].size && constraintSkelSets[1].size) {
          // connectors must have >=1 edge to a treenode associated with the first skeleton selection, and >=1
          // edge to a DIFFERENT treenode associated with the second skeleton selection

          // make sure that there is a connection with the first skeleton selection
          if (constraintSkelSets[0].intersection(connectorSkelList).size === 0) {
            return false;
          }

          // remove up to one instance of each skeleton in the first constraint set from the connector's skeleton list
          for (var constraintSkel of constraintSkelSets[0]) {
            var idx = connectorSkelList.indexOf(constraintSkel);
            if (idx !== -1) {
              connectorSkelList.splice(idx, 1);
            }
          }

          // check that there is still at least one skeleton left in the connector's skeleton list which is in the
          // second constraint set
          return constraintSkelSets[1].intersection(connectorSkelList).size >= 1;

        } else if (constraintSkelSets[0].size) {
          return constraintSkelSets[0].intersection(connectorSkelList).size >= 1;
        } else if (constraintSkelSets[1].size) {
          return constraintSkelSets[1].intersection(connectorSkelList).size >= 1;
        }
      }
    });
  };

  /**
   * Return the order of connectors associated with the current selected skeletons by the given relation type, using
   * the ConnectorViewerCache's stored sorting function.
   *
   * @returns Promise of connector order
   */
  ConnectorViewerCache.prototype.updateConnectorOrder = function() {
    var self = this;
    var order;

    return this.ensureValidCache().then(function() {
      if (self.sorting.sorted) {
        order = Array.from(self.sorting.order);
      } else {
        // re-sort using the stored sort function
        self.sorting.sortFnName = self.sortFnName;

        var connIDs = Array.from(self.getRelevantConnectors());
        // make an object of connector IDs to the value on which they will be sorted
        var sortVals = connIDs.reduce(function (obj, connID) {
          obj[connID] = self.sortFns.get(self.sorting.sortFnName)(connID);
          return obj;
        }, {});

        order = connIDs.sort(function(connID1, connID2) {
          if (sortVals[connID1] < sortVals[connID2]) {return -1;}
          if (sortVals[connID1] > sortVals[connID2]) {return 1;}
          return 0;
        });

        // update the sorting cache
        self.sorting.order = new Set(order);
        self.sorting.sortVals = sortVals;
        self.sorting.sorted = true;
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
    var allSelectedSkels = this.skelSources[0].getSelectedSkeletons().concat(this.skelSources[1].getSelectedSkeletons());
    var promises = allSelectedSkels.map(self.ensureValidCacheForSkel.bind(self));

    // cache the upstream or downstream skeletons if one direction is unconstrained
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
          var connectorType = self.connectorTypes[connectorResponse[2]];
          var coords = {
            x: connectorResponse[3],
            y: connectorResponse[4],
            z: connectorResponse[5]
          };

          // insert information from this skeleton into the connectors cache
          if (!(connID in self.connectors)) {
            self.connectors[connID] = {
              coords: null,
              connectorType: connectorType,
              treenodes: {
                postsynaptic_to: new Set(),
                presynaptic_to: new Set(),
                all: new Set()
              }
            };
          }

          self.connectors[connID].coords = coords;
          if (connectorType === 'synaptic') {
            self.connectors[connID].treenodes[relationType].add(treenodeID);
          } else {
            self.connectors[connID].treenodes.all.add(treenodeID);
          }

          // insert information from this skeleton into the sorting cache if it's not there, and flag it for re-sorting
          if (!self.sorting.order.has(connID)) {
            self.sorting.order.add(connID);
            self.sorting.sorted = false;
            self.sorting.sortVals[connID] = null;
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
    this.sortFnName = sortFnName;
    this.sorting.sorted = false;
  };

  /**
   * Get the depth of a given connector on its associated selected skeleton by the given relationType, in absolute
   * terms or as a proportion of the skeleton's maximum depth.
   *
   * As connectors of some relation type can be associated with multiple skeletons, this only counts those which are
   * in the given selection, and if there are multiple such skeletons, returns the smallest depth.
   *
   * @param proportional
   * @param sourceIdx
   * @param connID
   * @returns {Number}
   */
  ConnectorViewerCache.prototype.getMinDepth = function(proportional, sourceIdx, connID) {
    var selectedSkeletons = this.skelSources[sourceIdx].getSelectedSkeletons();

    var skelSetKey = 'all';
    if (this.currentConnectorType === 'synaptic') {
      skelSetKey = ['presynaptic_to', 'postsynaptic_to'][sourceIdx];
    }

    var connDepths = [];
    for (var treenodeID of this.connectors[connID].treenodes[skelSetKey]) {
      if (selectedSkeletons.includes(this.treenodes[treenodeID].skelID)) {
        var treenodeInfo = this.treenodes[treenodeID];
        var depth = proportional ? treenodeInfo.depth / this.skeletons[treenodeInfo.skelID].maxLength : treenodeInfo.depth;
        connDepths.push(depth);
      }
    }

    return Math.min(...connDepths);
  };

  /**
   * Get the array of skeleton names associated with a connector by the given relation type.
   *
   * As connectors of some relation type can be associated with multiple skeletons, this only counts those which are
   * in the given selection, and if there are multiple such skeletons, returns them in alphanumeric sort order.
   *
   * @param sourceIdx
   * @param connID
   * @returns {Array}
   */
  ConnectorViewerCache.prototype.getSkelNames = function(sourceIdx, connID) {
    var skelNames = [];
    var selectedSkeletons = this.skelSources[sourceIdx].getSelectedSkeletons();

    var skelSetKey = 'all';
    if (this.currentConnectorType === 'synaptic') {
      skelSetKey = ['presynaptic_to', 'postsynaptic_to'][sourceIdx];
    }

    for (var treenodeID of this.connectors[connID].treenodes[skelSetKey]) {
      if (selectedSkeletons.includes(this.treenodes[treenodeID].skelID)) {
        skelNames.push(this.skeletons[this.treenodes[treenodeID].skelID].name);
      }
    }

    return skelNames.sort(function(a, b) {return a.localeCompare(b);});
  };

})(CATMAID);
