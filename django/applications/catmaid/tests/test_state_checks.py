import json
import catmaid.state as state

from django.db import connection
from django.test import TestCase
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
        print "Transaction", cursor.fetchone()

        cursor.execute("BEGIN")

        lock_query = """
            select t.relname,l.locktype,page,virtualtransaction,pid,mode,granted
            from pg_locks l, pg_stat_all_tables t
            where l.relation=t.relid and t.relname = 'treenode'
            order by relation asc;
        """
        cursor.execute(lock_query)
        locks1 = cursor.fetchall()
        print locks1

        node_id = 285
        state.lock_node(node_id, cursor)

        cursor.execute(lock_query)
        locks2 = cursor.fetchall()
        print locks2
        
        intersection = set(locks1) & set(locks2)
        only_before = set(locks1) - intersection
        print "only in before", only_before
        only_after = set(locks2) - intersection
        print "Only in after", only_after
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

    def test_wrong_node_state(self):
        s1 = {
            'edition_time': '2016-03-15T03:37:56.217Z'
        }
        ps1 = state.parse_state(json.dumps(s1))

        cursor = connection.cursor()
        checks1 = state.collect_state_checks(247, ps1, cursor, node=True)
        self.assertEqual(len(checks1), 1)
        self.assertRaises(ValueError, lambda: state.check_state(ps1, checks1, cursor))

    def test_correct_node_state(self):
        s1 = {
            'edition_time': '2011-12-05T13:51:36.955Z'
        }
        ps1 = state.parse_state(json.dumps(s1))

        cursor = connection.cursor()
        checks1 = state.collect_state_checks(247, ps1, cursor, node=True)

        state.check_state(ps1, checks1, cursor)

    def test_multinode_state(self):
        pass

    def test_parent_state(self):
        pass

    def test_edge_state(self):
        pass

    def test_child_state(self):
        pass

    def test_link_state(self):
        pass

    def test_neighborhood_state(self):
        pass

    def test_has_only_truthy_values(self):
        self.assertTrue(state.has_only_truthy_values([True, 1]))
        self.assertFalse(state.has_only_truthy_values([True], n=2))
        self.assertTrue(state.has_only_truthy_values([True], n=1))
        self.assertFalse(state.has_only_truthy_values([True, False]))
        self.assertFalse(state.has_only_truthy_values([False], n=2))
        self.assertFalse(state.has_only_truthy_values([False], n=1))
