# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import inspect
import six
import catmaid.models

from collections import defaultdict
from django.apps import apps
from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from catmaid.control.annotationadmin import copy_annotations
from catmaid.models import Project, User

import logging
logger = logging.getLogger(__name__)


def ask_yes_no(title):
    """Return true if yes, False if no.
    """
    def ask():
        selection = raw_input(title + " ").strip()
        if selection == 'n':
            return False
        if selection == 'y':
            return True
        return None

    while True:
        d = ask()
        if d is not None:
            return d
        print("Please answer only 'y' or 'n'")

def ask_for_user(title):
    """ Return a valid user object.
    """
    def ask():
        print("User selection:")
        users = User.objects.all()
        for n,u in enumerate(users):
            print("%s: %s (ID %s)" % (n, u, u.id))
        print(title)
        selection = raw_input("Please enter the number of the user wanted: ")
        try:
            return users[int(selection)]
        except (ValueError, IndexError):
            return None

    while True:
        u = ask()
        if u:
            return u

class FileImporter:
    def __init__(self, source, target, user, options):
        self.source = source
        self.target = target
        self.options = options
        self.user = user
        self.create_unknown_users = options['create_unknown_users']

        self.format = 'json'

    @transaction.atomic
    def import_data(self):
        """ Imports data from a file and overrides its properties, if wanted.
        This method also deactivates auto commit (if it is activated)
        temporary.
        """
        cursor = connection.cursor()
        # Defer all constraint checks
        cursor.execute('SET CONSTRAINTS ALL DEFERRED')

        # Get all existing users so that we can map them basedon their username.
        map_users = self.options['map_users']
        mapped_user_ids = set()
        mapped_user_target_ids = set()
        user_map = dict(User.objects.all().values_list('username', 'id'))
        user_id_map = dict((v,k) for k,v in six.iteritems(user_map))

        # Map data types to lists of object of the respective type
        import_data = defaultdict(list)
        n_objects = 0

        # Read the file and sort by type
        logger.info("Loading data from {}".format(self.source))
        with open(self.source, "r") as data:
            for deserialized_object in serializers.deserialize(self.format, data):
                obj = deserialized_object.object
                import_data[type(obj)].append(deserialized_object)
                n_objects += 1

        if n_objects == 0:
            raise CommandError("Nothing to import, no importable data found")

        created_users = dict()
        if import_data.get(User):
            import_users = dict((u.object.username, u) for u in import_data.get(User))
        else:
            import_users = dict()

        # Get CATMAID model classes, which are the ones we want to allow
        # optional modification of user, project and ID fields.
        app = apps.get_app_config('catmaid')
        user_updatable_classes = set(app.get_models())

        logger.info("Storing {} database objects".format(n_objects))
        need_separate_import = []
        for object_type, import_objects in six.iteritems(import_data):
            # Allow user reference updates in CATMAID objects
            if object_type not in user_updatable_classes:
                need_separate_import.append(object_type)
                continue

            # CATMAID model objects are inspected for user fields
            for deserialized_object in import_objects:
                # Override project to match target project
                if hasattr(deserialized_object.object, 'project'):
                    deserialized_object.object.project = self.target

                # Override all user references with pre-defined user
                if self.user:
                    if hasattr(deserialized_object.object, 'user_id'):
                        deserialized_object.object.user = self.user
                    if hasattr(deserialized_object.object, 'reviewer_id'):
                        deserialized_object.object.reviewer = self.user
                    if hasattr(deserialized_object.object, 'editor_id'):
                        deserialized_object.object.editor = self.user

                # Map users based on username, optionally create unmapped users.
                if map_users:
                    # Try to look at every user reference field in CATMAID.
                    for ref in ('user', 'reviewer', 'editor'):
                        obj = deserialized_object.object
                        obj_username = None
                        # If the import object has a the field without _id
                        # suffix, the user reference was already resolved by
                        # Django.
                        if hasattr(obj, ref):
                            user = getattr(obj, ref)
                            obj_username = user.username

                        id_ref = ref + "_id"
                        if hasattr(obj, id_ref):
                            obj_user_ref_id = getattr(obj, id_ref)

                            # If no username has been found yet, no model object
                            # has been attached by Django. Read the plain user
                            # ID reference as username. The corresponding
                            # exporter is expected to use Django's natural keys
                            # for user references.
                            if not obj_username:
                                obj_username = objgetattr(obj, ref)

                            # Map users if usernames match
                            existing_user_id = user_map.get(obj_username)
                            if existing_user_id:
                                setattr(obj, ref + "_id", existing_user_id)
                                mapped_user_ids.add(obj_user_ref_id)
                                mapped_user_target_ids.add(existing_user_id)
                            elif self.create_unknown_users:
                                user = created_users.get(obj_username)
                                if not user:
                                    logger.info("Created new inactive user (couldn't map): " + obj_username)
                                    user = User.objects.create(username=obj_username)
                                    user.is_active = False
                                    user.save()
                                    created_users[obj_username] = user
                                obj.user = user
                            else:
                                raise CommandError("User {} is not found in "
                                        "existing data. Please use --user or "
                                        "--create-unknown-users".format(obj_username))
                else:
                    # If no mapping is done and users are available to be
                    # imported, try to find user in import data.
                    for ref in ('user_id', 'reviewer_id', 'editor_id'):
                        if hasattr(obj, ref):
                            # Map users if usernames match
                            obj_username = getattr(obj, ref)
                            user = import_data.get(obj_username)
                            if user:
                                obj.user = user
                            elif self.create_unknown_users:
                                user = created_users.get(obj_username)
                                if not user:
                                    logger.info("Created new inactive user (otherwise unavailable): " + obj_username)
                                    user = User.objects.create(username=obj_username)
                                    user.is_active = False
                                    user.save()
                                    created_users[obj_username] = user
                                obj.user = user
                            else:
                                raise CommandError("Could not find user "
                                        "\"{}\" and was not asked to creat unknown "
                                        "users (--create-unknown-users)".format(obj_username))

                # Finally save object
                deserialized_object.save()

        for other_model in need_separate_import:
            other_objects = import_data[other_model]
            if other_model == User:
                # If user model objects are imported and users were mapped, ask
                # user if alrady mapped users should be skipped during import.
                # We don't need to take of newly created users, because they are
                # only created if no model is found. Therefore all other model
                # objects can be imported.
                if mapped_user_target_ids:
                    mapped_usernames = set(user_id_map.get(u) for u in mapped_user_target_ids)
                    import_usernames = set(import_users.keys())
                    not_imported_usernames = import_usernames - mapped_usernames
                    already_imported_usernames  = import_usernames - not_imported_usernames

                    if already_imported_usernames:
                        print("The following usernames are mapped to " +
                                "existing users, but the import data " +
                                "also contains objects for these users: " +
                                ", ".join(already_imported_usernames))
                        ignore_users = ask_yes_no("Skip those users in input "
                                "data and don't import them? [y/n]")
                        if ignore_users:
                            logger.info("Won't import already mapped users: " +
                                    ", ".join(already_imported_usernames))
                            other_objects = [u for u in other_objects \
                                    if u.object.username not in already_imported_usernames]
                        else:
                            logger.info("Will import all listed users in import data")

            for deserialized_object in other_objects:
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

class Command(BaseCommand):
    help = "Import new or existing data into an existing CATMAID project"

    def add_arguments(self, parser):
        parser.add_argument('--source', dest='source', default=None,
            help='The ID of the source project')
        parser.add_argument('--target', dest='target', default=None,
            help='The ID of the target project')
        parser.add_argument('--user', dest='user', default=None,
            help='The ID of the owner of all created objects')
        parser.add_argument('--treenodes', dest='import_treenodes', default=True,
            action='store_true', help='Import treenodes from source')
        parser.add_argument('--notreenodes', dest='import_treenodes',
            action='store_false', help='Don\'t import treenodes from source')
        parser.add_argument('--connectors', dest='import_connectors', default=True,
            action='store_true', help='Import connectors from source')
        parser.add_argument('--noconnectors', dest='import_connectors',
            action='store_false', help='Don\'t import connectors from source')
        parser.add_argument('--annotations', dest='import_annotations', default=True,
            action='store_true', help='Import annotations from source')
        parser.add_argument('--noannotations', dest='import_annotations',
            action='store_false', help='Don\'t import annotations from source')
        parser.add_argument('--tags', dest='import_tags', default=True,
            action='store_true', help='Import tags from source')
        parser.add_argument('--notags', dest='import_tags',
            action='store_false', help='Don\'t import tags from source')
        parser.add_argument('--map-users', dest='map_users', default=False,
            action='store_true', help='Use existing user if username matches')
        parser.add_argument('--create-unknown-users', dest='create_unknown_users', default=False,
            action='store_true', help='Create new inactive users for unmapped or unknown users referenced in inport data.')

    def ask_for_project(self, title):
        """ Return a valid project object.
        """
        def ask():
            print("Please enter 'n' or the number of the desired %s project:" % title)
            print("n: create new project")
            projects = Project.objects.all()
            for n,p in enumerate(projects):
                print("%s: %s (ID %s)" % (n, p, p.id))
            selection = raw_input("Selection: ").strip()
            try:
                if selection == 'n':
                    new_project_name = raw_input("Name of new project: ").strip()
                    return Project.objects.create(title=new_project_name)
                return projects[int(selection)]
            except (ValueError, IndexError):
                return None

        while True:
            p = ask()
            if p:
                return p

    def handle(self, *args, **options):
        if options['map_users'] and options['user']:
            raise CommandError("Can't override users and map users at the " +
                    "same time, use --user or --map-users.")

        # Give some information about the import
        will_import = []
        wont_import = []
        for t in ('treenodes', 'connectors', 'annotations', 'tags'):
            if options['import_' + t]:
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
                Importer = InternalImporter
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
        if not options['user']:
            if not options['map_users']:
                override_user = ask_for_user("All imported objects need a user. " +
                        "Alterantively to selecting one --map-users can be used.")
        else:
            override_user = User.objects.get(pk=options['user'])

        importer = Importer(source, target, override_user, options)
        importer.import_data()

        logger.info("Finished import into project with ID %s" % importer.target.id)
