/**
 * textlabel.js
 *
 * requirements:
 *	 tools.js
 *	 ui.js
 *	 excanvas.js by Google for IE support
 *	 request.js
 *
 */

/**
 */

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
	}
	
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
	}
	
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
	}
	
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
	}
	
	var synchText = function( e )
	{
		self.text = textArea.value;
		textBox.replaceChild( document.createTextNode( self.text ), textBox.firstChild );
		
		self.redraw(
			parentLeft,
			parentTop,
			scale );
		
		return true;
	}
	
	var apply = function( e )
	{
		icon_apply.style.display = "block";
		requestQueue.replace(
			"model/textlabel.update.php",
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
	}
	
	var close = function( e )
	{
		icon_apply.style.display = "block";
		
		requestQueue.register(
			'model/textlabel.delete.php',
			'POST',
			{
				pid : project.id,
				tid : self.id,
				x : self.location.x,
				y : self.location.y,
				z : self.location.z
			},
			// XXX: not existing.
			project.handle_updateTextlabels );
		return;
	}
	
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
	}
	
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
	}
	
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
	}
	
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
	}
	
	
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
	}
	
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
	}
	
	var movemousemove = function( e )
	{
		self.location.x += ui.diffX  / scale * resolution.x;
		self.location.y += ui.diffY  / scale * resolution.y;
		self.redraw(
			parentLeft,
			parentTop,
			scale );
		return false;
	}
	
	var movemouseup = function( e )
	{
		apply();
		ui.releaseEvents()
		ui.removeEvent( "onmousemove", movemousemove );
		ui.removeEvent( "onmouseup", movemouseup );
		return false;
	}
	
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
	}
	
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
	}
	
	
	
	// initialise
	var self = this;
	if ( !ui ) ui = new UI();
	if ( !requestQueue ) requestQueue = new RequestQueue();
	
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
	//var button_apply = document.getElementById( "button_text_apply" );
	var icon_apply = document.getElementById( "icon_text_apply" );
	
	var edit = false;
}
