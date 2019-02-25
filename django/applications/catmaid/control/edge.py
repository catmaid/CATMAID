# -*- coding: utf-8 -*-

from typing import List

from django.db import connection, transaction
from django.core.management.base import CommandError

from catmaid.models import Project

def rebuild_edge_tables(project_ids=None, log=None) -> None:
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
                    log('Deleted edge information for project "%s": ' \
                            '%s treenode edges, %s connector edges, %s connectors' % \
                            (project_id, num_existing_tn_edges, num_existing_c_edges, num_existing_c_geoms))

                    # Add edges of available treenodes, including self
                    # referencing edges for root nodes.
                    cursor.execute('''
                        INSERT INTO treenode_edge (id, project_id, edge) (
                            SELECT c.id, c.project_id, ST_MakeLine(
                            ST_MakePoint(c.location_x, c.location_y, c.location_z),
                            ST_MakePoint(p.location_x, p.location_y, p.location_z))
                        FROM treenode c
                        JOIN treenode p
                            ON c.parent_id = p.id OR (c.parent_id IS NULL AND c.id = p.id)
                        WHERE c.project_id = %s)''',
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

                    log('Created edge information for project "%s": ' \
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

            log('Deleted edge information for all projects: ' \
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

            log('Created edge information for all projects: ' \
                    '%s treenode edges, %s connector edges, %s connectors' % \
                    (num_new_tn_edges, num_new_c_edges, num_new_c_geoms))

def rebuild_edges_selectively(skeleton_ids, connector_ids=[], log=None) -> None:
    """Rebuild edge table entries for all passed in skeleton IDs.
    """
    if not skeleton_ids and not connector_ids:
        raise ValueError("Need at least one skeleton ID or one connector ID")

    if not log:
        # Assign no-op function if no log function is passed in
        log = lambda x: None

    cursor = connection.cursor()

    with transaction.atomic():
        num_existing_tn_edges = 0
        num_existing_c_edges = 0
        num_existing_c_geoms = 0

        if skeleton_ids:
            cursor.execute("""
                SELECT count(*)
                FROM treenode_edge te
                JOIN treenode t
                    ON t.id = te.id
                JOIN UNNEST(%(skeleton_ids)s::bigint[]) q(skeleton_id)
                    ON q.skeleton_id = t.skeleton_id
            """, {
                'skeleton_ids': skeleton_ids,
            })
            num_existing_tn_edges += cursor.fetchone()[0]
            cursor.execute("""
                SELECT count(*)
                FROM treenode_connector_edge tce
                JOIN treenode_connector tc
                    ON tc.id = tce.id
                JOIN UNNEST(%(skeleton_ids)s::bigint[]) q(skeleton_id)
                    ON q.skeleton_id = tc.skeleton_id
            """, {
                'skeleton_ids': skeleton_ids,
            })
            num_existing_c_edges += cursor.fetchone()[0]

        if connector_ids:
            cursor.execute("""
                SELECT count(*)
                FROM connector_geom cg
                JOIN UNNEST(%(connector_ids)s::bigint[]) q(connector_id)
                    ON q.connector_id = cg.id
            """, {
                'connector_ids': connector_ids,
            })
            num_existing_c_geoms += cursor.fetchone()[0]
            cursor.execute("""
                SELECT count(*)
                FROM treenode_connector_edge tce
                JOIN treenode_connector tc
                    ON tc.id = tce.id
                JOIN UNNEST(%(connector_ids)s::bigint[]) q(connector_id)
                    ON q.connector_id = tc.connector_id
            """, {
                'connector_ids': connector_ids,
            })
            num_existing_c_edges += cursor.fetchone()[0]

        # Clear edge table
        if skeleton_ids:
            cursor.execute("""
                DELETE FROM treenode_edge te
                USING treenode AS t,
                    UNNEST(%(skeleton_ids)s::bigint[]) q(skeleton_id)
                WHERE te.id = t.id
                    AND t.skeleton_id = q.skeleton_id
            """, {
                'skeleton_ids': skeleton_ids,
            })
            cursor.execute("""
                DELETE FROM treenode_connector_edge tce
                USING treenode_connector AS tc,
                    UNNEST(%(skeleton_ids)s::bigint[]) q(skeleton_id)
                WHERE tce.id = tc.id
                    AND tc.skeleton_id = q.skeleton_id
            """, {
                'skeleton_ids': skeleton_ids,
            })
        if connector_ids:
            cursor.execute("""
                DELETE FROM treenode_connector_edge tce
                USING treenode_connector AS tc,
                    UNNEST(%(connector_ids)s::bigint[]) q(connector_id)
                WHERE tce.id = tc.id
                    AND tc.connector_id = q.connector_id
            """, {
                'connector_ids': connector_ids,
            })
            cursor.execute("""
                DELETE FROM connector_geom cg
                USING connector AS c,
                    UNNEST(%(connector_ids)s::bigint[]) q(connector_id)
                WHERE cg.id = c.id
                    AND c.id = q.connector_id
            """, {
                'connector_ids': connector_ids,
            })

        log('Deleted edge information: ' \
                '%s treenode edges, %s connector edges, %s connectors' % \
                (num_existing_tn_edges, num_existing_c_edges, num_existing_c_geoms))

        # Add edges of available treenodes, including self-referencing edges
        # for all root nodes.
        if skeleton_ids:
            cursor.execute('''
                INSERT INTO treenode_edge (id, project_id, edge) (
                    SELECT c.id, c.project_id, ST_MakeLine(
                        ST_MakePoint(c.location_x, c.location_y, c.location_z),
                        ST_MakePoint(p.location_x, p.location_y, p.location_z))
                    FROM treenode c
                    JOIN treenode p
                        ON c.parent_id = p.id OR (c.parent_id IS NULL AND c.id = p.id)
                    JOIN UNNEST(%(skeleton_ids)s::bigint[]) q(skeleton_id)
                        ON q.skeleton_id = c.skeleton_id
                )
            ''', {
                'skeleton_ids': skeleton_ids,
            })

            # Add connector edge
            cursor.execute('''
                INSERT INTO treenode_connector_edge
                SELECT
                    tc.id,
                    tc.project_id,
                    ST_MakeLine(
                        ST_MakePoint(t.location_x, t.location_y, t.location_z),
                        ST_MakePoint(c.location_x, c.location_y, c.location_z))
                FROM treenode_connector tc, treenode t, connector c,
                    UNNEST(%(skeleton_ids)s::bigint[]) q(skeleton_id)
                WHERE q.skeleton_id = tc.skeleton_id
                    AND t.id = tc.treenode_id
                    AND c.id = tc.connector_id
            ''', {
                'skeleton_ids': skeleton_ids,
            })

        if connector_ids:
            # Add connector edge
            cursor.execute('''
                INSERT INTO treenode_connector_edge
                SELECT
                    tc.id,
                    tc.project_id,
                    ST_MakeLine(
                        ST_MakePoint(t.location_x, t.location_y, t.location_z),
                        ST_MakePoint(c.location_x, c.location_y, c.location_z))
                FROM treenode_connector tc, treenode t, connector c,
                    UNNEST(%(connector_ids)s::bigint[]) q(connector_id)
                WHERE q.connector_id = tc.connector_id
                    AND t.id = tc.treenode_id
                    AND c.id = tc.connector_id
                -- This value might exist already if it has been added through a connected skeleton
                ON CONFLICT DO NOTHING
            ''', {
                'connector_ids': connector_ids,
            })
            # Add connector geometries
            cursor.execute('''
                INSERT INTO connector_geom
                SELECT
                    c.id,
                    c.project_id,
                    ST_MakePoint(c.location_x, c.location_y, c.location_z)
                FROM connector c,
                    UNNEST(%(connector_ids)s::bigint[]) q(connector_id)
                WHERE c.id = q.connector_id
            ''', {
                'connector_ids': connector_ids,
            })

        num_new_tn_edges = 0
        num_new_c_edges = 0
        num_new_c_geoms = 0

        if skeleton_ids:
            cursor.execute("""
                SELECT count(*)
                FROM treenode_edge te
                JOIN treenode t
                    ON t.id = te.id
                JOIN UNNEST(%(skeleton_ids)s::bigint[]) q(skeleton_id)
                    ON q.skeleton_id = t.skeleton_id
            """, {
                'skeleton_ids': skeleton_ids,
            })
            num_new_tn_edges += cursor.fetchone()[0]
            cursor.execute("""
                SELECT count(*)
                FROM treenode_connector_edge tce
                JOIN treenode_connector tc
                    ON tc.id = tce.id
                JOIN UNNEST(%(skeleton_ids)s::bigint[]) q(skeleton_id)
                    ON q.skeleton_id = tc.skeleton_id
            """, {
                'skeleton_ids': skeleton_ids,
            })
            num_new_c_edges += cursor.fetchone()[0]

        if connector_ids:
            cursor.execute("""
                SELECT count(*)
                FROM connector_geom cg
                JOIN UNNEST(%(connector_ids)s::bigint[]) q(connector_id)
                    ON q.connector_id = cg.id
            """, {
                'connector_ids': connector_ids,
            })
            num_new_c_geoms += cursor.fetchone()[0]
            cursor.execute("""
                SELECT count(*)
                FROM treenode_connector_edge tce
                JOIN treenode_connector tc
                    ON tc.id = tce.id
                JOIN UNNEST(%(connector_ids)s::bigint[]) q(connector_id)
                    ON q.connector_id = tc.connector_id
            """, {
                'connector_ids': connector_ids,
            })
            num_new_c_edges += cursor.fetchone()[0]

        log('Created the following materializations": ' \
                '%s treenode edges, %s connector edges, %s connectors' % \
                (num_new_tn_edges, num_new_c_edges, num_new_c_geoms))

def get_intersected_grid_cells(p1, p2, cell_width, cell_height, cell_depth,
       p1_cell=None, p2_cell=None) -> List[List]:
    if not p1_cell:
        p1_cell = [
            int(p1[0] // cell_width),
            int(p1[1] // cell_height),
            int(p1[2] // cell_depth),
        ]
    if not p2_cell:
        p2_cell = [
            int(p2[0] // cell_width),
            int(p2[1] // cell_height),
            int(p2[2] // cell_depth),
        ]

    start_x, start_y, start_z = 0.0, 0.0, 0.0
    pos_x, pos_y, pos_z = p1[0], p1[1], p1[2]
    dir_x = p2[0] - p1[0]
    dir_y = p2[1] - p1[1]
    dir_z = p2[2] - p1[2]

    current_cell_x, current_cell_y, current_cell_z = p1_cell

    if dir_x > 0.0:
        step_x = 1;
        next_cell_x = start_x + (p1_cell[0] + 1) * cell_width
    else:
        step_x = -1;
        next_cell_x = start_x + p1_cell[0] * cell_width

    if dir_y > 0.0:
        step_y = 1;
        next_cell_y = start_y + (p1_cell[1] + 1) * cell_height
    else:
        step_y = -1;
        next_cell_y = start_y + p1_cell[1] * cell_height

    if dir_z > 0.0:
        step_z = 1;
        next_cell_z = start_z + (p1_cell[2] + 1) * cell_depth
    else:
        step_z = -1;
        next_cell_z = start_z + p1_cell[2] * cell_depth

    if dir_x != 0.0:
        inv_dir_x = 1.0 / dir_x
        t_max_x = (next_cell_x - pos_x)  * inv_dir_x
        t_delta_x = cell_width * step_x * inv_dir_x
    else:
        t_max_x = float('inf')
        t_delta_x = float('inf')

    if dir_y != 0.0:
        inv_dir_y = 1.0 / dir_y
        t_max_y = (next_cell_y - pos_y)  * inv_dir_y
        t_delta_y = cell_height * step_y * inv_dir_y
    else:
        t_max_y = float('inf')
        t_delta_y = float('inf')

    if dir_z != 0.0:
        inv_dir_z = 1.0 / dir_z
        t_max_z = (next_cell_z - pos_z)  * inv_dir_z
        t_delta_z = cell_depth * step_z * inv_dir_z
    else:
        t_max_z = float('inf')
        t_delta_z = float('inf')

    # Find cell indices
    cells = []
    while True:
        cells.append([current_cell_x, current_cell_y, current_cell_z])
        # If we reached the target cell, stop
        if current_cell_x == p2_cell[0] and current_cell_y == p2_cell[1] \
                and current_cell_z == p2_cell[2]:
            break
        # Find next cell
        if abs(t_max_x - t_max_y) < 0.00001 or t_max_x == t_max_y:
            if abs(t_max_x - t_max_z) < 0.00001 or t_max_x == t_max_z:
                current_cell_x += step_x
                current_cell_y += step_y
                current_cell_z += step_z
                t_max_x += t_delta_x
                t_max_y += t_delta_y
                t_max_z += t_delta_z
            elif t_max_x < t_max_z:
                current_cell_x += step_x
                current_cell_y += step_y
                t_max_x += t_delta_x
                t_max_y += t_delta_y
            else:
                current_cell_z += step_z
                t_max_z += t_delta_z
        elif t_max_x < t_max_y:
            if abs(t_max_x - t_max_z) < 0.00001 or t_max_x == t_max_z:
                current_cell_x += step_x
                current_cell_z += step_z
                t_max_x += t_delta_x
                t_max_z += t_delta_z
            elif t_max_x < t_max_z:
                current_cell_x += step_x
                t_max_x += t_delta_x
            else:
                current_cell_z += step_z
                t_max_z += t_delta_z
        else:
            if abs(t_max_y - t_max_z) < 0.00001 or t_max_y == t_max_z:
                current_cell_y += step_y
                current_cell_z += step_z
                t_max_y += t_delta_y
                t_max_z += t_delta_z
            elif t_max_y < t_max_z:
                current_cell_y += step_y
                t_max_y += t_delta_y
            else:
                current_cell_z += step_z
                t_max_z += t_delta_z

    return cells
