from django.core.management.base import BaseCommand
from django.db import connection

from catmaid.control.edge import rebuild_edge_tables
from catmaid.control.stats import populate_stats_summary
from catmaid.control.node import update_node_query_cache
from catmaid.models import Project


class Command(BaseCommand):
    help = "Recreates all entries for the following tables, which act as " + \
           "materialized views: treenode_edge, treenode_connector_edge, " + \
           "connector_geom, catmaid_stats_summary, node_query_cache, " + \
           "catmaid_skeleton_summary"

    def handle(self, *args, **options):
        cursor = connection.cursor()
        projects = Project.objects.all()
        project_ids = [p.id for p in projects]

        self.stdout.write('Recreating treenode_edge, treenode_connector_edge, connector_geom')
        rebuild_edge_tables(log=lambda msg: self.stdout.write(msg))

        self.stdout.write('Recreating catmaid_stats_summary')
        cursor.execute("TRUNCATE catmaid_stats_summary")
        for p in projects:
            populate_stats_summary(p.id, False, False)

        self.stdout.write('Recreating catmaid_skeleton_summary')
        cursor.execute("""
            TRUNCATE catmaid_skeleton_summary;
            SELECT refresh_skeleton_summary_table();
        """)

        self.stdout.write('Recreating node_query_cache')
        update_node_query_cache(log=lambda x: self.stdout.write(x))

        self.stdout.write('Done')
