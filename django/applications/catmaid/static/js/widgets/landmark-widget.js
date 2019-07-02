/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a new Landmark Widget, optional with a set of initial landmark
   * groups. The widget allows to create landmarks, landmark groups and link
   * both to points in project space.
   */
  var LandmarkWidget = function(options)
  {
    ++LandmarkWidget.nInstances;
    this.widgetID = this.registerInstance();
    this.idPrefix = `landmark-widget${this.widgetID}-`;

    // The displayed data tables
    this.landmarkDataTable = null;

    // Data caches
    this.landmarks = null;
    // Maps landmark IDs to landmark objects.
    this.landmarkIndex = null;
    // Maps landmark lowercase names to landmark objects.
    this.landmarkNameIndex = null;
    // Maps landmark group IDs to landmark group objects.
    this.landmarkGroups = null;
    // Maps landmark IDs to the groups the landmark is a member of.
    this.landmarkGroupMemberships = null;
    // Maps landmark group IDs to landmark group objects.
    this.landmarkGroupIndex = null;

    // Optionally, landmarks from other CATMAID APIs can be used, which require
    // their own index.
    this.sourceLandmarks = null;
    this.sourceLandmarkIndex = null;
    this.sourceLandmarkNameIndex = null;
    this.sourceLandmarkGroups = null;
    this.sourceLandmarkGroupMemberships = null;
    this.sourceLandmarkGroupIndex = null;

    // A list of selected files to import
    this.filesToImport = [];
    // How many lines to skip during import
    this.importCSVLineSkip = 1;
    // Whether to allow import into non-empty groups
    this.importAllowNonEmptyGroups = false;
    // Whether to automatically create non-existing groups
    this.importCreateNonExistingGroups = true;
    // Whether to allow use of existing landmarks
    this.importReuseExistingLandmarks = false;

    // The set of currently selected landmark groups, acts as filter for
    // landmark table.
    this.selectedLandmarkGroups = new Set();
    this.selectedLandmarks = new Set();

    // All current display transformations
    this.displayTransformations = [];

    // All currently available 3D Viewers and whether they are a render target
    // for landmark transformations.
    this.targeted3dViewerNames = new Map();
    // Whether reverse point matches should be added to group transformations
    this.useReversePointMatches = true;
    // Whether to show landmark layers
    this.showLandmarkLayers = true;
    // Whether skeleton colors should be overridden
    this.overrideColor = false;
    // Override color and alpha, used if overrideColor is true.
    this._overrideColor = '#3FFFD8';
    this._overrideAlpha = 0.8;
    // A node scaling factor to help distinguish nodes from regular ones.
    this.nodeScaling = 1.5;

    // A landmark group currently edited in the edit tab
    this.editLandmarkGroup = null;
    // Whether reference lines are on by default
    this.editShowReferenceLines = true;
    // Wheter a landmark location should be updated when it already exists.
    this.editUpdateExistingLandmarkLocations = false;
    // Whether the currently edited group should default to group A in a new
    // group link configuration.
    this.editGroupDefaultsToAInLink = true;
    // The default landmark group relation.
    this.editLinkRelation = 'adjacent_to';

    // Whether to show transformation options (and apply transformations) in the
    // first place.
    this.applyTransformation = true;
    // Whether to allow use of existing landmarks
    this.groupsReuseExistingLandmarks = false;
    // Whether to allow the creation of Display Transformations from other
    // projects and other CATMAID instances.
    this.showOtherProjectOptions = false;
    // Whetehr or not to show options to add more than one source/target group
    // mapping.
    this.showMultiMappingOptions = false;

    // A list of relations that are allowed between landmark groups
    this.allowedRelationNames = new Set(['mirror_of', 'adjacent_to', 'part_of']);

    // The current edit mode
    this.mode = 'display';
    this.modes = ['display', 'landmarks', 'edit', 'groups', 'import'];

    // Some parts of the widget need to update when skeleton sources are added
    // or removed.
    CATMAID.skeletonListSources.on(CATMAID.SkeletonSourceManager.EVENT_SOURCE_ADDED,
        this.handleUpdatedSkeletonSources, this);
    CATMAID.skeletonListSources.on(CATMAID.SkeletonSourceManager.EVENT_SOURCE_REMOVED,
        this.handleUpdatedSkeletonSources, this);
  };


  LandmarkWidget.prototype = {};
  LandmarkWidget.prototype.constructor = LandmarkWidget;
  $.extend(LandmarkWidget.prototype, new InstanceRegistry());

  // Count active instances
  LandmarkWidget.nInstances = 0;

  LandmarkWidget.prototype.getName = function() {
    return "Landmarks " + this.widgetID;
  };

  LandmarkWidget.prototype.destroy = function() {
    --LandmarkWidget.nInstances;
    this.unregisterInstance();
    CATMAID.skeletonListSources.off(CATMAID.SkeletonSourceManager.EVENT_SOURCE_ADDED,
        this.handleUpdatedSkeletonSources, this);
    CATMAID.skeletonListSources.off(CATMAID.SkeletonSourceManager.EVENT_SOURCE_REMOVED,
        this.handleUpdatedSkeletonSources, this);
    this.removeDisplay();

    if (this.displayTransformations && this.displayTransformations.length > 0) {
      this.displayTransformations.length = 0;
      CATMAID.Landmarks.trigger(CATMAID.Landmarks.EVENT_DISPLAY_TRANSFORM_REMOVED);
    }

    // Reset original reference lines setting when the last landmark widget
    // closes.
    if (LandmarkWidget.nInstances === 0) {
      project.getStackViewers().forEach(function(s) {
        s.showReferenceLines(CATMAID.StackViewer.Settings.session.display_stack_reference_lines);
      });
    }
  };

  LandmarkWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var self = this;
        var tabNames = this.modes.map(function(m) {
          return LandmarkWidget.MODES[m].title;
        }, this);
        var tabs = CATMAID.DOM.addTabGroup(controls, '-landmarks', tabNames);
        this.modes.forEach(function(mode, i) {
          var mode = LandmarkWidget.MODES[mode];
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
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        this.content = content;
      },
      init: function() {
        this.update();
      },
      helpText: [
        '<h1>Overview</h1>',
        '<p>Landmarks are semantic concepts that describe a particular ',
        'feature in a dataset. A data set can contain multiple locations that ',
        'are annotated with a landmark. Landmarks, as a concept, can be part of ',
        '<em>landmark groups</em>. If a landmark is linked to a landmark group, ',
        'then this provides information what landmarks can be reasonably expected ',
        'in this group. Locations can be linked to groups as well, which allows ',
        'groups to have information about which landmarks have actually been ',
        'found in this group.</p>',
        '<p>To delete a particular landmark, group, or link between them, users ',
        'need to have edit permissions on the respective creating user.</p>',
        '<h1>Display</h1>',
        '<p>The first tab allows to form ad-hoc display transformations, i.e. ',
        'transform existing skeletons from one landmark group into another. The ',
        'resulting virtual skeletons can be displayed in any 3D Viewer. Which 3D ',
        'Viewer should show these virtual skeletons can be selected in the top ',
        'controls.</p>',
        '<p>If the "Source other projects" checkbox is enabled, skeleton data ',
        'and source landmark groups can be loaded from other CATMAID servers. ',
        'With the "other projects" UI enabled and another CATMAID instance ',
        'configured in the Setting Widget, it is now possible to select a remote ',
        'CATMAID instance from the "Source remote" dropdown menu. Alternatively, ',
        'the local instance can be selected if another project from the same ',
        'instance should be used. Next the source project in the selected ',
        'instance needs to be specified. This list is updated when a different ',
        'remote instance is selected.</p>',
        '<p> Skeletons from a remote instance are collected through annotations. ',
        'The respective annotation has to be entered in the "Source skeleton ',
        'annotation". With the help of the "Preview" button it is possible to ',
        'load the matching skeletons from their remote CATMAID to inspect if ',
        'the correct ones are selected. As a last step for the remote data ',
        'configuration, the source landmark group has to be defined. This list ',
        'is updated if the source project changes. Landmarks from this group ',
        'are mapped to the selected target group. The matching is done by name, ',
        'i.e. no landmarks can have the same names in a group.</p>',
        '<p>Adding such a transformation adds it to the list at the bottom of ',
        'the widget, just like with regular transformations and they can be ',
        'used in the same way. The can be shown in 3D Viewers, superimposed ',
        'on the Tracing Layer and used in NBLAST queries from the Neuron ',
        'Similarity Widget</p>.',
        '<h1>Landmarks</h1>',
        '<p>The first tab provides tools to manage landmarks, landmark groups and ',
        'their links to locations. The top controls provide input controls to add ',
        'new landmarks and landmark groups. Clicking on one of the members or ',
        '"(none)" in the group table opens a dialog which allows editing the ',
        'members of the respective group. Locations can be lined through a ',
        'context menu that is displayed on a right click on an existing landmark ',
        'location or "(none"). The first three options allow to link and delete ',
        'locations from the landmark. The remaining options allow to assign a ',
        'location to a group of which the landmark is a member of.</p>',
        '<p>To create a new display transformation, select a skeleton source ',
        'which will provide the input skeletons. Note that the source color will ',
        'be maintained for display. Then a source landmark group and a target ',
        'landmark group have to be selected. They describe the transformation. If ',
        'you are unsure about which group is which, show them in the 3D Viewer ',
        'through its "View Settings" > "Landmark groups" control. Adding the ',
        'transformation will allow it to render in the selected 3D Viewers.</p>',
        '<h1>Edit landmarks</h1>',
        '<p>Select an existing landmark group or create a new one and edit its ',
        'associated landmarks and locations.</p>',
        '<h1>Create groups</h1>',
        '<p>The bounding boxes of volume A and volume B are used to create',
        'landmark group A and B, respectively.</p>',
        '<h1>Import</h1>',
        '<p>To import data, one CSV file is expected per landmark group. Each ',
        'row in such a file is expected to have four columns: <em>Landmark ',
        'name</em>, <em>X</em>, <em>Y</em>, <em>Z</em>. This represents a single ',
        'landmark plus location in the group the file represents. Files of this ',
        'format can be selected through the "Open" button.</p>',
        '<p>Once opened, each selected file will be presented in a table row. ',
        'Below the file file name, the first line of the file is shown in lighter ',
        'color. If this is unwanted content, the lines to skip in the file can be ',
        'adjusted in the top controls. The input field in the second column ',
        'of the import file table allows to enter a landmark group name. If ',
        '"Allow non-empty groups" is enabled, existing groups will be re-used and ',
        'appended to. By default, non-existing groups are created automatically. ',
        'If existing landmarks should be re-used and only location links should ',
        'be added, use the "Re-use existing landmarks" option.</p>'
      ].join('\n')
    };
  };

  LandmarkWidget.prototype.refresh = function() {
    if (this.landmarkDataTable) {
      this.landmarkDataTable.rows().invalidate();
    }
  };

  /**
   * Remove virtual skeltons from 3D Viewers.
   */
  LandmarkWidget.prototype.removeDisplay = function() {
    let availableSources = LandmarkWidget.getAvailable3dViewers();
    availableSources.forEach(function(sourceName) {
      this.removeDisplayFrom3dViewer(sourceName);
    }, this);

    project.getStackViewers().forEach(function(sv) {
      sv.removeLayer('landmarklayer');
      sv.redraw();
    });
  };

  /**
   * Updaet display targets.
   */
  LandmarkWidget.prototype.handleUpdatedSkeletonSources = function() {
    if (!this.controls) {
      return;
    }

    // Remove all references to now inavailable sources
    for (let targetName of this.targeted3dViewerNames.keys()) {
      let source = CATMAID.skeletonListSources.getSource(targetName);
      if (!source) {
        this.targeted3dViewerNames.delete(targetName);
      }
    }

    let targetSelectContainer = this.controls.querySelector('span[data-role=display-target]');
    if (targetSelectContainer) {
      this.updateTargetSelect(targetSelectContainer);
    }
  };

  LandmarkWidget.getAvailable3dViewers = function() {
    return Object.keys(CATMAID.skeletonListSources.sources)
        .filter(function(name) {
          let source = CATMAID.skeletonListSources.sources[name];
          return source && source instanceof CATMAID.WebGLApplication;
        });
  };

  /**
   * Create a new checkbox target select in the passed in container.
   */
  LandmarkWidget.prototype.updateTargetSelect = function(targetSelectContainer) {
    // Clear current content
    while (targetSelectContainer.firstChild) {
      targetSelectContainer.removeChild(targetSelectContainer.firstChild);
    }
    // Get a list of current skeleton sources and create a checkbox select for
    // the available 3D Viewers.
    var availableSources = LandmarkWidget.getAvailable3dViewers()
        .sort()
        .map(function(name) {
          return {
            title: name,
            value: name
          };
        });
    // Add unknown 3D Viewers as visible by default
    for (let i=0; i<availableSources.length; ++i) {
      let name = availableSources[i].value;
      if (!this.targeted3dViewerNames.has(name)) {
        this.targeted3dViewerNames.set(name, true);
      }
    }
    // Add HTML controls
    var select = CATMAID.DOM.createCheckboxSelect("Target 3D viewers",
        availableSources, this.targeted3dViewerNames.keys(), true);
    if (availableSources.length === 0) {
      var element = select.querySelector('select');
      element.setAttribute('disabled', '');
    }

    var self = this;
    select.onchange = function(e) {
      let selected = e.target.checked;
      let sourceName = e.target.value;
      self.targeted3dViewerNames.set(sourceName, selected);
      self.updateDisplay();
    };
    targetSelectContainer.appendChild(select);
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

    let mode = LandmarkWidget.MODES[this.mode];

    // Reset reference lines to global setting, but allow mode definition to
    // override it.
    project.getStackViewers().forEach(function(s) {
      s.showReferenceLines(
          CATMAID.StackViewer.Settings.session.display_stack_reference_lines);
    });

    // Update actual content
    mode.createContent(this.content, this);

    this.updateLandmarkLayers();
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
    if (this.mode === 'landmarks') {

    }
  };

  function locationIndexToString(i) {
    let displayIndex = i + 1;
    /* jshint validthis: true */
    return '<a href="#" class="bordered-list-elem" data-id="' + this.id +
        '" data-action="select-location" data-index="' + i + '">' + displayIndex + '</a>';
  }

  function wrapInGroupEditLink(id, e) {
    return `<a href="#" data-action="edit-group-memberships" data-landmark-id="${id}">${e || id}</a>`;
  }

  /**
   * Create an index that maps location IDs in a group to the landmarks they are
   * linked to.
   *
   * @param {Group} group         The group to map locations from.
   * @param {Map}   landmarkIndex An index mapping landmark IDs to landmark objects.
   * @param {Map}   target        (optional) A map to populate. If not passed
   *                              in, a new map is created.
   * @returns {Map} The target map.
   */
  function makeLocationLandmarkIndex(group, landmarkIndex, target) {
    if (!target) {
      tatget = new Map();
    }

    for (let i=0, imax=group.members.length; i<imax; ++i) {
      let landmarkId = group.members[i];
      let landmark = landmarkIndex.get(landmarkId);
      if (!landmark) {
        CATMAID.warn("Could not find landmark #" + landmarkId);
        continue;
      }
      let linkedLocations = CATMAID.Landmarks.getLinkedGroupLocationIndices(group, landmark);
      // Map location IDs to the landmark.
      for (let j=0, jmax=linkedLocations.length; j<jmax; ++j) {
        let linkedLocation = linkedLocations[j];
        let linkedLandmarks = target.get(linkedLocation);
        if (!linkedLandmarks) {
          linkedLandmarks = [];
          target.set(group.locations[linkedLocation].id, linkedLandmarks);
        }
        linkedLandmarks.push(landmark);
      }
    }

    return target;
  }

  /**
   * If the respective landmark is available from already retrieved data return
   * the landmark's name, otherwise return its ID.
   */
  LandmarkWidget.prototype.groupedLandmarkToString = function(group, landmarkId) {
    if (this.landmarkIndex && this.landmarkGroupIndex) {
      let landmark = this.landmarkIndex.get(landmarkId);
      if (landmark) {
        let linkedLocations = CATMAID.Landmarks.getLinkedGroupLocationIndices(group, landmark);
        let linkedLocationsRepr = linkedLocations.map(locationIndexToString, landmark);
        if (linkedLocationsRepr.length > 0) {
          return wrapInGroupEditLink(landmark.id, landmark.name) + " (" + linkedLocationsRepr.join("") + ")";
        } else {
          return wrapInGroupEditLink(landmark.id, landmark.name) + " (-)";
        }
      } else {
        return wrapInGroupEditLink(landmarkId);
      }
    } else {
      return wrapInGroupEditLink(landmarkId);
    }
  };

  function addToNameIndex(index, element) {
    index.set(element.name.toLowerCase(), element);
    return index;
  }

  function addLandmarkGroupMembership(index, landmarkGroup) {
    let members = landmarkGroup.members;
    for (var i=0, imax=members.length; i<imax; ++i) {
      let landmarkId = members[i];
      let groups = index.get(landmarkId);
      if (!groups) {
        groups = [];
        index.set(landmarkId, groups);
      }
      groups.push(landmarkGroup.id);
    }
    return index;
  }

  LandmarkWidget.prototype.updateLandmarks = function() {
    var self = this;
    return CATMAID.Landmarks.list(project.id, true)
      .then(function(result) {
        self.landmarks = result;
        self.landmarkIndex = result.reduce(CATMAID.Landmarks.addToIdIndex, new Map());
        self.landmarkNameIndex = result.reduce(addToNameIndex, new Map());
        return result;
      });
  };

  LandmarkWidget.prototype.updateLandmarkGroups = function() {
    var self = this;
    return CATMAID.Landmarks.listGroups(project.id, true, true, true, true)
      .then(function(result) {
        self.landmarkGroups = result;
        self.landmarkGroupMemberships = result.reduce(addLandmarkGroupMembership, new Map());
        self.landmarkGroupIndex = result.reduce(CATMAID.Landmarks.addToIdIndex, new Map());
        return result;
      });
  };

  LandmarkWidget.prototype.updateLandmarksAndGroups = function() {
    return Promise.all([
      this.updateLandmarks(),
      this.updateLandmarkGroups()
    ]);
  };

  LandmarkWidget.prototype.updateSourceLandmarks = function(api, projectId) {
    var self = this;
    return CATMAID.Landmarks.list(projectId, true, api)
      .then(function(result) {
        self.sourceLandmarks = result;
        self.sourceLandmarkIndex = result.reduce(CATMAID.Landmarks.addToIdIndex, new Map());
        self.sourceLandmarkNameIndex = result.reduce(addToNameIndex, new Map());
        return result;
      });
  };

  LandmarkWidget.prototype.updateSourceLandmarkGroups = function(api, projectId) {
    var self = this;
    return CATMAID.Landmarks.listGroups(projectId, true, true, true, true, api)
      .then(function(result) {
        self.sourceLandmarkGroups = result;
        self.sourceLandmarkGroupMemberships = result.reduce(addLandmarkGroupMembership, new Map());
        self.sourceLandmarkGroupIndex = result.reduce(CATMAID.Landmarks.addToIdIndex, new Map());
        return result;
      });
  };

  LandmarkWidget.prototype.updateSourceLandmarksAndGroups = function(api, projectId) {
    return Promise.all([
      this.updateSourceLandmarks(api, projectId),
      this.updateSourceLandmarkGroups(api, projectId)
    ]);
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
            landmarkGroup.id + "), regardless of the locations linked to the " +
            "landmark. This marks landmarks as expected for a group." +
            "Locations are linked separately from the Landmarks table " +
            "(right click on locations).");
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

          dialog.show(600, 500);
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

  /**
   * Return a promise that will either resolve with a new selection of group
   * memberships (groups a particular landmark is member of).
   */
  LandmarkWidget.prototype.editGroupMemberships = function(landmarkId) {
    var prepare = this.landmarkGroups ? Promise.resolve(this.landmarkGroups) :
        this.updateLandmarkGroups();
    let self = this;
    return prepare
      .then(function(landmarkGroups) {
        return new Promise(function(resolve, reject) {
          // Show a checkbox select widget
          let options = landmarkGroups.map(function(lg) {
            return {
              title: lg.name,
              value: lg.id
            };
          });
          let landmark = self.landmarkIndex.get(landmarkId);
          if (!landmark) {
            throw new CATMAID.ValueError("Could not find landmark " + landmarkId);
          }
          var dialog = new CATMAID.OptionsDialog("Edit group memberships");
          dialog.appendMessage("Select all landmark groups that landmark " +
            `"${landmark.name}" (${landmark.id}) should be a member of,` +
            "regardless of the locations linked to the " +
            "landmark. This mark landmark groups as expected for this " +
            "landmark. Locations are linked separately from the Landmarks " +
            "table (right click on locations).");
          var memberships = self.landmarkGroupMemberships.get(landmark.id);
          var memberPanel = CATMAID.DOM.createCheckboxSelectPanel(options,
              memberships, true);
          dialog.appendChild(memberPanel);
          dialog.onOK = function() {
            var selectedLandmarkInputs = memberPanel.querySelectorAll('input[type=checkbox]');
            var selectedLandmarkGroups = [];
            selectedLandmarkInputs.forEach(function(elem) {
              if (elem.checked) {
                selectedLandmarkGroups.push(parseInt(elem.value, 10));
              }
            });
            resolve(selectedLandmarkGroups);
          };
          dialog.onCancel = function() {
            resolve(null);
          };

          dialog.show(600, 500);
        });
      })
      .then(function(selectedLandmarkGroups) {
        if (selectedLandmarkGroups === null) {
          // Canceled by user
          return null;
        }
        return CATMAID.Landmarks.updateLandmarkMemberships(project.id,
            landmarkId, selectedLandmarkGroups);
      });
  };

  LandmarkWidget.prototype.resetImportView = function() {
    this.filesToImport = [];
    let fileButton = document.querySelector('input#csv-import-' + this.widgetID);
    if (fileButton) {
      fileButton.value = '';
    }
    this.update();
  };

  /**
   * Update display of landmark editing tab.
   */
  LandmarkWidget.prototype.updateEditLandmarkContent = function() {
    if (this.editLandmarkGroup) {

    } else {

    }
  };

  /**
   * Remove all landmark transformations.
   */
  LandmarkWidget.prototype.clearDisplay = function() {
    let target3dViewers = Array.from(this.targeted3dViewerNames.keys()).map(function(m) {
        return CATMAID.skeletonListSources.getSource(m);
      });
    while (this.displayTransformations.length > 0) {
      let transformation = this.displayTransformations.pop();
      for (let j=0; j<target3dViewers.length; ++j) {
        let widget = target3dViewers[j];
        widget.showLandmarkTransform(transformation, false);
      }
    }
    this.update();
  };

  LandmarkWidget.prototype.removeLandmarkTransformation = function(transformation) {
    let transformations = this.displayTransformations;
    while (true) {
      var index = -1;
      for (let i=0; i<transformations.length; ++i) {
        let t = transformations[i];
        if (t.id === transformation.id) {
          index = i;
          break;
        }
      }
      if (index === -1) {
        break;
      } else {
        let t = transformations[index];
        transformations.splice(index, 1);
        let target3dViewers = Array.from(this.targeted3dViewerNames.keys()).map(function(m) {
          return CATMAID.skeletonListSources.getSource(m);
        });
        for (let j=0; j<target3dViewers.length; ++j) {
          let widget = target3dViewers[j];
          widget.showLandmarkTransform(t, false);
        }
        CATMAID.Landmarks.trigger(CATMAID.Landmarks.EVENT_DISPLAY_TRANSFORM_REMOVED);
      }
    }
  };

  /**
   * Remove all currently avilable tranforms from the passed in 3D viewer
   * reference.
   */
  LandmarkWidget.prototype.removeDisplayFrom3dViewer = function(widgetName) {
    let widget = CATMAID.skeletonListSources.getSource(widgetName);
    if (!widget) {
      throw new CATMAID.ValueError("Can't find widget: " + widgetName);
    }
    for (let i=0; i<this.displayTransformations.length; ++i) {
      let transformation = this.displayTransformations[i];
      widget.showLandmarkTransform(transformation, false);
    }
  };

  // Get all relevant skeleton projection options
  LandmarkWidget.prototype.getLandmarkLayerOptions = function() {
    return {
      "visible": this.showLandmarkLayers,
      "scale": this.nodeScaling,
      "overrideColor": this.overrideColor ? this._overrideColor : false,
      "overrideAlpha": this.overrideColor ? this._overrideAlpha : false,
      "colorMap": this.overrideColor ? false : this.displayTransformations.reduce((o, dt) => {
        for (let sm of dt.skeletons) {
          o.set(sm.id, sm.clone());
        }
        return o;
      }, new Map()),
    };
  };

  /**
   * Makes sure all active landmark display transformations are shown as layers.
   */
  LandmarkWidget.prototype.updateLandmarkLayers = function() {
    var options = this.getLandmarkLayerOptions();
    // Create a skeleton projection layer for all stack viewers that
    // don't have one already.
    let transformations = new Set(this.displayTransformations);
    project.getStackViewers().forEach(function(sv) {
      var layer = sv.getLayer('landmarklayer');
      if (options.visible) {
        if (!layer) {
          // Create new if not already present
          layer = new CATMAID.LandmarkLayer(sv, options);
          sv.addLayer('landmarklayer', layer);
        }

        // Update existing instance
        let layerTransformations = new Set(layer.displayTransformations);
        // Remove layer transformations that are not part of the widget
        let nRemoved = 0;
        for (let t of layerTransformations) {
          if (!transformations.has(t)) {
            layerTransformations.delete(t);
            ++nRemoved;
          }
        }
        // Add display transformations not yet part of layer
        let nAdded = 0;
        for (let t of transformations) {
          if (!layerTransformations.has(t)) {
            layerTransformations.add(t);
            ++nAdded;
          }
        }

        layer.displayTransformations = Array.from(layerTransformations);

        if (nRemoved !== 0 || nAdded !== 0) {
          layer.update();
        }

        // Update other options and display
        layer.updateOptions(options, false, true);
      } else if (layer) {
        sv.removeLayer('landmarklayer');
        sv.redraw();
      }
    });
  };


  LandmarkWidget.prototype.updateStyle = function() {
    let target3dViewers = Array.from(this.targeted3dViewerNames.keys()).map(function(m) {
      return CATMAID.skeletonListSources.getSource(m);
    });

    for (let i=0; i<this.displayTransformations.length; ++i) {
      let transformation = this.displayTransformations[i];
      for (let j=0; j<target3dViewers.length; ++j) {
        let widget = target3dViewers[j];
        let selected = this.targeted3dViewerNames.get(widget.getName());
        widget.setLandmarkTransformStyle(transformation);
      }
    }
  };

  /**
   * Create skeleton models for the skeletons to transform
   */
  LandmarkWidget.prototype.updateDisplay = function() {
    let target3dViewers = Array.from(this.targeted3dViewerNames.keys()).map(function(m) {
      return CATMAID.skeletonListSources.getSource(m);
    });

    // Create a virtual skeleton representation for each input skeleton of each
    // transformation.
    for (let i=0; i<this.displayTransformations.length; ++i) {
      let transformation = this.displayTransformations[i];
      let providerAdded = CATMAID.Landmarks.addProvidersToTransformation(
          transformation, this.landmarkGroupIndex, this.landmarkIndex, i,
          this.sourceLandmarkGroupIndex, this.sourceLandmarkIndex, true);
      if (providerAdded) {
        for (let j=0; j<target3dViewers.length; ++j) {
          let widget = target3dViewers[j];
          let selected = this.targeted3dViewerNames.get(widget.getName());
          widget.showLandmarkTransform(transformation, selected);
        }
      }
    }
  };

  /**
   * Add a new display transformation for a set of skeletons.
   *
   * @param {number} projectId   Source project of the transformation
   * @param {object} skeletons   Object mapping skeleton IDs to skeleton models
   * @param {Object[]} mapping   A list of two-element lists with the first
   *                             element being a source landmark group ID and
   *                             the second element a target landmark * gorup ID.
   * @param {API} api (Optional) A remote API to load the source data from. If
   *                             passed in skeletons and from groups are
   *                             expected to be there.
   * @returns new LandmarkSkeletonTransformation instance
   */
  LandmarkWidget.prototype.addDisplayTransformation = function(projectId,
      skeletons, mapping, api, modelClass) {
    let lst = new CATMAID.LandmarkSkeletonTransformation(projectId, skeletons,
        mapping, api, undefined, modelClass, this.useReversePointMatches);
    this.displayTransformations.push(lst);

    // Announce that there is a new display tranformation available
    CATMAID.Landmarks.trigger(CATMAID.Landmarks.EVENT_DISPLAY_TRANSFORM_ADDED);

    return lst;
  };

  /**
   * Add new display transformations based on a target relation. This will
   * currently explore all landmark groups that are transitively linked to the
   * source group. Only links with the passed in relation ID will be respected.
   */
  LandmarkWidget.prototype.addDisplayTransformationRule = function(getSkeletonModels,
      fromGroupId, relationId, modelClass) {
    // Get all transitively linked target groups from back-end. Add a
    // transformation for each.
    var self = this;
    return CATMAID.Landmarks.getTransitivelyLinkedGroups(project.id, fromGroupId, relationId)
      .then(function(groups) {
        for (let i=0; i<groups.length; ++i) {
          let toGroupId = groups[i];
          let skeletons = Object.values(getSkeletonModels());
          if (!skeletons || skeletons.length === 0 ) {
            throw new CATMAID.Warning("Could not find source skeletons");
          }
          let lst = new CATMAID.LandmarkSkeletonTransformation(projectId,
            skeletons, [[fromGroupId, toGroupId]], undefined, undefined,
            modelClass, self.useReversePointMatches);
          self.displayTransformations.push(lst);
        }
        CATMAID.Landmarks.trigger(CATMAID.Landmarks.EVENT_DISPLAY_TRANSFORM_ADDED);
      });
  };

  let boundingBoxToArray = function(bb, mirrorAxis) {
    let minX = 'min', maxX = 'max',
        minY = 'min', maxY = 'max',
        minZ = 'min', maxZ = 'max';

    if (mirrorAxis === 'x') {
      minX = 'max';
      maxX = 'min';
    } else if (mirrorAxis === 'y') {
      minY = 'max';
      maxY = 'min';
    } else if (mirrorAxis === 'z') {
      minZ = 'max';
      maxZ = 'min';
    }

    return [
        [bb[minX].x, bb[minY].y, bb[minZ].z],
        [bb[minX].x, bb[minY].y, bb[maxZ].z],
        [bb[minX].x, bb[maxY].y, bb[minZ].z],
        [bb[minX].x, bb[maxY].y, bb[maxZ].z],
        [bb[maxX].x, bb[minY].y, bb[minZ].z],
        [bb[maxX].x, bb[minY].y, bb[maxZ].z],
        [bb[maxX].x, bb[maxY].y, bb[minZ].z],
        [bb[maxX].x, bb[maxY].y, bb[maxZ].z]
    ];
  };

  /**
   * Create a new pair of landmark groups based on the volume configuration.
   */
  LandmarkWidget.prototype.createLandmarkGroupsFromVolumes = function(volumeAId,
      volumeBId, groupAName, groupBName, landmarkPrefix, mirrorAxis, relations,
      reuseExistingLandmarks) {
    return Promise.all([
        CATMAID.Volumes.get(project.id, volumeAId),
        CATMAID.Volumes.get(project.id, volumeBId)
      ])
      .then(function(bbs) {
        let a = bbs[0].bbox;
        let b = bbs[1].bbox;

        // Each bounding box has a min and max field, representing its corners.
        // Generate all eight points for each bounding box. The corners of the
        // reference box are walked in the following order, starting with the
        // minimum corner:
        let landmarksGroupA = boundingBoxToArray(a);
        let landmarksGroupB = boundingBoxToArray(b, mirrorAxis);

        if (!landmarkPrefix || landmarkPrefix.length === 0) {
          landmarkPrefix = groupAName + ' - ' + groupBName + ' - ';
        }

        let landmarks = landmarksGroupA.map(function(locA, i) {
          let name = landmarkPrefix + i;
          let locB = landmarksGroupB[i];
          return [name, locA[0], locA[1], locA[2], locB[0], locB[1], locB[2]];
        });

        let links;
        if (relations) {
          links = Array.from(relations).map(function(relation) {
            return [groupAName, relation, groupBName];
          });
        }

        return CATMAID.Landmarks.materialize(project.id, groupAName, groupBName,
            landmarks, links, reuseExistingLandmarks);
      });
  };

  /**
   * Open a 3D dialog that has all neurons from the remote CATMAID project
   * loaded that are annotated with the passed in annotation..
   */
  function previewRemoteSkeletons(remote, projectId, neuronAnnotation) {
    // Get all remote skeletons
    let api = remote ? remote : null;
    CATMAID.Skeletons.byAnnotation(projectId, [neuronAnnotation], api)
      .then(function(skeletonIds) {
        // Fetch skeletons
        let promises = skeletonIds.map(skeletonId => {
          return CATMAID.fetch({
              url: projectId + '/' + skeletonId + '/1/1/1/compact-arbor',
              method: 'POST',
              api: api,
            }) .then(function(result) {
              var ap = new CATMAID.ArborParser();
              ap.tree(result[0]);
              return [skeletonId, ap];
            });
        });

        return Promise.all(promises)
          .then((arborParsers) => {
            return new Map(arborParsers);
          });
      })
      .then(arborParsers => {
        let skeletonIds = Array.from(arborParsers.keys());
        if (!skeletonIds || skeletonIds.length === 0) {
          CATMAID.warn(`No neurons found with annotation "${neuronAnnotation}" from remote "${remote.name}"`);
          return;
        }
        // Create dialog
        var dialog = new CATMAID.Confirmation3dDialog({
          title: `Preview of all ${skeletonIds.length} remote neurons annotated with "${neuronAnnotation}"`,
          showControlPanel: false,
          buttons: {
            "Close": () => dialog.close(),
          }});

        dialog.show();

        let colorizer = new CATMAID.Colorizer();
        var glWidget = dialog.webglapp;
        var models = skeletonIds.reduce( (o, skid, i) => {
          let skeleton = new CATMAID.SkeletonModel(skid, undefined,
              colorizer.pickColor(), api);
          skeleton.projectId = projectId;
          o[skid] = skeleton;
          return o;
        }, {} );

        // Create virtual skeletons
        let nodeProvider = new CATMAID.ArborParserNodeProvider(arborParsers);

        glWidget.addSkeletons(models, () => {
            // Focus first skeleton
            glWidget.lookAtSkeleton(skeletonIds[0]);
          },
          nodeProvider);
      })
      .catch(CATMAID.handleError);
  }

  function getId(e) {
    return e.id;
  }

  function hasFourElements(l) {
    return l.length === 4;
  }

  LandmarkWidget.MODES = {
    landmarks: {
      title: 'Landmarks',
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
            id: `${this.idPrefix}landmarks-new-landmark`,
            onchange: function() {
              // Check if this landmark exists already
              state.newLandmarkName = this.value;
            },
            onenter: function() {
              this.parentNode.nextSibling.click();
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
                  // Clear input
                  let input = document.querySelector(`#${self.idPrefix}landmarks-new-landmark`);
                  if (input) input.value = '';
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
            id: `${this.idPrefix}landmarks-new-landmark-group`,
            onchange: function() {
              state.newLandmarkGroupName = this.value;
            },
            onenter: function() {
              this.parentNode.nextSibling.click();
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
                  // Clear input
                  let input = document.querySelector(`#${self.idPrefix}landmarks-new-landmark-group`);
                  if (input) input.value = '';
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
            widget.updateLandmarksAndGroups()
              .then(function(result) {
                let groups = result[1];
                callback({
                  draw: data.draw,
                  data: groups,
                  recordsTotal: groups.length,
                  recordsFiltered: groups.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [],
          columns: [
            {
              data: "id",
              title: "Id",
              orderable: true,
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
                  return '<a href="#" data-action="edit-group-members" data-group-id="' +
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
                    return "(none)";
                  } else {
                    var namedLandmarks = data.map(function(landmarkId) {
                      return widget.groupedLandmarkToString(row, landmarkId);
                    });
                    return namedLandmarks.join(' ');
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
                return '<a href="#" data-action="edit-group" data-group-id="' +
                    row.id + '" >Edit</a> <a href="#" data-group-id="' +
                    row.id + '" data-action="delete" title="Ask for ' +
                    'confirmation and delete landmark group.">Delete</a>';
              }
            }
          ],
          createdRow: function(row) {
            row.setAttribute('title', 'Double-click to edit landmark group');
          },
        }).on('dblclick', 'tr', function(e) {
          var data = landmarkGroupDataTable.row(this).data();
          if (data) {
            var table = $(this).closest('table');
            var tr = $(this).closest('tr');
            var data =  $(table).DataTable().row(tr).data();

            // Toggle landmark group selection state
            if (widget.selectedLandmarkGroups.has(data.id)) {
              widget.selectedLandmarkGroups.delete(data.id);
            } else {
              widget.selectedLandmarkGroups.add(data.id);
            }

            // Go into edit mode
            widget.editLandmarkGroup = data.id;
            widget.setMode('edit');
          }
        }).on('click', 'a[data-action=select-group]', function() {
          var groupId = parseInt(this.dataset.groupId, 10);
          widget.selectedLandmarkGroups.add(groupId);
          widget.update();
        }).on('click', 'a[data-action=edit-group]', function() {
          widget.editLandmarkGroup = parseInt(this.dataset.groupId, 10);
          widget.setMode('edit');
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
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-action=edit-group-memberships]', function() {
          let landmarkId = parseInt(this.dataset.landmarkId, 10);
          if (!CATMAID.tools.isNumber(landmarkId)) return;

          // To edit group memberships an extra dialog will be shown
          widget.editGroupMemberships(landmarkId)
            .then(function(updatedLandmark) {
              if (updatedLandmark !== null) {
                CATMAID.msg("Success", "Landmark updated");
                widget.update();
              }
            })
            .catch(CATMAID.handleError);
        }).on('mousedown', 'a[data-action=select-location]', function(e) {
          var index = parseInt(this.dataset.index, 10);
          var landmarkId = parseInt(this.dataset.id, 10);

          var table = $(this).closest('table');
          var datatable = $(table).DataTable();
          var tr = $(this).closest('tr');
          var data =  datatable.row(tr).data();

          // The index refers to the landmark's location list! To find it there,
          // we need the landmark index.
          if (!widget.landmarkIndex) {
            CATMAID.warn('No landmark index available');
            return;
          }
          var landmark = widget.landmarkIndex.get(landmarkId);
          if (!landmark) {
            CATMAID.warn('Couldn\'t find landmark ' + landmarkId);
            return;
          }

          // If left mouse button was used and a location is available, move to
          // it.
          var loc = Number.isNaN(index) ? null : data.locations[index];
          if (e.which === 1 && loc) {
            project.moveTo(loc.z, loc.y, loc.x)
              .then(function() {
                // Biefly flash new location
                var nFlashes = 3;
                var delay = 100;
                project.getStackViewers().forEach(function(s) {
                  s.pulseateReferenceLines(nFlashes, delay);
                });
              })
              .catch(CATMAID.handleError);
          }
        });

        // The context menu used to modify locations
        var contextMenu = null;

        // Add table with landmarks
        var landmarkHeader = content.appendChild(document.createElement('h1'));
        landmarkHeader.appendChild(document.createTextNode('Landmarks'));

        // Add table with landmark groups
        var landmarkTable = document.createElement('table');
        var landmarkTableWrapper = document.createElement('div');
        landmarkTableWrapper.classList.add('container');
        landmarkTableWrapper.appendChild(landmarkTable);
        content.appendChild(landmarkTableWrapper);
        var landmarkDataTable = widget.landmarkDataTable = $(landmarkTable).DataTable({
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
              title: '<input type="checkbox" data-action="select-all-skeletons" />',
              orderable: false,
              render: function(data, type, row, meta) {
                let selected = widget.selectedLandmarks.has(row.id);
                if (type === 'display') {
                  return '<input type="checkbox" data-action="select-landmark" value="' +
                      row.id + '" ' + (selected ? 'checked' : '') + ' />';
                }
                return selected;
              }
            },
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
                if (type === 'display') {
                  return '<a href="#" data-action="select-landmark" data-id="' +
                      row.id + '" >' + row.name + '</a>';
                } else {
                  return row.name;
                }
              }
            },
            {
              data: "locations",
              title: "Locations",
              orderable: true,
              class: "no-context-menu",
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  if (data.length === 0) {
                    return '<a class="no-context-menu" href="#" data-action="select-location" data-index="' + 'none' + '">(none)</a>';
                  } else {
                    let links = new Array(data.length);
                    for (let i=0; i<links.length; ++i) {
                      links[i] = '<a href="#" class="bordered-list-elem no-context-menu" data-action="select-location" data-index="' +
                          i + '">' + (i + 1) + '</a>';
                    }
                    return links.join('');
                  }
                } else {
                  return data;
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
              widget.selectedLandmarks.delete(id);
            })
            .catch(CATMAID.handleError);
        }).on('contextmenu', '.no-context-menu', function(e) {
          e.stopPropagation();
          e.preventDefault();
          return false;
        }).on('change', 'input[data-action=select-all-skeletons]', function() {
          if (widget.landmarks) {
            for (let i=0; i<widget.landmarks.length; ++i) {
              let landmark = widget.landmarks[i];
              if (this.checked) {
                widget.selectedLandmarks.add(landmark.id);
              } else {
                widget.selectedLandmarks.delete(landmark.id);
              }
            }
            widget.refresh();
          }
        }).on('change', 'input[data-action=select-landmark]', function() {
          let skeletonId = parseInt(this.value, 10);
          if (this.checked) {
            widget.selectedLandmarks.add(skeletonId);
          } else {
            widget.selectedLandmarks.delete(skeletonId);
          }
        }).on('click', 'a[data-action=select-landmark]', function() {
          let landmarkId = parseInt(this.dataset.id, 10);
          if (!CATMAID.tools.isNumber(landmarkId)) return;

          // To edit group memberships an extra dialog will be shown
          widget.editGroupMemberships(landmarkId)
            .then(function(updatedLandmark) {
              if (updatedLandmark !== null) {
                CATMAID.msg("Success", "Landmark updated");
                widget.update();
              }
            })
            .catch(CATMAID.handleError);
        }).on('mousedown', 'a[data-action=select-location]', function(e) {
          var index = parseInt(this.dataset.index, 10);
          var table = $(this).closest('table');
          var datatable = $(table).DataTable();
          var tr = $(this).closest('tr');
          var data =  datatable.row(tr).data();
          var location = Number.isNaN(index) ? null : data.locations[index];

          // Hide current context menut (if any) and show new context menu
          if (contextMenu) {
            contextMenu.hide();
          }

          if (e.which === 1 && location) {
            project.moveTo(location.z, location.y, location.x)
              .then(function() {
                // Biefly flash new location
                var nFlashes = 3;
                var delay = 100;
                project.getStackViewers().forEach(function(s) {
                  s.pulseateReferenceLines(nFlashes, delay);
                });
              })
              .catch(CATMAID.handleError);
            return;
          }

          var items = [
            {
              'title': 'Add current location',
              'value': 'add-current-location',
              'data': data
            },
            {
              'title': 'Add active node location',
              'value': 'add-active-node-location',
              'data': data
            }
          ];
          if (location) {
            items.push({
              'title': 'Delete location',
              'value': 'delete',
              'data': {
                landmark: data,
                location: location
              }
            });
            if (widget.landmarkGroupMemberships && widget.landmarkGroupIndex) {
              let linkedGroups = widget.landmarkGroupMemberships.get(data.id);
              if (linkedGroups) {
                let add = [], remove = [];
                for (var i=0, imax=linkedGroups.length; i<imax; ++i) {
                  var groupId = linkedGroups[i];
                  var group = widget.landmarkGroupIndex.get(groupId);
                  if (!group) {
                    throw new CATMAID.ValueError("Unknown landmark group: " + groupId);
                  }
                  var groupLocations = group.locations;
                  // Check if the landmark location is already a member of this group
                  var isMember = false;
                  for (var j=0, jmax=groupLocations.length; j<jmax; ++j) {
                    let groupLocation = groupLocations[j];
                    if (groupLocation.id == location.id) {
                      isMember = true;
                      break;
                    }
                  }
                  // If it is a member, show option to remove from group,
                  // otherwise show option to add to group.
                  if (isMember) {
                    remove.push({
                      'title': 'Remove from: ' + group.name,
                      'value': 'remove-from-group',
                      'data': {
                        landmark: data,
                        group: group,
                        location: location
                      }
                    });
                  } else {
                    add.push({
                      'title': 'Add to: ' + group.name,
                      'value': 'add-to-group',
                      'data': {
                        landmark: data,
                        group: group,
                        location: location
                      }
                    });
                  }
                }
                items = items.concat(add).concat(remove);
              }
            }
          }
          contextMenu = new CATMAID.ContextMenu({
            disableDefaultContextMenu: true,
            select: function(selection) {
              let data = selection.item.data;
              let action = selection.item.value;
              if (action === 'delete') {
                // Confirm
                if (!confirm("Are you sure you want to delete the link between landmark \"" +
                    data.landmark.name + "\" (" + data.landmark.id + ") and location " +
                    data.location.id + "?")) {
                  return;
                }
                CATMAID.Landmarks.deleteLocationLink(project.id,
                    data.landmark.id, data.location.id)
                  .then(function() {
                    CATMAID.msg("Success", "Deleted link to location");
                    datatable.ajax.reload();
                  });
              } else if (action === 'add-current-location' ||
                  action === 'add-active-node-location') {
                var loc;
                if (action === 'add-current-location') {
                  loc = project.coordinates;
                  if (!loc) {
                    CATMAID.warn('Couldn\'t get project location');
                    return;
                  }
                } else {
                  loc = SkeletonAnnotations.getActiveNodePositionW();
                  if (!loc) {
                    CATMAID.warn("No active node");
                    return;
                  }
                }
                CATMAID.Landmarks.linkNewLocationToLandmark(project.id, data.id, loc)
                  .then(function(link) {
                    CATMAID.msg("Success", "Location linked to landmark");
                    datatable.ajax.reload();
                  })
                  .catch(CATMAID.handleError);
              } else if (action === "add-to-group") {
                // Add the referenced location to the selected group
                CATMAID.Landmarks.addLandmarkLocationToGroup(project.id,
                    data.group.id, data.location.id)
                  .then(function(link) {
                    CATMAID.msg("Success", "Location linked to group");
                    landmarkGroupDataTable.ajax.reload();
                    landmarkDataTable.ajax.reload();
                  })
                  .catch(CATMAID.handleError);
              } else if (action === "remove-from-group") {
                // Remove the referenced location from the selected group
                CATMAID.Landmarks.removeLandmarkLocationFromGroup(project.id,
                    data.group.id, data.location.id)
                  .then(function(link) {
                    CATMAID.msg("Success", "Location removed from group");
                    landmarkGroupDataTable.ajax.reload();
                    landmarkDataTable.ajax.reload();
                  })
                  .catch(CATMAID.handleError);
              }
            },
            hide: function(selected) {
              contextMenu = null;
            },
            items: items
          });
          contextMenu.show(true);
          return false;
        });

        // Add custom buttons into table header
        var deleteSelected = document.createElement('button');
        deleteSelected.appendChild(document.createTextNode('Delete selected'));
        deleteSelected.onclick = function() {
          var selected = Array.from(widget.selectedLandmarks.keys());
          if (selected.length === 0) {
            CATMAID.warn('No landmarks selected');
            return;
          }
          if (!confirm("Are you sure you want to delete " + selected.length + " landmarks?")) {
            return;
          }
          CATMAID.Landmarks.deleteAll(project.id, selected)
            .then(function(result) {
              CATMAID.msg('Success', 'All ' + result.length + ' landmarks deleted');
              for (let i=0; i<selected.length; ++i) {
                widget.selectedLandmarks.delete(selected[i]);
              }
              widget.update();
            });
        };

        $('div.dataTables_length', landmarkDataTable.table().container())
            .append(deleteSelected);
      }
    },
    edit: {
      title: 'Edit landmarks',
      createControls: function(target) {
        let existingLandmarkGroupSection = document.createElement('span');
        existingLandmarkGroupSection.appendChild(document.createTextNode('Select landmark group'));
        let newLandmarkGroupSection = document.createElement('span');
        newLandmarkGroupSection.appendChild(document.createTextNode(' or add landmark group with'));

        let landmarkGroupSelectorWrapper = document.createElement('span');
        let refreshLandmarkGroupList = function(selectedGroupId) {
          while (0 !== landmarkGroupSelectorWrapper.children.length) {
            landmarkGroupSelectorWrapper.removeChild(landmarkGroupSelectorWrapper.children[0]);
          }
          let landmarkGroupSelector = CATMAID.DOM.createAsyncPlaceholder(
              target.updateLandmarksAndGroups()
                .then(function(result) {
                  let availableGroups = result[1];
                  var groups = [{
                    title: '(none)',
                    value: '-1'
                  }].concat(availableGroups.map(function(g) {
                    return {
                      title: g['name'],
                      value: g['id']
                    };
                  }));
                  var node = CATMAID.DOM.createSelect(undefined, groups,
                      selectedGroupId, function(e) {
                        if (this.value == "-1") {
                          target.editLandmarkGroup = null;
                        } else {
                          target.editLandmarkGroup = parseInt(this.value, 10);
                        }
                        target.update();
                      });
                  return node;
                })
                .catch(CATMAID.handleError));
          landmarkGroupSelectorWrapper.appendChild(landmarkGroupSelector);
        };

        // Add initial landmark group list
        refreshLandmarkGroupList(target.editLandmarkGroup);

        let state = {};
        return [
          {
            type: 'child',
            element: existingLandmarkGroupSection
          },
          {
            type: 'child',
            element: landmarkGroupSelectorWrapper
          },
          {
            type: 'child',
            element: newLandmarkGroupSection
          },
          {
            type: 'text',
            label: 'name',
            title: 'The name of the new landmark group',
            value: '',
            length: 8,
            onchange: function() {
              state.newLandmarkGroupName = this.value;
            },
            onenter: function() {
              this.parentNode.nextSibling.click();
            }
          },
          {
            type: 'button',
            label: 'Add and select group',
            onclick: function() {
              CATMAID.Landmarks.addGroup(project.id, state.newLandmarkGroupName)
                .then(function(newGroup) {
                  CATMAID.msg("Success", "Added landmark group " + newGroup.id);
                  refreshLandmarkGroupList(newGroup.id);
                  target.editLandmarkGroup = newGroup.id;
                  target.update();
                })
                .catch(CATMAID.handleError);
            }
          },
          {
            type: 'checkbox',
            label: 'Show reference liens',
            value: target.editShowReferenceLines,
            onclick: function() {
              let showReferenceLines = this.checked;
              target.editShowReferenceLines = this.checked;
              project.getStackViewers().forEach(function(s) {
                s.showReferenceLines(showReferenceLines);
              });
            }
          },
          {
            type: 'checkbox',
            label: 'Update existing landmark locations',
            value: target.editUpdateExistingLandmarkLocations,
            onclick: function() {
              target.editUpdateExistingLandmarkLocations = this.checked;
            }
          },
          {
            type: 'checkbox',
            label: 'Edited group defaults to A for new link',
            value: target.editGroupDefaultsToAInLink,
            onclick: function() {
              target.editGroupDefaultsToAInLink = this.checked;
            }
          }
        ];
      },
      createContent: function(content, widget) {
        // Update reference lines for edit tab
        let showReferenceLines = widget.editShowReferenceLines;
        project.getStackViewers().forEach(function(s) {
          s.showReferenceLines(showReferenceLines);
        });

        if (!widget.editLandmarkGroup) {
          let editContent = document.createElement('div');
          content.appendChild(editContent);
          editContent.classList.add('windowContent');
          editContent.dataset.msg = "Please select an existing landmark group or add a new one.";
          return;
        }

        // Name
        let landmarkGroupNameOverlay = content.appendChild( document.createElement('span'));
        landmarkGroupNameOverlay.classList.add('landmark-group-name-overlay');
        let landmarkGroupName = content.appendChild( document.createElement('div'));
        landmarkGroupName.classList.add('landmark-group-name');

        // Regular editing controls

        // Buttons to add current location or active node location to group with
        // a provided landmark name. Only allow adding if no location is yet
        // linked to this landmark in this landmark group.
        let landmarkGroupNewLocationsHeader = content.appendChild(document.createElement('h1'));
        landmarkGroupNewLocationsHeader.appendChild(document.createTextNode('Add new location'));
        content.appendChild(landmarkGroupNewLocationsHeader);

        let newLandmarkPanel = content.appendChild(document.createElement('div'));
        newLandmarkPanel.classList.add('buttonpanel');

        let newLandmarkInputLabel = newLandmarkPanel.appendChild(document.createElement('label'));
        newLandmarkInputLabel.appendChild(document.createTextNode('Landmark'));
        let newLandmarkInput = newLandmarkInputLabel.appendChild(document.createElement('input'));
        newLandmarkInput.size = 15;

        // Return a new Promise, that returns an existing landmark, if it
        // exists, with the name in the input element above. Or, if it deos not
        // exist, creates it.
        let promiseLandmark = function() {
          let landmarkName = newLandmarkInput.value.trim();
          if (landmarkName.length === 0) {
            throw new CATMAID.Warning("No landmark name provided");
          }
          let existingLandmark = widget.landmarkNameIndex.get(landmarkName.toLowerCase());
          if (existingLandmark) {
            CATMAID.msg("Existing landmark", "Using known landmark name");
            return Promise.all([Promise.resolve(existingLandmark), false]);
          }
          CATMAID.msg("New landmark", "Creating new landmark");
          return Promise.all([
              CATMAID.Landmarks.add(project.id, landmarkName)
                .then(function(l) {
                    l.locations = [];
                    return l;
                 }),
              true]);
        };

        let selectLocation = function(loc) {
          project.moveTo(loc.z, loc.y, loc.x)
            .then(function() {
              // Biefly flash new location
              var nFlashes = 3;
              var delay = 100;
              project.getStackViewers().forEach(function(s) {
                s.pulseateReferenceLines(nFlashes, delay);
              });
            })
            .catch(CATMAID.handleError);
        };

        let linkLocation = function(loc) {
          let landmarkGroupId = widget.editLandmarkGroup;
          let group = widget.landmarkGroupIndex.get(landmarkGroupId);
          if (!group) {
            throw new CATMAID.ValueError("Could not find data for landmark group " +
                landmarkGroupId);
          }
          // Get landmark
          return promiseLandmark()
            .then(function(landmarkInfo) {
              let landmark = landmarkInfo[0];
              let landmarkNewInGroup = landmarkInfo[1];
              // If this landmark name alraedy exists in this group, update the
              // existing node's the location or, if disabled, show a warning
              // and abort.
              let linkedLocations = CATMAID.Landmarks.getLinkedGroupLocationIndices(group, landmark);

              if (!widget.editUpdateExistingLandmarkLocations &&
                  linkedLocations.length > 0) {
                throw new CATMAID.Warning('The landmark "' + landmark.name +
                    '" is already has a location link with this group');
              }
              return CATMAID.Landmarks.linkNewLocationToLandmarkAndGroup(project.id,
                  landmarkGroupId, landmark.id, loc,
                  widget.editUpdateExistingLandmarkLocations);
            })
            .then(function() {
              newLandmarkInput.value = "";
              CATMAID.msg("Success", "Location linked to landmark");
              widget.update();
            })
            .catch(CATMAID.handleError);
        };

        let addCurrentViewCenterLabel = newLandmarkPanel.appendChild(document.createElement('label'));
        addCurrentViewCenterLabel.appendChild(document.createTextNode('add at'));
        let addCurrentViewCenterButton = addCurrentViewCenterLabel.appendChild(
            document.createElement('button'));
        addCurrentViewCenterButton.appendChild(document.createTextNode('Center of view'));
        addCurrentViewCenterButton.onclick = function() {
          let loc = project.coordinates;
          if (!loc) {
            CATMAID.warn('Couldn\'t get project location');
            return;
          }
          linkLocation(loc);
        };

        let addActiveNodeCenterLabel = newLandmarkPanel.appendChild(document.createElement('label'));
        addActiveNodeCenterLabel.appendChild(document.createTextNode('or at'));
        let addActiveNodeCenterButton = addActiveNodeCenterLabel.appendChild(
            document.createElement('button'));
        addActiveNodeCenterButton.appendChild(document.createTextNode('Active node'));
        addActiveNodeCenterButton.onclick = function() {
          let loc = SkeletonAnnotations.getActiveNodePositionW();
          if (!loc) {
            CATMAID.warn("No active node");
            return;
          }
          linkLocation(loc);
        };


        // Promise landmark details
        let landmarkGroupDetails = widget.updateLandmarksAndGroups();

        landmarkGroupDetails
          .then(function() {
            let landmarkGroup = widget.landmarkGroupIndex.get(widget.editLandmarkGroup);
            landmarkGroupName.appendChild(document.createTextNode(
                "Selected landmark group: " + landmarkGroup.name));
            landmarkGroupNameOverlay.appendChild(document.createTextNode(landmarkGroup.name));

            // Get a list of known landmarks and init autocomplete
            let knownLandmarks = widget.landmarks.map(function(landmark) {
              return landmark.name;
            });
            $(newLandmarkInput).autocomplete({
              source: knownLandmarks
            });
          });


        // Existing locations
        var landmarkGroupLocationsHeader = content.appendChild(document.createElement('h1'));
        landmarkGroupLocationsHeader.appendChild(document.createTextNode('Existing locations'));
        content.appendChild(landmarkGroupLocationsHeader);

        // Will be populated during table update
        let locationLandmarkIndex = new Map();

        // Add table with linked landmark locations
        var landmarkTable = document.createElement('table');
        var landmarkTableWrapper = document.createElement('div');
        landmarkTableWrapper.classList.add('container');
        landmarkTableWrapper.appendChild(landmarkTable);
        content.appendChild(landmarkTableWrapper);
        var landmarkDataTable = widget.landmarkDataTable = $(landmarkTable).DataTable({
          dom: "lfrtip",
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            landmarkGroupDetails
              .then(function(result) {
                let group = widget.landmarkGroupIndex.get(widget.editLandmarkGroup);
                let groupData;
                if (group) {
                  groupData = group.locations;
                } else {
                  CATMAID.warn('Could not find data for landmark group #' + widget.editLandmarkGroup);
                  groupData = [];
                }

                // Populate index that maps location IDs to landmarks.
                makeLocationLandmarkIndex(group, widget.landmarkIndex, locationLandmarkIndex);

                // Call table update
                callback({
                  draw: data.draw,
                  data: groupData,
                  recordsTotal: groupData.length,
                  recordsFiltered: groupData.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [],
          columns: [
            {
              title: '<input type="checkbox" data-action="select-all-landmarks" />',
              orderable: false,
              class: "cm-center",
              width: "5%",
              render: function(data, type, row, meta) {
                let selected = widget.selectedLandmarks.has(row.id);
                if (type === 'display') {
                  return '<input type="checkbox" data-action="select-landmark" value="' +
                      row.id + '" ' + (selected ? 'checked' : '') + ' />';
                }
                return selected;
              }
            },
            {
              data: "id",
              title: "Id",
              width: "10%",
              orderable: true,
              class: "cm-center",
              render: function(data, type, row, meta) {
                return row.id;
              }
            },
            {
              title: "Landmark",
              orderable: true,
              class: "cm-center",
              render: function(data, type, row, meta) {
                let landmarks = locationLandmarkIndex.get(row.id);
                if (type === 'display') {
                  // Print name of linked landmarks
                  if (!landmarks || landmarks.length === 0) {
                    return '<em>(none)</em>';
                  }
                  if (landmarks.length === 1) {
                    let landmark = landmarks[0];
                    return '<a href="#" data-action="select-landmark" data-id="' +
                        landmark.id + '" >' + landmark.name + '</a>';
                  }
                  let links = new Array(landmarks.length);
                  for (let i=0, imax=links.length; i<imax; ++i) {
                    let landmark = landmarks[i];
                    links[i] = '<a href="#" data-action="select-landmark" data-id="' +
                        landmark.id + '" >' + landmark.name + '</a>';
                  }
                  return links.join(' ');
                } else {
                  if (!landmarks || landmarks.length === 0) {
                    return null;
                  }
                  let landmark = landmarks[0];
                  return landmark.name;
                }
              }
            },
            {
              data: "x",
              title: "X",
              width: "10%",
              orderable: true,
              class: "no-context-menu cm-center"
            },
            {
              data: "y",
              title: "Y",
              width: "10%",
              orderable: true,
              class: "no-context-menu cm-center"
            },
            {
              data: "z",
              title: "Z",
              width: "10%",
              orderable: true,
              class: "no-context-menu cm-center"
            },
            {
              title: "Action",
              class: "cm-center",
              width: "10%",
              orderable: false,
              render: function(data, type, row, meta) {
                return '<a href="#" data-id="' + row.id +
                    '" data-action="select-location">Go to</a> <a href="#" data-id="' +
                    row.id + '" data-action="delete">Delete</a>';
              }
            }
          ],
        }).on('dblclick', 'tr', function(e) {
          // If left mouse button was used, move to location.
          if (e.which === 1) {
            var table = $(this).closest('table');
            var data =  $(table).DataTable().row(this).data();
            selectLocation(data);
          }
        }).on('click', 'a[data-action=select-location]', function() {
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let loc =  $(table).DataTable().row(tr).data();
          selectLocation(loc);
        }).on('click', 'a[data-action=delete]', function() {
          if (!confirm("Are you sure you want to delete the landmark and its location from this group?")) {
            return;
          }
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let loc =  $(table).DataTable().row(tr).data();
          let landmarks = locationLandmarkIndex.get(loc.id);

          if (!landmarks || !landmarks.length) {
            // Remove location from group
            CATMAID.Landmarks.removeLandmarkLocationFromGroup(project.id,
                widget.editLandmarkGroup, loc.id)
              .then(function() {
                CATMAID.msg("Success", "Deleted location link from group");
                widget.update();
              })
              .catch(CATMAID.handleError);
          } else {
            let landmarkIds = landmarks.map(function(l) { return l.id; });
            // Get linked location(s) for landmark in edited group.
            Promise.all([
                CATMAID.Landmarks.removeLandmarkLocationFromGroup(project.id,
                    widget.editLandmarkGroup, loc.id),
                CATMAID.Landmarks.deleteAll(project.id, landmarkIds)
              ])
              .then(function() {
                CATMAID.msg("Success", "Deleted landmark and location");
                widget.update();
              })
              .catch(CATMAID.handleError);
          }
        });

        // Controls to put this group into relation with another group.
        var landmarkGroupLinksHeader = content.appendChild(document.createElement('h1'));
        landmarkGroupLinksHeader.appendChild(document.createTextNode('Add new landmark group link'));
        content.appendChild(landmarkGroupLinksHeader);

        // Select source group and default select currently edited group
        let newGroupLinkPanel = content.appendChild(document.createElement('div'));
        newGroupLinkPanel.classList.add('buttonpanel');

        // Group A select
        let groupASelectWrapper = newGroupLinkPanel.appendChild(document.createElement('span'));
        let groupASelect = null;

        // Relation
        let relationSelectWrapper = newGroupLinkPanel.appendChild(document.createElement('span'));
        let relationSelect = null;

        // Group B select
        let groupBSelectWrapper = newGroupLinkPanel.appendChild(document.createElement('span'));
        let groupBSelect = null;

        // Once data is available, fill in actual link related controls
        landmarkGroupDetails
          .then(function() {
            let landmarkGroupOptions = Array.from(widget.landmarkGroupIndex.keys()).map(function(lg) {
              let g = widget.landmarkGroupIndex.get(lg);
              return {
                title: g.name,
                value: g.id
              };
            });
            let groupADefault = widget.editGroupDefaultsToAInLink ?
                widget.editLandmarkGroup : undefined;
            let labeledGroupASelect = CATMAID.DOM.createLabeledControl('Group A:',
                CATMAID.DOM.createSelect('landmarkgroups-edit-group-a' + widget.widgetID,
                landmarkGroupOptions, groupADefault, CATMAID.noop)).get(0);
            groupASelect = $('select', labeledGroupASelect).get(0);
            groupASelectWrapper.appendChild(labeledGroupASelect);
            if (groupADefault) {
              groupASelect.setAttribute('disabled', 'true');
            }

            let groupBDefault = widget.editGroupDefaultsToAInLink ?
                undefined : widget.editLandmarkGroup;
            let labeledGroupBSelect = CATMAID.DOM.createLabeledControl('with Group B:',
                CATMAID.DOM.createSelect('landmarkgroups-edit-group-b' + widget.widgetID,
                landmarkGroupOptions, groupBDefault, function() {

                })).get(0);
            groupBSelect = $('select', labeledGroupBSelect).get(0);
            groupBSelectWrapper.appendChild(labeledGroupBSelect);
            if (groupBDefault) {
              groupBSelect.setAttribute('disabeld', 'true');
            }
          })
          .catch(CATMAID.handleError);

        // Load available relations and fill select element
        CATMAID.Relations.list(project.id)
          .then(function(relationMap) {
            let relationNames = Object.keys(relationMap);
            let invRelationMap = relationNames.reduce(function(o, name) {
              o[relationMap[name]] = name;
              return o;
            }, {});
            let relations = relationNames
                .filter(name => widget.allowedRelationNames.has(name))
                .map(function(name) {
                  return { title: name, value: relationMap[name] };
                });
            let defaultRelation = relationMap[widget.editLinkRelation];
            // Relation select
            let labeledRelationSelect = CATMAID.DOM.createLabeledControl(
              'in Relation: ', CATMAID.DOM.createSelect('landmarkgroups-edit-relation' + widget.widgetID,
              relations, defaultRelation, function() {
                widget.editLinkRelation = invRelationMap[this.value];
              })).get(0);
            relationSelect = $('select', labeledRelationSelect).get(0);
            relationSelectWrapper.appendChild(labeledRelationSelect);
          })
          .catch(CATMAID.handleError);

        // Switch button
        let switchGroupsButton = newGroupLinkPanel.appendChild(document.createElement('button'));
        switchGroupsButton.appendChild(document.createTextNode('Switch'));
        switchGroupsButton.onclick = function(e) {
          let groupAId = groupASelect.value;
          let groupBId = groupBSelect.value;
          groupASelect.value = groupBId;
          groupBSelect.value = groupAId;
          if (groupAId == widget.editLandmarkGroup) {
            groupASelect.removeAttribute('disabled');
            groupBSelect.setAttribute('disabled', 'true');
          } else {
            groupASelect.setAttribute('disabled', 'true');
            groupBSelect.removeAttribute('disabled');
          }
        };

        // Add button
        var addLinkButton = newGroupLinkPanel.appendChild(document.createElement('button'));
        addLinkButton.appendChild(document.createTextNode('Add new group link'));
        addLinkButton.onclick = function(e) {
          let edtitedGroupIsSubject = true;

          let groupAId = parseInt(groupASelect.value, 10);
          let groupBId = parseInt(groupBSelect.value, 10);
          let relationId = parseInt(relationSelect.value, 10);
          CATMAID.Landmarks.addLandmarkGroupLink(project.id, groupAId,
              groupBId, relationId)
            .then(function(result) {
              if (result.created) {
                CATMAID.msg("Success", "Create new landmark group link");
              } else {
                CATMAID.msg("Existing link used", "No new landmark group link created");
              }
              widget.update();
            })
            .catch(CATMAID.handleError);
        };

        // Controls to put this group into relation with another group.
        var landmarkGroupLinksHeader = content.appendChild(document.createElement('h1'));
        landmarkGroupLinksHeader.appendChild(document.createTextNode('Landmark group links'));
        content.appendChild(landmarkGroupLinksHeader);

        // List existing relations
        var relationMap = new Map();
        var relationTable = document.createElement('table');
        var relationTableWrapper = document.createElement('div');
        relationTableWrapper.classList.add('container');
        relationTableWrapper.appendChild(relationTable);
        content.appendChild(relationTableWrapper);
        var relationDataTable = $(relationTable).DataTable({
          dom: "lfrtip",
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            landmarkGroupDetails
              .then(function(result) {
                let group = widget.landmarkGroupIndex.get(widget.editLandmarkGroup);
                let groupData;
                if (group) {
                  groupData = group.links;
                  relationMap = new Map(group.used_relations);
                } else {
                  CATMAID.warn('Could not find data for landmark group #' + widget.editLandmarkGroup);
                  groupData = [];
                }

                // Populate index that maps location IDs to landmarks.
                makeLocationLandmarkIndex(group, widget.landmarkIndex, locationLandmarkIndex);

                // Call table update
                callback({
                  draw: data.draw,
                  data: groupData,
                  recordsTotal: groupData.length,
                  recordsFiltered: groupData.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [],
          columns: [
            {
              title: '<input type="checkbox" data-action="select-all-relations" />',
              orderable: false,
              class: "cm-center",
              width: "5%",
              render: function(data, type, row, meta) {
                let selected = widget.selectedLandmarks.has(row.id);
                if (type === 'display') {
                  return '<input type="checkbox" data-action="select-relation" value="' +
                      row.id + '" ' + (selected ? 'checked' : '') + ' />';
                }
                return selected;
              }
            },
            {
              data: "id",
              title: "Link ID",
              width: "10%",
              orderable: true,
              class: "cm-center",
              render: function(data, type, row, meta) {
                return row.id;
              }
            },
            {
              title: "Landmark group 1",
              orderable: true,
              class: "cm-center",
              render: function(data, type, row, meta) {
                let group = widget.landmarkGroupIndex.get(row.subject_id);
                if (type === 'display') {
                  return '<a href="#" data-action="select-landmark-group" data-id="' +
                      group.id + '" >' + group.name + ' (' + group.id + ')</a>';
                } else {
                  return group.name;
                }
              }
            },
            {
              title: "Relation",
              orderable: true,
              class: "cm-center",
              render: function(data, type, row, meta) {
                let relationName = relationMap.get(row.relation_id);
                return relationName;
              }
            },
            {
              title: "Landmark group 2",
              orderable: true,
              class: "cm-center",
              render: function(data, type, row, meta) {
                let group = widget.landmarkGroupIndex.get(row.object_id);
                if (type === 'display') {
                  return '<a href="#" data-action="select-landmark-group" data-id="' +
                      group.id + '" >' + group.name + ' (' + group.id + ')</a>';
                } else {
                  return group.name;
                }
              }
            },
            {
              title: "Action",
              class: "cm-center",
              width: "10%",
              orderable: false,
              render: function(data, type, row, meta) {
                return '<a href="#" data-id="' +
                    row.id + '" data-action="delete">Delete</a>';
              }
            }
          ],
        }).on('click', 'a[data-action=delete]', function() {
          var table = $(this).closest('table');
          var tr = $(this).closest('tr');
          var link =  $(table).DataTable().row(tr).data();
          if (!confirm("Are you sure you want to delete the link to group " + link.name + "?")) {
            return;
          }
          CATMAID.Landmarks.deleteLandmarkGroupLink(project.id, link.id)
            .then(function(result) {
              CATMAID.msg("Success", "Deleted landmark group link #" + link.id);
              widget.update();
            })
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-action=select-landmark-group]', function() {
          widget.editLandmarkGroup = parseInt(this.dataset.id);
          widget.setMode('edit');
        });
      }
    },
    import: {
      title: 'Import',
      createControls: function(target) {
        return [
          {
            type: 'button',
            label: 'Clear view',
            onclick: function() {
              target.resetImportView();
            }
          },
          {
            type: 'file',
            id: 'csv-import-' + target.widgetID,
            label: 'Open CSV Files',
            multiple: true,
            onclick: function(e) {
              target.filesToImport = e.target.files;
              target.update();
            }
          },
          {
            type: 'numeric',
            label: 'Skip first N lines',
            length: 3,
            onchange: function(e) {
              target.importCSVLineSkip = parseInt(this.value, 10);
              target.update();
            },
            value: target.importCSVLineSkip
          },
          {
            type: 'checkbox',
            label: 'Allow non-empty groups',
            onclick: function(e) {
              target.importAllowNonEmptyGroups = this.checked;
            },
            value: target.importAllowNonEmptyGroups
          },
          {
            type: 'checkbox',
            label: 'Create non-existing groups',
            onclick: function(e) {
              target.importCreateNonExistingGroups = this.checked;
            },
            value: target.importCreateNonExistingGroups
          },
          {
            type: 'checkbox',
            label: 'Re-use existing landmarks',
            onclick: function(e) {
              target.importReuseExistingLandmarks = this.checked;
            },
            value: target.importReuseExistingLandmarks
          }
        ];
      },
      createContent: function(content, widget) {
        if (widget.filesToImport && widget.filesToImport.length > 0) {
          // Show files to import in table and allow user to assign a group to
          // each one.
          var table = document.createElement('table');
          var thead = table.appendChild(document.createElement('thead'));
          var thtr  = thead.appendChild(document.createElement('tr'));
          thtr.appendChild(document.createElement('th'))
              .appendChild(document.createTextNode('File'));
          thtr.appendChild(document.createElement('th'))
              .appendChild(document.createTextNode('Landmark group'));

          var tbody = table.appendChild(document.createElement('tbody'));
          var groupFields = [];
          var contentElements = [];
          for (let i=0; i<widget.filesToImport.length; ++i) {
            let groupSelector = document.createElement('input');
            groupFields.push(groupSelector);
            let filePath = widget.filesToImport[i].name;
            let tr = tbody.appendChild(document.createElement('tr'));
            let filePathElement = document.createElement('span');
            filePathElement.classList.add('file-path');
            let contentElement = document.createElement('span');
            contentElement.classList.add('file-content');
            contentElements.push(contentElement);
            filePathElement.appendChild(document.createTextNode(filePath));
            let fileCell = document.createElement('td');
            fileCell.appendChild(filePathElement);
            fileCell.appendChild(contentElement);
            tr.appendChild(fileCell);
            let td2 = tr.appendChild(document.createElement('td'));
            td2.appendChild(groupSelector);
            td2.classList.add('cm-center');
          }
          content.appendChild(table);

          // Load selected CSV files and enable import button if this worked
          // without problems.
          let importList = [];
          let parsePromises = [];
          for (let i=0; i<widget.filesToImport.length; ++i) {
            let file = widget.filesToImport[i];
            let promise = CATMAID.parseCSVFile(file, ',',
                widget.importCSVLineSkip, hasFourElements);
            parsePromises.push(promise);
          }

          // The actual import button, disabled initially
          let p = document.createElement('p');
          p.classList.add('right');
          let importButton = p.appendChild(document.createElement('button'));
          importButton.setAttribute('disabled', '');
          importButton.appendChild(document.createTextNode('Import'));
          importButton.onclick = function(e) {
            Promise.all(parsePromises)
              .then(function(parsedFiles) {
                let importList = [];
                for (let i=0; i<parsedFiles.length; ++i) {
                  let fileContent = parsedFiles[i];
                  let group = groupFields[i];
                  if (!group) {
                    throw new CATMAID.ValueError("Can't find " + i + ". group assignment");
                  }
                  if (group.value.length === 0) {
                    CATMAID.error("Please provide all group names");
                    return;
                  }
                  importList.push([group.value, fileContent]);
                }
                return CATMAID.Landmarks.import(project.id, importList)
                  .then(function(result) {
                    CATMAID.msg("Success", "Import successful");
                    widget.resetImportView();
                  });
              })
              .catch(CATMAID.handleError);
          };

          Promise.all(parsePromises)
            .then(function(parsedFiles) {
              // Show first line of file in table
              for (let i=0; i<parsedFiles.length; ++i) {
                let data = parsedFiles[i];
                if (data && data.length > 0) {
                  let firstLine = "First line: " + data[0].join(", ");
                  contentElements[i].appendChild(document.createTextNode(firstLine));
                } else {
                  contentElements[i].appendChild(document.createTextNode('No valid content found'));
                }
              }

              // Enable import button once files were parsed without error
              importButton.disabled = false;
            })
            .catch(CATMAID.handleError);

          content.appendChild(p);
        } else {
          content.appendChild(document.createElement('p'))
            .appendChild(document.createTextNode('Import landmarks, landmark ' +
              'groups and locations from CSV files. Add files by clicking the ' +
              '"Open Files" button. Files are expected to have four columns: ' +
              'landmark name, x, y, z. The coordinate is expected to be in ' +
              'project/world space.'));
        }
      }
    },
    display: {
      title: 'Display',
      createControls: function(target) {
        let target3dViewerSelect = document.createElement('span');
        target3dViewerSelect.setAttribute('data-role', 'display-target');
        target.updateTargetSelect(target3dViewerSelect);

        let colorButton = document.createElement('span');
        CATMAID.DOM.appendColorButton(colorButton, 'c',
            'Override color for landmark display',
            undefined, function(colorRGB, alpha, colorChanged, alphaChanged, colorHex) {
              target._overrideColor = '#' + colorHex;
              target._overrideAlpha = alpha;
              target.updateLandmarkLayers();
            }, {
              initialColor: target._overrideColor,
              initialAlpha: target._overrideAlpha
            });
        return [
          {
            type: 'button',
            label: 'Clear display',
            onclick: function() {
              target.clearDisplay();
            }
          },
          {
            type: 'child',
            element: target3dViewerSelect
          },
          {
            type: 'button',
            label: 'Refresh display',
            onclick: function() {
              target.updateDisplay();
            }
          },
          {
            type: 'checkbox',
            value: target.useReversePointMatches,
            label: 'Use reverse point matches',
            title: 'This will add all point maches between two landmark ' +
                'groups also as their reverse match, which is mainly useful ' +
                'for mirroring operations.',
            onclick: function() {
              target.useReversePointMatches = this.checked;
              target.updateDisplay();
            }
          },
          {
            type: 'checkbox',
            value: target.showLandmarkLayers,
            label: 'Show landmark layers',
            onclick: function() {
              target.showLandmarkLayers = this.checked;
              target.updateLandmarkLayers();
            }
          },
          {
            type: 'numeric',
            value: target.nodeScaling,
            label: 'Node scaling',
            length: 3,
            onchange: function() {
              let val = parseFloat(this.value);
              if (!Number.isNaN(val)) {
                target.nodeScaling = val;
                target.updateLandmarkLayers();
              }
            }
          },
          {
            type: 'checkbox',
            value: target.overrideColor,
            label: 'Override color',
            onclick: function() {
              target.overrideColor = this.checked;
              target.updateLandmarkLayers();
            }
          },
          {
            type: 'child',
            element: colorButton
          },
          {
            type: 'checkbox',
            value: target.applyTransformation,
            label: 'Apply transformation',
            onclick: function() {
              target.applyTransformation = this.checked;
              target.update();
            },
          },
          {
            type: 'checkbox',
            value: target.showOtherProjectOptions,
            label: 'Source other projects',
            onclick: function() {
              target.showOtherProjectOptions = this.checked;
              target.update();
            },
          },
          {
            type: 'checkbox',
            value: target.showMultiMappingOptions,
            label: 'Multiple mappings',
            onclick: function() {
              target.showMultiMappingOptions = this.checked;
              target.update();
            },
          },
        ];
      },
      createContent: function(content, widget) {
        content.appendChild(document.createElement('p'))
          .appendChild(document.createTextNode('Display landmarks and ' +
            'landmark groups at their linked locations in CATMAID\'s 3D ' +
            'Viewer. Select a target 3D Viewer and decide below which ' +
            'source and target landmark groups to use for an input ' +
            'Skeleton Source.'));

        // Create new display transformations, which take one skeleton source
        // as well as a source and target landmark group.
        var newDisplayTransformationContainer = document.createElement('div');
        newDisplayTransformationContainer.classList.add('clear');
        newDisplayTransformationContainer.appendChild(document.createElement('h1'))
            .appendChild(document.createTextNode('New display transformation'));
        let newDTForm = newDisplayTransformationContainer.appendChild(
            document.createElement('p'));

        let groupOptions;

        let sourceSelectSetting, sourceGroup;
        let sourceRemote = '';
        let sourceProject = project.id;
        let sourceNeuronAnnotation = '';

        // Find selected remote configuration based on name
        let getRemote = function() {
          let remoteConfigs = CATMAID.Client.Settings.session.remote_catmaid_instances;
          if (!remoteConfigs) {
            CATMAID.warn("No configured remote instances found");
            return;
          }
          let remote = remoteConfigs.filter(function(rc) {
            return rc.name === sourceRemote;
          });
          if (remote.length === 0) {
            CATMAID.warn("No matching remote found");
            return;
          }
          if (remote.length > 1) {
            CATMAID.warn("Found more than one matching remote config");
            return;
          }
          return CATMAID.API.fromSetting(remote[0]);
        };

        if (widget.showOtherProjectOptions) {
          // Remote select
          let remoteOptions = CATMAID.Client.Settings.session.remote_catmaid_instances.reduce(function(o, rci) {
            o.push({
              title: rci.name,
              value: rci.name,
            });
            return o;
          }, [{
            title: 'Local',
            value: '',
          }]);

          // Project select
          let getProjectList = function() {
            if (!sourceRemote || sourceRemote.length === 0) {
              return Promise.resolve(CATMAID.client.projects.map(function(p) {
                return {
                  title: p.title + ' (' + p.id + ')',
                  value: p.id,
                };
              }));
            } else {
              // In case, no particular source remote is defined, we use the local instance.
              // Find selected remote configuration based on name
              let remoteConfigs = CATMAID.Client.Settings.session.remote_catmaid_instances;
              if (!remoteConfigs) {
                return Promise.reject("No configured remote instances found");
              }
              let remote = remoteConfigs.filter(function(rc) {
                return rc.name === sourceRemote;
              });
              if (remote.length === 0) {
                return Promise.reject("No matching remote found");
              }
              if (remote.length > 1) {
                return Promise.reject("Found more than one matching remote config");
              }
              // Expect exactly one matching remote.
              let api = new CATMAID.API.fromSetting(remote[0]);
              // Fetch projects from remote.
              return CATMAID.fetch({
                  url: '/projects/',
                  method: 'GET',
                  api: api,
                }).then(projects => {
                  return projects.map(p => {
                    return {
                      title: p.title + ' (' + p.id + ')',
                      value: p.id,
                    };
                  });
                });
            }
          };

          var initProjectList = function() {
            return getProjectList()
              .then(projects => {
                let projectSelect = CATMAID.DOM.createRadioSelect('Source project',
                    projects, sourceProject, true, 'selected');
                projectSelect.onchange = function(e) {
                  sourceProject = parseInt(e.target.value, 10);

                  // If the source project is the current project, the regular source
                  // select and source group select are shown. Otherwise hidden.
                  let currentProjectMode = sourceProject == project.id ? 'block' : 'none';
                  //sourceSelectSetting.style.display = currentProjectMode;
                  //sourceGroup.style.display = currentProjectMode;

                  updateSourceGroupList();
                  if (updateMatchingGroupList) {
                    updateMatchingGroupList();
                  }
                };
                return projectSelect;
              });
          };

          // Remote select
          let remoteSelect = CATMAID.DOM.createRadioSelect('Source instance',
              remoteOptions, sourceRemote, true, 'selected', 'Local');
          let remoteSelectSetting = CATMAID.DOM.createLabeledControl("Source remote",
              remoteSelect, "Select the source CATMAID instance that contains " +
              "the source skeletons. The current remote is selected by default.");
          remoteSelect.onchange = function(e) {
            sourceRemote = e.target.value;
            sourceProject = null;
            // Try to get all projects from the selected remote and update the
            // displayed project options.
            updateProjectList();
            updateSourceGroupList();
            if (updateMatchingGroupList) {
              updateMatchingGroupList();
            }
          };
          $(newDTForm).append(remoteSelectSetting);

          // Project select
          var projectSelectSettingWrapper = document.createElement('span');
          var updateProjectList = function() {
            while (projectSelectSettingWrapper.lastChild) {
              projectSelectSettingWrapper.removeChild(projectSelectSettingWrapper.lastChild);
            }
            let projectSelectSetting = CATMAID.DOM.createLabeledAsyncPlaceholder("Source project",
                initProjectList(), "Select the project that contains the source " +
                "skeletons. The current project is selected by default.");
            projectSelectSettingWrapper.appendChild(projectSelectSetting);
          };

          updateProjectList();
          $(newDTForm).append(projectSelectSettingWrapper);

          // Remote annotation to filter neurons
          var remoteAnnotationInput = CATMAID.DOM.createInputSetting(
              "Source skeleton annotation",
              sourceNeuronAnnotation,
              "An annotation that is used to get neurons from the remote instance before they are locally transformed",
              function() {
                sourceNeuronAnnotation = this.value.trim();
              });
          $(newDTForm).append(remoteAnnotationInput);

          // Preview button
          let remotePreviewButton = document.createElement('button');
          remotePreviewButton.appendChild(document.createTextNode('Preview'));
          remotePreviewButton.onclick = function() {
            if (!sourceProject) {
              CATMAID.warn("No source project selected");
              return;
            }
            if (!sourceNeuronAnnotation || sourceNeuronAnnotation.trim().length === 0) {
              CATMAID.warn("No annotation provided");
              return;
            }
            let rc;
            if (sourceRemote.length > 0) {
              rc = getRemote();
              if (!rc) {
                return;
              }
            }
            previewRemoteSkeletons(rc, sourceProject, sourceNeuronAnnotation);
          };
          $('input', remoteAnnotationInput).after(remotePreviewButton);
        } else {
          let sourceSelect = CATMAID.skeletonListSources.createUnboundSelect();
          sourceSelectSetting = CATMAID.DOM.createLabeledControl("Skeleton source",
              sourceSelect, "Select which skeletons to virtually transform");
          var skeletonSource = sourceSelect.value;
          sourceSelect.onchange = function(e) {
            skeletonSource = e.target.value;
          };
          $(newDTForm).append(sourceSelectSetting);
        }

        let srcToStr = function(m) {
          // If a dedicated source index is available, use it.
          let src = widget.sourceLandmarkGroupIndex || widget.landmarkGroupIndex;
          let g = src.get(m[0]);
          return `${g.name} (${g.id})`;
        };

        let targetToStr = function(m) {
          let g = widget.landmarkGroupIndex.get(m[1]);
          return `${g.name} (${g.id})`;
        };

        let existingDisplayTransformationsContainer = document.createElement('div');
        existingDisplayTransformationsContainer.classList.add('clear');
        existingDisplayTransformationsContainer.appendChild(document.createElement('h1'))
            .appendChild(document.createTextNode('Existing display transformations'));
        let existingDTTable = existingDisplayTransformationsContainer.appendChild(
            document.createElement('table'));
        let existingDTDataTable = $(existingDTTable).DataTable({
          data: widget.displayTransformations,
          autoWidth: false,
          order: [],
          columns: [
            {
              orderable: false,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return meta.row + 1;
              },
            },
            {
              data: 'skeletons',
              class: 'cm-center',
              title: 'Skeletons',
              orderable: false,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  return data.map(m => m.api ? `${m.id} (${m.api.name})` : m.id).join(', ');
                }
                return data;
              }
            },

            {
              data: 'mappings',
              class: 'cm-center',
              title: 'Source landmark groups',
              orderable: false,
              render: function(data, type, row, meta) {
                if (widget.landmarkGroupIndex) {
                  let groups = data.map(srcToStr);
                  if (groups) {
                    return groups.join(', ');
                  }
                }
                return data;
              }
            },
            {
              data: 'mappings',
              class: 'cm-center',
              title: 'Target landmark group',
              orderable: false,
              render: function(data, type, row, meta) {
                if (widget.landmarkGroupIndex) {
                  let groups = data.map(targetToStr);
                  if (groups) {
                    return groups.join(', ');
                  }
                }
                return data;
              }
            },
            {
              title: "Color",
              type: "hslcolor",
              class: "dt-center cm-center",
              render: {
                "_": function(data, type, row, meta) {
                  return row.color.getHSL({});
                },
                "display": function(data, type, row, meta) {
                  var color = row.skeletons.length === 0 ? color.getHexString() :
                      row.skeletons[0].color.getHexString();
                  return '<button class="action-changecolor" value="#' +
                      color + '" style="background-color: #' + color + ';color: ' +
                      CATMAID.tools.getContrastColor(color) + '">color</button>';
                }
              }
            },
            {
              title: 'Action',
              class: 'cm-center',
              orderable: false,
              render: function(data, type, row, meta) {
                return '<a href="#" data-action="delete-transformation">Delete</a>';
              }
            }
          ]
        }).on('click', 'a[data-action=delete-transformation]', function() {
          let tr = $(this).closest('tr');
          let row = existingDTDataTable.row(tr);
          let data = row.data();
          if (!confirm("Are you sure you want to delete transformation " +
              (row.index() + 1) + "?")) {
            return;
          }
          widget.removeLandmarkTransformation(data);
          widget.update();
        })
        .on("click", "td .action-changecolor", this, function(e) {
          let tr = $(this).closest('tr');
          let dt = existingDTDataTable.row(tr).data();
          CATMAID.ColorPicker.toggle(this, {
            onColorChange: function(colorRGB, alpha, colorChanged, alphaChanged, colorHex) {
              let c = '#' + colorHex;
              for (let sm of dt.skeletons) {
                sm.color.setStyle(c);
                sm.opacity = alpha;
              }
              widget.updateLandmarkLayers();
              widget.updateStyle();
            }
          });
        });

        // Project select
        let getSourceGroupList = function() {
          if (!sourceRemote || sourceRemote.length === 0) {
            return Promise.resolve(groupOptions);
          } else if (!sourceProject) {
            return Promise.resolve([]);
          } else {
            let api = getRemote();
            // Fetch projects from remote
            return widget.updateSourceLandmarksAndGroups(api, sourceProject)
              .then(results => {
                return widget.sourceLandmarkGroups
                  .sort((a,b) => CATMAID.tools.compareStrings(a.name, b.name))
                  .map(p => {
                  return {
                    title: p.name,
                    value: p.id,
                  };
                });
               });
          }
        };

        var fromGroup, toGroup;
        let activeMappings = [];

        let sourceGroupCache;
        var initSourceGroupList = function() {
          return getSourceGroupList()
            .then(groups => {
              sourceGroupCache = groups;
              let sourceSelect = CATMAID.DOM.createRadioSelect('Source landmark group',
                  groups, undefined, true, 'selected');
              sourceSelect.onchange = function(e) {
                fromGroup = e.target.value;
              };
              return sourceSelect;
            });
        };

        // Source select
        let sourceGroupWrapper = document.createElement('span');
        var updateSourceGroupList = function() {
          while (sourceGroupWrapper.lastChild) {
            sourceGroupWrapper.removeChild(sourceGroupWrapper.lastChild);
          }
          let sourceGroupSetting = CATMAID.DOM.createLabeledAsyncPlaceholder("Source group",
              initSourceGroupList(), "Select the remote source landmark group, the space " +
              "from which input points are transformed.");
          sourceGroupWrapper.appendChild(sourceGroupSetting);
        };

        // Target select
        let targetGroupWrapper = document.createElement('span');

        // This is populated depending on the configuration mode.
        var updateMatchingGroupList = null;

        // Add additonal settings that need updated groups
        widget.updateLandmarksAndGroups()
            .then(function(result) {
              let groups = result[1];
              groupOptions = groups
                  .sort((a,b) => CATMAID.tools.compareStrings(a.name, b.name))
                  .map(function(g) {
                    return {
                      title: g.name,
                      value: g.id
                    };
                  });

              updateSourceGroupList();
              $(newDTForm).append(sourceGroupWrapper);

              // Target select
              let targetSelect = CATMAID.DOM.createRadioSelect('Target landmark groups',
                  groupOptions, undefined, true, 'selected');
              let targetGroup = CATMAID.DOM.createLabeledControl("Target group",
                targetSelect, "Select the target landmark group, the space to " +
                "which input points are transformed.");
              targetSelect.onchange = function(e) {
                toGroup = e.target.value;
              };
              $(targetGroupWrapper).append(targetGroup);
              $(newDTForm).append(targetGroupWrapper);

              // Optionally, multiple mappings can be defined.
              if (widget.showMultiMappingOptions) {
                let componentList = $('<select/>').addClass('multiline wide-select').attr('size', '4')[0];
                let mappingList = CATMAID.DOM.createLabeledControl('Additional mappings', componentList,
                  "The list of known CATMAID instances that can be used to " +
                  "e.g. retrieve tracing data.", 'cm-top');
                $(newDTForm).append(mappingList);

                // Add selected mapping
                let getMapping = function (fromGroup, toGroup) {
                  if (!fromGroup) {
                    CATMAID.error("Need source landmark group");
                    return;
                  }
                  let fg = parseInt(fromGroup, 10);
                  if (!toGroup) {
                    CATMAID.error("Need target landmark group");
                    return;
                  }
                  let tg = parseInt(toGroup, 10);

                  let src = widget.sourceLandmarkGroupIndex ?
                      widget.sourceLandmarkGroupIndex : widget.landmarkGroupIndex;
                  if (!src.has(fg)) {
                    CATMAID.error("Source landmark group not found");
                    return;
                  }
                  if (!widget.landmarkGroupIndex.has(tg)) {
                    CATMAID.error("Target landmark group not found");
                    return;
                  }

                  return {
                    fromGroup: src.get(fg),
                    toGroup: widget.landmarkGroupIndex.get(tg),
                  };
                };
                var addMappingButton = $('<button/>').text('Add new mapping').click(function() {
                  let mapping = getMapping(fromGroup, toGroup);
                  if (mapping) {
                    activeMappings.push(mapping);
                  }

                  updateComponentList();
                });
                $(newDTForm).append(CATMAID.DOM.createLabeledControl('', addMappingButton,
                    'Add the currently selected source group and target group as mapping.'));

                // Remove selected remote instance
                var removeButton = $('<button/>').text('Remove mapping').click(function() {
                  if (componentList.selectedIndex < componentList.length) {
                    activeMappings.splice(componentList.selectedIndex, 1);
                    updateComponentList();
                  }
                });
                $(newDTForm).append(CATMAID.DOM.createLabeledControl('', removeButton, "Remove " +
                    "the mapping selected in the list above."));

                var matchingGroups, selectedMatchingGroups;
                // Add multple mappings at once based on name matching
                var initMatchingGroups = function() {
                  return getSourceGroupList()
                    .then(sourceGroups => {
                      // TODO should allow regex/substitution of names before matching
                      // TODO assumes names are not duplicated
                      // TODO quadratic implementation for simplicity.
                      let sourceGroupNames = new Set(sourceGroups.map(g => g.title));
                      let targetGroupNames = new Set(groupOptions.map(g => g.title));
                      let matchingNames = sourceGroupNames.intersection(targetGroupNames);
                      matchingGroups = [...matchingNames].reduce((m, name) => {
                        m[name] = {
                          sourceId: sourceGroups.find(g => g.title === name).value,
                          targetId: groupOptions.find(g => g.title === name).value
                        };
                        return m;
                      }, {});
                      let matchingOptions = [...matchingNames].map(name =>
                          ({title: name, value: name}));

                      let container = document.createElement('span');
                      let matchingSelect = CATMAID.DOM.createCheckboxSelectPanel(
                          matchingOptions, undefined, true);
                      selectedMatchingGroups = new Set();
                      matchingSelect.onchange = function(e) {
                        if (e.target.checked) selectedMatchingGroups.add(e.target.value);
                        else selectedMatchingGroups.delete(e.target.value);
                      };
                      container.appendChild(matchingSelect);

                      container.appendChild(document.createElement('hr'));

                      let selectPatternInput = document.createElement('input');
                      selectPatternInput.setAttribute('type', 'text');
                      selectPatternInput.setAttribute('placeholder', 'Use / for RegEx');
                      selectPatternInput.onclick = function(e) {
                        e.cancelBubble = true;
                        if (e.stopPropagation) e.stopPropagation();
                      };
                      container.appendChild(selectPatternInput);

                      let selectPatternButton = document.createElement('button');
                      selectPatternButton.appendChild(document.createTextNode('Select pattern'));
                      selectPatternButton.onclick = function (e) {
                        e.cancelBubble = true;
                        if (e.stopPropagation) e.stopPropagation();

                        let pattern = selectPatternInput.value;
                        let forceUnselected = pattern.length === 0;

                        selectedMatchingGroups.clear();

                        let regEx = pattern[0] === '/' ? new RegExp(pattern.substr(1)) : null;
                        container.querySelectorAll('input[type=checkbox][data-role=option]').forEach(ie => {
                          ie.checked = forceUnselected ? false :
                              (regEx ? regEx.test(ie.value) : ie.value.indexOf(pattern) !== -1);
                          if (ie.checked) selectedMatchingGroups.add(ie.value);
                          else selectedMatchingGroups.delete(ie.value);
                        });
                      };
                      container.appendChild(selectPatternButton);

                      container.appendChild(document.createElement('hr'));

                      let addMatchingButton = document.createElement('button');
                      addMatchingButton.appendChild(document.createTextNode('Add selected mappings'));
                      addMatchingButton.onclick = function () {
                        let selectedMappings = [...selectedMatchingGroups].map(name =>
                          getMapping(matchingGroups[name].sourceId, matchingGroups[name].targetId)
                        ).filter(m => !!m);
                        if (selectedMappings.length > 0) {
                          activeMappings.push(...selectedMappings);
                        } else {
                          CATMAID.warn("No valid mappings found");
                        }

                        updateComponentList();
                      };
                      container.appendChild(addMatchingButton);

                      let matchingPanel = CATMAID.DOM.createCustomContentSelect(
                          'Matching groups', container);
                      return matchingPanel;
                    });
                };

                // Source select
                let addMatchingWrapper = document.createElement('span');
                updateMatchingGroupList = function() {
                  while (addMatchingWrapper.lastChild) {
                    addMatchingWrapper.removeChild(addMatchingWrapper.lastChild);
                  }
                  let matchingMapping = CATMAID.DOM.createLabeledAsyncPlaceholder(
                      '',
                      initMatchingGroups(),
                      'Add multiple mappings at once by selecting them from matching group names.');
                  addMatchingWrapper.appendChild(matchingMapping);
                };

                updateMatchingGroupList();
                $(newDTForm).append(addMatchingWrapper);


                // Pattern match selection
                var filterAddMatchingInputA = $('<input/>')
                    .attr('type', 'text')
                    .attr('placeholder', 'S Filter - use / for RegEx');
                var patternAddMatchingInputA = $('<input/>')
                    .attr('type', 'text')
                    .attr('placeholder', 'S Pattern - use / for RegEx');
                var matchingInputA = $('<span />')
                    .add(filterAddMatchingInputA)
                    .add(patternAddMatchingInputA);
                $(newDTForm).append(CATMAID.DOM.createLabeledControl('', matchingInputA));
                var filterAddMatchingInputB = $('<input/>')
                    .attr('type', 'text')
                    .attr('placeholder', 'T Filter - use / for RegEx');
                var patternAddMatchingInputB = $('<input/>')
                    .attr('type', 'text')
                    .attr('placeholder', 'T Pattern B - use / for RegEx');
                var matchingInputB = $('<span />')
                    .add(filterAddMatchingInputB)
                    .add(patternAddMatchingInputB);
                $(newDTForm).append(CATMAID.DOM.createLabeledControl('', matchingInputB));

                var addMatchingPattern = $('<button/>').text('Add pattern mapping').click(function() {
                  let rawFilterS = filterAddMatchingInputA.val();
                  let rawFilterT = filterAddMatchingInputB.val();
                  let filterS = rawFilterS[0] === '/' ? new RegExp(rawFilterS.substr(1)) : null;
                  let filterT = rawFilterT[0] === '/' ? new RegExp(rawFilterT.substr(1)) : null;

                  let patternA = patternAddMatchingInputA.val();
                  let patternB = patternAddMatchingInputB.val();
                  let searchA = patternA[0] === '/' ? new RegExp(patternA.substr(1)) : patternA;
                  let searchB = patternB[0] === '/' ? new RegExp(patternB.substr(1)) : patternB;

                  if (!sourceGroupCache) {
                    CATMAID.warn('Source groups unavailable');
                    return;
                  }

                  let sourceBaseMap = new Map();
                  let sourceIgnore = new Set();
                  for (let sourceGroup of sourceGroupCache) {
                    if (filterS) {
                      if (!filterS.test(sourceGroup.title)) continue;
                    } else {
                      if (sourceGroup.title.indexOf(rawFilterS) === -1) continue;
                    }

                    let baseName = sourceGroup.title.replace(searchA, '');
                    if (sourceIgnore.has(baseName)) {
                      continue;
                    }
                    if (sourceBaseMap.has(baseName)) {
                      CATMAID.warn(`Found base name "${baseName}" more than once in source groups`);
                      sourceBaseMap.delete(baseName);
                      sourceIgnore.add(baseName);
                    }
                    sourceBaseMap.set(baseName, sourceGroup);
                  }

                  let targetBaseMap = new Map();
                  let targetIgnore = new Set();
                  for (let targetGroup of groupOptions) {
                    if (filterT) {
                      if (!filterT.test(targetGroup.title)) continue;
                    } else {
                      if (targetGroup.title.indexOf(rawFilterT) === -1) continue;
                    }

                    let baseName = targetGroup.title.replace(searchB, '');
                    if (targetIgnore.has(baseName)) {
                      continue;
                    }
                    if (targetBaseMap.has(baseName)) {
                      CATMAID.warn(`Found base name "${baseName}" more than once in target groups`);
                      targetBaseMap.delete(baseName);
                      targetIgnore.add(baseName);
                    }
                    targetBaseMap.set(baseName, targetGroup);
                  }

                  for (let [sourceBaseName, sourceGroup] of sourceBaseMap) {
                    let targetGroup = targetBaseMap.get(sourceBaseName);
                    if (targetGroup && targetGroup.title !== sourceGroup.title) {
                      let mapping = getMapping(sourceGroup.value, targetGroup.value);
                      if (mapping) {
                        activeMappings.push(mapping);
                      }
                    }
                  }

                  updateComponentList();
                });
                $(newDTForm).append(CATMAID.DOM.createLabeledControl('', addMatchingPattern,
                    'Selected groups (allowed by filter) from source (S) and target (T) ' +
                    'are matched by name on two conditions: 1. their full name doesn\'t ' +
                    'match and 2. their name with the pattern above removed do match. ' +
                    'E.g. use /A as S-Filter and /left$ as S-Pattern plus /A as T-Filter ' +
                    'and /right$ as T-Pattern to match all groups starting with source ' +
                    'groups ending on "left" and target groups ending on "right".'));

                // Remote instance list update
                var updateComponentList = function() {
                  $(componentList).empty();
                  activeMappings.map(function(o, i) {
                    // Add each remote list element to the select control
                    var optionElement = $('<option/>').attr('value', i)
                        .text(`${o.fromGroup.name} (${o.fromGroup.id}) - ${o.toGroup.name} (${o.toGroup.id})`);
                    return optionElement[0];
                  }).forEach(function(o) {
                    componentList.appendChild(o);
                  });
                };

                // Initialize component list
                updateComponentList();
              }

              // Target relation select
              let targetRelationWrapper = document.createElement('span');
              $(newDTForm).append(targetRelationWrapper);

              let displayTargetRelation = null;

              CATMAID.Relations.list(project.id)
                .then(function(relationMap) {
                  let relationNames = Object.keys(relationMap);
                  let invRelationMap = relationNames.reduce(function(o, name) {
                    o[relationMap[name]] = name;
                    return o;
                  }, {});
                  let relationOptions = relationNames
                      .filter(name => widget.allowedRelationNames.has(name))
                      .map(function(name) {
                        return { title: name, value: relationMap[name] };
                      });
                  let targetRelationSelect = CATMAID.DOM.createRadioSelect(
                      'Group link relation', relationOptions, undefined, true, 'selected');
                  let targetRelationGroup = CATMAID.DOM.createLabeledControl('Target relation',
                    targetRelationSelect, 'Select a relation that links valid target ' +
                    'landmark groups. This rull will be applied recursively.');
                  targetRelationSelect.onchange = function(e) {
                    displayTargetRelation = e.srcElement.value;
                  };
                  $(targetRelationWrapper).append(targetRelationGroup);
                })
                .catch(CATMAID.handleError);

              let transformModelSelect = CATMAID.DOM.createSelect(undefined,
                  ['Affine', 'Rigid', 'Similarity'], 'Affine');
              let transformModelSelectLabel = CATMAID.DOM.createLabeledControl(
                  'Transform model', transformModelSelect,
                  'Model used to fit the transformation between landmarks.');
              $(newDTForm).append(transformModelSelectLabel);
              let selectedTransformModel = function () {
                return {
                  'Affine': CATMAID.transform.AffineModel3D,
                  'Rigid': CATMAID.transform.RigidModel3D,
                  'Similarity': CATMAID.transform.SimilarityModel3D
                }[transformModelSelect.value];
              };

              // Visibility of transformation controls
              let transformationDisplay = widget.applyTransformation ? 'block' : 'none';
              sourceGroupWrapper.style.display = transformationDisplay;
              targetGroupWrapper.style.display = transformationDisplay;
              targetRelationWrapper.style.display = transformationDisplay;
              transformModelSelectLabel[0].style.display = transformationDisplay;

              // Add button
              let buttonContainer = document.createElement('div');
              buttonContainer.classList.add('clear');
              let addButton = document.createElement('button');
              addButton.appendChild(document.createTextNode('Add transformation'));
              addButton.onclick = function() {
                if (widget.applyTransformation && !fromGroup && activeMappings.length === 0) {
                  CATMAID.error("Need source landmark group");
                  return;
                }

                let mappings;
                if (widget.applyTransformation && !displayTargetRelation) {
                  if (!toGroup && activeMappings.length === 0) {
                    CATMAID.error("Need target landmark group");
                    return;
                  }

                  // Consolidate into a single mapping array.
                  mappings = activeMappings.map(e => [e.fromGroup.id, e.toGroup.id]);
                  if (fromGroup && toGroup) {
                    mappings.push([parseInt(fromGroup, 10), parseInt(toGroup, 10)]);
                  }
                }

                if (widget.showOtherProjectOptions) {
                  if (displayTargetRelation) {
                    CATMAID.warn("Display target relations aren't yet supported for remote sources");
                    return;
                  }
                  // If skeletons are loaded from a remote API, the skeleton
                  // source needs to load the remote objects first.
                  let remote;
                  if (sourceRemote.length > 0) {
                    remote = getRemote();
                    if (!remote) {
                      return;
                    }
                  }
                  let api = remote ? remote : null;
                  CATMAID.Skeletons.byAnnotation(sourceProject, [sourceNeuronAnnotation], api)
                    .then(function(skeletonIds) {
                      let skeletonModels = skeletonIds.map(skid =>
                          new CATMAID.SkeletonModel(skid, undefined, undefined, api));
                      if (!skeletonModels || skeletonModels.length === 0) {
                        throw new CATMAID.Warning("No source skeletons found");
                      }
                      widget.addDisplayTransformation(sourceProject,
                          skeletonModels, mappings, api,
                          selectedTransformModel());
                      CATMAID.msg("Success", "Transformation added");
                      widget.updateDisplay();
                      widget.update();
                    })
                    .catch(CATMAID.handleError);
                } else {
                  if (widget.applyTransformation && mappings.length === 0) {
                    CATMAID.error("Need at leat one source/target selection.");
                    return;
                  }
                  let source = CATMAID.skeletonListSources.getSource(skeletonSource);
                  if (!source) {
                    CATMAID.error("Can't find source: " + sourceSelect.value);
                    return;
                  }

                  if (displayTargetRelation) {
                    let getSkeletonModels = source.getSelectedSkeletonModels.bind(source);
                    widget.addDisplayTransformationRule(getSkeletonModels, fromGroup,
                        displayTargetRelation, selectedTransformModel())
                      .then(function() {
                        CATMAID.msg("Success", "Transformation rule applied");
                      })
                      .catch(error => {
                        CATMAID.handleError(error);
                      })
                      .finally(() => {
                        widget.updateDisplay();
                        widget.update();
                      });
                  } else {
                    let skeletonModels = Object.values(source.getSelectedSkeletonModels());
                    if (!skeletonModels || skeletonModels.length === 0) {
                      CATMAID.warn("No source skeletons found");
                      return;
                    }

                    widget.addDisplayTransformation(sourceProject, skeletonModels,
                        mappings, displayTargetRelation, selectedTransformModel());
                    CATMAID.msg("Success", "Transformation added");
                    widget.updateDisplay();
                    widget.update();
                  }
                }
              };
              buttonContainer.appendChild(addButton);
              newDTForm.appendChild(buttonContainer);
            });

        content.appendChild(newDisplayTransformationContainer);
        content.appendChild(existingDisplayTransformationsContainer);

        widget.updateDisplay();
      }
    },
    groups: {
      title: 'Create groups',
      createControls: function(target) {
        return [
          {
            type: 'checkbox',
            label: 'Re-use existing landmarks',
            onclick: function(e) {
              target.groupsReuseExistingLandmarks = this.checked;
            },
            value: target.groupsReuseExistingLandmarks
          }
        ];
      },
      createContent: function(content, widget) {
        // Option to create a mirrored pair of landmark groups based on two
        // volumes.
        let volumeBasedLandmarksHeader = content.appendChild(document.createElement('h1'));
        volumeBasedLandmarksHeader.appendChild(document.createTextNode('Create landmarks and mirrored groups from volumes'));
        content.appendChild(volumeBasedLandmarksHeader);

        let volumeMap = new Map();

        let volumeOptions = CATMAID.Volumes.listAll(project.id)
            .then(function(json) {
              return json.sort(function(a, b) {
                return CATMAID.tools.compareStrings(a.name, b.name);
              }).map(function(volume) {
                // Side effect: create volume map
                volumeMap.set(volume.id, volume);

                // Map volumes to radio select config
                return {
                  title: volume.name + " (#" + volume.id + ")",
                  value: volume.id
                };
              });
            });

        let initVolumeList = function(name, handler) {
          return volumeOptions
            .then(function(volumes) {
              // Create actual element based on the returned data
              var node = CATMAID.DOM.createRadioSelect('Volumes', volumes,
                  undefined, true, 'selected');
              // Add a selection handler
              node.onchange = function(e) {
                if (e.srcElement.type !== 'radio') {
                  return;
                }
                let volumeId = null;
                if (e.srcElement.value !== "none") {
                  volumeId = parseInt(e.srcElement.value, 10);
                }
                if (CATMAID.tools.isFn(handler)) {
                  handler.call(this, volumeId);
                }
              };

              return node;
            });
        };

        // State info whether individual fields have been changed by user
        let landmarkPrefixChanged = false, groupNameAChanged = false, groupNameBChanged;
        let getLandmarkPrefixSuggestion = function() {
          return groupNameA + ' - ' + groupNameB;
        };

        let groupSettings = content.appendChild(document.createElement('p'));

        // Volume A
        let volumeA = null;
        let volumeASelectionSetting = groupSettings.appendChild(
            CATMAID.DOM.createLabeledAsyncPlaceholder(
                "Volume A", initVolumeList('a', function(volumeId) {
                  volumeA = volumeId;
                  // Set group A name data, if not manually changed.
                  if (!groupNameAChanged) {
                    groupNameA = volumeMap.get(volumeId).name;
                    $('input', groupNameASetting).val(groupNameA);
                  }
                  if (!landmarkPrefixChanged) {
                    $('input', landmarkPrefixSetting).val(getLandmarkPrefixSuggestion());
                  }
                }),
                "The first volume, it's bounding box corners will make up the landmark locations of group A."));

        // Group name A
        var groupNameA = '';
        var groupNameASetting = groupSettings.appendChild(
            CATMAID.DOM.createInputSetting('Group A name', groupNameA,
                'The name of new landmark group, representing volume A.', function() {
                  groupNameA = this.value;
                  groupNameAChanged = this.value.length !== 0;
                  if (!landmarkPrefixChanged) {
                    $('input', landmarkPrefixSetting).val(getLandmarkPrefixSuggestion());
                  }
                }).get(0));

        // Volume B
        let volumeB = null;
        let volumeBSelectionSetting = groupSettings.appendChild(
            CATMAID.DOM.createLabeledAsyncPlaceholder(
                "Volume B", initVolumeList('b', function(volumeId) {
                  volumeB = volumeId;
                  // Set group B name data, if not manually changed.
                  if (!groupNameBChanged) {
                    groupNameB = volumeMap.get(volumeId).name;
                    $('input', groupNameBSetting).val(groupNameB);
                  }
                  if (!landmarkPrefixChanged) {
                    $('input', landmarkPrefixSetting).val(getLandmarkPrefixSuggestion());
                  }
                }),
                "The second volume, it's bounding box corners will make up the landmark locations of group B."));

        // Group name B
        var groupNameB = '';
        var groupNameBSetting = groupSettings.appendChild(
            CATMAID.DOM.createInputSetting('Group B name', groupNameB,
                'The name of new landmark group, representing volume B.', function() {
                  groupNameB = this.value;
                  groupNameBChanged = this.value.length !== 0;
                  if (!landmarkPrefixChanged) {
                    $('input', landmarkPrefixSetting).val(getLandmarkPrefixSuggestion());
                  }
                }).get(0));

        // Landmark name prefix
        var landmarkPrefix = '';
        var landmarkPrefixSetting = groupSettings.appendChild(
            CATMAID.DOM.createInputSetting('Landmark name prefix', '',
                'This will be put infront of every newly created landmark.', function() {
                  landmarkPrefix = this.value;
                  landmarkPrefixChanged = this.value.length !== 0;
                }).get(0));

        // Mirror axis
        let mirrorAxis = 'none';
        let mirrorAxisSetting = groupSettings.appendChild(
            CATMAID.DOM.createSelectSetting('Mirror axis', {
                '(none)': 'none',
                'X axis': 'x',
                'Y axis': 'y',
                'Z axis': 'z'
              },
              'A mirror axis will cause an inversion of the mapping of ' +
              'bounding box corners along that dimension',
              function() {
                mirrorAxis = this.value;
              },
              'none').get(0));

        // Relation links
        let relationWrapper = groupSettings.appendChild(document.createElement('span'));
        let newGroupRelations = new Set();

        CATMAID.Relations.list(project.id)
          .then(function(relationMap) {
            let relationNames = Object.keys(relationMap);
            let invRelationMap = relationNames.reduce(function(o, name) {
              o[relationMap[name]] = name;
              return o;
            }, {});
            let relationOptions = relationNames.map(function(name) {
              return { title: name, value: relationMap[name] };
            });
            let relationSelect = CATMAID.DOM.createCheckboxSelect(
                'Group link relation', relationOptions, undefined, true);
            let relationGroup = CATMAID.DOM.createLabeledControl('Relations',
              relationSelect, 'New links using the selected relations will ' +
              'be created between group A and group B.');
            relationSelect.onchange = function(e) {
              if (e.srcElement.checked) {
                newGroupRelations.add(e.srcElement.value);
              } else {
                newGroupRelations.delete(e.srcElement.value);
              }
            };
            $(relationWrapper).append(relationGroup);
          })
          .catch(CATMAID.handleError);

        // Add button
        let buttonContainer = groupSettings.appendChild(document.createElement('div'));
        buttonContainer.classList.add('clear');
        let addButton = buttonContainer.appendChild(document.createElement('button'));
        addButton.appendChild(document.createTextNode('Add new landmark group pair'));
        addButton.onclick = function() {
          let _groupNameA = groupNameA.trim();
          if (groupNameA.length === 0) {
            CATMAID.warn('Please provide a valid name for group A');
            return;
          }
          let _groupNameB = groupNameB.trim();
          if (groupNameB.length === 0) {
            CATMAID.warn('Please provide a valid name for group B');
            return;
          }

          if (!volumeA) {
            CATMAID.warn('Please select volume A');
            return;
          }

          if (!volumeB) {
            CATMAID.warn('Please select volume B');
            return;
          }

          let _landmarkPrefix = landmarkPrefix.trim();

          // Get bounding boxes
          widget.createLandmarkGroupsFromVolumes( volumeA, volumeB, _groupNameA,
              _groupNameB, _landmarkPrefix, mirrorAxis, newGroupRelations,
              widget.groupsReuseExistingLandmarks)
            .then(function() {
              CATMAID.msg("Success", "Created new landmark group pair");

              // Clear input fields

              return widget.updateLandmarksAndGroups();
            })
            .catch(CATMAID.handleError);

          widget.updateDisplay();
        };
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
    creator: LandmarkWidget,
    state: {
      getState: function(widget) {
        return {
          importAllowNonEmptyGroups: widget.importAllowNonEmptyGroups,
          importCreateNonExistingGroups: widget.importCreateNonExistingGroups,
          importReuseExistingLandmarks: widget.importReuseExistingLandmarks,
          useReversePointMatches: widget.useReversePointMatches,
          showLandmarkLayers: widget.showLandmarkLayers,
          overrideColor: widget.overrideColor,
          overrideColorHex: widget._overrideColor,
          overrideColorAlpha: widget._overrideAlpha,
          nodeScaling: widget.nodeScaling
        };
      },
      setState: function(widget, state) {
        CATMAID.tools.copyIfDefined(state, widget, 'importAllowNonEmptyGroups');
        CATMAID.tools.copyIfDefined(state, widget, 'importCreateNonExistingGroups');
        CATMAID.tools.copyIfDefined(state, widget, 'importReuseExistingLandmarks');
        CATMAID.tools.copyIfDefined(state, widget, 'useReversePointMatches');
        CATMAID.tools.copyIfDefined(state, widget, 'showLandmarkLayers');
        CATMAID.tools.copyIfDefined(state, widget, 'overrideColor');
        CATMAID.tools.copyIfDefined(state, widget, 'overrideColorHex');
        CATMAID.tools.copyIfDefined(state, widget, 'overrideColorAlpha');
        CATMAID.tools.copyIfDefined(state, widget, 'nodeScaling');
      }
    }
  });

})(CATMAID);
