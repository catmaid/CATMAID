/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/**
 * The neuron dendrogram widget represents a neuron as a dendrogram.
 */
var NeuronDendrogram = function() {
  this.widgetID = this.registerInstance();

  this.table = null;
  this.skeletonId = null;
  this.collapsed = true;
};

NeuronDendrogram.prototype = {};
$.extend(NeuronDendrogram.prototype, new InstanceRegistry());

NeuronDendrogram.prototype.getName = function() {
  return "Neuron Dendrogram " + this.widgetID;
};

NeuronDendrogram.prototype.init = function(container)
{
  this.container = container;
};

NeuronDendrogram.prototype.destroy = function() {
  this.unregisterInstance();
};

/**
 * Load the active skelton
 */
NeuronDendrogram.prototype.loadActiveSkeleton = function()
{
  var skid = SkeletonAnnotations.getActiveSkeletonId();
  if (!skid) {
    alert("There is currently no skeleton selected.");
    return
  } else
 
  this.loadSkeleton(skid)
};

/**
 * Load the given sekelton.
 */
NeuronDendrogram.prototype.loadSkeleton = function(skid)
{
  if (!skid) {
    alert("Please provide a skeleton ID");
  }

  // Retrieve skeleton data
  var url = django_url + project.id + '/' + skid + '/0/1/compact-skeleton';
  requestQueue.register(url, "GET", {}, jsonResponseHandler(
        (function(data) {
          this.currentSkeletonId = skid;
          this.currentSkeletonTree = data[0];
          this.currentSkeletonTags = data[2];
          this.update();
        }).bind(this)));
};

/**
 * Creates a tree representation of a node array. Nodes that appear in
 * taggedNodes get a label attached.
 */
NeuronDendrogram.prototype.createTreeRepresentation = function(nodes, taggedNodes)
{
  /**
   * Helper to create a tree representation of a skeleton. Expects data to be of
   * the format [id, parent_id, user_id, x, y, z, radius, confidence].
   */
  var createTree = function(index, specialNodes, data, forceSpecial, collapsed) {
    var id = data[0];
    var special = forceSpecial || specialNodes.indexOf(id) != -1;
    // Basic node data structure
    var node = {
      'name': id,
      'id': id,
      'loc_x': data[3],
      'loc_y': data[4],
      'loc_z': data[5],
      'tagged': special,
    };

    // Add children to node, if they exist
    if (index.hasOwnProperty(id)) {

      var findNext = function(n) {
        var cid = n[0];
        var skip = collapsed && // collapse active?
                   index.hasOwnProperty(cid) && // is parent?
                   (1 === index[cid].length) && // only one child?
                   specialNodes.indexOf(cid) == -1; // not special?
        if (skip) {
          // Test if child can also be skipped
          return findNext(index[cid][0]);
        } else {
          return n;
        }
      };

      node.children = index[id].map(findNext).map(function(c) {
        return createTree(index, specialNodes, c, special, collapsed);
      });

    }

    return node;
  };

  // Prepare hierarchical node data structure which is readable by d3. This is
  // done by indexing by parent first and then building the tree object.
  var parentToChildren = nodes.reduce(function(o, n) {
    var parent = n[1];
    if (!o.hasOwnProperty(parent)) {
      o[parent] = [];
    }
    // Push whole table row as value
    o[parent].push(n);
    return o;
  }, {});
  // Make sure we have exactly one root node
  if (!parentToChildren.hasOwnProperty(null)) {
    alert("Couldn't find root node. Aborting dendrogram rendering!");
    return;
  }
  if (parentToChildren[null].length > 1) {
    alert("Found more than one root node. Aborting dendrogram rendering!")
    return;
  }

  // Create the tree, starting from the root node
  var root = parentToChildren[null][0];
  var tree = createTree(parentToChildren, taggedNodes, root, false, this.collapsed);

  return tree;
};

NeuronDendrogram.prototype.resize = function()
{
  this.update();
};


NeuronDendrogram.prototype.update = function()
{
  if (!(this.currentSkeletonTree && this.currentSkeletonTags))
  {
    return;
  }

  var tag = $('input#dendrogram-tag-' + this.widgetID).val();
  var taggedNodeIds = this.currentSkeletonTags.hasOwnProperty(tag) ? this.currentSkeletonTags[tag] : [];
  var tree = this.createTreeRepresentation(this.currentSkeletonTree, taggedNodeIds);
  if (this.currentSkeletonTree && this.currentSkeletonTags) {
    this.renderDendogram(tree, this.currentSkeletonTags);
  }
};



/**
  * Renders a new dendogram containing the provided list of nodes.
  */
NeuronDendrogram.prototype.renderDendogram = function(tree, tags, referenceTag)
{
  var width = this.container.clientWidth;
  var height = this.container.clientHeight;
  var dendrogram = d3.layout.cluster().size([height, width - 160]);

  // Clear existing container
  $("#dendrogram" + this.widgetID).empty();

  // Create new SVG
  var svg = d3.select("#dendrogram" + this.widgetID).append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", "translate(40,0)");

  var nodes = dendrogram.nodes(tree);
  var links = dendrogram.links(nodes);

  var diagonal = d3.svg.diagonal()
    .projection(function(d) { return [d.y, d.x]; });

  // Split links in such that are upstream of tagged nodes and those downstream.
  var separatedLinks = links.reduce(function(o, l) {
    if (l.source.tagged) {
      o.downstreamLinks.push(l);
    } else {
      o.upstreamLinks.push(l);
    }
    return o;
  },
  {
    upstreamLinks: [],
    downstreamLinks: [],
  });

  var downLink = svg.selectAll(".link")
    .data(separatedLinks.downstreamLinks)
    .enter().append("path")
    .attr("class", "taggedLink")
    .attr("d", diagonal);

  var upLink = svg.selectAll(".link")
    .data(separatedLinks.upstreamLinks)
    .enter().append("path")
    .attr("class", "link")
    .attr("d", diagonal);

  // Split nodes in those which are tagged and those which are not
  var separatedNodes = nodes.reduce(function(o, n) {
    if (n.tagged) {
      o.taggedNodes.push(n);
    } else {
      o.regularNodes.push(n);
    }
    return o;
  },
  {
    taggedNodes: [],
    regularNodes: [],
  });

  var nodeClickHandler = function(n) {
      var skid = this.currentSkeletonId;
      SkeletonAnnotations.staticMoveTo(
          n.loc_z,
          n.loc_y,
          n.loc_x,
          function () {
             SkeletonAnnotations.staticSelectNode(n.id, skid);
          });
    };

  var addNodes = function(elements, cls) {
    var node = svg.selectAll(".node")
      .data(elements)
      .enter().append("g")
      .attr("class", cls)
      .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; })
      .on("dblclick", nodeClickHandler.bind(this));

    node.append("circle")
      .attr("r", 4.5);

    node.append("text")
      .attr("dx", function(d) { return d.children ? -8 : 8; })
      .attr("dy", 3)
      .style("text-anchor", function(d) { return d.children ? "end" : "start"; })
      .text(function(d) { return d.name; });
  };

  addNodes(separatedNodes.taggedNodes, "taggedNode");
  addNodes(separatedNodes.regularNodes, "node");

  d3.select(self.frameElement).style("height", height + "px");
};

NeuronDendrogram.prototype.setCollapsed = function(value)
{
  this.collapsed = value;
};
