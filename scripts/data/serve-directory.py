#!/usr/bin/env python
#
# Simple local Python 3 HTTP(S) server with CORS support. The fist argument is
# the port to listen on. The Server will try to use HTTPS if the path to a
# certificate is provided as second argument.
#
# To creae a local self-signed certificate (localhost.pem) and a key file
# (localhost-key.pem), run the following:
# openssl req -new -x509 -keyout localhost-key.pem -out localhost.pem -days 24855 -nodes
#
# With these files in place, the server can be started like this:
# python serve-directory.py 9999 localhost.pem localhost-key.pem

import os, ssl, sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class CORSRequestHandler (SimpleHTTPRequestHandler):
    def end_headers (self):
        self.send_header('Access-Control-Allow-Origin', '*')
        SimpleHTTPRequestHandler.end_headers(self)


class Server(HTTPServer, object):
    """A simple HTTP server that serves the current working directory. It adds
    CORS headers and uses SSL if a certificate path is provided.
    """

    def __init__(self, server_address, handler, cert_path=None, key_path=None):
        super(Server, self).__init__(server_address, handler)
        if cert_path and key_path:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(cert_path, keyfile=key_path)
            context.check_hostname = False
            self.socket = context.wrap_socket(self.socket, server_side=True)

def main():
    cwd = os.getcwd()
    n_args = len(sys.argv)
    if n_args == 2:
        port = int(sys.argv[1])
        cert_path = None
        key_path = None
        protocol = 'HTTP'
    elif n_args == 4:
        port = int(sys.argv[1])
        cert_path = sys.argv[2]
        key_path = sys.argv[3]
        protocol = 'HTTPS'
    else:
        print("Usage: {} <port> <cert-file> <key-file>".format(__file__))
        return

    print("Starting {} server in folder {}".format(protocol, cwd))

    # Print URL to each folder in the directory
    sub_directories = [o for o in os.listdir(cwd)
                       if os.path.isdir(os.path.join(cwd, o))
                       and not o.startswith('.')]
    if not sub_directories:
        print("Warning: found no sub-directories to serve")
    else:
        if len(sub_directories) == 1:
            print("The URL below should provide access to the folder " +
                  "'{}' and can be used in CATMAID as custom mirror.".format(sub_directories[0]))
        else:
            print("Multiple local directories are available. Below you will " +
                  "find a valid URL for each one that can be used in CATMAID as " +
                  "a custom mirror.")

        print('')
        for sd in sub_directories:
            print("https://localhost:{}/{}/".format(port, sd))
        print('')

    # If there is a metadata.txt file in this folder, print it:
    metadata_file = os.path.join(cwd, 'metadata.txt')
    if os.path.isfile(metadata_file):
        print("A metadata file was found, which should provide additional " +
              "information for the custom mirror setup in CATMAID")
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
