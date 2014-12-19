from itertools import chain
from optparse import make_option
from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from catmaid.control.tracing import check_tracing_setup
from catmaid.models import Class, ClassInstance, ClassInstanceClassInstance, \
         Relation, Connector, Project, Treenode, TreenodeConnector

class Exporter():
    def __init__(self, project, options):
        self.project = project
        self.options = options
        self.export_treenodes = options['export_treenodes']
        self.export_connectors = options['export_connectors']
        self.export_annotations = options['export_annotations']
        self.export_tags = options['export_tags']
        self.required_annotations = options['required_annotations']
        self.target_file = 'export_pid_%s.json' % project.id

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
            raise ValueError("Project with ID %s is no tracing project." % self.project.id)

        skeleton_id_constraints = None
        entities = ClassInstance.objects.filter(project=self.project,
                class_column__in=[classes['neuron']])
        skeleton_links = ClassInstanceClassInstance.objects.filter(
                project_id=self.project.id, relation=relations['model_of'],
                class_instance_a__class_column=classes['skeleton'])
        skeletons = ClassInstance.objects.filter(project=self.project,
                class_column__in=[classes['skeleton']])

        if self.required_annotations:
            # Get mapping from annotations to IDs
            a_to_id = dict(ClassInstance.objects.filter(
                    project=self.project, class_column=classes['annotation'],
                    name__in=self.required_annotations).values_list('name', 'id'))
            print("Found entities with the following annotations: %s" % \
                  ", ".join(a_to_id.keys()))

            entities = ClassInstance.objects.filter(project=self.project,
                class_column=classes['neuron'],
                cici_via_a__relation_id=relations['annotated_with'],
                cici_via_a__class_instance_b_id__in=a_to_id.values())

            # Get the corresponding skeleton IDs
            skeleton_links = ClassInstanceClassInstance.objects.filter(
                    project_id=self.project.id, relation=relations['model_of'],
                    class_instance_a__class_column=classes['skeleton'],
                    class_instance_b__in=entities)
            skeleton_id_constraints = set(skeleton_links.values_list(
                    'class_instance_a', flat=True))
            skeletons = ClassInstance.objects.filter(project=self.project,
                    id__in=skeleton_id_constraints)

        print("Will export %s entities" % entities.count())

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
                print("Exporting %s treenodes" % len(exported_tids))

            # Export connectors and connector links
            if self.export_connectors:
                connector_links = TreenodeConnector.objects.filter(
                        project=self.project, skeleton_id__in=skeleton_id_constraints).values_list('id', 'connector', 'treenode')

                # Add matching connecots
                connector_ids = set(c for _,c,_ in connector_links)
                self.to_serialize.append(Connector.objects.filter(
                        id__in=connector_ids))
                print("Exporting %s connectors" % len(connector_ids))

                # Add matching connector links
                self.to_serialize.append(TreenodeConnector.objects.filter(
                        id__in=[l for l,_,_ in connector_links]))

                # Add addition placeholde treenodes
                connector_tids = set(TreenodeConnector.objects \
                    .filter(project=self.project, connector__in=connector_ids) \
                    .exclude(skeleton_id__in=skeleton_id_constraints) \
                    .values_list('treenode', flat=True))
                extra_tids = connector_tids - exported_tids
                print("Exporting %s placeholder nodes" % len(extra_tids))
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

            # Export annotations and annotation-neuron links, liked to selected
            # entities.
            if self.export_annotations and 'annotated_with' in relations:
                annotation_links = ClassInstanceClassInstance.objects.filter(
                    project_id=self.project.id, relation=relations['annotated_with'],
                    class_instance_a__in=entities)
                annotations = ClassInstance.objects.filter(project_id=self.project.id,
                                                           cici_via_b__in=annotation_links)
                self.to_serialize.append(annotations)
                self.to_serialize.append(annotation_links)

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

            # Export annotations and annotation-neuron links
            if self.export_annotations and 'annotated_with' in relations:
                annotation_links = ClassInstanceClassInstance.objects.filter(
                    project_id=self.project.id, relation=relations['annotated_with'],
                    class_instance_a__in=entities)
                annotations = ClassInstance.objects.filter(project_id=self.project.id,
                                                           cici_via_b__in=annotation_links)
                self.to_serialize.append(annotations)
                self.to_serialize.append(annotation_links)

            # TODO: Export reviews

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
        except Exception, e:
            if self.show_traceback:
                raise
            raise CommandError("Unable to serialize database: %s" % e)

class Command(BaseCommand):
    """ Call e.g. like
        ./manage.py catmaid_export_data --source 1 --required-annotation "Kenyon cells"
    """
    help = "Export CATMAID data into a JSON representation"
    option_list = BaseCommand.option_list + (
        make_option('--source', dest='source', default=None,
            help='The ID of the source project'),
        make_option('--treenodes', dest='export_treenodes', default=True,
            action='store_true', help='Export treenodes from source'),
        make_option('--notreenodes', dest='export_treenodes',
            action='store_false', help='Don\'t export treenodes from source'),
        make_option('--connectors', dest='export_connectors', default=True,
            action='store_true', help='Export connectors from source'),
        make_option('--noconnectors', dest='export_connectors',
            action='store_false', help='Don\'t export connectors from source'),
        make_option('--annotations', dest='export_annotations', default=True,
            action='store_true', help='Export annotations from source'),
        make_option('--noannotations', dest='export_annotations',
            action='store_false', help='Don\'t export annotations from source'),
        make_option('--tags', dest='export_tags', default=True,
            action='store_true', help='Export tags from source'),
        make_option('--notags', dest='export_tags',
            action='store_false', help='Don\'t export tags from source'),
        make_option('--required-annotation', dest='required_annotations',
            action='append', help='Name a required annotation for exported skeletons.'),
        make_option('--connector-placeholders', dest='connector_placeholders',
            action='store_true', help='Should placeholder nodes be exported'),
        )

    def ask_for_project(self, title):
        """ Return a valid project object.
        """
        def ask():
            print("Please enter the number for the %s project:" % title)
            projects = Project.objects.all()
            for n,p in enumerate(projects):
                print("%s: %s" % (n, p))
            selection = raw_input("Selection: ")
            try:
                return projects[int(selection)]
            except ValueError, IndexError:
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
            print("Will export: " + ", ".join(will_export))
        else:
            print("Nothing selected for export")
            return

        if wont_export:
            print("Won't export: " + ", ".join(wont_export))

        # Read soure and target
        if not options['source']:
            source = self.ask_for_project('source')
        else:
            source = Project.objects.get(pk=options['source'])

        # Process with export
        if (options['required_annotations']):
            print("Needed annotations for exported skeletons: " +
                  ", ".join(options['required_annotations']))

        exporter = Exporter(source, options)
        exporter.export()

        print("Finished export, result written to: %s" % exporter.target_file)
