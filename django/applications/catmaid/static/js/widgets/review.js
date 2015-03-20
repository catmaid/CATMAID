/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
*/

(function(CATMAID) {

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

    this.init = function() {
      projectID = project.id;
      followedUsers = [session.userid];
    };

    this.setAutoCentering = function(centering) {
      autoCentering = centering ? true : false;
    };

    this.validSegment = function() {
      return self.current_segment !== null;
    };

    /**
     * If the active skeleton changes, the review system will register it. The
     * widget will make sure the view is centered at the last active node, when
     * review is continued.
     */
    this.handleActiveNodeChange = function(node) {
      var segment = this.current_segment ? this.current_segment['sequence'] : null;
      var index = this.current_segment_index;
      // If there is an active segment and no node is selected anymore or the
      // node change, mark the current segment as unfocused.
      if (segment && (!node || segment[index].id !== node.id)) {
        this.segmentUnfocused = true;
      }
    };

    this.endReview = function() {
      self.skeleton_segments = null;
      self.current_segment = null;
      self.current_segment_index = 0;
      if( $('#review_segment_table').length > 0 )
        $('#review_segment_table').remove();
        $('#reviewing_skeleton').text( '' );
    };

    /** @param id The index of the segment, 0-based. */
    this.initReviewSegment = function( id ) {
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

    this.goToNodeIndexOfSegmentSequence = function(idx, forceCentering) {
      if (self.skeleton_segments===null)
        return;
      var node = self.current_segment['sequence'][idx];
      SkeletonAnnotations.staticMoveTo(
        node.z,
        autoCentering || forceCentering ? node.y : project.coordinates.y,
        autoCentering || forceCentering ? node.x : project.coordinates.x,
        function () {
           SkeletonAnnotations.staticSelectNode( node.id, skeletonID );
        });
    };

    this.moveNodeInSegmentBackward = function() {
      if (null === self.skeleton_segments) {
        return;
      }

      self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index] );

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

      if(self.current_segment_index > 0) {
        if (changeSelectedNode) {
          self.warnIfNodeSkipsSections();
          self.current_segment_index--;
        }
        self.goToNodeIndexOfSegmentSequence(self.current_segment_index, forceCentering);
      } else {
        // Go to 'previous' section, to check whether an end really ends
        var segment = self.current_segment['sequence'];
        if (segment.length > 1) {
          var i = 1;
          while (i < segment.length && segment[i-1].z === segment[i].z) {
            i += 1;
          }
          if (i === segment.length) {
            // corner case
            CATMAID.msg("Can't move", "Can't decide whether to move " +
                "forward or backward one section!");
            return;
          }
          self.movedBeyondSegment = true;
          var inc = segment[i-1].z - segment[i].z;
          // Will check stack boundaries at Stack.moveTo
          if (this.autoCentering || forceCentering) {
            project.moveTo(segment[0].z + inc, segment[0].y, segment[0].x);
          } else {
            project.moveTo(segment[0].z + inc, project.coordinates.y,
               project.coordinates.x);
          }
        }
      }
    };

    this.moveNodeInSegmentForward = function(advanceToNextUnfollowed) {
      if (self.skeleton_segments===null)
        return;

      // Mark current node as reviewed
      self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index] );

      if( self.current_segment_index === self.current_segment['sequence'].length - 1  ) {
        if( $('#remote_review_skeleton').attr('checked') ) {
          end_puffer_count += 1;
          // do not directly jump to the next segment to review
          if( end_puffer_count < 3) {
            CATMAID.msg('DONE', 'Segment fully reviewed: ' +
                self.current_segment['nr_nodes'] + ' nodes');
            return;
          }
          // Segment fully reviewed, go to next without refreshing table
          // much faster for smaller fragments
          // CATMAID.msg('DONE', 'Segment fully reviewed: ' + self.current_segment['nr_nodes'] + ' nodes');
          var cell = $('#rev-status-cell-' + self.current_segment['id']);
          cell.text('100.00%');
          cell.css('background-color', CATMAID.ReviewSystem.STATUS_COLOR_FULL);
          self.current_segment['status'] = '100.00';
          self.selectNextSegment();
          return;
        } else {
          self.startSkeletonToReview(skeletonID, subarborNodeId);
          return;
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
        self.current_segment_index++;

        if (advanceToNextUnfollowed) {
          // Advance current_segment_index to the first node that is not reviewed
          // by the current user.
          var i = self.current_segment_index;
          var seq = self.current_segment['sequence'];
          var len = seq.length;
          while (i < len) {
            if (!seq[i].rids.some(reviewedByUser)) {
              self.current_segment_index = i;
              break;
            }
            i += 1;
          }
        }

        if (self.current_segment_index < self.current_segment['sequence'].length -1) {
          // Check if the remainder of the segment was complete at an earlier time
          // and perhaps now the whole segment is done:
          var i_user = self.current_segment_index;
          var i_union = self.current_segment_index;
          var seq = self.current_segment['sequence'];
          var len = seq.length;
          while (i_user < len && seq[i_user].rids.some(reviewedByUser)) {
            i_user += 1;
          }
          while (i_union < len && 0 !== seq[i_union].rids.length) {
            i_union += 1;
          }
          if (i_user === len) {
            CATMAID.msg('DONE', 'Segment fully reviewed: ' +
                self.current_segment['nr_nodes'] + ' nodes');
            var cell = $('#rev-status-cell-' + self.current_segment['id'] + '-' + session.userid);
            cell.text('100.00%');
            cell.css('background-color', CATMAID.ReviewSystem.STATUS_COLOR_FULL);
            self.current_segment['status'] = '100.00';
            // Don't startSkeletonToReview, because self.current_segment_index
            // would be lost, losing state for q/w navigation.
          }
          if (i_union === len) {
            var cell = $('#rev-status-cell-' + self.current_segment['id'] + '-union');
            cell.text('100.00%');
            cell.css('background-color', CATMAID.ReviewSystem.STATUS_COLOR_FULL);
            self.current_segment['status'] = '100.00';
            // Don't startSkeletonToReview, because self.current_segment_index
            // would be lost, losing state for q/w navigation.
          }
        }

        self.warnIfNodeSkipsSections();
      }

      // Select the (potentially new) current node
      self.goToNodeIndexOfSegmentSequence(self.current_segment_index, forceCentering);
    };

    /**
     * Tests if a review was reviewd by the current user
     */
    function reviewedByUser(review)
    {
      return session.userid === review[0];
    }

    this.warnIfNodeSkipsSections = function () {
      if (0 === self.current_segment_index) {
        return;
      }
      var zdiff = (self.current_segment.sequence[self.current_segment_index].z -
            self.current_segment.sequence[self.current_segment_index-1].z) /
            project.focusedStack.resolution.z;
      if (Math.abs(zdiff) > 1) CATMAID.msg("Skipped sections",
        "This node is " + Math.abs(zdiff) + " sections away from the previous node.",
        {style: 'warning'});
    };

    var submit = typeof submitterFn!= "undefined" ? submitterFn() : undefined;

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
      whitelistUser = {name: 'Team', count: 0,
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
          cb.attr('checked', 'checked');
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
          submit(django_url + projectID + "/skeleton/" + skeletonID + "/review",
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
      if (!confirm("Are you sure you want to alter the review state of skeleton #" + skeletonID + " with '" + fnName + "' ?")) {
        return;
      }
      submit(django_url+projectID+"/skeleton/" + skeletonID + "/review/" + fnName, {},
        function(json) {
          self.startReviewActiveSkeleton();
        });
    };

    this.resetOwnRevisions = function() {
      resetFn("reset-own");
    };

    var loadImageCallback = function (queuedTiles, cachedTiles) {
      $('#counting-cache').text(cachedTiles + '/' + (cachedTiles + queuedTiles));
    };

    this.cacheImages = function() {
      if (!checkSkeletonID()) {
        return;
      }
      var tilelayer = project.focusedStack.getLayers()['TileLayer'],
        startsegment = -1, endsegment = 0, locations = [];

      for(var idx in self.skeleton_segments) {
        if( self.skeleton_segments[idx]['status'] !== "100.00" ) {
          if( startsegment == -1)
            startsegment = idx;
          var seq = self.skeleton_segments[idx]['sequence'];
          for(var i = 0; i < self.skeleton_segments[idx]['nr_nodes']; i++ ) {
            if(!seq[i]['rids'].some(reviewedByUser)) {
              locations.push([seq[i].x, seq[i].y, seq[i].z]);
            }
          }
          endsegment = idx;
        }
        if (locations.length > 500)
          break;
      }

      $('#counting-cache-info').text( 'From segment: ' + startsegment + ' to ' + endsegment );
      tilelayer.cacheLocations(locations, loadImageCallback);
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

      if (!(userId in User.all())) {
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
      if (typeof project === 'undefined' || typeof session === 'undefined') {
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
})(CATMAID);
