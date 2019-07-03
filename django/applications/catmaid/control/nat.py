# -*- coding: utf-8 -*-

from datetime import datetime
from itertools import chain
import logging
import numpy
import gc
import os
import re
import progressbar
import subprocess
from typing import Any, Dict, List

from django.db import connection
from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse

from catmaid.apps import get_system_user
from catmaid.control.common import get_request_bool, urljoin
from catmaid.control.authentication import requires_user_role
from catmaid.models import (Message, User, UserRole, NblastConfig,
        NblastConfigDefaultDistanceBreaks, NblastConfigDefaultDotBreaks,
        PointCloud, PointSet)

from celery.task import task
from celery.utils.log import get_task_logger

from rest_framework.authtoken.models import Token

logger = get_task_logger(__name__)
rnat_enaled = True

try:
    from rpy2.robjects.packages import importr
    from rpy2.rinterface import RRuntimeError
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
        super(CleanUpHTTPResponse, self).__init__(*args, **kwargs)
        #self['Content-Disposition'] = 'attachment; filename="{}"'.format(file_name)

    def close(self) -> None:
        """Make sure all file handles are closed and the input file is removed.
        """
        super(CleanUpHTTPResponse, self).close()
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
        export_skeleton_as_nrrd_async.delay(skeleton_id, source_ref, target_ref,
                request.user.id, mirror)

        return JsonResponse({
            'success': True
        })
    else:
        result = export_skeleton_as_nrrd(skeleton_id, source_ref, target_ref,
                request.user.id, mirror)

        if result['errors']:
            raise RuntimeError("There were errors creating the NRRD file: {}".format(
                    '\n'.join(result['errors'])))

        return CleanUpHTTPResponse(result['nrrd_path'], result['nrrd_name'],
                content_type='application/octet-stream')

@task()
def export_skeleton_as_nrrd_async(skeleton_id, source_ref, target_ref, user_id,
                                  mirror=True, create_message=True) -> str:

    result = export_skeleton_as_nrrd(skeleton_id, source_ref, target_ref,
                                     user_id, mirror)
    if create_message:
        msg = Message()
        msg.user = User.objects.get(pk=int(user_id))
        msg.read = False
        if result['errors']:
            msg.title = "No NRRD file could be creaed for skeleton {}".format(skeleton_id)
            msg.text = "There was at least one error during the NRRD export: {}".format('\n'.join(result['errors']))
            msg.action = ""
        else:
            url = urljoin(urljoin(settings.MEDIA_URL, settings.MEDIA_EXPORT_SUBDIRECTORY), result['nrrd_name'])
            msg.title = "Exported skeleton {} as NRRD file".format(skeleton_id)
            msg.text = "The requested skeleton was exported as NRRD file. You " \
                    "can download it from this location: <a href='{}'>{}</a>".format(url, url)
            msg.action = url
        msg.save()

    return "Errors: {}".format('\n'.join(result['errors'])) if result['errors'] else result['nrrd_path']

def export_skeleton_as_nrrd(skeleton_id, source_ref, target_ref, user_id, mirror=True) -> Dict:
    """ Export the skeleton with the passed in ID as NRRD file using R. For
    this to work R has to be installed.

    source_ref: FAFB14
    target_ref: JFRC2
    """
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    nrrd_name = "{}-{}.nrrd".format(skeleton_id, timestamp)
    nrrd_path = os.path.join(output_path, nrrd_name)
    errors = []
    try:
        token, _ = Token.objects.get_or_create(user_id=user_id)

        server_params = [
            'server="{}"'.format(settings.CATMAID_FULL_URL),
            'token="{}"'.format(token.key)
        ]

        if settings.CATMAID_HTTP_AUTH_USER:
            server_params.append('authname="{}"'.format(settings.CATMAID_HTTP_AUTH_USER))
            server_params.append('authpassword="{}"'.format(settings.CATMAID_HTTP_AUTH_PASS))

        r_script = """
        # if(!require("devtools")) install.packages("devtools")
        # devtools::source_gist("fdd1e5b6e009ff49e66be466a104fd92", filename = "install_flyconnectome_all.R")

        library(flycircuit)
        library(elmr)
        library(catmaid)
        library(nat.nblast)
        library(doMC)
        doMC::registerDoMC(7)

        conn = catmaid_login({server_params})

        # based on fetchn_fafb
        x=catmaid::read.neurons.catmaid({skeleton_id}, conn=conn)
        xt=xform_brain(x, sample="{source_ref}", reference={target_ref})
        if({mirror}) xt=mirror_brain(xt, {target_ref})

        # based on fetchdp_fafb
        xdp=nat::dotprops(xt, resample=1, k=5)
        regtemplate(xdp)=regtemplate(xt)

        im=as.im3d(xyzmatrix(xdp), {target_ref})
        write.im3d(im, '{output_path}')
        """.format(**{
            'server_params': ", ".join(server_params),
            'source_ref': source_ref,
            'target_ref': target_ref,
            'skeleton_id': skeleton_id,
            'output_path': nrrd_path,
            'mirror': "TRUE" if mirror else "FALSE",
        })

        # Call R, allow Rprofile.site file
        cmd = "R --no-save --no-restore --no-init-file --no-environ"
        pipe = subprocess.Popen(cmd, shell=True, stdin=subprocess.PIPE, encoding='utf8')
        stdout, stderr = pipe.communicate(input=r_script)

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


def test_r_environment() -> JsonResponse:
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
        devtools::install_github(c("jefferis/nat", "jefferislab/nat.nblast",
                "jefferis/rcatmaid", "jefferis/elmr"))

        This is required to let CATMAID compute NBLAST scores.
        """)

    return JsonResponse({
        'setup_ok': setup_is_ok,
    })


def setup_r_environment() -> None:
    """Install all R dependencies that are needed for NBLAST."""
    robjects.r("""
        if(!require("devtools")) install.packages("devtools")
        devtools::install_github(c("jefferis/nat", "jefferislab/nat.nblast",
                "jefferis/rcatmaid", "jefferis/elmr"))
        install.packages("doMC")
        install.packages(c("curl", "httr"))
    """)


def compute_scoring_matrix(project_id, user_id, matching_sample,
        random_sample, distbreaks=NblastConfigDefaultDistanceBreaks,
        dotbreaks=NblastConfigDefaultDotBreaks, resample_step=1000,
        tangent_neighbors=5, omit_failures=True, resample_by=1e3,
        use_http=False) -> Dict[str, Any]:
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
            #' # Parallelise NBLASTing across 4 cores using doMC package
            rdomc = importr('doMC')
            rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)

        # Get neurons
        # nb also convert from nm to um, resample to 1µm spacing and use k=5
        # nearest neighbours of each point to define tangent vector
        logger.debug('Fetching {} matching skeletons'.format(len(matching_skeleton_ids)))
        matching_neurons = dotprops_for_skeletons(project_id,
                matching_skeleton_ids, omit_failures, scale=nm_to_um, conn=conn)


        # Create dotprop instances and resample
        logger.debug('Computing matching skeleton stats')
        matching_neurons_dps = rnat.dotprops(matching_neurons, **{
                    'k': tangent_neighbors,
                    'resample': resample_by * nm_to_um,
                    '.progress': 'none',
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
                    lambda x: "pointset-{}".format(x), matching_sample.sample_pointsets))
            pointset_objects.names = rinterface.StrSexpVector(effective_pointset_object_ids)

            logger.debug('Computing matching pointset stats')
            pointset_dps = rnat.dotprops(pointset_objects.ro * nm_to_um, **{
                        'k': tangent_neighbors,
                        'resample': resample_by * nm_to_um,
                        '.progress': 'none',
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
                    lambda x: "pointcloud-{}".format(x), matching_sample.sample_pointclouds))
            pointcloud_objects.names = rinterface.StrSexpVector(effective_pointcloud_object_ids)

            logger.debug('Computing matching pointcloud stats')
            pointcloud_dps = rnat.dotprops(pointcloud_objects.ro * nm_to_um, **{
                        'k': tangent_neighbors,
                        'resample': resample_by * nm_to_um,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })

            # Append pointclouds to list of matching dotprops
            matching_neurons_dps = robjects.r.c(matching_neurons_dps, pointcloud_dps)

        # If there is subset of pairs given for the matching dorprops, convert
        # it into a list that can be understood by R.

        logger.debug('Fetching {} random skeletons'.format(len(random_skeleton_ids)))
        nonmatching_neurons = dotprops_for_skeletons(project_id,
                random_skeleton_ids, omit_failures, scale=nm_to_um, conn=conn)

        logger.debug('Computing random skeleton stats')
        nonmatching_neurons_dps = rnat.dotprops(nonmatching_neurons, **{
                    'k': tangent_neighbors,
                    'resample': resample_by * nm_to_um,
                    '.progress': 'none',
                    'OmitFailures': omit_failures,
                })


        # Matches are provided as subsets of objects that are similar to each
        # other (within each set). If in use, the subset parameter must be set
        # to a data.frame with two character columns query and target, that
        # define a single pair each.
        match_subset = robjects.NULL
        if matching_sample.subset:
            # Find all possible pairs in each subset
            pairs = []
            for subset in matching_sample.subset:
                # Build all possible pairs in this set
                indices = list(range(len(subset)))
                while len(indices) > 0:
                    elem_a = indices.pop(0)
                    for elem_b in indices:
                        pairs.append([subset[elem_a], subset[elem_b]])
                        # TODO: Reverse needed?

            # create query and target names
            query_names= []
            target_names = []
            for pair in pairs:
                elem_a, elem_b = pair
                elem_a_type, elem_a_key = elem_a # type: ignore
                elem_b_type, elem_b_key = elem_b # type: ignore

                if elem_a_type == 1:
                    query_name = 'pointset-{}'.format(elem_a_key)
                elif elem_a_type == 2:
                    query_name = 'pointcloud-{}'.format(elem_a_key)
                else:
                    query_name = elem_a_key

                if elem_b_type == 1:
                    target_name = 'pointset-{}'.format(elem_b_key)
                elif elem_b_type == 2:
                    target_name = 'pointcloud-{}'.format(elem_b_key)
                else:
                    target_name = elem_b_key

                query_names.append(query_name)
                target_names.append(target_name)

            logger.debug('Found {} subset pairs'.format(len(query_names)))
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


def compute_all_by_all_skeleton_similarity(project_id, user_id,
        nblast_config_id, skeleton_ids=None, jobs=1) -> Dict[str, Any]:
    """Compute complete all-to-all similarity matrix for the passed in nblast
    configuration.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    similarity = None
    errors = []
    warnings = [] # type: List

    # If no skeletons are given, use all available with a certain minimum size.
    cursor = connection.cursor()
    min_size = settings.NBLAST_ALL_BY_ALL_MIN_SIZE
    if not skeleton_ids:
        cursor.execute("""
            SELECT id from class_instance
            WHERE class_id =
            AND
        """)


    try:
        token, _ = Token.objects.get_or_create(user_id=user_id)

        server_params = [
            'server="{}"'.format(settings.CATMAID_FULL_URL),
            'token="{}"'.format(token.key)
        ]

        if settings.CATMAID_HTTP_AUTH_USER:
            server_params.append('authname="{}"'.format(settings.CATMAID_HTTP_AUTH_USER))
            server_params.append('authpassword="{}"'.format(settings.CATMAID_HTTP_AUTH_PASS))

        skeleton_ids = []

        r_script = """
        library(catmaid)
        library(nat.nblast)

        conn = catmaid_login({server_params})

        #' # Parallelise NBLASTing across 4 cores using doMC package
        #' library(doMC)
        #' registerDoMC(4)
        #' scores.norm2=nblast(kcs20, kcs20, normalised=TRUE, .parallel=TRUE)
        #' stopifnot(all.equal(scores.norm2, scores.norm))

        # nb also convert from nm to um, resample to 1µm spacing and use k=5
        # nearest neighbours of each point to define tangent vector
        neurons = read.neurons.catmaid(c({skeleton_ids}), OmitFailures=T, conn=conn)
        neurons.dps = dotprops(neurons/1e3, k=5, resample=1)

        # Compute all-by-all similarity using a neuronlist x with all neurons to
        # compare. Needs similarity matrix 'smat', a neuron database 'db',
        neurons.aba = nblast_allbyall.neuronlist(neurons.dps, smat, FALSE, 'raw')

        # TODO: Store neurons.aba. It is a matrix, indexed one-based like [1][1]
        # for first element.

        """.format(**{
            'server_params': ", ".join(server_params),
            'skeleton_ids': ",".join(skeleton_ids),
        })

        # Call R, allow Rprofile.site file
        cmd = "R --no-save --no-restore --no-init-file --no-environ"
        pipe = subprocess.Popen(cmd, shell=True, stdin=subprocess.PIPE)
        stdout, stderr = pipe.communicate(input=r_script)

        if not os.path.exists(nrrd_path): # FIXME: nrrd_path is not defined in this context, probably bad cut'n'paste
            raise ValueError("No output file created")

    except (IOError, OSError, ValueError) as e:
        errors.append(str(e))
        # Delete the file if parts of it have been written already
        if os.path.exists(nrrd_path):
            os.remove(nrrd_path)

    return {
        "errors": errors,
        "warnings": warnings
    }


def get_cache_file_name(project_id, object_type, simplification=10) -> str:
    if object_type == 'skeleton':
        extra = "-simple-{}".format(simplification)
    elif object_type == 'pointcloud':
        extra = ''
    elif object_type == 'pointset':
        extra = ''
    else:
        raise ValueError("Unsupported object type: {}".format(object_type))

    return "r-dps-cache-project-{project_id}-{object_type}{extra}.rda".format(**{
        'project_id': project_id,
        'object_type': object_type,
        'extra': extra,
    })


def get_cached_dps_data(project_id, object_type, simplification=10):
    """Return the loaded R object for cache file of a particular <object_type>
    (skeleton, pointcloud, pointset), if available. If not, None is returned.
    """
    cache_file = get_cache_file_name(project_id, object_type, simplification)
    cache_path = os.path.join(settings.MEDIA_ROOT, settings.MEDIA_CACHE_SUBDIRECTORY, cache_file)
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
        parallel=True, detail=10, omit_failures=True, min_nodes=500,
        min_soma_nodes=20, soma_tags=('soma'), resample_by=1e3,
        use_http=False, progress=False) -> None:
    """Create a new cache file for a particular project object type and
    detail level. All objects of a type in a project are prepared.
    """
    # A circular dependency would be the result of a top level import
    from catmaid.control.similarity import get_all_object_ids

    cache_file = get_cache_file_name(project_id, object_type, detail)
    cache_dir = os.path.join(settings.MEDIA_ROOT, settings.MEDIA_CACHE_SUBDIRECTORY)
    cache_path = os.path.join(cache_dir, cache_file)
    if not os.path.exists(cache_dir) or not os.access(cache_dir, os.W_OK):
        raise ValueError("Can't access cache directory: {}".format(cache_dir))
    if os.path.exists(cache_path) and not os.access(cache_path, os.W_OK):
        raise ValueError("Can't access cache file for writing: {}".format(cache_path))

    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")

    user = get_system_user()

    base = importr('base')
    rcatmaid = importr('catmaid')
    relmr = importr('elmr')
    rnat = importr('nat')
    Matrix = robjects.r.matrix

    if settings.MAX_PARALLEL_ASYNC_WORKERS > 1:
        #' # Parallelise NBLASTing across 4 cores using doMC package
        rdomc = importr('doMC')
        rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)

    if object_type == 'skeleton':
        logger.debug('Finding matching skeletons')
        object_ids = get_all_object_ids(project_id, user.id, object_type, min_nodes,
                min_soma_nodes, soma_tags)
        if not object_ids:
            logger.info("No skeletons found to populate cache from")
            return

        conn = get_catmaid_connection(user.id) if use_http else None

        logger.debug('Fetching {} skeletons'.format(len(object_ids)))
        # Note: scaling down to um
        objects = dotprops_for_skeletons(project_id, object_ids, omit_failures,
                progress=progress, scale=nm_to_um, conn=conn)

        # Simplify
        if detail > 0:
            logger.debug('Simplifying skeletons')
            simplified_objects = robjects.r.nlapply(objects, relmr.simplify_neuron, **{
                'n': detail,
                'OmitFailures': omit_failures,
                '.parallel': parallel,
            })
            # Make sure unneeded R objects are deleted
            del(objects)
            gc.collect()
            objects = simplified_objects

        logger.debug('Computing skeleton stats')
        print('Computing skeleton stats')
        objects_dps = rnat.dotprops(objects, **{
                    'k': tangent_neighbors,
                    'resample': resample_by * nm_to_um,
                    '.progress': 'text' if progress else 'none',
                    'OmitFailures': omit_failures,
                })

        del(objects)

        # Save cache to disk
        logger.debug('Storing skeleton cache with {} entries: {}'.format(
                len(objects_dps), cache_path))
        base.saveRDS(objects_dps, **{
            'file': cache_path,
        })
    elif object_type == 'pointcloud':
        # The system user is superuser and should have access to all pointclouds
        object_ids = get_all_object_ids(project_id, user.id, object_type)
        if not object_ids:
            logger.info("No pointclouds found to populate cache from")
            return
        logger.debug('Fetching {} query point clouds'.format(len(object_ids)))
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
                lambda x: "{}".format(x), object_ids))
        objects.names = rinterface.StrSexpVector(effective_object_ids)

        logger.debug('Computing query pointcloud stats')
        objects_dps = rnat.dotprops(objects.ro * nm_to_um, **{
                    'k': tangent_neighbors,
                    'resample': resample_by * nm_to_um,
                    '.progress': 'none',
                    'OmitFailures': omit_failures,
                })
        # Save
        base.saveRDS(objects_dps, **{
            'file': cache_path,
        })
    else:
        raise ValueError('Unsupported object type: {}'. format(object_type))


def nblast(project_id, user_id, config_id, query_object_ids, target_object_ids,
        query_type='skeleton', target_type='skeleton', omit_failures=True,
        normalized='raw', use_alpha=False, remove_target_duplicates=True,
        min_nodes=500, min_soma_nodes=20, simplify=True, required_branches=10,
        soma_tags=('soma', ), use_cache=True, reverse=False, top_n=0,
        resample_by=1e3, use_http=False) -> Dict[str, Any]:
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
            logger.debug('Disabling remove_target_duplicates option due to all-by-all computation')
            remove_target_duplicates = False

        nblast_params = {}

        parallel = False
        if settings.MAX_PARALLEL_ASYNC_WORKERS > 1:
            #' # Parallelise NBLASTing across 4 cores using doMC package
            rdomc = importr('doMC')
            rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)
            parallel = True

        nblast_params['.parallel'] = parallel

        cursor = connection.cursor()

        # In case either query_object_ids or target_object_ids is not given, the
        # value will be filled in with all objects of the respective type.
        from catmaid.control.similarity import get_all_object_ids
        if all_by_all:
            query_object_ids = get_all_object_ids(project_id, user_id,
                    query_type, min_nodes, min_soma_nodes, soma_tags)
            target_object_ids = query_object_ids
        else:
            if not query_object_ids:
                query_object_ids = get_all_object_ids(project_id, user_id,
                        query_type, min_nodes, min_soma_nodes, soma_tags)
            if not target_object_ids:
                target_object_ids = get_all_object_ids(project_id, user_id,
                        target_type, min_nodes, min_soma_nodes, soma_tags)

        # If both query and target IDs are of the same type, the target list of
        # object IDs can't contain any of the query IDs.
        if query_type == target_type and remove_target_duplicates:
            target_object_ids = list(set(target_object_ids) - set(query_object_ids))

        # The query and target objects that need to be loaded
        effective_query_object_ids = query_object_ids
        effective_target_object_ids = target_object_ids

        typed_query_object_ids = query_object_ids
        typed_target_object_ids = target_object_ids

        skeleton_cache = None
        pointcloud_cache = None
        pointset_cache = None
        if use_cache:
            object_types = (query_type, target_type)
            if 'skeleton' in object_types:
                # Check if skeleton cache file with R DPS dotprops exists and
                # load it, if available.
                skeleton_cache = get_cached_dps_data(project_id, 'skeleton')
            if 'pointcloud' in object_types:
                # Check if pointcloud cache file with R DPS dotprops exists and
                # load it, if available.
                pointcloud_cache = get_cached_dps_data(project_id, 'pointcloud')
            if 'pointset' in object_types:
                # Check if pointcloud cache file with R DPS dotprops exists and
                # load it, if available.
                pointset_cache = get_cached_dps_data(project_id, 'pointset')

        # Query objects
        if query_type == 'skeleton':
            # Check cache, if enabled
            cache_hits = 0
            query_cache_objects_dps = None # type: Any
            n_query_objects = len(query_object_ids)
            if use_cache and skeleton_cache:
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

            logger.debug('Fetching {} query skeletons ({} cache hits)'.format(
                    len(effective_query_object_ids), cache_hits))
            if effective_query_object_ids:
                query_objects = dotprops_for_skeletons(project_id,
                        effective_query_object_ids, omit_failures,
                        scale=nm_to_um, conn=conn)

                if simplify:
                    logger.debug("Simplifying query neurons, removing parts below branch level {}".format(required_branches))
                    query_objects = robjects.r.nlapply(query_objects,
                            relmr.simplify_neuron, **{
                                'n': required_branches,
                                'OmitFailures': omit_failures,
                                '.parallel': parallel,
                            })
                logger.debug('Computing query skeleton stats')
                query_dps = rnat.dotprops(query_objects, **{
                            'k': config.tangent_neighbors,
                            'resample': resample_by * nm_to_um,
                            '.progress': 'none',
                            'OmitFailures': omit_failures,
                        })
                non_cache_typed_query_object_ids = list(base.names(query_dps))
            else:
                query_dps = []
                non_cache_typed_query_object_ids = []

            # If we found cached items before, use them to complete the query
            # objects.
            if use_cache and cache_typed_query_object_ids:
                if len(query_dps) > 0:
                    query_dps = robjects.r.c(query_dps, query_cache_objects_dps)
                    typed_query_object_ids = non_cache_typed_query_object_ids + \
                            cache_typed_query_object_ids
                else:
                    query_dps = query_cache_objects_dps
        elif query_type == 'pointcloud':
            typed_query_object_ids = list(map(
                    lambda x: "pointcloud-{}".format(x), query_object_ids))
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
                        lambda x: "pointcloud-{}".format(x),
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

            logger.debug('Fetching {} query point clouds ({} cache hits)'.format(
                    len(effective_query_object_ids), cache_hits))
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
                        lambda x: "pointcloud-{}".format(x), effective_query_object_ids))
                query_objects.names = rinterface.StrSexpVector(non_cache_typed_query_object_ids)

                logger.debug('Computing query pointcloud stats')
                query_dps = rnat.dotprops(query_objects.ro * nm_to_um, **{
                            'k': config.tangent_neighbors,
                            'resample': resample_by * nm_to_um,
                            '.progress': 'none',
                            'OmitFailures': omit_failures,
                        })
                non_cache_typed_query_object_ids = list(base.names(query_dps))
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
                    lambda x: "pointset-{}".format(x), query_object_ids))
            # Check cache, if enabled
            if use_cache and pointset_cache:
                pass

            logger.debug('Fetching {} query point sets'.format(len(query_object_ids)))
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

            logger.debug('Computing query pointset stats')
            query_dps = rnat.dotprops(query_objects.ro * nm_to_um, **{
                        'k': config.tangent_neighbors,
                        'resample': resample_by * nm_to_um,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })
            typed_query_object_ids = list(base.names(query_dps))
        else:
            raise ValueError("Unknown query type: {}".format(query_type))

        # Target objects, only needed if no all-by-all computation is done
        if all_by_all:
            logger.debug('All-by-all computation: using query objects and dps for target')
            target_objects = query_objects
            target_dps = query_dps
        else:
            if target_type == 'skeleton':
                # Check cache, if enabled
                cache_hits = 0
                target_cache_objects_dps = None # type: Any
                n_target_objects = len(target_object_ids)
                if use_cache and skeleton_cache:
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

                logger.debug('Fetching {} target skeletons ({} cache hits)'.format(
                        len(effective_target_object_ids), cache_hits))
                if effective_target_object_ids:
                    target_objects = dotprops_for_skeletons(project_id,
                            effective_target_object_ids, omit_failures,
                            scale=nm_to_um, conn=conn)

                    if simplify:
                        logger.debug("Simplifying target neurons, removing parts below branch level {}".format(required_branches))
                        target_objects = robjects.r.nlapply(target_objects,
                                relmr.simplify_neuron, **{
                                    'n': required_branches,
                                    'OmitFailures': omit_failures,
                                    '.parallel': parallel,
                                })

                    logger.debug('Computing target skeleton stats')
                    target_dps = rnat.dotprops(target_objects, **{
                                'k': config.tangent_neighbors,
                                'resample': resample_by * nm_to_um,
                                '.progress': 'none',
                                'OmitFailures': omit_failures,
                            })
                    non_cache_typed_target_object_ids = list(base.names(target_dps))
                else:
                    target_dps = []
                    non_cache_typed_target_object_ids = []

                # If we found cached items before, use them to complete the target
                # objects.
                if use_cache and cache_typed_target_object_ids:
                    if len(target_dps) > 0:
                        target_dps = robjects.r.c(target_dps, target_cache_objects_dps)
                        typed_target_object_ids = non_cache_typed_target_object_ids + \
                                cache_typed_target_object_ids
                    else:
                        target_dps = target_cache_objects_dps
            elif target_type == 'pointcloud':
                typed_target_object_ids = list(map(
                        lambda x: "pointcloud-{}".format(x), target_object_ids))
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
                            lambda x: "pointcloud-{}".format(x),
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

                logger.debug('Fetching {} target point clouds ({} cache hits)'.format(
                        len(effective_target_object_ids), cache_hits))
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
                            lambda x: "pointcloud-{}".format(x), effective_target_object_ids))
                    target_objects.names = rinterface.StrSexpVector(non_cache_typed_target_object_ids)

                    logger.debug('Computing target pointcloud stats')
                    target_dps = rnat.dotprops(target_objects.ro * nm_to_um, **{
                                'k': config.tangent_neighbors,
                                'resample': resample_by * nm_to_um,
                                '.progress': 'none',
                                'OmitFailures': omit_failures,
                            })
                    non_cache_typed_target_object_ids = list(base.names(target_dps))
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
                        lambda x: "pointset-{}".format(x), target_object_ids))
                logger.debug('Fetching {} target point sets'.format(len(target_object_ids)))
                pointsets = []
                for psid in target_object_ids:
                    target_pointset = PointSet.objects.get(pk=psid)
                    n_points = len(target_pointset.points) / 3
                    point_data = Matrix(rinterface.FloatSexpVector(target_pointset.points),
                            nrow=n_points, byrow=True)
                    pointsets.append(point_data)

                target_objects = rnat.as_neuronlist(pointsets)
                target_objects.names = rinterface.StrSexpVector(typed_target_object_ids)

                logger.debug('Computing target pointset stats')
                target_dps = rnat.dotprops(target_objects.ro * nm_to_um, **{
                            'k': config.tangent_neighbors,
                            'resample': resample_by * nm_to_um,
                            '.progress': 'none',
                            'OmitFailures': omit_failures,
                        })
                typed_target_object_ids = list(base.names(target_dps))
            else:
                raise ValueError("Unknown target type: {}".format(target_type))

        if len(query_dps) == 0:
            raise ValueError("No valid query objects found")

        if len(target_dps) == 0:
            raise ValueError("No valid target objects found")

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

        logger.debug('Computing score (alpha: {a}, noramlized: {n}, reverse: {r}, top N: {tn})'.format(**{
            'a': 'Yes' if use_alpha else 'No',
            'n': 'No' if normalized == 'raw' else 'Yes ({})'.format(normalized),
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
            logger.debug('top n {}'.format(top_n))
            # Compute forward scores, either unnormalized or normalized so that a
            # self-match is 1.
            scores = as_matrix(rnblast.NeuriteBlast(a, b, **nblast_params), a, b)

            # For each query object, compute the reverse score for the top N
            # forward scores.
            target_scores = None
            for n, query_object_dps in enumerate(query_dps):
                query_name = query_dps.names[n]
                logger.debug('Query object {}/{}: {}'.format(n+1, len(query_dps), query_name))
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
                if normalized == 'mean':
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
                    result_row = pd.DataFrame([
                            # Mean score: (forward score + reverse score) / 2
                            [(scores_df.loc[reverse_scores.rownames[i]].score + reverse_scores[i]) / 2 \
                                    for i in range(len(reverse_scores))]
                        ],
                        index=[query_name],
                        columns=list(reverse_scores.rownames))
                else:
                    # Get top N forward scores for input query as a row of the
                    # target table format (scores for single query object form a
                    # row).
                    result_row = pd.DataFrame([
                            # Forward score:
                            [scores_df.loc[name].score for name in top_n_names_names]
                        ],
                        index=[query_name],
                        columns=list(top_n_names_names))

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
            similarity = target_scores.to_numpy().tolist() # type: ignore # mypy cannot prove this won't still be None

            column_names = list(target_scores.columns.values) # type: ignore # same as above
            row_names = list(target_scores.index.values) # type: ignore # same as above

        else:
            if normalized == 'mean':
                # Compute forward scores, either unnormalized or normalized so that a
                # self-match is 1.
                aa = rnblast.NeuriteBlast(a, b, **nblast_params)
                bb = rnblast.NeuriteBlast(b, a, **nblast_params)

                forward_scores = as_matrix(aa, a, b)
                reverse_scores = as_matrix(bb, b, a)

                # Compute mean
                scores = (forward_scores.ro + reverse_scores.transpose()).ro / 2.0
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

            similarity = numpy.asarray(row_first_scores).tolist()

        # We expect a result at this point
        if not similarity:
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

        logger.debug('NBLAST computation done')

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

    if score_type == robjects.vectors.Matrix:
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

    raise ValueError("Can't convert to matrix, unknown type: {}".format(score_type))


def dotprops_for_skeletons(project_id, skeleton_ids, omit_failures=False,
        scale=None, conn=None, progress=False):
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

    from catmaid.control.skeletonexport import _compact_skeleton

    if progress:
        bar = progressbar.ProgressBar(max_value=len(skeleton_ids), redirect_stdout=True).start()

    cs_r = {}
    for ni, skeleton_id in enumerate(skeleton_ids):
        try:
            cs = _compact_skeleton(project_id, skeleton_id,
                    with_connectors=True, with_tags=True, scale=scale)
        except Exception as e:
            if not omit_failures:
                raise
            logger.error('Error loading skeleton {}'.format(skeleton_id))
            logger.error(e)
            continue

        if progress:
            bar.update(ni + 1)

        raw_nodes = cs[0]
        raw_connectors = cs[1]
        raw_tags = cs[2]

        # Require at least two nodes
        if len(raw_nodes) < 2:
            if omit_failures:
                continue
            raise ValueError("Skeleton {} has less than two nodes".format(skeleton_id))

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
        nodes = [(k,[]) for k,_,_ in node_cols] # type: List
        for rn in raw_nodes:
                for n, kv in enumerate(node_cols):
                        val = rn[n]
                        if val is None:
                                val = kv[2]
                        nodes[n][1].append(val)
        r_nodes = [(kv[0], node_cols[n][1](kv[1]))
                for n, kv in enumerate(nodes)]

        # Connectors in Rpy2 format
        connector_cols = [
                ('treenode_id', rinterface.IntSexpVector, robjects.NA_Integer),
                ('connector_id', rinterface.IntSexpVector, robjects.NA_Integer),
                ('prepost', rinterface.IntSexpVector, robjects.NA_Integer),
                ('x', rinterface.FloatSexpVector, robjects.NA_Real),
                ('y', rinterface.FloatSexpVector, robjects.NA_Real),
                ('z', rinterface.FloatSexpVector, robjects.NA_Real)
        ]
        connectors = [(k,[]) for k,_,_ in connector_cols] # type: List
        for rn in raw_connectors:
                for n, kv in enumerate(connector_cols):
                        val = rn[n]
                        if val is None:
                                val = kv[2]
                        connectors[n][1].append(val)
        r_connectors = [(kv[0], connector_cols[n][1](kv[1]))
                for n, kv in enumerate(connectors)]

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

    if progress:
        bar.finish()

    objects = concat_neurons_local(
            rinterface.IntSexpVector(skeleton_ids),
            robjects.ListVector(cs_r), **{
                '.progress': 'text' if progress else 'none',
                'OmitFailures': omit_failures
            })
    print("Converted {}/{} neurons".format(len(objects), len(skeleton_ids)))

    del(cs_r)
    gc.collect()

    return objects
