# -*- coding: utf-8 -*-

from itertools import chain
import json
import logging
from timeit import default_timer as timer
from typing import Any, Dict, List

from celery.task import task
from celery.utils.log import get_task_logger
from django.contrib.gis.db import models as spatial_models
from django.db import connection, transaction
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils.decorators import method_decorator

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view

from catmaid.consumers import msg_user
from catmaid.control.authentication import (requires_user_role,
        can_edit_or_fail, check_user_role)
from catmaid.control.common import (insert_into_log, get_class_to_id_map,
        get_relation_to_id_map, _create_relation, get_request_bool,
        get_request_list)
from catmaid.models import (NblastConfig, NblastSample, Project, PointSet,
        NblastConfigDefaultDistanceBreaks, NblastConfigDefaultDotBreaks,
        NblastSimilarity, PointCloud, UserRole)
from catmaid.control.nat import (compute_scoring_matrix, nblast,
        test_r_environment, setup_r_environment)
from catmaid.control.pointcloud import list_pointclouds


logger = get_task_logger(__name__)


def serialize_sample(sample) -> Dict[str, Any]:
    return {
        'id': sample.id,
        'user_id': sample.user_id,
        'creation_time': sample.creation_time,
        'project_id': sample.project_id,
        'name': sample.name,
        'sample_neurons': sample.sample_neurons,
        'sample_pointsets': sample.sample_pointsets,
        'sample_pointclouds': sample.sample_pointclouds,
        'histogram': sample.histogram,
        'probability': sample.probability,
        'subset': sample.subset,
    }


def serialize_config(config, simple=False) -> Dict[str, Any]:
    if simple:
        return {
            'id': config.id,
            'name': config.name,
            'status': config.status,
        }
    else:
        return {
            'id': config.id,
            'user_id': config.user_id,
            'creation_time': config.creation_time,
            'edition_time': config.edition_time,
            'project_id': config.project_id,
            'name': config.name,
            'status': config.status,
            'distance_breaks': config.distance_breaks,
            'dot_breaks': config.dot_breaks,
            'match_sample': serialize_sample(config.match_sample),
            'random_sample': serialize_sample(config.random_sample),
            'scoring': config.scoring,
            'resample_step': config.resample_step,
            'tangent_neighbors': config.tangent_neighbors,
        }


def serialize_similarity(similarity, with_scoring=False, with_objects=False) -> Dict[str, Any]:
    serialized_similarity = {
        'id': similarity.id,
        'user_id': similarity.user_id,
        'creation_time': similarity.creation_time,
        'edition_time': similarity.edition_time,
        'project_id': similarity.project_id,
        'config_id': similarity.config_id,
        'name': similarity.name,
        'status': similarity.status,
        'scoring': similarity.scoring if with_scoring else [],
        'query_type': similarity.query_type_id,
        'target_type': similarity.target_type_id,
        'use_alpha': similarity.use_alpha,
        'normalized': similarity.normalized,
        'detailed_status': similarity.detailed_status,
        'computation_time': similarity.computation_time,
        'n_query_objects': len(similarity.query_objects) \
                if similarity.query_objects else 0,
        'n_target_objects': len(similarity.target_objects) \
                if similarity.target_objects else 0,
        'n_invalid_query_objects': len(similarity.invalid_query_objects) \
                if similarity.invalid_query_objects else 0,
        'n_invalid_target_objects': len(similarity.invalid_target_objects) \
                if similarity.invalid_target_objects else 0,
        'n_initial_query_objects': len(similarity.initial_query_objects) \
                if similarity.initial_query_objects else None,
        'n_initial_target_objects': len(similarity.initial_target_objects) \
                if similarity.initial_target_objects else None,
        'reverse': similarity.reverse,
        'top_n': similarity.top_n,
    }

    if with_objects:
        serialized_similarity.update({
            'query_objects': similarity.query_objects,
            'target_objects': similarity.target_objects,
            'initial_query_objects': similarity.initial_query_objects,
            'initial_target_objects': similarity.initial_target_objects,
            'invalid_query_objects': similarity.invalid_query_objects,
            'invalid_target_objects': similarity.invalid_target_objects,
        })
    else:
        serialized_similarity.update({
            'query_objects': [],
            'target_objects': [],
            'invalid_query_objects': [],
            'invalid_target_objects': [],
            # None as initial object specifies "all" of the respective type.
            # This information can be maintained for no-object mode.
            'initial_query_objects': [] if similarity.initial_query_objects else None,
            'initial_target_objects': [] if similarity.initial_target_objects else None,
        })


    return serialized_similarity


def serialize_pointcloud(pointcloud, with_locations=False, with_images=False) -> Dict[str, Any]:
    data = {
        'id': pointcloud.id,
        'user_id': pointcloud.user_id,
        'creation_time': pointcloud.creation_time,
        'project_id': pointcloud.project_id,
        'config_id': pointcloud.config_id,
        'name': pointcloud.name,
        'description': pointcloud.description,
        'source_path': pointcloud.source_path,
    }

    if with_locations:
        # All points of the pointcloud, stored as an array o XYZ-Arrays. The
        # coordinates are expected to be in project space coordinates.
        data['locations'] = pointcloud.locations

    if with_images:
        data['z_proj_original_image'] = spatial_models.RasterField()
        data['z_proj_pointcloud_image'] = spatial_models.RasterField()

    return data


def install_dependencies() -> None:
    """Install all R rependencies.
    """
    setup_r_environment()


@requires_user_role(UserRole.Browse)
def test_setup(request, project_id) -> JsonResponse:
    """Test if all required R packages are installed to use the NBLAST API.
    """
    return test_r_environment()


class ConfigurationDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id, config_id) -> JsonResponse:
        """Requests a NBLAST configuration.
        """
        config = NblastConfig.objects.get(pk=config_id, project_id=project_id)
        return JsonResponse(serialize_config(config))

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request:HttpRequest, project_id, config_id) -> JsonResponse:
        """Delete a NBLAST configuration.
        """
        can_edit_or_fail(request.user, config_id, 'nblast_config')
        config = NblastConfig.objects.get(pk=config_id, project_id=project_id)

        cursor = connection.cursor()
        cursor.execute("""
            DELETE FROM nblast_config
            WHERE project_id=%s AND id = %s
        """, [project_id, config_id])

        return JsonResponse({
            'deleted': True,
            'config_id': config_id
        })


class ConfigurationList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id) -> JsonResponse:
        """List all available NBLAST configurations.
        ---
        parameters:
          - name: project_id
            description: Project of the returned configurations
            type: integer
            paramType: path
            required: true
          - name: simple
            description: Wheter or not only ID and name should be returned
            type: bool
            paramType: form
            required: false
            defaultValue: false
        """
        simple = get_request_bool(request.query_params, 'simple', False)
        return JsonResponse([serialize_config(c, simple) for c in
                NblastConfig.objects.filter(project_id=project_id)], safe=False)

    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def put(self, request:Request, project_id) -> Response:
        """Create a new similarity/NBLAST configuration either by providing
        parameters to have the back-end queue a job or by providing the complete
        matrix data.
        ---
        parameters:
          - name: project_id
            description: Project of the NBLAST configuration
            type: integer
            paramType: path
            required: true
          - name: name
            description: Name of the new NBLAST configuration
            type: string
            paramType: form
            required: true
          - name: source
            description: Where random skeletons come from. Either
            "data", "request" or "backend-random".
            required: false
            defaultValue: "backend-random"
            paramType: form
          - name: distance_breaks
            description: Bin boundaries for the distance in nm. Defaults to [0, 500] in an increasing logarithmic bin sizw
            required: false
            defaultValue: 21
            paramType: form
          - name: dot_breaks
            description: Bin boundaries for the absolute dot product. Defaults to [0, 1] in 0.1 steps.
            required: false
            defaultValue: 10
            paramType: form
          - name: tangent_neighbors
            description: The number of neighbor nodes that should be considered when computing a tangent vector.
            required: false
            defaultValue: 20
            paramType: form
          - name: matching_skeleton_ids
            description: A list of matching skeleton IDs if <source> is not "data".
            required: false
            defaultValue: []
            paramType: form
          - name: matching_pointset_ids
            description: A list of matching pointset IDs if <source> is not "data".
            required: false
            defaultValue: []
            paramType: form
          - name: matching_pointcloud_ids
            description: A list of matching pointcloud IDs if <source> is not "data".
            required: false
            defaultValue: []
            paramType: form
          - name: random_skeleton_ids
            description: A list of random skeleton IDs if <source> is not "request".
            required: false
            defaultValue: []
            paramType: form
          - name: matching_sample_id
            description: An NblastSample foreign key of the matching sample.
            required: false
            defaultValue: None
            paramType: form
          - name: random_sample_id
            description: An NblastSample foreign key tp a random sample.
            required: false
            defaultValue: None
            paramType: form
        """
        name = request.data.get('name')
        if not name:
            raise ValueError("Need name")

        source = request.data.get('source', 'backend-random')
        distance_breaks = get_request_list(request.data, 'distance_breaks', map_fn=float)
        dot_breaks = get_request_list(request.data, 'dot_breaks', map_fn=float)
        tangent_neighbors = int(request.data.get('tangent_neighbors', '20'))
        matching_sample_id = int(request.data.get('matching_sample_id')) \
                if 'matching_sample_id' in request.data else None
        random_sample_id = int(request.data.get('random_sample_id')) \
                if 'random_sample_id' in request.data else None
        min_length = float(request.data.get('min_length', 0))
        min_nodes = int(request.data.get('min_nodes', 50))
        user_id = request.user.id

        matching_skeleton_ids = get_request_list(request.data,
                'matching_skeleton_ids', map_fn=int)
        matching_pointset_ids = get_request_list(request.data,
                'matching_pointset_ids', map_fn=int)
        matching_pointcloud_ids = get_request_list(request.data,
                'matching_pointcloud_ids', map_fn=int)
        random_skeleton_ids = get_request_list(request.data,
                'random_skeleton_ids', map_fn=int)
        matching_meta = request.POST.get('matching_meta')
        if matching_meta:
            matching_meta = json.loads(matching_meta)
        matching_subset = request.POST.get('matching_subset')
        if matching_subset:
            matching_subset = json.loads(matching_subset)

            if type(matching_subset) != list:
                raise ValueError("Expected matching_subset to be a list")

            for subset in matching_subset:
                if type(subset) != list:
                    raise ValueError("Expected all matching_subset elements to be list")
                for element in subset:
                    if type(element) != list or len(element) != 2:
                        raise ValueError("Expeceted subset elements to be lists with two elements")
                    if type(element[0]) != int or type(element[1]) != int:
                            raise ValueError("Expected subset selements to consist of ints")

        # Cancel if user isn't allowed to queue computation tasks
        p = Project.objects.get(pk=project_id)
        has_role = check_user_role(request.user, p, UserRole.QueueComputeTask)
        if not has_role:
            raise PermissionError("User " + str(request.user.id) +
                    " doesn't have permission to queue computation tasks.")

        # Load and store point sets, if there are any.
        if matching_pointset_ids and matching_meta:
            created_ids = []
            for pointset_id in matching_pointset_ids:
                pointset_data = matching_meta.get(str(pointset_id))
                if not pointset_data:
                    raise ValueError("Could not find data for pointset {}".format(pointset_id))
                flat_points = list(chain.from_iterable(pointset_data['points']))
                pointset = PointSet.objects.create(project_id=project_id,
                        user=request.user, name=pointset_data['name'],
                        description=pointset_data.get('description'),
                        points=flat_points)
                pointset.save()
                created_ids.append(pointset.id)

                # Update matching_subset with actual ID of point set. The subset
                # is a list of lists that represent the subsets. Each subset
                # element is a list of two elements [type, id]. For skeletons
                # the ID is 0, for point sets the ID is 1 and for point clouds
                # the ID is 2.
                if matching_subset:
                    for subset in matching_subset:
                        for element in subset:
                            if element[0] == 1 and element[1] == pointset_id:
                                element[1] = pointset.id

            # Update matching point set IDs with actual
            matching_pointset_ids = created_ids

        if not dot_breaks:
            dot_breaks = NblastConfigDefaultDotBreaks

        if not distance_breaks:
            distance_breaks = NblastConfigDefaultDistanceBreaks

        # Make sure bins and breaks match

        if source == 'data':
            data = request.data['data']
            config = self.add_from_raw_data(data, distance_breaks, dot_breaks,
                    matching_sample_id, random_sample_id)
            return Response(serialize_config(config))
        elif source == 'request':
            if not matching_skeleton_ids and not matching_pointset_ids:
                raise ValueError("Need matching_skeleton_ids or matching_pointset_ids")
            if not random_skeleton_ids:
                raise ValueError("Need random_skeleton_ids")
            config = self.add_delayed(project_id, user_id, name, matching_skeleton_ids,
                    matching_pointset_ids, random_skeleton_ids, distance_breaks,
                    dot_breaks, tangent_neighbors=tangent_neighbors,
                    matching_subset=matching_subset)
            return Response(serialize_config(config))
        elif source == 'backend-random':
            if not matching_skeleton_ids and not matching_pointset_ids:
                raise ValueError("Need matching_skeleton_ids or matching_pointset_ids")
            n_random_skeletons = int(request.data.get('n_random_skeletons', 5000))

            # Cancel if user isn't allowed to queue computation tasks
            p = Project.objects.get(pk=project_id)
            has_role = check_user_role(request.user, p, UserRole.QueueComputeTask)
            if not has_role:
                raise PermissionError("User " + str(request.user.id) +
                        " doesn't have permission to queue computation tasks.")

            config = self.compute_random_and_add_delayed(project_id, user_id, name,
                    matching_skeleton_ids, matching_pointset_ids,
                    matching_pointcloud_ids, distance_breaks, dot_breaks, None,
                    None, n_random_skeletons, min_length, min_nodes,
                    tangent_neighbors, matching_subset)
            return Response(serialize_config(config))
        else:
            raise ValueError("Unknown source: " + source)

    def add_from_raw_data(self, project_id, user_id, name, data,
            distance_breaks=NblastConfigDefaultDistanceBreaks,
            dot_breaks=NblastConfigDefaultDotBreaks, match_sample_id=None,
            random_sample_id=None, tangent_neighbors=20):
        """Add a scoring matrix based on the passed in array of arrays and
        dimensions.
        """
        histogram = [] # type: List
        probability = [] # type: List

        if match_sample_id:
            match_sample = NblastSample.objects.get(id=match_sample_id)
        else:
            match_sample = NblastSample.objects.create(project_id=project_id,
                    user_id=user_id, name="Empty matching sample",
                    sample_neurons=[], histogram=histogram,
                    probability=probability)

        if random_sample_id:
            random_sample = NblastSample.objects.get(id=random_sample_id)
        else:
            random_sample = NblastSample.objects.create(project_id=project_id,
                    user_id=user_id, name="Empty random sample",
                    sample_neurons=[], histogram=histogram,
                    probability=probability)

        # Test whether the passed in scoring data actually matches binning
        # information.
        scoring = data

        return NblastConfig.objects.create(project_id=project_id,
            user=user_id, name=name, status='complete',
            distance_breaks=distance_breaks, dot_breaks=dot_breaks,
            match_sample=match_sample, random_sample=random_sample,
            scoring=None, tangent_neighbors=tangent_neighbors)

    def add_delayed(self, project_id, user_id, name, matching_skeleton_ids,
            matching_pointset_ids, random_skeleton_ids,
            distance_breaks=NblastConfigDefaultDistanceBreaks,
            dot_breaks=NblastConfigDefaultDotBreaks, match_sample_id=None,
            random_sample_id=None, tangent_neighbors=20, matching_subset=None):
        """Create and queue a new Celery task to create the scoring matrix.
        """
        histogram = [] # type: List
        probability = [] # type: List

        if match_sample_id:
            match_sample = NblastSample.objects.get(id=match_sample_id)
        else:
            match_sample = NblastSample.objects.create(project_id=project_id,
                    user_id=user_id, name="Matching sample",
                    sample_neurons=matching_skeleton_ids,
                    sample_pointsets=matching_pointset_ids, histogram=histogram,
                    probability=probability, subset=matching_subset)

        if random_sample_id:
            random_sample = NblastSample.objects.get(id=random_sample_id)
        else:
            random_sample = NblastSample.objects.create(project_id=project_id,
                    user_id=user_id, name="Random sample",
                    sample_neurons=[], histogram=histogram,
                    probability=probability)

        config = NblastConfig.objects.create(project_id=project_id,
            user=user_id, name=name, status='queued',
            distance_breaks=distance_breaks, dot_breaks=dot_breaks,
            match_sample=match_sample, random_sample=random_sample,
            scoring=None, tangent_neighbors=tangent_neighbors)

        # Queue recomputation task
        task = recompute_config.delay(config.id)

        return config

    def compute_random_and_add_delayed(self, project_id, user_id, name,
            matching_skeleton_ids, matching_pointset_ids,
            matching_pointcloud_ids, distance_breaks=NblastConfigDefaultDistanceBreaks,
            dot_breaks=NblastConfigDefaultDotBreaks, match_sample_id=None,
            random_sample_id=None, n_random_skeletons=5000, min_length=0,
            min_nodes=100, tangent_neighbors=20, matching_subset=None):
        """Select a random set of neurons, optionally of a minimum length and
        queue a job to compute the scoring matrix.
        """
        histogram = [] # type: List
        probability = [] # type: List

        with transaction.atomic():
            if match_sample_id:
                match_sample = NblastSample.objects.get(id=match_sample_id,
                        project_id =project_id)
            else:
                # Find random skeleton IDs with an optional minimum length
                cursor = connection.cursor()
                cursor.execute("""
                    SELECT css.skeleton_id
                    FROM catmaid_skeleton_summary css
                    JOIN UNNEST(%(skeleton_ids)s::int[]) skeleton(id)
                        ON css.skeleton_id = skeleton.id
                    WHERE project_id = %(project_id)s
                        AND cable_length >= %(min_cable)s
                        AND num_nodes >= %(min_nodes)s
                """, {
                    'project_id': project_id,
                    'min_cable': min_length,
                    'min_nodes': min_nodes,
                    'skeleton_ids': matching_skeleton_ids
                })
                filtered_matching_skeleton_ids = [r[0] for r in cursor.fetchall()]
                match_sample = NblastSample.objects.create(project_id=project_id,
                        user_id=user_id, name="Matching sample",
                        sample_neurons=filtered_matching_skeleton_ids,
                        sample_pointsets=matching_pointset_ids,
                        sample_pointclouds=matching_pointcloud_ids,
                        histogram=histogram, probability=probability,
                        subset=matching_subset)

            if random_sample_id:
                random_sample = NblastSample.objects.get(id=random_sample_id,
                        project_id=project_id)
            else:
                # Find random skeleton IDs with an optional minimum length
                cursor = connection.cursor()
                cursor.execute("""
                    SELECT skeleton_id
                    FROM catmaid_skeleton_summary
                    WHERE project_id = %(project_id)s
                        AND cable_length >= %(min_cable)s
                        AND num_nodes >= %(min_nodes)s
                    ORDER BY random()
                    LIMIT %(limit)s
                """, {
                    'limit': n_random_skeletons,
                    'project_id': project_id,
                    'min_cable': min_length,
                    'min_nodes': 100
                })
                random_skeleton_ids = [r[0] for r in cursor.fetchall()]
                random_sample = NblastSample.objects.create(project_id=project_id,
                        user_id=user_id, name="Random sample",
                        sample_neurons=random_skeleton_ids,
                        histogram=histogram, probability=probability)


            # Queue recomputation task
            config = NblastConfig.objects.create(project_id=project_id,
                user_id=user_id, name=name, status='queued',
                distance_breaks=distance_breaks, dot_breaks=dot_breaks,
                match_sample=match_sample, random_sample=random_sample,
                scoring=None, tangent_neighbors=tangent_neighbors)

            transaction.on_commit(lambda: compute_nblast_config.delay(config.id,
                    user_id))

        return config


@requires_user_role(UserRole.QueueComputeTask)
def recompute_config(request:HttpRequest, project_id, config_id) -> JsonResponse:
    """Recompute the similarity matrix of the passed in NBLAST configuration.
    """
    can_edit_or_fail(request.user, config_id, 'nblast_config')
    use_cache = get_request_bool(request.GET, 'use_cache', True)
    task = compute_nblast_config.delay(config_id, request.user.id,
            use_cache=use_cache)

    return JsonResponse({
        'status': 'queued',
        'task_id': task.task_id
    })


@task()
def compute_nblast_config(config_id, user_id, use_cache=True) -> str:
    """Recompute the scoring information for a particular configuration,
    including both the matching skeleton set and the random skeleton set.
    """
    try:
        with transaction.atomic():
            config = NblastConfig.objects.select_related('match_sample', 'random_sample').get(pk=config_id)
            config.status = 'computing'
            config.save()

        scoring_info = compute_scoring_matrix(config.project_id, user_id,
                config.match_sample, config.random_sample,
                config.distance_breaks, config.dot_breaks,
                config.resample_step, config.tangent_neighbors)

        # Update config and samples
        if scoring_info['errors']:
            config.status = 'error'
        else:
            config.status = 'complete'
            config.scoring = scoring_info['similarity']
            config.match_sample.histogram = scoring_info['matching_histogram']
            config.match_sample.probability = scoring_info['matching_probability']
            config.random_sample.histogram = scoring_info['random_histogram']
            config.random_sample.probability = scoring_info['random_probability']
            config.save()
            config.match_sample.save()
            config.random_sample.save()

        msg_user(user_id, 'similarity-config-update', {
            'config_id': config.id,
            'config_status': config.status,
        })

        return "Recomputed NBLAST configuration {}".format(config.id)
    except:
        configs = NblastConfig.objects.filter(pk=config_id)
        if configs:
            config = configs[0]
            config.status = 'error'
            config.save()

            msg_user(user_id, 'similarity-config-update', {
                'config_id': config.id,
                'config_status': config.status,
            })

        import traceback
        logger.info(traceback.format_exc())

        return "Recomputing NBLAST Configuration failed"


def get_all_object_ids(project_id, user_id, object_type, min_nodes=500,
        min_soma_nodes=20, soma_tags=('soma'), limit=None) -> List:
    """Return all IDs of objects that fit the query parameters.
    """
    cursor = connection.cursor()

    if object_type == 'skeleton':
        extra_where = []
        params = {
            'project_id': project_id,
            'limit': limit,
        }

        if min_nodes:
            extra_where.append("""
                css.num_nodes >= %(min_nodes)s
            """)
            params['min_nodes'] = min_nodes

        cursor.execute("""
            SELECT skeleton_id
            FROM catmaid_skeleton_summary css
            WHERE project_id = %(project_id)s
            {extra_where}
            {limit}
        """.format(**{
            'extra_where': ' AND '.join([''] + extra_where) if extra_where else '',
            'limit': 'LIMIT %(limit)s' if limit is not None else '',
        }), params)

        return [o[0] for o in cursor.fetchall()]
    elif object_type == 'pointcloud':
        return [pc['id'] for pc in list_pointclouds(project_id, user_id, simple=True)]
    else:
        raise ValueError("Referring to all pointset objects at the same time "
                "isn't supported yet")


@task()
def compute_nblast(project_id, user_id, similarity_id, remove_target_duplicates,
        simplify=True, required_branches=10, use_cache=True, use_http=False) -> str:
    start_time = timer()
    try:
        # TODO This should be configurable.
        min_nodes = 500
        min_soma_nodes = 20
        soma_tags = ('soma',)

        # Store status update and make this change immediately available.
        with transaction.atomic():
            similarity = NblastSimilarity.objects.select_related('config').get(
                    project_id=project_id, pk=similarity_id)
            similarity.status = 'computing'
            similarity.save()

        query_object_ids = similarity.initial_query_objects
        target_object_ids = similarity.initial_target_objects

        # Fill in object IDs, if not yet present
        updated = False
        if not query_object_ids:
            query_object_ids = get_all_object_ids(project_id, user_id,
                    similarity.query_type_id, min_nodes, min_soma_nodes,
                    soma_tags)
        if not target_object_ids:
            target_object_ids = get_all_object_ids(project_id, user_id,
                    similarity.target_type_id, min_nodes, min_soma_nodes,
                    soma_tags)

        similarity.target_objects = target_object_ids
        similarity.query_objects = query_object_ids
        similarity.save()

        config = similarity.config
        if not config.status == 'complete':
            raise ValueError("NBLAST config #" + config.id +
                "isn't marked as complete")

        # Make sure we have a scoring matrix
        if not config.scoring:
            raise ValueError("NBLAST config #" + config.id +
                " doesn't have a computed scoring.")

        scoring_info = nblast(project_id, user_id, config.id,
                query_object_ids, target_object_ids,
                similarity.query_type_id, similarity.target_type_id,
                normalized=similarity.normalized,
                use_alpha=similarity.use_alpha,
                remove_target_duplicates=remove_target_duplicates,
                simplify=simplify, required_branches=required_branches,
                use_cache=use_cache, reverse=similarity.reverse,
                top_n=similarity.top_n, use_http=use_http)

        duration = timer() - start_time

        # Update config and samples
        if scoring_info.get('errors'):
            raise ValueError("Errors during computation: {}".format(
                    ', '.join(str(i) for i in scoring_info['errors'])))
        else:
            similarity.status = 'complete'
            similarity.scoring = scoring_info['similarity']
            similarity.detailed_status =  ("Computed scoring for {} query " +
                    "skeletons vs {} target skeletons.").format(
                            len(similarity.query_objects) if similarity.query_objects is not None else '?',
                            len(similarity.target_objects) if similarity.target_objects is not None else '?')

            if scoring_info['query_object_ids']:
                invalid_query_objects = set(similarity.query_objects) - set(scoring_info['query_object_ids'])
                similarity.invalid_query_objects = list(invalid_query_objects)
                similarity.query_objects = scoring_info['query_object_ids']
            else:
                similarity.invalid_query_objects = None

            if scoring_info['target_object_ids']:
                invalid_target_objects = set(similarity.target_objects) - set(scoring_info['target_object_ids'])
                similarity.invalid_target_objects = list(invalid_target_objects)
                similarity.target_objects = scoring_info['target_object_ids']
            else:
                similarity.invalid_target_objects = None

            similarity.computation_time = duration
            similarity.save()

        msg_user(user_id, 'similarity-update', {
            'similarity_id': similarity.id,
            'similarity_status': similarity.status,
        })

        return "Computed new NBLAST similarity for config {}".format(config.id)
    except Exception as ex:
        duration = timer() - start_time
        similarities = NblastSimilarity.objects.filter(pk=similarity_id)
        if len(similarities) > 0:
            similarity = similarities[0]
            similarity.status = 'error'
            similarity.detailed_status = str(ex)
            similarity.computation_time = duration
            similarity.save()

            msg_user(user_id, 'similarity-update', {
                'similarity_id': similarity.id,
                'similarity_status': similarity.status,
            })

        import traceback
        logger.info(traceback.format_exc())

        return "Computing new NBLAST similarity failed"


@api_view(['POST'])
@requires_user_role(UserRole.Browse)
def compare_skeletons(request:HttpRequest, project_id) -> JsonResponse:
    """Compare two sets of objects (skeletons or point clouds) and return an
    NBLAST scoring based on an existing NBLAST configuration.
    ---
    parameters:
      - name: project_id
        description: Project to operate in
        type: integer
        paramType: path
        required: true
      - name: config_id
        description: ID of the new NBLAST configuration to use
        type: integer
        paramType: form
        required: true
      - name: query_ids
        description: Set of objects (skeletons or point clouds) to query similarity for.
        type: array
        paramType: form
        required: true
      - name: target_ids
        description: Set of objects (skeletons or point clouds) or point clouds to compare against.
        type: array
        paramType: form
        required: true
      - name: target_type
        description: Type of target objects, 'skeleton' or 'pointcloud'.
        type: string
        paramType: form
        required: false
        defaultValue: 'skeleton'
      - name: name
        description: Name for the similarity lookup task
        type: string
        paramType: form
        required: false
      - name: normalized
        description: Whether and how scores should be normalized.
        type: string
        enum: [raw, normalized, mean]
        paramType: form
        required: false
        defaultValue: mean
      - name: use_alpha
        description: Whether to consider local directions in the similarity computation
        type: boolean
        paramType: form
        required: false
        defaultValue: false
      - name: reverse
        description: If enabled, the target is matched against the query.
        type: boolean
        paramType: form
        required: false
        defaultValue: false
      - name: query_type_id
        description: Type of query data
        enum: [skeleton, point-cloud]
        type: string
        paramType: form
        defaultValue: skeleton
        required: false
      - name: target_type_id
        description: Type of query data
        enum: [skeleton, point-cloud]
        type: string
        paramType: form
        defaultValue: skeleton
        required: false
      - name: query_meta
        description: Extra data for the selected query type. A JSON encoded string is expected.
        type: string
        paramType: form
        required: false
      - name: target_meta
        description: Extra data for the selected target type. A JSON encoded string is expected.
        type: string
        paramType: form
        required: false
      - name: remove_target_duplicates
        description: Remove all target objects that appear also in the query.
        type: boolean
        required: false
        defaultValue: true
      - name: simplify
        description: Whether or not to simplify neurons and remove parts below a specified branch point level.
        type: boolean
        required: false
        defaultValue: true
      - name: required_branches
        description: The required branch levels if neurons should be simplified.
        type: int
        required: false
        defaultValue: 10
      - name: use_cache
        description: Whether or not to use cached data when computing similarity scores.
        type: boolean
        required: false
        defaultValue: true
      - name: top_n
        description: |
            How many results should be returned sorted by score. A
            value of zero dsiables this cutoff.
        type: int
        required: false
        defaultValue: 0
    """
    name = request.POST.get('name', None)
    if not name:
        n_similarity_tasks = NblastSimilarity.objects.filter(
                project_id=project_id).count()
        name = 'Task {}'.format(n_similarity_tasks + 1)

    config_id = request.POST.get('config_id', None)
    if not config_id:
        raise ValueError("Need NBLAST configuration ID")
    else:
        config_id = int(config_id)

    simplify = get_request_bool(request.POST, 'simplify', True)
    required_branches = int(request.POST.get('required_branches', '10'))
    use_cache = get_request_bool(request.POST, 'use_cache', True)

    valid_type_ids = ('skeleton', 'pointcloud', 'pointset')

    query_type_id = request.POST.get('query_type_id', 'skeleton')
    if query_type_id not in valid_type_ids:
        raise ValueError("Need valid query type id ({})".format(', '.join(valid_type_ids)))

    target_type_id = request.POST.get('target_type_id', 'skeleton')
    if target_type_id not in valid_type_ids:
        raise ValueError("Need valid target type id ({})".format(', '.join(valid_type_ids)))

    # Read potential query and target IDs. In case of skeletons and point
    # clouds, no IDs need to be provided, in which case all skeletons and point
    # clouds, respectively, will be used.
    query_ids = get_request_list(request.POST, 'query_ids', [], map_fn=int)
    if not query_ids and query_type_id not in ('skeleton', 'pointcloud'):
        raise ValueError("Need set of query objects (skeletons or point clouds) to compare")

    target_ids = get_request_list(request.POST, 'target_ids', map_fn=int)
    if not target_ids and target_type_id not in ('skeleton', 'pointcloud'):
        raise ValueError("Need set of target objects (skeletons or point clouds) to compare against")

    config = NblastConfig.objects.get(project_id=project_id, pk=config_id)

    if not config.status == 'complete':
        raise ValueError("NBLAST config #" + config.id +
            "isn't marked as complete")

    # Make sure we have a scoring matrix
    if not config.scoring:
        raise ValueError("NBLAST config #" + config.id +
            " doesn't have a computed scoring.")

    # Load potential query or target meta data
    query_meta = request.POST.get('query_meta')
    if query_meta:
        if not query_type_id == 'pointset':
            raise ValueError("Did not expect 'query_meta' parameter with {} query type".format(query_type_id))
        query_meta = json.loads(query_meta)
    target_meta = request.POST.get('target_meta')
    if target_meta:
        if not target_type_id == 'pointset':
            raise ValueError("Did not expect 'target_meta' parameter with {} target type".format(target_type_id))
        target_meta = json.loads(target_meta)

    # Other parameters
    normalized = request.POST.get('normalized', 'mean')
    reverse = get_request_bool(request.POST, 'reverse', True)
    use_alpha = get_request_bool(request.POST, 'use_alpha', False)
    top_n = int(request.POST.get('top_n', 0))
    remove_target_duplicates = get_request_bool(request.POST,
            'remove_target_duplicates', True)

    with transaction.atomic():
        # In case of a pointset, new pointset model objects needs to be created
        # before the similariy query is created.
        if query_type_id == 'pointset':
            created_ids = []
            for pointset_id in query_ids:
                pointset_data = query_meta.get(str(pointset_id))
                if not pointset_data:
                    raise ValueError("Could not find data for pointset {}".format(pointset_id))
                flat_points = list(chain.from_iterable(pointset_data['points']))
                pointset = PointSet.objects.create(project_id=project_id,
                        user=request.user, name=pointset_data['name'],
                        description=pointset_data.get('description'),
                        points=flat_points)
                pointset.save()
                created_ids.append(pointset.id)
            query_ids = created_ids
        if target_type_id == 'pointset':
            created_ids = []
            for pointset_id in target_ids:
                pointset_data = target_meta.get(str(pointset_id))
                if not pointset_data:
                    raise ValueError("Could not find data for pointset {}".format(pointset_id))
                flat_points = list(chain.from_iterable(pointset_data['points']))
                pointset = PointSet.objects.create(project_id=project_id,
                        user=request.user, name=pointset_data['name'],
                        description=pointset_data.get('description'),
                        points=flat_points)
                pointset.save()
                created_ids.append(pointset.id)
            target_ids = created_ids

        similarity = NblastSimilarity.objects.create(project_id=project_id,
                user=request.user, name=name, status='queued', config_id=config_id,
                initial_query_objects=query_ids,
                initial_target_objects=target_ids,
                query_type_id=query_type_id, target_type_id=target_type_id,
                normalized=normalized, reverse=reverse, use_alpha=use_alpha,
                top_n=top_n)
        similarity.save()

    task = compute_nblast.delay(project_id, request.user.id, similarity.id,
            remove_target_duplicates, simplify, required_branches,
            use_cache=use_cache)

    return JsonResponse({
        'task_id': task.task_id,
        'similarity': serialize_similarity(similarity),
    })


class SimilarityList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id) -> HttpResponse:
        """List all available NBLAST similarity tasks.
        ---
        parameters:
          - name: project_id
            description: Project of the returned similarities
            type: integer
            paramType: path
            required: true
          - name: config_id
            description: Return only similarities linked to this config
            type: integer
            paramType: form
            required: false
          - name: with_scoring
            description: Whether or not to include scoring information in response.
            type: boolean
            paramType: form
            required: false
            defaultValue: false
          - name: with_objects
            description: Whether or not to include query and target object IDs.
            type: boolean
            paramType: form
            required: false
            defaultValue: false
        """
        config_id = request.query_params.get('config_id', None)
        with_scoring = get_request_bool(request.query_params, 'with_scoring', False)
        with_objects = get_request_bool(request.query_params, 'with_objects', False)

        params = {
            'project_id': int(project_id)
        }

        if config_id is not None:
            params['config_id'] = config_id

        if with_scoring:
            return JsonResponse([serialize_similarity(c, with_scoring, with_objects) for c in
                    NblastSimilarity.objects.filter(**params)], safe=False)
        else:
            constraints = ['project_id = %(project_id)s']
            if config_id is not None:
                constraints.append('config_id = %(config_id)s')

            if with_objects:
                object_lists = """
                            query_objects,
                            target_objects,
                            invalid_query_objects,
                            invalid_target_objects,
                            initial_query_objects,
                            initial_target_objects,
                """
            else:
                object_lists = """
                            '{}'::bigint[] AS query_objects,
                            '{}'::bigint[] AS target_objects,
                            '{}'::bigint[] AS invalid_query_objects,
                            '{}'::bigint[] AS invalid_target_objects,
                            CASE WHEN initial_query_objects IS NULL THEN NULL ELSE '{}'::bigint[] END AS initial_query_objects,
                            CASE WHEN initial_target_objects IS NULL THEN NULL ELSE '{}'::bigint[] END AS initial_target_objects
                """

            scoring = "'{}'::real[] AS scoring"

            cursor = connection.cursor()
            cursor.execute("""
                SELECT COALESCE(sub.data, '[]'::json)::text
                FROM (
                    SELECT json_agg(row_to_json(wrapped)) AS data
                    FROM (
                        SELECT id, user_id, creation_time, edition_time, project_id,
                            config_id, name, status, use_alpha, normalized, detailed_status,
                            computation_time, reverse, top_n,
                            query_type_id AS query_type,
                            target_type_id AS target_type,
                            -- No scoreing is included, but return an empty list instead.
                            {scoring},
                            -- Initial objects can be NULL to refer to all
                            -- objects of a type. If this is the case, the returned
                            -- length should be NULL too, therefore skip COALESCE.
                            CASE WHEN initial_query_objects IS NULL THEN NULL ELSE array_length(initial_query_objects, 1) END AS n_initial_query_objects,
                            CASE WHEN initial_target_objects IS NULL THEN NULL ELSE array_length(initial_target_objects, 1) END AS n_initial_target_objects,
                            -- For other lengths, we want to return 0 if there are no values.
                            COALESCE(array_length(query_objects, 1), 0) AS n_query_objects,
                            COALESCE(array_length(target_objects, 1), 0) AS n_target_objects,
                            COALESCE(array_length(invalid_query_objects, 1), 0) AS n_invalid_query_objects,
                            COALESCE(array_length(invalid_target_objects, 1), 0) AS n_invalid_target_objects,
                            -- Array fields
                            {object_lists}
                        FROM nblast_similarity
                        WHERE {constraints}
                    ) wrapped
                ) sub
            """.format(**{
                'scoring': scoring,
                'object_lists': object_lists,
                'constraints': ' AND '.join(constraints),
            }), params)

            return HttpResponse(cursor.fetchone()[0], content_type='application/json')


class SimilarityDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id, similarity_id) -> JsonResponse:
        """Get a particular similarity query result.
        ---
        parameters:
          - name: project_id
            description: Project of the returned similarities
            type: integer
            paramType: path
            required: true
          - name: similarity_id
            description: The similarity  to load.
            type: integer
            paramType: form
            required: false
          - name: with_scoring
            description: Whether or not to include scoring information in response.
            type: boolean
            paramType: form
            required: false
            defaultValue: false
          - name: with_objects
            description: Whether or not to include query and target object IDs.
            type: boolean
            paramType: form
            required: false
            defaultValue: false
        """
        similarity = NblastSimilarity.objects.get(pk=similarity_id, project_id=project_id)
        with_scoring = get_request_bool(request.query_params, 'with_scoring', False)
        with_objects = get_request_bool(request.query_params, 'with_objects', False)

        return JsonResponse(serialize_similarity(similarity, with_scoring, with_objects))

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request:HttpRequest, project_id, similarity_id) -> JsonResponse:
        """Delete a NBLAST similarity task.
        """
        can_edit_or_fail(request.user, similarity_id, 'nblast_similarity')
        similarity = NblastSimilarity.objects.get(pk=similarity_id, project_id=project_id)

        cursor = connection.cursor()
        cursor.execute("""
            DELETE FROM nblast_similarity
            WHERE project_id=%s AND id = %s
        """, [project_id, similarity.id])

        return JsonResponse({
            'deleted': True,
            'config_id': similarity.id
        })


@requires_user_role(UserRole.QueueComputeTask)
def recompute_similarity(request:HttpRequest, project_id, similarity_id) -> JsonResponse:
    """Recompute the similarity matrix of the passed in NBLAST configuration.
    """
    simplify = get_request_bool(request.GET, 'simplify', True)
    required_branches = int(request.GET.get('required_branches', '10'))
    can_edit_or_fail(request.user, similarity_id, 'nblast_similarity')
    use_cache = get_request_bool(request.GET, 'use_cache', True)
    task = compute_nblast.delay(project_id, request.user.id, similarity_id,
            remove_target_duplicates=True, simplify=simplify,
            required_branches=required_branches, use_cache=use_cache)

    return JsonResponse({
        'status': 'queued',
        'task_id': task.task_id
    })
