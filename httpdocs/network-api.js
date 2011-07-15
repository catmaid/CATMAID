/** A high-level object to inspect the contents of the reconstructed skeletons and their relations.
 * Intended for use from the console:
 * 
 * var cm = new CM();
 * var skeleton = cm.fetchSkeleton(123);
 * 
 * All access is read-only: no changes in the database.
 */
var CM = function()
{
  var cm = this;
  this.IDskeletons = {};
  this.IDNeurons = {};
  
  /** If instance contains a valid object in instance[cachedInstance], return it.
   * Else fetch it from the database using the fetchFunction(fetchID).
   * If innerInstance is defined, instance is set as the value of the innerInstance.
   * 
   * For example, if skeleton instance has a valid skeleton["neuron_instance"], return it.
   * Else fetch the neuron from the databse using cm.fetchNeuron(skeleton.neuron_id).
   * If the innerInstance "skeleton_instance" is defined, set the skeleton instance
   * into the new neuron instance as "skeleton_instance" member. */
  var memoizedFetch = function(instance, cachedInstance, fetchID, fetchFunction, innerInstance) {
    if (0 === fetchID) return null;
    if (instance.hasOwnProperty(cachedInstance)) {
      if (cachedInstance) return cachedInstance;
    }
    instance[cachedInstance] = fetchFunction(fetchID);
    if (innerInstance && instance[cachedInstance]) {
      instance[cachedInstance][innerInstance] = instance;
    }
    return instance[cachedInstance];
  };

  var Node = function(json) {
    jQuery.extend(this, json);
    /** Return the parent Node or null if it is the root. */
    this.parent = function() {
      return memoizedFetch(this, "parent_node", this.parent_id, cm.fetchNode);
    };
    this.skeleton = function() {
      return memoizedFetch(this, "skeleton_instance", this.skeleton_id, cm.fetchSkeleton);
    };
  };

  var Skeleton = function(json) {
    jQuery.extend(this, json);
    // Register, for connectors to find existing instances
    cm.IDskeletons[this.id] = this;

    /** Return the set of Node instances as {123: Node, 245: Node, ...}.
     * Each Node has a pointer "parent_node" to its parent Node. */
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
        node.skeleton_instance = this;
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

    this.node = function(ID) {
      return this.nodes()[ID];
    };

    this.neuron = function() {
      return memoizedFetch(this, "neuron_instance", this.neuron_id, cm.fetchNeuron, "skeleton_instance");
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
      var json = synchFetch('model/network.api.connectors.php', {skid: this.id});
      if (null === json) return null;
      var fn = function(map, j) {
        var tid = j.treenode_id;
        delete j.treenode_id;
        map[tid] = new Connector(j);
        return map;
      };
      this.cs = {
        pre: json.presynaptic.reduce(fn, {}),
        post: json.postsynaptic.reduce(fn, {})
      };
      return this.cs;
    };
  };

  /**
   * id: the ID of the Connector instance.
   * x,y,z: the position of the Connector instance.
   * user_id: the ID of the user that owns the Connector instance.
   * pre: an array of origins in the format {treenode_id: 123, skeleton_id: 456}
   *      where the skeleton_id is the ID of the skeleton that has this Connector as presynatic at node 123.
   * post: an array like pre, but for the postsynaptic skeletons.
   */
  var Connector = function(json) {
    jQuery.extend(this, json);
    
    this.preSkeletons = function() {
      // TODO
    };
    this.postSkeletons = function() {
      // TODO
    };
  };


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

  var Neuron = function(json) {
    jQuery.extend(this, json);
    
    this.skeleton = function() {
      return memoizedFetch(this, "skeleton_instance", this.skeleton_id, cm.fetchSkeleton, "neuron_instance");
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

  /** Query the database for the properties of the node with ID. */
  this.fetchNode = function(ID) {
    var json = synchFetch("model/network.api.treenode.php", {tnid: ID});
    if (null !== json) return new Node(json);
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
};
