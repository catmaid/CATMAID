importScripts('libs/jsnetworkx/jsnetworkx.js');

function calculateBetweennessCentrality(graph) {
	// Calculate the betweenness value for every node.
	betweenness = jsnx.betweenness_centrality(graph);
	
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
	
	postMessage(betweenness);
}

function calculateEdgeBetweennessCentrality(graph) {
	// Calculate the betweenness value for every edge.
	betweenness = jsnx.edge_betweenness_centrality(graph);
	
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
	
	postMessage(betweenness);
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
	
	if (action === 'betweenness_centrality') {
		calculateBetweennessCentrality(graph);
	}
	else if (action === 'edge_betweenness_centrality') {
		calculateEdgeBetweennessCentrality(graph);
	}
	else {
		throw "Unknown graph action: " + action
	}
 };
