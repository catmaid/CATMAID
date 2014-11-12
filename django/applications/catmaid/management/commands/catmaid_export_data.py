from itertools import chain
from optparse import make_option
from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from catmaid.control.tracing import check_tracing_setup
from catmaid.control.annotationadmin import copy_annotations
from catmaid.control.neuron_annotations import create_basic_annotated_entity_query
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

        if self.required_annotations:
            # Get mapping from annotations to IDs
            a_to_id = dict(ClassInstance.objects.filter(
                    project=self.project, class_column=classes['annotation'],
                    name__in=self.required_annotations).values_list('name', 'id'))

            # Find all annotated neurons
            params = {}
            for i,a in enumerate(self.required_annotations):
                try:
                    params['neuron_query_by_annotation[%s]' % i] = a_to_id[a]
                except KeyError:
                    # Ignore annorations that don't exist
                    print("Couldn't find annotation '%s'" % a)

            entities = create_basic_annotated_entity_query(
                    self.project.id, params, relations, classes, ['neuron'])

            # Get the corresponding skeleton IDs
            skeleton_links = ClassInstanceClassInstance.objects.filter(
                    project_id=self.project.id, relation=relations['model_of'],
                    class_instance_a__class_column=classes['skeleton'],
                    class_instance_b__in=entities)
            skeleton_id_constraints = set(skeleton_links.values_list(
                    'class_instance_a', flat=True))

        # Export classes and relations
        self.to_serialize.append(Class.objects.filter(project=self.project))
        self.to_serialize.append(Relation.objects.filter(project=self.project))

        # Export skeleton-neuron links
        self.to_serialize.append(entities)
        self.to_serialize.append(skeleton_links)

        if skeleton_id_constraints:
            # Export treenodes
            if self.export_treenodes:
                treenodes = Treenode.objects.filter(
                        project=self.project,
                        skeleton_id__in=skeleton_id_constraints)
                self.to_serialize.append(treenodes)

            # Export connectors and connector links
            if self.export_connectors:
                connector_links = TreenodeConnector.objects.filter(
                        project=self.project, skeleton_id__in=skeleton_id_constraints).values_list('id', 'connector', 'treenode')

                # Add matching connecots
                self.to_serialize.append(Connector.objects.filter(
                        id__in=[c for _,c,_ in connector_links]))

                # Add matching connector links
                self.to_serialize.append(TreenodeConnector.objects.filter(
                        id__in=[l for l,_,_ in connector_links]))

                # Add addition placeholde treenodes
                present_tids = set(treenodes.values_list('id', flat=True))
                connector_tids = set(t for _,_,t in connector_links)
                extra_tids = connector_tids - present_tids
                self.to_serialize.append(Treenode.objects.filter(id__in=extra_tids))

            # Export annotations and annotation-neurin links
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

            # Export annotations and annotation-neurin links
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
