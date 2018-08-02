# -*- coding: utf-8 -*-

""" Mapping the CATMAID datamodel to a graph database

Each project has its own annotation graph.

- Can I point from one graph to the vertex of another graph?
- Classes could be derived from Ontologies
http://bioportal.bioontology.org/

"""
import time
from bulbs.model import Node
from bulbs.property import Property, String, Integer, Float
from bulbs.model import Relationship

class User(Node):
    element_type = "user"

    username = Property(String, nullable=False)
    password = Property(String, nullable=False)

    def after_created(self):
        # include code to create relationships and to index the node
        pass


class Concept(Node):
    element_type = "concept"

    name = Property(String, nullable=False)

    creation_time = Property(Float, default="current_timestamp", nullable=False)
    edition_time = Property(Float, default="current_timestamp", nullable=False)

    def current_timestamp(self):
        return time.time()

class Group(Concept):
    element_type = "group"

class Neuron(Concept):
    element_type = "neuron"

class Skeleton(Concept):
    element_type = "skeleton"

class Tag(Concept):
    element_type = "tag"
# was: label

class Root(Concept):
    element_type = "root"

class Synapse(Concept):
    element_type = "synapse"

class PresynapticTerminal(Concept):
    element_type = "presynaptic_terminal"

class PostsynapticTerminal(Concept):
    element_type = "postsynaptic_terminal"

# new classes

class Mitochondrion(Concept):
    element_type = "mitochondrion"
# PartOf Neuron/Skeleton ?

class SynapticVesicle(Concept):
    element_type = "synaptic_vesicle"
# PartOf Pre/PostsynapticTerminal

class ChemicalSynapse(Synapse):
    element_type = "chemical_synapse"

class ElectricalSynapse(Synapse):
    element_type = "electrical_synapse"

class SynapticCleft(Concept):
    element_type = "synaptic_cleft"
# ParfOf Synapse


# relationships

class Relation(Relationship):
    label = "relation"

    creation_time = Property(Float, default="current_timestamp", nullable=False)

    def current_timestamp(self):
        return time.time()

class TaggedAs(Relation):
    label = "tagged_as"

class PostsynapticTo(Relation):
    label = "postsynaptic_to"

class PresynapticTo(Relation):
    label = "presynaptic_to"

class ModelOf(Relation):
    label = "model_of"

class PartOf(Relation):
    label = "part_of"

# note used because geometry to annotation: element_of

class CreatedBy(Relationship):
    label = "created_by"

    creation_time = Property(Float, default="current_timestamp", nullable=False)

    @property
    def concept(self):
        return Concept.get(self.outV)

    @property
    def user(self):
        return User.get(self.inV)

    def current_timestamp(self):
        return time.time()

if __name__ == '__main__':
    from bulbs.graph import Graph
    g = Graph()
    u = User(username="test", password="test")
