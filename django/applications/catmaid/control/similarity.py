# -*- coding: utf-8 -*-

from itertools import chain
import json
import logging
import numpy as np
from timeit import default_timer as timer
from typing import Any, Dict, List
import sys

from celery import shared_task
from celery.utils.log import get_task_logger
from django.contrib.gis.db import models as spatial_models
from django.db import connection, transaction
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils.decorators import method_decorator
from django.db.utils import ProgrammingError

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view

from catmaid.consumers import msg_user
from catmaid.control.authentication import (requires_user_role,
        can_edit_or_fail, check_user_role, PermissionError)
from catmaid.control.common import (insert_into_log, get_class_to_id_map,
        get_relation_to_id_map, _create_relation, get_request_bool,
        get_request_list)
from catmaid.models import (NblastConfig, NblastSample, Project, PointSet,
        NblastConfigDefaultDistanceBreaks, NblastConfigDefaultDotBreaks,
        NblastSimilarity, PointCloud, UserRole)
from catmaid.control.nat.r import (compute_scoring_matrix, nblast,
        test_environment, setup_environment)
from catmaid.control.pointcloud import list_pointclouds

from psycopg2.extras import execute_batch


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
            'match_sample': serialize_sample(config.match_sample) if config.match_sample else None,
            'random_sample': serialize_sample(config.random_sample) if config.random_sample else None,
            'scoring': config.scoring,
            'resample_step': config.resample_step,
            'tangent_neighbors': config.tangent_neighbors,
        }


def serialize_scoring(similarity):
    """If the scoring stored directly in the similarity object is non-null, it
    is returned and assumed to be a Postgres large object. If it is null/none,
    results stored in the table nblast_similarity_score are returned.
    """
    cursor = connection.cursor()
    if similarity.scoring:
        pconn = cursor.cursor.connection
        lobj = pconn.lobject(oid=similarity.scoring, mode='rb')

        raw_data = np.frombuffer(lobj.read(), dtype=np.float32)
        data = raw_data.reshape((len(similarity.query_objects), len(similarity.target_objects)))

        return data.tolist()
    else:
        cursor.execute("""
            -- The UNNEST statements in the CTE qt below are hard to estimate
            -- and often leads to bad plans. Therefore, we add this hack to
            -- disable nested loop joins in this transaction, mitigating the bad
            -- row estimates. The remaining access patterns should still work
            -- well in all cases. See: https://dba.stackexchange.com/questions/306300
            SET LOCAL enable_nestloop = off;

            WITH qt AS (
                SELECT query.id as query_id, query.o as query_o,
                        target.id AS target_id, target.o AS target_o
                FROM nblast_similarity s,
                UNNEST(s.query_objects) WITH ORDINALITY AS query(id, o),
                UNNEST(s.target_objects) WITH ORDINALITY AS target(id, o)
                WHERE s.id = %(similarity_id)s
            ),
            scores AS (
                SELECT qt.*, COALESCE(nss.score, 0) AS score
                FROM qt
                LEFT JOIN nblast_similarity_score nss
                ON nss.query_object_id = qt.query_id
                AND nss.target_object_id = qt.target_id
                AND nss.similarity_id = %(similarity_id)s
            ),
            score_rows AS (
                SELECT query_o, array_agg(score ORDER BY target_o) as scores
                FROM scores
                GROUP BY query_o
            )
            SELECT array_agg(scores ORDER BY query_o)
            FROM score_rows;
        """, {
            'similarity_id': similarity.id
        })

        return cursor.fetchone()[0]

def serialize_simple():
    query = """
    WITH query AS NOT MATERIALIZED (
      SELECT DISTINCT query_object_id AS id,
            rank() OVER (ORDER BY query_object_id) AS o
      FROM nblast_similarity_score
      WHERE similarity_id = 44
      ORDER BY query_object_id
    ), target AS NOT MATERIALIZED (
      SELECT DISTINCT target_object_id AS id,
            rank() OVER (ORDER BY target_object_id) AS o
      FROM nblast_similarity_score
      WHERE similarity_id = 44
      ORDER BY target_object_id
    ),
    qt AS NOT MATERIALIZED (
      SELECT query.id as query_id,
            query.o AS query_o,
            target.id AS target_id,
            target.o AS target_o
      FROM query, target
    ),
    scores AS NOT MATERIALIZED (
      SELECT qt.*, COALESCE(nss.score, 0) AS score
      FROM qt
      LEFT JOIN nblast_similarity_score nss
      ON nss.query_object_id = qt.query_id
      AND nss.target_object_id = qt.target_id
      AND nss.similarity_id = 44
    ),
    score_rows AS NOT MATERIALIZED (
        SELECT query_o, array_agg(score ORDER BY target_o) as scores
        FROM scores
        GROUP BY query_o
    )
    SELECT array_agg(scores ORDER BY query_o)
    FROM score_rows;
    """


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
        'scoring': serialize_scoring(similarity) if with_scoring else [],
        'query_type': similarity.query_type_id,
        'target_type': similarity.target_type_id,
        'use_alpha': similarity.use_alpha,
        'normalized': similarity.normalized,
        'detailed_status': similarity.detailed_status,
        'computation_time': similarity.computation_time,
        'n_query_objects': len(similarity.query_objects) if similarity.query_objects else 0,
        'n_target_objects': len(similarity.target_objects) if similarity.target_objects else 0,
        'n_invalid_query_objects': len(similarity.invalid_query_objects) if similarity.invalid_query_objects else 0,
        'n_invalid_target_objects': len(similarity.invalid_target_objects) if similarity.invalid_target_objects else 0,
        'n_initial_query_objects': len(similarity.initial_query_objects) if similarity.initial_query_objects else None,
        'n_initial_target_objects': len(
            similarity.initial_target_objects
        ) if similarity.initial_target_objects else None,
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
    setup_environment()


@requires_user_role(UserRole.Browse)
def test_setup(request, project_id) -> JsonResponse:
    """Test if all required R packages are installed to use the NBLAST API.
    """
    return test_environment()


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
            description: Whether or not only ID and name should be returned
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
            description: |
              Where random skeletons come from. Either "data", "request" or
              "backend-random".
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
          - name: scoring
            description: |
                If passed in a new similarity matrix will be created based on
                this explict scoring. It is assumed to be a simple list which is
                organized in rows following each other sequentially. Requires
                distance binning and dot binning information.
            required: false
        """
        name = request.data.get('name')
        if not name:
            raise ValueError("Need name")

        # Cancel if user isn't allowed to queue computation tasks
        p = Project.objects.get(pk=project_id)

        distance_breaks = get_request_list(request.data, 'distance_breaks', map_fn=float)
        dot_breaks = get_request_list(request.data, 'dot_breaks', map_fn=float)

        scoring = get_request_list(request.data, 'scoring', map_fn=float)
        if not scoring:
            has_role = check_user_role(request.user, p, UserRole.QueueComputeTask)
            if not has_role:
                raise PermissionError("User " + str(request.user.id) +
                        " does not have permission to queue computation tasks.")

        source = request.data.get('source', 'backend-random')
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
                    if type(element[0]) not in (int, list) or type(element[1]) != int:
                        raise ValueError("Expected subset selements to consist of ints or lists of ints")

        # Load and store point sets, if there are any.
        if matching_pointset_ids and matching_meta:
            created_ids = []
            for pointset_id in matching_pointset_ids:
                pointset_data = matching_meta.get(str(pointset_id))
                if not pointset_data:
                    raise ValueError(f"Could not find data for pointset {pointset_id}")
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

        if scoring:
            config = self.add_from_raw_data(project_id, request.user.id, name,
                    scoring, distance_breaks, dot_breaks, tangent_neighbors)
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
                        " does not have permission to queue computation tasks.")

            config = self.compute_random_and_add_delayed(project_id, user_id, name,
                    matching_skeleton_ids, matching_pointset_ids,
                    matching_pointcloud_ids, distance_breaks, dot_breaks, None,
                    None, n_random_skeletons, min_length, min_nodes,
                    tangent_neighbors, matching_subset)
            return Response(serialize_config(config))
        else:
            raise ValueError("Unknown source: " + source)


    def add_from_raw_data(self, project_id, user_id, name, scoring,
            distance_breaks=NblastConfigDefaultDistanceBreaks,
            dot_breaks=NblastConfigDefaultDotBreaks,
            tangent_neighbors=20):
        """Add a scoring matrix based on the passed in array of arrays and
        dimensions.
        """
        return NblastConfig.objects.create(project_id=project_id,
            user_id=user_id, name=name, status='complete',
            distance_breaks=distance_breaks, dot_breaks=dot_breaks,
            match_sample=None, random_sample=None, scoring=scoring)


    def add_delayed(self, project_id, user_id, name, matching_skeleton_ids,
            matching_pointset_ids, random_skeleton_ids,
            distance_breaks=NblastConfigDefaultDistanceBreaks,
            dot_breaks=NblastConfigDefaultDotBreaks, match_sample_id=None,
            random_sample_id=None, tangent_neighbors=20, matching_subset=None):
        """Create and queue a new Celery task to create the scoring matrix.
        """
        histogram:List = []
        probability:List = []

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
        histogram:List = []
        probability:List = []

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
                    JOIN UNNEST(%(skeleton_ids)s::bigint[]) skeleton(id)
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


@shared_task()
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

        try:
            msg_user(user_id, 'similarity-config-update', {
                'config_id': config.id,
                'config_status': config.status,
            })
        except Exception as e:
            logger.error(f'Could not message user on successful NBLAST config recomputation: {e}')

        return f"Recomputed NBLAST configuration {config.id}"
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


def get_all_object_ids(project_id, user_id, object_type, min_length=15000,
        min_soma_length=1000, soma_tags=('soma'), limit=None, max_length=None,
        bb=None, max_length_exclusive=False) -> List:
    """Return all IDs of objects that fit the query parameters. A bounding box
    can optionally be provided with a dictionary having the keys minx, miny,
    minz, maxx, maxy, maxz.
    """
    cursor = connection.cursor()

    if object_type == 'skeleton':
        extra_where = []
        params = {
            'project_id': project_id,
            'limit': limit,
        }

        if min_length:
            extra_where.append("""
                css.cable_length >= %(min_length)s
            """)
            params['min_length'] = min_length

        if max_length:
            if max_length_exclusive:
                extra_where.append("""
                    css.cable_length < %(max_length)s
                """)
            else:
                extra_where.append("""
                    css.cable_length <= %(max_length)s
                """)
            params['max_length'] = max_length

        if bb:
            # If a bounding box is provided, drop all skeletons that don't
            # intersect
            extra_join = """
                JOIN (
                    WITH bb AS (
                      SELECT %(minx)s as minx, %(miny)s as miny, %(minz)s as minz,
                      %(maxx)s as maxx, %(maxy)s as maxy, %(maxz)s as maxz,
                      %(project_id)s as project_id
                    ),
                    req AS (
                      SELECT bb.*, (bb.maxz + bb.minz) / 2.0 as halfz,
                        (bb.maxz - bb.minz) / 2.0 as halfzdiff
                      FROM bb
                    ),
                    skeleton_in_bb AS (
                      SELECT DISTINCT t.skeleton_id AS id
                      FROM req, treenode_edge te
                      JOIN treenode t
                        ON t.id = te.id
                      WHERE te.edge &&& ST_MakeLine(ARRAY[
                        ST_MakePoint(req.minx, req.maxy, req.maxz),
                        ST_MakePoint(req.maxx, req.miny, req.minz)] ::geometry[])
                      AND ST_3DDWithin(te.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                        ST_MakePoint(req.minx, req.miny, req.halfz),
                        ST_MakePoint(req.maxx, req.miny, req.halfz),
                        ST_MakePoint(req.maxx, req.maxy, req.halfz),
                        ST_MakePoint(req.minx, req.maxy, req.halfz),
                        ST_MakePoint(req.minx, req.miny, req.halfz)]::geometry[])),
                        req.halfzdiff)
                      AND te.project_id = req.project_id
                    )
                    SELECT id
                    FROM skeleton_in_bb
                ) skeleton_in_bb(id)
                ON skeleton_in_bb.id = css.skeleton_id
            """
            params['minx'] = bb['minx']
            params['miny'] = bb['miny']
            params['minz'] = bb['minz']
            params['maxx'] = bb['maxx']
            params['maxy'] = bb['maxy']
            params['maxz'] = bb['maxz']
        else:
            extra_join = ''

        cursor.execute("""
            SELECT skeleton_id
            FROM catmaid_skeleton_summary css
            {extra_join}
            WHERE css.project_id = %(project_id)s
            {extra_where}
            {limit}
        """.format(**{
            'extra_join': extra_join,
            'extra_where': ' AND '.join([''] + extra_where) if extra_where else '',
            'limit': 'LIMIT %(limit)s' if limit is not None else '',
        }), params)

        return [o[0] for o in cursor.fetchall()]
    elif object_type == 'pointcloud':
        return [pc['id'] for pc in list_pointclouds(project_id, user_id, simple=True)]
    else:
        raise ValueError("Referring to all pointset objects at the same time "
                "isn't supported yet")


@shared_task()
def compute_nblast(project_id, user_id, similarity_id, remove_target_duplicates,
        simplify=True, required_branches=10, use_cache=True, use_http=False,
        min_length=15000, min_soma_length=1000, soma_tags=('soma',),
        relational_results=False, max_length=float('inf'), query_object_ids=None,
        target_object_ids=None, notify_user=True, write_scores_only=False,
        clear_results=True, force_objects=False, bb=None, parallel=False,
        remote_dps_source=None, target_cache=False) -> str:
    start_time = timer()
    write_non_scores = not write_scores_only
    try:
        # Store status update and make this change immediately available.
        with transaction.atomic():
            similarity = NblastSimilarity.objects.select_related('config').get(
                    project_id=project_id, pk=similarity_id)
            if write_non_scores:
                similarity.status = 'computing'
                similarity.save()

        if not query_object_ids and not force_objects:
            query_object_ids = similarity.initial_query_objects
        if not target_object_ids and not force_objects:
            target_object_ids = similarity.initial_target_objects

        # Fill in object IDs, if not yet present
        updated = False
        if not query_object_ids:
            logger.info('Getting query object IDs')
            query_object_ids = get_all_object_ids(project_id, user_id,
                    similarity.query_type_id, min_length, min_soma_length,
                    soma_tags, max_length=max_length, bb=bb)
            logger.info(f'Fetched {len(query_object_ids)} query object IDs of type '
                    f'{similarity.target_type_id} with min length {min_length}, min '
                    f'length if soma found {min_soma_length}, soma tags {soma_tags}, '
                    f'max length {max_length}, and the bounding box {bb}')
        if not target_object_ids and not target_cache:
            logger.info('Getting target object IDs')
            target_object_ids = get_all_object_ids(project_id, user_id,
                    similarity.target_type_id, min_length, min_soma_length,
                    soma_tags, max_length=max_length, bb=bb)
            logger.info(f'Fetched {len(target_object_ids)} target object IDs of type '
                    f'{similarity.target_type_id} with min length {min_length}, min '
                    f'length if soma found {min_soma_length}, soma tags {soma_tags}, '
                    f'max length {max_length}, and the bounding box {bb}')

        if write_non_scores:
            similarity.target_objects = target_object_ids
            similarity.query_objects = query_object_ids
            similarity.save()

        config = similarity.config
        if not config.status == 'complete':
            raise ValueError("NBLAST config #" + config.id +
                "isn't marked as complete")

        # Make sure we have a scoring matrix
        if not config.scoring:
            raise ValueError(f"NBLAST config #{config.id}" +
                " does not have a computed scoring.")

        scoring_info = nblast(project_id, user_id, config.id,
                query_object_ids, target_object_ids,
                similarity.query_type_id, similarity.target_type_id,
                min_length=min_length, min_soma_length=min_soma_length,
                normalized=similarity.normalized, use_alpha=similarity.use_alpha,
                remove_target_duplicates=remove_target_duplicates,
                simplify=simplify, required_branches=required_branches,
                use_cache=use_cache, reverse=similarity.reverse,
                top_n=similarity.top_n, use_http=use_http, bb=bb,
                parallel=parallel, remote_dps_source=remote_dps_source,
                target_cache=target_cache)

        duration = timer() - start_time

        # Update config and samples
        if scoring_info.get('errors'):
            raise ValueError("Errors during computation: {}".format(
                    ', '.join(str(i) for i in scoring_info['errors'])))
        else:
            if write_non_scores:
                similarity.status = 'complete'

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

            logger.info(f'NBLAST computation completed, used {len(scoring_info["query_object_ids"]) if scoring_info["query_object_ids"] else "zero"} '
                    f'query objects and {len(scoring_info["target_object_ids"]) if scoring_info["target_object_ids"] else "zero"} target objects')

            # Write the result as a Postgres large object, unless specifically
            # asked to store relational results. To query many result scores at
            # once, the large object facility can be quite slow.
            if relational_results:
                def to_row(x):
                    query_obj_src = scoring_info['query_object_ids'] or similarity.query_objects
                    target_obj_src = scoring_info['target_object_ids'] or similarity.target_objects
                    return (query_obj_src[x[0]], target_obj_src[x[1]], float(scoring_info['similarity'][x[0], x[1]]))

                cursor = connection.cursor()
                if clear_results:
                    logger.info('Deleting all existing results for this similarity query')
                    cursor.execute("""
                        DELETE FROM nblast_similarity_score WHERE similarity_id = %(similarity_id)s
                    """, {
                        'similarity_id': similarity.id
                    })
                logger.info('Preparing to store positive NBLAST scores in result relation')
                # We pnly want positive scores
                non_zero_idx = np.where(scoring_info['similarity'] > 0.01)
                # Find all non-zero matches that aren't self-matches
                non_zero_results = tuple(filter(lambda x: x[0] != x[1], map(to_row, zip(non_zero_idx[0], non_zero_idx[1]))))
                max_scores = len(scoring_info["query_object_ids"]) * len(scoring_info["target_object_ids"]) if scoring_info["query_object_ids"] and scoring_info["target_object_ids"] else "?"
                logger.info(f'Storing {len(non_zero_results)} non-zero and non-self scores (out of {max_scores})')
                execute_batch(cursor, f"""
                    INSERT INTO nblast_similarity_score (similarity_id, query_object_id, target_object_id, score)
                    VALUES ({similarity.id}, %s, %s, %s)
                    ON CONFLICT (similarity_id, query_object_id, target_object_id)
                    DO UPDATE SET score = EXCLUDED.score
                """, non_zero_results, page_size=100)
                logger.info('Stored non-zero results')
            else:
                # The large object handling needs to be explicitly in a
                # transaction.
                with transaction.atomic():
                    cursor = connection.cursor()
                    pconn = cursor.cursor.connection
                    # Create a new large object (oid=0 in read-write mode)
                    lobj = pconn.lobject(oid=0, mode='wb')

                    # Store similarity matrix as raw data bytes in C order row
                    # by row, little endian.
                    arr = scoring_info['similarity']
                    if sys.byteorder == 'big':
                        logger.info('Swapped byteorder from big to little endian for NBLAST scoring storage ')
                        arr = arr.byteswap()

                    # We can't write more than 4GB at a time and the Postgres
                    # manual advises to not send more than a few megabytes at a
                    # time: https://www.postgresql.org/docs/12/lo-interfaces.html
                    # Use therefore a chunk size of 32 MB = 33554432 Bytes
                    chunk_size = 33554432
                    bytes_written = 0
                    raw_bytes = arr.tobytes()
                    total_bytes = len(raw_bytes)

                    logger.info(f'Writing {total_bytes} Bytes in chunks of 32 MB to the database')
                    for i in range(0, total_bytes, chunk_size):
                        eff_chunk_size = min(chunk_size, total_bytes - i)
                        byte_chunk = raw_bytes[i:i+eff_chunk_size]
                        # Write the chunk, we don't have to explicitely call
                        # seek() to update the location of the lobj, write()
                        # will do this for us.
                        bytes_written += lobj.write(byte_chunk)
                    logger.info(f'Stored {bytes_written} Bytes as Postgres large object')

                similarity.scoring = lobj.oid

            if write_non_scores:
                similarity.detailed_status = ("Computed scoring for {} query " +
                        "skeletons vs {} target skeletons.").format(
                                len(similarity.query_objects) if similarity.query_objects is not None else '?',
                                len(similarity.target_objects) if similarity.target_objects is not None else '?')
                similarity.computation_time = duration

            similarity.save()

        try:
            if notify_user:
                msg_user(user_id, 'similarity-update', {
                    'similarity_id': similarity.id,
                    'similarity_status': similarity.status,
                })
        except Exception as e:
            logger.error(f'Could not message user on successful NBLAST run: {e}')

        return f"Computed new NBLAST similarity for config {config.id}"
    except Exception as ex:
        duration = timer() - start_time
        similarities = NblastSimilarity.objects.filter(pk=similarity_id)
        if len(similarities) > 0:
            if write_non_scores:
                similarity = similarities[0]
                similarity.status = 'error'
                similarity.detailed_status = str(ex)
                similarity.computation_time = duration
                similarity.save()

            if notify_user:
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
      - name: storage_mode
        description: How the scoring should be stored: blob or relation
        type: string
        required: false
        defaultValue: blob
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
        name = f'Task {n_similarity_tasks + 1}'

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
        raise ValueError(f"Need valid query type id ({', '.join(valid_type_ids)})")

    target_type_id = request.POST.get('target_type_id', 'skeleton')
    if target_type_id not in valid_type_ids:
        raise ValueError(f"Need valid target type id ({', '.join(valid_type_ids)})")

    # Read potential query and target IDs. In case of skeletons and point
    # clouds, no IDs need to be provided, in which case all skeletons and point
    # clouds, respectively, will be used.
    query_ids = get_request_list(request.POST, 'query_ids', map_fn=int)
    if not query_ids and query_type_id not in ('skeleton', 'pointcloud'):
        raise ValueError("Need set of query objects (skeletons or point clouds) to compare")

    target_ids = get_request_list(request.POST, 'target_ids', map_fn=int)
    if not target_ids and target_type_id not in ('skeleton', 'pointcloud'):
        raise ValueError("Need set of target objects (skeletons or point clouds) to compare against")

    config = NblastConfig.objects.get(project_id=project_id, pk=config_id)

    if not config.status == 'complete':
        raise ValueError(f"NBLAST config #{config.id} isn't marked as complete")

    # Make sure we have a scoring matrix
    if not config.scoring:
        raise ValueError(f"NBLAST config #{config.id} does not have a computed scoring.")

    # Load potential query or target meta data
    query_meta = request.POST.get('query_meta')
    if query_meta:
        if not query_type_id == 'pointset':
            raise ValueError(f"Did not expect 'query_meta' parameter with {query_type_id} query type")
        query_meta = json.loads(query_meta)
    target_meta = request.POST.get('target_meta')
    if target_meta:
        if not target_type_id == 'pointset':
            raise ValueError(f"Did not expect 'target_meta' parameter with {target_type_id} target type")
        target_meta = json.loads(target_meta)

    # Other parameters
    normalized = request.POST.get('normalized', 'mean')
    reverse = get_request_bool(request.POST, 'reverse', True)
    use_alpha = get_request_bool(request.POST, 'use_alpha', False)
    top_n = int(request.POST.get('top_n', 0))
    min_length = int(request.POST.get('min_length', 15000))
    min_soma_length = int(request.POST.get('min_soma_length', 1000))
    soma_tags = get_request_list(request.POST, 'soma_tags', default=['soma'])
    remove_target_duplicates = get_request_bool(request.POST,
            'remove_target_duplicates', True)
    storage_mode = request.POST.get('storage_mode', 'blob')
    if storage_mode not in ('blob', 'relation'):
        raise ValueError(f'Unknown storage mode "{storage_mode}"')
    relational_results = storage_mode == 'relation'

    get_request_bool(request.POST, 'relational_results', False)

    with transaction.atomic():
        # In case of a pointset, new pointset model objects needs to be created
        # before the similarity query is created.
        if query_type_id == 'pointset':
            created_ids = []
            for pointset_id in query_ids:
                pointset_data = query_meta.get(str(pointset_id))
                if not pointset_data:
                    raise ValueError(f"Could not find data for pointset {pointset_id}")
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
                    raise ValueError(f"Could not find data for pointset {pointset_id}")
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
            use_cache=use_cache, min_length=min_length,
            min_soma_length=min_soma_length, soma_tags=soma_tags,
            relational_results=relational_results)

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


class SimilarityClusterDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id, similarity_id) -> JsonResponse:
        """Get a set of similarity clusters in a bounding box.

        This API assumes there are similarity values computed for the passed in
        similarity ID.
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
            required: true
          - name: min_x
            description: The min X of the query bounding box
            type: float
            paramType: form
            required: true
          - name: min_y
            description: The min Y of the query bounding box
            type: float
            paramType: form
            required: true
          - name: min_z
            description: The min Z of the query bounding box
            type: float
            paramType: form
            required: true
          - name: max_x
            description: The max X of the query bounding box
            type: float
            paramType: form
            required: true
          - name: max_y
            description: The max Y of the query bounding box
            type: float
            paramType: form
            required: true
          - name: max_z
            description: The max Z of the query bounding box
            type: float
            paramType: form
            required: true
          - name: min_cable_length
            description: The minimum length of skeletons to consider
            paramType: form
            required: false
            defaultValue: 0
          - name: max_norm_dist
            description: The maximum distance in [0,1] between two neurons to be considered in the same cluster
            type: float
            paramType: form
            required: false
            defaultValue: 0.5
          - name: min_cluster_size
            description: The minimum cluster size
            type: int
            paramType: form
            required: false
            defaultValue: 1
          - name: with_unclustered
            description: Whether or not to include a cluster with ID -1 in the result that contains all objects that could not be clustered.
            type: boolean
            paramType: form
            required: false
            defaultValue: false
        """

        min_x, min_y, min_z = (float(request.query_params['min_x']),
                float(request.query_params['min_y']), float(request.query_params['min_z']))
        max_x, max_y, max_z = (float(request.query_params['max_x']),
                float(request.query_params['max_y']), float(request.query_params['max_z']))
        min_cable_length = float(request.query_params.get('min_cable_length', 0))
        max_norm_dist = float(request.query_params.get('max_norm_dist', 0.5))
        min_cluster_size = float(request.query_params.get('min_cluster_size', 1))
        with_unclustered = get_request_bool(request.query_params, 'with_unclustered', False)

        cursor = connection.cursor()
        cursor.execute("""
            WITH skeleton_ids AS MATERIALIZED (
            SELECT DISTINCT t.skeleton_id
            FROM (
              SELECT te.id, te.edge
                FROM treenode_edge te
                WHERE floatrange(ST_ZMin(te.edge),
                     ST_ZMax(te.edge), '[]') && floatrange(%(min_z)s, %(max_z)s, '[)')
                  AND te.project_id = %(project_id)s
              ) e
              JOIN treenode t
                ON t.id = e.id
              JOIN catmaid_skeleton_summary s
                ON t.skeleton_id = s.skeleton_id
              WHERE e.edge && ST_MakeEnvelope(%(min_x)s, %(min_y)s, %(max_x)s, %(max_y)s)
                AND ST_3DDWithin(e.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                    ST_MakePoint(%(min_x)s, %(min_y)s, %(half_z)s),
                    ST_MakePoint(%(max_x)s, %(min_y)s, %(half_z)s),
                    ST_MakePoint(%(max_x)s, %(max_y)s, %(half_z)s),
                    ST_MakePoint(%(min_x)s, %(max_y)s, %(half_z)s),
                    ST_MakePoint(%(min_x)s, %(min_y)s, %(half_z)s)]::geometry[])),
                    200.0)
                AND s.cable_length > %(min_cable_length)s
            ),
            query_targets AS (
                SELECT q.skeleton_id AS query_id, t.skeleton_id AS target_id
                FROM skeleton_ids t, skeleton_ids q
            ),
            score AS (
                SELECT array_agg(query_id) AS query_ids, array_agg(target_id) AS target_ids,
                    array_agg(score) AS scores FROM query_targets
                JOIN nblast_similarity_score as nblast
                ON nblast.query_object_id = query_targets.query_id AND
                   nblast.target_object_id = query_targets.target_id
                WHERE nblast.similarity_id = %(similarity_id)s
            )
            SELECT c.cluster_id, array_agg(c.object_id)
            FROM score,
                LATERAL cluster_nblast(query_ids, target_ids, scores,
                    %(max_norm_dist)s::real, %(min_cluster_size)s::int,
                    %(with_unclustered)s::bool) AS c
            GROUP BY c.cluster_id;
        """, {
            'project_id': project_id,
            'similarity_id': similarity_id,
            'min_x': min_x,
            'min_y': min_y,
            'min_z': min_z,
            'max_x': max_x,
            'max_y': max_y,
            'max_z': max_z,
            'half_z': (max_z + min_z) * 0.5,
            'min_cable_length': min_cable_length,
            'max_norm_dist': max_norm_dist,
            'min_cluster_size': min_cluster_size,
            'with_unclustered': with_unclustered,
        })

        return JsonResponse(sorted(cursor.fetchall(), reverse=True, key=lambda x: len(x[1])), safe=False)


@requires_user_role(UserRole.QueueComputeTask)
def recompute_similarity(request:HttpRequest, project_id, similarity_id) -> JsonResponse:
    """Recompute the similarity matrix of the passed in NBLAST configuration.
        ---
        parameters:
          - name: project_id
            description: Project of the similarity computation
            type: integer
            paramType: path
            required: true
          - name: similarity_id
            description: The similarity to use.
            type: integer
            paramType: path
            required: true
          - name: storage_mode
            description: The storage mode to use: "blob" or "relation"
            type: string
            paramType: form
            required: true
    """
    simplify = get_request_bool(request.GET, 'simplify', True)
    required_branches = int(request.GET.get('required_branches', '10'))
    can_edit_or_fail(request.user, similarity_id, 'nblast_similarity')
    use_cache = get_request_bool(request.GET, 'use_cache', True)
    storage_mode = request.GET.get('storage_mode', 'blob')
    if storage_mode not in ('blob', 'relation'):
        raise ValueError('Storage mode needs to be "blob" or "relation"')
    relational_results = storage_mode == 'relation'
    task = compute_nblast.delay(project_id, request.user.id, similarity_id,
            remove_target_duplicates=True, simplify=simplify,
            required_branches=required_branches, use_cache=use_cache,
            relational_results=relational_results)

    return JsonResponse({
        'status': 'queued',
        'task_id': task.task_id
    })


class SkeletonDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id, similarity_id) -> JsonResponse:
        """Get a set of skeletons that were considered similar to others in a
        particular similarity computation.

        This can be further constrained by specifying a set of input skeletons,
        of which the result skeletons need to be partners. Other filters, like a
        bounding box or minimum similarity score can optionally be applied as
        well. If neither a set of query skeleton IDs or a bounding box is
        supplied, all possible query and target skeletons of the referenced
        similarity object will be considered. If a bounding box is supplied,
        both the query and target objects of a single similarity score need to
        intersect the given bounding box.

        Returned is a list of lists, each list item represents a set of matches
        for a query skeleton and contains two elements: The first item
        is the query skeleton ID, and the second item is another list of
        two-element lists. Each of these inner lists contains a target skeleton
        ID and the respective similarity score.
        ---
        parameters:
          - name: project_id
            description: Project to operate in.
            type: integer
            paramType: path
            required: true
          - name: similarity_id
            description: The similarity computation to work with.
            type: integer
            paramType: path
            required: true
          - name: skeleton_ids
            description: |
                A set of skeletons that can be used to constrain the query part
                of the returned similarity matches.
            type: integer
            paramType: form
            required: false
          - name: min_cable_length
            description: |
                The minimum length that both query and target skeletons need to
                have to be considered.
            paramType: form
            required: false
            defaultValue: 0
          - name: min_similarity_score
            description: The minimum similarity score each match needs to have.
            paramType: form
            required: false
            defaultValue: 0
          - name: min_x
            description: The min X of the query bounding box
            type: float
            paramType: form
            required: false
          - name: min_y
            description: The min Y of the query bounding box
            type: float
            paramType: form
            required: false
          - name: min_z
            description: The min Z of the query bounding box
            type: float
            paramType: form
            required: false
          - name: max_x
            description: The max X of the query bounding box
            type: float
            paramType: form
            required: false
          - name: max_y
            description: The max Y of the query bounding box
            type: float
            paramType: form
            required: false
          - name: max_z
            description: The max Z of the query bounding box
            type: float
            paramType: form
            required: false
        """
        skeleton_ids = get_request_list(request.query_params, 'skeleton_ids', map_fn=int)
        min_cable_length = float(request.query_params.get('min_cable_length', 0))
        min_similarity_score = float(request.query_params.get('min_similarity_score', 0))

        min_x, min_y, min_z = (request.query_params.get('min_x'),
                request.query_params.get('min_y'), request.query_params.get('min_z'))
        max_x, max_y, max_z = (request.query_params.get('max_x'),
                request.query_params.get('max_y'), request.query_params.get('max_z'))

        has_bb = all([min_x, min_y, min_z, max_x, max_y, max_z])
        if has_bb:
            min_x, min_y, min_z, max_x, max_y, max_z = (float(min_x), float(min_y),
                    float(min_z), float(max_x), float(max_y), float(max_z))

        cursor = connection.cursor()

        similarity = NblastSimilarity.objects.get(pk=similarity_id)
        if similarity.scoring:
            pconn = cursor.cursor.connection
            lobj = pconn.lobject(oid=similarity.scoring, mode='rb')
            # For all query skeletons, get the scores for all target skeletons
            scores = dict()

            if has_bb:
                raise ValueError("Bounding boxes are not yet supported for large object storage")

            for skeleton_id in skeleton_ids:
                query_index = similarity.query_objects.index(skeleton_id)
                # We look through 32 bit floats
                lobj.seek(query_index * 4)
                raw_data = np.frombuffer(lobj.read(len(similarity.target_objects) * 4), dtype=np.float32)
                scores[skeleton_id] = raw_data.reshape((1, len(similarity.target_objects))).tolist()[0]

            # Remove all target skeletons that are too short
            target_skids = similarity.target_objects.copy()
            if min_cable_length:
                cursor.execute("""
                    SELECT skeleton_id
                    FROM catmaid_skeleton_summary
                    WHERE cable_length < %(min_cable_length)s
                """, {
                    'target_object_ids': similarity.target_objects,
                    'min_cable_length': min_cable_length,
                })
                indexes_to_remove = [
                    similarity.target_objects.index(tskid)
                    for (tskid,) in cursor.fetchall()
                ].sort(reverse=True)
                for _, target_object_ids in scores.items():
                    for idx in indexes_to_remove:
                        del target_object_ids[idx]
                for idx in indexes_to_remove:
                    del target_skids[idx]

            # Remove all scores that are too small
            if min_similarity_score:
                return JsonResponse([
                        [skeleton_id, [
                            [tskid, ts] for (tskid, ts)
                            in zip(target_skids, target_scores)
                            if ts > min_similarity_score
                        ]]
                        for skeleton_id, target_scores in scores.items()
                    ], safe=False)
            else:
                return JsonResponse([
                        [skeleton_id, list(zip(target_skids, target_scores))]
                        for skeleton_id, target_scores in scores.items()
                    ], safe=False)
        else:
            if has_bb:
                if skeleton_ids:
                    skeleton_constraints = """
                        JOIN UNNEST(%(skeleton_ids)s::bigint[]) skeleton_constr(id)
                            ON skeleton_constr.id = t.id
                    """
                else:
                    skeleton_constraints = ""

                skeleton_src = f"""
                    WITH skeleton_in_bb AS MATERIALIZED (
                      SELECT DISTINCT t.skeleton_id AS id
                      FROM (
                          SELECT te.id, te.edge
                          FROM treenode_edge te
                          WHERE floatrange(ST_ZMin(te.edge),
                               ST_ZMax(te.edge), '[]') && floatrange(%(min_z)s, %(max_z)s, '[)')
                            AND te.project_id = %(project_id)s
                      ) e
                      JOIN treenode t
                        ON t.id = e.id
                      WHERE e.edge && ST_MakeEnvelope(%(min_x)s, %(min_y)s, %(max_x)s, %(max_y)s)
                        AND ST_3DDWithin(e.edge, ST_MakePolygon(ST_MakeLine(ARRAY[
                            ST_MakePoint(%(min_x)s, %(min_y)s, %(half_z)s),
                            ST_MakePoint(%(max_x)s, %(min_y)s, %(half_z)s),
                            ST_MakePoint(%(max_x)s, %(max_y)s, %(half_z)s),
                            ST_MakePoint(%(min_x)s, %(max_y)s, %(half_z)s),
                            ST_MakePoint(%(min_x)s, %(min_y)s, %(half_z)s)]::geometry[])),
                            200.0)
                    ), skeleton AS (
                        SELECT DISTINCT t.id
                        FROM skeleton_in_bb t
                        {skeleton_constraints}
                    )
                """
            elif skeleton_ids:
                skeleton_src = """
                    WITH skeleton AS MATERIALIZED (
                        SELECT id FROM UNNEST(%(skeleton_ids)s::bigint[]) skeleton(id)
                    )
                """
            else:
                skeleton_src = """
                    WITH skeleton AS MATERIALIZED (
                        SELECT DISTINCT query_object_id AS id
                        FROM nblast_similarity_score
                        WHERE similarity_id = %(similarity_id)s
                        UNION
                        SELECT DISTINCT target_object_id AS id
                        FROM nblast_similarity_score nss
                        WHERE similarity_id = %(similarity_id)s
                    )
                """

            bb_target_filter = ""
            if has_bb:
                bb_target_filter = """
                    JOIN skeleton_in_bb sbb
                        ON sbb.id = nss.target_object_id
                """

            cursor.execute(f"""
                {skeleton_src}
                SELECT skeleton.id, json_agg(json_build_array(target_object_id, score))
                FROM skeleton
                JOIN nblast_similarity_score nss
                    ON nss.query_object_id = skeleton.id
                JOIN catmaid_skeleton_summary css
                    ON css.skeleton_id = skeleton.id
                JOIN catmaid_skeleton_summary css_target
                    ON css_target.skeleton_id = nss.target_object_id
                {bb_target_filter}
                WHERE nss.similarity_id = %(similarity_id)s
                AND nss.score >= %(min_similarity_score)s
                AND css.cable_length >= %(min_cable_length)s
                AND css_target.cable_length >= %(min_cable_length)s
                GROUP BY skeleton.id
            """, {
                'project_id': project_id,
                'similarity_id': similarity_id,
                'skeleton_ids': skeleton_ids,
                'min_cable_length': min_cable_length,
                'min_similarity_score': min_similarity_score,
                'min_x': min_x,
                'min_y': min_y,
                'min_z': min_z,
                'max_x': max_x,
                'max_y': max_y,
                'max_z': max_z,
                'half_z': (max_z + min_z) * 0.5 if has_bb else None,
            })

            return JsonResponse(sorted(cursor.fetchall(), key=lambda x: x[0]), safe=False)


class SimilarityStorageDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id, similarity_id) -> JsonResponse:
        """Get the current storage mode of a similarity query.
        ---
        parameters:
          - name: project_id
            description: Project of the similarity computation
            type: integer
            paramType: path
            required: true
          - name: similarity_id
            description: The similarity to use.
            type: integer
            paramType: path
            required: true
        """
        similarity = NblastSimilarity.objects.get(pk=similarity_id)

        return JsonResponse({
            'storage_type': 'blob' if similarity.scoring else 'relation',
        })


    @method_decorator(requires_user_role(UserRole.Annotate))
    def post(self, request:HttpRequest, project_id, similarity_id) -> JsonResponse:
        """Set the current storage mode of a similarity query.
        ---
        parameters:
          - name: project_id
            description: Project of the similarity computation
            type: integer
            paramType: path
            required: true
          - name: similarity_id
            description: The similarity to use.
            type: integer
            paramType: path
            required: true
          - name: storage_mode
            description: The storage mode to use: "blob" or "relation"
            type: string
            paramType: form
            required: true
          - name: keep_old_storage
            description: If true, the new storage data will be generated, but the similarity object will keep the old reference.
            type: bool
            paramType: form
            required: false
            defaultValue: false
        """
        similarity = NblastSimilarity.objects.get(pk=similarity_id)
        keep_old_storage = get_request_bool(request.data, 'keep_old_storage', False)

        storage_mode = request.data.get('storage_mode')
        if not storage_mode:
            raise ValueError('Need storage mode')
        if storage_mode not in ('blob', 'relation'):
            raise ValueError('Storage mode needs to be "blob" or "relation"')

        current_storage_mode = 'blob' if similarity.scoring else 'relation'
        if storage_mode == current_storage_mode:
            raise ValueError('Current storage mode doesn\'t differ from new mode')

        updated = False
        if current_storage_mode == 'blob':
            if storage_mode == 'relation':
                cursor = connection.cursor()
                cursor.execute("""
                    SELECT nblast_lo_score_to_rows(%(similarity_id)s)
                """, {
                    'similarity_id': similarity_id,
                })
                updated = True
                if not keep_old_storage:
                    similarity.scoring = None
                    similarity.save()
        else:
            raise ValueError('Currently only blob to relation transformations are supported')

        return JsonResponse({
            'new_storage_mode': storage_mode,
            'updated': updated,
        })


def get_lobject_similarity_score(similarity_id, query_object_id, target_object_id):
    """Get a NBLAST score value for a similarity result of a query and a target
    object. This function expects the similarity object to store the scores as
    "largeobject" in Postgres.
    """
    similarity = NblastSimilarity.objects.get(pk=similarity_id)
    if not similarity_id.scoring:
        raise ValueError('Expected blob storage mode for similarity')

    cursor = connection.cursor()
    cursor.execute("""
        SELECT nblast_score(%(similarity_id)s, %(query_object_id)s, %(target_object_id)s)
    """)
    scores = cursor.fetchall()
    if len(scores) > 1:
        raise ValueError(f'Found {len(scores)} matching scores, expected one')
    return scores[0][0]


class SimilarityClusterMgmt(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request:HttpRequest, project_id) -> JsonResponse:
        """Get whether clustering is currently enabled.
        ---
        parameters:
          - name: project_id
            description: Project to work in
            type: integer
            paramType: path
            required: true
        """
        cursor = connection.cursor()
        try:
            cursor.execute("""
                SELECT pg_get_functiondef('cluster_nblast(bigint[], bigint[], float[], float, int, bool)'::regprocedure);
            """)
            clustering_enabled = True
        except ProgrammingError as e:
            clustering_enabled = False

        return JsonResponse({
            'enabled': clustering_enabled,
        })


    @method_decorator(requires_user_role(UserRole.Admin))
    def post(self, request:HttpRequest, project_id, similarity_id) -> JsonResponse:
        """Set the current storage mode of a similarity query.
        ---
        parameters:
          - name: project_id
            description: Project of the similarity computation
            type: integer
            paramType: path
            required: true
        """
        enabled = get_request_bool(request.data, 'enabled', True)

        if enabled:
            status = enable_similarity_clustering()
        else:
            status = disable_similarity_clustering()

        return JsonResponse({
            'enabled': status,
        })


def enable_similarity_clustering():
    """Create a database function to do similarity score based on Python and
    scikit.learn. Since using Python in the database requires superuser
    permissions to be installed, this feature is optional and needs to be
    installed manually.
    """
    cursor = connection.cursor()

    try:
        cursor.execute("""
            CREATE OR REPLACE FUNCTION cluster_nblast (query_objects bigint[],
                target_objects bigint[], scores float[], eps float, min_samples int,
                with_unclustered bool default false)
            RETURNS TABLE(object_id bigint, cluster_id int)
            AS $$
                import numpy as np
                from sklearn.cluster import DBSCAN
                from collections import defaultdict

                if not query_objects or not target_objects:
                    return np.array([])

                # Create index to look-up scoring value to query/target combination.
                similarity_score = defaultdict(dict)
                for q,t,s in zip(query_objects, target_objects, scores):
                    similarity_score[q][t] = s

                # The clustering works on the combined set query and target objects. If
                # there is not actually a score available between two objects, because both
                # where part of either the query or the target group (and can't be found in
                # the other group), then their distance is seen as infinite.
                distinct_query_objects = list(set(query_objects).union(set(target_objects)))

                # The similarity function will return a zero distance if both objects are
                # the same. Otherwise, it will look-up the object ID in the combined list
                # query objects, which is then used to look up the similarity score between
                # them.
                def similarity_distance(x, y):
                    if x == y or (x and y and x[0] == y[0]):
                        return 0.0

                    query, target = distinct_query_objects[int(x[0])], distinct_query_objects[int(y[0])]

                    sim = similarity_score[query].get(target)
                    if sim == None:
                        sim = similarity_score[target].get(query) or 0

                    return 1.0 - sim

                # Our features we want to cluster are only represented as a list with
                # increasing integer values, which has a length of the combined set of input
                # and target objects.
                features = np.arange(len(distinct_query_objects)).reshape(-1,1)

                # Run clustering on set of combined objects and our distance function, along
                # with the passed in parameters.
                clustered_dataset = DBSCAN(eps=eps, min_samples=min_samples, metric=similarity_distance).fit(X=features)

                # A table is returned that maps the looked-at object IDs to a cluster ID.
                # Every object with the same ID is part of the same cluster. If no
                # unclustered objects should be returned, the objects with label -1 are
                # removed.
                clusters = np.array([distinct_query_objects, clustered_dataset.labels_]).T
                if with_unclustered:
                    return clusters
                return clusters[clusters[:,1] > -1]
            $$ LANGUAGE 'plpython3u';
        """)
    except ProgrammingError as e:
        logger.error(e)
        return False

    return True


def disable_similarity_clustering():
    """Remove the database logic to do similarity score clustering using Python.
    Returns False, indicating clustering is not enabled anymore.
    """
    cursor = connection.cursor()
    cursor.execute("""
        DROP FUNCTION cluster_nblast (query_objects bigint[], target_objects bigint[],
                scores float[], eps float, min_samples int);
    """)

    return False
