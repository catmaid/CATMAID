/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  fetchSkeletons,
  numeric
 */

/** A Javascript implementation of the NBLAST algorithm by:
 * "NBLAST: Rapid, sensitive comparison of neuronal structure and construction of neuron family databases"
 * Marta Costa, Aaron D. Ostrovsky, James D. Manton, Steffen Prohaska, Gregory S.X.E. Jefferis
 * http://www.biorxiv.org/content/early/2014/08/09/006346
 */

(function(CATMAID) {
  "use strict";

  var NBLAST = function(options) {

    // Map of skeleton ID vs object
    this.neurons = {};

    this.options = {
      // Whether to collapse artifactual branches labeled as "not a branch"
      pruneNotABranch: options.pruneNotABranch ? true : false,
      // Reduction of distal branches with a Strahler number smaller than the given
      strahler: Number.isNaN(options.strahler) || options.strahler < 1 ? 1 : options.strahler,
      // Resampling to reduce the number of nodes in the arbor
      resampling_delta: Number.isNan(options.resampling_delta) || options.resampling_delta < 0 ? 0 : options.resampling_delta
      // Smoothing with a Gaussian convolution
      sigma: Number.isNaN(options.sigma) || options.sigma < 0 ? 0 : options.sigma,
      // Maximum number of iterations for computing the eigen values
      maxiter: Number.isNaN(options.maxiter) || options.maxiter < 0 ? 100000 : options.maxiter,
      // Precision for numeric.js
      epsilon: Number.isNaN(options.epsilon) ? 0.0000000001 : options.epsilon
    };

  };

  NBLAST.prototype = {};

  NBLAST.prototype.append = function(models) {
    fetchSkeletons(
        Object.keys(models),
        function(skid) {
          return django_url + project.id + '/' + skid + '/1/0/1/compact-arbor';
        },
        this.appendOne.bind(this),
        function(skid) { CATMAID.msg('Error', 'Failed to load arbor for: ' + skid); },
        function() {
          // TODO done
        });
  };

  /** Apply options. Notice that resampling requires a sigma larger than 0,
   * and will use 200 nm when none is specified. */
  NBLAST.prototype.preprocess = function(ap, options) {
    if (options.pruneNotABranch) {
      ap.collapseArtifactualBranches(json[2]);
    }
    if (options.strahler > 1) {
      var sa = ap.arbor.strahlerAnalysis(),
          strahler = options.strahler;
      ap.arbor.nodesArray().forEach(function(node) {
        if (sa[node] < strahler) {
          delete arbor.edges[node];
        }
      });
    }
    if (options.resampling_delta > 0) {
      var sigma = options.sigma === 0 ? 200 : options.sigma;
      var o = ap.arbor.resampleSlabs(ap.positions, sigma, options.resampling_delta, 2);
      ap.arbor = o.arbor;
      ap.positions = o.positions;
    } else if (options.sigma > 0) {
      ap.positions = ap.arbor.smoothPositions(ap.positions, options.sigma);
    }
  };

  NBLAST.prototype.appendOne = function(skid, json) {
    // Create arbor
    var ap = new CATMAID.ArborParser().init(json, 'compact-arbor'));
    this.preprocess(ap, this.options);

    // Create vector representation
    // From Costa et al. 2014:
    // "the tangent vector (i.e. the local heading) of the neuron at each point
    //  was computed as the first eigenvector of a singular value decomposition (SVD)
    //  of the point and its 5 nearest neighbors."
    //
    // "Dot properties for each neuron skeleton were extracted following the method
    // in Masse et al. (2012), using the dotprops function of our new nat package for R.
    // This converted each skeleton into segments, described by its location and tangent vector."
    // https://github.com/jefferis/nat/blob/master/R/dotprops.R#L140
    //
    // Could interpret the above as 2 points upstream and 2 downstream,
    // or as 5 points in the vicinity of the point in question,
    // or as many points as fall within e.g. sigma distance of the point
    // in Euclidean distance of points upstream of downstream,
    // or simply the parent and child(ren), given that the arbor has been smoothed out already.
    //
    // From the nat package, dotprops function, inner loop:
    //   for(i in 1:npoints){
    //       indNN=nns$nn.idx[i,]   -- range of indices to select from the list of all points
    //       pt=pointst[,indNN]     -- the set of adjacent 3D points to consider, as a 3xN matrix
    //       cpt=pt-rowMeans(pt)    -- the set of adjacent points, centered around 0,0,0
    //       
    //       inertia=cpt%*%t(cpt)   -- the centered points times their transverse: results in a 3x3 matrix describing the moment of inertia
    //       v1d1<-eigen(inertia,symmetric=TRUE)
    //       
    //       alpha[i]=(v1d1$values[1]-v1d1$values[2])/sum(v1d1$values)
    //       vect[i,]=v1d1$vectors[,1]
    //   }


    // nodes and vectors are paired    
    var nodes = ap.arbor.nodesArray();

    var vectors = (function(neighbors, nodes, maxiter, epsilon) {

      // Adjust precision
      var numeric_epsilon = numeric.epsilon;
      numeric.epsilon = epsilon;

      // Array of 3d vectors, same order as nodes
      var vec = [];

      try {

        nodes.forEach(function(node) {
          var set = neighbors[node].concat(node);

          var matrix = [new Float64Array(set.length),
                        new Float64Array(set.length),
                        new Float64Array(set.length)];

          // Populate matrix with coordinates of nodes as column vectors
          for (var i=0; i<set.length; ++i) {
            var p = ap.positions[set[i]];
            matrix[0][i] = p.x;
            matrix[1][i] = p.y;
            matrix[2][i] = p.z;
          }

          // Subtract average of every dimension
          for (var i=0; i<3; ++i) {
            var row = matrix[i],
                mean = 0;
            for (var i=0; i<row.length; ++i) mean += row[i];
            for (var i=0; i<row.length; ++i) row[i] -= mean;
          }

          var inertia = numeric.mul(matrix, numeric.transpose(matrix));
          var eigenvalues = numeric.eig(inertia, maxiter);

          // Sort eigenvalues
          var sorted_lambda = eigenvalues.lambda.x.map(function(e, i) { return [i, e]; })
                                                  .sort(function(a, b) { return a[1] - b[1]; });
          // TODO might not be appropriate - Skip eigenvalues that are practically zero
          //var i = 0;
          //while (sorted_lambda[i][1] < numeric.epsilon) { i++; }
          // Read the column vector (the eigenvector) of the first eigenvalue
          var X = numeric.transpose(eigenvalues.E.x);
          var v = X[sorted_lambda[i][0]];
          // Alpha is an indicator of how well the first eigenvector is representative?
          //var alpha = (sorted_lambda[i][1] - sorted_lambda[i+1][1]) / numeric.sum(eigenvalues.lambda.x);

          var a = matrix[0]; // reuse
          a[0] = v[0];
          a[1] = v[1];
          a[2] = v[2];

          vec.push(a);

        });

      } catch (ex) {
        console.log(e, e.stack);
        alert(e);
      }

      // Reset
      numeric.epsilon = numeric_epsilon;

      return vec;

    })(ap.arbor.allNeighbors(), // will be edited: single use
       nodesArray,
       this.options.maxiter);


    // Create KD-tree
    var points = nodesArray.map(function(node) {
      var v = ap.positions[node];
      var a = new Float64Array(3);
      a[0] = v.x;
      a[1] = v.y;
      a[2] = v.z;
      return a;
    });

    var kdtree = createKDTree(points);
    // Use kdtree.nn(...) to find the nearest neighbor

    this.neurons[skid] =
      {nodes: nodes,
       vectors: vectors,
       points: points,
       kdtree: kdtree};
  };


})(CATMAID);
