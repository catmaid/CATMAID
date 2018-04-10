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
    // Whether to automatically interpolate between group transformations
    this.interpolateBetweenGroups = true;
    // Whether to show landmark layers
    this.showLandmarkLayers = true;
    // Whether skeleton colors should be overridden
    this.overrideColor = true;
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

    // Whether to allow use of existing landmarks
    this.groupsReuseExistingLandmarks = false;

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
        '<p>The second tab allows to form ad-hoc display transformations, i.e. ',
        'transform existing skeletons from one landmark group into another. The ',
        'resulting virtual skeletons can be displayed in any 3D Viewer. Which 3D ',
        'Viewer should show these virtual skeletons can be selected in the top ',
        'controls.</p>',
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
      if (!selected) {
        self.removeDisplayFrom3dViewer(sourceName);
      }
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

  function wrapInGroupEditLink(e) {
    return '<a href="#" data-action="edit-group-members">' + e + '</a>';
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
      let linkedLocations = getLinkedGroupLocationIndices(group, landmark);
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

  function getLinkedGroupLocationIndices(group, landmark) {
    // These are the possible locations, the ones linked to the landmark
    // itself. Based on this we can find the group linked locations.
    let groupLocations = group.locations;
    let linkedLocations = [];
    for (let i=0, imax=landmark.locations.length; i<imax; ++i) {
      // Check if the landmark location is a member of this group
      var loc = landmark.locations[i];
      var isMember = false;
      for (var j=0, jmax=groupLocations.length; j<jmax; ++j) {
        let groupLocation = groupLocations[j];
        if (groupLocation.id == loc.id) {
          linkedLocations.push(j);
          break;
        }
      }
    }
    return linkedLocations;
  }

  /**
   * If the respective landmark is available from already retrieved data return
   * the landmark's name, otherwise return its ID.
   */
  LandmarkWidget.prototype.groupedLandmarkToString = function(group, landmarkId) {
    if (this.landmarkIndex && this.landmarkGroupIndex) {
      let landmark = this.landmarkIndex.get(landmarkId);
      if (landmark) {
        let linkedLocations = getLinkedGroupLocationIndices(group, landmark);
        let linkedLocationsRepr = linkedLocations.map(locationIndexToString, landmark);
        if (linkedLocationsRepr.length > 0) {
          return wrapInGroupEditLink(landmark.name) + " (" + linkedLocationsRepr.join("") + ")";
        } else {
          return wrapInGroupEditLink(landmark.name) + " (-)";
        }
      } else {
        return wrapInGroupEditLink(landmarkId);
      }
    } else {
      return wrapInGroupEditLink(landmarkId);
    }
  };

  function addToIdIndex(index, element) {
    index.set(element.id, element);
    return index;
  }

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
        self.landmarkIndex = result.reduce(addToIdIndex, new Map());
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
        self.landmarkGroupIndex = result.reduce(addToIdIndex, new Map());
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

  /**
   */
  LandmarkWidget.prototype.getMlsTransform = function(transformation, i) {
    if (i === undefined) {
      i = 1;
    }
    let matches = this.getPointMatches(transformation.fromGroupId,
        transformation.toGroupId);

    if (!matches || matches.length === 0) {
      throw new CATMAID.ValueError("Found no point matches for " +
          (i+1) + ". transformation");
    }

    let invMatches = this.getPointMatches(transformation.toGroupId,
        transformation.fromGroupId);

    if (!invMatches || invMatches.length === 0) {
      throw new CATMAID.ValueError("Found no inverse point matches for " +
          (i+1) + ". transformation");
    }

    var mls = new CATMAID.transform.MovingLeastSquaresTransform();
    var model = new CATMAID.transform.AffineModel3D();
    mls.setModel(model);

    var invMls = new CATMAID.transform.MovingLeastSquaresTransform();
    var invModel = new CATMAID.transform.AffineModel3D();
    invMls.setModel(invModel);

    try {
      mls.setMatches(matches);
    } catch (error) {
      throw new CATMAID.ValueError("Could not fit model for " +
          (i+1) + ". transformation");
    }

    try {
      invMls.setMatches(invMatches);
    } catch (error) {
      throw new CATMAID.ValueError("Could not fit inverse model for " +
          (i+1) + ". transformation");
    }

    return {
      transform: mls,
      invTransform: invMls
    };
  };

  /**
   * Return squared distance between an axis aligned bounding box and a point p.
   */
  let distanceSq = function(aaBb, x, y, z) {
    var dx = Math.max(aaBb.min.x - x, 0, x - aaBb.max.x);
    var dy = Math.max(aaBb.min.y - y, 0, y - aaBb.max.y);
    var dz = Math.max(aaBb.min.z - z, 0, z - aaBb.max.z);
    return dx*dx + dy*dy + dz * dz;
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
      let skeletonModels = Object.keys(transformation.skeletons).reduce(function(o, s) {
        o['transformed-' + s] = transformation.skeletons[s];
        return o;
      }, {});

      let mls;
      try {
        mls = this.getMlsTransform(transformation, i);
      } catch (error) {
        CATMAID.warn(error ? error.message : "Unknown error");
        continue;
      }

      // Landmarks are needed for bounding box computation ans visualization.
      transformation.landmarkProvider = {
        get: function(landmarkGroupId) {
          if (transformation.landmarkCache && transformation.landmarkCache[landmarkGroupId]) {
            return Promise.resolve(transformation.landmarkCache[landmarkGroupId]);
          } else {
            return CATMAID.Landmarks.getGroup(project.id, landmarkGroupId, true, true)
              .then(function(landmarkGroup) {
                if (!transformation.landmarkCache) {
                  transformation.landmarkCache = {};
                }
                transformation.landmarkCache[landmarkGroupId] = landmarkGroup;
                return landmarkGroup;
              });
          }
        }
      };

      // Compute source and target landmark group boundaries
      let prepare = Promise.all([
          transformation.landmarkProvider.get(transformation.fromGroupId),
          transformation.landmarkProvider.get(transformation.toGroupId)])
        .then(function(landmarkGroups) {
          let fromGroup = landmarkGroups[0];
          let toGroup = landmarkGroups[1];
          transformation.sourceAaBb = CATMAID.Landmarks.getBoundingBox(fromGroup);
          transformation.targetAaBb = CATMAID.Landmarks.getBoundingBox(toGroup);
        });

      // For each node, check if treenode is outside of source group bounding
      // box. If so, do both a transformation from source to target group and
      // average with respect to distance to bounding box.
      let noInterpolation = !this.interpolateBetweenGroups;
      let treenodeLocation = [0, 0, 0];
      let transformTreenode = function(treenodeRow) {
        // If in boundig box, just apply forward transform. If in target
        // bounding box, use inverse transform. If in-between, use weighted
        // location based on distance.
        let fromDistanceSq = distanceSq(transformation.sourceAaBb, treenodeRow[3],
            treenodeRow[4], treenodeRow[5]);
        // If the node is in the source bounding box, use regular source ->
        // target transformation.
        if (fromDistanceSq === 0 || noInterpolation) {
          treenodeLocation[0] = treenodeRow[3];
          treenodeLocation[1] = treenodeRow[4];
          treenodeLocation[2] = treenodeRow[5];
          mls.transform.applyInPlace(treenodeLocation);
          treenodeRow[3] = treenodeLocation[0];
          treenodeRow[4] = treenodeLocation[1];
          treenodeRow[5] = treenodeLocation[2];
        } else {
          let toDistanceSq = distanceSq(transformation.targetAaBb, treenodeRow[3],
              treenodeRow[4], treenodeRow[5]);
          // If the node is in the target bounding box, use exclusively the
          // inverse transformation target -> source. Otherwise weight the
          // distances.
          if (toDistanceSq === 0) {
            treenodeLocation[0] = treenodeRow[3];
            treenodeLocation[1] = treenodeRow[4];
            treenodeLocation[2] = treenodeRow[5];
            mls.invTransform.applyInPlace(treenodeLocation);
            treenodeRow[3] = treenodeLocation[0];
            treenodeRow[4] = treenodeLocation[1];
            treenodeRow[5] = treenodeLocation[2];
          } else {
            let fromToRatio = toDistanceSq / (fromDistanceSq + toDistanceSq);
            let toFromRatio = 1.0 - fromToRatio;

            // Add source part
            let x = treenodeLocation[0] = treenodeRow[3];
            let y = treenodeLocation[1] = treenodeRow[4];
            let z = treenodeLocation[2] = treenodeRow[5];
            mls.transform.applyInPlace(treenodeLocation);
            treenodeRow[3] = fromToRatio * treenodeLocation[0];
            treenodeRow[4] = fromToRatio * treenodeLocation[1];
            treenodeRow[5] = fromToRatio * treenodeLocation[2];

            // Add target part
            treenodeLocation[0] = x;
            treenodeLocation[1] = y;
            treenodeLocation[2] = z;
            mls.invTransform.applyInPlace(treenodeLocation);
            treenodeRow[3] += toFromRatio * treenodeLocation[0];
            treenodeRow[4] += toFromRatio * treenodeLocation[1];
            treenodeRow[5] += toFromRatio * treenodeLocation[2];
          }
        }
      };

      transformation.nodeProvider = {
        get: function(skeletonId) {
          if (!transformation.loading) {
            if (transformation.skeletonCache && transformation.skeletonCache[skeletonId]) {
              transformation.loading = Promise.resolve(transformation.skeletonCache[skeletonId]);
            } else {
              // Get skeleton data and transform it
              transformation.loading = CATMAID.fetch(project.id + '/skeletons/' + skeletonId + '/compact-detail', 'GET', {
                  with_tags: false,
                  with_connectors: false,
                  with_history: false
                })
                .then(function(response) {
                  // If the source group ID is the same as the target group ID,
                  // don't transform at all.
                  if (transformation.fromGroupId !== transformation.toGroupId) {
                    // Transform points and store in cache
                    response[0].forEach(transformTreenode);
                  }
                  if (!transformation.skeletonCache) {
                    transformation.skeletonCache = {};
                  }
                  transformation.skeletonCache[skeletonId] = response;
                  return response;
                });
            }
          }

          return transformation.loading;
        }
      };

      prepare.then(function() {
        for (let j=0; j<target3dViewers.length; ++j) {
          let widget = target3dViewers[j];
          widget.showLandmarkTransform(transformation, true);
        }
      }).catch(CATMAID.handleError);
    }
  };

  /**
   * Get a list of two-element lists with each sub-list representingn a point
   * match, i.e. two locations annotated with the same landmark
   */
  LandmarkWidget.prototype.getPointMatches = function(fromGroupId, toGroupId) {
    if (!this.landmarkGroupIndex) {
      throw new CATMAID.ValueError('No landmark group information found');
    }
    let fromGroup = this.landmarkGroupIndex.get(fromGroupId);
    if (!fromGroup) {
      throw new CATMAID.ValueError('Could not find "from" group: ' + fromGroupId);
    }
    let toGroup = this.landmarkGroupIndex.get(toGroupId);
    if (!toGroup) {
      throw new CATMAID.ValueError('Could not find "to" group: ' + toGroupId);
    }

    // Find landmark overlap between both groups
    let fromLandmarkIds = new Set(fromGroup.members);
    let toLandmarkIds = new Set(toGroup.members);
    let sharedLandmarkIds = new Set();
    for (let toLandmarkId of toLandmarkIds) {
      if (fromLandmarkIds.has(toLandmarkId)) {
        sharedLandmarkIds.add(toLandmarkId);
      }
    }

    let matches = [];

    // Find all members that have a location linked into both groups
    for (let landmarkId of sharedLandmarkIds) {
      let landmark = this.landmarkIndex.get(landmarkId);
      if (!landmark) {
        throw new CATMAID.ValueError("Could not find landmark " + landmarkId);
      }

      let linkedFromLocationIdxs = getLinkedGroupLocationIndices(fromGroup, landmark);
      let linkedToLocationIdxs = getLinkedGroupLocationIndices(toGroup, landmark);

      if (linkedFromLocationIdxs.length === 0) {
        CATMAID.warn("Landmark " + landmarkId +
            " has no linked location in group " + fromGroupId);
        continue;
      }

      if (linkedToLocationIdxs.length === 0) {
        CATMAID.warn("Landmark " + landmarkId +
            " has no linked location in group " + toGroupId);
        continue;
      }

      if (linkedFromLocationIdxs.length > 1) {
        CATMAID.warn("Landmark " + landmarkId +
            " is linked through locations in group " +
            fromGroupId + " more than once");
        continue;
      }

      if (linkedToLocationIdxs.length > 1) {
        CATMAID.warn("Landmark " + landmarkId +
            " is linked through locations in group " +
            toGroupId + " more than once");
        continue;
      }

      let fLoc = fromGroup.locations[linkedFromLocationIdxs[0]];
      let tLoc = toGroup.locations[linkedToLocationIdxs[0]];

      var p1 = new CATMAID.transform.Point([fLoc.x, fLoc.y, fLoc.z]);
      var p2 = new CATMAID.transform.Point([tLoc.x, tLoc.y, tLoc.z]);

      matches.push(new CATMAID.transform.PointMatch(p1, p2, 1.0));
    }

    return matches;
  };

  /**
   * Add a new display transformation for a set of skeletons.
   */
  LandmarkWidget.prototype.addDisplayTransformation = function(skeletons,
      fromGroupId, toGroupId) {
    let lst = new CATMAID.LandmarkSkeletonTransformation(skeletons,
        fromGroupId, toGroupId);
    this.displayTransformations.push(lst);
  };

  /**
   * Add new display transformations based on a target relation. This will
   * currently explore all landmark groups that are transitively linked to the
   * source group. Only links with the passed in relation ID will be respected.
   */
  LandmarkWidget.prototype.addDisplayTransformationRule = function(getSkeletonModels,
      fromGroupId, relationId) {
    // Get all transitively linked target groups from back-end. Add a
    // transformation for each.
    var self = this;
    return CATMAID.Landmarks.getTransitivelyLinkedGroups(project.id, fromGroupId, relationId)
      .then(function(groups) {
        for (let i=0; i<groups.length; ++i) {
          let toGroupId = groups[i];
          let skeletons = getSkeletonModels();
          let lst = new CATMAID.LandmarkSkeletonTransformation(skeletons,
              fromGroupId, toGroupId);
          self.displayTransformations.push(lst);
        }
      })
      .catch(CATMAID.handleError);
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
                    return wrapInGroupEditLink("(none)");
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
          var loc = Number.isNaN(index) ? null : landmark.locations[index];
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
        }).on('mousedown', 'a[data-action=select-location]', function(e) {
          var index = parseInt(this.dataset.index, 10);
          var table = $(this).closest('table');
          var datatable = $(table).DataTable();
          var tr = $(this).closest('tr');
          var data =  datatable.row(tr).data();
          var location = Number.isNaN(index) ? null : data.locations[index];

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

          // Hide current context menut (if any) and show new context menu
          if (contextMenu) {
            contextMenu.hide();
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
              target.updateLandmarkGroups()
                .then(function(result) {
                  var groups = [{
                    title: '(none)',
                    value: '-1'
                  }].concat(result.map(function(g) {
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
              let linkedLocations = getLinkedGroupLocationIndices(group, landmark);

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
        let landmarkGroupDetails = Promise.all([
            widget.updateLandmarkGroups(),
            widget.updateLandmarks()
        ]);

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
            let relations = relationNames.map(function(name) {
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
                for (let i=0; i<widget.filesToImport.length; ++i) {
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
            value: target.interpolateBetweenGroups,
            label: 'Interpolate between groups',
            onclick: function() {
              target.interpolateBetweenGroups = this.checked;
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
          }
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
        let sourceSelect = CATMAID.skeletonListSources.createUnboundSelect();
        let sourceSelectSetting = CATMAID.DOM.createLabeledControl("Skeleton source",
            sourceSelect, "Select which skeletons to virtually transform");
        var skeletonSource = sourceSelect.value;
        sourceSelect.onchange = function(e) {
          skeletonSource = e.target.value;
        };
        $(newDTForm).append(sourceSelectSetting);

        let existingDisplayTransformationsContainer = document.createElement('div');
        existingDisplayTransformationsContainer.classList.add('clear');
        existingDisplayTransformationsContainer.appendChild(document.createElement('h1'))
            .appendChild(document.createTextNode('Existing display transformations'));
        let existingDTTable = existingDisplayTransformationsContainer.appendChild(
            document.createElement('table'));
        let existingDTDataTable = $(existingDTTable).DataTable({
          data: widget.displayTransformations,
          order: [],
          columns: [
            {
              data: 'skeletons',
              title: 'Skeletons',
              orderable: false,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  return Object.keys(data).join(', ');
                }
                return data;
              }
            },

            {
              data: 'fromGroupId',
              title: 'Source landmark group',
              orderable: false,
              render: function(data, type, row, meta) {
                if (widget.landmarkGroupIndex) {
                  let group = widget.landmarkGroupIndex.get(data);
                  if (group) {
                    return group.name + " (" + data + ")";
                  }
                }
                return data;
              }
            },
            {
              data: 'toGroupId',
              title: 'Target landmark group',
              orderable: false,
              render: function(data, type, row, meta) {
                if (widget.landmarkGroupIndex) {
                  let group = widget.landmarkGroupIndex.get(data);
                  if (group) {
                    return group.name + " (" + data + ")";
                  }
                }
                return data;
              }
            },
            {
              title: 'Action',
              orderable: false,
              render: function(data, type, row, meta) {
                return '<a href="#" data-action="delete-transformation">Delete</a>';
              }
            }
          ]
        }).on('click', 'a[data-action=delete-transformation]', function() {
          let tr = $(this).closest('tr');
          let data = existingDTDataTable.row(tr).data();
          widget.removeLandmarkTransformation(data);
          widget.update();
        });

        // Add additonal settings that need updated groups
        widget.updateLandmarkGroups()
            .then(function(groups) {
              let groupOptions = groups.map(function(g) {
                return {
                  title: g.name,
                  value: g.id
                };
              });

              var fromGroup, toGroup;

              // Source select
              let sourceSelect = CATMAID.DOM.createRadioSelect('Source landmark groups', groupOptions, undefined, true);
              let sourceGroup = CATMAID.DOM.createLabeledControl("Source group",
                sourceSelect, "Select the source landmark group, the space from " +
                "which input points are transformed.");
              sourceSelect.onchange = function(e) {
                fromGroup = e.target.value;
              };
              $(newDTForm).append(sourceGroup);

              // Target select
              let targetSelect = CATMAID.DOM.createRadioSelect('Target landmark groups', groupOptions, undefined, true);
              let targetGroup = CATMAID.DOM.createLabeledControl("Target group",
                targetSelect, "Select the target landmark group, the space to " +
                "which input points are transformed.");
              targetSelect.onchange = function(e) {
                toGroup = e.target.value;
              };
              $(newDTForm).append(targetGroup);

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
                  let relationOptions = relationNames.map(function(name) {
                    return { title: name, value: relationMap[name] };
                  });
                  let targetRelationSelect = CATMAID.DOM.createRadioSelect(
                      'Group link relation', relationOptions, undefined, true);
                  let targetRelationGroup = CATMAID.DOM.createLabeledControl('Target relation',
                    targetRelationSelect, 'Select a relation that links valid target ' +
                    'landmark groups. This rull will be applied recursively.');
                  targetRelationSelect.onchange = function(e) {
                    displayTargetRelation = e.srcElement.value;
                  };
                  $(targetRelationWrapper).append(targetRelationGroup);
                })
                .catch(CATMAID.handleError);

              // Add button
              let buttonContainer = document.createElement('div');
              buttonContainer.classList.add('clear');
              let addButton = document.createElement('button');
              addButton.appendChild(document.createTextNode('Add transformation'));
              addButton.onclick = function() {
                if (!skeletonSource) {
                  CATMAID.error("Need a skeleton source");
                  return;
                }
                let source = CATMAID.skeletonListSources.getSource(skeletonSource);
                if (!source) {
                  CATMAID.error("Can't find source: " + sourceSelect.value);
                  return;
                }

                if (!fromGroup) {
                  CATMAID.error("Need source landmark group");
                  return;
                }

                if (displayTargetRelation) {
                  let getSkeletonModels = source.getSelectedSkeletonModels.bind(source);
                  widget.addDisplayTransformationRule(getSkeletonModels, fromGroup,
                      displayTargetRelation)
                    .then(function() {
                      widget.updateDisplay();
                      widget.update();
                    })
                    .catch(CATMAID.handleError);
                  CATMAID.msg("Success", "Transformation rule applied");
                } else {
                  if (!toGroup) {
                    CATMAID.error("Need target landmark group");
                    return;
                  }

                  let skeletonModels = source.getSelectedSkeletonModels();
                  widget.addDisplayTransformation(skeletonModels, fromGroup,
                      toGroup, displayTargetRelation);
                  CATMAID.msg("Success", "Transformation added");
                  widget.updateDisplay();
                  widget.update();
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
        volumeBasedLandmarksHeader.appendChild(document.createTextNode('Volume based landmark mapping'));
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
                  undefined, true);
              // Add a selection handler
              node.onchange = function(e) {
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
                "The first volume, it's bounding box corners will make up the landmark locations of group A.").get(0));

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
                "The second volume, it's bounding box corners will make up the landmark locations of group B.").get(0));

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

              let landmarkGroupDetails = Promise.all([
                  widget.updateLandmarkGroups(),
                  widget.updateLandmarks()
              ]);
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
          interpolateBetweenGroups: widget.interpolateBetweenGroups,
          showLandmarkLayers: widget.showLandmarkLayers,
          overrideColor: widget.overrideColor,
          overrideColorHex: widget._overrideColor,
          overrideColorAlpha: widget._overrideAlpha,
          nodeScaling: widget.nodeScaling
        };
      },
      setState: function(widget, state) {
        CATMAID.tools.copyIfDefined(state, widget, 'importReuseExistingLandmarks');
        CATMAID.tools.copyIfDefined(state, widget, 'importCreateNonExistingGroups');
        CATMAID.tools.copyIfDefined(state, widget, 'importReuseExistingLandmarks');
        CATMAID.tools.copyIfDefined(state, widget, 'interpolateBetweenGroups');
        CATMAID.tools.copyIfDefined(state, widget, 'showLandmarkLayers');
        CATMAID.tools.copyIfDefined(state, widget, 'overrideColor');
        CATMAID.tools.copyIfDefined(state, widget, 'overrideColorHex');
        CATMAID.tools.copyIfDefined(state, widget, 'overrideColorAlpha');
        CATMAID.tools.copyIfDefined(state, widget, 'nodeScaling');
      }
    }
  });

})(CATMAID);
