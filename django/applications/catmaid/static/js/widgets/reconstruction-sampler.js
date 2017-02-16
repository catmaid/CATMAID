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
    this.state = {};
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

  ReconstructionSampler.prototype = new InstanceRegistry();

  ReconstructionSampler.prototype.getName = function() {
    return "Reconstruction Sampler " + this.widgetID;
  };

  ReconstructionSampler.prototype.destroy = function() {
    this.unregisterInstance();
  };

  ReconstructionSampler.prototype.update = function() {
    var step = this.workflow.getCurrentStep();
    while (this.content.lastChild) {
      this.content.removeChild(this.content.lastChild);
    }
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
            if (!self.workflow.selectStep(newStepIndex)) {
              if (oldStepIndex !== newStepIndex) {
                $(event.target).tabs('option', 'active', oldStepIndex);
              }
            }
            self.update();
          }
        });
      },

      createContent: function(content) {
        this.content = content;
      },

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
  };

  BackboneWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  BackboneWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  BackboneWorkflowStep.prototype.activate = function(state) {

  };

  BackboneWorkflowStep.prototype.isComplete = function(state) {
    return undefined !== state['skeletonId'];
  };

  BackboneWorkflowStep.prototype.createControls = function(widget) {
    return [
      {
        type: 'button',
        label: 'Use current skeleton as backbone',
        onclick: function() {
          var skeletonId = SkeletonAnnotations.getActiveSkeletonId();
          if (skeletonId) {
            widget.state['skeletonId'] = skeletonId;
            widget.update();
          }
        }
      }
    ];
  };

  BackboneWorkflowStep.prototype.updateContent = function(content, widget) {
    var skeletonId = widget.state['skeletonId'];
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
    } else {
      p.appendChild(document.createTextNode('No backbone skeleton selected'));
    }
  };


  /**
   *  Divide sampled portion into even intervals.
   */
  var DomainWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Domain");
  };

  DomainWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  DomainWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  DomainWorkflowStep.prototype.activate = function(state) {

  };

  DomainWorkflowStep.prototype.isComplete = function(state) {
    return undefined !== state['domainId'];
  };

  DomainWorkflowStep.prototype.createControls = function(controls) {
    return [];
  };

  DomainWorkflowStep.prototype.updateContent = function(content, widget) {
    var p = content.appendChild(document.createElement('p'));
    p.appendChild(document.createTextNode('Define one or more domains that should be sampled on neuron '));
    var name = CATMAID.NeuronNameService.getInstance().getName(widget.state.skeletonId);
    var a = p.appendChild(document.createElement('a'));
    a.appendChild(document.createTextNode(name));
    a.href = '#';
    a.onclick = function() {
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
    };
    p.appendChild(document.createTextNode('.'));
  };


  /**
   * Pick interval at random. Annotate all synapses and twig branch points on
   * interval. Create seed nodes for all input synapses. Only create one or a
   * few seed nodes for each input synapse.
   */
  var IntervalWorkflowStep = function() {
    CATMAID.WorkflowStep.call(this, "Interval");
  };

  IntervalWorkflowStep.prototype = Object.create(CATMAID.WorkflowStep);
  IntervalWorkflowStep.prototype.constructor = CATMAID.WorkflowStep;

  IntervalWorkflowStep.prototype.activate = function(state) {

  };

  IntervalWorkflowStep.prototype.createControls = function(controls) {
    return [];
  };

  IntervalWorkflowStep.prototype.isComplete = function(state) {
    return undefined !== state['intervalId'];
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
