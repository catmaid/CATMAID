/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var SplitMergeDialog = function(options) {
    var model1 = options.model1;
    var model2 = options.model2;

    this.extension = options.extension;
    this.autoOrder = options.autoOrder === undefined ? true : !!options.autoOrder;

    // Split and merge handlers
    this.split = options.split;
    this.merge = options.merge;

    // Sampler handling
    this.samplerHandling = 'domain-end';

    // Whether or not swapping is enabled
    this.swapEnabled = true;

    // Models object
    this.models = {};
    this.models[model1.id] = model1;
    this.model1_id = model1.id;
    if (model2) {
      this.models[model2.id] = model2;
      this.model2_id = model2.id;
      this.in_merge_mode = true;
    } else {
      this.in_merge_mode = false;
      this.splitNodeId = options.splitNodeId;
      if (!this.splitNodeId) {
        CATMAID.error("Could not inititialize splitting dialog",
           "Please provide a split node ID!");
      }
    }
    // Basic dialog setup
    CATMAID.Confirmation3dDialog.call(this, {
      id: "skeleton-split-merge-dialog",
      title: this.in_merge_mode ? "Merge skeletons" : "Split skeletons",
      close: options.close,
    });
  };

  SplitMergeDialog.prototype = Object.create(CATMAID.Confirmation3dDialog.prototype);
  SplitMergeDialog.prototype.constructor = SplitMergeDialog;

  SplitMergeDialog.prototype.swapSkeletons = function() {
    if (!this.swapEnabled) {
      CATMAID.warn("Swapping is disabled");
      return;
    }
    this.close();

    var newDialog = new CATMAID.SplitMergeDialog({
      model1: this.models[this.under_model_id],
      model2: this.models[this.over_model_id],
      extension: this.extension,
      splitNodeId: this.splitNodeId,
      autoOrder: false,
      merge: this.merge,
      split: this.split
    });
    newDialog.onOK = this.onOK;
    newDialog.onCancel = this.onCancel;
    newDialog.show();
  };

  SplitMergeDialog.prototype.onSettingChanged = function(name, value) {
    if (name === 'show-inputs') {
      for (var m in this.models) {
        this.models[m].post_visible = value;
      }
    } else if (name === 'show-outputs') {
      for (var m in this.models) {
        this.models[m].pre_visible = value;
      }
    }
  };

  SplitMergeDialog.prototype.onOK = function() {
    if (this.in_merge_mode) {
      this.merge(this.over_model_id, this.under_model_id);
    } else {
      this.split();
    }
  };

  SplitMergeDialog.prototype.populate = function() {
    CATMAID.Confirmation3dDialog.prototype.populate.call(this);

    // Annotation list boxes using flex layout
    var titleBig = document.createElement('div'),
        titleSmall = document.createElement('div'),
        colorBig = document.createElement('div'),
        colorSmall = document.createElement('div'),
        big = document.createElement('div'),
        small = document.createElement('div'),
        contentBig = document.createElement('div'),
        contentSmall = document.createElement('div');

    big.setAttribute('id', 'split_merge_dialog_over_annotations');
    small.setAttribute('id', 'split_merge_dialog_under_annotations');

    // Style annotation list boxes
    big.setAttribute('multiple', 'multiple');
    small.setAttribute('multiple', 'multiple');

    // Annotation lists, grow them on resize
    big.style.overflowY = 'scroll';
    big.style.flexGrow = '1';

    small.style.overflowY = 'scroll';
    small.style.flexGrow = '1';

    // Color boxes
    colorBig.style.width = '5%';
    colorSmall.style.width = '5%';
    colorBig.style.marginRight = '1%';
    colorSmall.style.marginRight = '1%';
    colorBig.style.flexGrow = '1';
    colorSmall.style.flexGrow = '1';

    // Content boxes
    contentBig.style.flexGrow = '1';
    contentBig.style.display = 'flex';
    contentBig.style.flexDirection = 'column';
    contentBig.style.width = '94%';
    contentSmall.style.display = 'flex';
    contentSmall.style.flexGrow = '1';
    contentSmall.style.flexDirection = 'column';
    contentSmall.style.width = '94%';

    // Titles, no need to grow them on resize
    titleBig.style.fontStyle = 'italic';
    titleSmall.style.fontStyle = 'italic';

    // Layout left column
    var topContainer = document.createElement('div');
    var bottomContainer = document.createElement('div');
    topContainer.appendChild(colorBig);
    topContainer.appendChild(contentBig);
    contentBig.appendChild(titleBig);
    contentBig.appendChild(big);
    bottomContainer.appendChild(colorSmall);
    bottomContainer.appendChild(contentSmall);
    contentSmall.appendChild(titleSmall);
    contentSmall.appendChild(small);

    topContainer.style.display = 'flex';
    topContainer.style.flexDirection = 'row';
    topContainer.style.width = '100%';
    bottomContainer.style.display = 'flex';
    bottomContainer.style.flexDirection = 'row';
    bottomContainer.style.width = '100%';

    // Let both containers grow equally, but keep a marin between them
    topContainer.style.marginBottom = '1%';
    topContainer.style.flexGrow = '1';
    bottomContainer.style.flexGrow = '1';

    this.controlPanel.style.display = 'flex';
    this.controlPanel.style.flexDirection = 'column';
    this.controlPanel.appendChild(topContainer);
    this.controlPanel.appendChild(bottomContainer);

    var create_labeled_checkbox = function(annotation, annotator, checked, disabled, label) {
      var cb_label = document.createElement('label');
      cb_label.style.cssFloat = 'left';
      cb_label.style.clear = 'left';
      var cb = document.createElement('input');
      cb.checked = checked;
      cb.disabled = disabled;
      cb.setAttribute('class', 'split_skeleton_annotation');
      cb.setAttribute('annotation', annotation);
      cb.setAttribute('annotator', annotator);
      cb.setAttribute('type', 'checkbox');
      cb_label.appendChild(cb);
      // There should only be one user who has used this annotation
      // with the current neuron.
      cb_label.appendChild(document.createTextNode(label));

      return cb_label;
    };

    // Get all annotations for a skeleton and fill the list boxes
    var add_annotations_fn = function(skid, listboxes, disable_unpermitted) {
      CATMAID.Annotations.forSkeleton(project.id, skid).then(function(annotations) {
            // Create annotation check boxes
            annotations.forEach(function(aobj) {
              var create_cb = function(a_info, checked) {
                var disabled = false;
                // The front end shouldn't allow the removal of annotations one
                // hasn't permissions on in merge mode: If the current user has no
                // permission to change this annotation, check and disable this
                // checkbox.
                if (disable_unpermitted &&
                    a_info.users[0].id != CATMAID.session.userid &&
                    !CATMAID.hasPermissionOnUser(a_info.users[0].name) &&
                    !CATMAID.session.is_superuser) {
                  checked = true;
                  disabled = true;
                }
                return create_labeled_checkbox(a_info.name, a_info.users[0].id,
                    checked, disabled, a_info.name + ' (by ' + a_info.users[0].name + ')');
              };
              listboxes.forEach(function(lb) {
                lb.obj.appendChild(create_cb(aobj, lb.checked));
              });
            });
            // If there is no annotation, add a note
            var numAnnotations = listboxes.reduce(function(count, lb) {
              return count + lb.obj.childElementCount;
            }, 0);
            if (0 === numAnnotations) {
              var msg = "no annotations found";
              listboxes.forEach(function(lb) {
                lb.obj.appendChild(document.createTextNode(msg));
              });
            }
          }).catch(CATMAID.handleError);
      };

    // Activate downstream shading in split mode
    if (!this.in_merge_mode) {
      this.webglapp.options.shading_method = 'active_node_split';
    }

    // Add skeletons and do things depending on the success of this in a
    // callback function.
    this.webglapp.addSkeletons(this.models, (function() {
      if (this.in_merge_mode) {
        var skeleton = this.webglapp.space.content.skeletons[this.model1_id],
            skeleton2 = this.webglapp.space.content.skeletons[this.model2_id],
            arbor1 = skeleton.createArbor(),
            arbor2 = skeleton2.createArbor(),
            length1 = arbor1.cableLength(skeleton.getPositions()),
            length2 = arbor2.cableLength(skeleton2.getPositions()),
            over_length, under_length, over_skeleton, under_skeleton,
            losingNodeCount, winningNodeCount;

        var keepOrder = length1 >= length2 || !this.autoOrder;

        // Find larger skeleton
        if (keepOrder) {
          this.over_model_id = this.model1_id;
          this.under_model_id = this.model2_id;
          over_length = length1;
          under_length = length2;
          over_skeleton = skeleton;
          under_skeleton = skeleton2;
          losingNodeCount = arbor2.countNodes();
          winningNodeCount = arbor1.countNodes();
        } else {
          this.over_model_id = this.model2_id;
          this.under_model_id = this.model1_id;
          over_length = length2;
          under_length = length1;
          over_skeleton = skeleton2;
          under_skeleton = skeleton;
          losingNodeCount = arbor1.countNodes();
          winningNodeCount = arbor2.countNodes();
        }

        var winningModel = this.models[this.over_model_id];
        var losingModel = this.models[this.under_model_id];

        var winningColor = new THREE.Color(1, 1, 0);
        var losingColor = new THREE.Color(1, 0, 1);

        winningModel.color.copy(winningColor);
        losingModel.color.copy(losingColor);
        this.webglapp.addSkeletons(this.models)
            .then((function() {
              this.webglapp.render();
            }).bind(this));

        var title = 'Merge skeleton "' + losingModel.baseName +
          '" into "' + winningModel.baseName + '"';
        $(this.dialog).dialog('option', 'title', title);

        // Update titles and name winning model first
        titleBig.appendChild(document.createTextNode(Math.round(over_length) +
            "nm cable in winning skeleton"));
        titleBig.setAttribute('title', winningModel.baseName + ' (' + winningNodeCount + ' nodes)');
        titleSmall.appendChild(document.createTextNode(Math.round(under_length) +
            "nm cable in losing skeleton"));
        titleSmall.setAttribute('title', losingModel.baseName + ' (' + losingNodeCount + ' nodes)');
        // Color the small and big title boxes
        colorBig.style.backgroundColor = winningColor.getStyle();
        colorSmall.style.backgroundColor = losingColor.getStyle();
        // Add annotation for name of neuron that gets joined into the other (i.e.
        // add name of model 2 to model 1). Don't check it, if it is named in the
        // default pattern "neuron 123456".
        var checked = (null === losingModel.baseName.match(/[Nn]euron \d+/));
        var cb = create_labeled_checkbox(losingModel.baseName,
            CATMAID.session.userid, checked, false,
            losingModel.baseName + " (reference to merged in neuron)");
        big.appendChild(cb, checked);
        // Add annotations
        add_annotations_fn(this.over_model_id, [{obj: big, checked: true}], true);
        add_annotations_fn(this.under_model_id, [{obj: small, checked: true}], true);
      } else {
        var skeleton = this.webglapp.space.content.skeletons[this.model1_id],
            arbor = skeleton.createArbor(),
            positions = skeleton.getPositions();

        // In case the split node is virtual, creeate an artificial node in the
        // arbor data structure to measure each segment's length.
        if (!SkeletonAnnotations.isRealNode(this.splitNodeId)) {
          var childId = SkeletonAnnotations.getChildOfVirtualNode(this.splitNodeId);
          var parentId = SkeletonAnnotations.getParentOfVirtualNode(this.splitNodeId);
          var x = Number(SkeletonAnnotations.getXOfVirtualNode(this.splitNodeId));
          var y = Number(SkeletonAnnotations.getYOfVirtualNode(this.splitNodeId));
          var z = Number(SkeletonAnnotations.getZOfVirtualNode(this.splitNodeId));
          var currentParentId = arbor.edges[childId];
          arbor.edges[childId] = this.splitNodeId;
          arbor.edges[this.splitNodeId] = currentParentId;
          positions[this.splitNodeId] = new THREE.Vector3(x, y, z);
        }

        var newArbor = arbor.subArbor(this.splitNodeId),
            length1 = newArbor.cableLength(positions),
            length2 = arbor.cableLength(positions) - length1,
            nodeCount1 = newArbor.countNodes(),
            nodeCount2 = arbor.countNodes() - nodeCount1,
            over_length, under_length,
            model_name = this.models[this.model1_id].baseName;
        this.upstream_is_small = length1 > length2;

        if (this.upstream_is_small) {
          over_length = length1;
          under_length = length2;
          titleBig.setAttribute('title', "New (" + nodeCount1 + ' nodes)');
          titleSmall.setAttribute('title', model_name + ' (' + nodeCount2 + ' nodes');
        } else {
          over_length = length2;
          under_length = length1;
          titleBig.setAttribute('title', model_name + ' (' + nodeCount2 + ' nodes)');
          titleSmall.setAttribute('title', "New" + ' (' + nodeCount1 + ' nodes)');
        }
        // Update dialog title
        var title = 'Split skeleton "' + model_name + '"';
        var $dialog = $(this.dialog).dialog('option', 'title', title);

        // Add select-all checkoxes for annotations
        var selectAllBig = colorBig.appendChild(document.createElement('input'));
        selectAllBig.style.margin = '5%';
        selectAllBig.setAttribute('type', 'checkbox');
        selectAllBig.setAttribute('checked', 'true');
        selectAllBig.setAttribute('title', 'Toggle annotations of remaining skeleton');
        selectAllBig.onchange = function() {
          $('input[type=checkbox]', contentBig).prop('checked', this.checked);
        };
        var selectAllSmall = colorSmall.appendChild(document.createElement('input'));
        selectAllSmall.style.margin = '5%';
        selectAllSmall.setAttribute('type', 'checkbox');
        selectAllBig.setAttribute('title', 'Toggle annotations of new skeleton');
        selectAllSmall.onchange = function() {
          $('input[type=checkbox]', contentSmall).prop('checked', this.checked);
        };

        // Add titles
        titleBig.appendChild(document.createTextNode(Math.round(over_length) +
              "nm cable in remaining skeleton"));
        titleSmall.appendChild(document.createTextNode(Math.round(under_length) +
              "nm cable in new skeleton"));
        // Color the small and big title boxes
        colorBig.style.backgroundColor = '#' + skeleton.getActorColorAsHTMLHex();
        var bc = this.webglapp.getSkeletonColor(this.model1_id);
        // Convert the big arbor color to 8 bit and weight it by 0.5. Since the 3D
        // viewer multiplies this weight by 0.9 and adds 0.1, we do the same.
        var sc_8bit = [bc.r, bc.g, bc.b].map(function(c) {
          return parseInt(c * 255 * 0.55);
        });
        colorSmall.style.backgroundColor = 'rgb(' + sc_8bit.join()  + ')';
        // Add annotations
        add_annotations_fn(this.model1_id,
            [{obj: big, checked: true}, {obj: small, checked: false}], false);
      }

      // Extend skeletons: Unfortunately, it is not possible right now to add new
      // points to existing meshes in THREE. Therefore, a new line is created.
      if (this.extension) {
        for (var modelId in this.extension) {
          var pairs = this.extension[modelId];
          if (pairs) {
            // Create new line representing interpolated link
            var geometry = new THREE.Geometry();
            pairs.forEach(function(v) {
              geometry.vertices.push(v.clone());
            }, this);
            var material = new THREE.LineBasicMaterial({
              color: 0x00ff00,
              linewidth: 3,
            });
            skeleton.space.add(new THREE.LineSegments(geometry, material));
            // Update view
            skeleton.space.render();
          }
        }
      }

      this.webglapp.render();

      // If there is a sampler associated with this skeleton, ask the user for
      // confirmation.
      if (this.in_merge_mode) {
        CATMAID.Skeletons.getAllSamplerCounts(project.id, [this.model1_id, this.model2_id])
          .then((function(samplerCounts) {
            // Only ask for user action if there is a sampler in either of the
            // merge partners.
            let samplerCount1 = samplerCounts[this.model1_id];
            let samplerCount2 = samplerCounts[this.model2_id];
            if (samplerCount1 > 0 || samplerCount2 > 0) {
              let self = this;
              // Swapping is for now not allowed when a sampler is merged.
              this.swapEnabled = false;
              // Check if the merged in fragment has linked samplers, if so show
              // dialog that asks for user action. Check if the target node for
              // the merge is part of a sampler domain. If so, ask for user
              // action. If the merged-in fragment has no sampler and the target
              // node is not part of a sampler domain, no user action is needed.
              let buttons = {};
              if (samplerCount1 > 0) {
                //buttons['New intervals'] = self.setSamplerHandling.bind(self, 'create-intervals');
                buttons['Branch'] = self.setSamplerHandling.bind(self, 'branch');
                buttons['Domain end'] = self.setSamplerHandling.bind(self, 'domain-end');
                buttons['New domain'] = self.setSamplerHandling.bind(self, 'new-domain');
              }

              buttons['Cancel'] = function() {
                // Close dialog
                self.close();
              };

              let dialog = new CATMAID.OptionsDialog("Sampler update needed", buttons);

              let samplerNoun1 = samplerCount1 === 1 ? " sampler" : " samplers";
              let samplerNoun2 = samplerCount2 === 1 ? " sampler" : " samplers";
              if (samplerCount1 > 0) {
                dialog.appendMessage("The active skeleton is currentely used in " +
                    samplerCount1 + samplerNoun1 + ". There are multiple options " +
                    "for how to handle this in a merge operation. In each " +
                    "case, no swap operation is allowed and the sampled " +
                    "skeleton will remain the \"winner\" of the merge to avoid a " +
                    "re-rooting operation. If the fragment is merged outside of a " +
                    "domain, the selected option has no effect.");

                if (samplerCount2 > 0) {
                  dialog.appendMessage("The merged-in fragment is used in " + samplerCount2 +
                      "reconstruction " + samplerNoun2 + ". All samplers on " +
                      "merged-in fragments will be deleted.");
                } else {
                  dialog.appendMessage("The merged-in fragment isn't used in any sampler.");
                }

                //dialog.appendHTML("<em>1. New intervals:</em> Extend domain and add intervals.");
                dialog.appendHTML("<em>1. Branch:</em> Add nodes as traced out branch to existing interval.");
                dialog.appendHTML("<em>2. Domain end:</em> End existing domain where fragment starts.");
                dialog.appendHTML("<em>3. New domain:</em> Create a new domain for the merged in fragment.");
              } else {
                dialog.appendMessage("While the active skeleton isn't used in a " +
                    "sampler, the merged-in fragment is used in " + samplerCount2 +
                    "reconstruction " + samplerNoun2 + ". All samplers on " +
                    "merged-in fragments will be deleted.");
              }

              dialog.show(550, 'auto', true);
            }
          }).bind(this))
          .catch(CATMAID.handleError);
      } else {
        CATMAID.Skeletons.getSamplerCount(project.id, this.model1_id)
          .then((function(samplerCount) {
            if (samplerCount > 0) {
              let samplerNoun = samplerCount > 1 ? " samplers" : " sampler";
              if (!confirm("This skeleton has " + samplerCount +
                  samplerNoun + " linked. A split will remove sampler " +
                  "information from split-off fragments. Continue?")) {
                // Close dialog
                this.close();
              }
            }
          }).bind(this))
          .catch(CATMAID.handleError);
      }
    }).bind(this));

    var self = this;
    var firstButton = this.customOptions.firstChild;

    if (this.in_merge_mode) {
      var switchButton = document.createElement('button');
      switchButton.setAttribute('class', 'ui-button');
      switchButton.classList.add('ui-button', 'ui-corner-all',
        'ui-state-default', 'ui-widget', 'ui-button-text-only');
      var switchButtonLabel = switchButton.appendChild(document.createElement('span'));
      switchButtonLabel.classList.add('ui-button-text');
      switchButtonLabel.appendChild(document.createTextNode('Swap'));
      switchButton.onclick = this.swapSkeletons.bind(this);

      // Add as first button
      if (firstButton) {
        this.customOptions.insertBefore(switchButton, firstButton);
      } else {
        this.customOptions.appendChild(switchButton);
      }
    }

    return this;
  };

  SplitMergeDialog.prototype.setSamplerHandling = function(samplerHandling) {
    this.samplerHandling = samplerHandling;
    $(this.dialog.parentNode).find('span.ui-dialog-title:first')
        .append($('<span />').append(' using sampler handling "' + samplerHandling + '"'));
  };

  SplitMergeDialog.prototype.get_annotation_set = function(over) {
    var tag = over ? 'over' : 'under';
    var over_checkboxes = $(this.dialog).find('#split_merge_dialog_' +
        tag + '_annotations input[type=checkbox]').toArray();
    var annotations = over_checkboxes.reduce(function(o, cb) {
      // Create a list of objects, containing each the annotation an its
      // annotator ID.
      if (cb.checked) {
        o[$(cb).attr('annotation')] = parseInt($(cb).attr('annotator'));
      }
      return o;
    }, {});

    return annotations;
  };

  SplitMergeDialog.prototype.get_over_annotation_set = function() {
    return this.get_annotation_set(true);
  };

  SplitMergeDialog.prototype.get_under_annotation_set = function() {
    return this.get_annotation_set(false);
  };

  SplitMergeDialog.prototype.get_combined_annotation_set = function() {
    // Get both annotation sets
    var over_set = this.get_over_annotation_set();
    var under_set = this.get_under_annotation_set();
    // Combine both, avoid duplicates
    var combined_set = over_set;
    for (var a in under_set) {
      if (combined_set.hasOwnProperty(a)) {
        continue;
      }
      combined_set[a] = under_set[a];
    }

    return combined_set;
  };

  /**
   * The annotation distribution for a split is only valid if one part keeps the
   * whole set of annotations. This test verifies this agains the cached list of
   * annotations. One part keeps all annotations if all its checkboxes are
   * checked.
   */
  SplitMergeDialog.prototype.check_split_annotations = function() {
    // Define a test function every checkbox should be tested against
    var checked_test = function(cb) {
      return cb.checked;
    };
    // Test over annotation set
    var $over_checkboxes = $(this.dialog).find(
        '#split_merge_dialog_over_annotations input[type=checkbox]');
    if ($over_checkboxes.toArray().every(checked_test)) {
      return true;
    }
    // Test under annotation set
    var $under_checkboxes = $(this.dialog).find(
        '#split_merge_dialog_under_annotations input[type=checkbox]');
    if ($under_checkboxes.toArray().every(checked_test)) {
      return true;
    }

    return false;
  };

  SplitMergeDialog.prototype.check_merge_annotations = function() {
    // At the moment, all combinations of annotations (even selecting none!) are
    // allowed. If a user is shown the dialog, (s)he can do whatever (s)he wants.
    return true;
  };

  SplitMergeDialog.prototype.confirm = function() {
    var confirmed = true;
    if (self.in_merge_mode && !self.check_merge_annotations()) {
      CATMAID.warn("The selected annotation configuration isn't valid. " +
          "No annotation can be lost.");
      confirmed = confirmed && false;
    } else if (!this.in_merge_mode && !this.check_split_annotations()) {
      CATMAID.warn("The selected annotation configuration isn't valid. " +
          "One part has to keep all annotations.");
      confirmed = confirmed && false;
    }
    return confirmed;
  };

  // Make split/merge dialog available in CATMAID namespace
  CATMAID.SplitMergeDialog = SplitMergeDialog;

})(CATMAID);
