# -*- coding: utf-8 -*-

import json

from django.contrib.auth.models import Permission
from django.db import connection, transaction
from django.http import JsonResponse
from django.test import TestCase, TransactionTestCase
from django.test.client import Client
from guardian.shortcuts import assign_perm
from guardian.utils import get_anonymous_user
from guardian.management import create_anonymous_user

from catmaid.control.project import validate_project_setup
from catmaid.control.annotation import _annotate_entities
from catmaid.fields import Double3D, Integer3D
from catmaid.models import Project, Stack, ProjectStack, StackMirror
from catmaid.models import ClassInstance, Log
from catmaid.models import Treenode, Connector, User
from catmaid.models import TreenodeClassInstance, ClassInstanceClassInstance
from catmaid.tests.common import init_consistent_data


class TransactionTests(TransactionTestCase):
    fixtures = ['catmaid_testdata']

    maxDiff = None

    def setUp(self):
        init_consistent_data()
        self.test_project_id = 3
        self.test_user_id = 3
        self.test_project = Project.objects.get(pk=self.test_project_id)
        self.test_user = User.objects.get(pk=self.test_user_id)
        self.client = Client()

    def fake_authentication(self, username='test2', password='test'):
        self.client.login(username=username, password=password)

        user = User.objects.get(username=username)
        # Assign the new user permissions to browse and annotate projects
        p = Project.objects.get(pk=self.test_project_id)
        assign_perm('can_browse', user, p)
        assign_perm('can_annotate', user, p)

    def test_fail_unexpectedly(self):
        @transaction.atomic
        def insert_user():
            User(username='matri', password='boop').save()
            raise Exception()
            return JsonResponse({'should not': 'return this'})

        User.objects.all().delete()
        with self.assertRaises(Exception):
            insert_user()
        self.assertEqual(0, User.objects.all().count())

    def test_remove_neuron_and_skeleton(self):
        """ The skeleton removal involves manual transaction management.
        Therefore, we need to make its test part of a TransactionTest.
        """
        self.fake_authentication()
        skeleton_id = 1
        neuron_id = 2

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        response = self.client.post(
                '/%d/neuron/%s/delete' % (self.test_project_id, neuron_id), {})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'skeleton_ids': [skeleton_id],
            'success': 'Deleted neuron #2 as well as its skeletons and annotations.'
        }
        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(0, Treenode.objects.filter(skeleton_id=skeleton_id).count())
        self.assertEqual(0, ClassInstanceClassInstance.objects.filter(class_instance_b=neuron_id).count())
        self.assertEqual(0, ClassInstance.objects.filter(id=skeleton_id).count())
        self.assertEqual(0, ClassInstance.objects.filter(id=neuron_id).count())
        self.assertEqual(0, TreenodeClassInstance.objects.filter(class_instance=skeleton_id).count())
        # This is a TCI related to a treenode included in the skeleton
        self.assertEqual(0, TreenodeClassInstance.objects.filter(id=353).count())

        self.assertEqual(log_count + 1, count_logs())


class InsertionTest(TestCase):
    """ This test case insers various model objects and tests if this is done as
    expected. No fixture data is needed for this test.
    """
    fixtures = ['catmaid_smallenv']
    maxDiff = None

    def insert_project(self):
        p = Project()
        p.title = "Example Project"
        p.comment = "This is an example project for the Django tests"
        p.save()
        return p

    def insert_stack(self):
        s = Stack()
        s.title = "Example Stack"
        s.dimension = Integer3D(x=2048, y=1536, z=460)
        s.resolution = Double3D(x=5.0001, y=5.0002, z=9.0003)
        s.save()

        sm = StackMirror()
        sm.stack = s
        sm.image_base = "http://incf.ini.uzh.ch/image-stack-fib/"
        sm.file_extension = 'jpg'
        sm.tile_width = 256
        sm.tile_height = 256
        sm.tile_source_type = 1
        sm.save()

        return s

    def test_project_insertion(self):
        """
        Tests that a project can be inserted, and that the
        id is retrievable afterwards.  (This is something that
        the custom psycopg2 driver is needed for.)
        """
        p = self.insert_project()
        self.assertIsInstance(p.id, int)

    def test_stack_insertion(self):
        p = self.insert_project()
        s = self.insert_stack()
        self.assertTrue(Project.objects.get(pk=p.id))
        self.assertTrue(Stack.objects.get(pk=s.id))
        # Now try to associate this stack with the project:
        ps = ProjectStack(project=p, stack=s)
        ps.save()

        self.assertEqual(p.stacks.count(), 1)


class RelationQueryTests(TestCase):
    fixtures = ['catmaid_testdata']

    maxDiff = None

    def setUp(self):
        self.test_project_id = 3

    def test_find_all_neurons(self):
        all_neurons = ClassInstance.objects.filter(class_column__class_name='neuron',
                                                   project=self.test_project_id)
        self.assertEqual(all_neurons.count(), 13)

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


class ViewPageTests(TestCase):
    fixtures = ['catmaid_testdata']

    maxDiff = None

    def setUp(self):
        """ Creates a new test client and test user. The user is assigned
        permissions to modify an existing test project.
        """
        init_consistent_data()
        self.test_project_id = 3
        self.test_user_id = 3
        self.client = Client()

        p = Project.objects.get(pk=self.test_project_id)

        create_anonymous_user(object())

        user = User.objects.get(pk=3)
        # Assign the new user permissions to browse and annotate projects
        assign_perm('can_browse', user, p)
        assign_perm('can_annotate', user, p)

    def test_testdata(self):
        """Makes sure the test data doesn't contain rows for the base tables
        location and concept. These are not required for table inheritance and will
        confuse some functions."""
        cursor = connection.cursor()
        cursor.execute("""
            SELECT COUNT(*) FROM ONLY location;
        """)
        self.assertEqual(cursor.fetchone()[0], 0)
        cursor.execute("""
            SELECT COUNT(*) FROM ONLY concept;
        """)
        self.assertEqual(cursor.fetchone()[0], 0)

    def fake_authentication(self, username='test2', password='test', add_default_permissions=False):
        self.client.login(username=username, password=password)

        if add_default_permissions:
            p = Project.objects.get(pk=self.test_project_id)
            user = User.objects.get(username=username)
            # Assign the new user permissions to browse and annotate projects
            assign_perm('can_browse', user, p)
            assign_perm('can_annotate', user, p)

    def fake_admin_authentication(self, username='test2', password='test'):
        user = User.objects.get(username=username)
        user.is_staff = True
        user.is_superuser = True
        user.save()

        self.client.login(username=username, password=password)

        # Assign the new user permissions to browse and annotate projects
        p = Project.objects.get(pk=self.test_project_id)
        assign_perm('can_browse', user, p)
        assign_perm('can_annotate', user, p)

    def test_authentication(self):
        # Try to access the password change view without logging in
        response = self.client.get('/user/password_change/')
        self.assertRedirects(response, '/accounts/login?next=/user/password_change/')
        self.assertEqual(response.status_code, 302)
        # Now insert a fake session and expect a successful request
        self.fake_authentication()
        response = self.client.get('/user/password_change/')
        self.assertEqual(response.status_code, 200)

    def test_token_authentication(self):
        response = self.client.post('/api-token-auth/',
                {'username': 'test2',
                 'password': 'test'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        token = parsed_response['token']

        token_client = Client(enforce_csrf_checks=True)
        sess_client = Client(enforce_csrf_checks=True)
        sess_client.login(username='test2', password='test')

        # Check that a Django view rejects an unauthed request...
        response = token_client.post('/%d/node/user-info' % (self.test_project_id,),
                {'node_ids': [383]})
        self.assertEqual(response.status_code, 403)
        # ..and an authed session request without CSRF headers...
        response = sess_client.post('/%d/node/user-info' % (self.test_project_id,),
                {'node_ids': [383]})
        self.assertEqual(response.status_code, 403)
        # ...but accepts a token auth request without CSRF
        response = token_client.post('/%d/node/user-info' % (self.test_project_id,),
                {'node_ids': [383]},
                HTTP_X_AUTHORIZATION='Token ' + token)
        self.assertEqual(response.status_code, 200)

        # Check that a DRF view rejects an unauthed request...
        response = token_client.post('/%d/annotations/' % (self.test_project_id,))
        self.assertEqual(response.status_code, 403)
        # ..and an authed session request without CSRF headers...
        response = sess_client.post('/%d/annotations/' % (self.test_project_id,))
        self.assertEqual(response.status_code, 403)
        # ...but accepts a token auth request without CSRF
        response = token_client.post('/%d/annotations/' % (self.test_project_id,),
                HTTP_X_AUTHORIZATION='Token ' + token)
        self.assertEqual(response.status_code, 200)

    def test_user_project_permissions_not_logged_in(self):
        response = self.client.get('/permissions')
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [{}, []]
        self.assertEqual(expected_result, parsed_response)

    def test_user_project_permissions(self):
        self.fake_authentication()
        response = self.client.get('/permissions')
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [
            {'can_administer': [],
             'add_project': [],
             'can_annotate': [3],
             'can_annotate_with_token': [],
             'change_project': [],
             'can_browse': [3],
             'can_import': [],
             'can_queue_compute_task': [],
             'delete_project': [],
             'view_project': [],
            }, [u'test1']]
        self.assertEqual(expected_result, parsed_response)


    def test_index(self):
        self.fake_authentication()
        url = '/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_user_list_with_passwords_regular_user(self):
        self.fake_authentication()
        response = self.client.get('/user-list', {
            'with_passwords': True,
        })

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertTrue('error' in parsed_response)
        self.assertTrue('type' in parsed_response)
        self.assertEqual(parsed_response['type'], 'PermissionError')

    def test_user_list_with_passwords_admin_user(self):
        self.fake_admin_authentication()
        response = self.client.get('/user-list', {
            'with_passwords': True,
        })

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertFalse('error' in parsed_response)

        expected_result = [
            {
                'first_name': 'Admin',
                'last_name': 'Superuser',
                'color': [1.0, 1.0, 0.0],
                'full_name': 'Admin Superuser',
                'login': 'admin',
                'password': 'pbkdf2_sha256$12000$CqdO6wRdSSxH$c57xXXPO8k65prBMrHTvjj/inanxDnbdoaeDIeWWrik=',
                'id': 4
            }, {
                'first_name': 'Test',
                'last_name': 'User 0',
                'color': [0.0, 0.0, 1.0],
                'full_name': 'Test User 0',
                'login': 'test0',
                'password': 'pbkdf2_sha256$12000$CqdO6wRdSSxH$c57xXXPO8k65prBMrHTvjj/inanxDnbdoaeDIeWWrik=',
                'id': 5
            }, {
                'first_name': 'Test',
                'last_name': 'User 1',
                'color': [1.0, 0.0, 1.0],
                'full_name': 'Test User 1',
                'login': 'test1',
                'password': 'pbkdf2_sha256$12000$CqdO6wRdSSxH$c57xXXPO8k65prBMrHTvjj/inanxDnbdoaeDIeWWrik=',
                'id': 2
            },
        ]

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        for u in expected_result:
            self.assertIn(u, parsed_response)

        # The anonymous user is created by Guardian, we don't know its ID. A
        # second test user (test2) has a run-time updated password, which we
        # don't know and therefore we skip it.
        self.assertEqual(len(expected_result) + 2, len(parsed_response))
        found_anon_user = False
        for u in parsed_response:
            if u['login'] == 'AnonymousUser':
                found_anon_user = True
        self.assertTrue(found_anon_user)

    def test_user_list(self):
        self.fake_authentication()
        response = self.client.get('/user-list')
        expected_result = [
            {
                u'first_name': u'Admin',
                u'last_name': u'Superuser',
                u'color': [1.0, 1.0, 0.0],
                u'full_name': u'Admin Superuser',
                u'login': u'admin',
                u'id': 4
            }, {
                u'first_name': u'Test',
                u'last_name': u'User 0',
                u'color': [0.0, 0.0, 1.0],
                u'full_name': u'Test User 0',
                u'login': u'test0',
                u'id': 5
            }, {
                u'first_name': u'Test',
                u'last_name': u'User 1',
                u'color': [1.0, 0.0, 1.0],
                u'full_name': u'Test User 1',
                u'login': u'test1',
                u'id': 2
            }, {
                u'first_name': u'Test',
                u'last_name': u'User 2',
                u'color': [0.0, 1.0, 1.0],
                u'full_name': u'Test User 2',
                u'login': u'test2',
                u'id': 3
            }
        ]

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        for u in expected_result:
            self.assertIn(u, parsed_response)

        # The anonymous user is created by Guardian, we don't know its ID
        self.assertEqual(len(expected_result) + 1, len(parsed_response))
        found_anon_user = False
        for u in parsed_response:
            if u['login'] == 'AnonymousUser':
                found_anon_user = True
        self.assertTrue(found_anon_user)


    def test_user_reviewer_whitelist(self):
        self.fake_authentication()

        # Test that whitelist is empty by default.
        url = '/%d/user/reviewer-whitelist' % (self.test_project_id,)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = []
        self.assertEqual(expected_result, parsed_response)

        # Test replacing whitelist.
        whitelist = {
                '1': "2014-03-17T00:00:00Z",
                '2': "2014-03-18T00:00:00Z"}
        response = self.client.post(url, whitelist)
        self.assertEqual(response.status_code, 200)

        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        expected_result = [{'reviewer_id': int(r), 'accept_after': t}
                for r,t in whitelist.items()]
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertCountEqual(parsed_response, expected_result)
        for pr in parsed_response:
            rid = pr['reviewer_id']
            self.assertEqual(whitelist[str(rid)], pr['accept_after'])

    def test_export_compact_skeleton(self):
        self.fake_authentication()

        skeleton_id = 373
        response = self.client.post(
                '/%d/%d/1/1/compact-skeleton' % (self.test_project_id, skeleton_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_response = [
                [[377, None, 3, 7620.0, 2890.0, 0.0, -1.0, 5],
                 [403, 377, 3, 7840.0, 2380.0, 0.0, -1.0, 5],
                 [405, 377, 3, 7390.0, 3510.0, 0.0, -1.0, 5],
                 [407, 405, 3, 7080.0, 3960.0, 0.0, -1.0, 5],
                 [409, 407, 3, 6630.0, 4330.0, 0.0, -1.0, 5]],
                [[377, 356, 1, 6730.0, 2700.0, 0.0],
                 [409, 421, 1, 6260.0, 3990.0, 0.0]],
                {"uncertain end": [403]},
                [],
                []]
        self.assertEqual(len(parsed_response), len(expected_response))
        self.assertCountEqual(parsed_response[0], expected_response[0])
        self.assertCountEqual(parsed_response[1], expected_response[1])
        self.assertEqual(parsed_response[2], expected_response[2])
        self.assertEqual(parsed_response[3], expected_response[3])
        self.assertEqual(parsed_response[4], expected_response[4])

    def test_export_compact_skeleton_with_annotations(self):
        self.fake_authentication()

        skeleton_id = 373
        neuron_id = 374
        _, new_annotations = _annotate_entities(self.test_project_id, [neuron_id],
                {'myannotation': {'user_id': self.test_user_id}})
        new_annotation_link_id = new_annotations.pop()
        url = '/%d/%d/1/1/compact-skeleton' % (self.test_project_id, skeleton_id)
        response = self.client.get(url, {
            'with_annotations': True
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_response = [
                [[377, None, 3, 7620.0, 2890.0, 0.0, -1.0, 5],
                 [403, 377, 3, 7840.0, 2380.0, 0.0, -1.0, 5],
                 [405, 377, 3, 7390.0, 3510.0, 0.0, -1.0, 5],
                 [407, 405, 3, 7080.0, 3960.0, 0.0, -1.0, 5],
                 [409, 407, 3, 6630.0, 4330.0, 0.0, -1.0, 5]],
                [[377, 356, 1, 6730.0, 2700.0, 0.0],
                 [409, 421, 1, 6260.0, 3990.0, 0.0]],
                {"uncertain end": [403]},
                [],
                [[new_annotation_link_id]]]
        self.assertEqual(len(parsed_response), len(expected_response))
        self.assertCountEqual(parsed_response[0], expected_response[0])
        self.assertCountEqual(parsed_response[1], expected_response[1])
        self.assertEqual(parsed_response[2], expected_response[2])
        self.assertEqual(parsed_response[3], expected_response[3])
        self.assertEqual(parsed_response[4], expected_response[4])

    def test_export_compact_arbor(self):
        self.fake_authentication()

        skeleton_id = 373
        response = self.client.post(
                '/%d/%d/1/1/1/compact-arbor' % (self.test_project_id, skeleton_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_response = [
                [[377, None, 3, 7620.0, 2890.0, 0.0, -1.0, 5],
                 [403, 377, 3, 7840.0, 2380.0, 0.0, -1.0, 5],
                 [405, 377, 3, 7390.0, 3510.0, 0.0, -1.0, 5],
                 [407, 405, 3, 7080.0, 3960.0, 0.0, -1.0, 5],
                 [409, 407, 3, 6630.0, 4330.0, 0.0, -1.0, 5]],
                [[377, 5, 356, 5, 285, 235, 1, 0],
                 [409, 5, 421, 5, 415, 235, 1, 0]],
                {"uncertain end": [403]}]
        self.assertCountEqual(parsed_response[0], expected_response[0])
        self.assertCountEqual(parsed_response[1], expected_response[1])
        self.assertEqual(parsed_response[2], expected_response[2])

    def test_export_compact_arbor_with_minutes(self):
        self.fake_authentication()

        skeleton_id = 373
        response = self.client.post(
                '/%d/%d/1/1/1/compact-arbor-with-minutes' % (self.test_project_id, skeleton_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_response = [
                [[377, None, 3, 7620.0, 2890.0, 0.0, -1.0, 5],
                 [403, 377, 3, 7840.0, 2380.0, 0.0, -1.0, 5],
                 [405, 377, 3, 7390.0, 3510.0, 0.0, -1.0, 5],
                 [407, 405, 3, 7080.0, 3960.0, 0.0, -1.0, 5],
                 [409, 407, 3, 6630.0, 4330.0, 0.0, -1.0, 5]],
                [[377, 5, 356, 5, 285, 235, 1, 0],
                 [409, 5, 421, 5, 415, 235, 1, 0]],
                {"uncertain end": [403]},
                {"21951837": [377, 403, 405, 407, 409]}]
        self.assertCountEqual(parsed_response[0], expected_response[0])
        self.assertCountEqual(parsed_response[1], expected_response[1])
        self.assertEqual(parsed_response[2], expected_response[2])
        for k, v in expected_response[3].items():
            self.assertCountEqual(parsed_response[3][k], v)


class TreenodeTests(TestCase):
    fixtures = ['catmaid_testdata']

    maxDiff = None

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

        x = tns[0].location_x
        y = tns[0].location_y
        z = tns[0].location_z

        self.assertTrue(1030 < x < 1090)
        self.assertTrue(3000 < y < 3060)
        self.assertTrue(-30 < z < 30)

        # There should be 2 connectors attached to the skeleton via
        # treenodes:

        connectors = Connector.objects.filter(
            treenodeconnector__treenode__treenodeclassinstance__class_instance=skeleton)
        self.assertEqual(len(connectors), 3)

class PermissionTests(TestCase):
    fixtures = ['catmaid_testdata']

    def setUp(self):
        self.test_project_id = 3
        self.client = Client()

        create_anonymous_user(object())

        # Set up test API. Because we want to test only general access to the
        # methods, it doesn't matter if we use fake parameters.
        url_params = {
            'pid': self.test_project_id,
            'skid': 123456,
            'sid': 1,
        }
        self.can_browse_get_api = [
            '/permissions',
            '/accounts/login',
            '/user-list',
            '/%(pid)s/stacks' % url_params,
            '/%(pid)s/search' % url_params,
            '/%(pid)s/tracing/setup/test' % url_params,
            '/%(pid)s/stats/nodecount' % url_params,
            '/%(pid)s/stats/user-history' % url_params,
        ]
        self.can_browse_post_api = [
            '/permissions',
            '/accounts/login',
            '/user-table-list',
            '/user-profile/update',
            '/%(pid)s/notifications/list' % url_params,
            '/%(pid)s/node/user-info' % url_params,
            '/%(pid)s/node/get_location' % url_params,
            '/%(pid)s/node/list' % url_params,
            '/%(pid)s/skeletons/confidence-compartment-subgraph' % url_params,
            '/%(pid)s/graph/circlesofhell' % url_params,
            '/%(pid)s/connector/list/one_to_many' % url_params,
            '/%(pid)s/%(skid)s/1/1/0/compact-arbor' % url_params,
            '/%(pid)s/annotations/forskeletons' % url_params,
            '/%(pid)s/annotations/table-list' % url_params,
            '/%(pid)s/analytics/skeletons' % url_params,
            '/%(pid)s/skeleton/annotationlist' % url_params,
            '/%(pid)s/skeletons/review-status' % url_params,
            '/%(pid)s/skeleton/%(skid)s/neuronname' % url_params,
            '/%(pid)s/skeleton/connectors-by-partner' % url_params,
            '/%(pid)s/logs/list' % url_params,
            '/%(pid)s/graphexport/json' % url_params,
            '/%(pid)s/neuroml/neuroml_level3_v181' % url_params,
            '/%(pid)s/treenodearchive/export' % url_params,
            '/%(pid)s/connectorarchive/export' % url_params,
        ]

    def test_user_permissions(self):
            response = self.client.get("/permissions")
            self.assertEqual(response.status_code, 200)
            # Expect [{}, []] as result, because the anonymous user is
            # currently not assigned any permissions
            self.assertJSONEqual(response.content.decode('utf-8'), [{},[]])

    def test_can_browse_access(self):
        # Give anonymous user browse permissions for the test project
        anon_user = get_anonymous_user()
        p = Project.objects.get(pk=self.test_project_id)
        assign_perm('can_browse', anon_user, p)
        # Give anonymous user general browse permissions
        permission = Permission.objects.get(codename='can_browse')
        anon_user.user_permissions.add(permission)


        # Make sure we get no permission error on anonymous accessible get
        # methods. Test for all errors, since none of them should occur.
        for api in self.can_browse_get_api:
            msg = "GET %s" % api
            response = self.client.get(api)
            self.assertEqual(response.status_code, 200, msg)
            try:
                parsed_response = json.loads(response.content.decode('utf-8'))
                missing_permissions = ('error' in parsed_response and
                        parsed_response.get('type', None) == 'PermissionError')
                self.assertFalse(missing_permissions, msg)
            except ValueError as e:
                # If a response is no JSON, everything is fine as well
                if str(e) != "No JSON object could be decoded":
                    raise e

        # Make sure we get no permission error on anonymous accessible post
        # methods. Test for all errors, since none of them should occur.
        for api in self.can_browse_post_api:
            msg = "POST %s" % api
            response = self.client.post(api)
            self.assertEqual(response.status_code, 200, msg)
            try:
                parsed_response = json.loads(response.content.decode('utf-8'))
                missing_permissions = ('error' in parsed_response and
                        parsed_response.get('type', None) == 'PermissionError')
                self.assertFalse(missing_permissions, msg)
            except ValueError as e:
                # If a response is no JSON, everything is fine as well
                if str(e) != "No JSON object could be decoded":
                    raise e
