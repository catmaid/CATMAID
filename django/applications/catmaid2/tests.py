"""
This file demonstrates writing tests using the unittest module. These will pass
when you run "manage.py test".

Replace this with more appropriate tests for your application.
"""

from django.test import TestCase


class SimpleTest(TestCase):
    def test_basic_addition(self):
        """
        Tests that 1 + 1 always equals 2.
        """
        self.assertEqual(1 + 1, 2)

"""
from catmaid2.models import *
pid = 4

u1=User.objects.create(username='stephan', project_id=pid)

s1=Skeleton.objects.create(name='my skeleton 1', project_id=pid, created_by=u1)
s2=Skeleton.objects.create(name='my skeleton 2', project_id=pid, created_by=u1)
n1=Neuron.objects.create(name='my neuron 1', project_id=pid, created_by=u1)
n2=Neuron.objects.create(name='my neuron 2', project_id=pid, created_by=u1)

s1.model_of = n1
s1.save()
s2.model_of = n2
s2.save()

g1=Group.objects.create(name='My group 1', project_id=pid, created_by=u1)

n1.part_of = g1
n1.save()

g2=Group.objects.create(name='My group 2', project_id=pid, created_by=u1)

n2.part_of = g2
n2.save()

g1.part_of = g2
g1.save()

g2.elements.all()

r1=Root.objects.create(name='neuropil', project_id=pid, created_by=u1)

"""