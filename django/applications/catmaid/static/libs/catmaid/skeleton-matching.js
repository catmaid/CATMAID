(function(CATMAID) {

  "use strict";

  let SkeletonMatching = {};

  SkeletonMatching.combineGroups = function(groups) {
    let target = new Map();
    for (let group of groups) {
      for (let [k,v] of group.entries()) {
        target.set(k, v);
      }
    }
    return target;
  };

  SkeletonMatching.extractSubGroupSets = function(source, target = new Map()) {
    return Array.from(source.keys()).reduce((t,g) => {
              let subgroups = source.get(g);
              for (let [sg, aid] of subgroups.entries()) {
                if (!t.has(sg)) {
                  t.set(sg, new Set());
                }
                t.get(sg).add(aid);
              }
              return t;
            }, target);
  };

  SkeletonMatching.getSkeletonsMetaAnnotatedWith = function(projectId,
      subGroupMap, annotationMap, metaAnnotation) {
    return CATMAID.Skeletons.byAnnotation(projectId, [metaAnnotation], true)
      .then(skeletons => {
        let t = new Set();
        let resultSkeletonIds = new Set(skeletons);
        // Add each matched sub group skeleton ID to the matched set.
        for (let [annotation, subgroups] of subGroupMap) {
          for (let [subgroup, annotationId] of subgroups) {
            let skeletonIds = annotationMap.get(annotationId);
            for (let skeletonId of skeletonIds) {
              if (resultSkeletonIds.has(skeletonId)) {
                t.add(skeletonId);
              }
            }
          }
        }
        return t;
      });
  };

  SkeletonMatching.createMatchReport = function(projectId, subGroupMap,
      annotationMap, pairingMetaTargetMap) {
    return Promise.resolve()
      .then(() => {
        return {
          matchedContraPairs: SkeletonMatching.createMatchedPairs(
              subGroupMap, annotationMap, pairingMetaTargetMap),
          allIpsiPairs: SkeletonMatching.createSameSubGroupPairs(
              subGroupMap, annotationMap),
          unmatchedControPairs: SkeletonMatching.createUnmatchedInterSubGroupPairs(
              subGroupMap, annotationMap, pairingMetaTargetMap),
        };
      });
  };

  /**
   * Take all neurons that are grouped by the annotation configuration in the
   * first tab (active neurons). Depending on the widget setting, these are
   * typically only completed neurons. This function finds pairs of neurons from
   * different sub-groups of a group. To match, both neurons need to share a
   * annotation. This can be any annotation, as long as it is annotated with a
   * passed in meta-annotation.
   *
   * For each sub-group we compte a mapping from shared annotation to the
   * skeletons matched from a particular group. Unmatched skeleton IDs are
   * returned in a separate list.
   *
   * The goal is to compute three kinds of sets of skeleton pairs. The first one
   * combines all matched skeletons between two sub-groups in all combination as
   * long as both groups are involved.
   */
  SkeletonMatching.createMatchedPairs = function(subGroupMap, annotationMap,
      pairingMetaTargetMap) {
    let pairs = [];

    // For each group, for each sub-group
    // Make a match report, which maps annotations to lsts of skeletons
    for (let [g, sgNameMap] of subGroupMap) {
      let sgAnnotationIds = sgNameMap.values();
      // For each group, find inter-sub-group skeleton pairs.
      let interSGs = Array.from(sgAnnotationIds).reduce((l, e) => {
        // Sub-group skeletons
        let skeletonIds = Array.from(annotationMap.get(e));

        for (let other of l.existingSets) {
          for (let otherSkeletonId of other) {
            let otherPairingAnnotations = pairingMetaTargetMap.get(otherSkeletonId);
            if (!otherPairingAnnotations) continue;

            for (let skeletonId of skeletonIds) {
              let pairingAnnotations = pairingMetaTargetMap.get(skeletonId);
              if (!pairingAnnotations) continue;

              // Check if both skeletons share an annotation and if this
              // annotation is part of the matchingAnnotationSet.
              let sharedAwnotations = otherPairingAnnotations.intersection(pairingAnnotations);
              if (sharedAwnotations.size > 0) {
                l.pairs.push([skeletonId, otherSkeletonId]);
              }
            }
          }
        }

        // Remember this skeleton set
        l.existingSets.push(skeletonIds);

        return l;
      }, {
        existingSets: [],
        pairs: pairs,
      });
    }

    return pairs;
  };

  SkeletonMatching.createSameSubGroupPairs = function(subGroupMap, annotationMap) {
    let pairs = [];

    // For each group, for each sub-group
    // Make a match report, which maps annotations to lsts of skeletons
    for (let [g, sgNameMap] of subGroupMap.entries()) {
      let sgAnnotationIds = sgNameMap.values();
      // For each group, find inter-sub-group skeleton pairs.
      let interSGs = Array.from(sgAnnotationIds).reduce((l, e) => {
        // Sub-group skeletons
        let skeletonIds = Array.from(annotationMap.get(e));
        for (let i=0; i<skeletonIds.length; ++i) {
          for (let j=i; j<skeletonIds.length; ++j) {
            let skeletonId1 = skeletonIds[i];
            let skeletonId2 = skeletonIds[j];
            l.push([skeletonId1, skeletonId2]);
          }
        }
        return l;
      }, pairs);
    }

    return pairs;
  };

  SkeletonMatching.createUnmatchedInterSubGroupPairs = function(subGroupMap,
      annotationMap, pairingMetaTargetMap) {
    let pairs = [];

    // For each group, for each sub-group
    // Make a match report, which maps annotations to lsts of skeletons
    for (let [g, sgNameMap] of subGroupMap.entries()) {
      let sgAnnotationIds = sgNameMap.values();
      // For each group, find inter-sub-group skeleton pairs.
      let interSGs = Array.from(sgAnnotationIds).reduce((l, e) => {
        // Sub-group skeletons
        let skeletonIds = Array.from(annotationMap.get(e));
        for (let other of l.existingSets) {
          for (let otherSkeletonId of other) {
            let otherPairingAnnotations = pairingMetaTargetMap.get(otherSkeletonId);
            if (otherPairingAnnotations) {
              // If a skeleton is matched, pair it with unmatched local ones.
              for (let skeletonId of skeletonIds) {
                let pairingAnnotations = pairingMetaTargetMap.get(skeletonId);
                if (pairingAnnotations) continue;
                l.pairs.push([skeletonId, otherSkeletonId]);
              }
            } else {
              // If a skeleton is unmatched, pair it with matched local ones.
              for (let skeletonId of skeletonIds) {
                let pairingAnnotations = pairingMetaTargetMap.get(skeletonId);
                if (!pairingAnnotations) continue;
                l.pairs.push([skeletonId, otherSkeletonId]);
              }
            }
          }
        }

        // Remember this skeleton set
        l.existingSets.push(skeletonIds);

        return l;
      }, {
        existingSets: [],
        pairs: pairs,
      });
    }

    return pairs;
  };

  // Export into namespace
  CATMAID.SkeletonMatching = SkeletonMatching;

})(CATMAID);
