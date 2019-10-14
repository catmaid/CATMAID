# -*- coding: utf-8 -*-

import json

from catmaid.models import TreenodeConnector
from catmaid.state import make_nocheck_state

from .common import CatmaidApiTestCase


class LinksApiTests(CatmaidApiTestCase):
    def test_delete_link_failure(self):
        self.fake_authentication()
        connector_id = 202020
        treenode_id = 202020

        tc_count = TreenodeConnector.objects.all().count()
        response = self.client.post(
                '/%d/link/delete' % self.test_project_id,
                {'connector_id': connector_id, 'treenode_id': treenode_id,
                 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 400)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {'error': f'Could not find link between connector {connector_id} and node {treenode_id}'}
        self.assertIn('error', parsed_response)
        self.assertEqual(expected_result['error'], parsed_response['error'])
        self.assertEqual(tc_count, TreenodeConnector.objects.all().count())


    def test_delete_link_success(self):
        self.fake_authentication()
        connector_id = 356
        treenode_id = 377

        tc_count = TreenodeConnector.objects.all().count()
        response = self.client.post(
                '/%d/link/delete' % self.test_project_id,
                {'connector_id': connector_id, 'treenode_id': treenode_id,
                 'state': make_nocheck_state()})
        self.assertStatus(response)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'link_id': 382,
            'link_type': 'postsynaptic_to',
            'link_type_id': 1024,
            'result': 'Removed treenode to connector link'
        }
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(0, TreenodeConnector.objects.filter(connector=connector_id, treenode=treenode_id).count())
        self.assertEqual(tc_count - 1, TreenodeConnector.objects.all().count())


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
                    'link_type': link_type,
                    'state': make_nocheck_state()
                })
        self.assertStatus(response)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertIn('message', parsed_response)
        self.assertIn('link_id', parsed_response)
        self.assertEqual('success', parsed_response['message'])


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
                    'link_type': link_type,
                    'state': make_nocheck_state()
                })
        self.assertStatus(response, 400)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertIn('error', parsed_response)
        error_message = f'Connector {to_id} does not have zero presynaptic connections.'
        self.assertEqual(error_message, parsed_response.get('error'))


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
                    'link_type': link_type,
                    'state': make_nocheck_state()
                })
        self.assertStatus(response)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertIn('message', parsed_response)
        self.assertIn('link_id', parsed_response)
        self.assertEqual('success', parsed_response['message'])

