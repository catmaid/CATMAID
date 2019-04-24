# -*- coding: utf-8 -*-

import json
import os.path
from typing import Tuple

from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.http import HttpRequest, HttpResponseRedirect, JsonResponse
from django.shortcuts import redirect

from catmaid.control import cropping
from catmaid.control.authentication import requires_user_role
from catmaid.control.common import urljoin
from catmaid.models import UserRole, RegionOfInterest, Project, Relation, \
        Stack, ClassInstance, RegionOfInterestClassInstance

from celery.task import task
from celery.utils.log import get_task_logger

# Prefix for stored ROIs
file_prefix = "roi_"
# File extension of the stored ROIs
file_extension = "png"
# The path were cropped files get stored in
roi_path = os.path.join(settings.MEDIA_ROOT,
    settings.MEDIA_ROI_SUBDIRECTORY)
# A common logger for the celery tasks
logger = get_task_logger(__name__)
# Locks will expire after two minutes
LOCK_EXPIRE = 60 * 2

@requires_user_role([UserRole.Browse])
def get_roi_info(request:HttpRequest, project_id=None, roi_id=None) -> JsonResponse:
    """ Returns a JSON string filled with information about
    the region of interest with ID <roi_id>.
    """
    roi = RegionOfInterest.objects.get(id=roi_id)

    info = {
        'id': roi.id,
        'zoom_level': roi.zoom_level,
        'location': [roi.location_x, roi.location_y, roi.location_z],
        'width': roi.width,
        'height': roi.height,
        'rotation_cw': roi.rotation_cw,
        'stack_id': roi.stack.id,
        'project_id': roi.project.id}

    return JsonResponse(info)

def _add_roi(project_id, stack_id, user_id, x_min, x_max, y_min, y_max, z,
             zoom_level, rotation_cw) -> RegionOfInterest:
    """ Add a new ROI database object and return it.
    """

    # Calculate ROI center and extent
    cx = (x_max + x_min) * 0.5
    cy = (y_max + y_min) * 0.5
    cz = z
    width = abs(x_max - x_min)
    height = abs(y_max - y_min)

    # Create a new ROI class instance
    roi = RegionOfInterest()
    roi.user_id = user_id
    roi.editor_id = user_id
    roi.project_id = project_id
    roi.stack_id = stack_id
    roi.zoom_level = zoom_level
    roi.location_x = cx
    roi.location_y = cy
    roi.location_z = cz
    roi.width = width
    roi.height = height
    roi.rotation_cw = rotation_cw
    roi.save()

    # Create cropped image, if wanted
    if settings.ROI_AUTO_CREATE_IMAGE:
        file_name, file_path = create_roi_path(roi.id)
        user = User.objects.get(pk=user_id)
        create_roi_image(user, project_id, roi.id, file_path)

    return roi

@requires_user_role(UserRole.Annotate)
def add_roi(request:HttpRequest, project_id=None) -> JsonResponse:
    # Try to get all needed POST parameters
    x_min = float(request.POST['x_min'])
    x_max = float(request.POST['x_max'])
    y_min = float(request.POST['y_min'])
    y_max = float(request.POST['y_max'])
    z = float(request.POST['z'])
    zoom_level = int(request.POST['zoom_level'])
    rotation_cw = int(request.POST['rotation_cw'])
    stack_id = int(request.POST['stack'])

    roi = _add_roi(project_id, stack_id, request.user.id, x_min, x_max,
                   y_min, y_max, z, zoom_level, rotation_cw)

    # Build result data set
    status = {'status': "Created new ROI with ID %s." % roi.id}

    return JsonResponse(status)

@requires_user_role(UserRole.Annotate)
def link_roi_to_class_instance(request:HttpRequest, project_id=None, relation_id=None,
        stack_id=None, ci_id=None) -> JsonResponse:
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
    rotation_cw = int(request.POST['rotation_cw'])

    # Get related objects
    project = Project.objects.get(id=project_id)
    stack = Stack.objects.get(id=stack_id)
    ci = ClassInstance.objects.get(id=ci_id)
    rel = Relation.objects.get(id=relation_id)

    roi = _add_roi(project.id, stack.id, request.user.id, x_min, x_max, y_min,
                   y_max, z, zoom_level, rotation_cw)

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

    return JsonResponse(status)

@requires_user_role([UserRole.Annotate, UserRole.Browse])
def remove_roi_link(request:HttpRequest, project_id=None, roi_id=None) -> JsonResponse:
    """ Removes the ROI link with the ID <roi_id>. If there are no more
    links to the actual ROI after the removal, the ROI gets removed as well.
    """
    # Remove ROI link
    roi_link = RegionOfInterestClassInstance.objects.get(id=roi_id)
    roi_link.delete()
    # Remove ROI if there are no more links to it
    remaining_links = RegionOfInterestClassInstance.objects.filter(
        region_of_interest=roi_link.region_of_interest)
    if remaining_links.count() == 0:
        # Delete the ROI class instance
        roi_link.region_of_interest.delete()
        # Make sure, there is no cropped image left
        file_name, file_path = create_roi_path(roi_id)
        file_info = ""
        if os.path.exists(file_path) and os.path.isfile(file_path):
            try:
                os.remove(file_path)
                file_info = " The same goes for its cropped image."
            except OSError as e:
                file_info = " However, its cropped image couldn't be removed."
        # Create status data
        status = {'status': "Removed ROI link with ID %s. The ROI " \
            "itself has been deleted as well.%s" % (roi_id, file_info)}
    else:
        status = {'status': "Removed ROI link with ID %s. The ROI " \
            "itself has not been deleted, because there are still " \
            "links to it." % roi_id}

    return JsonResponse(status)

def create_lock_name(roi_id) -> str:
    """ Creates a name for the image creation lock.
    """
    return "%s-lock-%s" % ('catmaid.create_roi_image', roi_id)

def create_roi_image(user, project_id, roi_id, file_path) -> bool:
    """ Tries to acquire a lock for a creating the cropped image
    of a certain ROI. If able to do this, launches the celery task
    which removes the lock when done.
    """
    lock_id = create_lock_name(roi_id)
    # cache.add fails if the key is already exists
    acquire_lock = lambda: cache.add(lock_id, "true", LOCK_EXPIRE)
    if not acquire_lock():
        logger.debug("ROI %s is already taken care of by another worker" % roi_id)
        return False
    else:
        create_roi_image_task.delay(user, project_id, roi_id, file_path)
        return True

@task(name='catmaid.create_roi_image')
def create_roi_image_task(user, project_id, roi_id, file_path) -> str:
    lock_id = create_lock_name(roi_id)
    # memcache delete is very slow, but we have to use it to take
    # advantage of using add() for atomic locking
    release_lock = lambda: cache.delete(lock_id)
    logger.debug("Creating cropped image for ROI with ID %s" % roi_id)
    try:
        # Get ROI
        roi = RegionOfInterest.objects.get(id=roi_id)
        # Prepare parameters
        hwidth = roi.width * 0.5
        x_min = roi.location_x - hwidth
        x_max = roi.location_x + hwidth
        hheight = roi.height * 0.5
        y_min = roi.location_y - hheight
        y_max = roi.location_y + hheight
        z_min = z_max = roi.location_z
        single_channel = False
        # Create a cropping job
        job = cropping.CropJob(user, project_id, [roi.stack.id],
            x_min, x_max, y_min, y_max, z_min, z_max, roi.rotation_cw,
            roi.zoom_level, single_channel)
        # Create the pgmagick images
        cropped_stacks = cropping.extract_substack( job )
        if len(cropped_stacks) == 0:
            raise Exception("Couldn't create ROI image")
        # There is only one image here
        img = cropped_stacks[0]
        img.write(str(file_path))
    finally:
        release_lock()

    return "Created image of ROI %s" % roi_id

def create_roi_path(roi_id) -> Tuple[str, str]:
    """ Creates a tuple (file name, file path) for the given ROI ID.
    """
    file_name = file_prefix + str(roi_id) + "." + file_extension
    file_path = os.path.join(roi_path, file_name)

    return (file_name, file_path)

@requires_user_role([UserRole.Browse])
def get_roi_image(request, project_id=None, roi_id=None) -> HttpResponseRedirect:
    """ Returns the URL to the cropped image, described by the ROI.  These
    images are cached, and won't get removed automatically. If the image is
    already present its URL is used and returned. For performance reasons it
    might be a good idea, to add this test to the web-server config.
    """
    file_name, file_path = create_roi_path(roi_id)
    if not os.path.exists(file_path):
        # Start async processing
        create_roi_image(request.user, project_id, roi_id, file_path)
        # Use waiting image
        url = urljoin(settings.STATIC_URL,
            "images/wait_bgwhite.gif")
    else:
        # Create real image di
        url_base = urljoin(settings.MEDIA_URL,
            settings.MEDIA_ROI_SUBDIRECTORY)
        url = urljoin(url_base, file_name)

    return redirect(url)
