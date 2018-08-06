# -*- coding: utf-8 -*-

from bulbs.neo4jserver import Graph
from bulbs.model import Node, Relationship
from bulbs.property import Property, String, Integer, Float, DateTime
from bulbs.utils import current_datetime
# TODO: check latest gist's 

# Requirements (installable with pip)
# pytz ujson six
# You need: sudo apt-get install python-dev

# Reason for GraphDB over relational databases
# 

####
# Nodes
####
       
class Neuron(Node):
    element_type = "neuron"
    
    name = String(nullable=False)
    
    creation_time = DateTime(default=current_datetime, nullable=False)
    edition_time = DateTime(default=current_datetime, nullable=False)
    #creation_time = Property(Float,default="current_timestamp", nullable=False)
    #edition_time = Float(default="current_timestamp", nullable=False)

        
class Treenode(Node):
    element_type = "treenode"
    x = Float(nullable=True)
    y = Float(nullable=False)
    z = Float(nullable=False)

class Connector(Node):
    element_type = "connector"


####
# Relationships
####
    
class Relation(Relationship):
    label = "relation"

    #creation_time = Float(default="current_timestamp", nullable=False)
    #edition_time = Float(default="current_timestamp", nullable=False)

    #def current_timestamp(self):
    #    return time.time()
        
class HasChild(Relationship):
    label = "has_child"

class HasTreenode(Relationship):
    label = "has_treenode"

class PresynapticTo(Relationship):
    label = "presynaptic_to"

class PostsynapticTo(Relationship):
    label = "postsynaptic_to"   

####
# Test
####

g = Graph()
g.add_proxy("neuron", Neuron)
g.add_proxy("treenode", Treenode)
g.add_proxy("connector", Connector)
g.add_proxy("has_child", HasChild)
g.add_proxy("has_treenode", HasTreenode)
g.add_proxy("presynaptic_to", PresynapticTo)
g.add_proxy("postsynaptic_to", PostsynapticTo)

# create a few objects
neuron1 = g.neuron.create(name="MyNeuron1")
neuron2 = g.neuron.create(name="MyNeuron2")
neuron3 = g.neuron.create(name="MyNeuron3")

treenode1 = g.treenode.create(x=3.3,y=4.3,z=3.2)
treenode11 = g.treenode.create(x=3.3,y=4.3,z=3.2)
treenode2 = g.treenode.create(x=3.3,y=4.3,z=3.2)
treenode3 = g.treenode.create(x=3.3,y=4.3,z=3.2)

connector1 = g.connector.create()

g.presynaptic_to.create(treenode11, connector1)
g.postsynaptic_to.create(treenode2, connector1)

g.has_treenode.create(neuron1, treenode1)
#g.has_treenode.create(treenode11, neuron1)
#g.has_treenode.create(treenode2, neuron2)
#g.has_treenode.create(treenode3, neuron3)

g.has_child.create(treenode1, treenode11)

print('Show treenodes of neuron 1')
print(list(neuron1.inV('element_of')))

# update
neur = g.vertices.get(neuron1.eid)
neur.name = 'New name'
neur.save()

"""
eid = neuron1.eid
dic = neuron1.map()
print('dictionary', eid, dic)
dic['aha'] = 10
g.vertices.update(eid,dic)
print('get it anew', eid, g.vertices.get(eid).map())
"""

# get edge attributes
edg = list(neur.outE('has_treenode'))[0]

# TODO: why is the relationship label not accessible? edge_type?
print('edge label', edg._label, edg.map())

#g.vertices.delete(neuron1.eid)

import sys
sys.exit(1)

"""
print(neuron1.eid)
neuronid = 1000
old_tn = None
for i in range(6005):
    print('i', i)
    if i % 5000 == 0:
        print('past 1000',i)
        neuronid+=1
        neuron1 = g.neuron.create(name="MyNeuron {0}".format(i))
        print('new neuron with id', neuron1.eid)
        
    treenode_new = g.treenode.create(x=3.3,y=4.3,z=3.2)
    g.has_treenode.create(neuron1, treenode_new)
    
    if not old_tn is None:
        g.has_child.create(old_tn, treenode_new)
    
    old_tn = treenode_new
"""

import time
start=time.time()
r=g.client.gremlin("g.v(2072).out('has_treenode')")
a,b=r.get_results()
TN=[]
for e in a:
    TN.append( e.get_id() )
print('time', time.time()-start)
#print('result', TN)

start=time.time()
TN2=[]
for i in g.neuron.get(2072).outE('has_treenode'):
    TN2.append( i.eid )
    
print('time2', time.time()-start)

# TODO: how to update with nodes with gremlin?
