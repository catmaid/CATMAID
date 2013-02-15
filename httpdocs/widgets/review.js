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

    this.initReviewSegment = function( id ) {
        self.current_segment = self.skeleton_segments[id];
        self.current_segment_index = 0;
        self.goToNodeIndexOfSegmentSequence( 0 );
    };

    this.goToNodeIndexOfSegmentSequence = function( idx ) {
        if (self.skeleton_segments===null)
            return;
        var node = self.current_segment['sequence'][idx];
        project.moveTo(node.z, node.y, node.x, undefined,
         function () {
            SkeletonAnnotations.staticSelectNode( node.id, skeletonID );
         });
    };

    this.moveNodeInSegmentBackward = function() {
        if (self.skeleton_segments===null)
            return;
        if( self.current_segment_index == 0 ) {
            self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index], self.startSkeletonToReview );
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
            self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index], self.startSkeletonToReview );
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

    this.markAsReviewed = function( node_ob, funct ) {
        requestQueue.register(
            "dj/"+projectID+"/node/" + node_ob['id'] + "/reviewed",
            "POST",
            {},
            function (status, text) {
                var json = $.parseJSON(text);
                if (json.error) {
                    alert( json.error );
                } else {
                    // Mark locally as reviewed
                    node_ob['rid'] = json.reviewer_id;
                    // Execute continuation if any
                    if( funct )
                        funct();
                }
            });
    };

    /** Clears the #review_segment_table prior to adding rows to it. */
    this.createReviewSkeletonTable = function( skeleton_data ) {
        self.skeleton_segments = skeleton_data;
        var butt, table, tbody, row;
        if( $('#review_segment_table').length > 0 ) {
            $('#review_segment_table').remove();
        }
        $('#reviewing_skeleton').text( 'Skeleton ID under review: ' + skeletonID );
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

    this.startSkeletonToReview = function( ) {
        skeletonID = SkeletonAnnotations.getActiveSkeletonId();
        if (!checkSkeletonID()) {
            return;
        }
        requestQueue.replace(
            "dj/"+projectID+"/skeleton/" + skeletonID + "/review",
            "POST",
            {},
            function (status, text) {
                if (200 !== status) { return; }
                var skeleton_data = $.parseJSON(text);
                if (skeleton_data.error) {
                    if ("REPLACED" === skeleton_data.error) { return; }
                    alert( skeleton_data.error );
                } else {
                    self.createReviewSkeletonTable( skeleton_data );
                }
            },
            "start_review_skeleton");
    };

    var resetFn = function(fnName) {
        if (!checkSkeletonID()) {
            return;
        }
        if (!confirm("Are you sure you want to alter the review state of skeleton #" + skeletonID + " with '" + fnName + "' ?")) {
            return;
        }
        requestQueue.replace(
            "dj/"+projectID+"/skeleton/" + skeletonID + "/review/" + fnName,
            "POST",
            {},
            function (status, text) {
                if (200 !== status) { return; }
                var json = $.parseJSON(text);
                if (json.error) {
                    if ("REPLACED" === json.error) { return; }
                    alert(json.error);
                    return;
                }
                self.startSkeletonToReview();
            },
            "review_" + fnName);
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
