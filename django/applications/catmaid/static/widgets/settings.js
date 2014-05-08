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
  var addSettingsContainer = function(parent, name, closed)
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

    $(parent).append(sc);

    return content;
  };

  /**
   * Helper function to create a checkbox with label.
   */
  var createCheckboxSetting = function(name, handler)
  {
    var cb = $('<input/>').attr('type', 'checkbox');
    if (handler) {
      cb.change(handler);
    }
    var label = $('<div/>')
      .addClass('setting')
      .append($('<label/>').append(cb).append(name));

    return label;
  };

  /**
   * Helper function to create a text input field with label.
   */
  var createInputSetting = function(name, val, handler)
  {
    var input = $('<input/>').attr('type', 'text').val(val);
    var label = $('<div/>')
      .addClass('setting')
      .append($('<label/>')
        .append($('<span/>').addClass('description').append(name))
        .append(input));

    return label;
  };


  // Grid settings
  var ds = addSettingsContainer(container, "Grid overlay");
  // General grid visibility
  $(ds).append(createCheckboxSetting("Show grid on open stacks", function() {
        // Add a grid layer to all open stacks
        if (this.checked) {
          project.getStacks().forEach(function(s) {
            s.addLayer("grid", new GridLayer(s));
            s.redraw();
          });
        } else {
          project.getStacks().forEach(function(s) {
            s.removeLayer("grid");
          });
        }
      }))
  // Grid cell dimensions and offset
  var gridCellWidth = createInputSetting("Cell width (nm)", 1000);
  var gridCellHeight = createInputSetting("Cell height (nm)", 1000);
  var gridCellXOffset = createInputSetting("X offset (nm)", 0);
  var gridCellYOffset = createInputSetting("Y offset (nm)", 0);
  $(ds).append(gridCellWidth);
  $(ds).append(gridCellHeight);
  $(ds).append(gridCellXOffset);
  $(ds).append(gridCellYOffset);
  var gridUpdate = function() {
    // Get current settings
    var cellWidth = parseInt($("input", gridCellWidth).val());
    var cellHeight = parseInt($("input", gridCellHeight).val());
    var xOffset = parseInt($("input", gridCellXOffset).val());
    var yOffset = parseInt($("input", gridCellYOffset).val());
    var lineWidth = parseInt($("input", gridLineWidth).val());
    // Update grid, if visible
    project.getStacks().forEach(function(s) {
      var grid = s.getLayer("grid");
      if (grid) {
        grid.setOptions(cellWidth, cellHeight, xOffset, yOffset, lineWidth);
        s.redraw();
      }
    });
  }
  $("input[type=text]", ds).spinner({
    min: 0,
    change: gridUpdate,
    stop: gridUpdate
  });
  // Grid line width
  var gridLineWidth = createInputSetting("Line width (px)", 1);
  $(ds).append(gridLineWidth);
  $("input[type=text]", gridLineWidth).spinner({
    min: 1,
    change: gridUpdate,
    stop: gridUpdate
  });


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
