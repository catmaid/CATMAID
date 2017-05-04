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

        $(content)
          .append($(form)
              .attr('id', 'search-form')
              .attr('autocomplete', 'on')
              .on('submit', function(e) {
                // Submit form in iframe to store autocomplete information
                CATMAID.DOM.submitFormInIFrame(form);
                // Do actual search
                CATMAID.TracingTool.search();
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

  // Export
  CATMAID.SearchWidget = SearchWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    creator: SearchWidget,
    key: "search"
  });

})(CATMAID);
