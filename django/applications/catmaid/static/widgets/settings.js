/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var SettingsWidget = function() {};

SettingsWidget.prototype = {};

/**
 * Initializes the settings widget in the given container.
 */
SettingsWidget.prototype.init = function(container)
{
  /**
   * Helper function to create a collapsible settings container.
   */
  var addSettingsContainer = function(name, closed)
  {
    var content = $('<div/>').addClass('content');
    if (closed) {
      content.css('display', 'none');
    }
    var sc = $('<div/>')
      .append($('<p/>')
        .addClass('title')
        .append($('<span/>')
          .addClass(closed ? 'extend-box-closed' : 'extend-box-open'))
        .append(name))
      .append(content);

    $(container).append(sc);

    return content;
  };


  // Add collapsing support to all settings containers
  $("p.title", container).click(function() {
    var section = this;
    $(section).next(".content").animate(
      { height: "toggle",
        opacity: "toggle" },
      { complete: function() {
          // change open/close indicator box
          var open_elements = $(".extend-box-open", section);
          if (open_elements.length > 0) {
              open_elements.attr('class', 'extend-box-closed');
          } else {
              $(".extend-box-closed", section).attr('class', 'extend-box-open');
          }
      }});
  });

  return;
};
