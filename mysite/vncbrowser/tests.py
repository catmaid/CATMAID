from django.test import TestCase
from django.db import connection
import os
import sys

# from mysite.vncbrowser.models import Project, Stack, Integer3D, Double3D
# from vncbrowser.models import Project, Stack, Integer3D, Double3D
from models import Project, Stack, Integer3D, Double3D, ProjectStack

import vncbrowser as vnc_one
import mysite.vncbrowser as vnc_two

print "vnc_one:", vnc_one.__file__
print "vnc_two:", vnc_two.__file__

print os.getcwd()

class SimpleTest(TestCase):
    def test_basic_addition(self):
        """
        Tests that 1 + 1 always equals 2.
        """
        self.assertEqual(1 + 1, 2)

def ensure_schema_exists():
    """
    This function will create the CATMAID schema is it doesn't seem to
    exist yet (based on the presence or not of the 'project' table.
    """
    cursor = connection.cursor()
    # See if the project table has been created:
    cursor.execute("SELECT count(*) FROM pg_tables WHERE tablename = 'project'")
    row = cursor.fetchone()
    if row[0] == 1:
        return
    current_directory = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(current_directory, "tables.sql")) as fp:
        cursor.execute(fp.read())

class InsertionTest(TestCase):

    def setUp(self):
        ensure_schema_exists()

    def insert_project(self):
        p = Project()
        p.title = "Example Project"
        p.comment = "This is an example project for the Django tests"
        p.save()
        return p

    def insert_stack(self):
        s = Stack()
        s.title = "Example Stack"
        s.image_base = "http://incf.ini.uzh.ch/image-stack-fib/"
        s.trakem2_project = False
        s.dimension = Integer3D(x=2048, y=1536, z=460)
        s.resolution = Double3D(x=5.0001, y = 5.0002, z=9.0003)
        s.save()
        return s

    def test_project_insertion(self):
        """
        Tests that a project can be inserted, and that the
        id is retrievable afterwards.  (This is something that
        the custom psycopg2 driver is needed for.)
        """
        p = self.insert_project()
        self.assertEqual(p.id, 1)

    def insert_project(self):
        p = Project()
        p.title = "Example Project"
        p.comment = "This is an example project for the Django tests"
        p.save()
        return p

    def test_stack_insertion(self):
        p = self.insert_project()
        s = self.insert_stack()
        self.assertEqual(s.id, 1)
        # Now try to associate this stack with the project:
        p = Project.objects.get(pk=1)
        self.assertTrue(p)

        ps = ProjectStack(project=p, stack=s)
        ps.save()

        self.assertEqual(len(p.stacks()), 1)
