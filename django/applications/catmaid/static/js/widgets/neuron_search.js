/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  checkPermission,
  InstanceRegistry,
  project,
  requestQueue,
  WindowMaker
*/

(function(CATMAID) {

  "use strict";

  var NeuronAnnotations = function()
  {
    this.widgetID = this.registerInstance();
    this.registerSource();

    this.nextFieldID = 1;    // unique ID for annotation fields added by the "+" button
    // Results of main and sub queries. The main query will be index 0,
    // sub-queries will take the next free slot.
    this.queryResults = [];
    // Map expanded entities to a query result index
    this.expansions = new Map();
    // Map entity IDs to entities
    this.entityMap = {};

    this.entity_selection_map = {};
    this.pid = project.id;

    // Limit the result set
    this.display_length = 50;
    this.display_start = 0;
    this.total_n_results = 0;

    // Indicate if annotations should be displayed
    this.displayAnnotations = false;
    // Set a user ID to show only annotations of specific users
    this.annotationUserFilter = null;

    // Listen to annotation change events to update self when needed
    CATMAID.Annotations.on(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
        this.handleAnnotationUpdate, this);
  };

  NeuronAnnotations.prototype = {};
  $.extend(NeuronAnnotations.prototype, new InstanceRegistry());
  $.extend(NeuronAnnotations.prototype, new CATMAID.SkeletonSource());

  /* Implement interfaces */

  NeuronAnnotations.prototype.getName = function()
  {
      return "Neuron Search " + this.widgetID;
  };

  NeuronAnnotations.prototype.destroy = function()
  {
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
    CATMAID.Annotations.off(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
        this.handleAnnotationUpdate, this);
  };

  NeuronAnnotations.prototype.append = function() {};
  NeuronAnnotations.prototype.clear = function(source_chain) {};
  NeuronAnnotations.prototype.removeSkeletons = function() {};
  NeuronAnnotations.prototype.updateModels = function() {};

  NeuronAnnotations.prototype.getSelectedSkeletons = function() {
    return this.get_selected_neurons().reduce( function(o, e) {
      if (e.type === 'neuron') {
        o = o.concat(e.skeleton_ids);
      }
      return o;
    }, []);
  };

  NeuronAnnotations.prototype.hasSkeleton = function(skeleton_id) {
    return this.queryResults.some(function(qs) {
      return qs.some(function(e) {
        return e.type === 'neuron' && e.skeleton_ids.some(function(id) {
          return id === skeleton_id;
        });
      });
    });
  };

  NeuronAnnotations.prototype.getSkeletonModel = function(skeleton_id, nocheck) {
    if (nocheck || this.hasSkeleton(skeleton_id)) {
      return new CATMAID.SkeletonModel(skeleton_id, "",
          new THREE.Color().setRGB(1, 1, 0));
    } else {
      return null;
    }
  };

  NeuronAnnotations.prototype.getSkeletonModels = function() {
    var self = this;
    return this.get_entities().reduce(function(o, e) {
      if (e.type === 'neuron') {
        e.skeleton_ids.forEach(function(s) {
          var m = new CATMAID.SkeletonModel(s, e.name,
              new THREE.Color().setRGB(1, 1, 0));
          // Set correct selection state for model
          m.selected = self.entity_selection_map[e.id];
          o[s] = m;

        });
      }
      return o;
    }, {});
  };

  NeuronAnnotations.prototype.getSelectedSkeletonModels = function() {
    return this.get_selected_neurons().reduce(function(o, e) {
      if (e.type === 'neuron') {
        e.skeleton_ids.forEach(function(s) {
          var m = new CATMAID.SkeletonModel(s, e.name,
              new THREE.Color().setRGB(1, 1, 0));
          m.selected = true;
          o[s] = m;
        });
      }
      return o;
    }, {});
  };

  NeuronAnnotations.prototype.highlight = function(skeleton_id)
  {
    // Don't try to highlight when no skeleton ID is given
    if (!skeleton_id) return;

    // Find neuron containing this skeleton_id
    var neurons = this.queryResults.reduce((function(o, qs) {
      o = o.concat(qs.filter(function(e) {
        if (e.type == 'neuron') {
          return e.skeleton_ids.some(function(s) {
            return s == skeleton_id;
          });
        } else {
          return false;
        }
      }));

      return o;
    }).bind(this), []);

    if (neurons) {
      // Remove any highlighting
      $('[class^=neuron_annotation_result_row' + this.widgetID + '_]').css(
          'background-color', '');
      // Highlight the neuron, containing the requested skeleton, if available.
      // Altough the code works for multiple neurons, it should be normally the
      // case that there is only one neuron, belonging to the skeleton.
      neurons.forEach($.proxy(function(n) {
        $('.neuron_annotation_result_row' + this.widgetID + '_' + n.id).css(
            'background-color', CATMAID.SelectionTable.prototype.highlighting_color);
      }, this));
    }
  };

  /**
   * Find the next selected skeleton ID following the given skeleton ID in the
   * table, if it is present.
   */
  NeuronAnnotations.prototype.getNextSkeletonIdAfter = function (skeleton_id) {
    var neurons = this.get_selected_neurons().filter(function(e) {
      return e.type === 'neuron';
    });

    var index = -1;
    neurons.forEach(function (e, i) {
      if (e.skeleton_ids.some(function (s) { return s === skeleton_id; }))
        index = i;
    });
    if (index === -1) {
      return undefined;
    } else {
      index = (index + 1) % neurons.length;
    }

    return neurons[index].skeleton_ids[0];
  };

  /**
   * Will refresh the display to update neuron names.
   */
  NeuronAnnotations.prototype.updateNeuronNames = function()
  {
    this.refresh();
  };

  /* Non-interface methods */

  /**
   * In the event of annotations being update while this widget is loaded,
   * update internal use of annotations (e.g. in auto completion).
   */
  NeuronAnnotations.prototype.handleAnnotationUpdate = function(changedEntities) {
    CATMAID.annotations.add_autocomplete_to_input(
        $('.neuron_query_by_annotation_name' + this.widgetID));
    // Re-query if one of the affected enteties is displayed by this search
    // widget.
    if (this.queryResults && this.queryResults.length > 0 &&
        changedEntities && changedEntities.length > 0) {
      var hasEntety = this.queryResults[0].some(function(r) {
        return -1 !== changedEntities.indexOf(r.id);
      });
      if (hasEntety) {
        this.query(false);
      }
    }
  };

  /**
   * Refresh data table UI.
   */
  NeuronAnnotations.prototype.makeDataTable = (function() {
    // Indicate if a redraw operation should be followd by updating the
    // annotation display.
    var requestAnnotationUpdate = false;

    return function() {
      var selector = 'table#neuron_annotations_query_results_table' + this.widgetID;
      var datatable = $(selector).DataTable({
        destroy: true,
        dom: "lrptip",
        autoWidth: false,
        paging: true,
        displayStart: this.display_start,
        pageLength: this.display_length,
        lengthMenu: [[50, 100, 500, -1], [50, 100, 500, "All"]],
        order: [],
        processing: true,
        columns: [
          { "orderable": false },
          { "orderable": false },
          { "orderable": false, "visible": this.displayAnnotations }
        ]
      }).off('.dt').on('draw.dt', this, function(e) {
        e.data.updateSelectionUI();
        e.data.updateAnnotationFiltering();
        if (requestAnnotationUpdate) {
          requestAnnotationUpdate = false;
          e.data.updateAnnotations();
        }
      }).on('page.dt', this, function(e) {
        // After every page chage, annotations should be updated. This can't be
        // done directly, because this event happens before redrawing.
        requestAnnotationUpdate = true;
      });
    };
  })();

  /**
   * Add a row for each entity with the given appender function. Expanded
   * elements will also be expanded. Keeps track of already expanded elements to
   * avoid repetitions for cycling annotations.
   */
  NeuronAnnotations.prototype.appendEntities = function(entities, appender, indent,
      expandedIds, sourceSlot) {
    // Mark entities as unselected and create result table rows
    entities.forEach(function(entity) {
      var tr = this.add_result_table_row(entity, appender, indent);
      // Add source information, if this entry resulted from expansion
      if (sourceSlot) {
        tr.setAttribute('expansion', sourceSlot);
      }
      // Add already expanded entities
      var expansionSlot = this.expansions.get(entity);
      var notExpanded = -1 === expandedIds.indexOf(entity.id);
      if (expansionSlot && notExpanded) {
        tr.setAttribute('expanded', expansionSlot);
        var expandedEntities = this.queryResults[expansionSlot];
        // Add entity ID to stack to not expand it twice
        expandedIds.push(entity.id);
        this.appendEntities(expandedEntities, appender, indent + 1, expandedIds,
            expansionSlot);
        // Remove ID from expansion stack, now that it is expanded
        expandedIds.pop();
      }
    }, this);
  };

  /**
   * Create a table row and passes it to add_row_fn which should it add it
   * whereever it wants. The third parameter specifies the number of indentation
   * steps that should be used.
   */
  NeuronAnnotations.prototype.add_result_table_row = function(entity, add_row_fn,
      indent)
  {
    // Build table row
    var tr = document.createElement('tr');
    tr.setAttribute('class', 'neuron_annotation_result_row' +
            this.widgetID + '_' + entity.id);
    tr.setAttribute('type', entity.type);
    tr.dataset.entityId = entity.id;
    tr.entity = entity;

    // Checkbox & name column, potentially indented
    var td_cb = document.createElement('td');
    var div_cb = document.createElement('div');
    // Make sure the line will not become shorter than 300px
    div_cb.style.minWidth = '200px';
    // Add indentation
    div_cb.style.marginLeft = indent * 1.5 + 'em';
    var cb = document.createElement('input');
    cb.setAttribute('type', 'checkbox');
    cb.setAttribute('entity_id', entity.id);
    cb.setAttribute('class', 'result' + this.widgetID + '_' +
            entity.id);
    var a = document.createElement('a');
    a.setAttribute('href', '#');
    // For a neuron, ask the neuron name service about the name
    var name = ('neuron' !== entity.type) ? entity.name :
        CATMAID.NeuronNameService.getInstance().getName(entity.skeleton_ids[0]);
    a.appendChild(document.createTextNode(name));
    var label = document.createElement('label');
    label.appendChild(cb);
    label.appendChild(a);
    div_cb.appendChild(label);
    td_cb.appendChild(div_cb);
    tr.appendChild(td_cb);

    // Type column
    var td_type = document.createElement('td');
    td_type.appendChild(document.createTextNode(
            entity.type));
    tr.appendChild(td_type);

    // Annotations column
    var td_ann = document.createElement('td');
    // Build list of alphabetically sorted annotations and use layout of jQuery
    // tagbox
    var sortedAnnotations = entity.annotations ? entity.annotations.sort(
        function(a, b) {
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        }) : [];
    var ul = sortedAnnotations.reduce(
      function(o, e) {
        var li = document.createElement('li');
        li.setAttribute('title', 'Show annotation in navigator');
        li.setAttribute('class', 'show_annotation');
        li.setAttribute('neuron_id', entity.id);
        li.setAttribute('annotation_id', e.id);
        li.setAttribute('user_id', e.uid);

        var remove_button = document.createElement('div');
        remove_button.setAttribute('title', 'Remove annotation');
        remove_button.setAttribute('class', 'remove_annotation');
        li.appendChild(document.createTextNode(e.name));
        li.appendChild(remove_button);
        o.appendChild(li);
        return o;
      }, document.createElement('ul'));
    ul.setAttribute('class', 'resultTags');
    td_ann.appendChild(ul);
    tr.appendChild(td_ann);

    // Add row to table
    add_row_fn(tr);

    if (entity.type == 'neuron') {
      // Go to nearest
      if (entity.skeleton_ids.length > 0) {
        a.dataset.skeletonId = entity.skeleton_ids[0];
      }
    } else if (entity.type == 'annotation') {
      // Add annotation attribute to link
      a.dataset.annotation = entity.name;
      a.dataset.indent = indent;
    }

    return tr;
  };

  NeuronAnnotations.prototype.query = function(initialize)
  {
    if (initialize) {
      this.display_start = 0;
      this.total_n_results = 0;
      // Reset "select all" check box
      $('#neuron_annotations_toggle_neuron_selections_checkbox' + this.widgetID)
          .prop('checked', false);
      // Reset "sync to" select box
      $('#neuron_annotations_add_to_selection' + this.widgetID + ' select')
          .val("None").trigger("change");
    }

    // Get user input
    var $widget = $('#neuron_query_by_annotations' + this.widgetID);
    var namedAs = $('input[name=neuron_query_by_name]', $widget).val().trim();
    var annotatedBy = $('select[name=neuron_query_by_annotator]', $widget).val().trim();
    var annotatedFrom = $('input[name=neuron_query_by_start_date]', $widget).val().trim();
    var annotatedTo = $('input[name=neuron_query_by_end_date]', $widget).val().trim();
    var annotations = [];
    var aSelector = 'name=neuron_query_by_annotation';
    var sSelector = 'name=neuron_query_include_subannotation';
    for (var i=0; i<this.nextFieldID; ++i) {
      var a = aSelector;
      var s = sSelector;
      if (i > 0) {
        a = a + this.widgetID + '_' + i;
        s = s + this.widgetID + '_' + i;
      }
      // Don't use empty names
      var name = $('input[' + a + ']').val().trim();
      if (name) {
        annotations.push([name, $('input[' + s + ']').is(':checked')]);
      }
    }

    // Build query parameter set
    var params = {};
    if (namedAs) { params['name'] = namedAs; }
    if (annotatedBy && -2 != annotatedBy) {
      params['annotated_by'] = 'Team' !== annotatedBy ? annotatedBy :
            Object.keys(CATMAID.ReviewSystem.Whitelist.getWhitelist());
    }
    if (annotatedFrom) { params['annotation_date_start'] = annotatedFrom; }
    if (annotatedTo) { params['annotation_date_end'] = annotatedTo; }
    var n = 0;
    for (var i=0; i<annotations.length; ++i) {
      var a = annotations[i][0];
      var s = annotations[i][1];
      var annotationID = CATMAID.annotations.getID(a);
      var value;
      if (annotationID) {
        // If the annotation matches one particular instance, use it
        value = annotationID;
      } else {
        // Otherwise, treat the search term as regular expression and
        // filter annotations that match
        var pattern = '/' === a.substr(0, 1) ? a.substr(1) : CATMAID.tools.escapeRegEx(a);
        var filter  = new RegExp(pattern);
        var matches = CATMAID.annotations.getAllNames().filter(function(a) {
          return this.test(a);
        }, filter);
        // Add matches to query, or-combined
        value = matches.map(function(m) {
          return CATMAID.annotations.getID(m);
        }).join(",");
        // If empty continue with next annotation (if any)
        if (0 === value.trim().length) {
          continue;
        }
      }
      var field = s ? 'sub_annotated_with' : 'annotated_with';
      params[field + n] = value;
      ++n;
    }

    // Make sure that the result is constrained in some way and not all neurons
    // are returned.
    if (0 === Object.keys(params).length) {
      if (0 < annotations.length) {
        CATMAID.error("Couldn't find matching annotation(s)!");
      } else {
        CATMAID.error("Please add at least one constraint before querying!");
      }
      return;
    }

    // Augment form data with offset and limit information
    params.rangey_start = this.display_start;
    params.range_length = this.display_length;
    params.with_annotations = this.displayAnnotations;

    // Here, $.proxy is used to bind 'this' to the anonymous function
    requestQueue.register(django_url + this.pid + '/annotations/query-targets',
        'POST', params, $.proxy( function(status, text, xml) {
          if (status === 200) {
            var e = $.parseJSON(text);
            if (e.error) {
              new CATMAID.ErrorDialog(e.error, e.detail).show();
            } else {
              // Keep a copy of all models that are removed
              var removedModels = this.getSkeletonModels();
              // Unregister last result set from neuron name service
              CATMAID.NeuronNameService.getInstance().unregister(this);
              // Empty selection map and store results
              this.entity_selection_map = {};
              this.entityMap = {};
              this.expansions.clear();
              this.queryResults = [];
              this.queryResults[0] = e.entities;
              this.total_n_results = e.entities.length;
              // Get new models for notification
              var addedModels = this.getSkeletonModels();

              // Mark entities as unselected
              this.queryResults[0].forEach((function(entity) {
                this.entity_selection_map[entity.id] = false;
                this.entityMap[entity.id] = entity;
              }).bind(this));

              // Register search results with neuron name service and rebuild
              // result table.
              var skeletonObject = getSkeletonIDsInResult(e.entities);
              CATMAID.NeuronNameService.getInstance().registerAll(this, skeletonObject,
                  this.refresh.bind(this));

              this.triggerRemove(removedModels);
              this.triggerAdd(addedModels);
            }
          }
        }, this));
  };

  /**
   * Return an object with fields being the skeleton IDs of all neurons in the
   * search result passed as argument.
   */
  function getSkeletonIDsInResult(result) {
    return result.filter(function(e) {
      return 'neuron' === e.type;
    }).reduce(function(o, e) {
      return e.skeleton_ids.reduce(function(o, skid) {
        o[skid] = {};
        return o;
      }, o);
    }, {});
  }

  /**
   * Make sure the UI doesn't show any outdated data.
   */
  NeuronAnnotations.prototype.invalidateUI = function() {
    var selector = 'table#neuron_annotations_query_results_table' + this.widgetID;
    if ($.fn.DataTable.isDataTable(selector)) {
      var datatable = $(selector).DataTable();
      if (datatable) {
        datatable.rows().invalidate();
      }
    }
  };

  /**
   * Rebuild the search result table.
   */
  NeuronAnnotations.prototype.refresh = function() {
    var entities = this.queryResults[0];
    // Clear table
    var $table = $('#neuron_annotations_query_results' + this.widgetID);
    var $tableBody = $table.find('tbody');
    var selector = 'table#neuron_annotations_query_results_table' + this.widgetID;
    if ($.fn.DataTable.isDataTable(selector)) {
      var datatable = $(selector).DataTable();
      if (datatable) {
        this.display_length = datatable.page.len();
        this.display_start = datatable.page() * this.display_length;
        datatable.destroy();
      }
    }

    $tableBody.empty();
    // create appender function which adds rows to table
    var appender = function(tr) {
      $tableBody.append(tr);
    };
    this.appendEntities(entities, appender, 0, []);

    // If there are results, display the result table
    if (entities.length > 0) {
      $('#neuron_annotations_query_no_results' + this.widgetID).hide();
      $('#neuron_annotations_query_results' + this.widgetID).show();
      this.update_result_row_classes();
      // Reset annotator constraints
      $( "#neuron_annotations_user_filter" + this.widgetID).combobox(
          'set_value', 'show_all');

      this.makeDataTable();
    } else {
      $('#neuron_annotations_query_results' + this.widgetID).hide();
      $('#neuron_annotations_query_no_results' + this.widgetID).show();
    }

    // Add handler to the checkbox in front of each entity
    var create_cb_handler = function(widget) {
      return function() {
            var clicked_cb = this;
            var is_checked = this.checked;
            var entity_id = $(this).attr('entity_id');
            // Update the entities selection state
            widget.entity_selection_map[entity_id] = is_checked;
            // Find updated skeleton models
            var changedModels = {};
            var entity = widget.entityMap[entity_id];
            if ('neuron' === entity.type) {
              for (var i=0, max=entity.skeleton_ids.length; i<max; ++i) {
                var model = widget.getSkeletonModel(entity.skeleton_ids[i]);
                model.selected = is_checked;
                changedModels[model.id] = model;
              }
            }
            if (!CATMAID.tools.isEmpty(changedModels)) {
              widget.triggerChange(changedModels);
            }
            // Due to expanded annotations, an entity can appear multiple times. Look
            // therefore for copies of the current one to toggle it as well.
            $("#neuron_annotations_query_results_table" + widget.widgetID).find(
                'td input[entity_id=' + entity_id + ']').each(function() {
                    if (this != clicked_cb) {
                      // Set property without firing event
                      $(this).prop('checked', is_checked);
                    }
                });
        };
    };
    $table.off('change.cm').on('change.cm', 'input[type=checkbox][entity_id]',
        create_cb_handler(this));

    // Add expand handler
    var self = this;
    $table.off('click.cm');
    $table.on('click.cm', 'a[data-skeleton-id]', function() {
      var skeletonId = this.dataset.skeletonId;
      CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', skeletonId);
    });
    $table.on('click.cm', 'a[data-annotation]', function() {
      var indent = Number(this.dataset.indent);
      var annotation = this.dataset.annotation;
      var aID = CATMAID.annotations.getID(annotation);
      var tr = $(this).closest('tr');
      var entity = $(tr)[0].entity;

      // If expanded, collapse it. Expand it otherwise.
      if (tr.is('[expanded]')) {
        // Get sub-expansion ID an mark link not expanded
        var sub_id = tr.attr('expanded');
        tr.removeAttr('expanded');
        // Find all rows that have an attribute called 'expansion' and delete
        // them.
        while (true) {
          var next = $(tr).next();
          if (next.is('[expansion=' + sub_id + ']')) {
            next.remove();
          } else {
            break;
          }
        }

        // Get an object mapping for all expanded skeletons
        var expansionSlot = self.expansions[entity];
        var expandedEntities = self.queryResults[expansionSlot];
        var expandedModels = {};
        if (expandedEntities) {
          for (var skid in getSkeletonIDsInResult(expandedEntities)) {
            expandedModels[skid] = self.getSkeletonModel(skid);
          }
        }

        // Delete sub-expansion query result and reference to it
        self.expansions.delete(entity);
        delete self.queryResults[sub_id];

        // Update current result table classes
        self.update_result_row_classes();

        // Find all unique skeletons that now are not available anymore from
        // this widget (i.e. that are not part of any other expansion or the
        // general results).
        var currentModels = self.getSkeletonModels();
        for (var eId in expandedModels) {
          // Make sure we only announce now unavailable skeletons as removed
          if (!(eId in currentModels)) {
            delete expandedModels[e.id];
            delete this.entityMap[e.id];
          }
        }
        if (!CATMAID.tools.isEmpty(expandedModels)) {
          this.triggerRemove(expandedModels);
        }
      } else {
        // Find a valid sub query ID as reference
        var sub_id = (function(results, count) {
          while (true) {
            if (results[count] === undefined) {
              // Stop, if a valid ID has been found
              return count;
            } else {
              // Increase counter, if the current ID is in use
              ++count;
            }
          }
        })(self.queryResults, 0);
        // Mark row expanded
        tr.attr('expanded', sub_id);

        // Map of all currently available entities
        var knownEntities = CATMAID.tools.listToIdMap(self.get_entities());

        // Make sure the slot in results array is used for this sub-query by
        // assigning 'null' to it (which is not 'undefined').
        self.queryResults[sub_id] = null;

        // Request entities that are annotated with this annotation
        // and replace the clicked on annotation with the result. Pagination
        // will not be applied to expansions.
        var query_data = {
          'annotated_with': aID,
          'with_annotations': self.displayAnnotations
        };
        requestQueue.register(django_url + project.id + '/annotations/query-targets',
            'POST', query_data, function(status, text, xml) {
              if (status === 200) {
                var e = $.parseJSON(text);
                if (e.error) {
                  new CATMAID.ErrorDialog(e.error, e.detail).show();
                } else {
                  // Register search results with neuron name service and rebuild
                  // result table.
                  var skeletonObject = getSkeletonIDsInResult(e.entities);
                  CATMAID.NeuronNameService.getInstance().registerAll(this, skeletonObject,
                      function () {
                        // Append new content right after the current node and save a
                        // reference for potential removal.
                        var appender = function(new_tr) {
                          new_tr.setAttribute('expansion', sub_id);
                          $(tr).after(new_tr);
                        };

                        // Figure out which entities are new
                        var newSkeletons = e.entities.reduce(function(o, s) {
                          var isNeuron = entity.type === 'neuron';
                          var unknown = !(entity.id in knownEntities);
                          if (isNeuron && unknown) {
                            for (var i=0, max=entity.skeleton_ids.length; i<max; ++i) {
                              o.push(entity.skeleton_ids[i]);
                            }
                          }
                          return o;
                        }, []);

                        // Mark entities as unselected, create result table rows
                        e.entities.filter(function(entity, i, a) {
                          self.entity_selection_map[entity.id] = false;
                          if(!(entity.id in self.entityMap)) {
                            self.entityMap[entity.id] = entity;
                          }
                          self.add_result_table_row(entity, appender, indent + 1);
                        });

                        // The order of the query result array doesn't matter.
                        // It is therefore possible to just append the new results.
                        self.queryResults[sub_id] = e.entities;
                        self.expansions.set(entity, sub_id);
                        // Update current result table classes
                        self.update_result_row_classes();
                        // Announce new models, if any
                        if (newSkeletons.length > 0) {
                          var newModels = newSkeletons.reduce(function(o, skid) {
                            o[skid] = self.getSkeletonModel(skid);
                            return o;
                          });
                          self.triggerAdd(newModels);
                        }
                      });
                }
              }
        });
      }
    });

    // Add click handlers to remove tags from nodes
    $table.on('click.cm', 'ul .remove_annotation', this,  function(event) {
      // Prevent the event from bubbling up the DOM tree
      event.stopPropagation();
      // Handle click
      var widget = event.data;
      var neuron_id = $(this).parent().attr('neuron_id');
      var annotation_id = $(this).parent().attr('annotation_id');
      CATMAID.remove_annotation(neuron_id,
          annotation_id, (function(message) {
              // Display message returned by the server
              CATMAID.info(message);
              // Update internal representation
              var hasAnnotation = function(r) {
                return r.id == neuron_id && r.annotations.some(function(a) {
                  return a.id == annotation_id;
                });
              };
              var nextAnnotationMatch = function(r) {
                for (var i=0; i<r.annotations.length; ++i) {
                  if (r.annotations[i].id == annotation_id) return i;
                }
                return null;
              };
              this.queryResults[0].filter(hasAnnotation).forEach(function(r) {
                var i = nextAnnotationMatch(r);
                if (i !== null) r.annotations.splice(i, 1);
              });
              // Remove current annotation from displayed list
              var result_tr = $('#neuron_annotations_query_results' +
                  this.widgetID).find('.show_annotation[neuron_id=' +
                  neuron_id + '][annotation_id=' + annotation_id + ']');
              result_tr.fadeOut(1000, function() { $(this).remove(); });
          }).bind(widget));
    });

    // Add click handlers to show an annotation in navigator
    $table.on('click.cm', 'ul .show_annotation', function() {
        // Expect name to be the text content of the node
        var annotation_name = $(this).text();
        var annotation_id = $(this).attr('annotation_id');
        // Create a new navigator and set it to an annotation filter node
        var NN = new CATMAID.NeuronNavigator();
        // Create a new window, based on the newly created navigator
        WindowMaker.create('neuron-navigator', NN);
        // Select the cloned node in the new navigator
        NN.set_annotation_node(annotation_name, annotation_id);
    });
  };

  NeuronAnnotations.prototype.update_result_row_classes = function()
  {
    var $tableBody = $('#neuron_annotations_query_results' +
        this.widgetID + ' tbody');
    // First, remove all 'even; and 'odd' classes
    $("tr", $tableBody).removeClass("odd even");
    // Re-add class for currently 'even' and 'odd' rows
    $("tr:nth-child(odd)", $tableBody).addClass("odd");
    $("tr:nth-child(even)", $tableBody).addClass("even");
  };

  NeuronAnnotations.prototype.add_query_field = function()
  {
    // Create a copy of the first row.
    var $newRow = $("#neuron_query_by_annotation" + this.widgetID).clone();
    $newRow.attr({
        id: 'neuron_query_by_annotation' + this.widgetID + '_' +
            this.nextFieldID,
        name: 'neuron_query_by_annotation' + this.widgetID + '_' +
            this.nextFieldID
    });

    $newRow.children()[0].innerHTML = 'and:';

    // Update the text field attributes.
    var $text = $newRow.find("input[type='text']");
    $text.attr({
        id: 'neuron_query_by_annotation' + this.widgetID + '_' +
            this.nextFieldID,
        name: 'neuron_query_by_annotation' + this.widgetID + '_' +
            this.nextFieldID,
        value: ''
    });
    // Add autocompletion to it
    CATMAID.annotations.add_autocomplete_to_input($text);

    // Update the button attributes.
    var $button = $newRow.find("input[type='button']");
    $button.attr('value', '-');
    $button.click(this.remove_query_field.bind(this, this.nextFieldID));
    $("#neuron_query_by_annotator" + this.widgetID).before($newRow);

    // By default, sub-annotations should not be included
    $newRow.find('input[type=checkbox]')
        .prop('checked', false)
        .attr({
          id: 'neuron_query_include_subannotation' + this.widgetID + '_' +
              this.nextFieldID,
          name: 'neuron_query_include_subannotation' + this.widgetID + '_' +
              this.nextFieldID,
    });

    this.nextFieldID += 1;
  };

  NeuronAnnotations.prototype.remove_query_field = function(rowNum)
  {
    var $row = $("#neuron_query_by_annotation" + this.widgetID + "_" + rowNum);
    $row.remove();
  };

  /**
   * Update selection state of all checkboxes, based on on the internal
   * selection model.
   */
  NeuronAnnotations.prototype.updateSelectionUI = function() {
    var self = this;
    $("#neuron_annotations_query_results_table" + this.widgetID).find(
        'tbody tr td input[class*=result' + this.widgetID + '_]').each(
            function(i, element) {
              var id = this.getAttribute('entity_id');
              if (id) {
                element.checked = self.entity_selection_map[id];
              } else {
                throw new CATMAID.ValueError("Couldn't find expected entity " +
                    "id for checkbox");
              }
            });
  };

  NeuronAnnotations.prototype.toggle_neuron_selections = function()
  {
    // Get current check state and update checkboxes and selection map
    var newValue = $("#neuron_annotations_toggle_neuron_selections_checkbox" +
        this.widgetID)[0].checked;
    $("#neuron_annotations_query_results_table" + this.widgetID).find(
        'tbody tr td input[class*=result' + this.widgetID + '_]').each(
            function(i, element) {
              element.checked = newValue;
            });
    this.queryResults.forEach(function(qs) {
      qs.forEach(function(e) {
        this.entity_selection_map[e.id] = newValue;
      }, this);
    }, this);

    this.triggerChange(this.getSkeletonModels());
    this.invalidateUI();
  };

  /**
   * If passed true, this function returns a list of selected entities.  If
   * passed false, a list of unselected entities is returned. If undefined, all
   * all entities are returned.
   */
  NeuronAnnotations.prototype.get_entities = function(checked)
  {
    var visited = {};
    return this.queryResults.reduce((function(o, qs) {
        qs.forEach(function(e) {
            // Avoid duplicates if the same neuron is checked multiple times and
            // add it only if not yet present.
            var valid = (checked === undefined || this.entity_selection_map[e.id] == checked);
            if (valid && !(e.id in visited)) {
                o.push(e);
                visited[e.id] = true;
            }
          }, this);
        return o;
      }).bind(this), []);
  };

  NeuronAnnotations.prototype.get_selected_neurons = function()
  {
    return this.get_entities(true);
  };

  NeuronAnnotations.prototype.get_unselected_neurons = function()
  {
    return this.get_entities(false);
  };
  /**
   * Refresh display and auto-completion with updated annotation information.
   */
  NeuronAnnotations.prototype.refresh_annotations = function() {
    // Update auto completion for input fields
    $('.neuron_query_by_annotation_name' + this.widgetID).autocomplete(
        "option", {source: CATMAID.annotations.getAllNames()});
  };

  NeuronAnnotations.prototype.getEntitiesOnPage = function() {
    var selector = 'table#neuron_annotations_query_results_table' + this.widgetID;
    if ($.fn.DataTable.isDataTable(selector)) {
      var datatable = $(selector).DataTable();
      if (datatable) {
        return datatable.rows({page: 'current'}).nodes().toArray().map(function(tr) {
          return Number(tr.dataset.entityId);
        });
      }
    }
    return [];
  };

  /**
   * Query annotations for results on the current page that no annotations have
   * been queried for before.
   */
  NeuronAnnotations.prototype.updateAnnotations = function() {
    if (!this.displayAnnotations) {
      this.refresh();
      return;
    }

    // Query annotations for all results that we don't have annotations for yet
    var visibleEntityIds = this.getEntitiesOnPage();
    var entitiesToQuery = this.queryResults.reduce(function(l, entities) {
      return entities.filter(function(e) {
        var onPage = (-1 !== visibleEntityIds.indexOf(e.id));
        return onPage && (!e.annotations || 0 === e.annotations.length);
      });
    }, []);

    var entityIdsToQuery = entitiesToQuery.map(function(e) { return e.id; });

    if (entitiesToQuery.length > 0) {
      var url = CATMAID.makeURL(project.id + '/annotations/query');
      var self = this;
      requestQueue.register(url, 'POST',
          {
            object_ids: entityIdsToQuery
          },
          CATMAID.jsonResponseHandler(function(json) {
            // Create mapping from skeleton ID to result object
            var results = entitiesToQuery.reduce(function(o, r, i) {
              o[r.id] = r;
              return o;
            }, {});
            // Add annotation id, name and annotator to result set
            Object.keys(json.entities).forEach(function(eid) {
              var result = results[eid];
              if (!(result.annotations)) {
                result.annotations = [];
              }
              var links = json.entities[eid];
              var annotations = json.annotations;
              links.forEach(function(a) {
                result.annotations.push({
                  id: a.id,
                  name: annotations[a.id],
                  uid: a.uid
                });
              });
            });

            self.refresh();
          }));
    } else {
      this.refresh();
    }
  };

  /**
   * If an annotation user filter is set, this function will hide all annotation
   * objects within the result table that hasn't been linked by the user passed
   * as second argument. Otherwise, it will show all annotations.
   */
  NeuronAnnotations.prototype.updateAnnotationFiltering = function() {
    var $results= $('#neuron_annotations_query_results' + this.widgetID);
    if (this.annotationUserFilter) {
      $results.find('li[user_id!=' + this.annotationUserFilter + ']').hide();
      $results.find('li[user_id=' + this.annotationUserFilter + ']').show();
    } else {
      $results.find('li').show();
    }
  };

  // Make neuron search widget available in CATMAID namespace
  CATMAID.NeuronAnnotations = NeuronAnnotations;

})(CATMAID);
