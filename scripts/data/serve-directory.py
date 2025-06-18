#!/usr/bin/env python

# Simple local Python 3 HTTP(S) server with CORS support. The first argument is
# the port to listen on. The Server will try to use HTTPS if the path to a
# certificate is provided as second argument. The third argument can now be a path
# to the n5 you want to serve (slight modification added for flexibility as the script now
# no longer needs to reside in the same folder as the n5).
#
# To creae a local self-signed certificate (localhost.pem) and a key file
# (localhost-key.pem), run the following:
# openssl req -new -x509 -keyout localhost-key.pem -out localhost.pem -days 24855 -nodes

#
# With these files in place, the server now be started in 3 ways:
# Option 1:
# python serve-directory.py 9999
# Option 2:
# python serve-directory.py 9999 localhost.pem
# Option 3:
# python serve-directory.py 9999 localhost.pem /path/to/n5/

import os
import ssl
import sys

try:
    # Python 3
    from http.server import HTTPServer, SimpleHTTPRequestHandler
except ImportError:
    # Python 2
    from BaseHTTPServer import HTTPServer
    from SimpleHTTPServer import SimpleHTTPRequestHandler


class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super(CORSRequestHandler, self).end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.end_headers()


class Server(HTTPServer):
    def __init__(self, server_address, handler, cert_path=None):
        super(Server, self).__init__(server_address, handler)
        if cert_path:
            if not os.path.isfile(cert_path):
                raise FileNotFoundError("Certificate file not found: {}".format(cert_path))

            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile=cert_path)
            self.socket = context.wrap_socket(self.socket, server_side=True)


def main():
    n_args = len(sys.argv)

    cert_path = None
    serve_dir = os.getcwd()

    if n_args == 2:
        port = int(sys.argv[1])
        protocol = 'HTTP'
    elif n_args == 3:
        port = int(sys.argv[1])
        cert_path = sys.argv[2]
        protocol = 'HTTPS'
    elif n_args == 4:
        port = int(sys.argv[1])
        cert_path = sys.argv[2]
        serve_dir = sys.argv[3]
        protocol = 'HTTPS'
    else:
        print("Usage:")
        print("  {} <port>".format(__file__))
        print("  {} <port> <cert-file>".format(__file__))
        print("  {} <port> <cert-file> <directory>".format(__file__))
        return

    os.chdir(serve_dir)
    print("Starting {} server in folder {}".format(protocol, serve_dir))

    sub_directories = [o for o in os.listdir(serve_dir)
                       if os.path.isdir(os.path.join(serve_dir, o))
                       and not o.startswith('.')]
    if not sub_directories:
        print("Warning: found no sub-directories to serve")
    else:
        if len(sub_directories) == 1:
            print(
                "The URL below should provide access to the folder '{}' and can be used in CATMAID as custom mirror.".format(
                    sub_directories[0]))
        else:
            print(
                "Multiple local directories are available. Below you will find a valid URL for each one that can be used in CATMAID as a custom mirror.")
        print('')
        for sd in sub_directories:
            print("https://localhost:{}/{}/".format(port, sd))
        print('')

    metadata_file = os.path.join(serve_dir, 'metadata.txt')
    if os.path.isfile(metadata_file):
        print(
            "A metadata file was found, which should provide additional information for the custom mirror setup in CATMAID")
        print('')
        try:
            with open(metadata_file, 'r') as f:
                print(f.read())
        except IOError:
            print("Could not read metadata file 'metadata.txt'")
        print('')

    server = Server(('localhost', port), CORSRequestHandler, cert_path)
    server.serve_forever()


if __name__ == '__main__':
    main()
