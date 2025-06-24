#!/usr/bin/env python

# Simple local Python 3 HTTP(S) server with CORS support. The first argument is
# the port to listen on. To enable HTTPS, provide the path to a certificate
# file and a key file. A fourth argument can be a path to the directory
# you want to serve.
#
# To create a local self-signed certificate (localhost.pem) and a key file
# (localhost-key.pem), run the following:
# openssl req -new -x509 -keyout localhost-key.pem -out localhost.pem -days 24855 -nodes
#
# With these files in place, the server can now be started in multiple ways:
# Option 1 (HTTP):
# python serve-directory.py 9999
# Option 2 (HTTPS):
# python serve-directory.py 9999 localhost.pem localhost-key.pem
# Option 3 (HTTPS with specific directory):
# python serve-directory.py 9999 localhost.pem localhost-key.pem /path/to/n5/

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
    def __init__(self, server_address, handler, cert_path=None, key_path=None):
        super(Server, self).__init__(server_address, handler)
        if cert_path and key_path:
            if not os.path.isfile(cert_path):
                raise FileNotFoundError("Certificate file not found: {}".format(cert_path))
            if not os.path.isfile(key_path):
                raise FileNotFoundError("Key file not found: {}".format(key_path))

            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile=cert_path, keyfile=key_path)
            self.socket = context.wrap_socket(self.socket, server_side=True)


def main():
    n_args = len(sys.argv)

    cert_path = None
    key_path = None
    serve_dir = os.getcwd()

    if n_args == 2:
        port = int(sys.argv[1])
        protocol = 'HTTP'
    elif n_args == 4:
        port = int(sys.argv[1])
        cert_path = sys.argv[2]
        key_path = sys.argv[3]
        protocol = 'HTTPS'
    elif n_args == 5:
        port = int(sys.argv[1])
        cert_path = sys.argv[2]
        key_path = sys.argv[3]
        serve_dir = sys.argv[4]
        protocol = 'HTTPS'
    else:
        print("Usage:")
        print("  {} <port>".format(__file__))
        print("  {} <port> <cert-file> <key-file>".format(__file__))
        print("  {} <port> <cert-file> <key-file> <directory>".format(__file__))
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

    server = Server(('localhost', port), CORSRequestHandler, cert_path, key_path)
    server.serve_forever()


if __name__ == '__main__':
    main()
