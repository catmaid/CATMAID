import json

from django.http import HttpResponse

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole, RegionOfInterest, Project, Relation
from catmaid.models import Stack, ClassInstance, RegionOfInterestClassInstance
from catmaid.fields import Double3D

@requires_user_role([UserRole.Browse])
def get_roi_info(request, project_id=None, roi_id=None):
    """ Returns a JSON string filled with information about
    the region of interest with ID <roi_id>.
    """
    roi = RegionOfInterest.objects.get(id=roi_id)

    info = {
        'id': roi.id,
        'zoom_level': roi.zoom_level,
        'location': [roi.location.x, roi.location.y, roi.location.z],
        'width': roi.width,
        'height': roi.height,
        'rotation_cw': roi.rotation_cw,
        'stack_id': roi.stack.id,
        'project_id': roi.project.id}

    return HttpResponse(json.dumps(info))

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def link_roi_to_class_instance(request, project_id=None, relation_id=None,
        stack_id=None, ci_id=None):
    """ With the help of this method one can link a region of interest
    (ROI) to a class instance. The information about the ROI is passed
    as POST variables.
    """
    # Try to get all needed POST parameters
    x_min = float(request.POST['x_min'])
    x_max = float(request.POST['x_max'])
    y_min = float(request.POST['y_min'])
    y_max = float(request.POST['y_max'])
    z = float(request.POST['z'])
    zoom_level = int(request.POST['zoom_level'])
    rotation_cw = 0.0

    # Get related objects
    project = Project.objects.get(id=project_id)
    stack = Stack.objects.get(id=stack_id)
    ci = ClassInstance.objects.get(id=ci_id)
    rel = Relation.objects.get(id=relation_id)

    # Calculate ROI center and extent
    cx = (x_max + x_min) * 0.5
    cy = (y_max + y_min) * 0.5
    cz = z
    width = abs(x_max - x_min)
    height = abs(y_max - y_min)

    # Create a new ROI class instance
    roi = RegionOfInterest()
    roi.user = request.user
    roi.editor = request.user
    roi.project = project
    roi.stack = stack
    roi.zoom_level = zoom_level
    roi.location = Double3D(cx, cy, cz)
    roi.width = width
    roi.height = height
    roi.rotation_cw = rotation_cw
    roi.save()

    # Link ROI and class instance
    roi_ci = RegionOfInterestClassInstance()
    roi_ci.user = request.user
    roi_ci.project = project
    roi_ci.relation = rel
    roi_ci.region_of_interest = roi
    roi_ci.class_instance = ci
    roi_ci.save()

    # Build result data set
    status = {'status': "Created new ROI with ID %s." % roi.id}

    return HttpResponse(json.dumps(status))

