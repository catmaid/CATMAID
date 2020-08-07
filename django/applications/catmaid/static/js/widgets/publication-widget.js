/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Prepare sets of neurons for publication by making it easy to export a
   * subset of the dataset so that it can be imported into other CATMAID
   * instances.
   *
   * This is done mainly through annotations. Individual neurons are typically
   * part of publications and this widget can add information related to such a
   * publication through annotations to individual neurons. The way the
   * Publication Widget annotates neurons and interprets annotations on neurons
   * is like the following: Publications go with a citation reference, for
   * instance "Zheng, Lauritzen et al. 2018". A citation reference is unique in
   * CATMAID and is represented as an annotation named like the citation
   * reference, prefixed with "Paper:" on each neuron, e.g. "Paper: Zheng,
   * Lauritzen et al. 2018". The publication annotations would then be used to
   * annotate individual skeletons that belong the respective publication.
   *
   * A publication in the same year by the same people like another publication
   * would be annotated differently and CATMAID recommends appending a suffix
   * letter, like 'a', b', 'c' and so forth. It would for instance be common
   * that neurons are annotated with a preprint citation and a journal citation.
   * If they happen to be in the same year, the preprint annotation would be
   * e.g. "Paper: Zheng, Lauritzen et al. 2018a" and "Paper: Zheng, Lauritzen
   * et al. 2018b".
   *
   * Citation annotations are themselves annotated with either "Published" or
   * "Preprint" to filter easier by publication medium. Additionally, citation
   * references can have URLs linked to them by annotating them with
   * "publication_link: <doi-url>".
   *
   * To reference the date/time of the data snapshot, to which a publication
   * refers a date and time can be stored for a citation. This is done in form
   * of a "date_data_snapshot: <iso-date-utc>" annotation on the citation. This
   * can for instance be used to do data diffs between different points in time
   * in the 3D Viewer.
   *
   * Additionally, this widget makes it also possible to select what data should
   * be published for a publication/citation. If the actual data export includes
   * connectors, annotations and/or tags, their export can be made conditional
   * based on annotations on a publication annotation. If a publication
   * annotation is marked with "export: no-connectors", "export: no-tags" or
   * "export: no-annotations", the respective meta data won't be exported for
   * this publication. The exporter respects these annotations if a
   * meta-annotation is provided that marks all those papers that should try to
   * get their export settings through annotations. If the
   * ``--settings-meta-annotation <meta-annotation>`` is provided (e.g.
   * ``--settings-meta-annotation Published``), the per-publication settings
   * will be used for the matched skeletons. Typically, this is the same
   * annotation as provided by ``--required-annotation``.
   *
   * Which annotations and tags can in general be part of an export is
   * determined by the "Exportable" annotation on individual tags and
   * annotations (besides the publication hierarchy). The UI only allows to
   * change this for users with can_administer permissions on a project.
   *
   * Using the "locked" annotations, citation annotations can be locked and no
   * other annotation can be added until this locked annotation is removed. The
   * same permissions that apply to nodes apply to "locked" annotations.
   */
  let PublicationWidget = function() {
    InstanceRegistry.call(this);

    this.widgetID = this.registerInstance();
    this.idPrefix = `publication-widget${this.widgetID}-`;

    let update = this.update.bind(this);
    this.currentSkeletons = new CATMAID.BasicSkeletonSource(this.getName(), {
      owner: this,
      handleAddedModels: update,
      handleChangedModels: update,
      handleRemovedModels: update
    });

    CATMAID.DOM.asTabbedWidget(this, PublicationWidget.Modes,
        ['publications'], 'publications', () => this.update());
  };

  PublicationWidget.prototype = Object.create(InstanceRegistry.prototype);
  PublicationWidget.prototype.constructor = PublicationWidget;


  PublicationWidget.Settings = new CATMAID.Settings(
      'publication-widget',
      {
        version: 1,
        entries: {
          'publication_annotations': {
            default: ['Published', 'papers', 'paper'],
          },
          'export_tags_by_default': {
            default: true,
          },
          'export_annotations_by_default': {
            default: true,
          },
          'export_connector_default_mode': {
            default: 'export: intra-connectors-and-original-placeholders',
          },
        },
      });

  PublicationWidget.prototype.destroy = function() {
    this.unregisterInstance();
  };

  PublicationWidget.prototype.getName = function() {
    return "Publications " + this.widgetID;
  };

  PublicationWidget.prototype.getWidgetConfiguration = function() {
    return {
      class: 'publication-widget',
      createControls: (controls) => {
        // Known publication annotations: Published, Preprint
        this.createTabControls(controls, '-publication-widget');
      },

      /**
       * The main view for published neurons consists of two tabs:
       *
       * 1. A list of all publications and their detailed export settings.
       * 2. This is a table with all known publica
       */
      createContent: (content) => {
        this.content = content;
      },
      init: () => {
        this.update();
      },
      helpPath: 'publication-widget.html',
    };
  };

  PublicationWidget.prototype.refresh = function() {
    this.refreshTabContent();
  };

  PublicationWidget.prototype.update = function() {
    this.updateTabContent(this.content);
  };

  PublicationWidget.prototype.addPublication = function(name, isPreprint, isPublic) {

  };

  function toSelectOptionSelection(v) {
    return v ? ' selected' : '';
  }

  PublicationWidget.Modes = {
    publications: {
      title: 'Publications',
      createControls: function(widget) {
        let newPublicationSection = document.createElement('span');
        newPublicationSection.classList.add('section-header');
        newPublicationSection.appendChild(document.createTextNode('New publication'));
        return [{
          type: 'button',
          label: 'Refresh',
          onclick: e => {
            widget.refresh();
          },
        }, {
          type: 'child',
          element: newPublicationSection,
        }, {
          type: 'text',
          label: 'Name',
          title: 'The name of a new publication annotation.',
          id: `${widget.idPrefix}new-pub-name`,
        }, {
          type: 'checkbox',
          label: 'Preprint',
          title: 'If the new publication is a preprint, it will be annotated with "Preprint".',
          id: `${widget.idPrefix}new-pub-preprint`,
        }, {
          type: 'checkbox',
          label: 'Public',
          title: 'If the new publication is public, it will be annotated with "Published" and by default exported on project exports.".',
          id: `${widget.idPrefix}new-pub-public`,
        }, {
        }, {
          type: 'button',
          label: 'Add new publication',
          title: 'This will add a new publication annotation, similar to the ones listed below.',
          onclick: e => {
            let name = document.getElementById(`${widget.idPrefix}new-pub-name`).value.trim();
            let isPreprint = document.getElementById(`${widget.idPrefix}new-pub-preprint`).checked;
            let isPublic = document.getElementById(`${widget.idPrefix}new-pub-public`).checked;
            let metaAnnotations = CATMAID.PublicationWidget.Settings.session.publication_annotations;
            if (!metaAnnotations || metaAnnotations.length < 1) {
              CATMAID.warn("Please configure publication annotations in Settings Widget");
              return;
            }
            metaAnnotations = [metaAnnotations[0]];

            CATMAID.Publication.addPublication(project.id, name, isPreprint, isPublic, metaAnnotations)
              .then(result => {
                widget.refresh();
              })
              .catch(CATMAID.handleError);
          },
        }];
      },
      /**
       * Create a new datatable that shows each publication annotation. These
       * are annotations that are annotated with "Publication". Note, this
       * doesn't mean that the neurons of this publication are actually
       * published already.
       */
      createContent(content, widget) {
        let table = content.appendChild(document.createElement('table'));
        table.setAttribute('id', `${widget.idPrefix}publication-table`);

        let datatable = $(table).DataTable({
          dom: 'lfrtip',
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          ajax: function(data, callback, settings) {
            CATMAID.Publication.listAllPublications(project.id,
                CATMAID.PublicationWidget.Settings.session.publication_annotations)
              .then(function(result) {
                let publications = result || [];
                callback({
                  draw: data.draw,
                  data: publications,
                  recordsTotal: publications.length,
                  recordsFiltered: publications.length
                });
              })
              .catch(CATMAID.handleError);
          },
          order: [[3, 'desc']],
          columns: [{
              title: "",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return `<input type="checkbox"></input>`;
              }
            }, {
              data: "id",
              title: "ID",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.id;
              }
            }, {
              data: "name",
              title: "Name",
              orderable: true,
              class: 'cm-center',
              render: function(data, type, row, meta) {
                if ("display") {
                  return '<a href="#" data-action="select-group" data-group-id="' +
                      row.id + '" >' + row.name + '</a>';
                } else {
                  return row.name;
                }
              }
            }, {
              data: "edition_time",
              title: "Last update (UTC)",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (type === 'display') {
                  if (!row.edition_time) return '-';
                  var date = CATMAID.tools.isoStringToDate(row.creation_time);
                  if (date) {
                    return CATMAID.tools.dateToString(date);
                  } else {
                    return "(parse error)";
                  }
                } else {
                  return data;
                }
              }
            }, {
              data: "public",
              title: "Public",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                return data ? "Yes" : "No";
              },
            }, {
              data: "preprint",
              title: "Preprint",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                return data ? "Yes" : "No";
              },
            /*
            }, {
              data: "treenodes",
              title: "Treenodes",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                // State order: checked unchecked indeterminate
                let state = data ? 0 : (data === undefined ? 2 : 1);
                return `<input type="checkbox" data-role="export-treenodes" data-state=${state} ${data ? "checked" : ""} \>`;
              },
            */
            }, {
              data: "connectors",
              title: "Connectors",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                // State order: checked checked indeterminate
                let state = data ? 0 : (data === null ? 2 : 1);
                let inheritClass = state < 2 ? '' : 'highlight';
                let CA = CATMAID.Publication.ConnectorAnnotations;
                let value = data ? data : null;
                let [a, b, c, d, e] = [
                    value === CA.ConnectorsNo,
                    value === CA.ConnectorsOnlyIntra,
                    value === CA.ConnectorsNewPlaceholders,
                    value === CA.ConnectorsOriginalPlaceholders,
                    value === null
                ].map(toSelectOptionSelection);
                let defaultMode = CATMAID.PublicationWidget.Settings.session.export_connector_default_mode;
                let defaultModeLabel = 'None';
                if (defaultMode === CA.ConnectorsOnlyIntra) defaultMode = 'Only intra-set links';
                else if (defaultMode === CA.ConnectorsNewPlaceholders) defaultModeLabel = 'All links + new placeholders';
                else if (defaultMode === CA.ConnectorsOriginalPlaceholders) defaultModeLabel = 'All links + original placeholders';

                let options = `<option value='${CA.ConnectorsNo}'${a}>None</option><option value='${CA.ConnectorsOnlyIntra}'${b}>Only intra-set links (1)</option><option value='${CA.ConnectorsNewPlaceholders}'${c}>All links + new placeholders (2)</option><option value='${CA.ConnectorsOriginalPlaceholders}'${d}>All links + original placeholders (3)</option><option value ='default'${e}>Inherit (${defaultModeLabel})</option>`;
                return `<select onfocus="this.selectedIndex = -1;" style="width: 10em" data-role="export-connectors" data-state=${state} \>${options}</select> <i data-action="reset-connectors-to-inherit" title="Enable/disable use of project wide default" class="reset-to-inherit fa fa-asterisk ${inheritClass}" />`;
              },
            }, {
              data: "tags",
              title: "Tags",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                // State order: checked unchecked indeterminate
                let state = data ? 0 : (data === null ? 2 : 1);
                let inheritClass = state < 2 ? '' : 'highlight';
                let value = data !== null ? data :
                    CATMAID.PublicationWidget.Settings.session.export_tags_by_default;
                return `<input type="checkbox" data-role="export-tags" data-state=${state} ${value ? "checked" : ""} /> <i data-action="reset-tags-to-inherit" title="Enable/disable use of project wide default" class="reset-to-inherit fa fa-asterisk ${inheritClass}" />`;
              },
            }, {
              data: "annotations",
              title: "Annotations",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                // State order: checked unchecked indeterminate
                let state = data ? 0 : (data === null ? 2 : 1);
                let inheritClass = state < 2 ? '' : 'highlight';
                let value = data !== null ? data :
                    CATMAID.PublicationWidget.Settings.session.export_annotations_by_default;
                return `<input type="checkbox" data-role="export-annotations" data-state=${state} ${value ? "checked" : ""} \> <i data-action="reset-annotations-to-inherit" title="Enable/disable use of project wide default" class="reset-to-inherit fa fa-asterisk ${inheritClass}" />`;
              },
            }, {
              data: "targets",
              title: "# Neurons",
              class: "cm-center",
              searchable: true,
              orderable: true,
              render: function(data, type, row, meta) {
                if (!data) return '-';
                return `<a data-action="select-skeletons" href="#">${data.length}</a>`;
              },
            }],
          createdRow: function(row, data, dataIndex) {
            if (data.connectors === 'placeholders') {
              let checkbox = row.querySelector('input[data-role=export-connectors]');
              checkbox.indeterminate = true;
              checkbox.dataset.state = 2;
            }
          },
        }).on('change', 'input[type=checkbox][data-role=export-treenodes]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          data.treenodes = this.checked;
          let newAnnotations = this.checked ? ['export: treenodes'] : ['export: no-treenodes'];
          CATMAID.Annotations.replaceAnnotations(project.id, [data.id],
              ['export: treenodes', 'export: no-treenodes'], newAnnotations)
            .then(() => widget.refresh())
            .catch(CATMAID.handleError);
        }).on('change', 'input[type=checkbox][data-role=export-tags]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          data.tags = this.checked;
          let newAnnotations = this.checked ? ['export: tags'] : ['export: no-tags'];
          CATMAID.Annotations.replaceAnnotations(project.id, [data.id],
              ['export: tags', 'export: no-tags'], newAnnotations)
            .then(() => widget.refresh())
            .catch(CATMAID.handleError);
        }).on('change', 'input[type=checkbox][data-role=export-annotations]', function() {
          let data = datatable.row($(this).parents('tr')).data();
          data.annotations = this.checked;
          let newAnnotations = this.checked ? ['export: annotations'] : ['export: no-annotations'];
          CATMAID.Annotations.replaceAnnotations(project.id, [data.id],
              ['export: annotations', 'export: no-annotations'], newAnnotations)
            .then(() => widget.refresh())
            .catch(CATMAID.handleError);
        }).on('change', 'select[data-role=export-connectors]', function(e) {
          let data = datatable.row($(this).parents('tr')).data();
          let newAnnotation = this.value;
          if (newAnnotation === 'default') {
            CATMAID.Annotations.replaceAnnotations(project.id, [data.id],
                CATMAID.Publication.ConnectorAnnotationTerms, [])
            .then(() => widget.refresh())
            .catch(CATMAID.handleError);
            return;
          }
          if (CATMAID.Publication.ConnectorAnnotationTerms.indexOf(this.value) === -1) {
            CATMAID.warn(`Could not find connector export annotation "${this.value}"`);
            return;
          }
          CATMAID.Annotations.replaceAnnotations(project.id, [data.id],
              CATMAID.Publication.ConnectorAnnotationTerms, [newAnnotation])
            .then(() => widget.refresh())
            .catch(CATMAID.handleError);
        }).on('click', 'a[data-action=select-group]', (e) => {
          let data = datatable.row($(e.target).parents('tr')).data();
          var NN = new CATMAID.NeuronNavigator();
          // Create a new window, based on the newly created navigator
          WindowMaker.create('neuron-navigator', NN);
          // Select the cloned node in the new navigator
          NN.set_annotation_node(data.name, data.id);
        }).on('click', 'a[data-action=select-skeletons]', (e) => {
          let data = datatable.row($(e.target).parents('tr')).data();
          widget.listSkeletonsInPublication(data.name);
        }).on('click', 'i[data-action=reset-tags-to-inherit]', (e) => {
          let data = datatable.row($(e.target).parents('tr')).data();
          let annotations = ['export: tags', 'export: no-tags'];
          let newAnnotation = data.tags === null ?
              (CATMAID.PublicationWidget.Settings.session.export_tags_by_default ?
                  annotations[0] : annotations[1]) : [];
          CATMAID.Annotations.replaceAnnotations(project.id, [data.id],
              annotations, newAnnotation)
            .then(() => widget.refresh())
            .catch(CATMAID.handleError);
        }).on('click', 'i[data-action=reset-annotations-to-inherit]', (e) => {
          let data = datatable.row($(e.target).parents('tr')).data();
          let annotations = ['export: annotations', 'export: no-annotations'];
          let newAnnotation = data.annotations === null ?
              (CATMAID.PublicationWidget.Settings.session.export_annotations_by_default ?
                  annotations[0] : annotations[1]) : [];
          CATMAID.Annotations.replaceAnnotations(project.id, [data.id],
              annotations, newAnnotation)
            .then(() => widget.refresh())
            .catch(CATMAID.handleError);
        }).on('click', 'i[data-action=reset-connectors-to-inherit]', (e) => {
          let data = datatable.row($(e.target).parents('tr')).data();
          let newAnnotation = data.connectors === null ?
              [CATMAID.PublicationWidget.Settings.session.export_connector_default_mode] : [];
          CATMAID.Annotations.replaceAnnotations(project.id, [data.id],
              CATMAID.Publication.ConnectorAnnotationTerms, newAnnotation)
            .then(() => widget.refresh())
            .catch(CATMAID.handleError);
        });
      },
      refresh: function(widget) {
        let table = document.getElementById(`${widget.idPrefix}publication-table`);
        if (table) {
          $(table).DataTable().ajax.reload();
        }
      }
    },
  };

  /**
   * Open a Selection Table with the skeletons of thie passed in annotation name.
   */
  PublicationWidget.prototype.listSkeletonsInPublication = function(annotationName) {
    CATMAID.Skeletons.byAnnotation(project.id, [annotationName], true, undefined, false, true)
      .then(response => {
        if (!response || response.length === 0) {
          CATMAID.warn('No skeletons found');
          return;
        }
        // Open
        var ST = new CATMAID.SelectionTable();
        // Create a new window, based on the newly created table and add
        // skeletons.
        WindowMaker.create('selection-table', ST, true);
        ST.addSkeletons(response);
      })
      .catch(CATMAID.handleError);
  };

  // Export widget
  CATMAID.PublicationWidget = PublicationWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: 'Publication widget',
    description: 'Prepare neurons for publication',
    key: 'publication-widget',
    creator: PublicationWidget
  });

})(CATMAID);
