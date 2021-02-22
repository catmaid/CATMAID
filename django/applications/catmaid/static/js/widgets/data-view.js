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
    this.type = options.type;

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
      logo.title = 'Skelly, the CATMAID mascot';
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

    this.project_filter = options.config.project_filter;
    this.stack_filter = options.config.stack_filter;
    this.projectFilterTerm = options.config.projectFilterTerm;
    this.stackFilterTerm = options.config.stackFilterTerm;
    this.with_stacks = options.config.with_stacks;
    this.with_stackgroups = options.config.with_stackgroups;
    this.show_empty_projects = options.config.show_empty_projects;
    this.sample_images = CATMAID.tools.getDefined(options.config.sample_images, false);
    this.sample_mirror_index = CATMAID.tools.getDefined(options.config.sample_mirror_index, 0);
    this.sample_slice = CATMAID.tools.getDefined(options.config.sample_slice, 0);
    this.only_favorite = CATMAID.tools.getDefined(options.config.only_favorite, false);
    this.initial_tool = CATMAID.tools.getDefined(options.config.initial_tool);
    this.initial_zoom = CATMAID.tools.getDefined(options.config.initial_zoom);
    this.initial_location = CATMAID.tools.getDefined(options.config.initial_location);
    this.initial_layout = CATMAID.tools.getDefined(options.config.initial_layout);
    this.projectFilterPlaceholder = CATMAID.tools.getDefined(options.config.project_filter_placeholder);
    this.stackFilterPlaceholder = CATMAID.tools.getDefined(options.config.stack_filter_placeholder);

    this.cacheLoadingTimeout = null;
  };

  ProjectListDataView.prototype = Object.create(DataView.prototype);
  ProjectListDataView.prototype.constructor = DataView;

  ProjectListDataView.defaultOptions = {
    project_filter: true,
    stack_filter: true,
    projectFilterTerm: "",
    stackFilterTerm: "",
    with_stacks: true,
    with_stackgroups: true,
    show_empty_projects: false,
    sample_images: false,
    sample_mirror_index: 0,
    sample_slice: 0,
    only_favorite: false,
    project_filter_placeholder: 'Project filter',
    stack_filter_placeholder: 'Stack filter',
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
    if (!this.project_filter && !this.stack_filter) {
      searchForm.style.display = 'none';
    }
    hp.appendChild(searchForm);

    if (this.project_filter) {
      var projectSearchInput = document.createElement('input');
      projectSearchInput.setAttribute('type', 'text');
      projectSearchInput.setAttribute('data-role', 'project-filter');
      projectSearchInput.setAttribute('placeholder', this.projectFilterPlaceholder);
      if (this.projectFilterTerm.length > 0) {
        projectSearchInput.value = this.projectFilterTerm;
      }
      projectSearchInput.onkeyup = this.refreshDelayed.bind(this);
      searchForm.appendChild(projectSearchInput);
    }

    if (this.stack_filter) {
      var stackSearchInput = document.createElement('input');
      stackSearchInput.setAttribute('type', 'text');
      stackSearchInput.setAttribute('data-role', 'stack-filter');
      stackSearchInput.setAttribute('placeholder', this.stackFilterPlaceholder);
      stackSearchInput.style.marginLeft = '0.5em';
      if (this.stackFilterTerm.length > 0) {
        stackSearchInput.value = this.stackFilterTerm;
      }
      stackSearchInput.onkeyup = this.refreshDelayed.bind(this);
      searchForm.appendChild(stackSearchInput);
    }

    if (this.project_filter || this.stack_filter) {
      var searchIndicator = document.createElement('span');
      searchIndicator.setAttribute('data-role', 'filter-indicator');
      searchForm.appendChild(searchIndicator);
    }

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

  function createProjectMemberEntry(member, target, type, pid, sid) {
    var dd = document.createElement("dd");
    var a = document.createElement("a");
    var ddc = document.createElement("dd");
    a.href = "#";
    a.dataset.type = type;
    a.dataset.pid = pid;
    a.dataset.sid = sid;
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

    this.projectFilterTerm = $('input[data-role=project-filter]', this.container).val() || '';
    var projectRegEx = this.projectFilterTerm.length > 0 ? new RegExp(this.projectFilterTerm, "i") : null;

    this.stackFilterTerm = $('input[data-role=stack-filter]', this.container).val() || '';
    var stackRegEx = this.stackFilterTerm.length > 0 ? new RegExp(this.stackFilterTerm, "i") : null;

    var matchingProjects = 0,
        title,
        toappend,
        dt,
        p,
        pp = this.container.querySelector("[data-role=project-display]"),
        container = pp.parentElement;

    // Detach container from parent to have quicker updates
    container.removeChild(pp);

    // A one-time error handler for the image previews.
    let showErrorImage = function() {
      this.onerror = null;
      this.src = CATMAID.makeStaticURL('/images/overview-placeholder.png');
    };

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

      if (p.stacks.length === 0 && !this.show_empty_projects) {
        continue;
      }

      if (this.only_favorite && !p.favorite) {
        continue;
      }

      let rowSpan = pp.appendChild(document.createElement('span'));
      rowSpan.classList.add('project-member-entry');

      if (this.sample_images) {
        rowSpan.classList.add('image-entry');
        let imgSpan = rowSpan.appendChild(document.createElement('span'));
        if (p.stacks && p.stacks.length > 0) {
          let stack = p.stacks[0];
          let mirror = stack.mirrors[this.sample_mirror_index];
          if (mirror) {
            let tileSource = CATMAID.TileSources.get(mirror.id,
              mirror.tile_source_type, mirror.image_base, mirror.file_extension,
              mirror.tile_width, mirror.tile_height);
            if (tileSource instanceof CATMAID.AbstractTileSourceWithOverview) {
              let link = imgSpan.appendChild(document.createElement('a'));
              link.href = '#';
              link.dataset.type = 'stack';
              link.dataset.pid = p.id;
              link.dataset.sid = stack.id;
              // Use overview image
              let img = link.appendChild(document.createElement('img'));
              img.onerror = showErrorImage;
              try {
                let sampleSlice = this.sample_slice;
                if (sampleSlice === 'center') {
                  sampleSlice = Math.floor(stack.dimensions[2] * 0.5);
                } else if (sampleSlice === 'last') {
                  sampleSlice = Math.max(0, stack.dimensions[2] - 1);
                } else if (sampleSlice === 'first') {
                  sampleSlice = 0;
                }
                img.src = tileSource.getOverviewURL(null, [sampleSlice]);
              } catch (error) {
                // Show placeholder if overview is unavailable
                img.src = CATMAID.makeStaticURL('/images/overview-placeholder.png');
              }
            }
          }
        }
      }

      let span = rowSpan.appendChild(document.createElement('span'));
      span.classList.add('stack-entry');

      dt = span.appendChild(document.createElement("dt"));
      dt.appendChild(document.createTextNode(p.title));

      // add a link for each stack group
      var matchingStackGroups = 0;
      if (this.with_stackgroups) {
        for (var i=0; i<p.stackgroups.length; ++i) {
          var sg = p.stackgroups[i];
          if (stackRegEx && !stackRegEx.test(sg.title)) {
            continue;
          }
          createProjectMemberEntry(sg, span, 'stackgroup', p.id, sg.id);
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
          createProjectMemberEntry(s, span, 'stack', p.id, s.id);
          ++matchingStacks;
        }
      }

      ++matchingProjects;
    }

    let tools = {
      navigator: CATMAID.Navigator,
      tracingtool: CATMAID.TracingTool,
    };

    let initView = () => {
      return Promise.resolve()
        .then(() => {
          if (this.initial_location) {
            return project.moveTo(this.initial_location[2],
              this.initial_location[1], this.initial_location[0],
              this.initial_zoom);
          } else if (this.initial_zoom !== undefined) {
            return project.moveTo(project.coordinates.z, project.coordinates.y,
              project.coordinates.x, this.initial_zoom);
          }
        })
        .then(() => {
          if (this.initial_tool && tools[this.initial_tool]) {
            return project.setTool(new tools[this.initial_tool]());
          }
        })
        .then(() => {
          if (this.initial_layout) {
            let layout = new CATMAID.Layout(this.initial_layout);
            if (!CATMAID.switchToLayout(layout, true)) {
              CATMAID.warn(`Layout ${this.initial_layout} could not be loaded`);
            }
          }
        });
    };

    $(pp).on('click', 'a[data-type=stack]', e => {
      let pid = parseInt(e.currentTarget.dataset.pid, 10);
      let sid = parseInt(e.currentTarget.dataset.sid, 10);
      CATMAID.openProjectStack(pid, sid, false, undefined, true, true)
        .then(initView)
        .catch(CATMAID.handleError);
    });

    $(pp).on('click', 'a[data-type=stackgroup]', e => {
      let pid = parseInt(e.currentTarget.dataset.pid, 10);
      let sid = parseInt(e.currentTarget.dataset.sid, 10);
      CATMAID.openStackGroup(pid, sid, true)
        .then(initView)
        .catch(CATMAID.handleError);
    });

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

  let ResourceSpaceDataView = class ResourceSpaceDataView extends ProjectListDataView {
    constructor(options) {
      if (!options.config.message) {
        options.config.message = 'View one of these public projects, or log in to work in your own Space.';
      }
      if (!options.config.project_filter_placeholder) {
        options.config.project_filter_placeholder = 'Filter by name';
      }
      if (options.config.project_filter === undefined) {
        options.config.project_filter = true;
      }
      if (options.config.stack_filter === undefined) {
        options.config.stack_filter = false;
      }
      super(options);
    }
  };


  // Export data view
  CATMAID.ProjectListDataView = ProjectListDataView;
  CATMAID.ResourceSpaceDataView = ResourceSpaceDataView;


  /**
   * A map of all available data views from their type.
   */
  DataView.dataviewTypes = {
    'empty': DataView,
    'simple_project_list_data_view': ProjectListDataView,
    'spaces_resources': ResourceSpaceDataView,
    'project_list_data_view': BackendDataView,
    'project_table_data_view': BackendDataView,
    'dynamic_projects_list_data_view': BackendDataView,
    'project_tags_data_view': BackendDataView
  };

})(CATMAID);
