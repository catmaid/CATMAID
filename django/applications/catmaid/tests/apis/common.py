# -*- coding: utf-8 -*-

from django.db import connection
from django.shortcuts import get_object_or_404
from django.test import TestCase
from django.test.client import Client
from guardian.shortcuts import assign_perm
from guardian.management import create_anonymous_user

from catmaid.models import Project, Treenode, User
from catmaid.tests.common import init_consistent_data


class CatmaidApiTestCase(TestCase):
    fixtures = ['catmaid_testdata']

    maxDiff = None

    @classmethod
    def setUpTestData(cls):
        init_consistent_data()
        # Set up data for the whole TestCase
        cls.test_project_id = 3
        cls.test_user_id = 3
        cls.test_project = Project.objects.get(pk=cls.test_project_id)
        cls.test_user = User.objects.get(pk=cls.test_user_id)

        cursor = connection.cursor()
        # Make sure all counters are set correctly
        cursor.execute("""
            SELECT setval('concept_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM concept;
        """)
        cursor.execute("""
            SELECT setval('location_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM location;
        """)

        create_anonymous_user(object())

        # Assign the new user permissions to browse and annotate projects
        assign_perm('can_browse', cls.test_user, cls.test_project)
        assign_perm('can_annotate', cls.test_user, cls.test_project)


    def setUp(self):
        """ Creates a new test client and test user. The user is assigned
        permissions to modify an existing test project.
        """
        self.client = Client()


    def fake_authentication(self, username='test2', password='test', add_default_permissions=False):
        self.client.login(username=username, password=password)

        if add_default_permissions:
            p = Project.objects.get(pk=self.test_project_id)
            user = User.objects.get(username=username)
            # Assign the new user permissions to browse and annotate projects
            assign_perm('can_browse', user, p)
            assign_perm('can_annotate', user, p)


    def assertTreenodeHasProperties(self, treenode_id, parent_id, skeleton_id):
        treenode = get_object_or_404(Treenode, id=treenode_id)
        self.assertEqual(parent_id, treenode.parent_id)
        self.assertEqual(skeleton_id, treenode.skeleton_id)
