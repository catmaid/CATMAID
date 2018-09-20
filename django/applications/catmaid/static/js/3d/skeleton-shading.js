/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Create a new shader based material to have active node focused shading.
   */
  var makeNearActiveNodeSplitMaterial = function(baseMaterial, cameraSpace,
      activeNodeDistance, bufferGeometry) {

    var vertexDeclarations = 'uniform vec3 u_activeNodePosition;\n' +
        'uniform float u_horizon;\n' +
        'varying float activeNodeDistanceDarkening;\n';
    var fragmentDeclarations = 'varying float activeNodeDistanceDarkening;\n';

    if (bufferGeometry) {
      var material =  new THREE.LineMaterial({
        color: baseMaterial.color,
        opacity: baseMaterial.opacity,
        linewidth: baseMaterial.uniforms.linewidth.value,
        resolution: new THREE.Vector2(baseMaterial.uniforms.resolution.value.x,
            baseMaterial.uniforms.resolution.value.y),
      });
      var vertexPosition = (cameraSpace ?
          'vec3 camVert = (vec4(instanceStart, 1.0) * modelMatrix).xyz - cameraPosition;\n' +
          'vec3 camAtn = (vec4(u_activeNodePosition, 1.0) * modelMatrix).xyz - cameraPosition;\n' +
          'float zDist = distance(dot(camVert, normalize(camAtn)), length(camAtn));\n'
          :
          'float zDist = distance(instanceStart.z, u_activeNodePosition.z);\n') +
          'activeNodeDistanceDarkening = 1.0 - clamp(zDist/u_horizon, 0.0, 1.0);\n';
      var fragmentColor = 'gl_FragColor = vec4(diffuseColor.rgb * activeNodeDistanceDarkening, diffuseColor.a);\n';
      var newVertexShader = CATMAID.insertSnippetIntoShader(material.vertexShader,
          CATMAID.PickingLineMaterial.INSERTION_LOCATIONS['vertexDeclarations'],
          vertexDeclarations);
      newVertexShader = CATMAID.insertSnippetIntoShader(newVertexShader,
          CATMAID.PickingLineMaterial.INSERTION_LOCATIONS['vertexEnd'],
          vertexPosition);
      var newFragmentShader = CATMAID.insertSnippetIntoShader(material.fragmentShader,
          CATMAID.PickingLineMaterial.INSERTION_LOCATIONS['fragmentDeclarations'],
          fragmentDeclarations);
      newFragmentShader = CATMAID.insertSnippetIntoShader(newFragmentShader,
          CATMAID.PickingLineMaterial.INSERTION_LOCATIONS['fragmentColor'],
          fragmentColor);

      material.vertexShader = newVertexShader;
      material.fragmentShader = newFragmentShader;
      material.needsUpdate = true;

      $.extend(material.uniforms, {
          u_activeNodePosition: { type: 'v3', value: SkeletonAnnotations.getActiveNodeProjectVector3() },
          u_horizon: { type: 'f', value: activeNodeDistance }});

      return material;
    } else {
      var vertexPosition = (cameraSpace ?
          'vec3 camVert = (vec4(position, 1.0) * modelMatrix).xyz - cameraPosition;\n' +
          'vec3 camAtn = (vec4(u_activeNodePosition, 1.0) * modelMatrix).xyz - cameraPosition;\n' +
          'float zDist = distance(dot(camVert, normalize(camAtn)), length(camAtn));\n'
          :
          'float zDist = distance(position.z, u_activeNodePosition.z);\n') +
          'activeNodeDistanceDarkening = 1.0 - clamp(zDist/u_horizon, 0.0, 1.0);\n';
      var fragmentColor = 'gl_FragColor = vec4(outgoingLight * activeNodeDistanceDarkening, diffuseColor.a);\n';
      var material = new CATMAID.ShaderLineBasicMaterial(baseMaterial);

      // Determine active node distance in the vertex shader and pass to the
      // fragment shader as a varying.
      material.insertSnippet('vertexDeclarations', vertexDeclarations);
      material.insertSnippet('vertexPosition', vertexPosition);

      material.insertSnippet('fragmentDeclarations', fragmentDeclarations);
      material.insertSnippet('fragmentColor', fragmentColor);

      material.addUniforms({
          u_activeNodePosition: { type: 'v3', value: SkeletonAnnotations.getActiveNodeProjectVector3() },
          u_horizon: { type: 'f', value: activeNodeDistance }});

      material.refresh();

      return material;
    }
  };

  /**
   * Find maximum value in object, regardless of the key it is mapped to. Every
   * value is then divided by this maximum to normalize all values.
   */
  var normalizeFields = function(obj) {
    var fields = Object.keys(obj),
        max = fields.reduce(function(a, field) {
          return Math.max(a, obj[field]);
        }, 0);

    // Normalize c in place
    fields.forEach(function(field) {
      obj[field] = obj[field] / max;
    });

    return obj;
  };

  /**
   * Return a Promise that resolves once all reviews for all input skeletons are
   * retrieved and stored in each skeleton's 'reviews' field.
   */
  var initReviews = function(skeletons) {
    // Find the subset of skeletons that don't have their reviews loaded
    var skeleton_ids = Object.keys(skeletons).filter(function(skid) {
      return !skeletons[skid].reviews;
    });
    // Will invoke fnRecolor even if the list of skeleton_ids is empty
    return new Promise(function(resolve, reject) {
      fetchSkeletons(
          skeleton_ids,
          function(skeleton_id) {
            return CATMAID.makeURL(project.id + '/skeleton/' + skeleton_id + '/reviewed-nodes');
          },
          function(skeleton_id) { return {}; }, // post
          function(skeleton_id, json) {
            skeletons[skeleton_id].reviews = json;
          },
          function(skeleton_id) {
            // Failed loading
            skeletons[skeleton_id].reviews = {}; // dummy
            console.log('ERROR: failed to load reviews for skeleton ' + skeleton_id);
          },
          resolve);
    });
  };

  /**
   * Return a promise that resolves if all axons of all input skeletons are
   * loaded and stored in each skeleton's 'axon' field.
   */
  var initAxons = function(skeletons) {
    // Find the subset of skeletons that don't have their axon loaded
    var skeleton_ids = Object.keys(skeletons).filter(function(skid) {
      return !skeletons[skid].axon;
    });
    return new Promise(function(resolve, reject) {
    fetchSkeletons(
        skeleton_ids,
        function(skid) {
          return CATMAID.makeURL(project.id + '/' + skid + '/0/1/0/compact-arbor');
        },
        function(skid) { return {}; }, // post
        function(skid, json) {
          skeletons[skid].axon = skeletons[skid].splitByFlowCentrality(json);
        },
        function(skid) {
          // Failed loading
          skeletons[skid].axon = null;
          console.log('ERROR: failed to load axon-and-dendrite for skeleton ' + skid);
        },
        resolve);
    });
  };

  /**
   * Return a promise that resolves once all sampler domains for all input
   * skeletons are loaded and stored in each skeleton's 'samplers' field.
   */
  var initSamplerDomains = function(skeletons, with_intervals) {
    // Find the subset of skeletons that don't have their sampler domains loaded
    var skeletonIds = Object.keys(skeletons).filter(function(skid) {
      let samplers = skeletons[skid].samplers;
      if (!samplers) {
        return true;
      }
      if (with_intervals) {
        for (let s=0, smax=samplers.length; s<smax; ++s) {
          let sampler = samplers[s];
          for (let d=0, dmax=sampler.domains.length; d<dmax; ++d) {
            let domain = sampler.domains[d];
            if (domain.intervals === undefined) {
              return true;
            }
          }
        }
      }
      return false;
    });

    if (skeletonIds.length === 0) {
      return Promise.resolve();
    }

    var params = {
      "skeleton_ids": skeletonIds,
      "with_domains": true,
      "with_intervals": !!with_intervals
    };
    return CATMAID.fetch(project.id +  "/samplers/", "GET", params)
      .then(function(samplers) {
        // Group by skeleton IDs
        var skeletonSamplers = samplers.reduce(function(o, s) {
          var domains = o[s.skeleton_id];
          if (!domains) {
            domains = [];
            o[s.skeleton_id] = domains;
          }
          domains.push(s);
          return o;
        }, {});

        for (var skeletonId in skeletonSamplers) {
          skeletons[skeletonId].setSamplers(skeletonSamplers[skeletonId]);
        }
      });
  };

  var initSamplerIntervals = function(skeleton) {
    return initSamplerDomains(skeleton, true);
  };

  /**
   * Skeleton color method objects are expected to have a vertexColorizer
   * function that returns a per-vertex coloring function. This inner function
   * is expected to return a color for each input vertex. If a prepare method is
   * provided, it is expected to return a Promise that resolves once preparation
   * is done.
   */
  CATMAID.SkeletonColorMethods = {
    'none': {
      vertexColorizer: null
    },
    'actor-color': {
      vertexColorizer: function(skeleton) {
        var actorColor = skeleton.actorColor;
        return function(vertex) {
          return actorColor;
        };
      }
    },
    'axon-and-dendrite': {
      prepare: initAxons,
      vertexColorizer: function(skeleton, options) {
        var axonColor = options.axonColor;
        var dendriteColor = options.dendriteColor;
        var notComputableColor = options.notComputableColor;

        return skeleton.axon ?
          (function(vertex) {
            return this.contains(vertex.node_id) ? axonColor : dendriteColor;
          }).bind(skeleton.axon)
          : function() { return notComputableColor; };
      }
    },
    'last-reviewed': {
      prepare: initReviews,
      vertexColorizer: function(skeleton, options) {
          var findLastReview = function(lastReview, review) {
            if (!lastReview) {
              return review;
            } else if (new Date(lastReview[1]) < new Date(review[1])) {
              return review;
            }
            return lastReview;
          };
          var users = CATMAID.User.all();
          var lastReviewerColor = options.lastReviewerColor;
          var unreviewedColor = options.unreviewedColor;
          var notComputableColor = options.notComputableColor;

          return skeleton.reviews ?
            (function(vertex) {
              var reviewers = this.reviews[vertex.node_id];
              if (reviewers) {
                var lastReviewer = reviewers.reduce(findLastReview, null);
                var lastReviewerId = lastReviewer[0];
                var lastReviewerColor = users[lastReviewerId].color;

                if (!skeleton.space.userColormap.hasOwnProperty(lastReviewerId)) {
                  skeleton.space.userColormap[lastReviewerId] = lastReviewerColor;
                }

                return lastReviewerColor;
              } else {
                return unreviewedColor;
              }
            }).bind(skeleton)
            : function() { return notComputableColor; };
        }
    },
    'own-reviewed': {
      prepare: initReviews,
      vertexColorizer: function(skeleton, options) {
        var userId = CATMAID.session.userid;
        var reviewedColor = options.reviewedColor;
        var unreviewedColor = options.unreviewedColor;
        var notComputableColor = options.notComputableColor;

        return skeleton.reviews ?
          (function(vertex) {
            var reviewers = this.reviews[vertex.node_id];
          return reviewers && reviewers.some(function (r) { return r[0] == userId;}) ?
            reviewedColor : unreviewedColor;
        }).bind(skeleton)
          : function() { return notComputableColor; };
      }
    },
    'whitelist-reviewed': {
      prepare: initReviews,
      vertexColorizer: function(skeleton, options) {
        var reviewedColor = options.reviewedColor;
        var unreviewedColor = options.unreviewedColor;
        var notComputableColor = options.notComputableColor;

        return skeleton.reviews ?
          (function(vertex) {
            var wl = CATMAID.ReviewSystem.Whitelist.getWhitelist();
            var reviewers = this.reviews[vertex.node_id];
          return reviewers && reviewers.some(function (r) {
              return r[0] in wl && (new Date(r[1])) > wl[r[0]];}) ?
            reviewedColor : unreviewedColor;
        }).bind(skeleton)
          : function() { return notComputableColor; };
      }
    },
    'all-reviewed': {
      prepare: initReviews,
      vertexColorizer: function(skeleton, options) {
        var reviewedColor = options.reviewedColor;
        var unreviewedColor = options.unreviewedColor;
        var notComputableColor = options.notComputableColor;

        return skeleton.reviews ?
          (function(vertex) {
            var reviewers = this.reviews[vertex.node_id];
            return reviewers && reviewers.length > 0 ?
              reviewedColor : unreviewedColor;
          }).bind(skeleton)
          : function() { return notComputableColor; };
      }
    },
    'creator': {
      vertexColorizer: function(skeleton, options) {
        var userColor = function (userID) { return CATMAID.User(userID).color; };

        return (function (vertex) {
          var userID = vertex.user_id;
          if (!this.space.userColormap.hasOwnProperty(userID)) {
            this.space.userColormap[userID] = userColor(userID);
          }

          return this.space.userColormap[userID];
        }).bind(skeleton);
      }
    },
    'creator-relevant': {
      vertexColorizer: function(skeleton, options) {
        var space = skeleton.space;
        if (!space.userColormap.colorizer) {
          space.userColormap.colorizer = {};
          CATMAID.asColorizer(space.userColormap.colorizer);
        }
        var colorizer = space.userColormap.colorizer;
        var userColor = colorizer.pickColor.bind(colorizer);

        return (function (vertex) {
          var userID = vertex.user_id;
          if (!this.space.userColormap.hasOwnProperty(userID)) {
            this.space.userColormap[userID] = userColor(userID);
          }

          return this.space.userColormap[userID];
        }).bind(skeleton);
      }
    },
    'sampler-domains': {
      prepare: initSamplerDomains,
      vertexColorizer: function(skeleton, options) {
        var notComputableColor = options.notComputableColor;
        var arbor = skeleton.createArbor();
        var samplers = skeleton.samplers;
        if (!samplers) {
          // Without samplers, there is no color computable
          return function(vertex) { return notComputableColor; };
        }

        var colorScheme = 'Spectral';
        var colorizer = colorbrewer[colorScheme];
        if (!colorizer) {
          throw new CATMAID.ValueError('Couldn\'t find color scheme "' + colorScheme + '"');
        }
        var nColors = 11;
        var colorSet = colorizer[11];
        if (!colorSet) {
          throw new CATMAID.ValueError('Couldn\'t find color set ' + nColors + ' for color scheme "' + colorScheme +'"');
        }
        colorSet = colorSet.map(function(rgb) {
          return new THREE.Color(rgb);
        });

        var nAddedDomains = 0;
        var nSamplers = samplers.length;
        var domainColorIndex = new Map();
        var nodeDomains = new Map();
        for (var i=0; i<nSamplers; ++i) {
          var sampler = samplers[i];
          var domains = sampler.domains;
          var nDomains = domains.length;
          for (var j=0; j<nDomains; ++j) {
            var domain = domains[j];
            var allowedDomainIds = options.viewerOptions.allowed_sampler_domain_ids;

            // Ignore domain, if a domain filter exists and this domain isn't
            // allowed.
            if (allowedDomainIds && allowedDomainIds > 0 &&
                allowedDomainIds.indexOf(domain.id) === -1) {
              continue;
            }

            domainColorIndex.set(domain.id, nAddedDomains % nColors);
            ++nAddedDomains;

            // Build arbors for domains
            var domainArbor = CATMAID.Sampling.domainArborFromModel(arbor, domain);
            // Build index for each node of each domain to which domain they
            // belong. If a node belongs to multiple domains, the last one wins.
            var domainNodes = domainArbor.nodesArray();
            for (var k=0, kMax=domainNodes.length; k<kMax; ++k) {
              nodeDomains.set(parseInt(domainNodes[k], 10), domain.id);
            }
          }
        }

        return function(vertex) {
          // Find domain this vertex is part of
          var domainId = nodeDomains.get(vertex.node_id);
          if (domainId === undefined) {
            return notComputableColor;
          } else {
            return colorSet[domainColorIndex.get(domainId)];
          }
        };
      }
    },
    'binary-sampler-intervals': {
      prepare: initSamplerIntervals,
      vertexColorizer: function(skeleton, options) {
        options.multicolor = false;
        return makeSamplerIntervalColorizer(skeleton, options);
      }
    },
    'multicolor-sampler-intervals': {
      prepare: initSamplerIntervals,
      vertexColorizer: function(skeleton, options) {
        options.multicolor = true;
        return makeSamplerIntervalColorizer(skeleton, options);
      }
    },
    'x-lut': {
      vertexColorizer: function(skeleton, options) {
        let lutResolution = options.lutResolution || 256;
        let lut = new THREE.Lut(options.colorMap || "rainbow", lutResolution);
        let xOffset = options.xOffset || 0;
        let xDim = options.xDim || 0;
        lut.setMin(xOffset);
        lut.setMax(xDim + xOffset);
        return function(vertex) {
          return lut.getColor(vertex.x);
        };
      }
    },
    'y-lut': {
      vertexColorizer: function(skeleton, options) {
        let lutResolution = options.lutResolution || 256;
        let lut = new THREE.Lut(options.colorMap || "rainbow", lutResolution);
        let yOffset = options.yOffset || 0;
        let yDim = options.yDim || 0;
        lut.setMin(yOffset);
        lut.setMax(yDim + yOffset);
        return function(vertex) {
          return lut.getColor(vertex.y);
        };
      }
    },
    'z-lut': {
      vertexColorizer: function(skeleton, options) {
        let lutResolution = options.lutResolution || 256;
        let lut = new THREE.Lut(options.colorMap || "rainbow", lutResolution);
        let zOffset = options.zOffset || 0;
        let zDim = options.zDim || 0;
        lut.setMin(zOffset);
        lut.setMax(zDim + zOffset);
        return function(vertex) {
          return lut.getColor(vertex.z);
        };
      }
    },
    'skeleton-x-lut': {
      vertexColorizer: function(skeleton, options) {
        let lutResolution = options.lutResolution || 256;
        let lut = new THREE.Lut(options.colorMap || "rainbow", lutResolution);
        let bb = skeleton.getBoundingBox();
        lut.setMin(bb.min.x);
        lut.setMax(bb.max.x);
        return function(vertex) {
          return lut.getColor(vertex.x);
        };
      }
    },
    'skeleton-y-lut': {
      vertexColorizer: function(skeleton, options) {
        let lutResolution = options.lutResolution || 256;
        let lut = new THREE.Lut(options.colorMap || "rainbow", lutResolution);
        let bb = skeleton.getBoundingBox();
        lut.setMin(bb.min.y);
        lut.setMax(bb.max.y);
        return function(vertex) {
          return lut.getColor(vertex.y);
        };
      }
    },
    'skeleton-z-lut': {
      vertexColorizer: function(skeleton, options) {
        let lutResolution = options.lutResolution || 256;
        let lut = new THREE.Lut(options.colorMap || "rainbow", lutResolution);
        let bb = skeleton.getBoundingBox();
        lut.setMin(bb.min.z);
        lut.setMax(bb.max.z);
        return function(vertex) {
          return lut.getColor(vertex.z);
        };
      }
    },
  };

  let makeSamplerIntervalColorizer = function(skeleton, options) {
    var notComputableColor = options.notComputableColor;
    var arbor = skeleton.createArbor();
    var positions = skeleton.getPositions();
    var samplers = skeleton.samplers;
    if (!samplers) {
      // Without samplers, there is no color computable
      return function(vertex) { return notComputableColor; };
    }

    var nAddedDomains = 0;
    var nSamplers = samplers.length;
    var intervalMap = {};
    for (var i=0; i<nSamplers; ++i) {
      var sampler = samplers[i];
      var domains = sampler.domains;
      var nDomains = domains.length;
      for (var j=0; j<nDomains; ++j) {
        // Get intervals for domain
        let domain = domains[j];

        // Skip this domain if the user set 'allowed_sampler_domains'
        if (options.viewerOptions.allowed_sampler_domain_ids &&
            options.viewerOptions.allowed_sampler_domain_ids.length > 0 &&
            options.viewerOptions.allowed_sampler_domain_ids.indexOf(domain.id) === -1) {
          continue;
        }

        if (!domain.intervals || domain.intervals.length === 0) {
          let addedIntervals = CATMAID.Sampling.intervalsFromModels(
              arbor, positions, domain, sampler.interval_length,
              sampler.interval_error, true, sampler.create_interval_boundaries,
              sampler.leaf_segment_handling, true, intervalMap, undefined,
              sampler.merge_limit);
          let mockIntervals = addedIntervals.intervals.map(function(ai, i) {
            // use the negative index as ID for now. There should not be
            // any collissions.
            return [-1 * i, parseInt(ai[0], 10), parseInt(ai[1], 10), null];
          });
          CATMAID.Sampling.updateIntervalMap(arbor, mockIntervals, intervalMap, domain.start_node_id);
        } else if (intervalMap) {
          // Update interval map with existing intervals
          CATMAID.Sampling.updateIntervalMap(arbor, domain.intervals,
              intervalMap, domain.start_node_id,
              options.viewerOptions.allowed_sampler_interval_ids);
        }
      }
    }

    let getColor;
    if (options.multicolor) {
      var colorScheme = 'Spectral';
      var colorizer = colorbrewer[colorScheme];
      if (!colorizer) {
        throw new CATMAID.ValueError('Couldn\'t find color scheme "' + colorScheme + '"');
      }
      var nColors = 11;
      var colorSet = colorizer[11];
      if (!colorSet) {
        throw new CATMAID.ValueError('Couldn\'t find color set ' + nColors + ' for color scheme "' + colorScheme +'"');
      }
      colorSet = colorSet.map(function(rgb) {
        return new THREE.Color(rgb);
      });

      getColor= function(intervalId, nodeId) {
        let intervalColorIndex = Math.abs(parseInt(intervalId, 10) % nColors);
        return colorSet[intervalColorIndex];
      };
    } else {
      let colorMap = new Map();
      let evenColor = new THREE.Color(0x1f96ff);
      let oddColor = new THREE.Color(0xff711f);
      // Walk all domains
      for (var i=0; i<nSamplers; ++i) {
        let sampler = samplers[i];
        let domains = sampler.domains;
        let nDomains = domains.length;
        for (var j=0; j<nDomains; ++j) {
          let domain = domains[j];
          let allowedDomainIds = options.viewerOptions.allowed_sampler_domain_ids;

          // Skip this domain if the user set 'allowed_sampler_domains'
          if (allowedDomainIds &&
              allowedDomainIds.length > 0 &&
              allowedDomainIds.indexOf(domain.id) === -1) {
            continue;
          }

          // Get domain arbor
          let domainArbor = CATMAID.Sampling.domainArborFromModel(arbor, domain);
          let successors = domainArbor.allSuccessors();
          let workingSet = [domain.start_node_id];
          let workingSetIntervalStart = [true];
          let nextColor = evenColor;
          while (workingSet.length > 0) {
            let currentNodeId = workingSet.shift();
            let isIntervalStart = workingSetIntervalStart.shift();

            let intervalId = intervalMap[currentNodeId];
            let isInInterval = intervalId !== undefined && intervalId !== null;
            let intervalColor;
            if (isInInterval) {
                intervalColor = colorMap.get(intervalId);
                if (!intervalColor) {
                  intervalColor = nextColor;
                  colorMap.set(intervalId, intervalColor);
                }
            }

            // Check all successors of current reference node if they are part
            // of an interval that is different from the current one. If so,
            // assign the picked color for that interval already.
            let succ = successors[currentNodeId];
            if (succ && succ.length > 0) {
              nextColor = intervalColor === evenColor ? oddColor : evenColor;
              for (let k=0; k<succ.length; ++k) {
                let succId = succ[k];

                workingSet.push(succId);

                // If the successor node is part of a new interval, pre-assign
                // color.
                let succIntervalId = intervalMap[succId];
                if (succIntervalId !== undefined && succIntervalId !== intervalId) {
                  // All branches start at same node. If there are branches
                  // (more than one successor interval), color them all the
                  // same.
                  if (isIntervalStart && succ.length > 1) {
                    colorMap.set(succIntervalId, intervalColor);
                  } else {
                    colorMap.set(succIntervalId, nextColor);
                  }
                  workingSetIntervalStart.push(true);
                } else {
                  workingSetIntervalStart.push(false);
                }
              }
            }
          }
        }
      }

      getColor = function(intervalId, nodeId) {
        let color = colorMap.get(intervalId);
        return color === undefined ? notComputableColor : color;
      };
    }

    return function(vertex) {
      // Find domain this vertex is part of
      var intervalId = intervalMap[vertex.node_id];
      if (intervalId === undefined) {
        return notComputableColor;
      } else {
        return getColor(intervalId, vertex.node_id);
      }
    };
  };

  /**
   * Skeleton shading methods are objects mapped to an identifier. These objects
   * can have a prepare field, containing a function that can perform
   * asynchronous preparation and is expected to return a Promise. The actual
   * work is done in the weight() functions, which take a skeleton and option
   * object and return a weight mapping of all skeleton nodes into [0,1] or
   * null.
   */
  CATMAID.SkeletonShadingMethods = {
    'none': {
      weights: function() { return null; }
    },
    'dendritic-backbone': {
      prepare: initAxons,
      weights: function(skeleton, options) {
        var strahlerCut = options.strahler_cut;
        var node_weights = {};

        if (!skeleton.axon) {
          // Not computable
          CATMAID.warn("Shading 'dendritic-backbone' not computable for skeleton ID #" +
          skeleton.id + ", neuron named: " + CATMAID.NeuronNameService.getInstance().getName(skeleton.id) +
          ". The axon is missing.");
        } else {
          var arbor = skeleton.createArbor();
          // Prune artifactual branches
          if (skeleton.tags['not a branch']) {
            var ap = new CATMAID.ArborParser(); ap.inputs = {}; ap.outputs = {};
            ap.arbor = arbor.clone();
            ap.collapseArtifactualBranches(skeleton.tags);
            arbor = ap.arbor;
          }
          // Create backbone arbor
          var upstream;
          if (skeleton.tags['microtubules end'] && skeleton.tags['microtubules end'].length > 0) {
            upstream = skeleton.createUpstreamArbor('microtubules end', arbor);
          } else {
            var cuts = arbor.approximateTwigRoots(strahlerCut);
            if (cuts && cuts.length > 0) {
              upstream = arbor.upstreamArbor(cuts);
              CATMAID.msg("Approximating dendritic backbone", "By strahler number " +
                  strahlerCut + ", neuron: " + CATMAID.NeuronNameService.getInstance().getName(skeleton.id));
            }
          }
          if (upstream) {
            // Collect nodes that don't belong to the dendritic backbone
            var outside = {},
                add = (function(node) { this[node] = true; }).bind(outside);
            // Nodes from the axon terminals
            skeleton.axon.nodesArray().forEach(add);
            // Nodes from the linker between dendritic tree and axon terminals
            skeleton.axon.fc_max_plateau.forEach(add);
            // Nodes primarily from the linker between arbor and soma
            skeleton.axon.fc_zeros.forEach(add);
            // Set weights
            arbor.nodesArray().forEach(function(node) {
              this[node] = (upstream.contains(node) && !outside[node]) ? 1 : 0;
            }, node_weights);
          }
        }

        return node_weights;
      }
    },
    'single-strahler-number': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var strahler = arbor.strahlerAnalysis();
        var node_weights = {};
        var single = Number(options.strahler_cut);
        arbor.nodesArray().forEach(function(node) {
          this[node] = strahler[node] === single ? 1 : 0;
        }, node_weights);
        return node_weights;
      }
    },
    'strahler-threshold': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var strahler = arbor.strahlerAnalysis();
        var node_weights = {};
        var threshold = Number(options.strahler_cut);
        arbor.nodesArray().forEach(function(node) {
          this[node] = strahler[node] >= threshold ? 1 : 0;
        }, node_weights);
        return node_weights;
      }
    },
    'axon-and-dendrite': {
      prepare: initAxons,
      weights: function(skeleton, options) {
        var node_weights = {};
        if (!skeleton.axon) {
          // Not computable
          return node_weights;
        }
        var up = 1,
            down = 0.5;
        if (options.invert_shading) {
          up = 0.5;
          down = 0;
        }
        var axon_nodes = skeleton.axon.edges;
        var nodeMetaData = skeleton.nodeMetaData;
        // This could be improved by being able to iterate only unique nodes
        // (instead of edge ends).
        for (var i=0; i<nodeMetaData.length; i+=2) {
          var node_id = nodeMetaData[i].node_id;
          node_weights[node_id] = axon_nodes[node_id] ? down : up;
        }

        // Handle root
        node_weights[skeleton.axon.root] = axon_nodes[skeleton.axon.root] ? down : up;

        return node_weights;
      }
    },
    'downstream-of-tag': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var node_weights = {};
        var upstream = skeleton.createUpstreamArbor(options.tag_regex, arbor);
        arbor.nodesArray().forEach(function(node) {
          this[node] = upstream.contains(node) ? 0 : 1;
        }, node_weights);
        return node_weights;
      }
    },
    'synapse-free': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var locations = skeleton.getPositions(),
            node_weights = {};
        arbor.split(skeleton.createSynapseCounts()).forEach(function(fragment) {
          var weight = 0;
          if (fragment.cableLength(locations) >= options.min_synapse_free_cable) {
            weight = 1;
          }
          fragment.nodesArray().forEach(function(node) {
            this[node] = weight;
          }, node_weights);
        });

        return node_weights;
      }
    },
    'near_active_node_z_camera': {
      material:function(skeleton, options) {
        var material = makeNearActiveNodeSplitMaterial(skeleton.line_material, true,
            options.distance_to_active_node, options.triangulated_lines);
        return material;
      }
    },
    'near_active_node_z_project': {
      material: function(skeleton, options) {
        var material = makeNearActiveNodeSplitMaterial(skeleton.line_material, false,
            options.distance_to_active_node, options.triangulated_lines);
        return material;
      }
    },
    'near_active_node': {
      weights: function(skeleton, options) {
        var distanceToActiveNode = options.distance_to_active_node;
        var arbor = skeleton.createArbor();
        var active = SkeletonAnnotations.getActiveNodeId();
        if (!active || !arbor.contains(active)) {
          return null;
        } else {
          var within = arbor.findNodesWithin(active,
              skeleton.createNodeDistanceFn(), distanceToActiveNode);
          var node_weights = {};
          arbor.nodesArray().forEach(function(node) {
            node_weights[node] = undefined === within[node] ? 0 : 1;
          });
          return node_weights;
        }
      }
    },
    'strahler': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var node_weights = arbor.strahlerAnalysis();
        var max = node_weights[arbor.root];
        Object.keys(node_weights).forEach(function(node) {
          node_weights[node] /= max;
        });
        return node_weights;
      }
    },
    'partitions': {
      weights: function(skeleton, options) {
        // Shade by euclidian length, relative to the longest branch
        var arbor = skeleton.createArbor();
        var locations = skeleton.getPositions();
        var partitions = arbor.partitionSorted();
        var node_weights = partitions.reduce(function(o, seq, i) {
          var loc1 = locations[seq[0]],
              loc2,
              plen = 0;
          for (var i=1, len=seq.length; i<len; ++i) {
            loc2 = locations[seq[i]];
            plen += loc1.distanceTo(loc2);
            loc1 = loc2;
          }
          return seq.reduce(function(o, node) {
            o[node] = plen;
            return o;
          }, o);
        }, {});
        // Normalize by the length of the longest partition, which ends at root
        var max_length = node_weights[arbor.root];
        Object.keys(node_weights).forEach(function(node) {
          node_weights[node] /= max_length;
        });

        return node_weights;
      }
    },
    'active_node_split': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        // The active node is not necessarily a real node and splitting the arbor
        // will therefore not work in case of a virtual node. The split is
        // therefore performed with the next real child node and the node weight
        // of the child will be adjusted to get the same visual effect.
        var atn = SkeletonAnnotations.getActiveNodeId();
        var virtualAtn = !SkeletonAnnotations.isRealNode(atn);
        if (virtualAtn) atn = SkeletonAnnotations.getChildOfVirtualNode(atn);
        var node_weights = {};
        if (arbor.contains(atn)) {
          var sub = arbor.subArbor(atn),
              up = 1,
              down = 0.5;
          if (options.invert_shading) {
            up = 0.5;
            down = 0;
          }
          arbor.nodesArray().forEach(function(node) {
            node_weights[node] = sub.contains(node) ? down : up;
          });
          if (virtualAtn) {
            // If the active node is virtual, the weight of its real child is
            // adjusted so so that it matches the visual appearance of having an
            // actual node at the ATNs location.
            var vnPos = SkeletonAnnotations.getActiveNodePositionW();
            vnPos = new THREE.Vector3(vnPos.x, vnPos.y, vnPos.z);
            var locations = skeleton.getPositions();
            var vn = SkeletonAnnotations.getActiveNodeId();
            var parentPos = locations[SkeletonAnnotations.getParentOfVirtualNode(vn)];
            var childPos = locations[SkeletonAnnotations.getChildOfVirtualNode(vn)];
            // In some situations, the real child and real `parent location is
            // not available. For instance if a virtual node between the active
            // virtual node and its real child is materialized and the 3D viewer
            // isn't updated. In this cae, don't set any weights.
            if (childPos &&parentPos) {
              var distRatio = parentPos.distanceToSquared(vnPos) / parentPos.distanceToSquared(childPos);
              node_weights[atn] = up - distRatio * (up - down);
            }
          }
        }

        return node_weights;
      }
    },
    'downstream_amount': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        return arbor.downstreamAmount(skeleton.createNodeDistanceFn(), true);
      }
    },
    'distance_to_root': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var dr = arbor.nodesDistanceTo(arbor.root, skeleton.createNodeDistanceFn()),
            distances = dr.distances,
            max = dr.max;

        // Normalize by max in place
        Object.keys(distances).forEach(function(node) {
          distances[node] = 1 - (distances[node] / max);
        });

        return distances;
      }
    },
    'betweenness_centrality': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var c = arbor.betweennessCentrality(true);
        return normalizeFields(c);
      }
    },
    'slab_centrality': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var c = arbor.slabCentrality(true);
        return normalizeFields(c);
      }
    },
    'flow_centrality': {
      weights: function(skeleton, options) {
        return flowCentralityWeights(skeleton, "sum");
      }
    },
    'centrifugal flow_centrality': {
      weights: function(skeleton, options) {
        return flowCentralityWeights(skeleton, "centrifugal");
      }
    },
    'centripetal flow_centrality': {
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        return flowCentralityWeights(skeleton, "centripetal");
      }
    },
    'sampler-domains': {
      prepare: initSamplerDomains,
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var samplers = skeleton.samplers;
        if (!samplers) {
          // Weight each node zero if there are no samplers
          return arbor.nodesArray().reduce(function(o, d) {
            o[d] = 0;
            return o;
          }, {});
        }

        // Index to test if a vertex is part of a domain
        var samplerEdges = {};
        for (var i=0; i<samplers.length; ++i) {
          var sampler = samplers[i];
          CATMAID.Sampling.samplerEdges(arbor, sampler, samplerEdges,
              options.allowed_sampler_domain_ids);
        }

        var nonDomainWeight = options.sampler_domain_shading_other_weight || 0;

        // Add all nodes in all domains
        var nodeWeights = arbor.nodesArray().reduce(function(o, d) {
          o[d] = samplerEdges[d] === undefined ? nonDomainWeight : 1;
          return o;
        }, {});

        return nodeWeights;
      }
    },
    'sampler-intervals': {
      prepare: initSamplerIntervals,
      weights: function(skeleton, options) {
        var arbor = skeleton.createArbor();
        var positions = skeleton.getPositions();
        var samplers = skeleton.samplers;
        if (!samplers) {
          // Weight each node zero if there are no samplers
          return arbor.nodesArray().reduce(function(o, d) {
            o[d] = 0;
            return o;
          }, {});
        }

        // Index to test if a vertex is part of an interval
        var intervalMap = {};
        for (var i=0; i<samplers.length; ++i) {
          var sampler = samplers[i];
          CATMAID.Sampling.intervalEdges(arbor, positions,
              sampler, true, true, true, intervalMap);
        }

        // Look at all nodes of all domains. Give them a weight of 1 if they are
        // part of an interval and 0.2 if hey are only part of a domain.
        var nodeWeights = arbor.nodesArray().reduce(function(o, d) {
          o[d] = intervalMap[d] === undefined ? 0 : 1;
          return o;
        }, {});

        return nodeWeights;
      }
    }
  };

  /**
   * Calculate either 'sum', 'centrifugal' or 'centripetal' centrality flow
   * weights for a skeleton.
   */
  var flowCentralityWeights = function(skeleton, key) {
    var arbor = skeleton.createArbor();
    var io = skeleton.createPrePostCounts();
    var c;
    if (0 === io.postsynaptic_to_count || 0 === io.presynaptic_to_count) {
      CATMAID.warn('Neuron "' + skeleton.skeletonmodel.baseName + '" lacks input or output synapses.');
      c = arbor.nodesArray().reduce(function(o, node) {
        // All the same
        o[node] = 1;
        return o;
      }, {});
    } else {
      var fc = arbor.flowCentrality(io.presynaptic_to, io.postsynaptic_to,
          io.presynaptic_to_count, io.postsynaptic_to_count);
      var c = {};
      var nodes = Object.keys(fc);
      for (var i=0; i<nodes.length; ++i) {
        var node = nodes[i];
        c[node] = fc[node][key];
      }
    }

    return normalizeFields(c);
  };

  /**
   * Get the constructor for the material used for skeleton meshes.
   *
   * @param {String} neuron_material Expected to be either 'basic' or 'lambert'
   *
   * @return a THREE.js constructor for a material
   */
  CATMAID.getSkeletonMaterialType = function(neuron_material) {
    if ('basic' === neuron_material) {
      return THREE.MeshBasicMaterial;
    } else if ('lambert' === neuron_material) {
      return THREE.MeshLambertMaterial;
    } else {
      throw new CATMAID.ValueError("Unknown material identifier: " + neuron_material);
    }
  };

  var getSkeletonColorMethod = function(options, noDefault) {
    var colorizer = CATMAID.SkeletonColorMethods[options.color_method];
    return (colorizer || noDefault) ? colorizer : CATMAID.SkeletonColorMethods['actor-color'];
  };

  var getSkeletonShadingMethod = function(options, noDefault) {
    var shading = CATMAID.SkeletonShadingMethods[options.shading_method];
    return (shading || noDefault) ? shading : CATMAID.SkeletonShadingMethods['none'];
  };

  /**
   * Create a new skeleton colorizer object that wraps the coloring and shading
   * functionality defined through the passed in options. The options are
   * generally expected to match the options available to CATMAID's 3D viewer.
   */
  CATMAID.makeSkeletonColorizer = function(options) {
    var isFn = CATMAID.tools.isFn;
    var shading = getSkeletonShadingMethod(options);
    var coloring = getSkeletonColorMethod(options);
    var weights = isFn(shading.weights) ? shading.weights : function() { return null; };

    return {
      prepare: function(skeletons) {
        var prepare = Promise.resolve();
        if (isFn(shading.prepare)) {
          prepare = prepare.then(shading.prepare.bind(shading, skeletons));
        }
        if (isFn(coloring.prepare)) {
          prepare = prepare.then(coloring.prepare.bind(coloring, skeletons));
        }
        return prepare;
      },
      material: function(skeleton) {
        if (isFn(shading.material)) {
          return shading.material(skeleton, options);
        } else if (options.triangulated_lines) {
          return new THREE.LineMaterial({
            color: skeleton.line_material.color,
            opacity: skeleton.line_material.opacity,
            linewidth: options.skeleton_line_width,
            resolution: new THREE.Vector2(skeleton.space.canvasWidth,
                skeleton.space.canvasHeight),
          });
        } else {
          return new THREE.LineBasicMaterial({
            color: skeleton.line_material.color,
            opacity: skeleton.line_material.opacity,
            linewidth: options.skeleton_line_width
          });
        }
      },
      weights: function(skeleton) {
        var node_weights = weights(skeleton, options);

        if (options.invert_shading && node_weights) {
          // All weights are values between 0 and 1
          Object.keys(node_weights).forEach(function(node) {
            this[node] = 1 - this[node];
          }, node_weights);
        }

        if (!node_weights && coloring.vertexColorizer) {
          node_weights = {};
        }

        return node_weights;
      },
      vertexColors: !!coloring.vertexColorizer,
      colorPicker: function(skeleton) {
        if (isFn(coloring.vertexColorizer)) {
          return coloring.vertexColorizer(skeleton, {
            unreviewedColor: new THREE.Color(0.2, 0.2, 0.2),
            reviewedColor: new THREE.Color(1.0, 0.0, 1.0),
            axonColor: new THREE.Color(0, 1, 0),
            dendriteColor: new THREE.Color(0, 0, 1),
            notComputableColor: new THREE.Color(0.4, 0.4, 0.4),
            xDim: options.xDim,
            xOffset: options.xOffset,
            yDim: options.yDim,
            yOffset: options.yOffset,
            zDim: options.zDim,
            zOffset: options.zOffset,
            viewerOptions: options
          });
        } else {
          return function(vertex) {
            return skeleton.actorColor;
          };
        }
      },
      SkeletonMaterial: CATMAID.getSkeletonMaterialType(options['neuron_material']),
      interpolateVertexColors: options.interpolate_vertex_colots
    };
  };


})(CATMAID);
