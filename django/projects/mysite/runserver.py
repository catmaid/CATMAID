#!/usr/bin/env python

import os, sys
from django.core.handlers.wsgi import WSGIHandler
from gevent import wsgi, monkey
from socketio import SocketIOServer

# use gevent to patch the standard lib to get async support
monkey.patch_all()

def runserver():
    app_dir = os.path.abspath(os.path.dirname(__file__))
    sys.path.append(os.path.dirname(app_dir))
    os.environ['DJANGO_SETTINGS_MODULE'] = 'mysite.settings'
    #server = wsgi.WSGIServer(('', 8080), WSGIHandler(), spawn = None)
    server = SocketIOServer(('', 8080), WSGIHandler(), resource="socket.io")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.stop()
        sys.exit(0)

if __name__ == '__main__':
    runserver()
