from django.test import TestCase, TransactionTestCase
from django.test.client import Client
from django.http import HttpResponse
from django.db import connection
from django.shortcuts import get_object_or_404
import os
import re
import urllib
import json
import datetime

from models import Project, Stack, Integer3D, Double3D, ProjectStack
from models import ClassInstance, Session, Log
from models import Treenode, Connector, TreenodeConnector, User
from models import Textlabel, TreenodeClassInstance, ClassInstanceClassInstance
from transaction import RollbackAndReport, transaction_reportable_commit_on_success
from views.catmaid_replacements import get_relation_to_id_map, get_class_to_id_map


class SimpleTest(TestCase):
    def test_basic_addition(self):
        """
        Tests that 1 + 1 always equals 2.
        """
        self.assertEqual(1 + 1, 2)


def ensure_schema_and_data_exist():
    """
    This function will create the CATMAID schema is it doesn't seem to
    exist yet (based on the presence or not of the 'project' table).
    If it needs to add the schema, it will also add testing data.
    """
    cursor = connection.cursor()
    # See if the project table has been created:
    cursor.execute("SELECT count(*) FROM pg_tables WHERE tablename = 'project'")
    row = cursor.fetchone()
    if row[0] == 1:
        return
    current_directory = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(current_directory, "tables_and_data.sql")) as fp:
        cursor.execute(fp.read())


def remove_example_data():
    """
    This function will remove example data from the database, without touching
    the schema. Warning: This takes a long time to run.
    """
    tables = connection.introspection.table_names()
    cursor = connection.cursor()
    for table in tables:
        cursor.execute('TRUNCATE TABLE "%s" RESTART IDENTITY CASCADE' % table)


class TransactionTests(TransactionTestCase):

    def setUp(self):
        ensure_schema_and_data_exist()
        remove_example_data()

    def test_successful_commit(self):
        @transaction_reportable_commit_on_success
        def insert_user():
            User(name='matri', pwd='boop', longname='Matthieu Ricard').save()
            return HttpResponse(json.dumps({'message': 'success'}))

        User.objects.all().delete()
        response = insert_user()
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'success'}
        self.assertEqual(1, User.objects.all().count())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_report_error(self):
        @transaction_reportable_commit_on_success
        def insert_user():
            User(name='matri', pwd='boop', longname='Matthieu Ricard').save()
            raise RollbackAndReport({'error': 'catch me if you can'})
            return HttpResponse(json.dumps({'should not': 'return this'}))

        User.objects.all().delete()
        response = insert_user()
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'catch me if you can'}
        self.assertEqual(0, User.objects.all().count())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_catch_404(self):
        @transaction_reportable_commit_on_success
        def insert_user():
            get_object_or_404(User, pk=12)
            return HttpResponse(json.dumps({'should not': 'return this'}))

        User.objects.all().delete()
        response = insert_user()
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'No User matches the given query.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(0, User.objects.all().count())

    def test_fail_unexpectedly(self):
        @transaction_reportable_commit_on_success
        def insert_user():
            User(name='matri', pwd='boop', longname='Matthieu Ricard').save()
            raise Exception()
            return HttpResponse(json.dumps({'should not': 'return this'}))

        User.objects.all().delete()
        with self.assertRaises(Exception):
            insert_user()
        self.assertEqual(0, User.objects.all().count())


class InsertionTest(TestCase):

    def setUp(self):
        ensure_schema_and_data_exist()
        remove_example_data()

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
        s.resolution = Double3D(x=5.0001, y=5.0002, z=9.0003)
        s.num_zoom_levels = -1
        s.file_extension = 'jpg'
        s.tile_width = 256
        s.tile_height = 256
        s.tile_source_type = 1
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
        ensure_schema_and_data_exist()
        self.test_project_id = 3

    def test_find_all_neurons(self):
        all_neurons = ClassInstance.objects.filter(class_column__class_name='neuron',
                                                   project=self.test_project_id)
        self.assertEqual(all_neurons.count(), 8)

    def test_find_downstream_neurons(self):
        upstream = ClassInstance.objects.get(name='branched neuron')
        self.assertTrue(upstream)

        skeletons = ClassInstance.objects.filter(
            class_column__class_name='skeleton',
            cici_via_a__relation__relation_name='model_of',
            cici_via_a__class_instance_b=upstream)

        downstreams = list(upstream.all_neurons_downstream(self.test_project_id, skeletons))
        self.assertEqual(len(downstreams), 2)

        self.assertEqual(downstreams[0]['name'], "downstream-A / skeleton 373")
        self.assertEqual(downstreams[0]['id__count'], 2)
        self.assertEqual(downstreams[1]['name'], "downstream-B / skeleton 361")
        self.assertEqual(downstreams[1]['id__count'], 1)

    def test_find_upstream_neurons(self):
        downstream = ClassInstance.objects.get(name='downstream-A')
        self.assertTrue(downstream)

        skeletons = ClassInstance.objects.filter(
            class_column__class_name='skeleton',
            cici_via_a__relation__relation_name='model_of',
            cici_via_a__class_instance_b=downstream)

        upstreams = list(downstream.all_neurons_upstream(self.test_project_id, skeletons))
        self.assertEqual(upstreams[0]['name'], "branched neuron / skeleton 235")

swc_output_for_skeleton_235 = '''237 0 1065 3035 0 0 -1
417 0 4990 4200 0 0 415
415 0 5810 3950 0 0 289
289 0 6210 3480 0 0 285
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
        ensure_schema_and_data_exist()
        self.test_project_id = 3
        self.client = Client()

    def fake_authentication(self):
        session = Session()
        session.session_id = 'f9v85q77vuvamsr0tlnv5inkk5'
        session.data = 'id|s:1:"3";key|s:54:"7gtmcy8g03457xg3hmuxdgregtyu45ty57ycturemuzm934etmvo56";'
        session.last_accessed = datetime.datetime.now()
        session.save()
        # And insert the corresponding cookie:
        self.client.cookies['PHPSESSID'] = 'f9v85q77vuvamsr0tlnv5inkk5'
        self.client.cookies['PHPSESSID']['path'] = '/'

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

    def test_authentication(self):
        response = self.client.get('/%d' % (self.test_project_id,))
        self.assertEqual('http://testserver/login?return_url=%2F3', response['Location'])
        self.assertEqual(response.status_code, 302)
        # Now insert a fake session:
        self.fake_authentication()
        response = self.client.get('/%d' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)

    def test_swc_file(self):
        self.fake_authentication()
        for url in ['/%d/skeleton/235/swc' % (self.test_project_id,),
                    '/%d/skeleton-for-treenode/245/swc' % (self.test_project_id,)]:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            self.compare_swc_data(response.content, swc_output_for_skeleton_235)
        # One query is to check the session, one is to get the user
        # for that session, and the third is actually retrieving the
        # treenodes:
        self.assertNumQueries(3, lambda: self.client.get('/%d/skeleton/235/swc' % (self.test_project_id,)))

    def test_labels(self):
        self.fake_authentication()
        response = self.client.get('/%d/labels-all' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        returned_labels = json.loads(response.content)
        self.assertEqual(set(returned_labels),
                         set(["t",
                              "synapse with more targets",
                              "uncertain end",
                              "TODO"]))
        nods = {"7":"7",
                "237":"237",
                "367":"367",
                "377":"377",
                "417":"417",
                "409":"409",
                "407":"407",
                "399":"399",
                "397":"397",
                "395":"395",
                "393":"393",
                "387":"387",
                "385":"385",
                "403":"403",
                "405":"405",
                "383":"383",
                "391":"391",
                "415":"415",
                "289":"289",
                "285":"285",
                "283":"283",
                "281":"281",
                "277":"277",
                "275":"275",
                "273":"273",
                "271":"271",
                "279":"279",
                "267":"267",
                "269":"269",
                "265":"265",
                "261":"261",
                "259":"259",
                "257":"257",
                "255":"255",
                "263":"263",
                "253":"253",
                "251":"251",
                "249":"249",
                "247":"247",
                "245":"245",
                "243":"243",
                "241":"241",
                "239":"239",
                "356":"356",
                "421":"421",
                "432":"432"}
        response = self.client.post('/%d/labels-for-nodes' % (self.test_project_id,),
                              {'nods': json.dumps(nods)})

        returned_node_map = json.loads(response.content)
        self.assertEqual(len(returned_node_map.keys()), 3)
        self.assertEqual(set(returned_node_map['403']),
                         set(["uncertain end"]))
        self.assertEqual(set(returned_node_map['261']),
                         set(["TODO"]))
        self.assertEqual(set(returned_node_map['432']),
                         set(["synapse with more targets", "TODO"]))

        response = self.client.post('/%d/labels-for-node/location/%d' % (self.test_project_id,
                                                                    432))
        returned_labels = json.loads(response.content)
        self.assertEqual(set(returned_labels),
                         set(["synapse with more targets", "TODO"]))

        response = self.client.post('/%d/labels-for-node/treenode/%d' % (self.test_project_id,
                                                                    403))
        returned_labels = json.loads(response.content)
        self.assertEqual(len(returned_labels), 1)
        self.assertEqual(returned_labels[0], "uncertain end")

        response = self.client.post('/%d/label-update/treenode/%d' % (self.test_project_id,
                                                                      403),
                                    {'tags': json.dumps(['foo', 'bar'])})
        parsed_response = json.loads(response.content)
        self.assertTrue('message' in parsed_response)
        self.assertTrue(parsed_response['message'] == 'success')

        response = self.client.post('/%d/labels-for-node/treenode/%d' % (self.test_project_id,
                                                                    403))
        returned_labels = json.loads(response.content)
        self.assertEqual(len(returned_labels), 2)
        self.assertEqual(set(returned_labels), set(['foo', 'bar']))

    def test_view_neuron(self):
        self.fake_authentication()
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

    def test_line(self):
        self.fake_authentication()
        line = ClassInstance.objects.get(
            name='c005',
            class_column__class_name='driver_line')
        self.assertTrue(line)
        url = '/%d/line/%d' % (self.test_project_id,
                               line.id,)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_project_list(self):
        # Check that, pre-authentication, we can see two of the
        # projects:
        response = self.client.get('/projects')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.content)
        self.assertEqual(len(result.keys()), 2)

        # Check the first project:
        stacks = result['1']['action']
        self.assertEqual(len(stacks), 1)

        # Check the second project:
        stacks = result['3']['action']
        self.assertEqual(len(stacks), 1)
        stack = stacks['3']
        self.assertTrue(re.search(r'javascript:openProjectStack\( *3, *3 *\)', stack['action']))

        # Now log in and check that we see a different set of projects:
        self.client = Client()
        self.fake_authentication()
        response = self.client.get('/projects')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.content)
        self.assertEqual(len(result.keys()), 3)

        # Check the first project:
        stacks = result['1']['action']
        self.assertEqual(len(stacks), 1)

        # Check the second project:
        stacks = result['3']['action']
        self.assertEqual(len(stacks), 1)
        stack = stacks['3']
        self.assertTrue(re.search(r'javascript:openProjectStack\( *3, *3 *\)', stack['action']))

        # Check the third project:
        stacks = result['5']['action']
        self.assertEqual(len(stacks), 2)

    def test_login(self):
        self.fake_authentication()
        response = self.client.get('/login')
        self.assertEqual(response.status_code, 200)
        response = self.client.get('/login?return_url=%2F3')
        self.assertEqual(response.status_code, 200)

    def test_skeletons_from_neuron(self):
        self.fake_authentication()
        url = '/%d/neuron-to-skeletons/%d' % (self.test_project_id,
                                              233)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        parsed_data = json.loads(response.content)
        self.assertEqual(len(parsed_data), 1)
        self.assertEqual(parsed_data[0], 235)

    def test_index(self):
        self.fake_authentication()
        url = '/%d' % (self.test_project_id,)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        for order in ('cellbody', 'cellbodyr', 'name', 'namer', 'gal4', 'gal4r'):
            url = '/%d/sorted/%s' % (self.test_project_id, order)
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)

    def test_visual_index(self):
        self.fake_authentication()
        url = '/%d/visual_index' % (self.test_project_id,)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_user_list(self):
        self.fake_authentication()
        response = self.client.get('/user-list')
        expected_result = {
            "3": {"id": 3,
                  "name": "gerhard",
                  "longname": "Stephan Gerhard"},
            "1": {"id": 1,
                  "name": "saalfeld",
                  "longname": "Stephan Saalfeld"},
            "2": {"id": 2,
                  "name": "test",
                  "longname": "Theo Test"}}
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result, parsed_response)

    def test_skeleton_root(self):
        self.fake_authentication()
        response = self.client.get('/%d/root-for-skeleton/%d' % (self.test_project_id, 235))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        self.assertEqual(parsed_response['root_id'], 237)
        self.assertAlmostEqual(parsed_response['x'], 1065)
        self.assertAlmostEqual(parsed_response['y'], 3035)
        self.assertAlmostEqual(parsed_response['z'], 0)

    def test_treenode_stats(self):
        self.fake_authentication()
        response = self.client.get('/%d/stats' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        values = parsed_response['values']
        users = parsed_response['users']
        values_and_users = zip(values, users)
        for t in values_and_users:
            if t[0] == 6:
                self.assertEqual(t[1], 'test (6)')
            elif t[0] == 78:
                self.assertEqual(t[1], 'gerhard (78)')
            else:
                raise Exception("Unexpected value in returned stats: " + str(t))

    def test_stats_summary(self):
        self.fake_authentication()
        response = self.client.get('/%d/stats-summary' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        expected_result = {u"proj_users": 2,
                           u'proj_presyn': 0,
                           u'proj_postsyn': 0,
                           u'proj_synapses': 0,
                           u"proj_neurons": 8,
                           u"proj_treenodes": 84,
                           u"proj_skeletons": 7,
                           u"proj_textlabels": 0,
                           u"proj_tags": 4}
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result, parsed_response)

    def test_multiple_treenodes(self):
        self.fake_authentication()
        response = self.client.get('/%d/multiple-presynaptic-terminals' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)

    def test_fail_update_confidence(self):
        treenode_id = Treenode.objects.order_by("-id")[0].id + 1  # Inexistant
        self.fake_authentication()
        response = self.client.post(
                '/%d/%d/confidence/update' % (self.test_project_id, treenode_id),
                {'new_confidence': '4'})
        self.assertEqual(response.status_code, 200)
        expected_result = {'error': 'Failed to update confidence of treenode_connector between treenode %s.' % treenode_id}
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result, parsed_response)

    def test_update_confidence_of_treenode(self):
        treenode_id = 7
        self.fake_authentication()
        response = self.client.post(
                '/%d/%d/confidence/update' % (self.test_project_id, treenode_id),
                {'new_confidence': '4'})
        treenode = Treenode.objects.filter(id=treenode_id).get()
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'success'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(4, treenode.confidence)

        response = self.client.post(
                '/%d/%d/confidence/update' % (self.test_project_id, treenode_id),
                {'new_confidence': '5'})
        treenode = Treenode.objects.filter(id=treenode_id).get()
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'success'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(5, treenode.confidence)

    def test_update_confidence_of_treenode_connector(self):
        treenode_id = 285
        treenode_connector_id = 360
        self.fake_authentication()
        response = self.client.post(
                '/%d/%d/confidence/update' % (self.test_project_id, treenode_id),
                {'new_confidence': '4', 'to_connector': 'true'})
        connector = TreenodeConnector.objects.filter(id=treenode_connector_id).get()
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'success'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(4, connector.confidence)

        response = self.client.post(
                '/%d/%d/confidence/update' % (self.test_project_id, treenode_id),
                {'new_confidence': '5', 'to_connector': 'true'})
        connector = TreenodeConnector.objects.filter(id=treenode_connector_id).get()
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'success'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(5, connector.confidence)

    def test_create_connector(self):
        self.fake_authentication()
        connector_count = Connector.objects.all().count()
        response = self.client.post(
                '/%d/connector/create' % self.test_project_id,
                {'x': 111, 'y': 222, 'z': 333, 'confidence': 3})
        parsed_response = json.loads(response.content)
        self.assertEqual(response.status_code, 200)
        self.assertTrue('connector_id' in parsed_response.keys())
        connector_id = parsed_response['connector_id']

        new_connector = Connector.objects.filter(id=connector_id).get()
        self.assertEqual(111, new_connector.location.x)
        self.assertEqual(222, new_connector.location.y)
        self.assertEqual(333, new_connector.location.z)
        self.assertEqual(3, new_connector.confidence)
        self.assertEqual(connector_count + 1, Connector.objects.all().count())

    def test_delete_connector(self):
        self.fake_authentication()
        connector_id = 356
        connector = Connector.objects.get(id=connector_id)
        connector_count = Connector.objects.all().count()
        treenode_connector_count = TreenodeConnector.objects.all().count()
        response = self.client.post(
                '/%d/connector/delete' % self.test_project_id,
                {'connector_id': connector_id})
        parsed_response = json.loads(response.content)
        expected_result = {
                'message': 'Removed connector and class_instances',
                'connector_id': 356}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(connector_count - 1, Connector.objects.all().count())
        self.assertEqual(treenode_connector_count - 3, TreenodeConnector.objects.all().count())
        self.assertEqual(0, Connector.objects.filter(id=connector_id).count())
        self.assertEqual(0, TreenodeConnector.objects.filter(connector=connector).count())

    def test_delete_link_failure(self):
        self.fake_authentication()
        connector_id = 202020
        treenode_id = 202020

        tc_count = TreenodeConnector.objects.all().count()
        response = self.client.post(
                '/%d/link/delete' % self.test_project_id,
                {'connector_id': connector_id, 'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'Failed to delete connector #%s from geometry domain.' % connector_id}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(tc_count, TreenodeConnector.objects.all().count())

    def test_most_recent_treenode(self):
        self.fake_authentication()

        most_recent_node_id = 2423

        skeleton_id = 2411
        treenode_id = 0  # This will not affect anything but the error message

        response = self.client.post(
                '/%d/node/most_recent' % self.test_project_id,
                {'skeleton_id': skeleton_id, 'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {
                'id': most_recent_node_id,
                'skeleton_id': skeleton_id,
                'x': 4140,
                'y': 6460,
                'z': 0,
                # 'most_recent': '2011-12-09 14:02:11.175624+01',
                # This was the result from the old PHP script. Wasn't ever used
                # however, so the change is inconsequential and duplicating the
                # old functionality hard.
                'most_recent': '2011-12-09 14:02:11.175624',
                'type': 'treenode'
                }
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_create_textlabel(self):
        self.fake_authentication()

        label_data = [
                # param-name, param values
                ('text',
                    ['baba tiki dido', 'doop op', '']),
                ('type',
                    ['text', 'bubble', 'non-valid-type']),
                ('font_name',
                    [False, False, 'Times New Roman']),
                ('font_style',
                    [False, 'bold', 'italic']),
                ('font_size',
                    [55, 4, False]),
                ('x',
                    [1, 2, 3]),
                ('y',
                    [1, 100, 233]),
                ('z',
                    [1, 0, 555]),
                ('r',
                    [1, 2, 3]),
                ('g',
                    [3, 4, 5]),
                ('b',
                    [5, 7, 9]),
                ('a',
                    [225, 225, 225]),
                ]

        label_count = Textlabel.objects.all().count()
        # Create and test labels
        for i in range(len(label_data[0][1])):
            params = {}
            # Fill request with POST-data
            for (p, values) in label_data:
                if values[i]:
                    params[p] = values[i]
            response = self.client.post(
                    '/%d/textlabel/create' % self.test_project_id,
                    params)

            parsed_response = json.loads(response.content)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(label_count + 1 + i, Textlabel.objects.all().count())
            self.assertTrue('tid' in parsed_response.keys())
            label = get_object_or_404(Textlabel, id=parsed_response['tid'])
            # label_location = TextlabelLocation.objects.get(textlabel=label.id)
            # Does not work due to TextlabelLocation table not having an id
            # column

            # For each attribute, ensure new label is in accord with input
            # label_location_data = Double3D(x=0, y=0, z=0)
            for(p, values) in label_data:
                value = values[i]
                if (value == False):
                    continue  # Do not check for default values for now

                if (p == 'type' and value != 'bubble'):
                    self.assertEqual('text', getattr(label, p))
                elif (p == 'text' and value == ''):
                    self.assertEqual('Edit this text...', getattr(label, p))
                elif (p in ['x', 'y', 'z']):
                    # setattr(label_location, p, value)
                    pass
                elif (p in ['r', 'g', 'b', 'a']):
                    # Model does not include textlabel colour at the moment
                    pass
                else:
                    self.assertEqual(value, getattr(label, p))
            # self.assertEqual(label_location_data, label_location.location)

    log_rows = [
                    [
                        'saalfeld',
                        'create_neuron',
                        '04-09-2011 13:53',
                        1.0,
                        2.0,
                        3.0,
                        'Create neuron 1 and skeleton 2'],
                    [
                        'test',
                        'change_confidence',
                        '04-09-2012 13:53',
                        1.0,
                        2.0,
                        3.0,
                        'Changed to 4'],
                    [
                        'test',
                        'change_confidence',
                        '04-07-2012 13:53',
                        2.0,
                        2.0,
                        2.0,
                        'Changed to 2']
            ]

    def test_list_logs_user_param(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/logs/list' % self.test_project_id, {'user_id': 1})
        parsed_response = json.loads(response.content)
        expected_result = {
                'iTotalDisplayRecords': 1,
                'iTotalRecords': 1,
                'aaData': [self.log_rows[0]]
                }
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_list_logs_sort(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/logs/list' % self.test_project_id, {
                    'iSortingCols': 2,
                    'iSortCol_0': 0,  # user
                    'iSortDir_0': 'ASC',
                    'iSortCol_1': 3,  # x
                    'iSortDir_1': 'DESC'
                    })
        parsed_response = json.loads(response.content)
        expected_result = {
                'iTotalDisplayRecords': 3,
                'iTotalRecords': 3,
                'aaData': [
                    self.log_rows[0], self.log_rows[2], self.log_rows[1]
                    ]
                }
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_list_logs_subset(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/logs/list' % self.test_project_id, {
                    'iDisplayStart': 1,
                    'iDisplayLength': 2
                    })
        parsed_response = json.loads(response.content)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(2, parsed_response['iTotalDisplayRecords'])
        self.assertEqual(2, parsed_response['iTotalRecords'])

    def test_list_logs_no_params(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/logs/list' % self.test_project_id, {})
        parsed_response = json.loads(response.content)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(3, parsed_response['iTotalDisplayRecords'])
        self.assertEqual(3, parsed_response['iTotalRecords'])
        self.assertTrue(self.log_rows[0] in parsed_response['aaData'])
        self.assertTrue(self.log_rows[1] in parsed_response['aaData'])
        self.assertTrue(self.log_rows[2] in parsed_response['aaData'])

    def test_create_treenode_with_existing_fragment_group(self):
        self.fake_authentication()
        relation_map = get_relation_to_id_map(self.test_project_id)
        class_map = get_class_to_id_map(self.test_project_id)
        group_id = 4
        group_name = 'Fragments'
        count_treenodes = lambda: Treenode.objects.all().count()
        count_tci_relations = lambda: TreenodeClassInstance.objects.all().count()
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_neurons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['neuron']).count()

        treenode_count = count_treenodes()
        relation_count = count_tci_relations()
        skeleton_count = count_skeletons()
        neuron_count = count_neurons()

        response = self.client.post('/%d/treenode/create' % self.test_project_id, {
            'x': 5,
            'y': 10,
            'z': 15,
            'confidence': 5,
            'parent_id': -1,
            'targetgroup': group_name,
            'radius': 2})
        parsed_response = json.loads(response.content)

        self.assertEqual(response.status_code, 200)
        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)
        self.assertEqual(group_id, int(parsed_response['fragmentgroup_id']))

        self.assertEqual(treenode_count + 1, count_treenodes())
        self.assertEqual(relation_count + 1, count_tci_relations())
        self.assertEqual(skeleton_count + 1, count_skeletons())
        self.assertEqual(neuron_count + 1, count_neurons())

        treenode_skeleton_relation = TreenodeClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['element_of'],
                treenode=parsed_response['treenode_id'],
                class_instance=parsed_response['skeleton_id'])
        neuron_skeleton_relation = ClassInstanceClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['model_of'],
                class_instance_a=parsed_response['skeleton_id'],
                class_instance_b=parsed_response['neuron_id'])
        neuron_fragments_relation = ClassInstanceClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['part_of'],
                class_instance_a=parsed_response['neuron_id'],
                class_instance_b=group_id)
        neuron_log = Log.objects.filter(
                project=self.test_project_id,
                operation_type='create_neuron',
                freetext='Create neuron %s and skeleton %s' % (parsed_response['neuron_id'], parsed_response['skeleton_id']))

        self.assertEqual(1, treenode_skeleton_relation.count())
        self.assertEqual(1, neuron_skeleton_relation.count())
        self.assertEqual(1, neuron_fragments_relation.count())
        self.assertEqual(1, neuron_log.count())
        neuron_log_location = neuron_log[0].location
        self.assertEqual(5, neuron_log_location.x)
        self.assertEqual(10, neuron_log_location.y)
        self.assertEqual(15, neuron_log_location.z)

    def test_create_treenode_without_existing_fragment_group(self):
        self.fake_authentication()
        relation_map = get_relation_to_id_map(self.test_project_id)
        class_map = get_class_to_id_map(self.test_project_id)
        count_treenodes = lambda: Treenode.objects.all().count()
        count_tci_relations = lambda: TreenodeClassInstance.objects.all().count()
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_neurons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['neuron']).count()
        treenode_count = count_treenodes()
        relation_count = count_tci_relations()
        skeleton_count = count_skeletons()
        neuron_count = count_neurons()

        response = self.client.post('/%d/treenode/create' % self.test_project_id, {
            'x': 5,
            'y': 10,
            'z': 15,
            'confidence': 5,
            'parent_id': -1,
            'radius': 2})
        parsed_response = json.loads(response.content)

        self.assertEqual(response.status_code, 200)
        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)

        self.assertEqual(treenode_count + 1, count_treenodes())
        self.assertEqual(relation_count + 1, count_tci_relations())
        self.assertEqual(skeleton_count + 1, count_skeletons())
        self.assertEqual(neuron_count + 1, count_neurons())

        treenode_skeleton_relation = TreenodeClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['element_of'],
                treenode=parsed_response['treenode_id'],
                class_instance=parsed_response['skeleton_id'])
        neuron_skeleton_relation = ClassInstanceClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['model_of'],
                class_instance_a=parsed_response['skeleton_id'],
                class_instance_b=parsed_response['neuron_id'])
        neuron_fragments_relation = ClassInstanceClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['part_of'],
                class_instance_a=parsed_response['neuron_id'],
                class_instance_b=parsed_response['fragmentgroup_id'])
        neuron_log = Log.objects.filter(
                project=self.test_project_id,
                operation_type='create_neuron',
                freetext='Create neuron %s and skeleton %s' % (parsed_response['neuron_id'], parsed_response['skeleton_id']))
        fragment_group = ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['group'],
                id=parsed_response['fragmentgroup_id'])

        root = ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['root'])[0]
        frag_group_root_relation = ClassInstanceClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['part_of'],
                class_instance_a=fragment_group[0],
                class_instance_b=root)

        self.assertEqual(1, treenode_skeleton_relation.count())
        self.assertEqual(1, neuron_skeleton_relation.count())
        self.assertEqual(1, neuron_fragments_relation.count())
        self.assertEqual(1, neuron_log.count())
        self.assertEqual(1, fragment_group.count())
        self.assertEqual(1, frag_group_root_relation.count())
        neuron_log_location = neuron_log[0].location
        self.assertEqual(5, neuron_log_location.x)
        self.assertEqual(10, neuron_log_location.y)
        self.assertEqual(15, neuron_log_location.z)

    def test_create_treenode_with_existing_neuron(self):
        self.fake_authentication()
        relation_map = get_relation_to_id_map(self.test_project_id)
        class_map = get_class_to_id_map(self.test_project_id)
        neuron_id = 2389
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_treenodes = lambda: Treenode.objects.all().count()
        count_tci_relations = lambda: TreenodeClassInstance.objects.all().count()

        treenode_count = count_treenodes()
        relation_count = count_tci_relations()
        skeleton_count = count_skeletons()

        response = self.client.post('/%d/treenode/create' % self.test_project_id, {
            'x': 5,
            'y': 10,
            'z': 15,
            'confidence': 5,
            'parent_id': -1,
            'useneuron': neuron_id,
            'radius': 2})
        parsed_response = json.loads(response.content)

        self.assertEqual(response.status_code, 200)
        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)
        self.assertEqual(neuron_id, int(parsed_response['neuron_id']))

        self.assertEqual(treenode_count + 1, count_treenodes())
        self.assertEqual(relation_count + 1, count_tci_relations())
        self.assertEqual(skeleton_count + 1, count_skeletons())

        treenode_skeleton_relation = TreenodeClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['element_of'],
                treenode=parsed_response['treenode_id'],
                class_instance=parsed_response['skeleton_id'])
        neuron_skeleton_relation = ClassInstanceClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['model_of'],
                class_instance_a=parsed_response['skeleton_id'],
                class_instance_b=neuron_id)

        self.assertEqual(1, treenode_skeleton_relation.count())
        self.assertEqual(1, neuron_skeleton_relation.count())

    def test_create_treenode_with_nonexisting_parent_failure(self):
        self.fake_authentication()
        parent_id = 555555
        treenode_count = Treenode.objects.all().count()
        relation_count = TreenodeClassInstance.objects.all().count()
        response = self.client.post('/%d/treenode/create' % self.test_project_id, {
            'x': 5,
            'y': 10,
            'z': 15,
            'confidence': 5,
            'parent_id': parent_id,
            'radius': 2})
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'Can not find skeleton for parent treenode %d in this project.' % parent_id}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(treenode_count, Treenode.objects.all().count())
        self.assertEqual(relation_count, TreenodeClassInstance.objects.all().count())

    def test_delete_root_treenode_with_children_failure(self):
        self.fake_authentication()
        treenode_id = 367

        tn_count = Treenode.objects.all().count()
        child_count = Treenode.objects.filter(parent=treenode_id).count()
        response = self.client.post(
                '/%d/treenode/delete' % self.test_project_id,
                {'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {'error': "You can't delete the root node when it has children."}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(1, Treenode.objects.filter(id=treenode_id).count())
        self.assertEqual(tn_count, Treenode.objects.all().count())
        self.assertEqual(child_count, Treenode.objects.filter(parent=treenode_id).count())

    def test_delete_non_root_non_parent_treenode(self):
        self.fake_authentication()
        treenode_id = 349

        tn_count = Treenode.objects.all().count()
        response = self.client.post(
                '/%d/treenode/delete' % self.test_project_id,
                {'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'Removed treenode successfully.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(0, Treenode.objects.filter(id=treenode_id).count())
        self.assertEqual(tn_count - 1, Treenode.objects.all().count())

    # TODO Generate a root treenode with no children to delete
    # def test_delete_root_treenode(self):
    #     self.fake_authentication()
    #     treenode_id = 4000

    #     treenode = Treenode.objects.filter(id=treenode_id)[0]
    #     children = Treenode.objects.filter(parent=treenode_id)
    #     self.assertEqual(0, children.count())
    #     self.assertEqual(None, treenode.parent)
    #     tn_count = Treenode.objects.all().count()

    #     response = self.client.post(
    #             '/%d/treenode/delete' % self.test_project_id,
    #             {'treenode_id': treenode_id})
    #     parsed_response = json.loads(response.content)
    #     expected_result = {'success': 'Removed treenode successfully.'}
    #     self.assertEqual(response.status_code, 200)
    #     self.assertEqual(expected_result, parsed_response)
    #     self.assertEqual(0, Treenode.objects.filter(id=treenode_id).count())
    #     self.assertEqual(tn_count - 1, Treenode.objects.all().count())

    def test_delete_non_root_treenode(self):
        self.fake_authentication()
        treenode_id = 265


        relation_map = get_relation_to_id_map(self.test_project_id)
        get_skeleton = lambda: TreenodeClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['element_of'],
                treenode=treenode_id)
        self.assertEqual(1, get_skeleton().count())

        children = Treenode.objects.filter(parent=treenode_id)
        self.assertTrue(children.count() > 0)
        tn_count = Treenode.objects.all().count()
        parent = get_object_or_404(Treenode, id=treenode_id).parent

        response = self.client.post(
                '/%d/treenode/delete' % self.test_project_id,
                {'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'Removed treenode successfully.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(0, Treenode.objects.filter(id=treenode_id).count())
        self.assertEqual(0, get_skeleton().count())
        self.assertEqual(tn_count - 1, Treenode.objects.all().count())

        for child in children:
            child_after_change = get_object_or_404(Treenode, id=child.id)
            self.assertEqual(parent, child_after_change.parent)

    def test_delete_link_success(self):
        self.fake_authentication()
        connector_id = 356
        treenode_id = 377

        tc_count = TreenodeConnector.objects.all().count()
        response = self.client.post(
                '/%d/link/delete' % self.test_project_id,
                {'connector_id': connector_id, 'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {'result': 'Removed treenode to connector link'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(0, TreenodeConnector.objects.filter(connector=connector_id, treenode=treenode_id).count())
        self.assertEqual(tc_count - 1, TreenodeConnector.objects.all().count())

    def test_treenode_info_too_many_neurons_failure(self):
        self.fake_authentication()
        treenode_id = 55555

        response = self.client.post(
                '/%d/treenode/info' % self.test_project_id,
                {'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'No skeleton and neuron for treenode %s' % treenode_id}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_treenode_info_nonexisting_treenode_failure(self):
        self.fake_authentication()
        treenode_id = 55555

        response = self.client.post(
                '/%d/treenode/info' % self.test_project_id,
                {'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'No skeleton and neuron for treenode %s' % treenode_id}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_treenode_info(self):
        self.fake_authentication()
        treenode_id = 239

        response = self.client.post(
                '/%d/treenode/info' % self.test_project_id,
                {'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {'skeleton_id': 235, 'neuron_id': 233, 'skeleton_name': 'skeleton 235', 'neuron_name': 'branched neuron'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_unread_messages(self):
        self.fake_authentication()

        response = self.client.post(
                '/messages/unread', {})
        parsed_response = json.loads(response.content)
        expected_result = {
                '0': {
                    'action': 'http://www.example.com/message2',
                    'id': 2,
                    'text': 'Contents of message 2.',
                    'time':  '2011-12-20 16:46:01.360422',
                    'time_formatted': '2011-12-20 16:46:01 CET',
                    'title': 'Message 2'},
                '1': {
                    'action': 'http://www.example.com/message1',
                    'id': 1,
                    'text': 'Contents of message 1.',
                    'time': '2011-12-19 16:46:01.360422',
                    'time_formatted': '2011-12-19 16:46:01 CET',
                    'title': 'Message 1'}}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_create_postsynaptic_link_success(self):
        from_id = 237
        to_id = 432
        link_type = 'postsynaptic_to'
        self.fake_authentication()
        response = self.client.post(
                '/%d/link/create' % self.test_project_id,
                {
                    'from_id': from_id,
                    'to_id': to_id,
                    'link_type': link_type
                    })
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'success'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_create_presynaptic_link_fail_due_to_other_presynaptic_links(self):
        from_id = 237
        to_id = 432
        link_type = 'presynaptic_to'
        self.fake_authentication()
        response = self.client.post(
                '/%d/link/create' % self.test_project_id,
                {
                    'from_id': from_id,
                    'to_id': to_id,
                    'link_type': link_type
                    })
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'Connector %s does not have zero presynaptic connections.' % to_id}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    # TODO Create connector with no previous presynaptic links
    # def test_create_presynaptic_link_success(self):
    #     from_id = 237
    #     to_id = 2401
    #     link_type = 'presynaptic_to'
    #     self.fake_authentication()
    #     response = self.client.post(
    #             '/%d/link/create' % self.test_project_id,
    #             {
    #                 'from_id': from_id,
    #                 'to_id': to_id,
    #                 'link_type': link_type
    #                 })
    #     parsed_response = json.loads(response.content)
    #     expected_result = {'message': 'success'}
    #     self.assertEqual(response.status_code, 200)
    #     self.assertEqual(expected_result, parsed_response)


"""
    def test_node_list(self):
        self.fake_authentication()
        expected_result = [{"id":"367","parentid":None,"x":"7030","y":"1980","z":"0","confidence":"5","user_id":"3","radius":"-1","z_diff":"0","skeleton_id":"361","type":"treenode"},
                           {"id":"377","parentid":None,"x":"7620","y":"2890","z":"0","confidence":"5","user_id":"3","radius":"-1","z_diff":"0","skeleton_id":"373","type":"treenode"},
                           {"id":"393","parentid":"391","x":"6910","y":"990","z":"0","confidence":"5","user_id":"3","radius":"-1","z_diff":"0","skeleton_id":"361","type":"treenode"},
                           {"id":"387","parentid":"385","x":"9030","y":"1480","z":"0","confidence":"5","user_id":"3","radius":"-1","z_diff":"0","skeleton_id":"361","type":"treenode"},
                           {"id":"385","parentid":"383","x":"8530","y":"1820","z":"0","confidence":"5","user_id":"3","radius":"-1","z_diff":"0","skeleton_id":"361","type":"treenode"},
                           {"id":"403","parentid":"377","x":"7840","y":"2380","z":"0","confidence":"5","user_id":"3","radius":"-1","z_diff":"0","skeleton_id":"373","type":"treenode"},
                           {"id":"405","parentid":"377","x":"7390","y":"3510","z":"0","confidence":"5","user_id":"3","radius":"-1","z_diff":"0","skeleton_id":"373","type":"treenode"},
                           {"id":"383","parentid":"367","x":"7850","y":"1970","z":"0","confidence":"5","user_id":"3","radius":"-1","z_diff":"0","skeleton_id":"361","type":"treenode"},
                           {"id":"391","parentid":"367","x":"6740","y":"1530","z":"0","confidence":"5","user_id":"3","radius":"-1","z_diff":"0","skeleton_id":"361","type":"treenode"},
                           {"id":"356","x":"6730","y":"2700","z":"0","user_id":"3","z_diff":"0","type":"location",
                            "pre":[{"lid":"356","tnid":"285","lcname":"synapse 354","tcname":"presynaptic terminal 355"}],
                            "post":[{"lid":"356","tnid":"367","lcname":"synapse 354","tcname":"postsynaptic terminal 369"},
                                    {"lid":"356","tnid":"377","lcname":"synapse 354","tcname":"postsynaptic terminal 379"}]}]
        response = self.client.get('/%d/node-list' % (self.test_project_id,),
                                   {'sid': 3,
                                    'z': 0,
                                    'top': 745,
                                    'left': 6575,
                                    'width': 2720,
                                    'height': 2960,
                                    'zres': 9})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        self.assertEqual(len(expected_result), len(parsed_response))
        node_393_found = False
        node_367_found = False
        node_356_found = False
        for node_dict in expected_result:
            if node_dict['id'] == '356':
                node_356_found = True
                self.assertEqual(node_dict['type'], 'location')
                self.assertTrue('pre' in node_dict)
                self.assertTrue('post' in node_dict)
            else:
                self.assertEqual(node_dict['type'], 'treenode')
                self.assertTrue('pre' not in node_dict)
                self.assertTrue('post' not in node_dict)
            # Check two particular nodes:
            if node_dict['id'] == '393':
                node_393_found = True
                self.assertEqual(node_dict['parentid'], '391')
                self.assertEqual(node_dict["x"], "6910")
                self.assertEqual(node_dict["y"], "990")
                self.assertEqual(node_dict["z"], "0")
                self.assertEqual(node_dict["confidence"], "5")
                self.assertEqual(node_dict["user_id"], "3")
                self.assertEqual(node_dict["radius"], "-1")
                self.assertEqual(node_dict["z_diff"], "0")
                self.assertEqual(node_dict["skeleton_id"], "361")
            elif node_dict['id'] == '367':
                node_367_found = True
                self.assertEqual(node_dict["id"], "367")
                self.assertEqual(node_dict["parentid"], None)
                self.assertEqual(node_dict["x"], "7030")
                self.assertEqual(node_dict["y"], "1980")
                self.assertEqual(node_dict["z"], "0")
                self.assertEqual(node_dict["confidence"], "5")
                self.assertEqual(node_dict["user_id"], "3")
                self.assertEqual(node_dict["radius"], "-1")
                self.assertEqual(node_dict["z_diff"], "0")
                self.assertEqual(node_dict["skeleton_id"], "361")
                self.assertEqual(node_dict["type"], "treenode")
        self.assertTrue(node_356_found)
        self.assertTrue(node_367_found)
        self.assertTrue(node_393_found)
"""


class TreenodeTests(TestCase):

    def setUp(self):
        ensure_schema_and_data_exist()
        self.test_project_id = 3

    def test_find_all_treenodes(self):

        # These next two could be done in one query, of course:
        neuron = ClassInstance.objects.get(name='branched neuron',
                                           class_column__class_name='neuron')
        skeleton = ClassInstance.objects.get(
            class_column__class_name='skeleton',
            cici_via_a__relation__relation_name='model_of',
            cici_via_a__class_instance_b=neuron)

        tns = Treenode.objects.filter(
            treenodeclassinstance__class_instance=skeleton).order_by('id')

        self.assertEqual(len(tns), 28)

        self.assertEqual(tns[0].id, 237)

        # That's a root node, so parent should be None:
        self.assertTrue(tns[0].parent is None)

        # But the next should have this as a parent:
        self.assertEqual(tns[1].parent, tns[0])

        x = tns[0].location.x
        y = tns[0].location.y
        z = tns[0].location.z

        self.assertTrue(1030 < x < 1090)
        self.assertTrue(3000 < y < 3060)
        self.assertTrue(-30 < z < 30)

        # There should be 2 connectors attached to the skeleton via
        # treenodes:

        connectors = Connector.objects.filter(
            treenodeconnector__treenode__treenodeclassinstance__class_instance=skeleton)
        self.assertEqual(len(connectors), 3)
