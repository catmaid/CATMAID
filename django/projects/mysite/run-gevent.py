#!/usr/bin/env python

# Import gevent monkey and patch everything
from gevent import monkey
monkey.patch_all()

# Import the rest
from django.core.handlers.wsgi import WSGIHandler as DjangoWSGIApp
from gevent.wsgi import WSGIServer
import os, sys
import settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")

# Configure host and port for the WSGI server
host = getattr(settings, 'WSGI_HOST', '127.0.0.1')
port = getattr(settings, 'WSGI_PORT', 8080)

def runserver():
    # Create the server
    application = DjangoWSGIApp()
    address = host, port
    server = WSGIServer( address, application )
    # Run the server
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.stop()
        sys.exit(0)

if __name__ == '__main__':
    runserver()
