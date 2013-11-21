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
  var home_node = new NeuronNavigator.HomeNode(this.widgetID);
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
  var cloned_node = this.current_node.clone(NN);
  // Create a new window, based on the newly created navigator
  WindowMaker.create('neuron-navigator', NN);
  // Select the cloned node in the new navigator
  NN.select_node(cloned_node);
};


/**
 * A class representing a node in the graph of the navigator.
 */
NeuronNavigator.Node = function(name)
{
  this.name = name;
  this.navigator = null;

  /* Because some nodes use tables to display data, some common options are
   * kept on the abstract node level.
   */
  this.possibleLengths = [25, 100, -1];
  this.possibleLengthsLabels = this.possibleLengths.map(
      function (n) { return (n === -1) ? "All" : n.toString() });
};

NeuronNavigator.Node.prototype.link = function(navigator, parent_node)
{
  this.navigator = navigator;
  this.parent_node = parent_node;
};

NeuronNavigator.Node.prototype.clone = function(new_navigator)
{
  // Create a new object and make sure the clone has the
  // same prototype as the original.
  var clone = Object.create(Object.getPrototypeOf(this));
  // Copy over all fields that are not-part of the prototype chain
  for (var key in this) {
    if (this.hasOwnProperty(key)) {
      // Ignore navigator and parent node fields for cloning as they
      // are set later anyway.
      if (key !== 'navigator' && key !== 'parent_node') {
        clone[key] = deepCopy(this[key]);
      }
    }
  }
  clone.navigator = new_navigator;

  // Clone the parent as well
  if (this.parent_node) {
    clone.parent_node = this.parent_node.clone(new_navigator);
  } else {
    clone.parent_node = null;
  }

  return clone;
};

NeuronNavigator.Node.prototype.create_path = function()
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

NeuronNavigator.Node.prototype.add_content = function(container)
{
  return undefined;
};

NeuronNavigator.Node.prototype.create_annotations_link = function()
{
  var annotations_link = this.create_path_link("Annotations");
  $(annotations_link).click($.proxy(function() {
      var annotations_node = new NeuronNavigator.AnnotationListNode();
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));

  return annotations_link;
};

NeuronNavigator.Node.prototype.create_coannotations_link = function()
{
  var annotations_link = this.create_path_link("Co-Annotations");
  $(annotations_link).click($.proxy(function() {
      var annotations_node = new NeuronNavigator.AnnotationListNode();
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));

  return annotations_link;
};

NeuronNavigator.Node.prototype.create_users_link = function()
{
  var users_link = this.create_path_link("Users");
  $(users_link).click($.proxy(function() {
      var users_node = new NeuronNavigator.UserListNode();
      users_node.link(this.navigator, this);
      this.navigator.select_node(users_node);
  }, this));

  return users_link;
};

NeuronNavigator.Node.prototype.create_neurons_link = function()
{
  var neurons_link = this.create_path_link("Neurons");
  $(neurons_link).click($.proxy(function() {
      var node = new NeuronNavigator.NeuronListNode();
      node.link(this.navigator, this);
      this.navigator.select_node(node);
  }, this));

  return neurons_link
};

NeuronNavigator.Node.prototype.create_path_link = function(text)
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
NeuronNavigator.Node.prototype.create_header_row = function(columns)
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
 * Adds a datatable like menu to the container passed.
 */
NeuronNavigator.Node.prototype.add_menu_table = function(entries, container)
{
  var toolbar_classes = 'fg-toolbar ui-toolbar ui-widget-header' +
      ' ui-helper-clearfix'

  // Create top tool bar
  var top_toolbar = document.createElement('div');
  top_toolbar.setAttribute('class', toolbar_classes +
      ' ui-corner-tl ui-corner-tr' );
  top_toolbar.appendChild(document.createTextNode("Please select..."));

  // Create table body
  var table_body = document.createElement('tbody');
  var odd=true;
  var rows = entries.map(function(e) {
    var td = document.createElement('td');
    td.appendChild(document.createTextNode(e));
    var tr = document.createElement('tr');
    tr.appendChild(td);
    tr.setAttribute('class', odd ? "odd" : "even");
    table_body.appendChild(tr);

    odd = !odd;
    return tr;
  });

  // Create table itself
  var table = document.createElement('table');
  table.setAttribute('class', 'display');
  table.setAttribute('cellpadding', 0);
  table.setAttribute('cellspacing', 0);
  table.setAttribute('border', 0);
  table.appendChild(table_body);

  // Create bottom tool bar with 1em height
  var bottom_toolbar = document.createElement('div');
  bottom_toolbar.setAttribute('class', toolbar_classes +
      'ui-corner-bl ui-corner-br');
  bottom_toolbar.style.height = '1em';

  // Add single elements to container
  container.appendChild(top_toolbar);
  container.appendChild(table);
  container.appendChild(bottom_toolbar);

  return rows;
};

NeuronNavigator.Node.prototype.add_annotation_list_table = function($container,
    table_id, annotation_filter, user_id_filter, neuron_id_filter)
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_annotationlist_content' +
      this.navigator.widgetID);

  // Create annotation table
  var columns = ['Annotation'];
  var table_header = document.createElement('thead');
  table_header.appendChild(this.create_header_row(columns));
  var table_footer = document.createElement('tfoot');
  table_footer.appendChild(this.create_header_row(columns));
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
  $container.append(content);

  // Fill annotation table
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
        // Annotation filter -- we are requesting annotations that are
        // annotated with a specific filter
        if (annotation_filter) {
          aoData.push({
              'name': 'annotation',
              'value': annotation_filter
          });
        }
        // User filter -- we are requesting annotations that are used by a
        // particular user.
        if (user_id_filter) {
          aoData.push({
              'name': 'user_id',
              'value': user_id_filter
          });
        }
        // Neuron filter -- we are requesting annotations that are used for
        // a particular neuron.
        if (neuron_id_filter) {
          aoData.push({
              'name': 'neuron_id',
              'value': neuron_id_filter
          });
        }
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
        "bSearchable": true,
        "bSortable": true
      },
    ]
  });

  return datatable;
};

NeuronNavigator.Node.prototype.add_user_list_table = function($container,
    table_id, annotation_filter, neuron_id_filter)
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
  $container.append(content);

  // Fill user table
  var datatable = $(table).dataTable({
    "bDestroy": true,
    "sDom": '<"H"lr>t<"F"ip>',
    "bProcessing": true,
    "bServerSide": true,
    "bAutoWidth": false,
    "iDisplayLength": this.possibleLengths[0],
    "sAjaxSource": django_url + 'user-table-list',
    "fnServerData": function (sSource, aoData, fnCallback) {
        // Annotation filter -- we are requesting users that have
        // used a certain annotation
        if (annotation_filter) {
          aoData.push({
              'name': 'annotation',
              'value': annotation_filter
          });
        }
        // Neuron filter -- only users who annotated this neuron
        // are shown.
        if (neuron_id_filter) {
          aoData.push({
              'name': 'neuron_id',
              'value': neuron_id_filter
          });
        }
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

  return datatable;
};


/**
 * The home node of the navigator. It links to annotation
 * and users nodes.
 */
NeuronNavigator.HomeNode = function()
{
  // A home node acts as the root node and has therefore no parent.
  this.link(null);
};

NeuronNavigator.HomeNode.prototype = {};
$.extend(NeuronNavigator.HomeNode.prototype, new NeuronNavigator.Node("Home"));

NeuronNavigator.HomeNode.prototype.add_content = function(container)
{
  var content = document.createElement('div');

  // Create menu and add it to container
  var menu_entries = ['Annotations', 'Users', 'Active Skeleton'];
  var table_rows = this.add_menu_table(menu_entries, content);

  // Add container to DOM
  container.append(content);

  // Append click handler
  $(table_rows[0]).click($.proxy(function() {
      // Show annotation list
      var annotations_node = new NeuronNavigator.AnnotationListNode();
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));
  $(table_rows[1]).click($.proxy(function() {
      // Show user list
      var users_node = new NeuronNavigator.UserListNode();
      users_node.link(this.navigator, this);
      this.navigator.select_node(users_node);
  }, this));
  $(table_rows[2]).click($.proxy(function() {
      // Show active skeleton
  }, this));
};


/**
 * The annotation list node of the navigator provides a list of all available
 * annotations. If clicked on a listed annotations, it adds a new annotation
 * filter node.
 */
NeuronNavigator.AnnotationListNode = function() {};

NeuronNavigator.AnnotationListNode.prototype = {};
$.extend(NeuronNavigator.AnnotationListNode.prototype,
    new NeuronNavigator.Node("Annotations"));

NeuronNavigator.AnnotationListNode.prototype.add_content = function(container)
{
  var annotation_filter = undefined;
  var user_id_filter = undefined;

  // Use parent node provided filters, if available
  if (this.parent_node) {
    if (this.parent_node.annotation) {
      annotation_filter = this.parent_node.annotation;
    }
    if (this.parent_node.user_id) {
      user_id_filter = this.parent_node.user_id;
    }
  }

  var table_id = 'navigator_annotationlist_table' + this.navigator.widgetID;

  // Add annotation data table based on filters above
  var datatable = this.add_annotation_list_table(container, table_id,
      annotation_filter, user_id_filter);

  // Make self accessible in callbacks more easily
  var self = this;

  // If a user is selected an annotation filter node is created and the event
  // is removed.
  $('#' + table_id).on('click', ' tbody tr', function () {
      var aData = datatable.fnGetData(this);
      var a = aData[0];
      var annotations_node = new NeuronNavigator.AnnotationFilterNode(a);
      annotations_node.link(self.navigator, self);
      self.navigator.select_node(annotations_node);
  });
};


/**
 * The user list node of the navigator provides a list of all existing users.
 * It will add a user filter node if clicked on one of them.
 */
NeuronNavigator.UserListNode = function() {};

NeuronNavigator.UserListNode.prototype = {};
$.extend(NeuronNavigator.UserListNode.prototype,
    new NeuronNavigator.Node("Users"));

NeuronNavigator.UserListNode.prototype.add_content = function(container)
{
  var annotation_filter = undefined;
  var neuron_id_filter = undefined;

  // Use parent node provided filters, if available
  if (this.parent_node) {
    if (this.parent_node.annotation) {
      annotation_filter = this.parent_node.annotation;
    }
    if (this.parent_node.neuron_id) {
      neuron_id_filter = this.parent_node.neuron_id;
    }
  }

  var table_id = 'navigator_user_table' + this.navigator.widgetID;

  // Add user data table based on filters above
  var datatable = this.add_user_list_table(container, table_id,
      annotation_filter, neuron_id_filter);

  // Make self accessible in callbacks more easily
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
      var filter_node = new NeuronNavigator.UserFilterNode(user);
      filter_node.link(self.navigator, self);
      self.navigator.select_node(filter_node);
  });
};


/**
 * The neuron list node of the navigator lists all neurons.
 */
NeuronNavigator.NeuronListNode = function() {};

NeuronNavigator.NeuronListNode.prototype = {};
$.extend(NeuronNavigator.NeuronListNode.prototype,
    new NeuronNavigator.Node("Neurons"));

/**
 * This method retrieves the currently selected neurons in the neuron list
 * node. It is required by the annotate button functionality which expects
 * this function to be available on the current instance.
 */
NeuronNavigator.NeuronListNode.prototype.get_selected_neurons = function()
{
  var cb_selector = '#navigator_annotationlist_table' +
      this.navigator.widgetID + ' tbody td.selector_column input';
  var selected_neurons = $(cb_selector).toArray().reduce(function(ret, cb) {
    if ($(cb).prop('checked')) {
      ret.push($(cb).attr('neuron_id'));
    }
    return ret;
  }, []);

  return selected_neurons;
};

NeuronNavigator.NeuronListNode.prototype.add_content = function(container)
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_neuronlist_content' +
      this.navigator.widgetID);

  // Create annotate button
  var annotate_button = document.createElement('input');
  annotate_button.setAttribute('type', 'button');
  annotate_button.setAttribute('value', 'Annotate');
  content.appendChild(annotate_button);

  // Create neuron table
  var columns = ['Selected', 'Name'];
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

  // Make self accessible in callbacks more easily
  var self = this;

  // Fill neuron table
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
        // Use parent node provides filters, if available
        if (self.parent_node) {
          // Annotation filter
          if (self.parent_node.annotation) {
            aoData.push({
                'name': 'neuron_query_by_annotation',
                'value': self.parent_node.annotation
            });
          }
          // User filter -- only show neurons that have been annotated by the
          // user in question
          if (self.parent_node.user_id) {
            aoData.push({
                'name': 'neuron_query_by_annotator',
                'value': self.parent_node.user_id
            });
          }
        }
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
    "aaSorting": [[ 1, "desc" ]],
    "aoColumns": [
      {
        "sWidth": '5em',
        "sClass": 'selector_column center',
        "bSearchable": false,
        "bSortable": false,
        "mRender": function (data, type, full) {
          var cb_id = 'navigator_neuron_' + full[4] + '_selection' +
              self.navigator.widgetID;
          return '<input type="checkbox" id="' + cb_id +
              '" name="someCheckbox" neuron_id="' + full[4] + '" />';
      },
      },
      {
        "bSearchable": true,
        "bSortable": true,
        "mData": 0,
        "aDataSort": [ 0 ],
      },
    ]
  });

  $(annotate_button).click(function() {
    if (self.get_selected_neurons().length > 0) {
      NeuronAnnotations.prototype.annotate_neurons.call(self);
    } else {
      alert("Please select at least one neuron to annotate first!");
    }
  });

  // Add click handler for the select column's header to select/unselect all
  // check boxes at once.
  $('#' + table_id).on('click', 'thead th:first', function () {
    var checkboxes = $('#' + table_id).find('tbody td.selector_column input');
    checkboxes.prop("checked", !checkboxes.prop("checked"));
  });

  // Add click handler for table cells containing a select check box
  $('#' + table_id).on('click', 'tbody td.selector_column', function (event) {
      // Make sure the event doesn't bubble up, because otherwise it would reach
      // the click handler of the tr element.
      event.stopPropagation();
      // Toggle check box if the event target isn't the checkbox itself and was
      // therefore triggered already.
      if (!$(event.target).is('input')) {
        var checkbox = $(this).find('input');
        checkbox.prop("checked", !checkbox.prop("checked"));
      }
  });

  // If a user is selected an annotation filter node is created and the event
  // is removed.
  $('#' + table_id).on('click', 'tbody tr', function () {
      var aData = datatable.fnGetData(this);
      var n = {
        'name': aData[0],
        'skeleton_ids': aData[2],
        'id': aData[4],
      };
      var node = new NeuronNavigator.NeuronNode(n);
      node.link(self.navigator, self);
      self.navigator.select_node(node);
  });
};


/**
 * The annotation filter node of the navigator filters output based on the
 * existence of an annotations. The content it creates lists user, neuron,
 * annotation and co-annotation links.
 */
NeuronNavigator.AnnotationFilterNode = function(included_annotation)
{
  this.annotation = included_annotation
  this.name = "A: " + included_annotation;
};

NeuronNavigator.AnnotationFilterNode.prototype = {};
$.extend(NeuronNavigator.AnnotationFilterNode.prototype,
    new NeuronNavigator.Node("Empty Annotation Filter"));

NeuronNavigator.AnnotationFilterNode.prototype.add_content = function(container)
{
  var content = document.createElement('div');

  // Create menu and add it to container
  var menu_entries = ['Annotations', 'Co-Annotations', 'Users', 'Neurons'];
  var table_rows = this.add_menu_table(menu_entries, content);

  // Add container to DOM
  container.append(content);

  // Append click handler
  $(table_rows[0]).click($.proxy(function() {
      // Show annotation list
      var annotations_node = new NeuronNavigator.AnnotationListNode();
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));
  $(table_rows[1]).click($.proxy(function() {
      // Show co-annotation list
  }, this));
  $(table_rows[2]).click($.proxy(function() {
      // Show user list
      var users_node = new NeuronNavigator.UserListNode();
      users_node.link(this.navigator, this);
      this.navigator.select_node(users_node);
  }, this));
  $(table_rows[3]).click($.proxy(function() {
      // Show neuron list
      var node = new NeuronNavigator.NeuronListNode();
      node.link(this.navigator, this);
      this.navigator.select_node(node);
  }, this));
};


/**
 * The user filter node of the navigator filters output based on the
 * ownership by a particular user. The content it creates lists user, neuron,
 * annotation and co-annotation links.
 */
NeuronNavigator.UserFilterNode = function(included_user)
{
  this.user_id = included_user.id;
  this.name = included_user.login;
};

NeuronNavigator.UserFilterNode.prototype = {};
$.extend(NeuronNavigator.UserFilterNode.prototype,
    new NeuronNavigator.Node("Empty User Filter"));

NeuronNavigator.UserFilterNode.prototype.add_content = function(container)
{
  var content = document.createElement('div');

  // Create menu and add it to container
  var menu_entries = ['Annotations', 'Neurons'];
  var table_rows = this.add_menu_table(menu_entries, content);

  // Add container to DOM
  container.append(content);

  // Append click handler
  $(table_rows[0]).click($.proxy(function() {
      // Show annotation list
      var annotations_node = new NeuronNavigator.AnnotationListNode();
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));
  $(table_rows[1]).click($.proxy(function() {
      // Show neuron list
      var node = new NeuronNavigator.NeuronListNode();
      node.link(this.navigator, this);
      this.navigator.select_node(node);
  }, this));
};


/**
 * A neuron node displays information about a particular node. It shows all the
 * skeletons that are model for a neuron as well as all its annotations and the
 * user that has locked it.
 */
NeuronNavigator.NeuronNode = function(neuron)
{
  this.neuron_id = neuron.id;
  this.name = neuron.name;
  this.skeleton_ids = neuron.skeleton_ids;
};

NeuronNavigator.NeuronNode.prototype = {};
$.extend(NeuronNavigator.NeuronNode.prototype,
    new NeuronNavigator.Node("Neuron node"));

NeuronNavigator.NeuronNode.prototype.add_content = function(container)
{
  // Make self accessible in callbacks more easily
  var self = this;

  container.addClass('multi_table_node');

  /* Skeletons: Request compact JSON data */
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_skeletonlist_content' +
      this.navigator.widgetID);

  // Create neuron table
  //var columns = ['Skeleton ID', 'Raw cable (nm)', 'Smooth cable (nm)',
  //    'N inputs', 'N outputs', 'N nodes', 'N branch nodes', 'N end nodes'];
  var columns = ['Skeleton ID', 'N nodes', 'N branch nodes', 'N end nodes',
      'N open end nodes', '% reviewed'];
  var table_header = document.createElement('thead');
  table_header.appendChild(this.create_header_row(columns));
  var table_footer = document.createElement('tfoot');
  table_footer.appendChild(this.create_header_row(columns));
  var table_id = 'navigator_skeletonlist_table' + this.navigator.widgetID;
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

  var skeleton_table = $(table).dataTable({
    "bDestroy": true,
    "sDom": '<"H"lr>t<"F"ip>',
    // default: <"H"lfr>t<"F"ip>
    "bProcessing": true,
    "bServerSide": false, // Enable sorting locally, and prevent sorting from calling the fnServerData to reload the table -- an expensive and undesirable operation.
    "bAutoWidth": false,
    "iDisplayLength": -1,
    "aLengthMenu": [
      [-1, 10, 100, 200],
      ["All", 10, 100, 200]
    ],
    //"aLengthChange": false,
    "bJQueryUI": true,
    "aoColumns": [
      { // Skeleton ID
        "bSearchable": true,
        "bSortable": true
      },
      { // Number of nodes
        "bSearchable": true,
        "bSortable": true
      },
      { // Number of branch nodes
        "bSearchable": true,
        "bSortable": true
      },
      { // Number of end nodes
        "bSearchable": true,
        "bSortable": true
      },
      { // Number of open end nodes
        "bSearchable": true,
        "bSortable": true
      },
      { // Percent of reviewed nodes
        "bSearchable": true,
        "bSortable": true
      },
    ]
  });

  // Manually request compact-json object for skeleton
  var loader_fn = function(skeleton_id) {
    requestQueue.register(django_url + project.id +
        '/skeleton/' + skeleton_id + '/compact-json', 'POST', {},
        function(status, text) {
          try {
            if (200 === status) {
              var json = $.parseJSON(text);
              if (json.error) {
                alert(json.error);
              } else {
                var nodes = json[1];
                var tags = json[2];
                var connectors = json[3];

                // Map of node ID vs node properties array
                var nodeProps = nodes.reduce(function(ob, node) {
                  ob[node[0]] = node;
                  return ob;
                }, {});

                // Cache for reusing Vector3d instances
                var vs = {};

                // Create edges between all skeleton nodes
                var geometry = new THREE.Geometry();;
                nodes.forEach(function(node) {
                  // node[0]: treenode ID
                  // node[1]: parent ID
                  // node[2]: user ID
                  // node[3]: reviewer ID
                  // 4,5,6: x,y,z
                  // node[7]: radius
                  // node[8]: confidence
                  // If node has a parent
                  var v1;
                  if (node[1]) {
                    var p = nodeProps[node[1]];
                    v1 = vs[node[0]];
                    if (!v1) {
                      v1 = new THREE.Vector3(node[4], node[5], node[6]);
                      v1.node_id = node[0];
                      v1.user_id = node[2];
                      v1.reviewer_id = node[3];
                      vs[node[0]] = v1;
                    }
                    var v2 = vs[p[0]];
                    if (!v2) {
                      v2 = new THREE.Vector3(p[4], p[5], p[6]);
                      v2.node_id = p[0];
                      v2.user_id = p[2];
                      v2.reviewer_id = p[3];
                      vs[p[0]] = v2;
                    }
                    geometry.vertices.push(v1);
                    geometry.vertices.push(v2);
                  }
                }, this);

                // Use arbor data structure to do measurements
                var arbor = new Arbor().addEdges(geometry.vertices, function(v) {
                  return v.node_id;
                });

                /* Calculate end point information */

                // Find open and closed end nodes and convert to integers
                var end_nodes = arbor.findEndNodes().map(function(n) {
                  return +n
                });
                // See which end node tags are available at all
                var end_tags = ['ends', 'uncertain end', 'not a branch', 'soma'];
                var available_end_tags = end_tags.reduce(function(o, e) {
                    if (e in tags) {
                      o.push(e);
                    }
                    return o;
                }, []);

                var tagged_end_nodes = end_nodes.reduce(function(o, n) {
                  var node_is_tagged = function(t) {
                    return tags[t].indexOf(n) > -1;
                  };
                  if (available_end_tags.some(node_is_tagged)) {
                    o.push(n);
                  }
                  return o;
                }, []);

                /* Calculate review percentage */

                var num_reviewed = nodes.reduce(function(total, node) {
                  if (node[3] != -1) {
                    total = total + 1;
                  }
                  return total;
                }, 0);
                var percent_reviewed = (num_reviewed / nodes.length) * 100;
                percent_reviewed = Math.round(percent_reviewed * 100) / 100;


                // Put data into table
                skeleton_table.fnAddData([
                  skeleton_id,
                  arbor.countNodes(),
                  arbor.findBranchNodes().length,
                  tagged_end_nodes.length,
                  end_nodes.length - tagged_end_nodes.length,
                  percent_reviewed + "%",
                ]);
              }
            } else {
              alert("Unexpected status code: " + status);
            }
          } catch(e) {
              console.log(e, e.stack);
              growlAlert("ERROR", "Problem loading skeleton " + skeleton_id);
          }
        });
  };

  var num_loaded = this.skeleton_ids.reduce(function(o, sk_id) {
    if (loader_fn(sk_id)) {
      return o + 1;
    } else {
      return o;
    }
  }, 0);


  /* Annotations */
  var annotation_filter = undefined;
  var user_id_filter = undefined;
  var neuron_id_filter = this.neuron_id;

  var annotation_table_id = 'navigator_annotationlist_table' +
      this.navigator.widgetID;

  // Add annotation data table based on filters above
  var annotation_datatable = this.add_annotation_list_table(container,
      annotation_table_id, annotation_filter, user_id_filter,
      neuron_id_filter);

  // If a user is selected an annotation filter node is created and the event
  // is removed.
  $('#' + annotation_table_id).on('click', ' tbody tr', function () {
      var aData = annotation_datatable.fnGetData(this);
      var a = aData[0];
      var annotations_node = new NeuronNavigator.AnnotationFilterNode(a);
      annotations_node.link(self.navigator, self);
      self.navigator.select_node(annotations_node);
  });


  /* User who locked the neuron */
  var locked_annotation_filter = "locked";

  var locked_user_table_id = 'navigator_userlist_table' +
      this.navigator.widgetID;

  // Add user data table based on filters above
  var locked_user_datatable = this.add_user_list_table(container,
      locked_user_table_id, locked_annotation_filter, neuron_id_filter);

  // If a user is selected a user filter node is created and the event is
  // removed.
  $('#' + locked_user_table_id).on('click', ' tbody tr', function () {
      var aData = locked_user_datatable.fnGetData(this);
      if (aData) {
        var user = {
          'login': aData[0],
          'first_name': aData[1],
          'last_name': aData[2],
          'id': aData[3],
        }
        var filter_node = new NeuronNavigator.UserFilterNode(user);
        filter_node.link(self.navigator, self);
        self.navigator.select_node(filter_node);
      }
  });
};
