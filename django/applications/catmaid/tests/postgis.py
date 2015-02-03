from django.test import TestCase
from django.test.client import Client
from guardian.shortcuts import assign_perm
from catmaid.models import Project, User
from catmaid.control import node

import json

class PostGISTests(TestCase):
    """
    Test PostGIS related functionality. It expects the 'postgis' extension to
    be available in the test database. At the moment, it seems, the easiest way
    to have this, is to create a Postgres template called 'template_postgis'
    which has this extension enabled:
    https://docs.djangoproject.com/en/dev/ref/contrib/gis/install/postgis/#creating-a-spatial-database-template-for-earlier-versions
    """
    fixtures = ['catmaid_testdata']

    def setUp(self):
        self.username = "test2"
        self.password = "test"
        self.user = User.objects.get(username=self.username)
        self.test_project_id = 3

        self.client = Client()
        self.client.login(username=self.username, password=self.password)

        # Make sure the test user has permissions to browse and annotate
        # projects
        p = Project.objects.get(pk=self.test_project_id)
        assign_perm('can_browse', self.user, p)
        assign_perm('can_annotate', self.user, p)

    def test_node_query(self):
        """
        Make sure nodes returned by a PostGIS based query are the same as the
        regular ones.
        """
        atnid = -1
        params = {
            'sid': 3,
            'limit': 5000,
            'project_id': self.test_project_id,
            'z1': 0,
            'z2': 9,
            'top': 4625.0,
            'left': 2860.0,
            'bottom': 8075.0,
            'right': 10860.0,
            'labels': False,
        }

        non_postgis_nodes_r = node.node_list_tuples_query(self.user, params,
                self.test_project_id, atnid, includeLabels=False,
                tn_provider=node.get_treenodes_classic)

        postgis_nodes_r = node.node_list_tuples_query(self.user, params,
                self.test_project_id, atnid, includeLabels=False,
                tn_provider=node.get_treenodes_postgis)

        self.assertEqual(non_postgis_nodes_r.status_code, 200)
        self.assertEqual(postgis_nodes_r.status_code, 200)
        non_postgis_nodes = json.loads(non_postgis_nodes_r.content)
        postgis_nodes = json.loads(postgis_nodes_r.content)

        self.assertEqual(len(non_postgis_nodes), len(postgis_nodes))
        self.assertEqual(len(non_postgis_nodes[0]), len(postgis_nodes[0]))
        self.assertEqual(len(non_postgis_nodes[1]), len(postgis_nodes[1]))
        self.assertEqual(len(non_postgis_nodes[2]), len(postgis_nodes[2]))
        self.assertEqual(non_postgis_nodes[3], postgis_nodes[3])

        for tn in non_postgis_nodes[0]:
            self.assertTrue(tn in postgis_nodes[0])

        for tn in postgis_nodes[0]:
            self.assertTrue(tn in non_postgis_nodes[0])

        for c in non_postgis_nodes[1]:
            self.assertTrue(c in postgis_nodes[1])

        for c in postgis_nodes[1]:
            self.assertTrue(c in non_postgis_nodes[1])
