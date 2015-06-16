(function(CATMAID) {
	"use strict";

	var CajalArbor = function() {};
	CajalArbor.prototype = {};

	/** Grow an Arbor using Cajal's laws as described in:
	 *  Cuntz et al. 2010. "One rule to grow them all: a general theory of
	 *  neuronal branching and its practical application". PLoS Comp Biol.
	 *
	 * The rules for growing neurons are as follows, as explained in Fig. 2A
	 * and in the text: a greedy algorithm based on the minimum spanning tree
	 * algorithm starts at the root and connects unconnected target points one
	 * by one to the growing tree. At each step, the unconnected point chosen
	 * to merge is the point with the lowest cost.
	 * The distance cost is composed of two factors:
	 *   1) A wiring cost represented by the Euclidean distance between the
	 *      point and the open node in the growing tree (this quantity loosely
	 *      corresponds to the material conservation constraint by Cajal).
	 *   2) A path length cost of the path along the tree from the root to the
	 *      point under consideration for merging (this quantity is consistent
	 *      with the conduction time conservation constraint by Cajal).
	 * The 'bf' is a balancing factor:
	 *   total cost = wiring cost + bf * path length cost.
	 *
	 *
	 * targets: the IDs of the nodes to include in the arbor to be grown.
	 * bf: balancing factor, a value between 0 and 1.
	 *
	 * Uses https://github.com/mikolalysenko/static-kdtree
	 *
	 * Returns a new Arbor.
	 */
	CajalArbor.prototype.grow = function(root, targets, positions, bf) {

		// Pack points into an array of arrays for static-kdtree
		// and keep track of which point is at what index in the array.
		var indices = {},
			  points = Object.keys(positions).map(function(nodeID, i) {
			var p = positions[nodeID],
				  a = [p.x, p.y, p.z];
		  indices[nodeID] = i;
			return a;
		});

		var kdtree = createKDTree(points);

		// Starting at root, find the point with the smallest cost
		var seen = {},
				arbor = new Arbor(),
				open = [root];
		arbor.root = root;
		while (0 !== open.length) {
			// TODO
			// Search within a given radius. Append nearest node. For the others,
			// see whether they are to be appended to this open node or to any
			// of its children instead. If all nodes were added directly or there
			// weren't any nodes, then the radius was not big enough: enlarge and try again.
		}


		return arbor;
	};

})(CATMAID);
