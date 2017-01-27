/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a new treenode viewer. It must be coupled to a treenode table: that's where it gets its nodes, sort
   * order and so on from.
   *
   * @param treenodeTable - the treenode table to which the viewer is coupled.
   * @constructor
   */
  var TreenodeViewer = function(treenodeTable)
  {
    this.widgetID = this.registerInstance();
    this.idPrefix = `treenode-viewer${this.widgetID}-`;

    this.treenodeTable = treenodeTable;
    this.MIN_WEBGL_CONTEXTS = 1;

    this.stackViewerGrid = null;  // instantiated in init()
  };

  TreenodeViewer.prototype = {};
  $.extend(TreenodeViewer.prototype, new InstanceRegistry());

  TreenodeViewer.prototype.getName = function() {
    return "Treenode Viewer " + this.widgetID;
  };

  TreenodeViewer.prototype.destroy = function() {
    this.stackViewerGrid.closeStackViewers();
    this.treenodeTable.treenodeViewer = null;
    document.getElementById(this.treenodeTable.idPrefix + 'viewer-button').value = 'Open Viewer';
    this.unregisterInstance();
  };

  TreenodeViewer.prototype.getWidgetConfiguration = function() {
    var self = this;
    return {
      helpText: "Treenode Viewer widget: Quickly view and compare treenodes selected in a treenode table",
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var nodeSource = document.createElement('p');
        nodeSource.innerText = 'Treenode source: ' + self.treenodeTable.getName();
        controls.append(nodeSource);
      },
      contentID: this.idPrefix + 'content',
      createContent: function(container) {
        // container.style.position = 'absolute';
      },
      init: function() {
        this.stackViewerGrid = new CATMAID.StackViewerGrid(self.idPrefix);
      }
    };
  };

  // Export widget
  CATMAID.TreenodeViewer = TreenodeViewer;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: 'treenode-viewer',
    creator: TreenodeViewer
  });
})(CATMAID);
