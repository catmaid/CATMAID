/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var NeuronNavigator = function()
{
  this.widgetID = this.registerInstance();
  this.registerSource();
};

NeuronNavigator.prototype = {};
$.extend(NeuronNavigator.prototype, new InstanceRegistry());
$.extend(NeuronNavigator.prototype, new SkeletonSource());

/* Implement interfaces */

NeuronNavigator.prototype.getName = function()
{
    return "Neuron Navigator " + this.widgetID;
};

NeuronNavigator.prototype.destroy = function()
{
  this.unregisterInstance();
  this.unregisterSource();
};

NeuronNavigator.prototype.append = function() {};
NeuronNavigator.prototype.clear = function(source_chain) {};
NeuronNavigator.prototype.removeSkeletons = function() {};
NeuronNavigator.prototype.updateModels = function() {};

NeuronNavigator.prototype.getSelectedSkeletons = function() {
  return [];
};

NeuronNavigator.prototype.hasSkeleton = function(skeleton_id) {
  return false;
};

NeuronNavigator.prototype.getSelectedSkeletonModels = function() {
  return {};
};

NeuronNavigator.prototype.highlight = function(skeleton_id)
{
  return;
};

/* Non-interface methods */

NeuronNavigator.prototype.init_ui = function(container)
{
  // Create a navigation bar to see the current path of nodes
  var navigation_bar = document.createElement('div');
  navigation_bar.setAttribute('id', 'navigator_navi_bar' + this.widgetID);
  navigation_bar.setAttribute('class', 'navigator_navi_bar');
  container.appendChild(navigation_bar);

  // Create a containe where all the content of every node will be placed in
  var content = document.createElement('div');
  content.setAttribute('id', 'navigatior_content' + this.widgetID);
  content.setAttribute('class', 'navigator_content');
  container.appendChild(content);

  // Add home node as starting point without any parent
  var home_node = new NeuronNavigatorHomeNode(this.widgetID);
  home_node.link(this, null);
  this.select_node(home_node);
};

NeuronNavigator.prototype.select_node = function(node)
{
  // Set the navigation bar contents
  $('#navigator_navi_bar' + this.widgetID).empty().append(
      node.create_path(this));
  
  // Set the actual content
  $('#navigatior_content' + this.widgetID).empty().append(
      node.create_content(this));
};


/**
 * A filter container that keeps track of either an annotation, a user or a
 * neuron to be used as filter when selection data.
 */
var NeuronNavigatorFilter = function(annotation, user, neuron)
{
  this.annotation = annotation;
  this.user = user;
  this.neuron = neuron;
};

/**
 * A class representing a node in the graph of the navigator.
 */
var NeuronNavigatorNode = function(name)
{
  this.name = name;
  this.navigator = null;
  this.filters = null;
};

NeuronNavigatorNode.prototype.link = function(navigator, parent_node)
{
  this.navigator = navigator;
  this.parent_node = parent_node;
};

NeuronNavigatorNode.prototype.collect_filters = function()
{
  // Collect filters by reference
  if (this.parent_node) {
    var path_filters = this.parent_node.collect_filters();
    if (this.filters) {
      path_filters.push(this.filters);
    }
    return path_filters;
  } else {
    // The home node will return an empty list
    return [];
  }
};

NeuronNavigatorNode.prototype.create_path = function()
{
  var path_link = document.createElement('a');
  path_link.setAttribute('href', '#');
  path_link.setAttribute('class', 'navigator_navi_bar_element');
  path_link.innerHTML = this.name;
  $(path_link).click($.proxy(function() {
    this.navigator.select_node(this);
  }, this));

  if (this.parent_node) {
    var path_elements = this.parent_node.create_path();
    path_elements.push(document.createTextNode(" > "));
    path_elements.push(path_link);
    return path_elements;
  } else {
    return [path_link];
  }
};

NeuronNavigatorNode.prototype.create_content = function()
{
  return undefined;
};

NeuronNavigatorNode.prototype.create_annotations_link = function()
{
  var annotations_link = this.create_path_link("Annotations");
  $(annotations_link).click($.proxy(function() {
      var annotations_node = new NeuronNavigatorAnnotationListNode();
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));

  return annotations_link;
};

NeuronNavigatorNode.prototype.create_users_link = function()
{
  var users_link = this.create_path_link("Users");
  $(users_link).click($.proxy(function() {
      var users_node = new NeuronNavigatorUserListNode();
      users_node.link(this.navigator, this);
      this.navigator.select_node(users_node);
  }, this));

  return users_link;
};

NeuronNavigatorNode.prototype.create_neurons_link = function()
{
  var neurons_link = this.create_path_link("Neurons");
  $(neurons_link).click($.proxy(function() {
      var node = new NeuronNavigatorNeuronListNode();
      node.link(this.navigator, this);
      this.navigator.select_node(node);
  }, this));

  return neurons_link
};

NeuronNavigatorNode.prototype.create_path_link = function(text)
{
  var option = document.createElement('a');
  option.setAttribute('href', '#');
  option.setAttribute('class', 'navigator_content_option');
  // Add text to option, if passed
  if (text)
  {
    option.innerHTML = text;
  }

  return option;
};


/**
 * The home node of the navigator. It links to annotation
 * and users nodes.
 */
var NeuronNavigatorHomeNode = function()
{
  // A home node acts as the root node and has therefore no parent.
  this.link(null);
};

NeuronNavigatorHomeNode.prototype = {};
$.extend(NeuronNavigatorHomeNode.prototype, new NeuronNavigatorNode("Home"));

NeuronNavigatorHomeNode.prototype.create_content = function()
{
  var content = document.createElement('div');

  // Add annotation and user list links
  var annotations_link = this.create_annotations_link();
  var users_link = this.create_users_link();
  content.appendChild(annotations_link);
  content.appendChild(users_link);

  // Add link for active skeleton
  var active_skeleton_link = this.create_path_link("Active Skeleton");
  $(active_skeleton_link).click($.proxy(function() {
      // TODO: What should be done when a neuron/skeleton is clicked?
  }, this));
  content.appendChild(active_skeleton_link);

  return content;
};


/**
 * The annotation list node of the navigator provides a list of all available
 * annotations minus the onces choses in already existing filters. If clicked
 * on a listed annotations, it adds a new annotation filter.
 */
var NeuronNavigatorAnnotationListNode = function() {};

NeuronNavigatorAnnotationListNode.prototype = {};
$.extend(NeuronNavigatorAnnotationListNode.prototype,
    new NeuronNavigatorNode("Annotations"));

NeuronNavigatorAnnotationListNode.prototype.create_content = function()
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_annotations_content' +
      this.navigator.widgetID);
  content.innerHTML = "Please wait while the available annotatios are requested";

  // Make node easily accessible in created methods
  var self = this;

  // Collect all filtered annotations into post data
  var filters = this.collect_filters();
  var post_data = {
    'ignored_annotations': filters.reduce(function(o, f) {
        if (f.annotation) {
          o.push(f.annotation);
        }
        return o;
      }, [])
  };

  // Get the list of currently available annotations
  requestQueue.register(django_url + project.id + '/annotations/list',
      'POST', post_data, function(status, data, text) {
        var e = $.parseJSON(data);
        if (status != 200) {
          alert("The server returned an unexpected status (" +
            status + ") with error message:\n" + text);
        } else {
          // Create a list of annotation links
          var annotations = e.map(function(a) {
            var annotations_link = self.create_path_link(a);
            $(annotations_link).click(function() {
                var annotations_node = new NeuronNavigatorAnnotationFilterNode(a);
                annotations_node.link(self.navigator, self);
                self.navigator.select_node(annotations_node);
            });
            return annotations_link;
          });
          // Add all annotation links
          $('#navigator_annotations_content' + self.navigator.widgetID).empty().
            append(annotations);
        }
      });

  return content;
};


/**
 * The user list node of the navigator provides a list of all existing users.
 * It will add a user filter if clicked on one of them.
 */
var NeuronNavigatorUserListNode = function() {};

NeuronNavigatorUserListNode.prototype = {};
$.extend(NeuronNavigatorUserListNode.prototype,
    new NeuronNavigatorNode("Users"));

NeuronNavigatorUserListNode.prototype.create_content = function()
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_users_content' +
      this.navigator.widgetID);
  content.innerHTML = "Please wait while the existing users are requested";

  // Make node easily accessible in created methods
  var self = this;

  // Collect all filtered annotations into post data
  var filters = this.collect_filters();
  var post_data = {
    'ignored_users': filters.reduce(function(o, f) {
        if (f.user) {
          o.push(f.user);
        }
        return o;
      }, [])
  };

  // Get the list of currently available annotations
  requestQueue.register(django_url + 'user-list',
      'POST', post_data, function(status, data, text) {
        var e = $.parseJSON(data);
        if (status != 200) {
          alert("The server returned an unexpected status (" +
            status + ") with error message:\n" + text);
        } else {
          // Create a list of user links
          var users = e.map(function(u) {
            var user_link = self.create_path_link(u.full_name +
                " (" + u.login + ")");
            $(user_link).click(function() {
                var filter_node = new NeuronNavigatorUserFilterNode(u);
                filter_node.link(self.navigator, self);
                self.navigator.select_node(filter_node);
            });
            return user_link;
          });
          // Add all annotation links
          $('#navigator_users_content' + self.navigator.widgetID).empty().
            append(users);
        }
      });

  return content;
};


/**
 * The neuron list node of the navigator lists all neurons matching the
 * filter criteria in the path.
 */
var NeuronNavigatorNeuronListNode = function() {};

NeuronNavigatorNeuronListNode.prototype = {};
$.extend(NeuronNavigatorNeuronListNode.prototype,
    new NeuronNavigatorNode("Neurons"));

NeuronNavigatorNeuronListNode.prototype.create_content = function()
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_neuronlist_content' +
      this.navigator.widgetID);
  content.innerHTML = "Please wait while matching neurons are requested";

  // Make node easily accessible in created methods
  var self = this;

  // Collect all filters into post data
  var filters = this.collect_filters();
  var post_data = filters.reduce(function(o, f) {
        if (f.user) {
          // Expect only one user filter and create the
          // field in result object if one exists.
          o.neuron_query_by_annotator = f.user;
        }
        if (f.annotation) {
          o.neuron_query_by_annotation.push(f.annotation);
        }
        return o;
      }, {
        'neuron_query_by_annotation': []
      });

  // Get the list of currently available annotations
  requestQueue.register(django_url + project.id +
      '/neuron/query-by-annotations',
      'POST', post_data, function(status, data, text) {
        var e = $.parseJSON(data);
        if (status != 200) {
          alert("The server returned an unexpected status (" +
            status + ") with error message:\n" + text);
        } else {
          // Create a list of neuron links
          var neurons = e.map(function(n) {
            var neuron_link = self.create_path_link(n.name +
                " (ID: " + n.id + ", Skeleton ID: " + n.skeleton_id +
                ", Root node: " + n.root_node + ")");
            $(neuron_link).click(function() {
                // TODO: What should happen when clicking a neuron?
            });
            return neuron_link;
          });
          // If the list is empty, create informational text
          if (e.length == 0) {
            neurons = document.createElement('em');
            neurons.appendChild(document.createTextNode(
                  "No neurons matching the given filters where found."));
          }
          // Add all annotation links
          $('#navigator_neuronlist_content' + self.navigator.widgetID).empty().
            append(neurons);
        }
      });

  return content;
};


/**
 * The annotation filter node of the navigator filters output based on the
 * existence of an annotations. The content it creates lists user, neuron,
 * annotation and co-annotation links.
 */
var NeuronNavigatorAnnotationFilterNode = function(included_annotation)
{
  this.filters = new NeuronNavigatorFilter(included_annotation)
  this.name = "A: " + included_annotation;
};

NeuronNavigatorAnnotationFilterNode.prototype = {};
$.extend(NeuronNavigatorAnnotationFilterNode.prototype,
    new NeuronNavigatorNode("Empty Annotation Filter"));

NeuronNavigatorAnnotationFilterNode.prototype.create_content = function()
{
  /* An annotation filter node, will display options to add ad user filter,
   * another annotation filter or to select a neuron.
   */
  var content = document.createElement('div');

  var annotations_link = this.create_annotations_link();
  content.appendChild(annotations_link);

  // Only show the users link, if there hasn't been one before
  var filters = this.collect_filters();
  var has_user_filter = filters.some(function(f) {
    return f.user;
  });
  if (!has_user_filter) {
    var users_link = this.create_users_link();
    content.appendChild(users_link);
  }

  var neurons_link = this.create_neurons_link();
  content.appendChild(neurons_link);

  return content;
};


/**
 * The user filter node of the navigator filters output based on the
 * ownership by a particular user. The content it creates lists user, neuron,
 * annotation and co-annotation links.
 */
var NeuronNavigatorUserFilterNode = function(included_user)
{
  this.filters = new NeuronNavigatorFilter(null, included_user.id)
  this.name = "U: " + included_user.login;
};

NeuronNavigatorUserFilterNode.prototype = {};
$.extend(NeuronNavigatorUserFilterNode.prototype,
    new NeuronNavigatorNode("Empty User Filter"));

NeuronNavigatorUserFilterNode.prototype.create_content = function()
{
  var content = document.createElement('div');

  var annotations_link = this.create_annotations_link();
  var neurons_link = this.create_neurons_link();
  content.appendChild(annotations_link);
  content.appendChild(neurons_link);

  return content;
};
