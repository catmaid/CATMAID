/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

/**
 * Computes the 'signal flow' and the eigenvectors of the adjacency matrix,
 * stored in the z array and the e array of eigenvalue and eigenvector pairs
 * (sorted by eigenvalue and excluding the zero eigenvalues).
 *
 * Algorithms by Casey Schneider-Mizell's interpretation of Varshney et al. 2010,
 * Implementation by Albert Cardona.
 *
 * Structural Properties of the Caenorhabditis elegans Neuronal Network
 * Lav R. Varshney, Beth L. Chen, Eric Paniagua, David H. Hall, Dmitri B. Chklovskii
 * PLoS Computational Biology 2010, DOI: 10.1371/journal.pcbi.1001066
 *
 * Invoke like:
 *
 * var cga = new CircuitGraphAnalysis().init(adjacency_matrix, maxiter, epsilon)
 * ... with maxiter being the maximum number of iterations to compute
 * the eigenvalues and eigenvectors.
 */
var CircuitGraphAnalysis = function() {
  // Signal Flow, as an array where each index corresponds to the row and column
  // index of the adjacency matrix
  this.z = null;

  // Non-zero eigenvectors, as an array of arrays, each subarray being a pair
  // of eigenvalue and eigenvector, sorted by eigenvalue.
  this.e = null;

	// Compute z and e via a call to init
};

CircuitGraphAnalysis.prototype = {};

/** Degrees of the adjacency matrix represented by W. */
CircuitGraphAnalysis.prototype._degrees = function(W) {
  return W.map(function(row) {
    return row.reduce(function(a, b) { return a + b }, 0);
  });
};

/** Pseudo inverse of the matrix L. */
CircuitGraphAnalysis.prototype._pseudoinverse = function(L) {
  // Singular value decomposition
  var svd = numeric.svd(L);

  // inverted singular values (with zeros left as zeros)
  var S = svd.S.map(function(a) { return 0 === a ? 0 : 1/a; });

  // return pseudoinverse
  return numeric.dot(numeric.dot(svd.V, numeric.diag(S)),
                     numeric.transpose(svd.U));
};

/** Return a new 2d matrix that contains the signs of each cell. */
CircuitGraphAnalysis.prototype._sign = function(M) {
  return M.map(function(row) {
    return row.map(function(a) {
      return a === 0 ? 0 : (a < 0 ? -1 : 1);
    });
  });
};

/**
 * adjacency_matrix: an array of arrays of even dimensions.
 * maxiter: maximum number of iterations for computing the eigen values.
 * epsilon: precision below which a floating-point number is considered zero.
 *
 * In practice, using the default numeric.epsilon fails in some occasions,
 * when too many nodes are too 'close' to each other network-wise.
 * An epsilon of 0.0000000001 works well empirically.
 *
 * Returns null if not computable: given no edges (no synapses),
 * or all are self edges (autapses).
 */
CircuitGraphAnalysis.prototype.init = function(adjacency_matrix, maxiter, epsilon) {
  // Check if computable
  var sum = numeric.sum(adjacency_matrix);
  if (0 === sum) return null; // no synapses
  if (0 === sum - numeric.sumV(numeric.getDiag(adjacency_matrix))) {
    // Has only autapses, which result in a all-zero Laplacian
    return this;
  }

  var numeric_epsilon = numeric.epsilon;
  if (typeof(epsilon) === 'number') {
    numeric.epsilon = epsilon;
  }
  try {
    var t_adjacency_matrix = numeric.transpose(adjacency_matrix);

    // symmetrized adjacency matrix
    var W = numeric.div(numeric.add(adjacency_matrix, t_adjacency_matrix), 2);

    // diagonalized circuit graph degrees (number of edges per node)
    var D = numeric.diag(this._degrees(W));

    // graph Laplacian
    var L = numeric.sub(D, W);

    // pseudoinverse of the graph Laplacian approximated with the singular value decomposition method
    var pseudoinverse = this._pseudoinverse(L);

    // Compute the signal flow
    this.z = this.signalFlow(W, numeric.sub(adjacency_matrix, t_adjacency_matrix), pseudoinverse);

    // Compute the eigenvectors and eigenvalues
    this.e = this.eigen(D, L, maxiter);
  } catch (e) {
    console.log(e, e.stack);
    alert(e);
  }

  // Restore
  numeric.epsilon = numeric_epsilon;

  return this;
};

CircuitGraphAnalysis.prototype.signalFlow = function(W, io_difference, pseudoinverse) {
  // row sums of the symmetrized adjacency matrix, qualified by the sign of the I/O differences
  var b = numeric.mul(W, this._sign(io_difference)).map(function(row) {
    return [row.reduce(function(a, b) { return a + b; }, 0)];
  });

  // Signal flow:
  var z = numeric.dot(pseudoinverse, b).map(function(a) { return a[0]; }); // as a row

  return z;
};

/** Compute eigenvalues and eigenvectors of the graph Laplacian 'L',
 * normalized by the 1/sqrt(degree) of each node, 'D'. */
CircuitGraphAnalysis.prototype._eig = function(D, L, maxiter) {
  // Horizontal coordinates (the eigen spectra), normalized by degrees
  var D12 = D.map(function(row) {
    return row.map(function(a) {
      return 0 === a ? 0 : 1 / Math.sqrt(a);
    });
  });

  // var Q = numeric.dot(D12, numeric.dot(L, D12));
  // var eig = numeric.eig(Q);
  return numeric.eig(numeric.dot(D12, numeric.dot(L, D12)), maxiter);
};

CircuitGraphAnalysis.prototype.eigen = function(D, L, maxiter) {
  // eigenvalues and eigenvectors
  var eig = this._eig(D, L, maxiter);

  var sorted_lambda = eig.lambda.x.map(function(e, i) { return [i, e]; })
                                  .sort(function(a, b) { return a[1] - b[1]; });

  // remove eigenvalues that are practically zero
  var i = 0;
  while (sorted_lambda[i][1] < numeric.epsilon) {
    sorted_lambda.shift();
  }

  // make every row correspond to each eigenvector
  var X = numeric.transpose(eig.E.x);

  // return an array of [eigenvalue, eigenvector]
  return sorted_lambda.map(function(a) {
    return [a[1], X[a[0]]];
  });
};
