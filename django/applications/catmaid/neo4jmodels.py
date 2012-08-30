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

class ContainerConcept(Concept):
    class Meta:
        abstract = True

class Root(ContainerConcept):
    pass

class Group(ContainerConcept):
    part_of = models.Relationship(ContainerConcept,
        rel_type=neo4django.Incoming.CONTAINS,
        single=True,
        related_name='groups')
class Neuron(Concept):

    # 'new', 'needs review', 'reviewed'
    status = models.StringProperty(indexed=True)

    # 'sensory neuron', 'interneuron', 'motor neuron'
    type =  models.StringProperty(indexed=True)

    # reviewed_by: User
    # is_from_lineage: Lineage

    part_of = models.Relationship(Group,
        rel_type=neo4django.Outgoing.PART_OF,
        single=True,
        related_name='neurons')

class Skeleton(Concept):
    model_of = models.Relationship(Neuron,
        rel_type=neo4django.Outgoing.MODEL_OF,
        single=True,
        related_name='skeletons')

class Tag(Concept):
    pass

"""
>>> e1 = Neuron.objects.create(name='my neuron 1')
>>> g1 = Group.objects.create(name='my group 1')
>>> g2 = Group.objects.create(name='my group 2')
>>> r1 = Root.objects.create(name='my root')
>>> 
>>> e1.part_of = g1
>>> e1.save()
>>> 
>>> g1.part_of = g2
>>> g1.save()
>>> 
>>> g2.part_of = r1
>>> g2.save()
>>> 
>>> g2.elements.all()
[]
>>> g2.groups.all()
[<Group: Group object>]
>>> g2.groups.all()[0] == g1
True
"""
