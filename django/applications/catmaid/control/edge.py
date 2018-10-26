# -*- coding: utf-8 -*-
from django.db import connection, transaction
from catmaid.models import Project


def rebuild_edge_tables(project_ids=None, log=None):
    """Rebuild edge tables for all passed in project IDs. If no project IDs are
    passed in, all edge tables are rebuilt.
    """
    if not log:
        # Assign no-op function if no log function is passed in
        log = lambda x: None

    cursor = connection.cursor()

    with transaction.atomic():
        if project_ids:
            for project_id in project_ids:
                try:
                    project = Project.objects.get(pk=int(project_id))
                    cursor.execute("SELECT count(*) FROM treenode_edge WHERE project_id = %s",
                                   (project.id,))
                    num_existing_tn_edges = cursor.fetchone()[0]
                    cursor.execute("SELECT count(*) FROM treenode_connector_edge WHERE project_id = %s",
                                   (project.id,))
                    num_existing_c_edges = cursor.fetchone()[0]
                    cursor.execute("SELECT count(*) FROM connector_geom WHERE project_id = %s",
                                   (project.id,))
                    num_existing_c_geoms = cursor.fetchone()[0]
                    # Clear edge table
                    cursor.execute('DELETE FROM treenode_edge WHERE project_id = %s',
                                   (project_id,))
                    cursor.execute('DELETE FROM treenode_connector_edge WHERE project_id = %s',
                                   (project_id,))
                    cursor.execute('DELETE FROM connector_geom WHERE project_id = %s',
                                   (project_id,))
                    log('Deleted edge information for project "%s": '
                            '%s treenode edges, %s connector edges, %s connectors' % \
                            (project_id, num_existing_tn_edges, num_existing_c_edges, num_existing_c_geoms))

                    # Add edges of available treenodes
                    cursor.execute('''
                        INSERT INTO treenode_edge (id, project_id, edge) (
                            SELECT c.id, c.project_id, ST_MakeLine(
                            ST_MakePoint(c.location_x, c.location_y, c.location_z),
                            ST_MakePoint(p.location_x, p.location_y, p.location_z))
                            FROM treenode c JOIN treenode p ON c.parent_id = p.id
                            WHERE c.parent_id IS NOT NULL AND c.project_id = %s)''',
                        (project_id,))
                    # Add self referencing adges for all root nodes
                    cursor.execute('''
                        INSERT INTO treenode_edge (id, project_id, edge) (
                            SELECT r.id, r.project_id, ST_MakeLine(
                            ST_MakePoint(r.location_x, r.location_y, r.location_z),
                            ST_MakePoint(r.location_x, r.location_y, r.location_z))
                            FROM treenode r
                            WHERE r.parent_id IS NULL AND r.project_id = %s)''',
                        (project_id,))

                    # Add connector edge
                    cursor.execute('''
                        INSERT INTO treenode_connector_edge
                                SELECT
                                    tc.id,
                                    tc.project_id,
                                    ST_MakeLine(
                                        ST_MakePoint(t.location_x, t.location_y, t.location_z),
                                        ST_MakePoint(c.location_x, c.location_y, c.location_z))
                                FROM treenode_connector tc, treenode t, connector c
                                WHERE t.id = tc.treenode_id
                                  AND c.id = tc.connector_id
                                  AND tc.project_id = %s;
                    ''', (project_id,))

                    # Add connector geometries
                    cursor.execute('''
                            INSERT INTO connector_geom
                                SELECT
                                    c.id,
                                    c.project_id,
                                    ST_MakePoint(c.location_x, c.location_y, c.location_z)
                                FROM connector c
                                WHERE c.project_id = %s;
                    ''', (project_id,))

                    cursor.execute("SELECT count(*) FROM treenode_edge WHERE project_id = %s",
                                   (project.id,))
                    num_new_tn_edges = cursor.fetchone()[0]
                    cursor.execute("SELECT count(*) FROM treenode_connector_edge WHERE project_id = %s",
                                   (project.id,))
                    num_new_c_edges = cursor.fetchone()[0]
                    cursor.execute("SELECT count(*) FROM connector_geom WHERE project_id = %s",
                                   (project.id,))
                    num_new_c_geoms = cursor.fetchone()[0]

                    log('Created edge information for project "%s": '
                            '%s treenode edges, %s connector edges, %s connectors' % \
                            (project_id, num_new_tn_edges, num_new_c_edges, num_new_c_geoms))
                except Project.DoesNotExist:
                    raise CommandError('Project "%s" does not exist' % project_id)
        else:
            cursor.execute("SELECT count(*) FROM treenode_edge")
            num_existing_tn_edges = cursor.fetchone()[0]
            cursor.execute("SELECT count(*) FROM treenode_connector_edge")
            num_existing_c_edges = cursor.fetchone()[0]
            cursor.execute("SELECT count(*) FROM connector_geom")
            num_existing_c_geoms = cursor.fetchone()[0]
            # Clear edge table
            cursor.execute('TRUNCATE treenode_edge')
            cursor.execute('TRUNCATE treenode_connector_edge')
            cursor.execute('TRUNCATE connector_geom')

            log('Deleted edge information for all projects: '
                    '%s treenode edges, %s connector edges, %s connectors' % \
                    (num_existing_tn_edges, num_existing_c_edges, num_existing_c_geoms))

            # Add edges of available treenodes
            cursor.execute('''
                INSERT INTO treenode_edge (id, project_id, edge) (
                    SELECT c.id, c.project_id, ST_MakeLine(
                    ST_MakePoint(c.location_x, c.location_y, c.location_z),
                    ST_MakePoint(p.location_x, p.location_y, p.location_z))
                    FROM treenode c JOIN treenode p ON c.parent_id = p.id
                    WHERE c.parent_id IS NOT NULL)''')
            # Add self referencing adges for all root nodes
            cursor.execute('''
                INSERT INTO treenode_edge (id, project_id, edge) (
                    SELECT r.id, r.project_id, ST_MakeLine(
                    ST_MakePoint(r.location_x, r.location_y, r.location_z),
                    ST_MakePoint(r.location_x, r.location_y, r.location_z))
                    FROM treenode r
                    WHERE r.parent_id IS NULL)''')

            # Add connector edges
            cursor.execute('''
                INSERT INTO treenode_connector_edge
                        SELECT
                            tc.id,
                            tc.project_id,
                            ST_MakeLine(
                                ST_MakePoint(t.location_x, t.location_y, t.location_z),
                                ST_MakePoint(c.location_x, c.location_y, c.location_z))
                        FROM treenode_connector tc, treenode t, connector c
                        WHERE t.id = tc.treenode_id
                          AND c.id = tc.connector_id;
            ''')

            # Add connector geometries
            cursor.execute('''
                    TRUNCATE connector_geom;
                        INSERT INTO connector_geom
                            SELECT
                                c.id,
                                c.project_id,
                                ST_MakePoint(c.location_x, c.location_y, c.location_z)
                            FROM connector c;
            ''')

            cursor.execute("SELECT count(*) FROM treenode_edge")
            num_new_tn_edges = cursor.fetchone()[0]
            cursor.execute("SELECT count(*) FROM treenode_connector_edge")
            num_new_c_edges = cursor.fetchone()[0]
            cursor.execute("SELECT count(*) FROM connector_geom")
            num_new_c_geoms = cursor.fetchone()[0]

            log('Created edge information for all projects: '
                    '%s treenode edges, %s connector edges, %s connectors' % \
                    (num_new_tn_edges, num_new_c_edges, num_new_c_geoms))
