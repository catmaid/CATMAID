/* global
  CATMAID,
  InstanceRegistry,
	THREE
*/

(function(CATMAID) {

  "use strict";

  var DataPlot = function() {
    this.widgetID = this.registerInstance();
    CATMAID.SkeletonSource.call(this, true);

		this.x_label = "X";
		this.y_label = "Y";
    this.names_visible = true;

		// skeleton_id vs {x, y, model}
		this.data = {};

		// Node ID vs true. Never false, unselected nodes aren't included
		this.selected = {};
	};

  DataPlot.prototype = Object.create(CATMAID.SkeletonSource.prototype);
  DataPlot.prototype.constructor = DataPlot;

  $.extend(DataPlot.prototype, new InstanceRegistry());
  CATMAID.asColorizer(DataPlot.prototype);

  DataPlot.prototype.getName = function() {
    return "Data Plot " + this.widgetID;
  };

  DataPlot.prototype.getWidgetConfiguration = function() {
    return {
      contentID: "data_plot_div" + this.widgetID,
      createControls: function(controls) {

				var self = this;
				var fileButton = controls.appendChild(CATMAID.DOM.createFileButton(
					'dp-file-dialog-' + this.widgetID, false, this.importCSV.bind(this)
					));

        var csv = document.createElement('input');
        csv.setAttribute("type", "button");
        csv.setAttribute("value", "Import CSV");
				csv.onclick = function() { fileButton.click(); };
        controls.appendChild(csv);

        var clear = document.createElement('input');
        clear.setAttribute("type", "button");
        clear.setAttribute("value", "Clear");
        clear.onclick = this.clear.bind(this);
        controls.appendChild(clear);

        controls.appendChild(document.createTextNode(' - '));

        var annotate = document.createElement('input');
        annotate.setAttribute("type", "button");
        annotate.setAttribute("value", "Annotate");
        annotate.onclick = this.annotate_skeleton_list.bind(this);
        controls.appendChild(annotate);

        var xml = document.createElement('input');
        xml.setAttribute("type", "button");
        xml.setAttribute("value", "Export SVG");
        xml.onclick = this.exportSVG.bind(this);
        controls.appendChild(xml);

        var csv = document.createElement('input');
        csv.setAttribute("type", "button");
        csv.setAttribute("value", "Export CSV");
        csv.onclick = this.exportCSV.bind(this);
        controls.appendChild(csv);

        controls.appendChild(document.createTextNode(' - '));

        var selectAll = document.createElement('input');
        selectAll.setAttribute("type", "button");
        selectAll.setAttribute("value", "Select all");
        selectAll.onclick = this.selectAll.bind(this);
        controls.appendChild(selectAll);

        var deselect = document.createElement('input');
        deselect.setAttribute("type", "button");
        deselect.setAttribute("value", "Deselect all");
        deselect.onclick = this.clearSelection.bind(this);
        controls.appendChild(deselect);

        var c = CATMAID.DOM.appendSelect(controls, null, 'Color scheme ',
            ['CATMAID',
             'category10',
             'category20',
             'category20b',
             'category20c'].concat(Object.keys(colorbrewer)));

        var colorize = document.createElement('input');
        colorize.setAttribute("type", "button");
        colorize.setAttribute("value", "Colorize");
        colorize.onclick = function() { self.colorizeWith(c.options[c.selectedIndex].text); };
        controls.appendChild(colorize);

        controls.appendChild(document.createTextNode(" Names:"));
        var toggle = document.createElement('input');
        toggle.setAttribute("type", "checkbox");
        toggle.checked = true;
        toggle.onclick = this.toggleNamesVisible.bind(this, toggle);
        controls.appendChild(toggle);
      },
      createContent: function(content) {
        content.style.overflow = 'hidden';

        var plot = document.createElement('div');
        plot.setAttribute('id', 'data_plot' + this.widgetID);
        plot.style.width = "100%";
        plot.style.height = "100%";
        plot.style.backgroundColor = "#FFFFF0";
      },
      subscriptionSource: this
    };
  };

  DataPlot.prototype.destroy = function() {
    this.unregisterInstance();
    this.unregisterSource();
    CATMAID.NeuronNameService.getInstance().unregister(this);

    Object.keys(this).forEach(function(key) { delete this[key]; }, this);
  };

  DataPlot.prototype.updateModels = function(models) {
		models.forEach(function(model) {
			var entry = this.data[model.id];
			if (null != entry) entry.model = model;
		}.bind(this));
		this.redraw();
  };

  /** Returns a clone of all skeleton models, keyed by skeleton ID. */
  DataPlot.prototype.getSelectedSkeletonModels = function() {
    if (!this.svg) return {};
    var data = this.data;
    return Object.keys(this.selected).reduce(function(o, id) {
			o[id] = data[id].model.clone();
      return o;
    }, {});
  };

  DataPlot.prototype.getSelectedSkeletons = function() {
    if (!this.svg) return [];
		return Object.keys(this.selected);
  };

  DataPlot.prototype.getSkeletons = function() {
    if (!this.data) return [];
		return Object.keys(this.data);
  };

  DataPlot.prototype.getSkeletonModels = function() {
    if (!this.data) return {};
		var data = this.data;
    return Object.keys(this.data).reduce(function(o, skeleton_id) {
			o[skeleton_id] = data[skeleton_id].model.clone();
			return o;
    }, {});
  };

  DataPlot.prototype.getSkeletonModel = function(skeleton_id) {
		if (!this.data) return null;
		return this.data[skeleton_id].model.clone();
  };

  DataPlot.prototype.hasSkeleton = function(skeleton_id) {
		return null != this.data[skeleton_id];
  };

  DataPlot.prototype.clear = function() {
		this.data = [];
    this.selected = {};
		this.x_label = "X";
		this.y_label = "Y";
    this.clearGUI();
  };

  DataPlot.prototype.clearGUI = function() {
    this.selected = {};
    $('#data_plot_div' + this.widgetID).empty();
  };

  DataPlot.prototype.removeSkeletons = function(skeletonIds) {
    var removed = {};
		var data = this.data;
		for (var i=0; i<skeletonIds.length; ++i) {
			var skid = skeletonIds[i];
			if (null != this.data[skid]) removed[skid] = this.data[skid].model;
			delete this.data[skid];
			delete this.selected[skid];
		}

    if (!CATMAID.tools.isEmpty(removed)) {
      this.trigger(this.EVENT_MODELS_REMOVED, removed);
      this.update();
    }
  };

	/** Expects a CSV file with at least 3 columns:
	 *  1. skeleton ID
	 *  2. value for X axis
	 *  3. value for Y axis
	 *  All values must be numeric or the row will be ignored.
	 *  Any additional columns will be ignored. */
	DataPlot.prototype.importCSV = function(evt) {
		var files = evt.target.files;
    if (!CATMAID.containsSingleValidFile(files, 'csv')) {
      return Promise.reject();
    }
		var self = this;
		var reader = new FileReader();
		reader.onload = function(e) {
			e.target.result.split(/\r?\n/).forEach(function(line, i) {
				// Ignore comments
				if ('#' == line[0]) return;
				var cells = line.split(',')
				if (cells.length < 3) {
					console.log("Ignoring line with less than 3 columns: " + line);
					return;
				}
				// Check whether first line consists of text for axis labels
				if (0 === i) {
					var x = parseFloat(cells[1]);
					if (isNaN(x)) self.x_label = cells[1];
					var y = parseFloat(cells[2]);
					if (isNaN(y)) self.y_label = cells[2];
					return;
				}
				var skid = parseInt(cells[0], 10);
				var x = parseFloat(cells[1]);
				if (!isNaN(x) && isFinite(cells[1])) {} else { console.log("bad line: " + line); return; } // check if it's numeric
				var y = parseFloat(cells[2]);
				if (!isNaN(y) && isFinite(cells[2])) {} else { console.log("bad line: " + line); return; }
				// All good:
				self.data[skid] = {
					x: x,
					y: y,
					model: new CATMAID.SkeletonModel(skid, skid + "", new THREE.Color(1.0, 0.0, 1.0))
				};
			});
		};
		reader.readAsText(files[0]);

		// Clear
		evt.target.value = '';

		// Check skeletons exist
		CATMAID.fetch({
	    url: project.id + "/skeleton/neuronnames",
	    method: "POST",
	    data: {skids: Object.keys(this.data)},
	    responseType: undefined,
	    decoder: 'json',
	    api: undefined,
	  }).then(function(json) {
			Object.keys(self.data).forEach(function(skid) {
				if (null == json[skid]) {
					console.log("Skeleton " + skid + " doesn't exist.");
					delete self.data[skid];
				}
			});
			// Register newly loaded skeletons with the NeuronNameService
			// and only then redraw, as a continuation
			CATMAID.NeuronNameService.getInstance()
				.registerAll(self, self.getSkeletonModels(), function() { self.redraw(); });
		}).catch(CATMAID.handleError);

		// TODO if there is an error, this.data should be cleared
	};

	DataPlot.prototype.redraw = function() {
		if (!this.data || 0 == Object.keys(this.data).length) return;

		this.draw();
	};

	DataPlot.prototype.draw = function() {
    var containerID = '#data_plot_div' + this.widgetID,
        container = $(containerID);

    // Clear existing plot if any
    container.empty();

    // Recreate plot
    var margin = {top: 20, right: 20, bottom: 30, left: 40},
        width = container.width() - margin.left - margin.right,
        height = container.height() - margin.top - margin.bottom;

    // Package data
		var getName = CATMAID.NeuronNameService.getInstance().getName;
		var skids = Object.keys(this.data);
		var xVector = [];
		var yVector = [];
		var entries = [];
		for (var i=0; i<skids.length; ++i) {
			var entry = this.data[skids[i]];
			entries.push({
				id: skids[i],
				x: entry.x,
				y: entry.y,
				hex: '#' + entry.model.color.getHexString(),
				name: getName(skids[i])
			});
			xVector.push(entry.x);
			yVector.push(entry.y);
		}

		var xTitle = this.x_label;
		var yTitle = this.y_label;

    // Define the ranges of the axes
    var xR = d3.scale.linear().domain(d3.extent(xVector)).nice().range([0, width]);
    var yR = d3.scale.linear().domain(d3.extent(yVector)).nice().range([height, 0]);

    // Define the data domains/axes
    var xAxis = d3.svg.axis().scale(xR)
                             .orient("bottom")
                             .ticks(10);
    var yAxis = d3.svg.axis().scale(yR)
                             .orient("left")
                             .ticks(10);

    var svg = d3.select(containerID).append("svg")
        .attr("id", "data_plot" + this.widgetID)
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g")
        .attr("transform", "translate(" + margin.left + ", " + margin.top + ")");

    // Add an invisible layer to enable triggering zoom from anywhere, and panning
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .style("opacity", "0");

    // Function that maps from data domain to plot coordinates
    var transform = function(d) { return "translate(" + xR(d.x) + "," + yR(d.y) + ")"; };

    // Create a 'g' group for each skeleton, containing a circle and the neuron name
    var elems = svg.selectAll(".state").data(entries).enter()
      .append('g')
      .attr('transform', transform);

    var zoomed = function() {
      // Prevent panning beyond limits
      var translate = zoom.translate(),
          scale = zoom.scale(),
          tx = Math.min(0, Math.max(width * (1 - scale), translate[0])),
          ty = Math.min(0, Math.max(height * (1 - scale), translate[1]));

      zoom.translate([tx, ty]);

      // Scale as well the axes
      svg.select(".x.axis").call(xAxis);
      svg.select(".y.axis").call(yAxis);

      elems.attr('transform', transform);
    };

    // Variables exist throughout the scope of the function, so zoom is reachable from zoomed
    var zoom = d3.behavior.zoom().x(xR).y(yR).on("zoom", zoomed);

    // Assign the zooming behavior to the encapsulating root group
    svg.call(zoom);

    var setSelected = (function(id, b) {
      if (b) this.selected[id] = true;
      else delete this.selected[id];
    }).bind(this);

    var selected = this.selected;

    elems.append('circle')
       .attr('class', 'dot')
       .attr('r', function(d) { return selected[d.id] ? 6 : 3; })
       .style('fill', function(d) { return d.hex; })
       .style('stroke', function(d) { return selected[d.id] ? 'black' : 'grey'; })
       .on('click', function(d) {
         // Toggle selected:
         var c = d3.select(this);
         if (3 === Number(c.attr('r'))) {
           c.attr('r', 6).style('stroke', 'black');
           setSelected(d.id, true);
         } else {
           c.attr('r', 3).style('stroke', 'grey');
           setSelected(d.id, false);
         }
       })
     .append('svg:title')
       .text(function(d) { return d.name; });

    elems.append('text')
       .text(function(d) { return d.name; })
       .attr('id', 'name')
       .attr('display', this.names_visible ? '' : 'none')
       .attr('dx', function(d) { return 5; });

    // Insert the graphics for the axes (after the data, so that they draw on top)
    var xg = svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .style("shape-rendering", "crispEdges")
        .call(xAxis);
    xg.selectAll("path")
        .attr("fill", "none")
        .attr("stroke", "black");
    xg.selectAll("text")
        .attr("fill", "black")
        .attr("stroke", "none");
    xg.append("text")
        .attr("x", width)
        .attr("y", -6)
        .attr("fill", "black")
        .attr("stroke", "none")
        .attr("font-family", "sans-serif")
        .attr("font-size", "11px")
        .style("text-anchor", "end")
        .text(xTitle);

    var yg = svg.append("g")
        .attr("class", "y axis")
        .style("shape-rendering", "crispEdges")
        .call(yAxis);
    yg.selectAll("path")
        .attr("fill", "none")
        .attr("stroke", "black");
    yg.selectAll("text")
        .attr("fill", "black")
        .attr("stroke", "none");
    yg.append("text")
        .attr("fill", "black")
        .attr("stroke", "none")
        .attr("transform", "rotate(-90)")
        .attr("font-family", "sans-serif")
        .attr("font-size", "11px")
        .attr("y", 6)
        .attr("dy", ".71em")
        .style("text-anchor", "end")
        .text(yTitle);

    this.svg = svg;
  };

  /** Redraw only the last request, where last is a period of about 1 second. */
  DataPlot.prototype.resize = function() {
    var now = new Date();
    // Overwrite request log if any
    this.last_request = now;

    setTimeout((function() {
      if (this.last_request && now === this.last_request) {
        delete this.last_request;
        this.redraw();
      }
    }).bind(this), 1000);
  };

  DataPlot.prototype.setNamesVisible = function(v) {
    if (this.svg) {
      this.svg.selectAll('text#name').attr('display', v ? '' : 'none');
    }
  };

  DataPlot.prototype.toggleNamesVisible = function(checkbox) {
    this.names_visible = checkbox.checked;
    this.setNamesVisible(this.names_visible);
  };

  DataPlot.prototype.highlight = function() {
    // TODO animate a node growing and shrinking
  };

  DataPlot.prototype.exportSVG = function() {
    CATMAID.svgutil.saveDivSVG('data_plot_div' + this.widgetID,
        "data_plot.svg");
  };

  DataPlot.prototype.exportCSV = function() {
		var getName = CATMAID.NeuronNameService.getInstance().getName;
		var csv = Object.keys(this.data).map(function(skid) {
			var entry = this.data[skid];
			return [skid, entry.x, entry.y, getName(skid)].join(",");
		}.bind(this)).join("\n");
    var blob = new Blob(["skeleton_id," + this.x_label + "," + this.y_label + ",neuron\n", csv], {type :'text/plain'});
    saveAs(blob, "data_plot.csv");
  };

	DataPlot.prototype.selectAll = function() {
		this.selected = Object.keys(this.data).reduce(function(o, skid) { o[skid] = true; return o; }, {});
		this.redraw();
	};

  DataPlot.prototype.clearSelection = function() {
    this.selected = {};
    this.redraw();
  };

  DataPlot.prototype.colorizeWith = function(scheme) {
		var skeletons = Object.keys(this.selected).map(function(skid) { return this.data[skid].model; }, this),
        colorFn;

		if (0 == skeletons.length) {
			alert("Select some first or all with 'Select all'");
			return;
		}

    if ('CATMAID' === scheme) {
			skeletons.forEach(function(model) { model.color = this.pickColor(); }, this);
			this.redraw();
			return;
		}

    if (0 === scheme.indexOf('category') && d3.scale.hasOwnProperty(scheme)) {
      colorFn = d3.scale[scheme]();
    } else if (colorbrewer.hasOwnProperty(scheme)) {
      var sets = colorbrewer[scheme];
      if (skeletons.size <= 3) {
        colorFn = function(i) { return sets[3][i]; };
      } else if (sets.hasOwnProperty(skeletons.size)) {
        colorFn = function(i) { return sets[skeletons.size][i]; };
      } else {
        // circular indexing
        var keys = Object.keys(sets),
            largest = sets[keys.sort(function(a, b) { return a < b ? 1 : -1; })[0]];
        colorFn = function(i) { return largest[i % largest.length]; };
      }
    }

    if (colorFn) {
      skeletons.forEach(function(sk, i) {
        sk.color.setStyle(colorFn(i));
      }, this);
      if (skeletons.length > 0) {
        this.triggerChange(this.getSelectedSkeletonModels()); // pass on model clones
        // Update UI
        this.redraw();
      }
    }
  };

  // Export data plot
  CATMAID.DataPlot = DataPlot;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Data Plot",
    key: "data-plot",
    creator: CATMAID.DataPlot,
    description: "Plot various skeleton properties with respect to each other"
  });

})(CATMAID);
