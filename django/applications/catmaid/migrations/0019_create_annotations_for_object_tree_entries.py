# -*- coding: utf-8 -*-
import datetime
import traceback
from south.db import db
from south.v2 import DataMigration
from django.conf import settings
from django.contrib.auth.models import User
from django.db import models
from django.db import transaction

import re

from catmaid.control.common import get_relation_to_id_map, get_class_to_id_map
from catmaid.control.tracing import check_tracing_setup_detailed, setup_tracing

def log(msg, indent=0):
    """ Provides basic log output.
    """
    print("[Annotations] %s%s" % ("  " * indent, msg))

class Traverser():
    """ This class is able to migrate a single project. This translation is
    based on the following rules (class instance and node will be used
    interchangeably):

    1. Root: Only paths that start at the node 'root' will be looked at. The
       root node itself will not become an annotation.
    2. Empty folder nodes will not be migrated.
    3. IST: Neurons within the 'Isolated synaptic terminals' folder don't
       get any special annotation.
    4. Fragments: Group nodes on any level below the fragments node will
       become individual annotations. The fragments node itself won't become
       an annotation and all annotations collected before will be forgotten.
    5. Staging: The staging folder and the user folders below it won't
       become an annotation. However, everything below the user folders is
       subject to all rules again.
    6. All other folders: They become individual annotations.
    7. Neuron names: If they don't contain a semi-colon (';'), names stay as
       they are. If they do, everything before the first semi-colon will be
       the neuron name, every semi-colon enclosed token afterwards will
       become an annotation.
    8. Permissions: owner of the link of new annotations to neurons will be
       the owner of the part_of node-node link.
    """

    def __init__(self, orm, project, class_map, relation_map):
        self.orm = orm
        self.p = project
        self.class_map = class_map
        self.relation_map = relation_map
        # Have a cache for annotation IDs
        self.annotation_cache = {}
        # Have a set of pre-defined patterns to match folder names
        self.fragments_pattern = re.compile(r'^[Ff]ragments?')
        # Keep track of all visited nodes in case they appear in multiple times
        # in different branches.
        self.visited_nodes = set()

    def run(self, start_node):
        """ Starts the traversal from the given node and provides some extra
        output.
        """
        log("Starting migration of project #%s" % self.p.id)
        self.traverse(start_node, False);

        # Give some output about the used annotations
        log("Done with traversing object tree. The following annotations %s " \
                "have been found and used:" % len(self.annotation_cache), 1)
        log(', '.join(self.annotation_cache.keys()), 2)
        
    def annotate_neuron(self, neuron, depth, annotations):
        """ This method will parse the neuron name for annotations and will
        add them along with the extra annotations passed. The neuron name will
        be split on semi-colons (';') and all tokens, starting from the second
        (!) will be trimmed and added as annotations (if not empty).
        """
        tokens = neuron.name.split(';')
        cleaned_tokens = [t.strip() for t in tokens[1:] if t.strip()]
        annotations = annotations.union(set(cleaned_tokens))
        
        ann_text = ', '.join(annotations) if annotations else 'none'
        log("-> Annotations (neuron): %s" % ann_text, depth + 1)

        # Rename neuron to only have first token
        neuron.name = tokens[0]
        neuron.save()

        # Add annotations to neuron
        for a in annotations:
            # Make sure the annotation's class instance exists.
            if a not in self.annotation_cache:
                ci, created = self.orm.ClassInstance.objects.get_or_create(
                      project_id=self.p.id, name=a,
                      class_column_id=self.class_map['annotation'],
                      defaults={'user_id': neuron.link_user_id});
                self.annotation_cache[a] = ci.id
            # Get annotation ID from cache
            a_id = self.annotation_cache[a]

            # Link the annotation
            cici, created = self.orm.ClassInstanceClassInstance.objects.get_or_create(
                    project_id=self.p.id,
                    relation_id=self.relation_map['annotated_with'],
                    class_instance_a_id=neuron.id,
                    class_instance_b_id=a_id,
                    defaults={
                        'user_id': neuron.link_user_id,
                    })
            cici.save() # update the last edited tim

    def traverse(self, node, folder_annotations, path="", depth=0, annotations=set()):
        """ This method traverses the existing object tree to collect
        annotations which are eventually linked to neurons. If the
        'folder_annotations' option is true, the folder name will not be
        looked at and no annotation will be potentially created from it.
        """
        if node.id in self.visited_nodes:
            log("Ignoring node, it has been seen before", indent)
            return

        # Mark node as visited
        self.visited_nodes.add(node.id)
        # Set indentation levels for output on this level
        indent = depth + 1
        # Be default, the folders on the *next* level will be looked at
        next_folder_annotations = True

        # Output and path update
        path = "%s > %s" % (path, node.name)
        log("Node: %s" % node.name, indent)
        log("-> Path: %s" % path, indent)

        # Test if deal with a neuron
        if node.class_column_id == self.class_map['neuron']:
            self.annotate_neuron(node, depth, annotations)
        # Only look at folder names if requested
        elif folder_annotations:
            if re.match(self.fragments_pattern, node.name):
              # Fragments folder: forget all annotations
              annotations = set()
            elif node.name == 'Isolated synaptic terminals':
              # 'Isolated synaptic terminals' folder: don't add annotation
              # for it
              pass
            elif node.name == 'Staging':
              # Staging folder: the naming folders below shouldn't get
              # annotations
              next_folder_annotations = False
            else:
              # All other nodes: add trimmed name as annotation
              annotations = annotations.copy()
              annotations.add(node.name.strip())

        # Get linked nodes, annotated whether they are neurons,  and
        # traverse them
        linked_nodes = self.orm.ClassInstance.objects.filter(project=self.p.id,
                cici_via_a__relation=self.relation_map['part_of'],
                cici_via_a__class_instance_b=node).extra(select={
                    'link_user_id': 'class_instance_class_instance.user_id'
                }).order_by('id')
        for ln in linked_nodes:
            self.traverse(ln, next_folder_annotations, path, depth+1,
                    annotations)

class Migration(DataMigration):

    def test_tracing_setup(self, orm, p, class_map, relation_map):
        """ Tests if the given project is setup for tracing. If it seems it
        should be (i.e. it has a root class and a root node instance), but is
        missing some needed things, the user is given the option to get this
        automatically fixed. If (s)he doesn't want to or the project is doesn't
        appear to be a tracing project, a RuntimeError is raised.
        """
        # First check if the project qualifies for further steps by testing
        # whether it actually has a tracing root node. If not, it is skipped.
        if not ('root' in class_map and orm.ClassInstance.objects.filter(
                class_column=class_map['root'], project_id=p.id).exists()):
            raise RuntimeError("Skipping project #%s, because tracing isn't " \
                    "set up for it" % p.id)
        
        # Since this project is apparently a tracing project, make sure tracing
        # is set-up properly for it. If not, ask the user if missing classes and
        # relations should be created.
        setup_okay, mc, mr, mci = check_tracing_setup_detailed(p.id,
                class_map, relation_map, check_root_ci=False)
        if not setup_okay:
            indent = 1
            log("This project seems to be up for tracing in principle, but " \
                    "it isn't setup properly:", indent)
            if mc:
                log("Missing classes: %s" % ', '.join(mc), indent + 1)
            if mr:
                log("Missing relations: %s" % ', '.join(mr), indent + 1)
            if mci:
                log("Missing class instances: %s" % ', '.join(mci), indent + 1)
            log("This migration can add the missing bits, if wanted. It will " \
                    "skip this project if not.", 1)

            should_fix = None
            while should_fix not in ['yes', 'no']:
                should_fix = raw_input("Should the missing information be " \
                        "added automatically? (yes/no)")
            # Skip project if the answer isn't positive
            if should_fix != 'yes':
                raise RuntimeError("Skipping project, because of user's " \
                        "choice to not setup tracing properly.")
            # Fix setup otherwise and continue. Use the first super user
            # available to do that.
            super_user = User.objects.filter(is_superuser=True).order_by('id')[0]
            setup_tracing(p.id, super_user)
            log("The missing bits have been added.", indent)

    def forwards(self, orm):
        """ This migration will parse the data structures that form the object
        tree to create annotations to neurons. These annotations will eventually
        replace the object tree. For details on how every project is handled,
        have a look at the 'migrate_project' method.
        """
        # Return without doing anything, if there are no class instances at all.
        # In such a case there isn't anything to migrate and the questsion below
        # could cause confusion.
        if orm.ClassInstance.objects.all().count() == 0:
            return

        answer = None
        while answer not in ['yes', 'no', 'skip']:
            answer = raw_input("This migration will create new data (annotations)" \
                " in the database, based on existing data. It cannot be reversed." \
                " Please make sure you have an up-to-date backup. Only data" \
                " related to the object tree will be changed. Do you want to" \
                " continue? (yes/no/skip) ")

        if answer == 'skip':
            return
        if answer != 'yes':
            raise RuntimeError("Migration stopped by user")

        # Wrap all database operations in a transaction. Therefore, disable
        # Django's autocommit.
        db.start_transaction()

        try:
            # Migrate every available project
            for p in orm.Project.objects.order_by('id'):
                if p.id == settings.ONTOLOGY_DUMMY_PROJECT_ID:
                    log("Skipping special purpose project #%s: %s" % (p.id, p.title))
                    continue
                else:
                    log("Looking at project #%s: %s" % (p.id, p.title))

                class_map = get_class_to_id_map(p.id)
                relation_map = get_relation_to_id_map(p.id)

                try:
                  self.test_tracing_setup(orm, p, class_map, relation_map)
                  # If any where added new, update
                  class_map = get_class_to_id_map(p.id)
                  relation_map = get_relation_to_id_map(p.id)
                except RuntimeError as e:
                  log(e.message, 1)
                  continue

                # A project available here, can be expected to be setup for tracing
                # properly. Therefore, annotations can now be created for every neuron
                # of this project. The existing object tree data structure will be
                # traversed in a similar way to how the CATMAID front-end works.

                # Start at the root node and traverse all folder in there
                root_node = orm.ClassInstance.objects.filter(project=p.id,
                        class_column=class_map['root']).get()
                traverser = Traverser(orm, p, class_map, relation_map)
                traverser.run(root_node)

                # Let user know we are done with this project
                log("Finished migration of project #%s" % p.id)
        
            # Commit transaction if everything worked well
            db.commit_transaction()
        except Exception as e:
            db.rollback_transaction()
            log("Something went went wrong, rolling back changes: %s" % \
                    e.message)
            traceback.print_exc()
            raise RuntimeError("Couldn't apply migration")

    def backwards(self, orm):
        print("This data migration cannot be reversed.")

    models = {
        'auth.group': {
            'Meta': {'object_name': 'Group'},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'unique': 'True', 'max_length': '80'}),
            'permissions': ('django.db.models.fields.related.ManyToManyField', [], {'to': "orm['auth.Permission']", 'symmetrical': 'False', 'blank': 'True'})
        },
        'auth.permission': {
            'Meta': {'ordering': "('content_type__app_label', 'content_type__model', 'codename')", 'unique_together': "(('content_type', 'codename'),)", 'object_name': 'Permission'},
            'codename': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'content_type': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['contenttypes.ContentType']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '50'})
        },
        'auth.user': {
            'Meta': {'object_name': 'User'},
            'date_joined': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'email': ('django.db.models.fields.EmailField', [], {'max_length': '75', 'blank': 'True'}),
            'first_name': ('django.db.models.fields.CharField', [], {'max_length': '30', 'blank': 'True'}),
            'groups': ('django.db.models.fields.related.ManyToManyField', [], {'to': "orm['auth.Group']", 'symmetrical': 'False', 'blank': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'is_active': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'is_staff': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'is_superuser': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'last_login': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'last_name': ('django.db.models.fields.CharField', [], {'max_length': '30', 'blank': 'True'}),
            'password': ('django.db.models.fields.CharField', [], {'max_length': '128'}),
            'user_permissions': ('django.db.models.fields.related.ManyToManyField', [], {'to': "orm['auth.Permission']", 'symmetrical': 'False', 'blank': 'True'}),
            'username': ('django.db.models.fields.CharField', [], {'unique': 'True', 'max_length': '30'})
        },
        'catmaid.apikey': {
            'Meta': {'object_name': 'ApiKey'},
            'description': ('django.db.models.fields.TextField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'key': ('django.db.models.fields.CharField', [], {'max_length': '128'})
        },
        'catmaid.brokenslice': {
            'Meta': {'object_name': 'BrokenSlice', 'db_table': "'broken_slice'"},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'index': ('django.db.models.fields.IntegerField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"})
        },
        'catmaid.cardinalityrestriction': {
            'Meta': {'object_name': 'CardinalityRestriction', 'db_table': "'cardinality_restriction'"},
            'cardinality_type': ('django.db.models.fields.IntegerField', [], {}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'enabled': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'restricted_link': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassClass']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"}),
            'value': ('django.db.models.fields.IntegerField', [], {})
        },
        'catmaid.changerequest': {
            'Meta': {'object_name': 'ChangeRequest', 'db_table': "'change_request'"},
            'approve_action': ('django.db.models.fields.TextField', [], {}),
            'completion_time': ('django.db.models.fields.DateTimeField', [], {'default': 'None', 'null': 'True'}),
            'connector': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Connector']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'description': ('django.db.models.fields.TextField', [], {}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'recipient': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'change_recipient'", 'db_column': "'recipient_id'", 'to': "orm['auth.User']"}),
            'reject_action': ('django.db.models.fields.TextField', [], {}),
            'status': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'treenode': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Treenode']"}),
            'type': ('django.db.models.fields.CharField', [], {'max_length': '32'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"}),
            'validate_action': ('django.db.models.fields.TextField', [], {})
        },
        'catmaid.class': {
            'Meta': {'object_name': 'Class', 'db_table': "'class'"},
            'class_name': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'description': ('django.db.models.fields.TextField', [], {}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.classclass': {
            'Meta': {'object_name': 'ClassClass', 'db_table': "'class_class'"},
            'class_a': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'classes_a'", 'db_column': "'class_a'", 'to': "orm['catmaid.Class']"}),
            'class_b': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'classes_b'", 'db_column': "'class_b'", 'to': "orm['catmaid.Class']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.classinstance': {
            'Meta': {'object_name': 'ClassInstance', 'db_table': "'class_instance'"},
            'class_column': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Class']", 'db_column': "'class_id'"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.classinstanceclassinstance': {
            'Meta': {'object_name': 'ClassInstanceClassInstance', 'db_table': "'class_instance_class_instance'"},
            'class_instance_a': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'cici_via_a'", 'db_column': "'class_instance_a'", 'to': "orm['catmaid.ClassInstance']"}),
            'class_instance_b': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'cici_via_b'", 'db_column': "'class_instance_b'", 'to': "orm['catmaid.ClassInstance']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.concept': {
            'Meta': {'object_name': 'Concept', 'db_table': "'concept'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.connector': {
            'Meta': {'object_name': 'Connector', 'db_table': "'connector'"},
            'confidence': ('django.db.models.fields.IntegerField', [], {'default': '5'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'editor': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'connector_editor'", 'db_column': "'editor_id'", 'to': "orm['auth.User']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'review_time': ('django.db.models.fields.DateTimeField', [], {}),
            'reviewer_id': ('django.db.models.fields.IntegerField', [], {'default': '-1'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.connectorclassinstance': {
            'Meta': {'object_name': 'ConnectorClassInstance', 'db_table': "'connector_class_instance'"},
            'class_instance': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']"}),
            'connector': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Connector']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.constraintstosegmentmap': {
            'Meta': {'object_name': 'ConstraintsToSegmentMap'},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'origin_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'segments': ('catmaid.fields.IntegerArrayField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'target_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'})
        },
        'catmaid.dataview': {
            'Meta': {'ordering': "('position',)", 'object_name': 'DataView', 'db_table': "'data_view'"},
            'comment': ('django.db.models.fields.TextField', [], {'default': "''", 'null': 'True', 'blank': 'True'}),
            'config': ('django.db.models.fields.TextField', [], {'default': "'{}'"}),
            'data_view_type': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.DataViewType']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'is_default': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'position': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        'catmaid.dataviewtype': {
            'Meta': {'object_name': 'DataViewType', 'db_table': "'data_view_type'"},
            'code_type': ('django.db.models.fields.TextField', [], {}),
            'comment': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        'catmaid.deprecatedappliedmigrations': {
            'Meta': {'object_name': 'DeprecatedAppliedMigrations', 'db_table': "'applied_migrations'"},
            'id': ('django.db.models.fields.CharField', [], {'max_length': '32', 'primary_key': 'True'})
        },
        'catmaid.deprecatedsession': {
            'Meta': {'object_name': 'DeprecatedSession', 'db_table': "'sessions'"},
            'data': ('django.db.models.fields.TextField', [], {'default': "''"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'last_accessed': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'session_id': ('django.db.models.fields.CharField', [], {'max_length': '26'})
        },
        'catmaid.drawing': {
            'Meta': {'object_name': 'Drawing', 'db_table': "'drawing'"},
            'component_id': ('django.db.models.fields.IntegerField', [], {}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'max_x': ('django.db.models.fields.IntegerField', [], {}),
            'max_y': ('django.db.models.fields.IntegerField', [], {}),
            'min_x': ('django.db.models.fields.IntegerField', [], {}),
            'min_y': ('django.db.models.fields.IntegerField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'skeleton_id': ('django.db.models.fields.IntegerField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'status': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'svg': ('django.db.models.fields.TextField', [], {}),
            'type': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"}),
            'z': ('django.db.models.fields.IntegerField', [], {})
        },
        'catmaid.location': {
            'Meta': {'object_name': 'Location', 'db_table': "'location'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'editor': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'location_editor'", 'db_column': "'editor_id'", 'to': "orm['auth.User']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'review_time': ('django.db.models.fields.DateTimeField', [], {}),
            'reviewer_id': ('django.db.models.fields.IntegerField', [], {'default': '-1'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.log': {
            'Meta': {'object_name': 'Log', 'db_table': "'log'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'freetext': ('django.db.models.fields.TextField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'operation_type': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.message': {
            'Meta': {'object_name': 'Message', 'db_table': "'message'"},
            'action': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'read': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'text': ('django.db.models.fields.TextField', [], {'default': "'New message'", 'null': 'True', 'blank': 'True'}),
            'time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'title': ('django.db.models.fields.TextField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.overlay': {
            'Meta': {'object_name': 'Overlay', 'db_table': "'overlay'"},
            'default_opacity': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'file_extension': ('django.db.models.fields.TextField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'image_base': ('django.db.models.fields.TextField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'tile_height': ('django.db.models.fields.IntegerField', [], {'default': '512'}),
            'tile_source_type': ('django.db.models.fields.IntegerField', [], {'default': '1'}),
            'tile_width': ('django.db.models.fields.IntegerField', [], {'default': '512'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        'catmaid.project': {
            'Meta': {'object_name': 'Project', 'db_table': "'project'"},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'public': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'stacks': ('django.db.models.fields.related.ManyToManyField', [], {'to': "orm['catmaid.Stack']", 'through': "orm['catmaid.ProjectStack']", 'symmetrical': 'False'}),
            'title': ('django.db.models.fields.TextField', [], {})
        },
        'catmaid.projectstack': {
            'Meta': {'object_name': 'ProjectStack', 'db_table': "'project_stack'"},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'orientation': ('django.db.models.fields.IntegerField', [], {'default': '0'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'translation': ('catmaid.fields.Double3DField', [], {'default': '(0, 0, 0)'})
        },
        'catmaid.regionofinterest': {
            'Meta': {'object_name': 'RegionOfInterest', 'db_table': "'region_of_interest'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'height': ('django.db.models.fields.FloatField', [], {}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'rotation_cw': ('django.db.models.fields.FloatField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"}),
            'width': ('django.db.models.fields.FloatField', [], {}),
            'zoom_level': ('django.db.models.fields.IntegerField', [], {})
        },
        'catmaid.regionofinterestclassinstance': {
            'Meta': {'object_name': 'RegionOfInterestClassInstance', 'db_table': "'region_of_interest_class_instance'"},
            'class_instance': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'region_of_interest': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.RegionOfInterest']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.relation': {
            'Meta': {'object_name': 'Relation', 'db_table': "'relation'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'description': ('django.db.models.fields.TextField', [], {}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'isreciprocal': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation_name': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'uri': ('django.db.models.fields.TextField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.relationinstance': {
            'Meta': {'object_name': 'RelationInstance', 'db_table': "'relation_instance'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.restriction': {
            'Meta': {'object_name': 'Restriction', 'db_table': "'restriction'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'enabled': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'restricted_link': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassClass']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.segments': {
            'Meta': {'object_name': 'Segments'},
            'assembly': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']", 'null': 'True'}),
            'cost': ('django.db.models.fields.FloatField', [], {'db_index': 'True'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'direction': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'origin_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'origin_slice_id': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'randomforest_cost': ('django.db.models.fields.FloatField', [], {}),
            'segmentation_cost': ('django.db.models.fields.FloatField', [], {}),
            'segmentid': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'segmenttype': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'status': ('django.db.models.fields.IntegerField', [], {'default': '1', 'db_index': 'True'}),
            'target1_slice_id': ('django.db.models.fields.IntegerField', [], {'null': 'True', 'db_index': 'True'}),
            'target2_slice_id': ('django.db.models.fields.IntegerField', [], {'null': 'True', 'db_index': 'True'}),
            'target_section': ('django.db.models.fields.IntegerField', [], {'null': 'True', 'db_index': 'True'}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.segmenttoconstraintmap': {
            'Meta': {'object_name': 'SegmentToConstraintMap'},
            'constraint': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ConstraintsToSegmentMap']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'origin_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'segment_node_id': ('django.db.models.fields.CharField', [], {'max_length': '128', 'db_index': 'True'}),
            'segmentid': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'target_section': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'})
        },
        'catmaid.settings': {
            'Meta': {'object_name': 'Settings', 'db_table': "'settings'"},
            'key': ('django.db.models.fields.TextField', [], {'primary_key': 'True'}),
            'value': ('django.db.models.fields.TextField', [], {'null': 'True'})
        },
        'catmaid.skeletonlistdashboard': {
            'Meta': {'object_name': 'SkeletonlistDashboard', 'db_table': "'skeletonlist_dashboard'"},
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'description': ('django.db.models.fields.TextField', [], {}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'shortname': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'skeleton_list': ('catmaid.fields.IntegerArrayField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.slices': {
            'Meta': {'object_name': 'Slices'},
            'assembly': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']", 'null': 'True'}),
            'center_x': ('django.db.models.fields.FloatField', [], {'db_index': 'True'}),
            'center_y': ('django.db.models.fields.FloatField', [], {'db_index': 'True'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'flag_left': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'flag_right': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'max_x': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'max_y': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'min_x': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'min_y': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'node_id': ('django.db.models.fields.CharField', [], {'max_length': '255', 'db_index': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'sectionindex': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'size': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'slice_id': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"}),
            'status': ('django.db.models.fields.IntegerField', [], {'default': '1', 'db_index': 'True'}),
            'threshold': ('django.db.models.fields.FloatField', [], {}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.stack': {
            'Meta': {'object_name': 'Stack', 'db_table': "'stack'"},
            'comment': ('django.db.models.fields.TextField', [], {'null': 'True', 'blank': 'True'}),
            'dimension': ('catmaid.fields.Integer3DField', [], {}),
            'file_extension': ('django.db.models.fields.TextField', [], {'default': "'jpg'", 'blank': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'image_base': ('django.db.models.fields.TextField', [], {}),
            'metadata': ('django.db.models.fields.TextField', [], {'default': "''", 'blank': 'True'}),
            'num_zoom_levels': ('django.db.models.fields.IntegerField', [], {'default': '-1'}),
            'resolution': ('catmaid.fields.Double3DField', [], {}),
            'tile_height': ('django.db.models.fields.IntegerField', [], {'default': '256'}),
            'tile_source_type': ('django.db.models.fields.IntegerField', [], {'default': '1'}),
            'tile_width': ('django.db.models.fields.IntegerField', [], {'default': '256'}),
            'title': ('django.db.models.fields.TextField', [], {}),
            'trakem2_project': ('django.db.models.fields.BooleanField', [], {'default': 'False'})
        },
        'catmaid.stacksliceinfo': {
            'Meta': {'object_name': 'StackSliceInfo'},
            'file_extension': ('django.db.models.fields.TextField', [], {'null': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'slice_base_path': ('django.db.models.fields.TextField', [], {}),
            'slice_base_url': ('django.db.models.fields.TextField', [], {}),
            'stack': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Stack']"})
        },
        'catmaid.textlabel': {
            'Meta': {'object_name': 'Textlabel', 'db_table': "'textlabel'"},
            'colour': ('catmaid.fields.RGBAField', [], {'default': '(1, 0.5, 0, 1)'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'deleted': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'font_name': ('django.db.models.fields.TextField', [], {'null': 'True'}),
            'font_size': ('django.db.models.fields.FloatField', [], {'default': '32'}),
            'font_style': ('django.db.models.fields.TextField', [], {'null': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'scaling': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'text': ('django.db.models.fields.TextField', [], {'default': "'Edit this text ...'"}),
            'type': ('django.db.models.fields.CharField', [], {'max_length': '32'})
        },
        'catmaid.textlabellocation': {
            'Meta': {'object_name': 'TextlabelLocation', 'db_table': "'textlabel_location'"},
            'deleted': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'textlabel': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Textlabel']"})
        },
        'catmaid.treenode': {
            'Meta': {'object_name': 'Treenode', 'db_table': "'treenode'"},
            'confidence': ('django.db.models.fields.IntegerField', [], {'default': '5'}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'editor': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'treenode_editor'", 'db_column': "'editor_id'", 'to': "orm['auth.User']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'location': ('catmaid.fields.Double3DField', [], {}),
            'parent': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'children'", 'null': 'True', 'to': "orm['catmaid.Treenode']"}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'radius': ('django.db.models.fields.FloatField', [], {}),
            'review_time': ('django.db.models.fields.DateTimeField', [], {}),
            'reviewer_id': ('django.db.models.fields.IntegerField', [], {'default': '-1'}),
            'skeleton': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.treenodeclassinstance': {
            'Meta': {'object_name': 'TreenodeClassInstance', 'db_table': "'treenode_class_instance'"},
            'class_instance': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'treenode': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Treenode']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.treenodeconnector': {
            'Meta': {'object_name': 'TreenodeConnector', 'db_table': "'treenode_connector'"},
            'confidence': ('django.db.models.fields.IntegerField', [], {'default': '5'}),
            'connector': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Connector']"}),
            'creation_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'edition_time': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'project': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Project']"}),
            'relation': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Relation']"}),
            'skeleton': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.ClassInstance']"}),
            'treenode': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['catmaid.Treenode']"}),
            'user': ('django.db.models.fields.related.ForeignKey', [], {'to': "orm['auth.User']"})
        },
        'catmaid.userprofile': {
            'Meta': {'object_name': 'UserProfile'},
            'color': ('catmaid.fields.RGBAField', [], {'default': '(1.0, 0.06326473260249865, 0.9259908104182738, 1)'}),
            'display_stack_reference_lines': ('django.db.models.fields.BooleanField', [], {'default': 'True'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'independent_ontology_workspace_is_default': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'inverse_mouse_wheel': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_cropping_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_ontology_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_segmentation_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_tagging_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_text_label_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'show_tracing_tool': ('django.db.models.fields.BooleanField', [], {'default': 'False'}),
            'user': ('django.db.models.fields.related.OneToOneField', [], {'to': "orm['auth.User']", 'unique': 'True'})
        },
        'contenttypes.contenttype': {
            'Meta': {'ordering': "('name',)", 'unique_together': "(('app_label', 'model'),)", 'object_name': 'ContentType', 'db_table': "'django_content_type'"},
            'app_label': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'model': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '100'})
        },
        'taggit.tag': {
            'Meta': {'object_name': 'Tag'},
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'max_length': '100'}),
            'slug': ('django.db.models.fields.SlugField', [], {'unique': 'True', 'max_length': '100'})
        },
        'taggit.taggeditem': {
            'Meta': {'object_name': 'TaggedItem'},
            'content_type': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'taggit_taggeditem_tagged_items'", 'to': "orm['contenttypes.ContentType']"}),
            'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'object_id': ('django.db.models.fields.IntegerField', [], {'db_index': 'True'}),
            'tag': ('django.db.models.fields.related.ForeignKey', [], {'related_name': "'taggit_taggeditem_items'", 'to': "orm['taggit.Tag']"})
        }
    }

    complete_apps = ['catmaid']
