#!/usr/bin/env python
#
# Simple local Python 2/3 HTTP(S) server with CORS support. The fist argument is
# the port to listen on. The Server will try to use HTTPS if the path to a
# certificate is provided as second argument.
#
# To creae a local self-signed certificate, run e.g.:
# openssl req -new -x509 -keyout localhost.pem -out localhost.pem -days 24855 -nodes

import os, ssl, sys

try:
    # Python 3
    from http.server import HTTPServer, SimpleHTTPRequestHandler
except ImportError:
    # Python 2
    from BaseHTTPServer import HTTPServer
    from SimpleHTTPServer import SimpleHTTPRequestHandler


class CORSRequestHandler (SimpleHTTPRequestHandler):
    def end_headers (self):
        self.send_header('Access-Control-Allow-Origin', '*')
        SimpleHTTPRequestHandler.end_headers(self)


class Server(HTTPServer):
    """A simple HTTP server that serves the current working directory. It adds
    CORS headers and uses SSL if a certificate path is provided.
    """

    def __init__(self, server_address, handler, cert_path=None):
        super(HTTPServer, self).__init__(server_address, handler)
        if cert_path:
            self.socket = ssl.wrap_socket (self.socket,
                certfile=cert_path, server_side=True)

def main():
    cwd = os.getcwd()
    n_args = len(sys.argv)
    if n_args == 2:
        port = int(sys.argv[1])
        cert_path = None
        protocol = 'HTTP'
    elif n_args == 3:
        port = int(sys.argv[1])
        cert_path = sys.argv[2]
        protocol = 'HTTPS'
    else:
        print("Usage: {} <port> <cert-file>".format(__file__))
        return

    print("Starting {} server in folder {}".format(protocol, cwd))
    server = Server(('localhost', port), CORSRequestHandler, cert_path)
    server.serve_forever()


if __name__ == '__main__':
    main()
