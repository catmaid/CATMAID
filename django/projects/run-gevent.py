#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Import gevent monkey and patch everything
from gevent import monkey
monkey.patch_all()

# Import the rest
from django.core.wsgi import get_wsgi_application
from gevent.wsgi import WSGIServer
import os, sys
import mysite.settings as settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mysite.settings")

# Configure host and port for the WSGI server
host = getattr(settings, 'WSGI_HOST', '127.0.0.1')
port = getattr(settings, 'WSGI_PORT', 8080)

def runserver():
    # Create the server
    application = get_wsgi_application()
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
