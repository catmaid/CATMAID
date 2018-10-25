# -*- coding: utf-8 -*-

import logging
import os
import re
import subprocess
import numpy

from datetime import datetime
from itertools import chain

from django.conf import settings
from django.http import JsonResponse, HttpResponse

from catmaid.control.common import get_request_bool, urljoin
from catmaid.control.authentication import requires_user_role
from catmaid.models import (Message, User, UserRole, NblastConfig,
        NblastConfigDefaultDistanceBreaks, NblastConfigDefaultDotBreaks,
        PointCloud, PointSet)

from celery.task import task

from rest_framework.authtoken.models import Token

logger = logging.getLogger(__name__)
rnat_enaled = True

try:
    from rpy2.robjects.packages import importr
    import rpy2.robjects as robjects
except ImportError:
    rnat_enaled = False
    logger.warning('CATMAID was unable to load the Rpy2 library, which is an '
            'optional dependency. Nblast support is therefore disabled.')


# The path were server side exported files get stored in
output_path = os.path.join(settings.MEDIA_ROOT,
    settings.MEDIA_EXPORT_SUBDIRECTORY)


class CleanUpHTTPResponse(HttpResponse):
    """Remove a file after it has been sent as a HTTP response.
    """

    def __init__(self, file_path, file_name, content_type, *args, **kwargs):
        self.file_path = file_path
        self.file_handle = open(file_path, 'rb')
        kwargs['content'] = self.file_handle
        super(CleanUpHTTPResponse, self).__init__(*args, **kwargs)
        #self['Content-Disposition'] = 'attachment; filename="{}"'.format(file_name)

    def close(self):
        """Make sure all file handles are closed and the input file is removed.
        """
        super(CleanUpHTTPResponse, self).close()
        if self.file_handle:
            self.file_handle.close()
        if os.path.exists(self.file_path):
            os.remove(self.file_path)


@requires_user_role(UserRole.Browse)
def export_nrrd(request, project_id, skeleton_id):
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
                                  mirror=True, create_message=True):

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

def export_skeleton_as_nrrd(skeleton_id, source_ref, target_ref, user_id, mirror=True):
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


def test_r_environment():
    """Test if all required R packages are installed to use the NBLAST API.
    """
    setup_is_ok = False
    try:
        rnat = importr('nat')
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
                "jefferis/rcatmaid"))

        This is required to let CATMAID compute NBLAST scores.
        """)

    return JsonResponse({
        'setup_ok': setup_is_ok,
    })


def setup_r_environment():
    """Install all R dependencies that are needed for NBLAST."""
    robjects.r("""
        if(!require("devtools")) install.packages("devtools")
        devtools::install_github(c("jefferis/nat", "jefferislab/nat.nblast",
                "jefferis/rcatmaid"))
        install.packages("doMC")
    """)


def compute_scoring_matrix(project_id, user_id, matching_skeleton_ids,
        random_skeleton_ids, distbreaks=NblastConfigDefaultDistanceBreaks,
        dotbreaks=NblastConfigDefaultDotBreaks, resample_step=1000,
        tangent_neighbors=5, omit_failures=True):
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
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    similarity = None
    matching_histogram = None
    random_histogram = None
    matching_probability = None
    random_probability = None
    errors = []
    try:
        token, _ = Token.objects.get_or_create(user_id=user_id)

        server_params = {
            'server': settings.CATMAID_FULL_URL,
            'token': token.key
        }

        if hasattr(settings, 'CATMAID_HTTP_AUTH_USER') and settings.CATMAID_HTTP_AUTH_USER:
            server_params['authname'] = settings.CATMAID_HTTP_AUTH_USER
            server_params['authpassword'] = settings.CATMAID_HTTP_AUTH_PASS

        rcatmaid = importr('catmaid')
        rnat = importr('nat')
        rnblast = importr('nat.nblast')

        conn = rcatmaid.catmaid_login(**server_params)

        if settings.MAX_PARALLEL_ASYNC_WORKERS > 1:
            #' # Parallelise NBLASTing across 4 cores using doMC package
            rdomc = importr('doMC')
            rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)

        # Get neurons
        # nb also convert from nm to um, resample to 1µm spacing and use k=5
        # nearest neighbours of each point to define tangent vector
        logger.debug('Fetching matching skeletons')
        matching_neurons = rcatmaid.read_neurons_catmaid(
                robjects.IntVector(matching_skeleton_ids), **{
                    'conn': conn,
                    '.progress': 'none',
                    'OmitFailures': omit_failures,
                })
        logger.debug('Fetching random skeletons')
        nonmatching_neurons = rcatmaid.read_neurons_catmaid(
                robjects.IntVector(random_skeleton_ids), **{
                    'conn': conn,
                    '.progress': 'none',
                    'OmitFailures': omit_failures,
                })

        # Create dotprop instances and resample
        logger.debug('Computing matching skeleton stats')
        matching_neurons_dps = rnat.dotprops(matching_neurons.ro / 1e3, **{
                    'k': tangent_neighbors,
                    'resample': 1,
                    '.progress': 'none',
                    'OmitFailures': omit_failures,
                })

        logger.debug('Computing random skeleton stats')
        nonmatching_neurons_dps = rnat.dotprops(nonmatching_neurons.ro / 1e3, **{
                    'k': tangent_neighbors,
                    'resample': 1,
                    '.progress': 'none',
                    'OmitFailures': omit_failures,
                })


        logger.debug('Computing matching tangent information')
        match_dd = rnblast.calc_dists_dotprods(matching_neurons_dps,
                subset=robjects.NULL, ignoreSelf=True)
        # generate random set of neuron pairs of same length as the matching set
        non_matching_subset = rnblast.neuron_pairs(nonmatching_neurons_dps, n=len(match_dd))
        logger.debug('Computing random tangent information')
        rand_dd = rnblast.calc_dists_dotprods(nonmatching_neurons_dps,
                subset=robjects.NULL, ignoreSelf=True)

        rdistbreaks = robjects.FloatVector(distbreaks)
        rdotbreaks = robjects.FloatVector(dotbreaks)

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
        nblast_config_id, skeleton_ids=None, jobs=1):
    """Compute complete all-to-all similarity matrix for the passed in nblast
    configuration.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    similarity = None
    errors = []
    warnings = []

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

        if not os.path.exists(nrrd_path):
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


def nblast(project_id, config_id, query_object_ids, target_object_ids,
        query_type='skeleton', target_type='skeleton', omit_failures=True,
        normalized='raw', use_alpha=False):
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
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    similarity = None
    errors = []
    try:
        config = NblastConfig.objects.get(project_id=project_id, pk=config_id)
        token, _ = Token.objects.get_or_create(user_id=config.user_id)

        server_params = {
            'server': settings.CATMAID_FULL_URL,
            'token': token.key
        }

        if hasattr(settings, 'CATMAID_HTTP_AUTH_USER') and settings.CATMAID_HTTP_AUTH_USER:
            server_params['authname'] = settings.CATMAID_HTTP_AUTH_USER
            server_params['authpassword'] = settings.CATMAID_HTTP_AUTH_PASS

        rnat = importr('nat')
        rnblast = importr('nat.nblast')
        rcatmaid = importr('catmaid')
        Matrix = robjects.r.matrix

        conn = rcatmaid.catmaid_login(**server_params)
        nblast_params = {}

        config = NblastConfig.objects.get(project_id=project_id, pk=config_id)

        if settings.MAX_PARALLEL_ASYNC_WORKERS > 1:
            #' # Parallelise NBLASTing across 4 cores using doMC package
            rdomc = importr('doMC')
            rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)
            nblast_params['.parallel'] = True

        # If both query and target IDs are of the same type, the target list of
        # object IDs can't contain any of the query IDs.
        if query_type == target_type:
            target_object_ids = list(set(target_object_ids) - set(query_object_ids))

        effective_query_object_ids = query_object_ids
        effective_target_object_ids = target_object_ids

        # Query objects
        if query_type == 'skeleton':
            logger.debug('Fetching query skeletons')
            query_objects = rcatmaid.read_neurons_catmaid(
                    robjects.IntVector(query_object_ids), **{
                        'conn': conn,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })
            logger.debug('Computing query skeleton stats')
            query_dps = rnat.dotprops(query_objects.ro / 1e3, **{
                        'k': config.tangent_neighbors,
                        'resample': 1,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })
        elif query_type == 'pointcloud':
            logger.debug('Fetching query point clouds')
            pointclouds = []
            for pcid in query_object_ids:
                target_pointcloud = PointCloud.objects.prefetch_related('points').get(pk=pcid)
                points_flat = list(chain.from_iterable(
                        (p.location_x, p.location_y, p.location_z)
                        for p in target_pointcloud.points.all()))
                n_points = len(points_flat) / 3
                point_data = Matrix(robjects.FloatVector(points_flat),
                        nrow=n_points, byrow=True)
                pointclouds.append(point_data)

            query_objects = rnat.as_neuronlist(pointclouds)
            effective_query_object_ids = list(map(
                    lambda x: "pointcloud-{}".format(x), query_object_ids))
            query_objects.names = robjects.StrVector(effective_query_object_ids)

            logger.debug('Computing query pointcloud stats')
            query_dps = rnat.dotprops(query_objects.ro / 1e3, **{
                        'k': config.tangent_neighbors,
                        'resample': 1,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })
        elif query_type == 'pointset':
            logger.debug('Fetching query point sets')
            pointsets = []
            for psid in query_object_ids:
                target_pointset = PointSet.objects.get(pk=psid)
                n_points = len(target_pointset.points) / 3
                point_data = Matrix(robjects.FloatVector(target_pointset.points),
                        nrow=n_points, byrow=True)
                pointsets.append(point_data)

            query_objects = rnat.as_neuronlist(pointsets)
            effective_query_object_ids = list(map(
                    lambda x: "pointset-{}".format(x), query_object_ids))
            query_objects.names = robjects.StrVector(effective_query_object_ids)

            logger.debug('Computing query pointset stats')
            query_dps = rnat.dotprops(query_objects.ro / 1e3, **{
                        'k': config.tangent_neighbors,
                        'resample': 1,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })
        else:
            raise ValueError("Unknown query type: {}".format(query_type))

        # Target objects
        if target_type == 'skeleton':
            logger.debug('Fetching target skeletons')
            target_objects = rcatmaid.read_neurons_catmaid(
                    robjects.IntVector(target_object_ids), **{
                        'conn': conn,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })

            logger.debug('Computing target skeleton stats')
            target_dps = rnat.dotprops(target_objects.ro / 1e3, **{
                        'k': config.tangent_neighbors,
                        'resample': 1,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })
        elif target_type == 'pointcloud':
            logger.debug('Fetching target point clouds')
            pointclouds = []
            for pcid in target_object_ids:
                target_pointcloud = PointCloud.objects.prefetch_related('points').get(pk=pcid)
                points_flat = list(chain.from_iterable(
                        (p.location_x, p.location_y, p.location_z)
                        for p in target_pointcloud.points.all()))
                n_points = len(points_flat) / 3
                point_data = Matrix(robjects.FloatVector(points_flat),
                        nrow=n_points, byrow=True)
                pointclouds.append(point_data)

            target_objects = rnat.as_neuronlist(pointclouds)
            effective_target_object_ids = list(map(
                    lambda x: "pointcloud-{}".format(x), target_object_ids))
            target_objects.names = robjects.StrVector(effective_target_object_ids)

            logger.debug('Computing target pointcloud stats')
            target_dps = rnat.dotprops(target_objects.ro / 1e3, **{
                        'k': config.tangent_neighbors,
                        'resample': 1,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })
        elif target_type == 'pointset':
            logger.debug('Fetching target point sets')
            pointsets = []
            for psid in target_object_ids:
                target_pointset = PointSet.objects.get(pk=psid)
                n_points = len(target_pointset.points) / 3
                point_data = Matrix(robjects.FloatVector(target_pointset.points),
                        nrow=n_points, byrow=True)
                dataframe.append(psid)
                pointsets.append(point_data)

            target_objects = rnat.as_neuronlist(pointsets)
            effective_target_object_ids =list(map(
                    lambda x: "pointset-{}".format(x), target_object_ids))
            target_objects.names = robjects.StrVector(effective_target_object_ids)

            logger.debug('Computing target pointset stats')
            target_dps = rnat.dotprops(target_objects.ro / 1e3, **{
                        'k': config.tangent_neighbors,
                        'resample': 1,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })
        else:
            raise ValueError("Unknown target type: {}".format(target_type))

        # Restore R matrix for use with nat.nblast.
        cells = list(chain.from_iterable(config.scoring))
        dist_bins = len(config.distance_breaks) - 1
        smat = Matrix(robjects.FloatVector(cells), nrow=dist_bins, byrow=True)

        # Set relevant attributes on similarity matrix. The nat.nblast code
        # expects this.
        rdistbreaks = robjects.FloatVector(config.distance_breaks)
        rdotbreaks = robjects.FloatVector(config.dot_breaks)
        smat.do_slot_assign('distbreaks', rdistbreaks)
        smat.do_slot_assign('dotprodbreaks', rdotbreaks)

        logger.debug('Computing score (alpha: {a}, noramlized: {n}'.format(**{
            'a': 'Yes' if use_alpha else 'No',
            'n': 'No' if normalized == 'raw' else 'Yes',
        }))

        # Use defaults also used in nat.nblast.
        normalize_initial_score = normalized == 'normalized'
        nblast_params['smat'] = smat
        nblast_params['NNDistFun'] = rnblast.lodsby2dhist
        nblast_params['UseAlpha'] = use_alpha
        nblast_params['normalised'] = normalize_initial_score

        if normalized == 'mean':
            all_objects = robjects.r.c(query_dps, target_dps)
            all_scores = rnblast.NeuriteBlast(all_objects, all_objects, **nblast_params)
            scores = rnblast.sub_score_mat(effective_query_object_ids,
                    effective_target_object_ids, **{
                        'scoremat': all_scores,
                        'normalisation': 'mean',
                    })
        else:
            scores = rnblast.NeuriteBlast(query_dps, target_dps, **nblast_params)


        # NBLAST by default will simplify the result in cases where there is
        # only a one to one correspondence. Fix this to our expectation to have
        # lists for both rows and columns.
        if type(scores) == robjects.vectors.FloatVector:
            similarity = [numpy.asarray(scores).tolist()]
        else:
            # Scores are returned with query skeletons as columns, but we want them
            # as rows, because it matches our expected queries more. Therefore
            # we have to transpose it using the 't()' R function.
            similarity = numpy.asarray(robjects.r['t'](scores)).tolist()

        logger.debug('Done')

    except (IOError, OSError, ValueError) as e:
        logger.exception(e)
        errors.append(str(e))

    return {
        "errors": errors,
        "similarity": similarity
    }
