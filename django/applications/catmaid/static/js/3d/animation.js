/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID,
  THREE
*/

(function(CATMAID) {

  "use strict";

  function getOption(options, key) {
    if (options[key]) {
      return options[key];
    } else {
      throw Error("Option not found: " + key);
    }
  }

  /**
   * Create new animations.
   */
  CATMAID.AnimationFactory = {

    /**
     * Map known rotation axis types to a human readable form.
     */
    AxisTypes: {
      "up": "Camera Up",
      "x": "X",
      "y": "Y",
      "z": "Z"
    },

    /**
     * Create a new animation instance.
     */
    createAnimation: function(options) {
      options = options || {};

      var animation = {};

      var notify = options.notify || false;

      if (options.type == "rotation") {
        var axis = options.axis || "up";
        var camera = getOption(options, "camera");
        var target = getOption(options, "target");
        var speed = getOption(options, "speed");
        var backAndForth = options.backandforth || false;

        // Create rotation axis
        if ("up" === axis) {
          axis = camera.up.clone().normalize();
        } else if ("x" === axis) {
          axis = new THREE.Vector3(1, 0, 0);
        } else if ("y" === axis) {
          axis = new THREE.Vector3(0, 1, 0);
        } else if ("z" === axis) {
          axis = new THREE.Vector3(0, 0, 1);
        } else {
          throw Error("Could not create animation, unknown axis: " + axis);
        }

        // Make sure rotation axis, camera and target are not collinear. Throw
        // an error if they are. This is the case when the cross product
        // between the axis and the vector from target to camera produces a
        // null vector.
        var tc = camera.position.clone().sub(target);
        if (tc.cross(axis).length() < 0.0001) {
          throw new CATMAID.ValueError("Could not create animation, both " +
              "camera and target are positioned on the rotation axis.");
        }

        animation.update = CATMAID.AnimationFactory.AxisRotation(camera,
            target, axis, speed, backAndForth, notify);
      } else if (options.type === "history") {
        if (!options.skeletons) {
          throw new CATMAID.ValueError("Need skeleton information for history animation");
        }
        if (!options.startDate) {
          throw new CATMAID.ValueError("Need start date information for " +
              "history animation");
        }
        if (!options.endDate) {
          throw new CATMAID.ValueError("Need end date information for " +
              "history animation");
        }
        if (!options.tickLength) {
          throw new CATMAID.ValueError("Need tick length information for " +
              "history animation");
        }
        if (!options.skeletonOptions) {
          throw new CATMAID.ValueError("Need skeleton options for " +
              "history animation");
        }
        animation.update = CATMAID.AnimationFactory.History(options.skeletons,
            options.startDate, options.endDate, options.tickLength,
            options.skeletonOptions, options.emptyBoutLength, notify);
      } else {
        throw Error("Could not create animation, don't know type: " +
            options.type);
      }

      // Add stop handler
      var stop = options.stop || false;
      animation.stop = function() {
        if (stop) {
          stop();
        }
      };

      return animation;
    },

  };

  /**
   * Rotate the camera around a particula axis through the the target position,
   * while keeping the same distance to it. Optionally, a rotation speed can be
   * passed. If back-and-forth mode is turned on, the rotation won't continue
   * after a full circle, but reverse direction. A notification function can be
   * passed in. It is called every full circle.
   */
  CATMAID.AnimationFactory.AxisRotation = function(camera, targetPosition, axis, rSpeed,
      backAndForth, notify)
  {
    // Counts the number of rotations done after initialization
    var numRotations = null;

    var targetDistance = camera.position.distanceTo(targetPosition);
    rSpeed = rSpeed || 0.01;
    backAndForth = backAndForth || false;

    // Start position for the rotation, relative to the target
    var startPosition = camera.position.clone().sub(targetPosition);

    let originalUp = camera.up.clone();
    let workingUp = new THREE.Vector3();

    var m = new THREE.Matrix4();

    // Return update function
    return function(t) {
      // Angle to rotate
      var rad = rSpeed * t;

      // Get current number of rotations
      var currentRotation = Math.floor(rad / (2 * Math.PI));
      if (currentRotation !== numRotations) {
        numRotations = currentRotation;
      }
      // Call notification function, if any
      let promiseNotify;
      if (notify) {
        promiseNotify = notify(currentRotation, t);
      }

      // In back and forth mode, movement direction is reversed once a full circle
      // is reached.
      if (backAndForth) {
        rad = (currentRotation % 2) === 0 ? rad : -rad;
      }

      // Set matrix to a rotation around a certain axis
      m.makeRotationAxis(axis, rad);

      // Rotate the camera around this axis by using a copy of the start position
      // (relative to target), rotating it and make it a world position by adding
      // it to the target.
      camera.position.copy(startPosition).applyMatrix4(m).add(targetPosition);
      // Prevent Three.js from trying to keep the camera facing up.
      workingUp.copy(originalUp);
      workingUp.applyMatrix4(m);
      camera.up.copy(workingUp);

      return promiseNotify;
    };
  };

  /**
   * Crate a history animation update function. It will make pars of the
   * available skeletons visible based on the tick count. It expects a history
   * of all visible skeletons as argument. Optionally, empty bouts can be
   * skipped if they exceed a specified number of minutes.
   */
  CATMAID.AnimationFactory.History = function(skeletons, startDate, endDate, tickLength,
        skeletonOptions, emptyBoutLength, notify) {
    var skeletonIds = Object.keys(skeletons);
    var startEpoch = startDate.getTime();

    // Calculate tick length in milliseconds: h * min * s * ms
    var msTickLength = tickLength * 60 * 60 * 1000;
    // Calculate the seconds in a skipped empty bout, if any.
    if (emptyBoutLength) {
      emptyBoutLength = emptyBoutLength * 60;
    }

    // Make basic properties accessible
    this.startDate = startDate;
    this.endDate = endDate;
    this.tickLength = tickLength;

    var currentDate = new Date(startEpoch);

    return function(t, options) {

      var ebl = emptyBoutLength;
      var noCache = false;

      if (options) {
        if (undefined !== emptyBoutLength) {
          ebl = options.emptyBoutLength;
        }
        if (undefined !== noCache) {
          noCache = options.noCache;
        }
      }

      // If empty bouts should be skipped, find the closest next change and
      // forward time to it if its farther away than the empty bout skip time.
      if (ebl) {
        var closestChange = null;
        for (var i=0; i < skeletonIds.length; ++i) {
          var skeleton = skeletons[skeletonIds[i]];
          var nextChange = skeleton.history.nextChange;
          if (nextChange) {
            if (null === closestChange || nextChange < closestChange) {
              closestChange = nextChange;
            }
          }
        }
        if (closestChange) {
          if (closestChange.getTime() - currentDate.getTime() > ebl) {
            currentDate.setTime(closestChange.getTime());
          }
        }
      }

      // Reload skeleton data for current point in time
      for (var i=0; i < skeletonIds.length; ++i) {
        var skeleton = skeletons[skeletonIds[i]];
        skeleton.resetToPointInTime(skeleton.skeletonmodel, skeletonOptions,
            currentDate, noCache);
        skeleton.show(skeletonOptions, currentDate);
      }

      currentDate.setTime(startEpoch + t * msTickLength);
      CATMAID.tools.callIfFn(notify, currentDate, startDate, endDate);
    };
  };

})(CATMAID);
