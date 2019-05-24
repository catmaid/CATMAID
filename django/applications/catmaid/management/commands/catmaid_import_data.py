# -*- coding: utf-8 -*-

from collections import defaultdict
import inspect
import logging
import progressbar
from typing import Any, DefaultDict, Dict, List, Set

from catmaid.apps import get_system_user
from catmaid.control.annotationadmin import copy_annotations
from catmaid.control.edge import rebuild_edge_tables, rebuild_edges_selectively
import catmaid.models
from catmaid.models import (Class, ClassClass, ClassInstance,
        ClassInstanceClassInstance, Project, Relation, User, Treenode,
        Connector, Concept, SkeletonSummary)
from catmaid.util import str2bool
from django.apps import apps
from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

logger = logging.getLogger(__name__)


# Dependency based order of central models
ordered_save_tasks = [Project, User, Class, Relation, ClassClass,
        ClassInstance, ClassInstanceClassInstance, Treenode, Connector]


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
        selection = input("Please enter the number of the user wanted: ")
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
        self.user_id_map = dict((v,k) for k,v in self.user_map.items())
        self.preserve_ids = options['preserve_ids']

        self.format = 'json'

    def map_or_create_users(self, obj, import_users, mapped_user_ids,
            mapped_user_target_ids, created_users):
        """Update user information of a CATMAID model object. The parameters
        <mapped_users>, <mapped_user_target_ids> and <created_users> are output
        parameters and are expected to have the types set, set and dict.
        """
        map_users = self.options['map_users']
        map_user_ids = self.options['map_user_ids']
        # Try to look at every user reference field in CATMAID.
        for ref in ('user', 'reviewer', 'editor'):
            id_ref = ref + "_id"
            obj_username = None

            if hasattr(obj, id_ref):
                obj_user_ref_id = getattr(obj, id_ref)
                import_user = import_users.get(obj_user_ref_id)
                existing_user_id = None
                existing_user_same_id = self.user_id_map.get(obj_user_ref_id)

                # If user data is imported, <imported_user> will be available
                # and using matching to existing users is done by name. If
                # there is no user data for this user in the imported data,
                # mapping can optionally be done by ID or new users are
                # created.
                if import_user:
                    import_user = import_user.object
                    obj_username = import_user.username
                    existing_user_id = self.user_map.get(obj_username)

                    # Map users if usernames match
                    if existing_user_id is not None:
                        # If a user with this username exists already, update
                        # the user reference the existing user if --map-users is
                        # set. If no existing user is available, use imported user,
                        # if available. Otherwise complain.
                        if map_users:
                            setattr(obj, id_ref, existing_user_id)
                            mapped_user_ids.add(obj_user_ref_id)
                            mapped_user_target_ids.add(existing_user_id)
                        elif import_user:
                            raise CommandError("Referenced user \"{}\"".format(obj_username) +
                                    "exists both in database and in import data. If the " +
                                    "existing user should be used, please use the " +
                                    "--map-users option")
                        else:
                            raise CommandError("Referenced user \"{}\"".format(obj_username) +
                                    "exists in database, but not in import data. If the " +
                                    " existing user should be used, please use the " +
                                    "--map-users option")
                    elif import_user:
                        if import_user.id in self.user_id_map:
                            import_user.id = None
                            import_user.save()
                        else:
                            import_user.is_active = False
                        created_users[obj_username] = import_user
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
                        raise CommandError("User \"{}\" is not ".format(obj_username) +
                                "found in existing data or import data. Please use " +
                                "--user or --create-unknown-users")
                elif map_user_ids and existing_user_same_id is not None:
                    mapped_user_ids.add(obj_user_ref_id)
                    mapped_user_target_ids.add(obj_user_ref_id)
                elif self.create_unknown_users:
                    user = created_users.get(obj_user_ref_id)
                    if not user:
                        logger.info("Creating new inactive user for imported " +
                                "user ID {}. No name information was ".format(obj_user_ref_id) +
                                "available, please enter a new username.")
                        while True:
                            new_username = input("New username: ").strip()
                            if not new_username:
                                logger.info("Please enter a valid username")
                            elif self.user_map.get(new_username):
                                logger.info("The username '{}' ".format(new_username) +
                                        "exists already, choose a different one")
                            else:
                                break

                        user = User.objects.create(username=new_username)
                        user.is_active = False
                        user.save()
                        created_users[obj_user_ref_id] = user
                    obj.user = user
                else:
                    raise ValueError("Could not find referenced user " +
                            "\"{}\" in imported. Try using --map-users or ".format(obj_user_ref_id))

    def reset_ids(self, target_classes, import_objects,
            import_objects_by_type_and_id, existing_classes,
            map_treenodes=True, save=True):
        """Reset the ID of each import object to None so that a new object will
        be created when the object is saved. At the same time an index is
        created that allows per-type lookups of foreign key fields
        """
        logger.info("Building foreign key update index")
        # Build index for foreign key fields in models. For each type, map
        # each foreign key name to a model class.
        fk_index = defaultdict(dict) # type: DefaultDict[Any, Dict]
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
                # Get the database column name for this field
                class_index[field.attname] = field.related_model

        logger.info("Updating foreign keys to imported objects with new IDs")
        all_classes = dict() # type: Dict
        all_classes.update(existing_classes)
        updated_fk_ids = 0
        unchanged_fk_ids = 0
        explicitly_created_summaries = 0
        other_tasks = set(import_objects.keys()) - set(ordered_save_tasks)
        # Iterate objects to import and respect dependency order
        for object_type in ordered_save_tasks + list(other_tasks):
            objects = import_objects.get(object_type)
            if not objects:
                # No objects of this object type are imported
                continue
            fk_fields = fk_index[object_type]
            # No need to do rest if there are no foreign keys to change to begin
            # with.
            if len(fk_fields) == 0:
                continue

            imported_parent_nodes = []

            bar_prefix = "- {}: ".format(object_type.__name__)
            for deserialized_object in progressbar.progressbar(objects,
                    max_value=len(objects), redirect_stdout=True,
                    prefix=bar_prefix):
                obj = deserialized_object.object
                obj_type = type(obj)
                for fk_field, fk_type in fk_fields.items():
                    # Get import object with the former ID referenced in
                    # this field.
                    current_ref = getattr(obj, fk_field)

                    # Only attempt a mapping if the foreign key isn't NULL
                    if current_ref:
                        # Get updated model objects of the referenced type
                        imported_objects_by_id = import_objects_by_type_and_id[fk_type]
                        ref_obj = imported_objects_by_id.get(current_ref)

                        if ref_obj:
                            # Update foreign key reference to ID of newly saved
                            # object. Only for treenodes this is expected to result
                            # in not yet available data
                            if object_type == Treenode and fk_type == Treenode:
                                imported_parent_nodes.append((obj, current_ref))
                            elif ref_obj.id is None:
                                raise ValueError("The referenced {} object '{}' with import ID {} wasn't stored yet".format(
                                        fk_type, str(ref_obj), current_ref))
                            setattr(obj, fk_field, ref_obj.id)
                            updated_fk_ids += 1
                        else:
                            unchanged_fk_ids += 1

                # Save objects if they should either be imported or have change
                # foreign key fields
                if save and (updated_fk_ids or obj.id is None):
                    obj.save()

            # Treenodes are special, because they can reference themselves. They
            # need therefore a second iteration of reference updates after all
            # treenodes have been saved and new IDs are available.
            if map_treenodes and object_type == Treenode:
                logger.info('Mapping parent IDs of treenodes to imported data')
                imported_objects_by_id = import_objects_by_type_and_id[Treenode]
                for obj, parent_id in progressbar.progressbar(imported_parent_nodes,
                        max_value=len(imported_parent_nodes),
                        redirect_stdout=True, prefix="- Mapping parent treenodes: "):
                    new_parent = imported_objects_by_id.get(parent_id)
                    if not new_parent:
                        raise ValueError("Could not find imported treenode {}".format(parent_id))
                    obj.parent_id = new_parent.id
                    if save:
                        obj.save()

            # Update list of known classes after new classes have been saved
            if object_type == Class:
                for deserialized_object in objects:
                    obj = deserialized_object.object
                    all_classes[obj.class_name] = obj.id

            # If skeleton class instances are created, make sure the skeleton
            # summary table entries for the respective skeletons are there.
            # Otherwise the ON CONFLICT claues of the summary update updates can
            # be called multiple times. The alternative is to disable the
            # trigger during import.
            pre_create_summaries = False
            if object_type == ClassInstance and pre_create_summaries:
                last_editor = get_system_user()
                skeleton_class_id = all_classes.get('skeleton')
                for deserialized_object in objects:
                    obj = deserialized_object.object
                    if obj.class_column_id == skeleton_class_id:
                        r = SkeletonSummary.objects.get_or_create(project=self.target,
                                skeleton_id=obj.id, defaults={'last_editor': last_editor})
                        explicitly_created_summaries += 1

        logger.info("".join(["{} foreign key references updated, {} did not ",
                "require change, {} skeleton summaries were created"]).format(
                updated_fk_ids, unchanged_fk_ids, explicitly_created_summaries))

    def override_fields(self, obj):
        # Override project to match target project
        if hasattr(obj, 'project_id'):
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

        # Drop summary table trigger to make insertion faster
        cursor.execute("""
            DROP TRIGGER on_edit_treenode_update_summary_and_edges ON treenode;
            DROP TRIGGER on_insert_treenode_update_summary_and_edges ON treenode;
            DROP TRIGGER on_delete_treenode_update_summary_and_edges ON treenode;
        """)

        # Get all existing users so that we can map them basedon their username.
        mapped_user_ids = set() # type: Set
        mapped_user_target_ids = set() # type: Set

        # Map data types to lists of object of the respective type
        import_data = defaultdict(list) # type: DefaultDict[Any, List]
        n_objects = 0

        # Read the file and sort by type
        logger.info("Loading data from {}".format(self.source))
        with open(self.source, "r") as data:
            loaded_data = serializers.deserialize(self.format, data)
            for deserialized_object in progressbar.progressbar(loaded_data,
                    max_value=progressbar.UnknownLength, redirect_stdout=True):
                obj = deserialized_object.object
                import_data[type(obj)].append(deserialized_object)
                n_objects += 1

        if n_objects == 0:
            raise CommandError("Nothing to import, no importable data found")

        created_users = dict() # type: Dict
        if import_data.get(User):
            import_users = dict((u.object.id, u) for u in import_data.get(User))
            logger.info("Found {} referenceable users in import data".format(len(import_users)))
        else:
            import_users = dict()
            logger.info("Found no referenceable users in import data")

        # Get CATMAID model classes, which are the ones we want to allow
        # optional modification of user, project and ID fields.
        app = apps.get_app_config('catmaid')
        user_updatable_classes = set(app.get_models())

        logger.info("Adjusting {} import objects to target database".format(n_objects))

        # Needed for name uniquness of classes, class_instances and relations
        existing_classes = dict(Class.objects.filter(project_id=self.target.id) \
                .values_list('class_name', 'id'))
        existing_relations = dict(Relation.objects.filter(project_id=self.target.id) \
                .values_list('relation_name', 'id'))
        existing_class_instances = dict(ClassInstance.objects.filter(project_id=self.target.id) \
                .values_list('name', 'id'))

        existing_concept_ids = set(Concept.objects.all().values_list('id', flat=True))

        # Find classes for neurons and skeletons in import data
        if Class in import_data:
            allowed_duplicate_classes = tuple(c.object.id
                    for c in import_data.get(Class)
                    if c.object.class_name in ('neuron', 'skeleton'))
        else:
            allowed_duplicate_classes = tuple()

        n_reused = 0
        n_moved = 0
        append_only = not self.preserve_ids
        need_separate_import = []
        objects_to_save = defaultdict(list) # type: DefaultDict[Any, List]
        import_objects_by_type_and_id = defaultdict(dict) # type: DefaultDict[Any, Dict]
        for object_type, import_objects in import_data.items():
            # Allow user reference updates in CATMAID objects
            if object_type not in user_updatable_classes:
                need_separate_import.append(object_type)
                continue

            # Stores in append-only mode import IDs and links them to the
            # respective objects. This is needed, to update foreign keys to this
            # ID when it is replaced with a new ID.
            objects_by_id = import_objects_by_type_and_id[object_type]

            is_class = object_type == Class
            is_relation = object_type == Relation
            is_class_instance = object_type == ClassInstance

            # CATMAID model objects are inspected for user fields
            for deserialized_object in import_objects:
                obj = deserialized_object.object

                # Semantic data like classes and class instances are expected to
                # be unique with respect to their names. Existing objects with
                # the same ID will get a new ID even if --preserve-ids is set.
                existing_obj_id = None
                concept_id_exists = obj.id in existing_concept_ids
                if is_class:
                    existing_obj_id = existing_classes.get(obj.class_name)
                if is_relation:
                    existing_obj_id = existing_relations.get(obj.relation_name)
                if is_class_instance:
                    existing_obj_id = existing_class_instances.get(obj.name)

                    # Neurons (class instances of class "neuron" and "skeleton")
                    # are a special case.  There can be multiple neurons with
                    # the same name, something that is not allowed in other
                    # cases. In this particular case, however, class instance
                    # reuse is not wanted.
                    if existing_obj_id and obj.class_column_id in allowed_duplicate_classes:
                        existing_obj_id = None
                        concept_id_exists = False

                if existing_obj_id is not None:
                    # Add mapping so that existing references to it can be
                    # updated. The object itself is not marked for saving,
                    # because it exists already.
                    current_id = obj.id
                    objects_by_id[current_id] = obj
                    obj.id = existing_obj_id
                    n_reused += 1
                    continue

                # If there is already an known object with the ID of the object
                # we are importing at the moment and the current model is a
                # class, relation or class_instance, then the imported object
                # will get a new ID, even with --preservie-ids set. We reuse
                # these types.
                if concept_id_exists:
                    current_id = obj.id
                    objects_by_id[current_id] = obj
                    obj.id = None
                    n_moved += 1

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

        if len(created_users) > 0:
            logger.info("Created {} new users: {}".format(len(created_users),
                    ", ".join(sorted([u.username for u in created_users.values()]))))
        else:
            logger.info("No unmapped users imported")

        # Finally save all objects. Make sure they are saved in order:
        logger.info("Storing {} database objects including {} moved objects, reusing additional {} existing objects" \
                .format(n_objects - n_reused, n_moved, n_reused))

        # In append-only mode, the foreign keys to objects with changed IDs have
        # to be updated. In preserve-ids mode only IDs to classes and relations
        # will be updated. Saving model objects after an update of referenced
        # keys is only needed in append-only mode.
        self.reset_ids(user_updatable_classes, objects_to_save,
                import_objects_by_type_and_id, existing_classes)

        other_tasks = set(objects_to_save.keys()) - set(ordered_save_tasks)
        for object_type in ordered_save_tasks + list(other_tasks):
            objects = objects_to_save.get(object_type)
            if objects:
                logger.info("- Importing objects of type " + object_type.__name__)
                for deserialized_object in progressbar.progressbar(objects,
                        max_value=len(objects), redirect_stdout=True):
                    deserialized_object.save()

        logger.info("- Importing all other objects")
        for other_model in progressbar.progressbar(need_separate_import,
                max_value=len(need_separate_import), redirect_stdout=True):
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
                if deserialized_object.object.username in created_users.keys():
                    deserialized_object.save()

        # Reset counters to current maximum IDs
        cursor.execute('''
            SELECT setval('concept_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
            FROM concept;
            SELECT setval('location_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
            FROM location;
            SELECT setval('auth_user_id_seq', coalesce(max("id"), 1), max("id") IS NOT null)
            FROM auth_user;
        ''')

        cursor.execute("""
            CREATE TRIGGER on_insert_treenode_update_summary_and_edges
            AFTER INSERT ON treenode
            REFERENCING NEW TABLE as inserted_treenode
            FOR EACH STATEMENT EXECUTE PROCEDURE on_insert_treenode_update_summary_and_edges();

            CREATE TRIGGER on_edit_treenode_update_summary_and_edges
            AFTER UPDATE ON treenode
            REFERENCING NEW TABLE as new_treenode OLD TABLE as old_treenode
            FOR EACH STATEMENT EXECUTE PROCEDURE on_edit_treenode_update_summary_and_edges();

            CREATE TRIGGER on_delete_treenode_update_summary_and_edges
            AFTER DELETE ON treenode
            REFERENCING OLD TABLE as deleted_treenode
            FOR EACH STATEMENT EXECUTE PROCEDURE on_delete_treenode_update_summary_and_edges();
        """)

        if self.options.get('update_project_materializations'):
            logger.info("Updating edge tables for project {}".format(self.target.id))
            rebuild_edge_tables(project_ids=[self.target.id], log=lambda msg: logger.info(msg))

            logger.info("Updated skeleton summary tables")
            cursor.execute("""
                DELETE FROM catmaid_skeleton_summary;
                SELECT refresh_skeleton_summary_table();
            """)
        else:
            logger.info("Finding imported skeleton IDs and connector IDs")

            connector_ids = [] # type: List
            connectors = objects_to_save.get(Connector)
            if connectors:
                connector_ids.extend(i.object.id for i in connectors)

            # Find all skeleton classes both in imported data and existing data.
            skeleton_classes = set()
            classes = objects_to_save.get(Class)
            if classes:
                for deserialized_object in classes:
                    c = deserialized_object.object
                    if c.class_name == 'skeleton':
                        skeleton_classes.add(c.id)
            cursor.execute("""
                SELECT id FROM class WHERE class_name = 'skeleton'
            """)
            for row in cursor.fetchall():
                skeleton_classes.add(row[0])

            skeleton_ids = []
            class_instances = objects_to_save.get(ClassInstance)
            if class_instances:
                for deserialized_object in class_instances:
                    ci = deserialized_object.object
                    # Check if the class reference is a "skeleton" class
                    if ci.class_column_id in skeleton_classes:
                        skeleton_ids.append(ci.id)

            if skeleton_ids or connector_ids:
                logger.info("Updating edge tables for {} skeleton(s) and {} " \
                        "connector(s)".format(len(skeleton_ids), len(connector_ids)))
                rebuild_edges_selectively(skeleton_ids, connector_ids, log=lambda msg: logger.info(msg))
            else:
                logger.info("No materialization to update: no skeleton IDs or " \
                        "connector IDs found in imported data")


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
        parser.add_argument('--create-unknown-users', dest='create_unknown_users', default=True,
            action='store_true', help='Create new inactive users for unmapped or unknown users referenced in inport data.')
        parser.add_argument('--preserve-ids', dest='preserve_ids', default=False,
                action='store_true', help='Use IDs provided in import data. Warning: this can cause changes in existing data.')
        parser.add_argument('--no-analyze', dest='analyze_db', default=True,
                action='store_false', help='If ANALYZE to update database statistics should not be called after the import.')
        parser.add_argument('--update-project-materializations', dest='update_project_materializations', default=False,
                action='store_true', help='Whether all materializations (edges, summary) of the current project should be updated or only the ones of imported skeletons.')

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
        if options['map_users'] and options['user']:
            raise CommandError("Can't override users and map users at the " +
                    "same time, use --user or --map-users.")

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
        if options['user']:
            override_user = User.objects.get(pk=options['user'])
            logger.info("All imported objects will be owned by user \"{}\"".format(
                    override_user.username))
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
