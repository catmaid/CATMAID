/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var SystemCheckWidget = function(options) {
    options = options || {};

    var sv = project.focusedStackViewer;
    if (!sv) {
      throw new CATMAID.ValueError("Need stack viewer for System Widget");
    }

    this.x = options.x || sv.x;
    this.y = options.y || sv.y;
    this.z = options.z || sv.z;
    this.s = options.s || sv.s;
    this.testNSections = 20;
    this.testDelay = 0;
    this.blockingRedraws = true;
  };

  SystemCheckWidget.prototype.getName = function() {
    return "System Check";
  };

  SystemCheckWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: 'system-widget-controls-' + this.widgetID,
      contentID: 'system-widget-' + this.widgetID,
      createControls: function(controls) {
        var self = this;

        CATMAID.DOM.appendButton(controls,
            "Run tests", "Run various system performance tests",
            function() {
              setTimeout(self.runTests.bind(self), self.testDelay);
            });

        CATMAID.DOM.appendButton(controls,
            "Current location", "Copy current location",
            function() {
              var sv = project.focusedStackViewer;
              self.x = sv.x;
              self.y = sv.y;
              self.z = sv.z;
              self.s = sv.s;
              $('input', self.xField).val(sv.x);
              $('input', self.yField).val(sv.y);
              $('input', self.zField).val(sv.z);
            });

        this.xField = CATMAID.DOM.appendNumericField(controls,
            "X", "The initial stack space X coordinate", this.x,
            null, function() {
              self.x = this.value;
            }, 7);

        this.yField = CATMAID.DOM.appendNumericField(controls,
            "Y", "The initial stack space Y coordinate", this.y,
            null, function() {
              self.y = this.value;
            }, 7);

        this.zField = CATMAID.DOM.appendNumericField(controls,
            "Z", "The initial stack space Z coordinate", this.z,
            null, function() {
              self.z = this.value;
            }, 7);

        CATMAID.DOM.appendNumericField(controls,
            "N sections", "The number of sections to test", this.testNSections,
            null, function() {
              self.testNSections = parseInt(this.value, 10);
            }, 7);

        CATMAID.DOM.appendCheckbox(controls,
            "Blocking redraws", "Redraws are performed in blocking mode if enabled",
            this.blockingRedraws, function() {
              self.blockingRedraws = this.checked;
            });

        this.delayField = CATMAID.DOM.appendNumericField(controls,
            "Test delay (ms)", "Test tests will be run after the specified delay",
            this.testDelay, null, function() {
              self.testDelay = this.value;
            }, 7, "ms");
      },
      createContent: function(content) {
        var fpsHeader = document.createElement('h2');
        fpsHeader.appendChild(document.createTextNode("Section loading"));
        content.appendChild(fpsHeader);
        this.fpsResult = document.createElement('p');
        content.appendChild(this.fpsResult);
      }
    };
  };

  SystemCheckWidget.prototype.runTests = function() {
    this.runFpsTests();
  };

	/*/
	 * Run FPS tests.
   */
  SystemCheckWidget.prototype.runFpsTests = function() {
    var sv = project.focusedStackViewer;
    var originalBlockingBehavior = sv.blockingRedraws;
    sv.blockingRedraws = this.blockingRedraws;
		var x = this.x;
		var y = this.y;
		var z = this.z;
		var s = this.s;
		var n = this.testNSections;
		var i = 0;

    var timings = new Array(n);
    var self = this;

    $(this.fpsResult).empty();

		function moveCompleted() {
			timings[i-1] = performance.now() - timings[i-1];
			if (i < n) {
				setTimeout(increment, 10);
			} else {
				var summedTime = timings.reduce(function(sum, t) {
					return sum + t;
				}, 0);
				var averageTime = summedTime / timings.length;
				var fps = 1.0 / (averageTime / 1000);
        $(self.fpsResult).empty();
        self.fpsResult.appendChild(document.createTextNode(
				    "Average: " + Number(averageTime).toFixed(2) + "ms FPS: " +
           Number(fps).toFixed(2)));
        sv.blockingRedraws = originalBlockingBehavior;
			}
		}

		function increment() {
			i = i + 1;
			timings[i-1] = performance.now();
			sv.moveToPixel(z + i, y, x, s, setTimeout.bind(window, moveCompleted, 0));
		}


		increment();
  };

  CATMAID.SystemCheckWidget = SystemCheckWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "System check",
    description: "Developer widget with different metrics and tests",
    key: "system-check",
    creator: SystemCheckWidget
  });

})(CATMAID);
