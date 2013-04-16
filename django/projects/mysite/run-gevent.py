#!/usr/bin/env python

# Import gevent monkey and patch everything
from gevent import monkey
monkey.patch_all(httplib=True)

# Import the rest
from django.core.handlers.wsgi import WSGIHandler as DjangoWSGIApp
from django.core.management import setup_environ
from gevent.wsgi import WSGIServer
import sys
import settings

setup_environ(settings)

def runserver():
    # Create the server
    application = DjangoWSGIApp()
    address = "127.0.0.1", 8080
    server = WSGIServer( address, application )
    # Run the server
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.stop()
        sys.exit(0)

if __name__ == '__main__':
    runserver()
