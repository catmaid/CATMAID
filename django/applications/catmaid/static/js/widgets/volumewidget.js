/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Stores information about widget mode switches.
   */
  var Context = function(onExit) {
    this.onExit = onExit;
  };

  /**
   * Manage spatial volumes with this widget.
   */
  var VolumeManagerWidget = function(options) {
    options = options || {};

    this.idPrefix = 'volume-manager';

    // The current edit mode
    this.mode = 'list';
    this.modes = ['list', 'add', 'innervations'];

    this.content = null;
    // Stores information about current widget mode
    this.currentContext = null;
    // Access to the displayed DataTable
    this.datatable = null;
    this.entriesPerPage = options.entriesPerPage || 25;
    // volume type
    this.newVolumeType = options.defaultVolumeType || "box";
    // Minimum number of nodes a volume filtered skeleton has to have.
    this.minFilterNodes = 2;
    // Minimum length a volume filtered skeleton has to have.
    this.minFilterCable = 0;
    // A skeleton source that is selected to provide skeleton ID constraints for
    // listing skeletons in a volume.
    this.selectedSkeletonConstraintSource = 'none';

    // Optional filter for displayed volumes
    this.volumeIdFilter = null;

    // The skeleton source selected for innervation checks
    this.innervationSkeletonSource = CATMAID.ActiveSkeleton.prototype.getName();
    // An optional volume annotation for innervations filter
    this.innervationVolumeAnnotation = '';
    // Whether client side filtering should be performed (or only boundingn box
    // checks should be displayed).
    this.innervationClientSideFiltering = true;
    // Whether innervating skeletons should be displayed in the table.
    this.innervationSkeletonColumn = false;
    // The innervated volume IDs
    this.innervationVolumeIdFilter = null;
    // The skeletons per innervated skeleton.
    this.innervationSkeletonMap = new Map();
    // Whether client-side filtering should be used to filter skeleton/volume
    // intersections exactly.
    this.innervationExactFiltering = true;

    CATMAID.skeletonListSources.on(CATMAID.SkeletonSourceManager.EVENT_SOURCE_ADDED,
        this.handleChangedSkeletonSources, this);
    CATMAID.skeletonListSources.on(CATMAID.SkeletonSourceManager.EVENT_SOURCE_REMOVED,
        this.handleChangedSkeletonSources, this);
  };

  VolumeManagerWidget.prototype.getName = function() {
    return "Volume Manager";
  };

  VolumeManagerWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: 'volume_manager_controls',
      createControls: function(controls) {
        var self = this;
        var tabNames = this.modes.map(function(m) {
          return VolumeManagerWidget.Modes[m].title;
        }, this);
        var tabs = CATMAID.DOM.addTabGroup(controls, '-volumes', tabNames);
        this.modes.forEach(function(mode, i) {
          var mode = VolumeManagerWidget.Modes[mode];
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
      contentID: 'volume_manger_content',
      createContent: function(container) {
        this.content = container;

        this.modes.forEach(function(modeKey, i) {
          let mode = VolumeManagerWidget.Modes[modeKey];
          let content = container.appendChild(document.createElement('div'));
          content.setAttribute('id', `${this.idPrefix}-content-${modeKey}`);
          content.style.display = 'none';
          mode.createContent(content, this);
        }, this);
      },
      init: function() {
        this.modes.forEach(function(mode, i) {
          var mode = VolumeManagerWidget.Modes[mode];
          if (CATMAID.tools.isFn(mode.init)) {
            mode.init(this);
          }
        }, this);
        this.update();
      },
    };
  };

  VolumeManagerWidget.prototype.initMode = function(modeKey) {
    let content = document.querySelector(`div#${this.idPrefix}-content-${modeKey}`);
    if (!content) {
      throw new CATMAID.ValueError(`Could not find content element for mode "${modeKey}"`);
    }
    let mode = VolumeManagerWidget.Modes[modeKey];
    if (!mode) {
      throw new CATMAID.ValueError(`Could not find mode with key "${modeKey}"`);
    }
    // Empty target
    while (content.lastChild) {
      content.removeChild(content.lastChild);
    }
    // Init
    mode.createContent(content, this);
  };

  /**
   * Remove all displayed volumes.
   */
  VolumeManagerWidget.prototype.destroy = function() {
    if (this.currentContext) {
      CATMAID.tools.callIfFn(this.currentContext.onExit);
      this.currentContext = null;
    }
    CATMAID.NeuronNameService.getInstance().unregister(this);
    SkeletonAnnotations.off(CATMAID.SkeletonSourceManager.EVENT_SOURCE_ADDED,
        this.handleChangedSkeletonSources, this);
    SkeletonAnnotations.off(CATMAID.SkeletonSourceManager.EVENT_SOURCE_REMOVED,
        this.handleChangedSkeletonSources, this);
  };

  VolumeManagerWidget.prototype.update = function() {
    delete this.content.dataset.msg;
    // Show only active mode
    for (let i=0; i<this.modes.length; ++i) {
      let modeKey = this.modes[i];
      let activeMode = modeKey === this.mode;
      let mode = VolumeManagerWidget.Modes[modeKey];
      let visible = false;
      if (activeMode) {
        let msg = CATMAID.tools.callIfFn(mode.getMessage, this);
        if (msg) {
         this.content.dataset.msg = msg;
        } else {
          visible = true;
        }
        CATMAID.tools.callIfFn(mode.update, this);
      }
      let modeContent = document.querySelector(`div#${this.idPrefix}-content-${modeKey}`);
      if (modeContent) {
        modeContent.style.display = visible ? 'block': 'none';
      }
    }
    let tabs = $(this.tabControls);
    var activeIndex = tabs.tabs('option', 'active');
    var widgetIndex = this.modes.indexOf(this.mode);
    if (activeIndex !== widgetIndex) {
      tabs.tabs('option', 'active', widgetIndex);
    }
  };

  /**
   * Update volume listing.
   */
  VolumeManagerWidget.prototype.redraw = function(container) {
    if (!this.datatable) {
      return;
    }
    this.volumeIdFilter = null;
    // Get list of available volumes
    this.datatable.ajax.reload();
  };

  /**
   *
   */
  VolumeManagerWidget.prototype.handleChangedSkeletonSources = function() {
    let sourceSelectSelector = "select#skeleton-constraint-source";
    let sourceSelect = document.querySelector(sourceSelectSelector);
    if (sourceSelect) {
      this.updateSkeletonSourceSelect(sourceSelect, this.selectedSkeletonConstraintSource);
      this.selectedSkeletonConstraintSource = sourceSelect.value;
    }

    let innervationSourceSelectSelector = "select#skeleton-innervation-source";
    let innervationSourceSelect = document.querySelector(innervationSourceSelectSelector);
    if (innervationSourceSelect) {
      this.updateSkeletonSourceSelect(innervationSourceSelect, this.innervationSkeletonSource, true);
      this.innervationSkeletonSource = innervationSourceSelect.value;
    }
  };

  /**
   * Update a particular select element with the most recent sources.
   */
  VolumeManagerWidget.prototype.updateSkeletonSourceSelect = function(sourceSelect, selectedValue, noNoneSelect) {
    // Find index of current value in new source list
    let availableSources = CATMAID.skeletonListSources.getSourceNames();
    let newIndexInNewSources = -1;
    for (let i=0; i<availableSources.length; ++i) {
      if (availableSources[i] === this.selectedSkeletonConstraintSource) {
        newIndexInNewSources = i;
        break;
      }
    }
    var sourceOptions = availableSources.reduce(function(o, name) {
      o.push({
        title: name,
        value: name
      });
      return o;
    }, noNoneSelect ? [] : [{title: '(none)', value: 'none'}]);

    CATMAID.DOM.appendOptionsToSelect(sourceSelect, sourceOptions,
        selectedValue, true);
  };

  /**
   * Return a promise for a volume from the back-end.
   */
  VolumeManagerWidget.prototype.loadVolume = function(volumeId) {
    return CATMAID.fetch(project.id + '/volumes/' + volumeId + '/', 'GET')
      .then(function(json) {
        // Expect box for now
        var type = 'box';
        // Try to create volume instance
        var bbox = json.bbox;
        var volumeType = volumeTypes[type];
        return volumeType.createVolume({
          minX: bbox.min.x,
          minY: bbox.min.y,
          minZ: bbox.min.z,
          maxX: bbox.max.x,
          maxY: bbox.max.y,
          maxZ: bbox.max.z,
          title: json.name,
          comment: json.comment,
          id: json.id
        });
      });
  };

  /**
   * Request volume details, show edit controls and display a bounding box
   * overlay. If no volume ID is given, a new volume is assumed.
   */
  VolumeManagerWidget.prototype.editVolume = function(volume, target, cancel) {
    var self = this;
    var createNewVolume = !volume;

    if (this.currentContext) {
      CATMAID.tools.callIfFn(this.currentContext.onExit);
    }

    if (!target) {
      throw new CATMAID.ValueError("Need target element!");
    }
    // Empty target
    while (target.lastChild) {
      target.removeChild(target.lastChild);
    }
    let $target = $(target);

    // Display inline editor for properties of new volume
    var $addContent = $(document.createElement('div'));
    $addContent.addClass('settings-container volume-properties');

    var vid = this.datatable ? this.datatable.length + 1 : 1;
    var volumeType, volumeHelper;
    if (volume) {
      volumeType = getVolumeType(volume);
      volumeHelper = volumeTypes[volumeType];
    } else {
      volumeType = this.newVolumeType;
      volumeHelper = volumeTypes[volumeType];
      if (!volumeType) {
        throw CATMAID.ValueError("Couldn't find volume type: " +
            this.newVolumeType);
      }
      volume = volumeHelper.createVolume({});
    }

    var title = function(e) { volume.title = this.value; };
    var comment = function(e) { volume.comment = this.value; };
    if (createNewVolume) {
      var typeSelect = CATMAID.DOM.createSelectSetting("Type",
          {
            "Box": "box",
            "Convex Hull": "convexhull",
            "Alpha shape": "alphashape"
          },
          "The geometry type of this volume.", undefined, volumeType);
      $addContent.append(typeSelect);
      $('select', typeSelect).on('change', function() {
        $("div.volume-properties", $target).remove();
        self.newVolumeType = this.value;
        self.editVolume(null, target, cancel);
      });
    }

    $addContent.append(CATMAID.DOM.createInputSetting("Name", volume.title,
        "This name will be used whereever CATMAID refers to this volume in " +
        "its user interface.", title));

    $addContent.append(CATMAID.DOM.createInputSetting("Comment", volume.comment,
        "Additional information regarding this volume.", comment));

    var volumeSettings = volumeHelper.createSettings(volume);
    if (!createNewVolume) {
      $('input', volumeSettings).attr('disabled', 'disabled');
    }
    $addContent.append(volumeSettings);

    // Create volume update and close handlers (used for preview)
    var handlers = volumeHelper.createHandlers(volume);
    var onUpdate = handlers[0];
    var closeVolumeEdit = handlers[1];

    var onClose = function(save, onSuccess, onCancel) {
      if (CATMAID.tools.isFn(closeVolumeEdit)) {
        var onSuccessWrapper = function() {
          volume.off(volume.EVENT_PROPERTY_CHANGED, volumeChanged);
          CATMAID.tools.callIfFn(onSuccess);
        };
        closeVolumeEdit(save, onSuccessWrapper, onCancel);
      }
    };
    $addContent.append($('<div class="clear" />'));

    let buttons = $('<div />');
    if (CATMAID.tools.isFn(cancel)) {
      buttons.append($('<button>Back</button>')
        .on('click', function(e) {
          cancel();
        }));
    }
    buttons.append($('<button>Reset</button>')
          .on('click', function(e) {
            onClose(false, function() {
              // Reinitialize volume editing
              self.editVolume(null, target);
            });
          }))
        .append($('<button>Save</Cancel>')
          .on('click', function(e) {
            $.blockUI({message: '<img src="' + CATMAID.staticURL +
                'images/busy.gif" /> <span>Please wait, creating volume</span>'});
            function save() {
              try {
                onClose(true, function() {
                  volume.save()
                    .then(function(result) {
                      // Reinitialize volume editing
                      self.editVolume(volume, target, cancel);
                    }).catch(CATMAID.handleError)
                    .then(function() {
                      $.unblockUI();
                      self.redraw();
                    });
                }, function() {
                  CATMAID.warn("Couldn't save volume");
                  $.unblockUI();
                });
              } catch(e) {
                $.unblockUI();
                CATMAID.error("Couldn't create volume: " + e);
              }
            }
            setTimeout(save, 100);
          }));
    $addContent.append(buttons);

    $(target).append($addContent);

    function volumeChanged(field, newValue, oldValue) {
      if (CATMAID.tools.isFn(onUpdate)) {
        onUpdate(field, newValue, oldValue);
      }
    }

    volume.on(volume.EVENT_PROPERTY_CHANGED, volumeChanged);
    this.currentContext = new Context(onClose);
  };

  /**
   * Load volumes from a passed in file path. The file format is expected to be
   * JSON. A list of objects with a type and a properties field.  For instance:
   *
   * [{
   *   "type": "box",
   *   "properties": {
   *     "minX": 0,
   *     "minY": 0,
   *     "minZ": 0,
   *     "maxX": 1,
   *     "maxY": 1,
   *     "maxZ": 1,
   *   }
   * }]
   *
   * @param {String} files The file to load
   */
  VolumeManagerWidget.prototype.addVolumeFromFile = function(file) {
      return new Promise(function(resolve, reject) {
        var self = this;
        var reader = new FileReader();
        reader.onload = function(e) {
            var volumes = JSON.parse(e.target.result);
            // Try to load volumes and record invalid ones
            var invalidVolumes = volumes.filter(function(v) {
              var volumeType = volumeTypes[v.type];
              var properties = v.properties;
              if (volumeType && properties) {
                volumeType.createVolume(properties);
              } else {
                // Return true for invalid volume types
                return !volumeType;
              }
            });
        };
        reader.readAsText(file);
      });
  };

  VolumeManagerWidget.prototype.addVolumesFromSTL = function(files) {
    var self = this;
    var data = new FormData();
    files.forEach(function(file){
      data.append(file.name, file, file.name);
    });
    return new Promise(function(resolve, reject) {
      CATMAID.fetch(project.id + "/volumes/import", "POST", data, undefined, undefined, undefined, undefined, {"Content-type" : null})
        .then(function(data){
          CATMAID.msg("success", Object.keys(data).length + " mesh(s) loaded");
          self.redraw();
        })
        .catch(CATMAID.handleError);
    });
  };

  function handleFilteredData(target, filter, filters, filtered) {
    for (let isectSkeletonId of filtered.skeletons) {
      let volumeList = target.get(isectSkeletonId);
      if (!volumeList) {
        volumeList = [];
        target.set(isectSkeletonId, volumeList);
      }
      // We know there is only a single rule.
      volumeList.push(filter.rules[0].options['volumeId']);
    }

    let nextFilter = filters.pop();
    if (nextFilter) {
      return nextFilter.execute(undefined, true)
        .then(function(filtered) {
          return handleFilteredData(target, nextFilter, filters, filtered);
        });
    }
  }

  /**
   * Ask the back-end for all volumes that intersect with the selected
   * skeletons.
   */
  VolumeManagerWidget.prototype.findInnervations = function() {
    let annotation = this.innervationVolumeAnnotation;
    if (!this.innervationSkeletonSource ||
        this.innervationSkeletonSource === 'none') {
      CATMAID.warn("No skeleton source selected");
      return;
    }

    let source = CATMAID.skeletonListSources.getSource(
        this.innervationSkeletonSource);
    if (!source) {
      throw new CATMAID.ValueError("Can't find skeleton source: " +
          this.innervationSkeletonSource);
    }
    let skeletonIds = source.getSelectedSkeletons();
    if (skeletonIds.length === 0) {
      CATMAID.warn("No skeletons selected in source " + source.getName());
      return;
    }
    let clientSideFiltering = this.innervationClientSideFiltering;
    let self = this;
    CATMAID.Volumes.findSkeletonInnervations(project.id, skeletonIds, annotation)
      .then(function(result) {
        if (!result || result.length === 0) {
          throw new CATMAID.Warning("Could not find any intersecting volume");
        }
        // If client side filtering is enabled, further filter the result with
        // actual node filters.
        if (!self.innervationExactFiltering) {
          return result;
        } else {
          // Create filter
          let skeletonModels = skeletonIds.reduce(function(o, s) {
            o[s] = new CATMAID.SkeletonModel(s);
            return o;
          }, {});
          let rules = [];
          let filterStrategy = CATMAID.SkeletonFilterStrategy['volume'];

          let volumeSkeletonMap = new Map();
          // Results are organized by skeleton ID. We have to execute one volume
          // filter rule per volume on all skeleton models.
          for (let i=0; i<result.length; ++i) {
            let innervations = result[i];
            let skeletonId = innervations.skeleton_id;
            for (let j=0; j<innervations.volume_ids.length; ++j) {
              let volumeId = innervations.volume_ids[j];
              let skeletonList = volumeSkeletonMap.get(volumeId);
              if (!skeletonList) {
                skeletonList = [];
                volumeSkeletonMap.set(volumeId, skeletonList);
              }
              skeletonList.push(skeletonId);
            }
          }

          // With a list of potentially intersecting skeletons for each volume,
          // we need to create a new filter for each folume and execute it,
          // keeping the input data cache and updating the results accordingly.
          let inputCache = {};
          let filters = [];
          for (let volumeId of volumeSkeletonMap.keys()) {
            let rules = [new CATMAID.SkeletonFilterRule(filterStrategy, {
              volumeId: volumeId,
            })];
            let filter = new CATMAID.SkeletonFilter(rules, skeletonModels, inputCache);
            filters.push(filter);
          }

          if (!filters || filters.length === 0) {
            throw new CATMAID.ValueError("Could not generate skeleton volume filters");
          }

          // Execute first filter to fill cache for other filters (mainly for
          // skeleton IDs.
          let filteredResultMap = new Map();
          let firstFilter = filters.pop();

          return firstFilter.execute(undefined, true)
            .then(function(filtered) {
              return handleFilteredData(filteredResultMap, firstFilter, filters, filtered);
            })
            .then(function() {
              let filteredResult = result.filter(function(r) {
                return filteredResultMap.has(r.skeleton_id);
              });
              let lDiff = result.length - filteredResult.length;
              if (lDiff > 0) {
                CATMAID.msg("Filtered skeletons", `Filtered additional ${lDiff} ` +
                    `skeletons by exact client-side tests`);
              }
              return Array.from(filteredResultMap.keys()).map(function(skeletonId) {
                return {
                  'skeleton_id': skeletonId,
                  'volume_ids': filteredResultMap.get(skeletonId),
                };
              });
            });
          }
      })
      .then(function(result) {
        // Register with name service
        let skeletonModels = result.reduce(function(o, r) {
          o[r.skeleton_id] = new CATMAID.SkeletonModel(r.skeleton_id);
          return o;
        }, {});
        return CATMAID.NeuronNameService.getInstance().registerAll(self, skeletonModels)
          .then(function() {
            // Return original result
            return result;
          });
      })
      .then(function(result) {
        // Update data table, select and show only result volumes.
        let table = document.querySelector(`div#${self.idPrefix}-content-innervations table`);
        if (!table) {
          throw new CATMAID.ValueError('Could not find volume table');
        }
        let datatable = $(table).DataTable();

        // Set a filter
        self.innervationVolumeIdFilter = result.reduce(function(s, v) {
          v.volume_ids.forEach(s.add, s);
          return s;
        }, new Set());
        self.innervationSkeletonMap = result.reduce(function(m, v) {
          for (let i=0; i<v.volume_ids.length; ++i) {
            let volumeId = v.volume_ids[i];
            let skeletonList = m.get(volumeId);
            if (!skeletonList) {
              skeletonList = [];
              m.set(volumeId, skeletonList);
            }
            skeletonList.push(v.skeleton_id);
          }
          return m;
        }, new Map());

        datatable.ajax.reload(function() {
          // Deselect all rows that aren't in the result set
          let data = datatable.rows().data();
          for (let i=0; i<data.length; ++i) {
            let v = data[i];
            v.selected = self.innervationVolumeIdFilter.has(v.id);
          }
          datatable.rows().invalidate();
          self.update();
        });
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Annotate all currently selected volumes.
   */
  VolumeManagerWidget.prototype.annotateSelectedVolumes = function() {
    if (!this.datatable) {
      return;
    }

    let allVolumes = this.datatable.rows({'search': 'applied' }).data().toArray();
    let selectedVolumeIds = allVolumes.filter(function(v) {
      return v.selected;
    }).map(function(v) {
      return v.id;
    });

    if (selectedVolumeIds.length === 0) {
      CATMAID.warn("No volumes selected");
      return;
    }

    // Retrieve class instance IDs for volumes
    CATMAID.fetch(project.id + '/volumes/entities/', 'POST', {
        volume_ids: selectedVolumeIds
      })
      .then(function(ciMapping) {
        return CATMAID.annotate(Object.values(ciMapping));
      })
      .then(function() {
        CATMAID.msg("Success", "Annotations added");
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Show all selected volumes in a new 3D Viewer.
   */
  VolumeManagerWidget.prototype.showSelectedVolumesIn3d = function(volumeIds, skeletonIds) {
    if (!volumeIds || volumeIds.length === 0) {
      CATMAID.warn('No volumes selected');
      return;
    }

    let models = null;
    if (skeletonIds) {
      models = skeletonIds.reduce(function(o, s) {
        o[s] = new CATMAID.SkeletonModel(s);
        return o;
      }, {});
    }

    let widget3d = WindowMaker.create('3d-viewer').widget;
    widget3d.options.shading_method = 'none';
    widget3d.options.color_method = 'none';

    if (models) {
      widget3d.append(models);
    }

    let lut = new THREE.Lut("rainbow", 10);
    lut.setMax(volumeIds.length - 1);

    volumeIds.forEach(function(v, i) {
      let color = lut.getColor(i);
      widget3d.showVolume(v.id, true, color, 0.3, true);
    });
  };

  VolumeManagerWidget.prototype.setMode = function(mode) {
    var index = this.modes.indexOf(mode);
    if (index === -1) {
      throw new CATMAID.ValueError('Unknown Volume Manager mode: ' + mode);
    }
    this.mode = mode;
    this.update();
    return true;
  };

  function makeSkeletonLink(skeletonId) {
    let name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
    return '<li><a href="#" data-action="select-skeleton" data-skeleton-id="' + skeletonId + '">' + name + '</a></li>';
  }

  VolumeManagerWidget.Modes = {
    list: {
      title: 'Main',
      createControls: function(widget) {
        let minNodes = CATMAID.DOM.createNumericField(
            undefined,
            "Min skeleton nodes", "If \"List skeletons\" is clicked for a " +
            "volume, only skeletons with at least this many nodes will be shown.",
            2,
            undefined,
            function() {
              let value = parseInt(this.value, 10);
              if (value === undefined || Number.isNaN(value)) {
                CATMAID.warn("Minimum skeleton nodes need to be a number");
                return;
              }
              widget.minFilterNodes = value;
            },
            5,
            "#");
        let minCable = CATMAID.DOM.createNumericField(
            undefined,
            "Min skeleton length (nm)", "If \"List skeletons\" is clicked for a " +
            "volume, only skeletons with at least a cable length of this will be shown.",
            0,
            undefined,
            function() {
              let value = parseFloat(this.value);
              if (value === undefined || Number.isNaN(value)) {
                CATMAID.warn("Minimum skeleton length need to be a number");
                return;
              }
              widget.minFilterCable = value;
            },
            8,
            "nm");

        // The skeleton source
        let sourceSelectContainer = CATMAID.DOM.createSelectElement(
            "Skeleton constraints",
            [{title: '(none)', value: 'none'}],
            "Only list skeletons for a volume from this skeleton source",
            'none',
            function(e) {
              widget.selectedSkeletonConstraintSource = this.value;
            },
            "skeleton-constraint-source");
        let sourceSelect = sourceSelectContainer.querySelector('select');

        widget.updateSkeletonSourceSelect(sourceSelect,
            widget.selectedSkeletonConstraintSource);

        return [{
          type: 'button',
          label: 'Refresh',
          title: 'Reload the displayed volume list',
          onclick: widget.redraw.bind(widget),
        }, {
          type: 'button',
          label: 'Annotate',
          title: 'Add an annotation to all selected volumes',
          onclick: widget.annotateSelectedVolumes.bind(widget),
        }, {
          type: 'button',
          label: 'Show selected in 3D',
          title: 'Show all selected volumesin a new 3D Viewer',
          onclick: function() {
            let selectedVolumes = widget.datatable.rows().data().toArray().filter(function(v) {
              return v.selected;
            });
            widget.showSelectedVolumesIn3d(selectedVolumes);
          }
        }, {
          type: 'child',
          element: minNodes,
        }, {
          type: 'child',
          element: minCable,
        }, {
          type: 'child',
          element: sourceSelectContainer,
        }];
      },
      createContent: function(container, widget) {
        var table = document.createElement('table');
        table.style.width = "100%";
        var header = table.createTHead();
        var hrow = header.insertRow(0);
        var columns = ['', 'Name', 'Id', 'Comment', 'Annotations', 'User', 'Creation time',
            'Editor', 'Edition time', 'Action'];
        columns.forEach(function(c) {
          hrow.insertCell().appendChild(document.createTextNode(c));
        });

        var tableContainer = document.createElement('div');
        tableContainer.setAttribute('class', 'volume-list');
        tableContainer.appendChild(table);
        container.appendChild(tableContainer);
        widget.datatable = $(table).DataTable({
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {

            CATMAID.fetch(project.id +  "/volumes/")
              .then(function(volumeData) {
                let volumeDetails = volumeData.data;
                if (widget.volumeIdFilter && widget.volumeIdFilter.size > 0) {
                  volumeDetails = volumeDetails.filter(function(v) {
                    return widget.volumeIdFilter.has(v[0]);
                  });
                }
                let volumes = volumeDetails.map(function(volume) {
                  return new CATMAID.Volume(CATMAID.tools.buildObject(volumeData.columns, volume));
                });
                callback({
                  draw: data.draw,
                  data: volumes
                });
              })
              .catch(CATMAID.handleError);
          },
          columns: [
            {
              render: function(data, type, row, meta) {
                return '<input type="checkbox" data-role="select" ' +
                    (row.selected ? 'checked' : '') + ' />';
              }
            },
            {data: "title"},
            {data: "id"},
            {
              data: "comment",
              width: "20%",
            },
            {
              data: "annotations",
              render: function (data, type, row, meta) {
                if (type === 'display') {
                  return data.join(', ');
                } else {
                  return data;
                }
              }
            },
            {
              data: "user_id",
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(data).login;
              }
            },
            {data: "creation_time"},
            {
              data: "editor_id",
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(data).login;
              }
            },
            {data: "edition_time"},
            {
              data: null,
              orderable: false,
              width: '15%',
              defaultContent: '<ul class="resultTags">' +
                  '<li><a href="#" data-action="list-skeletons">List skeletons</a></li> ' +
                  '<li><a href="#" data-action="list-connectors">List connectors</a></li> ' +
                  '<li><a href="#" data-action="export-STL">Export STL</a></li> ' +
                  '<li><a href="#" data-action="edit-volume">Edit</a></li> ' +
                  '<li><a href="#" data-action="remove">Remove</a></li></ul>',
            }
          ],
        })
        .on('change', 'input[data-role=select]', function() {
          var table = $(this).closest('table');
          var tr = $(this).closest('tr');
          var data =  $(table).DataTable().row(tr).data();
          data.selected = this.checked;
        });

        // Edit volume if 'edit' was clicked
        $(table).on('click', 'a[data-action="edit-volume"]', function() {
          var tr = $(this).closest("tr");
          var volume = widget.datatable.row(tr).data();
          widget.loadVolume(volume.id)
            .then(v => {
              widget.editVolume(v, container, () => {
                widget.initMode('list');
              });
            })
            .catch(CATMAID.handleError);

          // Prevent event from bubbling up.
          return false;
        });

        // Remove volume if 'remove' was clicked
        $(table).on('click', 'a[data-action="remove"]', function() {
          var tr = $(this).closest("tr");
          var volume = widget.datatable.row(tr).data();

          var confirmDialog = new CATMAID.OptionsDialog("Remove volume", {
            "Yes": function() {
              CATMAID.fetch(project.id + '/volumes/' + volume.id + '/', 'DELETE')
                .then(function(json) {
                  CATMAID.msg('Success', 'Volume ' + json.volume_id + ' removed');
                  widget.redraw();
                })
                .catch(CATMAID.handleError);
            },
            "No": CATMAID.noop
          });
          confirmDialog.appendMessage("Are you sure you want to delete volume "
              + volume.id + " (" + volume.title + ")?");
          confirmDialog.show(500,'auto');

          // Prevent event from bubbling up.
          return false;
        });

        // Skeleton intersection list
        $(table).on('click', 'a[data-action="list-skeletons"]', function() {
          var tr = $(this).closest("tr");
          var volume = widget.datatable.row(tr).data();
          CATMAID.Volumes.get(project.id, volume.id)
            .then(function(volume) {
              let bb = volume.bbox;
              let skeletonConstraints;
              if (widget.selectedSkeletonConstraintSource &&
                  widget.selectedSkeletonConstraintSource!== 'none') {
                let source = CATMAID.skeletonListSources.getSource(
                    widget.selectedSkeletonConstraintSource);
                if (!source) {
                  throw new CATMAID.ValueError("Can't find skeleton source: " +
                      widget.selectedSkeletonConstraintSource);
                }
                let skeletonIds = source.getSelectedSkeletons();
                if (skeletonIds.length > 0) {
                  skeletonConstraints = skeletonIds;
                }
              }
              return CATMAID.Skeletons.inBoundingBox(project.id, bb.min.x,
                  bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z,
                  widget.minFilterNodes, widget.minFilterCable, skeletonConstraints);
            })
            .then(function(skeletonIds) {
              if (!skeletonIds || skeletonIds.length === 0) {
                CATMAID.warn('Found no intersecting skeletons');
              } else {
                var handles = CATMAID.WindowMaker.create('selection-table');
                if (!handles) {
                  throw new CATMAID.ValueError("Could not create Selection Table");
                }
                handles.widget.addSkeletons(skeletonIds)
                  .then(function() {
                    CATMAID.msg('Success', 'Found ' + skeletonIds.length + ' skeletons');
                  })
                  .catch(CATMAID.handleError);
              }
            })
            .catch(CATMAID.handleError);

          // Prevent event from bubbling up.
          return false;
        });

        // Connector intersection list
        $(table).on('click', 'a[data-action="list-connectors"]', function() {
          var tr = $(this).closest("tr");
          var volume = widget.datatable.row(tr).data();
          CATMAID.Volumes.get(project.id, volume.id)
            .then(function(volume) {
              let bb = volume.bbox;
              let skeletonConstraints;
              if (widget.selectedSkeletonConstraintSource &&
                  widget.selectedSkeletonConstraintSource!== 'none') {
                let source = CATMAID.skeletonListSources.getSource(
                    widget.selectedSkeletonConstraintSource);
                if (!source) {
                  throw new CATMAID.ValueError("Can't find skeleton source: " +
                      widget.selectedSkeletonConstraintSource);
                }
                let skeletonIds = source.getSelectedSkeletons();
                if (skeletonIds.length > 0) {
                  skeletonConstraints = skeletonIds;
                }
              }
              return CATMAID.Connectors.inBoundingBox(project.id, bb.min.x,
                  bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, undefined,
                  true, true, skeletonConstraints);
            })
            .then(function(connectorData) {
              if (!connectorData || connectorData.length === 0) {
                CATMAID.warn('Found no connectors in volume');
              } else {
                var connectorListHandles = CATMAID.ConnectorList.fromRawData(connectorData);
                // Add a node filter for the selected volume
                var strategy = CATMAID.NodeFilterStrategy['volume'];
                var rule = new CATMAID.NodeFilterRule(strategy, {
                  'volumeId': volume.id
                });
                connectorListHandles.widget.filterRules.push(rule);
              }
            })
            .catch(CATMAID.handleError);

          // Prevent event from bubbling up.
          return false;
        });

        // Connector intersection list
        $(table).on('click', 'a[data-action="export-STL"]', function() {
          var tr = $(this).closest("tr");
          var volume = widget.datatable.row(tr).data();
          var headers = {Accept: ['model/x.stl-ascii', 'model/stl']};
          CATMAID.fetch("/" + project.id + "/volumes/" + volume.id + "/export.stl", "GET", undefined, true, undefined, undefined, undefined, headers)
            .then(function(volume_file) {
              var blob = new Blob([volume_file], {type: 'model/x.stl-ascii'});
              saveAs(blob, volume.name + '.stl');
            })
            .catch(CATMAID.handleError);

          // Prevent event from bubbling up.
          return false;
        });

        // Display a volume if clicked
        $(table).on('dblclick', 'tbody td', function() {
          var tr = $(this).closest("tr");
          var volume = widget.datatable.row(tr).data();
          widget.loadVolume(volume.id)
            .then(v => {
              widget.editVolume(v, container, () => {
                widget.initMode('list');
              });
            })
            .catch(CATMAID.handleError);
        });
      },
    },
    add: {
      title: 'Add volume',
      createControls: function(widget) {
        var hiddenFileButton = CATMAID.DOM.createFileButton(false, false,
            (function(event) {
              var files = event.target.files;
              if (0 === files.length) {
                CATMAID.error("Choose at least one file!");
              } else {
                widget.addVolumesFromSTL(Array.from(files).filter(function(file){
                  if (file.name.endsWith("stl")){
                    return true;
                  } else {
                    widget.addVolumeFromFile(file).catch(CATMAID.handleError);
                  }
                },this)).catch(CATMAID.handleError);
              }
            }).bind(this));
        hiddenFileButton.setAttribute('multiple', true);

        return [{
            type: 'child',
            element: hiddenFileButton,
          }, {
            type: 'button',
            label: 'Add from file',
            title: 'Supports JSON and ASCII-STL files',
            onclick: hiddenFileButton.click.bind(hiddenFileButton),
          }];
      },
      createContent(content, widget) {
        widget.editVolume(null, content);
      }
    },
    innervations: {
      title: 'Skeleton innervations',
      createControls: function(widget) {
        var innervationSourceSelectContainer = CATMAID.DOM.createSelectElement(
            "Skeletons",
            [{title: '(none)', value: 'none'}],
            'The skeletons for which volume intersections are checked.',
            'none',
            function(e) {
              widget.innervationSkeletonSource = this.value;
            },
            "skeleton-innervation-source");
        let innervationSourceSelect = innervationSourceSelectContainer.querySelector('select');
        widget.updateSkeletonSourceSelect(innervationSourceSelect,
            widget.innervationSkeletonSource, true);

        return [{
          type: 'child',
          element: innervationSourceSelect,
        }, {
          type: 'text',
          label: 'Volume annotation',
          title: 'Only check against volumes with this annotation.',
          id: `${widget.idPrefix}-volume-annotation`,
          onchange: function(e) {
            widget.innervationVolumeAnnotation = this.value.trim();
          },
        }, {
          type: 'checkbox',
          label: 'Exact filtering',
          title: 'If enabled, skeletons are tested if they truly intersect with a volume and not only its bounding box. This can take longer.',
          value: widget.innervationExactFiltering,
          onclick: function() {
            widget.innervationExactFiltering = this.checked;
          },
        }, {
          type: 'button',
          label: 'Find innervations',
          onclick: widget.findInnervations.bind(widget),
        }, {
          type: 'button',
          label: 'Show results in 3D',
          onclick: function() {
            let source = CATMAID.skeletonListSources.getSource(
                widget.innervationSkeletonSource);
            if (!source) {
              throw new CATMAID.ValueError("Can't find skeleton source: " +
                  widget.innervationSkeletonSource);
            }
            let skeletonIds = source.getSelectedSkeletons();
            if (skeletonIds.length === 0) {
              CATMAID.warn("No skeletons selected in source " + source.getName());
              return;
            }

            if (!widget.innervationSkeletonSource) {
              CATMAID.warn("No results to show");
              return;
            }
            let selectedVolumes = widget.innervationsDatatable.rows().data().toArray().filter(function(v) {
              return v.selected;
            });

            widget.showSelectedVolumesIn3d(selectedVolumes, skeletonIds);
          },
        }, {
          type: 'checkbox',
          label: 'Skeleton column',
          title: 'Whether or not to show a skeleton column for each volume.',
          value: widget.innervationSkeletonColumn,
          onclick: function(e) {
            widget.innervationSkeletonColumn = this.checked;
            widget.update();
          },
        }];
      },
      createContent: function(container, widget) {
        var table = document.createElement('table');
        table.style.width = "100%";
        var header = table.createTHead();
        var hrow = header.insertRow(0);
        var columns = ['', '', 'Name', 'Id', 'Comment', 'Annotations',
          'Skeletons', 'User', 'Creation time', 'Editor', 'Edition time',
          'Action'];
        columns.forEach(function(c) {
          hrow.insertCell().appendChild(document.createTextNode(c));
        });
        let lut = new THREE.Lut("rainbow", 10);

        var tableContainer = document.createElement('div');
        tableContainer.setAttribute('class', 'volume-list');
        tableContainer.appendChild(table);
        container.appendChild(tableContainer);
        widget.innervationsDatatable = $(table).DataTable({
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          autoWidth: false,
          ajax: function(data, callback, settings) {
            if (widget.innervationVolumeIdFilter) {
              CATMAID.fetch(project.id +  "/volumes/", "POST", {
                  'volume_ids': widget.innervationVolumeIdFilter ?
                      Array.from(widget.innervationVolumeIdFilter) : undefined,
                })
                .then(function(volumeData) {
                  let volumes = volumeData.data.map(function(volume) {
                    return new CATMAID.Volume(CATMAID.tools.buildObject(volumeData.columns, volume));
                  });
                  lut.setMax(volumes.length - 1);
                  callback({
                    draw: data.draw,
                    data: volumes
                  });
                })
                .catch(CATMAID.handleError);
            } else {
              callback({
                draw: data.draw,
                data: [],
              });
            }
          },
          columns: [
            {
              class: 'cm-center',
              width: '5%',
              render: function(data, type, row, meta) {
                return '<input type="checkbox" data-role="select" ' +
                    (row.selected ? 'checked' : '') + ' />';
              }
            },
            {
              orderable: false,
              width: '5%',
              class: 'cm-center',
              render: function(data, type, row, meta) {
                let color = lut.getColor(meta.row);
                return `<span class="color"><i class="fa fa-circle" style="color: ${color.getStyle()}"></i></span>`;
              }
            },
            {data: "title"},
            {data: "id"},
            {
              data: "comment",
            },
            {
              data: "annotations",
              render: function (data, type, row, meta) {
                if (type === 'display') {
                  return data.join(', ');
                } else {
                  return data;
                }
              }
            },
            {
              name: 'skeletons',
              visible: widget.innervationSkeletonColumn,
              render: function(data, type, row, meta) {
                let skeletonIds = widget.innervationSkeletonMap.get(row.id);
                if (!skeletonIds || skeletonIds.length === 0) {
                  return '<em>(none)</em>';
                } else {
                  return '<ul class="resultTags">' +
                      skeletonIds.map(makeSkeletonLink).join(' ') + '</ul>';
                }
              }
            },
            {
              data: "user_id",
              class: 'cm-center',
              width: '5%',
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(data).login;
              }
            },
            {
              data: "creation_time",
              width: '15%',
            },
            {
              data: "editor_id",
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return CATMAID.User.safe_get(data).login;
              }
            },
            {
              data: "edition_time",
              width: '15%',
            },
            {
              data: null,
              orderable: false,
              width: '15%',
              defaultContent: '<ul class="resultTags"><li><a href="#" data-action="remove">Remove</a></li> ' +
                  '<li><a href="#" data-action="list-skeletons">List skeletons</a></li> ' +
                  '<li><a href="#" data-action="list-connectors">List connectors</a></li>' +
                  '<li><a href="#" data-action="export-STL">Export STL</a></ul></ul>'
            }
          ],
        })
        .on('change', 'input[data-role=select]', function() {
          var table = $(this).closest('table');
          var tr = $(this).closest('tr');
          var data =  $(table).DataTable().row(tr).data();
          data.selected = this.checked;
        })
        .on('click', 'a[data-action=select-skeleton]', function() {
          let skeletonId = parseInt(this.dataset.skeletonId, 10);
          if (!skeletonId) {
            CATMAID.warn("Could not find skeleton ID");
            return;
          }
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
        });

        // Remove volume if 'remove' was clicked
        $(table).on('click', 'a[data-action="remove"]', function() {
          var tr = $(this).closest("tr");
          var volume = widget.innervationsDatatable.row(tr).data();

          var confirmDialog = new CATMAID.OptionsDialog("Remove volume", {
            "Yes": function() {
              CATMAID.fetch(project.id + '/volumes/' + volume.id + '/', 'DELETE')
                .then(function(json) {
                  CATMAID.msg('Success', 'Volume ' + json.volume_id + ' removed');
                  widget.redraw();
                })
                .catch(CATMAID.handleError);
            },
            "No": CATMAID.noop
          });
          confirmDialog.appendMessage("Are you sure you want to delete volume "
              + volume.id + " (" + volume.name + ")?");
          confirmDialog.show(500,'auto');

          // Prevent event from bubbling up.
          return false;
        });

        // Skeleton intersection list
        $(table).on('click', 'a[data-action="list-skeletons"]', function() {
          var tr = $(this).closest("tr");
          var volume = widget.innervationsDatatable.row(tr).data();
          if (!widget.innervationSkeletonMap) {
            CATMAID.warn("Could not find innervation skeleton map");
            return;
          }

          let skeletonIds = widget.innervationSkeletonMap.get(volume.id);
          if (!skeletonIds) {
            CATMAID.warn("Could not find any innervating skeletons");
            return;
          }

          var handles = CATMAID.WindowMaker.create('selection-table');
          if (!handles) {
            throw new CATMAID.ValueError("Could not create Selection Table");
          }
          handles.widget.addSkeletons(skeletonIds)
            .then(function() {
              CATMAID.msg('Success', 'Found ' + skeletonIds.length + ' skeletons');
            })
            .catch(CATMAID.handleError);

          // Prevent event from bubbling up.
          return false;
        });

        // Connector intersection list
        $(table).on('click', 'a[data-action="list-connectors"]', function() {
          var tr = $(this).closest("tr");
          var volume = widget.innervationsDatatable.row(tr).data();
          CATMAID.Volumes.get(project.id, volume.id)
            .then(function(volume) {
              let bb = volume.bbox;
              let skeletonConstraints;
              if (widget.innervationSkeletonSource &&
                  widget.innervationSkeletonSource!== 'none') {
                let source = CATMAID.skeletonListSources.getSource(
                    widget.innervationSkeletonSource);
                if (!source) {
                  throw new CATMAID.ValueError("Can't find skeleton source: " +
                      widget.innervationSkeletonSource);
                }
                let skeletonIds = source.getSelectedSkeletons();
                if (skeletonIds.length > 0) {
                  skeletonConstraints = skeletonIds;
                }
              }
              return CATMAID.Connectors.inBoundingBox(project.id, bb.min.x,
                  bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, undefined,
                  true, true, skeletonConstraints);
            })
            .then(function(connectorData) {
              if (!connectorData || connectorData.length === 0) {
                CATMAID.warn('Found no connectors in volume');
              } else {
                var connectorListHandles = CATMAID.ConnectorList.fromRawData(connectorData);
                // Add a node filter for the selected volume
                var strategy = CATMAID.NodeFilterStrategy['volume'];
                var rule = new CATMAID.NodeFilterRule(strategy, {
                  'volumeId': volume.id
                });
                connectorListHandles.widget.filterRules.push(rule);
              }
            })
            .catch(CATMAID.handleError);

          // Prevent event from bubbling up.
          return false;
        });

        // Connector intersection list
        $(table).on('click', 'a[data-action="export-STL"]', function() {
          var tr = $(this).closest("tr");
          var volume = widget.innervationsDatatable.row(tr).data();
          var headers = {Accept: ['model/x.stl-ascii', 'model/stl']};
          CATMAID.fetch(project.id + "/volumes/" + volume.id + "/export.stl",
              "GET", undefined, true, undefined, undefined, undefined, headers)
            .then(function(volume_file) {
              var blob = new Blob([volume_file], {type: 'model/x.stl-ascii'});
              saveAs(blob, volume.name + '.stl');
            })
            .catch(CATMAID.handleError);

          // Prevent event from bubbling up.
          return false;
        });

        // Display a volume if clicked
        $(table).on('dblclick', 'tbody td', function() {
          var tr = $(this).closest("tr");
          var volume = widget.innervationsDatatable.row(tr).data();
          widget.loadVolume(volume.id)
            .then(v => {
              return widget.editVolume(v, container, () => {
                widget.initMode('innervations');
              });
            })
            .catch(CATMAID.handleError);
        });
      },
      init: function(widget) {
        let annotationInput = document.querySelector(`input#${widget.idPrefix}-volume-annotation`);
        if (annotationInput) {
          CATMAID.annotations.add_autocomplete_to_input(annotationInput);
        }
      },
      getMessage: function(widget) {
        if (!widget.innervationVolumeIdFilter || widget.innervationVolumeIdFilter.size === 0) {
          return "Please define your query in the toolbar above";
        }
      },
      update: function(widget) {
        if (widget.innervationsDatatable) {
          widget.innervationsDatatable.column('skeletons:name').visible(
              widget.innervationSkeletonColumn);
        }
      },
    },
  };

  var getVolumeType = function(volume) {
    if (volume instanceof CATMAID.AlphaShapeVolume) {
      return "alphashape";
    } else if (volume instanceof CATMAID.ConvexHullVolume) {
      return "convexhull";
    } else if (volume instanceof CATMAID.BoxVolume) {
      return "box";
    } else {
      throw new CATMAID.ValueError("Unknown volume type");
    }
  };

  var addPreviewControls = function(content, volume) {
    // Option to control preview
    var preview = CATMAID.DOM.createCheckboxSetting(
        "Preview in 3D viewer", volume.preview, "If checked the first " +
        "available 3D viewer will be used to preview the meshes before saving.",
        function(e) { volume.set("preview", this.checked); });
    content.append(preview);

    // Inject color picker into preview checkbox label
    var $previewColor = CATMAID.DOM.createInputSetting(
        "Preview color", volume.previewColor,
        "Set the color of the volume 3D preview.");
    content.append($previewColor);
    CATMAID.ColorPicker.enable($('input', $previewColor), {
      initialColor: volume.previewColor,
      initialAlpha: volume.previewOpacity,
      onColorChange: function(color, alpha, colorChanged, alphaChanged) {
        if (colorChanged) {
          var hexColor = CATMAID.tools.rgbToHex(
            Math.round(255 * color.r),
            Math.round(255 * color.g),
            Math.round(255 * color.b));
          volume.set('previewColor', hexColor);
        }
        if (alphaChanged) {
          volume.set('previewOpacity', alpha);
        }
      }
    });
  };

  var getPreviewHandlers = function(volume) {
    // Give some feedback in case of problems
    var checkGeneratedMesh = function(volume, mesh) {
      var meshNeedsUpdate = false;
      if (!mesh || 0 === mesh.length) {
        CATMAID.warn("Neither points nor mesh could be generated");
        meshNeedsUpdate = true;
      } else if (!mesh[0] || 0 === mesh[0].length) {
        CATMAID.warn("Couldn't find points for volume generation");
        meshNeedsUpdate = true;
      } else if (!mesh[1] || 0 === mesh[1].length) {
        CATMAID.warn("Couldn't generate volume from degenerative points");
        meshNeedsUpdate = true;
      }
      volume.meshNeedsSync = meshNeedsUpdate;
      return !meshNeedsUpdate;
    };
    var onUpdate = function(field, newValue, oldValue) {
      // Recalculate mesh if preview was just enabled
      if (volume.preview && "preview" === field) {
        volume.meshNeedsSync = true;
      }
      // Re-create mesh if the updated field is no 'basic' property to avoid
      // unnecessary re-calculation.
      if (volume.preview && volume.meshNeedsSync) {
        $.blockUI({message: '<img src="' + CATMAID.staticURL +
            'images/busy.gif" /> <span>Please wait, creating volume</span>'});
        var onSuccess = function(volume, mesh) {
          checkGeneratedMesh(volume, mesh);
          $.unblockUI();
        };
        var updateMesh = volume.updateTriangleMesh.bind(volume, onSuccess,
            $.unblockUI.bind($));
        setTimeout(updateMesh, 100);
      } else if (!volume.preview && "preview" === field) {
        // Preview just got disabled
        volume.clearPreviewData();
      }
    };
    var onClose = function(save, onSuccess, onCancel) {
      if (save) {
        var onSuccessWrapper = function(volume, mesh) {
          if (checkGeneratedMesh(volume, mesh)) {
            CATMAID.tools.callIfFn(onSuccess);
          } else {
            CATMAID.tools.callIfFn(onCancel);
          }
          // Remove previewed meshes from 3D viewer
          volume.clearPreviewData();
        };
        if (volume.meshNeedsSync) {
          volume.updateTriangleMesh(onSuccessWrapper);
        } else {
          onSuccessWrapper(volume, volume.mesh);
        }
      } else {
        // Remove previewed meshes from 3D viewer
        volume.clearPreviewData();
        CATMAID.tools.callIfFn(onSuccess);
      }
    };
    return [onUpdate, onClose];
  };

  /**
   * Either convex hull or alpha-shape, which are almost identical. The
   * alpha-shape has an extra parameter, the alpha.
   */
  var makeVolume = function(name, theclass, withAlpha) {
    return {
      name: name,
      createSettings: function(volume) {
        // TODO source is never used?
        var source = function(e) {
          var source = CATMAID.skeletonListSources.getSource(this.value);
          volume.set("neuronSource", source);
        };

        var ruleType = function(e) { };
        var $settings = $('<div />');
        var $content = CATMAID.DOM.addSettingsContainer($settings,
            name + " rule settings", false);

        addPreviewControls($content, volume);

        // The skeleton source
        var availableSources = CATMAID.skeletonListSources.getSourceNames();
        var sourceOptions = availableSources.reduce(function(o, name) {
          o[name] = name;
          return o;
        }, {});
        // Set a default source, if there is no source set yet
        if (!volume.neuronSourceName && availableSources.length > 0) {
          volume.set("neuronSourceName", availableSources[0]);
        }
        $content.append(CATMAID.DOM.createCheckboxSetting("Respect node radius",
            volume.respectRadius, "If checked, every valid node with a radius will " +
            "trigger the creation of 12 additional equally distibuted points around it, " +
            "having a distance of the node's radius.",
            function(e) { volume.set("respectRadius", this.checked); }));
        $content.append(CATMAID.DOM.createSelectSetting("Skeleton source",
            sourceOptions, "The selection to draw points from", function(e) {
              volume.set("neuronSourceName", this.value);
            }, volume.neuronSourceName));

        if (withAlpha) {
          var defaultAlphaStep = 10.0;
          var alphaInputWrapper = CATMAID.DOM.createNumericInputSetting("Alpha (nm)",
              volume.alpha, defaultAlphaStep,
              "Only triangles with a circumsphere radius less than alpha will be used",
              function(e) {
                volume.set("alpha", Number(this.value));
              });
          $content.append(alphaInputWrapper);

          // Also update on mouse clicks and mouse wheel
          var alphaInput = alphaInputWrapper.find('input');
          alphaInput.on('mouseup mousewheel', function() {
            volume.set("alpha", Number(this.value));
          });

          $content.append(CATMAID.DOM.createNumericInputSetting("",
              defaultAlphaStep, 10.0, "Set the alpha change step for the numeric input above",
              function(e) {
                alphaInput.prop('step', Number(this.value));
              }));

          $content.append(CATMAID.DOM.createCheckboxSetting("Filter triangles",
              volume.filterTriangles, "If checked, the alpha filter will be " +
              "applied to individual triangles of the mesh. Otherwise, alpha " +
              "is used to filter the tetrahedra of the 3D triangulation.",
              function(e) { volume.set("filterTriangles", this.checked); }));
        }

        // Get available filter strategeis
        var nodeFilters = Object.keys(CATMAID.SkeletonFilterStrategy).reduce(function(o, p) {
          o[CATMAID.SkeletonFilterStrategy[p].name] = p;
          return o;
        }, {});
        CATMAID.DOM.appendNewNodeFilterControls('skeleton', nodeFilters,
            $content, function(rule, strategt) {
          if (datatable) {
            volume.rules.push(rule);
            // To trigger events, override with itself
            volume.set("rules", volume.rules, true);
            // Trigger table update
            datatable.rows().invalidate();
            datatable.ajax.reload();
          }
        });

        // Get available rules
        var table = document.createElement('table');
        table.style.width = "100%";
        var header = table.createTHead();
        var hrow = header.insertRow(0);
        var columns = ['On', 'Name', 'Merge mode', 'Options', 'Is skeleton', 'Has name'];
        columns.forEach(function(c) {
          hrow.insertCell().appendChild(document.createTextNode(c));
        });

        var self = this;

        var tableContainer = document.createElement('div');
        tableContainer.appendChild(table);
        $content.append(tableContainer);
        var datatable = $(table).DataTable({
          dom: "tp",
          ajax: function(data, callback, settings) {
            var rules = volume.rules;
            callback({
              draw: data.draw,
              recordsTotal: rules.length,
              recordsFiltered: rules.length,
              data: rules
            });
          },
          order: [],
          columns: [
            {
              orderable: false,
              render: function(data, type, row, meta) {
                var checked = !row.skip;
                return '<input type="checkbox" ' + (checked ? 'checked /> ' : '/>');
              }
            },
            {
              orderable: false,
              data: "strategy.name"
            },
            {
              orderable: false,
              render: function(data, type, row, meta) {
                return row.mergeMode === CATMAID.UNION ? "Union" :
                    (row.mergeMode === CATMAID.INTERSECTION ? "Intersection" : row.mergeMode);
              }
            },
            {
              orderable: false,
              render: function(data, type, row, meta) {
                return row.options ? JSON.stringify(row.options) : "-";
              }
            },
            {
              orderable: false,
              render: function(data, type, row, meta) {
                return row.validOnlyForSkid ? row.validOnlyForSkid : "-";
              }
            },
            {
              orderable: false,
              render: function(data, type, row, meta) {
                return row.validOnlyForName ? row.validOnlyForName : "-";
              }
            }
          ],
          language: {
            emptyTable: "No filters added yet (defaults to take all nodes)"
          }
        });

        // Updated skipping of rules
        $(table).on('change', 'td', function(e) {
          var tr = $(this).closest("tr");
          var rule = datatable.row(tr).data();
          rule.skip = !e.target.checked;
          // Trigger events
          volume.set("rules", volume.rules, true);
        });

        if (volume.preview) {
          volume.updateTriangleMesh();
        }

        return $settings;
      },
      createVolume: function(options) {
        var volume = new CATMAID[theclass](options);
        volume.init();
        return volume;
      },
      /**
       * Create an array of handlers: [onVolumeUpdate, onVolumeClose]
       */
      createHandlers: function(volume) {
        return getPreviewHandlers(volume);
      },
    };
  };

  var volumeTypes = {
    "box": {
      name: "Box",
      createSettings: function(volume) {
        var $settings = $('<div />');
        var $content = CATMAID.DOM.addSettingsContainer($settings,
            "Box settings", false);

        // Regular box properties
        var minX = function(e) { volume.set("minX", Number(this.value)); };
        var minY = function(e) { volume.set("minY", Number(this.value)); };
        var minZ = function(e) { volume.set("minZ", Number(this.value)); };
        var maxX = function(e) { volume.set("maxX", Number(this.value)); };
        var maxY = function(e) { volume.set("maxY", Number(this.value)); };
        var maxZ = function(e) { volume.set("maxZ", Number(this.value)); };

        let inputMinX = CATMAID.DOM.createInputSetting("Min X", volume.minX,
             "X coordinate of the boxes minimum corner.", minX);
        let inputMinY = CATMAID.DOM.createInputSetting("Min Y", volume.minY,
             "Y coordinate of the boxes minimum corner.", minY);
        let inputMinZ = CATMAID.DOM.createInputSetting("Min Z", volume.minZ,
             "Z coordinate of the boxes minimum corner.", minZ);
        let inputMaxX = CATMAID.DOM.createInputSetting("Max X", volume.maxX,
             "X coordinate of the boxes maximum corner.", maxX);
        let inputMaxY = CATMAID.DOM.createInputSetting("Max Y", volume.maxY,
             "Y coordinate of the boxes maximum corner.", maxY);
        let inputMaxZ = CATMAID.DOM.createInputSetting("Max Z", volume.maxZ,
             "Z coordinate of the boxes maximum corner.", maxZ);

        // Helper to create a cube at the current location with a particular
        // edge length.
        let cubeEdgeInput = CATMAID.DOM.createNumericInputSetting(
            "Cube at current location", 0, 1,
            "Optional, edge length in nm for a cube created at the current location");
        var cubeButton = document.createElement('button');
        cubeButton.onclick = function(e) {
          let edgeLength = parseFloat(cubeEdgeInput.find('input').val());
          if (!edgeLength || Number.isNaN(edgeLength)) {
            CATMAID.warn("No valid edge length, can't create cube");
            return;
          }
          let halfLength = edgeLength / 2.0;

          // Fill input fields
          inputMinX.find('input').val(project.coordinates.x - halfLength).trigger("change");
          inputMinY.find('input').val(project.coordinates.y - halfLength).trigger("change");
          inputMinZ.find('input').val(project.coordinates.z - halfLength).trigger("change");
          inputMaxX.find('input').val(project.coordinates.x + halfLength).trigger("change");
          inputMaxY.find('input').val(project.coordinates.y + halfLength).trigger("change");
          inputMaxZ.find('input').val(project.coordinates.z + halfLength).trigger("change");

          CATMAID.msg("Success", "Defined cube at location (" + project.x +
            ", " + project.y + ", " + project.z + ") with edge length " +
            edgeLength + "nm");
        };
        cubeButton.appendChild(document.createTextNode('Define cube at current location'));
        $content.append(cubeEdgeInput);
        $content.append(CATMAID.DOM.createLabeledControl("", cubeButton,
              "If an edge length has been defined, this will populate the min/max fields to define a cube at the current location"));

        $content.append(inputMinX);
        $content.append(inputMinY);
        $content.append(inputMinZ);
        $content.append(inputMaxX);
        $content.append(inputMaxY);
        $content.append(inputMaxZ);

        addPreviewControls($content, volume);

        return $settings;
      },
      createVolume: function(options) {
        return new CATMAID.BoxVolume(options);
      },
      /**
       * Create an array of handlers: [onVolumeUpdate, onVolumeClose]
       */
      createHandlers: function(volume) {
        var handlers = getPreviewHandlers(volume);

        if (project.focusedStackViewer) {
          var stack = project.focusedStackViewer;
          // TODO: Use a proper layer for this and make this work wirh regular
          // ortho stacks.
          var boxTool = new CATMAID.BoxSelectionTool();
          boxTool.destroy();
          boxTool.register(stack);
          boxTool.createCropBoxByWorld(
              volume.minX, volume.minY, Math.abs(volume.maxX - volume.minX),
              Math.abs(volume.maxY - volume.minY), 0, volume.minZ, volume.maxZ);

          let baseOnUpdate = handlers[0];
          handlers[0] = function(field, newValue, oldValue) {
            if (boxTool.cropBox) {
              boxTool.cropBox.top = volume.minY;
              boxTool.cropBox.bottom = volume.maxY;
              boxTool.cropBox.left = volume.minX;
              boxTool.cropBox.right = volume.maxX;
              boxTool.cropBox.z1 = volume.minZ;
              boxTool.cropBox.z2 = volume.maxZ;
              boxTool.updateCropBox();
            }
            baseOnUpdate(field, newValue, oldValue);
          };
          let baseOnClose = handlers[1];
          handlers[1] = function(save, onSuccess, onCancel) {
            boxTool.destroy();
            baseOnClose.call(this, save, onSuccess, onCancel);
          };
        }

        return handlers;
      }
    },

    /**
     * Convex hulls can be created around a set of points. Points are provided
     * by point sources which then can be restricted further.
     */
    "convexhull": makeVolume("Convex hull", "ConvexHullVolume"),

    /**
     * Alpha-shapes can be created around a set of points. Points are provided
     * by point sources which are then restricted further.
     */
     "alphashape": makeVolume("Alpha shape", "AlphaShapeVolume", true)
  };

  // A key that references this widget in CATMAID
  var widgetKey = "volume-manager-widget";

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Volume Manager",
    description: "List and edit volumes and create new ones",
    key: widgetKey,
    creator: VolumeManagerWidget,
    state: {
      getState: function(widget) {
        return {
          minFilterNodes: widget.minFilterNodes,
          minFilterCable: widget.minFilterCable
        };
      },
      setState: function(widget, state) {
        CATMAID.tools.copyIfDefined(state, widget, 'minFilterNodes');
      }
    }
  });

  // Add an action to the tracing tool that will open this widget
  CATMAID.TracingTool.actions.push(new CATMAID.Action({
    helpText: "Volume Manger: Create and manage volumes based on skeletons and spatial properties",
    buttonID: "data_button_volume_manager",
    buttonName: 'volume_manager',
    iconURL: CATMAID.makeStaticURL('images/volume-manager.svg'),
    run: function (e) {
        WindowMaker.show(widgetKey);
        return true;
    }
  }));

})(CATMAID);
