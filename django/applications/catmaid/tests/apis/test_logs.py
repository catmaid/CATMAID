# -*- coding: utf-8 -*-

import json

from .common import CatmaidApiTestCase


class LogsApiTests(CatmaidApiTestCase):
    log_rows = [
                    [
                        'test2',
                        'create_neuron',
                        '2012-07-22T16:50:57.758000+00:00',
                        5290.0,
                        3930.0,
                        279.0,
                        'Create neuron 2434 and skeleton 2433'],
                    [
                        'test2',
                        'create_neuron',
                        '2012-07-22T19:12:54.541000+00:00',
                        4470.0,
                        2110.0,
                        180.0,
                        'Create neuron 2441 and skeleton 2440'],
                    [
                        'test2',
                        'create_neuron',
                        '2012-07-22T19:15:24.010000+00:00',
                        3680.0,
                        2530.0,
                        180.0,
                        'Create neuron 2452 and skeleton 2451']
            ]


    def test_list_logs_user_param(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/logs/list' % self.test_project_id, {'user_id': 1})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                'iTotalDisplayRecords': 0,
                'iTotalRecords': 0,
                'aaData': []
                }
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
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                'iTotalDisplayRecords': 3,
                'iTotalRecords': 3,
                'aaData': [
                    self.log_rows[0], self.log_rows[1], self.log_rows[2]
                    ]
                }
        self.assertEqual(expected_result, parsed_response)


    def test_list_logs_subset(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/logs/list' % self.test_project_id, {
                    'iDisplayStart': 1,
                    'iDisplayLength': 2
                    })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(2, parsed_response['iTotalDisplayRecords'])
        self.assertEqual(2, parsed_response['iTotalRecords'])


    def test_list_logs_no_params(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/logs/list' % self.test_project_id, {})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(3, parsed_response['iTotalDisplayRecords'])
        self.assertEqual(3, parsed_response['iTotalRecords'])
        self.assertTrue(self.log_rows[0] in parsed_response['aaData'])
        self.assertTrue(self.log_rows[1] in parsed_response['aaData'])
        self.assertTrue(self.log_rows[2] in parsed_response['aaData'])
