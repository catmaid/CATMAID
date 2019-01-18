/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  /**
   * The basic skeleton source implements the skeleton source interface and
   * maintains an ordered list of skeletons. Additionally, grouping of the
   * managed skeletons is possible.
   */
  var BasicSkeletonSource = function(name, options) {
    options = options || {};

    this.name = name;

    // Call super-constructor, which takes also care of registering this source
    // (if not disabled).
    var register = options.register === undefined ? true : options.register;
    CATMAID.SkeletonSource.call(this, register);

    this.skeletonModels = {};
    // Elements can be groups or single skeletons. A group is represented with
    // its name in here. If it is present as a field in the groups object, it is
    // a real group otherwise, it is treated as a skeleton ID.
    this.orderedElements = [];
    // A group maps a name to a list of skeleton IDs.
    this.groups = {};
    // Indicate if newly appended skeletons should be removed from existing
    // groups.
    this.moveExistingToNewGroup = options.moveExistingToNewGroup || true;
    // If set, the next skeletons appended are added to this group.
    this.nextGroupName = null;

    if (options.handleAddedModels) {
      this.handleAddedModels = options.handleAddedModels;
    }
    if (options.handleChangedModels) {
      this.handleChangedModels = options.handleChangedModels;
    }
    if (options.handleRemovedModels) {
      this.handleRemovedModels = options.handleRemovedModels;
    }

    // If an owner reference is provided, this source can be discovered as being
    // part of a widget.
    this.owner = CATMAID.tools.getDefined(options.owner, null);
  };

  BasicSkeletonSource.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  BasicSkeletonSource.prototype.constructor = BasicSkeletonSource;

  /* Implement SkeletonSource interface */

  /**
   * Get unique name of this dimension source.
   */
  BasicSkeletonSource.prototype.getName = function()
  {
    return this.name;
  };

  /**
   * Handle destruction of this skeleton source.
   */
  BasicSkeletonSource.prototype.destroy = function() {
    // Triggers also source removed event
    this.unregisterSource();
  };

  /**
   * Return whether or not groups exist in this source.
   */
  BasicSkeletonSource.prototype.hasGroups = function() {
    return !CATMAID.tools.isEmpty(this.groups);
  };

  /**
   * Append a list of skeleton models. If a model is already known, the stored
   * model is updated. If the appended skeletons should be added as a group, all
   * added skeletons that are already grouped will be removed from those groups.
   *
   * @param models {object} An object mapping skeleton IDs to skeleton models.
   */
  BasicSkeletonSource.prototype.append = function(models) {
    // Indicate if a new group should be created
    var createGroup = !!this.nextGroupName;
    // Get a number representation of all skeleton IDs
    var skeleton_ids = Object.keys(models).map(function(skid) {
      return parseInt(skid, 10);
    });
    // Remember created and updated models
    var created = {};
    var updated = {};
    for (var i=0; i<skeleton_ids.length; ++i) {
      var skid = skeleton_ids[i];

      // If a skeleton is known already, either continue or move it to the end
      // of the ordered list, if a group should be created and known skeletons
      // should be moved to the new group.
      if (skid in this.skeletonModels) {
        if (createGroup) {
          if (this.moveExistingToNewGroup) {
            var index = this.orderedElements.indexOf(skid);
            this.orderedElements.splice(index, 1);
          } else {
            skeleton_ids.splice(skeleton_ids.indexOf(skid), 1);
          }
        } else {
          // Update existing model and continue
          updated[skid] = this.skeletonModels[skid].set(models[skid]);
          continue;
        }
      }

      // Store a reference to the skeleton model
      var model = models[skid];
      this.skeletonModels[skid] = model.clone();
      created[skid] = model;

      // If no group should be created, add the ID of every added skeleton to
      // the group index, but don't create an entry in the groups object.
      if (!createGroup) this.orderedElements.push(skid);
    }

    if (createGroup) {
      // Add group if a new group was requested
      this.orderedElements.push(this.nextGroupName);
      this.groups[this.nextGroupName] = skeleton_ids;
    }

    if (!CATMAID.tools.isEmpty(created)) {
      this.handleAddedModels(created);
      this.trigger(this.EVENT_MODELS_ADDED, created);
    }
    if (!CATMAID.tools.isEmpty(updated)) {
      this.handleChangedModels(updated);
      this.trigger(this.EVENT_MODELS_CHANGED, updated);
    }
  };

  /**
   * Clear all references to skeletons.
   */
  BasicSkeletonSource.prototype.clear = function(sourceChain) {
    var removedModels = this.skeletonModels;
    this.skeletonModels = {};
    this.orderedElements = [];
    this.groups = {};
    if (!CATMAID.tools.isEmpty(removedModels)) {
      this.handleRemovedModels(removedModels);
      this.trigger(this.EVENT_MODELS_REMOVED, removedModels);
    }
  };

  /**
   * Remove all skeletons with the given IDs.
   *
   * @param skeletonIDs {Array<number>} The list of skeletons to remove
   */
  BasicSkeletonSource.prototype.removeSkeletons = function(skeletonIDs) {
    var removed = {};
    skeletonIDs.forEach(function(skid) {
      var nSkid = parseInt(skid, 10);
      // Remove models
      if (skid in this.skeletonModels) {
        removed[skid] = this.skeletonModels[skid];
        delete this.skeletonModels[skid];
      }
      // Remove from element index
      var groupIndex = this.orderedElements.indexOf(nSkid);
      if (-1 !== groupIndex) {
        this.orderedElements.splice(groupIndex, 1);
      }
      // Remove from groups
      for (var key in this.groups) {
        var index = this.groups[key].indexOf(nSkid);
        if (-1 !== index) {
          this.groups[key].splice(index, 1);
        }
      }
    }, this);

    if (!CATMAID.tools.isEmpty(removed)) {
      this.handleRemovedModels(removed);
      this.trigger(this.EVENT_MODELS_REMOVED, removed);
    }
  };

  /**
   * Update skeleton models and propagade this to the comple source chain.
   */
  BasicSkeletonSource.prototype.updateModels = function(models, sourceChain) {
    sourceChain = sourceChain || {};
    // break propagation loop
    if (sourceChain && (this in sourceChain)) {
      return;
    }
    // Add self to source chain
    sourceChain[this] = this;

    var updatedModels = {};
    var newModels = {};
    Object.keys(models).forEach(function(skid) {
      var model = models[skid];
      if (skid in this.skeletonModels) {
        var m = model.clone();
        this.skeletonModels[model.id] = m;
        updatedModels[m.id] = m;
      } else {
        newModels[skid] = model;
      }
    }, this);

    if (!CATMAID.tools.isEmpty(newModels)) {
      this.append(newModels);
    }

    if (!CATMAID.tools.isEmpty(updatedModels)) {
      this.handleChangedModels(updatedModels);
      this.trigger(this.EVENT_MODELS_CHANGED, updatedModels);
    }
  };

  /**
   * Return true if the given skeleton ID is known to this source. Otherwise,
   * return false. Same as has().
   *
   * @param skeletonID {number} The skeleton ID to test
   */
  BasicSkeletonSource.prototype.hasSkeleton = function(skeletonID) {
    return skeletonID in this.skeletonModels;
  };

  /**
   * Return true if the given skeleton ID is known to this source. Otherwise,
   * return false. Same as hasSkeleton().
   *
   * @param skeletonID {number} The skeleton ID to test
   */
  BasicSkeletonSource.prototype.has= function(skeletonID) {
    return skeletonID in this.skeletonModels;
  };

  /**
   * Get a single known skeleton model or undefined if unknown.
   */
  BasicSkeletonSource.prototype.get = function(skeletonID) {
    return this.skeletonModels[skeletonID];
  };


  /**
   * Return all known skeleton IDs. Override for more specific and actual
   * selection behavior.
   */
  BasicSkeletonSource.prototype.getSelectedSkeletons = function() {
    return this.orderedElements.reduce((function(l, id) {
      if (this.isGroup(id)) {
        l.push.apply(l, this.groups[id]);
      } else {
        l.push(id);
      }
      return l;
    }).bind(this), []);
  };

  /**
   * Return a single model for the passed in skeleton ID.
   */
  BasicSkeletonSource.prototype.getSkeletonModel = function(skeletonID) {
    if (this.has(skeletonID)) {
      return this.skeletonModels[skeletonID].clone();
    }
  };

  /**
   * Return models object for all known skeleton IDs. Override for more specific
   * and actual selection behavior.
   */
  BasicSkeletonSource.prototype.getSkeletonModels = function() {
    return this.orderedElements.reduce((function(m, id) {
      if (this.isGroup(id)) {
        this.groups[id].forEach(function(s) {
          m[s] = this.skeletonModels[s];
        }, this);
      } else {
        m[id] = this.skeletonModels[id].clone();
      }
      return m;
    }).bind(this), {});
  };

  /**
   * The default implementation of selected Skeleon just gets all skeletons.
   */
  BasicSkeletonSource.prototype.getSelectedSkeletonModels =
      BasicSkeletonSource.prototype.getSkeletonModels;

  /**
   * Highlighting is not implemented in this source since it is use case
   * specific.
   */
  BasicSkeletonSource.prototype.highlight = function() {};


  /* Non-interface methods */

  /**
   * Return the number of known skeletons, including skeletons in groups.
   */
  BasicSkeletonSource.prototype.getNumberOfSkeletons = function() {
    return this.orderedElements.reduce((function(n, id) {
      if (this.isGroup(id)) {
        return n + this.groups[id].length;
      } else {
        return n + 1;
      }
    }).bind(this), 0);
  };

  BasicSkeletonSource.prototype.appendAsGroup = function(models, groupName) {
    checkGroupName(this.groups, groupName);

    // Add the skeletons loaded next to the new group
    this.nextGroupName = groupName;
    this.append(models);
    this.nextGroupName = null;
  };

  BasicSkeletonSource.prototype.loadAsGroup = function(groupName, silent) {
    checkGroupName(this.groups, groupName);

    // Add the skeletons loaded next to the new group
    this.nextGroupName = groupName;
    this.loadSource(silent);
    this.nextGroupName = null;
  };

  /**
   * Returns true if the given name is the one of a group managed by this
   * source. False otherwise.
   */
  BasicSkeletonSource.prototype.isGroup = function(groupName) {
    return !!this.groups[groupName];
  };

  /**
   * Sort this skeleton source with the help of a compare function or by a
   * default sort order.
   */
  BasicSkeletonSource.prototype.sort = function(compareFunction) {
    // Sort only top-level elements on not the skeletons within the groups
    this.orderedElements.sort(compareFunction);
  };

  /**
   * Convenience functions that can be overridden by clients. They get called
   * when the equivalent events are fired. Implementation that re-use this as
   * prototype or standalone object can implement these methods to be not
   * required to listen to events.
   */
  BasicSkeletonSource.prototype.handleAddedModels = CATMAID.noop;
  BasicSkeletonSource.prototype.handleRemovedModels = CATMAID.noop;
  BasicSkeletonSource.prototype.handleChangedModels = CATMAID.noop;

  /**
   * Private function to test if a group name is valid.
   */
  var checkGroupName = function(groups, name) {
    if (!name) {
      throw CATMAID.ValueError("Please give a valid group name");
    }
    if (groups[name]) {
      throw CATMAID.ValueError("The group '" + name + "' exists already");
    }
  };

  // Make basic skeleton source available in CATMAID namespace
  CATMAID.BasicSkeletonSource = BasicSkeletonSource;

})(CATMAID);
