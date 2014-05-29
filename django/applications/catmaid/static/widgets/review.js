/* -*- mode: espresso; espresso-indent-level: 4; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=4 shiftwidth=4 tabstop=4 expandtab: */

var ReviewSystem = new function()
{
    var projectID, skeletonID;
    var self = this;
    self.skeleton_segments = null;
    self.current_segment = null;
    self.current_segment_index = 0;
    var tile_image_counter = 0,
        total_count = 0,
        end_puffer_count = 0,
        autoCentering = true,
        followedUsers = [];

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
        self.current_segment = self.skeleton_segments[id];
        self.current_segment_index = 0;
        self.goToNodeIndexOfSegmentSequence(0, true);
        end_puffer_count = 0;
        // Highlight current segement in table
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
        if (self.skeleton_segments===null)
            return;
        if( self.current_segment_index == 0 ) {
            self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index] );
            // Go to 'previous' section, to check whether an end really ends
            var segment = self.current_segment['sequence'];
            if (segment.length > 1) {
                var i = 1;
                while (i < segment.length && segment[i-1].z === segment[i].z) {
                    i += 1;
                }
                if (i === segment.length) {
                    // corner case
                    growlAlert("Can't move", "Can't decide whether to move forward or backward one section!");
                    return; 
                }
                var inc = segment[i-1].z - segment[i].z;
                // Will check stack boundaries at Stack.moveTo
                project.moveTo(segment[0].z + inc, segment[0].y, segment[0].x);
            }
            return;
        }
        self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index] );
        self.current_segment_index--;
        self.goToNodeIndexOfSegmentSequence( self.current_segment_index );
    };

    this.moveNodeInSegmentForward = function(evt) {
        if (self.skeleton_segments===null)
            return;
        if( self.current_segment_index === self.current_segment['sequence'].length - 1  ) {
            if( $('#remote_review_skeleton').attr('checked') ) {
                self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index] );
                end_puffer_count += 1;
                // do not directly jump to the next segment to review
                if( end_puffer_count < 3) {
                    growlAlert('DONE', 'Segment fully reviewed: ' + self.current_segment['nr_nodes'] + ' nodes');
                    return;
                }
                // Segment fully reviewed, go to next without refreshing table
                // much faster for smaller fragments
                // growlAlert('DONE', 'Segment fully reviewed: ' + self.current_segment['nr_nodes'] + ' nodes');
                var cell = $('#rev-status-cell-' + self.current_segment['id']);
                cell.text('100.00%');
                cell.css('background-color', '#6fff5c');
                self.current_segment['status'] = '100.00';
                self.selectNextSegment();
                return;
            } else {
                self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index] );
                self.startSkeletonToReview(skeletonID);
                return;                
            }
        }

        self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index] );
        self.current_segment_index++;

        if (evt.shiftKey) {
            // Advance current_segment_index to the first node that is not reviewed
            // which is a node with no reviewer of the current user.
            var i = self.current_segment_index;
            var seq = self.current_segment['sequence'];
            var len = seq.length;
            while (i < len) {
                if (-1 === seq[i].rids.indexOf(session.userid)) {
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
            while (i_user < len && -1 !== seq[i_user].rids.indexOf(session.userid)) {
                i_user += 1;
            }
            while (i_union < len && 0 !== seq[i_union].rids.length) {
                i_union += 1;
            }
            if (i_user === len) {
                growlAlert('DONE', 'Segment fully reviewed: ' + self.current_segment['nr_nodes'] + ' nodes');
                var cell = $('#rev-status-cell-' + self.current_segment['id'] + '-' + session.userid);
                cell.text('100.00%');
                cell.css('background-color', '#6fff5c');
                self.current_segment['status'] = '100.00';
                // Don't startSkeletonToReview, because self.current_segment_index
                // would be lost, losing state for q/w navigation.
            }
            if (i_union === len) {
                var cell = $('#rev-status-cell-' + self.current_segment['id'] + '-union');
                cell.text('100.00%');
                cell.css('background-color', '#6fff5c');
                self.current_segment['status'] = '100.00';
                // Don't startSkeletonToReview, because self.current_segment_index
                // would be lost, losing state for q/w navigation.
            }
        }

        self.goToNodeIndexOfSegmentSequence( self.current_segment_index );
    };

    var submit = typeof submitterFn!= "undefined" ? submitterFn() : undefined;

    this.markAsReviewed = function( node_ob ) {
        submit(django_url+projectID+"/node/" + node_ob['id'] + "/reviewed", {},
                function(json) {
                    if (json.reviewer_id) {
                        // Append the new review to the list of reviewers of
                        // this node, if not already present.
                        if (node_ob['rids'].indexOf(json.reviewer_id) === -1) {
                            node_ob['rids'].push(json.reviewer_id);
                        };
                    }
                });
    };

    this.selectNextSegment = function( ev ) {
        if (self.skeleton_segments) {
            // Find out the index of the current segment
            var index = self.current_segment ? self.skeleton_segments.indexOf(self.current_segment) : -1;
            /**
             * Support function to test whether a node hasn't been reviewed by
             * any of the followed reviewers. This is the case if the list of
             * reviewers is empty or no followed reviewer appears in it.
             */
            var unreviewed_nodes = function(node) {
                return 0 === node['rids'].length || followedUsers.every(function(rid) {
                    return -1 === node['rids'].indexOf(rid);
                });
            };
            /**
             * Support function to test whether a sgement has't been reviewed by
             * any of the followed reviewers. If it has not been reviewed, a new
             * review for it is started as a side effect.
             */
            var unreviewed_segments = function(segment, i) {
                if (segment['sequence'].some(unreviewed_nodes)) {
                    // Side effect which actually triggers the selection of the
                    // next segment.
                    self.initReviewSegment(i);
                    return true;
                }
                return false;
            };
            // Find a segment with unreviewed nodes, starting after current segment
            if (self.skeleton_segments.some(unreviewed_segments)) {
                return;
            }
            growlAlert("Done", "Done reviewing.");
        }
    };

    /** Clears the #review_segment_table prior to adding rows to it. */
    this.createReviewSkeletonTable = function( skeleton_data, users ) {
        self.skeleton_segments = skeleton_data;
        var butt, table, tbody, row;
        if( $('#review_segment_table').length > 0 ) {
            $('#review_segment_table').remove();
        }
        
        // Count which user reviewed how many nodes
        // Map of user ID vs object containing name and count:
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
        // TODO count is wrong because branch points are repeated. Would have to create sets and then count the number of keys.
        users[-1] = {name: '3lunreviewed', count: 0};

        // Fill in the users count:
        skeleton_data.forEach(function(segment) {
            segment['sequence'].forEach(function(node) {
               node['rids'].forEach(function(rid) {
                    users[rid].count += 1;
                    users[rid].segment_count[segment.id] += 1;
                });
            });
        });
        // Create a list of all users who have reviewed this neuron. Add the
        // current useser as first element, regardless of his/her review status.
        var reviewers = Object.keys(users).filter(function(u) {
            // u is a string, so rely on != for comparing to (integer) user ID.
            return this[u].count > 0 && u != session.userid;
        }, users);
        // Prepend user ID
        reviewers = [session.userid].concat(reviewers);
        // Make sure all IDs are actual numbers
        reviewers = reviewers.map(function(u){ return parseInt(u); });

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
        if (reviewers.length > 1) {
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
            if (reviewers.length > 1) {
              // The reviewers array contains oneself as first element
              reviewers.forEach(function(r) {
                  var seg_status = (100 * users[r].segment_count[sd.id] /
                          sd.nr_nodes).toFixed(2);
                  this.append($('<td />').text(seg_status + '%')
                          .attr('id', 'rev-status-cell-' + sd.id + '-' + r)
                          .css('background-color',
                                  ReviewSystem.getBackgroundColor(Math.round(seg_status))));
              }, row);
            }
            // Union status
            var status = $('<td />')
                    .attr('id', 'rev-status-cell-' + sd.id + '-union')
                    .text( skeleton_data[e]['status']+'%' )
                    .css('background-color',
                            ReviewSystem.getBackgroundColor(parseInt(sd.status)));
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
            $('#growl-alert').growlAlert({
                autoShow: true,
                content: 'You need to activate a skeleton to review.',
                title: 'BEWARE',
                position: 'top-right',
                delayTime: 2500,
                onComplete: function() { g.remove(); }
            });
            return false;
        }
        return true;
    };

    this.startSkeletonToReview = function( skid ) {
        if (!skid) {
            skeletonID = SkeletonAnnotations.getActiveSkeletonId();
        }
        if (!checkSkeletonID()) {
            return;
        }
        // empty caching text
        $('#counting-cache').text('');

        submit(django_url + "accounts/" + projectID + "/all-usernames", {},
            function(usernames) {
                submit(django_url + projectID + "/skeleton/" + skeletonID + "/review", {},
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
                self.startSkeletonToReview();
            });
    };

    this.resetOwnRevisions = function() {
        resetFn("reset-own");
    };

    var loadImageCallback = function( imageArray ) {
        if( imageArray.length == 0 )
            return;
        var src = imageArray.pop();
        var image = new Image();
        image.src = src;
        image.onload = image.onerror = function(e) {
            $('#counting-cache').text( total_count - imageArray.length + '/' + total_count );
            loadImageCallback( imageArray );
        };
    }

    this.cacheImages = function() {
        if (!checkSkeletonID()) {
            return;
        }
        var tilelayer = project.focusedStack.getLayers()['TileLayer'];
            stack = project.focusedStack,
            tileWidth = tilelayer.getTileWidth(),
            tileHeight = tilelayer.getTileHeight(),
            max_column = parseInt( stack.dimension.x / tileWidth ),
            max_row = parseInt( stack.dimension.y / tileHeight )
            startsegment = -1, endsegment = 0; tile_counter = 0;
        var s = [];
        for(var idx in self.skeleton_segments) {
            if( self.skeleton_segments[idx]['status'] !== "100.00" ) {
                if( startsegment == -1)
                    startsegment = idx;
                var seq = self.skeleton_segments[idx]['sequence'];
                for(var i = 0; i < self.skeleton_segments[idx]['nr_nodes']; i++ ) {
                    if(-1 === seq[i]['rids'].indexOf(session.userid)) {
                        var c = parseInt( seq[i].x / stack.resolution.x / tileWidth),
                            r = parseInt( seq[i].y / stack.resolution.y / tileHeight );
                        for( var rowidx = r-1; rowidx <= r+1; rowidx++ ) {
                            for( var colidx = c-1; colidx <= c+1; colidx++ ) {
                                if( colidx < 0 || colidx > max_column || rowidx < 0 || rowidx > max_row )
                                    continue;
                                var tileBaseName = getTileBaseName( [ seq[i].x, seq[i].y, parseInt( seq[i].z / stack.resolution.z ) ] );
                                s.push( tilelayer.tileSource.getTileURL( project, stack, tileBaseName, tileWidth, tileHeight, colidx, rowidx, 0) );                                
                                tile_counter++;
                            }
                        }
                    }
                }
                endsegment = idx;
            }
            if(tile_counter > 3000)
                break;
        }
        total_count = s.length;
        $('#counting-cache-info').text( 'From segment: ' + startsegment + ' to ' + endsegment );
        loadImageCallback( s );
    }

};

/**
 * Support function for selecting a background color based on review state.
 */
ReviewSystem.getBackgroundColor = function(reviewed) {
  if (100 === reviewed) {
    return '#6fff5c';
  } else if (0 === reviewed) {
    return '#ff8c8c';
  } else {
    return '#ffc71d';
  }
};
