/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * This namespace provides functions to work with skeletons, which model
   * neurons. All of them return promises.
   */
  var Skeletons = {

    /**
     * Get base names for a list of skeletons, optionally from a remote API.
     */
    getNames: function(projectId, skeletonIds, api = undefined) {
      return CATMAID.fetch({
        url: projectId + '/skeleton/neuronnames',
        method: 'POST',
        data: {
          skids: skeletonIds,
        },
        api: api,
      });
    },

    getNodeCount: function(projectId, skeletonId, api = undefined) {
      return CATMAID.fetch({
        url: `${projectId}/skeleton/${skeletonId}/node_count`,
        method: 'POST',
        api: api,
      });
    },

    getNodeCountFromTreenode: function(projectId, treenodeId, api = undefined) {
      return CATMAID.fetch({
        url: `${projectId}/skeleton/node/${treenodeId}/node_count`,
        method: 'POST',
        api: api,
      });
    },

    /**
     * Split a skeleton at a specific treenodes.
     *
     * @param {State}   state      Neighborhood state for node
     * @param {integer} projectId  The project space to work in
     * @param {integer} treenodeId Treenode to split skeleton at
     * @param {object}  upstream_annot_map Map of annotation names vs annotator
     *                                     IDs for the upstream split part.
     * @param {object}  upstream_annot_map Map of annotation names vs annotator
     *                                     IDs for the downstream split part.
     * @param {API}      api       (optional) The CATMAID API to talk to.
     *
     * @returns A new promise that is resolved once the skeleton is split.
     */
    split: function(state, projectId, treenodeId,
        upstream_annot_map, downstream_annot_map, api = undefined) {

      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to split skeletons');
      var url = projectId + '/skeleton/split';
      var params = {
        treenode_id: treenodeId,
        upstream_annotation_map: JSON.stringify(upstream_annot_map),
        downstream_annotation_map: JSON.stringify(downstream_annot_map),
        state: state.makeNeighborhoodState(treenodeId)
      };

      return CATMAID.fetch({
        url: url,
        method: 'POST',
        data: params,
        api: api,
      }).then((function(json) {
        this.trigger(CATMAID.Skeletons.EVENT_SKELETON_SPLIT,
            json.new_skeleton_id,
            json.existing_skeleton_id,
            treenodeId);
        this.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
            json.existing_skeleton_id, [[treenodeId, json.x, json.y, json.z]]);
        return json;
      }).bind(this));
    },

    /**
     * Join two skeletons by adding an edge between the two passed in nodes.
     *
     * @param {State}   state         Multi node state with both treenodes
     * @param {integer} projectId     The project space to work in
     * @param {integer} fromId        The skeleton that will be merged
     * @param {integer} toId          The skeleton that will get more nodes
     * @param {object}  annotationSet (Optional) Map of annotation name vs
     *                                annotator ID.
     * @param {string}  samplerHandling (optional) If one or both of the
     *                                  skeletons have samplers, a handling mode
     *                                  is needed. Either "create-intervals",
     *                                  "branch", "domain-end" or "new-domain".
     * @param {boolean} fromNameReference (optional) If enabled, the back-end
     *                                    will add a new annotation to the
     *                                    target neuron, that is a refernce to
     *                                    the merged in neuron. By default false.
     * @param {API}      api          (optional) The CATMAID API to talk to.
     *
     * @returns A new promise that is resolved once both skeletons are joined.
     */
    join: function(state, projectId, fromId, toId, annotationSet,
        samplerHandling, fromNameReference = false, api = undefined) {

      CATMAID.requirePermission(projectId, 'can_annotate',
          'You don\'t have have permission to join skeletons');
      var url = projectId + '/skeleton/join';
      var params = {
        from_id: fromId,
        to_id: toId,
        state: state.makeMultiNodeState([fromId, toId]),
        fromNameReference: fromNameReference,
      };

      if (annotationSet) {
        params.annotation_set = JSON.stringify(annotationSet);
      }

      if (samplerHandling) {
        params.sampler_handling = samplerHandling;
      }

      if (fromNameReference) {
        params.from_name_reference = fromNameReference;
      }

      return CATMAID.fetch({
          url: url,
          method: 'POST',
          data: params,
          api: api,
      }).then((function(json) {
        // Trigger join, delete and change events
        CATMAID.Skeletons.trigger(
            CATMAID.Skeletons.EVENT_SKELETONS_JOINED, json.deleted_skeleton_id,
                json.result_skeleton_id);
        CATMAID.Skeletons.trigger(
            CATMAID.Skeletons.EVENT_SKELETON_DELETED, json.deleted_skeleton_id);
        CATMAID.Skeletons.trigger(
            CATMAID.Skeletons.EVENT_SKELETON_CHANGED, json.result_skeleton_id);
        return json;
      }).bind(this));
    },

    /**
     * Reroot a skeleton at a specific treenode.
     *
     * @param {State}   state      Neighborhood state for node
     * @param {integer} projectID  The project space to work in
     * @param {integer} treenodeID Treenode to reroot skeleton at
     *
     * @returns A new promise that is resolved once the skeleton is rerooted.
     */
    reroot: function(state, projectID, treenodeID) {

      CATMAID.requirePermission(projectID, 'can_annotate',
          'You don\'t have have permission to reroot skeletons');
      var url = projectID + '/skeleton/reroot';
      var params = {
        treenode_id: treenodeID,
        state: state.makeNeighborhoodState(treenodeID)
      };

      return CATMAID.fetch(url, 'POST', params).then((function(json) {
        this.trigger(CATMAID.Skeletons.EVENT_SKELETON_REROOTED,
            json.skeleton_id,
            treenodeID);
        this.trigger(CATMAID.Skeletons.EVENT_SKELETON_CHANGED,
            json.skeleton_id);
        return json;
      }).bind(this));
    },

    /**
     * Get all skeleton IDs for skeletons with nodes with the passed in label
     * IDs or label names.
     *
     * @param {integer}   projectId   Project space to work in
     * @param {integer[]} labelIds    A list of label IDs result skeleton will have
     * @param {string[]}  labelNames  A list of label names result skeleton will have
     */
    withLabels: function(projectID, labelIds, labelNames) {
      return CATMAID.fetch(project.id + '/skeletons/node-labels', 'POST', {
        label_ids: labelIds,
        label_names: labelNames
      });
    },

    /**
     * Export skeletons as SWC files
     *
     * @param {number}   projectId    Project sapce to work in
     * @param {number[]} skeletonIds  Skeletons to export as SWC
     * @param {boolean}  linearizeIds Whether node IDs should be mapped to
     *                                incremental numbers starting with 1.
     * @param {string[]} somaMarkers (optional) A list of "root", "tag:soma",
     *                               "radius:<n>" to specify that the exported
     *                               SWC should mark somas and based on what
     *                               criterion. Precedence as listed.
     * @param {API}      api         (optional) The CATMAID API to talk to.
     *
     * @return A new promise that is resolved with the skeleton's SWC
     *         representation.
     */
    getSWC: function(projectId, skeletonIds, linearizeIds, somaMarkers, api) {
      if (!skeletonIds || !skeletonIds.length) {
        return Promise.reject(new CATMAID.ValueError("Need at least one skeleton ID"));
      }
      var swcRequests = skeletonIds.map(function(skid) {
        return CATMAID.fetch({
          url: projectId + '/skeleton/' + skid + '/swc',
          method: 'GET',
          data: {
            'linearize_ids': !!linearizeIds,
            'soma_markers': somaMarkers,
          },
          raw: true,
          api: api,
        });
      });

      return Promise.all(swcRequests);
    },

    /**
     * Export skeletons as eSWC files. They are like SWCs files but contain
     * additional columns for each node: creator username, creation time, editor
     * username, edition_time, confidence.
     *
     * @param {number}   projectId    Project sapce to work in
     * @param {number[]} skeletonIds  Skeletons to export as SWC
     * @param {boolean}  linearizeIds Whether node IDs should be mapped to
     *                                incremental numbers starting with 1.
     * @param {string[]} somaMarkers (optional) A list of "root", "tag:soma",
     *                               "radius:<n>" to specify that the exported
     *                               SWC should mark somas and based on what
     *                               criterion. Precedence as listed.
     * @param {API}      api         (optional) The CATMAID API to talk to.
     *
     * @return A new promise that is resolved with the skeleton's SWC
     *         representation.
     */
    getESWC: function(projectId, skeletonIds, linearizeIds, somaMarkers, api) {
      if (!skeletonIds || !skeletonIds.length) {
        return Promise.reject(new CATMAID.ValueError("Need at least one skeleton ID"));
      }
      var eswcRequests = skeletonIds.map(function(skid) {
        return CATMAID.fetch({
          url: projectId + '/skeleton/' + skid + '/eswc',
          method: 'GET',
          data: {
            'linearize_ids': !!linearizeIds,
            'soma_markers': somaMarkers,
          },
          raw: true,
          api: api,
        });
      });

      return Promise.all(eswcRequests);
    },

    /**
     * Export skeletons as SWC and ask browser to download it.
     *
     * @param {number}   projectId   Project space to work in
     * @param {number[]} skeletonIds Skeletons to export as SWC
     * @param {boolean}  linearizeIds Whether node IDs should be mapped to
     *                                incremental numbers starting with 1.
     * @param {boolean}  archive     Produce a ZIP archive containing all files
     * @param {string[]} somaMarkers (optional) A list of "tag:soma",
     *                               "radius:<n>" or "root" to specify that the
     *                               exported SWC should mark somas and based on
     *                               what criterion. Precedence as listed.
     *
     * @return A new promise that is resolved with the skeleton's SWC
     *         representation.
     */
    exportSWC: function(projectId, skeletonIds, linearizeIds, archive,
        somaMarkers) {
      return CATMAID.Skeletons.getSWC(projectId, skeletonIds, linearizeIds,
          somaMarkers)
        .then(function(swcData) {
          if (archive) {
            var zip = new JSZip();
            swcData.forEach(function(swc, i) {
              var skeletonId = skeletonIds[i];
              zip.file(skeletonId + ".swc", swc);
            });
            return zip.generateAsync({type: "blob"})
              .then(content => saveAs(content, 'catmaid-swc-export.zip'));
          } else {
            swcData.forEach(function(swc, i) {
              var skeletonId = skeletonIds[i];
              var blob = new Blob([swc], {type: "text/plain"});
              saveAs(blob, skeletonId + ".swc");
            });
          }
        });
    },

    /**
     * Import SWC data into the back-end.
     */
    importSWC: function(projectId, swcData, name, annotations,
        sourceUrl = undefined, sourceId = undefined, sourceProjectId = undefined) {
      let sourceParams = [sourceUrl, sourceId, sourceProjectId];
      if (sourceParams.some(e => !!e) && !sourceParams.every(e => !!e)) {
        throw new CATMAID.ValueError('All or none of the parameters sourceUrl, ' +
            'sourceId and sourceProjectId have to be provided');
      }

      let file = new File([swcData], 'skeleton.swc');
      let data = new FormData();
      data.append(file.name, file, file.name);
      data.append('name', name);
      if (annotations) {
        for (let i=0; i<annotations.length; ++i) {
          data.append(`annotations[${i}]`, annotations[i]);
        }
      }
      data.append('source_url', sourceUrl);
      data.append('source_id', sourceId);
      data.append('source_project_id', sourceProjectId);

      return CATMAID.fetch({
        url: projectId + '/skeletons/import',
        method: 'POST',
        headers: {
          "Content-type": null,
        },
        data: data,
      });
    },

    /**
     * Import eSWC data into the back-end. They are like SWCs files but contain
     * additional columns for each node: creator username, creation time, editor
     * username, edition_time, confidence.
     */
    importESWC: function(projectId, swcData, name, annotations,
        sourceUrl = undefined, sourceId = undefined, sourceProjectId = undefined) {
      let sourceParams = [sourceUrl, sourceId, sourceProjectId];
      if (sourceParams.some(e => !!e) && !sourceParams.every(e => !!e)) {
        throw new CATMAID.ValueError('All or none of the parameters sourceUrl, ' +
            'sourceId and sourceProjectId have to be provided');
      }

      let file = new File([swcData], 'skeleton.eswc');
      let data = new FormData();
      data.append(file.name, file, file.name);
      data.append('name', name);
      if (annotations) {
        for (let i=0; i<annotations.length; ++i) {
          data.append(`annotations[${i}]`, annotations[i]);
        }
      }
      data.append('source_url', sourceUrl);
      data.append('source_id', sourceId);
      data.append('source_project_id', sourceProjectId);

      return CATMAID.fetch({
        url: projectId + '/skeletons/import',
        method: 'POST',
        headers: {
          "Content-type": null,
        },
        data: data,
      });
    },

    /**
     * Let the back-end create a NRRD representation of a neuron. It will use
     * the NAT R package for this and can use asynchronous processing if Celery
     * is set up.
     *
     * @param {number}   projectId    Project space to work in
     * @param {number[]} skeletonId   Skeleton to export as NRRD
     * @param {boolean}  mirror       Whether the exported skeleton should be
     *                                flipped horizontally.
     * @param {string}   sourceSpace  The space identifier for the space the
     *                                skeletons are defined in, e.g. FAFB13.
     * @param {string}   targetSpace  The space identifier for the target space
     *                                that the NRRD file will use, e.g. JFRC2.
     * @param {boolean}  asyncProc    Whether to create the NRRD file
     *                                asynchronously.
     *
     * @return A new promise that is resolved once the NRRD export is queued.
     */
    exportNRRD: function(projectId, skeletonId, mirror, sourceSpace, targetSpace, asyncProc) {
      return CATMAID.fetch(projectId + '/skeleton/' + skeletonId + '/nrrd', 'POST', {
        mirror: mirror,
        source_ref: sourceSpace,
        target_ref: targetSpace,
        async_export: !!asyncProc
      }, !asyncProc, undefined, undefined, asyncProc ? undefined : 'blob');
    },

    /**
     * Get the root node ID and location of a particular skeleton.
     *
     * @param {number} projectId  Project space to work in.
     * @param {number} skeletonId Skeleton to get root nodeof.
     *
     * @return {Promise} A promise that resolves in the root node ID of the
     *                   skeleton as well as its location.
     */
    getRootNode: function(projectId, skeletonId) {
      return CATMAID.fetch(project.id + '/skeletons/' + skeletonId + '/root');
    },

    /**
     * Get skeletons that intersedct with the defined bounding box.
     *
     * @param {number} projectId Project space to operte in.
     * @param {numner} minX      Minimum X coordinate of bounding box.
     * @param {numner} minY      Minimum Y coordinate of bounding box.
     * @param {numner} minZ      Minimum Z coordinate of bounding box.
     * @param {numner} maxX      Maximum X coordinate of bounding box.
     * @param {numner} maxY      Maximum Y coordinate of bounding box.
     * @param {numner} maxZ      Maximum Z coordinate of bounding box.
     * @param {number} minNodes  (optional) Min. number of nodes in each skeleton.
     * @param {number} minCable  (optional) Min. cable length of each skeletons.
     * @param {number[]} skeletonIds (optional) Exclusively looked at skeleton Ids.
     *
     * @returns {Promise} Resolves with a list of intersecting skeleton Ids.
     */
    inBoundingBox: function(projectId, minX, minY, minZ, maxX, maxY, maxZ,
        minNodes, minCable, skeletonIds) {
      let method = skeletonIds ? 'POST' : 'GET';
      return CATMAID.fetch(project.id + '/skeletons/in-bounding-box', method, {
        'minx': minX,
        'miny': minY,
        'minz': minZ,
        'maxx': maxX,
        'maxy': maxY,
        'maxz': maxZ,
        'min_nodes': minNodes,
        'min_cable': minCable,
        'skeleton_ids': skeletonIds
      });
    },

    /**
     * Get the number of sampler associated with this skeleton.
     *
     * @param projectId  {integer} The project to operate in.
     * @param skeletonId {integer} The skeleton to get sampler count for.
     * @returns Promise that resolves with sampler count information.
     */
    getSamplerCount: function(projectId, skeletonId) {
      return CATMAID.fetch(projectId + '/skeletons/' + skeletonId + '/sampler-count')
        .then(function(count) {
          return count['n_samplers'];
        });
    },

    /**
     * Get the number of sampler associated with a list of skeletons.
     *
     * @param projectId   {integer} The project to operate in.
     * @param skeletonIds {integer[]} The skeletons to get sampler count for.
     * @returns Promise that resolves with sampler count information.
     */
    getAllSamplerCounts: function(projectId, skeletonIds) {
      return CATMAID.fetch(projectId + '/skeletons/sampler-count', 'POST', {
        'skeleton_ids': skeletonIds,
      });
    },

    /**
     * Get the cable length in nanometers between two nodes. If the passed in
     * nodes don't exist in the passed in skeleton or there is no connection
     * between the nodes, the returned Promise will be rejected with an error.
     *
     * @params {Number} projectId  The project to operate in
     * @params {Number} skeletonId The skeleton the nodes of interest are part of
     * @params {Number} nodeA      The first node for the distance calculation
     * @params {Number} nodeB      The second node for the distance calculation
     * @params {Function} arborTransform (optional) Function that can modify an
     *                                   existing arbor parser.
     * @returns {Promise} Resolves in either the distance between nodeA and nodeB
     *                    or null if no distance could be computed.
     */
    distanceBetweenNodes: function(projectId, skeletonId, nodeA, nodeB, arborTransform) {

      // Corner case, node A == node B, no extra work is needed, the distance is zero.
      if (nodeA == nodeB) {
        return Promise.resolve(0);
      }

      return CATMAID.fetch(projectId + '/skeletons/' + skeletonId + '/compact-detail')
        .then(function(skeletonDetail) {
          let arborParser = new CATMAID.ArborParser();
          arborParser.init('compact-skeleton', skeletonDetail);
          if (CATMAID.tools.isFn(arborTransform)) {
            arborTransform(arborParser);
          }

           // Make sure, nodes A and B are actually part of the skeleton.
           if (!arborParser.positions[nodeA]) {
             throw new CATMAID.ValueError("Node " + nodeA + " is not part of skeleton " + skeletonId);
           }
           if (!arborParser.positions[nodeB]) {
             throw new CATMAID.ValueError("Node " + nodeB + " is not part of skeleton " + skeletonId);
           }

          return arborParser;
        })
        .then(function(arborParser) {
          let arbor = arborParser.arbor;
          let positions = arborParser.positions;

          // Reroot arbor to node A for easy upstream traversal from node B.
          arbor.reroot(nodeA);

          // Compuet distance from node B to upstream node A.
          let distance = 0;
          let childPosition = positions[nodeB];
          let parent = arbor.edges[nodeB];
          while (parent) {
            let parentPosition = positions[parent];
            distance += childPosition.distanceTo(parentPosition);

            // If the current parent node is found, return with the calculated length.
            if (parent == nodeA) {
              return distance;
            }

            parent = arbor.edges[parent];
            childPosition = parentPosition;
          }

          return null;
        });
    },

    /**
     * Retrieve user permissions for a particular skeleton.
     *
     * @param {number} projectId  The project to operate in.
     * @param {number} skeletonId The skeleton to get permissions for.
     * @returns Promise resolving in permission information.
     */
    getPermissions: function(projectId, skeletonId) {
      var url = projectId + '/skeleton/' + skeletonId + '/permissions';
      return CATMAID.fetch(url, 'POST');
    },

    /**
     * Get a list of skeleton IDs based on their annotation, optionally from a
     * remote server.
     */
    byAnnotation: function(projectId, annotationNames, includeSubAnnotations, api) {
      let params = {
        'annotated_with': annotationNames,
        'sub_annotated_with': includeSubAnnotations ? annotationNames : undefined,
        'annotation_reference': 'name',
        'types': ['neuron'],
      };
      return CATMAID.fetch({
          url: projectId + '/annotations/query-targets',
          method: 'POST',
          data: params,
          api: api,
        }).then(result => {
          let skeletonIds = result.entities.reduce((l, e) => {
            Array.prototype.push.apply(l, e.skeleton_ids);
            return l;
          }, []);
          return skeletonIds;
        });
    },

    /**
     * Get a list of skeleton IDs based on their annotation, optionally from a
     * remote server. The search options object can contain the following
     * fields: name, annotatios, includeSubAnnotations, annotationReference.
     */
    search: function(projectId, searchOptions = {}, api = undefined) {
      let params = {
        'name': searchOptions.name || undefined,
        'annotated_with': searchOptions.annotations,
        'sub_annotated_with': searchOptions.includeSubAnnotations ? annotations : undefined,
        'annotation_reference': searchOptions.annotationReference || 'name',
        'types': ['neuron'],
      };
      return CATMAID.fetch({
          url: projectId + '/annotations/query-targets',
          method: 'POST',
          data: params,
          api: api,
        }).then(result => {
          let skeletonIds = result.entities.reduce((l, e) => {
            Array.prototype.push.apply(l, e.skeleton_ids);
            return l;
          }, []);
          return {
            skeletonIds: skeletonIds,
            resultEntities: result.entities,
          };
        });
    },

    /**
     * Get the skeleton change history for all skeletons in a project,
     * optionally constrained by user, and after as well as before dates.
     * Skeletons are modified by splits and merges.
     */
    skeletonHistory: function(projectId, skeletonIds = null, userId = null,
        changesAfter = null, changesBefore = null, api = null) {

      if ([skeletonIds, userId].every(e => e === null)) {
        throw new CATMAID.ValueError("Please provide either a set of skeleton IDs or a user ID");
      }
      return CATMAID.fetch({
        url: projectId + '/skeletons/change-history',
        method: 'GET',
        data: {
          initial_user_id: userId,
          changes_after: changesAfter,
          changes_before: changesBefore,
          skeleton_ids: skeletonIds ?
            skeletonIds.split(',').map(s => parseInt(s.trim(), 10)) : [],
        },
        api: api,
      });
    },

    /**
     * Load the passed in skeletons and return ArborParser instances, optionally
     * from a remote API.
     *
     * @param projectId   {integer}   The project to work in.
     * @param skeletonIds {integer[]} The skeletons to load.
     * @param api         {API}       (optional) The API to use for loading
     *                                skeletons.
     * @return A Promise resolving into a Map of skeleton Ids to ArborParser
     *         instance.
     */
    getArbors: function(projectId, skeletonIds, api = undefined) {
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
    },

    /**
     * Get information which and how many nodes are imported in a particular
     * skeleton.
     *
     * @param projectId   {integer}   The project to work in.
     * @param skeletonIds {integer[]} The skeletons to get import info on.
     * @param withTreenodes {Boolean} (optional) Whether to include a list of
     *                                the actual imported treenodes in the
     *                                result. False by default.
     * @param api         {API}       (optional) The API to use for loading
     *                                skeletons.
     * @return A Promise resolving into a Map of skeleton Ids to import info
     *         objects.
     */
    importInfo: function(projectId, skeletonIds, withTreenodes = false, api = undefined) {
      return CATMAID.fetch({
        url: project.id + '/skeletons/import-info',
        method: 'POST',
        data: {
          skeleton_ids: skeletonIds,
          with_treenodes: withTreenodes,
        },
        api: api,
        parallel: true,
      });
    },

    /**
     * Get completeness information of a set of skeleton IDs.
     *
     * @param projectId       {integer}   The project to work in.
     * @param skeletonIds     {integer[]} The skeletons to get completeness info on.
     * @param openEndsPercent {float}     (optional) The percentage of the
     *                                    allowed number of open ends a skeleton
     *                                    has to have to be considered complete.
     *                                    The default is 0.03 (3%).
     * @param minNodes        {integer}   (optional) The minimum number of nodes
     *                                    a skeleton has to have to be
     *                                    considered complete. The default is 500.
     * @param minNodes        {integer}   (optional) The minimum number of nodes
     *                                    a skeleton has to have to be
     *                                    considered complete. The deault is 0.
     * @param ignoreFragments {bollean}   (optonal) Whether fragments should be
     *                                    ignored, i.e. can't be complete. The
     *                                    default is True.
     * @return A Promise resolving into completeness information.
     */
    completeness: function(projectId, skeletonIds, openEndsPercent = 0.03,
        minNodes = 500, minCable = 0, ignoreFragments = true, parallel = false) {
      return CATMAID.fetch({
        url: project.id + '/skeletons/completeness',
        method:'POST',
        data: {
          skeleton_ids: skeletonIds,
          open_ends_percent: openEndsPercent,
          min_nodes: minNodes,
          min_cable: minCable,
          ignore_fragments: ignoreFragments,
        },
        parallel: parallel,
      });
    },

  };

  // Provide some basic events
  Skeletons.EVENT_SKELETON_DELETED = "skeleton_deleted";
  Skeletons.EVENT_SKELETON_CHANGED = "skeleton_changed";
  Skeletons.EVENT_SKELETON_SPLIT = "skeleton_split";
  Skeletons.EVENT_SKELETONS_JOINED = "skeletons_joined";
  Skeletons.EVENT_SKELETON_REROOTED = "skeleton_rerooted";
  CATMAID.asEventSource(Skeletons);

  // Export Skeleton namespace
  CATMAID.Skeletons = Skeletons;

  /**
   * A command that wraps splitting skeletons. For now, it will block undo.
   *
   * @param {State}   state      Neighborhood state for node
   * @param {integer} projectId  The project space to work in
   * @param {integer} treenodeId Treenode to split skeleton at
   * @param {object}  upstream_annot_map Map of annotation names vs annotator
   *                                     IDs for the upstream split part.
   * @param {object}  upstream_annot_map Map of annotation names vs annotator
   *                                     IDs for the downstream split part.
   * @param {API}     api         (optional) The CATMAID API to talk to.
   */
  CATMAID.SplitSkeletonCommand = CATMAID.makeCommand(
      function(state, projectId, treenodeId, upstream_annot_map, downstream_annot_map, api = undefined) {

    var exec = function(done, command, map) {
      var split = CATMAID.Skeletons.split(state,
          project.id, treenodeId, upstream_annot_map, downstream_annot_map,
          api);
      return split.then(function(result) {
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      throw new CATMAID.ValueError("Undo of skeleton splits is not allowed at the moment");
    };

    var title = "Split skeleton at treenode " + treenodeId;

    this.init(title, exec, undo);
  });

  /**
   * Join two skeletons by connecting two treenodes.
     *
     * @param {State}   state         Multi node state with both treenodes
     * @param {integer} projectId     The project space to work in
     * @param {integer} fromId        The skeleton that will be merged
     * @param {integer} toId          The skeleton that will get more nodes
     * @param {object}  annotationSet (Optional) Map of annotation name vs
     *                                annotator ID.
     * @param {string}  samplerHandling (optional) If one or both of the
     *                                  skeletons have samplers, a handling mode
     *                                  is needed. Either "create-intervals",
     *                                  "branch", "domain-end" or "new-domain".
     * @param {boolean} fromNameReference (optional) If enabled, the back-end
     *                                    will add a new annotation to the
     *                                    target neuron, that is a refernce to
     *                                    the merged in neuron. By default false.
     * @param {API}     api           (optional) The CATMAID API to talk to.
   */
  CATMAID.JoinSkeletonsCommand = CATMAID.makeCommand(
      function(state, projectId, fromId, toId, annotationSet, samplerHandling,
        fromNameReference, api = undefined) {

    var exec = function(done, command, map) {
      var join = CATMAID.Skeletons.join(state, project.id, fromId, toId,
          annotationSet, samplerHandling, fromNameReference, api);
      return join.then(function(result) {
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      throw new CATMAID.ValueError("Undo of skeleton joins is not allowed at the moment");
    };

    var title = "Join skeleton throuh treenode " + toId + " into " + fromId + ".";

    this.init(title, exec, undo);
  });

  /**
   * A command that wraps rerooting skeletons. For now, it will block undo.
   *
   * @param {State}   state      Neighborhood state for node
   * @param {integer} projectID  The project space to work in
   * @param {integer} treenodeID Treenode to reroot skeleton at
   */
  CATMAID.RerootSkeletonCommand = CATMAID.makeCommand(
      function(state, projectID, treenodeID) {

    var exec = function(done, command, map) {
      var reroot = CATMAID.Skeletons.reroot(state, projectID, treenodeID);
      return reroot.then(function(result) {
        done();
        return result;
      });
    };

    var undo = function(done, command, map) {
      throw new CATMAID.ValueError("Undo of skeleton rerooting is not allowed at the moment");
    };

    var title = "Reroot skeleton at treenode " + treenodeID;

    this.init(title, exec, undo);
  });

})(CATMAID);

