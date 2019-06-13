/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  var Similarity = {};

  /**
   * Test if the NBLAST environment is set up.
   */
  Similarity.testEnvironment = function(projectId) {
    return CATMAID.fetch(projectId + '/similarity/test-setup');
  };

  /**
   * Get a list of all similarity configurations in this project.
   *
   * @param projectId {integer} The project to operate in.
   *
   * @returns a promise that resolves in the list of configurations.
   */
  Similarity.listAllConfigs = function(projectId, simple) {
    return CATMAID.fetch(projectId + '/similarity/configs/', 'GET', {
      simple: !!simple
    });
  };

  /**
   * Get details on a particular similarity configuration.
   */
  Similarity.getConfig = function(projectId, configId) {
    return CATMAID.fetch(projectId + '/similarity/configs/' + configId + '/');
  };

  /**
   * Delete a similarity configuration.
   */
  Similarity.deleteConfig = function(projectId, configId) {
    return CATMAID.fetch(projectId + '/similarity/configs/' + configId + '/',
        'DELETE')
      .then(function(result) {
        CATMAID.Similarity.trigger(CATMAID.Similarity.EVENT_CONFIG_DELETED, configId);
        return result;
      });
  };

  /**
   * Add a new similarity configuration. The actual similarity matrix is
   * computed asynchronously.
   */
  Similarity.addConfig = function(projectId, name, matchingSkeletonIds,
      matchingPointSetIds, matchingPointcloudIds, randomSkeletonIds,
      numRandomNeurons, lengthRandomNeurons, minNodesRandomNeurons,
      distanceBreaks, dotBreaks, tangentNeighbors, matchingMeta, matchingSubset) {
    if ((!matchingSkeletonIds || matchingSkeletonIds.length === 0) &&
        (!matchingPointSetIds || matchingPointSetIds.length === 0) &&
        (!matchingPointcloudIds || matchingPointcloudIds.length === 0)) {
      return Promise.reject(new CATMAID.Warning("No matching skeletons, transformed skeletons or point clouds found"));
    }
    if (!randomSkeletonIds) {
      return Promise.reject(new CATMAID.Warning("No random set skeleton IDs found"));
    }

    let transmittedRandomSkeletonIds = randomSkeletonIds === 'backend' ?
        undefined : randomSkeletonIds;

    let params = {
      name: name,
      matching_skeleton_ids: matchingSkeletonIds,
      matching_pointset_ids: matchingPointSetIds,
      matching_pointcloud_ids: matchingPointcloudIds,
      matching_subset: matchingSubset ? JSON.stringify(matchingSubset) : undefined,
      matching_meta: matchingMeta,
      random_skeleton_ids: transmittedRandomSkeletonIds,
      distance_breaks: distanceBreaks,
      dot_breaks: dotBreaks,
      tangent_neighbors: tangentNeighbors,
    };
    if (randomSkeletonIds === 'backend') {
      params.n_random_skeletons = numRandomNeurons;
      params.min_length = lengthRandomNeurons;
      params.min_nodes = minNodesRandomNeurons;
    }

    return CATMAID.fetch(project.id + '/similarity/configs/', 'PUT', params)
      .then(function(result) {
        CATMAID.Similarity.trigger(CATMAID.Similarity.EVENT_CONFIG_ADDED, result);
        return result;
      });
  };

  /**
   * Queue recomputation of a similarity configuration.
   */
  Similarity.recomputeConfig = function(projectId, configId) {
    return CATMAID.fetch(projectId + '/similarity/configs/' + configId + '/recompute');
  };

  /**
   * Compute similarity between two sets of skeletons based on a particular
   * configuration.
   *
   * @param projectId  {Number}   The project to operate in.
   * @param configId   {Number}   NBLAST configuration to use.
   * @param queryIds   {Number[]} A list of query skeletons to compute
   *                              similarity for.
   * @param targetIds  {Number[]} A list of target object IDs to compare to,
   *                              can be skeleton IDs and point cloud IDs.
   * @param queryType  {String}   (optional) Type of query IDs, 'skeleton' or 'pointcloud'.
   * @param targetType {String}   (optional) Type of target IDs, 'skeleton' or 'pointcloud'.
   * @param name       {String}   The name of the query.
   * @param normaized  {String}   (optional) Whether scores should be left
   *                              untouched ('raw'), should be normalized by
   *                              self-match ('normalized') or replaced with
   *                              their normalized mean with the normalized
   *                              reverse score ('mean'). Default is 'mean'.
   * @param reverse    {Boolean}  (optional) Whether to score the similarity of
   *                              query and target object using the reverse
   *                              score (qury against target).  Default: false.
   * @param useAlpha   {Boolean}  (optional) Whether to consider local directions in the
   *                              similarity calulation. Default: false.
   * @param queryMeta  {Object}   (optional) Data that represents query objects in more detail.
   *                              Used with type 'transformed-skeleton' and maps skeleton IDs
   *                              to their transformed data.
   * @param targetMeta {Object}   (optional) Data that represents target objects in more detail.
   *                              Used with type 'transformed-skeleton' and maps skeleton IDs
   *                              to their transformed data.
   * @param removeTargetDuplicates {Boolean} (optional) Whether to remove all
   *                              target objects from a query that are also part
   *                              of the query. Default: true.
   * @param simplify   {Boolean}  (optional) Whether or not neurons should be
   *                              simplified by removing parts below a certain
   *                              branch level. Default: true.
   * @param requiredBranches {Integer} (optional) The number of branch levels to
   *                              keep when simplifying neurons.
   * @param useCache {Boolean}    (optional) If the back-end is allowed to use
   *                              cached data for computing the similarity.
   *
   * @returns {Promise} Resolves once the similarity query is queued.
   */
  Similarity.computeSimilarity = function(projectId, configId, queryIds,
      targetIds, queryType, targetType, name, normalized, reverse, useAlpha,
      queryMeta, targetMeta, removeTargetDuplicates, simplify, requiredBranches,
      useCache, topN = 0) {
    return CATMAID.fetch(projectId + '/similarity/queries/similarity', 'POST', {
      'query_ids': queryIds,
      'target_ids': targetIds,
      'query_type_id': queryType,
      'target_type_id': targetType,
      'config_id': configId,
      'query_meta': queryMeta,
      'target_meta': targetMeta,
      'name': name,
      'normalized': normalized,
      'reverse': reverse,
      'use_alpha': useAlpha,
      'remove_target_duplicates': removeTargetDuplicates,
      'simplify': simplify,
      'required_branches': requiredBranches,
      'use_cache': useCache,
      'top_n': topN,
    });
  };

  /**
   * Queue recomputation of a similarity configuration.
   */
  Similarity.recomputeSimilarity = function(projectId, similarityId, simplify, requiredBranches, useCache) {
    return CATMAID.fetch(projectId + '/similarity/queries/' + similarityId + '/recompute', 'GET', {
      'simplify': simplify,
      'required_branches': requiredBranches,
      'use_cache': useCache,
    });
  };

  /**
   * Get a specific similarity query result.
   *
   * @param projectId    {Integer} The project to operate in.
   * @param similarityId {Integer} The similarity object to retrieve.
   * @param withObjects  {Boolean} (optional) Whether to include query and target
   *                               object IDs in response, default is false.
   * @param withScoring  {Boolean} (optional) Whether to include scoring
   *                               information in response, default is false.
   */
  Similarity.getSimilarity = function(projectId, similarityId, withObjects=false, withScoring=false) {
    return CATMAID.fetch(projectId + '/similarity/queries/' + similarityId + '/', 'GET', {
      'with_objects': withObjects,
      'with_scoring': withScoring,
    });
  };

  /**
   * Get a list of all similarity tasks in this project.
   *
   * @param projectId   {integer} The project to operate in.
   * @param configId    {integer} (optional) ID of config the similarities are linked to.
   * @param withObjects {Boolean} (optional) Whether to include query and target
   *                              object IDs in response, default is false.
   * @param withScoring {Boolean} (optional) Whether to include scoring
   *                              information in response, default is false.
   *
   * @returns a promise that resolves in the list of similarities.
   */
  Similarity.listAllSkeletonSimilarities = function(projectId, configId, withObjects=false, withScoring=false) {
    return CATMAID.fetch(projectId + '/similarity/queries/', 'GET', {
      configId: configId,
      with_objects: withObjects,
      with_scoring: withScoring,
    });
  };

  /**
   * Delete a particular skeleton similarity task.
   */
  Similarity.deleteSimilarity = function(projectId, similarityId) {
    return CATMAID.fetch(projectId + '/similarity/queries/' + similarityId + '/',
        'DELETE')
      .then(function(result) {
        CATMAID.Similarity.trigger(CATMAID.Similarity.EVENT_SIMILARITY_DELETED, similarityId);
        return result;
      });
  };

  Similarity.getReferencedSkeletonModels = function(similarity) {
    let targetModels = {};
    if (similarity.target_type === 'skeleton') {
      if (similarity.target_objects) {
        similarity.target_objects.reduce(function(o, to) {
          o[to] = new CATMAID.SkeletonModel(to);
          return o;
        }, targetModels);
      }
    }
    if (similarity.query_type === 'skeleton') {
      if (similarity.query_objects) {
        similarity.query_objects.reduce(function(o, to) {
          o[to] = new CATMAID.SkeletonModel(to);
          return o;
        }, targetModels);
      }
    }
    return targetModels;
  };

  Similarity.defaultDistanceBreaks = [0, 0.75, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7,
      8, 9, 10, 12, 14, 16, 20, 25, 30, 40, 500];
  Similarity.defaultDotBreaks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

  Similarity.objectTypeToString = function(objectType) {
    if (objectType === 'skeleton') { return 'skeleton'; }
    else if (objectType === 'pointcloud') { return 'point cloud'; }
    else if (objectType === 'pointset') { return 'transformed skeleton'; }
    return 'unknown object';
  };


  // Events
  Similarity.EVENT_CONFIG_ADDED = "similarity_config_added";
  Similarity.EVENT_CONFIG_DELETED = "similarity_config_deleted";
  CATMAID.asEventSource(Similarity);


  // Export into namespace
  CATMAID.Similarity = Similarity;

})(CATMAID);

