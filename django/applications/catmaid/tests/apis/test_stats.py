import json

from .common import CatmaidApiTestCase


class StatsApiTests(CatmaidApiTestCase):
    def test_treenode_stats(self):
        self.fake_authentication()
        response = self.client.get('/%d/stats/nodecount' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        values = parsed_response['values']
        users = parsed_response['users']
        values_and_users = zip(values, users)
        for t in values_and_users:
            if t[0] == 4:
                self.assertEqual(t[1], 'test0 (4)')
            elif t[0] == 2:
                self.assertEqual(t[1], 'test1 (2)')
            elif t[0] == 89:
                self.assertEqual(t[1], 'test2 (89)')
            else:
                raise Exception("Unexpected value in returned stats: " + str(t))


    def test_stats_summary(self):
        self.fake_authentication()
        response = self.client.get('/%d/stats/summary' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        expected_result = {
            u"connectors_created": 0,
            u'skeletons_created': 0,
            u'treenodes_created': 0,
        }
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result, parsed_response)
