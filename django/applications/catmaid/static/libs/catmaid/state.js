/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Some back-end functions require a user to send a state along (e.g. node
   * removal or creation). In a collaborative environment, clients can never be
   * sure if the information they see is the most recent one. The back-end
   * required to make changes off of the most recent version. To represent the
   * (local) state the client sees the world in, the state generating functions
   * are used. There is a NodeState and a ParentState where the last one is a
   * subset of the first one, representing only the parent information of a node
   * (used e.g. for node creation). Then there is also NoCheckState, which
   * causes the back-end to disable state checking for a request.
   */
  CATMAID.State = {};
  CATMAID.asEventSource(CATMAID.State);
  CATMAID.State.EVENT_STATE_NEEDS_UPDATE = "state_needs_update";

  /**
   * A general state representation for the neighborhood of an existing nodes.
   *
   * {
   *   parent: (<id>, <edition_time>),
   *   children: ((<child_id>, <child_edition_time>), ...),
   *   links: ((<link_id>, <link_edition_time>), ...)
   * }
   *
   * Additionally, connectors can be tested like this. The links will will be
   * checked from the connector perspective based on the current ID.
   *
   * {
   *   edition_time: <edition_time>
   *   c_links: ((<link_id>, <link_edition_time>), ...)
   * }
   */
  CATMAID.getNeighborhoodState = function(nodeId, editionTime, parentId, parentEditTime,
      children, links, cLinks) {
    var state = {};
    if (editionTime) {
      state["edition_time"] = editionTime;
    }
    if (parentId && parentEditTime) {
      state["parent"] = [parentId, parentEditTime];
    }
    if (children) {
      state["children"] = children;
    }
    if (links) {
      state['links'] = links;
    }
    if (cLinks) {
      state['c_links'] = cLinks;
    }
    return JSON.stringify(state);
  };

  /**
   * A state representation for new nodes. Currently it contains only the
   * edition time, because the node ID is expected to be sent along with a state
   */
  CATMAID.getNodeState = function(nodeId, editionTime) {
    var state = {
      "edition_time": editionTime
    };
    return JSON.stringify(state);
  };

  /**
   * A state representation for new multiple nodes.
   */
  CATMAID.getMultiNodeState = function(editionTimes) {
    var state = [];
    for (var nodeId in editionTimes) {
      state.push([nodeId, editionTimes[nodeId]]);
    }
    return JSON.stringify(state);
  };

  /**
   * A state representation for new nodes.
   */
  CATMAID.getParentState = function(parentId, parentEditTime) {
    var state = {
      // Make sure root nodes get represented properly
      "parent": [parentId || -1, parentEditTime || ""]
    };
    return JSON.stringify(state);
  };

  /**
   * A state to represent parent and child edition time.
   */
  CATMAID.getEdgeState = function(parentId, parentEditTime, childId, childEditTime) {
    var state = {
      "edition_time": parentEditTime,
      "children": [[childId, childEditTime]]
    };
    return JSON.stringify(state);
  };

  /**
   * A dummy state that causes the back-end to not do state checks.
   */
  CATMAID.getNoCheckState = function() {
    var state = {
      "nocheck": true
    };
    return JSON.stringify(state);
  };

  var testNoCheckState = CATMAID.getNoCheckState();
  CATMAID.isNoCheckState = function(state) {
    return testNoCheckState == state;
  };

  var get_or_error = function(obj, field) {
    if (obj[field]) {
      return obj[field];
    }
    throw new CATMAID.ValueError("Couldn't read field \"" +
        field + "\" for state initialization");
  };

  /**
   * A generic state doesn't manage nodes itself, but delegates to functions
   * passed in as parameter on construction. These functions are expected to
   * return a two-element list for each node: [id, edition_time].
   */
  var GenericState = function(options) {
    this.getNode = get_or_error(options, 'getNode');
    this.getParent = get_or_error(options, 'getParent');
    this.getChildren = get_or_error(options, 'getChildren');
    this.getLinks = get_or_error(options, 'getLinks');
  };

  GenericState.prototype.makeNodeState = function(nodeId) {
    var node = this.getNode(nodeId);
    if (!node) {
      throw new CATMAID.ValueError("Couldn't find node " + nodeId + " in state");
    }
    return CATMAID.getNodeState(node[0], node[1]);
  };

  GenericState.prototype.makeMultiNodeState = function(nodeIds) {
    var state = nodeIds.map(function(nodeId) {
      var node = this.getNode(nodeId);
      if (!node) {
        throw new CATMAID.ValueError("Couldn't find node " + nodeId + " in state");
      }
      return node;
    }, this);
    return JSON.stringify(state);
  };

  GenericState.prototype.makeParentState = function(nodeId) {
    var parent;
    if (nodeId) {
      parent = this.getNode(nodeId);
      if (!parent) {
        throw new CATMAID.ValueError("Couldn't find node " + nodeId + " in state");
      }
    } else {
      // If no node ID is passed in, a "no parent" state is created
      parent = [-1, ""];
    }
    return CATMAID.getParentState(parent[0], parent[1]);
  };

  /**
   * Create a local state representation based on the provided options. This
   * method allows to specify which children and links to include.
   */
  GenericState.prototype.makeLocalState = function(options) {
    var state = {};

    if (options.nodeId) {
      var node;
      var node = this.getNode(options.nodeId);
      if (!node) {
        throw new CATMAID.ValueError("Couldn't find node node " +
            options.nodeId + " in state");
      }
      state['edition_time'] = node[1];
    }

    if (options.parentId) {
      var parent = this.getNode(options.parentId);
      if (!parent) {
        throw new CATMAID.ValueError("Couldn't find parent node " +
            options.parentId + " in state");
      }
      state['parent'] = parent;
    }

    if (options.childIds && options.childIds.length > 0) {
      var children = [];
      for (var i=0; i<options.childIds.length; ++i) {
        var childId = options.childIds[i];
        var child = this.getNode(childId);
        if (!child) {
          throw new CATMAID.ValueError("Couldn't find child node " + childId + " in state");
        }
        children.push(child);
      }
      state['children'] = children;
    }

    if (options.links && options.links.length > 0) {
      var links = [];
      for (var i=0; i<options.links.length; ++i) {
        var link = options.links[i];
        if (!link) {
          throw new CATMAID.ValueError("Couldn't find link " + link + " in state");
        }
      }

      state['links'] = links;
    }

    return JSON.stringify(state);
  };

  GenericState.prototype.makeEdgeState = function(nodeId, parentId) {
    var node = this.getNode(nodeId);
    var parent = this.getNode(parentId);
    if (!node) {
      throw new CATMAID.ValueError("Couldn't find node " + nodeId + " in state");
    }
    if (!parent) {
      throw new CATMAID.ValueError("Couldn't find parent node " + nodeId + " in state");
    }
    return CATMAID.getEdgeState(parent[0], parent[1], node[0], node[1]);
  };

  GenericState.prototype.makeNeighborhoodState = function(nodeId, isConnector) {
    var node = this.getNode(nodeId);
    if (!node) {
      throw new CATMAID.ValueError("Couldn't find node " + nodeId + " in state");
    }
    if (isConnector) {
      var cLinks = this.getLinks(nodeId, true);
      return CATMAID.getNeighborhoodState(node[0], node[1], null, null, null, null, cLinks);
    } else {
      var parent = this.getParent(nodeId);
      if (!parent) {
        throw new CATMAID.ValueError("Couldn't find parent of node " + nodeId + " in state");
      }
      var links = this.getLinks(nodeId, false);
      return CATMAID.getNeighborhoodState(node[0], node[1], parent[0], parent[1],
          this.getChildren(nodeId), links, null);
    }
  };

  CATMAID.GenericState = GenericState;

  /**
   * This state type doesn't know about parent/child relations, but only maps
   * node IDs to edition times can create simple single and multi node states
   * from it.
   */
  var SimpleSetState = function(nodes) {
    this.nodes = nodes;
  };

  SimpleSetState.prototype = Object.create(GenericState.prototype);
  SimpleSetState.constructor = SimpleSetState;

  SimpleSetState.prototype.getLinks = CATMAID.noop;
  SimpleSetState.prototype.getParent = CATMAID.noop;
  SimpleSetState.prototype.getChildren = CATMAID.noop;
  SimpleSetState.prototype.getNode = function(nodeId) {
    var node, timestamp = this.nodes[nodeId];
    if (timestamp) {
      node = [nodeId, timestamp];
    }
    return node;
  };

  CATMAID.SimpleSetState = SimpleSetState;

  /**
   * This state represents only a local node centered part. If passed in, node
   * and parent are expected to be two-element lists with ID and edition time.
   * Children and links are expected to be lists of such two-element lists.
   * There is no extra check performed whether the passed in data is correct.
   */
  var LocalState = function(node, parent, children, links) {
    this.node = node;
    this.parent = parent;
    this.children = children;
    this.links = links;
  };

  LocalState.prototype = Object.create(GenericState.prototype);
  LocalState.constructor = LocalState;

  LocalState.prototype.getNode = function(nodeId) {
    var node;
    if (this.node && this.node[0] == nodeId) {
      return this.node;
    }
    if (this.parent && this.parent[0] == nodeId) {
      return this.parent;
    }
    if (this.children) {
      for (var i=0; i<this.children.length; ++i) {
        var child = this.children[i];
        if (child[0] == nodeId) {
          return child;
        }
      }
    }
    return node;
  };

  LocalState.prototype.makeParentState = function(nodeId) {
    if (!this.parent) {
      throw new CATMAID.ValueError("Couldn't find node " + nodeId + " to create parent state");
    }
    return CATMAID.getParentState(this.parent[0], this.parent[1]);
  };

  LocalState.prototype.makeEdgeState = function(childId, parentId) {
    if (!this.node || this.node[0] != parentId) {
      throw new CATMAID.ValueError("Couldn't find parent node " + parentId +
          " to create edge state");
    }
    if (!this.children || 0 === this.children.length) {
      throw new CATMAID.ValueError("Couldn't find child node " + childId +
          " to create edge state");
    }
    var child;
    for (var i=0; i<this.children.length; ++i) {
      var currentChild = this.children[i];
      if (childId == currentChild[0]) {
        child = currentChild;
        break;
      }
    }
    if (!child) {
      throw new CATMAID.ValueError("Couldn't find child node " + childId +
          " to create edge state");
    }
    return CATMAID.getEdgeState(this.node[0], this.node[1], child[0], child[1]);
  };

  LocalState.prototype.getParent = function(nodeId) {
    return this.parent;
  };

  LocalState.prototype.getChildren = function(nodeId) {
    return this.children;
  };

  LocalState.prototype.getLinks = function(nodeId) {
    return this.links;
  };

  // Export local state
  CATMAID.LocalState = LocalState;

  // A function to return undefined, just to be explicit.
  function returnUndefined() {}
  function returnUndefinedNode() { return [null, null]; }
  function returnEmptyList() { return []; }

  /**
   * A no-check implementation returns undefined for all nodes and the created
   * state serializations trigger the back-end to disable state checking.
   */
  var NoCheckState = function() {};
  NoCheckState.prototype.getNode = returnUndefinedNode;
  NoCheckState.prototype.getParent = returnUndefinedNode;
  NoCheckState.prototype.getChildren = returnEmptyList;
  NoCheckState.prototype.getLinks = returnEmptyList;
  NoCheckState.prototype.makeNodeState = CATMAID.getNoCheckState;
  NoCheckState.prototype.makeParentState = CATMAID.getNoCheckState;
  NoCheckState.prototype.makeEdgeState = CATMAID.getNoCheckState;
  NoCheckState.prototype.makeNeighborhoodState = CATMAID.getNoCheckState;
  NoCheckState.prototype.makeLocalState = CATMAID.getNoCheckState;

  // Export no-check state
  CATMAID.NoCheckState = NoCheckState;

})(CATMAID);
