# -*- coding: utf-8 -*-

import logging
import os
import re
import subprocess
import numpy

from datetime import datetime
from itertools import chain

from django.db import connection
from django.conf import settings
from django.http import JsonResponse, HttpResponse

from catmaid.apps import get_system_user
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
    from rpy2.rinterface import RRuntimeError
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


def setup_r_environment():
    """Install all R dependencies that are needed for NBLAST."""
    robjects.r("""
        if(!require("devtools")) install.packages("devtools")
        devtools::install_github(c("jefferis/nat", "jefferislab/nat.nblast",
                "jefferis/rcatmaid", "jefferis/elmr"))
        install.packages("doMC")
    """)


def compute_scoring_matrix(project_id, user_id, matching_sample,
        random_sample, distbreaks=NblastConfigDefaultDistanceBreaks,
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

        conn = get_catmaid_connection(user_id)

        if settings.MAX_PARALLEL_ASYNC_WORKERS > 1:
            #' # Parallelise NBLASTing across 4 cores using doMC package
            rdomc = importr('doMC')
            rdomc.registerDoMC(settings.MAX_PARALLEL_ASYNC_WORKERS)

        # Get neurons
        # nb also convert from nm to um, resample to 1µm spacing and use k=5
        # nearest neighbours of each point to define tangent vector
        logger.debug('Fetching {} matching skeletons'.format(len(matching_skeleton_ids)))
        matching_neurons = rcatmaid.read_neurons_catmaid(
                robjects.IntVector(matching_skeleton_ids), **{
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

        # Get matching point sets, e.g. transformed neurons. They are combined
        # with matching neurons into one set.
        if matching_sample.sample_pointsets:
            pointsets = []
            for psid in matching_sample.sample_pointsets:
                target_pointset = PointSet.objects.get(pk=psid)
                n_points = len(target_pointset.points) / 3
                point_data = Matrix(robjects.FloatVector(target_pointset.points),
                        nrow=n_points, byrow=True)
                pointsets.append(point_data)

            pointset_objects = rnat.as_neuronlist(pointsets)
            effective_pointset_object_ids = list(map(
                    lambda x: "pointset-{}".format(x), matching_sample.sample_pointsets))
            pointset_objects.names = robjects.StrVector(effective_pointset_object_ids)

            logger.debug('Computing matching pointset stats')
            pointset_dps = rnat.dotprops(pointset_objects.ro / 1e3, **{
                        'k': tangent_neighbors,
                        'resample': 1,
                        '.progress': 'none',
                        'OmitFailures': omit_failures,
                    })

            # Append pointsets to list of matching dotprops
            matching_neurons_dps = robjects.r.c(matching_neurons_dps, pointset_dps)

        # If there is subset of pairs given for the matching dorprops, convert
        # it into a list that can be understood by R.

        logger.debug('Fetching {} random skeletons'.format(len(random_skeleton_ids)))
        nonmatching_neurons = rcatmaid.read_neurons_catmaid(
                robjects.IntVector(random_skeleton_ids), **{
                    'conn': conn,
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
                elem_a_type, elem_a_key = elem_a
                elem_b_type, elem_b_key = elem_b

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
                'query': robjects.StrVector(query_names),
                'target': robjects.StrVector(target_names),
            })

        logger.debug('Computing matching tangent information')
        match_dd = rnblast.calc_dists_dotprods(matching_neurons_dps,
                subset=match_subset, ignoreSelf=True)

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


def get_cache_file_name(project_id, object_type, simplification=10):
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
        min_soma_nodes=20, soma_tags=('soma')):
    """Create a new cache file for a particular project object type and
    detail level. All objects of a type in a project are prepared.
    """
    # A circular dependency would be the result of a top level import
    from catmaid.control.similarity import get_all_object_ids

    cache_file = get_cache_file_name(project_id, object_type, detail)
    cache_dir = os.path.join(settings.MEDIA_ROOT, settings.MEDIA_CACHE_SUBDIRECTORY)
    cache_path = os.path.join(cache_dir, cache_file)
    if not os.path.exists(cache_dir):
        raise ValueError("Can't access cache directory: {}".format(cache_dir))
    if not os.access(cache_path, os.W_OK):
        raise ValueError("Can't access cache file for writing: {}".format(cache_path))

    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")

    user = get_system_user()
    conn = get_catmaid_connection(user.id)

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

        logger.debug('Fetching {} skeletons'.format(len(object_ids)))
        objects = rcatmaid.read_neurons_catmaid(
                robjects.IntVector(object_ids), **{
                    'conn': conn,
                    '.progress': 'none',
                    'OmitFailures': omit_failures,
                })

        # Simplify
        if detail > 0:
            logger.debug('Simplifying skeletons')
            objects = robjects.r.nlapply(objects, relmr.simplify_neuron, **{
                'n': detail,
                'OmitFailures': omit_failures,
                '.parallel': parallel,
            })

        logger.debug('Computing skeleton stats')
        # Note: scaling down to um
        objects_dps = rnat.dotprops(objects.ro / 1e3, **{
                    'k': tangent_neighbors,
                    'resample': 1,
                    '.progress': 'none',
                    'OmitFailures': omit_failures,
                })

        # Save cache to disk
        logger.debug('Storing skeleton cache')
        base = importr('base')
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
            point_data = Matrix(robjects.FloatVector(points_flat),
                    nrow=n_points, byrow=True)
            pointclouds.append(point_data)

        objects = rnat.as_neuronlist(pointclouds)
        effective_object_ids = list(map(
                lambda x: "{}".format(x), object_ids))
        objects.names = robjects.StrVector(effective_object_ids)

        logger.debug('Computing query pointcloud stats')
        objects_dps = rnat.dotprops(objects.ro / 1e3, **{
                    'k': tangent_neighbors,
                    'resample': 1,
                    '.progress': 'none',
                    'OmitFailures': omit_failures,
                })
        # Save
        base = importr('base')
        base.saveRDS(objects_dps, **{
            'file': cache_path,
        })
    else:
        raise ValueError('Unsupported object type: {}'. format(object_type))

def nblast(project_id, user_id, config_id, query_object_ids, target_object_ids,
        query_type='skeleton', target_type='skeleton', omit_failures=True,
        normalized='raw', use_alpha=False, remove_target_duplicates=True,
        min_nodes=500, min_soma_nodes=20, simplify=True, required_branches=10,
        soma_tags=('soma', ), use_cache=True):
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
    query_object_ids_in_use = None
    target_object_ids_in_use = None
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

        conn = rcatmaid.catmaid_login(**server_params)
        nblast_params = {}

        config = NblastConfig.objects.get(project_id=project_id, pk=config_id)

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
            query_cache_objects_dps = None
            n_query_objects = len(query_object_ids)
            if use_cache and skeleton_cache:
                # Find all skeleton IDs that aren't part of the cache
                # TODO: There must be a simler way to extract non-NA values only
                query_object_id_str = robjects.StrVector(list(map(str, query_object_ids)))
                query_cache_objects_dps = skeleton_cache.rx(query_object_id_str)
                non_na_ids = list(filter(lambda x: type(x) == str,
                        list(base.names(query_cache_objects_dps))))
                cache_typed_query_object_ids = non_na_ids
                query_cache_objects_dps = rnat.subset_neuronlist(
                        query_cache_objects_dps, robjects.StrVector(non_na_ids))
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
                query_objects = rcatmaid.read_neurons_catmaid(
                        robjects.IntVector(effective_query_object_ids), **{
                            'conn': conn,
                            '.progress': 'none',
                            'OmitFailures': omit_failures,
                        })

                if simplify:
                    logger.debug("Simplifying query neurons, removing parts below branch level {}".format(required_branches))
                    query_objects = robjects.r.nlapply(query_objects,
                            relmr.simplify_neuron, **{
                                'n': required_branches,
                                'OmitFailures': omit_failures,
                                '.parallel': parallel,
                            })
                logger.debug('Computing query skeleton stats')
                query_dps = rnat.dotprops(query_objects.ro / 1e3, **{
                            'k': config.tangent_neighbors,
                            'resample': 1,
                            '.progress': 'none',
                            'OmitFailures': omit_failures,
                        })
                non_cache_typed_query_object_ids = list(base.names(query_dps))
            else:
                query_dps = []
                non_cache_typed_query_object_ids = []

            # If we found cached items before, use them to complete the query
            # objects.
            if use_cache and query_cache_objects_dps:
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
                query_object_id_str = robjects.StrVector(list(map(str, query_object_ids)))
                query_cache_objects_dps = pointcloud_cache.rx(query_object_id_str)
                non_na_ids = list(filter(lambda x: type(x) == str,
                        list(base.names(query_cache_objects_dps))))
                query_cache_objects_dps = rnat.subset_neuronlist(
                        query_cache_objects_dps, robjects.StrVector(non_na_ids))
                cache_typed_query_object_ids = list(map(
                        lambda x: "pointcloud-{}".format(x),
                        list(base.names(query_cache_objects_dps))))
                effective_query_object_ids = list(filter(
                        # Only allow neurons that are not part of the cache
                        lambda x: query_cache_objects_dps.rx2(str(x)) == robjects.NULL,
                        query_object_ids))
                query_cache_objects_dps.names = robjects.StrVector(cache_typed_query_object_ids)
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
                    point_data = Matrix(robjects.FloatVector(points_flat),
                            nrow=n_points, byrow=True)
                    pointclouds.append(point_data)

                query_objects = rnat.as_neuronlist(pointclouds)
                non_cache_typed_query_object_ids = list(map(
                        lambda x: "pointcloud-{}".format(x), effective_query_object_ids))
                query_objects.names = robjects.StrVector(non_cache_typed_query_object_ids)

                logger.debug('Computing query pointcloud stats')
                query_dps = rnat.dotprops(query_objects.ro / 1e3, **{
                            'k': config.tangent_neighbors,
                            'resample': 1,
                            '.progress': 'none',
                            'OmitFailures': omit_failures,
                        })
                non_cache_typed_query_object_ids = list(base.names(query_dps))
            else:
                non_cache_typed_query_object_ids = []
                query_dps = []

            # If we found cached items before, use them to complete the query
            # objects.
            if use_cache and query_cache_objects_dps:
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
                point_data = Matrix(robjects.FloatVector(target_pointset.points),
                        nrow=n_points, byrow=True)
                pointsets.append(point_data)

            query_objects = rnat.as_neuronlist(pointsets)
            effective_query_object_ids = typed_query_object_ids
            query_objects.names = robjects.StrVector(effective_query_object_ids)

            logger.debug('Computing query pointset stats')
            query_dps = rnat.dotprops(query_objects.ro / 1e3, **{
                        'k': config.tangent_neighbors,
                        'resample': 1,
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
                target_cache_objects_dps = None
                n_target_objects = len(target_object_ids)
                if use_cache and skeleton_cache:
                    # Find all skeleton IDs that aren't part of the cache
                    # TODO: There must be a simler way to extract non-NA values only
                    target_object_id_str = robjects.StrVector(list(map(str, target_object_ids)))
                    target_cache_objects_dps = skeleton_cache.rx(target_object_id_str)
                    non_na_ids = list(filter(lambda x: type(x) == str,
                            list(base.names(target_cache_objects_dps))))
                    cache_typed_target_object_ids = non_na_ids
                    target_cache_objects_dps = rnat.subset_neuronlist(
                            target_cache_objects_dps, robjects.StrVector(non_na_ids))
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
                    target_objects = rcatmaid.read_neurons_catmaid(
                            robjects.IntVector(effective_target_object_ids), **{
                                'conn': conn,
                                '.progress': 'none',
                                'OmitFailures': omit_failures,
                            })

                    if simplify:
                        logger.debug("Simplifying target neurons, removing parts below branch level {}".format(required_branches))
                        target_objects = robjects.r.nlapply(target_objects,
                                relmr.simplify_neuron, **{
                                    'n': required_branches,
                                    'OmitFailures': omit_failures,
                                    '.parallel': parallel,
                                })

                    logger.debug('Computing target skeleton stats')
                    target_dps = rnat.dotprops(target_objects.ro / 1e3, **{
                                'k': config.tangent_neighbors,
                                'resample': 1,
                                '.progress': 'none',
                                'OmitFailures': omit_failures,
                            })
                    non_cache_typed_target_object_ids = list(base.names(target_dps))
                else:
                    target_dps = []
                    non_cache_typed_target_object_ids = []

                # If we found cached items before, use them to complete the target
                # objects.
                if use_cache and target_cache_objects_dps:
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
                    # Find all skeleton IDs that aren't part of the cache
                    # TODO: There must be a simler way to extract non-NA values only
                    target_object_id_str = robjects.StrVector(list(map(str, target_object_ids)))
                    target_cache_objects_dps = pointcloud_cache.rx(target_object_id_str)
                    non_na_ids = list(filter(lambda x: type(x) == str,
                            list(base.names(target_cache_objects_dps))))
                    target_cache_objects_dps = rnat.subset_neuronlist(
                            target_cache_objects_dps, robjects.StrVector(non_na_ids))
                    cache_typed_target_object_ids = list(map(
                            lambda x: "pointcloud-{}".format(x),
                            list(base.names(target_cache_objects_dps))))
                    effective_target_object_ids = list(filter(
                            # Only allow neurons that are not part of the cache
                            lambda x: target_cache_objects_dps.rx2(str(x)) == robjects.NULL,
                            target_object_ids))
                    target_cache_objects_dps.names = robjects.StrVector(cache_typed_target_object_ids)
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
                        point_data = Matrix(robjects.FloatVector(points_flat),
                                nrow=n_points, byrow=True)
                        pointclouds.append(point_data)

                    target_objects = rnat.as_neuronlist(pointclouds)
                    non_cache_typed_target_object_ids = list(map(
                            lambda x: "pointcloud-{}".format(x), effective_target_object_ids))
                    target_objects.names = robjects.StrVector(non_cache_typed_target_object_ids)

                    logger.debug('Computing target pointcloud stats')
                    target_dps = rnat.dotprops(target_objects.ro / 1e3, **{
                                'k': config.tangent_neighbors,
                                'resample': 1,
                                '.progress': 'none',
                                'OmitFailures': omit_failures,
                            })
                    non_cache_typed_target_object_ids = list(base.names(target_dps))
                else:
                    non_cache_typed_target_object_ids = []
                    target_dps = []

                # If we found cached items before, use them to complete the target
                # objects.
                if use_cache and target_cache_objects_dps:
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
                    point_data = Matrix(robjects.FloatVector(target_pointset.points),
                            nrow=n_points, byrow=True)
                    pointsets.append(point_data)

                target_objects = rnat.as_neuronlist(pointsets)
                target_objects.names = robjects.StrVector(typed_target_object_ids)

                logger.debug('Computing target pointset stats')
                target_dps = rnat.dotprops(target_objects.ro / 1e3, **{
                            'k': config.tangent_neighbors,
                            'resample': 1,
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
        smat = Matrix(robjects.FloatVector(cells), nrow=dist_bins, byrow=True)

        # Set relevant attributes on similarity matrix. The nat.nblast code
        # expects this.
        rdistbreaks = robjects.FloatVector(config.distance_breaks)
        rdotbreaks = robjects.FloatVector(config.dot_breaks)
        smat.do_slot_assign('distbreaks', rdistbreaks)
        smat.do_slot_assign('dotprodbreaks', rdotbreaks)

        logger.debug('Computing score (alpha: {a}, noramlized: {n})'.format(**{
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
            all_objects = rnat.as_neuronlist(robjects.r.c(query_dps, target_dps))
            all_objects.names = robjects.StrVector(list(base.names(query_dps)) +
                    list(base.names(target_dps)))
            all_scores = rnblast.NeuriteBlast(all_objects, all_objects, **nblast_params)
            if len(all_scores) == 1:
                all_Scores = Matrix(all_scores, **{
                    'dimnames': robjects.StrVector(list(
                        list(base.names(query_dps)),
                        list(base.names(target_dps)))),
                })
            scores = rnblast.sub_score_mat(typed_query_object_ids,
                    typed_target_object_ids, **{
                        'scoremat': all_scores,
                        'normalisation': 'mean',
                    })
        else:
            scores = rnblast.NeuriteBlast(query_dps, target_dps, **nblast_params)

        # NBLAST by default will simplify the result in cases where there is
        # only a one to one correspondence. Fix this to our expectation to have
        # lists for both rows and columns.
        if type(scores) == robjects.vectors.FloatVector:
            # In case of a single query object, the result should be a single
            # result vector for the query object. If there are multiple query
            # objects, there should be one result list per query object.
            if len(query_object_ids) == 1:
                similarity = [numpy.asarray(scores).tolist()]
            else:
                similarity = [[s] for s in numpy.asarray(scores).tolist()]

            column_names = typed_query_object_ids
            row_names = typed_target_object_ids
        else:
            # Scores are returned with query skeletons as columns, but we want them
            # as rows, because it matches our expected queries more. Therefore
            # we have to transpose it using the 't()' R function.
            similarity = numpy.asarray(robjects.r['t'](scores)).tolist()

            column_names = scores.colnames
            row_names = scores.rownames

        # Collect IDs of query and target objects effectively in use. Note that
        # columns and rows are still in R's format (query = columns, target =
        # rows) and have not yet been transposed.
        if query_type == 'skeleton':
            query_object_ids_in_use = list(map(int, column_names))
        elif query_type == 'pointcloud':
            query_object_ids_in_use = list(map(lambda x: int(x.lstrip('pointcloud-')), column_names))
        elif query_type == 'pointset':
            query_object_ids_in_use = list(map(lambda x: int(x.lstrip('pointset-')), column_names))

        if target_type == 'skeleton':
            target_object_ids_in_use = list(map(int, row_names))
        elif target_type == 'pointcloud':
            target_object_ids_in_use = list(map(lambda x: int(x.lstrip('pointcloud-')), row_names))
        elif target_type == 'pointset':
            target_object_ids_in_use = list(map(lambda x: int(x.lstrip('pointset-')), row_names))

        if not similarity:
            raise ValueError("Could not compute similarity")

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
