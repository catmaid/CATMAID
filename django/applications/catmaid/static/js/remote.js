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

    return CATMAID.Client.Settings.session.remote_servers.reduce(function(o, rci) {
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
    let remoteConfigs = CATMAID.Client.Settings.session.remote_servers;
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
   * loaded that are annotated with the passed in annotation. The following
   * options can be configured in the the options argument: api, buttons, title.
   */
  Remote.previewSkeletonMerge = function(projectId, skeletonId, loc, winningProjectId,
      winningSkeletonId, winningNodeId, winningOverlay, options = {}) {
    // FIXME: This won't work if local and remote skeleton ID are the same.
    return Promise.all([
        CATMAID.Skeletons.getArbors(projectId, [skeletonId], options.api),
        CATMAID.Skeletons.getArbors(winningProjectId, [winningSkeletonId]),
      ])
      .then(results => {
        let [remoteArborParsers, localArborParsers] = [results[0], results[1]];
        let remoteSkeletonIds = Array.from(remoteArborParsers.keys());
        let localSkeletonIds = Array.from(localArborParsers.keys());
        if (!remoteSkeletonIds || remoteSkeletonIds.length === 0) {
          CATMAID.warn(`No remote neurons found`);
          return;
        }
        if (!localSkeletonIds || localSkeletonIds.length === 0) {
          CATMAID.warn(`No remote neurons found`);
          return;
        }
        if (localSkeletonIds[0] === remoteSkeletonIds[0]) {
          CATMAID.warn('Remote and local skeleton have same ID');
          return;
        }

        let arborParsers = new Map([
          [winningSkeletonId, localArborParsers.get(winningSkeletonId)],
          [skeletonId, remoteArborParsers.get(skeletonId)],
        ]);

        var toColor = new THREE.Color(1, 0, 1);
        let toModel = new CATMAID.SkeletonModel(skeletonId, undefined, toColor, options.api);
        toModel.projectId = projectId;
        let fromModel = new CATMAID.SkeletonModel(winningSkeletonId);

        // Extend the display with the newly created line
        var extension = {};
        var p = winningOverlay.nodes.get(winningNodeId);
        extension[winningSkeletonId] = [
            new THREE.Vector3(p.x, p.y, p.z),
            new THREE.Vector3(loc.x, loc.y, loc.z)
        ];

        // Create virtual skeletons
        let nodeProvider = new CATMAID.ArborParserNodeProvider(arborParsers);

        // Create dialog
        var dialog = new CATMAID.SplitMergeDialog({
          title: options.title || `Preview of all ${skeletonIds.length} remote neurons`,
          showControlPanel: false,
          buttons: options.buttons || {
            "Close": () => dialog.close(),
          },
          autoOrder: false,
          model1: fromModel,
          model2: toModel,
          manualLoading: true,
          swapEnabled: false,
          merge: options.merge ? options.merge.handle : undefined,
          extension: extension,
          nodeProvider: nodeProvider,
        });

        dialog.show();

        // Store a reference to the dialig in the options
        options.dialog = dialog;
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
    // First, check if the local server is referenced and return it if that's
    // the case.
    if (!remoteHandle || remoteHandle === CATMAID.Remote.Settings.session.local_server_name) {
      return CATMAID.API.getLocalAPI(CATMAID.Remote.Settings.session.local_server_name);
    }

    let remoteConfigs = CATMAID.Client.Settings.session.remote_servers;
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
  Remote.importSkeletons = function(sourceProjectId, targetProjectId,
      skeletonIds, extendedInfo = true, options = {}) {
    let getMeta = options.getMeta || function(skeletonId) {
      return {
        name: undefined,
      };
    };

    let swcReadApi = extendedInfo ? CATMAID.Skeletons.getESWC : CATMAID.Skeletons.getSWC;
    let swcWriteApi = extendedInfo ? CATMAID.Skeletons.importESWC : CATMAID.Skeletons.importSWC;

    // Get SWC for each skeleton ID
    return swcReadApi(sourceProjectId, skeletonIds, false, true, options.api)
      .then(swcData => {
        // Import
        let importPromises = skeletonIds.map((skeletonId, i) => {
            let data = swcData[i];
            if (!data) {
              throw new CATMAID.ValueError(`Could not find ${extendedInfo ? 'e' : ''}SWC data for remote skeleton ${skeletonId}`);
            }
            let meta = getMeta(skeletonId);
            let sourceUrl = (options.api ? options.api.url : null) || CATMAID.getAbsoluteURL();
            return swcWriteApi(targetProjectId, data, meta.name,
                meta.annotations, sourceUrl, skeletonId, sourceProjectId);
          });
        return Promise.all(importPromises);
      })
      .then(importedSkeletons => {
        CATMAID.msg('Success', `Imported ${importedSkeletons.length} remote skeletons`);
        return importedSkeletons;
      });
  };

  Remote.importRemoteSkeletonsWithPreview = function(api, sourceProjectId,
      skeletonIds, annotations, entityMap, callback, previewOptions = {}) {
    let plural = skeletonIds.length > 0 ? 's' : '';
    let title = `Please confirm the import of the following skeleton${plural}`;
    return new Promise((resolve, reject) => {
      CATMAID.Remote.previewSkeletons(sourceProjectId, skeletonIds, {
        api: api,
        title: title,
        buttons: {
          'Confirm import': function() {
            // Initate import
            CATMAID.Remote.importSkeletons(sourceProjectId, project.id, skeletonIds, true, {
                getMeta: (skeletonId) => {
                  let e = entityMap[skeletonId];
                  if (!e) {
                    throw new CATMAID.ValueError("No skeleton meta data found");
                  }
                  return {
                    'name': e.name,
                    'annotations': annotations,
                  };
                },
                api: api,
              })
              .then(result => {
                if (CATMAID.tools.isFn(callback)) callback(result);
                resolve(result);
              })
              .catch(reject);
            $(this).dialog("close");
          },
          'Cancel': function() {
            $(this).dialog("close");
            reject(new CATMAID.CanceledByUser());
          }
        }
      })
      .catch(CATMAID.handleError);
    });
  };

  Remote.importRemoteSkeletonsWithMergePreview = function(api, sourceProjectId,
      skeletonId, losingLocation, annotations, entityMap, winningProjectId,
      winningSkeletonId, winningNodeId, winningOverlay) {
    let title = `Please confirm the import and subsequent merge of skeleton ${skeletonId} from remote instance ${api.name}`;
    return new Promise((resolve, reject) => {
      let options = {
        api: api,
        dialog: null,
        title: title,
        buttons: {
          'Confirm import and merge': function() {
            let combinedAnnotationSet = options.dialog.get_combined_annotation_set();
            let samplerHandling = options.dialog.samplerHandling;

            // Initate import
            CATMAID.Remote.importSkeletons(sourceProjectId, winningProjectId, [skeletonId], true, {
                getMeta: (skeletonId) => {
                  let e = entityMap[skeletonId];
                  if (!e) {
                    throw new CATMAID.ValueError("No skeleton meta data found");
                  }
                  return {
                    'name': e.name,
                    'annotations': combinedAnnotationSet,
                  };
                },
                api: api,
              })
              .then(result => {
                resolve({
                  importData: result[0],
                  combinedAnnotationSet: combinedAnnotationSet,
                  samplerHandling: samplerHandling,
                });
              })
              .catch(reject);
            $(this).dialog("close");
          },
          'Cancel': function() {
            $(this).dialog("close");
            reject(new CATMAID.CanceledByUser());
          }
        }
      };
      CATMAID.Remote.previewSkeletonMerge(sourceProjectId, skeletonId, losingLocation,
          winningProjectId, winningSkeletonId, winningNodeId, winningOverlay, options)
        .catch(CATMAID.handleError);
    });
  };

  Remote.mergeImportSkeleton = function(losingProjectId, losingSkeletonId,
      losingNodeId, losingApi, losingLocation, winningProjectId,
      winningSkeletonId, winningNodeId, winningApi, winningOverlay) {
    let sameApi = (!losingApi && !winningApi) || (losingApi && winningApi && losingApi.equals(winningApi));
    if (losingNodeId === winningApi && sameApi) return;

    // In case both nodes come with an API, stop the merge. At the moment the target
    // ultimately needs to be the local skeleton.
    if (winningApi && losingApi) {
      CATMAID.warn("At least one skeleton has to be local");
      return;
    }

    let losingReferenceNodeId = SkeletonAnnotations.isRealNode(losingNodeId) ?
        losingNodeId : SkeletonAnnotations.getChildOfVirtualNode(losingNodeId);

    // Show preview and confirmation only if the losing skeleton node count is
    // > 1 and fast merge mode doesn't match.
    return Promise.all([
        CATMAID.Skeletons.getNodeCountFromTreenode(losingProjectId, losingReferenceNodeId, losingApi),
        CATMAID.Skeletons.getNames(losingProjectId, [losingSkeletonId], losingApi),
      ])
      .then(results => {
        let nLosingNodes = results[0].count;
        if (nLosingNodes === undefined) {
          throw new CATMAID.ValueError("Could not find number of nodes for remote skeleton");
        }
        let entityMap = {};
        entityMap[losingSkeletonId] = {
          name: results[1][losingSkeletonId],
        };
        let annotations = '';

        let options = {
          getMeta: (skeletonId) => {
            if (skeletonId !== losingSkeletonId) {
              throw new CATMAID.ValueError(`Unexpected skeleton ID requested: ${skeletonId}`);
            }
            return {
              'name': entityMap[skeletonId],
              'annotations': annotations,
            };
          },
          api: losingApi,
        };

        /* If the to-node contains more than one node, show the dialog.
         * Otherwise, check if the to-node contains annotations. If so, show the
         * dialog. Otherwise, merge it right away and keep the from-annotations.
         */
        if (nLosingNodes > 1) {
          return CATMAID.Remote.mergeImportSkeletonWithPreview(losingProjectId,
              losingSkeletonId, losingNodeId, losingApi, losingLocation, winningProjectId,
              winningSkeletonId, winningNodeId, winningApi, winningOverlay,
              annotations, entityMap);
        } else {
          return CATMAID.Remote.mergeImportSkeletonNoConfirmation(losingProjectId,
              losingSkeletonId, losingNodeId, losingApi, winningProjectId,
              winningSkeletonId, winningNodeId, winningApi, winningOverlay, options);
        }
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Merge a remote skeleton after is has been imported. Show now preview
   * confirmation dialog. The import and merge is attempted right away.
   */
  Remote.mergeImportSkeletonNoConfirmation = function(losingProjectId,
      losingSkeletonId, losingNodeId, losingApi, winningProjectId,
      winningSkeletonId, winningNodeId, winningApi, winningOverlay, options) {
    // Import remote skeleton
    return CATMAID.Remote.importSkeletons(losingProjectId, winningProjectId,
        [losingSkeletonId], true, options)
      .then(result => {
        return new Promise((resolve, reject) => {
          winningOverlay.redraw(true, resolve);
        }).then(() => {
          return SkeletonAnnotations.staticMoveToAndSelectNode(winningNodeId);
        })
        .then(() => result);
      })
      .then(result => {
        // Find new node ID and skeleton ID after import and merge it into the
        // winning node.
        let newLosingNodeId = result.node_id_map[losingNodeId];
        // let newLosingSkeletonId = result.skeleton_id;

        // This merge will happen only on the winning API side. To reuse the
        // existing logic, we defer to the tracing overlay for the actual merge.
        // TODO: There is no real need to know the tracing overlay here, if we
        // could factor the merge out.
        return winningOverlay.createTreenodeLink(winningNodeId, newLosingNodeId, false);
      })
      .catch(CATMAID.handleError);
  };

  /**
   * Merge a remote skeleton after is has been imported. Show a preview dialog.
   */
  Remote.mergeImportSkeletonWithPreview = function(losingProjectId,
      losingSkeletonId, losingNodeId, losingApi, losingLocation, winningProjectId,
      winningSkeletonId, winningNodeId, winningApi, winningOverlay, annotations,
      entityMap) {
    // Import remote skeleton
    return CATMAID.Remote.importRemoteSkeletonsWithMergePreview(losingApi,
        losingProjectId, losingSkeletonId, losingLocation, annotations, entityMap,
        winningProjectId, winningSkeletonId, winningNodeId, winningOverlay)
      .then(results => {
        return new Promise((resolve, reject) => {
            winningOverlay.redraw(true, resolve);
          })
          .then(() => {
            return SkeletonAnnotations.staticSelectNode(winningNodeId, true);
          })
          .then(() => results);
      })
      .then((results) => {
        let newLosingNodeId = CATMAID.Remote.getImportedActiveNode(losingNodeId, results.importData);
        // This merge will happen only on the winning API side. To reuse the
        // existing logic, we defer to the tracing overlay for the actual merge.
        // TODO: There is no real need to know the tracing overlay here, if we
        // could factor the merge out.
        return winningOverlay.createTreenodeLink(winningNodeId, newLosingNodeId,
            false, results.annotations, results.samplerHandling);
      })
      .catch(CATMAID.handleError);
  };

  Remote.getDefaultSkeletonImportAnnotations = function() {

  };

  Remote.getImportedActiveNode = function(activeNodeId, importedData) {
    let newActiveNodeId;
    if (SkeletonAnnotations.isRealNode(activeNodeId)) {
      newActiveNodeId = importedData.node_id_map[activeNodeId];
    } else {
      // Lookup parent and child of virtual node and compute new location to
      // select a similar node after the import.
      let parentId = SkeletonAnnotations.getParentOfVirtualNode(activeNodeId);
      let childId = SkeletonAnnotations.getChildOfVirtualNode(activeNodeId);
      let x = Number(SkeletonAnnotations.getXOfVirtualNode(activeNodeId));
      let y = Number(SkeletonAnnotations.getYOfVirtualNode(activeNodeId));
      let z = Number(SkeletonAnnotations.getZOfVirtualNode(activeNodeId));
      let newParentId = importedData.node_id_map[parentId];
      let newChildId = importedData.node_id_map[childId];

      newActiveNodeId = SkeletonAnnotations.getVirtualNodeID(newChildId, newParentId, x, y, z);
    }
    return newActiveNodeId;
  };

  Remote.selectImportedNode = function(activeNodeId, importedData) {
    let newActiveNodeId = CATMAID.Remote.getImportedActiveNode(activeNodeId, importedData);
    if (newActiveNodeId !== undefined) {
        CATMAID.msg("New active node", "Selected imported active node");
        return SkeletonAnnotations.staticSelectNode(newActiveNodeId, true)
          .then(() => newActiveNodeId);
    }
    return Promise.reject(new CATMAID.ValueError("Can't find new active node ID after import"));
  };

  Remote.Settings = new CATMAID.Settings(
      'remote',
    {
      version: 0,
      entries: {
        local_server_name: {
          default: 'This instance'
        },
      },
      migrations: {}
    });

  // Export into CATMAID namespace.
  CATMAID.Remote = Remote;

})(CATMAID);
