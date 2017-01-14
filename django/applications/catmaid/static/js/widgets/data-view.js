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

    $('h1', this.container).attr('title',
        'Version: ' + CATMAID.CLIENT_VERSION);

    $('p', this.container).text(this.message);
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

  // Register widget with CATMAID
  CATMAID.registerWidget({
    key: "dataiview",
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

    var container = document.createElement('div');
    container.setAttribute('id', 'project_list');

    var h = document.createElement('h2');
    h.setAttribute('id', 'projects_h');
    h.appendChild(document.createTextNode('Projects'));
    container.appendChild(h);

    var searchForm = document.createElement('form');
    searchForm.setAttribute('id', 'project_filter_form');
    if (!this.filter) {
      searchForm.style.display = 'none';
    }
    container.appendChild(searchForm);

    var searchInput = document.createElement('input');
    searchInput.setAttribute('id', 'project_filter_text');
    searchInput.setAttribute('type', 'text');
    searchInput.onkeyup = this.refreshDelayed.bind(this);
    searchForm.appendChild(searchInput);

    var searchIndicator = document.createElement('span');
    searchIndicator.setAttribute('id', 'project_filter_indicator');
    searchForm.appendChild(searchIndicator);

    var projectsList = document.createElement('dl');
    projectsList.setAttribute('id', 'projects_dl');
    projectsList.appendChild(document.createElement('dt'));
    projectsList.appendChild(document.createElement('dd'));
    container.appendChild(projectsList);

    var message = document.createElement('p');
    message.setAttribute('id', 'project_list_message');
    container.appendChild(message);

    content.appendChild(container);

    this.refresh();

    return Promise.resolve();
  };

  /**
   * Update the displayed project list based on the cache entries. This can
   * involve a filter in the text box "project_filter_text".
   */
  ProjectListDataView.prototype.refresh = function(content) {
    DataView.prototype.refresh.call(this, content);

    var matchingProjects = 0,
        searchString = $('#project_filter_text').val(),
        display,
        re = new RegExp(searchString, "i"),
        title,
        toappend,
        i, j, k,
        dt, dd, a, ddc,
        p,
        catalogueElement, catalogueElementLink,
        pp = document.getElementById("projects_dl");
    // remove all the projects
    while (pp.firstChild) pp.removeChild(pp.firstChild);
    $('#project_list_message').text('');
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

      document.getElementById("projects_h").style.display = "block";
      document.getElementById("project_filter_form").style.display = "block";
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
      $('#project_list_message').text('Could not find any CATMAID projects');
    } else if (matchingProjects === 0) {
      $('#project_list_message').text('No projects matched "' + searchString + '"');
    }
  };

  /**
   * Do a delayed call to refresh() and indicate the progress.
   */
  ProjectListDataView.prototype.refreshDelayed = function(content) {
    // the filter form can already be displayed
    $('#project_filter_form').show();
    // indicate active filtered loading of the projects
    var indicator = document.getElementById("project_filter_indicator");
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
