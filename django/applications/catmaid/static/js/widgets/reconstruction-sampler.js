/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * For large volumes, manual reconstruction of large neurons is very time
   * consuming, even more so whole networks. If one is primarily interested
   * in connectivity, the Reconstruction Sampler widget can help to direct
   * reconstruction time more efficiently.
   *
   * Starting from a reconstructed backbone, domains of interest are selected
   * ("sampler domains"), based on e.g. bounding tags.
   */
  var ReconstructionSampler = function() {
    this.widgetID = this.registerInstance();
    this.idPrefix = "reconstruction-sampler-" + this.widgetID;

    this.workflow = new CATMAID.Workflow({
      steps: [
        new BackboneWorkflowStep(),
        new DomainWorkflowStep(),
        new IntervalWorkflowStep(),
        new SynapseWorkflowStep(),
        new PartnerWorkflowStep()
       ]
    });

    this.init();

    // Listen to active node change events
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);
  };

  ReconstructionSampler.prototype = new InstanceRegistry();

  ReconstructionSampler.prototype.getName = function() {
    return "Reconstruction Sampler " + this.widgetID;
  };

  ReconstructionSampler.prototype.init = function(state) {
    state = state || {};
    let get = CATMAID.tools.getDefined;
    this.state = {
      'intervalLength': get(state.intervalLength, 5000),
      'intervalError': get(state.intervalError, 250),
      'createIntervalBoundingNodes': get(state.createIntervalBoundingNodes, true),
      'domainType': get(state.domainType, 'regular'),
      'domainStartNodeType': get(state.domainStartNodeType, 'root'),
      'domainEndNodeType': get(state.domainEndNodeType, 'downstream'),
      'reviewRequired': get(state.reviewRequired, true),
      'interpolateLocations': get(state.interpolateLocations, true),
      'interpolatableX': get(state.interpolatableX, project.interpolatableSections.x),
      'interpolatableY': get(state.interpolatableY, project.interpolatableSections.y),
      'interpolatableZ': get(state.interpolatableZ, project.interpolatableSections.z),
      'binaryIntervalColors': get(state.binaryIntervalColors, true),
      'leafHandling': get(state.leafHandling, 'merge-or-create'),
      'mergeLimit': get(state.mergeLimit, 0.2),
    };
    this.workflow.setState(this.state);
    this.workflow.selectStep(0);
  };

  /**
   * Init state based on the current sampler user interface controls.
   */
  ReconstructionSampler.prototype.initFromUI = function() {
    let state = {
      'intervalLength': Number(document.getElementById(this.idPrefix + '-interval-length').value),
      'intervalError': Number(document.getElementById(this.idPrefix + '-max-error').value),
      'createIntervalBoundingNodes': document.getElementById(this.idPrefix + '-create-bounding-nodes').checked,
      'reviewRequired': document.getElementById(this.idPrefix + '-review-required').checked,
      'leafHandling': document.getElementById(this.idPrefix + '-leaf-handling').value,
      'mergeLimit': Number(document.getElementById(this.idPrefix + '-merge-limit').value) / 100.0,
    };
    this.init(state);
  };

  ReconstructionSampler.prototype.setFromSampler = function(sampler) {
    this.state['samplerId'] = sampler['id'];
    this.state['skeletonId'] = sampler['skeleton_id'];
    this.state['intervalLength'] = sampler['interval_length'];
    this.state['intervalError'] = sampler['interval_error'];
    this.state['createIntervalBoundingNodes'] = sampler['create_interval_boundaries'];
    this.state['reviewRequired'] = sampler['review_required'];
    this.state['leafHandling'] = sampler['leaf_segment_handling'];
    this.state['mergeLimit'] = sampler['merge_limit'];
  };

  ReconstructionSampler.prototype.destroy = function() {
    CATMAID.NeuronNameService.getInstance().unregister(this);
    this.unregisterInstance();

    SkeletonAnnotations.off(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);
  };

  ReconstructionSampler.prototype.handleActiveNodeChange = function(node) {
    if (this.workflow) {
      var step = this.workflow.getCurrentStep();
      if (CATMAID.tools.isFn(step.handleActiveNodeChange)) {
        step.handleActiveNodeChange(this, node);
      }
    }
  };

  ReconstructionSampler.prototype.update = function() {
    var step = this.workflow.getCurrentStep();
    while (this.content.lastChild) {
      this.content.removeChild(this.content.lastChild);
    }
    // Make sure the tab is set correctly
    var tabs = $(this.tabControls);
    var activeIndex = tabs.tabs('option', 'active');
    if (activeIndex !== this.workflow.currentStepIndex) {
      tabs.tabs('option', 'active', this.workflow.currentStepIndex);
    }

    // Update actual content
    step.updateContent(this.content, this);
  };

  ReconstructionSampler.prototype.getWidgetConfiguration = function() {
    return {

      helpText: [
        '<h1> Reconstruction Sampler<h1>',
        '<p>For large volumes, manual reconstruction of large neurons is very time ',
        'consuming, even more so whole networks. If one is primarily interested ',
        'in connectivity, the Reconstruction Sampler Widget can help to direct ',
        'reconstruction effort to be more efficient. This process guides users ',
        'through multiple steps, each one narrowing the focus on where to spend ',
        'time reconstructing a neuron.</p>',

        '<p>Starting from a reconstructed backbone or a seed point, domains of ',
        'interest are selected on it ("sampler domains"). This can happen e.g. ',
        'by defining boundary tags that constrain which nodes are looked at on ',
        'a backbone.</p>',

        '<p></p>'
      ].join('\n'),

      /**
       * The control panel is tab based to move users from one step to the next.
       */
      createControls: function(controls) {
        var tabNames = this.workflow.steps.map(function(step) {
          return step.title;
        });
        var tabs = CATMAID.DOM.addTabGroup(controls, '-sampler', tabNames);

        var state = this.state;
        this.workflow.steps.forEach(function(step, i) {
          var tab = tabs[step.title];
          CATMAID.DOM.appendToTab(tab, step.createControls(this));
          tab.dataset.index = i;
        }, this);

        var self = this;
        this.tabControls = $(controls).tabs({
          active: this.workflow.currentStepIndex,
          activate: function(event, ui) {
            var oldStepIndex = parseInt(ui.oldPanel.attr('data-index'), 10);
            var newStepIndex = parseInt(ui.newPanel.attr('data-index'), 10);

            var tabs = $(self.tabControls);
            var activeIndex = tabs.tabs('option', 'active');
            if (activeIndex !== self.workflow.currentStepIndex) {
              if (!self.workflow.selectStep(newStepIndex)) {
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

      createContent: function(content) {
        this.content = content;
      },

      class: 'table-widget',

      init: function() {
        this.update();
      }
    };
  };

  var toPaddedString = function(value) {
    return (value < 10 ? '0' : '') + value;
  };

  var formatDate = function(date) {
    let month = date.getUTCMonth() + 1;
    let day = date.getUTCDate();
    return date.getUTCFullYear() + '-' +
        toPaddedString(date.getUTCMonth() + 1) + '-' +
        toPaddedString(date.getUTCDate()) + ' ' +
        toPaddedString(date.getUTCHours()) + ':' +
        toPaddedString(date.getUTCMinutes()) + ':' +
        toPaddedString(date.getUTCSeconds());
  };

  /**
   * Select a backbone. Specify portion(s) of backbone you wish to sample
   * ("sample domains").
   */
  var BackboneWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Sampler");

    // Maps state IDs to state objects, populated on demand
    this.possibleStates = null;
  };

  BackboneWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  BackboneWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  BackboneWorkflowStep.prototype.activate = function(state) {

  };

  BackboneWorkflowStep.prototype.isComplete = function(state) {
    return undefined !== state['samplerId'];
  };

  BackboneWorkflowStep.prototype.createControls = function(widget) {
    var self = this;

    var mergeLimitDisabled = widget.state['mergeLimit'] !== 'merge-or-create' &&
        widget.state['mergeLimit'] !== 'merge';
    var mocMergeLimit = CATMAID.DOM.createNumericField(undefined, 'Merge limit (%)',
        'When the "Merge or create" or "Merge" leaf handling mode is selected, this ' +
        'value can be used to limit to what percentage of the interval ' +
        'length should be merged. A value of zero or 100 disables the limit ' +
        'effectively.', Number(100 * widget.state['mergeLimit']).toFixed(0),
        undefined, function() {
          widget.state['mergeLimit'] = Number(this.value) / 100.0;
        }, 4, mergeLimitDisabled, false, 1, 0, 100);
    var mocMergeLimitInput = mocMergeLimit.querySelector('input');
    mocMergeLimitInput.setAttribute('id', widget.idPrefix + '-merge-limit');

    return [
      {
        type: 'button',
        label: 'Use current skeleton as active backbone',
        onclick: function() {
          var skeletonId = SkeletonAnnotations.getActiveSkeletonId();
          if (skeletonId) {
            widget.initFromUI();
            widget.state['skeletonId'] = skeletonId;
            widget.update();
          } else {
            CATMAID.warn("No skeleton selected");
          }
        }
      },
      {
        type: 'button',
        label: 'New session',
        onclick: function() {
          widget.initFromUI();
          widget.update();
          CATMAID.msg("Info", "Stared new sampler session");
        }
      },
      {
        id: widget.idPrefix + '-interval-length',
        type: 'numeric',
        label: 'Interval length (nm)',
        title: 'Default length of intervals created in domains of this sampler',
        value: widget.state['intervalLength'],
        length: 6,
        onchange: function() {
          widget.state['intervalLength'] = Number(this.value);
        }
      },
      {
        id: widget.idPrefix + '-max-error',
        type: 'numeric',
        label: 'Max error (nm)',
        title: 'If the interval error with existing nodes is bigger than this value and ' +
            'interval boundary node creation is enabled, a new node will be created.',
        value: widget.state['intervalError'],
        length: 6,
        onchange: function() {
          widget.state['intervalError'] = Number(this.value);
        }
      },
      {
        id: widget.idPrefix + '-create-bounding-nodes',
        type: 'checkbox',
        label: 'Create bounding nodes',
        title: 'To match the interval length exactly, missing nodes can be created at respective locations.',
        value: widget.state['createIntervalBoundingNodes'],
        onclick: function() {
          widget.state['createIntervalBoundingNodes'] = this.checked;
        }
      },
      {
        id: widget.idPrefix + '-review-required',
        type: 'checkbox',
        label: 'Review required',
        title: 'Whether domains and intervals can only be completed if they are reviewed completely',
        value: widget.state['reviewRequired'],
        onclick: function() {
          widget.state['reviewRequired'] = this.checked;
        }
      },
      {
        type: 'checkbox',
        label: 'Interpolate locations',
        value: widget.state['interpolateLocations'],
        onclick: function() {
          widget.state['interpolateLocations'] = this.checked;
          $('input#catmaid-sampler-interpolate-x-' + widget.widgetID + ',' +
            'input#catmaid-sampler-interpolate-y-' + widget.widgetID + ',' +
            'input#catmaid-sampler-interpolate-z-' + widget.widgetID).prop('disabled', !this.checked);
        },
        title: 'If checked, nodes at the respective sections in the displayed reference stack are placed at an interpolated location'
      },
      {
        type: 'text',
        label: 'X',
        length: 5,
        value: widget.state['interpolatableX'].join(", "),
        title: 'Nodes at these X project coordinates will be interpolated.',
        id: 'catmaid-sampler-interpolate-x-' + widget.widgetID,
        disabled: !widget.state['interpolateLocations'],
        onchange: function() {
          try {
            this.classList.remove('ui-state-error');
            widget.state['interpolatableX'] = this.value.split(',').map(
                function(s) {
                  s = s.trim();
                  if (s.length === 0) {
                    return s;
                  }
                  var val = parseInt(s, 10);
                  if (isNaN(val)) {
                    throw new CATMAID.ValueError("No number: " + s.trim());
                  }
                  return val;
                });
          } catch(e) {
            this.classList.add('ui-state-error');
          }
        }
      },
      {
        type: 'text',
        label: 'Y',
        length: 5,
        value: widget.state['interpolatableY'].join(", "),
        title: 'Nodes at these Y project coordinates will be interpolated.',
        id: 'catmaid-sampler-interpolate-y-' + widget.widgetID,
        disabled: !widget.state['interpolateLocations'],
        onchange: function() {
          try {
            this.classList.remove('ui-state-error');
            widget.state['interpolatableY'] = this.value.split(',').map(
                function(s) {
                  s = s.trim();
                  if (s.length === 0) {
                    return s;
                  }
                  var val = parseInt(s, 10);
                  if (isNaN(val)) {
                    throw new CATMAID.ValueError("No number: " + s.trim());
                  }
                  return val;
                });
          } catch(e) {
            this.classList.add('ui-state-error');
          }
        }
      },
      {
        type: 'text',
        label: 'Z',
        length: 5,
        value: widget.state['interpolatableZ'].join(", "),
        title: 'Sections at these Z project coordinates in an XY view will be interpolated',
        id: 'catmaid-sampler-interpolate-z-' + widget.widgetID,
        disabled: !widget.state['interpolateLocations'],
        onchange: function() {
          try {
            this.classList.remove('ui-state-error');
            widget.state['interpolatableZ'] = this.value.split(',').map(
                function(s) {
                  s = s.trim();
                  if (s.length === 0) {
                    return s;
                  }
                  var val = parseInt(s, 10);
                  if (isNaN(val)) {
                    throw new CATMAID.ValueError("No number: " + s.trim());
                  }
                  return val;
                });
          } catch(e) {
            this.classList.add('ui-state-error');
          }
        }
      },
      {
        id: widget.idPrefix + '-leaf-handling',
        type: 'select',
        label: 'Leaf handling',
        title: 'Select how leaf segments should be handled',
        value: widget.state['leafHandling'],
        entries: [{
          title: 'Ignore leaf segment',
          value: 'ignore'
        }, {
          title: 'Merge into last or create',
          value: 'merge-or-create'
        }, {
          title: 'Merge into last segment',
          value: 'merge'
        }, {
          title: 'Create shorter interval',
          value: 'short-interval'
        }],
        onchange: function() {
          widget.state['leafHandling'] = this.value;
          mocMergeLimitInput.disabled = this.value !== 'merge-or-create' &&
              this.value !== 'merge';
        }
      },
      {
        type: 'child',
        element: mocMergeLimit
      },
      {
        type: 'button',
        label: 'Preview intervals',
        onclick: function() {
          self.previewIntervals(widget);
        }
      },
      {
        type: 'button',
        label: 'Create sampler for active skeleton',
        onclick: function() {
          self.createNewSampler(widget);
        }
      }
    ];
  };

  var deleteSampler = function(samplerId) {
    if (confirm("Do you really want to delete sampler " + samplerId +
        " and all associated domains and intervals")) {
      return CATMAID.fetch(project.id + "/samplers/" + samplerId + "/delete", "POST")
        .then(function(response) {
          CATMAID.msg("Success", "Deleted sampler " + response.deleted_sampler_id +
              " including " + response.deleted_interval_nodes + " unneeded nodes.");
        })
        .catch(CATMAID.handleError);
    }
    return Promise.reject(new CATMAID.Warning("Canceled by user"));
  };

  BackboneWorkflowStep.prototype.updateContent = function(content, widget) {
    var self = this;

    var skeletonId = widget.state['skeletonId'];
    var samplerId = widget.state['samplerId'];
    var p = content.appendChild(document.createElement('p'));
    if (skeletonId) {
      var name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
      p.appendChild(document.createTextNode("The currently selected backbone skeleton is: "));
      var a = p.appendChild(document.createElement('a'));
      a.appendChild(document.createTextNode(name));
      a.href = '#';
      a.onclick = function() {
        CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
      };
    } else if (samplerId) {
      var name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
      p.appendChild(document.createTextNode("The currently selected sampler is: " +
          samplerId + ". Either continue or select a different one."));
    } else {
      p.appendChild(document.createTextNode('No backbone skeleton or sampler selected. ' +
          'Below you will find a list of all available samplers.'));
    }

    // Create a data table with all available samplers or a filtered set
    var table = document.createElement('table');
    content.appendChild(table);

    var datatable = $(table).DataTable({
      dom: "lrfhtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        var params = {};
        if (skeletonId) {
          params['skeleton_ids'] = [skeletonId];
        }
        CATMAID.fetch(project.id +  "/samplers/", "GET", params)
          .then(function(result) {
            var skeletonIds = new Set();
            result.forEach(function(sampler) {
              this.add(sampler.skeleton_id);
            }, skeletonIds);
            var models = {};
            skeletonIds.forEach(function(skid) {
              this[skid] = new CATMAID.SkeletonModel(skid);
            }, models);

            var prepare = self.ensureStateInfo();

            CATMAID.NeuronNameService.getInstance().registerAll(widget, models,
                function() {
                  prepare
                    .then(callback.bind(window, {
                      draw: data.draw,
                      data: result
                    }))
                    .catch(CATMAID.handleError);
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
          class: "cm-center",
          render: function(data, type, row, meta) {
            return row.id;
          }
        },
        {
          data: "skeleton_id",
          title: "Skeleton",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            var skeletonId = row.skeleton_id;
            var name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
            if ("display") {
              return '<a href="#" data-action="select-skeleton" data-skeleton-id="' +
                  skeletonId + '" >' + name + '</a>';
            } else {
              return name;
            }
          }
        },
        {
          data: "user_id",
          title: "User",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "creation_time",
          title: "Created on (UTC)",
          searchable: true,
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.creation_time * 1000));
          }
        },
        {
          data: "edition_time",
          title: "Last edited on (UTC)",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.edition_time * 1000));
          }
        },
        {data: "interval_length", title: "Interval length", orderable: true, class: 'cm-center'},
        {data: "interval_error", title: "Max error", orderable: true, class: 'cm-center'},
        {data: "leaf_segment_handling", title: "Leaf handling", orderable: true, class: 'cm-center'},
        {
          data: "merge_limit",
          title: "Merge limit",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if (row.leaf_segment_handling === 'merge-or-create' ||
                row.leaf_segment_handling === 'merge') {
              return Number(row.merge_limit).toFixed(2);
            } else {
              return '-';
            }
          }
        },
        {
          data: "create_interval_boundaries",
          title: "Create interval boundaries",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if (type === 'display') {
              return row.create_interval_boundaries ? "Yes" : "No";
            } else {
              return row.create_interval_boundaries;
            }
          }
        },
        {
          data: "review_required",
          title: "Review required",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if (type === 'display') {
              return row.review_required ? "Yes" : "No";
            } else {
              return row.review_required;
            }
          }
        },
        {
          data: "state",
          title: "State",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            var state = self.possibleStates[row.state_id];
            return state ? state.name : ("unknown (" + row.state_id + ")");
          }
        },
        {
          title: "Action",
          orderable: false,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return '<a href="#" data-action="next">Open</a> <a href="#" data-sampler-id="' +
                row.id + '" data-action="delete">Delete</a>';
          }
        }
      ],
    }).on('dblclick', 'tr', function(e) {
      var data = datatable.row(this).data();
      if (data) {
        var table = $(this).closest('table');
        var tr = $(this).closest('tr');
        var data =  $(table).DataTable().row(tr).data();
        widget.setFromSampler(data);
        widget.workflow.advance();
        widget.update();
      }
    }).on('click', 'a[data-action=select-skeleton]', function() {
      var skeletonId = parseInt(this.dataset.skeletonId, 10);
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
    }).on('click', 'a[data-action=delete]', function() {
      var samplerId = parseInt(this.dataset.samplerId, 10);
      deleteSampler(samplerId)
          .then(function() {
            widget.state['samplerId'] = undefined;
            datatable.ajax.reload();
            CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED, skeletonId);
            project.getStackViewers().forEach(function(sv) {
              sv.redraw();
            });
          })
          .catch(CATMAID.handleError);
    }).on('click', 'a[data-action=next]', function() {
      var table = $(this).closest('table');
      var tr = $(this).closest('tr');
      var data =  $(table).DataTable().row(tr).data();
      widget.setFromSampler(data);
      widget.workflow.advance();
      widget.update();
    });
  };

  /**
   * Show a 3D confirmation dialog that will show the current interval setting
   * applied to the active neuron (if any).
   */
  BackboneWorkflowStep.prototype.previewIntervals = function(widget) {
    var skeletonId = widget.state['skeletonId'];
    if (!skeletonId) {
      CATMAID.warn("Please select a skeleton first");
      return;
    }
    var intervalLength = widget.state['intervalLength'];
    if (!intervalLength) {
      CATMAID.warn("No valid interval length found");
      return;
    }
    var intervalError = widget.state['intervalError'];
    if (!intervalError) {
      CATMAID.warn("No valid interval error value found");
      return;
    }
    var createIntervalBoundingNodes = !!widget.state['createIntervalBoundingNodes'];
    var binaryIntervalColors = !!widget.state['binaryIntervalColors'];
    var colorMethod = binaryIntervalColors ? "binary-sampler-intervals" :
        "multicolor-sampler-intervals";

    var interpolateSections = widget.state['interpolateLocations'];
    if (interpolateSections === undefined) {
      CATMAID.warn("Can't create domain without section interpolation information");
      return;
    }
    var interpolatableX = widget.state['interpolatableX'];
    if (!interpolatableX) {
      CATMAID.warn("No valid X interpolatable list found");
      return;
    }
    var interpolatableY = widget.state['interpolatableY'];
    if (!interpolatableX) {
      CATMAID.warn("No valid Y interpolatable list found");
      return;
    }
    var interpolatableZ = widget.state['interpolatableZ'];
    if (!interpolatableX) {
      CATMAID.warn("No valid Z interpolatable list found");
      return;
    }
    var leafHandling = widget.state['leafHandling'];
    if (!leafHandling) {
      CATMAID.warn("No valid leaf handling option found");
      return;
    }
    var mergeLimit = widget.state['mergeLimit'];
    if (!mergeLimit && mergeLimit !== 0.0) {
      CATMAID.warn("No valid merge limit option found");
      return;
    }

    var arbor = widget.state['arbor'];
    // Get arbor if not already cached
    var prepare;
    if (arbor) {
      prepare = Promise.resolve();
    } else {
      prepare = CATMAID.Sampling.getArbor(skeletonId)
        .then(function(result) {
          arbor = result;
          widget.state['arbor'] = result;
        });
    }

    prepare
      .then(function() {
        return new Promise(function(resolve, reject) {
          // Create a fake sampler with a fake domain that covers the whole
          // skeleton.
          var fakeDomain = {
            start_node_id: parseInt(arbor.arbor.root),
            ends: arbor.arbor.findEndNodes().map(function(nodeId) {
              return {
                id: null,
                node_id: parseInt(nodeId, 10)
              };
            }),
            intervals: []
          };
          var fakeSampler = {
            id: null,
            edition_time: null,
            creation_time: null,
            review_required: null,
            state_id: null,
            user_id: null,
            skeleton_id: skeletonId,
            interval_length: intervalLength,
            interval_error: intervalError,
            leaf_segment_handling: leafHandling,
            merge_limit: mergeLimit,
            domains: [fakeDomain]
          };
          let preferSmallerError = true;
          let workParser = new CATMAID.ArborParser();
          workParser.arbor = arbor.arbor.clone();
          workParser.positions = Object.assign({}, arbor.positions);

          // Interpolate positions
          let interpolatedNodes;
          if (interpolateSections) {
            interpolatedNodes = workParser.arbor.interpolatePositions(
                workParser.positions, interpolatableX, interpolatableY,
                interpolatableZ);
          }

          let intervalConfiguration = CATMAID.Sampling.intervalsFromModels(
            workParser.arbor, workParser.positions, fakeDomain, intervalLength,
            intervalError, preferSmallerError, createIntervalBoundingNodes,
            leafHandling, true, undefined, undefined, mergeLimit);
          let intervals = intervalConfiguration.intervals;

          // Show 3D viewer confirmation dialog
          var dialog = new CATMAID.Confirmation3dDialog({
            title: intervals.length + " intervals with a length of " +
                intervalLength + "nm each, " + intervalConfiguration.addedNodes.length +
                " new nodes are created to match intervals",
            showControlPanel: false,
            buttons: {
              "Close": function() {
                dialog.close();
              }
            },
            colorMethod: colorMethod,
            shadingMethod: 'sampler-domain',
            extraControls: [
              {
                type: 'checkbox',
                label: 'Binary colors',
                value: binaryIntervalColors,
                onclick: function() {
                  widget.state['binaryIntervalColors'] = this.checked;
                  if (glWidget) {
                    colorMethod = this.checked ?
                        'binary-sampler-intervals' : 'multicolor-sampler-intervals';
                    glWidget.options.color_method = colorMethod;
                    glWidget.updateSkeletonColors()
                      .then(glWidget.render.bind(glWidget));
                  }
                }
              }
            ]
          });
          dialog.show();

          // At the moment the 3D viewer is only accessible after display
          var glWidget = dialog.webglapp;
          var models = {};
          models[skeletonId] = new CATMAID.SkeletonModel(skeletonId);

          // Create virtual skeletons
          let arborParsers = new Map([[skeletonId, workParser]]);
          let nodeProvider = new CATMAID.ArborParserNodeProvider(arborParsers);

          // Add skeleton to 3D viewer and configure shading
          glWidget.addSkeletons(models, function() {
            // Add sampling information to skeleton
            let skeleton = glWidget.space.content.skeletons[skeletonId];
            if (!skeleton) {
              throw new CATMAID.ValueError('Couldn\'t find skeleton ' +
                  skeletonId + ' in 3D viewer');
            }
            // Set sampler on skeleton so that shading method doesn't try to
            // pull sampler data from back-end.
            skeleton.setSamplers([fakeSampler]);

            // Set new shading and coloring methods
            glWidget.options.color_method = colorMethod;
            glWidget.options.shading_method = 'none';
            glWidget.options.interpolate_vertex_colots = false;

            // Look at center of mass of skeleton and update screen
            glWidget.lookAtSkeleton(skeletonId);

            return glWidget.updateSkeletonColors()
              .then(function() { glWidget.render(); });
          }, nodeProvider);
        });
      })
      .catch(CATMAID.handleError);
  };

  BackboneWorkflowStep.prototype.createNewSampler = function(widget) {
    var skeletonId = widget.state['skeletonId'];
    if (!skeletonId) {
      CATMAID.warn("Can't create sampler without active backbone skeleton");
      return;
    }
    var intervalLength = widget.state['intervalLength'];
    if (!intervalLength) {
      CATMAID.warn("Can't create sampler without interval length");
      return;
    }
    var intervalError = widget.state['intervalError'];
    if (!intervalError) {
      CATMAID.warn("Can't create sampler without interval error value");
      return;
    }
    var reviewRequired = widget.state['reviewRequired'];
    if (undefined === reviewRequired) {
      CATMAID.warn("Can't create sampler without review policy");
      return;
    }
    var createIntervalBoundingNodes = !!widget.state['createIntervalBoundingNodes'];
    if (undefined === createIntervalBoundingNodes) {
      CATMAID.warn("Can't create sampler without createIntervalBoundingNodes parameter");
      return;
    }
    var leafHandling = widget.state['leafHandling'];
    if (undefined === leafHandling) {
      CATMAID.warn("Can't create sampler without leafHandling parameter");
      return;
    }
    var mergeLimit = widget.state['mergeLimit'];
    if (undefined === mergeLimit) {
      CATMAID.warn("Can't create sampler without mergeLimit parameter");
      return;
    }
    CATMAID.fetch(project.id + '/samplers/add', 'POST', {
      skeleton_id: skeletonId,
      interval_length: intervalLength,
      interval_error: intervalError,
      create_interval_boundaries: createIntervalBoundingNodes,
      review_required: reviewRequired,
      leaf_segment_handling: leafHandling,
      merge_limit: mergeLimit,
    }).then(function(result) {
      // TODO: Should probably go to next step immediately
      widget.update();
    }).catch(CATMAID.handleError);
  };

  BackboneWorkflowStep.prototype.ensureStateInfo = function() {
    if (this.possibleStates) {
      return Promise.resolve();
    } else {
      var self = this;
      return CATMAID.fetch(project.id + '/samplers/states/')
        .then(function(result) {
          self.possibleStates = result.reduce(function(o, sst) {
            o[sst.id] = sst;
            return o;
          }, {});
        });
    }
  };


  /**
   *  Select or create domains for a sampler. If domains are created, start
   *  nodes have to be closer to an arbor's root than the end nodes.
   */
  var DomainWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Domain");

    // Maps domain type IDs to domain type objects
    this.possibleTypes = null;
    // All available domains for the current sampler
    this.availableDomains = [];
  };

  DomainWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  DomainWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  DomainWorkflowStep.prototype.activate = function(state) {
    state['arbor'] = undefined;
  };

  DomainWorkflowStep.prototype.isComplete = function(state) {
    return undefined !== state['domain'];
  };

  DomainWorkflowStep.prototype.createControls = function(widget) {
    var self = this;

    var leafHandling = widget.state['leafHandling'];
    if (!leafHandling) {
      throw new CATMAID.ValueError('No valid leaf handling option found');
    }

    return [
      {
        type: 'button',
        label: 'Set "short-interval" leaf mode',
        disabled: leafHandling !== 'ignore',
        id: widget.idPrefix + '-set-short-interval',
        title: 'If the current leaf segment handling mode is "ignore", it is ' +
            'possible to upgrade to "short-interval" to create new intervals for ' +
            'ignored fragments.',
        onclick: function() {
          self.updateLeafHandlingMode(widget, 'short-interval');
        },
      },
      {
        type: 'select',
        label: 'Domain start',
        title: 'Select start node type of new domain',
        value: widget.state['domainStartNodeType'],
        entries: [{
          title: 'Root node',
          value: 'root'
        }, {
          title: 'Tagged node',
          value: 'tag'
        }, {
          title: 'Active node',
          value: 'active'
        }, {
          title: 'Select node',
          value: 'select'
        }],
        onchange: function() {
          widget.state['domainStartNodeType'] = this.value;
        }
      },
      {
        type: 'select',
        label: 'Domain end',
        title: 'Select end node type of new domain',
        value: widget.state['domainEndNodeType'],
        entries: [{
          title: 'Tagged node',
          value: 'tag'
        }, {
          title: 'Active node',
          value: 'active'
        }, {
          title: 'Select node',
          value: 'select'
        }, {
          title: 'All downstream nodes',
          value: 'downstream'
        }],
        onchange: function() {
          widget.state['domainEndNodeType'] = this.value;
        }
      },
      {
        type: 'select',
        label: 'Domain type',
        title: 'Select a domain type',
        value: widget.state['domainType'],
        entries: [{
          title: 'Regular',
          value: 'regular'
        }],
        onchange: function() {
          widget.state['domainType'] = this.value;
        }
      },
      {
        type: 'button',
        label: 'Create domain(s)',
        onclick: function() {
          self.createNewDomain(widget);
        }
      }
    ];
  };

  DomainWorkflowStep.prototype.updateContent = function(content, widget) {
    var self = this;
    var skeletonId = widget.state['skeletonId'];
    var samplerId = widget.state['samplerId'];
    var leafHandling = widget.state['leafHandling'];

    var setShortIntervalButton = document.getElementById(widget.idPrefix + '-set-short-interval');
    if (setShortIntervalButton) {
      setShortIntervalButton.disabled = leafHandling !== 'ignore';
    }

    var p = content.appendChild(document.createElement('p'));
    p.appendChild(document.createTextNode('Define one or more domains that should be sampled on neuron '));
    var name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
    var a = p.appendChild(document.createElement('a'));
    a.appendChild(document.createTextNode(name));
    a.href = '#';
    a.onclick = function() {
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
    };
    p.appendChild(document.createTextNode(' and linked to sampler #' + samplerId + '. '));
    p.appendChild(document.createTextNode('Existing domains are listed below'));

    // Create a data table with all available domains for the selected sampler
    var table = document.createElement('table');
    content.appendChild(table);

    var domainLengths = new Map();

    var datatable = $(table).DataTable({
      dom: "lrfhtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        CATMAID.fetch(project.id +  "/samplers/" + samplerId + "/domains/", "GET")
          .then(function(result) {
            self.availableDomains = result;
            return self.ensureMetadata()
              .then(function() {
                if (!widget.state['arbor']) {
                  return CATMAID.Sampling.getArbor(skeletonId)
                    .then(function(result) {
                      widget.state['arbor'] = result;
                    });
                }
              })
              .then(callback.bind(window, {
                draw: data.draw,
                data: result
              }));
          })
          .catch(CATMAID.handleError);
      },
      order: [],
      columns: [
        {
          data: "id",
          title: "Id",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return row.id;
          }
        },
        {
          data: "start_node_id",
          title: "Start",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if ("display") {
              return '<a href="#" data-action="select-node" data-node-id="' +
                  row.start_node_id + '" >' + row.start_node_id + '</a>';
            } else {
              return row.start_node_id;
            }
          }
        },
        {
          title: "Cable length (nm)",
          orderable: true,
          class: "cm-center",
          type: "num",
          render: function(data, type, row, meta) {
            // Create arbor for domain and measure cable length
            let arbor = widget.state['arbor'];
            let domainArbor = CATMAID.Sampling.domainArbor(arbor.arbor, row.start_node_id,
                row.ends.map(function(end) { return end.node_id; }));
            let l = Math.round(domainArbor.cableLength(arbor.positions));
            domainLengths.set(row.id, l);
            return l < 1 ? '< 1' : l;
          }
        },
        {
          data: "user_id",
          title: "User",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "creation_time",
          title: "Created on (UTC)",
          searchable: true,
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.creation_time * 1000));
          }
        },
        {
          data: "edition_time",
          title: "Last edited on (UTC)",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.edition_time * 1000));
          }
        },
        {
          data: "type",
          title: " Type",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            var type = self.possibleTypes[row.type_id];
            return type ? type.name : ("unknown (" + row.type_id + ")");
          }
        },
        {
          data: "parent_interval_id",
          title: " Parent interval",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if (row.parent_interval_id) {
              return row.parent_interval_id;
            } else {
              return "-";
            }
          }
        },
        {
          title: "Action",
          orderable: false,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return '<a href="#" data-action="next">Open</a>';
          }
        }
      ],
    }).on('dblclick', 'tr', function(e) {
      var data = datatable.row(this).data();
      if (data) {
        var table = $(this).closest('table');
        var tr = $(this).closest('tr');
        var data =  $(table).DataTable().row(tr).data();

        widget.state['domain'] = data;
        widget.state['domainLength'] = domainLengths.get(data.id);
        widget.workflow.advance();
        widget.update();
      }
    }).on('click', 'a[data-action=select-node]', function() {
      var nodeId = parseInt(this.dataset.nodeId, 10);
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    }).on('click', 'a[data-action=next]', function() {
      var table = $(this).closest('table');
      var tr = $(this).closest('tr');
      var data =  $(table).DataTable().row(tr).data();
      widget.state['domain'] = data;
      widget.state['domainLength'] = domainLengths.get(data.id);
      widget.workflow.advance();
      widget.update();
    });
  };

  DomainWorkflowStep.prototype.ensureMetadata = function() {
    if (this.possibleTypes) {
      return Promise.resolve();
    } else {
      var self = this;
      return CATMAID.fetch(project.id + '/samplers/domains/types/')
        .then(function(result) {
          self.possibleTypes = result.reduce(function(o, dt) {
            o[dt.id] = dt;
            return o;
          }, {});
        });
    }
  };

  DomainWorkflowStep.prototype.getTypeId = function(typeName) {
    for (var tid in this.possibleTypes) {
      var type = this.possibleTypes[tid];
      if (type.name === typeName) {
        return tid;
      }
    }

    return null;
  };

  DomainWorkflowStep.prototype.createNewDomain = function(widget) {
    var skeletonId = widget.state['skeletonId'];
    if (!skeletonId) {
      CATMAID.warn("Can't create domain without skeleton ID");
      return;
    }
    var samplerId = widget.state['samplerId'];
    if (!samplerId) {
      CATMAID.warn("Can't create domain without sampler");
      return;
    }
    var domainStartNodeType = widget.state['domainStartNodeType'];
    if (!domainStartNodeType) {
      CATMAID.warn("Can't create domain without start node type");
      return;
    }
    var domainEndNodeType = widget.state['domainEndNodeType'];
    if (!domainEndNodeType) {
      CATMAID.warn("Can't create domain without end node type");
      return;
    }
    var domainType = widget.state['domainType'];
    if (!domainType) {
      CATMAID.warn("Can't create domain without domain type");
      return;
    }
    var interpolateSections = widget.state['interpolateLocations'];
    if (interpolateSections === undefined) {
      CATMAID.warn("Can't create domain without section interpolation information");
      return;
    }

    var domainFactory = CATMAID.Sampling.DomainFactories[domainType];
    if (!domainFactory) {
      CATMAID.warn("Domain type unsupported: " + domainType);
      return;
    }

    var options = {
      domainType: domainType,
      domainStartNodeType: domainStartNodeType,
      domainEndNodeType: domainEndNodeType,
    };

    var getRootNode = CATMAID.Skeletons.getRootNode(project.id, skeletonId);

    var self = this;
    this.ensureMetadata()
      .then(function() {
        var domainTypeId = self.getTypeId(domainType);
        if (!domainTypeId) {
          throw new CATMAID.ValueError("Can't find domain type ID for name: " + domainType);
        }
        return Promise.all([domainTypeId, domainFactory.makeDomains(skeletonId, options), getRootNode]);
      })
      .then(function(results) {
        var domainTypeId = results[0];
        var domains = results[1].domains;
        var cache = results[1].cache;
        var rootNode = results[2];

        if (cache) {
          // This allows to cache e.g. Arbor instances and other potentially
          // expensive information.
          for (var key in cache) {
            widget.state[key] = cache[key];
          }
        }

        return new Promise(function(resolve, reject) {
          // Show 3D viewer confirmation dialog
          var dialog = new CATMAID.Confirmation3dDialog({
            title: "Please confirm " + domains.length + " sampler domain(s)",
            showControlPanel: false,
            lookAt: [rootNode.x, rootNode.y, rootNode.z],
            shadingMethod: 'sampler-domains',
            interpolateSections: interpolateSections
          });

          // Create domains if OK is pressed
          dialog.onOK = function() {
            createDomains(samplerId, domainTypeId, domains)
              .then(function(result) {
                CATMAID.msg("Success", domains.length + " domain(s) created");
                resolve(result);
              })
              .catch(reject);
          };
          dialog.onCancel = function() {
            CATMAID.msg("No domains created", "Canceled by user");
          };

          dialog.show();

          // At the moment the 3D viewer is only accessible after display
          var widget = dialog.webglapp;
          var models = {};
          models[skeletonId] = new CATMAID.SkeletonModel(skeletonId);
          widget.addSkeletons(models, function() {

            var makeEndNode = function(nodeId) {
              return {
                id: null,
                node_id: parseInt(nodeId, 10)
              };
            };

            // The defined domains are not yet available from the back-end,
            // prepopulate the skeleton's sampler property with fake data that
            // showing the domains to be created.
            var skeletons = widget.space.content.skeletons;
            var fakeDomainId = 0;
            var previewDomains = domains.map(function(d) {
              return {
                ends : d.endNodeIds.map(makeEndNode),
                id: fakeDomainId++, // use fake ID, needed for different colors
                start_node_id: d.startNodeId, // needed
                // parent_interval: null,
                // project_id: project.id,
                // sampler_id: null,
              };
            });
            for (var skeletonId in skeletons) {
              var skeleton = skeletons[skeletonId];
              skeleton.setSamplers([{
                id: null,
                domains: previewDomains,
                // creation_time,
                // edition_time,
                // interval_length,
                // skeleton_id,
                // state_id,
                // user_id
              }]);
            }

            // Set new shading and coloring methods
            widget.options.color_method = 'sampler-domains';
            widget.options.shading_method = 'none';
            widget.options.interpolate_vertex_colots = false;
            widget.updateSkeletonColors()
              .then(function() { widget.render(); });

            // Look at center of mass of skeleton and update screen
            widget.lookAtSkeleton(skeletonId);
          });
        });
      }).then(function(result) {
        widget.update();
    }).catch(CATMAID.handleError);
  };

  /**
   * Update the leaf handling mode of a sampler to 'short-interval' if it
   * currently is 'ignore'. This will create new intervals for each currently
   * ignored fragment.
   */
  DomainWorkflowStep.prototype.updateLeafHandlingMode = function(widget, leafHandling) {
    let samplerId = widget.state['samplerId'];
    if (!samplerId) {
      throw new CATMAID.ValueError("No sampler loaded");
    }

    CATMAID.Sampling.updateLeafHandlingMode(project.id, samplerId, leafHandling)
      .then(function(sampler) {
        if (sampler) {
          widget.state['leafHandling'] = sampler.leaf_segment_handling;
          widget.update();
        }
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Create all passed in domains for the passed in sampler. Return a promise
   * that resolves once all domains are created.
   */
  function createDomains(samplerId, domainTypeId, domains) {
    var createdDomains = [];
    for (var i=0; i<domains.length; ++i) {
      var domain = domains[i];
      createdDomains.push(CATMAID.fetch(
          project.id + '/samplers/' + samplerId + '/domains/add', 'POST', {
              domain_type_id: domainTypeId,
              start_node_id: domain.startNodeId,
              end_node_ids: domain.endNodeIds
          }));
    }

    return Promise.all(createdDomains);
  }


  /**
   * Pick interval at random. Annotate all synapses and twig branch points on
   * interval. Create seed nodes for all input synapses. Only create one or a
   * few seed nodes for each input synapse.
   */
  var IntervalWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Interval");

    // Maps interval state IDs to interval state objects
    this.possibleStates = null;
    // All available domains for the current domain
    this.availableIntervals = [];
    // Ignore completed intervals for random selection
    this.ignoreCompleted = true;
  };

  IntervalWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  IntervalWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  IntervalWorkflowStep.prototype.activate = function(state) {

  };

  IntervalWorkflowStep.prototype.createControls = function(widget) {
    var self = this;
    return [{
      type: 'checkbox',
      label: 'Ignore completed',
      title: 'Whether to include completed intervals in random selection',
      value: this.ignoreCompleted,
      onclick: function() {
        self.ignoreCompleted = this.checked;
      }
    }, {
      type: 'button',
      label: 'Create intervals',
      title: 'Create a new set of intervals for the current domain',
      onclick: function() {
        self.createNewIntervals(widget);
      }
    }, {
      type: 'button',
      label: 'Uncovered domain parts',
      title: 'Show information on domain parts that are not covered by intervals.',
      onclick: function() {
        self.showUncoveredDomainInfo(widget);
      }
    }, {
      type: 'button',
      label: 'Pick random interval',
      onclick: function() {
        self.pickRandomInterval(widget);
      }
    }];
  };

  IntervalWorkflowStep.prototype.isComplete = function(state) {
    return undefined !== state['interval'];
  };

  IntervalWorkflowStep.prototype.updateContent = function(content, widget) {
    var self = this;
    var intervalLength = widget.state['intervalLength'];
    var samplerId = widget.state['samplerId'];
    var skeletonId = widget.state['skeletonId'];
    var domain = widget.state['domain'];
    var domainLength = widget.state['domainLength'];
    var leafHandling = widget.state['leafHandling'];

    var p = content.appendChild(document.createElement('p'));
    p.appendChild(document.createTextNode('Each domain is sampled by intervals ' +
        'of a certain length, which is defined by the sampler. Intervals are ' +
        'built by walking downstream from the domain start to its end nodes, ' +
        'cutting out intervals that are as close as possible in their length ' +
        'to an ideal length. Except for the start and end node, all children ' +
        'of a node are part of an interval.'));
    var p2 = content.appendChild(document.createElement('p'));
    p2.appendChild(document.createTextNode('To continue either select an ' +
        'interval at random or cotinue a started one. Existing intervals are ' +
        'listed below.'));

    var name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
    var p3 = content.appendChild(document.createElement('p'));
    p3.appendChild(document.createTextNode('Target skeleton: '));
    var a = p3.appendChild(document.createElement('a'));
    a.appendChild(document.createTextNode(name));
    a.href = '#';
    a.onclick = function() {
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
    };
    var completedIntervalCable = '...';
    p3.appendChild(document.createTextNode(', Sampler: #' + samplerId +
        ', Domain: #' + domain.id + ', Interval length: ' + intervalLength +
        'nm, Leaf handling: ' + leafHandling));
    p3.appendChild(document.createElement('br'));
    p3.appendChild(document.createTextNode('Total interval cable: '));
    var totalIntervalSpan = p3.appendChild(document.createElement('span'));
    totalIntervalSpan.setAttribute('data-type', 'total-sum');
    totalIntervalSpan.appendChild(document.createTextNode('...'));
    p3.appendChild(document.createTextNode(' / '));
    var totalRatioSpan = p3.appendChild(document.createElement('span'));
    totalRatioSpan.setAttribute('data-type', 'total-ratio');
    totalRatioSpan.appendChild(document.createTextNode('...'));
    p3.appendChild(document.createTextNode(', Completed interval cable: '));
    var completedIntervalSpan = p3.appendChild(document.createElement('span'));
    completedIntervalSpan.setAttribute('data-type', 'completed-sum');
    completedIntervalSpan.appendChild(document.createTextNode('...'));
    p3.appendChild(document.createTextNode(' / '));
    var completedRatioSpan = p3.appendChild(document.createElement('span'));
    completedRatioSpan.setAttribute('data-type', 'completed-ratio');
    completedRatioSpan.appendChild(document.createTextNode('...'));

    // Create a data table with all available domains or a filtered set
    var table = document.createElement('table');
    content.appendChild(table);

    var cableMap = new Map();

    var datatable = $(table).DataTable({
      dom: "lrfhtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        CATMAID.fetch(project.id +  "/samplers/domains/" + domain.id + "/intervals/", "GET")
          .then(function(result) {
            self.availableIntervals = result;
            widget.state['domainIntervals'] = result;
            return self.ensureMetadata()
              .then(function() {
                if (!widget.state['arbor']) {
                  return CATMAID.Sampling.getArbor(skeletonId)
                    .then(function(result) {
                      widget.state['arbor'] = result;
                    });
                }

                let completedStateId = null;
                for (let stateId in self.possibleStates) {
                  if (self.possibleStates[stateId].name === 'completed') {
                    completedStateId = parseInt(stateId, 10);
                    break;
                  }
                }
                if (completedStateId === null) {
                  CATMAID.warn('Couldn\'t find ID of completed interval state');
                }

                // Update cable length map and find completed sum
                cableMap.clear();
                var completedSum = 0;
                var totalSum = 0;
                for (let i=0; i<result.length; ++i) {
                  let interval = result[i];
                  let arbor = widget.state['arbor'];
                  let intervalLength = arbor.arbor.cableLengthBetweenNodes(arbor.positions,
                    interval.start_node_id, interval.end_node_id, true);
                  cableMap.set(interval.id, intervalLength);
                  totalSum += intervalLength;
                  if (interval.state_id === completedStateId) {
                    completedSum += intervalLength;
                  }
                }

                var totalRatio = 100.0 * totalSum / domainLength;
                var completedRatio = 100.0 * completedSum / domainLength;

                // Update interval length span elements
                $(totalIntervalSpan).empty();
                totalIntervalSpan.appendChild(document.createTextNode(
                    Math.round(totalSum) + 'nm'));
                $(totalRatioSpan).empty();
                totalRatioSpan.appendChild(document.createTextNode(
                    Number(totalRatio).toFixed(2) + '%'));
                $(completedIntervalSpan).empty();
                completedIntervalSpan.appendChild(document.createTextNode(
                    Math.round(completedSum) + 'nm'));
                $(completedRatioSpan).empty();
                completedRatioSpan.appendChild(document.createTextNode(
                    Number(completedRatio).toFixed(2) + '%'));
              })
              .then(callback.bind(window, {
                draw: data.draw,
                data: result
              }));
          })
          .catch(CATMAID.handleError);
      },
      order: [[0, 'asc']],
      columns: [
        {
          data: "id",
          title: "Id",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return row.id;
          }
        },
        {
          data: "start_node_id",
          title: "Start",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if ("display") {
              return '<a href="#" data-action="select-node" data-node-id="' +
                  row.start_node_id + '" >' + row.start_node_id + '</a>';
            } else {
              return row.start_node_id;
            }
          }
        },
        {
          data: "end_node_id",
          title: "End",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if ("display") {
              return '<a href="#" data-action="select-node" data-node-id="' +
                  row.end_node_id + '" >' + row.end_node_id + '</a>';
            } else {
              return row.end_node_id;
            }
          }
        },
        {
          title: "Cable length (nm)",
          orderable: true,
          class: "cm-center",
          type: "num",
          render: function(data, type, row, meta) {
            // Create arbor for domain and measure cable length
            if (cableMap.has(row.id)) {
              let l = Math.round(cableMap.get(row.id));
              return l < 1 ? '< 1' : l;
            } else {
              return '...';
            }
          }
        },
        {
          data: "user_id",
          title: "User",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "creation_time",
          title: "Created on (UTC)",
          searchable: true,
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.creation_time * 1000));
          }
        },
        {
          data: "edition_time",
          title: "Last edited on (UTC)",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.edition_time * 1000));
          }
        },
        {
          data: "state_id",
          title: "State",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            var state = self.possibleStates[row.state_id];
            return state ? state.name : ("unknown (" + row.state_id + ")");
          }
        },
        {
          title: "Action",
          orderable: false,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return '<a href="#" data-action="next">Open</a> <a href="#" data-action="review">Review</a> <a href="#" data-action="reset">Reset</a>';
          }
        }
      ],
    }).on('dblclick', 'tr', function(e) {
      var data = datatable.row(this).data();
      if (data) {
        var table = $(this).closest('table');
        var tr = $(this).closest('tr');
        var data =  $(table).DataTable().row(tr).data();
        self.openInterval(data, widget)
          .catch(CATMAID.handleError);
      }
    }).on('click', 'a[data-action=select-node]', function() {
      var nodeId = parseInt(this.dataset.nodeId, 10);
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    }).on('click', 'a[data-action=next]', function() {
      var table = $(this).closest('table');
      var tr = $(this).closest('tr');
      var data =  $(table).DataTable().row(tr).data();

      self.openInterval(data, widget)
        .catch(CATMAID.handleError);
    }).on('click', 'a[data-action=review]', function() {
      var skeletonId = widget.state['skeletonId'];
      var tr = $(this).closest('tr');
      var data =  $(table).DataTable().row(tr).data();
      return reviewInterval(skeletonId, data);
    }).on('click', 'a[data-action=reset]', function() {
      var table = $(this).closest('table');
      var tr = $(this).closest('tr');
      var data =  $(table).DataTable().row(tr).data();
      self.setIntervalState(data.id, 'untouched', widget);
    });
  };

  var getDomainDetails = function(projectId, domainId) {
    return CATMAID.fetch(projectId + '/samplers/domains/' + domainId + '/details');
  };

  IntervalWorkflowStep.prototype.setIntervalState = function(intervalId, state, widget) {
    let stateId = null;
    Object.keys(this.possibleStates).some(function(s) {
      if (this[s].name === state) {
        stateId = this[s].id;
        return true;
      }
      return false;
    }, this.possibleStates);
    if (stateId === null) {
      throw new CATMAID.ValueError("Could not find 'untouched' state ID");
    }

    return CATMAID.fetch(project.id + '/samplers/domains/intervals/' + intervalId +
        '/set-state', 'POST', {
          'state_id':  stateId
        })
      .then(function(response) {
        CATMAID.msg("Success", "Marked interval " + intervalId + " as " + state);
        if (widget) {
          widget.update();
        }
      })
      .catch(CATMAID.handleError);
  };

  IntervalWorkflowStep.prototype.createNewIntervals = function(widget) {
    var skeletonId = widget.state['skeletonId'];
    if (!skeletonId) {
      CATMAID.warn("Can't create intervals without skeleton ID");
      return;
    }
    var domain = widget.state['domain'];
    if (!domain) {
      CATMAID.warn("Can't create intervals without domain");
      return;
    }
    var intervalLength = widget.state['intervalLength'];
    if (!intervalLength) {
      CATMAID.warn("Can't create intervals without interval length");
      return;
    }
    var intervalError = widget.state['intervalError'];
    if (!intervalError) {
      CATMAID.warn("Can't create intervals without interval error");
      return;
    }
    var createIntervalBoundingNodes = !!widget.state['createIntervalBoundingNodes'];
    var binaryIntervalColors = !!widget.state['binaryIntervalColors'];
    var colorMethod = binaryIntervalColors ? "binary-sampler-intervals" :
        "multicolor-sampler-intervals";

    var interpolateLocations = widget.state['interpolateLocations'];
    if (interpolateLocations === undefined) {
      CATMAID.warn("Not specified whether to interpolate locations");
      return;
    }
    var interpolatableX = widget.state['interpolatableX'];
    if (!interpolatableX) {
      CATMAID.warn("No valid X interpolatable list found");
      return;
    }
    var interpolatableY = widget.state['interpolatableY'];
    if (!interpolatableX) {
      CATMAID.warn("No valid Y interpolatable list found");
      return;
    }
    var interpolatableZ = widget.state['interpolatableZ'];
    if (!interpolatableX) {
      CATMAID.warn("No valid Z interpolatable list found");
      return;
    }
    var leafHandling = widget.state['leafHandling'];
    if (!leafHandling) {
      CATMAID.warn("No valid leaf handling parameter found");
      return;
    }
    var mergeLimit = widget.state['mergeLimit'];
    if (!mergeLimit && mergeLimit !== 0.0) {
      CATMAID.warn("No valid merge limit parameter found");
      return;
    }

    var arbor = widget.state['arbor'];
    // Get arbor if not already cached
    var prepare;
    if (arbor) {
      prepare = Promise.resolve();
    } else {
      prepare = CATMAID.Sampling.getArbor(skeletonId)
          .then(function(result) {
            arbor = result;
            widget.state['arbor'] = result;
          });
    }

    // Allow shortening of intervals to minimize error
    var preferSmallerError = true;
    // Raise error if best matching interval is shorter or longer by a
    // set percentage.
    var maxDiffPercent = 0.1;
    var maxDiff = intervalLength * maxDiffPercent;

    var self = this;

    var domainEnds = [];

    let workParser = new CATMAID.ArborParser();

    // Build interval boundaries by walking downstream from domain start to end.
    // Except for the start and end node, all children of all interval nodes are
    // considered to be part of the interval.
    prepare
      .then(getDomainDetails.bind(this, project.id, domain.id))
      .then(function(domainDetails) {
        workParser.arbor = arbor.arbor.clone();
        workParser.positions = Object.assign({}, arbor.positions);

        // Interpolate positions
        let interpolatedNodes;
        if (interpolateLocations) {
          interpolatedNodes = workParser.arbor.interpolatePositions(
            workParser.positions, interpolatableX, interpolatableY,
            interpolatableZ);
        }
        return CATMAID.Sampling.intervalsFromModels(workParser.arbor,
            workParser.positions, domainDetails, intervalLength,
            intervalError, preferSmallerError,
            createIntervalBoundingNodes, leafHandling, true, false,
            interpolatedNodes, mergeLimit);
      })
      .then(function(intervalConfiguration) {
        return new Promise(function(resolve, reject) {
          let intervals = intervalConfiguration.intervals;
          let addedNodes = intervalConfiguration.addedNodes;

          // Show 3D viewer confirmation dialog
          var dialog = new CATMAID.Confirmation3dDialog({
            title: "Please confirm " + intervals.length +
                " domain interval(s) with an interval length of " +
                intervalLength + "nm each, " + addedNodes.length +
                " new nodes are created to match intervals",
            showControlPanel: false,
            colorMethod: colorMethod,
            shadingMethod: 'sampler-domain',
            extraControls: [
              {
                type: 'checkbox',
                label: 'Binary colors',
                value: binaryIntervalColors,
                onclick: function() {
                  widget.state['binaryIntervalColors'] = this.checked;
                  if (glWidget) {
                    colorMethod = this.checked ?
                        'binary-sampler-intervals' : 'multicolor-sampler-intervals';
                    glWidget.options.color_method = colorMethod;
                    glWidget.updateSkeletonColors()
                      .then(glWidget.render.bind(glWidget));
                  }
                }
              }
            ]
          });

          // Create intervals if OK is pressed
          dialog.onOK = function() {
            CATMAID.fetch(project.id + '/samplers/domains/' +
                domain.id + '/intervals/add-all', 'POST', {
                    intervals: intervals,
                    added_nodes: JSON.stringify(addedNodes)
                })
              .then(function(result) {
                CATMAID.msg("Success", intervals.length + " interval(s) created, using " +
                    result.n_added_nodes + " new node(s)");
                resolve(result.intervals);
              })
              .catch(reject);
          };
          dialog.onCancel = function() {
            CATMAID.msg("No intervals created", "Canceled by user");
          };

          dialog.show();

          // At the moment the 3D viewer is only accessible after display
          var glWidget = dialog.webglapp;
          var models = {};
          models[skeletonId] = new CATMAID.SkeletonModel(skeletonId);

          // Create virtual skeletons
          let arborParsers = new Map([[skeletonId, workParser]]);
          let nodeProvider = new CATMAID.ArborParserNodeProvider(arborParsers);

          let activeDomainId = domain.id;
          glWidget.addSkeletons(models, function() {
            // Set new shading and coloring methods
            glWidget.options.color_method = colorMethod;
            glWidget.options.shading_method = 'sampler-domains';
            glWidget.options.interpolate_vertex_colots = false;

            // Make sure only the active domain is visible fully and other
            // parts of the skeleton only a little.
            glWidget.options.sampler_domain_shading_other_weight = 0.2;
            glWidget.options.allowed_sampler_domain_ids.length = 0;
            glWidget.options.allowed_sampler_domain_ids.push(activeDomainId);

            glWidget.updateSkeletonColors()
              .then(function() { glWidget.render(); });

            // Look at center of mass of skeleton and update screen
            glWidget.lookAtSkeleton(skeletonId);
          }, nodeProvider);
        });
      })
      .then(function(result) {
        widget.update();
        if (result && result.length > 0) {
          CATMAID.Skeletons.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED, skeletonId);
          project.getStackViewers().forEach(function(sv) {
            sv.redraw();
          });
        }
      })
      .catch(CATMAID.handleError);
  };

  IntervalWorkflowStep.prototype.pickRandomInterval = function(widget) {
    // Filter untouched ones
    var intervals = this.availableIntervals || [];
    if (!intervals || 0 === intervals.length) {
      CATMAID.warn("No intervals available");
      return;
    }

    // Ignore intervals that are marked as complete
    if (this.ignoreCompleted) {
      let completedStateId = null;
      let abandonedStateId = null;
      for (var stateId in this.possibleStates) {
        if (this.possibleStates[stateId].name === 'completed') {
          completedStateId = this.possibleStates[stateId].id;
        }
        if (this.possibleStates[stateId].name === 'abandoned') {
          abandonedStateId = this.possibleStates[stateId].id;
        }
      }
      if (completedStateId === null) {
        throw new CATMAID.ValueError("Could not find 'completed' state ID");
      }
      if (abandonedStateId === null) {
        throw new CATMAID.ValueError("Could not find 'abandoned' state ID");
      }
      intervals = intervals.filter(function(interval) {
        return interval.state_id !== completedStateId && interval.state_id !== abandonedStateId;
      });

      if (intervals.length === 0) {
        CATMAID.warn("All intervals are marked completed or abandoned");
        return;
      }
    }

    // For now, use uniform distribution
    var interval = intervals[Math.floor(Math.random()*intervals.length)];
    this.openInterval(interval, widget)
      .catch(CATMAID.handleError);
  };

  IntervalWorkflowStep.prototype.ensureMetadata = function() {
    if (this.possibleStates) {
      return Promise.resolve();
    } else {
      var self = this;
      return CATMAID.fetch(project.id + '/samplers/domains/intervals/states/')
        .then(function(result) {
          self.possibleStates = result.reduce(function(o, is) {
            o[is.id] = is;
            return o;
          }, {});
        });
    }
  };

  IntervalWorkflowStep.prototype.openInterval = function(interval, widget) {
    // Update state
    widget.state['interval'] = interval;
    widget.state['intervalStates'] = this.possibleStates;

    var startedStateId = null;
    for (var stateId in this.possibleStates) {
      if ('started' === this.possibleStates[stateId].name) {
        startedStateId = stateId;
        break;
      }
    }
    if (!startedStateId) {
      return Promise.reject("Missing interval state: started");
    }

    // Open interval, select first node and then advance workflow
    return CATMAID.fetch(project.id + '/samplers/domains/intervals/' + interval.id + '/set-state',
        'POST', {state_id: startedStateId})
      .then(function(result) {
        interval.state_id = result.interval_state_id;
        widget.workflow.advance();
        widget.update();
      });
  };

  /**
   * Compute a historgram on the length of all segments of a skeleton that part
   * of a domain, but not part of an interval. It is assumed that the first
   * interval starts at the domain start node.
   */
  IntervalWorkflowStep.prototype.showUncoveredDomainInfo = function(widget) {
    let domainIntervals = widget.state['domainIntervals'];
    if (!domainIntervals) {
      CATMAID.warn("Please wait until intervals are loaded");
      return;
    }
    let samplerId = widget.state['samplerId'];
    if (!samplerId) {
      throw new CATMAID.ValueError("Need sampler ID");
    }
    let skeletonId = widget.state['skeletonId'];
    if (!skeletonId) {
      throw new CATMAID.ValueError("Need skeleton ID");
    }
    let arbor = widget.state['arbor'];
    if (!arbor) {
      CATMAID.warn("Need arbor");
      return;
    }
    let domain = widget.state['domain'];
    if (domain === undefined) {
      CATMAID.warn("Need domain");
      return;
    }

    let domainListIntervals = domainIntervals.map(function(i) {
      // [intervalId, startNodeId, endNodeId
      return [i.id, i.start_node_id, i.end_node_id];
    });

    let fragmentInfo = CATMAID.Sampling.getIgnoredFragments(project.id,
        samplerId, arbor.arbor, arbor.positions, domain, domainListIntervals);

    // Compute lengths.
    let ignoredFragmentLengths = fragmentInfo.intervalFragments.map(function(fragment) {
      return fragmentInfo.leafFragmentLengths[fragment.start];
    });

    // Show diagram
    let dialog = new CATMAID.OptionsDialog(ignoredFragmentLengths.length +
        ' ignored leaf fragments', {
      'Downstream partners': function() {
        ReconstructionSampler.showPartnerNodes(skeletonId,
            fragmentInfo.ignoredFragmentNodeIds, 'postsynaptic_to');
      },
      'Upstream partners': function() {
        ReconstructionSampler.showPartnerNodes(skeletonId,
            fragmentInfo.ignoredFragmentNodeIds, 'presynaptic_to');
      },
      'Download CSV': function() {
        let today = new Date();
        let filename = 'catmaid-sampler-ignored-intervals-' + today.getFullYear() +
            '-' + (today.getMonth() + 1) + '-' + today.getDate() + '.csv';
        let data = "\"Ignored fragment length (nm)\"\n" + ignoredFragmentLengths.join("\n");
        saveAs(new Blob([data], {type: 'text/plain'}), filename);
      },
      'Ok': function() {
        $(dialog.dialog).dialog("destroy");
      },
    }, true);

    dialog.appendMessage("Histogram of the lengths of " + ignoredFragmentLengths.length +
        " ignored leaf fragments in domain " + domain.id + ". Click on the bins to " +
        "open respective fragment start nodes in a table. The \"partner\" buttons " +
        "at the bottom allow to list partner nodes in ignored leaf fragments.");

    let plot = document.createElement('div');
    dialog.appendChild(plot);

    let resizeDialog = function() {
      Plotly.Plots.resize(plot);
    };

    dialog.show(600, 400, false, undefined, resizeDialog);

    let trace = {
      x: ignoredFragmentLengths,
      type: 'histogram',
    };
    let data = [trace];
    Plotly.newPlot(plot, data, {
      autosize: false,
      width: 500,
      height: 200,
      margin: {
        l: 30,
        r: 20,
        b: 50,
        t: 20,
        pad: 4
      },
      xaxis: {
        title: 'Binned length (nm) of ignored leaf fragments'
      }});

    // Open a table with all treenodes that are part in the respective bin of
    // the histogram.
    plot.on('plotly_click', function(eventData){
      let pts = '';
      let points = eventData.points;
      for(let i=0; i<points.length; i++){
        let a = arbor;
        let dataIndices = points[i].pointIndices;
        if (dataIndices.length > 0) {
          let fragmentStartNodeIds = dataIndices.map(x => intervalFragments[x]);
          openTreenodeTable(skeletonId, fragmentStartNodeIds);
        } else {
          CATMAID.msg("Note", "No data points in selected bin");
        }
      }
    });
  };

  function openTreenodeTable(skeletonId, nodeIds) {
    let treenodeTable = WindowMaker.create('treenode-table').widget;
    // Add a node filter
    for (let i=0; i<nodeIds.length; ++i) {
      treenodeTable.filter_nodeids.add(nodeIds[i]);
    }
    // Disable node type filter
    treenodeTable.setNodeTypeFilter("");
    // Add models
    let models = {};
    models[skeletonId] = new CATMAID.SkeletonModel(skeletonId);
    treenodeTable.append(models);
  }

  /**
   * Open a new connector list widget, showing all partner nodes that are
   * connectored to the passed in node Ids with the respective relation.
   */
  ReconstructionSampler.showPartnerNodes = function(skeletonId, nodeIds, relation) {
    let allowedNodeIds = new Set(nodeIds.map(Number));
    let containsAllowedNode = function(p) {
      return allowedNodeIds.has(p[1]);
    };

    // We query with respect to the focused skeleton ID, i.e. for downstream
    // neurons we are interested in connectors to which this skeleton is
    // presynaptic.
    let queryRelation;
    if (relation === 'presynaptic_to') {
      queryRelation = 'postsynaptic_to';
    } else if (relation === 'postsynaptic_to') {
      queryRelation = 'presynaptic_to';
    } else {
      queryRelation = relation;
    }

    CATMAID.fetch(project.id + '/connectors/', 'POST', {
        'skeleton_ids': [skeletonId],
        'with_tags': 'false',
        'relation_type': queryRelation,
        'with_partners': true,
      })
      .then(function(result) {
        // Only allow links that are connecting to nodes in the passed in list.
        let allowedConnectors = result.connectors.filter(function(c) {
          let partners = result.partners[c[0]];
          return partners.some(containsAllowedNode);
        });
        // Create entries of the following format:
        // [connector_id, x, y, z, skeleton_id, confidence, creator_id,
        // treenode_id, creation_time, edition_time, relation_id]
        let connectorData = allowedConnectors.reduce(function(o, c) {
          let partners = result.partners[c[0]];
          for (let i=0; i<partners.length; ++i) {
            // Partners: link_id, treenode_id, skeleton_id, relation_id,
            // confidence, user_id, creation_time, edition_time
            let p = partners[i];
            // We don't want links to the focused skeletons
            if (p[2] !== skeletonId) {
              o.push([c[0], c[1], c[2], c[3], p[2], p[4], p[5], p[1], p[6], p[7], p[3]]);
            }
          }
          return o;
        }, []);

        return Promise.all([
          connectorData,
          CATMAID.Relations.list(project.id),
        ]);
      })
      .then(function(results) {
        let connectorData = results[0];
        let relationMap = results[1];

        let focusSetRelationId = relationMap[relation];
        let connectorList = CATMAID.ConnectorList.fromRawData(
          connectorData, focusSetRelationId, undefined, [skeletonId]).widget;
      })
      .catch(CATMAID.handleError);
  };

  var reviewInterval = function(skeletonId, interval) {
    var reviewWidget = WindowMaker.create('review-widget').widget;
    var strategy = CATMAID.SkeletonFilterStrategy['sampler-interval'];
    var rule = new CATMAID.SkeletonFilterRule(strategy, {
      'intervalId': interval.id
    });
    reviewWidget.filterRules.push(rule);
    reviewWidget.startSkeletonToReview(skeletonId);
  };

  /**
   * Pick a synapse at random from the traced interval (input, output, or
   * either, depending on the goals).
   */
  var SynapseWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Synapse");
    this.sampleDownstreamConnectors = true;
    this.sampleUpstreamConnectors = true;
    this.connectorData = {};
    this.intervalTreenodes = new Set();
  };

  SynapseWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  SynapseWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  SynapseWorkflowStep.prototype.activate = function(state) {
  };

  SynapseWorkflowStep.prototype.createControls = function(widget) {
    var self = this;
    return [
      {
        type: 'button',
        label: 'Refresh',
        title: "Reload the synapse listing",
        onclick: function() {
          widget.update();
        }
      },
      {
        type: 'button',
        label: 'Review interval',
        title: "Review the selected interval in a new review widget",
        onclick: function() {
          self.reviewCurrentInterval(widget);
        }
      },
      {
        type: 'button',
        label: 'Mark interval complete',
        title: "If all synaptic partners have been explored from an interval, it can be marked as completed.",
        onclick: function() {
          if (confirm("Is this interval reconstructed to completion and are all synaptic partners explored?")) {
            var interval = widget.state['interval'];
            if (!interval) {
              throw new CATMAID.ValueError("No interval found");
            }
            self.setIntervalState(interval.id, 'completed', widget);
          }
        }
      },
      {
        type: 'button',
        label: 'Abandon interval',
        title: "If an interval is abandoned, it won't be completed anymore.",
        onclick: function() {
          if (confirm("Are you sure this interval should be marked as abandoned?")) {
            var interval = widget.state['interval'];
            if (!interval) {
              throw new CATMAID.ValueError("No interval found");
            }
            self.setIntervalState(interval.id, 'abandoned', widget);
          }
        }
      },
      {
        type: 'checkbox',
        label: 'Downstream syanpses',
        title: 'Consider synapses that are post-synaptic to this interval for sampling',
        value: this.sampleDownstreamConnectors,
        onclick: function() {
          self.sampleDownstreamConnectors = this.checked;
        }
      },
      {
        type: 'checkbox',
        label: 'Upstream syanpses',
        title: 'Consider synapses that are pre-synaptic to this interval for sampling',
        value: this.sampleUpstreamConnectors,
        onclick: function() {
          self.sampleUpstreamConnectors = this.checked;
        }
      },
      {
        type: 'button',
        label: 'Pick random synapse',
        title: "Select a random non-abandoned, non-excluded synapse to continue with",
        onclick: function() {
          self.pickRandomSynapse(widget);
        }
      }
    ];
  };

  SynapseWorkflowStep.prototype.setIntervalState = function(intervalId, state, widget) {
    let stateId = null;
    Object.keys(this.possibleIntervalStates).some(function(s) {
      if (this[s].name === state) {
        stateId = this[s].id;
        return true;
      }
      return false;
    }, this.possibleIntervalStates);
    if (stateId === null) {
      throw new CATMAID.ValueError("Could not find '" + state + "' state ID");
    }

    CATMAID.fetch(project.id + '/samplers/domains/intervals/' + intervalId +
        '/set-state', 'POST', {
          'state_id':  stateId
        })
      .then(function(response) {
        CATMAID.msg("Success", "Marked interval " + intervalId + " as " + state);
        if (widget) {
          widget.update();
        }
      })
      .catch(CATMAID.handleError);
  };

  SynapseWorkflowStep.prototype.isComplete = function(state) {
    return state['connectorId'] !== undefined &&
        state['connectorSourceNodeId'] !== undefined;
  };

  SynapseWorkflowStep.prototype.updateContent = function(content, widget) {
    var arbor = widget.state['arbor'];
    if (!arbor) {
      throw new CATMAID.ValueError("Need arbor for synapse workflow step");
    }
    var interval = widget.state['interval'];
    if (!interval) {
      throw new CATMAID.ValueError("Need interval for synapse workflow step");
    }
    var intervalStates = widget.state['intervalStates'];
    if (!intervalStates) {
      throw new CATMAID.ValueError("Need interval states for synapse workflow step");
    }
    var domain = widget.state['domain'];
    if (domain === undefined) {
      CATMAID.warn("Need domain for synapse workflow step");
      return;
    }
    var availableIntervals = widget.state['domainIntervals'];
    if (availableIntervals === undefined) {
      CATMAID.warn("Need intervals available in domain");
      return;
    }
    var otherIntervalBoundaries = availableIntervals.reduce(function(o, testInterval) {
      if (interval.id !== testInterval.id) {
        o.add(testInterval.start_node_id);
        o.add(testInterval.end_node_id);
      }
      return o;
    }, new Set());

    var p = content.appendChild(document.createElement('p'));
    var msg = (widget.state['reviewRequired'] ?
          'Reconstruct interval to completion and have it reviewed. ' :
          'Reconstruct interval to completion. ') +
        'A warning is shown if you select a node outside the interval. ' +
        'Create all upstream and downstream connectors, creating partner ' +
        'seed nodes can be done immediately or deferred to the next step. ' +
        'Once this is done, select a (random) synapse to continue. Below ' +
        'is a list of connectors in this interval.';
    p.appendChild(document.createTextNode(msg));

    var intervalStartNodeId = interval.start_node_id;
    var intervalEndNodeId = interval.end_node_id;
    var p2 = content.appendChild(document.createElement('p'));
    p2.innerHTML = 'Interval start node: <a href="#" data-action="select-node" data-node-id="' + intervalStartNodeId +
        '">' + intervalStartNodeId + '</a> Interval end node: <a href="#" data-action="select-node" data-node-id="' +
        intervalEndNodeId + '">' + intervalEndNodeId + '</a> Interval ID: ' + interval.id + ' Interval state: ' +
        intervalStates[interval.state_id].name;

    $('a', p2).on('click', function() {
      var nodeId = this.dataset.nodeId;
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    });

    // Get review information for interval

    var skeletonId = widget.state['skeletonId'];

    // Create a data table with all available domains or a filtered set
    var downstreamHeader = content.appendChild(document.createElement('h3'));
    downstreamHeader.appendChild(document.createTextNode('Downstream connectors'));
    downstreamHeader.style.clear = 'both';
    var downstreamTable = document.createElement('table');
    content.appendChild(downstreamTable);

    var upstreamHeader = content.appendChild(document.createElement('h3'));
    upstreamHeader.appendChild(document.createTextNode('Upstream connectors'));
    upstreamHeader.style.clear = 'both';
    var upstreamTable = document.createElement('table');
    content.appendChild(upstreamTable);

    var leafHeader = content.appendChild(document.createElement('h3'));
    leafHeader.appendChild(document.createTextNode('Leaf nodes'));
    leafHeader.style.clear = 'both';
    var leafTable = document.createElement('table');
    content.appendChild(leafTable);

    // Get current arbor. Don't use the cached one, because the user is expected
    // to change the arbor in this step.
    var prepare = CATMAID.Sampling.getArbor(skeletonId)
      .then(function(result) {
        widget.state['arbor'] = result;
      });
    // Create up-to-date version of interval nodes
    var self = this;
    Promise.all([prepare, this.ensureMetadata()])
      .then(getDomainDetails.bind(this, project.id, domain.id))
      .then(function(domainDetails) {
        var arborParser = widget.state['arbor'];
        // Regenerate interval information
        self.intervalTreenodes.clear();
        var intervalNodes = CATMAID.Sampling.getIntervalNodes(arborParser.arbor,
            interval.start_node_id, interval.end_node_id, otherIntervalBoundaries);
        self.intervalTreenodes.addAll(intervalNodes);
      })
      .then(function() {
        self.datatables = [
          self.makeConnectorTable(widget, downstreamTable, interval, skeletonId, "presynaptic_to"),
          self.makeConnectorTable(widget, upstreamTable, interval, skeletonId, "postsynaptic_to"),
          self.makeLeafNodeTable(widget, leafTable, arbor.arbor, self.intervalTreenodes, skeletonId),
        ];
      })
      .catch(CATMAID.handleError);
  };

  SynapseWorkflowStep.prototype.makeConnectorTable = function(widget, table, interval, skeletonId, relation) {
    var self = this;
    var intervalId = interval.id;
    var datatable = $(table).DataTable({
      dom: "lrfhtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        Promise.all([
          CATMAID.fetch(project.id + '/connectors/links/', 'POST', {
            'skeleton_ids': [skeletonId],
            'with_tags': 'false',
            'relation_type': relation
          }),
          CATMAID.fetch(project.id + '/samplers/connectors/')
        ])
        .then(function(results) {
          var skeletonConnectors = results[0];
          var samplerConnectors = results[1];

          var connectorData = skeletonConnectors.links.filter(function(l) {
            return self.intervalTreenodes.has(l[7]);
          }).map(function(l) {
            return {
              skeleton_id: l[0],
              id: l[1],
              x: l[2],
              y: l[3],
              z: l[4],
              confidence: l[5],
              user_id: l[6],
              treenode_id: l[7],
              edition_time: l[8],
              type: relation
            };
          });

          // Parse data so that it matches the table
          // Store data in workflow step
          self.connectorData[relation] = connectorData;
          self.samplerConnectors = samplerConnectors.reduce(function(o, c) {
            o[c.connector_id] = c;
            return o;
          }, {});

          callback({
            draw: data.draw,
            data: connectorData
          });
        })
        .catch(CATMAID.handleError);
      },
      order: [],
      columns: [
        {
          data: "id",
          title: "Connector",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if (type === "display") {
              return '<a href="#" data-action="select-node" data-node-id="' +
                  row.id + '">' + row.id + '</a>';
            } else {
              return row.id;
            }
          }
        },
        {
          data: "user_id",
          title: "User",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "edition_time",
          title: "Last edited on (UTC)",
          class: "cm-center",
          orderable: true,
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.edition_time));
          }
        },
        {
          data: "treenode_id",
          title: "Treenode",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if (type === "display") {
              return '<a href="#" data-action="select-node" data-node-id="' +
                  row.treenode_id + '">' + row.treenode_id + '</a>';
            } else {
              return row.treenode_id;
            }
          }
        },
        {
          title: "State",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            var samplerConnector = self.samplerConnectors[row.id];
            if (samplerConnector) {
              var state = self.possibleStates[samplerConnector.state_id];
              return state ? state.name : ("unknown (" + samplerConnector.state_id + ")");
            } else {
              return "untouched";
            }
          }
        },
        {
          title: "Action",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return '<a href="#" data-action="select" data-connector-id="' + row.id +
                '" data-node-id="' + row.treenode_id + '">select</a> ' +
                '<a href="#" data-action="exclude" data-node-id="' + row.id + '">exclude</a> ' +
                '<a href="#" data-action="reset" data-node-id="' + row.id + '">reset</a>';
          }
        }
      ],
      createdRow: function( row, data, dataIndex ) {
        row.setAttribute('data-node-id', data.id);
      },
      drawCallback: function(settings) {
        highlightActiveNode.call(this);
      }
    });

    var setState = function(connectorId, stateName) {
      var stateId;
      for (var sid in self.possibleStates) {
        var state = self.possibleStates[sid];
        if (state && state.name === stateName) {
          stateId = sid;
          break;
        }
      }
      if (stateId === undefined) {
        throw new CATMAID.ValueError("Couldn't find ID of state '" + stateName + "'");
      }

      CATMAID.fetch(project.id + '/samplers/domains/intervals/' + intervalId +
          '/connectors/' + connectorId + '/set-state', 'POST', {
            'state_id':  stateId
          })
        .then(function(response) {
          CATMAID.msg("Connector excluded", "Connector " + connectorId + " is now " + stateName);
          datatable.ajax.reload();
        })
        .catch(CATMAID.handleError);
    };

    datatable.on('click', 'a[data-action=exclude]', function() {
      var connectorId = this.dataset.nodeId;
      setState(connectorId, 'excluded');
    }).on('click', 'a[data-action=reset]', function() {
      var connectorId = this.dataset.nodeId;
      setState(connectorId, 'untouched');
    }).on('click', 'a[data-action=select]', function() {
      widget.state['connectorId'] = parseInt(this.dataset.connectorId, 10);
      widget.state['connectorSourceNodeId'] = parseInt(this.dataset.nodeId, 10);
      widget.workflow.advance();
      widget.update();
    }).on('dblclick', 'tr', function(e) {
      var data = datatable.row(this).data();
      if (data) {
        var table = $(this).closest('table');
        var tr = $(this).closest('tr');
        var data =  $(table).DataTable().row(tr).data();

        widget.state['connectorId'] = parseInt(data.id, 10);
        widget.state['connectorSourceNodeId'] = parseInt(data.treenode_id, 10);
        widget.workflow.advance();
        widget.update();
      }
    });

    datatable.on('click', 'a[data-action=select-node]', function() {
      var nodeId = this.dataset.nodeId;
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    });

    return datatable;
  };

  SynapseWorkflowStep.prototype.makeLeafNodeTable = function(widget, table,
      arbor, intervalNodes, skeletonId) {
    let self = this;
    let datatable = $(table).DataTable({
      dom: "lrfhtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        // Find leaf nodes in interval nodes
        let successors = arbor.allSuccessorsCount();
        let leaves = [];
        for (let nodeId of intervalNodes) {
          if (!successors[nodeId]) {
            leaves.push(nodeId);
          }
        }

        if (!leaves || leaves.length === 0) {
          callback({
            draw: data.draw,
            data: []
          });
          return;
        }

        CATMAID.fetch(project.id + '/treenodes/compact-detail', 'POST', {
          'treenode_ids': leaves,
        })
        .then(function(leafDetail) {
          callback({
            draw: data.draw,
            data: leafDetail
          });
        })
        .catch(CATMAID.handleError);
      },
      order: [[2, 'desc']],
      columns: [
        {
          data: 0,
          title: "Node",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if (type === "display") {
              return '<a href="#" data-action="select-node" data-node-id="' +
                  data + '">' + data + '</a>';
            }
            return data;
          }
        },
        {
          data: 9,
          title: "User",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(data).login;
          }
        },
        {
          data: 8,
          title: "Last edited on (UTC)",
          class: "cm-center",
          orderable: true,
          render: function(data, type, row, meta) {
            return formatDate(new Date(data));
          }
        },
        {
          title: "Action",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return '<a href="#" data-action="select-node">select</a>';
          }
        }
      ],
      createdRow: function( row, data, dataIndex ) {
        row.setAttribute('data-node-id', data[0]);
      },
      drawCallback: function(settings) {
        highlightActiveNode.call(this);
      }
    }).on('click', 'a[data-action=select-node]', function() {
      let row = this.closest('tr');
      let nodeId = parseInt(row.dataset.nodeId, 10);
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    });

    return datatable;
  };

  var highlightActiveNode = function() {
    $('tr', this.table).removeClass('highlight');
    if (SkeletonAnnotations.getActiveNodeType() === SkeletonAnnotations.TYPE_CONNECTORNODE) {
      var activeNodeId = SkeletonAnnotations.getActiveNodeId();
      // Don't try to highlight virtual nodes, they are not shown in the table
      // and don't fit to our selector expression.
      if (SkeletonAnnotations.isRealNode(activeNodeId)) {
        $('tr[data-node-id=' + activeNodeId + ']', this.table).addClass('highlight');
      }
    }
  };

  SynapseWorkflowStep.prototype.highlightActiveNode = function() {
    if (this.datatables && this.datatables.length > 0) {
      for (var i=0; i<this.datatables.length; ++i) {
        highlightActiveNode.call(this.datatables[i]);
      }
    }
  };

  SynapseWorkflowStep.prototype.refreshTables = function() {
    if (this.datatables && this.datatables.length > 0) {
      for (var i=0; i<this.datatables.length; ++i) {
        this.datatables[i].ajax.reload();
      }
    }
  };

  SynapseWorkflowStep.prototype.ensureMetadata = function() {
    let promises = [];
    if (this.possibleStates) {
      promises.push(Promise.resolve());
    } else {
      var self = this;
      promises.push(CATMAID.fetch(project.id + '/samplers/connectors/states/')
        .then(function(result) {
          self.possibleStates = result.reduce(function(o, is) {
            o[is.id] = is;
            return o;
          }, {});
        }));
    }
    if (this.possibleIntervalStates) {
      promises.push(Promise.resolve());
    } else {
      var self = this;
      promises.push(CATMAID.fetch(project.id + '/samplers/domains/intervals/states/')
        .then(function(result) {
          self.possibleIntervalStates = result.reduce(function(o, is) {
            o[is.id] = is;
            return o;
          }, {});
        }));
    }
    return Promise.all(promises);
  };

  SynapseWorkflowStep.prototype.reviewCurrentInterval = function(widget) {
    var skeletonId = widget.state['skeletonId'];
    if (!skeletonId) {
      throw new CATMAID.ValueError("Need skeleton ID for interval review");
    }

    var interval = widget.state['interval'];
    if (!interval) {
      throw new CATMAID.ValueError("Need interval for interval review");
    }

    return reviewInterval(skeletonId, interval);
  };

  SynapseWorkflowStep.prototype.pickRandomSynapse = function(widget) {
    if (!this.connectorData) {
      CATMAID.warn('Couldn\'t find any connectors');
      return;
    }

    // TODO: If review is required, check review first


    // Ignore non-excluded, non-abandoned
    var connectors = [];
    var downstreamConnectors = this.connectorData['presynaptic_to'];
    if (this.sampleDownstreamConnectors && downstreamConnectors) {
      for (var i=0; i<downstreamConnectors.length; ++i) {
        var connector = downstreamConnectors[i];
        var sc = this.samplerConnectors[connector.id];
        // If no SamplerConnector is found, assume the connector is untouched
        // and can be sampled.
        if (sc) {
          let state = this.possibleStates[sc.state_id].name;
          if (state !== "excluded" && state !== "abandoned") {
            connectors.push(connector);
          }
        } else {
          connectors.push(connector);
        }
      }
    }
    var upstreamConnectors = this.connectorData['postsynaptic_to'];
    if (this.sampleUpstreamConnectors && upstreamConnectors) {
      for (var i=0; i<upstreamConnectors.length; ++i) {
        var connector = upstreamConnectors[i];
        var sc = this.samplerConnectors[connector.id];
        // If no SamplerConnector is found, assume the connector is untouched
        // and can be sampled.
        if (sc) {
          let state = this.possibleStates[sc.state_id].name;
          if (state !== "excluded" && state !== "abandoned") {
            connectors.push(connector);
          }
        } else {
          connectors.push(connector);
        }
      }
    }

    if (connectors.length === 0) {
      CATMAID.warn("No valid connectors found");
      return;
    }

    // Select random synapse. For now, use uniform distribution
    var connector = connectors[Math.floor(Math.random()*connectors.length)];

    var startedStateId = null;
    for (var stateId in this.possibleStates) {
      if ('started' === this.possibleStates[stateId].name) {
        startedStateId = stateId;
        break;
      }
    }
    if (!startedStateId) {
      return Promise.reject("Missing connector state: started");
    }

    var interval = widget.state['interval'];
    if (!interval) {
      throw new CATMAID.ValueError("Need interval for synapse workflow step");
    }

    // Open interval, select first node and then advance workflow
    return CATMAID.fetch(project.id + '/samplers/domains/intervals/' +
        interval.id + '/connectors/' + connector.id + '/set-state',
        'POST', {state_id: startedStateId})
      .then(function(result) {
        SkeletonAnnotations.staticMoveToAndSelectNode(connector.id);
        widget.state['connectorId'] = connector.id;
        widget.state['connectorSourceNodeId'] = connector.treenode_id;
        widget.workflow.advance();
        widget.update();
      });
  };

  /**
   * Warn users if they step out of looked at interval.
   */
  SynapseWorkflowStep.prototype.handleActiveNodeChange = function(widget, node) {
    if (this.intervalTreenodes) {
      var numericNodeId = parseInt(node.id, 10);
      if (!this.intervalTreenodes.has(numericNodeId)) {
        var interval = widget.state['interval'];
        var warn = true;
        if (node.type === SkeletonAnnotations.TYPE_CONNECTORNODE) {
          // Refresh on new connectors
          this.refreshTables();
          return;
        } else {
          if (SkeletonAnnotations.isRealNode(node.id)) {
            var numericParentNodeId = parseInt(node.parent_id, 10);
            // Unknown real nodes are outside of interval if they have no parent
            // or if the node's parent is either the start or end node of the
            // interval.
            var isIntervalNode = this.intervalTreenodes.has(numericNodeId);
            var parentIsInnerInervalNode = this.intervalTreenodes.has(numericParentNodeId) &&
                numericParentNodeId != interval.start_node_id && numericParentNodeId != interval.end_node_id;
            var isNewInnerIntervalNode = !isIntervalNode && parentIsInnerInervalNode;
            warn = !node.parent_id || !isNewInnerIntervalNode;
            if (!warn) {
              // Add new in-interval node to set of known nodes.
              if (isNewInnerIntervalNode) {
                this.intervalTreenodes.add(numericNodeId);
              }
            }
          } else {
            // Unknown virtual nodes are outside of interval if both their real
            // child and parent are not part of the interval
            var childId = parseInt(SkeletonAnnotations.getChildOfVirtualNode(node.id), 10);
            var parentId = parseInt(SkeletonAnnotations.getParentOfVirtualNode(node.id), 10);
            warn = !(this.intervalTreenodes.has(childId) && this.intervalTreenodes.has(parentId));
          }
        }

        if (warn) {
          CATMAID.warn("Active node is outside of interval");
        }
      }
      // Test if new node has a parent in
    } else {
      CATMAID.warn("Could not find interval nodes");
    }
    this.highlightActiveNode();
  };

  /**
   * Pick a synaptic partner at random from the selected connector.
   */
  var PartnerWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Partner");
    this.partners = [];
  };

  PartnerWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  PartnerWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  PartnerWorkflowStep.prototype.activate = function(state) { };

  PartnerWorkflowStep.prototype.createControls = function(widget) {
    var self = this;
    return [
      {
        type: 'button',
        label: 'Refresh',
        title: "Reload the partner listing",
        onclick: function() {
          widget.update();
        }
      },
      {
        type: 'button',
        label: 'Mark connector complete',
        title: "If all synaptic partners have been explored from a conncetor, it can be marked as completed.",
        onclick: function() {
          if (confirm("Are all synaptic partners of this connector explored?")) {
            var interval = widget.state['interval'];
            if (!interval) {
              throw new CATMAID.ValueError("Need interval for partner workflow step");
            }
            var connectorId = widget.state['connectorId'];
            if (!connectorId) {
              throw new CATMAID.ValueError("Need connector ID for partner workflow step");
            }
            self.setConnectorState(interval.id, connectorId, 'completed', widget);
          }
        }
      },
      {
        type: 'button',
        label: 'Pick random partner',
        title: "Select a random partner of the selected synapse",
        onclick: function() {
          self.pickRandomPartner(widget);
        }
      }
    ];
  };

  PartnerWorkflowStep.prototype.isComplete = function(state) {
    return !!state['partnerSelected'];
  };

  PartnerWorkflowStep.prototype.updateContent = function(content, widget) {
    var connectorId = widget.state['connectorId'];
    if (!connectorId) {
      throw new CATMAID.ValueError("Need synapse/connector ID for partner workflow step");
    }
    var sourceNodeId = widget.state['connectorSourceNodeId'];
    if (!sourceNodeId) {
      throw new CATMAID.ValueError("Need source node ID for partner workflow step");
    }

    var p = content.appendChild(document.createElement('p'));
    var msg = 'Add all synaptic partners to the selected connector. ' +
        'Once this is done, press the "Pick random partner" button and ' +
        'reconstruct the partner skeleton to identification.';
    p.appendChild(document.createTextNode(msg));

    var p2 = content.appendChild(document.createElement('p'));
    p2.innerHTML = 'Connector node: <a href="#" data-action="select-node" data-node-id="' + connectorId +
        '">' + connectorId + '</a> Source node: <a href="#" data-action="select-node" data-node-id="' +
        sourceNodeId + '">' + sourceNodeId + '</a>';

    $('a', p2).on('click', function() {
      var nodeId = this.dataset.nodeId;
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    });

    // Get review information for interval

    // Create a data table with all available partners
    var partnerHeader = content.appendChild(document.createElement('h3'));
    partnerHeader.appendChild(document.createTextNode('Partners'));
    partnerHeader.style.clear = 'both';
    var partnerTable = document.createElement('table');
    content.appendChild(partnerTable);

    var self = this;

    // Get current partner set. Don't use the cached ones.
    var prepare = CATMAID.Connectors.info(project.id, connectorId)
      .then(function(result) {
        widget.state['connector'] = result;
        self.partners = result.partners.filter(function(p) {
          return p.partner_id != sourceNodeId;
        });
      });
    // Create up-to-date version of interval nodes
    Promise.all([prepare, this.ensureMetadata()])
      .then(function() {
        self.datatables = [
          self.makePartnerTable(widget, partnerTable, widget.state['connector'], sourceNodeId),
        ];
      })
      .catch(CATMAID.handleError);
  };

  PartnerWorkflowStep.prototype.makePartnerTable = function(widget, table, connector, sourceNodeId) {
    var self = this;
    var connectorId = connector.id;
    var connectorPartners = connector.partners;
    var datatable = $(table).DataTable({
      dom: "lrfhtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        callback({
          draw: data.draw,
          data: self.partners
        });
      },
      order: [],
      columns: [
        {
          data: "skeleton_id",
          title: "Skeleton",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if (type === "display") {
              return '<a href="#" data-action="select-skeleton" data-skeleton-id="' +
                  row.skeleton_id + '">' + row.skeleton_id + '</a>';
            } else {
              return row.skeleton_id;
            }
          }
        },
        {
          data: "partner_id",
          title: "Partner node",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            if (type === "display") {
              return '<a href="#" data-action="select-node" data-node-id="' +
                  row.partner_id + '">' + row.partner_id + '</a>';
            } else {
              return row.partner_id;
            }
          }
        },
        {
          data: "relation_name",
          title: "Relation",
          orderable: true,
          class: "cm-center",
          render: function(data, type, row, meta) {
            return row.relation_name;
          }
        }
      ],
      createdRow: function( row, data, dataIndex ) {
        row.setAttribute('data-node-id', data.partner_id);
      },
      drawCallback: function(settings) {
        highlightActiveNode.call(this);
      }
    });

    datatable.on('click', 'a[data-action=select-node]', function() {
      var nodeId = this.dataset.nodeId;
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    });

    return datatable;
  };

  var highlightActivePartnerNode = function() {
    $('tr', this.table).removeClass('highlight');
    if (SkeletonAnnotations.getActiveNodeType() === SkeletonAnnotations.TYPE_NODE) {
      var activeNodeId = SkeletonAnnotations.getActiveNodeId();
      // Don't try to highlight virtual nodes, they are not shown in the table
      // and don't fit to our selector expression.
      if (SkeletonAnnotations.isRealNode(activeNodeId)) {
        $('tr[data-node-id=' + activeNodeId + ']', this.table).addClass('highlight');
      }
    }
  };

  PartnerWorkflowStep.prototype.highlightActiveNode = function() {
    if (this.datatables && this.datatables.length > 0) {
      for (var i=0; i<this.datatables.length; ++i) {
        highlightActivePartnerNode.call(this.datatables[i]);
      }
    }
  };

  PartnerWorkflowStep.prototype.refreshTables = function() {
    if (this.datatables && this.datatables.length > 0) {
      for (var i=0; i<this.datatables.length; ++i) {
        this.datatables[i].ajax.reload();
      }
    }
  };

  PartnerWorkflowStep.prototype.setConnectorState = function(intervalId, connectorId, stateName, widget) {
    var stateId;
    for (var sid in this.possibleStates) {
      var state = this.possibleStates[sid];
      if (state && state.name === stateName) {
        stateId = sid;
        break;
      }
    }
    if (stateId === undefined) {
      throw new CATMAID.ValueError("Couldn't find ID of state '" + stateName + "'");
    }

    CATMAID.fetch(project.id + '/samplers/domains/intervals/' + intervalId +
        '/connectors/' + connectorId + '/set-state', 'POST', {
          'state_id':  stateId
        })
      .then(function(response) {
        CATMAID.msg("Success", "Connector " + connectorId + " is now " + stateName);
        if (widget) {
          widget.update();
        }
      })
      .catch(CATMAID.handleError);
  };

  PartnerWorkflowStep.prototype.ensureMetadata = function() {
    let promises = [];
    if (this.possibleStates) {
      return Promise.resolve();
    } else {
      var self = this;
      return CATMAID.fetch(project.id + '/samplers/connectors/states/')
        .then(function(result) {
          self.possibleStates = result.reduce(function(o, is) {
            o[is.id] = is;
            return o;
          }, {});
        });
    }
  };

  PartnerWorkflowStep.prototype.pickRandomPartner = function(widget) {
    let connector = widget.state['connector'];
    if (!connector) {
      CATMAID.warn('No connector selected');
      return;
    }

    let partners = this.partners;
    if (!partners || partners.length === 0) {
      CATMAID.warn("No partners found");
      return;
    }

    // Select random partners. For now, use uniform distribution
    var partner = partners[Math.floor(Math.random() * partners.length)];
    CATMAID.msg("Success", "Selected node " + partner.partner_id + " in skeleton " +
        partner.skeleton_id);
    SkeletonAnnotations.staticMoveToAndSelectNode(partner.partner_id);
  };

  /**
   * Warn users if they step out of looked at interval.
   */
  PartnerWorkflowStep.prototype.handleActiveNodeChange = function(widget, node) {
    this.highlightActiveNode();
  };


  // Export widget
  CATMAID.ReconstructionSampler = ReconstructionSampler;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Reconstruction Sampler",
    description: "Find strongly connected partners through sampling",
    key: 'reconstruction-sampler',
    creator: ReconstructionSampler
  });

})(CATMAID);
