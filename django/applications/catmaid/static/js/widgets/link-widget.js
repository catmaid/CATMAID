
(function(CATMAID) {

  "use strict";

  var LinkWidget = function() {
    this.widgetID = this.registerInstance();
    this.idPrefix = `link-widget${this.widgetID}-`;

    // The current edit mode
    this.mode = 'list';
    this.modes = ['list', 'add'];

    this.content = null;

    // Link edit properties
    this._initLinkEditParameters();

    // Whether or not the link addition has been initialized with the current
    // view.
    this.initNewLinkWithCurrentState = true;

    this.initLinkWithActiveSkeleton = true;
    this.initLinkWithLayout = true;
    this.initLinkWithWidgetSkeletons = true;
    this.initLinkWithWidgetSettings = true;
    this.ignoreLinkWidget = true;

    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);
  };

  $.extend(LinkWidget.prototype, new InstanceRegistry());

  LinkWidget.prototype._initLinkEditParameters = function() {
    this.linkEditAlias = CATMAID.DeepLink.makeUniqueId();
    this.linkEditIsPublic = true;
    this.linkEditX = null;
    this.linkEditY = null;
    this.linkEditZ = null;
    this.linkEditTreenodeId = null;
    this.linkEditConnectorId = null;
    this.linkEditSkeletonId = null;
    this.linkEditLayout = null;
    this.linkEditTool = project.getTool().toolname;
    this.linkEditShowHelp = false;
    this.linkEditMessage = null;
  };

  LinkWidget.prototype.getName = function() {
    return 'Link Widget ' + this.widgetID;
  };

  LinkWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var self = this;
        var tabNames = this.modes.map(function(m) {
          return LinkWidget.MODES[m].title;
        }, this);
        var tabs = CATMAID.DOM.addTabGroup(controls, '-links', tabNames);
        this.modes.forEach(function(mode, i) {
          var mode = LinkWidget.MODES[mode];
          var tab = tabs[mode.title];
          CATMAID.DOM.appendToTab(tab, mode.createControls(this));
          tab.dataset.index = i;
        }, this);
        this.controls = controls;
        this.tabControls = $(controls).tabs({
          active: this.modes.indexOf(this.mode),
          activate: function(event, ui) {
            var oldStepIndex = parseInt(ui.oldPanel.attr('data-index'), 10);
            var newStepIndex = parseInt(ui.newPanel.attr('data-index'), 10);

            var tabs = $(self.tabControls);
            var activeIndex = tabs.tabs('option', 'active');
            if (activeIndex !== self.modes.indexOf(self.mode)) {
              if (!self.setMode(self.modes[activeIndex])) {
                // Return to old tab if selection was unsuccessful
                if (oldStepIndex !== newStepIndex) {
                  $(event.target).tabs('option', 'active', oldStepIndex);
                }
              }
              self.update();
            }
          }
        });
      },
      class: 'link-widget',
      contentID: this.idPrefix + 'content',
      createContent: function(container) {
        this.content = container;
      },
      init: function() {
        this.update();
      },
      helpPath: 'link-widget.html',
    };
  };

  LinkWidget.prototype.handleActiveNodeChange = function() {
  };

  LinkWidget.prototype.destroy = function() {
    this.unregisterInstance();
    CATMAID.NeuronNameService.getInstance().unregister(this);
    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);
  };

  LinkWidget.prototype.refresh = function() {
    if (this.linkTable) {
      this.linkTable.ajax.reload();
    }
  };

  LinkWidget.prototype.addLinkToView = function() {
    let stackConfig = project.getStackAndStackGroupConfiguration();
    let params = {
      alias: this.linkEditAlias,
      is_public: this.linkEditIsPublic,
      location_x: this.linkEditX,
      location_y: this.linkEditY,
      location_z: this.linkEditZ,
      show_help: this.linkEditShowHelp,
      stacks: stackConfig.stacks.map((s,i) => [s, stackConfig.stackScaleLevels[i]]),
    };

    if (stackConfig.stackGroupId || stackConfig.stackGroupId === 0) {
      params.stack_group = stackConfig.stackGroupId;
      params.stack_group_scale_levels = stackConfig.stackGroupScaleLevels;
    }

    if (this.linkEditTreenodeId) {
      params.active_treenode_id = this.linkEditTreenodeId;
    }

    if (this.linkEditConnectorId) {
      params.active_connector_id = this.linkEditConnectorId;
    }

    if (this.linkEditSkeletonId) {
      params.active_skeleton_id = this.linkEditSkeletonId;
    }

    if (this.linkEditLayout) {
      params.layout = this.linkEditLayout;
    }

    if (this.linkEditTool) {
      params.tool = this.linkEditTool;
    }

    if (this.linkEditMessage) {
      params.message = this.linkEditMessage;
    }

    return CATMAID.fetch(`${project.id}/links/`, 'POST', params);
  };

  LinkWidget.prototype.setLinkEditParametersFromCurrentView = function() {
    this.linkEditX = project.coordinates.x;
    this.linkEditY = project.coordinates.y;
    this.linkEditZ = project.coordinates.z;
    let activeNode = SkeletonAnnotations.getActiveNodeId();
    if (this.initLinkWithActiveSkeleton && activeNode) {
      if (!SkeletonAnnotations.isRealNode(activeNode)) {
        activeNode = SkeletonAnnotations.getChildOfVirtualNode(activeNode);
        CATMAID.warn('Using child of active node. Consider using only an active skeleton!');
      }
      if (SkeletonAnnotations.getActiveNodeType() === SkeletonAnnotations.TYPE_NODE) {
        this.linkEditTreenodeId = activeNode;
        this.linkEditConnectorId = null;
        this.linkEditSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
      } else {
        this.linkEditTreenodeId = null;
        this.linkEditConnectorId = activeNode;
        this.linkEditSkeletonId = null;
      }
    } else {
      this.linkEditTreenodeId = null;
      this.linkEditConnectorId = null;
      this.linkEditSkeletonId = null;
    }
    if (this.initLinkWithLayout) {
      let ignoredWindowTitle = this.ignoreLinkWidget ? this.getName() : null;
      this.linkEditLayout = CATMAID.Layout.makeLayoutSpecForWindow(CATMAID.rootWindow,
          this.initLinkWithWidgetSkeletons, this.initLinkWithWidgetSettings, ignoredWindowTitle);
    } else {
      this.linkEditLayout = null;
    }
    this.linkEditTool = project.getTool().toolname;
  };

  LinkWidget.prototype.update = function() {
    // Clear content
    while (this.content.lastChild) {
      this.content.removeChild(this.content.lastChild);
    }
    var tabs = $(this.tabControls);
    var activeIndex = tabs.tabs('option', 'active');
    var widgetIndex = this.modes.indexOf(this.mode);
    if (activeIndex !== widgetIndex) {
      tabs.tabs('option', 'active', widgetIndex);
    }

    let mode = LinkWidget.MODES[this.mode];

    // Update actual content
    mode.createContent(this.content, this);
  };

  LinkWidget.prototype.setMode = function(mode) {
    var index = this.modes.indexOf(mode);
    if (index === -1) {
      throw new CATMAID.ValueError('Unknown Link Widget mode: ' + mode);
    }
    this.mode = mode;
    this.update();
    return true;
  };

  LinkWidget.MODES = {
    list: {
      title: 'Manage links',
      createControls: function(widget) {
        return [{
          type: 'button',
          label: 'Refresh links',
          title: 'Reload the displayed links',
          onclick: e => {
            widget.refresh();
          }
        }];
      },
      createContent: function(content, widget) {
        let linkTable = content.appendChild(document.createElement('table'));
        widget.linkTable = $(linkTable).DataTable({
          dom: '<"user-select">lrfphtip',
          paging: true,
          order: [[0, 'desc']],
          autoWidth: false,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: (data, callback, settings) => {
            CATMAID.fetch(`${project.id}/links/`)
              .then(linkData => {
                let skeletonIds = linkData.map(l => l.active_node).filter(skid => skid);
                return CATMAID.NeuronNameService.getInstance().registerAllFromList(this, skeletonIds)
                  .then(() => linkData);
              })
              .then(linkData => {
                callback({
                  draw: data.draw,
                  data: linkData,
                });
              })
              .catch(CATMAID.handleError);
          },
          columns: [
            {
              title: 'ID',
              data: 'id',
              class: "cm-center",
            },
            {
              title: 'User',
              data: 'user_id',
              class: "cm-center",
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user).login;
              }
            }, {
              title: 'Alias',
              data: 'alias',
              render: function(data, type, row, meta) {
                let url = window.location.origin + CATMAID.tools.urlJoin(window.location.pathname, CATMAID.tools.urlJoin(`${project.id}/links`, data));
                return `<a href="${url}" class="neuron-selection-link" data-role="select-alias" target="_blank">${data}</a>`;
              }
            }, {
              title: 'Private',
              data: 'is_public',
              class: "cm-center",
              render: function(data, type, row, meta) {
                return data ? 'No' : 'Yes';
              }
            }, {
              title: 'Location',
              data: 'location',
              class: "cm-center",
              render: function(data, type, row, meta) {
                if (typeof(row.location_x) !== "number" ||
                    typeof(row.location_y) !== "number" ||
                    typeof(row.location_z) !== "number") {
                  return '-';
                } else {
                  return `<a href="#" class="neuron-selection-link" data-role="select-loc">${row.location_x}, ${row.location_y}, ${row.location_y}</a>`;
                }
              }
            }, {
              title: 'Active Node',
              data: 'active_treenode',
              class: "cm-center",
              render: function(data, type, row, meta) {
                if (data) {
                  return '<a href="#" class="neuron-selection-link" data-role="select-treenode">' + data + '</a>';
                }
                return '-';
              }
            }, {
              title: 'Active Skeleton',
              data: 'active_skeleton',
              class: "cm-center",
              render: function(data, type, row, meta) {
                if (data) {
                  let name = CATMAID.NeuronNameService.getInstance().getName(data);
                  return '<a href="#" class="neuron-selection-link" data-role="select-skeleton">' + (name || data) + '</a>';
                }
                return '-';
              }
            }, {
              title: 'Connector',
              data: 'active_connector',
              class: "cm-center",
              render: function(data, type, row, meta) {
                if (data) {
                  return '<a href="#" class="neuron-selection-link" data-role="select-connector">' + data + '</a>';
                }
                return '-';
              }
            }, {
              title: 'Layout',
              data: 'layout',
              class: "cm-center",
              render: function(data, type, row, meta) {
                if (data) {
                  return `<a href="#" class="neuron-selection-link" data-role="view-layout" title="${data}">View</a>`;
                }
                return '-';
              }
            }, {
              title: 'Tool',
              data: 'tool',
              class: "cm-center",
              render: function(data, type, row, meta) {
                return data || '-';
              }
            }, {
              title: 'Show Help',
              data: 'show_help',
              class: "cm-center",
              render: function(data, type, row, meta) {
                return data ? 'Yes' : 'No';
              }
            }, {
              title: 'Message',
              data: 'message',
              render: function(data, type, row, meta) {
                return data;
              }
            }, {
              title: "Last update (UTC)",
              data: "edition_time",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = new Date(row.edition_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            }, {
              class: 'cm-center',
              searchable: false,
              orderable: false,
              render: function(data, type, row, meta) {
                return '<a href="#" data-role="load-layout"><i class="fa fa-external-link" style="color: dimgrey" title="Load layout"></i></a> ' +
                    '<a href="#" data-role="delete-link"><i class="fa fa-close" style="color: red" title="Delete link"></i></a>';
              },
            }
          ],
          language: {
            emptyTable: 'No links found',
          },
        }).on('click', 'a[data-role=select-loc]', function() {
          let data = widget.linkTable.row($(this).parents('tr')).data();
          project.moveTo(data.location_z, data.location_y, data.location_x);
        }).on('click', 'a[data-role=select-treenode]', function() {
          let data = widget.linkTable.row($(this).parents('tr')).data();
          SkeletonAnnotations.staticSelectNode(data.active_treenode);
        }).on('click', 'a[data-role=select-skeleton]', function() {
          let data = widget.linkTable.row($(this).parents('tr')).data();
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', data.active_skeleton);
        }).on('click', 'a[data-role=select-connector]', function() {
          let data = widget.linkTable.row($(this).parents('tr')).data();
          SkeletonAnnotations.staticSelectNode(data.active_connector);
        }).on('click', 'a[data-role=view-layout]', function() {
          let data = widget.linkTable.row($(this).parents('tr')).data();
          let dialog = new CATMAID.OptionsDialog(`Stored layout for stored link "${data.alias}"`);
          dialog.appendMessage(data.layout);
          dialog.show(400, 300);
        }).on('click', 'a[data-role=load-layout]', function() {
          let data = widget.linkTable.row($(this).parents('tr')).data();
          if (!confirm(`Replace (!) current layout with layout of link "${data.alias}"? This will close all open widgets.`)) return;
          let layout = new CATMAID.Layout(data.layout);
          CATMAID.switchToLayout(layout, true);
        }).on('click', 'a[data-role=delete-link]', function() {
          let data = widget.linkTable.row($(this).parents('tr')).data();
          if (!confirm(`Delete (!) link "${data.alias}"? This can't be undone.`)) return;
          CATMAID.fetch(`${project.id}/links/by-id/${data.id}`, 'DELETE')
            .then(e => {
              CATMAID.msg('Success', `Deleted link with ID ${e.deleted_id} and alias ${data.alias}`);
              widget.refresh();
            })
            .catch(CATMAID.handleError);
        });

        // Add title attributes to the header
        $('thead th:eq(0)', linkTable).attr('title', 'The ID of the deep link');
        $('thead th:eq(1)', linkTable).attr('title', 'The user who created the deep link');
        $('thead th:eq(2)', linkTable).attr('title', 'The skeletons this link references');
        $('thead th:eq(3)', linkTable).attr('title', 'Current visibility of the link');
        $('thead th:eq(4)', linkTable).attr('title', 'Last time this link was updated');
      },
    },
    add: {
      title: 'Add link',
      createControls: function(widget) {
        return [{
          type: 'checkbox',
          label: 'Active node',
          value: widget.initLinkWithActiveSkeleton,
          title: 'Should the active node be respected for the new link?',
          onclick: e => {
            widget.initLinkWithActiveSkeleton = e.target.checked;
          }
        }, {
          type: 'checkbox',
          label: 'Widget layout',
          value: widget.initLinkWithLayout,
          title: 'Should the current layout be respected for the new link?',
          onclick: e => {
            widget.initLinkWithLayout = e.target.checked;
          }
        }, {
          type: 'checkbox',
          label: 'Widget skeletons',
          value: widget.initLinkWithWidgetSkeletons,
          title: 'If enabled, the link will include all skeletons for each widget.',
          onclick: e => {
            widget.initLinkWithWidgetSkeletons = e.target.checked;
          }
        }, {
          type: 'checkbox',
          label: 'Widget settings',
          value: widget.initLinkWithWidgetSettings,
          title: 'Should the widget settings be included in the link?',
          onclick: e => {
            widget.initLinkWithWidgetSettings = e.target.checked;
          }
        }, {
          type: 'checkbox',
          label: 'Ignore link widget',
          value: widget.ignoreLinkWidget,
          title: 'If enabled, this link widget will be excluded from the link.',
          onclick: e => {
            widget.ignoreLinkWidget = e.target.checked;
          }
        }, {
          type: 'button',
          label: 'Init from current view',
          title: 'Populate properties for new link from current view, won\'t save the link yet.',
          onclick: e => {
            widget.setLinkEditParametersFromCurrentView();
            widget.update();
          }
        }, {
          type: 'button',
          label: 'Copy link to clipboard',
          title: 'Copy the URL to the current view to the user clipboard.',
          onclick: e => {
            let ignoredWindowTitle = widget.ignoreLinkWidget ? widget.getName() : null;
            let l = document.location;
            CATMAID.tools.copyToClipBoard(l.origin + l.pathname + project.createURL(
                widget.initLinkWithLayout, widget.initLinkWithWidgetSkeletons,
                widget.initLinkWithWidgetSettings, ignoredWindowTitle));
            CATMAID.msg('Success', 'URL copied to clipboard');
          }
        }];
      },
      createContent: function(content, widget) {
        let initNewLinkWithCurrentState = widget.initNewLinkWithCurrentState;
        if (initNewLinkWithCurrentState) {
          // Only do this the first time
          widget.initNewLinkWithCurrentState = false;
          widget.setLinkEditParametersFromCurrentView();
        }

        let infoParagraph1 = content.appendChild(document.createElement('p'));
        let msg = 'This view allows to add new links into the current project/dataset. Each link is accessible under an alias, unique in this project.';
        if (initNewLinkWithCurrentState) {
          msg += ' Initialized with the curremt view.';
        }
        infoParagraph1.appendChild(document.createTextNode(msg));

        let propertiesPanel = content.appendChild(document.createElement('p'));

        // Alias
        $(propertiesPanel).append(CATMAID.DOM.createInputSetting(
            'Alias',
            widget.linkEditAlias,
            'Alias for this link, unique in project, will becomepart of URL. By default a random unique UUID is generated.',
            function() {
              CATMAID.fetch(`${project.id}/links/${this.value}`, 'HEAD')
                .then(response => {
                  CATMAID.warn('A link with this alias exists already in this project');
                })
                .catch(error => {
                  CATMAID.msg('Alias checked', 'Link alias can be used');
                  widget.linkEditAlias = this.value;
                });
            }, widget.linkEditAlias));

        // Public
        $(propertiesPanel).append(CATMAID.DOM.createCheckboxSetting(
              "Visible to others",
              widget.linkEditIsPublic,
              "If enabled, this link is visible to everyone with access to this project.",
              function() {
                widget.linkEditIsPublic = this.checked;
              }));

        // Location
        let currentLoc = (typeof(widget.linkEditX) !== "number" ||
            typeof(widget.linkEditY) !== "number" ||
            typeof(widget.linkEditZ) !== "number") ?
            '' : [widget.linkEditX, widget.linkEditY, widget.linkEditZ].join(', ');

        $(propertiesPanel).append(CATMAID.DOM.createInputSetting(
            'Location',
            currentLoc,
            'The project coordinates (physical units) of the link location in format "X, Y, Z".',
            function() {
              try {
                let coords = this.value.trim().split(',').map(c => Number(c.trim()));
                if (coords.length !== 3) {
                  CATMAID.warn("Can't parse location, need 3 coordinates.");
                  return;
                } else if (coords.filter(c => Number.isNaN(c)).length > 0) {
                  CATMAID.warn("Can't parse location, need 3 numeric coordinates.");
                  return;
                }
                [widget.linkEditX, widget.linkEditY, widget.linkEditZ] = coords;
              } catch (e) {
                CATMAID.warn("Can't parse location");
              }
            }));

        // Active node
        let activeNodeSetting = CATMAID.DOM.createNumericInputSetting(
            "Active treenode ID (if any)",
            widget.linkEditTreenodeId || '',
            1,
            "ID of the active treenode for this link. If empty and no active skeleton is defined, no treenode will be active.",
            function() {
              if (this.value.trim().length === 0) {
                widget.linkEditTreenodeId = '';
              } else {
                widget.linkEditTreenodeId = parseInt(this.value, 10);
              }
            }, 0, '(none)');
        $(propertiesPanel).append(activeNodeSetting);
        let activeConnectorSetting = CATMAID.DOM.createNumericInputSetting(
            "Active connector ID (if any)",
            widget.linkEditConnectorId || '',
            1,
            "ID of the active connector for this link. Either a connector or a treenode/skeleton can be selected.",
            function() {
              if (this.value.trim().length === 0) {
                widget.linkEditConnectorId = '';
              } else {
                widget.linkEditConnectorId = parseInt(this.value, 10);
              }
            }, 0, '(none)');
        $(propertiesPanel).append(activeConnectorSetting);
        var activeNodeButton = $('<button/>').text('Get active node').click(function() {
          let activeNode = SkeletonAnnotations.getActiveNodeId();
          if (!activeNode) {
            CATMAID.warn('No node selected');
            return;
          }
          if (!SkeletonAnnotations.isRealNode(activeNode)) {
            activeNode = SkeletonAnnotations.getChildOfVirtualNode(activeNode);
            CATMAID.warn('Using child of active node. Consider using only an active skeleton!');
          }

          if (SkeletonAnnotations.getActiveNodeType() === SkeletonAnnotations.TYPE_NODE) {
            widget.linkEditTreenodeId = activeNode;
            widget.linkEditConnectorId = null;
            widget.linkEditSkeletonId = SkeletonAnnotations.getActiveSkeletonId();
          } else {
            widget.linkEditTreenodeId = null;
            widget.linkEditConnectorId = activeNode;
            widget.linkEditSkeletonId = null;
          }
          activeNodeSetting.find('input').val(widget.linkEditTreenodeId);
          activeConnectorSetting.find('input').val(widget.linkEditConnectorId);
        });
        $(propertiesPanel).append(CATMAID.DOM.createLabeledControl('', activeNodeButton));

        // Active skeleton
        let activeSkeletonSetting = CATMAID.DOM.createNumericInputSetting(
            "Active skeleton ID (if any)",
            widget.linkEditSkeletonId || '',
            1,
            "ID of the active skeleton. If defined and no active skeleton is defined, the closest node in this skeleton to the specified location will be selected.",
            function() {
              if (this.value.trim().length === 0) {
                widget.linkEditSkeletonId = '';
              } else {
                widget.linkEditSkeletonId = parseInt(this.value, 10);
              }
            }, 0, '(none)');
        $(propertiesPanel).append(activeSkeletonSetting);
        var activeSkeletonButton = $('<button/>').text('Get active skeleton').click(function() {
          let activeSkeleton = SkeletonAnnotations.getActiveSkeletonId();
          if (!activeSkeleton) {
            CATMAID.warn('No node selected');
            widget.linkEditSkeletonId = null;
          } else {
            widget.linkEditSkeletonId = activeSkeleton;
          }
          activeSkeletonSetting.find('input').val(widget.linkEditSkeletonId);
        });
        $(propertiesPanel).append(CATMAID.DOM.createLabeledControl('', activeSkeletonButton));

        // Show help
        $(propertiesPanel).append(CATMAID.DOM.createCheckboxSetting(
              "Show Help",
              widget.linkEditShowHelp,
              "If enabled, views opened with this link will show a small context help window.",
              function() {
                widget.linkEditShowHelp = this.checked;
              }));

        // Message
        $(propertiesPanel).append(CATMAID.DOM.createInputSetting(
              "Message",
              widget.linkEditMessage,
              "If provided, this message will be briefly displayed when a user opens this link.",
              function() {
                widget.linkEditMessage = this.value;
              }, '(none)'));

        // Tool
        $(propertiesPanel).append(CATMAID.DOM.createSelectSetting(
            "Enabled tool",
            {'No tool': '',
             'Navigator': 'navigator',
             'Tracing tool': 'tracingtool',
             'Ontology tool': 'ontologytool'},
            "The default tool box enabled for this link..",
            function() {
              widget.linkEditTool = this.value;
            },
            widget.linkEditTool || ''));

        // Layout
        $(propertiesPanel).append(CATMAID.DOM.createTextAreaSetting(
            'Layout',
            widget.linkEditLayout,
            'The layout to use for new view',
            function() {
              try {
                JSON.parse(this.value);
              } catch (e) {
                CATMAID.warn('Could not parse layout JSON');
                return;
              }
              widget.linkEditLayout = this.value;
            },
            3,
            70)
            );

        let savePanel = content.appendChild(document.createElement('p'));
        savePanel.classList.add('clear');
        let saveB = savePanel.appendChild(document.createElement('button'));
        saveB.appendChild(document.createTextNode('Add link'));

        saveB.addEventListener('click', function() {
          widget.addLinkToView()
            .then(response => {
              widget._initLinkEditParameters();
              CATMAID.msg('Success', `Added new link with alias "${response.alias}" and copied it to the clipboard.`);
              let l = window.location;
              let url = `${l.origin}${l.pathname}${project.id}/links/${response.alias}`;
              CATMAID.tools.copyToClipBoard(url);
              widget.update();
            })
            .catch(CATMAID.handleError);
        });
      },
    },
  };

  CATMAID.registerWidget({
    name: 'Link Widget',
    description: 'Create and manage sharable deep links into the dataset',
    key: 'link-widget',
    creator: LinkWidget,
  });

})(CATMAID);
