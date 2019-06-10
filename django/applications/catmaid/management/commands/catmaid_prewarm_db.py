import progressbar

from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Prewarm heavily used tables"

    tables_to_prewarm = [
        'auth_group',
        'auth_group_permissions',
        'auth_permission',
        'auth_user',
        'auth_user_groups',
        'auth_user_user_permissions',
        'authtoken_token',
        'django_admin_log',
        'django_content_type',
        'django_migrations',
        'django_site',
        'guardian_groupobjectpermission',
        'guardian_userobjectpermission',

        'class',
        'class_class',
        'class_instance',
        'class_instance_class_instance',
        'client_data',
        'client_datastore',
        'connector',
        'connector_class_instance',
        'data_view',
        'data_view_type',
        'location',
        'message',
        'node_grid_cache',
        'node_grid_cache_cell',
        'dirty_node_grid_cache_cell',
        'project',
        'project_stack',
        'relation',
        'relation_instance',
        'restriction',
        'review',
        'reviewer_whitelist',
        'stack',
        'stack_mirror',
        'stack_group_relation',
        'stack_group',
        'stack_group_class_instance',
        'stack_stack_group',
        'stack_class_instance',
        'suppressed_virtual_treenode',
        'treenode',
        'treenode_class_instance',
        'treenode_connector',
    ]

    def add_arguments(self, parser):
        parser.add_argument('--init', action="store_true", dest="init", default=False,
                            help="Create pg_prewarm extension before attempting to prewarm")

    def handle(self, *args, **options):
        cursor = connection.cursor()
        if options["init"]:
            # Make extension initialization optional
            cursor.execute("CREATE EXTENSION pg_prewarm")

        with progressbar.ProgressBar(max_value=len(self.tables_to_prewarm), redirect_stdout=True) as pbar:
            for i, tablename in enumerate(self.tables_to_prewarm):
                pbar.update(i)
                cursor.execute("SELECT pg_prewarm(%s)", [tablename])
