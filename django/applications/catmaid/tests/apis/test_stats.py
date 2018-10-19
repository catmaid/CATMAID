# -*- coding: utf-8 -*-

import copy
import datetime
import json
import pytz

from itertools import chain

from django.db import connection
from catmaid.models import Connector
from catmaid.tests.apis.common import CatmaidApiTestCase
from catmaid.control import stats
from catmaid.control.common import get_relation_to_id_map, get_class_to_id_map
from guardian.shortcuts import assign_perm
from io import StringIO


class StatsApiTests(CatmaidApiTestCase):

    @classmethod
    def setUpTestData(cls):
        super(StatsApiTests, cls).setUpTestData()

    def setUp(self):
        super(StatsApiTests, self).setUp()
        cursor = connection.cursor()
        cursor.execute("""
            SELECT setval('catmaid_stats_summary_id_seq',
                coalesce(max("id"), 1), max("id") IS NOT null)
            FROM catmaid_stats_summary;
        """)

    def test_treenode_stats(self):
        self.fake_authentication()
        cursor = connection.cursor()

        def test_nodecount():
            expected_stats = {
                '5': 4,
                '2': 2,
                '3': 89
            }
            response = self.client.get('/%d/stats/nodecount' % (self.test_project_id,))
            self.assertEqual(response.status_code, 200)
            parsed_response = json.loads(response.content.decode('utf-8'))
            self.assertEqual(parsed_response, expected_stats)

        self.assert_empty_summary_table(cursor)

        test_nodecount()
        stats.populate_nodecount_stats_summary(self.test_project_id, cursor=cursor)
        test_nodecount()

    def test_treenode_stats_exclude_imports(self):
        self.fake_authentication()
        cursor = connection.cursor()

        def test_nodecount(with_imports, expected_stats):
            response = self.client.get('/%d/stats/nodecount' %
                    (self.test_project_id,), {
                        'with_imports': 'true' if with_imports else 'false'
                    })
            self.assertEqual(response.status_code, 200)
            parsed_response = json.loads(response.content.decode('utf-8'))
            self.assertEqual(parsed_response, expected_stats)

        self.assert_empty_summary_table(cursor)

        test_nodecount(False, {
            '5': 4,
            '2': 2,
            '3': 89
        })

        test_nodecount(True, {
            '5': 4,
            '2': 2,
            '3': 89
        })

        # Import some data
        result = self.add_test_imports()
        n_imported_nodes = len(result['node_id_map'].keys())

        test_nodecount(True, {
            '5': 4,
            '2': 2,
            '3': 89 + n_imported_nodes
        })

        # Exclude imported nodes
        test_nodecount(False, {
            '5': 4,
            '2': 2,
            '3': 89
        })

        # Add regular node count summary data. This should not effect import
        # information.
        stats.populate_nodecount_stats_summary(self.test_project_id, cursor=cursor)

        test_nodecount(True, {
            '5': 4,
            '2': 2,
            '3': 89 + n_imported_nodes
        })

        test_nodecount(False, {
            '5': 4,
            '2': 2,
            '3': 89
        })

        # Add import summary data.
        stats.populate_import_nodecount_stats_summary(self.test_project_id, cursor=cursor)

        test_nodecount(True, {
            '5': 4,
            '2': 2,
            '3': 89 + n_imported_nodes
        })

        test_nodecount(False, {
            '5': 4,
            '2': 2,
            '3': 89
        })

        # Make sure the summary table is what we expected
        p = self.test_project_id
        summary_table = set(self.get_summary_table(cursor))
        expected_summary = set([
            (datetime.datetime(2011, 11,  1, 12, 0, tzinfo=pytz.utc), 0, 0,  4, 0, 0, 0, 0, 0.0, 3, 5),
            (datetime.datetime(2011,  9,  4,  7, 0, tzinfo=pytz.utc), 0, 0,  5, 0, 0, 0, 0, 0.0, 3, 3),
            (datetime.datetime(2011,  9, 27,  7, 0, tzinfo=pytz.utc), 0, 0, 64, 0, 0, 0, 0, 0.0, 3, 3),
            (datetime.datetime(2011, 10,  7,  7, 0, tzinfo=pytz.utc), 0, 0,  2, 0, 0, 0, 0, 0.0, 3, 3),
            (datetime.datetime(2011, 11,  1, 12, 0, tzinfo=pytz.utc), 0, 0,  2, 0, 0, 0, 0, 0.0, 3, 2),
            (datetime.datetime(2011, 12,  9,  8, 0, tzinfo=pytz.utc), 0, 0,  7, 0, 0, 0, 0, 0.0, 3, 3),
            (datetime.datetime(2012,  7, 22, 16, 0, tzinfo=pytz.utc), 0, 0,  1, 0, 0, 0, 0, 0.0, 3, 3),
            (datetime.datetime(2012,  7, 22, 19, 0, tzinfo=pytz.utc), 0, 0,  4, 0, 0, 0, 0, 0.0, 3, 3),
            (datetime.datetime(2016,  3,  9, 18, 0, tzinfo=pytz.utc), 0, 0,  6, 0, 0, 0, 0, 0.0, 3, 3),
        ])
        # Add line for test import above, get date from actual summary table,
        # which seems more robust than assuming than guessing the date in other
        # ways.
        last_date_time = max(d[0] for d in summary_table)
        expected_summary.add((last_date_time, 0, 0, n_imported_nodes, 0, 0,
            n_imported_nodes, 0, 0.0, 3, 3));

        self.assertEqual(summary_table, expected_summary)

    def test_stats_summary(self):
        self.fake_authentication()
        response = self.client.get('/%d/stats/summary' % (self.test_project_id,))
        self.assertEqual(response.status_code, 200)
        expected_result = {
            "connectors_created": 0,
            'skeletons_created': 0,
            'treenodes_created': 0,
        }
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_result, parsed_response)

    def test_stats_user_history_no_utc_offset(self):
        self.fake_authentication()

        self.add_test_treenodes()
        self.add_test_connector_links()
        self.add_test_reviews()

        expected_stats = {
            'days': [
                 '20170701',
                 '20170702',
                 '20170703',
                 '20170704',
                 '20170705',
                 '20170706',
                 '20170707',
                 '20170708',
                 '20170709',
                 '20170710',
                 '20170711',
                 '20170712',
                 '20170713',
                 '20170714',
                 '20170715',
                 '20170716',
                 '20170717',
                 '20170718',
                 '20170719',
                 '20170720',
                 '20170721',
                 '20170722',
                 '20170723',
                 '20170724',
                 '20170725',
                 '20170726',
                 '20170727',
                 '20170728',
                 '20170729',
                 '20170730',
                 '20170731',
                 '20170801'
            ],
            'daysformatted': [
                  'Sat 01, Jul 2017',
                  'Sun 02, Jul 2017',
                  'Mon 03, Jul 2017',
                  'Tue 04, Jul 2017',
                  'Wed 05, Jul 2017',
                  'Thu 06, Jul 2017',
                  'Fri 07, Jul 2017',
                  'Sat 08, Jul 2017',
                  'Sun 09, Jul 2017',
                  'Mon 10, Jul 2017',
                  'Tue 11, Jul 2017',
                  'Wed 12, Jul 2017',
                  'Thu 13, Jul 2017',
                  'Fri 14, Jul 2017',
                  'Sat 15, Jul 2017',
                  'Sun 16, Jul 2017',
                  'Mon 17, Jul 2017',
                  'Tue 18, Jul 2017',
                  'Wed 19, Jul 2017',
                  'Thu 20, Jul 2017',
                  'Fri 21, Jul 2017',
                  'Sat 22, Jul 2017',
                  'Sun 23, Jul 2017',
                  'Mon 24, Jul 2017',
                  'Tue 25, Jul 2017',
                  'Wed 26, Jul 2017',
                  'Thu 27, Jul 2017',
                  'Fri 28, Jul 2017',
                  'Sat 29, Jul 2017',
                  'Sun 30, Jul 2017',
                  'Mon 31, Jul 2017',
                  'Tue 01, Aug 2017'
            ],
            'stats_table': {
                '1': {
                    '20170701': {},
                    '20170702': {
                        'new_cable_length': 10.0,
                        'new_connectors': 1,
                        'new_reviewed_nodes': 1,
                        'new_treenodes': 1,
                    },
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}
                },
                '2': {
                    '20170701': {},
                    '20170702': {},
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}
                },
                '3': {
                    '20170701': {
                        'new_cable_length': 7.0,
                        'new_connectors': 3,
                        'new_reviewed_nodes': 4,
                        'new_treenodes': 4,
                    },
                    '20170702': {},
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}},
                '4': {
                    '20170701': {},
                    '20170702': {},
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}
                },
                '5': {
                    '20170701': {},
                    '20170702': {},
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}
                }
            }
        }

        response = self.client.get('/%d/stats/user-history' % (self.test_project_id,), {
                'start_date': '2017-07-01',
                'end_date': '2017-08-01',
                'time_zone': 'UTC'
            })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_stats, parsed_response)

        # Init summary tables and test again
        stats.populate_stats_summary(self.test_project_id)

        response = self.client.get('/%d/stats/user-history' % (self.test_project_id,), {
                'start_date': '2017-07-01',
                'end_date': '2017-08-01',
                'time_zone': 'UTC'
            })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_stats, parsed_response)

    def test_stats_user_history_with_utc_offset(self):
        self.fake_authentication()

        self.add_test_treenodes()
        self.add_test_connector_links()
        self.add_test_reviews()

        expected_stats = {
            'days': [
                 '20170701',
                 '20170702',
                 '20170703',
                 '20170704',
                 '20170705',
                 '20170706',
                 '20170707',
                 '20170708',
                 '20170709',
                 '20170710',
                 '20170711',
                 '20170712',
                 '20170713',
                 '20170714',
                 '20170715',
                 '20170716',
                 '20170717',
                 '20170718',
                 '20170719',
                 '20170720',
                 '20170721',
                 '20170722',
                 '20170723',
                 '20170724',
                 '20170725',
                 '20170726',
                 '20170727',
                 '20170728',
                 '20170729',
                 '20170730',
                 '20170731',
                 '20170801'
            ],
            'daysformatted': [
                  'Sat 01, Jul 2017',
                  'Sun 02, Jul 2017',
                  'Mon 03, Jul 2017',
                  'Tue 04, Jul 2017',
                  'Wed 05, Jul 2017',
                  'Thu 06, Jul 2017',
                  'Fri 07, Jul 2017',
                  'Sat 08, Jul 2017',
                  'Sun 09, Jul 2017',
                  'Mon 10, Jul 2017',
                  'Tue 11, Jul 2017',
                  'Wed 12, Jul 2017',
                  'Thu 13, Jul 2017',
                  'Fri 14, Jul 2017',
                  'Sat 15, Jul 2017',
                  'Sun 16, Jul 2017',
                  'Mon 17, Jul 2017',
                  'Tue 18, Jul 2017',
                  'Wed 19, Jul 2017',
                  'Thu 20, Jul 2017',
                  'Fri 21, Jul 2017',
                  'Sat 22, Jul 2017',
                  'Sun 23, Jul 2017',
                  'Mon 24, Jul 2017',
                  'Tue 25, Jul 2017',
                  'Wed 26, Jul 2017',
                  'Thu 27, Jul 2017',
                  'Fri 28, Jul 2017',
                  'Sat 29, Jul 2017',
                  'Sun 30, Jul 2017',
                  'Mon 31, Jul 2017',
                  'Tue 01, Aug 2017'
            ],
            'stats_table': {
                '1': {
                    '20170701': {},
                    '20170702': {
                        'new_cable_length': 10.0,
                        'new_connectors': 1,
                        'new_reviewed_nodes': 1,
                        'new_treenodes': 1,
                    },
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}
                },
                '2': {
                    '20170701': {},
                    '20170702': {},
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}
                },
                '3': {
                    '20170701': {
                        'new_cable_length': 4.0,
                        'new_connectors': 3,
                        'new_reviewed_nodes': 3,
                        'new_treenodes': 3,
                    },
                    '20170702': {},
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}},
                '4': {
                    '20170701': {},
                    '20170702': {},
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}
                },
                '5': {
                    '20170701': {},
                    '20170702': {},
                    '20170703': {},
                    '20170704': {},
                    '20170705': {},
                    '20170706': {},
                    '20170707': {},
                    '20170708': {},
                    '20170709': {},
                    '20170710': {},
                    '20170711': {},
                    '20170712': {},
                    '20170713': {},
                    '20170714': {},
                    '20170715': {},
                    '20170716': {},
                    '20170717': {},
                    '20170718': {},
                    '20170719': {},
                    '20170720': {},
                    '20170721': {},
                    '20170722': {},
                    '20170723': {},
                    '20170724': {},
                    '20170725': {},
                    '20170726': {},
                    '20170727': {},
                    '20170728': {},
                    '20170729': {},
                    '20170730': {},
                    '20170731': {},
                    '20170801': {}
                }
            }
        }

        response = self.client.get('/%d/stats/user-history' % (self.test_project_id,), {
                'start_date': '2017-07-01',
                'end_date': '2017-08-01',
                'time_zone': 'America/New_York'
            })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_stats, parsed_response)

        # Init summary tables and test again
        stats.populate_stats_summary(self.test_project_id)

        response = self.client.get('/%d/stats/user-history' % (self.test_project_id,), {
                'start_date': '2017-07-01',
                'end_date': '2017-08-01',
                'time_zone': 'America/New_York'
            })
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        self.assertEqual(expected_stats, parsed_response)

    def get_summary_table(self, cursor):
        cursor.execute("""
            SELECT
                date,
                n_connector_links,
                n_reviewed_nodes,
                n_treenodes,
                n_edited_treenodes,
                n_edited_connectors,
                n_imported_treenodes,
                n_imported_connectors,
                cable_length,
                project_id,
                user_id
            FROM catmaid_stats_summary
        """)
        return cursor.fetchall()

    def assert_empty_summary_table(self, cursor):
        summary_table = self.get_summary_table(cursor)
        self.assertEqual(len(summary_table), 0)

    def add_test_treenodes(self):
        # Skeletons with a single chain of nodes each
        # User ID, Creation time, X, Y, Z
        skeletons = [
            [[1, "2017-06-01T07:54:16.301Z", 0, 0, 0],
             [1, "2017-06-30T22:23:24.117Z", 10, 0, 0],
             [1, "2017-07-02T08:54:16.301Z", 10, 10, 0],
             [1, "2017-08-02T08:55:16.301Z", 10, 10, 10]],
            [[3, "2017-07-01T07:54:16.301Z", 1, 2, 3],
             [3, "2017-07-01T07:55:13.844Z", -1, 2, 3],
             [3, "2017-07-01T22:55:16.301Z", -1, 0, 3],
             [3, "2017-07-01T02:50:10.204Z", -1, 0, 0]],
        ]

        cursor = connection.cursor()
        classes = get_class_to_id_map(self.test_project_id, cursor=cursor)
        skeleton_class_id = classes['skeleton']
        for i, skeleton in enumerate(skeletons):
            cursor.execute("""
                INSERT INTO class_instance (project_id, class_id, name,
                    user_id, creation_time)
                SELECT %(project_id)s, %(skeleton_class_id)s, %(name)s,
                    %(user_id)s, %(creation_time)s
                RETURNING id
            """, {
                "project_id": self.test_project_id,
                "skeleton_class_id": skeleton_class_id,
                "name": "Test skeleton %s ".format(i),
                "user_id": self.test_user_id,
                "creation_time": datetime.datetime(2017, 7, 5, 16, 20, 10),
            })
            skeleton_id = cursor.fetchone()[0]
            last_node = None
            for node in skeleton:
                cursor.execute("""
                    INSERT INTO treenode (project_id, skeleton_id, parent_id,
                        location_x, location_y, location_z, user_id, editor_id,
                        creation_time)
                    SELECT %(project_id)s, %(skeleton_id)s, %(parent_id)s,
                        %(x)s, %(y)s, %(z)s, %(user_id)s, %(editor_id)s,
                        %(creation_time)s::timestamptz
                    RETURNING id
                """, {
                    'project_id': self.test_project_id,
                    'skeleton_id': skeleton_id,
                    'parent_id': last_node,
                    'x': node[2],
                    'y': node[3],
                    'z': node[4],
                    'user_id': node[0],
                    'editor_id': node[0],
                    'creation_time': node[1]
                })
                last_node = cursor.fetchone()[0]

    def add_test_imports(self):
        self.fake_authentication()
        orig_skeleton_id = 235

        # Get SWC for a neuron
        response = self.client.get('/%d/skeleton/%d/swc' % (self.test_project_id, orig_skeleton_id))
        self.assertEqual(response.status_code, 200)
        orig_swc_string = response.content.decode('utf-8')

        # Give user import permissions and Import SWC
        swc_file = StringIO(orig_swc_string)
        assign_perm('can_import', self.test_user, self.test_project)
        response = self.client.post('/%d/skeletons/import' % (self.test_project_id,),
                {'file.swc': swc_file, 'name': 'test'})

        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode('utf-8'))
        new_skeleton_id = parsed_response['skeleton_id']
        id_map = parsed_response['node_id_map']

        return parsed_response

    def _test_setup_nodecount_summary(self, time_zone, start_date_utc,
            end_date_utc, expected_stats):
        cursor = connection.cursor()

        # Remove existing treenodes to make results easier to predict
        cursor.execute("""TRUNCATE treenode CASCADE""")

        # Don't expect any connector links
        node_stats = stats.select_node_stats(cursor, self.test_project_id,
                start_date_utc, end_date_utc, time_zone)
        self.assertEqual(node_stats, [])

        # Add test reviews
        self.add_test_treenodes()

        # Expect empty summary table
        self.assert_empty_summary_table(cursor)

        # Expect correct statistics without summary tables
        node_stats = stats.select_node_stats(cursor,
                self.test_project_id, start_date_utc, end_date_utc, time_zone)
        self.assertEqual(node_stats, expected_stats)

        # Populate summary tables for two test time zones
        stats.populate_nodecount_stats_summary(self.test_project_id, cursor=cursor)
        p = self.test_project_id
        expected_summary = set([
            (datetime.datetime(2017, 6, 1, 7, 0, tzinfo=pytz.utc), 0, 0, 1, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 6, 30, 22, 0, tzinfo=pytz.utc), 0, 0, 1, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 7, 2, 8, 0, tzinfo=pytz.utc), 0, 0, 1, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 8, 2, 8, 0, tzinfo=pytz.utc), 0, 0, 1, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 7, 1, 2, 0, tzinfo=pytz.utc), 0, 0, 1, 0, 0, 0, 0, 0.0, p, 3),
            (datetime.datetime(2017, 7, 1, 7, 0, tzinfo=pytz.utc), 0, 0, 2, 0, 0, 0, 0, 0.0, p, 3),
            (datetime.datetime(2017, 7, 1, 22, 0, tzinfo=pytz.utc), 0, 0, 1, 0, 0, 0, 0, 0.0, p, 3)
        ])
        summary_table = set(self.get_summary_table(cursor))
        self.assertEqual(summary_table, expected_summary)

    def _test_setup_cable_summary(self, time_zone, start_date_utc,
            end_date_utc, expected_stats):
        cursor = connection.cursor()

        # Remove existing treenodes to make results easier to predict
        cursor.execute("""TRUNCATE treenode CASCADE""")

        # Don't expect any connector links
        cable_stats = stats.select_cable_stats(cursor, self.test_project_id,
                start_date_utc, end_date_utc, time_zone)
        self.assertEqual(cable_stats, [])

        # Add test reviews
        self.add_test_treenodes()

        # Expect empty summary table
        self.assert_empty_summary_table(cursor)

        # Expect correct statistics without summary tables
        cable_stats = stats.select_cable_stats(cursor,
                self.test_project_id, start_date_utc, end_date_utc, time_zone)
        self.assertEqual(cable_stats, expected_stats)

        # Populate summary tables for two test time zones
        stats.populate_cable_stats_summary(self.test_project_id, cursor=cursor)
        p = self.test_project_id
        expected_summary = set([
            (datetime.datetime(2017, 6, 30, 22, 0, tzinfo=pytz.utc), 0, 0, 0, 0, 0, 0, 0, 10.0, p, 1),
            (datetime.datetime(2017, 7, 2, 8, 0, tzinfo=pytz.utc), 0, 0, 0, 0, 0, 0, 0, 10.0, p, 1),
            (datetime.datetime(2017, 8, 2, 8, 0, tzinfo=pytz.utc), 0, 0, 0, 0, 0, 0, 0, 10.0, p, 1),
            (datetime.datetime(2017, 7, 1, 2, 0, tzinfo=pytz.utc), 0, 0, 0, 0, 0, 0, 0, 3.0, p, 3),
            (datetime.datetime(2017, 7, 1, 7, 0, tzinfo=pytz.utc), 0, 0, 0, 0, 0, 0, 0, 2.0, p, 3),
            (datetime.datetime(2017, 7, 1, 22, 0, tzinfo=pytz.utc), 0, 0, 0, 0, 0, 0, 0, 2.0, p, 3)
        ])
        summary_table = set(self.get_summary_table(cursor))
        self.assertEqual(summary_table, expected_summary)

    def add_test_connector_links(self):
        c_1 = Connector.objects.get(pk=2463)
        c_1.id = None
        c_1.save()
        c_2 = Connector.objects.get(pk=2466)
        c_2.id = None
        c_2.save()

        cursor = connection.cursor()
        relations = get_relation_to_id_map(self.test_project_id, cursor=cursor)
        pre_id, post_id = relations['presynaptic_to'], relations['postsynaptic_to']

        connector_links = [
            # Treenode ID, connector ID, relation_id, user ID, creation date
            [ 7,  pre_id, c_1.id, 1, "2017-06-01T07:54:16.301Z"],
            [15, post_id, c_1.id, 1, "2017-06-30T22:23:24.117Z"],
            [11,  pre_id, c_2.id, 1, "2017-07-02T08:54:16.301Z"],
            [13, post_id, c_2.id, 1, "2017-08-02T08:55:16.301Z"],
            [ 7, post_id, c_1.id, 3, "2017-07-01T07:54:16.301Z"],
            [11, post_id, c_1.id, 3, "2017-07-01T07:55:13.844Z"],
            [13,  pre_id, c_2.id, 3, "2017-07-01T22:55:16.301Z"],
            [15, post_id, c_2.id, 3, "2017-07-01T02:50:10.204Z"],
        ]
        link_data = list(chain.from_iterable(connector_links))
        link_template = ','.join('(%s,%s,%s,%s,%s)' for _ in connector_links)
        cursor.execute("""
            INSERT INTO treenode_connector (project_id, treenode_id, skeleton_id,
                relation_id, connector_id, user_id, creation_time)
            SELECT %s, link.treenode_id, t.skeleton_id, link.relation_id,
                link.connector_id, link.user_id, link.creation_time::timestamptz
            FROM treenode t
            JOIN (VALUES {}) link(treenode_id, relation_id, connector_id,
                user_id, creation_time)
            ON t.id = link.treenode_id
        """.format(link_template), [self.test_project_id] + link_data)

    def _test_setup_connector_summary(self, time_zone, start_date_utc,
            end_date_utc, expected_stats):
        cursor = connection.cursor()

        # Remove connector links from fixture
        cursor.execute("""TRUNCATE treenode_connector""")

        # Don't expect any connector links
        review_stats = stats.select_review_stats(cursor, self.test_project_id,
                start_date_utc, end_date_utc, time_zone)
        self.assertEqual(review_stats, [])

        # Add test reviews
        self.add_test_connector_links()

        # Expect empty summary table
        self.assert_empty_summary_table(cursor)

        # Expect correct statistics without summary tables
        connector_stats = stats.select_connector_stats(cursor,
                self.test_project_id, start_date_utc, end_date_utc, time_zone)
        self.assertEqual(connector_stats, expected_stats)

        # Populate summary tables for two test time zones
        stats.populate_connector_stats_summary(self.test_project_id, cursor=cursor)
        p = self.test_project_id
        expected_summary = set([
            (datetime.datetime(2017, 6, 30, 22, 0, tzinfo=pytz.utc), 1, 0, 0, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 7, 2, 8, 0, tzinfo=pytz.utc), 1, 0, 0, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 8, 2, 8, 0, tzinfo=pytz.utc), 2, 0, 0, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 7, 1, 7, 0, tzinfo=pytz.utc), 2, 0, 0, 0, 0, 0, 0, 0.0, p, 3),
            (datetime.datetime(2017, 7, 1, 22, 0, tzinfo=pytz.utc), 1, 0, 0, 0, 0, 0, 0, 0.0, p, 3),
        ])
        summary_table = set(self.get_summary_table(cursor))
        self.assertEqual(summary_table, expected_summary)

    def add_test_reviews(self):
        reviews = [
            # Treenode ID, user ID, review date
            [ 7, 1, "2017-06-01T07:54:16.301Z"],
            [15, 1, "2017-06-30T22:23:24.117Z"],
            [11, 1, "2017-07-02T08:54:16.301Z"],
            [13, 1, "2017-08-02T08:55:16.301Z"],
            [ 7, 3, "2017-07-01T07:54:16.301Z"],
            [11, 3, "2017-07-01T07:55:13.844Z"],
            [13, 3, "2017-07-01T22:55:16.301Z"],
            [15, 3, "2017-07-01T02:50:10.204Z"],
        ]
        node_data = list(chain.from_iterable(reviews))
        node_template = ','.join('(%s,%s,%s)' for _ in reviews)
        cursor = connection.cursor()
        cursor.execute("""
            INSERT INTO review (project_id, reviewer_id, review_time,
                 skeleton_id, treenode_id)
            SELECT %s, node.reviewer_id, node.review_time::timestamptz,
                t.skeleton_id, t.id
            FROM treenode t
            JOIN (VALUES {}) node(treenode_id, reviewer_id, review_time)
            ON t.id = node.treenode_id
        """.format(node_template), [self.test_project_id] + node_data)

    def _test_setup_review_summary(self, time_zone, start_date_utc,
            end_date_utc, expected_stats):
        # Don't expect any reviews
        cursor = connection.cursor()
        review_stats = stats.select_review_stats(cursor, self.test_project_id,
                start_date_utc, end_date_utc, time_zone)
        self.assertEqual(review_stats, [])

        # Add test reviews
        self.add_test_reviews()

        # Expect empty summary table
        self.assert_empty_summary_table(cursor)

        # Expect correct statistics without summary tables
        review_stats = stats.select_review_stats(cursor, self.test_project_id,
                start_date_utc, end_date_utc, time_zone)
        self.assertEqual(review_stats, expected_stats)

        # Populate summary tables for two test time zones
        stats.populate_review_stats_summary(self.test_project_id, cursor=cursor)
        p = self.test_project_id
        expected_summary = set([
            (datetime.datetime(2017, 6, 1, 7, 0, tzinfo=pytz.utc), 0, 1, 0, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 6, 30, 22, 0, tzinfo=pytz.utc), 0, 1, 0, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 7, 2, 8, 0, tzinfo=pytz.utc), 0, 1, 0, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 8, 2, 8, 0, tzinfo=pytz.utc), 0, 1, 0, 0, 0, 0, 0, 0.0, p, 1),
            (datetime.datetime(2017, 7, 1, 2, 0, tzinfo=pytz.utc), 0, 1, 0, 0, 0, 0, 0, 0.0, p, 3),
            (datetime.datetime(2017, 7, 1, 7, 0, tzinfo=pytz.utc), 0, 2, 0, 0, 0, 0, 0, 0.0, p, 3),
            (datetime.datetime(2017, 7, 1, 22, 0, tzinfo=pytz.utc), 0, 1, 0, 0, 0, 0, 0, 0.0, p, 3),
        ])
        summary_table = set(self.get_summary_table(cursor))
        self.assertEqual(summary_table, expected_summary)

    def test_review_stats_summary_population_no_tz_offset(self):
        time_zone = pytz.timezone('UTC')
        start_date_utc = time_zone.localize(datetime.datetime(2017, 7, 1, 0, 0))
        end_date_utc = time_zone.localize(datetime.datetime(2017, 8, 1, 0, 0))
        expected_stats = [
            (1, datetime.datetime(2017, 7, 2, 0, 0), 1),
            (3, datetime.datetime(2017, 7, 1, 0, 0), 4)
        ]

        self._test_setup_review_summary(time_zone, start_date_utc,
                end_date_utc, expected_stats)

        cursor = connection.cursor()
        # Expect correct statistics with summary tables with matching time zone
        review_stats = stats.select_review_stats(cursor, self.test_project_id,
                start_date_utc, end_date_utc, time_zone)
        self.assertEqual(review_stats, expected_stats)

    def test_review_stats_summary_population_with_tz_offset(self):
        time_zone = pytz.timezone('America/New_York')
        start_date_local = time_zone.localize(datetime.datetime(2017, 7, 1, 0, 0))
        end_date_local = time_zone.localize(datetime.datetime(2017, 8, 1, 0, 0))
        start_date_utc = start_date_local.astimezone(pytz.utc)
        end_date_utc = end_date_local.astimezone(pytz.utc)
        expected_stats = [
            (1, datetime.datetime(2017, 7, 2, 0, 0), 1),
            (3, datetime.datetime(2017, 7, 1, 0, 0), 3)
        ]
        self._test_setup_review_summary(time_zone, start_date_utc, end_date_utc,
                expected_stats)
        cursor = connection.cursor()

        # Expect correct statistics with summary tables with matching time zone
        review_stats = stats.select_review_stats(cursor, self.test_project_id,
                start_date_utc, end_date_utc, time_zone)
        self.assertEqual(review_stats, expected_stats)

    def test_connector_stats_summary_population_no_tz_offset(self):
        time_zone = pytz.timezone('UTC')
        start_date_utc = time_zone.localize(datetime.datetime(2017, 7, 1, 0, 0))
        end_date_utc = time_zone.localize(datetime.datetime(2017, 8, 1, 0, 0))
        expected_stats = [
            (1, datetime.datetime(2017, 7, 2, 0, 0), 1),
            (3, datetime.datetime(2017, 7, 1, 0, 0), 3)
        ]

        self._test_setup_connector_summary(time_zone, start_date_utc,
                end_date_utc, expected_stats)

        cursor = connection.cursor()
        # Expect correct statistics with summary tables with matching time zone
        connector_stats = stats.select_connector_stats(cursor,
                self.test_project_id, start_date_utc, end_date_utc, time_zone)
        self.assertEqual(connector_stats, expected_stats)

    def test_connector_stats_summary_population_with_tz_offset(self):
        time_zone = pytz.timezone('America/New_York')
        start_date_local = time_zone.localize(datetime.datetime(2017, 7, 1, 0, 0))
        end_date_local = time_zone.localize(datetime.datetime(2017, 8, 1, 0, 0))
        start_date_utc = start_date_local.astimezone(pytz.utc)
        end_date_utc = end_date_local.astimezone(pytz.utc)
        expected_stats = [
            (1, datetime.datetime(2017, 7, 2, 0, 0), 1),
            (3, datetime.datetime(2017, 7, 1, 0, 0), 3)
        ]
        self._test_setup_connector_summary(time_zone, start_date_utc,
                end_date_utc, expected_stats)
        cursor = connection.cursor()

        # Expect correct statistics with summary tables with matching time zone
        connector_stats = stats.select_connector_stats(cursor,
                self.test_project_id, start_date_utc, end_date_utc, time_zone)
        self.assertEqual(connector_stats, expected_stats)

    def test_cable_stats_summary_population_no_tz_offset(self):
        time_zone = pytz.timezone('UTC')
        start_date_utc = time_zone.localize(datetime.datetime(2017, 7, 1, 0, 0))
        end_date_utc = time_zone.localize(datetime.datetime(2017, 8, 1, 0, 0))
        expected_stats = [
            (1, datetime.datetime(2017, 7, 2, 0, 0), 10.0),
            (3, datetime.datetime(2017, 7, 1, 0, 0), 7.0)
        ]

        self._test_setup_cable_summary(time_zone, start_date_utc,
                end_date_utc, expected_stats)

        cursor = connection.cursor()
        # Expect correct statistics with summary tables with matching time zone
        cable_stats = stats.select_cable_stats(cursor,
                self.test_project_id, start_date_utc, end_date_utc, time_zone)
        self.assertEqual(cable_stats, expected_stats)

    def test_cable_stats_summary_population_with_tz_offset(self):
        time_zone = pytz.timezone('America/New_York')
        start_date_local = time_zone.localize(datetime.datetime(2017, 7, 1, 0, 0))
        end_date_local = time_zone.localize(datetime.datetime(2017, 8, 1, 0, 0))
        start_date_utc = start_date_local.astimezone(pytz.utc)
        end_date_utc = end_date_local.astimezone(pytz.utc)
        expected_stats = [
            (1, datetime.datetime(2017, 7, 2, 0, 0), 10.0),
            (3, datetime.datetime(2017, 7, 1, 0, 0), 4.0)
        ]
        self._test_setup_cable_summary(time_zone, start_date_utc,
                end_date_utc, expected_stats)
        cursor = connection.cursor()

        # Expect correct statistics with summary tables with matching time zone
        cable_stats = stats.select_cable_stats(cursor,
                self.test_project_id, start_date_utc, end_date_utc, time_zone)
        self.assertEqual(cable_stats, expected_stats)

    def test_nodecount_stats_summary_population_no_tz_offset(self):
        time_zone = pytz.timezone('UTC')
        start_date_utc = time_zone.localize(datetime.datetime(2017, 7, 1, 0, 0))
        end_date_utc = time_zone.localize(datetime.datetime(2017, 8, 1, 0, 0))
        expected_stats = [
            (1, datetime.datetime(2017, 7, 2, 0, 0), 1),
            (3, datetime.datetime(2017, 7, 1, 0, 0), 4)
        ]

        self._test_setup_nodecount_summary(time_zone, start_date_utc,
                end_date_utc, expected_stats)

        cursor = connection.cursor()
        # Expect correct statistics with summary tables with matching time zone
        cable_stats = stats.select_node_stats(cursor,
                self.test_project_id, start_date_utc, end_date_utc, time_zone)
        self.assertEqual(cable_stats, expected_stats)

    def test_nodecount_stats_summary_population_with_tz_offset(self):
        time_zone = pytz.timezone('America/New_York')
        start_date_local = time_zone.localize(datetime.datetime(2017, 7, 1, 0, 0))
        end_date_local = time_zone.localize(datetime.datetime(2017, 8, 1, 0, 0))
        start_date_utc = start_date_local.astimezone(pytz.utc)
        end_date_utc = end_date_local.astimezone(pytz.utc)
        expected_stats = [
            (1, datetime.datetime(2017, 7, 2, 0, 0), 1),
            (3, datetime.datetime(2017, 7, 1, 0, 0), 3)
        ]
        self._test_setup_nodecount_summary(time_zone, start_date_utc,
                end_date_utc, expected_stats)
        cursor = connection.cursor()

        # Expect correct statistics with summary tables with matching time zone
        node_stats = stats.select_node_stats(cursor,
                self.test_project_id, start_date_utc, end_date_utc, time_zone)
        self.assertEqual(node_stats, expected_stats)
