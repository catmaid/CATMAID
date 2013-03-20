
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
        

def transform_volume_pts(t, w, s, x):
    return [(s * (y - t) + w/2) for y in x]

def transform_shapely_xy(tx, ty, w, h, s, xy):   
    xtr = transform_volume_pts(tx, w, s, xy[0])    
    ytr = transform_volume_pts(ty, h, s, xy[1])
    return [xtr, ytr]

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
    r = float(request.POST.get('r'))
    z = float(request.POST.get('z'))
    xtrans = float(request.POST.get('xtrans'));
    ytrans = float(request.POST.get('ytrans'));
    hview = float(request.POST.get('hview'));
    wview = float(request.POST.get('wview'));
    scale = float(request.POST.get('scale'));
    i = request.POST.get('i')
    s = get_object_or_404(Stack, pk=stack_id)
        
    print z
    
    union_polygon = None
    
    if len(x) > 1:            
        xystr = map(list, zip(*[x, y]))    
        xy = [map(float, xx) for xx in xystr]        
        union_polygon = LineString(xy).buffer(r)
    else:
        union_polygon = Point(float(x[0]), float(y[0])).buffer(r)
    
    ext_xy = transform_shapely_xy(xtrans, ytrans, hview, wview, scale,
        union_polygon.exterior.xy)
        
   
    svg_str = path_to_svg(ext_xy)
    union_xy = union_polygon.exterior.xy
    
    min_x = min(union_xy[0]);
    min_y = min(union_xy[1]);
    max_x = max(union_xy[0]);
    max_y = max(union_xy[1]);

    for interior in union_polygon.interiors:
        int_xy = transform_shapely_xy(xtrans, ytrans, hview, wview,
            scale, interior.xy);
        svg_str = ' '.join([svg_str, path_to_svg(int_xy)])
    
    svg_xml = svg_template.format(svg_str);
    
    #coordinate_list = [int(v) for v in union_xy[0].tolist() + union_xy[1].tolist()]
    
    coordinate_list = union_xy[0].tolist() + union_xy[1].tolist()
    
    aseg = AreaSegment(
        user=request.user,
        project=Project.objects.get(id=project_id),
        stack = s,
        coordinates = coordinate_list,
        min_x = min_x,
        max_x = max_x,
        min_y = min_y,
        max_y = max_y,
        z = z)
    aseg.save()
    
    return HttpResponse(json.dumps({'x' : map(str, union_xy[0]),
        'y' : map(str, union_xy[1]), 'i' : i, 'dbi' : aseg.id, 'svg' : svg_xml}))
        
