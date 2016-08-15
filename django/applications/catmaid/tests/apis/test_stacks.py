import json

from .common import CatmaidApiTestCase


class StacksApiTests(CatmaidApiTestCase):
    def test_stack_info(self):
        self.fake_authentication()
        test_stack_id = 3

        response = self.client.get('/%d/stack/%d/info' % (self.test_project_id, test_stack_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content)
        expected_result = {
            "broken_slices": {},
            "dimension": {
                "x": 2048,
                "y": 1536,
                "z": 460
            },
            "file_extension": "jpg",
            "image_base": "http://incf.ini.uzh.ch/image-stack-fib/",
            "metadata": "",
            "num_zoom_levels": -1,
            "orientation": 0,
            "overlay": [],
            "pid": self.test_project_id,
            "ptitle": "Focussed Ion Beam (FIB)",
            "resolution": {
                "x": 5.0,
                "y": 5.0,
                "z": 9.0
            },
            "sid": test_stack_id,
            "stitle": "Focussed Ion Beam (FIB) stack of Rat Striatum\t",
            "tile_height": 256,
            "tile_source_type": 1,
            "tile_width": 256,
            "trakem2_project": 0,
            "translation": {
                "x": 0.0,
                "y": 0.0,
                "z": 0.0
            }
        }

        self.assertEqual(expected_result, parsed_response)
