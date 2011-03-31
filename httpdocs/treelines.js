/* -*- mode: espresso; espresso-indent-level: 4; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=4 shiftwidth=4 tabstop=4 expandtab: */

function strip(s) {
    return s.replace(/^\s*|\s*$/g,'');
}

function createTransformation( phi, theta, psi, scale ) {

    var R = $M( [ [ Math.cos(theta)*Math.cos(psi),
                    -Math.cos(phi)*Math.sin(psi) + Math.sin(phi)*Math.sin(theta)*Math.cos(psi),
                    Math.sin(phi)*Math.sin(psi) + Math.cos(phi)*Math.sin(theta)*Math.cos(psi) ],

                  [ Math.cos(theta)*Math.sin(psi),
                    Math.cos(phi)*Math.cos(psi) + Math.sin(phi)*Math.sin(theta)*Math.sin(psi),
                    -Math.sin(phi)*Math.cos(psi) + Math.cos(phi)*Math.sin(theta)*Math.sin(psi) ],

                  [ -Math.sin(theta),
                    Math.sin(phi)*Math.cos(theta),
                    Math.cos(phi)*Math.cos(theta) ] ] );

    var S = $M( [ [ scale, 0, 0 ],
                  [ 0, scale, 0 ],
                  [ 0, 0, scale ] ] );

    return R.x(S);
}

function basenameToURI( basename, extension ) {
    var fileName = basename + "." + extension;
    return staticURLPrefix + "data/" + encodeURIComponent(fileName);
}

$(document).ajaxError( function( event, request, ajaxOptions, thrownError ) {
        alert("Got an AJAX error with status: "+request.status+" for URL: "+ajaxOptions.url);
    } );

var contourPoints = [[ 45440.0,23412.0 ],
                     [ 44035.75551306795,22078.054025230456, 40362.54152325645,19242.228765625186, 39907.67847152703,19030.385714338456 ],
                     [ 39334.661701478275,18763.515014368288, 37691.03766178773,18434.077778279585, 37177.93187372308,18376.898382137864 ],
                     [ 36573.66098523684,18309.559744934046, 35087.513485536714,18125.945974769544, 34648.92193526726,18186.476975412024 ],
                     [ 34015.81441479562,18273.85356008376, 32538.966043627348,18524.342898247003, 32159.35085851966,18637.30203040264 ],
                     [ 31703.625020953114,18772.908816252933, 30821.67889629077,19747.863896010866, 30620.891984893533,20116.075317979426 ],
                     [ 30326.172415777328,20656.54436982686, 30159.377047414222,20842.83479811699, 29956.11290644027,21272.21018804248 ],
                     [ 29036.24448693205,23161.945974769544, 28583.681487254915,26130.05764655766, 28436.2115196483,26495.535735178724 ],
                     [ 28229.441784798433,27007.977751028346, 27838.890186114393,27673.945974769544, 27674.89018611439,28723.634323771228 ],
                     [ 27512.244486932053,29821.322672772912, 28047.925918490415,32105.048292659074, 28077.6686441035,32647.920264051947 ],
                     [ 28109.8483529266,33235.272687461314, 28460.244486932053,35833.945974769544, 29179.84666272881,37129.083283310174 ],
                     [ 29899.448838525568,38328.220591850804, 30649.554241923157,39147.822344128064, 30876.750905869652,39386.22269937407 ],
                     [ 31217.785158761722,39744.07428763362, 32682.09311507249,41409.60434565854, 32943.5423684686,41632.01093367125 ],
                     [ 33297.84378949376,41933.40391588364, 36279.306581994875,43413.95466121408, 36634.016092549085,43547.67629145105 ],
                     [ 37097.59639207245,43722.44102584216, 40220.244486932046,44378.733184913784, 41914.69985051082,43893.120533826965 ],
                     [ 42390.72171183402,43743.213199083446, 42591.40776747517,43700.98046542217, 42942.06410474228,43564.65575509983 ],
                     [ 43315.13104519369,43419.61847163235, 43397.07159373225,43274.46090094165, 43626.92368352175,43064.10129114225 ],
                     [ 43961.713531803085,42757.70311171409, 44154.32653722792,42698.9434014439, 44447.82022076082,42857.57641257072 ],
                     [ 44729.873324656364,43010.02580306536, 44830.35629830504,43126.33602367969, 44962.49282551844,43337.76910954032 ],
                     [ 45151.992013685456,43640.988809400675, 45500.24448693205,43993.945974769544, 46698.257344445876,45203.17166639282 ],
                     [ 47944.2702019597,46412.39735801609, 50108.24448693205,47065.945974769544, 52508.6749389097,46741.04509396855 ],
                     [ 54861.10539088735,46416.14421316755, 57299.05160290032,44009.94188916847, 57572.58984741341,43692.17155511297 ],
                     [ 57947.581528960654,43256.542408901936, 61048.355978608524,40496.602353580536, 61342.057880721695,40240.28685503134 ],
                     [ 61716.249798378354,39913.727213309, 62444.24448693205,39529.945974769544, 63813.83433933674,37788.31875672592 ],
                     [ 65183.424191741426,36094.6915386823, 66188.24448693206,33049.945974769544, 66236.24448693206,29161.945974769544 ],
                     [ 66236.24448693206,25273.945974769544, 63836.24448693205,22249.945974769544, 60956.24448693205,21529.945974769544 ],
                     [ 58076.24448693205,20857.945974769544, 52220.24448693205,22105.945974769544, 50492.24448693205,23641.945974769544 ],
                     [ 48812.24448693205,25177.945974769544, 48332.24448693205,26569.945974769544, 47228.24448693205,26377.945974769544 ],
                     [ 46124.24448693205,26137.945974769544, 46844.24448693205,24697.945974769544, 45440.0,23409.945974769544] ];

var contourMinX = Number.MAX_VALUE;
var contourMaxX = Number.MIN_VALUE;
var contourMinY = Number.MAX_VALUE;
var contourMaxY = Number.MIN_VALUE;
var contourMinZ = Number.MAX_VALUE;
var contourMaxZ = Number.MIN_VALUE;

for( var i = 0; i < contourPoints.length; ++i ) {
    var points = contourPoints[i];
    for( var j = 0; j < points.length / 2; ++j ) {
            var ox = points[2*j];
            var oy = points[2*j+1];
            var oz = 1237.5;
        contourMinX = Math.min( ox, contourMinX );
        contourMaxX = Math.max( ox, contourMaxX );
        contourMinY = Math.min( oy, contourMinY );
        contourMaxY = Math.max( oy, contourMaxY );
        contourMinZ = Math.min( oz, contourMinZ );
        contourMaxZ = Math.max( oz, contourMaxZ );
    }
}

/*
        {
            var V = $V( [ 0, 0, 0 ] );
            var transformed = currentTransformation.multiply(V);
            var nx = transformed.e(1) + divWidth / 2;
            var ny = transformed.e(2) + divHeight / 2;

            centrePoint.attr({ "cx": nx, "cy": ny } );
        }
*/

function Viewer( divID ) {

    this.showVNCLandmarks = false;

    var pw = 4; /* pixelWidth */

    if( this.showVNCLandmarks ) {

        var pc = new Object();
        var ac = new Object();

        pc.x1 = 46212; pc.x2 = 46404;
        pc.y1 = 31260; pc.y2 = 30444;
        pc.z1 = pw * 237.5; pc.z2 = pw * 1037.5;
        pc.name = "PC";
        /* pc.color = "#32bb07"; */
        pc.color = "#1a5607";

        ac.x1 = 47412; ac.x2 = 47364;
        ac.y1 = 30396; ac.y2 = 30252;
        ac.z1 = pw * 2162.5; ac.z2 = pw * 3975;
        ac.name = "AC";
        ac.color = "#1a5607";

        this.commissures = [ pc, ac ];
        for( var i in this.commissures ) {
            var c = this.commissures[i];
            var xdiff = c.x2 - c.x1;
            var ydiff = c.y2 - c.y1;
            var zdiff = c.z2 - c.z1;
            c.radius = Math.sqrt( xdiff * xdiff + ydiff * ydiff + zdiff * zdiff ) / 2;
            c.ballx = (c.x1 + c.x2) / 2;
            c.bally = (c.y1 + c.y2) / 2;
            c.ballz = (c.z1 + c.z2) / 2;
        }
    }

    this.divID = divID;
    this.divID_jQuery = '#'+divID;

    this.r = Raphael(divID);

    this.lines = true;
    this.circles = false;

    this.divWidth = $(this.divID_jQuery).width();
    this.divHeight = $(this.divID_jQuery).height();

    this.centreX = (contourMinX + contourMaxX) / 2;
    this.centreY = (contourMinY + contourMaxY) / 2;
    this.centreZ = (contourMinZ + contourMaxZ) / 2;

    this.currentTheta = 0;
    this.currentPhi = 0;
    this.currentPsi = 0;

    var ideal_x_scale = this.divWidth / (contourMaxX - contourMinX);
    var ideal_y_scale = this.divWidth / (contourMaxY - contourMinY);
    this.scale = Math.min(ideal_x_scale,ideal_y_scale);

    this.neurons = new Array();

    this.transformPoint = function( x, y, z ) {
        var V = $V( [ x - this.centreX, y - this.centreY, z - this.centreZ ] );
        var transformed = this.currentTransformation.multiply(V);
        var nx = transformed.e(1) + this.divWidth / 2;
        var ny = transformed.e(2) + this.divHeight / 2;
        var nz = transformed.e(3);
        return { x: nx, y : ny, z: nz };
    }

    // This is equivalent to the old transformAllPoints()
    this.changeView = function( phi, theta, psi, scale ) {

        // alert("in changeView");

        if( scale == undefined )
            scale = this.scale;

        this.currentTransformation = createTransformation( phi, theta, psi, scale );

        for( var i in this.commissures ) {
            var c = this.commissures[i];
            var p = this.transformPoint( c.ballx, c.bally, c.ballz );
            if( c.ball ) {
                c.ball.attr({cx:p.x,cy:p.y});
            } else {
                c.ball = this.r.circle(p.x,p.y,c.radius*scale).attr({fill: c.color, stroke: c.color});
            }
        }

        for( var i in this.neurons ) {
            this.neurons[i].transform( this.currentTransformation );
        }

        if (this.showVNCLandmarks) {
            // Also tranform the contour object:
            var contourPath = "";
            for( var i = 0; i < contourPoints.length; ++i ) {
                if( i == 0 )
                    contourPath += "M ";
                else
                    contourPath += "C ";
                var points = contourPoints[i];
                for( var j = 0; j < points.length / 2; ++j ) {
                    var originalX = points[2*j];
                    var originalY = points[2*j+1];
                    var originalZ = 1237.5;
                    var p = this.transformPoint( originalX, originalY, originalZ );
                    contourPath += "" + p.x + "," + p.y + " ";
                }
            }
            contourPath += "z";

            if( this.contourObject )
                this.contourObject.attr({path:contourPath});
            else
                this.contourObject = this.r.path(contourPath).attr({stroke:'blue'});
        }

        this.currentPhi = phi;
        this.currentTheta = theta;
        this.currentPsi = psi;
    }

    this.updateViewBounds = function( ) {
        var newMinX = Number.MAX_VALUE, newMaxX = Number.MIN_VALUE;
        var newMinY = Number.MAX_VALUE, newMaxY = Number.MIN_VALUE;
        var newMinZ = Number.MAX_VALUE, newMaxZ = Number.MIN_VALUE;
        if( this.neurons.length == 0 ) {
            newMinX = newMinY = newMinZ = -1;
            newMaxX = newMaxY = newMaxZ = -1;
        } else {
            for( i in this.neurons ) {
                newMinX = Math.min(newMinX, this.neurons[i].min_x);
                newMaxX = Math.max(newMaxX, this.neurons[i].max_x);
                newMinY = Math.min(newMinY, this.neurons[i].min_y);
                newMaxY = Math.max(newMaxY, this.neurons[i].max_y);
                newMinZ = Math.min(newMinZ, this.neurons[i].min_z);
                newMaxZ = Math.max(newMaxZ, this.neurons[i].max_z);
            }
        }
        this.centreX = (newMinX + newMaxX) / 2;
        this.centreY = (newMinY + newMaxY) / 2;
        this.centreZ = (newMinZ + newMaxZ) / 2;
        var ideal_x_scale = this.divWidth / (newMaxX - newMinX);
        var ideal_y_scale = this.divWidth / (newMaxY - newMinY);
        this.scale = Math.min(ideal_x_scale,ideal_y_scale);
    }

    this.redraw = function() {
        this.changeView( this.currentPhi, this.currentTheta, this.currentPsi );
    }

    this.addToNeuronList = function( neuron ) {
        var newElement = $('<li/>');
        newElement.attr('id','3d-object-'+neuron.basename);
        newElement.text(neuron.basename+' ');
        linkElement = $('<a/>');
        linkElement.attr('href','#');
        linkElement.text("(remove)");
        var enclosingObject = this;
        linkElement.click(function (e) {
            enclosingObject.deleteNeuron(neuron.basename);
            newElement.remove();
        });
        newElement.append(linkElement);
        newElement.css('color',neuron.color);
        $('#3d-view-object-list').append(newElement);
    }

    this.removeFromNeuronList = function( neuronName ) {
        var indexToRemove = -1;
        for( i in this.neurons ) {
            if( this.neurons[i].basename == neuronName ) {
                indexToRemove = i;
                break;
            }
        }
        if( indexToRemove >= 0 ) {
            alert("found it at index: "+indexToRemove);
            this.neurons.splice(indexToRemove);
            alert("after removing, this.neurons is: "+this.neurons);
	    this.updateViewBounds();
            this.redraw();
        } else {
            alert("Couldn't find the neuron "+neuronName+" to remove");
        }
    }

    this.addFromCATMAID = function( projectID, skeletonID, neuronName ) {
        for( i in this.neurons ) {
            if( this.neurons[i].basename == neuronName ){
                alert("This skeleton has already added been added to the viewer");
                return;
            }
        }

        var color = "blue";

        var neuron = new NeuronView( neuronName, "blue", this, projectID, skeletonID );
        this.neurons.push( neuron );
        this.addToNeuronList( neuron );
    }

    this.setNeuron = function( neuronBasename, neuronColor ) {

        // Is there an exisiting view of this neuron?  If so, just set
        // the color.
        for( i in this.neurons ) {
            if( this.neurons[i].basename == neuronBasename ) {
                this.neurons[i].setColor(neuronColor);
                this.redraw();
                return;
            }
        }

        // Otherwise create a new one and add it...
        var neuron = new NeuronView( neuronBasename, neuronColor, this, null, null );
        this.neurons.push( neuron );
        this.addToNeuronList( neuron );
    }

    this.deleteNeuron = function( neuronBasename ) {
        for( i in this.neurons ) {
            if( this.neurons[i].basename == neuronBasename ) {
                this.neurons[i].removeLinesAndCircles();
                delete this.neurons[i];
                this.updateViewBounds();
                this.redraw();
                return;
            }
        }
        alert("Couldn't find the neuron named '"+neuronBasename+"' to remove");
    }

    this.toString = function() {
        return "Viewer("+this.divID+")";
    }

    this.updateRotation = function (mouseMoveEvent) {
        var xdiff = mouseMoveEvent.pageX - this.startDragX;
        var ydiff = mouseMoveEvent.pageY - this.startDragY;
        this.newTheta = this.startTheta + ((Math.PI * xdiff) / 200);
        this.newPhi = this.startPhi + ((-Math.PI * ydiff) / 200);
        this.newPsi = this.startPsi;
        this.changeView( this.newPhi, this.newTheta, this.newPsi );
    }

    this.changeView( 0, 0, 0, this.scale );

    $(this.divID_jQuery).mousedown( { viewer: this }, function(event) {
            if(event.preventDefault) {
                event.preventDefault();
            }
            event.data.viewer.startDragX = event.pageX;
            event.data.viewer.startDragY = event.pageY;

            event.data.viewer.startTheta = event.data.viewer.currentTheta;
            event.data.viewer.startPsi = event.data.viewer.currentPsi;
            event.data.viewer.startPhi = event.data.viewer.currentPhi;

            $(event.data.viewer.divID_jQuery).bind('mousemove',$.proxy(event.data.viewer.updateRotation,event.data.viewer));
        });

    $(this.divID_jQuery).mouseup( { viewer: this }, function(event) {
            $(event.data.viewer.divID_jQuery).unbind('mousemove');
        });

    $(this.divID_jQuery).mouseleave( { viewer: this }, function(event) {
            $(event.data.viewer.divID_jQuery).unbind('mousemove');
        });

}

function Point( id,
                type,
                original_x,
                original_y,
                original_z,
                radius,
                parent_id,
                viewer ) {

    this.id = id;
    this.type = type;
    this.original_x = original_x;
    this.original_y = original_y;
    this.original_z = original_z;
    this.radius = radius;
    this.parent_id = parent_id;
    this.viewer = viewer;

    this.update_circle_position = function () {
        // Warning: should only be called right after map_to_screen()
        this.circle.attr({ "cx": this.nx, "cy": this.ny } );
    }

    this.map_to_screen = function() {
        var p = this.viewer.transformPoint( this.original_x, this.original_y, this.original_z );
        this.nx = p.x;
        this.ny = p.y;
    }
}

function NeuronView( basename, color, viewer, projectID, skeletonID ) {

    this.basename = basename;
    this.color = color;
    this.viewer = viewer;
    this.skeletonID = skeletonID;

    this.circleRadius = 0.6;
    this.lineWidth = 2;

    this.currentPhi = 0;
    this.currentTheta = 0;
    this.currentPsi = 0;

    this.all_points = [];

    this.circles = false;
    this.lines = true;

    this.min_x = Number.MAX_VALUE;
    this.max_x = Number.MIN_VALUE;
    this.min_y = Number.MAX_VALUE;
    this.max_y = Number.MIN_VALUE;
    this.min_z = Number.MAX_VALUE;
    this.max_z = Number.MIN_VALUE;

    this.test = "foo";

    var swcURI;
    if( skeletonID ) {
        swcURI = window.location.toString().replace(/\/[^\/]*$/, '/');
        swcURI += 'model/export.skeleton.php?pid='+projectID+'&skeletonid='+skeletonID;
    } else {
        swcURI = basenameToURI( basename, "swc" );
    }

    // Load the neuron morphology from the SWC file:

    var enclosingObject = this; // Since the meaning of 'this' is changed in the callback

    $.get(swcURI, function(data) {

        var lines = data.split("\n");
        for( var i = 0; i < lines.length; ++i ) {
            var line = lines[i];
            if( line.match(/^\s*#/) ) {
                continue;
            }
            if( line.match(/^\s*$/) ) {
                continue;
            }
            line = strip(line);
            var fields = line.split(/\s+/);
            var point = new Point(
                fields[0], // id
                fields[1], // type
                parseFloat(fields[2]), // x
                parseFloat(fields[3]), // y
                parseFloat(fields[4]), // z
                fields[5], // radius
                fields[6], // parent_id
                enclosingObject.viewer);

            enclosingObject.min_x = Math.min( point.original_x, enclosingObject.min_x );
            enclosingObject.max_x = Math.max( point.original_x, enclosingObject.max_x );
            enclosingObject.min_y = Math.min( point.original_y, enclosingObject.min_y );
            enclosingObject.max_y = Math.max( point.original_y, enclosingObject.max_y );
            enclosingObject.min_z = Math.min( point.original_z, enclosingObject.min_z );
            enclosingObject.max_z = Math.max( point.original_z, enclosingObject.max_z );

            enclosingObject.all_points[point.id] = point;
        }

        // centrePoint = r.circle(10,10,4);
        // centrePoint.attr("fill","#f00");
        // centrePoint.attr("stroke","#f00");

        for( var i in enclosingObject.all_points ) {
            var point = enclosingObject.all_points[i];
            var p = point.map_to_screen();
            if( this.circles ) {
                point.circle = r.circle(p.x,p.y,circleRadius);
                point.circle.attr("fill",enclosingObject.color);
            }
        }

        // Now find all the end points, i.e. those with no parents:

        enclosingObject.endPoints = enclosingObject.all_points.slice(0);
        for( var i in enclosingObject.all_points ) {
            var parent_id = enclosingObject.all_points[i].parent_id;
            if( parent_id > 0 ) {
                delete enclosingObject.endPoints[parent_id];
            }
        }

        enclosingObject.transform( enclosingObject.viewer.currentTransformation );

	enclosingObject.viewer.updateViewBounds();
        enclosingObject.viewer.redraw();

    }, "test");

    this.setColor = function( color ) {
        this.color = color;
        if( this.viewer.lines ) {
            for( var i in this.endPoints[i] ) {
                var e = this.endPoints[i];
                if( lines ) {
                    e.lineToParent.attr({stroke:this.color});
                }
            }
        }
        if( this.viewer.circles ) {
            for( var i in this.all_points ) {
                this.all_points[i].circle.attr("fill",this.color);
            }
        }
    }

    this.removeLinesAndCircles = function() {
        if( this.viewer.circles ) {
            for( var i in this.all_points ) {
                this.all_points[i].circle.remove();
            }
        }
        if( this.viewer.lines ) {
            for( var i in this.endPoints ) {
                var e = this.endPoints[i];
                e.lineToParent.remove();
            }
        }
    }

    this.transform = function( transformation ) {

        // Tranform each point:
        for( var i in this.all_points ) {
            this.all_points[i].map_to_screen();
            if( this.viewer.circles ) {
                this.all_points[i].update_circle_position();
            }
        }

        if( this.viewer.lines ) {
            var done = new Object();
            for( var i in this.endPoints ) {
                var points = [];
                var e = this.endPoints[i];
                points.push( e )
                    done[e.id] = true;
                while( true ) {
                    if( e.parent_id < 0 )
                        break;
                    e = this.all_points[e.parent_id];
                    points.push( e )
                        if( done[e.id] )
                            break;
                    done[e.id] = true;
                }
                var path = "M " + points[0].nx + " " + points[1].ny + " ";
                var firstTime = true;
                for( var j = 1; j < points.length; ++j ) {
                    p = points[j];
                    path += "L " + p.nx + " " + p.ny + " ";
                }
                e = this.endPoints[i];
                if( e.lineToParent )
                    e.lineToParent.attr({path:path,stroke:this.color});
                else
                    e.lineToParent = this.viewer.r.path(path).attr({stroke:this.color});
            }
        }
    }
}

function setNeuronView( divID, neuronsAndColors ) {

    var divID_jQuery = '#'+divID;

    if( ! $(divID_jQuery).data('viewer') ) {
        $(divID_jQuery).data('viewer',new Viewer(divID));
    }

    for( var nci in neuronsAndColors ) {
        var neuronBasename = neuronsAndColors[nci][0];
        var neuronColor = neuronsAndColors[nci][1];
        $(divID_jQuery).data('viewer').setNeuron( neuronBasename, neuronColor );
    }

}

function nameFromCATMAIDInfo( info ) {
    return info['skeleton_name']+' ['+info['neuron_name']+']';
}

function addNeuronFromCATMAID( divID, info ) {

    var divID_jQuery = '#'+divID;

    if( ! $(divID_jQuery).data('viewer') ) {
        $(divID_jQuery).data('viewer',new Viewer(divID));
    }

    $(divID_jQuery).data('viewer').addFromCATMAID( info['project_id'], info['skeleton_id'], nameFromCATMAIDInfo(info) );
}

function createViewerFromCATMAID( divID ) {

    var divID_jQuery = '#'+divID;

    if( ! $(divID_jQuery).data('viewer') ) {
        $(divID_jQuery).data('viewer',new Viewer(divID));
    }

    $('#xy-button').click( function () {
        $(divID_jQuery).data('viewer').changeView( 0, 0, 0 );
    } );

    $('#xz-button').click( function () {
        $(divID_jQuery).data('viewer').changeView( -Math.PI / 2, 0, 0 );
    } );

    $('#zy-button').click( function () {
        $(divID_jQuery).data('viewer').changeView( 0, -Math.PI / 2, 0 );
    } );
}
