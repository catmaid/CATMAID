
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from shapely.geometry import Polygon, LineString, Point

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.common import _create_relation

def path_to_svg(xy):
    
    ctrl_char = 'M'
    svg_str = '';
    
    for v in zip(xy[0], xy[1]):
        svg_str = ' '.join([svg_str, ctrl_char] + map(str, v))
        ctrl_char = 'L'
    svg_str = ' '.join([svg_str, 'Z']);
    
    return svg_str
        

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def push_volume_trace(request, project_id=None, stack_id=None):
    svg_template = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\
<svg\
	xmlns:svg="http://www.w3.org/2000/svg"\
	xmlns="http://www.w3.org/2000/svg"\
	version="1.1"\
	>\
	<g id="polygon">\
		<path d="{}" style="stroke-width:2" fill-rule="evenodd" />\
	</g>\
</svg>'

    svg_str = '';
    x = request.POST.getlist('x[]')
    y = request.POST.getlist('y[]')
    r = request.POST.getlist('r[]')
    i = request.POST.get('i')
    
    r0 = float(r[0])
    
    union_polygon = None
    
    if len(x) > 1:            
        xystr = map(list, zip(*[x, y]))    
        xy = [map(float, z) for z in xystr]
        
        union_polygon = LineString(xy).buffer(r0)
    else:
        union_polygon = Point(float(x[0]), float(y[0])).buffer(r0)
        
    svg_str = path_to_svg(union_polygon.exterior.xy)
    union_xy = union_polygon.exterior.xy

    for interior in union_polygon.interiors:
        print "got interior"
        svg_str = ' '.join([svg_str, path_to_svg(interior.xy)])
    
    svg_xml = svg_template.format(svg_str);
    
    return HttpResponse(json.dumps({'x' : map(str, union_xy[0]),
        'y' : map(str, union_xy[1]), 'i' : i, 'svg' : svg_xml}))
