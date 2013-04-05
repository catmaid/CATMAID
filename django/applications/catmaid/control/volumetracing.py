
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from shapely.geometry import Polygon, LineString, Point
from shapely.ops import cascaded_union

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.common import _create_relation

from PIL import Image, ImageDraw

'''
Volume Tracing database tools.

Authored by Larry Lindsey - llindsey@clm.utexas.edu or larry.f.lindsey@gmail.com

Tentative nomenclature:
A "Volume Trace" consists of a grouped collection of Area Segments, aka Area Traces. Here,
 individual segments are linked by a ClassInstance.

An Area Segment consists of an exterior polygon with an arbitrary number of internal polygons
 representing holes.
 
Geometric operations are performed on a per-ClassInstance basis.


### Of particular interest ###
push_shapely_polygon - pushes a shapely polygon into the database. For a given class instance, this
 assumes that there should be no overlapping polygons. Therefore, this function searches for any
 existing polygons that overlap the one given, and stores the union if any are found.
 
change_polygon - takes a shapely polygon and an AreaSegment, overwriting the AreaSegment's
 information with that contained in the shapely polygon.
 
area_segment_to_shapely - returns a shapely polygon representation of the given AreaSegment
 
close_all_holes - closes all holes in a polygon that encloses the given point in x, y, z

close_hole - closes a hole in a polygon if it (the hole) encloses the given point in x, y, z


See Also: AreaSegment, InnerPolygonPath and ViewProperties in models.py

'''


""" 

Converts a 2 x n array to an svg path string

"""
def path_to_svg(xy):
    
    ctrl_char = 'M'
    svg_str = '';
    
    for v in zip(xy[0], xy[1]):
        svg_str = ' '.join([svg_str, ctrl_char] + map(str, v))
        ctrl_char = 'L'
    svg_str = ' '.join([svg_str, 'Z']);
    
    return svg_str
        
"""

Convenience function to convert stack coordinates to view coordinates

t - translation
w - view width
s - scale
x - array of points to translate

"""
def transform_volume_pts(t, w, s, x):
    return [(s * (y - t) + w/2) for y in x]

"""

Converts a shapely-style point from stack coordinates to view coordinates

p - parameter dict containing keys xtrans, ytrans, wview, hview and scale.
xy - points, as returned for instance by Polygon.exterior.xy

"""
def transform_shapely_xy(p, xy):   
    xtr = transform_volume_pts(p['xtrans'], p['wview'], p['scale'], xy[0])    
    ytr = transform_volume_pts(p['ytrans'], p['hview'], p['scale'], xy[1])
    return [xtr, ytr]

"""

Returns a complete XML-SVG representation of a shapely polygon. The polygon is assumed to store
stack coordinates, while the svg will be returned in view coordinates. The front end may draw the
svg directly to the canvas.

"""
def shapely_polygon_to_svg(polygon, transform_params, vp):
    svg_template = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\
<svg\
	xmlns:svg="http://www.w3.org/2000/svg"\
	xmlns="http://www.w3.org/2000/svg"\
	version="1.1"\
	>\
	<g id="polygon">\
		<path d="{}" fill-rule="evenodd"/>\
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
    all_inners = [coords_to_tuples(coords) for coords in coord_list]
    #valid_inners = [inner for inner in all_inners if Polygon(inner).is_valid]
    return all_inners

def area_segment_to_shapely(seg, ext_only = False):
    ext_coords = coords_to_tuples(seg.coordinates)
    
    if ext_only:
        poly = Polygon(ext_coords)
    else:
        int_coord_list = segment_inner_shapely(seg)
        poly = Polygon(ext_coords, int_coord_list)
    
    poly.id = seg.id
    vp = get_view_properties(seg.class_instance)
    return poly


def get_overlapping_segments(polygon, z, project, stack, instance):
    
    bbox = shapely_ring_bounds(polygon.exterior)
    
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


"""

Creates InnerPolygonPath's representing the interiors of a polygon.

interiors should be as returned by Polygon.interiors

"""
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
        if Polygon(coords_to_tuples(inner_path.coordinates)).is_valid:
            inner_ids.append(inner_path.id)
        else:
            print 'Invalid inner path: ', inner_path.id # Shouldn't ever happen
    return inner_ids

"""

For an array of x and y, and a singleton r, creates a polygon representing a continous path
 left by dragging a circle of radius r through the points x,y .

"""
def trace_polygon(x, y, r):
    if len(x) > 1:            
        xystr = map(list, zip(*[x, y]))    
        xy = [map(float, xx) for xx in xystr]        
        union_polygon = LineString(xy).buffer(r)
    else:
        union_polygon = Point(float(x[0]), float(y[0])).buffer(r)
    return union_polygon

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def erase_volume_trace(request, project_id=None, stack_id = None):
    x = request.POST.getlist('x[]')
    y = request.POST.getlist('y[]')
    r = float(request.POST.get('r'))
    z = float(request.POST.get('z'))
    i = request.POST.get('i')
    instance_id = int(request.POST.get('instance_id'))
    transform_params = request_to_transform_params(request)
    
    s = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, id=project_id)
    ci = get_object_or_404(ClassInstance, id=instance_id)
    
    vp = get_view_properties(ci);
    
    ''' Calculate the trace polygon '''
    polygon = trace_polygon(x, y, r);
    
    ids = erase_shapely_polygon(polygon, z, p, s, ci, request.user)
    
    svglist = [area_segment_to_svg(AreaSegment.objects.get(id = dbid), transform_params) for dbid in ids]
    
    ids += [i]
    dbids = ids
    svglist += ['']
    
    return HttpResponse(json.dumps({'i' : ids, 'dbi' : dbids, 'svg' : svglist,
                                    'instance_id' : instance_id,
                                    'view_props' : {'color' : vp.color, 'opacity' : vp.opacity}}))

"""

Uses a shapely polygon as an erase-mask.

"""
def erase_shapely_polygon(polygon, z, project, stack, instance, user):
    ''' Grab overlapping polygons '''
    overlap_segments, ids = get_overlapping_segments(polygon,
        z, project = project, stack = stack, instance = instance)
    out_ids = ids;
    for dbpoly, dbid in zip(overlap_segments, ids):
        aseg = AreaSegment.objects.get(id = dbid)        
        ''' 
        3 Cases, sort of.
        Case 1: polygon totally encloses dbpoly. dbpoly_diff is a GeometryCollection and
                dbpoly_diff.geoms is an emtpy array
        Case 2: dbpoly/polygon results in a single polygon. dbpoly_diff is a Polygon, which has no
                geoms field.
        Case 3: dbpoly/polygon results in multiple polygons. dbpoly_diff is a MultiPolygon and
                dbpoly_diff is a nonempty array of Polygons.
        '''
        dbpoly_diff = dbpoly.difference(polygon)
        if dbpoly_diff.geom_type == 'Polygon':
            # Case 2 from above. Just change the points in the existing polygon.
            change_polygon(aseg, dbpoly_diff, save=True)
        else:
            npoly = len(dbpoly_diff.geoms)
            if npoly == 0:
                # Case 1 from above. Erase existing polygon
                aseg.type = 1
                aseg.save()
            else:
                # Case 3 from above.
                # Change aseg to the first polygon in dbpoly_diff
                change_polygon(aseg, dbpoly_diff.geoms[0], save=True)
                # Push the rest of the polygons
                for subpoly in dbpoly_diff.geoms[1:]:
                    newseg, id, poly = push_shapely_polygon(subpoly, z, project, stack, instance, user, check_ovlp = False)
                    out_ids.append(newseg.id)
    return out_ids

"""

Sets the representation stored in the AreaSegment aseg to that stored in the shapely Polygon
 polygon.

"""
def change_polygon(aseg, polygon, save=True):
    bbox_ext = shapely_ring_bounds(polygon.exterior)
    interior_ids = create_interior_polygons(polygon.interiors, aseg.z)
    
    ''' Update the merged polygon'''
    old_interior_ids = aseg.inner_paths
    
    aseg.coordinates = ring_to_coordinate_list(polygon.exterior)
    aseg.min_x = bbox_ext[0]
    aseg.max_x = bbox_ext[2]
    aseg.min_y = bbox_ext[1]
    aseg.max_y = bbox_ext[3]
    aseg.inner_paths = interior_ids
    
    if save:
        aseg.save()
    
    ''' delete unused inner paths '''
    for interior_id in old_interior_ids:
        InnerPolygonPath.objects.get(id = interior_id).delete()

"""

Pushes a shapely Polygon into the database as an AreaSegment

"""
def push_shapely_polygon(polygon, z, project, stack, instance, user, check_ovlp = True):    

    if check_ovlp:
        ''' Grab overlapping polygons '''
        overlap_segments, ids = get_overlapping_segments(polygon,
            z, project = project, stack = stack, instance = instance)
    else:
        overlap_segments = None
        ids = []

    if overlap_segments is None or len(overlap_segments) == 0:
        ''' Trace bounding box '''
        # min_x, min_y, max_x, max_y
        bbox_ext = shapely_ring_bounds(polygon.exterior)
        ''' save new polygon '''
        ext_coords = ring_to_coordinate_list(polygon.exterior)
        
        interior_ids = create_interior_polygons(polygon.interiors, z)
        
        aseg = AreaSegment(
            user = user,
            project = project,
            stack = stack,
            coordinates = ext_coords,
            class_instance = instance,
            min_x = bbox_ext[0],
            max_x = bbox_ext[2],
            min_y = bbox_ext[1],
            max_y = bbox_ext[3],
            inner_paths = interior_ids,
            z = z)
        
        aseg.save()
        
    else:
        for seg in overlap_segments:
            polygon = polygon.union(seg)
        #bbox_ext = shapely_ring_bounds(polygon.exterior)
        #interior_ids = create_interior_polygons(polygon.interiors, z)
        
        ''' Update the merged polygon'''
        aseg = AreaSegment.objects.get(id = ids[0])
        change_polygon(aseg, polygon)
        
        ''' soft-delete the now-unused polygons '''
        for id in ids[1:]:
            delArea = AreaSegment.objects.get(id = id)
            delArea.type = 1 #type == 1 indicates unused segments
            delArea.save()
        
    return aseg, ids, polygon

def close_all_holes(x, y, z, stack, project, class_instance):    
    qs1 = AreaSegment.objects.filter(
        project_id = project,
        stack_id = stack,
        z = z,
        class_instance = class_instance,
        type = 0).exclude(
        min_x__gte = int(round(x)),
        min_y__gte = int(round(y)),
        max_x__lte = int(round(x)),
        max_y__lte = int(round(y)))
    pt = Point((x, y))
    asegs = qs1.all()
    shapely_polygons = [area_segment_to_shapely(seg, ext_only=True) for seg in asegs]
    ovlp_polygons_seg_zip = [(p, seg) for (p, seg) in zip(shapely_polygons, asegs) if p.contains(pt)]
    
    for polygon, seg in ovlp_polygons_seg_zip:
        # somewhat easier than deleting each inner trace one at a time.
        change_polygon(seg, polygon)
    
    return zip(*ovlp_polygons_seg_zip)

def close_hole(x, y, z, stack, project, class_instance):
    qs1 = AreaSegment.objects.filter(
        project_id = project,
        stack_id = stack,
        z = z,
        class_instance = class_instance,
        type = 0).exclude(
        min_x__gte = int(round(x)),
        min_y__gte = int(round(y)),
        max_x__lte = int(round(x)),
        max_y__lte = int(round(y)))
    pt = Point((x, y))
    asegs = qs1.all()
    shapely_polygons = [area_segment_to_shapely(seg, ext_only=True) for seg in asegs]
    ovlp_polygons_seg_zip = [(p, seg) for (p, seg) in zip(shapely_polygons, asegs) if p.contains(pt)]
    
    ovlp_polygons_ext, ovlp_segs = zip(*ovlp_polygons_seg_zip)
    ovlp_polygons = []
    
    for seg in ovlp_segs:
        inner_paths = seg.inner_paths
        for interior_id in seg.inner_paths:
            path = InnerPolygonPath.objects.get(id = interior_id)
            inner_poly = Polygon(coords_to_tuples(path.coordinates))
            if inner_poly.contains(pt):
                inner_paths.remove(interior_id)
                path.delete()
        seg.inner_paths = inner_paths
        seg.save()
        ovlp_polygons.append(area_segment_to_shapely(seg))
    
    return ovlp_polygons, ovlp_segs


@requires_user_role([UserRole.Annotate, UserRole.Browse])
def close_all_holes_in_trace(request, project_id=None, stack_id=None):
    x = float(request.POST.get('x'))
    y = float(request.POST.get('y'))
    z = float(request.POST.get('z'))
    instance_id = int(request.POST.get('instance_id'))
    transform_params = request_to_transform_params(request)
    
    s = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, id=project_id)
    ci = get_object_or_404(ClassInstance, id=instance_id)    
    
    polygons, segs = close_all_holes(x, y, z, s, p, ci)
    
    vp = get_view_properties(ci)
    
    svg = [shapely_polygon_to_svg(poly, transform_params, vp) for poly in polygons]
    id = [aseg.id for aseg in segs]
    dbid = id
    view_prop = {'color': vp.color, 'opacity': vp.opacity}
    tid = ci.id
    return HttpResponse(json.dumps({'i' : id, 'dbi' : dbid, 'svg' : svg,
                                    'instance_id' : tid,
                                    'view_props' : view_prop}))
    

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def close_hole_in_trace(request, project_id=None, stack_id=None):
    x = float(request.POST.get('x'))
    y = float(request.POST.get('y'))
    z = float(request.POST.get('z'))
    instance_id = int(request.POST.get('instance_id'))
    transform_params = request_to_transform_params(request)
    
    s = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, id=project_id)
    ci = get_object_or_404(ClassInstance, id=instance_id)
    
    polygons, segs = close_hole(x, y, z, s, p, ci)
    
    vp = get_view_properties(ci)
    
    svg = [shapely_polygon_to_svg(poly, transform_params, vp) for poly in polygons]
    id = [aseg.id for aseg in segs]
    dbid = id
    view_prop = {'color': vp.color, 'opacity': vp.opacity}
    tid = ci.id
    return HttpResponse(json.dumps({'i' : id, 'dbi' : dbid, 'svg' : svg,
                                    'instance_id' : tid,
                                    'view_props' : view_prop}))
        

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def push_volume_trace(request, project_id=None, stack_id=None):    
    x = request.POST.getlist('x[]')
    y = request.POST.getlist('y[]')
    r = float(request.POST.get('r'))
    z = float(request.POST.get('z'))
    i = request.POST.get('i')
    instance_id = int(request.POST.get('instance_id'))
    transform_params = request_to_transform_params(request)
    
    s = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, id=project_id)
    ci = get_object_or_404(ClassInstance, id=instance_id)
        
    polygon = trace_polygon(x, y, r)
    
    aseg, ovlp_ids, union_polygon = push_shapely_polygon(polygon, z, p, s, ci, request.user)
    
    vp = get_view_properties(ci)
    
    ids = ovlp_ids
    ids += [i]
    
    dbids = ovlp_ids
    dbids = [aseg.id]
    
    svglist = [shapely_polygon_to_svg(union_polygon, transform_params, vp)]
    svglist += [''] * len(ovlp_ids)
    
    return HttpResponse(json.dumps({'i' : ids, 'dbi' : dbids, 'svg' : svglist,
                                    'instance_id' : instance_id,
                                    'view_props' : {'color' : vp.color, 'opacity' : vp.opacity}}))

def area_segment_to_svg(seg, transform_params):
    if seg.type == 0:
        polygon = area_segment_to_shapely(seg)
        vp = get_view_properties(seg.class_instance)
        return shapely_polygon_to_svg(polygon, transform_params, vp)
    else:
        return ''
   
@requires_user_role([UserRole.Browse])
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
    vps = []
    
    for seg in area_segs:
        polygon = area_segment_to_shapely(seg)
        vp = get_view_properties(seg.class_instance)
        svg_list.append(area_segment_to_svg(seg, transform_params))
        vps.append(vp)    
    
    ids = [seg.id for seg in area_segs]
    tids = [seg.class_instance.id for seg in area_segs]    

    return HttpResponse(json.dumps({'i' : ids,
                                    'svg' : svg_list,
                                    'vp' : [{'opacity' : vp.opacity,
                                             'color' : vp.color} for vp in vps],
                                    'tid' : tids}))

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

def HTMLColorToRGB(colorstring):
    """ convert #RRGGBB to an (R, G, B) tuple """
    """ lifted entirely from
        http://code.activestate.com/recipes/266466-html-colors-tofrom-rgb-tuples/"""
    colorstring = colorstring.strip()
    if colorstring[0] == '#': colorstring = colorstring[1:]
    if len(colorstring) != 6:
        raise ValueError, "input #%s is not in #RRGGBB format" % colorstring
    r, g, b = colorstring[:2], colorstring[2:4], colorstring[4:]
    r, g, b = [int(n, 16) for n in (r, g, b)]
    return (r, g, b)

"""

Generates an HttpResponse containing an 18x18 pixel PNG with a transparent background and a small
 circle colored as given by the ViewProperty associated with the given instance_id. This is used
 for the instance icons in the JSTree.

"""
def instance_png(request, project_id=None, instance_id=None):
    vp = get_view_properties(ClassInstance.objects.get(id = instance_id))
    im = Image.new("RGBA" , (18,18))
    draw = ImageDraw.Draw(im)
    draw.ellipse((5,5,12,12), HTMLColorToRGB(vp.color))
    response = HttpResponse(mimetype="image/png")
    im.save(response, 'png')
    return response
    

def volume_classes(request, project_id=None):
    parentId = int(request.GET.get('parentid'))
    projectId = int(request.GET.get('pid'))
    p = get_object_or_404(Project, id=project_id)
    
    if parentId <= -1:
        #classes = Class.objects.filter(project = p)
        class_classes = ClassClass.objects.filter(class_b__class_name = 'traceable_root',
                                  relation__relation_name = 'is_a')
        return HttpResponse(json.dumps(
            tuple({'data' : {'title' : '<IMG SRC="static/widgets/themes/kde/jsTree/volumesegment/class.png">' + c.class_name},
                   'state' : 'closed',
                   'attr' : {'id': 'class_%d' % c.id,
                             'rel': 'class',
                             'name': c.class_name}} \
            for c in [cc.class_a for cc in class_classes])))
    
    c = Class.objects.get(id = parentId)
    instances = ClassInstance.objects.filter(class_column = c)
    pngsrc = 'http://catmaidv/catmaid/{}/volumetrace/{}/instance.png'
    
    return HttpResponse(json.dumps(
        tuple({'data' : {'title' : '<img src="' + pngsrc.format(projectId, ci.id) + '"\>' + ci.name},
               'attr' : {'id': 'instance_%d' % ci.id,
                         'rel' : 'instance',
                         'name' : ci.name,
                         'color' : get_view_properties(ci).color,
                         'opacity' : get_view_properties(ci).opacity}} \
                               for ci in instances.all())))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def create_new_trace(request, project_id=None):
    parent_class_name = request.POST.get('parent')
    new_trace_name = request.POST.get('trace_name')
    p = get_object_or_404(Project, id=project_id)
    c = get_object_or_404(Class, class_name=parent_class_name)
    ci = ClassInstance(user = request.user,
                       project = p,
                       class_column = c,
                       name = new_trace_name)
    ci.save()
    return HttpResponse(json.dumps({'message' : 'ok'}))
                       
