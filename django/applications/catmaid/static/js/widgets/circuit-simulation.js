/* global
  CATMAID
*/

(function (CATMAID) {
  "use strict";

  function padNum(n, len) {
    return n.toString().padStart(len, "0");
  }

  function timeString() {
    const now = new Date();
    const year = padNum(now.getFullYear(), 4);
    const mon = padNum(now.getMonth() + 1, 2);
    const day = padNum(now.getDate(), 2);
    const hour = padNum(now.getHours(), 2);
    const min = padNum(now.getMinutes(), 2);
    return `${year}-${mon}-${day}T${hour}${min}`;
  }

  function zip(arrays) {
    const minLen = arrays.reduce(
      (accum, curr) => Math.min(accum, curr.length),
      Infinity
    );
    const out = [];
    for (let i = 0; i < minLen; ++i) {
      out.push(arrays.map((a) => a[i]));
    }
    return out;
  }

  CATMAID.CircuitSimulation = class CircuitSimulation extends InstanceRegistry {
    constructor() {
      super();
      this.showParameterUi = true;
      this.skelSource = new CATMAID.BasicSkeletonSource(this.getName(), {
        owner: this,
      });

      // An array of objects with members:
      // - name: of the unit
      // - color: string, #-prefixed hex color for the plot
      // - w: array of connection weights with the other units (in order)
      // - k: slope of logistic function
      // - th: threshold of logistic function
      // - I_tonic: bias/ tonic stimulation
      // - I_stim: current while stimulus is active
      // - I_stim_start: first time point of stimulus
      // - I_stim_end: last time point of stimulus
      // - scaling: multiplies the logistic activation function
      // - tau: time constant; divides dy/dt to represent how quickly unit responds
      this.units = [];

      this.sol = null;
      this.lines = [];
    }

    getName() {
      return "Circuit Simulation " + this.widgetID;
    }

    getWidgetConfiguration() {
      return {
        controlsID: "circuit_simulation_buttons" + this.widgetID,
        contentID: "circuit_simulation_div" + this.widgetID,
        createControls: function (controls) {
          var CS = this;
          var tabs = CATMAID.DOM.addTabGroup(controls, CS.widgetID, [
            "Main",
            "Export",
          ]);

          const fileButton = controls.appendChild(
            CATMAID.DOM.createFileButton(
              "load-json-dialog-" + this.widgetID,
              false,
              (event) => CS.loadJson(event.target.files)
            )
          );
          const openButton = document.createElement("input");
          openButton.setAttribute("type", "button");
          openButton.setAttribute("value", "Load JSON");
          openButton.onclick = () => fileButton.click();

          CATMAID.DOM.appendToTab(tabs["Main"], [
            [document.createTextNode("From")],
            [CATMAID.skeletonListSources.createSelect(CS.skelSource)],
            ["Append", CS.skelSource.loadSource.bind(CS.skelSource)],
            ["Clear", CS.skelSource.clear.bind(CS.skelSource)],
            ["Show/Hide parameters", CS.toggleParametersUI.bind(CS)],
            ["Run", CS.run.bind(CS)],
            [openButton],
            ["Save results", CS.saveResults.bind(CS)],
            [
              CATMAID.DOM.createNumericField(
                "cs_time" + CS.widgetID,
                "Time:",
                "Amount of simulated time, in arbitrary units",
                "1000",
                "(a.u.)",
                CS.run.bind(CS),
                6
              ),
            ],
          ]);

          CATMAID.DOM.appendToTab(tabs["Export"], [
            ["SVG", CS.exportSVG.bind(CS)],
          ]);

          $(controls).tabs();
        },
        createContent: function (content) {
          var plot = document.createElement("div");
          plot.setAttribute("id", "plotted-simulation-" + this.widgetID);
          plot.style.width = "100%";
          plot.style.height = "100%";
          plot.style.backgroundColor = "#FFFFFF";
          content.appendChild(plot);
        },
        helpText: [],
        init: function () {},
      };
    }

    saveResults() {
      if (!this.sol) {
        CATMAID.warn("No results to save");
        return;
      }

      const out = {
        time: this.sol.x,
        units: this.units,
        rates: zip(this.sol.y),
      };

      const defaultFilename = `circuit-simulation_${timeString()}.json`;
      saveAs(
        new Blob([JSON.stringify(out, null, " ")], {
          type: "application/json",
        }),
        defaultFilename
      );
    }

    loadJson(files) {
      if (!CATMAID.containsSingleValidFile(files, "json")) {
        CATMAID.warn("Select a single valid JSON file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        let parsed;
        try {
          parsed = JSON.parse(event.target.result);
          // allow results JSON or just units member to be used
          if (Array.isArray(parsed)) {
            this.units = parsed;
          } else {
            this.units = parsed.units;
          }
        } catch (err) {
          CATMAID.handleError(err);
          return;
        }
      };
      reader.readAsText(files[0]);
    }

    clear() {
      this.units = [];
      this.sol = null;
      this.lines = [];
      this.redraw();
    }

    toggleParametersUI() {
      this.show_parameter_ui = !this.show_parameter_ui;
      this.redraw();
    }

    redraw() {
      var containerID = "#plotted-simulation-" + this.widgetID,
        container = $(containerID);

      // Clear existing plot if any
      // container.empty();
      $("#circuit_simulation" + this.widgetID).remove();

      if (!this.lines || 0 == this.lines.length) return;

      this.svg = CATMAID.svgutil.insertMultiLinePlot(
        container,
        containerID,
        "circuit_simulation" + this.widgetID,
        this.lines,
        "time (a.u.)",
        "activity (a.u.)"
      );
    }

    destroy() {
      this.unregisterInstance();
      this.skelSource.unregisterSource();
      CATMAID.NeuronNameService.getInstance().unregister(this);
    }

    getSelectedSkeletons() {
      return this.getSkeletons();
    }

    getSkeletons() {
      return Object.keys(this.getSkeletonModels());
    }

    getSkeletonColor(skid) {
      var model = this.getSkeletonModels()[skid];
      return model ? model.color : null;
    }

    getSkeletonModel(skid) {
      return this.getSkeletonModels()[skid];
    }

    getSelectedSkeletonModels() {
      return this.getSkeletonModels();
    }

    getSkeletonModels() {
      var models = {};
      Object.keys(this.units).forEach(function (unitID) {
        var unit = this.units[unitID];
        $.extend(models, unit.skeletons);
      }, this);
      return models;
    }

    highlight() {
      // TODO
    }

    init() {
      // TODO
    }

    run() {
      // params: vector of maps, one map per unit containing everything that is constant in the stimulation for that unit:
      //   * w: weights in the circuit graph.
      //   * k: slope of the logistic function of each unit.
      //   * th: threshold of the logistic function of each unit.
      //   * I_tonic: bias of the inputs of each unit.
      //   * I_stim: vector that directly controls the output of a unit for a specific time period. (The optogenetic stimulus, so to speak.)
      //   * t_stim_start: first time point at which I_stim is applied.
      //   * t_stim_end: last time point at which I_stim is applied.
      //   * scaling: multiplies the logistic
      //   * tau: divide the entire dydt output, representing how fast the output of the unit responds to its input.
      //
      //   Also:
      //   * name
      //   * color
      //

      // Logistic function: all parameters are scalars
      //  x: sum of weights * rates for inputs
      //  k: slope
      //  th: threshold
      // Returns a scalar
      var logistic = function (x, k, th) {
        if (x == 0) {
          // Logistic functions are asymptotic, and so will always produce
          // (very small) outputs even with no inputs when translated up.
          // This ensures that no input -> no output.
          return 0;
        }
        return 1.0 / (1.0 + Math.exp(-k * (x - th)));
      };

      // Compute the external stimulation to the unit, if any
      var stim = function (t, p) {
        return t >= p.I_stim_start && t <= p.I_stim_end ? p.I_stim : 0;
      };

      // Compute the 'x' in the logistic function
      // by multiplying the weight of the connection times the rate of that input neuron,
      // summing all, and then adding the baseline bias, I_tonic.
      var input = function (vw, vr, I_tonic) {
        var s = 0;
        for (var i = 0; i < vw.length; ++i) {
          s += vw[i] * vr[i];
        }
        return s + I_tonic;
      };

      // A two-argument function that runs at every simulated time instance
      // (units is bound to this.units, returning a two-arg function.)
      // t: (scalar) current time point
      // vr: (vector) current firing rates of all units
      // Returns a vector: each item is a solution for each unit.
      var dydt = function (units, t, vr) {
        return vr.map(function (r, i) {
          var p = units[i];
          return (
            (-r +
              stim(t, p) +
              p.scaling * logistic(input(p.w, vr, p.I_tonic), p.k, p.th)) /
            p.tau
          );
        });
      }.bind(null, this.units);

      // numeric.dopri parameters: (the ODE solver)
      // x0: initial time of the simulation.
      // x1: final time of the simulation.
      // y0: initial state (of the rates in our case).
      // f: dydt function, executing at every step of the simulation.
      // tol: (optional) tolerance, default 1e-6.
      // maxit: (optional) maximum number of iterations, default 1000.
      // event: (optional) the integration stops if the event function foes from negative to positive.

      var x0 = 0;
      var x1 = Number($("#cs_time" + this.widgetID).val());
      var y0 = this.units.map(function () {
        return 0;
      }); // a vector full of zeros

      var sol = numeric.dopri_nonnegative(x0, x1, y0, dydt, 1e-6, 1000, null);

      // Extract one line per unit, for plotting
      const lines = this.units.map(function (p) {
        return { name: p.name, color: p.color, stroke_width: "3", xy: [] };
      });

      zip([sol.x, sol.y]).forEach((ty) => {
        let t = ty[0];
        let y = ty[1];
        for (let i = 0; i < y.length; ++i) {
          lines[i].xy.push({ x: t, y: y[i] });
        }
      });

      this.lines = lines;

      // Store the result for analysis from the command line
      this.sol = sol;

      this.redraw();
    }

    resize() {
      var now = new Date();
      // Overwrite request log if any
      this.last_request = now;

      setTimeout(
        function () {
          if (this.last_request && now === this.last_request) {
            delete this.last_request;
            this.redraw();
          }
        }.bind(this),
        1000
      );
    }

    exportSVG() {
      CATMAID.svgutil.saveDivSVG(
        "plotted-simulation-" + this.widgetID,
        "circuit-simulation.svg"
      );
    }
  };

  CATMAID.registerWidget({
    name: "Circuit Simulations",
    key: "circuit-simulations",
    creator: CATMAID.CircuitSimulation,
    description: "Simulate circuits with rate models",
  });

  /* jshint ignore:start */
  /**
   * Duplication of the numeric.dopri function to introduce a non-negativity constraint.
   *
   * numeric.dopri parameters: (the ODE solver)
   * x0: initial time of the simulation.
   * x1: final time of the simulation.
   * y0: initial state (of the rates in our case).
   * f: dydt function, executing at every step of the simulation.
   * tol: (optional) tolerance, default 1e-6.
   * maxit: (optional) maximum number of iterations, default 1000.
   * event: (optional) e.g. the integration stops if the event function goes from negative to positive.
   */
  numeric.dopri_nonnegative = function dopri(x0, x1, y0, f, tol, maxit, event) {
    if (typeof tol === "undefined") {
      tol = 1e-6;
    }
    if (typeof maxit === "undefined") {
      maxit = 1000;
    }
    var xs = [x0],
      ys = [y0],
      k1 = [f(x0, y0)],
      k2,
      k3,
      k4,
      k5,
      k6,
      k7,
      ymid = [];
    var A2 = 1 / 5;
    var A3 = [3 / 40, 9 / 40];
    var A4 = [44 / 45, -56 / 15, 32 / 9];
    var A5 = [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729];
    var A6 = [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656];
    var b = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84];
    var bm = [
      (0.5 * 6025192743) / 30085553152,
      0,
      (0.5 * 51252292925) / 65400821598,
      (0.5 * -2691868925) / 45128329728,
      (0.5 * 187940372067) / 1594534317056,
      (0.5 * -1776094331) / 19743644256,
      (0.5 * 11237099) / 235043384,
    ];
    var c = [1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
    var e = [
      -71 / 57600,
      0,
      71 / 16695,
      -71 / 1920,
      17253 / 339200,
      -22 / 525,
      1 / 40,
    ];
    var i = 0,
      er,
      j;
    var h = (x1 - x0) / 10;
    var it = 0;
    var add = numeric.add,
      mul = numeric.mul,
      y1,
      erinf;
    var max = Math.max,
      min = Math.min,
      abs = Math.abs,
      norminf = numeric.norminf,
      pow = Math.pow;
    var any = numeric.any,
      lt = numeric.lt,
      and = numeric.and,
      sub = numeric.sub;
    var e0, e1, ev;
    var ret = new numeric.Dopri(xs, ys, k1, ymid, -1, "");
    if (typeof event === "function") e0 = event(x0, y0);
    while (x0 < x1 && it < maxit) {
      ++it;
      if (x0 + h > x1) h = x1 - x0;
      k2 = f(x0 + c[0] * h, add(y0, mul(A2 * h, k1[i])));
      k3 = f(
        x0 + c[1] * h,
        add(add(y0, mul(A3[0] * h, k1[i])), mul(A3[1] * h, k2))
      );
      k4 = f(
        x0 + c[2] * h,
        add(
          add(add(y0, mul(A4[0] * h, k1[i])), mul(A4[1] * h, k2)),
          mul(A4[2] * h, k3)
        )
      );
      k5 = f(
        x0 + c[3] * h,
        add(
          add(
            add(add(y0, mul(A5[0] * h, k1[i])), mul(A5[1] * h, k2)),
            mul(A5[2] * h, k3)
          ),
          mul(A5[3] * h, k4)
        )
      );
      k6 = f(
        x0 + c[4] * h,
        add(
          add(
            add(
              add(add(y0, mul(A6[0] * h, k1[i])), mul(A6[1] * h, k2)),
              mul(A6[2] * h, k3)
            ),
            mul(A6[3] * h, k4)
          ),
          mul(A6[4] * h, k5)
        )
      );
      y1 = add(
        add(
          add(
            add(add(y0, mul(k1[i], h * b[0])), mul(k3, h * b[2])),
            mul(k4, h * b[3])
          ),
          mul(k5, h * b[4])
        ),
        mul(k6, h * b[5])
      );
      k7 = f(x0 + h, y1);
      er = add(
        add(
          add(
            add(
              add(mul(k1[i], h * e[0]), mul(k3, h * e[2])),
              mul(k4, h * e[3])
            ),
            mul(k5, h * e[4])
          ),
          mul(k6, h * e[5])
        ),
        mul(k7, h * e[6])
      );
      if (typeof er === "number") erinf = abs(er);
      else erinf = norminf(er);
      if (erinf > tol) {
        // reject
        h = 0.2 * h * pow(tol / erinf, 0.25);
        if (x0 + h === x0) {
          ret.msg = "Step size became too small";
          break;
        }
        continue;
      }
      ymid[i] = add(
        add(
          add(
            add(
              add(add(y0, mul(k1[i], h * bm[0])), mul(k3, h * bm[2])),
              mul(k4, h * bm[3])
            ),
            mul(k5, h * bm[4])
          ),
          mul(k6, h * bm[5])
        ),
        mul(k7, h * bm[6])
      );
      ++i;
      xs[i] = x0 + h;
      // CHANGED: enforce non-negativity
      ys[i] = y1.map(function (_y_) {
        return _y_ > 0 ? _y_ : 0;
      });
      //
      k1[i] = k7;
      if (typeof event === "function") {
        var yi,
          xl = x0,
          xr = x0 + 0.5 * h,
          xi;
        e1 = event(xr, ymid[i - 1]);
        ev = and(lt(e0, 0), lt(0, e1));
        if (!any(ev)) {
          xl = xr;
          xr = x0 + h;
          e0 = e1;
          e1 = event(xr, y1);
          ev = and(lt(e0, 0), lt(0, e1));
        }
        if (any(ev)) {
          var xc, yc, en, ei;
          var side = 0,
            sl = 1.0,
            sr = 1.0;
          while (1) {
            if (typeof e0 === "number")
              xi = (sr * e1 * xl - sl * e0 * xr) / (sr * e1 - sl * e0);
            else {
              xi = xr;
              for (j = e0.length - 1; j !== -1; --j) {
                if (e0[j] < 0 && e1[j] > 0)
                  xi = min(
                    xi,
                    (sr * e1[j] * xl - sl * e0[j] * xr) /
                      (sr * e1[j] - sl * e0[j])
                  );
              }
            }
            if (xi <= xl || xi >= xr) break;
            yi = ret._at(xi, i - 1);
            ei = event(xi, yi);
            en = and(lt(e0, 0), lt(0, ei));
            if (any(en)) {
              xr = xi;
              e1 = ei;
              ev = en;
              sr = 1.0;
              if (side === -1) sl *= 0.5;
              else sl = 1.0;
              side = -1;
            } else {
              xl = xi;
              e0 = ei;
              sl = 1.0;
              if (side === 1) sr *= 0.5;
              else sr = 1.0;
              side = 1;
            }
          }
          y1 = ret._at(0.5 * (x0 + xi), i - 1);
          ret.f[i] = f(xi, yi);
          ret.x[i] = xi;
          ret.y[i] = yi;
          ret.ymid[i - 1] = y1;
          ret.events = ev;
          ret.iterations = it;
          return ret;
        }
      }
      x0 += h;
      y0 = y1;
      e0 = e1;
      h = min(0.8 * h * pow(tol / erinf, 0.25), 4 * h);
    }
    ret.iterations = it;
    return ret;
  };
  /* jshint ignore:end */
})(CATMAID);
