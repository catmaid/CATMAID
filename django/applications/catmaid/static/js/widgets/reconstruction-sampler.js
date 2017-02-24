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
  };

  ReconstructionSampler.prototype = new InstanceRegistry();

  ReconstructionSampler.prototype.getName = function() {
    return "Reconstruction Sampler " + this.widgetID;
  };

  ReconstructionSampler.prototype.init = function() {
    this.state = {
      'intervalLength': 5000,
      'domainType': 'covering'
    };
    this.workflow = new CATMAID.Workflow({
      state: this.state,
      step: 0,
      steps: [
        new BackboneWorkflowStep(),
        new DomainWorkflowStep(),
        new IntervalWorkflowStep(),
        new TwigWorkflowStep(),
        new SynapseWorkflowStep()
       ]
    });
  };

  ReconstructionSampler.prototype.destroy = function() {
    CATMAID.NeuronNameService.getInstance().unregister(this);
    this.unregisterInstance();
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

  /**
   * Select a backbone. Specify portion(s) of backbone you wish to sample
   * ("sample domains").
   */
  var BackboneWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Backbone");

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
      paging: true,
      lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
      ajax: function(data, callback, settings) {
        var params = {};
        if (skeletonId) {
          params['skeleton_id'] = skeletonId;
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
          orderable: false,
          render: function(data, type, row, meta) {
            var skeletonId = row.skeleton_id;
            var name = CATMAID.NeuronNameService.getInstance().getName(skeletonId);
            if ("display") {
              return '<a href="#" data-action="select-skeleton" data-skeleton-id="' +
                  skeletonId + '" >' + name + '</a>';
            } else {
              return username;
            }
          }
        },
        {
          data: "user_id",
          title: "User",
          orderable: false,
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "creation_time",
          title: "Created on",
          searchable: true,
          orderable: false,
          render: function(data, type, row, meta) {
            return new Date(row.creation_time * 1000);
          }
        },
        {
          data: "edition_time",
          title: "Last edited on",
          orderable: false,
          render: function(data, type, row, meta) {
            return new Date(row.edition_time * 1000);
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
   *  Divide sampled portion into even intervals.
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
        label: 'Domain type',
        title: 'Select type of node domains',
        value: widget.state['domainType'],
        entries: [{
          title: 'Complete skeleton',
          value: 'covering'
        }],
        onchange: function() {
          widget.state['domainType'] = this.value;
        }
      },
      {
        type: 'button',
        label: 'New domain',
        onclick: function() {
          self.createNewDomain(widget);
        }
      },
      {
        type: 'button',
        label: 'Pick random domain',
        onclick: function() {
          self.pickRandomDomain(widget);
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
          orderable: false,
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
          orderable: false,
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "creation_time",
          title: "Created on",
          searchable: true,
          orderable: false,
          render: function(data, type, row, meta) {
            return new Date(row.creation_time * 1000);
          }
        },
        {
          data: "edition_time",
          title: "Last edited on",
          orderable: false,
          render: function(data, type, row, meta) {
            return new Date(row.edition_time * 1000);
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

  /**
   * Get arbor information on a particular skeleton.
   */
  var getArbor = function(skeletonId) {
    // Get nodes and tags for skeleton
    return CATMAID.fetch(project.id + '/' + skeletonId + '/1/0/1/compact-arbor', 'POST')
      .then(function(result) {
        var ap = new CATMAID.ArborParser();
        ap.tree(result[0]);

        return {
          arbor: ap.arbor,
          positions: ap.positions,
          tags: result[2]
        };
      });
  };

  DomainWorkflowStep.prototype.domainFactories = {
    'covering': {
      makeDomains: function(skeletonId) {
        return getArbor(skeletonId)
          .then(function(arbor) {
            return {
              domains: [{
                startNodeId: arbor.arbor.root,
                endNodeIds: arbor.arbor.findEndNodes()
              }],
              cache: {
                arbor: arbor
              }
            };
          });
      }
    }
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
    var domainType = widget.state['domainType'];
    if (!domainType) {
      CATMAID.warn("Can't create domain without type");
      return;
    }
    var domainFactory = this.domainFactories[domainType];
    if (!domainFactory) {
      CATMAID.warn("Domain type unsupported: " + domainType);
      return;
    }

    var self = this;
    this.ensureMetadata()
      .then(function() {
        var domainTypeId = self.getTypeId(domainType);
        if (!domainTypeId) {
          throw new CATMAID.ValueError("Can't find domain type ID for name: " + domainType);
        }
        return Promise.all([domainTypeId, domainFactory.makeDomains(skeletonId)]);
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

  DomainWorkflowStep.prototype.pickRandomDomain = function(widget) {
    var domains = this.availableDomains;
    if (!domains) {
      CATMAID.warn("No domain available");
      return;
    }

    // For now, use uniform distribution
    var domain = domains[Math.floor(Math.random()*domains.length)];

    // Update state
    widget.state['domain'] = domain;
    widget.workflow.advance();
    widget.update();
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
          orderable: false,
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
          orderable: false,
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
          orderable: false,
          render: function(data, type, row, meta) {
            return CATMAID.User.safe_get(row.user_id).login;
          }
        },
        {
          data: "creation_time",
          title: "Created on",
          searchable: true,
          orderable: false,
          render: function(data, type, row, meta) {
            return new Date(row.creation_time * 1000);
          }
        },
        {
          data: "edition_time",
          title: "Last edited on",
          orderable: false,
          render: function(data, type, row, meta) {
            return new Date(row.edition_time * 1000);
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

        widget.state['interval'] = data;
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
      prepare = getArbor(skeletonId)
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
        // Get sub-arbor that starts at domain root and is pruned at all domain
        // ends. This is then split into slabs, which are then further split
        // into intervals of respective length.
        var domainArbor = arbor.arbor.subArbor(domain.start_node_id);
        var allSuccessors = domainArbor.allSuccessors();
        domainArbor.pruneAt(domainDetails.ends.reduce(function(o, end) {
          // Pruning is inclusive, so we need to prune the potential successors
          // of the end nodes.
          var successors = allSuccessors[end.node_id];
          for (var i=0; i<successors; ++I) {
            o[successors[i]] = true;
          }
          return o;
        }, {}));

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
   * Pick a twig branch point from the interval at random. Trace it to
   * completion, annotating synapses as above.
   */
  var TwigWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Twig");
  };

  TwigWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  TwigWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  TwigWorkflowStep.prototype.activate = function(state) {

  };

  TwigWorkflowStep.prototype.createControls = function(controls) {
    return [];
  };

  IntervalWorkflowStep.prototype.isComplete = function(state) {
    return !!state['twigReconstructed'];
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

  SynapseWorkflowStep.prototype.createControls = function(controls) {
    return [];
  };

  SynapseWorkflowStep.prototype.isComplete = function(state) {
    return !!state['synapseSelected'];
  };


  // Export widget
  CATMAID.ReconstructionSampler = ReconstructionSampler;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: 'reconstruction-sampler',
    creator: ReconstructionSampler
  });

})(CATMAID);
