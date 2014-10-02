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

  // Read tag
  var tag = $('input#dendrogram-tag-' + this.widgetID).val();

  // Retrieve skeleton data
  var url = django_url + project.id + '/' + skid + '/0/1/compact-skeleton';
  requestQueue.register(url, "GET", {}, jsonResponseHandler(
        (function(data) {
          var taggedNodeIds = data[2].hasOwnProperty(tag) ? data[2][tag] : [];
          var tree = this.createTreeRepresentation(data[0], taggedNodeIds);
          this.currentSkeletonId = skid;
          this.currentSkeletonTree = tree;
          this.currentSkeletonTags = data[2];
          this.renderDendogram(tree, data[2], tag);
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
  var createTree = function(index, specialNodes, data, forceSpecial) {
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
      node.children = index[id].map(function(c) {
        return createTree(index, specialNodes, c, special);
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
  var tree = createTree(parentToChildren, taggedNodes, root, false);

  return tree;
};

NeuronDendrogram.prototype.resize = function()
{
  if (this.currentSkeletonTree && this.currentSkeletonTags) {
    this.renderDendogram(this.currentSkeletonTree, this.currentSkeletonTags);
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

  var node = svg.selectAll(".node")
    .data(nodes)
    .enter().append("g")
    .attr("class", "node")
    .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; })
    .on("dblclick", (function(n) {
      var skid = this.currentSkeletonId;
      SkeletonAnnotations.staticMoveTo(
          n.loc_z,
          n.loc_y,
          n.loc_x,
          function () {
             SkeletonAnnotations.staticSelectNode(n.id, skid);
          });
    }).bind(this));

  node.append("circle")
    .attr("r", 4.5);

  node.append("text")
    .attr("dx", function(d) { return d.children ? -8 : 8; })
    .attr("dy", 3)
    .style("text-anchor", function(d) { return d.children ? "end" : "start"; })
    .text(function(d) { return d.name; });

  d3.select(self.frameElement).style("height", height + "px");
};
