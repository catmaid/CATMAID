/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  /**
   * The basic skeleton source implements the skeleton source interface and
   * maintains an ordered list of skeletons. Additionally, grouping of the
   * managed skeletons is possible.
   */
  var BasicSkeletonSource = function(name) {
    this.name = name;
    this.registerSource();
    this.skeletonModels = {};
    // Elements can be groups or single skeletons. A group is represented with
    // its name in here. If it is present as a field in the groups object, it is
    // a real group otherwise, it is treated as a skeleton ID.
    this.orderedElements = [];
    // A group maps a name to a list of skeleton IDs.
    this.groups = {};
    // Indicate if newly appended skeletons should be removed from existing
    // groups.
    this.moveExistingToNewGroup = true;
    // If set, the next skeletons appended are added to this group.
    this.nextGroupName = null;
  };

  BasicSkeletonSource.prototype = new CATMAID.SkeletonSource();

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
    this.unregisterSource();
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
          this.skeletonModels[skid] = models[skid];
          continue;
        }
      }

      // Store a reference to the skeleton model
      this.skeletonModels[skid] = models[skid];

      // If no group should be created, add the ID of every added skeleton to
      // the group index, but don't create an entry in the groups object.
      if (!createGroup) this.orderedElements.push(skid);
    }

    if (createGroup) {
      // Add group if a new group was requested
      this.orderedElements.push(this.nextGroupName);
      this.groups[this.nextGroupName] = skeleton_ids;
    }

    this.updateLink(models);
  };

  /**
   * Clear all references to skeletons.
   */
  BasicSkeletonSource.prototype.clear = function(sourceChain) {
    this.skeletonModels = {};
    this.orderedElements = [];
    this.groups = {};
    // Clear link target, if any
    this.clearLink(sourceChain);
  };

  /**
   * Remove all skeletons with the given IDs.
   *
   * @param skeletonIDs {Array<number>} The list of skeletons to remove
   */
  BasicSkeletonSource.prototype.removeSkeletons = function(skeletonIDs) {
    skeletonIDs.forEach(function(skid) {
      var nSkid = parseInt(skid, 10);
      // Remove models
      if (skid in this.skeletonModels) {
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

    // Remove skeletons from link target, if any
    if (this.linkTarget) {
      // Prevent propagation loop by checking if the target has the skeletons anymore
      if (skeletonIDs.some(this.linkTarget.hasSkeleton, this.linkTarget)) {
        this.linkTarget.removeSkeletons(skeletonIDs);
      }
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

    var newModels = {};
    Object.keys(models).forEach(function(skid) {
      var model = models[skid];
      if (skid in this.skeletonModels) {
        this.skeletonModels[model.id] = model.clone();
      } else {
        newModels[skid] = model;
      }
    }, this);

    if (Object.keys(newModels).length > 0) {
      this.append(newModels);
    }

    this.updateLink(models, sourceChain);
  };

  /**
   * Return true if the given skeleton ID is known to this source. Otherwise,
   * return false.
   *
   * @param skeletonID {number} The skeleton ID to test
   */
  BasicSkeletonSource.prototype.hasSkeleton = function(skeletonID) {
    return skeletonID in this.skeletonModels;
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
   * Return models object for all known skeleton IDs. Override for more specific
   * and actual selection behavior.
   */
  BasicSkeletonSource.prototype.getSelectedSkeletonModels = function() {
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

  BasicSkeletonSource.prototype.loadAsGroup = function(groupName) {
    checkGroupName(this.groups, groupName);

    // Add the skeletons loaded next to the new group
    this.nextGroupName = groupName;
    this.loadSource();
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
