/* -*- mode: espresso; espresso-indent-level: 4; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=4 shiftwidth=4 tabstop=4 expandtab: */

var ReviewSystem = new function()
{
    var projectID, skeletonID;
    var self = this;
    self.skeleton_segments = null;
    self.current_segment = null;
    self.current_segment_index = 0;

    this.init = function() {
        projectID = project.id;
    };

    this.validSegment = function() {
        if(self.current_segment !== null) {
            return true;
        } else {
            return false;
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
        self.current_segment = self.skeleton_segments[id];
        self.current_segment_index = 0;
        self.goToNodeIndexOfSegmentSequence( 0 );
    };

    this.goToNodeIndexOfSegmentSequence = function( idx ) {
        if (self.skeleton_segments===null)
            return;
        var node = self.current_segment['sequence'][idx];
        SkeletonAnnotations.staticMoveTo(node.z, node.y, node.x,
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
            self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index] );
            self.startSkeletonToReview(skeletonID);
            return;
        }

        self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index] );
        self.current_segment_index++;

        if (evt.shiftKey) {
            // Advance current_segment_index to the first node that is not reviewed
            // which is a node with rid (reviewer id) of -1.
            var i = self.current_segment_index;
            var seq = self.current_segment['sequence'];
            var len = seq.length;
            while (i < len) {
                if (-1 === seq[i].rid) {
                    self.current_segment_index = i;
                    break;
                }
                i += 1;
            }
        }

        if (self.current_segment_index < self.current_segment['sequence'].length -1) {
            // Check if the remainder of the segment was complete at an earlier time
            // and perhaps now the whole segment is done:
            var i = self.current_segment_index;
            var seq = self.current_segment['sequence'];
            var len = seq.length;
            while (i < len && -1 !== seq[i].rid) {
                i += 1;
            }
            if (i === len) {
                growlAlert('DONE', 'Segment fully reviewed: ' + self.current_segment['nr_nodes'] + ' nodes');
                var cell = $('#rev-status-cell-' + self.current_segment['id']);
                cell.text('100.00%');
                cell.css('background-color', '#6fff5c');
                // Don't startSkeletonToReview, because self.current_segment_index
                // would be lost, losing state for q/w navigation.
            }
        }

        self.goToNodeIndexOfSegmentSequence( self.current_segment_index );
    };

    var submit = typeof submitterFn!= "undefined" ? submitterFn() : undefined;

    this.markAsReviewed = function( node_ob ) {
        submit(django_url+projectID+"/node/" + node_ob['id'] + "/reviewed", {}, function(json) { node_ob['rid'] = json.reviewer_id;} );
    };

    this.selectNextSegment = function( ev ) {
        if (self.skeleton_segments) {
            // Find out the index of the current segment
            var index = self.current_segment ? self.skeleton_segments.indexOf(self.current_segment) : -1;
            // Define helper functions
            var unreviewed_nodes = function (node) { return -1 === node['rid']; };
            var unreviewed_segments = function(segment, i) {
                if (segment['sequence'].some(unreviewed_nodes)) {
                    // Side effect:
                    self.initReviewSegment(i);
                    return true;
                }
                return false;
            };
            // Find a segment with unreviewed nodes, starting after current segment
            if (self.skeleton_segments.slice(index + 1).some(unreviewed_segments)) {
                return;
            }
            // Not found after segment at index; check before:
            if (self.skeleton_segments.slice(0, index + 1).some(unreviewed_segments)) {
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
            map[u[0]] = {name: u[1], count: 0};
            return map;
        }, {});
        // TODO count is wrong because branch points are repeated. Would have to create sets and then count the number of keys.
        users[-1] = {name: 'unreviewed', count: 0};
        // Fill in the users count:
        skeleton_data.forEach(function(segment) {
            segment['sequence'].forEach(function(node) {
                users[node['rid']].count += 1;
            });
        });
        // Create string with user's reviewed counts:
        var user_revisions = Object.keys(users).reduce(function(s, u) {
            u = users[u];
            if (u.count > 0) { s += u.name + ": " + u.count + "; "; }
            return s;
        }, "");

        $('#reviewing_skeleton').text( 'Skeleton ID under review: ' + skeletonID + " -- " + user_revisions );
        table = $('<table />').attr('cellpadding', '3').attr('cellspacing', '0').attr('id', 'review_segment_table').attr('border', '0');
        // create header
        thead = $('<thead />');
        table.append( thead );
        row = $('<tr />')
        row.append( $('<td />').text("") );
        row.append( $('<td />').text("Status") );
        row.append( $('<td />').text("# nodes") );
        thead.append( row );
        tbody = $('<tbody />');
        table.append( tbody );
        // create a row
        for(var e in skeleton_data ) {
            row = $('<tr />');
            row.append( $('<td />').text( skeleton_data[e]['id'] ) );
            var status = $('<td id="rev-status-cell-' + skeleton_data[e]['id'] + '" />').text( skeleton_data[e]['status']+'%' );
            row.append( status );
            row.append( $('<td align="right" />').text( skeleton_data[e]['nr_nodes'] ) );
            if( parseInt( skeleton_data[e]['status']) === 0 ) {
                status.css('background-color', '#ff8c8c');
            } else if( parseInt( skeleton_data[e]['status']) === 100 ) {
                status.css('background-color', '#6fff5c');
            } else {
                status.css('background-color', '#ffc71d');
            }
            butt = $('<button />').text( "Review" );
            butt.attr( 'id', 'reviewbutton_'+skeleton_data[e]['id'] );
            butt.click( function() {
                self.initReviewSegment( this.id.replace("reviewbutton_", "") );
            });
            row.append( butt );
            tbody.append( row );
        }
        // empty row
        row = $('<tr />');
        tbody.append( row );
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

    this.resetAllRevisions = function() {
        resetFn("reset-all");
    };

    this.resetOwnRevisions = function() {
        resetFn("reset-own");
    };

    this.resetRevisionsByOthers = function() {
        resetFn("reset-others");
    };
};
