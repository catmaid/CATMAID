# -*- coding: utf-8 -*-

import json

from .common import CatmaidApiTestCase


class StacksApiTests(CatmaidApiTestCase):
    def test_stack_info(self):
        self.fake_authentication()
        test_stack_id = 3

        response = self.client.get('/%d/stack/%d/info' % (self.test_project_id, test_stack_id))
        self.assertEqual(response.status_code, 200)
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
