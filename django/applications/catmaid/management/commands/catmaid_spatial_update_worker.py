from collections import defaultdict
import json
import logging
import select
import signal
import time
from typing import Dict, List, Set


from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection

from catmaid.control.edge import get_intersected_grid_cells
from catmaid.control.node import (get_configured_node_providers,
        GridCachedNodeProvider)
from catmaid.models import NodeGridCache
from catmaid.util import str2bool


logger = logging.getLogger(__name__)


class GridWorker():

    def __init__(self):
        # Keep a reference to all enabled grid caches
        enabled_node_providers = get_configured_node_providers(
                settings.NODE_PROVIDERS, enabled_only=True)

        enabled_grid_cache_providers = list(filter(lambda x: isinstance(x,
                GridCachedNodeProvider), enabled_node_providers))

        # Keep track of received events
        self.updatesReceived = 0
        self.cellsMarkedDirty = 0

        if enabled_grid_cache_providers:
            logger.info("Found {} enabled grid cache provider(s)".format(len(enabled_grid_cache_providers)))
        else:
            logger.info("Could not find any enabled grid cache provider")

        # Find a grid cache for each provider and make sure each cache is only
        # referenced onece
        self.grid_caches = [] # type: List
        for provider in enabled_grid_cache_providers:
            # If a particular cache is referenced explicitly, use it if it is
            # enabled.
            if provider.cache_id is not None:
                grid_cache = NodeGridCache.get(pk=provider.cache_id,
                        enabled=True)
                if grid_cache:
                    self.grid_caches.append(grid_cache)
            # Without an explicit ID, get all enabled grid caches
            else:
                enabled_grid_caches = list(NodeGridCache.objects.filter(enabled=True))
                self.grid_caches.extend(enabled_grid_caches)

    def update(self, updates, cursor):
        """ We want regular node queries to be able to tell whether a particular
        cache segment is valid. Therefore we queue a new dirty cell entry and
        send another notify(). Queue entries are then processed by a set of
        different workers. To do this, get all the enabled grid caches for each
        project and then, for each notification compute the insected grid
        indices with each grid, update existing grids and create missing ones.
        """
        # Batch of grids to update during one run
        grid_coords_to_update = {} # type: Dict
        for update in updates:
            self.updatesReceived += 1
            self.get_intersected_grid_cell_ids(update,
                    cursor, create=True, grid_coords_to_update=grid_coords_to_update)

        dirty_rows = set() # type: Set
        for grid_id, coords in grid_coords_to_update.items():
            for c in coords:
                self.cellsMarkedDirty += 1
                key = "({},{},{},{})".format(grid_id, c[0], c[1], c[2])
                if key not in dirty_rows:
                    dirty_rows.add(key)

        if dirty_rows:
            # Mark cells as dirty
            cursor.execute("""
                INSERT INTO dirty_node_grid_cache_cell (grid_id, x_index, y_index, z_index)
                VALUES {data}
                ON CONFLICT (grid_id, x_index, y_index, z_index)
                DO UPDATE SET invalidation_time = EXCLUDED.invalidation_time
            """.format(data=','.join(dirty_rows)))

            logger.debug('Marked {} grid cells as dirty and queued update'.format(
                len(dirty_rows)))

    def append_cells_to_update(self, coords_to_update, p1, p2, cell_width,
            cell_height, cell_depth):

        # Find intersecting grid cell indices for each cache and create
        # the ones that aren't there yet.
        p1_cell = [
            int(p1[0] // cell_width),
            int(p1[1] // cell_height),
            int(p1[2] // cell_depth),
        ]

        p2_cell = [
            int(p2[0] // cell_width),
            int(p2[1] // cell_height),
            int(p2[2] // cell_depth),
        ]

        n_cells = [
            abs(p2_cell[0] - p1_cell[0]) + 1,
            abs(p2_cell[1] - p1_cell[1]) + 1,
            abs(p2_cell[2] - p1_cell[2]) + 1,
        ]

        n_cells_total = n_cells[0] * n_cells[1] * n_cells[2]
        if n_cells_total == 1:
            # Common case, only one cell is changed.
            coords_to_update.append(p1_cell)
        else:
            # Find all intersecting cells in this grid.
            coords_to_update.extend(get_intersected_grid_cells(p1,
                p2, cell_width, cell_height, cell_depth, p1_cell, p2_cell))

    def get_intersected_grid_cell_ids(self, data, cursor, create=True,
            grid_coords_to_update=dict()):
        """Iterate over all known enabled grid caches and find all intersected
        cells.
        """
        data_type = data['type']
        # Find all cells to update in each enabled grid
        for grid_cache in self.grid_caches:
            grid_id = grid_cache.id
            coords_to_update = grid_coords_to_update.get(grid_id)
            if not coords_to_update:
                coords_to_update = []
                grid_coords_to_update[grid_id] = coords_to_update
            cell_width = grid_cache.cell_width
            cell_height = grid_cache.cell_height
            cell_depth = grid_cache.cell_depth
            if data_type == 'edge':
                p1 = data['p1']
                p2 = data['p2']
                self.append_cells_to_update(coords_to_update, p1, p2,
                        cell_width, cell_height, cell_depth)
            elif data_type == 'edges':
                # Format: {"project_id": 1, "type": "edges", "edges": [
                #    [[595708,418558,40000], [608508,418558,40000]],
                #    [[595708,418558,40000], [608508,418558,40000]]]}
                edge_1 = data['edges'][0]
                edge_2 = data['edges'][1]
                self.append_cells_to_update(coords_to_update, edge_1[0], edge_1[1],
                        cell_width, cell_height, cell_depth)
                self.append_cells_to_update(coords_to_update, edge_2[0], edge_2[1],
                        cell_width, cell_height, cell_depth)
            elif data_type == 'point':
                p = data['p']
                coords_to_update.append([
                    int(p[0] // cell_width),
                    int(p[1] // cell_height),
                    int(p[2] // cell_depth),
                ])
            else:
                logger.error("Unknown data type: {}".format(data_type))

        return grid_coords_to_update


class Command(BaseCommand):
    help = ""
    # The queue to process. Subclass and set this.
    queue = [] # type: List
    notify_channel = "catmaid.spatial-update"

    def add_arguments(self, parser):
        parser.add_argument(
            '--delay',
            type=float,
            default=1,
            help="The number of seconds to wait to check for new tasks.",
        )
        parser.add_argument("--grid-cache", type=str2bool, nargs='?',
                const=True, default=True, help="Update spatial grid caches.")

    def handle(self, **options):
        self._shutdown = False
        self._in_task = False
        self.delay = options['delay']
        self.grid_cache_update = options['grid_cache']

        self.workers = [] # type: List

        if options['grid_cache']:
            self.workers.append(GridWorker())

        if not self.workers:
            logger.warn("No grids provided")
            return

        self.listen()

        try:
            # Handle the signals for warm shutdown.
            signal.signal(signal.SIGINT, self.handle_shutdown)
            signal.signal(signal.SIGTERM, self.handle_shutdown)

            while True:
                self.wait_and_queue()
        except InterruptedError:
            # got shutdown signal
            pass

    def handle_shutdown(self, sig, frame):
        if self._in_task:
            logger.info('Waiting for active tasks to finish...')
            self._shutdown = True
        else:
            raise InterruptedError

    def listen(self):
        with connection.cursor() as cur:
            cur.execute('LISTEN "{}"'.format(self.notify_channel))


    def filter_notifies(self):
        notifies = [
            i for i in connection.connection.notifies
            if i.channel == self.notify_channel
        ]
        connection.connection.notifies = [
            i for i in connection.connection.notifies
            if i.channel != self.notify_channel
        ]
        return notifies


    def wait(self):
        connection.connection.poll()
        notifies = self.filter_notifies()
        if notifies:
            return notifies

        select.select([connection.connection], [], [], self.delay)
        connection.connection.poll()
        notifies = self.filter_notifies()
        count = len(self.filter_notifies())
        logger.debug('Woke up with %s NOTIFYs.', count)
        return notifies

    def wait_and_queue(self):
        notifications = self.wait()
        if notifications:
            cursor = connection.cursor()

            updates = []
            for n in notifications:
                try:
                    data = json.loads(n.payload)
                    updates.append(data)
                except json.decoder.JSONDecodeError:
                    logger.warn('Could not parse Postgres NOTIFY message: {}'.format(n.payload))
                    continue

            for worker in self.workers:
                worker.update(updates, cursor)
