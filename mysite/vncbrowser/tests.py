from django.test import TestCase
from django.test.client import Client
from django.db import connection
import os
import sys
import re
import urllib
import json

from models import Project, Stack, Integer3D, Double3D, ProjectStack
from models import ClassInstance, generate_catmaid_sql, SQLPlaceholder
from models import Treenode

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
        self.assertEqual(len(downstreams), 3)

        downstreams.sort(key=lambda x: x.name)
        self.assertEqual(downstreams[0].name, "downstream-A")
        self.assertEqual(downstreams[1].name, "downstream-A")
        self.assertEqual(downstreams[2].name, "downstream-B")

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

swc_output_for_skeleton_235 = '''237 0 1065 3035 0 0 -1
417 0 4990 4200 0 0 415
415 0 5810 3950 0 0 289
289 0 6210 3480 0 0 287
287 0 6315 3270 0 0 285
285 0 6100 2980 0 0 283
283 0 5985 2745 0 0 281
281 0 5675 2635 0 0 279
277 0 6090 1550 0 0 275
275 0 5800 1560 0 0 273
273 0 5265 1610 0 0 271
271 0 5090 1675 0 0 269
279 0 5530 2465 0 0 267
267 0 5400 2200 0 0 265
269 0 4820 1900 0 0 265
265 0 4570 2125 0 0 263
261 0 2820 1345 0 0 259
259 0 3445 1385 0 0 257
257 0 3825 1480 0 0 255
255 0 3850 1790 0 0 253
263 0 3915 2105 0 0 253
253 0 3685 2160 0 0 251
251 0 3380 2330 0 0 249
249 0 2815 2590 0 0 247
247 0 2610 2700 0 0 245
245 0 1970 2595 0 0 243
243 0 1780 2570 0 0 241
241 0 1340 2660 0 0 239
239 0 1135 2800 0 0 237
'''

def swc_string_to_sorted_matrix(s):
    m = [ re.split("\s+", x) for x in s.splitlines() if not re.search('^\s*(#|$)', x) ]
    return sorted(m, key=lambda x: x[0])

class ViewPageTests(TestCase):

    def setUp(self):
        ensure_schema_exists()
        add_example_data()
        self.test_project_id = 3
        self.client = Client()

    def compare_swc_data(self, s1, s2):
        m1 = swc_string_to_sorted_matrix(s1)
        m2 = swc_string_to_sorted_matrix(s2)
        self.assertEqual(len(m1), len(m2))

        fields = ['id', 'type', 'x', 'y', 'z', 'radius', 'parent']
        d = dict((x,i) for (i,x) in enumerate(fields))

        for i, e1 in enumerate(m1):
            e2 = m2[i]
            for f in ('id', 'parent', 'type'):
                self.assertEqual(e1[d[f]], e2[d[f]])
            for f in ('x', 'y', 'z', 'radius'):
                self.assertAlmostEqual(float(e1[d[f]]),
                                  float(e2[d[f]]))

    def test_swc_file(self):
        response = self.client.get('/%d/skeleton/235/swc' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)

        self.compare_swc_data(response.content, swc_output_for_skeleton_235)

    def test_view_neuron(self):
        neuron_name = 'branched neuron'
        neuron = ClassInstance.objects.get(name=neuron_name)
        self.assertTrue(neuron)

        url = '/%d/view/%d' % (self.test_project_id, neuron.id)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        url = '/%d/view/%s' % (self.test_project_id,
                               urllib.quote(neuron_name))
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_skeletons_from_neuron(self):
        url = '/%d/neuron-to-skeletons/%d' % (self.test_project_id,
                                              233)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        parsed_data = json.loads(response.content)
        self.assertEqual(len(parsed_data), 1)
        self.assertEqual(parsed_data[0], 235)

class TreenodeTests(TestCase):

    def setUp(self):
        ensure_schema_exists()
        add_example_data()
        self.test_project_id = 3

    def test_find_all_treenodes(self):

        # These next two could be done in one query, of course:
        neuron = ClassInstance.objects.get(name='branched neuron',
                                           class_column__class_name='neuron')
        skeleton = ClassInstance.objects.get(
            class_column__class_name='skeleton',
            class_instances_a__relation__relation_name='model_of',
            class_instances_a__class_instance_b=neuron)

        tns = Treenode.objects.filter(
            treenodeclassinstance__class_instance=skeleton).order_by('id')

        self.assertEqual(len(tns), 29)

        self.assertEqual(tns[0].id, 237)

        # That's a root node, so parent should be None:
        self.assertTrue(tns[0].parent is None)

        # But the next should have this as a parent:
        self.assertEqual(tns[1].parent, tns[0])

