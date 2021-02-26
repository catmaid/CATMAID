(function(CATMAID) {

  "use strict";

  /**
   * Compute statistics on pairs of neurons, e.g. to find homologues.
   */
  var ProjectManagementWidget = function(options)
  {
    this.widgetID = this.registerInstance();
    this.idPrefix = `project-management-widget${this.widgetID}-`;

    // The current edit mode
    this.mode = 'project-access';
    this.modes = ['project-access', 'properties', 'tokens', 'delete'];

    this.neuronNameService = CATMAID.NeuronNameService.getInstance();
  };


  ProjectManagementWidget.prototype = {};
  ProjectManagementWidget.prototype.constructor = ProjectManagementWidget;
  $.extend(ProjectManagementWidget.prototype, new InstanceRegistry());

  ProjectManagementWidget.prototype.getName = function() {
    return `Project management ${this.widgetID}: ${project.title}`;
  };

  ProjectManagementWidget.prototype.destroy = function() {
    this.unregisterInstance();
    this.neuronNameService.unregister(this);
  };

  ProjectManagementWidget.prototype.getWidgetConfiguration = function() {
    return {
      controlsID: this.idPrefix + 'controls',
      createControls: function(controls) {
        var self = this;
        var tabNames = this.modes.map(m => ProjectManagementWidget.MODES[m].title);
        var tabs = CATMAID.DOM.addTabGroup(controls, '-project-management', tabNames);
        this.modes.forEach((mode, i) => {
          var mode = ProjectManagementWidget.MODES[mode];
          var tab = tabs[mode.title];
          CATMAID.DOM.appendToTab(tab, mode.createControls(this));
          tab.dataset.index = i;
        });
        this.controls = controls;
        this.tabControls = $(controls).tabs({
          active: this.modes.indexOf(this.mode),
          activate: function(event, ui) {
            var oldStepIndex = parseInt(ui.oldPanel.attr('data-index'), 10);
            var newStepIndex = parseInt(ui.newPanel.attr('data-index'), 10);

            var tabs = $(self.tabControls);
            var activeIndex = tabs.tabs('option', 'active');
            if (activeIndex !== self.modes.indexOf(self.mode)) {
              if (!self.setMode(self.modes[activeIndex])) {
                // Return to old tab if selection was unsuccessful
                if (oldStepIndex !== newStepIndex) {
                  $(event.target).tabs('option', 'active', oldStepIndex);
                }
                self.update();
              }
            }
          }
        });
      },
      contentID: this.idPrefix + 'content',
      createContent: function(content) {
        this.content = content;
      },
      init: function() {
        this.updateEnvironment()
          .then(() => this.update());
      },
      helpPath: 'project-management.html',
    };
  };

  ProjectManagementWidget.prototype.refresh = function() {
    this.update();
  };

  ProjectManagementWidget.prototype.updateEnvironment = function() {
    return Promise.all([
      CATMAID.annotations.update(),
    ]);
  };

  ProjectManagementWidget.prototype.update = function() {
    // Clear content
    while (this.content.lastChild) {
      this.content.removeChild(this.content.lastChild);
    }
    var tabs = $(this.tabControls);
    var activeIndex = tabs.tabs('option', 'active');
    var widgetIndex = this.modes.indexOf(this.mode);
    if (activeIndex !== widgetIndex) {
      tabs.tabs('option', 'active', widgetIndex);
    }

    // Update actual content
    let mode = ProjectManagementWidget.MODES[this.mode];
    mode.createContent(this.content, this);
  };

  ProjectManagementWidget.prototype.setMode = function(mode) {
    var index = this.modes.indexOf(mode);
    if (index === -1) {
      throw new CATMAID.ValueError(`Unknown Project Management Widget mode: ${mode}`);
    }
    this.mode = mode;
    this.update();
    return true;
  };

  ProjectManagementWidget.MODES = {
    'project-access': {
      title: 'Project access',
      createControls: function(widget) {
        let infoPanel = document.createElement('p');
        infoPanel.appendChild(document.createTextNode(' Set user and group permissions for this project'));

        return [{
          type: 'button',
          label: 'Refresh',
          onclick: e => {
            widget.refresh();
          },
        }, {
          type: 'child',
          element: infoPanel,
        }];
      },
      createContent: function(content, widget) {
        if (!CATMAID.hasPermission(project.id, 'can_administer')) {
          content.appendChild(document.createTextNode('No administration permissions'));
          return;
        }

        let msg = content.appendChild(document.createElement('p'));
        msg.classList.add('info-text');
        msg.appendChild(document.createTextNode('Project access permissions allow you to configure which user or which group of users can among other things see or edit the current project (or user space). The help page has more information.'));

        let userHeader = content.appendChild(document.createElement('h1'));
        userHeader.style.clear = 'both';
        userHeader.appendChild(document.createTextNode(`User permissions for project ${project.title}`));

        // Show table with current groups and sub groups.
        let permissionTable = content.appendChild(document.createElement('table'));
        permissionTable.style.width = '100%';
        permissionTable.appendChild(document.createElement('thead'));
        permissionTable.appendChild(document.createElement('tbody'));

        let permissionsDataTable = $(permissionTable).DataTable({
          dom: "lfrtip",
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          paging: true,
          order: [[1, 'asc']],
          ajax: (data, callback, settings) => {
            CATMAID.Project.getUserPermissions()
              .then(permissions => {
                let data = Object.keys(permissions).map(userId => {
                  let userData = permissions[userId];
                  let userPerms = userData.permissions;
                  let u = CATMAID.User.safe_get(userId);
                  return {
                    'id': u.id,
                    'login': u.login,
                    'full_name': u.fullName,
                    'can_browse': userPerms.indexOf('can_browse') !== -1,
                    'can_annotate': userPerms.indexOf('can_annotate') !== -1,
                    'can_administer': userPerms.indexOf('can_administer') !== -1,
                    'can_import': userPerms.indexOf('can_import') !== -1,
                    'can_queue_compute_task': userPerms.indexOf('can_queue_compute_task') !== -1,
                    'can_annotate_with_token': userPerms.indexOf('can_annotate_with_token') !== -1,
                    'can_fork': userPerms.indexOf('can_fork') !== -1,
                  };
                });

                callback({
                  'draw': data.draw,
                  'data': data,
                });
              })
              .catch(CATMAID.handleError);
          },
          columns: [{
            data: 'id',
            title: 'User ID',
          }, {
            title: 'User name',
            render: function(data, type, row, meta) {
              return `${row.full_name.length > 0 ? row.full_name : 'Unknown'} (${row.login})`;
            },
          }, {
            data: 'can_browse',
            title: 'can browse (read)',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_browse" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_annotate',
            title: 'can annotate (write)',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_annotate" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_administer',
            title: 'can administer',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_administer" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_import',
            title: 'can import',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_import" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_queue_compute_task',
            title: 'can queue compute taks',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_queue_compute_task" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_annotate_with_token',
            title: 'can write through API',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_annotate_with_token" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_fork',
            title: 'can fork',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_fork" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }],
        }).on('click', 'input[data-role=change-perm]', e => {
          let perm = e.target.dataset.perm;
          let data = permissionsDataTable.row($(e.target).parents('tr')).data();
          let perms = {};
          perms[perm] = e.target.checked;
          CATMAID.Project.updateUserPermission(project.id, data.id, perms)
            .then(() => {
              CATMAID.msg("Success", `Updated ${perm} for user ${data.login}`);
            })
            .catch(CATMAID.handleError);
        });

        // Show table with extra groups
        let groupHeader = content.appendChild(document.createElement('h1'));
        groupHeader.style.clear = 'both';
        groupHeader.appendChild(document.createTextNode(`Group permissions for project ${project.title}`));

        let groupTable = content.appendChild(document.createElement('table'));
        groupTable.style.width = '100%';
        groupTable.appendChild(document.createElement('thead'));
        groupTable.appendChild(document.createElement('tbody'));

        let groupDataTable = $(groupTable).DataTable({
          dom: "lfrtip",
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          paging: true,
          order: [[0, 0]],
          ajax: (data, callback, settings) => {
            CATMAID.Project.getGroupPermissions()
              .then(permissions => {
                let defaultData = {'permissions': []};
                return CATMAID.Group.list()
                  .then(groups => {
                    let data = groups.map(g => {
                      let groupData = permissions[g.id] || defaultData;
                      let groupPerms = groupData.permissions;
                      return {
                        'id': g.id,
                        'group_name': g.name,
                        'can_browse': groupPerms.indexOf('can_browse') !== -1,
                        'can_annotate': groupPerms.indexOf('can_annotate') !== -1,
                        'can_administer': groupPerms.indexOf('can_administer') !== -1,
                        'can_import': groupPerms.indexOf('can_import') !== -1,
                        'can_queue_compute_task': groupPerms.indexOf('can_queue_compute_task') !== -1,
                        'can_annotate_with_token': groupPerms.indexOf('can_annotate_with_token') !== -1,
                        'can_fork': groupPerms.indexOf('can_fork') !== -1,
                      };
                    });

                    callback({
                      'draw': data.draw,
                      'data': data,
                    });
                  });
              })
              .catch(CATMAID.handleError);
          },
          columns: [{
            data: 'id',
            title: 'Group ID',
          }, {
            data: 'group_name',
            title: 'Group name',
          }, {
            title: '# Members',
            render: function(data, type, row, meta) {
              return '-';
            },
          }, {
            data: 'can_browse',
            title: 'can browse (read)',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_browse" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_annotate',
            title: 'can annotate (write)',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_annotate" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_administer',
            title: 'can administer',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_administer" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_import',
            title: 'can import',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_import" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_queue_compute_task',
            title: 'can queue compute taks',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_queue_compute_task" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_annotate_with_token',
            title: 'can write through API',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_annotate_with_token" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }, {
            data: 'can_fork',
            title: 'can fork',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              let state = data ? 1 : 0;
              return `<input type="checkbox" data-role="change-perm" data-perm="can_fork" data-state=${state} ${data ? "checked" : ""} />`;
            },
          }],
        }).on('click', 'input[data-role=change-perm]', e => {
          let perm = e.target.dataset.perm;
          let data = groupDataTable.row($(e.target).parents('tr')).data();
          let perms = {};
          perms[perm] = e.target.checked;
          CATMAID.Project.updateGroupPermission(project.id, data.id, perms)
            .then(() => {
              CATMAID.msg("Success", `Updated ${perm} for group ${data.group_name}`);
            })
            .catch(CATMAID.handleError);
        });
      }
    },
    'properties': {
      title: 'Project properties',
      createControls: function(target) {
        let infoPanel = document.createElement('p');
        infoPanel.appendChild(document.createTextNode('Administrator users can update project properties.'));
        return [{
          type: 'child',
          element: infoPanel,
        }];
      },
      createContent: function(content, widget) {
        if (!CATMAID.hasPermission(project.id, 'can_administer')) {
          content.appendChild(document.createTextNode('No administration permissions for this project'));
          return;
        }

        let infoParagraph1 = content.appendChild(document.createElement('p'));
        infoParagraph1.appendChild(document.createTextNode('This view allows project admins to update different properties of this project. After having made a change that should get saved, click the "Save" button at the bottom of the page.'));

        let projectName = project.title;

        let propertiesPanel = content.appendChild(document.createElement('p'));
        $(propertiesPanel).append(CATMAID.DOM.createInputSetting(
            'Project name',
            projectName,
            'The name of this project',
            function() {
              projectName = this.value;
            }));

        let savePanel = content.appendChild(document.createElement('p'));
        savePanel.classList.add('clear');
        let saveB = savePanel.appendChild(document.createElement('button'));
        saveB.appendChild(document.createTextNode('Save'));

        saveB.addEventListener('click', function() {
          project.updateProperties({
              title: projectName,
            })
            .then(response => {
              CATMAID.msg('Success', `Properties of project "${project.title}" (ID: ${project.id}) updated`);
            })
            .catch(CATMAID.handleError);
        });
      },
    },
    'tokens': {
      title: 'Project tokens',
      createControls: function(target) {
        let infoPanel = document.createElement('p');
        infoPanel.appendChild(document.createTextNode('Administrator users can manage project tokens.'));
        return [{
          type: 'button',
          label: 'Refresh',
          onclick: e => {
            target.refresh();
          }
        }, {
          type: 'button',
          label: 'Add token',
          onclick: e => {
            let approvalNeeded = false;
            let canBrowse = true, canAnnotate = false, canImport = false, canFork = true;
            let confirmationDialog = new CATMAID.OptionsDialog("Create project token", {
              'Cancel': CATMAID.noop,
              'Create token': () => {
                newName = nameField.value.trim();
                let defaultPermissions = [];
                if (canBrowse) defaultPermissions.push('can_browse');
                if (canAnnotate) defaultPermissions.push('can_annotate');
                if (canImport) defaultPermissions.push('can_import');
                if (canFork) defaultPermissions.push('can_fork');
                let projectTokenOptions = {
                  default_permissions: defaultPermissions,
                  needs_approval: approvalNeeded,
                };
                if (nameField.value.trim().length > 0) {
                  projectTokenOptions.name = nameField.value.trim();
                }
                CATMAID.fetch(`${project.id}/project-tokens/`, `POST`, projectTokenOptions)
                  .then(result => {
                    target.refresh();
                  })
                  .catch(CATMAID.handleError);
              },
            });

            let newName = '';
            confirmationDialog.appendMessage("Create a new project token (sharable invitation code), give it optionally a name:");
            var nameField = confirmationDialog.appendField("Name", undefined, newName, false, '(optional)');
            nameField.size = 50;

            confirmationDialog.appendMessage("Choose, whether each user needs to be approved and set default permissions for this token:");

            let optionContainer0 = document.createElement('span');
            optionContainer0.style.display = 'grid';
            optionContainer0.style.gridTemplate = '2em / 18em';

            CATMAID.DOM.appendCheckbox(optionContainer0, 'Require approval of new users',
                'If users add this project token to their profile, they get assigned the default permissions of this token. If this should require the approval of a project admin, enable this.', approvalNeeded,
                e => {
                  approvalNeeded = e.target.checked;
                }, false, 'project-token-approval').querySelector('input');

            confirmationDialog.appendChild(optionContainer0);

            let optionContainer = document.createElement('span');
            optionContainer.style.display = 'grid';
            optionContainer.style.gridTemplate = '3em / 12em 13em 8em 7em';

            CATMAID.DOM.appendCheckbox(optionContainer, 'Can read (browse)',
                'Whether invited users should be able see the project and its data by default.', canBrowse,
                e => {
                  canBrowse = e.target.checked;
                }, false, 'perms-can-browse').querySelector('input');
            CATMAID.DOM.appendCheckbox(optionContainer, 'Can write (annotate)',
                'Whether invited users should be able to write to the project by default', canAnnotate,
                e => {
                  canAnnotate = e.target.checked;
                }, false, 'perms-can-annotate').querySelector('input');
            CATMAID.DOM.appendCheckbox(optionContainer, 'Can import',
                'Whether invited users should be able to import into the project by default', canImport,
                e => {
                  canImport = e.target.checked;
                }, false, 'perms-can-import').querySelector('input');
            CATMAID.DOM.appendCheckbox(optionContainer, 'Can fork',
                'Whether invited users should be able to fork the new space themselves.',
                canFork, e => { canFork = e.target.checked; }, false, 'perms-can-fork').querySelector('input');

            confirmationDialog.appendChild(optionContainer);

            return confirmationDialog.show(500, 'auto');
          }
        }, {
          type: 'child',
          element: infoPanel,
        }];
      },
      createContent: function(content, widget) {
        if (!CATMAID.hasPermission(project.id, 'can_administer')) {
          content.appendChild(document.createTextNode('No administration permissions for this project'));
          return;
        }

        let infoParagraph1 = content.appendChild(document.createElement('p'));
        infoParagraph1.appendChild(document.createTextNode('This view allows project admins to manage project tokens.'));

        let tokenTable = content.appendChild(document.createElement('table'));
        tokenTable.style.width = '100%';
        tokenTable.appendChild(document.createElement('thead'));
        tokenTable.appendChild(document.createElement('tbody'));

        let tokenDataTable = $(tokenTable).DataTable({
          dom: "lfrtip",
          lengthMenu: [CATMAID.pageLengthOptions, CATMAID.pageLengthLabels],
          paging: true,
          order: [[0, 0]],
          ajax: (data, callback, settings) => {
            CATMAID.fetch(`${project.id}/project-tokens/`)
              .then(tokens => {
                callback({
                  'draw': data.draw,
                  'data': tokens,
                });
              })
              .catch(CATMAID.handleError);
          },
          columns: [{
            data: 'id',
            title: 'ID',
            searchable: true,
            orderable: true,
          }, {
            data: 'name',
            title: 'Name',
            searchable: true,
            orderable: true,
          }, {
            data: 'token',
            title: 'Token',
            class: "cm-center",
            searchable: true,
            orderable: true,
          }, {
            data: 'needs_approval',
            title: 'Approval req.',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              return data ? 'Yes' : 'No';
            },
          }, {
            data: 'user',
            title: 'User',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              return CATMAID.User.safe_get(data).login;
            },
          }, {
            data: 'enabled',
            title: 'Enabled',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              return data ? 'Yes' : 'No';
            },
          }, {
            data: 'default_permissions',
            title: 'Default permissions',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data ? data.length : 0;
              }
              return data ? data.join(', ') : '-';
            },
          }, {
            data: 'edition_time',
            title: 'Last edit (UTC)',
            class: "cm-center",
            searchable: true,
            orderable: true,
            render: function(data, type, row, meta) {
              if (type === 'sort') {
                return data;
              }
              var date = new Date(data);
              if (date) {
                return CATMAID.tools.dateToString(date);
              } else {
                return "(parse error)";
              }
            },
          }, {
            render: function(data, type, row, meta) {
              return '<i class="fa fa-copy copy-button"></i>';
            }
          }],
        }).on('click', 'i.copy-button', e => {
          let data = tokenDataTable.row($(e.target).parents('tr')).data();
          CATMAID.tools.copyToClipBoard(data.token);
          CATMAID.msg('Success', 'Copyied project token to clipboard. Use it with care!');
        });
      },
    },
    'delete': {
      title: 'Delete data',
      createControls: function(target) {
        let infoPanel = document.createElement('p');
        infoPanel.appendChild(document.createTextNode('Administrator users with "delete" permission can delete this project.'));
        return [{
          type: 'child',
          element: infoPanel,
        }];
      },
      createContent: function(content, widget) {
        let missingPermissions = 0;
        if (!CATMAID.hasPermission(project.id, 'can_administer')) {
          content.appendChild(document.createTextNode('No administration permissions for this project'));
          ++missingPermissions;
        }
        if (!CATMAID.hasPermission(project.id, 'delete_project')) {
          content.appendChild(document.createTextNode('No deletion permissions for this project'));
          ++missingPermissions;
        }
        if (missingPermissions > 0) {
          return;
        }

        let infoParagraph1 = content.appendChild(document.createElement('p'));
        infoParagraph1.appendChild(document.createTextNode('This view allows project admins to delete the current project. Deciding to delete a project can\'t be undone easily. However, history tracking is enabled by default and restoring a project might be possible in principle with manual work.'));

        let infoParagraph2 = content.appendChild(document.createElement('p'));
        infoParagraph2.appendChild(document.createTextNode('In order to delete a project, check the checkbox below and click the "Delete project" button.'));

        let deletePanel1 = content.appendChild(document.createElement('p'));
        let deleteCbLabel = deletePanel1.appendChild(document.createElement('label'));
        let deleteCb = deleteCbLabel.appendChild(document.createElement('input'));
        deleteCb.type = 'checkbox';
        deleteCbLabel.appendChild(document.createTextNode('I confirm the deletion of all data associated with this project'));
        let deletePanel2 = content.appendChild(document.createElement('p'));
        let deleteB = deletePanel2.appendChild(document.createElement('button'));
        deleteB.appendChild(document.createTextNode('Delete project'));

        deleteB.addEventListener('click', function() {
          if (!deleteCb.checked) {
            CATMAID.warn('Please confirm project deletion');
            return;
          }

          if (!confirm("Do you really want to delete this project and all associated data?")) {
            return;
          }

          let projectTitle = project.title, projectId = project.id;
          CATMAID.Project.delete(project.id)
            .then(response => {
              CATMAID.msg('Success', `Delete project "${projectTitle}" (ID: ${projectId})`);
            }).then(e => {
              return CATMAID.client.load_default_dataview(false);
            })
            .catch(CATMAID.handleError);
        });
      },
    },
    'matching-pairs': {
      title: 'Matching pairs',
      createControls: function(target) {
        let controls = [];

        controls.push({
          type: 'numeric',
          label: 'Batch size',
          title: 'The number skeletons per completeness query. This can be tuned to get more throughput depending on the server setup.',
          value: target.completenessBatchSize,
          length: 4,
          min: 0,
          max: 10,
          step: 1,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.completenessBatchSize = Math.floor(value);
          }
        });

        controls.push({
          type: 'checkbox',
          label: 'Only completed neurons',
          title: 'Only completed neurons will be considered for pair statistics.',
          value: target.useOnlyCompleteSkeletons,
          onchange: e => {
            target.useOnlyCompleteSkeletons = e.target.checked;
          }
        });

        let mainCompletenessSection = document.createElement('span');
        mainCompletenessSection.classList.add('section-header');
        mainCompletenessSection.appendChild(document.createTextNode('Main completeness'));
        mainCompletenessSection.title = 'Completeness properties for all neurons ' +
            'annotated with annotations from the primary annotation grouping in the first tab.';
        controls.push({
          type: 'child',
          element: mainCompletenessSection,
        });

        controls.push({
          type: 'numeric',
          label: 'Max open ends',
          title: 'The percentage of of open ends per neurons to be considered complete.',
          value: target.mainMaxOpenEnds,
          length: 4,
          min: 0,
          max: 1,
          step: 0.01,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.mainMaxOpenEnds = value;
          }
        });

        controls.push({
          type: 'numeric',
          label: 'Min nodes',
          title: 'The minimum number of nodes for a neuron to be considered complete.',
          value: target.mainMinNodes,
          length: 4,
          min: 0,
          step: 50,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.mainMinNodes = value;
          }
        });

        controls.push({
          type: 'numeric',
          label: 'Min cable',
          title: 'The minimum cable length in nm for a neuron to be considered complete.',
          value: target.mainMinCable,
          length: 5,
          min: 0,
          step: 500,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.mainMinCable = value;
          }
        });

        controls.push({
          type: 'checkbox',
          label: 'Ignore fragments',
          title: 'Ignore all neurons that don\'t have a node tagged "soma" or a node tagged "out to nerve"',
          value: target.mainIgnoreFragments,
          onchange: e => {
            target.mainIgnoreFragments = e.target.checked;
          }
        });

        let extraCompletenessSection = document.createElement('span');
        extraCompletenessSection.classList.add('section-header');
        extraCompletenessSection.appendChild(document.createTextNode('Extra completeness'));
        mainCompletenessSection.title = 'Completeness properties for all neurons ' +
            'annotated with annotations from the extra annotation grouping in the first tab.';
        controls.push({
          type: 'child',
          element: extraCompletenessSection,
        });

        controls.push({
          type: 'numeric',
          label: 'Max open ends',
          title: 'The percentage of of open ends per neurons to be considered complete.',
          value: target.extraMaxOpenEnds,
          length: 4,
          min: 0,
          max: 1,
          step: 0.01,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.extraMaxOpenEnds = value;
          }
        });

        controls.push({
          type: 'numeric',
          label: 'Min nodes',
          title: 'The minimum number of nodes for a neuron to be considered complete.',
          value: target.extraMinNodes,
          length: 4,
          min: 0,
          step: 50,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.extraMinNodes = value;
          }
        });

        controls.push({
          type: 'numeric',
          label: 'Min cable',
          title: 'The minimum cable length in nm for a neuron to be considered complete.',
          value: target.extraMinCable,
          length: 5,
          min: 0,
          step: 500,
          onchange: e => {
            let value = Number(e.target.value);
            if (Number.isNaN(value)) return;
            target.extraMinCable = value;
          }
        });

        controls.push({
          type: 'checkbox',
          label: 'Ignore fragments',
          title: 'Ignore all neurons that don\'t have a node tagged "soma" or a node tagged "out to nerve"',
          value: target.extraIgnoreFragments,
          onchange: e => {
            target.extraIgnoreFragments = e.target.checked;
          }
        });

        let pairingSection = document.createElement('span');
        pairingSection.classList.add('section-header');
        pairingSection.appendChild(document.createTextNode('Pairing'));
        mainCompletenessSection.title = 'Pairing properties for all subgroup skeletons.';
        controls.push({
          type: 'child',
          element: pairingSection,
        });

        controls.push({
          type: 'text',
          label: 'Pairing meta-annotation',
          value: target.pairingMetaAnnotation,
          onchange: e => {
            target.pairingMetaAnnotation = e.target.value;
          },
        });

        // Filter complete
        controls.push({
          type: 'button',
          label: 'Match pairs',
          title: 'Find all matching skeleton pairs between active annotation groups',
          onclick: e => {
            target.updateMatchReport()
              .then(() => target.update())
              .catch(CATMAID.handleError);
          },
        });

        return controls;
      },
      createContent: function(content, widget) {
        let currentGroupContainer = CATMAID.DOM.addResultContainer(content,
            "Active groups", true, true, true)[0];
        let matchingPairsContainer = CATMAID.DOM.addResultContainer(content,
            "Matched pairs across sub-groups", false, true, true)[0];
        let ipsiPairsContainer = CATMAID.DOM.addResultContainer(content,
            "Pairs in same sub-group", true, true, true)[0];
        let contraPairsContainer = CATMAID.DOM.addResultContainer(content,
            "Unmatched pairs across sub-groups (having one matched skeleton)", true, true, true)[0];

        // Map subgroup identifier to sets of annotations
        let mainAnnotationMap = CATMAID.SkeletonMatching.extractSubGroupSets(widget.groups);
        let extraAnnotationMap = CATMAID.SkeletonMatching.extractSubGroupSets(widget.extraGroups);
        let subGroupMap = new Map([...mainAnnotationMap]);
        for (let [k,v] of extraAnnotationMap.entries()) {
          let set = subGroupMap.get(k);
          if (!set) {
            set = new Set();
            subGroupMap.set(k, set);
          }
          set.addAll(v);
        }

        let annotationIdSet = new Set();
        for (let annotations of subGroupMap.values()) {
          annotationIdSet = annotationIdSet.union(annotations);
        }
        let annotationIds = Array.from(annotationIdSet);

        let subGroupList = currentGroupContainer.appendChild(document.createElement('p'));
        if (subGroupMap.size === 0) {
          subGroupList.appendChild(document.createTextNode('Could not find any sub-groups'));
        } else {
          subGroupList.style.display = 'grid';
          subGroupList.style.gridGap = '0.5em';
          subGroupList.style.gridTemplateColumns = '10em minmax(10em, min-content) auto';
        }

        if (!widget.pairingMetaAnnotation || widget.pairingMetaAnnotation.length === 0) {
          // TODO: Allow regardless
          CATMAID.msg("Pairing meta annotation", "Please specify a pairing meta annotation");
          return;
        }

        let prepare = [
          // Get skeletons for all annotations. Combining multiple annotations
          // in one entry, results in an OR query
          CATMAID.fetch(project.id + '/annotations/query-targets', 'POST', {
            'annotated_with': [annotationIds.join(',')],
            'annotation_reference': 'id',
            'type': ['neuron'],
            'with_annotations': true,
          }),
          // Get all annotations that are annotated with the pairing meta-annotation.
          CATMAID.fetch(project.id + '/annotations/query-targets', 'POST', {
            'annotated_with': [widget.pairingMetaAnnotation],
            'annotation_reference': 'name',
            'type': ['annotation'],
          }),
        ];

        Promise.all(prepare)
          .then(results => {
            let pairingMetaTargetSet = results[1].entities.reduce((t, e) => {
              t.add(e.id);
              return t;
            }, new Set());

            // Map skeleton IDs to their pairing annotations
            let pairingMetaTargetMap = new Map();

            let annotationMap = results[0].entities.reduce((t, e) => {
              for (let i=0; i<e.annotations.length; ++i) {
                let annotation = e.annotations[i];

                // Collect valid pairing annotations per skeleton.
                if (pairingMetaTargetSet.has(annotation.id)) {
                  for (let j=0; j<e.skeleton_ids.length; ++j) {
                    let skeletonId = e.skeleton_ids[j];
                    if (!pairingMetaTargetMap.has(skeletonId)) {
                      pairingMetaTargetMap.set(skeletonId, new Set());
                    }
                    let targetSet = pairingMetaTargetMap.get(skeletonId);
                    targetSet.add(annotation.id);
                  }
                }

                // Store only annotation mappings from focus annotations.
                if (!annotationIdSet.has(annotation.id)) {
                  continue;
                }

                if (!t.has(annotation.id)) {
                  t.set(annotation.id, new Set());
                }
                let targetSet = t.get(annotation.id);
                for (let j=0; j<e.skeleton_ids.length; ++j) {
                  targetSet.add(e.skeleton_ids[j]);
                }
              }
              return t;
            }, new Map());

            let extraAnnotationIds = Array.from(extraAnnotationMap.values()).reduce((o,e) => {
               o.addAll(e);
               return o;
            }, new Set());

            let mainSkeletonIds = new Set();
            let extraSkeletonIds = new Set();
            for (let [annotationId, skids] of annotationMap.entries()) {
              if (extraAnnotationIds.has(annotationId)) {
                extraSkeletonIds.addAll(skids);
              } else {
                mainSkeletonIds.addAll(skids);
              }
            }

            // Get completeness for both main group and extra group, using their
            // respective configurations.
            let completenessPromises = [];
            if (mainSkeletonIds.size > 0) {
              let workingSet = Array.from(mainSkeletonIds);
              for (let i=0; i<mainSkeletonIds.size; i +=widget.completenessBatchSize) {
                let batch = workingSet.slice(i, Math.min(workingSet.length, i + widget.completenessBatchSize));
                completenessPromises.push(CATMAID.Skeletons.completeness(
                    project.id, batch, widget.mainMaxOpenEnds,
                    widget.mainMinNodes, widget.mainMinCable,
                    widget.mainIgnoreFragments, true));
                }
            }
            if (extraSkeletonIds.size > 0) {
              let workingSet = Array.from(extraSkeletonIds);
              for (let i=0; i<extraSkeletonIds.size; i +=widget.completenessBatchSize) {
                let batch = workingSet.slice(i, Math.min(workingSet.length, i + widget.completenessBatchSize));
                completenessPromises.push(CATMAID.Skeletons.completeness(
                    project.id, batch, widget.extraMaxOpenEnds,
                    widget.extraMinNodes, widget.extraMinCable,
                    widget.extraIgnoreFragments, true));
              }
            }

            return Promise.all(completenessPromises)
              .then(completenessResults => {
                let completionStatus = new Map();
                for (let r of completenessResults) {
                  for (let skeletonResult of r) {
                    completionStatus.set(skeletonResult[0], {
                      complete: skeletonResult[1],
                    });
                  }
                }
                return {
                  annotationMap: annotationMap,
                  completionStatus: completionStatus,
                  pairingMetaTargetMap: pairingMetaTargetMap,
                };
              });
          })
          .then(meta => {
            let annotationMap = meta.annotationMap;

            // Remove incomple skeletons from annotation map.
            let incompleSkeletons = 0;
            if (widget.useOnlyCompleteSkeletons) {
              for (let v of annotationMap.values()) {
                for (let skeletonId of v) {
                  let status = meta.completionStatus.get(skeletonId);
                  if (!status || !status.complete) {
                    v.delete(skeletonId);
                    ++incompleSkeletons;
                  }
                }
              }
            }

            if (incompleSkeletons) {
              CATMAID.warn(`Ignored ${incompleSkeletons} incomple skeletons`);
            }

            widget.clearGroupSources();

            if (subGroupMap.size > 0) {
              let lut = new THREE.Lut("rainbow", annotationIds.length);
              lut.setMin(0);
              lut.setMax(annotationIds.length);
              // List number of active neurons for all available groups and update
              // skeleton sources.
              let header1 = subGroupList.appendChild(document.createElement('span'));
              header1.innerHTML = '<b>Subgroup</b>';
              let header2 = subGroupList.appendChild(document.createElement('span'));
              header2.innerHTML = '<b>Space</b>';
              let header3 = subGroupList.appendChild(document.createElement('span'));
              let completedInfo = widget.useOnlyCompleteSkeletons ? 'completed ' : '';
              header3.innerHTML = `<b>Subgroup-annotations and ${completedInfo}skeletons</b>`;

              let counter = 0;
              let landmarkGroupSelectMap = new Map();
              for (let [sg, annotationIds] of subGroupMap.entries()) {
                let source = new CATMAID.BasicSkeletonSource('Pair statistics - sub-group ' + sg);
                widget.groupSources.push(source);

                let span1 = subGroupList.appendChild(document.createElement('span'));
                span1.appendChild(document.createTextNode(sg));

                let span2 = subGroupList.appendChild(document.createElement('span'));
                span2.appendChild(document.createTextNode('...'));
                landmarkGroupSelectMap.set(sg, span2);

                let annotationNames = Array.from(annotationIds).map(e => {
                  let color = lut.getColor(counter);
                  ++counter;

                  let name = CATMAID.annotations.getName(e);
                  let skeletonIds = Array.from(annotationMap.get(e));

                  let skeletonModels = skeletonIds ? skeletonIds.reduce((o,e) => {
                    o[e] = new CATMAID.SkeletonModel(e, undefined, color);
                    return o;
                  }, {}) : null;
                  if (skeletonModels) {
                    source.append(skeletonModels);
                  }

                  let skeletonLinks = skeletonIds ?
                      skeletonIds.map(skid => `<a class="neuron-selection-link" href="#" data-id="${skid}">${skid}</a>`) :
                      ['(none)'];
                  return `<span class="neuron-link-group">${name}</span>: ${skeletonLinks.join(', ')}`;
                });
                let span3 = subGroupList.appendChild(document.createElement('span'));
                span3.innerHTML = annotationNames.join(', ');
              }

              let prepare = CATMAID.Landmarks.listGroups(project.id).then(function(json) {
                return json.sort(function(a, b) {
                  return CATMAID.tools.compareStrings(a.name, b.name);
                }).map(function(landmarkGroup) {
                  return {
                    title: landmarkGroup.name,
                    value: landmarkGroup.id
                  };
                });
              });

              // Update all landmark group selectors once data becomes
              // available.
              let spaceGroupMapping = new Map();
              prepare
                .then(options => {
                  for (let [sg, wrapper] of landmarkGroupSelectMap.entries()) {
                    let select = CATMAID.DOM.createRadioSelect('Landmark group',
                      options, undefined, true, 'selected');
                    select.onchange = function(e) {
                      spaceGroupMapping.set(sg, e.target.value);
                    };
                    // Clear content
                    while (wrapper.lastChild) {
                      wrapper.removeChild(wrapper.lastChild);
                    }
                    wrapper.appendChild(select);
                  }
                })
                .catch(CATMAID.handleError);
            }

            // List matching ID pair information. Compute all matches between
            // neurons from each subgroup of a group. A neuron pair is matched
            // if they share an annotation (such as cell type), indicated by a
            // specific meta-annotation that needs to be shared by valid
            // matching annotations.
            let matchingPairSource = new CATMAID.BasicSkeletonSource('Skeleton pairs - matched across sub-group');
            widget.groupSources.push(matchingPairSource);

            let unmatchedIpsiPairSource = new CATMAID.BasicSkeletonSource('Skeleton pairs - unmatched same sub-group');
            widget.groupSources.push(unmatchedIpsiPairSource);

            let unmatchedContraPairSource = new CATMAID.BasicSkeletonSource('Skeleton pairs - unmatched across sub-group');
            widget.groupSources.push(unmatchedContraPairSource);

            let combinedGroups = CATMAID.SkeletonMatching.combineGroups([widget.groups, widget.extraGroups]);

            CATMAID.SkeletonMatching.createMatchReport(project.id,
                combinedGroups, meta.annotationMap, meta.pairingMetaTargetMap)
              .then(report => {
                this.matchReport = report;

                // Update matched partner skeleton source
                ProjectManagementWidget.updatePairSource(matchingPairSource,
                    report.matchedContraPairs);
                ProjectManagementWidget.updatePairSource(unmatchedIpsiPairSource,
                    report.allIpsiPairs);
                ProjectManagementWidget.updatePairSource(unmatchedContraPairSource,
                    report.unmatchedControPairs);

                // Update result display
                ProjectManagementWidget.addPairListElements(matchingPairsContainer,
                    report.matchedContraPairs, 'matched contra sub-group');
                ProjectManagementWidget.addPairListElements(ipsiPairsContainer,
                    report.allIpsiPairs, 'all same sub-group');
                ProjectManagementWidget.addPairListElements(contraPairsContainer,
                    report.unmatchedControPairs, 'unmatched contra sub-group');

                CATMAID.msg("Success", "Computed pairing sets");
              })
              .catch(CATMAID.handleError);
          })
          .catch(CATMAID.handleError);

        $(subGroupList).add(matchingPairsContainer).add(ipsiPairsContainer)
          .add(contraPairsContainer).on('click', 'a[data-id]', e => {
            let id = Number(e.target.dataset.id);
            if (Number.isNaN(id)) {
              CATMAID.warn("Could not parse ID: " + e.target.dataset.id);
              return;
            }
            CATMAID.TracingTool.goToNearestInNeuronOrSkeleton('skeleton', id);
          });
      }
    },
    'project-management': {
      title: 'Pair statistics',
      createControls: function(target) {
        return [];
      },
      createContent: function(content, widget) {
      }
    },
  };

  // Export widget
  CATMAID.ProjectManagementWidget = ProjectManagementWidget;

  // Register widget with CATMAID
  CATMAID.registerWidget({
    name: "Project management",
    description: "Set user permissions and basic project properties",
    key: "project-management",
    creator: ProjectManagementWidget,
    state: {
      getState: function(widget) {
        return {
          //importAllowNonEmptyGroups: widget.importAllowNonEmptyGroups,
        };
      },
      setState: function(widget, state) {
        //CATMAID.tools.copyIfDefined(state, widget, 'importAllowNonEmptyGroups');
      }
    }
  });

})(CATMAID);
