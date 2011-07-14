/** A high-level object to inspect the contents of the reconstructed skeletons and their relations.
 * Intended for use from the console:
 * 
 * var cm = new CM();
 * var skeleton = cm.pickSkeleton(123);
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
        return this.parent_node;
      }
      this.parent_node = cm.pickNode(this.parent_id);
      return this.parent_node;
    };
    this.skeleton = function() {
      return cm.pickSkeleton(this.skeleton_id);
    };
  };
  
  var Skeleton = function(json) {
    jQuery.extend(this, json);
    
    /** Return the set of Node instances ordered by ID;
     * each Node has a pointer "parent_node" to its parent Node. */
    this.nodes = function() {
      var json = synchFetch("model/network.api.treenodes.php", {skid: this.id});
      if (null === json) return null;
      var ns = jQuery.map(json, function(x) { return new Node(x); });
      var dict = {};
      for (var i=0, len=ns.length; i<len; ++i) {
        dict[ns[i].id] = ns[i];
      }
      for (var i=0, len=ns.length; i<len; ++i) {
        ns[i].parent_node = dict[ns[i].parent_id];
      }
      return ns;
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
  this.pickNode = function(ID) {
    var json = synchFetch("model/network.api.treenode.php", {tnid: ID});
    if (null !== json) return new Node(json);
    return null;
  };

  /** Query the database for the properties of the skeleton with ID. */
  this.pickSkeleton = function(ID) {
    var json = synchFetch("model/network.api.skeleton.php", {skid: ID});
    if (null !== json) return new Skeleton(json);
    return null;
  };
  
  this.pickNeuron = function(ID) {
  }
  
  /** Find what ID is (a skeleton or a node) and return the appropriate
   * object instance for reading out its properties. */
  this.pick = function(ID) {
    var fns = [this.pickNeuron, this.pickSkeleton, this.pickNode];
    for (var i=0, len=fns.length; i<len; ++i) {
      var r = fns[i](ID);
      if (r !== null) return r;
    }
    return null;
  };
};
