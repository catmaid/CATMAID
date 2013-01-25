# Script initially by Tom Kazimiers 2013-01-12
# Adapted by Albert Cardona 2013-01-25
#
# The purpose of this script is to connect to a django session
# in a remote computer, and to retrieve information from the database
# such as the skeleton of a neuronal arbor and its synapses
# in the form of a NetworX graph.

import urllib
import urllib2
import cookielib
import sys
import networkx as nx
import json

class Connection:
    def __init__(self, server, username, password):
        self.server = server
        self.username = username
        self.password = password
        self.cookies = cookielib.CookieJar()
        self.opener = urllib2.build_opener(urllib2.HTTPRedirectHandler(), urllib2.HTTPCookieProcessor(self.cookies))

    def mkurl(self, path):
        """ Expects the path to lead with a slash '/'. """
        return self.server + path

    def djangourl(self, path):
        """ Expects the path to lead with a slash '/'. """
        return self.server + '/catmaid/dj' + path

    def login(self):
        url = self.mkurl("/catmaid/dj/accounts/login")
        opts = {
            'name': self.username,
            'pwd': self.password
        }
        data = urllib.urlencode(opts)
        request = urllib2.Request(url, data)
        response = urllib2.urlopen(request)
        self.cookies.extract_cookies(response, request)
        return response.read()

    def fetch(self, url, post=None):
        """ Requires the url to connect to and the variables for POST, if any, in a dictionary. """
        if post:
            request = urllib2.Request(url, post)
        else:
            request = urllib2.Request(url)

        return self.opener.open(request).read()



def skeleton_graph(connection, project_id, skeleton_id):
    """ Fetch a skeleton from the database and return it as a NetworkX graph,
    where the nodes are skeleton nodes, the edges are edges between skeleton nodes,
    and the graph itself has as properties the name of the neuron and the connectors.
    The connectors are a dictionary of connector ID vs properties.
    TODO WARNING the IDs of the nodes are all strings; this is an error in the catmaid
    server-side functions. """
    url = connection.djangourl('/%s/skeleton/%s/json' % (project_id, skeleton_id))
    reply = connection.fetch(url)
    print reply
    d = json.loads(reply) # decode JSON string

    vertices = d['vertices']
    edges = d['connectivity']

    g = nx.DiGraph()
    g.name = d['neuron']['neuronname']
    g.connectors = {}

    for node_id, props in vertices.iteritems():
        t = props['type']
        if "skeleton" == t:
            g.add_node(node_id, props)
        elif "connector" == t:
            g.connectors[node_id] = props

    for node_id, rels in edges.iteritems():
        # An edge between the node id and the id of the parent node
        for other_id, props in rels.iteritems():
            t = props['type']
            if "neurite" == t:
                g.add_edge(node_id, other_id, type='skeleton')
            elif "presynaptic_to" == t:
                g.connectors[other_id][t] = node_id
            elif "postsynaptic_to" == t:
                if t in g.connectors[other_id]:
                    s = g.connectors[other_id][t]
                else:
                    s = set()
                    g.connectors[other_id][t] = s
                s.add(node_id)

    return g


def test(connection):
    g = skeleton_graph(connection, 4, 18247516)
    print "Name:", g.name
    print "Number of nodes:", g.number_of_nodes()
    print "Number of edges:", g.number_of_edges()
    print "Number of connections to other skeletons:", len(g.connectors), g.connectors


def main():
    if not sys.argv or not sys.argv[1] or "-h" == sys.argv[1] or "--help" == sys.argv[1] or len(sys.argv) < 4:
        print("Usage: $ python remote.py http://neurocean.janelia.org username password")
        sys.exit()

    server = sys.argv[1]
    username = sys.argv[2]
    password = sys.argv[3]

    c = Connection(server, username, password)
    c.login()

    test(c)



if __name__ == "__main__":
    main()




