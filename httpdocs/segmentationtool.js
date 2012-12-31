/**
 * segmentationtool.js
 *
 * requirements:
 *   tools.js
 *
 */

function SegmentationTool()
{
    var self = this;
    this.stack = null;
    this.toolname = "segmentationtool";

    // assembly information
    this.current_active_assembly = null;

    // the canvas layer using fabric.js
    var canvasLayer = null;

    if (!ui) ui = new UI();

    this.on_assembly_id_change = function( assembly_id ) {
        console.log('on assembly change. new assembly id: ', assembly_id);
        if (isNaN(assembly_id)) {
            alert('Selected assemblyID is not a number.');
            self.current_active_assembly = null;
            return;
        }
        // only update if assembly id has changed
        if ( assembly_id !== self.current_active_assembly) {
            self.current_active_assembly = assembly_id;
            // TODO: save current, remove all related data, init or a new
        }
    };

    /**
     * unregister all stack related mouse and keyboard controls
     */
    this.unregister = function()
    {

    }

    /**
     * unregister all project related GUI control connections and event
     * handlers, toggle off tool activity signals (like buttons)
     */
    this.destroy = function()
    {
        self.unregister();

        self.destroyToolbar();

        self.stack.removeLayer( "CanvasLayer" );

        self.stack = null;
    }

    /*
    ** Destroy the tool bar elements
    */
    this.destroyToolbar = function ()
    {
        // disable button and toolbar
        document.getElementById( "edit_button_segmentation" ).className = "button";
        document.getElementById( "toolbar_segmentation" ).style.display = "none";

        self.slider_z.update(
            0,
            1,
            undefined,
            0,
            null );
    }

    /**
     * install this tool in a stack.
     * register all GUI control elements and event handlers
     */
    this.register = function( parentStack )
    {
        console.log('SegmentationTool register');
        self.stack = parentStack;
        if (canvasLayer && self.stack) {
            if (self.stack !== parentStack) {
                self.stack.removeLayer( canvasLayer );
                self.createCanvasLayer( parentStack );
            }
        } else {
            self.createCanvasLayer( parentStack );
        }
        self.createToolbar();
    }

    /*
    ** Create the segmentation toolbar
    */
    this.createToolbar = function ()
    {
        // enable button and toolbar
        document.getElementById( "edit_button_segmentation" ).className = "button_active";
        document.getElementById( "toolbar_segmentation" ).style.display = "block";

        self.slider_z = new Slider(
            SLIDER_HORIZONTAL,
            true,
            0,
            self.stack.slices,
            self.stack.slices,
            self.stack.z,
            self.changeSliceDelayed );

        var sliders_box = document.getElementById( "sliders_box_segmentation" );
        
        /* remove all existing dimension sliders */
        while ( sliders_box.firstChild )
            sliders_box.removeChild( sliders_box.firstChild );
            
        var slider_z_box = document.createElement( "div" );
        slider_z_box.className = "box";
        slider_z_box.id = "slider_z_box";
        var slider_z_box_label = document.createElement( "p" );
        slider_z_box_label.appendChild( document.createTextNode( "z-index" + "   " ) );
        slider_z_box.appendChild( slider_z_box_label );
        slider_z_box.appendChild( self.slider_z.getView() );
        slider_z_box.appendChild( self.slider_z.getInputView() );
        sliders_box.appendChild( slider_z_box );
    }

    /*
    ** Create the canvas layer using fabric.js
    */
    this.createCanvasLayer = function ()
    {
        canvasLayer = new CanvasLayer( self.stack );
        canvasLayer.canvas.interactive = false;
        canvasLayer.canvas.selection = false;

        // add the layer to the stack, and implicitly
        // add the view element to the DOM
        self.stack.addLayer( "CanvasLayer", canvasLayer );

        // register mouse events
        canvasLayer.view.onmousedown = function( e ) {
            if (self.ensureFocused()) {
                console.log('ensure focused');
                e.stopPropagation();
                return;
            }
            switch ( ui.getMouseButton( e ) )
            {
                case 1:
                    console.log('mouse button 1 click');
                    self.clickXY( e );
                    break;
                case 2:
                    onmousedown(e);
                    /*ui.registerEvent( "onmousemove", updateStatusBar );
                    ui.registerEvent( "onmouseup",
                    function onmouseup (e) {
                      ui.releaseEvents();
                      ui.removeEvent( "onmousemove", updateStatusBar );
                      ui.removeEvent( "onmouseup", onmouseup );
                      // Recreate nodes by feching them from the database for the new field of view
                      tracingLayer.svgOverlay.updateNodes();
                    });
                    */
                    break;
            }
            e.preventDefault();
            e.stopPropagation();
            return;
        };
        canvasLayer.view.onmousewheel = onmousewheel; // function(e){self.mousewheel(e);};
    }

    var onmousewheel = function( e )
    {
        console.log('onmousewheel', e);
    }

    var onmousemove = function( e )
    {
        console.log('onmousemove');
        self.lastX = self.stack.x + ui.diffX; // TODO - or + ?
        self.lastY = self.stack.y + ui.diffY;
        self.stack.moveToPixel(
            self.stack.z,
            self.stack.y - ui.diffY / self.stack.scale,
            self.stack.x - ui.diffX / self.stack.scale,
            self.stack.s );
        return true;
    };

    var onmouseup = function( e )
    {
        console.log('onmouseup');
        ui.releaseEvents();
        ui.removeEvent( "onmousemove", onmousemove );
        ui.removeEvent( "onmouseup", onmouseup );
        return false;
    };

    var onmousedown = function( e )
    {
        console.log('onmousedown');
        ui.registerEvent( "onmousemove", onmousemove );
        ui.registerEvent( "onmouseup", onmouseup );
        ui.catchEvents( "move" );
        ui.onmousedown( e );

        ui.catchFocus();

        return false;
    };

    /** This returns true if focus had to be switched; typically if
        the focus had to be switched, you should return from any event
        handling, otherwise all kinds of surprising bugs happen...  */
    this.ensureFocused = function() {
      var window = self.stack.getWindow();
      if (window.hasFocus()) {
        return false;
      } else {
        window.focus();
        return true;
      }
    };

    //--------------------------------------------------------------------------
    /**
     * Slider commands for changing the slice come in too frequently, thus the
     * execution of the actual slice change has to be delayed slightly.  The
     * timer is overridden if a new action comes in before the last had time to
     * be executed.
     */
    var changeSliceDelayedTimer = null;
    var changeSliceDelayedParam = null;
    
    var changeSliceDelayedAction = function()
    {
        window.clearTimeout( changeSliceDelayedTimer );
        self.changeSlice( changeSliceDelayedParam.z );
        changeSliceDelayedParam = null;
        return false;
    }
    
    this.changeSliceDelayed = function( val )
    {
        if ( changeSliceDelayedTimer ) window.clearTimeout( changeSliceDelayedTimer );
        changeSliceDelayedParam = { z : val };
        changeSliceDelayedTimer = window.setTimeout( changeSliceDelayedAction, 100 );
    }
    
    this.changeSlice = function( val )
    {
        self.stack.moveToPixel( val, self.stack.y, self.stack.x, self.stack.s );
        return;
    }
    
    var actions = [];

    this.addAction = function ( action ) {
        actions.push( action );
    };

    this.getActions = function () {
        return actions;
    };

    this.addAction( new Action({
        helpText: "Move up 1 slice in z (or 10 with Shift held)",
        keyShortcuts: {
            ',': [ 44, 188 ]
        },
        run: function (e) {
            self.slider_z.move(-(e.shiftKey ? 10 : 1));
            return true;
        }
    }) );

    this.addAction( new Action({
        helpText: "Move down 1 slice in z (or 10 with Shift held)",
        keyShortcuts: {
            '.': [ 46, 190 ]
        },
        run: function (e) {
            self.slider_z.move((e.shiftKey ? 10 : 1));
            return true;
        }
    }) );

    var keyCodeToAction = getKeyCodeToActionMap(actions);

    /** This function should return true if there was any action
        linked to the key code, or false otherwise. */
    this.handleKeyPress = function( e )
    {
        var keyAction = keyCodeToAction[e.keyCode];
        if (keyAction) {
          return keyAction.run(e);
        } else {
          return false;
        }
    }

    this.generate_path_for_slice = function( sectionindex, slice_id )
    {
        var result = '';
        result += sectionindex + '';
        var sliceid_string = slice_id + '';
        for ( var i = 0; i < sliceid_string.length-1; i++ )
        {
            result += '/' + sliceid_string.charAt(i);
        }
        result += '/' + sliceid_string.charAt(sliceid_string.length-1);
        return result;
    }

    this.clickXY = function( e ) {
        console.log('click xy', e);
        // TODO: enable again
        // require a number as assembly id
        /*if (!self.current_active_assembly || !parseInt(self.current_active_assembly, 10) > 0) {
            alert('Please select an assembly!');
            return;
        }*/
        var fieldOfView = canvasLayer.getFieldOfViewParameters(),
            x = e.offsetX,
            y = e.offsetY;

        var url = django_url + project.id + "/stack/" + self.stack.id + '/slices-at-location'+ "?" + $.param({
            x: self.getStackXFromCanvasX(x),
            y: self.getStackYFromCanvasY(y),
            scale : 0.5, // defined as 1/2**zoomlevel
            z : self.stack.z});

        console.log('url', url);


        $.getJSON(url, function(result){
            console.log('found slices', result);
            for (var sidx in result) {

                var slice = result[sidx];
                console.log('slice', slice);

                var url = 'http://localhost/slices/';

                // convert slice id to path
                //url += self.generate_path_for_slice( slice.sectionindex, slice.slice_id ) + '.png';
                url += self.generate_path_for_slice( 0, 23434 ) + '.png';

                /*
                fabric.Image.fromURL(url, function(img)
                {
                    var centerx = Math.round(slice.min_x+(slice.max_x-slice.min_x)/2);
                    var centery = Math.round(slice.min_y+(slice.max_y-slice.min_y)/2);
                    console.log(img, centerx, centery)
                    img.set({
                        left: self.getCanvasXFromStackX(centerx),
                        top: self.getCanvasYFromStackY(centery),
                        angle: 0,
                        clipTo: img }).scale(1);
                    canvasLayer.canvas.add( img );
                }); */
            }
        });

        return;
    }

    this.getCanvasXFromStackX = function(stackX)
    {
        return stackX - canvasLayer.getFieldOfViewParameters().x;
    };

    this.getCanvasYFromStackY = function(stackY)
    {
        return stackY - canvasLayer.getFieldOfViewParameters().y;
    };

    this.getStackYFromCanvasY = function(canvasY)
    {
        return canvasLayer.getFieldOfViewParameters().y + canvasY;
    };

    this.getStackXFromCanvasX = function(canvasX)
    {
        return canvasLayer.getFieldOfViewParameters().x + canvasX;
    };

}