# -*- coding: utf-8 -*-

import datetime
import json
import tempfile
import os
import numpy as np
import pyn5
from pathlib import Path

from django.db import transaction
from django.test import TransactionTestCase, override_settings

from catmaid.models import WritableStack
from catmaid.control.stack import get_writable_stack_path

from .common import CatmaidApiTestCase


@override_settings(MEDIA_ROOT=Path(tempfile.TemporaryDirectory().name))
class StacksApiTests(CatmaidApiTestCase):

    def test_stack_info(self):
        self.fake_authentication()
        test_stack_id = 3

        response = self.client.get('/%d/stack/%d/info' % (self.test_project_id, test_stack_id))
        self.assertStatus(response)
        parsed_response = json.loads(response.content.decode('utf-8'))
        expected_result = {
            "attribution": None,
            "broken_slices": {},
            "canary_location": {
                "x": 0,
                "y": 0,
                "z": 0
            },
            "dimension": {
                "x": 2048,
                "y": 1536,
                "z": 460
            },
            "comment": '<p>&copy;2009 <a href="http://people.epfl.ch/graham.knott">Graham '
                       'Knott</a>.</p> <p>Public INCF data set available at the <a '
                       'href="http://www.incf.org/about/nodes/switzerland/data">Swiss '
                       'INCF Node</a>.</p>',
            "description": "",
            "metadata": None,
            "num_zoom_levels": 0,
            "orientation": 0,
            "mirrors": [{
                "id": 3,
                "title": "",
                "image_base": "http://incf.ini.uzh.ch/image-stack-fib/",
                "file_extension": "jpg",
                "tile_height": 256,
                "tile_source_type": 1,
                "tile_width": 256,
                "position": 0
            }],
            "pid": self.test_project_id,
            "ptitle": "Focussed Ion Beam (FIB)",
            "placeholder_color": {
                "a": 1.0,
                "b": 0.0,
                "g": 0.0,
                "r": 0.0
            },
            "resolution": {
                "x": 5.0,
                "y": 5.0,
                "z": 9.0
            },
            "sid": test_stack_id,
            "stitle": "Focussed Ion Beam (FIB) stack of Rat Striatum\t",
            "translation": {
                "x": 0.0,
                "y": 0.0,
                "z": 0.0
            },
            "downsample_factors": [{
                "x": 1,
                "y": 1,
                "z": 1
            }],
        }

        self.assertEqual(expected_result, parsed_response)

    def test_writable_n5_stack(self):
        self.fake_authentication()
        test_stack_id = 3
        test_dtype = 'uint8'
        test_dataset = 'volumes/main'
        test_time = datetime.datetime.now(tz=datetime.timezone.utc).isoformat()
        test_block_Size = [3, 3, 3]
        dataset_size = [3, 3, 3]

        # Create a a writable stack
        response = self.client.post(
            f'/{self.test_project_id}/writable-stacks/',
            {
                'stack_id': test_stack_id,
                'name': 'Test writable stack',
                'filetype': 'n5',
                'metadata': json.dumps({
                    'dataset': test_dataset,
                    'block_size': test_block_Size,
                    'dataset_size': dataset_size,
                    'dtype': test_dtype,
                    'last_update_time': test_time,
                }),
            })
        self.assertStatus(response)
        parsed_response = json.loads(response.content.decode('utf-8'))

        writable_stack = WritableStack.objects.get(id=parsed_response['id'])
        self.assertEqual(test_stack_id, writable_stack.stack_id)

        # Raw data is assumed to be a a list of list of lists, in the order X, Y
        # and Z.
        test_data_raw = np.random.randint(0, 256, (3, 3, 3), test_dtype)
        test_data = json.dumps(test_data_raw.tolist())[1:-1]
        test_bounds = [[0, 0, 0], [2, 2, 2]] # These bounds are inclusive
        block_bounds = [[0, 0, 0], [3, 3, 3]] # Exclusive version for query

        response = self.client.post(
            f'/{self.test_project_id}/writable-stacks/{writable_stack.id}/write-block',
            {
                'data': test_data,
                # TODO: Improve this
                'data_bounds[0][0]': test_bounds[0][0],
                'data_bounds[0][1]': test_bounds[0][1],
                'data_bounds[0][2]': test_bounds[0][2],
                'data_bounds[1][0]': test_bounds[1][0],
                'data_bounds[1][1]': test_bounds[1][1],
                'data_bounds[1][2]': test_bounds[1][2],
                'compression': 'raw',
                'scale_level': 0,
            })
        self.assertStatus(response)
        parsed_response = json.loads(response.content.decode('utf-8'))

        self.assertEqual(True, parsed_response.get('update'))
        self.assertEqual(test_bounds, parsed_response.get('last_update_bounds'))
        self.assertNotEqual(test_time, parsed_response.get('last_update_time'))

        # Open written file directly and compare the data
        base_path = get_writable_stack_path(writable_stack.path)
        dataset_path = os.path.join(test_dataset, 's0')
        n5 = pyn5.open(base_path, dataset_path, test_dtype.lower(), False)

        self.assertTrue(
            np.array_equal(
                test_data_raw.transpose([2, 1, 0]),
                pyn5.read(n5, (np.array(block_bounds[0]), np.array(block_bounds[1])), test_dtype),
            )
        )
