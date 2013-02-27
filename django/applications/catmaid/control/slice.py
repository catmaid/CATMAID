from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.simplejson.encoder import JSONEncoder

import os.path
import json
import numpy as np

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

try:
    from PIL import Image
except:
    pass

def get_slices_tiles(request, project_id=None, stack_id=None):
    height = int(request.GET.get('height', '0'))
    width = int(request.GET.get('width', '0'))
    x = int(request.GET.get('x', '0'))
    y = int(request.GET.get('y', '0'))
    sectionindex = int(request.GET.get('sectionindex', '0'))

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)
    
    slices = Slices.objects.filter(
        stack = stack,
        project = p,
        sectionindex = sectionindex,
        center_x__lt = x + width,
        center_x__gt = x,
        center_y__lt = y + height,
        center_y__gt = y,
        assembly__isnull = False
        ).all().values('assembly_id', 'sectionindex', 'slice_id',
        'node_id', 'min_x', 'min_y', 'max_x', 'max_y', 'center_x',
        'center_y', 'threshold', 'size', 'status')
    # sliceinfo = StackSliceInfo.objects.get(stack=stack)
    data = np.zeros( (height, width), dtype = np.uint8 )
    for slice in slices:
        # print >> sys.stderr, 'slice', slice['slice_id']
        data[slice['min_y']-y:slice['max_y']-y, slice['min_x']-x:slice['max_x']-x] = 255
        #pic = Image.open(os.path.join(sliceinfo.slice_base_path, '0', '1.png'))
        #arr = np.array( pic.getdata() ).reshape(pic.size[0], pic.size[1], 2)

    pilImage = Image.frombuffer('RGBA',(width,height),data,'raw','L',0,1)
    response = HttpResponse(mimetype="image/png")
    pilImage.save(response, "PNG")
    return response


@requires_user_role([UserRole.Annotate, UserRole.Browse])
@report_error
def slice_count(request, project_id=None, assembly_id=None):
    p = get_object_or_404(Project, pk=project_id)
    return HttpResponse(json.dumps({
        'count': Slices.objects.filter(assembly_id=assembly_id).count(),
        'assembly_id': assembly_id}), mimetype='text/json')

def get_slice(request, project_id=None, stack_id=None):
    """ Return slice information for one particular slice
    """
    sectionindex = int(request.GET.get('sectionindex', '0'))
    sliceid = int(request.GET.get('sliceid', '0'))

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    slices = Slices.objects.filter(
        stack = stack,
        project = p,
        sectionindex = sectionindex,
        slice_id = sliceid).all().values('assembly_id', 'sectionindex', 'slice_id',
        'node_id', 'min_x', 'min_y', 'max_x', 'max_y', 'center_x',
        'center_y', 'threshold', 'size', 'status', 'flag_left', 'flag_right')

    return HttpResponse(JSONEncoder().encode(list(slices)), mimetype="text/json")

def slices_cog(request, project_id=None, stack_id=None):
    """ Return all slice centers """
    height = int(request.GET.get('height', '0'))
    width = int(request.GET.get('width', '0'))
    x = int(request.GET.get('x', '0'))
    y = int(request.GET.get('y', '0'))
    z = str(request.GET.get('z', '0'))

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    slices = Slices.objects.filter(
        stack = stack,
        project = p,
        center_x__lt = x + width,
        center_x__gt = x,
        center_y__lt = y + height,
        center_y__gt = y,
        sectionindex = z).all().values('assembly_id', 'sectionindex', 'slice_id',
        'node_id', 'center_x', 'center_y', 'threshold', 'size')

    return HttpResponse(JSONEncoder().encode(list(slices)), mimetype="text/json")

def delete_slice_from_assembly(request, project_id=None, stack_id=None):
    """ Delete slice from assembly """

    sectionindex = int(request.GET.get('sectionindex', '0'))
    sliceid = int(request.GET.get('sliceid', '0'))
    assemblyid = int(request.GET.get('assemblyid', '0'))

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    if assemblyid == 0:
        assemblyid_update = None
    else:
        assemblyid_update = assemblyid

    slices = Slices.objects.filter(
        stack = stack,
        project = p,
        sectionindex = sectionindex,
        slice_id = sliceid)

    for slice in slices:
        if slice.assembly is None:
            continue
        if slice.assembly.id == assemblyid_update:
            # only reset if it has the same
            slice.assembly = None
            slice.save()
        else:
            return HttpResponse(JSONEncoder().encode({'message': "Did not delete slice " + str(sliceid) +
                " in section " + str(sectionindex) + " because assembly IDs are not equal: " + str(assemblyid_update) }), mimetype="text/json")


    return HttpResponse(JSONEncoder().encode({'message': "Successfully deleted slice " + str(sliceid) +
        " in section " + str(sectionindex) + " with assembly id " + str(assemblyid_update) }), mimetype="text/json")


def slices_at_location(request, project_id=None, stack_id=None):
    """ Takes a stack location and returns slices at this location
    """
    x = int(request.GET.get('x', '0'))
    y = int(request.GET.get('y', '0'))
    z = str(request.GET.get('z', '0'))

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # fetch all the components for the given skeleton and z section
    #slices = Slices.objects.filter(
    #    stack = stack,
    #    project = p,
    #    min_x__lt = x,
    #   max_x__gt = x,
    #    min_y__lt = y,
    #    max_y__gt = y,
    #    sectionindex = z).all().values('assembly_id', 'sectionindex', 'slice_id',
    #    'node_id', 'min_x', 'min_y', 'max_x', 'max_y', 'center_x',
    #    'center_y', 'threshold', 'size', 'status').order_by('size')

    size = 20

    # TODO: filter based on status flag

    slices = Slices.objects.filter(
        stack = stack,
        project = p,
        center_x__lt = x + size,
        center_x__gt = x - size,
        center_y__lt = y + size,
        center_y__gt = y - size,
        sectionindex = z).all().values('assembly_id', 'sectionindex', 'slice_id',
        'node_id', 'min_x', 'min_y', 'max_x', 'max_y', 'center_x',
        'center_y', 'threshold', 'size', 'status', 'flag_left', 'flag_right').order_by('threshold')

    # compute the shortest distance from the mouse pointer to the slice center of gravity
    #def dist(xx):
    #    return np.linalg.norm(np.array([xx['center_x'], xx['center_y']]) - np.array([x,y]) )
    #slices = list(slices)
    #slices.sort(key=dist, reverse=True)

    return HttpResponse(JSONEncoder().encode(list(slices)), mimetype="text/json")

def segments_for_slice_right(request, project_id=None, stack_id=None):
    
    sliceid = int(request.GET.get('sliceid', '0'))
    sectionindex = int(request.GET.get('sectionindex', '0'))

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # TODO: filter based on status flag
    segments_right = Segments.objects.filter(
        stack = stack,
        project = p,
        origin_slice_id = sliceid,
        origin_section = sectionindex,
        segmenttype__gt = 1,
        direction = True,
        cost__lt = 100
    ).all().values('segmentid','segmenttype','origin_section','origin_slice_id','target_section',
    'target1_slice_id','target2_slice_id','direction',
    'center_distance','set_difference','cost','set_difference','set_difference_ratio',
    'aligned_set_difference','aligned_set_difference_ratio',
    'size','overlap','overlap_ratio','aligned_overlap','aligned_overlap_ratio',
    'average_slice_distance', 'max_slice_distance',
    'aligned_average_slice_distance', 'aligned_max_slice_distance',
    'histogram_0', 'histogram_1', 'histogram_2', 'histogram_3', 'histogram_4', 'histogram_5',
    'histogram_6', 'histogram_7', 'histogram_8', 'histogram_9', 'normalized_histogram_0',
    'normalized_histogram_1', 'normalized_histogram_2', 'normalized_histogram_3', 'normalized_histogram_4', 'normalized_histogram_5',
    'normalized_histogram_6', 'normalized_histogram_7', 'normalized_histogram_8', 'normalized_histogram_9').order_by('cost')

    return HttpResponse(JSONEncoder().encode(list(segments_right)), mimetype="text/json")

def segments_for_slice_left(request, project_id=None, stack_id=None):
    
    sliceid = int(request.GET.get('sliceid', '0'))
    sectionindex = int(request.GET.get('sectionindex', '0'))
    
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # TODO: filter based on status flag
    segments_left = Segments.objects.filter(
        stack = stack,
        project = p,
        target1_slice_id = sliceid,
        target_section = sectionindex,
        segmenttype = 2,
        direction = True,
        cost__lt = 100
    ).all().values('segmentid','segmenttype','origin_section','origin_slice_id','target_section',
    'target1_slice_id','target2_slice_id','direction',
    'center_distance','set_difference','cost','set_difference','set_difference_ratio',
    'aligned_set_difference','aligned_set_difference_ratio',
    'size','overlap','overlap_ratio','aligned_overlap','aligned_overlap_ratio',
    'average_slice_distance', 'max_slice_distance',
    'aligned_average_slice_distance', 'aligned_max_slice_distance',
    'histogram_0', 'histogram_1', 'histogram_2', 'histogram_3', 'histogram_4', 'histogram_5',
    'histogram_6', 'histogram_7', 'histogram_8', 'histogram_9', 'normalized_histogram_0',
    'normalized_histogram_1', 'normalized_histogram_2', 'normalized_histogram_3', 'normalized_histogram_4', 'normalized_histogram_5',
    'normalized_histogram_6', 'normalized_histogram_7', 'normalized_histogram_8', 'normalized_histogram_9').order_by('cost')

    segments_left_branch = Segments.objects.filter(
        stack = stack,
        project = p,
        origin_slice_id = sliceid,
        origin_section = sectionindex,
        segmenttype = 3,
        direction = False,
        cost__lt = 100
    ).all().values('segmentid','segmenttype','origin_section','origin_slice_id','target_section',
    'target1_slice_id','target2_slice_id','direction',
    'center_distance','set_difference','cost','set_difference','set_difference_ratio',
    'aligned_set_difference','aligned_set_difference_ratio',
    'size','overlap','overlap_ratio','aligned_overlap','aligned_overlap_ratio',
    'average_slice_distance', 'max_slice_distance',
    'aligned_average_slice_distance', 'aligned_max_slice_distance',
    'histogram_0', 'histogram_1', 'histogram_2', 'histogram_3', 'histogram_4', 'histogram_5',
    'histogram_6', 'histogram_7', 'histogram_8', 'histogram_9', 'normalized_histogram_0',
    'normalized_histogram_1', 'normalized_histogram_2', 'normalized_histogram_3', 'normalized_histogram_4', 'normalized_histogram_5',
    'normalized_histogram_6', 'normalized_histogram_7', 'normalized_histogram_8', 'normalized_histogram_9').order_by('cost')

    return HttpResponse(JSONEncoder().encode(list(segments_left)+list(segments_left_branch)), mimetype="text/json")

def slice_contour(request, project_id=None, stack_id=None):
    
    node_id = str(request.GET.get('nodeid', '0'))
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    cnt = SliceContours.objects.filter(
        stack = stack,
        project = p,
        node_id = node_id
        )

    return HttpResponse(json.dumps([c.coordinates for c in cnt]), mimetype="text/json")

def slice_contour_highres(request, project_id=None, stack_id=None):
    
    node_id = str(request.GET.get('nodeid', '0'))
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    cnt = SliceContoursHighres.objects.filter(
        stack = stack,
        project = p,
        node_id = node_id
        )

    return HttpResponse(json.dumps([c.coordinates for c in cnt]), mimetype="text/json")