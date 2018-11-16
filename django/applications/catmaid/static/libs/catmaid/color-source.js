(function(CATMAID) {

  /**
   * A color source will subscribe to the passed in skeleton source and colors
   * all skeletons according to the passed in type. Currently, only the type
   * "length" is supported, which colors based on skeleton length.
   */
  var ColorSource = function(type, skeletonSource, options) {
    this.type = type;
    this.colorMode = SkeletonColorMode[type];
    if (!this.colorMode) {
      throw new CATMAID.ValueError("No valid color mode: " + type);
    }

    this.skeletonSource = skeletonSource;
    this.options = options;

    this.inputSource = new CATMAID.BasicSkeletonSource("Input source", {
      register: false,
      handleAddedModels: this.handleAddedModels.bind(this),
      handleChangedModels: this.handleChangedModels.bind(this),
      handleRemovedModels: this.handleRemovedModels.bind(this),
    });

    this.outputSource = new CATMAID.BasicSkeletonSource(
        "Color source for " + skeletonSource.getName(), {
          register: false,
        });

    this.skeletonSouceSubscription = new CATMAID.SkeletonSourceSubscription(
        skeletonSource, true, false, CATMAID.SkeletonSourceSubscription.UNION,
        CATMAID.SkeletonSourceSubscription.ALL_EVENTS);
    this.skeletonSouceSubscription.ignoreLocal = true;
    this.inputSource.addSubscription(this.skeletonSouceSubscription, true);
  };

  function getSkeletonId(o) {
    return o.skeleton_id;
  }

  ColorSource.prototype.handleAddedModels = function(models) {
    // Update length and color information
    var skeletonIds = Object.keys(models).map(function(modelId) {
      return models[modelId].id;
    });

    var self = this;
    this.colorMode.colorSkeletons(skeletonIds, models)
      .then(function() {
        self.outputSource.append(models);
      })
      .catch(CATMAID.handleError);
  };

  ColorSource.prototype.handleChangedModels = function(models) {
    // Update length and color information
    var skeletonIds = Object.keys(models).map(function(modelId) {
      return models[modelId].id;
    });
    var self = this;
    this.colorMode.colorSkeletons(skeletonIds, models)
      .then(function() {
        self.outputSource.updateModels(models);
      })
      .catch(CATMAID.handleError);
  };

  ColorSource.prototype.handleRemovedModels = function(models) {
    this.outputSource.removeSkeletons(Object.keys(models));
  };

  /**
   * Unregeister all listeners.
   */
  ColorSource.prototype.unregister = function() {
    this.inputSource.removeSubscription(this.skeletonSouceSubscription);
  };

  var SkeletonColorMode = {
    'length': {
      'colorSkeletons': function(skeletonIds, models) {
        return CATMAID.fetch(project.id + '/skeletons/cable-length', 'POST', {
            skeleton_ids: skeletonIds
          })
          .then(function(lengthData) {
            let colorSteps = CATMAID.TracingOverlay.Settings.session.length_color_steps;
            let lowerStop, upperStop;
            let sortedSteps = colorSteps.sort(function(a, b) {
              if (a.stop < b.stop) return -1;
              if (a.stop > b.stop) return 1;
              return 0;
            });
            let lowerColor = new THREE.Color();
            let upperColor = new THREE.Color();
            let targetColor = new THREE.Color();
            for (let skeletonId in lengthData) {
              let length = lengthData[skeletonId];
              if (length || length === 0) {
                let lowerStep, upperStep;
                for (let i=0; i<colorSteps.length; ++i) {
                  let step = colorSteps[i];
                  if (step.stop <= length && (!lowerStep || lowerStep < length)) {
                    lowerStep = step;
                  }
                  if (step.stop >= length && (!upperStep || upperStep < length)) {
                    upperStep = step;
                  }
                }
                let color;
                if (lowerStep && upperStep) {
                  let ratio = (upperStep.stop - length) / (upperStep.stop - lowerStep.stop);
                  lowerColor.setHex(lowerStep.color);
                  upperColor.setHex(upperStep.color);
                  targetColor.setRGB(
                    ratio * lowerColor.r + (1.0 - ratio) * upperColor.r,
                    ratio * lowerColor.g + (1.0 - ratio) * upperColor.g,
                    ratio * lowerColor.b + (1.0 - ratio) * upperColor.b);
                  color = targetColor.getHex();
                } else if (!(lowerStep || upperStep)) {
                  throw new CATMAID.ValueError("Need either lower step or upper step for coloring");
                } else if (lowerStep) {
                  color = lowerStep.color;
                } else if (upperStep) {
                  color = upperStep.color;
                }

                var model = models[skeletonId];
                model.color.setHex(color);
              }
            }
          });
      }
    }
  };

  // Export
  CATMAID.ColorSource = ColorSource;

})(CATMAID);
