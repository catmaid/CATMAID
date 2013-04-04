/**
* Volume tracing data transactions
* 
* Note that at this early stage in development, nomenclature has not 
* yet been settled. As such, you will find references to Volume Tracing,
* Area Tracing and Area Segmentation, which are all subtle variations on
* the same concept. IE, they all relate here.
*/

var VolumeTracingAnnotations = new function ()
{
    var self = this;
    this.tool = null;
    this.stack = null;
    
    this.setStack = function(inStack)
    {
        self.stack = inStack;
    }
    
    /**
     * Pushes a FabricTrace into the database. If it is an additive FabricTrace, this adds a new
     * AreaTrace polygon to the project (unless it overlaps an existing one). If it is an eraser-
     * mask FabricTrace, this performs the erase operation.
     * 
     * trace - the FabricTrace to push
     * callback - a callback function, in the style of VolumeTracingTool.fixTrace(data)
     */
    this.pushTrace = function(trace, callback)
    {
        var radii = [];
        var ctrX = [];
        var ctrY = [];
        
        var url = trace.isAdditive() ? '/volumetrace/push' : '/volumetrace/erase';
        
        r = trace.r;
        ctrX = trace.x;
        ctrY = trace.y;
        
        /*
         * We push only the radius and the list of x, y. A server side script creates a
         * correctly-merged polygon, which will be fed as svg to the callback function.
        */
        
        screenPos = self.stack.screenPosition();
        
        data = {'r' : r, //r, x, y in stack coordinates
                'x' : ctrX,
                'y' : ctrY,
                'z' : self.stack.z * self.stack.resolution.z + self.stack.translation.z,
                'i' : trace.id,
                'instance_id' : trace.trace_id,
                'xtrans' : self.stack.translation.x + self.stack.x,
                'ytrans' : self.stack.translation.y + self.stack.y,
                'wview' : self.stack.viewWidth,
                'hview' : self.stack.viewHeight,
                'scale' : self.stack.scale,
                'top' : screenPos.top,
                'left': screenPos.left};

       $.ajax({
          "dataType": 'json',
          "type": "POST",
          "cache": false,
          "url": django_url + project.id + '/stack/' + self.stack.id + url,
          "data": data,
          "success": callback
        }); 
    }
    
    /**
     * Calls the server to retrieve all traces for the given view. Returned data is passed to 
     * the callback function, which should be in the style of VolumeTracingTool.pullTraces(data).
     */
    this.retrieveAllTraces = function(callback)
    {
        screenPos = self.stack.screenPosition();
        
        data = {'z' : self.stack.z * self.stack.resolution.z + self.stack.translation.z,
                'xtrans' : self.stack.translation.x + self.stack.x,
                'ytrans' : self.stack.translation.y + self.stack.y,
                'wview' : self.stack.viewWidth,
                'hview' : self.stack.viewHeight,
                'scale' : self.stack.scale,
                'top' : screenPos.top,
                'left': screenPos.left};
        
        $.ajax({
            "dataType" : 'json',
            "type" : "POST",
            "cache" : false,
            "url" : django_url + project.id + '/stack/' + self.stack.id + '/volumetrace/getall',
            "data" : data,
            "success" : callback
        });
    }
    
    /**
     * Sets view properties for a given ClassInstance in the catmaid db.
     * instance_id - the id of the ClassInstance to set.
     * vp - an object with fields:
     *      color - a hex string of the style '#0000ff'
     *      opacity - a number from 0 to 1.
     * refresh - if true, will cause the jstree to refresh when the server call completes
     *           successfully.
     */
    this.setViewProps = function(instance_id, vp, refresh)
    {
        var refreshTree = function()
        {
            var tree = $("#area_segment_tree");
            if (tree.length)
            {
                tree.jstree("refresh");
            }
        };
        
        var callback = refresh ? refreshTree : function(){};
        
        $.ajax({
            "dataType" : 'json',
            "type" : "POST",
            "cache" : false,
            "url" : django_url + project.id + '/volumetrace/settraceproperties',
            "data" : {'color' : vp.color,
                      'opacity' : vp.opacity,
                      'trace_id' : instance_id},
            "success" : callback
        });
    }
    
    /**
     * Closes a hole, if it exists, for the given trace_id at position x, y in stack coordinates.
     */
    this.closeHole = function(x, y, trace_id, callback)
    {
        data = {'x': x,
                'y': y,
                'z' : self.stack.z * self.stack.resolution.z + self.stack.translation.z,
                'instance_id': trace_id,
                'xtrans' : self.stack.translation.x + self.stack.x,
                'ytrans' : self.stack.translation.y + self.stack.y,
                'wview' : self.stack.viewWidth,
                'hview' : self.stack.viewHeight,
                'scale' : self.stack.scale,
                'top' : screenPos.top,
                'left': screenPos.left};
        $.ajax({
            "dataType" : 'json',
            "type" : "POST",
            "cache" : false,
            "url": django_url + project.id + '/stack/' + self.stack.id + '/volumetrace/closehole',
            "data" : data,
            "success" : callback
        });
    }
    
    /**
     * Closes all holes for an AreaSegment that contains the point (x,y)
     */
    this.closeAllHoles = function(x, y, trace_id, callback)
    {
        data = {'x': x,
                'y': y,
                'z' : self.stack.z * self.stack.resolution.z + self.stack.translation.z,
                'instance_id': trace_id,
                'xtrans' : self.stack.translation.x + self.stack.x,
                'ytrans' : self.stack.translation.y + self.stack.y,
                'wview' : self.stack.viewWidth,
                'hview' : self.stack.viewHeight,
                'scale' : self.stack.scale,
                'top' : screenPos.top,
                'left': screenPos.left};
        $.ajax({
            "dataType" : 'json',
            "type" : "POST",
            "cache" : false,
            "url": django_url + project.id + '/stack/' + self.stack.id + '/volumetrace/closeallholes',
            "data" : data,
            "success" : callback
        });
    }
}

/**
 * Handles the VolumeTracing window.
 */
var VolumeTracingPalette = new function()
{
    var self = this;
    var window = null;
    this.trace_id = "";
    this.trees = [];
    this.class_id = -1;
    // Default view properties
    this.view_props = {'color': '#0000ff', 'opacity': 0.5};
    this.view = null;
    
    /**
     * Sync view_props.color to the color wheel, and update the active VolumeTracingTool.
     */
    this.syncColor = function()
    {
        self.view_props.color = self.colorwheel.color().hex;
        VolumeTracingAnnotations.tool.setViewProps(self.trace_id, self.view_props);
    }
    
    /**
     * Sync view_props.color to the color wheel, update the active VolumeTracingTool, and
     * propagate the change to the database.
     */
    this.syncColorAndUpdate = function()
    {
        self.syncColor();
        VolumeTracingAnnotations.setViewProps(
            self.trace_id, self.view_props, true);
    }
    
    this.changeOpacity = function()
    {
        self.view_props.opacity = self.opacity_slider.val / 100;
        VolumeTracingAnnotations.tool.setViewProps(self.trace_id, self.view_props);
        VolumeTracingAnnotations.setViewProps(self.trace_id, self.view_props, false);
    }
    
    this.init = function(pid)
    {
        var tree = $("#area_segment_tree");
        self.view = $("#area_segment_view_properties")[0];
        var colorwheel_view = $("#area_segment_colorwheel")[0];                
        var caption_view = $("#area_segment_view_caption")[0];
        var slider_box = $("#volseg_opacity_box")[0];
        
        self.view.style.position = 'absolute';
        self.view.style.bottom = '0px';
        self.view.style.right = '0px';
        self.view.style.width = '100%';
        self.view.style.height = '200px';
        self.view.style.margin = '0 auto';
        
        self.colorwheel = Raphael.colorwheel(colorwheel_view, 150);
        
        self.opacity_slider = new Slider(SLIDER_HORIZONTAL, true, 1, 100, 100,
            self.view_props.opacity * 100, self.changeOpacity);
            
        while (slider_box.firstChild)
        {
            slider_box.removeChild(slider_box.firstChild);
        }
        
        var slider_inner_box = document.createElement("div");
        slider_inner_box.className = "box";
        slider_inner_box.id = "volseg_opacity_box";
        var slider_inner_box_label = document.createElement("p");
        slider_inner_box_label.appendChild(document.createTextNode("Opacity" + "     "))
        slider_inner_box.appendChild(slider_inner_box_label);
        slider_inner_box.appendChild(self.opacity_slider.getView());
        slider_inner_box.appendChild(self.opacity_slider.getInputView());
        slider_box.appendChild(slider_inner_box);
        
        self.view.hidden = true;
        
        //Change brush in real-time
        self.colorwheel.onchange(self.syncColor);
                
        //Change back-end attribute on mouse-up
        self.colorwheel.ondrag(function(){}, 
            self.syncColorAndUpdate);
        
        tree.jstree({
          "core": {
            "html_titles": true
          },
          "plugins": ["themes", "json_data", "ui", "crrm", "types", "dnd", "contextmenu"],
          "json_data": {
            "ajax": {
              "url": django_url + pid + '/volumetrace/classtree',
              "data": function (n) {
                var expandRequest, parentName, parameters;
                // depending on which type of node it is, display those
                // the result is fed to the AJAX request `data` option
                //console.log("requesting jstree data");
                //console.log(n)
                parameters = {
                  "pid": pid,
                  "parentid": n.attr ? n.attr("id").replace("class_", "") : -1
                };
                /*if (ObjectTree.currentExpandRequest) {
                  parameters['expandtarget'] = ObjectTree.currentExpandRequest.join(',');
                }*/
                return parameters;
              },
              "success": function (e) {
                
                if (e.error) {
                  alert(e.error);
                }
              }
            },
            "progressive_render": true
          },
          "ui": {
            "select_limit": 1,
            "select_multiple_modifier": "ctrl",
            "selected_parent_close": "deselect"
          },

          "themes": {
            "theme": "classic",
            "url": STATIC_URL_JS + "widgets/themes/kde/jsTree/classic/style.css",
            "dots": true,
            "icons": false
          },
          "contextmenu": {
            "items": function (obj) {
                var type_of_node = obj.attr("rel");
                var menu = {};
                if (type_of_node === "class") {
                    menu = {
                    "create_new_area_object": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Create New Object",
                        "action": function (obj) {
                            return self.create_new_object(this, pid);
                         }
                    }
                    }
                }
                return menu;
            }
          },
          "crrm": {},
          "types": {
            "types": {
                "class": {
                    "icon": {
                        "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/volumesegment/class.png"
                    },
                },
                "instance": {
                    "icon": {
                        "image": STATIC_URL_JS + "widgets/themes/kde/jsTree/volumesegment/instance.png"
                    },
                }
            }
          }
        }).bind("select_node.jstree", function (event, data) {
            var id = data.rslt.obj.attr('id');
            if (id.indexOf('instance') >= 0)
            {
                self.trace_id = id.replace('instance_', '');                
                self.colorwheel.color(self.view_props.color);                
                self.view.hidden = false;
                var trace_id = self.trace_id;
                
                $.ajax({
                    "dataType": 'json',
                    "type": "POST",
                      "cache": false,
                      "url": django_url + project.id + '/volumetrace/traceproperties',
                      "data": {'trace_id' : self.trace_id},
                      "success": function(data)
                        {                            
                            self.colorwheel.color(data.color);
                            self.opacity_slider.setByValue(data.opacity * 100, true);
                            self.view_props.color = data.color;
                            self.view_props.opacity = data.opacity;
                            VolumeTracingAnnotations.tool.enable();
                            VolumeTracingAnnotations.tool.setViewProps(trace_id, data);                            
                        }          
                }); 
            }
            else
            {
                self.view.hidden = true;
                VolumeTracingAnnotations.tool.disable();
            }
        }).bind("deselect_node.jstree", function (event, data){
            self.view.hidden = true;
            VolumeTracingAnnotations.tool.disable();
        });

    }
    
    /**
     * Create a new traceable_root ClassInstance
     */
    this.create_new_object = function(n, pid)
    {
        $('#trace_add_dialog #trace_cancel').off("click").on("click",
        function() {
            // clear input box
            $('#trace_add_dialog #traceclassname').val("");
            $.unblockUI();
            return false;
        });
        $('#trace_add_dialog #trace_add').off("click").on("click",
        function(){
            console.log("add clicked");
            console.log(n);
            var parentClass = n.get_text();
            var traceName = $('#trace_add_dialog #tracename').val();
            
            $.ajax({
                "dataType": 'json',
                "type": "POST",
                  "cache": false,
                  "url": django_url + project.id + '/volumetrace/create',
                  "data": {'parent' : n.get_text(),
                           'pid' : pid,
                           'trace_name' : traceName},
                  "success": VolumeTracingPalette.refresh        
            });
            
            $('#trace_add_dialog #traceclassname').val("");
            $.unblockUI();
            return false;
        });
        
        $.blockUI({ message: $('#trace_add_dialog') });
    }
    
    this.refresh = function()
    {
        console.log('fresh!');
        $("#area_segment_tree").jstree("refresh", -1);
    }

    this.setWindow = function(win)
    {
        window = win;
        window.addListener(function(cmwin, sig)
        {
            if (sig == CMWWindow.CLOSE)
            {
                console.log("Closed window")
                window = null;
            }
        });
    }

    this.isWindowClosed = function()
    {
        return window == null;
    }
    
    this.closeWindow = function()
    {
        if (window)
        {
            window.close();
        }
    }
}
