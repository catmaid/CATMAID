/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function(CATMAID) {

  "use strict";

  /**
   * Box selection tool. Allows drawing of a box on the view.
   */
  function BoxSelectionTool()
  {
      this.stackViewer = null;
      this.cropBox = false;
      this.cropBoxCache = {};
      this.zoomlevel = null;

      // Output unit and factor wrt. nm
      this.output_unit = unescape( "nm" );
      this.output_unit_factor = 1.0;

      this.getCropBox = function()
      {
          return this.cropBox;
      };
  }

  BoxSelectionTool.prototype.toPx = function( world_coord, resolution )
  {
      return world_coord / resolution * this.stackViewer.scale;
  };

  BoxSelectionTool.prototype.toWorld = function( px_coord, resolution )
  {
      return px_coord / this.stackViewer.scale * resolution;
  };

  /**
   * A method that expects a value in nano meters to convert
   * it depending on the tool settings.
   */
  BoxSelectionTool.prototype.convertWorld = function( val )
  {
      return val * this.output_unit_factor;
  };

  /**
   * Gets the bounding box of the current crop box in world
   * and pixel coordinates.
   */
  BoxSelectionTool.prototype.getCropBoxBoundingBox = function(stackViewer)
  {
      var t = Math.min( this.cropBox.top, this.cropBox.bottom );
      var b = Math.max( this.cropBox.top, this.cropBox.bottom );
      var l = Math.min( this.cropBox.left, this.cropBox.right );
      var r = Math.max( this.cropBox.left, this.cropBox.right );
      var width = r - l;
      var height = b - t;

      var screen = stackViewer.screenPosition();

      //! left-most border of the view in physical project coordinates
      var screen_left = stackViewer.primaryStack.stackToProjectX(stackViewer.z,
          screen.top, screen.left);
      var screen_top = stackViewer.primaryStack.stackToProjectY(stackViewer.z,
          screen.top, screen.left);

      var rx = stackViewer.primaryStack.resolution.x / stackViewer.scale;
      var ry = stackViewer.primaryStack.resolution.y / stackViewer.scale;

      var left_px = Math.floor( ( l - screen_left ) / rx );
      var top_px = Math.floor( ( t - screen_top ) / ry );
      var width_px = Math.floor( ( r - l ) / rx );
      var height_px = Math.floor( ( b - t ) / ry );
      var right_px = left_px + width_px;
      var bottom_px = top_px + height_px;

      return { left_world : l, top_world : t,
               right_world : r, bottom_world : b,
               width_world : width, height_world : height,
               left_px : left_px, top_px : top_px,
               right_px : right_px, bottom_px : bottom_px,
               width_px : width_px, height_px : height_px,
               rotation_cw: this.cropBox.rotation_cw,
               z1: this.cropBox.z1,
               z2: this.cropBox.z2 };
  };

  /**
   * Updates the visual representation of the current crop box.
   */
  BoxSelectionTool.prototype.updateCropBox = function()
  {
      // update all cached cropping boxes
      for ( var s in this.cropBoxCache )
      {
          var cb = this.cropBoxCache[ s ];
          cb.layer.redraw();
      }

      return;
  };

  /**
   * Redraws the content.
   */
  BoxSelectionTool.prototype.redraw = function()
  {
      // nothing to do here
  };

  /**
   * Creates a new cropping box and attaches it to the stack viewer.
   */
  BoxSelectionTool.prototype.initCropBox = function( stackViewer )
  {
      var cb = {};
      cb.stackViewer = stackViewer;

      // Add new layer (it removes existing ones by itself)
      cb.layer = new CATMAID.BoxSelectionLayer(stackViewer, this, cb);
      stackViewer.addLayer("BoxSelectionLayer", cb.layer);

      return cb;
  };

  /**
   * Creates a new crop box and attaches it to the view. Its position and extent
   * are expected to be in screen coordinates. Any existing crop box gets removed
   * first.
   */
  BoxSelectionTool.prototype.createCropBox = function( screenX, screenY,
      screenWidth, screenHeight )
  {
      if(typeof(screenWidth)==='undefined') screenWidth = 0;
      if(typeof(screenHeight)==='undefined') screenHeight = 0;
      var s = this.stackViewer;
      var worldX = (s.x + ( screenX - s.viewWidth  / 2 ) / s.scale ) * s.primaryStack.resolution.x;
      var worldY = (s.y + ( screenY - s.viewHeight / 2 ) / s.scale ) * s.primaryStack.resolution.y;
      var worldWidth = this.toWorld( screenWidth, s.primaryStack.resolution.x );
      var worldHeight = this.toWorld( screenHeight, s.primaryStack.resolution.y );

      this.createCropBoxByWorld(worldX, worldY, worldWidth, worldHeight);
  };

  /**
   * Creates a new crop box and attaches it to the view. Its position and extent
   * are expected to be in world coordinates. Any existing crop box gets removed
   * first.
   */
  BoxSelectionTool.prototype.createCropBoxByWorld = function( worldX,
      worldY, worldWidth, worldHeight, rotation_cw, z1, z2)
  {
      var view = this.stackViewer.getView();
      if ( this.cropBox )
      {
          delete this.cropBox;
          this.cropBox = false;
      }
      this.cropBox = this.initCropBox( this.stackViewer );
      this.cropBox.left = worldX + this.stackViewer.primaryStack.translation.x;
      this.cropBox.top = worldY + this.stackViewer.primaryStack.translation.y;
      this.cropBox.right = this.cropBox.left + worldWidth;
      this.cropBox.bottom = this.cropBox.top + worldHeight;
      this.cropBox.z1 = z1;
      this.cropBox.z2 = z2;
      this.cropBox.xdist = 0;
      this.cropBox.ydist = 0;
      this.cropBox.xorigin = this.cropBox.left;
      this.cropBox.yorigin = this.cropBox.top;
      this.cropBox.rotation_cw = rotation_cw ? rotation_cw : 0;

      // update the cache
      this.cropBoxCache[ this.stackViewer.primaryStack.id ] = this.cropBox;

      // update other (passive) crop boxes
      this.updateCropBox();
  };

  /**
   * unregister all project related GUI control connections and event
   * handlers, toggle off tool activity signals (like buttons)
   */
  BoxSelectionTool.prototype.destroy = function()
  {
      // clear cache
      for ( var s in this.cropBoxCache )
      {
          var cb = this.cropBoxCache[ s ];
          cb.stackViewer.removeLayer( "BoxSelectionLayer" );
          delete this.cropBoxCache[ s ];
      }
      this.cropBoxCache = {};
      this.cropBox = false;

      this.stackViewer = null;

      return;
  };

  /**
  * install this tool in a stack viewer.
  * register all GUI control elements and event handlers
  */
  BoxSelectionTool.prototype.register = function( parentStackViewer )
  {
      var self = this;
      // make sure the tool knows all (and only) open projecs
      CATMAID.Stack.list(project.id, true)
        .then(function(stacks) {
          $.each(stacks, function(i, s) {
              var id = s.id;
              var opened_stacks = project.getViewersForStack( id );
              if ( id in self.cropBoxCache )
              {
                  // remove the entry if the project isn't opened
                  if ( opened_stacks.length === 0 )
                      delete self.cropBoxCache[ id ];
              }
              else
              {
                  // make sure it has got a cropping box container in the cache
                  if ( opened_stacks.length )
                      self.cropBoxCache[ id ] = self.initCropBox( opened_stacks[0] );
              }
          });

          // bring a cached version back to life and
          // deactivate other available cropping boxes
          for ( var s in self.cropBoxCache )
          {
              var cb = self.cropBoxCache[ s ];
              var is_active = (cb.stackViewer == parentStackViewer);
              cb.layer.setActive( is_active );
              if (is_active)
                  self.cropBox = cb;
          }
        }).catch(CATMAID.handleError);

      this.stackViewer = parentStackViewer;
      this.zoomlevel = this.stackViewer.s;

      return;
  };

  // Export tool
  CATMAID.BoxSelectionTool = BoxSelectionTool;

})(CATMAID);
