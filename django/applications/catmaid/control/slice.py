from django.http import HttpResponse
from django.shortcuts import get_object_or_404

import json

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

    return HttpResponse(json.dumps(list(slices)), mimetype="text/json")

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

    slices = Slices.objects.filter(
        stack = stack,
        project = p,
        center_x__lt = x + 20,
        center_x__gt = x - 20,
        center_y__lt = y + 20,
        center_y__gt = y - 20,
        sectionindex = z).all().values('assembly_id', 'sectionindex', 'slice_id',
        'node_id', 'min_x', 'min_y', 'max_x', 'max_y', 'center_x',
        'center_y', 'threshold', 'size', 'status').order_by('threshold')

    return HttpResponse(json.dumps(list(slices)), mimetype="text/json")

def segments_for_slice(request, project_id=None, stack_id=None):
    
    sliceid = int(request.GET.get('sliceid', '0'))
    sectionindex = int(request.GET.get('sectionindex', '0'))
    
    # which directionality?

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    segments = Segments.objects.filter(
        stack = stack,
        project = p,
        origin_slice_id = sliceid,
        origin_section = sectionindex
    ).all().values('segmentid','segmenttype','origin_section','origin_slice_id','target1_section',
    'target1_slice_id','target2_section','target2_slice_id','cost','direction','center_distance','set_difference').order_by('cost')

    return HttpResponse(json.dumps(list(segments)), mimetype="text/json")


def retrieve_components_for_location(project_id, stack_id, x, y, z, limit=10):
    componentIds = {}
    fpath = os.path.join( settings.HDF5_STORAGE_PATH, '{0}_{1}_componenttree.hdf'.format( project_id, stack_id ) )
    with closing(h5py.File(fpath, 'r')) as hfile:

        image_data = hfile['connected_components/'+z+'/pixel_list_ids']
        componentMinX = hfile['connected_components/'+z+'/min_x']
        componentMinY = hfile['connected_components/'+z+'/min_y']
        componentMaxX = hfile['connected_components/'+z+'/max_x']
        componentMaxY = hfile['connected_components/'+z+'/max_y']
        thresholdTable = hfile['connected_components/'+z+'/values']

        length=image_data.len()

        print >> sys.stderr, "extract components ...."
        start = time.time()

        #Merge all data into single array
        #TODO:ID instead of length
        merge=np.dstack((np.arange(length),componentMinX.value,componentMinY.value,componentMaxX.value,componentMaxY.value,thresholdTable.value))
        # FIXME: use np.where instead of merging into a new array
        selectionMinXMaxXMinYMaxY=None

        selectionMinX = merge[merge[...,1]<=x]
        if len(selectionMinX):
            selectionMinXMaxX = selectionMinX[selectionMinX[...,3]>=x]
            if len(selectionMinXMaxX):
                selectionMinXMaxXMinY = selectionMinXMaxX[selectionMinXMaxX[...,2]<=y]
                if len(selectionMinXMaxXMinY):
                    selectionMinXMaxXMinYMaxY = selectionMinXMaxXMinY[selectionMinXMaxXMinY[...,4]>=y]

        delta = time.time() - start
        print >> sys.stderr, "took", delta

        print >> sys.stderr, "create components ...."
        start = time.time()

        if selectionMinXMaxXMinYMaxY is not None:

            idx = np.argsort(selectionMinXMaxXMinYMaxY[:,5])
            limit_counter = 0
            for i in idx:
                if limit_counter >= limit:
                    break
                row = selectionMinXMaxXMinYMaxY[i,:]
                componentPixelStart=hfile['connected_components/'+z+'/begin_indices'].value[row[0]].copy()
                componentPixelEnd=hfile['connected_components/'+z+'/end_indices'].value[row[0]].copy()
                data=hfile['connected_components/'+z+'/pixel_list_0'].value[componentPixelStart:componentPixelEnd].copy()

                # check containment of the pixel in the component
                if not len(np.where((data['x'] == x) & (data['y'] == y))[0]):
                    continue

                componentIds[int(row[0])]={
                    'minX': int(row[1]),
                    'minY': int(row[2]),
                    'maxX': int(row[3]),
                    'maxY': int(row[4]),
                    'threshold': row[5]
                }
                limit_counter += 1

        delta = time.time() - start
        print >> sys.stderr, "took", delta

    return componentIds
