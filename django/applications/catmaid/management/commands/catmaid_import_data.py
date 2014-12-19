from optparse import make_option
from django.core import serializers
from django.core.management.base import NoArgsCommand, CommandError
from django.db import connection, transaction
from catmaid.control.annotationadmin import copy_annotations
from catmaid.models import Project, User

class FileImporter:
    def __init__(self, source, target, user, options):
        self.source = source
        self.target = target
        self.options = options
        self.user = user

        self.format = 'json'

    @transaction.atomic
    def import_data(self):
        """ Imports data from a file and overrides irs properties, if wanted.
        This method also deactivates auto commit (if it is activated)
        temporary.
        """
        cursor = connection.cursor()
        # Defer all constraint checks
        cursor.execute('SET CONSTRAINTS ALL DEFERRED')
        # Read the file and import data
        with open(self.source, "r") as data:
            for deserialized_object in serializers.deserialize(self.format, data):
                # Override project to match target project
                if hasattr(deserialized_object.object, 'project'):
                    deserialized_object.object.project = self.target
                # Override user
                if self.user:
                    if hasattr(deserialized_object.object, 'user_id'):
                        deserialized_object.object.user = self.user
                    if hasattr(deserialized_object.object, 'reviewer_id'):
                        deserialized_object.object.reviewer = self.user
                    if hasattr(deserialized_object.object, 'editor_id'):
                        deserialized_object.object.editor = self.user

                deserialized_object.save()

        # Reset counters to current maximum IDs
        cursor.execute('''
            SELECT setval('concept_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
            FROM concept;
            SELECT setval('location_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
            FROM location;
        ''')


class InternalImporter:
    def __init__(self, source, target, user, options):
        self.source = source
        self.target = target
        self.options = options

    def import_data(self):
        # Process with import
        o = self.options
        copy_annotations(self.source.id, self.target.id,
                o['import_treenodes'], o['import_connectors'],
                o['import_annotations'], o['import_tags'])

class Command(NoArgsCommand):
    help = "Import new or existing data into an existing CATMAID project"
    option_list = NoArgsCommand.option_list + (
        make_option('--source', dest='source', default=None,
            help='The ID of the source project'),
        make_option('--target', dest='target', default=None,
            help='The ID of the target project'),
        make_option('--user', dest='user', default=None,
            help='The ID of the owner of all created objects'),
        make_option('--treenodes', dest='import_treenodes', default=True,
            action='store_true', help='Import treenodes from source'),
        make_option('--notreenodes', dest='import_treenodes',
            action='store_false', help='Don\'t import treenodes from source'),
        make_option('--connectors', dest='import_connectors', default=True,
            action='store_true', help='Import connectors from source'),
        make_option('--noconnectors', dest='import_connectors',
            action='store_false', help='Don\'t import connectors from source'),
        make_option('--annotations', dest='import_annotations', default=True,
            action='store_true', help='Import annotations from source'),
        make_option('--noannotations', dest='import_annotations',
            action='store_false', help='Don\'t import annotations from source'),
        make_option('--tags', dest='import_tags', default=True,
            action='store_true', help='Import tags from source'),
        make_option('--notags', dest='import_tags',
            action='store_false', help='Don\'t import tags from source'),
        )

    def ask_for_project(self, title):
        """ Return a valid project object.
        """
        def ask():
            print("Please enter the number of the desired %s project:" % title)
            projects = Project.objects.all()
            for n,p in enumerate(projects):
                print("%s: %s (ID %s)" % (n, p, p.id))
            selection = raw_input("Selection: ")
            try:
                return projects[int(selection)]
            except ValueError, IndexError:
                return None

        while True:
            p = ask()
            if p:
                return p

    def ask_for_user(self):
        """ Return a valid user object.
        """
        def ask():
            print("Please enter the number of the user wanted:")
            users = User.objects.all()
            for n,u in enumerate(users):
                print("%s: %s (ID %s)" % (n, u, u.id))
            selection = raw_input("Selection: ")
            try:
                return users[int(selection)]
            except ValueError, IndexError:
                return None

        while True:
            u = ask()
            if u:
                return u

    def handle_noargs(self, **options):
        # Give some information about the import
        will_import = []
        wont_import = []
        for t in ('treenodes', 'connectors', 'annotations', 'tags'):
            if options['import_' + t]:
                will_import.append(t)
            else:
                wont_import.append(t)

        if will_import:
            print("Will import: " + ", ".join(will_import))
        else:
            print("Nothing selected for import")
            return

        if wont_import:
            print("Won't import: " + ", ".join(wont_import))

        # Read soure and target
        if options['source']:
            try:
                source = Project.objects.get(pk=int(options['source']))
                print("Using internal importer")
                Importer = InternalImporter
            except ValueError:
                source = options['source']
                print("Using file importer")
                Importer = FileImporter
        else:
            source = self.ask_for_project('source')

        if not options['target']:
            target = self.ask_for_project('target')
        else:
            target = Project.objects.get(pk=options['target'])

        if not options['user']:
            user = self.ask_for_user()
        else:
            user = User.objects.get(pk=options['user'])

        importer = Importer(source, target, user, options)
        importer.import_data()

        print("Finished import into project with ID %s" % importer.target.id)
