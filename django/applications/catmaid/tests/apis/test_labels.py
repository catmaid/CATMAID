import json

from .common import CatmaidApiTestCase


class LabelsApiTests(CatmaidApiTestCase):
    def test_labels(self):
        self.fake_authentication()
        response = self.client.get('/%d/labels/' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        returned_labels = json.loads(response.content)
        self.assertEqual(set(returned_labels),
                         set(["t",
                              "synapse with more targets",
                              "uncertain end",
                              "TODO"]))
        nodes = ("7", "237", "367", "377", "417", "409", "407", "399", "397",
                "395", "393", "387", "385", "403", "405", "383", "391", "415",
                "289", "285", "283", "281", "277", "275", "273", "271", "279",
                "267", "269", "265", "261", "259", "257", "255", "263", "253",
                "251", "249", "247", "245", "243", "241", "239", "356", "421",
                "432")
        connector_ids = ("432",)
        response = self.client.post('/%d/labels-for-nodes' % (self.test_project_id,),
                              {'treenode_ids': ",".join(nodes),
                               'connector_ids': ",".join(connector_ids)})

        returned_node_map = json.loads(response.content)
        self.assertEqual(len(returned_node_map.keys()), 3)
        self.assertEqual(set(returned_node_map['403']),
                         set(["uncertain end"]))
        self.assertEqual(set(returned_node_map['261']),
                         set(["TODO"]))
        self.assertEqual(set(returned_node_map['432']),
                         set(["synapse with more targets", "TODO"]))

        response = self.client.get('/%d/labels/location/%d/' % (self.test_project_id,
                                                                    432))
        returned_labels = json.loads(response.content)
        self.assertEqual(set(returned_labels),
                         set(["synapse with more targets", "TODO"]))

        response = self.client.get('/%d/labels/treenode/%d/' % (self.test_project_id,
                                                                    403))
        returned_labels = json.loads(response.content)
        self.assertEqual(len(returned_labels), 1)
        self.assertEqual(returned_labels[0], "uncertain end")

        # Test label update with, removing existing tags
        response = self.client.post('/%d/label/treenode/%d/update' % (self.test_project_id,
                                                                      403),
                                    {'tags': ",".join(['foo', 'bar'])})
        parsed_response = json.loads(response.content)
        self.assertTrue('message' in parsed_response)
        self.assertTrue(parsed_response['message'] == 'success')

        response = self.client.get('/%d/labels/treenode/%d/' % (self.test_project_id,
                                                                    403))
        returned_labels = json.loads(response.content)
        self.assertEqual(len(returned_labels), 2)
        self.assertEqual(set(returned_labels), set(['foo', 'bar']))

        # Test label update without removing existing tags
        response = self.client.post('/%d/label/treenode/%d/update' % (self.test_project_id,
                                                                      403),
                                    {'tags': ",".join(['green', 'apple']),
                                     'delete_existing': 'false'})
        parsed_response = json.loads(response.content)
        self.assertTrue('message' in parsed_response)
        self.assertTrue(parsed_response['message'] == 'success')

        response = self.client.get('/%d/labels/treenode/%d/' % (self.test_project_id,
                                                                    403))
        returned_labels = json.loads(response.content)
        self.assertEqual(len(returned_labels), 4)
        self.assertEqual(set(returned_labels), set(['foo', 'bar', 'green', 'apple']))

        # Test removal of a single label
        response = self.client.post('/%d/label/treenode/%d/remove' % (self.test_project_id,
                                                                      403),
                                    {'tag': 'bar'})
        parsed_response = json.loads(response.content)
        self.assertTrue('message' in parsed_response)
        self.assertTrue(parsed_response['message'] == 'success')

        response = self.client.get('/%d/labels/treenode/%d/' % (self.test_project_id,
                                                                    403))
        returned_labels = json.loads(response.content)
        self.assertEqual(len(returned_labels), 3)
        self.assertEqual(set(returned_labels), set(['foo', 'green', 'apple']))


    def test_label_cardinality_warning(self):
        self.fake_authentication()
        response = self.client.post('/%d/label/treenode/%d/update' % (self.test_project_id,
                                                                      393),
                                    {'tags': ",".join(['soma', 'fake'])})
        parsed_response = json.loads(response.content)
        self.assertEqual(response.status_code, 200)
        self.assertFalse('warning' in parsed_response)

        response = self.client.post('/%d/label/treenode/%d/update' % (self.test_project_id,
                                                                      395),
                                    {'tags': ",".join(['soma', 'fake'])})
        parsed_response = json.loads(response.content)
        self.assertEqual(response.status_code, 200)
        self.assertTrue('warning' in parsed_response)
        self.assertTrue('soma (2, max. 1)' in parsed_response['warning'])
