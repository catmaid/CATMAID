# -*- coding: utf-8 -*-
import logging

from celery.task import task
from django.db import connection, transaction
from django.http import JsonResponse
from django.utils.decorators import method_decorator

from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view

from catmaid.consumers import msg_user
from catmaid.control.authentication import (requires_user_role,
        can_edit_or_fail, check_user_role)
from catmaid.control.common import (insert_into_log, get_class_to_id_map,
        get_relation_to_id_map, _create_relation, get_request_bool,
        get_request_list)
from catmaid.models import (NblastConfig, NblastSample, Project,
        NblastConfigDefaultDistanceBreaks, NblastConfigDefaultDotBreaks,
        NblastSimilarity, PointCloud, UserRole)
from catmaid.control.nat import compute_scoring_matrix, nblast


logger = logging.getLogger('__name__')


def serialize_sample(sample):
    return {
        'id': sample.id,
        'user_id': sample.user_id,
        'creation_time': sample.creation_time,
        'project_id': sample.project_id,
        'name': sample.name,
        'sample_neurons': sample.sample_neurons,
        'histogram': sample.histogram,
        'probability': sample.probability,
    }


def serialize_config(config, simple=False):
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


def serialize_similarity(similarity):
    return {
        'id': similarity.id,
        'user_id': similarity.user_id,
        'creation_time': similarity.creation_time,
        'project_id': similarity.project_id,
        'config_id': similarity.config_id,
        'name': similarity.name,
        'status': similarity.status,
        'scoring': similarity.scoring,
        'query_objects': similarity.query_objects,
        'target_objects': similarity.target_objects,
        'query_type': similarity.query_type_id,
        'target_type': similarity.target_type_id,
    }


def serialize_pointcloud(pointcloud, with_locations=False, with_images=False):
    data = {
        'id': similarity.id,
        'user_id': similarity.user_id,
        'creation_time': similarity.creation_time,
        'project_id': similarity.project_id,
        'config_id': similarity.config_id,
        'name': similarity.name,
        'description': similarity.description,
        'source_path': similarity.source_path,
    }

    if with_locations:
        # All points of the pointcloud, stored as an array o XYZ-Arrays. The
        # coordinates are expected to be in project space coordinates.
        data['locations'] = pointcloud.locations

    if with_images:
        data['z_proj_original_image'] = spatial_models.RasterField()
        data['z_proj_pointcloud_image'] = spatial_models.RasterField()

    return data


def install_dependencies():
    """Install all R rependencies.
    """
    needed_packages = ('nat', 'nat.nblast', 'catmaid', 'doMC')


class ConfigurationDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id, config_id):
        """Delete a NBLAST configuration.
        """
        config = NblastConfig.objects.get(pk=config_id, project_id=project_id)
        return JsonResponse(serialize_config(config))

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request, project_id, config_id):
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
    def get(self, request, project_id):
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
    def put(self, request, project_id):
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
        user_id = request.user.id

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
            matching_skeleton_ids = get_request_list(request.data,
                    'matching_skeleton_ids', map_fn=int)
            random_skeleton_ids = get_request_list(request.data,
                    'random_skeleton_ids', map_fn=int)
            if not matching_skeleton_ids:
                raise ValueError("Need matching_skeleton_ids")
            if not random_skeleton_ids:
                raise ValueError("Need random_skeleton_ids")

            # Cancel if user isn't allowed to queue computation tasks
            p = Project.objects.get(pk=project_id)
            has_role = check_user_role(request.user, p, UserRole.QueueComputeTask)
            if not has_role:
                raise PermissionError("User " + str(request.user.id) +
                        " doesn't have permission to queue computation tasks.")

            config = self.add_delayed(matching_skeleton_ids,
                    random_skeleton_ids, distance_breaks, dot_breaks,
                    tangent_neighbors=tangent_neighbors)
            return Response(serialize_config(config))
        elif source == 'backend-random':
            matching_skeleton_ids = get_request_list(request.data,
                    'matching_skeleton_ids', map_fn=int)
            n_random_skeletons = int(request.data.get('n_random_skeletons', 5000))
            if not matching_skeleton_ids:
                raise ValueError("Need matching_skeleton_ids")

            # Cancel if user isn't allowed to queue computation tasks
            p = Project.objects.get(pk=project_id)
            has_role = check_user_role(request.user, p, UserRole.QueueComputeTask)
            if not has_role:
                raise PermissionError("User " + str(request.user.id) +
                        " doesn't have permission to queue computation tasks.")

            config = self.compute_random_and_add_delayed(
                project_id, user_id, name, matching_skeleton_ids,
                distance_breaks, dot_breaks, None, None,
                n_random_skeletons, min_length, tangent_neighbors)
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
        histogram = []
        probably = []

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
        print(data)
        scoring = data

        return NblastConfig.objects.create(project_id=project_id,
            user=user, name=name, status='complete',
            distance_breaks=distance_breaks, dot_breaks=dot_breaks,
            match_sample=match_sample, random_sample=random_sample,
            scoring=None, tangent_neighbors=tangent_neighbors)

    def add_delayed(self, project_id, user_id, name, matching_skeleton_ids,
            random_skeleton_ids, distance_breaks=NblastConfigDefaultDistanceBreaks,
            dot_breaks=NblastConfigDefaultDotBreaks, match_sample_id=None,
            random_sample_id=None, tangent_neighbors=20):
        """Create and queue a new Celery task to create the scoring matrix.
        """
        histogram = []
        probably = []

        if match_sample_id:
            match_sample = NblastSample.objects.get(id=match_sample_id)
        else:
            match_sample = NblastSample.objects.create(project_id=project_id,
                    user_id=user_id, name="Matching sample",
                    sample_neurons=None, histogram=histogram,
                    probability=probability)

        if random_sample_id:
            random_sample = NblastSample.objects.get(id=random_sample_id)
        else:
            random_sample = NblastSample.objects.create(project_id=project_id,
                    user_id=user_id, name="Random sample",
                    sample_neurons=[], histogram=histogram,
                    probability=probability)

        config = NblastConfig.objects.create(project_id=project_id,
            user=user, name=name, status='queued',
            distance_breaks=distance_breaks, dot_breaks=dot_breaks,
            match_sample=match_sample, random_sample=random_sample,
            scoring=None, tangent_neighbors=tangent_neighbors)

        # Queue recomputation task
        task = recompute_config.delay(config.id)

        return config

    def compute_random_and_add_delayed(self, project_id, user_id, name,
            matching_skeleton_ids, distance_breaks=NblastConfigDefaultDistanceBreaks,
            dot_breaks=NblastConfigDefaultDotBreaks, match_sample_id=None,
            random_sample_id=None, n_random_skeletons=5000, min_length=0, tangent_neighbors=20):
        """Select a random set of neurons, optionally of a minimum length and
        queue a job to compute the scoring matrix.
        """
        histogram = []
        probability = []

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
                    'min_nodes': 100,
                    'skeleton_ids': matching_skeleton_ids
                })
                filtered_matching_skeleton_ids = [r[0] for r in cursor.fetchall()]
                match_sample = NblastSample.objects.create(project_id=project_id,
                        user_id=user_id, name="Matching sample",
                        sample_neurons=filtered_matching_skeleton_ids,
                        histogram=histogram, probability=probability)

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
def recompute_config(request, project_id, config_id):
    """Recompute the similarity matrix of the passed in NBLAST configuration.
    """
    can_edit_or_fail(request.user, config_id, 'nblast_config')
    task = compute_nblast_config.delay(config_id, request.user.id)

    return JsonResponse({
        'status': 'queued',
        'task_id': task.task_id
    })


@task()
def compute_nblast_config(config_id, user_id):
    """Recompute the scoring information for a particular configuration,
    including both the matching skeleton set and the random skeleton set.
    """
    try:
        with transaction.atomic():
            config = NblastConfig.objects.select_related('match_sample', 'random_sample').get(pk=config_id)
            config.status = 'computing'
            config.save()

        scoring_info = compute_scoring_matrix(config.project_id, user_id,
                config.match_sample.sample_neurons, config.random_sample.sample_neurons,
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


@task()
def compute_nblast(project_id, user_id, similarity_id):
    try:
        with transaction.atomic():
            similarity = NblastSimilarity.objects.select_related('config').get(
                    project_id=project_id, pk=similarity_id)
            similarity.status = 'computing'
            similarity.save()

        query_object_ids = similarity.query_objects
        target_object_ids = similarity.target_objects

        config = similarity.config
        if not config.status == 'complete':
            raise ValueError("NBLAST config #" + config.id +
                "isn't marked as complete")

        # Make sure we have a scoring matrix
        if not config.scoring:
            raise ValueError("NBLAST config #" + config.id +
                " doesn't have a computed scoring.")

        scoring_info = nblast(project_id, config.id, query_object_ids,
                target_object_ids, similarity.query_type_id,
                similarity.target_type_id)

        # Update config and samples
        if scoring_info.get('errors'):
            raise ValueError("Errors during computation: {}".format(
                    ', '.join(str(i) for i in scoring_info['errors'])))
        else:
            similarity.status = 'complete'
            similarity.scoring = scoring_info['similarity']
            similarity.save()

        msg_user(user_id, 'similarity-update', {
            'similarity_id': similarity.id,
            'similarity_status': similarity.status,
        })

        return "Computed new NBLAST similarity for config {}".format(config.id)
    except:
        similarities = NblastSimilarity.objects.filter(pk=similarity_id)
        if similarities:
            similarity = similarities[0]
            similarity.status = 'error'
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
def compare_skeletons(request, project_id):
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

    query_ids = get_request_list(request.POST, 'query_ids', map_fn=int)
    if not query_ids:
        raise ValueError("Need set of query objects (skeletons or point clouds) to compare")

    target_ids = get_request_list(request.POST, 'target_ids', map_fn=int)
    if not target_ids:
        raise ValueError("Need set of target objects (skeletons or point clouds) to compare against")

    config = NblastConfig.objects.get(project_id=project_id, pk=config_id)

    if not config.status == 'complete':
        raise ValueError("NBLAST config #" + config.id +
            "isn't marked as complete")

    # Make sure we have a scoring matrix
    if not config.scoring:
        raise ValueError("NBLAST config #" + config.id +
            " doesn't have a computed scoring.")

    valid_type_ids = ('skeleton', 'pointcloud')

    query_type_id = request.POST.get('query_type_id', 'skeleton')
    if query_type_id not in valid_type_ids:
        raise ValueError("Need valid query type id ({})".format(', '.join(valid_type_ids)))

    target_type_id = request.POST.get('target_type_id', 'skeleton')
    if target_type_id not in valid_type_ids:
        raise ValueError("Need valid target type id ({})".format(', '.join(valid_type_ids)))

    with transaction.atomic():
        similarity = NblastSimilarity.objects.create(project_id=project_id,
                user=request.user, name=name, status='queued', config_id=config_id,
                query_objects=query_ids, target_objects=target_ids,
                query_type_id=query_type_id, target_type_id=target_type_id)
        similarity.save()

    task = compute_nblast.delay(project_id, request.user.id, similarity.id)

    return JsonResponse({
        'task_id': task.task_id,
        'similarity': serialize_similarity(similarity)
    })


class SimilarityList(APIView):

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id):
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
        """
        config_id = request.query_params.get('config_id', None)

        params = {
            'project_id': int(project_id)
        }

        if config_id:
            params['config_id'] = config_id

        return JsonResponse([serialize_similarity(c) for c in
                NblastSimilarity.objects.filter(**params)], safe=False)


class SimilarityDetail(APIView):

    @method_decorator(requires_user_role(UserRole.Annotate))
    def delete(self, request, project_id, similarity_id):
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
def recompute_similarity(request, project_id, similarity_id):
    """Recompute the similarity matrix of the passed in NBLAST configuration.
    """
    can_edit_or_fail(request.user, similarity_id, 'nblast_similarity')
    task = compute_nblast.delay(project_id, request.user.id, similarity_id)

    return JsonResponse({
        'status': 'queued',
        'task_id': task.task_id
    })
