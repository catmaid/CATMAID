# -*- coding: utf-8 -*-

import json

from django.db import connection
from django.test import TestCase

import catmaid.state as state
from catmaid.tests.common import CatmaidTestCase

class StateCheckingTest(CatmaidTestCase):
    """This tests various aspects of the back-end state checks"""

    # Work on regular test data
    fixtures = ['catmaid_testdata']

    def setUp(self):
        super(StateCheckingTest, self).setUp()

    def test_node_locking(self):
        return
        cursor = connection.cursor()

        cursor.execute("SELECT txid_current()")
        cursor.execute("BEGIN")

        lock_query = """
            select t.relname,l.locktype,page,virtualtransaction,pid,mode,granted
            from pg_locks l, pg_stat_all_tables t
            where l.relation=t.relid and t.relname = 'treenode'
            order by relation asc;
        """
        cursor.execute(lock_query)
        locks1 = cursor.fetchall()

        node_id = 285
        state.lock_node(node_id, cursor)

        cursor.execute(lock_query)
        locks2 = cursor.fetchall()

        intersection = set(locks1) & set(locks2)
        only_before = set(locks1) - intersection
        only_after = set(locks2) - intersection
        # Assert only after has the lock is only after the lock call there
        # TODO: Does it actually work !?!?!


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

    def test_check_disabling(self):
        no_check_state = {
            "nocheck": True
        }
        s = state.parse_state(json.dumps(no_check_state))
        self.assertEqual(s, no_check_state)
        self.assertTrue(state.is_disabled(s))

        s2 = state.make_nocheck_state(parsed=True)
        self.assertEqual(s, s2)

        s3 = state.make_nocheck_state(parsed=False)
        self.assertEqual(json.dumps(no_check_state), s3)

    def test_state_parsing(self):
        self.assertRaises(ValueError, lambda: state.parse_state(None))
        s1 = {'edition_time': "Timestamp"}
        parsed_state = state.parse_state(json.dumps(s1))
        self.assertEqual(parsed_state['edition_time'], "Timestamp")

        # Reject parents with wrong dimension and type
        self.assertRaises(ValueError, lambda: state.parse_state("{'parent': [247, '', 1]}"))
        self.assertRaises(ValueError, lambda: state.parse_state("{'parent':[247]}"))
        self.assertRaises(ValueError, lambda: state.parse_state("{'parent': 247}"))
        # Accept parents with correct dimension
        s2 = state.parse_state('{"parent": [247, "Timestamp"]}')
        self.assertEqual(s2['parent'][0], 247)
        self.assertEqual(s2['parent'][1], "Timestamp")

        self.assertRaises(ValueError, lambda: state.parse_state("{'children': [[247, '', 1]]}"))
        self.assertRaises(ValueError, lambda: state.parse_state("{'children': [[247]]}"))
        self.assertRaises(ValueError, lambda: state.parse_state("{'children': [247]}"))
        # Accept parents with correct dimension
        s_child = state.parse_state('{"children": [[247, "Timestamp"]]}')
        self.assertEqual(s_child['children'][0][0], 247)
        self.assertEqual(s_child['children'][0][1], "Timestamp")

        self.assertRaises(ValueError, lambda: state.parse_state('{"links": [[382, "", 1]]}'))
        self.assertRaises(ValueError, lambda: state.parse_state('{"links": [[382]]}'))
        self.assertRaises(ValueError, lambda: state.parse_state('{"links": [382]}'))
        # Accept parents with correct dimension
        s_links = state.parse_state('{"links": [[382, "Timestamp"]]}')
        self.assertEqual(s_links['links'][0][0], 382)
        self.assertEqual(s_links['links'][0][1], "Timestamp")

        self.assertRaises(ValueError, lambda: state.parse_state(
            '[[247, "Timestamp1"], [433, "Timestamp2", 1]]'))
        self.assertRaises(ValueError, lambda: state.parse_state(
            '[[247, "Timestamp1"], [], [433, "Timestamp2"]]'))

        s_multinode = state.parse_state(
            '[[247, "Timestamp1"], [433, "Timestamp2"]]')
        self.assertEqual(s_multinode[0][0], 247)
        self.assertEqual(s_multinode[0][1], "Timestamp1")
        self.assertEqual(s_multinode[1][0], 433)
        self.assertEqual(s_multinode[1][1], "Timestamp2")

    def test_wrong_id_format(self):
        s1 = {
            'parent': ['vn:5543379:5543376:433833.000:244407.000:76125.000', '2016-03-15T03:37:56.217Z']
        }
        with self.assertRaisesRegexp(ValueError, "Invalid state provided"):
            state.parse_state(json.dumps(s1))

    def test_wrong_node_state(self):
        s1 = {
            'edition_time': '2016-03-15T03:37:56.217Z'
        }
        ps1 = state.parse_state(json.dumps(s1))

        cursor = connection.cursor()
        checks1 = state.collect_state_checks(247, ps1, cursor, node=True)
        self.assertEqual(len(checks1), 1)
        self.assertRaises(state.StateMatchingError, lambda: state.check_state(ps1, checks1, cursor))

        s2 = {
            'edition_time': '2011-12-05T13:51:36.855Z'
        }
        ps2 = state.parse_state(json.dumps(s2))

        checks2 = state.collect_state_checks(247, ps2, cursor, node=True)
        self.assertEqual(len(checks2), 1)
        self.assertRaises(state.StateMatchingError, lambda: state.check_state(ps2, checks2, cursor))

    def test_correct_node_state(self):
        s1 = {
            'edition_time': '2011-12-05T13:51:36.955Z'
        }
        ps1 = state.parse_state(json.dumps(s1))

        cursor = connection.cursor()
        checks1 = state.collect_state_checks(247, ps1, cursor, node=True)

        state.check_state(ps1, checks1, cursor)

    def test_correct_multinode_state(self):
        ps1 = [
            [247, '2011-12-05T13:51:36.955Z'],
            [249, '2011-12-05T13:51:36.955Z'],
            [251, '2011-12-05T13:51:36.955Z']
        ]
        s1 = json.dumps(ps1)
        # Expect this state to validate cleanly
        state.validate_state([247, 249, 251], s1, multinode=True)

        # Expect wrong input list to cause error
        self.assertRaises(ValueError,
                lambda: state.validate_state([247, 249], s1, multinode=True))
        self.assertRaises(ValueError,
                lambda: state.validate_state([247, 249, 253], s1, multinode=True))
        self.assertRaises(ValueError,
                lambda: state.validate_state([247, 249, 251, 253], s1, multinode=True))

    def test_correct_multinode_shared_state(self):
        ps1 = {
            'edition_time': '2011-12-05T13:51:36.955Z'
        }
        s1 = json.dumps(ps1)
        state.validate_state([247, 249, 251], s1, multinode=False, node=True)

    def test_wrong_multinode_shared_state(self):
        ps1 = {
            'edition_time': '2011-12-05T13:51:00.000Z'
        }
        s1 = json.dumps(ps1)
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state([247, 249, 251], s1, multinode=False, node=True))

    def test_wrong_multinode_state(self):
        ps1 = [
            [247, '2011-12-05T13:51:36.955Z'],
            [249, '3011-12-05T13:51:36.955Z'],
            [251, '2011-12-05T13:51:36.955Z']
        ]
        s1 = json.dumps(ps1)
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state([247, 249, 251], s1, multinode=True))

        s2 = json.dumps([])
        self.assertRaises(ValueError,
                lambda: state.validate_state([247, 249, 251], s2, multinode=True))

        s3 = json.dumps({})
        self.assertRaises(ValueError,
                lambda: state.validate_state([247, 249, 251], s3, multinode=True))

    def test_correct_parent_state(self):
        ps1 = {
            'parent': [249, '2011-12-05T13:51:36.955Z']
        }
        s1 = json.dumps(ps1)
        state.validate_state(251, s1, is_parent=True, parent_edittime=True)
        state.validate_state(251, s1, is_parent=True, parent_edittime=False)
        state.validate_state(251, s1, is_parent=False, parent_edittime=True)
        state.validate_state(247, s1, is_parent=False, parent_edittime=True)
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(247, s1, is_parent=True, parent_edittime=True))

    def test_wrong_parent_state(self):
        ps1 = {
            'parent': [249, '1011-12-05T13:51:36.955Z']
        }
        s1 = json.dumps(ps1)
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(251, s1, is_parent=True, parent_edittime=True))

        s2 = json.dumps([])
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(251, s1, is_parent=True, parent_edittime=True))

        s3 = json.dumps({})
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(251, s3, is_parent=True, parent_edittime=True))

    def test_correct_edge_state(self):
        ps1 = {
            'children': [[251, '2011-12-05T13:51:36.955Z']],
            'edition_time': '2011-12-05T13:51:36.955Z'
        }
        s1 = json.dumps(ps1)
        # Expect this state to validate cleanly
        state.validate_state(249, s1, node=True, children=[251])

    def test_wrong_edge_state(self):
        ps1 = {
            'children': [[247, '2011-12-05T13:51:36.955Z']],
            'edition_time': '2011-12-05T13:51:36.955Z'
        }
        s1 = json.dumps(ps1)
        # Expect this state to validate cleanly
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(249, s1, node=True, children=[247]))

        ps2 = {
            'children': [[251, '1011-12-05T13:51:36.955Z']],
            'edition_time': '2011-12-05T13:51:36.955Z'
        }
        s2 = json.dumps(ps2)
        # Expect this state to validate cleanly
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(249, s2, node=True, children=[251]))

        ps3 = {
            'children': [],
            'edition_time': '2011-12-05T13:51:36.955Z'
        }
        s3 = json.dumps(ps3)
        # Expect this state to validate cleanly
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(249, s3, node=True, children=True))

        ps4 = {
            'children': [[251, '2011-12-05T13:51:36.955Z']],
            'edition_time': '2011-12-05T13:51:36.955Z'
        }
        s4 = json.dumps(ps4)
        # Expect this state to validate cleanly
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(251, s4, node=True, children=[251]))

    def test_correct_child_state(self):
        ps1 = {
            'children': [[251, '2011-12-05T13:51:36.955Z']],
        }
        s1 = json.dumps(ps1)
        # Expect this state to validate cleanly
        state.validate_state(249, s1, children=True)

    def test_wrong_child_state(self):
        ps1 = {
            'children': [[247, '2011-12-05T13:51:36.955Z']],
        }
        s1 = json.dumps(ps1)
        # Expect this state to validate cleanly
        self.assertRaises(state.StateMatchingError, lambda: state.validate_state(249, s1, children=True))

        ps2 = {
            'children': [[251, '1011-12-05T13:51:36.955Z']],
        }
        s2 = json.dumps(ps2)
        # Expect this state to validate cleanly
        self.assertRaises(state.StateMatchingError, lambda: state.validate_state(249, s2, children=True))

        ps3 = {
            'children': [],
        }
        s3 = json.dumps(ps3)
        # Expect this state to validate cleanly
        self.assertRaises(state.StateMatchingError, lambda: state.validate_state(249, s3, children=True))

        ps4 = {
            'children': [[251, '2011-12-05T13:51:36.955Z']],
        }
        s4 = json.dumps(ps4)
        # Expect this state to validate cleanly
        self.assertRaises(state.StateMatchingError, lambda: state.validate_state(251, s4, children=True))

    def test_correct_link_state(self):
        ps1 = {
            'links': [[360, '2011-12-20T10:46:01.360Z'],
                      [372, '2011-12-20T10:46:01.360Z']],
        }
        s1 = json.dumps(ps1)
        state.validate_state(285, s1, links=True)

    def test_wrong_link_state(self):
        ps1 = {
            'links': [[360, '1011-12-20T10:46:01.360Z'],
                      [372, '2011-12-20T10:46:01.360Z']],
        }
        s1 = json.dumps(ps1)
        self.assertRaises(state.StateMatchingError, lambda: state.validate_state(285, s1, links=True))

    def test_correct_clink_state(self):
        ps1 = {
            'c_links': [[360, '2011-12-20T10:46:01.360Z'],
                        [372, '2011-12-20T10:46:01.360Z'],
                        [382, '2011-12-20T10:46:01.360Z']],
        }
        s1 = json.dumps(ps1)
        state.validate_state(356, s1, c_links=True)

    def test_correct_clink_state(self):
        ps1 = {
            'c_links': [[360, '2011-12-20T10:46:01.360Z'],
                        [372, '3011-12-20T10:46:01.360Z'],
                        [382, '2011-12-20T10:46:01.360Z']],
        }
        s1 = json.dumps(ps1)
        self.assertRaises(ValueError, lambda: state.validate_state(356, s1, links=True))
        self.assertRaises(ValueError, lambda: state.validate_state(358, s1, links=True))

    def test_correct_neighborhood_state(self):
        ps1 = {
            'edition_time': '2011-12-04T13:51:36.955Z',
            'parent': [283, '2011-12-15T13:51:36.955Z'],
            'children': [[289, '2011-11-06T13:51:36.955Z']],
            'links': [[360, '2011-12-20T10:46:01.360Z']],
        }
        s1 = json.dumps(ps1)
        state.validate_state(285, s1, neighborhood=True)

    def test_wrong_neighborhood_state(self):
        ps1 = {
            'edition_time': '2011-12-04T13:51:36.955Z',
            'parent': [283, '2011-12-15T13:51:36.955Z'],
            'children': [[289, '2011-11-06T13:51:36.955Z']],
            'links': [[360, '3011-12-20T10:46:01.360Z']],
        }
        s1 = json.dumps(ps1)
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(285, s1, neighborhood=True))

        ps2 = {
            'parent': [283, '2011-12-15T13:51:36.955Z'],
            'children': [[289, '2011-11-06T13:51:36.955Z']],
            'links': [[360, '3011-12-20T10:46:01.360Z']],
        }
        s2 = json.dumps(ps2)
        self.assertRaises(ValueError,
                lambda: state.validate_state(285, s2, neighborhood=True))

        ps3 = {
            'edition_time': '2011-12-04T13:51:36.955Z',
            'children': [[289, '2011-11-06T13:51:36.955Z']],
            'links': [[360, '3011-12-20T10:46:01.360Z']],
        }
        s3 = json.dumps(ps3)
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(285, s3, neighborhood=True))

        ps4 = {
            'edition_time': '2011-12-04T13:51:36.955Z',
            'parent': [283, '2011-12-15T13:51:36.955Z'],
            'links': [[360, '3011-12-20T10:46:01.360Z']],
        }
        s4 = json.dumps(ps4)
        self.assertRaises(ValueError,
                lambda: state.validate_state(285, s4, neighborhood=True))

        ps5 = {
            'edition_time': '2011-12-04T13:51:36.955Z',
            'parent': [283, '2011-12-15T13:51:36.955Z'],
            'children': [[289, '2011-11-06T13:51:36.955Z']],
        }
        s5 = json.dumps(ps5)
        self.assertRaises(ValueError,
                lambda: state.validate_state(285, s5, neighborhood=True))

        ps6 = {
            'edition_time': '2011-12-04T13:51:36.955Z',
            'parent': [283, '2011-12-15T13:51:36.955Z'],
            'children': [[289, '2011-11-06T13:51:36.955Z']],
            'links': [],
        }
        s6 = json.dumps(ps6)
        self.assertRaises(state.StateMatchingError,
                lambda: state.validate_state(285, s6, neighborhood=True))


    def test_has_only_truthy_values(self):
        self.assertTrue(state.has_only_truthy_values([True, 1]))
        self.assertFalse(state.has_only_truthy_values([True], n=2))
        self.assertTrue(state.has_only_truthy_values([True], n=1))
        self.assertFalse(state.has_only_truthy_values([True, False]))
        self.assertFalse(state.has_only_truthy_values([False], n=2))
        self.assertFalse(state.has_only_truthy_values([False], n=1))
