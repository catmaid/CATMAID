from neo4django.db import models
import neo4django

class ProjectConcept(models.NodeModel):
    project_id = models.IntegerProperty(indexed=True)
    creation_time = models.DateTimeProperty(auto_now = True)
    edition_time = models.DateTimeProperty(auto_now = True)

class Concept(ProjectConcept):
    name = models.StringProperty(indexed=True)
    description = models.StringProperty()
    # edit_permissions
    created_by = models.Relationship('User',
        rel_type=neo4django.Outgoing.CREATED_BY,
        single=True,
        related_name='created')

class User(ProjectConcept):
    username = models.StringProperty()

class Group(Concept):
    # !!!Problematic
    part_of = models.Relationship('Group',
        rel_type=neo4django.Outgoing.PART_OF,
        single=True,
        related_name='elements')

    part_of = models.Relationship('Root',
        rel_type=neo4django.Outgoing.PART_OF,
        single=True,
        related_name='elements')

class Root(Concept):
    pass

class Neuron(Concept):

    # 'new', 'needs review', 'reviewed'
    status = models.StringProperty(indexed=True)

    # 'sensory neuron', 'interneuron', 'motor neuron'
    type =  models.StringProperty(indexed=True)

    # reviewed_by: User
    # is_from_lineage: Lineage

    part_of = models.Relationship('Group',
        rel_type=neo4django.Outgoing.PART_OF,
        single=True,
        related_name='elements')

class Skeleton(Concept):
    model_of = models.Relationship(Neuron,
                                rel_type=neo4django.Outgoing.MODEL_OF,
                                single=True,    
                                related_name='skeletons')

class Tag(Concept):
    pass
