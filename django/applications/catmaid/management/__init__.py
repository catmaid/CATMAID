import os, sys
import catmaid.models

from south.signals import post_migrate
from django.db.models import signals
from django.db import connection, transaction
from catmaid.models import Project
from catmaid import models as catmaid_app
from catmaid.conf import settings as catmaid_settings


def init_classification(app, created_models, **kwargs):
    """ Creates a dummy project to store classification graphs in.
    """
    if app == catmaid.models:
        try:
            Project.objects.get(pk=catmaid_settings.ONTOLOGY_DUMMY_PROJECT_ID)
        except Project.DoesNotExist:
            print("Creating ontology dummy project")
            Project.objects.create(pk=catmaid_settings.ONTOLOGY_DUMMY_PROJECT_ID,
                title="Classification dummy project")


def load_custom_sql(app, verbosity, interactive, db, **kwargs):
    """ Connected to the post_migrate method to load custom SQL (usually
    functions) from the catmaid/sql dictionary. """
    if app == 'catmaid':
        file_path = os.path.dirname(os.path.abspath(__file__))
        path = os.path.abspath(os.path.join(file_path, os.pardir, 'sql'))
        if not os.path.exists(path):
            return
        # Collect all .sql files
        files = []
        for filename in os.listdir(path):
            file_path = os.path.join(path, filename)
            if os.path.isfile(file_path) and file_path.endswith('.sql'):
                files.append(file_path)
        # Load each file
        cursor = connection.cursor()
        for sql_file in files:
            try:
                print "Loading SQL data from '%s'" % sql_file
                f = open(sql_file)
                sql = f.read()
                f.close()
                cursor.execute(sql)
            except Exception, e:
                sys.stderr.write("Failed to install custom SQL file '%s': "
                                 "%s\n" % (sql_file, e))
                import traceback
                traceback.print_exc()
                transaction.rollback_unless_managed()
            else:
                transaction.commit_unless_managed()


signals.post_syncdb.connect(init_classification)
post_migrate.connect(load_custom_sql)
