from django.http import HttpResponse

from catmaid.models import *
from catmaid.control.authentication import *
from catmaid.control.common import *
from catmaid.control.stack import get_stack_info
from django.shortcuts import get_object_or_404

import numpy as np

DrawingTypesColormap = {
    'mitochondria' : np.array([50,50,255], np.uint8),
    'membrane' : np.array([150,50,50], np.uint8),
    'soma' : np.array([255,255,0], np.uint8),
    'misc' : np.array([255,50,50], np.uint8),
    'erasor' : np.array([0,0,0], np.uint8),
    'synapticdensity' : np.array([255,0,10], np.uint8)
}

DrawingTypes = {
    'mitochondria' : {
        'value' : 300,
        'string' : 'mitochondria',
        'color': [50,50,255]
    },
    'membrane' : {
        'value' : 400,
        'string' : 'membrane',
        'color': [150,50,50]
    },
    'soma' : {
        'value' : 500,
        'string' : 'soma',
        'color': [255,255,0]
    },
    'misc' : {
        'value' : 600,
        'string' : 'misc',
        'color': [255,50,50]
    },
    'erasor' : {
        'value' : 700,
        'string' : 'erasor',
        'color': [255,255,255]
    },
    'synapticdensity' : {
        'value' : 800,
        'string' : 'synaptic density',
        'color': [255,0,0]
    },
    }
DrawingTypesId = dict([(v['value'], k) for k,v in DrawingTypes.items()])

def get_drawing_enum(request, project_id=None, stack_id=None):
    return HttpResponse(json.dumps(DrawingTypes), mimetype="text/json")


#TODO: in transaction
@requires_user_role(UserRole.Annotate)
def get_saved_drawings_by_component_id(request, project_id=None, stack_id=None):
    # parse request
    component_id = int(request.GET['component_id'])
    skeleton_id = int(request.GET['skeleton_id'])
    z = int(request.GET['z'])

    s = get_object_or_404(ClassInstance, pk=skeleton_id)
    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    all_drawings = Drawing.objects.filter(stack=stack,
        project=p,skeleton_id=skeleton_id,
        z = z,component_id=component_id).all()

    drawings={}

    for drawing in all_drawings:
        drawings[int(drawing.id)]=\
            {'id':int(drawing.id),
             'componentId':int(drawing.component_id),
             'minX':int(drawing.min_x),
             'minY':int(drawing.min_y),
             'maxX':int(drawing.max_x),
             'maxY':int(drawing.max_y),
             'type':int(drawing.type),
             'svg':drawing.svg,
             'status':drawing.status,
             'skeletonId':drawing.skeleton_id

        }

    return HttpResponse(json.dumps(drawings), mimetype="text/json")



#TODO: in transaction
@requires_user_role(UserRole.Annotate)
def get_saved_drawings_by_view(request, project_id=None, stack_id=None):
    # parse request
    z = int(request.GET['z'])

    # field of view
    viewX = int(request.GET['x'])
    viewY = int(request.GET['y'])
    viewHeight = int(request.GET['height'])
    viewWidth = int(request.GET['width'])

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)

    # fetch all the components for the given z section
    all_drawings = Drawing.objects.filter(
        project = p,
        stack = stack,
        component_id = None,
        z = z).all()

    drawings={}
    for drawing in all_drawings:
        drawings[int(drawing.id)]=\
            {
            'minX': int(drawing.min_x),
            'minY': int(drawing.min_y),
            'maxX': int(drawing.max_x),
            'maxY': int(drawing.max_y),
            'svg': drawing.svg,
            'status': drawing.status,
            'type': drawing.type,
            'id': drawing.id,
            'componentId': drawing.component_id,
            'skeletonId': drawing.skeleton_id
        }

    return HttpResponse(json.dumps(drawings), mimetype="text/json")

#TODO: in transaction
@requires_user_role(UserRole.Annotate)
def delete_drawing(request, project_id=None, stack_id=None):
    # parse request
    drawingId=request.GET.get('id',None)
    if not drawingId is None:
        all_drawings = Drawing.objects.filter(id=drawingId).all()
        Drawing.delete(all_drawings[0])

    return HttpResponse(json.dumps(True), mimetype="text/json")


#TODO: in transaction
@requires_user_role(UserRole.Annotate)
def put_drawing(request, project_id=None, stack_id=None):
    # parse request
    drawing=json.loads(request.POST['drawing'])
    skeleton_id = request.POST.__getitem__('skeleton_id')
    z = int(request.POST['z'])

    # field of view
    viewX=int(request.POST['x'])
    viewY=int(request.POST['y'])
    viewHeight=int(request.POST['height'])
    viewWidth=int(request.POST['width'])

    viewMaxX=viewX+viewWidth
    ViewMaxY=viewY+viewHeight
    skeleton=None


    if not skeleton_id =='null':
        skeleton=int(skeleton_id)

    stack = get_object_or_404(Stack, pk=stack_id)
    p = get_object_or_404(Project, pk=project_id)


    new_drawing = Drawing(
        project = p,
        stack = stack,
        user = request.user,
        skeleton_id = skeleton,
        component_id = drawing['componentId'],
        min_x = drawing['minX'],
        min_y = drawing['minY'],
        max_x = drawing['maxX'],
        max_y = drawing['maxY'],
        z = z,
        svg = drawing['svg'],
        type=drawing['type'],
        status = 1
    )
    new_drawing.save()

    return HttpResponse(json.dumps(new_drawing.id), mimetype="text/json")

