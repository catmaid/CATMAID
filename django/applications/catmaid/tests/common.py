# -*- coding: utf-8 -*-
import textwrap
from abc import ABC

from django.db import connection
from django.test import TestCase
from django.test.client import Client
from catmaid.apps import get_system_user
from catmaid.models import Project, User
from catmaid.control.project import validate_project_setup
import guardian.management


def create_anonymous_user():
    """Create a new anonymous user, if not yet available.
    """
    # Create anonnymous user with default database configuration.
    return guardian.management.create_anonymous_user(object(), using='default')


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


class AssertStatusMixin(ABC):

    def assertStatus(self, response, code=200):
        if code == response.status_code:
            return

        msg = f"Expected status {code}, got {response.status_code}"
        if response.status_code != 200 and response["Content-Type"] == "application/json":
            data = response.json()
            msg += f" (server raised {data['type']})\n"
            msg += textwrap.indent(data["detail"].rstrip(), " " * 4)
        else:
            msg += ". Response contained:\n"
            msg += repr(response.content)

        self.assertEqual(response.status_code, code, msg)


class CatmaidTestCase(TestCase, AssertStatusMixin):
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
