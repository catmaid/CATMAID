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

from models import Project, Stack, ProjectStack
from models import ClassInstance, Log, Message, TextlabelLocation
from models import Treenode, Connector, TreenodeConnector, User
from models import Textlabel, TreenodeClassInstance, ClassInstanceClassInstance
from .fields import Double3D, Integer3D
from control.common import get_relation_to_id_map, get_class_to_id_map


class SimpleTest(TestCase):
    def test_basic_addition(self):
        """
        Tests that 1 + 1 always equals 2.
        """
        self.assertEqual(1 + 1, 2)

class TransactionTests(TransactionTestCase):
    fixtures = ['catmaid_testdata']

    def test_successful_commit(self):
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

    def test_report_error_dict(self):
        def insert_user():
            User(name='matri', pwd='boop', longname='Matthieu Ricard').save()
            raise Exception({'error': 'catch me if you can'})
            return HttpResponse(json.dumps({'should not': 'return this'}))

        User.objects.all().delete()
        response = insert_user()
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'catch me if you can'}
        self.assertEqual(0, User.objects.all().count())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_report_error_string(self):
        def insert_user():
            User(name='matri', pwd='boop', longname='Matthieu Ricard').save()
            raise Exception('catch me if you can')
            return HttpResponse(json.dumps({'should not': 'return this'}))

        User.objects.all().delete()
        response = insert_user()
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'catch me if you can'}
        self.assertEqual(0, User.objects.all().count())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_report_error_unrecognized_argument(self):
        def insert_user():
            User(name='matri', pwd='boop', longname='Matthieu Ricard').save()
            raise Exception(5)
            return HttpResponse(json.dumps({'should not': 'return this'}))

        User.objects.all().delete()
        response = insert_user()
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'Unknown error.'}
        self.assertEqual(0, User.objects.all().count())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_catch_404(self):
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
        def insert_user():
            User(name='matri', pwd='boop', longname='Matthieu Ricard').save()
            raise Exception()
            return HttpResponse(json.dumps({'should not': 'return this'}))

        User.objects.all().delete()
        with self.assertRaises(Exception):
            insert_user()
        self.assertEqual(0, User.objects.all().count())


class InsertionTest(TestCase):
    """ This test case insers various model objects and tests if this is done as
    expected. No fixture data is needed for this test.
    """
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
    fixtures = ['catmaid_testdata']

    def setUp(self):
        self.test_project_id = 3

    def test_find_all_neurons(self):
        all_neurons = ClassInstance.objects.filter(class_column__class_name='neuron',
                                                   project=self.test_project_id)
        self.assertEqual(all_neurons.count(), 11)

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
    m = [re.split("\s+", x) for x in s.splitlines() if not re.search('^\s*(#|$)', x)]
    return sorted(m, key=lambda x: x[0])


class ViewPageTests(TestCase):
    fixtures = ['catmaid_testdata']

    def setUp(self):
        self.test_project_id = 3
        self.client = Client()

        user = User.objects.create_user('temporary',
            'temporary@gmail.com', 'temporary')

    def fake_authentication(self):
        self.client.login(username='temporary', password='temporary')

    def compare_swc_data(self, s1, s2):
        m1 = swc_string_to_sorted_matrix(s1)
        m2 = swc_string_to_sorted_matrix(s2)
        self.assertEqual(len(m1), len(m2))

        fields = ['id', 'type', 'x', 'y', 'z', 'radius', 'parent']
        d = dict((x, i) for (i, x) in enumerate(fields))

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

    def test_user_project_permissions_not_logged_in(self):
        response = self.client.get('/permissions')
        parsed_response = json.loads(response.content)
        expected_result = []
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_user_project_permissions(self):
        self.fake_authentication()
        response = self.client.get('/permissions')
        parsed_response = json.loads(response.content)
        expected_result = {
                '1': {'can_edit_any': True, 'can_view_any': True},
                '2': {'can_edit_any': True, 'can_view_any': True},
                '3': {'can_edit_any': True, 'can_view_any': True},
                '5': {'can_edit_any': True, 'can_view_any': True}}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

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
        nods = {"7": "7",
                "237": "237",
                "367": "367",
                "377": "377",
                "417": "417",
                "409": "409",
                "407": "407",
                "399": "399",
                "397": "397",
                "395": "395",
                "393": "393",
                "387": "387",
                "385": "385",
                "403": "403",
                "405": "405",
                "383": "383",
                "391": "391",
                "415": "415",
                "289": "289",
                "285": "285",
                "283": "283",
                "281": "281",
                "277": "277",
                "275": "275",
                "273": "273",
                "271": "271",
                "279": "279",
                "267": "267",
                "269": "269",
                "265": "265",
                "261": "261",
                "259": "259",
                "257": "257",
                "255": "255",
                "263": "263",
                "253": "253",
                "251": "251",
                "249": "249",
                "247": "247",
                "245": "245",
                "243": "243",
                "241": "241",
                "239": "239",
                "356": "356",
                "421": "421",
                "432": "432"}
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
        response = self.client.get('/%d/stats/nodecount' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        values = parsed_response['values']
        users = parsed_response['users']
        values_and_users = zip(values, users)
        for t in values_and_users:
            if t[0] == 6:
                self.assertEqual(t[1], 'test (6)')
            elif t[0] == 83:
                self.assertEqual(t[1], 'gerhard (83)')
            else:
                raise Exception("Unexpected value in returned stats: " + str(t))

    def test_stats_summary(self):
        self.fake_authentication()
        response = self.client.get('/%d/stats/summary' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        expected_result = {u"proj_users": 2,
                           u'proj_presyn': 0,
                           u'proj_postsyn': 0,
                           u'proj_synapses': 0,
                           u"proj_neurons": 11,
                           u"proj_treenodes": 89,
                           u"proj_skeletons": 10,
                           u"proj_textlabels": 2,
                           u"proj_tags": 4}
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result, parsed_response)

    def test_multiple_treenodes(self):
        self.fake_authentication()
        response = self.client.get('/%d/multiple-presynaptic-terminals' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)

    def test_update_treenode_table_nonexisting_property(self):
        self.fake_authentication()
        property_value = 4
        property_name = 'And though sickly with disease we trod the world asunder.'
        treenode_id = 239
        response = self.client.post(
                '/%d/treenode/table/update' % (self.test_project_id), {
                'value': property_value,
                'id': treenode_id,
                'type': property_name})
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'Can only modify confidence and radius.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_update_treenode_table_confidence(self):
        self.fake_authentication()
        property_value = 4
        property_name = 'confidence'
        treenode_id = 239
        response = self.client.post(
                '/%d/treenode/table/update' % (self.test_project_id), {
                'value': property_value,
                'id': treenode_id,
                'type': property_name})
        parsed_response = json.loads(response.content)
        expected_result = {'success': 'Updated %s of treenode %s to %s.' % (property_name, treenode_id, property_value)}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(property_value, get_object_or_404(Treenode, id=treenode_id).confidence)

    def test_update_treenode_table_radius(self):
        self.fake_authentication()
        property_value = 4
        property_name = 'radius'
        treenode_id = 239
        response = self.client.post(
                '/%d/treenode/table/update' % (self.test_project_id), {
                'value': property_value,
                'id': treenode_id,
                'type': property_name})
        parsed_response = json.loads(response.content)
        expected_result = {'success': 'Updated %s of treenode %s to %s.' % (property_name, treenode_id, property_value)}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(property_value, get_object_or_404(Treenode, id=treenode_id).radius)

    def test_list_treenode_table_filtering(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/treenode/table/list' % (self.test_project_id), {
                    'iDisplayStart': 0,
                    'iDisplayLength': -1,
                    'iSortingCols': 1,
                    'iSortCol_0': 0,
                    'sSortDir_0': 'asc',
                    'skeleton_0': 235,
                    'skeleton_nr': 1,
                    'sSearch_1': 'LR',
                    'sSearch_2': 'todo',
                    'pid': 3,
                    'stack_id': 3})
        self.assertEqual(response.status_code, 200)
        expected_result = {
                "iTotalRecords": 28,
                "iTotalDisplayRecords": 28,
                "aaData": [
                    ["261", "L", "TODO", "5", "2820.00", "1345.00", "0.00", 0, "-1", "gerhard", "05-12-2011 19:51", "-1"]]}
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result['iTotalRecords'], parsed_response['iTotalRecords'])
        self.assertEqual(expected_result['iTotalDisplayRecords'], parsed_response['iTotalDisplayRecords'])
        # Check each aaData row instead of everything at once for more granular
        # error reporting.
        for (expected, parsed) in zip(expected_result['aaData'], parsed_response['aaData']):
            self.assertEqual(expected, parsed)

    def test_list_treenode_table_sorting_and_tag(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/treenode/table/list' % (self.test_project_id), {
                    'iDisplayStart': 0,
                    'iDisplayLength': -1,
                    'iSortingCols': 1,
                    'iSortCol_0': 4,
                    'sSortDir_0': 'asc',
                    'skeleton_0': 373,
                    'skeleton_nr': 1,
                    'pid': 3,
                    'stack_id': 3})
        self.assertEqual(response.status_code, 200)
        expected_result = {
                "iTotalRecords": 5,
                "iTotalDisplayRecords": 5,
                "aaData": [
                    ["409", "L", "", "5", "6630.00", "4330.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
                    ["407", "S", "", "5", "7080.00", "3960.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
                    ["405", "S", "", "5", "7390.00", "3510.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
                    ["377", "R", "", "5", "7620.00", "2890.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
                    ["403", "L", "uncertain end", "5", "7840.00", "2380.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"]]}
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result['iTotalRecords'], parsed_response['iTotalRecords'])
        self.assertEqual(expected_result['iTotalDisplayRecords'], parsed_response['iTotalDisplayRecords'])
        # Check each aaData row instead of everything at once for more granular
        # error reporting.
        for (expected, parsed) in zip(expected_result['aaData'], parsed_response['aaData']):
            self.assertEqual(expected, parsed)

    def test_list_treenode_table_simple(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/treenode/table/list' % (self.test_project_id), {
                    'iDisplayStart': 0,
                    'iDisplayLength': -1,
                    'iSortingCols': 1,
                    'iSortCol_0': 0,
                    'sSortDir_0': 'asc',
                    'skeleton_0': 235,
                    'skeleton_nr': 1,
                    'pid': 3,
                    'stack_id': 3})
        self.assertEqual(response.status_code, 200)
        expected_result = {"iTotalRecords": 28, "iTotalDisplayRecords": 28, "aaData": [
            ["237", "R", "", "5", "1065.00", "3035.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["239", "S", "", "5", "1135.00", "2800.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["241", "S", "", "5", "1340.00", "2660.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["243", "S", "", "5", "1780.00", "2570.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["245", "S", "", "5", "1970.00", "2595.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["247", "S", "", "5", "2610.00", "2700.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["249", "S", "", "5", "2815.00", "2590.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["251", "S", "", "5", "3380.00", "2330.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["253", "B", "", "5", "3685.00", "2160.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["255", "S", "", "5", "3850.00", "1790.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["257", "S", "", "5", "3825.00", "1480.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["259", "S", "", "5", "3445.00", "1385.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["261", "L", "TODO", "5", "2820.00", "1345.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["263", "S", "", "5", "3915.00", "2105.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["265", "B", "", "5", "4570.00", "2125.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["267", "S", "", "5", "5400.00", "2200.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["269", "S", "", "5", "4820.00", "1900.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["271", "S", "", "5", "5090.00", "1675.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["273", "S", "", "5", "5265.00", "1610.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["275", "S", "", "5", "5800.00", "1560.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["277", "L", "", "5", "6090.00", "1550.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["279", "S", "", "5", "5530.00", "2465.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["281", "S", "", "5", "5675.00", "2635.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["283", "S", "", "5", "5985.00", "2745.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["285", "S", "", "5", "6100.00", "2980.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["289", "S", "", "5", "6210.00", "3480.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["415", "S", "", "5", "5810.00", "3950.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"],
            ["417", "L", "", "5", "4990.00", "4200.00", "0.00", 0, "-1.0", "gerhard", "05-12-2011 19:51", "-1"]]}
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result['iTotalRecords'], parsed_response['iTotalRecords'])
        self.assertEqual(expected_result['iTotalDisplayRecords'], parsed_response['iTotalDisplayRecords'])
        # Check each aaData row instead of everything at once for more granular
        # error reporting.
        for (expected, parsed) in zip(expected_result['aaData'], parsed_response['aaData']):
            self.assertEqual(expected, parsed)

    def test_list_treenode_table_empty(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/treenode/table/list' % (self.test_project_id), {
                    'iDisplayStart': 0,
                    'iDisplayLength': -1,
                    'iSortingCols': 1,
                    'iSortCol_0': 0,
                    'sSortDir_0': 'asc',
                    'skeleton_0': None,
                    'skeleton_nr': 1,
                    'stack_id': 3}
                )
        self.assertEqual(response.status_code, 200)
        expected_result = {"iTotalRecords": 0, "iTotalDisplayRecords": 0, "aaData": []}
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result, parsed_response)

    def test_treenode_create_interpolated_fail_no_parent(self):
        self.fake_authentication()
        x = 585
        y = 4245
        z = 0
        radius = -1
        confidence = 5
        parent_id = 55555555
        response = self.client.post(
                '/%d/treenode/create/interpolated' % self.test_project_id, {
                    'parent_id': parent_id,
                    'x': x,
                    'y': y,
                    'z': z,
                    'radius': radius,
                    'confidence': confidence,
                    'atnx': 6210,
                    'atny': 3480,
                    'atnz': 0,
                    'resx': 5,
                    'resy': 5,
                    'resz': 9})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'Can not find skeleton for parent treenode %s in this project.' % parent_id}
        self.assertEqual(expected_result, parsed_response)

    def test_treenode_create_interpolated_single_new_node(self):
        self.fake_authentication()
        x = 585
        y = 4245
        z = 0
        radius = -1
        confidence = 5
        parent_id = 289
        response = self.client.post(
                '/%d/treenode/create/interpolated' % self.test_project_id, {
                    'parent_id': parent_id,
                    'x': x,
                    'y': y,
                    'z': z,
                    'radius': radius,
                    'confidence': confidence,
                    'atnx': 6210,
                    'atny': 3480,
                    'atnz': 0,
                    'resx': 5,
                    'resy': 5,
                    'resz': 9})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        treenode = get_object_or_404(Treenode, id=parsed_response['treenode_id'])
        self.assertEqual(confidence, treenode.confidence)
        self.assertEqual(radius, treenode.radius)
        self.assertEqual(x, treenode.location.x)
        self.assertEqual(y, treenode.location.y)
        self.assertEqual(z, treenode.location.z)
        self.assertEqual(parsed_response['skeleton_id'], treenode.skeleton_id)
        self.assertEqual(get_object_or_404(Treenode, id=parent_id).skeleton_id, treenode.skeleton_id)

    def test_treenode_create_interpolated_many_new_nodes(self):
        self.fake_authentication()
        x = 9135
        y = 1215
        z = 36
        radius = -1
        confidence = 5
        parent_id = 2368

        count_treenodes = lambda: Treenode.objects.all().count()
        count_tci_relations = lambda: TreenodeClassInstance.objects.all().count()

        treenode_count = count_treenodes()
        relation_count = count_tci_relations()

        response = self.client.post(
                '/%d/treenode/create/interpolated' % self.test_project_id, {
                    'parent_id': parent_id,
                    'x': x,
                    'y': y,
                    'z': z,
                    'radius': radius,
                    'confidence': confidence,
                    'atnx': 1820,
                    'atny': 5390,
                    'atnz': 0,
                    'resx': 5,
                    'resy': 5,
                    'resz': 9})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        treenode = get_object_or_404(Treenode, id=parsed_response['treenode_id'])
        self.assertEqual(confidence, treenode.confidence)
        self.assertEqual(radius, treenode.radius)
        self.assertEqual(x, treenode.location.x)
        self.assertEqual(y, treenode.location.y)
        self.assertEqual(z, treenode.location.z)
        self.assertEqual(parsed_response['skeleton_id'], treenode.skeleton_id)
        self.assertEqual(get_object_or_404(Treenode, id=parent_id).skeleton_id, treenode.skeleton_id)
        # Ensure nodes in-between have been created
        self.assertEqual(4 + treenode_count, count_treenodes())
        self.assertEqual(4 + relation_count, count_tci_relations())
        # Ensure the returned treenode has the latest edition time
        self.assertEqual(treenode, Treenode.objects.latest('edition_time'))

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

    def test_tree_object_list_no_parent(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/tree_object/list' % self.test_project_id, {
                    'parentid': 0})
        parsed_response = json.loads(response.content)
        expected_response = [{
            'data': {'title': 'neuropile'},
            'attr': {'id': 'node_2323', 'rel': 'root'},
            'state': 'closed'}]
        self.assertEqual(expected_response, parsed_response)
        self.assertEqual(response.status_code, 200)

    def test_tree_object_list_empty(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/tree_object/list' % self.test_project_id, {
                    'parentid': 1,
                    'parentname': 'dull skeleton (gerhard)'})
        parsed_response = json.loads(response.content)
        expected_response = []
        self.assertEqual(expected_response, parsed_response)
        self.assertEqual(response.status_code, 200)

    def test_tree_object_list_groups(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/tree_object/list' % self.test_project_id, {
                    'parentid': 2323,
                    'parentname': 'neuropile'})
        parsed_response = json.loads(response.content)
        expected_response = [{
            'data': {'title': 'Fragments'},
            'attr': {'id': 'node_4', 'rel': 'group'},
            'state': 'closed'},
            {'data': {'title': 'group'},
            'attr': {'id': 'node_231', 'rel': 'group'},
            'state': 'closed'},
            {'data': {'title': 'Isolated synaptic terminals'},
            'attr': {'id': 'node_364', 'rel': 'group'},
            'state': 'closed'}]
        self.assertEqual(expected_response, parsed_response)
        self.assertEqual(response.status_code, 200)

    def test_tree_object_list_isol_case(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/tree_object/list' % self.test_project_id, {
                    'parentid': 364,
                    'parentname': 'Isolated synaptic terminals'})
        parsed_response = json.loads(response.content)
        expected_response = [{
            'data': {'title': 'downstream-A'},
            'attr': {'id': 'node_374', 'rel': 'neuron'},
            'state': 'closed'},
            {'data': {'title':'downstream-B'},
            'attr': {'id': 'node_362', 'rel': 'neuron'},
            'state': 'closed'}]
        self.assertEqual(expected_response, parsed_response)
        self.assertEqual(response.status_code, 200)

    def test_tree_object_list_skeleton(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/tree_object/list' % self.test_project_id, {
                    'parentid': 2,
                    'parentname': 'dull neuron'})
        parsed_response = json.loads(response.content)
        expected_response = [
                {'data': {'title': 'dull skeleton (gerhard)'},
                'attr': {'id': 'node_1', 'rel': 'skeleton'},
                'state': 'closed'}]
        self.assertEqual(expected_response, parsed_response)
        self.assertEqual(response.status_code, 200)

    def test_tree_object_list_neurons(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/tree_object/list' % self.test_project_id, {
                    'parentid': 4,
                    'parentname': 'Fragments'})
        parsed_response = json.loads(response.content)
        expected_response = [
                {'data': {'title': 'dull neuron'},
                'attr': {'id': 'node_2', 'rel': 'neuron'},
                'state': 'closed'},
                {'data': {'title': 'neuron 2365'},
                'attr': {'id': 'node_2365', 'rel': 'neuron'},
                'state': 'closed'},
                {'data': {'title': 'neuron 2381'},
                'attr': {'id': 'node_2381', 'rel': 'neuron'},
                'state': 'closed'},
                {'data': {'title': 'neuron 2389'},
                'attr': {'id': 'node_2389', 'rel': 'neuron'},
                'state': 'closed'},
                {'data': {'title': 'neuron 2412'},
                'attr': {'id': 'node_2412', 'rel': 'neuron'},
                'state': 'closed'},
                {'data': {'title': 'neuron 2434'},
                'attr': {'id': 'node_2434', 'rel': 'neuron'},
                'state': 'closed'},
                {'data': {'title': 'neuron 2441'},
                'attr': {'id': 'node_2441', 'rel': 'neuron'},
                'state': 'closed'},
                {'data': {'title': 'neuron 2452'},
                'attr': {'id': 'node_2452', 'rel': 'neuron'},
                'state': 'closed'}]
        self.assertEqual(expected_response, parsed_response)
        self.assertEqual(response.status_code, 200)

    def test_tree_object_expand(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/tree_object/expand' % self.test_project_id,
                {'skeleton_id': 235})
        parsed_response = json.loads(response.content)
        expected_response = [2323, 231, 233, 235]
        self.assertEqual(expected_response, parsed_response)
        self.assertEqual(response.status_code, 200)

    def test_list_connector_empty(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/list' % self.test_project_id, {
                    'iDisplayStart': 0,
                    'iDisplayLength': 25,
                    'iSortingCols': 1,
                    'iSortCol_0': 0,
                    'sSortDir_0': 'asc',
                    'relation_type': 1,
                    'skeleton_id': 0})
        parsed_response = json.loads(response.content)
        expected_result = {'iTotalRecords': 0, 'iTotalDisplayRecords': 0, 'aaData': []}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_list_connector_outgoing_with_sorting_and_paging(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/list' % self.test_project_id, {
                    'iDisplayStart': 1,
                    'iDisplayLength': 2,
                    'iSortingCols': 1,
                    'iSortCol_0': 6,
                    'sSortDir_0': 'desc',
                    'relation_type': 1,
                    'skeleton_id': 235})
        parsed_response = json.loads(response.content)
        expected_result = {
                'iTotalRecords': 4,
                'iTotalDisplayRecords': 4,
                'aaData': [
                    ["421", "373", "6630.00", "4330.00", "0.00", "", "5", "gerhard", "409"],
                    ["356", "373", "7620.00", "2890.00", "0.00", "", "5", "gerhard", "377"]]}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_list_connector_outgoing_with_sorting(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/list' % self.test_project_id, {
                    'iDisplayStart': 0,
                    'iDisplayLength': 25,
                    'iSortingCols': 1,
                    'iSortCol_0': 6,
                    'sSortDir_0': 'desc',
                    'relation_type': 1,
                    'skeleton_id': 235})
        parsed_response = json.loads(response.content)
        expected_result = {
                'iTotalRecords': 4,
                'iTotalDisplayRecords': 4,
                'aaData': [
                    ["356", "361", "7030.00", "1980.00", "0.00", "", "9", "gerhard", "367"],
                    ["421", "373", "6630.00", "4330.00", "0.00", "", "5", "gerhard", "409"],
                    ["356", "373", "7620.00", "2890.00", "0.00", "", "5", "gerhard", "377"],
                    ["432", "", "2640.00", "3450.00", "0.00", "synapse with more targets, TODO", "0", "gerhard", ""]]}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_list_connector_incoming_with_connecting_skeletons(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/list' % self.test_project_id, {
                    'iDisplayStart': 0,
                    'iDisplayLength': 25,
                    'iSortingCols': 1,
                    'iSortCol_0': 0,
                    'sSortDir_0': 'asc',
                    'relation_type': 0,
                    'skeleton_id': 373})
        parsed_response = json.loads(response.content)
        expected_result = {
                'iTotalRecords': 2,
                'iTotalDisplayRecords': 2,
                'aaData': [
                    ["356", "235", "6100.00", "2980.00", "0.00", "", "28", "gerhard", "285"],
                    ["421", "235", "5810.00", "3950.00", "0.00", "", "28", "gerhard", "415"]]}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

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

    def test_update_textlabel(self):
        self.fake_authentication()

        textlabel_id = 1

        params = {
                'tid': textlabel_id,
                'pid': self.test_project_id,
                'x': 3,
                'y': 1,
                'z': 4,
                'r': 0,
                'g': 0,
                'b': 0,
                'a': 0,
                'type': 'text',
                'text': 'Lets dance the Grim Fandango!',
                'fontname': 'We may have years, we may have hours',
                'fontstyle': 'But sooner or later we all push up flowers',
                'fontsize': 5555,
                'scaling': 0}

        response = self.client.post(
                '/%d/textlabel/update' % self.test_project_id,
                params)
        expected_result = ' '
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, response.content)

        label = Textlabel.objects.filter(id=textlabel_id)[0]
        label_location = TextlabelLocation.objects.filter(textlabel=textlabel_id)[0]
        self.assertEqual(params['pid'], label.project_id)
        self.assertEqual(params['x'], label_location.location.x)
        self.assertEqual(params['y'], label_location.location.y)
        self.assertEqual(params['z'], label_location.location.z)
        self.assertEqual(params['type'], label.type)
        self.assertEqual(params['text'], label.text)
        self.assertEqual(params['fontname'], label.font_name)
        self.assertEqual(params['fontstyle'], label.font_style)
        self.assertEqual(params['fontsize'], label.font_size)
        self.assertEqual(False, label.scaling)

    def test_update_textlabel_using_optionals(self):
        """
        Omits some parameters and ensures corresponding
        properties of label were unchanged.
        """
        self.fake_authentication()

        textlabel_id = 1

        params = {
                'tid': textlabel_id,
                'text': 'Almost faltering, we held on to each other so that neither of us touched the ground.',
                'type': 'bubble'}

        label_before_update = Textlabel.objects.filter(id=textlabel_id)[0]
        label_location_before_update = TextlabelLocation.objects.filter(textlabel=textlabel_id)[0]

        response = self.client.post(
                '/%d/textlabel/update' % self.test_project_id,
                params)
        expected_result = ' '
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, response.content)

        label = Textlabel.objects.filter(id=textlabel_id)[0]
        label_location = TextlabelLocation.objects.filter(textlabel=textlabel_id)[0]
        self.assertEqual(label_before_update.project_id, label.project_id)
        self.assertEqual(label_location_before_update.location.x, label_location.location.x)
        self.assertEqual(label_location_before_update.location.y, label_location.location.y)
        self.assertEqual(label_location_before_update.location.z, label_location.location.z)
        self.assertEqual(params['type'], label.type)
        self.assertEqual(params['text'], label.text)
        self.assertEqual(label_before_update.font_name, label.font_name)
        self.assertEqual(label_before_update.font_style, label.font_style)
        self.assertEqual(label_before_update.font_size, label.font_size)
        self.assertEqual(label_before_update.scaling, label.scaling)

    def test_update_textlabel_failure(self):
        self.fake_authentication()

        textlabel_id = 404

        params = {'tid': textlabel_id, 'pid': self.test_project_id}

        response = self.client.post(
                '/%d/textlabel/update' % self.test_project_id,
                params)
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'Failed to find Textlabel with id %s.' % textlabel_id}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_delete_textlabel(self):
        self.fake_authentication()

        textlabel_id = 1

        self.assertEqual(1, Textlabel.objects.filter(id=textlabel_id).count())
        self.assertEqual(1, TextlabelLocation.objects.filter(textlabel=textlabel_id).count())
        response = self.client.post(
                '/%d/textlabel/delete' % self.test_project_id,
                {'tid': textlabel_id})
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'Success.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(0, Textlabel.objects.filter(id=textlabel_id).count())
        self.assertEqual(0, TextlabelLocation.objects.filter(textlabel=textlabel_id).count())

    def test_create_textlabel(self):
        self.fake_authentication()

        label_data = [
                # param-name, param values
                ('text', ['baba tiki dido', 'doop op', '']),
                ('type', ['text', 'bubble', 'non-valid-type']),
                ('font_name', [False, False, 'Times New Roman']),
                ('font_style', [False, 'bold', 'italic']),
                ('font_size', [55, 4, False]),
                ('x', [1, 2, 3]),
                ('y', [1, 100, 233]),
                ('z', [1, 0, 555]),
                ('r', [1, 2, 3]),
                ('g', [3, 4, 5]),
                ('b', [5, 7, 9]),
                ('a', [225, 225, 225])]

        label_count = Textlabel.objects.all().count()
        # Create and test labels
        for i in range(len(label_data[0][1])):
            params = {}
            # Fill request with POST-data
            for p, values in label_data:
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
            label_location = TextlabelLocation.objects.get(textlabel=label.id)

            # For each attribute, ensure new label is in accord with input
            # label_location_data = Double3D(x=0, y=0, z=0)
            for p, values in label_data:
                value = values[i]
                if (value == False):
                    continue  # Do not check for default values for now

                if (p == 'type' and value != 'bubble'):
                    self.assertEqual('text', getattr(label, p))
                elif (p == 'text' and value == ''):
                    self.assertEqual('Edit this text...', getattr(label, p))
                elif (p in ['x', 'y', 'z']):
                    self.assertEqual(value, getattr(label_location.location, p))
                elif (p in ['r', 'g', 'b', 'a']):
                    # Model does not include textlabel colour at the moment
                    pass
                else:
                    self.assertEqual(value, getattr(label, p))
            # self.assertEqual(label_location_data, label_location.location)

    log_rows = [
                    [
                        'gerhard',
                        'create_neuron',
                        '22-07-2012 22:50',
                        5290,
                        3930,
                        279,
                        'Create neuron 2434 and skeleton 2433'],
                    [
                        'gerhard',
                        'create_neuron',
                        '23-07-2012 01:12',
                        4470,
                        2110,
                        180,
                        'Create neuron 2441 and skeleton 2440'],
                    [
                        'gerhard',
                        'create_neuron',
                        '23-07-2012 01:15',
                        3680,
                        2530,
                        180,
                        'Create neuron 2452 and skeleton 2451']
            ]

    def test_list_logs_user_param(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/logs/list' % self.test_project_id, {'user_id': 1})
        parsed_response = json.loads(response.content)
        expected_result = {
                'iTotalDisplayRecords': 0,
                'iTotalRecords': 0,
                'aaData': []
                }
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_list_logs_sort(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/logs/list' % self.test_project_id, {
                    'iSortingCols': 2,
                    'iSortCol_0': 5,  # z
                    'iSortDir_0': 'ASC',
                    'iSortCol_1': 3,  # x
                    'iSortDir_1': 'DESC'
                    })
        parsed_response = json.loads(response.content)
        expected_result = {
                'iTotalDisplayRecords': 3,
                'iTotalRecords': 3,
                'aaData': [
                    self.log_rows[1], self.log_rows[2], self.log_rows[0]
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

    def test_delete_root_treenode(self):
        self.fake_authentication()
        treenode_id = 2437

        treenode = Treenode.objects.filter(id=treenode_id)[0]
        children = Treenode.objects.filter(parent=treenode_id)
        self.assertEqual(0, children.count())
        self.assertEqual(None, treenode.parent)
        tn_count = Treenode.objects.all().count()

        response = self.client.post(
                '/%d/treenode/delete' % self.test_project_id,
                {'treenode_id': treenode_id})
        parsed_response = json.loads(response.content)
        expected_result = {'success': 'Removed treenode successfully.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(0, Treenode.objects.filter(id=treenode_id).count())
        self.assertEqual(tn_count - 1, Treenode.objects.all().count())

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

    def test_search_with_no_nodes(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'tr'})
        parsed_response = json.loads(response.content)
        expected_result = [
                {"id":374, "name":"downstream-A", "class_name":"neuron"},
                {"id":362, "name":"downstream-B", "class_name":"neuron"}]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_search_with_no_results(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'bobobobobobobo'})
        parsed_response = json.loads(response.content)
        expected_result = []
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_search_with_several_nodes(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 't'})
        parsed_response = json.loads(response.content)
        expected_result = [
                {"id":465, "name":"tubby bye bye", "class_name":"driver_line"},
                {"id":4, "name":"Fragments", "class_name":"group"},
                {"id":364, "name":"Isolated synaptic terminals", "class_name":"group"},
                {"id":2353, "name":"synapse with more targets", "class_name":"label"},
                {"id":2345, "name":"t", "class_name":"label"},
                {"id":351, "name":"TODO", "class_name":"label", "nodes":[
                    {"id":349, "x":3580, "y":3350, "z":252, "skid":1},
                    {"id":261, "x":2820, "y":1345, "z":0, "skid":235}]},
                {"id":2342, "name":"uncertain end", "class_name":"label", "nodes":[
                    {"id":403, "x":7840, "y":2380, "z":0, "skid":373}]},
                {"id":374, "name":"downstream-A", "class_name":"neuron"},
                {"id":362, "name":"downstream-B", "class_name":"neuron"},
                {"id":1, "name":"dull skeleton", "class_name":"skeleton"},
                {"id":235, "name":"skeleton 235", "class_name":"skeleton"},
                {"id":2364, "name":"skeleton 2364", "class_name":"skeleton"},
                {"id":2388, "name":"skeleton 2388", "class_name":"skeleton"},
                {"id":2411, "name":"skeleton 2411", "class_name":"skeleton"},
                {"id":2433, "name":"skeleton 2433", "class_name":"skeleton"},
                {"id":2440, "name":"skeleton 2440", "class_name":"skeleton"},
                {"id":2451, "name":"skeleton 2451", "class_name":"skeleton"},
                {"id":361, "name":"skeleton 361", "class_name":"skeleton"},
                {"id":373, "name":"skeleton 373", "class_name":"skeleton"}]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_search_with_nodes_and_nonode_label(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'a'})
        parsed_response = json.loads(response.content)
        expected_result = [
                {"id":485, "name":"Local", "class_name":"cell_body_location"},
                {"id":487, "name":"Non-Local", "class_name":"cell_body_location"},
                {"id":454, "name":"and", "class_name":"driver_line"},
                {"id":4, "name":"Fragments", "class_name":"group"},
                {"id":364, "name":"Isolated synaptic terminals", "class_name":"group"},
                {"id":2353, "name":"synapse with more targets", "class_name":"label"},
                {"id":2342, "name":"uncertain end", "class_name":"label", "nodes":[
                    {"id":403, "x":7840, "y":2380, "z":0, "skid":373}]},
                {"id":233, "name":"branched neuron", "class_name":"neuron"},
                {"id":374, "name":"downstream-A", "class_name":"neuron"},
                {"id":362, "name":"downstream-B", "class_name":"neuron"}]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_search_with_nodes(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'c'})
        parsed_response = json.loads(response.content)
        expected_result = [
                {"id":485, "name":"Local", "class_name":"cell_body_location"},
                {"id":487, "name":"Non-Local", "class_name":"cell_body_location"},
                {"id":458, "name":"c005", "class_name":"driver_line"},
                {"id":364, "name":"Isolated synaptic terminals", "class_name":"group"},
                {"id":2342, "name":"uncertain end", "class_name":"label",
                    "nodes":[{"id":403, "x":7840, "y":2380, "z":0, "skid":373}]},
                {"id":233, "name":"branched neuron", "class_name":"neuron"}]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_instance_operation_remove_neuron(self):
        self.fake_authentication()
        node_id = 2

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        response = self.client.post(
                '/%d/instance_operation' % self.test_project_id, {
                    'operation': 'remove_node',
                    'rel': 'neuron',
                    'id': node_id})
        parsed_response = json.loads(response.content)
        expected_result = {'status': 1, 'message': 'Removed neuron successfully.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(0, Treenode.objects.filter(skeleton=node_id).count())
        self.assertEqual(0, ClassInstanceClassInstance.objects.filter(class_instance_b=node_id).count())
        self.assertEqual(0, ClassInstanceClassInstance.objects.filter(class_instance_a=node_id).count())
        self.assertEqual(0, ClassInstance.objects.filter(id=node_id).count())
        # A skeleton part of this neuron
        self.assertEqual(0, ClassInstance.objects.filter(id=2).count())
        self.assertEqual(0, TreenodeClassInstance.objects.filter(class_instance=node_id).count())
        # This is a TCI related to a treenode included in a skeleton part of
        # this neuron
        self.assertEqual(0, TreenodeClassInstance.objects.filter(id=353).count())

        self.assertEqual(log_count + 1, count_logs())

    def test_instance_operation_move_skeleton(self):
        self.fake_authentication()
        src = 2364
        ref = 2
        classname = 'skeleton'
        targetname = 'dull neuron'

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        response = self.client.post(
                '/%d/instance_operation' % self.test_project_id, {
                    'operation': 'move_node',
                    'src': src,
                    'ref': ref,
                    'classname': classname,
                    'targetname': targetname})
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'Success.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(log_count + 1, count_logs())
        self.assertEqual(1, ClassInstanceClassInstance.objects.filter(class_instance_a=src, class_instance_b=ref).count())

    def test_instance_operation_move_neuron(self):
        self.fake_authentication()
        src = 2
        ref = 231
        classname = 'neuron'
        targetname = 'group'

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        response = self.client.post(
                '/%d/instance_operation' % self.test_project_id, {
                    'operation': 'move_node',
                    'src': src,
                    'ref': ref,
                    'classname': classname,
                    'targetname': targetname})
        parsed_response = json.loads(response.content)
        expected_result = {'message': 'Success.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(log_count + 1, count_logs())
        self.assertEqual(1, ClassInstanceClassInstance.objects.filter(class_instance_a=src, class_instance_b=ref).count())

    def test_instance_operation_remove_inexistent_neuron(self):
        self.fake_authentication()
        node_id = 59595959

        response = self.client.post(
                '/%d/instance_operation' % self.test_project_id, {
                    'operation': 'remove_node',
                    'rel': 'neuron',
                    'id': node_id})
        parsed_response = json.loads(response.content)
        expected_result = {'error': 'Could not find any node with ID %s' % node_id}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_instance_operation_remove_skeleton(self):
        self.fake_authentication()
        node_id = 1

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        response = self.client.post(
                '/%d/instance_operation' % self.test_project_id, {
                    'operation': 'remove_node',
                    'rel': 'skeleton',
                    'id': node_id})
        parsed_response = json.loads(response.content)
        expected_result = {'status': 1, 'message': 'Removed skeleton successfully.'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(0, Treenode.objects.filter(skeleton=node_id).count())
        self.assertEqual(0, ClassInstanceClassInstance.objects.filter(class_instance_b=node_id).count())
        self.assertEqual(0, ClassInstance.objects.filter(id=node_id).count())
        self.assertEqual(0, TreenodeClassInstance.objects.filter(class_instance=node_id).count())
        # This is a TCI related to a treenode included in the skeleton
        self.assertEqual(0, TreenodeClassInstance.objects.filter(id=353).count())

        self.assertEqual(log_count + 1, count_logs())

    def test_instance_operation_has_relations(self):
        self.fake_authentication()

        response = self.client.post(
                '/%d/instance_operation' % self.test_project_id, {
                    'operation': 'has_relations',
                    'relationnr': 2,
                    'relation0': 'part_of',
                    'relation1': 'model_of',
                    'id': 2365})
        parsed_response = json.loads(response.content)
        expected_result = {'has_relation': 1}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_instance_operation_create_group_with_parent(self):
        self.fake_authentication()
        parent_id = 4

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        response = self.client.post(
                '/%d/instance_operation' % self.test_project_id, {
                    'operation': 'create_node',
                    'classname': 'group',
                    'relationname': 'part_of',
                    'parentid': parent_id,
                    'objname': 'group'})
        parsed_response = json.loads(response.content)
        self.assertEqual(response.status_code, 200)
        self.assertTrue('class_instance_id' in parsed_response)
        node_id = parsed_response['class_instance_id']
        group = ClassInstance.objects.filter(id=node_id)[0]
        self.assertEqual('group', group.name)
        self.assertEqual(1, ClassInstanceClassInstance.objects.filter(class_instance_a=group, class_instance_b=parent_id).count())
        self.assertEqual(log_count + 1, count_logs())

    def test_instance_operation_rename(self):
        self.fake_authentication()
        node_id = 1
        new_title = 'Don\'t we carry in us the rustling of the leaves?'

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        response = self.client.post(
                '/%d/instance_operation' % self.test_project_id, {
                    'operation': 'rename_node',
                    'classname': 'skeleton',
                    'id': node_id,
                    'title': new_title})
        parsed_response = json.loads(response.content)
        expected_result = {'class_instance_ids': [node_id]}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        node = ClassInstance.objects.filter(id=node_id)[0]
        self.assertEqual(new_title, node.name)
        self.assertEqual(log_count + 1, count_logs())

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

    def test_reroot_treenodes(self):
        self.fake_authentication()

        new_root = 407

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()

        response = self.client.post(
                '/%d/treenode/reroot' % self.test_project_id,
                {'tnid': new_root})
        parsed_response = json.loads(response.content)
        expected_result = {'newroot': 407}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(1 + log_count, count_logs())

        def assertHasParent(treenode_id, parent_id):
            treenode = get_object_or_404(Treenode, id=treenode_id)
            self.assertEqual(parent_id, treenode.parent_id)

        assertHasParent(405, 407)
        assertHasParent(377, 405)
        assertHasParent(407, None)

    def test_reroot_and_link_treenodes(self):
        self.fake_authentication()

        new_root = 2394
        link_to = 2394
        link_from = 2415

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        new_skeleton_id = get_object_or_404(Treenode, id=link_from).skeleton_id

        response = self.client.post(
                '/%d/treenode/reroot' % self.test_project_id,
                {'tnid': new_root})
        parsed_response = json.loads(response.content)
        expected_result = {'newroot': 2394}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

        response = self.client.post(
                '/%d/treenode/link' % self.test_project_id, {
                    'from_id': link_from,
                    'to_id': link_to})
        parsed_response = json.loads(response.content)
        expected_result = {
                'message': 'success',
                'fromid': link_from,
                'toid': link_to}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(2 + log_count, count_logs())

        def assertTreenodeHasProperties(treenode_id, parent_id, skeleton_id):
            treenode = get_object_or_404(Treenode, id=treenode_id)
            self.assertEqual(parent_id, treenode.parent_id)
            self.assertEqual(skeleton_id, treenode.skeleton_id)

        assertTreenodeHasProperties(2396, 2394, new_skeleton_id)
        assertTreenodeHasProperties(2392, 2394, new_skeleton_id)
        assertTreenodeHasProperties(2394, 2415, new_skeleton_id)

        self.assertEqual(0, ClassInstance.objects.filter(id=2388).count())
        self.assertEqual(0, ClassInstanceClassInstance.objects.filter(id=2390).count())

        self.assertEqual(new_skeleton_id, get_object_or_404(TreenodeClassInstance, id=2393).class_instance_id)
        self.assertEqual(new_skeleton_id, get_object_or_404(TreenodeClassInstance, id=2395).class_instance_id)
        self.assertEqual(new_skeleton_id, get_object_or_404(TreenodeClassInstance, id=2397).class_instance_id)

        self.assertEqual(new_skeleton_id, get_object_or_404(TreenodeConnector, id=2405).skeleton_id)

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

    def test_read_message_error(self):
        self.fake_authentication()
        message_id = 5050

        response = self.client.get('/messages/mark_read', {'id': message_id})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Could not retrieve message with id %s' % message_id)

    def test_read_message_without_action(self):
        self.fake_authentication()
        message_id = 3

        response = self.client.get('/messages/mark_read', {'id': message_id})
        self.assertEqual(response.status_code, 200)
        message = Message.objects.filter(id=message_id)[0]
        self.assertEqual(True, message.read)
        self.assertContains(response, 'history.back()', count=2)

    def test_read_message_with_action(self):
        self.fake_authentication()
        message_id = 1

        response = self.client.get('/messages/mark_read', {'id': message_id})
        self.assertEqual(response.status_code, 200)
        message = Message.objects.filter(id=message_id)[0]
        self.assertEqual(True, message.read)
        self.assertContains(response, 'location.replace')
        self.assertContains(response, message.action, count=2)

    def test_list_messages(self):
        self.fake_authentication()

        response = self.client.post(
                '/messages/list', {})
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

    def test_skeleton_ancestry(self):
        skeleton_id = 361

        self.fake_authentication()
        response = self.client.post(
                '/%d/skeleton/ancestry' % self.test_project_id,
                {'skeleton_id': skeleton_id})
        parsed_response = json.loads(response.content)
        expected_result = [
                {"name":"downstream-B", "id":362, "class":"neuron"},
                {"name":"Isolated synaptic terminals", "id":364, "class":"group"},
                {"name":"neuropile", "id":2323, "class":"root"}]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_skeleton_ancestry_2(self):
        skeleton_id = 2364

        self.fake_authentication()
        response = self.client.post(
                '/%d/skeleton/ancestry' % self.test_project_id,
                {'skeleton_id': skeleton_id})
        parsed_response = json.loads(response.content)
        expected_result = [
                {"name":"neuron 2365", "id":2365, "class":"neuron"},
                {"name":"Fragments", "id":4, "class":"group"},
                {"name":"neuropile", "id":2323, "class":"root"}]
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

    def test_create_presynaptic_link_success(self):
        from_id = 237
        to_id = 2458
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
        expected_result = {'message': 'success'}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_node_nearest_for_skeleton(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/node/nearest' % self.test_project_id,
                {
                    'x': 5115,
                    'y': 3835,
                    'z': 4050,
                    'skeleton_id': 2388,
                    })
        parsed_response = json.loads(response.content)
        expected_result = {
                "treenode_id": "2394",
                "x": "3110",
                "y": "6030",
                "z": "0",
                "skeleton_id": "2388"}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_node_nearest_for_neuron(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/node/nearest' % self.test_project_id,
                {
                    'x': 5115,
                    'y': 3835,
                    'z': 0,
                    'neuron_id': 362,
                    })
        parsed_response = json.loads(response.content)
        expected_result = {
                "treenode_id": "367",
                "x": "7030",
                "y": "1980",
                "z": "0",
                "skeleton_id": "361"}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)

    def test_node_update_single_treenode(self):
        self.fake_authentication()
        treenode_id = 289
        x = 5690
        y = 3340
        z = 0

        response = self.client.post(
                '/%d/node/update' % self.test_project_id, {
                    'd0': 3,
                    'node_id0': treenode_id,
                    'x0': x,
                    'y0': y,
                    'z0': z,
                    'type0': 'treenode'})
        parsed_response = json.loads(response.content)
        expected_result = {'updated': 1}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        treenode = Treenode.objects.filter(id=treenode_id)[0]
        self.assertEqual(x, treenode.location.x)
        self.assertEqual(y, treenode.location.y)
        self.assertEqual(z, treenode.location.z)

    def test_node_update_many_nodes(self):
        self.fake_authentication()
        pid = [3, 3, 3, 3, 3, 3]
        node_id = [2368, 2370, 2372, 2374, 356, 421]
        x = [2990, 3060, 3210, 3460, 3640, 3850]
        y = [5200, 4460, 4990, 4830, 5060, 4800]
        z = [1, 2, 3, 4, 5, 6]
        type_ = ['treenode', 'treenode', 'treenode', 'treenode', 'connector', 'connector']

        def insert_params(dictionary, param_name, params):
            i = 0
            for param in params:
                dictionary['%s%s' % (param_name, i)] = params[i]
                i += 1

        param_dict = {}
        insert_params(param_dict, 'pid', pid)
        insert_params(param_dict, 'node_id', node_id)
        insert_params(param_dict, 'x', x)
        insert_params(param_dict, 'y', y)
        insert_params(param_dict, 'z', z)
        insert_params(param_dict, 'type', type_)

        response = self.client.post(
                '/%d/node/update' % self.test_project_id, param_dict)
        parsed_response = json.loads(response.content)
        expected_result = {'updated': 6}
        self.assertEqual(response.status_code, 200)
        self.assertEqual(expected_result, parsed_response)
        i = 0
        for n_id in node_id:
            if type_[i] == 'treenode':
                node = Treenode.objects.filter(id=n_id)[0]
            else:
                node = Connector.objects.filter(id=n_id)[0]
            self.assertEqual(x[i], node.location.x)
            self.assertEqual(y[i], node.location.y)
            self.assertEqual(z[i], node.location.z)
            i += 1

    def test_node_list_without_active_skeleton(self):
        self.fake_authentication()
        expected_result = [
                {"id": 2374, "parentid": 2372, "x": 3310, "y": 5190, "z": 0, "confidence": 5, "user_id": 2, "radius": -1, "z_diff": 0, "skeleton_id": 2364, "type": "treenode"},
                {"id": 2378, "parentid": 2376, "x": 4420, "y": 4880, "z": 0, "confidence": 5, "user_id": 2, "radius": -1, "z_diff": 0, "skeleton_id": 2364, "type": "treenode"},
                {"id": 2394, "parentid": 2392, "x": 3110, "y": 6030, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 2388, "type": "treenode"},
                {"id": 2396, "parentid": 2394, "x": 3680, "y": 6550, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 2388, "type": "treenode"},
                {"id": 2415, "parentid": None, "x": 4110, "y": 6080, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 2411, "type": "treenode"},
                {"id": 2417, "parentid": 2415, "x": 4400, "y": 5730, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 2411, "type": "treenode"},
                {"id": 2419, "parentid": 2417, "x": 5040, "y": 5650, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 2411, "type": "treenode"},
                {"id": 2423, "parentid": 2415, "x": 4140, "y": 6460, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 2411, "type": "treenode"},
                {"id": 2400, "x": 3400, "y": 5620, "z": 0, "confidence": 5, "user_id": 3, "z_diff": 0, "type": "connector", "pre": [
                    {"tnid": 2394, "confidence": 5},
                    {"tnid": 2415, "confidence": 5}],
                    "post": [{"tnid": 2374, "confidence": 5}]}]
        response = self.client.get('/%d/node-list' % (self.test_project_id,), {
            'sid': 3,
            'z': 0,
            'top': 4625,
            'left': 2860,
            'width': 8000,
            'height': 3450,
            'zres': 9,
            'as': 0})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        self.assertEqual(len(expected_result), len(parsed_response))
        for row in expected_result:
            self.assertTrue(row in parsed_response)

    def test_node_list_with_active_skeleton(self):
        self.fake_authentication()
        expected_result = [
                {"id": 279, "parentid": 267, "x": 5530, "y": 2465, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 235, "type": "treenode"},
                {"id": 281, "parentid": 279, "x": 5675, "y": 2635, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 235, "type": "treenode"},
                {"id": 283, "parentid": 281, "x": 5985, "y": 2745, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 235, "type": "treenode"},
                {"id": 285, "parentid": 283, "x": 6100, "y": 2980, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 235, "type": "treenode"},
                {"id": 289, "parentid": 285, "x": 6210, "y": 3480, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 235, "type": "treenode"},
                {"id": 377, "parentid": None, "x": 7620, "y": 2890, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 373, "type": "treenode"},
                {"id": 403, "parentid": 377, "x": 7840, "y": 2380, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 373, "type": "treenode"},
                {"id": 405, "parentid": 377, "x": 7390, "y": 3510, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 373, "type": "treenode"},
                {"id": 407, "parentid": 405, "x": 7080, "y": 3960, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 373, "type": "treenode"},
                {"id": 409, "parentid": 407, "x": 6630, "y": 4330, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 373, "type": "treenode"},
                {"id": 415, "parentid": 289, "x": 5810, "y": 3950, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 235, "type": "treenode"},
                {"id": 417, "parentid": 415, "x": 4990, "y": 4200, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 235, "type": "treenode"},
                {"id": 2419, "parentid": 2417, "x": 5040, "y": 5650, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 2411, "type": "treenode"},
                {"id": 367, "parentid": None, "x": 7030, "y": 1980, "z": 0, "confidence": 5, "user_id": 3, "radius": -1, "z_diff": 0, "skeleton_id": 361, "type": "treenode"},
                {"id": 356, "x": 6730, "y": 2700, "z": 0, "confidence": 5, "user_id": 3, "z_diff": 0, "type": "connector",
                    "pre": [{"tnid": 285, "confidence": 5}],
                    "post": [
                        {"tnid": 367, "confidence": 5},
                        {"tnid": 377, "confidence": 5}]},
                {"id": 421, "x": 6260, "y": 3990, "z": 0, "confidence": 5, "user_id": 3, "z_diff": 0, "type": "connector",
                    "pre": [{"tnid": 415, "confidence": 5}],
                    "post": [{"tnid": 409, "confidence": 5}]}]
        response = self.client.get('/%d/node-list' % (self.test_project_id,), {
                'sid': 3,
                'z': 0,
                'top': 2280,
                'left': 4430,
                'width': 8000,
                'height': 3450,
                'zres': 9,
                'as': 373})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        self.assertEqual(len(expected_result), len(parsed_response))
        for row in expected_result:
            self.assertTrue(row in parsed_response)

    def test_textlabels_empty(self):
        self.fake_authentication()
        expected_result = {}

        response = self.client.post('/%d/textlabels' % (self.test_project_id,), {
                'pid': 3,
                'sid': 3,
                'z': 9,
                'top': 0,
                'left': 0,
                'width': 10240,
                'height': 7680,
                'scale': 0.5,
                'resolution': 5})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result, parsed_response)

    def test_textlabels_nonempty(self):
        self.fake_authentication()
        expected_result = {
                '0': {
                    'tid': 1,
                    'type': 'text',
                    'text': 'World.',
                    'font_name': None,
                    'font_style': 'bold',
                    'font_size': 160,
                    'scaling': 1,
                    'z_diff': 0,
                    'colour': {'r': 255, 'g': 127, 'b': 0, 'a': 1},
                    'location': {'x': 3155, 'y': 1775, 'z': 27}},
                '1': {
                    'tid': 2,
                    'type': 'text',
                    'text': 'Helo.',
                    'font_name': None,
                    'font_style': 'bold',
                    'font_size': 160,
                    'scaling': 1,
                    'z_diff': 0,
                    'colour': {'r': 255, 'g': 127, 'b': 0, 'a': 1},
                    'location': {'x': 2345, 'y': 1785, 'z': 27}}}

        response = self.client.post('/%d/textlabels' % (self.test_project_id,), {
                'sid': 3,
                'z': 27,
                'top': 0,
                'left': 0,
                'width': 10240,
                'height': 7680,
                'scale': 0.5,
                'resolution': 5})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        self.assertEqual(expected_result, parsed_response)


class TreenodeTests(TestCase):
    fixtures = ['catmaid_testdata']

    def setUp(self):
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
