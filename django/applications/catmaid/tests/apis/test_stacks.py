# -*- coding: utf-8 -*-

import datetime
import json
import tempfile
import os
import numpy as np
import pyn5

from catmaid.models import WritableStack

from .common import CatmaidApiTestCase


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
            "num_zoom_levels": -1,
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
            "downsample_factors": None,
        }

        self.assertEqual(expected_result, parsed_response)

    def test_writable_n5_stack(self):
        self.fake_authentication()
        test_stack_id = 3
        test_dtype = 'uint32'
        test_time = datetime.datetime.now(tz=datetime.timezone.utc).isoformat()

        with tempfile.TemporaryDirectory() as tempdir:
            temp_path = os.path.join(tempdir, 'test.n5')
            dataset_size = [3, 3, 3]

            writable_stack = WritableStack.objects.create(
                user_id=self.test_user_id, project_id=self.test_project_id,
                name="Test writable stack", stack_id=test_stack_id,
                path=temp_path, metadata={
                    'dataset': 'volumes/test-dataset',
                    'block_size': [1, 1, 1],
                    'dataset_size': dataset_size,
                    'dtype': test_dtype,
                    'last_update_time': test_time,
                })

            test_data_raw = np.random.randint(0, 256, (3, 3, 3), test_dtype)
            test_data = json.dumps(test_data_raw.tolist())
            test_bounds = [[0, 0, 0], [3, 3, 3]]

            response = self.client.post(
                f'/{self.test_project_id}/stack/{test_stack_id}/write-block',
                {
                    'data': test_data,
                    'data_bounds': json.dumps(test_bounds),
                    'compression': 'GZIP',
                    'compression_opts': -1,
                })
            self.assertStatus(response)
            parsed_response = json.loads(response.content.decode('utf-8'))

            self.assertEqual(True, parsed_response.get('update'))
            self.assertEqual(test_bounds, parsed_response.get('last_update_bounds'))
            self.assertNotEqual(test_time, parsed_response.get('last_update_time'))

            # Open written file directly and compare the data
            n5 = pyn5.open(writable_stack.path, 'volumes/test-dataset', test_dtype.upper(), True)

            self.assertTrue(
                np.array_equal(
                    pyn5.read(n5, (np.array(test_bounds[0]), np.array(test_bounds[1])), test_dtype),
                    test_data_raw,
                )
            )
