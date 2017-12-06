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


def ask_a_b(a, b, title):
    """Return true if a, False if b.
    """
    def ask():
        selection = raw_input(title + " ").strip()
        if selection == a:
            return True
        if selection == b:
            return False
        return None

    while True:
        d = ask()
        if d is not None:
            return d
        print("Please answer only '{}' or '{}'".format(a, b))

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
        self.user_map = dict(User.objects.all().values_list('username', 'id'))
        self.user_id_map = dict((v,k) for k,v in six.iteritems(self.user_map))
        self.preserve_ids = options['preserve_ids']

        self.format = 'json'

    def map_or_create_users(self, obj, import_users, mapped_user_ids,
            mapped_user_target_ids, created_users):
        """Update user information of a CATMAID model object. The parameters
        <mapped_users>, <mapped_user_target_ids> and <created_users> are output
        parameters and are expected to have the types set, set and dict.
        """
        map_users = self.options['map_users']
        # Try to look at every user reference field in CATMAID.
        for ref in ('user', 'reviewer', 'editor'):
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

                existing_user_id = self.user_map.get(obj_username)
                import_user = import_users.get(obj_username)

                # Map users if usernames match
                if existing_user_id:
                    # If a user with this username exists already, update
                    # the user reference the existing user if --map-users is
                    # set. Otherwise, use imported user, if available. Otherwise
                    # complain.
                    if map_users:
                        setattr(obj, ref + "_id", existing_user_id)
                        mapped_user_ids.add(obj_user_ref_id)
                        mapped_user_target_ids.add(existing_user_id)
                    elif import_user:
                        raise CommandError("Referenced user \"{}\" exists "
                                "both in database and in import data. If the "
                                "existing user should be used, please use the "
                                "--map-users option".format(obj_username))
                    else:
                        raise CommandError("Referenced user \"{}\" exists "
                                "in database, but not in import data. If the "
                                " existing user should be used, please use the "
                                "--map-users option".format(obj_username))
                elif import_user:
                    print("works?")
                    obj.user = import_user
                elif self.create_unknown_users:
                    user = created_users.get(obj_username)
                    if not user:
                        logger.info("Created new inactive user: " + obj_username)
                        user = User.objects.create(username=obj_username)
                        user.is_active = False
                        user.save()
                        created_users[obj_username] = user
                    obj.user = user
                else:
                    raise CommandError("User \"{}\" is not found in "
                            "existing data or import data. Please use --user or "
                            "--create-unknown-users".format(obj_username))

    def reset_ids(self, target_classes, import_objects,
            import_objects_by_type_and_id):
        """Reset the ID of each import object to None so that a new object will
        be created when the object is saved. At the same time an index is
        created that allows per-type lookups of foreign key fields
        """
        logger.info("Building foreign key update index")
        # Build index for foreign key fields in models. For each type, map
        # each foreign key name to a model class.
        fk_index = defaultdict(dict)
        for c in target_classes:
            class_index = fk_index[c]
            foreign_key_fields = [
                    f for f in c._meta.get_fields()
                    if f.is_relation
                    and f.many_to_one # ForeignKey instances
                    #if field.get_internal_type() == 'ForeignKey':
                    and f.related_model in target_classes
            ]

            for field in foreign_key_fields:
                class_index[field.name + '_id'] = field.related_model

        logger.info("Updating foreign keys to imported objects with new IDs")
        updated_fk_ids = 0
        unchanged_fk_ids = 0
        for object_type, objects in six.iteritems(import_objects):
            fk_fields = fk_index[object_type]
            # No need to do rest if there are no foreign keys to change to begin
            # with.
            if len(fk_fields) == 0:
                continue;

            for deserialized_object in objects:
                obj = deserialized_object.object
                obj_type = type(obj)
                for fk_field, fk_type in six.iteritems(fk_fields):
                    # Get import object with the former ID referenced in
                    # this field.
                    current_ref = getattr(obj, fk_field)
                    # Get updated model objects of the referenced type
                    imported_objects_by_id = import_objects_by_type_and_id[fk_type]
                    ref_obj = imported_objects_by_id.get(current_ref)
                    if ref_obj:
                        # Update foreign key reference to ID of newly saved
                        # object.
                        setattr(obj, fk_field, ref_obj.id)
                        updated_fk_ids += 1
                    else:
                        unchanged_fk_ids += 1

                # Save changes, if any
                if updated_fk_ids > 0:
                    obj.save()
        logger.info("{} foreign key references updated, {} did not require change".format(
                updated_fk_ids, unchanged_fk_ids))

    def override_fields(self, obj):
        # Override project to match target project
        if hasattr(obj, 'project'):
            obj.project = self.target

        # Override all user references with pre-defined user
        if self.user:
            if hasattr(obj, 'user_id'):
                obj.user = self.user
            if hasattr(obj, 'reviewer_id'):
                obj.reviewer = self.user
            if hasattr(obj, 'editor_id'):
                obj.editor = self.user

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
        mapped_user_ids = set()
        mapped_user_target_ids = set()

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

        logger.info("Adjusting {} import objects to target database".format(n_objects))
        append_only = not self.preserve_ids
        need_separate_import = []
        objects_to_save = defaultdict(list)
        import_objects_by_type_and_id = defaultdict(dict)
        for object_type, import_objects in six.iteritems(import_data):
            # Allow user reference updates in CATMAID objects
            if object_type not in user_updatable_classes:
                need_separate_import.append(object_type)
                continue

            # Stores in append-only mode import IDs and links them to the
            # respective objects. This is needed, to update foreign keys to this
            # ID when it is replaced with a new ID.
            objects_by_id = import_objects_by_type_and_id[object_type]

            # CATMAID model objects are inspected for user fields
            for deserialized_object in import_objects:
                obj = deserialized_object.object

                # Replace existing data if requested
                self.override_fields(obj)

                # Map users based on username, optionally create unmapped users.
                self.map_or_create_users(obj, import_users, mapped_user_ids,
                            mapped_user_target_ids, created_users)

                # Remove pre-defined ID and keep track of updated IDs in
                # append-only mode (default).
                if append_only:
                    current_id = obj.id
                    objects_by_id[current_id] = obj
                    # By setting id to None, Django will create a new object and
                    # set the new ID.
                    obj.id = None

                # Remember for saving
                objects_to_save[object_type].append(deserialized_object)

        # Finally save all objects
        logger.info("Storing {} database objects".format(n_objects))
        for object_type, objects in six.iteritems(objects_to_save):
            for deserialized_object in objects:
                deserialized_object.save()

        # In append-only mode, the foreign keys to objects with changed IDs have
        # to be updated.
        if append_only:
            self.reset_ids(user_updatable_classes, objects_to_save,
                    import_objects_by_type_and_id)

        for other_model in need_separate_import:
            other_objects = import_data[other_model]
            if other_model == User:
                # If user model objects are imported and users were mapped, ask
                # user if alrady mapped users should be skipped during import.
                # We don't need to take of newly created users, because they are
                # only created if no model is found. Therefore all other model
                # objects can be imported.
                if mapped_user_target_ids:
                    mapped_usernames = set(self.user_id_map.get(u) for u in mapped_user_target_ids)
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
                            logger.info("Won't import mapped users: " +
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
        parser.add_argument('--preserve-ids', dest='preserve_ids', default=False,
                action='store_true', help='Use IDs provided in import data. Warning: this can cause changes in existing data.')

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
