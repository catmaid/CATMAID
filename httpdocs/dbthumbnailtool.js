/**
 * dbthumbnailtool.js
 *
 * requirements:
 *   tools.js
 *   slider.js
 *   stack.js
 *   croppingtool.js
 */

/**
 * Thumbnail creation tool. Allows cropping out a selected part of the
 * stack. It is a simplified and restricted cropping tool.
 */
function DBThumbnailTool()
{
    // call super constructor
    BoxSelectionTool.call( this );

    var self = this;
    this.toolname = "dbthumbnailtool";
    this.fixed_width = 700;
    this.fixed_height = 700;

    var makeThumbnail = function()
    {
        var stack = self.stack;
        var project = stack.getProject();
        // the project URL refers also to the tool, make sure we got the navigator in there
        var projURL = project.createURL();
        projURL = projURL.replace( "tool=dbthumbnailtool", "tool=navigator" );
        // create a list of all stacks and their URL in the project
        var stacks = projects_available[project.id];
        var stack_ids = "";
        var stack_metadata = "";
        var nStacks = 0;
        for ( var s in stacks )
        {
            if ( nStacks > 0 )
            {
                stack_ids += ","
                stack_metadata += ","
            }
            stack_ids += s.toString()
            stack_metadata += projURL.replace( "sid0=" + stack.getId(), "sid0=" + s );
            nStacks++;
        }
        var cb = self.getCropBox();
        var zoom_level = stack.s;
        var z = stack.z * stack.resolution.z + stack.translation.z;
        var tissue = self.selected_tissue.folder;
        // also, the hostname needs to be prepended
        projURL = "http://" + document.location.hostname + "/" + catmaid_url + projURL;

        // create marker data
        var marker_data = "";
        var nMarkers = 0;
        for ( var m in self.markers )
        {
            if ( nMarkers > 0 )
            {
                marker_data += ",";
            }
            var mrk = self.markers[ m ];
            var data = mrk.pos_x_world + "," + mrk.pos_y_world + "," + mrk.symbol + "," + mrk.color + "," + mrk.size;
            marker_data += Base64.encode( data );
            nMarkers++;
        }

        var url = django_url + project.id + '/stack/' + stack_ids + '/thumbnail/' + cb.left + "," + cb.right + "/" + cb.top + "," + cb.bottom + "/" + z + "," + z + '/' + zoom_level + '/';

        var post_data =
        {
            tissue : tissue,
            metadata : stack_metadata,
            markers : marker_data
        }

        requestQueue.register(url, 'POST', post_data, handle_thumbnailing );
        return false;
    };

    var handle_thumbnailing = function( status, text, xml )
    {
        if ( status = 200 )
        {
            var e = $.parseJSON(text);

            if (e.error)
            {
                alert( e.error )
            }
            else
            {
                statusBar.replaceLast( text );
                alert( "The thumbnail has been created." );
            }
        }
        return;
    };

    this.updateSelectedMode = function()
    {
        var text_box = document.getElementById( "thumbnail_mode_name" );
        var new_text = document.createElement( 'p' );
        new_text.appendChild( document.createTextNode( self.selected_mode.name ) );
        text_box.replaceChild( new_text, text_box.firstChild );
        if ( self.selected_mode.type == "create_thumbnail" )
        {
            self.mouseCatcher.onmousedown = onmousedown.cropbox;
            document.getElementById( "thumbnail_tissue_box" ).style.display = "block";
            document.getElementById( "thumbnail_marker_box" ).style.display = "none";
        }
        else if ( self.selected_mode.type == "set_markers" )
        {
            self.mouseCatcher.onmousedown = onmousedown.addmarker;
            document.getElementById( "thumbnail_tissue_box" ).style.display = "none";
            document.getElementById( "thumbnail_marker_box" ).style.display = "block";
        }
        else if ( self.selected_mode.type == "modify_markers" )
        {
            self.mouseCatcher.onmousedown = onmousedown.modmarker;
            document.getElementById( "thumbnail_tissue_box" ).style.display = "none";
            document.getElementById( "thumbnail_marker_box" ).style.display = "block";
        }
    }

    this.updateSelectedTissue = function()
    {
        var text_box = document.getElementById( "thumbnail_tissue_name" );
        var new_text = document.createElement( 'p' );
        new_text.appendChild( document.createTextNode( self.selected_tissue.name ) );
        text_box.replaceChild( new_text, text_box.firstChild );
    }

    this.updateSelectedMarker = function()
    {
        // marker name
        var text_box = document.getElementById( "thumbnail_marker_char_name" );
        var new_text = document.createElement( 'p' );
        new_text.appendChild( document.createTextNode( self.selected_marker_char.symbol + " (" + self.selected_marker_char.name + ")" ) );
        text_box.replaceChild( new_text, text_box.firstChild );
        // marker color
        text_box = document.getElementById( "thumbnail_marker_color_name" );
        new_text = document.createElement( 'p' );
        var font = document.createElement( 'font' );
        font.color = "#" + self.selected_marker_color.color;
        font.appendChild( document.createTextNode( self.selected_marker_color.name ) );
        new_text.appendChild( font );
        text_box.replaceChild( new_text, text_box.firstChild );
        // marker size
        text_box = document.getElementById( "thumbnail_marker_size_name" );
        new_text = document.createElement( 'p' );
        new_text.appendChild( document.createTextNode( self.selected_marker_size.name ) );
        text_box.replaceChild( new_text, text_box.firstChild );
    }

    this.resize = function( width, height )
    {
        self.mouseCatcher.style.width = width + "px";
        self.mouseCatcher.style.height = height + "px";
        return;
    };

    this.addMarker = function( x, y)
    {
        // expect screen positions
        var stack = self.stack;
        var dist_center_x = x - stack.viewWidth / 2;
        var dist_center_y = y - stack.viewHeight / 2;
        var pos_x = stack.translation.x + ( stack.x + dist_center_x / stack.scale ) * stack.resolution.x;
        var pos_y = stack.translation.y + ( stack.y + dist_center_y / stack.scale ) * stack.resolution.y;
        
        // create new view/div for the marker
        var marker_view = document.createElement( "div" );
        marker_view.id = "marker" + self.markers.length;
        marker_view.style.width = "auto";
        marker_view.style.height = "auto";
        marker_view.style.left = x + "px";
        marker_view.style.top = y + "px";
        marker_view.style.position = "absolute";
        marker_view.style.zIndex = 7;
        marker_view.style.cursor = "move";
        marker_view.onclick = onmousedown.selectmarker;

        var marker_text = document.createElement( "span" );
        marker_text.style.color = "#" + self.selected_marker_color.color;
        marker_text.style.fontSize = self.selected_marker_size.size + "px";
        marker_text.style.bottom = "0px";
        marker_text.style.position = "absolute";
        marker_view.style.zIndex = 6;
        marker_text.appendChild( document.createTextNode( self.selected_marker_char.symbol ) );
        marker_text.onclick = onmousedown.selectmarker;

        marker_view.appendChild( marker_text );

        self.stack.getView().appendChild( marker_view );
        // remember the new marker
        self.markers[ self.markers.length ] =
            { view : marker_view,
              pos_x_screen : x,
              pos_y_screen : y,
              pos_x_world : pos_x,
              pos_y_world : pos_y,
              symbol : self.selected_marker_char.symbol,
              color : self.selected_marker_color.color,
              size : self.selected_marker_size.size };
    }

    var onmousedown =
    {
        cropbox : function( e )
        {
            var m = ui.getMouse( e, self.stack.getView() );
            // create cropping box
            self.createCropBox( m.offsetX, m.offsetY, self.fixed_width, self.fixed_height );
            self.redraw();
        },
        addmarker : function( e )
        {
            // add a new selected mark and keep it selected
            var m = ui.getMouse( e, self.stack.getView() );
            self.addMarker( m.offsetX, m.offsetY );

            self.redraw();
        },
        modmarker : function( e )
        {
            self.redraw();
        },
        selectmarker : function( e )
        {
            console.log("Select");
            self.redraw();
            return false;
        }
    };
    
    this.register = function( parentStack )
    {
        // call register of super class
        DBThumbnailTool.superproto.register.call( self, parentStack );
        self.stack = parentStack;

        document.getElementById( "edit_button_thumbnail" ).className = "button_active";
        document.getElementById( "toolbar_thumbnail" ).style.display = "block";

        self.mouseCatcher.style.cursor = "crosshair";

        self.stack.getView().appendChild( self.mouseCatcher );

        initModeMenu();
        initTissueMenu();
        initMarkerMenus();

        // initialize apply button
        self.button_thumbnail_apply.onclick = makeThumbnail;
    };

    this.unregister = function()
    {
        if ( self.stack && self.mouseCatcher.parentNode == self.stack.getView() )
            self.stack.getView().removeChild( self.mouseCatcher );

        document.getElementById( "edit_button_thumbnail" ).className = "button";
        document.getElementById( "toolbar_thumbnail" ).style.display = "none";

        return;
    };

    this.destroy = function()
    {
		self.unregister();

        // remove all the created markers
        for ( var m in self.markers )
        {
            var mrk = self.markers[ m ];
            self.stack.getView().removeChild( mrk.view );
        }
        self.markers.length=0

        // call destroy of super class
        DBThumbnailTool.superproto.destroy.call( self );
    };

    /** This function should return true if there was any action
        linked to the key code, or false otherwise. */
    this.handleKeyPress = function( e ) {
        return false;
    }

    /**
     * Initializes the modes menu.
     */
    var initModeMenu = function()
    {
        var modes = new Array(
            { name : "Create thumbnail", type : "create_thumbnail" } ,
            { name : "Add markers", type : "set_markers" },
            { name : "Modify markers", type : "modify_markers" } );
        // take tha first mode as default
        self.selected_mode = modes[0];
        self.updateSelectedMode();
        self.mode_menu = new Menu();
        var mode_menu_content = new Array();
        for (var t in modes)
        {
            var mode = modes[t];
            mode_menu_content[t] = {
                id : t,
                title : mode.name,
                note : "",
                action : (function(curr_mode) { return function()
                    {
                        self.selected_mode = curr_mode;
                        self.updateSelectedMode();
                    }
                })(mode)
            };
        };
        self.mode_menu.update( mode_menu_content );
        document.getElementById( "thumbnail_mode_box" ).style.display = "block";
        document.getElementById( "thumbnail_mode_menu" ).appendChild( self.mode_menu.getView() );
    }

    /**
     * Initializes the tissue menu.
     */
    var initTissueMenu = function()
    {
        // the tissues and the folders they should be saved in
        var tissues = new Array(
            { name : "Salivary Gland", folder : "salivary_gland" } ,
            { name : "CNS", folder : "cns" },
            { name : "Wing Disc", folder : "wing_disc" },
            { name : "Fat Body", folder : "fat_body" },
            { name : "Ovary", folder : "ovary" },
            { name : "Gut", folder : "gut" } );
        // take tha first tissue as default
        self.selected_tissue = tissues[0];
        self.updateSelectedTissue();
        self.tissue_menu = new Menu();
        var tissue_menu_content = new Array();
        for (var t in tissues)
        {
            var tissue = tissues[t];
            tissue_menu_content[t] = {
                id : t,
                title : tissue.name,
                note : "",
                action : (function(curr_tissue) { return function()
                    {
                        self.selected_tissue = curr_tissue;
                        self.updateSelectedTissue();
                    }
                })(tissue)
            };
        };
        self.tissue_menu.update( tissue_menu_content );
        document.getElementById( "thumbnail_tissue_box" ).style.display = "block";
        document.getElementById( "thumbnail_tissue_menu" ).appendChild( self.tissue_menu.getView() );
    }

    /**
     * Initializes the marker menu.
     */
    var initMarkerMenus = function()
    {
        var marker_chars = new Array(
            { symbol : "*", name : "Asterisk" },
            { symbol : "#", name : "Hash" },
            { symbol : unescape("%u2605"), name : "Star" },
            { symbol : unescape("%u2606"), name : "Star outline" },
            { symbol : unescape("%u2715"), name : "Multiplication x" },
            { symbol : unescape("%u2726"), name : "Four-pointed star" },
            { symbol : unescape("%u2190"), name : "Leftwards arrow" },
            { symbol : unescape("%u2196"), name : "North west arrow" },
            { symbol : unescape("%u2191"), name : "Upwards arrow" },
            { symbol : unescape("%u2197"), name : "North east arrow" },
            { symbol : unescape("%u2192"), name : "Rightwards arrow" },
            { symbol : unescape("%u2198"), name : "South east arrow" },
            { symbol : unescape("%u2193"), name : "Downwards arrow" },
            { symbol : unescape("%u2199"), name : "South west arrow" },
            { symbol : unescape("%u2780"), name : "Circled one" },
            { symbol : unescape("%u2781"), name : "Circled two" },
            { symbol : unescape("%u2782"), name : "Circled three" },
            { symbol : unescape("%u2783"), name : "Circled four" },
            { symbol : unescape("%u2784"), name : "Circled five" },
            { symbol : unescape("%u2785"), name : "Circled six" },
            { symbol : unescape("%u2786"), name : "Circled seven" },
            { symbol : unescape("%u2787"), name : "Circled eight" },
            { symbol : unescape("%u2788"), name : "Circled nine" },
            { symbol : unescape("%u2789"), name : "Circled ten" } );
        self.selected_marker_char = marker_chars[2];
        // init the marker menu
        self.marker_char_menu = new Menu();
        var marker_char_menu_content = new Array();
        for (var c in marker_chars)
        {
            var marker_char = marker_chars[c];
            marker_char_menu_content[c] = {
                id : c,
                title : marker_char.name,
                note : marker_char.symbol,
                action : (function(curr_char) { return function()
                    {
                        self.selected_marker_char = curr_char;
                        self.updateSelectedMarker();
                    }
                })(marker_char)
            };
        };
        self.marker_char_menu.update( marker_char_menu_content );
        document.getElementById( "thumbnail_marker_char_menu" ).appendChild( self.marker_char_menu.getView() );
        // available marker colors
        var marker_colors = new Array(
            { name : "White", color : "FFFFFF" },
            { name : "Black", color : "000000" },
            { name : "Red", color : "FF0000" },
            { name : "Green", color : "00FF00" },
            { name : "Blue", color : "0000FF" },
            { name : "Cyan", color : "00FFFF" },
            { name : "Magenta", color : "FF00FF" } );
        self.selected_marker_color = marker_colors[3];
        // init the marker menu
        self.marker_color_menu = new Menu();
        var marker_color_menu_content = new Array();
        for (var c in marker_colors)
        {
            var marker_color = marker_colors[c];
            marker_color_menu_content[c] = {
                id : c,
                title : marker_color.name,
                note : "",
                action : (function(curr_color) { return function()
                    {
                        self.selected_marker_color = curr_color;
                        self.updateSelectedMarker();
                    }
                })(marker_color)
            };
        };
        self.marker_color_menu.update( marker_color_menu_content );
        document.getElementById( "thumbnail_marker_color_menu" ).appendChild( self.marker_color_menu.getView() );
        // available marker sizes
        var marker_sizes = new Array(
            { name : "15 px", size : "15" },
            { name : "20 px", size : "20" },
            { name : "25 px", size : "25" },
            { name : "30 px", size : "30" },
            { name : "35 px", size : "35" },
            { name : "40 px", size : "40" },
            { name : "45 px", size : "45" },
            { name : "50 px", size : "50" } );
        self.selected_marker_size = marker_sizes[3];
        // init the marker menu
        self.marker_size_menu = new Menu();
        var marker_size_menu_content = new Array();
        for (var c in marker_sizes)
        {
            var marker_size = marker_sizes[c];
            marker_size_menu_content[c] = {
                id : c,
                title : marker_size.name,
                note : "",
                action : (function(curr_size) { return function()
                    {
                        self.selected_marker_size = curr_size;
                        self.updateSelectedMarker();
                    }
                })(marker_size)
            };
        };
        self.marker_size_menu.update( marker_size_menu_content );
        document.getElementById( "thumbnail_marker_size_menu" ).appendChild( self.marker_size_menu.getView() );
        self.updateSelectedMarker();
        document.getElementById( "thumbnail_marker_box" ).style.display = "none";
    }

    // init

    if ( !ui ) ui = new UI();

    //! position markers
    this.markers = new Array();

    //! mouse catcher
    this.mouseCatcher = document.createElement( "div" );
    this.mouseCatcher.className = "sliceMouseCatcher";
    this.mouseCatcher.style.cursor = "default";

    this.button_thumbnail_apply = document.getElementById( "button_thumbnail_apply" );

    return this;
}
extend( DBThumbnailTool, BoxSelectionTool );

