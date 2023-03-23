
(function (CATMAID) {

  "use strict";

  class Nblaster {
    constructor() {
      this.worker = new CATMAID.PromiseWorker(
        new Worker(CATMAID.makeStaticURL('libs/nblast-wasm/nblast_wasm_worker.js'))
      );
    }

    async init(distThresholds, dotThresholds, cells, k) {
      return this.worker.postMessage(["new", {
        distThresholds,
        dotThresholds,
        cells,
        k,
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

  class NblastWidget extends InstanceRegistry {
    constructor() {
      this.widgetID = this.registerInstance();
      this.idPrefix = `nblast${this.widgetID}-`;

      this.qSkelSrc = new CATMAID.BasicSkeletonSource(this.getName() + " Query", {owner: this});
      this.tSkelSrc = new CATMAID.BasicSkeletonSource(this.getName() + " Target", {owner: this});

      this.content = null;

      this.nblaster = new Nblaster();
    }

    getName() {
      return "NBLAST " + this.widgetID;
    }

    getElId(suffix) {
      return `nblast${this.widgetID}-${suffix}`;
    }

    getElement(suffix) {
      document.getElementById(this.getElId(suffix));
    }

    destroy() {
      this.unregisterInstance();
      CATMAID.NeuronNameService.getInstance().unregister(this);
      this.qSkelSrc.destroy();
      this.tSkelSrc.destroy();
    }

    getK() {
      let el = this.getElement("k");
      return parseInt(el.value);
    }

    getNormalize() {
      let el = this.getElement("normalize");
      return el.checked;
    }

    getSymmetry() {
      let el = this.getElement("symmetry");
      return el.value;
    }

    getUseAlpha() {
      let el = this.getElement("alpha");
      return el.checked;
    }

    getWidgetConfiguration() {
      return {
        controlsID: this.getElId("controls"),
        createControls: (controls) => {

          // k number
          CATMAID.DOM.appendElement(controls, {
            id: this.getElId("k"),
            type: "numeric",
            label: "k:",
            title: "k",
            value: 5,
            step: 1,
            min: 2
          });

          // symmetry drop-down
          CATMAID.DOM.appendElement(controls, {
            id: this.getElId("symmetry"),
            type: "select",
            label: "Symmetry:",
            title: "Symmetry",
            vale: null,
            entries: [
              {title: "None", value: null},
              {title: "Arithmetic mean", value: "arithmetic_mean"},
              {title: "Geometric mean", value: "geometric_mean"},
              {title: "Harmonic mean", value: "harmonic_mean"},
              {title: "Mininum", value: "min"},
              {title: "Maximum", value: "max"}
            ]
          });

          // normalize checkbox
          CATMAID.DOM.appendElement(controls, {
            id: this.getElId("normalize"),
            type: "checkbox",
            label: "Normalize:",
            title: "Normalize",
            value: false,
          });

          // alpha checkbox
          CATMAID.DOM.appendElement(controls, {
            id: this.getElId("alpha"),
            type: "checkbox",
            label: "Use alpha:",
            title: "Use alpha",
            value: false
          });

        },
        contentID: this.getElId("content"),
        createContent: (content) => { this.content = content; },
        init: () => {

        }
      };
    }

    clear() {
      this.nblaster = new Nblaster();
      this.qSkelSrc.clear();
      this.tSkelSrc.clear();
    }


  }

  CATMAID.Nblaster = Nblaster;
  CATMAID.NblastWidget = NblastWidget;

})(CATMAID);
