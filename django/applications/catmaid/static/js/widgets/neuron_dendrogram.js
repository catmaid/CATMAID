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
  this.showNodeIDs = true;
  this.showTags = true;

  // Stores a reference to the current SVG, if any
  this.svg = null;
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
  var createTree = function(index, taggedNodes, data, belowTag, collapsed)
  {
    var id = data[0];
    var tagged = taggedNodes.indexOf(id) != -1;
    belowTag =  belowTag || tagged;
    // Basic node data structure
    var node = {
      'id': id,
      'loc_x': data[3],
      'loc_y': data[4],
      'loc_z': data[5],
      'tagged': tagged,
      'belowTag': belowTag,
    };

    // Add children to node, if they exist
    if (index.hasOwnProperty(id)) {

      var findNext = function(n) {
        var cid = n[0];
        var skip = collapsed && // collapse active?
                   index.hasOwnProperty(cid) && // is parent?
                   (1 === index[cid].length) && // only one child?
                   taggedNodes.indexOf(cid) == -1; // not tagged?
        if (skip) {
          // Test if child can also be skipped
          return findNext(index[cid][0]);
        } else {
          return n;
        }
      };

      node.children = index[id].map(findNext).map(function(c) {
        return createTree(index, taggedNodes, c, belowTag, collapsed);
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
  // For now do nothing.
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
    this.renderDendogram(tree, this.currentSkeletonTags, tag);
  }
};

/**
 * Return the number of leaf nodes in the given tree representation.
 */
NeuronDendrogram.prototype.getNumLeafs = function(node)
{
  if (node.hasOwnProperty("children")) {
    return 1 + node.children
        .map(NeuronDendrogram.prototype.getNumLeafs)
        .reduce(function(s, n) {
      return Math.max(s, n);
    }, 0);
  } else {
    return 1;
  }
};

/**
 * Return the maximum depth of the given tree representation.
 */
NeuronDendrogram.prototype.getMaxDepth = function(node)
{
  if (node.hasOwnProperty("children")) {
    return node.children
        .map(NeuronDendrogram.prototype.getMaxDepth)
        .reduce(function(s, n) {
      return s + n;
    }, 0);
  } else {
    return 1;
  }
};

/**
  * Renders a new dendogram containing the provided list of nodes.
  */
NeuronDendrogram.prototype.renderDendogram = function(tree, tags, referenceTag)
{
  var margin = {top: 50, right: 70, bottom: 50, left: 70};
  var baseWidth = this.container.clientWidth - margin.left - margin.right;
  var baseHeight = this.container.clientHeight - margin.top - margin.bottom;

  // Adjust the width and height so that each node has at least a space of 10 by 10 pixel
  var nodeSize = [20, 40];
  var width = Math.max(baseWidth, nodeSize[0] * this.getMaxDepth(tree));
  var height = Math.max(baseHeight, nodeSize[1] * this.getNumLeafs(tree));

  // Create clustering where each leaf node has the same distance to its
  // neighbors.
  var dendrogram = d3.layout.cluster()
    .size([height, width])
    .separation(function() { return 1; });

  // Find default scale so that everything can be seen
  var defaultScale = width > height ? baseWidth / width : baseHeight / height;

  // Clear existing container
  $("#dendrogram" + this.widgetID).empty();

  // Create new SVG
  var zoomHandler = d3.behavior.zoom().scaleExtent([0.1, 100]).on("zoom", zoom);
  this.svg = d3.select("#dendrogram" + this.widgetID)
    .append("svg:svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .call(zoomHandler);
  var vis = this.svg.append("svg:g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")" +
          "scale(" + defaultScale + ")");

  zoomHandler.scale(defaultScale);

  // Add a background rectangle to get all mouse events for panning and zoom
  var rect = vis.append("rect")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .style("fill", "none")
    .style("pointer-events", "all");

  var nodes = dendrogram.nodes(tree);
  var links = dendrogram.links(nodes);

  function elbow(d, i) {
      return "M" + d.source.y + "," + d.source.x
           + "V" + d.target.x + "H" + d.target.y;
  }

  // Split links in such that are upstream of tagged nodes and those downstream.
  var separatedLinks = links.reduce(function(o, l) {
    if (l.source.belowTag) {
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

  var downLink = vis.selectAll(".link")
    .data(separatedLinks.downstreamLinks)
    .enter().append("path")
    .attr("class", "taggedLink")
    .attr("d", elbow);

  var upLink = vis.selectAll(".link")
    .data(separatedLinks.upstreamLinks)
    .enter().append("path")
    .attr("class", "link")
    .attr("d", elbow);

  // Split nodes in those which are tagged and those which are not
  var separatedNodes = nodes.reduce(function(o, n) {
    if (n.belowTag) {
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

  var nodeClickHandler = (function(n) {
      var skid = this.currentSkeletonId;
      SkeletonAnnotations.staticMoveTo(
          n.loc_z,
          n.loc_y,
          n.loc_x,
          function () {
             SkeletonAnnotations.staticSelectNode(n.id, skid);
          });
    }).bind(this);

  var nodeName = function(showTags, showIds) {
    if (showTags) {
      return function(d) {
        if (d.tagged) {
          return referenceTag + (showIds ? " (" + d.id + ")" : "");
        } else {
          return showIds ? d.id : "";
        }
      }
    } else {
      return function(d) {
        return showIds ? d.id : "";
      };
    }
  }(this.showTags, this.showNodeIDs);

  var addNodes = function(elements, cls) {
    var node = vis.selectAll(".node")
      .data(elements)
      .enter().append("g")
      .attr("class", cls)
      .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; })
      .on("dblclick", nodeClickHandler);

    node.append("circle")
      .attr("r", 4.5);

    node.append("text")
      .attr("dx", function(d) { return d.children ? -8 : 8; })
      .attr("dy", 3)
      .style("text-anchor", function(d) { return d.children ? "end" : "start"; })
      .text(nodeName);

    return node;
  };

  addNodes(separatedNodes.taggedNodes, "taggedNode");
  addNodes(separatedNodes.regularNodes, "node");

  d3.select(self.frameElement).style("height", height + "px");

  function zoom() {
    vis.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
  };
};

/**
 * Exports the currently displayed dendrogram as SVG. This is done by converting
 * the existing SVG DOM element to XML and adding the needed style sheets as
 * CDATA into a style element.
 */
NeuronDendrogram.prototype.exportSVG = function()
{
  if (!this.svg) {
    return;
  }

  // Create XML representation of SVG
  var svg = this.svg[0][0];
  var xml = $.parseXML(new XMLSerializer().serializeToString(svg));

  // Find needed CSS rules, others are ignored
  var rules = ['.node', '.taggedNode', '.node circle', '.taggedNode circle',
      '.link', '.taggedLink'];

  var css = rules.reduce(function(o, r) {
    // Find element in SVG that matches the rule
    var elems = $(svg).find(r);
    // Ignore rules that we didn't find
    if (elems.length > 0) {
      // Get all computed CSS styles for it
      var cs = window.getComputedStyle(elems[0], null);
      var style = "";
      for (var i=0;i<cs.length; i++) {
        var s = cs[i];
        style = style + s + ": " + cs.getPropertyValue(s) + ";";
      }
      // Append it to the style sheet string
      o = o + r + " {" + style + "}";
    }
    return o;
  }, "");

  // Prepend CSS embedded in CDATA section
  var styleTag = xml.createElement('style');
  styleTag.setAttribute('type', 'text/css');
  styleTag.appendChild(xml.createCDATASection(css));

  // Add style tag to SVG node in XML document (first child)
  xml.firstChild.appendChild(styleTag);

  // Serialize SVG including CSS and export it as blob
  var data = new XMLSerializer().serializeToString(xml);
  var blob = new Blob([data], {type: 'text/svg'});
  saveAs(blob, "dendrogram-" + this.skeletonID + "-" + this.widgetID + ".svg");
};

NeuronDendrogram.prototype.setCollapsed = function(value)
{
  this.collapsed = value;
};

NeuronDendrogram.prototype.setShowNodeIds = function(value)
{
  this.showNodeIDs = value;
};

NeuronDendrogram.prototype.setShowTags = function(value)
{
  this.showTags = value;
};
