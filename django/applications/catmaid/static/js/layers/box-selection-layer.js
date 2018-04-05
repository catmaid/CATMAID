/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * The box selection layer that hosts the a box selection/region of
   * interest.
   */
  function BoxSelectionLayer( stackViewer, tool, box)
  {
      this.setOpacity = function( val )
      {
          view.style.opacity = val;
          opacity = val;
      };

      this.getOpacity = function()
      {
          return opacity;
      };

      this.redraw = function(completionCallback)
      {
          let svProjectCoords = stackViewer.projectCoordinates();
          var cropBoxBB = tool.getCropBoxBoundingBox(stackViewer);

          // Size and positioning
          view.style.visibility = "visible";
          view.style.left = cropBoxBB.left_px + "px";
          view.style.top = cropBoxBB.top_px + "px";
          view.style.width = cropBoxBB.width_px  + "px";
          view.style.height = cropBoxBB.height_px  + "px";

          // If z1 and z2 are set, the box is only rendered if the linked
          // stack viewer's Z is between them. Like the rest of this layer, it
          // assumes an XY orientation and doesn't work with ortho stacks.
          if (cropBoxBB.z1 !== undefined && cropBoxBB.z2 !== undefined) {
            if (svProjectCoords.z < cropBoxBB.z1 || svProjectCoords.z >= cropBoxBB.z2) {
              view.style.display = 'none';
            } else {
              view.style.display = 'block';
            }
          }

          // Rotation
          var rotation_cmd = "rotate(" + cropBoxBB.rotation_cw + "deg)";
          view.style.webkitTransform = rotation_cmd;
          view.style.MozTransform = rotation_cmd;
          view.style.msTransform = rotation_cmd;
          view.style.OTransform = rotation_cmd;
          view.style.transform = rotation_cmd;

          var current_scale = stackViewer.scale;
          var output_scale = 1 / Math.pow( 2, tool.zoomlevel );
          var output_width_px = ( cropBoxBB.width_px / current_scale) * output_scale;
          var output_height_px = ( cropBoxBB.height_px / current_scale) * output_scale;
          var output_width_world = tool.convertWorld( cropBoxBB.width_world );
          var output_height_world = tool.convertWorld( cropBoxBB.height_world );

          // Update text nodes
          textWorld.replaceChild( document.createTextNode(
              output_width_world.toFixed( 3 ) + " x " +
              output_height_world.toFixed( 3 ) + " " + tool.output_unit ),
              textWorld.firstChild );
          textScreen.replaceChild( document.createTextNode(
              output_width_px.toFixed( 0 ) + " x " +
              output_height_px.toFixed( 0 ) + " px" ),
              textScreen.firstChild );

          // let active crop box show status info
          if (is_active) {
              CATMAID.statusBar.replaceLast(
                  tool.convertWorld(cropBoxBB.left_world).toFixed( 3 ) + ", " +
                  tool.convertWorld( cropBoxBB.top_world ).toFixed( 3 ) + " -> " +
                  tool.convertWorld( cropBoxBB.right_world ).toFixed( 3 ) + "," +
                  tool.convertWorld( cropBoxBB.bottom_world ).toFixed( 3 ) );
          }

          if (completionCallback) {
              completionCallback();
          }

          return;
      };

      this.resize = function( width, height )
      {
          return;
      };

      this.show = function ()
      {
          view.style.display = "block";
      };

      this.hide = function ()
      {
          view.style.display = "none";
      };

      this.getView = function()
      {
          return view;
      };

      this.unregister = function()
      {
          if ( stackViewer && view.parentNode == stackViewer.getView() )
              stackViewer.getView().removeChild( view );
      };

      this.setActive = function( active )
      {
          is_active = active;

          if (active)
              view.className = "cropBox";
          else
              view.className = "cropBoxNonActive";
      };

      var self = this;

      // indicates if this the currently active crop box
      var is_active = true;

      var stackViewer = stackViewer;
      var box = box;

      var view = document.createElement( "div" );
      view.className = "cropBox";
      view.style.visibility = "hidden";
      var textWorld = document.createElement( "p" );
      textWorld.className = "world";
      textWorld.appendChild( document.createTextNode( "0 x 0" ) );
      view.appendChild( textWorld );
      var textScreen = document.createElement( "p" );
      textScreen.className = "screen";
      textScreen.appendChild( document.createTextNode( "0 x 0" ) );
      view.appendChild( textScreen );

      // internal opacity variable
      var opacity = 1;
      this.visible = true;
      this.isHideable = true;

      // add view to DOM
      if( self.visible )
          stackViewer.getView().appendChild( view );
  }

  /**
   * Return friendly name of this layer.
   */
  BoxSelectionLayer.prototype.getLayerName = function()
  {
    return "Box selection";
  };


  // Export layer into CATMAID namespace
  CATMAID.BoxSelectionLayer = BoxSelectionLayer;


})(CATMAID);
