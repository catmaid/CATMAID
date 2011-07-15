/** A high-level object to inspect the contents of
 * the reconstructed skeletons and their relations.
 * Intended for use from the console:
 * 
 *   var cm = new CM();
 *   var skeleton = cm.fetchSkeleton(123);
 *   var nodes = skeleton.nodes();
 *   var connectors = skeleton.connectors();
 *   var downstreamPartners = skeleton.downstreamPartners();
 * 
 * All access is read-only: no changes in the database.
 * 
 * All constructors have the side effect of registering themselves
 * into the appropriate cache of ID vs instance.
 */
var CM = function()
{
  var cm = this;
  // Cache:
  this.IDSkeletons = {};
  this.IDNeurons = {};
  this.IDNodes = {};
  this.IDConnectors = {};

  /** id: the Node's ID.
   *  parent_id: null if it is root.
   *  confidence: from 0 to 5, confidence of edge with parent.
   *  skeleton_id: ID of the skeleton this node belongs to.
   *  x, y, z: position in calibrated coordinates.
   *  user_id: ID of the user that last edited this Node.
   */
  var Node = function(json) {
    jQuery.extend(this, json);
    // Register instance
    cm.IDNodes[this.id] = this;
    /** Return the parent Node or null if it is the root. */
    this.parent = function() {
      if (this.parent_node) return this.parent_node;
      if (0 === this.parent_id) return null; // root
      return cm.node(this.parent_id);
    };
    this.skeleton = function() {
      return cm.skeleton(this.skeleton_id);
    };
    this.isRoot = function() {
      return 0 === this.parent_id;
    };
  };

  var Skeleton = function(json) {
    jQuery.extend(this, json);
    // Register instance
    cm.IDSkeletons[this.id] = this;

    /** Return the set of Node instances as {123: Node, 245: Node, ...}.
     * Each Node has a pointer "parent_node" to its parent Node.
     * This function is different than all others in that the skeleton
     * caches its own map of ID vs Node instances, and retrieves all
     * nodes in one single call to the database. */
    this.nodes = function() {
      if (this.hasOwnProperty("node_map")) {
        if (this.node_map) return this.node_map;
      }
      // Fetch all nodes in one single call
      var json = synchFetch("model/network.api.treenodes.php", {skid: this.id});
      if (null === json) return null;
      var map = {};
      for (var i=0, len=json.length; i<len; ++i) {
        var node = new Node(json[i]);
        map[node.id] = node;
      }
      for (var node in map) {
        if (map.hasOwnProperty(node)) {
          node.parent_node = map[node.parent_id];
        }
      }
      this.node_map = map;
      return this.node_map;
    };

    /** Retrieve a cached node, or fetch all nodes and then do so. */
    this.node = function(ID) {
      return this.nodes()[ID];
    };
    
    this.size = function() {
      return Object.keys(this.nodes()).length;
    };

    this.neuron = function() {
      return cm.neuron(this.neuron_id);
    };
    
    /** Returns a new object:
     *      {
     *       pre: {123: Connector, 456: Connector, ...},
     *       post: {789: Connector, ...}
     *      }
     * 
     *  ... where the numbers are the IDs of the nodes in this skeleton that link to the connectors.
     */
    this.connectors = function() {
      if (this.hasOwnProperty('cs')) {
        if (this.cs) return this.cs;
      }
      var json = synchFetch('model/network.api.connectors.php', {skid: this.id});
      if (null === json) return null;
      /** 'j' is the JSON object describing one connector in the json array. */
      var fn = function(map, j) {
        var tid = j.node_id;
        delete j.node_id;
        map[tid] = new Connector(j);
        return map;
      };
      this.cs = {
        pre: json.presynaptic.reduce(fn, {}),
        post: json.postsynaptic.reduce(fn, {})
      };
      return this.cs;
    };

    /** Invoke function fnName in every value of the properties in map,
     * which is expected to return an array of values,
     * and return the joint array of unique values. */
    var partners = function(map, fnName) {
      // First use a map to ensure no elements are repeated
      var skeletons = {};
      for (var c in map) {
        if (map.hasOwnProperty(c)) {
          var list = map[c][fnName]();
          for (var i=0, len=list.length; i<len; ++i) {
            skeletons[list[i].id] = list[i];
          }
        }
      }
      // Then place them all in an array
      var array = [];
      for (var sk in skeletons) {
        if (skeletons.hasOwnProperty(sk)) {
          array.push(skeletons[sk]);
        }
      }
      return array;
    };

    this.downstreamPartners = function() {
      return partners(this.connectors().pre, "postSkeletons");
    };

    this.upstreamPartners = function() {
      return partners(this.connectors().post, "preSkeletons");
    };
  };

  /**
   * id: the ID of the Connector instance.
   * x,y,z: the position of the Connector instance.
   * user_id: the ID of the user that owns the Connector instance.
   * pre: an array of origins in the format [{node_id: 123, skeleton_id: 456}, ...]
   *      where the skeleton_id is the ID of the skeleton that has this Connector as presynatic at node 123.
   * post: an array like pre, but for the postsynaptic skeletons.
   */
  var Connector = function(json) {
    jQuery.extend(this, json);
    // Register
    cm.IDConnectors[this.id] = this;
    
    this.preSkeletons = function() {
      return this.pre.map(function(o) { return cm.skeleton(o.skeleton_id); });
    };
    this.postSkeletons = function() {
      return this.post.map(function(o) { return cm.skeleton(o.skeleton_id); });
    };
    this.preNodes = function() {
      return this.pre.map(function(o) { return cm.node(o.node_id); });
    };
    this.postNodes = function() {
      return this.post.map(function(o) { return cm.node(o.node_id); });
    };
  };


  /** Currently provided by Connector
  // TODO
  var Synapse = function(json) {
    jQuery.extend(this, json);
    
    this.node = function() {
    };
    this.presynapticNodes = function() {
    };
    this.postsynapticNodes = function() {
    };
  };
  */

  var Neuron = function(json) {
    jQuery.extend(this, json);
    // Register instance
    cm.IDNeurons[this.id] = this;
    
    // TODO there could be more than one skeleton in this Neuron!
    // If so, the json with which this neuron is initialized will be unexpected!
    this.skeleton = function() {
      return cm.skeleton(this.skeleton_id);
    };
  };
 
  /** Query the remote database and wait for output. */
  var synchFetch = function(URL, params) {
    var r = null;
    var q = jQuery.ajax({
      url: URL,
      async: false,
      cache: false,
      type: "POST",
      data: jQuery.extend({}, params, {pid: project.id}),
      dataType: "json",
      beforeSend: function (x) {
                    if (x && x.overrideMimeType) {
                      x.overrideMimeType("application/json;charset=UTF-8");
                    }
                  },
      success: function(json, status, jqXHR) {
                    if ("success" === status) r = json;
                    if (json.error) {
                      console.log("ERROR", json.error);
                      r = null;
                    }
               }
    });
    return r;
  };
  
  this.skeleton = function(ID) {
    var sk = this.IDSkeletons[ID];
    if (sk) return sk;
    return this.fetchSkeleton(ID);
  };
  
  this.neuron = function(ID) {
    var neu = this.IDNeurons[ID];
    if (neu) return neu;
    return this.fetchNeuron(ID);
  };
  
  this.node = function(ID) {
    var node = this.IDNodes[ID];
    if (node) return node;
    return this.fetchNode(ID);
  };

  this.connector = function(ID) {
    var c = this.IDConnectors[ID];
    if (c) return c;
    return this.fetchConnector(ID);
  };

  /** Query the database for the properties of the node with ID. */
  this.fetchNode = function(ID) {
    var json = synchFetch("model/network.api.treenode.php", {tnid: ID});
    if (null !== json) return new Node(json);
    return null;
  };
  
  this.fetchConnector = function(ID) {
    var json = synchFetch("model/network.api.connector.php", {cid: ID});
    if (null !== json) return new Connector(json);
    return null;
  };

  /** Query the database for the properties of the skeleton with ID. */
  this.fetchSkeleton = function(ID) {
    var json = synchFetch("model/network.api.skeleton.php", {skid: ID});
    if (null !== json) return new Skeleton(json);
    return null;
  };

  this.fetchNeuron = function(ID) {
    var json = synchFetch("model/network.api.neuron.php", {neuron_id: ID});
    if (null !== json) return new Neuron(json);
    return null;
  }

  /** Find what ID is (a skeleton, node or a neuron) and return the appropriate
   * object instance for reading out its properties. */
  this.fetch = function(ID) {
    var fns = [this.fetchNeuron, this.fetchSkeleton, this.fetchNode];
    for (var i=0, len=fns.length; i<len; ++i) {
      var r = fns[i](ID);
      if (r !== null) return r;
    }
    return null;
  };

  this.selectedNode = function() {
    // In overlay.js, "atn" is a global variable holding the active node or the active connector.
    // A node is an instance of class Node in overlay_node.js,
    // and a connector is an instance of class ConnectorNode in overlay_connector.js.
    if (typeof atn === Node) return this.node(atn.id);
    if (typeof atn === ConnectorNode) return this.connector(atn.id);
    return null;
  };

  this.selectedSkeleton = function() {
    if (typeof atn === Node) {
      var node = this.node(atn.id);
      if (node) return node.skeleton();
    }
    return null;
  };
};
