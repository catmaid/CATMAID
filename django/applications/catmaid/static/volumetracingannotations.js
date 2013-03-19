

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
        /*var x = data.x;
        var y = data.y;
        var id = data.i;
        
        var trace = self.removePendingTrace(id);
        
        var path = [];
        
        for (var i = 0; i < x.length; i++)
        {
            path.push({x: x[i], y: y[i]});
        }
        
        trace.setObject(new fabric.Polygon(path,
            {fill: 'blue', selectable:false}));*/
        var id = data.i;
        var trace = self.removePendingTrace(id);
        var objects = [];
        
        fabric.loadSVGFromString(data.svg,
            function(obj, opt)
            {
                var widget = new fabric.PathGroup(obj, opt);
                objects.push(widget);
            });
        
        trace.setObjects(objects);
        
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
        //trace.objectList contains only Circles right now.
        var circleList = trace.objectList;
        
        pendingTraces.push(trace);
        
        for (var i = 0; i < circleList.length; i++)
        {
            c = circleList[i];
            radii[i] = c.radius;
            ctrX[i] = c.left;
            ctrY[i] = c.top;
        }
        
        data = {'r' : radii,
                'x' : ctrX,
                'y' : ctrY,
                'i' : trace.id};

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
