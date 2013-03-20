

function VolumeTracingAnnotations()
{
    var self = this;
    var pendingTraces = [];
    
    this.stack = null;
    
    this.removePendingTrace = function(id)
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
    }
    
    this.fixTrace = function(data)
    {
        console.log(data);
        
        var id = data.i;
        var dbid = data.dbi;
        var trace = self.removePendingTrace(id);
        var objects = [];
        
        fabric.loadSVGFromString(data.svg,
            function(obj, opt)
            {
                var widget = new fabric.PathGroup(obj, opt);
                objects.push(widget);
            });
        
        trace.setObjects(objects);
        
        if (id != dbid)
        {
            trace.id = dbid;
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
        
        pendingTraces.push(trace);
        
        r = trace.r;
        ctrX = trace.x;
        ctrY = trace.y;
        
        data = {'r' : r, //r, x, y in stack coordinates
                'x' : ctrX,
                'y' : ctrY,
                'z' : self.stack.z * self.stack.resolution.z + self.stack.translation.z,
                'i' : trace.id,
                'xtrans' : self.stack.translation.x + self.stack.x,
                'ytrans' : self.stack.translation.y + self.stack.y,
                'wview' : self.stack.viewWidth,
                'hview' : self.stack.viewHeight,
                'scale' : self.stack.scale};

       $.ajax({
          "dataType": 'json',
          "type": "POST",
          "cache": false,
          "url": django_url + project.id + '/stack/' + self.stack.id + '/volumetrace/push',
          "data": data,
          "success": self.fixTrace          
        }); 
    }
}
