
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from shapely.geometry import Polygon, LineString

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.common import _create_relation

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def push_volume_trace(request, project_id=None, stack_id=None):
    x = request.POST.getlist('x[]')
    y = request.POST.getlist('y[]')
    r = request.POST.getlist('r[]')
    i = request.POST.get('i')
    
    r0 = r[0]
    
    xystr = map(list, zip(*[x, y]))    
    xy = [map(float, z) for z in xystr]
    
    union_xy = LineString(xy).buffer(float(r0)).exterior.xy

    json.encoder.FLOAT_REPR = lambda o: format(o, '.2f')
    return HttpResponse(json.dumps({'x' : map(str, union_xy[0]),
        'y' : map(str, union_xy[1]), 'i' : i}))
