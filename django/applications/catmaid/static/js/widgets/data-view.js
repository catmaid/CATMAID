/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * A minimal data view which is only able to show a welcome message and a
   * general header.
   */
  var DataView = function(options) {
    options = CATMAID.tools.updateFromDefaults(options, DataView.defaultOptions);

    this.id = options.id;
    this.type = options.code_type;

    this.container = document.createElement('div');

    this.header = options.header;
    this.message = options.message;
    this.classList = options.classList;
  };

  /**
   * Add DOM elements for this data view to passed in container.
   */
  DataView.prototype.createContent = function(container) {
    if (this.header) {
      var header = document.createElement('div');
      header.classList.add('header');

      var h = document.createElement('h1');
      h.appendChild(document.createTextNode('CATMAID'));
      header.appendChild(h);
      var logo = document.createElement('img');
      logo.setAttribute('src', CATMAID.makeStaticURL('/images/catmaidlogo.svg'));
      logo.onerror = function() {
        this.src = CATMAID.makeStaticURL('/images/catmaidlogo.png');
      };
      header.appendChild(logo);
      var clear = document.createElement('div');
      clear.classList.add('clear');
      header.appendChild(clear);

      container.appendChild(header);
    }
    if (this.message) {
      var p = document.createElement('p');
      p.setAttribute('data-role', 'message');
      if (this.classList) {
        p.setAttribute('class', this.classList);
      }
      container.appendChild(p);
    }

    this.container = container;

    return Promise.resolve();
  };

  /**
   * Update DOM elements.
   */
  DataView.prototype.refresh = function() {
    if (!this.container) return;

    $('div.header h1', this.container).attr('title',
        'Version: ' + CATMAID.CLIENT_VERSION);

    $('p[data-role=message]', this.container).text(this.message);
  };

  DataView.defaultOptions = {
    header: true,
    message: "Please feel free to open one of the public projects " +
        "or log in with your account and password.",
  };

  DataView.makeDataView = function(options) {
    var DataViewType = DataView.dataviewTypes[options.type];
    if (!DataViewType) {
      throw new CATMAID.ValueError("Unknown data view: " + options.type);
    }

    return new DataViewType(options);
  };


  // Export data view
  CATMAID.DataView = DataView;


  /**
   * Wrap a DataView instance in a widget.
   */
  var DataViewWidget = function(options) {
    this.widgetID = this.registerInstance();
    this.title = "Data view " + this.widgetID;
    this.dataview = new ProjectListDataView({
       id: null,
       type: 'legacy_project_list_data_view',
       header: false,
       message: false,
    });
  };

  $.extend(DataViewWidget.prototype, new InstanceRegistry());

  DataViewWidget.prototype.getName = function() {
    return this.title;
  };

  DataViewWidget.prototype.destroy = function() {
    this.unregisterInstance();
  };

  /**
   * Allow data views to be used as widgets
   */
  DataViewWidget.prototype.getWidgetConfiguration = function() {
    return {
      createContent: function(content) {
        var wrapper = document.createElement('div');
        wrapper.classList.add('data-view');
        content.appendChild(wrapper);
        this.dataview.createContent(wrapper);

      },
      init: function() {
         this.dataview.refresh();
      }
    };
  };

  CATMAID.DataViewWidget = DataViewWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: "project-list",
    creator: DataViewWidget
  });

  /**
   * Load a data-view from the back-end and display it.
   */
  var BackendDataView = function(options) {
    // Call super constructor
    DataView.call(this, options);
  };


  BackendDataView.prototype = Object.create(DataView.prototype);
  BackendDataView.prototype.constructor = DataView;

  BackendDataView.prototype.createContent = function(content) {
    var container = content.appendChild(document.createElement('div'));
    return CATMAID.DataViews.get(this.id)
      .then(function(text) {
        container.innerHTML = text;
      })
      .catch(CATMAID.handleError);
  };


  var ProjectListDataView = function(options) {
    options = CATMAID.tools.updateFromDefaults(options, ProjectListDataView.defaultOptions);

    // Call super constructor
    DataView.call(this, options);

    this.filter = options.filter;
    this.cacheLoadingTimeout = null;
  };

  ProjectListDataView.prototype = Object.create(DataView.prototype);
  ProjectListDataView.prototype.constructor = DataView;

  ProjectListDataView.defaultOptions = {
    filter: false
  };

  ProjectListDataView.prototype.createContent = function(content) {
    DataView.prototype.createContent.call(this, content);

    var header = document.createElement('div');
    header.setAttribute('data-role', 'header');

    var h = document.createElement('h2');
    h.setAttribute('data-role', 'project-header');
    h.appendChild(document.createTextNode('Projects'));
    header.appendChild(h);

    var hp = document.createElement('p');
    header.appendChild(hp);

    var searchForm = document.createElement('form');
    searchForm.setAttribute('data-role', 'filter');
    if (!this.filter) {
      searchForm.style.display = 'none';
    }
    hp.appendChild(searchForm);

    var searchInput = document.createElement('input');
    searchInput.setAttribute('type', 'text');
    searchInput.onkeyup = this.refreshDelayed.bind(this);
    searchForm.appendChild(searchInput);

    var searchIndicator = document.createElement('span');
    searchIndicator.setAttribute('data-role', 'filter-indicator');
    searchForm.appendChild(searchIndicator);

    var projectDisplay = document.createElement('dl');
    projectDisplay.setAttribute('data-role', 'project-display');
    projectDisplay.appendChild(document.createElement('dt'));
    projectDisplay.appendChild(document.createElement('dd'));
    header.appendChild(projectDisplay);

    var message = document.createElement('p');
    message.setAttribute('data-role', 'filter-message');
    header.appendChild(message);

    content.appendChild(header);

    var projectList = document.createElement('div');
    projectList.setAttribute('data-role', 'project-list');
    content.appendChild(projectList);

    return Promise.resolve();
  };

  /**
   * Update the displayed project list based on the cache entries. This can
   * involve a filter in the text box "project_filter_text".
   */
  ProjectListDataView.prototype.refresh = function(content) {
    DataView.prototype.refresh.call(this, content);

    var matchingProjects = 0,
        searchString = $('[data-role=filter] input', this.container).val(),
        display,
        re = new RegExp(searchString, "i"),
        title,
        toappend,
        i, j, k,
        dt, dd, a, ddc,
        p,
        catalogueElement, catalogueElementLink,
        pp = this.container.querySelector("[data-role=project-display]");
    // remove all the projects
    while (pp.firstChild) pp.removeChild(pp.firstChild);
    $('[data-role=filter-message]', this.container).text('');
    // add new projects according to filter
    var projects = CATMAID.client.projects;
    for (i in projects) {
      p = projects[i];
      display = false;
      toappend = [];

      dt = document.createElement("dt");

      title = p.title;
      if (re.test(title)) {
        display = true;
      }
      dt.appendChild(document.createTextNode(p.title));

      this.container.querySelector("[data-role=project-header]").style.display = "block";
      this.container.querySelector("[data-role=filter]").style.display = "block";
      toappend.push(dt);

      // add a link for every action (e.g. a stack link)
      for (j in p.action) {
        var sid_title = p.action[j].title;
        var sid_action = p.action[j].action;
        var sid_note = p.action[j].comment;
        dd = document.createElement("dd");
        a = document.createElement("a");
        ddc = document.createElement("dd");
        a.href = sid_action;
        if (re.test(sid_title)) {
          display = true;
        }
        a.appendChild(document.createTextNode(sid_title));
        dd.appendChild(a);
        toappend.push(dd);
        if (sid_note) {
          ddc = document.createElement("dd");
          ddc.innerHTML = sid_note;
          toappend.push(ddc);
        }
      }
      // optionally, add a neuron catalogue link
      if (p.catalogue) {
        catalogueElement = document.createElement('dd');
        catalogueElementLink = document.createElement('a');
        catalogueElementLink.href = django_url + p.pid;
        catalogueElementLink.appendChild(document.createTextNode('Browse the Neuron Catalogue'));
        catalogueElement.appendChild(catalogueElementLink);
        toappend.push(catalogueElement);
      }
      if (display) {
        ++ matchingProjects;
        for (k = 0; k < toappend.length; ++k) {
          pp.appendChild(toappend[k]);
        }
      }
    }
    if (projects.length === 0) {
      $('[data-role=filter-message]', this.container).text('Could not find any CATMAID projects');
    } else if (matchingProjects === 0) {
      $('[data-role=filter-message]', this.container).text('No projects matched "' + searchString + '"');
    }
  };

  /**
   * Do a delayed call to refresh() and indicate the progress.
   */
  ProjectListDataView.prototype.refreshDelayed = function(content) {
    // the filter form can already be displayed
    $('[data-role=filter]', this.container).show();
    // indicate active filtered loading of the projects
    var indicator = this.container.querySelector("[data-role=filter-indicator]");
    window.setTimeout( function() { indicator.className = "filtering"; }, 1);

    // clear timeout if already present and create a new one
    if (this.cacheLoadingTimeout !== null)
    {
      clearTimeout(this.cacheLoadingTimeout);
    }

    var self = this;
    this.cacheLoadingTimeout = window.setTimeout(
      function() {
        self.refresh();
        // indicate finish of filtered loading of the projects
        indicator.className = "";
      }, 500);
  };

  /**
   * A map of all available data views from their type.
   */
  DataView.dataviewTypes = {
    'empty': DataView,
    'legacy_project_list_data_view': ProjectListDataView,
    'project_list_data_view': BackendDataView,
    'project_table_data_view': BackendDataView,
    'dynamic_projects_list_data_view': BackendDataView,
    'project_tags_data_view': BackendDataView
  };

})(CATMAID);
