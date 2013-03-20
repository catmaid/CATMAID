

function VolumeTracingAnnotations()
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
        console.log(data);
        
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
        console.log(data);
        
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
        console.log(data)
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
