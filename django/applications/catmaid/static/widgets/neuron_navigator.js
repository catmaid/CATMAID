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

NeuronNavigator.prototype.getSelectedSkeletons = function()
{
  return this.current_node.getSelectedSkeletons();
};

NeuronNavigator.prototype.hasSkeleton = function(skeleton_id)
{
  return this.current_node.hasSkeleton(skeleton_id);
};

NeuronNavigator.prototype.getSelectedSkeletonModels = function()
{
  return this.current_node.getSelectedSkeletonModels();
};

NeuronNavigator.prototype.highlight = function(skeleton_id)
{
  this.current_node.highlight(skeleton_id);
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

NeuronNavigator.prototype.set_annotation_node = function(annotation_name)
{
  // Create a home node, an annotation list node an an actual annotation node.
  var home_node = new NeuronNavigator.HomeNode(this.widgetID);
  home_node.link(this, null);
  var al_node = new NeuronNavigator.AnnotationListNode();
  al_node.link(this, home_node);
  var a_node = new NeuronNavigator.AnnotationFilterNode(
      annotation_name, false, false);
  a_node.link(this, al_node);
  // Select the annotation node
  this.select_node(a_node);
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
  duplicate_button.setAttribute('class', 'navigator_button');
  var duplicate_image = document.createElement('img');
  duplicate_image.setAttribute('src', STATIC_URL_JS +
      'widgets/themes/kde/duplicate_navigator.png');
  duplicate_button.setAttribute('title', 'Duplicate navigator window');
  duplicate_button.appendChild(duplicate_image);
  $navi_bar.append(duplicate_button);
  $(duplicate_image).on('click', this.duplicate.bind(this));

  // Create a re-root button to remove all filters not in effect
  var reroot_button = document.createElement('div');
  reroot_button.setAttribute('class', 'navigator_button');
  var reroot_image = document.createElement('img');
  reroot_image.setAttribute('src', STATIC_URL_JS +
      'widgets/themes/kde/reroot_navigator.png');
  reroot_button.setAttribute('title',
      'Remove all nodes not needed for current view');
  reroot_button.appendChild(reroot_image);
  $navi_bar.append(reroot_button);
  $(reroot_image).on('click', this.reroot.bind(this));

  // Clear the content div, and let the node add content to it
  var $content = $('#navigator_content' + this.widgetID).empty();

  // Get the current filter set and add content based on it
  var filters = this.current_node.get_filter_set();
  node.add_content($content, filters);

  // Update sync link
  this.updateLink(this.getSelectedSkeletonModels());
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
 * The reroot method removes all nodes of the current chain that don't add any
 * filtering effect.
 */
NeuronNavigator.prototype.reroot = function()
{
  // Find the last break in the filter chain
  var node = this.current_node;
  while (node.parent_node) {
    if (node.breaks_filter_chain()) {
      break;
    }
    node = node.parent_node;
  }
  // Only create a new home node if we didn't reach the actual home node.
  if (node.parent_node) {
    // Add home node as starting point without any parent
    var home_node = new NeuronNavigator.HomeNode(this.widgetID);
    home_node.link(this, null);
    // Prune node path to this node
    node.parent_node = home_node;
  }
  // Refresh the current node
  this.select_node(this.current_node);
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

/**
 * Default implementation for getting information for the skeleton source
 * interface. It can be overridden by base classes.
 */
NeuronNavigator.Node.prototype.getSelectedSkeletons = function() {
  return [];
};

/**
 * Default implementation for getting information for the skeleton source
 * interface. It can be overridden by base classes.
 */
NeuronNavigator.Node.prototype.hasSkeleton = function(skeleton_id) {
  return false;
};

/**
 * Default implementation for getting information for the skeleton source
 * interface. It can be overridden by base classes.
 */
NeuronNavigator.Node.prototype.getSelectedSkeletonModels = function()
{
  return {};
};

/**
 * Default implementation for getting information for the skeleton source
 * interface. It can be overridden by base classes.
 */
NeuronNavigator.Node.prototype.highlight = function(skeleton_id)
{
  return;
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
    var delimiter = this.breaks_filter_chain() ? '|' : '>';
    path_elements.push(document.createTextNode(" " + delimiter + " "));
    path_elements.push(path_link);
    return path_elements;
  } else {
    return [path_link];
  }
};

/**
 * Collect filters of this and upstream nodes. This node adds all the known
 * filters to a single object and puts it into a list, followed by the object
 * from nodes coming before it.
 */
NeuronNavigator.Node.prototype.collect_filters = function()
{
  // Create this node's filter set
  var filter = {};
  filter.co_annotates = this.is_coannotation || false;
  filter.annotation = this.annotation || null;
  filter.neuron_id = this.neuron_id || null;
  filter.user_id = this.user_id || null;

  // Add upstream filters unless this node breaks the chain
  var filters = [filter]
  if (this.parent_node && !this.breaks_filter_chain()) {
    filters = filters.concat(this.parent_node.collect_filters());
  }

  return filters;
};

/**
 * Get the filter set valid for the current node. This consists of collecting
 * all filters up to the next chain break and then condensing it to a single
 * filter. The following rules are used for this:
 * 1. Only the firs user found is used considered.
 * 2. Only the first neuron found is considered.
 */
NeuronNavigator.Node.prototype.get_filter_set = function()
{
  var filters = this.collect_filters();
  var final_filter = filters.reduce(function(o, f) {
    // Use the first user filter available
    if (!o.user_id && f.user_id) {
      o.user_id = f.user_id;
    }
    // Use the first neuron available
    if (!o.neuron_id && f.neuron_id) {
      o.neuron_id = f.neuron_id;
    }
    // Add annotations, co-annotations and meta-annotations
    if (f.annotation) {
      // If the current filter adds a co-annotation, add a parallel annotation
      // to the final filter.
      if (f.co_annotates) {
        o.parallel_annotations.push(f.annotation);
      } else if (f.is_meta_annotation) {
        // If the parent is a meta annotation, an 'annotates' filter is created.
        // This should restrict results to annotations that are annotated by it.
        o.annotates.push(f.annotation);
      } else {
        // Add parent annotation, if any
        o.annotations.push(f.annotation);
      }
    }

    // Increase parsed filter count
    o.parsed_filters = o.parsed_filters + 1;

    return o;
  }, {
    parsed_filters: 0,
    parallel_annotations: [],
    annotations: [],
    annotates: [],
  });

  return final_filter;
};

NeuronNavigator.Node.prototype.breaks_filter_chain = function()
{
  return false;
};

NeuronNavigator.Node.prototype.add_content = function(container)
{
  return undefined;
};

/**
 * A convenience helper for creating a table header. It procues text header
 * nodes if strings are provided and will add objects directly to the TH tag
 * otherwise.
 */
NeuronNavigator.Node.prototype.create_header_row = function(columns)
{
  var tr = columns.reduce(function(tr, col) {
    var th = document.createElement('th');
    if (typeof col == 'string') {
      th.appendChild(document.createTextNode(col));
    } else {
      th.appendChild(col);
    }
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
    table_id, filters, display_annotator, unlink_handler)
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_annotationlist_content' +
      this.navigator.widgetID);

  // Prepare column definition, depending on whether there is a removal handler
  // and if the annotator should be displayed.
  var columns = ['Annotation', 'Last used', '# used'];
  var column_params = [
      { // Annotation name
        "bSearchable": true,
        "bSortable": true
      },
      { // Last used date
        "bSearchable": false,
        "bSortable": true
      },
      { // Usage
        "bSearchable": false,
        "bSortable": true
      },
    ];
  if (display_annotator) {
      columns.push('Annotator');
      column_params.push(
        { // Annotator username
          "bSearchable": true,
          "bSortable": true
        });
  }
  if (unlink_handler) {
    var self = this;
    columns.push('Action');
    column_params.push(
      {
        "sWidth": '5em',
        "sClass": 'selector_column center',
        "bSearchable": false,
        "bSortable": false,
        "mRender": function (data, type, full) {
          var a_class = 'navigator_annotation_unlink_caller' +
              self.navigator.widgetID;
          return '<a href="#" class="' + a_class + '" annotation_id="' +
              full[4] + '">de-annotate</>';
      }
    });
  }

  // Create annotation table
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

  // Add a general handler for this table to catch all clicks on the
  // unlink links.
  if (unlink_handler) {
    $(table).on('click', ' a.navigator_annotation_unlink_caller' +
        this.navigator.widgetID, function () {
            var ann_id = $(this).attr('annotation_id');
            unlink_handler(ann_id);
        });
  }

  // Fill annotation table
  var datatable = $(table).dataTable({
    // http://www.datatables.net/usage/options
    "bDestroy": true,
    "sDom": '<"H"lrf>t<"F"ip>',
    "bProcessing": true,
    "bServerSide": true,
    "bAutoWidth": false,
    "iDisplayLength": this.possibleLengths[0],
    "sAjaxSource": django_url + project.id + '/annotations/table-list',
    "fnServerData": function (sSource, aoData, fnCallback) {
        // Annotation filter -- we are requesting annotations that are
        // annotated with specific annotations
        if (filters.annotations) {
          filters.annotations.forEach(function(annotation, i) {
            aoData.push({
                'name': 'annotations[' + i + ']',
                'value': annotation
            });
          });
        }
        // Annotates filter -- we are requesting annotations that are
        // annotating entities given by this filter
        if (filters.annotates) {
          filters.annotates.forEach(function(annotation, i) {
            aoData.push({
                'name': 'annotates[' + i + ']',
                'value': annotation
            });
          });
        }
        // Parallel annotations -- all listed annotations do only appear
        // together with these annotations
        if (filters.parallel_annotations) {
          filters.parallel_annotations.forEach(function(annotation, i) {
            aoData.push({
                'name': 'parallel_annotations[' + i + ']',
                'value': annotation
            });
          });
        }
        // User filter -- we are requesting annotations that are used by a
        // particular user.
        if (filters.user_id) {
          aoData.push({
              'name': 'user_id',
              'value': filters.user_id
          });
        }
        // Neuron filter -- we are requesting annotations that are used for
        // a particular neuron.
        if (filters.neuron_id) {
          aoData.push({
              'name': 'neuron_id',
              'value': filters.neuron_id
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
    "oLanguage": {
      "sSearch": "Search annotations (regex):"
    },
    "bJQueryUI": true,
    "aaSorting": [[ 0, "asc" ]],
    "aoColumns": column_params
  });

  return datatable;
};

NeuronNavigator.Node.prototype.add_user_list_table = function($container,
    table_id, filters)
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
        if (filters.annotations) {
          filters.annotations.forEach(function(annotation, i) {
            aoData.push({
                'name': 'annotations[' + i + ']',
                'value': annotation
            });
          });
        }
        // Neuron filter -- only users who annotated this neuron
        // are shown.
        if (filters.neuron_id) {
          aoData.push({
              'name': 'neuron_id',
              'value': filters.neuron_id
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
    "aaSorting": [[ 0, "asc" ]],
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

NeuronNavigator.Node.prototype.add_neuron_list_table = function($container,
    table_id, filters, callback)
{
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_neuronlist_content' +
      this.navigator.widgetID);

  // Create neuron table
  var selected_cb1 = document.createElement('input');
  selected_cb1.setAttribute('type', 'checkbox');
  var columns1 = [selected_cb1, 'Name'];
  var table_header = document.createElement('thead');
  table_header.appendChild(this.create_header_row(columns1));
  var selected_cb2 = document.createElement('input');
  selected_cb2.setAttribute('type', 'checkbox');
  var columns2 = [selected_cb2, 'Name'];
  var table_footer = document.createElement('tfoot');
  table_footer.appendChild(this.create_header_row(columns2));
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

  // Fill neuron table
  var datatable = $(table).dataTable({
    // http://www.datatables.net/usage/options
    "bDestroy": true,
    "sDom": '<"H"lrf>t<"F"ip>',
    "bProcessing": true,
    "bServerSide": true,
    "bAutoWidth": false,
    "iDisplayLength": this.possibleLengths[0],
    "sAjaxSource": django_url + project.id + '/neuron/table/query-by-annotations',
    "fnServerData": function (sSource, aoData, fnCallback) {
        // Annotation filter
        if (filters.annotations) {
          filters.annotations.forEach(function(annotation, i) {
            aoData.push({
                'name': 'neuron_query_by_annotation[' + i + ']',
                'value': annotation
            });
          });
        }
        // User filter -- only show neurons that have been annotated by the
        // user in question
        if (filters.user_id) {
          aoData.push({
              'name': 'neuron_query_by_annotator',
              'value': filters.user_id
          });
        }
        $.ajax({
            "dataType": 'json',
            "cache": false,
            "type": "POST",
            "url": sSource,
            "data": aoData,
            "success": function(result) {
                fnCallback(result);
                if (callback) {
                  callback(result);
                }
            }
        });
    },
    "aLengthMenu": [
        this.possibleLengths,
        this.possibleLengthsLabels
    ],
    "oLanguage": {
      "sSearch": "Search neuron names (regex):"
    },
    "bJQueryUI": true,
    "aaSorting": [[ 1, "asc" ]],
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

  return datatable;
};


/**
 * The annotation list node of the navigator provides a list of all available
 * annotations. If double clicked on a listed annotations, it adds a new
 * annotation filter node.
 */
NeuronNavigator.AnnotationListNode = function(creates_co_annotations)
{
  if (creates_co_annotations) {
    this.name = "Co-Annotations";
    this.creates_co_annotations = true;
  } else {
    this.name = "Annotations";
    this.creates_co_annotations = false;
  }
};

NeuronNavigator.AnnotationListNode.prototype = {};
$.extend(NeuronNavigator.AnnotationListNode.prototype,
    new NeuronNavigator.Node(""));

NeuronNavigator.AnnotationListNode.prototype.become_co_annotation_list =
    function()
{
};

NeuronNavigator.AnnotationListNode.prototype.create_annotation_filter =
    function(annotation)
{
  return new NeuronNavigator.AnnotationFilterNode(annotation,
      this.creates_co_annotations, false);
};

NeuronNavigator.AnnotationListNode.prototype.add_content = function(container,
    filters)
{
  // If this node should display co-annotations, it needs to remove the last
  // annotation found in the filters and use it as a parallel annotation.
  if (this.creates_co_annotations) {
    if (filters.annotations && filters.annotations.length > 0) {
      var last_annotation = filters.annotations.pop();
      filters.parallel_annotations.push(last_annotation);
    }
  }

  var table_id = 'navigator_annotationlist_table' + this.navigator.widgetID;

  // Add annotation data table based on filters above
  var datatable = this.add_annotation_list_table(container, table_id, filters,
      false, null);

  // Make self accessible in callbacks more easily
  var self = this;

  // If an annotation is selected an annotation filter node is created and the
  // event is removed. If the annotation list node should create co-annotations,
  // a co-annotaion-filter is created.
  $('#' + table_id).on('dblclick', ' tbody tr', function () {
      var aData = datatable.fnGetData(this);
      var a = aData[0];
      var annotations_node = self.create_annotation_filter(a);
      annotations_node.link(self.navigator, self);
      self.navigator.select_node(annotations_node);
  });
};

/**
 * The meta annotation list node of the navigator provides a list of all
 * available annotations that are either annotated with the given class or that
 * annotats it. If double clicked on a listed annotations, it adds a new
 * annotation filter node.
 */
NeuronNavigator.MetaAnnotationListNode = function(is_meta_annotation)
{
  if (is_meta_annotation) {
    this.name = "Annotates";
    this.is_meta_annotation = true;
  } else {
    this.name = "Annotated with";
    this.is_meta_annotation = false;
  }
};

NeuronNavigator.MetaAnnotationListNode.prototype = {};
$.extend(NeuronNavigator.MetaAnnotationListNode.prototype,
    new NeuronNavigator.AnnotationListNode(false));

NeuronNavigator.MetaAnnotationListNode.prototype.create_annotation_filter =
    function(annotation)
{
  return new NeuronNavigator.AnnotationFilterNode(a, false,
      this.is_meta_annotation);
};


/**
 * The user list node of the navigator provides a list of all existing users.
 * It will add a user filter node if double clicked on one of them.
 */
NeuronNavigator.UserListNode = function() {};

NeuronNavigator.UserListNode.prototype = {};
$.extend(NeuronNavigator.UserListNode.prototype,
    new NeuronNavigator.Node("Users"));

NeuronNavigator.UserListNode.prototype.add_content = function(container,
    filters)
{
  var table_id = 'navigator_user_table' + this.navigator.widgetID;
  var datatable = this.add_user_list_table(container, table_id, filters);

  // Make self accessible in callbacks more easily
  var self = this;
  // If a user is selected a user filter node is created and the event is
  // removed.
  $('#' + table_id).on('dblclick', ' tbody tr', function () {
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
NeuronNavigator.NeuronListNode = function()
{
  this.listed_neurons = [];
};

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
  var cb_selector = '#navigator_neuronlist_table' +
      this.navigator.widgetID + ' tbody td.selector_column input';
  var selected_neurons = $(cb_selector).toArray().reduce(function(ret, cb) {
    if ($(cb).prop('checked')) {
      ret.push($(cb).attr('neuron_id'));
    }
    return ret;
  }, []);

  return selected_neurons;
};

NeuronNavigator.NeuronListNode.prototype.add_content = function(container,
    filters)
{
  // Create annotate button
  var annotate_button = document.createElement('input');
  annotate_button.setAttribute('type', 'button');
  annotate_button.setAttribute('value', 'Annotate');
  container.append(annotate_button);

  // Callback for post-process data received from server
  var post_process = (function(result)
  {
      // Reset the node's neuron list
      this.listed_neurons = [];
      // Save the new data in this node
      result.aaData.forEach(function(e) {
          this.listed_neurons.push({
            name: e[0],
            annotations: e[1],
            skeleton_ids: e[2],
            root_node_ids: e[3],
            id: e[4]
          });
      }, this);
  }).bind(this);

  var table_id = 'navigator_neuronlist_table' + this.navigator.widgetID;
  var datatable = this.add_neuron_list_table(container, table_id, filters,
      post_process);

  // Make self accessible in callbacks more easily
  var self = this;

  $(annotate_button).click(function() {
    var selected_neurons = self.get_selected_neurons();
    if (selected_neurons.length > 0) {
      NeuronAnnotations.prototype.annotate_neurons(selected_neurons);
    } else {
      alert("Please select at least one neuron to annotate first!");
    }
  });

  // Add click handler for the select column's header to select/unselect
  // all check boxes at once.
  $('#' + table_id).on('click', 'thead th input,tfoot th input', function (e) {
    var checkboxes = $('#' + table_id).find('tbody td.selector_column input');
    checkboxes.prop("checked", $(this).prop("checked"));
    // Toggle second checkbox
    var $cb1 = $('#' + table_id).find('thead th input');
    var $cb2 = $('#' + table_id).find('tfoot th input');
    if ($cb1.length > 0 && $cb2.length > 0) {
      if (this === $cb1[0]) {
        $cb2.prop('checked', !$cb2.prop('checked'));
      } else if (this === $cb2[0]) {
        $cb1.prop('checked', !$cb1.prop('checked'));
      }
    }
  });

  // Add a change handler for the check boxes in each row
  $('#' + table_id).on('change', 'tbody td.selector_column input', (function() {
    // Update sync link
    this.navigator.updateLink(this.navigator.getSelectedSkeletonModels());
  }).bind(this));

  // Add double click handler for table cells containing a select check box
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
  $('#' + table_id).on('dblclick', 'tbody tr', function () {
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
 * Returns the IDs of the skeletons modeling the currently selected neurons.
 */
NeuronNavigator.NeuronListNode.prototype.getSelectedSkeletons = function() {
  return this.get_entities(true).reduce(function(o, e) {
    return o.concat(e.skeleton_ids);
  }, []);
};

/**
 * Tests if one the current list of neurons has a particular skeleton model.
 */
NeuronNavigator.NeuronListNode.prototype.hasSkeleton = function(skeleton_id) {
  return this.listed_neurons.some(function(n) {
    return n.skeleton_ids.indexOf(skeleton_id) != -1;
  });
};

/**
 * If a neuron in the current list is modeled by this particular skeleton ID, it
 * will be highlighted.
 */
NeuronNavigator.NeuronListNode.prototype.highlight = function(skeleton_id)
{
  var $cells = $('#navigator_neuronlist_table' + this.navigator.widgetID +
      ' tbody td');
  // Remove any highlighting
  $cells.css('background-color', '');
  // Highlight corresponding row if present
  this.listed_neurons.forEach(function(n) {
    if (n.skeleton_ids.indexOf(skeleton_id) != -1) {
      var $row_cells = $cells.find('input[neuron_id=' + n.id + ']').
          parent().parent().find('td');
      $row_cells.css('background-color',
          SelectionTable.prototype.highlighting_color);
    }
  });
};

/**
 * Retruns a skeleton model dictionary.
 */
NeuronNavigator.NeuronListNode.prototype.getSelectedSkeletonModels = function() {
  return this.get_entities(true).reduce((function(o, n) {
    n.skeleton_ids.forEach(function(skid) {
      o[skid] = new SelectionTable.prototype.SkeletonModel(
          skid, n.name, new THREE.Color().setRGB(1, 1, 0));
    });
    return o;
  }).bind(this), {});
};

/**
 * If passed true, this function returns a list of selected entities in the
 * neuron list. Otherweise, a list of unselected entities is returned.
 */
NeuronNavigator.NeuronListNode.prototype.get_entities = function(checked)
{
  return this.listed_neurons.reduce((function(o, e) {
      // Test if one of the checkboxes for a particular neuron is checked
      var is_checked = $("#navigator_neuronlist_table" +
          this.navigator.widgetID + ' tbody td.selector_column').find(
              'input[neuron_id="' + e.id + '"]').is(':checked');
      if (is_checked == checked) {
          o.push(e);
      }
      return o;
  }).bind(this), []);
}


/**
 * The annotation filter node of the navigator filters output based on the
 * existence of an annotations. The content it creates lists user, neuron,
 * annotation and co-annotation links.
 */
NeuronNavigator.AnnotationFilterNode = function(included_annotation,
    is_coannotation, is_meta_annotation)
{
  this.annotation = included_annotation
  this.is_coannotation = is_coannotation;
  this.is_meta_annotation = is_meta_annotation;
  this.name = included_annotation;
};

NeuronNavigator.AnnotationFilterNode.prototype = {};
$.extend(NeuronNavigator.AnnotationFilterNode.prototype,
    new NeuronNavigator.Node("Empty Annotation Filter"));

NeuronNavigator.AnnotationFilterNode.prototype.breaks_filter_chain = function()
{
  return !this.is_coannotation;
};

NeuronNavigator.AnnotationFilterNode.prototype.add_content = function(container,
    filters)
{
  var content = document.createElement('div');

  // Create menu and add it to container
  var menu_entries = ['Annotates', 'Annotated with', 'Co-Annotations', 'Users',
      'Neurons'];
  var table_rows = this.add_menu_table(menu_entries, content);

  // Add container to DOM
  container.append(content);

  // Append double click handler
  $(table_rows[0]).dblclick($.proxy(function() {
      // Show annotation list for annotated annotations
      var annotations_node = new NeuronNavigator.MetaAnnotationListNode(true);
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));
  $(table_rows[1]).dblclick($.proxy(function() {
      // Show annotation list for meta annotations
      var annotations_node = new NeuronNavigator.MetaAnnotationListNode(false);
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));
  $(table_rows[2]).dblclick($.proxy(function() {
      // Show co-annotation list
      var node = new NeuronNavigator.AnnotationListNode(true);
      node.link(this.navigator, this);
      this.navigator.select_node(node);
  }, this));
  $(table_rows[3]).dblclick($.proxy(function() {
      // Show user list
      var users_node = new NeuronNavigator.UserListNode();
      users_node.link(this.navigator, this);
      this.navigator.select_node(users_node);
  }, this));
  $(table_rows[4]).dblclick($.proxy(function() {
      // Show neuron list
      var node = new NeuronNavigator.NeuronListNode();
      node.link(this.navigator, this);
      this.navigator.select_node(node);
  }, this));

  // Add a list of neurons matching the current filter set including the current
  // annotation filter node.
  var neuron_title = document.createElement('h4');
  neuron_title.appendChild(document.createTextNode('Neurons'));
  container.append(neuron_title);

  // Add content from neuron list node. As a currently needed hack, a copy
  // of the current node has to be added.
  NeuronNavigator.NeuronListNode.prototype.add_content.call(
      this, container, filters);
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

NeuronNavigator.UserFilterNode.prototype.breaks_filter_chain = function()
{
  return true;
};

NeuronNavigator.UserFilterNode.prototype.add_content = function(container,
    filters)
{
  var content = document.createElement('div');

  // Create menu and add it to container
  var menu_entries = ['Annotations', 'Neurons'];
  var table_rows = this.add_menu_table(menu_entries, content);

  // Add container to DOM
  container.append(content);

  // Append double click handler
  $(table_rows[0]).dblclick($.proxy(function() {
      // Show annotation list
      var annotations_node = new NeuronNavigator.AnnotationListNode();
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));
  $(table_rows[1]).dblclick($.proxy(function() {
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
  this.neuron_name = neuron.name;
  this.name = neuron.name;
  this.skeleton_ids = neuron.skeleton_ids;
};

NeuronNavigator.NeuronNode.prototype = {};
$.extend(NeuronNavigator.NeuronNode.prototype,
    new NeuronNavigator.Node("Neuron node"));

NeuronNavigator.NeuronNode.prototype.breaks_filter_chain = function()
{
  return true;
};

NeuronNavigator.NeuronNode.prototype.add_content = function(container, filters)
{
  // Make self accessible in callbacks more easily
  var self = this;

  container.addClass('multi_table_node');

  // Create refresh button
  var refresh_button = document.createElement('input');
  refresh_button.setAttribute('type', 'button');
  refresh_button.setAttribute('value', 'Refresh');
  container.append(refresh_button);

  // When clicked, the refresh button will reload this node
  $(refresh_button).click((function() {
    this.navigator.select_node(this);
  }).bind(this));

  // Create annotate button
  var annotate_button = document.createElement('input');
  annotate_button.setAttribute('type', 'button');
  annotate_button.setAttribute('value', 'Annotate');
  container.append(annotate_button);

  // When clicked, the annotate button should prompt for a new annotation and
  // reload the node
  $(annotate_button).click((function() {
    NeuronAnnotations.prototype.annotate_neurons([this.neuron_id],
        (function() { this.navigator.select_node(this); }).bind(this));
  }).bind(this));

  /* Skeletons: Request compact JSON data */
  var content = document.createElement('div');
  content.setAttribute('id', 'navigator_skeletonlist_content' +
      this.navigator.widgetID);

  // Create skeleton table
  var columns = ['Skeleton ID', 'N nodes', 'N branch nodes', 'N end nodes',
      'N open end nodes', '% reviewed'];
  var table_header = document.createElement('thead');
  table_header.appendChild(this.create_header_row(columns));
  var skeleton_table_id = 'navigator_skeletonlist_table' + this.navigator.widgetID;
  var table = document.createElement('table');
  table.setAttribute('id', skeleton_table_id);
  table.setAttribute('class', 'display');
  table.setAttribute('cellpadding', 0);
  table.setAttribute('cellspacing', 0);
  table.setAttribute('border', 0);
  table.appendChild(table_header);

  content.appendChild(table);

  // Add table to DOM
  container.append(content);

  var skeleton_datatable = $(table).dataTable({
    "bDestroy": true,
    "sDom": '<"H"<"nodeneuronname">r>t<"F">',
    // default: <"H"lfr>t<"F"ip>
    "bProcessing": true,
    "bAutoWidth": false,
    //"aLengthChange": false,
    "bJQueryUI": true,
    "bSort": false
  });

  // Add neuron name to caption
  $('div.nodeneuronname', container).html('Name: ' + this.neuron_name);

  // Manually request compact-json object for skeleton
  var loader_fn = function(skeleton_id) {
    requestQueue.register(django_url + project.id +
        '/skeleton/' + skeleton_id + '/compact-json', 'POST', {},
        function(status, text) {
          try {
            if (200 === status) {
              var json = $.parseJSON(text);
              if (json.error) {
                new ErrorDialog(json.error, json.detail).show();
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
                skeleton_datatable.fnAddData([
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

  // Add double click handler to skeleton to select it
  $('#' + skeleton_table_id).on('dblclick', ' tbody tr', function () {
      var aData = skeleton_datatable.fnGetData(this);
      var skeleton_id = aData[0];
      TracingTool.goToNearestInNeuronOrSkeleton( 'skeleton', skeleton_id );
  });


  /* Annotations */

  // Title
  var annotation_title = document.createElement('h4');
  annotation_title.appendChild(document.createTextNode('Annotations'));
  container.append(annotation_title);

  // Table filters and ID
  var annotation_table_id = 'navigator_annotationlist_table' +
      this.navigator.widgetID;

  // Add annotation data table based on filters above
  var annotation_datatable = this.add_annotation_list_table(container,
      annotation_table_id, filters, true, function(annotation_id) {
          // Unlink the annotation from the current neuron
          NeuronAnnotations.remove_annotation(self.neuron_id,
              annotation_id, function(message) {
                  // Display message returned by the server
                  growlAlert('Information', message);
                  // Refresh node
                  self.navigator.select_node(self);
              });
      });

  // If a user is selected an annotation filter node is created and the event
  // is removed.
  $('#' + annotation_table_id).on('dblclick', ' tbody tr', function () {
      var aData = annotation_datatable.fnGetData(this);
      var a = aData[0];
      var annotations_node = new NeuronNavigator.AnnotationFilterNode(a);
      annotations_node.link(self.navigator, self);
      self.navigator.select_node(annotations_node);
  });


  /* User who locked the neuron */

  requestQueue.register(django_url + project.id + '/annotations/list',
    'POST', {'neuron_id': this.neuron_id}, (function(status, text) {
        if (200 !== status) {
          alert("Unexpected status code: " + status);
        } else {
          var json = $.parseJSON(text);
          if (json.error) {
            new ErrorDialog(json.error, json.detail).show();
          } else {
            // Check if the neuron is locked and if so who did it
            var locked = json.annotations.filter(function(a) {
              return a.name === 'locked';
            });
            var annotation_title = document.createElement('h4');
            container.append(annotation_title);
            if (locked.length > 0) {
              var locked_user = locked[0].users[0];
              annotation_title.appendChild(document.createTextNode(
                  'User who locked this neuron: '));
              var a = document.createElement('a');
              a.appendChild(document.createTextNode(locked_user.name));
              annotation_title.appendChild(a);
              // If one clicks the user who locked the neuron, a new user filter
              // node is created.
              $(a).on('click', (function () {
                    var user = {
                      'login': locked_user.name,
                      'id': locked_user.id,
                    }
                    var filter_node = new NeuronNavigator.UserFilterNode(user);
                    filter_node.link(this.navigator, this);
                    this.navigator.select_node(filter_node);
              }).bind(this));
            } else {
              annotation_title.appendChild(document.createTextNode(
                  'No one locked this neuron'));
            }
          }
        }
  }).bind(this));
};

/**
 * Returns a list of skeleton IDs (usually one) modeling the current neuron.
 */
NeuronNavigator.NeuronNode.prototype.getSelectedSkeletons = function() {
  return this.skeleton_ids;
};

/**
 * Tests if the current neuron is modeled by a particular skeleton ID.
 */
NeuronNavigator.NeuronNode.prototype.hasSkeleton = function(skeleton_id) {
  return this.skeleton_ids.indexOf(skeleton_id) != -1;
};

/**
 * Highlights a row if it is representing the passed skeleton.
 */
NeuronNavigator.NeuronNode.prototype.highlight = function(skeleton_id)
{
  var $rows = $('#navigator_skeletonlist_table' +
      this.navigator.widgetID + ' tbody tr');
  // Remove any highlighting
  $rows.css('background-color', '');
  // Highlight corresponding row if present
  $rows.find('td:contains(' + skeleton_id + ')').parent().css(
      'background-color', SelectionTable.prototype.highlighting_color);
};

/**
 * Retruns a skeleton model dictionary.
 */
NeuronNavigator.NeuronNode.prototype.getSelectedSkeletonModels = function() {
  return this.skeleton_ids.reduce((function(o, skid) {
    o[skid] = new SelectionTable.prototype.SkeletonModel(
        skid, this.name, new THREE.Color().setRGB(1, 1, 0));
    return o;
  }).bind(this), {});
};


/**
 * A neuron node displays information about a particular node. It shows all the
 * skeletons that are model for a neuron as well as all its annotations and the
 * user that has locked it.
 */
NeuronNavigator.ActiveNeuronNode = function()
{
  // Check if there is currently an active skeleton
  this.current_skid = SkeletonAnnotations.getActiveSkeletonId();
  this.name = 'Active Neuron';
  this.sync_active_neuron = true;
};

NeuronNavigator.ActiveNeuronNode.prototype = {};
$.extend(NeuronNavigator.ActiveNeuronNode.prototype,
    new NeuronNavigator.NeuronNode({id: -1, name: '', skeleton_ids: []}));

NeuronNavigator.ActiveNeuronNode.prototype.add_content = function(container,
    filters)
{
  // Add checkbox to indicate if this node should update automatically if the
  // active neuron changes.
  var sync_checkbox = document.createElement('input');
  sync_checkbox.setAttribute('type', 'checkbox');
  if (this.sync_active_neuron) {
    sync_checkbox.setAttribute('checked', 'checked');
  }
  var sync_label = document.createElement('label');
  sync_label.appendChild(document.createTextNode('Sync active neuron'));
  sync_label.appendChild(sync_checkbox);
  sync_label.style.cssFloat = 'right';
  container.append(sync_label);
  $(sync_checkbox).change((function() {
    this.sync_active_neuron = $(sync_checkbox).is(':checked');
  }).bind(this));

  if (this.current_skid) {
    requestQueue.register(django_url + project.id + '/skeleton/' +
        this.current_skid + '/neuronname', 'POST', {}, (function(status, text) {
          if (200 !== status) {
            alert("Unexpected status code: " + status);
          } else {
            var json = $.parseJSON(text);
            if (json.error) {
              new ErrorDialog(json.error, json.detail).show();
            } else {
              this.skeleton_ids = [this.current_skid];
              this.neuron_id = json.neuronid;
              // Update the neuron name
              this.neuron_name = json.neuronname;
              // Call neuron node content creation
              NeuronNavigator.NeuronNode.prototype.add_content.call(this,
                  container, filters);
            }
          }
    }).bind(this));
  } else {
    // Reset neuron data
    this.neuron_id = -1;
    this.skeleton_ids = [];
    // Print message
    var message = document.createElement('em');
    var text = 'There is currently no active node';
    message.appendChild(document.createTextNode(text));
    container.append(message);
  }
};

/**
 * Triggers a reload of this node with update skeleton ID data.
 */
NeuronNavigator.ActiveNeuronNode.prototype.highlight = function(skeleton_id)
{
  if (this.sync_active_neuron) {
    this.current_skid = skeleton_id;
    this.navigator.select_node(this);
  }
}


/**
 * The home node of the navigator. It links to annotation and users nodes.
 * Additionally, it allows to see the neuron of the active skeleton and displays
 * a list of all neurons available. Therefore, it extends the neuron list node.
 */
NeuronNavigator.HomeNode = function()
{
  this.name = "Home";
  // A home node acts as the root node and has therefore no parent.
  this.link(null);
};

NeuronNavigator.HomeNode.prototype = {};
$.extend(NeuronNavigator.HomeNode.prototype,
    new NeuronNavigator.NeuronListNode());

NeuronNavigator.HomeNode.prototype.add_content = function(container, filters)
{
  var content = document.createElement('div');

  // Create menu and add it to container
  var menu_entries = ['Annotations', 'Users', 'Active Neuron'];
  var table_rows = this.add_menu_table(menu_entries, content);

  // Add container to DOM
  container.append(content);

  // Append double click handler
  $(table_rows[0]).dblclick($.proxy(function() {
      // Show annotation list
      var annotations_node = new NeuronNavigator.AnnotationListNode();
      annotations_node.link(this.navigator, this);
      this.navigator.select_node(annotations_node);
  }, this));
  $(table_rows[1]).dblclick($.proxy(function() {
      // Show user list
      var users_node = new NeuronNavigator.UserListNode();
      users_node.link(this.navigator, this);
      this.navigator.select_node(users_node);
  }, this));
  $(table_rows[2]).dblclick($.proxy(function() {
      // Show active neuron node
      var users_node = new NeuronNavigator.ActiveNeuronNode();
      users_node.link(this.navigator, this);
      this.navigator.select_node(users_node);
  }, this));

  // Add some space
  var neuron_title = document.createElement('h4');
  neuron_title.appendChild(document.createTextNode('All neurons'));
  container.append(neuron_title);

  // Add content from neuron list node
  NeuronNavigator.NeuronListNode.prototype.add_content.call(this, container,
      filters);
};
