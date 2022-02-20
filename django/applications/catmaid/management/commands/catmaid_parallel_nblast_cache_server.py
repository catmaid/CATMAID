import logging
import math
import ujson
import msgpack
import psycopg2
import numpy as np
import os
import pickle

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection

from catmaid.control.nat.r import get_cached_dps_data_from_file, recv_timeout
from catmaid.util import str2bool

import socket
import os
from _thread import *

try:
    from rpy2.robjects.packages import importr
    from rpy2.rinterface_lib.embedded import RRuntimeError
    import rpy2.robjects as robjects
    import rpy2.rinterface as rinterface
    import rpy2.rlike.container as rlc
except ImportError:
    rnat_enaled = False


logger = logging.getLogger(__name__)


class Command(BaseCommand):
     help = "Start a small HTTP server to serve NBLAST cache files"

     def add_arguments(self, parser):
         parser.add_argument('--port', dest='port', type=int,
                 required=False, default=34565, help='The port to listen on')
         parser.add_argument('--host', dest='host', type=str,
                 required=False, default='127.0.0.1', help='The host to listen on')
         parser.add_argument("--cache-path", dest='cache_path', required=True,
                 help="The path of the cache file to load")

     def handle(self, *args, **options):
         serverSideSocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
         serverSideSocket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
         host = options['host']
         port = options['port']
         cache_path = options['cache_path']
         threadCount = 0

         logger.info(f'Loading cache file: {cache_path}')
         cache_data = get_cached_dps_data_from_file(cache_path)
         if not cache_data:
            return None
         logger.info(f'Cache data loaded, containing {len(cache_data)} entries')

         try:
             serverSideSocket.bind((host, port))
         except socket.error as e:
             logger.error(f'Socket error: {e}')
             return

         logger.info(f'Socket is listening on port {port}')

         base = importr('base')
         rnat = importr('nat')

         def multi_threaded_client(connection):
             while True:
                 data = recv_timeout(connection)
                 if not data:
                     break
                 object_ids = map(lambda x: x.strip(), data.decode('utf-8').split(','))
                 object_id_str = rinterface.StrSexpVector(list(map(str, object_ids)))
                 objects_dps = cache_data.rx(object_id_str)
                 non_na_ids = list(filter(lambda x: type(x) == str,
                         list(base.names(objects_dps))))
                 cache_typed_object_ids = non_na_ids
                 cache_objects_dps = rnat.subset_neuronlist(
                         objects_dps, rinterface.StrSexpVector(non_na_ids))

                 response = pickle.dumps(cache_objects_dps)
                 connection.sendall(response)
             connection.close()

         while True:
             serverSideSocket.listen(5)
             client, address = serverSideSocket.accept()
             logger.info(f'Connected to: {address[0]}: {address[1]}')
             start_new_thread(multi_threaded_client, (client, ))
             threadCount += 1
             logger.info(f'Thread Number: {threadCount}')

         serverSideSocket.close()
