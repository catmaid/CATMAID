# -*- coding: utf-8 -*-

import json

from datetime import datetime

from catmaid.control.annotation import _annotate_entities
from catmaid.control.annotation import create_annotation_query

from .common import CatmaidApiTestCase


class AnnotationsApiTests(CatmaidApiTestCase):
    def test_annotation_creation(self):
        self.fake_authentication()

        neuron_ids = [2365, 2381]
        # Expect entity 2365 and 2381 to be not annotated
        for nid in neuron_ids:
            aq = create_annotation_query(self.test_project_id, {'neuron_id': nid})
            self.assertEqual(len(aq), 0)

        # Annotate both with the same annotation
        _annotate_entities(self.test_project_id, neuron_ids,
                {'myannotation': {'user_id': self.test_user_id}})

        # Expect entity 2365 and 2381 to be annotated
        for nid in neuron_ids:
            aq = create_annotation_query(self.test_project_id, {'neuron_id': nid})
            self.assertEqual(len(aq), 1)
            self.assertEqual(aq[0].name, 'myannotation')

        # Annotate both with the pattern annotation
        _annotate_entities(self.test_project_id, neuron_ids,
                {'pattern {n9} test-{n}-annotation': { 'user_id': self.test_user_id}})

        # Expect entity 2365 and 2381 to be annotated
        aq = create_annotation_query(self.test_project_id, {'neuron_id': 2365}).order_by('name')
        self.assertEqual(len(aq), 2)
        self.assertEqual(aq[0].name, 'myannotation')
        self.assertEqual(aq[1].name, 'pattern 9 test-1-annotation')
        aq = create_annotation_query(self.test_project_id, {'neuron_id': 2381}).order_by('name')
        self.assertEqual(len(aq), 2)
        self.assertEqual(aq[0].name, 'myannotation')
        self.assertEqual(aq[1].name, 'pattern 10 test-2-annotation')


    def test_remove_annotations(self):
        self.fake_authentication()
        skeleton_id = 2364
        neuron_id = 2365

        # Annotate skeleton with three test annotations.
        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'annotations[0]': 'A',
             'annotations[1]': 'B',
             'annotations[2]': 'C',
             'skeleton_ids[0]': skeleton_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        annotations = {a['name']:a['id'] for a in parsed_response['annotations']}
        for a in ('A', 'B', 'C'):
            self.assertTrue(a in annotations)

        # Remove annotations A and C and expect B to still be there
        response = self.client.post(
            '/%d/annotations/remove' % (self.test_project_id,),
            {'entity_ids[0]': neuron_id,
             'annotation_ids[0]': annotations['A'],
             'annotation_ids[1]': annotations['C']})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        response = self.client.post(
            '/%d/annotations/forskeletons' % (self.test_project_id,),
            {'skeleton_ids[0]': skeleton_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        linked_annotations = parsed_response['skeletons'][str(skeleton_id)]
        linked_annotation_ids = [a['id'] for a in linked_annotations]
        self.assertFalse(annotations['A'] in linked_annotation_ids)
        self.assertFalse(annotations['C'] in linked_annotation_ids)


    def test_annotation_list(self):
        self.fake_authentication()

        skeleton_id = 235
        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'annotations[0]': 'A',
             'skeleton_ids[0]': skeleton_id})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        annotations = {a['name']:a['id'] for a in parsed_response['annotations']}
        for a in ('A',):
            self.assertTrue(a in annotations)
        annotation_id = parsed_response['new_annotations'][0]

        expected_response = [{'name': 'A', 'id': annotation_id, 'users': [{'id': 3, 'name': 'test2'}]}]

        response = self.client.get('/%d/annotations/' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertEqual(len(parsed_response['annotations']),
                         len(expected_response))
        for a in parsed_response['annotations']:
            self.assertTrue(a in expected_response)

        # Test that an used annotation also appears in the list.
        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'annotations[0]': 'B'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        annotations = {a['name']:a['id'] for a in parsed_response['annotations']}
        for a in ('B',):
            self.assertTrue(a in annotations)
        annotation_id = parsed_response['new_annotations'][0]

        expected_response.append({'name': 'B', 'id': annotation_id, 'users': []})

        response = self.client.get('/%d/annotations/' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertEqual(len(parsed_response['annotations']),
                         len(expected_response))
        for a in parsed_response['annotations']:
            self.assertTrue(a in expected_response)


    def test_simple_annotation_list_cache(self):
        self.fake_authentication()

        # Test cache use
        response = self.client.get('/%d/annotations/' % (self.test_project_id,),
                {
                    'simple': True,
                    'if_modified_since': datetime.now().isoformat(),
                })
        self.assertEqual(response.status_code, 304)


    def test_annotations_query_targets(self):
        self.fake_authentication()

        skeleton_id_a = 235
        skeleton_id_b = 2388
        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'annotations[0]': 'A',
             'skeleton_ids[0]': skeleton_id_a})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        annotations = {a['name']:a['id'] for a in parsed_response['annotations']}
        for a in ('A',):
            self.assertTrue(a in annotations)
        annotation_id_a = parsed_response['new_annotations'][0]

        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'annotations[0]': 'B',
             'skeleton_ids[0]': skeleton_id_b})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        annotations = {a['name']:a['id'] for a in parsed_response['annotations']}
        for a in ('B',):
            self.assertTrue(a in annotations)
        annotation_id_b = parsed_response['new_annotations'][0]

        # Test disjunctive behavior
        response = self.client.post(
            '/%d/annotations/query-targets' % (self.test_project_id,),
            {'annotated_with[0]': ','.join(map(str, [annotation_id_a, annotation_id_b]))})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_entities = [
            {"skeleton_ids": [235],
             "type": "neuron",
             "id": 233,
             "name": "branched neuron"},
            {"skeleton_ids": [2388],
             "type": "neuron",
             "id": 2389,
             "name": "neuron 2389"}]
        self.assertEqual(parsed_response['totalRecords'], 2)
        self.assertCountEqual(parsed_response['entities'], expected_entities)

        # Test conjunctive behavior
        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'annotations[0]': 'C',
             'skeleton_ids[0]': skeleton_id_a})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        annotations = {a['name']:a['id'] for a in parsed_response['annotations']}
        for a in ('C',):
            self.assertTrue(a in annotations)
        annotation_id_c = parsed_response['new_annotations'][0]

        response = self.client.post(
            '/%d/annotations/query-targets' % (self.test_project_id,),
            {'annotated_with[0]': ','.join(map(str, [annotation_id_a, annotation_id_b])),
             'annotated_with[1]': str(annotation_id_c)})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_entities = sorted([
            {"skeleton_ids": [235],
             "type": "neuron",
             "id": 233,
             "name": "branched neuron"}])
        self.assertEqual(parsed_response['totalRecords'], 1)
        self.assertCountEqual(parsed_response['entities'], expected_entities)

        # Test meta-annotation querying
        response = self.client.post(
            '/%d/annotations/add' % (self.test_project_id,),
            {'meta_annotations[0]': 'D',
             'annotations[0]': 'C'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        annotations = {a['name']:a['id'] for a in parsed_response['annotations']}
        for a in ('D',):
            self.assertTrue(a in annotations)
        annotation_id_d = parsed_response['new_annotations'][0]

        response = self.client.post(
            '/%d/annotations/query-targets' % (self.test_project_id,),
            {'annotated_with[0]': str(annotation_id_d),
             'sub_annotated_with[0]': str(annotation_id_d)})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_entities = [
            {"skeleton_ids": [235],
             "type": "neuron",
             "id": 233,
             "name": "branched neuron"},
            {"type": "annotation",
             "id": annotation_id_c,
             "name": "C"}
        ]
        self.assertEqual(parsed_response['totalRecords'], 2)
        self.assertCountEqual(parsed_response['entities'], expected_entities)

        # Test that an empty request returns everything.
        response = self.client.post(
            '/%d/annotations/query-targets' % (self.test_project_id,),
            {})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(parsed_response['totalRecords'], 17)

        # Test that searching by name without any annotation still works.
        response = self.client.post(
            '/%d/annotations/query-targets' % (self.test_project_id,),
            {'name': 'downstream-A'})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_entities = [
            {'skeleton_ids': [373],
            'type': 'neuron',
            'id': 374,
            'name': 'downstream-A'}
        ]
        self.assertEqual(parsed_response['totalRecords'], 1)
        self.assertCountEqual(parsed_response['entities'], expected_entities)
