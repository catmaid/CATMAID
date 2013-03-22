
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
    
def shapely_polygon_to_svg(polygon, transform_params, vp):
    svg_template = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\
<svg\
	xmlns:svg="http://www.w3.org/2000/svg"\
	xmlns="http://www.w3.org/2000/svg"\
	version="1.1"\
	>\
	<g id="polygon">\
		<path d="{}" fill-rule="evenodd" fill="{}" />\
	</g>\
</svg>'
    exy = polygon.exterior.xy;
    exy = transform_shapely_xy(transform_params, exy)
    svg_str = path_to_svg(exy)
    for interior in polygon.interiors:
        ixy = interior.xy
        ixy = transform_shapely_xy(transform_params, ixy)
        svg_str = ' '.join([svg_str, path_to_svg(ixy)])
    return svg_template.format(svg_str, vp.color)

def request_to_transform_params(request):
    param_names = ['xtrans', 'ytrans', 'hview', 'wview', 'scale', 'top', 'left'] 
    transform_params = dict()
    for param in param_names:        
        transform_params[param] = float(request.POST.get(param))
    return transform_params
        
def shapely_ring_bounds(ring):
    xy = ring.xy
    min_x = min(xy[0])
    min_y = min(xy[1])
    max_x = max(xy[0])
    max_y = max(xy[1])
    return [min_x, min_y, max_x, max_y]

def coords_to_tuples(c):
    x = c[:len(c)/2]
    y = c[len(c)/2:]
    return zip(x, y)

def segment_inner_shapely(seg):
    coord_list = [InnerPolygonPath.objects.get(id=ii).coordinates
        for ii in seg.inner_paths]
    return [coords_to_tuples(coords) for coords in coord_list]

def area_segment_to_shapely(seg):
    ext_coords = coords_to_tuples(seg.coordinates)
    int_coord_list = segment_inner_shapely(seg)
    poly = Polygon(ext_coords, int_coord_list)
    poly.id = seg.id
    vp = get_view_properties(seg.class_instance)
    #poly.color = vp.color
    return poly


def get_overlapping_segments(polygon, bbox, z, project, stack, instance):
    qs1 = AreaSegment.objects.filter(
        project_id = project,
        stack_id = stack,
        z = z,
        class_instance = instance,
        type = 0).exclude(
        min_x__gte = bbox[2],
        min_y__gte = bbox[3],
        max_x__lte = bbox[0],
        max_y__lte = bbox[1])
    #seglist = [seg for seg in qs1]
    seglist = qs1.all()
    shapely_polygons = [area_segment_to_shapely(seg) for seg in seglist]
    ovlp_polygons = [p for p in shapely_polygons if p.intersects(polygon)]
    ids = [p.id for p in ovlp_polygons]
    return ovlp_polygons, ids

def ring_to_coordinate_list(ring):
    return ring.xy[0].tolist() + ring.xy[1].tolist()

def create_interior_polygons(interiors, z):
    inner_ids = []
    for interior in interiors:
        bbox_int = shapely_ring_bounds(interior)
        inner_path = InnerPolygonPath(coordinates = ring_to_coordinate_list(interior),
                                      z = z,
                                      min_x = bbox_int[0],
                                      max_x = bbox_int[2],
                                      min_y = bbox_int[1],
                                      max_y = bbox_int[3])
        inner_path.save()
        inner_ids.append(inner_path.id)
    return inner_ids
        

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
    bbox_ext = shapely_ring_bounds(union_polygon.exterior)

    ''' Grab overlapping polygons '''
    overlap_segments, ids = get_overlapping_segments(union_polygon,
        bbox_ext, z, project = p, stack = s, instance = ci)

    if overlap_segments is None or len(overlap_segments) == 0:
        ''' save new polygon '''
        ext_coords = ring_to_coordinate_list(union_polygon.exterior)
        
        interior_ids = create_interior_polygons(union_polygon.interiors, z)
        
        aseg = AreaSegment(
            user=request.user,
            project=p,
            stack = s,
            coordinates = ext_coords,
            class_instance = ci,
            min_x = bbox_ext[0],
            max_x = bbox_ext[2],
            min_y = bbox_ext[1],
            max_y = bbox_ext[3],
            inner_paths = interior_ids,
            z = z)
        
        vp = get_view_properties(aseg.class_instance)
        svg_xml = shapely_polygon_to_svg(union_polygon, transform_params, vp)
        
        aseg.save()
        ids = [i]
        dbids = [aseg.id]
        svglist = [svg_xml]        
        
    else:
        #if hasattr(union_polygon, 'color'):
        #    colorstr = union_polygon.color
        #else:
        #    colorstr = '#0000ff'
        overlap_segments.append(union_polygon)
        print overlap_segments
        union_polygon = cascaded_union(overlap_segments)
        #union_polygon.color = colorstr
        bbox_ext = shapely_ring_bounds(union_polygon.exterior)
        interior_ids = create_interior_polygons(union_polygon.interiors, z)
        
        ''' Update the merged polygon'''
        aseg = AreaSegment.objects.get(id = ids[0])
        old_interior_ids = aseg.inner_paths
        
        aseg.coordinates = ring_to_coordinate_list(union_polygon.exterior)
        aseg.min_x = bbox_ext[0]
        aseg.max_x = bbox_ext[2]
        aseg.min_y = bbox_ext[1]
        aseg.max_y = bbox_ext[3]
        aseg.inner_paths = interior_ids
        aseg.save()
        
        ''' soft-delete the now-unused polygons '''
        for id in ids[1:]:
            delArea = AreaSegment.objects.get(id = id)
            #old_interior_ids += delArea.inner_paths
            delArea.type = 1 #type == 1 indicates unused segments
            delArea.save()

        ''' delete unused inner paths '''
        for interior_id in old_interior_ids:
            InnerPolygonPath.objects.get(id = interior_id).delete()
        
        ''' push empty svg for all ids that are to be deleted '''
        vp = get_view_properties(aseg.class_instance)
        svglist = [shapely_polygon_to_svg(union_polygon, transform_params, vp)]
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
    
    svg_list = []
    for seg in area_segs:
        polygon = area_segment_to_shapely(seg)
        vp = get_view_properties(seg.class_instance)
        svg_list.append(shapely_polygon_to_svg(polygon, transform_params, vp))
    
    ids = [aseg.id for aseg in area_segs]

    return HttpResponse(json.dumps({'i' : ids, 'svg' : svg_list}))

def get_view_properties(class_instance):
    try:
        vp = ViewProperties.objects.get(class_instance = class_instance)
    except ViewProperties.DoesNotExist:
        vp = ViewProperties(class_instance = class_instance)
        vp.save()
    return vp

def trace_properties(request, project_id=None):
    instance_id = int(request.POST.get('trace_id'));
    ci = get_object_or_404(ClassInstance, id=instance_id);
    vp = get_view_properties(ci)
    return HttpResponse(json.dumps({'color' : vp.color, 'opacity' : vp.opacity}))

def set_trace_properties(request, project_id=None):
    instance_id = int(request.POST.get('trace_id'))
    color = request.POST.get('color')
    opacity = float(request.POST.get('opacity'))
    
    print 'setting color of instance ', instance_id, ' to ', color
    
    ci = get_object_or_404(ClassInstance, id=instance_id);
    vp = None
    try:
        vp = ViewProperties.objects.get(class_instance = ci)
    except ViewProperties.DoesNotExist:
        vp = ViewProperties()
    vp.color = color;
    vp.opacity = opacity;
    vp.save();
    return HttpResponse(json.dumps({'message' : 'ok' }))
    

def volume_classes(request, project_id=None):
    #print request.GET.get('parentid')
    #print request.GET.get('pid')
    parentId = int(request.GET.get('parentid'))
    projectId = int(request.GET.get('pid'))
    p = get_object_or_404(Project, id=project_id)
    
    if parentId <= -1:
        #classes = Class.objects.filter(project = p)
        class_classes = ClassClass.objects.filter(class_b__class_name = 'traceable_root',
                                  relation__relation_name = 'is_a')
        return HttpResponse(json.dumps(
            tuple({'data' : {'title' : c.class_name},
                   'state' : 'closed',
                   'attr' : {'id': 'class_%d' % c.id,
                             'rel': 'class',
                             'name': c.class_name}} \
            for c in [cc.class_a for cc in class_classes])))
    c= Class.objects.get(id = parentId)
    instances = ClassInstance.objects.filter(class_column = c)
    return HttpResponse(json.dumps(
        tuple({'data' : {'title' : ci.name},
               'attr' : {'id': 'instance_%d' % ci.id,
               'rel' : 'instance',
               'name' : ci.name}} for ci in instances.all())))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def create_new_trace(request, project_id=None):
    print 'called create new trace'
    parent_class_name = request.POST.get('parent')
    new_trace_name = request.POST.get('trace_name')
    p = get_object_or_404(Project, id=project_id)
    c = get_object_or_404(Class, class_name=parent_class_name)
    ci = ClassInstance(user = request.user,
                       project = p,
                       class_column = c,
                       name = new_trace_name)
    print 'Creating new ', parent_class_name, ' with name ', new_trace_name
    ci.save()
    return HttpResponse(json.dumps({'message' : 'ok'}))
                       
