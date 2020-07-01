/* global
  InstanceRegistry,
  project,
  WindowMaker
*/

(function(CATMAID) {

  "use strict";

  var NeuronSearch = function()
  {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

    this.nextFieldID = 1;    // unique ID for annotation fields added by the "+" button
    // Results of main and sub queries. The main query will be index 0,
    // sub-queries will take the next free slot.
    this.queryResults = [];
    // Map expanded entities to a query result index
    this.expansions = new Map();
    // Map entity IDs to entities
    this.entityMap = {};
    // A map of path IDs vs. entity ID path lists
    this.paths = {};

    this.entity_selection_map = {};
    this.pid = project.id;

    // Ordering of the result table, default to name ascending
    this.ordering = [[0, 'asc']];

    // Limit the result set
    this.display_length = 50;
    this.display_start = 0;
    this.total_n_results = 0;

    // Indicate if annotations should be displayed
    this.displayAnnotations = false;
    // Set a user ID to show only annotations of specific users
    this.annotationUserFilter = null;
    // Whether metadata like cable length should be displayed
    this.displayMetadata = false;
    // Whether removal tools should be displayed
    this.showRemovalTools = false;

    // A set of filter rules to apply to the handled skeletons
    this.filterRules = [];
    // Filter rules can optionally be disabled
    this.applyFilterRules = true;

    // Stores the inititial width of search input boxes.
    this.initialWidthMap = new WeakMap();

    // Listen to annotation change events to update self when needed
    CATMAID.Annotations.on(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
        this.handleAnnotationUpdate, this);
  };

  NeuronSearch.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  NeuronSearch.prototype.constuctor = NeuronSearch;

  $.extend(NeuronSearch.prototype, new InstanceRegistry());

  /* Implement interfaces */

  NeuronSearch.prototype.getName = function()
  {
      return "Neuron Search " + this.widgetID;
  };

  NeuronSearch.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: 'neuron_annotations_query_fields' + this.widgetID,
      contentID: 'neuron_annotations_query_results' + this.widgetID,
      createControls: function(content) {
        // Create the query fields HTML
        var queryFields = document.createElement('div');
        queryFields.innerHTML = `
          <label style="float: right" class="checkbox-label">
            <input type="checkbox" id="neuron_search_apply_filters${this.widgetID}" tabindex="-1" />
            Apply filters
          </label>
          <form id="neuron_query_by_annotations${this.widgetID}" autocomplete="on">
          <table cellpadding="0" cellspacing="0" border="0"
              class="neuron_annotations_query_fields"
              id="neuron_annotations_query_fields${this.widgetID}">
            <tr id="neuron_query_by_name${this.widgetID}">
              <td class="neuron_annotations_query_field_label">named as:</td>
              <td class="neuron_annotations_query_field">
                <label class="checkbox-label"><input type="checkbox" name="neuron_query_by_name_not"
                    id="neuron_query_by_name_not${this.widgetID}" tabindex="-1" />not</label>
                <input type="text" name="neuron_query_by_name"
                    id="neuron_query_by_name${this.widgetID}" value="" class="expandable" placeholder="Use / for RegEx" />
              </td>
              <td>
                <label class="checkbox-label"><input type="checkbox" name="neuron_query_by_name_exact"
                    id="neuron_query_by_name_exact${this.widgetID}" tabindex="-1" title="Name must match exactly, parts of the name ara not accepted."/>Exact</label>
                <label class="checkbox-label"><input type="checkbox" name="neuron_query_by_name_case_sensitive"
                    id="neuron_query_by_name_case_sensitive${this.widgetID}" tabindex="-1" title="Name must match the case of the letters provided."/>Case sensitive</label></td>
            </tr>
            <tr id="neuron_query_by_annotation${this.widgetID}">
              <td class="neuron_annotations_query_field_label">annotated:</td>
              <td class="neuron_annotations_query_field">
                <label class="checkbox-label"><input type="checkbox" name="neuron_query_by_annotation_not"
                    id="neuron_query_not${this.widgetID}" tabindex="-1" />not</label>
                <input type="text" name="neuron_query_by_annotation" autocomplete="off"
                    class="neuron_query_by_annotation_name${this.widgetID} expandable" value="" placeholder="Use / for RegEx" />
              </td><td>
                <label class="checkbox-label"><input type="checkbox" name="neuron_query_include_subannotation"
                    class="neuron_query_include_subannotation${this.widgetID}" value="" />
                Include sub-annotations</label>
                <input type="button" name="neuron_annotations_add_annotation"
                    id="neuron_annotations_add_annotation${this.widgetID}" value="+" tabindex="-1" />
              </td>
            </tr>
            <tr id="neuron_query_by_annotator${this.widgetID}" tabindex="-1">
              <td class="neuron_annotations_query_field_label">by:</td>
              <td class="neuron_annotations_query_field">
                <select name="neuron_query_by_annotator" tabindex="-1"
                    id="neuron_query_by_annotator${this.widgetID}" class="">
                  <option value="-2">Anyone</option>
                  <option value="Team">Team</option>
                </select>
              </td>
              <td><div class="help">Respected for included annotations</div></td>
            </tr>
            <tr id="neuron_query_by_date_range${this.widgetID}">
              <td class="neuron_annotations_query_field_label">between:</td>
              <td class="neuron_annotations_query_field">
                <input type="text" name="neuron_query_by_start_date"
                    id="neuron_query_by_start_date${this.widgetID}" size="10"
                    value="" class="" tabindex="-1" />
                 and
                <input type="text" name="neuron_query_by_end_date"
                    id="neuron_query_by_end_date${this.widgetID}" size="10"
                    value="" class="" tabindex="-1" />
              </td>
              <td><div class="help">Respected for included annotations</div></td>
            </tr>
            <tr>
              <td class="neuron_annotations_query_field_label">other:</td>
              <td class="neuron_annotations_query_field" colspan=2>
                <label><input type="checkbox" name="neuron_query_import_partial"
                    id="neuron_query_import_partial${this.widgetID}" size="10" tabindex="-1" />
                    contains imported fragments
                </label>
                <label><input type="checkbox" name="neuron_query_import_full"
                    id="neuron_query_import_full${this.widgetID}" size="10" tabindex="-1" />
                    is imported entirely
                </label>
              </td>
            </tr>
          </table>
          <input type="submit" />
          </form>`;
        content.appendChild(queryFields);

        // Make search fields adjust size on typing
        let meassureSpan = content.appendChild(CATMAID.DOM.createMeasureElement());
        let fitExpandableSize = (e) => {
          if (e.target.classList.contains('expandable')) {
            // Find pixel width and add one character as padding
            meassureSpan.textContent = (e.target.value + 'W') || '';
            let textWidth = meassureSpan.offsetWidth;
            let minLength;
            if (this.initialWidthMap.has(e.target)) {
              minLength = this.initialWidthMap.get(e.target);
            } else {
              minLength = parseInt(window.getComputedStyle(e.target)['width'], 10);
              this.initialWidthMap.set(e.target, minLength);
            }
            e.size = '';
            e.target.style.width = `${Math.max(textWidth, minLength)}px`;
          }
        };
        content.addEventListener('change', fitExpandableSize);
        content.addEventListener('keypress', fitExpandableSize);
        content.addEventListener('keyup', fitExpandableSize);
        content.addEventListener('paste', fitExpandableSize);
      },
      createContent: function(content) {
        this.content = content;

        var container_html =
          '<div id="neuron_annotations_query_footer{{NA-ID}}" ' +
              'class="neuron_annotations_query_footer">' +
            '<input type="button" id="neuron_annotations_annotate{{NA-ID}}" ' +
                'value="Annotate" />' +
            '<input type="button" id="neuron_annotations_rename{{NA-ID}}" ' +
                'value="Rename" />' +
            '<input type="button" id="neuron_annotations_export_csv{{NA-ID}}" ' +
                'value="Export CSV" title="Export selected neuron IDs and names. ' +
                'Annotations are exported if displayed."/>' +
            '<label class="checkbox-label" title="Show all annotations for each result element.">' +
              '<input type="checkbox" id="neuron_search_show_annotations{{NA-ID}}" />' +
              'Show annotations' +
            '</label>' +
            '<label class="checkbox-label">' +
              '<input type="checkbox" id="neuron_search_show_metadata{{NA-ID}}" />' +
              'Show metadata' +
            '</label>' +
            `<label class="checkbox-label removal-highlight" title="Show annotation removal tools if annotations are displayed. Not useful without displayed annotations at the moment.">` +
              `<input type="checkbox" id="neuron_search_show_removal_tools{{NA-ID}}" ${this.displayAnnotations ? '' : 'disabled'} />` +
              'Show ann. removal tools' +
            '</label>' +
          '</div>' +
          '<table cellpadding="0" cellspacing="0" border="0" ' +
                'class="neuron_annotations_query_results_table display" ' +
                'id="neuron_annotations_query_results_table{{NA-ID}}">' +
            '<thead>' +
              '<tr>' +
                '<th>' +
                  '<input type="checkbox" ' +
                      'id="neuron_annotations_toggle_neuron_selections_checkbox{{NA-ID}}" />' +
                  '<span>Entity Name</span>' +
                '</th>' +
                '<th>Type</th>' +
                '<th>' +
                  '<div class="result_annotations_column">Annotations by</div>' +
                  '<div>' +
                    '<label for="neuron_annotations_user_filter{{NA-ID}}">' +
                    '</label>' +
                    '<select name="annotator_filter" class="" ' +
                        'id="neuron_annotations_user_filter{{NA-ID}}">' +
                      '<option value="show_all" selected>Anyone</option>' +
                    '</select>' +
                  '</div>' +
                '</th>' +
                '<th>' +
                  '<div>Cable length (nm)</div>' +
                '</th>' +
                '<th>' +
                  '<div title="Imported nodes in parentheses"># Nodes</div>' +
                '</th>' +
                '<th>' +
                  '<div>Created (UTC)</div>' +
                '</th>' +
                '<th>' +
                  '<div>Last edit (UTC)</div>' +
                '</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
              '<tr><td colspan="7"></td></tr>' +
            '</tbody>' +
          '</table>';
        // Replace {{NA-ID}} with the actual widget ID
        content.innerHTML = container_html.replace(/{{NA-ID}}/g, this.widgetID);

        // Add a container that gets displayed if no results could be found
        var no_results = document.createElement('div');
        no_results.setAttribute('id', 'neuron_annotations_query_no_results' + this.widgetID);
        no_results.classList.add('windowContent');
        no_results.innerHTML = '<em>No results could be found.</em>';
        content.appendChild(no_results);
        no_results.style.display = 'none';
      },
      init: function(win, options) {
        var self = this;

        // Update annotation cache in parallel and add autocompletion to
        // annotation input field.
        let prepare = [
            CATMAID.annotations.update(true)
              .then(() => this.handleAnnotationUpdate())
        ];

        let submit = function(event) {
          // Submit form in iframe to make browser save search terms for
          // autocompletion.
          var form = document.getElementById('neuron_query_by_annotations' + self.widgetID);
          CATMAID.DOM.submitFormInIFrame(form);
          // Do actual query
          self.query(true);
          if (event) event.preventDefault();
          return false;
        };

        $('#neuron_annotations_add_annotation' + this.widgetID)[0].onclick =
            this.add_query_field.bind(this);
        $('#neuron_query_by_annotations' + this.widgetID).submit(submit);
        $('#neuron_annotations_annotate' + this.widgetID)[0].onclick = (function() {
            // Get IDs of selected entities
            var selected_entity_ids = this.get_selected_neurons().map( function(e) {
              return e.id;
            });
            // Refresh display after annotations have been added
            CATMAID.annotate_entities(selected_entity_ids,
                this.refresh_annotations.bind(this));
        }).bind(this);
        $(`#neuron_annotations_rename${this.widgetID}`)[0].onclick = (function() {
           let skeletonIds = this.getSelectedSkeletons();
           if (skeletonIds.length === 0) {
             CATMAID.warn('Please select one or more skeleton fist');
             return;
           }
           let dialog = new CATMAID.RenameNeuronsDialog(skeletonIds);
           dialog.show();
        }).bind(this);
        $('#neuron_annotations_export_csv' + this.widgetID)[0].onclick = this.exportCSV.bind(this);
        $('#neuron_search_show_annotations' + this.widgetID)
          .prop('checked', this.displayAnnotations)
          .on('change', this, function(e) {
            var widget = e.data;
            widget.displayAnnotations = this.checked;
            widget.updateAnnotations().then(() => widget.refresh());

            $(`input#neuron_search_show_removal_tools${self.widgetID}`)
                .prop('disabled', !this.checked);
          });
        $(`#neuron_search_show_metadata${this.widgetID}`)
          .prop('checked', this.displayMetadata)
          .on('change', this, function(e) {
            var widget = e.data;
            widget.displayMetadata = this.checked;
            widget.updateMetadata().then(() => widget.refresh());
          });
        $(`#neuron_search_show_removal_tools${this.widgetID}`)
          .prop('checked', this.showRemovalTools)
          .on('change', this, function(e) {
            var widget = e.data;
            widget.showRemovalTools = this.checked;
            widget.refresh();

            if (!widget.displayAnnotations && this.checked) {
              CATMAID.warn("Annotations are not displayed at the moment");
            }
          });
        $('#neuron_search_apply_filters' + this.widgetID)
          .prop('checked', this.applyFilterRules)
          .on('change', this, function(e) {
            var widget = e.data;
            widget.applyFilterRules = this.checked;
            if (widget.filterRules.length > 0) {
              widget.applyFilter();
            }
          });

        $('#neuron_annotations_toggle_neuron_selections_checkbox' + this.widgetID)[0].onclick =
            this.toggle_neuron_selections.bind(this);

        // Fill user select boxes
        var $select = $('tr #neuron_query_by_annotator' + this.widgetID);
        var $filter_select = $("#neuron_annotations_query_results_table" +
            this.widgetID + ' select[name=annotator_filter]');
        var users = CATMAID.User.all();
        for (var userID in users) {
          if (users.hasOwnProperty(userID) && userID !== "-1") {
            var user = users[userID];
            {
              // Add entry to query select
              var opts = {value: user.id, text: user.fullName};
              $("<option />", opts).appendTo($select);
              // Add entry to filter select and select current user by default
              $("<option />", opts)
                  .prop('selected', userID == CATMAID.session.userid)
                  .appendTo($filter_select);
            }
          }
        }

        // Make it support autocompletion
        $select.combobox();
        // Ignore tab selection
        $('input', $select.parent()).attr('tabindex', '-1');

        // Make annotation filter select support autocompletion and attach the
        // selected event handler right away. Unfortunately, this can't be done
        // later.
        $filter_select.combobox({
          selected: function(event, ui) {
            var val = $(this).val();
            self.annotationUserFilter = val != 'show_all' ? val : null;
            self.updateAnnotationFiltering();
          }
        });

        $( "#neuron_query_by_start_date" + this.widgetID ).datepicker(
            { dateFormat: "yy-mm-dd" });
        $( "#neuron_query_by_end_date" + this.widgetID ).datepicker(
            { dateFormat: "yy-mm-dd" });

        // Hide the result container by default. It would be more logical to do this
        // right after the contaienr creation. However, adding auto completion to
        // the filter select box doesn't work when it is hidden.
        $(this.content).hide();

        // Focus search box
        setTimeout(function() {
          $('input#neuron_query_by_name' + self.widgetID).focus();
        }, 10);

        if (options) {
          if (options["with-subannotations"]) {
            $('input[name=neuron_query_by_annotation]').prop('checked', true);
          }
          if (options["annotation-name"]) {
            $('input[name=neuron_query_by_annotation]').val(options["annotation-name"]);
          }
          Promise.all(prepare)
            .then(() => {
              if (options["annotation-name"]) {
                submit();
              }
            });
        }
      },
      filter: {
        rules: this.filterRules,
        update: this.applyFilter.bind(this)
      },
      helpText: [
        '<p>Find neurons and annotations by neuron name or by annotations ',
        'or by Annotator or by date range of annotation (date of association ',
        'of neuron and annotation).</p>',
        '<p>As an example, consider the following setup with two neurons n1 and n2 as well as three annotations A, B and C:</p>',
        '<p><svg height="200" with="200" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">',
        '<path d="M 20,50 10,30" style="stroke-width: 0.5px; stroke: #000" />',
        '<path d="M 20,50 30,30" style="stroke-width: 0.5px; stroke: #000" />',
        '<path d="M 40,50 30,30" style="stroke-width: 0.5px; stroke: #000" />',
        '<path d="M 30,30 30,10" style="stroke-width: 0.5px; stroke: #000" />',
        '<circle cx="20" cy="50" r="7" style="fill: #fff"/>',
        '<circle cx="40" cy="50" r="7" style="fill: #fff"/>',
        '<circle cx="30" cy="28" r="4" style="fill: #fff"/>',
        '<circle cx="30" cy="10" r="3" style="fill: #fff"/>',
        '<circle cx="10" cy="30" r="3" style="fill: #fff"/>',
        '<text x="20" y="50" style="font-size: 5px; text-anchor: middle">n1</text>',
        '<text x="40" y="50" style="font-size: 5px; text-anchor: middle">n1</text>',
        '<text x="30" y="30" style="font-size: 5px; text-anchor: middle">A</text>',
        '<text x="30" y="10" style="font-size: 5px; text-anchor: middle">B</text>',
        '<text x="10" y="30" style="font-size: 5px; text-anchor: middle">C</text>',
        '</svg></p>',
        '<p>If "Include sub-annotations" is checked, top-level results will ',
        'include neurons n1 and n2 which are annotated with annotation A, ',
        'which in turn is meta-annotated with annotation B. A Search for ',
        'annotation B will display only annotation A. If "Include sub-annotations"',
        'is checked n1 and n2 will also be displayed along with annotation ',
        'A. A Search for C will display n1 only, even if "Include sub-annotations"',
        'is checked.',
        '<p>Additional annotations constraints can be added/removed with <kbd>+</kbd>/<kbd>-</kbd>.</p>',
        '<p>Once search results are displayed, additional buttons make it ',
        'possible to annotate selected neurons and export the result table ',
        'as CSV file.</p>',
        '<p>By default, annotations of result neurons are <em>not</em> shown ',
        'in the search results. To view them check ‘Show annotations’. ',
        'Annotations that are regular search results (i.e. the type column says ',
        '"annotation") can be expanded to view further details (including ',
        'skeletons and sub-annotations). If displayed, annotations on a ',
        'particular result (i.e. on the right side with red minus button) ',
        'can be clicked on to launch the Neuron Navigator. The minus sign ',
        'will de-annotate the respective annotation.</p>'
      ].join('\n')
    };
  };

  NeuronSearch.prototype.destroy = function()
  {
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);
    CATMAID.Annotations.off(CATMAID.Annotations.EVENT_ANNOTATIONS_CHANGED,
        this.handleAnnotationUpdate, this);
  };

  NeuronSearch.prototype.append = function() {};
  NeuronSearch.prototype.clear = function(source_chain) {};
  NeuronSearch.prototype.removeSkeletons = function() {};
  NeuronSearch.prototype.updateModels = function() {};

  NeuronSearch.prototype.getSelectedSkeletons = function() {
    return this.get_selected_neurons().reduce( function(o, e) {
      if (e.type === 'neuron') {
        o = o.concat(e.skeleton_ids);
      }
      return o;
    }, []);
  };

  NeuronSearch.prototype.hasSkeleton = function(skeleton_id) {
    return this.queryResults.some(function(qs) {
      return qs.some(function(e) {
        return e.type === 'neuron' && e.skeleton_ids.some(function(id) {
          return id === skeleton_id;
        });
      });
    });
  };

  NeuronSearch.prototype.getSkeletonModel = function(skeleton_id, nocheck) {
    if (nocheck || this.hasSkeleton(skeleton_id)) {
      return new CATMAID.SkeletonModel(skeleton_id, "",
          new THREE.Color(1, 1, 0));
    } else {
      return null;
    }
  };

  NeuronSearch.prototype.getSkeletonModels = function() {
    var self = this;
    return this.get_entities().reduce(function(o, e) {
      if (e.type === 'neuron') {
        e.skeleton_ids.forEach(function(s) {
          var m = new CATMAID.SkeletonModel(s, e.name,
              new THREE.Color(1, 1, 0));
          // Set correct selection state for model
          m.selected = self.entity_selection_map[e.id];
          o[s] = m;

        });
      }
      return o;
    }, {});
  };

  NeuronSearch.prototype.getSelectedSkeletonModels = function() {
    return this.get_selected_neurons().reduce(function(o, e) {
      if (e.type === 'neuron') {
        e.skeleton_ids.forEach(function(s) {
          var m = new CATMAID.SkeletonModel(s, e.name,
              new THREE.Color(1, 1, 0));
          m.selected = true;
          o[s] = m;
        });
      }
      return o;
    }, {});
  };

  NeuronSearch.prototype.highlight = function(skeleton_id)
  {
    // Remove any highlighting
    let skeletonRows = document.querySelectorAll(`[class^=neuron_annotation_result_row${this.widgetID}_][class*=highlight]`);
    if (skeletonRows) {
      skeletonRows.forEach(r => r.classList.remove('highlight'));
    }

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

    // Highlight the neuron containing the requested skeleton, if available.
    neurons.forEach(n => {
      let row = document.querySelector(`.neuron_annotation_result_row${this.widgetID}_${n.id}`);
      if (row) {
        row.classList.add('highlight');
      }
    });
  };

  /**
   * Find the next selected skeleton ID following the given skeleton ID in the
   * table, if it is present.
   */
  NeuronSearch.prototype.getNextSkeletonIdAfter = function (skeleton_id) {
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
  NeuronSearch.prototype.updateNeuronNames = function()
  {
    this.refresh();
  };

  /* Non-interface methods */

  /**
   * In the event of annotations being update while this widget is loaded,
   * update internal use of annotations (e.g. in auto completion).
   */
  NeuronSearch.prototype.handleAnnotationUpdate = function(changedEntities) {
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
  NeuronSearch.prototype.makeDataTable = (function() {
    // Indicate if a redraw operation should be followd by updating the
    // annotation display.
    var requestAnnotationUpdate = false;
    let requestMetadataUpdate = false;

    return function() {
      let widget = this;
      var selector = 'table#neuron_annotations_query_results_table' + this.widgetID;

      let nns = CATMAID.NeuronNameService.getInstance();
      let asName = entityId => {
        let entity = widget.entityMap[entityId];
        return entity.type === 'neuron' ? nns.getName(entity.skeleton_ids[0]) : entity.name;
      };
      let asType = entityId => {
        let entity = widget.entityMap[entityId];
        return entity.type;
      };

      var datatable = $(selector).DataTable({
        destroy: true,
        dom: "lrptip",
        autoWidth: false,
        paging: true,
        displayStart: this.display_start,
        pageLength: this.display_length,
        lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
        order: this.order,
        processing: true,
        columns: [
          {
            "type": "hierarchical-search-name",
            "orderable": true,
            "render": function(data, type, row, meta) {
              // For sorting, append the expansion information
              if (type === 'display') {
                return data;
              } else {
                let keyMatch = new RegExp('key="([0-9\-]\+)"').exec(data);
                if (!keyMatch || !keyMatch[1]) return data;
                let key = keyMatch[1];
                let entityIdMatch = new RegExp('entity_id="([0-9]\+)"').exec(data);
                if (!entityIdMatch || !entityIdMatch[1]) return data;
                let entityId = entityIdMatch[1];
                let name = asName(entityId);
                let entity = widget.entityMap[entityId];
                if (type === "sort") {
                  let path = widget.paths[key];
                  return [path, path.map(asName)];
                } else {
                  return name;
                }
              }
            },
          },
          {
            "type": "hierarchical-search-type",
            "orderable": true,
            "render": function(data, type, row, meta) {
              // For sorting, append the expansion information
              if (type === 'display') {
                return data;
              } else {
                let keyMatch = new RegExp('key="([0-9\-]\+)"').exec(data);
                if (!keyMatch || !keyMatch[1]) return data;
                let key = keyMatch[1];
                if (type === "sort") {
                  let path = widget.paths[key];
                  return [path, path.map(asType)];
                } else {
                  return data;
                }
              }
            },
          },
          { "orderable": false, "visible": this.displayAnnotations },
          { "orderable": true, class: "cm-center", "visible": this.displayMetadata },
          { "orderable": true, class: "cm-center", "visible": this.displayMetadata },
          { "orderable": true, class: "cm-center", "visible": this.displayMetadata },
          { "orderable": true, class: "cm-center", "visible": this.displayMetadata },
        ],
        language: {
          "emptyTable": "No search results found"
        }
      }).off('.dt').on('draw.dt', this, function(e) {
        e.data.updateSelectionUI();
        e.data.updateAnnotationFiltering();
        let promises = [];
        if (requestAnnotationUpdate) {
          requestAnnotationUpdate = false;
          promises.push(e.data.updateAnnotations());
        }
        if (requestMetadataUpdate) {
          requestMetadataUpdate = false;
          promises.push(e.data.updateMetadata());
        }

        // Only refresh if there is work to be done.
        if (promises.length > 0) {
          Promise.all(promises).then(() => e.data.refresh());
        }
      }).on('page.dt', this, function(e) {
        // After every page chage, annotations should be updated. This can't be
        // done directly, because this event happens before redrawing.
        requestAnnotationUpdate = true;
        requestMetadataUpdate = true;
      }).on('order.dt', this, function(e) {
        this.order = datatable.order();
        // Update header sort icon. For some reason this doesn't change
        // automatically with DOM data.
        let [sortCol, sortDir] = this.order && this.order.length > 0 ? this.order[0] : [null, null];
        $(`${selector} th`).each((i, element) => {
          if (element.classList.contains('sorting_asc')) {
            element.classList.remove('sorting_asc');
            element.classList.add("sorting");
          } else if (element.classList.contains('sorting_desc')) {
            element.classList.remove('sorting_desc');
            element.classList.add("sorting");
          }
          if (i === sortCol) {
            if (sortDir == 'asc') {
              element.classList.remove('sorting');
              element.classList.add("sorting_asc");
            }
            else {
              element.classList.remove('sorting');
              element.classList.add("sorting_desc");
            }
          }
        });
      });
    };
  })();

  /**
   * Add a row for each entity with the given appender function. Expanded
   * elements will also be expanded. Keeps track of already expanded elements to
   * avoid repetitions for cycling annotations.
   */
  NeuronSearch.prototype.appendEntities = function(entities, appender, indent,
      expandedIds, sourceSlot, path = []) {
    // Mark entities as unselected and create result table rows
    entities.forEach(function(entity) {
      var tr = this.add_result_table_row(entity, appender, indent, undefined, path);
      let newPath = [...path, entity.id];
      this.paths[newPath.join('-')] = newPath;
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
            expansionSlot, newPath);
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
  NeuronSearch.prototype.add_result_table_row = function(entity, add_row_fn,
      indent, selected, path=[])
  {
    // Build table row
    var tr = document.createElement('tr');
    tr.setAttribute('class', 'neuron_annotation_result_row' +
            this.widgetID + '_' + entity.id);
    tr.setAttribute('type', entity.type);
    tr.dataset.entityId = entity.id;
    tr.dataset.key = [...path, entity.id].join('-');
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
    cb.dataset.key = [...path, entity.id].join('-');
    cb.setAttribute('class', 'result' + this.widgetID + '_' +
            entity.id);
    cb.checked = !!selected;
    var a = document.createElement('a');
    a.setAttribute('href', '#');
    // For a neuron, ask the neuron name service about the name
    var name = ('neuron' !== entity.type) ? entity.name :
        CATMAID.NeuronNameService.getInstance().getName(entity.skeleton_ids[0]);
    a.appendChild(document.createTextNode(name));
    var label = document.createElement('label');
    label.classList.add('checkbox-label');
    label.appendChild(cb);
    label.appendChild(a);
    div_cb.appendChild(label);
    td_cb.appendChild(div_cb);
    tr.appendChild(td_cb);

    // Type column
    var td_type = document.createElement('td');
    var span_type = document.createElement('span');
    span_type.dataset.key = [...path, entity.id].join('-');
    span_type.appendChild(document.createTextNode(entity.type));
    td_type.appendChild(span_type);
    tr.appendChild(td_type);

    // Annotations column
    var td_ann = document.createElement('td');
    // Build list of alphabetically sorted annotations and use layout of jQuery
    // tagbox
    var sortedAnnotations = entity.annotations ? entity.annotations.sort(
        function(a, b) {
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        }) : [];
    var ul = sortedAnnotations.reduce((o, e) => {
        var li = document.createElement('li');
        li.setAttribute('title', 'Show annotation in navigator');
        li.setAttribute('class', 'show_annotation');
        li.setAttribute('neuron_id', entity.id);
        li.setAttribute('annotation_id', e.id);
        li.setAttribute('user_id', e.uid);

        li.appendChild(document.createTextNode(e.name));

        if (this.showRemovalTools) {
          var remove_button = document.createElement('div');
          remove_button.setAttribute('title', 'Remove annotation');
          remove_button.setAttribute('class', 'remove_annotation');
          li.appendChild(remove_button);
        }
        o.appendChild(li);
        return o;
      }, document.createElement('ul'));
    ul.setAttribute('class', 'resultTags');
    td_ann.appendChild(ul);
    tr.appendChild(td_ann);

    let emptyMeta = entity.type === 'neuron' ? '…' : '';

    // Cable length
    let td_cable = document.createElement('td');
    let span_cable = document.createElement('span');
    span_cable.dataset.key = [...path, entity.id].join('-');
    span_cable.appendChild(document.createTextNode(Math.round(entity.cable_length) || emptyMeta));
    td_cable.appendChild(span_cable);
    tr.appendChild(td_cable);

    // # Nodes
    let td_n_nodes = document.createElement('td');
    let span_n_nodes = document.createElement('span');
    span_n_nodes.dataset.key = [...path, entity.id].join('-');
    span_n_nodes.appendChild(document.createTextNode(entity.n_nodes || emptyMeta));
    td_n_nodes.appendChild(span_n_nodes);
    tr.appendChild(td_n_nodes);

    // Created
    let td_created = document.createElement('td');
    let span_created = document.createElement('span');
    span_created.dataset.key = [...path, entity.id].join('-');
    span_created.appendChild(document.createTextNode(entity.creation_time ?
        CATMAID.tools.dateToString(CATMAID.tools.isoStringToDate(entity.creation_time)) : emptyMeta));
    td_created.appendChild(span_created);
    tr.appendChild(td_created);

    // Last edit
    let td_edited = document.createElement('td');
    let span_edited = document.createElement('span');
    span_edited.dataset.key = [...path, entity.id].join('-');
    span_edited.appendChild(document.createTextNode(entity.last_edition_time ?
        CATMAID.tools.dateToString(CATMAID.tools.isoStringToDate(entity.last_edition_time)) : emptyMeta));
    if (entity.last_editor_id !== undefined) {
      span_edited.setAttribute('title', `Edited by ${CATMAID.User.safe_get(entity.last_editor_id).login}`);
    }
    td_edited.appendChild(span_edited);
    tr.appendChild(td_edited);

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

  /**
   * Apply current node filters to current result set.
   */
  NeuronSearch.prototype.filterResults = function(data) {
    var hasResults = data.entities.length > 0;
    if (this.filterRules.length > 0 && this.applyFilterRules && hasResults) {
      // Collect skeleton models from input
      var skeletons = data.entities.reduce(function(o, e) {
        if (e.type === 'neuron') {
          for (var i=0; i<e.skeleton_ids.length; ++i) {
            var skeletonId = e.skeleton_ids[i];
            if (!o[skeletonId]) {
              o[skeletonId] = new CATMAID.SkeletonModel(skeletonId);
            }
          }
        }
        return o;
      }, {});
      // Execute filter
      var filter = new CATMAID.SkeletonFilter(this.filterRules, skeletons);
      return filter.execute()
        .then(function(filtered) {
          if (filtered.skeletons.size === 0) {
            CATMAID.warn("No skeletons left after filter application");
            data.entities = [];
            data.totalRecords = 0;
            return data;
          }

          // Remove all invalid neuron results
          var entities = data.entities;
          var validSkeletons = filtered.skeletons;
          var validEntities = [];
          for (var i=0; i<entities.length; ++i) {
            var entity = entities[i];
            if (entity.type === 'neuron') {
              var nValidSkeletons = 0;
              for (var j=0; j<entity.skeleton_ids.length; ++j) {
                var skeletonId = entity.skeleton_ids[j];
                if (validSkeletons.has(skeletonId)) {
                  ++nValidSkeletons;
                }
              }
              if (nValidSkeletons > 0) {
                validEntities.push(entity);
              }
            }
          }
          data.entities = validEntities;

          return data;
        })
        .catch(CATMAID.handleError);
    } else {
      return Promise.resolve(data);
    }
  };

  NeuronSearch.prototype.applyFilter = function() {
    this.query(true);
  };

  NeuronSearch.prototype.query = function(initialize)
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
    var namedAsNot = $('input[name=neuron_query_by_name_not]', $widget).prop('checked');
    var namedAsExact = $('input[name=neuron_query_by_name_exact]', $widget).prop('checked');
    var namedAsCaseSenstive = $('input[name=neuron_query_by_name_case_sensitive]', $widget).prop('checked');
    var namedAs = $('input[name=neuron_query_by_name]', $widget).val().trim();
    var annotatedBy = $('select[name=neuron_query_by_annotator]', $widget).val().trim();
    var annotatedFrom = $('input[name=neuron_query_by_start_date]', $widget).val().trim();
    var annotatedTo = $('input[name=neuron_query_by_end_date]', $widget).val().trim();
    var annotations = [];
    let importPartial= $('input[name=neuron_query_import_partial]', $widget).prop('checked');
    let importFull= $('input[name=neuron_query_import_full]', $widget).prop('checked');
    var nSelector = 'name=neuron_query_by_annotation_not';
    var aSelector = 'name=neuron_query_by_annotation';
    var sSelector = 'name=neuron_query_include_subannotation';
    for (var i=0; i<this.nextFieldID; ++i) {
      var a = aSelector;
      var s = sSelector;
      var n = nSelector;
      if (i > 0) {
        a = a + this.widgetID + '_' + i;
        s = s + this.widgetID + '_' + i;
        n = n + this.widgetID + '_' + i;
      }
      // Don't use empty names
      var name = $('input[' + a + ']', $widget).val();
      if (name && name.trim()) {
        annotations.push([
          name,
          $('input[' + s + ']', $widget).is(':checked'),
          $('input[' + n + ']', $widget).is(':checked')
        ]);
      }
    }

    // Build query parameter set
    var params = {};
    if (namedAs) {
      params['name'] = namedAs;
      params['name_not'] = namedAsNot;
      params['name_exact'] = namedAsExact;
      params['name_case_sensitive'] = namedAsCaseSenstive;
    }
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
      var not = annotations[i][2];

      var annotationID = CATMAID.annotations.getID(a);
      var value;
      if (annotationID) {
        // If the annotation matches one particular instance, use it
        value = annotationID;
      } else if ('/' === a.substr(0, 1)) {
        // Otherwise, treat the search term as regular expression if it starts
        // with a forward slash character and filter annotations that match
        var pattern = a.substr(1);
        try {
          var filter  = new RegExp(pattern);
        } catch (error) {
          CATMAID.warn(error);
          return;
        }
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
      } else {
        CATMAID.warn("Couldn't find annotation \"" + a + "\"");
        return;
      }
      if (not) {
        params['not_annotated_with[' + n + ']'] = value;
      } else {
        params['annotated_with[' + n + ']'] = value;
      }
      if (s) params['sub_annotated_with[' + n + ']'] = value;
      ++n;
    }

    if (importFull) {
      params['import_only'] = 'full';
    } else if (importPartial) {
      params['import_only'] = 'partial';
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
    params.with_annotations = this.displayAnnotations;
    params.with_metadata = this.displayMetadata;

    CATMAID.fetch(this.pid + '/annotations/query-targets', 'POST', params)
      .then((function(e) {
        return this.filterResults(e);
      }).bind(this))
      .then((function(e) {
        // Keep a copy of all models that are removed
        var removedModels = this.getSkeletonModels();
        // Unregister last result set from neuron name service
        CATMAID.NeuronNameService.getInstance().unregister(this);

        // Mark entities as unselected if initialized, reuse current
        // selection state otherwise.
        var selectionMap = this.entity_selection_map;
        var selected = initialize ? function() { return false; } :
            function(id) { return !!this[id]; }.bind(selectionMap);

        // Empty selection map and store results
        this.entity_selection_map = {};
        this.entityMap = {};
        this.expansions.clear();
        this.queryResults = [];
        this.paths = {};
        this.queryResults[0] = e.entities;
        this.total_n_results = e.entities.length;
        // Get new models for notification
        var addedModels = this.getSkeletonModels();
        this.queryResults[0].forEach((function(entity) {
          this.entity_selection_map[entity.id] = selected(entity.id);
          this.entityMap[entity.id] = entity;
        }).bind(this));

        // Register search results with neuron name service and rebuild
        // result table.
        var skeletonObject = getSkeletonIDsInResult(e.entities);
        CATMAID.NeuronNameService.getInstance().registerAll(this, skeletonObject,
            this.refresh.bind(this));

        this.triggerRemove(removedModels);
        this.triggerAdd(addedModels);
      }).bind(this))
      .catch(CATMAID.handleError);
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
  NeuronSearch.prototype.invalidateUI = function() {
    var selector = 'table#neuron_annotations_query_results_table' + this.widgetID;
    if ($.fn.DataTable.isDataTable(selector)) {
      var datatable = $(selector).DataTable();
      if (datatable) {
        datatable.rows().invalidate();
      }
    }
  };

  /**
   * Clear all expansions
   */
  NeuronSearch.prototype.removeAllExpansions = function() {
    var $table = $('#neuron_annotations_query_results_table' + this.widgetID);
    var $datatable = $table.DataTable();
    $datatable.rows($('tr[expansion]', $table)).remove();
    $('tr[expanded]', $table).removeAttr('expanded');

    var self = this;
    var expandedModels = {};
    this.expansions.forEach(function(expansionSlot, entity) {
      var expandedEntities = self.queryResults[expansionSlot];
      if (expandedEntities) {
        for (var skid in getSkeletonIDsInResult(expandedEntities)) {
          expandedModels[skid] = self.getSkeletonModel(skid);
        }
      }

      // Delete sub-expansion query result and reference to it
      self.expansions.delete(entity);
      self.queryResults.splice(expansionSlot, 1);
    });

    // Update current result table classes
    this.update_result_row_classes();

    // Find all unique skeletons that now are not available anymore from
    // this widget (i.e. that are not part of any other expansion or the
    // general results).
    var currentModels = this.getSkeletonModels();
    for (var eId in expandedModels) {
      // Make sure we only announce now unavailable skeletons as removed
      if (!(eId in currentModels)) {
        delete expandedModels[eId];
        delete this.entityMap[eId];
      }
    }
    if (!CATMAID.tools.isEmpty(expandedModels)) {
      this.triggerRemove(expandedModels);
    }
  };

  /**
   * Rebuild the search result table.
   */
  NeuronSearch.prototype.refresh = function() {
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
        this.order = datatable.order();
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
    $('#neuron_annotations_query_no_results' + this.widgetID).hide();
    $('#neuron_annotations_query_results' + this.widgetID).show();
    this.update_result_row_classes();
    // Reset annotator constraints
    $( "#neuron_annotations_user_filter" + this.widgetID).combobox(
        'set_value', 'show_all');

    this.makeDataTable();

    // Add handler to the checkbox in front of each entity
    var create_cb_handler = function(widget) {

      let addSkeletonModels = function(target, entity, selected) {
        if (entity.type !== 'neuron') return;
        for (let i=0, max=entity.skeleton_ids.length; i<max; ++i) {
          let model = new CATMAID.SkeletonModel(entity.skeleton_ids[i]);
          model.selected = selected;
          target[model.id] = model;
        }
      };

      return function() {
            var clicked_cb = this;
            var is_checked = this.checked;
            var entity_id = $(this).attr('entity_id');
            let changedEntityIds = [entity_id];
            // Update the entities selection state
            widget.entity_selection_map[entity_id] = is_checked;
            // Find updated skeleton models
            var changedModels = {};
            var entity = widget.entityMap[entity_id];
            if ('neuron' === entity.type) {
              addSkeletonModels(changedModels, entity, is_checked);
            } else if ('annotation' === entity.type) {
              let tr = this.closest('tr');
              let expansionId = parseInt(tr.getAttribute('expanded'), 10);
              // If an annotation is selected and it is open, toggle the selection all the
              // neurons it annotates accordingly
              if (expansionId && !Number.isNaN(expansionId)) {
                let expansionContent = widget.queryResults[expansionId];
                if (expansionContent) {
                  for (let e of expansionContent) {
                    if (e.type === 'neuron') {
                      widget.entity_selection_map[e.id] = is_checked;
                      changedEntityIds.push(e.id);
                      addSkeletonModels(changedModels, e, is_checked);
                    }
                  }
                }
              }
            }
            if (!CATMAID.tools.isEmpty(changedModels)) {
              widget.triggerChange(changedModels);
            }
            // Due to expanded annotations, an entity can appear multiple times. Look
            // therefore for copies of the current one to toggle it as well.
            let updateCheckbox = function() {
              if (this !== clicked_cb) {
                // Set property without firing event
                $(this).prop('checked', is_checked);
              }
            };
            let widgetContaienr = $("#neuron_annotations_query_results_table" + widget.widgetID);
            for (let i=0; i<changedEntityIds.length; ++i) {
              let changedEntityId = changedEntityIds[i];
              widgetContaienr.find('td input[entity_id=' + changedEntityId + ']').each(updateCheckbox);
            }
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
      var key = $(tr)[0].dataset.key;


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
        self.refresh();

        // Find all unique skeletons that now are not available anymore from
        // this widget (i.e. that are not part of any other expansion or the
        // general results).
        var currentModels = self.getSkeletonModels();
        for (var eId in expandedModels) {
          // Make sure we only announce now unavailable skeletons as removed
          if (!(eId in currentModels)) {
            delete expandedModels[eId];
            delete this.entityMap[eId];
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
        let path = [];
        CATMAID.fetch(project.id + '/annotations/query-targets', 'POST', query_data)
          .then(function(e) {
            // Register search results with neuron name service and rebuild
            // result table.
            var skeletonObject = getSkeletonIDsInResult(e.entities);
            CATMAID.NeuronNameService.getInstance().registerAll(self, skeletonObject, function() {
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

              // Mark entities as selected if they are markes as such in the
              // widget.
              let path = self.paths[$(tr)[0].dataset.key];
              e.entities.filter(function(subEntity, i, a) {
                let selected = !!self.entity_selection_map[subEntity.id];
                self.entity_selection_map[subEntity.id] = selected;
                if(!(subEntity.id in self.entityMap)) {
                  self.entityMap[subEntity.id] = subEntity;
                }
                let newPath = [...path, subEntity.id];
                self.paths[newPath.join('-')] = newPath;
                self.add_result_table_row(subEntity, appender, indent + 1, selected, newPath);
              });

              // The order of the query result array doesn't matter.
              // It is therefore possible to just append the new results.
              self.queryResults[sub_id] = e.entities;
              self.expansions.set(entity, sub_id);
              // Update current result table classes
              self.update_result_row_classes();
              self.refresh();
              // Announce new models, if any
              if (newSkeletons.length > 0) {
                var newModels = newSkeletons.reduce(function(o, skid) {
                  o[skid] = self.getSkeletonModel(skid);
                  return o;
                });
                self.triggerAdd(newModels);
              }
            });
          })
          .catch(CATMAID.handleError);
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
      return CATMAID.confirmAndRemoveAnnotations(project.id,
          [neuron_id], [annotation_id]).then((function(data) {
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
          }).bind(widget)).catch(CATMAID.handleError);
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

  NeuronSearch.prototype.update_result_row_classes = function()
  {
    var $tableBody = $('#neuron_annotations_query_results' +
        this.widgetID + ' tbody');
    // First, remove all 'even; and 'odd' classes
    $("tr", $tableBody).removeClass("odd even");
    // Re-add class for currently 'even' and 'odd' rows
    $("tr:nth-child(odd)", $tableBody).addClass("odd");
    $("tr:nth-child(even)", $tableBody).addClass("even");
  };

  NeuronSearch.prototype.add_query_field = function()
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

    // Update 'not' field
    $newRow.find('input[name=neuron_query_by_annotation_not]')
        .prop('checked', false)
        .attr({
          id: 'neuron_query_by_annotation_not' + this.widgetID + '_' +
              this.nextFieldID,
          name: 'neuron_query_by_annotation_not' + this.widgetID + '_' +
              this.nextFieldID,
        });

    // Update the text field attributes.
    var $text = $newRow.find("input[type='text']");
    $text.attr({
        id: 'neuron_query_by_annotation' + this.widgetID + '_' +
            this.nextFieldID,
        name: 'neuron_query_by_annotation' + this.widgetID + '_' +
            this.nextFieldID,
        value: '',
        size: 20,
    });
    $text.val('');
    $text.css('width', '');
    // Add autocompletion to it
    CATMAID.annotations.add_autocomplete_to_input($text);

    // Update the button attributes.
    var $button = $newRow.find("input[type='button']");
    $button.attr('value', '-');
    $button.click(this.remove_query_field.bind(this, this.nextFieldID));
    $("#neuron_query_by_annotator" + this.widgetID).before($newRow);

    // By default, sub-annotations should not be included
    $newRow.find('input[name=neuron_query_include_subannotation]')
        .prop('checked', false)
        .attr({
          id: 'neuron_query_include_subannotation' + this.widgetID + '_' +
              this.nextFieldID,
          name: 'neuron_query_include_subannotation' + this.widgetID + '_' +
              this.nextFieldID
        });

    this.nextFieldID += 1;
  };

  NeuronSearch.prototype.remove_query_field = function(rowNum)
  {
    var $row = $("#neuron_query_by_annotation" + this.widgetID + "_" + rowNum);
    $row.remove();
  };

  /**
   * Update selection state of all checkboxes, based on on the internal
   * selection model.
   */
  NeuronSearch.prototype.updateSelectionUI = function() {
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

  NeuronSearch.prototype.toggle_neuron_selections = function(event)
  {
    // Don't bubble this event up or we sort the name column.
    event.stopPropagation();

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
  NeuronSearch.prototype.get_entities = function(checked)
  {
    var visited = {};
    return this.queryResults.reduce((function(o, qs) {
        if (qs && qs.length > 0) {
          qs.forEach(e => {
              // Avoid duplicates if the same neuron is checked multiple times and
              // add it only if not yet present.
              var valid = (checked === undefined || this.entity_selection_map[e.id] == checked);
              if (valid && !(e.id in visited)) {
                  o.push(e);
                  visited[e.id] = true;
              }
            });
        }
        return o;
      }).bind(this), []);
  };

  NeuronSearch.prototype.get_selected_neurons = function()
  {
    return this.get_entities(true);
  };

  NeuronSearch.prototype.get_unselected_neurons = function()
  {
    return this.get_entities(false);
  };
  /**
   * Refresh display and auto-completion with updated annotation information.
   */
  NeuronSearch.prototype.refresh_annotations = function() {
    // Update auto completion for input fields
    $('.neuron_query_by_annotation_name' + this.widgetID).autocomplete(
        "option", {source: CATMAID.annotations.getAllNames()});
  };

  NeuronSearch.prototype.getEntitiesOnPage = function() {
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
   * Query metadata for results on the current page that no annotations have
   * been queried for before.
   */
  NeuronSearch.prototype.updateMetadata = function() {
    if (!this.displayMetadata) {
      return Promise.resolve();
    }

    // Query metadata for all results that we don't have metadata for yet
    var visibleEntityIds = this.getEntitiesOnPage();
    var skeletonIdMap = this.queryResults.reduce(function(l, entities) {
      return entities.filter(function(e) {
        var onPage = (-1 !== visibleEntityIds.indexOf(e.id));
        // Use only n_nodes as proxy test
        return onPage && e.type === 'neuron' && (!e.hasOwnProperty('n_nodes'));
      });
    }, []).reduce((m, e) => {
      for (let i=0; i<e.skeleton_ids.length; ++i) {
        m.set(e.skeleton_ids[i], e);
      }
      return m;
    }, new Map());

    if (skeletonIdMap.size > 0) {
      return CATMAID.Skeletons.getSummary(project.id, [...skeletonIdMap.keys()])
        .then(json => {
          // Add annotation id, name and annotator to result set
          Object.keys(json).forEach(function(skeletonId) {
            let summary = json[skeletonId];
            var result = skeletonIdMap.get(summary.skeleton_id);
            result.n_nodes = summary.num_nodes;
            result.n_imported_nodes = summary.n_imported_nodes;
            result.cable_length = summary.cable_length;
            result.last_edition_time = summary.last_edition_time;
            result.last_editor_id = summary.last_editor_id;
            result.last_summary_update = summary.last_summary_update;
            result.creation_time = summary.original_creation_time;
          });
        })
        .catch(CATMAID.handleError);
    }
    return Promise.resolve();
  };

  /**
   * Query annotations for results on the current page that no annotations have
   * been queried for before.
   */
  NeuronSearch.prototype.updateAnnotations = function() {
    if (!this.displayAnnotations) {
      return Promise.resolve();
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
      var self = this;
      return CATMAID.Annotations.forTarget(project.id, entityIdsToQuery)
        .then(function(json) {
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
        })
        .catch(CATMAID.handleError);
    }
    return Promise.resolve();
  };

  /**
   * If an annotation user filter is set, this function will hide all annotation
   * objects within the result table that hasn't been linked by the user passed
   * as second argument. Otherwise, it will show all annotations.
   */
  NeuronSearch.prototype.updateAnnotationFiltering = function() {
    var $results= $('#neuron_annotations_query_results' + this.widgetID);
    if (this.annotationUserFilter) {
      $results.find('li[user_id!=' + this.annotationUserFilter + ']').hide();
      $results.find('li[user_id=' + this.annotationUserFilter + ']').show();
    } else {
      $results.find('li').show();
    }
  };

  /**
   * Return name property of an object.
   */
  var getName = function(o) {
    return o.name;
  };

  /**
   * Return a quoted version of the input.
   */
  var quote = function(o) {
    return '"' + o + '"';
  };

  /**
   * Return the comma joined version of a list.
   */
  var joinList = function(l) {
    return l.join(', ');
  };

  /**
   * Export selected neurons in search result as CSV. The first column will be
   * the neuron ID and the second column the neuron name. If annotations are
   * displayed, they are exported as a third column
   */
  NeuronSearch.prototype.exportCSV = function() {
    // Get IDs of selected entities
    var selectedNeurons = this.get_selected_neurons();
    // Cancel if there are no neurons selected
    if (0 === selectedNeurons.length) {
      CATMAID.warn('No neurons selected, nothing to export');
      return true;
    }

    var makeCsvLine = this.displayAnnotations ?
      function(n) {
        // Prepare annotations so that they are represented as a single string,
        // with each annotation quoted also on its own.
        var annotations = (n.annotations || []).map(getName).map(quote).join(', ');
        return [n.id, quote(n.name), quote(annotations)];
      } :
      function(n) {
        return [n.id, quote(n.name)];
      };

    var csv = selectedNeurons.map(makeCsvLine).map(joinList).join('\n');

    var blob = new Blob([csv], {type: 'text/plain'});
    saveAs(blob, 'catmaid_neuron_search.csv');
  };

  // Make neuron search widget available in CATMAID namespace
  CATMAID.NeuronSearch = NeuronSearch;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Neuron Search",
    description: "Search for neurons and annotations",
    key: 'neuron-search',
    creator: NeuronSearch
  });

})(CATMAID);
