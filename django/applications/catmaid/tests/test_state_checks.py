import json
import catmaid.state as state

from django.test import TestCase
from catmaid.tests.common import CatmaidTestCase

class StateCheckingTest(CatmaidTestCase):
    """This tests various aspects of the back-end state checks"""

    # Work on regular test data
    fixtures = ['catmaid_testdata']

    def setUp(self):
        super(StateCheckingTest, self).setUp()

    def test_parsed_nocheck_state_creation(self):
        nocheck_state = state.make_nocheck_state(parsed=True)
        expected_state = {'nocheck': True }
        self.assertEqual(dict, type(nocheck_state))
        self.assertEqual(expected_state, nocheck_state)
        self.assertTrue(state.is_disabled(nocheck_state))

    def test_unparsed_nocheck_state_creation(self):
        nocheck_state = state.make_nocheck_state(parsed=False)
        expected_state = "{\"nocheck\": true}"
        self.assertEqual(str, type(nocheck_state))
        self.assertEqual(expected_state, nocheck_state)
        parsed_state = json.loads(nocheck_state)
        self.assertTrue(state.is_disabled(parsed_state))
