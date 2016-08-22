import json

from catmaid.models import Connector, TreenodeConnector
from catmaid.state import make_nocheck_state

from .common import CatmaidApiTestCase


class ConnectorsApiTests(CatmaidApiTestCase):
    def test_list_connector_empty(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/table/list' % self.test_project_id, {
                    'iDisplayStart': 0,
                    'iDisplayLength': 25,
                    'iSortingCols': 1,
                    'iSortCol_0': 0,
                    'sSortDir_0': 'asc',
                    'relation_type': 1,
                    'skeleton_id': 0})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = {'iTotalRecords': 0, 'iTotalDisplayRecords': 0, 'aaData': []}
        self.assertEqual(expected_result, parsed_response)


    def test_list_connector_outgoing_with_sorting_and_paging(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/table/list' % self.test_project_id, {
                    'iDisplayStart': 1,
                    'iDisplayLength': 2,
                    'iSortingCols': 1,
                    'iSortCol_0': 6,
                    'sSortDir_0': 'desc',
                    'relation_type': 1,
                    'skeleton_id': 235})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = {
                u'iTotalRecords': 4,
                u'iTotalDisplayRecords': 4,
                u'aaData': [
                    [421, 373, 6630.00, 4330.00, 0.0, 5, 5, u"", 5, u"test2", 409, u'2011-10-07T07:02:30.396000+00:00'],
                    [356, 373, 7620.00, 2890.00, 0.0, 5, 5, u"", 5, u"test2", 377, u'2011-10-27T10:45:09.870000+00:00']]}
        self.assertEqual(expected_result, parsed_response)


    def test_list_connector_outgoing_with_sorting(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/table/list' % self.test_project_id, {
                    'iDisplayStart': 0,
                    'iDisplayLength': 25,
                    'iSortingCols': 1,
                    'iSortCol_0': 6,
                    'sSortDir_0': 'desc',
                    'relation_type': 1,
                    'skeleton_id': 235})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = {
                u'iTotalRecords': 4,
                u'iTotalDisplayRecords': 4,
                u'aaData': [
                    [432, u"", 2640.00, 3450.00, 0.0, 5, u"", u"synapse with more targets, TODO", 0, u"test2", u"", u'2011-10-31T05:22:37.263000+00:00'],
                    [421, 373, 6630.00, 4330.00, 0.0, 5, 5, u"", 5, u"test2", 409, u'2011-10-07T07:02:30.396000+00:00'],
                    [356, 373, 7620.00, 2890.00, 0.0, 5, 5, u"", 5, u"test2", 377, u'2011-10-27T10:45:09.870000+00:00'],
                    [356, 361, 7030.00, 1980.00, 0.0, 5, 5, u"", 9, u"test2", 367, u'2011-10-27T10:45:09.870000+00:00']]
        }
        self.assertEqual(expected_result, parsed_response)


    def test_list_connector_incoming_with_connecting_skeletons(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/table/list' % self.test_project_id, {
                    'iDisplayStart': 0,
                    'iDisplayLength': 25,
                    'iSortingCols': 1,
                    'iSortCol_0': 0,
                    'sSortDir_0': 'asc',
                    'relation_type': 0,
                    'skeleton_id': 373})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = {
                u'iTotalRecords': 2,
                u'iTotalDisplayRecords': 2,
                u'aaData': [
                    [356, 235, 6100.00, 2980.00, 0.0, 5, 5, u"", 28,
                     u"test2", 285, u'2011-10-27T10:45:09.870000+00:00'],
                    [421, 235, 5810.00, 3950.00, 0.0, 5, 5, u"", 28,
                     u"test2", 415, u'2011-10-07T07:02:30.396000+00:00']]}
        self.assertEqual(expected_result, parsed_response)


    def test_one_to_many_skeletons_connector_list(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/list/one_to_many' % self.test_project_id, {
                    'skid': 373,
                    'skids[0]': 235,
                    'relation': 'presynaptic_to'
                })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = []

        self.assertEqual(expected_result, parsed_response)

        response = self.client.post(
                '/%d/connector/list/one_to_many' % self.test_project_id, {
                    'skid': 373,
                    'skids[0]': 235,
                    'relation': 'postsynaptic_to'
                })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = [[356, [6730.0, 2700.0, 0.0],
                            377, 373, 5, 3, [7620.0, 2890.0, 0.0],
                            285, 235, 5, 3, [6100.0, 2980.0, 0.0]],
                           [421, [6260.0, 3990.0, 0.0],
                            409, 373, 5, 3, [6630.0, 4330.0, 0.0],
                            415, 235, 5, 3, [5810.0, 3950.0, 0.0]]]
        self.assertEqual(expected_result, parsed_response)


    def test_many_to_many_skeletons_connector_list(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/list/many_to_many' % self.test_project_id, {
                    'skids1[0]': 373,
                    'skids2[0]': 235,
                    'relation': 'presynaptic_to'
                })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = []

        self.assertEqual(expected_result, parsed_response)

        response = self.client.post(
                '/%d/connector/list/many_to_many' % self.test_project_id, {
                    'skids1[0]': 373,
                    'skids2[0]': 235,
                    'relation': 'postsynaptic_to'
                })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = [[356, [6730.0, 2700.0, 0.0],
                            377, 373, 5, 3, [7620.0, 2890.0, 0.0],
                            285, 235, 5, 3, [6100.0, 2980.0, 0.0]],
                           [421, [6260.0, 3990.0, 0.0],
                            409, 373, 5, 3, [6630.0, 4330.0, 0.0],
                            415, 235, 5, 3, [5810.0, 3950.0, 0.0]]]
        self.assertEqual(expected_result, parsed_response)


    def test_connector_skeletons(self):
        self.fake_authentication()

        response = self.client.post(
                '/%d/connector/skeletons' % self.test_project_id, {
                    'connector_ids[0]': 356,
                    'connector_ids[1]': 2463
                })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = [
            [356, {
                'presynaptic_to': 235,
                'presynaptic_to_node': 285,
                'postsynaptic_to': [361, 373],
                'postsynaptic_to_node': [367, 377]
            }],
            [2463, {
                'presynaptic_to': 2462,
                'presynaptic_to_node': 2462,
                'postsynaptic_to': [2462],
                'postsynaptic_to_node': [2461]
            }],
        ]
        self.assertEqual(len(expected_result), len(parsed_response))
        self.assertItemsEqual(expected_result, parsed_response)


    def test_create_connector(self):
        self.fake_authentication()
        connector_count = Connector.objects.all().count()
        response = self.client.post(
                '/%d/connector/create' % self.test_project_id,
                {'x': 111, 'y': 222, 'z': 333, 'confidence': 3})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        self.assertTrue('connector_id' in parsed_response.keys())
        connector_id = parsed_response['connector_id']

        new_connector = Connector.objects.filter(id=connector_id).get()
        self.assertEqual(111, new_connector.location_x)
        self.assertEqual(222, new_connector.location_y)
        self.assertEqual(333, new_connector.location_z)
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
                {'connector_id': connector_id, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = {
                'message': u'Removed connector and class_instances',
                'connector_id': 356,
                'x': 6730.0,
                'y': 2700.0,
                'z': 0.0,
                'confidence': 5,
                'partners': [{
                    'id': 285,
                    'link_id': 360,
                    'rel': 'presynaptic_to',
                    'rel_id': 23,
                    'confidence': 5,
                    'edition_time': '2011-12-04T13:51:36.955Z',
                },{
                    'id': 367,
                    'link_id': 372,
                    'rel': 'postsynaptic_to',
                    'rel_id': 24,
                    'confidence': 5,
                    'edition_time': '2011-12-05T13:51:36.955Z',
                }, {
                    'id': 377,
                    'link_id': 382,
                    'rel': 'postsynaptic_to',
                    'rel_id': 24,
                    'confidence': 5,
                    'edition_time': '2011-12-05T13:51:36.955Z',
                }]
        }


        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(connector_count - 1, Connector.objects.all().count())
        self.assertEqual(treenode_connector_count - 3, TreenodeConnector.objects.all().count())
        self.assertEqual(0, Connector.objects.filter(id=connector_id).count())
        self.assertEqual(0, TreenodeConnector.objects.filter(connector=connector).count())


    def test_connector_info(self):
        self.fake_authentication()
        response = self.client.post(
                '/%d/connector/info' % self.test_project_id,
                {'pre[0]': 235, 'post[0]': 373})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = [
                [356, [6730.0, 2700.0, 0.0],
                 285, 235, 5, 3, [6100.0, 2980.0, 0.0],
                 377, 373, 5, 3, [7620.0, 2890.0, 0.0]],
                [421, [6260.0, 3990.0, 0.0],
                 415, 235, 5, 3, [5810.0, 3950.0, 0.0],
                 409, 373, 5, 3, [6630.0, 4330.0, 0.0]]]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.post(
                '/%d/connector/info' % self.test_project_id,
                {'pre[0]': 235, 'post[0]': 373, 'cids[0]': 421})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = [
                [421, [6260.0, 3990.0, 0.0],
                 415, 235, 5, 3, [5810.0, 3950.0, 0.0],
                 409, 373, 5, 3, [6630.0, 4330.0, 0.0]]]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.post(
                '/%d/connector/info' % self.test_project_id,
                {'pre[0]': 2462, 'post[0]': 2468})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = [
                [2466, [6420.0, 5565.0, 0.0],
                 2462, 2462, 5, 3, [6685.0, 5395.0, 0.0],
                 2464, 2468, 5, 3, [6485.0, 5915.0, 0.0]]]

        self.assertEqual(expected_result, parsed_response)

        response = self.client.post(
                '/%d/connector/info' % self.test_project_id,
                {'pre[0]': 2462, 'post[0]': 2462})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = [
                [2463, [7135.0, 5065.0, 0.0],
                 2462, 2462, 5, 3, [6685.0, 5395.0, 0.0],
                 2461, 2462, 5, 3, [7680.0, 5345.0, 0.0]]]

        self.assertEqual(expected_result, parsed_response)


    def test_connector_detail(self):
        self.fake_authentication()
        response = self.client.get(
                '/%d/connectors/%d/' % (self.test_project_id, 421))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = {
                'partners': [
                    {
                        'confidence': 5,
                        'skeleton_id': 235,
                        'link_id': 425,
                        'relation_name': 'presynaptic_to',
                        'relation_id': 23,
                        'partner_id': 415},
                    {
                        'confidence': 5,
                        'skeleton_id': 373,
                        'link_id': 429,
                        'relation_name': 'postsynaptic_to',
                        'relation_id': 24,
                        'partner_id': 409}
                ],
                'confidence': 5,
                'connector_id': 421,
                'y': 3990.0,
                'x': 6260.0,
                'z': 0.0}

        self.assertEqual(expected_result, parsed_response)


    def test_connector_user_info(self):
        self.fake_authentication()
        response = self.client.get(
                '/%d/connector/user-info' % (self.test_project_id,), {
                    'treenode_id': 415,
                    'connector_id': 421,
                    'relation_name': 'presynaptic_to'
                })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = [{
                'creation_time': '2011-10-07T07:02:22.656000+00:00',
                'user': 3,
                'edition_time': '2011-12-20T10:46:01.360000+00:00'}]

        self.assertEqual(expected_result, parsed_response)
