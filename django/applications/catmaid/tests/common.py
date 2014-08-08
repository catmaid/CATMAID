from django.test import TestCase
from django.test.client import Client
from catmaid.models import User


class CatmaidTestCase(TestCase):
    fixtures = ['catmaid_testdata']

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user('temporary',
                'temporary@my.mail', 'temporary')
        self.test_project_id = 3

    def fake_authentication(self):
        self.client.login(username='temporary', password='temporary')
