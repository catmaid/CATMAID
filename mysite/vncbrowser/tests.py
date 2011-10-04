from django.test import TestCase
from django.db import connection
import os
import sys
import re

from models import Project, Stack, Integer3D, Double3D, ProjectStack
from models import ClassInstance, generate_catmaid_sql, SQLPlaceholder

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

def add_example_data():
    """
    This function will add some example data to the CATMAID
    database.
    """
    cursor = connection.cursor()
    current_directory = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(current_directory, "data.sql")) as fp:
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

        self.assertEqual(p.stacks.count(), 1)

class RelationQueryTests(TestCase):

    def setUp(self):
        ensure_schema_exists()
        add_example_data()
        self.test_project_id = 3

    def test_find_all_neurons(self):
        all_neurons = ClassInstance.objects.filter(class_column__class_name='neuron',
                                                   project=self.test_project_id)
        self.assertEqual(all_neurons.count(), 4)

    def test_find_downstream_neurons(self):
        upstream = ClassInstance.objects.get(name='branched neuron')
        self.assertTrue(upstream)

        downstreams = list(ClassInstance.all_neurons_downstream(upstream))
        self.assertEqual(len(downstreams), 2)

        downstreams.sort(key=lambda x: x.name)
        self.assertEqual(downstreams[0].name, "downstream-A")
        self.assertEqual(downstreams[1].name, "downstream-B")

    def test_find_upstream_neurons(self):
        downstream = ClassInstance.objects.get(name='downstream-A')
        self.assertTrue(downstream)

        upstreams = list(ClassInstance.all_neurons_upstream(downstream))
        self.assertEqual(upstreams[0].name, "branched neuron")

def condense_whitespace(s):
    return re.sub('\s+(?ims)',' ',s).strip()

class SQLGenerationTests(TestCase):

    def test_condense_whitespace(self):
        input = """ blah\thello
   foo
bar  \tbaz  """
        self.assertEqual(condense_whitespace(input),
                         "blah hello foo bar baz")

    def test_basic_generation(self):
        simple = [ ( 'class_instance:neuron', { 'id': 2, 'project_id': 3 } ) ]
        simple_query = generate_catmaid_sql(simple)

        expected_result = """
SELECT ci0.*
   FROM
      class_instance ci0,
      class c0
   WHERE
      ci0.id = 2 AND
      ci0.project_id = 3 AND
      ci0.class_id = c0.id AND
      c0.class_name = 'neuron'
"""

        self.assertEqual(condense_whitespace(simple_query),
                         condense_whitespace(expected_result))

        one_relation = [ ( 'class_instance:neuron', { 'project_id': 3 } ),
                         ( '<model_of', {} ),
                         ( 'class_instance:skeleton', { 'name': 'dull skeleton' } ) ]

        one_relation_query = generate_catmaid_sql(one_relation)

        expected_result = """
SELECT ci0.*
   FROM
      class_instance ci0,
      class c0,
      class_instance_class_instance cici0,
      relation r0,
      class_instance ci1,
      class c1
   WHERE
      ci0.project_id = 3 AND
      ci0.class_id = c0.id AND
      c0.class_name = 'neuron' AND
      cici0.class_instance_a = ci1.id AND
      cici0.class_instance_b = ci0.id AND
      cici0.relation_id = r0.id AND
      r0.relation_name = 'model_of' AND
      ci1.name = 'dull skeleton' AND
      ci1.class_id = c1.id AND
      c1.class_name = 'skeleton'
"""
        self.assertEqual(condense_whitespace(one_relation_query),
                         condense_whitespace(expected_result))

        treenode_relation = [ ( 'treenode', { 'project_id': SQLPlaceholder() } ),
                              ( 'element_of>', { 'project_id': SQLPlaceholder() } ),
                              ( 'class_instance:skeleton', {} ),
                              ( 'model_of>', {} ),
                              ( 'class_instance:neuron', {} ) ]

        treenode_relation_query = generate_catmaid_sql(treenode_relation)

        expected_result = '''
SELECT t0.*
   FROM
      treenode t0,
      treenode_class_instance tci0,
      relation r0,
      class_instance ci1,
      class c1,
      class_instance_class_instance cici1,
      relation r1,
      class_instance ci2,
      class c2
   WHERE
      t0.project_id = %s AND
      tci0.treenode_id = t0.id AND
      tci0.class_instance_id = ci1.id AND
      tci0.relation_id = r0.id AND
      r0.relation_name = 'element_of' AND
      r0.project_id = %s AND
      ci1.class_id = c1.id AND
      c1.class_name = 'skeleton' AND
      cici1.class_instance_a = ci1.id AND
      cici1.class_instance_b = ci2.id AND
      cici1.relation_id = r1.id AND
      r1.relation_name = 'model_of' AND
      ci2.class_id = c2.id AND
      c2.class_name = 'neuron'
'''

        self.assertEqual(condense_whitespace(treenode_relation_query),
                         condense_whitespace(expected_result))
