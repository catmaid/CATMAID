from neo4django.db import models
import neo4django

class Concept(models.NodeModel):
    name = models.StringProperty(indexed=True)

class ContainerConcept(Concept):
    class Meta:
        abstract = True

class Group(ContainerConcept):
    part_of = models.Relationship(ContainerConcept,
                                  rel_type=neo4django.Incoming.CONTAINS,
                                  single=True,
                                  related_name='groups')

class Root(ContainerConcept):
    pass

class Element(Concept):
    part_of = models.Relationship(Group,
                                  rel_type=neo4django.Outgoing.PART_OF,
                                  single=True,
                                  related_name='elements')

"""
>>> e1 = Element.objects.create(name='my element 1')
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
