# -*- coding: utf-8 -*-

import json

from catmaid.control.annotation import _annotate_entities
from catmaid.models import ClassInstance, Log

from .common import CatmaidApiTestCase


class NeuronsApiTests(CatmaidApiTestCase):
    def test_rename_neuron(self):
        self.fake_authentication()
        neuron_id = 233

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        old_name = ClassInstance.objects.get(id=neuron_id).name
        new_name = 'newname'
        self.assertFalse(old_name == new_name)

        url = '/%d/neurons/%s/rename' % (self.test_project_id, neuron_id)
        response = self.client.post(url, {'name': new_name})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'success': True,
            'renamed_neuron': neuron_id,
            'old_name': 'branched neuron'
        }
        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(new_name, ClassInstance.objects.get(id=neuron_id).name)
        self.assertEqual(log_count + 1, count_logs())


    def test_rename_neuron_fail(self):
        self.fake_authentication()
        neuron_id = 362

        # Lock this neuron for another user
        _annotate_entities(self.test_project_id, [neuron_id],
                {'locked': { 'user_id': 1 }})

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        old_name = ClassInstance.objects.get(id=neuron_id).name
        new_name = 'newname'
        self.assertFalse(old_name == new_name)

        url = '/%d/neurons/%s/rename' % (self.test_project_id, neuron_id)
        response = self.client.post(url, {'name': new_name})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertTrue('error' in parsed_response)
        self.assertTrue(parsed_response['error'])

        self.assertEqual(old_name, ClassInstance.objects.get(id=neuron_id).name)
        self.assertEqual(log_count, count_logs())


    def test_neuron_ids_from_models(self):
        self.fake_authentication()
        url = '/%d/neurons/from-models' % (self.test_project_id,)
        response = self.client.post(url, {'model_ids': [235, 373]})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            '235': 233,
            '373': 374
        }
        self.assertDictEqual(expected_result, parsed_response)


    def test_skeletons_from_neuron(self):
        self.fake_authentication()
        url = '/%d/neuron/%d/get-all-skeletons' % (self.test_project_id,
                                              233)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        parsed_data = json.loads(response.content.decode('utf-8'))
        self.assertEqual(len(parsed_data), 1)
        self.assertEqual(parsed_data[0], 235)
