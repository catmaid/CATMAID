# -*- coding: utf-8 -*-

from collections import defaultdict
from datetime import datetime
from itertools import chain
from functools import reduce
from typing import Dict, List, Optional, Set
from enum import Enum

from catmaid.control.annotation import (get_annotated_entities,
        get_annotation_to_id_map, get_sub_annotation_ids,
        get_annotations_for_entities)
from catmaid.control.tracing import check_tracing_setup, known_tags
from catmaid.control.volume import find_volumes
from catmaid.models import (Class, ClassInstance, ClassInstanceClassInstance,
        Relation, Connector, Project, Treenode, TreenodeClassInstance,
        TreenodeConnector, User, ReducedInfoUser, ExportUser, Volume)
from catmaid.util import str2bool, str2list
from django.db import connection
from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.hashers import make_password
from .common import set_log_level


import logging
logger = logging.getLogger(__name__)

def ask_to_continue():
    """ Return a valid project object.
    """
    def ask():
        start_export = input("Continue? [y/n] ").strip()

        if start_export == 'y':
            return True
        elif start_export == 'n':
            return False
        else:
            print("Only 'y' and 'n' are allowed")
            return None

    while True:
        c = ask()
        if c is not None:
            return c


class ExportAnnotation(Enum):
    AnnotationsYes = 'export: annotations'
    AnnotationsNo = 'export: no-annotations'
    TagsYes = 'export: tags'
    TagsNo = 'export: no-tags'
    TreenodesYes = 'export: treenodes'
    TreenodesNo = 'export: no-treenodes'
    ConnectorsOnlyIntra = 'export: intra-connectors-only'
    ConnectorsNewPlaceholders = 'export: intra-connectors-and-placeholders'
    ConnectorsOriginalPlaceholders = 'export: intra-connectors-and-original-placeholders'
    ConnectorsNo = 'export: no-connectors'

    ConnectorOptions = (
        'export: intra-connectors-only',
        'export: intra-connectors-and-placeholders',
        'export: intra-connectors-and-original-placeholders',
        'export: no-connectors',
    )

    @staticmethod
    def has_more_weight(a, b):
        if a is None:
            return False
        if b is None:
            return True
        if a == ExportAnnotation.AnnotationsYes:
            if b == ExportAnnotation.AnnotationsYes:
                return False
            elif b == ExportAnnotation.AnnotationsNo:
                return True
            else:
                raise ValueError(f"Can't compare export annotations {a} and {b}")
        elif a == ExportAnnotation.TagsYes:
            if b == ExportAnnotation.TagsYes:
                return False
            elif b == ExportAnnotation.TagsNo:
                return True
            else:
                raise ValueError(f"Can't compare export annotations {a} and {b}")
        elif a == ExportAnnotation.AnnotationsYes:
            if b == ExportAnnotation.AnnotationsYes:
                return False
            elif b == ExportAnnotation.AnnotationsNo:
                return True
            else:
                raise ValueError(f"Can't compare export annotations {a} and {b}")
        elif a == ExportAnnotation.ConnectorsNo:
            return False
        elif a == ExportAnnotation.ConnectorsOnlyIntra:
            if b.value in ExportAnnotation.ConnectorOptions.value:
                return b == ExportAnnotation.ConnectorsNo
            else:
                raise ValueError(f"Can't compare export annotations {a} and {b}")
        elif a == ExportAnnotation.ConnectorsNewPlaceholders:
            if b.value in ExportAnnotation.ConnectorOptions.value:
                return b == ExportAnnotation.ConnectorsNo or \
                        b == ExportAnnotation.ConnectorsOnlyIntra
            else:
                raise ValueError(f"Can't compare export annotations {a} and {b}")
        elif a == ExportAnnotation.ConnectorsOriginalPlaceholders:
            if b.value in ExportAnnotation.ConnectorOptions.value:
                return b != ExportAnnotation.ConnectorsOriginalPlaceholders
            else:
                raise ValueError(f"Can't compare export annotations {a} and {b}")


class Exporter():

    def __init__(self, project, options):
        self.project = project
        self.options = options
        self.export_treenodes = options['export_treenodes']
        self.connector_mode = options['connector_mode']
        self.export_annotations = options['export_annotations']
        self.export_tags = options['export_tags']
        self.allowed_tags = options['allowed_tags']

        if self.allowed_tags is True:
            self.allowed_tags = list(known_tags)

        self.export_users = options['export_users']
        self.export_volumes = options['export_volumes']
        # If in use, annotations annotated with this meta annotation are
        # expected to be also annotated with settings meta-annotations. They
        # also define for each set of neurons and can be annotated with
        # "settings annotations": "export: annotations" / "export: no-annotations",
        # "export: tags" / "export: no-tags" and "export: intra-connectors-only" (1) /
        # "export: intra-connectors-and-placeholders" (2) /
        # "export: intra-connectors-and-original-placeholders" (3) / "export: no-connectors".
        # Assuming the annotation "Coates et al 2020" is annotated with
        # "Publication" and "Publication is set as "settings_meta_annotation".
        # Without any further annotations annotations, the respective defaults
        # are used. If however "export: annotations" is used, annotations will
        # be exported for the respective neurons, regardless of the global
        # default.
        self.settings_meta_annotation = options['settings_meta_annotation']
        self.required_annotations = options['required_annotations']
        self.excluded_annotations = options['excluded_annotations']
        self.volume_annotations = options['volume_annotations']
        self.annotation_annotations = options['annotation_annotations']
        self.exclusion_is_final = options['exclusion_is_final']
        if 'run_noninteractive' in options:
            self.run_noninteractive = options['run_noninteractive']
        else:
            self.run_noninteractive = False
        self.target_file = options.get('file', None)
        if self.target_file:
            self.target_file = self.target_file.format(project.id)
        else:
            now = datetime.now().strftime('%Y-%m-%d-%H-%M')
            self.target_file = f'catmaid-export-pid-{project.id}-{now}.json'

        self.show_traceback = True
        self.format = 'json'
        self.indent = 2

        self.to_serialize:List = []
        self.seen:Dict = {}

    def collect_data(self):
        self.to_serialize = []

        classes = dict(Class.objects.filter(
                project=self.project).values_list('class_name', 'id'))
        relations = dict(Relation.objects.filter(
                project=self.project).values_list('relation_name', 'id'))

        if not check_tracing_setup(self.project.id, classes, relations):
            raise CommandError("Project with ID %s is no tracing project." % self.project.id)

        exclude_skeleton_id_constraints:Set = set()
        exclude_neuron_id_constraint:Set = set()
        exclude_annotation_map:Dict = dict()
        exclude_annotation_ids:List = list()
        if self.excluded_annotations:
            exclude_annotation_map = get_annotation_to_id_map(self.project.id,
                    self.excluded_annotations, relations, classes)
            exclude_annotation_ids = list(map(str, exclude_annotation_map.values()))
            if not exclude_annotation_ids:
                missing_annotations = set(self.excluded_annotations) - set(exclude_annotation_map.keys())
                raise CommandError("Could not find the following annotations: " +
                        ", ".join(missing_annotations))

            query_params = {
                'annotated_with': ",".join(exclude_annotation_ids),
                'sub_annotated_with': ",".join(exclude_annotation_ids)
            }
            neuron_info, num_total_records = get_annotated_entities(self.project.id,
                    query_params, relations, classes, ['neuron'], with_skeletons=True)

            logger.info(f"Found {num_total_records} neurons with the following exclusion annotations: {', '.join(self.excluded_annotations)}")

            exclude_skeleton_id_constraints = set(chain.from_iterable(
                    [n['skeleton_ids'] for n in neuron_info]))
            exclude_neuron_id_constraint = set(n['id'] for n in neuron_info)

        # This data structure allows settings look-up for neuron-centric export
        # options. If no neuron specific override has been made, the look-up
        # will provide the default values provided to the exporter.
        export_settings = {
            'treenodes': defaultdict(lambda: self.export_treenodes),
            'connectors': defaultdict(lambda: self.connector_mode),
            'annotations': defaultdict(lambda: self.export_annotations),
            'tags': defaultdict(lambda: self.export_tags),
        }

        if self.settings_meta_annotation:
            # Get all annotations that are annotated with the
            # settings_meta_annotation. For each of those annotations, get the
            # value for each of the following settings:
            # "settings annotations": "export: annotations" / "export: no-annotations",
            # "export: tags" / "export: no-tags" and "export: intra-connectors-only" (1) /
            # "export: intra-connectors-and-placeholders" (2) /
            # "export: intra-connectors-and-original-placeholders" (3) / "export: no-connectors"
            # Next, associate these settings with individual neurons. In
            # conflicting situations there more open strategy wins.
            settings_meta_annotation_map = get_annotation_to_id_map(self.project.id,
                    [self.settings_meta_annotation], relations, classes)
            settings_annotation_ids = list(map(str, settings_meta_annotation_map.values()))
            if not settings_annotation_ids:
                missing_annotations = set(self.settings_meta_annotation) - set(settings_meta_annotation_map.keys())
                raise CommandError("Could not find the following settings meta-annotations: " +
                        ", ".join(missing_annotations))

            query_params = {
                'annotated_with': ",".join(settings_annotation_ids),
            }
            settings_annotations, num_total_records = get_annotated_entities(self.project.id,
                    query_params, relations, classes, ['annotation'])

            logger.info(f"Found {num_total_records} annotations with the "
                    f"following settings meta-annotations: {self.settings_meta_annotation}")

            set_annotation_map = dict([(n['name'], n['id']) for n in settings_annotations])
            set_annotation_ids = list(set_annotation_map.values())

            # Get a map of all export settings annotations
            settings_annotation_names = ["export: annotations", "export: no-annotations",
                    "export: tags", "export: no-tags", "export: intra-connectors-only",
                    "export: intra-connectors-and-placeholders",
                    "export: intra-connectors-and-original-placeholders",
                    "export: no-connectors"]
            settings_annotations_map = get_annotation_to_id_map(
                    self.project.id, settings_annotation_names, relations, classes)

            logger.info(f"Found {len(settings_annotations_map)} used "
                    f"settings annotations: {', '.join(settings_annotations_map.keys())}")

            # For each of these annotations, collect all annotated neurons and
            # the settings for them.
            settings_neuron_infos = dict()
            for se_name, se_id in set_annotation_map.items():
                query_params = {
                    'annotated_with': str(se_id),
                    'sub_annotated_with': str(se_id),
                }
                settings_neuron_info, num_total_records = get_annotated_entities(self.project.id,
                        query_params, relations, classes, ['neuron'], with_skeletons=True)

                logger.info(f"Found {num_total_records} neurons with the "
                  f"following settings meta-annotations: {se_name}")

                skeleton_ids_with_settings:Optional[List] = \
                        list(chain.from_iterable([n['skeleton_ids'] for n in settings_neuron_info]))
                neuron_ids_with_settings = [n['id'] for n in settings_neuron_info]

                # Get all annotations of this neuron set, including settings annotations
                annotation_entity_map, annotation_annotation_map = \
                        get_annotations_for_entities(self.project.id, [se_id])

                # Whether treenodes should be exported for this neuron set. If there
                # are both TreenodesYes and TreenodesNo annotations, the former wins.
                treenode_setting = None
                for ex_an in (ExportAnnotation.TreenodesNo, ExportAnnotation.TreenodesYes):
                    if ex_an in settings_annotations_map and \
                            settings_annotations_map[ex_an] in annotation_annotation_map:
                        treenode_setting = ex_an

                # Whether tags should be exported for this neuron set. If there
                # are both TagsYes and TagsNo annotations, the former wins.
                tag_setings = None
                for ex_an in (ExportAnnotation.TagsNo, ExportAnnotation.TagsYes):
                    if ex_an.value in settings_annotations_map and \
                            settings_annotations_map[ex_an.value] in annotation_annotation_map:
                        tag_setings = ex_an

                # Whether tags should be exported for this neuron set. If there
                # are both AnnotationsYes and AnnotationsNo annotations, the former wins.
                annotation_settings = None
                for ex_an in (ExportAnnotation.AnnotationsNo, ExportAnnotation.AnnotationsYes):
                    if ex_an.value in settings_annotations_map and \
                            settings_annotations_map[ex_an.value] in annotation_annotation_map:
                        annotation_settings = ex_an
                # Whether connectors should be exported for this neuron set. If there
                # are multiple of the annotations ConnectorsNo, ConnectorsOnlyIntra,
                # ConnectorsNewPlaceholders or ConnectorsOriginalPlaceholders are
                # assigned, they dominate each other in this order.
                connector_settings = None
                connector_ann_hierarchy = (
                        ExportAnnotation.ConnectorsNo,
                        ExportAnnotation.ConnectorsOnlyIntra,
                        ExportAnnotation.ConnectorsNewPlaceholders,
                        ExportAnnotation.ConnectorsOriginalPlaceholders,
                )
                for ex_an in connector_ann_hierarchy:
                    if ex_an.value in settings_annotations_map and \
                            settings_annotations_map[ex_an.value] in annotation_annotation_map:
                        connector_settings = ex_an

                settings_neuron_infos[se_id] = {
                    'info': settings_neuron_info,
                    'skeleton_ids': skeleton_ids_with_settings,
                    'treenode_setting': treenode_setting,
                    'tag_setings': tag_setings,
                    'annotation_settings': annotation_settings,
                    'connector_settings': connector_settings,
                }

                # Store each setting, as long as it is not already stored for
                # this neuron in a form with more weight.
                n_updated_treenodes = 0
                n_updated_tags = 0
                n_updated_annotations = 0
                n_updated_connectors = 0
                for skeleton_id in skeleton_ids_with_settings:
                    if ExportAnnotation.has_more_weight(treenode_setting,
                            export_settings['treenodes'].get(skeleton_id)):
                        export_settings['treenodes'][skeleton_id] = treenode_setting
                        n_updated_treenodes += 1
                    if ExportAnnotation.has_more_weight(tag_setings,
                            export_settings['tags'].get(skeleton_id)):
                        export_settings['tags'][skeleton_id] = tag_setings
                        n_updated_tags += 1
                    if ExportAnnotation.has_more_weight(annotation_settings,
                            export_settings['annotations'].get(skeleton_id)):
                        export_settings['annotations'][skeleton_id] = annotation_settings
                        n_updated_annotations += 1
                    if ExportAnnotation.has_more_weight(connector_settings,
                            export_settings['connectors'].get(skeleton_id)):
                        export_settings['connectors'][skeleton_id] = connector_settings
                        n_updated_connectors += 1

                logger.info(f'Updated export settings for set "{se_name}" '
                        f'({len(skeleton_ids_with_settings)} skeletons) based on annotations for '
                        f'treenodes ({n_updated_treenodes} neurons), '
                        f'tags ({n_updated_tags} neurons), '
                        f'annotations ({n_updated_annotations} neurons), '
                        f'connectors ({n_updated_connectors} neurons).')

        n_export_settings = reduce(lambda x, y: x + len(y), export_settings.values(), 0)
        n_export_settings_connectors = len(export_settings['connectors'])

        if self.required_annotations:
            annotation_map = get_annotation_to_id_map(self.project.id,
                    self.required_annotations, relations, classes)
            annotation_ids = list(map(str, annotation_map.values()))
            if not annotation_ids:
                missing_annotations = set(self.required_annotations) - set(annotation_map.keys())
                raise CommandError("Could not find the following annotations: " +
                        ", ".join(missing_annotations))

            query_params = {
                'annotated_with': ",".join(annotation_ids),
                'sub_annotated_with': ",".join(annotation_ids)
            }
            neuron_info, num_total_records = get_annotated_entities(self.project.id,
                    query_params, relations, classes, ['neuron'], with_skeletons=True)

            logger.info(f"Found {num_total_records} neurons with the following annotations: {', '.join(self.required_annotations)}")

            skeleton_id_constraints:Optional[List] = list(chain.from_iterable([n['skeleton_ids'] for n in neuron_info]))
            neuron_ids = [n['id'] for n in neuron_info]

            # Remove excluded skeletons if either a) exclusion_is_final is set
            # or b) the annotation target is *not* annotated with a required
            # annotation or one of its sub-annotations.
            if exclude_skeleton_id_constraints:
                if self.exclusion_is_final:
                    skeleton_id_constraints = [
                        skid for skid in skeleton_id_constraints # type: ignore
                        if skid not in exclude_skeleton_id_constraints]
                    neuron_ids = [nid for nid in neuron_ids
                                if nid not in exclude_neuron_id_constraint]
                else:
                    # Remove all skeletons that are marked as excluded *and* are
                    # not annotatead with at least one *other* annotation that
                    # is part of the required annotation set or its
                    # sub-annotation hierarchy. To do this, get first all
                    # sub-annotations of the set of required annotations and
                    # remove the exclusion annotations. Then check all excluded
                    # skeleton IDs if they are annotatead with any of the
                    # those annotations. If not, they are removed from the
                    # exported set.
                    keeping_ids = set(map(int, annotation_ids))
                    annotation_sets_to_expand = set([frozenset(keeping_ids)])
                    sub_annotation_map = get_sub_annotation_ids(self.project.id,
                            annotation_sets_to_expand, relations, classes)
                    sub_annotation_ids = set(chain.from_iterable(sub_annotation_map.values())) - \
                            set(exclude_annotation_map.values())

                    # Get all skeletons annotated *directly* with one of the sub
                    # annotations or the expanded annotations themselves.
                    keep_query_params = {
                        'annotated_with': ','.join(str(a) for a in sub_annotation_ids),
                    }
                    keep_neuron_info, keep_num_total_records = get_annotated_entities(self.project.id,
                            keep_query_params, relations, classes, ['neuron'], with_skeletons=True)
                    # Exclude all skeletons that are not in this result set
                    skeleton_id_constraints = list(chain.from_iterable([n['skeleton_ids'] for n in keep_neuron_info]))
                    neuron_ids = [n['id'] for n in keep_neuron_info]

            entities = ClassInstance.objects.filter(pk__in=neuron_ids)

            skeletons = ClassInstance.objects.filter(project=self.project,
                    id__in=skeleton_id_constraints)
            skeleton_links = ClassInstanceClassInstance.objects.filter(
                    project_id=self.project.id, relation=relations['model_of'],
                    class_instance_a__in=skeletons, class_instance_b__in=entities)
        else:
            skeleton_id_constraints = None
            entities = ClassInstance.objects.filter(project=self.project,
                    class_column__in=[classes['neuron']])
            skeleton_links = ClassInstanceClassInstance.objects.filter(
                    project_id=self.project.id, relation=relations['model_of'],
                    class_instance_a__class_column=classes['skeleton'])
            skeletons = ClassInstance.objects.filter(project=self.project,
                    class_column__in=[classes['skeleton']])

            if exclude_skeleton_id_constraints:
                entities = entities.exclude(id__in=exclude_neuron_id_constraint)
                skeleton_links = skeleton_links.exclude(class_instance_a__in=exclude_skeleton_id_constraints)
                skeletons = skeletons.exclude(id__in=exclude_skeleton_id_constraints)

        if entities.count() == 0:
            raise CommandError("No matching neurons found")

        print("Will export %s neurons" % entities.count())
        if not self.run_noninteractive:
            start_export = ask_to_continue()
            if not start_export:
                raise CommandError("Canceled by user")

        # Export classes and relations
        self.to_serialize.append(Class.objects.filter(project=self.project))
        self.to_serialize.append(Relation.objects.filter(project=self.project))

        # Export skeleton-neuron links
        self.to_serialize.append(entities)
        self.to_serialize.append(skeleton_links)
        self.to_serialize.append(skeletons)

        treenodes = None
        connector_ids = None
        if skeleton_id_constraints:
            # Export treenodes along with their skeletons and neurons
            if self.export_treenodes:
                treenodes = Treenode.objects.filter(
                        project=self.project,
                        skeleton_id__in=skeleton_id_constraints)
                self.to_serialize.append(treenodes)

            # Export connectors and connector links. If there are no overrides,
            # just use the default value.
            connector_links = None
            n_skeletons_ignored_for_connectors = 0
            if len(export_settings['connectors']) == 0:
                if self.connector_mode != ConnectorMode.NoConnectors:
                    connector_links = TreenodeConnector.objects.filter(
                            project=self.project, skeleton_id__in=skeleton_id_constraints) \
                            .values_list('id', 'connector', 'treenode')
            else:
                # Find subset of connectors that should be exported, which are
                # all skeletons that have been found to be exported before, plus
                # those explicitly marked for export, minus those explicitly
                # unmarked for export and minus connector links that cross
                # between sets that don't want to share synapses in the export.
                if self.connector_mode != ConnectorMode.NoConnectors:
                    connector_skeletons = set(skeleton_id_constraints)
                else:
                    connector_skeletons = set()
                n_default_connector_skeletons = len(connector_skeletons)

                connector_link_lists = []
                logger.info('Marking connector links for export for individual neuron sets')
                for se_name, se_id in set_annotation_map.items():
                    settings_neuron_info = settings_neuron_infos.get(se_id)
                    if settings_neuron_info is None:
                        logger.error(f'Could not find export setting info for set annotation {se_name} with ID {se_id}')
                        continue

                    skeleton_ids = settings_neuron_info['skeleton_ids']
                    connector_setting = settings_neuron_info['connector_settings']

                    if connector_setting == ExportAnnotation.ConnectorsOnlyIntra:
                        logger.info(f'Allowing only intra-set connector links export for neuron set "{se_name}" (ID: {se_id}, # skeletons: {len(skeleton_ids)})')
                        # Remove this neuron set from the general set of connector skeletons
                        connector_skeletons = connector_skeletons - set(skeleton_ids)
                    elif connector_setting == ExportAnnotation.ConnectorsNo:
                        logger.info(f'Skipping connector link export for neuron set "{se_name}" (ID: {se_id}, # skeletons: {len(skeleton_ids)})')
                        connector_skeletons = connector_skeletons - set(skeleton_ids)
                        n_skeletons_ignored_for_connectors += len(skeleton_ids)
                        continue
                    elif connector_setting is None:
                        logger.info(f'Applying no connector link constraints for neuron set "{se_name}" (ID: {se_id}, # skeletons: {len(skeleton_ids)}, Default: {self.connector_mode})')
                        continue
                    else:
                        logger.info(f'Allowing regular connectivity for neuron set "{se_name}" (ID: {se_id}, # skeletons: {len(skeleton_ids)})')

                    connector_link_lists.append(TreenodeConnector.objects \
                            .filter(project=self.project, skeleton_id__in=skeleton_ids) \
                            .values_list('id', 'connector', 'treenode'))
                    logger.info(f'Current number of connector links: {len(connector_link_lists[-1])}')

                # Add remaining export skeletons that didn't have any explicit constraint.
                connector_link_lists.append(TreenodeConnector.objects \
                        .filter(project=self.project, skeleton_id__in=connector_skeletons) \
                        .values_list('id', 'connector', 'treenode'))

                # Merge all sets
                connector_links = list(chain.from_iterable(connector_link_lists))

            # Add matching connectors
            if connector_links:
                connector_ids = set(c for _,c,_ in connector_links)
                self.to_serialize.append(Connector.objects.filter(
                        id__in=connector_ids))
                logger.info(f'Exporting {len(connector_ids)} connectors '
                        f'({n_skeletons_ignored_for_connectors} explicitly ignored) '
                        f'with {len(connector_links)} links')

                # Add matching connector links
                self.to_serialize.append(TreenodeConnector.objects.filter(
                        id__in=[link_id for link_id,_,_ in connector_links]))

            # Export annotations and annotation-neuron links. Include meta
            # annotations.
            if (self.export_annotations or len(export_settings['annotations']) > 0) and \
                    'annotated_with' in relations:
                annotated_with = relations['annotated_with']
                all_annotations:Set = set()
                all_annotation_links:Set = set()

                if len(export_settings['annotations']) == 0:
                    working_set = [e for e in entities]
                else:
                    annotation_skeletons = set(skeleton_id_constraints)
                    n_default_annotation_skeletons = len(annotation_skeletons)
                    for skeleton_id, export_annotation in export_settings['annotations'].items():
                        if export_annotation == ExportAnnotation.AnnotationsNo:
                            annotation_skeletons.remove(skeleton_id)
                        elif export_annotation == ExportAnnotation.AnnotationsYes:
                            annotation_skeletons.add(skeleton_id)
                    n_skeletons_ignored_for_annotations = n_default_annotation_skeletons - len(annotation_skeletons)

                    # Create a map of skeleton IDs to neuron IDs
                    cursor = connection.cursor()
                    cursor.execute("""
                        SELECT array_agg(cici.class_instance_b)
                        FROM class_instance_class_instance cici
                        WHERE cici.project_id = %(project_id)s AND
                              cici.relation_id = %(model_of)s AND
                              cici.class_instance_a = ANY(%(skeleton_ids)s::bigint[])
                    """, {
                        'project_id': self.project.id,
                        'model_of': relations['model_of'],
                        'skeleton_ids': list(annotation_skeletons),
                    })
                    working_set = cursor.fetchone()[0]

                # Optionally, allow only annotations that are themselves
                # annotated with a required annotation. These annotations are
                # OR-combined.
                if self.annotation_annotations:
                    annotation_annotation_ids = ClassInstance.objects.filter(
                            project_id=self.project.id,
                            class_column=classes['annotation'],
                            name__in=self.annotation_annotations).values_list('id', flat=True)
                    allowed_annotation_dict = get_sub_annotation_ids(self.project.id,
                            [frozenset(annotation_annotation_ids)], relations, classes)
                    allowed_annotations = set(allowed_annotation_dict.keys()).union(
                            set(chain.from_iterable(allowed_annotation_dict.values())))
                else:
                    allowed_annotations = set()

                while working_set:
                    annotation_links = ClassInstanceClassInstance.objects.filter(
                            project_id=self.project.id, relation=annotated_with,
                            class_instance_a__in=working_set)
                    annotations = ClassInstance.objects.filter(project_id=self.project.id,
                            cici_via_b__in=annotation_links)

                    # Reset working set to add next entries
                    working_set = []

                    if self.annotation_annotations:
                        for al in annotation_links:
                            # Only add it to the list of exported annotation
                            # links if it hasn't been seen before and the linked
                            # annotation is allowed.
                            if al not in all_annotation_links and \
                                    al.class_instance_b_id in allowed_annotations:
                                all_annotation_links.add(al)

                        for a in annotations:
                            if a not in all_annotations and \
                                   a.id in allowed_annotations:
                                all_annotations.add(a)
                                working_set.append(a)

                        # Make sure the export is consistent by checking that
                        # all annotations refernced by links will be included in
                        # the export.
                        for al in all_annotation_links:
                            if al.class_instance_b not in all_annotations:
                                all_annotations.add(al.class_instance_b)
                    else:
                        for al in annotation_links:
                            if al not in all_annotation_links:
                                all_annotation_links.add(al)

                        for a in annotations:
                            if a not in all_annotations:
                                all_annotations.add(a)
                                working_set.append(a)

                if all_annotations:
                    self.to_serialize.append(all_annotations)
                if all_annotation_links:
                    self.to_serialize.append(all_annotation_links)

                logger.info(f"Exporting {len(all_annotations)} annotations " + \
                            f"and {len(all_annotation_links)} annotation links")#: {', '.join([a.name for a in all_annotations])}")
                if self.annotation_annotations:
                    logger.info("Only annotations in hierarchy of the following " + \
                                f"annotations are exported: {', '.join(self.annotation_annotations)}")

            # Export tags
            tags = None
            if len(export_settings['tags']) == 0:
                if self.export_tags and 'labeled_as' in relations:
                    tag_filter_params = {
                        'project': self.project,
                        'class_instance__class_column': classes['label'],
                        'relation_id': relations['labeled_as'],
                        'treenode__skeleton_id__in': skeleton_id_constraints,
                    }
                    if self.allowed_tags is not None:
                        tag_filter_params['class_instance__name__in'] = self.allowed_tags

                    tag_links = TreenodeClassInstance.objects.select_related('class_instance').filter(
                            **tag_filter_params)
                    # Because we retrieve these objects as part of the returned
                    # links to get only the used tags.
                    tags = set(t.class_instance for t in tag_links)
            else:
                tag_skeletons = set(skeleton_id_constraints)
                n_default_tag_skeletons = len(tag_skeletons)
                for skeleton_id, export_annotation in export_settings['tags'].items():
                    if export_annotation == ExportAnnotation.TagsNo:
                        tag_skeletons.remove(skeleton_id)
                    elif export_annotation == ExportAnnotation.TagsYes:
                        tag_skeletons.add(skeleton_id)
                n_skeletons_ignored_for_tags = n_default_tag_skeletons - len(tag_skeletons)

                tag_filter_params = {
                    'project': self.project,
                    'class_instance__class_column': classes['label'],
                    'relation_id': relations['labeled_as'],
                    'treenode__skeleton_id__in': tag_skeletons,
                }

                if self.allowed_tags is not None:
                    tag_filter_params['class_instance__name__in'] = self.allowed_tags

                tag_links = TreenodeClassInstance.objects.select_related('class_instance') \
                        .filter(**tag_filter_params)
                # Because we retrieve these objects as part of the returned
                # links to get only the used tags.
                tags = set(t.class_instance for t in tag_links)

            if tags or tag_links:
                tag_names = sorted(set(t.name for t in tags))
                if self.allowed_tags is None:
                    logger.info('All tags are allowed for export')
                else:
                    logger.info(f'Allowed tags: {", ".join(self.allowed_tags)}')
                logger.info(f"Exporting {len(tags)} tags, part of {tag_links.count()} links: {', '.join(tag_names)}")

                self.to_serialize.append(tags)
                self.to_serialize.append(tag_links)
            else:
                logger.info(f"Exporting {len(tags)} tags and {tag_links.count()} tag links")


            # TODO: Export reviews
        else:
            # TODO: Add support for export annotations
            if n_export_settings > 0:
                logger.warn('Export settings are currently only supported for '
                        f'annotation based exports. Found {n_export_settings} '
                        'export setting annotations')

            # Export treenodes
            if self.export_treenodes:
                treenodes = Treenode.objects.filter(project=self.project)
                if exclude_skeleton_id_constraints:
                    treenodes = treenodes.exclude(skeleton_id=exclude_skeleton_id_constraints)
                self.to_serialize.append(treenodes)

            # Export connectors and connector links
            if self.connector_mode != ConnectorMode.NoConnectors:
                self.to_serialize.append(Connector.objects.filter(
                        project=self.project))
                self.to_serialize.append(TreenodeConnector.objects.filter(
                        project=self.project))

            # Export all tags
            if self.export_tags:
                tags = ClassInstance.objects.filter(project=self.project,
                        class_column=classes['label'])
                tag_links = TreenodeClassInstance.objects.filter(project=self.project,
                        class_instance__class_column=classes['label'],
                        relation_id=relations['labeled_as'])
                if exclude_skeleton_id_constraints:
                    tag_links = tag_links.exclude(skeleton_id=exclude_skeleton_id_constraints)

                self.to_serialize.append(tags)
                self.to_serialize.append(tag_links)

            # TODO: Export reviews


        # Export referenced neurons and skeletons
        exported_tids:Set = set()
        if treenodes:
            treenode_skeleton_ids = set(t.skeleton_id for t in treenodes)
            n_skeletons = ClassInstance.objects.filter(
                    project=self.project,
                    id__in=treenode_skeleton_ids).count()
            neuron_links = ClassInstanceClassInstance.objects \
                    .filter(project=self.project, class_instance_a__in=treenode_skeleton_ids, \
                           relation=relations.get('model_of'))
            n_neuron_links = len(neuron_links)
            neurons = set([link.class_instance_b_id for link in neuron_links])

            exported_tids = set(treenodes.values_list('id', flat=True))
            logger.info(f"Exporting {len(exported_tids)} treenodes in {n_skeletons} skeletons and {len(neurons)} neurons")

        # Get current maximum concept ID
        cursor = connection.cursor()
        cursor.execute("""
            SELECT MAX(id) FROM concept
        """)
        new_skeleton_id = cursor.fetchone()[0] + 1
        new_neuron_id = new_skeleton_id + 1
        new_model_of_id = new_skeleton_id + 2
        new_concept_offset = 3
        new_neuron_name_id = 1
        if skeleton_id_constraints:
            if connector_ids:
                # Add addition placeholder treenodes
                connector_links = list(TreenodeConnector.objects \
                    .filter(project=self.project, connector__in=connector_ids) \
                    .exclude(skeleton_id__in=skeleton_id_constraints))
                connector_tids = set(c.treenode_id for c in connector_links)
                extra_tids = connector_tids - exported_tids

                connector_export_settings = export_settings['connectors']
                logger.info(f"Exporting {len(extra_tids)} placeholder nodes")

                placeholder_treenodes = Treenode.objects.prefetch_related(
                        'treenodeconnector_set').filter(id__in=extra_tids)

                # Placeholder nodes will be transformed into root nodes of new
                # skeletons.
                new_skeleton_cis = []
                new_neuron_cis = []
                new_model_of_links = []
                new_tc_links = []
                n_new_placeholder_context = 0
                original_placeholder_nodes = []
                default_to_new_context = self.connector_mode == ConnectorMode.IntraConnectorsAndPlaceholders
                for pt in placeholder_treenodes:
                    # Remov ereference to other treenodes
                    pt.parent_id = None

                    export_mode = connector_export_settings.get(pt.skeleton_id)
                    create_new_placeholder_context = \
                            (export_mode is None and not default_to_new_context) or \
                            export_mode == ExportAnnotation.ConnectorsNewPlaceholders
                    if create_new_placeholder_context:
                        n_new_placeholder_context += 1
                        original_skeleton_id = pt.skeleton_id
                        pt.skeleton_id = new_skeleton_id

                        # Add class instances for both the skeleton and neuron for
                        # the placeholder node skeleton
                        new_skeleton_ci = ClassInstance(
                                id = new_skeleton_id,
                                user_id=pt.user_id,
                                creation_time=pt.creation_time,
                                edition_time=pt.edition_time,
                                project_id=pt.project_id,
                                class_column_id=classes['skeleton'],
                                name='Placeholder Skeleton ' + str(new_neuron_name_id))

                        new_neuron_ci = ClassInstance(
                                id = new_neuron_id,
                                user_id=pt.user_id,
                                creation_time=pt.creation_time,
                                edition_time=pt.edition_time,
                                project_id=pt.project_id,
                                class_column_id=classes['neuron'],
                                name='Placeholder Neuron ' + str(new_neuron_name_id))

                        new_model_of_link = ClassInstanceClassInstance(
                                id=new_model_of_id,
                                user_id=pt.user_id,
                                creation_time=pt.creation_time,
                                edition_time=pt.edition_time,
                                project_id=pt.project_id,
                                relation_id=relations['model_of'],
                                class_instance_a_id=new_skeleton_id,
                                class_instance_b_id=new_neuron_id)

                        tc_offset = 0
                        for tc in pt.treenodeconnector_set.all():
                            # Only export treenode connector links to connectors
                            # that are exported.
                            if tc.skeleton_id != original_skeleton_id or \
                                    tc.connector_id not in connector_ids:
                                continue
                            new_tc_id = new_skeleton_id + new_concept_offset + 1
                            tc_offset += 1
                            new_treenode_connector = TreenodeConnector(
                                    id=new_tc_id,
                                    user_id=tc.user_id,
                                    creation_time=tc.creation_time,
                                    edition_time=tc.edition_time,
                                    project_id=tc.project_id,
                                    relation_id=tc.relation_id,
                                    treenode_id=pt.id,
                                    skeleton_id = new_skeleton_id,
                                    connector_id=tc.connector_id)
                            new_tc_links.append(new_treenode_connector)

                        effective_offset = new_concept_offset + tc_offset
                        new_skeleton_id += effective_offset
                        new_neuron_id += effective_offset
                        new_model_of_id += effective_offset
                        new_neuron_name_id += 1

                        new_skeleton_cis.append(new_skeleton_ci)
                        new_neuron_cis.append(new_neuron_ci)
                        new_model_of_links.append(new_model_of_link)
                    else:
                        original_placeholder_nodes.append(pt)

                # Find treenodes
                logger.info(f"Exported {len(original_placeholder_nodes)} "
                        "placeholder nodes with original context, and "
                        f"{n_new_placeholder_context} placeholder nodes with a new "
                        "context.")

                if n_new_placeholder_context > 0:
                    self.to_serialize.append(new_skeleton_cis)
                    self.to_serialize.append(new_neuron_cis)
                    self.to_serialize.append(new_model_of_links)
                    if new_tc_links:
                        self.to_serialize.append(new_tc_links)

                self.to_serialize.append(placeholder_treenodes)

                # Add additional skeletons and neuron-skeleton links
                if original_placeholder_nodes:
                    # Original skeletons
                    extra_skids = set(tn.skeleton_id for tn in original_placeholder_nodes)
                    self.to_serialize.append(ClassInstance.objects.filter(id__in=extra_skids))

                    # Original skeleton model-of neuron links
                    extra_links = ClassInstanceClassInstance.objects \
                            .filter(project=self.project,
                                    class_instance_a__in=extra_skids,
                                    relation=relations['model_of'])
                    self.to_serialize.append(extra_links)

                    # Original neurons
                    extra_nids = extra_links.values_list('class_instance_b', flat=True)
                    self.to_serialize.append(ClassInstance.objects.filter(
                        project=self.project, id__in=extra_nids))

                    # Connector links
                    self.to_serialize.append(connector_links)

        # Volumes
        if self.export_volumes:
            volumes = find_volumes(self.project.id, self.volume_annotations,
                    True, True)
            volume_ids =[v['id'] for v in volumes]
            if volume_ids:
                volumes = Volume.objects.filter(pk__in=volume_ids,
                        project_id=self.project.id)
                logger.info("Exporting {} volumes: {}".format(
                        len(volumes), ', '.join(v.name for v in volumes)))
                self.to_serialize.append(volumes)
            else:
                logger.info("No volumes found to export")

        # Export users, either completely or in a reduced form
        seen_user_ids = set()
        # Find users involved in exported data
        for group in self.to_serialize:
            for o in group:
                if hasattr(o, 'user_id'):
                    seen_user_ids.add(o.user_id)
                if hasattr(o, 'reviewer_id'):
                    seen_user_ids.add(o.reviewer_id)
                if hasattr(o, 'editor_id'):
                    seen_user_ids.add(o.editor_id)
        users = [ExportUser(id=u.id, username=u.username, password=u.password,
                first_name=u.first_name, last_name=u.last_name, email=u.email,
                date_joined=u.date_joined) \
                for u in User.objects.filter(pk__in=seen_user_ids)]
        if self.export_users:
            logger.info("Exporting {} users: {}".format(len(users),
                    ", ".join([u.username for u in users])))
            self.to_serialize.append(users)
        else:
            # Export in reduced form
            reduced_users = []
            for u in users:
                reduced_user = ReducedInfoUser(id=u.id, username=u.username,
                        password=make_password(User.objects.make_random_password()))
                reduced_users.append(reduced_user)
            logger.info("Exporting {} users in reduced form with random passwords: {}".format(len(reduced_users),
                    ", ".join([u.username for u in reduced_users])))
            self.to_serialize.append(reduced_users)

    def export(self):
        """ Writes all objects matching
        """
        try:
            self.collect_data()

            data = list(chain(*self.to_serialize))

            CurrentSerializer = serializers.get_serializer(self.format)
            serializer = CurrentSerializer()

            with open(self.target_file, "w") as out:
                serializer.serialize(data, indent=self.indent, stream=out)
        except Exception as e:
            if self.show_traceback:
                raise
            raise CommandError("Unable to serialize database: %s" % e)


class ConnectorMode(Enum):
    """The way connector links are handled if they are outside of the current
    set of exported neurons. These can either be all neurons or annotation based
    sets.
    """
    NoConnectors = 'false'
    IntraConnectorsOnly = 'intra_connectors_only' # 1
    IntraConnectorsAndPlaceholders = 'intra_connectors_and_placeholders' # 2
    IntraConnectorsAndOriginalPlaceholders = 'intra_connectors_and_original_placeholders' # 3

    def __str__(self):
        return self.name

    @staticmethod
    def from_string(s):
        for m in list(ConnectorMode):
            if m.value == s:
                return m
        raise ValueError()


class Command(BaseCommand):
    """ Call e.g. like
        ./manage.py catmaid_export_data --source 1 --required-annotation "Kenyon cells"
    """
    help = "Export CATMAID data into a JSON representation"

    def add_arguments(self, parser):
        parser.add_argument('--source', default=None,
            help='The ID of the source project')
        parser.add_argument('--file', default=None,
            help='Output file name, "{}" will be replaced with project ID')
        parser.add_argument('--treenodes', dest='export_treenodes',
                type=str2bool, nargs='?', const=True, default=True,
                help='Export treenodes from source')
        parser.add_argument('--connectors', dest='connector_mode',
                type=ConnectorMode, choices=list(ConnectorMode),
                help="Whether connectors should be exported. Connectors "
                "outside of the current group of exported neurons can be "
                "handled in differnt ways. These so called " "placeholder nodes "
                "can be not exported at all, with their " "original IDs or new IDs.")
        parser.add_argument('--annotations', dest='export_annotations',
                type=str2bool, nargs='?', const=True, default=True,
                help='Export annotations from source')
        parser.add_argument('--tags', dest='export_tags',
                type=str2bool, nargs='?', const=True, default=True,
                help='Export tags from source')
        parser.add_argument('--allowed-tags-only', dest='allowed_tags',
                type=str2list, nargs='?', const=True, default=None,
                help='The list of allowed tags. If omitted, all tags will be '
                'exported. If provided without arguments, the call is equivalent '
                'to providing the parameters: ' + ', '.join(known_tags))
        parser.add_argument('--users', dest='export_users',
                type=str2bool, nargs='?', const=True, default=False,
                help='Export users from source')
        parser.add_argument('--volumes', dest='export_volumes',
                type=str2bool, nargs='?', const=True, default=False,
                help='Export volumes from source. More constraints can be ' +
                'provided using the --volume-annotation argument.')
        parser.add_argument('--required-annotation', dest='required_annotations',
            action='append', help='Name a required annotation for exported ' +
            'skeletons. Meta-annotations can be used as well.')
        parser.add_argument('--excluded-annotation', dest='excluded_annotations',
            action='append', help='Name an annotation that is used to exclude ' +
            'skeletons from the export. Meta-annotations can be used as well.')
        parser.add_argument('--volume-annotation', dest='volume_annotations',
            action='append', help='Name a required annotation for exported ' +
            'volumes. Meta-annotations can be used as well.')
        parser.add_argument('--annotation-annotation', dest='annotation_annotations',
            action='append', help='Name a required annotation for exported ' +
            'annotations. Meta-annotations can be used as well, will export ' +
            'whole hierarchies.')
        parser.add_argument('--settings-meta-annotation', dest='settings_meta_annotation',
            action='append', help='A meta-annotation passed in will be used to '
            'find other annotations that will group neurons. For each of these '
            'grouping annotations, the exporter will look for export annotations '
            '(on the annotation itself). Anything found will be used for the '
            'respective neurons. In case of conflict, the one exporting more, '
            'wins.', default=None)
        parser.add_argument('--exclusion-is-final', dest='exclusion_is_final',
            action='store_true', default=False, help='Whether or not neurons ' +
            'should be excluded if in addition to an exclusion annotation ' +
            'they are also annotated with a required (inclusion) annotation.')

    def ask_for_project(self, title):
        """ Return a valid project object.
        """
        def ask():
            print("Please enter the number for the %s project:" % title)
            projects = Project.objects.all()
            for n,p in enumerate(projects):
                print("%s: %s (ID: %s)" % (n, p, p.id))
            selection = input("Selection: ")
            try:
                return projects[int(selection)]
            except (IndexError, ValueError) as e:
                return None

        while True:
            p = ask()
            if p:
                return p

    def handle(self, *args, **options):
        set_log_level(logger, options.get('verbosity', 1))
        # Give some information about the export
        will_export = []
        wont_export = []
        for t in ('treenodes', 'annotations', 'tags'):
            if options['export_' + t]:
                will_export.append(t)
            else:
                wont_export.append(t)

        connector_mode = options['connector_mode']
        if connector_mode == ConnectorMode.IntraConnectorsOnly:
            will_export.append('connectors (only intra)')
        elif connector_mode == ConnectorMode.IntraConnectorsAndPlaceholders:
            will_export.append('connectors (intra + new placeholders)')
        elif connector_mode == ConnectorMode.IntraConnectorsOnly:
            will_export.append('connectors (intra + original placeholders)')
        elif connector_mode != ConnectorMode.NoConnectors:
            logger.warn(f'Unknown connector mode: {connector_mode}')


        if will_export:
            logger.info("Will export by default: " + ", ".join(will_export))
        else:
            logger.info("Nothing selected for export")
            return

        if wont_export:
            logger.info("Won't export: " + ", ".join(wont_export))

        # Read source
        if not options['source']:
            source = self.ask_for_project('source')
        else:
            source = Project.objects.get(pk=options['source'])

        # Process with export
        if (options['required_annotations']):
            logger.info("Needed annotations for exported skeletons: " +
                  ", ".join(options['required_annotations']))
        if (options['excluded_annotations']):
            logger.info("Excluding skeletons with the following annotation: " +
                  ", ".join(options['excluded_annotations']))

        exporter = Exporter(source, options)
        exporter.export()

        logger.info("Finished export, result written to: %s" % exporter.target_file)
