

var VolumeTracingAnnotations = new function ()
{
    var self = this;
    var pendingTraces = [];
    this.tool = null;
    this.stack = null;
    
    /*this.removePendingTrace = function(id)
    {
        var trace = null;
        for (var i = 0; i < pendingTraces.length; i++)
        {
            if (id == pendingTraces[i].id)
            {
                trace = pendingTraces.splice(i, 1);
                trace = trace[0];
                break;
            }            
        }
        return trace;
    }*/

    
    this.fixTrace = function(data)
    {
        //console.log(data);
        
        for (var ii = 0; ii < data.i.length; ii++)
        {
            
            var id = data.i[ii];
            var dbid = data.dbi[ii];
            var trace = self.tool.getTraceByID(id);           
            var svg = data.svg[ii];
            
            if (trace == null)
            {
                continue;
            }
            else
            {
                trace.populateSVG(svg);
                                
                if (id != dbid)
                {
                    trace.id = dbid;
                }
            }
            
        }
        return;
    }
    
    this.setStack = function(inStack)
    {
        self.stack = inStack;
    }
    
    this.pushTrace = function(trace)
    {
        var radii = [];
        var ctrX = [];
        var ctrY = [];
        
        //pendingTraces.push(trace);
        
        r = trace.r;
        ctrX = trace.x;
        ctrY = trace.y;
        
        screenPos = self.stack.screenPosition();
        
        data = {'r' : r, //r, x, y in stack coordinates
                'x' : ctrX,
                'y' : ctrY,
                'z' : self.stack.z * self.stack.resolution.z + self.stack.translation.z,
                'i' : trace.id,
                'instance_id' : VolumeTracingPalette.trace_id,
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
          "url": django_url + project.id + '/stack/' + self.stack.id + '/volumetrace/push',
          "data": data,
          "success": self.fixTrace          
        }); 
    }
    
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
    
    this.setColor = function(instance_id, color)
    {
        self.tool.brush.fill = color;
        $.ajax({
            "dataType" : 'json',
            "type" : "POST",
            "cache" : false,
            "url" : django_url + project.id + '/volumetrace/settraceproperties',
            "data" : {'color' : color,
                      'opacity' : 0.5,
                      'trace_id' : instance_id},
            "success" : function(){}
        });
    }
    
    this.setBrushColor = function(color)
    {
        self.tool.brush.fill = color;
    }
}

var VolumeTracingPalette = new function()
{
    var self = this;
    this.trace_id = "";
    this.trees = [];
    
    this.init = function(pid)
    {
        var tree = $("#area_segment_tree");
        var color_wheel = $("#area_segment_colorwheel")[0];
        
        
        
        self.colorwheel = Raphael.colorwheel(color_wheel, 150);
        color_wheel.style.position = 'absolute';
        color_wheel.style.bottom = '0px';
        color_wheel.style.right = '0px';
        color_wheel.style.width = '60%';
        color_wheel.style.margin = '0 auto';
        color_wheel.hidden = true;
        
        self.colorwheel.onchange(function(){
            VolumeTracingAnnotations.setBrushColor(
                self.colorwheel.color().hex)});
        self.colorwheel.ondrag(function(){}, 
            function(){
            VolumeTracingAnnotations.setColor(
                self.trace_id, self.colorwheel.color().hex)});
        
        tree.jstree({
          "core": {
            "html_titles": false
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
            "icons": true
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
                } /*else if (type_of_node === "instance") {
                    menu = {
                    "edit_area_object": {
                        "separator_before": false,
                        "separator_after": false,
                        "label": "Edit Object",
                        "action": function (obj) {
                            return self.edit_object(pid, tree_id);
                         }
                    }
                    }
                }*/
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
                VolumeTracingAnnotations.tool.enable();
                self.colorwheel.color(VolumeTracingAnnotations.tool.brush.fill);                
                $('#area_segment_colorwheel')[0].hidden = false;
                
                $.ajax({
                    "dataType": 'json',
                    "type": "POST",
                      "cache": false,
                      "url": django_url + project.id + '/volumetrace/traceproperties',
                      "data": {'trace_id' : self.trace_id},
                      "success": function(data)
                        {
                            self.colorwheel.color(data.color);
                            VolumeTracingAnnotations.setBrushColor(data.color);
                        }          
                }); 
            }
            else
            {
                $('#area_segment_colorwheel')[0].hidden = true;
                VolumeTracingAnnotations.tool.disable();
            }
            //console.log(event);
            //console.log(data);
        }).bind("deselect_node.jstree", function (event, data){
            $('#area_segment_colorwheel')[0].hidden = true;
            VolumeTracingAnnotations.tool.disable();
        });

    }
    
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
}
