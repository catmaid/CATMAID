(function (CATMAID) {

  "use strict";

  class LabelAnnotations {
    constructor() {
      this.groupManagingStack = new Map();
      this.managers = new Map();
      this.active = undefined;
    }

    activate(stackID) {
      this.active = stackID;
    }

    clear() {
      for (const [_stack, manager] of this.managers.entries()) manager.unregister();
      this.managers.clear();
      this.groupManagingStack.clear();
      this.active = undefined;
    }

    get(stack) {
      let manager = this.managers.get(stack.id);

      if (!manager) {
        // Find all stack groups to which this stack belongs.
        return CATMAID.fetch(project.id + '/stack/' + stack.id + '/groups')
            .then(response =>
              // Get the info of all of these groups.
              Promise.all(response.stack_group_ids.map(
                  sg_id => CATMAID.fetch(project.id + '/stackgroup/' + sg_id + '/info')))
            )
            .then(sg_infos => {
              // Find stack groups where this stack is an (ortho)view.
              let ortho_sgs = sg_infos
                  .filter(sg_info => sg_info.stacks
                      .find(s => s.id === stack.id)
                      .relation === 'view');

              // Find if an existing manager for any of these stack groups exists.
              let managing_stack_id = ortho_sgs.find(sg => this.groupManagingStack.get(sg.id));

              if (managing_stack_id !== undefined) {
                manager = this.managers.get(managing_stack_id);
              } else {
                // If no manager exists, create a new one.
                managing_stack_id = stack.id;
                manager = new LabelStackAnnotations(stack);
                ortho_sgs.forEach(sg => this.groupManagingStack.set(sg.id, managing_stack_id));
                // Add all other stack (ortho)views in all (ortho)view groups
                // to this manager.
                ortho_sgs.forEach(sg => sg.stacks
                    .filter(s => s.relation === 'view')
                    .forEach(s => manager.addStackID(s.id)));
                this.managers.set(stack.id, manager);
              }

              return manager;
            });
      }

      return Promise.resolve(manager);
    }
  }

  CATMAID.LabelAnnotations = new LabelAnnotations();

  CATMAID.Init.on(CATMAID.Init.EVENT_PROJECT_CHANGED, CATMAID.LabelAnnotations.clear, CATMAID.LabelAnnotations);


  const LABEL_FILTER_KEY = 'Object Label Color Map';

  const SPECIAL_LABELS = {
    background: 0,
  };

  class LabelStackAnnotations {
    constructor(
      primaryStack
    ) {
      this.primaryStack = primaryStack;
      this.stackIDs = new Set([this.primaryStack.id]);
      this.activeLabelID = undefined;

      this.specialLabels = Object.assign({}, SPECIAL_LABELS, this.primaryStack.labelMetadata());
      this.stackLayerFilters = new Map();

      project.on(CATMAID.Project.EVENT_STACKVIEW_ADDED,
          this.registerStackViewerLayers, this);
      CATMAID.StackViewer.on(CATMAID.StackViewer.EVENT_STACK_LAYER_ADDED,
          this.registerStackLayer, this);
      CATMAID.StackViewer.on(CATMAID.StackViewer.EVENT_STACK_LAYER_REMOVED,
          this.unregisterStackLayer, this);

      this.registerAllStackLayers();
    }

    addStackID(stackID) {
      this.stackIDs.add(stackID);
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
      if (!this.stackIDs.has(stackLayer.stack.id)) return;

      let layerFilters = stackLayer.getAvailableFilters ? stackLayer.getAvailableFilters() : [];
      if (LABEL_FILTER_KEY in layerFilters && !this.stackLayerFilters.has(stackLayer)) {
        stackLayer.setBlendMode('add');
        stackLayer.setInterpolationMode(CATMAID.StackLayer.INTERPOLATION_MODES.NEAREST);
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
      if (!this.stackIDs.has(stackLayer.stack.id)) return;

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
