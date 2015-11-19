/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
*/

(function(CATMAID) {

  "use strict";

  CATMAID.ReviewSystem = new function()
  {
    var projectID, skeletonID, subarborNodeId;
    var self = this;
    self.skeleton_segments = null;
    self.current_segment = null;
    self.current_segment_index = 0;
    var end_puffer_count = 0,
      autoCentering = true,
      followedUsers = [];
    // Set to true, if one moves beyond the current segment
    self.movedBeyondSegment = false;
    // Set to true, if one deselects the current skeleton
    self.segmentUnfocused = false;
    // Set to true, if no auto-refresh should happen after a segment has been
    // rully reviewed.
    self.noRefreshBetwenSegments = false;
    // Specify step size for skipping consecutive virtual nodes
    self.virtualNodeStep = 1;
    // Keep track of last virtual node step, if any
    var skipStep = null;


    this.init = function() {
      projectID = project.id;
      followedUsers = [session.userid];
    };

    this.setAutoCentering = function(centering) {
      autoCentering = centering ? true : false;
    };

    this.getAutoCentering = function() {
      return autoCentering;
    };

    this.validSegment = function() {
      return self.current_segment !== null;
    };

    /**
     * Return true if the reference orientation implies looking parallel to X.
     * False otherwise.
     */
    this.isXView = function() {
      return project.focusedStackViewer.primaryStack.orientation ===
        CATMAID.Stack.ORIENTATION_ZY;
    };

    /**
     * Return true if the reference orientation implies looking parallel to Y.
     * False otherwise.
     */
    this.isYView = function() {
      return project.focusedStackViewer.primaryStack.orientation ===
          CATMAID.Stack.ORIENTATION_XZ;
    };

    /**
     * Return true if the reference orientation implies looking parallel to Z.
     * False otherwise.
     */
    this.isZView = function() {
      return project.focusedStackViewer.primaryStack.orientation ===
          CATMAID.Stack.ORIENTATION_XY;
    };

    /**
     * Return the depth component of the current reference orientation.
     */
    this.getDepthField = function() {
      if (this.isZView()) return 'z';
      else if (this.isYView()) return 'y';
      else if (this.isXView()) return 'x';
      else throw new CATMAID.ValueError('Unknown reference orientation');
    };

    /**
     * If the active skeleton changes, the review system will register it. The
     * widget will make sure the view is centered at the last active node, when
     * review is continued.
     */
    this.handleActiveNodeChange = function(node) {
      var $rows = $('table#review_segment_table tr.review-segment');
      $rows.removeClass('active');

      // Ignore this node change if no segment is under review at the moment
      if (!this.skeleton_segments) return;
      var segment = this.current_segment ? this.current_segment['sequence'] : null;
      var rNode = !!segment ? segment[this.current_segment_index] : null;

      if (node) {
        var nodeId = node.id;
        if (!SkeletonAnnotations.isRealNode(node.id)) {
          // Force re-focus on next step if the newly active virtual node is not
          // on the edge between parent and child.
          var pID = SkeletonAnnotations.getParentOfVirtualNode(node.id);
          var cID = SkeletonAnnotations.getChildOfVirtualNode(node.id);
          nodeId = pID;
          if (rNode && rNode.id != pID && rNode.id != cID) {
            this.segmentUnfocused = true;
          }
        } else if (rNode && node.id != rNode.id) {
          // Force re-focus on next step if the new active node is not the
          // node currently under review.
          this.segmentUnfocused = true;
        }

        // Find and highlight segment rows containing the active node.
        var activeSegmentIds = this.skeleton_segments
            .filter(function (seg) {
              return seg.sequence.some(function (n) {
                return n.id === nodeId;
              });})
            .map(function (seg) { return seg.id; });
        $rows.filter('[data-sgid="' + activeSegmentIds.join('"],[data-sgid="') + '"]').addClass('active');
      } else if (rNode) {
        // Force re-focus on next step if there is no active node anymore.
        this.segmentUnfocused = true;
      }
    };

    /**
     * Remove all review state information and clear content.
     */
    this.endReview = function() {
      skipStep = null;
      self.skeleton_segments = null;
      self.current_segment = null;
      self.current_segment_index = 0;
      if( $('#review_segment_table').length > 0 ) $('#review_segment_table').remove();
      $('#reviewing_skeleton').text('');
      $('#counting-cache').text('');
      $('#counting-cache-info').text('');
    };

    /**
     * Start review of a specific segment, regardless of whether it has already
     * been reviewed.
     *
     * @param {number} id - The index of the segment, 0-based.
     */
    this.initReviewSegment = function( id ) {
      skipStep = null;
      // Reset movement flags
      this.segmentUnfocused = false;
      this.movedBeyondSegment = false;
      // Select and move to start of segment
      self.current_segment = self.skeleton_segments[id];
      self.current_segment_index = 0;
      self.goToNodeIndexOfSegmentSequence(0, true);
      end_puffer_count = 0;
      // Highlight current segment in table
      var $rows = $('table#review_segment_table tr.review-segment');
      $rows.removeClass('highlight');
      var $cur_row = $rows.filter('tr[data-sgid=' + id + ']');
      $cur_row.addClass('highlight');
    };

    /**
     * Move to the a specific node of the segment currently under review.
     */
    this.goToNodeIndexOfSegmentSequence = function(idx, forceCentering) {
      if (self.skeleton_segments===null)
        return;
      var node = self.current_segment['sequence'][idx];
      this.goToNodeOfSegmentSequence(node, forceCentering);
    };

    /**
     * Move to the a specific node of the segment currently under review.
     */
    this.goToNodeOfSegmentSequence = function(node, forceCentering) {
      if (self.skeleton_segments===null)
        return;
      var center = autoCentering || forceCentering;
      SkeletonAnnotations.staticMoveTo(
        (self.isZView() || center) ? node.z : project.coordinates.z,
        (self.isYView() || center) ? node.y : project.coordinates.y,
        (self.isXView() || center) ? node.x : project.coordinates.x,
        function () {
           SkeletonAnnotations.staticSelectNode( node.id, skeletonID );
        });
    };

    this.moveNodeInSegmentBackward = function() {
      if (null === self.skeleton_segments) {
        return;
      }

      var sequence = self.current_segment['sequence'];

      if (!skipStep) self.markAsReviewed(sequence[self.current_segment_index]);

      // By default, the selected node is changed and centering not enforced.
      var changeSelectedNode = true;
      var forceCentering = false;

      // Don't change the selected node, if moved out of the segment
      if (self.movedBeyondSegment) {
        self.movedBeyondSegment = false;
        changeSelectedNode = false;
      }
      // Don't change the selected node, but force centering, if the current
      // segment became unfocused.
      if (self.segmentUnfocused) {
        self.segmentUnfocused = false;
        changeSelectedNode = false;
        forceCentering = true;
      }

      if(self.current_segment_index > 0 || skipStep) {
        if (changeSelectedNode) {
          var ln, refIndex;
          var newIndex = Math.max(self.current_segment_index - 1, 0);
          if (skipStep) {
            ln = skipStep;
            refIndex = skipStep.refIndex;
            // If the existing skipping step was created with the current node
            // as source, the current test node needs to be the virtual node.
            if (skipStep.to !== sequence[newIndex]) {
              newIndex = skipStep.refIndex - 1;
            }
          } else {
            refIndex = self.current_segment_index;
            ln = sequence[self.current_segment_index];
          }

          var nn = sequence[newIndex];

          // Check if an intermediate step is required. If a sample step has
          // already been taken before, this step is the reference point for the
          // distance test.
          skipStep = self.limitMove(ln, nn, refIndex, true);
          if (skipStep) {
            // Move to skipping step
            this.goToNodeOfSegmentSequence(skipStep, forceCentering);
            return;
          } else {
            self.current_segment_index = newIndex;
          }

          self.warnIfNodeSkipsSections(ln);
        }
        self.goToNodeIndexOfSegmentSequence(self.current_segment_index, forceCentering);
      } else {
        // Go to 'previous' section, to check whether an end really ends
        self.lookBeyondSegment(sequence, forceCentering);
      }
    };

    /**
     * Return a skipping step, if there is one required when moving from node 1
     * to node 2. If no step is required, null is returned. A step is required
     * if the distance between both  above the maximum step distance. Steps are
     * sections in the currently focused stack.
     */
    this.limitMove = function(from, to, refIndex, backwards) {
      var stackViewer = project.focusedStackViewer;
      var stack = stackViewer.primaryStack;
      // Get difference vector in stack space coordinates and check that not
      // more sections are crossed than allowed. Unfortunately, we can't
      // transform vectors into stack space (due to translation being applied)
      // and so we have to transform both to and from nodes separately.
      var fromSZ = stack.projectToUnclampedStackZ(from.z, from.y, from.x);
      var toSZ = stack.projectToUnclampedStackZ(to.z, to.y, to.x);
      var zDiff = toSZ - fromSZ;
      var zDiffAbs = Math.abs(zDiff);
      var suppressedZs = self.current_segment.sequence[refIndex - 1].sup.reduce(function (zs, s) {
        if (s[0] === stack.orientation) {
          var vncoord = [0, 0, 0];
          vncoord[2 - s[0]] = s[1];
          zs.push(stack.projectToStackZ(vncoord[2], vncoord[1], vncoord[0]));
        }
        return zs;
      }, []);
      var suppressedSkips = 0;
      // If the stack space Z distance is larger than the virtual node step
      // value, stop at the section that is reachable with this value.
      if (zDiffAbs > self.virtualNodeStep) {
        // Get project space coordinate of intermediate point, move to it and
        // select a virtual node there. Make sure this new section is not a
        // broken slice.
        var nSteps = 0;
        var inc = (zDiff > 0 ? 1 : -1);
        while (true) {
          // Increment step counter and check if
          ++nSteps;
          // Set new target section, based on the current number of stacks
          var targetSZ = fromSZ + nSteps * inc;
          // If the target section is a broken slice, try the next one. Check
          // this first, because we want to step to the first valid section as
          // close as possible to the limit.
          if (-1 !== stack.broken_slices.indexOf(targetSZ)) continue;
          if (-1 !== suppressedZs.indexOf(targetSZ)) {
            suppressedSkips++;
            continue;
          }
          // If we reach the section of the original target, use this instead
          if (targetSZ === toSZ) break;
          // Stop incrementing if we reached the step limit
          if (nSteps >= self.virtualNodeStep) break;
        }

        if (suppressedSkips) {
          CATMAID.warn('Skipped ' + suppressedSkips + ' suppressed virtual nodes.');
        }

        if (targetSZ === toSZ) return null;

        var zRatio = nSteps / zDiffAbs;

        // Get project space coordinates for virtual node ID
        var xp = from.x + (to.x - from.x) * zRatio;
        var yp = from.y + (to.y - from.y) * zRatio;
        var zp = from.z + (to.z - from.z) * zRatio;

        var vnID = backwards ?
          SkeletonAnnotations.getVirtualNodeID(to.id, from.id, xp, yp, zp) :
          SkeletonAnnotations.getVirtualNodeID(from.id, to.id, xp, yp, zp);

        return {
          id: vnID,
          x: xp,
          y: yp,
          z: zp,
          stack: stack,
          to: to,
          refIndex: refIndex
        };
      } else {
        return null;
      }
    };

    /**
     * Move one section beyond a segment's leaf.
     */
    this.lookBeyondSegment = function(segment, forceCentering) {
      if (0 === segment.length) return;

      var depthField = this.getDepthField();
      var i = 1;
      while (i < segment.length && segment[i-1][depthField] === segment[i][depthField]) {
        i += 1;
      }
      if (i === segment.length) {
        // corner case
        CATMAID.msg("Can't move", "Can't decide whether to move " +
            "forward or backward one section!");
        return;
      }
      self.movedBeyondSegment = true;
      // Will check stack boundaries at Stack.moveTo
      var coords;
      if (this.autoCentering || forceCentering) {
        coords = {x: segment[0].x, y: segment[0].y, z: segment[0].z};
      } else {
        coords = {x: project.coordinates.x, y: project.coordinates.y,
           z: project.coordinates.z};
      }

      // If the second node of the current segment is on a lower index section
      // than the first one, we move beyond the segment by looking at the next
      // higher index section after the first node. Otherwise, we look at the
      // next lower index section.
      var viewer = project.focusedStackViewer;
      var stack = project.focusedStackViewer.primaryStack;
      var validDistanced = segment[i][depthField] > segment[i-1][depthField] ?
          stack.validZDistanceBefore(viewer.z) : stack.validZDistanceAfter(viewer.z);
      var targetZ = validDistanced ? viewer.z + validDistanced : viewer.z;
      // Move to location found
      project.moveTo(
          stack.stackToProjectZ(targetZ, viewer.y, viewer.x),
          stack.stackToProjectY(targetZ, viewer.y, viewer.x),
          stack.stackToProjectX(targetZ, viewer.y, viewer.x));
    };

    this.moveNodeInSegmentForward = function(advanceToNextUnfollowed) {
      if (self.skeleton_segments===null)
        return;

      var sequence = self.current_segment['sequence'];
      var sequenceLength = sequence.length;

      // Mark current node as reviewed, if this is no intermediate step.
      if (!skipStep) {
        //  Don't wait for the server to respond
        self.markAsReviewed( sequence[self.current_segment_index] );

        if( self.current_segment_index === sequenceLength - 1  ) {
          CATMAID.msg('Done', 'Segment fully reviewed: ' +
              self.current_segment['nr_nodes'] + ' nodes');
          if (self.noRefreshBetwenSegments) {
            end_puffer_count += 1;
            markSegmentDone(self.current_segment, [session.userid]);
            // do not directly jump to the next segment to review
            if( end_puffer_count < 3) {
              return;
            }
            // Segment fully reviewed, go to next without refreshing table
            // much faster for smaller fragments
            self.selectNextSegment();
            return;
          } else {
            self.startSkeletonToReview(skeletonID, subarborNodeId);
            return;
          }
        }
      }

      var changeSelectedNode = true;
      var forceCentering = false;
      // Don't change the selected node, if moved out of the segment before
      if (self.movedBeyondSegment) {
        self.movedBeyondSegment = false;
        changeSelectedNode = false;
      }
      // Don't change the selected node, but force centering, if the current
      // segment became unfocused.
      if (self.segmentUnfocused) {
        self.segmentUnfocused = false;
        changeSelectedNode = false;
        forceCentering = true;
      }

      if (changeSelectedNode) {

        var whitelist = CATMAID.ReviewSystem.Whitelist.getWhitelist();
        var reviewedByTeam = reviewedByUserOrTeam.bind(self, session.userid, whitelist);

        // Find index of next real node that should be reviewed
        var newIndex = Math.min(self.current_segment_index + 1, sequenceLength - 1);
        if (advanceToNextUnfollowed) {
          // Advance index to the first node that is not reviewed by the current
          // user or any review team member.
          var i = newIndex;
          while (i < sequenceLength) {
            if (!sequence[i].rids.some(reviewedByTeam)) {
              newIndex = i;
              break;
            }
            i += 1;
          }
        }

        var ln, refIndex;
        if (skipStep) {
          ln = skipStep;
          refIndex = skipStep.refIndex;
          if (skipStep.to !== sequence[newIndex]) {
            newIndex = skipStep.refIndex;
          }
        } else {
          refIndex = newIndex;
          ln = sequence[newIndex - 1];
        }

        var nn = sequence[newIndex];

        // Check if an intermediate step is required. If a sample step has
        // already been taken before, this step is the reference point for the
        // distance test.
        skipStep = self.limitMove(ln, nn, refIndex, false);
        if (!skipStep) {
          // If a real node is next, update current segment index and check if
          // we are close to the segment end.
          self.current_segment_index = newIndex;

          if (self.current_segment_index < sequenceLength -1) {
            // Check if the remainder of the segment was complete at an earlier time
            // and perhaps now the whole segment is done:
            var i_user = self.current_segment_index;
            var i_union = self.current_segment_index;
            while (i_user < sequenceLength && sequence[i_user].rids.some(reviewedByTeam)) {
              i_user += 1;
            }
            while (i_union < sequenceLength && 0 !== sequence[i_union].rids.length) {
              i_union += 1;
            }
            var cellIDs = [session.userid];
            if (i_user === sequenceLength) {
              CATMAID.msg('DONE', 'Segment fully reviewed: ' +
                  self.current_segment['nr_nodes'] + ' nodes');
            }
            if (i_union === sequenceLength) cellIDs.push('union');
            if (cellIDs.length > 0) markSegmentDone(self.current_segment, cellIDs);
            // Don't startSkeletonToReview, because self.current_segment_index
            // would be lost, losing state for q/w navigation.
          }

          self.warnIfNodeSkipsSections(ln);
        }
      }

      // Select the (potentially new) current node
      if (skipStep) {
        self.goToNodeOfSegmentSequence(skipStep, forceCentering);
      } else {
        self.goToNodeIndexOfSegmentSequence(self.current_segment_index, forceCentering);
      }
    };

    /**
     * Calculate the review status for a set of user IDs (including "union")
     * and reflect this in the appropriate table cells.
     */
    function markSegmentDone(segment, reviewerIds) {
      reviewerIds.forEach(function(s) {
        var reviewedByCell = reviewedByUser.bind(self, s);
        var status = (segment.sequence.reduce(function (count, n) {
          var reviewed = s === 'union' ?
              n.rids.length !== 0 :
              n.rids.some(reviewedByCell);
          return count + (reviewed ? 1 : 0);
        }, 0) * 100.0 / segment.nr_nodes).toFixed(2);
        var cell = $('#rev-status-cell-' + segment['id'] + '-' + s);
        cell.text(status + '%')
            .css('background-color',
                 CATMAID.ReviewSystem.getBackgroundColor(Math.round(status)));
        if (s === session.userid) segment['status'] = status;
      });
    }

    /**
     * Tests if a review was reviewd by the given user.
     */
    function reviewedByUser(userId, review)
    {
      return userId === review[0];
    }

    /**
     * Test if a review was done by the given user or a review team member.
     */
    function reviewedByUserOrTeam(userId, team, review)
    {
      if (reviewedByUser(userId, review)) return true;
      if (review[0] in team) {
        var rDate = new Date(review[1]);
        return rDate >= team[review[0]];
      }
      return false;
    }

    /**
     * Show a warning message if the distance between the current node and the
     * passed in reference node (defaulting to the last node in the current
     * segment) is larger than what is allowed to be skipped.
     */
    this.warnIfNodeSkipsSections = function (referenceNode) {
      if (0 === self.current_segment_index) {
        return;
      }
      // Get current and last node
      var cn = self.current_segment.sequence[self.current_segment_index];
      var ln = referenceNode ? referenceNode :
        self.current_segment.sequence[self.current_segment_index - 1];
      // Convert to stack space to check against virtual node step limit
      var cnz = project.focusedStackViewer.primaryStack.projectToStackZ(cn.z, cn.y, cn.x);
      var lnz = project.focusedStackViewer.primaryStack.projectToStackZ(ln.z, ln.y, ln.x);
      var zdiff = cnz - lnz;
      if (Math.abs(zdiff) > self.virtualNodeStep) {
        CATMAID.msg("Skipped sections", "This node is " + Math.abs(zdiff) +
            " sections away from the previous node.", {style: 'warning'});
      }
    };

    var submit = typeof submitterFn!= "undefined" ? submitterFn() : undefined;

    /**
     * Mark the given node as reviewed in the back-end.
     */
    this.markAsReviewed = function( node_ob ) {
      submit(django_url+projectID+"/node/" + node_ob['id'] + "/reviewed", {},
          function(json) {
            if (json.reviewer_id) {
              // Append the new review to the list of reviewers of
              // this node, if not already present.
              var lastIndex;
              var known = node_ob['rids'].some(function(r, i) {
                lastIndex = i;
                return r[0] === json.reviewer_id;
              });

              // Either update an existing entry or create a new one
              var reviewInfo = [json.reviewer_id, json.review_time];
              if (known) {
                node_ob['rids'][lastIndex] = reviewInfo;
              } else {
                node_ob['rids'].push(reviewInfo);
              }
            }
          });
    };

    /**
     * Selects the next segment to review, that is the first segment that
     * wasn't reviewed by either the current user or one that is followed. To
     * check the review state of all segments, we want to make sure all requests
     * returned from the server (otherwise we don't work with the most recent
     * information). Therefore, the selection of the next segment is queued to
     * be executed after all pending requests.
     */
    this.selectNextSegment = function() {
      // Reset skipping step, if any
      skipStep = null;
      // Find nexte segment
      if (self.skeleton_segments) {
        var fn = function() {
          var nSegments = self.skeleton_segments.length;

          // Find out the start index to search for the next one from.
          // This either the index of the current element or zero if the
          // element is not found (or not available).
          var fromIndex = 0;
          if (self.current_segment) {
            fromIndex = self.skeleton_segments.indexOf(self.current_segment) + 1;
            if (fromIndex === nSegments) {
              fromIndex = 0;
            }
          }

          // Find a segment with unreviewed nodes, starting after current segment
          var nextSegmentIndex = -1;
          for (var i=0; i<nSegments; i++)
          {
            // Get index of next segment, starting from current segment
            var segmentIndex = (fromIndex + i) % nSegments;
            var nodes = self.skeleton_segments[segmentIndex].sequence;
            // Check if the next segment has unreveviewed nodes
            if (nodes.some(isUnreviewed)) {
              nextSegmentIndex = segmentIndex;
              break;
            }
          }

          // Select next segment, if any. Otherwise show finishing
          // message.
          if (nextSegmentIndex >= 0) {
            self.initReviewSegment(nextSegmentIndex);
          } else {
            CATMAID.msg("Done", "Done reviewing.");
          }

          /**
           * Support function to test whether a node hasn't been reviewed by
           * any of the followed reviewers. This is the case if the list of
           * reviewers is empty or no followed reviewer appears in it.
           */
          function isUnreviewed(node) {
            return 0 === node['rids'].length || followedUsers.every(function(rid) {
              return !node['rids'].some(function(r) {
                return rid === r[0];
              });
            });
          }
        };

        var errFn = function() {
          CATMAID.msg("Error", "Couldn't select next segment for " +
            "review, please try again!");
        };

        // Queue the selection so that pending requests can finish before.
        // Display an error message if something fails before.
        submit(null, null, fn, false, false, errFn);
      }
    };

    /**
     * Clears the table with ID 'review_segment_table' prior to adding rows to
     * it. If a subarborNodeId is given, not the whole skeleton will be
     * reviewed, but only the sub-arbor starting at the given node ID. If
     * omitted or null it will default to the root node.
     * */
    this.createReviewSkeletonTable = function( skeleton_data, users, subarborNodeId ) {
      self.skeleton_segments = skeleton_data;
      var butt, table, tbody, row;
      if( $('#review_segment_table').length > 0 ) {
        $('#review_segment_table').remove();
      }

      // Count which user reviewed how many nodes and map user ID vs object
      // containing name and count.
      // FIXME: count is wrong because branch points are repeated. Would have
      // to create sets and then count the number of keys.
      var users = users.reduce(function(map, u) {
        // Create an empty segment count object
        var seg_count = skeleton_data.reduce(function(o, s) {
          o[s.id] = 0;
          return o;
        }, {});
        // Create a new count object for this user
        map[u[0]] = {name: u[1], count: 0, segment_count: seg_count};
        return map;
      }, {});

      // Make a pseudo-user that aggregates reviews from the whitelist.
      var whitelistUser = {name: 'Team', count: 0,
          segment_count: skeleton_data.reduce(function(o, s) {
            o[s.id] = 0;
            return o;
          }, {})};
      var whitelist = CATMAID.ReviewSystem.Whitelist.getWhitelist();

      // Fill in the users count:
      skeleton_data.forEach(function(segment) {
        segment['sequence'].forEach(function(node) {
          var whitelisted = false;

          node['rids'].forEach(function(rid) {
            var userId = rid[0], reviewTime = new Date(rid[1]);
            users[userId].count += 1;
            users[userId].segment_count[segment.id] += 1;

            if (!whitelisted && userId in whitelist && reviewTime > whitelist[userId]) {
              whitelistUser.count += 1;
              whitelistUser.segment_count[segment.id] += 1;
              whitelisted = true; // Whitelist each node only once.
            }
          });
        });
      });
      // Create a list of all users who have reviewed this neuron. Add the
      // current user as first element, regardless of his/her review status.
      var reviewers = Object.keys(users).filter(function(u) {
        // u is a string, so rely on != for comparing to (integer) user ID.
        return this[u].count > 0 && u != session.userid;
      }, users);
      // Prepend user ID
      reviewers = [session.userid].concat(reviewers);
      // Make sure all IDs are actual numbers
      reviewers = reviewers.map(function(u){ return parseInt(u); });

      // Append whitelist to users and reviewers
      if (reviewers.length > 1) {
        users.whitelist = whitelistUser;
        reviewers.push('whitelist');
      }

      // Create string with user's reviewed counts:
      var user_revisions = reviewers.reduce(function(s, u) {
        u = users[u];
        s += u.name + ": " + u.count + "; ";
        return s;
      }, "");

      $('#reviewing_skeleton').text( 'Skeleton ID under review: ' + skeletonID + " -- " + user_revisions );
      table = $('<table />').attr('cellpadding', '3').attr('cellspacing', '0').attr('id', 'review_segment_table').attr('border', '0');
      // create header
      row = $('<tr />');
      row.append($('<th />'));
      // Start with user columns, current user first
      for (var i=0; i<reviewers.length; ++i) {
        var cb = $('<input />').attr('type', 'checkbox')
          .attr('data-rid', reviewers[i])
          .attr('title', "When checked, column will be respected when next segment is selected.")
          .click(function() {
           var rid = parseInt($(this).attr('data-rid'));
           var idx = followedUsers.indexOf(rid);
           if (-1 !== idx && !this.checked) {
            // Remove from follower list if in list and the name was
            // unchecked.
            followedUsers.splice(idx, 1);
           } else if (-1 === idx && this.checked) {
            // Add to follower list if not already there and the name
            // was checked.
            followedUsers.push(rid);
           }
          });
        if (-1 !== followedUsers.indexOf(reviewers[i])) {
          cb.prop('checked', true);
        }
        row.append( $('<th />').append($('<label />')
          .append(cb).append(users[reviewers[i]].name)));
      }
      // Union column last
      if (reviewers.length > 2) {
        row.append( $('<th />').text('Union') );
      }
      table.append( row );
      row.append( $('<th />').text("# nodes"));
      row.append($('<th />'));
      table.append( row );
      // create a row
      for(var e in skeleton_data ) {
        var sd = skeleton_data[e];
        row = $('<tr />')
          .attr('class', 'review-segment')
          .attr('data-sgid', sd.id);
        if (self.current_segment && sd.id === self.current_segment.id) row.addClass('highlight');
        // Index
        row.append( $('<td />').text(skeleton_data[e]['id'] ) );
        // Single user status
        if (reviewers.length > 2) {
          // The reviewers array contains oneself as first element
          reviewers.forEach(function(r) {
            var seg_status = (100 * users[r].segment_count[sd.id] /
                sd.nr_nodes).toFixed(2);
            this.append($('<td />').text(seg_status + '%')
                .attr('id', 'rev-status-cell-' + sd.id + '-' + r)
                .css('background-color',
                    CATMAID.ReviewSystem.getBackgroundColor(Math.round(seg_status))));
          }, row);
        }
        // Union status
        var status = $('<td />')
            .attr('id', 'rev-status-cell-' + sd.id + '-union')
            .text( skeleton_data[e]['status']+'%' )
            .css('background-color',
                CATMAID.ReviewSystem.getBackgroundColor(parseInt(sd.status)));
        row.append( status );
        // Number of nodes
        row.append( $('<td align="right" />').text( skeleton_data[e]['nr_nodes'] ) );
        // Review button
        butt = $('<button />').text( "Review" );
        butt.attr( 'id', 'reviewbutton_'+skeleton_data[e]['id'] );
        butt.click( function() {
          self.initReviewSegment( this.id.replace("reviewbutton_", "") );
        });
        row.append( $('<td />').append(butt) );
        table.append( row );
      }
      // empty row
      row = $('<tr />');
      table.append( row );
      table.append( $('<br /><br /><br /><br />') );
      $("#project_review_widget").append( table );

    };

    var checkSkeletonID = function() {
      if (!skeletonID) {
        CATMAID.msg('BEWARE', 'You need to activate a skeleton to review.');
        return false;
      }
      return true;
    };

    this.startReviewActiveSkeleton = function(subarborOnly) {
      var skid = SkeletonAnnotations.getActiveSkeletonId();
      var subarborNodeId = undefined; // jshint ignore:line
      if (subarborOnly) {
        subarborNodeId = SkeletonAnnotations.getActiveNodeId();
      }
      this.startSkeletonToReview( skid, subarborNodeId );
    };

    this.startSkeletonToReview = function( skid, nodeId ) {
      if (!skid) {
        CATMAID.error('No skeleton ID provided for review.');
        return;
      } else {
        skeletonID = skid;
        subarborNodeId = nodeId;
      }
      if (!checkSkeletonID()) {
        return;
      }

      // empty caching text
      $('#counting-cache').text('');

      submit(django_url + "accounts/" + projectID + "/all-usernames", {},
        function(usernames) {
          submit(django_url + projectID + "/skeletons/" + skeletonID + "/review",
            {'subarbor_node_id': subarborNodeId},
            function(skeleton_data) {
                self.createReviewSkeletonTable( skeleton_data, usernames );
            });
        });

    };

    var resetFn = function(fnName) {
      if (!checkSkeletonID()) {
        return;
      }
      $('<div id="dialog-confirm" />')
          .text('This will remove all of your reviews from this skeleton. ' +
                'This cannot be undone. Are you sure you want to continue?')
          .dialog({
            resizable: false,
            modal: true,
            title: 'Reset own revisions?',
            buttons: {
              "Cancel": function () {
                $(this).dialog('destroy');
              },
              "Remove all of my reviews": function () {
                submit(django_url + projectID + "/skeleton/" + skeletonID + "/review/" + fnName, {},
                  function (json) {
                    self.startReviewActiveSkeleton();
                  });
                $(this).dialog('destroy');
              }
            }
          });
    };

    this.resetOwnRevisions = function() {
      resetFn("reset-own");
    };

    var loadImageCallback = function (container, name, queuedTiles, cachedTiles) {
      $(container).text(name + ': ' + cachedTiles + '/' + (cachedTiles + queuedTiles));
    };

    this.cacheImages = function() {
      if (!checkSkeletonID()) {
        return;
      }
      var startsegment = -1, endsegment = 0, locations = [];
      var reviewedByCurrentUser = reviewedByUser.bind(self, session.userid);

      for(var idx in self.skeleton_segments) {
        if( self.skeleton_segments[idx]['status'] !== "100.00" ) {
          if( startsegment == -1)
            startsegment = idx;
          var seq = self.skeleton_segments[idx]['sequence'];
          for(var i = 0; i < self.skeleton_segments[idx]['nr_nodes']; i++ ) {
            if(!seq[i]['rids'].some(reviewedByCurrentUser)) {
              locations.push([seq[i].x, seq[i].y, seq[i].z]);
            }
          }
          endsegment = idx;
        }
        if (locations.length > 500)
          break;
      }

      $('#counting-cache-info').text( 'From segment: ' + startsegment + ' to ' + endsegment );
      var counterContainer = $('#counting-cache');
      counterContainer.empty();
      project.getStackViewers().forEach(function(stackViewer) {
        var tilelayer = stackViewer.getLayer('TileLayer');
        // Create loading information text for each stack viewer.
        var layerCounter = document.createElement('div');
        counterContainer.append(layerCounter);
        if (tilelayer) {
          tilelayer.cacheLocations(locations,
              loadImageCallback.bind(self, layerCounter, stackViewer.primaryStack.title));
        }
      });
    };
  }();

  // Register to the active node change event
  SkeletonAnnotations.on(SkeletonAnnotations.EVENT_ACTIVE_NODE_CHANGED,
    CATMAID.ReviewSystem.handleActiveNodeChange, CATMAID.ReviewSystem);

  CATMAID.ReviewSystem.STATUS_COLOR_FULL    = '#6fff5c';
  CATMAID.ReviewSystem.STATUS_COLOR_PARTIAL = '#ffc71d';
  CATMAID.ReviewSystem.STATUS_COLOR_NONE    = '#ff8c8c';

  /**
   * Support function for selecting a background color based on review state.
   */
  CATMAID.ReviewSystem.getBackgroundColor = function(reviewed) {
    if (100 === reviewed) {
    return CATMAID.ReviewSystem.STATUS_COLOR_FULL;
    } else if (0 === reviewed) {
    return CATMAID.ReviewSystem.STATUS_COLOR_NONE;
    } else {
    return CATMAID.ReviewSystem.STATUS_COLOR_PARTIAL;
    }
  };

  CATMAID.ReviewSystem.Whitelist = (function () {
    var whitelist = {};

    return {
      /**
       * Returns a copy of the internal whitelist.
       */
      getWhitelist: function () {
        return $.extend(true, {}, whitelist);
      },

      /**
       * Adds a reviewer to the whitelist, optionally specifying a time after
       * which their reviews are accepted. Adding a user already in the
       * whitelist will overwrite this time.
       */
      addReviewer: function (userId, acceptAfter) {
        // Default acceptAfter to effectively accept all reviews by setting to
        // the UNIX time epoch.
        if (typeof acceptAfter === 'undefined') acceptAfter = new Date(+0);
        // Coerce other date representations into Date objects
        else if (!(acceptAfter instanceof Date)) {
          acceptAfter = new Date(acceptAfter);
          if (isNaN(acceptAfter.getTime())) {
            CATMAID.msg('ERROR', 'Accept after date is invalid');
            return this;
          }
        }

        if (!(userId in CATMAID.User.all())) {
          CATMAID.msg('ERROR', 'Reviewer does not have a valid user ID');
          return this;
        }

        // Add new reviewer to whitelist
        whitelist[userId] = acceptAfter;

        return this;
      },

      /**
       * Removes a reviewer from the whitelist.
       */
      removeReviewer: function (userId) {
        delete whitelist[userId];

        return this;
      },

      /**
       * Retrieves the whitelist from the server.
       */
      refresh: function (callback) {
        // If no project is open or no user is logged in, clear the whitelist.
        if (typeof project === 'undefined' || !project || typeof session === 'undefined') {
          whitelist = {};
          return;
        }

        requestQueue.register(
            django_url + project.id + '/user/reviewer-whitelist',
            'GET',
            undefined,
            CATMAID.jsonResponseHandler(function (json) {
              whitelist = json.reduce(function (wl, entry) {
                wl[entry.reviewer_id] = new Date(entry.accept_after);
                return wl;
              }, {});
              if (typeof callback === 'function') callback();
            }));
      },

      /**
       * Saves the current state of the whitelist to the server.
       */
      save: function (callback) {
        // If no user is logged in, do not attempt to save the whitelist.
        if (typeof session === 'undefined') return;

        var encodedWhitelist = Object.keys(whitelist).reduce(function (ewl, userId) {
          ewl[userId] = whitelist[userId].toISOString();
          return ewl;
        }, {});
        requestQueue.replace(
            django_url + project.id + '/user/reviewer-whitelist',
            'POST',
            encodedWhitelist,
            callback,
            'reviewerwhitelist' + project.id);
      }
    };
  })();

  CATMAID.Init.on(CATMAID.Init.EVENT_PROJECT_CHANGED, CATMAID.ReviewSystem.Whitelist.refresh);
  CATMAID.Init.on(CATMAID.Init.EVENT_USER_CHANGED, CATMAID.ReviewSystem.Whitelist.refresh);
})(CATMAID);
