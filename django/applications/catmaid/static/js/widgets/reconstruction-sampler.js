/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * For large volumes, manual reconstruction of large neurons is very time
   * consuming, even more so whole networks. If one is primarily interested
   * in connectivity, the ReconstructionSampler widget can help to direct
   * reconstruction time more efficiently.
   *
   * Starting from a reconstructed backbone, domains of interest are selected
   * ("sampelr domains"), based on e.g. bounding tags. 
   */
  var ReconstructionSampler = function() {
    this.widgetID = this.registerInstance();
    this.init();

    // Listen to active node change events
    SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
        this.handleActiveNodeChange, this);
  };

  ReconstructionSampler.prototype = new InstanceRegistry();

  ReconstructionSampler.prototype.getName = function() {
    return "Reconstruction Sampler " + this.widgetID;
  };

  ReconstructionSampler.prototype.init = function() {
    this.state = {
      'intervalLength': 5000,
      'domainType': 'regular',
      'domainStartNodeType': 'root',
      'domainEndNodeType': 'downstream',
      'reviewRequired': true
    };
    this.workflow = new CATMAID.Workflow({
      state: this.state,
      step: 0,
      steps: [
        new BackboneWorkflowStep(),
        new DomainWorkflowStep(),
        new IntervalWorkflowStep(),
        new SynapseWorkflowStep()
       ]
    });
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
        'interest are selected on it ("sampelr domains"). This can happen e.g. ',
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

  var formatDate = function(date) {
    return date.getUTCFullYear() + '-' +
        date.getUTCMonth() + '-' +
        date.getUTCDay() + ' ' +
        date.getUTCHours() + ':' +
        date.getUTCMinutes() + ':' +
        date.getUTCSeconds();
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
    return [
      {
        type: 'button',
        label: 'Use current skeleton as active backbone',
        onclick: function() {
          var skeletonId = SkeletonAnnotations.getActiveSkeletonId();
          if (skeletonId) {
            widget.state['skeletonId'] = skeletonId;
            widget.update();
          }
        }
      },
      {
        type: 'numeric',
        label: 'Interval length (nm)',
        title: 'Default length of intervals created in domains of this sampler',
        value: widget.state['intervalLength'],
        length: 6,
        onchange: function() {
          widget.state['intervalLength'] = this.value;
        }
      },
      {
        type: 'checkbox',
        label: 'Review required',
        title: 'Whether domains and intervals can only be completed if they are reviewed completely',
        value: widget.state['reviewRequired'],
        onclick: function() {
          widget.state['reviewRequired'] = this.checked;
        }
      },
      {
        type: 'button',
        label: 'New sampler for active backbone',
        onclick: function() {
          self.createNewSampler(widget);
        }
      },
      {
        type: 'button',
        label: 'New session',
        onclick: function() {
          widget.init();
          widget.update();
          CATMAID.msg("Info", "Stared new sampler session");
        }
      }
    ];
  };

  var deleteSampler = function(samplerId) {
    if (confirm("Do you really want to delete sampler " + samplerId +
        " and all associated domains and intervals")) {
      return CATMAID.fetch(project.id + "/samplers/" + samplerId + "/delete", "POST")
        .then(function(response) {
          CATMAID.msg("Success", "Deleted sampler " + response.deleted_sampler_id);
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
      dom: "lrphtip",
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
          orderable: false,
          render: function(data, type, row, meta) {
            return row.id;
          }
        },
        {
          data: "skeleton_id",
          title: "Skeleton",
          orderable: true,
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
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "creation_time",
          title: "Created on (UTC)",
          searchable: true,
          orderable: true,
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.creation_time * 1000));
          }
        },
        {
          data: "edition_time",
          title: "Last edited on (UTC)",
          orderable: true,
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.edition_time * 1000));
          }
        },
        {data: "interval_length", title: "Interval length", orderable: true},
        {
          data: "review_required",
          title: "Review required",
          orderable: true,
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
          render: function(data, type, row, meta) {
            var state = self.possibleStates[row.state_id];
            return state ? state.name : ("unknown (" + row.state_id + ")");
          }
        },
        {
          title: "Action",
          orderable: false,
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

        var samplerId = parseInt(this.dataset.samplerId, 10);

        widget.state['skeletonId'] = data.skeleton_id;
        widget.state['samplerId'] = data.id;
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
            datatable.ajax.reload();
          })
          .catch(CATMAID.handleError);
    }).on('click', 'a[data-action=next]', function() {
      var table = $(this).closest('table');
      var tr = $(this).closest('tr');
      var data =  $(table).DataTable().row(tr).data();

      widget.state['skeletonId'] = data.skeleton_id;
      widget.state['samplerId'] = data.id;
      widget.workflow.advance();
      widget.update();
    });
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
    var reviewRequired = widget.state['reviewRequired'];
    if (undefined === reviewRequired) {
      CATMAID.warn("Can't create sampler without review policy");
      return;
    }
    CATMAID.fetch(project.id + '/samplers/add', 'POST', {
      skeleton_id: skeletonId,
      interval_length: intervalLength,
      review_required: reviewRequired
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

    return [
      {
        type: 'select',
        label: 'Domain start',
        title: 'Select start node type of new domain',
        value: widget.state['domainStartNodeType'],
        entries: [{
          title: 'Root node',
          value: 'root'
        }, {
          title: 'Taged node',
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
          title: 'Taged node',
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

    var datatable = $(table).DataTable({
      dom: "lrphtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        CATMAID.fetch(project.id +  "/samplers/" + samplerId + "/domains/", "GET")
          .then(function(result) {
            self.availableDomains = result;
            return self.ensureMetadata()
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
          orderable: false,
          render: function(data, type, row, meta) {
            return row.id;
          }
        },
        {
          data: "start_node_id",
          title: "Start",
          orderable: true,
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
          data: "user_id",
          title: "User",
          orderable: true,
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "creation_time",
          title: "Created on (UTC(",
          searchable: true,
          orderable: true,
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.creation_time * 1000));
          }
        },
        {
          data: "edition_time",
          title: "Last edited on (UTC)",
          orderable: true,
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.edition_time * 1000));
          }
        },
        {
          data: "type",
          title: " Type",
          orderable: true,
          render: function(data, type, row, meta) {
            var type = self.possibleTypes[row.type_id];
            return type ? type.name : ("unknown (" + row.type_id + ")");
          }
        },
        {
          data: "parent_interval_id",
          title: " Parent interval",
          orderable: true,
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
            lookAt: [rootNode.x, rootNode.y, rootNode.z]
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

            // The defined domains are noy yet available from the back-end,
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
                // user_ud
              }]);
            }

            // Set new shading and coloring methods
            widget.options.color_method = 'sampler-domains';
            widget.options.shading_method = 'sampler-domains';
            widget.options.interpolate_vertex_colots = false;
            widget.updateSkeletonColors();

            // Update screen
            widget.render();
          });
        });
      }).then(function(result) {
        widget.update();
    }).catch(CATMAID.handleError);
  };

  /**
   * Create all passed in domains for the passed in sampler. Return a promise
   * that resolves once all domainsa are created.
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
  };

  IntervalWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  IntervalWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  IntervalWorkflowStep.prototype.activate = function(state) {

  };

  IntervalWorkflowStep.prototype.createControls = function(widget) {
    var self = this;
    return [{
      type: 'button',
      label: 'Create intervals',
      title: 'Create a new set of intervals for the current domain',
      onclick: function() {
        self.createNewIntervals(widget);
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
    p3.appendChild(document.createTextNode(' Sampler: #' + samplerId +
        ' Domain: #' + domain.id + ' Interval length: ' + intervalLength + 'nm'));

    // Create a data table with all available domains or a filtered set
    var table = document.createElement('table');
    content.appendChild(table);

    var datatable = $(table).DataTable({
      dom: "lrphtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        CATMAID.fetch(project.id +  "/samplers/domains/" + domain.id + "/intervals/", "GET")
          .then(function(result) {
            self.availableIntervals = result;
            widget.state['domainIntervals'] = result;
            return self.ensureMetadata()
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
          orderable: false,
          render: function(data, type, row, meta) {
            return row.id;
          }
        },
        {
          data: "start_node_id",
          title: "Start",
          orderable: true,
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
          data: "user_id",
          title: "User",
          orderable: true,
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "creation_time",
          title: "Created on (UTC)",
          searchable: true,
          orderable: true,
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.creation_time * 1000));
          }
        },
        {
          data: "edition_time",
          title: "Last edited on (UTC)",
          orderable: true,
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.edition_time * 1000));
          }
        },
        {
          data: "state_id",
          title: "State",
          orderable: true,
          render: function(data, type, row, meta) {
            var state = self.possibleStates[row.state_id];
            return state ? state.name : ("unknown (" + row.state_id + ")");
          }
        },
        {
          title: "Action",
          orderable: false,
          render: function(data, type, row, meta) {
            return '<a href="#" data-action="next">Open</a> <a href="#" data-action="review">Review</a>';
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

      widget.state['interval'] = data;
      widget.workflow.advance();
      widget.update();
    }).on('click', 'a[data-action=review]', function() {
      var skeletonId = widget.state['skeletonId'];
      var tr = $(this).closest('tr');
      var data =  $(table).DataTable().row(tr).data();
      return reviewInterval(skeletonId, data);
    });
  };

  var getDomainDetails = function(projectId, domainId) {
    return CATMAID.fetch(projectId + '/samplers/domains/' + domainId + '/details');
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

    // Build interval boundaries by walking downstream from domain start to end.
    // Except for the start and end node, all children of all interval nodes are
    // considered to be part of the interval.
    prepare
      .then(getDomainDetails.bind(this, project.id, domain.id))
      .then(function(domainDetails) {
        return CATMAID.Sampling.intervalsFromModels(arbor.arbor,
            arbor.positions, domainDetails, intervalLength,
            preferSmallerError);
      })
      .then(function(intervals) {
        return new Promise(function(resolve, reject) {
          // Show 3D viewer confirmation dialog
          var dialog = new CATMAID.Confirmation3dDialog({
            title: "Please confirm " + intervals.length + " domain interval(s)",
            showControlPanel: false
          });

          // Create intervals if OK is pressed
          dialog.onOK = function() {
            CATMAID.fetch(project.id + '/samplers/domains/' +
                domain.id + '/intervals/add-all', 'POST', {
                    intervals: intervals
                })
              .then(function(result) {
                CATMAID.msg("Success", intervals.length + " interval(s) created");
                resolve(result);
              })
              .catch(reject);
          };
          dialog.onCancel = function() {
            CATMAID.msg("No intervals created", "Canceled by user");
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

            /*

            // The defined domains are noy yet available from the back-end,
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
                // user_ud
              }]);
            }

            */

            // Set new shading and coloring methods
            widget.options.color_method = 'sampler-intervals';
            widget.options.shading_method = 'sampler-intervals';
            widget.options.interpolate_vertex_colots = false;
            widget.updateSkeletonColors();
          });
        });
      })
      .then(function(result) {
        widget.update();
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
        widget.workflow.advance();
        widget.update();
      });
  };

  var reviewInterval = function(skeletonId, interval) {
    var reviewWidget = WindowMaker.create('review-system').widget;
    var strategy = CATMAID.NodeFilterStrategy['sampler-interval'];
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
    this.sampleInputConnectors = true;
    this.sampleOutputConnectors = true;
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
        type: 'checkbox',
        label: 'Input syanpses',
        title: 'Consider synapses that are pre-synaptic to this interval for sampling',
        value: this.sampleInputConnectors,
        onclick: function() {
          self.sampleInputConnectors = this.checked;
        }
      },
      {
        type: 'checkbox',
        label: 'Ouput syanpses',
        title: 'Consider synapses that are post-synaptic to this interval for sampling',
        value: this.sampleOutputConnectors,
        onclick: function() {
          self.sampleOutputConnectors = this.checked;
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
        label: 'Pick random synapse',
        title: "Select a random non-abandoned, non-excluded synapse to continue with",
        onclick: function() {
          self.pickRandomSynapse(widget);
        }
      },
      {
        type: 'button',
        label: 'Refresh',
        title: "Reload the synapse listing",
        onclick: function() {
          widget.update();
        }
      }
    ];
  };

  SynapseWorkflowStep.prototype.isComplete = function(state) {
    return !!state['synapseSelected'];
  };

  SynapseWorkflowStep.prototype.updateContent = function(content, widget) {
    var interval = widget.state['interval'];
    if (!interval) {
      throw new CATMAID.ValueError("Need interval for synapse workflow step");
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
        'Create seed nodes for all input synapses; only create one or a few ' +
        'seed nodes for each output synapse. Once this is done, select a ' +
        '(random) synapse to continue. Below is a list of connectors in this interval.';
    p.appendChild(document.createTextNode(msg));

    var intervalStartNodeId = interval.start_node_id;
    var intervalEndNodeId = interval.end_node_id;
    var p2 = content.appendChild(document.createElement('p'));
    p2.innerHTML = 'Interval start: <a href="#" data-action="select-node" data-node-id="' + intervalStartNodeId +
        '">' + intervalStartNodeId + '</a> Interval end: <a href="#" data-action="select-node" data-node-id="' +
        intervalEndNodeId + '">' + intervalEndNodeId + '</a>';

    $('a', p2).on('click', function() {
      var nodeId = this.dataset.nodeId;
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    });

    // Get review information for interval

    var skeletonId = widget.state['skeletonId'];

    // Create a data table with all available domains or a filtered set
    var inputHeader = content.appendChild(document.createElement('h3'));
    inputHeader.appendChild(document.createTextNode('Input connectors'));
    inputHeader.style.clear = 'both';
    var inputTable = document.createElement('table');
    content.appendChild(inputTable);

    var outputHeader = content.appendChild(document.createElement('h3'));
    outputHeader.appendChild(document.createTextNode('Output connectors'));
    outputHeader.style.clear = 'both';
    var outputTable = document.createElement('table');
    content.appendChild(outputTable);

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
          self.makeConnectorTable(inputTable, interval, skeletonId, "presynaptic_to"),
          self.makeConnectorTable(outputTable, interval, skeletonId, "postsynaptic_to")
        ];
      })
      .catch(CATMAID.handleError);
  };

  SynapseWorkflowStep.prototype.makeConnectorTable = function(table, interval, skeletonId, relation) {
    var self = this;
    var intervalId = interval.id;
    var datatable = $(table).DataTable({
      dom: "lrphtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        Promise.all([
          CATMAID.fetch(project.id + '/connectors/', 'GET', {
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

          // Parse data so that it maches the table
          // Store data in worfklow step
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
          orderable: false,
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
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "edition_time",
          title: "Last edited on (UTC)",
          orderable: true,
          render: function(data, type, row, meta) {
            return formatDate(new Date(row.edition_time));
          }
        },
        {
          data: "treenode_id",
          title: "Treenode",
          orderable: true,
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
          render: function(data, type, row, meta) {
            return '<a href="#" data-action="exclude" data-node-id="' + row.id + '">exclude</a> ' +
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
    });

    datatable.on('click', 'a[data-action=select-node]', function() {
      var nodeId = this.dataset.nodeId;
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    });

    return datatable;
  };

  var highlightActiveNode = function() {
    $('tr', this.table).removeClass('highlight');
    if (SkeletonAnnotations.getActiveNodeType() === SkeletonAnnotations.TYPE_CONNECTORNODE) {
      var activeNodeId = SkeletonAnnotations.getActiveNodeId();
      $('tr[data-node-id=' + activeNodeId + ']', this.table).addClass('highlight');
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
    var incomingConnectors = this.connectorData['presynaptic_to'];
    if (this.sampleInputConnectors && incomingConnectors) {
      for (var i=0; i<incomingConnectors.length; ++i) {
        var connector = incomingConnectors[i];
        var sc = this.samplerConnectors[connector.id];
        if (!(sc && this.possibleStates[sc.state_id].name === "excluded")) {
          connectors.push(connector);
        }
      }
    }
    var outgoingConnectors = this.connectorData['postsynaptic_to'];
    if (this.sampleOutputConnectors && outgoingConnectors) {
      for (var i=0; i<outgoingConnectors.length; ++i) {
        var connector = outgoingConnectors[i];
        var sc = this.samplerConnectors[connector.id];
        if (!(sc && this.possibleStates[sc.state_id].name === "excluded")) {
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
        widget.update();
        SkeletonAnnotations.staticMoveToAndSelectNode(connector.id);
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


  // Export widget
  CATMAID.ReconstructionSampler = ReconstructionSampler;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: 'reconstruction-sampler',
    creator: ReconstructionSampler
  });

})(CATMAID);
