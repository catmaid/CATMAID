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
        GridCachedNodeProvider, Postgis3dNodeProvider, update_grid_cell)
from catmaid.models import NodeGridCache, DirtyNodeGridCacheCell
from catmaid.util import str2bool


logger = logging.getLogger(__name__)


class GridWorker():

    def __init__(self):
        pass

    def update(self, updates, cursor):
        """Pop the oldest item from the diry cell table, compute the respective
        FOV and update the cache cell.
        """
        # Get all referenced grids along with their project IDs and node
        # constraints: n_last_edited_skeletons_limit,
        # n_last_edited_skeletons_limit, hidden_last_editor_id
        referenced_grid_ids = set(u['grid_id'] for u in updates)
        grids = NodeGridCache.objects.filter(pk__in=referenced_grid_ids)
        grid_map = dict((g.id, g) for g in grids)

        provider = Postgis3dNodeProvider()
        cursor = connection.cursor()

        # Batch of grids to update during one run
        updated_cells = 0
        for update in updates:
            g = grid_map[update['grid_id']]
            w_i, h_i, d_i = update['x'], update['y'], update['z']

            params = {
                'project_id': g.project_id,
                'limit': settings.NODE_LIST_MAXIMUM_COUNT,
            }
            if g.n_last_edited_skeletons_limit:
                params['n_largest_skeletons_limit'] = int(g.n_largest_skeletons_limit)
            if g.n_last_edited_skeletons_limit:
                params['n_last_edited_skeletons_limit'] = int(g.n_last_edited_skeletons_limit)
            if g.hidden_last_editor_id:
                params['hidden_last_editor_id'] = int(g.hidden_last_editor_id)

            added = update_grid_cell(g.project_id, g.id, w_i, h_i, d_i,
                    g.cell_width, g.cell_height, g.cell_depth, provider,
                    params, g.allow_empty, g.n_lod_levels, g.lod_min_bucket_size,
                    g.lod_strategy, g.has_json_data, g.has_json_text_data,
                    g.has_msgpack_data, cursor)

            if added:
                updated_cells += 1

                # TODO: delete in batches
                DirtyNodeGridCacheCell.objects.get(grid_id=g.id, x_index=w_i,
                        y_index=h_i, z_index=d_i).delete()

        logger.debug('Updated {} grid cell(s) in {} grid cache(s)'.format(
            updated_cells, len(referenced_grid_ids)))


class Command(BaseCommand):
    help = ""
    # The queue to process. Subclass and set this.
    queue = [] # type: List
    notify_channel = "catmaid.dirty-cache"

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
