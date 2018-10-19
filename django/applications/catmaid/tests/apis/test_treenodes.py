# -*- coding: utf-8 -*-

import json

from operator import itemgetter

from django.shortcuts import get_object_or_404

from catmaid.control.common import get_relation_to_id_map, get_class_to_id_map
from catmaid.models import ClassInstance, ClassInstanceClassInstance, Log
from catmaid.models import Treenode, TreenodeClassInstance, TreenodeConnector
from catmaid.models import User
from catmaid.state import make_nocheck_state

from .common import CatmaidApiTestCase


class TreenodesApiTests(CatmaidApiTestCase):
    def test_list_treenode_table_empty(self):
        self.fake_authentication()
        response = self.client.get('/%d/skeletons/%d/node-overview' % \
                                    (self.test_project_id, 0))
        self.assertEqual(response.status_code, 200)
        expected_result = [[], [], []]
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result, parsed_response)


    def test_fail_update_confidence(self):
        treenode_id = Treenode.objects.order_by("-id")[0].id + 1  # Inexistant
        self.fake_authentication()
        response = self.client.post(
                '/%d/treenodes/%d/confidence' % (self.test_project_id, treenode_id),
                {'new_confidence': '4'})
        self.assertEqual(response.status_code, 200)
        expected_result = 'No skeleton and neuron for treenode %s' % treenode_id
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result, parsed_response['error'])


    def test_update_confidence_of_treenode(self):
        treenode_id = 11
        self.fake_authentication()
        response = self.client.post(
                '/%d/treenodes/%d/confidence' % (self.test_project_id, treenode_id),
                {'new_confidence': '4', 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        treenode = Treenode.objects.filter(id=treenode_id).get()
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'message': 'success',
            'updated_partners': {
                '7': {
                    'edition_time': '2016-04-13T05:57:44.444Z',
                    'old_confidence': 5
                }
            }
        }
        self.assertIn('message', parsed_response)
        self.assertEqual(expected_result.get('message'), parsed_response.get('message'))
        self.assertIn('updated_partners', parsed_response)
        self.assertIn('7', parsed_response.get('updated_partners'))
        self.assertEqual(expected_result.get('updated_partners').get('7').get('old_confidence'),
                parsed_response.get('updated_partners').get('7').get('old_confidence'))
        self.assertEqual(4, treenode.confidence)

        response = self.client.post(
                '/%d/treenodes/%d/confidence' % (self.test_project_id, treenode_id),
                {'new_confidence': '5', 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        treenode = Treenode.objects.filter(id=treenode_id).get()
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'message': 'success',
            'updated_partners': {
                '7': {
                    'edition_time': '2016-04-13T05:57:44.444Z',
                    'old_confidence': 4
                }
            }
        }
        self.assertIn('message', parsed_response)
        self.assertEqual(expected_result.get('message'), parsed_response.get('message'))
        self.assertIn('updated_partners', parsed_response)
        self.assertIn('7', parsed_response.get('updated_partners'))
        self.assertEqual(expected_result.get('updated_partners').get('7').get('old_confidence'),
                parsed_response.get('updated_partners').get('7').get('old_confidence'))
        self.assertEqual(5, treenode.confidence)


    def test_update_confidence_of_treenode_connector(self):
        treenode_id = 285
        treenode_connector_id = 360
        self.fake_authentication()
        response = self.client.post(
                '/%d/treenodes/%d/confidence' % (self.test_project_id, treenode_id),
                {'new_confidence': '4', 'to_connector': 'true',
                 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        connector = TreenodeConnector.objects.filter(id=treenode_connector_id).get()
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'message': 'success',
            'updated_partners': {
                '356': {
                    'edition_time': '2016-04-13T05:57:44.444Z',
                    'old_confidence': 5
                }
            }
        }
        self.assertIn('message', parsed_response)
        self.assertEqual(expected_result.get('message'), parsed_response.get('message'))
        self.assertIn('updated_partners', parsed_response)
        self.assertIn('356', parsed_response.get('updated_partners'))
        self.assertEqual(expected_result.get('updated_partners').get('356').get('old_confidence'),
                parsed_response.get('updated_partners').get('356').get('old_confidence'))
        self.assertEqual(4, connector.confidence)

        response = self.client.post(
                '/%d/treenodes/%d/confidence' % (self.test_project_id, treenode_id),
                {'new_confidence': '5', 'to_connector': 'true', 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        connector = TreenodeConnector.objects.filter(id=treenode_connector_id).get()
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'message': 'success',
            'updated_partners': {
                '356': {
                    'edition_time': '2016-04-13T05:57:44.444Z',
                    'old_confidence': 4
                }
            }
        }
        self.assertIn('message', parsed_response)
        self.assertEqual(expected_result.get('message'), parsed_response.get('message'))
        self.assertIn('updated_partners', parsed_response)
        self.assertIn('356', parsed_response.get('updated_partners'))
        self.assertEqual(expected_result.get('updated_partners').get('356').get('old_confidence'),
                parsed_response.get('updated_partners').get('356').get('old_confidence'))
        self.assertEqual(5, connector.confidence)

    def test_create_treenode(self):
        self.fake_authentication()
        relation_map = get_relation_to_id_map(self.test_project_id)
        class_map = get_class_to_id_map(self.test_project_id)
        count_treenodes = lambda: Treenode.objects.all().count()
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_neurons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['neuron']).count()

        treenode_count = count_treenodes()
        skeleton_count = count_skeletons()
        neuron_count = count_neurons()

        response = self.client.post('/%d/treenode/create' % self.test_project_id, {
            'x': 5,
            'y': 10,
            'z': 15,
            'confidence': 5,
            'parent_id': -1,
            'radius': 2})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)

        self.assertEqual(treenode_count + 1, count_treenodes())
        self.assertEqual(skeleton_count + 1, count_skeletons())
        self.assertEqual(neuron_count + 1, count_neurons())

        treenode_skeleton_relation = TreenodeClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['element_of'],
                treenode=parsed_response['treenode_id'],
                class_instance=parsed_response['skeleton_id'])
        neuron_skeleton_relation = ClassInstanceClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['model_of'],
                class_instance_a=parsed_response['skeleton_id'])
        neuron_log = Log.objects.filter(
                project=self.test_project_id,
                operation_type='create_neuron')

        # FIXME: discussed in
        # https://github.com/catmaid/CATMAID/issues/754
        #self.assertEqual(1, treenode_skeleton_relation.count())
        self.assertEqual(1, neuron_skeleton_relation.count())
        # FIXME: This test doesn't work like expected
        #self.assertEqual(1, neuron_log.count())
        #neuron_log_location = neuron_log[0].location
        #self.assertEqual(5, neuron_log_location.x)
        #self.assertEqual(10, neuron_log_location.y)
        #self.assertEqual(15, neuron_log_location.z)

    def test_create_treenode2(self):
        self.fake_authentication()
        relation_map = get_relation_to_id_map(self.test_project_id)
        class_map = get_class_to_id_map(self.test_project_id)
        count_treenodes = lambda: Treenode.objects.all().count()
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_neurons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['neuron']).count()
        treenode_count = count_treenodes()
        skeleton_count = count_skeletons()
        neuron_count = count_neurons()

        response = self.client.post('/%d/treenode/create' % self.test_project_id, {
            'x': 5,
            'y': 10,
            'z': 15,
            'confidence': 5,
            'parent_id': -1,
            'radius': 2})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)

        self.assertEqual(treenode_count + 1, count_treenodes())
        self.assertEqual(skeleton_count + 1, count_skeletons())
        self.assertEqual(neuron_count + 1, count_neurons())

        treenode_skeleton_relation = TreenodeClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['element_of'],
                treenode=parsed_response['treenode_id'],
                class_instance=parsed_response['skeleton_id'])
        neuron_skeleton_relation = ClassInstanceClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['model_of'],
                class_instance_a=parsed_response['skeleton_id'])
        # FIXME: Log test doesn't work like this, because we don't have the
        # neuron ID available
        #neuron_log = Log.objects.filter(
        #        project=self.test_project_id,
        #        operation_type='create_neuron',
        #        freetext='Create neuron %s and skeleton %s' % (parsed_response['neuron_id'], parsed_response['skeleton_id']))

        root = ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['root'])[0]

        self.assertEqual(1, neuron_skeleton_relation.count())
        #FIXME: These tests don't work like expected anymore
        #self.assertEqual(1, neuron_log.count())
        #self.assertEqual(1, treenode_skeleton_relation.count())
        #neuron_log_location = neuron_log[0].location
        #self.assertEqual(5, neuron_log_location.x)
        #self.assertEqual(10, neuron_log_location.y)
        #self.assertEqual(15, neuron_log_location.z)

    def test_create_treenode_with_existing_neuron(self):
        self.fake_authentication()
        relation_map = get_relation_to_id_map(self.test_project_id)
        class_map = get_class_to_id_map(self.test_project_id)
        neuron_id = 2389
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_treenodes = lambda: Treenode.objects.all().count()

        treenode_count = count_treenodes()
        skeleton_count = count_skeletons()

        response = self.client.post('/%d/treenode/create' % self.test_project_id, {
            'x': 5,
            'y': 10,
            'z': 15,
            'confidence': 5,
            'parent_id': -1,
            'useneuron': neuron_id,
            'radius': 2})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)

        self.assertEqual(treenode_count + 1, count_treenodes())
        self.assertEqual(skeleton_count + 1, count_skeletons())

        treenode_skeleton_relation = TreenodeClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['element_of'],
                treenode=parsed_response['treenode_id'],
                class_instance=parsed_response['skeleton_id'])
        neuron_skeleton_relation = ClassInstanceClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['model_of'],
                class_instance_a=parsed_response['skeleton_id'],
                class_instance_b=neuron_id)

        # FIXME: treenode_skeleton_relation.count() should be 1, but we
        # currently don't store these relations.
        # See: https://github.com/catmaid/CATMAID/issues/754
        self.assertEqual(0, treenode_skeleton_relation.count())
        self.assertEqual(1, neuron_skeleton_relation.count())

    def test_create_treenode_with_nonexisting_parent_failure(self):
        self.fake_authentication()
        parent_id = 555555
        treenode_count = Treenode.objects.all().count()
        relation_count = TreenodeClassInstance.objects.all().count()
        response = self.client.post('/%d/treenode/create' % self.test_project_id, {
            'x': 5,
            'y': 10,
            'z': 15,
            'confidence': 5,
            'parent_id': parent_id,
            'radius': 2,
            'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {'error': 'Parent treenode %d does not exist' % parent_id}
        self.assertIn(expected_result['error'], parsed_response['error'])
        self.assertEqual(treenode_count, Treenode.objects.all().count())
        self.assertEqual(relation_count, TreenodeClassInstance.objects.all().count())


    def test_update_treenode_parent(self):
        self.fake_authentication()

        skeleton_id = 373
        treenode_id = 405
        new_parent_id = 403
        response = self.client.post(
                '/%d/treenodes/%d/parent' % (self.test_project_id, treenode_id),
                {'parent_id': new_parent_id, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        response = self.client.post(
                '/%d/%d/1/1/compact-skeleton' % (self.test_project_id, skeleton_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_response = [
                [[377, None, 3, 7620.0, 2890.0, 0.0, -1.0, 5],
                 [403, 377, 3, 7840.0, 2380.0, 0.0, -1.0, 5],
                 [405, 403, 3, 7390.0, 3510.0, 0.0, -1.0, 5],
                 [407, 405, 3, 7080.0, 3960.0, 0.0, -1.0, 5],
                 [409, 407, 3, 6630.0, 4330.0, 0.0, -1.0, 5]],
                [[377, 356, 1, 6730.0, 2700.0, 0.0],
                 [409, 421, 1, 6260.0, 3990.0, 0.0]],
                {"uncertain end": [403]}]
        self.assertCountEqual(parsed_response[0], expected_response[0])
        self.assertCountEqual(parsed_response[1], expected_response[1])
        self.assertEqual(parsed_response[2], expected_response[2])


    def test_delete_root_treenode_with_children_failure(self):
        self.fake_authentication()
        treenode_id = 367

        tn_count = Treenode.objects.all().count()
        child_count = Treenode.objects.filter(parent=treenode_id).count()
        response = self.client.post(
                '/%d/treenode/delete' % self.test_project_id,
                {'treenode_id': treenode_id, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = "Could not delete root node: You can't delete the " \
                          "root node when it has children."
        self.assertEqual(expected_result, parsed_response['error'])
        self.assertEqual(1, Treenode.objects.filter(id=treenode_id).count())
        self.assertEqual(tn_count, Treenode.objects.all().count())
        self.assertEqual(child_count, Treenode.objects.filter(parent=treenode_id).count())


    def test_insert_treenoded_on_edge(self):
        self.fake_authentication()
        class_map = get_class_to_id_map(self.test_project_id)
        count_treenodes = lambda: Treenode.objects.all().count()
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_neurons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['neuron']).count()

        treenode_count = count_treenodes()
        skeleton_count = count_skeletons()
        neuron_count = count_neurons()

        # Get two nodes and calculate point between them
        child_id = 2374
        parent_id = 2372
        child = Treenode.objects.get(pk=child_id)
        parent = Treenode.objects.get(pk=parent_id)

        new_node_x = 0.5 * (child.location_x + parent.location_x)
        new_node_y = 0.5 * (child.location_y + parent.location_y)
        new_node_z = 0.5 * (child.location_z + parent.location_z)

        response = self.client.post('/%d/treenode/insert' % self.test_project_id, {
            'x': new_node_x,
            'y': new_node_y,
            'z': new_node_z,
            'child_id': child_id,
            'parent_id': parent_id,
            'state': make_nocheck_state()})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)

        self.assertEqual(treenode_count + 1, count_treenodes())
        self.assertEqual(skeleton_count, count_skeletons())
        self.assertEqual(neuron_count, count_neurons())

        new_node_id = parsed_response['treenode_id']
        new_node = Treenode.objects.get(pk=new_node_id)
        child = Treenode.objects.get(pk=child_id)
        self.assertEqual(new_node.parent_id, parent_id)
        self.assertEqual(child.parent_id, new_node_id)
        self.assertEqual(new_node.user_id, self.test_user_id)
        self.assertEqual(new_node.skeleton_id, child.skeleton_id)
        self.assertEqual(new_node.location_x, new_node_x)
        self.assertEqual(new_node.location_y, new_node_y)
        self.assertEqual(new_node.location_z, new_node_z)


    def test_insert_treenoded_not_on_edge_with_permission(self):
        self.fake_authentication()
        class_map = get_class_to_id_map(self.test_project_id)
        count_treenodes = lambda: Treenode.objects.all().count()
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_neurons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['neuron']).count()

        treenode_count = count_treenodes()
        skeleton_count = count_skeletons()
        neuron_count = count_neurons()

        # Get two nodes and calculate point between them
        child_id = 2374
        parent_id = 2372
        child = Treenode.objects.get(pk=child_id)
        parent = Treenode.objects.get(pk=parent_id)

        new_node_x = 0.5 * (child.location_x + parent.location_x)
        new_node_y = 0.5 * (child.location_y + parent.location_y) + 10
        new_node_z = 0.5 * (child.location_z + parent.location_z)

        # Try to insert with a slight distorition in Y. This is allowed if the
        # user has permission to edit the neuron.
        response = self.client.post('/%d/treenode/insert' % self.test_project_id, {
            'x': new_node_x,
            'y': new_node_y,
            'z': new_node_z,
            'child_id': child_id,
            'parent_id': parent_id,
            'state': make_nocheck_state()})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertTrue('treenode_id' in parsed_response)
        self.assertTrue('skeleton_id' in parsed_response)

        self.assertEqual(treenode_count + 1, count_treenodes())
        self.assertEqual(skeleton_count, count_skeletons())
        self.assertEqual(neuron_count, count_neurons())

        new_node_id = parsed_response['treenode_id']
        new_node = Treenode.objects.get(pk=new_node_id)
        child = Treenode.objects.get(pk=child_id)
        self.assertEqual(new_node.parent_id, parent_id)
        self.assertEqual(child.parent_id, new_node_id)
        self.assertEqual(new_node.user_id, self.test_user_id)
        self.assertEqual(new_node.skeleton_id, child.skeleton_id)
        self.assertEqual(new_node.location_x, new_node_x)
        self.assertEqual(new_node.location_y, new_node_y)
        self.assertEqual(new_node.location_z, new_node_z)


    def test_insert_treenoded_not_on_edge_without_permission(self):
        self.fake_authentication(username='test0')
        class_map = get_class_to_id_map(self.test_project_id)
        count_treenodes = lambda: Treenode.objects.all().count()
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_neurons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['neuron']).count()

        treenode_count = count_treenodes()
        skeleton_count = count_skeletons()
        neuron_count = count_neurons()

        # Get two nodes and calculate point between them
        child_id = 2374
        parent_id = 2372
        child = Treenode.objects.get(pk=child_id)
        parent = Treenode.objects.get(pk=parent_id)

        # Set chld and parent to different creators and lock it
        owner = User.objects.get(username='admin')
        for n in (child, parent):
            n.creator = owner
            n.save()

        new_node_x = 0.5 * (child.location_x + parent.location_x)
        new_node_y = 0.5 * (child.location_y + parent.location_y) + 10
        new_node_z = 0.5 * (child.location_z + parent.location_z)

        # Try to insert with a slight distorition in Y. This should fail since
        # the new node would introduce a structural change to the skeleton.
        response = self.client.post('/%d/treenode/insert' % self.test_project_id, {
            'x': new_node_x,
            'y': new_node_y,
            'z': new_node_z,
            'child_id': child_id,
            'parent_id': parent_id})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertTrue('error' in parsed_response)

        self.assertEqual(treenode_count, count_treenodes())
        self.assertEqual(skeleton_count, count_skeletons())
        self.assertEqual(neuron_count, count_neurons())


    def test_insert_treenoded_no_child_parent(self):
        self.fake_authentication()
        class_map = get_class_to_id_map(self.test_project_id)
        count_treenodes = lambda: Treenode.objects.all().count()
        count_skeletons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['skeleton']).count()
        count_neurons = lambda: ClassInstance.objects.filter(
                project=self.test_project_id,
                class_column=class_map['neuron']).count()

        treenode_count = count_treenodes()
        skeleton_count = count_skeletons()
        neuron_count = count_neurons()

        # Get two nodes and calculate point between them
        child_id = 2376
        parent_id = 2372
        child = Treenode.objects.get(pk=child_id)
        parent = Treenode.objects.get(pk=parent_id)

        new_node_x = 0.5 * (child.location_x + parent.location_x)
        new_node_y = 0.5 * (child.location_y + parent.location_y)
        new_node_z = 0.5 * (child.location_z + parent.location_z)

        # Try to insert with a slight distorition in Y
        response = self.client.post('/%d/treenode/insert' % self.test_project_id, {
            'x': new_node_x,
            'y': new_node_y,
            'z': new_node_z,
            'child_id': child_id,
            'parent_id': parent_id})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertTrue('error' in parsed_response)

        self.assertEqual(treenode_count, count_treenodes())
        self.assertEqual(skeleton_count, count_skeletons())
        self.assertEqual(neuron_count, count_neurons())


    def test_delete_non_root_non_parent_treenode(self):
        self.fake_authentication()
        treenode_id = 349

        tn_count = Treenode.objects.all().count()
        response = self.client.post(
                '/%d/treenode/delete' % self.test_project_id,
                {'treenode_id': treenode_id, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = 'Removed treenode successfully.'
        self.assertEqual(expected_result, parsed_response['success'])
        self.assertEqual(0, Treenode.objects.filter(id=treenode_id).count())
        self.assertEqual(tn_count - 1, Treenode.objects.all().count())


    def test_delete_root_treenode(self):
        self.fake_authentication()
        treenode_id = 2437

        treenode = Treenode.objects.filter(id=treenode_id)[0]
        children = Treenode.objects.filter(parent=treenode_id)
        self.assertEqual(0, children.count())
        self.assertEqual(None, treenode.parent)
        tn_count = Treenode.objects.all().count()

        response = self.client.post(
                '/%d/treenode/delete' % self.test_project_id,
                {'treenode_id': treenode_id, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            'success': 'Removed treenode successfully.',
            'parent_id': None,
            'deleted_neuron': True,
            'skeleton_id': 2433,
            'children': [],
            'confidence': 5,
            'radius': -1.0,
            'links': [],
            'x': 5290.0,
            'y': 3930.0,
            'z': 279.0
        }
        self.assertEqual(expected_result, parsed_response)
        self.assertEqual(0, Treenode.objects.filter(id=treenode_id).count())
        self.assertEqual(tn_count - 1, Treenode.objects.all().count())


    def test_delete_non_root_treenode(self):
        self.fake_authentication()
        treenode_id = 265

        relation_map = get_relation_to_id_map(self.test_project_id)
        get_skeleton = lambda: TreenodeClassInstance.objects.filter(
                project=self.test_project_id,
                relation=relation_map['element_of'],
                treenode=treenode_id)
        self.assertEqual(1, get_skeleton().count())

        children = Treenode.objects.filter(parent=treenode_id)
        self.assertTrue(children.count() > 0)
        tn_count = Treenode.objects.all().count()
        parent = get_object_or_404(Treenode, id=treenode_id).parent

        response = self.client.post(
                '/%d/treenode/delete' % self.test_project_id,
                {'treenode_id': treenode_id, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = 'Removed treenode successfully.'
        self.assertEqual(expected_result, parsed_response['success'])
        self.assertEqual(0, Treenode.objects.filter(id=treenode_id).count())
        self.assertEqual(0, get_skeleton().count())
        self.assertEqual(tn_count - 1, Treenode.objects.all().count())

        for child in children:
            child_after_change = get_object_or_404(Treenode, id=child.id)
            self.assertEqual(parent, child_after_change.parent)


    def test_treenode_info_nonexisting_treenode_failure(self):
        self.fake_authentication()
        treenode_id = 55555

        response = self.client.get(
                '/%d/treenodes/%s/info' % (self.test_project_id, treenode_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = 'No skeleton and neuron for treenode %s' % treenode_id
        self.assertIn('error', parsed_response)
        self.assertEqual(expected_result, parsed_response['error'])


    def test_treenode_info(self):
        self.fake_authentication()
        treenode_id = 239

        response = self.client.get(
                '/%d/treenodes/%s/info' % (self.test_project_id, treenode_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {'skeleton_id': 235, 'neuron_id': 233, 'skeleton_name': 'skeleton 235', 'neuron_name': 'branched neuron'}
        self.assertEqual(expected_result, parsed_response)


    def assertTreenodeHasRadius(self, treenode_id, radius):
        """Helper function for radius update tests."""
        treenode = Treenode.objects.get(id=treenode_id)
        self.assertEqual(radius, treenode.radius,
                'Treenode %d has radius %s not %s' % (treenode_id, treenode.radius, radius))


    def test_update_treenode_radius_single_node(self):
        self.fake_authentication()

        treenode_id = 257
        new_r = 5
        old_r = -1
        response = self.client.post(
                '/%d/treenode/%d/radius' % (self.test_project_id, treenode_id),
                {'radius': new_r, 'option': 0, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)

        expected = [(259, old_r), (257, new_r), (255, old_r)]
        for x in expected:
            self.assertTreenodeHasRadius(*x)


    def test_update_treenode_radius_next_branch(self):
        self.fake_authentication()

        # Test to end node
        treenode_id = 257
        new_r = 5
        old_r = -1
        response = self.client.post(
                '/%d/treenode/%d/radius' % (self.test_project_id, treenode_id),
                {'radius': new_r, 'option': 1, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)

        expected = [(261, new_r), (259, new_r), (257, new_r),
                    (255, old_r), (253, old_r)]
        for x in expected:
            self.assertTreenodeHasRadius(*x)

        # Test to branch node
        treenode_id = 263
        response = self.client.post(
                '/%d/treenode/%d/radius' % (self.test_project_id, treenode_id),
                {'radius': new_r, 'option': 1, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)

        expected = [(253, old_r), (263, new_r), (265, new_r),
                    (269, old_r), (267, old_r)]
        for x in expected:
            self.assertTreenodeHasRadius(*x)


    def test_update_treenode_radius_prev_branch(self):
        self.fake_authentication()

        # Test to branch node
        treenode_id = 257
        new_r = 5
        old_r = -1
        response = self.client.post(
                '/%d/treenode/%d/radius' % (self.test_project_id, treenode_id),
                {'radius': new_r, 'option': 2, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)

        expected = [(261, old_r), (259, old_r), (257, new_r),
                    (255, new_r), (253, old_r)]
        for x in expected:
            self.assertTreenodeHasRadius(*x)

        # Test to root node
        treenode_id = 253
        response = self.client.post(
                '/%d/treenode/%d/radius' % (self.test_project_id, treenode_id),
                {'radius': new_r, 'option': 2, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)

        expected = [(255, new_r), (263, old_r), (253, new_r),
                    (251, new_r), (249, new_r), (247, new_r),
                    (247, new_r), (245, new_r), (243, new_r),
                    (241, new_r), (239, new_r), (237, old_r)]
        for x in expected:
            self.assertTreenodeHasRadius(*x)


    def test_update_treenode_radius_prev_defined_node(self):
        self.fake_authentication()

        # Set radius at ancestor node
        ancestor = Treenode.objects.get(id=251)
        ancestor.radius = 7
        ancestor.save()

        # Test to previous defined node
        treenode_id = 257
        new_r = 5
        old_r = -1
        response = self.client.post(
                '/%d/treenode/%d/radius' % (self.test_project_id, treenode_id),
                {'radius': new_r, 'option': 3, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)

        expected = [(261, old_r), (259, old_r), (257, new_r),
                    (255, new_r), (253, new_r), (251, 7)]

        # Test on node with defined radius (and propagation to root)
        treenode_id = ancestor.id
        response = self.client.post(
                '/%d/treenode/%d/radius' % (self.test_project_id, treenode_id),
                {'radius': new_r, 'option': 3, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)

        expected = [(253, new_r), (251, new_r), (249, new_r),
                    (247, new_r), (247, new_r), (245, new_r),
                    (243, new_r), (241, new_r), (239, new_r),
                    (237, new_r)]
        for x in expected:
            self.assertTreenodeHasRadius(*x)


    def test_update_treenode_radius_to_root(self):
        self.fake_authentication()

        treenode_id = 257
        new_r = 5
        old_r = -1
        response = self.client.post(
                '/%d/treenode/%d/radius' % (self.test_project_id, treenode_id),
                {'radius': new_r, 'option': 4, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)

        expected = [(261, old_r), (259, old_r), (257, new_r),
                    (255, new_r), (253, new_r), (263, old_r),
                    (251, new_r), (249, new_r), (247, new_r),
                    (247, new_r), (245, new_r), (243, new_r),
                    (241, new_r), (239, new_r), (237, new_r)]
        for x in expected:
            self.assertTreenodeHasRadius(*x)


    def test_update_treenode_radius_all_nodes(self):
        self.fake_authentication()

        treenode_id = 2417
        new_r = 5.0
        old_r = -1.0
        response = self.client.post(
                '/%d/treenode/%d/radius' % (self.test_project_id, treenode_id),
                {'radius': new_r, 'option': 5, 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_response = {
            'success': True,
            'new_radius': new_r,
            'updated_nodes': {
                '2415': {'edition_time': u'2016-04-08T15:33:16.133Z',
                         'new': 5.0,
                         'old': -1.0,
                         'skeleton_id': 2411},
                '2417': {'edition_time': u'2016-04-08T15:33:16.133Z',
                         'new': 5.0,
                         'old': -1.0,
                         'skeleton_id': 2411},
                '2419': {'edition_time': u'2016-04-08T15:33:16.133Z',
                         'new': 5.0,
                         'old': -1.0,
                         'skeleton_id': 2411},
                '2423': {'edition_time': u'2016-04-08T15:33:16.133Z',
                         'new': 5.0,
                         'old': -1.0,
                         'skeleton_id': 2411}}
        }

        # The response has updated timetamps (since we updated nodes), we have
        # to compare fields manually to ignore them
        for k,v in expected_response.items():
            self.assertIn(k, parsed_response)
            if 'updated_nodes' == k:
                continue
            self.assertEqual(v, parsed_response.get(k))
        for k,v in expected_response['updated_nodes'].items():
            self.assertIn(k, parsed_response['updated_nodes'])
            result_node = parsed_response['updated_nodes'][k]
            for p,pv in v.items():
                self.assertIn(p, result_node)
                result_value = result_node.get(p)
                if 'edition_time' == p:
                    # Changes through the updated, and the test can't know the
                    # value, but only check if it changed
                    self.assertNotEqual(pv, result_value)
                else:
                    self.assertEqual(pv, result_value)

        # Don't expect any more items than the above:
        self.assertEqual(len(expected_response['updated_nodes']),
                len(parsed_response['updated_nodes']))

        expected = [(2419, new_r), (2417, new_r), (2415, new_r), (2423, new_r)]
        for x in expected:
            self.assertTreenodeHasRadius(*x)


    def test_node_find_previous_branch(self):
        self.fake_authentication()
        treenode_id = 257

        response = self.client.post(
                '/%d/treenodes/%d/previous-branch-or-root' % (self.test_project_id, treenode_id),
                {'alt': 0})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        # Response should contain one branch.
        expected_result = [253, 3685.0, 2160.0, 0.0]
        self.assertEqual(expected_result, parsed_response)

        treenode_id = 253
        response = self.client.post(
                '/%d/treenodes/%d/previous-branch-or-root' % (self.test_project_id, treenode_id),
                {'alt': 0})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        # Response should contain one branch.
        expected_result = [237, 1065.0, 3035.0, 0.0]
        self.assertEqual(expected_result, parsed_response)

        treenode_id = 237
        response = self.client.post(
                '/%d/treenodes/%d/previous-branch-or-root' % (self.test_project_id, treenode_id),
                {'alt': 0})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        # Response should contain one branch.
        expected_result = [237, 1065.0, 3035.0, 0.0]
        self.assertEqual(expected_result, parsed_response)


    def test_node_find_next_branch(self):
        self.fake_authentication()

        treenode_id = 391
        response = self.client.post(
                '/%d/treenodes/%d/next-branch-or-end' % (self.test_project_id, treenode_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        # Response should contain one branch.
        expected_result = [[[393, 6910.0, 990.0, 0.0],
                            [393, 6910.0, 990.0, 0.0],
                            [399, 5670.0, 640.0, 0.0]]]
        self.assertEqual(expected_result, parsed_response)

        treenode_id = 253
        response = self.client.post(
                '/%d/treenodes/%d/next-branch-or-end' % (self.test_project_id, treenode_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        # Response should contain two branches, and the larger branch headed by
        # node 263 should be first.
        expected_result = [[[263, 3915.0, 2105.0, 0.0],
                            [263, 3915.0, 2105.0, 0.0],
                            [265, 4570.0, 2125.0, 0.0]],
                           [[255, 3850.0, 1790.0, 0.0],
                            [255, 3850.0, 1790.0, 0.0],
                            [261, 2820.0, 1345.0, 0.0]]]
        self.assertEqual(expected_result, parsed_response)


    def test_treenode_find_children(self):
        self.fake_authentication()

        treenode_id = 387
        response = self.client.post(
                '/%d/treenodes/%d/children' % (self.test_project_id, treenode_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = []
        self.assertEqual(expected_result, parsed_response)

        treenode_id = 385
        response = self.client.post(
                '/%d/treenodes/%d/children' % (self.test_project_id, treenode_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [[[387, 9030.0, 1480.0, 0.0]]]
        self.assertEqual(expected_result, parsed_response)

        treenode_id = 367
        response = self.client.post(
                '/%d/treenodes/%d/children' % (self.test_project_id, treenode_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = [[383, 7850.0, 1970.0, 0.0], [391, 6740.0, 1530.0, 0.0]]
        parsed_response = [p[0] for p in parsed_response]
        for (expected, parsed) in zip(sorted(expected_result), sorted(parsed_response)):
             self.assertEqual(expected, parsed)


    def test_suppressed_virtual_nodes(self):
        self.fake_authentication()

        response = self.client.post(
                '/%d/treenode/create' % (self.test_project_id, ),
                {'x': 1,
                 'y': -1,
                 'z': 0})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        parent_id = parsed_response['treenode_id']
        skeleton_id = parsed_response['skeleton_id']

        response = self.client.post(
                '/%d/treenode/create' % (self.test_project_id, ),
                {'x': 3,
                 'y': -3,
                 'z': 2,
                 'parent_id': parent_id,
                 'state': make_nocheck_state()})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        child_id = parsed_response['treenode_id']

        # Initially no nodes should be supppressed
        response = self.client.get(
                '/%d/treenodes/%d/suppressed-virtual/' % (self.test_project_id, child_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = []
        self.assertEqual(expected_result, parsed_response)

        # Reject attempt to suppress root node
        response = self.client.post(
                '/%d/treenodes/%d/suppressed-virtual/' % (self.test_project_id, parent_id),
                {'location_coordinate': 1,
                 'orientation': 0})
        self.assertEqual(response.status_code, 400)

        # Reject coordinate outside edge
        response = self.client.post(
                '/%d/treenodes/%d/suppressed-virtual/' % (self.test_project_id, child_id),
                {'location_coordinate': 4,
                 'orientation': 0})
        self.assertEqual(response.status_code, 400)

        # Create virtual node
        response = self.client.post(
                '/%d/treenodes/%d/suppressed-virtual/' % (self.test_project_id, child_id),
                {'location_coordinate': 2,
                 'orientation': 0})
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        suppressed_id = parsed_response['id']

        # Delete virtual node
        response = self.client.delete(
                '/%d/treenodes/%d/suppressed-virtual/%d' % (self.test_project_id, child_id, suppressed_id))
        self.assertEqual(response.status_code, 204)


    def test_list_treenode_table_simple(self):
        self.fake_authentication()
        response = self.client.get(
                '/%d/skeletons/%d/node-overview' % (self.test_project_id, 235))
        self.assertEqual(response.status_code, 200)
        expected_result = [[
                [417, 415, 5, 4990.0, 4200.0, 0.0, -1.0, 3, 1323093096.0],
                [415, 289, 5, 5810.0, 3950.0, 0.0, -1.0, 3, 1323093096.0],
                [289, 285, 5, 6210.0, 3480.0, 0.0, -1.0, 3, 1320587496.0],
                [285, 283, 5, 6100.0, 2980.0, 0.0, -1.0, 3, 1323006696.0],
                [283, 281, 5, 5985.0, 2745.0, 0.0, -1.0, 3, 1323957096.0],
                [281, 279, 5, 5675.0, 2635.0, 0.0, -1.0, 3, 1323093096.0],
                [279, 267, 5, 5530.0, 2465.0, 0.0, -1.0, 3, 1323093096.0],
                [277, 275, 5, 6090.0, 1550.0, 0.0, -1.0, 3, 1323093096.0],
                [275, 273, 5, 5800.0, 1560.0, 0.0, -1.0, 3, 1323093096.0],
                [273, 271, 5, 5265.0, 1610.0, 0.0, -1.0, 3, 1323093096.0],
                [271, 269, 5, 5090.0, 1675.0, 0.0, -1.0, 3, 1323093096.0],
                [269, 265, 5, 4820.0, 1900.0, 0.0, -1.0, 3, 1323093096.0],
                [267, 265, 5, 5400.0, 2200.0, 0.0, -1.0, 3, 1323093096.0],
                [265, 263, 5, 4570.0, 2125.0, 0.0, -1.0, 3, 1323093096.0],
                [263, 253, 5, 3915.0, 2105.0, 0.0, -1.0, 3, 1323093096.0],
                [261, 259, 5, 2820.0, 1345.0, 0.0, -1.0, 3, 1323093096.0],
                [259, 257, 5, 3445.0, 1385.0, 0.0, -1.0, 3, 1323093096.0],
                [257, 255, 5, 3825.0, 1480.0, 0.0, -1.0, 3, 1323093096.0],
                [255, 253, 5, 3850.0, 1790.0, 0.0, -1.0, 3, 1323093096.0],
                [253, 251, 5, 3685.0, 2160.0, 0.0, -1.0, 3, 1323093096.0],
                [251, 249, 5, 3380.0, 2330.0, 0.0, -1.0, 3, 1323093096.0],
                [249, 247, 5, 2815.0, 2590.0, 0.0, -1.0, 3, 1323093096.0],
                [247, 245, 5, 2610.0, 2700.0, 0.0, -1.0, 3, 1323093096.0],
                [245, 243, 5, 1970.0, 2595.0, 0.0, -1.0, 3, 1323093096.0],
                [243, 241, 5, 1780.0, 2570.0, 0.0, -1.0, 3, 1323093096.0],
                [241, 239, 5, 1340.0, 2660.0, 0.0, -1.0, 3, 1323093096.0],
                [239, 237, 5, 1135.0, 2800.0, 0.0, -1.0, 3, 1323093096.0],
                [237, None, 5, 1065.0, 3035.0, 0.0, -1.0, 3, 1323093096.0]],
            [], [[261, 'TODO']]]
        parsed_response = json.loads(response.content.decode('utf-8'))

        # Check each aaData row instead of everything at once for more granular
        # error reporting. Don't expext the same ordering.
        for (expected, parsed) in zip(sorted(expected_result[0]), sorted(parsed_response[0])):
            self.assertEqual(expected, parsed)
        self.assertEqual(expected_result[1], parsed_response[1])
        self.assertEqual(expected_result[2], parsed_response[2])

    def test_compact_detail_simple(self):
        self.fake_authentication()
        response = self.client.post(
                '/{}/treenodes/compact-detail'.format(self.test_project_id),
                {
                    'treenode_ids': [261, 417, 415]
                })
        self.assertEqual(response.status_code, 200)
        expected_result = [
                [261, 259, 2820.0, 1345.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [415, 289, 5810.0, 3950.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [417, 415, 4990.0, 4200.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
        ]
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result,
                sorted(parsed_response, key=itemgetter(0)))

    def test_compact_detail_label_names_and_treenode_set(self):
        self.fake_authentication()
        response = self.client.post(
                '/{}/treenodes/compact-detail'.format(self.test_project_id),
                {
                    'treenode_ids': [261, 417, 415],
                    'label_names': ['TODO']
                })
        self.assertEqual(response.status_code, 200)
        expected_result = [
                [261, 259, 2820.0, 1345.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
        ]
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result,
                sorted(parsed_response, key=itemgetter(0)))

    def test_compact_detail_label_names(self):
        self.fake_authentication()
        response = self.client.post(
                '/{}/treenodes/compact-detail'.format(self.test_project_id),
                {
                    'label_names': ['TODO']
                })
        self.assertEqual(response.status_code, 200)
        expected_result = [
                [261, 259, 2820.0, 1345.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [349, 347, 3580.0, 3350.0, 252.0, 5, -1.0, 1, 1323093096.955, 3]
        ]
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result,
                sorted(parsed_response, key=itemgetter(0)))

    def test_compact_detail_label_id_and_treenode_set(self):
        self.fake_authentication()
        response = self.client.post(
                '/{}/treenodes/compact-detail'.format(self.test_project_id),
                {
                    'treenode_ids': [261, 417, 415],
                    'label_ids': [351]
                })
        self.assertEqual(response.status_code, 200)
        expected_result = [
                [261, 259, 2820.0, 1345.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
        ]
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result,
                sorted(parsed_response, key=itemgetter(0)))

    def test_compact_detail_label_ids(self):
        self.fake_authentication()
        response = self.client.post(
                '/{}/treenodes/compact-detail'.format(self.test_project_id),
                {
                    'label_ids': [351]
                })
        self.assertEqual(response.status_code, 200)
        expected_result = [
                [261, 259, 2820.0, 1345.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [349, 347, 3580.0, 3350.0, 252.0, 5, -1.0, 1, 1323093096.955, 3]
        ]
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result,
                sorted(parsed_response, key=itemgetter(0)))

    def test_compact_detail_skeleton_ids(self):
        self.fake_authentication()
        response = self.client.post(
                '/{}/treenodes/compact-detail'.format(self.test_project_id),
                {
                    'skeleton_ids': [235]
                })
        self.assertEqual(response.status_code, 200)
        expected_result = [
                [237, None, 1065.0, 3035.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [239, 237, 1135.0, 2800.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [241, 239, 1340.0, 2660.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [243, 241, 1780.0, 2570.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [245, 243, 1970.0, 2595.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [247, 245, 2610.0, 2700.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [249, 247, 2815.0, 2590.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [251, 249, 3380.0, 2330.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [253, 251, 3685.0, 2160.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [255, 253, 3850.0, 1790.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [257, 255, 3825.0, 1480.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [259, 257, 3445.0, 1385.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [261, 259, 2820.0, 1345.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [263, 253, 3915.0, 2105.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [265, 263, 4570.0, 2125.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [267, 265, 5400.0, 2200.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [269, 265, 4820.0, 1900.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [271, 269, 5090.0, 1675.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [273, 271, 5265.0, 1610.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [275, 273, 5800.0, 1560.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [277, 275, 6090.0, 1550.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [279, 267, 5530.0, 2465.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [281, 279, 5675.0, 2635.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [283, 281, 5985.0, 2745.0, 0.0, 5, -1.0, 235, 1323957096.955, 3],
                [285, 283, 6100.0, 2980.0, 0.0, 5, -1.0, 235, 1323006696.955, 3],
                [289, 285, 6210.0, 3480.0, 0.0, 5, -1.0, 235, 1320587496.955, 3],
                [415, 289, 5810.0, 3950.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
                [417, 415, 4990.0, 4200.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
        ]
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result,
                sorted(parsed_response, key=itemgetter(0)))

    def test_compact_detail_skeleton_ids_and_label(self):
        self.fake_authentication()
        response = self.client.post(
                '/{}/treenodes/compact-detail'.format(self.test_project_id),
                {
                    'skeleton_ids': [235],
                    'label_names': ['TODO']
                })
        self.assertEqual(response.status_code, 200)
        expected_result = [
                [261, 259, 2820.0, 1345.0, 0.0, 5, -1.0, 235, 1323093096.955, 3],
        ]
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result,
                sorted(parsed_response, key=itemgetter(0)))
