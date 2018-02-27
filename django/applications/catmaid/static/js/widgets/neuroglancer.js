/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var NeuroglancerWidget = function (options) {
    this.widgetID = this.registerInstance();
    this.idPrefix = `neuroglancer-widget${this.widgetID}-`;
    this.ngWind = null;
    project.on(CATMAID.Project.EVENT_LOCATION_CHANGED, this.handlelLocationChange, this);
  };

  NeuroglancerWidget.prototype = {};
  $.extend(NeuroglancerWidget.prototype, new InstanceRegistry());

  NeuroglancerWidget.prototype.getName = function() {
    return "Neuroglancer " + this.widgetID;
  };

  NeuroglancerWidget.prototype.destroy = function() {
    project.off(CATMAID.Project.EVENT_LOCATION_CHANGED, this.handlelLocationChange, this);
    this.unregisterInstance();
  };

  NeuroglancerWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        // var self = this;
        // var tabNames = this.modes.map(function(m) {
        //   return NeuroglancerWidget.MODES[m].title;
        // }, this);
        // var tabs = CATMAID.DOM.addTabGroup(controls, '-landmarks', tabNames);
        // this.modes.forEach(function(mode, i) {
        //   var mode = NeuroglancerWidget.MODES[mode];
        //   var tab = tabs[mode.title];
        //   CATMAID.DOM.appendToTab(tab, mode.createControls(this));
        //   tab.dataset.index = i;
        // }, this);
        this.controls = controls;
        // this.tabControls = $(controls).tabs({
        //   active: this.modes.indexOf(this.mode),
        //   activate: function(event, ui) {
        //     var oldStepIndex = parseInt(ui.oldPanel.attr('data-index'), 10);
        //     var newStepIndex = parseInt(ui.newPanel.attr('data-index'), 10);

        //     var tabs = $(self.tabControls);
        //     var activeIndex = tabs.tabs('option', 'active');
        //     if (activeIndex !== self.modes.indexOf(self.mode)) {
        //       if (!self.setMode(self.modes[activeIndex])) {
        //         // Return to old tab if selection was unsuccessful
        //         if (oldStepIndex !== newStepIndex) {
        //           $(event.target).tabs('option', 'active', oldStepIndex);
        //         }
        //       }
        //       self.update();
        //     }
        //   }
        // });
      },
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        // var ngURL = this.getNeuroglancerURL();
        // $(content)
        //   .append($('<iframe>').attr('src', ngURL)
        //     .css('height', '100%')
        //     .css('width', '100%'));
      },
      init: function (win) {
        this.ngWindow = window.open(this.getNeuroglancerURL());
      },
      helpText: "",
    };
  };

  NeuroglancerWidget.prototype.handlelLocationChange = function () {
    this.ngWindow.location.hash = this.getNeuroglancerHash();
  };

  NeuroglancerWidget.prototype.getNeuroglancerURL = function () {
    return CATMAID.makeURL("neuroglancer#" + this.getNeuroglancerHash());
  };

  NeuroglancerWidget.prototype.getNeuroglancerHash = function () {
    var sv = project.getStackViewers()[0];
    var stack = sv.primaryStack;
    var ngStackURL = (new URL(window.location).origin) + CATMAID.makeURL([
        project.id,
        stack.id,
        stack.mirrors[sv.getLayer('TileLayer').mirrorIndex].id
      ].join('/'));
    var projCoord = sv.projectCoordinates();
    var stackCoord = [
      stack.projectToStackX(projCoord.z, projCoord.y, projCoord.x),
      stack.projectToStackY(projCoord.z, projCoord.y, projCoord.x),
      stack.projectToStackZ(projCoord.z, projCoord.y, projCoord.x),
    ];
    var voxCoords = stackCoord.join('_');
    var voxSize = [stack.resolution.x, stack.resolution.y, stack.resolution.z].join('_');
    var zoomFactor = Math.pow(2, sv.s) * stack.resolution.x;
    return "!{'layers':{'" + stack.title + "':{'type':'image'_'source':'catmaid://" +
              ngStackURL + "'}}"
        + "_'navigation':{'pose':{'position':{"
          + "'voxelSize':[" + voxSize + "]_"
          + "'voxelCoordinates':[" + voxCoords + "]_"
          + "'zoomFactor':" + zoomFactor + "}}}}";
  }

  NeuroglancerWidget.prototype.refresh = function() {
  };

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Neuroglancer",
    description: "Open a Neuroglancer viewer for all open stacks",
    key: "neuroglancer",
    creator: NeuroglancerWidget
  });

  CATMAID.NeuroglancerWidget = NeuroglancerWidget;

})(CATMAID);
