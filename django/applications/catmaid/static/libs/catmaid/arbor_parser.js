/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
*/

(function(CATMAID) {

  /** Parse JSON data from compact-skeleton and compact-arbor into an object
   * that contains an Arbor instance and a number of measurements related
   * to synapses and synaptic partners. */
  var ArborParser = function() {
      this.arbor = null;
      this.inputs = null;
      this.outputs = null;
      this.n_inputs = null;
      // Number of post targets of pre connectors
      this.n_outputs = null;
      // Number of pre connectors
      this.n_presynaptic_sites = null;
      this.input_partners = null;
      this.output_partners = null;
  };

  ArborParser.prototype = {};

  ArborParser.prototype.init = function(url, json) {
      this.tree(json[0]);
      switch (url) {
          case 'compact-skeleton':
              this.connectors(json[1]);
              break;
          case 'compact-arbor':
              this.synapses(json[1]);
              break;
      }
      return this;
  };

  ArborParser.prototype.tree = function(rows) {
    var arbor = new Arbor(),
        positions = {};
    for (var i=0; i<rows.length; ++i) {
      var row = rows[i],
          node = row[0],
          paren = row[1];
      if (paren) arbor.edges[node] = paren;
      else arbor.root = node;
      positions[node] = new THREE.Vector3(row[3], row[4], row[5]);
    }

    this.arbor = arbor;
    this.positions = positions;
    return this;
  };

  /** Same as this.tree but without parsing the positions. */
  ArborParser.prototype.makeArbor = function(rows) {
    var arbor = new Arbor();
    for (var i=0; i<rows.length; ++i) {
      var row = rows[i],
          node = row[0],
          paren = row[1];
      if (paren) arbor.edges[node] = paren;
      else arbor.root = node;
    }
    this.arbor = arbor;
    return this;
  };

  /** Parse connectors from compact-skeleton.
   */
  ArborParser.prototype.connectors = function(rows) {
    var io = [{count: 0},
              {count: 0}];
    for (var i=0; i<rows.length; ++i) {
      var row = rows[i];
      // Skip non-synaptic connectors
      if (row[2] !== 0 && row[2] !== 1) continue;
      var t = io[row[2]], // 2: type: 0 for pre, 1 for post
          node = row[0], // 0: ID
          count = t[node];
      if (count) t[node] = count + 1;
      else t[node] = 1;
      t.count += 1;
    }
    this.n_presynaptic_sites = io[0].count;
    this.n_inputs = io[1].count;
    delete io[0].count;
    delete io[1].count;
    this.outputs = io[0];
    this.inputs = io[1];
    return this;
  };

  /** Parse connectors from compact-arbor.
   */
  ArborParser.prototype.synapses = function(rows, testIfInArbor) {
    var io = [{partners: {},
               count: 0,
               connectors: {}},
              {partners: {},
               count: 0,
               connectors: {}}];
    for (var i=0; i<rows.length; ++i) {
      var row = rows[i],
          t = io[row[6]], // 6: 0 for pre, 1 for post
          node = row[0], // 0: treenode ID
          count = t[node];

      // Optionally, count synapses only on particular nodes
      if (testIfInArbor && !this.arbor.contains(node)) {
        continue;
      }

      if (count) t[node] = count + 1;
      else t[node] = 1;
      t.count += 1;
      t.partners[row[5]] = true;
      t.connectors[row[2]] = true; // 2: connector ID
    }
    this.n_outputs = io[0].count;
    this.n_inputs = io[1].count;
    this.output_partners = io[0].partners;
    this.input_partners = io[1].partners;
    this.n_output_connectors = Object.keys(io[0].connectors).length;
    this.n_input_connectors = Object.keys(io[1].connectors).length;
    ['count', 'partners', 'connectors'].forEach(function(key) {
        delete io[0][key];
        delete io[1][key];
    });
    this.outputs = io[0];
    this.inputs = io[1];
    return this;
  };

  /** Depends on having called this.synapses before to populate the maps. */
  ArborParser.prototype.createSynapseMap = function() {
    var outputs = this.outputs;
    return Object.keys(this.outputs).reduce(function(m, node) {
      var no = outputs[node],
          ni = m[node];
      if (ni) m[node] = ni + no;
        else m[node] = no;
        return m;
    }, $.extend({}, this.inputs));
  };

  /** Replace in this.arbor the functions defined in the fnNames array by a function
   * that returns a cached version of their corresponding return values.
   * Order matters: later functions in the fnNames array will already be using
   * cached versions of earlier ones.
   * Functions will be invoked without arguments. */
  ArborParser.prototype.cache = function(fnNames) {
      if (!this.arbor.__cache__) this.arbor.__cache__ = {};
      fnNames.forEach(function(fnName) {
          this.__cache__[fnName] = Arbor.prototype[fnName].bind(this)();
          this[fnName] = new Function("return this.__cache__." + fnName);
      }, this.arbor);
  };

  /** Will find terminal branches whose end node is tagged with "not a branch"
   * and remove them from the arbor, transferring any synapses to the branch node.
   * tags: a map of tag name vs array of nodes with that tag, as retrieved by compact-arbor or compact-skeleton.
   * Assumes that this.arbor, this.inputs and this.outputs exist. */
  ArborParser.prototype.collapseArtifactualBranches = function(tags) {
      var notabranch = tags['not a branch'];
      if (undefined === notabranch) return;
      var be = this.arbor.findBranchAndEndNodes(),
          ends = be.ends,
          branches = be.branches,
          edges = this.arbor.edges,
          tagged = {};
      for (var i=0; i<notabranch.length; ++i) {
          tagged[notabranch[i]] = true;
      }
      for (var i=0; i<ends.length; ++i) {
          var node = ends[i];
          if (tagged[node]) {
              var n_inputs = 0,
                  n_outputs = 0;
              while (node && !branches[node]) {
                  var nI = this.inputs[node],
                      nO = this.outputs[node];
                  if (nI) {
                      n_inputs += nI;
                      delete this.inputs[node];
                  }
                  if (nO) {
                      n_outputs += nO;
                      delete this.outputs[node];
                  }
                  // Continue to parent
                  var paren = edges[node];
                  delete edges[node];
                  node = paren;
              }
              // node is now the branch node, or null for a neuron without branches
              if (!node) node = this.arbor.root;
              if (n_inputs > 0) this.inputs[node] = n_inputs;
              if (n_outputs > 0) this.outputs[node] = n_outputs;
          }
      }
  };

  // Make ArborParser available in CATMAID namespace
  CATMAID.ArborParser = ArborParser;

})(CATMAID);
