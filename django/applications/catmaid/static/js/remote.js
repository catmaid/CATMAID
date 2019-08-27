(function(CATMAID) {

  "use strict";

  let Remote = {};

  /**
   * Return a list of objects, each having the field title and value, matching a
   * remote catmaid instance.
   *
   * @param includeLocal {boolean} Whether to include an entry for the calling
   *                               CATMAID instance.
   * @return A list of objects.
   */
  Remote.getRemoteOptionList = function(includeLocal = true) {
    let remoteOptions = [];
    if (includeLocal) {
      remoteOptions.push({
        title: 'Local',
        value: '',
      });
    }

    return CATMAID.Client.Settings.session.remote_catmaid_instances.reduce(function(o, rci) {
      o.push({
        title: rci.name,
        value: rci.name,
      });
      return o;
    }, remoteOptions);
  };

  /**
   * Get a list of remote projects.
   *
   * @param sourceRemote {String} The handle of a stored CATMAID remote. If
   *                              empty or falsy, local projets will be returned.
   *
   * @return {Promise} resolving with project list.
   */
  Remote.getProjectList = function(sourceRemote) {
    if (!sourceRemote || sourceRemote.length === 0) {
      return Promise.resolve(CATMAID.client.projects.map(function(p) {
        return {
          title: p.title + ' (' + p.id + ')',
          value: p.id,
        };
      }));
    }

    // In case, no particular source remote is defined, we use the local instance.
    // Find selected remote configuration based on name
    let remoteConfigs = CATMAID.Client.Settings.session.remote_catmaid_instances;
    if (!remoteConfigs) {
      return Promise.reject("No configured remote instances found");
    }
    let remote = remoteConfigs.filter(function(rc) {
      return rc.name === sourceRemote;
    });
    if (remote.length === 0) {
      return Promise.reject("No matching remote found");
    }
    if (remote.length > 1) {
      return Promise.reject("Found more than one matching remote config");
    }
    // Expect exactly one matching remote.
    let api = new CATMAID.API.fromSetting(remote[0]);
    // Fetch projects from remote.
    return CATMAID.fetch({
        url: '/projects/',
        method: 'GET',
        api: api,
      }).then(projects => {
        return projects.map(p => {
          return {
            title: p.title + ' (' + p.id + ')',
            value: p.id,
          };
        });
      });
  };

  /**
   * Create a SELECT like DOM element, which is a list of radio buttons and
   * a filter.
   */
  Remote.createRemoteSelect = function(selectedKey = undefined,
      includeLocal = true, title = "Remote intance", onchange = undefined) {
    // Remote select
    let remoteOptions = CATMAID.Remote.getRemoteOptionList(includeLocal);

    let emptyValue = includeLocal ? 'Local' : '(None)';
    let remoteSelect = CATMAID.DOM.createRadioSelect(title,
        remoteOptions, selectedKey, true, 'selected', emptyValue);

    if (onchange) {
        remoteSelect.addEventListener('change', onchange);
    }

    return remoteSelect;
  };

  Remote.createRemoteSelectSetting = function(label) {

  };

  Remote.createAsyncProjectSelect = function(sourceRemote, selectedKey = undefined,
      title = 'Source project', onchange = undefined) {
    return CATMAID.Remote.getProjectList(sourceRemote)
      .then(projects => {
        let projectSelect = CATMAID.DOM.createRadioSelect('Source project',
            projects, selectedKey, true, 'selected');

        if (onchange) {
          projectSelect.addEventListener('change', onchange);
        }
        return projectSelect;
      });
  };

  /**
   * Open a 3D dialog that has all neurons from the remote CATMAID project
   * loaded that are annotated with the passed in annotation..
   */
  Remote.previewSkeletons = function(projectId, neuronAnnotation, includeSubAnnotations, remote) {
    // Get all remote skeletons
    let api = remote ? remote : null;
    CATMAID.Skeletons.byAnnotation(projectId, [neuronAnnotation], includeSubAnnotations, api)
      .then(function(skeletonIds) {
        // Fetch skeletons
        let promises = skeletonIds.map(skeletonId => {
          return CATMAID.fetch({
              url: projectId + '/' + skeletonId + '/1/1/1/compact-arbor',
              method: 'POST',
              api: api,
            }) .then(function(result) {
              var ap = new CATMAID.ArborParser();
              ap.tree(result[0]);
              return [skeletonId, ap];
            });
        });

        return Promise.all(promises)
          .then((arborParsers) => {
            return new Map(arborParsers);
          });
      })
      .then(arborParsers => {
        let skeletonIds = Array.from(arborParsers.keys());
        if (!skeletonIds || skeletonIds.length === 0) {
          CATMAID.warn(`No neurons found with annotation "${neuronAnnotation}" from remote "${remote.name}"`);
          return;
        }
        // Create dialog
        var dialog = new CATMAID.Confirmation3dDialog({
          title: `Preview of all ${skeletonIds.length} remote neurons annotated with "${neuronAnnotation}"`,
          showControlPanel: false,
          buttons: {
            "Close": () => dialog.close(),
          }});

        dialog.show();

        let colorizer = new CATMAID.Colorizer();
        var glWidget = dialog.webglapp;
        var models = skeletonIds.reduce( (o, skid, i) => {
          let skeleton = new CATMAID.SkeletonModel(skid, undefined,
              colorizer.pickColor(), api);
          skeleton.projectId = projectId;
          o[skid] = skeleton;
          return o;
        }, {} );

        // Create virtual skeletons
        let nodeProvider = new CATMAID.ArborParserNodeProvider(arborParsers);

        glWidget.addSkeletons(models, () => {
            // Focus first skeleton
            glWidget.lookAtSkeleton(skeletonIds[0]);
          },
          nodeProvider);
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Get a new API instance if it is a valid remote name. Otherwise undefined is
   * returned.
   */
  Remove.getAPI = function(reomote) {
    let remoteConfigs = CATMAID.Client.Settings.session.remote_catmaid_instances;
    if (!remoteConfigs) {
      CATMAID.warn("No configured remote instances found");
      return;
    }
    let remote = remoteConfigs.filter(function(rc) {
      return rc.name === sourceRemote;
    });
    if (remote.length === 0) {
      CATMAID.warn("No matching remote found");
      return;
    }
    if (remote.length > 1) {
      CATMAID.warn("Found more than one matching remote config");
      return;
    }
    return CATMAID.API.fromSetting(remote[0]);
  };


  // Export into CATMAID namespace.
  CATMAID.Remote = Remote;

})(CATMAID);
