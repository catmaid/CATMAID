# -*- coding: utf-8 -*-

from datetime import datetime
from itertools import chain
from typing import Dict, List, Optional, Set

from catmaid.control.annotation import (get_annotated_entities,
        get_annotation_to_id_map, get_sub_annotation_ids)
from catmaid.control.tracing import check_tracing_setup
from catmaid.control.volume import find_volumes
from catmaid.models import (Class, ClassInstance, ClassInstanceClassInstance,
        Relation, Connector, Project, Treenode, TreenodeClassInstance,
        TreenodeConnector, User, ReducedInfoUser, ExportUser, Volume)
from catmaid.util import str2bool
from django.db import connection
from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.hashers import make_password


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

class Exporter():

    def __init__(self, project, options):
        self.project = project
        self.options = options
        self.export_treenodes = options['export_treenodes']
        self.export_connectors = options['export_connectors']
        self.export_annotations = options['export_annotations']
        self.export_tags = options['export_tags']
        self.export_users = options['export_users']
        self.export_volumes = options['export_volumes']
        self.required_annotations = options['required_annotations']
        self.excluded_annotations = options['excluded_annotations']
        self.volume_annotations = options['volume_annotations']
        self.annotation_annotations = options['annotation_annotations']
        self.exclusion_is_final = options['exclusion_is_final']
        self.original_placeholder_context = options['original_placeholder_context']
        self.target_file = options.get('file', None)
        if self.target_file:
            self.target_file = self.target_file.format(project.id)
        else:
            now = datetime.now().strftime('%Y-%m-%d-%H-%M')
            self.target_file = 'catmaid-export-pid-{}-{}.json'.format(project.id, now)

        self.show_traceback = True
        self.format = 'json'
        self.indent = 2

        self.to_serialize = [] # type: List
        self.seen = {} # type: Dict

    def collect_data(self):
        self.to_serialize = []

        classes = dict(Class.objects.filter(
                project=self.project).values_list('class_name', 'id'))
        relations = dict(Relation.objects.filter(
                project=self.project).values_list('relation_name', 'id'))

        if not check_tracing_setup(self.project.id, classes, relations):
            raise CommandError("Project with ID %s is no tracing project." % self.project.id)

        exclude_skeleton_id_constraints = set() # type: Set
        exclude_neuron_id_constraint = set() # type: Set
        exclude_annotation_map = dict() # type: Dict
        exclude_annotation_ids = list() # type: List
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

            logger.info("Found {} neurons with the following exclusion annotations: {}".format(
                    num_total_records, ", ".join(self.excluded_annotations)))

            exclude_skeleton_id_constraints = set(chain.from_iterable(
                    [n['skeleton_ids'] for n in neuron_info]))
            exclude_neuron_id_constraint = set(n['id'] for n in neuron_info)

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

            logger.info("Found {} neurons with the following annotations: {}".format(
                    num_total_records, ", ".join(self.required_annotations)))

            skeleton_id_constraints = list(chain.from_iterable([n['skeleton_ids'] for n in neuron_info])) # type: Optional[List]
            neuron_ids = [n['id'] for n in neuron_info]

            # Remove excluded skeletons if either a) exclusion_is_final is set
            # or b) the annotation target is *not* annotated with a required
            # annotation or one of its sub-annotations.
            if exclude_skeleton_id_constraints:
                if self.exclusion_is_final:
                    skeleton_id_constraints = [skid for skid in skeleton_id_constraints
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

            # Export connectors and connector links
            if self.export_connectors:
                connector_links = TreenodeConnector.objects.filter(
                        project=self.project, skeleton_id__in=skeleton_id_constraints).values_list('id', 'connector', 'treenode')

                # Add matching connectors
                connector_ids = set(c for _,c,_ in connector_links)
                self.to_serialize.append(Connector.objects.filter(
                        id__in=connector_ids))
                logger.info("Exporting %s connectors" % len(connector_ids))

                # Add matching connector links
                self.to_serialize.append(TreenodeConnector.objects.filter(
                        id__in=[l for l,_,_ in connector_links]))

            # Export annotations and annotation-neuron links. Include meta
            # annotations.
            if self.export_annotations and 'annotated_with' in relations:
                annotated_with = relations['annotated_with']
                all_annotations = set() # type: Set
                all_annotation_links = set() # type: Set
                working_set = [e for e in entities]

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
                    allowed_annotations = dict()

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
                        for  al in all_annotation_links:
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

                logger.info("Exporting {} annotations and {} annotation links: {}".format(
                        len(all_annotations), len(all_annotation_links),
                        ", ".join([a.name for a in all_annotations])))
                if self.annotation_annotations:
                    logger.info("Only annotations in hierarchy of the following "
                            "annotations are exported: {}".format(
                            ', '.join(self.annotation_annotations)))

            # Export tags
            if self.export_tags and 'labeled_as' in relations:
                tag_links = TreenodeClassInstance.objects.select_related('class_instance').filter(
                        project=self.project,
                        class_instance__class_column=classes['label'],
                        relation_id=relations['labeled_as'],
                        treenode__skeleton_id__in=skeleton_id_constraints)
                tags = [t.class_instance for t in tag_links]
                tag_names = sorted(set([t.name for t in tags]))

                self.to_serialize.append(tags)
                self.to_serialize.append(tag_links)

                logger.info("Exporting {n_tags} tags, part of {n_links} links: {tags}".format(
                    n_tags=len(tags), n_links=tag_links.count(), tags=', '.join(tag_names)))

            # TODO: Export reviews
        else:
            # Export treenodes
            if self.export_treenodes:
                treenodes = Treenode.objects.filter(project=self.project)
                if exclude_skeleton_id_constraints:
                    treenodes = treenodes.exclude(skeleton_id=exclude_skeleton_id_constraints)
                self.to_serialize.append(treenodes)

            # Export connectors and connector links
            if self.export_connectors:
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
        exported_tids = set() # type: Set
        if treenodes:
            treenode_skeleton_ids = set(t.skeleton_id for t in treenodes)
            n_skeletons = ClassInstance.objects.filter(
                    project=self.project,
                    id__in=treenode_skeleton_ids).count()
            neuron_links = ClassInstanceClassInstance.objects \
                    .filter(project=self.project, class_instance_a__in=treenode_skeleton_ids, \
                           relation=relations.get('model_of'))
            n_neuron_links = len(neuron_links)
            neurons = set([l.class_instance_b_id for l in neuron_links])

            exported_tids = set(treenodes.values_list('id', flat=True))
            logger.info("Exporting {} treenodes in {} skeletons and {} neurons".format(
                    len(exported_tids), n_skeletons, len(neurons)))

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
                if self.original_placeholder_context:
                    logger.info("Exporting %s placeholder nodes" % len(extra_tids))
                else:
                    logger.info("Exporting %s placeholder nodes with first new class instance ID %s" % (len(extra_tids), new_skeleton_id))

                placeholder_treenodes = Treenode.objects.prefetch_related(
                        'treenodeconnector_set').filter(id__in=extra_tids)
                # Placeholder nodes will be transformed into root nodes of new
                # skeletons.
                new_skeleton_cis = []
                new_neuron_cis = []
                new_model_of_links = []
                new_tc_links = []
                for pt in placeholder_treenodes:
                    pt.parent_id = None

                    if not self.original_placeholder_context:
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

                if placeholder_treenodes and not self.original_placeholder_context:
                    self.to_serialize.append(new_skeleton_cis)
                    self.to_serialize.append(new_neuron_cis)
                    self.to_serialize.append(new_model_of_links)
                    if new_tc_links:
                        self.to_serialize.append(new_tc_links)

                self.to_serialize.append(placeholder_treenodes)

                # Add additional skeletons and neuron-skeleton links
                if self.original_placeholder_context:
                    # Original skeletons
                    extra_skids = set(Treenode.objects.filter(id__in=extra_tids,
                            project=self.project).values_list('skeleton_id', flat=True))
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
        parser.add_argument('--connectors', dest='export_connectors',
                type=str2bool, nargs='?', const=True, default=True,
                help='Export connectors from source')
        parser.add_argument('--annotations', dest='export_annotations',
                type=str2bool, nargs='?', const=True, default=True,
                help='Export annotations from source')
        parser.add_argument('--tags', dest='export_tags',
                type=str2bool, nargs='?', const=True, default=True,
                help='Export tags from source')
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
        parser.add_argument('--connector-placeholders', dest='connector_placeholders',
            action='store_true', help='Should placeholder nodes be exported')
        parser.add_argument('--original-placeholder-context', dest='original_placeholder_context',
            action='store_true', default=False, help='Whether or not exported placeholder nodes refer to their original skeltons and neurons')
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
        # Give some information about the export
        will_export = []
        wont_export = []
        for t in ('treenodes', 'connectors', 'annotations', 'tags'):
            if options['export_' + t]:
                will_export.append(t)
            else:
                wont_export.append(t)

        if will_export:
            logger.info("Will export: " + ", ".join(will_export))
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
