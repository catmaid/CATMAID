/** A high-level object to inspect the contents of
 * the reconstructed skeletons and their relations.
 * Intended for use from the console.
 * 
 * All access is read-only: no changes in the database.
 * All constructors have the side effect of registering themselves
 * into the appropriate cache of ID vs instance.
 * 
 * Example 1:
 *   var cm = new CM();
 *   var node = cm.fetchNode(4199);
 *   var sk = node.skeleton();
 *   var nodes = sk.nodes();
 *   var connectors = skeleton.connectors();
 *   var downstreamPartners = skeleton.downstreamPartners();
 * 
 * Example 2:
 *   var cm = new CM();
 *   var node = cm.selectedNode();
 *   console.log("ID", node.id);
 *   // An array from node to the first parent that has the tag 'TODO':
 *   var path = node.pathTo('TODO');
 *   // An object with multiple measurements:
 *   var m = node.measure();
 *   console.log("cable length:", m.cable);
 * 
 * Example 3:
 *   var cm = new CM();
 *   var sk = cm.selectedSkeleton();
 *   var cs = sk.connectors();
 *   // Retrieve all nodes and cache them
 *   var nodes = sk.nodes();
 *   // An array of Node instances that are presynaptic:
 *   var nodesWithPre = Object.getOwnPropertyNames(cs.pre).map(cm.node);
 * 
 * Example 4: AVOID poluting the global namespace, by creating a single var 'ns':
 *   var ns = new function() {
 *     this.cm = new CM();
 *     this.node = this.cm.selectedNode();
 *     this.sk = this.node.skeleton();
 *     this.cs = this.sk.connectors();
 *   };
 *   ns.sk.measure();
 *
 * TODO: add Node.go() which centers the display on the node and selects it.
 * TODO: add a table widget that is able to visualize one object per row, where all objects
 *       have the same property names.
 */
var CM = function()
{
  "use strict";
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
      if (0 === this.parent_id) return null; // root
      return cm.node(this.parent_id);
    };
    this.skeleton = function() {
      return cm.skeleton(this.skeleton_id);
    };
    this.isRoot = function() {
      return 0 === this.parent_id;
    };
    /**  Return the array of nodes, including this node,
     * all the way to the first parent that contains the tag.
     * Returns null if no parent matches. */
    this.pathTo = function(tag) {
      var node_map = this.skeleton().nodes();
      var parent = node_map[this.parent_id];
      var path = [this];
      var matches = function(t) { return t === tag; };
      while (true) {
        if (!parent) return null;
        path.push(parent);
        if (parent.tags && parent.tags.filter(matches).length > 0) return path;
        parent = node_map[parent.parent_id];
      }
    };
    /** Position the canvas centered at the x,y,z of this node. */
    this.go = function() {
      project.moveTo(this.z, this.y, this.x, 0);
    };
    this.select = function() {
      this.go();
      /*
      // Select the tracing tool if not selected
      if ("tracingtool" !== project.getTool().toolname) {
        project.setTool( new TracingTool() );
        // TODO synchronously wait for the tool to repaint
      }
      // Set this node as selected if not selected already
      // TODO
      */
      return "Currently you have to manually select the tracing tool and click on the node!";
    };
  };

  /** First check if an instance of json.id exists in the cache,
   * and if so, just update it with the json object.
   * Otherwise, return a new ctor(json).
   * This works for Node, Skeleton, Neuron and Connector,
   * which are all cached and whose only constructor argument is a json object. */
  var create = function(ctor, cache, json) {
    var o = cache[json.id];
    if (o) {
      jQuery.extend(o, json);
      return o;
    }
    return new ctor(json);
  };

  var Skeleton = function(json) {
    jQuery.extend(this, json);
    // Register instance
    cm.IDSkeletons[this.id] = this;

    /** Return the set of Node instances as {123: Node, 245: Node, ...}.
     * This function retrieves all nodes in one single call to the database.
     * The creation of each Node puts that Node into the IDNodes cache. */
    this.nodes = function() {
      if (this.hasOwnProperty("node_map")) {
        if (this.node_map) return this.node_map;
      }
      // Fetch all nodes in one single call
      var json = synchFetch("model/network.api/treenodes.php", {skid: this.id});
      if (null === json) return null;
      var map = {};
      for (var i=0, len=json.length; i<len; ++i) {
        map[json[i].id] = create(Node, cm.IDNodes, json[i]);
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
     *       pre: {123: [Connector, ...], 456: [Connector, ...], ...},
     *       post: {789: [Connector, ...], ...}
     *      }
     * 
     *  ... where the numbers are the IDs of the nodes in this skeleton
     *  that link to an array containing one or more connectors.
     */
    this.connectors = function(update) {
      if (!update && this.hasOwnProperty('cs')) {
        if (this.cs) return this.cs;
      }
      var json = synchFetch('model/network.api/connectors.php', {skid: this.id});
      if (null === json) return null;
      /** 'j' is the JSON object describing one connector in the json array. */
      var fn = function(map, j) {
        var tid = j.node_id;
        delete j.node_id;
        var c = create(Connector, cm.IDConnectors, j);
        var arr = map[tid];
        if (arr) {
          arr.push(c);
        } else {
          map[tid] = new Array(c);
        }
        return map;
      };
      this.cs = {
        pre: json.presynaptic.reduce(fn, {}),
        post: json.postsynaptic.reduce(fn, {})
      };
      return this.cs;
    };

    /** From an object that has arrays as values,
     * return a single array with all unique values in it.
     */
    var flattenValueArraysById = function(map) {
      var m = {};
      var arr = new Array();
      for (var ID in map) {
        if (map.hasOwnProperty(ID)) {
          for (var k in Object.keys(map[ID])) {
            var o = map[ID][k];
            if (!m.hasOwnProperty(o.id)) {
              m[o.id] = o;
              arr.push(o);
            }
          }
        }
      }
      return arr;
    };

    /** Returns an array of presynaptic connectors. */
    this.preConnectors = function(update) {
      return flattenValueArraysById(this.connectors(update).pre);
    };

    /** Returns an array of postsynaptic connectors. */
    this.postConnectors = function(update) {
      return flattenValueArraysById(this.connectors(update).post);
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
      return partners(this.preConnectors(), "postSkeletons");
    };

    this.upstreamPartners = function() {
      return partners(this.postConnectors(), "preSkeletons");
    };
    
    this.measure = function() {
      var node_map = this.nodes();
      var count = 0;
      var cable = 0;
      var nChildren = {};
      for (var ID in node_map) {
        if (node_map.hasOwnProperty(ID)) {
          count += 1;
          var n1 = node_map[ID];
          var n2 = node_map[n1.parent_id];
          if (n2) {
            cable += Math.sqrt(Math.pow(n2.x - n1.x, 2)
                             + Math.pow(n2.y - n1.y, 2)
                             + Math.pow(n2.z - n1.z, 2));
            if (nChildren[n2.id]) {
              nChildren[n2.id] += 1;
            } else {
              nChildren[n2.id] = 1;
            }
          }
        }
      }
      var slabNodes = 0;
      var branchNodes = 0;
      for (var parentID in nChildren) {
        if (nChildren.hasOwnProperty(parentID)) {
          if (1 === nChildren[parentID]) {
            slabNodes += 1;
          } else {
            branchNodes +=1;
          }
        }
      }

      var preCs = this.preConnectors();
      var postCs = this.postConnectors();
      var downstreamPartners = partners(preCs, "postSkeletons");
      var upstreamPartners = partners(postCs, "preSkeletons");
      var fn = function (sum, sk) { return sk.size() > 1 ? 0 : 1; };
      var downstreamPartnersSingleNode = downstreamPartners.reduce(fn, 0);
      var upstreamPartnersSingleNode = upstreamPartners.reduce(fn, 0);

      return {
        cable: cable,
        nodes: count,
        endNodes: count - slabNodes - branchNodes + 1, // plus the root
        branchNodes: branchNodes,
        slabNodes: slabNodes -1, // minus the root
        presynapticSites: preCs.length,
        downstreamPartners: downstreamPartners.length,
        downstreamPartnersSingleNode: downstreamPartnersSingleNode,
        postsynapticSites: postCs.length,
        upstreamPartners: upstreamPartners.length,
        upstreamPartnersSingleNode: upstreamPartnersSingleNode
      };
    };
    
    /** Return an array of nodes tagged with 'tag'.
     * If none found, returns an empty array. */
    this.tagged = function(tag) {
      var nodes_map = this.nodes();
      var a = [];
      var tags;
      for (var ID in nodes_map) {
        if (nodes_map.hasOwnProperty(ID)) {
          tags = nodes_map[ID].tags;
          if (tags && -1 !== tags.indexOf(tag)) {
            a.push(nodes_map[ID]);
          }
        }
      }
      return a;
    };
  };

  /**
   * id: the ID of the Connector instance.
   * x,y,z: the position of the Connector instance.
   * user_id: the ID of the user that owns the Connector instance.
   * pre: an array of origins in the format [{node_id: 123, skeleton_id: 456}, ...]
   *      where the skeleton_id is the ID of the skeleton that has this Connector
   *      as presynatic at node 123.
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
    var sk = cm.IDSkeletons[ID];
    if (sk) return sk;
    return cm.fetchSkeleton(ID);
  };
  
  this.neuron = function(ID) {
    var neu = cm.IDNeurons[ID];
    if (neu) return neu;
    return cm.fetchNeuron(ID);
  };
  
  this.node = function(ID) {
    var node = cm.IDNodes[ID];
    if (node) return node;
    return cm.fetchNode(ID);
  };

  this.connector = function(ID) {
    var c = cm.IDConnectors[ID];
    if (c) return c;
    return cm.fetchConnector(ID);
  };

  /** Query the database for the properties of the node with ID. */
  this.fetchNode = function(ID) {
    var json = synchFetch("model/network.api/treenode.php", {tnid: ID});
    if (null !== json) return create(Node, cm.IDNodes, json);
    return null;
  };
  
  this.fetchConnector = function(ID) {
    var json = synchFetch("model/network.api/connector.php", {cid: ID});
    if (null !== json) return create(Connector, cm.IDConnectors, json);
    return null;
  };

  /** Query the database for the properties of the skeleton with ID. */
  this.fetchSkeleton = function(ID) {
    var json = synchFetch("model/network.api/skeleton.php", {skid: ID});
    if (null !== json) return create(Skeleton, cm.IDSkeletons, json);
    return null;
  };

  this.fetchNeuron = function(ID) {
    var json = synchFetch("model/network.api/neuron.php", {neuron_id: ID});
    if (null !== json) return create(Neuron, cm.IDNeurons, json);
    return null;
  };

  /** Find what ID is (a skeleton, node or a neuron) and return the appropriate
   * object instance for reading out its properties. */
  this.fetch = function(ID) {
    var fns = [cm.neuron, cm.skeleton, cm.connector, cm.node];
    for (var i=0, len=fns.length; i<len; ++i) {
      var r = fns[i](ID);
      if (r !== null) return r;
    }
    return null;
  };

  /** Returns a Node or a Connector, depending upon what kind of node is selected. */
  this.selectedNode = function() {
    var ID = SkeletonAnnotations.getActiveNodeId();
    if (!ID) return null; // nothing selected
    return SkeletonAnnotations.getActiveNodeType() === "treenode" ?
        cm.node(ID)
      : cm.connector(ID);
  };

  this.selectedSkeleton = function() {
    var skID = SkeletonAnnotations.getActiveSkeletonId();
    if (skID) return cm.skeleton(skID);
    return null;
  };

  /** Query the database for nodes that have the given tag,
   * and return an array of them.
   * @param tag The tag to match.
   * @param maxResults The maximum number of results, or 0 for all. */
  this.fetchTagged = function(tag, maxResults) {
    var json = synchFetch("model/network.api/nodes.tagged.php", {tag: tag, limit: maxResults});
    if (json) return json.map(function(j) { return create(Node, cm.IDNodes, j); });
    return null;
  };
};
