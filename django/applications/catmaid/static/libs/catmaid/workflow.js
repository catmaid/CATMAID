(function(CATMAID) {

  "use strict";

  /**
   * Encapsulates a step-by-step process.
   */
  var Workflow = function(options) {
    options = options || {};
    this.state = options['state'] || {};
    this.currentStepIndex = 0;
    this.steps = options['steps'];
    if (!this.steps) {
      throw new CATMAID.ValueError("Need at least one step for workflow");
    }

    if (options['step']) {
      this.selectStep(options['step']);
    }
  };

  Workflow.prototype.setState = function(state) {
    this.state = state;
  };

  Workflow.prototype.advance = function() {
    this.selectStep(this.currentStepIndex + 1);
  };

  Workflow.prototype.goBack = function() {
    this.selectStep(this.currentStepIndex - 1);
  };

  Workflow.prototype.getCurrentStep = function() {
    return this.steps[this.currentStepIndex];
  };

  Workflow.prototype.selectStep = function(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.steps.length) {
      throw new CATMAID.ValueError("No valid step index: " + stepIndex);
    }

    // Make sure all previous steps are complete
    var allPreviousComplete = true;
    for (var i=0; i<stepIndex; ++i) {
        allPreviousComplete = allPreviousComplete &&
            this.steps[i].isComplete(this.state);
        if (!allPreviousComplete) {
          break;
        }
    }

    var success = false;
    if (allPreviousComplete) {
      var newStep = this.steps[stepIndex];
      try {
        newStep.activate(this.state);
        newStep.destroy(this.state);
        this.currentStepIndex = stepIndex;
        success = true;
      } catch (error) {
        if (stepIndex !== this.currentStepIndex) {
          newStep.activate(this.state);
        }
        if (error instanceof CATMAID.PreConditionError) {
          CATMAID.warn("Step " + (stepIndex + 1) + " can not be activated yet");
        } else {
          CATMAID.handleError(error);
        }
      }
    } else {
      CATMAID.warn("Previous step(s) not complete");
    }

    return success;
  };


  /**
   * A workflow step that can be used by a workflow.
   */
  var WorkflowStep = function(title) {
    this.title = title;
  };

  WorkflowStep.activate = function(state) {};

  WorkflowStep.destroy = function(state) {};

  WorkflowStep.isComplete = function(state) {
    return true;
  };


  // Export
  CATMAID.Workflow = Workflow;
  CATMAID.WorkflowStep = WorkflowStep;

})(CATMAID);
