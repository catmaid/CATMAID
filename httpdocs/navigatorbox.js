
function NavigatorBox( stack )
{
	var self = this;

	/**
	 * Canvas to draw the navigation box.
	 */
	var canvas = document.createElement( "canvas" );
	canvas.className = "NavigatorBoxOverlay";
	canvas.style.visibility = "hidden";
	stack.getView().appendChild( canvas );

	/**
	 * Current incremental rotation.
	 */
	var incRotation = new THREE.Matrix4();

	/**
	 * Current project to view translation.
	 */
	var translation = new THREE.Vector3();

	/**
	 * Current project to view scale.
	 */
	var scale = 1;

	/**
	 * Current project to view rotation.
	 */
	var rotation = new THREE.Matrix4();

	/**
	 * Current project to view transform.
	 * affine = scale * translation * rotation.
	 */
	var affine = new THREE.Matrix4();

	/**
	 * Copy of current transform when mouse dragging started.
	 */
	var affineDragStart = new THREE.Matrix4();

	/**
	 * Coordinates where mouse dragging started.
	 */
	var oX = 0, oY = 0;

	/**
	 * Current rotation axis for rotating with keyboard, indexed x->0, y->1, z->2.
	 */
	var axis = 0;

	/**
	 * Screen coordinates to keep centered while zooming or rotating with the keyboard.
	 * For example set these to <em>(screen-width/2, screen-height/2)</em>
	 */
	var centerX = 0, centerY = 0;

	/**
	 * One step of rotation (radian).
	 */
	var step = Math.PI / 180;

	/**
	 * Set the current source to screen transform.
	 *
	 * @param transform THREE.Matrix4
	 */
	this.setTransform =function( transform )
	{
		affine.copy( t );
	}

	/**
	 * Set screen coordinates to keep fixed while zooming or rotating with the keyboard.
	 * For example set these to <em>(screen-width/2, screen-height/2)</em>
	 */
	this.setCenter = function( x, y )
	{
		centerX = x;
		centerY = y;
	}

	/**
	 * Return rotate/translate/scale speed resulting from modifier keys.
	 *
	 * Normal speed is 1. SHIFT is faster (10). CTRL is slower (0.1).
	 *
	 * @param modifiers
	 * @return speed resulting from modifier keys.
	 */
	/*
	private static double keyModfiedSpeed( final int modifiers )
	{
		if ( ( modifiers & KeyEvent.SHIFT_DOWN_MASK ) != 0 )
			return 10;
		else if ( ( modifiers & KeyEvent.CTRL_DOWN_MASK ) != 0 )
			return 0.1;
		else
			return 1;
	}
	*/

	var rotating = false;

	this.mousePressed = function( x, y )
	{
		oX = x;
		oY = y;
		affineDragStart.copy( affine );
		rotating = true;
	};

	this.mouseReleased = function( x, y )
	{
		rotating = false;
	};

	/**
	 * button 1   : rotate
	 * button 2/3 : translate
	 */
	this.mouseDragged = function( x, y, button )
	{
		var dX = oX - x;
		var dY = oY - y;

		// rotate
		var v = step;
		incRotation.identity();
		incRotation.rotateY(  dX * v );
		incRotation.rotateX( -dY * v );
	};



	//////////// box painting /////////


	this.resize = function( width, height )
	{
		canvas.width=width;
		canvas.height=height;
		self.setCenter( width / 2, height / 2 );
		self.redraw();
	};

	var line = function( ctx, p, q )
	{
		ctx.moveTo( p.x, p.y );
		ctx.lineTo( q.x, q.y );
	};

	this.redraw = function()
	{
		if ( ! rotating )
		{
			canvas.style.visibility = "hidden";
			return;
		}
		canvas.style.visibility = "visible";
		stack.getView().style.cursor = "crosshair";
		var ctx = canvas.getContext( "2d" );
		var w = canvas.width;
		var h = canvas.height;

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, w, h);

		ctx.globalAlpha = 0.4;
		ctx.fillStyle = "#000000";
		ctx.fillRect(0, 0, w, h);

		ctx.globalAlpha = 1.0;
		ctx.setTransform( 1, 0, 0, 1, oX, oY );

		var sX0 = -1;
		var sX1 =  1;
		var sY0 = -1;
		var sY1 =  1;
		var sZ0 = -1;
		var sZ1 =  1;

		var p000 = new THREE.Vector3( sX0, sY0, sZ0 );
		var p100 = new THREE.Vector3( sX1, sY0, sZ0 );
		var p010 = new THREE.Vector3( sX0, sY1, sZ0 );
		var p110 = new THREE.Vector3( sX1, sY1, sZ0 );
		var p001 = new THREE.Vector3( sX0, sY0, sZ1 );
		var p101 = new THREE.Vector3( sX1, sY0, sZ1 );
		var p011 = new THREE.Vector3( sX0, sY1, sZ1 );
		var p111 = new THREE.Vector3( sX1, sY1, sZ1 );

		var scale = 30;
		var depth = 5;
		var ox = 0, oy = 0, oz = depth;
		var s = scale * depth;
		var projection = new THREE.Matrix4(
			s, 0, 0, -s*ox,
			0, s, 0, -s*oy,
			0, 0, 1, -oz,
			0, 0, 1, -oz );
		projection.multiplyMatrices( projection, incRotation );

		p000.applyProjection( projection );
		p100.applyProjection( projection );
		p010.applyProjection( projection );
		p110.applyProjection( projection );
		p001.applyProjection( projection );
		p101.applyProjection( projection );
		p011.applyProjection( projection );
		p111.applyProjection( projection );

		ctx.beginPath();

		line( ctx, p000, p100 );
		line( ctx, p100, p110 );
		line( ctx, p110, p010 );
		line( ctx, p010, p000 );

		line( ctx, p001, p101 );
		line( ctx, p101, p111 );
		line( ctx, p111, p011 );
		line( ctx, p011, p001 );

		line( ctx, p000, p001 );
		line( ctx, p100, p101 );
		line( ctx, p110, p111 );
		line( ctx, p010, p011 );
		
		ctx.moveTo( -5,  0 );
		ctx.lineTo(  5,  0 );		
		ctx.moveTo(  0, -5 );
		ctx.lineTo(  0,  5 );		

		ctx.strokeStyle = "#88FF88";
		ctx.lineWidth = 1;
		ctx.stroke();
	};

}
