from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.simplejson.encoder import JSONEncoder

import json
import numpy as np

from catmaid.models import *
from catmaid.objects import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.transaction import *

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
        'center_y', 'threshold', 'size', 'status')

    return HttpResponse(JSONEncoder().encode(list(slices)), mimetype="text/json")

def slices_cog(request, project_id=None, stack_id=None):
    """ Return all slice centers """

    z = str(request.GET.get('z', '0'))

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    slices = Slices.objects.filter(
        stack = stack,
        project = p,
        sectionindex = z).all().values('assembly_id', 'sectionindex', 'slice_id',
        'node_id', 'center_x', 'center_y', 'threshold', 'size')

    return HttpResponse(JSONEncoder().encode(list(slices)), mimetype="text/json")


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

    slices = Slices.objects.filter(
        stack = stack,
        project = p,
        center_x__lt = x + size,
        center_x__gt = x - size,
        center_y__lt = y + size,
        center_y__gt = y - size,
        sectionindex = z).all().values('assembly_id', 'sectionindex', 'slice_id',
        'node_id', 'min_x', 'min_y', 'max_x', 'max_y', 'center_x',
        'center_y', 'threshold', 'size', 'status').order_by('threshold')

    # compute the shortest distance from the mouse pointer to the slice center of gravity
    def dist(xx):
        return np.linalg.norm(np.array([xx['center_x'], xx['center_y']]) - np.array([x,y]) )
    slices = list(slices)
    slices.sort(key=dist, reverse=True)

    return HttpResponse(JSONEncoder().encode(list(slices)), mimetype="text/json")

def segments_for_slice(request, project_id=None, stack_id=None):
    
    sliceid = int(request.GET.get('sliceid', '0'))
    sectionindex = int(request.GET.get('sectionindex', '0'))
    
    # which directionality?

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # TODO: optimize with one query!

    segments_right = Segments.objects.filter(
        stack = stack,
        project = p,
        origin_slice_id = sliceid,
        origin_section = sectionindex,
        segmenttype__gt = 1,
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