# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from itertools import chain
from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from catmaid.control.neuron_annotations import (get_annotated_entities,
        get_annotation_to_id_map)
from catmaid.control.tracing import check_tracing_setup
from catmaid.models import (Class, ClassInstance, ClassInstanceClassInstance,
        Relation, Connector, Project, Treenode, TreenodeClassInstance,
        TreenodeConnector, User)

from six.moves import input, map

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
        self.required_annotations = options['required_annotations']
        self.target_file = options.get('file', 'export_pid_{}.json').format(project.id)

        self.show_traceback = True
        self.format = 'json'
        self.indent = 2

        self.to_serialize = []
        self.seen = {}

    def collect_data(self):
        self.to_serialize = []

        classes = dict(Class.objects.filter(
                project=self.project).values_list('class_name', 'id'))
        relations = dict(Relation.objects.filter(
                project=self.project).values_list('relation_name', 'id'))

        if not check_tracing_setup(self.project.id, classes, relations):
            raise CommandError("Project with ID %s is no tracing project." % self.project.id)

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
            neuron_info, num_total_records = get_annotated_entities(self.project,
                    query_params, relations, classes, ['neuron'], with_skeletons=True)

            logger.info("Found {} neurons with the following annotations: {}".format(
                    num_total_records, ", ".join(self.required_annotations)))

            skeleton_id_constraints = list(chain.from_iterable([n['skeleton_ids'] for n in neuron_info]))

            neuron_ids = [n['id'] for n in neuron_info]
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

        if skeleton_id_constraints:
            # Export treenodes
            if self.export_treenodes:
                treenodes = Treenode.objects.filter(
                        project=self.project,
                        skeleton_id__in=skeleton_id_constraints)
                self.to_serialize.append(treenodes)

                exported_tids = set(treenodes.values_list('id', flat=True))
                logger.info("Exporting %s treenodes" % len(exported_tids))

            # Export connectors and connector links
            if self.export_connectors:
                connector_links = TreenodeConnector.objects.filter(
                        project=self.project, skeleton_id__in=skeleton_id_constraints).values_list('id', 'connector', 'treenode')

                # Add matching connecots
                connector_ids = set(c for _,c,_ in connector_links)
                self.to_serialize.append(Connector.objects.filter(
                        id__in=connector_ids))
                logger.info("Exporting %s connectors" % len(connector_ids))

                # Add matching connector links
                self.to_serialize.append(TreenodeConnector.objects.filter(
                        id__in=[l for l,_,_ in connector_links]))

                # Add addition placeholde treenodes
                connector_tids = set(TreenodeConnector.objects \
                    .filter(project=self.project, connector__in=connector_ids) \
                    .exclude(skeleton_id__in=skeleton_id_constraints) \
                    .values_list('treenode', flat=True))
                extra_tids = connector_tids - exported_tids
                logger.info("Exporting %s placeholder nodes" % len(extra_tids))
                self.to_serialize.append(Treenode.objects.filter(id__in=extra_tids))

                # Add additional skeletons and neuron-skeleton links
                extra_skids = set(Treenode.objects.filter(id__in=extra_tids,
                        project=self.project).values_list('skeleton_id', flat=True))
                self.to_serialize.append(ClassInstance.objects.filter(id__in=extra_skids))

                extra_links = ClassInstanceClassInstance.objects \
                        .filter(project=self.project,
                                class_instance_a__in=extra_skids,
                                relation=relations['model_of'])
                self.to_serialize.append(extra_links)

                extra_nids = extra_links.values_list('class_instance_b', flat=True)
                self.to_serialize.append(ClassInstance.objects.filter(
                    project=self.project, id__in=extra_nids))

            # Export annotations and annotation-neuron links. Include meta
            # annotations.
            if self.export_annotations and 'annotated_with' in relations:
                annotated_with = relations['annotated_with']
                all_annotations = set()
                all_annotation_links = set()
                working_set = [e for e in entities]
                while working_set:
                    annotation_links = ClassInstanceClassInstance.objects.filter(
                            project_id=self.project.id, relation=annotated_with,
                            class_instance_a__in=working_set)
                    annotations = ClassInstance.objects.filter(project_id=self.project.id,
                            cici_via_b__in=annotation_links)

                    # Reset working set to add next entries
                    working_set = []

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

            # Export tags
            if self.export_tags and 'labeled_as' in relations:
                tag_links = TreenodeClassInstance.objects.select_related('class_instance').filter(
                        project=self.project,
                        class_instance__class_column=classes['label'],
                        relation_id=relations['labeled_as'],
                        treenode__skeleton_id__in=skeleton_id_constraints)
                tags = [t.class_instance for t in tag_links]
                tag_names = [t.name for t in tags]

                self.to_serialize.append(tags)
                self.to_serialize.append(tag_links)

                logger.info("Exporting {n_tags} tags, part of {n_links} links: {tags}".format(
                    n_tags=len(tags), n_links=tag_links.count(), tags=', '.join(tag_names)))

            # TODO: Export reviews
        else:
            # Export treenodes
            if self.export_treenodes:
                if skeleton_id_constraints:
                    pass
                else:
                    self.to_serialize.append(Treenode.objects.filter(
                            project=self.project))

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

                self.to_serialize.append(tags)
                self.to_serialize.append(tag_links)

            # TODO: Export reviews

        # Export users
        if self.export_users:
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
            users = User.objects.filter(pk__in=seen_user_ids)
            logger.info("Exporting {} users: {}".format(len(users),
                    ", ".join([u.username for u in users])))
            self.to_serialize.append(users)


    def export(self):
        """ Writes all objects matching
        """
        try:
            self.collect_data()

            data = list(chain(*self.to_serialize))

            CurrentSerializer = serializers.get_serializer(self.format)
            serializer = CurrentSerializer()
            with open(self.target_file, "w") as out:
                serializer.serialize(data, indent=self.indent, stream=out,
                        use_natural_foreign_keys=True, use_natural_primary_keys=True)
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
        parser.add_argument('--treenodes', dest='export_treenodes', default=True,
            action='store_true', help='Export treenodes from source')
        parser.add_argument('--notreenodes', dest='export_treenodes',
            action='store_false', help='Don\'t export treenodes from source')
        parser.add_argument('--connectors', dest='export_connectors', default=True,
            action='store_true', help='Export connectors from source')
        parser.add_argument('--noconnectors', dest='export_connectors',
            action='store_false', help='Don\'t export connectors from source')
        parser.add_argument('--annotations', dest='export_annotations', default=True,
            action='store_true', help='Export annotations from source')
        parser.add_argument('--noannotations', dest='export_annotations',
            action='store_false', help='Don\'t export annotations from source')
        parser.add_argument('--tags', dest='export_tags', default=True,
            action='store_true', help='Export tags from source')
        parser.add_argument('--notags', dest='export_tags',
            action='store_false', help='Don\'t export tags from source')
        parser.add_argument('--users', dest='export_users', default=False,
            action='store_true', help='Export users from source')
        parser.add_argument('--nousers', dest='export_users',
            action='store_false', help='Don\'t export users from source')
        parser.add_argument('--required-annotation', dest='required_annotations',
            action='append', help='Name a required annotation for exported ' +
            'skeletons. Meta-annotations can be used as well.')
        parser.add_argument('--connector-placeholders', dest='connector_placeholders',
            action='store_true', help='Should placeholder nodes be exported')

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

        # Read soure and target
        if not options['source']:
            source = self.ask_for_project('source')
        else:
            source = Project.objects.get(pk=options['source'])

        # Process with export
        if (options['required_annotations']):
            logger.info("Needed annotations for exported skeletons: " +
                  ", ".join(options['required_annotations']))

        exporter = Exporter(source, options)
        exporter.export()

        logger.info("Finished export, result written to: %s" % exporter.target_file)
