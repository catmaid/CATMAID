import argparse
import inspect
import logging
import progressbar
from typing import Type

from catmaid.control.importer import AbstractImporter, InternalImporter, FileImporter
from catmaid.models import Project, User
from catmaid.util import str2bool
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from .common import set_log_level


logger = logging.getLogger(__name__)


def ask_a_b(a, b, title):
    """Return true if a, False if b.
    """
    def ask():
        selection = input(title + " ").strip()
        if selection == a:
            return True
        if selection == b:
            return False
        return None

    while True:
        d = ask()
        if d is not None:
            return d
        print(f"Please answer only '{a}' or '{b}'")

def ask_yes_no(title):
    """Return true if yes, False if no.
    """
    return ask_a_b('y', 'n', title)

def ask_for_user(title):
    """ Return a valid user object.
    """
    def ask():
        print("User selection:")
        users = User.objects.all()
        for n,u in enumerate(users):
            print("%s: %s (ID %s)" % (n, u, u.id))
        print(title)
        selection = input("Please enter the number of the user wanted: ")
        try:
            return users[int(selection)]
        except (ValueError, IndexError):
            return None

    while True:
        u = ask()
        if u:
            return u


def str2tuple(s):
    """Convert a string of the form a=b into a tuple (a,b).
    """
    parts = s.split('=')
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("Argument \"%s\" is not of form import-username=target-username" % (s))
    return (parts[0].strip(), parts[1].strip())


class Command(BaseCommand):
    help = "Import new or existing data into an existing CATMAID project"

    def add_arguments(self, parser):
        parser.add_argument('--source', dest='source', default=None,
                help='The ID of the source project or the path to a file to import')
        parser.add_argument('--target', dest='target', default=None,
                help='The ID of the target project')
        parser.add_argument('--user', dest='user', default=None,
                help='The ID of the owner of all created objects')
        parser.add_argument('--treenodes', dest='import_treenodes',
                type=str2bool, nargs='?', const=True, default=True,
                help='Import treenodes from source')
        parser.add_argument('--connectors', dest='import_connectors',
                type=str2bool, nargs='?', const=True, default=True,
                help='Import connectors from source')
        parser.add_argument('--annotations', dest='import_annotations',
                type=str2bool, nargs='?', const=True, default=True,
                help='Import annotations from source')
        parser.add_argument('--tags', dest='import_tags',
                type=str2bool, nargs='?', const=True, default=True,
                help='Import tags from source')
        parser.add_argument('--volumes', dest='import_volumes',
                type=str2bool, nargs='?', const=True, default=True,
                help='Import volumes from source')
        parser.add_argument('--map-users', dest='map_users', default=True,
                const=True, type=lambda x: (str(x).lower() == 'true'), nargs='?',
                help='Use existing user if username matches')
        parser.add_argument('--map-user-ids', dest='map_user_ids', default=False,
                const=True, type=lambda x: (str(x).lower() == 'true'), nargs='?',
                help='Use existing user if user ID matches as a last option before new users would be created')
        parser.add_argument('--username-mapping',  dest='username_mapping', default=[],
                type=str2tuple, action='append',
                help='Map an import username to a target instance username. Maps referenced users regardless of --map-users. The expected format is "import-user=existing-user", e.g. --username-mapping="AnonymousUser=AnonymousUser".')
        parser.add_argument('--create-unknown-users', dest='create_unknown_users', default=True,
                action='store_true', help='Create new inactive users for unmapped or unknown users referenced in inport data.')
        parser.add_argument('--auto-name-unknown-users', dest='auto_name_unknown_users', default=False,
                action='store_true', help='If enabled, newly created unknown users will be named "User <n>" where <n> is an increasing number. Requires --create-unknown-users')
        parser.add_argument('--preserve-ids', dest='preserve_ids', default=False,
                action='store_true', help='Use IDs provided in import data. Warning: this can cause changes in existing data.')
        parser.add_argument('--no-analyze', dest='analyze_db', default=True,
                action='store_false', help='If ANALYZE to update database statistics should not be called after the import.')
        parser.add_argument('--update-project-materializations', dest='update_project_materializations', default=False,
                action='store_true', help='Whether all materializations (edges, summary) of the current project should be updated or only the ones of imported skeletons.')
        parser.add_argument('--update-instance-materializations', dest='update_instance_materializations', default=False,
                action='store_true', help='Whether all materializations (edges, summary) of this CATMAID instance should be updated. This is faster when a majority of the data changed.')

    def ask_for_project(self, title):
        """ Return a valid project object.
        """
        def ask():
            print("Please enter 'n' or the number of the desired %s project:" % title)
            print("n: Create new project")
            projects = Project.objects.all()
            for n,p in enumerate(projects):
                print("%s: %s (ID %s)" % (n, p, p.id))
            selection = input("Selection: ").strip()
            try:
                if selection == 'n':
                    new_project_name = input("Name of new project: ").strip()
                    return Project.objects.create(title=new_project_name)
                return projects[int(selection)]
            except (ValueError, IndexError):
                return None

        while True:
            p = ask()
            if p:
                return p

    def handle(self, *args, **options):
        set_log_level(logger, options.get('verbosity', 1))
        if options['map_users'] and options['user']:
            raise CommandError("Can't override users and map users at the " +
                    "same time, use --user or --map-users.")

        if options.get('update_project_materializations') and \
                options.get('update_instance_materializations'):
            raise CommandError("Use project OR instance materialiation")

        # Give some information about the import
        will_import = []
        wont_import = []
        for t in ('treenodes', 'connectors', 'annotations', 'tags'):
            if options.get('import_' + t):
                will_import.append(t)
            else:
                wont_import.append(t)

        if will_import:
            logger.info("Will import: " + ", ".join(will_import))
        else:
            logger.info("Nothing selected for import")
            return

        if wont_import:
            logger.info("Won't import: " + ", ".join(wont_import))

        # Read soure and target
        if options['source']:
            try:
                source = Project.objects.get(pk=int(options['source']))
                logger.info("Using internal importer")
                Importer: Type[AbstractImporter] = InternalImporter
            except ValueError:
                source = options['source']
                logger.info("Using file importer")
                Importer = FileImporter
        else:
            source = self.ask_for_project('source')

        if not options['target']:
            target = self.ask_for_project('target')
        else:
            target = Project.objects.get(pk=options['target'])

        override_user = None
        if options['user']:
            override_user = User.objects.get(pk=options['user'])
            logger.info(f'All imported objects will be owned by user "{override_user.username}"')
        else:
            if options['map_users']:
                logger.info("Users referenced in import will be mapped to "
                        "existing users if the username matches")
            if options['map_user_ids']:
                logger.info("Users referenced only as ID in import will be "
                        "mapped to existing users with matching IDs.")
            if options['create_unknown_users']:
                logger.info("Unknown users will be created")

            if not options['map_users'] and not options['create_unknown_users'] \
                    and not options['map_user_ids']:
                override_user = ask_for_user("All imported objects need a user "
                        "and no mapping or creation option was provided. Please "
                        "select a user that should take ownership of all "
                        "imported objects. Alternatively, use the --map-users "
                        "option to map imported users to existing users based "
                        "on their username.")

        importer = Importer(source, target, override_user, options)
        importer.import_data()

        if options['analyze_db']:
            cursor = connection.cursor()
            logger.info("Updating database statistics")
            cursor.execute("ANALYZE")

        logger.info("Finished import into project with ID %s" % importer.target.id)
