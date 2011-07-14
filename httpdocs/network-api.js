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

  var Node = function(json) {
    jQuery.extend(this, json);
    /** Return the parent Node or null if it is the root. */
    this.parent = function() {
      if (0 === this.parent_id) return null;
      if (this.hasOwnProperty("parent_node")) {
        if (this.parent_node) return this.parent_node;
      }
      this.parent_node = cm.fetchNode(this.parent_id);
      return this.parent_node;
    };
    this.skeleton = function() {
      if (0 === this.skeleton_id) return null;
      if (this.hasOwnProperty("skeleton_instance")) {
        if (this.skeleton_instance) return this.skeleton_instance;
      }
      this.skeleton_instance = cm.fetchSkeleton(this.skeleton_id);
      return this.skeleton_instance;
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
      if (0 === this.neuron_id) return null;
      if (this.hasOwnProperty("neuron_instance")) {
        if (this.neuron_instance) return this.neuron_instance;
      }
      this.neuron_instance = cm.fetchNeuron(this.neuron_id);
      if (this.neuron_instance) {
        this.neuron_instance.skeleton_instance = this;
      }
      return this.neuron_instance;
    };
  };
  
  var Neuron = function(json) {
    jQuery.extend(this, json);
    
    this.skeleton = function() {
      if (0 === this.skeleton_id) return null;
      if (this.hasOwnProperty("skeleton_instance")) {
        if (this.skeleton_instance) return this.skeleton_instance;
      }
      this.skeleton_instance = cm.fetchSkeleton(this.skeleton_id);
      if (this.skeleton_instance) {
        this.skeleton_instance.neuron_instance = this;
      }
      return this.skeleton_instance;
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
