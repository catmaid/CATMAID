# -*- coding: utf-8 -*-

import json

from django.db import connection

from catmaid.models import Connector, Treenode
from catmaid.state import make_nocheck_state

from .common import CatmaidApiTestCase


class NodesApiTests(CatmaidApiTestCase):
    def test_most_recent_treenode(self):
        self.fake_authentication()

        # Test without skeleton filter.
        most_recent_node_id = 2465

        response = self.client.get(
                '/%d/nodes/most-recent' % self.test_project_id)
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                'id': most_recent_node_id,
                'x': 6485,
                'y': 6345,
                'z': 0,
                }
        self.assertEqual(expected_result, parsed_response)

        # Test with skeleton filter.
        most_recent_node_id = 2423
        skeleton_id = 2411

        response = self.client.get(
                '/%d/nodes/most-recent' % self.test_project_id,
                {'skeleton_id': skeleton_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                'id': most_recent_node_id,
                'x': 4140,
                'y': 6460,
                'z': 0,
                }
        self.assertEqual(expected_result, parsed_response)


    def test_node_nearest_for_skeleton(self):
        self.fake_authentication()
        response = self.client.get(
                '/%d/nodes/nearest' % self.test_project_id,
                {
                    'x': 5115,
                    'y': 3835,
                    'z': 4050,
                    'skeleton_id': 2388,
                    })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                "treenode_id": 2394,
                "x": 3110,
                "y": 6030,
                "z": 0,
                "skeleton_id": 2388}
        self.assertEqual(expected_result, parsed_response)


    def test_node_nearest_for_neuron(self):
        self.fake_authentication()
        response = self.client.get(
                '/%d/nodes/nearest' % self.test_project_id,
                {
                    'x': 5115,
                    'y': 3835,
                    'z': 0,
                    'neuron_id': 362,
                    })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                "treenode_id": 367,
                "x": 7030,
                "y": 1980,
                "z": 0,
                "skeleton_id": 361}
        self.assertEqual(expected_result, parsed_response)


    def test_node_user_info(self):
        self.fake_authentication()

        response = self.client.post(
                '/%d/node/user-info' % (self.test_project_id),
                {'node_ids': [367, 387]})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            "367": {
                "creation_time": "2011-09-27T07:57:17.808000+00:00",
                "edition_time": "2011-12-05T13:51:36.955000+00:00",
                "editor": 3,
                "review_times": [],
                "reviewers": [],
                "user": 3
            },
            '387': {
                'creation_time': u'2011-09-27T07:57:26.310000+00:00',
                'edition_time': u'2011-12-05T13:51:36.955000+00:00',
                'editor': 3,
                'review_times': [],
                'reviewers': [],
                'user': 3
            }
        }

        self.assertEqual(expected_result, parsed_response)


    def test_node_get_location(self):
        self.fake_authentication()

        treenode_id = 383
        response = self.client.post(
                '/%d/node/get_location' % (self.test_project_id),
                {'tnid': treenode_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [383, 7850.0, 1970.0, 0.0]
        self.assertEqual(expected_result, parsed_response)


    def test_node_get_locations(self):
        self.fake_authentication()

        treenode_ids = [367, 383, 387]
        response = self.client.post( '/%d/nodes/location' % self.test_project_id, {
            'node_ids': treenode_ids
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [
            [383, 7850.0, 1970.0, 0.0],
            [367, 7030.0, 1980.0, 0.0],
            [387, 9030.0, 1480.0, 0.0]
        ]
        self.assertCountEqual(expected_result, parsed_response)
        self.assertEqual(sorted(expected_result), sorted(parsed_response))


    def test_node_get_locations_wrong_project(self):
        self.fake_authentication()

        treenode_ids = [367, 383, 387]
        response = self.client.post( '/%d/nodes/location' % (self.test_project_id + 1), {
            'node_ids': treenode_ids
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertTrue('error' in parsed_response)


    def test_node_find_labels(self):
        self.fake_authentication()

        # Create labels.
        treenode_id = 387
        response = self.client.post(
                '/%d/label/treenode/%d/update' % (self.test_project_id, treenode_id),
                {'tags': 'testlabel'})
        self.assertEqual(response.status_code, 200)
        treenode_id = 403
        response = self.client.post(
                '/%d/label/treenode/%d/update' % (self.test_project_id, treenode_id),
                {'tags': 'Testlabel'})
        self.assertEqual(response.status_code, 200)

        response = self.client.post(
                '/%d/nodes/find-labels' % (self.test_project_id, ),
                {'x': 8810,
                 'y': 1790,
                 'z': 0,
                 'label_regex': '[Tt]estlabel'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [[387, [9030.0, 1480.0, 0.0], 380.131556174964, ["testlabel"]],
                           [403, [7840.0, 2380.0, 0.0], 1135.3413583588, ["Testlabel"]]]
        self.assertEqual(expected_result, parsed_response)


    def test_node_update_single_treenode(self):
        self.fake_authentication()
        treenode_id = 289
        x = 5690
        y = 3340
        z = 0

        response = self.client.post(
                '/%d/node/update' % self.test_project_id, {
                    'state': make_nocheck_state(),
                    't[0][0]': treenode_id,
                    't[0][1]': x,
                    't[0][2]': y,
                    't[0][3]': z})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'updated': 1,
            'old_connectors': None,
            'old_treenodes': [[289, '2016-04-13T06:20:47.473Z', 6210.0, 3480.0, 0.0]]
        }
        self.assertIn('updated', parsed_response)
        self.assertEqual(expected_result['updated'], parsed_response['updated'])
        self.assertIn('old_connectors', parsed_response)
        self.assertEqual(expected_result['old_connectors'], parsed_response['old_connectors'])
        self.assertIn('old_treenodes', parsed_response)
        for n, r in enumerate(expected_result.get('old_treenodes')):
            for i in range(5):
                # Skip edition time, which changed during last request
                if 1 == i:
                    continue
                self.assertEqual(expected_result.get('old_treenodes')[n][i],
                    parsed_response.get('old_treenodes')[n][i])
        treenode = Treenode.objects.filter(id=treenode_id)[0]
        self.assertEqual(x, treenode.location_x)
        self.assertEqual(y, treenode.location_y)
        self.assertEqual(z, treenode.location_z)


    def test_node_update_invalid_location(self):
        self.fake_authentication()
        treenode_id = 289
        treenode = Treenode.objects.filter(id=treenode_id)[0]
        orig_x = treenode.location_x
        orig_y = treenode.location_y
        orig_z = treenode.location_z
        x = 5690
        z = 0

        for y in [float('NaN'), float('Infinity')]:
            response = self.client.post(
                    '/%d/node/update' % self.test_project_id, {
                        't[0][0]': treenode_id,
                        't[0][1]': x,
                        't[0][2]': y,
                        't[0][3]': z})
            self.assertEqual(response.status_code, 200)
            parsed_response = json.loads(response.content.decode('utf-8'))
            self.assertIn('error', parsed_response)
            cursor = connection.cursor()
            cursor.execute('''
                SELECT location_x, location_y, location_z FROM location
                WHERE id=%s''' % treenode_id)
            treenode = cursor.fetchall()[0]
            self.assertEqual(orig_x, treenode[0])
            self.assertEqual(orig_y, treenode[1])
            self.assertEqual(orig_z, treenode[2])


    def test_node_update_many_nodes(self):
        self.fake_authentication()
        self.maxDiff = None
        node_id = [2368, 2370, 356, 421]
        x = [2990, 3060, 3640, 3850]
        y = [5200, 4460, 5060, 4800]
        z = [1, 2, 5, 6]
        types = ['t', 't', 'c', 'c']

        def insert_params(dictionary, param_id, params):
            """ Creates a parameter representation that is expected by the
            backend. Parameters are identified by a number: 0: id, 1: X, 2: Y
            and 3: Z. """
            for i,param in enumerate(params):
                dictionary['%s[%s][%s]' % (types[i], i, param_id)] = params[i]

        param_dict = {
            'state': make_nocheck_state()
        }
        insert_params(param_dict, 0, node_id)
        insert_params(param_dict, 1, x)
        insert_params(param_dict, 2, y)
        insert_params(param_dict, 3, z)

        response = self.client.post(
                '/%d/node/update' % self.test_project_id, param_dict)
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'updated': 4,
            'old_treenodes': [
                [2368, '2016-04-13T05:40:25.445Z', 1820.0, 5390.0, 0.0],
                [2370, '2016-04-13T05:40:25.445Z', 2140.0, 4620.0, 0.0]],
            'old_connectors': [
                [356, '2016-04-13T05:40:25.445Z', 6730.0, 2700.0, 0.0],
                [421, '2016-04-13T05:40:25.445Z', 6260.0, 3990.0, 0.0]]

        }
        self.assertEqual(expected_result.get('updated'), parsed_response.get('updated'))
        for i in range(2):
            for j in range(5):
                # Skip edition time, because it changes through the request
                if 1 == j:
                    continue
                self.assertEqual(expected_result.get('old_treenodes')[i][j],
                                 parsed_response.get('old_treenodes')[i][j])
        for i in range(2):
            for j in range(5):
                # Skip edition time, because it changes through the request
                if 1 == j:
                    continue
                self.assertEqual(expected_result.get('old_connectors')[i][j],
                                 parsed_response.get('old_connectors')[i][j])

        i = 0
        for n_id in node_id:
            if types[i] == 't':
                node = Treenode.objects.filter(id=n_id)[0]
            else:
                node = Connector.objects.filter(id=n_id)[0]
            self.assertEqual(x[i], node.location_x)
            self.assertEqual(y[i], node.location_y)
            self.assertEqual(z[i], node.location_z)
            i += 1


    def test_node_no_update_many_nodes(self):
        self.fake_authentication()
        self.maxDiff = None
        node_id = [2368, 2370, 2372, 2374]
        x = [2990, 3060, 3210, 3460]
        y = [5200, 4460, 4990, 4830]
        z = [1, 2, 3, 4]
        types = ['t', 't', 't', 't']

        def insert_params(dictionary, param_id, params):
            """ Creates a parameter representation that is expected by the
            backend. Parameters are identified by a number: 0: id, 1: X, 2: Y
            and 3: Z. """
            for i,param in enumerate(params):
                dictionary['%s[%s][%s]' % (types[i], i, param_id)] = params[i]

        param_dict = {
            'state': make_nocheck_state()
        }
        insert_params(param_dict, 0, node_id)
        insert_params(param_dict, 1, x)
        insert_params(param_dict, 2, y)
        insert_params(param_dict, 3, z)

        response = self.client.post(
                '/%d/node/update' % self.test_project_id, param_dict)
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {'error': 'User test2 cannot edit all of the 4 '
                           'unique objects from table treenode'}
        self.assertEqual(expected_result['error'], parsed_response['error'])


    def test_node_list_without_active_node(self):
        self.fake_authentication()

        response = self.client.post(
                '/%d/label/treenode/%d/update' % (self.test_project_id, 2374),
                {'tags': 'test_treenode_label', 'delete_existing': 'false'})
        self.assertEqual(response.status_code, 200)

        expected_t_result = [
            [2374, 2372, 3310.0, 5190.0, 0.0, 5, -1.0, 2364, 1323093096.955, 5],
            [2372, 2370, 2760.0, 4600.0, 0.0, 5, -1.0, 2364, 1323093096.955, 5],
            [2376, 2374, 3930.0, 4330.0, 0.0, 5, -1.0, 2364, 1323093096.955, 5],
            [2378, 2376, 4420.0, 4880.0, 0.0, 5, -1.0, 2364, 1323093096.955, 5],
            [2394, 2392, 3110.0, 6030.0, 0.0, 5, -1.0, 2388, 1323417708.933, 3],
            [2392, None, 2370.0, 6080.0, 0.0, 5, -1.0, 2388, 1323417697.575, 3],
            [2396, 2394, 3680.0, 6550.0, 0.0, 5, -1.0, 2388, 1323417700.583, 3],
            [2415, None, 4110.0, 6080.0, 0.0, 5, -1.0, 2411, 1323417719.149, 3],
            [2417, 2415, 4400.0, 5730.0, 0.0, 5, -1.0, 2411, 1323417720.466, 3],
            [2423, 2415, 4140.0, 6460.0, 0.0, 5, -1.0, 2411, 1323417731.175, 3],
            [2419, 2417, 5040.0, 5650.0, 0.0, 5, -1.0, 2411, 1323417721.614, 3],
            [2459, None, 7310.0, 6415.0, 0.0, 5, -1.0, 2462, 1457547019.652, 3],
            [2460, 2459, 7280.0, 5855.0, 0.0, 5, -1.0, 2462, 1457547020.699, 3],
            [2461, 2460, 7680.0, 5345.0, 0.0, 5, -1.0, 2462, 1457547024.145, 3],
            [2462, 2460, 6685.0, 5395.0, 0.0, 5, -1.0, 2462, 1457547028.168, 3],
            [2464, None, 6485.0, 5915.0, 0.0, 5, -1.0, 2468, 1457547042.861, 3],
            [2465, 2464, 6485.0, 6345.0, 0.0, 5, -1.0, 2468, 1457547044.212, 3]
        ]

        expected_c_result = [
            [2400, 3400.0, 5620.0, 0.0, 5, 1323417703.965, 3, [
                [2374, 1024, 5, 1324377961.36, 2410],
                [2394, 1023, 5, 1324377961.36, 2405],
                [2415, 1023, 5, 1324377961.36, 2429]]],
            [2463, 7135.0, 5065.0, 0.0, 5, 1457547029.666, 3, [
                [2462, 1023, 5, 1457547029.808, 2466],
                [2461, 1024, 5, 1457547033.669, 2467]]],
            [2466, 6420.0, 5565.0, 0.0, 5, 1457547049.445, 3, [
                [2462, 1023, 5, 1457547049.583, 2472],
                [2464, 1024, 5, 1457547050.846, 2473]]]
        ]

        expected_label_response = {
            '2374': ['test_treenode_label']
        }

        expected_rel_response = {
            '1024': 'postsynaptic_to',
            '1023': 'presynaptic_to'
        }

        response = self.client.post('/%d/node/list' % (self.test_project_id,), {
            'z1': 0,
            'top': 4625,
            'left': 2860,
            'right': 12625,
            'bottom': 8075,
            'z2': 9,
            'labels': 'true',
        })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(len(expected_t_result), len(parsed_response[0]))
        self.assertEqual(len(expected_c_result), len(parsed_response[1]))
        for row in expected_t_result:
            self.assertTrue(row in parsed_response[0])
        for row in expected_c_result:
            parsed_row = [r for r in parsed_response[1] if r[0] == row[0]]
            self.assertEqual(1, len(parsed_row))
            parsed_row = parsed_row[0]
            for n,e in enumerate(row):
                # Treat links separately, because they come in a list of
                # unspecified different order.
                if 7 == n:
                    self.assertCountEqual(row[n], parsed_row[n])
                else:
                    self.assertEqual(e, parsed_row[n])

        self.assertEqual(expected_label_response, parsed_response[2])
        self.assertEqual(False, parsed_response[3])
        self.assertEqual(expected_rel_response, parsed_response[4])


    def test_node_list_with_active_node(self):
        self.fake_authentication()
        expected_t_result = [
            [279,   267, 5530.0, 2465.0, 0.0, 5, -1.0, 235,  1323093096.955, 3],
            [267,   265, 5400.0, 2200.0, 0.0, 5, -1.0, 235,  1323093096.955, 3],
            [281,   279, 5675.0, 2635.0, 0.0, 5, -1.0, 235,  1323093096.955, 3],
            [283,   281, 5985.0, 2745.0, 0.0, 5, -1.0, 235,  1323957096.955, 3],
            [285,   283, 6100.0, 2980.0, 0.0, 5, -1.0, 235,  1323006696.955, 3],
            [289,   285, 6210.0, 3480.0, 0.0, 5, -1.0, 235,  1320587496.955, 3],
            [415,   289, 5810.0, 3950.0, 0.0, 5, -1.0, 235,  1323093096.955, 3],
            [377,  None, 7620.0, 2890.0, 0.0, 5, -1.0, 373,  1323093096.955, 3],
            [403,   377, 7840.0, 2380.0, 0.0, 5, -1.0, 373,  1323093096.955, 3],
            [405,   377, 7390.0, 3510.0, 0.0, 5, -1.0, 373,  1323093096.955, 3],
            [407,   405, 7080.0, 3960.0, 0.0, 5, -1.0, 373,  1323093096.955, 3],
            [409,   407, 6630.0, 4330.0, 0.0, 5, -1.0, 373,  1323093096.955, 3],
            [417,   415, 4990.0, 4200.0, 0.0, 5, -1.0, 235,  1323093096.955, 3],
            [2419, 2417, 5040.0, 5650.0, 0.0, 5, -1.0, 2411, 1323417721.614, 3],
            [2417, 2415, 4400.0, 5730.0, 0.0, 5, -1.0, 2411, 1323417720.466, 3],
            [2461, 2460, 7680.0, 5345.0, 0.0, 5, -1.0, 2462, 1457547024.145, 3],
            [2460, 2459, 7280.0, 5855.0, 0.0, 5, -1.0, 2462, 1457547020.699, 3],
            [2462, 2460, 6685.0, 5395.0, 0.0, 5, -1.0, 2462, 1457547028.168, 3],
            [2464, None, 6485.0, 5915.0, 0.0, 5, -1.0, 2468, 1457547042.861, 3],
            [367,  None, 7030.0, 1980.0, 0.0, 5, -1.0, 361,  1323093096.955, 3],
            [2423, 2415, 4140.0, 6460.0, 0.0, 5, -1.0, 2411, 1323417731.175, 3]
        ]

        expected_c_result = [
            [356, 6730.0, 2700.0, 0.0, 5, 1319712309.87, 3, [
                [285, 1023, 5, 1324377961.36, 360],
                [367, 1024, 5, 1324377961.36, 372],
                [377, 1024, 5, 1324377961.36, 382]]],
            [421, 6260.0, 3990.0, 0.0, 5, 1317970950.396, 3, [
                [415, 1023, 5, 1324377961.36, 425],
                [409, 1024, 5, 1324377961.36, 429]]],
            [2463, 7135.0, 5065.0, 0.0, 5, 1457547029.666, 3, [
                [2462, 1023, 5, 1457547029.808, 2466],
                [2461, 1024, 5, 1457547033.669, 2467]]],
            [2466, 6420.0, 5565.0, 0.0, 5, 1457547049.445, 3, [
                [2462, 1023, 5, 1457547049.583, 2472],
                [2464, 1024, 5, 1457547050.846, 2473]]]
        ]

        expected_rel_response = {
            '1024': 'postsynaptic_to',
            '1023': 'presynaptic_to'
        }

        response = self.client.post('/%d/node/list' % (self.test_project_id,), {
                'z1': 0,
                'top': 2280,
                'left': 4430,
                'right': 12430,
                'bottom': 5730,
                'z2': 9,
                'treenode_ids': 2423,
                'labels': False,})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(5, len(parsed_response))
        self.assertEqual(len(expected_t_result), len(parsed_response[0]))
        self.assertEqual(len(expected_c_result), len(parsed_response[1]))
        for row in expected_t_result:
            self.assertTrue(row in parsed_response[0])
        for row in expected_c_result:
            parsed_row = [r for r in parsed_response[1] if r[0] == row[0]]
            self.assertEqual(1, len(parsed_row))
            parsed_row = parsed_row[0]
            for n,e in enumerate(row):
                # Treat links separately, because they come in a list of
                # unspecified different order.
                if 7 == n:
                    self.assertCountEqual(row[n], parsed_row[n])
                else:
                    self.assertEqual(e, parsed_row[n])
        self.assertEqual({}, parsed_response[2])
        self.assertEqual(False, parsed_response[3])
        self.assertEqual(expected_rel_response, parsed_response[4])
