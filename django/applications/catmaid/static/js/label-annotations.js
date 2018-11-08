(function (CATMAID) {

  "use strict";

  class LabelAnnotations {
    constructor() {
      this.managers = new Map();
      this.active = undefined;
    }

    activate(stackID) {
      this.active = stackID;
    }

    clear() {
      for (const [_stack, manager] of this.managers.entries()) manager.unregister();
      this.managers.clear();
      this.active = undefined;
    }

    get(stack) {
      let manager = this.managers.get(stack.id);

      if (!manager) {
        manager = new LabelStackAnnotations(stack);
        this.managers.set(stack.id, manager);
      }

      return manager;
    }
  }

  CATMAID.LabelAnnotations = new LabelAnnotations();

  CATMAID.Init.on(CATMAID.Init.EVENT_PROJECT_CHANGED, CATMAID.LabelAnnotations.clear, CATMAID.LabelAnnotations);


  const LABEL_FILTER_KEY = 'Object Label Color Map';

  class LabelStackAnnotations {
    constructor(
      stack
    ) {
      this.stack = stack;
      this.activeLabelID = undefined;
      this.specialLabels = {
        background: 0,
      };
      if (this.stack.metadata &&
          this.stack.metadata.catmaidLabelMeta &&
          this.stack.metadata.catmaidLabelMeta.specialLabels) {
        $.extend(this.specialLabels, this.stack.metadata.catmaidLabelMeta.specialLabels);
      }
      this.stackLayerFilters = new Map();

      project.on(CATMAID.Project.EVENT_STACKVIEW_ADDED,
          this.registerStackViewerLayers, this);
      CATMAID.StackViewer.on(CATMAID.StackViewer.EVENT_STACK_LAYER_ADDED,
          this.registerStackLayer, this);
      CATMAID.StackViewer.on(CATMAID.StackViewer.EVENT_STACK_LAYER_REMOVED,
          this.unregisterStackLayer, this);
    }

    unregister() {
      project.off(CATMAID.Project.EVENT_STACKVIEW_ADDED,
          this.registerStackViewerLayers, this);
      CATMAID.StackViewer.off(CATMAID.StackViewer.EVENT_STACK_LAYER_ADDED,
          this.registerStackLayer, this);
      CATMAID.StackViewer.off(CATMAID.StackViewer.EVENT_STACK_LAYER_REMOVED,
          this.unregisterStackLayer, this);
      this.stackLayerFilters.clear();
    }

    activateLabel(labelID) {
      this.activeLabelID = labelID;

      for (const [stackLayer, filter] of this.stackLayerFilters.entries()) {
        this.updateFilter(filter);
        stackLayer.redraw();
        stackLayer.stackViewer.layercontrol.refresh();
      }
    }

    registerAllStackLayers() {
      for (const stackViewer of project.getStackViewers()) {
        this.registerStackViewerLayers(stackViewer);
      }
    }

    registerStackViewerLayers(stackViewer) {
      for (const stackLayer of stackViewer.getLayersOfType(CATMAID.StackLayer)) {
        this.registerStackLayer(stackLayer, stackViewer);
      }
    }

    registerStackLayer(stackLayer, stackViewer) {
      if (this.stack.id !== stackLayer.stack.id) return;

      let layerFilters = stackLayer.getAvailableFilters ? stackLayer.getAvailableFilters() : [];
      if (LABEL_FILTER_KEY in layerFilters && !this.stackLayerFilters.has(stackLayer)) {
        stackLayer.setBlendMode('add');
        stackLayer.setInterpolationMode(false);  // Nearest neighbor interpolation.
        stackLayer.isHideable = true;
        let filter = new (layerFilters[LABEL_FILTER_KEY])();
        this.updateFilter(filter);
        stackLayer.addFilter(filter);
        this.stackLayerFilters.set(stackLayer, filter);

        // TODO: coupling state refresh with stack viewer.
        stackLayer.redraw();
        stackViewer.layercontrol.refresh();
      }
    }

    unregisterStackLayer(stackLayer, stackViewer) {
      if (this.stack.id !== stackLayer.stack.id) return;

      this.stackLayerFilters.delete(stackLayer);
    }

    updateFilter(filter) {
      filter.pixiFilter.backgroundLabel = CATMAID.PixiLayer.Filters.int2arr(
        this.specialLabels.background);
      filter.pixiFilter.unknownLabel = typeof this.activeLabelID === 'undefined' ?
        [-1, -1, -1, -1] :
        CATMAID.PixiLayer.Filters.int2arr(this.activeLabelID);
    }
  }

  CATMAID.LabelStackAnnotations = LabelStackAnnotations;

})(CATMAID);
