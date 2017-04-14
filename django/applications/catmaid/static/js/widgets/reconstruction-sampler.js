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
      'domainEndNodeType': 'downstream'
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
          data: "state",
          title: " State",
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

        var samplerId = parseInt(this.dataset.samplerId, 10);

        widget.state['skeletonId'] = data.skeleton_id;
        widget.state['samplerId'] = data.id;
        widget.workflow.advance();
        widget.update();
      }
    }).on('click', 'a[data-action=select-skeleton]', function() {
      var skeletonId = parseInt(this.dataset.skeletonId, 10);
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
    }).on('click', 'a[data-action=next]', function() {
      var table = $(this).closest('table');
      var tr = $(this).closest('tr');
      var data =  $(table).DataTable().row(tr).data();

      var samplerId = parseInt(this.dataset.samplerId, 10);

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
    CATMAID.fetch(project.id + '/samplers/add', 'POST', {
      skeleton_id: skeletonId,
      interval_length: intervalLength,
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

    var self = this;
    this.ensureMetadata()
      .then(function() {
        var domainTypeId = self.getTypeId(domainType);
        if (!domainTypeId) {
          throw new CATMAID.ValueError("Can't find domain type ID for name: " + domainType);
        }
        return Promise.all([domainTypeId, domainFactory.makeDomains(skeletonId, options)]);
      })
      .then(function(results) {
        var domainTypeId = results[0];
        var domains = results[1].domains;
        var cache = results[1].cache;

        if (cache) {
          // This allows to cache e.g. Arbor instances and other potentially
          // expensive information.
          for (var key in cache) {
            widget.state[key] = cache[key];
          }
        }

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
      }).then(function(result) {
        widget.update();
    }).catch(CATMAID.handleError);
  };


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
      label: 'Create intervals for domain',
      onclick: function() {
        self.createNewIntervals(widget);
      }
    }, {
      type: 'button',
      label: 'Pick random untouched interval',
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
          title: " State",
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
        // Get domain arbor, which is then split into slabs, which are then
        // further split into intervals of respective length.
        var domainArbor = CATMAID.Sampling.domainArborFromModel(arbor.arbor, domainDetails);

        // Create Intervals from partitions
        var intervals = [], positions = arbor.positions;
        var partitions = domainArbor.partitionSorted();
        for (var i=0; i<partitions.length; ++i) {
          var partition = partitions[i];
          // Walk partition toward leafs
          var sum = 0;
          var intervalStartIdx = partition.length - 1;
          var intervalStartPos = positions[partition[intervalStartIdx]];
          // Traverse towards leafs, i.e. from the end of the partition entries
          // to branch points or root.
          for (var j=partition.length - 2; j>=0; --j) {
            var oldSum = sum;
            // Calculate new interval length
            var pos = positions[partition[j]];
            var dist = intervalStartPos.distanceTo(pos);
            sum += dist;
            //  If sum is greater than interval length, create new interval. If
            //  <preferSmalError>, the end/start node is either the current one
            //  or the last one, whichever is closer to the ideal length.
            //  Otherwise this node is used.
            if (sum > intervalLength) {
              var steps = intervalStartIdx - j;
              // Optionally, make the interval smaller if this means being
              // closer to the ideal interval length. This can only be done if
              // the current interval has at least a length of 2.
              if (preferSmallerError && (intervalLength - oldSum) < dist && steps > 1 && j !== 0) {
                intervals.push([partition[intervalStartIdx], partition[j+1]]);
                intervalStartIdx = j + 1;
              } else {
                intervals.push([partition[intervalStartIdx], partition[j]]);
                intervalStartIdx = j;
              }
              sum = 0;
            }
          }
        }

        return intervals;
      })
      .then(function(intervals) {
        return CATMAID.fetch(project.id + '/samplers/domains/' +
            domain.id + '/intervals/add-all', 'POST', {
                intervals: intervals
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
    intervals = intervals.filter(function(interval) {
      var state = this.possibleStates[interval.state_id];
      return state.name === 'untouched';
    }, this);
    if (!intervals || 0 === intervals.length) {
      CATMAID.warn("No (untouched) intervals available");
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


  /**
   * Let user annotate all branch points and synapses. Then pick a twig branch
   * point from the interval at random. Trace it to completion, annotating
   * synapses as above.
   */
  var TwigWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Twig");
  };

  TwigWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  TwigWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  TwigWorkflowStep.prototype.activate = function(state) {

  };

  TwigWorkflowStep.prototype.createControls = function(widget) {
    var self = this;
    return [{
      type: 'button',
      label: 'Update twigs',
      onclick: function() {
        widget.update();
      }
    }, {
      type: 'button',
      label: 'Pick random branch point',
      onclick: function() {
        self.pickRandomBranch(widget);
      }
    }];
  };

  TwigWorkflowStep.prototype.isComplete = function(state) {
    return !!state['twigNodeId'];
  };

  TwigWorkflowStep.prototype.updateContent = function(content, widget) {
    var self = this;
    var intervalLength = widget.state['intervalLength'];
    var samplerId = widget.state['samplerId'];
    var skeletonId = widget.state['skeletonId'];
    var domain = widget.state['domain'];
    var interval = widget.state['interval'];

    var p = content.appendChild(document.createElement('p'));
    p.appendChild(document.createTextNode('Reconstruct all synapses and twig ' +
        'branch points on this interval. Create seed nodes for all input ' +
        'synapses; only create one or a few seed nodes for each output synapse. ' +
        'Once this is done, select a (random) branch to continue.'));
    var name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
    var p2 = content.appendChild(document.createElement('p'));
    p2.appendChild(document.createTextNode('Target skeleton: '));
    var a = p2.appendChild(document.createElement('a'));
    a.appendChild(document.createTextNode(name));
    a.href = '#';
    a.onclick = function() {
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
    };
    p2.appendChild(document.createTextNode(' Sampler: #' + samplerId +
        ' Domain: #' + domain.id + ' Interval length: ' + intervalLength +
        'nm Interval: #' + interval.id + ' Interval start: '));
    var aStart = p2.appendChild(document.createElement('a'));
    aStart.appendChild(document.createTextNode(interval.start_node_id));
    aStart.href = '#';
    aStart.onclick = function() {
      SkeletonAnnotations.staticMoveToAndSelectNode(interval.start_node_id);
    };
    p2.appendChild(document.createTextNode(' Interval end: '));
    var aEnd = p2.appendChild(document.createElement('a'));
    aEnd.appendChild(document.createTextNode(interval.end_node_id));
    aEnd.href = '#';
    aEnd.onclick = function() {
      SkeletonAnnotations.staticMoveToAndSelectNode(interval.end_node_id);
    };

    // Create a data table with all available domains or a filtered set
    var table = document.createElement('table');
    content.appendChild(table);

    var datatable = $(table).DataTable({
      dom: "lrphtip",
      autoWidth: false,
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        var twigEnds = widget.state['intervalTwigEnds'] || [];
        callback({
          draw: data.draw,
          data: twigEnds
        });
      },
      order: [],
      columns: [
        {
          title: "First node in twig",
          orderable: true,
          render: function(data, type, row, meta) {
            if ("display") {
              return '<a href="#" data-action="select-node" data-node-id="' +
                  row.nodeId + '" >' + row.nodeId + '</a>';
            } else {
              return row.nodeId;
            }
          }
        },
        {
          data: "type",
          title: "Type",
          orderable: true,
        }
      ],
    }).on('dblclick', 'tr', function(e) {
      var data = datatable.row(this).data();
      if (data) {
        var table = $(this).closest('table');
        var tr = $(this).closest('tr');
        var data =  $(table).DataTable().row(tr).data();
        SkeletonAnnotations.staticMoveToAndSelectNode(data.nodeId);
      }
    }).on('click', 'a[data-action=select-node]', function() {
      var nodeId = parseInt(this.dataset.nodeId, 10);
      SkeletonAnnotations.staticMoveToAndSelectNode(nodeId);
    });

    // Create table containing all branches, based on current arbor. Since this
    // step asks the user to change the skeleton, the arbor is reloaded for a
    // table update.
    this.getIntervalArbors(skeletonId, interval)
      .then(function(intervalArbors) {
        widget.state['intervalArbors'] = intervalArbors;
        self.intervalNodes = new Set(intervalArbors.all.nodesArray().map(function(n) { return parseInt(n, 10); }));
        var intervalEndNodeId = interval.end_node_id;
        var endNodes = intervalArbors.twigs.findEndNodes()
            .filter(function(node) {
              return node != intervalEndNodeId;
            });
        widget.state['intervalTwigEnds'] = endNodes.map(function(nodeId) {
          return {
            'nodeId': nodeId,
            'type': 'branch'
          };
        });

        datatable.ajax.reload();
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Return two new new Arbor instances that covers only the requested interval.
   * The twig arbor will only contain the first twig node after a branch.
   *
   * @return {Promise} Resolved with two-field object, one for each arbor
   */
  TwigWorkflowStep.prototype.getIntervalArbors = function(skeletonId, interval) {
    return CATMAID.Sampling.getArbor(skeletonId)
      .then(function(arbor) {
        var startNodeId = interval.start_node_id;
        var endNodeId = interval.end_node_id;
        var edges = arbor.arbor.edges;
        var allSuccessors = arbor.arbor.allSuccessors();

        var intervalBackbone = [parseInt(endNodeId, 10)];
        while (true) {
          var lastNode = intervalBackbone[intervalBackbone.length - 1];
          var parentId = edges[lastNode];
          intervalBackbone.push(parseInt(parentId, 10));
          if (parentId == startNodeId || !parentId) {
            break;
          }
        }

        // Create an interval arbor by walking the interval backbone from start
        // to end, adding all branches that start in-between. Branches from
        // neither start nor end will be added, other intervals have to be used
        // to cover these.
        var twigEdges = {};
        var intervalEdges = {};
        var backboneSet = new Set(intervalBackbone);
        var workingSet = intervalBackbone;
        while (workingSet.length > 0) {
          var edgeChildId = workingSet.pop();
          if (edgeChildId == startNodeId) {
            // The relevant child edge will be added by the child
            continue;
          }

          var parentId = edges[edgeChildId];
          intervalEdges[edgeChildId] = parentId;

          // For the twig abor, the parent has to be in the backbone.
          if (backboneSet.has(parentId)) {
            twigEdges[edgeChildId] = parentId;
          }

          if (edgeChildId == endNodeId) {
            // No children of last node will be added
            continue;
          }

          var children = allSuccessors[edgeChildId];
          for (var i=0; i<children.length; ++i) {
            var childId = children[i];
            // Only consider unknown nodes
            if (undefined === intervalEdges[childId]) {
              workingSet.push(childId);
            }
          }
        }

        var twigArbor = new Arbor();
        twigArbor.edges = twigEdges;
        twigArbor.root = startNodeId;

        var intervalArbor = new Arbor();
        intervalArbor.edges = intervalEdges;
        intervalArbor.root = startNodeId;

        return {
          twigs: twigArbor,
          all: intervalArbor
        };
      });
  };

  TwigWorkflowStep.prototype.pickRandomBranch = function(widget) {
    var interval = widget.state['interval'];
    var twigArbor = widget.state['intervalArbors'].twigs;
    if (!twigArbor) {
      CATMAID.warn("No twig arbor available");
      return;
    }
    var intervalEndNodeId = interval.end_node_id;
    var endNodes = twigArbor.findEndNodes()
        .filter(function(node) {
          return node != intervalEndNodeId;
        });

    // For now, use uniform distribution
    var twig = endNodes[Math.floor(Math.random()*endNodes.length)];

    // Update state
    widget.state['twigNodeId'] = twig;
    widget.workflow.advance();
    widget.update();
  };

  /**
   * Warn users if they step out of looked at interval.
   */
  TwigWorkflowStep.prototype.handleActiveNodeChange = function(widget, node) {
    if (this.intervalNodes) {
      if (!this.intervalNodes.has(node.id)) {
        var interval = widget.state['interval'];
        var warn = true;
        if (SkeletonAnnotations.isRealNode(node.id)) {
          // Unknown real nodes are outside of interval if they have no parent
          // or if the node's parent is either the start or end node of the
          // interval.
          warn = !node.parent_id || !(this.intervalNodes.has(node.parent_id) &&
              node.parent_id != interval.start_node_id && node.parent_id != interval.end_node_id);
          if (!warn) {
            // Add new in-interval node to set of known nodes.
            this.intervalNodes.add(testNodeId);
          }
        } else {
          // Unknown virtual nodes are outside of interval if both their real
          // child and parent are not part of the interval
          var childId = parseInt(SkeletonAnnotations.getChildOfVirtualNode(node.id), 10);
          var parentId = parseInt(SkeletonAnnotations.getParentOfVirtualNode(node.id), 10);
          warn = !(this.intervalNodes.has(childId) && this.intervalNodes.has(parentId));
        }

        if (warn) {
          CATMAID.warn("Active node is outside of interval");
        }
      }
      // Test if new node has a parent in
    } else {
      CATMAID.warn("Could not find interval nodes");
    }
  };


  /**
   * Pick a synapse at random from the traced interval (input, output, or
   * either, depending on the goals).
   */
  var SynapseWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Synapse");
  };

  SynapseWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  SynapseWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  SynapseWorkflowStep.prototype.activate = function(state) {

  };

  SynapseWorkflowStep.prototype.createControls = function(widget) {
    return [];
  };

  SynapseWorkflowStep.prototype.isComplete = function(state) {
    return !!state['synapseSelected'];
  };

  SynapseWorkflowStep.prototype.updateContent = function(content, widget) {
    var p = content.appendChild(document.createElement('p'));
    p.appendChild(document.createTextNode('Reconstruct twig to completion. ' +
        'Create seed nodes for all input synapses; only create one or a few ' +
        'seed nodes for each output synapse. Once this is done, select a ' +
        '(random) synapse to continue.'));
  };


  // Export widget
  CATMAID.ReconstructionSampler = ReconstructionSampler;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: 'reconstruction-sampler',
    creator: ReconstructionSampler
  });

})(CATMAID);
