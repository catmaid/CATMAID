# -*- coding: utf-8 -*-

from django.db import connection
from django.test import TestCase
from django.test.client import Client
from catmaid.apps import get_system_user
from catmaid.models import Project, User
from catmaid.control.project import validate_project_setup


def init_consistent_data():
    """Reset sequence counters and make sure all existing projects have all
    needed classes and relations.
    """
    cursor = connection.cursor()
    # Make sure all counters are set correctly
    cursor.execute("""
        SELECT setval('concept_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM concept;
    """)
    cursor.execute("""
        SELECT setval('location_id_seq', coalesce(max("id"), 1), max("id") IS NOT null) FROM location;
    """)

    user = get_system_user()
    for p in Project.objects.all():
        validate_project_setup(p.id, user.id, True)


class CatmaidTestCase(TestCase):
    fixtures = ['catmaid_testdata']

    maxDiff = None

    @classmethod
    def setUpTestData(cls):
        init_consistent_data()
        # Set up data for the whole TestCase
        cls.test_project_id = 3
        cls.user = User.objects.create_user('temporary',
                'temporary@my.mail', 'temporary')

    def setUp(self):
        self.client = Client()

    def fake_authentication(self):
        self.client.login(username='temporary', password='temporary')
