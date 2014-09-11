/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var VennDiagram = function() {
  this.widgetID = this.registerInstance();
  this.registerSource();

  this.groups = [];
  this.selected = {}; // skid vs model
};

VennDiagram.prototype = {};
$.extend(VennDiagram.prototype, new InstanceRegistry());
$.extend(VennDiagram.prototype, new SkeletonSource());

VennDiagram.prototype.getName = function() {
  return "Venn Diagram " + this.widgetID;
};

VennDiagram.prototype.destroy = function() {
  this.unregisterInstance();
  this.unregisterSource();

  Object.keys(this).forEach(function(key) { delete this[key]; }, this);
};

VennDiagram.prototype.clear = function() {
  this.groups = [];
  this.selected = {};
  delete this.diagram;
  $('#venn_diagram_div' + this.widgetID).empty();
};

VennDiagram.prototype.getSkeletonModels = function() {
    return this.groups.reduce(function(o, group) {
        return Object.keys(group.models).reduce(function(o, skid) {
            o[skid] = group.models[skid];
            return o;
        }, o);
    }, {});
};

VennDiagram.prototype.getSelectedSkeletonModels = function() {
    return this.selected;
};

VennDiagram.prototype.Group = function(models, name, color) {
    this.models = models;
    this.name = name;
    this.color = color;
};

/** Appends skeletons as a group*/
VennDiagram.prototype.append = function(models) {
    var visible = Object.keys(models).reduce(function(o, skid) {
        var model = models[skid];
        if (model.selected) o[skid] = model;
        return o;
    }, {});
    if (0 === Object.keys(visible).length) return;

    // Add new group
    var options = new OptionsDialog("Group properties");
    options.appendField("Name:", "vd-name", "", null);
    var display = document.createElement('input');
    display.setAttribute('type', 'button');
    display.setAttribute('value', 'Color');
    var default_color = '#aaaaff';
    $(display).css("background-color", default_color);
    options.dialog.appendChild(display);
    var div = document.createElement('div');
    options.dialog.appendChild(div);
    var cw = Raphael.colorwheel(div, 150);
    cw.color(default_color);
    cw.onchange(function(color) {
      $(display).css("background-color", '#' + parseColorWheel(color).getHexString());
    });

    var self = this;

    options.onOK = function() {
        var label = $('#vd-name').val();
        if (label && label.length > 0) label = label.trim();
        else {
            return alert("Must provide a group name!");
        }
        self.groups.push(new VennDiagram.prototype.Group(
                    visible,
                    label,
                    parseColorWheel(cw.color())));

        // Reorder from large to small, so that small ones end up on top
        self.groups.sort(function(g1, g2) {
            var s1 = Object.keys(g1.models).length,
                s2 = Object.keys(g2.models).length;
            return s1 === s2 ? 0 : (s1 > s2 ? -1 : 1);
        });

        self.redraw();
    };

    options.show(300, 300, true);
};

VennDiagram.prototype.redraw = function() {
    this.sets = this.groups.map(function(group) {
        return {label: group.name + " (" + Object.keys(group.models).length + ")",
                size: Object.keys(group.models).length};
    });

    var pairs = this.groups.map(function(group) {
        return {g: group,
                skids: Object.keys(group.models)};
    });

    this.overlaps = [];

    for (var k=0, l=pairs.length; k<l; ++k) {
        var s1 = pairs[k].skids;
        for (var j=k+1; j<l; ++j) {
            var m2 = pairs[j].g.models;
            var common = s1.reduce(function(c, skid1) {
                if (skid1 in m2) c[skid1] = m2[skid1];
                return c;
            }, {});
            this.overlaps.push({
                sets: [k, j],
                size: Object.keys(common).length, // can be zero
                common: common});
        }
    }

    this.draw();
};

VennDiagram.prototype.draw = function() {
  var containerID = '#venn_diagram_div' + this.widgetID,
      container = $(containerID);

  // Clear existing plot if any
  container.empty();

  if (0 === this.groups.length || !this.sets || !this.overlaps) return;

  // Dimensions and padding
  var margin = {top: 20, right: 20, bottom: 30, left: 40},
      width = container.width() - margin.left - margin.right,
      height = container.height() - margin.top - margin.bottom;

  var positions;
  if (this.groups.length > 3) positions = venn.venn(this.sets, this.overlaps, {layoutFunction: venn.classicMDSLayout});
  else positions = venn.venn(this.sets, this.overlaps);

  var parameters = {
      opacity: 0.4,
      textStrokeColours: function() { return 'none'; },
      textFillColours: (function(i) {
          // To psychodelic:
          // return '#' + this.groups[i].color.clone().offsetHSL(0.5, 0, 0).getHexString();
          return '#000000';
        }).bind(this),
      circleFillColours: (function(i) {
          return '#' + this.groups[i].color.getHexString();
        }).bind(this)
  };
 
  this.diagram = venn.drawD3Diagram(d3.select(containerID), positions, width, height, parameters);

  var self = this;
    
  var click = function(d, i) {
      // Clear selection
      self.selected = {};
      var label = $('#venn_diagram_sel' + self.widgetID);
      label.empty();

      // Check if removing a group
      if (d3.event.shiftKey) {
          if (confirm("Remove group '" + self.sets[i].label + "' ?")) {
             self.groups.splice(i, 1);
             self.redraw();
          }
          return;
      }

      // find circles intersected by the click
      var e = d3.mouse(this),
          x = e[0],
          y = e[1],
          intersecting = [];
      self.diagram.svg.selectAll('circle').each(function(circle, k) {
          var dx = circle.x - x,
              dy = circle.y - y,
              d = dx * dx + dy * dy;
          if (d < circle.radius * circle.radius) {
              intersecting.push(k);
          }
      });

      if (intersecting.length > 1) {
          // Potential intersection (may be false due to layout impossibility)
          var search = self.overlaps.reduce(function(r, overlap) {
              if (0 === overlap.size) {
                  r.n_empty += 1;
                  return r;
              }
              if (   -1 !== intersecting.indexOf(overlap.sets[0])
                  && -1 !== intersecting.indexOf(overlap.sets[1])) {
                  Object.keys(overlap.common).reduce(function(models, skid) {
                      models[skid] = overlap.common[skid];
                      return models;
                  }, r.models);
                  return r;
              }
              return r;
          }, {n_empty: 0, models: {}});

          if (search.n_empty === intersecting.length -1 && 0 === Object.keys(search.models).length) {
              // False intersection, it's a single group
              intersecting = intersecting.filter(function(k) { return k > 0; });
          }
      }

      if (intersecting.length > 1) {
          self.selected = search.models;
          var size = Object.keys(self.selected).length;
          label.text("intersection with " + size + " neuron" + (1 === size ? "" : "s") + ".");
      } else {
          // Single group: subtract all its overlaps
          var k = intersecting[0];
          self.selected = self.overlaps.reduce(function(s, overlap) {
              return -1 === overlap.sets.indexOf(k) ?
                s
                : Object.keys(overlap.common).reduce(function(s, skid) {
                    delete s[skid];
                    return s;
                }, s);
          }, $.extend({}, self.groups[k].models));

          var size = Object.keys(self.selected).length;
          label.text("subset of " + size + " neuron" + (size > 1 ? "s" : "") + " from " + self.groups[k].name + ".");
      }
  };

  this.diagram.circles
    .on("mouseover", function(d, i) {
        d3.select(this).style("fill-opacity", 0.8);
        d3.select(this).style("stroke-width", 2);
    })
    .on("mouseout", function(d, i) {
        d3.select(this).style("fill-opacity", 0.4);
        d3.select(this).style("stroke-width", 0);
    })
    .on("click", click);

  this.diagram.text
    .on("click", click);
};

VennDiagram.prototype.exportSVG = function() {
  if (0 === this.groups.length || !this.sets || !this.overlaps) return;
  saveDivSVG('venn_diagram_div' + this.widgetID, "venn_diagram.svg");
};

VennDiagram.prototype.resize = function() {
  var now = new Date();
  // Overwrite request log if any
  this.last_request = now;

  setTimeout((function() {
    if (this.last_request && now === this.last_request) {
      delete this.last_request;
      this.draw();
    }
  }).bind(this), 1000);
};

VennDiagram.prototype.highlight = function(skeleton_id) {
    // TODO
};
