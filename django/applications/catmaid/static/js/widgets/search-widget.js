/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var SearchWidget = function() {};

  SearchWidget.prototype.getName = function() {
    return "Search";
  };

  SearchWidget.prototype.getWidgetConfiguration = function() {
    return {
      contentID: "search-window",
      createContent: function(content) {
        this.content = content;
        var form = document.createElement('form');

        var self = this;
        $(content)
          .append($(form)
              .attr('id', 'search-form')
              .attr('autocomplete', 'on')
              .on('submit', function(e) {
                // Submit form in iframe to store autocomplete information
                CATMAID.DOM.submitFormInIFrame(form);
                // Do actual search
                self.search();
                // Cancel submit in this context to not reload the page
                return false;
              })
              .append($('<input type="text" id="search-box" name="search-box" />'))
              .append($('<input type="submit" />')))
          .append('<div id="search-results" />');
      },
      init: function() {
        // Focus search box
        $('input#search-box', this.content).focus();
      }
    };
  };

  SearchWidget.prototype.setSearchingMessage = function(message) {
    $('#search-results', this.content).empty();
    $('#search-results', this.content).append($('<i/>').text(message));
  };

  SearchWidget.createActionLinkHTML = function(searchResult) {
    let className = searchResult.class_name;
    let actions = [];
    if (className === 'neuron' || className === 'skeleton') {
      actions.push(`<a href="#" data-action="select-nearest">Go to nearest node</a>`);
      if( searchResult.class_name === 'skeleton' ) {
        actions.push(`<a href="#" data-action="add-to-selection">Add to Selection Table</a>`);
      }
    } else if (className === 'label') {
      // Create a link that will then query, when clicked, for the list of nodes
      // that point to the label, and show a list [1], [2], [3] ... clickable,
      // or better, insert a table below this row with x,y,z,parent skeleton, parent neuron.
      let treenodes = searchResult.nodes;
      if (treenodes) {
        actions.push('<em>Treenodes:</em>');
        for (let i=0; i<treenodes.length; ++i) {
          let n = treenodes[i];
          actions.push(`<a href="#" data-action="select-node" data-id="${n.id}" data-x="${n.x}" data-y="${n.y}" data-z="${n.z}">${i + 1}</a>`);
        }
      }

      let connectors = searchResult.connectors;
      if (connectors) {
        if (treenodes) {
          actions.push('<br />');
        }
        actions.push('<em>Connectors:</em> ');
        for (let i=0; i<connectors.length; ++i) {
          let n = connectors[i];
          actions.push(`<a href="#" data-action="select-node" data-id="${n.id}" data-x="${n.x}" data-y="${n.y}" data-z="${n.z}">${i + 1}</a>`);
        }
      }

      if (!treenodes && !connectors) {
        // no nodes, option to remove the label
        actions.push(`<a href="#" data-action="remove-label">Remove unused label</a>`);
      }
    } else if (className == 'annotation') {
      actions.push(`<a href="#" data-action="search-annotation">List annotated objects</a>`);
    } else if (className === 'treenode' || className === 'connector') {
      let n = searchResult;
      actions.push(`<a href="#" data-action="select-node" data-id="${n.id}" data-x="${n.x}" data-y="${n.y}" data-z="${n.z}">Go to node</a>`);
    }

    return actions;
  };

  SearchWidget.prototype.search = function() {
    var searchTerm = $('input[name=search-box]', this.content).val();
    if(searchTerm === '') {
      return;
    }

    this.setSearchingMessage('Search in progress...');

    CATMAID.fetch(project.id + '/search', "GET", { substring: searchTerm })
      .then(function(data) {
        if (!data) {
          self.setSearchingMessage('Search failed, received no data.');
          return;
        }

        $('#search-results').empty();
        $('#search-results').append($('<i/>').data('Found '+data.length+' results:'));
        var table = $('<table/>');
        $('#search-results').append(table);
        var tbody = $('<tbody/>');

        let datatable = $(table).DataTable({
          dom: "lfrtip",
          autoWidth: false,
          paging: true,
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          order: [],
          data: data,
          language: {
            search: 'Filter',
          },
          columns: [
            {
              data: "#",
              title: "",
              orderable: true,
              width: '3em',
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return meta.row + 1;
              }
            },
            {
              data: "id",
              title: "Id",
              orderable: true,
              width: '10em',
              class: 'cm-center',
              render: function(data, type, row, meta) {
                return row.id;
              }
            },
            {
              title: "Name",
              orderable: true,
              width: '50%',
              render: function(data, type, row, meta) {
                return row.name || '(none)';
              }
            },
            {
              data: 'class_name',
              title: "Type",
              orderable: true,
              width: '10em',
              class: 'cm-center',
            },
            {
              title: "Action",
              orderable: false,
              render: function(data, type, row, meta) {
                return SearchWidget.createActionLinkHTML(row).join(' ');
              }
            },
          ],
        })
        .on('click', 'a[data-action=select-node]', function() {
          let z = parseFloat(this.dataset.z);
          let y = parseFloat(this.dataset.y);
          let x = parseFloat(this.dataset.x);
          let id = parseInt(this.dataset.id);
          SkeletonAnnotations.staticMoveTo(z, y, x)
            .then(function() {
              return SkeletonAnnotations.staticSelectNode(id);
            })
            .catch(CATMAID.handleError);
        })
        .on('click', 'a[data-action=search-annotation]', function() {
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let data =  $(table).DataTable().row(tr).data();
          let navigator = new CATMAID.NeuronNavigator();
          WindowMaker.create('neuron-navigator', navigator);
          navigator.set_annotation_node(data.name, data.id);
        })
        .on('click', 'a[data-action=remove-label]', function() {
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let data =  $(table).DataTable().row(tr).data();
          CATMAID.fetch(project.id + '/label/remove', "POST", {
            label_id: data.id,
          })
          .then(function(json) {
            CATMAID.msg('Success', 'Label removed');
          })
          .catch(CATMAID.handleError);
        })
        .on('click', 'a[data-action=select-nearest]', function() {
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let data =  $(table).DataTable().row(tr).data();
          CATMAID.TracingTool.goToNearestInNeuronOrSkeleton(data.class_name, data.id);
        })
        .on('click', 'a[data-action=add-to-selection]', function() {
          let table = $(this).closest('table');
          let tr = $(this).closest('tr');
          let data =  $(table).DataTable().row(tr).data();
          let selection = CATMAID.SelectionTable.getLastFocused();
          selection.addSkeletons([data.id]);
        });
    });
  };

  // Export
  CATMAID.SearchWidget = SearchWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Generic Search",
    description: "Search by names and IDs",
    creator: SearchWidget,
    key: "search"
  });

})(CATMAID);
