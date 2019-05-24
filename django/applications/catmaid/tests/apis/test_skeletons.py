# -*- coding: utf-8 -*-

from io import StringIO
import json
import platform
import re
from typing import Any, Dict, List
from unittest import skipIf

from django.shortcuts import get_object_or_404
from guardian.shortcuts import assign_perm

from catmaid.models import ClassInstance, ClassInstanceClassInstance
from catmaid.models import Log, Review, Treenode, TreenodeConnector
from catmaid.models import ReviewerWhitelist

from .common import CatmaidApiTestCase

# Some skeleton back-end functionality is not available if PyPy is used. This
# variable is used to skip the respective tests (which otherwise would fail).
run_with_pypy = platform.python_implementation() == 'PyPy'


class SkeletonsApiTests(CatmaidApiTestCase):
    def compare_swc_data(self, s1, s2):
        def swc_string_to_sorted_matrix(s):
            m = [re.split("\s+", x) for x in s.splitlines() if not re.search('^\s*(#|$)', x)]
            return sorted(m, key=lambda x: x[0])

        m1 = swc_string_to_sorted_matrix(s1)
        m2 = swc_string_to_sorted_matrix(s2)
        self.assertEqual(len(m1), len(m2))

        fields = ['id', 'type', 'x', 'y', 'z', 'radius', 'parent']
        d = dict((x, i) for (i, x) in enumerate(fields))

        for i, e1 in enumerate(m1):
            e2 = m2[i]
            for f in ('id', 'parent', 'type'):
                self.assertEqual(e1[d[f]], e2[d[f]])
            for f in ('x', 'y', 'z', 'radius'):
                self.assertAlmostEqual(float(e1[d[f]]),
                                  float(e2[d[f]]))


    def test_skeleton_root(self):
        self.fake_authentication()
        response = self.client.get('/%d/skeletons/%d/root' % (self.test_project_id, 235))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response['root_id'], 237)
        self.assertAlmostEqual(parsed_response['x'], 1065)
        self.assertAlmostEqual(parsed_response['y'], 3035)
        self.assertAlmostEqual(parsed_response['z'], 0)


    def test_import_skeleton(self):
        self.fake_authentication()

        orig_skeleton_id = 235
        response = self.client.get('/%d/skeleton/%d/swc' % (self.test_project_id, orig_skeleton_id))
        self.assertEqual(response.status_code, 200)
        orig_swc_string = response.content.decode('utf-8')

        # Try inserting without permission and expect fail
        response = self.client.post('/%d/skeletons/import' % (self.test_project_id,),
                                    {'file.swc': ''})
        self.assertTrue("PermissionError" in response.content.decode('utf-8'))

        # Add permission and expect success
        swc_file = StringIO(orig_swc_string)
        assign_perm('can_import', self.test_user, self.test_project)
        response = self.client.post('/%d/skeletons/import' % (self.test_project_id,),
                {'file.swc': swc_file, 'name': 'test'})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        new_skeleton_id = parsed_response['skeleton_id']
        id_map = parsed_response['node_id_map']

        skeleton = ClassInstance.objects.get(id=new_skeleton_id)
        model_rel = ClassInstanceClassInstance.objects.get(class_instance_a=skeleton,
                relation__relation_name='model_of')
        neuron = model_rel.class_instance_b
        self.assertEqual(neuron.id, parsed_response['neuron_id'])
        self.assertEqual('test', neuron.name)

        for tn in Treenode.objects.filter(skeleton_id=orig_skeleton_id):
            new_tn = Treenode.objects.get(id=id_map[str(tn.id)])
            self.assertEqual(new_skeleton_id, new_tn.skeleton_id)
            if tn.parent_id:
                self.assertEqual(id_map[str(tn.parent_id)], new_tn.parent_id)
            self.assertEqual(tn.location_x, new_tn.location_x)
            self.assertEqual(tn.location_y, new_tn.location_y)
            self.assertEqual(tn.location_z, new_tn.location_z)
            self.assertEqual(max(tn.radius, 0), max(new_tn.radius, 0))


        # Remember current edit time for later
        last_neuron_id = neuron.id
        last_skeleton_id = skeleton.id
        last_neuron_edit_time = neuron.edition_time
        last_skeleton_edit_time = skeleton.edition_time


        # Test replacing the imported neuron without forcing an update and
        # auto_id disabled.
        swc_file2 = StringIO(orig_swc_string)
        response = self.client.post('/%d/skeletons/import' % (self.test_project_id,),
                {'file.swc': swc_file2, 'name': 'test2', 'neuron_id':
                    neuron.id, 'auto_id': False})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                "error": "The passed in neuron ID is already in use and neither of the parameters force or auto_id are set to true."}
        for k,v in expected_result.items():
            self.assertTrue(k in parsed_response)
            self.assertEqual(parsed_response[k], v)


        # Test replacing the imported neuron without forcing an update and
        # auto_id enabled (default).
        swc_file2 = StringIO(orig_swc_string)
        response = self.client.post('/%d/skeletons/import' % (self.test_project_id,),
                {'file.swc': swc_file2, 'name': 'test2', 'neuron_id':
                    neuron.id})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        # Make sure there is still only one skeleton
        neuron.refresh_from_db()
        linked_skeletons = ClassInstanceClassInstance.objects.filter(
                class_instance_b_id=neuron.id,
                relation__relation_name='model_of',
                class_instance_a__class_column__class_name='skeleton')
        self.assertEqual(len(linked_skeletons), 1)
        self.assertEqual(neuron.name, 'test')
        self.assertEqual(neuron.id, last_neuron_id)
        self.assertEqual(neuron.edition_time, last_neuron_edit_time)
        self.assertNotEqual(neuron.id, parsed_response['neuron_id'])


        # Test replacing the imported neuron with forcing an update
        swc_file2 = StringIO(orig_swc_string)
        response = self.client.post('/%d/skeletons/import' % (self.test_project_id,),
                {'file.swc': swc_file2, 'name': 'test2', 'neuron_id': neuron.id,
                    'force': True})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        # Make sure there is still only one skeleton
        neuron.refresh_from_db()
        replaced_skeletons = ClassInstanceClassInstance.objects.filter(
                class_instance_b_id=neuron.id,
                relation__relation_name='model_of',
                class_instance_a__class_column__class_name='skeleton')
        self.assertEqual(len(replaced_skeletons), 1)
        self.assertEqual(neuron.id, parsed_response['neuron_id'])
        self.assertEqual(neuron.name, 'test2')
        self.assertEqual(neuron.id, last_neuron_id)
        self.assertNotEqual(neuron.edition_time, last_neuron_edit_time)


        # Make sure we work with most recent skeleton data
        skeleton = ClassInstance.objects.get(pk=parsed_response['skeleton_id'])

        # Test replacing the imported skeleton without forcing an update and
        # auto_id disabled.
        swc_file2 = StringIO(orig_swc_string)
        response = self.client.post('/%d/skeletons/import' % (self.test_project_id,),
                {'file.swc': swc_file2, 'name': 'test2', 'skeleton_id':
                    skeleton.id, 'auto_id': False})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                "error": "The passed in skeleton ID is already in use and neither of the parameters force or auto_id are set to true."}
        for k,v in expected_result.items():
            self.assertTrue(k in parsed_response)
            self.assertEqual(parsed_response[k], v)


        # Test replacing the imported skeleton without forcing an update and
        # auto_id enabled (default).
        swc_file2 = StringIO(orig_swc_string)
        response = self.client.post('/%d/skeletons/import' % (self.test_project_id,),
                {'file.swc': swc_file2, 'name': 'test3', 'skeleton_id':
                    skeleton.id})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        last_skeleton_id = skeleton.id
        neuron = ClassInstance.objects.get(pk=parsed_response['neuron_id'])
        skeleton = ClassInstance.objects.get(pk=parsed_response['skeleton_id'])


        # Make sure there is still only one skeleton
        linked_neurons = ClassInstanceClassInstance.objects.filter(
                class_instance_a_id=skeleton.id,
                relation__relation_name='model_of',
                class_instance_b__class_column__class_name='neuron')
        self.assertEqual(len(linked_neurons), 1)
        self.assertEqual(neuron.name, 'test3')
        self.assertEqual(skeleton.name, 'test3')
        self.assertNotEqual(neuron.id, last_neuron_id)
        self.assertNotEqual(last_skeleton_id, skeleton.id) 


        # Test replacing the imported neuron with forcing an update
        swc_file2 = StringIO(orig_swc_string)
        response = self.client.post('/%d/skeletons/import' % (self.test_project_id,),
                {'file.swc': swc_file2, 'name': 'test2', 'skeleton_id': skeleton.id,
                    'force': True})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        last_skeleton_edit_time = skeleton.edition_time
        # Make sure there is still only one skeleton
        skeleton.refresh_from_db()

        replaced_neurons = ClassInstanceClassInstance.objects.filter(
                class_instance_a_id=skeleton.id,
                relation__relation_name='model_of',
                class_instance_b__class_column__class_name='neuron')
        self.assertEqual(len(replaced_neurons), 1)
        self.assertEqual(skeleton.id, parsed_response['skeleton_id'])
        self.assertEqual(skeleton.name, 'test2')
        self.assertNotEqual(skeleton.edition_time, last_skeleton_edit_time)


    def test_skeleton_contributor_statistics(self):
        self.fake_authentication()

        response = self.client.post(
            '/%d/skeleton/contributor_statistics_multiple' % (self.test_project_id,),
            {'skids[0]': 235})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_response = {
                "pre_contributors": {"3": 3},
                "multiuser_review_minutes": 0,
                "node_contributors": {"3": 28},
                "construction_minutes": 1,
                "n_nodes": 28,
                "min_review_minutes": 0,
                "n_pre": 3,
                "post_contributors": {},
                "n_post": 0,
                "review_contributors": {}}
        self.assertEqual(parsed_response, expected_response)

        response = self.client.post(
            '/%d/skeleton/%d/contributor_statistics' % (self.test_project_id, 235))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response, expected_response)

        response = self.client.post(
            '/%d/skeleton/contributor_statistics_multiple' % (self.test_project_id,),
            {'skids[0]': 235, 'skids[1]': 361})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_response = {
                "pre_contributors": {"3": 3},
                "multiuser_review_minutes": 0,
                "node_contributors": {"3": 37},
                "construction_minutes": 1,
                "n_nodes": 37,
                "min_review_minutes": 0,
                "n_pre": 3,
                "post_contributors": {"3": 1},
                "n_post": 1,
                "review_contributors": {}}
        self.assertEqual(parsed_response, expected_response)


    def test_skeleton_node_count(self):
        self.fake_authentication()

        skeleton_id = 235
        response = self.client.post(
            '/%d/skeleton/%s/node_count' % (self.test_project_id, skeleton_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_response = {
                "count": 28,
                "skeleton_id": skeleton_id}
        self.assertEqual(parsed_response, expected_response)

        response = self.client.post(
            '/%d/skeleton/node/%s/node_count' % (self.test_project_id, 253))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response, expected_response)


    def test_split_skeleton(self):
        self.fake_authentication()

        # Test simple split of 3-node skeleton at middle node.
        old_skeleton_id = 2388
        response = self.client.post(
            '/%d/skeleton/split' % (self.test_project_id,),
            {'treenode_id': 2394, 'upstream_annotation_map': '{}', 'downstream_annotation_map': '{}'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        new_skeleton_id = parsed_response['new_skeleton_id']

        self.assertTreenodeHasProperties(2392, None, old_skeleton_id)
        self.assertTreenodeHasProperties(2394, None, new_skeleton_id)
        self.assertTreenodeHasProperties(2396, 2394, new_skeleton_id)

        # Test error is returned when trying to split root node.
        response = self.client.post(
            '/%d/skeleton/split' % (self.test_project_id,),
            {'treenode_id': 237, 'upstream_annotation_map': '{}', 'downstream_annotation_map': '{}'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                "error": "Can't split at the root node: it doesn't have a parent."}
        self.assertEqual(expected_result, parsed_response)


    def test_split_skeleton_annotations(self):
        self.fake_authentication()

        # Annotate skeleton with three test annotations.
        old_skeleton_id = 2388
        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'annotations[0]': 'A',
             'annotations[1]': 'B',
             'annotations[2]': 'C',
             'skeleton_ids[0]': old_skeleton_id})
        self.assertEqual(response.status_code, 200)

        # Expect an error if some annotations are not assigned.
        response = self.client.post(
            '/%d/skeleton/split' % (self.test_project_id,),
            {'treenode_id': 2394,
             'upstream_annotation_map':   json.dumps({'A': self.test_user_id}),
             'downstream_annotation_map': json.dumps({'C': self.test_user_id})})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = "Annotation distribution is not valid for splitting. " \
                          "One part has to keep the whole set of annotations!"
        self.assertEqual(expected_result, parsed_response['error'])

        # Expect an error if all annotations are assigned, but neither part has
        # all.
        response = self.client.post(
            '/%d/skeleton/split' % (self.test_project_id,),
            {'treenode_id': 2394,
             'upstream_annotation_map':   json.dumps({'A': self.test_user_id, 'B': self.test_user_id}),
             'downstream_annotation_map': json.dumps({'C': self.test_user_id, 'B': self.test_user_id})})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = "Annotation distribution is not valid for splitting. " \
                          "One part has to keep the whole set of annotations!"
        self.assertEqual(expected_result, parsed_response['error'])

        # Test correct assignment of annotations in normal case, including
        # removal of annotation from skeleton retaining original ID.
        response = self.client.post(
            '/%d/skeleton/split' % (self.test_project_id,),
            {'treenode_id': 2394,
             'upstream_annotation_map':   json.dumps({'A': self.test_user_id, 'B': self.test_user_id}),
             'downstream_annotation_map': json.dumps({'A': self.test_user_id, 'B': self.test_user_id, 'C': self.test_user_id})})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        new_skeleton_id = parsed_response['new_skeleton_id']

        response = self.client.post(
            '/%d/skeleton/annotationlist' % (self.test_project_id,),
            {'skeleton_ids[0]': old_skeleton_id,
             'skeleton_ids[1]': new_skeleton_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        old_skeleton_annotations = set([parsed_response['annotations'][str(aid['id'])] for aid in parsed_response['skeletons'][str(old_skeleton_id)]['annotations']])
        new_skeleton_annotations = set([parsed_response['annotations'][str(aid['id'])] for aid in parsed_response['skeletons'][str(new_skeleton_id)]['annotations']])
        self.assertEqual(old_skeleton_annotations, set(['A', 'B']))
        self.assertEqual(new_skeleton_annotations, set(['A', 'B', 'C']))


    def test_skeleton_connectivity(self):
        self.fake_authentication()

        # Test a simple request like that from the connectivity widget.
        response = self.client.post(
            '/%d/skeletons/connectivity' % (self.test_project_id,),
            {'source_skeleton_ids[0]': 235,
             'source_skeleton_ids[1]': 373,
             'boolean_op': 'OR',
             'link_types': ['incoming', 'outgoing', 'gapjunction', 'attachment']})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            "outgoing_reviewers": [],
            "outgoing": {"361": {"skids": {"235": [0, 0, 0, 0, 1]}, "num_nodes": 9},
                         "373": {"skids": {"235": [0, 0, 0, 0, 2]}, "num_nodes": 5}},
            "incoming": {"235": {"skids": {"373": [0, 0, 0, 0, 2]}, "num_nodes": 28}},
            "incoming_reviewers": [],
            "gapjunction": {},
            "gapjunction_reviewers": [],
            "attachment": {},
            "attachment_reviewers": []}
        self.assertEqual(expected_result, parsed_response)

        # Test for conjunctive connectivity.
        response = self.client.post(
            '/%d/skeletons/connectivity' % (self.test_project_id,),
            {'source_skeleton_ids[0]': 235,
             'source_skeleton_ids[1]': 373,
             'boolean_op': 'AND',
             'link_types': ['incoming', 'outgoing', 'gapjunction', 'attachment']})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            "outgoing_reviewers": [],
            "outgoing": {},
            "incoming": {},
            "incoming_reviewers": [],
            "gapjunction": {},
            "gapjunction_reviewers": [],
            "attachment": {},
            "attachment_reviewers": []}
        self.assertEqual(expected_result, parsed_response)


    def test_skeleton_open_leaves(self):
        skeleton_id = 235

        self.fake_authentication()
        url = '/%d/skeletons/%d/open-leaves' % (self.test_project_id, skeleton_id,)

        # Return untagged root
        response = self.client.post(url, {'treenode_id': 243})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        distsort = lambda end: end[2]
        parsed_response.sort(key=distsort)
        expected_result = \
                [[237, [1065.0, 3035.0, 0.0],  4, u'2011-09-27T07:49:15.802Z'],
                 [261, [2820.0, 1345.0, 0.0], 10, u'2011-09-27T07:49:25.549Z'],
                 [277, [6090.0, 1550.0, 0.0], 13, u'2011-09-27T07:49:33.770Z'],
                 [417, [4990.0, 4200.0, 0.0], 16, u'2011-10-07T07:02:15.176Z']]
        self.assertEqual(parsed_response, expected_result)

        # Tag soma and try again
        response = self.client.post(
                '/%d/label/treenode/%d/update' % (self.test_project_id, 237),
                {'tags': 'soma', 'delete_existing': 'false'})
        self.assertEqual(response.status_code, 200)
        response = self.client.post(url, {'treenode_id': 243})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        parsed_response.sort(key=distsort)
        expected_result.pop(0)
        self.assertEqual(parsed_response, expected_result)

        # Tag branch and try again, should be shortest path (277) not nearest (417)
        # Also check tag case insensitivity.
        response = self.client.post(
                '/%d/label/treenode/%d/update' % (self.test_project_id, 261),
                {'tags': 'End', 'delete_existing': 'false'})
        self.assertEqual(response.status_code, 200)
        response = self.client.post(url, {'treenode_id': 243})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        parsed_response.sort(key=distsort)
        expected_result.pop(0)
        self.assertEqual(parsed_response, expected_result)

        # Check that an arbitrary tag containing 'end' is still considered open.
        response = self.client.post(
                '/%d/label/treenode/%d/update' % (self.test_project_id, 277),
                {'tags': 'mitochondria ends', 'delete_existing': 'false'})
        self.assertEqual(response.status_code, 200)
        response = self.client.post(url, {'treenode_id': 243})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        parsed_response.sort(key=distsort)
        self.assertEqual(parsed_response, expected_result)


    def test_skeleton_find_labels(self):
        self.fake_authentication()

        # Create labels.
        treenode_id = 387
        response = self.client.post(
                '/%d/label/treenode/%d/update' % (self.test_project_id, treenode_id),
                {'tags': 'testlabel'})
        self.assertEqual(response.status_code, 200)
        treenode_id = 393
        response = self.client.post(
                '/%d/label/treenode/%d/update' % (self.test_project_id, treenode_id),
                {'tags': 'Testlabel'})
        self.assertEqual(response.status_code, 200)
        # Label in other skeleton than should be ignored.
        treenode_id = 403
        response = self.client.post(
                '/%d/label/treenode/%d/update' % (self.test_project_id, treenode_id),
                {'tags': 'Testlabel'})
        self.assertEqual(response.status_code, 200)

        skeleton_id = 361
        treenode_id = 367
        response = self.client.post(
                '/%d/skeletons/%d/find-labels' % (self.test_project_id, skeleton_id),
                {'treenode_id': treenode_id,
                 'label_regex': '[Tt]estlabel'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [[393, [6910.0, 990.0, 0.0], 3, ["Testlabel"]],
                           [387, [9030.0, 1480.0, 0.0], 4, ["testlabel"]]]
        self.assertEqual(expected_result, parsed_response)


    def test_skeleton_within_spatial_distance(self):
        self.fake_authentication()

        treenode_id = 2419
        response = self.client.post(
                '/%d/skeletons/within-spatial-distance' % (self.test_project_id,),
                {'treenode_id': treenode_id, 'distance': 2000, 'size_mode': 0})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [2468, 2388, 235, 2411, 2364]
        self.assertCountEqual(expected_result, parsed_response['skeletons'])

        response = self.client.post(
                '/%d/skeletons/within-spatial-distance' % (self.test_project_id,),
                {'treenode_id': treenode_id, 'distance': 2000, 'size_mode': 1})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [2462, 2433, 373]
        self.assertCountEqual(expected_result, parsed_response['skeletons'])


    def test_skeleton_permissions(self):
        skeleton_id = 235

        self.fake_authentication()
        response = self.client.post(
            '/%d/skeleton/%d/permissions' % (self.test_project_id, skeleton_id,))
        expected_result = {'can_edit': True}
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response, expected_result)

        self.fake_authentication('test1', 'test', True)
        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'annotations[0]': 'locked', 'skeleton_ids[0]': skeleton_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        lock_annotation_id = parsed_response['annotations'][0]['id']
        skeleton_entity_id = parsed_response['annotations'][0]['entities'][0]

        self.fake_authentication()
        response = self.client.post(
            '/%d/skeleton/%d/permissions' % (self.test_project_id, skeleton_id,))
        expected_result = {'can_edit': True} # test2 has permissions for test1
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response, expected_result)

        self.fake_authentication('test1', 'test', True)
        response = self.client.post(
            '/%d/annotations/%d/remove' % (self.test_project_id, lock_annotation_id,),
            {'entity_ids[0]': skeleton_entity_id})
        self.assertEqual(response.status_code, 200)

        self.fake_authentication('test0', 'test', True)
        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'annotations[0]': 'locked', 'skeleton_ids[0]': skeleton_id})
        self.assertEqual(response.status_code, 200)

        self.fake_authentication()
        response = self.client.post(
            '/%d/skeleton/%d/permissions' % (self.test_project_id, skeleton_id,))
        expected_result = {'can_edit': False} # test2 does not have permission for test0
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response, expected_result)


    def test_skeleton_statistics(self):
        self.fake_authentication()

        skeleton_id = 235
        response = self.client.post(
                '/%d/skeleton/%s/statistics' % (self.test_project_id, skeleton_id,),)
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                'node_count': 28,
                'input_count': 0,
                'output_count': 2,
                'presynaptic_sites': 3,
                'postsynaptic_sites': 0,
                'cable_length': 11243,
                'measure_construction_time': '0 minutes 20 seconds',
                'percentage_reviewed': '0.00'}
        self.assertEqual(expected_result, parsed_response)


    def test_skeleton_ancestry(self):
        skeleton_id = 361

        self.fake_authentication()
        response = self.client.post(
                '/%d/skeleton/ancestry' % self.test_project_id,
                {'skeleton_id': skeleton_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [
                {"name":"downstream-B", "id":362, "class":"neuron"},
                {"name":"Isolated synaptic terminals", "id":364, "class":"group"},
                {"name":"neuropile", "id":2323, "class":"root"}]
        self.assertEqual(expected_result, parsed_response)


    def test_skeleton_ancestry_2(self):
        skeleton_id = 2364

        self.fake_authentication()
        response = self.client.post(
                '/%d/skeleton/ancestry' % self.test_project_id,
                {'skeleton_id': skeleton_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [
                {"name":"neuron 2365", "id":2365, "class":"neuron"},
                {"name":"Fragments", "id":4, "class":"group"},
                {"name":"neuropile", "id":2323, "class":"root"}]
        self.assertEqual(expected_result, parsed_response)


    def test_skeleton_connectivity_matrix(self):
        self.fake_authentication()

        skeleton_ids = [235, 361, 373, 2364, 2388, 2411]
        params = {}
        for i, k in enumerate(skeleton_ids):
            params['rows[%d]' % i] = k
            params['columns[%d]' % i] = k
        response = self.client.post(
                '/%d/skeleton/connectivity_matrix' % (self.test_project_id,),
                params)
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                '235': {'361': 1, '373': 2},
                '2388': {'2364': 1},
                '2411': {'2364': 1}
        }
        self.assertEqual(expected_result, parsed_response)


    def test_skeleton_connectivity_matrix_with_locations(self):
        self.fake_authentication()

        skeleton_ids = [235, 361, 373, 2364, 2388, 2411]
        params = {
            'with_locations': True
        } # type: Dict[str, Any]
        for i, k in enumerate(skeleton_ids):
            params['rows[%d]' % i] = k
            params['columns[%d]' % i] = k
        response = self.client.post(
                '/%d/skeleton/connectivity_matrix' % (self.test_project_id,),
                params)
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            "235": {
                "373": {
                    "count": 2,
                    "locations": {
                        "356": {
                            "pos": [6730.0, 2700.0, 0.0],
                            "count": 1
                        },
                        "421": {
                            "pos": [6260.0, 3990.0, 0.0],
                            "count": 1
                        }
                    }
                },
                "361": {
                    "count": 1,
                    "locations": {
                        "356": {
                            "pos": [6730.0, 2700.0, 0.0],
                            "count": 1
                        }
                    }
                }
            },
            "2388": {
                "2364": {
                    "count": 1,
                    "locations": {
                        "2400": {
                            "pos": [3400.0, 5620.0, 0.0],
                            "count": 1
                        }
                    }
                }
            },
            "2411": {
                "2364": {
                    "count": 1,
                    "locations": {
                        "2400": {
                            "pos": [3400.0, 5620.0, 0.0],
                            "count": 1
                        }
                    }
                }
            }
        }


        self.assertEqual(expected_result, parsed_response)


    def test_skeleton_list(self):
        self.fake_authentication()

        # Query all skeletons
        url = '/%d/skeletons/' % self.test_project_id
        response = self.client.get(url)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = frozenset([2388, 235, 373, 2411, 1, 361, 2364, 2451,
                                     2440, 2433, 2462, 2468])
        self.assertEqual(expected_result, frozenset(parsed_response))
        # Also check response length to be sure there were no duplicates.
        self.assertEqual(len(expected_result), len(parsed_response))

        # Query skeletons of user 2
        response = self.client.get(url, {'created_by': 2})
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [2364] # type: ignore # mypy doesn't like this variable reuse with different types
        self.assertEqual(expected_result, parsed_response)

        # Query skeletons of user 2 on a date where no neuron was created
        response = self.client.get(url, {'created_by': 2, 'to': '19990505'})
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [] # type: ignore
        self.assertEqual(expected_result, parsed_response)

        # Query skeletons of user 3 on a date where neurons where created
        response = self.client.get(url, {'created_by': 3, 'from': '20111209', 'to': '20111210'})
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = frozenset([2411, 2388])
        self.assertEqual(expected_result, frozenset(parsed_response))
        # Also check response length to be sure there were no duplicates.
        self.assertEqual(len(expected_result), len(parsed_response))

    @skipIf(run_with_pypy, "Synapse clustering test disabled in PyPy")
    def test_skeleton_graph(self):
        """This tests compartment graph features, among them synapse clustering.
        This is not supported with PyPy, which is why this test is skipped if
        PyPy is in use.
        """
        self.fake_authentication()

        skeleton_ids = [235, 361, 373]
        # Basic graph
        response = self.client.post(
            '/%d/skeletons/confidence-compartment-subgraph' % self.test_project_id,
            {'skeleton_ids[0]': skeleton_ids[0],
             'skeleton_ids[1]': skeleton_ids[1],
             'skeleton_ids[2]': skeleton_ids[2]})
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result_edges = [
                [235, 361, [0, 0, 0, 0, 1]],
                [235, 373, [0, 0, 0, 0, 2]]]
        # Since order is not important, check length and matches separately.
        self.assertEqual(len(expected_result_edges), len(parsed_response['edges']))
        for row in expected_result_edges:
            self.assertTrue(row in parsed_response['edges'])

        # Confidence split
        # Change confidence that affects 1 edge from 235 to 373
        response = self.client.post('/%d/treenodes/289/confidence' % self.test_project_id,
            {'new_confidence': 3})
        self.assertEqual(response.status_code, 200)
        # Add confidence criteria, but not one that should affect the graph.
        response = self.client.post(
            '/%d/skeletons/confidence-compartment-subgraph' % self.test_project_id,
            {'skeleton_ids[0]': skeleton_ids[0],
             'skeleton_ids[1]': skeleton_ids[1],
             'skeleton_ids[2]': skeleton_ids[2],
             'confidence_threshold': 2})
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result_nodes = frozenset(['235', '361', '373'])
        expected_result_edges = [
                ['235', '361', [0, 0, 0, 0, 1]],
                ['235', '373', [0, 0, 0, 0, 2]]]
        self.assertEqual(expected_result_nodes, frozenset(parsed_response['nodes']))
        # Since order is not important, check length and matches separately.
        self.assertEqual(len(expected_result_edges), len(parsed_response['edges']))
        for row in expected_result_edges:
            self.assertTrue(row in parsed_response['edges'])

        # Use confidence criteria that should split edges from 235 to 373.
        response = self.client.post(
            '/%d/skeletons/confidence-compartment-subgraph' % self.test_project_id,
            {'skeleton_ids[0]': skeleton_ids[0],
             'skeleton_ids[1]': skeleton_ids[1],
             'skeleton_ids[2]': skeleton_ids[2],
             'confidence_threshold': 4})
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result_nodes = frozenset(['235', '361', '373'])
        expected_result_edges = [
                ['235', '373', [0, 0, 0, 0, 2]],
                ['235', '361', [0, 0, 0, 0, 1]]]

        self.assertEqual(expected_result_nodes, frozenset(parsed_response['nodes']))
        # Since order is not important, check length and matches separately.
        self.assertEqual(len(expected_result_edges), len(parsed_response['edges']))
        for row in expected_result_edges:
            self.assertTrue(row in parsed_response['edges'])

        # Dual split
        # Again split with confidence, but also cluster the split synapses
        # together with bandwidth.
        response = self.client.post(
            '/%d/skeletons/confidence-compartment-subgraph' % self.test_project_id,
            {'skeleton_ids[0]': skeleton_ids[0],
             'skeleton_ids[1]': skeleton_ids[1],
             'skeleton_ids[2]': skeleton_ids[2],
             'expand[0]': skeleton_ids[0],
             'confidence_threshold': 4,
             'bandwidth': 2000})
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result_nodes = frozenset(['361', '373', '235_1', '235_2'])
        expected_result_edges = [
                ['235_1', '373', [0, 0, 0, 0, 2]],
                ['235_1', '361', [0, 0, 0, 0, 1]]]

        self.assertEqual(expected_result_nodes, frozenset(parsed_response['nodes']))
        # Since order is not important, check length and matches separately.
        self.assertEqual(len(expected_result_edges), len(parsed_response['edges']))
        for row in expected_result_edges:
            self.assertTrue(row in parsed_response['edges'])

        # Should not include edges involving skeletons not in the set
        # See https://github.com/catmaid/CATMAID/issues/1249
        response = self.client.post(
            '/%d/skeletons/confidence-compartment-subgraph' % self.test_project_id,
            {'skeleton_ids[0]': skeleton_ids[0],
             'skeleton_ids[1]': skeleton_ids[1]})
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result_edges = [
                [235, 361, [0, 0, 0, 0, 1]]]
        # Since order is not important, check length and matches separately.
        self.assertEqual(len(expected_result_edges), len(parsed_response['edges']))
        for row in expected_result_edges:
            self.assertTrue(row in parsed_response['edges'])
        # ...also with confidence splitting...
        response = self.client.post(
            '/%d/skeletons/confidence-compartment-subgraph' % self.test_project_id,
            {'skeleton_ids[0]': skeleton_ids[0],
             'skeleton_ids[1]': skeleton_ids[2],
             'confidence_threshold': 4})
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result_edges = [
                ['235', '373', [0, 0, 0, 0, 2]]]
        # Since order is not important, check length and matches separately.
        self.assertEqual(len(expected_result_edges), len(parsed_response['edges']))
        for row in expected_result_edges:
            self.assertTrue(row in parsed_response['edges'])


    def test_reroot_and_join_skeletons(self):
        self.fake_authentication()

        new_root = 2394
        link_to = 2394 # Skeleton ID: 2388
        link_from = 2415 # Skeleton ID: 2411

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()
        new_skeleton_id = get_object_or_404(Treenode, id=link_from).skeleton_id

        response = self.client.post(
                '/%d/skeleton/reroot' % self.test_project_id,
                {'treenode_id': new_root})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                'newroot': 2394,
                'skeleton_id': 2388} # type: Dict[str, Any]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.post(
                '/%d/skeleton/join' % self.test_project_id, {
                    'from_id': link_from,
                    'to_id': link_to,
                    'annotation_set': '{}'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                'message': 'success',
                'fromid': link_from,
                'result_skeleton_id': 2411,
                'deleted_skeleton_id': 2388,
                'toid': link_to}
        self.assertEqual(expected_result, parsed_response)

        self.assertEqual(2 + log_count, count_logs())

        self.assertTreenodeHasProperties(2396, 2394, new_skeleton_id)
        self.assertTreenodeHasProperties(2392, 2394, new_skeleton_id)
        self.assertTreenodeHasProperties(2394, 2415, new_skeleton_id)

        self.assertEqual(0, ClassInstance.objects.filter(id=2388).count())
        self.assertEqual(0, ClassInstanceClassInstance.objects.filter(id=2390).count())

        self.assertEqual(new_skeleton_id, get_object_or_404(TreenodeConnector, id=2405).skeleton_id)


    def test_skeleton_connectors_by_partner(self):
        self.fake_authentication()

        response = self.client.post(
                '/%d/skeleton/connectors-by-partner' % self.test_project_id,
                {'skids[0]': 235, 'skids[1]': 373})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        [[[c.sort() for c in p.values()] for p in t.values()] for t in parsed_response.values()]
        expected_result = {
            '235': {
                'presynaptic_to': {
                    '373': [356, 421],
                    '361': [356]
                }
            },
            '373': {
                'postsynaptic_to': {
                    '235': [356, 421]
                }
            }
        }
        self.assertEqual(expected_result, parsed_response)


    def test_export_skeleton_reviews(self):
        self.fake_authentication()

        skeleton_id = 235

        # No reviews
        url = '/%d/skeleton/%d/reviewed-nodes' % (self.test_project_id, skeleton_id)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {} # type: Dict[str, Any]
        self.assertEqual(expected_result, parsed_response)

        review_time = "2014-03-17T18:14:34.851Z"
        Review.objects.create(project_id=self.test_project_id, reviewer_id=3,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=253)
        Review.objects.create(project_id=self.test_project_id, reviewer_id=2,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=253)
        Review.objects.create(project_id=self.test_project_id, reviewer_id=3,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=263)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        expected_result = {
                '253': [[3, review_time], [2, review_time]],
                '263': [[3, review_time]]}
        self.assertJSONEqual(response.content.decode('utf-8'), expected_result)


    def test_reroot_skeleton(self):
        self.fake_authentication()

        new_root = 407

        count_logs = lambda: Log.objects.all().count()
        log_count = count_logs()

        response = self.client.post(
                '/%d/skeleton/reroot' % self.test_project_id,
                {'treenode_id': new_root})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
                'newroot': 407,
                'skeleton_id': 373}
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(1 + log_count, count_logs())

        def assertHasParent(treenode_id, parent_id):
            treenode = get_object_or_404(Treenode, id=treenode_id)
            self.assertEqual(parent_id, treenode.parent_id)

        assertHasParent(405, 407)
        assertHasParent(377, 405)
        assertHasParent(407, None)


    def test_review_status(self):
        self.fake_authentication()

        skeleton_id = 2388

        # No reviews, single segment
        url = '/%d/skeletons/review-status' % (self.test_project_id)
        response = self.client.post(url, {'skeleton_ids[0]': skeleton_id})
        self.assertEqual(response.status_code, 200)
        expected_result = {'2388': [3, 0]}
        self.assertJSONEqual(response.content.decode('utf-8'), expected_result)

        # Add reviews
        review_time = "2014-03-17T00:00:00Z"
        Review.objects.create(project_id=self.test_project_id, reviewer_id=3,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=2396)
        Review.objects.create(project_id=self.test_project_id, reviewer_id=2,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=2396)
        Review.objects.create(project_id=self.test_project_id, reviewer_id=3,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=2394)
        response = self.client.post(url, {'skeleton_ids[0]': skeleton_id})
        self.assertEqual(response.status_code, 200)
        expected_result = {'2388': [3, 2]}
        self.assertJSONEqual(response.content.decode('utf-8'), expected_result)

        # Use empty whitelist
        response = self.client.post(url,
                {'skeleton_ids[0]': skeleton_id, 'whitelist': 'true'})
        self.assertEqual(response.status_code, 200)
        expected_result = {'2388': [3, 0]}
        self.assertJSONEqual(response.content.decode('utf-8'), expected_result)

        # Add a user to whitelist
        ReviewerWhitelist.objects.create(project_id=self.test_project_id,
                user_id=self.test_user_id, reviewer_id=2, accept_after=review_time)
        response = self.client.post(url,
                {'skeleton_ids[0]': skeleton_id, 'whitelist': 'true'})
        self.assertEqual(response.status_code, 200)
        expected_result = {'2388': [3, 1]}
        self.assertJSONEqual(response.content.decode('utf-8'), expected_result)


    def test_export_review_skeleton(self):
        self.fake_authentication()

        skeleton_id = 2388

        # No reviews, single segment
        url = '/%d/skeletons/%d/review' % (self.test_project_id, skeleton_id)
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200)
        expected_result = [{'status': '0.00', 'id': 0, 'nr_nodes': 3, 'sequence': [
                {'y': 6550.0, 'x': 3680.0, 'z': 0.0, 'rids': [], 'sup': [], 'user_id': 3, 'id': 2396},
                {'y': 6030.0, 'x': 3110.0, 'z': 0.0, 'rids': [], 'sup': [], 'user_id': 3, 'id': 2394},
                {'y': 6080.0, 'x': 2370.0, 'z': 0.0, 'rids': [], 'sup': [], 'user_id': 3, 'id': 2392}]}]
        self.assertJSONEqual(response.content.decode('utf-8'), expected_result)

        # Add reviews
        review_time = "2014-03-17T00:00:00Z"
        Review.objects.create(project_id=self.test_project_id, reviewer_id=3,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=2396)
        Review.objects.create(project_id=self.test_project_id, reviewer_id=2,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=2396)
        Review.objects.create(project_id=self.test_project_id, reviewer_id=3,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=2394)
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200)
        expected_result = [{'status': '66.67', 'id': 0, 'nr_nodes': 3, 'sequence': [
                {'y': 6550.0, 'x': 3680.0, 'z': 0.0, 'rids': [[3, review_time], [2, review_time]], 'sup': [], 'user_id': 3, 'id': 2396},
                {'y': 6030.0, 'x': 3110.0, 'z': 0.0, 'rids': [[3, review_time]], 'sup': [], 'user_id': 3, 'id': 2394},
                {'y': 6080.0, 'x': 2370.0, 'z': 0.0, 'rids': [], 'sup': [], 'user_id': 3, 'id': 2392}]}]
        self.assertJSONEqual(response.content.decode('utf-8'), expected_result)

        # Newer reviews of same nodes should duplicate reviewer ID
        # NOTE: this duplication does not happen in practice because
        # update_location_reviewer updates the timestamp of the existing
        # review. This is just to demonstrate what edge case behavior is.
        review_time = "2014-03-18T00:00:00Z"
        Review.objects.create(project_id=self.test_project_id, reviewer_id=2,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=2396)
        Review.objects.create(project_id=self.test_project_id, reviewer_id=3,
            review_time=review_time, skeleton_id=skeleton_id, treenode_id=2394)
        response = self.client.post(url)
        expected_result[0]['sequence'][0]['rids'].append([2, review_time])
        expected_result[0]['sequence'][1]['rids'].append([3, review_time])
        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content.decode('utf-8'), expected_result)

        # Test subarbor support
        response = self.client.post(url, {'subarbor_node_id': 2394})
        self.assertEqual(response.status_code, 200)
        expected_result[0]['status'] = '100.00'
        expected_result[0]['nr_nodes'] = 2
        del expected_result[0]['sequence'][-1]
        self.assertJSONEqual(response.content.decode('utf-8'), expected_result)


    def test_swc_file(self):
        self.fake_authentication()
        url = '/%d/skeleton/235/swc' % (self.test_project_id,)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        swc_output_for_skeleton_235 = '''
237 0 1065 3035 0 0 -1
417 0 4990 4200 0 0 415
415 0 5810 3950 0 0 289
289 0 6210 3480 0 0 285
285 0 6100 2980 0 0 283
283 0 5985 2745 0 0 281
281 0 5675 2635 0 0 279
277 0 6090 1550 0 0 275
275 0 5800 1560 0 0 273
273 0 5265 1610 0 0 271
271 0 5090 1675 0 0 269
279 0 5530 2465 0 0 267
267 0 5400 2200 0 0 265
269 0 4820 1900 0 0 265
265 0 4570 2125 0 0 263
261 0 2820 1345 0 0 259
259 0 3445 1385 0 0 257
257 0 3825 1480 0 0 255
255 0 3850 1790 0 0 253
263 0 3915 2105 0 0 253
253 0 3685 2160 0 0 251
251 0 3380 2330 0 0 249
249 0 2815 2590 0 0 247
247 0 2610 2700 0 0 245
245 0 1970 2595 0 0 243
243 0 1780 2570 0 0 241
241 0 1340 2660 0 0 239
239 0 1135 2800 0 0 237
'''
        self.compare_swc_data(response.content.decode('utf-8'), swc_output_for_skeleton_235)


    def test_swc_file_linearized(self):
        self.fake_authentication()
        url = '/%d/skeleton/235/swc' % (self.test_project_id,)
        response = self.client.get(url, {'linearize_ids': 'true'})
        self.assertEqual(response.status_code, 200)

        swc_output_for_skeleton_235 = '''
1 0 1065 3035 0 0 -1
2 0 1135 2800 0 0 1
3 0 1340 2660 0 0 2
4 0 1780 2570 0 0 3
5 0 1970 2595 0 0 4
6 0 2610 2700 0 0 5
7 0 2815 2590 0 0 6
8 0 3380 2330 0 0 7
9 0 3685 2160 0 0 8
10 0 3850 1790 0 0 9
11 0 3915 2105 0 0 9
12 0 3825 1480 0 0 10
13 0 4570 2125 0 0 11
14 0 3445 1385 0 0 12
15 0 5400 2200 0 0 13
16 0 4820 1900 0 0 13
17 0 2820 1345 0 0 14
18 0 5530 2465 0 0 15
19 0 5090 1675 0 0 16
20 0 5675 2635 0 0 18
21 0 5265 1610 0 0 19
22 0 5985 2745 0 0 20
23 0 5800 1560 0 0 21
24 0 6100 2980 0 0 22
25 0 6090 1550 0 0 23
26 0 6210 3480 0 0 24
27 0 5810 3950 0 0 26
28 0 4990 4200 0 0 27
'''

        self.compare_swc_data(response.content.decode('utf-8'), swc_output_for_skeleton_235)


    def assert_skeletons_by_node_labels(self, label_ids, expected_response):
        self.fake_authentication()
        url = '/{}/skeletons/node-labels'.format(self.test_project_id)

        response = self.client.post(url, {'label_ids': label_ids})

        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(response.content.decode('utf-8'), expected_response)


    def test_skeletons_by_node_labels_0(self):
        self.assert_skeletons_by_node_labels([], [])


    def test_skeletons_by_node_labels_not_label_id(self):
        """given ID of a non-label class instance associated with the skeleton node, skeletons associated with that
        ID should not be returned
        """
        self.assert_skeletons_by_node_labels([235], [])


    def test_skeletons_by_node_labels_1(self):
        """label with id=2342 appears on a single skeleton, which has id=373
        """
        self.assert_skeletons_by_node_labels([2342], [[2342, [373]]])


    def test_skeletons_by_node_labels_1_nonexistent(self):
        """nonexistent label does not error
        """
        self.assert_skeletons_by_node_labels([999999999], [])


    def test_skeletons_by_node_labels_multiple(self):
        expected_result = [[351, [1, 235]], [2342, [373]]]
        self.assert_skeletons_by_node_labels([2342, 351], expected_result)

