import json

from django.conf import settings
from django.http import HttpResponse

from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_relation_to_id_map, get_class_to_id_map
from catmaid.control.common import json_error_response, id_generator
from catmaid.models import TreenodeConnector, UserRole

from celery.task import task

import os.path

# Prefix for stored archive files
connector_file_prefix = "connector_archive_"
# The path were archive files get stored in
connector_output_path = os.path.join(settings.MEDIA_ROOT,
    settings.MEDIA_CONNECTOR_SUBDIRECTORY)

class ConnectorExportJob:
    """ A container with data needed for the creation of a connector archive.
    """
    def __init__(self, user, project_id, stack_id, skeleton_ids,
            x_radius, y_radius, z_radius, sample):
        # Sanity checks
        if not skeleton_ids:
            raise Exception("Please specify at least on skeleton ID")
        try:
            project_id = int(project_id)
            stack_id = int(stack_id)
        except (ValueError, TypeError) as e:
            raise Exception("Couldn't determine stack or project ID")
        try:
            x_radius = int(x_radius)
            y_radius = int(y_radius)
            z_radius = int(z_radius)
        except (ValueError, TypeError) as e:
            raise Exception("The x_radius, y_radius and z_radius parameters have " \
                    "to be numbers!")
        try:
            # Expect a boolean or a number
            sample = bool(int(sample))
        except (ValueError, TypeError) as e:
            raise ValueError("The sample parameter has to be a number or a" \
                    "boolean!")

        # Store data
        self.user = user
        self.project_id = project_id
        self.stack_id = stack_id
        self.skeleton_ids = skeleton_ids
        self.x_radius = x_radius
        self.y_radius = y_radius
        self.z_radius = z_radius
        self.sample = sample

@task()
def process_connector_export_job(job):
    """ This method does the actual archive creation. It controls the data
    extraction and the creation of all sub-stacks. It can be executed as Celery
    task.
    """
    return "Finished exporting a connector archive"

def start_asynch_process( job ):
    """ It launches the data extraction and sub-stack building as a separate
    process. Celery is used for this and it it returns a AsyncResult object.
    """
    return process_connector_export_job.delay( job )

@requires_user_role(UserRole.Browse)
def export_connectors(request, project_id=None):
    """ This will get parameters for a new connector exporting job from an HTTP
    request. Based on them this method will create and run a new exporting job.
    """
    # Make sure we have write permssions to output directories
    needed_permissions = (
        os.path.exists(connector_output_path),
        os.access(connector_output_path, os.W_OK)
    )
    if False in needed_permissions:
        return json_error_response("Please make sure your output folder " \
                "(MEDIA_ROOT and MEDIA_CONNECTOR_SUBDIRECTORY in " \
                "settings.py) exists and is writable.")

    # Get stack ID and  skeleton IDs of which the connectors should be exported
    stack_id = request.POST.get('stackid', None);
    skeleton_ids = set(int(v) for k,v in request.POST.iteritems() \
            if k.startswith('skids['))
    # Width, height and depth of each connector image stack needs to be known.
    x_radius = request.POST.get('x_radius', None)
    y_radius = request.POST.get('y_radius', None)
    z_radius = request.POST.get('z_radius', None)
    # Determine if a sample should be created
    sample = request.POST.get('sample', None)

    # Create a new export job and queue it
    job = ConnectorExportJob(request.user, project_id, stack_id, skeleton_ids,
            x_radius, y_radius, z_radius, sample)
    proc = start_asynch_process(job)
    if proc.failed():
        raise Exception("Something went wrong while queuing the export: " + \
                proc.result)

    json_data = json.dumps({'message': 'The connector archive is currently ' \
            'exported. You will be notified once it is ready for download.'})
    return HttpResponse(json_data, mimetype='text/json')
