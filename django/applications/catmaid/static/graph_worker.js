if (typeof(importScripts) !== "undefined") {
	importScripts('libs/jsnetworkx/jsnetworkx.js');
}


var GraphWorker = new function()
{
	var self = this;
	
	
	self.simplify = function(graph) {
		// Make a simplified version of the graph that combines all nodes between branches and leaves.
		
		// Start with a copy of the graph.
		var simplifiedGraph = graph.copy();
		
		// Loop through each node and replace it with an edge if it has exactly two neighbors.
		graph.nodes().sort().forEach(function(node) {
			var neighbors = simplifiedGraph.neighbors(node).sort();
			if (neighbors.length === 2) {
				// Keep track of which edges in the original graph map to which edge in the simplified graph.
				var edge0Data = simplifiedGraph.get_edge_data(node, neighbors[0]);
				var edge1Data = simplifiedGraph.get_edge_data(node, neighbors[1]);
				var map = ('map' in edge0Data ? edge0Data.map : []);
				map.push([node, neighbors[0]]);
				map.push([node, neighbors[1]]);
				if ('map' in edge1Data) {
					map = map.concat(edge1Data.map);
				}

				// Replace the node.
				simplifiedGraph.remove_node(node);
				simplifiedGraph.add_edge(neighbors[0], neighbors[1], (map.length > 0 ? {map: map} : {}));
			}
		});
		
      return jsnx.convert.to_edgelist(simplifiedGraph);
	}
	
	
	self.calculateBetweennessCentrality = function(graph) {
		// Calculate the betweenness value for every node.
		var betweenness = jsnx.betweenness_centrality(graph);
	
		// Rescale the betweenness values so that they range from 0.0 to 1.0.
		var max_b = 0.0;
		for (var b in betweenness) {
			if (betweenness.hasOwnProperty(b) && betweenness[b] > max_b) {
				max_b = betweenness[b];
			}
		}
		for (var b in betweenness) {
			if (betweenness.hasOwnProperty(b)) {
				betweenness[b] /= max_b;
			}
		}
	
		return betweenness;
	}


	self.calculateEdgeBetweennessCentrality = function(graph) {
		// Calculate the betweenness value for every edge.
		var betweenness = jsnx.edge_betweenness_centrality(graph);
	
		// Rescale the betweenness values so that they range from 0.0 to 1.0.
		var max_b = 0.0;
		for (var b in betweenness) {
			if (betweenness.hasOwnProperty(b) && betweenness[b] > max_b) {
				max_b = betweenness[b];
			}
		}
		for (var b in betweenness) {
			if (betweenness.hasOwnProperty(b)) {
				betweenness[b] /= max_b;
			}
		}
	
		return betweenness;
	}


	self.calculateBranchCentrality = function(graph) {
		// Calculate the branch centrality for every edge in the graph.
	
		// From Casey's e-mail the algorithm is as follows:
		// 
		// 	0) Let i=0 and duplicate the skeleton tree as temptree.
		// 
		// 	1) On temptree, compute the cable distance between end nodes and their nearest branch point.
		// 	2) Find the shortest end->branch segment and, on the original tree, assign those nodes a branch degree = i.
		// 	3) Remove this shortest end->branch segment from temptree. Typically, this reduces the number of branch points by one.
		// 	4) Increment i by 1, and loop 1–4 until no branch points remain.
		// 
		// 	5) Give the remaining nodes (some end point to the root node) whatever i.
		// 	6) Go through all tree nodes and replace their degree by max(i) - i. We want the core backbone nodes to have the smallest numbers, and the tiny branches to be large.
	
		var centrality = {};
		var graphCopy = graph.copy();
		var leaves = [];
		var i = 0;
	
		var degree = graph.degree();
		for (var n in degree) {
			if (degree[n] === 1) {
				var edgeData = graph.get_edge_data(n, graph.neighbors(n)[0]);
				// TODO: calculate physical cable length?
				var edgeLength = ('map' in edgeData ? edgeData.map.length : 1);
				leaves.push({node: n, length: edgeLength, root: graph.neighbors(n)[0]});
			}
		}
	
		while (leaves.length > 1)
		{
			leaves.sort(function(a, b) { return (a.length < b.length ? -1 : (a.length > b.length ? 1 : 0)); });
		
			var leaf = leaves.shift();
			var edge = [leaf.node, leaf.root].sort();
			if (!(edge in centrality)) {
				centrality[edge] = i;
		
				graphCopy.remove_node(leaf.node);
		
				var neighbors = graphCopy.neighbors(leaf.root);
				if (neighbors.length === 1) {
					// The node that the previous leaf was connected to (its "root") is now itself a leaf.
					var edgeData = graph.get_edge_data(leaf.root, neighbors[0]);
					var edgeLength = ('map' in edgeData ? edgeData.map.length : 1);
					leaves.push({node: leaf.root, length: edgeLength, root: neighbors[0]});
				}
				
				i += 1;
			}
		}
	
		// Rescale the values so that they range from 0.0 to 1.0.
		for (var c in centrality) {
			if (centrality.hasOwnProperty(c)) {
				centrality[c] /= i;
				// To increase the "contrast" of the values you could also do:
				// centrality[c] = Math.pow(centrality[c] / i, 2);
			}
		}
	
		return centrality;
	}
}
 

onmessage = function(event) {
	var graph = jsnx.to_networkx_graph(event.data['graph']);
	if (graph === undefined) {
		throw "Missing graph parameter in worker call.";
	}
	var action = event.data['action'];
	if (action === undefined) {
		throw "Missing action parameter in worker call.";
	}
	
	var response;
	
	if (action === 'simplify') {
		response = GraphWorker.simplify(graph);
	}
	else if (action === 'betweenness_centrality') {
		response = GraphWorker.calculateBetweennessCentrality(graph);
	}
	else if (action === 'edge_betweenness_centrality') {
		response = GraphWorker.calculateEdgeBetweennessCentrality(graph);
	}
	else if (action === 'branch_centrality') {
		response = GraphWorker.calculateBranchCentrality(graph);
	}
	else {
		throw "Unknown graph action: " + action
	}
	
	postMessage(response);
 };
