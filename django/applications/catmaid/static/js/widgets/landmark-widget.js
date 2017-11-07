/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a new Landmark Widget, optional with a set of initial landmark
   * groups. The widget is devided in a semantic space editor and a spatial
   * space editor.
   *
   * The semantic space allows to define new class instances of the class
   * "landmark", which represents a conceptual landmark, without any spatial
   * link. These landmark class instances can then be grouped into landmark
   * groups, which themselves are also class instasnces, but of type "landmark
   * group". Landmarks can be shared between groups. This allows to define e.g.
   * a region on the left and right brain hemisphere as landmark groups without
   * requiring both to have all landmarks.
   *
   * The spatial editor allows to define locations and to link them to
   * particular semantic landmarks.
   */
  var LandmarkWidget = function(options)
  {
    this.widgetID = this.registerInstance();
    this.idPrefix = `landmark-widget${this.widgetID}-`;

    // The displayed data table
    this.landmarkTable = null;

    // Data caches
    this.landmarks = null;
    this.landmarkIndex = null;
    this.landmarkGroups = null;

    // The set of currently selected landmark groups, acts as filter for
    // landmark table.
    this.selectedLandmarkGroups = new Set();

    // The current edit mode
    this.mode = 'semantic';
    this.modes = ['semantic', 'spatial'];
  };

  LandmarkWidget.prototype = {};
  $.extend(LandmarkWidget.prototype, new InstanceRegistry());

  LandmarkWidget.prototype.getName = function() {
    return "Landmarks " + this.widgetID;
  };

  LandmarkWidget.prototype.destroy = function() {
    this.unregisterInstance();
  };

  LandmarkWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var self = this;
        var tabNames = ['Semantic', 'Spatial links'];
        var tabs = CATMAID.DOM.addTabGroup(controls, '-landmarks', tabNames);
        this.modes.forEach(function(mode, i) {
          var mode = LandmarkWidget.MODES[mode];
          var tab = tabs[mode.title];
          CATMAID.DOM.appendToTab(tab, mode.createControls(this));
          tab.dataset.index = i;
        }, this);
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
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        this.content = content;
      },
      init: function() {
        this.update();
      },
      helpText: [
        '<p>Landmarks are semantic entities that describe a particular ',
        'location in a dataset. As a concept it can be found in different ',
        'data sets or even at differentlocations within one dataset.</p>'
      ].join('\n')
    };
  };

  LandmarkWidget.prototype.reload = function() {
    
  };

  LandmarkWidget.prototype.update = function() {
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

    // Update actual content
    let mode = LandmarkWidget.MODES[this.mode];
    mode.createContent(this.content, this);
  };

  LandmarkWidget.prototype.setMode = function(mode) {
    var index = this.modes.indexOf(mode);
    if (index === -1) {
      throw new CATMAID.ValueError('Unknown Landmark Widget mode: ' + mode);
    }
    this.mode = mode;
    this.update();
    return true;
  };

  /**
   * Select a landmark and display all linked locations below the landmark
   * table, if Semantic mode is active.
   */
  LandmarkWidget.prototype.selectLandmark = function(landmarkId) {
    if (this.mode === 'semantic') {
      
    }
  };

  /**
   * If the respective landmark is available from already retrieved data return
   * the landmark's name, otherwise return its ID.
   */
  LandmarkWidget.prototype.landmarkToString = function(landmarkId) {
    if (this.landmarkIndex) {
      var landmark = this.landmarkIndex.get(landmarkId);
      return landmark ? landmark.name : landmark.id;
    } else {
      return landmarkId;
    }
  };

  function addLandmarkToIndex(index, landmark) {
    index.set(landmark.id, landmark);
    return index;
  }

  LandmarkWidget.prototype.updateLandmarks = function() {
    var self = this;
    return CATMAID.fetch(project.id +  "/landmarks/", "GET")
      .then(function(result) {
        self.landmarks = result;
        self.landmarkIndex = result.reduce(addLandmarkToIndex, new Map());
        return result;
      });
  };

  LandmarkWidget.prototype.updateLandmarkGroups = function() {
    var self = this;
    return CATMAID.fetch(project.id +  "/landmarks/groups", "GET", {
        with_members: true
      })
      .then(function(result) {
        self.landmarkGroups = result;
        return result;
      });
  };

  /**
   * Return a promise that will either resolve with a new selection of group
   * members.
   */
  LandmarkWidget.prototype.editGroupMembers = function(landmarkGroup) {
    var prepare = this.landmarks ? Promise.resolve(this.landmarks) :
        this.updateLandmarks();
    return prepare
      .then(function(landmarks) {
        return new Promise(function(resolve, reject) {
          // Show a checkbox select widget
          let options = landmarks.map(function(lm) {
            return {
              title: lm.name,
              value: lm.id
            };
          });
          var dialog = new CATMAID.OptionsDialog("Edit group membership");
          dialog.appendMessage("Select all landmarks that should be part of " +
            "landmark group \"" + landmarkGroup.name + "\" (" +
            landmarkGroup.id + ").");
          var memberPanel = CATMAID.DOM.createCheckboxSelectPanel(options,
              landmarkGroup.members, true);
          dialog.appendChild(memberPanel);
          dialog.onOK = function() {
            var selectedLandmarkInputs = memberPanel.querySelectorAll('input[type=checkbox]');
            var selectedLandmarks = [];
            selectedLandmarkInputs.forEach(function(elem) {
              if (elem.checked) {
                selectedLandmarks.push(parseInt(elem.value, 10));
              }
            });
            resolve(selectedLandmarks);
          };
          dialog.onCancel = function() {
            resolve(null);
          };

          dialog.show(300, 300);
        });
      })
      .then(function(selectedLandmarks) {
        if (selectedLandmarks === null) {
          // Canceled by user
          return null;
        }
        return CATMAID.Landmarks.updateGroupMembers(project.id,
            landmarkGroup.id, selectedLandmarks);
      });
  };

  LandmarkWidget.MODES = {
    semantic: {
      title: 'Semantic',
      createControls: function(target) {
        var self = this;
        let newLandmarkGroupSection = document.createElement('span');
        newLandmarkGroupSection.classList.add('section-header');
        newLandmarkGroupSection.appendChild(document.createTextNode('New landmark group'));

        let newLandmarkSection = document.createElement('span');
        newLandmarkSection.classList.add('section-header');
        newLandmarkSection.appendChild(document.createTextNode('New landmark'));
        var state = {};
        return [
          {
            type: 'button',
            label: 'Refresh',
            onclick: function() {
              target.update();
            }
          },
          {
            type: 'child',
            element: newLandmarkSection
          },
          {
            type: 'text',
            label: 'Name',
            title: 'The name of the new landmark',
            value: '',
            length: 8,
            onchange: function() {
              // Check if this landmark exists already
              state.newLandmarkName = this.value;
            }
          },
          {
            type: 'button',
            label: 'Add',
            onclick: function() {
              CATMAID.Landmarks.add(project.id, state.newLandmarkName)
                .then(function(newLandmark) {
                  CATMAID.msg("Success", "Added landmark " + newLandmark.id);
                  target.update();
                })
                .catch(CATMAID.handleError);
            }
          },
          {
            type: 'child',
            element: newLandmarkGroupSection
          },
          {
            type: 'text',
            label: 'Name',
            title: 'The name of the new landmark group',
            value: '',
            length: 8,
            onchange: function() {
              state.newLandmarkGroupName = this.value;
            }
          },
          {
            type: 'button',
            label: 'Add group',
            onclick: function() {
              CATMAID.Landmarks.addGroup(project.id, state.newLandmarkGroupName)
                .then(function(newGroup) {
                  CATMAID.msg("Success", "Added landmark group " + newGroup.id);
                  target.update();
                })
                .catch(CATMAID.handleError);
            }
          }
        ];
      },
      createContent: function(content, widget) {
        var landmarkGroupHeader = content.appendChild(document.createElement('h1'));
        landmarkGroupHeader.appendChild(document.createTextNode('Landmark groups'));

        // Add table with landmark groups
        var landmarkGroupTableWrapper = document.createElement('div');
        landmarkGroupTableWrapper.classList.add('container');
        var landmarkGroupTable = document.createElement('table');
        landmarkGroupTableWrapper.appendChild(landmarkGroupTable);
        content.appendChild(landmarkGroupTableWrapper);
        var landmarkGroupDataTable = $(landmarkGroupTable).DataTable({
          dom: "lfrtip",
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            widget.updateLandmarkGroups()
              .then(function(result) {
                callback({
                  draw: data.draw,
                  data: result,
                  recordsTotal: result.length,
                  recordsFiltered: result.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [],
          columns: [
            {
              data: "id",
              title: "Id",
              orderable: false,
              render: function(data, type, row, meta) {
                return row.id;
              }
            },
            {
              data: "name",
              title: "Name",
              orderable: true,
              render: function(data, type, row, meta) {
                if ("display") {
                  return '<a href="#" data-action="select-group" data-group-id="' +
                      row.id + '" >' + row.name + '</a>';
                } else {
                  return row.name;
                }
              }
            },
            {
              data: "user",
              title: "User",
              orderable: true,
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user).login;
              }
            },
            {
              data: "creation_time",
              title: "Created on (UTC)",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = CATMAID.tools.isoStringToDate(row.creation_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            },
            {
              data: "edition_time",
              title: "Last edited on (UTC)",
              class: "cm-center",
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = CATMAID.tools.isoStringToDate(row.edition_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            },
            {
              data: "members",
              title: "Members",
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  if (data.length === 0) {
                    return '<a href="#" data-action="edit-group-members">(none)</a>';
                  } else {
                    var namedLandmarks = data.map(function(landmarkId) {
                      return widget.landmarkToString(landmarkId);
                    });
                    return '<a href="#" data-action="edit-group-members">' +
                      namedLandmarks.join(', ') + '</a>';
                  }
                } else {
                  return data;
                }
              }
            },
            {
              title: "Action",
              orderable: false,
              class: "cm-center",
              render: function(data, type, row, meta) {
                return '<a href="#" data-action="select">Select</a> <a href="#" data-group-id="' +
                    row.id + '" data-action="delete">Delete</a>';
              }
            }
          ],
        }).on('dblclick', 'tr', function(e) {
          var data = landmarkGroupDataTable.row(this).data();
          if (data) {
            var table = $(this).closest('table');
            var tr = $(this).closest('tr');
            var data =  $(table).DataTable().row(tr).data();

            var groupId = parseInt(this.dataset.groupId, 10);

            // Toggle landmark group selection state
            if (widget.selectedLandmarkGroups.has(data.id)) {
              widget.selectedLandmarkGroups.delete(data.id);
            } else {
              widget.selectedLandmarkGroups.add(data.id);
            }
            widget.update();
          }
        }).on('click', 'a[data-action=select-group]', function() {
          var groupId = parseInt(this.dataset.groupId, 10);
          widget.selectedLandmarkGroups.add(groupId);
          widget.update();
        }).on('click', 'a[data-action=delete]', function() {
          var groupId = parseInt(this.dataset.groupId, 10);
          if (!confirm("Are you sure you want to delete landmark group " + groupId + "?")) {
            return;
          }
          CATMAID.Landmarks.deleteGroup(project.id, groupId)
            .then(function() {
              CATMAID.msg("Success", "Group " + groupId + " successfully deleted");
              landmarkGroupDataTable.ajax.reload();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-action=edit-group-members]', function() {
          var table = $(this).closest('table');
          var tr = $(this).closest('tr');
          var data =  $(table).DataTable().row(tr).data();

          // To edit group memberships an extra dialog will be shown
          widget.editGroupMembers(data)
            .then(function(updatedGroup) {
              if (updatedGroup !== null) {
                CATMAID.msg("Success", "Group updated");
                widget.update();
              }
            });
        });

        // Add table with landmarks
        var landmarkHeader = content.appendChild(document.createElement('h1'));
        landmarkHeader.appendChild(document.createTextNode('Landmarks'));

        // Add table with landmark groups
        var landmarkTable = document.createElement('table');
        var landmarkTableWrapper = document.createElement('div');
        landmarkTableWrapper.classList.add('container');
        landmarkTableWrapper.appendChild(landmarkTable);
        content.appendChild(landmarkTableWrapper);
        var landmarkDataTable = $(landmarkTable).DataTable({
          dom: "lfrtip",
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            widget.updateLandmarks()
              .then(function(result) {
                // Update landmark group table, so that newly retrieved landmark
                // names can be used.
                landmarkGroupDataTable.rows().invalidate();
                // Call table update
                callback({
                  draw: data.draw,
                  data: result,
                  recordsTotal: result.length,
                  recordsFiltered: result.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [],
          columns: [
            {
              data: "id",
              title: "Id",
              orderable: false,
              render: function(data, type, row, meta) {
                return row.id;
              }
            },
            {
              data: "name",
              title: "Name",
              orderable: true,
              render: function(data, type, row, meta) {
                if ("display") {
                  return '<a href="#" data-action="select-landmark" data-id="' +
                      row.id + '" >' + row.name + '</a>';
                } else {
                  return row.name;
                }
              }
            },
            {
              data: "user",
              title: "User",
              orderable: true,
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(row.user).login;
              }
            },
            {
              data: "creation_time",
              title: "Created on (UTC)",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = CATMAID.tools.isoStringToDate(row.creation_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            },
            {
              data: "edition_time",
              title: "Last edited on (UTC)",
              class: "cm-center",
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  var date = CATMAID.tools.isoStringToDate(row.edition_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            },
            {
              title: "Action",
              class: "cm-center",
              orderable: false,
              render: function(data, type, row, meta) {
                return '<a href="#" data-action="select">Select</a> <a href="#" data-id="' +
                    row.id + '" data-action="delete">Delete</a>';
              }
            }
          ],
        }).on('dblclick', 'tr', function(e) {
          var data = landmarkDataTable.row(this).data();
          if (data) {
            var table = $(this).closest('table');
            var tr = $(this).closest('tr');
            var data =  $(table).DataTable().row(tr).data();

            var id = parseInt(this.dataset.id, 10);

            // Toggle landmark group selection state
            widget.selectLandmark(data.id);
          }
        }).on('click', 'a[data-action=select-group]', function() {
          var id = parseInt(this.dataset.id, 10);
          widget.selectLandmark(id);
        }).on('click', 'a[data-action=delete]', function() {
          var id = parseInt(this.dataset.id, 10);
          if (!confirm("Are you sure you want to delete landmark " + id + "?")) {
            return;
          }
          CATMAID.Landmarks.delete(project.id, id)
            .then(function() {
              CATMAID.msg("Success", "Landmark " + id + " successfully deleted");
              landmarkDataTable.ajax.reload();
            })
            .catch(CATMAID.handleError);
        });
      }
    },
    spatial: {
      title: 'Spatial links',
      createControls: function(target) {
        return [document.createElement('span')];
      },
      createContent: function(content, widget) {
        content.appendChild(document.createElement('p'))
          .appendChild(document.createTextNode('Link physical locations to ' +
            'landmarks to define local spaces. These can be used to compare ' +
            'other spatial elements (like skeletons) between landmark groups'));
      }
    }
  };

  // Export widget
  CATMAID.LandmarkWidget = LandmarkWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Landmarks",
    description: "Show and manage landmark locations",
    key: "landmarks",
    creator: LandmarkWidget
  });

})(CATMAID);
