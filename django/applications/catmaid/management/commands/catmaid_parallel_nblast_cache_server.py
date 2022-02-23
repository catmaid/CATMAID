import logging
import math
import ujson
import msgpack
import psycopg2
import numpy as np
import os
import pickle
import struct
import selectors
import types

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from django.db import connection

from catmaid.control.nat.r import get_cached_dps_data_from_file, recv_timeout, recvall
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
sel = selectors.DefaultSelector()


class Command(BaseCommand):
     help = "Start a small HTTP server to serve NBLAST cache files"

     def add_arguments(self, parser):
         parser.add_argument('--port', dest='port', type=int,
                 required=False, default=34565, help='The port to listen on')
         parser.add_argument('--host', dest='host', type=str,
                 required=False, default='', help='The host to listen on')
         parser.add_argument("--cache-path", dest='cache_path', required=True,
                 help="The path of the cache file to load")

     def handle(self, *args, **options):
         serverSideSocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
         # Allow immediate reuse of listening port
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

         serverSideSocket.listen(5)
         serverSideSocket.setblocking(False)
         sel.register(serverSideSocket, selectors.EVENT_READ, data=None)

         def accept_wrapper(sock):
             conn, addr = sock.accept()  # Should be ready to read
             logger.info(f"Accepted connection from {addr}")
             conn.setblocking(False)
             data = types.SimpleNamespace(addr=addr, inb=b"", outb=b"",
                     inlength=None, outlength=None, request=None,
                     response_created=False)
             events = selectors.EVENT_READ | selectors.EVENT_WRITE
             sel.register(conn, events, data=data)

         def service_connection(key, mask):
             sock = key.fileobj
             data = key.data
             if mask & selectors.EVENT_READ:
                 try:
                     buf = sock.recv(4096)
                 except BlockingIOError:
                     # Resource temporarily unavailable (errno EWOULDBLOCK)
                     pass
                 else:
                     if buf:
                         data.inb += buf
                     else:
                         logger.info('Peer disconnected')
                         sel.unregister(sock)
                         sock.close()

                 # Read header (data length) and move remainder to input buffer
                 if data.inlength is None:
                     header_size = struct.calcsize('!I')
                     if len(data.inb) >= header_size:
                         data.inlength, = struct.unpack('!I', data.inb[:header_size])
                         data.inb = data.inb[header_size:]

                 # If complete input has been read, finalize input buffer.
                 if data.inlength is not None:
                    if len(data.inb) >= data.inlength:
                        buf = data.inb[:data.inlength]
                        data.inb = data.inb[data.inlength:]
                        data.request = pickle.loads(buf)

             if mask & selectors.EVENT_WRITE:
                 if data.request:
                     if not data.response_created:
                          logger.info(f'Creating response data for request of {len(data.request)} objects')
                          # Create response
                          object_id_str = rinterface.StrSexpVector(list(map(str, data.request)))
                          objects_dps = cache_data.rx(object_id_str)
                          non_na_ids = list(filter(lambda x: type(x) == str,
                                  list(base.names(objects_dps))))
                          cache_typed_object_ids = non_na_ids
                          cache_objects_dps = rnat.subset_neuronlist(
                                  objects_dps, rinterface.StrSexpVector(non_na_ids))

                          response_data = pickle.dumps(cache_objects_dps)
                          # Prefix with a 4-bytet length in network byte order
                          data_size = struct.pack('!I', len(response_data))

                          data.outb += data_size
                          data.outb += response_data
                          data.response_created = True
                          logger.info(f'Created response of size {len(response_data)}')

                     if data.outb:
                         try:
                             # Should be ready to write
                             sent = sock.send(data.outb)
                         except BlockingIOError:
                             # Resource temporarily unavailable (errno EWOULDBLOCK)
                             pass
                         else:
                             data.outb = data.outb[sent:]
                             # Close when the buffer is drained. The response has been sent.
                             if sent and not data.outb:
                                 sel.unregister(sock)
                                 sock.close()

         try:
             while True:
                  events = sel.select(timeout=60)
                  for key, mask in events:
                      if key.data is None:
                          accept_wrapper(key.fileobj)
                      else:
                          service_connection(key, mask)
         except KeyboardInterrupt:
             logger.info('Keyboard interrupt received')
         finally:
             serverSideSocket.close()
             logger.info('Stopping server')
