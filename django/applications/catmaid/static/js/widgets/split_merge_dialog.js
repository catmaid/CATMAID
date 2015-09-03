/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var SplitMergeDialog = function(options) {
    var model1 = options.model1;
    var model2 = options.model2;

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
    this.dialog = document.createElement('div');
    this.dialog.setAttribute("id", "skeleton-split-merge-dialog");
    if (this.in_merge_mode) {
      this.dialog.setAttribute("title", "Merge skeletons");
    } else {
      this.dialog.setAttribute("title", "Split skeleton");
    }
    // Dialog dimensions
    this.width = parseInt(CATMAID.UI.getFrameWidth() * 0.8);
    this.height = parseInt(CATMAID.UI.getFrameHeight() * 0.8);
  };

  SplitMergeDialog.prototype = {};

  SplitMergeDialog.prototype.populate = function(extension) {
    var usable_height = this.height - 100;
    // Annotation list boxes
    var titleBig = document.createElement('div'),
        titleSmall = document.createElement('div'),
        colorBig = document.createElement('div'),
        colorSmall = document.createElement('div'),
        big = document.createElement('div'),
        small = document.createElement('div');

    big.setAttribute('id', 'split_merge_dialog_over_annotations');
    small.setAttribute('id', 'split_merge_dialog_under_annotations');

    // Style annotation list boxes
    big.setAttribute('multiple', 'multiple');
    small.setAttribute('multiple', 'multiple');

    big.style.width = '95%';
    big.style.height = usable_height * 0.45 + 'px';
    big.style.overflowY = 'scroll';
    big.style.marginBottom = usable_height * 0.05 + 'px';
    small.style.width = '95%';
    small.style.height = usable_height * 0.45 + 'px';
    small.style.overflowY = 'scroll';

    // Color boxes
    colorBig.style.width = '3%';
    colorBig.style.height = big.style.height;
    colorBig.style.cssFloat = 'left';
    colorBig.style.marginRight = '0.3em';
    colorSmall.style.width = '3%';
    colorSmall.style.height = small.style.height;
    colorSmall.style.cssFloat = 'left';
    colorSmall.style.marginRight = '0.3em';

    titleBig.style.padding = '0.1em';
    titleSmall.style.padding = '0.1em';

    var left = document.createElement('div'),
        right = document.createElement('div'),
        leftWidth = 250;

    // Position columns
    left.style.cssFloat = 'left';
    left.style.width = leftWidth + 'px';
    right.style.cssFloat = 'right';

    right.setAttribute('id', 'dialog-3d-view');
    right.style.backgroundColor = "#000000";

    // Layout left column
    left.appendChild(titleBig);
    left.appendChild(colorBig);
    left.appendChild(big);
    left.appendChild(colorSmall);
    left.appendChild(small);
    left.appendChild(titleSmall);

    this.dialog.appendChild(left);
    this.dialog.appendChild(right);

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
      CATMAID.retrieve_annotations_for_skeleton(skid,
          function(annotations) {
            // Create annotation check boxes
            annotations.forEach(function(aobj) {
              var create_cb = function(a_info, checked) {
                var disabled = false;
                // The front end shouldn't allow the removal of annotations one
                // hasn't permissions on in merge mode: If the current user has no
                // permission to change this annotation, check and disable this
                // checkbox.
                if (disable_unpermitted &&
                    a_info.users[0].id != session.userid &&
                    user_groups.indexOf(a_info.users[0].name) == -1 &&
                    !session.is_superuser) {
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
          });
      };

    // Create a 3D View that is not a SkeletonSource neither in an instance registry
    var W = function() {};
    W.prototype = CATMAID.WebGLApplication.prototype;
    this.webglapp = new W();
    this.webglapp.init(this.width - leftWidth - 50, usable_height,
        'dialog-3d-view'); // add to the right
    // Activate downstream shading in split mode
    if (!this.in_merge_mode) {
      this.webglapp.options.shading_method = 'active_node_split';
    }
    this.webglapp.look_at_active_node();
    // Add skeletons and do things depending on the success of this in a
    // callback function.
    this.webglapp.addSkeletons(this.models, (function() {
      if (this.in_merge_mode) {
        var skeleton = this.webglapp.space.content.skeletons[this.model1_id],
            skeleton2 = this.webglapp.space.content.skeletons[this.model2_id],
            count1 = skeleton.createArbor().countNodes(),
            count2 = skeleton2.createArbor().countNodes(),
            over_count, under_count, over_skeleton, under_skeleton;

        // Source and target don't change with size
        var title = 'Merge skeleton "' + this.models[this.model2_id].baseName +
          '" into "' + this.models[this.model1_id].baseName + '"';

        $(this.dialog).dialog('option', 'title', title);
        // Find larger skeleton
        if (count1 > count2) {
          this.over_model_id = this.model1_id;
          this.under_model_id = this.model2_id;
          over_count = count1;
          under_count = count2;
          over_skeleton = skeleton;
          under_skeleton = skeleton2;
        } else {
          this.over_model_id = this.model2_id;
          this.under_model_id = this.model1_id;
          over_count = count2;
          under_count = count1;
          over_skeleton = skeleton2;
          under_skeleton = skeleton;
        }
        // Update titles and name over count model first
        var over_name = this.models[this.over_model_id].baseName;
        var under_name = this.models[this.under_model_id].baseName;
        titleBig.appendChild(document.createTextNode(over_count + " nodes"));
        titleBig.setAttribute('title', over_name);
        titleSmall.appendChild(document.createTextNode(under_count + " nodes"));
        titleSmall.setAttribute('title', under_name);
        // Color the small and big node count boxes
        colorBig.style.backgroundColor = '#' + over_skeleton.getActorColorAsHTMLHex();
        colorSmall.style.backgroundColor = '#' + under_skeleton.getActorColorAsHTMLHex();
        // Add annotation for name of neuron that gets joined into the other (i.e.
        // add name of model 2 to model 1). Don't check it, if it is named in the
        // default pattern "neuron 123456".
        var name = this.models[this.model2_id].baseName;
        var checked = (null === name.match(/neuron \d+/));
        var cb = create_labeled_checkbox(name, session.userid, checked, false,
            name + " (reference to merged in neuron)");
        if (count1 > count2) {
          big.appendChild(cb, checked);
        } else {
          small.appendChild(cb, checked);
        }
        // Add annotations
        add_annotations_fn(this.over_model_id, [{obj: big, checked: true}], true);
        add_annotations_fn(this.under_model_id, [{obj: small, checked: true}], true);
      } else {
        var skeleton = this.webglapp.space.content.skeletons[this.model1_id],
            arbor = skeleton.createArbor(),
            count1 = arbor.subArbor(this.splitNodeId).countNodes(),
            count2 = arbor.countNodes() - count1,
            over_count, under_count,
            model_name = this.models[this.model1_id].baseName;
        this.upstream_is_small = count1 > count2;
        if (this.upstream_is_small) {
          over_count = count1;
          under_count = count2;
          titleBig.setAttribute('title', "New");
          titleSmall.setAttribute('title', model_name);
        } else {
          over_count = count2;
          under_count = count1;
          titleBig.setAttribute('title', model_name);
          titleSmall.setAttribute('title', "New");
        }
        // Update dialog title
        var title = 'Split skeleton "' + model_name + '"';
        $(this.dialog).dialog('option', 'title', title);
        // Add titles
        titleBig.appendChild(document.createTextNode(over_count + " nodes"));
        titleSmall.appendChild(document.createTextNode(under_count + " nodes"));
        // Color the small and big node count boxes
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
      if (extension) {
        var pairs = extension[this.model1_id];
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
          skeleton.space.add(new THREE.Line(geometry, material, THREE.LinePieces));
          // Update view
          skeleton.space.render();
        }
      }
    }).bind(this));

    var self = this;
    // Create controls and handlers for 3d viewer settings
    var customOptions = document.createElement('div');
    customOptions.setAttribute('class', 'ui-dialog-extra-buttonset');

    var showInputsCb = document.createElement('input');
    showInputsCb.setAttribute('type', 'checkbox');
    showInputsCb.setAttribute('class', 'ui-button');
    showInputsCb.checked = true;
    showInputsCb.onchange = function() {
      for (var m in self.models) {
        self.models[m].post_visible = this.checked;
      }
      self.webglapp.updateModels(self.models);
    };
    var showInputs = document.createElement('label');
    showInputs.appendChild(showInputsCb);
    showInputs.appendChild(document.createTextNode('Show inputs'));
    customOptions.appendChild(showInputs);

    var showOutputsCb = document.createElement('input');
    showOutputsCb.setAttribute('type', 'checkbox');
    showOutputsCb.setAttribute('class', 'ui-button');
    showOutputsCb.checked = true;
    showOutputsCb.onchange = function() {
      for (var m in self.models) {
        self.models[m].pre_visible = this.checked;
      }
      self.webglapp.updateModels(self.models);
    };
    var showOutputs = document.createElement('label');
    showOutputs.appendChild(showOutputsCb);
    showOutputs.appendChild(document.createTextNode('Show outputs'));
    customOptions.appendChild(showOutputs);

    var strahlerShadingCb = document.createElement('input');
    strahlerShadingCb.setAttribute('type', 'checkbox');
    strahlerShadingCb.setAttribute('class', 'ui-button');
    strahlerShadingCb.checked = false;
    strahlerShadingCb.onchange = function() {
      var shading = this.checked ? 'strahler' :'active_node_split';
      self.webglapp.options.shading_method = shading;
      self.webglapp.updateSkeletonColors();
    };
    var strahlerShading = document.createElement('label');
    strahlerShading.appendChild(strahlerShadingCb);
    strahlerShading.appendChild(document.createTextNode('Strahler index shading'));
    customOptions.appendChild(strahlerShading);

    // Add extra options to the button pane
    $(".ui-dialog-buttonpane", this.dialog.parent).prepend(customOptions);

    return this;
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

  SplitMergeDialog.prototype.show = function(extension) {
    var self = this;
    $(this.dialog).dialog({
      width: self.width,
      height: self.height,
      modal: true,
      close: function(ev, ui) {
        if (self.webglapp) {
          self.webglapp.destroy();
        }
        $(this).dialog("destroy");
      },
      buttons: {
        "Cancel": function() {
          $(this).dialog("close");
          if (self.onCancel) self.onCancel();
        },
        "OK": function() {
          if (self.in_merge_mode && !self.check_merge_annotations()) {
            alert("The selected annotation configuration isn't valid. " +
                "No annotation can be lost.");
          } else if (!self.in_merge_mode && !self.check_split_annotations()) {
            alert("The selected annotation configuration isn't valid. " +
                "One part has to keep all annotations.");
          } else {
            $(this).dialog("close");
            if (self.onOK) self.onOK();
          }
        }
      }
    });

    // The dialog is populated after creation, since the 3D viewer expects
    // elements to be added to the DOM.
    this.populate(extension);
  };

  // Make split/merge dialog available in CATMAID namespace
  CATMAID.SplitMergeDialog = SplitMergeDialog;

})(CATMAID);
