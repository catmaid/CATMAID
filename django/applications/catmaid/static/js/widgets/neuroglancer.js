/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var NeuroglancerWidget = function (options) {
    this.widgetID = this.registerInstance();
    this.idPrefix = `neuroglancer-widget${this.widgetID}-`;
    // reference to neuroglancer window
    this.ngWind = null;
    project.on(CATMAID.Project.EVENT_LOCATION_CHANGED, this.handlelLocationChange, this);
  };

  NeuroglancerWidget.prototype = {};
  $.extend(NeuroglancerWidget.prototype, new InstanceRegistry());

  NeuroglancerWidget.prototype.getName = function() {
    return "Neuroglancer " + this.widgetID;
  };

  NeuroglancerWidget.prototype.destroy = function() {
    project.off(CATMAID.Project.EVENT_LOCATION_CHANGED, this.handlelLocationChange, this);
    this.unregisterInstance();
  };

  NeuroglancerWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        this.controls = controls;
      },
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        this.content = content;
        var form = document.createElement('form');
        var self = this;
        $(content)
        .append($(form)
            .on('submit', function(e) {
              self.openNeuroglancerWindow();
              return false;
            })
            .append($('<input type="text" id="neuroglancer-link" name="neuroglancer-link" />'))
            .append($('<input type="submit" value="Open Neuroglancer" />')))

        /*var container_html =
          '<div id="neuroglancer_url{{NA-ID}}">' +
            '<textarea id="neuroglancer_input_url{{NA-ID}}" name="input-url" row="10" cols="50" />'
          '</div>';*/
        // content.innerHTML = container_html.replace(/{{NA-ID}}/g, this.widgetID);
      },
      init: function () {
      },
      helpText: "",
    };
  };

  NeuroglancerWidget.prototype.openNeuroglancerWindow = function () {
    var ng_url = $('#neuroglancer-link').val();
    var ng_hash = ng_url.substr(ng_url.indexOf("#!"));
    var url = CATMAID.makeURL("neuroglancer" + ng_hash);
    this.ngWindow = window.open(url);
  };

  NeuroglancerWidget.prototype.handlelLocationChange = function () {
    this.ngWindow.location.hash = this.getNeuroglancerHash();
  };

  /*NeuroglancerWidget.prototype.getNeuroglancerURL = function () {
    var url = CATMAID.makeURL("neuroglancer" + this.getNeuroglancerHash());
    return url;
  };*/

  NeuroglancerWidget.prototype.replaceNeuroglancerTuple = function (url, key, replaceStr) {
    var vs_idx = url.indexOf(key)
    var vs_s = url.substr(vs_idx).indexOf("[") + vs_idx + 1;
    var vs_e = url.substr(vs_idx).indexOf("]") + vs_idx;
    var new_url = url.substr(0, vs_s) + replaceStr + url.substr(vs_e);
    return new_url
  }

  NeuroglancerWidget.prototype.getNeuroglancerHash = function () {
    var sv = project.getStackViewers()[0];
    var stack = sv.primaryStack;
    var projCoord = sv.projectCoordinates();
    var stackCoord = [
      stack.projectToStackX(projCoord.z, projCoord.y, projCoord.x),
      stack.projectToStackY(projCoord.z, projCoord.y, projCoord.x),
      stack.projectToStackZ(projCoord.z, projCoord.y, projCoord.x),
    ];
    var voxCoords = stackCoord.join(',');
    var voxSize = [stack.resolution.x, stack.resolution.y, stack.resolution.z].join(',');
    var zoomFactor = Math.pow(2, sv.s) * stack.resolution.x;

    // get current hash without divider
    var url = this.ngWindow.location.hash;
    url = url.slice(2);
    url = decodeURIComponent(url);

    var new_url = this.replaceNeuroglancerTuple(url, "voxelSize", voxSize);
    new_url = this.replaceNeuroglancerTuple(new_url, "voxelCoordinates", voxCoords);

    // replace zoom factor
    var vs_idx = new_url.indexOf("zoomFactor")
    var vs_s = new_url.substr(vs_idx).indexOf(":") + vs_idx + 1;
    var vs_e = Math.min(new_url.substr(vs_idx).indexOf(","),
      new_url.substr(vs_idx).indexOf("}")) + vs_idx;
    new_url = new_url.substr(0, vs_s) + zoomFactor + new_url.substr(vs_e);

    // prepend divider again
    new_url = "#!" + encodeURIComponent(new_url);
    
    return new_url;
  }

  NeuroglancerWidget.prototype.refresh = function() {
  };

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Neuroglancer",
    description: "Open a Neuroglancer viewer for all open stacks",
    key: "neuroglancer",
    creator: NeuroglancerWidget
  });

  CATMAID.NeuroglancerWidget = NeuroglancerWidget;

})(CATMAID);
