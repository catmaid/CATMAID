/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

"use strict";

var NeuronNavigator = function()
{
  this.widgetID = this.registerInstance();
  this.registerSource();
  this.current_node = null;
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

  // Create a container where all the content of every node will be placed in
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_content' + this.widgetID);
  content.setAttribute('class', 'navigator_content');
  container.appendChild(content);

  // Add home node as starting point without any parent
  var home_node = new NeuronNavigatorHomeNode(this.widgetID);
  home_node.link(this, null);
  this.select_node(home_node);
};

NeuronNavigator.prototype.select_node = function(node)
{
  // Remember this node as the current node
  this.current_node = node;

  // Set the navigation bar contents
  var $navi_bar = $('#navigator_navi_bar' + this.widgetID).empty();
  $navi_bar.append(node.create_path(this));

  // Create a container where all the content of every node will be placed in
  var duplicate_button = document.createElement('div');
  duplicate_button.setAttribute('class', 'navigator_duplicate_button');
  var duplicate_image = document.createElement('img');
  duplicate_image.setAttribute('src', STATIC_URL_JS +
      'widgets/themes/kde/duplicate_navigator.png');
  duplicate_button.appendChild(duplicate_image);
  $navi_bar.append(duplicate_button);
  $(duplicate_image).on('click', this.duplicate.bind(this));
  
  // Clear the content div, and let the node add content to it
  var $content = $('#navigator_content' + this.widgetID).empty();
  node.add_content($content);
};

/**
 *  With the help of the duplicate method, the whole navigator is cloned. It
 *  produces a new window with the same content as the first navigator.
 */
NeuronNavigator.prototype.duplicate = function()
{
  var NN = new NeuronNavigator();
  // Clone the current node (and its parents)
  var cloned_node = $.extend(true, {}, this.current_node);
  // Override the navigator property of all cloned nodes
  var n = cloned_node;
  do {
    n.navigator = NN;
    n = n.parent_node;
  } while (n)
  // Create a new window, based on the newly created navigator
  WindowMaker.create('neuron-navigator', NN);
  // Select the cloned node in the new navigator
  NN.select_node(cloned_node);
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

  /* Because some nodes use tables to display data, some common options are
   * kept on the abstract node level.
   */
  this.possibleLengths = [25, 100, -1];
  this.possibleLengthsLabels = this.possibleLengths.map(
      function (n) { return (n === -1) ? "All" : n.toString() });
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

NeuronNavigatorNode.prototype.add_content = function(container)
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

NeuronNavigatorNode.prototype.create_coannotations_link = function()
{
  var annotations_link = this.create_path_link("Co-Annotations");
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

// A convenience helper for creating a table header
NeuronNavigatorNode.prototype.create_header_row = function(columns)
{
  var tr = columns.reduce(function(tr, col) {
    var th = document.createElement('th');
    th.appendChild(document.createTextNode(col));
    tr.appendChild(th);
    return tr;
  }, document.createElement('tr'));

  return tr;
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

NeuronNavigatorHomeNode.prototype.add_content = function(container)
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

  container.append(content);
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

NeuronNavigatorAnnotationListNode.prototype.add_content = function(container)
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_annotationlist_content' +
      this.navigator.widgetID);

  // Create user table
  var columns = ['Annotation'];
  var table_header = document.createElement('thead');
  table_header.appendChild(this.create_header_row(columns));
  var table_footer = document.createElement('tfoot');
  table_footer.appendChild(this.create_header_row(columns));
  var table_id = 'navigator_annotationlist_table' + this.navigator.widgetID;
  var table = document.createElement('table');
  table.setAttribute('id', table_id);
  table.setAttribute('class', 'display');
  table.setAttribute('cellpadding', 0);
  table.setAttribute('cellspacing', 0);
  table.setAttribute('border', 0);
  table.appendChild(table_header);
  table.appendChild(table_footer);

  content.appendChild(table);

  // Add table to DOM
  container.append(content);

  // Fill user table
  var datatable = $(table).dataTable({
    // http://www.datatables.net/usage/options
    "bDestroy": true,
    "sDom": '<"H"lr>t<"F"ip>',
    "bProcessing": true,
    "bServerSide": true,
    "bAutoWidth": false,
    "iDisplayLength": this.possibleLengths[0],
    "sAjaxSource": django_url + project.id + '/annotations/table-list',
    "fnServerData": function (sSource, aoData, fnCallback) {
        $.ajax({
            "dataType": 'json',
            "cache": false,
            "type": "POST",
            "url": sSource,
            "data": aoData,
            "success": fnCallback
        });
    },
    "aLengthMenu": [
        this.possibleLengths,
        this.possibleLengthsLabels
    ],
    "bJQueryUI": true,
    "aaSorting": [[ 2, "desc" ]],
    "aoColumns": [
      {
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true
      },
    ]
  });

  // Make self available in callback (original this is needed there)
  var self = this;

  // If a user is selected an annotation filter node is created and the event
  // is removed.
  $('#' + table_id).on('click', ' tbody tr', function () {
      var aData = datatable.fnGetData(this);
      var a = aData[0];
      var annotations_node = new NeuronNavigatorAnnotationFilterNode(a);
      annotations_node.link(self.navigator, self);
      self.navigator.select_node(annotations_node);
  });
};


/**
 * The user list node of the navigator provides a list of all existing users.
 * It will add a user filter if clicked on one of them.
 */
var NeuronNavigatorUserListNode = function() {};

NeuronNavigatorUserListNode.prototype = {};
$.extend(NeuronNavigatorUserListNode.prototype,
    new NeuronNavigatorNode("Users"));

NeuronNavigatorUserListNode.prototype.add_content = function(container)
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_users_content' +
      this.navigator.widgetID);

  // Create user table
  var columns = ['Login', 'First Name', 'Last Name', 'ID'];
  var table_header = document.createElement('thead');
  table_header.appendChild(this.create_header_row(columns));
  var table_footer = document.createElement('tfoot');
  table_footer.appendChild(this.create_header_row(columns));
  var table_id = 'navigator_user_table' + this.navigator.widgetID;
  var table = document.createElement('table');
  table.setAttribute('id', table_id);
  table.setAttribute('class', 'display');
  table.setAttribute('cellpadding', 0);
  table.setAttribute('cellspacing', 0);
  table.setAttribute('border', 0);
  table.appendChild(table_header);
  table.appendChild(table_footer);

  content.appendChild(table);

  // Add table to DOM
  container.append(content);

  // Fill user table
  var datatable = $(table).dataTable({
    // http://www.datatables.net/usage/options
    "bDestroy": true,
    "sDom": '<"H"lr>t<"F"ip>',
    "bProcessing": true,
    "bServerSide": true,
    "bAutoWidth": false,
    "iDisplayLength": this.possibleLengths[0],
    "sAjaxSource": django_url + 'user-table-list',
    "fnServerData": function (sSource, aoData, fnCallback) {
        $.ajax({
            "dataType": 'json',
            "cache": false,
            "type": "POST",
            "url": sSource,
            "data": aoData,
            "success": fnCallback
        });
    },
    "aLengthMenu": [
        this.possibleLengths,
        this.possibleLengthsLabels
    ],
    "bJQueryUI": true,
    "aaSorting": [[ 0, "desc" ]],
    "aoColumns": [
      {
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true
      },
      {
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true
      },
      {
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true
      },
      {
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true
      },
    ]
  });

  // Make self available in callback (original this is needed there)
  var self = this;

  // If a user is selected a user filter node is created and the event is
  // removed.
  $('#' + table_id).on('click', ' tbody tr', function () {
      var aData = datatable.fnGetData(this);
      var user = {
        'login': aData[0],
        'first_name': aData[1],
        'last_name': aData[2],
        'id': aData[3],
      }
      var filter_node = new NeuronNavigatorUserFilterNode(user);
      filter_node.link(self.navigator, self);
      self.navigator.select_node(filter_node);
  });
};


/**
 * The neuron list node of the navigator lists all neurons matching the
 * filter criteria in the path.
 */
var NeuronNavigatorNeuronListNode = function() {};

NeuronNavigatorNeuronListNode.prototype = {};
$.extend(NeuronNavigatorNeuronListNode.prototype,
    new NeuronNavigatorNode("Neurons"));

NeuronNavigatorNeuronListNode.prototype.add_content = function(container)
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_neuronlist_content' +
      this.navigator.widgetID);

  // Create user table
  var columns = ['Name', 'Annotations', 'Skeleton IDs', 'Root node IDs', 'ID'];
  var table_header = document.createElement('thead');
  table_header.appendChild(this.create_header_row(columns));
  var table_footer = document.createElement('tfoot');
  table_footer.appendChild(this.create_header_row(columns));
  var table_id = 'navigator_annotationlist_table' + this.navigator.widgetID;
  var table = document.createElement('table');
  table.setAttribute('id', table_id);
  table.setAttribute('class', 'display');
  table.setAttribute('cellpadding', 0);
  table.setAttribute('cellspacing', 0);
  table.setAttribute('border', 0);
  table.appendChild(table_header);
  table.appendChild(table_footer);

  content.appendChild(table);

  // Add table to DOM
  container.append(content);

  // Fill user table
  var datatable = $(table).dataTable({
    // http://www.datatables.net/usage/options
    "bDestroy": true,
    "sDom": '<"H"lr>t<"F"ip>',
    "bProcessing": true,
    "bServerSide": true,
    "bAutoWidth": false,
    "iDisplayLength": this.possibleLengths[0],
    "sAjaxSource": django_url + project.id + '/neuron/table/query-by-annotations',
    "fnServerData": function (sSource, aoData, fnCallback) {
        $.ajax({
            "dataType": 'json',
            "cache": false,
            "type": "POST",
            "url": sSource,
            "data": aoData,
            "success": fnCallback
        });
    },
    "aLengthMenu": [
        this.possibleLengths,
        this.possibleLengthsLabels
    ],
    "bJQueryUI": true,
    "aaSorting": [[ 0, "desc" ]],
    "aoColumns": [
      {
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true
      },
      {
        "sClass": "center",
        "bSearchable": false,
        "bSortable": false,
        "mRender": "[, ].name"
      },
      {
        "sClass": "center",
        "bSearchable": false,
        "bSortable": false
      },
      {
        "sClass": "center",
        "bSearchable": false,
        "bSortable": false
      },
      {
        "sClass": "center",
        "bSearchable": true,
        "bSortable": true
      },
    ]
  });

  // Make self available in callback (original this is needed there)
  var self = this;

  // If a user is selected an annotation filter node is created and the event
  // is removed.
  $('#' + table_id).on('click', ' tbody tr', function () {
      var aData = datatable.fnGetData(this);
      var a = aData[0];
      var annotations_node = new NeuronNavigatorAnnotationFilterNode(a);
      annotations_node.link(self.navigator, self);
      self.navigator.select_node(annotations_node);
  });
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

NeuronNavigatorAnnotationFilterNode.prototype.add_content = function(container)
{
  /* An annotation filter node, will display options to add ad user filter,
   * another annotation filter or to select a neuron.
   */
  var content = document.createElement('div');

  var annotations_link = this.create_annotations_link();
  content.appendChild(annotations_link);

  var coannotations_link = this.create_coannotations_link();
  content.appendChild(coannotations_link);

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

  container.append(content);
};


/**
 * The user filter node of the navigator filters output based on the
 * ownership by a particular user. The content it creates lists user, neuron,
 * annotation and co-annotation links.
 */
var NeuronNavigatorUserFilterNode = function(included_user)
{
  this.filters = new NeuronNavigatorFilter(null, included_user.id)
  this.name = included_user.login;
};

NeuronNavigatorUserFilterNode.prototype = {};
$.extend(NeuronNavigatorUserFilterNode.prototype,
    new NeuronNavigatorNode("Empty User Filter"));

NeuronNavigatorUserFilterNode.prototype.add_content = function(container)
{
  var content = document.createElement('div');

  var annotations_link = this.create_annotations_link();
  var neurons_link = this.create_neurons_link();
  content.appendChild(annotations_link);
  content.appendChild(neurons_link);

  container.append(content);
};
