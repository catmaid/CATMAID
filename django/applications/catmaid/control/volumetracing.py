
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from shapely.geometry import Polygon, LineString, Point
from shapely.ops import cascaded_union

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

def transform_shapely_xy(p, xy):   
    xtr = transform_volume_pts(p['xtrans'], p['wview'], p['scale'], xy[0])    
    ytr = transform_volume_pts(p['ytrans'], p['hview'], p['scale'], xy[1])
    return [xtr, ytr]
    
def shapely_polygon_to_svg(polygon, transform_params):
    svg_template = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\
<svg\
	xmlns:svg="http://www.w3.org/2000/svg"\
	xmlns="http://www.w3.org/2000/svg"\
	version="1.1"\
	>\
	<g id="polygon">\
		<path d="{}" fill-rule="evenodd" />\
	</g>\
</svg>'
    exy = polygon.exterior.xy;
    exy = transform_shapely_xy(transform_params, exy)
    svg_str = path_to_svg(exy)
    for interior in polygon.interiors:
        ixy = interior.xy
        ixy = transform_shapely_xy(transform_params, ixy)
        svg_str = ' '.join([svg_str, path_to_svg(ixy)])
    return svg_template.format(svg_str)

def request_to_transform_params(request):
    param_names = ['xtrans', 'ytrans', 'hview', 'wview', 'scale', 'top', 'left'] 
    transform_params = dict()
    for param in param_names:        
        transform_params[param] = float(request.POST.get(param))
    return transform_params
        
def shapely_polygon_bounds(polygon):
    xy = polygon.exterior.xy
    min_x = min(xy[0])
    min_y = min(xy[1])
    max_x = max(xy[0])
    max_y = max(xy[1])
    return [min_x, min_y, max_x, max_y]

def coords_to_tuples(c):
    x = c[:len(c)/2]
    y = c[len(c)/2:]
    return zip(x, y)

def area_segments_to_shapely(seglist):
    poly_list = []
    for seg in seglist:
        c = seg.coordinates
        poly = Polygon(coords_to_tuples(seg.coordinates))
        poly.id = seg.id
        poly_list.append(poly)
    return poly_list


def get_overlapping_segments(polygon, bbox, z, project, stack):
    qs1 = AreaSegment.objects.filter(
        project_id = project,
        stack_id = stack,
        z = z,
        type = 0).exclude(
        min_x__gte = bbox[2],
        min_y__gte = bbox[3],
        max_x__lte = bbox[0],
        max_y__lte = bbox[1])
    #seglist = [seg for seg in qs1]
    seglist = qs1.all()
    shapely_polygons = area_segments_to_shapely(seglist)
    ovlp_polygons = [p for p in shapely_polygons if p.intersects(polygon)]
    ids = [p.id for p in ovlp_polygons]
    return ovlp_polygons, ids

def polygon_to_coordinate_lists(polygon):
    ext_list = polygon.exterior.xy[0].tolist() + polygon.exterior.xy[1].tolist()
    int_lists = []
    for interior in polygon.interiors:
        int_lists.append(interior.xy[0].tolist() + interior.xy[1].tolist())
    return ext_list, int_lists

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def push_volume_trace(request, project_id=None, stack_id=None):    
    x = request.POST.getlist('x[]')
    y = request.POST.getlist('y[]')
    r = float(request.POST.get('r'))
    z = float(request.POST.get('z'))
    i = request.POST.get('i')
    instance_id = int(request.POST.get('instance_id'));
    transform_params = request_to_transform_params(request)
    
    s = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, id=project_id)
    ci = get_object_or_404(ClassInstance, id=instance_id)
    
    ''' Calculate the trace polygon '''
    union_polygon = None
    
    if len(x) > 1:            
        xystr = map(list, zip(*[x, y]))    
        xy = [map(float, xx) for xx in xystr]        
        union_polygon = LineString(xy).buffer(r)
    else:
        union_polygon = Point(float(x[0]), float(y[0])).buffer(r)
    
    ''' Trace bounding box '''
    # min_x, min_y, max_x, max_y
    bbox = shapely_polygon_bounds(union_polygon)

    ''' Grab overlapping polygons '''
    overlap_segments, ids = get_overlapping_segments(union_polygon,
        bbox, z, project = p, stack = s)

    if overlap_segments is None or len(overlap_segments) == 0:
        ''' save new polygon '''
        coordinate_list = union_polygon.exterior.xy[0].tolist() + union_polygon.exterior.xy[1].tolist()
        aseg = AreaSegment(
            user=request.user,
            project=p,
            stack = s,
            coordinates = coordinate_list,
            class_instance = ci,
            min_x = bbox[0],
            max_x = bbox[2],
            min_y = bbox[1],
            max_y = bbox[3],
            z = z)
        
        svg_xml = shapely_polygon_to_svg(union_polygon, transform_params)
        
        aseg.save()
        ids = [i]
        dbids = [aseg.id]
        svglist = [svg_xml]        
        
    else:
        overlap_segments.append(union_polygon)
        union_polygon = cascaded_union(overlap_segments)
        
        ''' Update the merged polygon'''
        aseg = AreaSegment.objects.get(id = ids[0])
        aseg.coordinates = union_polygon.exterior.xy[0].tolist() + union_polygon.exterior.xy[1].tolist()
        aseg.save()

        ''' soft-delete the now-unused polygons '''
        for id in ids[1:]:
            delArea = AreaSegment.objects.get(id = id)
            delArea.type = 1 #type == 1 indicates unused segments
            delArea.save()
        
        ''' push empty svg for all ids that are to be deleted '''
        svglist = [shapely_polygon_to_svg(union_polygon, transform_params)]
        svglist += [''] * len(ids)
        ids += [i]
        dbids = ids
    
    return HttpResponse(json.dumps({'i' : ids, 'dbi' : dbids, 'svg' : svglist}))
        
@requires_user_role([UserRole.Annotate, UserRole.Browse])
def all_volume_traces(request, project_id=None, stack_id=None):
    transform_params = request_to_transform_params(request)
    #s = get_object_or_404(Stack, pk=stack_id)
    #p = get_object_or_404(Project, id=project_id)
    z = float(request.POST.get('z'))
    
    
    d_min_x = transform_params['left']
    d_min_y = transform_params['top']
    d_max_x = transform_params['hview'] / transform_params['scale'] + d_min_x
    d_max_y = transform_params['wview'] / transform_params['scale'] + d_min_y
    
    qs1 = AreaSegment.objects.filter(
        project_id = project_id,
        stack_id = stack_id,
        z = z,
        type = 0).exclude(
        min_x__gte = d_max_x,
        min_y__gte = d_max_y,
        max_x__lte = d_min_x,
        max_y__lte = d_min_y)
    
    area_segs = qs1.all()
    
    polygons = area_segments_to_shapely(area_segs)
    
    svg_list = [shapely_polygon_to_svg(polygon, transform_params) for polygon in polygons]
    ids = [aseg.id for aseg in area_segs]

    return HttpResponse(json.dumps({'i' : ids, 'svg' : svg_list}))

def volume_classes(request, project_id=None):
    #print request.GET.get('parentid')
    #print request.GET.get('pid')
    parentId = int(request.GET.get('parentid'))
    projectId = int(request.GET.get('pid'))
    p = get_object_or_404(Project, id=project_id)
    
    if parentId <= -1:
        classes = Class.objects.filter(project = p)
        return HttpResponse(json.dumps(
            tuple({'data' : {'title' : c.class_name},
                   'state' : 'closed',
                   'attr' : {'id': 'class_%d' % c.id,
                             'rel': 'class',
                             'name': c.class_name}} for c in classes.all())))
    c= Class.objects.get(id = parentId)
    instances = ClassInstance.objects.filter(class_column = c)
    return HttpResponse(json.dumps(
        tuple({'data' : {'title' : ci.name},
               'attr' : {'id': 'instance_%d' % ci.id,
               'rel' : 'instance',
               'name' : ci.name}} for ci in instances.all())))
