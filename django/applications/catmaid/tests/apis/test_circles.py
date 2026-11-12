# -*- coding: utf-8 -*-

import json

from catmaid.models import TreenodeConnector

from .common import CatmaidApiTestCase


class CirclesApiTests(CatmaidApiTestCase):
    """Test growing a set of skeletons along their connections. The test data
    contains the synaptic connections 235 -> 361 (one synapse), 235 -> 373 (two
    synapses), 2388 -> 2364 and 2411 -> 2364 (one synapse each).
    """

    def add_gap_junction(self):
        """Connect skeleton 361 and skeleton 2364 with a gap junction (relation
        1025, gapjunction_with) at connector 432.
        """
        TreenodeConnector.objects.create(project_id=self.test_project_id,
                user_id=3, relation_id=1025, treenode_id=367,
                connector_id=432, skeleton_id=361)
        TreenodeConnector.objects.create(project_id=self.test_project_id,
                user_id=3, relation_id=1025, treenode_id=2374,
                connector_id=432, skeleton_id=2364)

    def get_circles(self, skeleton_ids, expected_status=200, **params):
        params['skeleton_ids'] = skeleton_ids
        response = self.client.post(
                f'/{self.test_project_id}/graph/circlesofhell', params)
        self.assertStatus(response, expected_status)
        parsed_response = json.loads(response.content.decode('utf-8'))
        if expected_status != 200:
            return parsed_response
        skeleton_ids, names = parsed_response
        # Each returned skeleton comes with its neuron name
        self.assertEqual(sorted(int(skid) for skid in names.keys()),
                sorted(skeleton_ids))
        return sorted(skeleton_ids)

    def get_path_skeletons(self, sources, targets, expected_status=200, **params):
        for i, skeleton_id in enumerate(sources):
            params[f'sources[{i}]'] = skeleton_id
        for i, skeleton_id in enumerate(targets):
            params[f'targets[{i}]'] = skeleton_id
        response = self.client.post(
                f'/{self.test_project_id}/graph/dps', params)
        self.assertStatus(response, expected_status)
        parsed_response = json.loads(response.content.decode('utf-8'))
        if expected_status != 200:
            return parsed_response
        return sorted(parsed_response)

    def test_circles_of_hell(self):
        self.fake_authentication()

        self.assertEqual(self.get_circles([235], min_pre=1, min_post=1),
                [361, 373])
        # Only 373 is connected with at least two synapses
        self.assertEqual(self.get_circles([235], min_pre=2, min_post=2), [373])
        # Without a minimum, all partners are returned
        self.assertEqual(self.get_circles([235], min_pre=0, min_post=0),
                [361, 373])
        # There is nothing upstream of 235
        self.assertEqual(self.get_circles([235], min_pre=1, min_post=-1), [])
        self.assertEqual(self.get_circles([2364], min_pre=1, min_post=-1),
                [2388, 2411])
        self.assertEqual(self.get_circles([2364], min_pre=-1, min_post=1), [])
        # Multiple start skeletons aren't part of the result
        self.assertEqual(self.get_circles([235, 2364], min_pre=1, min_post=1),
                [361, 373, 2388, 2411])
        # 361 is two circles away from 373
        self.assertEqual(self.get_circles([373], min_pre=1, min_post=1), [235])
        self.assertEqual(self.get_circles([373], n_circles=2, min_pre=1,
                min_post=1), [235, 361])

        # Explicit synaptic links are the default
        self.assertEqual(self.get_circles([235], min_pre=1, min_post=1,
                link_types=['synaptic-connector']), [361, 373])

    def test_circles_of_hell_allowed_connectors(self):
        self.fake_authentication()

        # Only 373 is connected through connector 421
        self.assertEqual(self.get_circles([235], min_pre=1, min_post=1,
                allowed_connector_ids=[421]), [373])
        self.assertEqual(self.get_circles([235], min_pre=1, min_post=1,
                allowed_connector_ids=[356, 421]), [361, 373])
        # With only one of the two connectors to 373, the minimum isn't reached
        self.assertEqual(self.get_circles([235], min_pre=2, min_post=2,
                allowed_connector_ids=[356]), [])

    def test_circles_of_hell_link_types(self):
        self.fake_authentication()
        self.add_gap_junction()

        # By default, only synaptic links are followed
        self.assertEqual(self.get_circles([361], min_pre=1, min_post=1), [235])
        self.assertEqual(self.get_circles([361], min_pre=1, min_post=1,
                link_types=['gapjunction-connector']), [2364])
        self.assertEqual(self.get_circles([2364], min_pre=1, min_post=1,
                link_types=['gapjunction-connector']), [361])
        self.assertEqual(self.get_circles([361], min_pre=1, min_post=1,
                link_types=['synaptic-connector', 'gapjunction-connector']),
                [235, 2364])

        # Undirected partners are both upstream and downstream partners
        self.assertEqual(self.get_circles([361], min_pre=-1, min_post=1,
                link_types=['synaptic-connector', 'gapjunction-connector']),
                [2364])
        self.assertEqual(self.get_circles([361], min_pre=1, min_post=-1,
                link_types=['synaptic-connector', 'gapjunction-connector']),
                [235, 2364])
        # The lower minimum applies to them
        self.assertEqual(self.get_circles([361], min_pre=1, min_post=2,
                link_types=['gapjunction-connector']), [2364])
        self.assertEqual(self.get_circles([361], min_pre=2, min_post=2,
                link_types=['gapjunction-connector']), [])

        # Each link type has to reach the minimum on its own: 235 and 373 are
        # connected by two synapses and, from here on, one gap junction.
        TreenodeConnector.objects.create(project_id=self.test_project_id,
                user_id=3, relation_id=1025, treenode_id=285,
                connector_id=2463, skeleton_id=235)
        TreenodeConnector.objects.create(project_id=self.test_project_id,
                user_id=3, relation_id=1025, treenode_id=377,
                connector_id=2463, skeleton_id=373)
        both = ['synaptic-connector', 'gapjunction-connector']
        self.assertEqual(self.get_circles([235], min_pre=2, min_post=2,
                link_types=both), [373])
        self.assertEqual(self.get_circles([235], min_pre=3, min_post=3,
                link_types=both), [])

        # Both link types are followed across circles
        self.assertEqual(self.get_circles([235], n_circles=2, min_pre=1,
                min_post=1, link_types=both), [361, 373, 2364])

        # Link types without links
        self.assertEqual(self.get_circles([361], min_pre=1, min_post=1,
                link_types=['desmosome-connector']), [])

    def test_circles_of_hell_errors(self):
        self.fake_authentication()

        response = self.get_circles([235], expected_status=400, min_pre=1,
                min_post=1, link_types=['unknown-connector'])
        self.assertIn('Unknown link type: unknown-connector', response['error'])

    def test_directed_path_skeletons(self):
        self.fake_authentication()

        # Sources and targets are always part of the result
        self.assertEqual(self.get_path_skeletons([235], [373], n_hops=2,
                min_synapses=1), [235, 373])
        # 2388 -> 2364 is the only way to 2364 without the gap junction
        self.assertEqual(self.get_path_skeletons([235], [2364], n_hops=2,
                min_synapses=1), [235, 2364])

        self.add_gap_junction()
        self.assertEqual(self.get_path_skeletons([235], [2364], n_hops=2,
                min_synapses=1), [235, 2364])
        # 235 -> 361 (synapse) - 2364 (gap junction)
        both = ['synaptic-connector', 'gapjunction-connector']
        self.assertEqual(self.get_path_skeletons([235], [2364], n_hops=2,
                min_synapses=1, link_types=both), [235, 361, 2364])
        self.assertEqual(self.get_path_skeletons([235], [2364], n_hops=2,
                min_synapses=2, link_types=both), [235, 2364])
        # Gap junctions are followed in both directions: 2388 -> 2364 - 361
        self.assertEqual(self.get_path_skeletons([2388], [361], n_hops=2,
                min_synapses=1, link_types=both), [361, 2364, 2388])

        response = self.get_path_skeletons([235], [2364], expected_status=400,
                n_hops=2, min_synapses=1, link_types=['unknown-connector'])
        self.assertIn('Unknown link type: unknown-connector', response['error'])
