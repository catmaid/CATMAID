/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

function TextlabelTool()
{
  this.prototype = new Navigator();

  var self = this;
  var textlabelLayer = null;
  var stack = null;
  var bindings = {};
  this.toolname = "textlabeltool";

  this.resize = function( width, height )
  {
    self.prototype.resize( width, height );
    return;
  };

  var setupSubTools = function()
  {
    document.getElementById( typeof buttonName == "undefined" ? "edit_button_text" : buttonName ).className = "button_active";
    document.getElementById( "toolbar_text" ).style.display = "block";
    $('#textlabeleditable').change(function(e) {
      if ($(this).attr("checked")) {
        textlabelLayer.setEditableTextlabels();
      } else {
        textlabelLayer.setUneditableTextlabels();
      }
    });
  };

  self.updateTextlabels = function () {
      textlabelLayer.update(0, 0, stack.dimension.x * stack.resolution.x,
          stack.dimension.y * stack.resolution.y );
  };

  this.getMouseHelp = function( e ) {
    var result = '<p>';
    result += '<strong>shift-click in space:</strong> create a new textlabel<br />';
    result += '</p>';
    return result;
  };


    /**
   * create a textlabel on the server
   */
  var createTextlabel = function (tlx, tly, tlz, tlr, scale) {
    //requestQueue.register('model/textlabel.create.php', 'POST', {
    requestQueue.register(django_url + project.id + '/textlabel/create', 'POST', {
      pid: project.id,
      x: tlx,
      y: tly,
      z: tlz,
      r: parseInt(document.getElementById("fontcolourred").value) / 255,
      g: parseInt(document.getElementById("fontcolourgreen").value) / 255,
      b: parseInt(document.getElementById("fontcolourblue").value) / 255,
      a: 1,
      type: "text",
      scaling: (document.getElementById("fontscaling").checked ? 1 : 0),
      fontsize: (document.getElementById("fontscaling").checked ? Math.max(16 / scale, parseInt(document.getElementById("fontsize").value)) : parseInt(document.getElementById("fontsize").value)) * tlr,
      fontstyle: (document.getElementById("fontstylebold").checked ? "bold" : "")
    }, function (status, text, xml) {
      statusBar.replaceLast(text);
      if (status == 200) {
        // icon_text_apply.style.display = "none";
        self.updateTextlabels();
        if (text && text != " ") {
          var e = eval("(" + text + ")");
          if (e.error) {
            alert(e.error);
          } else {}
        }
      }
      return true;
    });
    return;
  };

  var createTextlabelLayer = function( parentStack )
  {
    stack = parentStack;

    textlabelLayer = new TextlabelLayer( parentStack, self );
    
    parentStack.addLayer( "TextlabelLayer", textlabelLayer );

    // register the move toolbar and reuse the mouseCatcher
    self.prototype.register( parentStack, "edit_button_move" );
    // view is the mouseCatcher now
    var proto_onmousedown = self.prototype.mouseCatcher.onmousedown;
    self.prototype.mouseCatcher.onmousedown = function( e ) {
      switch ( ui.getMouseButton( e ) )
      {
        case 1:
          // tracingLayer.svgOverlay.whenclicked( e );
            // needs shift in addition
            if( e.shiftKey ) {
                var m = ui.getMouse(e, self.prototype.mouseCatcher);
                var tlx = (stack.x + (m.offsetX - stack.viewWidth / 2) / stack.scale) * stack.resolution.x + stack.translation.x;
                var tly = (stack.y + (m.offsetY - stack.viewHeight / 2) / stack.scale) * stack.resolution.y + stack.translation.y;
                var tlz = stack.z * stack.resolution.z + stack.translation.z;
                createTextlabel(tlx, tly, tlz, stack.resolution.y, stack.scale);
            }
          break;
        case 2:
          proto_onmousedown( e );
          break;
        default:
          proto_onmousedown( e );
          break;
      }
      return;
    };

    var proto_changeSlice = self.prototype.changeSlice;
    self.prototype.changeSlice =
      function( val ) {
        proto_changeSlice( val );
      };
  };

	/**
	 * install this tool in a stack.
	 * register all GUI control elements and event handlers
	 */
	this.register = function( parentStack )
	{
    setupSubTools();

    if (textlabelLayer && stack) {
      if (stack !== parentStack) {
        // If the tracing layer exists and it belongs to a different stack, replace it
        stack.removeLayer( textlabelLayer );
        createTextlabelLayer( parentStack );
      } else {
        reactivateBindings();
      }
    } else {
      createTextlabelLayer( parentStack );
    }

    return;
  };

  /** Inactivate only onmousedown, given that the others are injected when onmousedown is called.
   * Leave alone onmousewheel: it is different in every browser, and it cannot do any harm to have it active. */
  var inactivateBindings = function() {
    var c = self.prototype.mouseCatcher;
    ['onmousedown'].map(
      function ( fn ) {
        if (c[fn]) {
          bindings[fn] = c[fn];
          delete c[fn];
        }
      });
  };

  var reactivateBindings = function() {
    var c = self.prototype.mouseCatcher;
    for (var b in bindings) {
      if (bindings.hasOwnProperty(b)) {
        c[b.name] = b;
      }
    }
  };

	/**
	 * unregister all stack related mouse and keyboard controls
	 */
  this.unregister = function()
  {
    document.getElementById( "toolbar_text" ).style.display = "none";
    // do it before calling the prototype destroy that sets stack to null
    if (self.prototype.stack) {
      inactivateBindings();
    }
    return;
  };

	/**
	 * unregister all project related GUI control connections and event
	 * handlers, toggle off tool activity signals (like buttons)
	 */
	this.destroy = function()
	{
    document.getElementById( typeof buttonName == "undefined" ? "edit_button_text" : buttonName ).className = "button";
    self.unregister();
    textlabelLayer.removeTextlabels();
    // the prototype destroy calls the prototype's unregister, not self.unregister
    // do it before calling the prototype destroy that sets stack to null
    self.prototype.stack.removeLayer( "TextlabelLayer" );
    self.prototype.destroy( "edit_button_move" );
    for (var b in bindings) {
      if (bindings.hasOwnProperty(b)) {
        delete bindings[b];
      }
    }
    return;
	};

  var actions = [];

  this.addAction = function ( action ) {
    actions.push( action );
  };

  this.getActions = function () {
    return actions;
  };

  var arrowKeyCodes = {
    left: 37,
    up: 38,
    right: 39,
    down: 40
  };

  var keyCodeToAction = getKeyCodeToActionMap(actions);

  /** This function should return true if there was any action
      linked to the key code, or false otherwise. */

  this.handleKeyPress = function( e ) {
    var keyAction = keyCodeToAction[e.keyCode];
    if (keyAction) {
      return keyAction.run(e);
    } else {
      return false;
    }
  };

  this.redraw = function()
  {
    self.prototype.redraw();
  };

}

/**
 * a textlabel-box
 */
Textlabel = function(
		data,				//!< content and properties of the textlabel
		resolution,			//!< object {x, y, z} resolution of the parent DOM element in nanometer/pixel
		translation
)
{
	this.getView = function()
	{
		return view;
	};
	
	var getContext = function()
	{
		if ( !ctx )
		{
			try
			{
				if ( canvas.getContext )
				{
					ctx = canvas.getContext( "2d" );
				}
				else if ( G_vmlCanvasManager )  //!< it could be an IE and we try to initialize the element first
				{
					canvas = G_vmlCanvasManager.initElement( canvas );
					ctx = canvas.getContext( "2d" );
				}
			}
			catch( e )
			{}
		}
		return ctx;
	};
	
	this.redraw = function(
			pl,						//!< float left-most coordinate of the parent DOM element in nanometer
			pt,						//!< float top-most coordinate of the parent DOM element in nanometer
			s,						//!< scale factor to be applied to resolution [and fontsize]
			pw,						//!< int optional width of the parent DOM element in pixel
			ph						//!< int optional height of the parent DOM element in pixel
	)
	{
		parentLeft = pl;
		parentTop = pt;
		scale = s;
		if ( pw ) parentWidth = pw;
		if ( ph ) parentHeight = ph;
		
		var rx = resolution.x / scale;
		var ry = resolution.y / scale;
		var x = Math.floor( ( self.location.x - parentLeft ) / rx );
		var y = Math.floor( ( self.location.y - parentTop ) / ry );
		
		var target_x = 0;
		var target_y = 0;
		var offset_x = 0;
		var offset_y = 0;
		
		var fs;
		if ( self.scaling )
			fs = Math.max( 1, Math.floor( scale * self.fontSize ) );
		else
			fs = self.fontSize;
		
		textBox.style.fontSize = textArea.style.fontSize = fs + "px";
		textBox.style.lineHeight = textArea.style.lineHeight = Math.floor( 1.1 * fs ) + "px";
		
		boxWidth = textBox.offsetWidth;
		boxHeight = textBox.offsetHeight;
		
		textArea.style.width = boxWidth + "px";
		textArea.style.height = boxHeight + "px";
		
		switch ( self.type )
		{
		case "text":
			
			view.style.left = ( x - boxWidth / 2 ) + "px";
			view.style.top = ( y - boxHeight / 2 ) + "px";
			
			break;
		case "bubble":
		
			if ( self.offset.left )
			{
				target_x = -self.offset.left / rx;
				x -= target_x;
			}
			else if ( self.offset.right )
			{
				target_x = boxWidth + self.offset.right / rx;
				x -= target_x;
			}
			if ( self.offset.top )
			{
				target_y = -self.offset.top / ry;
				y -= target_y;
			}
			else if ( self.offset.bottom )
			{
				target_y = boxHeight + self.offset.bottom / ry;
				y -= target_y;
			}
			
			if ( target_x < 0 )
			{
				offset_x = -target_x;
				target_x = 0;
			}
			if ( target_y < 0 )
			{
				offset_y = -target_y;
				target_y = 0;
			}
			canvas.width = boxWidth + 2 + Math.max( offset_x, target_x );
			canvas.height = boxHeight + 2 + Math.max( offset_y, target_y );
			canvas.style.left = -offset_x + "px";
			canvas.style.top = -offset_y + "px";
			
			var ctx = getContext();
			if ( ctx )
			{
				view.className = "textlabelView";
				
				var dir_x = ( target_x < boxWidth / 2 ? 1 : 3 ) * boxWidth / 4 + offset_x - target_x;
				var dir_y = ( target_y < boxHeight / 2 ? 1 : 3 ) * boxHeight / 4 + offset_y - target_y;
				var dir_l = Math.sqrt( dir_x * dir_x + dir_y * dir_y );
				var dir_xn = 4 * dir_x / dir_l;
				var dir_yn = 4 * dir_y / dir_l;
				
				var tx = target_x + dir_x;
				var ty = target_y + dir_y;
				
				ctx.strokeStyle = "rgb(0,0,255)";
				
				if ( IE )
				{
					ctx.fillStyle = "rgb(255,255,255)";
					ctx.lineWidth = 2;
					ctx.strokeRect( 1 + offset_x, 1 + offset_y, boxWidth - 1, boxHeight - 1 );
				}
				else
				{
					ctx.fillStyle = "rgba(255,255,255,0.85)";
					ctx.strokeRect( 0.5 + offset_x, 0.5 + offset_y, boxWidth, boxHeight );
					ctx.lineWidth = 1.5;
				}
				ctx.beginPath();
				ctx.moveTo( target_x, target_y );
				ctx.lineTo( tx + dir_yn, ty - dir_xn );
				ctx.lineTo( tx - dir_yn, ty + dir_xn );
				ctx.closePath();
				ctx.stroke();
				
				ctx.globalCompositeOperation = "copy";
				ctx.fillRect( offset_x + 1, offset_y + 1, boxWidth - 1, boxHeight - 1 );
				ctx.beginPath();
				ctx.moveTo( target_x, target_y );
				ctx.lineTo( tx + dir_yn, ty - dir_xn );
				ctx.lineTo( tx - dir_yn, ty + dir_xn );
				ctx.fill();
				
				view.style.left = x + "px";
				view.style.top = y + "px";
			}
			else
			{
				view.className = "textlabelView_nocanvas";
				
				view.style.left = ( x + target_x - boxWidth / 2 ) + "px";
				view.style.top = ( y + target_y - boxHeight / 2 ) + "px";
			}
			break;
		}
		
		return;
	};

  this.setOpacity = function( val )
  {
    view.style.opacity = val+"";
  };
	
	this.setEditable = function( e )
	{
		edit = e;
		if ( e )
		{
			textBox.style.visibility = "hidden";
			textArea.style.display = "block";
			view.style.zIndex = 5;
			moveHandle.style.display = "block";
			closeHandle.style.display = "block";
		}
		else
		{
			textBox.style.visibility = "visible";
			textArea.style.display = "none";
			view.style.zIndex = "";
			moveHandle.style.display = "none";
			closeHandle.style.display = "none";
		}
		return;
	};
	
	var synchText = function( e )
	{
		self.text = textArea.value;
		textBox.replaceChild( document.createTextNode( self.text ), textBox.firstChild );
		
		self.redraw(
			parentLeft,
			parentTop,
			scale );
		
		return true;
	};
	
	var apply = function( e )
	{
		icon_apply.style.display = "block";
		requestQueue.replace(
			//"model/textlabel.update.php",
            django_url + project.id + '/textlabel/update',
			"POST",
			{
				pid : project.id,
				tid : self.id,
				text : ( IE ? self.text.replace( /\r\n/g, "\n" ) : self.text ),
				x : self.location.x,
				y : self.location.y,
				z : self.location.z,
				r : self.colour.r / 255,
				g : self.colour.g / 255,
				b : self.colour.b / 255,
				a : self.colour.a,
				type : self.type,
				scaling : ( self.scaling ? 1 : 0 ),
				fontsize : self.fontSize * resolution.y,
				fontstyle : self.fontStyle,
				fontname : self.fontName,
				offset_left : self.offset.left,
				offset_top : self.offset.top },
			function( status, text, xml )
			{
				if ( status == 200 )
				{
					icon_apply.style.display = "none";
					if ( text && text != " " )
					{
						var e = eval( "(" + text + ")" );
						if ( e.error )
						{
							alert( e.error );
						}
						else
						{
						}
					}
				}
				return true;
			},
			"textlabel_" + this.id );
		return;
	};
	
	var close = function( e )
	{
		icon_apply.style.display = "block";
		
		requestQueue.register(
			//'model/textlabel.delete.php',
            django_url + project.id + '/textlabel/delete',
			'POST',
			{
				pid : project.id,
				tid : self.id,
				x : self.location.x,
				y : self.location.y,
				z : self.location.z
			},
			window.onresize ); // TODO: what is the proper way to call updateTextlabels of the tool?
            // the window.onresize solution calls onresize about 6 times
		return;
	};
	
	/**
	 * onchange handler for the font size input element
	 */
	var changeSize = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) || val < 5 ) this.value = self.fontSize;
		else
		{
			self.fontSize = val;
			apply();
			self.redraw(
				parentLeft,
				parentTop,
				scale );
		}
		return false;
	};
	
	/**
	 * onchange handler for the red colour input element
	 */
	var changeColourRed = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) || val < 0 || val > 255 ) this.value = self.colour.r;
		else
		{
			self.colour.r = val;
			apply();
			textBox.style.color = textArea.style.color = "rgb(" + self.colour.r + "," + self.colour.g + "," + self.colour.b + ")";
		}
		return false;
	};
	
	/**
	 * onchange handler for the green colour input element
	 */
	var changeColourGreen = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) || val < 0 || val > 255 ) this.value = self.colour.g;
		else
		{
			self.colour.g = val;
			apply();
			textBox.style.color = textArea.style.color = "rgb(" + self.colour.r + "," + self.colour.g + "," + self.colour.b + ")";
		}
		return false;
	};
	
	/**
	 * onchange handler for the blue colour input element
	 */
	var changeColourBlue = function( e )
	{
		var val = parseInt( this.value );
		if ( isNaN( val ) || val < 0 || val > 255 ) this.value = self.colour.b;
		else
		{
			self.colour.b = val;
			apply();
			textBox.style.color = textArea.style.color = "rgb(" + self.colour.r + "," + self.colour.g + "," + self.colour.b + ")";
		}
		return false;
	};
	
	
	/**
	 * bind all input elements
	 */
	this.register = function( e )
	{
		input_size.onchange = changeSize;
		input_size.value = self.fontSize;
		
		input_colour_red.onchange = changeColourRed;
		input_colour_red.value = self.colour.r;
		input_colour_green.onchange = changeColourGreen;
		input_colour_green.value = self.colour.g;
		input_colour_blue.onchange = changeColourBlue;
		input_colour_blue.value = self.colour.b;
		
		checkbox_fontstyle_bold.onchange = function( e )
		{
			if ( this.checked ) self.fontStyle = "bold";
			else self.fontStyle = "";
			apply();
			textBox.style.fontWeight = textArea.style.fontWeight = self.fontStyle;
			self.redraw(
				parentLeft,
				parentTop,
				scale );
			return true;
		};
		checkbox_fontstyle_bold.checked = self.fontStyle == "bold";
		
		checkbox_scaling.onchange = function( e )
		{
			if ( this.checked ) self.scaling = true;
			else self.scaling = false;
			apply();
			self.redraw(
				parentLeft,
				parentTop,
				scale );
			return true;
		};
		checkbox_scaling.checked = self.scaling;
		
		//button_apply.onclick = apply;
		
		return true;
	};
	
	/**
	 * unbind all input elements
	 */
	this.unregister = function( e )
	{
		input_size.onchange = function( e )
		{
			var val = parseInt( this.value );
			if ( isNaN( val ) || val < 5 ) this.value = 5;
			return true;
		};
		
		input_colour_red.onchange =
		input_colour_green.onchange =
		input_colour_blue.onchange = function( e )
		{
			var val = parseInt( this.value );
			if ( isNaN( val ) || val < 0 ) this.value = 0;
			else if ( val > 255 ) this.value = 255;
			return true;
		};
		
		checkbox_fontstyle_bold.onchange =
		checkbox_scaling.onchange = function( e ){ return true; };
		//button_apply.onclick = apply;
		
		return true;
	};
	
	var movemousemove = function( e )
	{
		self.location.x += ui.diffX  / scale * resolution.x;
		self.location.y += ui.diffY  / scale * resolution.y;
		self.redraw(
			parentLeft,
			parentTop,
			scale );
		return false;
	};
	
	var movemouseup = function( e )
	{
		apply();
		ui.releaseEvents();
		ui.removeEvent( "onmousemove", movemousemove );
		ui.removeEvent( "onmouseup", movemouseup );
		return false;
	};
	
	var movemousedown = function( e )
	{
		self.register( e );
		
		ui.registerEvent( "onmousemove", movemousemove );
		ui.registerEvent( "onmouseup", movemouseup );
		ui.catchEvents( "move" );
		ui.onmousedown( e );
		
		//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
		document.body.firstChild.focus();
		
		return false;
	};
	
	var closemousedown = function( e )
	{
		// prevent possible call of apply() onblur
		textArea.onblur = null;
		
		if ( confirm( "Do you really want to remove this textlabel?" ) )
		{
			self.unregister( e );
			close();
		}
		else
			textArea.onblur = apply;
		
		//! this is a dirty trick to remove the focus from input elements when clicking the stack views, assumes, that document.body.firstChild is an empty and useless <a></a>
		document.body.firstChild.focus();
		
		return false;
	};
	
	
	
	// initialise
	var self = this;
	if ( !ui ) ui = new UI();
	
	var view = document.createElement( "div" );
	view.className = "textlabelView";	
	
	// data
	//-------------------------------------------------------------------------
	self.id = data.tid ? data.tid : 0;
	self.text = data.text ? data.text : "";
	if ( IE ) self.text = data.text.replace( /\n/g, "\r" );
	self.location = data.location ? data.location :
			{
				x : 0,
				y : 0,
				z : 0
			};
	self.colour = data.colour ? data.colour : null;
	self.type = data.type ? data.type : "text";				//!< string label type in {'text', 'bubble'}
	self.scaling = data.scaling ? true : false;				//!< boolean scale the fontsize when scaling the view?
	self.fontSize = data.font_size ? Math.round( data.font_size / resolution.y ) : 32;
	self.fontStyle = data.font_style ? data.font_style : "";
	self.fontName = data.font_name ? data.font_name : "";
	self.offset = data.offset ? data.offset :
			{
				left : 0,
				top : 0
			};											//!< label offset in pixel, currently used for bubbles only
	//-------------------------------------------------------------------------
	
	var textBox = document.createElement( "pre" );
	var textArea = document.createElement( "textarea" );
	textBox.appendChild( document.createTextNode( self.text ) );
	textArea.value = self.text;
	if ( self.colour )
		textBox.style.color = textArea.style.color = "rgb(" + self.colour.r + "," + self.colour.g + "," + self.colour.b + ")";
	
	textBox.style.fontSize = textArea.style.fontSize = self.fontSize + "px";
	textBox.style.lineHeight = textArea.style.lineHeight = Math.floor( 1.1 * self.fontSize ) + "px";
	
	if ( self.fontName )
		textBox.style.fontFamily = textArea.style.fontFamily = self.fontName;
	if ( self.fontStyle )
		textBox.style.fontWeight = textArea.style.fontWeight = self.fontStyle;
	
	textArea.onkeyup = textArea.onchange = synchText;
	textArea.onfocus = self.register;
	textArea.onblur = apply;
	
	view.appendChild( textBox );
	view.appendChild( textArea );
	
	var moveHandle = document.createElement( "div" );
	moveHandle.className = "moveHandle";
	moveHandle.title = "move";
	moveHandle.onmousedown = movemousedown;
	view.appendChild( moveHandle );
	
	var closeHandle = document.createElement( "div" );
	closeHandle.className = "closeHandle";
	closeHandle.title = "delete";
	closeHandle.onmousedown = closemousedown;
	view.appendChild( closeHandle );
	
	
	var canvas;								//! canvas based drawing area
	var ctx;								//!< 2d drawing context
	if ( self.type == "bubble" )
	{
		canvas = document.createElement( "canvas" );
		view.appendChild( canvas );
	}
	
	var boxWidth;
	var boxHeight;
	
	var parentLeft = 0;
	var parentTop = 0;
	var scale = 1;
	var parentWidth = 0;
	var parentHeight = 0;
	
	// input elements
	
	var input_size = document.getElementById( "fontsize" );
	var input_colour_red = document.getElementById( "fontcolourred" );
	var input_colour_green = document.getElementById( "fontcolourgreen" );
	var input_colour_blue = document.getElementById( "fontcolourblue" );
	var checkbox_fontstyle_bold = document.getElementById( "fontstylebold" );
	var checkbox_scaling = document.getElementById( "fontscaling" );
  var checkbox_editable = document.getElementById( "textlabeleditable" );
	//var button_apply = document.getElementById( "button_text_apply" );
	var icon_apply = document.getElementById( "icon_text_apply" );
	
	var edit = false;
};

TextlabelLayer = function(
		stack,
        parentTool )
{
  var self = this;
	var stack = stack;
	var parentTool = parentTool;
	var textlabels = new Array();
	var stackWindow = stack.getWindow();
	var opacity = 1.0;

  this.resize = function ( width, height )
  {
    return;
  };

  this.redraw = function( completionCallback )
  {
      parentTool.updateTextlabels();
      return;
  };

  this.unregister = function() {
    return;
  };

  this.setOpacity = function ( val )
  {
    opacity = val;
    for(var t in textlabels ) {
      textlabels[t].setOpacity( val );
    }
  };

  this.getOpacity = function ( val )
  {
    return opacity;
  };

  this.removeTextlabels = function() {
    var stackWindowFrame = stackWindow.getFrame();
    //! remove old text labels
    while ( textlabels.length > 0 )
    {
      var t = textlabels.pop();
      try		//!< we do not know if it really is in the DOM currently
      {
        stackWindowFrame.removeChild( t.getView() );
      }
      catch ( error ) {}
    }
  };

  this.setUneditableTextlabels = function() {
    for(var t in textlabels ) {
      textlabels[t].setEditable(false);
    }
  };

  this.setEditableTextlabels = function() {
    for(var t in textlabels ) {
      textlabels[t].setEditable(true);
    }
  };

	/**
	 * update textlabels in a given box of interest by querying it from the server
	 */
	this.update = function(
		x,						//!< left border in project coordinates
		y,						//!< top border in project coordinates
		width,					//!< width in project coordinates
		height					//!< height in project coordinates
	)
	{
		var scale = stack.scale;
		var coordinates = stack.projectCoordinates();
		var resolution = stack.resolution;
		
		requestQueue.register(
            django_url + project.id + '/textlabel/all',
			'POST',
			{
				pid : stack.getProject().getId(),
				sid : stack.getId(),
				z : coordinates.z,
				top : y,
				left : x,
				width : width,
				height : height,
				//scale : ( stack.getMode() == Stack.EDIT_TEXT ? 1 : scale ),	// should we display all textlabels when being in text-edit mode?  could be really cluttered
				scale : scale,
				resolution : resolution.y
			},
			handle_update );
		return;
	};
	
	/**
	 * handle an update-textlabels-request answer
	 *
	 */
	var handle_update = function( status, text, xml )
	{
    var check = $('#textlabeleditable').attr("checked");
		if ( 200 === status )
		{
			//alert( "data: " + text );
			var e = eval( "(" + text + ")" );
			if ( e.error )
				alert( e.error );
			else
			{
				var stackWindowFrame = stackWindow.getFrame();
				//! remove old text labels
				while ( textlabels.length > 0 )
				{
					var t = textlabels.pop();
					try		//!< we do not know if it really is in the DOM currently
					{
						stackWindowFrame.removeChild( t.getView() );
					}
					catch ( error ) {}
				}
				
				if ( text )
				{
					var resolution = stack.resolution;
					var translation = stack.translation;
					var stackWindowFrame = stackWindow.getFrame();

					var wc = stack.getWorldTopLeft();
					var pl = wc.worldLeft,
							pt = wc.worldTop,
							new_scale = wc.scale;

					//! import new
					for ( var i in e )
					{
						var t = new Textlabel( e[ i ], resolution, translation );
						textlabels.push( t );
						stackWindowFrame.appendChild( t.getView() );
						t.setEditable( check );
						t.redraw( pl, pt, new_scale );
					}
				}
			}
		}
		return;
	};

};
