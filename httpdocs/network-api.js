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
    
    /** Return the set of Node instances ordered by ID;
     * each Node has a pointer "parent_node" to its parent Node. */
    this.nodes = function() {
      if (this.hasOwnProperty("nodes_array")) {
        if (this.nodes_array) return this.nodes_array;
      }
      // Fetch all nodes in one single call
      var json = synchFetch("model/network.api.treenodes.php", {skid: this.id});
      if (null === json) return null;
      var ns = jQuery.map(json, function(x) { return new Node(x); });
      var dict = {};
      for (var i=0, len=ns.length; i<len; ++i) {
        dict[ns[i].id] = ns[i];
      }
      for (var i=0, len=ns.length; i<len; ++i) {
        ns[i].parent_node = dict[ns[i].parent_id];
        ns[i].skeleton_instance = this;
      }
      this.nodes_array = ns;
      return this.nodes_array;
    };
    
    this.neuron = function() {
      return memoizedFetch(this, "neuron_instance", this.neuron_id, cm.fetchNeuron, "skeleton_instance");
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
