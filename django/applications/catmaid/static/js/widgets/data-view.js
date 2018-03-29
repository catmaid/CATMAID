/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * A minimal data view which is only able to show a welcome message and a
   * general header.
   */
  var DataView = function(options) {
    options.config = CATMAID.tools.updateFromDefaults(options.config,
        DataView.defaultOptions);

    this.id = options.id;
    this.type = options.code_type;

    this.container = document.createElement('div');

    this.header = options.config.header;
    this.message = options.config.message;
    this.classList = options.config.classList;
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

  let nonZeroDigits = new Set([1,2,3,4,5,6,7,8,9]);

  DataView.prototype.handleKeyPress = function(e) {
    let projects = CATMAID.client.projects;
    let asNumber = parseInt(e.key);
    if (nonZeroDigits.has(asNumber)) {
      let stackGroupAnchors = $('a[data-type=stackgroup]');
      if (asNumber > 0 && asNumber <= stackGroupAnchors.length) {
        let a = stackGroupAnchors[asNumber - 1];
        a.click();
        // Open stack group
        CATMAID.msg("Success", "Opening stack group \"" + $(a).text() + "\"");
        return true;
      }
      let stackAnchors = $('a[data-type=stack]');
      if (asNumber > 0 && asNumber <= stackAnchors.length) {
        let a = stackAnchors[asNumber - 1];
        a.click();
        // Open stack
        CATMAID.msg("Success", "Opening stack \"" + $(a).text() + "\"");
        return true;
      }
    }
    return false;
  };


  // Export data view
  CATMAID.DataView = DataView;


  /**
   * Wrap a DataView instance in a widget.
   */
  var DataViewWidget = function(options) {
    this.widgetID = this.registerInstance();
    this.title = "Project list " + this.widgetID;
    this.dataview = new ProjectListDataView({
       id: null,
       type: 'simple_project_list_data_view',
       config: {
         header: false,
         message: false
       }
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
    name: "Project list data view",
    description: "List available projects and stacks",
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
    options.config = CATMAID.tools.updateFromDefaults(options.config,
        ProjectListDataView.defaultOptions);

    // Call super constructor
    DataView.call(this, options);

    this.filter = options.config.filter;
    this.projectFilterTerm = options.config.projectFilterTerm;
    this.stackFilterTerm = options.config.stackFilterTerm;
    this.with_stacks = options.config.with_stacks;
    this.with_stackgroups = options.config.with_stackgroups;
    this.cacheLoadingTimeout = null;
  };

  ProjectListDataView.prototype = Object.create(DataView.prototype);
  ProjectListDataView.prototype.constructor = DataView;

  ProjectListDataView.defaultOptions = {
    filter: true,
    projectFilterTerm: "",
    stackFilterTerm: "",
    with_stacks: true,
    with_stackgroups: true
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

    var projectSearchInput = document.createElement('input');
    projectSearchInput.setAttribute('type', 'text');
    projectSearchInput.setAttribute('data-role', 'project-filter');
    projectSearchInput.setAttribute('placeholder', 'Project filter');
    if (this.projectFilterTerm.length > 0) {
      projectSearchInput.value = this.projectFilterTerm;
    }
    projectSearchInput.onkeyup = this.refreshDelayed.bind(this);
    searchForm.appendChild(projectSearchInput);

    var stackSearchInput = document.createElement('input');
    stackSearchInput.setAttribute('type', 'text');
    stackSearchInput.setAttribute('data-role', 'stack-filter');
    stackSearchInput.setAttribute('placeholder', 'Stack filter');
    stackSearchInput.style.marginLeft = '0.5em';
    if (this.stackFilterTerm.length > 0) {
      stackSearchInput.value = this.stackFilterTerm;
    }
    stackSearchInput.onkeyup = this.refreshDelayed.bind(this);
    searchForm.appendChild(stackSearchInput);

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

  function createProjectMemberEntry(member, target, type, handler) {
    var dd = document.createElement("dd");
    var a = document.createElement("a");
    var ddc = document.createElement("dd");
    a.href = "#";
    a.dataset.type = type;
    a.onclick = handler;
    a.appendChild(document.createTextNode(member.title));
    dd.appendChild(a);
    target.appendChild(dd);
    if (member.comment) {
      ddc = document.createElement("dd");
      ddc.innerHTML = member.comment;
      target.appendChild(ddc);
    }
  }

  /**
   * Update the displayed project list based on the cache entries. This can
   * involve a filter in the text box "project_filter_text".
   */
  ProjectListDataView.prototype.refresh = function(content) {
    DataView.prototype.refresh.call(this, content);

    this.projectFilterTerm = $('input[data-role=project-filter]', this.container).val();
    var projectRegEx = this.projectFilterTerm.length > 0 ? new RegExp(this.projectFilterTerm, "i") : null;

    this.stackFilterTerm = $('input[data-role=stack-filter]', this.container).val();
    var stackRegEx = this.stackFilterTerm.length > 0 ? new RegExp(this.stackFilterTerm, "i") : null;

    var matchingProjects = 0,
        title,
        toappend,
        dt, dd, a, ddc,
        p,
        catalogueElement, catalogueElementLink,
        pp = this.container.querySelector("[data-role=project-display]"),
        container = pp.parentElement;

    // Detach container from parent to have quicker updates
    container.removeChild(pp);

    // remove all the projects
    while (pp.firstChild) pp.removeChild(pp.firstChild);
    $('[data-role=filter-message]', this.container).text('');
    // add new projects according to filter
    var projects = CATMAID.client.projects;
    for (var projectId in projects) {
      p = projects[projectId];
      toappend = [];

      title = p.title;
      if (projectRegEx && !projectRegEx.test(title)) {
        continue;
      }

      dt = document.createElement("dt");
      dt.appendChild(document.createTextNode(p.title));
      pp.appendChild(dt);

      // add a link for each stack group
      var matchingStackGroups = 0;
      if (this.with_stackgroups) {
        for (var i=0; i<p.stackgroups.length; ++i) {
          var sg = p.stackgroups[i];
          if (stackRegEx && !stackRegEx.test(sg.title)) {
            continue;
          }
          createProjectMemberEntry(sg, pp, 'stackgroup',
              CATMAID.openStackGroup.bind(window, p.id, sg.id, true));
          ++matchingStackGroups;
        }
      }

      // add a link for every action (e.g. a stack link)
      var matchingStacks = 0;
      if (this.with_stacks) {
        for (var i=0; i<p.stacks.length; ++i) {
          var s = p.stacks[i];
          if (stackRegEx && !stackRegEx.test(s.title)) {
            continue;
          }
          createProjectMemberEntry(s, pp, 'stack',
              CATMAID.openProjectStack.bind(window, p.id, s.id, false, undefined, true, true));
          ++matchingStacks;
        }
      }

      ++matchingProjects;
    }

    container.appendChild(pp);

    if (projects.length === 0) {
      $('[data-role=filter-message]', this.container).text('Could not find any CATMAID projects');
    } else if (matchingProjects === 0) {
      $('[data-role=filter-message]', this.container).text('No projects matched "' + this.projectFilterTerm + '"');
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

  // Export data view
  CATMAID.ProjectListDataView = ProjectListDataView;


  /**
   * A map of all available data views from their type.
   */
  DataView.dataviewTypes = {
    'empty': DataView,
    'simple_project_list_data_view': ProjectListDataView,
    'project_list_data_view': BackendDataView,
    'project_table_data_view': BackendDataView,
    'dynamic_projects_list_data_view': BackendDataView,
    'project_tags_data_view': BackendDataView
  };

})(CATMAID);
