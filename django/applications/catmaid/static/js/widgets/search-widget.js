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
          if (data[i].class_name === 'neuron' || data[i].class_name === 'skeleton') {
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
          } else if (data[i].class_name === 'label') {
            // Create a link that will then query, when clicked, for the list of nodes
            // that point to the label, and show a list [1], [2], [3] ... clickable,
            // or better, insert a table below this row with x,y,z,parent skeleton, parent neuron.
            if (data[i].hasOwnProperty('nodes')) {
              var td = $('<td/>');
              row.append(td);
              data[i].nodes.reduce(function(index, node) {
                // Local copies
                var z = parseInt(node.z);
                var y = parseInt(node.y);
                var x = parseInt(node.x);
                var id = parseInt(node.id);
                var skid = parseInt(node.skid);
                td.append(
                  $('<a/>').attr({'id': '' + id})
                           .attr({'href': '#'})
                           .click(function(event) {
                             SkeletonAnnotations.staticMoveTo(z, y, x)
                                .then(function() {
                                  return SkeletonAnnotations.staticSelectNode(id, skid);
                                })
                                .catch(CATMAID.handleError);
                             return false;
                           })
                           .text("[" + index + "]")
                  ).append("&nbsp;");
                if( index % 20 === 0)
                  td.append('<br />');
                return index + 1;
              }, 1);
            } else {
              // no nodes, option to remove the label
              actionLink = $('<a/>');
              actionLink.attr({'id': ''+data[i].id});
              actionLink.attr({'href': '#'});
              actionLink.click(removelabel(data[i].id));
              actionLink.text("Remove label");
              row.append($('<td/>').append(actionLink));
            }
          } else {
            row.append($('<td/>').text('IMPLEMENT ME'));
          }
          row.append($('<td/>').text(i+1));
          tbody.append(row);
        }
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
