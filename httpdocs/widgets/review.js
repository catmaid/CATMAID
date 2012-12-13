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
    }

    this.validSegment = function() {
        if(self.current_segment !== null) {
            return true;
        } else {
            return false;
        }
    }

    this.resetReview = function() {
        self.skeleton_segments = null;
        self.current_segment = null;
        self.current_segment_index = 0;
        if( $('#review_segment_table').length > 0 )
            $('#review_segment_table').remove();
            $('#reviewing_skeleton').text( '' );
    }

    this.initReviewSegment = function( id ) {
        self.current_segment = self.skeleton_segments[id];
        self.current_segment_index = 0;
        self.goToNodeIndexOfSegmentSequence( 0 );
    }

    this.goToNodeIndexOfSegmentSequence = function( idx ) {
        if (self.skeleton_segments===null)
            return;
        var node = self.current_segment['sequence'][idx];
        project.moveTo(node.z, node.y, node.x, undefined,
         function () {
            SkeletonAnnotations.staticSelectNode( node.id );
         });
    }

    this.moveNodeInSegmentBackward = function() {
        if (self.skeleton_segments===null)
            return;
        if( self.current_segment_index == 0 ) {
            self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index]['id'], self.startSkeletonToReview );
            return;
        }
        self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index]['id'] );
        self.current_segment_index--;
        self.goToNodeIndexOfSegmentSequence( self.current_segment_index );
    }

    this.moveNodeInSegmentForward = function() {
        if (self.skeleton_segments===null)
            return;
        if( self.current_segment_index === self.current_segment['sequence'].length - 1  ) {
            self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index]['id'], self.startSkeletonToReview );
            return;
        }
        self.markAsReviewed( self.current_segment['sequence'][self.current_segment_index]['id'] );
        self.current_segment_index++;
        self.goToNodeIndexOfSegmentSequence( self.current_segment_index );
    }

    this.markAsReviewed = function( node_id, funct ) {
        jQuery.ajax({
                url: "dj/"+projectID+"/node/" + node_id + "/reviewed",
            type: "GET",
            dataType: "json",
            success: function (data) {
                if (data.error) {
                    alert( data.error );
                } else {
                    if( funct )
                        funct();
                }
            }
        });
    }

    this.createReviewSkeletonTable = function( skeleton_data ) {
        self.skeleton_segments = skeleton_data;
        var butt, table, tbody, row;
        if( $('#review_segment_table').length > 0 ) {
            $('#review_segment_table').remove();
        }
        $('#reviewing_skeleton').text( 'Skeleton ID under review: ' + skeletonID );
        table = $('<table />').attr('cellpadding', '3').attr('cellspacing', '0').attr('width', '420').attr('id', 'review_segment_table').attr('border', '0');
        // create header
        thead = $('<thead />');
        table.append( thead );
        row = $('<tr />')
        row.append( $('<td />').text("SegmentID") );
        row.append( $('<td />').text( "Start-End") );
        row.append( $('<td />').text("Status") );
        row.append( $('<td />').text("# nodes") );
        thead.append( row );
        tbody = $('<tbody />');
        table.append( tbody );
        // create a row
        for(var e in skeleton_data ) {
            row = $('<tr />');
            row.append( $('<td />').text( skeleton_data[e]['id'] ) );
            row.append( $('<td />').text( skeleton_data[e]['type'] ) );
            var status = $('<td />').text( skeleton_data[e]['status']+'%' );
            row.append( status );
            row.append( $('<td />').text( skeleton_data[e]['nr_nodes'] ) );
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

    }

    this.startSkeletonToReview = function( ) {
        skeletonID = SkeletonAnnotations.getActiveSkeletonId();
        if (!skeletonID) {
            $('#growl-alert').growlAlert({
                autoShow: true,
                content: 'You need to activate a skeleton to review.',
                title: 'BEWARE',
                position: 'top-right',
                delayTime: 2500,
                onComplete: function() { g.remove(); }
            });
            return;
        }
        jQuery.ajax({
            url: "dj/"+projectID+"/skeleton/" + skeletonID + "/review",
            type: "GET",
            dataType: "json",
            success: function (skeleton_data) {
                if (skeleton_data.error) {
                    alert( skeleton_data.error );
                } else {
                    self.createReviewSkeletonTable( skeleton_data );
                }
            }
        });
    }
}
