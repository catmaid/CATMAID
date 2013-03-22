

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
    this.populateTrace = function(trace, svg)
    {
        if (svg == '')
        {
            trace.setObjects([]);
        }
        else
        {
            var objects = [];
            fabric.loadSVGFromString(svg,
                function(obj, opt)
                {
                    var widget = new fabric.PathGroup(obj, opt);
                    objects.push(widget);
                });
            
            trace.setObjects(objects);
        }
    }
    
    this.pullTraces = function(data)
    {
        //console.log(data);
        
        for (var ii = 0; ii < data.i.length; ii++)
        {
            var id = data.i[ii];
            var trace = self.tool.getTraceByID(id);
            var objects = [];
            var svg = data.svg[ii];
            
            if (trace == null)
            {
                trace = self.tool.createNewTrace();
                trace.id = id;
            }
            
            self.populateTrace(trace, svg);
        }
    }
    
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
                self.populateTrace(trace, svg);
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
    
    this.retrieveAllTraces = function()
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
            "success" : self.pullTraces
        });
    }
}

var VolumeTracingPalette = new function()
{
    var self = this;
    this.trace_id = "";
    
    this.init = function(pid)
    {
        var tree = $("#area_segment_tree");
        
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
                            return self.create_new_object(pid, tree_id);
                         }
                    }
                    }
                } else if (type_of_node === "instance") {
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
                VolumeTracingAnnotations.tool.enable();
            }
            //console.log(event);
            //console.log(data);
        }).bind("deselect_node.jstree", function (event, data){
            VolumeTracingAnnotations.tool.enable();
        });

    }
}
