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
      return Promise.reject(new CATMAID.ValueError("No configured remote instances found"));
    }
    let remote = remoteConfigs.filter(function(rc) {
      return rc.name === sourceRemote;
    });
    if (remote.length === 0) {
      return Promise.reject(new CATMAID.ValueError("No matching remote found"));
    }
    if (remote.length > 1) {
      return Promise.reject(new CATMAID.ValueError("Found more than one matching remote config"));
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
   * loaded that are annotated with the passed in annotation. The following
   * options can be configured in the the options argument: api, buttons, title.
   */
  Remote.previewSkeletons = function(projectId, skeletonIds, options = {}) {
    return CATMAID.Skeletons.getArbors(projectId, skeletonIds, options.api)
      .then(arborParsers => {
        let skeletonIds = Array.from(arborParsers.keys());
        if (!skeletonIds || skeletonIds.length === 0) {
          CATMAID.warn(`No neurons found`);
          return;
        }
        // Create dialog
        var dialog = new CATMAID.Confirmation3dDialog({
          title: options.title || `Preview of all ${skeletonIds.length} remote neurons`,
          showControlPanel: false,
          buttons: options.buttons || {
            "Close": () => dialog.close(),
          }});

        dialog.show();

        let colorizer = new CATMAID.Colorizer();
        var glWidget = dialog.webglapp;
        var models = skeletonIds.reduce( (o, skid, i) => {
          let skeleton = new CATMAID.SkeletonModel(skid, undefined,
              colorizer.pickColor(), options.api);
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
      });
  };

  /**
   * Open a 3D dialog that has all neurons from the remote CATMAID project
   * loaded that are annotated with the passed in annotation..
   */
  Remote.previewSkeletonsByAnnotation = function(projectId, neuronAnnotation,
      includeSubAnnotations, options) {
    // Get all remote skeletons
    let api = options.remote ? options.remote : null;
    return CATMAID.Skeletons.byAnnotation(projectId, [neuronAnnotation],
        includeSubAnnotations, api)
      .then(skeletonIds => CATMAID.Remote.previewSkeletons(projectId,
          skeletonIds, options));
  };

  /**
   * Get a new API instance if it is a valid remote name. Otherwise undefined is
   * returned.
   */
  Remote.getAPI = function(remoteHandle) {
    let remoteConfigs = CATMAID.Client.Settings.session.remote_catmaid_instances;
    if (!remoteConfigs) {
      CATMAID.warn("No configured remote instances found");
      return;
    }
    let remote = remoteConfigs.filter(function(rc) {
      return rc.name === remoteHandle;
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

  /**
   * Load the respective skeleton morphologies, optionally from a remote server,
   * if the `api` option is passed in. This is done by first requesting the SWC
   * from the API and importing it. The options object can contain the following
   * fields: api, getMeta(), The `getMeta(skeletonId)` function is expected to
   * return an object with the field `name` for each skeleton.
   */
  Remote.importSkeletons = function(sourceProjectId, targetProjectId, skeletonIds, options = {}) {
    let getMeta = options.getMeta || function(skeletonId) {
      return {
        name: undefined,
      };
    };
    // Get SWC for each skeleton ID
    return CATMAID.Skeletons.getSWC(sourceProjectId, skeletonIds, false, true, options.api)
      .then(swcData => {
        // Import
        let importPromises = skeletonIds.map((skeletonId, i) => {
            let data = swcData[i];
            if (!data) {
              throw new CATMAD.ValueError(`Could not find SWC data for remote skeleton ${skeletonId}`);
            }
            let meta = getMeta(skeletonId);
            let sourceUrl = options.api ? options.api.url : undefined;
            return CATMAID.Skeletons.importSWC(targetProjectId, data, meta.name,
                meta.annotations, sourceUrl, skeletonId, sourceProjectId);
          });
        return Promise.all(importPromises);
      })
      .then(importedSkeletons => {
        CATMAID.msg('Success', `Imported ${importedSkeletons.length} remote skeletons`);
      });
  };


  // Export into CATMAID namespace.
  CATMAID.Remote = Remote;

})(CATMAID);
