# -*- coding: utf-8 -*-
# Script initially by Tom Kazimiers 2013-01-12
# Adapted by Albert Cardona 2013-01-25
#
# The purpose of this script is to connect to a django session
# in a remote computer, and to retrieve information from the database
# such as the skeleton of a neuronal arbor and its synapses
# in the form of a NetworX graph.
import urllib
import urllib2
import base64
import cookielib
import sys
import networkx as nx
import json
from collections import defaultdict

class Connection:
    def __init__(self, server, authname, authpassword, authtoken):
        self.server = server
        self.authname = authname
        self.authpassword = authpassword
        self.authtoken = authtoken
        self.opener = urllib2.build_opener(urllib2.HTTPRedirectHandler())

    def djangourl(self, path):
        """ Expects the path to lead with a slash '/'. """
        return self.server + path

    def auth(self, request):
        if self.authname:
            base64string = base64.encodestring('%s:%s' % (self.authname, self.authpassword)).replace('\n', '')
            request.add_header("Authorization", "Basic %s" % base64string)
        if self.authtoken:
            request.add_header("X-Authorization", "Token {}".format(self.authtoken))

    def fetch(self, url, post=None):
        """ Requires the url to connect to and the variables for POST, if any, in a dictionary. """
        if post:
            request = urllib2.Request(url, post)
        else:
            request = urllib2.Request(url)

        self.auth(request)
        return self.opener.open(request).read()

    def fetchJSON(self, url, post=None):
        response = self.fetch(url, post=post)
        if not response:
            return
        r = json.loads(response)
        if type(r) == dict and 'error' in r:
            print("ERROR:", r['error'], r)
        else:
            return r

def skeleton_graph(connection, project_id, skeleton_id):
    """ Fetch a skeleton from the database and return it as a NetworkX graph,
    where the nodes are skeleton nodes, the edges are edges between skeleton nodes,
    and the graph itself has the name of the neuron as a property. """
    url = connection.djangourl('/%s/skeleton/%s/compact-json' % (project_id, skeleton_id))
    d = connection.fetchJSON(url)
    if not d:
        raise Exception("Invalid server reply")

    # d:
    # 0: neuron name
    # 1: treenodes
    # 2: tags
    # 3: connectors

    g = nx.DiGraph()
    g.skeleton_id = skeleton_id
    g.name = d[0] # Neuron's name
    g.tags = d[2] # dictionary of tag text vs list of treenode IDs
    g.connectors = {} # dictionary of connector IDs vs dictionary of relation vs list of treenode IDs

    # 0: treenode.id
    # 1: treenode.parent_id
    # 2: treenode.user_id
    # 3: treenode.location.x
    # 4: treenode.location.y
    # 5: treenode.location.z
    # 6: treenode.radius
    # 7: treenode.confidence
    for treenode in d[1]:
        if treenode[1]:
            # Will create the nodes when not existing yet
            g.add_edge(treenode[1], treenode[0], {'confidence': treenode[7]})
        else:
            # The root node
            g.add_node(treenode[0])
        properties = g[treenode[0]]
        properties['user_id'] = treenode[2]
        properties['radius'] = treenode[6]
        properties['x'] = treenode[3]
        properties['y'] = treenode[4]
        properties['z'] = treenode[5]
        properties['reviewer_ids'] = d[4].get(treenode[0], [])

    # tags are text vs list of treenode IDs
    for tag, treenodes in d[2].iteritems():
        for treenode_id in treenodes:
            tags = g[treenode_id].get('tags')
            if tags:
                tags.append(tag)
            else:
                g[treenode_id]['tags'] = [tag]

    # synapse:
    # 0: treenode_connector.treenode_id
    # 1: treenode_connector.connector_id
    # 2: 0 for presynaptic, 1 for postsynaptic
    # 3: connector.location.x
    # 4: connector.location.y
    # 5: connector.location.z
    relations = {0: 'presynaptic_to',
                 1: 'postsynaptic_to'}
    for synapse in d[3]:
        treenode_id = synapse[0]
        connector_id = synapse[1]
        relation = relations[synapse[2]]
        # Add as property of the graph node that represents a skeleton treenode
        synapses = g[treenode_id].get(relation)
        if synapses:
            synapses.append(connector_id)
        else:
            g[treenode_id][relation] = [connector_id]
        # Add as property of the general dictionary of connectors
        connector = g.connectors.get(connector_id)
        if connector:
            connector[relation].append(treenode_id)
        else:
            connector = defaultdict(list)
            connector[relation].append(treenode_id)
            g.connectors[connector_id] = connector

    return g


def test(connection):
    g = skeleton_graph(connection, 4, 17285283)
    print("Name:", g.name)
    print("Skeleton:", g.skeleton_id)
    print("Number of nodes:", g.number_of_nodes())
    print("Number of edges:", g.number_of_edges())
    print("Number of presynaptic relations:", sum(len(c['presynaptic_to']) for c in g.connectors.itervalues()))
    print("Number of postsynaptic relations:", sum(len(c['postsynaptic_to']) for c in g.connectors.itervalues()))


def main():
    if not sys.argv or len(sys.argv) < 2 or "-h" == sys.argv[1] or "--help" == sys.argv[1] or len(sys.argv) < 5:
        print("Usage: $ python access.py http://neurocean.janelia.org authname authpassword authtoken")
        sys.exit()

    server = sys.argv[1]
    authname = sys.argv[2]
    authpassword = sys.argv[3]
    authtoken = sys.argv[4]

    c = Connection(server, authname, authpassword, authtoken)

    test(c)



if __name__ == "__main__":
    main()




