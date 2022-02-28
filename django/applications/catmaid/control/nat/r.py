# -*- coding: utf-8 -*-

from datetime import datetime
import gc
from itertools import chain
import logging
import math
import multiprocessing
import numpy
import os
from tqdm import tqdm
import re
import subprocess
from typing import Any, Dict, List, Tuple
import socket
import struct
import pickle
import time

from django.db import connection, connections
from django.db.utils import DEFAULT_DB_ALIAS, load_backend
from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse

from catmaid.apps import get_system_user
from catmaid.control.common import get_request_bool, urljoin
from catmaid.control.authentication import requires_user_role
from catmaid.models import (Message, User, UserRole, NblastConfig,
        NblastConfigDefaultDistanceBreaks, NblastConfigDefaultDotBreaks,
        PointCloud, PointSet)

from celery import shared_task
from celery.utils.log import get_task_logger

from rest_framework.authtoken.models import Token

logger = get_task_logger(__name__)
rnat_enaled = True

try:
    from rpy2.robjects.packages import importr
    from rpy2.rinterface_lib.embedded import RRuntimeError
    import rpy2.robjects as robjects
    import rpy2.rinterface as rinterface
    import rpy2.rlike.container as rlc
except ImportError:
    rnat_enaled = False
    logger.warning('CATMAID was unable to load the Rpy2 library, which is an '
            'optional dependency. Nblast support is therefore disabled.')

try:
    import pandas as pd
except ImportError:
    rnat_enaled = False
    logger.warning('CATMAID was unable to load the Pandas lirary, which is an '
            'optional dependency. Nblast support is therefore disabled.')


# The path were server side exported files get stored in
output_path = os.path.join(settings.MEDIA_ROOT,
    settings.MEDIA_EXPORT_SUBDIRECTORY)
# NAT works mostly in um space and CATMAID in nm.
nm_to_um = 1e-3


class CleanUpHTTPResponse(HttpResponse):
    """Remove a file after it has been sent as a HTTP response.
    """

    def __init__(self, file_path, file_name, content_type, *args, **kwargs):
        self.file_path = file_path
        self.file_handle = open(file_path, 'rb')
        kwargs['content'] = self.file_handle
        super().__init__(*args, **kwargs)
        # self['Content-Disposition'] = 'attachment; filename="{}"'.format(file_name)

    def close(self) -> None:
        """Make sure all file handles are closed and the input file is removed.
        """
        super().close()
        if self.file_handle:
            self.file_handle.close()
        if os.path.exists(self.file_path):
            os.remove(self.file_path)


@requires_user_role(UserRole.Browse)
def export_nrrd(request:HttpRequest, project_id, skeleton_id) -> HttpResponse:
    """Export a skeleton as NRRD file using the NAT R package. To make this
    work, R has to be intalled on the server. Within R the NAT package has to be
    installed and the easiest way to do this is by running the following R code:

    if(!require("devtools")) install.packages("devtools")
    devtools::source_gist("fdd1e5b6e009ff49e66be466a104fd92", filename = "install_flyconnectome_all.R")

    Also, CMTK has to be installed, which can be done either by installing their
    published packages or compiling it from source and making it available from
    /usr/local/lib/cmtk/bin for NAT to pick it up.
    """
    source_ref = request.POST['source_ref']
    target_ref = request.POST['target_ref']
    mirror = get_request_bool(request.POST, 'mirror', False)
    async_export = get_request_bool(request.POST, 'async_export', False)

    # Make sure the output path can be written to
    if not os.path.exists(output_path) or not os.access(output_path, os.W_OK):
        raise ValueError("The output path is not accessible")

    if async_export:
        export_skeleton_as_nrrd_async.delay(project_id, skeleton_id, source_ref,
                target_ref, request.user.id, mirror)

        return JsonResponse({
            'success': True
        })
    else:
        result = export_skeleton_as_nrrd(project_id, skeleton_id, source_ref,
                target_ref, request.user.id, mirror)

        if result['errors']:
            errs = "\n".join(result['errors'])
            raise RuntimeError(f"There were errors creating the NRRD file: {errs}")

        return CleanUpHTTPResponse(result['nrrd_path'], result['nrrd_name'],
                content_type='application/octet-stream')

@shared_task()
def export_skeleton_as_nrrd_async(project_id, skeleton_id, source_ref,
        target_ref, user_id, mirror=True, create_message=True) -> str:

    result = export_skeleton_as_nrrd(project_id, skeleton_id, source_ref,
            target_ref, user_id, mirror)
    if create_message:
        msg = Message()
        msg.user = User.objects.get(pk=int(user_id))
        msg.read = False
        if result['errors']:
            msg.title = f"No NRRD file could be created for skeleton {skeleton_id}"
            errs = "\n".join(result['errors'])
            msg.text = f"There was at least one error during the NRRD export: {errs}"
            msg.action = ""
        else:
            url = urljoin(urljoin(settings.MEDIA_URL, settings.MEDIA_EXPORT_SUBDIRECTORY), result['nrrd_name'])
            msg.title = f"Exported skeleton {skeleton_id} as NRRD file"
            msg.text = "The requested skeleton was exported as NRRD file. You " \
                    f"can download it from this location: <a href='{url}'>{url}</a>"
            msg.action = url
        msg.save()

    return "Errors: {}".format('\n'.join(result['errors'])) if result['errors'] else result['nrrd_path']

def export_skeleton_as_nrrd(project_id, skeleton_id, source_ref, target_ref,
        user_id, mirror=True, use_http=False, omit_failures=False,
        resample_by=1e3, tangent_neighbors=5) -> Dict:
    """ Export the skeleton with the passed in ID as NRRD file using R. For
    this to work R has to be installed.

    source_ref: FAFB14
    target_ref: JFRC2, JRC2018F, JRC2018U
    """
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    nrrd_name = f"{skeleton_id}-{timestamp}.nrrd"
    nrrd_path = os.path.join(output_path, nrrd_name)
    errors = []
    try:
        rnat = importr('nat')
        rcatmaid = importr('catmaid')
        rnattemplatebrains = importr('nat.templatebrains')

        # Needed for template spaces and bridging registrations
        rflycircuit = importr('flycircuit')
        relmr = importr('elmr')
        rnatflybrains = importr('nat.flybrains')

        if settings.MAX_PARALLEL_ASYNC_WORKERS > 1:
            # Parallelise NBLASTing across 4 cores using doMC package
            rdomc = importr('doMC')
            rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)

        if getattr(settings, 'CMTK_TEMPLATE_SPACES', False):
            # Add optionally additional template space registrations

            extra_folders = ', '.join(map(lambda x: f'"{str(x)}"', settings.CMTK_TEMPLATE_SPACES))
            if extra_folders:
                extra_folders = ', ' + extra_folders
            robjects.r('''
                library(R.utils)
                setOption('nat.templatebrains.regdirs', c(getOption('nat.templatebrains.regdirs'){extra_folders}))
            '''.format(**{
                'extra_folders': extra_folders,
            }))


        object_ids = [skeleton_id]
        conn = get_catmaid_connection(user_id) if use_http else None

        logger.debug(f'Fetching {len(object_ids)} skeletons')
        # Note: scaling down to um
        objects = neuronlist_for_skeletons(project_id, object_ids, omit_failures,
                progress=False, conn=conn)
        # Transform neuron
        target_ref_tb = robjects.r(target_ref)
        xt = rnattemplatebrains.xform_brain(objects, sample=source_ref, reference=target_ref_tb)

        if mirror:
            xt = rnattemplatebrains.mirror_brain(xt, target_ref_tb)

        xdp = rnat.dotprops(xt, **{
            'k': tangent_neighbors,
            'resample': resample_by * nm_to_um,
            '.progress': 'none',
            'OmitFailures': omit_failures,
        })

        xdp.slots['regtemplate'] = rnattemplatebrains.regtemplate(xt)

        im = rnat.as_im3d(rnat.xyzmatrix(xdp), target_ref_tb)
        rnat.write_im3d(im, nrrd_path)

        if not os.path.exists(nrrd_path):
            raise ValueError("No output file created")

    except (IOError, OSError, ValueError) as e:
        errors.append(str(e))
        # Delete the file if parts of it have been written already
        if os.path.exists(nrrd_path):
            os.remove(nrrd_path)

    return {
        "errors": errors,
        "nrrd_path": nrrd_path,
        "nrrd_name": nrrd_name
    }


def test_environment() -> JsonResponse:
    """Test if all required R packages are installed to use the NBLAST API.
    """
    setup_is_ok = False
    try:
        rnat = importr('nat')
        relmr = importr('elmr')
        rnblast = importr('nat.nblast')
        rcatmaid = importr('catmaid')
        setup_is_ok = True
    except:
        setup_is_ok = False
        logger.info("""
        Please make sure the following R packages are installed to use CATMAID's
        NBLAST support. This can be done by executing the following in the R
        environment of the user running CATMAID (e.g. www-data):

        if(!require("devtools")) install.packages("devtools")
        devtools::install_github(c("natverse/nat", "natverse/nat.nblast",
                "natverse/rcatmaid", "natverse/fafbseg", "natverse/elmr",
                "natverse/nat.templatebrains", "natverse/nat.flybrains",
                "natverse/nat.jrcbrains"))

        nat.jrcbrains::download_saalfeldlab_registrations()
        nat.flybrains::download_jefferislab_registrations()

        This is required to let CATMAID compute NBLAST scores.
        """)

    return JsonResponse({
        'setup_ok': setup_is_ok,
    })


def setup_environment() -> None:
    """Install all R dependencies that are needed for NBLAST along with some
    common Drosophila template brains."""
    robjects.r("""
        install.packages("doMC")
        install.packages(c("curl", "httr", "R.utils", "git2r"))

        if(!require("devtools")) install.packages("devtools")
        devtools::install_github(c("natverse/nat", "natverse/natcpp", "natverse/nat.nblast",
                "natverse/rcatmaid", "natverse/fafbseg", "natverse/elmr",
                "natverse/nat.templatebrains", "natverse/nat.flybrains",
                "natverse/nat.jrcbrains"))

        nat.jrcbrains::download_saalfeldlab_registrations()
        nat.flybrains::download_jefferislab_registrations()
    """)


def compute_scoring_matrix(project_id, user_id, matching_sample,
        random_sample, distbreaks=NblastConfigDefaultDistanceBreaks,
        dotbreaks=NblastConfigDefaultDotBreaks, resample_step=1000,
        tangent_neighbors=5, omit_failures=True, resample_by=1e3,
        use_http=False, parallel=False) -> Dict[str, Any]:
    """Create NBLAST scoring matrix for a set of matching skeleton IDs and a set
    of random skeleton IDs. Matching skeletons are skeletons with a similar
    morphology, e.g. KCy in FAFB.

    The following R script is executed through Rpy2:

    library(catmaid)
    library(nat)
    library(nat.nblast)

    conn = catmaid_login({server_params})

    # To debug add .progress='text' to function calls

    # Get neurons
    # nb also convert from nm to um, resample to 1µm spacing and use k=5
    # nearest neighbours of each point to define tangent vector
    matching_neurons = read.neurons.catmaid({matching_ids}, conn=conn)
    nonmatching_neurons = read.neurons.catmaid({nonmatching_ids}, conn=conn)

    # Create dotprop instances and resample
    matching_neurons.dps = dotprops(matching_neurons/1e3, k={k}, resample=1)
    nonmatching_neurons.dps = dotprops(nonmatching_neurons/1e3, k={k}, resample=1)

    distbreaks = {distbreaks}
    dotbreaks = {dotbreaks}

    match.dd <- calc_dists_dotprods(matching_neurons.dps, subset=NULL,
                                   ignoreSelf=TRUE)
    # generate random set of neuron pairs of same length as the matching set
    non_matching_subset = neuron_pairs(nonmatching_neurons.dps, n=length(match.dd))
    rand.dd <- calc_dists_dotprods(nonmatching_neurons.dps, subset=NULL,
                                   ignoreSelf=TRUE)

    match.prob <- calc_prob_mat(match.dd, distbreaks=distbreaks,
                                dotprodbreaks=dotbreaks, ReturnCounts=FALSE)

    rand.prob <- calc_prob_mat(rand.dd, distbreaks=distbreaks,
                               dotprodbreaks=dotbreaks, ReturnCounts=FALSE)

    smat = calc_score_matrix(match.prob, rand.prob, logbase=2, epsilon=1e-6)

    Using:
        'server_params': ", ".join(server_params),
        'matching_ids': matching_skeleton_ids,
        'nonmatching_ids': random_skeleton_ids,
        'distbreaks': distbreaks,
        'dotbreaks': dotbreaks,
        'k': tangent_neighbors
    """
    matching_skeleton_ids = matching_sample.sample_neurons
    matching_pointset_ids = matching_sample.sample_pointsets
    random_skeleton_ids = random_sample.sample_neurons

    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    similarity = None
    matching_histogram = None
    random_histogram = None
    matching_probability = None
    random_probability = None
    errors = []
    try:
        rcatmaid = importr('catmaid')
        rnat = importr('nat')
        rnblast = importr('nat.nblast')
        Matrix = robjects.r.matrix

        conn = get_catmaid_connection(user_id) if use_http else None

        if settings.MAX_PARALLEL_ASYNC_WORKERS > 1:
            # Parallelise NBLASTing across 4 cores using doMC package
            rdomc = importr('doMC')
            rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)

        # Get neurons
        # nb also convert from nm to um, resample to 1µm spacing and use k=5
        # nearest neighbours of each point to define tangent vector
        logger.debug(f'Fetching {len(matching_skeleton_ids)} matching skeletons')

        matching_neurons = neuronlist_for_skeletons(project_id,
                matching_skeleton_ids, omit_failures, scale=nm_to_um,
                conn=conn, parallel=False)

        # Create dotprop instances and resample
        logger.debug('Computing matching skeleton stats')
        matching_neurons_dps = rnat.dotprops(matching_neurons, **{
                    'k': tangent_neighbors,
                    'resample': resample_by * nm_to_um,
                    '.progress': 'none',
                    '.parallel': parallel,
                    'OmitFailures': omit_failures,
                })

        # Get matching point sets, e.g. transformed neurons. They are combined
        # with matching neurons into one set.
        if matching_sample.sample_pointsets:
            pointsets = []
            for psid in matching_sample.sample_pointsets:
                target_pointset = PointSet.objects.get(pk=psid)
                n_points = len(target_pointset.points) / 3
                point_data = Matrix(rinterface.FloatSexpVector(target_pointset.points),
                        nrow=n_points, byrow=True)
                pointsets.append(point_data)

            pointset_objects = rnat.as_neuronlist(pointsets)
            effective_pointset_object_ids = list(map(
                    lambda x: f"pointset-{x}", matching_sample.sample_pointsets))
            pointset_objects.names = rinterface.StrSexpVector(effective_pointset_object_ids)

            logger.debug('Computing matching pointset stats')
            pointset_dps = rnat.dotprops(pointset_objects.ro * nm_to_um, **{
                        'k': tangent_neighbors,
                        'resample': resample_by * nm_to_um,
                        '.progress': 'none',
                        '.parallel': parallel,
                        'OmitFailures': omit_failures,
                    })

            # Append pointsets to list of matching dotprops
            matching_neurons_dps = robjects.r.c(matching_neurons_dps, pointset_dps)

        # Get matching point clouds. They are combined with matching neurons
        # into one cloud.
        if matching_sample.sample_pointclouds:
            pointclouds = []
            for pcid in matching_sample.sample_pointclouds:
                target_pointcloud = PointCloud.objects.prefetch_related('points').get(pk=pcid)
                points_flat = list(chain.from_iterable(
                        (p.location_x, p.location_y, p.location_z)
                        for p in target_pointcloud.points.all()))
                n_points = len(points_flat) / 3
                point_data = Matrix(rinterface.FloatSexpVector(points_flat),
                        nrow=n_points, byrow=True)
                pointclouds.append(point_data)

            pointcloud_objects = rnat.as_neuronlist(pointclouds)
            effective_pointcloud_object_ids = list(map(
                    lambda x: f"pointcloud-{x}", matching_sample.sample_pointclouds))
            pointcloud_objects.names = rinterface.StrSexpVector(effective_pointcloud_object_ids)

            logger.debug('Computing matching pointcloud stats')
            pointcloud_dps = rnat.dotprops(pointcloud_objects.ro * nm_to_um, **{
                        'k': tangent_neighbors,
                        'resample': resample_by * nm_to_um,
                        '.progress': 'none',
                        '.parallel': parallel,
                        'OmitFailures': omit_failures,
                    })

            # Append pointclouds to list of matching dotprops
            matching_neurons_dps = robjects.r.c(matching_neurons_dps, pointcloud_dps)

        # If there is subset of pairs given for the matching dorprops, convert
        # it into a list that can be understood by R.

        logger.debug(f'Fetching {len(random_skeleton_ids)} random skeletons')

        nonmatching_neurons = neuronlist_for_skeletons(project_id,
                random_skeleton_ids, omit_failures, scale=nm_to_um, conn=conn,
                parallel=parallel)

        logger.debug('Computing random skeleton stats')
        nonmatching_neurons_dps = rnat.dotprops(nonmatching_neurons, **{
                    'k': tangent_neighbors,
                    'resample': resample_by * nm_to_um,
                    '.progress': 'none',
                    '.parallel': parallel,
                    'OmitFailures': omit_failures,
                })


        # Matches are provided as subsets of objects that are similar to each
        # other (within each set). If in use, the subset parameter must be set
        # to a data.frame with two character columns query and target, that
        # define a single pair each.
        match_subset = robjects.NULL
        if matching_sample.subset:
            # Find all possible pairs in each subset
            pairs: List[Tuple[Tuple[int, str], Tuple[int, str]]] = []
            for subset in matching_sample.subset:
                # Build all possible pairs in this set
                indices = list(range(len(subset)))
                while len(indices) > 0:
                    elem_a_i = indices.pop(0)
                    for elem_b_i in indices:
                        pairs.append((subset[elem_a_i], subset[elem_b_i]))
                        # TODO: Reverse needed?

            # create query and target names
            query_names= []
            target_names = []
            for pair in pairs:
                elem_a, elem_b = pair
                elem_a_type, elem_a_key = elem_a
                elem_b_type, elem_b_key = elem_b

                if elem_a_type == 1:
                    query_name = f'pointset-{elem_a_key}'
                elif elem_a_type == 2:
                    query_name = f'pointcloud-{elem_a_key}'
                else:
                    query_name = elem_a_key

                if elem_b_type == 1:
                    target_name = f'pointset-{elem_b_key}'
                elif elem_b_type == 2:
                    target_name = f'pointcloud-{elem_b_key}'
                else:
                    target_name = elem_b_key

                query_names.append(query_name)
                target_names.append(target_name)

            logger.debug(f'Found {len(query_names)} subset pairs')
            match_subset = robjects.DataFrame({
                'query': rinterface.StrSexpVector(query_names),
                'target': rinterface.StrSexpVector(target_names),
            })

        logger.debug('Computing matching tangent information')
        match_dd = rnblast.calc_dists_dotprods(matching_neurons_dps,
                subset=match_subset, ignoreSelf=True)

        # generate random set of neuron pairs of same length as the matching set
        non_matching_subset = rnblast.neuron_pairs(nonmatching_neurons_dps, n=len(match_dd))
        logger.debug('Computing random tangent information')
        rand_dd = rnblast.calc_dists_dotprods(nonmatching_neurons_dps,
                subset=robjects.NULL, ignoreSelf=True)

        rdistbreaks = rinterface.FloatSexpVector(distbreaks)
        rdotbreaks = rinterface.FloatSexpVector(dotbreaks)

        logger.debug('Computing matching skeleton probability distribution')
        match_hist = rnblast.calc_prob_mat(match_dd, distbreaks=rdistbreaks,
                dotprodbreaks=rdotbreaks, ReturnCounts=True)

        logger.debug('Computing random skeleton probability distribution')
        rand_hist = rnblast.calc_prob_mat(rand_dd, distbreaks=rdistbreaks,
                dotprodbreaks=rdotbreaks, ReturnCounts=True)

        logger.debug('Scaling')
        match_prob = match_hist.ro / robjects.r['sum'](match_hist)
        rand_prob = rand_hist.ro / robjects.r['sum'](rand_hist)

        logger.debug('Computing scoring matrix')
        smat = rnblast.calc_score_matrix(match_prob, rand_prob, logbase=2, epsilon=1e-6)

        logger.debug('Done')

        # Get data into Python, the resulting array is in column-first order,
        # i.e. the outer array contains one array per column.
        similarity = numpy.asarray(smat).tolist()
        matching_histogram = numpy.asarray(match_hist).tolist()
        random_histogram = numpy.asarray(rand_hist).tolist()
        matching_probability = numpy.asarray(match_prob).tolist()
        random_probability = numpy.asarray(rand_prob).tolist()

    except (IOError, OSError, ValueError) as e:
        errors.append(str(e))

    return {
        "errors": errors,
        "similarity": similarity,
        "matching_histogram": matching_histogram,
        "random_histogram": random_histogram,
        "matching_probability": matching_probability,
        "random_probability": random_probability
    }


def get_cache_file_name(project_id, object_type, simplification=10) -> str:
    if object_type == 'skeleton':
        extra = f"-simple-{simplification}"
    elif object_type == 'pointcloud':
        extra = ''
    elif object_type == 'pointset':
        extra = ''
    else:
        raise ValueError(f"Unsupported object type: {object_type}")

    return "r-dps-cache-project-{project_id}-{object_type}{extra}.rda".format(**{
        'project_id': project_id,
        'object_type': object_type,
        'extra': extra,
    })


def get_cache_file_path(project_id, object_type, simplification=10):
    cache_file = get_cache_file_name(project_id, object_type, simplification)
    return os.path.join(settings.MEDIA_ROOT, settings.MEDIA_CACHE_SUBDIRECTORY, cache_file)


def get_cached_dps_data(project_id, object_type, simplification=10):
    """Return the loaded R object for cache file of a particular <object_type>
    (skeleton, pointcloud, pointset), if available. If not, None is returned.
    """
    cache_path = get_cache_file_path(project_id, object_type, simplification)
    return get_cached_dps_data_from_file(cache_path)


def get_cached_dps_data_from_file(cache_path):
    if not os.path.exists(cache_path) \
            or not os.access(cache_path, os.R_OK ) \
            or not os.path.isfile(cache_path):
        return None

    try:
        base = importr('base')
        object_dps_cache = base.readRDS(cache_path)

        return object_dps_cache
    except RRuntimeError:
        return None


def get_remote_dps_data(object_ids, host='127.0.0.1', port=34565):
    """Get DPS cache data from a remote service, running the
    catmaid_parallel_nblast_cache_server management command.
    """
    if type(object_ids) == str:
        object_ids = list(map(int, object_ids.split(',')))

    clientMultiSocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    clientMultiSocket.setblocking(False)

    logger.info('Waiting for connection response')
    addr = (host, port)
    try:
        clientMultiSocket.connect_ex(addr)
    except socket.error as e:
        logger.error(f'Socket error: {e}')

    data = pickle.dumps(object_ids)
    data_size = struct.pack('!I', len(data))
    clientMultiSocket.sendall(data_size)
    clientMultiSocket.sendall(data)

    packed_size = recvall(clientMultiSocket, struct.calcsize('!I'))
    # Decode the size and get the image data.
    size, = struct.unpack('!I', packed_size)
    logger.info(f'Expecting {size} bytes')

    data = recvall(clientMultiSocket, size)
    clientMultiSocket.shutdown(socket.SHUT_RDWR)
    clientMultiSocket.close()

    res = pickle.loads(data)
    logger.info(f'Received {len(res)} objects')

    return res

def recvall(sock, count):
    buf = b''
    while count:
        try:
            newbuf = sock.recv(count)
        except BlockingIOError:
            # Resource temporarily unavailable (errno EWOULDBLOCK)
            pass
        else:
            if not newbuf:
                raise EOFError(f'Could not receive all expected data (missing {count} bytes)!')
            buf += newbuf
            count -= len(newbuf)
    return buf


def recv_timeout(the_socket, timeout=2):
    #make socket non blocking
    the_socket.setblocking(0)

    #total data partwise in an array
    total_data=[];
    data='';

    #beginning time
    begin=time.time()
    while 1:
        #if you got some data, then break after timeout
        if total_data and time.time()-begin > timeout:
            break

        #if you got no data at all, wait a little longer, twice the timeout
        elif time.time()-begin > timeout*2:
            break

        #recv something
        try:
            data = the_socket.recv(8192)
            if data:
                total_data.append(data)
                #change the beginning time for measurement
                begin = time.time()
            else:
                #sleep for sometime to indicate a gap
                time.sleep(0.1)
        except:
            pass

    #join all parts to make final string
    return b''.join(total_data)


def combine_cache_files(cache_dir, target_cache_path):
    if not os.path.exists(cache_dir):
        logger.info(f'Can\'t access: {cache_dir}')
        return None

    try:
        cache_objects = []
        for file in os.listdir(cache_dir):
            filename = os.fsdecode(file)
            cache_path = os.path.join(cache_dir, filename)
            logger.info(f'Reading {cache_path}')
            cache_data = get_cached_dps_data_from_file(cache_path)
            if cache_data:
                cache_objects.append(cache_data)
            else:
                logger.error('Found no data')

        if cache_objects:
            base = importr('base')
            # Needed to concatenate neuronlists
            rnat = importr('nat')
            logger.info(f'Combining {len(cache_objects)} cache objects into file: {target_cache_path}')
            objects_dps = robjects.r.c(*cache_objects)
            base.saveRDS(objects_dps, **{
                'file': target_cache_path,
            })
            return objects_dps
        else:
            logger.info('Nothing to save')
            return None
    except RRuntimeError:
        return None


def get_catmaid_connection(user_id):
    token, _ = Token.objects.get_or_create(user_id=user_id)

    server_params = {
        'server': settings.CATMAID_FULL_URL,
        'token': token.key
    }

    if hasattr(settings, 'CATMAID_HTTP_AUTH_USER') and settings.CATMAID_HTTP_AUTH_USER:
        server_params['authname'] = settings.CATMAID_HTTP_AUTH_USER
        server_params['authpassword'] = settings.CATMAID_HTTP_AUTH_PASS

    rcatmaid = importr('catmaid')
    conn = rcatmaid.catmaid_login(**server_params)

    return conn


def create_dps_data_cache(project_id, object_type, tangent_neighbors=20,
        parallel=True, detail=10, omit_failures=True, min_length=15000,
        min_soma_length=1000, soma_tags=('soma'), resample_by=1e3,
        use_http=False, progress=False, max_nodes=None, bb=None,
        max_length=None, max_length_exclusive=False, update_cache=False,
        batch_length=None, cache_path=None, object_ids=None,
        skip_existing_files=True) -> None:
    """Create a new cache file for a particular project object type and
    detail level. All objects of a type in a project are prepared.
    """

    if batch_length and max_length:
        batches = list(range(min_length, max_length, batch_length))
        for nb, batch_start in enumerate(batches):
            batch_end = min(max_length, batch_start + batch_length)
            excl_end = False if (nb + 1) < len(batches) else max_length_exclusive
            logger.info(f'Batch {nb+1}/{len(batches)}: {batch_start} - {batch_end}')
            create_dps_data_cache(project_id, object_type, tangent_neighbors,
                    parallel, detail, omit_failures, batch_start,
                    min_soma_length, soma_tags, resample_by, use_http, progress,
                    max_nodes, bb, batch_end, excl_end, update_cache, None)
        return

    # A circular dependency would be the result of a top level import
    from catmaid.control.similarity import get_all_object_ids

    if not cache_path:
        cache_file = get_cache_file_name(project_id, object_type, detail)
        cache_dir = os.path.join(settings.MEDIA_ROOT, settings.MEDIA_CACHE_SUBDIRECTORY)
        if not os.path.exists(cache_dir) or not os.access(cache_dir, os.W_OK):
            raise ValueError(f"Can not access cache directory: {cache_dir}")
        cache_path = os.path.join(cache_dir, cache_file)

    if skip_existing_files and os.path.exists(cache_path):
        logger.info(f'Skipping existing {cache_path}')
        return

    if os.path.exists(cache_path) and not os.access(cache_path, os.W_OK):
        raise ValueError(f"Can not access cache file for writing: {cache_path}")
    logger.info(f'Cache file: {cache_path}')

    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")

    user = get_system_user()

    base = importr('base')
    rcatmaid = importr('catmaid')
    relmr = importr('elmr')
    rnat = importr('nat')
    Matrix = robjects.r.matrix

    if settings.MAX_PARALLEL_ASYNC_WORKERS > 1:
        # Parallelise NBLASTing across 4 cores using doMC package
        rdomc = importr('doMC')
        rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)

    if object_type == 'skeleton':
        logger.info('Finding matching skeletons')
        if not object_ids:
            object_ids = get_all_object_ids(project_id, user.id, object_type, min_length,
                    min_soma_length, soma_tags, max_nodes, bb=bb,
                    max_length=max_length, max_length_exclusive=max_length_exclusive)
        if not object_ids:
            logger.info("No skeletons found to populate cache from")
            return

        conn = get_catmaid_connection(user.id) if use_http else None

        logger.info(f'Fetching {len(object_ids)} skeletons')
        # Note: scaling down to um
        objects = neuronlist_for_skeletons(project_id, object_ids, omit_failures,
                progress=progress, scale=nm_to_um, conn=conn, parallel=parallel)

        # Simplify
        if detail > 0:
            logger.info(f'Simplifying {len(objects)} skeletons')
            simplified_objects = robjects.r.nlapply(objects, rnat.simplify_neuron, **{
                'n': detail,
                '.parallel': parallel,
                'OmitFailures': omit_failures,
            })
            # Make sure unneeded R objects are deleted
            del(objects)
            gc.collect()
            objects = simplified_objects

        logger.info(f'Computing stats for {len(objects)} skeletons')
        objects_dps = rnat.dotprops(objects, **{
                    'k': tangent_neighbors,
                    'resample': resample_by * nm_to_um,
                    '.progress': 'text' if progress else 'none',
                    '.parallel': parallel,
                    'OmitFailures': omit_failures,
                })

        del(objects)
    elif object_type == 'pointcloud':
        # The system user is superuser and should have access to all pointclouds
        if not object_ids:
            object_ids = get_all_object_ids(project_id, user.id, object_type)
        if not object_ids:
            logger.info("No pointclouds found to populate cache from")
            return
        logger.info(f'Fetching {len(object_ids)} query point clouds')
        pointclouds = []
        for pcid in object_ids:
            target_pointcloud = PointCloud.objects.prefetch_related('points').get(pk=pcid)
            points_flat = list(chain.from_iterable(
                    (p.location_x, p.location_y, p.location_z)
                    for p in target_pointcloud.points.all()))
            n_points = len(points_flat) / 3
            point_data = Matrix(rinterface.FloatSexpVector(points_flat),
                    nrow=n_points, byrow=True)
            pointclouds.append(point_data)

        objects = rnat.as_neuronlist(pointclouds)
        effective_object_ids = list(map(
                lambda x: str(x), object_ids))
        objects.names = rinterface.StrSexpVector(effective_object_ids)

        logger.info('Computing query pointcloud stats')
        objects_dps = rnat.dotprops(objects.ro * nm_to_um, **{
                    'k': tangent_neighbors,
                    'resample': resample_by * nm_to_um,
                    '.progress': 'none',
                    '.parallel': parallel,
                    'OmitFailures': omit_failures,
                })
    else:
        raise ValueError(f'Unsupported object type: {object_type}')

    # Save
    if update_cache:
        cache_data = get_cached_dps_data_from_file(cache_path)
        if cache_data:
            logger.info(f'Found existing cache data ({len(cache_data)} entries), attempting to merge cache file: {cache_path}')
            objects_dps = robjects.r.c(cache_data, objects_dps)
        else:
            logger.info(f'No existing cache data found, writing new cache file: {cache_path}')

    # Replace file
    logger.info(f'Writing {len(objects_dps)} objects to cache file: {cache_path}')
    base.saveRDS(objects_dps, **{
        'file': cache_path,
    })


def nblast(project_id, user_id, config_id, query_object_ids, target_object_ids,
        query_type='skeleton', target_type='skeleton', omit_failures=True,
        normalized='raw', use_alpha=False, remove_target_duplicates=True,
        min_length=15000, min_soma_length=1000, simplify=True, required_branches=10,
        soma_tags=('soma', ), use_cache=True, reverse=False, top_n=0,
        resample_by=1e3, use_http=False, bb=None, parallel=False,
        remote_dps_source=None, target_cache=False, skeleton_cache=None,
        pointcloud_cache=None, pointset_cache=None) -> Dict[str, Any]:
    """Create NBLAST score for forward similarity from query objects to target
    objects. Objects can either be pointclouds or skeletons, which has to be
    reflected in the respective type parameter. This is executing essentially
    the following R script:

    library(catmaid)
    library(nat.nblast)

    conn = catmaid_login({server_params})

    # Load skeletons as dotprops. If multiple neurons should be compared,
    # they should be in neuronlist format.
    query = catmaid::read.neurons.catmaid({query_skeleton_id}, conn=conn)
    target = catmaid::read.neurons.catmaid({target_skeleton_id}, conn=conn)
    query_dp = dotprops(query, resample=1, k=5)
    target_dp = dotprops(target, resample=1, k=5)
    neurons.similarity = nblast_allbyall.neuronlist(neurons.dps, smat, FALSE, 'raw')

    remote_dps_source: a (host, port) tuple.
    """
    # TODO: Break up this function
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    similarity = None
    query_object_ids_in_use = None
    target_object_ids_in_use = None
    errors = []
    try:
        config = NblastConfig.objects.get(project_id=project_id, pk=config_id)
        conn = get_catmaid_connection(config.user_id) if use_http else None

        base = importr('base')
        rnat = importr('nat')
        relmr = importr('elmr')
        rnblast = importr('nat.nblast')
        rcatmaid = importr('catmaid')
        Matrix = robjects.r.matrix

        # Indicate an all-by-all computation. This disabled <remove_target_duplicates>.
        all_by_all = not query_object_ids and not target_object_ids and \
                query_type == target_type
        if all_by_all:
            logger.info('Disabling remove_target_duplicates option due to all-by-all computation')
            remove_target_duplicates = False

        nblast_params = {}

        parallel = False
        if settings.MAX_PARALLEL_ASYNC_WORKERS > 1:
            # Parallelise NBLASTing across a defined number of cores
            rdomc = importr('doMC')
            rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)
            rdoparallel = importr('doParallel')
            rdoparallel.registerDoParallel(**{'cores': settings.MAX_PARALLEL_ASYNC_WORKERS})
            parallel = True

        nblast_params['.parallel'] = parallel

        if use_cache and not remote_dps_source:
            object_types = (query_type, target_type)
            logger.info('Looking for object cache')
            if 'skeleton' in object_types:
                if skeleton_cache:
                    logging.info('Using preloaded skeleton cache')
                else:
                    # Check if skeleton cache file with R DPS dotprops exists and
                    # load it, if available.
                    skeleton_cache = get_cached_dps_data(project_id, 'skeleton')
            if 'pointcloud' in object_types:
                if pointcloud_cache:
                    logging.info('Using preloaded pointcloud cache')
                else:
                    # Check if pointcloud cache file with R DPS dotprops exists and
                    # load it, if available.
                    pointcloud_cache = get_cached_dps_data(project_id, 'pointcloud')
            if 'pointset' in object_types:
                if pointset_cache:
                    logging.info('Using preloaded pointset cache')
                else:
                    # Check if pointcloud cache file with R DPS dotprops exists and
                    # load it, if available.
                    pointset_cache = get_cached_dps_data(project_id, 'pointset')

        cursor = connection.cursor()

        # In case either query_object_ids or target_object_ids is not given, the
        # value will be filled in with all objects of the respective type.
        from catmaid.control.similarity import get_all_object_ids
        if all_by_all:
            query_object_ids = get_all_object_ids(project_id, user_id,
                    query_type, min_length, min_soma_length, soma_tags, bb=bb)
            target_object_ids = query_object_ids
        else:
            if not query_object_ids:
                query_object_ids = get_all_object_ids(project_id, user_id,
                        query_type, min_length, min_soma_length, soma_tags, bb=bb)
            if not target_object_ids:
                if target_cache and skeleton_cache:
                    target_object_ids = list(skeleton_cache.names)
                    logger.info(f'Limiting target set to all {len(target_object_ids)} cached skeletons')
                else:
                    target_object_ids = get_all_object_ids(project_id, user_id,
                            target_type, min_length, min_soma_length, soma_tags, bb=bb)

        # If both query and target IDs are of the same type, the target list of
        # object IDs can't contain any of the query IDs.
        if query_type == target_type and remove_target_duplicates:
            target_object_ids = list(set(target_object_ids) - set(query_object_ids))

        # The query and target objects that need to be loaded
        effective_query_object_ids = query_object_ids
        effective_target_object_ids = target_object_ids

        typed_query_object_ids = query_object_ids
        typed_target_object_ids = target_object_ids

        # Query objects
        if query_type == 'skeleton':
            # Check cache, if enabled
            cache_hits = 0
            query_cache_objects_dps:Any = None
            n_query_objects = len(query_object_ids)
            if remote_dps_source and not skeleton_cache:
                logger.info(f'Using remote DPS source: {remote_dps_source}')
                query_cache_objects_dps = get_remote_dps_data(query_object_ids,
                        remote_dps_source[0], remote_dps_source[1])
                cache_typed_query_object_ids = list(base.names(query_cache_objects_dps))
                logger.info('Received data, checking for completeness')
                effective_query_object_ids = list(filter(
                        # Only allow neurons that are not part of the cache
                        lambda x: query_cache_objects_dps.rx2(str(x)) == robjects.NULL,
                        query_object_ids))
                cache_hits = n_query_objects - len(effective_query_object_ids)
            elif use_cache and skeleton_cache:
                logger.info(f'Using skeleton cache file: {get_cache_file_path(project_id, "skeleton")}')
                # Find all skeleton IDs that aren't part of the cache
                # TODO: There must be a simler way to extract non-NA values only
                query_object_id_str = rinterface.StrSexpVector(list(map(str, query_object_ids)))
                query_cache_objects_dps = skeleton_cache.rx(query_object_id_str)
                non_na_ids = list(filter(lambda x: type(x) == str,
                        list(base.names(query_cache_objects_dps))))
                cache_typed_query_object_ids = non_na_ids
                query_cache_objects_dps = rnat.subset_neuronlist(
                        query_cache_objects_dps, rinterface.StrSexpVector(non_na_ids))
                effective_query_object_ids = list(filter(
                        # Only allow neurons that are not part of the cache
                        lambda x: query_cache_objects_dps.rx2(str(x)) == robjects.NULL,
                        query_object_ids))
                cache_hits = n_query_objects - len(effective_query_object_ids)
            else:
                cache_typed_query_object_ids = []
                effective_query_object_ids = query_object_ids

            logger.info(f'Fetching {len(effective_query_object_ids)} query skeletons ({cache_hits} cache hits)')
            if effective_query_object_ids:
                logger.info(f'Example IDs to fetch: {effective_query_object_ids[:3]}')
                query_objects = neuronlist_for_skeletons(project_id,
                        effective_query_object_ids, omit_failures,
                        scale=nm_to_um, conn=conn, parallel=parallel)

                if simplify:
                    logger.info(f"Simplifying fetched query neurons, removing parts below branch level {required_branches}")
                    query_objects = robjects.r.nlapply(query_objects,
                            rnat.simplify_neuron, **{
                                'n': required_branches,
                                'OmitFailures': omit_failures,
                                '.parallel': parallel,
                            })
                logger.info(f'Computing fetched query skeleton stats, resampling and using {config.tangent_neighbors} neighbors for tangents')
                query_dps = rnat.dotprops(query_objects, **{
                            'k': config.tangent_neighbors,
                            'resample': resample_by * nm_to_um,
                            '.progress': 'none',
                            '.parallel': parallel,
                            'OmitFailures': omit_failures,
                        })
                non_cache_typed_query_object_ids = list(base.names(query_dps)) if query_dps else []
            else:
                query_dps = []
                non_cache_typed_query_object_ids = []

            # If we found cached items before, use them to complete the query
            # objects.
            if (use_cache or remote_dps_source) and cache_typed_query_object_ids:
                if len(query_dps) > 0:
                    query_dps = robjects.r.c(query_dps, query_cache_objects_dps)
                    typed_query_object_ids = non_cache_typed_query_object_ids + \
                            cache_typed_query_object_ids
                else:
                    query_dps = query_cache_objects_dps
        elif query_type == 'pointcloud':
            typed_query_object_ids = list(map(
                    lambda x: f"pointcloud-{x}", query_object_ids))
            # Check cache, if enabled
            cache_hits = 0
            query_cache_objects_dps = None
            n_query_objects = len(query_object_ids)
            if use_cache and pointset_cache:
                # Find all skeleton IDs that aren't part of the cache
                # TODO: There must be a simler way to extract non-NA values only
                query_object_id_str = rinterface.StrSexpVector(list(map(str, query_object_ids)))
                query_cache_objects_dps = pointcloud_cache.rx(query_object_id_str) # type: ignore # not provable that cache will be initialised
                non_na_ids = list(filter(lambda x: type(x) == str,
                        list(base.names(query_cache_objects_dps))))
                query_cache_objects_dps = rnat.subset_neuronlist(
                        query_cache_objects_dps, rinterface.StrSexpVector(non_na_ids))
                cache_typed_query_object_ids = list(map(
                        lambda x: f"pointcloud-{x}",
                        list(base.names(query_cache_objects_dps))))
                effective_query_object_ids = list(filter(
                        # Only allow neurons that are not part of the cache
                        lambda x: query_cache_objects_dps.rx2(str(x)) == robjects.NULL,
                        query_object_ids))
                query_cache_objects_dps.names = rinterface.StrSexpVector(cache_typed_query_object_ids)
                cache_hits = n_query_objects - len(effective_query_object_ids)
            else:
                cache_typed_query_object_ids = []
                effective_query_object_ids = query_object_ids

            logger.info(f'Fetching {len(effective_query_object_ids)} query point clouds ({cache_hits} cache hits)')
            logger.info(f'Example IDs to fetch: {effective_query_object_ids[:3]}')
            if effective_query_object_ids:
                pointclouds = []
                for pcid in effective_query_object_ids:
                    target_pointcloud = PointCloud.objects.prefetch_related('points').get(pk=pcid)
                    points_flat = list(chain.from_iterable(
                            (p.location_x, p.location_y, p.location_z)
                            for p in target_pointcloud.points.all()))
                    n_points = len(points_flat) / 3
                    point_data = Matrix(rinterface.FloatSexpVector(points_flat),
                            nrow=n_points, byrow=True)
                    pointclouds.append(point_data)

                query_objects = rnat.as_neuronlist(pointclouds)
                non_cache_typed_query_object_ids = list(map(
                        lambda x: f"pointcloud-{x}", effective_query_object_ids))
                query_objects.names = rinterface.StrSexpVector(non_cache_typed_query_object_ids)

                logger.info('Computing query pointcloud stats')
                query_dps = rnat.dotprops(query_objects.ro * nm_to_um, **{
                            'k': config.tangent_neighbors,
                            'resample': resample_by * nm_to_um,
                            '.progress': 'none',
                            '.parallel': parallel,
                            'OmitFailures': omit_failures,
                        })
                non_cache_typed_query_object_ids = list(base.names(query_dps)) if query_dps else []
            else:
                non_cache_typed_query_object_ids = []
                query_dps = []

            # If we found cached items before, use them to complete the query
            # objects.
            if use_cache and cache_typed_query_object_ids:
                if len(query_dps) > 0:
                    query_dps = robjects.r.c(query_dps, query_cache_objects_dps)
                    typed_query_object_ids = non_cache_typed_query_object_ids + \
                            cache_typed_query_object_ids
                else:
                    query_dps = query_cache_objects_dps

        elif query_type == 'pointset':
            typed_query_object_ids = list(map(
                    lambda x: f"pointset-{x}", query_object_ids))
            # Check cache, if enabled
            if use_cache and pointset_cache:
                pass

            logger.info(f'Fetching {len(query_object_ids)} query point sets')
            pointsets = []
            for psid in query_object_ids:
                target_pointset = PointSet.objects.get(pk=psid)
                n_points = len(target_pointset.points) / 3
                point_data = Matrix(rinterface.FloatSexpVector(target_pointset.points),
                        nrow=n_points, byrow=True)
                pointsets.append(point_data)

            query_objects = rnat.as_neuronlist(pointsets)
            effective_query_object_ids = typed_query_object_ids
            query_objects.names = rinterface.StrSexpVector(effective_query_object_ids)

            logger.info('Computing query pointset stats')
            query_dps = rnat.dotprops(query_objects.ro * nm_to_um, **{
                        'k': config.tangent_neighbors,
                        'resample': resample_by * nm_to_um,
                        '.progress': 'none',
                        '.parallel': parallel,
                        'OmitFailures': omit_failures,
                    })
            typed_query_object_ids = list(base.names(query_dps))
        else:
            raise ValueError(f"Unknown query type: {query_type}")

        # Target objects, only needed if no all-by-all computation is done
        if all_by_all:
            logger.info('All-by-all computation: using query objects and dps for target')
            target_dps = query_dps
        else:
            if target_type == 'skeleton':
                # Check cache, if enabled
                cache_hits = 0
                target_cache_objects_dps:Any = None
                n_target_objects = len(target_object_ids)
                if remote_dps_source and not skeleton_cache:
                    logger.info(f'Using remote DPS source: {remote_dps_source}')
                    target_cache_objects_dps = get_remote_dps_data(target_object_ids,
                            remote_dps_source[0], remote_dps_source[1])
                    cache_typed_target_object_ids = list(base.names(target_cache_objects_dps))
                    effective_target_object_ids = list(filter(
                            # Only allow neurons that are not part of the cache
                            lambda x: target_cache_objects_dps.rx2(str(x)) == robjects.NULL,
                            target_object_ids))
                    cache_hits = n_target_objects - len(effective_target_object_ids)
                elif use_cache and skeleton_cache:
                    if target_cache:
                        cache_typed_target_object_ids = target_object_ids
                        effective_target_object_ids = []
                        cache_hits = n_target_objects
                        target_dps = skeleton_cache
                        non_cache_typed_target_object_ids = list(base.names(target_dps))
                    else:
                        # Find all skeleton IDs that aren't part of the cache
                        # TODO: There must be a simler way to extract non-NA values only
                        target_object_id_str = rinterface.StrSexpVector(list(map(str, target_object_ids)))
                        target_cache_objects_dps = skeleton_cache.rx(target_object_id_str)
                        non_na_ids = list(filter(lambda x: type(x) == str,
                                list(base.names(target_cache_objects_dps))))
                        cache_typed_target_object_ids = non_na_ids
                        target_cache_objects_dps = rnat.subset_neuronlist(
                                target_cache_objects_dps, rinterface.StrSexpVector(non_na_ids))
                        effective_target_object_ids = list(filter(
                                # Only allow neurons that are not part of the cache
                                lambda x: target_cache_objects_dps.rx2(str(x)) == robjects.NULL,
                                target_object_ids))
                        cache_hits = n_target_objects - len(effective_target_object_ids)
                else:
                    cache_typed_target_object_ids = []
                    effective_target_object_ids = target_object_ids

                logger.info(f'Fetching {len(effective_target_object_ids)} target skeletons ({cache_hits} cache hits)')
                logger.info(f'Example IDs to fetch: {effective_target_object_ids[:3]}')
                if effective_target_object_ids:
                    target_objects = neuronlist_for_skeletons(project_id,
                            effective_target_object_ids, omit_failures,
                            scale=nm_to_um, conn=conn, parallel=parallel)

                    if simplify:
                        logger.info(f"Simplifying fetched target neurons, removing parts below branch level {required_branches}")
                        target_objects = robjects.r.nlapply(target_objects,
                                rnat.simplify_neuron, **{
                                    'n': required_branches,
                                    'OmitFailures': omit_failures,
                                    '.parallel': parallel,
                                })

                    logger.info('Computing fetched target skeleton stats')
                    target_dps = rnat.dotprops(target_objects, **{
                                'k': config.tangent_neighbors,
                                'resample': resample_by * nm_to_um,
                                '.progress': 'none',
                                '.parallel': parallel,
                                'OmitFailures': omit_failures,
                            })
                    non_cache_typed_target_object_ids = list(base.names(target_dps)) if target_dps else []
                elif not target_cache:
                    target_dps = []
                    non_cache_typed_target_object_ids = []

                # If we found cached items before, use them to complete the target
                # objects.
                if (use_cache or remote_dps_source) and \
                        cache_typed_target_object_ids and target_cache_objects_dps:
                    if len(target_dps) > 0:
                        target_dps = robjects.r.c(target_dps, target_cache_objects_dps)
                        typed_target_object_ids = non_cache_typed_target_object_ids + \
                                cache_typed_target_object_ids
                    else:
                        target_dps = target_cache_objects_dps
            elif target_type == 'pointcloud':
                typed_target_object_ids = list(map(
                        lambda x: f"pointcloud-{x}", target_object_ids))
                # Check cache, if enabled
                cache_hits = 0
                target_cache_objects_dps = None
                n_target_objects = len(target_object_ids)
                if use_cache and skeleton_cache:
                    # Find all point cloud IDs that aren't part of the cache
                    # TODO: There must be a simler way to extract non-NA values only
                    target_object_id_str = rinterface.StrSexpVector(list(map(str, target_object_ids)))
                    target_cache_objects_dps = pointcloud_cache.rx(target_object_id_str) # type: ignore
                    non_na_ids = list(filter(lambda x: type(x) == str,
                            list(base.names(target_cache_objects_dps))))
                    target_cache_objects_dps = rnat.subset_neuronlist(
                            target_cache_objects_dps, rinterface.StrSexpVector(non_na_ids))
                    cache_typed_target_object_ids = list(map(
                            lambda x: f"pointcloud-{x}",
                            list(base.names(target_cache_objects_dps))))
                    effective_target_object_ids = list(filter(
                            # Only allow neurons that are not part of the cache
                            lambda x: target_cache_objects_dps.rx2(str(x)) == robjects.NULL,
                            target_object_ids))
                    target_cache_objects_dps.names = rinterface.StrSexpVector(cache_typed_target_object_ids)
                    cache_hits = n_target_objects - len(effective_target_object_ids)
                else:
                    cache_typed_target_object_ids = []
                    effective_target_object_ids = target_object_ids

                logger.info(f'Fetching {len(effective_target_object_ids)} target point clouds ({cache_hits} cache hits)')
                logger.info(f'Example IDs to fetch: {effective_target_object_ids[:3]}')
                if effective_target_object_ids:
                    pointclouds = []
                    for pcid in effective_target_object_ids:
                        target_pointcloud = PointCloud.objects.prefetch_related('points').get(pk=pcid)
                        points_flat = list(chain.from_iterable(
                                (p.location_x, p.location_y, p.location_z)
                                for p in target_pointcloud.points.all()))
                        n_points = len(points_flat) / 3
                        point_data = Matrix(rinterface.FloatSexpVector(points_flat),
                                nrow=n_points, byrow=True)
                        pointclouds.append(point_data)

                    target_objects = rnat.as_neuronlist(pointclouds)
                    non_cache_typed_target_object_ids = list(map(
                            lambda x: f"pointcloud-{x}", effective_target_object_ids))
                    target_objects.names = rinterface.StrSexpVector(non_cache_typed_target_object_ids)

                    logger.info('Computing target pointcloud stats')
                    target_dps = rnat.dotprops(target_objects.ro * nm_to_um, **{
                                'k': config.tangent_neighbors,
                                'resample': resample_by * nm_to_um,
                                '.progress': 'none',
                                '.parallel': parallel,
                                'OmitFailures': omit_failures,
                            })
                    non_cache_typed_target_object_ids = list(base.names(target_dps)) if target_dps else []
                else:
                    non_cache_typed_target_object_ids = []
                    target_dps = []

                # If we found cached items before, use them to complete the target
                # objects.
                if use_cache and cache_typed_target_object_ids:
                    if len(target_dps) > 0:
                        target_dps = robjects.r.c(target_dps, target_cache_objects_dps)
                        typed_target_object_ids = non_cache_typed_target_object_ids + \
                                cache_typed_target_object_ids
                    else:
                        target_dps = target_cache_objects_dps
                        typed_target_object_ids = cache_typed_target_object_ids
            elif target_type == 'pointset':
                typed_target_object_ids = list(map(
                        lambda x: f"pointset-{x}", target_object_ids))
                logger.info(f'Fetching {len(target_object_ids)} target point sets')
                pointsets = []
                for psid in target_object_ids:
                    target_pointset = PointSet.objects.get(pk=psid)
                    n_points = len(target_pointset.points) / 3
                    point_data = Matrix(rinterface.FloatSexpVector(target_pointset.points),
                            nrow=n_points, byrow=True)
                    pointsets.append(point_data)

                target_objects = rnat.as_neuronlist(pointsets)
                target_objects.names = rinterface.StrSexpVector(typed_target_object_ids)

                logger.info('Computing target pointset stats')
                target_dps = rnat.dotprops(target_objects.ro * nm_to_um, **{
                            'k': config.tangent_neighbors,
                            'resample': resample_by * nm_to_um,
                            '.progress': 'none',
                            '.parallel': parallel,
                            'OmitFailures': omit_failures,
                        })
                typed_target_object_ids = list(base.names(target_dps))
            else:
                raise ValueError(f"Unknown target type: {target_type}")

        if len(query_dps) == 0:
            raise ValueError("No valid query objects found")

        if len(target_dps) == 0:
            raise ValueError("No valid target objects found")

        # Make sure unneeded R objects are deleted
        if skeleton_cache:
            del(skeleton_cache)
        if pointcloud_cache:
            del(pointcloud_cache)
        if pointset_cache:
            del(pointset_cache)
        gc.collect()

        # Restore R matrix for use with nat.nblast.
        cells = list(chain.from_iterable(config.scoring))
        dist_bins = len(config.distance_breaks) - 1
        smat = Matrix(rinterface.FloatSexpVector(cells), nrow=dist_bins, byrow=True)

        # Set relevant attributes on similarity matrix. The nat.nblast code
        # expects this.
        rdistbreaks = rinterface.FloatSexpVector(config.distance_breaks)
        rdotbreaks = rinterface.FloatSexpVector(config.dot_breaks)
        smat.do_slot_assign('distbreaks', rdistbreaks)
        smat.do_slot_assign('dotprodbreaks', rdotbreaks)

        logger.info('Computing score (alpha: {a}, noramlized: {n}, reverse: {r}, top N: {tn})'.format(**{
            'a': 'Yes' if use_alpha else 'No',
            'n': 'No' if normalized == 'raw' else f'Yes ({normalized})',
            'r': 'Yes' if reverse else 'No',
            'tn': top_n if top_n else '-',
        }))

        # Use defaults also used in nat.nblast.
        nblast_params['smat'] = smat
        nblast_params['NNDistFun'] = rnblast.lodsby2dhist
        nblast_params['UseAlpha'] = use_alpha
        nblast_params['normalised'] = normalized != 'raw'

        # Will store the result scores
        similarity = None

        if not reverse:
            a, b = query_dps, target_dps
            a_ids, b_ids = typed_query_object_ids, typed_target_object_ids
        else:
            a, b = target_dps, query_dps
            a_ids, b_ids = typed_target_object_ids, typed_query_object_ids

        # Only select a subset if there are more items than the limit in either
        # of the dimensions.
        if top_n and len(b_ids) > top_n:
            logger.info(f'top n {top_n}')
            # Compute forward scores, either unnormalized or normalized so that a
            # self-match is 1.
            scores = as_matrix(rnblast.NeuriteBlast(a, b, **nblast_params), a, b)

            # For each query object, compute the reverse score for the top N
            # forward scores.
            target_scores = None
            for n, query_object_dps in enumerate(query_dps):
                query_name = query_dps.names[n]
                logger.info(f'Query object {n+1}/{len(query_dps)}: {query_name}')
                query_object_dps = rnat.subset_neuronlist(query_dps,
                        rinterface.StrSexpVector([query_name]))

                # Have to convert to dataframe to sort them -> using
                # 'robjects.r("sort")' looses the names for some reason
                scores_df = pd.DataFrame([[scores.rownames[i],
                    # Extracted matrix values are a single element array.
                    scores.rx(scores.rownames[i], query_name)[0]] \
                        for i in range(len(scores))], columns=['name', 'score'])

                # We are interested only in the top N names
                scores_df.sort_values('score', ascending=False, inplace=True)

                eff_top_n = min(top_n, len(scores_df))
                top_n_names_names = scores_df.name.tolist()[:top_n]

                # Index the sorted forward scores by name and remove name column.
                scores_df.set_index('name', inplace=True, drop=True)

                # For mean normalization, the regular forward score is averaged
                # with the reverse score.
                if normalized in ('mean', 'geometric-mean'):
                    # Compute reverse scores for top N forward matches of
                    # current query object.
                    reverse_query_dps = b.rx(rinterface.StrSexpVector(top_n_names_names))
                    reverse_scores = as_matrix(rnblast.NeuriteBlast(reverse_query_dps,
                            query_object_dps, **nblast_params),
                            reverse_query_dps, query_object_dps, transposed=True)

                    # Get top N mean scores for input query as a row of the
                    # target table format (scores for single query object form a
                    # row).  We can't sort these results, because they are
                    # merged with other query object results.
                    if normalized == 'mean':
                        # Mean score: (forward score + reverse score) / 2
                        score = [(scores_df.loc[reverse_scores.rownames[i]].score + reverse_scores[i]) / 2 \
                                for i in range(len(reverse_scores))]
                    else:
                        # Geometric mean score: sqrt(forward score * reverse
                        # score). Set scores below zero to zero to not make
                        # negative forward and backward values become positive
                        # in the multiplication.
                        score = [math.sqrt(
                                max(0, scores_df.loc[reverse_scores.rownames[i]].score) * \
                                max(0, reverse_scores[i])) \
                                for i in range(len(reverse_scores))]

                    result_row = pd.DataFrame([scores], index=[query_name],
                        columns=list(reverse_scores.rownames))
                else:
                    # Get top N forward scores for input query as a row of the
                    # target table format (scores for single query object form a
                    # row).
                    result_row = pd.DataFrame(
                        [
                            # Forward score:
                            [scores_df.loc[name].score for name in top_n_names_names]
                        ],
                        index=[query_name],
                        columns=list(top_n_names_names),
                    )

                # Collect top N scores for each query object and store them
                # in new pandas table that contains the target columns of
                # both the existing query objects and the new one. Existing
                # columns are set to NaN.
                if target_scores is None:
                    target_scores = result_row
                else:
                    target_scores = target_scores.concat(result_row)

            scores = target_scores

            # Scores are returned with query skeletons as columns, but we want them
            # as rows, because it matches our expected queries more. Therefore
            # we have to transpose it using the 't()' R function. This isn't
            # needed for reverse queries.
            similarity = target_scores.to_numpy() # type: ignore # mypy cannot prove this won't still be None

            column_names = list(target_scores.columns.values) # type: ignore # same as above
            row_names = list(target_scores.index.values) # type: ignore # same as above

        else:
            if normalized in ('mean', 'geometric-mean'):
                # Compute forward scores, either unnormalized or normalized so that a
                # self-match is 1.
                aa = rnblast.NeuriteBlast(a, b, **nblast_params)
                bb = rnblast.NeuriteBlast(b, a, **nblast_params)

                forward_scores = as_matrix(aa, a, b)
                reverse_scores = as_matrix(bb, b, a)

                # Compute mean
                if normalized == 'mean':
                    scores = (forward_scores.ro + reverse_scores.transpose()).ro / 2.0
                else:
                    # Clamp negative scores to zero and compute geometric mean.
                    robjects.r('''
                        geometric_mean <- function(a, b) {
                            b <- t(b)
                            a[a < 0] <- 0
                            b[b < 0] <- 0
                            sqrt(a * b)
                        }
                    ''')
                    geometric_mean = rinterface.globalenv['geometric_mean']
                    scores = as_matrix(geometric_mean(forward_scores,
                        reverse_scores), a, b)
            else:
                # Compute forward scores, either unnormalized or normalized so that a
                # self-match is 1.
                scores = as_matrix(rnblast.NeuriteBlast(a, b, **nblast_params), a, b)

            # Scores are returned with query skeletons as columns, but we want them
            # as rows, because it matches our expected queries more. Therefore
            # we have to transpose it using the 't()' R function. This isn't
            # needed for reverse queries.
            if not reverse:
                row_first_scores = robjects.r['t'](scores)
                row_names, column_names = scores.colnames, scores.rownames
            else:
                row_first_scores = scores
                row_names, column_names = scores.rownames, scores.colnames

            similarity = numpy.asarray(row_first_scores, dtype=numpy.float32)

        # We expect a result at this point
        if similarity is None:
            raise ValueError("Could not compute similarity")

        # Collect IDs of query and target objects effectively in use.
        if query_type == 'skeleton':
            query_object_ids_in_use = list(map(int, row_names))
        elif query_type == 'pointcloud':
            query_object_ids_in_use = list(map(lambda x: int(x.lstrip('pointcloud-')), row_names))
        elif query_type == 'pointset':
            query_object_ids_in_use = list(map(lambda x: int(x.lstrip('pointset-')), row_names))

        if target_type == 'skeleton':
            target_object_ids_in_use = list(map(int, column_names))
        elif target_type == 'pointcloud':
            target_object_ids_in_use = list(map(lambda x: int(x.lstrip('pointcloud-')), column_names))
        elif target_type == 'pointset':
            target_object_ids_in_use = list(map(lambda x: int(x.lstrip('pointset-')), column_names))

        logger.info('NBLAST computation done')

    except (IOError, OSError, ValueError) as e:
        logger.exception(e)
        errors.append(str(e))

    return {
        "errors": errors,
        "similarity": similarity,
        "query_object_ids": query_object_ids_in_use,
        "target_object_ids": target_object_ids_in_use,
    }

def as_matrix(scores, a, b, transposed=False):
    score_type = type(scores)

    if score_type in (robjects.vectors.Matrix, robjects.vectors.FloatMatrix):
        return scores

    base = importr('base')

    if transposed:
        a, b = b, a

    if score_type in (rinterface.FloatSexpVector,
            robjects.vectors.FloatVector):
        return robjects.r.matrix(scores, **{
            # We expect <a> to be the column vector and <b> to be the row vector.
            'ncol': len(base.names(a)),
            'nrow': len(base.names(b)),
            # The first dimnames element are rows, the second are columns.
            'dimnames': robjects.r('list')(base.names(b), base.names(a)),
        })

    raise ValueError(f"Can't convert to matrix, unknown type: {score_type}")


def neuronlist_for_skeletons(project_id, skeleton_ids, omit_failures=False,
        scale=None, conn=None, progress=False, parallel=False):
    """Get the R dotprops data structure for a set of skeleton IDs.
    If <conn> is true, those skeletons will be requested through HTTP.
    """

    if conn:
        rcatmaid = importr('catmaid')
        objects = rcatmaid.read_neurons_catmaid(rinterface.IntSexpVector(skeleton_ids), **{
            'conn': conn,
            '.progress': 'text' if progress else 'none',
            'OmitFailures': omit_failures,
        })

        return objects * scale if scale else objects

    read_neuron_local = robjects.r('''
        somapos.catmaidneuron <- function(x, swc=x$d, tags=x$tags, skid=NULL, ...) {
          # Find soma position, based on plausible tags
          soma_tags<-grep("(cell body|soma)", ignore.case = T, names(tags), value = T)
          # soma is the preferred tag - use this for preference if it exists
          if(any(soma_tags=="soma")) soma_tags="soma"
          soma_id=unlist(unique(tags[soma_tags]))
          soma_id_in_neuron=intersect(soma_id, swc$PointNo)

          soma_d=swc[match(soma_id_in_neuron,swc$PointNo),,drop=FALSE]
          if(length(soma_id_in_neuron)>1) {
            if(sum(soma_d$Parent<0) == 1 ) {
              # just one end point is tagged as soma, so go with that
              soma_d[soma_d$Parent<0,, drop=FALSE]
            } else {
              warning("Ambiguous points tagged as soma in neuron: ",skid,". Using first")
              soma_d[1,, drop=FALSE]
            }
          } else soma_d
        }

        list2df<-function(x, cols, use.col.names=F, return_empty_df=FALSE, ...) {
          if(!length(x)) {
            return(if(return_empty_df){
              as.data.frame(structure(replicate(length(cols), logical(0)), .Names=cols))
            } else NULL)
          }
          l=list()
          for(i in seq_along(cols)) {
            colidx=if(use.col.names) cols[i] else i
            raw_col = sapply(x, "[[", colidx)
            if(is.list(raw_col)) {
              raw_col[sapply(raw_col, is.null)]=NA
              raw_col=unlist(raw_col)
            }
            l[[cols[i]]]=raw_col
          }
          as.data.frame(l, ...)
        }

        catmaid_get_compact_skeleton_local<-function(skid, pid=1L, connectors = TRUE, tags = TRUE, raw=FALSE, ...) {
          path=file.path("", pid, skid, ifelse(connectors, 1L, 0L), ifelse(tags, 1L, 0L), "compact-skeleton")
          skel=catmaid_fetch(path, ...)
          if(is.character(skel[[1]]) && isTRUE(skel[[1]]=="Exception"))
            stop("No valid neuron returned for skid: ",skid)
          names(skel)=c("nodes", "connectors", "tags")

          if(raw) return(skel)
          # else process the skeleton
          if(length(skel$nodes))
            skel$nodes=list2df(skel$nodes,
                             cols=c("id", "parent_id", "user_id", "x","y", "z", "radius", "confidence"))

          if(length(skel$connectors))
            skel$connectors=list2df(skel$connectors,
                                    cols=c("treenode_id", "connector_id", "prepost", "x", "y", "z"))
          # change tags from list of lists to list of vectors
          skel$tags=sapply(skel$tags, function(x) sort(unlist(x)), simplify = FALSE)
          skel
        }

        #read.neurons.catmaid_local<-function(skids, sk_data, pid=1L, OmitFailures=NA, df=NULL,
        #                               fetch.annotations=FALSE, ...) {
        #  # Assume <skids> is list of integers
        #  if(is.null(df)) {
        #    names(skids)=as.character(skids)
        #   df=data.frame(pid=pid, skid=skids,
        #                 # We don't need full names, otherwise use:
        #                 # name=catmaid_get_neuronnames(skids, pid),
        #                 name=names(skids),
        #                 stringsAsFactors = F)
        #   rownames(df)=names(skids)
        # } else {
        #   names(skids)=rownames(df)
        # }
        # fakenl=nat::as.neuronlist(as.list(skids), df=df)
        # nl <- nat::nlapply(fakenl, read.neuron.catmaid_local, sk_data=sk_data, pid=pid, OmitFailures=OmitFailures, ...)
        # nl
        #}

        read.neuron.catmaid_local<-function(skid, sk_data, pid=1L, ...) {
          #res=catmaid_get_compact_skeleton_local(pid=pid, skid=skid, ...)
          res=sk_data[[toString(skid)]]
          nodes = res$nodes
          tags = res$tags
          if(!length(res$nodes)) stop("no valid nodes for skid:", skid)
          swc=with(nodes,
                   data.frame(PointNo=id, Label=0, X=x, Y=y, Z=z, W=radius*2, Parent=parent_id)
          )
          swc$Parent[is.na(swc$Parent)]=-1L
          sp=somapos.catmaidneuron(swc=swc, tags=tags)
          soma_id_in_neuron = if(nrow(sp)==0) NULL else sp$PointNo
          n=nat::as.neuron(swc, origin=soma_id_in_neuron, skid=skid)

          # add all fields from input list except for nodes themselves
          n[names(res[-1])]=res[-1]
          # we expect connectors field to be null when there are no connectors
          if(length(n$connectors)<1) n$connectors=NULL
          class(n)=c('catmaidneuron', 'neuron')
          n
        }
    ''')

    concat_neurons_local = robjects.r('''
        get.neuron.catmaid_local<-function(skid, sk_data, pid=1L, ...) {
          n=sk_data[[toString(skid)]]
          n
        }

        concat.neurons.catmaid_local<-function(skids, sk_data, pid=1L, OmitFailures=NA, df=NULL,
                                       fetch.annotations=FALSE, ...) {
          # Assume <skids> is list of integers
          if(is.null(df)) {
            names(skids)=as.character(skids)
            df=data.frame(pid=pid, skid=skids,
                          # We don't need full names, otherwise use:
                          # name=catmaid_get_neuronnames(skids, pid),
                          name=names(skids),
                          stringsAsFactors = F)
            rownames(df)=names(skids)
          } else {
            names(skids)=rownames(df)
          }
          fakenl=nat::as.neuronlist(as.list(skids), df=df)
          nl <- nat::nlapply(fakenl, get.neuron.catmaid_local, sk_data=sk_data, pid=pid, OmitFailures=OmitFailures, ...)
          nl
        }
    ''')

    if progress:
        bar = tqdm(total=len(skeleton_ids))
        def update(x):
            bar.update(1)
    else:
        bar = None
        def update(x):
            pass

    if parallel:
        manager = multiprocessing.Manager()
        shared_cs_r = manager.dict()

        def err(e):
            logger.error(e)

        pool = multiprocessing.Pool(processes=settings.NBLAST_OBJECT_LOAD_WORKERS)
        for ni, skeleton_id in enumerate(skeleton_ids):
            pool.apply_async(load_skeleton, args=(project_id, skeleton_id,
                    scale, omit_failures, False, None, ni, shared_cs_r,
                    read_neuron_local, parallel), callback=update,
                    error_callback=err)
        pool.close()
        pool.join()

        cs_r = dict(shared_cs_r)
    else:
        cs_r = dict()
        for ni, skeleton_id in enumerate(skeleton_ids):
            load_skeleton(project_id, skeleton_id, scale, omit_failures,
                    progress, bar, ni, cs_r, read_neuron_local, parallel)

    if progress and bar:
        bar.close()

    logger.info('Creating combined neuronlist')
    objects = concat_neurons_local(
            rinterface.IntSexpVector(skeleton_ids),
            robjects.ListVector(cs_r), **{
                'pid': project_id,
                '.progress': 'text' if progress else 'none',
                'OmitFailures': omit_failures,
                '.parallel': parallel,
            })

    logger.info('Freeing memory')
    del(cs_r)
    gc.collect()

    logger.info(f"Loaded {len(objects)}/{len(skeleton_ids)} neurons")

    return objects


def create_connection(alias=DEFAULT_DB_ALIAS):
    connections.ensure_defaults(alias)
    connections.prepare_test_settings(alias)
    db = connections.databases[alias]
    backend = load_backend(db['ENGINE'])
    return backend.DatabaseWrapper(db, alias)


def load_skeleton(project_id, skeleton_id, scale, omit_failures, progress, bar,
        ni, cs_r, read_neuron_local, parallel=False):
    from catmaid.control.skeletonexport import _compact_skeleton
    try:
        conn = create_connection() if parallel else None
        cs = _compact_skeleton(project_id, skeleton_id,
                with_connectors=True, with_tags=True, scale=scale, conn=conn)
    except Exception as e:
        if not omit_failures:
            raise
        logger.error(f'Error loading skeleton {skeleton_id}')
        logger.error(e)
        return
    finally:
        if conn:
            conn.close()

    if progress and bar:
        bar.update(1)

    raw_nodes = cs[0]
    raw_connectors = cs[1]
    raw_tags = cs[2]

    # Require at least two nodes
    if len(raw_nodes) < 2:
        if omit_failures:
            return
        raise ValueError(f"Skeleton {skeleton_id} has less than two nodes")

    # Nodes in Rpy2 format
    node_cols = [
            ('id', rinterface.IntSexpVector, robjects.NA_Integer),
            ('parent_id', rinterface.IntSexpVector, robjects.NA_Integer),
            ('user_id', rinterface.IntSexpVector, robjects.NA_Integer),
            ('x', rinterface.FloatSexpVector, robjects.NA_Real),
            ('y', rinterface.FloatSexpVector, robjects.NA_Real),
            ('z', rinterface.FloatSexpVector, robjects.NA_Real),
            ('radius', rinterface.FloatSexpVector, robjects.NA_Real),
            ('confidence', rinterface.IntSexpVector, robjects.NA_Integer)
    ]
    nodes:List = [(k,[]) for k,_,_ in node_cols]
    for rn in raw_nodes:
        for n, kv in enumerate(node_cols):
            val = rn[n]
            if val is None:
                val = kv[2]
            nodes[n][1].append(val)
    r_nodes = [(kv[0], node_cols[n][1](kv[1])) for n, kv in enumerate(nodes)]

    # Connectors in Rpy2 format
    connector_cols = [
            ('treenode_id', rinterface.IntSexpVector, robjects.NA_Integer),
            ('connector_id', rinterface.IntSexpVector, robjects.NA_Integer),
            ('prepost', rinterface.IntSexpVector, robjects.NA_Integer),
            ('x', rinterface.FloatSexpVector, robjects.NA_Real),
            ('y', rinterface.FloatSexpVector, robjects.NA_Real),
            ('z', rinterface.FloatSexpVector, robjects.NA_Real)
    ]
    connectors:List = [(k,[]) for k,_,_ in connector_cols]
    for rn in raw_connectors:
        for n, kv in enumerate(connector_cols):
            val = rn[n]
            if val is None:
                val = kv[2]
            connectors[n][1].append(val)
    r_connectors = [
        (kv[0], connector_cols[n][1](kv[1])) for n, kv in enumerate(connectors)
    ]

    # Tags in Rpy2 format
    r_tags = {}
    for tag, node_ids in raw_tags.items():
        r_tags[tag] = rinterface.IntSexpVector(node_ids)

    # Construct output similar to rcatmaid's request response parsing function.
    skeleton_data = robjects.ListVector({
            'nodes': robjects.DataFrame(rlc.OrdDict(r_nodes)),
            'connectors': robjects.DataFrame(rlc.OrdDict(r_connectors)),
            'tags': robjects.ListVector(r_tags),
    })

    skeleton_envelope = {}
    skeleton_envelope[str(skeleton_id)] = skeleton_data
    cs_r[str(skeleton_id)] = read_neuron_local(str(skeleton_id),
            robjects.ListVector(skeleton_envelope), project_id)

    # Make sure all temporary R values are garbage collected. With many
    # skeletons, this can otherwise become a memory problem quickly (the
    # Python GC doesn't now about the R memory).
    del r_nodes, r_connectors, r_tags, skeleton_data

    # Explicitly garbage collect after each skeleton is loaded.
    gc.collect()
