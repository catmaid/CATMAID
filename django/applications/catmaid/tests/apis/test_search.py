# -*- coding: utf-8 -*-

import json

from catmaid.models import ClassInstance

from .common import CatmaidApiTestCase


class SearchApiTests(CatmaidApiTestCase):
    def test_search_with_no_nodes(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'tr'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [
                {"id":374, "name":"downstream-A", "class_name":"neuron"},
                {"id":362, "name":"downstream-B", "class_name":"neuron"}]
        self.assertEqual(expected_result, parsed_response)


    def test_search_with_no_results(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'bobobobobobobo'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = []
        self.assertEqual(expected_result, parsed_response)


    def test_search_with_several_nodes(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 't'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [
                {"id":465, "name":"tubby bye bye", "class_name":"driver_line"},
                {"id":4, "name":"Fragments", "class_name":"group"},
                {"id":364, "name":"Isolated synaptic terminals", "class_name":"group"},
                {"id":2353, "name":"synapse with more targets", "class_name":"label",
                    "connectors": [{"id": 432, "x": 2640, "y": 3450, "z": 0}]},
                {"id":2345, "name":"t", "class_name":"label"},
                {"id":351, "name":"TODO", "class_name":"label", "nodes":[
                    {"id":349, "x":3580, "y":3350, "z":252, "skid":1},
                    {"id":261, "x":2820, "y":1345, "z":0, "skid":235}],
                    "connectors": [{"y": 3450.0, u"x": 2640.0, u"z": 0.0, u"id": 432}]},
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
                {"id":2462, "name":"skeleton 2462", "class_name":"skeleton"},
                {"id":2468, "name":"skeleton 2468", "class_name":"skeleton"},
                {"id":361, "name":"skeleton 361", "class_name":"skeleton"},
                {"id":373, "name":"skeleton 373", "class_name":"skeleton"}]
        self.assertCountEqual(expected_result, parsed_response)


    def test_search_with_nodes_and_nonode_label(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'a'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [
                {"id":485, "name":"Local", "class_name":"cell_body_location"},
                {"id":487, "name":"Non-Local", "class_name":"cell_body_location"},
                {"id":454, "name":"and", "class_name":"driver_line"},
                {"id":4, "name":"Fragments", "class_name":"group"},
                {"id":364, "name":"Isolated synaptic terminals", "class_name":"group"},
                {"id":2353, "name":"synapse with more targets", "class_name":"label",
                    "connectors": [{"id": 432, "x": 2640, "y": 3450, "z": 0}]},
                {"id":2342, "name":"uncertain end", "class_name":"label", "nodes":[
                    {"id":403, "x":7840, "y":2380, "z":0, "skid":373}]},
                {"id":233, "name":"branched neuron", "class_name":"neuron"},
                {"id":374, "name":"downstream-A", "class_name":"neuron"},
                {"id":362, "name":"downstream-B", "class_name":"neuron"}]
        self.assertEqual(expected_result, parsed_response)


    def test_search_with_nodes_and_duplicate_label(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'uncertain end'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        # Expect only one result that has a node linked
        expected_result = [
            {"id":2342, "name":"uncertain end", "class_name":"label", "nodes":[
                {"id":403, "x":7840, "y":2380, "z":0, "skid":373}]},
        ]
        self.assertCountEqual(expected_result, parsed_response)

        # Add a duplicate record of the label, without any node links
        label = ClassInstance.objects.get(id=2342)
        label.id = None
        label.save()

        response2 = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'uncertain end'})
        self.assertEqual(response2.status_code, 200)
        parsed_response2 = json.loads(response2.content.decode(('utf-8')))

        # Expect the nodes to be not linked to the duplicate record
        expected_result2 = [
            {"id":label.id, "name":"uncertain end", "class_name":"label"},
            {"id":2342, "name":"uncertain end", "class_name":"label", "nodes":[
                {"id":403, "x":7840, "y":2380, "z":0, "skid":373}]}
        ]
        self.assertCountEqual(expected_result2, parsed_response2)


    def test_search_with_nodes(self):
        self.fake_authentication()

        response = self.client.get(
                '/%d/search' % self.test_project_id,
                {'substring': 'c'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [
                {"id":485, "name":"Local", "class_name":"cell_body_location"},
                {"id":487, "name":"Non-Local", "class_name":"cell_body_location"},
                {"id":458, "name":"c005", "class_name":"driver_line"},
                {"id":364, "name":"Isolated synaptic terminals", "class_name":"group"},
                {"id":2342, "name":"uncertain end", "class_name":"label",
                    "nodes":[{"id":403, "x":7840, "y":2380, "z":0, "skid":373}]},
                {"id":233, "name":"branched neuron", "class_name":"neuron"}]
        self.assertEqual(expected_result, parsed_response)
