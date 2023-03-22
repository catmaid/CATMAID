
(function (CATMAID) {

  "use strict";

  class Nblaster {
    constructor(distThresholds, dotThresholds, cells, k) {
      this.distThresholds = distThresholds;
      this.dotThresholds = dotThresholds;
      this.cells = cells;
      this.k = k;

      this.worker = null;
    }

    async init() {
      this.worker = new CATMAID.PromiseWorker(
        new Worker(CATMAID.makeStaticURL('libs/nblast-wasm/nblast_wasm_worker.js'))
      );
      return this.worker.postMessage(["new", {
        distThresholds: this.distThresholds,
        dotThresholds: this.dotThresholds,
        cells: this.cells,
        k: this.k,
      }]);
    }

    async addNeuron(points, tangents, alphas) {
      return this.worker.postMessage(["addNeuron", { points, tangents, alphas }]);
    }

    async queryTarget(queryIdx, targetIdx, normalize, symmetry, useAlpha) {
      return this.worker.postMessage(["queryTarget", { queryIdx, targetIdx, normalize, symmetry, useAlpha }]);
    }

    async queriesTargets(queryIdxs, targetIdxs, normalize, symmetry, useAlpha, maxCentroidDist) {
      return this.worker.postMessage(["queriesTargets", {
        queryIdxs, targetIdxs, normalize, symmetry, useAlpha, maxCentroidDist
      }]);
    }

    async allVAll(normalize, symmetry, useAlpha, maxCentroidDist) {
      return this.worker.postMessage(["allVAll", {
          normalize, symmetry, useAlpha, maxCentroidDist
      }]);
    }
  }

  CATMAID.Nblaster = Nblaster;

})(CATMAID);
