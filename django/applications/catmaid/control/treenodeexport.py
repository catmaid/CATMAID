from __future__ import print_function

import json

from django.conf import settings
from django.http import HttpResponse

from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_relation_to_id_map, get_class_to_id_map
from catmaid.control.common import json_error_response, id_generator
from catmaid.control.cropping import CropJob, extract_substack, process_crop_job
from catmaid.models import ClassInstanceClassInstance, TreenodeConnector
from catmaid.models import Message, User, UserRole

from celery.task import task

import os.path
import shutil
import tarfile
from urllib2 import HTTPError


# The path were archive files get stored in
treenode_output_path = os.path.join(settings.MEDIA_ROOT,
    settings.MEDIA_TREENODE_SUBDIRECTORY)

class SkeletonExportJob:
    """ A container with data needed for exporting things related to skeletons.
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

class TreenodeExporter:
    def __init__(self, job):
        self.job = job
        # The name of entities that are exported
        self.entity_name = "treenode"

        # Output path for this job will be initialized, when needed
        self.output_path = None

        # Cache for neuron and relation folder names
        self.skid_to_neuron_folder = {}
        self.relid_to_rel_folder = {}

        # Get relation map
        self.relation_map = get_relation_to_id_map(job.project_id)

    def create_message(self, title, message, url):
        msg = Message()
        msg.user = User.objects.get(pk=int(self.job.user.id))
        msg.read = False
        msg.title = title
        msg.text = message
        msg.action = url
        msg.save()

    def create_basic_output_path(self):
        """ Will create a random output folder name prefixed with the entity
        name as well as the actual directory.
        """
        # Find non-existing random folder name
        while True:
            folder_name = self.entity_name + '_archive_' + id_generator()
            output_path = os.path.join(treenode_output_path, folder_name)
            if not os.path.exists(output_path):
                break
        # Create folder and store path as field
        os.makedirs(output_path)
        self.output_path = output_path

    def get_entities_to_export(self):
        raise Exception("get_entities_to_export not implemented")

    def create_path(self, treenode):
        raise Exception("create_path not implemented")

    def export_single_node(self, node):
        raise Exception("export_single_node not implemented")


class ConnectorExporter(TreenodeExporter):
    """ Most of the infrastructure can be used for both treenodes and
    connecotors. This job class overrides the things that differ.
    """

    def __init__(self, *args, **kwargs):
        TreenodeExporter.__init__(self, *args, **kwargs)
        self.entity_name = "connector"

    def create_path(self, connector):
        """ Based on the output path, this function will create a folder
        structure for a particular connector. Things that are supposedly
        needed multiple times, will be cached. This function will also make
        sure the path exists and is ready to be written to.
        """
        # Get (and create if needed) cache entry for string of neuron id
        if connector.skeleton_id not in self.skid_to_neuron_folder:
            neuron_cici = ClassInstanceClassInstance.objects.get(
                    relation_id=self.relation_map['model_of'],
                    project_id=self.job.project_id,
                    class_instance_a=connector.skeleton.id)
            self.skid_to_neuron_folder[connector.skeleton.id] = \
                    str(neuron_cici.class_instance_b_id)
        neuron_folder = self.skid_to_neuron_folder[connector.skeleton.id]

        # get (and create if needed) cache entry for string of relation name
        if connector.relation_id not in self.relid_to_rel_folder:
            if connector.relation_id == self.relation_map['presynaptic_to']:
                rel_folder = "presynaptic"
            elif connector.relation_id == self.relation_map['postsynaptic_to']:
                rel_folder = "postsynaptic"
            else:
                rel_folder = "unknown_" + str(connector.relation_id)
            self.relid_to_rel_folder[connector.relation_id] = rel_folder
        relation_folder =  self.relid_to_rel_folder[connector.relation_id]

        # Create path output_path/neuron_id/relation_name/connector_id
        connector_path = os.path.join(self.output_path, neuron_folder,
                relation_folder, str(connector.id))
        try:
            os.makedirs(connector_path)
        except OSError as e:
            # Everything is fine if the path exists and is writable
            if not os.path.exists(connector_path) or not \
                    os.access(connector_path, os.W_OK):
                raise e

        return connector_path

    def get_entities_to_export(self):
        """ Returns a list of connector links. If the job asks only for a
        sample, the first pre-synaptic connector of the first skeleton will be
        used. If such a connector doesn't exist, the first one found is used.
        Otherwise, if no sample should be taken, all connectors of all
        skeletons are exported.
        """
        if self.job.sample:
            # First try to get a pre-synaptic connector, because these are usually a
            # larger than the post-synaptic ones.
            try:
                connector_link = TreenodeConnector.objects.filter(
                        project_id=self.job.project_id,
                        relation_id=self.relation_map['presynaptic_to'],
                        skeleton_id__in=self.skeleton_ids)[0]
            except IndexError:
                connector_link = None

            # If there is no pre-synaptic treenode, ignore this constraint
            if not connector_link:
                try:
                    connector_link = TreenodeConnector.objects.filter(
                            project_id=self.job.project_id,
                            skeleton_id__in=self.skeleton_ids)[0]
                except IndexError:
                    return "Could not find any connector to export"

            connector_links = [connector_link]
        else:
            connector_links = TreenodeConnector.objects.filter(
                    project_id=self.job.project_id,
                    skeleton_id__in=self.job.skeleton_ids).select_related(
                            'connector')

        return connector_links

    def export_single_node(self, connector_link):
        """ Exports a single connector and expects the output path to be existing
        and writable.
        """
        connector = connector_link.connector

        # Calculate bounding box for current connector
        x_min = connector.location.x - self.job.x_radius
        x_max = connector.location.x + self.job.x_radius
        y_min = connector.location.y - self.job.y_radius
        y_max = connector.location.y + self.job.y_radius
        z_min = connector.location.z - self.job.z_radius
        z_max = connector.location.z + self.job.z_radius
        rotation_cw = 0
        zoom_level = 0

        # Create a single file for each section (instead of a mulipage TIFF)
        crop_self = CropJob(self.job.user, self.job.project_id,
                self.job.stack_id, x_min, x_max, y_min, y_max, z_min, z_max,
                rotation_cw, zoom_level, single_channel=True)
        cropped_stack = extract_substack(crop_self)
        # Save each file in output path
        connector_path = self.create_path(connector_link)
        for i, img in enumerate(cropped_stack):
            # Save image in output path, named after the image center's coordinates,
            # rounded to full integers.
            x = int(connector.location.x + 0.5)
            y = int(connector.location.y + 0.5)
            z = int(z_min + i * crop_self.stacks[0].resolution.z  + 0.5)
            image_name = "%s_%s_%s.tiff" % (x, y, z)
            connector_image_path = os.path.join(connector_path, image_name)
            img.write(connector_image_path)

@task()
def process_export_job(exporter):
    """ This method does the actual archive creation. It controls the data
    extraction and the creation of all sub-stacks. It can be executed as Celery
    task.
    """
    nodes = exporter.get_entities_to_export()

    # Abort if there are no nodes to process
    if not nodes:
        msg = "No %ss matching the requirements have been found. Therefore, " \
                "nothing was exported." % exporter.entity_name
        exporter.create_message("Nothing to export", msg, '#')
        return msg

    # Create a working directoy to create subfolders and images in
    exporter.create_basic_output_path()

    # Store error codes and URLs for unreachable images for each failed link
    error_urls = {}
    try:
        # Export every node
        for node in nodes:
            try:
                exporter.export_single_node(node)
            except HTTPError as e:
                error_urls[node] = (e.code, e.url)

        # Create error log, if needed
        if error_urls:
            error_path = os.path.join(exporter.output_path, "error_log.txt")
            with open(error_path, 'w') as f:
                f.write("The following %ss couldn't be exported. At " \
                        "least one image URL of each of them couldn't be " \
                        "reached.\n" % exporter.entity_name)
                f.write("%s-id http-error-code url\n" % exporter.entity_name)
                for node, eu in error_urls.items():
                    f.write("%s %s %s\n" % (node.id, eu[0], eu[1]))
    except IOError as e:
        msg = "The export of the data set has been aborted, because an " \
                "error occured: %s" % str(e)
        exporter.create_message("The %s export failed" % exporter.entity_name,
                msg, '#')
        return "An error occured during the %s export: %s" % \
                (exporter.entity_name, str(e))

    # Make working directory an archive
    tarfile_path = exporter.output_path.rstrip(os.sep) + '.tar.gz'
    tar = tarfile.open(tarfile_path, 'w:gz')
    tar.add(exporter.output_path, arcname=os.path.basename(exporter.output_path))
    tar.close()

    # Delete working directory
    shutil.rmtree(exporter.output_path)

    # Create message
    tarfile_name = os.path.basename(tarfile_path)
    url = os.path.join(settings.CATMAID_URL, settings.MEDIA_URL,
            settings.MEDIA_TREENODE_SUBDIRECTORY, tarfile_name)
    if error_urls:
        error_msg = " However, errors occured during the export of some " \
                "images and an error log is available in the archive."
    else:
        error_msg = ""
    msg = "Exporting a %s archive finished.%s You can download it from " \
            "this location: <a href='%s'>%s</a>" % \
            (exporter.entity_name, error_msg, url, url)
    exporter.create_message("Export of %ss finished" % exporter.entity_name,
            msg, url)

    return msg

def start_asynch_process(exporter):
    """ It launches the data extraction and sub-stack building as a separate
    process. Celery is used for this and it it returns a AsyncResult object.
    """
    return process_export_job.delay(exporter)

def create_request_based_export_job(request, project_id):
    """ This will get parameters for a new treenode exporting job from an HTTP
    request. Based on them this method will create and run a new exporting job.
    """
    # Make sure we have write permssions to output directories
    needed_permissions = (
        os.path.exists(treenode_output_path),
        os.access(treenode_output_path, os.W_OK)
    )
    if False in needed_permissions:
        raise Exception("Please make sure your output folder " \
                "(MEDIA_ROOT and MEDIA_TREENODE_SUBDIRECTORY in " \
                "settings.py) exists and is writable.")

    # Get stack ID and  skeleton IDs of which the nodes should be exported
    stack_id = request.POST.get('stackid', None);
    skeleton_ids = set(int(v) for k,v in request.POST.iteritems() \
            if k.startswith('skids['))
    # Width, height and depth of each node image stack needs to be known.
    x_radius = request.POST.get('x_radius', None)
    y_radius = request.POST.get('y_radius', None)
    z_radius = request.POST.get('z_radius', None)
    # Determine if a sample should be created
    sample = request.POST.get('sample', None)

    # Create a new export job
    return SkeletonExportJob(request.user, project_id, stack_id, skeleton_ids,
            x_radius, y_radius, z_radius, sample)

@requires_user_role(UserRole.Browse)
def export_connectors(request, project_id=None):
    """ This will create a new connector exporting job based on an HTTP request.
    Based on them this method will create and run a new exporting job.
    """
    job = create_request_based_export_job(request, project_id)
    proc = start_asynch_process(ConnectorExporter(job))
    if proc.failed():
        raise Exception("Something went wrong while queuing the export: " + \
                proc.result)
    json_data = json.dumps({'message': 'The connector archive is currently ' \
            'exported. You will be notified once it is ready for download.'})
    return HttpResponse(json_data, mimetype='text/json')

@requires_user_role(UserRole.Browse)
def export_treenodes(request, project_id=None):
    """ This will create a new treenode exporting job based on an HTTP request.
    Based on them this method will create and run a new exporting job.
    """
    job = create_request_based_export_job(request, project_id)
    proc = start_asynch_process(TreenodeExporter(job))
    if proc.failed():
        raise Exception("Something went wrong while queuing the export: " + \
                proc.result)
    json_data = json.dumps({'message': 'The treenode archive is currently ' \
            'exported. You will be notified once it is ready for download.'})
    return HttpResponse(json_data, mimetype='text/json')
