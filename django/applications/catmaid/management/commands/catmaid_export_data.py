from catmaid.control.exporter import FileExporter, ConnectorMode
from catmaid.control.tracing import known_tags
from catmaid.models import Project
from catmaid.util import str2bool, str2list
from django.core.management.base import BaseCommand, CommandError
from .common import set_log_level


import logging
logger = logging.getLogger(__name__)


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
        parser.add_argument('--reviews', dest='export_reviews',
                type=str2bool, nargs='?', const=True, default=False,
                help='Export reviews from source')
        parser.add_argument('--volumes', dest='export_volumes',
                type=str2bool, nargs='?', const=True, default=False,
                help='Export volumes from source. More constraints can be ' +
                'provided using the --volume-annotation argument.')
        parser.add_argument('--public-deep-links', dest='export_public_deep_links',
                type=str2bool, nargs='?', const=True, default=False,
                help='Export all public deep links in the exported project')
        parser.add_argument('--exportable-deep-links', dest='export_exportable_deep_links',
                type=str2bool, nargs='?', const=True, default=False,
                help='Export all deep links in the exported project that are marked as exportable')
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
        for t in ('treenodes', 'annotations', 'tags', 'volumes', 'reviews'):
            if options['export_' + t]:
                will_export.append(t)
            else:
                wont_export.append(t)

        connector_mode = options['connector_mode']
        if connector_mode == ConnectorMode.IntraConnectorsOnly:
            will_export.append('connectors (only intra)')
        elif connector_mode == ConnectorMode.IntraConnectorsAndPlaceholders:
            will_export.append('connectors (intra + new placeholders)')
        elif connector_mode == ConnectorMode.IntraConnectorsAndOriginalPlaceholders:
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

        exporter = FileExporter(source, options)
        exporter.export()

        logger.info("Finished export, result written to: %s" % exporter.target_file)
