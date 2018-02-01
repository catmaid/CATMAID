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


  let addNodeEntry = function(node, i) {
    let attributes = {
      'data-action': 'select-node',
      'data-id': '' + node.id,
      'data-x': node.x,
      'data-y': node.y,
      'data-z': node.z,
      'href': '#'
    };
    let oneBasedIndex = i + 1;
    this.append($('<a/>').attr(attributes)
      .text("[" + oneBasedIndex + "]")).append("&nbsp;");
    if (oneBasedIndex % 20 === 0) {
      this.append('<br />');
    }
  };

  let selectNode = function(e) {
    var z = parseFloat(this.dataset.z);
    var y = parseFloat(this.dataset.y);
    var x = parseFloat(this.dataset.x);
    var id = parseInt(this.dataset.id);
    SkeletonAnnotations.staticMoveTo(z, y, x)
      .then(function() {
        return SkeletonAnnotations.staticSelectNode(id);
      })
      .catch(CATMAID.handleError);
  };

  let searchAnnotation = function() {
    let annotation = this.dataset.annotation;
    let annotationId = parseInt(this.dataset.annotationId, 10);
    var navigator = new CATMAID.NeuronNavigator();
    WindowMaker.create('neuron-navigator', navigator);
    navigator.set_annotation_node(annotation, annotationId);
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
        tbody.append('<tr><th></th><th>ID</th><th>Name</th><th>Class</th><th>Action</th><th></th></tr>');
        table.append(tbody);
        var action = function(type) {
          return function() {
              CATMAID.TracingTool.goToNearestInNeuronOrSkeleton(type, parseInt($(this).attr('id')));
              return false;
          };
        };
        var actionaddstage = function(type) {
          return function() {
            // Find an open Selection, or open one if none
            var selection = CATMAID.SelectionTable.prototype.getOrCreate();
            selection.addSkeletons([parseInt($(this).attr('id'))]);
            return false;
          };
        };
        var removelabel = function(id) {
          return function() {
            CATMAID.fetch(project.id + '/label/remove', "POST", {
              label_id: id
            })
            .then(function(json) {
              CATMAID.msg('Success', 'Label removed');
            })
            .catch(CATMAID.handleError);
          };
        };
        for (var i = 0; i < data.length; ++i) {
          var row = $('<tr/>');
          row.append($('<td/>').text(i+1));
          row.append($('<td/>').text(data[i].id));
          row.append($('<td/>').text(data[i].name));
          row.append($('<td/>').text(data[i].class_name));
          let className = data[i].class_name;
          if (className === 'neuron' || className === 'skeleton') {
            var tdd = $('<td/>');
            var actionLink = $('<a/>');
            actionLink.attr({'id': ''+data[i].id});
            actionLink.attr({'href': '#'});
            actionLink.click(action(data[i].class_name));
            actionLink.text("Go to nearest node");
            tdd.append(actionLink);
            if( data[i].class_name === 'skeleton' ) {
              actionLink = $('<a/>');
              actionLink.attr({'id': ''+data[i].id});
              actionLink.attr({'href': '#'});
              actionLink.click(actionaddstage(data[i].class_name));
              actionLink.text(" Add to selection table");
              tdd.append(actionLink);
            }
            row.append(tdd);
          } else if (className === 'label') {
            var td = $('<td/>');
            // Create a link that will then query, when clicked, for the list of nodes
            // that point to the label, and show a list [1], [2], [3] ... clickable,
            // or better, insert a table below this row with x,y,z,parent skeleton, parent neuron.
            let treenodes = data[i].hasOwnProperty('nodes');
            if (treenodes) {
              td.append('<em>Treenodes:</em> ');
              data[i].nodes.forEach(addNodeEntry, td);
            }

            let connectors = data[i].hasOwnProperty('connectors');
            if (connectors) {
              if (treenodes) {
                td.append('<br />');
              }
              td.append('<em>Connectors:</em> ');
              data[i].connectors.forEach(addNodeEntry, td);
            }

            if (!treenodes && !connectors) {
              // no nodes, option to remove the label
              actionLink = $('<a/>');
              actionLink.attr({'id': ''+data[i].id});
              actionLink.attr({'href': '#'});
              actionLink.click(removelabel(data[i].id));
              actionLink.text("Remove label");
              td.append(actionLink);
            }

            row.append(td);
          } else if (className == 'annotation') {
            var td = $('<td/>');
            let link = $('<a />')
              .attr({
                'href': '#',
                'data-annotation': data[i].name,
                'data-annotation-id': data[i].id,
                'data-action': 'search-annotation'
              })
              .text('List targets');
            td.append(link);
            row.append(td);
          } else {
            row.append($('<td/>').text('IMPLEMENT ME'));
          }
          row.append($('<td/>').text(i+1));
          tbody.append(row);
        }

        tbody
          .on('click', 'a[data-action=select-node]', selectNode)
          .on('click', 'a[data-action=search-annotation]', searchAnnotation);
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
