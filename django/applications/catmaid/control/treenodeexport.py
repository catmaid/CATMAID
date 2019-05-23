# -*- coding: utf-8 -*-

import json
import os.path
import shutil
import tarfile
from typing import Dict, List, Optional

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.http import HttpRequest, JsonResponse
from django.db.models import Count

from catmaid.control.authentication import requires_user_role
from catmaid.control.common import get_relation_to_id_map, id_generator
from catmaid.control.cropping import CropJob, extract_substack, ImageRetrievalError
from catmaid.models import ClassInstanceClassInstance, TreenodeConnector, \
        Message, User, UserRole, Treenode

from celery.task import task


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
        self.output_path = None # type: Optional[str]

        # Cache for neuron and relation folder names
        self.skid_to_neuron_folder = {} # type: Dict
        self.relid_to_rel_folder = {} # type: Dict

        # Get relation map
        self.relation_map = get_relation_to_id_map(job.project_id)

        # Store meta data for each node
        self.metadata = {} # type: Dict

    def create_message(self, title, message, url) -> None:
        msg = Message()
        msg.user = User.objects.get(pk=int(self.job.user.id))
        msg.read = False
        msg.title = title
        msg.text = message
        msg.action = url
        msg.save()

    def create_basic_output_path(self) -> None:
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

    def create_path(self, treenode) -> str:
        """ Based on the output path, this function will create a folder
        structure for a particular skeleton. Things that are supposedly
        needed multiple times, will be cached. This function will also make
        sure the path exists and is ready to be written to.
        """
        # Get (and create if needed) cache entry for string of neuron id
        treenode_path = self.skid_to_neuron_folder.get(treenode.skeleton_id)
        if treenode_path:
            return treenode_path
        else:
            neuron_cici = ClassInstanceClassInstance.objects.get(
                    relation_id=self.relation_map['model_of'],
                    project_id=self.job.project_id,
                    class_instance_a=treenode.skeleton.id)
            treenode_path = os.path.join(self.output_path,
                    str(neuron_cici.class_instance_b_id))
            self.skid_to_neuron_folder[treenode.skeleton.id] = treenode_path

            # Create path output_path/neuron_id
            if not os.path.exists(treenode_path):
                os.makedirs(treenode_path)
            if not os.access(treenode_path, os.W_OK):
                raise ImproperlyConfigured("Treenode export path is not writable")
            return treenode_path

    def get_entities_to_export(self):
        """ Returns a list of treenode links. If the job asks only for a
        sample, the first treenode of the first skeleton will be used.
        Otherwise, if no sample should be taken, all treempdes of all
        skeletons are exported.
        """
        if self.job.sample:
            try:
                tn = Treenode.objects.filter(project_id=self.job.project_id,
                        skeleton_id__in=self.job.skeleton_ids)[0]
                return [tn]
            except IndexError:
                return []
        else:
            return Treenode.objects.filter(project_id=self.job.project_id,
                    skeleton_id__in=self.job.skeleton_ids)

    def export_single_node(self, treenode) -> None:
        """ Exports a treenode. Expects the output path to exist
        and be writable.
        """
        # Calculate bounding box for current connector
        x_min = treenode.location_x - self.job.x_radius
        x_max = treenode.location_x + self.job.x_radius
        y_min = treenode.location_y - self.job.y_radius
        y_max = treenode.location_y + self.job.y_radius
        z_min = treenode.location_z - self.job.z_radius
        z_max = treenode.location_z + self.job.z_radius
        rotation_cw = 0
        zoom_level = 0

        # Create a single file for each section (instead of a mulipage TIFF)
        crop_self = CropJob(self.job.user, self.job.project_id,
                self.job.stack_id, x_min, x_max, y_min, y_max, z_min, z_max,
                rotation_cw, zoom_level, single_channel=True)
        cropped_stack = extract_substack(crop_self)
        # Save each file in output path
        output_path = self.create_path(treenode)
        for i, img in enumerate(cropped_stack):
            # Save image in output path, named <treenode-id>.tiff
            image_name = "%s.tiff" % treenode.id
            treenode_image_path = os.path.join(output_path, image_name)
            img.write(treenode_image_path)

    def post_process(self, nodes) -> None:
        """ Create a meta data file for all the nodes passed (usually all of the
        ones queries before). This file is a table with the following columns:
        <treenode id> <parent id> <#presynaptic sites> <#postsynaptic sites> <x> <y> <z>
        """
        # Get pre- and post synaptic sites
        presynaptic_to_rel = self.relation_map['presynaptic_to']
        postsynaptic_to_rel = self.relation_map['postsynaptic_to']
        connector_links = TreenodeConnector.objects.filter(
              project_id=self.job.project_id,
              relation_id__in=[presynaptic_to_rel, postsynaptic_to_rel],
              skeleton_id__in=self.job.skeleton_ids).values('treenode',
                      'relation').annotate(relcount=Count('relation'))

        presynaptic_map = {}
        postsynaptic_map = {}
        for cl in connector_links:
            if cl['relation'] == presynaptic_to_rel:
                presynaptic_map[cl['treenode']] = cl['relcount']
            elif cl['relation'] == postsynaptic_to_rel:
                postsynaptic_map[cl['treenode']] = cl['relcount']
            else:
                raise Exception("Unexpected relation encountered")

        # Create log info for each treenode. Each line will contain treenode-id,
        # parent-id, nr. presynaptic sites, nr. postsynaptic sites, x, y, z
        skid_to_metadata = {} # type: Dict
        for n in nodes:
            ls = skid_to_metadata.get(n.skeleton.id)
            if not ls:
                ls = []
                skid_to_metadata[n.skeleton.id] = ls
            p = n.parent.id if n.parent else 'null'
            n_pre = presynaptic_map.get(n.id, 0)
            n_post = postsynaptic_map.get(n.id, 0)
            x = n.location_x
            y = n.location_y
            z = n.location_z
            line = ', '.join([str(e) for e in (n.id, p, n_pre, n_post, x, y, z)])
            ls.append(line)

        # Save metdata for each skeleton to files
        for skid, metadata in skid_to_metadata.items():
            path = self.skid_to_neuron_folder.get(skid)
            with open(os.path.join(path, 'metadata.csv'), 'w') as f:
                f.write("This CSV file contains meta data for CATMAID skeleton " \
                        "%s. The columns represent the following data:\n" % skid)
                f.write("treenode-id, parent-id, # presynaptic sites, " \
                        "# postsynaptic sites, x, y, z\n")
                for line in metadata:
                    f.write("%s\n" % line)

class ConnectorExporter(TreenodeExporter):
    """ Most of the infrastructure can be used for both treenodes and
    connectors. This job class overrides the things that differ.
    """

    def __init__(self, *args, **kwargs):
        TreenodeExporter.__init__(self, *args, **kwargs)
        self.entity_name = "connector"

    def create_path(self, connector_link) -> str:
        """ Based on the output path, this function will create a folder
        structure for a particular connector. Things that are supposedly
        needed multiple times, will be cached. This function will also make
        sure the path exists and is ready to be written to.
        """
        # Get (and create if needed) cache entry for string of neuron id
        if connector_link.skeleton_id not in self.skid_to_neuron_folder:
            neuron_cici = ClassInstanceClassInstance.objects.get(
                    relation_id=self.relation_map['model_of'],
                    project_id=self.job.project_id,
                    class_instance_a=connector_link.skeleton.id)
            self.skid_to_neuron_folder[connector_link.skeleton.id] = \
                    str(neuron_cici.class_instance_b_id)
        neuron_folder = self.skid_to_neuron_folder[connector_link.skeleton.id]

        # get (and create if needed) cache entry for string of relation name
        if connector_link.relation_id not in self.relid_to_rel_folder:
            if connector_link.relation_id == self.relation_map['presynaptic_to']:
                rel_folder = "presynaptic"
            elif connector_link.relation_id == self.relation_map['postsynaptic_to']:
                rel_folder = "postsynaptic"
            else:
                rel_folder = "unknown_" + str(connector_link.relation_id)
            self.relid_to_rel_folder[connector_link.relation_id] = rel_folder
        relation_folder =  self.relid_to_rel_folder[connector_link.relation_id]

        # Create path output_path/neuron_id/relation_name/connector_id
        if self.output_path is None:
            raise Exception('self.output_path is not set in ConnectorExporter.create_path()')
        connector_path = os.path.join(self.output_path, neuron_folder,
                relation_folder, str(connector_link.connector.id))
        try:
            os.makedirs(connector_path)
        except OSError as e:
            # Everything is fine if the path exists and is writable
            if not os.path.exists(connector_path) or not \
                    os.access(connector_path, os.W_OK):
                raise e

        return connector_path

    def get_entities_to_export(self) -> List:
        """ Returns a list of connector links. If the job asks only for a
        sample, the first pre-synaptic connector of the first skeleton will be
        used. If such a connector doesn't exist, the first one found is used.
        Otherwise, if no sample should be taken, all connectors of all
        skeletons are exported.
        """
        if self.job.sample:
            # First try to get a pre-synaptic connector, because these are usually
            # larger than the post-synaptic ones.
            try:
                connector_link = TreenodeConnector.objects.filter(
                        project_id=self.job.project_id,
                        relation_id=self.relation_map['presynaptic_to'],
                        skeleton_id__in=self.job.skeleton_ids)[0]
            except IndexError:
                connector_link = None

            # If there is no pre-synaptic treenode, ignore this constraint
            if not connector_link:
                try:
                    connector_link = TreenodeConnector.objects.filter(
                            project_id=self.job.project_id,
                            relation_id__in=(self.relation_map['presynaptic_to'],
                                             self.relation_map['postsynaptic_to']),
                            skeleton_id__in=self.job.skeleton_ids)[0]
                except IndexError:
                    raise RuntimeError("Could not find any connector to export")

            connector_links = [connector_link]
        else:
            connector_links = TreenodeConnector.objects.filter(
                    project_id=self.job.project_id,
                    relation_id__in=(self.relation_map['presynaptic_to'],
                                        self.relation_map['postsynaptic_to']),
                    skeleton_id__in=self.job.skeleton_ids).select_related(
                            'connector')

        return connector_links

    def export_single_node(self, connector_link) -> None:
        """ Exports a single connector and expects the output path to be existing
        and writable.
        """
        connector = connector_link.connector

        # Calculate bounding box for current connector
        x_min = connector.location_x - self.job.x_radius
        x_max = connector.location_x + self.job.x_radius
        y_min = connector.location_y - self.job.y_radius
        y_max = connector.location_y + self.job.y_radius
        z_min = connector.location_z - self.job.z_radius
        z_max = connector.location_z + self.job.z_radius
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
            x = int(connector.location_x + 0.5)
            y = int(connector.location_y + 0.5)
            z = int(z_min + i * crop_self.stacks[0].resolution.z  + 0.5)
            image_name = "%s_%s_%s.tiff" % (x, y, z)
            connector_image_path = os.path.join(connector_path, image_name)
            img.write(connector_image_path)

    def post_process(self, nodes) -> None:
        pass

@task()
def process_export_job(exporter) -> str:
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
            except ImageRetrievalError as e:
                error_urls[node] = (e.error, e.path)
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

    # Give an exporter the chance to do some postprocessing
    exporter.post_process(nodes)

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
        if request.user.is_superuser:
            raise Exception("Please make sure your output folder (%s) exists " \
                    "and is writable. It is configured by MEDIA_ROOT and " \
                    "MEDIA_TREENODE_SUBDIRECTORY in settings.py." % \
                    treenode_output_path)
        else:
            raise Exception("Sorry, the output path for the node export tool " \
                    "isn't set up correctly. Please contact an administrator.")

    # Get stack ID and  skeleton IDs of which the nodes should be exported
    stack_id = request.POST.get('stackid', None)
    skeleton_ids = set(int(v) for k,v in request.POST.items() \
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
def export_connectors(request:HttpRequest, project_id=None) -> JsonResponse:
    """ This will create a new connector exporting job based on an HTTP request.
    Based on them this method will create and run a new exporting job.
    """
    job = create_request_based_export_job(request, project_id)
    proc = start_asynch_process(ConnectorExporter(job))
    if proc.failed():
        raise Exception("Something went wrong while queuing the export: " + \
                proc.result)
    json_data = {'message': 'The connector archive is currently ' \
            'exporting. You will be notified once it is ready for download.'}
    return JsonResponse(json_data)

@requires_user_role(UserRole.Browse)
def export_treenodes(request:HttpRequest, project_id=None) -> JsonResponse:
    """ This will create a new treenode exporting job based on an HTTP request.
    Based on them this method will create and run a new exporting job.
    """
    job = create_request_based_export_job(request, project_id)
    proc = start_asynch_process(TreenodeExporter(job))
    if proc.failed():
        raise Exception("Something went wrong while queuing the export: " + \
                proc.result)
    json_data = {'message': 'The treenode archive is currently ' \
            'exporting. You will be notified once it is ready for download.'}
    return JsonResponse(json_data)
