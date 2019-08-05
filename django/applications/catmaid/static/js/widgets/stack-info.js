(function (CATMAID) {

  "use strict";

  var StackInfo = function () {
    this.widgetID = this.registerInstance();

    this.stacks = [];
    var svs = project.getStackViewers();
    this.selectedStackId = svs.length ? svs[0].primaryStack.id : null;
  };

  StackInfo.prototype = {};
  StackInfo.prototype.constructor = StackInfo;

  $.extend(StackInfo.prototype, new InstanceRegistry());

  StackInfo.prototype.getName = function () {
    return "Stack Info " + this.widgetID;
  };

  StackInfo.prototype.getWidgetConfiguration = function () {
    return {
      class: "stack-info",
      createControls: function (controls) {
        var self = this;
        var stackSelectLabel = document.createElement('label');
        stackSelectLabel.appendChild(document.createTextNode('Stack'));
        var stackSelect = document.createElement('select');
        stackSelect.setAttribute('data-name', 'stack');
        CATMAID.Stack.list(project.id, true)
          .then(function (stacks) {

            stacks.forEach(function (s) {
              var selected = s.id === self.selectedStackId;
              var option = new Option(s.title, s.id, selected, selected);
              stackSelect.add(option);
            });
          });
        stackSelectLabel.appendChild(stackSelect);

        stackSelect.onchange = function () {
          self.selectedStackId = this.value;
          self.refresh();
        };

        controls.appendChild(stackSelectLabel);
      },
      createContent: function (content) {
        var container = document.createElement('div');
        container.setAttribute("id", "stack-info" + this.widgetID);
        content.appendChild(container);
      },
      init: function (win) {
        this.refresh();
      }
    };
  };

  StackInfo.prototype.init = function (stackId) {
    if (typeof stackId !== 'undefined') this.selectedStackId = stackId;
  };

  StackInfo.prototype.refresh = function () {
    var container = document.getElementById("stack-info" + this.widgetID);
    container.innerHTML = '';

    if (this.selectedStackId === null) return;

    CATMAID.Stack.fetch(project.id, this.selectedStackId)
      .then(function (stack) {
        var title = document.createElement('h3');
        title.appendChild(document.createTextNode(stack.title));

        var stackHeading = document.createElement('h4');
        stackHeading.appendChild(document.createTextNode('Stack properties'));
        var sProps = document.createElement('table');
        sProps.style.width = '80%';
        var comment = document.createElement('tr');
        comment.innerHTML = '<th style="width: 30%;">Comment</th><td>'
          + (stack.comment || '(None)') + '</td>';
        sProps.appendChild(comment);
        var description = document.createElement('tr');
        description.innerHTML = '<th>Description</th><td>'
          + (stack.description || '(None)') + '</td>';
        sProps.appendChild(description);
        var attribution = document.createElement('tr');
        attribution.innerHTML = '<th>Attribution</th><td>'
          + (stack.attribution || '(None)') + '</td>';
        sProps.appendChild(attribution);
        var dim = document.createElement('tr');
        dim.innerHTML = '<th>Dimension (px)</th><td>'
          + stack.dimension.x + ', '
          + stack.dimension.y + ', '
          + stack.dimension.z
          + '</td>';
        sProps.appendChild(dim);
        var res = document.createElement('tr');
        res.innerHTML = '<th>Resolution (nm/px)</th><td>'
          + stack.resolution.x + ', '
          + stack.resolution.y + ', '
          + stack.resolution.z
          + '</td>';
        sProps.appendChild(res);


        var projstackHeading = document.createElement('h4');
        projstackHeading.appendChild(document.createTextNode('Relation to this project'));
        var psProps = document.createElement('table');
        psProps.style.width = '80%';
        var trans = document.createElement('tr');
        trans.innerHTML = '<th style="width: 30%;">Translation (nm)</th><td>'
          + stack.translation.x + ', '
          + stack.translation.y + ', '
          + stack.translation.z
          + '</td>';
        psProps.appendChild(trans);
        var orientation = document.createElement('tr');
        orientation.innerHTML = '<th>Orientation</th><td>'
          + stack.getPlaneDimensions().x
          + stack.getPlaneDimensions().y
          + '</td>';
        psProps.appendChild(orientation);

        container.appendChild(title);
        container.appendChild(stackHeading);
        container.appendChild(sProps);
        container.appendChild(projstackHeading);
        container.appendChild(psProps);
      });
  };

  StackInfo.prototype.destroy = function () {
    this.unregisterInstance();
  };

  CATMAID.StackInfo = StackInfo;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Stack Info",
    description: "Display detailed stack information",
    key: 'stack-info',
    creator: StackInfo
  });

})(CATMAID);
