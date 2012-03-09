/**
 * dbthumbnailtool.js
 *
 * requirements:
 *	 tools.js
 *	 slider.js
 *	 stack.js
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
		var cb = self.cropBox;
		var zoom_level = stack.s;
		var z = stack.z * stack.resolution.z + stack.translation.z;
        var tissue = self.selected_tissue.folder;
        // also, the hostname needs to be prepended
        projURL = "http://" + document.location.hostname + "/" + catmaid_url + projURL;
        // the meta data needs base64 encoding to be part of the URL
        var metadata = Base64.encode( stack_metadata );

		var url = django_url + project.id + '/stack/' + stack_ids + '/thumbnail/' + cb.left + "," + cb.right + "/" + cb.top + "," + cb.bottom + "/" + z + "," + z + '/' + zoom_level + '/' + tissue + '/' + metadata + '/';

		requestQueue.register(url, 'GET', {}, handle_thumbnailing );
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

    this.updateSelectedTissue = function()
    {
        var text_box = document.getElementById( "thumbnail_tissue_name" );
        var new_text = document.createElement( 'p' );
        new_text.appendChild( document.createTextNode( self.selected_tissue.name ) );
        text_box.replaceChild( new_text, text_box.firstChild );
    }

	this.resize = function( width, height )
	{
		self.mouseCatcher.style.width = width + "px";
		self.mouseCatcher.style.height = height + "px";
		return;
	};

    var onmousedown = function( e )
    {
        var m = ui.getMouse( e, self.stack.getView() );
        self.createCropBox( m.offsetX, m.offsetY, self.fixed_width, self.fixed_height );
        self.redraw();
    };
    
    this.register = function( parentStack )
    {
        // call register of super class
        DBThumbnailTool.superproto.register.call( this, parentStack );

		self.stack = parentStack;

        document.getElementById( "edit_button_thumbnail" ).className = "button_active";
		document.getElementById( "toolbar_thumbnail" ).style.display = "block";

		self.mouseCatcher.style.cursor = "crosshair";
		self.mouseCatcher.onmousedown = onmousedown;

		self.stack.getView().appendChild( self.mouseCatcher );

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
        // call destroy of super class
        DBThumbnailTool.superproto.destroy.call( this );
    };

	/** This function should return true if there was any action
		linked to the key code, or false otherwise. */
	this.handleKeyPress = function( e ) {
		return false;
	}

    // init

	if ( !ui ) ui = new UI();

    // the tissues and the folders they should be saved in
    var tissues = new Array(
        { name : "Salivary Gland", folder : "salivary_gland" } ,
        { name : "CNS", folder : "cns" },
        { name : "Wing Disc", folder : "wing_disc" },
        { name : "Fat Body", folder : "fat_body" },
        { name : "Ovary", folder : "ovary" },
        { name : "Gut", folder : "gut" } );
    // take tha first tissue as default
    this.selected_tissue = tissues[0];
    this.updateSelectedTissue();
    // init the tissues menu
    this.tissue_menu = new Menu();
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
    this.tissue_menu.update( tissue_menu_content );
    document.getElementById( "thumbnail_tissue_box" ).style.disply = "block";
    document.getElementById( "thumbnail_tissue_menu" ).appendChild( this.tissue_menu.getView() );

	//! mouse catcher
	this.mouseCatcher = document.createElement( "div" );
	this.mouseCatcher.className = "sliceMouseCatcher";
	this.mouseCatcher.style.cursor = "default";

	this.button_thumbnail_apply = document.getElementById( "button_thumbnail_apply" );

    return this;
}
extend( DBThumbnailTool, BoxSelectionTool );

