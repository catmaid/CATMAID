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
    if (!treenodeTable) {
      throw new CATMAID.ValueError("The treenode viewer can only be opened " +
        "together with a treenode table");
    }
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

    if (this.treenodeTable) {
      var tableViewerButton = document.getElementById(this.treenodeTable.idPrefix + 'viewer-button');
      if (tableViewerButton) {
        tableViewerButton.value = 'Open Viewer';
      }
      this.treenodeTable.treenodeViewer = null;
    }

    this.unregisterInstance();
  };

  TreenodeViewer.prototype.getWidgetConfiguration = function() {
    var self = this;
    return {
      helpText: "Treenode Viewer widget: Quickly view and compare treenodes selected in a treenode table",
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var nodeSource = document.createElement('p');
        nodeSource.setAttribute('id', self.idPrefix + 'node-source');
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
    name: "Treenode Viewer",
    description: "Display all or a subset of a skeleton's treenodes",
    key: 'treenode-viewer',
    creator: TreenodeViewer
  });
})(CATMAID);
